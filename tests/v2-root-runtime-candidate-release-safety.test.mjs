import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const CANDIDATE_ROOT = '/opt/cumzillaraptors-send-runtime-candidate-v2';
const SAFE_PATH = '/usr/sbin:/usr/bin:/sbin:/bin';
const CANDIDATE_PLANNED_SOURCES = Object.freeze([
  // Tasks 1–3: pure prepare contract, injected provenance, and fake-adapter coordinator.
  'scripts/v2-root-runtime-prepare-contract.mjs',
  'scripts/v2-root-runtime-provenance.mjs',
  'scripts/v2-root-runtime-prepare-coordinator.mjs',
  // Tasks 4–5: synthetic installer model and the later prepare-only launcher boundary.
  'scripts/cumzinstall-v2-root-runtime-candidate-harness.mjs',
  'scripts/cumzdeploy-v2-prepare-launcher-contract.mjs',
  'scripts/cumzdeploy-v2-prepare-launcher.sh',
]);
const ROOT_BOUND_CANDIDATE_SOURCES = Object.freeze(new Set([
  'scripts/v2-root-runtime-prepare-contract.mjs',
  'scripts/cumzinstall-v2-root-runtime-candidate-harness.mjs',
  'scripts/cumzdeploy-v2-prepare-launcher-contract.mjs',
  'scripts/cumzdeploy-v2-prepare-launcher.sh',
]));
const candidateSources = Object.freeze(CANDIDATE_PLANNED_SOURCES.map((path) => Object.freeze({
  path,
  url: new URL(`../${path}`, import.meta.url),
})));
const plan = new URL('../docs/plans/2026-08-11-v2-root-runtime-candidate-implementation.md', import.meta.url);
const executor = new URL('../scripts/execute-devnet-deployment.mjs', import.meta.url);

