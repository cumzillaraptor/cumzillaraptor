import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const decisionDocument = new URL('../docs/operations/v2-candidate-root-recovery-decision.md', import.meta.url);
const EXPECTED_H1 = 'Candidate-root recovery decision record';
const CANONICAL_BRANCHES = Object.freeze([
  'preserve-indefinitely',
  'forensic-read-only-inspection',
  'quarantine',
  'removal',
]);
const EXPECTED_H2 = Object.freeze([
  'Status and boundary',
  ...CANONICAL_BRANCHES.map((identifier) => `Later decision branch: ${identifier}`),
]);

const EXECUTABLE_NAMES = Object.freeze([
  'aria2c', 'ash', 'awk', 'bash', 'brew', 'bun', 'busybox', 'cargo', 'cat', 'cc', 'chgrp', 'chmod', 'chown', 'clang', 'cmake', 'command', 'cp', 'curl', 'cut', 'dash', 'dd', 'deno', 'docker', 'doas', 'dotnet', 'echo', 'egrep', 'env', 'eval', 'exec', 'export', 'fd', 'fgrep', 'find', 'fish', 'ftp', 'gcc', 'git', 'go', 'grep', 'gunzip', 'gzip', 'head', 'helm', 'hg', 'install', 'java', 'javac', 'ksh', 'kubectl', 'less', 'ln', 'ls', 'make', 'meson', 'mkdir', 'more', 'mount', 'mvn', 'mv', 'ninja', 'node', 'nodejs', 'npm', 'npx', 'perl', 'php', 'pip', 'pip3', 'pkill', 'pnpm', 'podman', 'powershell', 'printf', 'ps', 'python', 'python3', 'pwsh', 'readlink', 'realpath', 'rm', 'rmdir', 'rsync', 'ruby', 'rustc', 'scp', 'sed', 'service', 'sftp', 'sh', 'sort', 'ssh', 'stat', 'sudo', 'svn', 'systemctl', 'tail', 'tar', 'tee', 'touch', 'umount', 'uniq', 'unzip', 'wget', 'xargs', 'yarn', 'zip', 'zsh',
]);
const EXECUTABLE_PATTERN = EXECUTABLE_NAMES.join('|');
const FORBIDDEN_SHELL_TOKENS = new RegExp(`\\b(?:${EXECUTABLE_PATTERN})\\b`, 'i');
const FORBIDDEN_SHELL_SYNTAX = /(?:`|;|&&|\|\||\||\$[({A-Za-z_]|[<>]{1,2}|\\|\*|\?|~)/;
const ABSOLUTE_EXECUTABLE_PATH = /(?:^|\s)\/(?:bin|sbin|usr|usr\/bin|usr\/sbin|opt|root|home)(?:\/|\s|$)/i;
const RAW_URL = /\b(?:https?|ftp):\/\//i;
const POSIX_SHEBANG = /^#!/m;
const SETEXT_HEADING = /^[=-]{3,}$/m;
const MARKDOWN_REFERENCE_LINK = /^\[[^\]\r\n]+\]:\s*\S+/m;
const HTML_TAG = /<\/?[A-Za-z][^>]*>/;
const COMMAND_EXECUTABLE = new RegExp(`^(?:${EXECUTABLE_PATTERN})(?:\\s|$)`, 'i');
const COMMAND_LIKE_LINE = new RegExp(`^(?:${EXECUTABLE_PATTERN})\\s+\\S.*$`, 'i');

function headings(source, level) {
  return [...source.matchAll(new RegExp(`^${'#'.repeat(level)} (.+)$`, 'gm'))].map(([, heading]) => heading);
}

function extractBranchSections(source) {
  const matches = [...source.matchAll(/^## Later decision branch: ([a-z-]+)\n([\s\S]*?)(?=^## |(?![\s\S]))/gm)];
  return matches.map(([, identifier, section]) => Object.freeze({ identifier, section }));
}

function validateDecisionOnlyMarkdown(source) {
  const lines = source.split(/\r?\n/);

  assert.doesNotMatch(source, POSIX_SHEBANG, 'POSIX shebangs are prohibited');
  assert.doesNotMatch(source, SETEXT_HEADING, 'setext headings are prohibited');
  assert.doesNotMatch(source, MARKDOWN_REFERENCE_LINK, 'Markdown reference links are prohibited');
  assert.doesNotMatch(source, HTML_TAG, 'HTML tags are prohibited');
  assert.doesNotMatch(source, /`/, 'inline code and fenced code are prohibited');
  assert.doesNotMatch(source, /\//, 'literal paths and slash syntax are prohibited');
  assert.doesNotMatch(source, RAW_URL, 'raw URLs are prohibited');
  assert.doesNotMatch(source, FORBIDDEN_SHELL_SYNTAX, 'shell operators, expansion, redirection, and escaping are prohibited');
  assert.doesNotMatch(source, ABSOLUTE_EXECUTABLE_PATH, 'absolute executable paths are prohibited');

  for (const line of lines) {
    if (!line) continue;
    assert.ok(/^# |^## |^[^\s>#*+`/][^`/]*$/.test(line), `only H1, H2, and plain paragraphs are allowed: ${line}`);
    assert.doesNotMatch(line, /^\s+/, `leading indentation is prohibited: ${line}`);
    assert.doesNotMatch(line, /^>/, `blockquotes are prohibited: ${line}`);
    assert.doesNotMatch(line, /^(?:[-*+]\s|\d+[.)]\s)/, `list syntax is prohibited: ${line}`);
    if (!line.startsWith('#')) assert.doesNotMatch(line, /:/, `colon command strings are prohibited: ${line}`);
    if (COMMAND_EXECUTABLE.test(line)) {
      assert.doesNotMatch(line, COMMAND_LIKE_LINE, `command-like lines are prohibited: ${line}`);
    }
  }

  assert.doesNotMatch(source, FORBIDDEN_SHELL_TOKENS, 'shell executable tokens are prohibited');
}

