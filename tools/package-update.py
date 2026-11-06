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
for relative in ("payloads/PSN-HUB-Manager.elf", "cache.appcache", "index.html", "mascot.png", "relapse.html", "main.js", "README.md", "document/en/ps5/index.html", "offsets/offsets.json"):
    files.add(root / relative)
notes = "PSN-HUB Manager " + build["uiRelease"] + " — build " + build["buildId"] + "\n\n"
notes += "Extract into the existing PSN-HUB2 checkout, preserving folder paths. The only current Manager download is payloads/PSN-HUB-Manager.elf.\n\n"
notes += (root / 'Manager/RELEASE-2026.11.06.8.md').read_text(encoding='utf-8')
with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED, compresslevel=5) as archive:
    for file in sorted(files):
        archive.write(file, file.relative_to(root).as_posix())
    archive.writestr("UPDATE-NOTES.txt", notes)
with zipfile.ZipFile(output) as archive:
    assert archive.testzip() is None
    assert "payloads/PSN-HUB-Manager.elf" in archive.namelist()
    assert "Manager/library.js" in archive.namelist()
    for asset in ("Manager/save-tools.js", "Manager/vendor/fflate-0.8.2.js", "Manager/vendor/fflate-LICENSE.txt", "native/vendor/garlic-savemgr_08c24b5.elf.gz"):
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
