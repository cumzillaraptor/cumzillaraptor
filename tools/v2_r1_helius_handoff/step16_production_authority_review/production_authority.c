#ifndef STEP16_PRODUCTION_AUTHORITY_REVIEW_FIXTURE
#error "review-only fixture model: define STEP16_PRODUCTION_AUTHORITY_REVIEW_FIXTURE"
#endif

#include "production_authority.h"

#include <string.h>

static int same_text(const char *left, const char *right) {
  return left != NULL && right != NULL && strcmp(left, right) == 0;
}

static int valid_token(const struct step16_evidence_token *token, uint64_t now) {
  return token != NULL && token->state == STEP16_FACT_VALID &&
         token->issued_at <= now && now < token->expires_at &&
         token->capability_tag != NULL && token->authorization_ref != NULL &&
         token->authority_ref != NULL;
}

static int distinct_authorizations(const struct step16_authority_request *request) {
  const void *refs[4];
  refs[0] = request->canonical_root.authorization_ref;
  refs[1] = request->git_results[0].token.authorization_ref;
  refs[2] = request->stage_evidence.authorization_ref;
  refs[3] = request->compiler.token.authorization_ref;
  return refs[0] != refs[1] && refs[0] != refs[2] && refs[0] != refs[3] &&
         refs[1] != refs[2] && refs[1] != refs[3] && refs[2] != refs[3];
}

static int entry_matches(const struct step16_inventory_entry *expected,
                         const struct step16_inventory_entry *actual) {
  return same_text(expected->commit, actual->commit) &&
         same_text(expected->tree, actual->tree) &&
         same_text(expected->path, actual->path) &&
         same_text(expected->blob, actual->blob) &&
         same_text(expected->sha256, actual->sha256);
}

static int inventory_matches(const struct step16_authority_policy *policy,
                             const struct step16_git_reader_result *results,
                             size_t result_count, uint64_t now) {
  size_t expected_index;
  size_t result_index;
  if (results == NULL || result_count != STEP16_INVENTORY_COUNT) return 0;
  for (expected_index = 0; expected_index < STEP16_INVENTORY_COUNT; ++expected_index) {
    if (policy->inventory[expected_index].path == NULL || results[expected_index].identity.path == NULL) return 0;
    for (result_index = expected_index + 1U; result_index < STEP16_INVENTORY_COUNT; ++result_index) {
      if (same_text(policy->inventory[expected_index].path, policy->inventory[result_index].path) ||
          same_text(results[expected_index].identity.path, results[result_index].identity.path)) return 0;
    }
  }
  for (expected_index = 0; expected_index < STEP16_INVENTORY_COUNT; ++expected_index) {
    size_t matches = 0;
    for (result_index = 0; result_index < result_count; ++result_index) {
      const struct step16_git_reader_result *result = &results[result_index];
      if (!entry_matches(&policy->inventory[expected_index], &result->identity)) continue;
      if (result->state != STEP16_FACT_VALID || !valid_token(&result->token, now) ||
          result->bounded_bytes_tag == NULL || result->byte_count > result->byte_cap) return 0;
      ++matches;
    }
    if (matches != 1U) return 0;
  }
  for (result_index = 0; result_index < result_count; ++result_index) {
    size_t matches = 0;
    for (expected_index = 0; expected_index < STEP16_INVENTORY_COUNT; ++expected_index) {
      if (entry_matches(&policy->inventory[expected_index], &results[result_index].identity)) ++matches;
    }
    if (matches != 1U) return 0;
  }
  return 1;
}

static int prohibited_compiler_text(const char *value) {
  return value != NULL && (strncmp(value, "-D", 2U) == 0 ||
                           strcmp(value, "-include") == 0 ||
                           strncmp(value, "-include=", 9U) == 0);
}

int step16_validate_exec_manifest(const struct step16_exec_manifest *expected,
                                  const struct step16_exec_manifest *actual) {
  size_t index;
  if (expected == NULL || actual == NULL || actual->inherited_environment ||
      expected->inherited_environment || expected->argv == NULL || actual->argv == NULL ||
      expected->envp == NULL || actual->envp == NULL || expected->argc != actual->argc ||
      expected->envc != actual->envc) return 0;
  for (index = 0; index < actual->argc; ++index) {
    if (prohibited_compiler_text(actual->argv[index]) ||
        !same_text(expected->argv[index], actual->argv[index])) return 0;
  }
  for (index = 0; index < actual->envc; ++index) {
    if (prohibited_compiler_text(actual->envp[index]) ||
        !same_text(expected->envp[index], actual->envp[index])) return 0;
  }
  return 1;
}

enum step16_authority_status step16_validate_authority_request(
    const struct step16_authority_request *request, uint64_t now) {
  const struct step16_authority_policy *policy;
  uint32_t required_flags = STEP16_OPENAT2_RESOLVE_BENEATH |
                            STEP16_OPENAT2_RESOLVE_NO_SYMLINKS;
  if (request == NULL || (policy = request->policy) == NULL ||
      request->caller_root_input != NULL || request->caller_worktree_input != NULL) {
    return STEP16_AUTHORITY_REJECTED;
  }
  if (!valid_token(&request->canonical_root, now) ||
      request->canonical_root.capability_tag != policy->root_capability_tag ||
      !same_text(request->canonical_root.commit, policy->root_commit) ||
      !same_text(request->canonical_root.tree, policy->root_tree)) {
    return STEP16_AUTHORITY_REJECTED;
  }
  if (!inventory_matches(policy, request->git_results, request->git_result_count, now)) {
    return STEP16_AUTHORITY_REJECTED;
  }
  if (request->opaque.state != STEP16_OPAQUE_PRIVATE_VERIFIED ||
      request->opaque.private_binding_tag != policy->opaque_binding_tag ||
      request->opaque.issuer_tag != policy->opaque_issuer_tag) {
    return STEP16_AUTHORITY_REJECTED;
  }
  if (!valid_token(&request->stage_evidence, now) ||
      request->containment.state != STEP16_FACT_VALID ||
      request->containment.capability_tag != policy->linux_capability_tag ||
      !request->containment.linux_supported ||
      (request->containment.resolve_flags & required_flags) != required_flags) {
    return STEP16_AUTHORITY_REJECTED;
  }
  if (!valid_token(&request->compiler.token, now) ||
      request->compiler.compiler_identity_tag != policy->compiler_identity_tag ||
      !step16_validate_exec_manifest(policy->compiler_manifest,
                                     request->launch_manifest) ||
      !distinct_authorizations(request)) {
    return STEP16_AUTHORITY_REJECTED;
  }
  return STEP16_AUTHORITY_ACCEPTED;
}
