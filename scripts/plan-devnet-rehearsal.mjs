#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PublicKey } from '@solana/web3.js';
import { keccak256 } from '@ethersproject/keccak256';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXPECTED = Object.freeze({
  cluster: 'devnet',
  programId: 'AYE4iC2gp81H8jvMjk4EGxWP2sJFzuDptUwxqwTZYTMY',
  revision: 'cc8e6242e884e0f90a8ce0b9ff58f406240fc4a6',
  sha256: '0691c0eba729f07ab2be110112d0954d4051f198e5ef4d9e85f501fcd0126bf5',
  bytes: 411944,
  launchAuthority: '71WBrLfntE4yjTxEuQ3EgGJKE8zzZUgeEm5tkLi5Jx2r',
  coreProgram: 'CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d',
  treasury: 'FiHKQhwq2ZKkD2ZbBf3mPYgyw2Y9QDzNYykpMGErovU6',
  collectionUri: 'ar://oGxXHkoQKnsq47U4KESzurJ0-qk0dJa2FWofHQc_-SQ',
  royaltyBasisPoints: 500,
  publicMintPriceLamports: 1_000_000_000,
  clusterTagHash: '0x2dc5e5e2ec5ca5eba43c565499822cae24d566819ddb33aaf598c37a70a06828',
  fixtureSha256: Object.freeze({
    'nft-data/allocation-source/mint_list.csv': 'ea19c01acc366010dd825494674be07182acd47d3728924fefbb26a58e4379ef',
    'nft-data/allocation-source/reserve_list.csv': '8efd837bc74078b1e44ac9d4f23e8cb6ae9eae7ed241f477d0b5e851edf1a5b7',
    'nft-data/claims-v1.devnet.json': '42abed13414c2696e81f25383f70270d9d23c395c3966f22ece28cffce61c996',
    'nft-data/metadata-merkle-v1.devnet.json': '86cecd75fcb7d6ee398ab14f21c6e8153d9a4afecd6690ecf8290e5a62b01be9',
    'nft-data/uri-map.devnet.json': '54b313d1c536872ae85d025271f01bff21be3ef3ef75015014c511473dc881eb',
  }),
});

