import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const ADAPTER = new URL('../scripts/v2-r1-helius-secret-handoff.mjs', import.meta.url);
const REVIEWER = new URL('../scripts/review-devnet-deployment.mjs', import.meta.url);
const IMPLEMENTATION_REVIEW = new URL('../docs/operations/v2-r1-step16-helius-secret-handoff-implementation-review.md', import.meta.url);
const REVIEWER_SOURCE = await readFile(REVIEWER, 'utf8');

const {
  FIXED_HELIUS_DEVNET_ORIGIN,
  FIXED_HELIUS_DEVNET_SECRET_PATH,
  PINNED_REVIEWER_SHA256,
  handoffHeliusDevnetRpc,
} = await import(ADAPTER.href);

const EXPECTED_OWNER = Object.freeze({ uid: 1234, gid: 5678 });
const VALID_URL = 'https://devnet.helius-rpc.com/?api-key=token_ABC-123';
const DIRECTORY_NAMES = ['home', 'piadmin', '.config', 'cumzillaraptors'];
const SECRET_BASENAME = 'helius-devnet-rpc.url';

function stat({ directory = false, symbolicLink = false, uid = 1, gid = 1, mode = 0o755 } = {}) {
  return {
    isDirectory: () => directory,
    isFile: () => !directory,
    isSymbolicLink: () => symbolicLink,
    uid,
    gid,
    mode,
  };
}

function makeDependencies({ secret = VALID_URL, owner = EXPECTED_OWNER, mutate } = {}) {
  const rootHandle = { kind: 'root', name: 'root', metadata: stat({ directory: true, uid: 0, gid: 0, mode: 0o755 }), closed: false };
  const directoryStats = new Map(DIRECTORY_NAMES.map((name) => [name, stat({ directory: true })]));
  directoryStats.set('cumzillaraptors', stat({ directory: true, uid: owner.uid, gid: owner.gid, mode: 0o700 }));
  const secretStat = stat({ uid: owner.uid, gid: owner.gid, mode: 0o600 });
  const handles = [];
  const calls = [];
  let pathnameReadAttempted = false;
  let pathnameTarget = { symbolicLink: false, contents: secret };
  const state = {
    rootHandle,
    directoryStats,
    secretStat,
    handles,
    calls,
    get pathnameReadAttempted() { return pathnameReadAttempted; },
    get pathnameTarget() { return pathnameTarget; },
    replacePathnameTargetWithSymlink(contents) { pathnameTarget = { symbolicLink: true, contents }; },
  };
  mutate?.(state);

  function createHandle(kind, name, metadata, contents) {
    const handle = { kind, name, metadata, contents, closed: false };
    handles.push(handle);
    return handle;
  }

  return {
    rootHandle,
    calls,
    handles,
    get pathnameReadAttempted() { return pathnameReadAttempted; },
    get pathnameTarget() { return pathnameTarget; },
    dependencies: {
      openDirectoryNoFollow(parentHandle, name) {
        calls.push(['openDirectoryNoFollow', parentHandle?.name ?? null, name]);
        assert.ok(parentHandle === rootHandle || (parentHandle.kind === 'directory' && !parentHandle.closed));
        const metadata = directoryStats.get(name);
        if (!metadata) throw new Error('directory unavailable');
        return createHandle('directory', name, metadata);
      },
      openFinalNoFollow(parentHandle, name) {
        calls.push(['openFinalNoFollow', parentHandle?.name, name]);
        assert.equal(parentHandle?.name, 'cumzillaraptors');
        assert.equal(name, SECRET_BASENAME);
        const retainedFile = createHandle('file', name, state.secretStat, pathnameTarget.contents);
        state.replacePathnameTargetWithSymlink('https://attacker.invalid/?api-key=stolen');
        return retainedFile;
      },
      fstat(handle) {
        calls.push(['fstat', handle.name]);
        assert.equal(handle.closed, false);
        return handle.metadata;
      },
      readHeldFile(handle, encoding) {
        calls.push(['readHeldFile', handle.name, encoding]);
        assert.equal(handle.kind, 'file');
        assert.equal(handle.closed, false);
        assert.equal(encoding, 'utf8');
        return handle.contents;
      },
      close(handle) {
        calls.push(['close', handle.name]);
        handle.closed = true;
      },
      readFileByPath() {
        pathnameReadAttempted = true;
        assert.equal(pathnameTarget.symbolicLink, true, 'the pathname target was replaced after no-follow open');
        throw new Error('pathname secret reads are forbidden');
      },
      readReviewerSource() {
        calls.push(['readReviewerSource']);
        return REVIEWER_SOURCE;
      },
    },
  };
}

