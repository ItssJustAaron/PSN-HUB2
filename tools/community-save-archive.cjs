const fs = require('node:fs');
const path = require('node:path');

const repository = 'ItssJustAaron/PSN-HUB-Saves';
const releases = 'https://api.github.com/repos/' + repository + '/releases';

function createArchive(token, request = fetch) {
  const github = async (url, options = {}, missingOK = false) => {
    const result = await request(url, {
      ...options,
      redirect: 'error',
      signal: AbortSignal.timeout(options.body instanceof fs.ReadStream ? 600000 : 60000),
      headers: {Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', ...options.headers}
    });
    if (missingOK && result.status === 404) return null;
    if (!result.ok) throw new Error('GitHub archive request failed (HTTP ' + result.status + ').');
    return result.status === 204 ? null : result.json();
  };
  const json = (method, data) => ({method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data)});
  const tag = item => 'save-' + item.id;
  async function find(item) {
    const published = await github(releases + '/tags/' + tag(item), {}, true);
    if (published) return published;
    // Drafts do not have public tag URLs. Reuse a draft left by an interrupted upload.
    for (let page = 1;; page++) {
      const batch = await github(releases + '?per_page=100&page=' + page);
      const draft = batch.find(release => release.draft && release.tag_name === tag(item));
      if (draft || batch.length < 100) return draft;
    }
  }
  return {
    async publish(item, folder) {
      let release = await find(item);
      if (release && !release.draft) return;
      const keyBytes = item.platform === 'ps4' ? 96 : 0;
      const filename = path.join(folder, 'save.bin');
      const summary = item.description.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/@/g, '&#64;').replace(/[\\`*_\[\]()!]/g, '\\$&');
      if (!release) release = await github(releases, json('POST', {
        tag_name: tag(item),
        name: item.platform.toUpperCase() + ' · ' + item.title,
        body: summary + '\n\nOriginal package SHA-256: `' + item.sha256 + '`',
        draft: true
      }));
      const upload = async (name, start, end) => {
        const bytes = end - start + 1;
        const existing = release.assets.find(asset => asset.name === name);
        if (existing?.state === 'uploaded' && existing.size === bytes) return;
        if (existing) await github(releases + '/assets/' + existing.id, {method: 'DELETE'}, true);
        const uploadURL = 'https://uploads.github.com/repos/' + repository + '/releases/' + release.id + '/assets?name=' + name;
        const body = fs.createReadStream(filename, {start, end});
        try {
          const asset = await github(uploadURL, {method: 'POST', duplex: 'half', body,
            headers: {'Content-Type': 'application/octet-stream', 'Content-Length': String(bytes)}});
          if (asset.state !== 'uploaded' || asset.size !== bytes) throw new Error('GitHub did not confirm the complete save file.');
        } finally {body.destroy();}
      };
      await upload(item.title + '-image.bin', keyBytes, item.bytes - 1);
      if (keyBytes) await upload(item.title + '-key.bin', 0, keyBytes - 1);
      await github(releases + '/' + release.id, json('PATCH', {draft: false, make_latest: 'false'}));
    },
    async withdraw(item) {
      const release = await find(item);
      if (release) await github(releases + '/' + release.id, {method: 'DELETE'}, true);
    }
  };
}

module.exports = {createArchive};
