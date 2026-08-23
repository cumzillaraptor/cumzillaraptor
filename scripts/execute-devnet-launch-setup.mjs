#!/usr/bin/env node
// Devnet launch setup: initialize_launch -> initialize_allocation_registry -> setup_collection.
// Signed by the launch authority (from keypair file paths passed as argv). Verifies on-chain state.
// Prints public keys and signatures only; never prints key material.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction, sendAndConfirmTransaction } from '@solana/web3.js';
import { keccak256 } from '@ethersproject/keccak256';

const PROGRAM_ID = new PublicKey('AYE4iC2gp81H8jvMjk4EGxWP2sJFzuDptUwxqwTZYTMY');
const CORE_PROGRAM = new PublicKey('CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d');
const TREASURY = new PublicKey('FiHKQhwq2ZKkD2ZbBf3mPYgyw2Y9QDzNYykpMGErovU6');
const EXPECTED_AUTHORITY = new PublicKey('71WBrLfntE4yjTxEuQ3EgGJKE8zzZUgeEm5tkLi5Jx2r');
const METADATA_ROOT = Buffer.from('689ab71d32efff276df2a0e14f72ee9eb159da3508cfe9d337a9fcc3c2220211', 'hex');
const CLAIM_ROOT = Buffer.from('8443ba0a33024e5edbbf59ecc82a30e27255c2774884d190fb1f0ae11b9ebdef', 'hex');
const CLUSTER_TAG_HASH = Buffer.from('2dc5e5e2ec5ca5eba43c565499822cae24d566819ddb33aaf598c37a70a06828', 'hex');

const [authorityPath] = process.argv.slice(2);
if (!authorityPath) { console.error('usage: node execute-devnet-launch-setup.mjs <authority-keypair.json>'); process.exit(1); }
const authority = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(authorityPath, 'utf8'))));
if (!authority.publicKey.equals(EXPECTED_AUTHORITY)) { console.error(`authority mismatch: ${authority.publicKey.toBase58()}`); process.exit(1); }

function csvIds(relative, expectedCount) {
  const lines = readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8').trim().split(/\r?\n/);
  if (lines.length !== expectedCount + 1) throw new Error(`${relative} row count mismatch`);
  return lines.slice(1).map((line) => Number(line.split(',')[0]));
}
const publicIds = csvIds('nft-data/allocation-source/mint_list.csv', 246);
const claimIds = csvIds('nft-data/allocation-source/reserve_list.csv', 174);
{
  const all = [...publicIds, ...claimIds].sort((a, b) => a - b);
  if (all.length !== 420 || all.some((id, i) => id !== i + 1)) throw new Error('allocation partition is not an exact cover of 1..420');
}
const u16be = (v) => { const b = Buffer.alloc(2); b.writeUInt16BE(v); return b; };
const u16le = (v) => { const b = Buffer.alloc(2); b.writeUInt16LE(v); return b; };
const u32le = (v) => { const b = Buffer.alloc(4); b.writeUInt32LE(v); return b; };

const collection = Keypair.generate();
const allocationHash = Buffer.from(keccak256(Buffer.concat([
  Buffer.from('CUMZILLARAPTORS_ALLOCATION_V1'), PROGRAM_ID.toBuffer(), Buffer.from([6]), Buffer.from('devnet'),
  collection.publicKey.toBuffer(), u16be(publicIds.length), ...publicIds.map(u16be),
  CLAIM_ROOT, METADATA_ROOT,
])).slice(2), 'hex');

const disc = (name) => createHash('sha256').update(`global:${name}`).digest().subarray(0, 8);
const [config] = PublicKey.findProgramAddressSync([Buffer.from('config')], PROGRAM_ID);
const [registry] = PublicKey.findProgramAddressSync([Buffer.from('allocation')], PROGRAM_ID);

const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
const balance = await connection.getBalance(authority.publicKey);
console.log(`authority ${authority.publicKey.toBase58()} balance ${(balance / 1e9).toFixed(3)} SOL`);

async function send(name, ixs, extraSigners = []) {
  const tx = new Transaction().add(...ixs);
  const sig = await sendAndConfirmTransaction(connection, tx, [authority, ...extraSigners]);
  console.log(`${name}: ${sig}`);
  return sig;
}

// 1. initialize_launch
await send('initialize_launch', [new TransactionInstruction({
  programId: PROGRAM_ID,
  keys: [
    { pubkey: config, isSigner: false, isWritable: true },
    { pubkey: authority.publicKey, isSigner: true, isWritable: true },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ],
  data: Buffer.concat([
    disc('initialize_launch'),
    TREASURY.toBuffer(), CORE_PROGRAM.toBuffer(), collection.publicKey.toBuffer(),
    allocationHash, CLAIM_ROOT, METADATA_ROOT, CLUSTER_TAG_HASH,
    u16le(246), u16le(174),
  ]),
})]);

// 2. initialize_allocation_registry
{
  const pubBuf = Buffer.concat(publicIds.map(u16le));
  const claimBuf = Buffer.concat(claimIds.map(u16le));
  await send('initialize_allocation_registry', [new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: config, isSigner: false, isWritable: false },
      { pubkey: registry, isSigner: false, isWritable: true },
      { pubkey: authority.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([disc('initialize_allocation_registry'), u32le(publicIds.length), pubBuf, u32le(claimIds.length), claimBuf]),
  })]);
}

// 3. setup_collection (CPI into canonical mpl-core)
await send('setup_collection', [new TransactionInstruction({
  programId: PROGRAM_ID,
  keys: [
    { pubkey: config, isSigner: false, isWritable: false },
    { pubkey: collection.publicKey, isSigner: true, isWritable: true },
    { pubkey: authority.publicKey, isSigner: true, isWritable: true },
    { pubkey: CORE_PROGRAM, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ],
  data: disc('setup_collection'),
})], [collection]);

// 4. On-chain verification
const cfgAcct = await connection.getAccountInfo(config);
if (!cfgAcct) throw new Error('config PDA missing');
const d = cfgAcct.data;
const checks = {
  launchAuthority: new PublicKey(d.subarray(8, 40)).toBase58() === EXPECTED_AUTHORITY.toBase58(),
  treasury: new PublicKey(d.subarray(40, 72)).toBase58() === TREASURY.toBase58(),
  coreProgram: new PublicKey(d.subarray(72, 104)).toBase58() === CORE_PROGRAM.toBase58(),
  collection: new PublicKey(d.subarray(104, 136)).equals(collection.publicKey),
  allocationHashMatches: d.subarray(136, 168).equals(allocationHash),
  saleStateSetup: d[264] === 0,
};
console.log('config PDA:', JSON.stringify(checks));
for (const [k, v] of Object.entries(checks)) if (!v) throw new Error(`config check failed: ${k}`);

const colAcct = await connection.getAccountInfo(collection.publicKey);
if (!colAcct || colAcct.owner.toBase58() !== CORE_PROGRAM.toBase58()) throw new Error('collection not owned by canonical mpl-core');
const colStr = colAcct.data.toString('latin1');
if (!colStr.includes('cumzillaraptors')) throw new Error('collection name missing');
if (!colStr.includes(TREASURY.toBase58()) && !colAcct.data.includes(TREASURY.toBuffer())) throw new Error('treasury royalty recipient missing');
console.log('collection verified:', collection.publicKey.toBase58());
console.log(`updateAuthority(config PDA): ${config.toBase58()} | registry PDA: ${registry.toBase58()}`);
console.log('LAUNCH SETUP COMPLETE');
