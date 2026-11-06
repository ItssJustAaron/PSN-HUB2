# Reversible Store shortcut test

The apply ELF targets only title **NPXS40047** and concept
`cid:local:NPXS40047`. It does not install automatically, change the jailbreak
exploit, replace whole live databases, modify app category/location/DRM fields,
restart SceShellUI or reboot the console.

## Review and plan

Install Pillow 13.0.0, then prepare the PNG with `python tools/build-shortcut-icon.py`.
It reuses the existing site mascot from `mascot.png`, preserving its artwork,
aspect ratio and background. Only the PNG format and 512x512 canvas are prepared
for the PS5. No replacement logo is generated.

Keep inspection copies and the plan private. They contain console metadata and
local profile table identifiers. They belong under ignored `native/build/`, not
in the public repository. FTP inspection copies are not recovery backups.

`tools/prepare-store-plan.py` reads local inspection copies without editing them.
It handles both flat AppInfoJson and legacy ConceptInfoJson field_list records,
records each old/new cell and preserves unrelated metadata, including display
locations, concept bitmasks, categories, title IDs, launch-handler URIs and DRM.

The supported operation changes Store titles to PSN-HUB JAILBREAK, deeplink URLs to
`https://itssjustaaron.github.io/PSN-HUB2/`, and icon references to a separately
staged `/user/appmeta/NPXS40047/psn-hub-icon.png?psnhub=1`. The existing icon file
is not overwritten.

## Apply

Stage the reviewed PNG and private plan as:

- `/user/appmeta/NPXS40047/psn-hub-icon.png`
- `/data/psn-hub-store-test/plan.db`

Applying also requires a file named `approve-<SHA256-of-plan.db>.txt` under the
test directory. Its exact content is `APPLY NPXS40047`, a newline, the jailbreak
URL above, and another newline. This binds approval to one concrete plan.

After explicit approval, send PSN-HUB-Store-Apply.elf through elfldr. The payload:

1. Checks the approval, plan, target, journal mode, JSON change scope and icon.
2. Creates new SQLite Backup API snapshots of both live databases while holding
   read transactions. It checks the snapshots and syncs their files/directories.
3. Opens one IMMEDIATE transaction spanning app.db, appinfo.db and plan.db, using
   DELETE journals and FULL synchronous mode. WAL or unsupported modes are refused.
4. Checks every current cell still matches its reviewed old value before writing.
5. Updates only guarded target cells, checks integrity, and commits plan state
   together with both system databases.

The result is written to `/data/psn-hub-store-test/result.json`. The plan records
its native backup directory. An error must be inspected before retrying; do not
assume a failed or interrupted network send means the native payload did nothing.

## Restore

Sending PSN-HUB-Store-Restore.elf restores the exact old cells from the committed
plan in another coordinated transaction. It preserves unrelated apps and later
unrelated database changes. Restore refuses if any patched field has since drifted. It preserves unrelated
JSON updates such as access timestamps written after the tile was opened.
It does not blindly upload old complete database copies over the live databases.

Restore supports plans from an earlier icon build; it does not require the
new/current icon bytes to match the old installer.

Backups and the plan are retained. The new icon may remain as an unreferenced
file after restoration; the old icon reference is restored.

## Hardware test

Reboot/refresh the shell manually after a successful result. Check the tile's
name and artwork, its website destination, and persistence after reboot. The
existing Store shell may override database shortcut fields; successful database
updates alone do not establish that the tile opens the intended browser URL.

## Rename an earlier PSN-HUB test

PSN-HUB-Store-Rename.elf updates only name fields and corresponding JSON string
sizes to **PSN-HUB JAILBREAK**. It requires `rename-<current-plan-sha256>.txt`
containing `RENAME NPXS40047`, a newline, `PSN-HUB JAILBREAK`, and a newline.
It creates separate rename backups, keeps the original backup directory and old
values, and atomically updates the recovery plan with the new expected name.
The updated Restore ELF can then undo the complete test to the original Store.

## Duplicate Media shortcut policy

A successful Store replacement also hides this project's Media jailbreak title
`PSNH00002`. The separate Manager title `PSNH00001` stays available in Media.
The target is checked against the exact PSN-HUB jailbreak URL before changing it.
Visibility, display-location metadata and per-profile shell flags are recorded in
the same private recovery plan and committed with the Store replacement. A failed
Store replacement leaves the Media shortcut untouched. Restore brings back the
previous Media visibility while preserving unrelated JSON access updates and
SQLite value types. App records, application files and the Manager shortcut are
not deleted.

The supplied stable Manager calls AppInstallTitleDir on startup. Whether that
platform call preserves these hidden/deleted shell flags must still be checked
on a real PS5 after another Manager launch; startup persistence is not claimed
from host tests alone.
