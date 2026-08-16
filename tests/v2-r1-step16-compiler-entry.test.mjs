import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const LIBRARY_C = new URL('../tools/v2_r1_helius_handoff/step16_compiler_entry_review/compiler_entry.c', import.meta.url);
const LIBRARY_H = new URL('../tools/v2_r1_helius_handoff/step16_compiler_entry_review/compiler_entry.h', import.meta.url);
const FIXTURE_C = new URL('./fixtures/v2-r1-step16-compiler-entry-fixture.c', import.meta.url);
const REVIEW = new URL('../docs/operations/v2-r1-step16-compiler-entry-implementation-review.md', import.meta.url);

const forbiddenNativeSurface = [
  /\bopen(?:at|at2)?\s*\(/, /\bfopen\s*\(/, /\bstat\s*\(/, /\blstat\s*\(/,
  /\bfstat(?:at)?\s*\(/, /\breadlink\s*\(/, /\brealpath\s*\(/, /\/proc\b/,
  /\bopendir\s*\(/, /\breaddir\s*\(/, /\baccess\s*\(/, /\bmkdir(?:at)?\s*\(/,
  /\bunlink(?:at)?\s*\(/, /\brename(?:at)?\s*\(/, /\b(?:f)?chmod\s*\(/,
  /\b(?:f)?chown\s*\(/, /\bexec\w*\s*\(/, /\bsystem\s*\(/, /\bpopen\s*\(/,
  /\bfork\s*\(/, /\bvfork\s*\(/, /\bposix_spawn\s*\(/, /\bwaitpid\s*\(/,
  /\bkill\s*\(/, /\bsocket\s*\(/, /\bconnect\s*\(/, /\bbind\s*\(/,
  /\blisten\s*\(/, /\baccept\s*\(/, /\bsend\s*\(/, /\brecv\s*\(/,
  /\bgetaddrinfo\s*\(/, /\bgetenv\s*\(/, /\bchdir\s*\(/,
];
const forbiddenResolutionTerms = [
  /symlink[ _-]*target/i, /target[ _-]*(?:path|id|digest|metadata)/i,
  /resolve[ _-]*(?:path|symlink|target)/i, /fallback[ _-]*open/i,
];
const forbiddenFixtureContent = [
  /\/home\/piadmin/, /\/usr\/bin\/cc/, /https?:\/\//, /endpoint/i,
  /secret/i, /rpc/i, /devnet/i, /[A-Za-z0-9+/_-]{160,}/,
];

async function compileFixture(temporary, extraDefines = []) {
  const binary = path.join(temporary, 'fixture');
  await execFileAsync('cc', [
    '-std=c11', '-Wall', '-Wextra', '-Werror',
    '-DSTEP16_COMPILER_ENTRY_REVIEW_FIXTURE', ...extraDefines,
    '-I', path.dirname(LIBRARY_H.pathname), FIXTURE_C.pathname, LIBRARY_C.pathname,
    '-o', binary,
  ], { cwd: temporary });
  return binary;
}

test('Step16 compiler-entry review is fixture-only and has no host inspection or resolution surface', async () => {
  const [library, header, fixture] = await Promise.all([
    readFile(LIBRARY_C, 'utf8'), readFile(LIBRARY_H, 'utf8'), readFile(FIXTURE_C, 'utf8'),
  ]);
  for (const source of [library, header]) {
    for (const pattern of forbiddenNativeSurface) assert.doesNotMatch(source, pattern, `forbidden native surface: ${pattern}`);
    for (const pattern of forbiddenResolutionTerms) assert.doesNotMatch(source, pattern, `forbidden resolution surface: ${pattern}`);
  }
  for (const pattern of forbiddenFixtureContent) assert.doesNotMatch(fixture, pattern, `fixture must be synthetic only: ${pattern}`);
  for (const requiredFixtureCheck of ['parent-state-expired', 'missing-metadata-validator']) {
    assert.match(fixture, new RegExp(requiredFixtureCheck), `fixture must exercise ${requiredFixtureCheck}`);
  }
  assert.match(library, /#ifndef STEP16_COMPILER_ENTRY_REVIEW_FIXTURE/);
  assert.match(library, /#error "Step16 compiler-entry review is fixture-only/);
  assert.doesNotMatch(library, /\bmain\s*\(/);
  assert.match(header, /STEP16_APPROVED_COMPILER_ENTRY_NAME\s+"cc"/);
  assert.match(header, /STEP16_COMPILER_ENTRY_STOP_SYMLINK/);
  assert.match(header, /STEP16_COMPILER_ENTRY_METADATA_ELIGIBLE/);
  assert.doesNotMatch(header, /(?:root|path|cwd|worktree|env|argv)/i);
  assert.doesNotMatch(header, /(?:target|digest|identity)/i);
  assert.doesNotMatch(header, /resolve|fallback/i);
});

test('Step16 compiler-entry production library fails compilation without its fixture macro', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'step16-compiler-entry-no-macro-'));
  try {
    await assert.rejects(
      execFileAsync('cc', ['-std=c11', '-Wall', '-Wextra', '-Werror', '-I', path.dirname(LIBRARY_H.pathname), '-c', LIBRARY_C.pathname, '-o', path.join(temporary, 'library.o')], { cwd: temporary }),
      (error) => {
        assert.match(`${error.stderr}`, /fixture-only/);
        return true;
      },
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test('Step16 compiler-entry fixture exercises only injected in-memory cases', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'step16-compiler-entry-'));
  try {
    const binary = await compileFixture(temporary);
    const result = await execFileAsync(binary, [], { cwd: temporary });
    assert.equal(result.stdout, 'compiler-entry fixture: 16 checks passed\n');
    assert.equal(result.stderr, '');
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test('Step16 compiler-entry implementation review pins the metadata contract and remains non-authoritative', async () => {
  const review = await readFile(REVIEW, 'utf8');
  for (const required of [
    '33f96b1c872502360f0397e93cc996654e759fb3', 'fixture-only',
    'retained-parent capability', 'STOP_SYMLINK', 'METADATA_ELIGIBLE',
    'does not inspect actual `/usr/bin/cc` or any target',
    'parent-state-expired', 'missing-metadata-validator', 'exactly `16 checks`',
    'cannot authorize any next action', 'No compiler execution',
    'No filesystem', 'No network', 'No endpoint or secret',
  ]) assert.match(review, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

// This test reads repository review sources only. It compiles and runs an isolated in-memory fixture;
// it does not read, inspect, resolve, or invoke an actual compiler entry or any target.