function fail(message) { throw new Error(message); }
function parsePublicKey(value, label) {
  try { return new PublicKey(value); } catch { fail(`${label} must be a valid base58 Solana public key.`); }
}
function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--plan') { values.plan = true; continue; }
    if (!['--collection-public-key', '--buyer-public-key', '--claimer-public-key'].includes(flag)) fail(`Unknown argument: ${flag}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) fail(`Missing value for ${flag}.`);
    values[flag.slice(2).replaceAll('-', '_')] = value;
    index += 1;
  }
  if (!values.plan) fail('Refusing: pass --plan for review-only output.');
  for (const field of ['collection_public_key', 'buyer_public_key', 'claimer_public_key']) if (!values[field]) fail(`Missing required --${field.replaceAll('_', '-')}.`);
  return values;
}
function hexBytes(value, label) {
  if (!/^0x[0-9a-f]{64}$/.test(value)) fail(`${label} must be a lowercase 32-byte hash.`);
  return Buffer.from(value.slice(2), 'hex');
}
function u16(value) { const result = Buffer.alloc(2); result.writeUInt16BE(value); return result; }
function fixture(relative) {
  const bytes = readFileSync(path.join(root, relative));
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (actual !== EXPECTED.fixtureSha256[relative]) fail(`Fixture SHA-256 mismatch: ${relative}`);
  return bytes.toString('utf8');
}
function configPda(programId) { return PublicKey.findProgramAddressSync([Buffer.from('config')], programId)[0]; }
function registryPda(programId) { return PublicKey.findProgramAddressSync([Buffer.from('allocation')], programId)[0]; }
function assetPda(programId, nftId) { return PublicKey.findProgramAddressSync([Buffer.from('asset'), u16(nftId)], programId)[0]; }
function allocationHash(program, collection, publicIds, claimRoot, metadataRoot) {
  const cluster = Buffer.from(EXPECTED.cluster, 'utf8');
  return keccak256(Buffer.concat([
    Buffer.from('CUMZILLARAPTORS_ALLOCATION_V1'), program.toBuffer(), Buffer.from([cluster.length]), cluster,
    collection.toBuffer(), u16(publicIds.length), ...publicIds.map(u16), hexBytes(claimRoot, 'claim root'), hexBytes(metadataRoot, 'metadata root'),
  ]));
}
function csvIds(relative, expectedCount) {
  const lines = fixture(relative).trim().split(/\r?\n/);
  if (lines.length !== expectedCount + 1) fail(`${relative} has an unexpected row count.`);
  const ids = lines.slice(1).map((line) => Number(line.split(',')[0]));
  if (ids.some((id) => !Number.isInteger(id) || id < 1 || id > 420) || new Set(ids).size !== ids.length) fail(`${relative} has invalid NFT IDs.`);
  return ids;
}
function canonicalData(collection) {
  const publicIds = csvIds('nft-data/allocation-source/mint_list.csv', 246);
  const claimIds = csvIds('nft-data/allocation-source/reserve_list.csv', 174);
  const claims = JSON.parse(fixture('nft-data/claims-v1.devnet.json'));
  const metadata = JSON.parse(fixture('nft-data/metadata-merkle-v1.devnet.json'));
  const uriMap = JSON.parse(fixture('nft-data/uri-map.devnet.json'));
  if (claims.version !== 'CUMZILLARAPTORS_CLAIM_V1' || claims.cluster !== EXPECTED.cluster || claims.programId !== EXPECTED.programId || claims.claims.length !== 174) fail('Canonical claim fixture mismatch.');
  if (metadata.version !== 'CUMZILLARAPTORS_METADATA_V1' || metadata.cluster !== EXPECTED.cluster || metadata.programId !== EXPECTED.programId || metadata.totalMetadata !== 420) fail('Canonical metadata fixture mismatch.');
  const allIds = [...publicIds, ...claimIds].sort((left, right) => left - right);
  if (allIds.length !== 420 || allIds.some((id, index) => id !== index + 1)) fail('Canonical allocation partition is not an exact disjoint cover of IDs 1 through 420.');
  if (!publicIds.includes(2) || claimIds.includes(2) || !claimIds.includes(1) || publicIds.includes(1)) fail('Controlled rehearsal IDs do not match the canonical allocation partition.');
  const publicMetadata = metadata.metadata['2'];
  const claimMetadata = metadata.metadata['1'];
  const claim = claims.claims.find((item) => item.nftId === 1);
  if (uriMap.version !== 'CUMZILLARAPTORS_URI_MAP_V1' || uriMap.cluster !== EXPECTED.cluster || uriMap.programId !== EXPECTED.programId || !/^ar:\/\/[A-Za-z0-9_-]{43}$/.test(uriMap.collectionUri)) fail('Canonical URI map mismatch.');
  if (!publicMetadata || !claimMetadata || !claim) fail('Controlled rehearsal fixture is missing.');
  return { publicIds, claimIds, claims, metadata, uriMap, publicMetadata, claimMetadata, claim, allocationHash: allocationHash(new PublicKey(EXPECTED.programId), collection, publicIds, claims.merkleRoot, metadata.merkleRoot) };
}
function plan(args) {
  const collection = parsePublicKey(args.collection_public_key, 'Collection');
  const buyer = parsePublicKey(args.buyer_public_key, 'Buyer');
  const claimer = parsePublicKey(args.claimer_public_key, 'Claimer');
  if (buyer.equals(claimer)) fail('Buyer and claimer must be separate public keys for the bounded rehearsal.');
  const program = new PublicKey(EXPECTED.programId);
  const data = canonicalData(collection);
  const config = configPda(program);
  const registry = registryPda(program);
  return {
    mode: 'REVIEW-ONLY DEVNET REHEARSAL PLAN',
    guarantee: 'No transaction will be constructed, signed, or sent.',
    artifact: { programId: EXPECTED.programId, revision: EXPECTED.revision, sha256: EXPECTED.sha256, bytes: EXPECTED.bytes },
    identities: { launchAuthority: EXPECTED.launchAuthority, payer: 'C7EpDNWshjtRf1tERwotFP2iAEbApBhQKJz4usYUPU9N', collection: collection.toBase58(), buyer: buyer.toBase58(), claimer: claimer.toBase58(), configPda: config.toBase58(), registryPda: registry.toBase58() },
    collection: { coreProgram: EXPECTED.coreProgram, name: 'cumzillaraptors', uriFromProgram: EXPECTED.collectionUri, uriFromUriMap: data.uriMap.collectionUri, updateAuthority: config.toBase58(), royaltyRecipient: EXPECTED.treasury, royaltyBasisPoints: EXPECTED.royaltyBasisPoints },
    allocation: {
      publicCount: data.publicIds.length, claimCount: data.claimIds.length, claimRoot: data.claims.merkleRoot, metadataRoot: data.metadata.merkleRoot,
      clusterTagHash: EXPECTED.clusterTagHash, allocationHash: data.allocationHash,
      publicMint: { nftId: 2, name: data.publicMetadata.name, uri: data.publicMetadata.uri, metadataProofLength: data.publicMetadata.proof.length, assetPda: assetPda(program, 2).toBase58(), priceLamports: EXPECTED.publicMintPriceLamports },
      claim: { nftId: 1, ethAddress: data.claim.ethAddress, name: data.claimMetadata.name, uri: data.claimMetadata.uri, claimProofLength: data.claim.proof.length, metadataProofLength: data.claimMetadata.proof.length, assetPda: assetPda(program, 1).toBase58(), authorization: 'PENDING_EXTERNAL_ETH_SIGNATURE' },
    },
    steps: [
      { id: 'deploy-program', signerRoles: ['payer', 'program-keypair', 'upgrade-authority'], stateEffect: 'create program and program-data accounts only' },
      { id: 'initialize-launch', signerRoles: ['launch-authority'], stateEffect: 'create immutable config PDA' },
      { id: 'initialize-allocation-registry', signerRoles: ['launch-authority'], stateEffect: 'create immutable allocation registry PDA' },
      { id: 'setup-collection', signerRoles: ['launch-authority', 'fresh collection keypair'], stateEffect: 'create canonical Core collection' },
      { id: 'verify-collection', signerRoles: [], stateEffect: 'read-only Core owner/authority/URI/royalty verification' },
      { id: 'enable-sale', signerRoles: ['launch-authority'], stateEffect: 'Setup to Live' },
      { id: 'controlled-public-mint', signerRoles: ['buyer'], stateEffect: 'buyer pays exactly 1 SOL to fixed treasury; create asset #2' },
      { id: 'controlled-eth-claim', signerRoles: ['claimer', 'external Ethereum holder for claim #1'], stateEffect: 'create asset #1 and claim receipt after a valid external signature' },
      { id: 'verify-rehearsal-state', signerRoles: [], stateEffect: 'read-only counters, allocation, ownership, receipt, and fee evidence' },
    ],
    blockingFindings: EXPECTED.collectionUri === data.uriMap.collectionUri ? [] : ['BLOCKED_CANONICAL_URI_MISMATCH'],
    approvalBoundary: 'A separate reviewed live mechanism must display exact account metas, serialized-message digests, current fee estimates, and a user-approved Devnet SOL cap before any signer is accessed. No execution is approvable while blockingFindings is non-empty.',
  };
}

try { console.log(`${JSON.stringify(plan(parseArgs(process.argv.slice(2))), null, 2)}\n`); } catch (error) { console.error(`REHEARSAL PLAN ERROR: ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; }

export { EXPECTED, parseArgs, plan };
