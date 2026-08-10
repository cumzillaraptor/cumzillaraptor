// Pure schema/policy module. It deliberately has no filesystem, process, network,
// key, transaction, signing, CLI-spawn, or send capability.
import { EXPECTED_FIXED_FACTS, canonicalizeRpcEndpoint } from './future-send-gate.mjs';

const HEX_256 = /^[a-f0-9]{64}$/;
const ROOT_RUNTIME_PATHS = Object.freeze({
  runtimeRoot: '/opt/cumzillaraptors-send-runtime-candidate-v2',
  runtimeManifest: '/opt/cumzillaraptors-send-runtime-candidate-v2/config/runtime-root-sha256.txt',
  dependencyManifest: '/opt/cumzillaraptors-send-runtime-candidate-v2/config/node-modules-sha256.txt',
  artifact: '/opt/cumzillaraptors-approved-artifact/cumzillaraptors.so',
  artifactRevision: '/opt/cumzillaraptors-approved-artifact/cumzillaraptors.build-revision',
  cli: '/opt/cumzillaraptors-solana-cli/v1.18.26/bin/solana',
  keyRoot: '/root/cumzillaraptors-deploy-keypairs',
  programKeypair: '/root/cumzillaraptors-deploy-keypairs/program.json',
  payerKeypair: '/root/cumzillaraptors-deploy-keypairs/payer.json',
  authorityKeypair: '/root/cumzillaraptors-deploy-keypairs/upgrade-authority.json',
  rpcEndpoint: '/root/cumzillaraptors-send-runtime-candidate-v2/config/rpc-endpoint',
  rpcEndpointDigest: '/opt/cumzillaraptors-send-runtime-candidate-v2/config/rpc-endpoint-sha256.txt',
});

const RUNTIME_MANIFEST_FIELDS = Object.freeze([
  'formatVersion', 'runtimeRoot', 'runtimeSourceSha256', 'dependencyManifestSha256',
  'artifactRevision', 'artifactBytes', 'artifactSha256', 'cliPath', 'cliVersion',
  'cliSha256', 'rpcEndpointSha256', 'programId', 'configPda', 'devnetGenesisHash', 'commitment',
]);

function isDigest(value) { return typeof value === 'string' && HEX_256.test(value); }
function isPlainRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}
function hasExactFields(record, fields) { return Object.keys(record).join('\0') === fields.join('\0'); }

function validateRuntimeManifestText(text) {
  if (typeof text !== 'string') return { ok: false };
  let record;
  try { record = JSON.parse(text); } catch { return { ok: false }; }
  if (!isPlainRecord(record) || JSON.stringify(record) !== text || !hasExactFields(record, RUNTIME_MANIFEST_FIELDS)) return { ok: false };
  if (record.formatVersion !== 1
    || record.runtimeRoot !== ROOT_RUNTIME_PATHS.runtimeRoot
    || !isDigest(record.runtimeSourceSha256)
    || !isDigest(record.dependencyManifestSha256)
    || record.artifactRevision !== EXPECTED_FIXED_FACTS.artifactRevision
    || record.artifactBytes !== EXPECTED_FIXED_FACTS.artifactBytes
    || record.artifactSha256 !== EXPECTED_FIXED_FACTS.artifactSha256
    || record.cliPath !== ROOT_RUNTIME_PATHS.cli
    || record.cliVersion !== EXPECTED_FIXED_FACTS.cliVersion
    || record.cliSha256 !== EXPECTED_FIXED_FACTS.cliSha256
    || !isDigest(record.rpcEndpointSha256)
    || record.programId !== EXPECTED_FIXED_FACTS.programId
    || record.configPda !== EXPECTED_FIXED_FACTS.configPda
    || record.devnetGenesisHash !== EXPECTED_FIXED_FACTS.devnetGenesisHash
    || record.commitment !== 'confirmed') return { ok: false };
  return { ok: true };
}

function validateDigestManifestText(text) {
  if (typeof text !== 'string' || text.length === 0 || !text.endsWith('\n')) return { ok: false };
  const entries = text.slice(0, -1).split('\n');
  if (entries.some((entry) => !/^[a-f0-9]{64}  [^\s].*$/.test(entry))) return { ok: false };
  const paths = entries.map((entry) => entry.slice(66));
  if (new Set(paths).size !== paths.length || [...paths].join('\0') !== [...paths].sort().join('\0')) return { ok: false };
  return { ok: true, count: entries.length };
}

function sanitizeRuntimeReport(report = {}) {
  if (!isPlainRecord(report)) return Object.freeze({ ok: false, reason: 'invalid-input' });
  let rpc;
  try { rpc = canonicalizeRpcEndpoint(report.rpcEndpoint); } catch { return Object.freeze({ ok: false, reason: 'invalid-input' }); }
  return Object.freeze({
    ok: true,
    rpcOrigin: rpc.origin,
    artifactRevision: EXPECTED_FIXED_FACTS.artifactRevision,
    artifactSha256: EXPECTED_FIXED_FACTS.artifactSha256,
    programId: EXPECTED_FIXED_FACTS.programId,
    configPda: EXPECTED_FIXED_FACTS.configPda,
  });
}

export { ROOT_RUNTIME_PATHS, RUNTIME_MANIFEST_FIELDS, sanitizeRuntimeReport, validateDigestManifestText, validateRuntimeManifestText };
