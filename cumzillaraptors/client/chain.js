// cumzillaraptor on-chain client helpers (devnet).
// Pure functions only: config PDA read, PDA derivation, keccak leaf/nonce computation,
// claim message build. No wallet/signing logic here — pages own that.
// All leaf/nonce layouts verified byte-for-byte against the deployed program
// (claims.rs claim_leaf_v1, metadata.rs metadata_leaf_v1) and repo artifacts.
import { Connection, PublicKey } from "@solana/web3.js";
import { keccak256 } from "@ethersproject/keccak256";

export const CLAIM_DOMAIN = "CUMZILLARAPTORS_CLAIM_V1";
export const METADATA_DOMAIN = "CUMZILLARAPTORS_METADATA_V1";
export const CLUSTER = "devnet";
export const MPL_CORE_ID = new PublicKey("CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d");

const SALE_STATES = { 0: "setup", 1: "live", 2: "paused" };

function utf8(s) { return Buffer.from(s, "utf8"); }
function u16be(v) { const b = Buffer.alloc(2); b.writeUInt16BE(v); return b; }

function normalizeEth(address) {
  if (typeof address !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    throw new Error("Invalid Ethereum address");
  }
  return address.toLowerCase();
}

export function getConfigPda(programId) {
  return PublicKey.findProgramAddressSync([utf8("config")], programId)[0];
}

export function getAllocationPda(programId) {
  return PublicKey.findProgramAddressSync([utf8("allocation")], programId)[0];
}

export function getAssetPda(programId, nftId) {
  return PublicKey.findProgramAddressSync([utf8("asset"), u16be(nftId)], programId)[0];
}

// keccak(DOMAIN_NONCE_V1 || program || cluster || eth || id_be) — per claim-message-v1.js
export function deterministicNonceHex(programId, ethAddress, nftId) {
  return keccak256(Buffer.concat([
    utf8(CLAIM_DOMAIN + "_NONCE_V1"),
    programId.toBuffer(),
    utf8(CLUSTER),
    Buffer.from(normalizeEth(ethAddress).slice(2), "hex"),
    u16be(nftId),
  ]));
}

// keccak(DOMAIN || program || cluster || eth || id_be || nonce) — per claims.rs claim_leaf_v1
export function claimLeafHex(programId, ethAddress, nftId, nonceHex) {
  return keccak256(Buffer.concat([
    utf8(CLAIM_DOMAIN),
    programId.toBuffer(),
    utf8(CLUSTER),
    Buffer.from(normalizeEth(ethAddress).slice(2), "hex"),
    u16be(nftId),
    Buffer.from(String(nonceHex).slice(2), "hex"),
  ]));
}

// keccak(METADATA_DOMAIN || program || cluster_len || cluster || id_be || name_len || name || uri_len || uri)
// — per metadata.rs metadata_leaf_v1 (name must be exactly "cumzillaraptor #<id>")
export function metadataLeafHex(programId, nftId, uri) {
  const name = `cumzillaraptor #${nftId}`;
  return keccak256(Buffer.concat([
    utf8(METADATA_DOMAIN),
    programId.toBuffer(),
    Buffer.from([CLUSTER.length]),
    utf8(CLUSTER),
    u16be(nftId),
    u16be(name.length),
    utf8(name),
    u16be(uri.length),
    utf8(uri),
  ]));
}

// Exact signed message per secp256k1.rs build_claim_message ("devnet" cluster)
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
  const msgBytes = Buffer.from(message, "utf8");
  const prefix = Buffer.from(`\x19Ethereum Signed Message:\n${msgBytes.length}`, "utf8");
  return keccak256(Buffer.concat([prefix, msgBytes]));
}

// Read the immutable launch config PDA. Returns null if launch is not initialized.
export async function fetchLaunchState(rpcUrl, programIdStr) {
  const conn = new Connection(rpcUrl, "confirmed");
  const programId = new PublicKey(programIdStr);
  const info = await conn.getAccountInfo(getConfigPda(programId));
  if (!info || info.data.length < 269) return null;
  const d = info.data;
  // CollectionConfig after 8-byte discriminator:
  // launch_authority(32) treasury(32) core_program(32) collection(32)
  // allocation_hash(32) claim_root(32) metadata_root(32) cluster_tag_hash(32)
  // sale_state(u8 @264) public_minted(u16le @265) claims_minted(u16le @267) bump(u8 @269)
  return {
    launchAuthority: new PublicKey(d.subarray(8, 40)).toBase58(),
    treasury: new PublicKey(d.subarray(40, 72)).toBase58(),
    collection: new PublicKey(d.subarray(72, 104)).toBase58(),
    claimRoot: "0x" + Buffer.from(d.subarray(136, 168)).toString("hex"),
    metadataRoot: "0x" + Buffer.from(d.subarray(168, 200)).toString("hex"),
    saleState: SALE_STATES[d[264]] ?? "unknown",
    isLive: d[264] === 1,
    publicMinted: d.readUInt16LE(265),
    claimsMinted: d.readUInt16LE(267),
  };
}
