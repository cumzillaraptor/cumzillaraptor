#!/usr/bin/env node
// Unprivileged semantic harness for the documented root bootstrap. It adapts the
// template into a temporary tree and replaces root identity checks with this
// process's uid/gid. Metadata wrappers record their arguments and exec the real
// utilities, preserving their command-line symlink dereference semantics.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rename, rm, symlink, writeFile, chmod, access, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const documentPath = path.join(root, 'docs', 'operations', 'cumzinstall-prepare-output-v4-bootstrap.md');
const realUtilities = ['id', 'sha256sum', 'awk', 'stat', 'mkdir', 'chown', 'chmod', 'cp', 'printf'];

const hash = (value) => createHash('sha256').update(value).digest('hex');
const run = (file, args, options) => new Promise((resolve, reject) => {
  const child = spawn(file, args, { stdio: ['ignore', 'pipe', 'pipe'], ...options });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.on('error', reject);
  child.on('close', (status) => resolve({ status, stdout, stderr }));
});

async function makeWrapper(toolDir, name) {
  const wrapper = path.join(toolDir, name);
  const instrument = name === 'chown' || name === 'chmod'
    ? `/usr/bin/printf '%s:%s\\n' ${JSON.stringify(name)} "$*" >> "$HARNESS_METADATA_LOG"\n`
    : '';
  const body = `#!/bin/sh\n${instrument}exec /usr/bin/${name} "$@"\n`;
  await writeFile(wrapper, body, { mode: 0o700 });
  await chmod(wrapper, 0o700);
}

