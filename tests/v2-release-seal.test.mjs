import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';

import {
  createPinnedReleaseSeal,
  getProductionReleaseSealContract,
  inspectPinnedReleaseInput,
  parseRelativeAllowlist,
  validateFullPinnedCommitId,
  validateReleaseSealGrammar,
} from '../scripts/v2-release-seal.mjs';

const runGit = (repo, args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
const approvedPathsText = readFileSync(new URL('../fixtures/v2-release-seal/approved-paths.txt', import.meta.url), 'utf8');
const fixedPaths = parseRelativeAllowlist(approvedPathsText);
const digest = 'a'.repeat(64);

function gitBlobId(bytes) {
  return createHash('sha1').update(`blob ${bytes.byteLength}\0`).update(bytes).digest('hex');
}

function sealFor(paths, commitId = 'b'.repeat(40)) {
  return `format: cumzillaraptors-v2-release-seal-v1\nrepository: cumzillaraptor/cumzillaraptor\ncommit: ${commitId}\n${paths.map((path) => `entry: ${digest} ${path}\n`).join('')}`;
}

function makeLocalFixtureRepository() {
  const repo = mkdtempSync(join(tmpdir(), 'v2-release-seal-'));
  runGit(repo, ['init', '--quiet']);
  runGit(repo, ['config', 'user.email', 'release-seal@example.test']);
  runGit(repo, ['config', 'user.name', 'Release Seal Test']);
  for (const path of fixedPaths) {
    mkdirSync(dirname(join(repo, path)), { recursive: true });
    writeFileSync(join(repo, path), `fixed regular file: ${path}\n`);
  }
  mkdirSync(join(repo, 'fixture'), { recursive: true });
  writeFileSync(join(repo, 'fixture', 'first-only.txt'), 'present only at first pinned commit\n');
  writeFileSync(join(repo, 'alpha.txt'), 'fixture regular file\n');
  mkdirSync(join(repo, 'nested'), { recursive: true });
  writeFileSync(join(repo, 'nested', 'regular.txt'), 'fixture nested regular file\n');
  symlinkSync('package.json', join(repo, 'link.txt'));
  mkdirSync(join(repo, 'empty-directory'));
  runGit(repo, ['add', '.']);
  runGit(repo, ['commit', '--quiet', '-m', 'first fixture commit']);
  const firstCommit = runGit(repo, ['rev-parse', 'HEAD']);
  runGit(repo, ['tag', 'fixture-tag', firstCommit]);

  runGit(repo, ['rm', '--quiet', 'fixture/first-only.txt']);
  mkdirSync(join(repo, 'fixture'), { recursive: true });
  writeFileSync(join(repo, 'fixture', 'second-only.txt'), 'present only at second pinned commit\n');
  writeFileSync(join(repo, 'package.json'), 'fixed regular file: package.json (second committed bytes)\n');
  runGit(repo, ['add', 'fixture/second-only.txt', 'package.json']);
  runGit(repo, ['update-index', '--add', '--cacheinfo', `160000,${firstCommit},vendor/submodule`]);
  runGit(repo, ['commit', '--quiet', '-m', 'second fixture commit']);
  return { repo, firstCommit, secondCommit: runGit(repo, ['rev-parse', 'HEAD']) };
}

function localObjectDatabase(repo) {
  const gitDir = join(repo, '.git');
  const receivedResolveIds = [];
  const receivedTreeIds = [];
  return {
    receivedResolveIds,
    receivedTreeIds,
    async resolveExactCommit(commitId) {
      receivedResolveIds.push(commitId);
      try {
        execFileSync('git', [`--git-dir=${gitDir}`, 'cat-file', '-e', `${commitId}^{commit}`], { stdio: 'pipe' });
        return true;
      } catch {
        return false;
      }
    },
    async listTreeEntries(commitId) {
      receivedTreeIds.push(commitId);
      const output = execFileSync('git', [`--git-dir=${gitDir}`, 'ls-tree', '-rz', '--full-tree', commitId], { encoding: 'buffer' });
      return output.toString('utf8').split('\0').filter(Boolean).map((record) => {
        const match = /^(\d+) ([a-z]+) ([0-9a-f]+)\t(.+)$/.exec(record);
        assert.ok(match, `unexpected ls-tree record: ${record}`);
        return { mode: match[1], type: match[2], objectId: match[3], path: match[4] };
      });
    },
    async readBlob({ commitId, path, objectId }) {
      const output = execFileSync('git', [`--git-dir=${gitDir}`, 'ls-tree', '-rz', '--full-tree', commitId], { encoding: 'buffer' });
      const record = output.toString('utf8').split('\0').find((candidate) => candidate.endsWith(`\t${path}`));
      assert.ok(record, `missing selected blob path: ${path}`);
      const treeObjectId = /^(\d+) ([a-z]+) ([0-9a-f]+)\t/.exec(record)?.[3];
      assert.equal(objectId, treeObjectId, `read tuple must match selected tree metadata: ${path}`);
      return {
        objectId,
        bytes: execFileSync('git', [`--git-dir=${gitDir}`, 'cat-file', 'blob', objectId], { encoding: 'buffer' }),
      };
    },
  };
}

/** Test-only fixture helper: production inspection always uses FIXED_ALLOWLIST. */
async function inspectFixtureAllowlistForTestOnly({ commitId, allowlistText, expectedPaths, objectDatabase }) {
  const pinnedCommitId = validateFullPinnedCommitId(commitId);
  const paths = parseRelativeAllowlist(allowlistText);
  assert.deepEqual(paths, expectedPaths, 'fixture allowlist must match its test-only expectation');
  assert.equal(await objectDatabase.resolveExactCommit(pinnedCommitId), true, 'fixture pin must resolve exactly');
  const entries = await objectDatabase.listTreeEntries(pinnedCommitId);
  const entriesByPath = new Map(entries.map((entry) => [entry.path, entry]));
  for (const path of paths) {
    const entry = entriesByPath.get(path);
    assert.ok(entry, `fixture path absent at pinned commit: ${path}`);
    assert.notEqual(entry.type, 'tree', `fixture path is a directory: ${path}`);
    assert.notEqual(entry.mode, '120000', `fixture path is a symlink: ${path}`);
    assert.notEqual(entry.mode, '160000', `fixture path is a submodule: ${path}`);
    assert.equal(entry.type, 'blob', `fixture path is not a blob: ${path}`);
    assert.match(entry.mode, /^100[0-7]{3}$/, `fixture path is not a regular file: ${path}`);
  }
  return { commitId: pinnedCommitId, paths };
}

const fixtureAllowlist = 'alpha.txt\nnested/regular.txt\n';
const fixtureSeal = sealFor(['alpha.txt', 'nested/regular.txt']);
const fixedSeal = sealFor(fixedPaths);

test('release-seal-requires-a-full-pinned-commit-id', () => {
  assert.equal(validateFullPinnedCommitId('a'.repeat(40)), 'a'.repeat(40));
  assert.equal(validateFullPinnedCommitId('b'.repeat(64)), 'b'.repeat(64));
  for (const invalid of ['a'.repeat(39), 'A'.repeat(40), 'a'.repeat(41), 'main', 'deadbeef', '']) {
    assert.throws(() => validateFullPinnedCommitId(invalid), /full pinned commit id/i);
  }
  assert.deepEqual(validateReleaseSealGrammar(fixedSeal).paths, fixedPaths);
  assert.throws(() => validateReleaseSealGrammar(fixtureSeal), /allowlist|missing|extra/i);
  assert.throws(() => validateReleaseSealGrammar(fixedSeal.replace('commit: ' + 'b'.repeat(40), 'commit: HEAD')), /full pinned commit id/i);
  assert.throws(() => validateReleaseSealGrammar(fixedSeal.slice(0, -1)), /LF-terminated/i);
  assert.throws(() => validateReleaseSealGrammar(fixedSeal.replace('format: cumzillaraptors-v2-release-seal-v1', 'repository: cumzillaraptor/cumzillaraptor')), /header|order/i);
  assert.throws(() => validateReleaseSealGrammar(fixedSeal.replace(`entry: ${digest} ${fixedPaths[0]}`, `entry: ${digest}  ${fixedPaths[0]}`)), /entry syntax/i);
});

test('release-seal-rejects-branch-tag-and-working-tree-inputs', async (t) => {
  const fixture = makeLocalFixtureRepository();
  t.after(() => rmSync(fixture.repo, { recursive: true, force: true }));
  const objectDatabase = localObjectDatabase(fixture.repo);
  for (const mutableInput of ['master', 'fixture-tag', 'HEAD', '.', fixture.repo]) {
    await assert.rejects(
      inspectPinnedReleaseInput({ commitId: mutableInput, allowlistText: approvedPathsText, objectDatabase }),
      /full pinned commit id/i,
    );
  }
  await assert.rejects(
    inspectPinnedReleaseInput({ commitId: 'c'.repeat(40), allowlistText: approvedPathsText, objectDatabase }),
    /does not resolve to a commit object/i,
  );
  const inspected = await inspectPinnedReleaseInput({
    commitId: fixture.secondCommit,
    allowlistText: approvedPathsText,
    objectDatabase,
  });
  assert.equal(inspected.commitId, fixture.secondCommit);
  assert.deepEqual(inspected.paths, fixedPaths);
  assert.equal(objectDatabase.receivedTreeIds.at(-1), fixture.secondCommit, 'production adapter must receive the supplied pin');
});

test('release-seal-rejects-extra-missing-duplicate-and-symlinked-allowlist-entries', async (t) => {
  const fixture = makeLocalFixtureRepository();
  t.after(() => rmSync(fixture.repo, { recursive: true, force: true }));
  const objectDatabase = localObjectDatabase(fixture.repo);
  for (const invalid of [
    'alpha.txt\nextra.txt\nnested/regular.txt\n',
    'alpha.txt\n',
    'alpha.txt\nalpha.txt\nnested/regular.txt\n',
  ]) {
    await assert.rejects(
      inspectFixtureAllowlistForTestOnly({ commitId: fixture.secondCommit, allowlistText: invalid, objectDatabase, expectedPaths: ['alpha.txt', 'nested/regular.txt'] }),
      /fixture allowlist|unique|sorted/i,
    );
  }
  for (const [invalid, expectedPaths, reason] of [
    ['alpha.txt\nlink.txt\nnested/regular.txt\n', ['alpha.txt', 'link.txt', 'nested/regular.txt'], /symlink/i],
    ['alpha.txt\nempty-directory\nnested/regular.txt\n', ['alpha.txt', 'empty-directory', 'nested/regular.txt'], /directory/i],
    ['alpha.txt\nnested/regular.txt\nvendor/submodule\n', ['alpha.txt', 'nested/regular.txt', 'vendor/submodule'], /submodule/i],
  ]) {
    await assert.rejects(
      inspectFixtureAllowlistForTestOnly({ commitId: fixture.secondCommit, allowlistText: invalid, objectDatabase, expectedPaths }),
      reason,
    );
  }
  let inspected = false;
  const mustNotInspect = {
    async resolveExactCommit() { inspected = true; throw new Error('must not inspect'); },
    async listTreeEntries() { inspected = true; throw new Error('must not inspect'); },
  };
  await assert.rejects(
    inspectPinnedReleaseInput({ commitId: fixture.secondCommit, allowlistText: approvedPathsText.replace('package.json\n', 'package.json\npackage.json\n'), objectDatabase: mustNotInspect }),
    /allowlist|missing|extra|unique|sorted/i,
  );
  assert.equal(inspected, false, 'text validation must finish before object-database inspection');
  assert.deepEqual(parseRelativeAllowlist(fixtureAllowlist), ['alpha.txt', 'nested/regular.txt']);
});

test('release-seal-task2a-metadata-remains-pinned-to-the-selected-commit', async (t) => {
  const fixture = makeLocalFixtureRepository();
  t.after(() => rmSync(fixture.repo, { recursive: true, force: true }));
  const objectDatabase = localObjectDatabase(fixture.repo);
  const firstOnly = 'fixture/first-only.txt\n';
  const secondOnly = 'fixture/second-only.txt\n';
  await inspectFixtureAllowlistForTestOnly({ commitId: fixture.firstCommit, allowlistText: firstOnly, expectedPaths: ['fixture/first-only.txt'], objectDatabase });
  await inspectFixtureAllowlistForTestOnly({ commitId: fixture.secondCommit, allowlistText: secondOnly, expectedPaths: ['fixture/second-only.txt'], objectDatabase });
  await assert.rejects(
    inspectFixtureAllowlistForTestOnly({ commitId: fixture.firstCommit, allowlistText: secondOnly, expectedPaths: ['fixture/second-only.txt'], objectDatabase }),
    /absent at pinned commit/i,
  );
  await assert.rejects(
    inspectFixtureAllowlistForTestOnly({ commitId: fixture.secondCommit, allowlistText: firstOnly, expectedPaths: ['fixture/first-only.txt'], objectDatabase }),
    /absent at pinned commit/i,
  );
  assert.deepEqual(objectDatabase.receivedTreeIds, [fixture.firstCommit, fixture.secondCommit, fixture.firstCommit, fixture.secondCommit]);
});

test('release-seal-production-api-is-fixed-allowlist-and-selected-object-db-only', () => {
  const source = readFileSync(new URL('../scripts/v2-release-seal.mjs', import.meta.url), 'utf8');
  assert.match(source, /node:crypto/);
  assert.doesNotMatch(source, /node:(?:fs|child_process|https?|net)|\b(?:execFile|execSync|spawn|fetch|cat-file|show)\b/i);
  assert.doesNotMatch(source, /expectedPaths|allowlistText.*createPinnedReleaseSeal/, 'production sealing must not accept an allowlist override');
  assert.deepEqual(parseRelativeAllowlist(approvedPathsText), getProductionReleaseSealContract().allowlist);
  assert.equal(getProductionReleaseSealContract.length, 0, 'production contract interface must not accept caller input');
  assert.equal(createPinnedReleaseSeal.length, 1, 'production seal API accepts only its pin and selected object database');
  assert.equal(getProductionReleaseSealContract().status, 'task2b-ready');
});

test('release-seal-binds-each-read-to-its-validated-git-blob-object', async () => {
  const syntheticCommit = '1'.repeat(40);
  const blobs = new Map(fixedPaths.map((path) => [path, Buffer.from(`synthetic pinned blob: ${path}\n`, 'utf8')]));
  const entries = new Map([...blobs].map(([path, bytes]) => [path, {
    path,
    mode: '100644',
    type: 'blob',
    objectId: gitBlobId(bytes),
  }]));
  const reads = [];
  const objectDatabase = {
    async resolveExactCommit(commitId) { return commitId === syntheticCommit; },
    async listTreeEntries(commitId) {
      assert.equal(commitId, syntheticCommit);
      return [...entries.values()].reverse();
    },
    async readBlob({ commitId, path, objectId }) {
      const entry = entries.get(path);
      assert.equal(commitId, syntheticCommit);
      assert.equal(objectId, entry.objectId, 'adapter must receive the selected object id');
      reads.push([commitId, path, objectId]);
      return { objectId, bytes: new Uint8Array(blobs.get(path)) };
    },
  };
  const seal = await createPinnedReleaseSeal({ commitId: syntheticCommit, objectDatabase });
  const expected = readFileSync(new URL('../fixtures/v2-release-seal/expected-release-seal.txt', import.meta.url), 'utf8');
  assert.equal(seal, expected, 'canonical synthetic fixture must match exactly');
  assert.deepEqual(reads, fixedPaths.map((path) => [syntheticCommit, path, entries.get(path).objectId]), 'each exact validated blob is read once in UTF-8 byte order');
  assert.deepEqual(validateReleaseSealGrammar(seal).paths, fixedPaths);

  await assert.rejects(
    createPinnedReleaseSeal({
      commitId: syntheticCommit,
      objectDatabase: { ...objectDatabase, async readBlob({ objectId }) { return { objectId: 'f'.repeat(40), bytes: Buffer.from('replaced bytes') }; } },
    }),
    /object id|identity|mismatch/i,
    'a replaced blob identity must be rejected before hashing',
  );
  await assert.rejects(
    createPinnedReleaseSeal({
      commitId: syntheticCommit,
      objectDatabase: { ...objectDatabase, async readBlob() { return new Uint8Array(Buffer.from('identity-less bytes')); } },
    }),
    /blob result|object id|identity/i,
    'plain bytes without an object identity are forbidden',
  );
});

test('release-seal-enforces-the-task2b-one-mebibyte-blob-policy', async () => {
  const syntheticCommit = '2'.repeat(40);
  const makeDatabase = (firstBytes) => {
    const blobs = new Map(fixedPaths.map((path) => [path, path === fixedPaths[0] ? firstBytes : Buffer.from(path)]));
    const entries = [...blobs].map(([path, bytes]) => ({ path, mode: '100644', type: 'blob', objectId: gitBlobId(bytes) }));
    return {
      async resolveExactCommit(commitId) { return commitId === syntheticCommit; },
      async listTreeEntries() { return entries; },
      async readBlob({ commitId, path, objectId }) {
        const entry = entries.find((candidate) => candidate.path === path);
        assert.equal(commitId, syntheticCommit);
        assert.equal(objectId, entry.objectId);
        return { objectId, bytes: blobs.get(path) };
      },
    };
  };
  await createPinnedReleaseSeal({ commitId: syntheticCommit, objectDatabase: makeDatabase(Buffer.alloc(1024 * 1024)) });
  await assert.rejects(
    createPinnedReleaseSeal({ commitId: syntheticCommit, objectDatabase: makeDatabase(Buffer.alloc((1024 * 1024) + 1)) }),
    /exceed maximum size/i,
  );
});

test('release-seal-rejects-duplicate-tree-metadata-before-reading-and-ignores-valid-unexpected-entries', async () => {
  const syntheticCommit = '3'.repeat(40);
  const blobs = new Map(fixedPaths.map((path) => [path, Buffer.from(`synthetic pinned blob: ${path}\n`)]));
  const entries = fixedPaths.map((path) => ({ path, mode: '100644', type: 'blob', objectId: gitBlobId(blobs.get(path)) }));
  let reads = 0;
  const objectDatabase = {
    async resolveExactCommit() { return true; },
    async listTreeEntries() { return entries; },
    async readBlob({ path, objectId }) {
      reads += 1;
      assert.equal(objectId, entries.find((entry) => entry.path === path).objectId);
      return { objectId, bytes: blobs.get(path) };
    },
  };
  const baseline = await createPinnedReleaseSeal({ commitId: syntheticCommit, objectDatabase });
  assert.equal(reads, fixedPaths.length);

  reads = 0;
  const duplicateEntry = { ...entries[0] };
  await assert.rejects(
    createPinnedReleaseSeal({
      commitId: syntheticCommit,
      objectDatabase: { ...objectDatabase, async listTreeEntries() { return [...entries, duplicateEntry]; } },
    }),
    /duplicate entry/i,
  );
  assert.equal(reads, 0, 'duplicate metadata must reject before any blob read');

  reads = 0;
  const extraBytes = Buffer.from('valid but not allowlisted');
  const unexpected = { path: 'unexpected.txt', mode: '100644', type: 'blob', objectId: gitBlobId(extraBytes) };
  const withUnexpected = await createPinnedReleaseSeal({
    commitId: syntheticCommit,
    objectDatabase: { ...objectDatabase, async listTreeEntries() { return [...entries, unexpected]; } },
  });
  assert.equal(withUnexpected, baseline, 'valid unexpected tree metadata must not alter the fixed-allowlist seal');
  assert.equal(reads, fixedPaths.length, 'valid unexpected tree metadata must not cause a read');
});

test('release-seal-changes-when-approved-byte-content-changes', async (t) => {
  const fixture = makeLocalFixtureRepository();
  t.after(() => rmSync(fixture.repo, { recursive: true, force: true }));
  const objectDatabase = localObjectDatabase(fixture.repo);
  const firstSeal = await createPinnedReleaseSeal({ commitId: fixture.firstCommit, objectDatabase });
  const secondSeal = await createPinnedReleaseSeal({ commitId: fixture.secondCommit, objectDatabase });
  assert.notEqual(firstSeal, secondSeal, 'a committed approved-byte mutation changes the pinned seal');

  writeFileSync(join(fixture.repo, 'package.json'), 'uncommitted working-tree bytes must not affect the pin\n');
  assert.equal(
    await createPinnedReleaseSeal({ commitId: fixture.firstCommit, objectDatabase }),
    firstSeal,
    'working-tree edits do not affect the first pinned commit seal',
  );
});
