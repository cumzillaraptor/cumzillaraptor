import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { MerkleTree } = require('merkletreejs');
const { keccak256 } = require('@ethersproject/keccak256');

const root = path.resolve(import.meta.dirname, '..');
const helper = path.join(root, 'scripts', 'claim-message-v1.js');
const claimsPath = path.join(root, 'nft-data', 'claims-v1.devnet.json');
const vectorsPath = path.join(root, 'nft-data', 'claim-message-vectors.devnet.json');
const generator = path.join(root, 'scripts', 'generate-merkle-tree.js');

const fixture = {
  cluster: 'devnet',
  programId: '2YTAvP54MuSd7uUGbG9LrWiXCYh5UNHyqvy6XqxCTda2',
  recipient: '8gUvnRYEcUMHwkt4WwWckMFCC9KUN1m47TgzttXR7TVg',
  nftId: 1,
  ethAddress: '0xB9B1D4251416066AFF6C06E4AB7A8EE4D2312E29',
  nonceHex: `0x${'01'.repeat(32)}`,
  expiryUnix: '2000000000',
};

test('V1 helper emits exact domain-separated message, deterministic hash, and canonical leaf bytes', async () => {
  const { buildClaimMessage, claimMessageHash, makeClaimLeaf, normalizeEthAddress } = await import(helper);
  const expectedMessage = [
    'CUMZILLARAPTORS_CLAIM_V1',
    'cluster: devnet',
    'program: 2YTAvP54MuSd7uUGbG9LrWiXCYh5UNHyqvy6XqxCTda2',
    'recipient: 8gUvnRYEcUMHwkt4WwWckMFCC9KUN1m47TgzttXR7TVg',
    'nft_id: 1',
    'eth_address: 0xb9b1d4251416066aff6c06e4ab7a8ee4d2312e29',
    `nonce: 0x${'01'.repeat(32)}`,
    'expiry_unix: 2000000000',
  ].join('\n');
  assert.equal(normalizeEthAddress(fixture.ethAddress), '0xb9b1d4251416066aff6c06e4ab7a8ee4d2312e29');
  assert.equal(buildClaimMessage(fixture), expectedMessage);
  assert.equal(claimMessageHash(expectedMessage), '0x4015afc66d93116b548d3424b4d7442c2a7de35efb51db77f0248693e0f9b5c9');
  assert.equal(makeClaimLeaf({
    programId: fixture.programId,
    clusterTag: fixture.cluster,
    ethAddress: fixture.ethAddress,
    nftId: fixture.nftId,
    nonceHex: fixture.nonceHex,
  }), '0xabbeeb21bad265c42f38ecefa75fd105f60038923292a658cf7088874007b0da');
});

test('V1 helper rejects malformed auth inputs', async () => {
  const { buildClaimMessage, makeClaimLeaf } = await import(helper);
  assert.throws(() => buildClaimMessage({ ...fixture, nftId: 0 }), /NFT ID/i);
  assert.throws(() => buildClaimMessage({ ...fixture, nonceHex: '0x01' }), /nonce/i);
  assert.throws(() => buildClaimMessage({ ...fixture, ethAddress: '0xB9b1d4251416066AFF6C06E4AB7A8EE4D2312e29' }), /checksum/i);
  assert.throws(() => buildClaimMessage({ ...fixture, expiryUnix: '-1' }), /expiry/i);
  assert.throws(() => makeClaimLeaf({ programId: fixture.programId, clusterTag: 'Devnet', ethAddress: fixture.ethAddress, nftId: 1, nonceHex: fixture.nonceHex }), /cluster/i);
});

test('regenerated V1 claim dataset and checked vectors bind devnet/program/root', async () => {
  assert.equal(existsSync(claimsPath), true, 'claims V1 dataset must be generated');
  assert.equal(existsSync(vectorsPath), true, 'claim message vectors must be generated');
  const claims = JSON.parse(await readFile(claimsPath, 'utf8'));
  const vectors = JSON.parse(await readFile(vectorsPath, 'utf8'));
  assert.equal(claims.version, 'CUMZILLARAPTORS_CLAIM_V1');
  assert.equal(claims.cluster, 'devnet');
  assert.equal(claims.programId, fixture.programId);
  assert.equal(claims.claims.length, 173);
  assert.match(claims.merkleRoot, /^0x[0-9a-f]{64}$/);
  assert.equal(vectors.version, claims.version);
  assert.equal(vectors.fixture.message, [
    'CUMZILLARAPTORS_CLAIM_V1',
    'cluster: devnet',
    `program: ${fixture.programId}`,
    `recipient: ${fixture.recipient}`,
    'nft_id: 1',
    'eth_address: 0xb9b1d4251416066aff6c06e4ab7a8ee4d2312e29',
    `nonce: ${vectors.fixture.nonceHex}`,
    'expiry_unix: 2000000000',
  ].join('\n'));
  // Committed V1 interoperability vector: values must not be recomputed by this test.
  assert.equal(claims.merkleRoot, '0x6b78a511b9b133ca3182c0a5b3d71f4e33e06ea9298110b31fe8b2973549dba4');
  assert.equal(vectors.fixture.messageHash, '0xdd1d6613534a9b4fd81c932e54811eaa26d56f212ba9faf06a05314a2008c2bd');
  assert.equal(vectors.fixture.leaf, '0xc5fb2563c36fde2167a433934c1919b605f30ee01d6d1c2b26260abb50a39f05');
  const tree = new MerkleTree(claims.claims.map((claim) => claim.leaf), keccak256, { sortPairs: true });
  assert.equal(`0x${tree.getRoot().toString('hex')}`, claims.merkleRoot);
  for (const claim of claims.claims) {
    assert.equal(tree.verify(claim.proof, claim.leaf, claims.merkleRoot), true, `proof for NFT #${claim.nftId}`);
  }
});

test('generator derives artifact names from the requested cluster', async () => {
  const outputDir = await mkdtemp(path.join(tmpdir(), 'cumz-v1-mainnet-'));
  try {
    const result = spawnSync('node', [generator, '--v1', '--cluster', 'mainnet', '--program-id', fixture.programId, '--output-dir', outputDir], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(existsSync(path.join(outputDir, 'claims-v1.mainnet.json')), true);
    assert.equal(existsSync(path.join(outputDir, 'claim-message-vectors.mainnet.json')), true);
    assert.equal(existsSync(path.join(outputDir, 'claims-v1.devnet.json')), false);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});
