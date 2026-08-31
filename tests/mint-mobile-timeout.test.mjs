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

test('the page submits the signed tx itself, so one cluster is used throughout', () => {
  // 2026-08-30 (desktop report): letting the WALLET broadcast means a Phantom
  // extension set to the wrong network lands the tx where the page's RPC cannot
  // see it — the page then waits on a signature that will never appear there and
  // reports a bogus "transaction timed out". Signing works on any network, so the
  // page signs and submits through its own RPC. Assert semantics, not spelling.
  assert.doesNotMatch(mintSource, /preferSignOnly/);
  // multi-line call: assert the option and the money-safety hook, not one line
  assert.match(mintSource, /await wc\.signAndSend\(tx, \{[\s\S]{0,400}?skipPreflight: true/);
  assert.match(mintSource, /onSigned: \(s\) =>/,
    'the page must record the signature before submission');
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

test('mint checks transaction history before reporting a confirmation timeout', () => {
  assert.match(mintSource, /getSignatureStatuses\(\[sig\],\s*\{[\s\S]*searchTransactionHistory:\s*true/);
  assert.match(mintSource, /confirmationStatus === ['"]confirmed['"]/);
  assert.match(mintSource, /confirmationStatus === ['"]finalized['"]/);
});
