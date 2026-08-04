import { keccak256 } from '@ethersproject/keccak256';
import { PublicKey } from '@solana/web3.js';

const PROGRAM_ID = '2YTAvP54MuSd7uUGbG9LrWiXCYh5UNHyqvy6XqxCTda2';
const CLUSTER = 'devnet';
const CLAIM_ROOT = '0x791d012fcb221a209f776df044657f81d69b16868534367242577604fc61b086';
const METADATA_ROOT = '0x8b673473b91b510896a2142b647c09b204a93e2ba79d35ec10fe7ea7b915ddaa';

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

function authorizationFor(fixture, claimant, expiryUnix) {
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
    nonceHex: '0xa49bcd89e4124698101d61f5b27a21f9f4864ad2f02d8569e5680ec4da68852e',
    leaf: '0x00321287dffa8945bc2ccf9566f8e880f57a0940db0393414bb713cbd0ed5b86',
    proof: ['0x62bfc5a926d738d39cae9063719931839ab05c79dd0bdef15b9949d4b88fe530', '0xfd3435e6196efca73a26a6181f02aab513cac660214b9c01690acf80edfbc75f', '0x8a11bef2b732b7ddd9fb8235f1b0b73f765c2c03dc303b1a91e5ae1857934e66', '0x22a36b92a3bc3b7290ebf64c21a5fdb79da572cef443530903c4d266398c13c4', '0xd8dab0a26ff764b733be4f6e32d83ea1f639286bc1585d9826c82d30e9b78188', '0xb744ea478f7e1c857badad7d0709b1763b38749857c48a53df84a2cbe14f771b', '0x9df1c43970a3ee3d8fd5415f20248f8480d7790a51d292e62a0f0586202f2280'],
  },
  metadata: {
    nftId: 360,
    name: 'cumzillaraptor #360',
    uri: 'ar://OuujNb0Z7WZiM-dXuIpiokq1x7nJjkcrCvm4TohLFaY',
    leaf: '0x97dc231cfb6fda883dc2a615e1477cce2fb2d0c73b0cd8b049f4baf7dd8857f8',
    proof: ['0x89582252b72daf565535dd66c3cb213708d331af9ca0dcd91998beb04f845198', '0x23e5fc7447c30349b02a7e2e8e649559085da4bdde98abc348e71157769e2d7d', '0xed594bfe43cbde35e66f254af90b3879e0735d1e34259a21c3ff9fe10ef019ab', '0x4e8d5eff53cfbfeba74e177892c71b806321f692728dccfe09e10a621d5657ff', '0x0486800301417cb2f9a7e264a997e902a2ba277a32e3192d4a57a220855ea119', '0x5373f1bce024950430442d726a3ecf80d330c18d23f29bb387bef1ae3dfbe0a6', '0x3f119cb92fb36ae2026b41cb2cd0c17cd3cc7fd5512c1a6872d044f49980f467', '0x0a4fbcc566d1aecbd30ac8026aa98fbc77ef936240dd6ee1aa37ace7dbc8ab8d', '0x538eb078f2711a22e90f735660b291bfd6d036a2713e45d624567ed521febaf5'],
  },
  claimAuthorizationFor(claimant, expiryUnix) {
    return authorizationFor(this, claimant, expiryUnix);
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
