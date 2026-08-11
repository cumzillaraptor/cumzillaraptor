import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const installerPath = path.join(root, 'scripts', 'cumzinstall-prepare-output-v4.sh');
const manifestPath = path.join(root, 'scripts', 'cumzinstall-prepare-output-v4.manifest');
const bootstrapDocumentPath = path.join(root, 'docs', 'operations', 'cumzinstall-prepare-output-v4-bootstrap.md');
const harnessPath = path.join(root, 'tests', 'cumzinstall-prepare-output-v4-bootstrap-harness.mjs');

const STAGE_DIR = '/usr/local/lib/cumzillaraptors-maintenance/prepare-output-v4';
const INSTALLER = `${STAGE_DIR}/cumzinstall-prepare-output-v4.sh`;
const EXECUTOR = `${STAGE_DIR}/execute-devnet-deployment.mjs`;
const MANIFEST = `${STAGE_DIR}/cumzinstall-prepare-output-v4.manifest`;
const DEST = '/opt/cumzillaraptors-deploy-runtime/scripts/execute-devnet-deployment.mjs';
const DEST_DIR = '/opt/cumzillaraptors-deploy-runtime/scripts';
const EXECUTOR_SHA256 = '721fd1221f998c7b085491924dc60207dec45e328a7da1ebf3cd8c59de57421b';

function sha256(source) {
  return createHash('sha256').update(source).digest('hex');
}

function lineIndex(source, line) {
  const index = source.split('\n').findIndex((candidate) => candidate.trim() === line);
  assert.notEqual(index, -1, `missing exact line: ${line}`);
  return index;
}

function executableLines(source) {
  return source.split('\n').map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));
}

function commandSubstitutions(source) {
  const substitutions = [];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] !== '$' || source[index + 1] !== '(') continue;
    let depth = 1;
    let quote = '';
    const start = index + 2;
    for (index = start; index < source.length; index += 1) {
      const character = source[index];
      if (quote) {
        if (character === quote && source[index - 1] !== '\\') quote = '';
        continue;
      }
      if (character === "'" || character === '"') {
        quote = character;
      } else if (character === '(') {
        depth += 1;
      } else if (character === ')' && --depth === 0) {
        substitutions.push(source.slice(start, index));
        break;
      }
    }
    assert.equal(depth, 0, 'command substitution must be balanced');
  }
  return substitutions;
}

function commandSubstitutionPipelineCommands(source) {
  return commandSubstitutions(source).flatMap((substitution) => [...substitution.matchAll(/(?:^|\|)\s*([^\s|;]+)/gm)].map((match) => match[1]));
}

function assertCommandSubstitutionPipelinesUseTrustedPaths(source, allowedShellFunctions = []) {
  const allowed = new Set(allowedShellFunctions);
  const commands = commandSubstitutionPipelineCommands(source);
  assert.ok(commands.length > 0, 'expected command substitutions or pipelines to inspect');
  for (const command of commands) {
    assert.ok(command.startsWith('/usr/bin/') || allowed.has(command), `untrusted command-substitution/pipeline command: ${command}`);
  }
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], ...options });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

