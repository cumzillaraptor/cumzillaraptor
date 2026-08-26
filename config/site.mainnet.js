// cumzillaraptor MAINNET site configuration.
// Activated by the build script only when explicitly requested (CUMZ_SITE_VARIANT=mainnet).
// Default build stays devnet until cutover day.
window.CUMZ_CONFIG = {
  network: "mainnet-beta",
  cluster: "mainnet", // must match the deployed program's Cargo feature tag
  rpcUrl: "https://api.mainnet-beta.solana.com", // public RPC for the browser; paid keys never ship in static JS
  programId: null, // FILLED after mainnet deploy (Phase 2) — refuse to ship a placeholder
  mplCoreProgramId: "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d",
  treasury: "FiHKQhwq2ZKkD2ZbBf3mPYgyw2Y9QDzNYykpMGErovU6",
  launchAuthority: null, // FILLED from docs/operations/mainnet-decisions-v1.md when authority keypair is generated
  // Filled live from the config PDA at runtime (launch setup pending):
  collection: null,
  claimLookupTable: null, // mainnet LUT created during Phase 1.5/4 prep if needed
  priceLamports: 1000000000, // 1 SOL
  publicCount: 246,
  claimCount: 174,
  expiryUnix: 2000000000,
  pages: {
    home: "/",
    mint: "https://mint.cumzillaraptor.com/",
    claim: "https://claim.cumzillaraptor.com/",
  },
};
