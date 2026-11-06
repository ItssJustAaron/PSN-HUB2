# PSN-HUB Manager 0.4.0 — one-file Manager

The jailbreak now uses one current **PSN-HUB-Manager.elf**. Saves, USB backups,
artwork operations and the pinned advanced-save engine are built into that file.
Separate Save Service, HD Icons and Store Background payload downloads are retired.

- Manager and console saves share the normal Manager address on port 8085.
- Saves lists current PS4/PS5 save folders with raw-file downloads.
- Individual and changed-save USB backups and optional automatic backups are integrated.
- Existing uploaded payloads stay in `/data/psn-hub/payloads` and use a two-column grid.
- Original saved categories are imported without deleting their source file.
- Older save snapshots remain readable, and USB backup settings are carried over.
- Artwork updates use built-in functions with the existing backup, ownership,
  transaction and restore checks. Store operations still require a matching
  reviewed console-specific recovery plan; consolidation does not bypass it.
- The embedded Garlic SaveMgr engine starts internally when requested. Its
  original identity and credit are preserved. No separate engine download is needed.
- Future self-updates release Manager's listener and lock before launching its replacement.
- HENs, cheats, mod menus and emulator installer files remain separate library content.

For an existing installation, reboot and jailbreak using the updated Manager ELF
to clear older helper services. No separate save-service startup is needed afterward.
Automatic USB backup is off unless enabled in settings and runs while Manager is active.
Close games to flush their latest saves to disk before backing up.

Advanced decrypt/encrypt/resign/import operations remain WIP. Raw downloads are
encrypted console data, including PS4 companion keys. Physical USB writes still
need validation with a connected drive; host export/timer tests have passed.
