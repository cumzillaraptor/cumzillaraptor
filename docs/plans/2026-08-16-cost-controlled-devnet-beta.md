# Cumzillaraptor Cost-Controlled Devnet Beta Plan

**Goal:** Prove the existing Solana NFT program works in x86 CI, perform one bounded devnet rehearsal, then enable a clearly labelled devnet-only mint/claim client—without reopening TPM work or starting new security architecture.

**Budget rule:** No task may create a new numbered security gate, infrastructure subsystem, or host-hardening project. If a blocker cannot be resolved in one focused investigation, stop and present the blocker plus cost/benefit before doing more work.

**Explicitly stopped:** TPM/replay-store branch. `/dev/tpmrm0` was reported missing; there is no fallback. It is not a launch prerequisite.

## Current verified baseline and blockers

- `Anchor.toml` targets devnet program `AYE4iC2gp81H8jvMjk4EGxWP2sJFzuDptUwxqwTZYTMY`.
- `.github/workflows/build-program.yml` is a manual x86 workflow that builds SBPF and runs Bankrun initialization, collection, and atomic claim/Core-CPI gates.
- The public `cumzillaraptors/index.html` intentionally keeps mint and claim disabled.
- Repository test suite last passed locally: 427 passed, 0 failed, 7 expected skips.
- Historical x86 claim evidence is not current devnet evidence and must not be treated as deployment approval.
- **Critical product gap:** the on-chain instruction set has `claim_nft` but no public `mint_nft` instruction. `public_minted` is not incremented by any public-mint flow. A full public devnet beta is therefore blocked until public mint is built and proven in x86 CI.
- **Allocation reconciled:** the program, canonical allocation/test material, regenerated legacy artifacts, and disabled collection page now agree on `246 public / 174 claim`; #360 remains reserved for the supplied ETH holder.
- Existing deployment preflight/review constants are historical and must not be used as proof for the current artifact.

## Phase 0 — Freeze scope and normalize launch facts

**Outcome:** Work is limited to a public devnet beta, not a production launch.

1. Keep all TPM files as historical records; make no further TPM changes.
2. Do not start mainnet, payment-processing, new database, server, multi-sig, or optimizer work.
3. Do not turn on public mint/claim buttons until the public-mint and claim gates both pass.
4. Every external-cost action requires a one-line estimate and explicit approval first: devnet transaction fees, Arweave/Irys uploads, paid RPC usage, or contractor services.

**Go/no-go:** If this scope is acceptable, proceed to Phase 1. Otherwise pause.

## Phase 1 — One x86 CI truth run

**Outcome:** A fresh reproducible SBPF artifact and all existing behavioral gates pass at the current Git revision.

1. Trigger the existing manual workflow `.github/workflows/build-program.yml` on `main`.
2. Inspect only the workflow result and retained artifacts/logs:
   - SBPF artifact;
   - build-revision marker;
   - Bankrun initialization gate;
   - Bankrun collection gate;
   - atomic secp-to-claim/Core-CPI gate.
3. Record the Git revision, run URL, artifact SHA-256, and pass/fail result in one concise evidence note.

**Stop rule:** Any workflow failure stops the plan. Fix only the failing program/test issue; do not redesign unrelated systems.

**Spend:** $0 other than existing GitHub usage.

## Phase 2 — Implement the missing public-mint product path ($0 engineering)

**Outcome:** The program can atomically mint an unallocated public-pool NFT for the fixed 1 SOL price, while the existing claim path remains intact.

1. Reconcile the canonical allocation count and update the static page/docs before writing mint code.
2. Add one narrowly scoped public-mint instruction that:
   - accepts only an unallocated public-pool ID;
   - rejects claim-pool IDs and duplicate allocation;
   - transfers the reviewed 1 SOL price to the reviewed treasury;
   - creates the Core asset atomically;
   - marks the allocation and increments `public_minted` only after successful Core creation.
3. Add focused negative tests for wrong pool, repeat mint, wrong price/treasury, bad accounts, and Core-CPI rollback.
4. Extend the x86 workflow with a real private-validator public-mint gate.

**Go/no-go:** The current-commit x86 workflow must prove both public mint and claim. If it requires a backend, paid dependency, or broader redesign, stop and present the tradeoff.

## Phase 3 — One bounded devnet rehearsal

