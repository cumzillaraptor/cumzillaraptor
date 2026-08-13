import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { V2_FIXED_FACTS, V2_PATHS } from '../scripts/future-send-v2-schema.mjs';
import { validatePrepareReport } from '../scripts/v2-root-runtime-prepare-contract.mjs';
import { coordinatePrepare } from '../scripts/v2-root-runtime-prepare-coordinator.mjs';

const DENY = Object.freeze({ ok: false, reason: 'invalid-input' });
const GUARANTEE = 'No deployment command was invoked. No transaction was signed or sent.';
const DEPENDENCY_PATHS = Object.freeze([
  'package-lock.json', 'package.json', 'scripts/future-send-v2-schema.mjs',
  'scripts/v2-root-runtime-prepare-contract.mjs', 'scripts/v2-root-runtime-prepare-coordinator.mjs',
  'scripts/v2-root-runtime-provenance.mjs',
]);
const RUNTIME_FIELDS = Object.freeze([
  'formatVersion', 'cluster', 'runtimeRoot', 'runtimeSourceSha256', 'packageJsonSha256', 'packageLockSha256',
  'dependencyManifestSha256', 'artifactRevision', 'artifactBytes', 'artifactSha256', 'cliPath', 'cliVersion',
  'cliSha256', 'rpcEndpointSha256', 'programId', 'configPda', 'devnetGenesisHash', 'commitment',
]);
const REVIEW_TEXT = '{"observedProgramAbsent":true,"observedConfigAbsent":true,"commitment":"confirmed"}';
const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

