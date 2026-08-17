import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const CONTRACT = new URL('../docs/operations/v2-r1-step22-generator-review-implementation-contract.md', import.meta.url);
const EXPECTED_SHA256 = '499d95c51211c73b408b1808e68c401172d399afdb128322a561ef88df6bd2cb';

const EXPECTED_DOCUMENT = `# Step 22 canonical authorization-generator and independent-review implementation contract

## Status, predecessor, and present boundary

This is a repository-only implementation-review contract and deterministic repository-text test. It is not a generator implementation, review record, authorization record, signature, verifier, clock, durable store, host gate, discovery execution, candidate selection, helper implementation, command sequence, metadata probe, compiler invocation, build, or authorization for any live action. It binds the immediate published predecessor exactly to \`0f8ef1354afb6dba9b10e6c46fe170d8cc9d3b22\`; no branch, successor, tag, working tree, caller, environment, configuration, or supplied value may substitute that predecessor. The predecessor is historical design input only, never current authority.

This contract selects no implementation, language, dependency, input value, identifier, time, clock, store, review value, signature scheme, key, command, candidate, host path, endpoint, secret, or operational action. It authorizes no present record creation, review acceptance, host action, or approval acceptance.

## Future generator boundary

A later separately approved implementation review must select exactly one fixed generator source identity: full repository commit, exact repo-relative source path, exact non-symlink blob ID, and SHA-256 of complete source bytes. It must prove the generator accepts only one immutable canonical approval-facts byte input through an explicitly reviewed API; rejects every extra argument, unknown/duplicate/reordered field, non-UTF-8, non-LF, missing final LF, malformed placeholder replacement, and noncanonical input; generates no ID, time, digest, review, signature, store state, or host action; and emits only exact Step 20 canonical record bytes or a typed non-echoing refusal.

The generator must bind the Step 19 commit/path/SHA identity and exact scope literals from Step 20, preserve human-supplied authorization/reviewer/approval IDs, context, issuance, expiry, and independent review digest fields verbatim only after canonical validation, and reject any ID or review-digest alias. It must not discover input from filesystem, Git, environment, configuration, network, endpoint, credential, runtime, or caller defaults. A generated record is non-authoritative and cannot imply human approval, trusted time, durable uniqueness, consumption, host gate, or host action.

## Future independent-review-record boundary

A later separately approved implementation review must select exactly one fixed canonical independent-review-record grammar and two fixed independently reviewed reviewer implementations. Each reviewer must independently be bound by a full repository commit ID, exact repo-relative source path, exact non-symlink blob ID, and SHA-256 of its complete source bytes. The two reviewer source identities, blob IDs, and complete source-byte SHA-256 values must be pairwise distinct; neither reviewer may alias, wrap, import, execute, or delegate to the other. Each review record must bind complete prospective Step 20 record bytes by SHA-256, state a typed PASS or non-echoing denial, bind the Step 19 identity, scope, context, lifetime fields, ID distinction, and non-authority boundary, and contain no approval, signature, time, store, host, candidate, compiler, endpoint, secret, RPC, signing, send, deployment, commit, or publication capability.

The specification and security review records and their SHA-256 digests must be byte-distinct. A review implementation must reject wrong record bytes/digest, malformed grammar, missing or changed Step 19 identity, scope/context/lifetime mutation, ID/review-digest alias, reviewer-source identity alias, unknown input, and any capability expansion. A review PASS is an integrity-bound repository review only; it is not a human authorization, trusted-clock result, durable state transition, host gate, or execution permission.

## Required proof and non-authority boundary

The later generator/reviewer implementation review must prove all generator and review behavior using injected fixtures only; it must prove refusal before any filesystem, process, network, clock, store, or host adapter can be called. It must prove output-byte determinism for canonical fixture inputs and opaque typed denial for hostile inputs. The future generator/reviewer source and its implementation tests must contain no filesystem/content reader, Git reader, environment/configuration reader, process spawn, shell, network/RPC, endpoint/secret/key access, signer, transaction, deployment, or host-discovery capability. This present canonical-document test may read this repository text solely to compare exact document bytes and SHA-256; that repository-text read is not a future generator/reviewer capability.

Passing this test authorizes neither selecting nor implementing a generator/reviewer, creating a record/review, trusted time, durable storage, host gate, host discovery, candidate nomination, metadata probe, compiler execution, filesystem/content access, endpoint or secret access, RPC, signing, sending, deployment, commit, or publication. Each requires separate explicit human approval.
`;
function sha256(s) { return createHash('sha256').update(s, 'utf8').digest('hex'); }
function validateContract(s) { assert.equal(s, EXPECTED_DOCUMENT); assert.equal(sha256(s), EXPECTED_SHA256); }
test('Step 22 generator and review implementation contract is canonical', async () => validateContract(await readFile(CONTRACT, 'utf8')));
test('canonical comparison rejects generator, review, identity, and authority weakening', async () => {
 const s=await readFile(CONTRACT,'utf8'); const m=[
  s.replace('exactly to `0f8ef1354afb6dba9b10e6c46fe170d8cc9d3b22`','exactly to `0000000000000000000000000000000000000000`'),
  s.replace('exactly one fixed generator source identity','any caller-selected generator'),
  s.replace('rejects every extra argument','accepts extra arguments'),
  s.replace('generates no ID, time, digest, review, signature, store state, or host action','generates IDs, time, and a host action'),
  s.replace('It must not discover input from filesystem, Git, environment','It may discover input from filesystem and environment'),
  s.replace('two fixed independently reviewed reviewer implementations','one optional reviewer'),
  s.replace('full repository commit ID, exact repo-relative source path, exact non-symlink blob ID, and SHA-256 of its complete source bytes', 'an ambiguous reviewer label'),
  s.replace('must be pairwise distinct; neither reviewer may alias, wrap, import, execute, or delegate to the other', 'may alias the same reviewer implementation'),
  s.replace('This present canonical-document test may read this repository text solely to compare exact document bytes and SHA-256', 'This test may use arbitrary host input'),
  s.replace('must be byte-distinct','may be aliased'),
  s.replace('it is not a human authorization, trusted-clock result, durable state transition, host gate, or execution permission','it authorizes host execution'),
  s.replace('using injected fixtures only','using live host data'),
  s.replace('Passing this test authorizes neither selecting nor implementing a generator/reviewer','Passing this test authorizes implementation and host discovery'),
 ]; for (const x of m) assert.throws(()=>validateContract(x));
});
// Repository-text-only test; no record/review, host, filesystem, process, network, clock, store, RPC, signing, send, or deployment action.
