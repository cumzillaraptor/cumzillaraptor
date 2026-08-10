import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const generator = path.join(root, 'scripts', 'generate-uri-map-from-irys-receipt.mjs');
const programId = 'AYE4iC2gp81H8jvMjk4EGxWP2sJFzuDptUwxqwTZYTMY';
const stagedManifestSha256 = 'a'.repeat(64);
const collectionUri = `ar://${'c'.repeat(43)}`;

function uri(id) { return `ar://${String(id).padStart(3, 'a')}${'b'.repeat(40)}`; }
function receipt() {
  return {
    version: 'CUMZILLARAPTORS_IRYS_METADATA_URIS_V2',
    stagedManifestSha256,
    uris: { collection: collectionUri, ...Object.fromEntries(Array.from({ length: 420 }, (_, i) => [String(i + 1), uri(i + 1)])) },
  };
}
function report(receiptPath) {
  return {
    version: 'CUMZILLARAPTORS_METADATA_UPLOAD_VERIFICATION_V2',
    receiptPath,
    stagedManifestSha256,
    verifiedFiles: 421,
    passed: 421,
    failed: 0,
    failures: [],
    collectionUri,
  };
}
function run(receiptPath, verificationPath, output) {
  return spawnSync('node', [generator, '--receipt', receiptPath, '--verification-report', verificationPath, '--cluster', 'devnet', '--program-id', programId, '--output', output], { cwd: root, encoding: 'utf8' });
}

async function writeInputs(dir, candidateReceipt = receipt(), mutateReport = undefined) {
  await mkdir(dir, { recursive: true });
  const receiptPath = path.join(dir, 'receipt.json');
  const verificationPath = path.join(dir, 'verification.json');
  await writeFile(receiptPath, JSON.stringify(candidateReceipt));
  const candidateReport = report(receiptPath);
  mutateReport?.(candidateReport);
  await writeFile(verificationPath, JSON.stringify(candidateReport));
  return { receiptPath, verificationPath };
}

test('verified Irys receipt and matching independent report convert to a canonical deterministic Devnet URI map', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'cumz-receipt-uri-map-'));
  try {
    const { receiptPath, verificationPath } = await writeInputs(dir);
    const aPath = path.join(dir, 'a.json');
    const bPath = path.join(dir, 'b.json');
    assert.equal(run(receiptPath, verificationPath, aPath).status, 0);
    assert.equal(run(receiptPath, verificationPath, bPath).status, 0);
    const [a, b, aBytes, bBytes] = await Promise.all([readFile(aPath, 'utf8').then(JSON.parse), readFile(bPath, 'utf8').then(JSON.parse), readFile(aPath), readFile(bPath)]);
    assert.deepEqual(aBytes, bBytes);
    assert.deepEqual(a, b);
    assert.deepEqual(a, {
      version: 'CUMZILLARAPTORS_URI_MAP_V1', cluster: 'devnet', programId,
      source: {
        receiptVersion: 'CUMZILLARAPTORS_IRYS_METADATA_URIS_V2',
        verificationVersion: 'CUMZILLARAPTORS_METADATA_UPLOAD_VERIFICATION_V2',
        stagedManifestSha256,
        verifiedFiles: 421,
        passed: 421,
        failed: 0,
      },
      collectionUri,
      metadataUris: Object.fromEntries(Array.from({ length: 420 }, (_, i) => [String(i + 1), uri(i + 1)])),
    });
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('receipt conversion fails closed on receipt structure and independent verification-report linkage failures', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'cumz-receipt-uri-map-invalid-'));
  try {
    const cases = [
      ['version', (r) => { r.version = 'wrong'; }, undefined, /version/i],
      ['keys', (r) => { delete r.uris['360']; }, undefined, /canonical/i],
      ['uri', (r) => { r.uris['360'] = 'https://example.test/360'; }, undefined, /URI/i],
      ['report-version', undefined, (v) => { v.version = 'wrong'; }, /verification report version/i],
      ['report-path', undefined, (v) => { v.receiptPath = '/not/the/receipt.json'; }, /receipt path/i],
      ['report-manifest', undefined, (v) => { v.stagedManifestSha256 = 'b'.repeat(64); }, /manifest SHA-256/i],
      ['report-counts', undefined, (v) => { v.passed = 420; }, /421 verified and passed/i],
      ['report-failures', undefined, (v) => { v.failures = [{ key: '1' }]; }, /zero failures/i],
      ['report-collection', undefined, (v) => { v.collectionUri = `ar://${'d'.repeat(43)}`; }, /collection URI/i],
    ];
    for (const [name, mutateReceipt, mutateReport, expected] of cases) {
      const candidate = receipt(); mutateReceipt?.(candidate);
      const caseDir = path.join(dir, name);
      const { receiptPath, verificationPath } = await writeInputs(caseDir, candidate, mutateReport);
      const result = run(receiptPath, verificationPath, path.join(caseDir, 'out.json'));
      assert.notEqual(result.status, 0, name);
      assert.match(`${result.stdout}\n${result.stderr}`, expected, name);
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});
