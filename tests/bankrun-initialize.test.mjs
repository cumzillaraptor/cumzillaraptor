import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const outputDir = process.env.SBF_OUT_DIR || '';
const programPath = path.join(outputDir, 'cumzillaraptors.so');
const revisionPath = path.join(outputDir, 'cumzillaraptors.build-revision');
const keypairJson = process.env.CUMZ_TEST_VALIDATION_AUTHORITY_KEYPAIR_JSON;
const expectedRevision = process.env.CUMZ_EXPECTED_BUILD_REVISION;
const canRun = process.arch === 'x64'
  && process.platform === 'linux'
  && Boolean(outputDir)
  && existsSync(programPath)
  && existsSync(revisionPath)
  && Boolean(keypairJson)
  && Boolean(expectedRevision);

const PROGRAM_ID_TEXT = 'AYE4iC2gp81H8jvMjk4EGxwP2sJFzuDptUwxqwTZYTMY';

const CORE_PROGRAM_TEXT = 'CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d';

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
    Buffer.alloc(32, 1), Buffer.alloc(32, 2),
    Buffer.from('585606c4396358e047f8702d856548587eb0a18bc38be1076b0e4ea7f15ac019', 'hex'),
    Buffer.alloc(32, 4),
    u16le(246), u16le(174),
  ]);
}

// This test deliberately uses a generated ephemeral signer and the separately built
// test-validation SBPF artifact. It never needs a production/devnet keypair.
test('x86 Bankrun: initialize_launch stores immutable state and rejects reinitialization', { skip: !canRun }, async () => {
  assert.equal(readFileSync(revisionPath, 'utf8').trim(), expectedRevision, 'SBPF artifact must be built from this exact revision');
  const [{ start }, web3] = await Promise.all([import('solana-bankrun'), import('@solana/web3.js')]);
  const { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, TransactionInstruction } = web3;
  const programId = new PublicKey(PROGRAM_ID_TEXT);
  const authority = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(keypairJson)));
  const context = await start([{ name: 'cumzillaraptors', programId }], []);

  const funding = new Transaction().add(SystemProgram.transfer({ fromPubkey: context.payer.publicKey, toPubkey: authority.publicKey, lamports: 2 * LAMPORTS_PER_SOL }));
  funding.feePayer = context.payer.publicKey;
  funding.recentBlockhash = context.lastBlockhash;
  funding.sign(context.payer);
  await context.banksClient.processTransaction(funding);

  const [config] = PublicKey.findProgramAddressSync([Buffer.from('config')], programId);
  const treasury = Keypair.generate().publicKey;
  const collection = Keypair.generate().publicKey;
  const invoke = async () => {
    const transaction = new Transaction().add(new TransactionInstruction({
      programId,
      keys: [
        { pubkey: config, isSigner: false, isWritable: true },
        { pubkey: authority.publicKey, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: encodeInitializeLaunch({ treasury, coreProgram: new PublicKey(CORE_PROGRAM_TEXT), collection }),
    }));
    transaction.feePayer = authority.publicKey;
    transaction.recentBlockhash = context.lastBlockhash;
    transaction.sign(authority);
    return context.banksClient.processTransaction(transaction);
  };

  await invoke();
  const account = await context.banksClient.getAccount(config);
  assert.ok(account, 'config PDA must exist after first initialization');
  const data = Buffer.from(account.data);
  assert.equal(data.subarray(8, 40).toString('hex'), authority.publicKey.toBuffer().toString('hex'));
  assert.equal(data.subarray(40, 72).toString('hex'), treasury.toBuffer().toString('hex'));
  assert.equal(data.subarray(104, 136).toString('hex'), collection.toBuffer().toString('hex'));
  assert.equal(data[264], 0, 'sale state must be Setup');
  assert.equal(data.readUInt16LE(265), 0, 'public mint counter must start at zero');
  assert.equal(data.readUInt16LE(267), 0, 'claim mint counter must start at zero');
  await assert.rejects(invoke());
});

test('Bankrun behavioral gate refuses local ARM execution and requires explicit x86 CI inputs', () => {
  if (process.arch === 'arm64') {
    assert.equal(canRun, false, 'this ARM host must not execute a stale x86 SBPF artifact');
    return;
  }
  assert.equal(process.arch, 'x64');
  assert.ok(outputDir, 'x86 CI must explicitly select its current SBPF output directory');
  assert.ok(keypairJson, 'x86 CI must generate an ephemeral test-validation authority');
  assert.ok(expectedRevision, 'x86 CI must bind its artifact to the checked-out revision');
});
