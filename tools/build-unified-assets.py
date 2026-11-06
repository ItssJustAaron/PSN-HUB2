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
