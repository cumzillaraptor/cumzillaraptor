import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const REVIEW_DIR = new URL('../tools/v2_r1_helius_handoff/step16_production_authority_review/', import.meta.url);
const AUTHORITY_C = new URL('production_authority.c', REVIEW_DIR);
const AUTHORITY_H = new URL('production_authority.h', REVIEW_DIR);
const FIXTURE_C = new URL('./fixtures/v2-r1-step16-production-authority-fixture.c', import.meta.url);
const REVIEW = new URL('../docs/operations/v2-r1-step16-production-authority-implementation-review.md', import.meta.url);

const forbiddenNativeSurface = [
  /\b(?:openat2|open|fopen|read|write|stat|lstat|access|opendir|readdir|mkdir|unlink|rename)\s*\(/,
  /\b(?:execve|exec\w*|system|popen|fork|clone|posix_spawn)\s*\(/,
  /\b(?:socket|connect|getaddrinfo|send|recv)\s*\(/,
  /\b(?:git|curl|wget)\b/i, /\/proc\b/, /https?:\/\//i,
];

const forbiddenFixtureFilesystemSurface = [
  /#include <(?:dirent|fcntl|stdlib|sys\/stat|sys\/types|unistd)\.h>/,
  /\b(?:mkdtemp|mkstemp|tmpnam|tmpfile|rmdir|unlink|remove|open|openat|fopen|freopen|read|write|close|mkdir|creat|rename)\s*\(/,
  /\/tmp(?:\/|\b)/,
];

async function compileFixture(temporary) {
  const binary = path.join(temporary, 'fixture');
  await execFileAsync('cc', [
    '-std=c11', '-Wall', '-Wextra', '-Werror',
    '-DSTEP16_PRODUCTION_AUTHORITY_REVIEW_FIXTURE',
    '-I', AUTHORITY_H.pathname.replace(/\/[^/]+$/, ''),
    FIXTURE_C.pathname, AUTHORITY_C.pathname, '-o', binary,
  ], { cwd: temporary });
  return binary;
}

test('Step16 production authority model is fixture-gated and has no native authority surface', async () => {
  const [source, header, fixture] = await Promise.all([
    readFile(AUTHORITY_C, 'utf8'), readFile(AUTHORITY_H, 'utf8'), readFile(FIXTURE_C, 'utf8'),
  ]);
  assert.match(source, /#ifndef STEP16_PRODUCTION_AUTHORITY_REVIEW_FIXTURE/);
  assert.doesNotMatch(source, /\bmain\s*\(/);
  for (const pattern of forbiddenNativeSurface) {
    assert.doesNotMatch(source, pattern, `forbidden production authority surface: ${pattern}`);
    assert.doesNotMatch(header, pattern, `forbidden production authority surface: ${pattern}`);
  }
  assert.match(header, /STEP16_INVENTORY_COUNT 6U/);
  assert.match(header, /struct step16_authority_policy[\s\S]*compiler_manifest/);
  assert.match(header, /struct step16_compiler_evidence[\s\S]*compiler_identity_tag/);
  assert.doesNotMatch(header, /struct step16_compiler_evidence[\s\S]*exact_manifest/);
  assert.match(source, /policy->compiler_manifest/);
  assert.doesNotMatch(source, /request->compiler\.exact_manifest/);
  assert.match(header, /step16_validate_authority_request/);
  assert.match(header, /step16_validate_exec_manifest/);
  assert.match(header, /STEP16_OPENAT2_RESOLVE_BENEATH/);
  assert.match(header, /STEP16_OPENAT2_RESOLVE_NO_SYMLINKS/);
  for (const namedFailure of [
    'issuer-mismatch', 'containment-non-valid', 'containment-capability-mismatch',
    'missing-bounded-bytes-tag', 'invalid-git-result-state', 'compiler-identity-mismatch',
    'expired-compiler-token', 'invalid-compiler-token', 'exactly-seven-results',
    'policy-manifest-missing', 'policy-manifest-inherited',
  ]) assert.match(fixture, new RegExp(namedFailure));
  assert.match(fixture, /checks != 30/);
  for (const pattern of forbiddenFixtureFilesystemSurface) {
    assert.doesNotMatch(fixture, pattern, `fixture must remain in-memory only: ${pattern}`);
  }
  assert.doesNotMatch(fixture, /\/home\/piadmin|https?:\/\/|endpoint|secret|native_wrapper\.c/i);
});

test('Step16 production authority source fails compilation without fixture-only macro', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'step16-production-authority-no-macro-'));
  try {
    await assert.rejects(
      execFileAsync('cc', ['-std=c11', '-Wall', '-Wextra', '-Werror', '-I', path.dirname(AUTHORITY_H.pathname), '-c', AUTHORITY_C.pathname, '-o', path.join(temporary, 'authority.o')], { cwd: temporary }),
      (error) => {
        assert.match(`${error.stderr}`, /review-only/);
        return true;
      },
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test('Step16 production authority fixture models composition and fail-closed authority boundaries', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'step16-production-authority-'));
  try {
    const binary = await compileFixture(temporary);
    const { stdout, stderr } = await execFileAsync(binary, [], { cwd: temporary });
    assert.equal(stderr, '');
    assert.equal(stdout, 'production-authority fixture: 30 checks passed\n');
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test('Step16 production-authority implementation review pins the trusted-boundary predecessor and disclaims live authority', async () => {
  const review = await readFile(REVIEW, 'utf8');
  for (const required of [
    '4f4efc22055992bfd025f8c2988c5e28a8ce5a56',
    'f3f0a64b2da9b50717817a3332aea1d1e273ff75',
    'fixture-only', 'exactly six', 'openat2', 'RESOLVE_BENEATH', 'RESOLVE_NO_SYMLINKS',
    'opaque', 'private binding', 'execve manifest', 'no inherited environment',
    'policy, not the request', 'policy-owned value', 'compiler identity tag',
    'exactly seven results', 'issuer-mismatch', 'missing bounded-byte tags',
    'No host enforcement', 'no live capabilities', 'no filesystem operation', 'no filesystem residue',
    'not a production authority',
  ]) assert.match(review, new RegExp(required, 'i'));
});

// The fixture models injected facts entirely in memory and performs no filesystem or live authority action.
