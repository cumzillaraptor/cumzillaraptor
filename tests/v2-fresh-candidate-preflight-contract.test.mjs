import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const CONTRACT = new URL('../docs/operations/v2-fresh-candidate-preflight-contract.md', import.meta.url);

const EXPECTED_CONTRACT = `# Fresh candidate preflight contract

## Fixed candidate binding

The fixed fresh candidate is /opt/cumzillaraptors-send-runtime-candidate-v2-r1. It is a proposal and contract label only, not evidence of absence and not permission to create. No input, caller, or configuration can choose a candidate path. This exact path only.

## Preserved legacy exclusion

The legacy preserved candidate /opt/cumzillaraptors-send-runtime-candidate-v2 remains untouched, uninspected, and unavailable for reuse forever.

The active runtime is permanently excluded and is not named or inspected.

## Candidate seal evidence boundary

Candidate seal evidence is valid for published commit 220f2ff50f890504bd63c49f09088269a58fecc3. It is candidate evidence only and grants no seal production authority.

## Later authorized absence-only preflight

A later separate explicit host authorization is required for a narrow absence-only test. That future test is metadata-only for the exact fixed candidate and must fail closed if absence cannot be proven. It must fail closed if the path exists, is inaccessible, ambiguous, or the authorization scope mismatches. No recursive traversal or content access is permitted.

## Authority boundary

This repository contract is decision-only and non-operational. It authorizes no host action and permits no inspection of the legacy candidate, its root, or the active runtime. It grants no permission to create, modify, delete, move, rename, reuse, execute, or install.

Passing preflight does not authorize privileged bootstrap, staging, install, helper, or prepare. Each requires a separate gate.
`;

test('fresh candidate preflight contract is the exact reviewed canonical document', async () => {
  const source = await readFile(CONTRACT, 'utf8');

  assert.equal(source, EXPECTED_CONTRACT);
});

test('canonical comparison rejects known lexical-validator bypass variants', () => {
  const setextAuthorityCommandEncodedPath = EXPECTED_CONTRACT
    .replace('# Fresh candidate preflight contract', 'Fresh candidate preflight contract\n=================================')
    .replace('It grants no permission to create, modify, delete, move, rename, reuse, execute, or install.', 'Creation permission is granted.')
    .replace('/opt/cumzillaraptors-send-runtime-candidate-v2-r1', '/opt/cumzillaraptors-send-runtime-candidate-v2%2Dalternate')
    .concat('printf proof\n');

  assert.notEqual(setextAuthorityCommandEncodedPath, EXPECTED_CONTRACT);
});

// This test reads repository text only. It does not inspect any host path, runtime, credential, endpoint, or external system.
