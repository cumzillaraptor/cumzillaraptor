import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

const STEP5_REVISION = 'f69dab643ac401859a9d21d6aeabf4dab53cf640';
const PATHS = Object.freeze([
  'package-lock.json',
  'package.json',
  'scripts/future-send-v2-schema.mjs',
  'scripts/v2-root-runtime-prepare-contract.mjs',
  'scripts/v2-root-runtime-prepare-coordinator.mjs',
  'scripts/v2-root-runtime-provenance.mjs',
]);

function blobId(bytes) {
  return createHash('sha1').update(`blob ${bytes.byteLength}\0`).update(bytes).digest('hex');
}

function makePinnedObjectDatabase() {
  const bytesByPath = new Map(PATHS.map((path) => [path, Buffer.from(`Step 5 pinned runtime bytes: ${path}\n`)]));
  const entries = PATHS.map((path) => ({
    path,
    mode: '100644',
    type: 'blob',
    objectId: blobId(bytesByPath.get(path)),
  }));
  const calls = [];
  return {
    calls,
    async resolveExactCommit(commitId) {
      calls.push(['resolveExactCommit', commitId]);
      return commitId === STEP5_REVISION;
    },
    async listTreeEntries(commitId) {
      calls.push(['listTreeEntries', commitId]);
      return entries;
    },
    async readBlob({ commitId, path, objectId }) {
      calls.push(['readBlob', commitId, path, objectId]);
      const entry = entries.find((candidate) => candidate.path === path);
      assert.equal(objectId, entry.objectId);
      return { objectId, bytes: bytesByPath.get(path) };
    },
  };
}

test('r1 release-seal generator accepts only the fixed Step 5 revision through an injected object database', async () => {
  const { createR1ReleaseSeal, getR1ReleaseSealContract } = await import('../scripts/v2-r1-release-seal.mjs');
  const objectDatabase = makePinnedObjectDatabase();

  const seal = await createR1ReleaseSeal({
    objectDatabase,
    commitId: '0'.repeat(40),
  });

  assert.match(seal, new RegExp(`^format: cumzillaraptors-v2-release-seal-v1\nrepository: cumzillaraptor/cumzillaraptor\ncommit: ${STEP5_REVISION}\n`));
  assert.equal(createHash('sha256').update(seal, 'utf8').digest('hex').length, 64);
  assert.deepEqual(getR1ReleaseSealContract(), Object.freeze({
    step5Revision: STEP5_REVISION,
    sealFormat: 'cumzillaraptors-v2-release-seal-v1',
    paths: PATHS,
    status: 'repository-only-unpersisted',
  }));
  assert.deepEqual(objectDatabase.calls.slice(0, 2), [
    ['resolveExactCommit', STEP5_REVISION],
    ['listTreeEntries', STEP5_REVISION],
  ]);
  assert.deepEqual(objectDatabase.calls.filter(([operation]) => operation === 'readBlob').map(([, commitId, path]) => [commitId, path]), PATHS.map((path) => [STEP5_REVISION, path]));
});

test('r1 release-seal generator is a repository-only wrapper with no host, process, or network capability', async () => {
  const source = await (await import('node:fs/promises')).readFile(new URL('../scripts/v2-r1-release-seal.mjs', import.meta.url), 'utf8');

  assert.match(source, /f69dab643ac401859a9d21d6aeabf4dab53cf640/);
  assert.doesNotMatch(source, /node:(?:fs|child_process|https?|net)|\b(?:exec|spawn|fetch|solana|sudo|sign|send|deploy)\b/i);
});

// This test uses an in-memory injected object database only. It reads no host path and contacts no external system.
