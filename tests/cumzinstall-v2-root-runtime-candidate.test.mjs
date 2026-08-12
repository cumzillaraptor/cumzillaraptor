import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const ROOT = '/opt/cumzillaraptors-send-runtime-candidate-v2';
const SOURCE_ROOT = '/home/raspberrypi/workspace-cumzillaraptor';
const DOCUMENT = new URL('../docs/operations/cumzinstall-v2-root-runtime-candidate-interface.md', import.meta.url);
const MANIFEST = new URL('../scripts/cumzinstall-v2-root-runtime-candidate.manifest', import.meta.url);
const REQUIRED_SOURCES = Object.freeze([
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

function canonicalSyntheticSource(path) {
  return `cumzinstall-v2-root-runtime-candidate-fixture-v1\nlabel: sealed-runtime-source\npath: ${path}\ntype: file\n`;
}

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

const EXPECTED_SOURCE_DIGESTS = Object.freeze(Object.fromEntries(REQUIRED_SOURCES.map((path) => [
  path,
  sha256(canonicalSyntheticSource(path)),
])));
function escape(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function assertDeepFrozen(value, seen = new Set()) {
  if (value === null || typeof value !== 'object' || seen.has(value)) return;
  assert.equal(Object.isFrozen(value), true);
  seen.add(value);
  for (const child of Object.values(value)) assertDeepFrozen(child, seen);
}

test('Task 4 interface document specifies a no-argument root-only, descriptor-pinned candidate installation', async () => {
  const text = await readFile(DOCUMENT, 'utf8');
  assert.match(text, /^# cumzinstall v2 root runtime candidate interface$/mi);
  assert.match(text, new RegExp(`^candidate-root: ${escape(ROOT)}$`, 'm'));
  assert.match(text, /^invocation: no arguments$/mi);
  assert.match(text, /^prerequisite: effective uid 0 \(root\)$/mi);
  assert.match(text, /descriptor-pinned/i);
  assert.match(text, /no-follow/i);
  assert.match(text, /immutable expected source-digest map|canonical labeled synthetic/i);
  assert.match(text, /refuse.*(?:preexisting|existing).*(?:stage|destination)|(?:stage|destination).*(?:preexisting|existing).*refuse/i);
  assert.match(text, /create-once/i);
  assert.match(text, /sealed package\.json, package-lock\.json, and dependency tree/i);
  assert.match(text, /fixed absolute paths and SHA-256 hashes/i);
  assert.match(text, /every utility.*absolute trusted path/i);
  assert.match(text, /future-helper utility inventory/i);
  for (const utility of [
    '/usr/bin/sha256sum',
    '/usr/bin/stat',
    '/usr/bin/mkdir',
    '/usr/bin/cp',
    '/usr/bin/chown',
    '/usr/bin/chmod',
    '/usr/bin/mv',
    '/usr/bin/rm',
    '/usr/bin/awk',
    '/usr/bin/printf',
    '/usr/bin/wc',
  ]) assert.match(text, new RegExp(escape(utility)));
  assert.match(text, /sha256sum.*post-open SHA-256 hashing/i);
  assert.match(text, /stat.*type, ownership, and mode checks/i);
  assert.match(text, /mkdir.*create-once staging directories/i);
  assert.match(text, /cp.*copy without dereference/i);
  assert.match(text, /chown.*root ownership/i);
  assert.match(text, /chmod.*required modes/i);
  assert.match(text, /mv.*same-parent atomic rename/i);
  assert.match(text, /rm.*temporary-state cleanup/i);
  assert.match(text, /awk.*printf.*wc.*not applicable.*not invoked/i);
  assert.match(text, /every utility invocation, including.*substitution.*pipeline.*absolute.*no PATH lookup/i);
  assert.match(text, /PATH=\/usr\/sbin:\/usr\/bin:\/sbin:\/bin/i);
  assert.match(text, /LC_ALL=C/i);
  assert.match(text, /HOME=\/root/i);
  assert.match(text, /cleanup trap/i);
  assert.match(text, /clear temporary state.*(?:failure|signal|before return)/i);
  assert.match(text, /trusted synthetic `\{device,inode\}` identity/i);
  assert.match(text, /temporary`?\.parent`?, `?destination`?\.parent`?, and `?rename`?\.parent`?.*exactly equal/i);
  assert.match(text, /ordered immutable synthetic metadata list.*source.*stage.*destination.*temporary.*rename/i);
  assert.match(text, /every ancestor record.*descriptorPinned.*noFollow/i);
  assert.match(text, /model acceptance plan.*PATH.*\/usr\/sbin:\/usr\/bin:\/sbin:\/bin.*LC_ALL.*C.*HOME.*\/root/i);
  assert.match(text, /trapInstalledBeforeTemporary.*temporaryClearedOnlyAfterSuccessfulRename.*cleanupOnFailure/i);
  assert.match(text, /caller.*environment.*cleanup.*non-authoritative/i);
  assert.match(text, /literal destination-parent identity/i);
  assert.match(text, /temporary.*same directory/i);
  assert.match(text, /no-follow\/open validation/i);
  assert.match(text, /0600.*root ownership.*before copy/i);
  assert.match(text, /post-copy hash\/mode validation/i);
  assert.match(text, /atomic rename/i);
  assert.match(text, /final revalidation/i);
  assert.match(text, /no delete\/reuse.*pre-existing path/i);
  for (const source of REQUIRED_SOURCES) assert.match(text, new RegExp(escape(source)));
  assert.match(text, /no keys/i);
  assert.match(text, /no artifact bytes/i);
  assert.match(text, /no endpoint bytes/i);
  assert.match(text, /no Solana CLI/i);
  assert.match(text, /no network/i);
  assert.match(text, /no send/i);
  assert.match(text, /no sudoers/i);
  assert.match(text, /no active-runtime replacement/i);
});

test('Task 4 manifest grammar binds every sealed source to the immutable canonical digest fixture', async () => {
  const text = await readFile(MANIFEST, 'utf8');
  assert.match(text, /^format: cumzinstall-v2-root-runtime-candidate-manifest-v1$/m);
  assert.match(text, new RegExp(`^candidate-root: ${escape(ROOT)}$`, 'm'));
  assert.match(text, new RegExp(`^source-root: ${escape(SOURCE_ROOT)}$`, 'm'));
  assert.match(text, /^mode: root-only-no-arguments-create-once$/m);
  assert.match(text, /^descriptor-policy: pinned-no-follow$/m);
  assert.match(text, /^package-seal: package\.json package-lock\.json node_modules$/m);
  const entries = [...text.matchAll(/^entry: ([a-f0-9]{64})  type:(file)  (\/[^\n ]+) -> (\/[^\n ]+)$/gm)];
  assert.equal(entries.length, REQUIRED_SOURCES.length);
  assert.equal(new Set(entries.map(([, hash]) => hash)).size, REQUIRED_SOURCES.length);
  for (const source of REQUIRED_SOURCES) {
    const expected = `${SOURCE_ROOT}/${source}`;
    const destination = `${ROOT}/${source}`;
    const digest = EXPECTED_SOURCE_DIGESTS[source];
    assert.ok(entries.some(([, actualDigest, type, from, to]) => actualDigest === digest && type === 'file' && from === expected && to === destination), `missing immutable pinned entry for ${source}`);
  }
  assert.match(text, /^forbidden: keys artifact-bytes endpoint-bytes solana-cli network send sudoers active-runtime-replacement$/m);
});

test('future Task 4 harness exposes only a pure, frozen module-internal-manifest candidate-install model contract', async () => {
  const { CANDIDATE_ROOT, modelCandidateInstall } = await import('../scripts/cumzinstall-v2-root-runtime-candidate-harness.mjs');
  assert.equal(CANDIDATE_ROOT, ROOT);
  assertDeepFrozen(EXPECTED_SOURCE_DIGESTS);
  const result = modelCandidateInstall(Object.freeze({}));
  assertDeepFrozen(result);
  assert.doesNotMatch(JSON.stringify(result), /(?:key|artifact|endpoint|token|secret|password|solana|network|send|sudoers)/i);
});

test('Task 4 modelCandidateInstall treats every snapshot.manifest field as non-authoritative', async () => {
  const { modelCandidateInstall } = await import('../scripts/cumzinstall-v2-root-runtime-candidate-harness.mjs');
  const baseline = modelCandidateInstall(Object.freeze({}));
  assertDeepFrozen(baseline);
  for (const manifest of [
    null,
    Object.freeze({}),
    Object.freeze({ candidateRoot: ROOT, entries: Object.freeze([]) }),
    Object.freeze({ format: 'attacker-manifest', candidateRoot: '/synthetic/other-root', entries: Object.freeze([{ path: 'package.json', sha256: '0'.repeat(64) }]) }),
  ]) {
    const result = modelCandidateInstall(Object.freeze({ manifest }));
    assertDeepFrozen(result);
    assert.deepEqual(result, baseline);
  }
});

// This tests only repository-relative future interface artifacts and a planned pure harness; it never opens a host candidate root or invokes an installer.
