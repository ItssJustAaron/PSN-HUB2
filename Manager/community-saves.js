(function (root) {
  'use strict';
  const limit = 256 * 1024 ** 2;
  const largeLimit = 1024 ** 3;
  const githubLimit = 24_900_000;
  const partBytes = 24_000_000;
  const slotsPerZip = 128;
  const githubRepo = 'https://github.com/ItssJustAaron/PSN-HUB-Saves';
  const githubFiles = 'https://raw.githubusercontent.com/ItssJustAaron/PSN-HUB-Saves/main/';
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
    const length = response.headers.get('Content-Length');
    if (length && !response.headers.get('Content-Encoding') && Number(length) !== item.bytes) {
      throw Error('The download size does not match the listing.');
    }
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

  function mount({container, element, action, gameHeading, selectShared, libraryOrigin, largeUploadOrigin, consoleSaves, makeZip}) {
    const github = !!makeZip && !libraryOrigin;
    const status = element('p', github ? 'Loading public saves…' : 'Enter the Community Saves library address to browse or submit a save.', 'hint');
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
    if (libraryOrigin) {
      address.value = libraryOrigin;
      address.parentNode.hidden = true;
    }
    if (github) address.parentNode.hidden = true;
    const review = element('details');
    review.append(element('summary', 'Reviewer access'));
    const code = field('Reviewer code', element('input'), review);
    code.type = 'password';
    code.autocomplete = 'off';
    const list = element('div');
    for (const input of [address, code]) input.addEventListener('input', () => {
      list.replaceChildren();
      status.textContent = 'Refresh to connect with the new library details.';
    });
    const form = element('details');
    form.append(element('summary', 'Upload a save'));
    const platform = field('Platform', element('select'), form);
    for (const value of ['ps5', 'ps4']) {
      const option = element('option', value.toUpperCase());
      option.value = value;
      platform.append(option);
    }
    const title = field('Title ID', element('input'), form);
    title.type = 'text';
    title.maxLength = 9;
    const description = field('Description (required)', element('input'), form);
    description.type = 'text';
    description.required = true;
    description.maxLength = 240;
    const image = field('Encrypted save image', element('input'), form);
    image.type = 'file';
    const key = field('PS4 companion key (.bin)', element('input'), form);
    key.type = 'file';
    key.accept = '.bin';
    let consoleTitle, consoleImage, consoleEntries = [], consoleFiles = [];
    if (consoleSaves) {
      const picker = element('details');
      picker.append(element('summary', 'Choose a save on this PS5'));
      picker.append(element('p', 'Close the game before sharing its save.', 'hint'));
      consoleTitle = field('Console game and user', element('select'), picker);
      consoleImage = field('Console save file', element('select'), picker);
      const placeholder = (select, label) => {
        const option = element('option', label);
        option.value = '';
        select.replaceChildren(option);
      };
      const appendOption = (select, label, value) => {
        const option = element('option', label);
        option.value = String(value);
        select.append(option);
      };
      placeholder(consoleTitle, 'Upload a file from this device');
      placeholder(consoleImage, 'Choose a console save file');
      picker.append(action('Load console saves', () => run(async () => {
        const data = await consoleSaves.list();
        consoleEntries = data.items;
        placeholder(consoleTitle, 'Upload a file from this device');
        placeholder(consoleImage, 'Choose a console save file');
        consoleEntries.forEach((entry, index) => appendOption(consoleTitle,
          (entry.name || entry.title) + ' · ' + entry.platform.toUpperCase() + ' · User ' + entry.user, index));
        status.textContent = consoleEntries.length ? 'Choose a game and save file.' : 'No console saves were found.';
      }), 'secondary'));
      consoleTitle.addEventListener('change', () => run(async () => {
        placeholder(consoleImage, 'Choose a console save file');
        consoleFiles = [];
        if (!consoleTitle.value) return;
        const entry = consoleEntries[Number(consoleTitle.value)];
        platform.value = entry.platform;
        title.value = entry.title;
        updateKey();
        consoleFiles = (await consoleSaves.files(entry)).items;
        if (github && consoleFiles.some(file => entry.platform === 'ps5' || file.name.startsWith('sdimg_'))) {
          appendOption(consoleImage, 'All saves for this game', 'all');
        }
        consoleFiles.forEach((file, index) => {
          if (entry.platform === 'ps5' || file.name.startsWith('sdimg_')) appendOption(consoleImage, file.name, index);
        });
      }));
      form.append(picker);
    }
    const consent = element('input');
    consent.type = 'checkbox';
    if (!github || largeUploadOrigin) field('I agree to publish this save for anyone to download. The file may contain account metadata.', consent, form);
    let pendingUpload;
    const zipLinks = element('div');
    const updateKey = () => {key.parentNode.hidden = platform.value !== 'ps4';};
    platform.addEventListener('change', updateKey);
    updateKey();

    let busy = false;
    const run = async fn => {
      if (busy) return;
      busy = true;
      if (consoleTitle) consoleTitle.disabled = consoleImage.disabled = true;
      container.setAttribute('aria-busy', 'true');
      try {await fn();} catch (error) {status.textContent = error.message;} finally {
        busy = false;
        if (consoleTitle) consoleTitle.disabled = consoleImage.disabled = false;
        container.setAttribute('aria-busy', 'false');
      }
    };
    const connection = (endpoint = address.value) => {
      const origin = libraryURL(endpoint);
      const token = code.value.trim();
      if (token && !/^[\x21-\x7e]{24,128}$/.test(token)) throw Error('Enter a valid reviewer code or leave it blank.');
      return async (route, {method = 'GET', body, read = response => response.json()} = {}) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), route.endsWith('/finish') ? 720000 : 300000);
        try {
          const response = await fetch(origin + route, {method, body, cache: 'no-store', credentials: 'omit', redirect: 'error',
            headers: {...(token ? {Authorization: 'Bearer ' + token} : {}), ...(body ? {'Content-Type': 'application/octet-stream'} : {})}, signal: controller.signal});
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
      if (github) {
        const result = await fetch(githubFiles + 'catalog.json', {cache: 'no-store'});
        if (!result.ok) throw Error('Could not load the GitHub save catalogue.');
        const data = await result.json();
        if (data.schemaVersion !== 1 || !Array.isArray(data.items) || data.items.length > 40 * slotsPerZip) throw Error('Invalid GitHub save catalogue.');
        for (const item of data.items) {
          const keyBytes = item.platform === 'ps4' ? 96 : 0;
          const release = typeof item.release === 'string' && item.release === 'issue-' + item.issue + '-' + item.sha256;
          if (!Number.isSafeInteger(item.issue) || item.issue < 1 || !validTitle(item.title, item.platform) ||
              !Number.isSafeInteger(item.bytes) || item.bytes <= keyBytes || item.bytes > (release ? largeLimit : 25_000_000) ||
              !/^[a-f0-9]{64}$/.test(item.sha256) || typeof item.description !== 'string' || item.description.length > 240 ||
              (item.slot !== undefined && (!Number.isInteger(item.slot) || item.slot < 1 || item.slot > slotsPerZip ||
                typeof item.slotName !== 'string' || item.slotName.length > 256))) continue;
          const filename = item.issue + (item.slot === undefined ? '' : '-' + item.slot) + '.bin';
          const row = element('section', undefined, 'card');
          row.append(gameHeading(item.title, item.platform.toUpperCase() + ' · ' + item.title), element('p', item.description));
          if (item.slotName) row.append(element('p', item.slotName, 'hint'));
          if (release) {
            const download = element('a', 'Download save from GitHub');
            download.href = githubRepo + '/releases/download/' + item.release + '/save.bin';
            const file = field('Select the downloaded save to resign', element('input'), row);
            file.type = 'file';
            file.accept = '.bin';
            row.append(action('Install & resign', () => run(() => {
              const blob = file.files[0];
              if (!blob || blob.size !== item.bytes) throw Error('Select the complete save downloaded from GitHub.');
              return selectShared({title: item.title, platform: item.platform, async download() {
                return {image: blob.slice(keyBytes), key: keyBytes ? blob.slice(0, keyBytes) : undefined};
              }});
            })));
            row.prepend(download);
            list.append(row);
            continue;
          }
          row.append(action('Install & resign', () => run(() => selectShared({
            title: item.title, platform: item.platform,
            async download() {
              const response = await fetch(githubFiles + 'saves/' + filename, {cache: 'no-store'});
              if (!response.ok) throw Error('This save is unavailable on GitHub.');
              const blob = await readPackage(response, item);
              return {image: blob.slice(keyBytes), key: keyBytes ? blob.slice(0, keyBytes) : undefined};
            }
          }))));
          list.append(row);
        }
        if (!largeUploadOrigin) {
          status.textContent = list.children.length ? 'GitHub saves loaded.' : 'No public save submissions yet.';
          return;
        }
      }
      const enteredAddress = address.value;
      const enteredCode = code.value;
      const request = connection(largeUploadOrigin || address.value);
      const data = await request('/v1/saves').catch(error => {
        if (!github) throw error;
        status.textContent = 'Large-save library unavailable. GitHub ZIP submissions are still available.';
        return null;
      });
      if (!data) return;
      if (address.value !== enteredAddress || code.value !== enteredCode) return;
      if (!Array.isArray(data.items) || data.items.length > 40) throw Error('Invalid library listing.');
      if (!github) list.replaceChildren();
      for (const item of data.items) {
        const keyBytes = item.platform === 'ps4' ? 96 : 0;
        if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(item.id) || !validTitle(item.title, item.platform) ||
            !Number.isSafeInteger(item.bytes) || item.bytes <= keyBytes || item.bytes > (item.resumable === true ? largeLimit : limit) || !/^[a-f0-9]{64}$/.test(item.sha256) ||
            typeof item.approved !== 'boolean' || typeof item.description !== 'string' || item.description.length > 240) continue;
        const row = element('section', undefined, 'card');
        row.append(gameHeading(item.title, item.platform.toUpperCase() + ' · ' + item.title));
        if (item.description) row.append(element('p', item.description));
        if (item.resumable === true) {
          const release = element('a', 'Download from GitHub');
          release.href = githubRepo + '/releases/tag/save-' + item.id;
          release.target = '_blank';
          release.rel = 'noopener';
          row.append(release);
        }
        const download = () => request(routeFor(item, 'download'), {read: response => readPackage(response, item)});
        if (item.approved && selectShared) {
          row.append(action('Install & resign', () => run(() => selectShared({title: item.title, platform: item.platform, async download() {
            const packageFile = await download();
            return {image: packageFile.slice(keyBytes), key: keyBytes ? packageFile.slice(0, keyBytes) : undefined};
          }}))));
        }
        if (data.reviewer) {
          row.append(element('p', item.approved ? 'Published in this library' : 'Awaiting publication', 'hint'));
        }
        if (data.reviewer || (item.approved && !selectShared)) {
          row.append(action(data.reviewer ? 'Download for review' : 'Download save files', () => run(async () => {
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
        }
        if (data.reviewer) {
          row.append(action(item.approved ? 'Withdraw' : 'Publish save', () => run(async () => {
            if (!root.confirm(item.approved ? 'Withdraw this save from the library?' : 'Publish this save for everyone?')) return;
            const result = await request(routeFor(item, item.approved ? 'withdraw' : 'approve'), {method: 'POST'});
            await refresh();
            if (result.approved) status.textContent = result.archived
              ? 'Approved and published to GitHub.' : 'Approved in this library. GitHub publishing is not configured.';
          }), 'secondary'));
        }
        list.append(row);
      }
      status.textContent = list.children.length ? 'Community library loaded.' : 'No saves available yet.';
    }
    form.append(action(github && !largeUploadOrigin ? 'Prepare ZIP for GitHub' : 'Upload or prepare ZIP', () => run(async () => {
      const entry = consoleTitle?.value ? consoleEntries[Number(consoleTitle.value)] : null;
      const selectedPlatform = entry?.platform || platform.value;
      const id = entry?.title || title.value.trim().toUpperCase();
      const summary = description.value.trim();
      const all = github && entry && consoleImage.value === 'all';
      if (!summary || summary.length > 240 || /[\x00-\x1f\x7f]/.test(summary)) {
        description.focus();
        throw Error('Enter a description between 1 and 240 characters on one line.');
      }
      const chosen = all ? consoleFiles.filter(file => selectedPlatform === 'ps5' || file.name.startsWith('sdimg_'))
        : [entry ? consoleFiles[Number.parseInt(consoleImage.value, 10)] : image.files[0]];
      const saves = chosen.map(save => ({save, companion: selectedPlatform !== 'ps4' ? null : entry
        ? consoleFiles.find(file => file.name === save?.name.replace(/^sdimg_/, '') + '.bin') : key.files[0]}));
      if ((!github && !consent.checked) || !validTitle(id, selectedPlatform) || !saves.length) {
        throw Error(github ? 'Choose a matching title ID, save image, and PS4 companion key if needed.'
          : 'Choose a matching title ID, save image, PS4 companion key if needed, and agree to share.');
      }
      let large = false;
      for (const {save, companion} of saves) {
        if (!save?.size || (selectedPlatform === 'ps4' && companion?.size !== 96)) {
          throw Error(save?.name ? 'Missing save data or a matching PS4 key for ' + save.name + '.'
            : 'Choose a save image and its PS4 companion key if needed.');
        }
        const bytes = save.size + (companion?.size || 0);
        if (github && bytes > githubLimit) {
          if (all) throw Error(save.name + ' needs a large upload. Select that slot individually.');
          if (bytes > largeLimit) throw Error(save.name + ' exceeds the 1 GiB upload limit.');
          if (largeUploadOrigin && !consent.checked) throw Error('Agree to share the save publicly before uploading.');
          large = true;
        }
        if (!github && bytes > limit) throw Error('Community save packages are limited to 256 MiB.');
      }
      const request = github ? null : connection();
      status.textContent = 'Preparing and uploading the save…';
      const read = async file => {
        if (!entry) return file;
        const blob = await consoleSaves.download(entry, file.name);
        if (blob.size !== file.size) throw Error('The console save changed. Close the game and load the save list again.');
        return blob;
      };
      if (large && largeUploadOrigin) {
        const [{save, companion}] = saves;
        const request = connection(largeUploadOrigin);
        const metadata = new URLSearchParams({platform: selectedPlatform, title: id, description: summary,
          consent: 'public', bytes: String(save.size + (companion?.size || 0))});
        const signature = metadata.toString();
        if (!pendingUpload || pendingUpload.signature !== signature || pendingUpload.entry !== entry ||
            pendingUpload.save !== save || pendingUpload.companion !== companion) {
          status.textContent = 'Reading the save from ' + (entry ? 'the console' : 'this device') + '…';
          const body = new Blob(companion ? [await read(companion), await read(save)] : [await read(save)]);
          const hex = Array.from(root.crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
          const session = hex.replace(/^(........)(....)(....)(....)(............)$/, '$1-$2-$3-$4-$5');
          pendingUpload = {signature, entry, save, companion, body, session};
        }
        const {body, session} = pendingUpload;
        const route = '/v1/uploads/' + session;
        metadata.set('id', session);
        try {
          const {chunkBytes} = await request('/v1/uploads?' + metadata, {method: 'POST'});
          let {offset} = await request(route);
          if (!Number.isSafeInteger(chunkBytes) || chunkBytes <= 0 || chunkBytes > 8 * 1024 ** 2 ||
              !Number.isSafeInteger(offset) || offset < 0 || offset > body.size) throw Error('Invalid upload position.');
          while (offset < body.size) {
            status.textContent = 'Uploading to Community Saves… ' + Math.floor(offset * 100 / body.size) + '%';
            const end = Math.min(offset + chunkBytes, body.size);
            const result = await request(route + '?offset=' + offset, {method: 'POST', body: body.slice(offset, end)});
            if (result.offset !== end) throw Error('The server did not confirm the uploaded chunk.');
            offset = end;
          }
          status.textContent = 'Upload complete. Publishing to GitHub…';
          const result = await request(route + '/finish', {method: 'POST'});
          if (!result.archived) throw Error('GitHub publication was not confirmed.');
        } catch (error) {
          throw Error(error.message + ' Select Upload or prepare ZIP again to retry.');
        }
        pendingUpload = undefined;
        consent.checked = false;
        await refresh().catch(() => {});
        status.textContent = 'Published to Community Saves and GitHub.';
        return;
      }
      if (github) {
        for (const link of zipLinks.querySelectorAll('a[download]')) URL.revokeObjectURL(link.href);
        zipLinks.replaceChildren();
        if (large) {
          const [{save, companion}] = saves;
          status.textContent = 'Reading the save…';
          const body = new Blob(companion ? [await read(companion), await read(save)] : [await read(save)]);
          const count = Math.ceil(body.size / partBytes);
          const upload = Array.from(root.crypto.getRandomValues(new Uint8Array(16)),
            byte => byte.toString(16).padStart(2, '0')).join('');
          const submit = element('a', 'Open one GitHub submission for all ' + count + ' parts');
          submit.href = githubRepo + '/issues/new?' + new URLSearchParams({template: 'save.yml',
            title: '[Save] ' + id, 'title-id': id, description: summary});
          submit.target = '_blank';
          submit.rel = 'noopener';
          zipLinks.append(element('p', 'Download all ' + count + ' numbered ZIPs and attach them to the same GitHub submission.'), submit);
          for (let index = 0; index < count; index++) {
            const row = element('p');
            const link = element('a', 'Download part ' + (index + 1) + ' of ' + count);
            link.download = id + '-part-' + String(index + 1).padStart(2, '0') + '.zip';
            link.href = '#';
            let preparing = false;
            link.addEventListener('click', async event => {
              if (link.getAttribute('href') !== '#') return;
              event.preventDefault();
              if (preparing) return;
              preparing = true;
              try {
                const part = body.slice(index * partBytes, (index + 1) * partBytes);
                const manifest = {upload, index, count, bytes: body.size, title: id};
                const zip = await makeZip({'part.bin': new Uint8Array(await part.arrayBuffer()),
                  'manifest.json': new TextEncoder().encode(JSON.stringify(manifest))});
                if (!link.isConnected) return;
                const url = URL.createObjectURL(zip);
                link.href = url;
                link.click();
                setTimeout(() => {
                  URL.revokeObjectURL(url);
                  if (link.href === url) link.href = '#';
                }, 60000);
              } catch (error) {status.textContent = error.message;}
              finally {preparing = false;}
            });
            row.append(link);
            zipLinks.append(row);
          }
          status.textContent = count + ' download links ready. Attach every part before submitting.';
          return;
        }
        const batches = [[]];
        let batch = batches[0];
        let bytes = 0;
        for (const item of saves) {
          const size = item.save.size + (item.companion?.size || 0) + 1024;
          if (bytes && (bytes + size > githubLimit || batch.length === slotsPerZip)) {
            batch = [];
            batches.push(batch);
            bytes = 0;
          }
          batch.push(item);
          bytes += size;
        }
        let prepared = 0;
        const links = document.createDocumentFragment();
        const urls = [];
        try {
          for (const [batchIndex, batch] of batches.entries()) {
            const parts = {};
            for (const [slot, {save, companion}] of batch.entries()) {
              status.textContent = 'Preparing save ' + (++prepared) + ' of ' + saves.length + '…';
              const prefix = all ? 'slots/' + (slot + 1) + '/' : '';
              parts[prefix + 'image.bin'] = new Uint8Array(await (await read(save)).arrayBuffer());
              if (companion) parts[prefix + 'key.bin'] = new Uint8Array(await (await read(companion)).arrayBuffer());
              if (all) parts[prefix + 'name.txt'] = new TextEncoder().encode(save.name);
            }
            const zip = await makeZip(parts);
            if (zip.size > 25_000_000) throw Error('A prepared ZIP exceeds GitHub’s 25 MB limit.');
            const part = batches.length > 1 ? ' (' + (batchIndex + 1) + ' of ' + batches.length + ')' : '';
            const link = element('a', 'Download ' + id + ' save ZIP' + part);
            link.href = URL.createObjectURL(zip);
            urls.push(link.href);
            link.download = id + '-save' + (part ? '-' + (batchIndex + 1) : '') + '.zip';
            const submit = element('a', 'Open GitHub upload form' + part);
            submit.href = githubRepo + '/issues/new?' + new URLSearchParams({template: 'save.yml', title: '[Save] ' + id + part, 'title-id': id, description: summary});
            submit.target = '_blank';
            submit.rel = 'noopener';
            const row = element('p');
            row.append(link, ' · ', submit);
            links.append(row);
          }
        } catch (error) {
          urls.forEach(url => URL.revokeObjectURL(url));
          throw error;
        }
        zipLinks.replaceChildren(element('p', 'Download each ZIP and attach it to its own GitHub submission.'), links);
        status.textContent = saves.length + (saves.length === 1 ? ' save ready' : ' saves ready') + ' for GitHub.';
        return;
      }
      const [{save, companion}] = saves;
      const packageFile = new Blob(companion ? [await read(companion), await read(save)] : [await read(save)]);
      const query = new URLSearchParams({platform: selectedPlatform, title: id, description: summary, consent: 'public'});
      const result = await request('/v1/saves?' + query, {method: 'POST', body: packageFile});
      image.value = '';key.value = '';description.value = '';consent.checked = false;
      if (result.approved) await refresh().catch(() => {});
      status.textContent = result.archived ? 'Published to the library and GitHub.'
        : result.approved ? 'Published to this library. GitHub publishing is not configured.'
        : 'Upload saved, but publication failed. An administrator can retry it.';
    })), zipLinks);
    const archive = element('a', 'Browse approved saves on GitHub');
    archive.href = githubRepo + (github ? '/issues' : '/releases');
    archive.target = '_blank';
    archive.rel = 'noopener';
    const archiveLink = element('p');
    archiveLink.append(archive);
    container.append(archiveLink);
    if (!github) container.append(review);
    container.append(action('Refresh community library', () => run(refresh), 'secondary'), status, form, list);
    if (libraryOrigin || github) run(refresh);
  }
  root.PSNCommunitySaves = {mount};
})(window);
