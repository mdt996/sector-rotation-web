// Accounts for the people Matteo gives the app to: a username and a password keep someone's settings and keys on all their
// phones. Everything is encrypted on the phone before it leaves: the password makes two keys (PBKDF2, 310,000 rounds,
// the username as salt). The first is the login (the server keeps only its SHA-256); the second encrypts the settings
// (AES-GCM) and never leaves the phone. So the server (the app's Cloudflare Worker) holds a blob nobody else can read,
// and a forgotten password cannot be recovered. The owner's own devices sync through his GitHub repository instead
// (sync.js); a device with that key set does not use an account.
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const WORKER = 'https://sector-rotation.mdt996.workers.dev';
  const platform = () => { try { return JSON.parse(window.Native.appInfo() || '{}').platform || 'android'; } catch (e) { return 'android'; } };
  const base = () => (platform() === 'web' ? location.origin : WORKER);   // the iPhone version is served by the Worker itself
  // what follows the person: their settings, their eToro keys and their Revolut X key (never this device's state)
  const FIELDS = ['holdings', 'holdingsBase', 'watch', 'starred', 'tradePlans', 'limits', 'source', 'notify', 'notifyGo', 'notifyPhase', 'notifyWatch', 'notifyRegime', 'notifyHoldings',
    'plan', 'alerts', 'notifyAlerts', 'trades', 'staking', 'apiKey', 'userKey'];
  const ROUNDS = 310000, EVERY = 5 * 60 * 1000;
  const enc = new TextEncoder(), dec = new TextDecoder();
  const hex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  const b64 = (b) => { let s = ''; const u = new Uint8Array(b); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const cleanUser = (u) => String(u || '').trim().toLowerCase();
  const me = () => SRApp.config().acct || null;
  const owner = () => !!String(SRApp.config().syncToken || '').trim();
  let busy = false, lastPull = 0, status = '';

  // ---- the two keys from the password ----
  async function keysOf(u, p) {
    const raw = await crypto.subtle.importKey('raw', enc.encode(p), 'PBKDF2', false, ['deriveBits']);
    const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode('sector-rotation:' + u), iterations: ROUNDS }, raw, 512));
    return { a: hex(bits.slice(0, 32)), k: b64(bits.slice(32)) };
  }
  const aes = (k) => crypto.subtle.importKey('raw', unb64(k), 'AES-GCM', false, ['encrypt', 'decrypt']);
  async function seal(k, obj) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aes(k), enc.encode(JSON.stringify(obj)));
    return { d: b64(ct), iv: b64(iv) };
  }
  async function open(k, d, iv) {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await aes(k), unb64(d));
    return JSON.parse(dec.decode(pt));
  }

  // ---- the settings that travel ----
  function pick(c) {
    const o = {};
    for (const f of FIELDS) if (c[f] !== undefined) o[f] = c[f];
    const r = c.revx || {};
    if (r.priv || r.apiKey) o.revxKeys = { priv: r.priv || '', pub: r.pub || '', apiKey: r.apiKey || '' };
    return o;
  }
  const same = (a, b) => JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);
  // the account's copy over this device's, except what changed here since the last sync (that stays, and is sent next)
  function merge(remote) {
    const c = SRApp.config(), A = c.acct || {}, last = A.last || {}, local = pick(c);
    let changed = false;
    for (const f of [...FIELDS, 'revxKeys']) {
      if (!(f in remote)) continue;
      const mine = !same(local[f], last[f]);
      if (mine || same(local[f], remote[f])) continue;
      if (f === 'revxKeys') c.revx = Object.assign({}, c.revx || {}, remote.revxKeys);
      else c[f] = remote[f];
      changed = true;
    }
    return { c, changed };
  }

  async function call(op, body) {
    const r = await SRApp.request('POST', base() + '/acct/' + op, { 'Content-Type': 'application/json' }, JSON.stringify(body));
    let j = {};
    try { j = JSON.parse(r.body || '{}') || {}; } catch (e) { j = {}; }
    if (r.status === 0 || r.status === -1) j.error = /blocked/i.test(r.body || '') || r.status === -1 ? 'This version of the app cannot reach accounts: install the newest app (Settings → About).' : 'No connection.';
    return { status: r.status, j };
  }

  // ---- sign up, sign in, out ----
  async function start(newOne) {
    const u = cleanUser($('acct-user').value), p = $('acct-pass').value;
    if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(u)) return show('Username: 3 to 32 letters, digits, dots, dashes or underscores.', true);
    if (p.length < 8) return show('Password: at least 8 characters.', true);
    if (busy) return;
    busy = true; show(newOne ? 'Making your account…' : 'Signing in…');
    try {
      const K = await keysOf(u, p);
      if (newOne) {
        const r = await call('signup', { u, a: K.a });
        if (r.status !== 200) return show(r.j.error || `Could not make the account (${r.status}).`, true);
        const c = SRApp.config(); c.acct = { u, a: K.a, k: K.k, v: 0, last: {} }; SRApp.saveConfig(c);
        await push(true);
        $('acct-pass').value = '';
        return show(`Signed in as ${u}. Your settings and keys now follow you: sign in with the same name and password on your other phones.`);
      }
      const r = await call('get', { u, a: K.a });
      if (r.status !== 200) return show(r.j.error || `Could not sign in (${r.status}).`, true);
      let remote = {};
      if (r.j.d) { try { remote = await open(K.k, r.j.d, r.j.iv); } catch (e) { return show('Signed in, but the saved settings could not be decrypted.', true); } }
      const c = SRApp.config(), local = pick(c);
      c.acct = { u, a: K.a, k: K.k, v: r.j.v, last: {} };
      // the account's settings fill this phone; what this phone has and the account lacks is kept and sent
      for (const f of [...FIELDS, 'revxKeys']) if (f in remote) { if (f === 'revxKeys') c.revx = Object.assign({}, c.revx || {}, remote.revxKeys); else c[f] = remote[f]; }
      c.acct.last = remote;
      SRApp.saveConfig(c);
      $('acct-pass').value = '';
      if (Object.keys(local).some((f) => !(f in remote))) await push(true);
      lastPull = Date.now();
      SRApp.refresh();
      return show(`Signed in as ${u}.`);
    } catch (e) {
      return show('Could not ' + (newOne ? 'make the account' : 'sign in') + ': ' + (e && e.message ? e.message : e), true);
    } finally { busy = false; draw(); }
  }
  function signOut() {
    const c = SRApp.config(); delete c.acct; SRApp.saveConfig(c);
    show('Signed out. The settings stay on this phone; your account keeps its copy.'); draw();
  }

  // ---- keeping the account's copy up to date: sent when something changed, read every 5 minutes and when the app opens ----
  async function push(force) {
    const A = me(); if (!A || !A.k) return false;
    const now = pick(SRApp.config());
    if (!force && same(now, A.last)) return false;
    for (let i = 0; i < 2; i++) {
      const s = await seal(A.k, now);
      const r = await call('put', { u: A.u, a: A.a, v: A.v, d: s.d, iv: s.iv });
      if (r.status === 200) { const c = SRApp.config(); if (c.acct) { c.acct.v = r.j.v; c.acct.last = now; c.acct.at = Date.now(); SRApp.saveConfig(c); } status = `Saved at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`; draw(); return true; }
      if (r.status === 409) { await pull(); continue; }   // another phone saved first: its copy comes in, this phone's changes go on top
      if (r.status === 401) { status = 'The account refused this phone (the password was changed elsewhere?): sign in again.'; draw(); return false; }
      status = r.j.error || `Not saved (${r.status}).`; draw(); return false;
    }
    return false;
  }
  async function pull() {
    const A = me(); if (!A || !A.k) return;
    lastPull = Date.now();
    const r = await call('get', { u: A.u, a: A.a });
    if (r.status !== 200) { status = r.status === 401 ? 'The account refused this phone: sign in again.' : r.j.error || `Not read (${r.status}).`; draw(); return; }
    if (r.j.v === A.v || !r.j.d) return;
    let remote;
    try { remote = await open(A.k, r.j.d, r.j.iv); } catch (e) { status = 'The saved settings could not be decrypted.'; draw(); return; }
    const m = merge(remote);
    m.c.acct = Object.assign({}, m.c.acct, { v: r.j.v, last: remote });
    SRApp.saveConfig(m.c);
    if (m.changed) SRApp.refresh();
  }
  async function tick() {
    if (!me() || busy) return;
    busy = true;
    try { if (Date.now() - lastPull > EVERY) await pull(); await push(false); } catch (e) { /* the next round */ } finally { busy = false; }
  }

  // ---- the Settings section ----
  function show(msg, bad) { status = msg; const e = $('acct-status'); if (e) { e.textContent = msg; e.className = 'hint' + (bad ? ' bad' : ''); } }
  function draw() {
    const box = $('settings-acct'); if (!box) return;
    const A = me();
    $('acct-form').hidden = !!A; $('acct-signed').hidden = !A;
    const e = $('acct-status');
    if (e && !busy) { e.className = 'hint'; e.textContent = A ? `Signed in as ${A.u}. ${status && !/^Signed in/.test(status) ? status : 'Your settings and keys follow you on your other phones.'}` : owner() ? 'This device syncs through the owner\'s GitHub repository (Sync below): no account needed.' : status || 'Optional: keep your settings and keys on all your phones.'; }
  }
  function wire() {
    if (!$('settings-acct') || wire.done) return;
    wire.done = true;
    $('btn-acct-in').addEventListener('click', () => start(false));
    $('btn-acct-new').addEventListener('click', () => start(true));
    $('btn-acct-out').addEventListener('click', signOut);
    $('btn-acct-sync').addEventListener('click', async () => { if (busy) return; busy = true; show('Syncing…'); try { await pull(); await push(true); } finally { busy = false; draw(); } });
    $('settings-acct').addEventListener('toggle', draw);
    draw();
  }

  window.SRAccount = { keysOf, seal, open, pick, merge, push, pull, draw, me };
  wire();
  setTimeout(() => { wire(); tick(); }, 2500);
  setInterval(() => { if (!document.hidden) tick(); }, 20000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && me() && Date.now() - lastPull > 30000) { lastPull = 0; tick(); } });
})();
