# Step 23 trusted-time boundary architecture contract

## Status, predecessor, and present boundary

This is a repository-only trusted-time architecture/review contract and deterministic repository-text test. It is not a clock implementation, time query, network request, authorization record, verifier, durable store, host gate, discovery execution, candidate selection, helper implementation, command sequence, metadata probe, compiler invocation, build, or authorization for any live action. It binds the immediate published predecessor exactly to `30ef07fcc79b3cd21930815723b6587907ce8f6d`; no branch, successor, tag, working tree, caller, environment, configuration, or supplied value may substitute that predecessor. The predecessor is historical design input only, never current authority.

This contract selects no time source, provider, endpoint, protocol, certificate, key, clock, implementation, timezone database, host path, network, record value, store, command, candidate, compiler, or operational action. It authorizes no present time query, record creation, host action, or approval acceptance.

## Future authoritative-time boundary

A later separately approved implementation review must select exactly one authoritative time-source implementation by full repository commit, exact repo-relative source path, a verified regular non-symlink tree entry, its exact blob ID, and SHA-256 of complete source bytes. It must define its sole injected provider interface, provider identity/authentication boundary, canonical response grammar, freshness bound, monotonicity/rollback detection, uncertainty representation, timeout/availability behavior, and typed non-echoing denials. Missing, malformed, unavailable, untrusted, or failed provider identity/authentication must deny before any time value can be returned. No fallback source, local wall clock, monotonic clock alone, caller value, environment, configuration, repository state, unchecked host clock, DNS result, network response, cached value, or provider alias may substitute the selected source.

The source must produce only a trusted-time result or typed denial through its reviewed injected provider interface. It must not access filesystem, process, shell, environment, configuration, network, endpoint, secret, credential, key, host, candidate, compiler, RPC, signing, send, deployment, transaction, or durable store capability. Its implementation tests must use injected fixtures only and prove refusal before any forbidden adapter can be called. A fixture model is not proof that a live provider is trustworthy; host/provider integration remains a later separately reviewed gate.

## Canonical time grammar and Step 20 comparison

A future accepted Step 20 `issued-at`, `expires-at`, and trusted-time result must use exactly RFC 3339 UTC text in the grammar `YYYY-MM-DDTHH:MM:SSZ`: ASCII digits, fixed widths, uppercase `T` and `Z`, no fractional seconds, offset, leap-second `60`, whitespace, control characters, prefix, suffix, or alternate calendar representation. Each value must denote a valid Gregorian date and time. The trusted-time result must be strictly after the record issuance and strictly before record expiry; equality at either boundary, malformed input, unavailable source, timeout, stale result, uncertainty, rollback, non-monotonic result, or any comparison ambiguity must deny. This contract selects no lifetime duration or live time now.

## Non-authority boundary

A trusted-time result validates only the temporal relation for a later separately reviewed Step 20 record workflow. It is not human approval, review approval, record generation, durable uniqueness, durable consumption, host-gate approval, host discovery, candidate nomination, metadata probe, compiler execution, filesystem/content access, endpoint or secret access, RPC, signing, sending, deployment, commit, or publication authority.

Passing this test authorizes neither selecting nor implementing a time source, querying time, creating a record, accepting a record, host gate, host discovery, candidate nomination, metadata probe, compiler execution, filesystem/content access, endpoint or secret access, RPC, signing, sending, deployment, commit, or publication. Each requires separate explicit human approval.
