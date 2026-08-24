// cumzillaraptor shared wallet connector (browser).
// Covers the real-world matrix:
//   - Phantom (extension + mobile dapp browser): window.phantom.solana
//   - Solflare (extension + mobile dapp browser): window.solflare OR window.solana only
//   - Backpack, Glow, Exodus, Clover etc.: wallet-standard registration OR window.solana
//   - Wallet Standard apps (solana:signAndSendTransaction feature)
//   - Late injection: wallets inject after DOMContentLoaded; we listen for the standard's
//     "register" event and retry detection for a grace period.
//
// Usage:
//   import { createWalletConnector } from "/cumzillaraptors/<page>/wallet.js";
//   const wc = createWalletConnector({ onConnect, onDisconnect, onAccountChange });
//   await wc.connect();        // throws with a user-actionable message on failure
//   wc.publicKey               // PublicKey | null
//   wc.signAndSend(tx)         // -> signature string (tries provider API then wallet-standard then self-send)
import { Connection, PublicKey, Transaction, TransactionMessage, VersionedTransaction, SystemProgram } from "./web3-shim.js";
import { getMetamaskSolanaWallet } from "./metamask.js";

const DETECT_GRACE_MS = 2500;     // how long to wait for late-injecting wallets
const DETECT_POLL_MS = 150;

function looksLikeSolanaProvider(p) {
  return !!(p && (p.isPhantom || p.isSolflare || p.isConnected !== undefined) &&
            (typeof p.connect === "function" || p.publicKey));
}

export function detectProvider() {
  const w = window;
  // 1) Phantom namespace (most explicit)
  if (w.phantom?.solana && looksLikeSolanaProvider(w.phantom.solana)) {
    return { provider: w.phantom.solana, name: w.phantom.solana.isPhantom ? "Phantom" : "Phantom-compatible", kind: "legacy" };
  }
  // 2) Solflare namespace
  if (w.solflare && looksLikeSolanaProvider(w.solflare)) {
    return { provider: w.solflare, name: "Solflare", kind: "legacy" };
  }
  // 3) Generic window.solana (Backpack, Glow, Exodus, some Solflare builds)
  if (w.solana && looksLikeSolanaProvider(w.solana)) {
    const n = w.solana.isPhantom ? "Phantom" : w.solana.isSolflare ? "Solflare"
            : w.solana.isBackpack ? "Backpack" : w.solana.isExodus ? "Exodus"
            : w.solana.name || "Solana wallet";
    return { provider: w.solana, name: n, kind: "legacy" };
  }
  return null;
}

// Wallet-standard providers register via window.addEventListener("wallet-standard:app-ready")
// and expose navigator.wallets (or window.walletStandard in older builds).
function detectStandardWallets() {
  const out = [];
  const wallets = navigator.getWallets?.() ?? window.walletStandard?.wallet?.get?.() ?? [];
  for (const w of wallets) {
    if (!w?.name) continue;
    out.push(w);
  }
  return out;
}

function standardConnectFeature(wallet) {
  return wallet.features?.["standard:connect"] ?? null;
}

