# Manager library

Place HEN ELFs in `Manager/Hens/<name>/` (also accepts `Manager/Hen`), mod-menu
ELFs in `Manager/ModMenus/<name>/`, and cheats in `Manager/Cheats` with their
`json`, `mc4`, and `shn` subfolders. Cheats install to `/data/etaHEN/cheats`.
ELF-format `.bin` payloads, including etaHEN 2.5B, are supported without renaming.
Non-ELF raw binaries are rejected by the library builder.

Each HEN and mod-menu ELF gets a collapsible card with a Close button.
Emulator installer ELFs go in `Manager/Emulators` and appear in the EMULATORS tab.
The installer payload controls what is installed and where; Manager sends it to
elfldr using the same validation and compatibility checks as other payloads.
Customize its title, description, instructions, project URL, and firmware groups
in `descriptions.json`, keyed by its exact path relative to `Manager`.
HEN firmware compatibility is separate from the launcher's supported firmware.

The firmware filter uses `/api/status`'s `firmware` (or `systemFirmware` or
`console.firmware`) when a future native build supplies an exact version string
such as `13.60`. In the PS5 browser it can also detect the PS5 user-agent version.
On a phone/PC, the current native ELF does not report console firmware: use
**Set firmware**. Manual selections are labelled and saved per console address
in this browser. A detected/reported value takes priority over the manual value.
Known incompatible HENs/mod menus are hidden by default. **Show incompatible**
reveals their descriptions but keeps SEND disabled. Unknown support stays visible
and is never presented as confirmed compatibility. The same check protects
favourites, saved payloads and autoload categories for known library filenames.
Game-version compatibility and console-firmware compatibility are separate.

Cheats are grouped by title ID and game version. Search by title, ID, or creator;
filter by platform, format, or version; then install a file or a whole version.
DOWNLOAD ALL always installs the whole catalogue, regardless of active filters.
Individual and batch installs use `/data/etaHEN/cheats/{json,mc4,shn}`.
The build reads metadata from JSON and SHN files. Encrypted MC4 creators are
marked unspecified; game names may come from a matching title ID/version.

Transfers show progress, a completion report, Cancel, and Retry remaining.
Cancelling stops downloads and new uploads, but waits for accepted uploads to
finish. Retry skips files successfully completed in the current session.
Sizes and ELF signatures are checked before upload; SHA-256 is also checked
when the browser provides Web Crypto (usually HTTPS or localhost).
Favourites and the twelve most recent successful actions are browser-local.
The Manager status check is read-only. This native Manager build has no dedicated
elfldr status endpoint, so the loader badge reports unknown until a send result.

**Versions, console profiles & maintenance** shows the embedded ELF dashboard
build, loaded UI release, catalogue ID/date, published build, and native engine
version when reported. Mismatched builds produce an update notice.
`build.json` includes the matching ELF SHA-256. The builder uses content-based
IDs and retains the catalogue date when its contents have not changed.

Console profiles save a name/address, manually selected active HEN and firmware,
and manually entered game versions in this browser. Saving a profile does not
connect to another PS5. Installs are blocked when the selected profile belongs
to another console address. Diagnostics export creates a local JSON download;
console addresses are omitted/redacted and no report is sent to a third party.

The current ELF cannot read installed cheat hashes, change its cheat root, or
create/restore console backups. Those controls stay disabled until the native
API explicitly reports support. The client integration and mock-contract tests
are included; see `NATIVE-API.md` for the required backend implementation.
This distinction prevents a browser receipt from being called an installed-file
scan, and prevents OnionHEN uploads silently going to etaHEN's directory.

After adding files or editing `dashboard.html`, run from the site root:

```powershell
python tools/build-manager.py
node tools/check-site.cjs
```

The builder discovers files and generates `catalog.json`, embeds the dashboard
in `payloads/PSN-HUB-Manager.elf`, generates the HEN/mod-menu catalogue and firmware
index, and updates the cache manifest with a content-based version. It retains
the ELF's native code and offsets and refuses oversized dashboard HTML.
The native Manager source is not included; this edits its embedded web UI only.

The embedded dashboard retains the basic payload/upload/category controls.
The expanded library UI loads `Manager/library.js` from this project's GitHub
main branch, with a content-versioned URL. Publish that file and the catalogue
together with the ELF. This avoids expanding the ELF's fixed-size HTML slot.
The Retry library button retries connection or catalogue failures.

The cover-card layout loads `Manager/library.css`: mobile has two columns,
desktop four to six depending on viewport width, and the PS5 browser has four.
Grid/List selection is saved in the browser. Arrow keys, Home and End move
between cards; Enter opens details and Escape closes them.
Artwork is served from local `Manager/covers` files and lazy loaded; missing or
failed images show the title placeholder. Upload these files to GitHub too.
`artwork.json` credits the HEN Cheats Collection/TeeKay87 URL index and retains
the original PlayStation CDN URLs. Artwork rights remain with publishers.
To refresh/add local thumbnails, run `python tools/sync-artwork.py` with internet
access, followed by the normal build and validation commands.

Publish the generated files together with the updated ELF and library folders.
Manager library downloads use this project's GitHub `main` branch and require
internet access. A catalogue avoids recursive GitHub tree API limits.
Existing consoles need a cache refresh and the updated Manager ELF restarted.

For an isolated UI preview, run `node tools/preview-manager.cjs` and open
`http://127.0.0.1:8086`. This preview cannot upload or execute console payloads.
To preview from another device on your Wi-Fi, pass the PC's Wi-Fi IP as the host:
`node tools/preview-manager.cjs <PC-IP>`. The preview remains read-only.
