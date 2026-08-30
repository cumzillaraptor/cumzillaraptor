# Mint page code review — 2026-08-29

Scope: `cumzillaraptors/mint/index.html`, `cumzillaraptors/client/wallet.js`,
`cumzillaraptors/client/chain.js`. Live devnet measurements included.

Program is healthy: sale live, 191 public ids free, simulation of a fresh id
returns `err: null`, 57,531 CU consumed of 200,000 (no compute-budget bump
needed), tx message 714 bytes (well under 1232).

Measured pre-popup latency (desktop, Helius proxy): **~1.0s total**
(`fetchLaunchState` 110ms, `pool-order.json` 149ms, `metadata-slim.json` 313ms,
`fetchAllocatedIds` 288ms, `getLatestBlockhash` 157ms). Data loading is NOT the
cause of the reported timeouts.

---

## C1 — CRITICAL: retry loop can stack multiple 1-SOL approvals (double-charge)

`sendWithRetry` (mint/index.html ~488) loops up to 3 times. On blockhash
expiry it fetches a new blockhash and calls `wc.signAndSend` again — but the
**previous Phantom approval request is never cancelled or invalidated**.

There is **no idempotency guard** anywhere in the page (verified: no receipt
check, no dedupe, no "already minted this id" test). Consequences:

- A slow user can be shown up to **3 separate 1-SOL approval prompts**.
- Any of the earlier prompts may still be approved afterwards and **land
  on-chain**, because the earlier blockhash may not have expired yet at the
  moment the user finally clicks.
- Two landing = user pays 2 SOL. The `AllocationIdAlreadyUsed` (6029) error
  only protects the *same* id; see C2 for why the id can differ.

Fix: make the flow single-shot. Do not silently re-open the wallet. On expiry,
surface "approval window expired — press roll again" and require a fresh user
gesture. If auto-retry is kept, first `getSignatureStatuses` for every
previously-produced signature and abort the retry if any landed.

## C2 — CRITICAL: retry re-signs the same tx, but a re-roll picks a different raptor

`rollNftId()` is called once per click (2 textual occurrences, 1 call site), so
the retry reuses the same id — good. However the reveal animation was already
started with that id, and on the *error* path the box resets while the earlier
approval may still be pending. If the user then clicks roll again, `rollNftId`
picks a **different random id**, so the stale approval (old id) and the new
approval (new id) are for two different raptors and both can succeed. Neither
`AllocationIdAlreadyUsed` nor any client check prevents this.

Fix: same as C1 — one in-flight mint at a time, tracked by signature, with a
hard block on starting a second roll while any signature is unresolved.

## H1 — HIGH: `preferSignOnly` regressed desktop UX (likely the reported symptom)

`wallet.js` ~225: when `preferSignOnly` is set, the code takes
`provider.signTransaction` and then `conn.sendRawTransaction(...)`. I added this
for mobile blockhash durability, but it now applies to **desktop too**.

Effect on the Phantom **extension**: `signAndSendTransaction` (the path used
before) shows the approval popup promptly and Phantom handles broadcast.
`signTransaction` + manual `sendRawTransaction` means the page holds the signed
bytes and submits them itself with `skipPreflight: false`, so the RPC re-runs
preflight *after* signing — adding latency between approval and landing, and
turning any RPC hiccup into a post-approval failure that reads as "timed out"
even though the user signed on time.

Fix: gate `preferSignOnly` to cases that actually need it (durable nonce, or
mobile in-app browsers), and keep `signAndSendTransaction` for the desktop
extension. Or set `skipPreflight: true` on the manual send since the page
already simulated the tx moments earlier (C3).

## H2 — HIGH: 30s poll can disable the Roll button mid-approval

`setInterval(refreshStatus, 30000)` (line 540) runs unconditionally — the mint
page has **no equivalent of claim's `claiming` guard** (verified:
`pausesPollWhileMinting: false`). `refreshStatus` calls `updateButtons()`, and
on any transient RPC failure it also overwrites the status line with
"devnet status unavailable", **wiping the "approve the 1 SOL payment" message
the user is currently acting on**. This matches the report that prompts
"don't appear until after it's too late" — the guidance text is being clobbered
every 30 seconds.

Fix: skip `refreshStatus` while `spinning` is true, and never let the poll
overwrite an active mint message.

## M1 — MEDIUM: double preflight wastes the approval window

Line 447 runs `conn.simulateTransaction(tx)` and then the manual send runs
preflight *again* server-side. Measured simulate cost: **~440-470ms**. Since the
page just simulated, the second preflight is redundant.

Fix: keep the explicit simulation (it produces good early errors) and send with
`skipPreflight: true`.

## M2 — MEDIUM: 330KB metadata fetched inside the click handler

`loadMeta()` pulls `metadata-slim.json` (**329,480 bytes**) on first roll,
inside the click handler, before the wallet popup. Measured 313ms on desktop
broadband; on a phone this is seconds of the approval budget spent before the
popup even opens.

Fix: prefetch pool-order + metadata at page load (or on wallet connect), not on
click.

## M3 — MEDIUM: `simulateTransaction` on a blockhash-less tx silently fetches one

Line 447 simulates before any blockhash is set. web3.js quietly fetches its own
blockhash for the simulation. It works, but it means the simulated tx is not the
tx the user signs, and it hides an extra RPC round-trip. Make it explicit.

## L1 — LOW: misleading comment

Lines 450-452 claim the blockhash is "fetched AFTER simulation and immediately
before the popup". That fetch was moved into `sendWithRetry` (line 492); the
comment now describes code that is not there.

## L2 — LOW: `isBlockhashExpired` over-matches

`/blockhash|block height|blockheight/i` on the raw message will also match an
unrelated error that merely mentions a blockhash, triggering a retry (and thus
C1's extra approval) for a non-expiry failure.

## L3 — LOW: hardcoded "246" in markup

Lines 153 and 161 hardcode the pool size while `cfg.publicCount` exists.
Diverges silently if the config changes.

---

## Recommended fix order

1. C1 + C2 — single-shot mint with signature tracking (money bug).
2. H2 — pause the poll while minting (fixes the clobbered message).
3. H1 — restore `signAndSendTransaction` on desktop extension.
4. M1 + M2 — `skipPreflight: true`, prefetch data at load.
5. L1-L3 — comments, error matching, config-driven counts.
