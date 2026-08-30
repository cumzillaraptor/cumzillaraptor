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

test('mint uses the wallet send path, not forced sign-only', () => {
  // Reverted deliberately (review 2026-08-29, H1): forcing preferSignOnly on the
  // desktop Phantom extension replaced its prompt signAndSendTransaction with
  // sign + manual re-preflight, which surfaced as fake approval timeouts.
  // Durability for expiry-sensitive flows is handled by the claim page's durable
  // nonce, not by overriding the send path here.
  //
  // 2026-08-30: the mint page must still not FORCE sign-only, but wallet.js now
  // also selects sign-only on MOBILE in-app browsers, whose own network setting
  // can broadcast to a cluster the page cannot see. Assert the SEMANTICS (an
  // opt-in flag plus the mobile condition gate the sign-only branch, and the
  // desktop convenience API is still reachable) rather than one literal spelling.
  assert.doesNotMatch(mintSource, /preferSignOnly/);
  assert.match(mintSource, /const sig = await wc\.signAndSend\(tx, \{ skipPreflight: true \}\);/);
  assert.match(walletSource, /options\.preferSignOnly/);
  assert.match(walletSource, /isMobileWalletBrowser\(\)/);
  assert.match(walletSource, /if \(signOnly && typeof provider\.signTransaction === "function"\)/);
  assert.match(walletSource, /skipPreflight: options\.skipPreflight === true/);
  // the desktop path (wallet broadcasts) must remain, and must come AFTER the
  // sign-only branch so mobile is intercepted first
  const signOnlyIdx = walletSource.indexOf('if (signOnly &&');
  const convenienceIdx = walletSource.indexOf('typeof provider.signAndSendTransaction === "function"');
  assert.ok(signOnlyIdx > 0 && convenienceIdx > signOnlyIdx,
    'sign-only branch must precede the wallet-broadcast convenience API');
});

test('desktop keeps wallet broadcast; mobile signs only (runtime)', async () => {
  // Behavioural check: the source assertions above cannot prove which branch a
  // real desktop vs mobile user actually takes.
  const { createWalletConnector } = await import('../cumzillaraptors/client/wallet.js');
  const realNavigator = globalThis.navigator;
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
      signTransaction: async (t) => { calls.push('signOnly'); return { serialize: () => Buffer.from([1]) }; },
    };
    globalThis.window = { phantom: { solana: fakeProvider }, addEventListener() {} };
    const wc = createWalletConnector({ rpcUrl: 'https://example.invalid' });
    await wc.connect();
    // stub the page-side RPC submission used by the sign-only branch
    wc.__testConn = true;
    try {
      await wc.signAndSend({ recentBlockhash: 'x', serialize: () => Buffer.from([1]) },
        { skipPreflight: true });
    } catch { /* sendRawTransaction hits the invalid RPC — branch already recorded */ }
    results[label] = calls[0];
  }

  Object.defineProperty(globalThis, 'navigator', {
    value: realNavigator, configurable: true, writable: true,
  });
  assert.equal(results.desktop, 'walletBroadcast', 'desktop must let the wallet broadcast');
  assert.equal(results.mobile, 'signOnly', 'mobile must sign only and submit via the page RPC');
});

test('mint checks transaction history before reporting a confirmation timeout', () => {
  assert.match(mintSource, /getSignatureStatuses\(\[sig\],\s*\{[\s\S]*searchTransactionHistory:\s*true/);
  assert.match(mintSource, /confirmationStatus === ['"]confirmed['"]/);
  assert.match(mintSource, /confirmationStatus === ['"]finalized['"]/);
});
