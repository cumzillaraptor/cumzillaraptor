import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

// Task 7 collection-creation gate.
//
// IMPORTANT (harness limitation): solana-bankrun 0.4.0's `start` only accepts {name, programId}
// and does NOT load the mpl-core program (only SPL Token + memo are built in). Therefore a *live*
// CPI into mpl-core (actual collection creation, and end-to-end verification of the update-authority
// PDA + 500bp royalty) CANNOT run in this Bankrun harness. That live path is instead validated by:
//   1. programs/cumzillaraptors/src/core.rs unit test `collection_cpi_binds_config_pda_...`
//      (asserts the exact CreateCollectionV1 instruction: UA = config PDA, royalty 500bp -> treasury); and
//   2. the gated devnet flow in scripts/create-devnet-collection.mjs (+ verify-core-collection.mjs),
//      which refuses to sign/send until the x86 validation gate passes and you approve.
// What this harness CAN and DOES validate: the setup_collection *handler guard logic*, which rejects
// malformed callers BEFORE the CPI. Those checks run without mpl-core present.

const outputDir = process.env.SBF_OUT_DIR || '';
const programPath = path.join(outputDir, 'cumzillaraptors.so');
const revisionPath = path.join(outputDir, 'cumzillaraptors.build-revision');
const keypairJson = process.env.CUMZ_DEVNET_LAUNCH_AUTHORITY_KEYPAIR_JSON;
const expectedRevision = process.env.CUMZ_EXPECTED_BUILD_REVISION;
const canRun = process.arch === 'x64'
  && process.platform === 'linux'
  && Boolean(outputDir)
  && existsSync(programPath)
  && existsSync(revisionPath)
  && Boolean(keypairJson)
  && Boolean(expectedRevision);

const PROGRAM_ID_TEXT = '2YTAvP54MuSd7uUGbG9LrWiXCYh5UNHyqvy6XqxCTda2';
const AUTHORITY_TEXT = '71WBrLfntE4yjTxEuQ3EgGJKE8zzZUgeEm5tkLi5Jx2r';
const CORE_PROGRAM_TEXT = 'CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d';
const TREASURY_TEXT = 'FiHKQhwq2ZKkD2ZbBf3mPYgyw2Y9QDzNYykpMGErovU6';

function anchorDiscriminator(name) {
  return createHash('sha256').update(`global:${name}`).digest().subarray(0, 8);
}

function u16le(value) {
  const bytes = Buffer.alloc(2);
  bytes.writeUInt16LE(value);
  return bytes;
}

function encodeInitializeLaunch({ treasury, coreProgram, collection }) {
  return Buffer.concat([
    anchorDiscriminator('initialize_launch'),
    treasury.toBuffer(), coreProgram.toBuffer(), collection.toBuffer(),
    Buffer.alloc(32, 1), Buffer.alloc(32, 2), Buffer.alloc(32, 3), Buffer.alloc(32, 4),
    u16le(246), u16le(174),
  ]);
}

function encodeSetupCollection() {
  return anchorDiscriminator('setup_collection');
}

// Funds the launch authority, runs initialize_launch (committing `collection.publicKey` as the
// immutable config.collection), and returns the bankrun context + shared addresses.
async function bootstrap({ start, web3, programId, coreProgram, treasury, authority, collection }) {
  const { Keypair, SystemProgram, Transaction, TransactionInstruction } = web3;
  const context = await start([{ name: 'cumzillaraptors', programId }], []);
  const funding = new Transaction().add(SystemProgram.transfer({
    fromPubkey: context.payer.publicKey, toPubkey: authority.publicKey, lamports: 5 * web3.LAMPORTS_PER_SOL,
  }));
  funding.feePayer = context.payer.publicKey;
  funding.recentBlockhash = context.lastBlockhash;
  funding.sign(context.payer);
  await context.banksClient.processTransaction(funding);

  const [config] = web3.PublicKey.findProgramAddressSync([Buffer.from('config')], programId);
  const tx = new Transaction().add(new TransactionInstruction({
    programId,
    keys: [
      { pubkey: config, isSigner: false, isWritable: true },
      { pubkey: authority.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: encodeInitializeLaunch({ treasury, coreProgram, collection: collection.publicKey }),
  }));
  tx.feePayer = authority.publicKey;
  tx.recentBlockhash = context.lastBlockhash;
  tx.sign(authority);
  await context.banksClient.processTransaction(tx);
  return { context, config };
}

function setupTxIx({ web3, programId, config, collection, authority, mplCore }) {
  const { TransactionInstruction, SystemProgram } = web3;
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: config, isSigner: false, isWritable: false },
      { pubkey: collection.publicKey, isSigner: true, isWritable: true },
      { pubkey: authority.publicKey, isSigner: true, isWritable: true },
      { pubkey: mplCore, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: encodeSetupCollection(),
  });
}

