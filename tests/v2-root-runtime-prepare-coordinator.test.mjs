import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { V2_FIXED_FACTS, V2_PATHS } from '../scripts/future-send-v2-schema.mjs';
import { validatePrepareReport } from '../scripts/v2-root-runtime-prepare-contract.mjs';
import { coordinatePrepare } from '../scripts/v2-root-runtime-prepare-coordinator.mjs';

const DENY = Object.freeze({ ok: false, reason: 'invalid-input' });
const GUARANTEE = 'No deployment command was invoked. No transaction was signed or sent.';
const REVIEW_FIELDS = Object.freeze(['observedProgramAbsent', 'observedConfigAbsent', 'commitment']);
const REVIEW_TEXT = '{"observedProgramAbsent":true,"observedConfigAbsent":true,"commitment":"confirmed"}';
const REVIEW = Object.freeze(JSON.parse(REVIEW_TEXT));
const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');
const REQUIRED_DEPENDENCY_PATHS = Object.freeze([
  'package-lock.json',
  'package.json',
  'scripts/future-send-v2-schema.mjs',
  'scripts/v2-root-runtime-prepare-contract.mjs',
  'scripts/v2-root-runtime-prepare-coordinator.mjs',
  'scripts/v2-root-runtime-provenance.mjs',
]);
const RUNTIME_SOURCE_PATH = 'scripts/v2-root-runtime-provenance.mjs';

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}
function metadata(path, type = 'file', mode = 0o600, parentMode = 0o700) {
  return freezeDeep({ path, type, mode, uid: 0, parentType: 'directory', parentMode, parentUid: 0, isSymlink: false });
}
function makeNominalV2Provenance() {
  const dependencyEntries = Object.freeze(REQUIRED_DEPENDENCY_PATHS.map((path) => freezeDeep({
    path,
    sha256: sha256(`synthetic-v2-dependency-bytes:${path}\n`),
    metadata: metadata(`${V2_PATHS.runtimeRoot}/${path}`),
  })));
  const entry = (path) => dependencyEntries.find((candidate) => candidate.path === path);
  const dependencyText = `${dependencyEntries.map(({ path, sha256: digest }) => `${digest}  ${path}`).join('\n')}\n`;
  const endpointDigest = sha256('synthetic-public-rpc-endpoint-digest-only\n');
  const runtimeManifest = {
    formatVersion: 2,
    cluster: V2_FIXED_FACTS.cluster,
    runtimeRoot: V2_PATHS.runtimeRoot,
    runtimeSourceSha256: entry(RUNTIME_SOURCE_PATH).sha256,
    packageJsonSha256: entry('package.json').sha256,
    packageLockSha256: entry('package-lock.json').sha256,
    dependencyManifestSha256: sha256(dependencyText),
    artifactRevision: V2_FIXED_FACTS.artifactRevision,
    artifactBytes: V2_FIXED_FACTS.artifactBytes,
    artifactSha256: V2_FIXED_FACTS.artifactSha256,
    cliPath: V2_PATHS.cli,
    cliVersion: V2_FIXED_FACTS.cliVersion,
    cliSha256: V2_FIXED_FACTS.cliSha256,
    rpcEndpointSha256: endpointDigest,
    programId: V2_FIXED_FACTS.programId,
    configPda: V2_FIXED_FACTS.configPda,
    devnetGenesisHash: V2_FIXED_FACTS.devnetGenesisHash,
    commitment: V2_FIXED_FACTS.commitment,
  };
  const runtimeText = JSON.stringify(runtimeManifest);
  const paths = freezeDeep({
    runtimeRoot: metadata(V2_PATHS.runtimeRoot, 'directory', 0o700), runtimeManifest: metadata(V2_PATHS.runtimeManifest),
    dependencyManifest: metadata(V2_PATHS.dependencyManifest), endpointDigestManifest: metadata(V2_PATHS.endpointDigestManifest),
    endpoint: metadata(V2_PATHS.endpoint), artifact: metadata(V2_PATHS.artifact), artifactRevision: metadata(V2_PATHS.artifactRevision),
    cli: metadata(V2_PATHS.cli, 'file', 0o500), runtimeSource: entry(RUNTIME_SOURCE_PATH).metadata,
    packageJson: entry('package.json').metadata,
    packageLock: entry('package-lock.json').metadata, reservationRoot: metadata(V2_PATHS.reservationRoot, 'directory', 0o700),
    consumedRoot: metadata(V2_PATHS.consumedRoot, 'directory', 0o700),
  });
  return freezeDeep({
    paths,
    dependencyEntries,
    manifests: { dependencyText, runtimeText, dependencyManifestSha256: sha256(dependencyText), runtimeManifestSha256: sha256(runtimeText) },
    endpointDigestManifest: { text: `${endpointDigest}\n`, value: endpointDigest, metadata: paths.endpointDigestManifest },
    endpoint: { sha256: endpointDigest, metadata: paths.endpoint },
  });
}
const NOMINAL_PROVENANCE = makeNominalV2Provenance();
const EXPECTED_ADAPTER_KEYS = Object.freeze(['collectProvenance', 'readEndpointDigest', 'runUnsignedReview', 'sanitizeReport']);

