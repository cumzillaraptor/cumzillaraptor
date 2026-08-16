#define _POSIX_C_SOURCE 200809L
#include "descriptor_helper.h"

#include <errno.h>
#include <fcntl.h>
#include <limits.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

#define STEP16_FIXTURE_SOURCE_CAP 8192U

static const unsigned char header_bytes[] =
    "#ifndef HELIUS_HANDOFF_GENERATED_OWNER_CONFIG_REVIEW_H\n"
    "#define HELIUS_HANDOFF_GENERATED_OWNER_CONFIG_REVIEW_H\n\n"
    "#define HELIUS_HANDOFF_GENERATED_OWNER_UID 1001\n"
    "#define HELIUS_HANDOFF_GENERATED_OWNER_GID 1001\n\n"
    "#endif /* HELIUS_HANDOFF_GENERATED_OWNER_CONFIG_REVIEW_H */\n";

struct state {
  int reader_mode, writer_mode, authorization, issuer_bad_tag, hook;
  int issue_calls, writer_calls, cleanup_mode;
  const char *issued_id;
  unsigned char *bytes;
  unsigned char *mutated;
  size_t length;
};

static int fail(void) {
  puts("descriptor-helper fixture: rejected");
  return 1;
}

static int parse_length(const char *value, size_t *length) {
  char *end = NULL;
  unsigned long parsed;
  if (!value || !*value || value[0] == '-') return 0;
  errno = 0;
  parsed = strtoul(value, &end, 10);
  if (errno || !end || *end || parsed == 0 || parsed > STEP16_FIXTURE_SOURCE_CAP ||
      parsed > SIZE_MAX) return 0;
  *length = (size_t)parsed;
  return 1;
}

static int read_stream_exact(size_t length, unsigned char **result) {
  unsigned char *bytes;
  unsigned char extra;
  size_t done = 0;
  ssize_t got;
  bytes = malloc(length);
  if (!bytes) return 0;
  while (done < length) {
    got = read(STDIN_FILENO, bytes + done, length - done);
    if (got <= 0) {
      free(bytes);
      return 0;
    }
    done += (size_t)got;
  }
  do {
    got = read(STDIN_FILENO, &extra, 1U);
  } while (got < 0 && errno == EINTR);
  if (got != 0) {
    free(bytes);
    return 0;
  }
  *result = bytes;
  return 1;
}

static int reader(void *v, const char *commit, struct step16_authenticated_blob *out) {
  struct state *s = v;
  if (strcmp(commit, STEP16_EXPECTED_COMMIT) != 0) return -1;
  out->resolved_commit = s->reader_mode == 3 ? "0000000000000000000000000000000000000000" : STEP16_EXPECTED_COMMIT;
  out->object_id = s->reader_mode == 1 ? "0000000000000000000000000000000000000000" : STEP16_NATIVE_WRAPPER_BLOB;
  out->bytes = s->bytes;
  out->length = s->length;
  if (s->reader_mode == 2) {
    memcpy(s->mutated, s->bytes, s->length);
    s->mutated[0] ^= 1U;
    out->bytes = s->mutated;
  }
  return 0;
}

static int issuer(void *v, struct step16_opaque_id *out) {
  struct state *s = v;
  size_t n;
  if (!s->authorization) return -1;
  s->issue_calls++;
  n = strlen(s->issued_id);
  if (n > sizeof out->bytes) return -1;
  memcpy(out->bytes, s->issued_id, n);
  out->length = n;
  out->issuer_tag = s->issuer_bad_tag ? NULL : s;
  return 0;
}

static ssize_t writer(int fd, const void *p, size_t n, void *v) {
  struct state *s = v;
  s->writer_calls++;
  if (s->writer_mode == 2) return (ssize_t)(n + 1U);
  if (s->writer_mode == 1 && n > 1U) return write(fd, p, n - 1U);
  return write(fd, p, n);
}

static int hook(int fd, void *v) {
  struct state *s = v;
  if (s->hook == 1) return symlinkat("target", fd, "native_wrapper.c");
  if (s->hook == 2) return symlinkat("target", fd, "generated_owner_config.h");
  return 0;
}

static int cleanup_close(int fd, void *v) {
  struct state *s = v;
  int result = close(fd);
  return s->cleanup_mode == 1 ? -1 : result;
}

static int cleanup_unlink(int fd, const char *name, int flags, void *v) {
  struct state *s = v;
  if (s->cleanup_mode == 2 && flags == AT_REMOVEDIR) return -1;
  return unlinkat(fd, name, flags);
}

