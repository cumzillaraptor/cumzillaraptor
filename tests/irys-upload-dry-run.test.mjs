import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const script = path.join(root, 'scripts', 'prepare-irys-upload-dry-run.mjs');
const images = '/home/raspberrypi/nft-collection/cumzillaraptors_solana/images';
const metadata = path.join(root, 'nft-data', 'metadata');
const collection = path.join(root, 'nft-data', 'collection.json');
const treasury = '8eCKWEHZ525kBLnh4mQBnhpkk4nmde5jSeQC7FGR8t3d';

test('Irys dry run inventories all source files without signing, uploading, or rewriting metadata', async () => {
  const output = await mkdtemp(path.join(tmpdir(), 'cumz-irys-dry-run-'));
  try {
    const result = spawnSync('node', [script,
      '--images', images,
      '--metadata', metadata,
      '--collection-metadata', collection,
      '--collection-image-id', '116',
      '--treasury', treasury,
      '--output', output,
    ], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /DRY RUN ONLY/);
    const manifest = JSON.parse(await readFile(path.join(output, 'irys-upload-plan.v1.json'), 'utf8'));
    assert.equal(manifest.dryRun, true);
    assert.equal(manifest.collectionImage.id, 116);
    assert.equal(manifest.collectionImage.sourcePath, path.join(images, '0116.png'));
    assert.equal(manifest.royaltyTreasury, treasury);
    assert.deepEqual(manifest.counts, { nftImages: 420, nftMetadata: 420, collectionImage: 1, collectionMetadata: 1, totalUploads: 842 });
    assert.equal(manifest.phases[0].kind, 'nft-images');
    assert.equal(manifest.phases.at(-1).kind, 'collection-metadata');
    assert.equal(manifest.placeholderPolicy, 'Source metadata remains unchanged; permanent ar:// URIs are required before JSON upload.');
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});

test('Irys dry run rejects a collection image ID outside the supplied 420-image set', async () => {
  const output = await mkdtemp(path.join(tmpdir(), 'cumz-irys-invalid-'));
  try {
    const result = spawnSync('node', [script,
      '--images', images, '--metadata', metadata, '--collection-metadata', collection,
      '--collection-image-id', '421', '--treasury', treasury, '--output', output,
    ], { cwd: root, encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /collection image/i);
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});
