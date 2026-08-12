import { createHash } from 'node:crypto';
import { V2_PATHS, V2_FIXED_FACTS } from './future-send-v2-schema.mjs';

const deny = Object.freeze({ ok: false, reason: 'invalid-input' });

export const RUNTIME_MANIFEST_FIELDS = Object.freeze([
  'formatVersion', 'cluster', 'runtimeRoot', 'runtimeSourceSha256', 'packageJsonSha256',
  'packageLockSha256', 'dependencyManifestSha256', 'artifactRevision', 'artifactBytes',
  'artifactSha256', 'cliPath', 'cliVersion', 'cliSha256', 'rpcEndpointSha256', 'programId',
  'configPda', 'devnetGenesisHash', 'commitment',
]);

const DEPENDENCY_PATHS = Object.freeze([
  'node_modules/example/index.js', 'package-lock.json', 'package.json', 'scripts/future-send-v2-schema.mjs',
  'scripts/prepare-launcher.mjs', 'scripts/v2-root-runtime-prepare-contract.mjs',
  'scripts/v2-root-runtime-prepare-coordinator.mjs', 'scripts/v2-root-runtime-provenance.mjs',
  'tests/v2-root-runtime-prepare-contract.test.mjs', 'tests/v2-root-runtime-prepare-coordinator.test.mjs',
  'tests/v2-root-runtime-provenance.test.mjs',
]);

const PATH_FIELDS = Object.freeze([
  'runtimeRoot', 'runtimeManifest', 'dependencyManifest', 'endpointDigestManifest', 'endpoint',
  'artifact', 'artifactRevision', 'cli', 'runtimeSource', 'packageJson', 'packageLock',
  'reservationRoot', 'consumedRoot',
]);
const METADATA_FIELDS = Object.freeze([
  'path', 'type', 'mode', 'uid', 'parentType', 'parentMode', 'parentUid', 'isSymlink',
]);
const MANIFEST_FIELDS = Object.freeze([
  'dependencyText', 'runtimeText', 'dependencyManifestSha256', 'runtimeManifestSha256',
]);
const DEPENDENCY_ENTRY_FIELDS = Object.freeze(['path', 'sha256', 'metadata']);
const ENDPOINT_MANIFEST_FIELDS = Object.freeze(['text', 'value', 'metadata']);
const ENDPOINT_FIELDS = Object.freeze(['sha256', 'metadata']);
const INPUT_FIELDS = Object.freeze(['paths', 'dependencyEntries', 'manifests', 'endpointDigestManifest', 'endpoint']);
const DIGEST = /^[0-9a-f]{64}$/;

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function isExactObject(value, fields) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype || !Object.isFrozen(value)) return false;
  const keys = Object.keys(value);
  return keys.length === fields.length && keys.every((key, index) => key === fields[index]);
}

function isDeepFrozen(value, seen = new Set()) {
  if (value === null || typeof value !== 'object') return true;
  if (seen.has(value)) return true;
  if (!Object.isFrozen(value)) return false;
  seen.add(value);
  return Object.values(value).every((child) => isDeepFrozen(child, seen));
}

function hasDigest(value) {
  return typeof value === 'string' && DIGEST.test(value);
}

function validMetadata(value, path, type, mode) {
  return isExactObject(value, METADATA_FIELDS)
    && value.path === path
    && value.type === type
    && value.mode === mode
    && value.uid === 0
    && value.parentType === 'directory'
    && value.parentMode === 0o700
    && value.parentUid === 0
    && value.isSymlink === false;
}

function validPaths(paths) {
  if (!isExactObject(paths, PATH_FIELDS)) return false;
  const expected = {
    runtimeRoot: [V2_PATHS.runtimeRoot, 'directory', 0o700],
    runtimeManifest: [V2_PATHS.runtimeManifest, 'file', 0o600],
    dependencyManifest: [V2_PATHS.dependencyManifest, 'file', 0o600],
    endpointDigestManifest: [V2_PATHS.endpointDigestManifest, 'file', 0o600],
    endpoint: [V2_PATHS.endpoint, 'file', 0o600],
    artifact: [V2_PATHS.artifact, 'file', 0o600],
    artifactRevision: [V2_PATHS.artifactRevision, 'file', 0o600],
    cli: [V2_PATHS.cli, 'file', 0o500],
    runtimeSource: [`${V2_PATHS.runtimeRoot}/scripts/v2-root-runtime-provenance.mjs`, 'file', 0o600],
    packageJson: [`${V2_PATHS.runtimeRoot}/package.json`, 'file', 0o600],
    packageLock: [`${V2_PATHS.runtimeRoot}/package-lock.json`, 'file', 0o600],
    reservationRoot: [V2_PATHS.reservationRoot, 'directory', 0o700],
    consumedRoot: [V2_PATHS.consumedRoot, 'directory', 0o700],
  };
  return PATH_FIELDS.every((name) => validMetadata(paths[name], ...expected[name]));
}

