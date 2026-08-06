#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { PublicKey } = require('@solana/web3.js');
const { MerkleTree } = require('merkletreejs');
const { keccak256 } = require('@ethersproject/keccak256');

const VERSION = 'CUMZILLARAPTORS_METADATA_V1';
const MAX_NFT_ID = 420;
const ROOT = path.resolve(__dirname, '..');
const MAX_NAME_BYTES = 64;
const MAX_URI_BYTES = 128;
const URI_MAP_VERSION = 'CUMZILLARAPTORS_URI_MAP_V1';
const RECEIPT_VERSION = 'CUMZILLARAPTORS_IRYS_METADATA_URIS_V2';
const VERIFICATION_VERSION = 'CUMZILLARAPTORS_METADATA_UPLOAD_VERIFICATION_V2';
const VERIFIED_FILE_COUNT = MAX_NFT_ID + 1;

function fail(message) { throw new Error(message); }

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith('--') || !value || value.startsWith('--')) {
      fail('Usage: node scripts/generate-metadata-merkle-tree.js --cluster <tag> --program-id <pubkey> --uri-map <file> --output <file>');
    }
    args[flag.slice(2)] = value;
  }
  for (const key of ['cluster', 'program-id', 'uri-map', 'output']) if (!args[key]) fail(`Missing required --${key}.`);
  if (!/^[a-z0-9-]{1,32}$/.test(args.cluster)) fail('Cluster must be lowercase alphanumeric or hyphen.');
  return args;
}

function keyBytes(value) {
  try { return new PublicKey(value).toBuffer(); } catch { fail('Program ID must be a valid Solana public key.'); }
}

function u16be(value) {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff) fail('u16 value out of range.');
  const bytes = Buffer.alloc(2);
  bytes.writeUInt16BE(value);
  return bytes;
}

function validArUri(value) {
  return typeof value === 'string' && /^ar:\/\/[A-Za-z0-9_-]{43}$/.test(value) && !/placeholder/i.test(value);
}

function canonicalName(id) { return `cumzillaraptor #${id}`; }

function leaf({ cluster, programId, nftId, name, uri }) {
  if (!Number.isInteger(nftId) || nftId < 1 || nftId > MAX_NFT_ID) fail('NFT ID must be in 1..420.');
  if (name !== canonicalName(nftId)) fail('Metadata name must exactly match canonical NFT ID.');
  if (!validArUri(uri)) fail('Metadata URI must be a valid non-placeholder ar:// URI.');
  const clusterBytes = Buffer.from(cluster, 'utf8');
  const nameBytes = Buffer.from(name, 'utf8');
  const uriBytes = Buffer.from(uri, 'utf8');
  if (nameBytes.length > MAX_NAME_BYTES || uriBytes.length > MAX_URI_BYTES) fail('Metadata name or URI exceeds bounded length.');
  return keccak256(Buffer.concat([
    Buffer.from(VERSION, 'utf8'), keyBytes(programId), Buffer.from([clusterBytes.length]), clusterBytes,
    u16be(nftId), u16be(nameBytes.length), nameBytes, u16be(uriBytes.length), uriBytes,
  ]));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const map = JSON.parse(fs.readFileSync(args['uri-map'], 'utf8'));
  if (map.version !== URI_MAP_VERSION) fail(`URI map version must be ${URI_MAP_VERSION}.`);
  if (map.cluster !== args.cluster || map.programId !== args['program-id']) fail('URI map cluster or program ID does not match requested Merkle domain.');
  if (!map.source || typeof map.source !== 'object' || Array.isArray(map.source)) fail('URI map must contain receipt-verification provenance.');
  const source = map.source;
  if (source.receiptVersion !== RECEIPT_VERSION || source.verificationVersion !== VERIFICATION_VERSION) fail('URI map provenance versions are invalid.');
  if (!/^[0-9a-f]{64}$/.test(source.stagedManifestSha256)) fail('URI map provenance staged manifest SHA-256 is invalid.');
  if (source.verifiedFiles !== VERIFIED_FILE_COUNT || source.passed !== VERIFIED_FILE_COUNT || source.failed !== 0) fail(`URI map provenance must show ${VERIFIED_FILE_COUNT} verified and passed with zero failures.`);
  if (!validArUri(map.collectionUri)) fail('Collection URI must be a valid non-placeholder ar:// URI.');
  if (!map.metadataUris || typeof map.metadataUris !== 'object' || Array.isArray(map.metadataUris)) fail('URI map must contain metadataUris object.');
  const keys = Object.keys(map.metadataUris).sort((a, b) => Number(a) - Number(b));
  const expected = Array.from({ length: MAX_NFT_ID }, (_, index) => String(index + 1));
  if (keys.length !== MAX_NFT_ID || keys.some((key, index) => key !== expected[index])) fail('URI map must contain exactly canonical metadata URI keys 1 through 420.');
  const records = expected.map((idText) => {
    const nftId = Number(idText);
    const name = canonicalName(nftId);
    const uri = map.metadataUris[idText];
    return { nftId, name, uri, leaf: leaf({ cluster: args.cluster, programId: args['program-id'], nftId, name, uri }) };
  });
  const tree = new MerkleTree(records.map((record) => record.leaf), keccak256, { sortPairs: true });
  const metadata = Object.fromEntries(records.map((record) => [String(record.nftId), {
    nftId: record.nftId, name: record.name, uri: record.uri, leaf: record.leaf,
    proof: tree.getProof(record.leaf).map((entry) => `0x${entry.data.toString('hex')}`),
  }]));
  const output = {
    version: VERSION, cluster: args.cluster, programId: args['program-id'], totalMetadata: MAX_NFT_ID,
    merkleRoot: `0x${tree.getRoot().toString('hex')}`, metadata,
  };
  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`Generated ${MAX_NFT_ID} metadata proofs.`);
  console.log(`Metadata root: ${output.merkleRoot}`);
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(`Error: ${error.message}`); process.exit(1); }
}

module.exports = { leaf, validArUri };
