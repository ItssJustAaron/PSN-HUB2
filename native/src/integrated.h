/* SPDX-License-Identifier: GPL-3.0-or-later */
#ifndef HUB_INTEGRATED_H
#define HUB_INTEGRATED_H
#include "hub.h"
int hub_background_run(const char *,int,Buffer *);
int hub_icons_run(const char *,Buffer *);
int hub_store_run(const char *,int,int,Buffer *);
void hub_shortcuts_init(void);
void hub_shortcuts_status(Buffer *);
#endif
