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

test('mint requests sign-only submission through the configured RPC', () => {
  assert.match(mintSource, /wc\.signAndSend\(tx,\s*\{\s*preferSignOnly:\s*true\s*\}\)/);
  assert.match(walletSource, /options\.preferSignOnly\s*&&\s*typeof provider\.signTransaction/);
  assert.match(walletSource, /conn\.sendRawTransaction\(signed\.serialize\(\),\s*\{\s*skipPreflight:\s*false\s*\}\)/);
});

test('mint checks transaction history before reporting a confirmation timeout', () => {
  assert.match(mintSource, /getSignatureStatuses\(\[sig\],\s*\{[\s\S]*searchTransactionHistory:\s*true/);
  assert.match(mintSource, /confirmationStatus === ['"]confirmed['"]/);
  assert.match(mintSource, /confirmationStatus === ['"]finalized['"]/);
});
