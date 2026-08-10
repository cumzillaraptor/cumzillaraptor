import test from 'node:test';
import assert from 'node:assert/strict';

import { EXPECTED_FIXED_FACTS } from '../scripts/future-send-gate.mjs';
import { ROOT_RUNTIME_PATHS } from '../scripts/future-send-runtime-manifests.mjs';
import { REQUIRED_PATHS, evaluateRootRuntimeProvenance } from '../scripts/future-send-runtime-provenance.mjs';

function frozenMetadata(uid, mode, type) {
  return Object.freeze({ uid, mode, type, parentUid: 0, parentMode: 0o700 });
}
function runtimeText() {
  return JSON.stringify({
    formatVersion: 1, runtimeRoot: ROOT_RUNTIME_PATHS.runtimeRoot,
    runtimeSourceSha256: 'a'.repeat(64), dependencyManifestSha256: 'b'.repeat(64),
    artifactRevision: EXPECTED_FIXED_FACTS.artifactRevision, artifactBytes: EXPECTED_FIXED_FACTS.artifactBytes,
    artifactSha256: EXPECTED_FIXED_FACTS.artifactSha256, cliPath: ROOT_RUNTIME_PATHS.cli,
    cliVersion: EXPECTED_FIXED_FACTS.cliVersion, cliSha256: EXPECTED_FIXED_FACTS.cliSha256,
    rpcEndpointSha256: 'c'.repeat(64), programId: EXPECTED_FIXED_FACTS.programId,
    configPda: EXPECTED_FIXED_FACTS.configPda, devnetGenesisHash: EXPECTED_FIXED_FACTS.devnetGenesisHash,
    commitment: 'confirmed',
  });
}
function nominalInput(overrides = {}) {
  const paths = Object.fromEntries(REQUIRED_PATHS.map(([name, uid, mode, type]) => [name, {
    path: ROOT_RUNTIME_PATHS[name], metadata: frozenMetadata(uid, mode, type),
  }]));
  return {
    paths,
    manifests: {
      runtimeText: runtimeText(),
      dependencyText: `${'d'.repeat(64)}  node_modules/@solana/web3.js/index.js\n`,
    },
    ...overrides,
  };
}
function expectDeny(input, reason) {
  const result = evaluateRootRuntimeProvenance(input);
  assert.deepEqual(result, { ok: false, reason });
  assert.equal(Object.isFrozen(result), true);
}

test('provenance verifier requires every exact root-owned fixed path and stops no-send', () => {
  assert.equal(REQUIRED_PATHS.length, 12);
  expectDeny(nominalInput(), 'send-disabled-no-live-authorization');
});

test('provenance verifier denies before any later phase on missing, substituted, or weak path metadata', () => {
  const cases = [
    undefined,
    {},
    nominalInput({ paths: {} }),
    (() => { const x = nominalInput(); x.paths.cli.path = '/tmp/solana'; return x; })(),
    (() => { const x = nominalInput(); x.paths.programKeypair.metadata = frozenMetadata(0, 0o644, 'file'); return x; })(),
    (() => { const x = nominalInput(); x.paths.artifact.metadata = frozenMetadata(1000, 0o600, 'file'); return x; })(),
    (() => { const x = nominalInput(); x.paths.runtimeRoot.metadata = frozenMetadata(0, 0o700, 'file'); return x; })(),
  ];
  for (const input of cases) expectDeny(input, input === undefined || Object.keys(input).length === 0 ? 'invalid-input' : 'path-provenance-failure');
});

test('provenance verifier rejects malformed runtime and dependency manifests before any later phase', () => {
  expectDeny(nominalInput({ manifests: { runtimeText: '{', dependencyText: `${'d'.repeat(64)}  node_modules/a.js\n` } }), 'runtime-manifest-failure');
  expectDeny(nominalInput({ manifests: { runtimeText: runtimeText(), dependencyText: 'bad\n' } }), 'dependency-manifest-failure');
});

test('provenance verifier exports only the fixed no-send evaluator', async () => {
  assert.deepEqual(Object.keys(await import('../scripts/future-send-runtime-provenance.mjs')), [
    'REQUIRED_PATHS',
    'evaluateRootRuntimeProvenance',
  ]);
  const result = evaluateRootRuntimeProvenance(nominalInput());
  assert.equal('command' in result, false);
  assert.equal('args' in result, false);
  assert.equal('action' in result, false);
});

// Injected synthetic metadata/text only: no root paths, manifests, keys, RPC, CLI, transaction, signing, or send action is accessed.
