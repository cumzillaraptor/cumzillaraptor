import { createHash } from 'node:crypto';

const FIXED_HELIUS_DEVNET_SECRET_PATH = '/home/piadmin/.config/cumzillaraptors/helius-devnet-rpc.url';
const FIXED_HELIUS_DEVNET_ORIGIN = 'https://devnet.helius-rpc.com';
const PINNED_REVIEWER_SHA256 = 'eed10be9a2b5cb11dce9c5a217fad0419a6f096f5597b80671ed0d0e30b0bdae';

const DIRECTORY_NAMES = Object.freeze(['home', 'piadmin', '.config', 'cumzillaraptors']);
const OWNER_ONLY_DIRECTORY_NAME = DIRECTORY_NAMES.at(-1);
const SECRET_BASENAME = 'helius-devnet-rpc.url';
const ROOT_DIRECTORY_MODE = 0o755;

function result(ok, fields) {
  return Object.freeze({ ok, ...fields });
}

function deny(code) {
  return result(false, { code });
}

function hasImmutableNumericIdentity(expectedOwner) {
  try {
    if (expectedOwner === null
      || typeof expectedOwner !== 'object'
      || Object.getPrototypeOf(expectedOwner) !== Object.prototype
      || !Object.isFrozen(expectedOwner)
      || Reflect.ownKeys(expectedOwner).length !== 2
      || Reflect.ownKeys(expectedOwner).some((key, index) => key !== ['uid', 'gid'][index])) return false;
    return ['uid', 'gid'].every((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(expectedOwner, key);
      return descriptor !== undefined
        && 'value' in descriptor
        && descriptor.enumerable === true
        && descriptor.writable === false
        && descriptor.configurable === false
        && Number.isSafeInteger(descriptor.value)
        && descriptor.value >= 0;
    });
  } catch {
    return false;
  }
}

function modeOf(metadata) {
  return Number.isSafeInteger(metadata?.mode) ? metadata.mode & 0o7777 : null;
}

function isNonSymlinkDirectory(metadata) {
  try {
    return Boolean(metadata
      && typeof metadata.isSymbolicLink === 'function'
      && typeof metadata.isDirectory === 'function'
      && !metadata.isSymbolicLink()
      && metadata.isDirectory());
  } catch {
    return false;
  }
}

function isSecureOwnerOnlyDirectory(metadata, expectedOwner) {
  try {
    return isNonSymlinkDirectory(metadata)
      && metadata.uid === expectedOwner.uid
      && metadata.gid === expectedOwner.gid
      && modeOf(metadata) === 0o700;
  } catch {
    return false;
  }
}

function isSecureRootDirectory(metadata) {
  try {
    return isNonSymlinkDirectory(metadata)
      && metadata.uid === 0
      && metadata.gid === 0
      && modeOf(metadata) === ROOT_DIRECTORY_MODE;
  } catch {
    return false;
  }
}

function isSecureSecretFile(metadata, expectedOwner) {
  try {
    return Boolean(metadata
      && typeof metadata.isSymbolicLink === 'function'
      && typeof metadata.isFile === 'function'
      && !metadata.isSymbolicLink()
      && metadata.isFile()
      && metadata.uid === expectedOwner.uid
      && metadata.gid === expectedOwner.gid
      && modeOf(metadata) === 0o600);
  } catch {
    return false;
  }
}

function isDistinctOwnedHandle(handle, rootHandle, retainedHandles) {
  if (handle === null || typeof handle !== 'object' || Object.is(handle, rootHandle)) return false;
  return !retainedHandles.some((retainedHandle) => Object.is(handle, retainedHandle));
}

function isCanonicalHeliusDevnetUrl(value) {
  return typeof value === 'string'
    && /^https:\/\/devnet\.helius-rpc\.com\/\?api-key=[A-Za-z0-9_-]+$/.test(value);
}

function isPinnedReviewerSource(source) {
  return typeof source === 'string'
    && createHash('sha256').update(source, 'utf8').digest('hex') === PINNED_REVIEWER_SHA256;
}

