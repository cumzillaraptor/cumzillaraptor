import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const CONTRACT = new URL('../docs/operations/v2-descriptor-pinned-bootstrap-contract.md', import.meta.url);
const INTERFACE = new URL('../docs/operations/cumzinstall-v2-root-runtime-candidate-interface.md', import.meta.url);
const LEGACY_CANDIDATE = '/opt/cumzillaraptors-send-runtime-candidate-v2';
const LEGACY_EXCLUSION = `The legacy candidate path is permanently excluded: \`${LEGACY_CANDIDATE}\`.`;
const ACTIVE_RUNTIME_EXCLUSION = 'The current active runtime is permanently excluded.';

function count(text, literal) {
  return text.split(literal).length - 1;
}

function assertPermanentExclusionsOnly(text) {
  assert.equal(count(text, LEGACY_CANDIDATE), 1, 'legacy candidate may appear only once');
  assert.match(text, new RegExp(`^${LEGACY_EXCLUSION.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'));
  assert.equal(count(text, 'current active runtime'), 1, 'active runtime may appear only in its exclusion sentence');
  assert.match(text, new RegExp(`^${ACTIVE_RUNTIME_EXCLUSION}$`, 'm'));
  assert.doesNotMatch(text, /\bv3\b/i, 'a current active runtime/v3 cannot be an authority');
}

test('Phase B descriptor-pinned bootstrap contract freezes the pre-implementation syscall boundary', async () => {
  const text = await readFile(CONTRACT, 'utf8');

  assert.match(text, /^# v2 descriptor-pinned bootstrap contract$/m);
  assert.match(text, /contract documentation\/specification only; it is not Rust code or a helper implementation/i);
  assert.match(text, /Linux only, with the openat2 syscall; there is no portability fallback/i);
  assert.match(text, /openat2 with `RESOLVE_BENEATH \| RESOLVE_NO_SYMLINKS`/i);
  assert.match(text, /If openat2 is unavailable, fail closed/i);
  assert.match(text, /must not use openat, stat, or any other pathname fallback/i);
  assert.match(text, /retain trusted directory descriptors for every component after `\/`/i);
  assert.match(text, /descriptor-relative opens only/i);
  assert.match(text, /every descriptor-relative operation is relative to a retained trusted FD/i);
  assert.match(text, /never construct an absolute, stage, destination, or source path after initial fixed root acquisition/i);
  assert.match(text, /no `\/proc\/self\/fd` escape or reopen/i);

  assert.match(text, /release seal is fixed compiled-in\/operator-provisioned trusted data/i);
  assert.match(text, /selected only at compile time after separate approval/i);
  assert.match(text, /no file, environment, configuration, caller value, runtime manifest, or reference may select, reload, or replace it/i);
  assert.match(text, /complete pinned commit, strict canonical grammar, exact complete allowlist, per-entry actual-bytes digests, and package\/lock\/dependency cross-binding/i);
  assert.match(text, /defined in `v2-phase-b-release-seal-format\.md`/i);
  assert.match(text, /compare the post-copy digest only to this compiled trusted seal/i);
  assert.match(text, /no on-disk seal\/manifest action/i);

  assert.match(text, /inherited environment is neither parsed, read, nor consulted for any authority, path, seal, or behavior/i);
  assert.match(text, /begins with only hard-coded compile-time identities/i);
  assert.match(text, /no environment sanitization implementation is authorized in this contract/i);
  assert.match(text, /no environment-derived behavior is permitted/i);

  assert.match(text, /create only descriptor-relative beneath the retained approved staging-parent FD/i);
  assert.match(text, /`O_CREAT \| O_EXCL \| O_NOFOLLOW`/i);
  assert.match(text, /restrictive `0600`/i);
  assert.match(text, /preexistence must be a typed refusal/i);
  assert.match(text, /immediately `fstat` the staged FD/i);
  assert.match(text, /regular file, root ownership, and mode only under separate later approval/i);
  assert.match(text, /actual owner\/mode policy is a future approved compile-time constant/i);
  assert.match(text, /no chown\/chmod behavior implementation is permitted now/i);
  assert.match(text, /no path reopen or replacement/i);
  assert.match(text, /copy from the open source FD to this exclusive staged FD/i);
  assert.match(text, /rehash the staged FD from its held descriptor after copy/i);
  assert.match(text, /no stage-path lookup/i);

  assert.match(text, /later separate tests and approval are required before any helper execution or install/i);
  assert.match(text, /no system, no execve checkout source, no shell\/PATH lookup, fallback, retry, network, secrets, or Solana capability/i);
  assertPermanentExclusionsOnly(text);
});

test('legacy candidate interface delegates only to the Phase B contract and does not authorize host work', async () => {
  const text = await readFile(INTERFACE, 'utf8');

  assert.match(text, /static interface note only/i);
  assert.match(text, /v2-descriptor-pinned-bootstrap-contract\.md/);
  assert.match(text, /does not authorize host work, helper creation, helper execution, or installation/i);
  assert.match(text, /supplies no source root, staging path, destination, runtime, release-seal input, manifest, commit, digest, caller argument, or environment interface/i);
  assertPermanentExclusionsOnly(text);
  assert.doesNotMatch(text, /^candidate-root:/m);
  assert.doesNotMatch(text, /^source-root:/m);
});
