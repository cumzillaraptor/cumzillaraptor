#!/bin/sh
set -eu

redact_stderr() {
  /usr/bin/sed -E \
    -e '/https?:\/\//I s#.*#[REDACTED]#' \
    -e '/(endpoint|artifact|authorization|token|secret|key|credential|password|passwd|username|user|pass|login|bearer)/I s#.*#[REDACTED]#' \
    "$1" | /usr/bin/cut -c1-512
}

if [ "$(/usr/bin/id -u)" -ne 0 ]; then
  printf '%s\n' 'Refusing: root is required.' >&2
  exit 77
fi

if [ "$#" -eq 0 ]; then
  tmpdir=$(/usr/bin/mktemp -d /tmp/cumzdeploy-v2-prepare.XXXXXX) || exit 1
  stdout_file="$tmpdir/stdout"
  stderr_file="$tmpdir/stderr"
  trap '/bin/rm -rf "$tmpdir"' EXIT HUP INT TERM

  cd -- /opt/cumzillaraptors-send-runtime-candidate-v2
  if ! (
    ulimit -f 1
    /usr/bin/env -i PATH=/usr/sbin:/usr/bin:/sbin:/bin LC_ALL=C HOME=/nonexistent /usr/bin/node /opt/cumzillaraptors-send-runtime-candidate-v2/scripts/v2-root-runtime-prepare-coordinator.mjs --prepare </dev/null >"$stdout_file" 2>"$stderr_file"
  ); then
    stderr_bytes=$(/usr/bin/wc -c <"$stderr_file")
    safe_stderr=$(redact_stderr "$stderr_file")
    : "${stderr_bytes:?}" "${safe_stderr:+redacted}"
    exit 1
  fi

  stderr_bytes=$(/usr/bin/wc -c <"$stderr_file")
  if [ "$stderr_bytes" -gt 512 ]; then
    safe_stderr=$(redact_stderr "$stderr_file")
    : "${safe_stderr:+redacted}"
    exit 1
  fi

  if ! /usr/bin/node --input-type=module - "$stdout_file" 2>/dev/null <<'NODE'
import { readFileSync } from 'node:fs';
const raw = readFileSync(process.argv[2], 'utf8');
if (!raw.endsWith('\n') || raw.length < 3) process.exit(1);
const serialized = raw.slice(0, -1);
let review;
try {
  review = JSON.parse(serialized);
} catch {
  process.exit(1);
}
const sensitive = /(?:https?:\/\/|\b(?:endpoint|artifact|authorization|token|secret|key|credential(?:s)?|password|passwd|username|user|pass|login|bearer|api[_-]?key)\b)/i;
if (!review || typeof review !== 'object' || Array.isArray(review) || JSON.stringify(review) !== serialized || sensitive.test(serialized)) process.exit(1);
process.stdout.write(`${JSON.stringify({ ok: true, review })}\n`);
NODE
  then
    safe_stderr=$(redact_stderr "$stderr_file")
    : "${safe_stderr:+redacted}"
    exit 1
  fi

  exit 0
fi

printf '%s\n' 'Refusing: no arguments are accepted.' >&2
exit 64
