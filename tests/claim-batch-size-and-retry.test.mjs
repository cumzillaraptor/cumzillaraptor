// C1/C2 regression tests for the claim page.
//
// C1: MAX_BATCH_IDS = 64 was sized for the legacy blockhash path (1206 bytes).
//     The mandatory durable-nonce path adds ~74 bytes, so 64 ids serialize to
//     1280 > 1232 and are rejected outright. Exactly one wallet (87 claims) was
//     hard-blocked. Client chunking now uses MAX_SIGN_BATCH_IDS = 32.
// C2: the durable branch confirmed without ever checking whether a submitted
//     signature landed, so the outer retry could re-sign and duplicate.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import {
  MAX_BATCH_IDS,
  MAX_SIGN_BATCH_IDS,
  MAX_TX_BYTES,
  buildBatchClaimMessage,
} from '../cumzillaraptors/client/chain.js';
import { PublicKey } from '@solana/web3.js';

const claimSource = readFileSync('cumzillaraptors/claim/index.html', 'utf8');
// Source of truth lives under client/data; build-site-dist.js copies it into
// dist/cumzillaraptors/claim/data/ for the deployed page.
const claims = JSON.parse(
  readFileSync('cumzillaraptors/client/data/claims-by-eth.json', 'utf8'),
);

// ---------- C1: batch sizing ----------

test('client chunk size is below the protocol cap', () => {
  assert.equal(MAX_BATCH_IDS, 64, 'protocol cap mirrors on-chain secp256k1::MAX_BATCH_IDS');
  assert.ok(
    MAX_SIGN_BATCH_IDS < MAX_BATCH_IDS,
    'client chunks must be smaller than the protocol cap to fit the packet limit',
  );
  assert.equal(MAX_TX_BYTES, 1232);
});

test('measured durable tx size fits the packet limit at the chunk size', () => {
  // Sizes measured on devnet with the shared 4-address ALT (review 2026-08-29).
  // Growth is 2 bytes per id (u16 in instruction data).
  const durableAt = (ids) => 1280 - (64 - ids) * 2;

  assert.equal(durableAt(64), 1280);
  assert.equal(durableAt(40), 1232);
  assert.equal(durableAt(32), 1216);

  assert.ok(
    durableAt(MAX_SIGN_BATCH_IDS) <= MAX_TX_BYTES,
    `chunk of ${MAX_SIGN_BATCH_IDS} must fit ${MAX_TX_BYTES}`,
  );
  // The old value must be demonstrably broken, proving the fix is necessary.
  assert.ok(durableAt(64) > MAX_TX_BYTES, '64 ids must exceed the limit');
  // Require real headroom, not an exact fit.
  assert.ok(
    MAX_TX_BYTES - durableAt(MAX_SIGN_BATCH_IDS) >= 8,
    'chunk size should leave headroom rather than land exactly on the limit',
  );
});

test('every real wallet now chunks into submittable batches', () => {
  const durableAt = (ids) => 1280 - (64 - ids) * 2;
  const offenders = [];
  for (const [addr, entries] of Object.entries(claims)) {
    for (let i = 0; i < entries.length; i += MAX_SIGN_BATCH_IDS) {
      const size = Math.min(MAX_SIGN_BATCH_IDS, entries.length - i);
      if (durableAt(size) > MAX_TX_BYTES) offenders.push({ addr, size });
    }
  }
  assert.deepEqual(offenders, [], 'no wallet may produce an oversize batch');
});

test('the 87-claim wallet is covered and its ids all map to a chunk', () => {
  const big = Object.entries(claims).find(([, v]) => v.length === 87);
  assert.ok(big, 'the 87-claim wallet must still exist in the data');
  const ids = big[1].map((e) => e.id).sort((a, b) => a - b);

  const chunks = [];
  for (let i = 0; i < ids.length; i += MAX_SIGN_BATCH_IDS) {
    chunks.push(ids.slice(i, i + MAX_SIGN_BATCH_IDS));
  }
  assert.equal(chunks.length, Math.ceil(87 / MAX_SIGN_BATCH_IDS));

  // The page finds a signature chunk via .find(ch => ch.ids.includes(id)):
  // every id must map to exactly one chunk.
  for (const id of ids) {
    const hits = chunks.filter((c) => c.includes(id));
    assert.equal(hits.length, 1, `id ${id} must map to exactly one chunk`);
  }
  // Each chunk must be a valid signable batch.
  for (const c of chunks) {
    assert.ok(c.length <= MAX_BATCH_IDS);
    buildBatchClaimMessage({
      programId: new PublicKey('AYE4iC2gp81H8jvMjk4EGxWP2sJFzuDptUwxqwTZYTMY'),
      recipient: new PublicKey('8eCKWEHZ525kBLnh4mQBnhpkk4nmde5jSeQC7FGR8t3d'),
      nftIds: c,
      ethAddress: big[0],
      expiryUnix: 2000000000,
    });
  }
});

