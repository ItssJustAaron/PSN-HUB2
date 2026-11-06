"""Package the matching Manager ELF, web assets, library and site fixes."""
from pathlib import Path
import zipfile
import json
import hashlib
import os

root = Path(__file__).resolve().parents[1]
build = json.loads((root / "Manager" / "build.json").read_text(encoding="utf-8"))
output = root / "releases" / ("PSN-HUB-Manager-Update-" + build["buildId"] + ".zip")
output.parent.mkdir(exist_ok=True)
files = set()
for folder in ("Manager", "tools", "api", ".github", "native"):
    files.update(file for file in (root / folder).rglob("*") if file.is_file())
# Include cover PNGs too, but omit development screenshots and Python caches.
files = {file for file in files if "__pycache__" not in file.parts and not file.name.startswith("preview-") and not file.relative_to(root).as_posix().startswith("native/build/")}
files.update(file for file in (root / "Manager" / "covers").rglob("*") if file.is_file())
files.update(root.glob("*.js"))
files.update(root / item["path"] for item in json.loads((root / "Manager/catalog.json").read_text(encoding="utf-8")).get("payloads", []))
files.update([root / ".gitattributes", root / ".gitignore"])
for relative in ("payloads/PSN-HUB-Manager.elf", "cache.appcache", "index.html", "relapse.html", "main.js", "README.md", "document/en/ps5/index.html", "offsets/offsets.json"):
    files.add(root / relative)
notes = "PSN-HUB Manager UI " + build["uiRelease"] + " — build " + build["buildId"] + "\n" + """

Extract into the existing PSN-HUB2 project, preserving folder paths.
Upload all included files to the GitHub main branch, including Manager/library.js,
Manager/library.css, Manager/catalog.json, Manager/covers and the HEN files.
The ELF downloads its expanded interface and catalogue from that branch.
Replacing only the ELF while GitHub still has old assets can show the old UI.

Restart the PS5 Manager with payloads/PSN-HUB-Manager.elf and reload the dashboard.
The included catalogue contains cragson-PS5Hen, etaHEN 2.5B and onionHEN v0.9.0.
etaHEN's .bin is ELF-format and is sent unchanged. OnionHEN's ELF matches the
official release hash. Do not run etaHEN and onionHEN simultaneously.
Emulator installers go in Manager/Emulators; rebuild the catalogue after adding.
PS5SX2Installer.elf is included and matches the documented release checksum.
The first-run setup and TV/controller mode are available in the dashboard.
The online loader checks the published build before sending Manager, while an
offline fallback is explicitly labelled. Use CHECK SITE UPDATE on the home page.
Versions, saved profiles and diagnostics are available in the maintenance panel.
The current native ELF only installs cheats to /data/etaHEN/cheats.
The new experimental native service is built separately from native/ and uses
port 8087. It implements inventory, OnionHEN destinations and backup/restore.
It is not auto-loaded or substituted for the stable Manager on port 8085.
Console hardware validation is still required before promoting it to stable.
See native/README.md and the experimental-native-manager Actions artifact.

The homepage now offers jailbreak only. After jailbreak, Manager is sent once,
its listener is checked, then its dashboard opens. Other bundled payloads are
available in Manager. An explicit retry/open fallback remains on the launch page.

Advanced save tools are now available in the Saves (WIP) tab. Start the pinned
Garlic SaveMgr engine from that panel, then Check engine. It provides local
PS4/PS5 decrypt, encrypt, resign and reviewed import/restore. Imports need the
experimental Manager on port 8087 so an existing title can be snapshotted before
installation. PS4 encrypted inputs require their matching 96-byte .bin key.
PS5 preserved exports require their original metadata sidecars.
ZIP limit: 128 MiB compressed / 256 MiB expanded. Raw images: up to 2 GiB.
Raw access was confirmed working by the user; advanced operations still need
on-console validation. No automatic import retries or force-import are used.
See Manager/SAVE-TOOLS.md for limitations, backup behavior and upstream credits.

The Payloads tab now includes a preview plus Apply/Restore controls for the
weed-themed Store jailbreak background. The existing PSN-HUB Store shortcut is
required; both databases are backed up before artwork references change.
See native/shortcut/BACKGROUND.md.

This UI release retains dismissible release notes, visible build status, detailed
install reviews, saved cheat filters/pages/tabs and a compact mobile setup.
Unsupported firmware is labelled and blocked; unconfirmed support stays labelled.
"""
with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED, compresslevel=5) as archive:
    for file in sorted(files):
        archive.write(file, file.relative_to(root).as_posix())
    archive.writestr("UPDATE-NOTES.txt", notes)
with zipfile.ZipFile(output) as archive:
    assert archive.testzip() is None
    assert "payloads/PSN-HUB-Manager.elf" in archive.namelist()
    assert "Manager/library.js" in archive.namelist()
    for asset in ("Manager/save-tools.js", "Manager/vendor/fflate-0.8.2.js", "Manager/vendor/fflate-LICENSE.txt", "payloads/garlic-savemgr_08c24b5.elf"):
        assert asset in archive.namelist()
print(output)
print(f"{output.stat().st_size:,} bytes; {len(files)} files; archive verified.")
checksum = hashlib.sha256(output.read_bytes()).hexdigest()
sidecar = output.with_suffix(output.suffix + ".sha256")
sidecar.write_text(checksum + "  " + output.name + "\n", encoding="utf-8")
release_notes = "# PSN-HUB Manager " + build["uiRelease"] + "\n\nBuild: `" + build["buildId"] + "`\n\n" + notes + "\n\nZIP SHA-256: `" + checksum + "`\n"
(output.parent / "RELEASE-NOTES.md").write_text(release_notes, encoding="utf-8")
if os.environ.get("GITHUB_OUTPUT"):
    with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as stream:
        stream.write("zip=" + output.relative_to(root).as_posix() + "\n")
        stream.write("checksum=" + sidecar.relative_to(root).as_posix() + "\n")
