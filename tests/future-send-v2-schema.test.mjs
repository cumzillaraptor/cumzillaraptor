import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import * as schema from '../scripts/future-send-v2-schema.mjs';

const AUTHORIZATION_FIELDS = ['formatVersion', 'nonce', 'createdAt', 'expiresAt', 'devnetGenesisHash', 'rpcSha256', 'commitment', 'programId', 'configPda', 'artifactRevision', 'artifactBytes', 'artifactSha256', 'cliVersion', 'cliSha256', 'runtimeManifestSha256', 'reviewReportSha256', 'observedProgramAbsent', 'observedConfigAbsent', 'authorization', 'exclusions'];
const ATTESTATION_FIELDS = ['formatVersion', 'authorizationSha256', 'runtimeManifestSha256', 'reviewReportSha256', 'createdAt', 'expiresAt', 'devnetGenesisHash', 'rpcSha256', 'commitment', 'programId', 'configPda', 'artifactRevision', 'artifactBytes', 'artifactSha256', 'cliVersion', 'cliSha256', 'observedProgramAbsent', 'observedConfigAbsent'];
const STARTED_FIELDS = ['formatVersion', 'nonce', 'authorizationSha256', 'runtimeManifestSha256', 'createdAt', 'state', 'stagedCli', 'stagedPayer', 'stagedProgram', 'stagedUpgradeAuthority', 'stagedArtifact'];
const TERMINAL_FIELDS = ['formatVersion', 'nonce', 'authorizationSha256', 'startedSha256', 'completedAt', 'state', 'exitClass'];

function authorization() {
  return {
    formatVersion: 2, nonce: 'A'.repeat(43), createdAt: '2026-08-11T00:00:00.000Z', expiresAt: '2026-08-11T00:05:00.000Z',
    devnetGenesisHash: 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG', rpcSha256: 'a'.repeat(64), commitment: 'confirmed',
    programId: 'AYE4iC2gp81H8jvMjk4EGxWP2sJFzuDptUwxqwTZYTMY', configPda: '7JDvn8mkEousMqzasbDZazkq8EsRy42nB1Dxp74Kg3e6',
    artifactRevision: '01ae96e2542717438112c3244394e0d484210f34', artifactBytes: 397040, artifactSha256: '2c88fe80ff4488e4034fdf2a724822a8413d0242b09176ed1710648eb110aa22',
    cliVersion: 'v1.18.26', cliSha256: '1ef9999ed4bce11226170a312775c8b6439f54331ac4bf249957d587deda6852', runtimeManifestSha256: 'b'.repeat(64), reviewReportSha256: 'c'.repeat(64), observedProgramAbsent: true, observedConfigAbsent: true,
    authorization: 'one Devnet program deployment attempt only', exclusions: 'No launch initialization, collection creation, minting, claims, payments, uploads, authority changes, upgrades, mainnet, or other transactions.',
  };
}

