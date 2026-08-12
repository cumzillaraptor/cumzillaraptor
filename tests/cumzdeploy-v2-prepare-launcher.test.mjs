import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const ROOT = '/opt/cumzillaraptors-send-runtime-candidate-v2';
const SCRIPT = new URL('../scripts/cumzdeploy-v2-prepare-launcher.sh', import.meta.url);
const ARGV = Object.freeze(['/usr/bin/node', `${ROOT}/scripts/v2-root-runtime-prepare-coordinator.mjs`, '--prepare']);
const ENV = Object.freeze({ PATH: '/usr/sbin:/usr/bin:/sbin:/bin', LC_ALL: 'C', HOME: '/nonexistent' });
const DENIAL = Object.freeze({ ok: false, reason: 'invalid-input' });

function fakeAdapter({ stdout = '{"approved":false}\n', stderr = '' } = {}) {
  const calls = [];
  return Object.freeze({
    calls,
    run(specification) { calls.push(specification); return Object.freeze({ stdout, stderr }); },
  });
}

function assertDenied(result) {
  assert.deepEqual(result, DENIAL);
  assert.equal(Object.isFrozen(result), true);
  assert.doesNotMatch(JSON.stringify(result), /(?:key|artifact|endpoint|cli|path|cwd|shell|secret|token|authorization|credential|password|https?:)/i);
}

