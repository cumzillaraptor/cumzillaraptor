// ES module shim over @solana/web3.js — works in browser AND node.
// Browser: include /assets/vendor/solana-web3-*.iife.js before any module import; it sets window.solanaWeb3.
// Node (tests/scripts): falls back to node_modules via createRequire.
let w;
if (typeof window !== "undefined" && window.solanaWeb3) {
  w = window.solanaWeb3;
} else {
  // node only — guarded so bundlers/browsers never hit it
  const { createRequire } = await import("node:module").then((m) => m).catch(() => ({}));
  if (createRequire) {
    w = createRequire(import.meta.url)("@solana/web3.js");
  }
}
if (!w) throw new Error("solana-web3 not available (vendor IIFE not loaded and not in node)");
export const {
  Connection, PublicKey, SystemProgram, Transaction, TransactionInstruction,
  TransactionMessage, VersionedTransaction,
} = w;
export default w;
