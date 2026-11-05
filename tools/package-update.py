"""Package the matching Manager ELF, web assets, library and site fixes."""
from pathlib import Path
import zipfile
import json

root = Path(__file__).resolve().parents[1]
build = json.loads((root / "Manager" / "build.json").read_text(encoding="utf-8"))
output = root / "releases" / ("PSN-HUB-Manager-Update-" + build["buildId"] + ".zip")
output.parent.mkdir(exist_ok=True)
files = set()
for folder in ("Manager", "tools"):
    files.update(file for file in (root / folder).rglob("*") if file.is_file())
# Include cover PNGs too, but omit development screenshots and Python caches.
files = {file for file in files if "__pycache__" not in file.parts and not file.name.startswith("preview-")}
files.update(file for file in (root / "Manager" / "covers").rglob("*") if file.is_file())
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
Versions, saved profiles and diagnostics are available in the maintenance panel.
The current native ELF only installs cheats to /data/etaHEN/cheats.
Console inventory, OnionHEN destinations and console backups/restores require
native source changes. Those controls are disabled until the API reports support.
"""
with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED, compresslevel=5) as archive:
    for file in sorted(files):
        archive.write(file, file.relative_to(root).as_posix())
    archive.writestr("UPDATE-NOTES.txt", notes)
with zipfile.ZipFile(output) as archive:
    assert archive.testzip() is None
    assert "payloads/PSN-HUB-Manager.elf" in archive.namelist()
    assert "Manager/library.js" in archive.namelist()
print(output)
print(f"{output.stat().st_size:,} bytes; {len(files)} files; archive verified.")
