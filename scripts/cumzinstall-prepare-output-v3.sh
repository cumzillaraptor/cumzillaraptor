#!/bin/sh
set -eu

if [ "$(/usr/bin/id -u)" -ne 0 ]; then
  echo "Refusing: root is required." >&2
  exit 77
fi

if [ "$#" -ne 0 ]; then
  echo "Usage: /usr/local/sbin/cumzinstall-prepare-output-v3" >&2
  exit 64
fi

SRC=/home/raspberrypi/workspace-cumzillaraptor/scripts/execute-devnet-deployment.mjs
DEST=/opt/cumzillaraptors-deploy-runtime/scripts/execute-devnet-deployment.mjs
DEST_DIR=/opt/cumzillaraptors-deploy-runtime/scripts
EXPECTED_SHA256=721fd1221f998c7b085491924dc60207dec45e328a7da1ebf3cd8c59de57421b
TMP=''

refuse() {
  echo "Refusing: $1" >&2
  exit 1
}

hash_file() {
  /usr/bin/sha256sum "$1" | /usr/bin/awk '{print $1}'
}

require_hash() {
  [ -f "$1" ] || refuse "Required regular file is missing."
  [ "$(hash_file "$1")" = "$2" ] || refuse "SHA-256 mismatch."
}

require_metadata() {
  [ "$(/usr/bin/stat -c '%F:%u:%g:%a' "$1")" = 'regular file:0:0:600' ] || refuse "File must be root-owned mode 0600."
}

cleanup() {
  if [ -n "$TMP" ] && [ -e "$TMP" ]; then
    /usr/bin/rm -f "$TMP"
  fi
}

trap cleanup 0 HUP INT TERM

require_hash "$SRC" "$EXPECTED_SHA256"
[ -f "$DEST" ] && [ ! -L "$DEST" ] || refuse "Existing destination must be a regular file."
require_metadata "$DEST"

umask 077
TMP=$(/usr/bin/mktemp "$DEST_DIR/.execute-devnet-deployment.mjs.XXXXXX")
/usr/bin/chown root:root "$TMP"
/usr/bin/chmod 600 "$TMP"
/usr/bin/cp "$SRC" "$TMP"
require_hash "$TMP" "$EXPECTED_SHA256"
require_metadata "$TMP"
/usr/bin/mv -f "$TMP" "$DEST"
TMP=''
require_hash "$DEST" "$EXPECTED_SHA256"
require_metadata "$DEST"

/usr/bin/node --check "$DEST"
printf '%s\n' 'Prepare-output runtime source replacement verified.'
