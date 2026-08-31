// Runtime tests for the MINT page desktop path, using the jsdom harness.
//
// Motivating report (2026-08-30): "still very slow mint approval popup and a
// subsequent timeout on desktop with a Phantom extension". Source-shape tests
// cannot measure how many RPC round trips precede the popup, nor show that a
// wrong-network wallet strands the transaction. These boot the real page module.
import assert from 'node:assert/strict';
import test from 'node:test';

let boot = null;
let domUnavailable = null;
try {
  ({ bootMintPage: boot } = await import('./fixtures/mint-page-harness.mjs'));
} catch (e) {
  if (process.env.REQUIRE_DOM_TESTS === '1') {
    throw new Error('REQUIRE_DOM_TESTS=1 but the mint harness failed: ' + (e?.message || e));
  }
  domUnavailable = e?.message || String(e);
}
const domTest = (name, fn) =>
  test(name, { skip: domUnavailable ? 'jsdom unavailable: ' + domUnavailable : false }, fn);

test('mint runtime harness availability is explicit', () => {
  assert.ok(domUnavailable === null || typeof domUnavailable === 'string');
});

// Count only the RPC calls that actually block the wallet popup.
function prePopupRpc(r) {
  if (r.rollAt == null || r.popupAt == null) return null;
  return r.trace.filter(
    (t) => t.at >= r.rollAt && t.at <= r.popupAt && t.label.startsWith('RPC '),
  );
}

domTest('desktop: at most one RPC round trip blocks the wallet popup', async () => {
  const r = await boot({ mobile: false, rpcLatencyMs: 250, fetchLatencyMs: 250 });
  assert.equal(r.error, null);
  const pre = prePopupRpc(r);
  assert.ok(pre, 'the popup must open');

  // simulateTransaction + getLatestBlockhash run CONCURRENTLY, so they are one
  // round trip of latency. The allocation registry must NOT be read here — it is
  // warmed on connect. Regressing that adds a full round trip before the popup.
  const labels = pre.map((p) => p.label);
  assert.ok(!labels.some((l) => l.includes('registry')),
    'the allocation registry must be warmed on connect, not read in the click path: ' + labels.join(', '));
  assert.ok(pre.length <= 2, 'expected <=2 concurrent pre-popup calls, got: ' + labels.join(', '));

  // With 250ms simulated latency, one concurrent round trip should dominate.
  const clickToPopup = r.popupAt - r.rollAt;
  assert.ok(clickToPopup < 700,
    'click->popup should be ~1 round trip, was ' + clickToPopup + 'ms');
});

domTest('desktop: the registry is warmed before the roll click', async () => {
  const r = await boot({ mobile: false, rpcLatencyMs: 120 });
  const warm = r.trace.find((t) => t.label.includes('registry'));
  assert.ok(warm, 'the registry must be fetched at least once');
  assert.ok(warm.at < r.rollAt, 'registry read must happen before the click');
});

domTest('desktop: the PAGE submits the signed transaction, not the wallet', async () => {
  const r = await boot({ mobile: false, rpcLatencyMs: 120 });
  const labels = r.trace.map((t) => t.label);
  assert.ok(labels.some((l) => l.includes('POPUP_OPEN(signTransaction)')),
    'desktop must use signTransaction so the page controls submission');
  assert.ok(labels.some((l) => l.includes('sendRawTransaction (page submits)')),
    'the page must submit through its own RPC');
  assert.ok(!labels.some((l) => l.includes('signAndSendTransaction')),
    'the wallet must not broadcast (its network may differ from the page RPC)');
});

domTest('desktop: the raptor is revealed and no error is shown', async () => {
  const r = await boot({ mobile: false, rpcLatencyMs: 150 });
  assert.equal(r.isError, false, 'no error expected, got: ' + r.finalMsg);
  assert.equal(r.revealed, true, 'the raptor must be revealed');
  assert.match(r.finalMsg, /you rolled cumzillaraptor #\d+/);
});

domTest('desktop: reveal happens without waiting for full confirmation', async () => {
  // confirmTransaction never resolves (dead WebSocket). The HTTP poll must carry
  // the reveal anyway — this is the 60-90s stall class of bug.
  const r = await boot({ mobile: false, rpcLatencyMs: 120, confirmHangs: true, statusOf: 'processed' });
  assert.equal(r.revealed, true, 'reveal must not depend on confirmTransaction');
  assert.ok(r.settledAt - r.approvedAt < 5000,
    'reveal took ' + (r.settledAt - r.approvedAt) + 'ms after approval');
});

domTest('a signing rejection retries without ever double-charging', async () => {
  // The wallet throws at SIGNING, so no signature exists and there is nothing to
  // reconcile — re-prompting is safe here. What must hold: nothing is revealed.
  const r = await boot({
    mobile: false,
    rpcLatencyMs: 100,
    sendThrows: new Error(
      'Transaction signature expired because the allowed block height limit was exceeded'),
  });
  const popups = r.trace.filter((t) => t.label.startsWith('POPUP_OPEN')).length;
  const approvals = r.trace.filter((t) => t.label === 'POPUP_APPROVED').length;
  assert.ok(popups > 1, 'expiry should trigger a retry');
  assert.equal(approvals, 0, 'no approval succeeded in this scenario');
  assert.equal(r.revealed, false, 'nothing may be revealed when no payment landed');
  assert.equal(r.isError, true);
});

domTest('a signature approved but not submitted is still reconciled', async () => {
  // The dangerous desktop case created by page-side submission: the user
  // APPROVES, then sendRawTransaction fails. The signed transaction may still
  // land, so the page must have recorded the signature before submitting and
  // must refuse to silently re-charge.
  const r = await boot({
    mobile: false,
    rpcLatencyMs: 100,
    submitThrows: new Error('failed to send transaction: node is behind'),
  });
  assert.ok(r.signedSignatures.length >= 1,
    'the page must be told the signature before submission');
  // it must NOT reveal, and must not have opened a second approval blindly
  assert.equal(r.revealed, false);
  const approvals = r.trace.filter((t) => t.label === 'POPUP_APPROVED').length;
  const statusChecks = r.trace.filter((t) => t.label.includes('getSignatureStatuses')).length;
  assert.ok(statusChecks >= 1,
    'a post-approval submission failure must trigger an on-chain reconciliation');
  assert.ok(approvals <= 1,
    'must not open a second paid approval after one was already given (approvals=' + approvals + ')');
});

domTest('a retry uses a FRESH blockhash, never the prefetched one', async () => {
  const r = await boot({
    mobile: false,
    rpcLatencyMs: 100,
    sendThrows: new Error('block height exceeded'),
  });
  const popups = r.trace.filter((t) => t.label.startsWith('POPUP_OPEN')).length;
  const blockhashes = r.trace.filter((t) => t.label.includes('getLatestBlockhash')).length;
  // one prefetched (concurrent with simulate) + one per retry
  assert.ok(blockhashes >= popups,
    'each retry must fetch a fresh blockhash (fetches=' + blockhashes + ', popups=' + popups + ')');
});
