// Regression tests for the AdvanceNonceAccount instruction used by durable claims.
//
// Bug locked down (2026-08-29): advanceNonceInstruction called
// SystemProgram.nonceAdvance({ noncePubkey }) with no authorizedPubkey. web3.js
// writes that value into the instruction's third account key WITHOUT validating
// it, so the key became literal `undefined` and compiling the transaction threw
// "undefined is not an object (evaluating 'pubkey.toBase58')" — surfacing to the
// user as an opaque claim failure. The authority is now required.
import assert from 'node:assert/strict';
import test from 'node:test';
import { PublicKey, SystemProgram, Transaction } from '@solana/web3.js';

import {
  advanceNonceInstruction,
  buildDurableClaimTx,
} from '../cumzillaraptors/client/claim-nonce.js';

const NONCE = new PublicKey('8fkVDPjdqVeTZVRSxXNVdRxJDFxWs8pX6TC6K6aCWrdP');
const AUTHORITY = new PublicKey('8eCKWEHZ525kBLnh4mQBnhpkk4nmde5jSeQC7FGR8t3d');
const RECENT = 'ELF6XHnDBXDfrRLGJfXNSt5jhTUCHc9y3z8p9uEZTLTF';

test('advance instruction includes the nonce authority as the third key', () => {
  const ix = advanceNonceInstruction(NONCE, AUTHORITY);
  const keys = ix.keys.map((k) => k.pubkey);

  assert.equal(keys.length, 3);
  assert.equal(keys[0].toBase58(), NONCE.toBase58());
  assert.equal(keys[1].toBase58(), 'SysvarRecentB1ockHashes11111111111111111111');
  assert.equal(keys[2].toBase58(), AUTHORITY.toBase58());
  // Every key must be a real PublicKey — the bug produced an undefined entry.
  for (const k of keys) assert.ok(k instanceof PublicKey, 'key must be a PublicKey');
});

test('authority must sign the advance instruction', () => {
  const ix = advanceNonceInstruction(NONCE, AUTHORITY);
  const auth = ix.keys.find((k) => k.pubkey.equals(AUTHORITY));
  assert.ok(auth.isSigner, 'nonce authority must be marked as a signer');
});

test('omitting the authority throws instead of emitting an undefined key', () => {
  assert.throws(() => advanceNonceInstruction(NONCE), /requires the nonce authority/);
  assert.throws(() => advanceNonceInstruction(NONCE, null), /requires the nonce authority/);
});

test('a durable claim tx compiles without throwing on an undefined key', () => {
  const claimIx = SystemProgram.transfer({
    fromPubkey: AUTHORITY,
    toPubkey: NONCE,
    lamports: 1,
  });

  const tx = buildDurableClaimTx({
    nonceInfo: { address: NONCE, authority: AUTHORITY, blockhash: RECENT },
    claimIx,
    payer: AUTHORITY,
  });

  return tx.then((built) => {
    assert.equal(built.instructions.length, 2);
    // compileMessage is exactly where the undefined key used to blow up.
    const msg = built.compileMessage();
    assert.ok(msg.accountKeys.length > 0);
    for (const k of msg.accountKeys) {
      assert.ok(k instanceof PublicKey);
      assert.equal(typeof k.toBase58(), 'string');
    }
    // The advance instruction must come first for durability to hold.
    assert.equal(
      built.instructions[0].programId.toBase58(),
      SystemProgram.programId.toBase58(),
    );
    assert.equal(built.recentBlockhash, RECENT);
  });
});

test('legacy Transaction with the advance instruction serializes its message', () => {
  const tx = new Transaction().add(advanceNonceInstruction(NONCE, AUTHORITY));
  tx.recentBlockhash = RECENT;
  tx.feePayer = AUTHORITY;
  assert.ok(tx.serializeMessage().length > 0);
});
