const fs = require('fs');
const path = require('path');
const { Irys } = require('@irys/sdk');
const { Connection, Keypair, LAMPORTS_PER_SOL } = require('@solana/web3.js');

// Config
const KEYPAIR_PATH = '/home/raspberrypi/.config/solana/devnet.json';
const IMAGES_DIR = '/home/raspberrypi/nft-collection/cumzillaraptors_solana/images';
const METADATA_DIR = '/home/raspberrypi/workspace-cumzillaraptor/nft-data/metadata';
const COLLECTION_FILE = '/home/raspberrypi/workspace-cumzillaraptor/nft-data/collection.json';
const IRYS_DEVNET = 'https://node1.devnet.irys.xyz';

// RPC for airdrops — use public devnet
const connection = new Connection('https://api.devnet.solana.com');

async function main() {
  // 1. Load keypair
  const secret = JSON.parse(fs.readFileSync(KEYPAIR_PATH, 'utf-8'));
  const keypair = Keypair.fromSecretKey(new Uint8Array(secret));
  const pubkey = keypair.publicKey.toBase58();
  console.log('Wallet:', pubkey);

  // 2. Check balance and airdrop if needed
  let balance = await connection.getBalance(keypair.publicKey);
  console.log('Balance:', balance / LAMPORTS_PER_SOL, 'SOL');
  
  if (balance < 0.05 * LAMPORTS_PER_SOL) {
    console.log('Requesting devnet airdrop...');
    const sig = await connection.requestAirdrop(keypair.publicKey, 2 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig);
    balance = await connection.getBalance(keypair.publicKey);
    console.log('New balance:', balance / LAMPORTS_PER_SOL, 'SOL');
  }

  // 3. Initialize Irys (devnet, SOL token)
  const irys = new Irys({
    network: 'devnet',
    token: 'solana',
    key: keypair,
    config: { providerUrl: 'https://api.devnet.solana.com' },
  });
  
  console.log('Irys address:', irys.address);
  
  // Check/fund Irys node
  const atomicBalance = await irys.getLoadedBalance();
  console.log('Irys balance:', irys.utils.fromAtomic(atomicBalance), 'SOL');
  
  if (atomicBalance < irys.utils.toAtomic(0.05)) {
    console.log('Funding Irys node with 0.5 SOL...');
    const fundTx = await irys.fund(irys.utils.toAtomic(0.5));
    console.log('Fund tx:', fundTx);
  }

  // 4. Upload all images
  const imageFiles = fs.readdirSync(IMAGES_DIR)
    .filter(f => f.endsWith('.png'))
    .sort((a, b) => parseInt(a) - parseInt(b));
  
  console.log(`\nUploading ${imageFiles.length} images to Arweave...`);
  
  const imageMap = {}; // paddedId -> ar://txid
  const imageTags = [{ name: 'Content-Type', value: 'image/png' }];
  
  for (let i = 0; i < imageFiles.length; i++) {
    const file = imageFiles[i];
    const paddedId = path.parse(file).name; // e.g. "0001"
    const filePath = path.join(IMAGES_DIR, file);
    
    const receipt = await irys.uploadFile(filePath, { tags: imageTags });
    const arUrl = `ar://${receipt.id}`;
    imageMap[paddedId] = arUrl;
    
    if ((i + 1) % 50 === 0 || i === 0 || i === imageFiles.length - 1) {
      console.log(`  Uploaded ${i + 1}/${imageFiles.length} images — ${file} -> ${arUrl}`);
    }
  }
  console.log('All images uploaded!');

  // 5. Update metadata JSONs with actual image URLs and re-upload
  console.log('\nUpdating and uploading metadata files...');
  const metaTags = [{ name: 'Content-Type', value: 'application/json' }];
  const metadataArUrls = {};

  const metadataFiles = fs.readdirSync(METADATA_DIR)
    .filter(f => f.endsWith('.json'))
    .sort((a, b) => parseInt(a) - parseInt(b));

  for (let i = 0; i < metadataFiles.length; i++) {
    const file = metadataFiles[i];
    const nftId = path.parse(file).name; // e.g. "1"
    const paddedId = String(parseInt(nftId)).padStart(4, '0');
    
    const filePath = path.join(METADATA_DIR, file);
    let metadata = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    
    // Replace placeholders with actual Arweave URLs
    metadata.image = imageMap[paddedId];
    metadata.properties.files[0].uri = imageMap[paddedId];
    
    // Write updated metadata back
    fs.writeFileSync(filePath, JSON.stringify(metadata, null, 2));
    
    // Upload to Arweave
    const receipt = await irys.upload(JSON.stringify(metadata), { tags: metaTags });
    const arUrl = `ar://${receipt.id}`;
    metadataArUrls[nftId] = arUrl;
    
    if ((i + 1) % 50 === 0 || i === 0 || i === metadataFiles.length - 1) {
      console.log(`  Uploaded ${i + 1}/${metadataFiles.length} metadata — ${file} -> ${arUrl}`);
    }
  }
  console.log('All metadata uploaded!');

  // 6. Upload collection image and collection.json
  // Use first image as collection image
  const firstImageKey = Object.keys(imageMap)[0];
  const collectionImage = imageMap[firstImageKey];
  
  let collectionMeta = JSON.parse(fs.readFileSync(COLLECTION_FILE, 'utf-8'));
  collectionMeta.image = collectionImage;
  collectionMeta.properties.files[0].uri = collectionImage;
  fs.writeFileSync(COLLECTION_FILE, JSON.stringify(collectionMeta, null, 2));
  
  const colReceipt = await irys.upload(JSON.stringify(collectionMeta), { tags: metaTags });
  const collectionArUrl = `ar://${colReceipt.id}`;
  console.log(`\nCollection metadata: ${collectionArUrl}`);

  // 7. Print final mapping
  console.log('\n============= ARWEAVE UPLOAD SUMMARY =============');
  console.log(`Images uploaded: ${Object.keys(imageMap).length}`);
  console.log(`Metadata uploaded: ${Object.keys(metadataArUrls).length}`);
  console.log(`Collection metadata: ${collectionArUrl}`);
  console.log(`\nSample NFT mapping:`);
  console.log(`  #1 image: ${imageMap['0001']}`);
  console.log(`  #1 metadata: ${metadataArUrls['1']}`);
  console.log(`\nGateway URLs (for testing):`);
  const sampleId = imageMap['0001'].replace('ar://', '');
  console.log(`  Image: https://devnet.irys.xyz/${sampleId}`);
  console.log('===================================================');
}

main().catch(console.error);
