#!/usr/bin/env node
// Mainnet launch setup: initialize_launch -> initialize_allocation_registry -> setup_collection.
// Mainnet variant of execute-devnet-launch-setup.mjs. Differences:
//   - RPC: https://api.mainnet-beta.solana.com
//   - cluster tag "mainnet" in the allocation hash preimage (must match a program built
//     with `--features mainnet`)
//   - authority is the NEW mainnet-only launch authority (path passed as argv; pubkey NOT
//     hardcoded here, but must equal the value recorded in docs/operations/mainnet-decisions-v1.md)
//   - balance preflight: refuses to run with < 2 SOL on the authority
// Prints public keys and signatures only; never prints key material.
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction, sendAndConfirmTransaction } from '@solana/web3.js';
import { keccak256 } from '@ethersproject/keccak256';

if (!process.env.CUMZ_MAINNET_PROGRAM_ID || !process.env.CUMZ_MAINNET_AUTHORITY || !process.env.CUMZ_MAINNET_MANIFEST) {
  console.error('usage: CUMZ_MAINNET_PROGRAM_ID=<deployed mainnet program id>\n  CUMZ_MAINNET_AUTHORITY=<expected authority pubkey>\n  CUMZ_MAINNET_MANIFEST=<generate-launch-manifest.js --cluster mainnet output>\n  node execute-mainnet-launch-setup.mjs <authority-keypair.json> <collection-keypair.json>');
  process.exit(1);
}
const MANIFEST_PATH = process.env.CUMZ_MAINNET_MANIFEST;
if (!existsSync(MANIFEST_PATH)) { console.error('manifest not found: ' + MANIFEST_PATH); process.exit(1); }
const MANIFEST = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
if (MANIFEST.cluster !== 'mainnet') { console.error('manifest is for cluster "' + MANIFEST.cluster + '", expected "mainnet"'); process.exit(1); }
if (MANIFEST.programId !== process.env.CUMZ_MAINNET_PROGRAM_ID) { console.error('manifest program id does not match CUMZ_MAINNET_PROGRAM_ID'); process.exit(1); }
const PROGRAM_ID = new PublicKey(process.env.CUMZ_MAINNET_PROGRAM_ID);
const CORE_PROGRAM = new PublicKey('CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d');
const TREASURY = new PublicKey('FiHKQhwq2ZKkD2ZbBf3mPYgyw2Y9QDzNYykpMGErovU6');
const EXPECTED_AUTHORITY = new PublicKey(process.env.CUMZ_MAINNET_AUTHORITY);
const EXPECTED_PAYER = new PublicKey('8eCKWEHZ525kBLnh4mQBnhpkk4nmde5jSeQC7FGR8t3d');
const COLLECTION_METADATA_URI = 'ar://oGxXHkoQKnsq47U4KESzurJ0-qk0dJa2FWofHQc_-SQ';
if (MANIFEST.collectionUri !== COLLECTION_METADATA_URI) {
  console.error('manifest collection URI does not match the program collection URI'); process.exit(1);
}
// Cluster-bound roots come from a generated MAINNET manifest (generate-launch-manifest.js
// --cluster mainnet). The claim and metadata leaves hash the cluster tag, so they are NOT
// the devnet roots; hardcoding devnet values here is what silently broke a mainnet launch.
const DEVNET_CLAIM_ROOT = '0x8443ba0a33024e5edbbf59ecc82a30e27255c2774884d190fb1f0ae11b9ebdef';
const DEVNET_METADATA_ROOT = '0x689ab71d32efff276df2a0e14f72ee9eb159da3508cfe9d337a9fcc3c2220211';
const CLAIM_ROOT = Buffer.from(MANIFEST.claimRoot.slice(2), 'hex');
const METADATA_ROOT = Buffer.from(MANIFEST.metadataRoot.slice(2), 'hex');
{
  for (const [label, hexRoot, devnetRoot] of [
    ['claim', MANIFEST.claimRoot, DEVNET_CLAIM_ROOT],
    ['metadata', MANIFEST.metadataRoot, DEVNET_METADATA_ROOT],
  ]) {
    if (typeof hexRoot !== 'string' || !/^0x[0-9a-f]{64}$/.test(hexRoot)) { console.error('invalid ' + label + ' root in manifest'); process.exit(1); }
    if (hexRoot === devnetRoot) { console.error('refusing devnet ' + label + ' root (' + hexRoot + ') for a mainnet launch'); process.exit(1); }
  }
}
// Recomputed below for the "mainnet" tag; kept as a computed constant so a mismatch is loud.
const CLUSTER = 'mainnet';

