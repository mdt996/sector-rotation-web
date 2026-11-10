// App chrome: status line, error banner, refresh button and the settings sheet.
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const native = () => (typeof window.Native !== 'undefined' ? window.Native : null);
  const N = native(); // the app's bridge (null in a plain browser), used by the update code below
  const fmtTime = (ms) => (ms ? new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—');
  const fmtDay = (d) => (d ? new Date(d + 'T00:00:00Z').toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }) : '—');
  const sheet = $('settings');

  function status() {
    const st = SRApp.state;
    $('btn-refresh').classList.toggle('spin', !!st.loading);
    const S = dash.data('settings'), asof = S.status === 'ok' && S.data[0] ? S.data[0].asof : null;
    const s = $('app-status');
    if (st.loading) s.textContent = 'Refreshing…';
    else if (st.at) s.textContent = `${st.source === 'yahoo' ? 'Yahoo' : 'eToro'} · closes to ${fmtDay(asof)} · updated ${fmtTime(st.at)}`;
    else s.textContent = 'No data yet';
    const b = $('app-banner');
    if (st.error && !st.loading) {
      b.hidden = false;
      $('app-banner-text').textContent = st.error.message;
      $('app-banner-action').hidden = !(st.error.kind === 'keys' || st.error.kind === 'network');
      b.classList.toggle('is-info', st.error.kind === 'partial');
    } else b.hidden = true;
  }
  SRApp.onChange(status);

  function selectedSource() {
    const r = document.querySelector('input[name="source"]:checked');
    return r ? r.value : 'etoro';
  }
  function toggleKeys() { $('keys').hidden = selectedSource() !== 'etoro'; }
  // eToro keys: count the characters and spot keys pasted the wrong way round (the User key is the long one)
  function keyHints() {
    const a = SRApp.cleanKey($('cfg-api').value), u = SRApp.cleanKey($('cfg-user').value);
    $('api-count').textContent = a ? `${a.length} characters` : '';
    $('user-count').textContent = u ? `${u.length} characters` : '';
    $('keys-swap').hidden = !(a && u && a.length > u.length);
  }
  function swapKeys() { const a = $('cfg-api').value; $('cfg-api').value = $('cfg-user').value; $('cfg-user').value = a; keyHints(); }
  function fill() {
    const c = SRApp.config();
    document.querySelectorAll('input[name="source"]').forEach((r) => { r.checked = r.value === c.source; });
    $('cfg-api').value = c.apiKey || '';
    $('cfg-user').value = c.userKey || '';
    $('cfg-notify').checked = c.notify !== false;
    $('cfg-go').checked = c.notifyGo !== false;
    $('cfg-phase').checked = c.notifyPhase !== false;
    $('cfg-watchon').checked = c.notifyWatch !== false;
    $('cfg-watch').value = c.watch || '';
    $('cfg-regime').checked = c.notifyRegime !== false;
    $('cfg-holdon').checked = c.notifyHoldings !== false;
    $('cfg-holdings').value = c.holdings || '';
    $('cfg-sync').value = c.syncToken || '';
    if (window.SRSync) window.SRSync.showStatus();
    $('cfg-holdings').placeholder = (window.SR_HOLDINGS || []).map((h) => h.ticker + (h.tracks !== h.ticker ? ' = ' + h.tracks : '') + (h.long_term ? ' long' : '')).join('\n');
    toggleKeys();
    keyHints();
    const N = native();
    $('notify-perm').hidden = !N || !N.notificationsAllowed || N.notificationsAllowed();
    $('notify-test').hidden = !N;
    let last = null;
    try { last = JSON.parse((N && N.lastBackgroundRun && N.lastBackgroundRun()) || 'null'); } catch (e) { last = null; }
    $('bg-status').textContent = last
      ? `Last background check: ${new Date(last.at).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}${last.ok ? '' : ' (failed: check the data source)'}`
      : 'The first background check runs within the hour after setup.';
    let info = {};
    try { info = JSON.parse((N && N.appInfo && N.appInfo()) || '{}'); } catch (e) { info = {}; }
    $('app-version').textContent = info.version ? 'Version ' + info.version : '';
    $('alerts-block').hidden = info.platform === 'mac'; // background alerts are the phone's
    showUpdateInfo();
  }
  // screens and logic update themselves from the public repository; this line says which copy is running
  function showUpdateInfo(msg) {
    let u = {};
    try { u = JSON.parse((N && N.updateInfo && N.updateInfo()) || '{}'); } catch (e) { u = {}; }
    const when = u.last && u.last.at ? new Date(u.last.at).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : null;
    const parts = [];
    if (u.active) parts.push(`Screens build ${u.active}${u.downloaded ? ' (updated automatically)' : ''}`);
    if (msg) parts.push(msg);
    else if (when) parts.push(`last checked ${when}: ${u.last.message}`);
    if (u.needs_app_update) parts.push('a newer app version is needed for the next update: ask Claude for the APK');
    $('update-status').textContent = parts.join(' · ');
  }
  window.appUpdateResult = (build, message) => {
    showUpdateInfo(build > 0 ? `updated to build ${build}` : message);
    if (build > 0) offerReload(build);
  };
  // a new build arrived while the app is open: switch at once during start-up, otherwise offer it
  function offerReload(build) {
    if (!N || !N.reloadPage) return;
    if (performance.now() - shownAt < 8000 && sheet.hidden) { N.reloadPage(); return; }
    let bar = document.getElementById('update-bar');
    if (!bar) {
      bar = document.createElement('div'); bar.id = 'update-bar'; bar.className = 'update-bar';
      bar.innerHTML = '<span></span><button class="btn" type="button">Reload</button>';
      bar.querySelector('button').addEventListener('click', () => N.reloadPage());
      document.body.appendChild(bar);
    }
    bar.querySelector('span').textContent = `The app was updated (build ${build}).`;
  }
  window.appUpdated = (build) => offerReload(build);
  let shownAt = 0, lastCheck = 0; // when the page was last opened or brought back; when updates were last checked
  // after an update, say once what changed (each build of the screens ships its own notes)
  function whatsNew() {
    const n = window.SR_NOTES;
    if (!n || !n.build || !n.text) return;
    let seen = 0;
    try { seen = Number(localStorage.getItem('sr.notesSeen') || 0); localStorage.setItem('sr.notesSeen', String(n.build)); } catch (e) { return; }
    if (seen >= n.build) return;
    const bar = document.createElement('div'); bar.className = 'update-bar notes-bar';
    bar.innerHTML = '<span></span><button class="btn" type="button">OK</button>';
    bar.querySelector('span').textContent = `Updated (build ${n.build}): ${n.text}`;
    bar.querySelector('button').addEventListener('click', () => bar.remove());
    document.body.appendChild(bar);
  }
  function openSettings(focus) { fill(); sheet.hidden = false; document.body.classList.add('sheet-open'); if (focus === 'holdings') setTimeout(() => { const t = $('cfg-holdings'); if (t) { t.scrollIntoView({ block: 'center' }); t.focus(); } }, 60); }
  window.appOpenSettings = openSettings;
  function closeSettings() { sheet.hidden = true; document.body.classList.remove('sheet-open'); }
  function save() {
    const c = Object.assign(SRApp.config(), {
      source: selectedSource(),
      apiKey: SRApp.cleanKey($('cfg-api').value),
      userKey: SRApp.cleanKey($('cfg-user').value),
      notify: $('cfg-notify').checked,
      notifyGo: $('cfg-go').checked,
      notifyPhase: $('cfg-phase').checked,
      notifyWatch: $('cfg-watchon').checked,
      watch: $('cfg-watch').value,
      notifyRegime: $('cfg-regime').checked,
      notifyHoldings: $('cfg-holdon').checked,
      holdings: $('cfg-holdings').value.trim(),
    });
    const prevToken = SRApp.config().syncToken || '';
    c.syncToken = $('cfg-sync').value.replace(/\s+/g, '');
    SRApp.saveConfig(c);
    closeSettings();
    SRApp.refresh();
    if (window.SRSync) window.SRSync.afterSave(prevToken);
  }

  $('btn-refresh').addEventListener('click', () => SRApp.refresh());
  $('btn-settings').addEventListener('click', openSettings);
  $('btn-close').addEventListener('click', closeSettings);
  $('btn-save').addEventListener('click', save);
  $('app-banner-action').addEventListener('click', openSettings);
  document.querySelectorAll('input[name="source"]').forEach((r) => r.addEventListener('change', toggleKeys));
  $('show-user').addEventListener('change', (e) => { $('cfg-user').type = e.target.checked ? 'text' : 'password'; });
  $('cfg-api').addEventListener('input', keyHints);
  $('cfg-user').addEventListener('input', keyHints);
  $('btn-swapkeys').addEventListener('click', swapKeys);
  $('btn-testkeys').addEventListener('click', async () => {
    const out = $('keys-result');
    out.className = 'hint'; out.textContent = 'Asking eToro…';
    const api = $('cfg-api').value, user = $('cfg-user').value;
    const r = await SRApp.testKeys(api, user);
    if (!r.ok && r.status === 401 && SRApp.cleanKey(api) && SRApp.cleanKey(user)) {
      // refused: try them the other way round, the usual mistake
      const s = await SRApp.testKeys(user, api);
      if (s.ok) { swapKeys(); out.className = 'hint ok'; out.textContent = 'The two keys were in each other\'s place: they are swapped now and eToro accepts them. Tap Save and refresh.'; return; }
    }
    out.className = 'hint ' + (r.ok ? 'ok' : 'bad');
    out.textContent = r.ok ? 'eToro accepted these keys. Tap Save and refresh.' : r.status ? `eToro answered ${r.status}${r.reason ? ': ' + r.reason : ''}` : `No answer from eToro${r.reason ? ': ' + r.reason : ''}`;
  });
  $('notify-perm').addEventListener('click', () => { const N = native(); if (N && N.requestNotificationPermission) N.requestNotificationPermission(); setTimeout(fill, 1500); });
  $('notify-test').addEventListener('click', () => { const N = native(); if (N && N.testNotification) N.testNotification(); });

  let t = null;
  window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => SRApp.render(), 150); });
  window.appResume = () => {
    shownAt = performance.now();
    // look for newer screens when coming back to the app, at most every 2 minutes
    if (N && N.checkUpdates && Date.now() - lastCheck > 2 * 60 * 1000) { lastCheck = Date.now(); N.checkUpdates(); }
    if (sheet.hidden && SRApp.isStale()) SRApp.refresh();
  };
  // ---- tabs and sub-tabs: each block of the dashboard page belongs to one of them; only what's open is drawn ----
  const TABS = {
    today: [['', ['today']]],
    portfolio: [['Overview', ['pfolio']], ['Details', ['portfolio']]],
    markets: [['Sectors', ['rotboard']], ['Heatmap', ['rotheat']], ['All funds', ['ranking']]],
    plan: [['Plan', ['plan']], ['26-year test', ['backtest']]],
  };
  const keyOf = (el) => el.id || (el.classList.contains('sr-grid') ? 'sr-grid' : '');
  const blocks = [...document.querySelectorAll('#dash-root .sr > *')];
  for (const b of blocks) {
    let where = ['none', 0]; // blocks of the old layout that no tab uses stay out of sight
    for (const [t, subs] of Object.entries(TABS)) subs.forEach(([, keys], i) => { if (keys.includes(keyOf(b))) where = [t, i]; });
    b.setAttribute('data-tab', where[0]); b.setAttribute('data-sub', String(where[1]));
  }
  const method = document.getElementById('method');
  if (method) method.open = true; // the Method sub-tab shows the notes unfolded
  const subbar = document.createElement('nav');
  subbar.className = 'subtabs'; subbar.setAttribute('aria-label', 'Sub-sections');
  document.getElementById('dash-root').prepend(subbar);
  const tabBtns = [...document.querySelectorAll('#tabbar [data-tab]')];
  let nav = { tab: null, sub: {} }, cameFrom = null;
  try { nav = Object.assign(nav, JSON.parse(localStorage.getItem('sr.nav') || '{}'), { tab: null }); } catch (e) { /* defaults */ }
  let saved = null;
  try { saved = (JSON.parse(localStorage.getItem('sr.nav') || '{}') || {}).tab; } catch (e) { saved = null; }
  function showTab(id, sub, keepScroll) {
    if (!TABS[id]) id = 'today';
    const subs = TABS[id];
    const i = Math.min(Math.max(0, sub != null ? sub : nav.sub[id] || 0), subs.length - 1);
    if (id === nav.tab && i === (nav.sub[id] || 0) && subbar.dataset.tab === id) return;
    nav.tab = id; nav.sub[id] = i;
    for (const b of blocks) b.hidden = !(b.getAttribute('data-tab') === id && b.getAttribute('data-sub') === String(i));
    for (const b of tabBtns) b.setAttribute('aria-selected', String(b.getAttribute('data-tab') === id));
    subbar.dataset.tab = id;
    subbar.replaceChildren(...(subs.length > 1 ? subs.map(([label], k) => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = label;
      b.setAttribute('aria-selected', String(k === i));
      b.addEventListener('click', () => { cameFrom = null; showTab(id, k); });
      return b;
    }) : []));
    subbar.hidden = subs.length < 2;
    try { localStorage.setItem('sr.nav', JSON.stringify(nav)); } catch (e) { /* not kept */ }
    if (!keepScroll) window.scrollTo(0, 0);
    SRApp.render(); // drawings skip hidden blocks, so the newly shown ones are drawn now
  }
  for (const b of tabBtns) b.addEventListener('click', () => { cameFrom = null; showTab(b.getAttribute('data-tab')); });
  // opening a chart (a row in Holdings, the ranking, the map…) switches to the Chart tab; Back returns
  window.appShowTab = (t, s) => { cameFrom = null; showTab(t, s); };
  if (window.SR) {
    SR.open = (sym) => {
      const id = SRApp.idOf(sym); if (!id || !window.SRLive || !window.SRLive.openAsset) return;
      const M = dash.data('metrics'), m = M.status === 'ok' ? M.data.find((r) => r.symbol === sym) : null;
      window.SRLive.openAsset({ id, symbol: sym, name: m ? m.name : '', exchange: '' });
    };
  }

  // ---- card notes: hidden behind a small ⓘ next to the title ----
  for (const note of document.querySelectorAll('#dash-root .sr-card-head .sr-note')) {
    const head = note.closest('.sr-card-head'), h = head && head.querySelector('h2, .sr-h2');
    if (!h) continue;
    note.hidden = true;
    const i = document.createElement('button'); i.type = 'button'; i.className = 'g-info'; i.textContent = 'i'; i.setAttribute('aria-label', 'What this shows');
    i.addEventListener('click', () => { note.hidden = !note.hidden; if (!note.hidden) SRApp.render(); });
    h.appendChild(i);
  }
  showTab(TABS[saved] ? saved : 'today');

  window.appBack = () => {
    if (!sheet.hidden) { closeSettings(); return true; }
    if (window.SRLive && window.SRLive.back()) return true;
    if (cameFrom) { const [t, i] = cameFrom; cameFrom = null; showTab(t, i); return true; }
    return false;
  };

  const cache = SRApp.boot();
  const cfg = SRApp.config();
  const needsKeys = cfg.source === 'etoro' && !(cfg.apiKey && cfg.userKey);
  if (needsKeys && !cache) openSettings();
  if (needsKeys || SRApp.isStale()) SRApp.refresh();
  setInterval(() => { if (!document.hidden && sheet.hidden && SRApp.isStale()) SRApp.refresh(); }, 5 * 60 * 1000);
  $('btn-update').addEventListener('click', () => { showUpdateInfo('checking…'); if (N && N.checkUpdates) N.checkUpdates(); });
  whatsNew();
  // the page started: tell the app this build of the screens works
  try { if (N && N.booted) N.booted(); } catch (e) { /* older app */ }
})();