static int stage_absent(int parent, const char *id) {
  char name[80];
  struct stat st;
  snprintf(name, sizeof name, "build-stage-%s", id);
  return fstatat(parent, name, &st, AT_SYMLINK_NOFOLLOW) != 0;
}

static enum step16_descriptor_status run(int parent, struct state *s, const char *id) {
  struct step16_descriptor_ops ops = { cleanup_close, cleanup_unlink, s };
  struct step16_descriptor_request request = { 0 };
  s->issued_id = id;
  request.trusted_parent_fd = parent;
  request.read_native_wrapper = reader;
  request.reader_context = s;
  request.issue_opaque_id = issuer;
  request.opaque_issuer_context = s;
  request.review_header_bytes = header_bytes;
  request.review_header_length = sizeof header_bytes - 1U;
  request.write_bytes = writer;
  request.write_context = s;
  request.after_stage_created = s->hook ? hook : NULL;
  request.after_stage_context = s;
  request.ops = s->cleanup_mode ? &ops : NULL;
  return step16_stage_descriptor_pinned_sources(&request);
}

static int expect(int yes, enum step16_descriptor_status got) {
  return yes ? got == STEP16_DESCRIPTOR_OK : got != STEP16_DESCRIPTOR_OK;
}

int main(int argc, char **argv) {
  char temp[] = "/tmp/step16-fixture-XXXXXX";
  int parent = -1;
  int checks = 0;
  size_t length;
  struct state s = { 0 };
  if (argc != 2 || !parse_length(argv[1], &length) || !read_stream_exact(length, &s.bytes)) return fail();
  s.length = length;
  s.mutated = malloc(length);
  if (!s.mutated || !mkdtemp(temp)) goto rejected;
  parent = openat(AT_FDCWD, temp, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
  if (parent < 0) goto rejected;

  s.authorization = 1;
  checks += expect(1, run(parent, &s, "opaqueA"));
  checks += s.issue_calls == 1 && stage_absent(parent, "opaqueA");
  s.reader_mode = 1; s.writer_calls = 0;
  checks += expect(0, run(parent, &s, "opaqueB")) && s.writer_calls == 0 && stage_absent(parent, "opaqueB");
  s.reader_mode = 2;
  checks += expect(0, run(parent, &s, "opaqueC"));
  s.reader_mode = 3; s.writer_calls = 0;
  checks += expect(0, run(parent, &s, "opaqueCommit")) && s.writer_calls == 0 && stage_absent(parent, "opaqueCommit");
  s.reader_mode = 0; s.writer_mode = 1;
  checks += expect(1, run(parent, &s, "opaqueD"));
  s.writer_mode = 2;
  checks += expect(0, run(parent, &s, "opaqueE"));
  s.writer_mode = 0; s.authorization = 0;
  checks += expect(0, run(parent, &s, "issuerDenied"));
  s.authorization = 1; s.issuer_bad_tag = 1;
  checks += expect(0, run(parent, &s, "issuerTag"));
  s.issuer_bad_tag = 0;
  checks += expect(0, run(parent, &s, ""));
  mkdirat(parent, "build-stage-taken", 0700);
  checks += expect(0, run(parent, &s, "taken"));
  unlinkat(parent, "build-stage-taken", AT_REMOVEDIR);
  symlinkat("target", parent, "build-stage-link");
  checks += expect(0, run(parent, &s, "link"));
  unlinkat(parent, "build-stage-link", 0);
  s.hook = 1;
  checks += expect(0, run(parent, &s, "sourceLink"));
  s.hook = 2;
  checks += expect(0, run(parent, &s, "headerLink"));
  s.hook = 0; s.cleanup_mode = 1;
  checks += run(parent, &s, "closeFail") == STEP16_DESCRIPTOR_CLEANUP_FAILED;
  s.cleanup_mode = 0;
  unlinkat(parent, "build-stage-closeFail", AT_REMOVEDIR);
  s.cleanup_mode = 2;
  checks += run(parent, &s, "unlinkFail") == STEP16_DESCRIPTOR_CLEANUP_FAILED;
  s.cleanup_mode = 0;
  unlinkat(parent, "build-stage-unlinkFail", AT_REMOVEDIR);
  close(parent);
  parent = -1;
  rmdir(temp);
  free(s.mutated);
  free(s.bytes);
  if (checks != 16) return fail();
  puts("descriptor-helper fixture: 16 checks passed");
  return 0;

rejected:
  if (parent >= 0) close(parent);
  rmdir(temp);
  free(s.mutated);
  free(s.bytes);
  return fail();
}
