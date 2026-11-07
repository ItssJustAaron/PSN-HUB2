const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {once} = require('node:events');
const {createServer} = require('./community-saves.cjs');

async function main() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'psnhub-community-test-'));
  const adminToken = 'test-review-code-00000000';
  const origin = 'http://127.0.0.1:8085';
  const server = await createServer({directory, adminToken, origins: [origin]});
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
    assert.deepEqual((await (await request('')).json()).items, []);
    assert.equal((await request('/'+item.id+'/download')).status, 404);
    assert.equal((await request('/'+item.id+'/approve', {method: 'POST'})).status, 403);
    const reviewer = await (await request('', {code: adminToken})).json();
    assert.equal(reviewer.items[0].approved, false);
    const moderate = operation => request('/'+item.id+'/'+operation, {method: 'POST', code: adminToken});
    assert.equal((await moderate('approve')).status, 200);
    assert.equal((await (await request('')).json()).items[0].approved, true);
    assert.deepEqual(Buffer.from(await (await request('/'+item.id+'/download')).arrayBuffer()), body);
    assert.equal((await moderate('withdraw')).status, 200);
    assert.equal((await request('/'+item.id+'/download')).status, 404);
    console.log('PASS: Community Saves access, review, package integrity and withdrawal.');
  } finally {
    await new Promise(resolve => server.close(resolve));
    await fs.rm(directory, {recursive: true, force: true});
  }
}

main().catch(error => {console.error(error); process.exitCode = 1;});
