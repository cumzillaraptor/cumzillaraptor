#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const EXPECTED_COUNT = 420;
const AR_URI_RE = /^ar:\/\/[A-Za-z0-9_-]{43}$/;
const PUBKEY_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function fail(message) { throw new Error(message); }
function parseArgs(argv) {
  const output = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i]?.startsWith('--') || argv[i + 1] === undefined) fail(`Expected --key value pair; got ${argv[i] ?? 'nothing'}.`);
    output[argv[i].slice(2)] = argv[i + 1];
  }
  for (const key of ['metadata', 'collection-metadata', 'image-receipts', 'treasury', 'output']) if (!output[key]) fail(`Missing --${key}.`);
  return output;
}
function idFromName(name) {
  const match = /^(\d+)\.json$/.exec(name);
  return match ? Number(match[1]) : null;
}
function assertUri(uri, label) {
  if (!AR_URI_RE.test(uri)) fail(`${label} must be a 43-character ar:// URI.`);
}
function setImageUri(metadata, uri, label) {
  assertUri(uri, `${label} image`);
  if (!metadata.properties || !Array.isArray(metadata.properties.files) || metadata.properties.files.length !== 1) fail(`${label} must have exactly one properties.files entry.`);
  metadata.image = uri;
  metadata.properties.files[0].uri = uri;
  metadata.properties.files[0].type = 'image/png';
}
function setRoyaltyRecipient(metadata, treasury, label) {
  if (!Array.isArray(metadata.properties?.creators) || metadata.properties.creators.length !== 1) fail(`${label} must have exactly one creator.`);
  metadata.seller_fee_basis_points = 500;
  metadata.properties.creators[0] = { address: treasury, share: 100 };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!PUBKEY_RE.test(args.treasury)) fail('Treasury must be a base58 Solana public address.');
  const receipt = JSON.parse(await readFile(args['image-receipts'], 'utf8'));
  const uris = receipt.uris;
  if (!uris || !AR_URI_RE.test(uris.collection)) fail('Image receipt is missing a valid collection ar:// URI.');

  const names = (await readdir(args.metadata)).map((name) => ({ name, id: idFromName(name) })).filter((item) => item.id !== null).sort((a, b) => a.id - b.id);
  if (names.length !== EXPECTED_COUNT || names.some((item, index) => item.id !== index + 1)) fail('Metadata source must contain exactly IDs 1 through 420.');
  for (const { id } of names) assertUri(uris[String(id)], `Image receipt for NFT ${id}`);

  if (existsSync(args.output)) await rm(args.output, { recursive: true, force: true });
  const metadataOut = path.join(args.output, 'metadata');
  await mkdir(metadataOut, { recursive: true });
  const manifest = { version: 'CUMZILLARAPTORS_FINAL_METADATA_STAGE_V1', dryRun: true, royaltyTreasury: args.treasury, collectionImageUri: uris.collection, nftMetadata: {} };

  for (const { id, name } of names) {
    const source = JSON.parse(await readFile(path.join(args.metadata, name), 'utf8'));
    setImageUri(source, uris[String(id)], `NFT ${id}`);
    setRoyaltyRecipient(source, args.treasury, `NFT ${id}`);
    if (!Array.isArray(source.attributes) || source.attributes.length === 0) fail(`NFT ${id} is missing trait attributes.`);
    const outputPath = path.join(metadataOut, `${id}.json`);
    await writeFile(outputPath, `${JSON.stringify(source, null, 2)}\n`);
    manifest.nftMetadata[String(id)] = { sourceId: id, imageUri: uris[String(id)], stagedPath: outputPath, bytes: (await stat(outputPath)).size };
  }

  const collection = JSON.parse(await readFile(args['collection-metadata'], 'utf8'));
  setImageUri(collection, uris.collection, 'Collection metadata');
  setRoyaltyRecipient(collection, args.treasury, 'Collection metadata');
  const collectionOut = path.join(args.output, 'collection.json');
  await writeFile(collectionOut, `${JSON.stringify(collection, null, 2)}\n`);
  manifest.collectionMetadata = { stagedPath: collectionOut, bytes: (await stat(collectionOut)).size };
  await writeFile(path.join(args.output, 'metadata-stage-manifest.v1.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  console.log('METADATA PREPARATION ONLY — no wallet loaded, no signing, no funding, no upload, and source metadata remains unchanged.');
  console.log(`Staged ${EXPECTED_COUNT} NFT metadata files and 1 collection metadata file in ${args.output}`);
}
main().catch((error) => { console.error(`METADATA PREPARATION ERROR: ${error.message}`); process.exitCode = 1; });
