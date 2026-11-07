const assert = require('node:assert/strict');
const {createHash, randomUUID} = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {once} = require('node:events');
const {createServer} = require('./community-saves.cjs');

async function main() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'psnhub-community-test-'));
  const adminToken = 'test-review-code-00000000';
  const origin = 'http://127.0.0.1:8085';
  const archived = new Set();
  const archive = {
    async publish(item) {archived.add(item.id);},
    async withdraw(item) {archived.delete(item.id);}
  };
  const server = await createServer({directory, adminToken, origins: [origin], archive});
  try {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const request = (route, {code, from = origin, ...options} = {}) => fetch(
      'http://127.0.0.1:' + server.address().port + '/v1/saves' + route,
      {...options, headers: {...(code ? {Authorization: 'Bearer ' + code} : {}), Origin: from, ...options.headers}}
    );
    assert.equal((await request('', {code: 'wrong'})).status, 403);
    assert.equal((await request('', {code: adminToken, from: 'http://other.test'})).status, 403);
    const publicList = await request('', {from: 'http://other.test'});
    assert.equal(publicList.status, 200);
    assert.equal(publicList.headers.get('access-control-allow-origin'), '*');
    const page = await fetch('http://127.0.0.1:' + server.address().port + '/');
    assert.match(await page.text(), /PSN-HUB Community Saves/);
    const preflight = await request('', {method: 'OPTIONS'});
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
    const body = Buffer.concat([Buffer.alloc(96, 7), Buffer.from('synthetic test image')]);
    const upload = {method: 'POST', body, headers: {'Content-Type': 'application/octet-stream'}};
    assert.equal((await request('?platform=ps4&title=PPSA12345&description=Example', upload)).status, 400);
    assert.equal((await request('?platform=ps4&title=CUSA12345', upload)).status, 400);
    assert.equal((await request('?platform=ps4&title=CUSA12345&description=%20%20', upload)).status, 400);
    assert.equal((await request('?platform=ps4&title=CUSA12345&description='+'a'.repeat(241), upload)).status, 400);
    assert.equal((await request('?platform=ps4&title=CUSA12345&description=Example', upload)).status, 400);
    const submitted = await request('?platform=ps4&title=CUSA12345&description=%20Example%20&consent=public', {...upload, from: 'http://other.test'});
    assert.equal(submitted.status, 201);
    const item = await submitted.json();
    assert.equal(item.description, 'Example');
    assert.equal(item.sha256, createHash('sha256').update(body).digest('hex'));
    assert.equal(item.approved, true);
    assert.equal(item.archived, true);
    assert.ok(archived.has(item.id));
    assert.equal((await (await request('')).json()).items[0].id, item.id);
    assert.equal((await request('/'+item.id+'/approve', {method: 'POST'})).status, 403);
    const reviewer = await (await request('', {code: adminToken})).json();
    assert.equal(reviewer.items[0].approved, true);
    const moderate = operation => request('/'+item.id+'/'+operation, {method: 'POST', code: adminToken});
    assert.deepEqual(Buffer.from(await (await request('/'+item.id+'/download')).arrayBuffer()), body);
    assert.equal((await moderate('withdraw')).status, 200);
    assert.ok(!archived.has(item.id));
    assert.equal((await request('/'+item.id+'/download')).status, 404);

    const session = randomUUID();
    const base = 'http://127.0.0.1:' + server.address().port + '/v1/uploads';
    const bytes = 257 * 1024 ** 2;
    const params = new URLSearchParams({id: session, platform: 'ps5', title: 'PPSA12345',
      description: 'Resumable test', consent: 'public', bytes: String(bytes)});
    const start = await fetch(base + '?' + params, {method: 'POST'});
    assert.equal(start.status, 201);
    const {chunkBytes} = await start.json();
    const endpoint = base + '/' + session;
    const send = (offset, chunk) => fetch(endpoint + '?offset=' + offset, {method: 'POST', body: chunk,
      headers: {'Content-Type': 'application/octet-stream'}});
    assert.equal((await fetch(endpoint + '/finish', {method: 'POST'})).status, 409);
    const chunk = Buffer.alloc(chunkBytes, 9);
    assert.equal((await send(0, chunk)).status, 200);
    assert.equal((await send(0, chunk)).status, 409);
    assert.equal((await (await fetch(endpoint)).json()).offset, chunkBytes);
    const hash = createHash('sha256').update(chunk);
    for (let offset = chunkBytes; offset < bytes; offset += chunkBytes) {
      const part = chunk.subarray(0, Math.min(chunkBytes, bytes - offset));
      hash.update(part);
      assert.equal((await send(offset, part)).status, 200);
    }
    const finish = () => fetch(endpoint + '/finish', {method: 'POST'});
    const published = await (await finish()).json();
    assert.equal(published.archived, true);
    assert.equal(published.bytes, bytes);
    assert.equal(published.sha256, hash.digest('hex'));
    assert.notEqual(published.id, session);
    assert.equal((await (await finish()).json()).id, published.id);
    assert.equal((await fetch(base + '/' + published.id)).status, 404);
    assert.equal((await request('/' + published.id + '/withdraw', {method: 'POST', code: adminToken})).status, 200);
    assert.equal((await finish()).status, 410);
    console.log('PASS: Public uploads, archive publication, resumable 257 MiB upload, integrity, retries and withdrawal.');
  } finally {
    await new Promise(resolve => server.close(resolve));
    await fs.rm(directory, {recursive: true, force: true});
  }
}

main().catch(error => {console.error(error); process.exitCode = 1;});
