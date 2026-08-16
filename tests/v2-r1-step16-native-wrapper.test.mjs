import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rename, rm, symlink, writeFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const SOURCE = new URL('../tools/v2_r1_helius_handoff/native_wrapper.c', import.meta.url);
const GENERATED_CONFIG = new URL('../tools/v2_r1_helius_handoff/generated_owner_config.h', import.meta.url);
const FIXTURE_SOURCE = new URL('./fixtures/v2-r1-native-wrapper-fixture.c', import.meta.url);
const CONTRACT = new URL('../docs/operations/v2-r1-step16-native-wrapper-review.md', import.meta.url);
const CC = '/usr/bin/cc';
const SECRET_NAME = 'helius-devnet-rpc.url';
const VALID_URL = 'https://devnet.helius-rpc.com/?api-key=token_ABC-123';
const uid = process.getuid();
const gid = process.getgid();

function compilerDefine(name, value) {
  return `-D${name}=${typeof value === 'number' ? value : JSON.stringify(value)}`;
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'cumz-native-wrapper-'));
  await chmod(root, 0o700);
  let parent = root;
  for (const component of ['home', 'piadmin', '.config', 'cumzillaraptors']) {
    parent = join(parent, component);
    await mkdir(parent, { mode: 0o700 });
    await chmod(parent, 0o700);
  }
  const secret = join(parent, SECRET_NAME);
  await writeFile(secret, VALID_URL, { mode: 0o600 });
  await chmod(secret, 0o600);
  return { root, parent, secret };
}

async function compile(root, { expectedUid = uid, expectedGid = gid, swapAfterOpen = false } = {}) {
  const binary = join(root, 'native-wrapper');
  const args = [
    '-std=c11', '-D_POSIX_C_SOURCE=200809L', '-Wall', '-Wextra', '-Werror',
    compilerDefine('TEST_FIXTURE_ROOT', root),
    compilerDefine('TEST_FIXTURE_ROOT_UID', uid),
    compilerDefine('TEST_FIXTURE_ROOT_GID', gid),
    compilerDefine('TEST_FIXTURE_EXPECTED_UID', expectedUid),
    compilerDefine('TEST_FIXTURE_EXPECTED_GID', expectedGid),
    ...(swapAfterOpen ? [compilerDefine('TEST_FIXTURE_SWAP_AFTER_OPEN', 1)] : []),
    new URL(FIXTURE_SOURCE).pathname, '-o', binary,
  ];
  const result = spawnSync(CC, args, { encoding: 'utf8' });
  assert.equal(result.status, 0, `fixture compilation failed: ${result.stderr}`);
  return binary;
}

function invoke(binary, args = []) {
  return spawnSync(binary, args, { encoding: 'utf8' });
}

function opaque(result) {
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /^native-wrapper-refused\n$/);
  assert.equal(result.stdout, '');
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, /token_ABC-123|helius-rpc\.com|attacker|api-key/i);
}

async function withFixture(callback) {
  const tree = await fixture();
  try { await callback(tree); } finally { await rm(tree.root, { recursive: true, force: true }); }
}

test('native wrapper fixture build is available (RED until native source exists)', async () => {
  await withFixture(async ({ root }) => {
    await compile(root);
  });
});

test('test-only fixture wrapper accepts only a held valid FD and produces no endpoint output', async () => {
  await withFixture(async ({ root }) => {
    const result = invoke(await compile(root));
    assert.equal(result.status, 0);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, '');
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, /helius-rpc\.com|token|api-key/i);
  });
});

test('wrapper refuses symlinked directory chain and final basename without endpoint echo', async () => {
  await withFixture(async ({ root }) => {
    const binary = await compile(root);
    await rm(join(root, 'home', 'piadmin', '.config'), { recursive: true });
    await symlink('/tmp', join(root, 'home', 'piadmin', '.config'));
    opaque(invoke(binary));
  });
  await withFixture(async ({ root, secret }) => {
    const binary = await compile(root);
    await rename(secret, `${secret}.real`);
    await symlink(`${SECRET_NAME}.real`, secret);
    opaque(invoke(binary));
  });
});

test('wrapper refuses immediate-parent/file mode and configured-owner mismatches', async () => {
  await withFixture(async ({ root, parent, secret }) => {
    const binary = await compile(root);
    await chmod(parent, 0o755);
    opaque(invoke(binary));
    await chmod(parent, 0o700);
    await chmod(secret, 0o640);
    opaque(invoke(binary));
  });
  await withFixture(async ({ root }) => {
    const binary = await compile(root, { expectedUid: uid + 1 });
    opaque(invoke(binary));
  });
});

test('wrapper rejects malformed raw URL without echoing it', async () => {
  await withFixture(async ({ root, secret }) => {
    await writeFile(secret, `${VALID_URL}\n`, { mode: 0o600 });
    await chmod(secret, 0o600);
    opaque(invoke(await compile(root)));
  });
});

