import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const CONTRACT = new URL('../docs/operations/v2-r1-step19-bounded-compiler-candidate-discovery-contract.md', import.meta.url);
const EXPECTED_SHA256 = '43ebaebc75087e02a11de84d7f992c20e0f8fa1683bbfdf5eb6c16b625fb2d40';

const EXPECTED_DOCUMENT = `# Step 19 bounded compiler-candidate discovery procedure contract

## Status, predecessor, and present boundary

This is a repository-only design/review contract and deterministic repository-text test. It is not a discovery execution, inventory result, candidate selection, authorization record, approval, signature, verifier, durable store, clock, helper implementation, host procedure, command sequence, candidate inspection, metadata probe, compiler invocation, build, or authorization for any live action. It binds the immediate published predecessor exactly to \`783efb3fe4d63bc0770039802ff1b744e22e734b\`; no branch, successor, tag, working tree, caller, environment, configuration, or supplied value may substitute that predecessor. The predecessor is historical design input only, never current authority.

This contract selects no current candidate, path, compiler, target, owner, mode, digest, identity, reviewer, approver, approval ID, record ID, time, context, command, argument, environment, repository root, store, clock, signature algorithm, key, or operational action. It authorizes no present host action and contains no executable command snippet or helper implementation.

## Exact future discovery scope

Only after a separate explicit human host-gate approval of this exact published contract may one future read-only discovery action inspect directory entries directly beneath the fixed parent directory \`/usr/bin\`. The action may report only the canonical sorted unique record list defined below. It must never report, resolve, retain, hash, open, read, or disclose any symlink target. It must never report any entry not matching exactly one of these ASCII basename grammars: \`gcc\`, \`gcc-[0-9]+\`, \`clang\`, or \`clang-[0-9]+\`.

The action must begin from a caller-retained trusted root directory FD whose provenance is separately reviewed; it must component-safely acquire held non-symlink FDs for exactly the single basename \`usr\` and then exactly the single basename \`bin\` using Linux \`openat2\` with \`RESOLVE_BENEATH | RESOLVE_NO_SYMLINKS\`, held-descriptor \`fstat\`, and no pathname reopen. The final held FD must be an authenticated non-symlink directory for exactly \`/usr/bin\`; no direct pathname open, implicit current-directory root, ordinary \`openat\`, compatibility behavior, retry, or fallback is permitted. It may enumerate only immediate directory entries through that held final FD, and for each name matching the fixed grammar perform a non-dereferencing final-entry classification. A regular entry may be opened only with Linux \`openat2\` and \`RESOLVE_BENEATH | RESOLVE_NO_SYMLINKS\` for the sole purpose of held-descriptor metadata collection; its contents must never be read. A symlink classification is an opaque terminal result: no target resolution, pathname reopen, descriptor-to-path conversion, ordinary \`openat\`, compatibility behavior, retry, or fallback is permitted. Every other entry is ignored without disclosure.

The canonical report is either exactly zero bytes for no matching records, or one or more LF-terminated ASCII records sorted in strictly increasing bytewise ASCII lexical order by basename, with no duplicate basename and exactly one final LF. Each regular record is exactly \`regular <basename> <mode> <uid> <gid>\\n\`; each symlink record is exactly \`symlink <basename>\\n\`. Here \`<basename>\` matches one fixed grammar above, and \`<mode>\`, \`<uid>\`, and \`<gid>\` are canonical non-negative decimal integers (\`0|[1-9][0-9]*\`) from held-descriptor metadata. Metadata fields are prohibited, not omitted, for a symlink record. The full path a later human may nominate is derived only as the fixed parent \`/usr/bin\` joined with one reported regular-record basename; the report itself selects no path.

The action must not inspect any other directory, recurse, glob, use PATH, invoke \`which\` or \`command -v\`, call a package manager, inspect runtime defaults, inspect configuration, query the network, access source code, read any file content, execute a compiler or helper, collect a compiler version, collect a digest, access an endpoint or secret, perform RPC, access a key, sign, send, deploy, commit, publish, or create/modify any filesystem object. The pre-existing \`/usr/bin/cc\` symlink remains permanently excluded: it must not be listed, matched, classified, resolved, reused, or treated as fallback.

## One-time authorization and report boundary

Before any future discovery action, a separate short-lived human authorization must bind the immutable published Step 19 identity as all of: the fixed full repository commit ID; this exact repo-relative contract path; and the exact SHA-256 of this contract's complete canonical UTF-8 bytes. It must verify all three before durable consumption. The authorization scope is exactly \`one non-dereferencing /usr/bin compiler-entry discovery report\`; it must bind exact approved admin context; issuance and expiry validated by a trusted clock; a durable unique opaque authorization ID; reviewer ID; approval ID; and fixed fail-closed stop conditions. The authorization IDs must be pairwise distinct. This design selects no actual IDs, store, clock, interval, time, signature algorithm, key, admin identity, implementation, or command now.

The future action must atomically reserve and consume that one authorization before opening the parent FD, reject replay/concurrency/crash/restart/uncertain-state use, and emit exactly one canonical report or one non-echoing refusal. The report is reported fresh evidence only, not independently verified host proof. It does not select, nominate, approve, or authorize any candidate. A human must separately review the report and explicitly nominate at most one exact reported regular-entry path in a new Step 17-conformant candidate authorization record; that later record still does not authorize a probe or any host action.

## Fail-closed and non-authority boundary

Missing, stale, malformed, substituted, ambiguous, unapproved, unreviewed, expired, replayed, in-flight, consumed, completed, failed, inaccessible, unsupported, wrong-parent, non-directory, symlinked parent, any unexpected enumeration result, malformed name, duplicate name, unsorted report, scope expansion, non-numeric or missing metadata, absent held-descriptor metadata, target-derived fact, pathname reopen, fallback, content read, execution, output beyond the fixed report grammar, or any live action must fail closed. No partial report is authoritative.

Passing this test authorizes neither host discovery nor a candidate nomination, authorization record, metadata probe, compiler execution, filesystem/content access, endpoint or secret access, RPC, signing, sending, deployment, commit, or publication. Each requires separate explicit human approval.
`;

