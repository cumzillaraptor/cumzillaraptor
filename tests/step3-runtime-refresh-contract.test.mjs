import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const documentPath = path.join(root, 'docs', 'operations', 'step3-v5-no-send-runtime-refresh-contract.md');
const EXPECTED_SHA256 = '3fee0ea99385dbf733b86ad21aa836968383ed7a0be541c8288f85e4a73cc2cb';

function sha256(source) {
  return createHash('sha256').update(source).digest('hex');
}

function assertCanonical(source) {
  assert.equal(source.endsWith('\n'), true, 'canonical document requires exactly one final LF');
  assert.equal(sha256(source), EXPECTED_SHA256, 'document bytes differ from the reviewed canonical contract');
}

test('Step 3 v5 no-send runtime refresh contract is byte-exact and fail-closed', async () => {
  assertCanonical(await readFile(documentPath, 'utf8'));
});

test('Step 3 v5 contract mutations are rejected by the canonical validator', async () => {
  const source = await readFile(documentPath, 'utf8');
  for (const mutation of [
    source.replace('`8b5bcf1d9278b61780be33dc2e4a9707859155da`', '`0`.repeat(40)'),
    source.replace('`7af3f53c050aa613fd0a68ca461d93b51620e941775188f258ba33eb5305b44b`', '`0`.repeat(64)'),
    source.replace('`411944`', '`1`'),
    source.replace('`71WBrLfntE4yjTxEuQ3EgGJKE8zzZUgeEm5tkLi5Jx2r`', '`11111111111111111111111111111111`'),
    source.replace('do not inspect, reuse, alter, or remove it', 'may be reused'),
    source.replace('collision is a terminal refusal', 'collision may be reused'),
    source.replace('exactly: the current review-only source, the current prepare-only executor source, their manifest, the production SBPF artifact, and its revision marker', 'the executor source only'),
    source.replace('Every v5 staged file must be a non-symlink regular file, root-owned, exact mode, and SHA-256-verified after copy and again immediately before any use.', 'Staged files need not be verified.'),
    source.replace('may run only `--prepare`', 'may run `--send`'),
    source.replace('This contract does not authorize repository publication', 'This contract authorizes repository publication'),
    source.replace('is not authority to sign, send, deploy, or perform any later rehearsal transaction', 'authorizes deployment'),
  ]) {
    assert.notEqual(mutation, source);
    assert.throws(() => assertCanonical(mutation));
  }
});
