#!/bin/sh
set -eu
PATH=/usr/sbin:/usr/bin:/sbin:/bin

STAGE_DIR=/usr/local/lib/cumzillaraptors-maintenance/prepare-output-v4
SELF=/usr/local/lib/cumzillaraptors-maintenance/prepare-output-v4/cumzinstall-prepare-output-v4.sh
STAGED_EXECUTOR=/usr/local/lib/cumzillaraptors-maintenance/prepare-output-v4/execute-devnet-deployment.mjs
MANIFEST=/usr/local/lib/cumzillaraptors-maintenance/prepare-output-v4/cumzinstall-prepare-output-v4.manifest
DEST=/opt/cumzillaraptors-deploy-runtime/scripts/execute-devnet-deployment.mjs
DEST_DIR=/opt/cumzillaraptors-deploy-runtime/scripts
TMP=''

refuse() {
  /usr/bin/printf '%s\n' "Refusing: $1" >&2
  exit 1
}

if [ "$(/usr/bin/id -u)" -ne 0 ]; then
  /usr/bin/printf '%s\n' 'Refusing: root is required.' >&2
  exit 77
fi

if [ "$#" -ne 0 ]; then
  /usr/bin/printf '%s\n' 'Usage: fixed root-staged v4 installer accepts no arguments.' >&2
  exit 64
fi

[ "$0" = "$SELF" ] || refuse "Must execute only the fixed root-staged installer path."

hash_file() {
  /usr/bin/sha256sum "$1" | /usr/bin/awk '{print $1}'
}

require_hash() {
  [ -f "$1" ] && [ ! -L "$1" ] || refuse "Required regular file is missing or is a symlink."
  [ "$(hash_file "$1")" = "$2" ] || refuse "SHA-256 mismatch."
}

require_regular_root_file_mode() {
  [ -f "$1" ] && [ ! -L "$1" ] || refuse "Required regular file is missing or is a symlink."
  [ "$(/usr/bin/stat -c '%F:%u:%g:%a' "$1")" = "regular file:0:0:$2" ] || refuse "Required file has unsafe ownership or mode."
}

require_secure_directory() {
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

validate_directories() {
  require_secure_directory "/"
  require_secure_directory "/usr"
  require_secure_directory "/usr/local"
  require_secure_directory "/usr/local/lib"
  require_secure_directory "/usr/local/lib/cumzillaraptors-maintenance"
  require_secure_directory "/usr/local/lib/cumzillaraptors-maintenance/prepare-output-v4"
  require_secure_directory "/opt"
  require_secure_directory "/opt/cumzillaraptors-deploy-runtime"
  require_secure_directory "/opt/cumzillaraptors-deploy-runtime/scripts"
}

cleanup() {
  if [ -n "$TMP" ] && [ -e "$TMP" ]; then
    /usr/bin/rm -f "$TMP"
  fi
}

trap cleanup 0 HUP INT TERM

[ "$DEST_DIR" = "$(/usr/bin/dirname "$DEST")" ] || refuse "DEST_DIR must be the exact dirname of DEST."
validate_directories
require_regular_root_file_mode "$SELF" 700
require_regular_root_file_mode "$MANIFEST" 600
require_regular_root_file_mode "$STAGED_EXECUTOR" 600

# The root bootstrap pins this manifest before this script is executed.
INSTALLER_SHA256=$(/usr/bin/awk -F= '/^INSTALLER_SHA256=[a-f0-9]{64}$/ { print $2 }' "$MANIFEST")
EXECUTOR_SHA256=$(/usr/bin/awk -F= '/^EXECUTOR_SHA256=[a-f0-9]{64}$/ { print $2 }' "$MANIFEST")
[ "$(/usr/bin/printf '%s\n' "$INSTALLER_SHA256" | /usr/bin/wc -l)" -eq 1 ] || refuse "Manifest installer hash is invalid."
[ "$(/usr/bin/printf '%s\n' "$EXECUTOR_SHA256" | /usr/bin/wc -l)" -eq 1 ] || refuse "Manifest executor hash is invalid."
require_hash "$SELF" "$INSTALLER_SHA256"
require_hash "$STAGED_EXECUTOR" "$EXECUTOR_SHA256"
require_regular_root_file_mode "$DEST" 600

umask 077
TMP=$(/usr/bin/mktemp "$DEST_DIR/.execute-devnet-deployment.mjs.v4.XXXXXX")
/usr/bin/chown root:root "$TMP"
/usr/bin/chmod 600 "$TMP"
/usr/bin/cp "$STAGED_EXECUTOR" "$TMP"
require_hash "$TMP" "$EXECUTOR_SHA256"
require_regular_root_file_mode "$TMP" 600
/usr/bin/mv -f "$TMP" "$DEST"
TMP=''
require_hash "$DEST" "$EXECUTOR_SHA256"
require_regular_root_file_mode "$DEST" 600
/usr/bin/node --check "$DEST"
/usr/bin/printf '%s\n' 'Fixed root-staged runtime source replacement verified.'
