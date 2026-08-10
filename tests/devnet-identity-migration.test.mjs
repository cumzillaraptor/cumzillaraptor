import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const OLD_PROGRAM_ID = '2YTAvP54MuSd7uUGbG9LrWiXCYh5UNHyqvy6XqxCTda2';
const PROGRAM_ID = 'AYE4iC2gp81H8jvMjk4EGxWP2sJFzuDptUwxqwTZYTMY';
const UPGRADE_AUTHORITY = '3DnrWsBbaT6BMbUKXL4x5cid9KRk7GbG89wdJNihEhU2';

const activeBindings = [
  'Anchor.toml',
  'config/devnet-launch.json',
  'programs/cumzillaraptors/src/lib.rs',
  'programs/cumzillaraptors/src/state.rs',
  'nft-data/claims-v1.devnet.json',
  'nft-data/claim-message-vectors.devnet.json',
  'nft-data/uri-map.devnet.json',
  'nft-data/metadata-merkle-v1.devnet.json',
  'scripts/generate-merkle-tree.js',
  'scripts/preflight-devnet-deploy.mjs',
  'scripts/review-devnet-deployment.mjs',
  'scripts/future-send-gate.mjs',
  'scripts/create-devnet-collection.mjs',
];

test('current Devnet identity bindings use only the recovered program and upgrade authority', async () => {
  const contents = await Promise.all(activeBindings.map((file) => readFile(path.join(root, file), 'utf8')));
  for (const [index, content] of contents.entries()) {
    assert.doesNotMatch(content, new RegExp(OLD_PROGRAM_ID), `stale undeployed program identity in ${activeBindings[index]}`);
  }

  const launch = JSON.parse(contents[1]);
  assert.equal(launch.cluster, 'devnet');
  assert.equal(launch.launchAuthority, UPGRADE_AUTHORITY);

  for (const artifactIndex of [4, 5, 6, 7]) {
    assert.equal(JSON.parse(contents[artifactIndex]).programId, PROGRAM_ID, `generated artifact ${activeBindings[artifactIndex]} is not bound to the new program`);
  }

  assert.match(contents[0], new RegExp(`cumzillaraptors = "${PROGRAM_ID}"`));
  assert.match(contents[2], new RegExp(`declare_id!\\("${PROGRAM_ID}"\\)`));
});

test('historical evidence remains distinct from the current Devnet identity', async () => {
  const historical = await readFile(path.join(root, 'docs/approval-packets/2026-08-10-x86-claim-validation-evidence.md'), 'utf8');
  assert.match(historical, /Evidence only/);
  assert.doesNotMatch(historical, new RegExp(PROGRAM_ID));
});
