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
  // Chunk size is MAX_SIGN_BATCH_IDS (32), deliberately below the protocol cap of
  // 64, so the mandatory durable-nonce claim tx stays under 1232 bytes (C1 fix).
  assert.match(source, /const ethereumTxCount = Math\.ceil\(claimable\.length \/ MAX_SIGN_BATCH_IDS\)/);
  assert.match(source, /' transaction' \+ \(ethereumTxCount === 1 \? '' : 's'\) \+ ' on ethereum'/);
});

test('Solana label includes mandatory nonce setup when it does not exist', () => {
  assert.match(source, /const solanaTxCount = nonceChecked/);
  assert.match(source, /claimable\.length \+ \(claimable\.length && !claimNonce \? 1 : 0\)/);
  assert.match(source, /'sign ' \+ solanaTxCount/);
  assert.match(source, /' transaction' \+ \(solanaTxCount === 1 \? '' : 's'\) \+ ' on solana'/);
});

test('nonce setup is mandatory inside the Solana claim flow with no separate button', () => {
  assert.doesNotMatch(source, /id="btn-setup-nonce"/);
  assert.doesNotMatch(source, /enable relaxed claiming/);
  assert.match(source, /await ensureClaimNonce\(solanaTxCount\)/);
  assert.match(source, /setting up secure claiming \(1\//);
});
