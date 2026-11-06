"""Build the static file catalogue and embed the editable dashboard in the ELF.

Run from any directory after adding files or changing Manager/dashboard.html.
The ELF's original 28,046-byte HTML slot is padded to retain all native offsets.
"""
import hashlib
import json
import re
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
manager = ROOT / "Manager"
metadata = json.loads((manager / "descriptions.json").read_text(encoding="utf-8"))
catalog = {"hens": [], "modMenus": [], "emulators": [], "payloads": [], "cheats": []}
artwork_file = manager / "artwork.json"
artwork = json.loads(artwork_file.read_text(encoding="utf-8")) if artwork_file.exists() else {"games": {}}

def cheat_metadata(file):
    match = re.match(r"((?:CUSA|PPSA)\d+)_([^_]+)", file.name, re.I)
    info = {"id": match[1].upper() if match else "Unknown", "version": match[2] if match else "Unknown",
            "format": file.suffix[1:].lower(), "title": "", "creators": [], "notes": "", "mods": []}
    if file.suffix.lower() == ".json":
        data = json.loads(file.read_text(encoding="utf-8-sig"))
        info.update(title=str(data.get("name", "")), id=str(data.get("id", info["id"])), version=str(data.get("version", info["version"])))
        credits = data.get("credits", [])
        info["creators"] = [str(x) for x in credits] if isinstance(credits, list) else [str(credits)]
        info["mods"] = [str(mod.get("name", "")) for mod in data.get("mods", []) if isinstance(mod, dict)][:30]
        notes = [str(data[key]) for key in ("notes", "issue", "description") if data.get(key)]
        info["notes"] = "\n".join(notes)[:1500]
    elif file.suffix.lower() == ".shn":
        try:
            trainer = ET.parse(file).getroot()
            info.update(title=trainer.get("Game", ""), id=trainer.get("Cusa", info["id"]), version=trainer.get("Version", info["version"]))
            info["creators"] = [trainer.get("Moder")] if trainer.get("Moder") else []
            info["mods"] = [node.get("Text", "") for node in trainer.iter("Cheat")][:30]
        except ET.ParseError:
            pass
    return info

for directory, section in [("Hens", "hens"), ("Hen", "hens"), ("ModMenus", "modMenus"), ("Emulators", "emulators"), ("Cheats", "cheats")]:
    # Path ordering differs between Windows and Linux; sort portable strings.
    for file in sorted((manager / directory).rglob("*"), key=lambda entry: entry.relative_to(manager).as_posix()):
        if not file.is_file():
            continue
        extension = file.suffix.lower()
        if section == "cheats":
            if extension not in (".json", ".mc4", ".shn"):
                continue
            relative = file.relative_to(manager / directory).as_posix()
            target = relative if relative.split("/")[0].lower() == extension[1:] else extension[1:] + "/" + relative
            catalog[section].append({"path": file.relative_to(ROOT).as_posix(), "target": target, "size": file.stat().st_size,
                                     "sha256": hashlib.sha256(file.read_bytes()).hexdigest(), **cheat_metadata(file)})
            continue
        if extension not in (".elf", ".bin"):
            continue
        if file.read_bytes()[:4] != b"\x7fELF":
            raise SystemExit("Invalid ELF: " + str(file))
        relative = file.relative_to(manager).as_posix()
        entry = {"title": file.parent.name if file.parent.name != directory else file.stem,
                 "description": "Homebrew enabler payload." if section == "hens" else "Emulator installer payload." if section == "emulators" else "Game mod-menu payload.",
                 **metadata.get(relative, {}),
                 "path": file.relative_to(ROOT).as_posix(), "name": file.name, "size": file.stat().st_size,
                 "sha256": hashlib.sha256(file.read_bytes()).hexdigest()}
        if entry.get("expectedSha256") and entry["expectedSha256"] != entry["sha256"]:
            raise SystemExit("Payload differs from the documented release: " + relative)
        catalog[section].append(entry)

# The former public payload menu is now browsed only inside Manager.
for item in json.loads((manager / "payloads.json").read_text(encoding="utf-8")):
    name = item["name"]
    if not re.fullmatch(r"[A-Za-z0-9._-]+\.(?:elf|bin)", name, re.I) or name == "PSN-HUB-Manager.elf":
        raise SystemExit("Invalid bundled payload name: " + name)
    file = ROOT / "payloads" / name
    binary = file.read_bytes()
    if binary[:4] != b"\x7fELF":
        raise SystemExit("Invalid bundled payload ELF: " + name)
    catalog["payloads"].append({**item, "path": "payloads/" + name,
        "size": len(binary), "sha256": hashlib.sha256(binary).hexdigest(),
        "author": item.get("info", "").split(" - ")[-1],
        "instructions": "Start a compatible HEN where required, then send this payload. Verify firmware support in the project's documentation."})

# Encrypted MC4 files carry no readable metadata. Use a matching title ID/version
# for the game name only; never infer that file's author or cheat list.
titles = {(entry["id"], entry["version"]): entry["title"] for entry in catalog["cheats"] if entry["title"]}
for entry in catalog["cheats"]:
    entry["title"] = entry["title"] or titles.get((entry["id"], entry["version"]), entry["id"])
    entry["platform"] = "PS5" if entry["id"].startswith("PPSA") else "PS4" if entry["id"].startswith("CUSA") else "Unknown"
    cover = artwork["games"].get(entry["id"], {}).get("path")
    if cover and cover.startswith("Manager/covers/") and (ROOT / cover).is_file():
        entry["cover"] = cover