function sha256(source) {
  return createHash('sha256').update(source, 'utf8').digest('hex');
}

function validateContract(source) {
  assert.equal(source, EXPECTED_DOCUMENT);
  assert.equal(sha256(source), EXPECTED_SHA256);
}

test('Step 19 bounded compiler-candidate discovery procedure is the exact canonical contract', async () => {
  validateContract(await readFile(CONTRACT, 'utf8'));
});

test('canonical comparison rejects discovery-scope, containment, report, and authority weakening', async () => {
  const source = await readFile(CONTRACT, 'utf8');
  const mutations = [
    source.replace('exactly to `783efb3fe4d63bc0770039802ff1b744e22e734b`', 'exactly to `0000000000000000000000000000000000000000`'),
    source.replace('It is not a discovery execution, inventory result, candidate selection', 'It is an authorized live discovery execution.'),
    source.replace('Only after a separate explicit human host-gate approval', 'Immediately without a host gate'),
    source.replace('directly beneath the fixed parent directory `/usr/bin`', 'through arbitrary system directories'),
    source.replace('caller-retained trusted root directory FD whose provenance is separately reviewed', 'an implicit current-directory root'),
    source.replace('exactly the single basename `usr` and then exactly the single basename `bin`', 'an arbitrary parent path'),
    source.replace('no direct pathname open, implicit current-directory root, ordinary `openat`, compatibility behavior, retry, or fallback is permitted', 'a pathname open and ordinary openat fallback are permitted'),
    source.replace('strictly increasing bytewise ASCII lexical order by basename', 'arbitrary record order'),
    source.replace('Each regular record is exactly `regular <basename> <mode> <uid> <gid>\\n`; each symlink record is exactly `symlink <basename>\\n`', 'records may have arbitrary fields'),
    source.replace('Metadata fields are prohibited, not omitted, for a symlink record', 'symlink records may include metadata'),
    source.replace('must never report, resolve, retain, hash, open, read, or disclose any symlink target', 'may resolve and disclose symlink targets'),
    source.replace('`gcc`, `gcc-[0-9]+`, `clang`, or `clang-[0-9]+`', '`.*`'),
    source.replace('RESOLVE_BENEATH | RESOLVE_NO_SYMLINKS', 'ordinary openat fallback'),
    source.replace('its contents must never be read', 'its contents may be read'),
    source.replace('must not inspect any other directory, recurse, glob, use PATH', 'may recurse, glob, and use PATH'),
    source.replace('must not be listed, matched, classified, resolved, reused, or treated as fallback', 'may be used as a fallback'),
    source.replace("immutable published Step 19 identity as all of: the fixed full repository commit ID; this exact repo-relative contract path; and the exact SHA-256 of this contract's complete canonical UTF-8 bytes", 'an ambiguous Step 19 label'),
    source.replace('It must verify all three before durable consumption', 'It may verify only a label after scanning'),
    source.replace('atomically reserve and consume that one authorization before opening the parent FD', 'consume authorization after the scan'),
    source.replace('does not select, nominate, approve, or authorize any candidate', 'automatically selects and approves a candidate'),
    source.replace('Passing this test authorizes neither host discovery nor a candidate nomination', 'Passing this test authorizes host discovery and a candidate nomination'),
  ];
  for (const mutation of mutations) assert.throws(() => validateContract(mutation));
});

// This deterministic test reads repository text only; it performs no host discovery, candidate selection, compiler execution, file-content read, endpoint request, key access, RPC, signing, send, or deployment action.
