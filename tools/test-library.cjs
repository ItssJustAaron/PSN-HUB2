const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const full = JSON.parse(fs.readFileSync(path.join(root, 'Manager/catalog.json')));
const catalog = {...full, cheats: full.cheats.slice(0, 6)};
class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.events = {}; this.dataset = {}; this.value = ''; this.open = false; this.hidden = false; }
  append(...children) { this.children.push(...children); }
  prepend(...children) { this.children.unshift(...children); }
  setAttribute(name, value) { this[name] = value; }
  addEventListener(name, fn) { (this.events[name] ||= []).push(fn); }
  focus() { this.focused = true; }
  scrollIntoView() {}
  set id(value) { this.elementId=value; nodes.set(value,this); }
  get id() { return this.elementId; }
  after() {}
  before() {}
  set textContent(text) { this.text = text; this.children = []; }
  get textContent() { return this.text || ''; }
  get childNodes() { return this.children; }
  emit(event) { for (const fn of this.events[event] || []) fn(); }
}
const nodes = new Map(), all = [];
const cssClasses=new Set();
const document = {head: new Element('head'), documentElement: {classList:{add(name){cssClasses.add(name);},contains(name){return cssClasses.has(name);},toggle(name,on){if(on)cssClasses.add(name);else cssClasses.delete(name);}}, dataset:{}}, createElement: tag => { const el = new Element(tag); all.push(el); return el; },
  getElementById: id => { if (!nodes.has(id)) nodes.set(id, new Element('div')); return nodes.get(id); },
  querySelectorAll: selector => all.filter(el => selector === '[data-transfer]' ? el.dataset.transfer : el.dataset.favourite)};
