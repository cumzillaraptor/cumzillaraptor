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
  assert.doesNotMatch(mintSource, /preferSignOnly/);
  assert.match(mintSource, /const sig = await wc\.signAndSend\(tx\);/);
  assert.match(walletSource, /options\.preferSignOnly\s*&&\s*typeof provider\.signTransaction/);
  assert.match(walletSource, /skipPreflight: options\.skipPreflight === true/);
});

test('mint checks transaction history before reporting a confirmation timeout', () => {
  assert.match(mintSource, /getSignatureStatuses\(\[sig\],\s*\{[\s\S]*searchTransactionHistory:\s*true/);
  assert.match(mintSource, /confirmationStatus === ['"]confirmed['"]/);
  assert.match(mintSource, /confirmationStatus === ['"]finalized['"]/);
});
