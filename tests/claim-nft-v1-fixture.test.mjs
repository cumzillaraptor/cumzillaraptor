import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PublicKey } from '@solana/web3.js';

import { V1_CLAIM_FIXTURE, verifyCommittedV1Fixture } from './fixtures/claim-nft-v1.mjs';

test('fixture fields are selected verbatim from the committed V1 artifacts', () => {
  const claims = JSON.parse(readFileSync(new URL('../nft-data/claims-v1.devnet.json', import.meta.url)));
  const metadata = JSON.parse(readFileSync(new URL('../nft-data/metadata-merkle-v1.devnet.json', import.meta.url)));
  assert.deepEqual(claims.claims.find(({ nftId }) => nftId === 360), V1_CLAIM_FIXTURE.claim);
  assert.deepEqual(metadata.metadata['360'], V1_CLAIM_FIXTURE.metadata);
  assert.equal(claims.merkleRoot, V1_CLAIM_FIXTURE.claimRoot);
  assert.equal(metadata.merkleRoot, V1_CLAIM_FIXTURE.metadataRoot);
});

test('deterministic V1 claim fixture recomputes committed claim and metadata leaves', () => {
  const verified = verifyCommittedV1Fixture(V1_CLAIM_FIXTURE);
  assert.equal(verified.claimLeaf, V1_CLAIM_FIXTURE.claim.leaf);
  assert.equal(verified.metadataLeaf, V1_CLAIM_FIXTURE.metadata.leaf);
  assert.equal(verified.claimRoot, V1_CLAIM_FIXTURE.claimRoot);
  assert.equal(verified.metadataRoot, V1_CLAIM_FIXTURE.metadataRoot);
  assert.equal(V1_CLAIM_FIXTURE.cluster, 'devnet');
  assert.equal(V1_CLAIM_FIXTURE.programId, 'AYE4iC2gp81H8jvMjk4EGxWP2sJFzuDptUwxqwTZYTMY');
});

test('fixture deterministically derives the exact config, registry, asset, and receipt PDAs', () => {
  const programId = new PublicKey(V1_CLAIM_FIXTURE.programId);
  const [config] = PublicKey.findProgramAddressSync([Buffer.from('config')], programId);
  const [registry] = PublicKey.findProgramAddressSync([Buffer.from('allocation')], programId);
  const [asset] = PublicKey.findProgramAddressSync([
    Buffer.from('asset'), Buffer.from([V1_CLAIM_FIXTURE.claim.nftId >> 8, V1_CLAIM_FIXTURE.claim.nftId & 0xff]),
  ], programId);
  const [receipt] = PublicKey.findProgramAddressSync([
    Buffer.from('claim'), Buffer.from(V1_CLAIM_FIXTURE.claim.leaf.slice(2), 'hex'),
  ], programId);
  assert.equal(config.toBase58(), '7JDvn8mkEousMqzasbDZazkq8EsRy42nB1Dxp74Kg3e6');
  assert.equal(registry.toBase58(), 'Hrnf4t6EpR6vU3WMw1JV1vz1p2hLopjo7xrXkQNVGqPc');
  assert.equal(asset.toBase58(), '7HKLazdYXbBdgFzYxar3Z14ycDLCiDh6Cmwa3BR6JijG');
  assert.equal(receipt.toBase58(), '6AqkGZ2EWG8tvRpozc8gNhsemRTjWFb2XVXhM2EEEWm1');
});

test('fixture produces the exact EIP-191 preimage bound to a supplied local claimant', () => {
  const claimant = '8gUvnRYEcUMHwkt4WwWckMFCC9KUN1m47TgzttXR7TVg';
  const { message, preimage } = V1_CLAIM_FIXTURE.claimAuthorizationFor(claimant, 2_000_000_000);
  assert.match(message, /^CUMZILLARAPTORS_CLAIM_V1\ncluster: devnet\nprogram: AYE4iC2gp81H8jvMjk4EGxWP2sJFzuDptUwxqwTZYTMY\nrecipient: 8gUvnRYEcUMHwkt4WwWckMFCC9KUN1m47TgzttXR7TVg\n/);
  const eip191Prefix = Buffer.from(`\x19Ethereum Signed Message:\n${Buffer.byteLength(message)}`);
  assert.deepEqual([...preimage.subarray(0, eip191Prefix.length)], [...eip191Prefix]);
  assert.deepEqual([...preimage.subarray(-Buffer.byteLength(message))], [...Buffer.from(message)]);
});

// A real local-validator claim also needs an ECDSA signature made by the private
// key for the committed artifact ETH address. V1 artifacts deliberately contain
// no such signature/private key, so this fixture explicitly records that it does
// not synthesize one.
test('fixture does not contain or synthesize Ethereum signing material', () => {
  assert.equal(V1_CLAIM_FIXTURE.secpSignature, undefined);
  assert.equal(V1_CLAIM_FIXTURE.signingKey, undefined);
});
