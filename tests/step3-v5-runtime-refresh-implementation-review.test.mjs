import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const documentPath = path.join(root, 'docs', 'operations', 'step3-v5-runtime-refresh-implementation-review.md');
const EXPECTED_SHA256 = 'c4d775b59f81636407488ca858fb2bf318f73b34cc3a8b41cd477a435366d570';

function sha256(source) {
  return createHash('sha256').update(source).digest('hex');
}

function assertCanonical(source) {
  assert.equal(source.endsWith('\n'), true, 'canonical document requires exactly one final LF');
  assert.equal(sha256(source), EXPECTED_SHA256, 'document bytes differ from the reviewed canonical implementation review');
}

test('Step 3 v5 root refresh implementation review is byte-exact and remains blocked without its prerequisite', async () => {
  assertCanonical(await readFile(documentPath, 'utf8'));
});

test('Step 3 v5 implementation-review mutations reject prerequisite or authority weakening', async () => {
  const source = await readFile(documentPath, 'utf8');
  for (const mutation of [
    source.replace('`2092ffa54628641a31ef2c44e23d050e4545be68`', '`0`.repeat(40)'),
    source.replace('`3fee0ea99385dbf733b86ad21aa836968383ed7a0be541c8288f85e4a73cc2cb`', '`0`.repeat(64)'),
    source.replace('`8b5bcf1d9278b61780be33dc2e4a9707859155da`', '`0`.repeat(40)'),
    source.replace('`7af3f53c050aa613fd0a68ca461d93b51620e941775188f258ba33eb5305b44b`', '`0`.repeat(64)'),
    source.replace('`411944`', '`1`'),
    source.replace('`71WBrLfntE4yjTxEuQ3EgGJKE8zzZUgeEm5tkLi5Jx2r`', '`11111111111111111111111111111111`'),
    source.replace('`step3-refresh-v5`', '`step3-refresh-v4`'),
    source.replace('`BLOCKED_NO_DESCRIPTOR_PINNED_SOURCE_ACQUISITION`', '`READY`'),
    source.replace('No root execution command, installer, launcher, sudoers change, runtime replacement, or artifact copy is authorized by this review.', 'Root execution is authorized.'),
    source.replace('remain untouched and uninspected', 'may be reused'),
    source.replace('Do not use a checkout path, `/tmp` download, any cache, or mutable local artifact directory as a privileged source.', 'Use a checkout path as a privileged source.'),
    source.replace('`openat2(RESOLVE_BENEATH | RESOLVE_NO_SYMLINKS)` with no fallback', '`openat` with fallback'),
    source.replace('fixed object identity and a fixed SHA-256', 'a hash only'),
    source.replace('remain non-authoritative for signing, sending, or deployment', 'authorize deployment'),
    source.replace('This review does not authorize repository publication', 'This review authorizes repository publication'),
  ]) {
    assert.notEqual(mutation, source);
    assert.throws(() => assertCanonical(mutation));
  }
});
