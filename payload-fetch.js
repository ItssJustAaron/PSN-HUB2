/* Prefer the published Manager build; retain explicit offline-cache fallback. */
(function () {
  'use strict';
  async function request(url) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(url, {cache:'no-store',signal:controller.signal});
      if (!response.ok) throw new Error('HTTP '+response.status);
      return await response.arrayBuffer();
    } finally { clearTimeout(timer); }
  }
  window.fetchPayloadFile = async function (filename) {
    if (!/^[A-Za-z0-9._-]+\.(elf|bin)$/i.test(filename)) throw new Error('Invalid payload filename');
    if (filename !== 'PSN-HUB-Manager.elf') {
      const response = await fetch('payloads/'+filename);
      if (!response.ok) throw new Error('Payload HTTP '+response.status);
      return response.arrayBuffer();
    }
    let metadata;
    try { metadata = JSON.parse(new TextDecoder().decode(await request('Manager/build.json?check='+Date.now()))); }
    catch (_) {
      window.__managerPayloadSource = 'Offline/fallback Manager — build unverified; cached copy may be older';
      if (window.__rep) window.__rep('MANAGER-OFFLINE',window.__managerPayloadSource);
      const cached = await fetch('payloads/'+filename);
      if (!cached.ok) throw new Error('No cached Manager is available. Reconnect and update the site.');
      return cached.arrayBuffer();
    }
    if (!metadata || !/^[a-f0-9]{64}$/.test(metadata.elfSha256) || !Number.isInteger(metadata.elfBytes) || metadata.elfBytes < 64) throw new Error('Published Manager metadata is invalid. Upload the matching build files.');
    const data = await request('payloads/'+filename+'?build='+metadata.elfSha256);
    if (data.byteLength !== metadata.elfBytes) throw new Error('Published Manager size mismatch. Upload the matching ELF.');
    const signature = new Uint8Array(data,0,4);
    if (signature[0]!==127 || signature[1]!==69 || signature[2]!==76 || signature[3]!==70) throw new Error('Published Manager is not an ELF payload.');
    if (typeof crypto!=='undefined' && crypto.subtle) {
      const digest = await crypto.subtle.digest('SHA-256',data);
      const hash = Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
      if (hash!==metadata.elfSha256) throw new Error('Published Manager checksum mismatch. Upload the matching build files.');
    }
    window.__managerPayloadSource = 'Published Manager build '+metadata.buildId;
    if (window.__rep) window.__rep('MANAGER-ONLINE',window.__managerPayloadSource);
    return data;
  };
})();
