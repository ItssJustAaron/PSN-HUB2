"""Embed reviewed artwork and the pinned Garlic engine in the one-file Manager."""
from pathlib import Path
import hashlib
import gzip
root=Path(__file__).resolve().parents[1]
out=root/'native/build';out.mkdir(parents=True,exist_ok=True)
engine=root/'native/vendor/garlic-savemgr_08c24b5.elf.gz'
data=gzip.decompress(engine.read_bytes()) if engine.exists() else (root/'payloads/garlic-savemgr_08c24b5.elf').read_bytes()
assert hashlib.sha256(data).hexdigest()=='4fe4bada2e11075a3dcece3230d0184e5d81865c38668898254c5ae6d0a3fdeb'
rows=[','.join(str(b) for b in data[i:i+32]) for i in range(0,len(data),32)]
(out/'save_engine.h').write_text('/* Pinned Garlic SaveMgr by earthonion; see native/vendor/README.md. */\nstatic const unsigned char save_engine[]={\n'+',\n'.join(rows)+'\n};\n',encoding='ascii')
print('Embedded verified save engine:',len(data),'bytes')

theme = out / 'blaze414-ps5-theme-v1.80.elf'
data = theme.read_bytes()
if hashlib.sha256(data).hexdigest() != 'e27473f0f5d3a9c544ed075f3f0a0e831377e0ab5e6316dce81ad732a99c04eb':
    raise SystemExit('PS5 Themes payload checksum mismatch')
rows = [','.join(str(b) for b in data[i:i+32]) for i in range(0, len(data), 32)]
(out / 'theme_engine.h').write_text(
    '/* PS5 Themes v1.80 by Blaze414. */\nstatic const unsigned char theme_engine[]={\n'
    + ',\n'.join(rows) + '\n};\n', encoding='ascii')
