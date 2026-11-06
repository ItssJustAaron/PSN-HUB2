/* Manager library UI. File transfers use the native PS5 Manager API. */
(function () {
  'use strict';
  const UI_RELEASE = '2026.11.06.7';
  const $ = id => document.getElementById(id);
  const state = {catalog: null, page: 0, pageSize: 24, groups: [], transfer: null, manager: false, preview: false, firmware: '', firmwareSource: '', showIncompatible: false, backend: {}, destination: 'etahen', connectionError: '', publishedBuild: null, inventory: null};
  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function action(text, fn, className) {
    const node = element('button', text, className);
    node.type = 'button'; node.addEventListener('click', fn); return node;
  }
  function startLeafBackground() {
    // Canvas vectors keep the background lightweight and independent of artwork downloads.
    if (!document.body || !window.requestAnimationFrame) return;
    const canvas = element('canvas'); canvas.id = 'leaf-background';
    canvas.setAttribute('aria-hidden', 'true'); document.body.prepend(canvas);
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let width = 0, height = 0, frame = 0, last = 0, leaves = [];
    const tips = [[-25,5],[-30,-14],[-18,-33],[0,-47],[18,-33],[30,-14],[25,5]];
    function leaf() {
      ctx.fillStyle = '#39ff14';
      for (const [tx,ty] of tips) {
        const dx = tx, dy = ty - 14, length = Math.hypot(dx,dy), nx = -dy/length, ny = dx/length;
        const breadth = Math.abs(tx) > 24 ? 5 : 6;
        ctx.beginPath(); ctx.moveTo(0,14);
        for (let side = 1; side >= -1; side -= 2) {
          for (let i = 1; i <= 12; i++) {
            const t = side === 1 ? i/12 : 1-i/12;
            const spread = Math.sin(Math.PI*t)*breadth*(i%2 ? 1 : .55)*side;
            ctx.lineTo(dx*t+nx*spread,14+dy*t+ny*spread);
          }
        }
        ctx.closePath(); ctx.fill();
      }
      ctx.fillRect(-1,12,2,18);
    }
    function paint(time) {
      if (last && time-last < 1000/30) {
        frame = !reduced.matches && !document.hidden ? window.requestAnimationFrame(paint) : 0;
        return;
      }
      const dt = last ? Math.min((time-last)/1000,.05) : 0; last = time;
      ctx.clearRect(0,0,width,height);
      for (const item of leaves) {
        if (!reduced.matches) {
          item.y -= item.speed*dt; item.angle += item.spin*dt;
          if (item.y < -80) { item.y = height+80; item.x = Math.random()*width; }
        }
        ctx.save(); ctx.translate(item.x+Math.sin(item.y/140)*12,item.y); ctx.rotate(item.angle); ctx.scale(item.scale,item.scale);
        ctx.globalAlpha = item.alpha; leaf(); ctx.restore();
      }
      frame = !reduced.matches && !document.hidden ? window.requestAnimationFrame(paint) : 0;
    }
    function resume() {
      window.cancelAnimationFrame(frame); frame = 0; last = 0;
      if (!document.hidden) paint(0);
    }
    function resize() {
      width = window.innerWidth; height = window.innerHeight;
      const ratio = Math.min(window.devicePixelRatio || 1,1.5);
      canvas.width = Math.round(width*ratio); canvas.height = Math.round(height*ratio); ctx.setTransform(ratio,0,0,ratio,0,0);
      leaves = Array.from({length:width<700?10:20},()=>({x:Math.random()*width,y:Math.random()*height,scale:.25+Math.random()*.45,angle:Math.random()*Math.PI*2,speed:10+Math.random()*16,spin:(Math.random()-.5)*.18,alpha:.22+Math.random()*.35}));
      resume();
    }
    window.addEventListener('resize',resize); document.addEventListener('visibilitychange',resume);
    window.addEventListener('pagehide',()=>window.cancelAnimationFrame(frame));
    window.addEventListener('pageshow',resume);
    if (reduced.addEventListener) reduced.addEventListener('change',resume); else reduced.addListener(resume);
    resize();
  }
  function storeRead(key, fallback) { try { return JSON.parse(localStorage.getItem('psnhub.' + key)) || fallback; } catch (_) { return fallback; } }
  function storeWrite(key, value) { try { localStorage.setItem('psnhub.' + key, JSON.stringify(value)); } catch (_) { $('catalog-status').textContent = 'Browser storage unavailable; favourites and history will last only this visit.'; } }
  const consoleKey = 'firmware:' + location.host;
  let manualFirmware = storeRead(consoleKey, '');
  const ps5Version = typeof navigator !== 'undefined' && /PlayStation 5\/(\d+\.\d{2})/.exec(navigator.userAgent);
  function firmwareValue(value) { return typeof value === 'string' && /^\d{1,2}\.\d{2}$/.test(value.trim()) ? Number(value.trim().split('.')[0]) + '.' + value.trim().split('.')[1] : ''; }
  function compatibility(item, version = state.firmware) {
    const versions = item.firmware && Object.values(item.firmware).flat();
    if (!version || (item.firmwareConditional || []).includes(version)) return 'unknown';
    if (versions && versions.length) return versions.includes(version) ? 'compatible' : 'incompatible';
    const ranges = item.firmwareRanges;
    if (!ranges || !ranges.length) return 'unknown';
    return ranges.some(range => compareVersions(version,range.min)>=0 && compareVersions(version,range.max)<=0) ? 'compatible' : 'incompatible';
  }
  function selectFirmware(reported) {
    const detected = firmwareValue(reported);
    state.firmware = detected || (ps5Version && firmwareValue(ps5Version[1])) || firmwareValue(manualFirmware);
    state.firmwareSource = detected ? 'Reported by console' : ps5Version ? 'Detected from PS5 browser' : state.firmware ? 'Manually selected for this console' : 'Not detected';
    updateFirmwareUI(); renderCompatibility();
  }
  function firmwareControls() {
    const panel = element('div', undefined, 'firmware-settings'), row = element('div', undefined, 'row');
    const badge = element('span', '', 'badge'); badge.id = 'firmware-badge';
    const label = element('label', 'Console firmware '), input = element('input'); input.type = 'text'; input.id = 'console-firmware'; input.placeholder = 'e.g. 10.01'; input.inputMode = 'decimal'; input.value = firmwareValue(manualFirmware); label.append(input);
    const apply = action('Set firmware', () => {
      const version = firmwareValue(input.value);
      if (input.value.trim() && !version) { $('firmware-help').textContent = 'Enter the exact version with two decimal digits, for example 4.51 or 10.01.'; return; }
      manualFirmware = version; storeWrite(consoleKey, version); activeProfile.firmware=version; saveProfiles(); selectFirmware('');
    }, 'secondary'); apply.id = 'set-firmware';
    const toggleLabel = element('label'), toggle = element('input'); toggle.type = 'checkbox'; toggle.id = 'show-incompatible';
    toggle.addEventListener('change', () => { state.showIncompatible = toggle.checked; renderCompatibility(); });
    toggleLabel.append(toggle, 'Show incompatible');
    const help = element('p', '', 'hint'); help.id = 'firmware-help';
    row.append(badge, label, apply, toggleLabel); panel.append(row, help); $('connection-help').after(panel);
    selectFirmware('');
  }
  function updateFirmwareUI() {
    const badge = $('firmware-badge'); if (!badge) return;
    badge.textContent = 'PS5 firmware: ' + (state.firmware || 'unknown');
    $('firmware-help').textContent = state.firmwareSource + '. ' + (state.firmware ? 'Known incompatible payloads are hidden. Unknown support stays visible and labelled.' : 'Choose the PS5 firmware when using a phone or PC. All items remain visible until it is known.');
    const automatic = state.firmwareSource !== 'Not detected' && state.firmwareSource !== 'Manually selected for this console';
    $('console-firmware').disabled = automatic; $('set-firmware').disabled = automatic;
    if (automatic) $('console-firmware').value = state.firmware;
  }
  function renderCompatibility() {
    if (!state.catalog) return;
    renderPayloads($('hen-catalog'), state.catalog.hens); renderPayloads($('mod-menu-catalog'), state.catalog.modMenus); renderPayloads($('emulator-catalog'), state.catalog.emulators || []); renderPayloads($('payload-library'), state.catalog.payloads || []); renderPersonal();
  }
  function canSendName(name) {
    const items = state.catalog ? [...state.catalog.hens, ...state.catalog.modMenus, ...(state.catalog.emulators || []), ...(state.catalog.payloads || [])].filter(item => item.name === name) : [];
    const allowed = items.every(item => compatibility(item) !== 'incompatible');
    if (!allowed) $('catalog-status').textContent = name + ' does not support firmware ' + state.firmware + '. Sending is disabled.';
    return allowed;
  }
  let favourites = storeRead('favourites', []), recents = storeRead('recents', []);
  if (!Array.isArray(favourites)) favourites = [];
  if (!Array.isArray(recents)) recents = [];
  function identity(item) { return {...item, key: item.key || item.path, kind: item.kind || (item.target ? 'cheat' : 'payload')}; }
  function favourite(item) {
    item = identity(item);
    const button = action('', () => {
      if (favourites.some(x => x.key === item.key)) favourites = favourites.filter(x => x.key !== item.key);
      else favourites.push(item);
      storeWrite('favourites', favourites); syncFavourites(); renderPersonal();
    }, 'favourite');
    button.dataset.favourite = item.key;
    updateFavourite(button); return button;
  }
  function updateFavourite(button) {
    const yes = favourites.some(x => x.key === button.dataset.favourite);
    button.textContent = button.className === 'cover-favourite' ? (yes ? '♥' : '♡') : yes ? '★ Favourite' : '☆ Favourite';
    button.setAttribute('aria-pressed', String(yes));
  }
  function syncFavourites() { document.querySelectorAll('[data-favourite]').forEach(updateFavourite); }
  function record(item) {
    item = {...identity(item), usedAt: Date.now()};
    if (item.kind === 'saved') setLoader(true, 'last send succeeded');
    recents = [item, ...recents.filter(x => x.key !== item.key)].slice(0, 12);
    storeWrite('recents', recents); renderPersonal();
  }
  function findCurrent(item) {
    if (item.kind === 'saved') return item;
    if (!state.catalog) return undefined;
    const index = catalogueIndex(state.catalog);
    return item.kind === 'game' ? index.games.get(item.id) : index.files.get(item.path);
  }
  function renderPersonal() {
    for (const [id, items] of [['favourites', favourites], ['recent-items', recents]]) {
      const container = $(id); container.textContent = '';
      if (!items.length) container.append(element('p', id === 'favourites' ? 'Choose ☆ Favourite on any file to save it here.' : 'Successful installs and payload sends appear here.', 'hint'));
      items.forEach(saved => {
        const item = findCurrent(saved), row = element('div', undefined, 'item');
        const info = element('div'); info.append(element('strong', saved.title || saved.name));
        info.append(element('div', saved.kind === 'game' ? saved.id : saved.kind === 'cheat' ? [saved.id, saved.version, saved.format].join(' · ') : saved.name, 'hint'));
        if (saved.usedAt) info.append(element('small', new Date(saved.usedAt).toLocaleString(), 'muted'));
        const actions = element('div', undefined, 'actions');
        if (item && compatibility(item) === 'incompatible') info.append(badge('Incompatible with ' + state.firmware, 'bad'));
        if (item && compatibility(item) !== 'incompatible') actions.append(action(saved.kind === 'game' ? 'View game' : saved.kind === 'cheat' ? 'Install' : 'Send', () => {
          if (saved.kind === 'game') { $('cheat-search').value = item.id; $('cheat-platform').value = ''; $('cheat-format').value = ''; $('cheat-version').value = ''; selectTab($('tab-cheats')); applyFilters(); }
          else if (saved.kind === 'saved') sendSaved(item); else startTransfer([item], item.title);
        }));
        else actions.append(element('span', 'No longer in catalogue', 'hint'));
        actions.append(favourite(saved)); row.append(info, actions); container.append(row);
      });
    }
  }
  async function response(url, options = {}, timeout = 30000) {
    const controller = new AbortController(), upstream = options.signal;
    const abort = () => controller.abort();
    if (upstream) { if (upstream.aborted) abort(); else upstream.addEventListener('abort', abort, {once: true}); }
    const timer = setTimeout(abort, timeout);
    try {
      const result = await fetch(url, {...options, signal: controller.signal});
      // Read the body before clearing the timer, so stalled downloads also time out.
      const blob = await result.blob();
      if (!result.ok) throw new Error('HTTP ' + result.status + ': ' + (await blob.text()).slice(0, 160));
      return blob;
    } catch (error) {
      if (controller.signal.aborted) throw new Error(upstream && upstream.aborted ? 'Cancelled' : 'Request timed out');
      throw error;
    } finally {
      clearTimeout(timer); if (upstream) upstream.removeEventListener('abort', abort);
    }
  }
  async function checkConnection() {
    $('manager-connection').textContent = 'Manager: checking…';
    $('check-connection').disabled = true;
    try {
      const data = JSON.parse(await (await response('/api/status', {cache: 'no-store'}, 5000)).text());
      state.preview = !!data.preview; state.manager = !data.preview;
      state.backend = data.capabilities && typeof data.capabilities === 'object' ? data.capabilities : {};
      state.nativeVersion = typeof data.version === 'string' ? data.version : 'Not reported by native engine';
      state.connectionError = ''; updateMaintenance();
      state.reportedFirmware=data.firmware || data.systemFirmware || (data.console && data.console.firmware);
      selectFirmware(state.reportedFirmware);
      $('manager-connection').textContent = data.preview ? 'Preview · no console' : 'Manager: connected';
      $('manager-connection').className = 'badge' + (data.preview ? '' : ' good');
      if (supports('backupList')) loadBackups().catch(showMaintenanceError);
      $('connection-help').hidden = !data.preview;
      if (data.preview) {
        $('loader-connection').textContent = 'elfldr: preview only';
        $('connection-help').textContent = 'Browse and test controls here. Console installs and sends are disabled.';
      } else {
        $('connection-help').textContent = '';
        if (typeof data.elfldr === 'boolean') setLoader(data.elfldr, data.elfldr ? 'ready' : 'not listening');
        else if (!$('loader-connection').dataset.checked) $('loader-connection').textContent = 'elfldr: checked on send';
      }
    } catch (error) {
      state.manager = false;
      state.reportedFirmware='';
      state.backend = {}; state.connectionError = error.message; updateMaintenance();
      selectFirmware('');
      $('manager-connection').textContent = 'Manager: unreachable'; $('manager-connection').className = 'badge bad';
      $('loader-connection').textContent = 'elfldr: unknown'; $('loader-connection').className = 'badge';
      delete $('loader-connection').dataset.checked;
      $('connection-help').hidden = false;
      $('connection-help').textContent = 'Reconnect to the PS5 network and reopen http://<PS5-IP>:8085. ' + error.message;
    } finally { $('check-connection').disabled = false; updateSaveControls(); }
  }
  function setLoader(ok, message) {
    const badge = $('loader-connection'); badge.textContent = 'elfldr: ' + message;
    badge.className = 'badge' + (ok ? ' good' : ' bad'); badge.dataset.checked = 'true';
  }
  // Catalogue records are immutable after loading; weak keys release old catalogues on retry.
  const searchIndex = new WeakMap(), groupedIndex = new WeakMap(), personalIndex = new WeakMap();
  function searchText(file) {
    let text = searchIndex.get(file);
    if (text === undefined) {
      text = [file.title, file.id, ...(file.creators || [])].join(' ').toLowerCase();
      searchIndex.set(file, text);
    }
    return text;
  }
  function catalogueIndex(catalog) {
    let index = personalIndex.get(catalog);
    if (!index) {
      index = {games: new Map(groupCheats(catalog.cheats).map(game => [game.id, game])),
        files: new Map([...catalog.hens, ...catalog.modMenus, ...(catalog.emulators || []), ...(catalog.payloads || []), ...catalog.cheats].map(file => [file.path, file]))};
      personalIndex.set(catalog, index);
    }
    return index;
  }
  function filterCheats(files, filters) {
    const words = filters.query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    const version = filters.version.toLowerCase().trim();
    if (!words.length && !version && !filters.platform && !filters.format) return files;
    return files.filter(file => (!filters.platform || file.platform === filters.platform) &&
      (!filters.format || file.format === filters.format) && (!version || file.version.toLowerCase().includes(version)) &&
      (!words.length || words.every(word => searchText(file).includes(word))));
  }
  function groupCheats(files) {
    if (groupedIndex.has(files)) return groupedIndex.get(files);
    const games = new Map();
    for (const file of files) {
      if (!games.has(file.id)) games.set(file.id, {title: file.title, id: file.id, platform: file.platform, cover: file.cover, files: []});
      games.get(file.id).files.push(file);
    }
    const result = [...games.values()].sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
    groupedIndex.set(files, result);
    return result;
  }
  function applyFilters(reset = true) {
    if (!state.catalog) return;
    const files = filterCheats(state.catalog.cheats, {query: $('cheat-search').value, platform: $('cheat-platform').value, format: $('cheat-format').value, version: $('cheat-version').value});
    state.groups = groupCheats(files); if (reset) state.page = 0;
    saveBrowsing();
    $('cheat-count').textContent = state.groups.length.toLocaleString() + (state.groups.length === 1 ? ' game · ' : ' games · ') + files.length.toLocaleString() + ' matching files · ' + state.catalog.cheats.length.toLocaleString() + ' total files';
    renderGames();
  }
  function renderGames() {
    const container = $('cheat-games'); container.textContent = '';
    container.className = viewMode === 'list' ? 'game-list' : 'game-grid';
    const pages = Math.max(1, Math.ceil(state.groups.length / state.pageSize));
    state.page = Math.max(0, Math.min(state.page, pages - 1)); saveBrowsing();
    if (!state.groups.length) container.append(element('p', 'No matching games. Try another title, ID, version or format.', 'empty'));
    state.groups.slice(state.page * state.pageSize, (state.page + 1) * state.pageSize).forEach((game, index) => {
      const box = element('article', undefined, 'cover-card');
      const summary = action('', () => toggleGame()); summary.className = 'cover-opener';
      summary.dataset.gameOpener = 'true'; summary.setAttribute('aria-expanded', 'false');
      summary.setAttribute('aria-label', game.title + ' · ' + game.platform + ' · ' + game.id + ' · Open versions');
      const cover = element('span', undefined, 'cover-wrap'), placeholder = element('span', game.title.split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase(), 'cover-placeholder');
      placeholder.append(element('small', 'COVER UNAVAILABLE')); cover.append(placeholder);
      if (game.cover && /^Manager\/covers\/[A-Z]{4}\d{5}\.(jpg|png|webp)$/.test(game.cover)) {
        const image = element('img'); image.className = 'cover-image'; image.alt = ''; image.width = 320; image.height = 320;
        image.loading = 'lazy'; image.decoding = 'async'; image.referrerPolicy = 'no-referrer';
        image.src = repositoryBase + game.cover.split('/').map(encodeURIComponent).join('/');
        image.addEventListener('error', () => { image.hidden = true; }); cover.append(image);
      }
      cover.append(element('span', game.platform, 'cover-platform'));
      const formats = element('span', undefined, 'cover-formats');
      [...new Set(game.files.map(file => file.format))].sort().forEach(format => formats.append(element('span', format.toUpperCase(), 'cover-format'))); cover.append(formats);
      const versions = [...new Set(game.files.map(file => file.version))].sort(compareVersions);
      const meta = element('span', undefined, 'cover-meta');
      meta.append(element('span', game.id, 'cover-id'), element('strong', game.title, 'cover-title'));
      meta.append(element('span', versions.length + (versions.length === 1 ? ' version' : ' versions') + ' · Latest ' + versions[versions.length - 1], 'cover-count'));
      if(activeProfile.games&&activeProfile.games[game.id])meta.append(element('span','Your saved version: '+activeProfile.games[game.id],'cover-count'));
      const creators = [...new Set(game.files.flatMap(file => file.creators || []))];
      meta.append(element('span', creators.join(', ') || 'Creator not specified', 'cover-creators'));
      summary.append(cover, meta);
      const body = element('div', undefined, 'game-body');
      body.hidden = true; body.id = 'game-detail-' + game.id; summary.setAttribute('aria-controls', body.id);
      function toggleGame(close = false) {
        const open = close ? false : body.hidden;
        body.hidden = !open; box.dataset.open = String(open); summary.setAttribute('aria-expanded', String(open));
        if (!open) { summary.focus(); return; }
        if (body.childNodes.length) return;
        for (const version of versions) {
          const files = game.files.filter(file => file.version === version);
          const heading = element('div', undefined, 'row');
          heading.append(element('h3', 'Game version ' + version), transferButton('Install version (' + files.length + ')', files, game.title + ' · ' + version));
          body.append(heading);
          files.sort((a, b) => a.format.localeCompare(b.format)).forEach(file => body.append(cheatFile(file)));
        }
        body.append(action('Close', () => toggleGame(true), 'secondary'));
      }
      summary.addEventListener('keydown', event => {
        if (event.key === 'Escape') { toggleGame(true); return; }
        if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key)) return;
        const buttons = [...container.querySelectorAll('[data-game-opener]')];
        const columns = viewMode === 'list' ? 1 : getComputedStyle(container).gridTemplateColumns.split(' ').filter(Boolean).length;
        const step = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' ? -columns : columns;
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : Math.max(0, Math.min(buttons.length - 1, index + step));
        event.preventDefault(); buttons[next].focus(); buttons[next].scrollIntoView({block:'nearest'});
      });
      const star = favourite({...game.files[0], key: 'game:' + game.id, kind: 'game', title: game.title});
      star.className = 'cover-favourite'; star.setAttribute('aria-label', 'Favourite ' + game.title);
      updateFavourite(star);
      box.append(summary, body, star); container.append(box);
    });
    $('cheat-page').textContent = 'Page ' + (state.page + 1) + ' of ' + pages;
    $('cheat-prev').disabled = state.page === 0; $('cheat-next').disabled = state.page + 1 >= pages;
  }
  function compareVersions(a, b) {
    const left = a.split('.').map(Number), right = b.split('.').map(Number);
    for (let i = 0; i < Math.max(left.length, right.length); i++) { const diff = (left[i] || 0) - (right[i] || 0); if (diff) return diff; }
    return a.localeCompare(b);
  }
  let viewMode = storeRead('viewMode', 'grid') === 'list' ? 'list' : 'grid';
  async function loadStyle() {
    const blob = await response(repositoryBase + 'Manager/library.css', {cache:'no-cache'});
    let style = $('library-style');
    if (!style) { style = element('style'); style.id = 'library-style'; document.head.append(style); }
    style.textContent = await blob.text();
    document.documentElement.classList.add('library-wide');
    if (typeof navigator !== 'undefined' && /PlayStation 5/.test(navigator.userAgent)) document.documentElement.dataset.console = 'ps5';
  }
  function viewControls() {
    const row = element('div', undefined, 'view-controls');
    const grid = action('Grid', () => choose('grid')), list = action('List', () => choose('list'));
    function choose(mode) { viewMode = mode; storeWrite('viewMode', mode); grid.setAttribute('aria-pressed', String(mode === 'grid')); list.setAttribute('aria-pressed', String(mode === 'list')); renderGames(); }
    grid.setAttribute('aria-pressed', String(viewMode === 'grid')); list.setAttribute('aria-pressed', String(viewMode === 'list')); row.append(grid, list);
    $('cheat-games').before(row);
  }
  const destinations = {etahen:'/data/etaHEN/cheats',onionhen:'/data/OnionHEN/cheats'};
  let profiles = storeRead('profiles', []);
  if (!Array.isArray(profiles)) profiles=[];
  const initialProfile = profiles.find(profile=>profile.address===location.host);
  let activeProfile = initialProfile || {id:'console:'+location.host,name:location.host,address:location.host,firmware:manualFirmware,hen:'etahen',games:{}};
  if (!initialProfile) profiles.push(activeProfile);
  function destinationPath(destination) { return destinations[destination] || 'Unsupported destination'; }
  function supports(capability) {
    if (!state.manager || state.preview) return false;
    if (capability==='destinations') return Array.isArray(state.backend.destinations);
    return state.backend[capability] === true;
  }
  function profileMatchesConsole() {
    if (activeProfile.address===location.host) return true;
    $('maintenance-status').textContent='This profile belongs to '+activeProfile.address+'. Open that console’s Manager before installing.'; return false;
  }
  function saveProfiles() { storeWrite('profiles',profiles); }
  function saveSetup() {
    const entered=$('setup-firmware').value.trim(),version=firmwareValue(entered),hen=$('setup-hen').value;
    if(entered&&!version){$('setup-status').textContent='Use the exact firmware version, for example 10.01 or 13.60.';return false;}
    if(!['etahen','onionhen','cragson','other'].includes(hen))return false;
    if(!state.reportedFirmware&&!ps5Version){manualFirmware=version;storeWrite(consoleKey,version);activeProfile.firmware=version;selectFirmware('');$('console-firmware').value=version;}
    activeProfile.hen=hen;saveProfiles();$('profile-hen').value=hen;
    storeWrite('setup:'+location.host,true);$('setup-panel').hidden=true;
    $('maintenance-status').textContent='Console setup saved. '+(hen==='onionhen'&&!destinationAllowed('onionhen')?'This native Manager cannot yet install OnionHEN cheats.':'Cheat destination: '+destinationPath(state.destination));
    updateMaintenance();return true;
  }
  function setupControls() {
    const panel=element('section',undefined,'setup-panel');panel.id='setup-panel';panel.setAttribute('aria-labelledby','setup-heading');
    const heading=element('h2','Set up this console');heading.id='setup-heading';
    panel.append(heading,element('p','Choose this PS5’s firmware and active HEN.','hint'));
    const fields=element('div',undefined,'profile-fields');fields.append(inputField('1. Exact console firmware','setup-firmware',state.firmware),selectField('2. Active HEN','setup-hen',[['etahen','etaHEN'],['onionhen','onionHEN'],['cragson','cragson PS5-HEN'],['other','Other / unknown']],activeProfile.hen));panel.append(fields);
    panel.append(element('p','Cheats install to the selected supported destination.','hint'));
    const destinationInfo=element('details',undefined,'setup-destination');destinationInfo.append(element('summary','Destination details'),element('p','etaHEN: /data/etaHEN/cheats · OnionHEN: /data/OnionHEN/cheats','path'),element('p','OnionHEN installs need a native Manager reporting destination support. Selecting a HEN alone does not redirect uploads.','hint'));panel.append(destinationInfo);
    const actions=element('div',undefined,'row');actions.append(action('Save setup',saveSetup),action('Set up later',()=>{storeWrite('setup:'+location.host,true);panel.hidden=true;},'secondary'));panel.append(actions);
    const status=element('p','','status');status.id='setup-status';status.setAttribute('role','status');panel.append(status);panel.hidden=!!storeRead('setup:'+location.host,false);$('connection-help').after(panel);
    if(state.reportedFirmware||ps5Version)$('setup-firmware').disabled=true;
  }
  function setControllerMode(enabled) {
    document.documentElement.classList.toggle('controller-mode',enabled);storeWrite('controllerMode',enabled);
    const toggle=$('controller-mode');if(toggle){toggle.textContent=enabled?'TV / controller mode: ON':'TV / controller mode: OFF';toggle.setAttribute('aria-pressed',String(enabled));}
  }
  function inputField(label,id,value='') {
    const wrapper=element('label',label), input=element('input'); input.type='text'; input.id=id; input.value=value; wrapper.append(input); return wrapper;
  }
  function selectField(label,id,options,value) {
    const wrapper=element('label',label), select=element('select'); select.id=id;
    options.forEach(([id,title])=>{ const option=element('option',title); option.value=id; select.append(option); });
    select.value=value; wrapper.append(select); return wrapper;
  }
  const browsingKey = 'browsing:'+location.host;
  function saveBrowsing() {
    storeWrite(browsingKey, {...storeRead(browsingKey,{}),page:state.page,query:$('cheat-search').value,platform:$('cheat-platform').value,format:$('cheat-format').value,version:$('cheat-version').value});
  }
  function restoreBrowsing() {
    const saved=storeRead(browsingKey,{});
    if (!saved || typeof saved!=='object') return;
    state.page=Number.isInteger(saved.page)&&saved.page>=0?saved.page:0;
    for (const [id,key,values] of [['cheat-search','query'],['cheat-version','version'],['cheat-platform','platform',['','PS4','PS5']],['cheat-format','format',['','json','mc4','shn']]]) {
      const value=typeof saved[key]==='string'?saved[key].slice(0,150):'';
      $(id).value=!values||values.includes(value)?value:'';
    }
  }
  function restoreTab() {
    if(typeof selectTab!=='function'||typeof managerTabs==='undefined')return;
    const saved=storeRead(browsingKey,{}),original=selectTab;
    const tab=managerTabs.find(item=>item.id===saved.tab);
    if(tab){original(tab);if(window.requestAnimationFrame)window.requestAnimationFrame(()=>window.scrollTo(0,Math.max(0,Number(saved.scroll)||0)));}
    if(state.tabTracking)return;state.tabTracking=true;
    selectTab=function(next){
      original(next);storeWrite(browsingKey,{...storeRead(browsingKey,{}),tab:next.id,scroll:0});
    };
    if(window.addEventListener)window.addEventListener('pagehide',()=>storeWrite(browsingKey,{...storeRead(browsingKey,{}),scroll:window.scrollY||0}));
  }
  function releaseControls() {
    const panel=element('section',undefined,'release-panel');
    const row=element('div',undefined,'row'), badge=element('span','Checking published build…','badge');badge.id='update-badge';badge.setAttribute('role','status');
    row.append(badge,action('Check for updates',refreshPublishedBuild,'secondary'));panel.append(row);
    const notes=element('details',undefined,'release-notes');notes.id='release-notes';notes.open=storeRead('release-seen','')!==UI_RELEASE;
    notes.append(element('summary','What’s new · '+UI_RELEASE));
    const list=element('ul');
    for(const text of ['Save tools now connect to the bundled local Garlic engine for decrypt, encrypt, resign and reviewed import/restore.','Homepage now starts Manager automatically after the jailbreak. Other payloads are in Manager’s Payload library.','Clearer update status and firmware compatibility labels.','Review games, versions, file count and destination before installing.','Cheat search filters and page are remembered in this browser.','Simpler console setup on mobile; advanced settings remain collapsed.','Faster indexed searches and a lighter floating leaf background.'])list.append(element('li',text));
    notes.append(list,element('p','The stable Manager still uses its existing native storage API. Experimental native builds are separate.','hint'),action('Mark as read',()=>{storeWrite('release-seen',UI_RELEASE);notes.open=false;},'secondary'));panel.append(notes);
    $('connection-help').after(panel);
  }
  function maintenanceControls() {
    const panel=element('details',undefined,'maintenance-panel'), summary=element('summary','Versions, console profiles & maintenance');
    const body=element('div',undefined,'maintenance-body');
    const versions=element('div'); versions.id='build-details'; body.append(element('h3','Versions'),versions);
    const preferences=element('div',undefined,'row');
    const controller=action('TV / controller mode',()=>setControllerMode(!document.documentElement.classList.contains('controller-mode')),'secondary');controller.id='controller-mode';
    preferences.append(action('Export diagnostics',()=>downloadJSON('PSN-HUB-diagnostics.json',diagnostics()),'secondary'),action('Run console setup',()=>{$('setup-panel').hidden=false;$('setup-panel').scrollIntoView({block:'nearest'});},'secondary'),controller);body.append(preferences);
    const settings=element('div',undefined,'profile-fields');
    settings.append(selectField('Saved console profile','profile-select',profiles.map(profile=>[profile.id,profile.name]),activeProfile.id),inputField('Profile name','profile-name',activeProfile.name),inputField('Console address (including port)','profile-address',activeProfile.address),selectField('Active HEN (selected manually)','profile-hen',[['etahen','etaHEN'],['onionhen','onionHEN'],['cragson','cragson PS5-HEN'],['other','Other / unknown']],activeProfile.hen));
    body.append(element('h3','Console profiles'),settings);
    const profileActions=element('div',undefined,'row'); profileActions.append(action('Save profile',saveProfile),action('New profile',newProfile,'secondary')); body.append(profileActions);
    const games=element('div',undefined,'profile-fields'); games.append(inputField('Game title ID','profile-game-id'),inputField('Installed game version (manual)','profile-game-version')); body.append(games,action('Save game version',saveGameVersion,'secondary'));
    const gameList=element('p','','hint'); gameList.id='profile-game-list'; body.append(gameList);
    body.append(element('h3','Cheat destination'),selectField('Install cheats for','cheat-destination',[['etahen','etaHEN'],['onionhen','onionHEN — needs compatible native API']],'etahen'));
    const path=element('p','', 'path'); path.id='destination-path'; body.append(path);
    const support=element('p','','hint'); support.id='storage-capabilities'; body.append(support);
    const controls=element('div',undefined,'row');
    const compare=action('Check installed files',checkInventory); compare.id='check-installed';
    const updates=action('Install updates only',installUpdates); updates.id='install-updates'; controls.append(compare,updates); body.append(controls);
    const comparison=element('p','','hint'); comparison.id='inventory-status'; body.append(comparison);
    const backupLabel=element('label',undefined,'backup-toggle'), backupCheck=element('input'); backupCheck.type='checkbox'; backupCheck.id='backup-before-install'; backupCheck.checked=false; backupLabel.append(backupCheck,'Back up console cheats before replacing files'); body.append(backupLabel);
    const backupActions=element('div',undefined,'row'), backup=action('Back up now',()=>createBackup(state.destination).catch(showMaintenanceError)); backup.id='backup-now'; backupActions.append(backup);
    const backupList=element('select'); backupList.id='backup-list'; backupList.setAttribute('aria-label','Console backup to restore');
    const restore=action('Restore selected backup',restoreBackup,'secondary'); restore.id='restore-backup'; backupActions.append(backupList,restore); body.append(backupActions);
    const status=element('p','','status'); status.id='maintenance-status'; status.setAttribute('role','status'); body.append(status);
    panel.append(summary,body); $('connection-help').after(panel);
    $('profile-select').addEventListener('change',loadProfile);
    $('cheat-destination').addEventListener('change',()=>{ const next=$('cheat-destination').value; if(!destinationAllowed(next)){ $('cheat-destination').value=state.destination; showMaintenanceError(new Error('Native API upgrade required for '+destinationPath(next))); return; } state.destination=next; state.inventory=null; updateMaintenance(); renderGames(); if(supports('backupList'))loadBackups().catch(showMaintenanceError); });
    updateMaintenance(); refreshPublishedBuild();
  }
  async function refreshPublishedBuild() {
    $('update-badge').textContent='Checking published build…';state.buildError='';
    try { state.publishedBuild=JSON.parse(await (await response(repositoryBase+'Manager/build.json',{cache:'no-store'})).text()); updateMaintenance(); }
    catch(error) { state.publishedBuild=null;state.buildError=error.message; updateMaintenance(); }
  }
  function updateMaintenance() {
    if (!$('build-details')) return;
    const embedded=typeof managerBuild==='object'?managerBuild:{};
    const metadata=state.catalog && state.catalog.metadata || {};
    const published=state.publishedBuild || {};
    const lines=['ELF dashboard build: '+(embedded.buildId || 'Unreported — update the Manager ELF'),'Loaded UI release: '+UI_RELEASE,'Native engine: '+(state.nativeVersion || 'Not reported'),'Catalogue: '+(metadata.version || 'Loading…')+' · '+(metadata.updatedAt || ''),'Published build: '+(published.buildId || 'Unavailable')];
    const mismatch=(embedded.uiRelease && embedded.uiRelease!==UI_RELEASE)||(embedded.buildId && published.buildId && embedded.buildId!==published.buildId)||(metadata.version && embedded.catalogueVersion && metadata.version!==embedded.catalogueVersion);
    if(mismatch) lines.push('Update mismatch: publish matching assets, restart Manager and reload this page.');
    $('build-details').textContent=lines.join('\n');
    const update=$('update-badge');
    update.textContent=!published.buildId?'Update check unavailable':!embedded.buildId?'Running build unknown':mismatch?'Builds differ — restart Manager to update':'Up to date · '+embedded.buildId;
    update.className='badge '+(mismatch?'update-available':published.buildId&&embedded.buildId?'good':'');
    $('destination-path').textContent=destinationPath(state.destination);
    $('cheat-install-path').textContent='Installs to '+destinationPath(state.destination)+'/{json,mc4,shn}';
    $('storage-capabilities').textContent=(!supports('cheatInventory')||!supports('cheatBackup'))?'Current native ELF lacks console inventory/backup APIs. Those actions require a native Manager upgrade; browser history is not treated as an installed-file scan.':'Console inventory and backup APIs are available.';
    const busy=!!(state.transfer && state.transfer.running);
    $('check-installed').disabled=!supports('cheatInventory')||busy;
    $('install-updates').disabled=!supports('cheatInventory')||!state.inventory||state.inventory.destination!==state.destination||busy;
    $('backup-now').disabled=!supports('cheatBackup')||busy;
    $('restore-backup').disabled=!supports('cheatRestore')||!$('backup-list').value||busy;
    $('backup-before-install').disabled=!supports('cheatBackup')||busy;
    if(!supports('cheatBackup')) $('backup-before-install').checked=false;
    $('cheat-destination').disabled=busy;
    for(const id of ['profile-select','profile-name','profile-address','profile-hen','profile-game-id','profile-game-version']) $(id).disabled=busy;
    for(const option of $('cheat-destination').children) option.disabled=!destinationAllowed(option.value);
    $('profile-game-list').textContent=Object.entries(activeProfile.games||{}).map(([id,version])=>id+' · '+version).join(' / ')||'No manually saved game versions.';
  }
  function destinationAllowed(destination) { return destination==='etahen'||(Object.prototype.hasOwnProperty.call(destinations,destination)&&supports('destinations')&&state.backend.destinations.includes(destination)); }
  function showMaintenanceError(error) { $('maintenance-status').textContent=error.message; }
  function validAddress(value) { return /^[A-Za-z0-9.-]+:\d{1,5}$/.test(value)&&Number(value.split(':').slice(-1)[0])>0&&Number(value.split(':').slice(-1)[0])<=65535; }
  function saveProfile() {
    const address=$('profile-address').value.trim(),name=$('profile-name').value.trim();
    if(!name||!validAddress(address)){ showMaintenanceError(new Error('Enter a profile name and console address including port, for example 192.168.1.20:8085.'));return; }
    activeProfile.name=name; activeProfile.address=address; activeProfile.hen=$('profile-hen').value; activeProfile.firmware=state.firmwareSource.startsWith('Manually')?state.firmware:activeProfile.firmware;
    saveProfiles(); renderProfileOptions(); updateMaintenance(); $('maintenance-status').textContent='Profile saved in this browser. Active HEN and game versions are manual selections.';
  }
  function renderProfileOptions() { $('profile-select').textContent=''; profiles.forEach(profile=>{const option=element('option',profile.name);option.value=profile.id;$('profile-select').append(option);}); $('profile-select').value=activeProfile.id; }
  function newProfile() { activeProfile={id:'profile:'+Date.now(),name:'New PS5',address:location.host,hen:'etahen',firmware:'',games:{}};profiles.push(activeProfile);renderProfileOptions();fillProfile();saveProfiles(); }
  function fillProfile() {
    $('profile-name').value=activeProfile.name; $('profile-address').value=activeProfile.address;$('profile-hen').value=activeProfile.hen;
    manualFirmware=firmwareValue(activeProfile.firmware);storeWrite(consoleKey,manualFirmware);selectFirmware(state.reportedFirmware||'');if(!state.reportedFirmware)$('console-firmware').value=manualFirmware;
    state.inventory=null; updateMaintenance();
  }
  function loadProfile() { const profile=profiles.find(item=>item.id===$('profile-select').value);if(profile){activeProfile=profile;fillProfile();} }
  function saveGameVersion() {
    const id=$('profile-game-id').value.trim().toUpperCase(),version=$('profile-game-version').value.trim();
    if(!/^[A-Z]{4}\d{5}$/.test(id)||!/^\d{1,3}(?:\.\d{1,3}){1,3}$/.test(version)){showMaintenanceError(new Error('Enter an exact title ID and game version.'));return;}
    activeProfile.games=activeProfile.games||{};activeProfile.games[id]=version;saveProfiles();updateMaintenance();renderGames();$('maintenance-status').textContent='Manual game version saved.';
  }
  function planUpdates(files,inventory) {
    const installed=new Map(inventory.map(item=>[item.path,item]));
    return files.map(file=>{const existing=installed.get(file.target);return {file,status:!existing?'new':!existing.sha256?'unknown':existing.sha256===file.sha256?'unchanged':'changed'};});
  }
  async function checkInventory() {
    if(!supports('cheatInventory')||!profileMatchesConsole()) return;
    const destination=state.destination;$('inventory-status').textContent='Reading files from console…';
    try{const data=JSON.parse(await(await response('/api/cheats?destination='+destination,{cache:'no-store'})).text());
      if(data.destination!==destination||!Array.isArray(data.items)||data.items.some(item=>typeof item.path!=='string'||item.sha256&&!/^[a-f0-9]{64}$/i.test(item.sha256))) throw new Error('Invalid console inventory response');
      state.inventory={destination,items:data.items};const plan=planUpdates(state.catalog.cheats,data.items),counts={};plan.forEach(item=>counts[item.status]=(counts[item.status]||0)+1);
      $('inventory-status').textContent=(counts.new||0)+' new · '+(counts.changed||0)+' changed · '+(counts.unchanged||0)+' unchanged · '+(counts.unknown||0)+' need verification';updateMaintenance();
    }catch(error){state.inventory=null;showMaintenanceError(error);updateMaintenance();}
  }
  function installUpdates() {if(!supports('cheatInventory')||!state.inventory||state.inventory.destination!==state.destination)return;const files=planUpdates(state.catalog.cheats,state.inventory.items).filter(item=>item.status!=='unchanged').map(item=>item.file);if(!files.length){$('maintenance-status').textContent='All catalogue files match the console inventory.';return;}return startTransfer(files,'Install new and changed cheats');}
  async function loadBackups() {
    const destination=state.destination;
    const data=JSON.parse(await(await response('/api/cheats/backups?destination='+destination,{cache:'no-store'})).text());
    if(destination!==state.destination)return;
    if(data.destination!==destination||!Array.isArray(data.backups)||data.backups.some(item=>typeof item.id!=='string'||!/^[A-Za-z0-9._-]+$/.test(item.id)))throw new Error('Invalid backup list');
    const list=$('backup-list'),previous=list.value;list.textContent='';
    for(const item of data.backups){const option=element('option',item.id+' · '+destination);option.value=item.id;option.dataset.destination=destination;list.append(option);}
    list.value=data.backups.some(item=>item.id===previous)?previous:data.backups.length?data.backups[0].id:'';updateMaintenance();
  }
  async function createBackup(destination) {
    if(!supports('cheatBackup'))throw new Error('Console backups require a native Manager upgrade. No backup has been created.');
    if(!profileMatchesConsole())throw new Error('Wrong console profile');
    const data=JSON.parse(await(await response('/api/cheats/backup?destination='+destination,{method:'POST',headers:requestHeaders()},120000)).text());
    if(data.destination!==destination||typeof data.id!=='string'||!/^[A-Za-z0-9._-]+$/.test(data.id))throw new Error('Invalid backup response');
    const option=element('option',data.id+' · '+destination);option.value=data.id;option.dataset.destination=destination;$('backup-list').append(option);$('backup-list').value=data.id;updateMaintenance();$('maintenance-status').textContent='Console backup created: '+data.id;return data;
  }
  async function restoreBackup() {
    if(!supports('cheatRestore')||!profileMatchesConsole()||!$('backup-list').value)return;
    const option=[...$('backup-list').children].find(item=>item.value===$('backup-list').value),destination=option&&option.dataset.destination;
    if(!destinationAllowed(destination)||!confirm('Restore this console cheat backup to '+destinationPath(destination)+'? Matching files will be replaced.'))return;
    try{await response('/api/cheats/restore?destination='+destination+'&id='+encodeURIComponent(option.value),{method:'POST',headers:requestHeaders()},120000);state.inventory=null;$('maintenance-status').textContent='Console backup restored.';updateMaintenance();}catch(error){showMaintenanceError(error);}
  }
  function diagnostics() {
    const task=state.transfer, embedded=typeof managerBuild==='object'?managerBuild:{};
    const redact=value=>String(value||'').split(location.host).join('[console]');
    return {exportedAt:new Date().toISOString(),elfDashboard:embedded,uiRelease:UI_RELEASE,publishedBuild:state.publishedBuild,catalogue:state.catalog&&state.catalog.metadata,connection:{manager:state.manager,preview:state.preview,error:redact(state.connectionError)},firmware:{version:state.firmware,source:state.firmwareSource},profile:{hen:activeProfile.hen,gameVersions:activeProfile.games||{}},destination:state.destination,capabilities:state.backend,transfer:task?{title:task.title,destination:task.destination,total:task.entries.length,completed:task.completed.length,cancelled:task.cancelled,backup:task.backup&&task.backup.id,failures:task.failures.map(failure=>({path:failure.item.path,error:redact(failure.error)}))}:null};
  }
  function downloadJSON(name,data) {
    const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),link=element('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
  function badge(text, className = '') { return element('span', text, 'badge ' + className); }
  function transferButton(text, files, title) {
    const button = action(text, () => startTransfer(files, title));
    button.dataset.transfer = 'true'; button.disabled = !!(state.transfer && state.transfer.running); return button;
  }
  function cheatFile(file) {
    const row = element('article', undefined, 'file-entry');
    row.append(badge(file.format.toUpperCase()), badge(file.id + ' · v' + file.version), element('span', prettySize(file.size), 'muted'));
    row.append(element('p', 'Creator: ' + ((file.creators || []).join(', ') || 'Not specified in this file'), 'hint'));
    if (file.mods && file.mods.length) {
      const details = element('details'), summary = element('summary', 'Included cheats (' + file.mods.length + (file.mods.length === 30 ? '+' : '') + ')'), list = element('ul');
      file.mods.forEach(name => list.append(element('li', name))); details.append(summary, list); row.append(details);
    }
    if (file.notes) row.append(element('p', file.notes, 'hint'));
    const savedVersion=activeProfile.games&&activeProfile.games[file.id];
    if(savedVersion)row.append(badge('Profile game version: '+savedVersion,savedVersion===file.version?'good':'bad'));
    row.append(element('p', destinationPath(state.destination)+'/' + file.target, 'path'));
    const actions = element('div', undefined, 'row'); actions.append(transferButton('Install to PS5', [file], file.title), favourite(file));
    row.append(actions); return row;
  }
  function safeLink(label, url) {
    if (!/^https:\/\/github\.com\//.test(url || '')) return element('span', '');
    const link = element('a', label); link.href = url; link.target = '_blank'; link.rel = 'noopener'; return link;
  }
  function renderPayloads(container, items) {
    if(!container)return;
    container.textContent = '';
    const visible = items.filter(item => state.showIncompatible || compatibility(item) !== 'incompatible');
    const hidden = items.length - visible.length;
    if (hidden) container.append(element('p', hidden + ' incompatible item(s) hidden for firmware ' + state.firmware + '. Enable “Show incompatible” to inspect them.', 'compatibility-note'));
    if (!visible.length && !hidden) container.append(element('p', container.id==='emulator-catalog'?'No emulator installer files added yet.':'No payloads available yet.', 'hint'));
    visible.forEach(item => {
      const box = element('details', undefined, 'feature-card hen-card'), summary = element('summary', item.title), content = element('div', undefined, 'hen-card-content');
      content.append(element('p', item.description, 'hint'));
      const support = compatibility(item);
      summary.append(element('span', support === 'compatible' ? 'Supported · '+state.firmware : support === 'incompatible' ? 'Unsupported · '+state.firmware : 'Unconfirmed', 'compatibility-label '+support));
      content.append(badge(support === 'compatible' ? 'Supported on firmware ' + state.firmware : support === 'incompatible' ? 'Unsupported on ' + state.firmware + ' — sending blocked' : 'Unconfirmed — check the project requirements before sending', support === 'compatible' ? 'good' : support === 'incompatible' ? 'bad' : '')); 
      content.append(badge(item.author || 'Author not specified'), badge(item.release || 'Version not specified'), badge(prettySize(item.size)));
      if (item.firmware) {
        content.append(element('h3', 'Supported console firmware'));
        const list = element('ul');
        Object.entries(item.firmware).forEach(([series, versions]) => { const li = element('li', series + ' — '); versions.forEach(version => li.append(element('code', version), ' ')); list.append(li); });
        content.append(list);
      } else if (item.firmwareRanges) {
        content.append(element('h3','Supported console firmware'));
        item.firmwareRanges.forEach(range=>content.append(badge(range.min+' – '+range.max)));
        if (item.firmwareConditional && item.firmwareConditional.length) content.append(element('p','Conditional / unconfirmed on every console: '+item.firmwareConditional.join(', '),'hint'));
      } else content.append(badge('Console firmware: check project documentation'));
      if (item.gameCompatibility) { content.append(element('h3', 'Game compatibility')); const list = element('ul'); item.gameCompatibility.forEach(line => list.append(element('li', line))); content.append(list); }
      if (item.compatibilityNote) content.append(element('p', item.compatibilityNote, 'hint'));
      if(item.requirements){ content.append(element('h3','Requirements'));const requirements=element('ul');item.requirements.forEach(text=>requirements.append(element('li',text)));content.append(requirements); }
      for(const [key,label] of [['installLocation','Installs to'],['bios','BIOS'],['games','Game files'],['controls','Controls'],['uninstall','Uninstall']]) if(item[key])content.append(element('h3',label),element('p',item[key],key==='installLocation'?'path':'hint'));
      content.append(element('h3', 'Instructions'), element('p', item.instructions || 'Start a compatible HEN and elfldr, then send this payload.', 'hint'));
      const links = element('div', undefined, 'row'); links.append(safeLink('Project & documentation', item.project), safeLink('Releases / changelog', item.changelog)); content.append(links);
      content.append(element('p', item.name, 'path'));
      const actions = element('div', undefined, 'row');
      const send = transferButton('SEND', [item], item.title);
      send.dataset.incompatible = support === 'incompatible' ? 'true' : '';
      send.disabled = send.disabled || support === 'incompatible';
      actions.append(send, favourite(item), action('Close', () => { box.open = false; summary.focus(); }, 'secondary'));
      content.append(actions); box.append(summary, content); container.append(box);
    });
  }
  async function verify(blob, item) {
    if (item.size && blob.size !== item.size) throw new Error('Incomplete file: size does not match catalogue');
    if (!item.target) {
      const signature = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
      if (signature.length !== 4 || signature[0] !== 127 || signature[1] !== 69 || signature[2] !== 76 || signature[3] !== 70) throw new Error('Invalid ELF signature');
    }
    if (item.sha256 && typeof crypto !== 'undefined' && crypto.subtle) {
      const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
      const hash = Array.from(new Uint8Array(digest), x => x.toString(16).padStart(2, '0')).join('');
      if (hash !== item.sha256) throw new Error('File checksum does not match catalogue');
    }
  }
  function targetURL(item, destination = state.destination) {
    if (item.target) {
      if (!/^(json|mc4|shn)\//.test(item.target) || item.target.split('/').some(x => !x || x === '.' || x === '..')) throw new Error('Invalid cheat destination');
      if (destination !== 'etahen' && (!supports('destinations') || !state.backend.destinations.includes(destination))) throw new Error('This native Manager cannot install cheats to ' + destination + '. A native API upgrade is required.');
      return '/api/cheat-upload?path=' + encodeURIComponent(item.target) + (destination === 'etahen' ? '' : '&destination=' + encodeURIComponent(destination));
    }
    if (!/^[A-Za-z0-9._-]+\.(elf|bin)$/i.test(item.name)) throw new Error('Invalid payload name');
    return '/api/upload?name=' + encodeURIComponent(item.name);
  }
  function updateTransfer() {
    const task = state.transfer; if (!task) return;
    $('transfer-panel').hidden = false; $('transfer-title').textContent = task.title;
    $('transfer-progress').max = Math.max(1, task.entries.length); $('transfer-progress').value = task.completed.length;
    const bytes = task.completed.reduce((sum, item) => sum + (item.size || 0), 0);
    $('transfer-status').textContent = task.completed.length + ' / ' + task.entries.length + ' completed · ' + prettySize(bytes) + ' · ' + (task.message || 'Working…');
    $('cancel-transfer').disabled = !task.running || task.cancelled;
    $('retry-transfer').hidden = task.running || task.completed.length === task.entries.length;
    const report = $('transfer-report'); report.textContent = '';
    // Limit visible failure rows to keep large collection reports responsive.
    task.failures.slice(0, 50).forEach(failure => report.append(element('p', failure.item.path + ': ' + failure.error)));
    if (!task.running) report.append(element('p', task.completed.length + ' succeeded; ' + task.failures.length + ' failed; ' + (task.entries.length - task.completed.length - task.failures.length) + ' not attempted.'));
    document.querySelectorAll('[data-transfer]').forEach(button => { button.disabled = task.running || button.dataset.incompatible === 'true'; });
    updateMaintenance();
  }
  function installSummary(items, title, destination) {
    const background=items.length===1&&/^PSN-HUB-Store-Background(?:-Restore)?\.elf$/.test(items[0].name||'');
    if(background)return [title,items[0].name.includes('-Restore')?'Restore the previous background references saved by this artwork updater.':'Apply the displayed artwork to the already installed PSN-HUB Store shortcut. Both metadata databases are backed up first.','This updates only the Store tile’s background references. Refresh the home screen manually afterward.','Continue?'].join('\n\n');
    const cheats = items.some(item => item.target);
    const games = [...new Set(items.map(item => item.title || item.name))];
    const versions = [...new Set(items.map(item => item.version).filter(Boolean))];
    return [title, games.slice(0, 6).join(' / ') + (games.length > 6 ? ' / +'+(games.length-6)+' more games' : ''),
      versions.length ? 'Game versions: '+versions.slice(0, 6).join(', ')+(versions.length>6?' …':'') : '',
      'Files: '+items.length+' · '+prettySize(items.reduce((total,item)=>total+(item.size||0),0)),
      cheats ? 'Destination: '+destinationPath(destination) : 'Upload to Manager, then send to elfldr on this PS5.',
      cheats ? 'Matching files will be replaced.' : 'The payload will run on the console.',
      cheats && $('backup-before-install').checked ? 'A console backup must succeed before any files change.' : '', 'Continue?'].filter(Boolean).join('\n\n');
  }
  function downloadURL(path) {
    // Older running ELF dashboards only recognize Manager/ paths.
    if (/^payloads\/[A-Za-z0-9._-]+\.(?:elf|bin)$/.test(path)) return repositoryBase+path;
    return sourceURL(path);
  }
  async function startTransfer(items, title, resume = false) {
    if (state.transfer && state.transfer.running) { $('transfer-status').textContent = 'A transfer is already running. Wait or cancel it first.'; $('transfer-panel').scrollIntoView({block: 'nearest'}); return; }
    if (state.preview) { $('catalog-status').textContent = 'Preview only — open Manager at your PS5 address to install or send files.'; return; }
    if (!items.length) return;
    if (items.some(item => !item.target && !canSendName(item.name))) return;
    if (!profileMatchesConsole()) return;
    if(!resume&&items.some(item=>item.target)&&activeProfile.hen==='onionhen'&&state.destination!=='onionhen'&&!confirm('Your profile uses OnionHEN, but this install targets '+destinationPath(state.destination)+'. This native build cannot redirect it to OnionHEN. Continue to the displayed etaHEN directory?'))return;
    if(!resume&&items.length<=12&&items.some(item=>item.target&&activeProfile.games&&activeProfile.games[item.id]&&activeProfile.games[item.id]!==item.version)&&!confirm('Some selected cheats differ from the game versions saved in your profile. Install them anyway?'))return;
    const destination = resume ? state.transfer.destination : state.destination;
    if (items.some(item => item.target)) { try { targetURL(items.find(item=>item.target),destination); } catch(error) { $('catalog-status').textContent=error.message; return; } }
    if (!resume && !confirm(installSummary(items, title, destination))) return;
    const previous = state.transfer;
    const task = {entries: resume ? previous.entries : [...items], title, destination, completed: resume ? [...previous.completed] : [], failures: [], running: true, cancelled: false, message: 'Downloading…', controller: new AbortController()};
    state.transfer = task; updateTransfer();
    $('transfer-panel').scrollIntoView({block: 'nearest', behavior: 'smooth'});
    if (items.some(item=>item.target) && $('backup-before-install').checked) {
      try { task.message='Creating console backup before changes…'; updateTransfer(); task.backup=await createBackup(destination); }
      catch(error) { task.running=false; task.message='No files changed: backup failed. '+error.message; updateTransfer(); return; }
    }
    let next = 0, stop = false;
    const workers = Array.from({length: Math.min(4, items.length)}, async () => {
      while (!stop && !task.cancelled && next < items.length) {
        const item = items[next++];
        try {
          const uploadURL = targetURL(item,task.destination);
          const blob = await response(downloadURL(item.path), {cache: 'no-store', signal: task.controller.signal});
          await verify(blob, item);
          if (task.cancelled) break;
          task.message = 'Saving ' + (item.target || item.name) + '…'; updateTransfer();
          // Finish an accepted upload before stopping so cancellation cannot cut it short.
          await response(uploadURL, {method: item.target ? 'POST' : 'PUT', headers: requestHeaders(), body: blob}, 60000);
          if(item.target){state.inventory=null;$('inventory-status').textContent='Console files changed. Check installed files again before comparing.';}
          if (!item.target) {
            task.message = 'Sending to elfldr…'; updateTransfer();
            try { await response('/api/send?name=' + encodeURIComponent(item.name), {method: 'POST', headers: requestHeaders()}, 30000); setLoader(true, 'last send succeeded'); }
            catch (error) { setLoader(false, 'send failed — check loader'); throw error; }
          }
          task.completed.push(item); record(item); task.message = task.cancelled ? 'Cancelling after current uploads…' : 'Installing…'; updateTransfer();
        } catch (error) {
          if (!task.cancelled) { task.failures.push({item, error: error.message}); stop = true; task.message = 'Finishing in-flight files after an error…'; updateTransfer(); }
        }
      }
    });
    await Promise.allSettled(workers);
    task.running = false;
    task.message = task.cancelled ? 'Cancelled. Completed files remain installed.' : task.completed.length === task.entries.length ? 'Complete. Files saved on PS5.' : 'Stopped. Retry remaining files to continue.';
    updateTransfer();
    if (task.completed.some(item => !item.target) && typeof refresh === 'function') refresh();
  }
  function cancelTransfer() {
    const task = state.transfer; if (!task || !task.running) return;
    task.cancelled = true; task.controller.abort(); task.message = 'Cancelling; accepted uploads will finish…'; updateTransfer();
  }
  function retryTransfer() {
    const task = state.transfer; if (!task || task.running) return;
    const done = new Set(task.completed.map(item => item.path));
    return startTransfer(task.entries.filter(item => !done.has(item.path)), task.title, true);
  }
  async function sendSaved(item) {
    if (!canSendName(item.name)) return;
    if (state.preview) { $('catalog-status').textContent = 'Preview only — no console connected.'; return; }
    if (state.transfer && state.transfer.running) { $('catalog-status').textContent = 'Wait for the current transfer to finish.'; return; }
    try { await response('/api/send?name=' + encodeURIComponent(item.name), {method: 'POST', headers: requestHeaders()}); setLoader(true, 'last send succeeded'); record(item); }
    catch (error) { setLoader(false, 'send failed'); $('catalog-status').textContent = error.message; }
  }
  async function init() {
    if (builtinCatalog) {
      state.catalog = {...builtinCatalog, cheats: []};
      renderPayloads($('hen-catalog'), builtinCatalog.hens); renderPayloads($('mod-menu-catalog'), builtinCatalog.modMenus);
    }
    try {
      const data = await loadCatalog();
      for (const key of ['hens', 'modMenus', 'cheats']) if (!Array.isArray(data[key])) throw new Error('Invalid catalogue');
      state.catalog = data;
      renderPayloads($('hen-catalog'), data.hens); renderPayloads($('mod-menu-catalog'), data.modMenus); renderPayloads($('emulator-catalog'), data.emulators || []);
      $('download-all-cheats').disabled = false; applyFilters(false); renderPersonal(); restoreTab();
      if(typeof location!=='undefined'&&location.hash==='#console-saves')selectTab($('tab-save-manager'));
      updateMaintenance();
      updateSaveControls();
    } catch (error) { $('cheat-count').textContent = 'Catalogue unavailable. Check internet access and retry.'; $('catalog-status').textContent = error.message; }
  }
  let debounce;
  for (const id of ['cheat-search', 'cheat-platform', 'cheat-format', 'cheat-version']) $(id).addEventListener('input', () => { clearTimeout(debounce); debounce = setTimeout(applyFilters, 150); });
  $('cheat-prev').addEventListener('click', () => { state.page = Math.max(0, state.page - 1); renderGames(); });
  $('cheat-next').addEventListener('click', () => { if ((state.page + 1) * state.pageSize < state.groups.length) state.page++; renderGames(); });
  $('download-all-cheats').dataset.transfer = 'true';
  $('download-all-cheats').addEventListener('click', () => state.catalog && startTransfer(state.catalog.cheats, 'Download all cheats'));
  $('cancel-transfer').addEventListener('click', cancelTransfer); $('retry-transfer').addEventListener('click', retryTransfer);
  $('check-connection').addEventListener('click', checkConnection);
  $('retry-library').addEventListener('click', () => { catalogPromise = null; init(); checkConnection(); loadStyle().catch(error => { $('catalog-status').textContent = error.message; }); });
  window.PSNLibrary = {record, favourite, filterCheats, groupCheats, verify, targetURL, startTransfer, cancelTransfer, retryTransfer, checkConnection, compatibility, selectFirmware, canSendName, diagnostics, planUpdates, checkInventory, installUpdates, createBackup, restoreBackup, destinationAllowed, saveProfile, saveGameVersion, saveSetup, setControllerMode, installSummary, downloadURL, saveBrowsing, restoreBrowsing, applyFilters, state};
  const payloadLibrary=element('section',undefined,'card');
  payloadLibrary.hidden=true;
  const payloadCards=element('div');payloadCards.id='payload-library';payloadLibrary.append(payloadCards);$('panel-payloads').prepend(payloadLibrary);
  let saveControls=null;
  function consoleSaveURL() {
    const host=location.hostname.replace(/^\[|\]$/g,'');
    return 'http://'+(host.includes(':')?'['+host+']':host)+':8088/#console-saves';
  }
  async function openConsoleSaves() {
    if(!saveControls||!state.manager||state.preview)return;
    if(supports('saveRead'))return saveTask(refreshSaves);
    if(!saveControls.frame.src)saveControls.frame.src=consoleSaveURL();
  }
  function updateSaveControls() {
    if(!saveControls)return;
    const available=state.manager&&!state.preview&&supports('saveRead');
    saveControls.refresh.disabled=!available||saveControls.busy;
    saveControls.refresh.hidden=!available;
    saveControls.bridge.hidden=available||!state.manager||state.preview;
    saveControls.usb.hidden=!available;
    saveControls.usbStatus.textContent=supports('saveUSB')?'Choose a connected USB drive. Automatic backup runs on the PS5 while this save service is running.':'USB backups require save service 0.3.3. Start the updated service from the main Manager Saves tab.';
    saveControls.usbButtons.forEach(button=>button.disabled=!available||!supports('saveUSB'));
    saveControls.status.textContent=available?'Your console game saves. Close games before downloading or backing up.':'Your console saves open below through the local save service. If it is not running, use Start save service, then Reload save browser.';
    if(!available){saveControls.list.replaceChildren();saveControls.files.replaceChildren();}
    if(state.manager&&!state.preview&&$('tab-save-manager').getAttribute('aria-selected')==='true'&&!saveControls.autoLoaded){saveControls.autoLoaded=true;openConsoleSaves();}
  }
  async function saveJSON(path,post=false) {return JSON.parse(await (await response(path,post?{method:'POST',headers:{'X-PSNHUB-Request':'1'}}:{cache:'no-store'},post?300000:30000)).text());}
  async function saveTask(fn) {
    if(!saveControls||saveControls.busy)return;
    if(!state.manager||state.preview||!supports('saveRead')){updateSaveControls();return;}
    saveControls.busy=true;saveControls.refresh.disabled=true;saveControls.list.querySelectorAll('button').forEach(button=>button.disabled=true);
    try{await fn();}catch(error){saveControls.status.textContent=error.message;}finally{saveControls.busy=false;saveControls.refresh.disabled=false;saveControls.list.querySelectorAll('button').forEach(button=>button.disabled=false);}
  }
  async function showSaveFiles(query,label) {
    const data=await saveJSON('/api/saves/files?'+query);saveControls.files.replaceChildren(element('h3',label));
    if(!data.items.length)saveControls.files.append(element('p','No raw files found.','hint'));
    for(const file of data.items){const link=element('a','Download '+file.name+' ('+file.size+' bytes)');link.href='/api/saves/download?'+query+'&name='+encodeURIComponent(file.name);link.download=file.name;const row=element('p');row.append(link);saveControls.files.append(row);}
    if(typeof saveControls.files.scrollIntoView==='function')saveControls.files.scrollIntoView({block:'start',behavior:'smooth'});
  }
  async function refreshSaves() {
    saveControls.status.textContent='Reading save folders…';saveControls.files.replaceChildren();
    const data=await saveJSON('/api/saves'),backups=await saveJSON('/api/saves/backups');saveControls.list.replaceChildren();
    if(!data.items.length)saveControls.list.append(element('p','No PS4 or PS5 save folders found for the users on this console.','hint'));
    for(const item of data.items){const query='user='+encodeURIComponent(item.user)+'&platform='+encodeURIComponent(item.platform)+'&title='+encodeURIComponent(item.title);const known=state.catalog&&state.catalog.cheats&&state.catalog.cheats.find(game=>game.id===item.title&&game.title&&game.title!==item.title);const label=(known?known.title+' · ':'')+item.platform.toUpperCase()+' · '+item.title+' · User '+item.user;
      const row=element('section',undefined,'card');row.append(element('strong',label),action('View saves / download',()=>saveTask(()=>showSaveFiles(query,label)),'secondary'));
      if(supports('saveBackup'))row.append(action('Back up title',()=>saveTask(async()=>{saveControls.status.textContent='Copying and verifying raw files. Keep the game closed…';const result=await saveJSON('/api/saves/backup?'+query,true);await showSaveFiles('id='+encodeURIComponent(result.id),result.id);saveControls.status.textContent='Snapshot saved on console: '+result.id+'. Download every listed file, including PS4 .bin keys. This is raw data, not a verified restorable export.';}),'secondary'));
      if(supports('saveUSB'))row.append(action('Back up save to USB',()=>saveTask(async()=>{const usb=saveControls.usbSelect.value;if(!usb)throw Error('Connect a USB drive and refresh USB devices first.');saveControls.status.textContent='Copying and verifying this save on USB. Keep the game closed…';const result=await saveJSON('/api/saves/usb/export?usb='+encodeURIComponent(usb)+'&'+query,true);saveControls.status.textContent='Save copied to '+result.path;}),'secondary'));
      saveControls.list.append(row);
    }
    saveControls.list.append(element('h3','Raw snapshots on this console'));
    for(const item of backups.items)saveControls.list.append(action(item.id,()=>saveTask(()=>showSaveFiles('id='+encodeURIComponent(item.id),item.id)),'secondary'));
    saveControls.status.textContent=data.items.length+' game save folders found on this console. Select View saves / download to download their files. '+backups.items.length+' snapshots. These are raw encrypted console files; download PS4 companion .bin files too.';
    if(supports('saveUSB'))await refreshSaveUSB();
  }
  async function refreshSaveUSB(){
    const data=await saveJSON('/api/saves/usb');const selected=saveControls.usbSelect.value;saveControls.usbSelect.replaceChildren();
    for(const id of data.volumes){const option=element('option',id.toUpperCase());option.value=id;saveControls.usbSelect.append(option);}
    saveControls.usbSelect.value=data.volumes.includes(selected)?selected:data.volumes.includes(data.usb)?data.usb:data.volumes[0]||'';
    saveControls.auto.checked=data.enabled;saveControls.minutes.value=String(data.minutes);
    saveControls.usbStatus.textContent=(data.volumes.length?'Backups go to USB /PSN-HUB/Saves, organised by user, platform and game.':'No mounted USB drive detected. Connect an exFAT drive and refresh.')+(data.enabled?' Automatic backup is enabled every '+data.minutes+' minutes while the save service runs.':' Automatic backup is off.')+(data.lastRun?' Last run: '+(data.lastSuccess?'completed':'failed; check USB storage')+'. '+data.exported+' copied, '+data.skipped+' unchanged.':'');
  }
  async function loadSaveTools(container,button) {
    button.disabled=true;button.textContent='Loading save tools…';container.textContent='';
    try{
      for(const [path,ready] of [['Manager/vendor/fflate-0.8.2.js',()=>window.fflate],['Manager/save-tools.js',()=>window.PSNSaveTools]]){
        if(ready())continue;const script=element('script');script.textContent=await (await response(repositoryBase+path+'?v='+UI_RELEASE,{cache:'no-store'},20000)).text();document.head.append(script);if(!ready())throw Error('Could not initialize '+path);
      }
      const nativeJSON=async(path,post=false)=>JSON.parse(await (await response(path,post?{method:'POST',headers:requestHeaders()}:{cache:'no-store'},300000)).text());
      const canImport=()=>state.manager&&!state.preview&&supports('saveRead')&&supports('saveBackup');
      window.PSNSaveTools.mount({container,element,action,fflate:window.fflate,fetch:(...args)=>fetch(...args),hostname:location.hostname,
        canStart:()=>state.manager&&!state.preview&&!!state.catalog&&!(state.transfer&&state.transfer.running),canImport,
        startEngine:async name=>{const item=state.catalog&&state.catalog.payloads.find(item=>item.name===name);if(!item)throw Error('Refresh the library to load the current save engine.');await startTransfer([item],'Start local save engine');},
        backup:async selection=>{if(!canImport())throw Error('Open the experimental Manager on port 8087 for backed-up imports.');const list=await nativeJSON('/api/saves');if(!list.items.some(item=>item.user===selection.user&&item.platform===selection.platform&&item.title===selection.title))return {newTitle:true};const query='user='+encodeURIComponent(selection.user)+'&platform='+selection.platform+'&title='+selection.title;return nativeJSON('/api/saves/backup?'+query,true);},
        snapshotSource:{list:()=>nativeJSON('/api/saves/backups'),files:id=>nativeJSON('/api/saves/files?id='+encodeURIComponent(id)),download:(id,name)=>response('/api/saves/download?id='+encodeURIComponent(id)+'&name='+encodeURIComponent(name),{cache:'no-store'},300000)}
      });button.hidden=true;
    }catch(error){button.disabled=false;button.textContent='Retry loading save tools';container.textContent=error.message;}
  }
  const BACKGROUND_HASH='43ae997fe0b0ff3dca9d50d489baa9f948caa9069815c0c443700369c1e24d85';
  function backgroundControls() {
    const card=element('section',undefined,'card'),status=element('p','Apply the matching artwork after installing the PSN-HUB Store shortcut.','hint');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    card.append(element('h2','Jailbreak tile background'));
    const details=element('details');details.append(element('summary','Preview background'));const img=element('img');img.src=repositoryBase+'Manager/assets/jailbreak-background.png?v='+BACKGROUND_HASH.slice(0,12);img.alt='PSN-HUB mascot with floating green weed leaves on a dark purple background';img.loading='lazy';img.className='console-background-preview';details.append(img);card.append(details);
    const buttons=[];
    async function run(name,operation,label){
      if(state.preview||!state.manager){status.textContent='Open Manager on the PS5 to apply or restore its background.';return;}
      const item=state.catalog&&state.catalog.payloads.find(item=>item.name===name);if(!item){status.textContent='Refresh the library to load the background payloads.';return;}
      buttons.forEach(button=>button.disabled=true);const previous=state.transfer;
      try{await startTransfer([item],label);const task=state.transfer;if(task===previous||!task||task.running||task.cancelled||task.failures.length||!task.completed.some(done=>done.path===item.path)){status.textContent='Background operation was not sent. Check the transfer report.';return;}
        status.textContent='Payload sent. Waiting for the console result…';const host=(location.hostname||location.host.split(':')[0]).replace(/^\[|\]$/g,'');const url='http://'+(host.includes(':')?'['+host+']':host)+':8093/api/status';let result;
        for(let attempt=0;attempt<10;attempt++){try{result=JSON.parse(await (await response(url,{cache:'no-store'},2000)).text());break;}catch(error){if(attempt===9)throw Error('Payload sent, but its result was not confirmed. Check the console before sending again.');await new Promise(resolve=>setTimeout(resolve,500));}}
        if(!result||result.sha256!==BACKGROUND_HASH||result.operation!==operation)throw Error('Unexpected background updater result. Check the console before retrying.');
        status.textContent=result.message;if(!result.success)throw Error('Background update refused: '+result.message);
      }catch(error){status.textContent=error.message;}finally{buttons.forEach(button=>button.disabled=false);}
    }
    const apply=action('Apply jailbreak background',()=>run('PSN-HUB-Store-Background.elf','apply-background','Apply jailbreak background'));
    const restore=action('Restore previous background',()=>run('PSN-HUB-Store-Background-Restore.elf','restore-background','Restore previous background'),'secondary');buttons.push(apply,restore);card.append(apply,restore,status);$('panel-my-library').append(card);
  }
  function saveManagerControls() {
    if(typeof managerTabs==='undefined'||typeof selectTab!=='function')return;
    const tab=element('button','SAVES (WIP)','tab');tab.id='tab-save-manager';tab.type='button';tab.tabIndex=-1;
    tab.setAttribute('role','tab');tab.setAttribute('aria-selected','false');tab.setAttribute('aria-controls','panel-save-manager');
    const panel=element('div',undefined,'tab-panel');panel.id='panel-save-manager';panel.hidden=true;panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',tab.id);
    const card=element('section',undefined,'card');card.append(element('h2','Save Manager (WIP)'),element('p','Advanced save tools are experimental. Keep independent, verified backups.','hint'),element('p','Close games before backup or import. Keep independent backups. Advanced tools use the bundled Garlic SaveMgr engine on this console.','hint'));
    const tools=element('div');tools.id='save-advanced-tools';const openTools=action('Open advanced save tools',()=>loadSaveTools(tools,openTools),'secondary');const advanced=element('details');advanced.append(element('summary','Advanced save tools (WIP)'),openTools,tools);
    const credit=element('p','Save processing engine by earthonion: ','hint');
    for(const [title,repo] of [['Garlic SaveMgr','garlic-savemgr'],['Garlic Worker','garlic-worker']]){const link=element('a',title+' ');link.href='https://github.com/earthonion/'+repo;credit.append(link);}
    const status=element('p',undefined,'hint'),list=element('div'),files=element('div'),refresh=action('Refresh saves and snapshots',()=>saveTask(refreshSaves),'secondary');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    const usb=element('section',undefined,'card'),usbStatus=element('p',undefined,'hint'),usbSelect=element('select');usbSelect.setAttribute('aria-label','USB backup drive');
    const auto=element('input');auto.type='checkbox';const autoLabel=element('label','Automatically back up changed saves to USB ');autoLabel.append(auto);
    const minutes=element('select');minutes.setAttribute('aria-label','Automatic backup interval');for(const value of [15,30,60,180,1440]){const option=element('option',value+' minutes');option.value=String(value);minutes.append(option);}minutes.value='30';
    const refreshUSB=action('Refresh USB devices',()=>saveTask(refreshSaveUSB),'secondary');
    const allUSB=action('Back up all changed saves to USB',()=>saveTask(async()=>{if(!usbSelect.value)throw Error('Connect a USB drive first.');saveControls.status.textContent='Backing up changed saves to USB. Keep games closed…';const result=await saveJSON('/api/saves/usb/all?usb='+encodeURIComponent(usbSelect.value),true);await refreshSaveUSB();saveControls.status.textContent=result.exported+' save folders copied to USB; '+result.unchanged+' unchanged.';}),'secondary');
    const configUSB=action('Save automatic backup settings',()=>saveTask(async()=>{const id=usbSelect.value||'usb0';await saveJSON('/api/saves/usb/config?usb='+encodeURIComponent(id)+'&enabled='+(auto.checked?'1':'0')+'&minutes='+encodeURIComponent(minutes.value),true);await refreshSaveUSB();saveControls.status.textContent='USB automatic backup settings saved on this console.';}),'secondary');
    usb.append(element('h3','USB save backups'),usbStatus,usbSelect,refreshUSB,allUSB,autoLabel,minutes,configUSB);
    const bridge=element('section'),frame=element('iframe');frame.title='Console game saves';frame.className='console-save-browser';
    const direct=element('a','Open save browser in a full page');direct.href=typeof location!=='undefined'?consoleSaveURL():'#';direct.target='_blank';direct.rel='noopener';
    const reload=action('Reload save browser',()=>{if(state.manager&&!state.preview)frame.src=consoleSaveURL();},'secondary');
    const start=action('Start save service',async()=>{const item=state.catalog&&state.catalog.payloads.find(item=>item.name==='PSN-HUB-Save-Service.elf');if(!item){status.textContent='Refresh the library to load the save service.';return;}if(!state.manager||state.preview)return;await startTransfer([item],'Start console save service');status.textContent='If the service started successfully, select Reload save browser.';},'secondary');
    bridge.append(element('p','The save browser runs locally on your PS5. Start the service after a reboot if the browser below cannot connect.','hint'),start,reload,direct,frame);
    saveControls={status,list,files,refresh,bridge,frame,usb,usbStatus,usbSelect,auto,minutes,usbButtons:[refreshUSB,allUSB,configUSB],busy:false,autoLoaded:false};card.append(status,bridge,refresh,usb,list,files,advanced,credit);panel.append(card);managerTabs[managerTabs.length-1].after(tab);$('panel-emulators').after(panel);managerTabs.push(tab);updateSaveControls();
    tab.addEventListener('click',async()=>{selectTab(tab);await openConsoleSaves();});tab.addEventListener('keydown',event=>{if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();const next=managerTabs[(managerTabs.indexOf(tab)+(event.key==='ArrowRight'?1:-1)+managerTabs.length)%managerTabs.length];selectTab(next);next.focus();}});
  }
  saveManagerControls(); backgroundControls(); restoreBrowsing(); releaseControls();
  firmwareControls();
  maintenanceControls();
  setupControls();setControllerMode(!!storeRead('controllerMode',!!ps5Version));
  startLeafBackground();
  viewControls(); loadStyle().catch(error => { $('catalog-status').textContent = 'Cover layout unavailable. Retry library. ' + error.message; });
  renderPersonal(); checkConnection(); init();
  if(typeof location!=='undefined'&&location.hash==='#console-saves'){
    document.documentElement.classList.add('saves-only');selectTab($('tab-save-manager'));
  }
  if (typeof refresh === 'function') refresh();
})();
