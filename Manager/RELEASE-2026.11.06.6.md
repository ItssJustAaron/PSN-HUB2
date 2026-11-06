# PSN-HUB artwork update — 6 November 2026

- Replaced the low-resolution homepage mascot with a transparent HD PNG.
- Removed the page-load canvas flood-fill; the browser displays the artwork directly.
- Added matching 512px console icons to both original Manager ELF image slots.
- Added **PSN-HUB HD home-screen icons** to the Manager payload library for existing installations.
- The updater checks PSN-HUB title ownership through read-only SQLite, backs up original icon files, and updates existing source/cache images. Missing Media cache folders are optional.
- Shortcut names, jailbreak links, artwork backgrounds and tile visibility are preserved.
- Offline cache URLs and update packages include the new website mascot.

After installing the icons, refresh or reboot the PS5 manually so the home screen reloads them.
The existing Store replacement must already be installed; this updater only refreshes its custom icon.

Validation: site checks, sanitizer-backed native icon tests and PS5 cross-build passed.
The corrected updater was run successfully on a PS5 and reported three existing icons updated.
The home-screen appearance still needs visual confirmation after a manual refresh.

The artwork was generated with built-in imagegen. Original images, exact prompts and regeneration instructions are in [assets/HD-ARTWORK.md](assets/HD-ARTWORK.md).