export function createWalletConnector({ rpcUrl, onConnect, onDisconnect, onAccountChange } = {}) {
  let provider = null;       // legacy provider object or wallet-standard wallet
  let kind = null;           // "legacy" | "standard"
  let publicKey = null;      // PublicKey | null
  let conn = rpcUrl ? new Connection(rpcUrl, "confirmed") : null;

  function emitConnect(pk) {
    publicKey = pk;
    try { onConnect?.(pk); } catch {}
  }

  async function waitForLateInjection(deadline = DETECT_GRACE_MS) {
    const start = Date.now();
    while (Date.now() - start < deadline) {
      const found = detectProvider();
      if (found) return found;
      if (detectStandardWallets().length) return { standardOnly: true };
      await new Promise((r) => setTimeout(r, DETECT_POLL_MS));
    }
    return null;
  }

  // Returns { status: "ok" } or throws Error with a user-actionable message.
  async function connect() {
    // Already connected?
    if (publicKey) return { status: "ok", publicKey, reused: true };

    let found = detectProvider();
    if (!found) found = await waitForLateInjection();

    // ---- wallet-standard path ----
    if (found?.standardOnly || (!found && detectStandardWallets().length)) {
      const wallets = detectStandardWallets();
      if (wallets.length === 1) {
        const w = wallets[0];
        const feat = w.features?.["standard:connect"];
        if (!feat) throw new Error(w.name + " does not expose a connect feature.");
        const res = await feat.connect({ silent: false });
        const addr = res?.accounts?.[0]?.address;
        if (!addr) throw new Error(w.name + " returned no account.");
        kind = "standard"; provider = w;
        emitConnect(new PublicKey(addr));
        return { status: "ok", publicKey };
      }
      // multiple standard wallets: fall through to asking user via legacy path or error
      throw new Error("Multiple wallets detected (" + wallets.map((w) => w.name).join(", ") +
        "). Disable extras or use the wallet you want.");
    }

    // ---- MetaMask Connect Solana fallback ----
    // Current MetaMask does not inject window.solana; its Solana support is a
    // Wallet-Standard wallet created via @metamask/connect-solana. Try it
    // whenever no dedicated Solana wallet was found.
    if (!found) {
      // Hard platform limit (MetaMask docs): MetaMask mobile supports Solana
      // MAINNET only — devnet/testnet exist solely in the desktop extension.
      // On devnet the connect would never succeed, so fail fast with guidance.
      const isMmMobile = /MetaMaskMobile|MetaMask\s*\/.*Mobile/i.test(navigator.userAgent) ||
        (!!window.ethereum?.isMetaMask && /Android|iPhone|iPad/i.test(navigator.userAgent));
      if (isMmMobile && rpcUrl && /devnet/i.test(rpcUrl)) {
        throw new Error(
          "MetaMask mobile cannot reach Solana devnet (mainnet-only on mobile). " +
          "For this beta: open this page in the Phantom app, or use a desktop browser with the MetaMask extension."
        );
      }
      try {
        const mmWallet = await getMetamaskSolanaWallet(rpcUrl);
        const feat = mmWallet?.features?.["standard:connect"];
        if (feat) {
          // Timeout: if MetaMask isn't actually installed/unlocked, the SDK
          // waits forever for a popup that never appears.
          const res = await Promise.race([
            feat.connect({ silent: false }),
            new Promise((_, rej) => setTimeout(() => rej(new Error(
              "no response from MetaMask — make sure the MetaMask extension is installed and unlocked"
            )), 45000)),
          ]);
          const addr = res?.accounts?.[0]?.address;
          if (!addr) throw new Error("MetaMask returned no account.");
          kind = "standard"; provider = mmWallet;
          emitConnect(new PublicKey(addr));
          return { status: "ok", publicKey };
        }
      } catch (e) {
        throw new Error(
          "No Solana wallet detected, and connecting through MetaMask failed: " +
          String(e?.message || e) +
          " — install the Phantom or Solflare extension, or make sure the MetaMask extension is installed and unlocked."
        );
      }
    }

    // ---- legacy path ----
    if (!found) {
      throw new Error(
        "No Solana wallet detected. Open this page inside Phantom or Solflare's dapp browser " +
        "(mobile), or install the browser extension and reload."
      );
    }
    provider = found.provider;
    kind = found.kind;

    // Already authorized? Use existing key without a popup (handles blocked-popup cases).
    if (provider.publicKey) {
      emitConnect(new PublicKey(provider.publicKey.toBase58 ? provider.publicKey.toBase58() : provider.publicKey));
      return { status: "ok", publicKey, reused: true };
    }

    try {
      const res = await Promise.race([
        provider.connect(),
        new Promise((_, rej) => setTimeout(() => rej(new Error(
          "The wallet did not respond. If no popup appeared, allow popups for this site, then retry.")), 30000)),
      ]);
      const pkRaw = res?.publicKey ?? provider.publicKey;
      if (!pkRaw) throw new Error("Wallet connected but returned no public key.");
      emitConnect(new PublicKey(pkRaw.toBase58 ? pkRaw.toBase58() : pkRaw));
    } catch (e) {
      const msg = String(e?.message || e);
      if (/UserRejected|user rejected|denied/i.test(msg)) throw new Error("Connection request was rejected in the wallet.");
      throw e;
    }

    // keep up with account switches
    if (provider.on && !provider.__cumzWired) {
      provider.__cumzWired = true;
      try {
        provider.on("accountChanged", (acc) => {
          if (!acc) { publicKey = null; try { onDisconnect?.(); } catch {} return; }
          try { onAccountChange?.(new PublicKey(acc.toBase58 ? acc.toBase58() : acc)); } catch {}
          try { publicKey = new PublicKey(acc.toBase58 ? acc.toBase58() : acc); onConnect?.(publicKey); } catch {}
        });
        provider.on("disconnect", () => { publicKey = null; try { onDisconnect?.(); } catch {} });
      } catch {}
    }
    return { status: "ok", publicKey };
  }

  async function disconnect() {
    try { await provider?.disconnect?.(); } catch {}
    publicKey = null;
    try { onDisconnect?.(); } catch {}
  }

  // Send a Transaction (legacy) or { tx, lookupTablePubkey? } envelope: tries, in order:
  //   1. provider.signAndSendTransaction (Phantom/Solflare extension & most mobile browsers)
  //   2. provider.signTransaction then self-send via RPC (some extension configs)
  //   3. wallet-standard solana:signAndSendTransaction feature
  // When a lookupTablePubkey is given with a legacy tx, the message is compiled
  // to v0 so large instructions fit the 1232-byte packet limit.
  async function signAndSend(transactionOrEnvelope) {
    if (!publicKey) throw new Error("Not connected.");
    let transaction = transactionOrEnvelope;
    if (transactionOrEnvelope && !transactionOrEnvelope.recentBlockhash &&
        transactionOrEnvelope.tx && transactionOrEnvelope.message) {
      // already a prepared v0 envelope: { tx (VersionedTransaction), message }
      transaction = transactionOrEnvelope.tx;
    }

    // 1) convenience API
    if (typeof provider.signAndSendTransaction === "function") {
      const res = await provider.signAndSendTransaction(transaction);
      return typeof res === "string" ? res : res.signature;
    }
    // 2) sign-only API
    if (typeof provider.signTransaction === "function") {
      const signed = await provider.signTransaction(transaction);
      return conn.sendRawTransaction(signed.serialize());
    }
    // 3) wallet-standard
    if (kind === "standard") {
      const feat = provider.features?.["solana:signAndSendTransaction"];
      const acct = (await provider.features["standard:connect"].connect({ silent: true }))?.accounts?.[0];
      if (feat && acct) {
        // wallet-standard takes raw message bytes; serialize without signatures
        const bytes = transaction.serializeMessage();
        const res = await feat.signAndSendTransaction({
          account: acct,
          transaction: bytes,
          chain: "solana:devnet",
        });
        return typeof res === "string" ? res : res.signature;
      }
    }
    throw new Error("Connected wallet cannot send transactions (no sign method found).");
  }

  return {
    connect, disconnect, signAndSend,
    get publicKey() { return publicKey; },
    get walletName() {
      if (kind === "standard") {
        return provider?.name === "MetaMask (via MetaMask Connect)" ? "MetaMask" : provider?.name || "wallet";
      }
      return detectProvider()?.name || "wallet";
    },
  };
}