function validDependencies(entries) {
  if (!Array.isArray(entries) || !Object.isFrozen(entries) || entries.length !== DEPENDENCY_PATHS.length) return false;
  return entries.every((entry, index) => isExactObject(entry, DEPENDENCY_ENTRY_FIELDS)
    && entry.path === DEPENDENCY_PATHS[index]
    && hasDigest(entry.sha256)
    && validMetadata(entry.metadata, `${V2_PATHS.runtimeRoot}/${entry.path}`, 'file', 0o600));
}

function parseCanonicalRuntime(text) {
  if (typeof text !== 'string') return null;
  let runtime;
  try {
    runtime = JSON.parse(text);
  } catch {
    return null;
  }
  if (runtime === null || Array.isArray(runtime) || Object.getPrototypeOf(runtime) !== Object.prototype) return null;
  const keys = Object.keys(runtime);
  if (keys.length !== RUNTIME_MANIFEST_FIELDS.length
    || keys.some((key, index) => key !== RUNTIME_MANIFEST_FIELDS[index])
    || JSON.stringify(runtime) !== text) return null;
  return runtime;
}

function validRuntime(runtime, entries, dependencyDigest, endpointDigest) {
  const byPath = new Map(entries.map((entry) => [entry.path, entry.sha256]));
  return runtime.formatVersion === 2
    && runtime.cluster === V2_FIXED_FACTS.cluster
    && runtime.runtimeRoot === V2_PATHS.runtimeRoot
    && runtime.runtimeSourceSha256 === byPath.get('scripts/v2-root-runtime-provenance.mjs')
    && runtime.packageJsonSha256 === byPath.get('package.json')
    && runtime.packageLockSha256 === byPath.get('package-lock.json')
    && runtime.dependencyManifestSha256 === dependencyDigest
    && runtime.artifactRevision === V2_FIXED_FACTS.artifactRevision
    && runtime.artifactBytes === V2_FIXED_FACTS.artifactBytes
    && runtime.artifactSha256 === V2_FIXED_FACTS.artifactSha256
    && runtime.cliPath === V2_PATHS.cli
    && runtime.cliVersion === V2_FIXED_FACTS.cliVersion
    && runtime.cliSha256 === V2_FIXED_FACTS.cliSha256
    && runtime.rpcEndpointSha256 === endpointDigest
    && runtime.programId === V2_FIXED_FACTS.programId
    && runtime.configPda === V2_FIXED_FACTS.configPda
    && runtime.devnetGenesisHash === V2_FIXED_FACTS.devnetGenesisHash
    && runtime.commitment === V2_FIXED_FACTS.commitment;
}

export function evaluateV2RootRuntimeProvenance(input) {
  try {
    if (!isExactObject(input, INPUT_FIELDS) || !isDeepFrozen(input) || !validPaths(input.paths)
      || !validDependencies(input.dependencyEntries) || !isExactObject(input.manifests, MANIFEST_FIELDS)
      || !isExactObject(input.endpointDigestManifest, ENDPOINT_MANIFEST_FIELDS)
      || !isExactObject(input.endpoint, ENDPOINT_FIELDS)) return deny;

    const { dependencyText, runtimeText, dependencyManifestSha256, runtimeManifestSha256 } = input.manifests;
    const dependencyTextExpected = `${input.dependencyEntries.map((entry) => `${entry.sha256}  ${entry.path}`).join('\n')}\n`;
    if (dependencyText !== dependencyTextExpected || !hasDigest(dependencyManifestSha256)
      || dependencyManifestSha256 !== sha256(dependencyText)) return deny;

    const { text: endpointText, value: endpointDigest, metadata: endpointManifestMetadata } = input.endpointDigestManifest;
    if (!hasDigest(endpointDigest) || endpointText !== `${endpointDigest}\n`
      || !validMetadata(endpointManifestMetadata, V2_PATHS.endpointDigestManifest, 'file', 0o600)
      || input.endpoint.sha256 !== endpointDigest
      || !validMetadata(input.endpoint.metadata, V2_PATHS.endpoint, 'file', 0o600)) return deny;

    if (!hasDigest(runtimeManifestSha256) || runtimeManifestSha256 !== sha256(runtimeText)) return deny;
    const runtime = parseCanonicalRuntime(runtimeText);
    if (!runtime || !validRuntime(runtime, input.dependencyEntries, dependencyManifestSha256, endpointDigest)) return deny;

    return Object.freeze({
      ok: true,
      value: Object.freeze({
        runtimeManifestSha256,
        endpointOrigin: Object.freeze({ endpointDigest, candidateRoot: V2_PATHS.runtimeRoot }),
      }),
    });
  } catch {
    return deny;
  }
}
