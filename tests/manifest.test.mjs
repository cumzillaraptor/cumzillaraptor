import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const generator = path.join(root, 'scripts', 'generate-launch-manifest.js');
const metadataGenerator = path.join(root, 'scripts', 'generate-metadata-merkle-tree.js');
const testTempRoot = path.join(tmpdir(), 'cumzillaraptors-tests');
const programId = 'AYE4iC2gp81H8jvMjk4EGxWP2sJFzuDptUwxqwTZYTMY';
const collection = '8eCKWEHZ525kBLnh4mQBnhpkk4nmde5jSeQC7FGR8t3d';

async function makeTempDir(prefix) {
  await mkdir(testTempRoot, { recursive: true });
  return mkdtemp(path.join(testTempRoot, prefix));
}

function validUriMap() {
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
    collectionUri: `ar://${'a'.repeat(43)}`,
    metadataUris: Object.fromEntries(Array.from({ length: 420 }, (_, i) => [String(i + 1), `ar://${String(i + 1).padStart(3, 'a')}${'b'.repeat(40)}`])),
  };
}

function spawnManifest(output, env) {
  return spawnSync('node', [generator,
    '--cluster', 'devnet', '--program-id', programId, '--collection', collection,
    '--uri-map', env.CUMZ_URI_MAP, '--output', output,
  ], { cwd: root, encoding: 'utf8', env: { ...process.env, ...env } });
}

async function canonicalInputs(dir) {
  const sourceDir = path.join(dir, 'source');
  const uriMap = path.join(dir, 'uris.json');
  const claims = path.join(dir, 'claims-v1.devnet.json');
  const metadata = path.join(dir, 'metadata-merkle-v1.devnet.json');
  await mkdir(sourceDir, { recursive: true });
  await Promise.all([
    copyFile(path.join(root, 'nft-data', 'allocation-source', 'mint_list.csv'), path.join(sourceDir, 'mint_list.csv')),
    copyFile(path.join(root, 'nft-data', 'allocation-source', 'reserve_list.csv'), path.join(sourceDir, 'reserve_list.csv')),
    copyFile(path.join(root, 'nft-data', 'claims-v1.devnet.json'), claims),
    writeFile(uriMap, JSON.stringify(validUriMap())),
  ]);
  const metadataResult = spawnSync('node', [metadataGenerator,
    '--cluster', 'devnet', '--program-id', programId, '--uri-map', uriMap, '--output', metadata,
  ], { cwd: root, encoding: 'utf8' });
  assert.equal(metadataResult.status, 0, metadataResult.stderr);
  return { CUMZ_SOURCE_DIR: sourceDir, CUMZ_CLAIMS_V1: claims, CUMZ_METADATA_MERKLE: metadata, CUMZ_URI_MAP: uriMap };
}

