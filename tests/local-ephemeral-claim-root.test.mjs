import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { keccak256 } from '@ethersproject/keccak256';
import path from 'node:path';

import {
  LOCAL_EPHEMERAL_CLAIM_ROOT_ENV,
  createLocalEphemeralClaimFixture,
  createLocalEphemeralBatchFixture,
  localAllocationHash,
  requireLocalEphemeralClaimRootGuard,
} from './fixtures/local-ephemeral-claim-root.mjs';
import { V1_CLAIM_FIXTURE } from './fixtures/claim-nft-v1.mjs';

const validatorUrl = process.env.CORE_CLAIM_VALIDATOR_URL;
const outputDir = process.env.SBF_OUT_DIR || '';
const programPath = path.join(outputDir, 'cumzillaraptors.test-validation.so');
const authorityJson = process.env.CUMZ_TEST_VALIDATION_AUTHORITY_KEYPAIR_JSON;
const expectedRevision = process.env.CUMZ_EXPECTED_BUILD_REVISION;
const enabled = process.env[LOCAL_EPHEMERAL_CLAIM_ROOT_ENV] === '1';
const canRun = enabled
  && process.arch === 'x64'
  && process.platform === 'linux'
  && Boolean(validatorUrl)
  && existsSync(programPath)
  && Boolean(authorityJson)
  && Boolean(expectedRevision);

const PROGRAM_ID_TEXT = 'AYE4iC2gp81H8jvMjk4EGxWP2sJFzuDptUwxqwTZYTMY';
const CORE_PROGRAM_TEXT = 'CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d';

const METADATA_ROOT = '689ab71d32efff276df2a0e14f72ee9eb159da3508cfe9d337a9fcc3c2220211';

function discriminator(name) {
  return createHash('sha256').update(`global:${name}`).digest().subarray(0, 8);
}
function u16(value) { const b = Buffer.alloc(2); b.writeUInt16LE(value); return b; }
function u32(value) { const b = Buffer.alloc(4); b.writeUInt32LE(value); return b; }
function u64(value) { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(value)); return b; }
function bytes32(hex) { return Buffer.from(hex.replace(/^0x/, ''), 'hex'); }
function vectorU16(ids) { return Buffer.concat([u32(ids.length), ...ids.map(u16)]); }
function vectorBytes32(items) { return Buffer.concat([u32(items.length), ...items.map(bytes32)]); }
function string(value) { const b = Buffer.from(value); return Buffer.concat([u32(b.length), b]); }
function localUrl(url) {
  const host = new URL(url).hostname;
  return host === '127.0.0.1' || host === 'localhost' || host === '::1';
}
function hashPair(left, right) {
  return keccak256(Buffer.compare(bytes32(left), bytes32(right)) <= 0
    ? Buffer.concat([bytes32(left), bytes32(right)])
    : Buffer.concat([bytes32(right), bytes32(left)]));
}
function localMerkleProofs(leaves) {
  let level = leaves;
  const proofs = leaves.map(() => []);
  const positions = leaves.map((_, index) => index);
  while (level.length > 1) {
    for (let leaf = 0; leaf < leaves.length; leaf += 1) {
      const index = positions[leaf];
      const sibling = index ^ 1;
      if (sibling < level.length) proofs[leaf].push(level[sibling]);
      positions[leaf] = Math.floor(index / 2);
    }
    const next = [];
    for (let index = 0; index < level.length; index += 2) {
      next.push(index + 1 < level.length ? hashPair(level[index], level[index + 1]) : level[index]);
    }
    level = next;
  }
  return { root: level[0], proofs };
}
function accountFingerprint(account) {
  return account && {
    owner: account.owner.toBase58(), lamports: account.lamports, data: Buffer.from(account.data).toString('hex'),
  };
}

function initializeLaunchData({ treasury, coreProgram, collection, allocationHash, claimRoot }) {
  return Buffer.concat([
    discriminator('initialize_launch'), treasury.toBuffer(), coreProgram.toBuffer(), collection.toBuffer(),
    bytes32(allocationHash), bytes32(claimRoot), Buffer.from(METADATA_ROOT, 'hex'),
    bytes32('0x2dc5e5e2ec5ca5eba43c565499822cae24d566819ddb33aaf598c37a70a06828'),
    u16(246), u16(174),
  ]);
}
function initializeRegistryData(publicIds, claimIds) {
  return Buffer.concat([discriminator('initialize_allocation_registry'), vectorU16(publicIds), vectorU16(claimIds)]);
}
function claimData(local, expiryUnix) {
  return Buffer.concat([
    discriminator('claim_nft'), u16(local.claim.nftId), bytes32(`0x${local.claim.ethAddress.slice(2).padStart(64, '0')}`).subarray(12),
    bytes32(local.claim.nonceHex), u64(expiryUnix), vectorBytes32(local.claim.proof),
    string(local.metadata.name), string(local.metadata.uri), vectorBytes32(local.metadata.proof),
    Buffer.from(local.signature.slice(2), 'hex'), // r‖s‖v 65-byte signature arg
  ]);
}
function claimBatchData(batch, nftId, proof, expiryUnix) {
  const member = batch.claims.find((claim) => claim.nftId === nftId);
  return Buffer.concat([
    discriminator('claim_nft_batch'),
    vectorU16(batch.nftIds),
    u16(nftId),
    Buffer.from(batch.ethAddress.slice(2), 'hex'),
    bytes32(member.nonceHex), // per-id deterministic nonce, bound by the leaf
    u64(expiryUnix),
    vectorBytes32(proof),
    string(batch.metadata.name), string(batch.metadata.uri), vectorBytes32(batch.metadata.proof),
    Buffer.from(batch.signature.slice(2), 'hex'), // r‖s‖v batch signature arg
  ]);
}
function mintData(nftId, metadata) {
  return Buffer.concat([
    discriminator('mint_nft'), u16(nftId),
    string(metadata.name), string(metadata.uri), vectorBytes32(metadata.proof),
  ]);
}
async function submit(connection, web3, transaction, signers) {
  transaction.feePayer = signers[0].publicKey;
  transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  transaction.sign(...signers);
  const signature = await connection.sendRawTransaction(transaction.serialize(), { skipPreflight: false });
  await connection.confirmTransaction(signature, 'confirmed');
  return signature;
}

