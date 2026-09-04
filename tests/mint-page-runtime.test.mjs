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
  test(name, {
    concurrency: false,
    skip: domUnavailable ? 'jsdom unavailable: ' + domUnavailable : false,
  }, fn);

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

domTest('desktop: prep work before the popup stays minimal (durable-nonce path)', async () => {
  // 2026-09-03 desktop fix: Phantom's pre-popup simulation takes ~40s on devnet
  // while a devnet blockhash (measured through our proxy) dies in ~25-27s, so
  // desktop now signs a DURABLE-NONCE transaction that never expires. Pre-popup
  // work is a nonce re-read (plus warm-cache hits); crucially there is NO
  // getLatestBlockhash race to lose — no time pressure exists at all.
  const r = await boot({ mobile: false, rpcLatencyMs: 250, fetchLatencyMs: 250 });
  assert.equal(r.error, null);
  const pre = prePopupRpc(r);
  assert.ok(pre, 'the popup must open');
  const labels = pre.map((p) => p.label);
  assert.ok(labels.some((l) => l.includes('getAccountInfo(nonce)')),
    'desktop must re-read the nonce before the popup, got: ' + labels.join(', '));
  assert.ok(!labels.includes('RPC getLatestBlockhash'),
    'the durable tx must NOT depend on a fresh blockhash: ' + labels.join(', '));
  const clickToPopup = r.popupAt - r.rollAt;
  assert.ok(clickToPopup < 1500,
    'click->popup should be ~2 round trips max, was ' + clickToPopup + 'ms');
});

domTest('desktop: the mint tx is durable (advance-nonce first, nonce hash)', async () => {
  // THE 2026-09-03 report: 40s popup delay + ~25s devnet blockhash life =>
  // every desktop signature was born expired => preflight "Blockhash not found"
  // => expiry branch re-prompted => endless approval loop, nothing minted.
  // Durability removes the deadline entirely.
  const r = await boot({ mobile: false, rpcLatencyMs: 120 });
  assert.equal(r.isError, false, 'no error expected, got: ' + r.finalMsg);
  assert.equal(r.revealed, true, 'the raptor must be revealed');
  // The user-facing copy must tell the user there is no time pressure and warn
  // about the slow popup, not show a countdown that no longer applies.
  const all = r.msgs.join(' | ');
  assert.match(all, /never expires/i,
    'desktop approval message must say the approval never expires, got: ' + all);
  assert.doesNotMatch(all, /before the approval window expires/i,
    'no countdown may be shown for a durable transaction');
});

domTest('desktop: first roll folds the one-time nonce setup into the flow', async () => {
  const r = await boot({ mobile: false, rpcLatencyMs: 120, nonceExists: false });
  assert.equal(r.isError, false, 'no error expected, got: ' + r.finalMsg);
  assert.equal(r.revealed, true, 'the raptor must be revealed after setup + mint');
  const labels = r.trace.map((t) => t.label);
  assert.ok(labels.some((l) => l.includes('NONCE_SETUP')),
    'the setup transaction must be submitted first');
  const all = r.msgs.join(' | ');
  assert.match(all, /approval 1 of 2/i,
    'setup must be labeled as approval 1 of 2, got: ' + all);
  // both approvals happened: setup + paid mint
  const approvals = r.trace.filter((t) => t.label === 'POPUP_APPROVED').length;
  assert.equal(approvals, 2, 'exactly two approvals (setup + mint), got ' + approvals);
});

domTest('desktop: the registry is warmed before the roll click', async () => {
  const r = await boot({ mobile: false, rpcLatencyMs: 120 });
  const warm = r.trace.find((t) => t.label.includes('registry'));
  assert.ok(warm, 'the registry must be fetched at least once');
  assert.ok(warm.at < r.rollAt, 'registry read must happen before the click');
});

