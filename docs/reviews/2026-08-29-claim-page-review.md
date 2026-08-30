# Claim page code review — 2026-08-29

Scope: `cumzillaraptors/claim/index.html`, `cumzillaraptors/client/claim-nonce.js`,
`chain.js`, `wallet.js`. All findings measured against live devnet.

Healthy baseline: 174 claim ids across 77 wallets, **zero** missing metadata,
zero missing merkle proofs, zero placeholder URIs, no duplicate/unmapped ids.
Chunking maps every id to exactly one signature chunk. The 60s status poll IS
correctly guarded (`setInterval(() => { if (!claiming) refreshStatus(); }, 60000)`)
— the mint page's H2 bug does not exist here.

---

## C1 — CRITICAL: 64-id batches exceed the 1232-byte packet limit

Measured serialized sizes for a real claim tx with the shared 4-address ALT:

| batch ids | durable (nonce) | legacy (blockhash) |
|---|---|---|
| 16 | 1184 | 1110 |
| 24 | 1200 | 1126 |
| 32 | 1216 | 1142 |
| **40** | **1232** (exactly at limit) | 1158 |
| 48 | 1248 ✗ | 1174 |
| 56 | 1264 ✗ | 1190 |
| **64** | **1280 ✗ (+48 over)** | 1206 |

`MAX_BATCH_IDS = 64` (chain.js:145) was sized for the **legacy** path, which fits
at 1206. The durable-nonce path adds the `nonceAdvance` instruction plus the
nonce, authority and recent-blockhashes keys — **+74 bytes** — pushing 64 ids to
1280. Since relaxed claiming is now mandatory (commit `aef11cc`), every large
wallet takes the durable path and is hard-blocked.

**Largest durable batch that fits: 40 ids.**

Affected: **1 of 77 wallets — `0xb0e68342…` with 87 claims** (chunks 64 + 23).
That is the owner's own claim wallet, which is why this has not been reported by
anyone else. All other wallets have ≤40 claims per chunk and work.

Worse, the size guard (`transaction still too large after compression`) throws
**inside `claimOne`, after** the user has already signed both Ethereum messages
and after `ensureClaimNonce` spent ~0.0015 SOL. Verified:
`prechecksSizeBeforeSigning: false`. The user pays and signs, then hits a wall.

Fix: reduce `MAX_BATCH_IDS` to a durable-safe value (32 gives 16 bytes headroom;
40 is exact and fragile). Chunking, message building and the id→chunk mapping all
key off the constant, so lowering it is contained — but note the **signed message
covers the chunk**, so re-chunking changes what must be signed. Additionally,
pre-flight the largest chunk's serialized size *before* requesting any signature
and fail with an actionable message.

## C2 — CRITICAL: durable claim retry can double-claim (same class as mint C1)

`claimOne`'s **legacy** branch correctly recovers from a false expiry: it calls
`getSignatureStatuses([sig], {searchTransactionHistory:true})` and treats a landed
tx as success (lines 578-588). Verified `legacy_hasLandedCheck: true`.

The **durable** branch has no such check (`durable_hasLandedCheck: false`). It
does `sendRawTransaction` then `confirmTransaction({signature})`. If that confirm
throws for any transient reason, the outer loop (lines 409-425) classifies the
error and **retries the whole claim** — re-signing and re-submitting.

This is more dangerous than the mint case: a durable-nonce transaction **never
expires**, so the first submission stays valid indefinitely. A retry can land a
second transaction for the same raptor. The on-chain receipt PDA prevents a true
double-mint (the second tx fails), but the user pays fees for a guaranteed-failing
transaction and sees a confusing error after a claim that actually succeeded.

Also, the outer loop does not track which signature belongs to which attempt
(`outerRetryTracksSigs: false`), so it cannot report what landed.

Fix: mirror the mint fix — collect every signature produced for the entry, and
before any retry check them all with `searchTransactionHistory`. Treat a landed
signature as success. For durable txs, an "expired" classification is always
wrong; do not retry on expiry there.

## H1 — HIGH: expiry retry on a durable tx is logically impossible

Lines 416-419 retry when the message matches `/block height exceeded|expired/`.
A durable-nonce transaction cannot expire by design. Matching that pattern in the
durable path means a *different* failure was misclassified as expiry and gets
retried up to 2 extra times — burning fees and risking C2. Verified the durable
confirm has no blockheight deadline attached.

Fix: branch the retry policy on `durable`. Retry expiry only in the legacy path.

## H2 — HIGH: eligibility is never re-checked before claiming

Receipt PDAs are read once during `maybeCheckEligibility`
(`rechecksReceiptsBeforeClaim: false`). A user who leaves the tab open, or claims
from another device/session, will submit claims for raptors already claimed. Those
transactions fail on-chain after the wallet approval — fees spent, confusing error.

Fix: re-read receipt PDAs immediately before the claim loop and drop
already-claimed entries (the data is one `getMultipleAccountsInfo` call).

## M1 — MEDIUM: `var blockhashInfo` inside an `if` block

Line 555 declares `var blockhashInfo` inside the `else` branch and reads it later
at line 576. It works only because `var` is function-scoped. In the durable path
it is `undefined`, and the legacy confirm spreads it (`...blockhashInfo`). Fragile
and confusing; use a `let` declared beside `tx`/`durable`.

## M2 — MEDIUM: 4 × `innerHTML` assignments with interpolated values

`innerHTML` is used 4 times, including `$('v-collection')`/status with on-chain
values and `eligibility-result` with a count. Current inputs are numbers and
base58 from the chain, so not exploitable today, but `claims-by-eth.json` keys are
attacker-influenced in principle. Prefer `textContent` + element construction (the
per-row code below it already does this correctly).

## M3 — MEDIUM: ethers loaded from CDN at signing time

`https://esm.sh/ethers@6.13.4` is imported lazily inside the Ethereum signing
handler. A CDN failure blocks claiming at the worst moment. It is caught with a
readable message, but the project already vendors web3.js and js-sha3 locally —
vendor ethers too, or vendor a minimal `personal_sign` path.

## M4 — MEDIUM: rate-limit backoff can wait ~50s with no cancel

The backoff sleeps 5+10+15+20 = 50s across attempts with no way to abort and no
countdown. Combined with 87 sequential claims this is a long opaque stall. Add a
cancel affordance or surface remaining time.

## L1 — LOW: `prettyError` leaks stack frames to the UI

Lines 610-615 append `e.stack`'s first line and `JSON.stringify(e.error)` to the
user-visible message. Useful while debugging, noisy for users. Log the detail to
console; show the clean message.

## L2 — LOW: eligibility failure is silently downgraded

If the receipt lookup throws, the code `console.warn`s and treats **all** raptors
as unclaimed (line 293). The user then attempts already-claimed raptors and pays
fees for failures. Surface a warning in the UI instead of silently continuing.

## L3 — LOW: `refreshStatus` overwrites the status bar on failure

Unlike the message area, `stat-bar` is replaced with "devnet status unavailable"
on any transient RPC error, even mid-claim. The poll is guarded by `claiming`, but
the initial call and the post-claim `refreshStatus()` are not.

---

## Recommended fix order

1. **C1** — lower `MAX_BATCH_IDS` to a durable-safe 32 and pre-check size before
   any signature. Without this the owner's 87-claim wallet cannot claim at all.
2. **C2 + H1** — landed-signature check in the durable path; no expiry retry there.
3. **H2** — re-read receipts immediately before claiming.
4. **M1** — scope `blockhashInfo` properly.
5. **M2-M4**, then **L1-L3**.
