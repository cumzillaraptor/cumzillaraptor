#!/bin/sh
# Fixed-purpose, no-argument installer for a root-owned no-send policy candidate.
# It copies only hash-pinned policy/guard/test sources, writes public provenance,
# and runs offline Node tests. It has no key, RPC, CLI, signing, send, or deploy logic.
set -eu

if [ "$#" -ne 0 ]; then
  echo "Usage: sudo /usr/local/sbin/cumzinstall-send-candidate-v2" >&2
  exit 64
fi

SRC_ROOT=/home/raspberrypi/workspace-cumzillaraptor
CANDIDATE=/opt/cumzillaraptors-send-runtime-candidate-v2
COMMIT=09b20e169a78bbb1f297f5717d1ae5eeda0c2efb
POLICY_SHA=fd7a6c8a1cea67ddad0ecd2ccce25842b99fe4d0f7b4050bc1d6d1ede3320b8f
POLICY_TEST_SHA=87a3677167f95b2178918b137409ff38ab223ee02582da79a5486b41389b6130
GUARD_SHA=bcf5efb611379c9a9a4a29ceaf1e5d184d95c2b39bdc04f35cdd760a6b0b2fff
GUARD_TEST_SHA=ade62065fe99e42f0dbc54bdc27bcd912eb28e81bde15e5309e31bbcf633c228

hash_file() { sha256sum "$1" | awk '{print $1}'; }
require_hash() {
  [ -f "$1" ] || { echo "Reviewed source file is missing." >&2; exit 1; }
  [ "$(hash_file "$1")" = "$2" ] || { echo "Reviewed source hash mismatch." >&2; exit 1; }
}

require_hash "$SRC_ROOT/scripts/future-send-gate.mjs" "$POLICY_SHA"
require_hash "$SRC_ROOT/tests/future-send-gate.test.mjs" "$POLICY_TEST_SHA"
require_hash "$SRC_ROOT/scripts/future-send-runtime-guard.mjs" "$GUARD_SHA"
require_hash "$SRC_ROOT/tests/future-send-runtime-guard.test.mjs" "$GUARD_TEST_SHA"
[ ! -e "$CANDIDATE" ] || { echo "Candidate directory already exists; refusing replacement." >&2; exit 1; }

umask 077
install -d -o root -g root -m 700 "$CANDIDATE" "$CANDIDATE/scripts" "$CANDIDATE/tests" "$CANDIDATE/config"
install -o root -g root -m 500 "$SRC_ROOT/scripts/future-send-gate.mjs" "$CANDIDATE/scripts/future-send-gate.mjs"
install -o root -g root -m 500 "$SRC_ROOT/scripts/future-send-runtime-guard.mjs" "$CANDIDATE/scripts/future-send-runtime-guard.mjs"
install -o root -g root -m 500 "$SRC_ROOT/tests/future-send-gate.test.mjs" "$CANDIDATE/tests/future-send-gate.test.mjs"
install -o root -g root -m 500 "$SRC_ROOT/tests/future-send-runtime-guard.test.mjs" "$CANDIDATE/tests/future-send-runtime-guard.test.mjs"
printf '%s\n' "commit=$COMMIT" "policy_sha256=$POLICY_SHA" "policy_test_sha256=$POLICY_TEST_SHA" "guard_sha256=$GUARD_SHA" "guard_test_sha256=$GUARD_TEST_SHA" "mode=no-send-policy-and-guard-only" > "$CANDIDATE/config/source-manifest.txt"
chown root:root "$CANDIDATE/config/source-manifest.txt"
chmod 400 "$CANDIDATE/config/source-manifest.txt"
require_hash "$CANDIDATE/scripts/future-send-gate.mjs" "$POLICY_SHA"
require_hash "$CANDIDATE/tests/future-send-gate.test.mjs" "$POLICY_TEST_SHA"
require_hash "$CANDIDATE/scripts/future-send-runtime-guard.mjs" "$GUARD_SHA"
require_hash "$CANDIDATE/tests/future-send-runtime-guard.test.mjs" "$GUARD_TEST_SHA"
cd "$CANDIDATE"
/usr/bin/node --test tests/future-send-gate.test.mjs tests/future-send-runtime-guard.test.mjs
printf '%s\n' 'No-send candidate v2 installation verified; no key, RPC, CLI, signing, send, or deployment operation occurred.'
