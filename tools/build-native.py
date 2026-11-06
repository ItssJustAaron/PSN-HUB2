"""Generate the experimental native dashboard header from the validated stable ELF."""
from pathlib import Path
root = Path(__file__).resolve().parents[1]
binary = (root / 'payloads/PSN-HUB-Manager.elf').read_bytes()
start = binary.index(b'<!doctype html>')
html = binary[start:start + 28046].rstrip()
html = html.replace(b'<h1>PSN-HUB MANAGER</h1>', b'<h1>PSN-HUB MANAGER</h1><p class=hint><strong>EXPERIMENTAL native engine - port 8087.</strong> Hardware validation pending.</p>')
html = html.replace(b'/data/psn-hub/payloads', b'/data/psn-hub-native/payloads')
# The experimental engine does not register console shortcuts.
html = html.replace(b"const d=await r.json();if(d.preview)", b"const d=await r.json();if(d.capabilities&&d.capabilities.shortcuts===false){installerStatusEl.textContent='Experimental engine: console shortcut registration is unavailable.';return;}if(d.preview)")
out = root / 'native/build'
out.mkdir(parents=True, exist_ok=True)
rows = [','.join(str(v) for v in html[i:i+32]) for i in range(0, len(html), 32)]
(out / 'dashboard.h').write_text('/* Generated; do not edit. */\nstatic const unsigned char dashboard[]={\n'+',\n'.join(rows)+'\n};\nstatic const size_t dashboard_size=sizeof(dashboard);\n', encoding='ascii')
print(f'Generated native dashboard: {len(html)} bytes')
