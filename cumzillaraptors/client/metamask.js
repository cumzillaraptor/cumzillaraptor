// cumzillaraptor MetaMask Solana bridge (browser).
//
// Current MetaMask does not inject `window.solana`; its Solana support is
// exposed through @metamask/connect-solana, which implements the Solana
// Wallet Standard. This shim lazily initializes the vendored SDK
// (assets/vendor/metamask-connect-solana-2.1.1.iife.js, global
// `MetaMaskConnectSolana`) and returns a Wallet-Standard wallet that the
// shared connector (wallet.js) already knows how to drive:
//   features: standard:connect, solana:signAndSendTransaction, ...
//
// Notes from MetaMask docs (verified 2026-08-24):
//   - devnet/testnet are supported ONLY in the MetaMask browser extension;
//     mobile MetaMask supports mainnet only.
//   - supportedNetworks takes plain names mapped to RPC URLs; no Infura key needed.
'use strict';

let clientPromise = null;   // Promise<SolanaClient> | null

function sdkAvailable() {
  return typeof window.MetaMaskConnectSolana?.createSolanaClient === 'function';
}

export function metamaskSolanaSupported() {
  // We can always *try*: on desktop with the extension installed it registers
  // into the wallet-standard registry; without MetaMask the connect call will
  // fail with a relay/onboarding error which we surface as a user message.
  return true;
}

// Returns a Wallet-Standard wallet object for MetaMask (memoized).
export async function getMetamaskSolanaWallet(rpcUrl) {
  if (!sdkAvailable()) {
    throw new Error('MetaMask Solana support failed to load. Check your connection and reload.');
  }
  if (!clientPromise) {
    const { createSolanaClient } = window.MetaMaskConnectSolana;
    clientPromise = createSolanaClient({
      dapp: {
        name: 'Cumzillaraptors',
        url: window.location.origin,
      },
      api: {
        supportedNetworks: {
          devnet: 'https://api.devnet.solana.com',
          mainnet: 'https://api.mainnet-beta.solana.com',
        },
      },
      analytics: { enabled: false },
    }).catch((e) => {
      clientPromise = null; // allow retry after a transient failure
      throw e;
    });
  }
  const client = await clientPromise;
  await client.registerWallet().catch(() => {}); // ensure registry entry even past grace timer
  return client.getWallet();
}