catalogue_version = hashlib.sha256(json.dumps(catalog, sort_keys=True, separators=(",", ":")).encode()).hexdigest()[:12]
previous_catalogue = json.loads((manager / "catalog.json").read_text(encoding="utf-8")) if (manager / "catalog.json").exists() else {}
old_metadata = previous_catalogue.get("metadata", {})
updated_at = old_metadata.get("updatedAt") if old_metadata.get("version") == catalogue_version else None
updated_at = updated_at or datetime.now(timezone.utc).isoformat(timespec="seconds")
ui_source = (manager / "library.js").read_text(encoding="utf-8")
ui_release = re.search(r"const UI_RELEASE = '([^']+)'", ui_source)[1]
ui_hash = hashlib.sha256(ui_source.encode()).hexdigest()
css_hash = hashlib.sha256((manager / "library.css").read_text(encoding="utf-8").encode()).hexdigest()
template = (manager / "dashboard.html").read_text(encoding="utf-8")
build_id = hashlib.sha256((template + ui_hash + css_hash + catalogue_version).encode()).hexdigest()[:12]
build = {"buildId": build_id, "uiRelease": ui_release, "uiSha256": ui_hash, "cssSha256": css_hash, "catalogueVersion": catalogue_version, "catalogueUpdatedAt": updated_at}
catalog["metadata"] = {"version": catalogue_version, "updatedAt": updated_at, "buildId": build_id}
html = "\n".join(line.strip() for line in template.splitlines())
embedded_build = {key: build[key] for key in ("buildId", "uiRelease", "catalogueVersion", "catalogueUpdatedAt")}
html = html.replace("__MANAGER_BUILD__", json.dumps(embedded_build, separators=(",", ":")))
library_version = ui_hash[:12]
html = html.replace("__LIBRARY_VERSION__", library_version)
# Library entries live in the catalogue, keeping the native HTML slot independent
# of how many payloads are added. Never embed a stale compatibility snapshot.
embedded = {"hens": [], "modMenus": []}
html = html.replace("const builtinCatalog = null;", "const builtinCatalog = " + json.dumps(embedded, ensure_ascii=True, separators=(",", ":")).replace("<", "\\u003c") + ";").encode("utf-8")
payload = ROOT / "payloads" / "PSN-HUB-Manager.elf"
binary = payload.read_bytes()
start = binary.index(b"<!doctype html>")
capacity = 28046
assert binary[start + capacity] == 0, "Unexpected ELF dashboard slot"
if len(html) > capacity:
    raise SystemExit(f"Dashboard is {len(html)} bytes; ELF slot holds {capacity} bytes")
updated = binary[:start] + html.ljust(capacity, b" ") + binary[start + capacity:]
assert len(updated) == len(binary)
assert updated[:start] == binary[:start] and updated[start + capacity:] == binary[start + capacity:]
(manager / "catalog.json").write_text(json.dumps(catalog, ensure_ascii=True, separators=(",", ":")) + "\n", encoding="utf-8")
payload.write_bytes(updated)
build["elfSha256"] = hashlib.sha256(updated).hexdigest()
build["elfBytes"] = len(updated)
(manager / "build.json").write_text(json.dumps(build, indent=2) + "\n", encoding="utf-8")

# Cache exact request URLs, including query strings used by scripts and modules.
supported = re.findall(r'"(\d+\.\d+)"', (ROOT / "firmware.js").read_text(encoding="utf-8").split("const USER_AGENT_VERSION")[0])
(ROOT / "offsets" / "offsets.json").write_text(json.dumps({"firmwares": [{"version": version, "script": version + ".js"} for version in supported]}, indent=2) + "\n", encoding="utf-8")
entries = {"index.html", "relapse.html", "mascot.png", "offsets/offsets.json", "document/en/ps5/index.html"}
for file in ROOT.glob("*.js"):
    entries.add(file.name)
for file in (ROOT / "offsets").glob("*.js"):
    if file.stem != "TEMPLATE":
        entries.add(file.relative_to(ROOT).as_posix())
for file in (ROOT / "payloads").iterdir():
    if file.suffix.lower() in (".elf", ".bin"):
        entries.add(file.relative_to(ROOT).as_posix())
for file in [ROOT / "relapse.html", *ROOT.glob("*.js")]:
    for match in re.findall(r'''["'](?:\./)?([^"'\s]+\.(?:js|elf|bin)\?v=\d+)["']''', file.read_text(encoding="utf-8")):
        if not (ROOT / match.split("?")[0]).is_file():
            raise SystemExit("Missing cached dependency: " + match)
        entries.add(match)
digest = hashlib.sha256()
for entry in sorted(entries):
    digest.update(entry.encode())
    cached_file = ROOT / entry.split("?")[0]
    digest.update(cached_file.read_text(encoding="utf-8").encode() if cached_file.suffix in (".js", ".html", ".json", ".css") else cached_file.read_bytes())
manifest = "CACHE MANIFEST\n# PSN-HUB Cache " + digest.hexdigest()[:16] + "\n\nCACHE:\n" + "\n".join(sorted(entries)) + "\n\nNETWORK:\n*\n"
(ROOT / "cache.appcache").write_text(manifest, encoding="utf-8")
print(f"Embedded dashboard: {len(html)}/{capacity} bytes; ELF offsets preserved.")
print(f"Catalogue: {len(catalog['hens'])} HENs, {len(catalog['modMenus'])} mod menus, {len(catalog['emulators'])} emulators, {len(catalog['cheats'])} cheats.")
print(f"Cache: {len(entries)} URLs; version {digest.hexdigest()[:16]}.")
