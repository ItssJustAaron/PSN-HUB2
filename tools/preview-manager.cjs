// UI preview only. Never connects to a console or accepts payload uploads.
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..');
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/') {
    const binary = fs.readFileSync(path.join(root, 'payloads/PSN-HUB-Manager.elf'));
    const start = binary.indexOf('<!doctype html>');
    let html = binary.subarray(start, start + 28046).toString();
    html = html.replace('https://raw.githubusercontent.com/ItssJustAaron/PSN-HUB2/main/', '/');
    html = html.replace('<h1>', '<p>UI preview — no console connected.</p><h1>');
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    return res.end(html);
  }
  if (pathname.startsWith('/api/')) {
    const data = pathname === '/api/status' ? {preview: true} : pathname === '/api/list' ? {items: []} : pathname === '/api/categories' ? {categories: []} : null;
    res.writeHead(data ? 200 : 503, {'Content-Type': 'application/json'});
    return res.end(JSON.stringify(data || {error: 'UI preview: no console connected'}));
  }
  const file = path.resolve(root, '.' + decodeURIComponent(pathname));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, bytes) => {
    const mime = {'.json':'application/json','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.css':'text/css','.js':'application/javascript'};
    res.writeHead(err ? 404 : 200, {'Content-Type': mime[path.extname(file)] || 'application/octet-stream'});
    res.end(err ? 'Not found' : bytes);
  });
});
const host = process.argv[2] || '127.0.0.1';
if (!require('node:net').isIP(host)) throw new Error('Preview host must be an IP address');
server.listen(8086, host, () => console.log(`UI preview: http://${host}:8086`));
