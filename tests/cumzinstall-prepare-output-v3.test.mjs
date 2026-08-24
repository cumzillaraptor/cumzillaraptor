import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const scriptPath = path.join(root, 'scripts', 'cumzinstall-prepare-output-v3.sh');
const SOURCE = '/home/raspberrypi/workspace-cumzillaraptor/scripts/execute-devnet-deployment.mjs';
const DESTINATION = '/opt/cumzillaraptors-deploy-runtime/scripts/execute-devnet-deployment.mjs';
const SHA256 = '721fd1221f998c7b085491924dc60207dec45e328a7da1ebf3cd8c59de57421b';

function executableLines(source) {
  return source
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && !line.includes('Usage:'));
}

function exactLineIndex(source, line) {
  const index = source.split('\n').findIndex((candidate) => candidate === line);
  assert.notEqual(index, -1, `missing exact line: ${line}`);
  return index;
}

function lastExactLineIndex(source, line) {
  const index = source.split('\n').lastIndexOf(line);
  assert.notEqual(index, -1, `missing exact line: ${line}`);
  return index;
}

test('v3 prepare-output installer is root-first, fixed-purpose, and hash-pinned', async () => {
  const source = await readFile(scriptPath, 'utf8');

  assert.match(
    source,
    /^#!\/bin\/sh\nset -eu\n\nif \[ "\$\(\/usr\/bin\/id -u\)" -ne 0 \]; then\n  echo "Refusing: root is required\." >&2\n  exit 77\nfi\n\nif \[ "\$#" -ne 0 \]; then\n  echo "Usage: \/usr\/local\/sbin\/cumzinstall-prepare-output-v3" >&2\n  exit 64\nfi/m,
  );
  assert.equal((source.match(/\$#/g) ?? []).length, 1, 'only the no-argument guard may read the argument count');
  assert.match(source, new RegExp(`SRC=${SOURCE.replaceAll('.', '\\.')}`));
  assert.match(source, new RegExp(`DEST=${DESTINATION.replaceAll('.', '\\.')}`));
  assert.match(source, new RegExp(`EXPECTED_SHA256=${SHA256}`));
  assert.match(
    source,
    /require_metadata\(\) \{\n  \[ "\$\(\/usr\/bin\/stat -c '%F:%u:%g:%a' "\$1"\)" = 'regular file:0:0:600' \] \|\| refuse "File must be root-owned mode 0600\."\n\}/,
  );

  const sourceHash = exactLineIndex(source, 'require_hash "$SRC" "$EXPECTED_SHA256"');
  const destinationNotSymlink = exactLineIndex(source, '[ -f "$DEST" ] && [ ! -L "$DEST" ] || refuse "Existing destination must be a regular file."');
  const destinationMetadata = exactLineIndex(source, 'require_metadata "$DEST"');
  const restrictiveUmask = exactLineIndex(source, 'umask 077');
  const mktemp = exactLineIndex(source, 'TMP=$(/usr/bin/mktemp "$DEST_DIR/.execute-devnet-deployment.mjs.XXXXXX")');
  const tempOwner = exactLineIndex(source, '/usr/bin/chown root:root "$TMP"');
  const tempMode = exactLineIndex(source, '/usr/bin/chmod 600 "$TMP"');
  const copy = exactLineIndex(source, '/usr/bin/cp "$SRC" "$TMP"');
  const tempHash = exactLineIndex(source, 'require_hash "$TMP" "$EXPECTED_SHA256"');
  const tempMetadata = exactLineIndex(source, 'require_metadata "$TMP"');
  const move = exactLineIndex(source, '/usr/bin/mv -f "$TMP" "$DEST"');
  const finalHash = lastExactLineIndex(source, 'require_hash "$DEST" "$EXPECTED_SHA256"');
  const finalMetadata = lastExactLineIndex(source, 'require_metadata "$DEST"');

  assert.notEqual(tempMetadata, -1, 'missing temp post-copy metadata verification');
  assert.ok(sourceHash < destinationNotSymlink && destinationNotSymlink < destinationMetadata, 'verify source hash, then destination regular/non-symlink metadata');
  assert.ok(destinationMetadata < restrictiveUmask && restrictiveUmask < mktemp, 'set umask before making temp under DEST_DIR');
  assert.ok(mktemp < tempOwner && tempOwner < tempMode && tempMode < copy, 'harden temp ownership and mode before copy');
  assert.ok(copy < tempHash && tempHash < tempMetadata && tempMetadata < move, 'verify copied temp hash and metadata before move');
  assert.ok(move < finalHash && finalHash < finalMetadata, 'move before final destination hash and metadata verification');

  assert.match(source, /cleanup\(\) \{[\s\S]*\/usr\/bin\/rm -f "\$TMP"[\s\S]*\}/);
  assert.match(source, /trap cleanup 0 HUP INT TERM/);
});

test('v3 prepare-output installer permits no caller-controlled install inputs or unsafe operations', async () => {
  const source = await readFile(scriptPath, 'utf8');
  const executable = executableLines(source);
  const nonAssignmentExecutable = executable.filter((line) => !/^(?:SRC|DEST|DEST_DIR|EXPECTED_SHA256|TMP)=/.test(line));
  const executableSource = nonAssignmentExecutable.join('\n');

  assert.doesNotMatch(source, /"\$@"|"\$\*"|\$\{/);
  assert.doesNotMatch(
    executableSource,
    /\b(?:curl|wget|fetch|nc|ncat|netcat|ssh|scp|sftp|ftp|telnet|aria2c|rsync|sudo|su|doas|npm|npx|pnpm|yarn|git|solana|spl-token|anchor|rpc|keypair|private[_-]?key|seed(?:phrase)?|sign|send|deploy|commit|push)\b/i,
  );
  assert.doesNotMatch(
    executableSource,
    /(?:^|[;|&]\s*)(?:sh|bash|dash|zsh|ksh|eval|exec|source|xargs|env|timeout|nohup|setsid|python(?:3)?|perl|ruby|php|lua|deno|bun|spawn(?:Sync)?|execFile(?:Sync)?|fork)\b/im,
  );

  const nodeLines = executable.filter((line) => /\bnode(?:js)?\b/i.test(line));
  assert.deepEqual(nodeLines, ['/usr/bin/node --check "$DEST"'], 'the only Node invocation must syntax-check the fixed destination');
  assert.equal((source.match(/\/usr\/bin\/node --check "\$DEST"/g) ?? []).length, 1);
  assert.doesNotMatch(source, /\/usr\/bin\/node\s+--test\b/);
  assert.doesNotMatch(source, /tests\/cumzinstall-prepare-output-v3\.test\.mjs/);
});

test('v3 prepare-output installer source has valid POSIX shell syntax', async () => {
  const { status, stderr } = await new Promise((resolve, reject) => {
    const child = spawn('/bin/sh', ['-n', scriptPath], { stdio: ['ignore', 'ignore', 'pipe'] });
    let error = '';
    child.stderr.on('data', (chunk) => { error += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ status: code, stderr: error }));
  });
  assert.equal(status, 0, stderr);
});

// Static source tests only. This suite never executes the root-only installer.
