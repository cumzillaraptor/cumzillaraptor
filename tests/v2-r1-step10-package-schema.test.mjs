import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const CONTRACT = new URL('../docs/operations/v2-r1-step10-package-schema.md', import.meta.url);
const STEP9 = '8017dd6d83d81f74481b58b78a90153f896279c7';
const GRAMMAR = `format: cumzillaraptors-v2-host-bootstrap-authorization-package-v1
step9-revision: ${STEP9}
authorization-record-sha256: <64-lowercase-hex-SHA-256-of-complete-canonical-authorization-record-UTF-8-bytes>
release-seal-sha256: <64-lowercase-hex-SHA-256-of-complete-canonical-release-seal-UTF-8-bytes>
reviewed-scope-sha256: <64-lowercase-hex-SHA-256-of-exact-separately-reviewed-scope-text>
fresh-preflight-sha256: <64-lowercase-hex-SHA-256-of-exact-fresh-separately-authorized-preflight-record-UTF-8-bytes>
specification-review-id: <canonical-opaque-specification-review-identifier>
specification-review-sha256: <64-lowercase-hex-SHA-256-of-exact-specification-review-UTF-8-bytes>
security-review-id: <canonical-opaque-security-review-identifier>
security-review-sha256: <64-lowercase-hex-SHA-256-of-exact-security-review-UTF-8-bytes>
expires-at: <RFC3339-UTC-timestamp>`;
const REQUIRED = Object.freeze([
  `This design is bound to published Step 9 revision ${STEP9}.`,
  'Every line must have exactly one ASCII space after its label. Tabs, comments, blank lines, extra records, reordered records, duplicate labels, and bytes after the final single LF are forbidden.',
  'Review identifiers later must be opaque normalized tokens matching `[a-z0-9][a-z0-9._-]{0,127}`; they are identifiers only, not approver identities or authority.',
  'The preflight record must be newly and separately authorized immediately before any later host consideration; historical reported preflight evidence cannot satisfy it.',
  'A syntactically conforming future package is neither acceptance nor bootstrap authority.',
  'Future package creation, package hashing or verification, signature design or verification, identity verification, nonce persistence or consumption, expiry evaluation against a wall clock, authorization acceptance, scope recovery, and every host action require separately authorized design and independent review.',
  'Step 10 authorizes no package or record creation, source hashing, Git object access, signature or verifier implementation, nonce or durable-state creation, host command, root or sudo action',
  'Passing Step 10 authorizes neither commit nor publication.',
]);

function validateSchema(source) {
  const grammar = source.match(/```text\n([\s\S]*?)\n```/);
  assert.ok(grammar, 'missing canonical grammar block');
  assert.equal(grammar[1], GRAMMAR, 'grammar must equal the complete canonical eleven records');
  for (const phrase of REQUIRED) assert.ok(source.includes(phrase), `missing required boundary: ${phrase}`);
}

test('Step 10 schema has exact canonical records and reviewed non-authority boundaries', async () => {
  validateSchema(await readFile(CONTRACT, 'utf8'));
});

test('schema validation rejects revision and acceptance-authority mutations', async () => {
  const source = await readFile(CONTRACT, 'utf8');
  assert.throws(() => validateSchema(source.replaceAll(STEP9, '0'.repeat(40))), /canonical eleven records|missing required boundary/);
  assert.throws(() => validateSchema(source.replace('neither acceptance nor bootstrap authority', 'accepted authorization and bootstrap authority')), /missing required boundary/);
});

// This test reads repository text only. It does not access Git objects, host paths, runtime, credentials, endpoints, network, or external systems.