// These match executable capability acquisition or invocation, not inert vocabulary.
const FORBIDDEN_NODE_IMPORT = /(?:from|require\(|import\()\s*['"](?:node:(?:fs(?:\/promises)?|child_process|process|net|http|https|tls|dgram)|(?:@solana\/|solana-web3|axios|node-fetch|undici)[^'"]*)['"]/;
const FORBIDDEN_NODE_CALL = /\b(?:readFile(?:Sync)?|writeFile(?:Sync)?|appendFile(?:Sync)?|mkdir(?:Sync)?|rm(?:Sync)?|copyFile(?:Sync)?|rename(?:Sync)?|spawn(?:Sync)?|exec(?:Sync|File)?|fork|fetch|WebSocket)\s*\(|\b(?:https?|net|tls|dgram)\.(?:request|get|connect|createConnection)\s*\(|\b(?:Bun\.spawn|Deno\.Command|execa)\s*\(|\bprocess\./;
const FORBIDDEN_TRANSACTION_API = /\b(?:Keypair|Connection|Transaction|VersionedTransaction|PublicKey)\b|\b(?:fromSecretKey|fromSeed|fromPrivateKey|generateKeypair|createKeypair|readKeypair|loadKeypair|sign(?:Transaction|Message)?|partialSign|send(?:Raw)?Transaction|serialize(?:Message)?|compileMessage)\s*\(|\b(?:connection|client|rpc)\s*\.\s*send\s*\(/;
const FORBIDDEN_DYNAMIC_NODE_CONTEXT = /\b(?:process\.env|process\.cwd|Deno\.env|Bun\.env)\b|\bcwd\s*:(?!\s*(?:(?:CANDIDATE_ROOT|ROOT)\b|['"]\/opt\/cumzillaraptors-send-runtime-candidate-v2['"]\s*[,}]))|\benv\s*:(?!\s*(?:ENV|SAFE_ENVIRONMENT)\b)/;
const FORBIDDEN_SHELL_COMMAND = /(?:^|[\n;&|]\s*)\s*(?:\/usr\/bin\/)?solana\s+(?:program\s+)?(?:deploy|send|sign)\b|(?:^|[\n;&|]\s*)\s*(?:apt(?:-get)?|dnf|yum|brew|npm|pnpm|yarn)\b|\b(?:sudoers|visudo)\b|\b(?:cp|mv|install)\s+[^\n]*(?:\/opt\/cumzillaraptors-send-runtime-candidate-v2|\/usr\/|\/etc\/)|\b(?:cat|tee)\s+[^\n]*(?:stdout_file|stderr_file)\b|\/(?:root|home)\/[^\s'"`]*?(?:keypair|private|secret|seed)[^\s'"`]*/i;
const FORBIDDEN_DYNAMIC_SHELL_CONTEXT = /\$(?:\{)?(?:PATH|HOME|PWD|CDPATH)(?:\})?|\$\(\s*(?:pwd|dirname|readlink)\b|\b(?:which|command\s+-v|eval|sh\s+-c)\b/;
const FORBIDDEN_RAW_OUTPUT = /\b(?:console\.(?:log|error)|process\.stderr\.write)\s*\(|process\.stdout\.write\s*\(\s*(?:raw|serialized|review)\b|\b(?:cat|tee)\s+[^\n]*(?:stdout_file|stderr_file)\b/i;

function assertSafeNodeModel(path, source) {
  assert.doesNotMatch(source, FORBIDDEN_NODE_IMPORT, `${path} imports a host, network, or Solana capability`);
  assert.doesNotMatch(source, FORBIDDEN_NODE_CALL, `${path} calls a host, process, or network capability`);
  assert.doesNotMatch(source, FORBIDDEN_TRANSACTION_API, `${path} invokes key, signing, sending, or transaction serialization capability`);
  assert.doesNotMatch(source, FORBIDDEN_DYNAMIC_NODE_CONTEXT, `${path} derives PATH, CWD, or environment dynamically`);
  assert.doesNotMatch(source, FORBIDDEN_RAW_OUTPUT, `${path} can emit raw candidate output`);
  assert.doesNotMatch(source, /\b(?:process\.argv|process\.stdin)\b/, `${path} accepts implicit external input`);
}

function assertSafeShellLauncher(source) {
  // The only filesystem read is the fixed, bounded parser for its captured temporary stdout.
  assert.match(source, /import \{ readFileSync \} from 'node:fs';\nconst raw = readFileSync\(process\.argv\[2\], 'utf8'\);/);
  assert.doesNotMatch(source, /node:(?:fs\/promises|child_process|process|net|http|https|tls|dgram)/);
  assert.doesNotMatch(source, /\b(?:writeFileSync|appendFileSync|mkdirSync|copyFileSync|renameSync|spawn(?:Sync)?|exec(?:Sync|File)?|fork|fetch)\s*\(/);
  assert.doesNotMatch(source, FORBIDDEN_TRANSACTION_API);
  assert.doesNotMatch(source, FORBIDDEN_SHELL_COMMAND);
  assert.doesNotMatch(source, FORBIDDEN_DYNAMIC_SHELL_CONTEXT);
  assert.doesNotMatch(source, /\b(?:read|source)\b|\$[@*]/, 'launcher accepts implicit shell input');
  assert.match(source, new RegExp(`cd -- ${CANDIDATE_ROOT.replaceAll('/', '\\/')}`));
  assert.match(source, new RegExp(`/usr/bin/env -i PATH=${SAFE_PATH.replaceAll('/', '\\/')} LC_ALL=C HOME=/nonexistent /usr/bin/node ${CANDIDATE_ROOT.replaceAll('/', '\\/')}/scripts/v2-root-runtime-prepare-coordinator\\.mjs --prepare </dev/null`));
  assert.match(source, /process\.stdout\.write\(`\$\{JSON\.stringify\(\{ ok: true, review \}\)\}\\n`\);/);
  assert.doesNotMatch(source, FORBIDDEN_RAW_OUTPUT);
}

test('Task 6 candidate sources are source-only and have no host/runtime creation or deploy capability', async () => {
  const sources = await Promise.all(candidateSources.map(async ({ path, url }) => Object.freeze({ path, source: await readFile(url, 'utf8') })));
  for (const { path, source } of sources) {
    // Only operator-facing contract, installer, and launcher sources bind the fixed root
    // directly. The provenance evaluator and coordinator instead receive that value through
    // their pure v2-schema/contract interfaces, so requiring a literal root there would
    // encourage duplicate path authority rather than audit an executable capability.
    if (ROOT_BOUND_CANDIDATE_SOURCES.has(path)) {
      assert.match(source, new RegExp(CANDIDATE_ROOT.replaceAll('/', '\\/')));
    }
    if (path.endsWith('.mjs')) assertSafeNodeModel(path, source);
    else assertSafeShellLauncher(source);
  }
});

test('Task 6 candidate planned-source audit list matches the explicit Task 1–5 plan file list', async () => {
  const text = await readFile(plan, 'utf8');
  for (const source of CANDIDATE_PLANNED_SOURCES) assert.ok(text.includes(`\`${source}\``), `plan does not name ${source}`);
  assert.match(text, /pure synthetic no-host-I\/O harness/i);
  assert.match(text, /pure fake-adapter\/no-spawn contract model/i);
});

test('Task 6 requires the active plan to name Phase B prerequisites and an explicit no-host decision gate', async () => {
  const text = await readFile(plan, 'utf8');
  assert.match(text, /Phase B — privileged candidate installation/i);
  assert.match(text, /Phase B authorization gate — not part of this plan/i);
  assert.match(text, /requires a new explicit user decision/i);
  assert.match(text, /No candidate\/runtime\/host action occurs without a new human decision/i);
  assert.match(text, /root bootstrap or candidate directory creation/i);
});

test('existing repository deployment executor remains source-only: --send is refused and no deploy child process exists', async () => {
  const source = await readFile(executor, 'utf8');
  assert.match(source, /--send[\s\S]{0,240}Refusing: send mode is unavailable/i);
  assert.doesNotMatch(source, /\bsolana\s+(?:program\s+)?deploy\b/i);
  assert.doesNotMatch(source, /(?:spawn|exec|spawnSync|execFile)\s*\([^\n]*(?:['"]solana['"]|.*program\s+deploy)/i);
});

// This audit reads repository source only. It never opens a candidate root, invokes a launcher, or performs a host, key, network, RPC, CLI, signing, transaction, or deployment action.
