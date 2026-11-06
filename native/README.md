# PSN-HUB unified Manager 0.4.0

The current download is **payloads/PSN-HUB-Manager.elf**. The jailbreak launches
this one Manager on port **8085**. Console saves, USB exports/automatic backups,
artwork operations, payload/category management and the pinned save-processing
engine are included. Separate current helper downloads are retired.

Storage remains `/data/psn-hub`, preserving uploaded payloads. Original category
files are imported without deleting their source; previous save snapshots remain
readable and USB settings are carried over. Old helper processes stop on reboot.

Artwork and Store routines are linked as native functions. Their original backup,
transaction, ownership and recovery-plan checks remain in force. Existing shortcut
registrations are preserved. The built-in pinned Garlic engine runs internally
when requested and retains its original credit; advanced transformations remain WIP.

## Build

Use **Build unified PSN-HUB Manager** in GitHub Actions. It generates the fixed
28,046-byte dashboard slot and reviewed resource headers, runs sanitizer-backed
host tests, checks pinned SDK/SQLite downloads and cross-compiles the PS5 ELF.
The preflight variant is for development only, uses a temporary port and disables
artwork writes and shortcut registration. It is not a user download.

After publishing a newly compiled Manager, run `python tools/build-manager.py`
and `node tools/check-site.cjs` to synchronize the dashboard, build metadata,
catalogue and offline cache. That script changes the fixed dashboard data slot;
C source and artwork/engine changes require recompiling the native ELF.

The server accepts marked same-origin mutations. Save and USB paths are bounded
and reject symlinks; copies are staged and verified before completion. Current
Store metadata operations require the matching reviewed console-specific plan.
No unreviewed generic database replacement is introduced by consolidation.

[Save guide](SAVES.md) · [Advanced tools and attribution](../Manager/SAVE-TOOLS.md).
Physical USB writes and advanced save transforms/imports still need hardware validation.
