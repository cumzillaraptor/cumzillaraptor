const fs = require('fs');
const path = require('path');
const { keccak256 } = require('@ethersproject/keccak256');
const { MerkleTree } = require('merkletreejs');

// Config
const RESERVE_CSV = '/home/raspberrypi/nft-collection/cumzillaraptors_solana/reserve_list.csv';
const OUTPUT_DIR = '/home/raspberrypi/workspace-cumzillaraptor/nft-data';

// Read reserve list
const csv = fs.readFileSync(RESERVE_CSV, 'utf-8').trim().split('\n');
const headers = csv[0].split(',');
console.log('Headers:', headers);

// Parse rows
const claims = [];
for (let i = 1; i < csv.length; i++) {
    const row = csv[i].split(',');
    if (row.length < 3) continue;
    const nftNumber = parseInt(row[0]);
    const name = row[1];
    const ethAddress = row[2].trim().toLowerCase();
    claims.push({ nftNumber, name, ethAddress });
}

console.log(`\nTotal claims: ${claims.length}`);

// Build leaves: keccak256(eth_address (20 bytes) ++ nft_number (2 bytes big-endian))
function makeLeaf(ethAddress, nftNumber) {
    // Remove 0x prefix, convert to bytes
    const addrBytes = Buffer.from(ethAddress.replace('0x', ''), 'hex');
    const numBytes = Buffer.alloc(2);
    numBytes.writeUInt16BE(nftNumber);
    const combined = Buffer.concat([addrBytes, numBytes]);
    return keccak256(combined);
}

const leaves = claims.map(c => makeLeaf(c.ethAddress, c.nftNumber));
console.log(`Generated ${leaves.length} leaves`);

// Create merkle tree
const tree = new MerkleTree(leaves, keccak256, { sortPairs: true });
const root = tree.getRoot().toString('hex');
console.log('Merkle root:', '0x' + root);

// Generate proofs for each claim
const proofs = {};
const leafToClaim = {};
leaves.forEach((leaf, i) => {
    leafToClaim[leaf] = claims[i];
});

for (let i = 0; i < leaves.length; i++) {
    const leaf = leaves[i];
    const claim = claims[i];
    const proof = tree.getProof(leaf);
    const proofHex = proof.map(p => '0x' + p.data.toString('hex'));
    proofs[claim.nftNumber] = {
        nftNumber: claim.nftNumber,
        ethAddress: claim.ethAddress,
        leaf: '0x' + Buffer.from(leaf.replace('0x', ''), 'hex').toString('hex'),
        proof: proofHex,
    };
}

// Save full proofs
const proofsPath = path.join(OUTPUT_DIR, 'claim-proofs.json');
fs.writeFileSync(proofsPath, JSON.stringify(proofs, null, 2));
console.log(`\nProofs saved to: ${proofsPath}`);

// Save merkle root
const configPath = path.join(OUTPUT_DIR, 'merkle-config.json');
fs.writeFileSync(configPath, JSON.stringify({
    merkleRoot: '0x' + root,
    totalClaims: claims.length,
    rootBytes: Array.from(Buffer.from(root, 'hex')),
}, null, 2));
console.log(`Merkle config saved to: ${configPath}`);

// Also create a lookup by ETH address
const byAddress = {};
claims.forEach((c, i) => {
    if (!byAddress[c.ethAddress]) byAddress[c.ethAddress] = [];
    byAddress[c.ethAddress].push({
        nftNumber: c.nftNumber,
        name: c.name,
        proof: proofs[c.nftNumber].proof,
    });
});

const byAddressPath = path.join(OUTPUT_DIR, 'claims-by-address.json');
fs.writeFileSync(byAddressPath, JSON.stringify(byAddress, null, 2));
console.log(`Claims by address saved to: ${byAddressPath}`);

console.log('\n--- MERKLE TREE GENERATION COMPLETE ---');
console.log('Root:', '0x' + root);