test('v4 installer is a fixed, root-staged, no-argument artifact and validates its own staged identity', async () => {
  const [source, manifest] = await Promise.all([readFile(installerPath, 'utf8'), readFile(manifestPath, 'utf8')]);

  assert.match(source, /^#!\/bin\/sh\nset -eu\nPATH=\/usr\/sbin:\/usr\/bin:\/sbin:\/bin\n/m);
  assert.match(source, new RegExp(`^STAGE_DIR=${STAGE_DIR.replaceAll('/', '\\/')}$`, 'm'));
  assert.match(source, new RegExp(`^SELF=${INSTALLER.replaceAll('/', '\\/').replaceAll('.', '\\.')}$`, 'm'));
  assert.match(source, new RegExp(`^STAGED_EXECUTOR=${EXECUTOR.replaceAll('/', '\\/').replaceAll('.', '\\.')}$`, 'm'));
  assert.match(source, new RegExp(`^MANIFEST=${MANIFEST.replaceAll('/', '\\/').replaceAll('.', '\\.')}$`, 'm'));
  assert.match(source, /^DEST=\/opt\/cumzillaraptors-deploy-runtime\/scripts\/execute-devnet-deployment\.mjs$/m);
  assert.match(source, /^DEST_DIR=\/opt\/cumzillaraptors-deploy-runtime\/scripts$/m);
  assert.match(source, /if \[ "\$\(\/usr\/bin\/id -u\)" -ne 0 \]; then[\s\S]*exit 77[\s\S]*fi/m);
  assert.match(source, /if \[ "\$#" -ne 0 \]; then[\s\S]*exit 64[\s\S]*fi/m);
  assert.match(source, /\[ "\$0" = "\$SELF" \] \|\| refuse "Must execute only the fixed root-staged installer path\."/);
  assert.match(source, /require_regular_root_file_mode "\$SELF" 700/);
  assert.match(source, /require_regular_root_file_mode "\$STAGED_EXECUTOR" 600/);
  assert.match(source, /require_regular_root_file_mode "\$MANIFEST" 600/);
  assert.match(source, /require_hash "\$SELF" "\$INSTALLER_SHA256"/);
  assert.match(source, /require_hash "\$STAGED_EXECUTOR" "\$EXECUTOR_SHA256"/);
  assert.match(manifest, new RegExp(`^EXECUTOR_SHA256=${EXECUTOR_SHA256}$`, 'm'));
  assert.match(manifest, /^INSTALLER_SHA256=[a-f0-9]{64}$/m);
  assert.doesNotMatch(source, /workspace-cumzillaraptor|\/home\/|\$PWD|\$\{PWD\}|dirname "\$0"/);
});

test('v4 installer validates every staging and destination directory before fixed atomic replacement', async () => {
  const source = await readFile(installerPath, 'utf8');
  const requiredDirectories = [
    '/', '/usr', '/usr/local', '/usr/local/lib', '/usr/local/lib/cumzillaraptors-maintenance', STAGE_DIR,
    '/opt', '/opt/cumzillaraptors-deploy-runtime', DEST_DIR,
  ];
  for (const directory of requiredDirectories) {
    assert.match(source, new RegExp(`require_secure_directory "${directory.replaceAll('/', '\\/')}"`));
  }
  assert.ok(source.includes('[ "$DEST_DIR" = "$(/usr/bin/dirname "$DEST")" ] || refuse "DEST_DIR must be the exact dirname of DEST."'));
  assert.match(source, /\[ -d "\$1" \] && \[ ! -L "\$1" \] \|\| refuse "Required directory is missing or is a symlink\."/);
  assert.match(source, /stat -c '%F:%u:%g:%a' "\$1"/);
  assert.match(source, /case "\$mode" in[\s\S]*\*\[2367\]\|\*\[2367\]\?\)/m);

  const directoryValidation = lineIndex(source, 'validate_directories');
  const selfMetadata = lineIndex(source, 'require_regular_root_file_mode "$SELF" 700');
  const selfHash = lineIndex(source, 'require_hash "$SELF" "$INSTALLER_SHA256"');
  const executorHash = lineIndex(source, 'require_hash "$STAGED_EXECUTOR" "$EXECUTOR_SHA256"');
  const destinationMetadata = lineIndex(source, 'require_regular_root_file_mode "$DEST" 600');
  const temp = lineIndex(source, 'TMP=$(/usr/bin/mktemp "$DEST_DIR/.execute-devnet-deployment.mjs.v4.XXXXXX")');
  const copy = lineIndex(source, '/usr/bin/cp "$STAGED_EXECUTOR" "$TMP"');
  const move = lineIndex(source, '/usr/bin/mv -f "$TMP" "$DEST"');
  const syntaxCheck = lineIndex(source, '/usr/bin/node --check "$DEST"');
  assert.ok(directoryValidation < selfMetadata && selfMetadata < selfHash && selfHash < executorHash, 'validate paths and staged identities before touching destination');
  assert.ok(executorHash < destinationMetadata && destinationMetadata < temp && temp < copy && copy < move && move < syntaxCheck, 'atomically replace only after staged executor validation');
});

