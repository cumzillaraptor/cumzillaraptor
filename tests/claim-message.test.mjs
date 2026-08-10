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
  programId: 'AYE4iC2gp81H8jvMjk4EGxWP2sJFzuDptUwxqwTZYTMY',
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
    'program: AYE4iC2gp81H8jvMjk4EGxWP2sJFzuDptUwxqwTZYTMY',
    'recipient: 8gUvnRYEcUMHwkt4WwWckMFCC9KUN1m47TgzttXR7TVg',
    'nft_id: 1',
    'eth_address: 0xb9b1d4251416066aff6c06e4ab7a8ee4d2312e29',
    `nonce: 0x${'01'.repeat(32)}`,
    'expiry_unix: 2000000000',
  ].join('\n');
  assert.equal(normalizeEthAddress(fixture.ethAddress), '0xb9b1d4251416066aff6c06e4ab7a8ee4d2312e29');
  assert.equal(buildClaimMessage(fixture), expectedMessage);
  assert.equal(claimMessageHash(expectedMessage), '0x45b80b217bf4f5e6784f71ed2000ef63076040917740e247373353247caf0f43');
  assert.equal(makeClaimLeaf({
    programId: fixture.programId,
    clusterTag: fixture.cluster,
    ethAddress: fixture.ethAddress,
    nftId: fixture.nftId,
    nonceHex: fixture.nonceHex,
  }), '0x7e45388ba3cba6449e63020796f35a482adb7cbb3313317dc931e913c45d9922');
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
  assert.equal(claims.merkleRoot, '0x8443ba0a33024e5edbbf59ecc82a30e27255c2774884d190fb1f0ae11b9ebdef');
  assert.equal(vectors.fixture.messageHash, '0x47dc375605fc532da556baa3355a317d16fd1079eb6e5e2f85eb1d8acfdda8d2');
  assert.equal(vectors.fixture.leaf, '0x156b31f5f7ca067dac7c93037b0b83c01bae210ab37c857cb93523515de8770d');
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
