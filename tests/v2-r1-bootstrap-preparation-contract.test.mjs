import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const CONTRACT = new URL('../docs/operations/v2-r1-bootstrap-preparation-contract.md', import.meta.url);

const EXPECTED_CONTRACT = `# V2 r1 bootstrap preparation contract

## Fixed candidate binding

The only fresh candidate label is /opt/cumzillaraptors-send-runtime-candidate-v2-r1. It is fixed solely for repository-only preparation. No input, caller, environment, configuration, branch, tag, or working directory can select another candidate path.

## Recorded preflight evidence boundary

The user-reported Step 3 result was: PREFLIGHT_PASS: exact candidate absent. This is recorded as reported narrow absence-preflight evidence only. It is not independently verified host evidence, production authority, or permission to create, stage, install, inspect, execute, or reuse any path.

## Permanent exclusions

The preserved legacy candidate /opt/cumzillaraptors-send-runtime-candidate-v2 remains untouched, uninspected, and unavailable for reuse forever.

The active runtime is permanently excluded and is not named or inspected.

## Step 4 repository-only preparation

Step 4 permits only repository documentation and deterministic offline repository-text tests that define the later bootstrap review boundary for the exact fixed fresh candidate. It may prepare no implementation artifact, executable helper, installer, staging source, release seal, manifest, or host command.

The later bootstrap review must be a separate authorization and must bind a specific immutable published revision, an exact complete actual-byte release seal, a root-owned source/stage/destination design, descriptor-pinned no-follow operations, create-once refusal semantics, and independent security review. This contract neither selects nor approves any source root, staging path, destination operation, helper binary, release seal, manifest, key path, artifact path, endpoint, CLI, or sudo rule.

## Prohibited operations

Step 4 authorizes no host command, root or sudo action, candidate creation, source checkout staging, helper creation or execution, installation, key, artifact, endpoint, or CLI access, network or RPC use, signing, serialization, sending, deployment, minting, claim, payment, upload, upgrade, mainnet action, or any other launch operation.

## Later gates

Passing Step 4 authorizes neither commit nor publication and does not authorize Step 5. A separate explicit authorization is required for any later repository commit or publication. After any publication, a further separate authorization and fresh review are required before any privileged bootstrap consideration. Installation and prepare remain separate later gates.
`;

test('r1 bootstrap preparation contract is the exact reviewed canonical document', async () => {
  const source = await readFile(CONTRACT, 'utf8');

  assert.equal(source, EXPECTED_CONTRACT);
});

test('canonical comparison rejects path substitution and hidden operational authority', () => {
  const bypass = EXPECTED_CONTRACT
    .replace('/opt/cumzillaraptors-send-runtime-candidate-v2-r1', '/opt/cumzillaraptors-send-runtime-candidate-v2%2Dr2')
    .replace('Step 4 authorizes no host command', 'Step 4 authorizes a host command')
    .concat('sudo helper\n');

  assert.notEqual(bypass, EXPECTED_CONTRACT);
});

// This test reads repository text only. It does not inspect a host path, runtime, credential, endpoint, or external system.
