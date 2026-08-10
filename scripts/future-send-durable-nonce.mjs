// Pure in-memory model of the future root-owned durable nonce filesystem. It
// performs no host I/O and has no authorization, key, RPC, CLI, transaction,
// signing, or send capability.
const NONCE = /^[A-Za-z0-9_-]{43}$/;
const EXIT_CLASSES = new Set(['succeeded', 'failed', 'interrupted']);

function freeze(result) { return Object.freeze(result); }
function validNonce(nonce) { return typeof nonce === 'string' && NONCE.test(nonce); }
function cloneState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return null;
  const entries = state.entries;
  if (!Array.isArray(entries)) return null;
  const map = new Map();
  for (const entry of entries) {
    if (!Array.isArray(entry) || entry.length !== 2 || !validNonce(entry[0]) || map.has(entry[0])) return null;
    const record = entry[1];
    if (!record || typeof record !== 'object' || Array.isArray(record)
      || !['reserved', 'started', 'terminal'].includes(record.state)
      || (record.state === 'terminal' && !EXIT_CLASSES.has(record.exitClass))) return null;
    map.set(entry[0], Object.freeze({ state: record.state, ...(record.state === 'terminal' ? { exitClass: record.exitClass } : {}) }));
  }
  return map;
}

function createFakeDurableNonceStore(snapshot) {
  const state = snapshot === undefined ? new Map() : cloneState(snapshot);
  if (state === null) throw new TypeError('Invalid durable nonce snapshot.');

  function reserve(nonce) {
    if (!validNonce(nonce)) return freeze({ ok: false, reason: 'invalid-nonce' });
    if (state.has(nonce)) return freeze({ ok: false, reason: 'nonce-unavailable' });
    state.set(nonce, Object.freeze({ state: 'reserved' }));
    return freeze({ ok: true });
  }
  function markStarted(nonce) {
    if (!validNonce(nonce) || state.get(nonce)?.state !== 'reserved') return freeze({ ok: false, reason: 'invalid-transition' });
    state.set(nonce, Object.freeze({ state: 'started' }));
    return freeze({ ok: true });
  }
  function markTerminal(nonce, exitClass) {
    if (!validNonce(nonce) || state.get(nonce)?.state !== 'started' || !EXIT_CLASSES.has(exitClass)) return freeze({ ok: false, reason: 'invalid-transition' });
    state.set(nonce, Object.freeze({ state: 'terminal', exitClass }));
    return freeze({ ok: true });
  }
  function releaseReservation(nonce) {
    if (!validNonce(nonce) || state.get(nonce)?.state !== 'reserved') return freeze({ ok: false, reason: 'invalid-transition' });
    state.delete(nonce);
    return freeze({ ok: true });
  }
  function inspect(nonce) {
    if (!validNonce(nonce) || !state.has(nonce)) return freeze({ ok: false, reason: 'missing-nonce' });
    return freeze({ ok: true, ...state.get(nonce) });
  }
  function cleanup(targets) {
    if (!Array.isArray(targets) || targets.some((target) => target !== 'reservation')) return freeze({ ok: false, reason: 'forbidden-cleanup' });
    for (const [nonce, record] of state) if (record.state === 'reserved') state.delete(nonce);
    return freeze({ ok: true });
  }
  function snapshotState() {
    return Object.freeze({ entries: Object.freeze([...state].map(([nonce, record]) => Object.freeze([nonce, Object.freeze({ ...record })]))) });
  }
  return Object.freeze({ cleanup, inspect, markStarted, markTerminal, releaseReservation, reserve, snapshot: snapshotState });
}

export { createFakeDurableNonceStore };
