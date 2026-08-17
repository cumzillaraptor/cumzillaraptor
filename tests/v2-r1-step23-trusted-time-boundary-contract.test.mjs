import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const CONTRACT = new URL('../docs/operations/v2-r1-step23-trusted-time-boundary-contract.md', import.meta.url);
const EXPECTED_SHA256 = '1e06cd05cf4060613d3193d0f1d545e5d80f62b32ee27ba0da8a61e497f67316';
const EXPECTED_DOCUMENT = `# Step 23 trusted-time boundary architecture contract

## Status, predecessor, and present boundary

This is a repository-only trusted-time architecture/review contract and deterministic repository-text test. It is not a clock implementation, time query, network request, authorization record, verifier, durable store, host gate, discovery execution, candidate selection, helper implementation, command sequence, metadata probe, compiler invocation, build, or authorization for any live action. It binds the immediate published predecessor exactly to \`30ef07fcc79b3cd21930815723b6587907ce8f6d\`; no branch, successor, tag, working tree, caller, environment, configuration, or supplied value may substitute that predecessor. The predecessor is historical design input only, never current authority.

This contract selects no time source, provider, endpoint, protocol, certificate, key, clock, implementation, timezone database, host path, network, record value, store, command, candidate, compiler, or operational action. It authorizes no present time query, record creation, host action, or approval acceptance.

## Future authoritative-time boundary

A later separately approved implementation review must select exactly one authoritative time-source implementation by full repository commit, exact repo-relative source path, a verified regular non-symlink tree entry, its exact blob ID, and SHA-256 of complete source bytes. It must define its sole injected provider interface, provider identity/authentication boundary, canonical response grammar, freshness bound, monotonicity/rollback detection, uncertainty representation, timeout/availability behavior, and typed non-echoing denials. Missing, malformed, unavailable, untrusted, or failed provider identity/authentication must deny before any time value can be returned. No fallback source, local wall clock, monotonic clock alone, caller value, environment, configuration, repository state, unchecked host clock, DNS result, network response, cached value, or provider alias may substitute the selected source.

The source must produce only a trusted-time result or typed denial through its reviewed injected provider interface. It must not access filesystem, process, shell, environment, configuration, network, endpoint, secret, credential, key, host, candidate, compiler, RPC, signing, send, deployment, transaction, or durable store capability. Its implementation tests must use injected fixtures only and prove refusal before any forbidden adapter can be called. A fixture model is not proof that a live provider is trustworthy; host/provider integration remains a later separately reviewed gate.

## Canonical time grammar and Step 20 comparison

A future accepted Step 20 \`issued-at\`, \`expires-at\`, and trusted-time result must use exactly RFC 3339 UTC text in the grammar \`YYYY-MM-DDTHH:MM:SSZ\`: ASCII digits, fixed widths, uppercase \`T\` and \`Z\`, no fractional seconds, offset, leap-second \`60\`, whitespace, control characters, prefix, suffix, or alternate calendar representation. Each value must denote a valid Gregorian date and time. The trusted-time result must be strictly after the record issuance and strictly before record expiry; equality at either boundary, malformed input, unavailable source, timeout, stale result, uncertainty, rollback, non-monotonic result, or any comparison ambiguity must deny. This contract selects no lifetime duration or live time now.

## Non-authority boundary

A trusted-time result validates only the temporal relation for a later separately reviewed Step 20 record workflow. It is not human approval, review approval, record generation, durable uniqueness, durable consumption, host-gate approval, host discovery, candidate nomination, metadata probe, compiler execution, filesystem/content access, endpoint or secret access, RPC, signing, sending, deployment, commit, or publication authority.

Passing this test authorizes neither selecting nor implementing a time source, querying time, creating a record, accepting a record, host gate, host discovery, candidate nomination, metadata probe, compiler execution, filesystem/content access, endpoint or secret access, RPC, signing, sending, deployment, commit, or publication. Each requires separate explicit human approval.
`;
function sha256(s) { return createHash('sha256').update(s, 'utf8').digest('hex'); }
function validateContract(s) { assert.equal(s, EXPECTED_DOCUMENT); assert.equal(sha256(s), EXPECTED_SHA256); }
test('Step 23 trusted-time boundary is the exact canonical contract', async () => validateContract(await readFile(CONTRACT, 'utf8')));
test('canonical comparison rejects source, grammar, boundary, and authority weakening', async () => {
 const s=await readFile(CONTRACT,'utf8'); const m=[
  s.replace('exactly to `30ef07fcc79b3cd21930815723b6587907ce8f6d`','exactly to `0000000000000000000000000000000000000000`'),
  s.replace('It is not a clock implementation, time query, network request','It is an authorized live time query.'),
  s.replace('exactly one authoritative time-source implementation','any convenient fallback clock'),
  s.replace('a verified regular non-symlink tree entry, its exact blob ID', 'an unchecked symlink or arbitrary blob'),
  s.replace('Missing, malformed, unavailable, untrusted, or failed provider identity/authentication must deny before any time value can be returned', 'provider authentication failure is permitted'),
  s.replace('No fallback source, local wall clock, monotonic clock alone, caller value, environment','Local wall-clock and caller values may substitute'),
  s.replace('must not access filesystem, process, shell, environment, configuration, network','may access network and environment'),
  s.replace('YYYY-MM-DDTHH:MM:SSZ','arbitrary locale time text'),
  s.replace('strictly after the record issuance and strictly before record expiry','at or after issuance and at or before expiry'),
  s.replace('equality at either boundary, malformed input, unavailable source, timeout, stale result, uncertainty, rollback, non-monotonic result, or any comparison ambiguity must deny','boundary equality and rollback are permitted'),
  s.replace('It is not human approval, review approval, record generation','It is host-gate approval and record generation'),
  s.replace('Passing this test authorizes neither selecting nor implementing a time source','Passing this test authorizes a live time query and host discovery'),
 ]; for (const x of m) assert.throws(()=>validateContract(x));
});
// Repository-text-only test; no time query, provider, network, record, host, RPC, signing, send, or deployment action.
