import { keccak256 } from '@ethersproject/keccak256';
import { PublicKey } from '@solana/web3.js';

const PROGRAM_ID = 'AYE4iC2gp81H8jvMjk4EGxWP2sJFzuDptUwxqwTZYTMY';
const CLUSTER = 'devnet';
const CLAIM_ROOT = '0x8443ba0a33024e5edbbf59ecc82a30e27255c2774884d190fb1f0ae11b9ebdef';
const METADATA_ROOT = '0x689ab71d32efff276df2a0e14f72ee9eb159da3508cfe9d337a9fcc3c2220211';

const hexBytes = (hex) => Buffer.from(hex.replace(/^0x/, ''), 'hex');
const hash = (...parts) => keccak256(Buffer.concat(parts));
const sortedProofRoot = (leaf, proof) => proof.reduce((current, sibling) => (
  Buffer.compare(hexBytes(current), hexBytes(sibling)) <= 0
    ? hash(hexBytes(current), hexBytes(sibling))
    : hash(hexBytes(sibling), hexBytes(current))
), leaf);

function claimLeaf({ programId, cluster, claim }) {
  return hash(
    Buffer.from('CUMZILLARAPTORS_CLAIM_V1'),
    new PublicKey(programId).toBuffer(),
    Buffer.from(cluster),
    hexBytes(claim.ethAddress),
    Buffer.from([claim.nftId >> 8, claim.nftId & 0xff]),
    hexBytes(claim.nonceHex),
  );
}

function metadataLeaf({ programId, cluster, metadata }) {
  const name = Buffer.from(metadata.name);
  const uri = Buffer.from(metadata.uri);
  return hash(
    Buffer.from('CUMZILLARAPTORS_METADATA_V1'),
    new PublicKey(programId).toBuffer(),
    Buffer.from([Buffer.byteLength(cluster)]),
    Buffer.from(cluster),
    Buffer.from([metadata.nftId >> 8, metadata.nftId & 0xff]),
    Buffer.from([name.length >> 8, name.length & 0xff]),
    name,
    Buffer.from([uri.length >> 8, uri.length & 0xff]),
    uri,
  );
}

export function claimAuthorizationFor(fixture, claimant, expiryUnix) {
  const message = [
    'CUMZILLARAPTORS_CLAIM_V1',
    `cluster: ${fixture.cluster}`,
    `program: ${fixture.programId}`,
    `recipient: ${claimant}`,
    `nft_id: ${fixture.claim.nftId}`,
    `eth_address: ${fixture.claim.ethAddress}`,
    `nonce: ${fixture.claim.nonceHex}`,
    `expiry_unix: ${expiryUnix}`,
  ].join('\n');
  return {
    message,
    preimage: Buffer.concat([
      Buffer.from(`\x19Ethereum Signed Message:\n${Buffer.byteLength(message)}`),
      Buffer.from(message),
    ]),
  };
}

export const V1_CLAIM_FIXTURE = {
  programId: PROGRAM_ID,
  cluster: CLUSTER,
  claimRoot: CLAIM_ROOT,
  metadataRoot: METADATA_ROOT,
  claim: {
    nftId: 360,
    name: 'cumzillaraptor #360',
    ethAddress: '0xfadf08b0ecc8f128b22d8fb738024db10d34df91',
    nonceHex: '0x96d683389d7fcde34360507f450bec3227ed971e59f8b07eab111f8eb25d9b2d',
    leaf: '0xff3dc85f292fcb6977c7d97ee5ff119c5fa5f2e35363209ff377ccd2dd1b58db',
    proof: ['0x0343ee26afbb24edfa521d7bc3caed78391b09ff8f8af8cc65be217327c1833f', '0x2089f482153e5536524c194598701d2ac7038dc221240c4f9b4a92ad106e74d7', '0x4f46fb673c6897226a42774b15c4415c96bd16af9013401fef71cfda8e7d34ba', '0xcca04024c511ce68bbda599d8926a716e32bf00937addd80edfe3a16eb679c23', '0x1d103ee630f96c125c02456797f81a2fd049ef03260c67f8ec22309b07221363', '0x8c4ccbbffe175fb4e751fdc8b95d5fb3b4d04f0b2140415525f36e9aeb833180', '0x2882e0b739d3bad836bb9f5e6e5f6f387d647c943f936861cf298133f31fd5f7'],
  },
  metadata: {
    nftId: 360,
    name: 'cumzillaraptor #360',
    uri: 'ar://z-1hTTF1-FK80VkPw6yiO_d1y2_qdZ4Cjm37y-eW-cI',
    leaf: '0xe653a6ca3f839952c12760ab19bbf9ad208a9f2d546136c40a9fb712a1acde9b',
    proof: ['0xee6915f2b7464c701d609e1f9c5cdbf8a9503949bc00055a5a80fd1723fc9882', '0xc1340872ce2fc8cdc6b47b75e89af875602b17edcb767d05befb83429462905b', '0xb8ede979d5a6b8668e110c316a0f6e39104dc3df8e27d1d135beafbeaa57acb2', '0xe0fa4b2de7f4adb360b760343d6efb184656ff78da3569191a4d8029cf7a274d', '0x2c742b9f3e069a6490bdcde7ff72bb01fbe5ae7bc2c653a3bf8f815f1c2f8c20', '0x59b6bab2db0ee83badad2c06b29524a4f5fee8760128d4b75c794930b704f7af', '0x34bba6e3d7ec7b9a432841841393ea953ccbe20c6c1367b74e1765eeafd45c6f', '0x74dd8983a2d257e81863aa202344eb41a7810b6a51115927a70181faa5c6d806', '0x3af0508e7a58dd76b8a5ea02fe2c833cb6e989e836239ab9b6d7c98cefb4ce38'],
  },
  claimAuthorizationFor(claimant, expiryUnix) {
    return claimAuthorizationFor(this, claimant, expiryUnix);
  },
};

export function verifyCommittedV1Fixture(fixture) {
  const computedClaimLeaf = claimLeaf(fixture);
  const computedMetadataLeaf = metadataLeaf(fixture);
  return {
    claimLeaf: computedClaimLeaf,
    metadataLeaf: computedMetadataLeaf,
    claimRoot: sortedProofRoot(computedClaimLeaf, fixture.claim.proof),
    metadataRoot: sortedProofRoot(computedMetadataLeaf, fixture.metadata.proof),
  };
}

export { claimLeaf, metadataLeaf, sortedProofRoot };
