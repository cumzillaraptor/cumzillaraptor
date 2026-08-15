# V2 r1 Step 15 short-lived host-bootstrap authorization-package contract

## Status and fixed binding

This Step 15 work is repository-only package creation and review preparation. It may create canonical authorization-package text in repository memory only; it is not a signature, verifier, helper, installer, bootstrap command, host procedure, or Devnet procedure.

This contract is bound to published Step 13 revision 401369f3ec11b2ec164a049f9dc4dfd7154d3354. No input, caller, environment, configuration, branch, tag, or working tree can substitute that revision. Its only approved human scope is exactly one isolated, no-send r1 candidate-bootstrap action. The package lifetime is exactly 60 minutes, starting at the canonical `issued-at` field in its distinct bound authorization record. The package `expires-at` field must equal that record's `expires-at`, and that record's `expires-at` must equal its `issued-at + 60 minutes`; otherwise creation or review must fail closed. The package cannot extend, renew, repair, or replace that interval.

## Preserved exclusions

The legacy candidate remains preserved indefinitely, untouched, uninspected, and unavailable for reuse forever. The active runtime remains permanently excluded and uninspected. Neither is selected, named as a host path, or usable as source, stage, destination, or fallback.

## Required canonical package and input bindings

A Step 15 package must be a complete canonical UTF-8 LF-terminated instance of the published Step 10 eleven-record grammar, with the fixed Step 9 revision `8017dd6d83d81f74481b58b78a90153f896279c7`. It must bind all of the following complete canonical byte strings, each by its own lowercase SHA-256 value: the validated r1 authorization record; the actual-byte r1 release seal; the exact reviewed-scope text; the fresh separately authorized narrow metadata-only preflight record; the independent specification-review record; and the independent security-review record.

The exact reviewed-scope text is `one isolated, no-send r1 candidate-bootstrap action only\n`. The fresh-preflight record is the user-reported exact narrow result `PREFLIGHT_PASS: exact candidate absent\n`; it is reported evidence only, not independently verified host proof. The package creator must reject an absent, changed, reordered, duplicate, non-canonical, non-LF-terminated, mismatched, expired, or non-60-minute input or output, including a missing/mismatched bound authorization-record `issued-at` or `expires-at` and any package `expires-at` unequal to the bound authorization-record `expires-at`. It must bind a distinct valid authorization nonce and preflight nonce in the canonical authorization record. It must neither infer a review, human approval, freshness, host state, or capability from any digest, package, record, seal, nonce, or repository revision.

## Non-authority boundary

A generated or reviewed Step 15 package is not authorization to execute a bootstrap action. It authorizes no host command, root or sudo action, helper implementation or execution, candidate creation, source checkout staging, installation, prepare, credential or runtime access, key, artifact, endpoint, CLI access, network or RPC use, signing, serialization, sending, deployment, spending, minting, claims, payments, uploads, upgrades, mainnet, or launch operation.

Any later verifier acceptance, host-bootstrap execution, installation, prepare, credential/RPC use, signing, or Devnet work needs its own distinct explicit user authorization, fresh review, and a new separately authorized narrow metadata-only preflight immediately before host consideration. A Step 15 package that is expired, consumed, stale, unavailable, or mismatched must fail closed; it cannot be refreshed or reused.

## Required independent review evidence

Before a Step 15 package can be treated as reviewed repository material, independent specification and security reviews must each confirm: the exact Step 10 grammar/order; fixed Step 9 and Step 13 revisions; complete-byte distinct digest bindings; exact scope; exact 60-minute interval; record nonce distinction; fresh-preflight evidence boundary; canonical-byte refusal behavior; preserved candidate/runtime exclusions; and absence of host, helper, installation, prepare, credential, network/RPC, signing, and launch capability. Review approval is not host or bootstrap authority.

## Prohibited current operations

Step 15 authorizes no signature or verifier implementation, durable nonce persistence or consumption, wall-clock trust decision, host command, root or sudo action, helper implementation or execution, candidate creation, source checkout staging, installation, credential or runtime access, key, artifact, endpoint, or CLI access, network or RPC use, signing, serialization, sending, deployment, or any other launch operation. It selects no host path, source, stage, destination, key, artifact, endpoint, CLI, sudo rule, helper binary, approver identity, or host command.

## Publication boundary

Passing Step 15 authorizes neither commit nor publication. A separate explicit authorization is required for any repository commit or publication. Publication would remain repository-only and would not authorize package acceptance, bootstrap execution, installation, prepare, Devnet, signing, or deployment.
