#include "compiler_entry.h"

#include <stdio.h>

struct fixture_state {
  int validator_calls;
  int validator_result;
};

static int validate_metadata(void *context,
                             const struct step16_held_descriptor_metadata *metadata) {
  struct fixture_state *state = context;
  (void)metadata;
  state->validator_calls++;
  return state->validator_result;
}

static struct step16_retained_parent_capability valid_parent(void) {
  const struct step16_retained_parent_capability parent = {
    STEP16_PARENT_STATE_RETAINED,
    STEP16_PARENT_TAG_TRUSTED,
    STEP16_PARENT_LIFETIME_ACTIVE
  };
  return parent;
}

static struct step16_compiler_entry_probe regular_probe(struct fixture_state *state) {
  const struct step16_compiler_entry_probe probe = {
    STEP16_PROBE_REGULAR_METADATA,
    { STEP16_HELD_OBJECT_REGULAR, STEP16_HELD_NO_LINK,
      STEP16_HELD_OWNER_EXACT, STEP16_HELD_MODE_EXACT },
    validate_metadata,
    state
  };
  return probe;
}

static int expect(enum step16_compiler_entry_classification actual,
                  enum step16_compiler_entry_classification wanted) {
  return actual == wanted;
}

int main(void) {
  struct step16_retained_parent_capability parent = valid_parent();
  struct fixture_state state = { 0, 0 };
  struct step16_compiler_entry_probe probe = regular_probe(&state);
  int checks = 0;

  checks += expect(step16_classify_compiler_entry(&parent, &probe),
                   STEP16_COMPILER_ENTRY_METADATA_ELIGIBLE) && state.validator_calls == 1;

  state.validator_calls = 0;
  probe.result = STEP16_PROBE_SYMLINK;
  checks += expect(step16_classify_compiler_entry(&parent, &probe),
                   STEP16_COMPILER_ENTRY_STOP_SYMLINK) && state.validator_calls == 0;

  probe = regular_probe(&state);
  checks += expect(step16_classify_compiler_entry(NULL, &probe),
                   STEP16_COMPILER_ENTRY_REJECT_OPAQUE);
  checks += expect(step16_classify_compiler_entry(&parent, NULL),
                   STEP16_COMPILER_ENTRY_REJECT_OPAQUE);

  parent.lifetime = STEP16_PARENT_LIFETIME_ENDED;
  checks += expect(step16_classify_compiler_entry(&parent, &probe),
                   STEP16_COMPILER_ENTRY_REJECT_OPAQUE);
  parent = valid_parent();
  /* parent-state-expired */
  parent.state = STEP16_PARENT_STATE_EXPIRED;
  checks += expect(step16_classify_compiler_entry(&parent, &probe),
                   STEP16_COMPILER_ENTRY_REJECT_OPAQUE);
  parent = valid_parent();
  parent.state = STEP16_PARENT_STATE_RELEASED;
  checks += expect(step16_classify_compiler_entry(&parent, &probe),
                   STEP16_COMPILER_ENTRY_REJECT_OPAQUE);
  parent = valid_parent();
  parent.tag = STEP16_PARENT_TAG_OTHER;
  checks += expect(step16_classify_compiler_entry(&parent, &probe),
                   STEP16_COMPILER_ENTRY_REJECT_OPAQUE);
  parent = valid_parent();

  probe.result = STEP16_PROBE_UNKNOWN;
  checks += expect(step16_classify_compiler_entry(&parent, &probe),
                   STEP16_COMPILER_ENTRY_REJECT_OPAQUE);
  probe.result = STEP16_PROBE_FAILURE;
  checks += expect(step16_classify_compiler_entry(&parent, &probe),
                   STEP16_COMPILER_ENTRY_REJECT_OPAQUE);

  probe = regular_probe(&state);
  state.validator_calls = 0;
  probe.held_metadata.mode_fact = STEP16_HELD_MODE_WEAK;
  checks += expect(step16_classify_compiler_entry(&parent, &probe),
                   STEP16_COMPILER_ENTRY_REJECT_OPAQUE) && state.validator_calls == 0;
  probe = regular_probe(&state);
  state.validator_calls = 0;
  probe.held_metadata.owner_fact = STEP16_HELD_OWNER_OTHER;
  checks += expect(step16_classify_compiler_entry(&parent, &probe),
                   STEP16_COMPILER_ENTRY_REJECT_OPAQUE) && state.validator_calls == 0;
  probe = regular_probe(&state);
  state.validator_calls = 0;
  probe.held_metadata.object_kind = STEP16_HELD_OBJECT_OTHER;
  checks += expect(step16_classify_compiler_entry(&parent, &probe),
                   STEP16_COMPILER_ENTRY_REJECT_OPAQUE) && state.validator_calls == 0;
  probe = regular_probe(&state);
  state.validator_calls = 0;
  probe.held_metadata.link_fact = STEP16_HELD_LINK_PRESENT;
  checks += expect(step16_classify_compiler_entry(&parent, &probe),
                   STEP16_COMPILER_ENTRY_REJECT_OPAQUE) && state.validator_calls == 0;
  probe = regular_probe(&state);
  state.validator_calls = 0;
  state.validator_result = 1;
  checks += expect(step16_classify_compiler_entry(&parent, &probe),
                   STEP16_COMPILER_ENTRY_REJECT_OPAQUE) && state.validator_calls == 1;
  probe = regular_probe(&state);
  state.validator_calls = 0;
  /* missing-metadata-validator */
  probe.validate_metadata = NULL;
  checks += expect(step16_classify_compiler_entry(&parent, &probe),
                   STEP16_COMPILER_ENTRY_REJECT_OPAQUE) && state.validator_calls == 0;
  probe = regular_probe(&state);

  if (checks != 16) {
    puts("compiler-entry fixture: rejected");
    return 1;
  }
  puts("compiler-entry fixture: 16 checks passed");
  return 0;
}
