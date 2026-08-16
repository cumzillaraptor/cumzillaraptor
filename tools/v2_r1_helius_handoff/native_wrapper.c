/*
 * Review-only descriptor-walk primitive. It has no consumer or transport.
 * Production identity facts are accepted only from the fixed, generated header
 * beside this source. The repository copy deliberately stops compilation until
 * a later separately authorized configuration-generation gate replaces it.
 * Test fixtures are implemented in tests/fixtures, never in this source.
 */
#define _POSIX_C_SOURCE 200809L
#include <errno.h>
#include <fcntl.h>
#include <stdio.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

/* This exact relative include is the sole production identity boundary. */
#include "generated_owner_config.h"

#define EXPECTED_UID ((uid_t)HELIUS_HANDOFF_GENERATED_OWNER_UID)
#define EXPECTED_GID ((gid_t)HELIUS_HANDOFF_GENERATED_OWNER_GID)
#define MAX_SECRET_BYTES 512U

static int refuse(void) {
  (void)fputs("native-wrapper-refused\n", stderr);
  return 1;
}

static const char fixed_absolute_path[] = "/home/piadmin/.config/cumzillaraptors/helius-devnet-rpc.url";
static const char *const components[] = {
  "home", "piadmin", ".config", "cumzillaraptors"
};
static const char basename[] = "helius-devnet-rpc.url";
static const char prefix[] = "https://devnet.helius-rpc.com/?api-key=";

static int exact_mode(const struct stat *st, mode_t mode) {
  return (st->st_mode & 07777) == mode;
}

static int root_is_trusted(const struct stat *st) {
  return S_ISDIR(st->st_mode) && st->st_uid == (uid_t)0 &&
         st->st_gid == (gid_t)0 && exact_mode(st, 0755);
}

static int directory_is_trusted(const struct stat *st) {
  return S_ISDIR(st->st_mode);
}

static int owner_parent_is_trusted(const struct stat *st) {
  return directory_is_trusted(st) && st->st_uid == EXPECTED_UID &&
         st->st_gid == EXPECTED_GID && exact_mode(st, 0700);
}

static int secret_is_trusted(const struct stat *st) {
  return S_ISREG(st->st_mode) && st->st_uid == EXPECTED_UID &&
         st->st_gid == EXPECTED_GID && exact_mode(st, 0600);
}

static int token_byte(unsigned char byte) {
  return (byte >= 'A' && byte <= 'Z') || (byte >= 'a' && byte <= 'z') ||
         (byte >= '0' && byte <= '9') || byte == '_' || byte == '-';
}

static int canonical_secret(const unsigned char *value, size_t length) {
  const size_t prefix_length = sizeof(prefix) - 1U;
  size_t index;
  /* ASCII token grammar: [A-Za-z0-9_-]+, with no newline or extra byte. */
  if (length <= prefix_length || memcmp(value, prefix, prefix_length) != 0) return 0;
  for (index = prefix_length; index < length; ++index) {
    if (!token_byte(value[index])) return 0;
  }
  return 1;
}

int main(int argc, char **argv) {
  int fds[6];
  size_t opened = 0;
  int status = 1;
  int current_fd;
  int final_fd = -1;
  struct stat st;
  unsigned char buffer[MAX_SECRET_BYTES];
  ssize_t read_count;
  unsigned char extra;
  size_t index;

  (void)argv;
  (void)fixed_absolute_path; /* Pins the sole production pathname in reviewed source. */
  if (argc != 1) return refuse();

  current_fd = open("/", O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
  if (current_fd < 0) goto done;
  fds[opened++] = current_fd;
  if (fstat(current_fd, &st) != 0 || !root_is_trusted(&st)) goto done;

  for (index = 0; index < sizeof(components) / sizeof(components[0]); ++index) {
    int next_fd = openat(current_fd, components[index], O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
    if (next_fd < 0) goto done;
    fds[opened++] = next_fd;
    current_fd = next_fd;
    if (fstat(current_fd, &st) != 0 || !directory_is_trusted(&st)) goto done;
    if (index + 1U == sizeof(components) / sizeof(components[0]) && !owner_parent_is_trusted(&st)) goto done;
  }

  final_fd = openat(current_fd, basename, O_RDONLY | O_NOFOLLOW | O_CLOEXEC);
  if (final_fd < 0) goto done;
  fds[opened++] = final_fd;
  if (fstat(final_fd, &st) != 0 || !secret_is_trusted(&st)) goto done;

  read_count = read(final_fd, buffer, sizeof(buffer));
  if (read_count < 0) goto done;
  if (read(final_fd, &extra, 1U) != 0) goto done;
  if (!canonical_secret(buffer, (size_t)read_count)) goto done;
  status = 0;

done:
  while (opened > 0) {
    --opened;
    if (close(fds[opened]) != 0) status = 1;
  }
  return status == 0 ? 0 : refuse();
}
