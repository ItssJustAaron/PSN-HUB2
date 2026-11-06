# Console saves in unified Manager 0.4.0

Use the normal **Saves** tab on port **8085**. The one current
**PSN-HUB-Manager.elf** includes console save discovery, raw downloads, snapshots,
USB exports and optional automatic USB backups. No separate save-service startup
is required. Reboot once and jailbreak with the updated ELF to clear older helpers.

## Downloads and snapshots

Current PS4/PS5 save folders are read under the fixed `/user/home/<user>/savedata`
and `savedata_prospero` roots. Select **View saves / download** for file links.
Keep PS4 companion `.bin` keys with their images. Files remain encrypted; raw
copies do not include save-database metadata and are not verified portable restore
packages. Advanced transformations/imports use the built-in pinned Garlic engine
and remain WIP; see [the advanced guide](../Manager/SAVE-TOOLS.md).

Manual snapshots use `/data/psn-hub/save-backups`. Earlier snapshots in the old
native/save-service directories remain readable. Source files are opened read-only
without following symlinks. Titles are limited to 4 GiB total and 4,096 regular
files; nested directories and unsupported names fail instead of omitting data.
Copies are SHA-256 verified and directory metadata is checked before publishing
an atomic completed snapshot. Close games: this cannot freeze a running game's writes.

## USB backups

Choose a connected USB volume and use **Back up save to USB** or
**Back up all changed saves to USB**. Destinations are existing mounted USB0–USB7
volumes, under `/PSN-HUB/Saves/<user>/<platform>/<title>/<snapshot>`.
Unchanged titles are skipped based on their recorded file inventory. Originals
are preserved; completed snapshots are not automatically deleted.

Automatic backup is off by default. Its selected volume and 15–1440 minute
interval are saved on the console and run while Manager is active. Prior USB
settings are imported once without replacing a configuration already saved in
the main Manager. Disconnected/full drives produce a reported failure; Manager
does not create a fake USB mount or silently redirect backups to internal storage.

## API

- `GET /api/saves`, `/api/saves/files`, `/api/saves/download`, `/api/saves/backups`.
- `POST /api/saves/backup` for a verified internal snapshot.
- `GET /api/saves/usb` for devices and automatic-backup status.
- `POST /api/saves/usb/export`, `/api/saves/usb/all`, `/api/saves/usb/config`.
- `POST /api/save-engine/start` starts the embedded Garlic engine internally.

Mutations require the request marker and origin checks. All save access remains
on the console's local network; no remote save-processing service is configured.
The single-threaded server can be busy while copying a large title.

Host tests cover discovery, downloads, retained snapshots, USB exports, unchanged
skipping, timer/configuration persistence, migration, path protection and self-update
handoff. Read-only discovery of 13 save folders and a real download passed on PS5.
Physical USB writes and advanced transforms/imports still require hardware validation.
