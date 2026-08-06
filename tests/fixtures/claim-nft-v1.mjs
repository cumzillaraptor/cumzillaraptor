import { keccak256 } from '@ethersproject/keccak256';
import { PublicKey } from '@solana/web3.js';

const PROGRAM_ID = '2YTAvP54MuSd7uUGbG9LrWiXCYh5UNHyqvy6XqxCTda2';
const CLUSTER = 'devnet';
const CLAIM_ROOT = '0x791d012fcb221a209f776df044657f81d69b16868534367242577604fc61b086';
const METADATA_ROOT = '0x5874f7c11db9717c89ab56de12fdb309be4043e31fc69486b735382935087caa';

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
    nonceHex: '0xa49bcd89e4124698101d61f5b27a21f9f4864ad2f02d8569e5680ec4da68852e',
    leaf: '0x00321287dffa8945bc2ccf9566f8e880f57a0940db0393414bb713cbd0ed5b86',
    proof: ['0x62bfc5a926d738d39cae9063719931839ab05c79dd0bdef15b9949d4b88fe530', '0xfd3435e6196efca73a26a6181f02aab513cac660214b9c01690acf80edfbc75f', '0x8a11bef2b732b7ddd9fb8235f1b0b73f765c2c03dc303b1a91e5ae1857934e66', '0x22a36b92a3bc3b7290ebf64c21a5fdb79da572cef443530903c4d266398c13c4', '0xd8dab0a26ff764b733be4f6e32d83ea1f639286bc1585d9826c82d30e9b78188', '0xb744ea478f7e1c857badad7d0709b1763b38749857c48a53df84a2cbe14f771b', '0x9df1c43970a3ee3d8fd5415f20248f8480d7790a51d292e62a0f0586202f2280'],
  },
  metadata: {
      "nftId": 360,
      "name": "cumzillaraptor #360",
      "uri": "ar://z-1hTTF1-FK80VkPw6yiO_d1y2_qdZ4Cjm37y-eW-cI",
      "leaf": "0x219681b8dfb728c8bb445b753f7149a4d4691b90d6ebb3ccc8169e33c347edb4",
      "proof": [
          "0x634e207df097f3b4cbc8a9dfee8b028e125f2b87253affefda83acee830d0b2e",
          "0x227293a3cd63f8a3d02f5d01936b3c71d0189d5fe7c1fa2474aec24b8df34b31",
          "0x100dd6b6b5542264ef73b4ec7b41bba898ee159a2217edb2892cc96e129ee69d",
          "0xa61ee929121c041499ccde06ab685b5ef7fb573ff8410d89bc9d201d7abd6bcc",
          "0x896993ca21c6b9d4fef7439c0965029a1a8218643fb99c608d59075c71a53d48",
          "0x436de46c8d58b9e174a02fd3fc1572efed3ba4750210c44db8e474a49a8de7f5",
          "0x9bb913bd33fb626cd7888a7a24e9e2118919b1e5d95728540363245f1eb60942",
          "0x518b50dc10c4e593eac3af845be610e00f5aae1c7c12e6bcf95a337dfecb6dd3",
          "0x357fa364c11380ea72ef0b11b5ec468e4ee63712cecc1f8072e76fbc04492734"
      ]
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
