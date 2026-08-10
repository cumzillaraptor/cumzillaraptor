#!/usr/bin/env node
import { PublicKey } from '@solana/web3.js';
import { COLLECTION_URI, CORE_PROGRAM_ID, TREASURY } from './verify-core-collection.mjs';

const PROGRAM_ID = new PublicKey('AYE4iC2gp81H8jvMjk4EGxWP2sJFzuDptUwxqwTZYTMY');
const [configPda] = PublicKey.findProgramAddressSync([Buffer.from('config')], PROGRAM_ID);
const dryRun = process.argv.includes('--dry-run');

function validate() {
  if (COLLECTION_URI.includes('PLACEHOLDER') || !/^ar:\/\/[A-Za-z0-9_-]{43}$/.test(COLLECTION_URI)) throw new Error('Collection URI must be a permanent production ar:// URI.');
  new PublicKey(CORE_PROGRAM_ID);
  new PublicKey(TREASURY);
}

try {
  validate();
  const plan = {
    cluster: 'devnet', coreProgram: CORE_PROGRAM_ID, programId: PROGRAM_ID.toBase58(),
    updateAuthority: configPda.toBase58(), collectionName: 'cumzillaraptors', collectionUri: COLLECTION_URI,
    royaltyRecipient: TREASURY, royaltyBasisPoints: 500,
  };
  if (dryRun) {
    console.log('DRY RUN ONLY — No transaction will be signed or sent.');
    console.log(JSON.stringify(plan, null, 2));
  } else {
    // Fail closed before reading or parsing any key material. Live creation is a later explicit action.
    throw new Error('Refusing live creation: run the reviewed x86 validation gate and obtain explicit pre-send approval.');
  }
} catch (error) { console.error(`COLLECTION PLAN ERROR: ${error.message}`); process.exitCode = 1; }
