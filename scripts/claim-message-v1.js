'use strict';

const { PublicKey } = require('@solana/web3.js');
const { keccak256 } = require('@ethersproject/keccak256');

const DOMAIN = 'CUMZILLARAPTORS_CLAIM_V1';
const MAX_NFT_ID = 420;
const U64_MAX = (1n << 64n) - 1n;

function fail(message) {
  throw new Error(message);
}

function normalizeEthAddress(address) {
  if (typeof address !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(address)) fail('ETH address must be a 20-byte 0x-prefixed hex address.');
  // Lowercase addresses are canonical; mixed-case input must be an EIP-55 checksum.
  if (/[a-f]/.test(address) && /[A-F]/.test(address)) {
    const raw = address.slice(2).toLowerCase();
    const digest = keccak256(Buffer.from(raw, 'ascii')).slice(2);
    for (let index = 0; index < raw.length; index += 1) {
      if (/[a-f]/.test(raw[index]) && ((Number.parseInt(digest[index], 16) >= 8) !== (address.slice(2)[index] === address.slice(2)[index].toUpperCase()))) {
        fail('ETH address has an invalid EIP-55 checksum.');
      }
    }
  }
  return `0x${address.slice(2).toLowerCase()}`;
}

function publicKeyBytes(value, label) {
  try {
    return new PublicKey(value).toBuffer();
  } catch {
    fail(`${label} must be a valid Solana public key.`);
  }
}

function normalizeCluster(cluster) {
  if (typeof cluster !== 'string' || !/^[a-z0-9-]{1,32}$/.test(cluster)) fail('Cluster must be lowercase alphanumeric or hyphen.');
  return cluster;
}

function normalizeNftId(nftId) {
  if (!Number.isInteger(nftId) || nftId < 1 || nftId > MAX_NFT_ID) fail(`NFT ID must be an integer in 1..${MAX_NFT_ID}.`);
  return nftId;
}

function nonceBytes(nonceHex) {
  if (typeof nonceHex !== 'string' || !/^0x[0-9a-f]{64}$/.test(nonceHex)) fail('Nonce must be exactly 32 lowercase bytes as 0x-prefixed hex.');
  return Buffer.from(nonceHex.slice(2), 'hex');
}

function normalizeExpiry(expiryUnix) {
  if ((typeof expiryUnix !== 'string' && typeof expiryUnix !== 'number' && typeof expiryUnix !== 'bigint') || !/^\d+$/.test(String(expiryUnix))) fail('Expiry must be an unsigned u64 decimal value.');
  const value = BigInt(expiryUnix);
  if (value > U64_MAX) fail('Expiry must fit in u64.');
  return value.toString();
}

function u16be(value) {
  const bytes = Buffer.alloc(2);
  bytes.writeUInt16BE(value);
  return bytes;
}

function buildClaimMessage({ cluster, programId, recipient, nftId, ethAddress, nonceHex, expiryUnix }) {
  const canonicalCluster = normalizeCluster(cluster);
  publicKeyBytes(programId, 'Program ID');
  publicKeyBytes(recipient, 'Recipient');
  const canonicalNftId = normalizeNftId(nftId);
  const canonicalEthAddress = normalizeEthAddress(ethAddress);
  nonceBytes(nonceHex);
  const canonicalExpiry = normalizeExpiry(expiryUnix);
  return [
    DOMAIN,
    `cluster: ${canonicalCluster}`,
    `program: ${programId}`,
    `recipient: ${recipient}`,
    `nft_id: ${canonicalNftId}`,
    `eth_address: ${canonicalEthAddress}`,
    `nonce: ${nonceHex}`,
    `expiry_unix: ${canonicalExpiry}`,
  ].join('\n');
}

function claimMessageHash(message) {
  if (typeof message !== 'string' || !message.startsWith(`${DOMAIN}\n`)) fail('Claim message must use the V1 domain.');
  const messageBytes = Buffer.from(message, 'utf8');
  // Ethereum personal_sign / EIP-191 version 0x45 preimage.
  const prefix = Buffer.from(`\x19Ethereum Signed Message:\n${messageBytes.length}`, 'utf8');
  return keccak256(Buffer.concat([prefix, messageBytes]));
}

function makeClaimLeaf({ programId, clusterTag, ethAddress, nftId, nonceHex }) {
  const cluster = normalizeCluster(clusterTag);
  const clusterBytes = Buffer.from(cluster, 'utf8');
  const id = normalizeNftId(nftId);
  return keccak256(Buffer.concat([
    Buffer.from(DOMAIN, 'utf8'),
    publicKeyBytes(programId, 'Program ID'),
    clusterBytes,
    Buffer.from(normalizeEthAddress(ethAddress).slice(2), 'hex'),
    u16be(id),
    nonceBytes(nonceHex),
  ]));
}

function deterministicNonce({ programId, clusterTag, ethAddress, nftId }) {
  const cluster = normalizeCluster(clusterTag);
  const id = normalizeNftId(nftId);
  return keccak256(Buffer.concat([
    Buffer.from(`${DOMAIN}_NONCE_V1`, 'utf8'),
    publicKeyBytes(programId, 'Program ID'),
    Buffer.from(cluster, 'utf8'),
    Buffer.from(normalizeEthAddress(ethAddress).slice(2), 'hex'),
    u16be(id),
  ]));
}

module.exports = { DOMAIN, buildClaimMessage, claimMessageHash, deterministicNonce, makeClaimLeaf, normalizeEthAddress };