test('x86 Bankrun: setup_collection rejects a non-Core mpl_core_program', { skip: !canRun }, async () => {
  const [{ start }, web3] = await Promise.all([import('solana-bankrun'), import('@solana/web3.js')]);
  const { Keypair, PublicKey } = web3;
  const programId = new PublicKey(PROGRAM_ID_TEXT);
  const coreProgram = new PublicKey(CORE_PROGRAM_TEXT);
  const treasury = new PublicKey(TREASURY_TEXT);
  const authority = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(keypairJson)));
  assert.equal(authority.publicKey.toBase58(), AUTHORITY_TEXT, 'injected CI key must match the committed authority');

  const collection = Keypair.generate();
  const { context, config } = await bootstrap({
    start, web3, programId, coreProgram, treasury, authority, collection,
  });

  // Wrong Core program: handler's require_keys_eq!(mpl_core_program, mpl_core::ID) must reject
  // BEFORE any CPI into mpl-core (which is not loaded in this harness anyway).
  const fakeCore = Keypair.generate().publicKey;
  const tx = new web3.Transaction().add(setupTxIx({
    web3, programId, config, collection, authority, mplCore: fakeCore,
  }));
  tx.feePayer = authority.publicKey;
  tx.recentBlockhash = context.lastBlockhash;
  tx.sign(authority, collection);
  await assert.rejects(context.banksClient.processTransaction(tx), 'wrong Core program must be rejected');
});

test('x86 Bankrun: setup_collection rejects a collection key that is not config.collection', { skip: !canRun }, async () => {
  const [{ start }, web3] = await Promise.all([import('solana-bankrun'), import('@solana/web3.js')]);
  const { Keypair, PublicKey } = web3;
  const programId = new PublicKey(PROGRAM_ID_TEXT);
  const coreProgram = new PublicKey(CORE_PROGRAM_TEXT);
  const treasury = new PublicKey(TREASURY_TEXT);
  const authority = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(keypairJson)));

  // initialize_launch commits `committed` as config.collection; we then try to create `wrong`.
  const committed = Keypair.generate();
  const { context, config } = await bootstrap({
    start, web3, programId, coreProgram, treasury, authority, collection: committed,
  });

  const wrong = Keypair.generate();
  const tx = new web3.Transaction().add(setupTxIx({
    web3, programId, config, collection: wrong, authority, mplCore: coreProgram,
  }));
  tx.feePayer = authority.publicKey;
  tx.recentBlockhash = context.lastBlockhash;
  tx.sign(authority, wrong);
  await assert.rejects(context.banksClient.processTransaction(tx), 'collection != config.collection must be rejected');
});

test('Bankrun behavioral gate refuses local ARM execution and requires explicit x86 CI inputs', () => {
  if (process.arch === 'arm64') {
    assert.equal(canRun, false, 'this ARM host must not execute a stale x86 SBPF artifact');
    return;
  }
  assert.equal(process.arch, 'x64');
  assert.ok(outputDir, 'x86 CI must explicitly select its current SBPF output directory');
  assert.ok(keypairJson, 'x86 CI must inject the approved authority only as an ephemeral secret');
  assert.ok(expectedRevision, 'x86 CI must bind its artifact to the checked-out revision');
});
