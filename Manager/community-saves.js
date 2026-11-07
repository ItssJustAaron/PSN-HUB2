(function (root) {
  'use strict';
  const limit = 256 * 1024 ** 2;
  const validTitle = (title, platform) => platform === 'ps4' ? /^CUSA\d{5}$/.test(title) : platform === 'ps5' && /^PPSA\d{5}$/.test(title);

  function libraryURL(value) {
    const url = new URL(value.trim());
    const privateHost = /^(?:localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(url.hostname);
    if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && privateHost)) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
      throw Error('Enter the HTTPS library address, or a private LAN address for testing.');
    }
    return url.origin;
  }

  async function readPackage(response, item) {
    if (Number(response.headers.get('Content-Length')) !== item.bytes) throw Error('The download size does not match the listing.');
    const reader = response.body.getReader();
    const chunks = [];
    let bytes = 0;
    try {
      for (;;) {
        const {done, value} = await reader.read();
        if (done) break;
        bytes += value.length;
        if (bytes > item.bytes) throw Error('The download exceeded its listed size.');
        chunks.push(value);
      }
    } finally {
      if (bytes !== item.bytes) await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
    if (bytes !== item.bytes) throw Error('The save download was incomplete.');
    const blob = new Blob(chunks);
    if (root.crypto?.subtle) {
      const digest = await root.crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
      const actual = Array.from(new Uint8Array(digest), x => x.toString(16).padStart(2, '0')).join('');
      if (actual !== item.sha256) throw Error('The download checksum did not match the listing.');
    }
    return blob;
  }

  function mount({container, element, action, gameHeading, selectShared}) {
    const status = element('p', 'Enter your private library address and access code.', 'hint');
    status.setAttribute('role', 'status');
    const field = (label, node, parent = container) => {
      const wrapper = element('label', label);
      wrapper.append(node);
      parent.append(wrapper);
      return node;
    };
    const address = field('Library address', element('input'));
    address.type = 'url';
    address.placeholder = 'https://saves.example.org';
    const code = field('Access or review code', element('input'));
    code.type = 'password';
    code.autocomplete = 'off';
    const list = element('div');
    for (const input of [address, code]) input.addEventListener('input', () => {
      list.replaceChildren();
      status.textContent = 'Refresh to connect with the new library details.';
    });
    const form = element('details');
    form.append(element('summary', 'Submit a save for review'));
    const platform = field('Platform', element('select'), form);
    for (const value of ['ps5', 'ps4']) {
      const option = element('option', value.toUpperCase());
      option.value = value;
      platform.append(option);
    }
    const title = field('Title ID', element('input'), form);
    title.type = 'text';
    title.maxLength = 9;
    const description = field('Description (optional)', element('input'), form);
    description.type = 'text';
    description.maxLength = 240;
    const image = field('Encrypted save image', element('input'), form);
    image.type = 'file';
    const key = field('PS4 companion key (.bin)', element('input'), form);
    key.type = 'file';
    key.accept = '.bin';
    const consent = element('input');
    consent.type = 'checkbox';
    field('I am sharing this save with reviewers and approved library members. The file may contain account metadata.', consent, form);
    const updateKey = () => {key.parentNode.hidden = platform.value !== 'ps4';};
    platform.addEventListener('change', updateKey);
    updateKey();

    let busy = false;
    const run = async fn => {
      if (busy) return;
      busy = true;
      container.setAttribute('aria-busy', 'true');
      try {await fn();} catch (error) {status.textContent = error.message;} finally {
        busy = false;
        container.setAttribute('aria-busy', 'false');
      }
    };
    const connection = () => {
      const origin = libraryURL(address.value);
      const token = code.value.trim();
      if (!/^[\x21-\x7e]{24,128}$/.test(token)) throw Error('Enter the library access code.');
      return async (route, {method = 'GET', body, read = response => response.json()} = {}) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 300000);
        try {
          const response = await fetch(origin + route, {method, body, cache: 'no-store', credentials: 'omit', redirect: 'error',
            headers: {Authorization: 'Bearer ' + token, ...(body ? {'Content-Type': 'application/octet-stream'} : {})}, signal: controller.signal});
          if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw Error(error.error || 'Library HTTP ' + response.status);
          }
          return await read(response);
        } finally {clearTimeout(timeout);}
      };
    };
    const routeFor = (item, operation) => '/v1/saves/' + item.id + '/' + operation;
    async function refresh() {
      list.replaceChildren();
      const enteredAddress = address.value;
      const enteredCode = code.value;
      const request = connection();
      const data = await request('/v1/saves');
      if (address.value !== enteredAddress || code.value !== enteredCode) return;
      if (!Array.isArray(data.items) || data.items.length > 40) throw Error('Invalid library listing.');
      list.replaceChildren();
      for (const item of data.items) {
        const keyBytes = item.platform === 'ps4' ? 96 : 0;
        if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(item.id) || !validTitle(item.title, item.platform) ||
            !Number.isSafeInteger(item.bytes) || item.bytes <= keyBytes || item.bytes > limit || !/^[a-f0-9]{64}$/.test(item.sha256) ||
            typeof item.approved !== 'boolean' || typeof item.description !== 'string' || item.description.length > 240) continue;
        const row = element('section', undefined, 'card');
        row.append(gameHeading(item.title, item.platform.toUpperCase() + ' · ' + item.title));
        if (item.description) row.append(element('p', item.description));
        const download = () => request(routeFor(item, 'download'), {read: response => readPackage(response, item)});
        if (item.approved) {
          row.append(action('Install & resign', () => run(() => selectShared({title: item.title, platform: item.platform, async download() {
            const packageFile = await download();
            return {image: packageFile.slice(keyBytes), key: keyBytes ? packageFile.slice(0, keyBytes) : undefined};
          }}))));
        }
        if (data.reviewer) {
          row.append(element('p', item.approved ? 'Approved' : 'Pending review', 'hint'));
          row.append(action('Download for review', () => run(async () => {
            const packageFile = await download();
            const reviewFiles = [[item.title + '-image.bin', packageFile.slice(keyBytes)]];
            if (keyBytes) reviewFiles.push([item.title + '-key.bin', packageFile.slice(0, keyBytes)]);
            for (const [name, file] of reviewFiles) {
              const link = element('a', 'Download ' + name);
              link.href = URL.createObjectURL(file);
              link.download = name;
              row.append(link);
              setTimeout(() => URL.revokeObjectURL(link.href), 120000);
            }
          }), 'secondary'));
          row.append(action(item.approved ? 'Withdraw' : 'Approve reviewed save', () => run(async () => {
            if (!root.confirm(item.approved ? 'Withdraw this save from the library?' : 'Approve this reviewed save for library members?')) return;
            await request(routeFor(item, item.approved ? 'withdraw' : 'approve'), {method: 'POST'});
            await refresh();
          }), 'secondary'));
        }
        list.append(row);
      }
      status.textContent = list.children.length ? 'Community library loaded.' : 'No saves available. Submissions appear after review.';
    }
    form.append(action('Submit for review', () => run(async () => {
      const id = title.value.trim().toUpperCase();
      const save = image.files[0];
      const companion = platform.value === 'ps4' ? key.files[0] : null;
      if (!consent.checked || !validTitle(id, platform.value) || !save?.size || (platform.value === 'ps4' && companion?.size !== 96)) {
        throw Error('Choose a matching title ID, save image, PS4 companion key if needed, and agree to share.');
      }
      const packageFile = new Blob(companion ? [companion, save] : [save]);
      if (packageFile.size > limit) throw Error('Community save packages are limited to 256 MiB.');
      const query = new URLSearchParams({platform: platform.value, title: id, description: description.value.trim()});
      await connection()('/v1/saves?' + query, {method: 'POST', body: packageFile});
      image.value = '';key.value = '';consent.checked = false;
      status.textContent = 'Submitted privately. A reviewer must approve it before others can download it.';
    })));
    container.append(action('Refresh community library', () => run(refresh), 'secondary'), status, form, list);
  }
  root.PSNCommunitySaves = {mount};
})(window);
