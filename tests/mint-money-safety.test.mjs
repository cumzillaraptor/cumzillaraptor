// Money-safety regression tests for the mint page.
//
// Bugs locked down (review 2026-08-29):
//   C1  sendWithRetry re-opened the wallet on blockhash expiry without checking
//       whether the earlier approval had already landed -> user could approve
//       twice and pay 2 SOL for one roll.
//   C2  no hard re-entry guard, so a second roll could start while a payment
//       was still unresolved (and would pick a DIFFERENT raptor id).
//   H1  preferSignOnly was applied on desktop, replacing Phantom's prompt
//       signAndSendTransaction with sign + manual send.
//   H2  the 30s status poll overwrote the live "approve the 1 SOL payment"
//       message and could flip the button state mid-approval.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const mint = await readFile(
  new URL('../cumzillaraptors/mint/index.html', import.meta.url),
  'utf8',
);
const wallet = await readFile(
  new URL('../cumzillaraptors/client/wallet.js', import.meta.url),
  'utf8',
);

test('C1: retry checks for an already-landed signature before re-prompting', () => {
  assert.match(mint, /let pendingSignatures = \[\]/);
  assert.match(mint, /pendingSignatures\.push\(sig\)/);
  assert.match(mint, /async function findLandedSignature\(\)/);
  // The landed check must happen inside the retry path, before re-opening the wallet.
  const retry = mint.slice(mint.indexOf('async function sendWithRetry'));
  const landedAt = retry.indexOf('await findLandedSignature()');
  const repromptAt = retry.indexOf('approval window expired');
  assert.ok(landedAt > -1, 'retry must check for a landed signature');
  assert.ok(landedAt < repromptAt, 'landed check must precede the re-prompt message');
});

test('C1: an unverifiable status check refuses to re-prompt', () => {
  assert.match(mint, /could not verify whether your previous approval went through/);
  assert.match(mint, /searchTransactionHistory: true/);
});

test('C1: a landed signature short-circuits confirmation instead of re-charging', () => {
  assert.match(mint, /landedEarly: true/);
  // The guard was inverted when the reveal moved off the full-confirm path
  // (2026-08-30 RPC WebSocket fix): the roll handler now asks "if NOT already
  // landed, confirm it", which is the same short-circuit. Assert the semantics,
  // not one spelling of the condition.
  assert.match(mint, /if \(!?result\.landedEarly\)/);

  const handler = mint.slice(
    mint.indexOf('const result = await sendWithRetry(tx)'),
    mint.indexOf('} catch (e) {', mint.indexOf('const result = await sendWithRetry(tx)')),
  );
  // every confirmation attempt must sit behind the landedEarly check, so a
  // signature we already know landed is never re-confirmed or re-charged
  const guardAt = handler.indexOf('if (!result.landedEarly)');
  assert.ok(guardAt > -1, 'confirmation must be guarded by landedEarly');
  assert.ok(guardAt < handler.indexOf('confirmSignatureFast'),
    'the guard must precede confirmation');
  assert.ok(guardAt < handler.indexOf('await confirmMint('),
    'the guard must precede the strict confirm fallback');
});

test('C2: hard re-entry guard blocks a second roll while unresolved', () => {
  const handler = mint.slice(mint.indexOf("$('btn-mint').addEventListener"));
  assert.match(handler, /if \(spinning\) return;/);
  assert.match(handler, /if \(pendingSignatures\.length\)/);
  assert.match(handler, /previous approval is still unresolved/);
});

test('C2: pending signatures clear on success and on user rejection only', () => {
  assert.match(mint, /pendingSignatures = \[\];\s*\/\/ roll fully resolved/);
  assert.match(mint, /if \(!pendingSignatures\.length \|\| isUserRejection\(e\)\) pendingSignatures = \[\]/);
  assert.match(mint, /function isUserRejection\(e\)/);
});

test('H1: mint no longer forces preferSignOnly (desktop uses the wallet send path)', () => {
  assert.doesNotMatch(mint, /preferSignOnly/);
  assert.match(mint, /const sig = await wc\.signAndSend\(tx\);/);
});

test('H1: wallet honours an explicit skipPreflight instead of hardcoding false', () => {
  assert.match(wallet, /skipPreflight: options\.skipPreflight === true/);
  assert.doesNotMatch(wallet, /skipPreflight: false/);
});

test('H2: status poll is suppressed while a roll is in flight', () => {
  const poll = mint.slice(
    mint.indexOf('async function refreshStatus'),
    mint.indexOf('function updateProgress'),
  );
  assert.match(poll, /if \(spinning\) return;/);
  // The failure branch must not clobber an active mint message either.
  const failureBranch = poll.slice(poll.indexOf('catch'));
  assert.match(failureBranch, /if \(spinning\) return;/);
});

test('M2: pool + metadata are prefetched off the click path', () => {
  assert.match(mint, /function prefetchMintData\(\)/);
  assert.match(mint, /prefetchMintData\(\);/);
  const onConnect = mint.slice(mint.indexOf('onConnect: (pk)'));
  assert.ok(
    onConnect.indexOf('prefetchMintData()') < onConnect.indexOf('updateButtons()'),
    'prefetch should be kicked off on wallet connect',
  );
});

test('L1: stale comment about blockhash fetch order is gone', () => {
  assert.doesNotMatch(mint, /fetched AFTER simulation and immediately before the/);
});
