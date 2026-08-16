#ifndef STEP16_COMPILER_ENTRY_REVIEW_FIXTURE
#error "Step16 compiler-entry review is fixture-only; a future authorized production configuration is required."
#endif

#include "compiler_entry.h"

static int parent_is_trusted(const struct step16_retained_parent_capability *parent) {
  return parent &&
      parent->state == STEP16_PARENT_STATE_RETAINED &&
      parent->tag == STEP16_PARENT_TAG_TRUSTED &&
      parent->lifetime == STEP16_PARENT_LIFETIME_ACTIVE;
}

static int held_metadata_is_exact(const struct step16_held_descriptor_metadata *metadata) {
  return metadata &&
      metadata->object_kind == STEP16_HELD_OBJECT_REGULAR &&
      metadata->link_fact == STEP16_HELD_NO_LINK &&
      metadata->owner_fact == STEP16_HELD_OWNER_EXACT &&
      metadata->mode_fact == STEP16_HELD_MODE_EXACT;
}

enum step16_compiler_entry_classification step16_classify_compiler_entry(
    const struct step16_retained_parent_capability *parent,
    const struct step16_compiler_entry_probe *probe) {
  if (!parent_is_trusted(parent) || !probe) return STEP16_COMPILER_ENTRY_REJECT_OPAQUE;

  switch (probe->result) {
    case STEP16_PROBE_SYMLINK:
      return STEP16_COMPILER_ENTRY_STOP_SYMLINK;
    case STEP16_PROBE_REGULAR_METADATA:
      if (!held_metadata_is_exact(&probe->held_metadata) || !probe->validate_metadata ||
          probe->validate_metadata(probe->validator_context, &probe->held_metadata) != 0) {
        return STEP16_COMPILER_ENTRY_REJECT_OPAQUE;
      }
      return STEP16_COMPILER_ENTRY_METADATA_ELIGIBLE;
    case STEP16_PROBE_FAILURE:
    case STEP16_PROBE_UNKNOWN:
    default:
      return STEP16_COMPILER_ENTRY_REJECT_OPAQUE;
  }
}
