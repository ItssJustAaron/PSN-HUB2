# Save Manager — experimental

Native version `0.3.1-experimental` runs on port **8087**. The jailbreak continues
to start the stable Manager on **8085**. Its original native engine has no save
API. Raw browsing/snapshots and backed-up imports require port 8087; advanced
transforms use the separately launched Garlic engine on port 8082. The dashboard
gates operations by the appropriate backend.

## Installation and use

Download `PSN-HUB-Manager-native.elf` from the successful **Build experimental
native Manager** Actions run. Unzip its artifact and send that ELF using the
stable Manager's payload upload/send controls. Open `http://<PS5-IP>:8087`.
Use **SAVES (WIP)** and **Refresh saves and snapshots**. Firmware/HEN
permissions may prevent access; hardware validation is pending.

Close all games first. Choose a title to browse its raw files or create a manual
snapshot. Snapshots are stored under `/data/psn-hub-native/save-backups/`; their
IDs include user, platform and title. Refresh to list newly created snapshots.
Download every listed file, including PS4 companion `.bin` keys, and retain the
snapshot ID to identify its source. Files remain encrypted in their native form.
These are raw copies, **not a verified restorable export package**. Save database
metadata is not included. Keep independent, verified backups.

## Implemented API

| Route | Behavior |
| --- | --- |
| `GET /api/saves` | Discover title folders under fixed `/user/home/<8-hex-user>/savedata_prospero` (PS5) and `savedata` (PS4) roots |
| `GET /api/saves/files?user=…&platform=ps5&title=PPSA00001` | List all raw regular files in a title |
| `GET /api/saves/download?user=…&platform=…&title=…&name=…` | Stream one raw file |
| `POST /api/saves/backup?user=…&platform=…&title=…` | Create a manual title snapshot; requires `X-PSNHUB-Request: 1` and same-origin checks |
| `GET /api/saves/backups` | List completed snapshots |
| `GET /api/saves/files?id=…` | List snapshot files |
| `GET /api/saves/download?id=…&name=…` | Download one snapshot file |

Status capabilities `saveRead` and `saveBackup` gate the dashboard controls.
Source files are opened read-only, descriptor-relative, without following
symlinks. Each title is limited to 4 GiB total and 4,096 files. Unsupported
filenames, nested directories, symlinks and special files fail the operation
rather than silently omitting data. Per-file copies are SHA-256 compared against
their source; directory metadata is checked again before publishing the snapshot
with an atomic rename. Failed copies do not appear in the completed snapshot list.
This cannot provide an atomic view of a running game's writes: keep games closed.
Power loss can leave a hidden staging directory; completed snapshots are retained.
The single-threaded server can be busy while copying large titles.

## Verification and remaining work

Host integration tests exercise PS4 and PS5 discovery, companion keys, exact
downloads, snapshot retention after source changes, traversal and symlink
rejection, unsupported layouts, mutation protection and unavailable restore.
GitHub Actions runs them with address/undefined-behavior sanitizers and builds
the PS5 ELF with the pinned SDK. Console permissions and real save layouts still
need on-console testing. No PS5 saves were modified to develop this feature.

The dashboard now integrates the separately launched Garlic SaveMgr engine for
decrypt, encrypt, resign and reviewed import/restore. See
[the advanced tools guide](../Manager/SAVE-TOOLS.md) for inputs, limits and backup
behavior. PSN-HUB does not implement PFS cryptography in this native server.
Raw access was confirmed working by the user; advanced on-console validation is
still pending. Automatic backups and unattended bulk restores remain unavailable.

Research: [Garlic SaveMgr](https://github.com/earthonion/garlic-savemgr) and
[Garlic Worker](https://github.com/earthonion/garlic-worker), by earthonion.
The fixed save-directory layouts were checked against Garlic SaveMgr commit
`08c24b5f98bf410f0addeec210857cfa07b73f63`. This implementation is original
PSN-HUB code. The advanced tools separately bundle an unmodified Garlic SaveMgr
ELF; see the provenance guide linked above. No Garlic Worker code or binary is
bundled. The native project is
distributed under its existing GPL-3.0-or-later license.
