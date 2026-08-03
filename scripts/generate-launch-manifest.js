#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { PublicKey } = require('@solana/web3.js');
const { keccak256 } = require('@ethersproject/keccak256');
const { MerkleTree } = require('merkletreejs');
const { deterministicNonce, makeClaimLeaf } = require('./claim-message-v1');
const { leaf: metadataLeaf } = require('./generate-metadata-merkle-tree');

const VERSION = 'CUMZILLARAPTORS_ALLOCATION_V1';
const CLAIM_VERSION = 'CUMZILLARAPTORS_CLAIM_V1';
const METADATA_VERSION = 'CUMZILLARAPTORS_METADATA_V1';
const ROOT = path.resolve(__dirname, '..');
const SOURCE_DIR = process.env.CUMZ_SOURCE_DIR || path.join(ROOT, 'nft-data', 'allocation-source');
const MINT_CSV = process.env.CUMZ_MINT_CSV || path.join(SOURCE_DIR, 'mint_list.csv');
const RESERVE_CSV = process.env.CUMZ_RESERVE_CSV || path.join(SOURCE_DIR, 'reserve_list.csv');
const CLAIMS_V1 = process.env.CUMZ_CLAIMS_V1 || path.join(ROOT, 'nft-data', 'claims-v1.devnet.json');
const METADATA_MERKLE = process.env.CUMZ_METADATA_MERKLE || path.join(ROOT, 'nft-data', 'metadata-merkle-v1.devnet.json');
const PUBLIC_COUNT = 246;
const CLAIM_COUNT = 174;
const NFT_COUNT = 420;

function fail(message) { throw new Error(message); }

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith('--') || !value || value.startsWith('--')) {
      fail('Usage: node scripts/generate-launch-manifest.js --cluster <tag> --program-id <pubkey> --collection <pubkey> --uri-map <file> --output <file>');
    }
    args[flag.slice(2)] = value;
  }
  for (const key of ['cluster', 'program-id', 'collection', 'uri-map', 'output']) if (!args[key]) fail(`Missing required --${key}`);
  if (!/^[a-z0-9-]{1,32}$/.test(args.cluster)) fail('Cluster tag must be lowercase alphanumeric or hyphen.');
  return args;
}

function publicKeyBytes(value, label) {
  try { return new PublicKey(value).toBuffer(); } catch { fail(`Invalid ${label}: expected a Solana public key.`); }
}

function parseCsvRows(file, expectedCount, label, requireWallet = false) {
  const lines = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/);
  if (lines.length !== expectedCount + 1) fail(`${label} CSV must have ${expectedCount} rows plus header.`);
  const rows = lines.slice(1).map((line, index) => {
    const columns = line.split(',');
    const idText = columns[0];
    if (!/^[1-9]\d*$/.test(idText)) fail(`${label} CSV row ${index + 2} must use a canonical base-10 NFT ID.`);
    const id = Number(idText);
    if (!Number.isSafeInteger(id) || id < 1 || id > NFT_COUNT) fail(`${label} CSV row ${index + 2} has invalid NFT ID.`);
    const ethAddress = columns[2]?.toLowerCase();
    if (requireWallet && !/^0x[0-9a-f]{40}$/.test(ethAddress)) fail(`${label} CSV row ${index + 2} has invalid ETH wallet address.`);
    return { id, ethAddress };
  });
  if (new Set(rows.map((row) => row.id)).size !== rows.length) fail(`${label} CSV contains duplicate NFT IDs.`);
  return rows;
}

function bytesU16(value) {
  const result = Buffer.alloc(2);
  result.writeUInt16BE(value);
  return result;
}

function bytesU8(value) {
  if (!Number.isInteger(value) || value < 0 || value > 255) fail('u8 value out of range.');
  return Buffer.from([value]);
}

function hexBytes(value, label) {
  if (!/^0x[0-9a-f]{64}$/.test(value)) fail(`${label} must be a lowercase 32-byte 0x-prefixed hex hash.`);
  return Buffer.from(value.slice(2), 'hex');
}

