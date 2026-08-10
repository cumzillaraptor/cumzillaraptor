// Injected-facts-only root-runtime provenance verifier. It performs no I/O and
// has no key loading, staging, transaction, signing, CLI-spawn, or send branch.
import { ROOT_RUNTIME_PATHS, validateDigestManifestText, validateRuntimeManifestText } from './future-send-runtime-manifests.mjs';

const REQUIRED_PATHS = Object.freeze([
  ['runtimeRoot', 0, 0o700, 'directory'],
  ['runtimeManifest', 0, 0o600, 'file'],
  ['dependencyManifest', 0, 0o600, 'file'],
  ['artifact', 0, 0o600, 'file'],
  ['artifactRevision', 0, 0o600, 'file'],
  ['cli', 0, 0o500, 'file'],
  ['keyRoot', 0, 0o700, 'directory'],
  ['programKeypair', 0, 0o600, 'file'],
  ['payerKeypair', 0, 0o600, 'file'],
  ['authorityKeypair', 0, 0o600, 'file'],
  ['rpcEndpoint', 0, 0o600, 'file'],
  ['rpcEndpointDigest', 0, 0o600, 'file'],
]);

function deny(reason) { return Object.freeze({ ok: false, reason }); }
function plain(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
function own(record, key) { const d = Object.getOwnPropertyDescriptor(record, key); return d && Object.hasOwn(d, 'value') ? d.value : undefined; }
function validMeta(meta, uid, mode, type) {
  return plain(meta) && Object.isExtensible(meta) === false
    && own(meta, 'uid') === uid && own(meta, 'mode') === mode && own(meta, 'type') === type
    && own(meta, 'parentUid') === 0 && own(meta, 'parentMode') === 0o700
    && Object.keys(meta).join('\0') === 'uid\0mode\0type\0parentUid\0parentMode';
}

function evaluateRootRuntimeProvenance(input = {}) {
  try {
    if (!plain(input)) return deny('invalid-input');
    const paths = own(input, 'paths');
    const manifests = own(input, 'manifests');
    if (!plain(paths) || !plain(manifests)) return deny('invalid-input');
    for (const [name, uid, mode, type] of REQUIRED_PATHS) {
      const entry = own(paths, name);
      if (!plain(entry) || own(entry, 'path') !== ROOT_RUNTIME_PATHS[name] || !validMeta(own(entry, 'metadata'), uid, mode, type)) return deny('path-provenance-failure');
    }
    if (!validateRuntimeManifestText(own(manifests, 'runtimeText')).ok) return deny('runtime-manifest-failure');
    if (!validateDigestManifestText(own(manifests, 'dependencyText')).ok) return deny('dependency-manifest-failure');
    // This intentionally stops before key reads, authorization loading, staging, or CLI use.
    return deny('send-disabled-no-live-authorization');
  } catch { return deny('invalid-input'); }
}

export { REQUIRED_PATHS, evaluateRootRuntimeProvenance };
