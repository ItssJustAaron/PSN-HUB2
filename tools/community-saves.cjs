/* Public submissions and downloads. Run behind HTTPS when serving beyond the LAN. */
const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const {createHash, randomUUID, timingSafeEqual} = require('node:crypto');
const {Transform} = require('node:stream');
const {pipeline} = require('node:stream/promises');

const maxBytes = 256 * 1024 ** 2;
const maxEntries = 40;
const idPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const failure = (status, message) => Object.assign(new Error(message), {status});

function matches(header, token) {
  const actual = Buffer.from(header || '');
  const expected = Buffer.from('Bearer ' + token);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function createServer({directory, adminToken, origins = []}) {
  if (!directory || !path.isAbsolute(directory) || !/^[\x21-\x7e]{24,128}$/.test(adminToken || '')) {
    throw Error('Set an absolute private data directory and a reviewer code of 24–128 printable characters without spaces.');
  }
  await fsp.mkdir(directory, {recursive: true, mode: 0o700});
  let uploading = false;

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
      const platform = url.searchParams.get('platform');
      const title = url.searchParams.get('title') || '';
      const description = (url.searchParams.get('description') || '').trim();
      const bytes = Number(req.headers['content-length']);
      const keyBytes = platform === 'ps4' ? 96 : 0;
      if (!description || description.length > 240 || /[\x00-\x1f\x7f]/.test(description)) {
        throw failure(400, 'Enter a description between 1 and 240 characters on one line.');
      }
      if (!((platform === 'ps4' && /^CUSA\d{5}$/.test(title)) || (platform === 'ps5' && /^PPSA\d{5}$/.test(title)))) {
        throw failure(400, 'Invalid title or platform.');
      }
      if (!Number.isSafeInteger(bytes) || bytes <= keyBytes || bytes > maxBytes || req.headers['content-type'] !== 'application/octet-stream') {
        throw failure(400, 'A raw save package of up to 256 MiB with a known size is required.');
      }
      if ((await fsp.readdir(directory)).filter(id => idPattern.test(id) || id.startsWith('.incoming-')).length >= maxEntries) {
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
      const entry = {id, platform, title, description, bytes, sha256: hash.digest('hex'), submitted: new Date().toISOString()};
      await fsp.writeFile(path.join(staging, 'entry.json'), JSON.stringify(entry), {mode: 0o600});
      await fsp.rename(staging, path.join(directory, id));
      staging = undefined;
      return {...entry, approved: false};
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
        return json(200, {reviewer: admin, items: entries.map(entry => entry.item).filter(item => admin || item.approved).sort((a, b) => b.submitted.localeCompare(a.submitted))});
      }
      if (url.pathname === '/v1/saves' && req.method === 'POST') return json(201, await upload(req, url));
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
      const flag = path.join(folder, 'approved');
      if (operation === 'approve') await fsp.writeFile(flag, '', {flag: 'a', mode: 0o600});
      else if (operation === 'withdraw') await fsp.unlink(flag).catch(error => {if (error.code !== 'ENOENT') throw error;});
      else throw failure(404, 'Unknown route.');
      return json(200, {approved: operation === 'approve'});
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
  createServer({directory: env.PSNHUB_COMMUNITY_DATA,
    adminToken: env.PSNHUB_COMMUNITY_ADMIN, origins: env.PSNHUB_COMMUNITY_ORIGINS?.split(',').map(x => x.trim()).filter(Boolean)})
    .then(server => server.listen(Number(env.PSNHUB_COMMUNITY_PORT || 8095), env.PSNHUB_COMMUNITY_HOST || '127.0.0.1', () => {
      console.log('Community Saves library listening on', server.address());
    })).catch(error => {console.error(error.message);process.exitCode = 1;});
}
module.exports = {createServer};
