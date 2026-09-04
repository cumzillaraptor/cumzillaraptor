// Regression tests for review 2026-08-29 findings H2, M2-M4 and L1-L3 on the
// claim page. These are source-shape assertions: the page is a browser module
// that needs window/wallet providers, so the reviewable invariants are checked
// statically, the same way the C1/C2 tests do it.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const src = readFileSync('cumzillaraptors/claim/index.html', 'utf8');

const between = (a, b) => {
  const i = src.indexOf(a);
  assert.ok(i > -1, `anchor not found: ${a}`);
  const j = b ? src.indexOf(b, i) : src.length;
  assert.ok(j > i, `end anchor not found after ${a}: ${b}`);
  return src.slice(i, j);
};

// ---------- H2: eligibility re-checked immediately before claiming ----------

test('receipt reading is a single reusable helper', () => {
  assert.match(src, /async function readReceiptsInto\(entries\)/);
  assert.match(src, /getMultipleAccountsInfo\(keys\.slice\(i, i \+ 100\)\)/);
  // exactly one place performs the receipt read
  assert.equal(src.match(/conn\.getMultipleAccountsInfo\(/g).length, 1);
  // truthiness of the account info decides claimed state, both directions
  assert.match(src, /entries\[i \+ j\]\.claimed = !!info/);
});

test('the claim handler re-reads receipts before the claim loop', () => {
  const handler = between("$('btn-claim-all').addEventListener", 'const needsNonceSetup');
  const recheck = handler.indexOf('readReceiptsInto(eligible)');
  const loop = handler.indexOf('const claimable = eligible.filter');
  assert.ok(recheck > -1, 'claim handler must re-read receipts (H2)');
  assert.ok(recheck < loop, 'receipts must be re-read BEFORE computing claimable');
  assert.match(handler, /re-checking which raptors are still unclaimed/);
});

test('an unverifiable pre-claim receipt read submits nothing', () => {
  const handler = between("$('btn-claim-all').addEventListener", 'const needsNonceSetup');
  assert.match(handler, /if \(!fresh\)/);
  assert.match(handler, /nothing was submitted/);
});

test('raptors claimed elsewhere are skipped and reported, not submitted', () => {
  const handler = between("$('btn-claim-all').addEventListener", 'const needsNonceSetup');
  assert.match(handler, /already claimed elsewhere/);
  assert.match(handler, /all your eligible raptors are already claimed/);
  // the visible row labels are refreshed from the new receipt state
  assert.match(handler, /renderEligibleRows\(\)/);
});

// ---------- M2: no innerHTML anywhere ----------

test('the page never assigns innerHTML', () => {
  const code = between('<script type="module">', '</script>');
  assert.doesNotMatch(code, /\.innerHTML\s*=/, 'innerHTML assignment reintroduced (M2)');
});

test('status bar and eligibility summary are built from elements', () => {
  assert.match(src, /function renderClaimProgress\(claimsMinted\)/);
  assert.match(src, /prog-fill'\)\.style\.width/);
  assert.match(src, /box\.replaceChildren\(head\)/);
  assert.match(src, /count\.textContent = String\(entries\.length\)/);
  // list clearing no longer goes through innerHTML = ''
  assert.match(src, /list\.replaceChildren\(\)/);
  assert.match(src, /done\.replaceChildren\(\)/);
});

test('every eligible row uses textContent', () => {
  const fn = between('function renderEligibleRows', 'async function maybeCheckEligibility');
  assert.match(fn, /label\.textContent = 'cumzillaraptor #' \+ entry\.id/);
  assert.match(fn, /val\.textContent = entry\.claimed/);
  assert.doesNotMatch(fn, /innerHTML/);
});

// ---------- M3: no CDN dependency at signing time ----------

test('ethers is no longer imported from a CDN', () => {
  // Strip line comments so the historical note about esm.sh in the source does
  // not mask a real reintroduced import.
  const code = between('<script type="module">', '</script>')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');
  assert.doesNotMatch(code, /esm\.sh/, 'CDN import reintroduced (M3)');
  assert.doesNotMatch(code, /BrowserProvider/);
  assert.doesNotMatch(code, /import\(\s*["']https?:/, 'no remote dynamic imports at all');
  assert.doesNotMatch(code, /from\s+["']https?:/, 'no remote static imports');
});

test('personal_sign goes straight through EIP-1193 with hex-encoded bytes', () => {
  const fn = between('async function personalSign', '// ---- menu');
  assert.match(fn, /window\.ethereum\.request\(\{/);
  assert.match(fn, /method: 'personal_sign'/);
  assert.match(fn, /params: \[toHexUtf8\(message\), signer\]/);
  // 65-byte signature => 130 hex chars; a malformed reply must not reach the tx
  assert.match(fn, /\^0x\[0-9a-fA-F\]\{130\}\$/);
  assert.match(src, /function toHexUtf8\(str\)/);
  assert.match(src, /new TextEncoder\(\)\.encode\(str\)/);
});

test('toHexUtf8 encodes utf-8 bytes as lowercase padded hex', () => {
  // Re-implement the extracted helper verbatim and check it against a
  // multi-byte string, so the encoding the wallet signs is pinned.
  const fnSrc = between('function toHexUtf8(str)', 'async function personalSign');
  const toHexUtf8 = new Function('return ' + fnSrc.trim())();
  assert.equal(toHexUtf8('abc'), '0x616263');
  assert.equal(toHexUtf8('\n'), '0x0a', 'bytes below 0x10 must stay two digits');
  assert.equal(toHexUtf8('é'), '0xc3a9', 'utf-8 multibyte');
  const long = toHexUtf8('CUMZILLARAPTORS_CLAIM_V1_BATCH');
  assert.equal(long.length, 2 + 30 * 2);
  assert.match(long, /^0x[0-9a-f]+$/);
});

// ---------- M4: cancellable, counted backoff ----------

test('a cancel control exists and is wired to the claim run', () => {
  assert.match(src, /id="btn-cancel-claim"/);
  assert.match(src, /id="row-cancel"/);
  const handler = between("$('btn-cancel-claim').addEventListener", 'async function countdownSleep');
  assert.match(handler, /if \(!claiming\) return;/);
  assert.match(handler, /cancelRequested = true/);
});

test('the rate-limit backoff counts down and honours cancel', () => {
  assert.doesNotMatch(
    src,
    /await new Promise\(\(r\) => setTimeout\(r, wait \* 1000\)\)/,
    'uncancellable bulk sleep reintroduced (M4)',
  );
  const loopTail = between('if (!/429|rate limit/i.test(perr)', 'setMsg(\'claim-msg\', \'🎉 all \'');
  assert.match(loopTail, /await countdownSleep\(wait,/);
  assert.match(loopTail, /if \(aborted\)/);
  assert.match(loopTail, /' in ' \+ left \+ 's…'?/);
});

test('countdownSleep aborts on request and ticks per second', () => {
  const fn = between('async function countdownSleep', '// ---- shared claim lookup table');
  assert.match(fn, /if \(cancelRequested\) return true/);
  assert.match(fn, /setTimeout\(r, 1000\)/);
  assert.match(fn, /onTick\(left\)/);
});

test('cancel state is reset and the control hidden when the run ends', () => {
  const fin = between('} finally {', "$('btn-cancel-claim').addEventListener");
  assert.match(fin, /claiming = false/);
  assert.match(fin, /cancelRequested = false/);
  assert.match(fin, /row-cancel'\)\.classList\.add\('hidden'\)/);
});

test('the loop checks for cancellation between raptors', () => {
  const loop = between('for (let i = 0; i < claimable.length; i++)', 'const transactionNumber');
  assert.match(loop, /if \(cancelRequested\)/);
  assert.match(loop, /stopped at your request/);
});

// ---------- L1: no stack frames in the UI ----------

test('prettyError shows a clean message and logs detail to the console', () => {
  const fn = between('function prettyError(e)', 'refreshStatus();');
  assert.match(fn, /console\.warn\('\[claim\] error detail:'/);
  assert.match(fn, /return e\?\.shortMessage \|\| msg;/);
  assert.doesNotMatch(fn, /e\?\.stack \? String\(e\.stack\)/, 'stack must not reach the UI (L1)');
  assert.doesNotMatch(fn, /msg \+ ' \| '/, 'no pipe-joined debug blob in the UI');
  // the friendly classifications are preserved
  assert.match(fn, /you rejected the transaction/);
  assert.match(fn, /not enough SOL/);
});

// ---------- L2: eligibility failure is surfaced ----------

test('a failed receipt lookup warns in the UI instead of assuming unclaimed', () => {
  assert.match(src, /let receiptsVerified = false;/);
  assert.match(src, /receiptsVerified = await readReceiptsInto\(eligible\)/);
  assert.match(src, /if \(!receiptsVerified\)/);
  assert.match(src, /could not verify which raptors are already claimed/);
  assert.doesNotMatch(
    src,
    /treating all as unclaimed/,
    'the silent downgrade comment/behaviour must be gone (L2)',
  );
});

// ---------- L3: status bar is not wiped by transient RPC errors ----------

test('refreshStatus keeps last known values on transient failure', () => {
  const fn = between('async function refreshStatus', 'function setMsg');
  assert.match(fn, /statBarEverRendered = true/);
  assert.match(fn, /if \(!statBarEverRendered && !claiming\)/);
  assert.match(fn, /keeping last known values/);
  // the destructive message still exists, but only for a never-loaded bar
  assert.match(fn, /devnet status unavailable/);
});

test('the status poll remains guarded by the claiming flag', () => {
  assert.match(src, /setInterval\(\(\) => \{ if \(!claiming\) refreshStatus\(\); \}, 60000\)/);
});
