# v4 fixed root-staged replacement bootstrap (review template)

> **Template only — do not execute this document.** A separately authorized root operator must independently review the repository revision, this template, all three source artifacts, and the destination state before deciding whether to manually transcribe it. This repository contains no launcher and this document must never be sourced.

## Purpose and fixed scope

This one-use template stages exactly three reviewed source artifacts into the fixed root-only directory `/usr/local/lib/cumzillaraptors-maintenance/prepare-output-v4` and executes **only** the staged installer. The installer replaces only `/opt/cumzillaraptors-deploy-runtime/scripts/execute-devnet-deployment.mjs`, requiring the reviewed executor SHA-256 `721fd1221f998c7b085491924dc60207dec45e328a7da1ebf3cd8c59de57421b`.

No network access, credentials, signing, transaction submission, chain tooling, package managers, or repository writes are part of this template.

## Security properties and limitations

- The inherited command search path is discarded and every external utility is invoked through its fixed `/usr/bin/...` path.
- Before creation, the template validates `/`, `/usr`, `/usr/local`, `/usr/local/lib`, and `/usr/local/lib/cumzillaraptors-maintenance` as root-owned, non-symlink directories without group/world write permission. The versioned stage path **must not exist at all**; it is created exactly once, then must be a non-symlink `root:root` mode `0700` directory.
- Immediately before each copy, the checkout source is required to be a non-symlink regular file and is hashed. The copy is made with `cp --no-dereference`, then **before any ownership or mode operation** the staged object is required to be a non-symlink regular file. Because that object is inside the fresh root-only stage, the checkout owner cannot race this post-copy validation. Only then is root ownership and the exact mode applied; the staged artifact is subsequently checked for exact root metadata and hashed against the immutable value. The final pre-exec checks repeat the secure-chain, stage-directory, staged metadata, and hash checks.
- A checkout owner can still replace a source object after its last type/hash check and before or during `cp`; this can cause a failed copy or a staged non-symlink/hash failure (a denial of service/read-path race), but it cannot cause execution of source bytes or privileged metadata changes to an attacker-selected symlink referent. The command only `exec`s the staged installer after its staged type, ownership, mode, and hash checks pass. An operator-controlled immutable reviewed snapshot is required to eliminate that residual source-read race entirely.

## Preconditions for the authorized root operator

- Use the literal absolute source paths below after independently reviewing their bytes; do not substitute a current directory, a relative path, a symlink, or user input.
- Ensure the version-specific staging directory does not already exist. Do not remove, reuse, or repoint it to make this template succeed.
- Run the command only from a root shell that has already been explicitly authorized. This template intentionally does not include privilege escalation.

## Manually transcribed root-shell command template

The hashes below are immutable review inputs. A failed check stops the command. The command never runs a checkout path.

