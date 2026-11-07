"""Create a rollback ELF that loads assets from its exact source commit."""

import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

revision = sys.argv[1]
if not re.fullmatch(r"[0-9a-f]{40}", revision):
    raise SystemExit("Use the full Git commit SHA.")


def read(path):
    return subprocess.check_output(["git", "show", f"{revision}:{path}"])


metadata = json.loads(read("Manager/build.json"))
binary = read("payloads/PSN-HUB-Manager.elf")
if hashlib.sha256(binary).hexdigest() != metadata["elfSha256"]:
    raise SystemExit("Source ELF does not match its build manifest.")
for key, path in {
    "uiSha256": "Manager/library.js",
    "cssSha256": "Manager/library.css",
    "saveToolsSha256": "Manager/save-tools.js",
    "communitySavesSha256": "Manager/community-saves.js",
}.items():
    if hashlib.sha256(read(path).replace(b"\r\n", b"\n")).hexdigest() != metadata[key]:
        raise SystemExit(f"{path} does not match its build manifest.")

start = binary.index(b"<!doctype html>")
capacity = 28046
dashboard = binary[start:start + capacity].rstrip(b" ")
url = b"https://raw.githubusercontent.com/ItssJustAaron/PSN-HUB2/main/"
if dashboard.count(url) != 1 or binary[start + capacity] != 0:
    raise SystemExit("Unexpected dashboard asset URL or ELF layout.")
dashboard = dashboard.replace(url, url.replace(b"/main/", f"/{revision}/".encode("ascii")))
if len(dashboard) > capacity:
    raise SystemExit("Pinned dashboard exceeds the ELF slot.")

output = Path(sys.argv[2])
output.mkdir(parents=True, exist_ok=True)
elf = output / "PSN-HUB-Manager.elf"
elf.write_bytes(binary[:start] + dashboard.ljust(capacity, b" ") + binary[start + capacity:])
checksum = hashlib.sha256(elf.read_bytes()).hexdigest()
(output / "PSN-HUB-Manager.elf.sha256").write_text(f"{checksum}  {elf.name}\n", encoding="ascii")
(output / "notes.md").write_text(
    f"Manager UI {metadata['uiRelease']} · build `{metadata['buildId']}`\n\n"
    f"This ELF loads the Manager assets from [commit {revision[:12]}]"
    f"(https://github.com/ItssJustAaron/PSN-HUB2/tree/{revision}).\n\n"
    "Stop the current Manager before loading this ELF with your usual payload loader. "
    "Firmware 9.20 hardware validation is pending.\n\n"
    f"ELF SHA-256 `{checksum}`\n", encoding="utf-8")