function csvIds(relative, expectedCount) {
  const lines = readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8').trim().split(/\r?\n/);
  if (lines.length !== expectedCount + 1) throw new Error(`${relative} row count mismatch`);
  return lines.slice(1).map((line) => Number(line.split(',')[0]));
}
const publicIds = csvIds('nft-data/allocation-source/mint_list.csv', 246);
const claimIds = csvIds('nft-data/allocation-source/reserve_list.csv', 174);
if (!Array.isArray(MANIFEST.publicIds) || !Array.isArray(MANIFEST.claimIds) ||
    JSON.stringify(publicIds) !== JSON.stringify(MANIFEST.publicIds) ||
    JSON.stringify(claimIds) !== JSON.stringify(MANIFEST.claimIds)) {
  console.error('repository allocation CSVs do not match the reviewed manifest order'); process.exit(1);
}
{
  const all = [...publicIds, ...claimIds].sort((a, b) => a - b);
  if (all.length !== 420 || all.some((id, i) => id !== i + 1)) throw new Error('allocation partition is not an exact cover of 1..420');
}
const u16be = (v) => { const b = Buffer.alloc(2); b.writeUInt16BE(v); return b; };
const u16le = (v) => { const b = Buffer.alloc(2); b.writeUInt16LE(v); return b; };
const u32le = (v) => { const b = Buffer.alloc(4); b.writeUInt32LE(v); return b; };

const [authorityPath, collectionPath] = process.argv.slice(2);
if (!authorityPath) { console.error('missing <authority-keypair.json> path'); process.exit(1); }
const authority = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(authorityPath, 'utf8'))));
if (!authority.publicKey.equals(EXPECTED_AUTHORITY)) {
  console.error(`authority mismatch: ${authority.publicKey.toBase58()} != expected ${EXPECTED_AUTHORITY.toBase58()}`);
  process.exit(1);
}

// The manifest already commits to this exact collection public key. Its private
// key stays outside git/chat and is supplied only at Phase 3 after Phase 2 is
// funded/authorized. Never generate a replacement here: that would make the
// manifest allocation hash and the created collection disagree.
if (!collectionPath) { console.error('missing <collection-keypair.json> path'); process.exit(1); }
const collection = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(collectionPath, 'utf8'))));
if (collection.publicKey.toBase58() !== MANIFEST.collection) {
  console.error('collection keypair does not match manifest collection'); process.exit(1);
}
const allocationHash = Buffer.from(keccak256(Buffer.concat([
  Buffer.from('CUMZILLARAPTORS_ALLOCATION_V1'), PROGRAM_ID.toBuffer(), Buffer.from([6]), Buffer.from(CLUSTER),
  collection.publicKey.toBuffer(), u16be(publicIds.length), ...publicIds.map(u16be),
  CLAIM_ROOT, METADATA_ROOT,
])).slice(2), 'hex');
if (MANIFEST.allocationHash !== '0x' + allocationHash.toString('hex')) {
  console.error('manifest allocation hash does not match the collection/roots/public IDs'); process.exit(1);
}
if (MANIFEST.publicCount !== 246 || MANIFEST.claimCount !== 174 ||
    MANIFEST.auditSummary?.partitionValid !== true || MANIFEST.auditSummary?.totalCount !== 420) {
  console.error('manifest allocation counts/partition are not canonical'); process.exit(1);
}

const disc = (name) => createHash('sha256').update(`global:${name}`).digest().subarray(0, 8);
const [config] = PublicKey.findProgramAddressSync([Buffer.from('config')], PROGRAM_ID);
const [registry] = PublicKey.findProgramAddressSync([Buffer.from('allocation')], PROGRAM_ID);

const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
// Phase 0 chose a mobile payer, not a locally exported key. This setup script is
// therefore authority-funded at Phase 3; D6 remains the separate Phase-2 deploy
// payer. Assert the roles are distinct so nobody mistakes this for a payer-key path.
if (authority.publicKey.equals(EXPECTED_PAYER)) throw new Error('launch authority must remain distinct from the D6 payer');
const balance = await connection.getBalance(authority.publicKey);
console.log(`authority ${authority.publicKey.toBase58()} balance ${(balance / 1e9).toFixed(4)} SOL`);
if (balance < 2e9) throw new Error(`preflight: authority needs >= 2 SOL (has ${(balance / 1e9).toFixed(4)})`);
const programAcct = await connection.getAccountInfo(PROGRAM_ID);
if (!programAcct) throw new Error('preflight: program not deployed at CUMZ_MAINNET_PROGRAM_ID');

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
    allocationHash, CLAIM_ROOT, METADATA_ROOT,
    // CLUSTER_TAG_HASH placeholder is rejected on-chain if zero; compute keccak of the tag
    (() => {
      const h = createHash('sha256').update(CLUSTER).digest();
      if (h.equals(Buffer.alloc(32))) throw new Error('zero cluster hash');
      return h;
    })(),
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
  launchAuthorityMatches: new PublicKey(d.subarray(8, 40)).equals(authority.publicKey),
  treasury: new PublicKey(d.subarray(40, 72)).toBase58() === TREASURY.toBase58(),
  coreProgram: new PublicKey(d.subarray(72, 104)).toBase58() === CORE_PROGRAM.toBase58(),
  collection: new PublicKey(d.subarray(104, 136)).equals(collection.publicKey),
  allocationHashMatches: d.subarray(136, 168).equals(allocationHash),
  claimRootMatches: d.subarray(168, 200).equals(CLAIM_ROOT),
  metadataRootMatches: d.subarray(200, 232).equals(METADATA_ROOT),
  clusterTagHashMatches: d.subarray(232, 264).equals(createHash('sha256').update(CLUSTER).digest()),
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
console.log('MAINNET LAUNCH SETUP COMPLETE — record collection PDA in site config before cutover.');
