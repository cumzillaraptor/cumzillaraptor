import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// Expected Task4 API: the model takes exactly one untrusted synthetic snapshot.
// It owns the canonical immutable manifest internally; there is no manifest argument,
// and any snapshot.manifest property is non-authoritative caller data.
import {
  CANDIDATE_ROOT,
  modelCandidateInstall,
} from '../scripts/cumzinstall-v2-root-runtime-candidate-harness.mjs';

const ROOT = '/opt/cumzillaraptors-send-runtime-candidate-v2';
const SOURCE_ROOT = '/home/raspberrypi/workspace-cumzillaraptor';
const DENIAL = Object.freeze({ ok: false, reason: 'invalid-input' });
const REQUIRED = Object.freeze([
  'package.json',
  'package-lock.json',
  'node_modules/example/index.js',
  'scripts/future-send-v2-schema.mjs',
  'scripts/prepare-launcher.mjs',
  'scripts/v2-root-runtime-prepare-contract.mjs',
  'scripts/v2-root-runtime-provenance.mjs',
  'scripts/v2-root-runtime-prepare-coordinator.mjs',
  'tests/v2-root-runtime-prepare-contract.test.mjs',
  'tests/v2-root-runtime-prepare-coordinator.test.mjs',
  'tests/v2-root-runtime-provenance.test.mjs',
]);

function frozen(value) {
  return Object.freeze(value);
}

const DESTINATION_PARENT = frozen({ device: 91, inode: 4102 });

function ancestor(path, identity = undefined) {
  return frozen({
    path,
    type: 'directory',
    isSymlink: false,
    uid: 0,
    mode: 0o755,
    descriptorPinned: true,
    noFollow: true,
    ...(identity ? { identity } : {}),
  });
}

function chain(label, parent = undefined) {
  const paths = {
    source: ['/', '/home', '/home/raspberrypi'],
    stage: ['/', '/synthetic'],
    destination: ['/', '/opt'],
    temporary: ['/', '/opt'],
    rename: ['/', '/opt'],
  }[label];
  return frozen(paths.map((path, index) => ancestor(path, index === paths.length - 1 ? parent : undefined)));
}

function validParent() {
  return DESTINATION_PARENT;
}

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function canonicalSyntheticSource(path) {
  return `cumzinstall-v2-root-runtime-candidate-fixture-v1\nlabel: sealed-runtime-source\npath: ${path}\ntype: file\n`;
}

const EXPECTED_SOURCE_DIGESTS = frozen(Object.fromEntries(REQUIRED.map((path) => [path, sha256(canonicalSyntheticSource(path))])));
const PACKAGE_SEAL = frozen({
  packageJsonSha256: EXPECTED_SOURCE_DIGESTS['package.json'],
  packageLockSha256: EXPECTED_SOURCE_DIGESTS['package-lock.json'],
  dependencyTreeSha256: sha256(`cumzinstall-v2-root-runtime-candidate-tree-v1\n${REQUIRED.filter((path) => path.startsWith('node_modules/')).map((path) => `${path} ${EXPECTED_SOURCE_DIGESTS[path]}`).join('\n')}\n`),
});
const CANONICAL_SEALED_ENTRIES = frozen(REQUIRED.map((path) => frozen({
  path,
  type: 'file',
  sha256: EXPECTED_SOURCE_DIGESTS[path],
})));

function filesFromCanonicalFixture() {
  return frozen(CANONICAL_SEALED_ENTRIES.map((entry) => frozen({
    path: entry.path,
    type: entry.type,
    sha256: entry.sha256,
    observedSha256: entry.sha256,
    descriptorPinned: true,
    noFollow: true,
    isSymlink: false,
  })));
}

