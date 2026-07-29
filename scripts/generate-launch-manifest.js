#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { PublicKey } = require('@solana/web3.js');
const { keccak256 } = require('@ethersproject/keccak256');
const { MerkleTree } = require('merkletreejs');

const VERSION = 'CUMZILLARAPTORS_ALLOCATION_V1';
const ROOT = path.resolve(__dirname, '..');
const SOURCE_DIR = process.env.CUMZ_SOURCE_DIR || '/home/raspberrypi/nft-collection/cumzillaraptors_solana';
const MINT_CSV = process.env.CUMZ_MINT_CSV || path.join(SOURCE_DIR, 'mint_list.csv');
const RESERVE_CSV = process.env.CUMZ_RESERVE_CSV || path.join(SOURCE_DIR, 'reserve_list.csv');
const CLAIM_CONFIG = process.env.CUMZ_CLAIM_CONFIG || path.join(ROOT, 'nft-data', 'merkle-config.json');
const CLAIM_PROOFS = process.env.CUMZ_CLAIM_PROOFS || path.join(ROOT, 'nft-data', 'claim-proofs.json');

function fail(message) {
  throw new Error(message);
}

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
  for (const key of ['cluster', 'program-id', 'collection', 'uri-map', 'output']) {
    if (!args[key]) fail(`Missing required --${key}`);
  }
  if (!/^[a-z0-9-]{1,32}$/.test(args.cluster)) fail('Cluster tag must be lowercase alphanumeric or hyphen.');
  return args;
}

function publicKeyBytes(value, label) {
  try {
    return new PublicKey(value).toBuffer();
  } catch {
    fail(`Invalid ${label}: expected a Solana public key.`);
  }
}

function parseCsvRows(file, expectedCount, label, requireWallet = false) {
  const lines = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/);
  if (lines.length !== expectedCount + 1) fail(`${label} CSV must have ${expectedCount} rows plus header.`);
  const rows = lines.slice(1).map((line, index) => {
    const columns = line.split(',');
    const idText = columns[0];
    if (!/^[1-9]\d*$/.test(idText)) fail(`${label} CSV row ${index + 2} must use a canonical base-10 NFT ID.`);
    const id = Number(idText);
    if (!Number.isSafeInteger(id) || id < 1 || id > 420) fail(`${label} CSV row ${index + 2} has invalid NFT ID.`);
    const ethAddress = columns[2]?.toLowerCase();
    if (requireWallet && !/^0x[0-9a-f]{40}$/.test(ethAddress)) fail(`${label} CSV row ${index + 2} has invalid ETH wallet address.`);
    return { id, ethAddress };
  });
  if (new Set(rows.map((row) => row.id)).size !== rows.length) fail(`${label} CSV contains duplicate NFT IDs.`);
  return rows;
}

function parseCsvIds(file, expectedCount, label) {
  return parseCsvRows(file, expectedCount, label).map((row) => row.id);
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
  return typeof value === 'string'
    && /^ar:\/\/[A-Za-z0-9_-]{43}$/.test(value)
    && !/placeholder/i.test(value);
}

function verifyClaimProofMapping(claimProofs, reserveRows) {
  const records = Object.entries(claimProofs);
  if (records.length !== reserveRows.length) fail('Claim proofs must contain exactly 173 records.');
  const reserveById = new Map(reserveRows.map((row) => [row.id, row.ethAddress]));
  const seenIds = new Set();
  for (const [key, record] of records) {
    if (!/^[1-9]\d*$/.test(key) || Number(key) !== record.nftNumber) fail('Claim proof key must exactly match record NFT ID.');
    const expectedEthAddress = reserveById.get(record.nftNumber);
    if (!expectedEthAddress || record.ethAddress !== expectedEthAddress) fail('Claim proof record does not match canonical reserve CSV ID and ETH wallet.');
    if (seenIds.has(record.nftNumber)) fail('Claim proof records contain duplicate NFT IDs.');
    seenIds.add(record.nftNumber);
  }
  if (seenIds.size !== reserveRows.length) fail('Claim proof records do not cover every reserve CSV NFT ID.');
}

function recomputeClaimRoot(claimProofs) {
  const records = Object.values(claimProofs);
  if (records.length !== 173) fail('Claim proofs must contain exactly 173 records.');
  const leaves = records.map((record) => {
    if (!/^0x[0-9a-f]{40}$/.test(record.ethAddress) || !Number.isInteger(record.nftNumber) || record.nftNumber < 1 || record.nftNumber > 420) {
      fail('Claim proof record has invalid ETH address or NFT ID.');
    }
    return Buffer.from(keccak256(Buffer.concat([Buffer.from(record.ethAddress.slice(2), 'hex'), bytesU16(record.nftNumber)])).slice(2), 'hex');
  });
  const tree = new MerkleTree(leaves, keccak256, { sortPairs: true });
  return `0x${tree.getRoot().toString('hex')}`;
}

