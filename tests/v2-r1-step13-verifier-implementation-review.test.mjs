import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const CONTRACT = new URL('../docs/operations/v2-r1-step13-verifier-implementation-review.md', import.meta.url);

const EXPECTED_CONTRACT = `# V2 r1 Step 13 package-verifier implementation-review contract

## Status and published binding

This is repository-only verifier-implementation-review design documentation and a deterministic offline repository-text test. It is not a verifier implementation, authorization package, signature, key, nonce store, helper, installer, bootstrap command, host procedure, or Devnet procedure.

This design is bound to published Step 12 revision 2fbc9bfe97db2c697d526ae1d48f59de1c479603. No input, caller, environment, configuration, branch, tag, or working tree can substitute that revision. It defines later verifier-implementation review criteria only and creates no verifier, package, signature, key, clock, replay state, helper, candidate, or host state.

## Preserved exclusions

The legacy candidate remains preserved indefinitely, untouched, uninspected, and unavailable for reuse forever. The active runtime remains permanently excluded and uninspected. Neither is selected, named as a host path, or usable as source, stage, destination, or fallback.

## Future fixed verifier-implementation review requirements only

A later separately authorized verifier-implementation review may select one signature algorithm and canonical-byte coverage, public-key identity and encoding, key-origin and rotation policy, trustworthy wall-clock source and failure policy, durable replay-store format and rollback/concurrency policy, typed refusal vocabulary, and exact non-authoritative result consumer. This Step 13 contract selects none of those values. The later review must bind every selected constant and implementation behavior to the Step 10 package grammar, Step 11 canonical-byte and cross-binding architecture, Step 12 implementation-review boundary, independently approved exact test evidence, and a separately approved refusal policy.

The future verifier must accept only separately approved immutable complete canonical UTF-8 LF-terminated byte strings and compiled approved constants. It must not discover, synthesize, retrieve, repair, reorder, substitute, or select bytes or constants from a working tree, Git object database, filesystem path, environment, configuration, network, RPC endpoint, credential, runtime, clock fallback, caller, or package field. It must reject before acceptance any absent, non-canonical, duplicate, reordered, extra, truncated, substituted, ambiguous, mismatched, or unapproved input.

Before any signature, time, replay, or result-consumer decision, the future verifier must parse the Step 10 grammar exactly; verify every named SHA-256 against complete exact canonical bytes of its distinct bound record; verify the fixed Step 9 revision; verify review identifier and digest bindings; and verify authorization-record, release-seal, reviewed-scope, and fresh-preflight cross-bindings. It must use only the later-approved signature coverage, pinned key policy, trustworthy clock policy, and durable replay policy. A digest, valid signature, clock reading, nonce, or verifier success alone is never authenticity, freshness, human authorization, bootstrap, installation, prepare, credential, runtime, artifact, endpoint, CLI, network, RPC, signing, sending, deployment, or launch authority.

The future durable replay store must survive restart, crash, rollback, concurrency, and process replacement, and atomically consume the approved authorization nonce before producing any result available to its separately approved consumer. It must fail closed without consuming on unavailable, malformed, stale, ambiguous, concurrent, rolled-back, or uncommittable clock or replay state. An in-memory model, a best-effort log, or after-result consumption cannot satisfy this requirement. The verifier must return only typed non-echoing refusals until every required check succeeds; it must neither invoke nor expose a bootstrap, installation, prepare, transaction, or launch operation.

## Required future review evidence

The later verifier-implementation review must independently cover canonical-byte/grammar refusal; every digest and cross-record binding; signature coverage, wrong-key, malformed-key, rotation, and unavailable-key refusal; trusted-clock unavailable, malformed, expired, and boundary refusal; durable replay first-use, duplicate, restart, crash, rollback, concurrency, atomic-consume-before-result, and failed-commit refusal; typed non-echoing refusal behavior; exact consumer non-authority; and absence of filesystem discovery, environment/configuration, network/RPC, credential, host, helper, installation, prepare, transaction, signing, sending, deployment, or launch capability. No current test creates a package, signature, key, clock, replay store, verifier, or host state.

## Separate later gates

A future reviewed verifier implementation would still not authorize verifier execution, package creation or acceptance, fresh preflight, helper execution, candidate creation, installation, prepare, credentials, runtime state, artifact or endpoint access, CLI use, network or RPC activity, signing, sending, deployment, or any launch operation. Each requires distinct explicit authorization, fresh review, and where applicable a new separately authorized narrow metadata-only preflight immediately before host consideration.

## Prohibited current operations

Step 13 authorizes no verifier implementation or execution, package or record creation, source hashing, Git object access, signature or key creation or verification, clock access, nonce or durable-state creation, host command, root or sudo action, helper implementation or execution, candidate creation, source checkout staging, installation, credential or runtime access, key, artifact, endpoint, or CLI access, network or RPC use, signing, serialization, sending, deployment, or any other launch operation. It selects no algorithm, signature coverage, key, key policy, clock source, durable store, refusal value, result consumer, host path, source, stage, destination, artifact, endpoint, CLI, sudo rule, helper binary, release-seal value, authorization value, nonce, or approver identity.

## Publication boundary

Passing Step 13 authorizes neither commit nor publication. A separate explicit authorization is required for any repository commit or publication. Publication would remain repository-only and would not authorize verifier implementation, verifier execution, package creation or acceptance, bootstrap, installation, prepare, Devnet, signing, or deployment.
`;

function validateContract(source) {
  assert.equal(source, EXPECTED_CONTRACT);
}

test('Step 13 verifier-implementation review contract is the exact reviewed canonical document', async () => {
  validateContract(await readFile(CONTRACT, 'utf8'));
});

test('canonical comparison rejects trust selection, input discovery, and authority weakening', async () => {
  const source = await readFile(CONTRACT, 'utf8');
  const mutations = [
    source.replaceAll('2fbc9bfe97db2c697d526ae1d48f59de1c479603', '0'.repeat(40)),
    source.replace('A later separately authorized verifier-implementation review may select', 'This Step 13 contract selects'),
    source.replace('It must not discover, synthesize, retrieve, repair, reorder, substitute, or select bytes or constants from a working tree, Git object database, filesystem path, environment, configuration, network, RPC endpoint, credential, runtime, clock fallback, caller, or package field.', 'It may discover inputs from configuration.'),
    source.replace('A digest, valid signature, clock reading, nonce, or verifier success alone is never authenticity, freshness, human authorization, bootstrap, installation, prepare, credential, runtime, artifact, endpoint, CLI, network, RPC, signing, sending, deployment, or launch authority.', 'Verifier success authorizes bootstrap.'),
    source.replace('atomically consume the approved authorization nonce before producing any result available to its separately approved consumer', 'consume the nonce after producing a result'),
  ];
  for (const mutation of mutations) assert.throws(() => validateContract(mutation));
});

// This test reads repository text only. It does not access Git objects, host paths, runtime, credentials, endpoints, network, or external systems.
