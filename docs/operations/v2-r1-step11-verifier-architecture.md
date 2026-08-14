# V2 r1 Step 11 future package-verifier architecture contract

## Status and published binding

This is repository-only verifier-architecture documentation and a deterministic offline repository-text test. It is not a verifier implementation, authorization package, signature, key, nonce store, helper, installer, bootstrap command, host procedure, or Devnet procedure.

This design is bound to published Step 10 revision 6aa687adf63800040bcf1e3ccfcb2c2d1799db82. No input, caller, environment, configuration, branch, tag, or working tree can substitute that revision. It defines future architecture and failure criteria only. It chooses no algorithm, key, clock source, durable store, path, value, or implementation.

## Preserved exclusions

The legacy candidate remains preserved indefinitely, untouched, uninspected, and unavailable for reuse forever. The active runtime remains permanently excluded and uninspected. Neither is selected, named as a host path, or usable as source, stage, destination, or fallback.

## Future verifier input boundary only

A future verifier must receive only separately approved immutable canonical UTF-8 LF-terminated byte strings for the complete package, authorization record, release seal, reviewed scope, fresh preflight record, specification review, security review, and refusal policy. It must receive separately approved immutable verifier constants. It must not discover, synthesize, retrieve, repair, substitute, or select any input from a working tree, Git object database, filesystem path, environment, configuration, network, RPC endpoint, credential, runtime, or caller.

Before any signature, time, replay, or authority decision, a future verifier must reject absent, non-canonical, duplicate, reordered, extra, truncated, substituted, ambiguous, or mismatched bytes. It must parse the Step 10 package grammar exactly; verify every named SHA-256 against complete exact canonical bytes of its distinct bound record; verify the fixed Step 9 revision; verify both independent review identifiers and their digest bindings; and verify the authorization-record, release-seal, reviewed-scope, and fresh-preflight cross-bindings required by their separately approved schemas. A digest alone is never authenticity, availability, freshness, or authority proof.

## Deferred trust decisions

A later separately authorized design and independent review must select and pin a signature algorithm, public-key identity and encoding, canonical-byte signature coverage, key-origin and rotation policy, trustworthy wall-clock source and failure behavior, durable nonce-store format and atomic consume-before-authority semantics, and a precise accepted-result consumer. This Step 11 design selects none of them and neither creates nor invokes any signature, key, clock, or durable state.

The future durable replay boundary must survive restart, crash, rollback, concurrency, and process replacement. An in-memory model cannot satisfy it. A future verifier must fail closed if the trusted clock or durable nonce state is unavailable, ambiguous, stale, malformed, concurrent, rolled back, or cannot be atomically consumed before any later authority result.

## Fail-closed result boundary

A future verifier must return only a typed non-echoing refusal until all canonical-byte, digest, review-independence, signature, clock, expiry, durable-replay, and separately approved policy checks succeed. Any success result is still not bootstrap, installation, prepare, credential, runtime, artifact, endpoint, CLI, network, RPC, signing, sending, deployment, or launch authority. Bootstrap execution, installation, prepare, and any Devnet transaction remain distinct later explicitly authorized gates.

## Prohibited current operations

Step 11 authorizes no verifier or helper implementation or execution, package or record creation, source hashing, Git object access, signature or key creation or verification, clock access, nonce or durable-state creation, host command, root or sudo action, candidate creation, source checkout staging, installation, credential or runtime access, key, artifact, endpoint, or CLI access, network or RPC use, signing, serialization, sending, deployment, or any other launch operation. It selects no algorithm, key, clock source, durable store, host path, source, stage, destination, artifact, endpoint, CLI, sudo rule, helper binary, release-seal value, authorization value, nonce, or approver identity.

## Publication boundary

Passing Step 11 authorizes neither commit nor publication. A separate explicit authorization is required for any repository commit or publication. Publication would remain repository-only and would not authorize verifier implementation, package creation or acceptance, bootstrap, installation, prepare, Devnet, signing, or deployment.