function makeNominalPrepareAdapters(overrides = {}) {
  const calls = { collectProvenance: 0, readEndpointDigest: 0, runUnsignedReview: 0, sanitizeReport: 0, order: [] };
  const adapters = {
    collectProvenance() { calls.collectProvenance += 1; calls.order.push('collectProvenance'); return NOMINAL_PROVENANCE; },
    readEndpointDigest() { calls.readEndpointDigest += 1; calls.order.push('readEndpointDigest'); return NOMINAL_PROVENANCE.endpointDigestManifest.value; },
    runUnsignedReview() { calls.runUnsignedReview += 1; calls.order.push('runUnsignedReview'); return REVIEW_TEXT; },
    sanitizeReport() {
      calls.sanitizeReport += 1;
      calls.order.push('sanitizeReport');
      return Object.freeze({ runtimeManifestSha256: NOMINAL_PROVENANCE.manifests.runtimeManifestSha256, endpointOrigin: 'https://rpc.example.test' });
    },
    ...overrides,
  };
  return Object.freeze({ adapters: Object.freeze(adapters), calls });
}
function expectedCalls(overrides = {}) {
  return { collectProvenance: 0, readEndpointDigest: 0, runUnsignedReview: 0, sanitizeReport: 0, order: [], ...overrides };
}
function expectDeny(value) {
  assert.deepEqual(value, DENY);
  assert.equal(Object.isFrozen(value), true);
  assert.doesNotMatch(JSON.stringify(value), /secret|password|token|key|error|endpoint/i);
}

test('prepare-coordinator-emits-one-frozen-envelope-after-full-provenance-evaluation', () => {
  const { adapters, calls } = makeNominalPrepareAdapters();
  assert.deepEqual(REQUIRED_DEPENDENCY_PATHS, [
    'package-lock.json',
    'package.json',
    'scripts/future-send-v2-schema.mjs',
    'scripts/v2-root-runtime-prepare-contract.mjs',
    'scripts/v2-root-runtime-prepare-coordinator.mjs',
    'scripts/v2-root-runtime-provenance.mjs',
  ]);
  assert.equal(REQUIRED_DEPENDENCY_PATHS.some((path) => path.startsWith('tests/') || path.startsWith('node_modules/') || path === 'scripts/prepare-launcher.mjs'), false);
  assert.deepEqual(Object.keys(adapters), EXPECTED_ADAPTER_KEYS);
  assert.deepEqual(Object.keys(REVIEW), REVIEW_FIELDS);
  assert.equal(JSON.stringify(REVIEW), REVIEW_TEXT);
  for (const adapter of Object.values(adapters)) assert.equal(typeof adapter, 'function');
  const result = coordinatePrepare(['--prepare'], adapters);
  assert.deepEqual(result, Object.freeze({
    runtimeManifestSha256: NOMINAL_PROVENANCE.manifests.runtimeManifestSha256,
    endpointOrigin: 'https://rpc.example.test',
    review: REVIEW,
    prepareCompletion: Object.freeze({ mode: 'FRESH PRE-SIGN REVIEW COMPLETE', guarantee: GUARANTEE }),
  }));
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.prepareCompletion), true);
  assert.deepEqual(result.review, REVIEW);
  assert.equal(Object.isFrozen(result.review), true);
  const validated = validatePrepareReport(result);
  assert.deepEqual(validated, Object.freeze({ ok: true, value: result }));
  assert.equal(Object.isFrozen(validated), true);
  assert.deepEqual(calls, expectedCalls({ collectProvenance: 1, readEndpointDigest: 1, runUnsignedReview: 1, sanitizeReport: 1, order: EXPECTED_ADAPTER_KEYS }));
});