/**
 * In-memory, injected primitive model only: it cannot itself prove OS descriptor
 * provenance and must never be used directly as a host secret reader. Its caller
 * retains the root handle; a separately reviewed concrete native host wrapper
 * must establish the root FD and OS-enforced operations before any handoff.
 */
function handoffHeliusDevnetRpc(input = {}) {
  const retainedHandles = [];
  let close;
  let finalResult = deny('secret-unavailable');

  try {
    if (input === null || (typeof input !== 'object' && typeof input !== 'function')) return deny('missing-injected-dependency');
    const {
      openDirectoryNoFollow,
      openFinalNoFollow,
      fstat,
      readHeldFile,
      readReviewerSource,
      rootHandle,
      expectedOwner,
    } = input;
    close = input.close;

    if (!hasImmutableNumericIdentity(expectedOwner)) return deny('missing-immutable-owner-identity');
    if ([openDirectoryNoFollow, openFinalNoFollow, fstat, readHeldFile, close, readReviewerSource].some((dependency) => typeof dependency !== 'function')) {
      return deny('missing-injected-dependency');
    }

    let reviewerSource;
    try {
      reviewerSource = readReviewerSource();
    } catch {
      return deny('reviewer-source-unavailable');
    }
    if (!isPinnedReviewerSource(reviewerSource)) return deny('reviewer-source-mismatch');
    if (rootHandle === null || typeof rootHandle !== 'object') return deny('missing-root-handle');

    let rootMetadata;
    try {
      rootMetadata = fstat(rootHandle);
    } catch {
      return deny('root-handle-unavailable');
    }
    if (!isSecureRootDirectory(rootMetadata)) return deny('root-directory-metadata-mismatch');

    try {
      let parentHandle = rootHandle;
      for (const name of DIRECTORY_NAMES) {
        const directoryHandle = openDirectoryNoFollow(parentHandle, name);
        if (!isDistinctOwnedHandle(directoryHandle, rootHandle, retainedHandles)) {
          finalResult = deny('retained-handle-alias');
          break;
        }
        retainedHandles.push(directoryHandle);
        const metadata = fstat(directoryHandle);
        if (!isNonSymlinkDirectory(metadata)) {
          finalResult = deny('ancestor-not-secure-directory');
          break;
        }
        if (name === OWNER_ONLY_DIRECTORY_NAME && !isSecureOwnerOnlyDirectory(metadata, expectedOwner)) {
          finalResult = deny('owner-directory-metadata-mismatch');
          break;
        }
        parentHandle = directoryHandle;
      }

      if (finalResult.code === 'secret-unavailable' && retainedHandles.length === DIRECTORY_NAMES.length) {
        const fileHandle = openFinalNoFollow(retainedHandles.at(-1), SECRET_BASENAME);
        if (!isDistinctOwnedHandle(fileHandle, rootHandle, retainedHandles)) {
          finalResult = deny('retained-handle-alias');
        } else {
          retainedHandles.push(fileHandle);
          const metadata = fstat(fileHandle);
          if (!isSecureSecretFile(metadata, expectedOwner)) {
            finalResult = deny('secret-file-metadata-mismatch');
          } else {
            const secret = readHeldFile(fileHandle, 'utf8');
            finalResult = isCanonicalHeliusDevnetUrl(secret)
              ? result(true, { origin: FIXED_HELIUS_DEVNET_ORIGIN, url: secret })
              : deny('secret-url-invalid');
          }
        }
      }
    } catch {
      finalResult = deny('retained-handle-unavailable');
    }
  } catch {
    finalResult = deny('retained-handle-unavailable');
  }

  let cleanupFailed = false;
  try {
    for (const handle of retainedHandles.toReversed()) {
      try {
        close(handle);
      } catch {
        cleanupFailed = true;
      }
    }
  } catch {
    cleanupFailed = true;
  }
  return cleanupFailed ? deny('retained-handle-cleanup-failed') : finalResult;
}

export {
  FIXED_HELIUS_DEVNET_ORIGIN,
  FIXED_HELIUS_DEVNET_SECRET_PATH,
  PINNED_REVIEWER_SHA256,
  handoffHeliusDevnetRpc,
};