function handoff(options = {}) {
  const fixture = makeDependencies(options);
  const expectedOwner = Object.hasOwn(options, 'expectedOwner') ? options.expectedOwner : EXPECTED_OWNER;
  const rootHandle = Object.hasOwn(options, 'rootHandle') ? options.rootHandle : fixture.rootHandle;
  return { ...fixture, result: handoffHeliusDevnetRpc({ ...fixture.dependencies, rootHandle, expectedOwner }) };
}

function assertAllHandlesClosed(handles) {
  assert.ok(handles.every((handle) => handle.closed));
}

test('secret handoff verifies the caller-retained root and retains no-follow directory/file handles, then reads only the held verified file', () => {
  const { calls, handles, rootHandle, result } = handoff();
  assert.equal(FIXED_HELIUS_DEVNET_SECRET_PATH, '/home/piadmin/.config/cumzillaraptors/helius-devnet-rpc.url');
  assert.equal(FIXED_HELIUS_DEVNET_ORIGIN, 'https://devnet.helius-rpc.com');
  assert.equal(result.ok, true);
  assert.equal(result.url, VALID_URL);
  assert.equal(result.origin, FIXED_HELIUS_DEVNET_ORIGIN);
  assert.ok(Object.isFrozen(result));
  assert.deepEqual(calls.slice(0, 12), [
    ['readReviewerSource'],
    ['fstat', 'root'],
    ['openDirectoryNoFollow', 'root', 'home'], ['fstat', 'home'],
    ['openDirectoryNoFollow', 'home', 'piadmin'], ['fstat', 'piadmin'],
    ['openDirectoryNoFollow', 'piadmin', '.config'], ['fstat', '.config'],
    ['openDirectoryNoFollow', '.config', 'cumzillaraptors'], ['fstat', 'cumzillaraptors'],
    ['openFinalNoFollow', 'cumzillaraptors', SECRET_BASENAME], ['fstat', SECRET_BASENAME],
  ]);
  assert.ok(calls.some(([operation]) => operation === 'readHeldFile'));
  assertAllHandlesClosed(handles);
  assert.equal(rootHandle.closed, false, 'the caller retains and owns the root handle');
});

