# Step 27 fixture-only tpm2-tss ESAPI preflight model review

## Selected boundary

This review selects `tpm2-tss ESAPI (C)` only as the future interface family for a later separately reviewed host integration. It binds the published Step 26 predecessor commit `36079a5e6e8b863bc8bf6f8e01e055c68f748075` as historical input only. It selects no installed tpm2-tss version, shared library, ESAPI context, TCTI, device, device path, transport, TPM command, hierarchy, policy, key, NV index, authorization value, or live TPM fact.

## Repository-only model

The selected source pair is `tools/v2_r1_tpm_preflight/esapi_preflight.c` (SHA-256 `e1f7b46c777837e7dd94cf73448559bc969479fce852c5ed18a90734ac956f6b`) and `tools/v2_r1_tpm_preflight/esapi_preflight.h` (SHA-256 `adae7e952f5b594746900406ec5cb0d4528d12984416d2d65202435e275585a1`). Production compilation fails closed unless `STEP27_ESAPI_PREFLIGHT_FIXTURE` is defined. The source imports no tpm2-tss headers and contains no ESAPI context initialization, TCTI, device access, dynamic loading, process, filesystem, network, or TPM mutation surface.

Its sole public function accepts injected enum facts and returns only `STEP27_PREFLIGHT_COMPATIBLE` or `STEP27_PREFLIGHT_DENY_OPAQUE`. Compatibility requires the exact closed set: presence, TPM 2.0 major version, NV-counter capability, policy primitive availability, and opaque identity binding. Any missing or substituted fact returns opaque denial. The fixture `tests/fixtures/v2-r1-step27-esapi-preflight-fixture.c` (SHA-256 `ec5039d68ec00021a32c45c768f932c559c1e28b605e8201d7ee9c077a366bce`) is the sole test driver and carries no host integration claim.

## Future host integration boundary

A later separately approved implementation review must pin exact tpm2-tss ESAPI/TCTI versions and complete host-integration source bytes, then prove that its fixed ordered read-only queries map only into these five facts and cannot invoke any state-changing or raw command path. A distinct explicit host-execution authorization is still required before a single live compatibility preflight.

Passing this review authorizes no compilation, tpm2-tss installation, TPM device access, TPM command, preflight run, TPM provisioning or mutation, SQLite action, record creation, host discovery, compiler invocation, endpoint/secret access, RPC, signing, sending, deployment, commit, or publication.
