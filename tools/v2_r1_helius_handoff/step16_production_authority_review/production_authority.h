#ifndef STEP16_PRODUCTION_AUTHORITY_H
#define STEP16_PRODUCTION_AUTHORITY_H

#include <stddef.h>
#include <stdint.h>

#define STEP16_INVENTORY_COUNT 6U
#define STEP16_OPENAT2_RESOLVE_BENEATH 0x08U
#define STEP16_OPENAT2_RESOLVE_NO_SYMLINKS 0x04U

enum step16_fact_state {
  STEP16_FACT_VALID = 1,
  STEP16_FACT_RELEASED = 2,
  STEP16_FACT_UNKNOWN = 3
};

enum step16_opaque_state {
  STEP16_OPAQUE_PRIVATE_VERIFIED = 1,
  STEP16_OPAQUE_PRIVATE_REPLAYED = 2,
  STEP16_OPAQUE_PRIVATE_UNKNOWN = 3
};

enum step16_authority_status {
  STEP16_AUTHORITY_ACCEPTED = 0,
  STEP16_AUTHORITY_REJECTED = 1
};

struct step16_evidence_token {
  enum step16_fact_state state;
  uint64_t issued_at;
  uint64_t expires_at;
  const void *capability_tag;
  const void *authorization_ref;
  const void *authority_ref;
  const char *commit;
  const char *tree;
};

struct step16_inventory_entry {
  const char *commit;
  const char *tree;
  const char *path;
  const char *blob;
  const char *sha256;
};

struct step16_git_reader_result {
  struct step16_inventory_entry identity;
  struct step16_evidence_token token;
  const void *bounded_bytes_tag;
  size_t byte_count;
  size_t byte_cap;
  enum step16_fact_state state;
};

struct step16_opaque_verification {
  enum step16_opaque_state state;
  const void *private_binding_tag;
  const void *issuer_tag;
};

struct step16_openat2_report {
  int linux_supported;
  uint32_t resolve_flags;
  enum step16_fact_state state;
  const void *capability_tag;
};

struct step16_exec_manifest {
  const char *const *argv;
  size_t argc;
  const char *const *envp;
  size_t envc;
  int inherited_environment;
};

struct step16_compiler_evidence {
  struct step16_evidence_token token;
  const void *compiler_identity_tag;
};

struct step16_authority_policy {
  struct step16_inventory_entry inventory[STEP16_INVENTORY_COUNT];
  const char *root_commit;
  const char *root_tree;
  const void *root_capability_tag;
  const void *opaque_binding_tag;
  const void *opaque_issuer_tag;
  const void *linux_capability_tag;
  const void *compiler_identity_tag;
  const struct step16_exec_manifest *compiler_manifest;
};

struct step16_authority_request {
  const struct step16_authority_policy *policy;
  struct step16_evidence_token canonical_root;
  const struct step16_git_reader_result *git_results;
  size_t git_result_count;
  struct step16_opaque_verification opaque;
  struct step16_evidence_token stage_evidence;
  struct step16_openat2_report containment;
  struct step16_compiler_evidence compiler;
  const struct step16_exec_manifest *launch_manifest;
  const void *caller_root_input;
  const void *caller_worktree_input;
};

/* Pure fixture model: validates only injected facts; it performs no I/O or launch. */
int step16_validate_exec_manifest(const struct step16_exec_manifest *expected,
                                  const struct step16_exec_manifest *actual);
enum step16_authority_status step16_validate_authority_request(
    const struct step16_authority_request *request, uint64_t now);

#endif
