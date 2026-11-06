/* SPDX-License-Identifier: GPL-3.0-or-later */
#ifndef HUB_H
#define HUB_H
#include <stddef.h>
#include <stdint.h>
#include <sys/types.h>
#define HUB_VERSION "0.3.3-experimental"
#define HUB_LIMIT (64u*1024u*1024u)
#define HUB_JSON_LIMIT (8u*1024u*1024u)
typedef struct { char *data; size_t len, cap; int failed; } Buffer;
void buf_add(Buffer *, const char *, ...);
void buf_free(Buffer *);
int hub_name(const char *);
int hub_cheat_path(const char *);
int hub_open_path(const char *, int);
int hub_child(int, const char *, int);
int hub_write(int, const void *, size_t);
int hub_atomic(int, const char *, int, size_t, const unsigned char *, size_t);
int hub_hash(int, char [65]);
int hub_inventory(int, Buffer *, const char *, int *);
int hub_copy_tree(int, int, int, size_t *);
int hub_remove_tree(int, const char *);
int hub_recover(int, const char *);
int hub_clean_uploads(int);
int hub_restore(int, const char *, int);
void hub_saves_init(int);
int hub_save_title(const char *, const char *, const char *);
int hub_save_list(Buffer *);
int hub_save_files(int, Buffer *);
int hub_save_snapshot(const char *);
int hub_save_backup(int, const char *, char [80]);
int hub_save_backup_into(int, int, const char *, char [80]);
void hub_usb_init(int);
int hub_usb_status(Buffer *);
int hub_usb_export(const char *, const char *, const char *, const char *, Buffer *);
int hub_usb_all(const char *, Buffer *);
int hub_usb_config(int, const char *, unsigned);
void hub_usb_tick(void);
int hub_save_backups(Buffer *);
long hub_sys_result(long, int);
#ifndef HUB_HOST_TEST
/* SDK v0.45's fallback *at stubs expose raw FreeBSD carry/errno results. */
#include <fcntl.h>
#include <sys/stat.h>
#include <unistd.h>
int hub_ps5_openat(int, const char *, int, ...);
int hub_ps5_mkdirat(int, const char *, mode_t);
int hub_ps5_fstatat(int, const char *, struct stat *, int);
int hub_ps5_renameat(int, const char *, int, const char *);
int hub_ps5_unlinkat(int, const char *, int);
#define openat hub_ps5_openat
#define mkdirat hub_ps5_mkdirat
#define fstatat hub_ps5_fstatat
#define renameat hub_ps5_renameat
#define unlinkat hub_ps5_unlinkat
#endif
#endif
