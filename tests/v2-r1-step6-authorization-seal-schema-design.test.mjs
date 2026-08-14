import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const CONTRACT = new URL('../docs/operations/v2-r1-step6-authorization-seal-schema-design.md', import.meta.url);

const EXPECTED_CONTRACT = `# V2 r1 Step 6 authorization-record and release-seal schema design

## Status and binding

This is repository-only schema design documentation and a deterministic offline repository-text test. It is not an authorization record, release seal, signature, verifier, helper, installer, bootstrap command, host procedure, or Devnet procedure.

This design is bound to published Step 5 revision f69dab643ac401859a9d21d6aeabf4dab53cf640. No input, caller, environment, configuration, branch, tag, or working tree can substitute that revision. It defines placeholders and acceptance criteria only. It does not generate a release seal, hash current source, invoke Git object access, choose a release-seal value, or accept an authorization.

## Preserved exclusions

The legacy candidate remains preserved indefinitely, untouched, uninspected, and unavailable for reuse forever. The active runtime remains permanently excluded and uninspected. Neither is selected, named as a host path, or usable as source, stage, destination, or fallback.

## Distinct future records

A future release seal is the distinct actual-byte artifact governed by the published Phase B release-seal format and explicit allowlist. A future authorization record is a separate text record that binds the complete release seal's SHA-256 digest and its pinned commit. The authorization record neither embeds nor substitutes for the release seal, its entries, source bytes, or allowlist. The synthetic Phase-A fixture is never a release seal and cannot satisfy an authorization-record field.

## Future authorization-record grammar only

A future authorization record must be canonical UTF-8 text with LF line endings and exactly these ten records in this exact order:

\`\`\`text
format: cumzillaraptors-v2-authorization-record-v1
step5-revision: f69dab643ac401859a9d21d6aeabf4dab53cf640
release-seal-format: cumzillaraptors-v2-release-seal-v1
release-seal-commit: <40-or-64-lowercase-hex-full-immutable-commit-id>
release-seal-sha256: <64-lowercase-hex-SHA-256-of-complete-release-seal-UTF-8-bytes>
scope-sha256: <64-lowercase-hex-SHA-256-of-future-reviewed-limited-scope-text>
issued-at: <RFC3339-UTC-timestamp>
expires-at: <RFC3339-UTC-timestamp-later-than-issued-at>
authorization-nonce: <64-lowercase-hex-nonce>
preflight-nonce: <64-lowercase-hex-nonce>
\`\`\`

Every line must have exactly one ASCII space after its label. Tabs, comments, blank lines, extra records, reordered records, duplicate labels, and bytes after the final single LF are forbidden.

The release-seal commit must be a complete immutable lowercase hexadecimal identifier and must equal the fixed Step 5 revision for this Step 6 schema version. The release-seal format must equal the published release-seal grammar identifier. The release-seal SHA-256 is a placeholder here; later it must equal SHA-256 over complete exact LF-terminated release-seal bytes, not source bytes, a fixture, a path, a Git object identifier, or a digest of only entries. The scope SHA-256 is a placeholder here; its later preimage must be separately reviewed exact limited-scope text, and Step 6 selects no host path, source, destination, credential, endpoint, CLI, sudo policy, helper, or value.

Both nonce fields must be distinct 64-lowercase-hex values. They are future one-time replay-prevention bindings only; Step 6 neither generates, stores, consumes, nor validates them. Timestamps must use the canonical UTC spelling \`YYYY-MM-DDTHH:MM:SSZ\`; expires-at must be strictly later than issued-at. No implied or missing expiry is permitted.

## Signature and acceptance prohibition

The fields \`signature:\`, \`signer:\`, certificate, detached signature, or any extra record are forbidden in this v1 schema. A syntactically conforming placeholder record is not an accepted authorization.

This Step 6 design performs no identity verification, signature verification, seal lookup, hash computation, nonce registration, expiry evaluation against a wall clock, scope recovery, authorization acceptance, or state transition. A later separately authorized design and independent review must define signature algorithms, public-key pinning, canonical-byte verification, nonce persistence, and acceptance behavior.

## Separate future gates

A future authorization record and release seal require separate authorization and independent specification/security review before creation or verification. A new separately authorized narrow metadata-only absence preflight remains required immediately before any host consideration; earlier reported preflight evidence is historical and non-authoritative. Existence, inaccessibility, ambiguity, expiry, mismatch, missing record or seal, changed state, or intervening action must fail closed and require a new future record and review.

A future accepted authorization would still not authorize bootstrap, installation, or prepare. Installation and prepare remain distinct later gates. Neither authorizes credentials, runtime state, endpoints, artifacts, CLI use, network or RPC activity, signing, sending, deployment, spending, minting, claims, payments, uploads, upgrades, mainnet, or any other launch operation.

## Prohibited current operations

Step 6 authorizes no source hashing, Git object access, Git command, seal generation, authorization-record creation or acceptance, signature or verifier implementation, nonce or durable-state creation, host command, root or sudo action, helper implementation or execution, candidate creation, staging, installation, credential or runtime access, endpoint or CLI access, network or RPC use, signing, serialization, sending, deployment, or any other launch operation. It selects no host path, source, stage, destination, key, artifact, endpoint, CLI, sudo rule, helper binary, release-seal value, authorization value, or approver identity.

## Publication boundary

Passing Step 6 authorizes neither commit nor publication. A separate explicit authorization is required for any repository commit or publication. Publication would remain repository-only and would not authorize release-seal generation, authorization creation or acceptance, privileged bootstrap, installation, or prepare.
`;

test('Step 6 authorization-record and release-seal schema design is the exact reviewed canonical document', async () => {
  const source = await readFile(CONTRACT, 'utf8');

  assert.equal(source, EXPECTED_CONTRACT);
});

// This test reads repository text only. It does not access Git objects, host paths, runtime, credentials, endpoints, or external systems.
