# Native storage API integration

The supplied compiled Manager has a fixed etaHEN cheat-upload route and no cheat
inventory, backup or restore routes. This document describes the contract used
by the new UI; it is **not a claim that these routes exist in the supplied ELF**.
The new experimental implementation lives in `native/` and listens on port 8087.
It implements this contract separately; the stable ELF on 8085 is unchanged.
See `native/README.md` for build and console-validation instructions.

`GET /api/status` may report:

```json
{
  "version": "native-build-version",
  "firmware": "13.60",
  "capabilities": {
    "destinations": ["etahen", "onionhen"],
    "cheatInventory": true,
    "cheatBackup": true,
    "cheatRestore": true
  }
}
```

Missing capabilities are treated as unsupported. No network probe or browser
install history is used as evidence that console files were read or backed up.

Map destination IDs on the native side to fixed roots only:

- `etahen`: `/data/etaHEN/cheats`
- `onionhen`: `/data/OnionHEN/cheats`

`GET /api/cheats?destination=etahen` returns the selected destination and `items`
with relative format paths (`json/file.json`), sizes, and SHA-256 strings. Only
matching hashes are classified unchanged; files with no hash need verification.

`POST /api/cheat-upload?destination=onionhen&path=json/file.json` must validate the
destination and path, stream to a temporary file in the selected root, and commit
atomically only when the complete request succeeds. Preserve the legacy route
without `destination` for etaHEN. Never ignore an unknown destination.

`POST /api/cheats/backup?destination=etahen` creates a durable console-side backup
and returns `{"id":"backup-123","destination":"etahen"}` only after it is
complete. If backup creation fails, the UI makes no cheat-upload requests.

`POST /api/cheats/restore?destination=etahen&id=backup-123` restores a backup from
the same destination. Validate IDs, reject traversal/symlinks outside fixed roots,
and restore transactionally. Apply the existing mutation request-header checks.

The UI binds each transfer to the selected destination, skips confirmed unchanged
files when installing updates, and invalidates inventory after writes/restores.
Backups available in this dashboard session can be selected for restore.

`GET /api/cheats/backups?destination=etahen` lists durable snapshots as
`{"destination":"etahen","backups":[{"id":"backup-..."}]}` when
`capabilities.backupList` is true. The UI reloads these after reconnecting.