```sh
set -eu
PATH=/usr/sbin:/usr/bin:/sbin:/bin
umask 077

SOURCE_INSTALLER=/home/raspberrypi/workspace-cumzillaraptor/scripts/cumzinstall-prepare-output-v4.sh
SOURCE_EXECUTOR=/home/raspberrypi/workspace-cumzillaraptor/scripts/execute-devnet-deployment.mjs
SOURCE_MANIFEST=/home/raspberrypi/workspace-cumzillaraptor/scripts/cumzinstall-prepare-output-v4.manifest
STAGE_DIR=/usr/local/lib/cumzillaraptors-maintenance/prepare-output-v4
STAGED_INSTALLER=/usr/local/lib/cumzillaraptors-maintenance/prepare-output-v4/cumzinstall-prepare-output-v4.sh
STAGED_EXECUTOR=/usr/local/lib/cumzillaraptors-maintenance/prepare-output-v4/execute-devnet-deployment.mjs
STAGED_MANIFEST=/usr/local/lib/cumzillaraptors-maintenance/prepare-output-v4/cumzinstall-prepare-output-v4.manifest
EXPECTED_INSTALLER_SHA256=b75d5038a9ebd495b43d694703d29d99645ae9cba8157a9017a7ebb43c3d734c
EXPECTED_EXECUTOR_SHA256=721fd1221f998c7b085491924dc60207dec45e328a7da1ebf3cd8c59de57421b
EXPECTED_MANIFEST_SHA256=aaebc03c6baa962cc9007b5735b3168351f9a287987f97f160aeea83de5139c0

refuse() {
  /usr/bin/printf '%s\n' "Refusing: $1" >&2
  exit 1
}

hash_file() {
  /usr/bin/sha256sum "$1" | /usr/bin/awk '{print $1}'
}

require_secure_root_directory() {
  [ -d "$1" ] && [ ! -L "$1" ] || refuse "Required directory is missing or is a symlink."
  metadata=$(/usr/bin/stat -c '%F:%u:%g:%a' "$1")
  case "$metadata" in
    directory:0:0:*) ;;
    *) refuse "Required directory is not root-owned." ;;
  esac
  mode=$(/usr/bin/printf '%s\n' "$metadata" | /usr/bin/awk -F: '{print $4}')
  case "$mode" in
    *[2367]|*[2367]?) refuse "Required directory is group- or world-writable." ;;
  esac
}

require_secure_root_chain() {
  require_secure_root_directory "/"
  require_secure_root_directory "/usr"
  require_secure_root_directory "/usr/local"
  require_secure_root_directory "/usr/local/lib"
  require_secure_root_directory "/usr/local/lib/cumzillaraptors-maintenance"
}

require_source_regular() {
  [ -f "$1" ] && [ ! -L "$1" ] || refuse "Source is missing, not regular, or is a symlink."
}

require_exact_root_stage_directory() {
  [ -d "$1" ] && [ ! -L "$1" ] || refuse "Staging directory is missing or is a symlink."
  [ "$(/usr/bin/stat -c '%F:%u:%g:%a' "$1")" = 'directory:0:0:700' ] || refuse "Staging directory ownership or mode is unsafe."
}

require_staged_regular_file() {
  [ -f "$1" ] && [ ! -L "$1" ] || refuse "Staged artifact is missing, not regular, or is a symlink."
}

require_staged_regular_root_file() {
  require_staged_regular_file "$1"
  [ "$(/usr/bin/stat -c '%F:%u:%g:%a' "$1")" = "regular file:0:0:$2" ] || refuse "Staged artifact ownership or mode is unsafe."
}

copy_and_verify() {
  source=$1
  staged=$2
  expected=$3
  mode=$4
  require_source_regular "$source"
  [ "$(hash_file "$source")" = "$expected" ] || refuse "Source SHA-256 mismatch."
  require_source_regular "$source"
  /usr/bin/cp --no-dereference "$source" "$staged"
  require_staged_regular_file "$staged"
  /usr/bin/chown root:root "$staged"
  /usr/bin/chmod "$mode" "$staged"
  require_staged_regular_root_file "$staged" "$mode"
  [ "$(hash_file "$staged")" = "$expected" ] || refuse "Staged SHA-256 mismatch."
}

[ "$(/usr/bin/id -u)" -eq 0 ] || refuse "Root is required."
require_secure_root_chain
[ ! -e "$STAGE_DIR" ] && [ ! -L "$STAGE_DIR" ] || refuse "Staging directory must not already exist."
/usr/bin/mkdir -m 700 "$STAGE_DIR"
/usr/bin/chown root:root "$STAGE_DIR"
require_exact_root_stage_directory "$STAGE_DIR"

copy_and_verify "$SOURCE_INSTALLER" "$STAGED_INSTALLER" "$EXPECTED_INSTALLER_SHA256" 700
copy_and_verify "$SOURCE_EXECUTOR" "$STAGED_EXECUTOR" "$EXPECTED_EXECUTOR_SHA256" 600
copy_and_verify "$SOURCE_MANIFEST" "$STAGED_MANIFEST" "$EXPECTED_MANIFEST_SHA256" 600

require_secure_root_chain
require_exact_root_stage_directory "$STAGE_DIR"
require_staged_regular_root_file "$STAGED_INSTALLER" 700
require_staged_regular_root_file "$STAGED_EXECUTOR" 600
require_staged_regular_root_file "$STAGED_MANIFEST" 600
[ "$(hash_file "$STAGED_INSTALLER")" = "$EXPECTED_INSTALLER_SHA256" ] || refuse "Staged installer SHA-256 mismatch before exec."
[ "$(hash_file "$STAGED_EXECUTOR")" = "$EXPECTED_EXECUTOR_SHA256" ] || refuse "Staged executor SHA-256 mismatch before exec."
[ "$(hash_file "$STAGED_MANIFEST")" = "$EXPECTED_MANIFEST_SHA256" ] || refuse "Staged manifest SHA-256 mismatch before exec."

exec "$STAGED_INSTALLER"
```

## Review evidence to retain

Record the source hashes, staged hashes, metadata results, installer output, and final destination hash/mode. A failed check must stop the process; do not repair it by loosening permissions, following symlinks, selecting a different source path, or reusing the versioned stage directory.