**Outcome:** Validate exactly one collection setup, one controlled public mint, and one controlled ETH claim on devnet before exposing a public client.

1. Create a pre-send checklist from the fresh Phase 1 and Phase 2 artifact:
   - exact Git revision and artifact digest;
   - program ID;
   - payer public key and available devnet balance;
   - launch authority public key;
   - proposed collection address and permanent metadata URI map;
   - canonical allocation manifest/root/counts;
   - exact instruction list, accounts, and estimated SOL cost.
2. Present the checklist and cost estimate for approval. Do not sign or send before approval.
3. After approval, execute only the approved devnet transaction(s):
   - initialize/configure the launch state;
   - initialize allocation registry;
   - create the Metaplex Core collection;
   - read-only verify collection authority/royalty state;
   - run one controlled public mint;
   - run one controlled eligible ETH claim.
4. Record transaction signatures, resulting addresses, owner/authority/royalty checks, allocation/receipt state, actual fees, and test results in a short devnet evidence note.

**Stop rule:** Any rejected transaction, state mismatch, unexpected fee, or failed verification stops the plan. No retry loop without a new explanation and approval.

**Spend cap:** Agree a devnet SOL cap before signing. No real-money mainnet spend.

## Phase 4 — Minimal devnet client

**Outcome:** Replace the disabled buttons only after the actual devnet program/collection facts are verified.

1. Keep the existing static site and Cloudflare Pages deployment model; do not migrate frameworks.
2. Add a small IDL-based wallet client that can:
   - connect a wallet on devnet only;
   - display the exact program ID, collection address, price, recipient, and transaction summary before signing;
   - construct public-mint and claim transactions only from verified launch data;
   - show clear errors without exposing secrets.
3. Add only three browser-visible states:
   - disconnected;
   - devnet ready;
   - transaction submitted/confirmed or failed.
4. Test the page locally and on Cloudflare Pages with buttons still clearly marked **Devnet beta**.

**Stop rule:** If the client needs a backend, database, paid API, or custom signing service, stop and decide before adding it. Do not add one by default.

**Spend:** $0 with the existing Cloudflare Pages static deployment; wallet users pay only normal devnet fees.

## Phase 5 — Invite-only public devnet beta

**Outcome:** Real users can try the exact devnet flow without any claim of mainnet readiness.

1. Publish a clear banner: "Devnet beta — no real-value purchase; test SOL only."
2. Limit testing to a small group and a fixed short window.
3. Collect only actionable reports: wallet/browser, transaction signature, visible error, and steps taken.
4. Triage defects into:
   - contract/state issue;
   - client UX issue;
   - wallet/RPC transient issue.
5. Fix only confirmed launch blockers. Defer polish, features, and optional hardening.

**Exit criteria:** At least one successful independent public mint and one successful independent eligible claim; no unresolved ownership, allocation, authority, or royalty mismatch.

## Phase 6 — Mainnet decision, not deployment

**Outcome:** A plain-language go/no-go decision with a real cost estimate.

Before any mainnet work, prepare a one-page decision brief containing:

- devnet evidence summary;
- unresolved bugs and risks;
- exact metadata-storage cost;
- estimated setup, collection, mint, and transaction costs;
- authority/treasury public keys for user verification;
- recovery/rollback limitations;
- whether a security review is worth its price at the intended raise.

**Rule:** Mainnet deployment, real SOL collection, authority changes, and mint enablement each require separate explicit approval.

## Priority order

1. Normalize allocation and launch facts.
2. Fresh x86 CI pass for the current claim path.
3. Implement and x86-validate public mint.
4. Bounded devnet rehearsal.
5. Minimal IDL-based devnet client.
6. Invite-only devnet beta.
7. Mainnet decision brief.

Everything else—including TPM—is deferred.

## What this plan deliberately does not do

- No TPM fallback or additional TPM investigation.
- No more authorization/replay-store architecture.
- No server/database unless the client proves it is necessary.
- No mainnet launch or real-money spend.
- No public mint/claim enablement before fresh CI and devnet evidence.
- No open-ended audits or infrastructure work.

## Immediate next action

Run the existing manual x86 workflow on the current claim path, then begin the scoped public-mint implementation. A successful claim-only CI run is useful evidence but does not make a public beta ready.
