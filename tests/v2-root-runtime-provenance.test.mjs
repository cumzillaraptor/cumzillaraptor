import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { V2_FIXED_FACTS, V2_PATHS } from '../scripts/future-send-v2-schema.mjs';
import {
  RUNTIME_MANIFEST_FIELDS,
  evaluateV2RootRuntimeProvenance,
} from '../scripts/v2-root-runtime-provenance.mjs';

const DENY = Object.freeze({ ok: false, reason: 'invalid-input' });
const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');
const sha = (letter) => letter.repeat(64);
const REQUIRED_DEPENDENCY_PATHS = Object.freeze([
  'node_modules/example/index.js', 'package-lock.json', 'package.json', 'scripts/future-send-v2-schema.mjs',
  'scripts/prepare-launcher.mjs', 'scripts/v2-root-runtime-prepare-contract.mjs',
  'scripts/v2-root-runtime-prepare-coordinator.mjs', 'scripts/v2-root-runtime-provenance.mjs',
  'tests/v2-root-runtime-prepare-contract.test.mjs', 'tests/v2-root-runtime-prepare-coordinator.test.mjs',
  'tests/v2-root-runtime-provenance.test.mjs',
]);
const EXPECTED_FIELDS = Object.freeze([
  'formatVersion', 'cluster', 'runtimeRoot', 'runtimeSourceSha256', 'packageJsonSha256', 'packageLockSha256',
  'dependencyManifestSha256', 'artifactRevision', 'artifactBytes', 'artifactSha256', 'cliPath',
  'cliVersion', 'cliSha256', 'rpcEndpointSha256', 'programId', 'configPda', 'devnetGenesisHash', 'commitment',
]);

function freezeDeep(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}
function metadata(path, type = 'file', mode = 0o600, parentMode = 0o700, uid = 0, parentUid = 0, isSymlink = false) {
  return freezeDeep({ path, type, mode, uid, parentType: 'directory', parentMode, parentUid, isSymlink });
}
function dependencyEntry(path) {
  const syntheticBytes = `synthetic-v2-dependency-bytes:${path}\n`;
  return freezeDeep({ path, sha256: sha256(syntheticBytes), metadata: metadata(`${V2_PATHS.runtimeRoot}/${path}`) });
}
const FROZEN_DEPENDENCY_ENTRIES = Object.freeze(REQUIRED_DEPENDENCY_PATHS.map(dependencyEntry));
const dependencyTextFor = (entries) => `${entries.map(({ path, sha256: digest }) => `${digest}  ${path}`).join('\n')}\n`;
const entryFor = (entries, path) => entries.find((entry) => entry.path === path);

