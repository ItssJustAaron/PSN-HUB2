"""Mechanical PNG exports and fixed-size data-only ELF icon replacement.

Artwork is reviewed imagegen output. No executable instructions are changed.
"""
from pathlib import Path
from io import BytesIO
import struct
import zlib
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]

def png_end(data):
    assert data[:8] == b'\x89PNG\r\n\x1a\n'
    pos = 8
    while pos + 12 <= len(data):
        length = struct.unpack('>I', data[pos:pos+4])[0]
        kind = data[pos+4:pos+8]
        chunk = data[pos+4:pos+8+length]
        assert zlib.crc32(chunk) == struct.unpack('>I', data[pos+8+length:pos+12+length])[0]
        pos += length + 12
        if kind == b'IEND':
            return pos
    raise ValueError('PNG has no IEND')

def padded_png(asset, capacity):
    assert png_end(asset) == len(asset)
    length = capacity - len(asset) - 12
    assert length >= 0, 'Icon exceeds embedded PNG capacity'
    chunk = b'npAd' + bytes(length)
    result = asset[:-12] + struct.pack('>I', length) + chunk + struct.pack('>I', zlib.crc32(chunk)) + asset[-12:]
    assert len(result) == capacity and png_end(result) == capacity
    return result

def main():
    with Image.open(ROOT/'Manager/assets/mascot-hd.png') as original:
        assert original.mode == 'RGBA' and original.getextrema()[3][0] == 0
        original.resize((768,768), Image.Resampling.LANCZOS).save(ROOT/'mascot.png', optimize=True)
    with Image.open(ROOT/'Manager/assets/home-icon-hd.png') as original:
        icon = original.convert('RGB').resize((512,512), Image.Resampling.LANCZOS)
        # A shared indexed PNG fits both original fixed-capacity icon slots.
        output = BytesIO()
        icon.quantize(colors=64, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(output, format='PNG', optimize=True)
    asset = output.getvalue()
    (ROOT/'Manager/assets/home-icon.png').write_bytes(asset)
    elf = ROOT/'payloads/PSN-HUB-Manager.elf'
    before = elf.read_bytes()
    assert len(before) == 508784 and before[:4] == b'\x7fELF', 'Unrecognized Manager ELF layout'
    after = bytearray(before)
    slots = [(93232,209927),(303424,141347)]
    for offset, capacity in slots:
        assert png_end(before[offset:offset+capacity]) == capacity, 'Unrecognized embedded PNG slot'
        after[offset:offset+capacity] = padded_png(asset,capacity)
    cursor = 0
    for offset, capacity in slots:
        assert before[cursor:offset] == after[cursor:offset]
        cursor = offset+capacity
    assert before[cursor:] == after[cursor:] and len(after) == len(before)
    elf.write_bytes(after)
    print('HD mascot and 512px home icons exported; ELF code and offsets unchanged.')

if __name__ == '__main__':
    main()