function hashUriMap(uriMap) {
  const chunks = [Buffer.from('CUMZILLARAPTORS_URI_MAP_V1', 'utf8')];
  const collection = Buffer.from(uriMap.collectionUri, 'utf8');
  chunks.push(bytesU16(collection.length), collection);
  for (let id = 1; id <= 420; id += 1) {
    const uri = Buffer.from(uriMap.metadataUris[String(id)], 'utf8');
    chunks.push(bytesU16(id), bytesU16(uri.length), uri);
  }
  return keccak256(Buffer.concat(chunks));
}

function allocationHash({ cluster, programBytes, collectionBytes, publicIds, claimRoot, metadataUriHash }) {
  const clusterBytes = Buffer.from(cluster, 'utf8');
  const ids = publicIds.map(bytesU16);
  const payload = Buffer.concat([
    Buffer.from(VERSION, 'utf8'),
    programBytes,
    bytesU8(clusterBytes.length),
    clusterBytes,
    collectionBytes,
    bytesU16(publicIds.length),
    ...ids,
    claimRoot,
    hexBytes(metadataUriHash, 'Metadata URI hash'),
  ]);
  return keccak256(payload);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const programBytes = publicKeyBytes(args['program-id'], 'program ID');
  const collectionBytes = publicKeyBytes(args.collection, 'collection');
  const publicIds = parseCsvIds(MINT_CSV, 247, 'Mint');
  const reserveRows = parseCsvRows(RESERVE_CSV, 173, 'Reserve', true);
  const claimIds = reserveRows.map((row) => row.id);
  const allIds = [...publicIds, ...claimIds];
  if (new Set(allIds).size !== 420 || allIds.some((id, index) => id !== [...allIds].sort((a, b) => a - b)[index])) {
    const sorted = [...allIds].sort((a, b) => a - b);
    if (sorted.length !== 420 || sorted.some((id, index) => id !== index + 1)) {
      fail('Mint and reserve lists must be an exact, disjoint partition of IDs 1 through 420.');
    }
  }

  const claimConfig = JSON.parse(fs.readFileSync(CLAIM_CONFIG, 'utf8'));
  const claimRoot = hexBytes(claimConfig.merkleRoot, 'Claim root');
  if (claimConfig.totalClaims !== 173) fail('Claim configuration must contain exactly 173 claims.');
  const claimProofs = JSON.parse(fs.readFileSync(CLAIM_PROOFS, 'utf8'));
  verifyClaimProofMapping(claimProofs, reserveRows);
  const recomputedClaimRoot = recomputeClaimRoot(claimProofs);
  if (recomputedClaimRoot !== claimConfig.merkleRoot) fail('Claim root does not match the canonical claim proof records.');

  const uriMap = JSON.parse(fs.readFileSync(args['uri-map'], 'utf8'));
  if (!validArUri(uriMap.collectionUri)) fail('Collection URI is missing, invalid, or contains a placeholder.');
  if (!uriMap.metadataUris || typeof uriMap.metadataUris !== 'object' || Array.isArray(uriMap.metadataUris)) fail('URI map must contain a metadataUris object keyed by NFT ID.');
  const uriKeys = Object.keys(uriMap.metadataUris).sort((a, b) => Number(a) - Number(b));
  const expectedUriKeys = Array.from({ length: 420 }, (_, index) => String(index + 1));
  if (uriKeys.length !== 420 || uriKeys.some((key, index) => key !== expectedUriKeys[index])) fail('URI map must contain exactly canonical metadata URI keys 1 through 420.');
  for (let id = 1; id <= 420; id += 1) {
    if (!validArUri(uriMap.metadataUris[String(id)])) {
      fail(`Metadata URI for NFT #${id} is missing, invalid, or contains a placeholder.`);
    }
  }

  const metadataUriHash = hashUriMap(uriMap);
  const result = {
    version: VERSION,
    cluster: args.cluster,
    programId: args['program-id'],
    collection: args.collection,
    publicCount: publicIds.length,
    claimCount: claimIds.length,
    publicIds,
    claimIds,
    claimRoot: claimConfig.merkleRoot.toLowerCase(),
    metadataUriHash,
    auditSummary: {
      publicCount: publicIds.length,
      claimCount: claimIds.length,
      totalCount: allIds.length,
      partitionValid: true,
    },
    allocationHash: allocationHash({
      cluster: args.cluster,
      programBytes,
      collectionBytes,
      publicIds,
      claimRoot,
      metadataUriHash,
    }),
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`Wrote ${args.output}`);
  console.log(`Allocation hash: ${result.allocationHash}`);
  console.log(`Metadata URI hash: ${result.metadataUriHash}`);
  console.log(`Audit summary: public=${result.auditSummary.publicCount}, claim=${result.auditSummary.claimCount}, total=${result.auditSummary.totalCount}, partitionValid=${result.auditSummary.partitionValid}`);
}

try {
  main();
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exit(1);
}
