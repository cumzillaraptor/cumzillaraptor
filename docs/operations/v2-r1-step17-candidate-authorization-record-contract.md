# Step 17 canonical one-time compiler-candidate authorization-record contract

## Status, predecessor, and present boundary

This is a repository-only design/review contract and deterministic repository-text test. It is not an authorization record instance, approval, signature, verifier, durable store, clock, host procedure, command sequence, candidate inspection, metadata probe, compiler invocation, build, or authorization for any live action. It binds the immediate published predecessor exactly to `2b732408e5a8a9e962c98753fef510d3dbdfa1de`; no branch, successor, tag, working tree, caller, environment, configuration, or supplied value may substitute that predecessor. The predecessor is historical design input only, never current authority.

This contract selects no candidate, entry path, parent path, basename, compiler, target, owner, mode, digest, identity, reviewer, approver, approval ID, record ID, time, context, command, argument, environment, repository root, store, clock, signature algorithm, key, or operational action. A real record can exist only after a human separately supplies and explicitly approves exactly one concrete candidate proposal under a later gate.

## Canonical record grammar and exact field order

A future candidate authorization record is one canonical UTF-8 byte sequence with LF line endings, exactly one final LF, no BOM, and exactly these thirteen newline-terminated fields in this order, with exactly one ASCII space after every colon and no extra, duplicate, omitted, reordered, blank, comment, extension, or unknown field:

`record-version: step17-candidate-authorization-v1`
`record-id: <opaque-durable-unique-id>`
`candidate-entry-path: <canonical-absolute-entry-path>`
`candidate-parent-path: <canonical-absolute-parent-path>`
`candidate-basename: <single-basename>`
`proposal-source: <human-supplied-source>`
`proposal-rationale: <human-supplied-rationale>`
`scope: single non-dereferencing entry metadata probe`
`approved-context: <exact-human-approved-context>`
`issued-at: <canonical-time>`
`expires-at: <canonical-time>`
`reviewer-id: <reviewer-id>`
`approval-id: <approval-id>`

Angle-bracketed values above are grammar placeholders only, not selected values or permission to generate a record. The field labels, order, spacing, encoding, line ending, and final-LF rule are immutable. A digest of exact canonical record bytes is an integrity binding only; it does not establish authenticity, human approval, freshness, record availability, durable consumption, host state, or authority.

## Required field relations and fail-closed validation

The record ID, reviewer ID, and approval ID are separately supplied opaque values, must be pairwise distinct, and must not be inferred from one another, from a digest, or from candidate data. A future reviewed validator must require a durable unique record ID and reject a missing, reused, copied, substituted, ambiguous, malformed, unavailable, unreviewed, unapproved, or ID-aliased record. This contract selects no identifier grammar, store, issuer, signature scheme, public key, approver identity, or acceptance semantics.

The candidate entry path must use the Step 16 canonical absolute-path grammar: it begins with `/`; has no empty or repeated separators; has no `.` or `..` component; has no trailing slash; and contains no whitespace or control character. The parent path and basename must be derived only from that exact entry path. The basename is exactly one non-empty final component and contains no `/`; the entry relation is exactly that one basename beneath exactly that parent, never a broad relative path, alternate parent, recomposed pathname, reconstructed path, directory selection, or listing result. The record must reject a path/parent/basename mismatch, generic selection, candidate discovery, symlink classification, resolution attempt, target-derived fact, or any fallback.

Proposal source and rationale must be literal human-supplied record fields, each non-empty after canonical grammar validation; they cannot be inferred, generated, or substituted from runtime defaults, PATH, environment, configuration, caller defaults, package-manager query, directory contents, globbing, `which`, `command -v`, or a previously rejected link. The scope field is exactly `single non-dereferencing entry metadata probe` and cannot be broadened, aliased, amended, or combined with any other scope. The approved context must be an exact human-approved field; it cannot be supplied by a caller, host, runtime, configuration, repository state, or later probe.

Issued-at and expires-at require future trusted-clock validation before any use. Expiry must be strictly after issuance; an expired, boundary-time, unavailable-clock, malformed-time, replayed, uncertain, or stale record fails closed. This contract chooses no clock, time format, interval, live time, or renewal mechanism. A record cannot be refreshed, repaired, copied, replayed, widened, or substituted; a new candidate proposal requires a new record and a new explicit human approval.

## Separate consumption, host, and non-authority boundaries

This contract does not create, sign, store, validate, reserve, consume, or accept any record. Before any later host consideration, a separately reviewed durable atomic consume-before-probe reservation must bind the exact canonical record bytes or their exact digest, durable record ID, entry path, parent path, basename, scope, approved context, issuance, expiry, reviewer ID, and approval ID. It must complete before a separate host gate and before any probe, and must reject concurrent, in-flight, replayed, already reserved, already consumed, completed, failed, expired, crash/restart, uncertain transaction, or uncertain state use. Approval ID, a copied record, a partial binding, a digest alone, or a successful validation cannot stand in for durable consumption.

Candidate-record creation or validation authorizes neither a host probe nor any host access. A later metadata probe requires separate explicit human host-gate approval, separate review, and separate authorization of this exact unmodified consumed record. Any later probe must retain an authenticated parent FD for the exact bound parent and pass only the exact bound basename to Linux `openat2` with `RESOLVE_BENEATH | RESOLVE_NO_SYMLINKS`; unavailability, fallback, pathname reopen, resolution, symlink classification, or ambiguity fails closed and does not reveal a target.

This repository-only contract authorizes no candidate selection, host inspection, filesystem/content access, compiler/helper execution, build, activation, header access, endpoint or secret access, RPC, key access, signing, sending, deployment, commit, publication, or any other live action. Passing this test authorizes neither record creation nor commit or publication. Each requires separate explicit human approval.
