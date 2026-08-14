# V2 r1 privileged-bootstrap review contract

## Status and fixed scope

This is Step 5 repository-only design documentation and a deterministic offline repository-text test. It is not an authorization record, privileged implementation, helper, installer, release seal, manifest, bootstrap command, or host procedure.

This contract is bound to published Step 4 revision 53530125ea25e286dd26c08b215f2b8097386af2. It uses the Step 4-defined fresh r1 candidate identity without selecting or repeating a literal host path. No input, caller, environment, configuration, branch, tag, or working directory can choose another identity.

## Preserved exclusions and evidence boundary

The legacy candidate remains preserved indefinitely, untouched, uninspected, and unavailable for reuse forever. The active runtime remains permanently excluded and uninspected. Neither is named here as a host path and neither can be a source, stage, destination, or fallback.

Earlier reported preflight evidence is historical only. It is not current host proof, production authority, or permission for any operation.

## Future review sequence only

A future privileged-bootstrap consideration requires every following separate gate in order:

1. A distinct explicit human authorization record, separate from this contract, Step 4, prior evidence, release-seal material, and later installation or prepare approvals. It must state exact limited host scope and expiry; root ownership is never human approval. It must pin this exact published revision and an exact complete actual-byte release seal. Mutable refs, working-tree bytes, synthetic fixtures, earlier candidate evidence, and caller-provided values are non-authoritative.
2. Independent specification and security review of that authorization record, the pinned revision, complete actual-byte seal, Step 4, and the descriptor-pinned bootstrap contract. Any mismatch, incompleteness, ambiguity, changed revision or seal, or missing record stops fail-closed and requires a new authorization record and review.
3. A new separately authorized narrow metadata-only absence preflight for the Step 4-defined fresh r1 candidate identity immediately before any privileged-bootstrap host consideration. Existence, inaccessibility, ambiguity, authorization mismatch, stale evidence, or an intervening action or state change stops fail-closed. It must not traverse, read contents, create, modify, remove, rename, reuse, stage, or inspect excluded areas. Passing it is not bootstrap, installation, helper, or prepare authority.
4. A later separately authorized implementation review may select fixed source, staging, and destination designs. This Step 5 contract selects none. That later design must be root-only, accept no caller arguments, ignore inherited environment for authority, prove typed non-echoing refusal before source or destination interaction, and follow the descriptor-pinned bootstrap contract's Linux no-symlink, retained-descriptor-only, no pathname fallback or reopen, exclusive create-once, and held-descriptor post-copy seal-verification requirements. A pre-existing stage or destination, or any seal, descriptor, regular-file, ownership, or mode failure, must refuse without cleanup, replacement, reuse, fallback, retry, or alternate-path selection.

## Separate later gates

An installation gate requires later explicit authorization after the prior review sequence. Step 5 does not authorize installation.

A prepare gate requires distinct later explicit authorization after a successful installation gate. Installation cannot imply prepare. A later prepare scope cannot be inferred to access credentials, runtime state, endpoints, artifacts, or a CLI.

Neither gate authorizes signing, sending, deployment, launch, or any blockchain or network action.

## Prohibited current operations

Step 5 authorizes no host command, root or sudo action, helper implementation or execution, candidate creation, source checkout staging, installation, credential or runtime access, network or RPC use, signing, serialization, sending, deployment, spending, minting, claim, payment, upload, upgrade, mainnet action, or any other launch operation. It selects or approves no source, staging, or destination path; key; artifact; endpoint; CLI; sudo rule; helper binary; installer; manifest; or actual release-seal value.

## Publication boundary

Passing Step 5 authorizes neither commit nor publication. A separate explicit authorization is required for any repository commit or publication. Publication would remain repository-only and would not authorize a privileged bootstrap, installation, or prepare.
