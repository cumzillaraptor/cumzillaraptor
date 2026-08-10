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
  programId: 'AYE4iC2gp81H8jvMjk4EGxwP2sJFzuDptUwxqwTZYTMY',
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
    'program: AYE4iC2gp81H8jvMjk4EGxwP2sJFzuDptUwxqwTZYTMY',
    'recipient: 8gUvnRYEcUMHwkt4WwWckMFCC9KUN1m47TgzttXR7TVg',
    'nft_id: 1',
    'eth_address: 0xb9b1d4251416066aff6c06e4ab7a8ee4d2312e29',
    `nonce: 0x${'01'.repeat(32)}`,
    'expiry_unix: 2000000000',
  ].join('\n');
  assert.equal(normalizeEthAddress(fixture.ethAddress), '0xb9b1d4251416066aff6c06e4ab7a8ee4d2312e29');
  assert.equal(buildClaimMessage(fixture), expectedMessage);
  assert.equal(claimMessageHash(expectedMessage), '0x4b57181079dc1ce6c969854d881078e8a8f67c9747fffd115fd38b8cdaebab9f');
  assert.equal(makeClaimLeaf({
    programId: fixture.programId,
    clusterTag: fixture.cluster,
    ethAddress: fixture.ethAddress,
    nftId: fixture.nftId,
    nonceHex: fixture.nonceHex,
  }), '0x86f1ec1034d4e3cc7124fbaf7b62ec61babb745f31115a3e5a5198408d6d51be');
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
  assert.equal(claims.claims.length, 174);
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
  assert.equal(claims.merkleRoot, '0x6b98744c71cba27ec2391b2c4cc79fc835b0c325faca0ff40dea6326e3b238fb');
  assert.equal(vectors.fixture.messageHash, '0xd63ea82c133fd09e348f17bea749d1a1d04e21fcaf9659242b55474898957dd6');
  assert.equal(vectors.fixture.leaf, '0x0f38100957d1b293932c16c37f38e965e1e75563df4057b921d98b16b44c65c6');
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
