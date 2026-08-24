// cumzillaraptor shared on-chain client (browser, devnet).
// Pure functions only: PDA derivation, keccak leaf/nonce computation, claim message build,
// launch-state fetch, instruction encoding. No wallet/signing logic — pages own that.
//
// Browser-safe: no Node Buffer anywhere (Uint8Array + TextEncoder only).
// All layouts verified byte-for-byte against the deployed program @ e00189b:
//   - claims.rs claim_leaf_v1: keccak(DOMAIN || program || cluster || eth || id_be || nonce)
//   - metadata.rs metadata_leaf_v1: keccak(METADATA_DOMAIN || program || u8(cluster_len) || cluster
//       || id_be || u16(name_len) || name || u16(uri_len) || uri), name = "cumzillaraptor #<id>"
//   - claim-message-v1.js nonce: keccak(DOMAIN_NONCE_V1 || program || cluster || eth || id_be)
//   - SaleState enum per state.rs: Setup=0, Paused=1, Live=2
import { Connection, PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import { keccak256 } from "@ethersproject/keccak256";

export const CLAIM_DOMAIN = "CUMZILLARAPTORS_CLAIM_V1";
export const METADATA_DOMAIN = "CUMZILLARAPTORS_METADATA_V1";
export const CLUSTER = "devnet";

// ---- byte helpers (no Buffer) ----
export function utf8(s) { return new TextEncoder().encode(s); }
export function hexBytes(h) {
  const x = h.startsWith("0x") ? h.slice(2) : h;
  if (x.length % 2 !== 0) throw new Error("odd-length hex");
  const out = new Uint8Array(x.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(x.substr(i * 2, 2), 16);
  return out;
}
export function bytesToHex(b) {
  let s = "";
  for (const v of b) s += v.toString(16).padStart(2, "0");
  return "0x" + s;
}
export function u16be(v) { const b = new Uint8Array(2); b[0] = (v >> 8) & 0xff; b[1] = v & 0xff; return b; }
export function u16le(v) { const b = new Uint8Array(2); b[0] = v & 0xff; b[1] = (v >> 8) & 0xff; return b; }
export function u32le(v) {
  const b = new Uint8Array(4);
  b[0] = v & 0xff; b[1] = (v >> 8) & 0xff; b[2] = (v >> 16) & 0xff; b[3] = (v >>> 24) & 0xff;
  return b;
}
export function u64le(v) {
  const b = new Uint8Array(8); let n = BigInt(v);
  for (let i = 0; i < 8; i++) { b[i] = Number(n & 0xffn); n >>= 8n; }
  return b;
}
export function concatBytes(...arrs) {
  const total = arrs.reduce((a, b) => a + b.length, 0);
  const out = new Uint8Array(total); let o = 0;
  for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
}
export function borshBytes(b) { return concatBytes(u32le(b.length), b); }
export function borshStr(s) { return borshBytes(utf8(s)); }
export function borshVec32(arr) {
  return concatBytes(u32le(arr.length), ...arr.map((h) => hexBytes(h)));
}

// Anchor discriminator: sha256("global:<name>")[0..8] (async — Web Crypto)
export async function anchorDisc(name) {
  const digest = await crypto.subtle.digest("SHA-256", utf8("global:" + name));
  return new Uint8Array(digest).slice(0, 8);
}

function normalizeEth(address) {
  if (typeof address !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    throw new Error("Invalid Ethereum address");
  }
  return address.toLowerCase();
}

// ---- PDAs ----
export function getConfigPda(programId) {
  return PublicKey.findProgramAddressSync([utf8("config")], programId)[0];
}
export function getAllocationPda(programId) {
  return PublicKey.findProgramAddressSync([utf8("allocation")], programId)[0];
}
export function getAssetPda(programId, nftId) {
  return PublicKey.findProgramAddressSync([utf8("asset"), u16be(nftId)], programId)[0];
}
export function getReceiptPda(programId, claimLeafHexStr) {
  return PublicKey.findProgramAddressSync([utf8("claim"), hexBytes(claimLeafHexStr)], programId)[0];
}

// ---- hashing (all return 0x-prefixed hex) ----
export function deterministicNonceHex(programId, ethAddress, nftId) {
  return keccak256(concatBytes(
    utf8(CLAIM_DOMAIN + "_NONCE_V1"),
    new Uint8Array(programId.toBytes()),
    utf8(CLUSTER),
    hexBytes(normalizeEth(ethAddress)),
    u16be(nftId),
  ));
}
export function claimLeafHex(programId, ethAddress, nftId, nonceHex) {
  return keccak256(concatBytes(
    utf8(CLAIM_DOMAIN),
    new Uint8Array(programId.toBytes()),
    utf8(CLUSTER),
    hexBytes(normalizeEth(ethAddress)),
    u16be(nftId),
    hexBytes(nonceHex),
  ));
}
export function metadataLeafHex(programId, nftId, uri) {
  const name = `cumzillaraptor #${nftId}`;
  return keccak256(concatBytes(
    utf8(METADATA_DOMAIN),
    new Uint8Array(programId.toBytes()),
    new Uint8Array([CLUSTER.length]),        // u8 cluster length
    utf8(CLUSTER),
    u16be(nftId),
    u16be(name.length),
    utf8(name),
    u16be(uri.length),
    utf8(uri),
  ));
}

// Exact EIP-191 message signed by the ETH holder ("devnet" cluster)
export function buildClaimMessage({ programId, recipient, nftId, ethAddress, nonceHex, expiryUnix }) {
  const eth = normalizeEth(ethAddress);
  return [
    CLAIM_DOMAIN,
    `cluster: ${CLUSTER}`,
    `program: ${programId.toBase58()}`,
    `recipient: ${recipient.toBase58 ? recipient.toBase58() : recipient}`,
    `nft_id: ${nftId}`,
    `eth_address: 0x${eth.slice(2)}`,
    `nonce: 0x${String(nonceHex).slice(2).toLowerCase()}`,
    `expiry_unix: ${expiryUnix}`,
  ].join("\n");
}

// EIP-191 personal_sign hash of the claim message (what the ETH wallet signs)
export function claimMessageHashHex(message) {
  const msgBytes = utf8(message);
  const prefix = utf8(`\x19Ethereum Signed Message:\n${msgBytes.length}`);
  return keccak256(concatBytes(prefix, msgBytes));
}

// ---- instruction builders ----
// accounts: config, registry, buyer(signer,writable), treasury(writable),
//           collection(writable), asset(writable), mpl_core, system_program
export async function buildMintInstruction({ programId, configPda, registryPda, buyer,
                                              treasury, collection, assetPda, mplCore,
                                              nftId, name, uri, metadataProof }) {
  const data = concatBytes(
    await anchorDisc("mint_nft"),
    u16le(nftId),
    borshStr(name),
    borshStr(uri),
    borshVec32(metadataProof),
  );
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: configPda, isSigner: false, isWritable: true },
      { pubkey: registryPda, isSigner: false, isWritable: true },
      { pubkey: buyer, isSigner: true, isWritable: true },
      { pubkey: treasury, isSigner: false, isWritable: true },
      { pubkey: collection, isSigner: false, isWritable: true },
      { pubkey: assetPda, isSigner: false, isWritable: true },
      { pubkey: mplCore, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

// New surface @ e00189b: signature embedded in instruction data (65-byte r||s||v),
// no secp precompile ix, no instructions sysvar.
// accounts: config, registry, claimer(signer,writable), collection(writable),
//           asset(writable), receipt(writable), mpl_core, system_program
export async function buildClaimInstruction({ programId, configPda, registryPda, claimer,
                                              collection, assetPda, receiptPda, mplCore,
                                              nftId, ethAddress, nonceHex, expiryUnix,
                                              claimProof, name, uri, metadataProof,
                                              signatureHex }) {
  const sig = hexBytes(signatureHex);
  if (sig.length !== 65) throw new Error("ETH signature must be 65 bytes");
  const eth = normalizeEth(ethAddress);
  const data = concatBytes(
    await anchorDisc("claim_nft"),
    u16le(nftId),
    hexBytes(eth),                 // [u8;20]
    hexBytes(nonceHex),            // [u8;32]
    u64le(expiryUnix),
    borshVec32(claimProof),
    borshStr(name),
    borshStr(uri),
    borshVec32(metadataProof),
    sig,                           // [u8;65] r||s||v
  );
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: configPda, isSigner: false, isWritable: true },
      { pubkey: registryPda, isSigner: false, isWritable: true },
      { pubkey: claimer, isSigner: true, isWritable: true },
      { pubkey: collection, isSigner: false, isWritable: true },
      { pubkey: assetPda, isSigner: false, isWritable: true },
      { pubkey: receiptPda, isSigner: false, isWritable: true },
      { pubkey: mplCore, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

// ---- chain reads ----
const SALE_STATES = { 0: "setup", 1: "paused", 2: "live" }; // enum order: Setup, Paused, Live

// Read the immutable launch config PDA. Returns null if launch is not initialized.
export async function fetchLaunchState(rpcUrl, programIdStr) {
  const conn = new Connection(rpcUrl, "confirmed");
  const programId = new PublicKey(programIdStr);
  const info = await conn.getAccountInfo(getConfigPda(programId));
  if (!info || info.data.length < 270) return null;
  const d = info.data;
  // CollectionConfig after 8-byte discriminator:
  // launch_authority(32) treasury(32) core_program(32) collection(32)
  // allocation_hash(32) claim_root(32) metadata_root(32) cluster_tag_hash(32)
  // sale_state(u8 @264) public_minted(u16le @265) claims_minted(u16le @267) bump(u8 @269)
  return {
    launchAuthority: new PublicKey(d.slice(8, 40)).toBase58(),
    treasury: new PublicKey(d.slice(40, 72)).toBase58(),
    coreProgram: new PublicKey(d.slice(72, 104)).toBase58(),
    collection: new PublicKey(d.slice(104, 136)).toBase58(),
    allocationHash: bytesToHex(d.slice(136, 168)),
    claimRoot: bytesToHex(d.slice(168, 200)),
    metadataRoot: bytesToHex(d.slice(200, 232)),
    saleStateRaw: d[264],
    saleState: SALE_STATES[d[264]] ?? "unknown",
    isLive: d[264] === 2,
    publicMinted: d[265] | (d[266] << 8),
    claimsMinted: d[267] | (d[268] << 8),
  };
}

// Allocation registry: disc(8) manifest_hash(32) public_ids [u16;246](492) allocated [u8;53] bump(1)
// Fixed-size arrays — no Vec length prefixes. Returns Set of allocated public ids.
export async function fetchAllocatedIds(rpcUrl, programIdStr) {
  const conn = new Connection(rpcUrl, "confirmed");
  const programId = new PublicKey(programIdStr);
  const info = await conn.getAccountInfo(getAllocationPda(programId));
  if (!info) throw new Error("allocation registry not initialized");
  validateRegistryLayout(info.data);
  const d = info.data;
  const bmp = d.slice(532, 532 + 53); // 8+32+492 = 532; bitmap is 53 bytes (424 bit capacity)
  const allocated = new Set();
  for (let i = 0; i < bmp.length * 8; i++) {
    if ((bmp[i >> 3] & (1 << (i & 7))) !== 0) allocated.add(i + 1);
  }
  return allocated;
}

// Registry layout self-check: throws if the on-chain account does not match expected sizes.
export function validateRegistryLayout(data) {
  if (data.length !== 586) throw new Error(`registry length ${data.length} != 586`);
  return true;
}
