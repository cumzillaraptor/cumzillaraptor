# Step 16 identity-header generation review artifact

## Status and authority boundary

This is a **repository-only review artifact only**.  The evidence is **user-reported and not current host authority**; it records no independently performed host inspection.  It is source reported, non-secret metadata only, and is not an authorization for any host action.

In particular, this package does not authorize modifying the active placeholder `tools/v2_r1_helius_handoff/generated_owner_config.h`, and the review header is deliberately outside that active sibling include path.  It does not authorize usable wrapper compilation or execution. It does not authorize endpoint read, RPC, signing, sending, or deployment, including secret reads.  It does not read `/home/piadmin`, read a secret, inspect current permissions, invoke a compiler, execute a wrapper, make a network/RPC request, or perform any process action.

The pure generator has no CLI, environment, configuration, secret discovery, host access, network, RPC, compilation, or execution capability.  It transforms only a caller-supplied canonical string and rejects every supplied user macro definition, including `-D`-like strings, objects, arrays, and header text; it has no macro-predefinition input channel.

## Reviewed inputs and exact byte bindings

The canonical non-secret record is:

- `tools/v2_r1_helius_handoff/step16_identity_header_review/canonical_owner_evidence.txt`
- canonical evidence SHA-256: `1cd653ca02dd1bf075f36b6c92c0ceb530ba9aaadc589c95b534fe82b73116f4`

The resulting separate review header is:

- `tools/v2_r1_helius_handoff/step16_identity_header_review/generated_owner_config.review.h`
- review header SHA-256: `8f7e430182822e5014f4be39fdb3ac4734e3546df54d5c3e448c0eba5f510814`

These digests bind complete UTF-8 bytes, including final line feeds.  A digest match is a review aid, not host-state proof and not authority to replace the active placeholder.

## Canonical evidence grammar

The record has exactly these ten ordered lines and exactly one final LF; no leading/trailing whitespace, blank line, unknown field, duplicate field, or reordered field is valid:

```text
report_classification=user-reported-not-current-host-authority
source=reported
owner_uid=<decimal>
owner_gid=<decimal>
home=directory,uid=0,gid=0,mode=0755
piadmin=directory,uid=<owner_uid>,gid=<owner_gid>,mode=0700
config=directory,uid=<owner_uid>,gid=<owner_gid>,mode=0700
cumzillaraptors=directory,uid=<owner_uid>,gid=<owner_gid>,mode=0700
secret_file=regular,uid=<owner_uid>,gid=<owner_gid>,mode=0600
symlink_indicator=absent
```

`<decimal>` has grammar `0|[1-9][0-9]*` and is bounded inclusively to the Linux 32-bit unsigned `uid_t`/`gid_t` range `0..4294967295`.  The reviewed record fixes both owner values to `1001`.  The metadata statements require `/home` to be root-owned `0755` directory; the reported `piadmin`, `.config`, and `cumzillaraptors` entries to be owner `1001:1001`, mode `0700` directories; and the reported fixed secret file to be an owner `1001:1001`, mode `0600` regular file.  The separate `symlink_indicator=absent` is mandatory.

## Generated review-header shape

`generate_owner_header.mjs` emits a fixed include guard and only the two identity macro definitions with standalone decimal literals:

```c
#define HELIUS_HANDOFF_GENERATED_OWNER_UID 1001
#define HELIUS_HANDOFF_GENERATED_OWNER_GID 1001
```

It emits no identity expression, user value, extra identity macro, include, `undef`, `error`, or compiler option.  The include guard is solely the guard required for this separate review artifact.  The header is not included by the active native wrapper and must not be copied over the repository safety placeholder without later, separately authorized independent review.

## Review limits

This document and artifacts are limited to source, tests, and review documentation.  They neither establish current host ownership/modes nor authorize changing host files.  Any future host inspection, active-header replacement, wrapper build/run, secret handoff, endpoint use, RPC, signing, sending, or deployment requires separate authorization and independent review.
