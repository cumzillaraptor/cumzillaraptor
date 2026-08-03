'use strict';

const fs = require('fs');
const path = require('path');
const { MerkleTree } = require('merkletreejs');
const { keccak256 } = require('@ethersproject/keccak256');
const {
  DOMAIN,
  buildClaimMessage,
  claimMessageHash,
  deterministicNonce,
  makeClaimLeaf,
  normalizeEthAddress,
} = require('./claim-message-v1');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_RESERVE_CSV = process.env.CUMZ_RESERVE_CSV || path.join(ROOT, 'nft-data', 'allocation-source', 'reserve_list.csv');
const OUTPUT_DIR = path.join(ROOT, 'nft-data');
const DEFAULT_PROGRAM_ID = '2YTAvP54MuSd7uUGbG9LrWiXCYh5UNHyqvy6XqxCTda2';
const VECTOR_RECIPIENT = '8gUvnRYEcUMHwkt4WwWckMFCC9KUN1m47TgzttXR7TVg';
const VECTOR_EXPIRY = '2000000000';
const CLAIM_COUNT = 174;

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const args = { v1: false };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--v1') args.v1 = true;
    else if (['--cluster', '--program-id', '--reserve-csv', '--output-dir'].includes(argv[index])) args[argv[index].slice(2)] = argv[++index];
    else fail(`Unknown argument: ${argv[index]}`);
  }
  if (!args.v1) fail('Refusing legacy generation. Use --v1 --cluster <tag> --program-id <pubkey>.');
  if (!args.cluster || !args['program-id']) fail('Usage: node scripts/generate-merkle-tree.js --v1 --cluster <tag> --program-id <pubkey>');
  return args;
}

function parseReserveCsv(file) {
  const lines = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/);
  if (lines[0] !== 'nft_number,name,wallet') fail('Reserve CSV header must be nft_number,name,wallet.');
  const claims = lines.slice(1).map((line, index) => {
    const [idText, name, ethAddress] = line.split(',');
    if (!/^[1-9]\d*$/.test(idText)) fail(`Reserve CSV row ${index + 2} has non-canonical NFT ID.`);
    const nftId = Number(idText);
    if (!Number.isSafeInteger(nftId) || nftId < 1 || nftId > 420) fail(`Reserve CSV row ${index + 2} has invalid NFT ID.`);
    return { nftId, name, ethAddress: normalizeEthAddress(ethAddress) };
  });
  if (claims.length !== CLAIM_COUNT || new Set(claims.map((claim) => claim.nftId)).size !== CLAIM_COUNT) fail(`Reserve CSV must contain exactly ${CLAIM_COUNT} unique claims.`);
  return claims;
}

function makeTree(records) {
  return new MerkleTree(records.map((record) => record.leaf), keccak256, { sortPairs: true });
}

function generateV1({ cluster, programId, reserveCsv, outputDir }) {
  const claims = parseReserveCsv(reserveCsv).map((claim) => {
    const nonceHex = deterministicNonce({ programId, clusterTag: cluster, ethAddress: claim.ethAddress, nftId: claim.nftId });
    const leaf = makeClaimLeaf({ programId, clusterTag: cluster, ethAddress: claim.ethAddress, nftId: claim.nftId, nonceHex });
    return { ...claim, nonceHex, leaf };
  });
  const tree = makeTree(claims);
  const merkleRoot = `0x${tree.getRoot().toString('hex')}`;
  const records = claims.map((claim) => ({
    nftId: claim.nftId,
    name: claim.name,
    ethAddress: claim.ethAddress,
    nonceHex: claim.nonceHex,
    leaf: claim.leaf,
    proof: tree.getProof(claim.leaf).map((entry) => `0x${entry.data.toString('hex')}`),
  }));
  const first = records.find((record) => record.nftId === 1);
  if (!first) fail('Expected claim #1 for fixed V1 vector.');
  const message = buildClaimMessage({
    cluster,
    programId,
    recipient: VECTOR_RECIPIENT,
    nftId: first.nftId,
    ethAddress: first.ethAddress,
    nonceHex: first.nonceHex,
    expiryUnix: VECTOR_EXPIRY,
  });
  const result = {
    version: DOMAIN,
    cluster,
    programId,
    totalClaims: records.length,
    merkleRoot,
    claims: records,
  };
  const vectors = {
    version: DOMAIN,
    cluster,
    programId,
    merkleRoot,
    fixture: {
      recipient: VECTOR_RECIPIENT,
      nftId: first.nftId,
      ethAddress: first.ethAddress,
      nonceHex: first.nonceHex,
      expiryUnix: VECTOR_EXPIRY,
      message,
      messageHash: claimMessageHash(message),
      leaf: first.leaf,
      proof: first.proof,
    },
  };
  fs.mkdirSync(outputDir, { recursive: true });
  const claimsFile = `claims-v1.${cluster}.json`;
  const vectorsFile = `claim-message-vectors.${cluster}.json`;
  fs.writeFileSync(path.join(outputDir, claimsFile), `${JSON.stringify(result, null, 2)}\n`);
  fs.writeFileSync(path.join(outputDir, vectorsFile), `${JSON.stringify(vectors, null, 2)}\n`);
  console.log(`Generated ${records.length} ${DOMAIN} claims.`);
  console.log(`Merkle root: ${merkleRoot}`);
  console.log(`Artifacts: ${claimsFile}, ${vectorsFile}`);
}

try {
  const args = parseArgs(process.argv.slice(2));
  generateV1({
    cluster: args.cluster,
    programId: args['program-id'] || DEFAULT_PROGRAM_ID,
    reserveCsv: args['reserve-csv'] || DEFAULT_RESERVE_CSV,
    outputDir: args['output-dir'] || OUTPUT_DIR,
  });
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exit(1);
}

module.exports = { generateV1, makeTree, parseReserveCsv };
