// Regression tests for the durable-nonce decoder used by the claim page.
//
// Bug being locked down (2026-08-29): the decoder read state@0 / authority@4 /
// hash@36. The real layout is version@0 / state@4 / authority@8 / hash@40, so a
// perfectly good nonce account decoded as "not initialized". The claim page then
// tried to CREATE the account that already existed and Phantom surfaced
// "Create Account: ... already in use" / custom program error 0x0.
import assert from 'node:assert/strict';
import test from 'node:test';
import { NonceAccount, NONCE_ACCOUNT_LENGTH, PublicKey, SystemProgram } from '@solana/web3.js';

import {
  NONCE_ACCOUNT_SPAN,
  buildSetupNonceTx,
  claimNonceAddress,
  decodeClaimNonceData,
  fetchClaimNonce,
} from '../cumzillaraptors/client/claim-nonce.js';

const AUTHORITY = new PublicKey('8eCKWEHZ525kBLnh4mQBnhpkk4nmde5jSeQC7FGR8t3d');
const STORED_HASH = new PublicKey('3wNctjTaBeioB8xLkofHsgUbwZiESzAuuK2sEwL3LVBm');

// Byte-exact reproduction of a live initialized devnet nonce account.
function initializedNonceData({ state = 1, version = 1 } = {}) {
  const data = Buffer.alloc(NONCE_ACCOUNT_SPAN);
  data.writeUInt32LE(version, 0);
  data.writeUInt32LE(state, 4);
  AUTHORITY.toBuffer().copy(data, 8);
  STORED_HASH.toBuffer().copy(data, 40);
  data.writeBigUInt64LE(5000n, 72);
  return data;
}

function fakeConnection({ accountInfo }) {
  return {
    getAccountInfo: async () => accountInfo,
    getLatestBlockhash: async () => ({ blockhash: STORED_HASH.toString() }),
  };
}

test('span matches the official web3.js nonce account length', () => {
  assert.equal(NONCE_ACCOUNT_SPAN, NONCE_ACCOUNT_LENGTH);
});

test('decoder agrees with web3.js NonceAccount on real bytes', () => {
  const data = initializedNonceData();
  const official = NonceAccount.fromAccountData(data);
  const decoded = decodeClaimNonceData(data);

  assert.ok(decoded, 'an initialized nonce account must decode');
  assert.equal(
    new PublicKey(decoded.authorityBytes).toBase58(),
    official.authorizedPubkey.toBase58(),
  );
  assert.equal(new PublicKey(decoded.blockhashBytes).toString(), official.nonce);
});

test('an initialized nonce is not rejected as uninitialized', async () => {
  const conn = fakeConnection({
    accountInfo: {
      owner: SystemProgram.programId,
      lamports: 1_500_000,
      data: initializedNonceData(),
    },
  });

  const nonce = await fetchClaimNonce(conn, await claimNonceAddress(AUTHORITY));
  assert.ok(nonce, 'live initialized nonce must be recognised');
  assert.equal(nonce.authority.toBase58(), AUTHORITY.toBase58());
  assert.equal(nonce.blockhash, STORED_HASH.toString());
});

test('an uninitialized nonce account still decodes as null', () => {
  assert.equal(decodeClaimNonceData(initializedNonceData({ state: 0 })), null);
  assert.equal(decodeClaimNonceData(Buffer.alloc(10)), null);
  assert.equal(decodeClaimNonceData(null), null);
});

test('setup reports exists instead of re-creating an initialized nonce', async () => {
  const conn = fakeConnection({
    accountInfo: {
      owner: SystemProgram.programId,
      lamports: 1_500_000,
      data: initializedNonceData(),
    },
  });

  const res = await buildSetupNonceTx({ conn, claimer: AUTHORITY });
  assert.equal(res.exists, true);
  assert.equal(res.tx, undefined, 'must not build a create-account transaction');
});

test('setup refuses to re-create a squatted account instead of failing on-chain', async () => {
  const conn = fakeConnection({
    accountInfo: {
      owner: SystemProgram.programId,
      lamports: 1_500_000,
      data: Buffer.alloc(NONCE_ACCOUNT_SPAN), // exists, state = 0
    },
  });

  await assert.rejects(
    () => buildSetupNonceTx({ conn, claimer: AUTHORITY }),
    /already exists but is not a usable nonce/,
  );
});

test('setup builds create+initialize when nothing exists', async () => {
  const conn = fakeConnection({ accountInfo: null });
  const res = await buildSetupNonceTx({ conn, claimer: AUTHORITY });

  assert.equal(res.exists, false);
  assert.equal(res.tx.instructions.length, 2);
  assert.equal(res.tx.feePayer.toBase58(), AUTHORITY.toBase58());
});
