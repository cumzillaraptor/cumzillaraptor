import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const documentPath = path.join(root, 'docs', 'operations', 'step3-v5-metadata-probe-selection-worksheet.md');
const EXPECTED_DOCUMENT = "# Step 3 v5 metadata-probe selection worksheet\n\n## Purpose\n\nThis worksheet selects no host object and authorizes no host inspection or execution.\n\nNo action is needed now.\n\nDo not enter a path, basename, identifier, key location, endpoint, command, or credential into this worksheet.\n\n## Why the later choice exists\n\nA safe no-send refresh cannot use a mutable checkout, a temporary location, a cache, or a guessed protected location as its source. The published design therefore requires a later probe to be limited to one specifically justified object.\n\nA later human may choose one exact parent directory and one exact leaf basename only after understanding why that one object is needed for the no-send refresh.\n\nThe later choice must not name or reuse the permanently excluded stage or active runtime.\n\n## What the later probe would and would not observe\n\nA future probe would report only non-dereferencing existence, type, numeric uid, numeric gid, and octal mode.\n\nIt would not read contents, list directories, resolve symlinks, reveal targets, hash bytes, access keys or endpoints, call RPC, or change anything.\n\nA future choice is not itself permission to inspect it.\n\n## What must happen before any host probe\n\nBefore any host probe, a separate human host-gate approval, immutable authorization record, independently reviewed probe implementation, and fresh review are all required.\n\nThe later approval must bind one exact parent and one exact leaf. Any ambiguity, missing evidence, substitution, symlink, inaccessible object, or unexpected metadata must stop without broadening scope.\n\n## Non-authority boundary\n\nThis worksheet authorizes no repository publication, host access, root command, filesystem inspection, key or endpoint access, network/RPC call, signing, sending, deployment, or Devnet write.\n";
const EXPECTED_SHA256 = 'd55728f5699002c5966fdf1c8ffa517f4422b2cdbe03a25d5d1e3dcb7fb83da8';

function sha256(source) {
  return createHash('sha256').update(source).digest('hex');
}

function assertCanonical(source) {
  assert.equal(source, EXPECTED_DOCUMENT, 'worksheet bytes differ from the reviewed canonical worksheet');
  assert.equal(sha256(source), EXPECTED_SHA256, 'worksheet digest differs from the reviewed canonical worksheet');
}

test('Step 3 v5 metadata-probe selection worksheet is byte-exact and remains non-authorizing', async () => {
  assertCanonical(await readFile(documentPath, 'utf8'));
});

test('Step 3 v5 worksheet mutations reject selection or host-authority weakening', async () => {
  const source = await readFile(documentPath, 'utf8');
  for (const mutation of [
    source.replace('selects no host object', 'selects a host object'),
    source.replace('Do not enter a path, basename, identifier, key location, endpoint, command, or credential into this worksheet.', 'Enter the host path now.'),
    source.replace('No action is needed now.', 'Run a host command now.'),
    source.replace('must not name or reuse the permanently excluded stage or active runtime', 'may reuse the active runtime'),
    source.replace('would not read contents, list directories, resolve symlinks, reveal targets, hash bytes, access keys or endpoints, call RPC, or change anything', 'may read contents'),
    source.replace('A future choice is not itself permission to inspect it.', 'A future choice permits inspection.'),
    source.replace('a separate human host-gate approval, immutable authorization record, independently reviewed probe implementation, and fresh review are all required', 'no separate review is needed'),
    source.replace('This worksheet authorizes no repository publication', 'This worksheet authorizes repository publication'),
    `${source}
`,
  ]) {
    assert.notEqual(mutation, source);
    assert.throws(() => assertCanonical(mutation));
  }
});
