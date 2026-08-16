import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const HELPER_C = new URL('../tools/v2_r1_helius_handoff/step16_descriptor_helper/descriptor_helper.c', import.meta.url);
const HELPER_H = new URL('../tools/v2_r1_helius_handoff/step16_descriptor_helper/descriptor_helper.h', import.meta.url);
const NATIVE_WRAPPER_C = new URL('../tools/v2_r1_helius_handoff/native_wrapper.c', import.meta.url);
const FIXTURE_C = new URL('./fixtures/v2-r1-step16-descriptor-helper-fixture.c', import.meta.url);
const REVIEW = new URL('../docs/operations/v2-r1-step16-descriptor-helper-implementation-review.md', import.meta.url);

const forbidden = [
  /\bexecve\s*\(/, /\bexec\w*\s*\(/, /\bsystem\s*\(/, /\bpopen\s*\(/, /\bfork\s*\(/,
  /\bsocket\s*\(/, /\bconnect\s*\(/, /\bgetaddrinfo\s*\(/, /\bgit\s+/, /\/proc\b/,
  /\bopen\s*\(/, /\bfopen\s*\(/, /\bstat\s*\(/,
];

const forbiddenFixtureContent = [
  /\/home\/piadmin/, /helius-devnet-rpc\.url/, /devnet\.helius-rpc\.com/,
  /fixed_absolute_path/, /canonical_secret/, /MAX_SECRET_BYTES/,
  /static\s+const\s+unsigned\s+char\s+\w+\s*\[\s*\]\s*=\s*\{[\s\S]{512,}\}/,
];

async function rejectsWithoutFixtureMacro(temporary) {
  await assert.rejects(
    execFileAsync('cc', ['-std=c11', '-Wall', '-Wextra', '-Werror', '-I', path.dirname(HELPER_H.pathname), '-c', HELPER_C.pathname, '-o', path.join(temporary, 'helper.o')], { cwd: temporary }),
    (error) => {
      assert.match(`${error.stderr}`, /review-only/);
      return true;
    },
  );
}

function runFixture(binary, sourceLength, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, [String(sourceLength)], { stdio: ['pipe', 'pipe', 'pipe'] });
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', (code, signal) => resolve({
      code,
      signal,
      stdout: Buffer.concat(stdout).toString('utf8'),
      stderr: Buffer.concat(stderr).toString('utf8'),
    }));
    child.stdin.end(input);
  });
}

test('Step16 descriptor helper is fixture-only, descriptor-relative, and has no activation/build/process surface', async () => {
  const [helper, header, fixture] = await Promise.all([readFile(HELPER_C, 'utf8'), readFile(HELPER_H, 'utf8'), readFile(FIXTURE_C, 'utf8')]);
  for (const source of [helper, header, fixture]) {
    for (const pattern of forbidden) assert.doesNotMatch(source, pattern, `forbidden native surface: ${pattern}`);
  }
  for (const pattern of forbiddenFixtureContent) assert.doesNotMatch(fixture, pattern, `fixture must not contain native-wrapper payload or sensitive marker: ${pattern}`);
  assert.match(fixture, /read\s*\(\s*STDIN_FILENO/);
  assert.match(fixture, /STEP16_FIXTURE_SOURCE_CAP/);
  assert.match(helper, /#ifndef STEP16_DESCRIPTOR_HELPER_REVIEW_FIXTURE/);
  assert.match(helper, /mkdirat\s*\(/);
  assert.match(helper, /openat\s*\([\s\S]*?O_CREAT\|O_EXCL\|O_NOFOLLOW\|O_CLOEXEC/);
  assert.match(helper, /fstat\s*\(/);
  assert.match(helper, /build-stage-/);
  assert.match(header, /struct step16_opaque_id/);
  assert.match(header, /issue_opaque_id/);
  assert.match(header, /resolved_commit/);
  assert.match(header, /STEP16_DESCRIPTOR_CLEANUP_FAILED/);
  assert.doesNotMatch(header, /opaque_authorized|const char \*opaque_id/);
  assert.doesNotMatch(helper, /snprintf\s*\([^;]*opaque/);
  assert.doesNotMatch(helper, /\bmain\s*\(/);
});

test('Step16 descriptor helper fails compilation without its fixture-only macro', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'step16-descriptor-helper-no-macro-'));
  try {
    await rejectsWithoutFixtureMacro(temporary);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test('Step16 descriptor helper fixture receives repository source only through stdin and rejects malformed transfer opaquely', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'step16-descriptor-helper-'));
  try {
    const binary = path.join(temporary, 'fixture');
    const nativeWrapper = await readFile(NATIVE_WRAPPER_C);
    await execFileAsync('cc', ['-std=c11', '-Wall', '-Wextra', '-Werror', '-D_GNU_SOURCE', '-DSTEP16_DESCRIPTOR_HELPER_REVIEW_FIXTURE', '-I', path.dirname(HELPER_H.pathname), FIXTURE_C.pathname, HELPER_C.pathname, '-o', binary], { cwd: temporary });

    const honest = await runFixture(binary, nativeWrapper.length, nativeWrapper);
    assert.equal(honest.code, 0);
    assert.equal(honest.signal, null);
    assert.equal(honest.stderr, '');
    assert.equal(honest.stdout, 'descriptor-helper fixture: 16 checks passed\n');

    for (const payload of [undefined, nativeWrapper.subarray(0, -1), Buffer.concat([nativeWrapper, Buffer.from([0])])]) {
      const rejected = await runFixture(binary, nativeWrapper.length, payload);
      assert.notEqual(rejected.code, 0);
      assert.equal(rejected.signal, null);
      assert.equal(rejected.stderr, '');
      assert.equal(rejected.stdout, 'descriptor-helper fixture: rejected\n');
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test('Step16 descriptor-helper implementation review binds the predecessor and remains non-authoritative', async () => {
  const review = await readFile(REVIEW, 'utf8');
  for (const required of [
    '0b383e6b9ff71b51b95f422a69048f58a13f0d1d',
    '620dc7dfbce6c831b4755dce6e5776cb613001b8',
    '0e59f37f98e3f6632064b3ade9a133ea24de90da',
    '6e45dd91c53ba7ac6aa76e2513a55c901d0bff108f7ae579475dceb1c2ee8d76',
    'resolved_commit', 'issuer_tag', 'trusted boundary', 'CLEANUP_FAILED',
    'non-authoritative', 'future gate', 'No active-header replacement', 'No compiler execution',
    'test-process stream', 'no endpoint/secret literals or encoded wrapper source',
    'repository `native_wrapper.c` as source data', 'does not read a local secret endpoint file',
  ]) assert.match(review, new RegExp(required));
});

// The only executable is an isolated test fixture compiled into an mkdtemp directory. The Node test streams repository source bytes; it never reads a host descriptor, endpoint, key, or secret file.
