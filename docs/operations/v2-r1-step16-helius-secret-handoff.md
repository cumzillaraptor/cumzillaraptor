# V2 r1 Step 16 Helius Devnet secret-handoff contract

## Status and fixed binding

This is repository-only secret-handoff design documentation and a deterministic offline repository-text test. It is not a secret reader, endpoint resolver, runtime patch, verifier, helper, installer, bootstrap command, host procedure, RPC request, signing procedure, transaction procedure, or Devnet procedure.

This design is bound to published Step 15 revision 8718a0230e2c068e90befc399138248a6f9abb69. No input, caller, environment, configuration, branch, tag, or working tree can substitute that revision. It defines only a later, separately authorized local secret handoff to the already approved unsigned-review boundary; it creates no secret file, secret value, endpoint, request, package, signature, key, nonce, host state, or transaction.

## Preserved exclusions

The legacy candidate remains preserved indefinitely, untouched, uninspected, and unavailable for reuse forever. The active runtime remains permanently excluded and uninspected. Neither is selected, named as a host path, or usable as source, stage, destination, or fallback.

## Future secret-handoff boundary only

A later separately authorized local secret handoff may read exactly one operator-created, nonempty owner-only regular file at the fixed piadmin-local path `/home/piadmin/.config/cumzillaraptors/helius-devnet-rpc.url`. Every path component `/home`, `/home/piadmin`, `/home/piadmin/.config`, and `/home/piadmin/.config/cumzillaraptors` must be a directly inspected non-symlink directory; the immediate containing directory `/home/piadmin/.config/cumzillaraptors` must be owned by piadmin and mode exactly `0700`. The secret file must be a non-symlink regular file owned by piadmin and mode exactly `0600`.

The file must contain exactly one canonical ASCII URL byte string with no newline, carriage return, whitespace, control byte, fragment, userinfo, alternate hostname, or alternate path: `https://devnet.helius-rpc.com/?api-key=<token>`. Its URL parser result must have scheme `https`, hostname `devnet.helius-rpc.com`, omitted port or port `443`, pathname `/`, empty fragment, empty username/password, and exactly one query pair named `api-key`. The value `<token>` must be a nonempty ASCII token matching `[A-Za-z0-9_-]+`; duplicate `api-key` parameters, any additional parameter, percent-encoding, or any alternate spelling fails closed. The secret URL is input only to the separately reviewed live unsigned-review process; it must never be accepted from CLI arguments, environment variables, repository files, Git, shell history, logs, standard output, standard error, exception text, JSON reports, review records, package records, tests, commits, issue trackers, chat, screenshots, or telemetry. Any absent, inaccessible, symlinked, nonregular, wrong-owner, weak-mode, malformed, noncanonical, non-Devnet, credential-bearing, or ambiguous input must fail closed without a request.

The future handoff must pass the secret URL only in private process memory to the exact separately approved repository consumer `scripts/review-devnet-deployment.mjs`, whose complete UTF-8 bytes must SHA-256 hash to `eed10be9a2b5cb11dce9c5a217fad0419a6f096f5597b80671ed0d0e30b0bdae` before any handoff. It must redact the complete URL and every query value from all outward-facing results, displaying at most the fixed origin `https://devnet.helius-rpc.com`. It must not persist the secret into a temporary file, child argument vector, environment, shell history, repository state, generated artifact, durable report, or a user-visible message. Secret rotation means the operator replaces the local file; no previous endpoint may be cached, recovered, or reused.

## Non-authority boundary

This design and any later secret handoff do not authorize an RPC request by themselves. A separately authorized Step 16 live unsigned Devnet review may use the handoff only to obtain current Devnet genesis, slot/blockhash, first-deployment account state, public balances, rent/fee estimates, and incomplete unsigned transaction-message summaries. It must not sign, serialize for submission, send, deploy, spend, fund, initialize, create a collection, mint, claim, upload, upgrade, change authority, access mainnet, or launch.

A successful secret format check, secret handoff, RPC response, unsigned review, digest, or package is never human authorization or execution authority. Signing or sending remains a distinct later explicit authorization after a fresh review of the output.

## Required future review evidence

Before implementation or host use, independent specification and security reviews must confirm the fixed Step 15 revision; exact piadmin-local secret-file ownership/type/mode/ancestor checks; exact URL grammar; rejection of every alternate input channel; no secret echo in output, errors, or reports; no command-argument, environment, temporary-file, or durable persistence path; exact hash-pinned unsigned-review consumer; redacted origin-only display; no cache/reuse; and absence of signing, sending, deployment, or any other launch capability.

## Prohibited current operations

Step 16 secret-handoff design authorizes no secret read, endpoint validation, host command, root or sudo action, helper or runtime implementation or execution, RPC or network request, source checkout staging, installation, credential or runtime access, key, artifact, or CLI access, signature, serialization, transaction construction, signing, sending, deployment, or any other launch operation. It selects no literal secret, endpoint value, host command, key, approver identity, source, stage, destination, artifact, CLI, sudo rule, or helper binary.

## Publication boundary

Passing this design authorizes neither secret handoff, live unsigned review, commit, nor publication. A separate explicit authorization is required for each. Publication would remain repository-only and would not authorize any host action, RPC request, unsigned review, signing, or deployment.
