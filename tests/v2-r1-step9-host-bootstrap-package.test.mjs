import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const CONTRACT = new URL('../docs/operations/v2-r1-step9-host-bootstrap-package.md', import.meta.url);

const EXPECTED_CONTRACT = `# V2 r1 Step 9 host-bootstrap authorization-package contract

## Status and published binding

This is repository-only package-design documentation and a deterministic offline repository-text test. It is not a human authorization record, release seal, signature, verifier, helper, installer, bootstrap command, host procedure, or Devnet procedure.

This design is bound to published Step 8 revision d8b10844e32398c0ba0d1cb88624a2556dfa3c19. No input, caller, environment, configuration, branch, tag, or working tree can substitute that revision.

## Reported fresh-preflight evidence boundary

The user-reported fresh Step 9A result was: PREFLIGHT_PASS: exact candidate absent. It is recorded only as reported narrow metadata-only evidence. It is not independently verified host proof, an authorization record, production authority, or permission to create, stage, install, inspect, execute, or reuse any path. A later host-bootstrap consideration requires a new separately authorized fresh preflight immediately before that consideration.

## Preserved exclusions

The legacy candidate remains preserved indefinitely, untouched, uninspected, and unavailable for reuse forever. The active runtime remains permanently excluded and uninspected. Neither is selected, named as a host path, or usable as source, stage, destination, or fallback.

## Future package requirements only

A future host-bootstrap authorization package must be separately reviewed and contain canonical references to: an exact limited human scope and expiry; the immutable published revision; the complete actual-byte release seal and its digest; the approved authorization-record schema and nonces; a fresh preflight record; the fixed future source, staging, and destination design; descriptor-pinned helper review; refusal evidence; and independent specification and security approvals.

The future package must bind those references together exactly and fail closed for absence, expiration, ambiguity, mismatch, stale evidence, changed state, missing approval, or any intervening action. Root ownership is not human approval. A package must not infer authority from a prior review, a published source file, a preflight pass, a release seal, or an in-memory validation result.

This Step 9 contract selects no source, staging, or destination path; key; artifact; endpoint; CLI; sudo rule; helper binary; release-seal value; authorization value; nonce; approver identity; or host command.

## Separate later gates

A future reviewed package would still not authorize bootstrap execution. Bootstrap execution, installation, and prepare each require their own distinct explicit authorization and fresh review. A later prepare remains unsigned and cannot imply credentials, runtime state, endpoints, artifacts, CLI use, network or RPC activity, signing, sending, deployment, spending, minting, claims, payments, uploads, upgrades, mainnet, or any other launch operation.

## Prohibited current operations

Step 9 authorizes no host command, root or sudo action, helper implementation or execution, candidate creation, source checkout staging, installation, credential or runtime access, key, artifact, endpoint, or CLI access, network or RPC use, signing, serialization, sending, deployment, or any other launch operation. It creates no authorization package, release seal, signature, verifier, nonce state, or approval acceptance decision.

## Publication boundary

Passing Step 9 authorizes neither commit nor publication. A separate explicit authorization is required for any repository commit or publication. Publication would remain repository-only and would not authorize bootstrap, installation, prepare, Devnet, signing, or deployment.
`;

test('Step 9 host-bootstrap package contract is the exact reviewed canonical document', async () => {
  const source = await readFile(CONTRACT, 'utf8');
  assert.equal(source, EXPECTED_CONTRACT);
});

test('canonical comparison rejects revision substitution and implied host authority', async () => {
  const source = await readFile(CONTRACT, 'utf8');
  const bypass = source
    .replace('d8b10844e32398c0ba0d1cb88624a2556dfa3c19', '0'.repeat(40))
    .replace('Step 9 authorizes no host command, root or sudo action', 'Step 9 authorizes a host command, root or sudo action');
  assert.notEqual(bypass, EXPECTED_CONTRACT);
});

// This test reads repository text only. It does not access Git objects, host paths, runtime, credentials, endpoints, network, or external systems.
