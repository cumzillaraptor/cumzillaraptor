const fs = require('fs');
const path = require('path');

// Read mint list CSV
const ROOT = path.resolve(__dirname, '..');
const MINT_CSV = process.env.CUMZ_MINT_CSV || path.join(ROOT, 'nft-data', 'allocation-source', 'mint_list.csv');
const OUTPUT_DIR = path.join(ROOT, 'nft-data');

const csv = fs.readFileSync(MINT_CSV, 'utf-8').trim().split('\n');

const mintNfts = [];
for (let i = 1; i < csv.length; i++) {
    const parts = csv[i].split(',');
    if (parts.length < 1) continue;
    const nftNumber = parseInt(parts[0]);
    mintNfts.push(nftNumber);
}

console.log(`Available for mint: ${mintNfts.length}`);

// Deterministic shuffle based on a seed
// In production, you'd use a verifiable random source
// For now, use a simple Fisher-Yates with a fixed seed
function seededShuffle(array, seed) {
    const shuffled = [...array];
    let m = shuffled.length;
    let s = seed;
    
    while (m) {
        // Simple LCG PRNG
        s = (s * 16807) % 2147483647;
        const i = Math.floor((s / 2147483647) * m);
        m--;
        [shuffled[m], shuffled[i]] = [shuffled[i], shuffled[m]];
    }
    
    return shuffled;
}

const SEED = 42069; // Fixed seed for determinism
const shuffled = seededShuffle(mintNfts, SEED);

console.log('Shuffled order (first 10):', shuffled.slice(0, 10));
console.log('Shuffled order (last 10):', shuffled.slice(-10));

// Save the shuffled pool order
const poolPath = path.join(OUTPUT_DIR, 'mint-pool-order.json');
fs.writeFileSync(poolPath, JSON.stringify({
    seed: SEED,
    total: shuffled.length,
    order: shuffled,
}, null, 2));
console.log(`\nMint pool order saved to: ${poolPath}`);

// Verify no duplicates
const unique = new Set(shuffled);
if (unique.size !== shuffled.length) {
    console.error('ERROR: Duplicates found in shuffled order!');
    process.exit(1);
}

// Verify all original IDs are present
const originalSet = new Set(mintNfts);
const shuffledSet = new Set(shuffled);
const missing = [...originalSet].filter(x => !shuffledSet.has(x));
if (missing.length > 0) {
    console.error('ERROR: Missing IDs:', missing);
    process.exit(1);
}

console.log(`✅ Shuffle verified — all ${shuffled.length} unique, no missing`);
console.log('\n--- MINT POOL ORDER GENERATED ---');
