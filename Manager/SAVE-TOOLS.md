# Advanced save tools

Open **Save Manager (WIP) → Open advanced save tools** in PSN-HUB Manager.
Choose **Start save engine** and approve the usual payload send review, then
**Check engine** when it has started. The UI uses the same PS5 hostname on port
8082. No configurable third-party processing server or cloud account is used.

The save engine is **Garlic SaveMgr by earthonion**, pinned to commit
[`08c24b5f98bf410f0addeec210857cfa07b73f63`](https://github.com/earthonion/garlic-savemgr/commit/08c24b5f98bf410f0addeec210857cfa07b73f63).
It is a separate ELF, not PSN-HUB's own implementation of save cryptography.
PSN-HUB provides the interface, input validation, snapshot integration and import
review. The native save engine and its original UI are not rebranded.

## Operations

| Operation | Input and result |
| --- | --- |
| Decrypt | Raw encrypted image; PS4 also needs its matching 96-byte `.bin` key. Download decrypted ZIP. |
| Encrypt | Decrypted ZIP or folder containing `sce_sys/param.sfo`. PS4 uses a fresh PFS image and exports a ZIP with its key; PS5 uses the engine's metadata-preserving ZIP path. Optional target Account ID. |
| Resign | Encrypted image, 16-hex Account ID and matching PS4 key when applicable. Produces a downloadable result without installing it. |
| Import / restore | Encrypted image, decrypted ZIP/folder, or one image from a Manager raw snapshot. Select the target console user, prepare, review the backup and destination, then explicitly install. |

Decrypted archives may include one enclosing title/save folder. ZIPs support
stored and deflated entries. Path traversal, duplicate paths, symlinks, invalid
CRC, encrypted ZIP entries, ZIP64, multiple saves and oversized archives are
rejected. Limit: 128 MiB compressed and 256 MiB expanded. Folder operations are
limited to 256 MiB. Encrypted images support up to the engine's 2 GiB limit.

PS5 decrypted exports can have a zeroed in-image SFO. Keep their original
`PS5PARAM`, `PS5KEY` and `PS5IMAGE` sidecars. The encryption path preserves them.
For importing such an export, encrypt it first and import the encrypted image.
Missing metadata is rejected; the integration never uses force-import.

## Import review and backups

Imports require the experimental PSN-HUB Manager on **8087**, with raw save
listing and snapshot capabilities. On the stable Manager on **8085**, decrypt,
encrypt and resign are available through the companion engine; imports explain
the experimental Manager requirement before staging files.

The engine stages uploaded data in its working area. PSN-HUB checks the platform,
title and directory, then asks its native backend to snapshot an existing title
before offering installation. If the backup fails, installation is unavailable.
For a new title, the review explicitly reports that no previous title files exist.
The review shows the target user, platform, title, save directory, account
information when reported, replacement status and snapshot ID.

Close all games and review the destination before choosing **Install reviewed
save**. A second metadata check must still match the reviewed save. Garlic then
performs account handling, image installation and save database registration.
Warnings from Garlic are displayed rather than treated as complete success.
There is no automatic retry after an interrupted or uncertain installation.

Snapshots contain raw title files, not a full save-database transaction backup.
The engine's file installation and database registration are not an atomic
transaction controlled by PSN-HUB. Retain independent verified backups and check
the game after an import. Database-wide rollback is not provided by this UI.

To restore from a raw snapshot, select **Import / restore → Raw Manager snapshot**,
refresh snapshots, choose the image and the target user. The matching PS4 key is
selected automatically. Each save is reviewed separately; this does not blindly
replace an entire title directory or its database.

## Session handling

Use one save-tool session at a time. Do not manipulate mounts through another
Garlic tab/client while an operation is staged. After downloading a mounted
result, use **Cancel / release this tool session** before another operation.
The engine has shared global mount state; PSN-HUB's client lock does not isolate
other browsers using the companion engine directly.

If a connection is interrupted, check the engine state before continuing. An
uncertain installation is never resent automatically. Automatic backups,
unattended restores, re-region and arbitrary save-file editing are outside this
integration. Garlic's separately configured cloud settings remain under its own
UI; PSN-HUB does not enable or change them.

## Build provenance and dependencies

- Bundled ELF: `payloads/garlic-savemgr_08c24b5.elf`.
- Upstream [successful build](https://github.com/earthonion/garlic-savemgr/actions/runs/42223889282).
- Artifact ZIP SHA-256: `98dfd589bd61096da0dcd5e2351414ae019af25f18141827e5d26b77e88cd95e`.
- ELF SHA-256: `4fe4bada2e11075a3dcece3230d0184e5d81865c38668898254c5ae6d0a3fdeb`.
- ZIP handling: [fflate 0.8.2](https://github.com/101arrowz/fflate/tree/v0.8.2), MIT;
  its license is retained in `vendor/fflate-LICENSE.txt`. The npm archive was
  verified against its published SHA-512 integrity value before copying the UMD.
- [Garlic Worker](https://github.com/earthonion/garlic-worker) is a research
  reference; this integration does not run its remote job service or bundle its
  source/binary.

Raw access was confirmed working by the user. Automated tests cover the
integration protocol and failure handling, not PS5 cryptographic correctness.
The advanced operations require on-console validation on the user's firmware/HEN.
