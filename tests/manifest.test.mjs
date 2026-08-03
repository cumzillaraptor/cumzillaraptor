import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { MerkleTree } = require('merkletreejs');
const { keccak256 } = require('@ethersproject/keccak256');

const root = path.resolve(import.meta.dirname, '..');
const generator = path.join(root, 'scripts', 'generate-launch-manifest.js');
const testTempRoot = path.join(tmpdir(), 'cumzillaraptors-tests');

async function makeTempDir(prefix) {
  await mkdir(testTempRoot, { recursive: true });
  return mkdtemp(path.join(testTempRoot, prefix));
}

async function writeCanonicalInputs(dir) {
  const sourceDir = path.join(dir, 'source');
  await mkdir(sourceDir, { recursive: true });
  await Promise.all([
    copyFile(path.join(root, 'nft-data', 'allocation-source', 'mint_list.csv'), path.join(sourceDir, 'mint_list.csv')),
    copyFile(path.join(root, 'nft-data', 'allocation-source', 'reserve_list.csv'), path.join(sourceDir, 'reserve_list.csv')),
    copyFile(path.join(root, 'nft-data', 'merkle-config.json'), path.join(dir, 'merkle-config.json')),
    copyFile(path.join(root, 'nft-data', 'claim-proofs.json'), path.join(dir, 'claim-proofs.json')),
  ]);
  return {
    CUMZ_SOURCE_DIR: sourceDir,
    CUMZ_CLAIM_CONFIG: path.join(dir, 'merkle-config.json'),
    CUMZ_CLAIM_PROOFS: path.join(dir, 'claim-proofs.json'),
  };
}
const programId = '2YTAvP54MuSd7uUGbG9LrWiXCYh5UNHyqvy6XqxCTda2';
const collection = '8eCKWEHZ525kBLnh4mQBnhpkk4nmde5jSeQC7FGR8t3d';

async function writeValidUriMap(file) {
  const id = 'a'.repeat(43);
  await writeFile(file, JSON.stringify({
    collectionUri: `ar://${id}`,
    metadataUris: Object.fromEntries(Array.from({ length: 420 }, (_, i) => [String(i + 1), `ar://${String(i + 1).padStart(3, 'a')}${'b'.repeat(40)}`])),
  }));
}

async function runGenerator(output, extra = [], env = {}) {
  const result = spawnSync('node', [generator,
    '--cluster', 'devnet',
    '--program-id', programId,
    '--collection', collection,
    '--output', output,
    ...extra,
  ], { cwd: root, encoding: 'utf8', env: { ...process.env, ...env } });
  return result;
}