async function materialize(scenario) {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'cumz-v4-bootstrap-'));
  const sourceDir = path.join(temp, 'source');
  const fixtureRoot = path.join(temp, 'root');
  const chain = path.join(fixtureRoot, 'usr', 'local', 'lib', 'cumzillaraptors-maintenance');
  const stage = path.join(chain, 'prepare-output-v4');
  const tools = path.join(temp, 'absolute-tools');
  const shadow = path.join(temp, 'hostile-path');
  const marker = path.join(temp, 'executed');
  const metadataLog = path.join(temp, 'metadata-commands');
  const raceReferent = path.join(temp, 'race-referent');
  await Promise.all([mkdir(sourceDir, { recursive: true }), mkdir(chain, { recursive: true }), mkdir(tools), mkdir(shadow)]);
  await writeFile(metadataLog, '');
  await writeFile(raceReferent, 'must-not-change\n', { mode: 0o640 });
  for (const directory of [
    path.join(temp, 'root'), path.join(temp, 'root', 'usr'), path.join(temp, 'root', 'usr', 'local'),
    path.join(temp, 'root', 'usr', 'local', 'lib'), chain,
  ]) await chmod(directory, 0o755);
  for (const name of realUtilities) await makeWrapper(tools, name);
  for (const name of realUtilities) {
    const shadowPath = path.join(shadow, name);
    await writeFile(shadowPath, `#!/bin/sh\nprintf '%s\\n' ${JSON.stringify(name)} >> ${JSON.stringify(path.join(temp, 'path-shadow-used'))}\nexit 97\n`, { mode: 0o700 });
    await chmod(shadowPath, 0o700);
  }

  const installer = path.join(sourceDir, 'installer');
  const executor = path.join(sourceDir, 'executor');
  const manifest = path.join(sourceDir, 'manifest');
  const stagedInstaller = path.join(stage, 'cumzinstall-prepare-output-v4.sh');
  const stagedExecutor = path.join(stage, 'execute-devnet-deployment.mjs');
  const stagedManifest = path.join(stage, 'cumzinstall-prepare-output-v4.manifest');
  const installerBytes = `#!/bin/sh\n[ "$0" = ${JSON.stringify(stagedInstaller)} ] || { /usr/bin/printf '%s\\n' source-executed > ${JSON.stringify(marker)}; exit 99; }\n/usr/bin/printf '%s\\n' staged-executed > ${JSON.stringify(marker)}\n`;
  const executorBytes = 'export const staged = true;\n';
  const manifestBytes = 'fixture manifest\n';
  await writeFile(installer, installerBytes, { mode: 0o700 });
  await writeFile(executor, executorBytes, { mode: 0o600 });
  await writeFile(manifest, manifestBytes, { mode: 0o600 });
  if (scenario === 'source-symlink') {
    await rm(installer);
    await symlink(executor, installer);
  }
  if (scenario === 'pre-existing-symlink') {
    const target = path.join(temp, 'unexpected-target');
    await mkdir(target);
    await symlink(target, stage);
  }
  if (scenario === 'root-symlink') {
    const target = path.join(temp, 'root-target');
    await rename(fixtureRoot, target);
    await symlink(target, fixtureRoot);
  }

  const document = await readFile(documentPath, 'utf8');
  const bootstrap = document.match(/```sh\n([\s\S]*?)\n```/)?.[1];
  assert.ok(bootstrap, 'bootstrap block missing');
  const uid = String(process.getuid?.() ?? 1);
  const gid = String(process.getgid?.() ?? 1);
  let fixture = bootstrap.replaceAll('/usr/local/lib/cumzillaraptors-maintenance/prepare-output-v4', '__HARNESS_STAGE__');
  for (const name of realUtilities) fixture = fixture.replaceAll(`/usr/bin/${name}`, `__HARNESS_TOOL_${name}__`);
  fixture = fixture.replaceAll('/usr/local/lib/cumzillaraptors-maintenance', '__HARNESS_CHAIN__');
  fixture = fixture.replaceAll('/usr/local/lib', '__HARNESS_LIB__');
  fixture = fixture.replaceAll('/usr/local', '__HARNESS_LOCAL__');
  fixture = fixture.replaceAll('/usr', '__HARNESS_USR__');
  fixture = fixture.replaceAll('require_secure_root_directory "/"', 'require_secure_root_directory "__HARNESS_ROOT__"');
  const substitutions = new Map([
    ['/home/raspberrypi/workspace-cumzillaraptor/scripts/cumzinstall-prepare-output-v4.sh', installer],
    ['/home/raspberrypi/workspace-cumzillaraptor/scripts/execute-devnet-deployment.mjs', executor],
    ['/home/raspberrypi/workspace-cumzillaraptor/scripts/cumzinstall-prepare-output-v4.manifest', manifest],
    ['b75d5038a9ebd495b43d694703d29d99645ae9cba8157a9017a7ebb43c3d734c', hash(installerBytes)],
    ['721fd1221f998c7b085491924dc60207dec45e328a7da1ebf3cd8c59de57421b', hash(executorBytes)],
    ['aaebc03c6baa962cc9007b5735b3168351f9a287987f97f160aeea83de5139c0', hash(manifestBytes)],
  ]);
  for (const [from, to] of substitutions) fixture = fixture.replaceAll(from, to);
  fixture = fixture.replaceAll('__HARNESS_STAGE__', stage);
  fixture = fixture.replaceAll('__HARNESS_CHAIN__', chain);
  fixture = fixture.replaceAll('__HARNESS_LIB__', path.dirname(chain));
  fixture = fixture.replaceAll('__HARNESS_LOCAL__', path.dirname(path.dirname(chain)));
  fixture = fixture.replaceAll('__HARNESS_USR__', path.dirname(path.dirname(path.dirname(chain))));
  fixture = fixture.replaceAll('__HARNESS_ROOT__', fixtureRoot);
  for (const name of realUtilities) fixture = fixture.replaceAll(`__HARNESS_TOOL_${name}__`, `${tools}/${name}`);
  fixture = fixture.replaceAll(`${tools}/chown root:root`, `${tools}/chown $HARNESS_UID:$HARNESS_GID`);
  fixture = fixture.replaceAll('directory:0:0:*', 'directory:$HARNESS_UID:$HARNESS_GID:*');
  fixture = fixture.replaceAll("= 'directory:0:0:700'", '= "directory:$HARNESS_UID:$HARNESS_GID:700"');
  fixture = fixture.replaceAll('regular file:0:0:', 'regular file:$HARNESS_UID:$HARNESS_GID:');
  fixture = fixture.replaceAll(' -eq 0 ', ' -eq "$HARNESS_UID" ');
  const fixturePath = path.join(temp, 'bootstrap-fixture.sh');
  await writeFile(fixturePath, `#!/bin/sh\nHARNESS_UID=${uid}\nHARNESS_GID=${gid}\n${fixture}\n`, { mode: 0o700 });
  await chmod(fixturePath, 0o700);
  if (scenario === 'post-copy-hash-race') {
    // This absolute wrapper corrupts only the staged executor after copying. The
    // fixture must reject its post-copy staged hash before it can exec anything.
    await writeFile(path.join(tools, 'cp'), `#!/bin/sh\n/usr/bin/cp -- "$@"\nif [ "$MUTATE_STAGED" = 1 ] && [ "$2" = ${JSON.stringify(stagedExecutor)} ]; then /usr/bin/printf '%s\\n' tampered >> "$2"; fi\n`, { mode: 0o700 });
    await chmod(path.join(tools, 'cp'), 0o700);
  }
  if (scenario === 'source-to-symlink-at-cp') {
    // Substitute only after both source checks, immediately before the actual
    // cp. cp --no-dereference consequently places a symlink at the staged path.
    await writeFile(path.join(tools, 'cp'), `#!/bin/sh\nif [ "$2" = ${JSON.stringify(installer)} ]; then /usr/bin/rm -f "$2"; /usr/bin/ln -s "$RACE_REFERENT" "$2"; fi\nexec /usr/bin/cp "$@"\n`, { mode: 0o700 });
    await chmod(path.join(tools, 'cp'), 0o700);
  }
  const raceReferentBefore = await stat(raceReferent);
  const result = await run('/bin/sh', [fixturePath], {
    cwd: temp,
    env: {
      ...process.env,
      PATH: shadow,
      HARNESS_METADATA_LOG: metadataLog,
      RACE_REFERENT: raceReferent,
      MUTATE_STAGED: scenario === 'post-copy-hash-race' ? '1' : '0',
    },
  });
  return { temp, marker, shadow, metadataLog, raceReferent, raceReferentBefore, stagedInstaller, result };
}

