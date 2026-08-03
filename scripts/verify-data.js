const fs = require('fs');
const path = require('path');
const { MerkleTree } = require('merkletreejs');
const { keccak256 } = require('@ethersproject/keccak256');

const ROOT = path.resolve(__dirname, '..');
const ALLOCATION_SOURCE_DIR = path.join(ROOT, 'nft-data', 'allocation-source');

console.log('=== DATA INTEGRITY VERIFICATION ===\n');
let passed = 0;
let failed = 0;

function check(condition, msg) {
  if (condition) {
    console.log(`  ✅ ${msg}`);
    passed++;
  } else {
    console.log(`  ❌ ${msg}`);
    failed++;
  }
}

// 1. Check traits.json
console.log('1. TRAITS.JSON');
const traits = JSON.parse(fs.readFileSync('/home/raspberrypi/nft-collection/cumzillaraptors_solana/traits.json'));
const traitKeys = Object.keys(traits).sort((a,b) => parseInt(a)-parseInt(b));
check(traitKeys.length === 420, `Has 420 entries (found ${traitKeys.length})`);
check(traitKeys[0] === '0001', `First entry is 0001`);
check(traitKeys[419] === '0420', `Last entry is 0420`);

// Verify each NFT has name + attributes
let allHaveNames = true;
for (const k of traitKeys) {
  if (!traits[k].name || !traits[k].name.startsWith('cumzillaraptor #')) {
    allHaveNames = false;
    break;
  }
}
check(allHaveNames, 'All NFTs have valid names');

// 2. Check mint_list.csv
console.log('\n2. MINT LIST');
const mintCsv = fs.readFileSync(path.join(ALLOCATION_SOURCE_DIR, 'mint_list.csv'), 'utf-8').trim().split('\n');
check(mintCsv.length === 247, `Has 246 entries + header (found ${mintCsv.length} lines)`);

const mintNfts = [];
for (let i = 1; i < mintCsv.length; i++) {
  mintNfts.push(parseInt(mintCsv[i].split(',')[0]));
}
const uniqueMint = new Set(mintNfts);
check(uniqueMint.size === 246, `All 246 mint NFTs are unique`);

// Verify no overlap with reserve
const reserveCsv = fs.readFileSync(path.join(ALLOCATION_SOURCE_DIR, 'reserve_list.csv'), 'utf-8').trim().split('\n');
const reserveNfts = [];
for (let i = 1; i < reserveCsv.length; i++) {
  reserveNfts.push(parseInt(reserveCsv[i].split(',')[0]));
}
const overlap = mintNfts.filter(n => reserveNfts.includes(n));
check(overlap.length === 0, `No overlap between mint and reserve lists (${overlap.length} overlaps found)`);
check(mintNfts.length + reserveNfts.length === 420, `Mint (${mintNfts.length}) + reserve (${reserveNfts.length}) = ${mintNfts.length + reserveNfts.length} (expect 420)`);

// 3. Check reserve_list.csv
console.log('\n3. RESERVE LIST');
check(reserveCsv.length === 175, `Has 174 entries + header (found ${reserveCsv.length} lines)`);

const uniqueEth = new Set();
for (let i = 1; i < reserveCsv.length; i++) {
  const parts = reserveCsv[i].split(',');
  uniqueEth.add(parts[2].trim().toLowerCase());
}
check(uniqueEth.size > 0, `Has ${uniqueEth.size} unique Ethereum addresses`);

// 4. Check generated metadata
console.log('\n4. GENERATED METADATA');
const metaDir = path.join(ROOT, 'nft-data', 'metadata');
const metaFiles = fs.readdirSync(metaDir).filter(f => f.endsWith('.json'));
check(metaFiles.length === 420, `420 metadata JSONs generated (found ${metaFiles.length})`);

// Verify first metadata has correct format
const meta1 = JSON.parse(fs.readFileSync(path.join(metaDir, '1.json')));
check(meta1.name === 'cumzillaraptor #1', 'Metadata #1 has correct name');
check(meta1.symbol === '$CUM', 'Metadata has correct symbol');
check(meta1.description.includes('cumzillaraptor'), 'Metadata has description');
check(meta1.external_url === 'https://cumzillaraptor.com', 'External URL set');
check(meta1.attributes.length >= 4, 'Has at least 4 attributes');
check(meta1.properties.creators.length > 0, 'Has creators array');
check(meta1.properties.creators[0].share === 100, 'Creator has 100% share');

