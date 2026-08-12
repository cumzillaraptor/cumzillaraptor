import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash, createPublicKey } from 'node:crypto';
import { validateV2ApprovalBundle } from '../scripts/future-send-v2-approval.mjs';

const nonce = 'A'.repeat(43);
const approverPublicKey = '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAoaf3YGp70jvu0oTtXoOy8Yb66xVtqJhH2EnPmmtY+sE=\n-----END PUBLIC KEY-----\n';
const reviewerPublicKey = '-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAgs9EQsqOJ15FwRn8ftcsHh0zbtnhUkLUFTcVU0y4ZcU=\n-----END PUBLIC KEY-----\n';
// Detached fixed offline vectors; they are public test data, not key material.
const approverSignature = '3XkRFMmKv1mykKY_iSmtJduaYneKBDWvuSQGF7XO_uhDebZHye8TH5lbYVtBBJ-M2K4wPox8P7t2SjrlVs0rBg';
const reviewerSignature = 'SA78UQZXZ_zw_Pk4brcpnJlpmyvbA3M9Msk8-B4QWOlt6zWNPK8XWaa8BmZUzCkti58sUJXwnSkac7Qn3vCACg';
const approverFingerprint = 'ea5ddbe12db55497383514c65f197619d3e955b0a22c9cd79f9d65c71072422c';
const reviewerFingerprint = '653142d085748773346d236a0c45eb32ae6c5b30d84e8e99a1a110a380de7a26';
const authorizationSha256 = 'd3b7e087f0854ec2017f17c5dffd7679c0618e0836617b43bc93b45abed0957d';
const facts = { devnetGenesisHash: 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG', rpcSha256: '1dc16a401db4aed37b28ceeb1bce1bfbc33c94bbaf3acae7c6ae7392b90653b9', commitment: 'confirmed', programId: 'AYE4iC2gp81H8jvMjk4EGxWP2sJFzuDptUwxqwTZYTMY', configPda: '7JDvn8mkEousMqzasbDZazkq8EsRy42nB1Dxp74Kg3e6', artifactRevision: '01ae96e2542717438112c3244394e0d484210f34', artifactBytes: 397040, artifactSha256: '2c88fe80ff4488e4034fdf2a724822a8413d0242b09176ed1710648eb110aa22', cliVersion: 'v1.18.26', cliSha256: '1ef9999ed4bce11226170a312775c8b6439f54331ac4bf249957d587deda6852' };
function authorization(overrides = {}) { return JSON.stringify({ formatVersion: 2, nonce, createdAt: '2026-08-11T00:00:00.000Z', expiresAt: '2026-08-11T00:05:00.000Z', ...facts, runtimeManifestSha256: 'b'.repeat(64), reviewReportSha256: 'c'.repeat(64), observedProgramAbsent: true, observedConfigAbsent: true, authorization: 'one Devnet program deployment attempt only', exclusions: 'No launch initialization, collection creation, minting, claims, payments, uploads, authority changes, upgrades, mainnet, or other transactions.', ...overrides }); }
function attestation(overrides = {}) { return JSON.stringify({ formatVersion: 2, authorizationSha256, runtimeManifestSha256: 'b'.repeat(64), reviewReportSha256: 'c'.repeat(64), createdAt: '2026-08-11T00:00:00.000Z', expiresAt: '2026-08-11T00:05:00.000Z', ...facts, observedProgramAbsent: true, observedConfigAbsent: true, ...overrides }); }
function provenance(pathname, fingerprint, overrides = {}) { return Object.freeze({ pathname, isRegularFile: true, uid: 0, mode: 0o600, parentUid: 0, parentMode: 0o700, parentIsDirectory: true, fingerprint, runtimeManifestFingerprint: fingerprint, ...overrides }); }
function valid() { return { authorizationText: authorization(), attestationText: attestation(), approverPublicKey, reviewerPublicKey, approverSignature, reviewerSignature, approverProvenance: provenance('/root/cumzillaraptors-send-authorizations/approver.pub', approverFingerprint), reviewerProvenance: provenance('/root/cumzillaraptors-send-authorizations/reviewer.pub', reviewerFingerprint), now: '2026-08-11T00:01:00.000Z' }; }

test('approval bundle returns a frozen endpoint binding derived only from verified signed records', () => {
  const result = validateV2ApprovalBundle(valid());
  assert.deepEqual(result, {
    ok: true,
    nonce,
    authorizationSha256,
    endpointBinding: {
      authorizationSha256,
      rpcSha256: facts.rpcSha256,
      runtimeManifestSha256: 'b'.repeat(64),
      reviewReportSha256: 'c'.repeat(64),
    },
  });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.endpointBinding), true);
  assert.deepEqual(Object.keys(result), ['ok', 'nonce', 'authorizationSha256', 'endpointBinding']);
  assert.deepEqual(Object.keys(result.endpointBinding), ['authorizationSha256', 'rpcSha256', 'runtimeManifestSha256', 'reviewReportSha256']);
});

