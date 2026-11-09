// App chrome: status line, error banner, refresh button and the settings sheet.
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const native = () => (typeof window.Native !== 'undefined' ? window.Native : null);
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
    } else b.hidden = true;
  }
  SRApp.onChange(status);

  function selectedSource() {
    const r = document.querySelector('input[name="source"]:checked');
    return r ? r.value : 'etoro';
  }
  function toggleKeys() { $('keys').hidden = selectedSource() !== 'etoro'; }
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
    $('cfg-holdings').placeholder = (window.SR_HOLDINGS || []).map((h) => h.ticker + (h.tracks !== h.ticker ? ' = ' + h.tracks : '') + (h.long_term ? ' long' : '')).join('\n');
    toggleKeys();
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
    if (performance.now() < 8000 && sheet.hidden) { N.reloadPage(); return; }
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
  function openSettings() { fill(); sheet.hidden = false; document.body.classList.add('sheet-open'); }
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
    SRApp.saveConfig(c);
    closeSettings();
    SRApp.refresh();
  }

  $('btn-refresh').addEventListener('click', () => SRApp.refresh());
  $('btn-settings').addEventListener('click', openSettings);
  $('btn-close').addEventListener('click', closeSettings);
  $('btn-save').addEventListener('click', save);
  $('app-banner-action').addEventListener('click', openSettings);
  document.querySelectorAll('input[name="source"]').forEach((r) => r.addEventListener('change', toggleKeys));
  $('show-user').addEventListener('change', (e) => { $('cfg-user').type = e.target.checked ? 'text' : 'password'; });
  $('btn-testkeys').addEventListener('click', async () => {
    const out = $('keys-result');
    out.className = 'hint'; out.textContent = 'Asking eToro…';
    const r = await SRApp.testKeys($('cfg-api').value, $('cfg-user').value);
    out.className = 'hint ' + (r.ok ? 'ok' : 'bad');
    out.textContent = r.ok ? 'eToro accepted these keys. Tap Save and refresh.' : r.status ? `eToro answered ${r.status}${r.reason ? ': ' + r.reason : ''}` : `No answer from eToro${r.reason ? ': ' + r.reason : ''}`;
  });
  $('notify-perm').addEventListener('click', () => { const N = native(); if (N && N.requestNotificationPermission) N.requestNotificationPermission(); setTimeout(fill, 1500); });
  $('notify-test').addEventListener('click', () => { const N = native(); if (N && N.testNotification) N.testNotification(); });

  let t = null;
  window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(() => SRApp.render(), 150); });
  window.appResume = () => { if (sheet.hidden && SRApp.isStale()) SRApp.refresh(); };
  window.appBack = () => { if (!sheet.hidden) { closeSettings(); return true; } return false; };

  const cache = SRApp.boot();
  const cfg = SRApp.config();
  const needsKeys = cfg.source === 'etoro' && !(cfg.apiKey && cfg.userKey);
  if (needsKeys && !cache) openSettings();
  if (needsKeys || SRApp.isStale()) SRApp.refresh();
  setInterval(() => { if (!document.hidden && sheet.hidden && SRApp.isStale()) SRApp.refresh(); }, 5 * 60 * 1000);
  $('btn-update').addEventListener('click', () => { showUpdateInfo('checking…'); if (N && N.checkUpdates) N.checkUpdates(); });
  // the page started: tell the app this build of the screens works
  try { if (N && N.booted) N.booted(); } catch (e) { /* older app */ }
})();