async function createAndActivateClaimLookupTable(connection, web3, authority, addresses) {
  // web3.js does not export SYSVAR_SLOT_HASHES_PUBKEY in every supported release.
  // Parse the canonical sysvar address locally so the ALT slot comes from the
  // validator's actual SlotHashes account, rather than an RPC slot estimate.
  const slotHashesAddress = new web3.PublicKey('SysvarS1otHashes111111111111111111111111111');
  const slotHashes = await connection.getAccountInfo(slotHashesAddress, 'processed');
  assert.ok(slotHashes && slotHashes.data.length >= 16, 'private validator must expose SlotHashes for ALT creation');
  const slotHashesLength = Number(slotHashes.data.readBigUInt64LE(0));
  assert.ok(slotHashesLength > 0, 'private validator SlotHashes must contain a recent slot');
  const recentSlot = Number(slotHashes.data.readBigUInt64LE(8));
  assert.ok(Number.isSafeInteger(recentSlot), 'ALT recent slot must be precisely representable');
  const [createLookupTable, lookupTableAddress] = web3.AddressLookupTableProgram.createLookupTable({
    authority: authority.publicKey,
    payer: authority.publicKey,
    recentSlot,
  });
  await submit(connection, web3, new web3.Transaction().add(createLookupTable), [authority]);
  await submit(connection, web3, new web3.Transaction().add(web3.AddressLookupTableProgram.extendLookupTable({
    lookupTable: lookupTableAddress,
    authority: authority.publicKey,
    payer: authority.publicKey,
    addresses,
  })), [authority]);

  // ALT extensions are not usable in the slot in which they land. Wait for the
  // private validator to advance, rather than relying on a timing assumption.
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const lookup = await connection.getAddressLookupTable(lookupTableAddress, 'confirmed');
    if (lookup.value && lookup.value.state.addresses.length === addresses.length
      && BigInt(await connection.getSlot('processed')) > BigInt(lookup.value.state.lastExtendedSlot)) {
      return lookup.value;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('local Address Lookup Table did not activate');
}

async function submitClaimV0(connection, web3, transaction, signers, lookupTable) {
  const latestBlockhash = await connection.getLatestBlockhash('confirmed');
  const message = new web3.TransactionMessage({
    payerKey: signers[0].publicKey,
    recentBlockhash: latestBlockhash.blockhash,
    instructions: transaction.instructions,
  }).compileToV0Message([lookupTable]);
  const versioned = new web3.VersionedTransaction(message);
  versioned.sign(signers);
  const serialized = versioned.serialize();
  assert.ok(serialized.length <= 1232, `v0 authentic claim transaction must fit the packet limit; got ${serialized.length}`);
  const signature = await connection.sendRawTransaction(serialized, { skipPreflight: false });
  await connection.confirmTransaction({ ...latestBlockhash, signature }, 'confirmed');
  return { signature, serializedLength: serialized.length, message };
}

test('local ephemeral fixture is explicitly opt-in and cannot be mistaken for committed-root validation', () => {
  if (enabled) return;
  assert.throws(requireLocalEphemeralClaimRootGuard, new RegExp(LOCAL_EPHEMERAL_CLAIM_ROOT_ENV));
});

test('explicit local fixture signs its runtime leaf with an in-program 65-byte signature', { skip: !enabled }, () => {
  const local = createLocalEphemeralClaimFixture({
    claimant: '8gUvnRYEcUMHwkt4WwWckMFCC9KUN1m47TgzttXR7TVg',
    expiryUnix: 2_000_000_000,
  });
  assert.equal(local.signature.length, 132, 'signature is 65 bytes (r‖s‖v) as 0x hex');
  const v = Number.parseInt(local.signature.slice(130), 16);
  assert.ok(v === 27 || v === 28, `EIP-191 recovery id v is 27/28, got ${v}`);
  assert.equal(local.claimRoot, local.claim.leaf, 'single-leaf local tree has an empty proof');
  assert.deepEqual(local.claim.proof, []);
  assert.equal(local.metadataRoot, V1_CLAIM_FIXTURE.metadataRoot);
  assert.notEqual(local.claim.ethAddress, V1_CLAIM_FIXTURE.claim.ethAddress);
  assert.match(local.authorization.message, new RegExp(`eth_address: ${local.claim.ethAddress}`));
  assert.match(local.authorization.message, new RegExp(`nonce: ${local.claim.nonceHex}`));
  assert.equal(
    local.authorization.messageHash,
    keccak256(local.authorization.preimage),
    'message hash is keccak256 of the EIP-191 preimage',
  );
});

test('x86 local validator: authentic secp claim uses an ephemeral local root and immutable production metadata root', { skip: !canRun }, async () => {
  assert.ok(localUrl(validatorUrl), 'test may only connect to a loopback validator');
  const [{ AddressLookupTableProgram, Connection, Keypair, PublicKey, SystemProgram, SYSVAR_INSTRUCTIONS_PUBKEY, Transaction, TransactionInstruction, TransactionMessage, VersionedTransaction }, revision] = await Promise.all([
    import('@solana/web3.js'),
    import('node:fs/promises').then(({ readFile }) => readFile(path.join(outputDir, 'cumzillaraptors.test-validation.build-revision'), 'utf8')),
  ]);
  assert.equal(revision.trim(), expectedRevision, 'only the fresh SBPF artifact may be tested');
  const connection = new Connection(validatorUrl, 'confirmed');
  const programId = new PublicKey(PROGRAM_ID_TEXT);
  const coreProgram = new PublicKey(CORE_PROGRAM_TEXT);
  const authority = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(authorityJson)));
  const claimer = Keypair.generate();
  const collection = Keypair.generate();
  const treasury = Keypair.generate().publicKey;
  for (const recipient of [authority.publicKey, claimer.publicKey]) {
    const airdrop = await connection.requestAirdrop(recipient, 10_000_000_000);
    await connection.confirmTransaction(airdrop, 'confirmed');
  }

  const expiryUnix = Math.floor(Date.now() / 1000) + 300;
  // Every authorization below is generated at runtime. The three leaves let the same
  // isolated launch exercise a claimable ID, a public-pool ID, and a second receipt PDA
  // without ever constructing or signing a production authorization.
  const claim360 = createLocalEphemeralClaimFixture({ claimant: claimer.publicKey.toBase58(), expiryUnix });
  const receipt360 = createLocalEphemeralClaimFixture({ claimant: claimer.publicKey.toBase58(), expiryUnix });
  const public1 = createLocalEphemeralClaimFixture({ claimant: claimer.publicKey.toBase58(), expiryUnix, nftId: 1 });
  // A two-id ONE-signature batch authorization shares this launch: its members'
  // leaves join the same Merkle tree as ordinary claim-pool leaves.
  const batch = createLocalEphemeralBatchFixture({
    claimant: claimer.publicKey.toBase58(), expiryUnix, nftIds: [248, 250],
  });
  const tree = localMerkleProofs([
    claim360.claim.leaf, receipt360.claim.leaf, public1.claim.leaf,
    ...batch.claims.map((c) => c.leaf),
  ]);
  const bindLocalProof = (fixture, proof) => ({
    ...fixture,
    claimRoot: tree.root,
    // The claim leaf and EIP-191 authorization bind different facts. The
    // validated on-chain claim root is bound by the proof; retain this local
    // fixture's original recipient/nft/ETH/nonce/expiry authorization.
    claim: { ...fixture.claim, proof },
  });
  const local = bindLocalProof(claim360, tree.proofs[0]);
  const replayLocal = bindLocalProof(receipt360, tree.proofs[1]);
  const publicLocal = bindLocalProof(public1, tree.proofs[2]);
  const batchMember = (id) => {
    const index = batch.nftIds.indexOf(id);
    if (index < 0) throw new Error(id + ' not in batch');
    return { claim: batch.claims[index], proof: tree.proofs[3 + index] };
  };
  assert.equal(local.kind, 'LOCAL_EPHEMERAL_TEST_ROOT_ONLY');
  assert.notEqual(local.claimRoot, V1_CLAIM_FIXTURE.claimRoot, 'never use the local root as a production-root assertion');
  assert.equal(local.metadataRoot, V1_CLAIM_FIXTURE.metadataRoot, 'metadata root remains the immutable production commitment');
  assert.deepEqual(local.metadata.proof, V1_CLAIM_FIXTURE.metadata.proof, 'claim uses the reviewed metadata proof verbatim');

  const publicIds = [...Array(245).keys()].map((i) => i + 1).concat(247);
  const claimIds = [...Array(420).keys()].map((i) => i + 1).filter((id) => !publicIds.includes(id));
  const allocationHash = localAllocationHash({ collection: collection.publicKey, claimRoot: local.claimRoot, metadataRoot: local.metadataRoot, publicIds });
  const [config] = PublicKey.findProgramAddressSync([Buffer.from('config')], programId);
  const [registry] = PublicKey.findProgramAddressSync([Buffer.from('allocation')], programId);
  const claimAccounts = (fixture) => {
    const [asset] = PublicKey.findProgramAddressSync([Buffer.from('asset'), Buffer.from([fixture.claim.nftId >> 8, fixture.claim.nftId & 0xff])], programId);
    const [receipt, receiptBump] = PublicKey.findProgramAddressSync([Buffer.from('claim'), bytes32(fixture.claim.leaf)], programId);
    return { asset, receipt, receiptBump };
  };
  const { asset, receipt, receiptBump } = claimAccounts(local);
  const replayAccounts = claimAccounts(replayLocal);
  const publicAccounts = claimAccounts(publicLocal);

  await submit(connection, { Transaction, TransactionInstruction }, new Transaction().add(new TransactionInstruction({
    programId,
    keys: [{ pubkey: config, isSigner: false, isWritable: true }, { pubkey: authority.publicKey, isSigner: true, isWritable: true }, { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }],
    data: initializeLaunchData({ treasury, coreProgram, collection: collection.publicKey, allocationHash, claimRoot: local.claimRoot }),
  })), [authority]);
  await submit(connection, { Transaction, TransactionInstruction }, new Transaction().add(new TransactionInstruction({
    programId,
    keys: [{ pubkey: config, isSigner: false, isWritable: false }, { pubkey: registry, isSigner: false, isWritable: true }, { pubkey: authority.publicKey, isSigner: true, isWritable: true }, { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }],
    data: initializeRegistryData(publicIds, claimIds),
  })), [authority]);
  await submit(connection, { Transaction, TransactionInstruction }, new Transaction().add(new TransactionInstruction({
    programId,
    keys: [{ pubkey: config, isSigner: false, isWritable: false }, { pubkey: collection.publicKey, isSigner: true, isWritable: true }, { pubkey: authority.publicKey, isSigner: true, isWritable: true }, { pubkey: coreProgram, isSigner: false, isWritable: false }, { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }],
    data: discriminator('setup_collection'),
  })), [authority, collection]);
  await submit(connection, { Transaction, TransactionInstruction }, new Transaction().add(new TransactionInstruction({
    programId,
    keys: [{ pubkey: config, isSigner: false, isWritable: true }, { pubkey: authority.publicKey, isSigner: true, isWritable: false }],
    data: Buffer.concat([discriminator('set_claims_sale_state'), Buffer.from([2])]),
  })), [authority]);

  const publicMetadata = JSON.parse(await (await import('node:fs/promises')).readFile(
    new URL('../nft-data/metadata-merkle-v1.devnet.json', import.meta.url),
    'utf8',
  )).metadata['1'];
  const [publicAsset] = PublicKey.findProgramAddressSync(
    [Buffer.from('asset'), Buffer.from([0, 1])], programId,
  );
  const mintIx = ({ treasuryAccount = treasury, collectionAccount = collection.publicKey } = {}) => new TransactionInstruction({
    programId,
    keys: [
      { pubkey: config, isSigner: false, isWritable: true },
      { pubkey: registry, isSigner: false, isWritable: true },
      { pubkey: claimer.publicKey, isSigner: true, isWritable: true },
      { pubkey: treasuryAccount, isSigner: false, isWritable: true },
      { pubkey: collectionAccount, isSigner: false, isWritable: true },
      { pubkey: publicAsset, isSigner: false, isWritable: true },
      { pubkey: coreProgram, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: mintData(1, publicMetadata),
  });
  const publicMintState = async () => {
    const [configAccount, registryAccount, assetAccount] = await Promise.all([
      connection.getAccountInfo(config), connection.getAccountInfo(registry), connection.getAccountInfo(publicAsset),
    ]);
    const registryBytes = Buffer.from(registryAccount.data);
    return {
      treasury: await connection.getBalance(treasury),
      buyer: await connection.getBalance(claimer.publicKey),
      publicMinted: Buffer.from(configAccount.data).readUInt16LE(265),
      allocated: registryBytes[8 + 32 + (246 * 2)] & 1,
      asset: accountFingerprint(assetAccount),
    };
  };
  // The immutable treasury cannot be substituted: this rejection occurs before payment,
  // Core CPI, allocation, or public counter mutation.
  const mintBeforeSubstitution = await publicMintState();
  await assert.rejects(submit(connection, { Transaction, TransactionInstruction }, new Transaction().add(
    mintIx({ treasuryAccount: authority.publicKey }),
  ), [claimer]));
  assert.deepEqual(await publicMintState(), mintBeforeSubstitution, 'treasury substitution has no public-mint state effect');

  // Execute the actual paid public mint through the real Core CreateV1 CPI.
  const mintBefore = await publicMintState();
  await submit(connection, { Transaction, TransactionInstruction }, new Transaction().add(mintIx()), [claimer]);
  const mintAfter = await publicMintState();
  assert.equal(mintAfter.treasury - mintBefore.treasury, 1_000_000_000, 'immutable treasury receives exactly 1 SOL');
  assert.ok(mintBefore.buyer - mintAfter.buyer > 1_000_000_000, 'buyer pays 1 SOL plus transaction/Core rent costs');
  assert.equal(mintAfter.publicMinted, 1, 'public counter increments after Core success');
  assert.equal(mintAfter.allocated, 1, 'public ID is allocated after Core success');
  assert.equal(mintAfter.asset.owner, CORE_PROGRAM_TEXT, 'paid public mint creates a Core asset');
  const { deserializeAssetV1: deserializePublicAssetV1 } = await import('@metaplex-foundation/mpl-core');
  const decodedPublicAsset = deserializePublicAssetV1({
    publicKey: publicAsset.toBase58(), data: Uint8Array.from((await connection.getAccountInfo(publicAsset)).data),
    executable: false, lamports: (await connection.getAccountInfo(publicAsset)).lamports,
    owner: CORE_PROGRAM_TEXT, rentEpoch: 0,
  });
  assert.equal(decodedPublicAsset.owner, claimer.publicKey.toBase58(), 'paid public asset owner is buyer');
  assert.equal(decodedPublicAsset.updateAuthority.address, collection.publicKey.toBase58(), 'public asset authority derives from collection');

  const claimIx = (fixture = local, { recipient = claimer, expiry = expiryUnix } = {}) => {
    const accounts = claimAccounts(fixture);
    return new TransactionInstruction({
      programId,
      keys: [
        { pubkey: config, isSigner: false, isWritable: true }, { pubkey: registry, isSigner: false, isWritable: true },
        { pubkey: recipient.publicKey, isSigner: true, isWritable: true }, { pubkey: collection.publicKey, isSigner: false, isWritable: true },
        { pubkey: accounts.asset, isSigner: false, isWritable: true }, { pubkey: accounts.receipt, isSigner: false, isWritable: true },
        { pubkey: coreProgram, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: claimData(fixture, expiry),
    });
  };
  // The authentic claim embeds the 65-byte secp signature directly in claim_nft
  // data and verifies it in-program over the 32-byte EIP-191 message hash. This
  // drops the 343-byte preimage from the transaction, so the full 7/8-proof
  // production claim fits the 1232-byte packet ceiling as a legacy transaction.
  const claimWeb3 = {
    AddressLookupTableProgram, PublicKey, Transaction, TransactionMessage, VersionedTransaction,
  };
  const claimLookupTable = await createAndActivateClaimLookupTable(connection, claimWeb3, authority, [
    config, registry, collection.publicKey,
    asset, receipt, replayAccounts.asset, replayAccounts.receipt, publicAccounts.asset, publicAccounts.receipt,
    coreProgram, SystemProgram.programId,
  ]);
  const submitClaim = (transaction, signers) => submitClaimV0(
    connection, claimWeb3, transaction, signers, claimLookupTable,
  );
  const claimState = async (fixture = local) => {
    const accounts = claimAccounts(fixture);
    const [configAccount, registryAccount, assetAccount, receiptAccount] = await Promise.all([
      connection.getAccountInfo(config), connection.getAccountInfo(registry),
      connection.getAccountInfo(accounts.asset), connection.getAccountInfo(accounts.receipt),
    ]);
    const bitmap = Buffer.from(registryAccount.data);
    const allocationByte = 8 + 32 + (246 * 2) + Math.floor((fixture.claim.nftId - 1) / 8);
    return {
      asset: accountFingerprint(assetAccount), receipt: accountFingerprint(receiptAccount),
      claimsMinted: Buffer.from(configAccount.data).readUInt16LE(267),
      allocated: bitmap[allocationByte] & (1 << ((fixture.claim.nftId - 1) % 8)),
    };
  };
  const assertNoDurableClaimState = async (reason, fixture = local, before) => {
    const expected = before ?? await claimState(fixture);
    assert.deepEqual(await claimState(fixture), expected, `${reason}: asset, receipt, allocation, and claim counter must be unchanged`);
  };
  const rejectWithoutStateChange = async (reason, transaction, signers, fixture = local) => {
    const before = await claimState(fixture);
    await assert.rejects(submitClaim(transaction, signers), reason);
    await assertNoDurableClaimState(reason, fixture, before);
  };

  const substitute = Keypair.generate();
  const substituteAirdrop = await connection.requestAirdrop(substitute.publicKey, 1_000_000_000);
  await connection.confirmTransaction(substituteAirdrop, 'confirmed');
  // The signature is now embedded in claim_nft data and verified in-program. A
  // signature from a different ETH key must fail the in-program recovery check.
  const wrongSignerFixture = createLocalEphemeralClaimFixture({ claimant: claimer.publicKey.toBase58(), expiryUnix });
  const wrongSigClaim = { ...local, signature: wrongSignerFixture.signature };
  await rejectWithoutStateChange('wrong secp signer', new Transaction().add(claimIx(wrongSigClaim)), [claimer]);
  const badRecoveryClaim = { ...local, signature: `0x${local.signature.slice(2, 130)}04` };
  await rejectWithoutStateChange('malformed recovery id', new Transaction().add(claimIx(badRecoveryClaim)), [claimer]);
  await rejectWithoutStateChange('recipient substitution', new Transaction().add(claimIx(local, { recipient: substitute })), [substitute]);
  await rejectWithoutStateChange('expired authorization', new Transaction().add(claimIx(local, { expiry: 1 })), [claimer]);

  const badClaimProof = { ...local, claim: { ...local.claim, proof: [`0x${'00'.repeat(32)}`] } };
  await rejectWithoutStateChange('invalid local claim proof', new Transaction().add(claimIx(badClaimProof)), [claimer]);
  const badMetadata = { ...local, metadata: { ...local.metadata, proof: [...local.metadata.proof] } };
  badMetadata.metadata.proof[0] = `0x${Buffer.from(bytes32(badMetadata.metadata.proof[0]).map((byte, index) => index === 0 ? byte ^ 1 : byte)).toString('hex')}`;
  await rejectWithoutStateChange('invalid immutable metadata proof', new Transaction().add(claimIx(badMetadata)), [claimer]);
  await rejectWithoutStateChange('public-pool ID', new Transaction().add(claimIx(publicLocal)), [claimer], publicLocal);

  // A rent-exempt system account is a pre-existing receipt and must not be
  // overwritten. Modern validators reject a 1-lamport transfer because it
  // would create a rent-paying system account before our program executes.
  const minimumSystemAccountRent = await connection.getMinimumBalanceForRentExemption(0);
  await submit(connection, { Transaction, TransactionInstruction }, new Transaction().add(SystemProgram.transfer({
    fromPubkey: authority.publicKey,
    toPubkey: replayAccounts.receipt,
    lamports: minimumSystemAccountRent,
  })), [authority]);
  await rejectWithoutStateChange('pre-existing receipt', new Transaction().add(claimIx(replayLocal)), [claimer], replayLocal);

  // Force the real CreateV1 CPI to fail after all pre-CPI validations. Keep the
  // claimant rent-exempt, but below the measured rent needed for Core AssetV1 +
  // ClaimReceipt creation. Do not drain it below the system-account rent floor:
  // recent validator versions reject that transfer before our program executes.
  const claimerBalance = await connection.getBalance(claimer.publicKey);
  const claimantRentFloor = await connection.getMinimumBalanceForRentExemption(0);
  const insufficientForCoreAndReceipt = claimantRentFloor + 100_000;
  assert.ok(claimerBalance > insufficientForCoreAndReceipt, 'airdrop must exceed the deliberate Core-payer balance');
  await submit(connection, { Transaction, TransactionInstruction }, new Transaction().add(SystemProgram.transfer({
    fromPubkey: claimer.publicKey,
    toPubkey: authority.publicKey,
    lamports: claimerBalance - insufficientForCoreAndReceipt,
  })), [claimer]);
  await assert.rejects(submitClaim(new Transaction().add(claimIx()), [authority, claimer]));
  await assertNoDurableClaimState('failed real Core CreateV1 CPI');
  // Fund the claimant from the already-confirmed local authority instead of
  // relying on an RPC airdrop becoming visible after the deliberate failure.
  // This also asserts that the success path has enough rent before invoking Core.
  await submit(connection, { Transaction, TransactionInstruction }, new Transaction().add(SystemProgram.transfer({
    fromPubkey: authority.publicKey,
    toPubkey: claimer.publicKey,
    lamports: 10_000_000,
  })), [authority]);
  assert.ok(
    await connection.getBalance(claimer.publicKey) >= 10_000_000,
    'claimant must be funded for Core AssetV1 and ClaimReceipt rent before the success claim',
  );

  // Dust a predictable but otherwise empty system-owned asset PDA. The amount
  // must be rent-exempt: validators reject a transfer that would create a
  // rent-paying system account before claim_nft can recover the dust.
  const dustLamports = await connection.getMinimumBalanceForRentExemption(0);
  await submit(connection, { Transaction, TransactionInstruction }, new Transaction().add(SystemProgram.transfer({
    fromPubkey: authority.publicKey, toPubkey: asset, lamports: dustLamports,
  })), [authority]);
  const dustedAsset = await connection.getAccountInfo(asset);
  assert.ok(dustedAsset, 'the deterministic asset PDA is deliberately dusted before the claim');
  assert.equal(dustedAsset.owner.toBase58(), SystemProgram.programId.toBase58());
  assert.equal(dustedAsset.lamports, dustLamports);
  const claimerLamportsBeforeSuccess = await connection.getBalance(claimer.publicKey);

  // claim_nft embeds its own signature and verifies it in-program over the
  // 32-byte message hash. This executes the production verifier's recovery path.
  const success = await submitClaim(new Transaction().add(claimIx()), [claimer]);
  assert.equal(success.message.version, 0, 'success claim is a v0 transaction using the local ALT');
  assert.ok(success.serializedLength <= 1232, 'full authentic proof transaction fits Solana packet size');
  const successSignature = success.signature;

  const assetAccount = await connection.getAccountInfo(asset);
  assert.ok(assetAccount, 'Core CreateV1 must create the deterministic asset');
  assert.equal(assetAccount.owner.toBase58(), CORE_PROGRAM_TEXT, 'created asset must be Core-owned');
  const receiptAccount = await connection.getAccountInfo(receipt);
  assert.ok(receiptAccount, 'receipt is created only after Core CreateV1 succeeds');
  assert.equal(receiptAccount.owner.toBase58(), PROGRAM_ID_TEXT, 'the receipt is owned by the claim program');
  const receiptData = Buffer.from(receiptAccount.data);
  assert.deepEqual(receiptData.subarray(0, 8), createHash('sha256').update('account:ClaimReceipt').digest().subarray(0, 8), 'receipt account discriminator');
  assert.equal(receiptData.length, 8 + 32 + 20 + 2 + 1, 'receipt has exactly the ClaimReceipt layout');
  assert.equal(receiptData.subarray(8, 40).toString('hex'), claimer.publicKey.toBuffer().toString('hex'), 'receipt claimer');
  assert.equal(receiptData.subarray(40, 60).toString('hex'), Buffer.from(local.claim.ethAddress.slice(2), 'hex').toString('hex'), 'receipt Ethereum address');
  assert.equal(receiptData.readUInt16LE(60), local.claim.nftId, 'receipt NFT id');
  assert.equal(receiptData[62], receiptBump, 'receipt PDA bump');

  // mpl-core's pinned SDK is the authority for Core data layout. Do not hand-decode these accounts.
  const { deserializeAssetV1, deserializeCollectionV1 } = await import('@metaplex-foundation/mpl-core');
  const decodedAsset = deserializeAssetV1({
    publicKey: asset.toBase58(),
    data: Uint8Array.from(assetAccount.data),
    executable: assetAccount.executable,
    lamports: assetAccount.lamports,
    owner: assetAccount.owner.toBase58(),
    rentEpoch: assetAccount.rentEpoch,
  });
  assert.equal(decodedAsset.header.owner, CORE_PROGRAM_TEXT, 'SDK raw-account header preserves mpl-core ownership');
  assert.equal(decodedAsset.owner, claimer.publicKey.toBase58(), 'decoded Core asset owner is the claimant');
  assert.equal(decodedAsset.updateAuthority.type, 'Collection', 'decoded Core asset derives update authority from its configured collection');
  assert.equal(decodedAsset.updateAuthority.address, collection.publicKey.toBase58(), 'decoded Core asset update authority is the configured collection');
  const collectionAccount = await connection.getAccountInfo(collection.publicKey);
  assert.ok(collectionAccount, 'Core collection must exist before the claimed asset can derive authority from it');
  assert.equal(collectionAccount.owner.toBase58(), CORE_PROGRAM_TEXT, 'collection must be Core-owned');
  const decodedCollection = deserializeCollectionV1({
    publicKey: collection.publicKey.toBase58(),
    data: Uint8Array.from(collectionAccount.data),
    executable: collectionAccount.executable,
    lamports: collectionAccount.lamports,
    owner: collectionAccount.owner.toBase58(),
    rentEpoch: collectionAccount.rentEpoch,
  });
  assert.equal(decodedCollection.header.owner, CORE_PROGRAM_TEXT, 'SDK raw-account header preserves mpl-core collection ownership');
  // CollectionV1 stores its update authority as a direct public key; unlike an AssetV1,
  // it is not a tagged update-authority union.
  assert.equal(decodedCollection.updateAuthority, config.toBase58(), 'collection update authority is the immutable config PDA');

  const successTransaction = await connection.getTransaction(successSignature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
  assert.ok(successTransaction?.meta, 'successful claim transaction metadata is available');
  const claimerLamportsAfterSuccess = await connection.getBalance(claimer.publicKey);
  assert.equal(
    claimerLamportsAfterSuccess - claimerLamportsBeforeSuccess,
    dustLamports - successTransaction.meta.fee - assetAccount.lamports - receiptAccount.lamports,
    'dusted asset PDA lamports are returned to the claimer before Core and receipt rent are charged',
  );

  const configAccount = await connection.getAccountInfo(config);
  assert.equal(Buffer.from(configAccount.data).readUInt16LE(267), 1, 'claim counter increments only after the authentic claim path succeeds');
  const registryAccount = await connection.getAccountInfo(registry);
  assert.ok(registryAccount, 'allocation registry remains present');
  // Anchor discriminator (8) + manifest hash (32) + public IDs (246 * u16). #360 is index 359,
  // so it occupies bit 7 of byte 44 in the one-way allocation bitmap.
  assert.equal(Buffer.from(registryAccount.data)[8 + 32 + (246 * 2) + 44] & 0x80, 0x80, '#360 is allocated only after Core CreateV1 succeeds');

  // A second authentic authorization for the same allocation must not mutate the
  // already-created Core asset, the pre-existing receipt, bitmap, or counter.
  await rejectWithoutStateChange('already allocated ID', new Transaction().add(claimIx(replayLocal)), [claimer], replayLocal);

  // ---- one-signature batch claims (same launch) ----
  // claimBatchData is defined near claimData above; both members share ONE
  // batch signature over nft_ids: 248,250.
  const batchClaimIx = (id) => {
    const { claim, proof } = batchMember(id);
    const [batchAsset] = PublicKey.findProgramAddressSync([Buffer.from('asset'), Buffer.from([id >> 8, id & 0xff])], programId);
    const [batchReceipt] = PublicKey.findProgramAddressSync([Buffer.from('claim'), bytes32(claim.leaf)], programId);
    return new TransactionInstruction({
      programId,
      keys: [
        { pubkey: config, isSigner: false, isWritable: true }, { pubkey: registry, isSigner: false, isWritable: true },
        { pubkey: claimer.publicKey, isSigner: true, isWritable: true }, { pubkey: collection.publicKey, isSigner: false, isWritable: true },
        { pubkey: batchAsset, isSigner: false, isWritable: true }, { pubkey: batchReceipt, isSigner: false, isWritable: true },
        { pubkey: coreProgram, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: claimBatchData(batch, id, proof, expiryUnix),
    });
  };
  const batchStateOf = async (id) => {
    const { claim } = batchMember(id);
    const [batchAsset] = PublicKey.findProgramAddressSync([Buffer.from('asset'), Buffer.from([id >> 8, id & 0xff])], programId);
    const [batchReceipt] = PublicKey.findProgramAddressSync([Buffer.from('claim'), bytes32(claim.leaf)], programId);
    const [registryAccount, configAccount, assetAccount, receiptAccount] = await Promise.all([
      connection.getAccountInfo(registry), connection.getAccountInfo(config),
      connection.getAccountInfo(batchAsset), connection.getAccountInfo(batchReceipt),
    ]);
    const bitmap = Buffer.from(registryAccount.data);
    const byte = 8 + 32 + (246 * 2) + Math.floor((id - 1) / 8);
    return {
      allocated: bitmap[byte] & (1 << ((id - 1) % 8)),
      claimsMinted: Buffer.from(configAccount.data).readUInt16LE(267),
      asset: accountFingerprint(assetAccount),
      receipt: accountFingerprint(receiptAccount),
    };
  };
  // Non-member id must be rejected before any state change.
  {
    const foreignId = 300;
    const member = batch.claims[0];
    const [foreignAsset] = PublicKey.findProgramAddressSync([Buffer.from('asset'), Buffer.from([foreignId >> 8, foreignId & 0xff])], programId);
    const [foreignReceipt] = PublicKey.findProgramAddressSync([Buffer.from('claim'), bytes32(member.leaf)], programId);
    await rejectWithoutStateChange('non-member id', new Transaction().add(new TransactionInstruction({
      programId,
      keys: [
        { pubkey: config, isSigner: false, isWritable: true }, { pubkey: registry, isSigner: false, isWritable: true },
        { pubkey: claimer.publicKey, isSigner: true, isWritable: true }, { pubkey: collection.publicKey, isSigner: false, isWritable: true },
        { pubkey: foreignAsset, isSigner: false, isWritable: true }, { pubkey: foreignReceipt, isSigner: false, isWritable: true },
        { pubkey: coreProgram, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: claimBatchData(batch, foreignId, [], expiryUnix),
    })), [claimer]);
  }
  // Wrong list order breaks canonical serialization → signature mismatch.
  {
    const id = batch.nftIds[1];
    const { claim, proof } = batchMember(id);
    const [reorderAsset] = PublicKey.findProgramAddressSync([Buffer.from('asset'), Buffer.from([id >> 8, id & 0xff])], programId);
    const [reorderReceipt] = PublicKey.findProgramAddressSync([Buffer.from('claim'), bytes32(claim.leaf)], programId);
    await rejectWithoutStateChange(`#${batch.nftIds[0]} after reordered list`, new Transaction().add(new TransactionInstruction({
      programId,
      keys: [
        { pubkey: config, isSigner: false, isWritable: true }, { pubkey: registry, isSigner: false, isWritable: true },
        { pubkey: claimer.publicKey, isSigner: true, isWritable: true }, { pubkey: collection.publicKey, isSigner: false, isWritable: true },
        { pubkey: reorderAsset, isSigner: false, isWritable: true }, { pubkey: reorderReceipt, isSigner: false, isWritable: true },
        { pubkey: coreProgram, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: claimBatchData({ ...batch, nftIds: [...batch.nftIds].reverse() }, id, proof, expiryUnix),
    })), [claimer], { ...local, claim });
  }
  // Happy path: both members claimed from the single batch signature.
  let batchClaimed = 0;
  for (const id of batch.nftIds) {
    await submitClaim(new Transaction().add(batchClaimIx(id)), [claimer]);
    batchClaimed += 1;
    const state = await batchStateOf(id);
    assert.equal(state.allocated, 1 << ((id - 1) % 8), `#${id} allocated after batch claim`);
    assert.ok(state.asset && state.asset.owner === CORE_PROGRAM_TEXT, `#${id} Core asset created via batch`);
    assert.ok(state.receipt && state.receipt.owner === PROGRAM_ID_TEXT, `#${id} receipt created via batch`);
    assert.equal(state.claimsMinted, 1 + batchClaimed, 'claim counter increments per batch item');
  }
  // Replay of a batch member must not mutate anything.
  const batchReplayBefore = await batchStateOf(batch.nftIds[0]);
  await assert.rejects(submitClaim(new Transaction().add(batchClaimIx(batch.nftIds[0])), [claimer]));
  assert.deepEqual(await batchStateOf(batch.nftIds[0]), batchReplayBefore, 'batch replay rejected by the receipt guard');

  // Exact harness limitation, deliberately not represented as false coverage: this
  // validator has no helper program and a PDA cannot sign a SystemProgram assign or
  // allocate transaction. The only available way to materialize this deterministic
  // asset PDA as non-system/nonempty is the real Core CreateV1 above; afterwards the
  // allocation check necessarily rejects every subsequent claim before the asset
  // owner/data checks. A direct transaction-level test of that later guard therefore
  // requires a fresh validator preloaded with a deliberately malformed PDA account,
  // or a test-only mutator instruction. Both violate this isolated harness's rules.
});

test('local-ephemeral gate is wired as loopback-only and does not use a Devnet RPC', async () => {
  const { readFile } = await import('node:fs/promises');
  const script = await readFile(new URL('../scripts/run-x86-core-claim-gate.sh', import.meta.url), 'utf8');
  assert.match(script, new RegExp(`${LOCAL_EPHEMERAL_CLAIM_ROOT_ENV}=1`));
  assert.match(script, /local-ephemeral-claim-root\.test\.mjs/);
  assert.doesNotMatch(script, /https?:\/\/(?:api\.)?devnet\.solana\.com/i);
});
