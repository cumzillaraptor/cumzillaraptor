# Step 26 TPM compatibility-preflight implementation contract

## Status, predecessor, and present boundary

This is a repository-only implementation-review contract and deterministic repository-text test for the future Step 25 TPM compatibility preflight. It is not a TPM command, TPM probe, tool installation, device selection, TPM provisioning, ownership change, key or NV-index operation, counter read/write, SQLite action, record creation, host gate, discovery execution, compiler invocation, build, or authorization for any live action. It binds the immediate published predecessor exactly to `9fe8b236e129a0131828fa7a0f8360702a994cd4`; no branch, tag, successor, working tree, caller, environment, configuration, or supplied value may substitute it. The predecessor is historical design input only, never current authority.

## Future fixed preflight implementation and operation boundary

A later separately approved review must select exactly one preflight implementation with full repository commit, exact repo-relative source path, verified regular non-symlink tree entry, exact blob ID, and SHA-256 of complete source bytes. It must pin exactly one reviewed TPM interface/library version and an exact ordered operation allowlist. The only permitted future TPM facts are: presence; TPM major version; supported monotonic-counter/NV capability; availability of required authorization and policy primitives; and an opaque device-identity binding. The implementation must produce exactly one canonical UTF-8/LF report with fixed field order, one final LF, no unknown fields, and no raw TPM response, handle, public material, secret, authorization value, key, NV name, counter value, transport path, endpoint, host path, or error echo.

The exact operation allowlist may contain only read-only TPM capability/version/property and opaque identity-attestation queries proven not to mutate TPM state. It must reject every other operation, including create, define, write, increment, extend, lock, clear, hierarchy/ownership change, provisioning, key/NV-index creation/deletion, authorization/policy change, dictionary-attack operation, startup/shutdown, context save/load, and raw command passthrough. No caller argument, environment, configuration, CWD, device path, transport, raw handle, or runtime default may choose operations or TPM objects.

## Future fixture proof, host gate, and fail-closed behavior

A later implementation review must prove using injected TPM fixtures only: exact allowlisted call order; canonical report grammar; no mutation calls; rejection of missing, disabled, emulated, inaccessible, untrusted, malformed, incompatible, ambiguous, substituted, unavailable, or uncertain capability facts; no sensitive/error echo; and no SQLite, filesystem content, network, process, secret, RPC, signing, send, deploy, compiler, candidate, or host-object capability. Fixture proof does not establish a live TPM.

Only after that reviewed implementation exists may a separate explicit human-approved host-execution gate select the fixed admin context and authorize exactly one read-only preflight run. That later authorization must bind this implementation identity and report grammar, require complete reported output, and still does not authorize provisioning, TPM mutation, SQLite action, record acceptance, host discovery, candidate nomination, compiler execution, endpoint/secret access, RPC, signing, sending, or deployment.

Passing this test authorizes neither selecting nor implementing a TPM preflight, installing tooling, probing TPM hardware, accessing the host, creating or accepting a record, accessing SQLite, provisioning or mutating TPM state, commit, or publication. Each requires separate explicit human approval.
