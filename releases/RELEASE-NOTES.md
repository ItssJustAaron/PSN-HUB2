# PSN-HUB Manager 2026.11.06.5

Build: `232a0e643482` · experimental native engine: `0.3.2`.

- Added the **SAVES (WIP)** tab with raw PS4/PS5 save discovery, downloads and manual snapshots.
- Advanced local tools integrate Garlic SaveMgr for decrypt, encrypt, resign and reviewed import/restore.
- Imports require a pre-import title snapshot and a destination review; uncertain installs are not retried automatically.
- Added raw-snapshot restore selection, PS4 companion-key checks, PS5 metadata preservation and bounded ZIP validation.
- Added a weed-themed jailbreak tile background using the existing mascot, with Apply/Restore controls and a preview.
- The background updater backs up both metadata databases, changes only artwork references and preserves unrelated shell updates.
- Fixed PS5 SDK fallback syscall error handling so missing files are not mistaken for valid file handles.
- Manager startup/read-only save discovery and the background metadata update were verified on a real PS5.
- Site/protocol tests, native integration tests, Store/restore tests, syscall regression tests and PS5 builds passed.

The stable Manager remains on 8085; experimental saves use 8087 and the separate
Garlic engine uses 8082. Advanced save transformations/imports still require
on-console validation. Keep separate verified backups.

[Manager download and setup](experimental/README.md) · [Save tools](../Manager/SAVE-TOOLS.md) · [Background recovery](../native/shortcut/BACKGROUND.md).
