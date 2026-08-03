#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { MerkleTree } = require('merkletreejs');
const { keccak256 } = require('@ethersproject/keccak256');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_RESERVE_CSV = process.env.CUMZ_RESERVE_CSV || path.join(ROOT, 'nft-data', 'allocation-source', 'reserve_list.csv');
const DEFAULT_OUTPUT_DIR = path.join(ROOT, 'nft-data');
const CLAIM_COUNT = 174;

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith('--') || !value || value.startsWith('--')) {
      fail('Usage: node scripts/generate-legacy-claim-artifacts.js [--reserve-csv <file>] [--output-dir <dir>]');
    }
    if (!['--reserve-csv', '--output-dir'].includes(flag)) fail(`Unknown argument: ${flag}`);
    args[flag.slice(2)] = value;
  }
  return args;
}

function parseReserveCsv(file) {
  const lines = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/);
  if (lines[0] !== 'nft_number,name,wallet') fail('Reserve CSV header must be nft_number,name,wallet.');
  const claims = lines.slice(1).map((line, index) => {
    const [idText, name, ethAddress] = line.split(',');
    if (!/^[1-9]\d*$/.test(idText)) fail(`Reserve CSV row ${index + 2} has non-canonical NFT ID.`);
    const nftNumber = Number(idText);
    if (!Number.isSafeInteger(nftNumber) || nftNumber < 1 || nftNumber > 420) fail(`Reserve CSV row ${index + 2} has invalid NFT ID.`);
    if (!/^0x[0-9a-f]{40}$/.test(ethAddress)) fail(`Reserve CSV row ${index + 2} has invalid lowercase ETH address.`);
    return { nftNumber, name, ethAddress };
  });
  if (claims.length !== CLAIM_COUNT || new Set(claims.map((claim) => claim.nftNumber)).size !== CLAIM_COUNT) {
    fail(`Reserve CSV must contain exactly ${CLAIM_COUNT} unique claims.`);
  }
  return claims;
}

function generate({ reserveCsv, outputDir }) {
  const claims = parseReserveCsv(reserveCsv);
  const leaves = claims.map(({ ethAddress, nftNumber }) => Buffer.from(keccak256(Buffer.concat([
    Buffer.from(ethAddress.slice(2), 'hex'), Buffer.from([nftNumber >> 8, nftNumber & 0xff]),
  ])).slice(2), 'hex'));
  const tree = new MerkleTree(leaves, keccak256, { sortPairs: true });
  const merkleRoot = `0x${tree.getRoot().toString('hex')}`;
  const claimProofs = {};
  const claimsByAddress = {};
  for (let index = 0; index < claims.length; index += 1) {
    const claim = claims[index];
    const proof = tree.getProof(leaves[index]).map((entry) => `0x${entry.data.toString('hex')}`);
    claimProofs[String(claim.nftNumber)] = { nftNumber: claim.nftNumber, ethAddress: claim.ethAddress, leaf: `0x${leaves[index].toString('hex')}`, proof };
    (claimsByAddress[claim.ethAddress] ??= []).push({ nftNumber: claim.nftNumber, name: claim.name, proof });
  }
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'claim-proofs.json'), `${JSON.stringify(claimProofs, null, 2)}\n`);
  fs.writeFileSync(path.join(outputDir, 'claims-by-address.json'), `${JSON.stringify(claimsByAddress, null, 2)}\n`);
  fs.writeFileSync(path.join(outputDir, 'merkle-config.json'), `${JSON.stringify({ merkleRoot, totalClaims: CLAIM_COUNT, rootBytes: [...tree.getRoot()] }, null, 2)}\n`);
  console.log(`Generated ${CLAIM_COUNT} legacy claim records.`);
  console.log(`Merkle root: ${merkleRoot}`);
}

try {
  const args = parseArgs(process.argv.slice(2));
  generate({ reserveCsv: args['reserve-csv'] || DEFAULT_RESERVE_CSV, outputDir: args['output-dir'] || DEFAULT_OUTPUT_DIR });
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exit(1);
}

module.exports = { generate, parseReserveCsv };
