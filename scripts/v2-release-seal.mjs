const FORMAT_RECORD = 'format: cumzillaraptors-v2-release-seal-v1';
const REPOSITORY_RECORD = 'repository: cumzillaraptor/cumzillaraptor';

const FIXED_ALLOWLIST = Object.freeze([
  'node_modules/example/index.js',
  'package-lock.json',
  'package.json',
  'scripts/future-send-v2-schema.mjs',
  'scripts/prepare-launcher.mjs',
  'scripts/v2-root-runtime-prepare-contract.mjs',
  'scripts/v2-root-runtime-prepare-coordinator.mjs',
  'scripts/v2-root-runtime-provenance.mjs',
  'tests/v2-root-runtime-prepare-contract.test.mjs',
  'tests/v2-root-runtime-prepare-coordinator.test.mjs',
  'tests/v2-root-runtime-provenance.test.mjs',
]);

function fail(message) {
  throw new Error(`Invalid release seal: ${message}`);
}

function assertCanonicalRelativePath(path) {
  if (typeof path !== 'string' || path.length === 0) {
    fail('allowlist entries must be nonempty paths');
  }
  if (path.startsWith('/') || path.includes('\\') || path.includes('\0')) {
    fail(`allowlist path is not canonical: ${path}`);
  }
  const segments = path.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    fail(`allowlist path is not canonical: ${path}`);
  }
  if (/[^\x21-\x7e]/.test(path)) {
    fail(`allowlist path has invalid syntax: ${path}`);
  }
}

function assertSortedUniquePaths(paths) {
  for (let index = 1; index < paths.length; index += 1) {
    if (Buffer.compare(Buffer.from(paths[index - 1], 'utf8'), Buffer.from(paths[index], 'utf8')) >= 0) {
      fail('allowlist entries must be unique and sorted by UTF-8 byte order');
    }
  }
}

export function validateFullPinnedCommitId(commitId) {
  if (typeof commitId !== 'string' || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(commitId)) {
    fail('commit must be a full pinned commit id');
  }
  return commitId;
}

export function parseRelativeAllowlist(allowlistText) {
  if (typeof allowlistText !== 'string' || allowlistText.length === 0 || !allowlistText.endsWith('\n') || allowlistText.includes('\r')) {
    fail('allowlist must be nonempty LF-terminated text');
  }
  const paths = allowlistText.slice(0, -1).split('\n');
  for (const path of paths) {
    assertCanonicalRelativePath(path);
  }
  assertSortedUniquePaths(paths);
  return Object.freeze([...paths]);
}

export const validateRelativeAllowlist = parseRelativeAllowlist;

function assertExactAllowlist(actualPaths, requiredPaths) {
  if (actualPaths.length !== requiredPaths.length || actualPaths.some((path, index) => path !== requiredPaths[index])) {
    fail('allowlist has missing or extra entries');
  }
}

export function validateReleaseSealGrammar(sealText) {
  if (typeof sealText !== 'string' || sealText.length === 0 || !sealText.endsWith('\n') || sealText.includes('\r')) {
    fail('release seal must be LF-terminated text');
  }
  const lines = sealText.slice(0, -1).split('\n');
  if (lines.length < 4 || lines[0] !== FORMAT_RECORD || lines[1] !== REPOSITORY_RECORD) {
    fail('release seal header or record order is invalid');
  }
  const commitMatch = /^commit: (.+)$/.exec(lines[2]);
  if (!commitMatch) {
    fail('release seal commit record is invalid');
  }
  const commitId = validateFullPinnedCommitId(commitMatch[1]);
  const paths = [];
  for (const line of lines.slice(3)) {
    const match = /^entry: [0-9a-f]{64} ([^\x00-\x20]+)$/.exec(line);
    if (!match) {
      fail('release seal entry syntax is invalid');
    }
    assertCanonicalRelativePath(match[1]);
    paths.push(match[1]);
  }
  if (paths.length === 0) {
    fail('release seal must contain entries');
  }
  assertSortedUniquePaths(paths);
  assertExactAllowlist(paths, FIXED_ALLOWLIST);
  return Object.freeze({ commitId, paths: Object.freeze(paths) });
}

function assertRegularTreeEntry(entry, path) {
  if (!entry) {
    fail(`allowlist entry is absent at the pinned commit: ${path}`);
  }
  if (entry.type === 'tree') {
    fail(`allowlist entry is a directory: ${path}`);
  }
  if (entry.mode === '120000') {
    fail(`allowlist entry is a symlink: ${path}`);
  }
  if (entry.mode === '160000' || entry.type === 'commit') {
    fail(`allowlist entry is a submodule: ${path}`);
  }
  if (entry.type !== 'blob' || !/^100[0-7]{3}$/.test(entry.mode)) {
    fail(`allowlist entry is not a regular file: ${path}`);
  }
}

/**
 * objectDatabase must query an explicitly selected object database. This module
 * neither invokes Git nor obtains file contents.
 */
export async function inspectPinnedReleaseInput({ commitId, allowlistText, objectDatabase }) {
  const pinnedCommitId = validateFullPinnedCommitId(commitId);
  const paths = parseRelativeAllowlist(allowlistText);
  assertExactAllowlist(paths, FIXED_ALLOWLIST);

  if (!objectDatabase || typeof objectDatabase.resolveExactCommit !== 'function' || typeof objectDatabase.listTreeEntries !== 'function') {
    fail('object database inspection interface is required');
  }
  if (await objectDatabase.resolveExactCommit(pinnedCommitId) !== true) {
    fail('commit does not resolve to a commit object in the selected object database');
  }
  const treeEntries = await objectDatabase.listTreeEntries(pinnedCommitId);
  if (!Array.isArray(treeEntries)) {
    fail('object database returned invalid tree entries');
  }
  const entriesByPath = new Map(treeEntries.map((entry) => [entry.path, entry]));
  for (const path of paths) {
    assertRegularTreeEntry(entriesByPath.get(path), path);
  }
  return Object.freeze({ commitId: pinnedCommitId, paths: Object.freeze([...paths]) });
}

export function getProductionReleaseSealContract() {
  return Object.freeze({
    format: FORMAT_RECORD.slice('format: '.length),
    repository: REPOSITORY_RECORD.slice('repository: '.length),
    allowlist: FIXED_ALLOWLIST,
    status: 'task2b-pending',
  });
}
