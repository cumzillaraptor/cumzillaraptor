import { randomBytes } from 'node:crypto';

import { keccak256 } from '@ethersproject/keccak256';
import { SigningKey } from '@ethersproject/signing-key';
import { PublicKey } from '@solana/web3.js';

import { V1_CLAIM_FIXTURE, claimAuthorizationFor, claimLeaf } from './claim-nft-v1.mjs';

// This fixture is intentionally runtime-only. It creates a fresh test Ethereum
// key for a single-leaf local launch root; it MUST NOT be used to validate the
// reviewed production claim root or any production claimant.
export const LOCAL_EPHEMERAL_CLAIM_ROOT_ENV = 'CUMZ_LOCAL_EPHEMERAL_CLAIM_ROOT';

function privateKey() {
  // `SigningKey` rejects invalid secp256k1 scalars. Retrying cannot leak a key:
  // the value lives only in this test process and is never serialized or logged.
  for (;;) {
    const candidate = randomBytes(32);
    try {
      new SigningKey(`0x${candidate.toString('hex')}`);
      return candidate;
    } catch {
      // An invalid scalar is cryptographically negligible, but must never be used.
    }
  }
}

function ethAddressFor(privateKeyBytes) {
  const publicKey = new SigningKey(`0x${Buffer.from(privateKeyBytes).toString('hex')}`).publicKey;
  // SigningKey.publicKey is an uncompressed 65-byte hex (0x04||X||Y); the ETH
  // address is keccak256(X||Y) truncated to the last 20 bytes.
  const xy = Buffer.from(publicKey.slice(4), 'hex');
  return `0x${keccak256(xy).slice(-40)}`;
}

// Produce a canonical 65-byte secp256k1 signature (r||s||v) over a 32-byte
// digest. v is 27/28 (EIP-191), matching what the in-program secp256k1_recover
// normalizes to recovery id 0/1.
function signDigest(signingKey, digestHex) {
  const sig = signingKey.signDigest(digestHex);
  const r = Buffer.from(sig.r.slice(2).padStart(64, '0'), 'hex');
  const s = Buffer.from(sig.s.slice(2).padStart(64, '0'), 'hex');
  const v = 27 + sig.recoveryParam;
  return `0x${Buffer.concat([r, s, Buffer.from([v])]).toString('hex')}`;
}

export function requireLocalEphemeralClaimRootGuard() {
  if (process.env[LOCAL_EPHEMERAL_CLAIM_ROOT_ENV] !== '1') {
    throw new Error(`${LOCAL_EPHEMERAL_CLAIM_ROOT_ENV}=1 is required: local ephemeral roots are never production validation`);
  }
}

export function createLocalEphemeralClaimFixture({ claimant, expiryUnix, nftId = V1_CLAIM_FIXTURE.claim.nftId }) {
  requireLocalEphemeralClaimRootGuard();
  const signingKey = privateKey();
  const ethAddress = ethAddressFor(signingKey);
  const claim = {
    nftId,
    ethAddress,
    // A local-only root is not a production artifact; use fresh entropy for the
    // leaf nonce too, so no reviewed claimant authorization is represented.
    nonceHex: `0x${randomBytes(32).toString('hex')}`,
  };
  const leaf = claimLeaf({
    programId: V1_CLAIM_FIXTURE.programId,
    cluster: V1_CLAIM_FIXTURE.cluster,
    claim,
  });
  const authorization = claimAuthorizationFor({
    ...V1_CLAIM_FIXTURE,
    claim,
  }, claimant, expiryUnix);
  const local = {
    kind: 'LOCAL_EPHEMERAL_TEST_ROOT_ONLY',
    programId: V1_CLAIM_FIXTURE.programId,
    cluster: V1_CLAIM_FIXTURE.cluster,
    // A one-leaf sorted Merkle tree's root is the leaf and its proof is empty.
    claimRoot: leaf,
    claim: { ...claim, leaf, proof: [] },
    // Metadata must remain the immutable reviewed V1 metadata commitment.
    metadataRoot: V1_CLAIM_FIXTURE.metadataRoot,
    metadata: V1_CLAIM_FIXTURE.metadata,
    authorization,
  };
  return {
    ...local,
    // The in-program claim verifier recovers the signer from this 65-byte
    // signature over the EIP-191 message hash (keccak of the preimage).
    signature: signDigest(signingKey, authorization.messageHash),
    // Retained for compatibility with assertions that inspect the fixture shape.
    signingKeyPublicEthAddress: ethAddress,
  };
}

export function localAllocationHash({ collection, claimRoot, metadataRoot, publicIds }) {
  const ids = Buffer.concat(publicIds.map((id) => Buffer.from([id >> 8, id & 0xff])));
  return keccak256(Buffer.concat([
    Buffer.from('CUMZILLARAPTORS_ALLOCATION_V1'),
    new PublicKey(V1_CLAIM_FIXTURE.programId).toBuffer(),
    Buffer.from([Buffer.byteLength(V1_CLAIM_FIXTURE.cluster)]),
    Buffer.from(V1_CLAIM_FIXTURE.cluster),
    new PublicKey(collection).toBuffer(),
    Buffer.from([0, publicIds.length]),
    ids,
    Buffer.from(claimRoot.slice(2), 'hex'),
    Buffer.from(metadataRoot.slice(2), 'hex'),
  ]));
}
