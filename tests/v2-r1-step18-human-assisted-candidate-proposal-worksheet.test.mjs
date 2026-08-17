import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const CONTRACT = new URL('../docs/operations/v2-r1-step18-human-assisted-candidate-proposal-worksheet.md', import.meta.url);
const EXPECTED_SHA256 = 'bf50a595306184b0c1ea635e1124b299a5bfe80b8d7688a6e46841f1adf0764f';

const EXPECTED_DOCUMENT = `# Step 18 human-assisted compiler-candidate proposal worksheet contract

## Status, predecessor, and present boundary

This is a repository-only plain-language decision-support worksheet and deterministic repository-text test. It is not a candidate-discovery procedure, inventory, authorization record, approval, signature, verifier, durable store, clock, host procedure, command sequence, candidate inspection, metadata probe, compiler invocation, build, or authorization for any live action. It binds the immediate published predecessor exactly to \`d2f154a036e483bfdedc3064eb9cafa746fbc1b1\`; no branch, successor, tag, working tree, caller, environment, configuration, or supplied value may substitute that predecessor. The predecessor is historical design input only, never current authority.

This worksheet selects no candidate, entry path, parent path, basename, compiler, target, owner, mode, digest, identity, reviewer, approver, approval ID, record ID, time, context, command, argument, environment, repository root, store, clock, signature algorithm, key, or operational action. It must not instruct, imply, or permit any agent, user, or tool to search, scan, list, enumerate, discover, infer, guess, resolve, execute, inspect, or validate a compiler candidate on a host.

## Plain-language purpose and safe default

The human may pause at this gate without providing any candidate information. If the human does not already know one fixed absolute compiler-entry path from independent prior knowledge or documentation, the required result is \`PAUSE: no candidate nominated\`; it is a successful non-action outcome, not a failure.

This worksheet may explain that a future candidate authorization record needs one exact absolute path, a plain-language source, a rationale, and an exact approved context. It must state that the future record is not host authority and that a separate later host gate would still be required before any metadata-only probe. It must not fabricate, suggest, recommend, rank, autocomplete, transform, normalize, derive, or fill any candidate, source, rationale, context, record identifier, reviewer identifier, approval identifier, issuance time, or expiry time.

## Non-authorizing nomination worksheet

Only if the human independently elects to nominate one already-known path, the worksheet may request these human-provided values as unfilled labels, not as example values or a generated record:

\`candidate-entry-path: <human supplies one exact absolute path>\`
\`proposal-source: <human describes where they already know the path from>\`
\`proposal-rationale: <human explains why this one path should be considered>\`
\`approved-context: <human states the exact intended review context>\`

The worksheet must say that the user should not paste secrets, private keys, endpoint URLs, passwords, tokens, or host inventory output. It must say that an absolute-path candidate must later meet the already published Step 16 grammar and must not be the previously rejected \`/usr/bin/cc\` symlink. This reminder does not inspect, resolve, identify, or expose a target of that path.

The worksheet must not request record ID, reviewer ID, approval ID, issued-at, or expires-at until the human knowingly elects to create a distinct later authorization record under a separate gate. It must not contain canonical authorization-record field order, real values, a command snippet, an executable name, a host path other than the historical rejected \`/usr/bin/cc\` reminder, a directory name, a package-manager instruction, \`PATH\`, \`which\`, \`command -v\`, globbing, directory listing, filesystem access, source-code access, network access, endpoint access, secret access, RPC, signing, sending, deployment, commit, or publication authority.

## Required fail-closed boundary

Any request to turn this worksheet into candidate discovery, host inspection, directory listing, package-manager query, runtime-default lookup, PATH lookup, symlink resolution, compiler execution, file-content read, metadata probe, candidate recommendation, automatic selection, authorization-record creation, or live action is out of scope and must fail closed. A separate future repository-only contract and separate explicit human approval would be required before any newly proposed discovery or host action can be considered.

Passing this test authorizes neither a nomination nor a record, host access, compiler execution, filesystem access, endpoint or secret access, RPC, signing, sending, deployment, commit, or publication. Each requires separate explicit human approval.
`;

function sha256(source) {
  return createHash('sha256').update(source, 'utf8').digest('hex');
}

function validateContract(source) {
  assert.equal(source, EXPECTED_DOCUMENT);
  assert.equal(sha256(source), EXPECTED_SHA256);
}

test('Step 18 human-assisted candidate proposal worksheet is the exact canonical document', async () => {
  validateContract(await readFile(CONTRACT, 'utf8'));
});

test('canonical comparison rejects discovery, nomination, authority, and safety-boundary weakening', async () => {
  const source = await readFile(CONTRACT, 'utf8');
  const mutations = [
    source.replace('exactly to `d2f154a036e483bfdedc3064eb9cafa746fbc1b1`', 'exactly to `0000000000000000000000000000000000000000`'),
    source.replace('It is not a candidate-discovery procedure, inventory', 'It is an authorized candidate-discovery procedure.'),
    source.replace('must not instruct, imply, or permit any agent, user, or tool to search, scan, list, enumerate, discover, infer, guess, resolve, execute, inspect, or validate a compiler candidate on a host', 'may search the host to select a compiler candidate'),
    source.replace('the required result is `PAUSE: no candidate nominated`', 'the required result is an agent-selected candidate'),
    source.replace('It must not fabricate, suggest, recommend, rank, autocomplete, transform, normalize, derive, or fill any candidate', 'It may recommend and fill any candidate'),
    source.replace('not as example values or a generated record', 'as example values and a generated record'),
    source.replace('should not paste secrets, private keys, endpoint URLs, passwords, tokens, or host inventory output', 'may paste secrets and host inventory output'),
    source.replace('must not be the previously rejected `/usr/bin/cc` symlink', 'may use `/usr/bin/cc`'),
    source.replace('must not request record ID, reviewer ID, approval ID, issued-at, or expires-at', 'may request and generate record identifiers and expiry'),
    source.replace('a command snippet, an executable name, a host path other than the historical rejected `/usr/bin/cc` reminder', 'a host command and arbitrary compiler paths'),
    source.replace('Any request to turn this worksheet into candidate discovery, host inspection', 'This worksheet authorizes candidate discovery and host inspection'),
    source.replace('Passing this test authorizes neither a nomination nor a record, host access', 'Passing this test authorizes a nomination, record, and host access'),
  ];
  for (const mutation of mutations) assert.throws(() => validateContract(mutation));
});

// This deterministic test reads repository text only; it creates no proposal, authorization record, approval, signature, durable state, host state, candidate probe, compiler invocation, endpoint request, key access, RPC, signing, send, or deployment action.