function validArUri(value) {
  return typeof value === 'string' && /^ar:\/\/[A-Za-z0-9_-]{43}$/.test(value) && !/placeholder/i.test(value);
}

function expectedKeys() { return Array.from({ length: NFT_COUNT }, (_, index) => String(index + 1)); }

function verifyPartition(publicIds, reserveRows) {
  const allIds = [...publicIds, ...reserveRows.map((row) => row.id)];
  const sorted = [...allIds].sort((a, b) => a - b);
  if (new Set(allIds).size !== NFT_COUNT || sorted.length !== NFT_COUNT || sorted.some((id, index) => id !== index + 1)) {
    fail('Mint and reserve lists must be an exact, disjoint partition of IDs 1 through 420.');
  }
}

function verifyV1Claims(claims, reserveRows, args) {
  if (claims.version !== CLAIM_VERSION) fail('Claims file must be the V1 claim dataset.');
  if (claims.cluster !== args.cluster || claims.programId !== args['program-id']) fail('V1 claim dataset cluster or program ID does not match manifest arguments.');
  if (claims.totalClaims !== CLAIM_COUNT || !Array.isArray(claims.claims) || claims.claims.length !== CLAIM_COUNT) fail(`V1 claim dataset must contain exactly ${CLAIM_COUNT} claims.`);
  const reserveById = new Map(reserveRows.map((row) => [row.id, row.ethAddress]));
  const seen = new Set();
  const leaves = claims.claims.map((record) => {
    if (!Number.isInteger(record.nftId) || !/^[1-9]\d*$/.test(String(record.nftId)) || !/^0x[0-9a-f]{40}$/.test(record.ethAddress) || !/^0x[0-9a-f]{64}$/.test(record.nonceHex) || !/^0x[0-9a-f]{64}$/.test(record.leaf)) fail('V1 claim record has invalid ID, ETH address, nonce, or leaf.');
    if (reserveById.get(record.nftId) !== record.ethAddress) fail('V1 claim record does not match canonical reserve CSV ID and ETH wallet.');
    const expectedNonce = deterministicNonce({ programId: args['program-id'], clusterTag: args.cluster, ethAddress: record.ethAddress, nftId: record.nftId });
    const expectedLeaf = makeClaimLeaf({ programId: args['program-id'], clusterTag: args.cluster, ethAddress: record.ethAddress, nftId: record.nftId, nonceHex: expectedNonce });
    if (record.nonceHex !== expectedNonce || record.leaf !== expectedLeaf) fail('V1 claim leaf does not match canonical claim record.');
    if (seen.has(record.nftId)) fail('V1 claim dataset contains duplicate NFT IDs.');
    seen.add(record.nftId);
    return record.leaf;
  });
  if (seen.size !== reserveRows.length) fail('V1 claim records do not cover every reserve CSV NFT ID.');
  const tree = new MerkleTree(leaves, keccak256, { sortPairs: true });
  const root = `0x${tree.getRoot().toString('hex')}`;
  if (root !== claims.merkleRoot) fail('V1 claim root does not match canonical V1 claim records.');
  for (const record of claims.claims) if (!tree.verify(record.proof, record.leaf, root)) fail('V1 claim proof does not verify.');
  return hexBytes(root, 'V1 claim root');
}

