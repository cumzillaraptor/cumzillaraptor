// cumzillaraptor site configuration.
// NETWORK flips every page between devnet and mainnet later — nothing else should change.
window.CUMZ_CONFIG = {
  network: "devnet",
  rpcUrl: "https://api.devnet.solana.com", // public RPC for the browser; Helius key never ships in static JS
  programId: "AYE4iC2gp81H8jvMjk4EGxWP2sJFzuDptUwxqwTZYTMY",
  mplCoreProgramId: "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d",
  treasury: "FiHKQhwq2ZKkD2ZbBf3mPYgyw2Y9QDzNYykpMGErovU6",
  launchAuthority: "71WBrLfntE4yjTxEuQ3EgGJKE8zzZUgeEm5tkLi5Jx2r",
  // Filled live from the config PDA at runtime (launch setup pending):
  collection: null,
  priceLamports: 1000000000, // 1 SOL
  publicCount: 246,
  claimCount: 174,
  expiryUnix: 2000000000,
  pages: {
    home: "/",
    mint: "/mint/",
    claim: "/claim/",
  },
};
