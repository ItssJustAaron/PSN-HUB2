/* Public submissions and downloads. Run behind HTTPS when serving beyond the LAN. */
const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const {createHash, randomUUID, timingSafeEqual} = require('node:crypto');
const {Transform} = require('node:stream');
const {pipeline} = require('node:stream/promises');
const {createArchive} = require('./community-save-archive.cjs');

const maxBytes = 256 * 1024 ** 2;
const largeBytes = 1024 ** 3;
const chunkBytes = 8 * 1024 ** 2;
const sessionLifetime = 24 * 60 * 60 * 1000;
const maxEntries = 40;
const idPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const failure = (status, message) => Object.assign(new Error(message), {status});
const publicID = session => createHash('sha256').update(session).digest('hex').slice(0, 32)
  .replace(/^(........)(....)(....)(....)(............)$/, '$1-$2-$3-$4-$5');

function matches(header, token) {
  const actual = Buffer.from(header || '');
  const expected = Buffer.from('Bearer ' + token);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function createServer({directory, adminToken, origins = [], archive}) {
  if (!directory || !path.isAbsolute(directory) || !/^[\x21-\x7e]{24,128}$/.test(adminToken || '')) {
    throw Error('Set an absolute private data directory and a reviewer code of 24–128 printable characters without spaces.');
  }
  await fsp.mkdir(directory, {recursive: true, mode: 0o700});
  let uploading = false;
  const reviewing = new Set();
  const activeSessions = new Set();

  function submission(url, bytes, maximum) {
    const platform = url.searchParams.get('platform');
    const title = url.searchParams.get('title') || '';
    const description = (url.searchParams.get('description') || '').trim();
    if (!description || description.length > 240 || /[\x00-\x1f\x7f]/.test(description)) {
      throw failure(400, 'Enter a description between 1 and 240 characters on one line.');
    }
    if (!((platform === 'ps4' && /^CUSA\d{5}$/.test(title)) || (platform === 'ps5' && /^PPSA\d{5}$/.test(title)))) {
      throw failure(400, 'Invalid title or platform.');
    }
    if (url.searchParams.get('consent') !== 'public') throw failure(400, 'Agree to share the save publicly.');
    if (!Number.isSafeInteger(bytes) || bytes <= (platform === 'ps4' ? 96 : 0) || bytes > maximum) {
      throw failure(400, 'The save size is outside the supported upload range.');
    }
    return {platform, title, description, bytes, submitted: new Date().toISOString(), publicConsent: true};
  }

  async function startSession(url) {
    if (!archive) throw failure(503, 'GitHub publishing is unavailable.');
    const id = url.searchParams.get('id') || '';
    if (!idPattern.test(id)) throw failure(400, 'Invalid upload ID.');
    const item = {...submission(url, Number(url.searchParams.get('bytes')), largeBytes), id: publicID(id), resumable: true};
    if (activeSessions.has('start') || activeSessions.has(id)) throw failure(429, 'Another upload is busy. Retry shortly.');
    activeSessions.add('start');
    activeSessions.add(id);
    try {
      const names = await fsp.readdir(directory);
      let sessions = 0;
      for (const name of names.filter(name => name.startsWith('.resume-') && idPattern.test(name.slice(8)))) {
        const folder = path.join(directory, name);
        const {mtimeMs} = await fsp.stat(folder).catch(error => {
          if (error.code === 'ENOENT') return {};
          throw error;
        });
        if (!mtimeMs) continue;
        if ((name.slice(8) === id || !activeSessions.has(name.slice(8))) && Date.now() - mtimeMs > sessionLifetime) {
          await fsp.rm(folder, {recursive: true, force: true});
        } else sessions++;
      }
      const folder = path.join(directory, '.resume-' + id);
      if (names.includes(item.id) || names.includes('.resume-' + id)) {
        const existing = await fsp.readFile(path.join(names.includes(item.id) ? path.join(directory, item.id) : folder, 'entry.json'), 'utf8')
          .then(JSON.parse).catch(error => {
            if (error.code === 'ENOENT') return null;
            throw error;
          });
        if (existing) {
          if (['title', 'platform', 'description', 'bytes'].some(field => existing[field] !== item[field])) {
            throw failure(409, 'This upload ID is already in use.');
          }
          return {id, chunkBytes};
        }
      }
      if (sessions >= 3 || names.filter(name => idPattern.test(name) || name.startsWith('.incoming-')).length + sessions >= maxEntries) {
        throw failure(507, 'The library has no upload slots available.');
      }
      const disk = await fsp.statfs(directory);
      if (disk.bavail * disk.bsize < item.bytes + 128 * 1024 ** 2) throw failure(507, 'The library is low on disk space.');
      await fsp.mkdir(folder, {mode: 0o700});
      try {
        await fsp.writeFile(path.join(folder, 'save.bin'), '', {mode: 0o600});
        await fsp.writeFile(path.join(folder, 'entry.json'), JSON.stringify(item), {mode: 0o600});
      } catch (error) {
        await fsp.rm(folder, {recursive: true, force: true});
        throw error;
      }
      return {id, chunkBytes};
    } finally {
      activeSessions.delete(id);
      activeSessions.delete('start');
    }
  }

  async function resume(req, url, id, operation) {
    if (!archive) throw failure(503, 'GitHub publishing is unavailable.');
    const publishedID = publicID(id);
    if (activeSessions.has(id) || reviewing.has(publishedID)) throw failure(409, 'This upload is busy. Retry shortly.');
    activeSessions.add(id);
    reviewing.add(publishedID);
    try {
      let folder = path.join(directory, '.resume-' + id);
      let item;
      try {item = JSON.parse(await fsp.readFile(path.join(folder, 'entry.json'), 'utf8'));}
      catch (error) {
        if (error.code !== 'ENOENT') throw error;
        ({folder, item} = await getEntry(publishedID));
      }
      const file = path.join(folder, 'save.bin');
      const {size: offset} = await fsp.stat(file);
      if (req.method === 'GET' && !operation) return {offset};
      if (req.method !== 'POST') throw failure(405, 'Unsupported upload operation.');
      if (!operation && !item.sha256) {
        const length = Number(req.headers['content-length']);
        if (url.searchParams.get('offset') !== String(offset)) throw failure(409, 'Upload offset changed. Retry from the saved position.');
        if (!Number.isSafeInteger(length) || length < 1 || length > chunkBytes || offset + length > item.bytes ||
            req.headers['content-type'] !== 'application/octet-stream') throw failure(400, 'Invalid upload chunk.');
        let received = 0;
        try {
          const fileHandle = await fsp.open(file, 'r+');
          try {
            for await (const chunk of req) {
              if (received + chunk.length > length) throw failure(400, 'Upload chunk exceeded its declared size.');
              let written = 0;
              while (written < chunk.length) {
                const result = await fileHandle.write(chunk, written, chunk.length - written, offset + received + written);
                if (!result.bytesWritten) throw Error('Could not write the save chunk.');
                written += result.bytesWritten;
              }
              received += written;
            }
            if (received !== length) throw failure(400, 'Upload chunk was incomplete.');
          } finally {await fileHandle.close();}
        } catch (error) {
          await fsp.truncate(file, offset);
          throw error;
        }
        const now = new Date();
        await fsp.utimes(folder, now, now);
        return {offset: offset + received};
      }
      if (operation !== 'finish' || offset !== item.bytes) throw failure(409, 'Upload is incomplete.');
      if (!item.sha256) {
        const hash = createHash('sha256');
        for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
        item.sha256 = hash.digest('hex');
        await fsp.writeFile(path.join(folder, 'entry.tmp'), JSON.stringify(item), {mode: 0o600});
        await fsp.rename(path.join(folder, 'entry.tmp'), path.join(folder, 'entry.json'));
      }
      if (folder === path.join(directory, '.resume-' + id)) {
        const destination = path.join(directory, publishedID);
        await fsp.rename(folder, destination);
        folder = destination;
      }
      if (!item.approved) {
        if (await fsp.access(path.join(folder, 'withdrawn')).then(() => true, error => {
          if (error.code === 'ENOENT') return false;
          throw error;
        })) throw failure(410, 'This save was withdrawn.');
        try {await approve(item, folder);}
        catch (error) {
          console.error('Could not publish upload ' + id + ': ' + error.message);
          throw failure(502, 'GitHub publication failed. Retry to publish the saved upload.');
        }
      }
      return {...item, approved: true, archived: true};
    } finally {
      reviewing.delete(publishedID);
      activeSessions.delete(id);
    }
  }

  async function approve(item, folder) {
    if (archive) {
      if (!item.publicConsent) throw failure(409, 'This save must be resubmitted with public-sharing consent.');
      await archive.publish(item, folder);
    }
    await fsp.writeFile(path.join(folder, 'approved'), '', {flag: 'a', mode: 0o600});
  }

  async function getEntry(id) {
    if (!idPattern.test(id)) throw failure(404, 'Save unavailable.');
    const folder = path.join(directory, id);
    try {
      const item = JSON.parse(await fsp.readFile(path.join(folder, 'entry.json'), 'utf8'));
      const approved = await fsp.access(path.join(folder, 'approved')).then(() => true, error => {
        if (error.code === 'ENOENT') return false;
        throw error;
      });
      return {folder, item: {...item, approved}};
    } catch (error) {
      if (error.code === 'ENOENT') throw failure(404, 'Save unavailable.');
      throw error;
    }
  }

  async function upload(req, url) {
    if (uploading) throw failure(429, 'Another upload is in progress.');
    uploading = true;
    let staging;
    try {
      const bytes = Number(req.headers['content-length']);
      const metadata = submission(url, bytes, maxBytes);
      if (req.headers['content-type'] !== 'application/octet-stream') {
        throw failure(400, 'A raw save package of up to 256 MiB with a known size is required.');
      }
      if ((await fsp.readdir(directory)).filter(id => idPattern.test(id) || id.startsWith('.incoming-') || id.startsWith('.resume-')).length >= maxEntries) {
        throw failure(507, 'The library is full.');
      }
      const id = randomUUID();
      staging = await fsp.mkdtemp(path.join(directory, '.incoming-'));
      const hash = createHash('sha256');
      let received = 0;
      const meter = new Transform({transform(chunk, encoding, done) {
        received += chunk.length;
        if (received > bytes) return done(failure(400, 'Upload exceeded its declared size.'));
        hash.update(chunk);
        done(null, chunk);
      }});
      await pipeline(req, meter, fs.createWriteStream(path.join(staging, 'save.bin'), {flags: 'wx', mode: 0o600}));
      if (received !== bytes) throw failure(400, 'Upload was incomplete.');
      const entry = {id, ...metadata, sha256: hash.digest('hex')};
      await fsp.writeFile(path.join(staging, 'entry.json'), JSON.stringify(entry), {mode: 0o600});
      const folder = path.join(directory, id);
      reviewing.add(id);
      try {
        await fsp.rename(staging, folder);
        staging = undefined;
        try {
          await approve(entry, folder);
          return {...entry, approved: true, archived: !!archive};
        } catch (error) {
          console.error('Could not publish submission ' + id + ': ' + error.message);
          return {...entry, approved: false, archived: false};
        }
      } finally {reviewing.delete(id);}
    } finally {
      try {
        if (staging) await fsp.rm(staging, {recursive: true, force: true});
      } finally {
        uploading = false;
      }
    }
  }

  const server = http.createServer({requestTimeout: 300000}, async (req, res) => {
    const origin = req.headers.origin;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Vary', 'Origin');
    const json = (status, body) => res.writeHead(status, {'Content-Type': 'application/json'}).end(JSON.stringify(body));
    try {
      const reviewOrigin = !origin || origins.includes(origin);
      res.setHeader('Access-Control-Allow-Origin', origin && reviewOrigin ? origin : '*');
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type'}).end();
        return;
      }
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/community-saves.js')) {
        const page = url.pathname === '/';
        const file = page ? 'community-saves.html' : 'community-saves.js';
        const content = await fsp.readFile(path.join(__dirname, '..', 'Manager', file));
        return res.writeHead(200, {'Content-Type': page ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8'}).end(content);
      }
      const admin = reviewOrigin && matches(req.headers.authorization, adminToken);
      if (req.headers.authorization && !admin) throw failure(403, 'The reviewer code or origin is not authorised.');
      if (url.pathname === '/v1/saves' && req.method === 'GET') {
        const entries = await Promise.all((await fsp.readdir(directory)).filter(id => idPattern.test(id)).map(getEntry));
        return json(200, {reviewer: admin, largeUploadBytes: archive ? largeBytes : 0,
          items: entries.map(entry => entry.item).filter(item => admin || item.approved).sort((a, b) => b.submitted.localeCompare(a.submitted))});
      }
      if (url.pathname === '/v1/saves' && req.method === 'POST') return json(201, await upload(req, url));
      if (url.pathname === '/v1/uploads' && req.method === 'POST') return json(201, await startSession(url));
      const session = /^\/v1\/uploads\/([a-f0-9-]+)(?:\/(finish))?$/.exec(url.pathname);
      if (session && idPattern.test(session[1])) return json(200, await resume(req, url, session[1], session[2]));
      const route = /^\/v1\/saves\/([^/]+)\/(download|approve|withdraw)$/.exec(url.pathname);
      if (!route) throw failure(404, 'Unknown route.');
      const [, id, operation] = route;
      const {folder, item} = await getEntry(id);
      if (operation === 'download' && req.method === 'GET') {
        if (!item.approved && !admin) throw failure(404, 'Save unavailable.');
        const file = await fsp.open(path.join(folder, 'save.bin'), 'r');
        res.writeHead(200, {'Content-Type': 'application/octet-stream', 'Content-Length': item.bytes, 'Content-Disposition': 'attachment; filename="'+item.title+'.bin"'});
        return await pipeline(file.createReadStream(), res);
      }
      if (!admin || req.method !== 'POST') throw failure(403, 'Review access is required.');
      if (operation === 'download') throw failure(404, 'Unknown route.');
      if (reviewing.has(id) || activeSessions.has(id)) throw failure(409, 'A review action is already running for this save.');
      reviewing.add(id);
      try {
        const flag = path.join(folder, 'approved');
        if (operation === 'approve') {
          await approve(item, folder);
        } else {
          if (archive) await archive.withdraw(item);
          if (item.resumable) await fsp.writeFile(path.join(folder, 'withdrawn'), '', {mode: 0o600});
          await fsp.unlink(flag).catch(error => {if (error.code !== 'ENOENT') throw error;});
        }
      } finally {reviewing.delete(id);}
      return json(200, {approved: operation === 'approve', archived: operation === 'approve' && !!archive});
    } catch (error) {
      if (res.headersSent || res.destroyed) return res.destroy();
      if (!error.status) console.error(error);
      json(error.status || 500, error.status ? {error: error.message} : {error: 'Library operation failed.'});
    }
  });
  return server;
}

if (require.main === module) {
  const env = process.env;
  const origins = (env.PSNHUB_COMMUNITY_ORIGINS || '').split(',').map(origin => origin.trim()).filter(Boolean);
  if (env.RENDER_EXTERNAL_URL) origins.push(new URL(env.RENDER_EXTERNAL_URL).origin);
  createServer({directory: env.PSNHUB_COMMUNITY_DATA,
    archive: env.PSNHUB_GITHUB_TOKEN ? createArchive(env.PSNHUB_GITHUB_TOKEN) : undefined,
    adminToken: env.PSNHUB_COMMUNITY_ADMIN, origins})
    .then(server => server.listen(Number(env.PSNHUB_COMMUNITY_PORT || env.PORT || 8095), env.PSNHUB_COMMUNITY_HOST || '127.0.0.1', () => {
      console.log('Community Saves library listening on', server.address());
    })).catch(error => {console.error(error.message);process.exitCode = 1;});
}
module.exports = {createServer};
