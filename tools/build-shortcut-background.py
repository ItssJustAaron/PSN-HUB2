"""Embed the reviewed PNG unchanged in the dedicated Store artwork payload."""
from pathlib import Path
import hashlib, struct
root=Path(__file__).resolve().parents[1]
asset=(root/'Manager/assets/jailbreak-background.png').read_bytes()
if asset[:8]!=b'\x89PNG\r\n\x1a\n':raise ValueError('Background must be PNG')
width,height=struct.unpack('>II',asset[16:24])
if not (1280<=width<=4096 and 720<=height<=2160 and abs(width/height-16/9)<.02):raise ValueError('Expected wide console background')
digest=hashlib.sha256(asset).hexdigest()
name='psn-hub-background-'+digest[:12]+'.png'
uri='/user/appmeta/NPXS40047/'+name+'?psnhub-bg='+digest[:12]
out=root/'native/build';out.mkdir(parents=True,exist_ok=True)
rows=[','.join(str(b) for b in asset[i:i+32]) for i in range(0,len(asset),32)]
(out/'shortcut_background.h').write_text('#define BACKGROUND_SHA256 "'+digest+'"\n#define BACKGROUND_FILE "'+name+'"\n#define BACKGROUND_URI "'+uri+'"\nstatic const unsigned char background_png[]={\n'+',\n'.join(rows)+'\n};\n',encoding='ascii')
print(f'Embedded reviewed background unchanged: {width}x{height}, {len(asset)} bytes, SHA256 {digest}')
