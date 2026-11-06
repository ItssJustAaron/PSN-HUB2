"""Generate the fixed-capacity dashboard for the source-built unified Manager."""
from pathlib import Path
root = Path(__file__).resolve().parents[1]
binary = (root / 'payloads/PSN-HUB-Manager.elf').read_bytes()
start = binary.index(b'<!doctype html>')
html = binary[start:start + 28046].rstrip().ljust(28046,b' ')
data = html + b'\0'
out = root / 'native/build'
out.mkdir(parents=True, exist_ok=True)
rows = [','.join(str(v) for v in data[i:i+32]) for i in range(0, len(data), 32)]
(out / 'dashboard.h').write_text('/* Generated; do not edit. */\nstatic const unsigned char dashboard[]={\n'+',\n'.join(rows)+'\n};\nstatic const size_t dashboard_size=sizeof(dashboard);\n', encoding='ascii')
print(f'Generated native dashboard: {len(html)} bytes')
