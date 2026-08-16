#ifndef STEP16_COMPILER_ENTRY_H
#define STEP16_COMPILER_ENTRY_H

#define STEP16_APPROVED_COMPILER_ENTRY_NAME "cc"

enum step16_parent_state {
  STEP16_PARENT_STATE_RETAINED = 1,
  STEP16_PARENT_STATE_EXPIRED = 2,
  STEP16_PARENT_STATE_RELEASED = 3
};

enum step16_parent_tag {
  STEP16_PARENT_TAG_TRUSTED = 1,
  STEP16_PARENT_TAG_OTHER = 2
};

enum step16_parent_lifetime {
  STEP16_PARENT_LIFETIME_ACTIVE = 1,
  STEP16_PARENT_LIFETIME_ENDED = 2
};

/* An injected, retained-parent capability; it accepts no caller location data. */
struct step16_retained_parent_capability {
  enum step16_parent_state state;
  enum step16_parent_tag tag;
  enum step16_parent_lifetime lifetime;
};

enum step16_probe_result {
  STEP16_PROBE_REGULAR_METADATA = 1,
  STEP16_PROBE_SYMLINK = 2,
  STEP16_PROBE_FAILURE = 3,
  STEP16_PROBE_UNKNOWN = 4
};

enum step16_held_object_kind {
  STEP16_HELD_OBJECT_REGULAR = 1,
  STEP16_HELD_OBJECT_OTHER = 2
};

enum step16_held_link_fact {
  STEP16_HELD_NO_LINK = 1,
  STEP16_HELD_LINK_PRESENT = 2
};

enum step16_held_owner_fact {
  STEP16_HELD_OWNER_EXACT = 1,
  STEP16_HELD_OWNER_OTHER = 2
};

enum step16_held_mode_fact {
  STEP16_HELD_MODE_EXACT = 1,
  STEP16_HELD_MODE_WEAK = 2
};

/* Synthetic held-descriptor facts only; no names or derived values exist here. */
struct step16_held_descriptor_metadata {
  enum step16_held_object_kind object_kind;
  enum step16_held_link_fact link_fact;
  enum step16_held_owner_fact owner_fact;
  enum step16_held_mode_fact mode_fact;
};

typedef int (*step16_metadata_validator_fn)(
    void *context, const struct step16_held_descriptor_metadata *metadata);

/* This is the one injected compiler-entry probe result. */
struct step16_compiler_entry_probe {
  enum step16_probe_result result;
  struct step16_held_descriptor_metadata held_metadata;
  step16_metadata_validator_fn validate_metadata;
  void *validator_context;
};

enum step16_compiler_entry_classification {
  STEP16_COMPILER_ENTRY_REJECT_OPAQUE = 1,
  STEP16_COMPILER_ENTRY_STOP_SYMLINK = 2,
  STEP16_COMPILER_ENTRY_METADATA_ELIGIBLE = 3
};

/* Review model only: this makes no selection and grants no action authority. */
enum step16_compiler_entry_classification step16_classify_compiler_entry(
    const struct step16_retained_parent_capability *parent,
    const struct step16_compiler_entry_probe *probe);

#endif
