# HD mascot and home-screen icons

The approved imagegen outputs are `mascot-hd.png` (transparent website master)
and `home-icon-hd.png` (square console icon master). Their exact prompts are
stored alongside them. `mascot.png` at the repository root is the 768px web
export; `home-icon.png` here is the PS5's 512px export.

Run `python tools/build-hd-icons.py` with Pillow 12.0.0, then
`python tools/build-manager.py` and `node tools/check-site.cjs`.
The icon exporter changes only the two original PNG data slots in the stable
Manager ELF. Valid ancillary PNG padding preserves the original slot lengths;
all executable bytes and offsets stay unchanged.

For existing installations, send **PSN-HUB HD home-screen icons** from the
Manager payload library. It checks title ownership through read-only SQLite,
backs up every existing target icon under `/data/psn-hub-icon-update/`, and
refreshes the Manager, Media jailbreak and already-replaced Store icon files.
It changes no database cells, title names, URLs, backgrounds or visibility.
It does not create a Store replacement if one is not already installed.
Refresh or reboot the console manually to make the shell reload its artwork.
The short-lived result endpoint is port 8094. Backups include a manifest mapping
each original PNG to its full destination path. Keep these console-private files.
