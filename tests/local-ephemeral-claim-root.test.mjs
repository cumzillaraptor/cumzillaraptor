import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { keccak256 } from '@ethersproject/keccak256';
import path from 'node:path';

import {
  LOCAL_EPHEMERAL_CLAIM_ROOT_ENV,
  createLocalEphemeralClaimFixture,
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

const PROGRAM_ID_TEXT = '2YTAvP54MuSd7uUGbG9LrWiXCYh5UNHyqvy6XqxCTda2';
const CORE_PROGRAM_TEXT = 'CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d';

const METADATA_ROOT = '8b673473b91b510896a2142b647c09b204a93e2ba79d35ec10fe7ea7b915ddaa';

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
    string(local.metadata.name), string(local.metadata.uri), vectorBytes32(local.metadata.proof), bytes32(local.claim.leaf),
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
  // ALT creation validates `recentSlot` against the validator's live SlotHashes
  // sysvar. On a single-node validator, a confirmed slot can be stale by the
  // time preflight runs, so derive it from processed commitment immediately
  // before building the create instruction.
  const recentSlot = await connection.getSlot('processed');
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
      && BigInt(await connection.getSlot('confirmed')) > BigInt(lookup.value.state.lastExtendedSlot)) {
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

test('explicit local fixture creates an actual secp precompile instruction for only its runtime leaf', { skip: !enabled }, () => {
  const local = createLocalEphemeralClaimFixture({
    claimant: '8gUvnRYEcUMHwkt4WwWckMFCC9KUN1m47TgzttXR7TVg',
    expiryUnix: 2_000_000_000,
  });
  const secp = local.buildSecpInstruction();
  assert.equal(secp.programId.toBase58(), 'KeccakSecp256k11111111111111111111111111111');
  assert.equal(secp.data[0], 1, 'canonical instruction contains exactly one secp signature');
  assert.equal(local.claimRoot, local.claim.leaf, 'single-leaf local tree has an empty proof');
  assert.deepEqual(local.claim.proof, []);
  assert.equal(local.metadataRoot, V1_CLAIM_FIXTURE.metadataRoot);
  assert.notEqual(local.claim.ethAddress, V1_CLAIM_FIXTURE.claim.ethAddress);
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
  const tree = localMerkleProofs([claim360.claim.leaf, receipt360.claim.leaf, public1.claim.leaf]);
  const bindLocalProof = (fixture, proof) => ({
    ...fixture,
    claimRoot: tree.root,
    // Rebuild the EIP-191 preimage under the actual local multi-leaf root.
    // The claim leaf itself is root-independent; the authorization domain is not.
    authorization: V1_CLAIM_FIXTURE.claimAuthorizationFor(
      fixture.authorization.recipient,
      fixture.authorization.expiryUnix,
      { claimRoot: tree.root },
    ),
    claim: { ...fixture.claim, proof },
  });
  const local = bindLocalProof(claim360, tree.proofs[0]);
  const replayLocal = bindLocalProof(receipt360, tree.proofs[1]);
  const publicLocal = bindLocalProof(public1, tree.proofs[2]);
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

  const claimIx = (fixture = local, { recipient = claimer, expiry = expiryUnix } = {}) => {
    const accounts = claimAccounts(fixture);
    return new TransactionInstruction({
      programId,
      keys: [
        { pubkey: config, isSigner: false, isWritable: true }, { pubkey: registry, isSigner: false, isWritable: true },
        { pubkey: recipient.publicKey, isSigner: true, isWritable: true }, { pubkey: collection.publicKey, isSigner: false, isWritable: true },
        { pubkey: accounts.asset, isSigner: false, isWritable: true }, { pubkey: accounts.receipt, isSigner: false, isWritable: true },
        { pubkey: coreProgram, isSigner: false, isWritable: false }, { pubkey: SYSVAR_INSTRUCTIONS_PUBKEY, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: claimData(fixture, expiry),
    });
  };
  // The authentic claim carries the full reviewed nine-element metadata proof and
  // a two-element local claim proof. Its legacy encoding exceeds Solana's 1232-byte
  // packet ceiling, so use a validator-created ALT plus a v0 transaction. The
  // precompile remains instruction 0 and claim_nft remains instruction 1.
  const claimWeb3 = {
    AddressLookupTableProgram, Transaction, TransactionMessage, VersionedTransaction,
  };
  const claimLookupTable = await createAndActivateClaimLookupTable(connection, claimWeb3, authority, [
    config, registry, collection.publicKey,
    asset, receipt, replayAccounts.asset, replayAccounts.receipt, publicAccounts.asset, publicAccounts.receipt,
    coreProgram,
    SYSVAR_INSTRUCTIONS_PUBKEY, SystemProgram.programId,
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
  await rejectWithoutStateChange('wrong secp signer', new Transaction().add(replayLocal.buildSecpInstruction(), claimIx()), [claimer]);
  await rejectWithoutStateChange('non-adjacent secp instruction', new Transaction().add(
    local.buildSecpInstruction(), SystemProgram.transfer({ fromPubkey: claimer.publicKey, toPubkey: authority.publicKey, lamports: 1 }), claimIx(),
  ), [claimer]);
  await rejectWithoutStateChange('recipient substitution', new Transaction().add(local.buildSecpInstruction(), claimIx(local, { recipient: substitute })), [substitute]);
  await rejectWithoutStateChange('expired authorization', new Transaction().add(local.buildSecpInstruction(), claimIx(local, { expiry: 1 })), [claimer]);

  const badClaimProof = { ...local, claim: { ...local.claim, proof: [`0x${'00'.repeat(32)}`] } };
  await rejectWithoutStateChange('invalid local claim proof', new Transaction().add(local.buildSecpInstruction(), claimIx(badClaimProof)), [claimer]);
  const badMetadata = { ...local, metadata: { ...local.metadata, proof: [...local.metadata.proof] } };
  badMetadata.metadata.proof[0] = `0x${Buffer.from(bytes32(badMetadata.metadata.proof[0]).map((byte, index) => index === 0 ? byte ^ 1 : byte)).toString('hex')}`;
  await rejectWithoutStateChange('invalid immutable metadata proof', new Transaction().add(local.buildSecpInstruction(), claimIx(badMetadata)), [claimer]);
  await rejectWithoutStateChange('public-pool ID', new Transaction().add(publicLocal.buildSecpInstruction(), claimIx(publicLocal)), [claimer], publicLocal);

  // A rent-exempt system account is a pre-existing receipt and must not be
  // overwritten. Modern validators reject a 1-lamport transfer because it
  // would create a rent-paying system account before our program executes.
  const minimumSystemAccountRent = await connection.getMinimumBalanceForRentExemption(0);
  await submit(connection, { Transaction, TransactionInstruction }, new Transaction().add(SystemProgram.transfer({
    fromPubkey: authority.publicKey,
    toPubkey: replayAccounts.receipt,
    lamports: minimumSystemAccountRent,
  })), [authority]);
  await rejectWithoutStateChange('pre-existing receipt', new Transaction().add(replayLocal.buildSecpInstruction(), claimIx(replayLocal)), [claimer], replayLocal);

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
  await assert.rejects(submitClaim(new Transaction().add(local.buildSecpInstruction(), claimIx()), [authority, claimer]));
  await assertNoDurableClaimState('failed real Core CreateV1 CPI');
  const refill = await connection.requestAirdrop(claimer.publicKey, 10_000_000_000);
  await connection.confirmTransaction(refill, 'confirmed');

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

  // The precompile is instruction 0; claim_nft is instruction 1. This executes
  // the production verifier's strict immediately-preceding-instruction path.
  const success = await submitClaim(new Transaction().add(local.buildSecpInstruction(), claimIx()), [claimer]);
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

  // mpl-core's pinned SDK is the authority for Core data layout. Do not hand-decode this account.
  const { deserializeAssetV1 } = await import('@metaplex-foundation/mpl-core');
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
  assert.equal(decodedAsset.updateAuthority.type, 'Address', 'decoded Core asset uses an address update authority');
  assert.equal(decodedAsset.updateAuthority.address, config.toBase58(), 'decoded Core asset update authority is the config PDA');

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
  await rejectWithoutStateChange('already allocated ID', new Transaction().add(replayLocal.buildSecpInstruction(), claimIx(replayLocal)), [claimer], replayLocal);

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
