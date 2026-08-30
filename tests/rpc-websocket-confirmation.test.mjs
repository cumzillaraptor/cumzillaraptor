// Confirmation must never depend on a live RPC WebSocket.
//
// Production bug (2026-08-30): worker.js answered the wss:// upgrade on
// rpc.cumzillaraptor.com with 405, so @solana/web3.js's onSignature
// subscription never fired. confirmTransaction() then only settled when the
// blockhash expired (~60-90s after the user already paid), and for a
// durable-nonce claim tx — which cannot expire — it could hang indefinitely.
//
// Two defences are tested here:
//   1. worker.js forwards the WebSocket upgrade to Helius (the real fix)
//   2. confirmSignatureFast/pollSignatureStatus race an HTTP status poll, so a
//      dead socket can never stall the UI again (defence in depth)
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import * as sha3mod from 'js-sha3';
const sha3 = sha3mod.keccak256 ? sha3mod : sha3mod.default;
globalThis.window = globalThis.window || { keccak256: sha3.keccak256 };

const {
  confirmSignatureFast,
  pollSignatureStatus,
  meetsCommitment,
} = await import('../cumzillaraptors/client/chain.js');

const worker = readFileSync('worker.js', 'utf8');
const mintSrc = readFileSync('cumzillaraptors/mint/index.html', 'utf8');
const claimSrc = readFileSync('cumzillaraptors/claim/index.html', 'utf8');

const SIG = 'TESTSIG' + 'x'.repeat(80);

// A connection whose WebSocket path never resolves — exactly the dead-socket case.
function hangingWs(statuses) {
  let call = 0;
  return {
    calls: () => call,
    confirmTransaction: () => new Promise(() => {}),
    getSignatureStatuses: async () => ({ value: [statuses[Math.min(call++, statuses.length - 1)]] }),
  };
}

// ---------- 1. worker.js WebSocket passthrough ----------

test('worker.js handles the WebSocket upgrade before the POST-only guard', () => {
  const upgradeAt = worker.indexOf('=== "websocket"');
  const postGuard = worker.indexOf('POST only (JSON-RPC)');
  assert.ok(upgradeAt > -1, 'worker must detect an Upgrade: websocket request');
  assert.ok(postGuard > -1);
  assert.ok(upgradeAt < postGuard,
    'the upgrade must be handled BEFORE the 405 POST-only guard, or subscriptions break');
});