test('Task 5 static launcher is root-only, captures candidate output, and never directly execs it', async () => {
  const source = await readFile(SCRIPT, 'utf8');
  assert.match(source, /^#!\/bin\/sh\n/);
  assert.match(source, /id -u[\s\S]*root/i);
  assert.match(source, /\[ "\$#" -eq 0 \]/);
  assert.match(source, new RegExp(`/usr/bin/env -i PATH=/usr/sbin:/usr/bin:/sbin:/bin LC_ALL=C HOME=/nonexistent /usr/bin/node ${ROOT.replaceAll('/', '\\/')}\/scripts\/v2-root-runtime-prepare-coordinator\\.mjs --prepare`));
  assert.match(source, new RegExp(`cd -- ${ROOT.replaceAll('/', '\\/')}`));
  assert.match(source, /<\/dev\/null/);
  assert.match(source, />"\$stdout_file" 2>"\$stderr_file"/);
  assert.match(source, /--input-type=module - "\$stdout_file"/);
  assert.match(source, /JSON\.parse[\s\S]*Array\.isArray[\s\S]*JSON\.stringify/);
  assert.match(source, /stderr_bytes=.*wc -c[\s\S]*redact_stderr/);
  assert.doesNotMatch(source, /\bexec\b/);
  assert.doesNotMatch(source, /printf[^\n]*safe_stderr|printf[^\n]*stdout_file/);
  assert.doesNotMatch(source, /\$PATH|which|command -v|\beval\b|\bsh -c\b|\$\(.*(?:pwd|dirname)/);
  assert.doesNotMatch(source, /--send|keypair|solana|curl|wget|npm|sudo/i);
});

test('pure launcher contract models one fixed invocation using a fake unprivileged command-path harness only', async () => {
  const { makePrepareLauncherContract, modelPrepareLauncher } = await import('../scripts/cumzdeploy-v2-prepare-launcher-contract.mjs');
  const contract = makePrepareLauncherContract();
  assert.deepEqual(contract, Object.freeze({ uid: 0, argv: ARGV, cwd: ROOT, stdin: '/dev/null', env: ENV }));
  assert.equal(Object.isFrozen(contract), true);

  // This fake adapter is the unprivileged command-path harness: it records data only and never spawns the .sh source.
  const adapter = fakeAdapter();
  const result = modelPrepareLauncher(Object.freeze({ uid: 0, argv: Object.freeze([]) }), adapter);
  assert.deepEqual(adapter.calls, [contract]);
  const [captured] = adapter.calls;
  assert.deepEqual(captured.argv, ARGV);
  assert.equal(captured.cwd, ROOT);
  assert.deepEqual(captured.env, ENV);
  assert.equal(captured.stdin, '/dev/null');
  assert.deepEqual(Object.keys(captured).sort(), ['argv', 'cwd', 'env', 'stdin', 'uid']);
  assert.equal('shell' in captured, false);
  assert.equal(JSON.stringify(captured).includes('$(touch /tmp/pwned)'), false);
  assert.deepEqual(result, Object.freeze({ ok: true, stdout: '{"ok":true,"review":{"approved":false}}\n', stderr: '' }));
  assert.equal(Object.isFrozen(result), true);
});

test('pure launcher accepts exactly one canonical newline JSON review object and emits one canonical envelope', async () => {
  const { modelPrepareLauncher } = await import('../scripts/cumzdeploy-v2-prepare-launcher-contract.mjs');
  const request = Object.freeze({ uid: 0, argv: Object.freeze([]) });
  const result = modelPrepareLauncher(request, fakeAdapter({ stdout: '{"decision":"review","facts":["unsigned"]}\n', stderr: 'review unavailable\n' }));
  assert.deepEqual(result, Object.freeze({ ok: true, stdout: '{"ok":true,"review":{"decision":"review","facts":["unsigned"]}}\n', stderr: 'review unavailable\n' }));
  for (const stdout of [
    '{"ok":true}', '{"ok":true}\n{}\n', '{"ok":true}\ntrailing', '{"ok":true}\n\n',
    'not-json\n', 'null\n', 'false\n', '[]\n', '{"ok":true} \n', '{"endpoint":"https://user:secret@example.test/path?q=x#f"}\n',
  ]) assertDenied(modelPrepareLauncher(request, fakeAdapter({ stdout })));
});

test('pure launcher denies and never echoes sensitive or oversized captured stderr', async () => {
  const { modelPrepareLauncher } = await import('../scripts/cumzdeploy-v2-prepare-launcher-contract.mjs');
  const request = Object.freeze({ uid: 0, argv: Object.freeze([]) });
  for (const stderr of [
    'https://user:secret@example.test/path/to/rpc?token=abc#fragment',
    'endpoint=https://example.test/api/v1?x=1', 'artifact=/tmp/program.so',
    'Authorization: Bearer abc123', 'token=abc123', 'secret: abc123', 'key=/root/keypair.json',
    'password=hunter2', 'credential=alice:correct-horse-battery-staple', 'user=alice pass=letmein',
    'x'.repeat(513),
  ]) assertDenied(modelPrepareLauncher(request, fakeAdapter({ stderr })));
});

test('pure no-argument launcher model rejects every user argument, including shell-shaped input, without calling its adapter', async () => {
  const { modelPrepareLauncher } = await import('../scripts/cumzdeploy-v2-prepare-launcher-contract.mjs');
  for (const request of [
    { uid: 0, argv: Object.freeze(['--prepare']) }, { uid: 0, argv: Object.freeze(['--send']) }, { uid: 0, argv: Object.freeze(['/root/keypair.json']) },
    { uid: 0, argv: Object.freeze(['/tmp/program.so']) }, { uid: 0, argv: Object.freeze(['https://rpc.example.test']) },
    { uid: 0, argv: Object.freeze(['$(touch /tmp/pwned)']) }, { uid: 0, argv: Object.freeze(['--unknown']) },
    { uid: 1000, argv: Object.freeze([]) }, { uid: 0, argv: Object.freeze([]), cwd: '/caller' },
    { uid: 0, argv: Object.freeze([]), shell: true }, { uid: 0, argv: Object.freeze([]), lookupPath: '/attacker/bin' },
  ]) {
    const adapter = fakeAdapter();
    assertDenied(modelPrepareLauncher(Object.freeze(request), adapter));
    assert.deepEqual(adapter.calls, []);
  }
});

// The contract is evaluated with a fake adapter; these tests never execute the shell source or spawn a process.