const storage = new Map(), requests = [];
let failTarget = '', pauseUpload = null, downloadPaused = false, backupFails = false;
const context = vm.createContext({window: {}, document, location: {host: 'test-console:8085'}, repositoryBase:'https://source/', builtinCatalog: {hens: full.hens, modMenus: full.modMenus},
  localStorage: {getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value)},
  setTimeout, clearTimeout, AbortController, Blob, Uint8Array, crypto: require('node:crypto').webcrypto, console, confirm: () => true,
  prettySize: size => size + ' B', requestHeaders: () => ({'X-PSNHUB-Request': '1'}),
  loadCatalog: async () => catalog, sourceURL: file => 'https://source/' + file,
  fetch: async (url, options = {}) => {
    requests.push({url, options});
    if (options.signal && options.signal.aborted) throw new Error('cancelled');
    if (url === '/api/status') return {ok: true, blob: async () => new Blob(['{}'])};
    if(url.startsWith('/api/cheats/backup'))return {ok:!backupFails,status:backupFails?500:200,blob:async()=>new Blob([JSON.stringify({id:'backup-1',destination:new URL(url,'http://console').searchParams.get('destination')})])};
    if(url.startsWith('/api/cheats?'))return {ok:true,blob:async()=>new Blob([JSON.stringify({destination:new URL(url,'http://console').searchParams.get('destination'),items:[]} )])};
    if (url.startsWith('https://source/')) {
      if (downloadPaused) await new Promise(resolve => setTimeout(resolve, 10));
      if (options.signal && options.signal.aborted) throw new Error('cancelled');
      return {ok: true, blob: async () => new Blob([fs.readFileSync(path.join(root, url.slice('https://source/'.length)))])};
    }
    if (pauseUpload && url.startsWith('/api/cheat-upload')) await pauseUpload;
    const failed = failTarget && decodeURIComponent(url).includes(failTarget);
    return {ok: !failed, status: failed ? 500 : 200, blob: async () => new Blob([failed ? 'Test upload failure' : '{}'])};
  }
});
vm.runInContext(fs.readFileSync(path.join(root, 'Manager/library.js'), 'utf8'), context);
const tick = () => new Promise(resolve => setImmediate(resolve));
(async () => {
  await tick(); await tick();
  const api = context.window.PSNLibrary;
  assert(api.state.catalog && api.state.catalog.cheats.length === 6);
  assert.equal(api.filterCheats(full.cheats, {query: 'Killzone', platform: 'PS4', format: 'json', version: '01.00'}).length > 0, true);
  assert.equal(api.filterCheats(full.cheats, {query: 'no-such-game-qqqq', platform: '', format: '', version: ''}).length, 0);
  assert(api.groupCheats(full.cheats).length > 1000);
  const box = document.getElementById('hen-catalog').children[0];
  assert.equal(box.tag, 'details'); box.open = true;
  const close = box.children[1].children.find(el => el.className === 'row' && el.children.some(child => child.textContent === 'Close')).children.find(el => el.textContent === 'Close');
  close.emit('click'); assert.equal(box.open, false); assert(box.children[0].focused);
  const favourite = api.favourite(full.hens[0]); favourite.emit('click');
  assert(JSON.parse(storage.get('psnhub.favourites')).some(item => item.path === full.hens[0].path));
  favourite.emit('click'); assert.equal(JSON.parse(storage.get('psnhub.favourites')).length, 0);
  const game = document.getElementById('cheat-games').children[0]; game.children[0].emit('click');
  assert(game.children[1].children.length > 0, 'Expanding a game builds version/file controls');
  assert.equal(game.children[0]['aria-expanded'], 'true');
  assert.equal(game.children[1].hidden, false);
  game.children[1].children.at(-1).emit('click'); assert.equal(game.children[1].hidden, true);
  assert.equal(api.compatibility(full.hens[0], '4.51'), 'compatible');
  assert.equal(api.compatibility(full.hens[0], '13.60'), 'incompatible');
  assert.equal(api.compatibility(full.modMenus[0], '13.60'), 'unknown');
  document.getElementById('console-firmware').value='4.51'; document.getElementById('set-firmware').emit('click');
  assert.equal(api.state.firmware,'4.51'); assert.equal(api.state.firmwareSource,'Manually selected for this console');
  assert.equal(JSON.parse(storage.get('psnhub.firmware:test-console:8085')),'4.51');
  api.selectFirmware('13.60');
  assert.equal(api.state.firmwareSource,'Reported by console');
  assert(!api.canSendName('ps5-hen.elf'));
  assert(!document.getElementById('hen-catalog').children.some(child=>child.tag==='details'&&child.children[0].textContent==='cragson-PS5Hen'));
  const onion=full.hens.find(item=>item.title==='onionHEN');
  assert.equal(api.compatibility(onion,'13.60'),'compatible');
  assert.equal(api.compatibility(onion,'5.50'),'unknown');
  assert.equal(api.compatibility(onion,'3.00'),'incompatible');
  const eta=full.hens.find(item=>item.title==='etaHEN');
  assert.equal(api.targetURL(eta),'/api/upload?name=etaHEN-2.5B.bin');
  requests.length=0; await api.startTransfer([full.hens[0]],'Blocked HEN'); assert.equal(requests.length,0);
  const stateToggle=document.getElementById('show-incompatible'); stateToggle.checked=true; stateToggle.emit('change');
  const incompatibleBox=document.getElementById('hen-catalog').children.find(child=>child.tag==='details');
  const incompatibleSend=incompatibleBox.children[1].children.find(child=>child.className==='row'&&child.children.some(button=>button.textContent==='SEND')).children.find(button=>button.textContent==='SEND');
  assert.equal(incompatibleSend.disabled,true);
  api.selectFirmware('4.51'); assert(api.canSendName('ps5-hen.elf'));
  api.selectFirmware('not-a-version'); assert.equal(api.state.firmware,'4.51');
  document.getElementById('console-firmware').value=''; document.getElementById('set-firmware').emit('click');
  assert.equal(api.state.firmware,'');
  assert.equal(api.compatibility(full.hens[0]),'unknown');
  assert.throws(() => api.targetURL({target: 'json/../bad'}), /Invalid/);
  await assert.rejects(api.verify(new Blob(['bad']), full.hens[0]), /Incomplete/);
  await assert.rejects(api.verify(new Blob(['bad']), {name: 'bad.elf'}), /signature/);
  await assert.rejects(api.verify(new Blob(['x']), {target: 'json/a.json', size: 1, sha256: '000'}), /checksum/);
  requests.length = 0;
  await api.startTransfer(catalog.cheats.slice(0, 3), 'Test cheats');
  assert.equal(api.state.transfer.completed.length, 3);
  const uploads = requests.filter(req => req.url.startsWith('/api/cheat-upload'));
  assert.equal(uploads.length, 3); assert(uploads.every(req => decodeURIComponent(req.url).includes('path=json/')));
  assert(JSON.parse(storage.get('psnhub.recents')).length > 0);
  failTarget = catalog.cheats[0].target;
  await api.startTransfer(catalog.cheats, 'Failure test');
  assert.equal(api.state.transfer.running, false); assert.equal(api.state.transfer.failures.length, 1);
  const completed = new Set(api.state.transfer.completed.map(item => item.path));
  failTarget = ''; requests.length = 0;
  await api.retryTransfer();
  assert.equal(api.state.transfer.completed.length, 6);
  assert(requests.filter(req => req.url.startsWith('https://source/')).every(req => !completed.has(req.url.slice('https://source/'.length))), 'Retry skips completed files');
  let releaseUpload; pauseUpload = new Promise(resolve => { releaseUpload = resolve; });
  const transfer = api.startTransfer(catalog.cheats.slice(0, 2), 'Cancel upload test');
  for (let i = 0; i < 20 && !requests.some(req => req.url.startsWith('/api/cheat-upload')); i++) await tick();
  await new Promise(resolve => setTimeout(resolve, 10));
  api.cancelTransfer(); assert.equal(api.state.transfer.running, true, 'Cancellation waits for accepted uploads');
  releaseUpload(); await transfer; pauseUpload = null;
  assert.equal(api.state.transfer.running, false); assert.equal(api.state.transfer.cancelled, true);
  downloadPaused = true; requests.length = 0;
  const cancelled = api.startTransfer(catalog.cheats, 'Cancel downloads'); api.cancelTransfer(); await cancelled;
  assert(!requests.some(req => req.url.startsWith('/api/cheat-upload')), 'Cancelling downloads prevents new uploads');
  downloadPaused = false; requests.length = 0;
  await api.startTransfer([full.hens[0]], 'Test HEN');
  assert(requests.some(req => req.url === '/api/upload?name=ps5-hen.elf'));
  assert(requests.some(req => req.url === '/api/send?name=ps5-hen.elf'));
  assert.equal(document.getElementById('loader-connection').textContent, 'elfldr: last send succeeded');
  assert.equal(document.getElementById('check-installed').disabled,true);
  assert.equal(document.getElementById('backup-now').disabled,true);
  assert.equal(api.destinationAllowed('onionhen'),false);
  assert.throws(()=>api.targetURL(full.cheats[0],'onionhen'),/native Manager/);
  await assert.rejects(api.createBackup('etahen'),/native Manager upgrade/);
  const plan=api.planUpdates([{target:'json/new',sha256:'a'},{target:'json/change',sha256:'b'},{target:'json/same',sha256:'c'},{target:'json/unknown',sha256:'d'}],[{path:'json/change',sha256:'a'},{path:'json/same',sha256:'c'},{path:'json/unknown'}]);
  assert.deepEqual(Array.from(plan,x=>x.status),['new','changed','unchanged','unknown']);
  document.getElementById('profile-name').value='My PS5';document.getElementById('profile-address').value='test-console:8085';document.getElementById('profile-hen').value='onionhen';api.saveProfile();
  document.getElementById('profile-game-id').value='CUSA00002';document.getElementById('profile-game-version').value='01.00';api.saveGameVersion();
  assert.equal(JSON.parse(storage.get('psnhub.profiles'))[0].games.CUSA00002,'01.00');
  const diagnostic=api.diagnostics(); assert.equal(diagnostic.profile.hen,'onionhen');assert.equal(JSON.stringify(diagnostic).includes('test-console:8085'),false);
  api.state.manager=true;api.state.backend={cheatInventory:true,cheatBackup:true,cheatRestore:true,destinations:['etahen','onionhen']};
  assert.equal(api.destinationAllowed('onionhen'),true);assert(api.targetURL(full.cheats[0],'onionhen').endsWith('destination=onionhen'));
  await api.checkInventory();assert.equal(api.state.inventory.destination,'etahen');
  const backup=await api.createBackup('onionhen');assert.equal(backup.id,'backup-1');assert.equal(document.getElementById('backup-now').disabled,false);
  await api.restoreBackup();assert(requests.some(req=>req.url.startsWith('/api/cheats/restore?destination=onionhen')));
  backupFails=true;document.getElementById('backup-before-install').checked=true;requests.length=0;
  await api.startTransfer([catalog.cheats[0]],'Backup failure test');assert(!requests.some(req=>req.url.startsWith('/api/cheat-upload')));assert(api.state.transfer.message.includes('No files changed'));
  document.getElementById('backup-before-install').checked=false;backupFails=false;
  document.getElementById('profile-address').value='other-console:8085';api.saveProfile();requests.length=0;await api.startTransfer([catalog.cheats[0]],'Wrong console');assert.equal(requests.length,0);
  document.getElementById('profile-address').value='test-console:8085';api.saveProfile();
  const emulator=full.emulators.find(item=>item.name==='PS5SX2Installer.elf');assert(emulator);assert.equal(emulator.sha256,'efdec4f8d968ef4a7c1880e75d26b96d212a042a6c208de46f0a859609f6224c');
  requests.length=0;await api.startTransfer([emulator],'PS5SX2 installer test');assert(requests.some(req=>req.url==='/api/send?name=PS5SX2Installer.elf'));
  api.state.backend={};document.getElementById('setup-firmware').value='13.60';document.getElementById('setup-hen').value='onionhen';assert.equal(api.saveSetup(),true);
  assert.equal(JSON.parse(storage.get('psnhub.setup:test-console:8085')),true);assert.equal(api.state.firmware,'13.60');
  assert(document.getElementById('maintenance-status').textContent.includes('cannot yet install OnionHEN cheats'));
  api.setControllerMode(true);assert(cssClasses.has('controller-mode'));assert.equal(JSON.parse(storage.get('psnhub.controllerMode')),true);api.setControllerMode(false);
  const review=api.installSummary([full.cheats[0]],'Install selected cheats','etahen');
  assert(review.includes(full.cheats[0].title));assert(review.includes(full.cheats[0].version));assert(review.includes('/data/etaHEN/cheats'));assert(review.includes('Files: 1'));
  const beforeDecline=requests.length;context.confirm=()=>false;
  await api.startTransfer([full.cheats[0]],'Declined install');assert.equal(requests.length,beforeDecline,'Declining the review must not upload anything');context.confirm=()=>true;
  document.getElementById('cheat-search').value='Killzone';document.getElementById('cheat-platform').value='PS4';api.state.page=3;api.saveBrowsing();
  document.getElementById('cheat-search').value='';api.state.page=0;api.restoreBrowsing();assert.equal(document.getElementById('cheat-search').value,'Killzone');assert.equal(api.state.page,3);
  api.applyFilters(false);assert.equal(api.state.page,0,'A saved page is clamped when the filtered catalogue is shorter');
  document.getElementById('cheat-search').value='';document.getElementById('cheat-platform').value='';api.applyFilters();
  assert.equal(document.getElementById('release-notes').open,true);document.getElementById('release-notes').children.find(child=>child.tag==='button').emit('click');assert.equal(document.getElementById('release-notes').open,false);assert(storage.get('psnhub.release-seen'));
  console.log('PASS: install review cancellation, saved filters/page recovery and dismissible release notes.');
  console.log('PASS: search/filters, cover cards, firmware sources and compatibility guards, favourites/history, integrity checks, PS5 paths, retries, cancellation, sends and connection badges.');
  console.log('PASS: profiles, diagnostic redaction, capability gates, update comparison, destination routing, backup/restore contracts and backup-before-write failure handling.');
  console.log('PASS: PS5SX2 installer metadata and send path, first-run setup and controller-mode persistence.');
})().catch(error => { console.error(error); process.exitCode = 1; });
