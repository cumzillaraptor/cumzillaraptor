import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const REPOSITORY = new URL('..', import.meta.url);

// This is a closed-inventory lexical source audit, not a semantic proof or sandbox.
// Documentation is authority-checked structurally because it may describe forbidden actions.
const DOCUMENTATION_REFERENCE_SOURCES = Object.freeze([
  'docs/plans/2026-08-12-v2-phase-b-recovery-and-bootstrap-plan.md',
  'docs/plans/2026-08-11-v2-root-runtime-candidate-implementation.md',
  'docs/operations/v2-phase-b-release-seal-format.md',
  'docs/operations/cumzinstall-v2-root-runtime-candidate-interface.md',
  'docs/operations/v2-descriptor-pinned-bootstrap-contract.md',
  'docs/operations/v2-candidate-root-recovery-decision.md',
]);
const EXECUTABLE_MODEL_SOURCES = Object.freeze([
  'scripts/v2-release-seal.mjs',
  'tools/v2_descriptor_pinned_bootstrap/src/lib.rs',
]);
const TEST_SOURCE_INVENTORY = Object.freeze([
  'tests/v2-release-seal.test.mjs',
  'tests/v2-descriptor-pinned-bootstrap-contract.test.mjs',
  'tools/v2_descriptor_pinned_bootstrap/tests/bootstrap_refusal.rs',
  'tests/v2-candidate-root-recovery-decision.test.mjs',
]);
const REPOSITORY_TEXT_TEST_SOURCES = Object.freeze([
  'tests/v2-descriptor-pinned-bootstrap-contract.test.mjs',
  'tests/v2-candidate-root-recovery-decision.test.mjs',
]);
const RECOVERY_PLAN = DOCUMENTATION_REFERENCE_SOURCES[0];
const LEGACY_PLAN = DOCUMENTATION_REFERENCE_SOURCES[1];
const SYNTHETIC_MANIFEST = 'scripts/cumzinstall-v2-root-runtime-candidate.manifest';

function repositoryUrl(path) {
  return new URL(path, REPOSITORY);
}

async function readRepositoryText(path) {
  return readFile(repositoryUrl(path), 'utf8');
}

