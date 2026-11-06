"""Use the reviewed HD home-screen icon for new Store shortcut installs."""
from pathlib import Path
import hashlib
root=Path(__file__).resolve().parents[1]
out=root/'native/build';out.mkdir(parents=True,exist_ok=True)
asset=(root/'Manager/assets/home-icon.png').read_bytes()
(out/'psn-hub-icon.png').write_bytes(asset)
asset=(out/'psn-hub-icon.png').read_bytes()
(out/'shortcut_icon.h').write_text('#define SHORTCUT_ICON_SHA256 "'+hashlib.sha256(asset).hexdigest()+'"\n',encoding='ascii')
print('Prepared reviewed HD 512x512 PNG:',len(asset),'bytes')
