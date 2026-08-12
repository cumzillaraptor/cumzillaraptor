import { createHash } from 'node:crypto';

export const CANDIDATE_ROOT = '/opt/cumzillaraptors-send-runtime-candidate-v2';

const SOURCE_ROOT = '/home/raspberrypi/workspace-cumzillaraptor';
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

function digest(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

const EXPECTED = Object.freeze(Object.fromEntries(REQUIRED.map((path) => [
  path,
  digest(`cumzinstall-v2-root-runtime-candidate-fixture-v1\nlabel: sealed-runtime-source\npath: ${path}\ntype: file\n`),
])));
const TREE = digest(`cumzinstall-v2-root-runtime-candidate-tree-v1\n${REQUIRED
  .filter((path) => path.startsWith('node_modules/'))
  .map((path) => `${path} ${EXPECTED[path]}`).join('\n')}\n`);
const DESTINATION_PARENT_PATH = '/opt';
const SOURCE_PARENT_PATH = '/home/raspberrypi';
const STAGE_PARENT_PATH = '/synthetic';
const CANONICAL_ANCESTOR_PATHS = Object.freeze({
  source: Object.freeze(['/', '/home', SOURCE_PARENT_PATH]),
  stage: Object.freeze(['/', STAGE_PARENT_PATH]),
  destination: Object.freeze(['/', DESTINATION_PARENT_PATH]),
  temporary: Object.freeze(['/', DESTINATION_PARENT_PATH]),
  rename: Object.freeze(['/', DESTINATION_PARENT_PATH]),
});
const SAFE_ENVIRONMENT = Object.freeze({
  PATH: '/usr/sbin:/usr/bin:/sbin:/bin',
  LC_ALL: 'C',
  HOME: '/root',
});
const SAFE_CLEANUP = Object.freeze({
  trapInstalledBeforeTemporary: true,
  temporaryClearedOnlyAfterSuccessfulRename: true,
  cleanupOnFailure: true,
});
const DENIAL = Object.freeze({ ok: false, reason: 'invalid-input' });
const ACCEPTANCE = Object.freeze({
  ok: true,
  candidateRoot: CANDIDATE_ROOT,
  stagedOnly: true,
  execution: Object.freeze({
    argv: Object.freeze(['/usr/bin/node', `${CANDIDATE_ROOT}/scripts/v2-root-runtime-prepare-coordinator.mjs`, '--prepare']),
    cwd: CANDIDATE_ROOT,
  }),
  environment: SAFE_ENVIRONMENT,
  cleanup: SAFE_CLEANUP,
});

function frozenTree(value, seen = new Set()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return true;
  if (!Object.isFrozen(value)) return false;
  seen.add(value);
  return Object.values(value).every((child) => frozenTree(child, seen));
}

function exactArray(value, expected) {
  return Array.isArray(value) && value.length === expected.length && value.every((item, index) => item === expected[index]);
}

function validIdentity(identity) {
  return !!identity && Number.isSafeInteger(identity.device) && identity.device >= 0
    && Number.isSafeInteger(identity.inode) && identity.inode >= 0;
}

function sameIdentity(left, right) {
  return validIdentity(left) && validIdentity(right)
    && left.device === right.device && left.inode === right.inode;
}

function validAncestor(record) {
  return !!record && typeof record.path === 'string' && record.path.startsWith('/')
    && record.type === 'directory' && record.isSymlink === false && record.uid === 0
    && Number.isInteger(record.mode) && (record.mode & 0o022) === 0
    && record.descriptorPinned === true && record.noFollow === true;
}

function validAncestorChain(chain, expectedPaths, terminalPath) {
  return Array.isArray(chain) && Array.isArray(expectedPaths)
    && exactArray(chain.map((record) => record?.path), expectedPaths)
    && expectedPaths[expectedPaths.length - 1] === terminalPath
    && chain[chain.length - 1]?.path === terminalPath
    && chain.every(validAncestor);
}

function validParent(parent, chain, expectedPaths, terminalPath) {
  return validIdentity(parent) && validAncestorChain(chain, expectedPaths, terminalPath)
    && sameIdentity(parent, chain[chain.length - 1].identity);
}

function validFiles(files) {
  if (!Array.isArray(files) || files.length !== REQUIRED.length) return false;
  return files.every((entry, index) => entry && entry.path === REQUIRED[index]
    && entry.type === 'file'
    && entry.sha256 === EXPECTED[entry.path]
    && entry.observedSha256 === EXPECTED[entry.path]
    && entry.descriptorPinned === true
    && entry.noFollow === true
    && entry.isSymlink === false);
}

function validSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || !frozenTree(snapshot)) return false;
  if (snapshot.candidateRoot !== CANDIDATE_ROOT || !exactArray(snapshot.argv, []) || snapshot.uid !== 0) return false;

  const { source, stage, destination, temporary, rename, packageSeal, files, execution } = snapshot;
  if (!source || source.path !== SOURCE_ROOT || source.type !== 'directory' || source.isSymlink !== false
    || source.descriptorPinned !== true || source.noFollow !== true
    || !validAncestorChain(source.ancestors, CANONICAL_ANCESTOR_PATHS.source, SOURCE_PARENT_PATH)) return false;
  if (!stage || stage.path !== '/synthetic/stage' || stage.exists !== false || stage.type !== 'missing'
    || stage.isSymlink !== false
    || !validAncestorChain(stage.ancestors, CANONICAL_ANCESTOR_PATHS.stage, STAGE_PARENT_PATH)) return false;
  if (!destination || destination.path !== CANDIDATE_ROOT || destination.exists !== false
    || destination.type !== 'missing' || destination.isSymlink !== false
    || !validParent(destination.parent, destination.ancestors, CANONICAL_ANCESTOR_PATHS.destination, DESTINATION_PARENT_PATH)) return false;
  if (!temporary || temporary.path !== `${DESTINATION_PARENT_PATH}/.candidate-temp` || temporary.exists !== false
    || temporary.type !== 'missing' || temporary.isSymlink !== false
    || !validParent(temporary.parent, temporary.ancestors, CANONICAL_ANCESTOR_PATHS.temporary, DESTINATION_PARENT_PATH)) return false;
  if (!rename || rename.path !== CANDIDATE_ROOT
    || !validParent(rename.parent, rename.ancestors, CANONICAL_ANCESTOR_PATHS.rename, DESTINATION_PARENT_PATH)) return false;
  if (!sameIdentity(temporary.parent, destination.parent) || !sameIdentity(destination.parent, rename.parent)) return false;
  if (!packageSeal || packageSeal.packageJsonSha256 !== EXPECTED['package.json']
    || packageSeal.packageLockSha256 !== EXPECTED['package-lock.json']
    || packageSeal.dependencyTreeSha256 !== TREE || packageSeal.lockfileMatches === false) return false;
  if (!validFiles(files)) return false;
  return !!execution && execution.cwd === CANDIDATE_ROOT && execution.stagedOnly === true
    && exactArray(execution.argv, ACCEPTANCE.execution.argv);
}

export function modelCandidateInstall(snapshot) {
  return validSnapshot(snapshot) ? ACCEPTANCE : DENIAL;
}
