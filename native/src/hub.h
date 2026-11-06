/* SPDX-License-Identifier: GPL-3.0-or-later */
#ifndef HUB_H
#define HUB_H
#include <stddef.h>
#include <stdint.h>
#include <sys/types.h>
#define HUB_VERSION "0.1.0-experimental"
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
#endif