// 5. Check collection.json
console.log('\n5. COLLECTION JSON');
const collection = JSON.parse(fs.readFileSync(path.join(ROOT, 'nft-data', 'collection.json')));
check(collection.name === 'cumzillaraptors', 'Collection name correct');
check(collection.seller_fee_basis_points === 500, '5% royalties (500 bps)');

// 6. Check merkle tree
console.log('\n6. MERKLE TREE');
const claimProofs = JSON.parse(fs.readFileSync(path.join(ROOT, 'nft-data', 'claim-proofs.json')));
const merkleConfig = JSON.parse(fs.readFileSync(path.join(ROOT, 'nft-data', 'merkle-config.json')));
const claimsByAddr = JSON.parse(fs.readFileSync(path.join(ROOT, 'nft-data', 'claims-by-address.json')));

check(Object.keys(claimProofs).length === 174, `174 claim proofs generated (found ${Object.keys(claimProofs).length})`);
check(merkleConfig.totalClaims === 174, 'Merkle config has 174 total claims');
check(merkleConfig.rootBytes.length === 32, 'Merkle root is 32 bytes');

// Verify the merkle root
const leaves = Object.values(claimProofs).map((c) => {
  const addrBytes = Buffer.from(c.ethAddress.replace('0x', ''), 'hex');
  const numBytes = Buffer.alloc(2);
  numBytes.writeUInt16BE(c.nftNumber);
  return keccak256(Buffer.concat([addrBytes, numBytes]));
});
const tree = new MerkleTree(leaves, keccak256, { sortPairs: true });
const computedRoot = '0x' + tree.getRoot().toString('hex');
check(computedRoot === merkleConfig.merkleRoot, `Merkle root matches computed root (${computedRoot.slice(0, 20)}...)`);

// Verify a specific proof
const firstProof = Object.values(claimProofs)[0];
const firstLeaf = leaves[0];
const verified = tree.verify(
  firstProof.proof.map((p) => Buffer.from(p.replace('0x', ''), 'hex')),
  firstLeaf,
  merkleConfig.merkleRoot
);
check(verified, 'First claim proof verifies correctly');

// 7. Check mint pool order
console.log('\n7. MINT POOL ORDER');
const poolOrder = JSON.parse(fs.readFileSync(path.join(ROOT, 'nft-data', 'mint-pool-order.json')));
check(poolOrder.order.length === 246, `Pool has 246 items`);
check(poolOrder.seed === 42069, 'Seed is 42069');

const uniquePool = new Set(poolOrder.order);
check(uniquePool.size === 246, 'All pool IDs are unique');

// Verify all pool IDs exist in mint list
const allInMintList = poolOrder.order.every((id) => mintNfts.includes(id));
check(allInMintList, 'All pool IDs are from the mint list');

// 8. Check images
console.log('\n8. NFT IMAGES');
const imagesDir = '/home/raspberrypi/nft-collection/cumzillaraptors_solana/images';
const images = fs.readdirSync(imagesDir).filter(f => f.endsWith('.png'));
check(images.length === 420, `420 images present (found ${images.length})`);

// Verify image numbering
const imageNums = images.map(f => parseInt(f.replace('.png', ''))).sort((a,b) => a-b);
check(imageNums[0] >= 1 && imageNums[0] <= 420, `First image number: ${imageNums[0]}`);
check(imageNums[419] === 420, `Last image number: ${imageNums[419]}`);

// 9. Check claims-by-address
console.log('\n9. CLAIMS BY ADDRESS');
const addrCount = Object.keys(claimsByAddr).length;
check(addrCount === uniqueEth.size, `Claims by address has ${addrCount} entries (${uniqueEth.size} unique wallets)`);

const totalClaimedInLookup = Object.values(claimsByAddr).reduce((sum, nfts) => sum + nfts.length, 0);
check(totalClaimedInLookup === 174, `Total claimable NFTs in lookup: ${totalClaimedInLookup} (expect 174)`);

// Summary
console.log(`\n=== VERIFICATION COMPLETE ===`);
console.log(`Passed: ${passed}/${passed + failed}`);
console.log(`Failed: ${failed}/${passed + failed}`);

if (failed > 0) {
  process.exit(1);
}
