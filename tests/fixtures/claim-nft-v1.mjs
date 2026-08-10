import { keccak256 } from '@ethersproject/keccak256';
import { PublicKey } from '@solana/web3.js';

const PROGRAM_ID = 'AYE4iC2gp81H8jvMjk4EGxwP2sJFzuDptUwxqwTZYTMY';
const CLUSTER = 'devnet';
const CLAIM_ROOT = '0x6b98744c71cba27ec2391b2c4cc79fc835b0c325faca0ff40dea6326e3b238fb';
const METADATA_ROOT = '0x585606c4396358e047f8702d856548587eb0a18bc38be1076b0e4ea7f15ac019';

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
    nonceHex: '0x9dfb1ccf9dc96516329c3d36ee912fd1c378525430f613faee69ba6f3d1c0fee',
    leaf: '0x5e80971023100b55fc21f486645f651a9824c36ba340121560edaf35e3174055',
    proof: ['0x676f3abe7af1cf01ca49804ea1f7f1642e67dfce7a6e38bf5a768a9f44b10c06', '0xe64f5680f77d08ee676fb33bb4dd169eb6ab419d629d0c7d5695ac797e4ea3bf', '0x7a8d8068c4010f30679ea021c150a32943cf560e5b6e02b25b90c33d5c575133', '0x6c3bdaadd1d4a5b47d6b71624996b513919645435af5288baa3184cb8c59486a', '0xcdce882ae59dbbe4a64aba53cbcba52089c26169fc812ca09bbf5a0f930879f8', '0x9694ae33459b7714de9f746bc09177c402c9ba06025301bbbddddc4ec9d66536', '0xd79a17ff878d9663237c6211eaac9a40101d67b5b1b366fd8cac75de5730a03f'],
  },
  metadata: {
    nftId: 360,
    name: 'cumzillaraptor #360',
    uri: 'ar://z-1hTTF1-FK80VkPw6yiO_d1y2_qdZ4Cjm37y-eW-cI',
    leaf: '0x7cab82d1b27a5d744969718a08f4f153525e7f0a121407b14987650c719959f2',
    proof: ['0x3e2b9fe00447a54b93362e48752aca2ea277f0fff366d904c0f17da1f661ce93', '0xe16818e3bdaa2dde03fa71e810f8b4c3a444492dab2315f0344da4bfd07051ea', '0x877ea75cf0a9e29b271a52b0101d8e42b2b48d88da447a5e15d112ae22268ed4', '0x35457a2b9cff2575ab2b3a65da4087871d87732dc23128392ecbf6d973de8ee8', '0x3f54403fa5be5645029f6eb0a65bbdb276cb79b5c17ba1b736e5185e46ff6826', '0x2fec8fc162f5df7a5ab2204c14586cdd523a8cf0a43a4adf8963672bde2bfafa', '0x2c4f2665df2b70910cec16f09c8136bde9f71c5014fe1650421f10264dc429b5', '0x63d06e21b4bf115576ebae38b967bcde64c4b6ff6901cbb31edb31cd02aa35f0', '0xab0ca64eb9b4387c1af3c5ebb7f7dfacad0c9fada48d082d69f109bb1956a5c1'],
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
