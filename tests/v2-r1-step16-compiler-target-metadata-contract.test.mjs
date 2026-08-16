import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const CONTRACT = new URL('../docs/operations/v2-r1-step16-compiler-target-metadata-contract.md', import.meta.url);
const EXPECTED_SHA256 = 'fffad32ed9ba46e4ac3b8221140569bdc3a1842df4bce490b9c44b23ecee51f9';

const EXPECTED_DOCUMENT = `# Step16 compiler-target metadata procedure contract

## Status, immediate predecessor, and present boundary

This is a repository-only design/review contract and deterministic repository-text test. It is not a native helper, host procedure, command sequence, compiler inspection, compiler invocation, build, or authorization for any live action. It binds the immediate published predecessor exactly to \`800f5fb35e9bf393c0ecbb93c20485dc9cbd0e21\`; no branch, successor, tag, working tree, caller, environment, configuration, or supplied value may substitute that predecessor. This predecessor and the reported metadata are historical design inputs only, never current authority.

The trusted-boundary constraint is retained: a future privileged boundary must be separately reviewed, separately authorized, descriptor-retaining, fail closed, and unable to replace a retained trusted descriptor with a pathname, caller-selected root, CWD, worktree, environment, argv, configuration, or fallback. Passing this contract grants no authorization to implement, inspect, execute, or publish anything.

## Reported repository-root access boundary

The only current piadmin evidence is fresh read-only reported metadata: \`/\` was directory UID \`0\`, GID \`0\`, mode \`0755\`; \`/home\` was directory UID \`0\`, GID \`0\`, mode \`0755\`; \`/home/raspberrypi\` was directory UID \`1000\`, GID \`1000\`, mode \`0700\`; and metadata for \`/home/raspberrypi/workspace-cumzillaraptor\` was inaccessible with Permission denied. These reported facts are not access authorization and do not establish a usable repository root.

This contract prohibits inspecting, entering, reading, changing, repairing, or otherwise acting on that inaccessible repository root. It must not choose an alternative root, infer one from a permission condition, or treat accessibility, ownership, mode, a predecessor, or a test result as authorization. A later distinct authorization and review must select exactly one accessible canonical repository root before any root authentication or repository action; that future selection is outside this contract.

## Later compiler-entry metadata-only gate

A later piadmin metadata-only gate requires new explicit authorization, a separate security review, and a separately reviewed native inspection helper. This contract neither implements nor authorizes that helper. The helper may inspect only the fixed compiler entry \`/usr/bin/cc\` under a retained trusted \`/usr/bin\` parent FD. It must use descriptor-relative Linux \`openat2\` with \`RESOLVE_BENEATH | RESOLVE_NO_SYMLINKS\` for the fixed entry. Linux \`openat2\` unavailability, unsupported flags, any resolution error, an untrusted or released parent FD, or any ambiguity fails closed. Ordinary \`openat\`, compatibility behavior, retry, fallback openat, pathname reopen, descriptor-to-path conversion, and reopening by any path are forbidden.

The reported classification for \`/usr/bin/cc\` is SYMLINK. Direct no-symlink opening therefore must fail closed. The next host gate must stop and report only the fixed opaque classification \`compiler-entry-is-symlink\`; it must never resolve, print, retain, hash, report, approve, or otherwise expose a symlink target pathname or target fact. A symlink result is evidence of rejection, not approval, a selection, an identity result, an authority grant, or a reason to expand scope.

The later gate must not use \`readlink\`, \`realpath\`, \`stat\` or \`lstat\` pathname re-open, shell command substitution, \`/proc\`, a compiler call, or any mechanism that follows, discovers, or reopens the compiler entry or its target. It must not inspect filesystem, network, endpoint, or header contents; activate headers; build; invoke compiler/RPC; sign; send; deploy; or select a compiler target. It may report only fixed opaque classifications and, only for a separately selected fixed non-symlink entry, bounded metadata collected from the held descriptor without pathname reopening. No metadata record may contain a target pathname, target identity, target content, target digest, or target-derived value.

A new explicit authorization and independent review are required before choosing any fixed non-symlink compiler entry candidate. This contract selects no candidate, compiler target, target path, owner, mode, digest, identity, command, argument, environment, root, or operational action. It does not design a method to follow \`/usr/bin/cc\` now or later under this contract.

## Non-authority and required later review

The later metadata-only review must verify the predecessor binding, retained trusted-parent boundary, mandatory \`openat2\` behavior and both resolution flags, fixed opaque output vocabulary, stop-on-symlink behavior, absence of target disclosure, and absence of every prohibited authority. Any missing, stale, malformed, substituted, symlinked, unsupported, path-reopened, fallback, caller-controlled, unreviewed, unapproved, inaccessible, or ambiguous condition is a non-echoing fail-closed refusal.

This repository-only contract contains no source-code helper and no host command example. It authorizes no repository-root inspection or change, compiler target inspection, compiler execution, build, filesystem/content access, network/endpoint access, header activation, RPC, signing, sending, deployment, commit, or publication. Each later review, authorization, and operational effect remains separate; permission conditions and successful metadata collection never supply access or execution authority.
`;

function sha256(source) {
  return createHash('sha256').update(source, 'utf8').digest('hex');
}

function validateContract(source) {
  assert.equal(source, EXPECTED_DOCUMENT);
  assert.equal(sha256(source), EXPECTED_SHA256);
}

test('Step16 compiler-target metadata procedure is the exact canonical contract', async () => {
  validateContract(await readFile(CONTRACT, 'utf8'));
});

test('canonical comparison rejects compiler-resolution, target, root, and authority escalation mutations', async () => {
  const source = await readFile(CONTRACT, 'utf8');
  const mutations = [
    source.replace('exactly to `800f5fb35e9bf393c0ecbb93c20485dc9cbd0e21`', 'exactly to `0000000000000000000000000000000000000000`'),
    source.replace('Linux `openat2` with `RESOLVE_BENEATH | RESOLVE_NO_SYMLINKS`', 'ordinary pathname open'),
    source.replace('Ordinary `openat`, compatibility behavior, retry, fallback openat, pathname reopen', 'Ordinary `openat` is permitted'),
    source.replace('must never resolve, print, retain, hash, report, approve, or otherwise expose a symlink target pathname or target fact', 'may report the symlink target pathname'),
    source.replace('The later gate must not use `readlink`, `realpath`, `stat` or `lstat` pathname re-open, shell command substitution, `/proc`', 'The later gate may use readlink and realpath'),
    source.replace('A symlink result is evidence of rejection, not approval', 'A symlink result is approval'),
    source.replace('It must not choose an alternative root', 'It may choose an alternative root'),
    source.replace('These reported facts are not access authorization', 'These reported facts are access authorization'),
    source.replace('or select a compiler target', 'or select a generic compiler target'),
    source.replace('It must not inspect filesystem, network, endpoint, or header contents; activate headers; build; invoke compiler/RPC; sign; send; deploy', 'It may invoke compiler/RPC, build, activate headers, sign, and deploy'),
    source.replace('contains no source-code helper and no host command example', 'contains a native helper and host command examples'),
  ];
  for (const mutation of mutations) assert.throws(() => validateContract(mutation));
});

// This deterministic test reads only repository text; it performs no host, compiler, filesystem-content, network, RPC, header, build, signing, send, or deployment action.
