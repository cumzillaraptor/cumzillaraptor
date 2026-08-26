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
// not an initialized nonce. Manual decode (no NonceAccount import needed):
//   state u32le @0  (2 = Initialized, 4 = InitializedWithFeeCalculator-era values vary by version)
//   authorized pubkey @4..36
//   durable blockhash @36..68
export async function fetchClaimNonce(conn, address) {
  const info = await conn.getAccountInfo(address);
  if (!info || !info.owner.equals(SYSTEM_PROGRAM_ID) || info.data.length < 68) return null;
  const state = info.data.readUInt32LE(0);
  if (state !== 2 && state !== 4) return null; // Uninitialized=0, Initialized=2 per layout enum
  const w = (typeof window !== "undefined" && window.solanaWeb3) || null;
  if (!w) throw new Error("solanaWeb3 not loaded");
  return {
    address,
    authority: new w.PublicKey(info.data.slice(4, 36)),
    // stored "nonce" IS a recent-blockhash-shaped value
    blockhash: new w.PublicKey(info.data.slice(36, 68)).toString(),
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
