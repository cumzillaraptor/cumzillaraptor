// RUNTIME tests for review 2026-08-29 findings H2, M2-M4 and L1-L3.
//
// Unlike claim-page-hardening.test.mjs (which pins source shape), these boot the
// real claim page module in jsdom with mocked wallets and RPC and assert on
// observable behaviour: what gets submitted, what the user sees, what is skipped.
//
// jsdom is a devDependency. A production/lean install (npm ci --omit=dev) has no
// jsdom, so these tests SKIP rather than hard-fail there — the source-shape
// invariants in claim-page-hardening.test.mjs still run and still gate the fixes.
// Set CUMZ_REQUIRE_DOM_TESTS=1 to turn a missing jsdom into a failure instead
// (use this in any CI job that is meant to cover the runtime behaviour).
import assert from 'node:assert/strict';
import test from 'node:test';

let bootClaimPage = null;
let domUnavailable = null;
try {
  ({ bootClaimPage } = await import('./fixtures/claim-page-harness.mjs'));
} catch (e) {
  if (process.env.CUMZ_REQUIRE_DOM_TESTS === '1') {
    throw new Error(
      'CUMZ_REQUIRE_DOM_TESTS=1 but the jsdom claim-page harness could not load: ' +
      (e?.message || e),
    );
  }
  domUnavailable = e?.message || String(e);
  console.warn('[claim-page-runtime] skipping DOM runtime tests — ' + domUnavailable);
}

// node:test has no top-level conditional skip, so gate every test on this.
const domTest = (name, fn) => test(name, { skip: domUnavailable ? 'jsdom unavailable' : false }, fn);

test('the jsdom harness is available in a full dev install', () => {
  // Documents the skip explicitly instead of a silently empty file. In a full
  // `npm ci` (jsdom present) this asserts the harness really loaded.
  if (domUnavailable) {
    assert.notEqual(process.env.CUMZ_REQUIRE_DOM_TESTS, '1');
    return;
  }
  assert.equal(typeof bootClaimPage, 'function');
});

async function connected(opts = {}) {
  const s = await bootClaimPage(opts);
  s.$('btn-connect-eth').click();
  await s.settle(40);
  s.$('btn-connect-sol').click();
  await s.settle(60);
  return s;
}

async function signedAndClaimed(opts = {}) {
  const s = await connected(opts);
  s.$('btn-sign-all-eth').click();
  await s.settle(80);
  s.$('btn-claim-all').click();
  await s.settle(300);
  return s;
}

domTest('page boots and renders claim-pool progress from the config PDA', async () => {
  const s = await bootClaimPage();
  // claim-pool progress only — claimed count vs claim pool, never mint progress
  assert.equal(s.text('prog-claimed'), '3');
  assert.equal(s.text('prog-claim-total'), '174');
  assert.match(s.$('prog-fill').style.width, /^\d/);
  // no mint progress is rendered on the claim page
  assert.equal(s.$('prog-claimed').querySelectorAll('strong').length, 0);
  assert.equal(s.$('prog-claimed').tagName, 'STRONG');
  assert.deepEqual(s.intervals.map((i) => i.ms), [60000]);
});

domTest('connecting both wallets lists eligible raptors', async () => {
  const s = await connected({ claimIds: [4, 9] });
  assert.match(s.text('v-eth'), /^0xb0e683/);
  assert.equal(s.text('eligibility-result'), '✅ eligible — 2 raptors:');
  assert.equal(s.$('claim-list').children.length, 2);
  assert.equal(s.text('btn-sign-all-eth'), 'sign 1 transaction on ethereum');
  assert.equal(s.text('btn-claim-all'), 'sign 2 transactions on solana');
});

// ---------- H2: receipts re-read immediately before claiming ----------

