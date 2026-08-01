import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const stagedTreasury = 'FiHKQhwq2ZKkD2ZbBf3mPYgyw2Y9QDzNYykpMGErovU6';
const sourceTreasuryPlaceholder = 'PLACEHOLDER_TREASURY';
const receipt = '/home/raspberrypi/.config/cumzillaraptor/upload-receipts/irys-image-uris.v1.json';

test('final metadata staging injects permanent image URIs and the approved treasury without mutating sources', async () => {
  const output = await mkdtemp(path.join(tmpdir(), 'cumz-final-metadata-'));
  try {
    const before = await readFile(path.join(root, 'nft-data', 'metadata', '116.json'), 'utf8');
    const result = spawnSync('node', ['scripts/prepare-final-metadata.mjs',
      '--metadata', 'nft-data/metadata', '--collection-metadata', 'nft-data/collection.json',
      '--image-receipts', receipt, '--treasury', stagedTreasury, '--output', output,
    ], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /no wallet loaded, no signing, no funding, no upload/i);
    const nft = JSON.parse(await readFile(path.join(output, 'metadata', '116.json'), 'utf8'));
    const collection = JSON.parse(await readFile(path.join(output, 'collection.json'), 'utf8'));
    assert.match(nft.image, /^ar:\/\/[A-Za-z0-9_-]{43}$/);
    assert.equal(nft.image, nft.properties.files[0].uri);
    assert.equal(nft.properties.creators[0].address, stagedTreasury);
    assert.equal(nft.seller_fee_basis_points, 500);
    assert.ok(nft.attributes.length > 0);
    assert.equal(collection.image, 'ar://693Y6HJJroK7oKHxgUixVkUexk7K7ACGW9NR4p3UkOU');
    assert.equal(collection.properties.creators[0].address, stagedTreasury);
    assert.equal(collection.seller_fee_basis_points, 500);
    const after = await readFile(path.join(root, 'nft-data', 'metadata', '116.json'), 'utf8');
    assert.equal(after, before);
    assert.match(after, new RegExp(sourceTreasuryPlaceholder));
  } finally { await rm(output, { recursive: true, force: true }); }
});