test('decision-only markdown validator rejects command forms and setext headings', () => {
  for (const [source, reason] of [
    ['git status', /command-like lines are prohibited/],
    ['npm test', /command-like lines are prohibited/],
    ['pnpm install', /command-like lines are prohibited/],
    ['yarn test', /command-like lines are prohibited/],
    ['make all', /command-like lines are prohibited/],
    ['cargo build', /command-like lines are prohibited/],
    ['go test', /command-like lines are prohibited/],
    ['docker ps', /command-like lines are prohibited/],
    ['kubectl get pods', /command-like lines are prohibited/],
    ['Decision record\n---', /setext headings are prohibited/],
    ['#!/bin/sh', /POSIX shebangs are prohibited/],
    ['[decision]: policy', /Markdown reference links are prohibited/],
    ['<p>Decision record</p>', /HTML tags are prohibited/],
  ]) {
    assert.throws(() => validateDecisionOnlyMarkdown(source), reason);
  }
});

test('candidate-root recovery decision document is decision-only, fail-closed, and non-operational', async () => {
  const source = await readFile(decisionDocument, 'utf8');

  assert.equal(headings(source, 1).length, 1, 'exactly one H1 is allowed');
  assert.deepEqual(headings(source, 1), [EXPECTED_H1], 'the H1 must be the decision-record title');
  assert.deepEqual(headings(source, 2), EXPECTED_H2, 'H2 headings must be exactly the canonical ordered authority list');
  assert.doesNotMatch(source, /^#{3,} /m, 'headings below H2 are prohibited');
  validateDecisionOnlyMarkdown(source);

  assert.match(source, /decision-only/i);
  assert.match(source, /non-operational/i);
  assert.match(source, /not host authorization/i);
  assert.match(source, /pre-existing candidate-root condition is a blocker\. stop fail-closed/i);
  assert.match(source, /host inspection of the root home is outside Task 5 and cannot be authorized by this document/i);
  assert.match(source, /future process requires a separate artifact and fresh authorization/i);
  assert.match(source, /no cleanup or removal recommendation and no deletion authority/i);
  assert.match(source, /new independent release-seal review and descriptor-helper review/i);
  assert.match(source, /new, separately approved, fixed versioned candidate path/i);
  assert.match(source, /not the existing root/i);

  const branches = extractBranchSections(source);
  assert.deepEqual(branches.map(({ identifier }) => identifier), CANONICAL_BRANCHES, 'later decision branches must be exactly the canonical list in order');

  const evidenceRequirements = new Map([
    ['preserve-indefinitely', /recorded non-action/i],
    ['forensic-read-only-inspection', /future evidence is limited to a high-level authorization record and boundary confirmation/i],
    ['quarantine', /future evidence is limited to a high-level approval record and exclusion confirmation/i],
    ['removal', /future evidence is limited to a high-level approval record and audit confirmation/i],
  ]);
  for (const { identifier, section } of branches) {
    assert.match(section, /fresh explicit authorization/i, `${identifier} must require fresh explicit authorization`);
    assert.match(section, /no permission is granted now/i, `${identifier} must not imply present permission`);
    assert.match(section, /legacy candidate and its candidate root are excluded and untouched/i, `${identifier} must exclude and preserve the legacy candidate root`);
    assert.match(section, /active runtime is excluded and untouched/i, `${identifier} must exclude and preserve the active runtime`);
    assert.match(section, /neither is ever a source, staging area, or destination/i, `${identifier} must prohibit either excluded area from every role`);
    assert.match(section, /permits no movement, alteration, or reuse, grants no exception, and grants no present permission/i, `${identifier} must forbid action, exceptions, and present authority`);
    assert.match(section, evidenceRequirements.get(identifier), `${identifier} must retain only high-level evidence language`);
  }

  assert.doesNotMatch(source, /\/opt\/cumzillaraptors-send-runtime-candidate-v2/i, 'the literal legacy candidate path must not be reused');
});

// This test reads repository text only. It does not inspect any candidate root, active runtime, host path, credential, endpoint, or external system.
