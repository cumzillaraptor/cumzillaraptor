#ifndef STEP16_DESCRIPTOR_HELPER_H
#define STEP16_DESCRIPTOR_HELPER_H

#include <stddef.h>
#include <sys/types.h>

#define STEP16_EXPECTED_COMMIT "620dc7dfbce6c831b4755dce6e5776cb613001b8"
#define STEP16_NATIVE_WRAPPER_BLOB "0e59f37f98e3f6632064b3ade9a133ea24de90da"
#define STEP16_NATIVE_WRAPPER_SHA256 "6e45dd91c53ba7ac6aa76e2513a55c901d0bff108f7ae579475dceb1c2ee8d76"
#define STEP16_REVIEW_HEADER_SHA256 "8f7e430182822e5014f4be39fdb3ac4734e3546df54d5c3e448c0eba5f510814"
#define STEP16_OPAQUE_ID_CAP 64

enum step16_descriptor_status {
  STEP16_DESCRIPTOR_OK = 0,
  STEP16_DESCRIPTOR_REJECTED = 1,
  STEP16_DESCRIPTOR_IO = 2,
  STEP16_DESCRIPTOR_MISMATCH = 3,
  STEP16_DESCRIPTOR_CLEANUP_FAILED = 4
};

struct step16_authenticated_blob {
  const char *resolved_commit;
  const char *object_id;
  const unsigned char *bytes;
  size_t length;
};

/* Only the issuer callback can populate this capability token for a request. */
struct step16_opaque_id {
  unsigned char bytes[STEP16_OPAQUE_ID_CAP];
  size_t length;
  const void *issuer_tag;
};

typedef int (*step16_read_blob_fn)(void *context, const char *expected_commit,
                                   struct step16_authenticated_blob *result);
typedef int (*step16_issue_opaque_id_fn)(void *context,
                                         struct step16_opaque_id *result);
typedef ssize_t (*step16_write_fn)(int fd, const void *buffer, size_t length,
                                   void *context);
typedef int (*step16_after_stage_fn)(int stage_fd, void *context);
typedef int (*step16_close_fn)(int fd, void *context);
typedef int (*step16_unlinkat_fn)(int dirfd, const char *name, int flags,
                                  void *context);

/* Test seam for cleanup observation/failure injection; NULL members use libc. */
struct step16_descriptor_ops {
  step16_close_fn close_fd;
  step16_unlinkat_fn unlink_entry;
  void *context;
};

struct step16_descriptor_request {
  int trusted_parent_fd;
  step16_read_blob_fn read_native_wrapper;
  void *reader_context;
  step16_issue_opaque_id_fn issue_opaque_id;
  /* Non-NULL expected identity of the trusted opaque-ID issuer boundary. */
  void *opaque_issuer_context;
  const unsigned char *review_header_bytes;
  size_t review_header_length;
  step16_write_fn write_bytes;
  void *write_context;
  /* Test-only seam; production callers must leave this NULL. */
  step16_after_stage_fn after_stage_created;
  void *after_stage_context;
  const struct step16_descriptor_ops *ops;
};

/* Review-only: stages and verifies two files, then removes the temporary stage. */
enum step16_descriptor_status step16_stage_descriptor_pinned_sources(
    const struct step16_descriptor_request *request);

#endif
