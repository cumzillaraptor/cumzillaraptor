import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { MerkleTree } = require('merkletreejs');
const { keccak256 } = require('@ethersproject/keccak256');

const root = path.resolve(import.meta.dirname, '..');
const generator = path.join(root, 'scripts', 'generate-metadata-merkle-tree.js');
const programId = '2YTAvP54MuSd7uUGbG9LrWiXCYh5UNHyqvy6XqxCTda2';
const collectionUri = `ar://${'c'.repeat(43)}`;

function uriFor(id) {
  return `ar://${String(id).padStart(3, 'a')}${'b'.repeat(40)}`;
}

function validMap() {
  return {
    version: 'CUMZILLARAPTORS_URI_MAP_V1',
    cluster: 'devnet',
    programId,
    source: {
      receiptVersion: 'CUMZILLARAPTORS_IRYS_METADATA_URIS_V2',
      verificationVersion: 'CUMZILLARAPTORS_METADATA_UPLOAD_VERIFICATION_V2',
      stagedManifestSha256: 'a'.repeat(64),
      verifiedFiles: 421,
      passed: 421,
      failed: 0,
    },
    collectionUri,
    metadataUris: Object.fromEntries(Array.from({ length: 420 }, (_, index) => [String(index + 1), uriFor(index + 1)])),
  };
}

function run(uriMap, output) {
  return spawnSync('node', [generator,
    '--cluster', 'devnet',
    '--program-id', programId,
    '--uri-map', uriMap,
    '--output', output,
  ], { cwd: root, encoding: 'utf8' });
}

test('metadata generator commits exact ID/name/URI leaves and deterministic proofs', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'cumz-metadata-merkle-'));
  try {
    const input = path.join(dir, 'uris.json');
    const first = path.join(dir, 'first.json');
    const second = path.join(dir, 'second.json');
    await writeFile(input, JSON.stringify(validMap()));
    assert.equal(run(input, first).status, 0);
    assert.equal(run(input, second).status, 0);
    const a = JSON.parse(await readFile(first, 'utf8'));
    const b = JSON.parse(await readFile(second, 'utf8'));
    assert.equal(a.version, 'CUMZILLARAPTORS_METADATA_V1');
    assert.equal(a.cluster, 'devnet');
    assert.equal(a.programId, programId);
    assert.equal(a.totalMetadata, 420);
    assert.match(a.merkleRoot, /^0x[0-9a-f]{64}$/);
    assert.deepEqual(a, b);
    assert.deepEqual(a.metadata['360'], {
      nftId: 360,
      name: 'cumzillaraptor #360',
      uri: uriFor(360),
      leaf: a.metadata['360'].leaf,
      proof: a.metadata['360'].proof,
    });
    assert.match(a.metadata['360'].leaf, /^0x[0-9a-f]{64}$/);
    assert.ok(a.metadata['360'].proof.length > 0);
    const tree = new MerkleTree(Object.values(a.metadata).map((record) => record.leaf), keccak256, { sortPairs: true });
    assert.equal(`0x${tree.getRoot().toString('hex')}`, a.merkleRoot);
    for (const record of Object.values(a.metadata)) {
      assert.equal(tree.verify(record.proof, record.leaf, a.merkleRoot), true, `proof for NFT #${record.nftId}`);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('metadata generator rejects arbitrary or incomplete caller URI maps', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'cumz-metadata-merkle-invalid-'));
  try {
    const badPlaceholder = validMap();
    badPlaceholder.metadataUris['360'] = 'ar://PLACEHOLDER_0360';
    const placeholder = path.join(dir, 'placeholder.json');
    await writeFile(placeholder, JSON.stringify(badPlaceholder));
    const placeholderResult = run(placeholder, path.join(dir, 'placeholder-output.json'));
    assert.notEqual(placeholderResult.status, 0);
    assert.match(`${placeholderResult.stdout}\n${placeholderResult.stderr}`, /URI/i);

    const missing = validMap();
    delete missing.metadataUris['360'];
    const missingPath = path.join(dir, 'missing.json');
    await writeFile(missingPath, JSON.stringify(missing));
    const missingResult = run(missingPath, path.join(dir, 'missing-output.json'));
    assert.notEqual(missingResult.status, 0);
    assert.match(`${missingResult.stdout}\n${missingResult.stderr}`, /canonical metadata URI keys/i);

    const extra = validMap();
    extra.metadataUris['421'] = uriFor(421);
    const extraPath = path.join(dir, 'extra.json');
    await writeFile(extraPath, JSON.stringify(extra));
    const extraResult = run(extraPath, path.join(dir, 'extra-output.json'));
    assert.notEqual(extraResult.status, 0);
    assert.match(`${extraResult.stdout}\n${extraResult.stderr}`, /canonical metadata URI keys/i);

    const missingProvenance = validMap();
    delete missingProvenance.source;
    const provenancePath = path.join(dir, 'missing-provenance.json');
    await writeFile(provenancePath, JSON.stringify(missingProvenance));
    const provenanceResult = run(provenancePath, path.join(dir, 'missing-provenance-output.json'));
    assert.notEqual(provenanceResult.status, 0);
    assert.match(`${provenanceResult.stdout}\n${provenanceResult.stderr}`, /provenance/i);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
