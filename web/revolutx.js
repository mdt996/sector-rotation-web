// Revolut X (crypto): your coin quantities, read with a read-only key and valued at live eToro prices.
// The key is made on this device (Ed25519): its secret half never leaves the device and is never synced.
// Only GET /api/1.0/balances, /api/1.0/tickers and the staking rewards (GET /api/1.0/transactions?types=reward) are asked for;
// the apps let nothing else through to Revolut X.
// Your Revolut X coins are valued at Revolut X's own euro prices (decided by Matteo on 15 Nov 2026), so the app shows what
// Revolut X shows; every other price in the app stays eToro's.
(function () {
  'use strict';
  const BASE = 'https://revx.revolut.com', PATH = '/api/1.0/balances', TICKERS = '/api/1.0/tickers', TX = '/api/1.0/transactions';
  const CASH = new Set(['EUR', 'USD', 'GBP', 'CHF', 'PLN', 'RON', 'CZK', 'HUF', 'SEK', 'NOK', 'DKK', 'BGN', 'USDC', 'USDT', 'EURC', 'DAI']);
  const EVERY = 60 * 1000, PX_EVERY = 10 * 1000;   // quantities every minute (staking rewards), prices every 10 seconds
  const RW_EVERY = 30 * 60 * 1000, DAY = 864e5;    // the list of staking rewards every 30 minutes (Revolut X pays about once a day)
  const $ = (id) => document.getElementById(id);
  const b64 = (buf) => { let s = ''; for (const x of new Uint8Array(buf)) s += String.fromCharCode(x); return btoa(s); };
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const hhmm = (ms) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const R = () => Object.assign({ apiKey: '', priv: '', pub: '', coins: null, at: 0, msg: '' }, SRApp.config().revx || {});
  function saveR(patch) { const c = SRApp.config(); c.revx = Object.assign(R(), patch); SRApp.saveConfig(c); return c.revx; }
  const appInfo = () => { try { return JSON.parse((window.Native && window.Native.appInfo()) || '{}'); } catch (e) { return {}; } };
  let busy = false, lastTry = 0, lastPx = 0, pxBusy = false, lastRw = 0;

  async function makeKey() {
    const kp = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
    const priv = b64(await crypto.subtle.exportKey('pkcs8', kp.privateKey));
    const spki = b64(await crypto.subtle.exportKey('spki', kp.publicKey));
    const pub = '-----BEGIN PUBLIC KEY-----\n' + spki.match(/.{1,64}/g).join('\n') + '\n-----END PUBLIC KEY-----';
    const c = SRApp.config(); c.revxPub = pub; SRApp.saveConfig(c);         // the public half (not secret) goes with the next sync, so it can be pasted into Revolut X from another device
    return saveR({ priv, pub, apiKey: '', coins: null, at: 0, msg: '' });   // a new key needs a new API key in Revolut X
  }

  // Revolut X's signature: Ed25519 over timestamp + method + path + query (without the "?"; no body here), in base64
  async function signedHeaders(r, ts, path, query) {
    const key = await crypto.subtle.importKey('pkcs8', unb64(r.priv), { name: 'Ed25519' }, false, ['sign']);
    const sig = await crypto.subtle.sign({ name: 'Ed25519' }, key, new TextEncoder().encode(ts + 'GET' + (path || PATH) + (query || '')));
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
      if (p != null && Math.abs(q / p - 1) < 0.005) { out.push(line); continue; } // about the same quantity (rewards): the live value follows it
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
    // the quantities the lines now stand for: the new ones for the lines rewritten, the old ones for the others
    const lineQty = {};
    for (const sym of Object.keys(coins)) lineQty[sym] = touched.has(sym) || !prev || prev[sym] == null ? coins[sym] : prev[sym];
    return { text: out.join('\n').trim(), changed: touched.size > 0, touched, coins, lineQty, noPrice };
  }

  // ---- Revolut X's own euro prices: the index price of each coin's euro market (its reference price, the one Revolut X values
  // your coins at; the middle of its order book can be 0.5% off on thin euro markets), every 10 seconds while the app is open ----
  let px = null;   // { at, eur: { SOL: { p, chg } } }
  function parseTickers(j) {
    const eur = {}, usd = {}, rows = (j && j.data) || [];
    const eea = rows.some((t) => t.region === 'EEA');   // France: the EEA markets when both regions are listed
    for (const t of rows) {
      if (eea && t.region && t.region !== 'EEA') continue;
      const [b, q] = String(t.symbol || '').toUpperCase().split(/[/-]/), bid = parseFloat(t.bid), ask = parseFloat(t.ask), ix = parseFloat(t.index_price), mid = parseFloat(t.mid);
      const p = ix > 0 ? ix : mid > 0 ? mid : bid > 0 && ask > 0 ? (bid + ask) / 2 : parseFloat(t.last_price);
      if (!b || !(p > 0)) continue;
      const last = parseFloat(t.last_price), ch = parseFloat(t.price_change_24h);
      const chg = last > 0 && isFinite(ch) && last - ch > 0 ? last / (last - ch) - 1 : null;   // the last 24 hours
      if (q === 'EUR') eur[b] = { p, chg }; else if (q === 'USD') usd[b] = { p, chg };
    }
    // a coin with no euro market: its dollar price at Revolut X's dollar-to-euro rate (USDC in euros, else bitcoin's two prices)
    const rate = eur.USDC ? 1 / eur.USDC.p : eur.BTC && usd.BTC ? usd.BTC.p / eur.BTC.p : null;
    if (rate > 0) for (const [b, v] of Object.entries(usd)) if (!eur[b]) eur[b] = { p: v.p / rate, chg: v.chg };
    return eur;
  }
  async function readTickers(r) {
    const res = await SRApp.request('GET', BASE + TICKERS, await signedHeaders(r, String(Date.now()), TICKERS));
    if (res.status !== 200) return false;
    const eur = parseTickers(JSON.parse(res.body));
    if (!Object.keys(eur).length) return false;
    px = { at: Date.now(), eur };
    if (window.SR && window.SR.liveNow) { try { window.SR.liveNow(); } catch (e) { /* the next tick */ } }
    return true;
  }
  // your coins' values at those prices (quantities from the last read of your balances); nothing when they are older than 10 minutes
  function values() {
    const r = R();
    const qty = r.qty || r.coins;
    if (!px || !qty || Date.now() - px.at > 10 * 60e3) return null;
    const out = {};
    for (const [sym, q] of Object.entries(qty)) { const t = px.eur[sym]; if (t && q > 0) out[sym] = { value: q * t.p, chg: t.chg, at: px.at, price: t.p }; }
    return out;
  }

  // ---- staking: Revolut X pays a reward on staked coins about every day (every 2 to 3 days for SOL, every 5 for ADA) ----
  // ADA earns on "auto-earn": nothing is locked (Revolut X's API counts it as available, not staked), the whole balance earns,
  // Revolut's rate (1.96% a year on 15 Nov 2026) and a first reward about 20 days after buying (Cardano's delay)
  const AUTO = { ADA: { rate: 0.0196, wait: 20 } };
  // The last 30 days of rewards, every page. Query keys in alphabetical order, as signed.
  const query = (o) => Object.keys(o).sort().map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(o[k])}`).join('&');
  function parseRewards(j) {
    const out = [];
    for (const t of (j && j.data) || []) {
      if (t.type !== 'reward' || (t.status && t.status !== 'completed')) continue;
      const d = t.destination || {}, c = String(d.currency || '').toUpperCase(), q = parseFloat(d.amount), at = +t.created_date || +t.processed_date;
      if (c && q > 0 && at > 0) out.push({ c, q, t: at });
    }
    return out;
  }
  // Revolut X answers one window at a time (a week from start_date when no end_date is given), so the reading walks back from
  // now in windows of 30 days with both dates, every page of each, as Revolut's own tool does (nothing before 7 May 2024)
  async function readRewards(r, since) {
    const out = [];
    since = Math.max(since, Date.parse('2024-05-07T00:00:00Z'));
    let end = Date.now();
    for (let w = 0; w < 16 && end > since; w++) {
      const start = Math.max(since, end - 30 * DAY);
      let cursor = '';
      for (let page = 0; page < 20; page++) {
        const q = query(Object.assign({ end_date: end, limit: 100, start_date: start, types: 'reward' }, cursor ? { cursor } : {}));
        const res = await SRApp.request('GET', BASE + TX + '?' + q, await signedHeaders(r, String(Date.now()), TX, q));
        if (res.status !== 200) return null;
        const j = JSON.parse(res.body);
        out.push(...parseRewards(j));
        cursor = j && j.metadata && j.metadata.next_cursor;
        if (!cursor) break;
      }
      end = start - 1;
    }
    const seen = new Set();
    return out.filter((x) => { const k = x.c + x.t + x.q; if (seen.has(k)) return false; seen.add(k); return true; }).sort((a, b) => b.t - a.t);
  }
  const device = () => ({ mac: 'the Mac', web: 'the iPhone' }[appInfo().platform] || 'the phone');
  // the rewards and staked amounts go with the sync, so a device that cannot read them (an older phone app) shows them too:
  // the last 30 days one by one, and every day since you started staking as a total per coin and day (UTC), which keeps growing
  const dayOf = (t) => new Date(t).toISOString().slice(0, 10);
  function keepStaking(cfg, staked, rewards, since, full) {
    const was = cfg.staking || {}, wr = Array.isArray(was.rewards) ? was.rewards : [];
    const moved = (a, b) => { const k = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]); for (const c of k) { const x = (a || {})[c] || 0, y = (b || {})[c] || 0; if (Math.abs(x - y) > 1e-9 && Math.abs(x / (y || 1) - 1) > 0.001) return true; } return false; };
    const from = dayOf(since), days = {};
    for (const [c, m] of Object.entries(was.days || {})) { days[c] = {}; for (const [d, q] of Object.entries(m)) if (d <= from) days[c][d] = q; }   // days this reading covers whole are replaced
    const fresh = {};
    for (const x of rewards) { const d = dayOf(x.t); if (d < from) continue; ((fresh[x.c] = fresh[x.c] || {})[d] = ((fresh[x.c] || {})[d] || 0) + x.q); }
    for (const [c, m] of Object.entries(fresh)) for (const [d, q] of Object.entries(m)) { days[c] = days[c] || {}; days[c][d] = d === from ? Math.max(days[c][d] || 0, q) : q; }   // the first day may be partly outside the reading
    const recent = rewards.filter((x) => Date.now() - x.t <= 30 * DAY);
    const changed = !was.at || wr.length !== recent.length || (recent[0] && (!wr[0] || wr[0].t !== recent[0].t)) || moved(was.staked, staked) || JSON.stringify(was.days || {}) !== JSON.stringify(days);
    cfg.staking = { at: Date.now(), by: device(), staked, rewards: recent, days, v: full ? 2 : was.v || 0 };
    return changed;
  }
  // per coin: staked, the last reward, the last 7 and 30 days, what it pays a day and the yearly rate at that pace (on today's
  // staked amount); in euros at Revolut X's prices. Rewards older than 30 days are not read.
  function staking(priceOf) {
    const s = SRApp.config().staking || {}, r = R();
    const staked = r.staked && Object.keys(r.staked).length ? r.staked : s.staked || {};
    const rewards = Array.isArray(s.rewards) ? s.rewards : [];
    if (!Object.keys(staked).length && !rewards.length) return null;
    const now = Date.now(), fresh = px && now - px.at < 10 * 60e3 ? px.eur : {}, qty = r.qty || {}, trades = SRApp.config().trades || [];
    const price = (c) => (fresh[c] ? fresh[c].p : priceOf ? priceOf(c) : null);
    const coins = {};
    for (const c of new Set([...Object.keys(staked), ...rewards.map((x) => x.c), ...Object.keys(s.days || {})])) {   // coins staked before count in what was earned
      const L = rewards.filter((x) => x.c === c), L7 = L.filter((x) => now - x.t <= 7 * DAY), p = price(c), A = AUTO[c];
      const st = staked[c] || ((A || L.length) && qty[c] > 0 ? qty[c] : 0);   // a coin earning on auto-earn: its whole balance
      const oldest = L.length ? L[L.length - 1].t : null, gap = L.length > 1 ? (L[0].t - oldest) / (L.length - 1) : DAY;
      const days = oldest && now - oldest < 7 * DAY ? Math.min(7, Math.max(1, (now - oldest + gap) / DAY)) : 7;   // staked less than a week ago: since its first reward
      const d7 = L7.reduce((a, x) => a + x.q, 0), d30 = L.reduce((a, x) => a + x.q, 0), perDay = L7.length ? d7 / days : 0;
      const D = (s.days || {})[c] || {}, dk = Object.keys(D).sort(), all = dk.length ? dk.reduce((a, k) => a + D[k], 0) : d30;
      // no reward yet on auto-earn: what it should pay at Revolut's rate, and when the first reward comes (about 20 days after the first buy)
      const expect = !L.length && !all && A && st > 0, buys = trades.filter((t) => t.src === 'revx' && t.s === c && t.side === 'B').map((t) => Date.parse(t.d)).filter((x) => x > 0);
      const pd = expect ? (st * A.rate) / 365 : perDay;
      coins[c] = { c, staked: st, auto: !!A, expect, first: expect && buys.length ? Math.min(...buys) + A.wait * DAY : null, last: L[0] || null, d7, d30, n30: L.length, perDay: pd, rate: expect ? A.rate : st > 0 && perDay > 0 ? (perDay * 365) / st : null, all, since: dk[0] || (oldest ? dayOf(oldest) : null), allEur: p ? all * p : null,
        price: p, stakedEur: p ? st * p : null, perDayEur: p ? pd * p : null, d7Eur: p ? d7 * p : null, d30Eur: p ? d30 * p : null, lastEur: p && L[0] ? L[0].q * p : null };
    }
    const all = Object.values(coins), sum = (k) => { const v = all.map((x) => x[k]).filter((x) => x != null); return v.length ? v.reduce((a, x) => a + x, 0) : null; };   // a coin with no price yet is left out of the euro totals
    const stakedEur = sum('stakedEur'), perDayEur = sum('perDayEur');
    const last = rewards[0] || null;
    const firsts = all.map((x) => x.since).filter(Boolean).sort();
    return { coins, stakedEur, perDayEur, d30Eur: sum('d30Eur'), allEur: sum('allEur'), since: firsts[0] || null, rate: stakedEur > 0 && perDayEur > 0 ? (perDayEur * 365) / stakedEur : null, last, at: s.at || 0, by: s.by || '' };
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
      const staked = {};
      for (const b of bal) { const sym = String(b.currency || '').toUpperCase(), q = parseFloat(b.staked); if (sym && q > 0) staked[sym] = q; }
      for (const b of bal) { const sym = String(b.currency || '').toUpperCase(), q = parseFloat(b.total); if (AUTO[sym] && q > 0 && !(staked[sym] > 0)) staked[sym] = q; }   // auto-earn: the whole balance
      // the staking rewards: every 30 minutes, and when you ask (an older app may not let this through: the sync brings them then)
      let rewards = null;
      const full = (SRApp.config().staking || {}).v !== 2, since = Date.now() - (full ? 365 : 30) * DAY;   // the first reading goes back a year (every window), then 30 days
      if (manual || Date.now() - lastRw > RW_EVERY) { lastRw = Date.now(); try { rewards = await readRewards(r, since); } catch (e) { rewards = null; } }
      // Revolut X's own euro prices first; eToro's for a coin Revolut X gives none for
      try { if (await readTickers(r)) lastPx = Date.now(); } catch (e) { /* eToro's below */ }
      let eur = {};
      const fromRevx = px && Date.now() - px.at < 10 * 60e3 ? px.eur : {};
      for (const sym of syms) if (fromRevx[sym]) eur[sym] = fromRevx[sym].p;
      const rest = syms.filter((x) => !(eur[x] > 0));
      if (rest.length) { try { Object.assign(eur, await eurPrices(rest)); } catch (e) { if (!Object.keys(eur).length) { const m = 'Read your coins, but got no prices (' + e.message + '): nothing changed.'; saveR({ msg: m }); return show(m, true); } } }
      // the other devices' latest holdings first, so this read never writes back an older copy of them
      if (window.SRSync && window.SRSync.pull) { try { await window.SRSync.pull(); } catch (e) { /* this device's copy */ } }
      const cfg = SRApp.config();
      if (!String(cfg.holdings || '').trim()) { const m = 'Type your holdings in Holdings first: the coins are added to them.'; saveR({ msg: m }); return show(m, true); }
      const m = merge(cfg.holdings, bal, eur, r.coins);
      const n = Object.keys(m.coins).length, at = Date.now();
      const stakeChanged = rewards ? keepStaking(cfg, staked, rewards, since, full) : false;
      let msg = `Read at ${hhmm(at)}: ${n} coin${n === 1 ? '' : 's'}${m.changed ? ', holdings updated' : ', no change'}.`;
      if (m.noPrice.length) msg += ` No price for ${m.noPrice.join(', ')}: kept as typed.`;
      if (m.changed) {
        const base = rebase(cfg, m.text, m.touched);
        cfg.holdings = m.text;
        if (base) cfg.holdingsBase = base; else delete cfg.holdingsBase;
        SRApp.saveConfig(cfg);
        if (window.SRSync) window.SRSync.pushSoon();
        SRApp.applyConfig();
        if ($('cfg-holdings') && !$('settings').hidden) $('cfg-holdings').value = m.text;
      } else if (rewards) {
        SRApp.saveConfig(cfg);
        if (stakeChanged && window.SRSync) window.SRSync.pushSoon();
      }
      saveR({ coins: m.lineQty, qty: m.coins, staked, at, msg });
      if (rewards && window.SR && window.SR.liveNow) { try { window.SR.liveNow(); } catch (e) { /* the next tick */ } }
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
  const tick = () => {
    if (due()) { read(false); return; }
    const r = R();
    if (r.priv && r.apiKey && (r.qty || r.coins) && !document.hidden && !busy && !pxBusy && Date.now() - lastPx > PX_EVERY - 1500) {
      pxBusy = true; lastPx = Date.now();
      readTickers(r).catch(() => false).then(() => { pxBusy = false; });
    }
  };
  window.SRRevx = { read, merge, rebase, signedHeaders, makeKey, values, parseTickers, parseRewards, staking, keepStaking, query, PATH, BASE, TX };
  wire();
  setTimeout(tick, 4000);
  setInterval(tick, PX_EVERY);
  const resume = window.appResume;
  window.appResume = () => { if (resume) resume(); tick(); };
  document.addEventListener('visibilitychange', tick);
})();
