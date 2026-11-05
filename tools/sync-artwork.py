"""Cache official PlayStation cover thumbnails for local catalogue titles.

URL metadata: HEN Cheats Collection (TeeKay87). Artwork remains owned by its
respective publishers. No application code or image files are taken from HENCC.
"""
import concurrent.futures
import json
import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
manager = ROOT / "Manager"
catalog = json.loads((manager / "catalog.json").read_text(encoding="utf-8"))
index_url = "https://hencheats.vercel.app/data/covers.json"
with urllib.request.urlopen(index_url, timeout=20) as response:
    source = json.load(response)
titles = source.get("titles", {})
ids = source.get("ids", {})
games = {}
for file in catalog["cheats"]:
    games.setdefault(file["id"], file["title"])
cover_dir = manager / "covers"
cover_dir.mkdir(exist_ok=True)

def cache_cover(item):
    title_id, title = item
    if not re.fullmatch(r"[A-Z]{4}\d{5}", title_id):
        return None
    image_url = ids.get(title_id) or titles.get(" ".join(title.lower().split()))
    if not isinstance(image_url, str) or not image_url.startswith("https://image.api.playstation.com/"):
        return None
    target = cover_dir / (title_id + ".jpg")
    if target.exists() and target.stat().st_size > 100:
        return title_id, {"path": target.relative_to(ROOT).as_posix(), "source": image_url}
    url = image_url + ("&" if "?" in image_url else "?") + "w=320&h=320&format=jpeg"
    try:
        request = urllib.request.Request(url, headers={"User-Agent": "PSNHUB-CoverCache/1.0"})
        with urllib.request.urlopen(request, timeout=12) as response:
            blob = response.read(2_000_001)
        if len(blob) > 2_000_000 or len(blob) < 100:
            return None
        # The CDN may retain PNG or WebP regardless of the requested format.
        extension = ".jpg" if blob.startswith(b"\xff\xd8\xff") else ".png" if blob.startswith(b"\x89PNG") else ".webp" if blob.startswith(b"RIFF") and blob[8:12] == b"WEBP" else None
        if not extension:
            return None
        target = target.with_suffix(extension)
        target.write_bytes(blob)
        return title_id, {"path": target.relative_to(ROOT).as_posix(), "source": image_url}
    except (OSError, ValueError):
        return None

artwork = {"metadataSource": index_url, "credit": "Artwork URL metadata: HEN Cheats Collection / TeeKay87. Images: PlayStation CDN; rights remain with publishers.", "games": {}}
existing = manager / "artwork.json"
if existing.exists():
    artwork["games"].update(json.loads(existing.read_text(encoding="utf-8"))["games"])
with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:
    for count, result in enumerate(pool.map(cache_cover, games.items()), 1):
        if result:
            artwork["games"][result[0]] = result[1]
        if count % 100 == 0:
            existing.write_text(json.dumps(artwork, separators=(",", ":")), encoding="utf-8")
            print(f"Artwork checked: {count}/{len(games)}; cached: {len(artwork['games'])}", flush=True)
existing.write_text(json.dumps(artwork, separators=(",", ":")), encoding="utf-8")
print(f"Cached {len(artwork['games'])}/{len(games)} local covers. Missing artwork uses the title fallback.")