function makeRuntimeManifest(entries, endpointDigest) {
  return {
    formatVersion: 2,
    cluster: V2_FIXED_FACTS.cluster,
    runtimeRoot: V2_PATHS.runtimeRoot,
    runtimeSourceSha256: entryFor(entries, 'scripts/v2-root-runtime-provenance.mjs').sha256,
    packageJsonSha256: entryFor(entries, 'package.json').sha256,
    packageLockSha256: entryFor(entries, 'package-lock.json').sha256,
    dependencyManifestSha256: sha256(dependencyTextFor(entries)),
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
}
function rebindRuntime(manifests, runtimeText) {
  return freezeDeep({ ...manifests, runtimeText, runtimeManifestSha256: sha256(runtimeText) });
}
function serializeAndRebindCanonicalRuntime(manifests, runtime) {
  return rebindRuntime(manifests, JSON.stringify(runtime));
}
function makeNominalV2Provenance(overrides = {}) {
  const entries = FROZEN_DEPENDENCY_ENTRIES;
  const endpointDigest = sha256('synthetic-public-rpc-endpoint-digest-only\n');
  const dependencyText = dependencyTextFor(entries);
  const runtimeText = JSON.stringify(makeRuntimeManifest(entries, endpointDigest));
  const paths = freezeDeep({
    runtimeRoot: metadata(V2_PATHS.runtimeRoot, 'directory', 0o700),
    runtimeManifest: metadata(V2_PATHS.runtimeManifest),
    dependencyManifest: metadata(V2_PATHS.dependencyManifest),
    endpointDigestManifest: metadata(V2_PATHS.endpointDigestManifest),
    endpoint: metadata(V2_PATHS.endpoint),
    artifact: metadata(V2_PATHS.artifact),
    artifactRevision: metadata(V2_PATHS.artifactRevision),
    cli: metadata(V2_PATHS.cli, 'file', 0o500),
    runtimeSource: entryFor(entries, 'scripts/v2-root-runtime-provenance.mjs').metadata,
    packageJson: entryFor(entries, 'package.json').metadata,
    packageLock: entryFor(entries, 'package-lock.json').metadata,
    reservationRoot: metadata(V2_PATHS.reservationRoot, 'directory', 0o700),
    consumedRoot: metadata(V2_PATHS.consumedRoot, 'directory', 0o700),
  });
  return freezeDeep({
    paths,
    dependencyEntries: entries,
    manifests: freezeDeep({
      dependencyText,
      runtimeText,
      dependencyManifestSha256: sha256(dependencyText),
      runtimeManifestSha256: sha256(runtimeText),
    }),
    endpointDigestManifest: freezeDeep({ text: `${endpointDigest}\n`, value: endpointDigest, metadata: paths.endpointDigestManifest }),
    endpoint: freezeDeep({ sha256: endpointDigest, metadata: paths.endpoint }),
    ...overrides,
  });
}
function withRuntimeManifest(nominal, patch) {
  const runtime = { ...JSON.parse(nominal.manifests.runtimeText), ...patch };
  return freezeDeep({ ...nominal, manifests: serializeAndRebindCanonicalRuntime(nominal.manifests, runtime) });
}
function withDependencyText(nominal, dependencyText) {
  const dependencyManifestSha256 = sha256(dependencyText);
  const runtime = { ...JSON.parse(nominal.manifests.runtimeText), dependencyManifestSha256 };
  return freezeDeep({
    ...nominal,
    manifests: freezeDeep({
      ...serializeAndRebindCanonicalRuntime(nominal.manifests, runtime),
      dependencyText,
      dependencyManifestSha256,
    }),
  });
}
function withDependencyEntries(nominal, dependencyEntries) {
  const dependencyText = dependencyTextFor(dependencyEntries);
  return freezeDeep({ ...withDependencyText(nominal, dependencyText), dependencyEntries });
}
function withPathMetadata(nominal, name, patch) {
  const current = nominal.paths[name];
  const replacement = freezeDeep({ ...current, ...patch });
  const dependencyEntries = Object.freeze(nominal.dependencyEntries.map((entry) => entry.metadata === current
    ? freezeDeep({ ...entry, metadata: replacement }) : entry));
  const endpointDigestManifest = nominal.endpointDigestManifest.metadata === current
    ? freezeDeep({ ...nominal.endpointDigestManifest, metadata: replacement }) : nominal.endpointDigestManifest;
  const endpoint = nominal.endpoint.metadata === current
    ? freezeDeep({ ...nominal.endpoint, metadata: replacement }) : nominal.endpoint;
  return freezeDeep({
    ...nominal,
    paths: freezeDeep({ ...nominal.paths, [name]: replacement }),
    dependencyEntries,
    endpointDigestManifest,
    endpoint,
  });
}
function withDependencyMetadata(nominal, path, patch) {
  return freezeDeep({
    ...nominal,
    dependencyEntries: Object.freeze(nominal.dependencyEntries.map((entry) => entry.path === path
      ? freezeDeep({ ...entry, metadata: freezeDeep({ ...entry.metadata, ...patch }) }) : entry)),
  });
}
function expectDeny(input) {
  const result = evaluateV2RootRuntimeProvenance(input);
  assert.deepEqual(result, DENY);
  assert.equal(Object.isFrozen(result), true);
  assert.doesNotMatch(JSON.stringify(result), /root\/|endpoint|key|authorization|secret/i);
}

test('v2-provenance-accepts-exact-sealed-layout-and-hash-bound-manifests', () => {
  assert.deepEqual(RUNTIME_MANIFEST_FIELDS, EXPECTED_FIELDS);
  assert.deepEqual([...REQUIRED_DEPENDENCY_PATHS].sort(), REQUIRED_DEPENDENCY_PATHS);
  assert.equal(REQUIRED_DEPENDENCY_PATHS.includes('scripts/future-send-v2-schema.mjs'), true);
  assert.equal(REQUIRED_DEPENDENCY_PATHS.includes('scripts/future-send-v2-coordinator.mjs'), false);
  const nominal = makeNominalV2Provenance();
  assert.equal(nominal.manifests.dependencyManifestSha256, sha256(nominal.manifests.dependencyText));
  assert.equal(nominal.manifests.runtimeManifestSha256, sha256(nominal.manifests.runtimeText));
  assert.equal(nominal.endpointDigestManifest.text, `${nominal.endpointDigestManifest.value}\n`);
  assert.match(nominal.endpointDigestManifest.text, /^[0-9a-f]{64}\n$/);
  assert.equal(Object.isFrozen(nominal.dependencyEntries), true);
  for (const entry of nominal.dependencyEntries) {
    assert.equal(Object.isFrozen(entry), true);
    assert.equal(entry.metadata.path, `${V2_PATHS.runtimeRoot}/${entry.path}`);
  }
  assert.strictEqual(entryFor(nominal.dependencyEntries, 'package.json').metadata, nominal.paths.packageJson);
  assert.strictEqual(entryFor(nominal.dependencyEntries, 'package-lock.json').metadata, nominal.paths.packageLock);
  assert.strictEqual(entryFor(nominal.dependencyEntries, 'scripts/v2-root-runtime-provenance.mjs').metadata, nominal.paths.runtimeSource);
  const result = evaluateV2RootRuntimeProvenance(nominal);
  assert.equal(result.ok, true);
  assert.equal(Object.isFrozen(result), true);
  assert.deepEqual(Object.keys(result.value), ['runtimeManifestSha256', 'endpointOrigin']);
  assert.equal(Object.isFrozen(result.value), true);
});

test('v2-provenance-denies-dependency-manifest-malformation-duplicates-extra-entries-substituted-path-metadata-and-changed-digests', () => {
  const nominal = makeNominalV2Provenance();
  const first = nominal.dependencyEntries[0];
  const changedEntries = Object.freeze(nominal.dependencyEntries.map((entry) => entry.path === first.path
    ? freezeDeep({ ...entry, sha256: sha('0') }) : entry));
  const substitutedEntries = Object.freeze(nominal.dependencyEntries.map((entry) => entry.path === 'package.json'
    ? freezeDeep({ ...entry, path: 'package-substitute.json', metadata: metadata(`${V2_PATHS.runtimeRoot}/package-substitute.json`) })
    : entry));
  for (const input of [
    withDependencyText(nominal, nominal.manifests.dependencyText.replace('  ', ' ')),
    withDependencyText(nominal, `${nominal.manifests.dependencyText}${first.sha256}  ${first.path}\n`),
    withDependencyText(nominal, nominal.manifests.dependencyText.replace(/^.*package-lock\.json\n/m, '')),
    withDependencyEntries(nominal, Object.freeze([...nominal.dependencyEntries, dependencyEntry('scripts/extra-dependency.mjs')])),
    withDependencyEntries(nominal, substitutedEntries),
    freezeDeep({ ...nominal, dependencyEntries: changedEntries }),
  ]) expectDeny(input);
});

test('v2-provenance-denies-missing-or-mutated-schema-dependency-entry', () => {
  const nominal = makeNominalV2Provenance();
  const schemaPath = 'scripts/future-send-v2-schema.mjs';
  const schemaEntry = entryFor(nominal.dependencyEntries, schemaPath);
  assert.ok(schemaEntry);
  assert.equal(nominal.manifests.dependencyManifestSha256, sha256(nominal.manifests.dependencyText));
  assert.match(nominal.manifests.dependencyText, new RegExp(`^[0-9a-f]{64}  ${schemaPath.replace('.', '\\.')}\\n`, 'm'));
  const missingSchemaEntry = Object.freeze(nominal.dependencyEntries.filter((entry) => entry.path !== schemaPath));
  const changedSchemaDigest = Object.freeze(nominal.dependencyEntries.map((entry) => entry.path === schemaPath
    ? freezeDeep({ ...entry, sha256: sha('0') }) : entry));
  const changedSchemaMetadata = Object.freeze(nominal.dependencyEntries.map((entry) => entry.path === schemaPath
    ? freezeDeep({ ...entry, metadata: freezeDeep({ ...entry.metadata, mode: 0o644 }) }) : entry));
  for (const input of [
    withDependencyEntries(nominal, missingSchemaEntry),
    freezeDeep({ ...nominal, dependencyEntries: changedSchemaDigest }),
    freezeDeep({ ...nominal, dependencyEntries: changedSchemaMetadata }),
  ]) expectDeny(input);
});

test('v2-provenance-denies-runtime-manifest-reordering-noncanonical-and-malformed-text', () => {
  const nominal = makeNominalV2Provenance();
  const runtime = JSON.parse(nominal.manifests.runtimeText);
  const reordered = JSON.stringify({ runtimeRoot: runtime.runtimeRoot, formatVersion: runtime.formatVersion, ...runtime });
  for (const input of [
    freezeDeep({ ...nominal, manifests: rebindRuntime(nominal.manifests, reordered) }),
    freezeDeep({ ...nominal, manifests: rebindRuntime(nominal.manifests, JSON.stringify(runtime, null, 2)) }),
    freezeDeep({ ...nominal, manifests: rebindRuntime(nominal.manifests, nominal.manifests.runtimeText.slice(0, -1)) }),
  ]) expectDeny(input);
});

test('v2-provenance-denies-runtime-fixed-fact-and-manifest-binding-mismatches', () => {
  const nominal = makeNominalV2Provenance();
  const runtime = JSON.parse(nominal.manifests.runtimeText);
  assert.deepEqual(Object.keys(runtime), EXPECTED_FIELDS);
  const mutatedRuntimeFields = Object.freeze({
    formatVersion: 3,
    cluster: 'mainnet-beta',
    runtimeRoot: `${V2_PATHS.runtimeRoot}/../runtime-root-substitute`,
    runtimeSourceSha256: sha('0'),
    packageJsonSha256: sha('0'),
    packageLockSha256: sha('0'),
    dependencyManifestSha256: sha('0'),
    artifactRevision: '0'.repeat(40),
    artifactBytes: V2_FIXED_FACTS.artifactBytes + 1,
    artifactSha256: sha('0'),
    cliPath: `${V2_PATHS.cli}/../cli-substitute`,
    cliVersion: 'v0.0.0',
    cliSha256: sha('0'),
    rpcEndpointSha256: sha('0'),
    programId: `${V2_FIXED_FACTS.programId.slice(0, -1)}Z`,
    configPda: `${V2_FIXED_FACTS.configPda.slice(0, -1)}7`,
    devnetGenesisHash: sha('0'),
    commitment: 'processed',
  });
  assert.deepEqual(Object.keys(mutatedRuntimeFields), EXPECTED_FIELDS);
  for (const input of [
    freezeDeep({ ...nominal, manifests: { ...nominal.manifests, dependencyManifestSha256: sha('0') } }),
    freezeDeep({ ...nominal, manifests: { ...nominal.manifests, runtimeManifestSha256: sha('0') } }),
    ...Object.entries(mutatedRuntimeFields).map(([field, value]) => withRuntimeManifest(nominal, { [field]: value })),
  ]) expectDeny(input);
});

test('v2-provenance-denies-cluster-mutation-even-when-runtime-text-digest-is-recomputed', () => {
  const nominal = makeNominalV2Provenance();
  const mutated = withRuntimeManifest(nominal, { cluster: 'mainnet-beta' });
  assert.notEqual(mutated.manifests.runtimeText, nominal.manifests.runtimeText);
  assert.equal(mutated.manifests.runtimeManifestSha256, sha256(mutated.manifests.runtimeText));
  assert.notEqual(mutated.manifests.runtimeManifestSha256, nominal.manifests.runtimeManifestSha256);
  expectDeny(mutated);
});

test('v2-provenance-denies-endpoint-digest-manifest-malformation-mismatch-extra-content-and-endpoint-object-mismatch', () => {
  const nominal = makeNominalV2Provenance();
  for (const endpointDigestManifest of [
    freezeDeep({ ...nominal.endpointDigestManifest, text: `${nominal.endpointDigestManifest.value}` }),
    freezeDeep({ ...nominal.endpointDigestManifest, text: `${sha('0')}\n` }),
    freezeDeep({ ...nominal.endpointDigestManifest, text: `${nominal.endpointDigestManifest.value}\nextra` }),
    freezeDeep({ ...nominal.endpointDigestManifest, text: ` ${nominal.endpointDigestManifest.value}\n` }),
  ]) expectDeny(freezeDeep({ ...nominal, endpointDigestManifest }));
  expectDeny(freezeDeep({ ...nominal, endpoint: { ...nominal.endpoint, sha256: sha('0') } }));
});

test('v2-provenance-denies-wrong-owner-and-weak-or-writable-parent-metadata-across-paths', () => {
  const nominal = makeNominalV2Provenance();
  for (const input of [
    freezeDeep({ ...nominal, paths: { ...nominal.paths, runtimeManifest: metadata(V2_PATHS.runtimeManifest, 'file', 0o600, 0o700, 1000) } }),
    freezeDeep({ ...nominal, paths: { ...nominal.paths, dependencyManifest: metadata(V2_PATHS.dependencyManifest, 'file', 0o600, 0o777) } }),
    freezeDeep({ ...nominal, paths: { ...nominal.paths, artifact: metadata(V2_PATHS.artifact, 'file', 0o600, 0o770) } }),
    freezeDeep({ ...nominal, paths: { ...nominal.paths, cli: metadata(V2_PATHS.cli, 'file', 0o500, 0o700, 1000) } }),
    freezeDeep({ ...nominal, paths: { ...nominal.paths, packageJson: metadata(`${V2_PATHS.runtimeRoot}/package.json`, 'file', 0o600, 0o700, 0, 0, true) } }),
    freezeDeep({ ...nominal, endpoint: { ...nominal.endpoint, metadata: metadata(V2_PATHS.endpoint, 'file', 0o600, 0o777) } }),
    freezeDeep({ ...nominal, endpoint: { ...nominal.endpoint, metadata: metadata(V2_PATHS.endpoint, 'file', 0o644, 0o700, 0) } }),
  ]) expectDeny(input);
});

test('v2-provenance-denies-every-required-path-and-dependency-metadata-field-mutation', () => {
  const nominal = makeNominalV2Provenance();
  const metadataMutationPatches = (record) => Object.freeze([
    { path: `${record.path}/../metadata-path-substitute` },
    { type: 'invalid-metadata-type' },
    { mode: 0o777 },
    { uid: 1000 },
    { parentType: 'invalid-parent-metadata-type' },
    { parentMode: 0o777 },
    { parentUid: 1000 },
    { isSymlink: true },
  ]);
  for (const [name, record] of Object.entries(nominal.paths)) {
    const expectedMode = record.type === 'directory' ? 0o700 : name === 'cli' ? 0o500 : 0o600;
    assert.equal(record.mode, expectedMode);
    assert.equal(record.parentMode, 0o700);
    assert.equal(record.uid, 0);
    assert.equal(record.isSymlink, false);
    for (const patch of metadataMutationPatches(record)) {
      expectDeny(withPathMetadata(nominal, name, patch));
    }
  }
  for (const entry of nominal.dependencyEntries) {
    assert.equal(entry.metadata.type, 'file');
    assert.equal(entry.metadata.mode, 0o600);
    assert.equal(entry.metadata.parentMode, 0o700);
    assert.equal(entry.metadata.uid, 0);
    assert.equal(entry.metadata.isSymlink, false);
    for (const patch of metadataMutationPatches(entry.metadata)) {
      expectDeny(withDependencyMetadata(nominal, entry.path, patch));
    }
  }
});

test('v2 provenance source depends only on v2 schema and has no host, network, signing, transaction, or executable capability', async () => {
  const source = await readFile(new URL('../scripts/v2-root-runtime-provenance.mjs', import.meta.url), 'utf8');
  assert.match(source, /import\s*\{\s*V2_PATHS\s*,\s*V2_FIXED_FACTS\s*\}\s*from ['"]\.\/future-send-v2-schema\.mjs['"]/);
  assert.doesNotMatch(source, /(?:\b(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?|\bimport\s*\()\s*['"](?:node:)?(?:fs(?:\/promises)?|process|child_process|net|http|https|tls|dgram)['"]|(?:\bfrom\s*|\bimport\s*\()\s*['"]@solana(?:\/[^'"]*)?['"]|\b(?:readFile|readFileSync|writeFile|writeFileSync|appendFile|appendFileSync|mkdir|mkdirSync|rm|rmSync|unlink|unlinkSync|spawn|spawnSync|exec|execSync|execFile|execFileSync|fork|fetch|WebSocket|XMLHttpRequest|createPrivateKey|createSign|generateKeyPair|generateKeyPairSync|sign|serialize|sendTransaction|sendRawTransaction|sendAndConfirmTransaction)\s*\(|\bprocess\s*\.|\b(?:Bun\.spawn|Deno\.Command|execa)\s*\(/);
});

// Synthetic frozen metadata, digest facts, and text only: this test never opens candidate, endpoint bytes, key, artifact, or CLI paths.
