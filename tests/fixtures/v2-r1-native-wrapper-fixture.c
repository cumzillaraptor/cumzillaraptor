/*
 * Fixture-only descriptor-walk executable. This translation unit is not linked
 * by, included by, or deployable as the production native wrapper.
 */
#define _POSIX_C_SOURCE 200809L
#include <fcntl.h>
#include <stdio.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

#if !defined(TEST_FIXTURE_ROOT) || !defined(TEST_FIXTURE_ROOT_UID) || \
    !defined(TEST_FIXTURE_ROOT_GID) || !defined(TEST_FIXTURE_EXPECTED_UID) || \
    !defined(TEST_FIXTURE_EXPECTED_GID)
#error "fixture root and identity facts are required"
#endif

#define ROOT_UID ((uid_t)TEST_FIXTURE_ROOT_UID)
#define ROOT_GID ((gid_t)TEST_FIXTURE_ROOT_GID)
#define EXPECTED_UID ((uid_t)TEST_FIXTURE_EXPECTED_UID)
#define EXPECTED_GID ((gid_t)TEST_FIXTURE_EXPECTED_GID)
#define MAX_SECRET_BYTES 512U

static const char *const components[] = {
  "home", "piadmin", ".config", "cumzillaraptors"
};
static const char basename[] = "helius-devnet-rpc.url";
static const char prefix[] = "https://devnet.helius-rpc.com/?api-key=";

static int refuse(void) {
  (void)fputs("native-wrapper-refused\n", stderr);
  return 1;
}

static int exact_mode(const struct stat *st, mode_t mode) {
  return (st->st_mode & 07777) == mode;
}

static int root_is_trusted(const struct stat *st) {
  return S_ISDIR(st->st_mode) && st->st_uid == ROOT_UID &&
         st->st_gid == ROOT_GID && exact_mode(st, 0700);
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
  if (length <= prefix_length || memcmp(value, prefix, prefix_length) != 0) return 0;
  for (index = prefix_length; index < length; ++index) {
    if (!token_byte(value[index])) return 0;
  }
  return 1;
}

#if defined(TEST_FIXTURE_SWAP_AFTER_OPEN)
static int replace_final_name_for_fixture(int parent_fd) {
  int replacement_fd;
  static const char replacement[] = "https://attacker.invalid/?api-key=not-held";
  if (renameat(parent_fd, basename, parent_fd, ".held-before-swap") != 0) return -1;
  replacement_fd = openat(parent_fd, "replacement.url", O_WRONLY | O_CREAT | O_EXCL | O_CLOEXEC, 0600);
  if (replacement_fd < 0) return -1;
  if (write(replacement_fd, replacement, sizeof(replacement) - 1U) != (ssize_t)(sizeof(replacement) - 1U)) {
    (void)close(replacement_fd);
    return -1;
  }
  if (close(replacement_fd) != 0) return -1;
  return symlinkat("replacement.url", parent_fd, basename);
}
#endif

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
  if (argc != 1) return refuse();

  current_fd = open(TEST_FIXTURE_ROOT, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC);
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

#if defined(TEST_FIXTURE_SWAP_AFTER_OPEN)
  if (replace_final_name_for_fixture(current_fd) != 0) goto done;
#endif

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
