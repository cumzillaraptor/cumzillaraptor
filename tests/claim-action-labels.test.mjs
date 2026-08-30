import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(
  new URL('../cumzillaraptors/claim/index.html', import.meta.url),
  'utf8',
);

test('claim page uses simple transaction-count action labels', () => {
  assert.match(source, /id="btn-sign-all-eth"[^>]*>sign 0 transactions on ethereum<\/button>/);
  assert.match(source, /id="btn-claim-all"[^>]*>sign 0 transactions on solana<\/button>/);
  assert.doesNotMatch(source, /sign ethereum message \(all raptors\)/);
  assert.doesNotMatch(source, /claim all raptors<\/button>/);
});

test('Ethereum label counts actual batch signatures', () => {
  assert.match(source, /const ethereumTxCount = Math\.ceil\(claimable\.length \/ MAX_BATCH_IDS\)/);
  assert.match(source, /' transaction' \+ \(ethereumTxCount === 1 \? '' : 's'\) \+ ' on ethereum'/);
});

test('Solana label counts one claim transaction per unclaimed raptor', () => {
  assert.match(source, /'sign ' \+ claimable\.length/);
  assert.match(source, /' transaction' \+ \(claimable\.length === 1 \? '' : 's'\) \+ ' on solana'/);
});
