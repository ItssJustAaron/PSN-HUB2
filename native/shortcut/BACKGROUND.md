# PSN-HUB JAILBREAK tile background

The reviewed weed-themed artwork is
[`Manager/assets/jailbreak-background.png`](../../Manager/assets/jailbreak-background.png).
It uses the existing mascot with green drifting leaves and a dark purple
background, leaving room for the PS5's title and controls. It is a still image;
the website keeps its animated leaves. The existing icon is not replaced.

The dedicated apply payload requires the Store title `NPXS40047` to already point
to `https://itssjustaaron.github.io/PSN-HUB2/`. It changes only recognized background
references: `pic0Info` / `pic1Info` in `tbl_contentinfo`, the corresponding existing
top-level `AppInfoJson` keys, and `pic0Info` in Store concept/icon rows. It leaves
name, deeplink, icon, category, visibility and unrelated titles untouched.
Opaque path IDs and timestamps in `appinfo.db` are not guessed or modified.

## Use from Manager

In **Payloads → Jailbreak tile background**, preview the artwork and choose
**Apply jailbreak background**. Review and send the payload. Manager then checks
the helper's temporary result endpoint on port **8089**, including the operation
and exact artwork hash. A sent payload is not reported as a successful change
until its result is confirmed. Refresh the PS5 home screen manually afterward;
the updater never restarts the shell or reboots the console.

**Restore previous background** restores the references saved by this artwork
updater. It does not undo the separate Store shortcut replacement. It can restore
the artwork after the shortcut itself has been restored, provided the recorded
background references still match. Drift is refused rather than overwritten.

## Backups and scope

- Private recovery: `/data/psn-hub-store-background/`.
- Recovery ledger: `background-<first 12 artwork SHA-256 characters>.db`.
- Consistent SQLite backup copies of both `app.db` and `appinfo.db` are stored in
  a new `backup-<timestamp>` directory before changing references.
- DELETE journaling and FULL synchronization are required. Changes and recovery
  state commit in one attached-database transaction.
- The PNG is stored under a new, hash-named path in `/user/appmeta/NPXS40047/`.
  Its bytes are verified before committing database references. Original artwork
  files are retained. A failed update can leave an unreferenced new PNG.
- Restore preserves unrelated shell JSON updates, such as access timestamps.
- The same apply is idempotent; it verifies current references before reporting
  success and does not replace the original recovery record.
- The read-only result endpoint exists for one request or at most 60 seconds.
  The last result is also saved as `result.json` in the private recovery folder.

The public repo contains source, artwork and compiled payloads. It does not
contain console database copies, recovery ledgers or private backups.

## Build and verification

`python tools/build-shortcut-background.py` embeds the PNG unchanged and records
its hash, filename and URI. The Store workflow builds apply and restore ELFs and
runs nine synthetic-database tests with sanitizers, in addition to the existing
inspector and shortcut tests. Tests cover exact restoration, metadata-preserving
restore, backups, idempotence, rollback, drift, ledger scope, wrong target,
corrupt assets and unsupported journal modes.

Artwork was generated with the built-in image tool using the existing mascot as
a reference. The exact [prompt](../../Manager/assets/jailbreak-background.prompt.txt)
is included alongside the PNG. No original mascot asset was edited.
