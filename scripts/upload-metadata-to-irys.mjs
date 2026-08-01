#!/usr/bin/env node
import Irys from '@irys/sdk';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const stagedDir = '/home/raspberrypi/.config/cumzillaraptor/staged-metadata-v1';
const keypairPath = '/home/raspberrypi/.config/cumzillaraptor/upload-wallets/irys-upload-mainnet.json';
const outputDir = '/home/raspberrypi/.config/cumzillaraptor/upload-receipts';
const receiptPath = path.join(outputDir, 'irys-metadata-uris.v1.json');
const EXPECTED_NFTS = 420;

const secret = Uint8Array.from(JSON.parse(await readFile(keypairPath, 'utf8')));
const keypair = Keypair.fromSecretKey(secret);
const files = [
  ...Array.from({ length: EXPECTED_NFTS }, (_, index) => ({ key: String(index + 1), sourcePath: path.join(stagedDir, 'metadata', `${index + 1}.json`), phase: 'nft-metadata' })),
  { key: 'collection', sourcePath: path.join(stagedDir, 'collection.json'), phase: 'collection-metadata' },
];
const totalBytes = (await Promise.all(files.map(async ({ sourcePath }) => (await stat(sourcePath)).size))).reduce((total, size) => total + size, 0);
const irys = new Irys({
  url: 'https://node1.irys.xyz',
  token: 'solana',
  key: bs58.encode(Buffer.from(secret)),
  config: { providerUrl: 'https://api.mainnet-beta.solana.com' },
});
await irys.ready();
const [quote, balance] = await Promise.all([irys.getPrice(totalBytes), irys.getLoadedBalance()]);
if (balance.lt(quote)) throw new Error(`Insufficient Irys balance: need ${quote.toString()} lamports, have ${balance.toString()} lamports. No upload started.`);
await mkdir(outputDir, { recursive: true, mode: 0o700 });
const receipt = JSON.parse(await readFile(receiptPath, 'utf8').catch(() => '{"version":"CUMZILLARAPTORS_IRYS_METADATA_URIS_V1","wallet":"","uris":{}}'));
if (receipt.wallet && receipt.wallet !== keypair.publicKey.toBase58()) throw new Error('Receipt file belongs to another wallet.');
receipt.wallet = keypair.publicKey.toBase58();
receipt.endpoint = 'https://node1.irys.xyz';
receipt.stagedDir = stagedDir;
receipt.uris ??= {};

console.log(JSON.stringify({ action: 'metadata-upload', files: files.length, totalBytes, quoteLamports: quote.toString(), startingIrysBalanceLamports: balance.toString() }));
for (const file of files) {
  if (receipt.uris[file.key]) continue;
  const upload = await irys.uploadFile(file.sourcePath, { tags: [
    { name: 'Content-Type', value: 'application/json' },
    { name: 'App-Name', value: 'cumzillaraptors' },
    { name: 'Upload-Phase', value: file.phase },
    { name: 'NFT-ID', value: file.key },
  ] });
  receipt.uris[file.key] = `ar://${upload.id}`;
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  console.log(`UPLOADED ${file.phase} ${file.key} ${upload.id}`);
}
const nftCount = Object.keys(receipt.uris).filter((key) => key !== 'collection').length;
if (nftCount !== EXPECTED_NFTS || !receipt.uris.collection) throw new Error(`Incomplete metadata receipts: nft=${nftCount}, collection=${Boolean(receipt.uris.collection)}`);
console.log(JSON.stringify({ complete: true, nftMetadata: nftCount, collectionMetadata: receipt.uris.collection, receiptPath }, null, 2));
