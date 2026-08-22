import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const documentPath = path.join(root, 'docs', 'operations', 'devnet-deployment-approval-package-schema.md');
const PREDECESSOR = '262dfb8d69105edd5b97efec0145203574440f99';
const PROGRAM = 'AYE4iC2gp81H8jvMjk4EGxWP2sJFzuDptUwxqwTZYTMY';
const REVISION = '51d225d87ee36b6ac74e523cf8fdec86df35ea9b';
const ARTIFACT_SHA256 = '7af3f53c050aa613fd0a68ca461d93b51620e941775188f258ba33eb5305b44b';
const AUTHORITY = '71WBrLfntE4yjTxEuQ3EgGJKE8zzZUgeEm5tkLi5Jx2r';
const EXPECTED_SCHEMA_SHA256 = '6754232acb3d75a8acd6657e11553a669a095f7314d94431c9d6e16953f24f58';

function sha256(source) {
  return createHash('sha256').update(source).digest('hex');
}

function assertCanonical(source) {
  assert.equal(source.endsWith('\n'), true);
  for (const required of [
    '# Devnet deployment approval-package schema',
    `- Published predecessor commit: \`${PREDECESSOR}\``,
    `- Program ID: \`${PROGRAM}\``,
    `- SBPF revision: \`${REVISION}\``,
    `- SBPF SHA-256: \`${ARTIFACT_SHA256}\``,
    '- SBPF byte length: `411944`',
    `- Upgrade authority: \`${AUTHORITY}\``,
    'This is a repository-only schema for a later short-lived Devnet deployment approval package. It creates no approval record, live report, key verification result, signature, transaction, or authorization.',
    'A later package must contain exactly the immutable release identity, one fresh public-key-only preflight report, one fresh unsigned deployment review, and placeholders for separate human approval and independent review references.',
    'The fresh reports must be generated after this schema is published and must agree exactly on program ID, revision, artifact SHA-256, artifact byte length, upgrade authority, Devnet genesis hash, and first-deployment state.',
    'The package must reject missing, extra, reordered, duplicated, stale, malformed, or inconsistent records and must not infer approval from any digest, report, or prior packet.',
    'The approval placeholder may authorize only review of the complete unsigned deployment transaction set and a bounded fee/rent cap; it may not authorize signing or sending.',
    'A valid future package is not authority to access keys, sign, send, deploy, initialize launch state, create a collection, mint, claim, fund, upload, or perform mainnet activity.',
    'A separate final explicit confirmation immediately before signing or broadcast remains required even after a future package is approved.',
    'This schema authorizes no repository publication, host action, RPC request, key access, transaction construction, signing, sending, deployment, or Devnet write.',
  ]) assert.match(source, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(source, /The exact canonical future package field order is: schema, release, preflight, unsigned_review, approval_placeholder, independent_review_placeholder, boundary\./);
  assert.equal(sha256(source), EXPECTED_SCHEMA_SHA256);
}

test('Devnet deployment approval-package schema exists and is non-authorizing', async () => {
  assertCanonical(await readFile(documentPath, 'utf8'));
});

test('Devnet deployment approval-package schema mutations reject stale identity or signing authority', async () => {
  const source = await readFile(documentPath, 'utf8');
  for (const mutation of [
    source.replace(PREDECESSOR, '0'.repeat(40)),
    source.replace(PROGRAM, '11111111111111111111111111111111'),
    source.replace(REVISION, '0'.repeat(40)),
    source.replace(ARTIFACT_SHA256, '0'.repeat(64)),
    source.replace('`411944`', '`1`'),
    source.replace(AUTHORITY, '11111111111111111111111111111111'),
    source.replace('must agree exactly', 'may differ'),
    source.replace('public-key-only preflight report', 'private-key preflight report'),
    source.replace('payer and upgrade authority are distinct', 'payer and upgrade authority may be the same'),
    source.replace('null signatures only', 'signed transactions'),
    source.replace('current balances, current rent/fee evidence, and current blockhash', 'historical balances and fees'),
    source.replace('may not authorize signing or sending', 'authorizes signing and sending'),
    source.replace('separate final explicit confirmation immediately before signing or broadcast remains required', 'no final confirmation is required'),
    source.replace('This schema authorizes no repository publication', 'This schema authorizes repository publication'),
  ]) {
    assert.notEqual(mutation, source);
    assert.throws(() => assertCanonical(mutation));
  }
});