test('prepare-coordinator-evaluates-provenance-before-endpoint-or-review-adapters', () => {
  const invalidProvenance = freezeDeep({
    ...NOMINAL_PROVENANCE,
    manifests: { ...NOMINAL_PROVENANCE.manifests, runtimeManifestSha256: '0'.repeat(64) },
  });
  const { adapters, calls } = makeNominalPrepareAdapters({ collectProvenance: () => { calls.collectProvenance += 1; calls.order.push('collectProvenance'); return invalidProvenance; } });
  expectDeny(coordinatePrepare(['--prepare'], adapters));
  assert.deepEqual(calls, expectedCalls({ collectProvenance: 1, order: ['collectProvenance'] }));
});

test('prepare-coordinator-denies-a-mainnet-cluster-provenance-with-recomputed-runtime-text-sha-before-endpoint-review-or-sanitization', () => {
  const runtimeManifest = { ...JSON.parse(NOMINAL_PROVENANCE.manifests.runtimeText), cluster: 'mainnet-beta' };
  const runtimeText = JSON.stringify(runtimeManifest);
  const mainnetProvenance = freezeDeep({
    ...NOMINAL_PROVENANCE,
    manifests: {
      ...NOMINAL_PROVENANCE.manifests,
      runtimeText,
      runtimeManifestSha256: sha256(runtimeText),
    },
  });
  assert.deepEqual(Object.keys(runtimeManifest).slice(0, 3), ['formatVersion', 'cluster', 'runtimeRoot']);
  assert.equal(mainnetProvenance.manifests.runtimeManifestSha256, sha256(mainnetProvenance.manifests.runtimeText));
  assert.notEqual(mainnetProvenance.manifests.runtimeManifestSha256, NOMINAL_PROVENANCE.manifests.runtimeManifestSha256);
  const { adapters, calls } = makeNominalPrepareAdapters({
    collectProvenance() {
      calls.collectProvenance += 1;
      calls.order.push('collectProvenance');
      return mainnetProvenance;
    },
  });
  expectDeny(coordinatePrepare(['--prepare'], adapters));
  assert.deepEqual(calls, expectedCalls({ collectProvenance: 1, order: ['collectProvenance'] }));
});

test('prepare-coordinator-denies-a-syntactically-valid-endpoint-digest-that-does-not-match-provenance-before-review-or-sanitization', () => {
  const { adapters, calls } = makeNominalPrepareAdapters({
    readEndpointDigest() {
      calls.readEndpointDigest += 1;
      calls.order.push('readEndpointDigest');
      return '0'.repeat(64);
    },
  });
  expectDeny(coordinatePrepare(['--prepare'], adapters));
  assert.deepEqual(calls, expectedCalls({
    collectProvenance: 1,
    readEndpointDigest: 1,
    order: ['collectProvenance', 'readEndpointDigest'],
  }));
});

test('prepare-coordinator-denies-send-before-adapter-call', () => {
  const { adapters, calls } = makeNominalPrepareAdapters();
  for (const input of [['--send'], [], ['--prepare', '--send'], ['--prepare', '/tmp/value']]) {
    expectDeny(coordinatePrepare(input, adapters));
    assert.deepEqual(calls, expectedCalls());
  }
});

test('prepare-coordinator-requires-the-exact-frozen-four-function-adapter-shape-with-no-echo', () => {
  const forbidden = ['readKey', 'readAuthorization', 'stage', 'spawnCli', 'send', 'sign', 'serialize', 'network'];
  for (const name of forbidden) {
    const base = makeNominalPrepareAdapters();
    const adapters = freezeDeep({ ...base.adapters, [name]: () => 'secret-value' });
    expectDeny(coordinatePrepare(['--prepare'], adapters));
  }
  {
    const base = makeNominalPrepareAdapters();
    const adapters = freezeDeep({ ...base.adapters, extra: () => 'inert-value' });
    expectDeny(coordinatePrepare(['--prepare'], adapters));
  }
  for (const name of EXPECTED_ADAPTER_KEYS) {
    const base = makeNominalPrepareAdapters();
    const missing = { ...base.adapters };
    delete missing[name];
    expectDeny(coordinatePrepare(['--prepare'], freezeDeep(missing)));
    expectDeny(coordinatePrepare(['--prepare'], freezeDeep({ ...base.adapters, [name]: 'token=secret-value' })));
  }
  const unfrozen = { ...makeNominalPrepareAdapters().adapters };
  expectDeny(coordinatePrepare(['--prepare'], unfrozen));
});