function verifyMetadata(metadata, uriMap, args) {
  if (metadata.version !== METADATA_VERSION) fail('Metadata file must be the V1 metadata Merkle dataset.');
  if (metadata.cluster !== args.cluster || metadata.programId !== args['program-id']) fail('Metadata dataset cluster or program ID does not match manifest arguments.');
  if (metadata.totalMetadata !== NFT_COUNT || !metadata.metadata || typeof metadata.metadata !== 'object' || Array.isArray(metadata.metadata)) fail('Metadata dataset must contain exactly 420 records.');
  if (!validArUri(uriMap.collectionUri)) fail('Collection URI is missing, invalid, or contains a placeholder.');
  const keys = Object.keys(uriMap.metadataUris ?? {}).sort((a, b) => Number(a) - Number(b));
  const expected = expectedKeys();
  if (keys.length !== NFT_COUNT || keys.some((key, index) => key !== expected[index])) fail('URI map must contain exactly canonical metadata URI keys 1 through 420.');
  const records = expected.map((key) => {
    const record = metadata.metadata[key];
    if (!record || record.nftId !== Number(key) || record.name !== `cumzillaraptor #${key}` || record.uri !== uriMap.metadataUris[key] || !/^0x[0-9a-f]{64}$/.test(record.leaf) || !Array.isArray(record.proof)) fail('Metadata record does not match canonical URI map.');
    if (!validArUri(record.uri)) fail(`Metadata URI for NFT #${key} is missing, invalid, or contains a placeholder.`);
    const expectedLeaf = metadataLeaf({ cluster: args.cluster, programId: args['program-id'], nftId: record.nftId, name: record.name, uri: record.uri });
    if (expectedLeaf !== record.leaf) fail('Metadata leaf does not match canonical ID/name/URI record.');
    return record;
  });
  const tree = new MerkleTree(records.map((record) => record.leaf), keccak256, { sortPairs: true });
  const root = `0x${tree.getRoot().toString('hex')}`;
  if (root !== metadata.merkleRoot) fail('Metadata root does not match canonical metadata records.');
  for (const record of records) if (!tree.verify(record.proof, record.leaf, root)) fail('Metadata proof does not verify.');
  return hexBytes(root, 'Metadata root');
}

function allocationHash({ cluster, programBytes, collectionBytes, publicIds, claimRoot, metadataRoot }) {
  const clusterBytes = Buffer.from(cluster, 'utf8');
  return keccak256(Buffer.concat([
    Buffer.from(VERSION, 'utf8'), programBytes, bytesU8(clusterBytes.length), clusterBytes,
    collectionBytes, bytesU16(publicIds.length), ...publicIds.map(bytesU16), claimRoot, metadataRoot,
  ]));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const programBytes = publicKeyBytes(args['program-id'], 'program ID');
  const collectionBytes = publicKeyBytes(args.collection, 'collection');
  const publicIds = parseCsvRows(MINT_CSV, PUBLIC_COUNT, 'Mint').map((row) => row.id);
  const reserveRows = parseCsvRows(RESERVE_CSV, CLAIM_COUNT, 'Reserve', true);
  verifyPartition(publicIds, reserveRows);
  const claims = JSON.parse(fs.readFileSync(CLAIMS_V1, 'utf8'));
  const claimRoot = verifyV1Claims(claims, reserveRows, args);
  const uriMap = JSON.parse(fs.readFileSync(args['uri-map'], 'utf8'));
  const metadata = JSON.parse(fs.readFileSync(METADATA_MERKLE, 'utf8'));
  const metadataRoot = verifyMetadata(metadata, uriMap, args);
  const result = {
    version: VERSION,
    cluster: args.cluster,
    programId: args['program-id'],
    collection: args.collection,
    publicCount: publicIds.length,
    claimCount: reserveRows.length,
    publicIds,
    claimIds: reserveRows.map((row) => row.id),
    claimRoot: claims.merkleRoot,
    metadataRoot: metadata.merkleRoot,
    auditSummary: { publicCount: publicIds.length, claimCount: reserveRows.length, totalCount: NFT_COUNT, partitionValid: true },
    allocationHash: allocationHash({ cluster: args.cluster, programBytes, collectionBytes, publicIds, claimRoot, metadataRoot }),
  };
  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`Wrote ${args.output}`);
  console.log(`Allocation hash: ${result.allocationHash}`);
  console.log(`V1 claim root: ${result.claimRoot}`);
  console.log(`Metadata root: ${result.metadataRoot}`);
  console.log(`Audit summary: public=${result.auditSummary.publicCount}, claim=${result.auditSummary.claimCount}, total=${result.auditSummary.totalCount}, partitionValid=${result.auditSummary.partitionValid}`);
}

try { main(); } catch (error) { console.error(`Error: ${error.message}`); process.exit(1); }
