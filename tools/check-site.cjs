const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const {spawnSync} = require('node:child_process');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8').replace(/\r\n/g, '\n');
const catalog = JSON.parse(read('Manager/catalog.json'));
const binary = fs.readFileSync(path.join(root, 'payloads/PSN-HUB-Manager.elf'));
const start = binary.indexOf('<!doctype html>');
const dashboard = binary.subarray(start, start + 28046).toString().trimEnd();
assert.equal(binary[start + 28046], 0);
assert(dashboard.includes('Manager/library.js'));
assert(dashboard.includes('/data/etaHEN/cheats'));
assert(!dashboard.includes('RaringM-GTAV/gtav-menu-daemon.elf'));
const fallbackFields = new Set(['title','description','path','name','size','firmware','author']);
const embedded = {hens:[],modMenus:[]};
const embeddedJSON = JSON.stringify(embedded).replace(/</g, '\\u003c').replace(/[^\x00-\x7f]/g, ch => '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0'));
const version = require('node:crypto').createHash('sha256').update(read('Manager/library.js')).digest('hex').slice(0,12);
const build=JSON.parse(read('Manager/build.json'));
const embeddedBuild=Object.fromEntries(['buildId','uiRelease','catalogueVersion','catalogueUpdatedAt'].map(key=>[key,build[key]]));
const expected = read('Manager/dashboard.html').split(/\r?\n/).map(line => line.trim()).join('\n').trimEnd().replace('__MANAGER_BUILD__',JSON.stringify(embeddedBuild)).replace('__LIBRARY_VERSION__',version).replace('const builtinCatalog = null;', 'const builtinCatalog = ' + embeddedJSON + ';');
assert.equal(dashboard, expected, 'ELF must contain current dashboard');
const urlContext=vm.createContext({repositoryBase:'https://site/'});
vm.runInContext(dashboard.match(/function sourceURL[^\n]+/)[0],urlContext);
assert.equal(urlContext.sourceURL('Manager/Emulators/Test Installer.elf'),'https://site/Manager/Emulators/Test%20Installer.elf');
assert.throws(()=>urlContext.sourceURL('Manager/Emulators/../private.elf'),/Invalid/);
assert.equal(urlContext.sourceURL('payloads/test.elf'),'https://site/payloads/test.elf');
assert.throws(()=>urlContext.sourceURL('payloads/../private.elf'),/Invalid/);
for (const section of ['hens', 'modMenus', 'emulators', 'payloads', 'cheats']) {
  const destinations = new Set();
  for (const item of catalog[section]) {
    assert(fs.statSync(path.join(root, item.path)).isFile(), item.path);
    if (item.cover) {
      assert(/^Manager\/covers\/[A-Z]{4}\d{5}\.(jpg|png|webp)$/.test(item.cover));
      assert(fs.statSync(path.join(root,item.cover)).size > 100, item.cover);
    }
    const destination = section === 'cheats' ? item.target : item.name;
    assert(!destinations.has(destination), 'Duplicate destination: ' + destination);
    destinations.add(destination);
    if (section === 'cheats') assert(/^(json|mc4|shn)\//.test(item.target));
    else assert.equal(fs.readFileSync(path.join(root, item.path)).subarray(0, 4).toString(), '\x7fELF');
  }
}
const cached = read('cache.appcache').split('CACHE:\n')[1].split('\nNETWORK:')[0].trim().split('\n');
for (const entry of cached) assert(fs.statSync(path.join(root, entry.split('?')[0])).isFile(), entry);
for (const entry of ['core.js?v=132', 'mem.js?v=131', 'main.js?v=10', 'manager-launch.js', 'payload-fetch.js', 'cache-status.js', 'kexp.js', 'int64.js', 'payloads/elfldr-ps5-1360.elf', 'payloads/kexp_2026_05_25.bin']) assert(cached.includes(entry), entry);
for (const version of JSON.parse(read('offsets/offsets.json')).firmwares) assert(cached.includes('offsets/' + version.script));
for (const [name, html] of [['index.html', read('index.html')], ['relapse.html', read('relapse.html')], ['dashboard', dashboard]]) {
  for (const match of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
    const result = spawnSync(process.execPath, ['--check', '--input-type=' + (/type="module"/.test(match[1]) ? 'module' : 'commonjs')], {input: match[2], encoding: 'utf8'});
    assert.equal(result.status, 0, name + ': ' + result.stderr);
  }
}
console.log('PASS: catalogue paths, duplicate destinations, ELF embedding, cache dependencies and inline syntax.');
require('./test-library.cjs');
require('./test-payload-fetch.cjs');

require('./test-manager-launch.cjs');
