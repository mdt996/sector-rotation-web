// Settings sync between your devices, through your private GitHub repository mdt996/sector-rotation-sync
// (one file, settings.json). Holdings, watchlist and alert choices travel; eToro keys and the sync key never do.
(function () {
  'use strict';
  const API = 'https://api.github.com/repos/mdt996/sector-rotation-sync/contents/settings.json';
  const SYNCED = ['holdings', 'holdingsBase', 'watch', 'source', 'notify', 'notifyGo', 'notifyPhase', 'notifyWatch', 'notifyRegime', 'notifyHoldings', 'plan', 'alerts', 'notifyAlerts'];
  const $ = (id) => document.getElementById(id);
  const b64e = (s) => btoa(unescape(encodeURIComponent(s)));
  const b64d = (s) => decodeURIComponent(escape(atob(String(s).replace(/\s/g, ''))));
  const token = () => String(SRApp.config().syncToken || '').replace(/\s+/g, '');
  const headers = (t) => ({ Authorization: 'Bearer ' + t, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' });
  const device = () => { try { return JSON.parse(window.Native.appInfo() || '{}').platform === 'mac' ? 'Mac' : 'phone'; } catch (e) { return 'phone'; } };
  const hhmm = (ms) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  let sha = null, busy = null, status = '', lastPull = 0, pushTimer = null;

  function setStatus(s) { status = s; showStatus(); }
  function showStatus() { const e = $('sync-status'); if (e) e.textContent = token() ? status : 'Not set up: holdings are kept on this device only.'; }
  function why(r) {
    if (r.status === -1) return 'This version of the app cannot sync: install the latest one.';
    if (r.status === 401) return 'GitHub refused the key (401): check it, or make a new one.';
    if (r.status === 403 || r.status === 404) return `GitHub answered ${r.status}: the key needs access to sector-rotation-sync, with Contents read and write.`;
    return `Could not reach GitHub (${r.status || 'no connection'}).`;
  }

  async function fetchRemote(t) {
    const r = await SRApp.request('GET', API + '?t=' + Date.now(), headers(t));
    if (r.status === 404) {
      // 404 means either "no file yet" or "no access": listing the repository tells them apart
      const repo = await SRApp.request('GET', API.replace(/settings\.json$/, '') + '?t=' + Date.now(), headers(t));
      return repo.status === 200 ? { none: true } : { error: why(repo) };
    }
    if (r.status !== 200) return { error: why(r) };
    const j = JSON.parse(r.body);
    sha = j.sha;
    return { doc: JSON.parse(b64d(j.content)) };
  }

  function apply(doc) {
    const cfg = SRApp.config(), s = doc.settings || {};
    let changed = false;
    for (const k of SYNCED) {
      if (!(k in s)) continue;
      if (k === 'holdingsBase' && !(s.holdingsBase && s.holdingsBase.text === s.holdings)) continue; // only an anchor that matches the holdings
      if (JSON.stringify(cfg[k]) !== JSON.stringify(s[k])) { cfg[k] = s[k]; changed = true; }
    }
    cfg.syncAt = doc.at; delete cfg.syncDirty;
    SRApp.saveConfig(cfg);
    if (changed) SRApp.applyConfig();
    return changed;
  }

  async function pushNow(t) {
    const cfg = SRApp.config(), at = Date.now(), doc = { v: 1, at, device: device(), settings: {} };
    for (const k of SYNCED) if (cfg[k] !== undefined) doc.settings[k] = cfg[k];
    for (let attempt = 0; attempt < 2; attempt++) {
      if (sha === null) { const g = await fetchRemote(t); if (g.error) return setStatus(g.error); }
      const body = JSON.stringify({ message: 'Settings from the ' + doc.device, content: b64e(JSON.stringify(doc, null, 1)), ...(sha ? { sha } : {}) });
      const r = await SRApp.request('PUT', API, headers(t), body);
      if (r.status === 200 || r.status === 201) {
        sha = JSON.parse(r.body).content.sha;
        const c = SRApp.config(); c.syncAt = at; delete c.syncDirty; SRApp.saveConfig(c);
        return setStatus(`Synced at ${hhmm(at)}: this ${doc.device}'s settings are the latest.`);
      }
      if (r.status === 409 || r.status === 422) { sha = null; continue; } // changed meanwhile: take the new version id and write again
      return setStatus(why(r));
    }
    setStatus('Could not write to GitHub; it will try again.');
  }

  // read the other device's latest settings; this device's unsent changes win when they are newer
  async function pull() {
    const t = token();
    if (!t) return showStatus();
    lastPull = Date.now();
    const got = await fetchRemote(t);
    if (got.error) return setStatus(got.error);
    const cfg = SRApp.config();
    if (got.none || (cfg.syncDirty && (!got.doc || cfg.syncDirty > (got.doc.at || 0)))) return pushNow(t);
    const doc = got.doc;
    if ((doc.at || 0) > (cfg.syncAt || 0)) apply(doc);
    const who = doc.device === 'phone' || doc.device === 'Mac' ? 'the ' + doc.device : doc.device || 'the other device';
    setStatus(`Synced at ${hhmm(Date.now())}: last change from ${who}, ${new Date(doc.at).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}.`);
  }
  const once = (fn) => () => { if (!busy) busy = fn().catch((e) => setStatus('Sync failed: ' + (e && e.message ? e.message : e))).finally(() => { busy = null; }); return busy; };
  const pullOnce = once(pull);

  // after Save in Settings: a new key reads what's there first; otherwise this device's settings go up
  function afterSave(prevToken) {
    const t = token();
    if (!t) { setStatus(''); return; }
    const cfg = SRApp.config();
    if (t !== String(prevToken || '').replace(/\s+/g, '')) { sha = null; cfg.syncAt = 0; delete cfg.syncDirty; SRApp.saveConfig(cfg); pullOnce(); return; }
    cfg.syncDirty = Date.now(); SRApp.saveConfig(cfg);
    once(() => pushNow(t))();
  }
  function pushSoon() {
    if (!token()) return;
    const cfg = SRApp.config(); cfg.syncDirty = Date.now(); SRApp.saveConfig(cfg);
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => once(() => pushNow(token()))(), 4000);
  }

  // another file of the private repository (the nightly scan's ranking): read-only
  // GitHub's usual answer carries the file only up to 1 MB: the raw form is asked for, which has no such limit (the scan's ranking grows with its list of assets)
  async function getFile(name) {
    const t = token(); if (!t) return null;
    const r = await SRApp.request('GET', API.replace(/settings\.json$/, name) + '?t=' + Date.now(), { ...headers(t), Accept: 'application/vnd.github.raw+json' });
    if (r.status !== 200) return null;
    const j = JSON.parse(r.body);
    return j && typeof j.content === 'string' && j.encoding === 'base64' && j.sha ? JSON.parse(b64d(j.content)) : j;   // the usual answer, if the raw form was not given
  }
  window.SRSync = { pull: pullOnce, afterSave, pushSoon, showStatus, getFile };
  // when the app opens, when you come back to it, and every 5 minutes while it is open
  setTimeout(pullOnce, 1500);
  setInterval(() => { if (!document.hidden) pullOnce(); }, 5 * 60 * 1000);
  const resume = window.appResume;
  window.appResume = () => { if (resume) resume(); if (Date.now() - lastPull > 30000) pullOnce(); };
  document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - lastPull > 30000) pullOnce(); });
})();
