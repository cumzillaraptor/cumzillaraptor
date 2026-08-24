// Verify the fresh browser client module (chain.js) against live devnet state.
// Runs the same code paths the pages will use, via ESM import.
const _sha3mod = await import('js-sha3');
const _sha3 = _sha3mod.keccak256 ? _sha3mod : _sha3mod.default;
globalThis.window = { keccak256: _sha3.keccak256 };
const mod = await import('../cumzillaraptors/client/chain.js');
const {
  deterministicNonceHex, claimLeafHex, metadataLeafHex,
  getConfigPda, getAllocationPda, getAssetPda, getReceiptPda,
  fetchLaunchState, fetchAllocatedIds, validateRegistryLayout,
  buildClaimMessage, claimMessageHashHex,
} = mod;
const { Connection, PublicKey } = await import('@solana/web3.js');

const PROGRAM = new PublicKey('AYE4iC2gp81H8jvMjk4EGxWP2sJFzuDptUwxqwTZYTMY');
let fails = 0;
const check = (label, ok, detail) => { console.log((ok ? 'PASS' : 'FAIL') + ' ' + label + (detail ? ' — ' + detail : '')); if (!ok) fails++; };

// 1) claim #4: nonce + leaf vs committed artifacts
const claims = JSON.parse((await import('node:fs/promises')).readFileDefault || 'null') ||
  JSON.parse((await import('node:fs')).readFileSync('nft-data/claims-v1.devnet.json', 'utf8'));
const e4 = claims.claims.find(c => c.nftId === 4);
const nonce = deterministicNonceHex(PROGRAM, e4.ethAddress, 4);
check('nonce#4 matches committed', nonce.toLowerCase() === e4.nonceHex.toLowerCase());
const leaf = claimLeafHex(PROGRAM, e4.ethAddress, 4, nonce);
check('leaf#4 matches committed', leaf.toLowerCase() === e4.leaf.toLowerCase());

// 2) receipt PDA
check('receiptPDA#4', getReceiptPda(PROGRAM, leaf).toBase58() === 'BfwS7hxwHzCvq1Stn6wjoddxAiswhQGdfqZ3iJGYrLv3');
// 3) asset PDAs (known from rehearsal)
check('assetPDA#2', getAssetPda(PROGRAM, 2).toBase58() === '4m1E69pUDECcDjYqpVFVzRRzPLAP9Lf78uX5YDRr4jS2');
check('assetPDA#4', getAssetPda(PROGRAM, 4).toBase58() === 'CfFzKB53dgUboHwobevcGkMCYy5a7AwR52XoaFYuTe6Z');

// 4) metadata leaf for #2 vs committed metadata-merkle artifact
const md = JSON.parse((await import('node:fs')).readFileSync('nft-data/metadata-merkle-v1.devnet.json', 'utf8'));
// canonical artifact keys: nftId, name, uri, leaf, proof
for (const v of Object.values(md.metadata)) { v.u = v.uri; v.p = v.proof; }
const m2leaf = metadataLeafHex(PROGRAM, 2, md.metadata['2'].uri);
// derive expected via merkletreejs-style: we can't rebuild whole tree cheaply; instead check proof verifies with lib
const MT = await import('merkletreejs');
const MerkleTree = MT.MerkleTree || MT.default?.MerkleTree || MT.default;
const { keccak256 } = await import('@ethersproject/keccak256');
const leaves = Object.entries(md.metadata).map(([id, m]) => Buffer.from(metadataLeafHex(PROGRAM, Number(id), m.u).slice(2), 'hex'));
const tree = new MerkleTree(leaves, keccak256, { sortPairs: true });
check('metadata root rebuilt from client leaves', '0x' + tree.getRoot().toString('hex') === md.merkleRoot);
const proofOk = tree.verify(
  md.metadata['2'].p.map(h => Buffer.from(h.slice(2), 'hex')),
  Buffer.from(m2leaf.slice(2), 'hex'),
  tree.getRoot(),
);
check('metadataLeaf(#2) verifies against committed proof', proofOk);

// 5) message builder vs rehearsal values
const msg = buildClaimMessage({ programId: PROGRAM, recipient: '8eCKWEHZ525kBLnh4mQBnhpkk4nmde5jSeQC7FGR8t3d',
  nftId: 4, ethAddress: '0xb0E683427202D14366977B7183d228a508B5a19C', nonceHex: nonce, expiryUnix: 1787618331 });
check('messageHash == rehearsal hash', claimMessageHashHex(msg).toLowerCase() === '0x6a41d503b4d5d7d21d609147124b9712898218c01d71f17f07eb631ab61d8138');

// 6) live chain reads
const conn = new Connection('https://api.devnet.solana.com', 'confirmed');
const st = await fetchLaunchState('https://api.devnet.solana.com', PROGRAM.toBase58());
check('launch state read', !!st && st.isLive && st.publicMinted === 1 && st.claimsMinted === 1,
  st ? `state=${st.saleState} minted=${st.publicMinted}/${246} claimed=${st.claimsMinted}` : 'null');
check('claimRoot on-chain matches committed', st.claimRoot.toLowerCase() === claims.merkleRoot.toLowerCase());
check('treasury from PDA', st.treasury === 'FiHKQhwq2ZKkD2ZbBf3mPYgyw2Y9QDzNYykpMGErovU6');
check('collection learned live', st.collection === '3DQ3LQ6JKq8PjUL4dg2VB7FajPSh8wywqsbJi7sCAfKK');

const regInfo = await conn.getAccountInfo(getAllocationPda(PROGRAM));
validateRegistryLayout(regInfo.data);
console.log('PASS registry layout validated (492-byte id vec, 53-byte bitmap)');
const alloc = await fetchAllocatedIds('https://api.devnet.solana.com', PROGRAM.toBase58());
check('allocated set has exactly ids 2 and 4', alloc.size === 2 && alloc.has(2) && alloc.has(4), `size=${alloc.size}`);

console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} CHECK(S) FAILED`);
process.exit(fails === 0 ? 0 : 1);
