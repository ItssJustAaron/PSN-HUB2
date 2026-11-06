# PS Store shortcut experiment

## Stage 1: read-only inspection

`PSN-HUB-Store-Inspector.elf` starts a separate HTTP service on port **8089**.
It opens app.db and appinfo.db using SQLite's read-only and no-follow flags,
reports their schemas and the Store-related records, and exposes no mutation
routes. It does not create missing databases, replace icons, install a shortcut,
restart the shell, reboot the console or change the stable Manager.

Open `http://<PS5-IP>:8089/` or `/report` after loading the ELF through elfldr.
The JSON report is for local review. Do not commit a real console report to the
public repository. Stop the inspector by rebooting the console when finished.

The intended later experiment is to rename the existing Store tile to PSN-HUB,
use PSN-HUB artwork, and point its browser shortcut at:
https://itssjustaaron.github.io/PSN-HUB2/

That change is not implemented in this first payload. The actual database schema,
Store title ID, per-user records and current shortcut fields must be reviewed
before constructing a precise, backed-up, reversible mutation. Store-specific
shell behavior may ignore changed shortcut fields; reboot persistence and opening
the jailbreak host are not established by this inspection.

The new source is independent GPL-3.0-or-later code. SQLite is public domain;
the cross-build uses its official pinned 3.46.1 amalgamation download with WAL
reading support retained. No TabShifter source code is copied.