function input(overrides = {}) {
  return frozen({
    candidateRoot: ROOT,
    argv: frozen([]),
    uid: 0,
    environment: frozen({ PATH: '/attacker/bin:/usr/bin', LC_ALL: 'unsafe', HOME: '/unsafe/home' }),
    cleanup: frozen({ trapInstalledBeforeTemporary: false, temporaryClearedOnlyAfterSuccessfulRename: false, cleanupOnFailure: false }),
    source: frozen({ path: SOURCE_ROOT, type: 'directory', isSymlink: false, descriptorPinned: true, noFollow: true, ancestors: chain('source') }),
    stage: frozen({ path: '/synthetic/stage', exists: false, type: 'missing', isSymlink: false, ancestors: chain('stage') }),
    destination: frozen({ path: ROOT, exists: false, type: 'missing', isSymlink: false, parent: validParent(), ancestors: chain('destination', validParent()) }),
    temporary: frozen({ path: '/opt/.candidate-temp', exists: false, type: 'missing', isSymlink: false, parent: validParent(), ancestors: chain('temporary', validParent()) }),
    rename: frozen({ path: ROOT, parent: validParent(), ancestors: chain('rename', validParent()) }),
    packageSeal: PACKAGE_SEAL,
    files: filesFromCanonicalFixture(),
    execution: frozen({ cwd: ROOT, argv: frozen(['/usr/bin/node', `${ROOT}/scripts/v2-root-runtime-prepare-coordinator.mjs`, '--prepare']), stagedOnly: true }),
    ...overrides,
  });
}

function expectedAcceptance() {
  return frozen({
    ok: true,
    candidateRoot: ROOT,
    stagedOnly: true,
    execution: frozen({ argv: frozen(['/usr/bin/node', `${ROOT}/scripts/v2-root-runtime-prepare-coordinator.mjs`, '--prepare']), cwd: ROOT }),
    environment: frozen({ PATH: '/usr/sbin:/usr/bin:/sbin:/bin', LC_ALL: 'C', HOME: '/root' }),
    cleanup: frozen({ trapInstalledBeforeTemporary: true, temporaryClearedOnlyAfterSuccessfulRename: true, cleanupOnFailure: true }),
  });
}

function assertDeepFrozen(value, seen = new Set()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return;
  assert.equal(Object.isFrozen(value), true);
  seen.add(value);
  for (const child of Object.values(value)) assertDeepFrozen(child, seen);
}

function assertDenied(value) {
  assert.deepEqual(value, DENIAL);
  assertDeepFrozen(value);
  assert.doesNotMatch(JSON.stringify(value), /(?:path|cwd|env|key|artifact|endpoint|token|secret|hash)/i);
}

test('modelCandidateInstall(snapshot) accepts only the canonical frozen fixture and exact staged-only fixed execution plan', () => {
  assert.equal(CANDIDATE_ROOT, ROOT);
  assertDeepFrozen(EXPECTED_SOURCE_DIGESTS);
  assertDeepFrozen(CANONICAL_SEALED_ENTRIES);
  const result = modelCandidateInstall(input());
  assertDeepFrozen(result);
  assert.deepEqual(result, expectedAcceptance());
  assert.doesNotMatch(JSON.stringify(result), /attacker|unsafe|key|artifact|endpoint|secret/i);
});

test('modelCandidateInstall(snapshot) rejects a self-consistent forged hash and root mutation, and ignores caller manifest authority', () => {
  const forgedDigest = sha256('attacker-controlled-but-self-consistent');
  const forgedFiles = frozen(filesFromCanonicalFixture().map((entry) => entry.path === 'package.json'
    ? frozen({ ...entry, sha256: forgedDigest, observedSha256: forgedDigest })
    : entry));
  const forgedManifest = frozen({
    format: 'cumzinstall-v2-root-runtime-candidate-manifest-v1',
    candidateRoot: ROOT,
    sourceRoot: SOURCE_ROOT,
    descriptorPolicy: 'pinned-no-follow',
    packageSeal: frozen({
      packageJsonSha256: forgedDigest,
      packageLockSha256: EXPECTED_SOURCE_DIGESTS['package-lock.json'],
      dependencyTreeSha256: PACKAGE_SEAL.dependencyTreeSha256,
    }),
    entries: frozen(CANONICAL_SEALED_ENTRIES.map((entry) => entry.path === 'package.json'
      ? frozen({ ...entry, sha256: forgedDigest })
      : entry)),
  });
  const forgedPackageSeal = frozen({
    ...PACKAGE_SEAL,
    packageJsonSha256: forgedDigest,
  });
  for (const candidate of [
    input({ files: forgedFiles }),
    input({ candidateRoot: '/synthetic/other-root' }),
    // This is a fully self-consistent caller forgery: fixed candidate root, a
    // manifest package digest and entry digest agreeing with the observed file,
    // and an external package seal that also agrees with that forged file.
    input({ manifest: forgedManifest, packageSeal: forgedPackageSeal, files: forgedFiles }),
    input({ source: frozen({ path: '/synthetic/source', type: 'directory', isSymlink: false, descriptorPinned: true, noFollow: true }) }),
    input({ source: frozen({ path: SOURCE_ROOT, type: 'file', isSymlink: false, descriptorPinned: true, noFollow: true }) }),
    input({ source: frozen({ path: SOURCE_ROOT, type: 'directory', isSymlink: false, descriptorPinned: false, noFollow: true }) }),
  ]) assertDenied(modelCandidateInstall(candidate));

  // A caller-supplied manifest with an otherwise canonical snapshot is ignored;
  // the model's module-internal canonical manifest remains authoritative.
  const result = modelCandidateInstall(input({ manifest: forgedManifest }));
  assertDeepFrozen(result);
  assert.deepEqual(result, expectedAcceptance());
});

