import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const CONTRACT = new URL('../docs/operations/v2-r1-step12-implementation-review.md', import.meta.url);

const EXPECTED_CONTRACT = `# V2 r1 Step 12 fixed privileged-bootstrap implementation-review contract

## Status and published binding

This is repository-only implementation-review design documentation and a deterministic offline repository-text test. It is not a helper implementation, installer, authorization package, verifier, bootstrap command, host procedure, or Devnet procedure.

This design is bound to published Step 11 revision 78055e18b56b7a8208a36e2ab53028b1757aec6c. No input, caller, environment, configuration, branch, tag, or working tree can substitute that revision. It defines later review criteria only and creates no helper, package, seal, manifest, staging area, candidate, or host state.

## Preserved exclusions

The legacy candidate remains preserved indefinitely, untouched, uninspected, and unavailable for reuse forever. The active runtime remains permanently excluded and uninspected. Neither is selected, named as a host path, or usable as source, stage, destination, or fallback.

## Future fixed implementation-review requirements only

A later separately authorized implementation review may select one immutable source identity, staging identity, destination identity, compiled trusted complete release seal, owner/mode policy, and root-only helper binary identity. This Step 12 contract selects none of those values. The later review must bind each selected constant to the accepted package architecture, reviewed source revision, release seal, descriptor-pinned bootstrap contract, and independently approved exact test evidence. Any changed, missing, ambiguous, caller-controlled, environment-derived, symlinked, or reopened identity must fail closed before source or destination interaction.

The future helper must have a private zero-argument entry point; require effective root; reject caller input before any source or destination interaction; and ignore inherited environment for authority or behavior. It must use Linux openat2 with RESOLVE_BENEATH and RESOLVE_NO_SYMLINKS from retained trusted descriptors only. There is no pathname reconstruction, /proc/self/fd escape, openat/stat/shell/PATH fallback, retry, checkout execution, network, secret, Solana, or runtime configuration capability.

The future helper must exclusive-create only beneath its later-approved retained staging-parent descriptor with O_CREAT, O_EXCL, and O_NOFOLLOW; inspect only held descriptors; require separately approved regular-file, owner, and mode facts; copy only from a held approved source descriptor; rehash only the held staged descriptor after copy; compare only to the compiled trusted complete release seal; and refuse preexistence, mismatch, or every unexpected state with typed non-echoing errors. It must not execute, install, replace, rename, send, deploy, or launch.

## Required future review evidence

The later implementation review must independently cover typed pre-open refusals; no-argument and effective-root gates; ignored inherited environment; openat2-unavailable refusal; every symlink and resolution refusal; retained-descriptor-only access; no pathname fallback or reopen; exclusive create-once/preexistence refusal; regular-file/owner/mode refusal; held-descriptor copy and post-copy hashing; compiled complete-seal cross-binding; and no exec, network, secret, RPC, signing, transaction, deployment, or launch capability. No current test executes any host path or helper.

## Separate later gates

A future reviewed implementation would still not authorize helper execution, candidate creation, installation, prepare, credentials, runtime state, artifact or endpoint access, CLI use, network or RPC activity, signing, sending, deployment, or any launch operation. Each requires distinct explicit authorization, fresh review, and where applicable a new separately authorized narrow metadata-only preflight immediately before host consideration.

## Prohibited current operations

Step 12 authorizes no helper or installer implementation or execution, package or record creation, source hashing, Git object access, signature or verifier implementation, nonce or durable-state creation, host command, root or sudo action, candidate creation, source checkout staging, installation, credential or runtime access, key, artifact, endpoint, or CLI access, network or RPC use, signing, serialization, sending, deployment, or any other launch operation. It selects no source, staging, or destination path; key; artifact; endpoint; CLI; sudo rule; helper binary; release-seal value; authorization value; nonce; approver identity; or host command.

## Publication boundary

Passing Step 12 authorizes neither commit nor publication. A separate explicit authorization is required for any repository commit or publication. Publication would remain repository-only and would not authorize helper implementation, helper execution, candidate creation, installation, prepare, Devnet, signing, or deployment.
`;

function validateContract(source) {
  assert.equal(source, EXPECTED_CONTRACT);
}

test('Step 12 implementation-review contract is the exact reviewed canonical document', async () => {
  validateContract(await readFile(CONTRACT, 'utf8'));
});

test('canonical comparison rejects revision, authorization, and fallback weakening', async () => {
  const source = await readFile(CONTRACT, 'utf8');
  const mutations = [
    source.replaceAll('78055e18b56b7a8208a36e2ab53028b1757aec6c', '0'.repeat(40)),
    source.replace('A later separately authorized implementation review may select', 'This Step 12 contract selects'),
    source.replace('There is no pathname reconstruction, /proc/self/fd escape, openat/stat/shell/PATH fallback, retry, checkout execution, network, secret, Solana, or runtime configuration capability.', 'A pathname fallback is permitted.'),
    source.replace('It must not execute, install, replace, rename, send, deploy, or launch.', 'It may install, prepare, or deploy.'),
  ];
  for (const mutation of mutations) assert.throws(() => validateContract(mutation));
});

// This test reads repository text only. It does not access Git objects, host paths, runtime, credentials, endpoints, network, or external systems.