test('v4 bootstrap pins sources, rejects reuse, validates the secure root chain, and executes only a staged installer', async () => {
  const [document, manifest, installer, executor] = await Promise.all([
    readFile(bootstrapDocumentPath, 'utf8'),
    readFile(manifestPath),
    readFile(installerPath),
    readFile(path.join(root, 'scripts', 'execute-devnet-deployment.mjs')),
  ]);
  const installerHash = sha256(installer);
  const executorHash = sha256(executor);
  const manifestHash = sha256(manifest);
  assert.match(document, /Template only — do not execute this document/);
  assert.match(document, /^PATH=\/usr\/sbin:\/usr\/bin:\/sbin:\/bin$/m);
  assert.match(document, new RegExp(STAGE_DIR.replaceAll('/', '\\/')));
  const rootChain = ['/', '/usr', '/usr/local', '/usr/local/lib', '/usr/local/lib/cumzillaraptors-maintenance'];
  for (const directory of rootChain) {
    assert.match(document, new RegExp(`require_secure_root_directory "${directory.replaceAll('/', '\\/')}"`));
  }
  const rootChainDeclaration = lineIndex(document, 'require_secure_root_chain() {');
  for (const [index, directory] of rootChain.entries()) {
    assert.equal(
      lineIndex(document, `require_secure_root_directory "${directory}"`) - rootChainDeclaration,
      index + 1,
      `root-chain member ${directory} must retain its fixed position`,
    );
  }
  assert.match(document, /\[ ! -e "\$STAGE_DIR" \] && \[ ! -L "\$STAGE_DIR" \] \|\| refuse "Staging directory must not already exist\."/);
  assert.match(document, /\/usr\/bin\/mkdir -m 700 "\$STAGE_DIR"/);
  assert.match(document, /require_exact_root_stage_directory "\$STAGE_DIR"/);
  assert.match(document, /require_staged_regular_file\(\) \{[\s\S]*\[ -f "\$1" \] && \[ ! -L "\$1" \] \|\| refuse "Staged artifact is missing, not regular, or is a symlink\."/m);
  assert.match(document, /copy_and_verify\(\) \{[\s\S]*require_source_regular "\$source"[\s\S]*hash_file "\$source"[\s\S]*require_source_regular "\$source"[\s\S]*\/usr\/bin\/cp --no-dereference "\$source" "\$staged"[\s\S]*require_staged_regular_file "\$staged"[\s\S]*\/usr\/bin\/chown root:root "\$staged"[\s\S]*\/usr\/bin\/chmod "\$mode" "\$staged"[\s\S]*require_staged_regular_root_file "\$staged" "\$mode"[\s\S]*hash_file "\$staged"/m);
  const copied = lineIndex(document, '/usr/bin/cp --no-dereference "$source" "$staged"');
  const stagedType = lineIndex(document, 'require_staged_regular_file "$staged"');
  const stagedChown = lineIndex(document, '/usr/bin/chown root:root "$staged"');
  const stagedChmod = lineIndex(document, '/usr/bin/chmod "$mode" "$staged"');
  const stagedMetadata = lineIndex(document, 'require_staged_regular_root_file "$staged" "$mode"');
  const stagedHash = lineIndex(document, '[ "$(hash_file "$staged")" = "$expected" ] || refuse "Staged SHA-256 mismatch."');
  assert.ok(copied < stagedType && stagedType < stagedChown && stagedChown < stagedChmod && stagedChmod < stagedMetadata && stagedMetadata < stagedHash, 'staged non-symlink regular-file validation must precede metadata mutation and exact metadata/hash validation must follow it');
  for (const artifact of ['INSTALLER', 'EXECUTOR', 'MANIFEST']) {
    assert.match(document, new RegExp(`copy_and_verify "\\$SOURCE_${artifact}" "\\$STAGED_${artifact}" "\\$EXPECTED_${artifact}_SHA256"`));
  }
  assert.match(document, /\/usr\/bin\/cp --no-dereference "\$source" "\$staged"/);
  assert.match(document, /require_staged_regular_root_file "\$staged" "\$mode"/);
  assert.match(document, /require_secure_root_chain\nrequire_exact_root_stage_directory "\$STAGE_DIR"\nrequire_staged_regular_root_file "\$STAGED_INSTALLER" 700/);
  assert.match(document, /exec "\$STAGED_INSTALLER"/);
  assert.doesNotMatch(document, /exec "\$SOURCE_INSTALLER"|\/bin\/sh "\$SOURCE_INSTALLER"/);
  assert.doesNotMatch(document, /\bsudo\b|\bcurl\b|\bwget\b|\bssh\b|\bscp\b|\bsolana\b|\banchor\b|\brpc\b|\bkeypair\b|\bgit (?:commit|push)\b/i);
  assert.match(manifest.toString(), new RegExp(`^INSTALLER_SHA256=${installerHash}$`, 'm'));
  assert.match(manifest.toString(), /^EXECUTOR_SHA256=721fd1221f998c7b085491924dc60207dec45e328a7da1ebf3cd8c59de57421b$/m);
  assert.equal(executorHash, EXECUTOR_SHA256, 'reviewed executor bytes must retain the fixed SHA-256');
  assert.match(document, new RegExp(`^EXPECTED_INSTALLER_SHA256=${installerHash}$`, 'm'));
  assert.match(document, new RegExp(`^EXPECTED_EXECUTOR_SHA256=${executorHash}$`, 'm'));
  assert.match(document, new RegExp(`^EXPECTED_MANIFEST_SHA256=${manifestHash}$`, 'm'));
});

test('v4 bootstrap and staged installer use trusted paths in every command substitution and pipeline, with an executable unprivileged semantic harness', async () => {
  const [document, installer] = await Promise.all([readFile(bootstrapDocumentPath, 'utf8'), readFile(installerPath, 'utf8')]);
  const bootstrap = document.match(/```sh\n([\s\S]*?)\n```/)?.[1];
  assert.ok(bootstrap, 'bootstrap shell block must exist');
  assertCommandSubstitutionPipelinesUseTrustedPaths(bootstrap, ['hash_file']);
  assertCommandSubstitutionPipelinesUseTrustedPaths(installer, ['hash_file']);
  assert.doesNotMatch(installer, /(?:^|\n)\s*printf\b/m, 'installer output must use the trusted printf path');
  assert.doesNotMatch(installer, /(?:^|[|]\s*)wc\b/m, 'installer count checks must use the trusted wc path');
  const result = await run('/usr/bin/node', [harnessPath], { cwd: root, env: { ...process.env, PATH: '/definitely-hostile-path' } });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /PASS pre-existing-symlink/);
  assert.match(result.stdout, /PASS root-symlink/);
  assert.match(result.stdout, /PASS hostile-PATH/);
  assert.match(result.stdout, /PASS source-symlink/);
  assert.match(result.stdout, /PASS source-to-symlink-at-cp/);
  assert.match(result.stdout, /PASS staged-only-execution/);
  assert.match(result.stdout, /PASS post-copy-hash-race/);
});

test('v4 source prohibits checkout execution, caller-controlled inputs, and unsafe operational binaries', async () => {
  const [source, document] = await Promise.all([readFile(installerPath, 'utf8'), readFile(bootstrapDocumentPath, 'utf8')]);
  const executable = executableLines(source)
    .filter((line) => !/^(?:PATH|STAGE_DIR|SELF|STAGED_EXECUTOR|MANIFEST|DEST|DEST_DIR|TMP|INSTALLER_SHA256|EXECUTOR_SHA256|metadata|mode)=/.test(line))
    .join('\n');
  assert.doesNotMatch(source, /"\$@"|"\$\*"|\$\{(?:[A-Za-z_][A-Za-z0-9_]*)/);
  assert.doesNotMatch(executable, /(?:^|\n)\s*(?:\/\S+\/)?(?:curl|wget|fetch|nc|ncat|netcat|ssh|scp|sftp|ftp|telnet|rsync|sudo|su|doas|npm|npx|pnpm|yarn|git|solana|spl-token|anchor)\b/im);
  assert.doesNotMatch(executable, /(?:^|[;|&]\s*)(?:sh|bash|dash|zsh|ksh|eval|exec|source|xargs|env|timeout|nohup|setsid|python(?:3)?|perl|ruby|php|lua|deno|bun)\b/im);
  assert.equal((source.match(/\/usr\/bin\/node --check "\$DEST"/g) ?? []).length, 1);
  assert.doesNotMatch(source, /\/usr\/bin\/node\s+--test\b/);
  assert.doesNotMatch(document, /chmod [^\n]*777|chown [^\n]*(?:piadmin|raspberrypi)/);
});

test('v4 installer source has valid POSIX shell syntax', async () => {
  const { status, stderr } = await run('/bin/sh', ['-n', installerPath]);
  assert.equal(status, 0, stderr);
});
