const fs = require('fs');
const path = require('path');

// Config
const TRAITS_PATH = '/home/raspberrypi/nft-collection/cumzillaraptors_solana/traits.json';
const IMAGES_DIR = '/home/raspberrypi/nft-collection/cumzillaraptors_solana/images';
const OUTPUT_DIR = '/home/raspberrypi/workspace-cumzillaraptor/nft-data/metadata';
const COLLECTION_DIR = '/home/raspberrypi/workspace-cumzillaraptor/nft-data';

const SYMBOL = '$CUM';
const DESCRIPTION = '420 cumzillaraptors by cumzillaraptor 🦖💦';
const EXTERNAL_URL = 'https://cumzillaraptor.com';
const SELLER_FEE_BASIS_POINTS = 500; // 5%

// Read traits
const raw = fs.readFileSync(TRAITS_PATH, 'utf-8');
const traits = JSON.parse(raw);

// Extract extension from first image
const imageFiles = fs.readdirSync(IMAGES_DIR);
const ext = imageFiles.length > 0 ? path.extname(imageFiles[0]) : '.png';
console.log(`Using image extension: ${ext}`);

// Get sorted keys
const keys = Object.keys(traits).sort((a, b) => parseInt(a) - parseInt(b));
console.log(`Total NFTs in traits: ${keys.length}`);

// Check all images present
const imageNames = new Set(imageFiles.map(f => path.parse(f).name));
let missingImages = 0;
const imageIds = {};

for (const key of keys) {
  // Pad to 4 digits: 1 -> 0001, 420 -> 0420
  const padded = String(parseInt(key)).padStart(4, '0');
  if (!imageNames.has(padded)) {
    console.warn(`Warning: Image missing for ${padded}.png`);
    missingImages++;
  }
  imageIds[key] = padded;
}

console.log(`Missing images: ${missingImages}`);

// Collect unique trait types
const traitTypes = new Set();
for (const key of keys) {
  for (const attr of traits[key].attributes) {
    traitTypes.add(attr.trait_type);
  }
}
console.log('Trait types:', Array.from(traitTypes));

// Generate metadata for each NFT
const metadataFiles = [];
const collectionImagePlaceholder = `ar://PLACEHOLDER_COLLECTION_IMAGE`;

for (const key of keys) {
  const nftId = parseInt(key);
  const paddedId = String(nftId).padStart(4, '0');
  
  const entry = traits[key];
  
  // Format attributes for Metaplex standard
  const attributes = entry.attributes.map(attr => ({
    trait_type: attr.trait_type,
    value: attr.value
  }));
  
  // Build Metaplex Core metadata JSON
  const metadata = {
    name: entry.name,
    symbol: SYMBOL,
    description: DESCRIPTION,
    image: `ar://PLACEHOLDER_${paddedId}`,
    external_url: EXTERNAL_URL,
    attributes: attributes,
    properties: {
      files: [
        {
          uri: `ar://PLACEHOLDER_${paddedId}`,
          type: `image/${ext === '.png' ? 'png' : ext.replace('.', '')}`
        }
      ],
      category: 'image',
      creators: [
        {
          address: 'PLACEHOLDER_TREASURY',
          share: 100
        }
      ]
    }
  };
  
  const filename = `${nftId}.json`;
  const filepath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(filepath, JSON.stringify(metadata, null, 2));
  metadataFiles.push(filename);
}

console.log(`\nGenerated ${metadataFiles.length} metadata files`);

// Generate collection.json (Metaplex collection metadata)
const collection = {
  name: 'cumzillaraptors',
  symbol: SYMBOL,
  description: DESCRIPTION,
  image: collectionImagePlaceholder,
  external_url: EXTERNAL_URL,
  seller_fee_basis_points: SELLER_FEE_BASIS_POINTS,
  properties: {
    files: [
      {
        uri: collectionImagePlaceholder,
        type: 'image/png'
      }
    ],
    category: 'image',
    creators: [
      {
        address: 'PLACEHOLDER_TREASURY',
        share: 100
      }
    ]
  }
};

const collectionPath = path.join(COLLECTION_DIR, 'collection.json');
fs.writeFileSync(collectionPath, JSON.stringify(collection, null, 2));
console.log(`Generated collection.json`);

// Summary
console.log('\n--- SUMMARY ---');
console.log(`NFTs processed: ${keys.length}`);
console.log(`Metadata dir: ${OUTPUT_DIR}`);
console.log(`Collection file: ${collectionPath}`);
console.log('--- METADATA GENERATION COMPLETE ---');
