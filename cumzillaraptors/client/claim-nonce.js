// Durable-nonce helpers for the claim page (browser).
// A claim tx that begins with AdvanceNonceAccount and whose recentBlockhash
// equals the nonce account's stored hash NEVER expires on its own — the user
// can take as long as they like to approve in their wallet.
import {
  PublicKey, SystemProgram, TransactionInstruction, Transaction,
} from "./web3-shim.js";

const NONCE_SEED = "cumz-claim-nonce";
const SYSTEM_PROGRAM_ID = SystemProgram.programId;

// Deterministic nonce address per claimer wallet. createWithSeed is async in
// web3.js 1.x, so this returns a Promise.
export function claimNonceAddress(claimerPubkey) {
  const pk = typeof claimerPubkey === "string" ? new PublicKey(claimerPubkey) : claimerPubkey;
  return PublicKey.createWithSeed(pk, NONCE_SEED, SYSTEM_PROGRAM_ID);
}

// Fetch + decode the nonce account at `address`. Returns null when missing or
// not an initialized nonce.
//
// REAL on-chain nonce layout (80 bytes, verified against
// NonceAccount.fromAccountData on live devnet 2026-08-29):
//   version    u32le @0   (1)
//   state      u32le @4   (0 = Uninitialized, 1 = Initialized)
//   authority  32b   @8..40
//   nonce hash 32b   @40..72
//   feeCalculator u64le @72..80
//
// A previous version of this decoder read state@0 / authority@4 / hash@36 and
// therefore saw version(1) as the state, rejected every real nonce account as
// "not initialized", and made the page try to CREATE an account that already
// existed ("already in use", custom program error 0x0).
export const NONCE_ACCOUNT_SPAN = 80;
const NONCE_STATE_INITIALIZED = 1;

export function decodeClaimNonceData(data) {
  if (!data || data.length < NONCE_ACCOUNT_SPAN) return null;
  const state = data.readUInt32LE(4);
  if (state !== NONCE_STATE_INITIALIZED) return null;
  return {
    version: data.readUInt32LE(0),
    authorityBytes: data.slice(8, 40),
    blockhashBytes: data.slice(40, 72),
  };
}

export async function fetchClaimNonce(conn, address) {
  const info = await conn.getAccountInfo(address);
  if (!info || !info.owner.equals(SYSTEM_PROGRAM_ID)) return null;
  const decoded = decodeClaimNonceData(info.data);
  if (!decoded) return null;
  return {
    address,
    authority: new PublicKey(decoded.authorityBytes),
    // stored "nonce" IS a recent-blockhash-shaped value
    blockhash: new PublicKey(decoded.blockhashBytes).toString(),
    lamports: info.lamports,
  };
}

export function advanceNonceInstruction(nonceAddress) {
  return SystemProgram.nonceAdvance({ noncePubkey: nonceAddress });
}

// Build the setup tx: create the nonce account AT the user's derived address,
// funded and owned-by-authority = the user. User pays rent (~0.0015 SOL) —
// trustless, no deployer custody involved.
export async function buildSetupNonceTx({ conn, claimer }) {
  const address = await claimNonceAddress(claimer);
  const existing = await fetchClaimNonce(conn, address);
  if (existing) return { exists: true, address };
  // The account may exist without decoding as an initialized nonce (e.g. a
  // partially-completed setup). Creating it again fails with the System
  // program's opaque "already in use" / custom program error 0x0, so detect
  // that here and report something actionable instead.
  const raw = await conn.getAccountInfo(address);
  if (raw) {
    throw new Error(
      'your claim setup account already exists but is not a usable nonce ' +
      '(' + address.toString() + ') — contact support rather than retrying.',
    );
  }
  const { blockhash } = await conn.getLatestBlockhash('confirmed');
  const tx = new Transaction();
  const LAMPORTS_RENT = 1_500_000; // rent-exempt minimum for a nonce account
  tx.add(
    SystemProgram.createAccountWithSeed({
      fromPubkey: claimer,
      basePubkey: claimer,
      seed: NONCE_SEED,
      newAccountPubkey: address,
      lamports: LAMPORTS_RENT,
      space: 80, // NonceAccountLayout.span
      programId: SYSTEM_PROGRAM_ID,
    }),
    SystemProgram.nonceInitialize({
      noncePubkey: address,
      authorizedPubkey: claimer,
    }),
  );
  tx.recentBlockhash = blockhash;
  tx.feePayer = claimer;
  return { exists: false, address, tx };
}

// Build a durable claim tx: advance-nonce first, then the program instruction.
// The recentBlockhash MUST be the nonce's currently-stored hash.
export async function buildDurableClaimTx({ nonceInfo, claimIx, payer }) {
  const tx = new Transaction();
  tx.add(advanceNonceInstruction(nonceInfo.address));
  tx.add(claimIx);
  tx.recentBlockhash = nonceInfo.blockhash;
  tx.feePayer = payer;
  return tx;
}
