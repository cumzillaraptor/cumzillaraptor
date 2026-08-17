import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const CONTRACT = new URL('../docs/operations/v2-r1-step24-sqlite-replay-store-contract.md', import.meta.url);
const EXPECTED_SHA256 = '8958f48c4eb503dbae09849174ad9929a5bd484373cc9345282f481f2433a9cb';
const EXPECTED_DOCUMENT = `# Step 24 SQLite durable replay-store implementation contract

## Status, predecessor, selection, and present boundary

This is a repository-only SQLite durable replay-store implementation-review contract and deterministic repository-text test. It is not a SQLite installation, database file, schema migration, store implementation, authorization record, clock, verifier, host gate, discovery execution, candidate selection, helper implementation, command sequence, metadata probe, compiler invocation, build, or authorization for any live action. It binds the immediate published predecessor exactly to \`24ac753cba73fd132dbf44285ece23ddd0de9750\`; no branch, successor, tag, working tree, caller, environment, configuration, or supplied value may substitute that predecessor. The predecessor is historical design input only, never current authority.

SQLite is selected only as the future persistent transactional storage engine for this replay boundary. This contract selects no SQLite version, library, binary, database path, directory, database file, journal mode, pragma, connection string, account, permission, process, host, record value, clock, identifier, command, candidate, endpoint, secret, key, or operational action. It authorizes no present database creation, installation, database access, host action, or approval acceptance.

## Future fixed store identity and schema boundary

A later separately approved implementation review must select exactly one SQLite store implementation by full repository commit, exact repo-relative source path, verified regular non-symlink tree entry, exact blob ID, and SHA-256 of complete source bytes. It must select one fixed database schema version and one fixed schema migration identity, each with its own full repository commit, exact repo-relative path, verified regular non-symlink tree entry, exact blob ID, and complete-byte SHA-256. It must define an exact fixed database path and every parent-directory validation requirement only in that later review; no caller, CWD, environment, configuration, or relative path may select or substitute the path.

The fixed schema must contain exactly one authorization-consumption row per canonical Step 20 record SHA-256, with immutable binding columns for: record digest; Step 19 commit/path/SHA identity; authorization, reviewer, and approval IDs; specification and security review digests; exact scope; exact approved context; issuance; expiry; one opaque durable attempt ID; and durable reservation epoch. State is the sole mutable column and is exactly one of \`reserved\`, \`consumed\`, or \`failed\`; its only permitted monotonic transitions are \`reserved → consumed\` or \`reserved → failed\`, and no transition out of either terminal state is permitted. The schema must reject duplicate record digests, duplicate authorization IDs, duplicate attempt IDs, mutable binding columns, illegal state transitions, unknown columns, alternate state values, and any record whose canonical digest or immutable bindings do not match the validated record. It must store no secret, endpoint, candidate result, symlink target, compiler content, key, signature, transaction, or host output.

The fixed schema must also contain exactly one database-global anchor metadata row binding the fixed schema generation, current authenticated anti-rollback epoch, and the exact anchor implementation identity. A later separately reviewed anti-rollback anchor must supply an authenticated non-rollbackable generation or epoch. Its full implementation identity, storage origin, update ordering, freshness, recovery semantics, and failure behavior must be pinned and tested independently. Before a reservation, the store must atomically read and compare the database-global anchor metadata to the authenticated anchor; the first reservation transaction must atomically persist the new reservation row and the matching next database-global anchor epoch under the reviewed update protocol. Before consume and after consume commit, it must re-compare the database-global metadata and authenticated anchor. An unavailable, stale, replaced, rolled-back, mismatched, or uncertain anchor or database must deny before a reservation, validation, accepted result, or host object open. SQLite durability alone is insufficient to detect offline database replacement or rollback; this contract selects no anchor now.

## Atomic reserve and consume-before-open transaction

Before validation, trusted-time comparison, or any trusted-root FD or other host object can open, the future store implementation must begin a first SQLite transaction with a reviewed locking/isolation strategy and atomically persist one immutable \`reserved\` row with a new opaque durable attempt ID and fresh anchor-backed reservation epoch. The reservation commit must complete and be compared to the authenticated anti-rollback anchor before any subsequent validation step. A crash or interruption before that reservation commit leaves no durable attempt and grants no authority; the same record may only be submitted again as a new attempt after a fresh human approval, not inferred as consumed. After the reservation commits, every restart or recovery must treat that record digest and authorization ID as permanently unavailable unless a separately reviewed recovery transition deterministically records \`failed\` or \`consumed\`; it must never silently delete, overwrite, or reuse a reserved row.

Only after a durable reservation, the future store implementation may begin a second transaction, verify the complete canonical Step 20 record and all immutable bindings, validate trusted time through the separately reviewed boundary, re-validate the anchor epoch, and atomically transition that same reserved row to \`consumed\` in one committed transaction. It must reject absent, malformed, substituted, expired, unreviewed, unapproved, identity-mismatched, scope/context-mismatched, duplicate, reserved, consumed, failed, concurrent, locked, busy, unavailable, I/O-error, integrity-error, anchor mismatch, rollback, crash, interrupted, partially committed, or uncertain state. A successful consumed commit and post-commit anchor verification must occur before any accepted result can be returned to the later non-authoritative host-gate reviewer.

Neither reservation nor consume may expose a usable acceptance result before durable commit and anchor verification. A rollback, commit error, process crash, power loss, filesystem error, journal/WAL error, database corruption, database replacement, schema mismatch, unavailable lock, timeout, or uncertain recovery must produce only a typed non-echoing denial and no host-open authority. Recovery must reject ambiguity; it must never infer success from an in-memory result, partially written row, caller retry, journal artifact, or unverified database/anchor state. Once a reservation is durably recorded, no retry can reuse its authorization ID or record digest; a new human-approved record is required after any reserved, failed, consumed, or uncertain durable outcome.

## Access and capability boundary

The future SQLite implementation must use only its fixed reviewed database path, fixed schema, and reviewed transaction API. It must not discover input from filesystem except the explicitly reviewed database path, Git, environment, configuration, network, endpoint, credential, runtime, or caller defaults. It must not open a trusted root FD, inspect a host directory, enumerate candidates, read file content, resolve a symlink, run a compiler, access secrets, perform RPC, sign, send, deploy, commit, or publish. The only future consumer may receive a typed accepted/denied result plus the canonical record digest and immutable bindings; it remains non-authoritative and cannot cause host action.

## Required implementation proof and non-authority

A later implementation review must prove with isolated temporary SQLite fixtures: atomic single-winner concurrent consume; no accepted result before commit; rejection after rollback, crash/interruption simulation, corruption, replacement, schema mismatch, busy/locked database, duplicate/reused ID/digest, and every immutable-binding mismatch; durable post-restart refusal for consumed/failed/ambiguous state; and no host adapter call before commit. Fixture evidence does not establish current host enforcement or authorize a live database.

Passing this test authorizes neither selecting nor implementing SQLite, creating or accessing a database, generating or accepting a record, trusted time, host gate, host discovery, candidate nomination, metadata probe, compiler execution, filesystem/content access, endpoint or secret access, RPC, signing, sending, deployment, commit, or publication. Each requires separate explicit human approval.
`;
function sha256(s) { return createHash('sha256').update(s, 'utf8').digest('hex'); }
function validateContract(s) { assert.equal(s, EXPECTED_DOCUMENT); assert.equal(sha256(s), EXPECTED_SHA256); }
test('Step 24 SQLite replay-store contract is canonical', async () => validateContract(await readFile(CONTRACT, 'utf8')));
test('canonical comparison rejects SQLite, schema, transaction, recovery, and authority weakening', async () => {
 const s=await readFile(CONTRACT,'utf8'); const m=[
  s.replace('exactly to `24ac753cba73fd132dbf44285ece23ddd0de9750`','exactly to `0000000000000000000000000000000000000000`'),
  s.replace('It is not a SQLite installation, database file, schema migration','It installs SQLite and creates a live database.'),
  s.replace('selects no SQLite version, library, binary, database path','selects a live database path and SQLite binary'),
  s.replace('full repository commit, exact repo-relative source path, verified regular non-symlink tree entry, exact blob ID, and SHA-256','an unpinned SQLite library'),
  s.replace('exactly one authorization-consumption row per canonical Step 20 record SHA-256','multiple mutable rows per authorization'),
  s.replace('one opaque durable attempt ID; and durable reservation epoch', 'no durable attempt or epoch'),
  s.replace('A later separately reviewed anti-rollback anchor must supply an authenticated non-rollbackable generation or epoch', 'SQLite alone detects rollback'),
  s.replace('An unavailable, stale, replaced, rolled-back, mismatched, or uncertain anchor or database must deny', 'anchor rollback and replacement are permitted'),
  s.replace('State is the sole mutable column', 'state is immutable'),
  s.replace('its only permitted monotonic transitions are `reserved → consumed` or `reserved → failed`, and no transition out of either terminal state is permitted', 'state may transition freely'),
  s.replace('is exactly one of `reserved`, `consumed`, or `failed`', 'may be any string'),
  s.replace('exactly one database-global anchor metadata row', 'no database-global anchor metadata row'),
  s.replace('Before a reservation, the store must atomically read and compare the database-global anchor metadata to the authenticated anchor', 'reservation may begin without anchor comparison'),
  s.replace('the first reservation transaction must atomically persist the new reservation row and the matching next database-global anchor epoch', 'reservation and anchor epoch may update independently'),
  s.replace('atomically persist one immutable `reserved` row', 'skip durable reservation'),
  s.replace('reservation commit must complete and be compared to the authenticated anti-rollback anchor before any subsequent validation step', 'validate before durable reservation'),
  s.replace('same record may only be submitted again as a new attempt after a fresh human approval', 'same record can be retried after crash'),
  s.replace('atomically transition that same reserved row to `consumed` in one committed transaction', 'return acceptance before transaction commit'),
  s.replace('Recovery must reject ambiguity','Recovery may infer success from a partial row'),
  s.replace('Once a reservation is durably recorded, no retry can reuse its authorization ID or record digest', 'reserved IDs may be reused'),
  s.replace('It must not open a trusted root FD, inspect a host directory','It may open host directories after an in-memory acceptance'),
  s.replace('Passing this test authorizes neither selecting nor implementing SQLite','Passing this test authorizes a SQLite install and host discovery'),
 ]; for (const x of m) { assert.notEqual(x, s); assert.throws(()=>validateContract(x)); }
});
// Repository-text-only test; no SQLite installation/database access, host action, RPC, signing, send, or deployment action.