test('test-only final-name replacement after open still consumes held FD bytes, not swapped pathname bytes', async () => {
  await withFixture(async ({ root, secret }) => {
    const binary = await compile(root, { swapAfterOpen: true });
    const result = invoke(binary);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, '');
    const swapped = await readFile(secret, 'utf8');
    assert.match(swapped, /attacker\.invalid/);
  });
});

test('wrapper accepts no arguments only', async () => {
  await withFixture(async ({ root }) => {
    opaque(invoke(await compile(root), ['caller-controlled-path']));
  });
});

test('production compilation fails closed until a separately authorized generated identity header replaces the repository placeholder', async () => {
  await withFixture(async ({ root }) => {
    const binary = join(root, 'production-wrapper');
    const result = spawnSync(CC, ['-std=c11', '-D_POSIX_C_SOURCE=200809L', '-Wall', '-Wextra', '-Werror', new URL(SOURCE).pathname, '-o', binary], { encoding: 'utf8' });
    assert.notEqual(result.status, 0, 'repository placeholder must not produce an executable');
    assert.match(result.stderr, /generated_owner_config\.h|authorized generated owner configuration/i);
  });
});

test('production source has no test-root or caller-macro identity override; C preprocessor expression injection cannot affect it', async () => {
  const source = await readFile(SOURCE, 'utf8');
  assert.doesNotMatch(source, /HELIUS_HANDOFF_TEST_ONLY|HELIUS_HANDOFF_TEST_ROOT|TEST_FIXTURE/);
  assert.doesNotMatch(source, /HELIUS_HANDOFF_EXPECTED_UID|HELIUS_HANDOFF_EXPECTED_GID/);
  assert.match(source, /#include "generated_owner_config\.h"/);
  assert.match(source, /open\("\/", O_RDONLY \| O_DIRECTORY \| O_NOFOLLOW \| O_CLOEXEC\)/);
  assert.match(source, /st->st_uid == \(uid_t\)0.*st->st_gid == \(gid_t\)0.*exact_mode\(st, 0755\)/s);

  await withFixture(async ({ root }) => {
    const binary = join(root, 'production-with-expression-injection');
    const result = spawnSync(CC, [
      '-std=c11', '-D_POSIX_C_SOURCE=200809L', '-Wall', '-Wextra', '-Werror',
      '-DHELIUS_HANDOFF_EXPECTED_UID=st->st_uid',
      '-DHELIUS_HANDOFF_EXPECTED_GID=st->st_gid',
      new URL(SOURCE).pathname, '-o', binary,
    ], { encoding: 'utf8' });
    assert.notEqual(result.status, 0, 'injected C expressions must not produce a production executable');
    assert.match(result.stderr, /generated_owner_config\.h|authorized generated owner configuration/i);
  });
});

test('source and companion review retain the narrowly scoped no-transport/no-authority boundary', async () => {
  const [source, generatedConfig, contract] = await Promise.all([
    readFile(SOURCE, 'utf8'), readFile(GENERATED_CONFIG, 'utf8'), readFile(CONTRACT, 'utf8'),
  ]);
  assert.match(generatedConfig, /#error\s+"authorized generated owner configuration/);
  assert.doesNotMatch(generatedConfig, /HELIUS_HANDOFF_GENERATED_OWNER_(?:UID|GID)/);
  assert.match(contract, /fixed checked header path/i);
  assert.match(contract, /reject arbitrary compiler `-D` identity definitions and arbitrary `-include` paths/i);
  assert.match(contract, /grammar `0\|\[1-9\]\[0-9\]\*`/);
  assert.match(source, /\/home\/piadmin\/\.config\/cumzillaraptors\/helius-devnet-rpc\.url/);
  assert.match(source, /O_DIRECTORY \| O_NOFOLLOW \| O_CLOEXEC/);
  assert.match(source, /openat/);
  assert.match(source, /fstat/);
  assert.match(source, /\[A-Za-z0-9_-\]/);
  assert.doesNotMatch(source, /#include\s*<(?:netdb|arpa\/inet|sys\/socket|curl)>/);
  assert.doesNotMatch(source, /\b(?:exec(?:ve|vp|v|le|lp)?|fork|system|popen)\s*\(/);
  assert.doesNotMatch(source, /\b(?:connect|send|recv|socket|curl_easy_)\s*\(/);
  for (const phrase of [
    'review-only', 'No RPC request, reviewer invocation, or transport exists here',
    'cannot use argv, environment, or temporary files', 'separately reviewed in-process consumer/interface',
    'no uid or gid for piadmin', 'not host execution authority',
  ]) assert.match(contract, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

// All filesystem operations above target mkdtemp fixture trees only; this test never accesses /home/piadmin, a secret, network, RPC, keys, signing, or deployment.