test('v2 schema exports deeply frozen exact paths, reviewed fixed facts, and ordered fields', () => {
  assert.deepEqual(schema.V2_PATHS, {
    runtimeRoot: '/opt/cumzillaraptors-send-runtime-candidate-v2', runtimeManifest: '/opt/cumzillaraptors-send-runtime-candidate-v2/config/runtime-root-sha256.txt', dependencyManifest: '/opt/cumzillaraptors-send-runtime-candidate-v2/config/node-modules-sha256.txt', endpointDigestManifest: '/opt/cumzillaraptors-send-runtime-candidate-v2/config/rpc-endpoint-sha256.txt', endpoint: '/root/cumzillaraptors-send-runtime-candidate-v2/config/rpc-endpoint', artifact: '/opt/cumzillaraptors-approved-artifact/cumzillaraptors.so', artifactRevision: '/opt/cumzillaraptors-approved-artifact/cumzillaraptors.build-revision', cli: '/opt/cumzillaraptors-solana-cli/v1.18.26/bin/solana', keyRoot: '/root/cumzillaraptors-deploy-keypairs', authorizationRoot: '/root/cumzillaraptors-send-authorizations', reservationRoot: '/root/cumzillaraptors-send-authorizations/reservations', consumedRoot: '/root/cumzillaraptors-send-authorizations/consumed',
  });
  assert.deepEqual(schema.V2_FIXED_FACTS, { cluster: 'devnet', devnetGenesisHash: 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG', programId: 'AYE4iC2gp81H8jvMjk4EGxWP2sJFzuDptUwxqwTZYTMY', configPda: '7JDvn8mkEousMqzasbDZazkq8EsRy42nB1Dxp74Kg3e6', artifactRevision: '01ae96e2542717438112c3244394e0d484210f34', artifactBytes: 397040, artifactSha256: '2c88fe80ff4488e4034fdf2a724822a8413d0242b09176ed1710648eb110aa22', cliVersion: 'v1.18.26', cliSha256: '1ef9999ed4bce11226170a312775c8b6439f54331ac4bf249957d587deda6852', commitment: 'confirmed' });
  for (const value of [schema.V2_PATHS, schema.V2_FIXED_FACTS, schema.AUTHORIZATION_FIELDS, schema.ATTESTATION_FIELDS, schema.STARTED_FIELDS, schema.TERMINAL_FIELDS]) assert.equal(Object.isFrozen(value), true);
  assert.deepEqual(schema.AUTHORIZATION_FIELDS, AUTHORIZATION_FIELDS); assert.deepEqual(schema.ATTESTATION_FIELDS, ATTESTATION_FIELDS); assert.deepEqual(schema.STARTED_FIELDS, STARTED_FIELDS); assert.deepEqual(schema.TERMINAL_FIELDS, TERMINAL_FIELDS);
  assert.throws(() => { schema.V2_PATHS.runtimeRoot = '/tmp/wrong'; }, TypeError);
});

test('canonical parser accepts only exact ordered canonical NFC plain JSON and non-echoing denial', () => {
  const value = authorization();
  const text = JSON.stringify(value);
  const accepted = schema.parseCanonicalObject(text, AUTHORIZATION_FIELDS);
  assert.deepEqual(accepted, { ok: true, value }); assert.equal(Object.isFrozen(accepted), true); assert.equal(Object.isFrozen(accepted.value), true);
  assert.throws(() => { accepted.value.nonce = 'wrong'; }, TypeError);
  const reordered = { ...authorization() }; const first = reordered.formatVersion; delete reordered.formatVersion; reordered.formatVersion = first;
  const duplicatedKey = text.replace('"formatVersion":2,', '"formatVersion":2,"formatVersion":2,');
  for (const candidate of ['{', `${text}\n`, duplicatedKey, JSON.stringify({ ...authorization(), unknown: true }), JSON.stringify(Object.fromEntries(AUTHORIZATION_FIELDS.slice(1).map((key) => [key, authorization()[key]]))), JSON.stringify(reordered), text.replace('Devnet', 'De\u0301vnet')]) {
    const result = schema.parseCanonicalObject(candidate, AUTHORIZATION_FIELDS);
    assert.deepEqual(result, { ok: false, reason: 'invalid-input' }); assert.equal(Object.isFrozen(result), true); assert.doesNotMatch(JSON.stringify(result), /unknown|Devnet/);
  }
  assert.deepEqual(schema.parseCanonicalObject(JSON.stringify({ formatVersion: 1, nonce: 'legacy' }), AUTHORIZATION_FIELDS), { ok: false, reason: 'invalid-input' });
});

test('v2 authorization parser denies a complete canonical legacy-v1 authorization record', () => {
  const legacyV1Authorization = {
    formatVersion: 1,
    nonce: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ',
    createdAt: '2026-08-01T00:00:00.000Z',
    expiresAt: '2026-08-01T00:05:00.000Z',
    devnetGenesisHash: 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG',
    rpcSha256: 'a'.repeat(64),
    commitment: 'confirmed',
    programId: 'AYE4iC2gp81H8jvMjk4EGxWP2sJFzuDptUwxqwTZYTMY',
    configPda: '7JDvn8mkEousMqzasbDZazkq8EsRy42nB1Dxp74Kg3e6',
    artifactRevision: '01ae96e2542717438112c3244394e0d484210f34',
    artifactBytes: 397040,
    artifactSha256: '2c88fe80ff4488e4034fdf2a724822a8413d0242b09176ed1710648eb110aa22',
    cliVersion: 'v1.18.26',
    cliSha256: '1ef9999ed4bce11226170a312775c8b6439f54331ac4bf249957d587deda6852',
    runtimeManifestSha256: 'b'.repeat(64),
    reviewReportSha256: 'c'.repeat(64),
    observedProgramAbsent: true,
    observedConfigAbsent: true,
    authorization: 'one Devnet program deployment attempt only',
    exclusions: 'No launch initialization, collection creation, minting, claims, payments, uploads, authority changes, upgrades, mainnet, or other transactions.',
  };

  assert.deepEqual(
    schema.parseCanonicalObject(JSON.stringify(legacyV1Authorization), schema.AUTHORIZATION_FIELDS),
    { ok: false, reason: 'invalid-input' },
  );
});

test('schema executable source has no host, key, transaction, signing, RPC, CLI, or serialization capability', async () => {
  const source = await readFile(new URL('../scripts/future-send-v2-schema.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /node:(?:fs|child_process|process|net|http|https|tls)|\b(?:readFile|writeFile|spawn|exec|fork|fetch|sign|generateKeyPair|createPrivateKey|solana|Transaction|serialize)\b/);
});

// String paths are fixtures only; this suite never opens paths, keys, endpoints, or a CLI.