test('prepare-coordinator-denies-malformed-or-concatenated-review-json', () => {
  for (const output of ['{', `${JSON.stringify(REVIEW)}${JSON.stringify(REVIEW)}`, JSON.stringify({ ...REVIEW, rawStdout: 'unexpected' })]) {
    const { adapters } = makeNominalPrepareAdapters({ runUnsignedReview: () => output });
    expectDeny(coordinatePrepare(['--prepare'], adapters));
  }
});

test('prepare-coordinator-denies-noncanonical-or-fact-changing-review-text-before-sanitization', () => {
  const invalidReviewTexts = [
    JSON.stringify(REVIEW, null, 2),
    '{"observedConfigAbsent":true,"observedProgramAbsent":true,"commitment":"confirmed"}',
    '{"observedProgramAbsent":true,"commitment":"confirmed"}',
    '{"observedProgramAbsent":false,"observedConfigAbsent":true,"commitment":"confirmed"}',
    '{"observedProgramAbsent":true,"observedConfigAbsent":true,"commitment":"processed"}',
  ];
  for (const output of invalidReviewTexts) {
    const { adapters, calls } = makeNominalPrepareAdapters({
      runUnsignedReview() {
        calls.runUnsignedReview += 1;
        calls.order.push('runUnsignedReview');
        return output;
      },
    });
    expectDeny(coordinatePrepare(['--prepare'], adapters));
    assert.deepEqual(calls, expectedCalls({
      collectProvenance: 1,
      readEndpointDigest: 1,
      runUnsignedReview: 1,
      order: ['collectProvenance', 'readEndpointDigest', 'runUnsignedReview'],
    }));
  }
});

test('prepare-coordinator-redacts-endpoint-error-text-and-arbitrary-unexpected-report-fields', () => {
  for (const replacement of [
    { readEndpointDigest: () => 'https://user:secret@rpc.example.test' },
    { runUnsignedReview: () => { throw new Error('token=secret-value'); } },
    { sanitizeReport: () => Object.freeze({ runtimeManifestSha256: '0'.repeat(64), endpointOrigin: 'https://user:secret@rpc.example.test' }) },
    { sanitizeReport: () => Object.freeze({ runtimeManifestSha256: NOMINAL_PROVENANCE.manifests.runtimeManifestSha256, endpointOrigin: 'https://rpc.example.test', extra: 'inert-value' }) },
  ]) {
    const { adapters } = makeNominalPrepareAdapters(replacement);
    expectDeny(coordinatePrepare(['--prepare'], adapters));
  }
});

test('prepare coordinator source imports and uses Task 1 and Task 2 before adapters with no forbidden capability', async () => {
  const source = await readFile(new URL('../scripts/v2-root-runtime-prepare-coordinator.mjs', import.meta.url), 'utf8');
  assert.match(source, /import[\s\S]*from ['"]\.\/v2-root-runtime-prepare-contract\.mjs['"]/);
  assert.match(source, /import\s*\{\s*evaluateV2RootRuntimeProvenance\s*\}\s*from ['"]\.\/v2-root-runtime-provenance\.mjs['"]/);
  const evaluateIndex = source.indexOf('evaluateV2RootRuntimeProvenance(');
  assert.ok(evaluateIndex >= 0);
  assert.ok(evaluateIndex < source.indexOf('readEndpointDigest('));
  assert.ok(evaluateIndex < source.indexOf('runUnsignedReview('));
  for (const name of EXPECTED_ADAPTER_KEYS) assert.match(source, new RegExp(`\\b${name}\\b`));
  assert.doesNotMatch(source, /(?:\b(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?|\bimport\s*\()\s*['"](?:node:)?(?:fs(?:\/promises)?|process|child_process|net|http|https|tls|dgram)['"]|(?:\bfrom\s*|\bimport\s*\()\s*['"]@solana(?:\/[^'"]*)?['"]|\b(?:readFile|readFileSync|writeFile|writeFileSync|appendFile|appendFileSync|mkdir|mkdirSync|rm|rmSync|unlink|unlinkSync|spawn|spawnSync|exec|execSync|execFile|execFileSync|fork|fetch|WebSocket|XMLHttpRequest|createPrivateKey|createSign|generateKeyPair|generateKeyPairSync|sign|serialize|sendTransaction|sendRawTransaction|sendAndConfirmTransaction)\s*\(|\bprocess\s*\.|\b(?:Bun\.spawn|Deno\.Command|execa)\s*\(/);
});

// Frozen fake adapters and Task 2-shaped synthetic provenance only: no authorization, keys, endpoint bytes, host I/O, network, CLI, signing, or transactions are exercised.
