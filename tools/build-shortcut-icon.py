"""Reuse the existing site mascot as the Store icon; convert only format and size."""
from pathlib import Path
import hashlib
from PIL import Image, ImageOps
root=Path(__file__).resolve().parents[1]
out=root/'native/build';out.mkdir(parents=True,exist_ok=True)
with Image.open(root/'mascot.png') as original:
    # The existing file is WebP despite its .png name. Keep the original artwork,
    # aspect ratio and white background; prepare the PS5's square PNG asset.
    image=ImageOps.contain(original.convert('RGBA'),(512,512),Image.Resampling.LANCZOS)
    canvas=Image.new('RGBA',(512,512),(255,255,255,255))
    canvas.alpha_composite(image,((512-image.width)//2,(512-image.height)//2))
    canvas.save(out/'psn-hub-icon.png',format='PNG',compress_level=9)
asset=(out/'psn-hub-icon.png').read_bytes()
(out/'shortcut_icon.h').write_text('#define SHORTCUT_ICON_SHA256 "'+hashlib.sha256(asset).hexdigest()+'"\n',encoding='ascii')
print('Reused site mascot as a 512x512 PNG:',len(asset),'bytes')
