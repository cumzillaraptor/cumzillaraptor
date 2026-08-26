#!/usr/bin/env node
// Mainnet: set_claims_sale_state Setup -> Live. Authority-signed; verifies on-chain state after.
// Mainnet variant of execute-devnet-enable-sale.mjs. RPC + program id + authority come from env;
// balance preflight refuses to run unfunded.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, sendAndConfirmTransaction } from '@solana/web3.js';

const PROGRAM_ID = new PublicKey(process.env.CUMZ_MAINNET_PROGRAM_ID || '');
const EXPECTED_AUTHORITY = new PublicKey(process.env.CUMZ_MAINNET_AUTHORITY || '');

if (!PROGRAM_ID || !EXPECTED_AUTHORITY) {
  console.error('usage: CUMZ_MAINNET_PROGRAM_ID=<deployed mainnet program id> \\\n  CUMZ_MAINNET_AUTHORITY=<expected authority pubkey> \\\n  node execute-mainnet-enable-sale.mjs <authority-keypair.json>');
  process.exit(1);
}

const [authorityPath] = process.argv.slice(2);
if (!authorityPath) { console.error('missing <authority-keypair.json> path'); process.exit(1); }
const authority = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(authorityPath, 'utf8'))));
if (!authority.publicKey.equals(EXPECTED_AUTHORITY)) {
  console.error(`authority mismatch: ${authority.publicKey.toBase58()} != expected ${EXPECTED_AUTHORITY.toBase58()}`);
  process.exit(1);
}

const disc = (name) => createHash('sha256').update(`global:${name}`).digest().subarray(0, 8);
// Borsh enum: Setup=0, Paused=1, Live=2 (source of truth: state.rs)
const LIVE = Buffer.from([2]);
const [config] = PublicKey.findProgramAddressSync([Buffer.from('config')], PROGRAM_ID);

const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
const before = await connection.getAccountInfo(config);
if (!before || before.data[264] !== 0) {
  console.error(`unexpected pre-state saleState=${before ? before.data[264] : 'missing'} (need 0/Setup)`);
  process.exit(1);
}
console.log('pre-state: Setup confirmed');
const bal = await connection.getBalance(authority.publicKey);
if (bal < 0.01e9) throw new Error(`preflight: authority needs fee headroom (has ${(bal / 1e9).toFixed(4)} SOL)`);

const tx = new Transaction().add(new TransactionInstruction({
  programId: PROGRAM_ID,
  keys: [
    { pubkey: config, isSigner: false, isWritable: true },
    { pubkey: authority.publicKey, isSigner: true, isWritable: true },
  ],
  data: Buffer.concat([disc('set_claims_sale_state'), LIVE]),
}));
const sig = await sendAndConfirmTransaction(connection, tx, [authority]);
console.log(`set_claims_sale_state(Live): ${sig}`);

const after = await connection.getAccountInfo(config);
if (after.data[264] !== 2) throw new Error(`post-state saleState=${after.data[264]}, expected 2/Live`);
console.log('MAINNET SALE IS LIVE');
