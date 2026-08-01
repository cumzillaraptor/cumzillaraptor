#!/usr/bin/env node
import Irys from '@irys/sdk';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const planPath = '/tmp/cumz-irys-upload-dry-run/irys-upload-plan.v1.json';
const keypairPath = '/home/raspberrypi/.config/cumzillaraptor/upload-wallets/irys-upload-mainnet.json';
const outputDir = '/home/raspberrypi/.config/cumzillaraptor/upload-receipts';
const receiptPath = path.join(outputDir, 'irys-image-uris.v1.json');

const plan = JSON.parse(await readFile(planPath, 'utf8'));
const secret = Uint8Array.from(JSON.parse(await readFile(keypairPath, 'utf8')));
const keypair = Keypair.fromSecretKey(secret);
const irys = new Irys({
  url: 'https://node1.irys.xyz',
  token: 'solana',
  key: bs58.encode(Buffer.from(secret)),
  config: { providerUrl: 'https://api.mainnet-beta.solana.com' },
});
await irys.ready();
await mkdir(outputDir, { recursive: true, mode: 0o700 });

const existing = JSON.parse(await readFile(receiptPath, 'utf8').catch(() => '{"version":"CUMZILLARAPTORS_IRYS_IMAGE_URIS_V1","wallet":"","uris":{}}'));
if (existing.wallet && existing.wallet !== keypair.publicKey.toBase58()) throw new Error('Receipt file belongs to another wallet.');
existing.wallet = keypair.publicKey.toBase58();
existing.endpoint = 'https://node1.irys.xyz';
existing.uris ??= {};

const phases = plan.phases.filter((phase) => phase.kind === 'nft-images' || phase.kind === 'collection-image');
for (const phase of phases) {
  for (const file of phase.files) {
    const key = phase.kind === 'collection-image' ? 'collection' : String(file.id);
    if (existing.uris[key]) continue;
    const receipt = await irys.uploadFile(file.sourcePath, { tags: [
      { name: 'Content-Type', value: 'image/png' },
      { name: 'App-Name', value: 'cumzillaraptors' },
      { name: 'Upload-Phase', value: phase.kind },
      { name: 'NFT-ID', value: key },
    ] });
    existing.uris[key] = `ar://${receipt.id}`;
    await writeFile(receiptPath, `${JSON.stringify(existing, null, 2)}\n`, { mode: 0o600 });
    console.log(`UPLOADED ${phase.kind} ${key} ${receipt.id}`);
  }
}
const nftCount = Object.keys(existing.uris).filter((key) => key !== 'collection').length;
if (nftCount !== 420 || !existing.uris.collection) throw new Error(`Incomplete upload receipts: nft=${nftCount}, collection=${Boolean(existing.uris.collection)}`);
console.log(JSON.stringify({ complete: true, nftImages: nftCount, collectionImage: existing.uris.collection, receiptPath }, null, 2));