test('page chunks with MAX_SIGN_BATCH_IDS, not the protocol cap', () => {
  assert.match(claimSource, /i \+= MAX_SIGN_BATCH_IDS/);
  assert.match(claimSource, /Math\.ceil\(claimable\.length \/ MAX_SIGN_BATCH_IDS\)/);
  assert.doesNotMatch(claimSource, /MAX_BATCH_IDS/, 'page must not chunk by the protocol cap');
});

test('size is verified before any signature is requested', () => {
  const sizeCheck = claimSource.indexOf('findOversizeChunk(chunks)');
  const firstSign = claimSource.indexOf("'personal_sign'");
  assert.ok(sizeCheck > -1, 'pre-signing size check must exist');
  assert.ok(firstSign > -1);
  assert.ok(sizeCheck < firstSign, 'size must be checked BEFORE personal_sign');
  assert.match(claimSource, /nothing was signed/);
});

test('size probe measures the durable shape with a full-length signature', () => {
  assert.match(claimSource, /'0x' \+ '11'\.repeat\(65\)/);
  assert.match(claimSource, /advanceNonceInstruction\(nonceInfo\.address, nonceInfo\.authority\)/);
  assert.match(claimSource, /serialized\.length > MAX_TX_BYTES/);
  assert.doesNotMatch(claimSource, /> 1232/, 'no hardcoded limit');
});

// ---------- C2: duplicate-submission safety ----------

test('every submitted signature is recorded before confirmation', () => {
  // Slice from the real signing branch. Note claimTxBytesFor also builds a tx,
  // so anchor on the durable SEND site rather than 'if (durable)'.
  const sendAt = claimSource.indexOf('sig = await conn.sendRawTransaction(signedTx.serialize())');
  assert.ok(sendAt > -1, 'durable send site must exist');
  const durable = claimSource.slice(sendAt, claimSource.indexOf('} else {', sendAt));

  assert.match(durable, /recordAttemptSignature\(entry\.id, sig\)/);
  // recorded BEFORE confirming, so a lost confirmation is still recoverable
  assert.ok(
    durable.indexOf('recordAttemptSignature') < durable.indexOf('confirmTransaction'),
    'signature must be recorded before confirmation is attempted',
  );
  assert.match(durable, /findLandedClaim\(entry\.id\)/);

  // The legacy branch must record too.
  const legacy = claimSource.slice(claimSource.indexOf('sig = await wc.signAndSend(tx)'));
  assert.match(legacy.slice(0, 400), /recordAttemptSignature\(entry\.id, sig\)/);
});

test('the retry loop checks for a landed claim before re-signing', () => {
  const loop = claimSource.slice(
    claimSource.indexOf('for (let attempt = 0; ; attempt++)'),
    claimSource.indexOf("setMsg('claim-msg', '🎉 all '"),
  );
  const landedAt = loop.indexOf('findLandedClaim');
  const continueAt = loop.indexOf('continue;');
  assert.ok(landedAt > -1, 'retry must consult findLandedClaim');
  assert.ok(landedAt < continueAt, 'landed check must precede any retry');
  assert.match(loop, /claimable\[i\]\.claimed = true;\s*\n\s*break;/);
});

test('an unverifiable status aborts instead of retrying', () => {
  assert.match(claimSource, /could not verify whether #/);
  assert.match(claimSource, /check your wallet history/);
});

test('durable transactions never retry on expiry', () => {
  // guarded by !claimNonce: a durable tx cannot expire, so an expiry-looking
  // error there is a misclassification and must not trigger a re-sign.
  assert.match(
    claimSource,
    /if \(!claimNonce && \/block height exceeded\|expired\/i\.test\(perr\) && attempt < 2\)/,
  );
});

test('findLandedClaim distinguishes landed, failed, and absent', () => {
  const fn = claimSource.slice(
    claimSource.indexOf('async function findLandedClaim'),
    claimSource.indexOf('// Serialized size of the claim tx'),
  );
  assert.match(fn, /searchTransactionHistory: true/);
  assert.match(fn, /if \(s\.err\) return \{ signature: sigs\[i\], err: s\.err \}/);
  assert.match(fn, /confirmationStatus === 'confirmed'|confirmationStatus === 'finalized'/);
  assert.match(fn, /return null/);
});

test('attempt log is cleared per raptor and chunk lookup is guarded', () => {
  assert.match(claimSource, /attemptSignatures\.delete\(claimable\[i\]\.id\)/);
  assert.match(claimSource, /if \(!chunk\) throw new Error\('no signature covers #/);
});

test('blockhashInfo is block-scoped, not a var leaking out of an if', () => {
  assert.match(claimSource, /let tx, durable = false, blockhashInfo = null;/);
  assert.doesNotMatch(claimSource, /var blockhashInfo/);
});