test('modelCandidateInstall(snapshot) rejects unexpected, missing, and every individual sealed-entry mutation', () => {
  const files = filesFromCanonicalFixture();
  const extra = frozen([...files, frozen({ path: 'scripts/unplanned.mjs', type: 'file', sha256: sha256('extra'), observedSha256: sha256('extra'), descriptorPinned: true, noFollow: true, isSymlink: false })]);
  const missing = frozen(files.slice(0, -1));
  for (const candidate of [input({ files: extra }), input({ files: missing })]) {
    assertDenied(modelCandidateInstall(candidate));
  }

  for (const entry of files) {
    const substitute = (changes) => frozen(files.map((current) => current.path === entry.path
      ? frozen({ ...current, ...changes })
      : current));
    for (const mutatedFiles of [
      substitute({ path: `${entry.path}.substituted` }),
      substitute({ type: 'directory' }),
      substitute({ sha256: sha256(`forged-sealed-entry:${entry.path}`), observedSha256: sha256(`forged-sealed-entry:${entry.path}`) }),
      substitute({ observedSha256: sha256(`post-copy-tamper:${entry.path}`) }),
      substitute({ isSymlink: true }),
      substitute({ noFollow: false }),
      substitute({ descriptorPinned: false }),
    ]) assertDenied(modelCandidateInstall(input({ files: mutatedFiles })));
  }
});

test('modelCandidateInstall(snapshot) rejects package, lock, and dependency-tree digest cross-binding mismatch', () => {
  for (const packageSeal of [
    frozen({ ...PACKAGE_SEAL, packageJsonSha256: sha256('wrong-package') }),
    frozen({ ...PACKAGE_SEAL, packageLockSha256: sha256('wrong-lock') }),
    frozen({ ...PACKAGE_SEAL, dependencyTreeSha256: sha256('wrong-tree') }),
    frozen({ ...PACKAGE_SEAL, lockfileMatches: false }),
  ]) assertDenied(modelCandidateInstall(input({ packageSeal })));
});

test('modelCandidateInstall(snapshot) requires every frozen ordered ancestor-chain record to be a pinned safe root directory', () => {
  const baseline = input();
  const chainFields = ['source', 'stage', 'destination', 'temporary', 'rename'];
  const mutations = [
    ['uid', { uid: 1000 }],
    ['mode', { mode: 0o775 }],
    ['type', { type: 'file' }],
    ['isSymlink', { isSymlink: true }],
    ['descriptorPinned', { descriptorPinned: false }],
    ['noFollow', { noFollow: false }],
  ];
  for (const field of chainFields) {
    for (let index = 0; index < baseline[field].ancestors.length; index += 1) {
      for (const [kind, changes] of mutations) {
        const record = baseline[field];
        const ancestors = frozen(record.ancestors.map((ancestorRecord, ancestorIndex) => frozen(
          ancestorIndex === index ? { ...ancestorRecord, ...changes } : ancestorRecord,
        )));
        assertDenied(modelCandidateInstall(input({ [field]: frozen({ ...record, ancestors }) })), `${field}.ancestors[${index}] ${kind}`);
      }
    }
  }
});

