#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const EXPECTED_COUNT = 420;
const TREASURY_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function fail(message) {
  throw new Error(message);
}

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    if (!key?.startsWith('--') || argv[i + 1] === undefined) fail(`Expected --key value pair; got ${key ?? 'nothing'}.`);
    out[key.slice(2)] = argv[i + 1];
  }
  for (const key of ['images', 'metadata', 'collection-metadata', 'collection-image-id', 'treasury', 'output']) {
    if (!out[key]) fail(`Missing --${key}.`);
  }
  return out;
}

function parseId(filename, extension) {
  const match = new RegExp(`^(\\d+)\\.${extension}$`).exec(filename);
  return match ? Number(match[1]) : null;
}

async function listedFiles(directory, extension) {
  if (!existsSync(directory)) fail(`Missing source directory: ${directory}`);
  const entries = await readdir(directory);
  const files = entries.map((name) => ({ name, id: parseId(name, extension) })).filter((entry) => entry.id !== null).sort((a, b) => a.id - b.id);
  if (files.length !== EXPECTED_COUNT || files.some((entry, index) => entry.id !== index + 1)) {
    fail(`${directory} must contain exactly IDs 1 through 420 as .${extension} files.`);
  }
  return files;
}

async function fileRecord(sourcePath, id) {
  const [info, bytes] = await Promise.all([stat(sourcePath), readFile(sourcePath)]);
  return { id, sourcePath, bytes: info.size, sha256: createHash('sha256').update(bytes).digest('hex') };
}

async function main() {
  const input = args(process.argv.slice(2));
  const imageId = Number(input['collection-image-id']);
  if (!Number.isInteger(imageId) || imageId < 1 || imageId > EXPECTED_COUNT) fail('Collection image ID must be an integer from 1 through 420.');
  if (!TREASURY_RE.test(input.treasury)) fail('Treasury must be a valid base58 public address.');
  if (!existsSync(input['collection-metadata'])) fail(`Missing collection metadata: ${input['collection-metadata']}`);

  const [imageFiles, metadataFiles, collectionRaw] = await Promise.all([
    listedFiles(input.images, 'png'), listedFiles(input.metadata, 'json'), readFile(input['collection-metadata'], 'utf8'),
  ]);
  const collection = JSON.parse(collectionRaw);
  if (!String(collection.image).includes('PLACEHOLDER_COLLECTION_IMAGE')) fail('Collection source metadata must still contain the collection-image placeholder for dry-run staging.');

  const metadataRecords = await Promise.all(metadataFiles.map(({ id, name }) => fileRecord(path.join(input.metadata, name), id)));
  const imageRecords = await Promise.all(imageFiles.map(({ id, name }) => fileRecord(path.join(input.images, name), id)));
  const collectionImageEntry = imageFiles.find((file) => file.id === imageId);
  if (!collectionImageEntry) fail(`Collection image ID ${imageId} is not present in the supplied image set.`);
  const collectionImage = await fileRecord(path.join(input.images, collectionImageEntry.name), imageId);
  const collectionMetadata = await fileRecord(input['collection-metadata'], null);

  const plan = {
    version: 'CUMZILLARAPTORS_IRYS_UPLOAD_PLAN_V1',
    dryRun: true,
    createdAt: new Date().toISOString(),
    royaltyTreasury: input.treasury,
    collectionImage: collectionImage,
    counts: { nftImages: imageRecords.length, nftMetadata: metadataRecords.length, collectionImage: 1, collectionMetadata: 1, totalUploads: 842 },
    placeholderPolicy: 'Source metadata remains unchanged; permanent ar:// URIs are required before JSON upload.',
    phases: [
      { order: 1, kind: 'nft-images', contentType: 'image/png', files: imageRecords },
      { order: 2, kind: 'collection-image', contentType: 'image/png', files: [collectionImage] },
      { order: 3, kind: 'nft-metadata', contentType: 'application/json', files: metadataRecords },
      { order: 4, kind: 'collection-metadata', contentType: 'application/json', files: [collectionMetadata] },
    ],
    noUploadPerformed: true,
    nextRequiredInput: 'After user approves a quote, upload image phases; use returned ar:// URIs to create finalized metadata copies, validate them, then upload JSON phases.',
  };
  await mkdir(input.output, { recursive: true });
  await writeFile(path.join(input.output, 'irys-upload-plan.v1.json'), `${JSON.stringify(plan, null, 2)}\n`);
  console.log('DRY RUN ONLY — no wallet loaded, no signing, no funding, no upload, and no source metadata modified.');
  console.log(`Prepared ${plan.counts.totalUploads} files: ${plan.counts.nftImages} NFT images, ${plan.counts.nftMetadata} NFT metadata JSON, collection image ${String(imageId).padStart(4, '0')}.png, and collection metadata JSON.`);
  console.log(`Wrote ${path.join(input.output, 'irys-upload-plan.v1.json')}`);
}

main().catch((error) => {
  console.error(`DRY-RUN ERROR: ${error.message}`);
  process.exitCode = 1;
});