function freezeDeep(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

function metadata(path, type = 'file', mode = 0o600) {
  return freezeDeep({ path, type, mode, uid: 0, parentType: 'directory', parentMode: 0o700, parentUid: 0, isSymlink: false });
}

function makeProvenance({ cluster = V2_FIXED_FACTS.cluster } = {}) {
  const dependencyEntries = Object.freeze(DEPENDENCY_PATHS.map((path) => freezeDeep({
    path,
    sha256: sha256(`phase-a-synthetic-dependency:${path}\n`),
    metadata: metadata(`${V2_PATHS.runtimeRoot}/${path}`),
  })));
  const entry = (path) => dependencyEntries.find((candidate) => candidate.path === path);
  const dependencyText = `${dependencyEntries.map(({ path, sha256: digest }) => `${digest}  ${path}`).join('\n')}\n`;
  const endpointDigest = sha256('phase-a-synthetic-public-endpoint-digest-only\n');
  const runtime = {
    formatVersion: 2,
    cluster,
    runtimeRoot: V2_PATHS.runtimeRoot,
    runtimeSourceSha256: entry('scripts/v2-root-runtime-provenance.mjs').sha256,
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
  const runtimeText = JSON.stringify(runtime);
  const paths = freezeDeep({
    runtimeRoot: metadata(V2_PATHS.runtimeRoot, 'directory', 0o700),
    runtimeManifest: metadata(V2_PATHS.runtimeManifest), dependencyManifest: metadata(V2_PATHS.dependencyManifest),
    endpointDigestManifest: metadata(V2_PATHS.endpointDigestManifest), endpoint: metadata(V2_PATHS.endpoint),
    artifact: metadata(V2_PATHS.artifact), artifactRevision: metadata(V2_PATHS.artifactRevision),
    cli: metadata(V2_PATHS.cli, 'file', 0o500), runtimeSource: entry('scripts/v2-root-runtime-provenance.mjs').metadata,
    packageJson: entry('package.json').metadata, packageLock: entry('package-lock.json').metadata,
    reservationRoot: metadata(V2_PATHS.reservationRoot, 'directory', 0o700), consumedRoot: metadata(V2_PATHS.consumedRoot, 'directory', 0o700),
  });
  return freezeDeep({
    paths,
    dependencyEntries,
    manifests: { dependencyText, runtimeText, dependencyManifestSha256: sha256(dependencyText), runtimeManifestSha256: sha256(runtimeText) },
    endpointDigestManifest: { text: `${endpointDigest}\n`, value: endpointDigest, metadata: paths.endpointDigestManifest },
    endpoint: { sha256: endpointDigest, metadata: paths.endpoint },
  });
}

function makeAdapters(provenance = makeProvenance(), overrides = {}) {
  const calls = { collect: 0, endpoint: 0, review: 0, sanitize: 0, order: [] };
  const adapters = {
    collectProvenance() { calls.collect += 1; calls.order.push('collect'); return provenance; },
    readEndpointDigest() { calls.endpoint += 1; calls.order.push('endpoint'); return provenance.endpointDigestManifest.value; },
    runUnsignedReview() { calls.review += 1; calls.order.push('review'); return REVIEW_TEXT; },
    sanitizeReport() {
      calls.sanitize += 1;
      calls.order.push('sanitize');
      return Object.freeze({ runtimeManifestSha256: provenance.manifests.runtimeManifestSha256, endpointOrigin: 'https://rpc.phase-a.example.test' });
    },
    ...overrides,
  };
  return { adapters: Object.freeze(adapters), calls };
}

function assertCalls(calls, expected) {
  assert.deepEqual(calls, { collect: 0, endpoint: 0, review: 0, sanitize: 0, order: [], ...expected });
}

function assertDeepFrozen(value, seen = new Set()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return;
  assert.equal(Object.isFrozen(value), true);
  seen.add(value);
  for (const child of Object.values(value)) assertDeepFrozen(child, seen);
}

test('Phase A Tasks 1-3 compose a fully frozen, redacted prepare report from an exact synthetic six-dependency/18-field runtime manifest', () => {
  const provenance = makeProvenance();
  const { adapters, calls } = makeAdapters(provenance);
  assert.equal(provenance.dependencyEntries.length, 6);
  assert.deepEqual(Object.keys(JSON.parse(provenance.manifests.runtimeText)), RUNTIME_FIELDS);
  const result = coordinatePrepare(['--prepare'], adapters);
  assert.deepEqual(validatePrepareReport(result), Object.freeze({ ok: true, value: result }));
  assert.deepEqual(result, Object.freeze({
    runtimeManifestSha256: provenance.manifests.runtimeManifestSha256,
    endpointOrigin: 'https://rpc.phase-a.example.test',
    review: Object.freeze(JSON.parse(REVIEW_TEXT)),
    prepareCompletion: Object.freeze({ mode: 'FRESH PRE-SIGN REVIEW COMPLETE', guarantee: GUARANTEE }),
  }));
  assertDeepFrozen(result);
  assert.doesNotMatch(JSON.stringify(result), /(?:key|secret|password|token|artifact|cli|path|signature|rawTransaction)/i);
  assertCalls(calls, { collect: 1, endpoint: 1, review: 1, sanitize: 1, order: ['collect', 'endpoint', 'review', 'sanitize'] });
});

test('Phase A composition rejects invalid send input before every adapter', () => {
  const { adapters, calls } = makeAdapters();
  assert.deepEqual(coordinatePrepare(['--send'], adapters), DENY);
  assertCalls(calls, {});
});

test('Phase A composition rejects a rehashed mainnet runtime manifest before endpoint, review, or sanitization', () => {
  const provenance = makeProvenance({ cluster: 'mainnet-beta' });
  const { adapters, calls } = makeAdapters(provenance);
  assert.equal(provenance.manifests.runtimeManifestSha256, sha256(provenance.manifests.runtimeText));
  assert.deepEqual(coordinatePrepare(['--prepare'], adapters), DENY);
  assertCalls(calls, { collect: 1, order: ['collect'] });
});

test('Phase A composition rejects a wrong valid endpoint digest before review or sanitization', () => {
  const provenance = makeProvenance();
  const { adapters, calls } = makeAdapters(provenance, {
    readEndpointDigest() { calls.endpoint += 1; calls.order.push('endpoint'); return '0'.repeat(64); },
  });
  assert.deepEqual(coordinatePrepare(['--prepare'], adapters), DENY);
  assertCalls(calls, { collect: 1, endpoint: 1, order: ['collect', 'endpoint'] });
});

test('Phase A composition rejects malformed or reordered review JSON before sanitization', () => {
  for (const reviewText of ['{', '{"observedConfigAbsent":true,"observedProgramAbsent":true,"commitment":"confirmed"}']) {
    const provenance = makeProvenance();
    const { adapters, calls } = makeAdapters(provenance, {
      runUnsignedReview() { calls.review += 1; calls.order.push('review'); return reviewText; },
    });
    assert.deepEqual(coordinatePrepare(['--prepare'], adapters), DENY);
    assertCalls(calls, { collect: 1, endpoint: 1, review: 1, order: ['collect', 'endpoint', 'review'] });
  }
});

test('Phase A sources are pure and do not import legacy future-send runtime or approval modules', async () => {
  const phaseASources = await Promise.all([
    'v2-root-runtime-prepare-contract.mjs', 'v2-root-runtime-provenance.mjs', 'v2-root-runtime-prepare-coordinator.mjs',
  ].map((name) => readFile(new URL(`../scripts/${name}`, import.meta.url), 'utf8')));
  const forbiddenCapability = /(?:\b(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?|\bimport\s*\()\s*['"](?:node:)?(?:fs(?:\/promises)?|process|child_process|net|http|https|tls|dgram)['"]|(?:\bfrom\s*|\bimport\s*\()\s*['"]@solana(?:\/[^'"]*)?['"]|\b(?:readFile|readFileSync|writeFile|writeFileSync|appendFile|appendFileSync|mkdir|mkdirSync|rm|rmSync|unlink|unlinkSync|spawn|spawnSync|exec|execSync|execFile|execFileSync|fork|fetch|WebSocket|XMLHttpRequest|createPrivateKey|createSign|generateKeyPair|generateKeyPairSync|sign|serialize|sendTransaction|sendRawTransaction|sendAndConfirmTransaction)\s*\(|\bprocess\s*\.|\b(?:Bun\.spawn|Deno\.Command|execa)\s*\(/;
  const forbiddenImports = /(?:from\s*|import\s*\()['"][^'"]*(?:future-send-runtime|future-send-v2-approval|future-send-v2-cli-contract)[^'"]*['"]/;
  for (const source of phaseASources) {
    assert.doesNotMatch(source, forbiddenCapability);
    assert.doesNotMatch(source, forbiddenImports);
  }
});

test('repository deployment executor source rejects send and has no Solana deploy CLI spawn path', async () => {
  const source = await readFile(new URL('../scripts/execute-devnet-deployment.mjs', import.meta.url), 'utf8');
  assert.match(source, /else if \(argument === '--send'\) usageError\('Refusing: send mode is unavailable in repository source\./);
  assert.doesNotMatch(source, /\bsolana\s+(?:program\s+)?deploy\b/i);
  assert.doesNotMatch(source, /spawn(?:Sync)?\s*\([^\n]*['"]solana['"]/i);
});

// All provenance is fixed, synthetic, and frozen in this test; it reads no protected runtime paths and performs no host, RPC, CLI, signing, or transaction action.
