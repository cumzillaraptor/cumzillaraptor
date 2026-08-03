import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const mintCsv = path.join(root, 'nft-data', 'allocation-source', 'mint_list.csv');
const reserveCsv = path.join(root, 'nft-data', 'allocation-source', 'reserve_list.csv');
const claimData = path.join(root, 'nft-data', 'claims-v1.devnet.json');
const legacyProofs = path.join(root, 'nft-data', 'claim-proofs.json');
const claimsByAddress = path.join(root, 'nft-data', 'claims-by-address.json');
const legacyConfig = path.join(root, 'nft-data', 'merkle-config.json');
const mintPool = path.join(root, 'nft-data', 'mint-pool-order.json');
const state = path.join(root, 'programs', 'cumzillaraptors', 'src', 'state.rs');

const ethAddress = '0xfadf08b0ecc8f128b22d8fb738024db10d34df91';

function csvRows(text) {
  return text.trim().split(/\r?\n/).slice(1).map((line) => line.split(','));
}

test('approved allocation policy is 246 public / 174 claim and reserves #360 for the supplied ETH holder', async () => {
  const [mintText, reserveText, claimsText, proofsText, lookupText, configText, poolText, stateText] = await Promise.all([
    readFile(mintCsv, 'utf8'), readFile(reserveCsv, 'utf8'), readFile(claimData, 'utf8'),
    readFile(legacyProofs, 'utf8'), readFile(claimsByAddress, 'utf8'), readFile(legacyConfig, 'utf8'),
    readFile(mintPool, 'utf8'), readFile(state, 'utf8'),
  ]);
  const mint = csvRows(mintText);
  const reserve = csvRows(reserveText);
  const mintIds = mint.map(([id]) => Number(id));
  const reserveIds = reserve.map(([id]) => Number(id));
  const claims = JSON.parse(claimsText);
  const proofs = JSON.parse(proofsText);
  const lookup = JSON.parse(lookupText);
  const config = JSON.parse(configText);
  const pool = JSON.parse(poolText);

  assert.equal(mint.length, 246);
  assert.equal(reserve.length, 174);
  assert.equal(mintIds.includes(360), false);
  assert.deepEqual(reserve.filter(([id]) => id === '360'), [['360', 'cumzillaraptor #360', ethAddress]]);
  assert.equal(new Set([...mintIds, ...reserveIds]).size, 420);
  assert.deepEqual([...mintIds, ...reserveIds].sort((a, b) => a - b), Array.from({ length: 420 }, (_, i) => i + 1));

  assert.equal(claims.totalClaims, 174);
  assert.equal(claims.claims.find((claim) => claim.nftId === 360)?.ethAddress, ethAddress);
  assert.equal(proofs['360']?.ethAddress, ethAddress);
  assert.equal(lookup[ethAddress]?.some((claim) => claim.nftNumber === 360), true);
  assert.equal(config.totalClaims, 174);
  assert.equal(pool.total, 246);
  assert.equal(pool.order.length, 246);
  assert.equal(pool.order.includes(360), false);
  assert.match(stateText, /pub const PUBLIC_COUNT: u16 = 246/);
  assert.match(stateText, /pub const CLAIM_COUNT: u16 = 174/);
});

test('the legacy claim-artifact generator is present so legacy frontend data is reproducible', () => {
  assert.equal(existsSync(path.join(root, 'scripts', 'generate-legacy-claim-artifacts.js')), true);
});
