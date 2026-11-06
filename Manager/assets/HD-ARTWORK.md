# HD mascot and home-screen icons

The reviewed imagegen masters are `mascot-hd.png` and `home-icon-hd.png`, with
exact prompts alongside them. Root `mascot.png` is the 768px transparent web
export; `home-icon.png` is the PS5 512px export.

Run `python tools/build-hd-icons.py` with Pillow 12.0.0 to export artwork, then
rebuild the source-built native Manager to embed it. Finish with
`python tools/build-manager.py` and `node tools/check-site.cjs`.

In Manager, use **My library → Home-screen artwork → Update HD icons**. The
operation is built in; no helper ELF is downloaded. It checks title ownership,
backs up original PNGs under `/data/psn-hub-icon-update`, and preserves names,
links, backgrounds and tile visibility. It does not create a Store replacement.
Refresh or reboot the console manually to reload home-screen artwork.

Legacy fixed-slot icon patching and helper payloads apply only to archived builds.
Their backups remain console-private; never publish those files or copied app databases.