domTest('a raptor claimed elsewhere after signing is skipped, not submitted', async () => {
  const s = await signedAndClaimed({
    claimIds: [4, 9],
    claimedAtLoad: [],      // both look claimable when the user signs
    claimedAtClaim: [9],    // #9 got claimed from another device meanwhile
  });

  // exactly one transaction was submitted — no fee burned on the dead #9
  assert.equal(s.submissions.length, 1, 'only the still-unclaimed raptor is submitted');
  assert.equal(s.text('claim-msg'), '🎉 all 1 raptor claimed!');
  assert.match(s.$('claim-done').textContent, /#4 explorer/);
  assert.doesNotMatch(s.$('claim-done').textContent, /#9 explorer/);

  // the row label is refreshed from the fresh receipt read
  assert.match(s.$('claim-list').textContent, /#9already claimed ✓/);

  // two receipt reads: eligibility, then the pre-claim re-check
  const reads = s.events.filter((e) => e.startsWith('receipts'));
  assert.deepEqual(reads, ['receipts:load', 'receipts:claim']);
});

domTest('claiming submits nothing when everything was already claimed elsewhere', async () => {
  const s = await signedAndClaimed({
    claimIds: [4, 9],
    claimedAtLoad: [],
    claimedAtClaim: [4, 9],
  });
  assert.equal(s.submissions.length, 0, 'nothing may be submitted');
  assert.match(s.text('claim-msg'), /already claimed/);
});

domTest('an unverifiable pre-claim receipt read submits nothing', async () => {
  const s = await signedAndClaimed({
    claimIds: [4, 9],
    receiptsFail: 'claim',   // the re-check itself fails
  });
  assert.equal(s.submissions.length, 0, 'must not submit on unknown receipt state');
  assert.match(s.text('claim-msg'), /could not confirm which raptors are still unclaimed/);
  assert.match(s.text('claim-msg'), /nothing was submitted/);
});

domTest('the pre-claim re-check costs exactly one extra RPC call', async () => {
  const s = await signedAndClaimed({ claimIds: [4, 9] });
  assert.equal(s.receiptChecks, 2, 'one eligibility read + one pre-claim read');
});

// ---------- M2: no innerHTML — values land as text ----------

domTest('interpolated chain values are inserted as text, never parsed as markup', async () => {
  const s = await connected({ claimIds: [4] });
  const row = s.$('claim-list').children[0];
  assert.equal(row.querySelector('span').textContent, 'cumzillaraptor #4');
  assert.equal(row.querySelector('strong').textContent, 'ready');
  // the collection pubkey learned from chain goes through textContent
  assert.equal(s.text('v-collection'), '3DQ3LQ6JKq8PjUL4dg2VB7FajPSh8wywqsbJi7sCAfKK');
  // and no element in the panel carries injected markup
  assert.equal(s.$('eligibility-result').querySelectorAll('script, img').length, 0);
});

// ---------- M3: signing works with no CDN / no ethers ----------

domTest('ethereum signing uses EIP-1193 personal_sign with hex-encoded bytes', async () => {
  const s = await connected({ claimIds: [4, 9] });
  s.$('btn-sign-all-eth').click();
  await s.settle(80);

  assert.equal(s.signRequests.length, 1, 'one chunk => one signature');
  const { data, signer } = s.signRequests[0];
  assert.match(data, /^0x[0-9a-f]+$/, 'message must be hex-encoded bytes');
  assert.equal(signer, s.ETH);

  // the hex decodes back to the canonical batch claim message
  const text = Buffer.from(data.slice(2), 'hex').toString('utf8');
  assert.match(text, /^CUMZILLARAPTORS_CLAIM_V1_BATCH/);
  assert.match(text, /8eCKWEHZ525kBLnh4mQBnhpkk4nmde5jSeQC7FGR8t3d/);

  // no network fetch to any CDN happened
  assert.deepEqual(
    s.events.filter((e) => e.startsWith('fetch:') && /esm|ethers|cdn/i.test(e)),
    [],
  );
});

domTest('a malformed wallet signature is rejected before any submission', async () => {
  const s = await connected({ claimIds: [4] });
  s.window.ethereum.request = async ({ method }) => {
    if (method === 'eth_accounts' || method === 'eth_requestAccounts') return [s.ETH];
    if (method === 'personal_sign') return '0xdeadbeef';   // too short
    throw new Error('unsupported');
  };
  s.$('btn-sign-all-eth').click();
  await s.settle(60);
  assert.match(s.text('sign-msg'), /unexpected signature format/);
  s.$('btn-claim-all').click();
  await s.settle(80);
  assert.equal(s.submissions.length, 0, 'no signature => nothing submitted');
});

// ---------- M4: cancellable, counted backoff ----------

domTest('the cancel control appears during a claim run and is hidden after', async () => {
  const s = await connected({ claimIds: [4, 9], signDelayMs: 30 });
  assert.ok(s.$('row-cancel').classList.contains('hidden'), 'hidden before claiming');
  s.$('btn-sign-all-eth').click();
  await s.settle(80);
  s.$('btn-claim-all').click();
  // poll until the run is genuinely underway (mocks are fast; a fixed tick count races)
  let sawVisible = false;
  for (let i = 0; i < 400; i++) {
    if (!s.$('row-cancel').classList.contains('hidden')) { sawVisible = true; break; }
    await s.tick();
  }
  assert.ok(sawVisible, 'cancel control must be visible while claiming');
  await s.settle(400);
  assert.ok(s.$('row-cancel').classList.contains('hidden'), 'hidden again when done');
  assert.match(s.text('claim-msg'), /claimed/);
  s.restoreTimers();
});

domTest('cancelling stops the run and leaves remaining raptors claimable', async () => {
  const s = await connected({
    claimIds: [4, 9, 14],
    // Slow the wallet down so there is a window to press cancel mid-run.
    signDelayMs: 30,
  });
  s.$('btn-sign-all-eth').click();
  await s.settle(80);
  s.$('btn-claim-all').click();
  // wait until the first raptor has actually been submitted, then stop
  for (let i = 0; i < 200 && s.submissions.length < 1; i++) await s.tick();
  s.$('btn-cancel-claim').click();
  await s.settle(400);

  assert.ok(s.submissions.length >= 1, 'the in-flight raptor still completes');
  assert.ok(s.submissions.length < 3, `expected to stop early, submitted ${s.submissions.length}`);
  assert.match(s.text('claim-msg'), /stopped at your request/);
  assert.ok(s.$('row-cancel').classList.contains('hidden'));
  s.restoreTimers();
});

domTest('rate-limit backoff counts down per second instead of one long sleep', async () => {
  let calls = 0;
  const s = await connected({
    claimIds: [4],
    sendBehaviour: () => { calls++; return new Error('429 rate limit exceeded'); },
  });
  s.$('btn-sign-all-eth').click();
  await s.settle(80);
  s.$('btn-claim-all').click();
  await s.settle(600);

  // The page's own backoff sleeps must all be 1s countdown ticks. (30000 is
  // wallet.js's popup watchdog, not a backoff sleep.)
  const backoff = s.sleeps.filter((ms) => ms !== 30000);
  assert.ok(backoff.length > 0, 'backoff must sleep');
  assert.deepEqual([...new Set(backoff)], [1000], 'every backoff sleep is a 1s tick');
  // the old implementation slept 5000/10000/15000/20000 in one shot
  for (const bad of [5000, 10000, 15000, 20000]) {
    assert.ok(!s.sleeps.includes(bad), `uncancellable ${bad}ms sleep reintroduced (M4)`);
  }
  assert.ok(calls > 1, 'it did retry after backing off');
  // and the countdown was surfaced to the user
  assert.ok(s.countdownMessages.some((m) => /retrying #4 in \d+s/.test(m)),
    'countdown must be visible: ' + JSON.stringify(s.countdownMessages.slice(0, 3)));
  s.restoreTimers();
});

domTest('cancelling during a rate-limit wait aborts the run', async () => {
  const s = await connected({
    claimIds: [4, 9],
    sendBehaviour: () => new Error('429 rate limit exceeded'),
  });
  s.$('btn-sign-all-eth').click();
  await s.settle(80);
  s.$('btn-claim-all').click();
  // wait until the page is in the countdown, then cancel
  for (let i = 0; i < 400 && !s.countdownMessages.length; i++) await s.tick();
  assert.ok(s.countdownMessages.length, 'should have entered the backoff countdown');
  s.$('btn-cancel-claim').click();
  await s.settle(400);
  assert.match(s.text('claim-msg'), /stopped at your request/);
  assert.ok(s.$('row-cancel').classList.contains('hidden'));
  s.restoreTimers();
});

// ---------- L1: no stack frames in the UI ----------

domTest('a wallet error shows a clean message with no stack or JSON blob', async () => {
  const s = await connected({ claimIds: [4] });
  s.$('btn-sign-all-eth').click();
  await s.settle(80);
  s.window.phantom.solana.signTransaction = async () => {
    const e = new Error('Unexpected error');
    e.stack = 'Error: Unexpected error\n    at Object.signTransaction (chrome-extension://abc/inject.js:1:2)';
    e.error = { code: -32603, message: 'internal' };
    throw e;
  };
  s.$('btn-claim-all').click();
  await s.settle(300);

  const msg = s.text('claim-msg');
  assert.ok(msg.length > 0);
  assert.doesNotMatch(msg, /chrome-extension/, 'stack frame leaked to the UI (L1)');
  assert.doesNotMatch(msg, /at Object\./, 'stack frame leaked to the UI (L1)');
  assert.doesNotMatch(msg, /-32603|\{"code"/, 'raw provider JSON leaked to the UI (L1)');
});

// ---------- L2: eligibility failure surfaced, not silently downgraded ----------

domTest('a failed eligibility receipt read warns instead of claiming all unclaimed', async () => {
  const s = await connected({ claimIds: [4, 9], receiptsFail: 'load' });
  assert.match(s.text('eligibility-result'), /could not verify which raptors are already claimed/);
  // the list is still shown so the user can proceed, but the warning is visible
  assert.equal(s.$('claim-list').children.length, 2);
});

// ---------- L3: transient RPC failure does not wipe the status bar ----------

domTest('a transient status failure keeps the last known on-chain numbers', async () => {
  const s = await bootClaimPage({ statusFailAfter: 1 });
  const before = s.text('prog-claimed');
  assert.equal(before, '3');

  // fire the poll callback the page registered; its RPC read now throws
  await s.intervals[0].fn();
  await s.settle(20);
  assert.equal(s.text('prog-claimed'), before, 'claim progress must not be wiped (L3)');
});

domTest('the unavailable message still shows when status never loaded at all', async () => {
  const s = await bootClaimPage({ statusFailAfter: 0 });
  assert.match(s.text('stat-note'), /devnet status unavailable/);
});

// ---------- dead RPC WebSocket must not stall the claim run ----------

domTest('a claim completes promptly even when the RPC WebSocket is dead', async () => {
  // deadWebSocket makes confirmTransaction() hang forever, exactly as it did in
  // production when worker.js refused the wss upgrade with 405. A durable-nonce
  // claim tx never expires, so the old code had no deadline to fall back on.
  const started = Date.now();
  const s = await signedAndClaimed({ claimIds: [4], deadWebSocket: true });
  const elapsed = Date.now() - started;

  assert.equal(s.submissions.length, 1, 'the claim was submitted');
  assert.match(s.text('claim-msg'), /claimed/, 'claim must complete: ' + s.text('claim-msg'));
  assert.match(s.$('claim-done').textContent, /#4 explorer/, 'reveal/receipt link must appear');
  assert.ok(elapsed < 20000, `must not hang on the dead socket, took ${elapsed}ms`);
  // it resolved via the HTTP status poll, not the socket
  assert.ok(s.statusQueries > 0, 'the HTTP status poll must have been used');
  s.restoreTimers();
});
