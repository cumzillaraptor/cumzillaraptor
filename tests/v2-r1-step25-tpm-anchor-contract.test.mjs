import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const CONTRACT = new URL('../docs/operations/v2-r1-step25-tpm-anchor-contract.md', import.meta.url);
const EXPECTED_SHA256 = '06c0e12357b1a49ded72bcfd427316ce4e6591d271239e965d856e643bb7488b';
const EXPECTED_DOCUMENT = `# Step 25 TPM-backed anti-rollback anchor implementation contract

## Status, predecessor, selection, and present boundary

This is a repository-only TPM-backed anti-rollback-anchor implementation-review contract and deterministic repository-text test. It is not a TPM probe, TPM tool installation, TPM key or NV-index creation, counter read/write, authorization record, SQLite database action, host gate, discovery execution, candidate selection, command sequence, metadata probe, compiler invocation, build, or authorization for any live action. It binds the immediate published predecessor exactly to \`2c8b6fb8be6f0b07f389f969cc43696c95a96e0a\`; no branch, successor, tag, working tree, caller, environment, configuration, or supplied value may substitute that predecessor. The predecessor is historical design input only, never current authority.

A local TPM-backed monotonic counter is selected only as the future anti-rollback anchor conditional on separate confirmation of compatible hardware and capability. This contract selects no TPM device, version, transport, tool, library, owner hierarchy, key, policy, NV index, counter value, authorization secret, host path, database path, command, network, endpoint, candidate, or operational action. It authorizes no present TPM or host action.

## Required future compatibility evidence gate

Before selecting or provisioning an anchor, a separate explicit human-approved read-only TPM compatibility preflight must collect only: TPM presence; TPM major version; exact supported monotonic-counter/NV capability; availability of required authorization and policy primitives; and opaque device identity facts sufficient to bind a later anchor without exposing secrets. The preflight must be performed through a separately reviewed, fixed implementation with full commit/path/verified regular non-symlink tree entry/blob/SHA identity. It must not create, alter, clear, take ownership of, provision, define, write, increment, lock, or delete any TPM object; it must not access SQLite, candidates, filesystem content, endpoints, secrets, RPC, signing, sending, deployment, or host discovery.

Absent, disabled, incompatible, ambiguous, emulated, inaccessible, untrusted, malformed, unsupported, substituted, unavailable, or uncertain TPM capability/evidence must fail closed. There is no software, local-clock, file, database-only, network, or alternate-device fallback. The preflight result is reported evidence only, not authorization to provision an anchor, access the TPM, create a record, access SQLite, or open a host object.

## Future anchor identity and monotonic protocol

Only after compatible reported evidence and separate explicit approval may a later implementation review select one fixed TPM anchor identity: fixed device identity binding; fixed hierarchy/policy identity; fixed NV counter/index identity; full implementation commit/path/verified regular non-symlink tree entry/blob/SHA identity; and exact counter encoding. The counter must be monotonic and non-decrementable. The implementation must reject counter reset, replacement, rollover, unavailable value, noncanonical encoding, non-increase, policy failure, authorization failure, device mismatch, or any uncertain TPM response. No caller, environment, configuration, CWD, runtime default, alternate TPM, or raw handle may select a TPM object.

The future SQLite reservation protocol must bind its database-global anchor metadata row to the exact TPM anchor identity and counter epoch. Before reservation, the implementation must read and authenticate the TPM counter and compare it to the authenticated database-global epoch. The first reservation transaction must durably bind the new reservation to the exact next TPM counter epoch; then the separately reviewed TPM operation must advance and re-read the counter, and the SQLite metadata update must durably record the same confirmed epoch before any validation, consume, accepted result, or host-object open. Before consume and after consume commit, the counter and database epoch must be re-read and equal under the reviewed protocol. Any crash, interruption, TPM increment uncertainty, write ordering ambiguity, database/TPM mismatch, stale counter, rollback, replacement, unavailable lock, or recovery uncertainty must deny with no host authority. This contract selects no write ordering implementation now.

## Required proof and non-authority boundary

A later implementation review must prove with injected TPM/SQLite fixtures: monotonic increment only; rejection for reset/decrease/rollover/device/policy/authorization failures; rejection before and after every TPM/SQLite durable boundary; single-winner concurrent reservation; crash and restart refusal at every interleaving; and no accepted result or host adapter call until all required counter/database comparisons and commits complete. Fixture evidence does not prove present hardware behavior or authorize a live TPM.

Passing this test authorizes neither a TPM preflight, TPM provisioning, TPM read/write, SQLite action, record creation, host gate, host discovery, candidate nomination, metadata probe, compiler execution, filesystem/content access, endpoint or secret access, RPC, signing, sending, deployment, commit, or publication. Each requires separate explicit human approval.
`;
function sha256(s) { return createHash('sha256').update(s, 'utf8').digest('hex'); }
function validateContract(s) { assert.equal(s, EXPECTED_DOCUMENT); assert.equal(sha256(s), EXPECTED_SHA256); }
test('Step 25 TPM anti-rollback anchor contract is canonical', async () => validateContract(await readFile(CONTRACT, 'utf8')));
test('canonical comparison rejects TPM fallback, provisioning, identity, counter, and authority weakening', async () => {
 const s=await readFile(CONTRACT,'utf8'); const m=[
  s.replace('exactly to `2c8b6fb8be6f0b07f389f969cc43696c95a96e0a`','exactly to `0000000000000000000000000000000000000000`'),
  s.replace('It is not a TPM probe, TPM tool installation, TPM key or NV-index creation','It installs TPM tools and provisions an NV counter.'),
  s.replace('conditional on separate confirmation of compatible hardware and capability','available by default'),
  s.replace('It must not create, alter, clear, take ownership of, provision, define, write, increment, lock, or delete any TPM object','It may provision and increment the TPM counter'),
  s.replace('There is no software, local-clock, file, database-only, network, or alternate-device fallback','A local clock fallback is permitted'),
  s.replace('The counter must be monotonic and non-decrementable','The counter may be reset or decremented'),
  s.replace('No caller, environment, configuration, CWD, runtime default, alternate TPM, or raw handle may select a TPM object','A caller may select any TPM handle'),
  s.replace('Before reservation, the implementation must read and authenticate the TPM counter and compare it to the authenticated database-global epoch','Reservation may begin without TPM comparison'),
  s.replace('the SQLite metadata update must durably record the same confirmed epoch before any validation, consume, accepted result, or host-object open','an accepted result may return before the counter epoch is stored'),
  s.replace('Any crash, interruption, TPM increment uncertainty, write ordering ambiguity, database/TPM mismatch, stale counter, rollback, replacement, unavailable lock, or recovery uncertainty must deny','Crash uncertainty may be retried'),
  s.replace('Passing this test authorizes neither a TPM preflight, TPM provisioning, TPM read/write','Passing this test authorizes TPM provisioning and host discovery'),
 ]; for (const x of m) { assert.notEqual(x,s); assert.throws(()=>validateContract(x)); }
});
// Repository-text-only test; no TPM, SQLite, host, network, RPC, signing, send, or deployment action.
