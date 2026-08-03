import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const generator = path.join(root, 'scripts', 'generate-launch-manifest.js');
const programId = '2YTAvP54MuSd7uUGbG9LrWiXCYh5UNHyqvy6XqxCTda2';
const collection = '8eCKWEHZ525kBLnh4mQBnhpkk4nmde5jSeQC7FGR8t3d';

function run(output, env) {
  return spawnSync('node', [generator,
    '--cluster', 'devnet', '--program-id', programId, '--collection', collection,
    '--uri-map', path.join(root, 'nft-data', 'uri-map.devnet.json'), '--output', output,
  ], { cwd: root, env: { ...process.env, ...env }, encoding: 'utf8' });
}

test('launch manifest binds the V1 claim root and metadata Merkle root, not legacy artifacts', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'cumz-launch-v1-'));
  try {
    const output = path.join(dir, 'manifest.json');
    const result = run(output, {});
    assert.equal(result.status, 0, result.stderr);
    const manifest = JSON.parse(await readFile(output, 'utf8'));
    const claims = JSON.parse(await readFile(path.join(root, 'nft-data', 'claims-v1.devnet.json'), 'utf8'));
    const metadata = JSON.parse(await readFile(path.join(root, 'nft-data', 'metadata-merkle-v1.devnet.json'), 'utf8'));
    assert.equal(manifest.claimRoot, claims.merkleRoot);
    assert.equal(manifest.metadataRoot, metadata.merkleRoot);
    assert.equal('metadataUriHash' in manifest, false);

    const legacyAttempt = run(path.join(dir, 'legacy.json'), {
      CUMZ_CLAIMS_V1: path.join(root, 'nft-data', 'claim-proofs.json'),
    });
    assert.notEqual(legacyAttempt.status, 0);
    assert.match(`${legacyAttempt.stdout}\n${legacyAttempt.stderr}`, /V1 claim/i);

    const badMetadata = JSON.parse(await readFile(path.join(root, 'nft-data', 'metadata-merkle-v1.devnet.json'), 'utf8'));
    badMetadata.metadata['360'].uri = 'ar://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const badPath = path.join(dir, 'bad-metadata.json');
    await writeFile(badPath, JSON.stringify(badMetadata));
    const mismatch = run(path.join(dir, 'mismatch.json'), { CUMZ_METADATA_MERKLE: badPath });
    assert.notEqual(mismatch.status, 0);
    assert.match(`${mismatch.stdout}\n${mismatch.stderr}`, /metadata/i);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('launch state names metadata_root and has no mutable metadata-root setter', async () => {
  const [state, lib] = await Promise.all([
    readFile(path.join(root, 'programs/cumzillaraptors/src/state.rs'), 'utf8'),
    readFile(path.join(root, 'programs/cumzillaraptors/src/lib.rs'), 'utf8'),
  ]);
  assert.match(state, /pub metadata_root: \[u8; 32\]/);
  assert.doesNotMatch(state, /pub metadata_hash:/);
  assert.doesNotMatch(lib, /pub fn (?:update|set)_metadata_root/);
});
