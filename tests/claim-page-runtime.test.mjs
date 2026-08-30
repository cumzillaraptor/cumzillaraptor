// RUNTIME tests for review 2026-08-29 findings H2, M2-M4 and L1-L3.
//
// Unlike claim-page-hardening.test.mjs (which pins source shape), these boot the
// real claim page module in jsdom with mocked wallets and RPC and assert on
// observable behaviour: what gets submitted, what the user sees, what is skipped.
import assert from 'node:assert/strict';
import test from 'node:test';
import { bootClaimPage } from './fixtures/claim-page-harness.mjs';

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

test('page boots and renders on-chain status from the config PDA', async () => {
  const s = await bootClaimPage();
  assert.equal(s.text('stat-bar'), 'minted: 7/246 · claimed: 3/174');
  // M2: the numbers live in <strong> elements, not interpolated markup
  assert.equal(s.$('stat-bar').querySelectorAll('strong').length, 2);
  assert.deepEqual(s.intervals.map((i) => i.ms), [60000]);
});

test('connecting both wallets lists eligible raptors', async () => {
  const s = await connected({ claimIds: [4, 9] });
  assert.match(s.text('v-eth'), /^0xb0e683/);
  assert.equal(s.text('eligibility-result'), '✅ eligible — 2 raptors:');
  assert.equal(s.$('claim-list').children.length, 2);
  assert.equal(s.text('btn-sign-all-eth'), 'sign 1 transaction on ethereum');
  assert.equal(s.text('btn-claim-all'), 'sign 2 transactions on solana');
});

// ---------- H2: receipts re-read immediately before claiming ----------

test('a raptor claimed elsewhere after signing is skipped, not submitted', async () => {
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

test('claiming submits nothing when everything was already claimed elsewhere', async () => {
  const s = await signedAndClaimed({
    claimIds: [4, 9],
    claimedAtLoad: [],
    claimedAtClaim: [4, 9],
  });
  assert.equal(s.submissions.length, 0, 'nothing may be submitted');
  assert.match(s.text('claim-msg'), /already claimed/);
});

test('an unverifiable pre-claim receipt read submits nothing', async () => {
  const s = await signedAndClaimed({
    claimIds: [4, 9],
    receiptsFail: 'claim',   // the re-check itself fails
  });
  assert.equal(s.submissions.length, 0, 'must not submit on unknown receipt state');
  assert.match(s.text('claim-msg'), /could not confirm which raptors are still unclaimed/);
  assert.match(s.text('claim-msg'), /nothing was submitted/);
});

test('the pre-claim re-check costs exactly one extra RPC call', async () => {
  const s = await signedAndClaimed({ claimIds: [4, 9] });
  assert.equal(s.receiptChecks, 2, 'one eligibility read + one pre-claim read');
});

// ---------- M2: no innerHTML — values land as text ----------

test('interpolated chain values are inserted as text, never parsed as markup', async () => {
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

test('ethereum signing uses EIP-1193 personal_sign with hex-encoded bytes', async () => {
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

test('a malformed wallet signature is rejected before any submission', async () => {
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

test('the cancel control appears during a claim run and is hidden after', async () => {
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

test('cancelling stops the run and leaves remaining raptors claimable', async () => {
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

test('rate-limit backoff counts down per second instead of one long sleep', async () => {
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

test('cancelling during a rate-limit wait aborts the run', async () => {
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

test('a wallet error shows a clean message with no stack or JSON blob', async () => {
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

test('a failed eligibility receipt read warns instead of claiming all unclaimed', async () => {
  const s = await connected({ claimIds: [4, 9], receiptsFail: 'load' });
  assert.match(s.text('eligibility-result'), /could not verify which raptors are already claimed/);
  // the list is still shown so the user can proceed, but the warning is visible
  assert.equal(s.$('claim-list').children.length, 2);
});

// ---------- L3: transient RPC failure does not wipe the status bar ----------

test('a transient status failure keeps the last known on-chain numbers', async () => {
  const s = await bootClaimPage({ statusFailAfter: 1 });
  const before = s.text('stat-bar');
  assert.equal(before, 'minted: 7/246 · claimed: 3/174');

  // fire the poll callback the page registered; its RPC read now throws
  await s.intervals[0].fn();
  await s.settle(20);
  assert.equal(s.text('stat-bar'), before, 'status bar must not be wiped (L3)');
});

test('the unavailable message still shows when status never loaded at all', async () => {
  const s = await bootClaimPage({ statusFailAfter: 0 });
  assert.match(s.text('stat-bar'), /devnet status unavailable/);
});
