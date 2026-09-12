import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const mintSource = await readFile(
  new URL('../cumzillaraptors/mint/index.html', import.meta.url),
  'utf8',
);
const walletSource = await readFile(
  new URL('../cumzillaraptors/client/wallet.js', import.meta.url),
  'utf8',
);

test('mint gets a confirmed blockhash immediately before wallet approval', () => {
  assert.match(mintSource, /getLatestBlockhash\(['"]confirmed['"]\)/);
  assert.doesNotMatch(mintSource, /getLatestBlockhash\(['"]finalized['"]\)/);
});

test('desktop and mobile both keep signed bytes for page-side submission', () => {
  // Uniform sign-only avoids wallet-owned delivery that the page cannot rescue.
  // The transaction still uses a short-lived recent blockhash, never a durable
  // authorization, and preflight rejects an approval that expires in the wallet.
  assert.match(mintSource, /sendWithRetry\(tx, 3, signingBlockhash, true\)/);
  assert.match(mintSource, /preferSignOnly,/);
  // multi-line call: assert the option and the money-safety hook, not one line
  // skipPreflight is now FALSE by design: verified on live devnet that
  // skipPreflight:true makes the RPC silently accept an expired-blockhash tx,
  // which is exactly how the "signed but nothing happened" timeout arose.
  assert.match(mintSource, /await wc\.signAndSend\(tx, \{[\s\S]{0,600}?skipPreflight: false/);
  assert.match(mintSource, /onSigned: \(s, raw\) =>/,
    'the page must record the signature AND the raw bytes before submission');
  assert.match(mintSource, /signedRawTx = raw/,
    'the raw signed bytes must be kept so the page can rebroadcast');
  assert.match(walletSource, /maxRetries: options\.maxRetries != null \? options\.maxRetries : 5/,
    'submission must ask the RPC node to rebroadcast');
  assert.match(walletSource, /const canSignOnly = typeof provider\.signTransaction === "function";/);
  assert.match(walletSource, /options\.preferSignOnly !== false && canSignOnly/);
  assert.match(walletSource, /if \(signOnly && canSignOnly\)/);
  assert.match(walletSource, /skipPreflight: options\.skipPreflight === true/);
  // the sign-only branch must precede the wallet-broadcast convenience API,
  // otherwise the wallet would broadcast first and the fix would be dead code
  const signOnlyIdx = walletSource.indexOf('if (signOnly && canSignOnly)');
  const convenienceIdx = walletSource.indexOf('typeof provider.signAndSendTransaction === "function"');
  assert.ok(signOnlyIdx > 0 && convenienceIdx > signOnlyIdx,
    'sign-only branch must precede the wallet-broadcast convenience API');
});

test('desktop AND mobile both submit via the page RPC (runtime)', async () => {
  // Behavioural check: source assertions cannot prove which branch a real
  // desktop vs mobile user takes.
  const { createWalletConnector } = await import('../cumzillaraptors/client/wallet.js');
  const realNavigator = globalThis.navigator;
  const realWindow = globalThis.window;
  const results = {};

  for (const [label, ua] of [
    ['desktop', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/126'],
    ['mobile', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Phantom'],
  ]) {
    Object.defineProperty(globalThis, 'navigator', {
      value: { userAgent: ua }, configurable: true, writable: true,
    });
    const calls = [];
    const FAKE_PUBKEY = '11111111111111111111111111111112';
    const fakeProvider = {
      isPhantom: true,
      publicKey: FAKE_PUBKEY,
      connect: async () => ({ publicKey: FAKE_PUBKEY }),
      signAndSendTransaction: async () => { calls.push('walletBroadcast'); return 'SIG_WALLET'; },
      signTransaction: async () => { calls.push('signOnly'); return { serialize: () => Buffer.from([1]) }; },
    };
    globalThis.window = { phantom: { solana: fakeProvider }, addEventListener() {} };
    const wc = createWalletConnector({ rpcUrl: 'https://example.invalid' });
    await wc.connect();
    try {
      await wc.signAndSend({ recentBlockhash: 'x', serialize: () => Buffer.from([1]) },
        { skipPreflight: true });
    } catch { /* sendRawTransaction hits the invalid RPC — branch already recorded */ }
    results[label] = calls[0];
  }

  Object.defineProperty(globalThis, 'navigator', {
    value: realNavigator, configurable: true, writable: true,
  });
  globalThis.window = realWindow;
  assert.equal(results.desktop, 'signOnly', 'desktop must sign and let the page submit');
  assert.equal(results.mobile, 'signOnly', 'mobile must sign and let the page submit');
});

test('a caller can still opt out of sign-only', async () => {
  const { createWalletConnector } = await import('../cumzillaraptors/client/wallet.js');
  const realWindow = globalThis.window;
  const calls = [];
  const FAKE_PUBKEY = '11111111111111111111111111111112';
  const fakeProvider = {
    isPhantom: true,
    publicKey: FAKE_PUBKEY,
    connect: async () => ({ publicKey: FAKE_PUBKEY }),
    signAndSendTransaction: async () => { calls.push('walletBroadcast'); return 'SIG_WALLET'; },
    signTransaction: async () => { calls.push('signOnly'); return { serialize: () => Buffer.from([1]) }; },
  };
  globalThis.window = { phantom: { solana: fakeProvider }, addEventListener() {} };
  const wc = createWalletConnector({ rpcUrl: 'https://example.invalid' });
  await wc.connect();
  const sig = await wc.signAndSend({ recentBlockhash: 'x' }, { preferSignOnly: false });
  globalThis.window = realWindow;
  assert.equal(calls[0], 'walletBroadcast');
  assert.equal(sig, 'SIG_WALLET');
});

test('wallet-standard signTransaction keeps signed bytes and page-submits', async () => {
  const { createWalletConnector } = await import('../cumzillaraptors/client/wallet.js');
  const web3 = await import('@solana/web3.js');
  const realWindow = globalThis.window;
  const realNavigator = globalThis.navigator;
  const realSend = web3.Connection.prototype.sendRawTransaction;
  const payer = web3.Keypair.generate();
  const tx = new web3.Transaction({
    feePayer: payer.publicKey,
    recentBlockhash: 'GHtXQBsoZHVnNFa9YevAzFr17DJjgHXk3ycTKD5xD3Zi',
  }).add(web3.SystemProgram.transfer({
    fromPubkey: payer.publicKey,
    toPubkey: web3.Keypair.generate().publicKey,
    lamports: 1,
  }));
  const account = { address: payer.publicKey.toBase58(), features: ['solana:signTransaction'] };
  const calls = [];
  const standardWallet = {
    name: 'Standard Test Wallet',
    features: {
      'standard:connect': { connect: async () => ({ accounts: [account] }) },
      'solana:signTransaction': {
        signTransaction: async (input) => {
          calls.push({ kind: 'sign', input });
          const signed = web3.Transaction.from(input.transaction);
          signed.partialSign(payer);
          return [{ signedTransaction: signed.serialize() }];
        },
      },
      'solana:signAndSendTransaction': {
        signAndSendTransaction: async () => { calls.push({ kind: 'walletBroadcast' }); },
      },
    },
  };
  Object.defineProperty(globalThis, 'navigator', {
    value: { getWallets: () => [standardWallet], userAgent: 'Desktop' },
    configurable: true, writable: true,
  });
  globalThis.window = { addEventListener() {} };
  web3.Connection.prototype.sendRawTransaction = async (raw, options) => {
    calls.push({ kind: 'pageSubmit', raw, options });
    return 'STANDARD_SIG';
  };
  try {
    const wc = createWalletConnector({ rpcUrl: 'https://example.invalid', network: 'mainnet' });
    await wc.connect();
    let signedEvidence = null;
    const sig = await wc.signAndSend(tx, {
      preferSignOnly: true,
      skipPreflight: false,
      onSigned: (signedSig, raw) => { signedEvidence = { signedSig, raw }; },
    });
    assert.equal(sig, 'STANDARD_SIG');
    assert.deepEqual(calls.map((c) => c.kind), ['sign', 'pageSubmit']);
    assert.equal(calls[0].input.chain, 'solana:mainnet');
    assert.ok(signedEvidence?.signedSig, 'signature must be reported before page submission');
    assert.ok(signedEvidence?.raw?.length, 'raw signed bytes must be retained for rebroadcast');
  } finally {
    web3.Connection.prototype.sendRawTransaction = realSend;
    Object.defineProperty(globalThis, 'navigator', {
      value: realNavigator, configurable: true, writable: true,
    });
    globalThis.window = realWindow;
  }
});

test('mint checks transaction history before reporting a confirmation timeout', () => {
  assert.match(mintSource, /getSignatureStatuses\(\[sig\],\s*\{[\s\S]*searchTransactionHistory:\s*true/);
  assert.match(mintSource, /confirmationStatus === ['"]confirmed['"]/);
  assert.match(mintSource, /confirmationStatus === ['"]finalized['"]/);
});
