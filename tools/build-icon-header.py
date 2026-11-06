"""Embed the reviewed 512px icon for the file-only console updater."""
from pathlib import Path
import hashlib
root=Path(__file__).resolve().parents[1]
asset=(root/'Manager/assets/home-icon.png').read_bytes()
out=root/'native/build';out.mkdir(parents=True,exist_ok=True)
(out/'home_icon.h').write_text('#define HOME_ICON_SHA "'+hashlib.sha256(asset).hexdigest()+'"\nstatic const unsigned char home_icon[]={'+','.join(str(x) for x in asset)+'};\n',encoding='ascii')
