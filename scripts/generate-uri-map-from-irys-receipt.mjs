#!/usr/bin/env node
import { readFile, mkdir, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PublicKey } from '@solana/web3.js';

const RECEIPT_VERSION = 'CUMZILLARAPTORS_IRYS_METADATA_URIS_V2';
const VERIFICATION_VERSION = 'CUMZILLARAPTORS_METADATA_UPLOAD_VERIFICATION_V2';
const URI_MAP_VERSION = 'CUMZILLARAPTORS_URI_MAP_V1';
const MAX_NFT_ID = 420;
const VERIFIED_FILE_COUNT = MAX_NFT_ID + 1;
const AR_URI = /^ar:\/\/[A-Za-z0-9_-]{43}$/;

function fail(message) { throw new Error(message); }
function validArUri(value) { return typeof value === 'string' && AR_URI.test(value) && !/placeholder/i.test(value); }

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i]; const value = argv[i + 1];
    if (!flag?.startsWith('--') || !value || value.startsWith('--')) fail('Usage: node scripts/generate-uri-map-from-irys-receipt.mjs --receipt <receipt> --verification-report <verified report> --cluster <tag> --program-id <pubkey> --output <file>');
    args[flag.slice(2)] = value;
  }
  for (const required of ['receipt', 'verification-report', 'cluster', 'program-id', 'output']) if (!args[required]) fail(`Missing required --${required}.`);
  if (!/^[a-z0-9-]{1,32}$/.test(args.cluster)) fail('Cluster must be lowercase alphanumeric or hyphen.');
  try { new PublicKey(args['program-id']); } catch { fail('Program ID must be a valid Solana public key.'); }
  return args;
}

function canonicalMetadataUris(uris) {
  if (!uris || typeof uris !== 'object' || Array.isArray(uris)) fail('Receipt must contain a URI object.');
  const expected = Array.from({ length: MAX_NFT_ID }, (_, i) => String(i + 1));
  const keys = Object.keys(uris).filter((key) => key !== 'collection').sort((a, b) => Number(a) - Number(b));
  if (keys.length !== MAX_NFT_ID || keys.some((key, i) => key !== expected[i])) fail('Receipt must contain exactly canonical metadata keys 1 through 420 plus collection.');
  if (!validArUri(uris.collection)) fail('Collection URI must be a valid non-placeholder ar:// URI.');
  return Object.fromEntries(expected.map((key) => {
    if (!validArUri(uris[key])) fail(`Metadata URI for #${key} must be a valid non-placeholder ar:// URI.`);
    return [key, uris[key]];
  }));
}

async function requireMatchingVerification(receipt, verification, receiptPath) {
  if (!verification || verification.version !== VERIFICATION_VERSION) fail(`Verification report version must be ${VERIFICATION_VERSION}.`);
  let actualReceiptPath;
  try { actualReceiptPath = await realpath(receiptPath); } catch { fail('Receipt path cannot be resolved.'); }
  let reportedReceiptPath;
  try { reportedReceiptPath = await realpath(verification.receiptPath); } catch { fail('Verification report receipt path cannot be resolved.'); }
  if (reportedReceiptPath !== actualReceiptPath) fail('Verification report receipt path does not match supplied receipt.');
  if (verification.stagedManifestSha256 !== receipt.stagedManifestSha256) fail('Verification report staged manifest SHA-256 does not match receipt.');
  if (verification.verifiedFiles !== VERIFIED_FILE_COUNT || verification.passed !== VERIFIED_FILE_COUNT || verification.failed !== 0) fail(`Verification report must show ${VERIFIED_FILE_COUNT} verified and passed with zero failures.`);
  if (!Array.isArray(verification.failures) || verification.failures.length !== 0) fail('Verification report must contain zero failures.');
  if (verification.collectionUri !== receipt.uris.collection) fail('Verification report collection URI does not match receipt.');
}

function receiptToUriMap(receipt, verification, { cluster, programId }) {
  if (!receipt || receipt.version !== RECEIPT_VERSION) fail(`Receipt version must be ${RECEIPT_VERSION}.`);
  if (typeof receipt.stagedManifestSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(receipt.stagedManifestSha256)) fail('Receipt staged manifest SHA-256 must be lowercase hexadecimal.');
  const metadataUris = canonicalMetadataUris(receipt.uris);
  return {
    version: URI_MAP_VERSION,
    cluster,
    programId,
    source: {
      receiptVersion: RECEIPT_VERSION,
      verificationVersion: VERIFICATION_VERSION,
      stagedManifestSha256: receipt.stagedManifestSha256,
      verifiedFiles: verification.verifiedFiles,
      passed: verification.passed,
      failed: verification.failed,
    },
    collectionUri: receipt.uris.collection,
    metadataUris,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [receipt, verification] = await Promise.all([
    readFile(args.receipt, 'utf8').then(JSON.parse),
    readFile(args['verification-report'], 'utf8').then(JSON.parse),
  ]);
  await requireMatchingVerification(receipt, verification, args.receipt);
  const output = receiptToUriMap(receipt, verification, { cluster: args.cluster, programId: args['program-id'] });
  await mkdir(path.dirname(args.output), { recursive: true });
  await writeFile(args.output, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`Generated provenance-bound Devnet URI map with ${MAX_NFT_ID} metadata URIs.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((error) => { console.error(`Error: ${error.message}`); process.exitCode = 1; });
export { RECEIPT_VERSION, VERIFICATION_VERSION, URI_MAP_VERSION, validArUri, requireMatchingVerification, receiptToUriMap };