domTest('desktop uses the fast sign-only popup, page submits', async () => {
  // THE 2026-08-30 desktop fix (final): Phantom runs an internal simulation
  // before showing a signAndSendTransaction popup (~40s), but a signTransaction
  // popup appears immediately. Both desktop and mobile now use the sign-only
  // path + page-side submission, so the popup opens fast on desktop too.
  const r = await boot({ mobile: false, rpcLatencyMs: 120 });
  const labels = r.trace.map((t) => t.label);
  assert.ok(labels.some((l) => l.includes('POPUP_OPEN(signTransaction)')),
    'desktop must use the fast signTransaction popup');
  assert.ok(!labels.some((l) => l.includes('POPUP_OPEN(signAndSendTransaction)')),
    'desktop must NOT use signAndSendTransaction (slow Phantom simulation)');
  assert.ok(labels.some((l) => l.includes('sendRawTransaction')),
    'the page must submit the signed tx through its own RPC');
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

domTest('a signing-time rejection retries without ever double-charging', async () => {
  // Restored (b629573) desktop flow uses sendWithRetry: a rejection at SIGNING
  // (before any signature exists) may re-open the wallet for a fresh attempt, but
  // must never pay twice or reveal. The money-safety invariant is enforced by
  // reconciling any produced signature before re-prompting (see the other tests).
  const r = await boot({
    mobile: false,
    rpcLatencyMs: 100,
    sendThrows: new Error('Transaction signature expired because block height was exceeded'),
  });
  const approvals = r.trace.filter((t) => t.label === 'POPUP_APPROVED').length;
  assert.equal(approvals, 0, 'no approval succeeded in this scenario');
  assert.ok(r.trace.some((t) => t.label.startsWith('POPUP_OPEN')), 'the wallet was prompted');
  assert.equal(r.revealed, false, 'nothing may be revealed when no payment landed');
  assert.equal(r.isError, true);
});

domTest('desktop: complete click-to-reveal path is under 5 seconds', async () => {
  const r = await boot({ mobile: false, rpcLatencyMs: 1000, fetchLatencyMs: 1000 });
  assert.equal(r.revealed, true, r.finalMsg);
  assert.ok(r.settledAt - r.rollAt < 5000,
    'desktop click-to-reveal took ' + (r.settledAt - r.rollAt) + 'ms');
});

domTest('a signature approved but not submitted is still reconciled', async () => {
  // The dangerous desktop case created by page-side submission: the user
  // APPROVES, then sendRawTransaction fails. The signed transaction may still
  // land, so the page must have recorded the signature before submitting and
  // must refuse to silently re-charge.
  const r = await boot({
    mobile: true,
    rpcLatencyMs: 100,
    submitThrows: new Error('failed to send transaction: node is behind'),
  });
  assert.ok(r.signedSignatures.length >= 1,
    'the page must be told the signature before submission');
  // It must reconcile on-chain rather than surfacing a raw submission error, and
  // must never open a second paid approval. If reconciliation shows the tx landed
  // (default mock status), revealing is the CORRECT outcome.
  const approvals = r.trace.filter((t) => t.label === 'POPUP_APPROVED').length;
  const statusChecks = r.trace.filter((t) => t.label.includes('getSignatureStatuses')).length;
  assert.ok(statusChecks >= 1,
    'a post-approval submission failure must trigger an on-chain reconciliation');
  assert.ok(approvals <= 1,
    'must not open a second paid approval after one was already given (approvals=' + approvals + ')');
  assert.doesNotMatch(r.finalMsg, /node is behind/,
    'must not surface the raw RPC submission error to the user');
});

domTest('an approved-but-undeliverable tx warns instead of re-charging', async () => {
  // Submission fails AND the transaction never lands. The page must not offer a
  // fresh approval; it must tell the user not to approve again.
  const r = await boot({
    mobile: true,
    rpcLatencyMs: 80,
    submitThrows: new Error('failed to send transaction: node is behind'),
    statusOf: null,          // nothing ever lands
  });
  const approvals = r.trace.filter((t) => t.label === 'POPUP_APPROVED').length;
  assert.equal(approvals, 1, 'exactly one approval may be requested');
  assert.equal(r.revealed, false, 'nothing may be revealed when nothing landed');
  assert.match(r.finalMsg, /do NOT approve again|wallet history/i,
    'must warn the user rather than inviting a second payment, got: ' + r.finalMsg);
});

domTest('a dropped transaction is rebroadcast until it lands', async () => {
  // THE 2026-08-30 desktop report: the page submitted once, the network dropped
  // it, and the user sat on "payment accepted — landing your raptor…" until the
  // blockhash expired. When the wallet broadcast it retried for us; taking
  // submission over means the page owes that duty.
  const r = await boot({
    mobile: true,
    rpcLatencyMs: 100,
    landsAfterSends: 2,      // first delivery is dropped; a rebroadcast lands it
    confirmThrows: 'blockheight',
  });
  const sends = r.trace.filter((t) => t.label.includes('sendRawTransaction')).length;
  assert.ok(sends >= 2, 'the page must rebroadcast a dropped transaction (sends=' + sends + ')');
  assert.equal(r.revealed, true, 'the raptor must still be revealed: ' + r.finalMsg);
  assert.equal(r.isError, false, 'no error expected, got: ' + r.finalMsg);
});

domTest('rebroadcast uses a ~2s cadence, not a busy loop', async () => {
  const r = await boot({
    mobile: true, rpcLatencyMs: 100, landsAfterSends: 3, confirmThrows: 'blockheight',
  });
  // the harness clamps long sleeps but records the REQUESTED delay
  assert.ok(r.sleeps.includes(2000),
    'expected a 2000ms rebroadcast tick, saw: ' + [...new Set(r.sleeps)].join(','));
});

domTest('rebroadcast stops once the roll settles', async () => {
  // A leaked rebroadcast timer would keep hitting the RPC after the reveal.
  const r = await boot({ mobile: true, rpcLatencyMs: 100, landsAfterSends: 2,
    confirmThrows: 'blockheight' });
  const sendsAtSettle = r.trace.filter(
    (t) => t.label.includes('sendRawTransaction') && t.at <= r.settledAt).length;
  const sendsTotal = r.trace.filter((t) => t.label.includes('sendRawTransaction')).length;
  assert.equal(sendsTotal, sendsAtSettle,
    'no rebroadcast may occur after the roll settled');
});

domTest('the timeout message never blames the network setting', async () => {
  // The user reported devnet WAS selected; the old copy sent them hunting a
  // misconfiguration that did not exist.
  //
  // Drive prettyError() directly via a signing-time blockhash rejection, which
  // DOES reach the error branch inside the test window. (A dropped-transaction
  // run stays on "landing your raptor…" until the 30s poll deadline, so asserting
  // on it would pass vacuously.)
  const r = await boot({
    mobile: true,
    rpcLatencyMs: 80,
    sendThrows: new Error(
      'Transaction signature expired because the allowed block height limit was exceeded'),
  });
  assert.equal(r.isError, true, 'expected the error branch to render');
  const all = r.msgs.join(' | ') + ' | ' + r.finalMsg;
  assert.doesNotMatch(all, /DEVNET \(not testnet\/mainnet\)/i,
    'must not blame the wallet network for a delivery failure');
  assert.match(r.finalMsg, /did not pick up your transaction/i,
    'should explain the real cause, got: ' + r.finalMsg);
});

domTest('a blockhash that expires during approval recovers by re-signing', async () => {
  // THE 2026-08-30 report: the user signed "eventually", no SOL left the wallet,
  // and the page timed out. Cause: with skipPreflight:true the RPC silently
  // ACCEPTS a transaction whose blockhash already expired and returns a
  // signature, so the page polls a signature that can never land.
  //
  // Verified against live devnet: skipPreflight:false => "Blockhash not found";
  // skipPreflight:true => accepted with no error.
  const r = await boot({
    mobile: true,
    rpcLatencyMs: 90,
    expirePreflightAttempts: 1,   // first delivery rejected as expired
  });
  const rejected = r.trace.filter((t) => t.label.includes('PREFLIGHT_REJECT')).length;
  assert.ok(rejected >= 1,
    'preflight must REJECT the expired transaction rather than accept it');
  assert.ok(!r.trace.some((t) => t.label.includes('ACCEPTED-DEAD-TX')),
    'the page must never submit with skipPreflight:true — it hides expiry');
  const popups = r.trace.filter((t) => t.label.startsWith('POPUP_OPEN')).length;
  assert.equal(popups, 2, 'expiry must be recovered by exactly one re-sign');
  assert.equal(r.revealed, true, 'the roll must succeed after re-signing: ' + r.finalMsg);
  assert.equal(r.isError, false);
});

domTest('an expired approval says plainly that no payment was taken', async () => {
  const r = await boot({ mobile: true, rpcLatencyMs: 90, expirePreflightAttempts: 1 });
  const all = r.msgs.join(' | ');
  assert.match(all, /no payment was taken/i,
    'the user must be told they were not charged, got: ' + all);
  assert.doesNotMatch(all, /do NOT approve again/i,
    'an expired (dead) transaction must not dead-end with the undeliverable warning');
});

domTest('dead expired bytes are never rebroadcast', async () => {
  // Rebroadcasting a transaction whose blockhash expired can never succeed and
  // would keep hammering the RPC. It must be discarded on expiry.
  const r = await boot({ mobile: true, rpcLatencyMs: 90, expirePreflightAttempts: 1 });
  const firstResign = r.trace.filter((t) => t.label.startsWith('POPUP_OPEN'))[1];
  const sendsBetween = r.trace.filter((t) =>
    t.label.includes('send #') && t.at > r.trace[0].at && t.at < firstResign.at &&
    t.label.includes('ACCEPTED'));
  assert.equal(sendsBetween.length, 0, 'no dead-tx delivery may occur before the re-sign');
});

domTest('the approval prompt shows the remaining time window', async () => {
  // The ~60s blockhash deadline starts BEFORE the popup opens and was previously
  // invisible, so a user taking their time lost the signature with no warning.
  const r = await boot({ mobile: true, rpcLatencyMs: 90, signDelayMs: 1200 });
  const all = r.msgs.join(' | ');
  assert.match(all, /before the approval window expires/i,
    'the approval message must surface the deadline, got: ' + all);
  // ticks once per second (harness clamps the wait but records the request)
  assert.ok(r.sleeps.includes(1000), 'countdown must tick every 1000ms');
  // and it must NOT keep ticking after the roll resolves
  assert.doesNotMatch(r.finalMsg, /before the approval window expires/i,
    'countdown must stop once the approval completes');
});

domTest('a retry gets a FRESH countdown, not a continued one', async () => {
  const r = await boot({ mobile: true, rpcLatencyMs: 90, expirePreflightAttempts: 1 });
  const counts = r.msgs
    .map((m) => /~(\d+)s before the approval window/.exec(m))
    .filter(Boolean).map((m) => Number(m[1]));
  // the second attempt must start again at the top rather than continuing down
  const firstMax = counts[0];
  assert.ok(counts.filter((c) => c === firstMax).length >= 2,
    'each attempt must restart the countdown, saw: ' + counts.join(','));
});

domTest('a retry uses a FRESH blockhash, never the prefetched one', async () => {
  const r = await boot({
    mobile: true,
    rpcLatencyMs: 100,
    sendThrows: new Error('block height exceeded'),
  });
  const popups = r.trace.filter((t) => t.label.startsWith('POPUP_OPEN')).length;
  const blockhashes = r.trace.filter((t) => t.label.includes('getLatestBlockhash')).length;
  // one prefetched (concurrent with simulate) + one per retry
  assert.ok(blockhashes >= popups,
    'each retry must fetch a fresh blockhash (fetches=' + blockhashes + ', popups=' + popups + ')');
});

domTest('once signed, a submission failure never opens a fresh approval', async () => {
  // THE 2026-08-30 desktop report: popup opened fast (signTransaction), the user
  // signed quickly, but then fresh approvals kept appearing WITHOUT clicking Roll.
  // Root cause: when submission failed after signing and signature extraction had
  // returned nothing, the money-safety guard (`pendingSignatures.length &&
  // signedRawTx`) was false, so sendWithRetry fell through and re-opened the
  // wallet. Fix: guard on `||` so a produced raw tx proves a signature exists and
  // we must reconcile, never re-prompt.
  const r = await boot({
    mobile: false,
    rpcLatencyMs: 100,
    submitThrows: new Error('failed to send transaction: node is behind'),
    statusOf: null,          // nothing ever lands
    signatureOfNull: true,   // Phantom signed but the page could not extract a sig
  });
  const approvals = r.trace.filter((t) => t.label === 'POPUP_APPROVED').length;
  assert.equal(approvals, 1,
    'exactly one approval may ever be requested after signing (approvals=' + approvals + ')');
  assert.equal(r.revealed, false, 'nothing may be revealed when nothing landed');
  assert.match(r.finalMsg, /do NOT approve again|wallet history/i,
    'must warn instead of re-opening the wallet, got: ' + r.finalMsg);
});
