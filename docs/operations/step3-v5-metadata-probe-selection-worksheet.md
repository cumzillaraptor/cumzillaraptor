# Step 3 v5 metadata-probe selection worksheet

## Purpose

This worksheet selects no host object and authorizes no host inspection or execution.

No action is needed now.

Do not enter a path, basename, identifier, key location, endpoint, command, or credential into this worksheet.

## Why the later choice exists

A safe no-send refresh cannot use a mutable checkout, a temporary location, a cache, or a guessed protected location as its source. The published design therefore requires a later probe to be limited to one specifically justified object.

A later human may choose one exact parent directory and one exact leaf basename only after understanding why that one object is needed for the no-send refresh.

The later choice must not name or reuse the permanently excluded stage or active runtime.

## What the later probe would and would not observe

A future probe would report only non-dereferencing existence, type, numeric uid, numeric gid, and octal mode.

It would not read contents, list directories, resolve symlinks, reveal targets, hash bytes, access keys or endpoints, call RPC, or change anything.

A future choice is not itself permission to inspect it.

## What must happen before any host probe

Before any host probe, a separate human host-gate approval, immutable authorization record, independently reviewed probe implementation, and fresh review are all required.

The later approval must bind one exact parent and one exact leaf. Any ambiguity, missing evidence, substitution, symlink, inaccessible object, or unexpected metadata must stop without broadening scope.

## Non-authority boundary

This worksheet authorizes no repository publication, host access, root command, filesystem inspection, key or endpoint access, network/RPC call, signing, sending, deployment, or Devnet write.