test('provenance fingerprints are calculated SHA-256 hashes of the supplied DER SPKIs', () => {
  const fingerprint = (publicKey) => createHash('sha256').update(createPublicKey(publicKey).export({ type: 'spki', format: 'der' })).digest('hex');
  assert.equal(fingerprint(approverPublicKey), approverFingerprint);
  assert.equal(fingerprint(reviewerPublicKey), reviewerFingerprint);
});

test('approval bundle fails closed before later validation for signatures, identities, provenance, canonicality, facts, and bindings', () => {
  const invalid = [
    { approverSignature: undefined }, { approverSignature: 'bad!' }, { reviewerSignature: approverSignature }, { approverPublicKey: reviewerPublicKey }, { reviewerProvenance: provenance('/tmp/reviewer.pub', reviewerFingerprint) }, { approverProvenance: provenance('/root/cumzillaraptors-send-authorizations/approver.pub', approverFingerprint, { uid: 1000 }) }, { reviewerProvenance: provenance('/root/cumzillaraptors-send-authorizations/reviewer.pub', reviewerFingerprint, { parentMode: 0o755 }) }, { reviewerProvenance: provenance('/root/cumzillaraptors-send-authorizations/reviewer.pub', 'e'.repeat(64)) }, { authorizationText: `${authorization()}\n` }, { authorizationText: authorization({ unknown: true }) }, { authorizationText: authorization({ programId: 'wrong' }) }, { authorizationText: authorization({ expiresAt: '2026-08-11T00:00:30.000Z' }) }, { attestationText: attestation({ authorizationSha256: 'e'.repeat(64) }) }, { attestationText: attestation({ expiresAt: '2026-08-11T00:00:30.000Z' }) }, { authorizationText: authorization({ observedProgramAbsent: false }) }, { attestationText: attestation({ observedConfigAbsent: false }) }, { approverPublicKey: 'private-key-shaped-value' },
  ];
  for (const overrides of invalid) { const result = validateV2ApprovalBundle({ ...valid(), ...overrides }); assert.deepEqual(result, Object.freeze({ ok: false, reason: 'invalid-input' })); assert.doesNotMatch(JSON.stringify(result), /root|authorization|private|rpc/); }
});


test('approval source can only hash and verify supplied public data, never acquire or create capability', async () => {
  const source = await readFile(new URL('../scripts/future-send-v2-approval.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /node:(?:fs|child_process|process|net|http|https|tls)|\b(?:sign|generateKeyPair|createPrivateKey|spawn|exec|fork|readFile|writeFile|fetch|Transaction|serialize|solana)\b/);
  assert.match(source, /createHash|createPublicKey|verify/);
});

// Only fixed public/SPKI-shaped strings and synthetic metadata appear here; no private key is present or generated.
