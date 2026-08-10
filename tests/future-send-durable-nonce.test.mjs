import test from 'node:test';
import assert from 'node:assert/strict';

import { createFakeDurableNonceStore } from '../scripts/future-send-durable-nonce.mjs';

const nonce = 'A'.repeat(43);
const otherNonce = 'B'.repeat(43);

test('durable fake store atomically reserves one nonce and rejects concurrent reuse', () => {
  const store = createFakeDurableNonceStore();
  assert.deepEqual(store.reserve(nonce), { ok: true });
  assert.deepEqual(store.reserve(nonce), { ok: false, reason: 'nonce-unavailable' });
  assert.deepEqual(store.inspect(nonce), { ok: true, state: 'reserved' });
});

test('started is durable, terminal is monotonic, and either state permanently denies reuse', () => {
  const store = createFakeDurableNonceStore();
  assert.deepEqual(store.reserve(nonce), { ok: true });
  assert.deepEqual(store.markStarted(nonce), { ok: true });
  assert.deepEqual(store.inspect(nonce), { ok: true, state: 'started' });
  assert.deepEqual(store.releaseReservation(nonce), { ok: false, reason: 'invalid-transition' });
  assert.deepEqual(store.reserve(nonce), { ok: false, reason: 'nonce-unavailable' });
  assert.deepEqual(store.markTerminal(nonce, 'failed'), { ok: true });
  assert.deepEqual(store.inspect(nonce), { ok: true, state: 'terminal', exitClass: 'failed' });
  assert.deepEqual(store.markStarted(nonce), { ok: false, reason: 'invalid-transition' });
});

test('restart model preserves started state and never infers retry eligibility after interruption', () => {
  const store = createFakeDurableNonceStore();
  assert.deepEqual(store.reserve(nonce), { ok: true });
  assert.deepEqual(store.markStarted(nonce), { ok: true });
  const restarted = createFakeDurableNonceStore(store.snapshot());
  assert.deepEqual(restarted.inspect(nonce), { ok: true, state: 'started' });
  assert.deepEqual(restarted.reserve(nonce), { ok: false, reason: 'nonce-unavailable' });
  assert.deepEqual(restarted.releaseReservation(nonce), { ok: false, reason: 'invalid-transition' });
  assert.deepEqual(restarted.inspect(nonce), { ok: true, state: 'started' });
});

test('duplicate or malformed restart snapshots are rejected rather than downgrading durable state', () => {
  const duplicate = Object.freeze({ entries: Object.freeze([
    Object.freeze([nonce, Object.freeze({ state: 'terminal', exitClass: 'failed' })]),
    Object.freeze([nonce, Object.freeze({ state: 'reserved' })]),
  ]) });
  assert.throws(() => createFakeDurableNonceStore(duplicate), /Invalid durable nonce snapshot/);
  assert.throws(() => createFakeDurableNonceStore({ entries: [[nonce, { state: 'terminal', exitClass: 'unknown' }]] }), /Invalid durable nonce snapshot/);
});

test('cleanup permits only reservation removal and never changes durable consumed state', () => {
  const store = createFakeDurableNonceStore();
  assert.deepEqual(store.reserve(nonce), { ok: true });
  assert.deepEqual(store.cleanup(['reservation']), { ok: true });
  assert.deepEqual(store.inspect(nonce), { ok: false, reason: 'missing-nonce' });
  assert.deepEqual(store.reserve(otherNonce), { ok: true });
  assert.deepEqual(store.markStarted(otherNonce), { ok: true });
  assert.deepEqual(store.cleanup(['reservation', 'consumed']), { ok: false, reason: 'forbidden-cleanup' });
  assert.deepEqual(store.inspect(otherNonce), { ok: true, state: 'started' });
});

test('durable fake store exposes no authorization, key, staging, CLI, transaction, signing, or send interface', () => {
  const store = createFakeDurableNonceStore();
  assert.deepEqual(Object.keys(store).sort(), ['cleanup', 'inspect', 'markStarted', 'markTerminal', 'releaseReservation', 'reserve', 'snapshot']);
  assert.deepEqual(store.reserve('bad'), { ok: false, reason: 'invalid-nonce' });
});

// Pure in-memory fake filesystem model only: no host paths, files, keys, RPC, CLI, transactions, signing, or send action.
