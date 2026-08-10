#!/usr/bin/env bash
# Validation-only x86 gate. Starts a private local validator with a hash-pinned mpl-core binary.
# It never contacts Devnet, loads a wallet, signs, deploys, uploads, or sends a public transaction.
set -euo pipefail

: "${CUMZ_TEST_VALIDATION_SBF_OUT_DIR:?CUMZ_TEST_VALIDATION_SBF_OUT_DIR must point at the isolated test SBPF artifact directory}"
: "${CUMZ_EXPECTED_BUILD_REVISION:?CUMZ_EXPECTED_BUILD_REVISION must match the checked-out commit}"

if [[ "$(uname -m)" != "x86_64" ]]; then
  echo "REFUSE: the Core-CPI gate requires x86_64; got $(uname -m)." >&2
  exit 64
fi

PROGRAM_SO="$CUMZ_TEST_VALIDATION_SBF_OUT_DIR/cumzillaraptors.test-validation.so"
REVISION_FILE="$CUMZ_TEST_VALIDATION_SBF_OUT_DIR/cumzillaraptors.test-validation.build-revision"
if [[ "$(basename "$PROGRAM_SO")" != "cumzillaraptors.test-validation.so" ]]; then
  echo "REFUSE: local validator may load only the explicitly named test-validation SBPF binary." >&2
  exit 64
fi
test -f "$PROGRAM_SO"
test -f "$REVISION_FILE"
test "$(tr -d '\r\n' < "$REVISION_FILE")" = "$CUMZ_EXPECTED_BUILD_REVISION"

CUMZ_PROGRAM_ID="AYE4iC2gp81H8jvMjk4EGxwP2sJFzuDptUwxqwTZYTMY"
CORE_PROGRAM_ID="CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d"
# Official mpl-core release asset. This exact SHA is checked before validator startup.
CORE_URL="https://github.com/metaplex-foundation/mpl-core/releases/download/release/core%400.12.0/mpl_core_program.so"
CORE_SHA256="afbbe94e116e11ae5d47bc58b1dc90784d2601fdda46c0325906faf357aff963"

WORKDIR="$(mktemp -d)"
VALIDATOR_LOG="$WORKDIR/validator.log"
cleanup() {
  if [[ -n "${VALIDATOR_PID:-}" ]] && kill -0 "$VALIDATOR_PID" 2>/dev/null; then
    kill "$VALIDATOR_PID" || true
    wait "$VALIDATOR_PID" || true
  fi
  if [[ -n "${VALIDATOR_PID:-}" ]] && [[ -f "$VALIDATOR_LOG" ]]; then
    echo "--- private validator launcher log (last 120 lines) ---" >&2
    tail -n 120 "$VALIDATOR_LOG" >&2 || true
  fi
  if [[ -f "$WORKDIR/ledger/validator.log" ]]; then
    echo "--- private validator runtime log (last 240 lines) ---" >&2
    tail -n 240 "$WORKDIR/ledger/validator.log" >&2 || true
  fi
  rm -rf "$WORKDIR"
}
trap cleanup EXIT

curl --fail --location --retry 3 --proto '=https' --tlsv1.2 "$CORE_URL" -o "$WORKDIR/mpl_core_program.so"
CORE_ACTUAL_SHA256="$(sha256sum "$WORKDIR/mpl_core_program.so" | cut -d ' ' -f 1)"
if [[ "$CORE_ACTUAL_SHA256" != "$CORE_SHA256" ]]; then
  echo "ERROR: pinned mpl-core SHA-256 mismatch: expected $CORE_SHA256, got $CORE_ACTUAL_SHA256" >&2
  exit 65
fi
echo "Verified pinned mpl-core SHA-256: $CORE_ACTUAL_SHA256"

# The validator is private to CI and uses only supplied SBPF binaries. It does not clone or contact a cluster.
# It must load the explicitly named test-validation binary, never the ordinary production artifact.
solana-test-validator \
  --reset \
  --ledger "$WORKDIR/ledger" \
  --bind-address 127.0.0.1 \
  --rpc-port 18899 \
  --faucet-port 19900 \
  --bpf-program "$CUMZ_PROGRAM_ID" "$PROGRAM_SO" \
  --bpf-program "$CORE_PROGRAM_ID" "$WORKDIR/mpl_core_program.so" \
  >"$VALIDATOR_LOG" 2>&1 &
VALIDATOR_PID=$!

RPC_URL="http://127.0.0.1:18899"
RPC_HEALTH_PAYLOAD='{"jsonrpc":"2.0","id":1,"method":"getHealth"}'
for _ in $(seq 1 60); do
  if curl --silent --show-error --fail --max-time 2 \
    -H 'content-type: application/json' \
    --data "$RPC_HEALTH_PAYLOAD" "$RPC_URL" | grep -q '"result":"ok"'; then
    break
  fi
  sleep 1
done
if ! curl --silent --show-error --fail --max-time 2 \
  -H 'content-type: application/json' \
  --data "$RPC_HEALTH_PAYLOAD" "$RPC_URL" | grep -q '"result":"ok"'; then
  echo "ERROR: private validator RPC did not become healthy at $RPC_URL" >&2
  exit 66
fi
echo "Private validator RPC is healthy at $RPC_URL"

# Do not weaken this to a mocked Core check. This Task 1 test proves only that
# both programs are loaded; later tasks must execute CreateV1 before any claim-success assertion.
CORE_CLAIM_GATE_REQUIRED=1 \
CORE_CLAIM_VALIDATOR_URL=http://127.0.0.1:18899 \
CORE_CLAIM_PROGRAM_SO="$PROGRAM_SO" \
CORE_CLAIM_CORE_SO="$WORKDIR/mpl_core_program.so" \
node --test tests/local-validator-core-availability.test.mjs

# Execute the real secp + Core happy path with generated local Solana/Ethereum identities and
# a clearly non-production single-leaf claim root. The reviewed metadata root remains immutable.
# No production credential is read or accepted by this harness.
CUMZ_LOCAL_EPHEMERAL_CLAIM_ROOT=1 \
CUMZ_TEST_VALIDATION_AUTHORITY_KEYPAIR_JSON="$(node -e "const {Keypair}=require('@solana/web3.js'); process.stdout.write(JSON.stringify(Array.from(Keypair.generate().secretKey)))")" \
CORE_CLAIM_VALIDATOR_URL=http://127.0.0.1:18899 \
SBF_OUT_DIR="$CUMZ_TEST_VALIDATION_SBF_OUT_DIR" \
CUMZ_EXPECTED_BUILD_REVISION="$CUMZ_EXPECTED_BUILD_REVISION" \
node --test tests/local-ephemeral-claim-root.test.mjs

echo "PASS: local x86 validator loaded the isolated test-validation cumzillaraptors binary and hash-pinned mpl-core."
