import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const ROOT = '/opt/cumzillaraptors-send-runtime-candidate-v2';
const SOURCE_ROOT = '/home/raspberrypi/workspace-cumzillaraptor';
const DOCUMENT = new URL('../docs/operations/cumzinstall-v2-root-runtime-candidate-interface.md', import.meta.url);
const RELEASE_SEAL_FORMAT = new URL('../docs/operations/v2-phase-b-release-seal-format.md', import.meta.url);
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

test('Task 4 interface document is a non-authorizing supersession note for the descriptor-pinned bootstrap contract', async () => {
  const text = await readFile(DOCUMENT, 'utf8');
  assert.match(text, /^# cumzinstall v2 root runtime candidate interface$/mi);
  assert.match(text, /^## Superseded interface boundary$/mi);
  assert.match(text, /static interface note only/i);
  assert.match(text, /superseded.*\[the v2 descriptor-pinned bootstrap contract\]\(v2-descriptor-pinned-bootstrap-contract\.md\)/i);
  assert.doesNotMatch(text, /^candidate-root:/mi);
  assert.doesNotMatch(text, /^source-root:/mi);
  assert.match(text, /does not authorize host work, helper creation, helper execution, or installation/i);
  assert.match(text, /supplies no source root.*staging path.*destination.*runtime.*release-seal input.*manifest.*commit.*digest.*caller argument.*environment interface/i);
  assert.match(text, new RegExp(`legacy candidate path is permanently excluded: \`${escape(ROOT)}\``));
  assert.match(text, /current active runtime is permanently excluded/i);
  assert.match(text, /later separate tests and approvals before execution or installation/i);
});

function parseMarkdownAllowlist(text) {
  const section = text.match(/The explicit runtime artifact allowlist is:\n\n((?:- `[^`]+`\n?)+)/);
  assert.ok(section, 'release-seal format must contain a Markdown artifact allowlist');
  return [...section[1].matchAll(/^- `([^`]+)`$/gm)].map(([, path]) => path);
}

test('Phase B release-seal format fixes the complete trusted production seal', async () => {
  const [manifest, interfaceDocument, releaseSealFormat] = await Promise.all([
    readFile(MANIFEST, 'utf8'),
    readFile(DOCUMENT, 'utf8'),
    readFile(RELEASE_SEAL_FORMAT, 'utf8'),
  ]);
  const syntheticEntries = [...manifest.matchAll(/^entry: ([a-f0-9]{64})  type:file  (\/[^\n ]+) -> (\/[^\n ]+)$/gm)];
  assert.equal(syntheticEntries.length, REQUIRED_SOURCES.length);
  for (const source of REQUIRED_SOURCES) {
    const expected = `${SOURCE_ROOT}/${source}`;
    const entry = syntheticEntries.find(([, , from]) => from === expected);
    assert.ok(entry, `missing synthetic fixture entry for ${source}`);
    assert.equal(entry[1], sha256(canonicalSyntheticSource(source)));
  }

  const allowlist = parseMarkdownAllowlist(releaseSealFormat);
  assert.deepEqual(allowlist, REQUIRED_SOURCES, 'Phase B Markdown allowlist must exactly equal REQUIRED_SOURCES');
  assert.equal(new Set(allowlist).size, REQUIRED_SOURCES.length, 'Phase B Markdown allowlist must not duplicate paths');

  assert.match(interfaceDocument, /^## Superseded interface boundary$/mi);
  assert.match(interfaceDocument, /superseded.*\[the v2 descriptor-pinned bootstrap contract\]\(v2-descriptor-pinned-bootstrap-contract\.md\)/i);
  assert.doesNotMatch(interfaceDocument, /^candidate-root:/mi);
  assert.doesNotMatch(interfaceDocument, /^source-root:/mi);
  assert.match(interfaceDocument, /does not authorize host work, helper creation, helper execution, or installation/i);
  assert.match(interfaceDocument, /legacy candidate path is permanently excluded/i);
  assert.match(interfaceDocument, /current active runtime is permanently excluded/i);
  assert.match(releaseSealFormat, /static Phase A synthetic manifest is never a release seal and is never supplied to a privileged helper.*pure model fixture only/i);
  assert.match(releaseSealFormat, /^format: cumzillaraptors-v2-release-seal-v1$/m);
  assert.match(releaseSealFormat, /^repository: cumzillaraptor\/cumzillaraptor$/m);
  assert.match(releaseSealFormat, /^commit: <40-or-64-lowercase-hex immutable full commit id>$/m);
  assert.match(releaseSealFormat, /^entry: <sha256-64-lowercase-hex> <repository-relative-regular-file-path>$/m);
  assert.match(releaseSealFormat, /record label.*exactly one ASCII space/i);
  assert.match(releaseSealFormat, /lowercase ASCII hexadecimal/i);
  assert.match(releaseSealFormat, /final entry.*single LF/i);
  assert.match(releaseSealFormat, /entry path must exactly equal one complete item in the explicit runtime artifact allowlist/i);
  assert.match(releaseSealFormat, /exactly one entry for every allowlist item.*no missing.*no extra.*no duplicate/i);
  assert.match(releaseSealFormat, /fixed, operator-provisioned, embedded trusted data/i);
  assert.match(releaseSealFormat, /caller-supplied.*Phase B seal.*commit ID.*digest.*entry record.*rejected.*non-authoritative/i);
  assert.match(releaseSealFormat, /actual-byte digest/i);
  assert.match(releaseSealFormat, /UTF-8 byte sorting/i);
  assert.match(releaseSealFormat, /no comments.*no blank lines.*no symlink entries/i);
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