const MODULE_NAMES = '(?:node:)?(?:fs(?:/promises)?|child_process|net|http|https|tls|dgram)';
const SELF_FORBIDDEN_MODULE_NAMES = '(?:node:)?(?:child_process|net|http|https|tls|dgram)';
const TEST_FORBIDDEN_MODULE_NAMES = SELF_FORBIDDEN_MODULE_NAMES;
const NETWORK_MODULE_NAMES = '(?:node:)?(?:net|http|https|tls|dgram)';
const NODE_MODULE_IMPORT = new RegExp(`\\bimport\\s+(?:[\\s\\S]*?\\s+from\\s+)?['"]${MODULE_NAMES}['"]`, 'i');
const DYNAMIC_NODE_MODULE_IMPORT = new RegExp(`\\bimport\\s*\\(\\s*['"]${MODULE_NAMES}['"]\\s*\\)`, 'i');
const NODE_MODULE_REQUIRE = new RegExp(`\\brequire\\s*\\(\\s*['"]${MODULE_NAMES}['"]\\s*\\)`, 'i');
const SELF_FORBIDDEN_NODE_MODULE_IMPORT = new RegExp(`\\bimport\\s+(?:[\\s\\S]*?\\s+from\\s+)?['"]${SELF_FORBIDDEN_MODULE_NAMES}['"]`, 'i');
const SELF_FORBIDDEN_DYNAMIC_NODE_MODULE_IMPORT = new RegExp(`\\bimport\\s*\\(\\s*['"]${SELF_FORBIDDEN_MODULE_NAMES}['"]\\s*\\)`, 'i');
const SELF_FORBIDDEN_NODE_MODULE_REQUIRE = new RegExp(`\\brequire\\s*\\(\\s*['"]${SELF_FORBIDDEN_MODULE_NAMES}['"]\\s*\\)`, 'i');
const TEST_FORBIDDEN_NODE_MODULE_IMPORT = new RegExp(`\\bimport\\s+(?:[\\s\\S]*?\\s+from\\s+)?['"]${TEST_FORBIDDEN_MODULE_NAMES}['"]`, 'i');
const TEST_FORBIDDEN_DYNAMIC_NODE_MODULE_IMPORT = new RegExp(`\\bimport\\s*\\(\\s*['"]${TEST_FORBIDDEN_MODULE_NAMES}['"]\\s*\\)`, 'i');
const TEST_FORBIDDEN_NODE_MODULE_REQUIRE = new RegExp(`\\brequire\\s*\\(\\s*['"]${TEST_FORBIDDEN_MODULE_NAMES}['"]\\s*\\)`, 'i');
const NETWORK_MODULE_IMPORT = new RegExp(`\\bimport\\s+(?:[\\s\\S]*?\\s+from\\s+)?['"]${NETWORK_MODULE_NAMES}['"]`, 'i');
const DYNAMIC_NETWORK_MODULE_IMPORT = new RegExp(`\\bimport\\s*\\(\\s*['"]${NETWORK_MODULE_NAMES}['"]\\s*\\)`, 'i');
const NETWORK_MODULE_REQUIRE = new RegExp(`\\brequire\\s*\\(\\s*['"]${NETWORK_MODULE_NAMES}['"]\\s*\\)`, 'i');
const NODE_FS_CALL = /\b(?:fs(?:\.promises)?\s*\.\s*)?(?:open|stat|lstat|mkdir|rm|copyFile|cp|symlink|realpath|createWriteStream|writeFile|appendFile|unlink|rename|chmod|readFile)\s*\(/i;
const RUST_FS_CALL = /\b(?:std::)?fs::(?:File::(?:create|open)|OpenOptions::new|read|read_to_string|read_dir|write|copy|create_dir(?:_all)?|remove_dir(?:_all)?|remove_file|rename|symlink|hard_link|read_link|canonicalize|metadata|symlink_metadata|set_permissions)\s*\(/;
const PROCESS_CALL = /(?<!\.)\b(?:exec|execSync|execFile|execFileSync|spawn|spawnSync|fork)\s*\(|\bprocess\s*(?:\.|\[)|\bCommand::new\s*\(|\bstd::process\b/;
const NETWORK_CALL = /\b(?:fetch|XMLHttpRequest|WebSocket|axios|request|TcpStream|TcpListener|UdpSocket|reqwest|ureq)\s*\(/;
const RUST_NETWORK_CALL = /\b(?:(?:std::net::)?(?:TcpStream::connect|TcpListener::bind|UdpSocket::bind)|(?:reqwest::)?(?:Client::new|blocking::(?:get|Client::new))|(?:ureq::)?Agent::new|(?:reqwest|ureq)::get)\s*\(/;
const ASYNC_RUNTIME_CALL = /\b(?:setTimeout|setInterval|setImmediate|queueMicrotask)\s*\(/;

function assertNoOperationalCapability(path, source) {
  const documentationPatterns = [
    /(?:^|\n)\s*#!\s*(?:(?:\/usr\/bin\/env\s+)?|\/bin\/)(?:ba|z|da)?sh\b/im,
    /(?:^|\n)\s*(?:(?:\.|source)\s+(?:\/|\.|\$)|(?:ba|z|da)?sh\s+(?:-c|--command)\b)/im,
    /(?:^|\n)\s*(?:>>?|<<)\s+(?:\/|\.)\S+/m,
    /(?:^|\n)\s*(?:sudo|doas|curl|wget|npm|pnpm|yarn|apt(?:-get)?|pip(?:3)?|solana)\b/i,
  ];
  const operationalSourcePatterns = [
    /(?:^|\n)\s*#!\s*(?:(?:\/usr\/bin\/env\s+)?|\/bin\/)(?:ba|z|da)?sh\b/im,
    /(?:^|\n)\s*(?:\.\s+\S+|source\s+(?:\/|\.|\$|\w+\.sh\b)|(?:ba|z|da)?sh\s+(?:-c|--command)\b)/im,
    /(?:['"`])\/(?:root(?:\/|$)|home(?:\/|$)|opt\/[^'"`\s]*candidate[^'"`\s]*)/i,
    NODE_MODULE_IMPORT,
    DYNAMIC_NODE_MODULE_IMPORT,
    NODE_MODULE_REQUIRE,
    NODE_FS_CALL,
    RUST_FS_CALL,
    /(?:^|\n)\s*(?:\w+|\$\w+)(?:\s+[^\s()]+)*\s+(?:>>?|<<)\s*\S+/m,
    PROCESS_CALL,
    /\b(?:sh|bash|zsh|dash)\s+(?:-c|--command)\b|\/bin\/(?:sh|bash|zsh|dash)\b/i,
    /\bendpoint(?:[_-]?(?:access|path))?\b|\b(?:Keypair|secret|credential|private[ _-]?key|fromSecretKey)\b/i,
    /\b(?:new\s+URL|URL)\s*\(|\bhttps?:\/\//i,
    NETWORK_CALL,
    RUST_NETWORK_CALL,
    ASYNC_RUNTIME_CALL,
    /\b(?:solana|solana-cli|program\s+deploy|sign(?:er|ing)?|serialize(?:d|r)?|transaction|deploy(?:ment)?)\b|--send|\.sign\s*\(/i,
    /\b(?:npm|pnpm|yarn|bun|brew|apt(?:-get)?|pip(?:3)?|cargo\s+install)\b/i,
    /\b(?:sudo|doas)\b/i,
    /\b(?:fallback|retry|reuse|alternative(?:[_-]?path)?)\b/i,
  ];
  const forbidden = path.endsWith('.md') ? documentationPatterns : operationalSourcePatterns;
  for (const pattern of forbidden) {
    assert.doesNotMatch(source, pattern, `${path} exposes a prohibited operational capability: ${pattern}`);
  }
}

function dynamicImportFixture(module) {
  return ['import', '(', "'", `node:${module}`, "'", ')'].join('');
}

function requireFixture(module) {
  return ['require', '(', "'", module, "'", ')'].join('');
}

function callFixture(name) {
  return [name, '(', 'value', ')'].join('');
}

const NODE_FS_OPERATIONS = Object.freeze([
  'open', 'stat', 'lstat', 'mkdir', 'rm', 'copyFile', 'cp', 'symlink', 'realpath',
  'createWriteStream', 'writeFile', 'appendFile', 'unlink', 'rename', 'chmod', 'readFile',
]);
const EXECUTION_CALLS = Object.freeze(['exec', 'execSync', 'execFile', 'execFileSync', 'spawn', 'spawnSync', 'fork']);
const PACKAGE_MANAGERS = Object.freeze(['npm', 'pnpm', 'yarn', 'bun', 'brew', 'apt', 'pip', 'cargo install']);
const RUST_FS_FIXTURES = Object.freeze([
  ['File::open', 'std::fs::File::open("x");'],
  ['File::create', 'std::fs::File::create("x");'],
  ['OpenOptions::new', 'std::fs::OpenOptions::new();'],
  ['read', 'std::fs::read("x");'],
  ['read_to_string', 'std::fs::read_to_string("x");'],
  ['read_dir', 'std::fs::read_dir("x");'],
  ['write', 'std::fs::write("x", bytes);'],
  ['copy', 'std::fs::copy("x", "y");'],
  ['create_dir', 'std::fs::create_dir("x");'],
  ['create_dir_all', 'std::fs::create_dir_all("x");'],
  ['remove_dir', 'std::fs::remove_dir("x");'],
  ['remove_dir_all', 'std::fs::remove_dir_all("x");'],
  ['remove_file', 'std::fs::remove_file("x");'],
  ['rename', 'std::fs::rename("x", "y");'],
  ['symlink', 'std::fs::symlink("x", "y");'],
  ['hard_link', 'std::fs::hard_link("x", "y");'],
  ['read_link', 'std::fs::read_link("x");'],
  ['canonicalize', 'std::fs::canonicalize("x");'],
  ['metadata', 'std::fs::metadata("x");'],
  ['symlink_metadata', 'std::fs::symlink_metadata("x");'],
  ['set_permissions', 'std::fs::set_permissions("x", permissions);'],
]);
const RUST_NETWORK_FIXTURES = Object.freeze([
  ['qualified TcpStream::connect', 'std::net::TcpStream::connect(target);'],
  ['imported TcpStream::connect', 'use std::net::TcpStream;\nTcpStream::connect(target);'],
  ['qualified TcpListener::bind', 'std::net::TcpListener::bind(target);'],
  ['imported TcpListener::bind', 'use std::net::TcpListener;\nTcpListener::bind(target);'],
  ['qualified UdpSocket::bind', 'std::net::UdpSocket::bind(target);'],
  ['imported UdpSocket::bind', 'use std::net::UdpSocket;\nUdpSocket::bind(target);'],
  ['reqwest direct get', 'reqwest::get(target);'],
  ['reqwest qualified Client::new', 'reqwest::Client::new();'],
  ['reqwest imported Client::new', 'use reqwest::Client;\nClient::new();'],
  ['reqwest blocking::get', 'reqwest::blocking::get(target);'],
  ['reqwest blocking qualified Client::new', 'reqwest::blocking::Client::new();'],
  ['reqwest blocking imported Client::new', 'use reqwest::blocking::Client;\nClient::new();'],
  ['reqwest imported blocking::get', 'use reqwest::blocking;\nblocking::get(target);'],
  ['ureq direct get', 'ureq::get(target);'],
  ['ureq qualified Agent::new', 'ureq::Agent::new();'],
  ['ureq imported Agent::new', 'use ureq::Agent;\nAgent::new();'],
]);

const NEGATIVE_CAPABILITY_FIXTURES = Object.freeze([
  ['documentation shell bootstrap', 'fixture.md', '#!/bin/sh'],
  ['documentation shell source invocation', 'fixture.md', 'source ./bootstrap'],
  ['documentation command', 'fixture.md', 'curl'],
  ['documentation standalone redirection', 'fixture.md', '> ./output'],
  ['static Node FS import', 'fixture.mjs', "import { readFile } from 'node:fs/promises';"],
  ['bare static Node FS import', 'fixture.mjs', "import fs from 'fs';"],
  ['dynamic Node FS import', 'fixture.mjs', dynamicImportFixture('fs')],
  ['bare dynamic Node FS import', 'fixture.mjs', "import('fs')"],
  ['dynamic child-process import', 'fixture.mjs', dynamicImportFixture('child_process')],
  ['bare FS require', 'fixture.mjs', requireFixture('fs')],
  ['node-prefixed FS require', 'fixture.mjs', "require('node:fs')"],
  ['bare child-process require', 'fixture.mjs', requireFixture('child_process')],
  ...NODE_FS_OPERATIONS.map((operation) => [`Node FS ${operation}`, 'fixture.mjs', callFixture(`fs.promises.${operation}`)]),
  ...RUST_FS_FIXTURES.map(([operation, source]) => [`Rust FS ${operation}`, 'fixture.rs', source]),
  ...RUST_NETWORK_FIXTURES.map(([operation, source]) => [`Rust network ${operation}`, 'fixture.rs', source]),
  ['process member', 'fixture.mjs', ['process', '.arch;'].join('')],
  ...EXECUTION_CALLS.map((call) => [`process ${call}`, 'fixture.mjs', callFixture(call)]),
  ['Rust Command::new', 'fixture.rs', ['Command::', 'new("tool");'].join('')],
  ['network dynamic import', 'fixture.mjs', dynamicImportFixture('https')],
  ['network bare require', 'fixture.mjs', requireFixture('net')],
  ['fetch client', 'fixture.mjs', callFixture('fetch')],
  ['WebSocket client', 'fixture.mjs', ['new WebSocket', '(resource);'].join('')],
  ['asynchronous runtime timer', 'fixture.mjs', callFixture('setTimeout')],
  ['endpoint token', 'fixture.mjs', 'const endpoint = value;'],
  ['raw network URL', 'fixture.mjs', "const address = 'https://example.test';"],
  ['solana token', 'fixture.mjs', 'solana'],
  ['send flag', 'fixture.mjs', '--send'],
  ['bare signing call', 'fixture.mjs', 'record.sign();'],
  ['serialization token', 'fixture.mjs', 'serialize(record);'],
  ['transaction token', 'fixture.mjs', 'const record = transaction;'],
  ['deploy token', 'fixture.mjs', 'deploy();'],
  ...PACKAGE_MANAGERS.map((manager) => [`package manager ${manager}`, 'fixture.mjs', manager]),
  ['sudo', 'fixture.mjs', 'sudo'],
  ['fallback', 'fixture.mjs', 'fallback'],
]);

for (const [category, path, source] of NEGATIVE_CAPABILITY_FIXTURES) {
  test(`closed-inventory lexical source audit rejects isolated synthetic ${category}`, () => {
    assert.throws(() => assertNoOperationalCapability(path, source));
  });
}

function assertRepositoryTextTestCapability(path, source) {
  assert.match(source, /node:test/, `${path} must remain a local test source`);
  assert.match(source, /import \{ readFile \} from 'node:fs\/promises';/, `${path} may use only read-only repository-text access`);
  assert.doesNotMatch(source, TEST_FORBIDDEN_NODE_MODULE_IMPORT, `${path} may not import host, process, or network modules`);
  assert.doesNotMatch(source, TEST_FORBIDDEN_DYNAMIC_NODE_MODULE_IMPORT, `${path} may not dynamically import host, process, or network modules`);
  assert.doesNotMatch(source, TEST_FORBIDDEN_NODE_MODULE_REQUIRE, `${path} may not require host, process, or network modules`);
  assert.doesNotMatch(source, PROCESS_CALL, `${path} may not use process execution`);
  assert.doesNotMatch(source, NETWORK_CALL, `${path} may not use network clients`);
  assert.doesNotMatch(source, ASYNC_RUNTIME_CALL, `${path} may not schedule asynchronous runtime work`);
}

function assertNoNetworkTestCapability(path, source) {
  assert.doesNotMatch(source, NETWORK_MODULE_IMPORT, `${path} may not import network modules`);
  assert.doesNotMatch(source, DYNAMIC_NETWORK_MODULE_IMPORT, `${path} may not dynamically import network modules`);
  assert.doesNotMatch(source, NETWORK_MODULE_REQUIRE, `${path} may not require network modules`);
  assert.doesNotMatch(source, NETWORK_CALL, `${path} may not invoke network clients`);
  assert.doesNotMatch(source, /\b(?:reqwest|ureq|std::net)\b/, `${path} may not name Rust network clients`);
}

test('Phase B release safety has exact closed inventories for documentation, executable models, and designated tests', async () => {
  assert.deepEqual(DOCUMENTATION_REFERENCE_SOURCES, [
    'docs/plans/2026-08-12-v2-phase-b-recovery-and-bootstrap-plan.md',
    'docs/plans/2026-08-11-v2-root-runtime-candidate-implementation.md',
    'docs/operations/v2-phase-b-release-seal-format.md',
    'docs/operations/cumzinstall-v2-root-runtime-candidate-interface.md',
    'docs/operations/v2-descriptor-pinned-bootstrap-contract.md',
    'docs/operations/v2-candidate-root-recovery-decision.md',
  ]);
  assert.deepEqual(EXECUTABLE_MODEL_SOURCES, [
    'scripts/v2-release-seal.mjs',
    'tools/v2_descriptor_pinned_bootstrap/src/lib.rs',
  ]);
  assert.deepEqual(TEST_SOURCE_INVENTORY, [
    'tests/v2-release-seal.test.mjs',
    'tests/v2-descriptor-pinned-bootstrap-contract.test.mjs',
    'tools/v2_descriptor_pinned_bootstrap/tests/bootstrap_refusal.rs',
    'tests/v2-candidate-root-recovery-decision.test.mjs',
  ]);

  const self = await readRepositoryText('tests/v2-phase-b-release-safety.test.mjs');
  assert.deepEqual([...self.matchAll(/^import .+;$/gm)].map(([line]) => line), [
    "import assert from 'node:assert/strict';",
    "import { readFile } from 'node:fs/promises';",
    "import test from 'node:test';",
  ], 'the audit imports only assertions, read-only repository text, and the local test runner');
  assert.doesNotMatch(self, SELF_FORBIDDEN_NODE_MODULE_IMPORT, 'self-audit rejects node child-process/network imports');
  assert.doesNotMatch(self, SELF_FORBIDDEN_DYNAMIC_NODE_MODULE_IMPORT, 'self-audit rejects dynamic host imports');
  assert.doesNotMatch(self, SELF_FORBIDDEN_NODE_MODULE_REQUIRE, 'self-audit rejects host requires');
  assert.doesNotMatch(self, PROCESS_CALL, 'self-audit rejects process spawn/exec forms');
  assert.doesNotMatch(self, NETWORK_CALL, 'self-audit rejects network clients');

  const allTestSources = await Promise.all(TEST_SOURCE_INVENTORY.map(async (path) => [path, await readRepositoryText(path)]));
  for (const [path, source] of allTestSources) assertNoNetworkTestCapability(path, source);
  for (const [path, source] of allTestSources.filter(([path]) => REPOSITORY_TEXT_TEST_SOURCES.includes(path))) {
    assertRepositoryTextTestCapability(path, source);
  }
  await Promise.all([...DOCUMENTATION_REFERENCE_SOURCES, ...EXECUTABLE_MODEL_SOURCES].map(readRepositoryText));
});

test('Phase B documentation references current planning and safety references while reserving host authority for a later gate', async () => {
  const [recoveryPlan, legacyPlan, seal, contract, recovery] = await Promise.all([
    readRepositoryText(RECOVERY_PLAN), readRepositoryText(LEGACY_PLAN),
    readRepositoryText('docs/operations/v2-phase-b-release-seal-format.md'),
    readRepositoryText('docs/operations/v2-descriptor-pinned-bootstrap-contract.md'),
    readRepositoryText('docs/operations/v2-candidate-root-recovery-decision.md'),
  ]);
  assert.match(recoveryPlan, /## Task 6: Final repository-only integration gate/);
  assert.match(recoveryPlan, /tests\/v2-phase-b-release-safety\.test\.mjs/);
  assert.match(seal, /Phase B release seal is the production input/i);
  assert.match(contract, /Later separate tests and approval are required before any helper execution or install/i);
  assert.match(recovery, /permits no movement, alteration, or reuse/i);
  assert.match(legacyPlan, /^> \*\*Phase-B supersession notice — current Phase-B repository planning and safety references\.\*\*/m);
  assert.match(legacyPlan, /grants no current Phase-B host authority/i);
  assert.match(legacyPlan, /docs\/plans\/2026-08-12-v2-phase-b-recovery-and-bootstrap-plan\.md/);
  assert.match(legacyPlan, /tools\/v2_descriptor_pinned_bootstrap\/tests\/bootstrap_refusal\.rs/);
  assert.match(legacyPlan, /later separately authorized host gate/i);
  assert.match(legacyPlan, /Phase-A synthetic manifest\/fixture/i);
  assert.match(legacyPlan, new RegExp(SYNTHETIC_MANIFEST.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(legacyPlan, /is not a production release seal and cannot be used or relied on for production/i);
});

test('closed-inventory lexical source audit scans every executable/model source and designated repository-text test source', async () => {
  const sources = await Promise.all(EXECUTABLE_MODEL_SOURCES.map(async (path) => [path, await readRepositoryText(path)]));
  for (const [path, source] of sources) assertNoOperationalCapability(path, source);
  // This syntactic audit is not a sandbox or formal semantic proof; documentation remains structural-only.
});

// This safety audit reads only its fixed repository-text inventories. It does not inspect v3, candidate, runtime, credential, endpoint, or external paths.
