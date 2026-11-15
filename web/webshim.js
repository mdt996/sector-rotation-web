// The iPhone version: the same screens in Safari, added to the home screen. There is no app around the page there, so
// this file stands in for the Android and Mac bridge (window.Native). Settings stay in this browser's storage (iOS keeps
// them while the icon stays on the home screen), the settings sync talks to GitHub directly, and eToro, Yahoo Finance
// and Revolut X go through the relay on Matteo's Cloudflare account, because those sites don't answer web pages. The
// relay only forwards the same few addresses the apps allow and keeps nothing. Only the web version loads this file: the
// relay adds it to the page, and the Android and Mac apps never do.
(function () {
  'use strict';
  if (window.Native) return;
  const SYNC_PREFIX = 'https://api.github.com/repos/mdt996/sector-rotation-sync/contents/';
  const RELAYED = [ // the same addresses the Android and Mac apps allow (GET only)
    /^https:\/\/public-api\.etoro\.com\/api\/v1\//,
    /^https:\/\/query[12]\.finance\.yahoo\.com\//,
    /^https:\/\/revx\.revolut\.com\/api\/1\.0\/(balances|tickers)$/,
    /^https:\/\/revx\.revolut\.com\/api\/1\.0\/transactions\?[^#]*$/,   // the staking rewards
  ];
  const BLOCKED = 'blocked: the app only fetches data from eToro and Yahoo Finance, reads your Revolut X balances, and syncs with your private repository';
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage full or private mode */ } },
  };
  const meta = (n) => { const m = document.querySelector(`meta[name="${n}"]`); return m ? m.getAttribute('content') : ''; };
  const build = () => Number(meta('sr-build')) || 0;
  const reply = (id, status, body) => setTimeout(() => { if (window.__nativeCallback) window.__nativeCallback(id, status, body); }, 0);
  const fail = (e) => String((e && e.message) || e || 'network error');

  function http(id, method, url, headers, body) {
    let h = {};
    try { h = JSON.parse(headers || '{}') || {}; } catch (e) { h = {}; }
    url = String(url || '');
    const sync = url.startsWith(SYNC_PREFIX) && !url.includes('..') && !url.includes('#');
    if (sync && (method === 'GET' || method === 'PUT')) { // GitHub answers web pages: straight there, the token never passes the relay
      fetch(url, { method, headers: h, body: method === 'PUT' && body != null ? String(body) : undefined, cache: 'no-store' })
        .then(async (r) => reply(id, r.status, await r.text()), (e) => reply(id, 0, fail(e)));
      return;
    }
    if (method !== 'GET' || !RELAYED.some((re) => re.test(url))) { reply(id, 0, BLOCKED); return; }
    fetch('/relay', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url, headers: h }), cache: 'no-store' })
      .then(async (r) => reply(id, r.status, await r.text()), (e) => reply(id, 0, fail(e)));
  }

  // updates: the relay always serves the newest build, so an update is a reload
  let last = null;
  try { last = JSON.parse(ls.get('sr.web.lastCheck', 'null')); } catch (e) { last = null; }
  function checkUpdates() {
    fetch('/latest', { cache: 'no-store' }).then((r) => r.json()).then((j) => {
      const b = Number(j && j.build) || 0, mine = build();
      const msg = b > mine ? `build ${b} is ready` : `up to date (build ${mine})`;
      last = { at: Date.now(), message: msg };
      ls.set('sr.web.lastCheck', JSON.stringify(last));
      if (window.appUpdateResult) window.appUpdateResult(b > mine ? b : 0, msg);
    }, (e) => { if (window.appUpdateResult) window.appUpdateResult(0, 'could not check: ' + fail(e)); });
  }

  let state = {};
  try { state = JSON.parse(ls.get('sr.web.state', '{}')) || {}; } catch (e) { state = {}; }
  window.Native = {
    isHeadless: () => false,
    getConfig: () => ls.get('sr.config', '{}'),
    setConfig: (s) => ls.set('sr.config', String(s)),
    getState: (k) => state[k] || '',
    setState: (k, v) => { state[k] = v; ls.set('sr.web.state', JSON.stringify(state)); },
    httpGet: (id, url, headers) => http(id, 'GET', url, headers, null),
    httpRequest: (id, method, url, headers, body) => http(id, String(method || 'GET').toUpperCase(), url, headers, body),
    notificationsAllowed: () => true, // background alerts are the Android phone's
    requestNotificationPermission: () => {}, testNotification: () => {},
    lastBackgroundRun: () => 'null',
    appInfo: () => JSON.stringify({ version: 'web app (iPhone)', platform: 'web', logos: true, revx: true, revxPrices: true, selfUpdate: false }),
    updateInfo: () => JSON.stringify({ bundled: build(), active: build(), downloaded: true, last, needs_app_update: 0 }),
    checkUpdates,
    booted: () => {},
    reloadPage: () => location.reload(),
    relaunchApp: () => location.reload(),
  };

  // a swipe from the left edge goes back, like the system gesture in the apps (web apps added to the home screen have none)
  let sx = -1, sy = 0;
  window.addEventListener('touchstart', (e) => { const t = e.touches[0]; sx = e.touches.length === 1 && t.clientX < 22 ? t.clientX : -1; sy = t.clientY; }, { passive: true });
  window.addEventListener('touchend', (e) => {
    if (sx < 0) return;
    const t = e.changedTouches[0], dx = t.clientX - sx, dy = Math.abs(t.clientY - sy);
    sx = -1;
    if (dx > 70 && dy < 60 && window.appBack) window.appBack();
  }, { passive: true });
})();
