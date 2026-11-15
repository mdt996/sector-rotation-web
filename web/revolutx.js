// Revolut X (crypto): your coin quantities, read with a read-only key and valued at live eToro prices.
// The key is made on this device (Ed25519): its secret half never leaves the device and is never synced.
// Only GET /api/1.0/balances is asked for; the apps let nothing else through to Revolut X.
(function () {
  'use strict';
  const BASE = 'https://revx.revolut.com', PATH = '/api/1.0/balances';
  const CASH = new Set(['EUR', 'USD', 'GBP', 'CHF', 'PLN', 'RON', 'CZK', 'HUF', 'SEK', 'NOK', 'DKK', 'BGN', 'USDC', 'USDT', 'EURC', 'DAI']);
  const EVERY = 15 * 60 * 1000;
  const $ = (id) => document.getElementById(id);
  const b64 = (buf) => { let s = ''; for (const x of new Uint8Array(buf)) s += String.fromCharCode(x); return btoa(s); };
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const hhmm = (ms) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const R = () => Object.assign({ apiKey: '', priv: '', pub: '', coins: null, at: 0, msg: '' }, SRApp.config().revx || {});
  function saveR(patch) { const c = SRApp.config(); c.revx = Object.assign(R(), patch); SRApp.saveConfig(c); return c.revx; }
  const appInfo = () => { try { return JSON.parse((window.Native && window.Native.appInfo()) || '{}'); } catch (e) { return {}; } };
  let busy = false, lastTry = 0;

  async function makeKey() {
    const kp = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
    const priv = b64(await crypto.subtle.exportKey('pkcs8', kp.privateKey));
    const spki = b64(await crypto.subtle.exportKey('spki', kp.publicKey));
    const pub = '-----BEGIN PUBLIC KEY-----\n' + spki.match(/.{1,64}/g).join('\n') + '\n-----END PUBLIC KEY-----';
    const c = SRApp.config(); c.revxPub = pub; SRApp.saveConfig(c);         // the public half (not secret) goes with the next sync, so it can be pasted into Revolut X from another device
    return saveR({ priv, pub, apiKey: '', coins: null, at: 0, msg: '' });   // a new key needs a new API key in Revolut X
  }

  // Revolut X's signature: Ed25519 over timestamp + method + path (+ query + body, none here), in base64
  async function signedHeaders(r, ts) {
    const key = await crypto.subtle.importKey('pkcs8', unb64(r.priv), { name: 'Ed25519' }, false, ['sign']);
    const sig = await crypto.subtle.sign({ name: 'Ed25519' }, key, new TextEncoder().encode(ts + 'GET' + PATH));
    return { 'X-Revx-API-Key': r.apiKey, 'X-Revx-Timestamp': ts, 'X-Revx-Signature': b64(sig), Accept: 'application/json' };
  }

  function why(res) {
    if (res.status === -1 || (res.status === 0 && /^blocked/.test(res.body || ''))) return 'This version of the app cannot reach Revolut X: install app 1.0.68 or later.';
    if (res.status === 401) return 'Revolut X refused the key (401): check the API key, and that it was made with this device\'s public key.';
    if (res.status === 403) return 'Revolut X answered 403: the key may lack read access, or an IP whitelist blocks this connection.';
    if (res.status === 429) return 'Revolut X asks to wait a little (429).';
    return `Could not reach Revolut X (${res.status || 'no connection'}).`;
  }

  // euro prices from eToro (the app's only price source) for the coins it lists
  async function eurPrices(syms) {
    const ids = {};
    for (const s of syms) { const id = window.SRLive && SRLive.liveIdOf ? SRLive.liveIdOf(s) : SRApp.idOf(s); if (id) ids[s] = id; }
    const list = [...new Set([1, ...Object.values(ids)])];   // 1 = EURUSD
    const r = await SRApp.etoroGet('/api/v1/market-data/instruments/rates?instrumentIds=' + list.join(','), 1.5);
    if (r.status !== 200) throw new Error('eToro ' + (r.status || 'unreachable'));
    const usd = new Map(); let fx = null;
    for (const q of JSON.parse(r.body).rates || []) {
      const p = q.bid > 0 && q.ask > 0 ? (q.bid + q.ask) / 2 : q.lastExecution || q.bid || q.ask, conv = q.conversionRateBid > 0 ? q.conversionRateBid : 1;
      if (!(p > 0)) continue;
      if (q.instrumentID === 1) fx = p; else usd.set(q.instrumentID, p * conv);
    }
    const out = {};
    if (fx > 0) for (const [s, id] of Object.entries(ids)) if (usd.get(id) > 0) out[s] = usd.get(id) / fx;
    return out;
  }

  // The holdings text with Revolut X's coins. A coin's line ("SOL 613.38 paid 735.37") gets its amount from the quantity at the live
  // price when the quantity changed (or at the first read); what was paid follows buys (at today's price) and sales (pro rata).
  // Lines with "=" (funds that follow a coin, such as ASOL = SOL) and coins never seen on Revolut X are left as typed.
  function merge(text, bal, eur, prev) {
    const coins = {};
    for (const b of bal || []) { const sym = String(b.currency || '').toUpperCase(), q = parseFloat(b.total); if (sym && q > 0 && !CASH.has(sym)) coins[sym] = q; }
    const fmt = (t, amount, paid, long) => [t, amount.toFixed(2), paid != null ? 'paid ' + paid.toFixed(2) : '', long ? 'long' : ''].filter(Boolean).join(' ');
    const out = [], seen = new Set(), touched = new Set(), noPrice = [];
    for (const line of String(text || '').split(/\r?\n/)) {
      const h = line.trim() && !/=/.test(line) ? SRApp.parseHoldings(line)[0] : null;
      const mine = h && h.tracks === h.ticker && (h.ticker in coins || (prev && h.ticker in prev));
      if (!mine) { out.push(line); continue; }
      const sym = h.ticker, q = coins[sym], p = prev ? prev[sym] : undefined;
      seen.add(sym);
      if (!(q > 0)) { touched.add(sym); continue; }                       // no longer on Revolut X: sold
      if (!(eur[sym] > 0)) { out.push(line); noPrice.push(sym); continue; } // eToro has no price for it: kept as typed
      if (p != null && Math.abs(q / p - 1) < 1e-9) { out.push(line); continue; } // same quantity: the live price already moves its value
      let paid = h.paid;
      if (paid != null && p > 0) paid = q > p ? paid + (q - p) * eur[sym] : paid * (q / p);
      out.push(fmt(sym, q * eur[sym], paid, h.long_term)); touched.add(sym);
    }
    const extra = [];
    for (const [sym, q] of Object.entries(coins)) {
      if (seen.has(sym)) continue;
      if (!(eur[sym] > 0)) { noPrice.push(sym); continue; }
      const v = q * eur[sym];
      if (v < 1) continue;                                                   // dust
      extra.push(fmt(sym, v, prev ? v : null, false)); touched.add(sym);    // bought since the last read: paid about today's value
    }
    if (extra.length) {   // new coins go at the end of the "Revolut X:" group (made if there is none)
      const isHead = (l) => /^\s*[A-Za-z][^=:\d]{0,39}:\s*$/.test(l), hi = out.findIndex((l) => /^\s*revolut\s*x\s*:\s*$/i.test(l));
      if (hi < 0) out.push('Revolut X:', ...extra);
      else { let j = hi + 1; while (j < out.length && !isHead(out[j])) j++; while (j > hi + 1 && !out[j - 1].trim()) j--; out.splice(j, 0, ...extra); }
    }
    return { text: out.join('\n').trim(), changed: touched.size > 0, touched, coins, noPrice };
  }

  // after a change, the lines left as they were keep their anchor price (the amounts were typed at that price)
  function rebase(cfg, text, touched) {
    const b = cfg.holdingsBase && cfg.holdingsBase.text === cfg.holdings ? cfg.holdingsBase : null;
    if (!b) return undefined;
    const rows = {};
    for (const [t, r] of Object.entries(b.rows || {})) if (!touched.has(t)) rows[t] = r;
    return { text, rows };
  }

  async function read(manual) {
    const r = R();
    if (!r.priv || !r.apiKey) { if (manual) show(r.priv ? 'Paste the API key from Revolut X first.' : 'Make a key first.', true); return; }
    if (busy) return;
    busy = true; lastTry = Date.now();
    if (manual) show('Asking Revolut X…');
    try {
      const res = await SRApp.request('GET', BASE + PATH, await signedHeaders(r, String(Date.now())));
      if (res.status !== 200) { saveR({ msg: why(res) }); return show(why(res), true); }
      const bal = JSON.parse(res.body);
      if (!Array.isArray(bal)) { saveR({ msg: 'Revolut X sent an unexpected answer.' }); return show('Revolut X sent an unexpected answer.', true); }
      const syms = bal.filter((b) => parseFloat(b.total) > 0).map((b) => String(b.currency || '').toUpperCase()).filter((s) => s && !CASH.has(s));
      let eur;
      try { eur = await eurPrices(syms); } catch (e) { const m = 'Read your coins, but eToro gave no prices (' + e.message + '): nothing changed.'; saveR({ msg: m }); return show(m, true); }
      // the other devices' latest holdings first, so this read never writes back an older copy of them
      if (window.SRSync && window.SRSync.pull) { try { await window.SRSync.pull(); } catch (e) { /* this device's copy */ } }
      const cfg = SRApp.config();
      if (!String(cfg.holdings || '').trim()) { const m = 'Type your holdings in Holdings first: the coins are added to them.'; saveR({ msg: m }); return show(m, true); }
      const m = merge(cfg.holdings, bal, eur, r.coins);
      const n = Object.keys(m.coins).length, at = Date.now();
      let msg = `Read at ${hhmm(at)}: ${n} coin${n === 1 ? '' : 's'}${m.changed ? ', holdings updated' : ', no change'}.`;
      if (m.noPrice.length) msg += ` No eToro price for ${m.noPrice.join(', ')}: kept as typed.`;
      if (m.changed) {
        const base = rebase(cfg, m.text, m.touched);
        cfg.holdings = m.text;
        if (base) cfg.holdingsBase = base; else delete cfg.holdingsBase;
        SRApp.saveConfig(cfg);
        if (window.SRSync) window.SRSync.pushSoon();
        SRApp.applyConfig();
        if ($('cfg-holdings') && !$('settings').hidden) $('cfg-holdings').value = m.text;
      }
      saveR({ coins: m.coins, at, msg });
      show(msg);
    } catch (e) {
      const msg = 'Revolut X: ' + (e && e.message ? e.message : 'failed') + '.';
      saveR({ msg }); show(msg, true);
    } finally { busy = false; status(); }
  }

  // ---- the Settings section ----
  function show(t, bad) { const o = $('revx-result'); if (o) { o.textContent = t; o.className = 'hint' + (bad ? ' bad' : ''); } }
  function status() {
    const r = R(), s = $('revx-status'); if (!s) return;
    const can = !!(window.crypto && crypto.subtle);
    s.textContent = !can ? 'This device cannot make the key (its web engine is too old).'
      : !r.priv ? 'Not connected. Make a key to start.'
        : !r.apiKey ? 'Key made on this device. Paste its public key in Revolut X, then the API key below.'
          : r.at ? `Connected (read only). ${r.msg || ''}` : 'API key saved. Tap Read my coins.';
    $('revx-pub-box').hidden = !r.pub; $('btn-revx-copy').hidden = !r.pub;
    $('revx-pub').value = r.pub || '';   // as Revolut X wants it, BEGIN and END lines included; Copy takes it whole
    $('btn-revx-key').textContent = r.priv ? 'Make a new key' : 'Make a key';
    if (appInfo().revx !== true && window.Native) $('revx-app').hidden = false;
  }
  function fill() { const i = $('cfg-revx'); if (i) i.value = R().apiKey || ''; status(); }
  function keepApiKey() { const i = $('cfg-revx'); if (!i) return; const k = i.value.replace(/\s+/g, ''); if (k !== R().apiKey) saveR({ apiKey: k, coins: R().coins }); }

  function wire() {
    if (!$('settings-revx')) return;
    let armed = 0;
    $('btn-revx-key').addEventListener('click', async () => {
      if (R().priv && Date.now() - armed > 5000) { armed = Date.now(); show('Tap again to replace the key: the API key made for the old one will stop working.', true); return; }
      armed = 0;
      try { await makeKey(); fill(); show('Key made. Copy the public key into Revolut X.'); } catch (e) { show('Could not make the key: ' + (e && e.message ? e.message : 'this device does not support it') + '.', true); }
    });
    // copies the whole public key as Revolut X wants it (with its BEGIN and END lines), in one tap
    $('btn-revx-copy').addEventListener('click', async () => {
      const pem = R().pub; let ok = false;
      if (!pem) return;
      try { await navigator.clipboard.writeText(pem); ok = true; } catch (e) { /* the older way below */ }
      if (!ok) {
        const t = document.createElement('textarea'); t.value = pem; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
        document.body.appendChild(t); t.select();
        try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
        t.remove();
      }
      show(ok ? 'Copied. Paste it in Revolut X → Profile → API keys → Chiave pubblica.' : 'Could not copy: tap the key, select all and copy.', !ok);
    });
    $('btn-revx-read').addEventListener('click', () => { keepApiKey(); read(true); });
    $('cfg-revx').addEventListener('change', keepApiKey);
    $('settings-revx').addEventListener('toggle', () => { if ($('settings-revx').open) fill(); });
    $('btn-save').addEventListener('click', keepApiKey);
    fill();
  }

  // when the app opens, when you come back to it, and every 15 minutes while it is open (only on the device that has the key)
  const due = () => { const r = R(); return r.priv && r.apiKey && !document.hidden && Date.now() - Math.max(r.at || 0, lastTry) > EVERY; };
  const tick = () => { if (due()) read(false); };
  window.SRRevx = { read, merge, rebase, signedHeaders, makeKey, PATH, BASE };
  wire();
  setTimeout(tick, 4000);
  setInterval(tick, 60 * 1000);
  const resume = window.appResume;
  window.appResume = () => { if (resume) resume(); tick(); };
  document.addEventListener('visibilitychange', tick);
})();