test('generator produces an exact immutable 246/174 partition with stable allocation hash', async () => {
  const dir = await makeTempDir('cumz-manifest-');
  try {
    const inputs = await writeCanonicalInputs(dir);
    const first = path.join(dir, 'first.json');
    const second = path.join(dir, 'second.json');
    const uriMap = path.join(dir, 'uris.json');
    await writeValidUriMap(uriMap);
    assert.equal((await runGenerator(first, ['--uri-map', uriMap], inputs)).status, 0);
    assert.equal((await runGenerator(second, ['--uri-map', uriMap], inputs)).status, 0);

    const a = JSON.parse(await readFile(first, 'utf8'));
    const b = JSON.parse(await readFile(second, 'utf8'));

    assert.equal(a.version, 'CUMZILLARAPTORS_ALLOCATION_V1');
    assert.equal(a.cluster, 'devnet');
    assert.equal(a.programId, programId);
    assert.equal(a.collection, collection);
    assert.equal(a.publicIds.length, 246);
    assert.equal(a.claimIds.length, 174);
    assert.equal(new Set(a.publicIds).size, 246);
    assert.equal(new Set(a.claimIds).size, 174);

    const readCsvIds = async (file) => (await readFile(file, 'utf8')).trim().split(/\r?\n/).slice(1).map((line) => Number(line.split(',')[0]));
    assert.deepEqual(a.publicIds, await readCsvIds(path.join(inputs.CUMZ_SOURCE_DIR, 'mint_list.csv')));
    assert.deepEqual(a.claimIds, await readCsvIds(path.join(inputs.CUMZ_SOURCE_DIR, 'reserve_list.csv')));
    const allIds = [...a.publicIds, ...a.claimIds].sort((x, y) => x - y);
    assert.deepEqual(allIds, Array.from({ length: 420 }, (_, i) => i + 1));
    assert.equal(a.allocationHash, b.allocationHash);
    // Fixed V1 interoperability vector for the synthetic URI map from writeValidUriMap().
    assert.equal(a.metadataUriHash, '0x84c26b9592dc0e60e39f49902963206196300735004239f1a6b99e81ee1778bd');
    assert.equal(a.allocationHash, '0xcf6bc1e5431ae33739b8a9111ce3ab7b8ee2a36a349965d785295361041b457c');
    assert.match(a.allocationHash, /^0x[0-9a-f]{64}$/);
    assert.match(a.metadataUriHash, /^0x[0-9a-f]{64}$/);
    assert.match(a.claimRoot, /^0x[0-9a-f]{64}$/);
    assert.deepEqual(a.auditSummary, { publicCount: 246, claimCount: 174, totalCount: 420, partitionValid: true });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('generator rejects placeholder metadata URIs', async () => {
  const dir = await makeTempDir('cumz-manifest-placeholder-');
  try {
    const inputs = await writeCanonicalInputs(dir);
    const uriMap = path.join(dir, 'uris.json');
    await writeFile(uriMap, JSON.stringify({
      collectionUri: 'ar://PLACEHOLDER_COLLECTION_IMAGE',
      metadataUris: Object.fromEntries(Array.from({ length: 420 }, (_, i) => [String(i + 1), `ar://PLACEHOLDER_${i + 1}`])),
    }));
    const output = path.join(dir, 'manifest.json');
    const result = await runGenerator(output, ['--uri-map', uriMap], inputs);
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /placeholder/i);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('generator rejects a leading-zero CSV ID and requires lowercase claim roots', async () => {
  const source = await readFile(generator, 'utf8');
  assert.match(source, /\^\[1-9\]\\d\*\$/);
  assert.match(source, /\^0x\[0-9a-f\]\{64\}\$/);
  assert.doesNotMatch(source, /\^0x\[0-9a-f\]\{64\}\$\/i/);

  const dir = await makeTempDir('cumz-manifest-leading-zero-');
  try {
    const inputs = await writeCanonicalInputs(dir);
    const mintCsv = await readFile(path.join(inputs.CUMZ_SOURCE_DIR, 'mint_list.csv'), 'utf8');
    const malformedMintCsv = path.join(dir, 'mint_list.csv');
    await writeFile(malformedMintCsv, mintCsv.replace(/^(\d+),/m, '01,'));
    const uriMap = path.join(dir, 'uris.json');
    await writeValidUriMap(uriMap);
    const result = await runGenerator(path.join(dir, 'manifest.json'), ['--uri-map', uriMap], { ...inputs, CUMZ_MINT_CSV: malformedMintCsv });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /canonical base-10/i);

    const claimConfig = JSON.parse(await readFile(inputs.CUMZ_CLAIM_CONFIG, 'utf8'));
    const uppercaseConfig = path.join(dir, 'uppercase-root.json');
    await writeFile(uppercaseConfig, JSON.stringify({ ...claimConfig, merkleRoot: claimConfig.merkleRoot.toUpperCase().replace('0X', '0x') }));
    const uppercaseResult = await runGenerator(path.join(dir, 'uppercase-root-manifest.json'), ['--uri-map', uriMap], { ...inputs, CUMZ_CLAIM_CONFIG: uppercaseConfig });
    assert.notEqual(uppercaseResult.status, 0);
    assert.match(`${uppercaseResult.stdout}\n${uppercaseResult.stderr}`, /lowercase/i);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('generator rejects a claim root unrelated to canonical claim proof records and extra URI keys', async () => {
  const dir = await makeTempDir('cumz-manifest-linkage-');
  try {
    const inputs = await writeCanonicalInputs(dir);
    const uriMap = path.join(dir, 'uris.json');
    await writeValidUriMap(uriMap);
    const config = JSON.parse(await readFile(inputs.CUMZ_CLAIM_CONFIG, 'utf8'));
    const mismatchedConfig = path.join(dir, 'mismatched-root.json');
    await writeFile(mismatchedConfig, JSON.stringify({ ...config, merkleRoot: `0x${'1'.repeat(64)}` }));
    const rootResult = await runGenerator(path.join(dir, 'root-manifest.json'), ['--uri-map', uriMap], { ...inputs, CUMZ_CLAIM_CONFIG: mismatchedConfig });
    assert.notEqual(rootResult.status, 0);
    assert.match(`${rootResult.stdout}\n${rootResult.stderr}`, /does not match.*claim proof/i);

    const extraUriMap = JSON.parse(await readFile(uriMap, 'utf8'));
    extraUriMap.metadataUris['421'] = `ar://${'z'.repeat(43)}`;
    const extraUriMapPath = path.join(dir, 'extra-uris.json');
    await writeFile(extraUriMapPath, JSON.stringify(extraUriMap));
    const uriResult = await runGenerator(path.join(dir, 'uri-manifest.json'), ['--uri-map', extraUriMapPath], inputs);
    assert.notEqual(uriResult.status, 0);
    assert.match(`${uriResult.stdout}\n${uriResult.stderr}`, /exactly canonical metadata URI keys/i);

    const originalProofs = JSON.parse(await readFile(inputs.CUMZ_CLAIM_PROOFS, 'utf8'));
    const ids = Object.keys(originalProofs).sort((a, b) => Number(a) - Number(b));
    const [firstId, secondId] = ids;
    const mutatedProofs = structuredClone(originalProofs);
    const first = mutatedProofs[firstId];
    const second = mutatedProofs[secondId];
    mutatedProofs[firstId] = { ...second, nftNumber: Number(firstId) };
    mutatedProofs[secondId] = { ...first, nftNumber: Number(secondId) };
    const leaves = Object.values(mutatedProofs).map((record) => keccak256(Buffer.concat([
      Buffer.from(record.ethAddress.slice(2), 'hex'),
      Buffer.from([record.nftNumber >> 8, record.nftNumber & 0xff]),
    ])));
    const mutatedRoot = `0x${new MerkleTree(leaves, keccak256, { sortPairs: true }).getRoot().toString('hex')}`;
    const mutatedProofFile = path.join(dir, 'mutated-proofs.json');
    await writeFile(mutatedProofFile, JSON.stringify(mutatedProofs));
    const mutatedConfig = path.join(dir, 'mutated-config.json');
    await writeFile(mutatedConfig, JSON.stringify({ ...config, merkleRoot: mutatedRoot }));
    const mappingResult = await runGenerator(path.join(dir, 'mapping-manifest.json'), ['--uri-map', uriMap], {
      ...inputs,
      CUMZ_CLAIM_CONFIG: mutatedConfig,
      CUMZ_CLAIM_PROOFS: mutatedProofFile,
    });
    assert.notEqual(mappingResult.status, 0);
    assert.match(`${mappingResult.stdout}\n${mappingResult.stderr}`, /does not match canonical reserve CSV/i);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('generator rejects an invalid Solana program ID', async () => {
  const dir = await makeTempDir('cumz-manifest-program-');
  try {
    const inputs = await writeCanonicalInputs(dir);
    const output = path.join(dir, 'manifest.json');
    const uriMap = path.join(dir, 'uris.json');
    await writeValidUriMap(uriMap);
    const result = spawnSync('node', [generator,
      '--cluster', 'devnet',
      '--program-id', 'not-a-public-key',
      '--collection', collection,
      '--uri-map', uriMap,
      '--output', output,
    ], { cwd: root, encoding: 'utf8', env: { ...process.env, ...inputs } });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}\n${result.stderr}`, /program id/i);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