test('generator produces immutable 246/174 V1-claim and metadata-root manifest', async () => {
  const dir = await makeTempDir('cumz-manifest-');
  try {
    const env = await canonicalInputs(dir);
    const first = path.join(dir, 'first.json');
    const second = path.join(dir, 'second.json');
    assert.equal(spawnManifest(first, env).status, 0);
    assert.equal(spawnManifest(second, env).status, 0);
    const a = JSON.parse(await readFile(first, 'utf8'));
    const b = JSON.parse(await readFile(second, 'utf8'));
    const claims = JSON.parse(await readFile(env.CUMZ_CLAIMS_V1, 'utf8'));
    const metadata = JSON.parse(await readFile(env.CUMZ_METADATA_MERKLE, 'utf8'));
    assert.equal(a.version, 'CUMZILLARAPTORS_ALLOCATION_V1');
    assert.equal(a.publicIds.length, 246);
    assert.equal(a.claimIds.length, 174);
    assert.equal(a.claimRoot, claims.merkleRoot);
    assert.equal(a.metadataRoot, metadata.merkleRoot);
    assert.equal('metadataUriHash' in a, false);
    assert.deepEqual(a.auditSummary, { publicCount: 246, claimCount: 174, totalCount: 420, partitionValid: true });
    assert.equal(a.allocationHash, b.allocationHash);
    assert.match(a.allocationHash, /^0x[0-9a-f]{64}$/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('generator rejects legacy claim artifacts, non-V1 roots, and metadata/URI mismatches', async () => {
  const dir = await makeTempDir('cumz-manifest-negative-');
  try {
    const env = await canonicalInputs(dir);
    const legacy = spawnManifest(path.join(dir, 'legacy.json'), { ...env, CUMZ_CLAIMS_V1: path.join(root, 'nft-data', 'claim-proofs.json') });
    assert.notEqual(legacy.status, 0);
    assert.match(`${legacy.stdout}\n${legacy.stderr}`, /V1 claim/i);

    const claims = JSON.parse(await readFile(env.CUMZ_CLAIMS_V1, 'utf8'));
    const badClaims = path.join(dir, 'bad-claims.json');
    await writeFile(badClaims, JSON.stringify({ ...claims, merkleRoot: `0x${'1'.repeat(64)}` }));
    const badRoot = spawnManifest(path.join(dir, 'bad-root.json'), { ...env, CUMZ_CLAIMS_V1: badClaims });
    assert.notEqual(badRoot.status, 0);
    assert.match(`${badRoot.stdout}\n${badRoot.stderr}`, /claim root/i);

    const mutatedClaims = structuredClone(claims);
    mutatedClaims.claims.find((record) => record.nftId === 360).nonceHex = `0x${'01'.repeat(32)}`;
    const mutatedClaimsPath = path.join(dir, 'mutated-claims.json');
    await writeFile(mutatedClaimsPath, JSON.stringify(mutatedClaims));
    const leafMismatch = spawnManifest(path.join(dir, 'leaf-mismatch.json'), { ...env, CUMZ_CLAIMS_V1: mutatedClaimsPath });
    assert.notEqual(leafMismatch.status, 0);
    assert.match(`${leafMismatch.stdout}\n${leafMismatch.stderr}`, /claim leaf/i);

    const metadata = JSON.parse(await readFile(env.CUMZ_METADATA_MERKLE, 'utf8'));
    metadata.metadata['360'].uri = `ar://${'z'.repeat(43)}`;
    const badMetadata = path.join(dir, 'bad-metadata.json');
    await writeFile(badMetadata, JSON.stringify(metadata));
    const mismatch = spawnManifest(path.join(dir, 'bad-metadata-manifest.json'), { ...env, CUMZ_METADATA_MERKLE: badMetadata });
    assert.notEqual(mismatch.status, 0);
    assert.match(`${mismatch.stdout}\n${mismatch.stderr}`, /metadata/i);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('generator rejects malformed allocation CSV and URI map keys', async () => {
  const dir = await makeTempDir('cumz-manifest-inputs-');
  try {
    const env = await canonicalInputs(dir);
    const mint = await readFile(path.join(env.CUMZ_SOURCE_DIR, 'mint_list.csv'), 'utf8');
    const malformed = path.join(dir, 'leading-zero-mint.csv');
    await writeFile(malformed, mint.replace(/^(\d+),/m, '01,'));
    const malformedResult = spawnManifest(path.join(dir, 'bad-mint.json'), { ...env, CUMZ_MINT_CSV: malformed });
    assert.notEqual(malformedResult.status, 0);
    assert.match(`${malformedResult.stdout}\n${malformedResult.stderr}`, /canonical base-10/i);

    const uriMap = JSON.parse(await readFile(env.CUMZ_URI_MAP, 'utf8'));
    uriMap.metadataUris['421'] = `ar://${'z'.repeat(43)}`;
    const badUri = path.join(dir, 'bad-uri-map.json');
    await writeFile(badUri, JSON.stringify(uriMap));
    const badUriResult = spawnManifest(path.join(dir, 'bad-uri.json'), { ...env, CUMZ_URI_MAP: badUri });
    assert.notEqual(badUriResult.status, 0);
    assert.match(`${badUriResult.stdout}\n${badUriResult.stderr}`, /canonical metadata URI keys/i);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