test('worker.js proxies the socket to the Helius WS host with the key server-side', () => {
  assert.match(worker, /wss:\/\/devnet\.helius-rpc\.com/);
  assert.match(worker, /HELIUS_WS_HOSTS/);
  const fn = worker.slice(worker.indexOf('async function handleRpcWebSocket'));
  assert.match(fn, /api-key=" \+ encodeURIComponent\(apiKey\)/, 'key is attached server-side');
  assert.match(fn, /status: 101/, 'must return the 101 upgrade response');
  assert.match(fn, /webSocket: upstream\.webSocket/, 'must pipe the upstream socket');
  // the key must never be echoed to the client
  assert.doesNotMatch(fn, /headers\.set\(["']Sec-WebSocket-Accept["'],\s*apiKey/);
});

test('worker.js fails closed when the key is missing or upstream refuses', () => {
  const fn = worker.slice(worker.indexOf('async function handleRpcWebSocket'));
  assert.match(fn, /missing HELIUS_API_KEY/);
  assert.match(fn, /status: 503/);
  assert.match(fn, /upstream refused/);
  assert.match(fn, /status: 502/);
});

test('worker.js does not forward Origin or Cookie on the handshake', () => {
  const fn = worker.slice(worker.indexOf('async function handleRpcWebSocket'));
  const forwarded = [...fn.matchAll(/"(Sec-WebSocket-[\w-]+)"/g)].map((m) => m[1]);
  assert.ok(forwarded.includes('Sec-WebSocket-Key'));
  assert.ok(forwarded.includes('Sec-WebSocket-Version'));
  assert.doesNotMatch(fn, /["']Cookie["']/i);
  assert.doesNotMatch(fn, /["']Origin["']/i);
});

// ---------- 2. confirmation resolves without a working socket ----------

test('a dead WebSocket no longer stalls confirmation', async () => {
  const conn = hangingWs([null, { err: null, confirmationStatus: 'confirmed' }]);
  const started = Date.now();
  const res = await confirmSignatureFast(conn, SIG, { commitment: 'confirmed', intervalMs: 50 });
  const elapsed = Date.now() - started;

  assert.equal(res.status, 'landed');
  assert.equal(res.signature, SIG);
  // the old code waited for blockhash expiry (~60-90s) or forever
  assert.ok(elapsed < 3000, `must resolve fast, took ${elapsed}ms`);
});

test('a genuine on-chain error is still thrown, not swallowed', async () => {
  const conn = hangingWs([{ err: { InstructionError: [0, 'Custom'] } }]);
  await assert.rejects(
    () => confirmSignatureFast(conn, SIG, { intervalMs: 50 }),
    /on-chain error/,
  );
});

test('the poll times out cleanly instead of hanging forever', async () => {
  const started = Date.now();
  const res = await pollSignatureStatus(
    { getSignatureStatuses: async () => ({ value: [null] }) },
    SIG,
    { intervalMs: 50, timeoutMs: 400 },
  );
  assert.equal(res.status, 'timeout');
  assert.ok(Date.now() - started >= 350);
  assert.ok(Date.now() - started < 3000);
});

test('a transient RPC failure does not abort the poll', async () => {
  let n = 0;
  const conn = {
    getSignatureStatuses: async () => {
      if (++n < 3) throw new Error('429 Too Many Requests');
      return { value: [{ err: null, confirmationStatus: 'confirmed' }] };
    },
  };
  const res = await pollSignatureStatus(conn, SIG, { intervalMs: 30, timeoutMs: 5000 });
  assert.equal(res.status, 'landed', 'must keep polling through transient errors');
  assert.ok(n >= 3);
});

test('the poll can be aborted by the caller mid-flight', async () => {
  let aborted = false;
  let polls = 0;
  const started = Date.now();
  const res = await pollSignatureStatus(
    { getSignatureStatuses: async () => { polls++; if (polls >= 2) aborted = true; return { value: [null] }; } },
    SIG,
    { intervalMs: 20, timeoutMs: 10_000, shouldAbort: () => aborted },
  );
  assert.equal(res.status, 'timeout');
  assert.equal(res.aborted, true, 'must report that it was aborted, not that it timed out naturally');
  assert.ok(Date.now() - started < 2000, 'abort must not wait for the full timeout');
  assert.ok(polls >= 2 && polls < 20, `should stop polling promptly, did ${polls}`);
});

test('commitment ladder: processed accepts confirmed/finalized, not vice versa', () => {
  assert.equal(meetsCommitment('processed', 'processed'), true);
  assert.equal(meetsCommitment('confirmed', 'processed'), true);
  assert.equal(meetsCommitment('finalized', 'processed'), true);
  assert.equal(meetsCommitment('processed', 'confirmed'), false);
  assert.equal(meetsCommitment('confirmed', 'confirmed'), true);
  assert.equal(meetsCommitment('confirmed', 'finalized'), false);
  assert.equal(meetsCommitment(null, 'processed'), false);
});

test('processed commitment resolves as soon as the tx is seen', async () => {
  const conn = hangingWs([{ err: null, confirmationStatus: 'processed' }]);
  const res = await confirmSignatureFast(conn, SIG, { commitment: 'processed', intervalMs: 50 });
  assert.equal(res.status, 'landed');
  assert.equal(res.confirmationStatus, 'processed');
});

// ---------- 3. pages use the fast path and an explicit wsEndpoint ----------

test('both pages pin an explicit wsEndpoint', () => {
  for (const [name, src] of [['mint', mintSrc], ['claim', claimSrc]]) {
    assert.match(src, /wsEndpoint: WS_URL/, `${name} must pin wsEndpoint`);
    assert.match(src, /cfg\.wsUrl \|\| cfg\.rpcUrl\.replace\(\/\^http\/, 'ws'\)/,
      `${name} must derive ws from the configured rpc url`);
    assert.doesNotMatch(src, /new Connection\(cfg\.rpcUrl, "confirmed"\)/,
      `${name} must not use the bare implicit-ws constructor`);
  }
});

test('the mint reveal is no longer gated on full confirmation', () => {
  const handler = mintSrc.slice(
    mintSrc.indexOf('const result = await sendWithRetry(tx)'),
    mintSrc.indexOf('} catch (e) {', mintSrc.indexOf('const result = await sendWithRetry(tx)')),
  );
  const fastAt = handler.indexOf("commitment: 'processed'");
  const revealAt = handler.indexOf('spin.settle()');
  assert.ok(fastAt > -1, 'mint must confirm at processed for the reveal');
  assert.ok(revealAt > fastAt, 'reveal happens after the fast check');
  // the reveal must NOT be preceded by an unconditional strict confirm
  const strictAt = handler.indexOf('await confirmMint(sig');
  assert.ok(strictAt > -1, 'strict confirm is still available as a fallback');
  assert.ok(handler.slice(0, strictAt).includes("status === 'timeout'"),
    'the strict confirm must be reachable only on timeout');
  // and reconciliation still happens after the reveal
  assert.match(handler, /post-reveal confirmation failed/);
  assert.match(handler, /did not confirm on-chain/);
});

test('the claim durable path races a poll so it cannot hang forever', () => {
  const durable = claimSrc.slice(
    claimSrc.indexOf('sig = await conn.sendRawTransaction(signedTx.serialize())'),
  );
  const block = durable.slice(0, durable.indexOf('} else {'));
  assert.match(block, /confirmSignatureFast\(conn, sig, \{ commitment: 'confirmed' \}\)/);
  assert.doesNotMatch(block, /conn\.confirmTransaction\(\{ signature: sig \}, 'confirmed'\)/,
    'the bare confirmTransaction (hangs with a dead socket) must be gone');
  assert.match(block, /confirmation timed out/);
});