test('modelCandidateInstall(snapshot) binds every ancestor chain to its canonical ordered literal path sequence and literal parent terminal', () => {
  const baseline = input();
  const canonicalPaths = {
    source: ['/', '/home', '/home/raspberrypi'],
    stage: ['/', '/synthetic'],
    destination: ['/', '/opt'],
    temporary: ['/', '/opt'],
    rename: ['/', '/opt'],
  };
  for (const [field, paths] of Object.entries(canonicalPaths)) {
    assert.deepEqual(baseline[field].ancestors.map((record) => record.path), paths, `${field} canonical sequence`);
    const record = baseline[field];
    const replaceAncestors = (ancestors) => input({ [field]: frozen({ ...record, ancestors: frozen(ancestors) }) });
    const omitted = record.ancestors.filter((_, index) => index !== Math.max(0, paths.length - 2));
    const reordered = [...record.ancestors].reverse();
    const unrelated = record.ancestors.map((ancestorRecord, index) => frozen({
      ...ancestorRecord,
      path: index === 0 ? '/unrelated' : ancestorRecord.path,
    }));
    const wrongTerminal = record.ancestors.map((ancestorRecord, index) => frozen({
      ...ancestorRecord,
      path: index === paths.length - 1 ? '/terminal-not-parent' : ancestorRecord.path,
    }));
    for (const [kind, ancestors] of [
      ['omitted', omitted],
      ['reordered', reordered],
      ['unrelated', unrelated],
      ['terminal', wrongTerminal],
    ]) assertDenied(modelCandidateInstall(replaceAncestors(ancestors)), `${field} ${kind} ancestor chain`);
  }
});

test('modelCandidateInstall(snapshot) requires a shared synthetic destination-parent device/inode identity and a temporary beneath it', () => {
  const differentParent = frozen({ device: 91, inode: 4103 });
  for (const field of ['temporary', 'destination', 'rename']) {
    const record = input()[field];
    assertDenied(modelCandidateInstall(input({ [field]: frozen({ ...record, parent: differentParent }) })), `${field}.parent identity`);
  }
  assertDenied(modelCandidateInstall(input({ temporary: frozen({ ...input().temporary, path: '/synthetic/stage/.candidate-temp' }) })));
});

test('modelCandidateInstall(snapshot) ignores caller environment and cleanup facts and exposes only its fixed frozen safe plan', () => {
  const result = modelCandidateInstall(input({
    environment: frozen({ PATH: '/caller/path', LC_ALL: 'caller', HOME: '/caller/home' }),
    cleanup: frozen({ trapInstalledBeforeTemporary: false, temporaryClearedOnlyAfterSuccessfulRename: false, cleanupOnFailure: false }),
  }));
  assertDeepFrozen(result);
  assert.deepEqual(result, expectedAcceptance());
  assert.doesNotMatch(JSON.stringify(result), /caller|attacker|unsafe/i);
});

test('modelCandidateInstall(snapshot) refuses hostile synthetic filesystem metadata and non-exact execution before a create/copy/shell action could occur', () => {
  for (const candidate of [
    input({ source: frozen({ path: SOURCE_ROOT, type: 'directory', isSymlink: true, descriptorPinned: true, noFollow: true }) }),
    input({ stage: frozen({ path: '/synthetic/stage', exists: false, type: 'directory', isSymlink: true }) }),
    input({ stage: frozen({ path: '/synthetic/stage', exists: true, type: 'directory', isSymlink: false }) }),
    input({ destination: frozen({ path: ROOT, exists: false, type: 'missing', isSymlink: false, parent: frozen({ type: 'directory', isSymlink: true, mode: 0o755 }) }) }),
    input({ destination: frozen({ path: ROOT, exists: false, type: 'missing', isSymlink: false, parent: frozen({ type: 'directory', isSymlink: false, mode: 0o777 }) }) }),
    input({ uid: 1000 }), input({ argv: frozen(['--send']) }),
    input({ execution: frozen({ cwd: '/synthetic/source', argv: frozen(['/usr/bin/node', `${ROOT}/scripts/v2-root-runtime-prepare-coordinator.mjs`, '--prepare']), stagedOnly: true }) }),
    input({ execution: frozen({ cwd: ROOT, argv: frozen(['node', 'scripts/v2-root-runtime-prepare-coordinator.mjs', '--prepare']), stagedOnly: true }) }),
    input({ execution: frozen({ cwd: ROOT, argv: frozen(['/usr/bin/node', `${ROOT}/scripts/v2-root-runtime-prepare-coordinator.mjs`, '--prepare']), stagedOnly: false }) }),
  ]) assertDenied(modelCandidateInstall(candidate));
});

// Inputs are frozen inert text and metadata records. This specification supplies no filesystem adapter and never reads/copies files, creates directories, or runs a shell.
