import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const corePath = path.join(root, 'programs', 'cumzillaraptors', 'src', 'core.rs');
const uriMapPath = path.join(root, 'nft-data', 'uri-map.devnet.json');
const VERIFIED_COLLECTION_URI = 'ar://oGxXHkoQKnsq47U4KESzurJ0-qk0dJa2FWofHQc_-SQ';
const TREASURY = 'FiHKQhwq2ZKkD2ZbBf3mPYgyw2Y9QDzNYykpMGErovU6';

test('URI map collection metadata is the same permanent record selected by the validated Core program', async () => {
  const [core, uriMapText] = await Promise.all([readFile(corePath, 'utf8'), readFile(uriMapPath, 'utf8')]);
  const uriMap = JSON.parse(uriMapText);
  assert.match(core, new RegExp(`COLLECTION_METADATA_URI: &str = "${VERIFIED_COLLECTION_URI}"`));
  assert.match(core, new RegExp(`PRIMARY_TREASURY: Pubkey = pubkey!\\("${TREASURY}"\\)`));
  assert.equal(uriMap.collectionUri, VERIFIED_COLLECTION_URI);
  assert.equal(uriMap.source.verifiedFiles, 421);
  assert.equal(uriMap.source.passed, 421);
  assert.equal(uriMap.source.failed, 0);
});