test('TOCTOU replacement after final no-follow open cannot redirect the descriptor-bound secret read to a pathname', () => {
  const replacementUrl = 'https://attacker.invalid/?api-key=stolen';
  const fixture = makeDependencies();
  const result = handoffHeliusDevnetRpc({ ...fixture.dependencies, rootHandle: fixture.rootHandle, expectedOwner: EXPECTED_OWNER });
  // openFinalNoFollow captures the normal file and then replaces the pathname target with a symlink.
  assert.equal(fixture.pathnameTarget.symbolicLink, true);
  assert.equal(fixture.pathnameReadAttempted, false);
  assert.equal(result.ok, true);
  assert.equal(result.url, VALID_URL);
  assert.doesNotMatch(JSON.stringify(result), new RegExp(replacementUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.ok(fixture.calls.some(([operation]) => operation === 'openFinalNoFollow'));
  assert.ok(fixture.calls.some(([operation]) => operation === 'readHeldFile'));
  assertAllHandlesClosed(fixture.handles);
});

test('handoff requires a caller-retained root handle with exact root directory metadata before opening home or reading a file', () => {
  const cases = [
    { rootHandle: undefined },
    { mutate: (state) => { state.rootHandle.metadata = stat({ directory: true, symbolicLink: true, uid: 0, gid: 0, mode: 0o755 }); } },
    { mutate: (state) => { state.rootHandle.metadata = stat({ directory: true, uid: 1, gid: 0, mode: 0o755 }); } },
    { mutate: (state) => { state.rootHandle.metadata = stat({ directory: true, uid: 0, gid: 1, mode: 0o755 }); } },
    { mutate: (state) => { state.rootHandle.metadata = stat({ directory: true, uid: 0, gid: 0, mode: 0o700 }); } },
  ];
  for (const options of cases) {
    const { calls, handles, rootHandle, result } = handoff(options);
    assert.equal(result.ok, false);
    assert.equal(calls.some(([operation]) => operation === 'openDirectoryNoFollow'), false);
    assert.equal(calls.some(([operation]) => operation === 'openFinalNoFollow' || operation === 'readHeldFile'), false);
    assertAllHandlesClosed(handles);
    assert.equal(rootHandle.closed, false, 'the adapter must not close a caller-retained root handle');
  }
});

test('handoff fails closed before any held-file read when immutable owner facts, retained directory metadata, or held file metadata fail', () => {
  const cases = [
    { expectedOwner: undefined },
    { expectedOwner: { uid: 1234, gid: 5678 } },
    { expectedOwner: Object.freeze({ uid: '1234', gid: 5678 }) },
    {
      expectedOwner: Object.freeze(Object.defineProperties({}, {
        uid: { enumerable: true, get: () => 1234 },
        gid: { enumerable: true, get: () => 5678 },
      })),
    },
    { mutate: (state) => state.directoryStats.set('.config', stat({ directory: true, symbolicLink: true })) },
    { mutate: (state) => state.directoryStats.set('cumzillaraptors', stat({ directory: true, uid: 1234, gid: 5678, mode: 0o755 })) },
    { mutate: (state) => { state.secretStat = stat({ symbolicLink: true, uid: 1234, gid: 5678, mode: 0o600 }); } },
    { mutate: (state) => { state.secretStat = stat({ directory: true, uid: 1234, gid: 5678, mode: 0o600 }); } },
    { mutate: (state) => { state.secretStat = stat({ uid: 9999, gid: 5678, mode: 0o600 }); } },
    { mutate: (state) => { state.secretStat = stat({ uid: 1234, gid: 5678, mode: 0o640 }); } },
  ];
  for (const options of cases) {
    const { calls, handles, result } = handoff(options);
    assert.equal(result.ok, false);
    assert.equal(result.url, undefined);
    assert.ok(Object.isFrozen(result));
    assert.equal(calls.some(([operation]) => operation === 'readHeldFile'), false);
    assertAllHandlesClosed(handles);
  }
});

test('handoff fails closed and closes every opened handle when no-follow open, fstat, held read, or close throws', () => {
  const failureCases = [
    ['open-directory', (dependencies) => { dependencies.openDirectoryNoFollow = () => { throw new Error('open directory secret leak'); }; }],
    ['open-final', (dependencies) => { dependencies.openFinalNoFollow = () => { throw new Error('open final secret leak'); }; }],
    ['fstat', (dependencies) => { const original = dependencies.fstat; dependencies.fstat = (handle) => { if (handle.kind === 'file') throw new Error('fstat secret leak'); return original(handle); }; }],
    ['read-held', (dependencies) => { dependencies.readHeldFile = () => { throw new Error('read secret leak'); }; }],
    ['close', (dependencies) => { const original = dependencies.close; dependencies.close = (handle) => { original(handle); throw new Error('close secret leak'); }; }],
  ];
  for (const [, alter] of failureCases) {
    const fixture = makeDependencies();
    alter(fixture.dependencies);
    const result = handoffHeliusDevnetRpc({ ...fixture.dependencies, rootHandle: fixture.rootHandle, expectedOwner: EXPECTED_OWNER });
    assert.equal(result.ok, false);
    assert.equal(result.url, undefined);
    assert.doesNotMatch(JSON.stringify(result), /secret leak|token|helius-rpc\.com\/\?api-key/i);
    if (fixture.calls.some(([operation]) => operation === 'openDirectoryNoFollow' || operation === 'openFinalNoFollow')) {
      assert.ok(fixture.calls.some(([operation]) => operation === 'close') || fixture.handles.length === 0);
    }
  }
});

test('handoff rejects every noncanonical or ambiguous endpoint without echoing it', () => {
  const invalid = ['', `${VALID_URL}\n`, 'http://devnet.helius-rpc.com/?api-key=token', 'https://devnet.helius-rpc.com:444/?api-key=token', 'https://devnet.helius-rpc.com/v1?api-key=token', 'https://devnet.helius-rpc.com/?api-key=token&x=1', 'https://devnet.helius-rpc.com/?api-key=token%41', 'https://user@devnet.helius-rpc.com/?api-key=token', 'https://devnet.helius-rpc.com/?api-key=token#fragment'];
  for (const secret of invalid) {
    const { handles, result } = handoff({ secret });
    assert.equal(result.ok, false);
    assert.equal(result.url, undefined);
    assert.doesNotMatch(JSON.stringify(result), /token|helius-rpc\.com\/\?api-key/i);
    assertAllHandlesClosed(handles);
  }
});

function assertOpaqueFrozenDenial(result) {
  assert.equal(result.ok, false);
  assert.equal(result.url, undefined);
  assert.ok(Object.isFrozen(result));
  assert.doesNotMatch(JSON.stringify(result), /metadata leak|identity leak|token|helius-rpc\.com\/\?api-key/i);
}

test('handoff contains throwing root, directory, and final metadata predicates, denying opaquely and cleaning every retained handle', () => {
  const cases = [
    ['root', (fixture) => { fixture.rootHandle.metadata = { isSymbolicLink() { throw new Error('metadata leak'); } }; }, 0],
    ['directory', (fixture) => {
      const original = fixture.dependencies.fstat;
      fixture.dependencies.fstat = (handle) => handle.name === '.config'
        ? { isSymbolicLink: () => false, isDirectory() { throw new Error('metadata leak'); } }
        : original(handle);
    }, 3],
    ['file', (fixture) => {
      const original = fixture.dependencies.fstat;
      fixture.dependencies.fstat = (handle) => handle.kind === 'file'
        ? { isSymbolicLink: () => false, isFile() { throw new Error('metadata leak'); } }
        : original(handle);
    }, 5],
  ];
  for (const [, mutate, expectedRetained] of cases) {
    const fixture = makeDependencies();
    mutate(fixture);
    let result;
    assert.doesNotThrow(() => { result = handoffHeliusDevnetRpc({ ...fixture.dependencies, rootHandle: fixture.rootHandle, expectedOwner: EXPECTED_OWNER }); });
    assertOpaqueFrozenDenial(result);
    assert.equal(fixture.handles.length, expectedRetained);
    assertAllHandlesClosed(fixture.handles);
    assert.equal(fixture.rootHandle.closed, false);
    assert.equal(fixture.calls.filter(([operation]) => operation === 'close').length, expectedRetained);
  }
});

test('handoff contains reflection-throwing expected-owner proxies and throwing dependency access without opening or closing handles', () => {
  const fixture = makeDependencies();
  const expectedOwner = new Proxy({}, { getPrototypeOf() { throw new Error('identity leak'); } });
  for (const input of [
    { ...fixture.dependencies, rootHandle: fixture.rootHandle, expectedOwner },
    new Proxy({}, { get() { throw new Error('dependency leak'); } }),
  ]) {
    let result;
    assert.doesNotThrow(() => { result = handoffHeliusDevnetRpc(input); });
    assertOpaqueFrozenDenial(result);
  }
  assert.equal(fixture.calls.length, 0);
  assert.equal(fixture.handles.length, 0);
  assert.equal(fixture.rootHandle.closed, false);
});

test('handoff refuses root aliases and duplicate opened handles before use, never closes root, and closes each owned handle once', () => {
  const cases = [
    ['root-directory-alias', (fixture) => { fixture.dependencies.openDirectoryNoFollow = () => fixture.rootHandle; }, 0],
    ['missing-directory-handle', (fixture) => { fixture.dependencies.openDirectoryNoFollow = () => undefined; }, 0],
    ['duplicate-directory-alias', (fixture) => {
      const original = fixture.dependencies.openDirectoryNoFollow;
      let firstDirectory;
      fixture.dependencies.openDirectoryNoFollow = (parentHandle, name) => {
        if (name === 'piadmin') return firstDirectory;
        const handle = original(parentHandle, name);
        if (name === 'home') firstDirectory = handle;
        return handle;
      };
    }, 1],
    ['final-root-alias', (fixture) => { fixture.dependencies.openFinalNoFollow = () => fixture.rootHandle; }, 4],
    ['final-directory-alias', (fixture) => { fixture.dependencies.openFinalNoFollow = (parentHandle) => parentHandle; }, 4],
    ['missing-final-handle', (fixture) => { fixture.dependencies.openFinalNoFollow = () => undefined; }, 4],
    ['non-object-final-handle', (fixture) => { fixture.dependencies.openFinalNoFollow = () => 'not-a-handle'; }, 4],
  ];
  for (const [, alter, expectedOwned] of cases) {
    const fixture = makeDependencies();
    alter(fixture);
    let result;
    assert.doesNotThrow(() => { result = handoffHeliusDevnetRpc({ ...fixture.dependencies, rootHandle: fixture.rootHandle, expectedOwner: EXPECTED_OWNER }); });
    assertOpaqueFrozenDenial(result);
    assert.equal(fixture.rootHandle.closed, false);
    assert.equal(fixture.handles.length, expectedOwned);
    assertAllHandlesClosed(fixture.handles);
    const closedNames = fixture.calls.filter(([operation]) => operation === 'close').map(([, name]) => name);
    assert.equal(new Set(closedNames).size, closedNames.length);
    assert.equal(closedNames.length, expectedOwned);
  }
});

test('handoff closes normal distinct adapter-owned handles exactly once in reverse open order', () => {
  const { calls, handles, rootHandle, result } = handoff();
  assert.equal(result.ok, true);
  assert.deepEqual(calls.filter(([operation]) => operation === 'close').map(([, name]) => name), [SECRET_BASENAME, 'cumzillaraptors', '.config', 'piadmin', 'home']);
  assertAllHandlesClosed(handles);
  assert.equal(rootHandle.closed, false);
});

test('implementation review binds Step 16 and explicitly records descriptor-bound no-follow boundary', async () => {
  const source = await readFile(IMPLEMENTATION_REVIEW, 'utf8');
  for (const required of ['36b0ff3e861c720f1e5488070bd56ea3b5ff5d94', 'selects **no uid or gid**', 'pending a later separately authorized host metadata check', 'retained', 'no-follow', 'never reads the secret by pathname after metadata validation', 'public handoff function contains hostile injected dependency, metadata, and identity exceptions', 'aliases the caller-owned root handle or a previously retained adapter-owned handle', 'no host execution', 'no RPC/Devnet request', 'sign, serialize for submission, send, deploy']) assert.match(source, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('adapter and review call this an injected in-memory model, not a host OS security boundary', async () => {
  const [adapterSource, reviewSource] = await Promise.all([readFile(ADAPTER, 'utf8'), readFile(IMPLEMENTATION_REVIEW, 'utf8')]);
  for (const required of [
    'in-memory, injected primitive model only',
    'cannot itself prove OS descriptor provenance',
    'must never be used directly as a host secret reader',
    'separately reviewed concrete native host wrapper',
    'O_DIRECTORY/O_NOFOLLOW',
    'final `O_NOFOLLOW`, `fstat` and FD read',
    'independently audited/tested before any secret handoff',
    'review-only/non-authoritative',
  ]) assert.match(`${adapterSource}\n${reviewSource}`, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(adapterSource, /(?:this adapter|current model)\s+(?:itself\s+)?(?:enforces|provides|guarantees)\s+(?:host\s+)?OS/i);
  assert.doesNotMatch(reviewSource, /(?:this adapter|current model)\s+(?:itself\s+)?(?:enforces|provides|guarantees)\s+(?:host\s+)?OS/i);
});

test('adapter pins the existing reviewer bytes and has no pathname secret reader, process, network, logging, or fetch capability', async () => {
  const reviewer = await readFile(REVIEWER, 'utf8');
  assert.equal(createHash('sha256').update(reviewer, 'utf8').digest('hex'), PINNED_REVIEWER_SHA256);
  const source = await readFile(ADAPTER, 'utf8');
  assert.doesNotMatch(source, /\b(?:lstat|readFile)\s*\(/);
  assert.doesNotMatch(source, /(?:from|import\()\s*['"](?:node:)?(?:child_process|fs|net|http|https|tls)['"]/);
  assert.doesNotMatch(source, /\b(?:console\.(?:log|error|warn)|fetch|spawn(?:Sync)?|exec(?:Sync|File)?|fork)\s*\(/);
});

// All secret I/O in these tests is injected synthetic handle behavior; no host secret, environment, RPC, process, signing, or deployment is accessed.