async function markerContents(file) {
  try { return await readFile(file, 'utf8'); } catch { return ''; }
}

async function assertScenario(name, assertion) {
  const state = await materialize(name);
  try { await assertion(state); } finally { await rm(state.temp, { recursive: true, force: true }); }
  process.stdout.write(`PASS ${name}\n`);
}

await assertScenario('pre-existing-symlink', async ({ result, marker }) => {
  assert.notEqual(result.status, 0, 'pre-existing stage symlink must fail');
  assert.equal(await markerContents(marker), '');
});
await assertScenario('root-symlink', async ({ result, marker }) => {
  assert.notEqual(result.status, 0, 'a symlinked root-chain member must fail');
  assert.equal(await markerContents(marker), '');
});
await assertScenario('hostile-PATH', async ({ result, marker, shadow }) => {
  assert.equal(result.status, 0, result.stderr);
  assert.equal(await markerContents(marker), 'staged-executed\n');
  await assert.rejects(access(path.join(shadow, '..', 'path-shadow-used')));
});
await assertScenario('source-symlink', async ({ result, marker }) => {
  assert.notEqual(result.status, 0, 'source symlink must fail');
  assert.equal(await markerContents(marker), '');
});
await assertScenario('source-to-symlink-at-cp', async ({ result, marker, metadataLog, raceReferent, raceReferentBefore, stagedInstaller }) => {
  assert.notEqual(result.status, 0, 'a source replaced with a symlink at cp must fail');
  assert.equal(await markerContents(marker), '');
  const metadataCommands = await readFile(metadataLog, 'utf8');
  assert.doesNotMatch(metadataCommands, new RegExp(`^(?:chown|chmod):.*${stagedInstaller.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'), 'chown/chmod must not receive the staged symlink pathname');
  const raceReferentAfter = await stat(raceReferent);
  assert.equal(raceReferentAfter.mode, raceReferentBefore.mode, 'the symlink referent mode must not change');
  assert.equal(raceReferentAfter.uid, raceReferentBefore.uid, 'the symlink referent owner must not change');
  assert.equal(raceReferentAfter.gid, raceReferentBefore.gid, 'the symlink referent group must not change');
});
await assertScenario('staged-only-execution', async ({ result, marker }) => {
  assert.equal(result.status, 0, result.stderr);
  assert.equal(await markerContents(marker), 'staged-executed\n');
});
await assertScenario('post-copy-hash-race', async ({ result, marker }) => {
  assert.notEqual(result.status, 0, 'tampered staged executor must fail its post-copy hash');
  assert.equal(await markerContents(marker), '', 'neither source nor staged installer may execute after a staged hash failure');
});
