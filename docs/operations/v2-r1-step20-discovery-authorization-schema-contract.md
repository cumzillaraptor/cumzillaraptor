# Step 20 one-time bounded-discovery authorization schema contract

## Status, predecessor, and present boundary

This is a repository-only authorization-schema design/review contract and deterministic repository-text test. It is not an authorization record instance, human approval, signature, verifier, durable store, clock, host gate, discovery execution, inventory result, candidate selection, helper implementation, command sequence, candidate inspection, metadata probe, compiler invocation, build, or authorization for any live action. It binds the immediate published predecessor exactly to `7877040cd9b7c68a9926aabb00f46f5551a3ad15`; no branch, successor, tag, working tree, caller, environment, configuration, or supplied value may substitute that predecessor. The predecessor is historical design input only, never current authority.

This contract selects no actual authorization ID, reviewer ID, approval ID, admin context, issuance time, expiry time, trusted clock, store, signature scheme, key, implementation, command, candidate, path, compiler, target, owner, mode, digest, or operational action. A real authorization record can exist only after a human separately provides and explicitly approves every concrete value under a later gate.

## Canonical record grammar and exact field order

A future Step 20 authorization record is one canonical UTF-8 byte sequence with LF line endings, exactly one final LF, no BOM, and exactly these fourteen newline-terminated fields in this order, with exactly one ASCII space after every colon and no extra, duplicate, omitted, reordered, blank, comment, extension, or unknown field:

`record-version: step20-bounded-discovery-authorization-v1`
`authorization-id: <opaque-durable-unique-id>`
`step19-commit: 7877040cd9b7c68a9926aabb00f46f5551a3ad15`
`step19-contract-path: docs/operations/v2-r1-step19-bounded-compiler-candidate-discovery-contract.md`
`step19-contract-sha256: 43ebaebc75087e02a11de84d7f992c20e0f8fa1683bbfdf5eb6c16b625fb2d40`
`scope: one non-dereferencing /usr/bin compiler-entry discovery report`
`approved-admin-context: <exact-human-approved-admin-context>`
`issued-at: <canonical-time>`
`expires-at: <canonical-time>`
`reviewer-id: <opaque-reviewer-id>`
`approval-id: <opaque-approval-id>`
`spec-review-digest: <lowercase-sha256-of-exact-review-record-bytes>`
`security-review-digest: <lowercase-sha256-of-exact-review-record-bytes>`
`stop-conditions: step20-fixed-fail-closed-v1`

Angle-bracketed values are schema placeholders only, not selected values or permission to generate a record. The field labels, order, spacing, encoding, final-LF rule, fixed Step 19 identity fields, exact scope, and fixed stop-conditions label are immutable. A digest is an integrity binding only; it does not establish authenticity, human approval, freshness, availability, durable consumption, host state, or authority.

## Required relations and fail-closed validation

Authorization ID, reviewer ID, and approval ID are separately supplied opaque values and must be pairwise distinct. The authorization ID must be durably unique. The specification-review digest and security-review digest must each be lowercase 64-character SHA-256 values, must be distinct, and must bind complete canonical independent review-record bytes. No identifier or review digest may be inferred from another field, a record digest, candidate data, runtime, configuration, or caller defaults. This design selects no identifier grammar, review schema, review identity, signing scheme, key, or store.

The Step 19 commit, contract path, and contract SHA-256 fields must match the exact immutable literals above as a three-part identity. A future validator must independently verify that the fixed commit resolves, that this exact path resolves to the expected non-symlink blob at that commit, and that its complete bytes hash to the fixed SHA-256 before durable consumption. A branch, tag, title, step label, working-tree pathname, rehashed substituted document, alternate path, tree, blob, or digest cannot substitute the identity.

The scope field is exactly `one non-dereferencing /usr/bin compiler-entry discovery report` and cannot be broadened, aliased, amended, combined, or interpreted as candidate selection, a candidate probe, content access, target resolution, compiler execution, filesystem modification, endpoint/secret access, RPC, key access, signing, sending, deployment, commit, or publication. The approved admin context is an exact human-approved field; it cannot be supplied, inferred, changed, or expanded by a caller, host, runtime, environment, configuration, repository state, or later action.

Issued-at and expires-at require trusted-clock validation before use; expiry must be strictly after issuance. Missing, malformed, boundary-time, expired, unavailable-clock, uncertain-clock, stale, copied, reused, substituted, ambiguous, unreviewed, unapproved, ID-aliased, review-digest-missing, review-digest-aliased, identity-mismatched, scope-expanded, or context-mismatched records fail closed. This design selects no time format, trusted clock, interval, live time, or renewal mechanism. A record cannot be refreshed, repaired, copied, replayed, widened, substituted, or reused; a new discovery action requires a new explicit human approval.

## Separate durable consumption, host, and non-authority boundaries

This contract does not create, sign, store, validate, reserve, consume, or accept any authorization record. Before any future host-gate consideration, a separately reviewed durable atomic consume-before-open transition must bind the exact canonical record bytes or exact record digest, the three-part Step 19 identity, authorization ID, reviewer ID, approval ID, both review digests, scope, exact context, issuance, and expiry. It must complete before opening a trusted root FD or any other host object and must reject concurrent, in-flight, replayed, already reserved, already consumed, completed, failed, expired, crash/restart, uncertain transaction, or uncertain state use. A copied record, partial binding, approval ID, review digest, record digest, or successful validation cannot stand in for durable consumption.

Authorization-record creation or validation authorizes neither a host gate nor any host action. A later discovery action requires separate explicit human host-gate approval, separate implementation review, and separate authorization of this exact unmodified consumed record. The reported discovery result remains reported evidence only and cannot nominate, select, approve, or authorize a candidate or any later action.

Passing this test authorizes neither record creation nor a host gate, host discovery, candidate nomination, metadata probe, compiler execution, filesystem/content access, endpoint or secret access, RPC, signing, sending, deployment, commit, or publication. Each requires separate explicit human approval.
