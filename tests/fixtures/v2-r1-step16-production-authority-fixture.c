#include "production_authority.h"

#include <stdio.h>

static int root_cap;
static int opaque_binding;
static int opaque_issuer;
static int linux_cap;
static int compiler_cap;
static int root_auth;
static int reader_auth;
static int stage_auth;
static int compiler_auth;
static int reader_authority;
static int stage_authority;
static int compiler_authority;
static int bytes_tag;

static const char *const argv_fixed[] = { "compiler-fixed", "-c", "unit-fixed" };
static const char *const env_fixed[] = { "LC_ALL=C" };

static struct step16_evidence_token token(const void *cap, const void *auth,
                                          const void *authority) {
  struct step16_evidence_token value = {
    STEP16_FACT_VALID, 10U, 100U, cap, auth, authority, NULL, NULL
  };
  return value;
}

static int accepted(const struct step16_authority_request *request) {
  return step16_validate_authority_request(request, 50U) == STEP16_AUTHORITY_ACCEPTED;
}

int main(void) {
  struct step16_authority_policy policy = { 0 };
  struct step16_git_reader_result results[STEP16_INVENTORY_COUNT + 1U] = { 0 };
  struct step16_exec_manifest manifest = {
    argv_fixed, 3U, env_fixed, 1U, 0
  };
  struct step16_authority_request request = { 0 };
  size_t index;
  int checks = 0;

  policy.root_commit = "commit-fixed";
  policy.root_tree = "tree-fixed";
  policy.root_capability_tag = &root_cap;
  policy.opaque_binding_tag = &opaque_binding;
  policy.opaque_issuer_tag = &opaque_issuer;
  policy.linux_capability_tag = &linux_cap;
  policy.compiler_identity_tag = &compiler_cap;
  policy.compiler_manifest = &manifest;
  for (index = 0; index < STEP16_INVENTORY_COUNT; ++index) {
    static const char *const paths[STEP16_INVENTORY_COUNT] = {
      "review/a", "review/b", "review/c", "model/a", "model/b", "model/c"
    };
    static const char *const blobs[STEP16_INVENTORY_COUNT] = {
      "blob-a", "blob-b", "blob-c", "blob-d", "blob-e", "blob-f"
    };
    static const char *const digests[STEP16_INVENTORY_COUNT] = {
      "digest-a", "digest-b", "digest-c", "digest-d", "digest-e", "digest-f"
    };
    policy.inventory[index] = (struct step16_inventory_entry){
      "commit-fixed", "tree-fixed", paths[index], blobs[index], digests[index]
    };
    results[index].identity = policy.inventory[index];
    results[index].token = token(&root_cap, &reader_auth, &reader_authority);
    results[index].bounded_bytes_tag = &bytes_tag;
    results[index].byte_count = 12U;
    results[index].byte_cap = 12U;
    results[index].state = STEP16_FACT_VALID;
  }
  request.policy = &policy;
  request.canonical_root = token(&root_cap, &root_auth, &root_cap);
  request.canonical_root.commit = policy.root_commit;
  request.canonical_root.tree = policy.root_tree;
  request.git_results = results;
  request.git_result_count = STEP16_INVENTORY_COUNT;
  request.opaque = (struct step16_opaque_verification){
    STEP16_OPAQUE_PRIVATE_VERIFIED, &opaque_binding, &opaque_issuer
  };
  request.stage_evidence = token(&linux_cap, &stage_auth, &stage_authority);
  request.containment = (struct step16_openat2_report){
    1, STEP16_OPENAT2_RESOLVE_BENEATH | STEP16_OPENAT2_RESOLVE_NO_SYMLINKS,
    STEP16_FACT_VALID, &linux_cap
  };
  request.compiler.token = token(&compiler_cap, &compiler_auth, &compiler_authority);
  request.compiler.compiler_identity_tag = &compiler_cap;
  request.launch_manifest = &manifest;

  checks += accepted(&request);
  /* policy-manifest-missing */
  policy.compiler_manifest = NULL;
  checks += !accepted(&request);
  policy.compiler_manifest = &manifest;
  /* policy-manifest-inherited */
  { struct step16_exec_manifest inherited_policy = manifest;
    inherited_policy.inherited_environment = 1;
    policy.compiler_manifest = &inherited_policy;
    checks += !accepted(&request); }
  policy.compiler_manifest = &manifest;

  results[0].token.expires_at = 50U;
  checks += !accepted(&request);
  results[0].token.expires_at = 100U;
  request.stage_evidence.state = STEP16_FACT_RELEASED;
  checks += !accepted(&request);
  request.stage_evidence.state = STEP16_FACT_VALID;

  results[0].identity.path = "review/substitute";
  checks += !accepted(&request);
  results[0].identity = policy.inventory[0];
  request.git_result_count = STEP16_INVENTORY_COUNT - 1U;
  checks += !accepted(&request);
  request.git_result_count = STEP16_INVENTORY_COUNT;
  /* exactly-seven-results */
  request.git_result_count = STEP16_INVENTORY_COUNT + 1U;
  checks += !accepted(&request);
  request.git_result_count = STEP16_INVENTORY_COUNT;
  results[5].identity = policy.inventory[0];
  checks += !accepted(&request);
  results[5].identity = policy.inventory[5];

  results[1].identity.blob = "blob-substitute";
  checks += !accepted(&request);
  results[1].identity = policy.inventory[1];
  results[2].identity.sha256 = "digest-substitute";
  checks += !accepted(&request);
  results[2].identity = policy.inventory[2];
  results[3].byte_count = 13U;
  checks += !accepted(&request);
  results[3].byte_count = 12U;
  /* missing-bounded-bytes-tag */
  results[3].bounded_bytes_tag = NULL;
  checks += !accepted(&request);
  results[3].bounded_bytes_tag = &bytes_tag;
  /* invalid-git-result-state */
  results[4].state = STEP16_FACT_RELEASED;
  checks += !accepted(&request);
  results[4].state = STEP16_FACT_VALID;

  request.opaque.private_binding_tag = &root_cap;
  checks += !accepted(&request);
  request.opaque.private_binding_tag = &opaque_binding;
  request.opaque.state = STEP16_OPAQUE_PRIVATE_REPLAYED;
  checks += !accepted(&request);
  request.opaque.state = STEP16_OPAQUE_PRIVATE_VERIFIED;
  /* issuer-mismatch */
  request.opaque.issuer_tag = &root_cap;
  checks += !accepted(&request);
  request.opaque.issuer_tag = &opaque_issuer;

  request.containment.linux_supported = 0;
  checks += !accepted(&request);
  request.containment.linux_supported = 1;
  request.containment.resolve_flags = STEP16_OPENAT2_RESOLVE_BENEATH;
  checks += !accepted(&request);
  request.containment.resolve_flags = STEP16_OPENAT2_RESOLVE_BENEATH |
                                      STEP16_OPENAT2_RESOLVE_NO_SYMLINKS;
  /* containment-non-valid */
  request.containment.state = STEP16_FACT_RELEASED;
  checks += !accepted(&request);
  request.containment.state = STEP16_FACT_VALID;
  /* containment-capability-mismatch */
  request.containment.capability_tag = &root_cap;
  checks += !accepted(&request);
  request.containment.capability_tag = &linux_cap;

  request.caller_root_input = &root_cap;
  checks += !accepted(&request);
  request.caller_root_input = NULL;
  request.caller_worktree_input = &root_cap;
  checks += !accepted(&request);
  request.caller_worktree_input = NULL;

  { struct step16_exec_manifest inherited = manifest; inherited.inherited_environment = 1;
    request.launch_manifest = &inherited; checks += !accepted(&request); }
  { static const char *const bad_d[] = { "compiler-fixed", "-DVALUE", "unit-fixed" };
    static const char *const bad_i[] = { "compiler-fixed", "-include", "unit-fixed" };
    struct step16_exec_manifest bad = { bad_d, 3U, env_fixed, 1U, 0 };
    int rejected_d;
    request.launch_manifest = &bad;
    rejected_d = !accepted(&request);
    bad.argv = bad_i;
    checks += rejected_d && !accepted(&request);
  }
  request.launch_manifest = &manifest;
  /* request launch cannot replace policy-owned expected manifest */
  { static const char *const substituted_argv[] = { "compiler-fixed", "-c", "other-unit" };
    struct step16_exec_manifest substituted = { substituted_argv, 3U, env_fixed, 1U, 0 };
    request.launch_manifest = &substituted;
    checks += !accepted(&request); }
  request.launch_manifest = &manifest;
  /* compiler-identity-mismatch */
  request.compiler.compiler_identity_tag = &root_cap;
  checks += !accepted(&request);
  request.compiler.compiler_identity_tag = &compiler_cap;
  /* expired-compiler-token */
  request.compiler.token.expires_at = 50U;
  checks += !accepted(&request);
  request.compiler.token.expires_at = 100U;
  /* invalid-compiler-token */
  request.compiler.token.state = STEP16_FACT_RELEASED;
  checks += !accepted(&request);
  request.compiler.token.state = STEP16_FACT_VALID;
  request.compiler.token.authorization_ref = &stage_auth;
  checks += !accepted(&request);

  if (checks != 30) return 1;
  puts("production-authority fixture: 30 checks passed");
  return 0;
}
