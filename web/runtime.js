// A small stand-in for the Claude dashboard runtime, so the dashboard's own scripts
// (calc.js, ui.js, draw-*.js) run unchanged inside the Android app.
// Data comes from eToro's public API with the user's keys, or Yahoo Finance as a no-key fallback.
(function () {
  'use strict';
  const DATASETS = [
    ['SPY', 3000], ['QQQ', 3006], ['IWM', 3005], ['XLK', 3021], ['XLF', 3004], ['XLE', 3008], ['XLV', 3017],
    ['XLI', 3019], ['XLY', 3024], ['XLP', 3022], ['XLU', 3013], ['XLB', 4438], ['XLRE', 4442], ['XLC', 4427],
    ['SMH', 6357], ['IGV', 10879], ['XBI', 4431], ['KRE', 4443], ['ITA', 6961], ['GDX', 3002], ['SIL', 14481],
    ['COPX', 10805], ['URA', 8748], ['GLD', 3025], ['TLT', 3020], ['IBIT', 1367],
    ['AG', 6584], ['MSTR', 6473], ['SPCX', 15618], ['MRVL', 4358], ['AAOI', 9462], ['CCJ', 6634], ['NXE', 14428], ['EURUSD', 1],
  ];
  const YAHOO = { EURUSD: 'EURUSD=X' }; // Yahoo's symbol where it differs
  const STALE_MS = 55 * 60 * 1000;
  const DEFAULT_PARAMS = { range: '3M', view: 'Sector', tgrp: 'all', sort: 'r1m', dir: 'desc', tf: 'D' };
  const DEFAULT_CONFIG = { source: 'etoro', apiKey: '', userKey: '', notify: true, notifyGo: true, notifyPhase: true, notifyWatch: true, notifyRegime: true, notifyHoldings: true, watch: 'SMH, GDX, SIL, IBIT, QQQ', holdings: '' };

  const loaders = {}, calcs = {}, draws = {}, onDataFns = [], listeners = [];
  const store = {};
  const state = { loading: false, error: null, at: null, source: null, failed: [] };
  const hasNative = () => typeof window.Native !== 'undefined' && window.Native !== null;
  const headless = () => hasNative() && typeof Native.isHeadless === 'function' && Native.isHeadless();

  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  };
  let params = Object.assign({}, DEFAULT_PARAMS, ls.get('sr.params', {}));

  // ---- settings ---------------------------------------------------------------
  function config() {
    let c = {};
    try { c = JSON.parse((hasNative() ? Native.getConfig() : localStorage.getItem('sr.config')) || '{}') || {}; } catch (e) { c = {}; }
    return Object.assign({}, DEFAULT_CONFIG, c);
  }
  function saveConfig(c) {
    const s = JSON.stringify(Object.assign({}, DEFAULT_CONFIG, c));
    if (hasNative()) Native.setConfig(s); else localStorage.setItem('sr.config', s);
  }

  // ---- network (native when inside the app, so no CORS) --------------------------
  const pending = {};
  let seq = 0;
  window.__nativeCallback = function (id, status, body) {
    const p = pending[id];
    if (p) { delete pending[id]; p({ status, body }); }
  };
  function httpGet(url, headers) {
    if (hasNative() && typeof Native.httpGet === 'function') {
      return new Promise((resolve) => {
        const id = 'r' + (++seq);
        const timer = setTimeout(() => { if (pending[id]) { delete pending[id]; resolve({ status: 0, body: 'timed out' }); } }, 45000);
        pending[id] = (r) => { clearTimeout(timer); resolve(r); };
        Native.httpGet(id, url, JSON.stringify(headers || {}));
      });
    }
    return fetch(url, { headers }).then(async (r) => ({ status: r.status, body: await r.text() }), (e) => ({ status: 0, body: String(e) }));
  }
  // GET and PUT through the app, for the settings sync (older apps don't have it: status -1)
  function request(method, url, headers, body) {
    if (!(hasNative() && typeof Native.httpRequest === 'function')) return Promise.resolve({ status: -1, body: 'this version of the app cannot sync yet' });
    return new Promise((resolve) => {
      const id = 'r' + (++seq);
      const timer = setTimeout(() => { if (pending[id]) { delete pending[id]; resolve({ status: 0, body: 'timed out' }); } }, 45000);
      pending[id] = (r) => { clearTimeout(timer); resolve(r); };
      Native.httpRequest(id, method, url, JSON.stringify(headers || {}), body == null ? null : String(body));
    });
  }
  function uuid() {
    const b = new Uint8Array(16);
    (window.crypto || {}).getRandomValues ? crypto.getRandomValues(b) : b.forEach((_, i) => (b[i] = Math.floor(Math.random() * 256)));
    b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }
  // eToro's short reason for a refusal, from a JSON error body or plain text
  function reasonOf(body) {
    const b = String(body || '');
    try {
      const j = JSON.parse(b), e = j && (j.error || j.errors);
      const m = (j && (j.message || j.Message || j.error_description || j.detail || j.title || j.errorMessage)) || (e && (e.message || e.code || (typeof e === 'string' ? e : JSON.stringify(e))));
      if (m) return String(m).slice(0, 200);
    } catch (x) { /* not JSON */ }
    return b.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
  }
  function httpError(source, sym, r) {
    const e = new Error(`${source} ${sym}: ${r.status || 'no connection'}${r.body ? ' ' + String(r.body).slice(0, 160) : ''}`);
    e.status = r.status;
    e.reason = reasonOf(r.body);
    return e;
  }
  // keys never contain spaces: drop any that came along when copying (line breaks, zero-width spaces)
  const cleanKey = (k) => String(k || '').replace(/[\s\u200B-\u200D\u2060\uFEFF]/g, '');
  const etoroHeaders = (apiKey, userKey) => ({ 'x-api-key': cleanKey(apiKey), 'x-user-key': cleanKey(userKey), 'x-request-id': uuid(), Accept: 'application/json' });
  async function testKeys(apiKey, userKey) {
    const r = await httpGet('https://public-api.etoro.com/api/v1/market-data/instruments/3000/history/candles/desc/OneDay/2', etoroHeaders(apiKey, userKey));
    return { ok: r.status === 200, status: r.status, reason: r.status === 200 ? '' : reasonOf(r.body) };
  }
  async function fetchEtoro(sym, iid, cfg) {
    const url = `https://public-api.etoro.com/api/v1/market-data/instruments/${iid}/history/candles/desc/OneDay/400`;
    const r = await httpGet(url, etoroHeaders(cfg.apiKey, cfg.userKey));
    if (r.status !== 200) throw httpError('eToro', sym, r);
    const L = loaders[sym];
    return L ? L.fn({ answer: r.body }) : [];
  }
  function parseYahoo(body, sym) {
    const j = typeof body === 'string' ? JSON.parse(body) : body;
    const res = j && j.chart && j.chart.result && j.chart.result[0];
    if (!res || !res.timestamp) throw new Error('Yahoo ' + sym + ': no data' + (j && j.chart && j.chart.error ? ' (' + (j.chart.error.description || j.chart.error.code) + ')' : ''));
    const q = res.indicators.quote[0], off = (res.meta && res.meta.gmtoffset) || 0, r4 = (v) => Math.round(v * 1e4) / 1e4;
    const byDate = new Map();
    res.timestamp.forEach((ts, i) => {
      const o = q.open[i], h = q.high[i], l = q.low[i], c = q.close[i];
      if (o == null || h == null || l == null || c == null) return;
      const date = new Date((ts + off) * 1000).toISOString().slice(0, 10);
      byDate.set(date, { date, open: r4(o), high: r4(h), low: r4(l), close: r4(c), volume: q.volume[i] || 0 });
    });
    return Array.from(byDate.values()).sort((a, b) => (a.date < b.date ? -1 : 1)).slice(-400);
  }
  async function fetchYahoo(sym) {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(YAHOO[sym] || sym)}?range=2y&interval=1d&includePrePost=false`;
    const r = await httpGet(url, { 'User-Agent': 'Mozilla/5.0 (Linux; Android 16; SM-S948B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36', Accept: 'application/json' });
    if (r.status !== 200) throw httpError('Yahoo', sym, r);
    return parseYahoo(r.body, sym);
  }
  async function pool(items, n, fn) {
    let i = 0;
    const worker = async () => { while (i < items.length) { const it = items[i++]; await fn(it); } };
    await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  }

  // ---- cache (shared by the app and the hourly background check) ------------------
  const pack = (rows) => rows.map((r) => [r.date, r.open, r.high, r.low, r.close, r.volume]);
  const unpack = (rows) => rows.map((a) => ({ date: a[0], open: a[1], high: a[2], low: a[3], close: a[4], volume: a[5] }));
  function loadCache() { return ls.get('sr.cache', null); }
  function saveCache(source, rows) {
    const packed = {};
    for (const [s] of DATASETS) packed[s] = pack(rows[s] || []);
    ls.set('sr.cache', { at: Date.now(), source, rows: packed });
  }

  // ---- holdings: one per line: "TICKER", "TICKER = US symbol it follows", "long" for a long-term hold,
  //      "rough" when the US symbol only roughly follows it, and optionally the euro amount held:
  //      "SEC0 = SMH 500", "MSTR 250,50 long", "QUTM = QQQ rough 100" ----
  function parseHoldings(text) {
    const defaults = window.SR_HOLDINGS || [];
    if (!text || !String(text).trim()) return defaults.slice();
    const out = [];
    // a comma between two digits is a decimal comma (250,50); any other comma, a semicolon or a new line separates holdings
    for (const raw of String(text).split(/\r?\n|;|,(?!\d)|(?<!\d),/)) {
      let line = raw.trim();
      if (!line) continue;
      const long = /\blong(-term)?\b/i.test(line), rough = /\brough\b/i.test(line);
      line = line.replace(/\blong(-term)?\b|\brough\b/ig, ' ');
      // the amount: a number on its own, with or without a euro sign (tickers such as SEC0 are not numbers)
      let amount = null;
      line = line.replace(/(^|\s)(?:€\s?)?(\d+(?:[.,]\d+)?)(?:\s?€|\s?eur(?:os?)?)?(?=\s|$)/i, (m, pre, num) => { amount = parseFloat(num.replace(',', '.')); return pre + ' '; });
      const parts = line.split('=').map((x) => x.trim().toUpperCase()).filter(Boolean);
      const ticker = (parts[0] || '').split(/\s+/)[0];
      if (!ticker) continue;
      const tracks = parts[1] ? parts[1].split(/\s+/)[0] : ticker;
      const d = defaults.find((h) => h.ticker === ticker), known = d && d.tracks === tracks;
      out.push({
        ticker, name: d ? d.name : '', tracks,
        match: rough ? 'rough' : known ? d.match : tracks === ticker ? 'same' : 'close',
        long_term: long, note: known ? d.note : '', amount: amount > 0 ? amount : null,
      });
    }
    return out;
  }
  function setHoldings() { store.holdings = { status: 'ok', data: parseHoldings(config().holdings) }; }
  // the fixed 15-year study shipped with the app (the dashboard reads the same three files)
  function setStudy() {
    const S = window.SR_STUDY || {};
    for (const k of ['curve', 'rules', 'splits']) store['study_' + k] = { status: 'ok', data: S[k] || [] };
  }

  // ---- calculations ---------------------------------------------------------------
  function recompute() {
    for (const id of Object.keys(calcs)) delete store[id];
    let progress = true;
    while (progress) {
      progress = false;
      for (const [id, c] of Object.entries(calcs)) {
        if (store[id]) continue;
        const ins = c.inputs.map((i) => store[i]);
        if (ins.some((s) => !s)) continue;
        progress = true;
        if (ins.some((s) => s.status !== 'ok')) { store[id] = { status: 'error', data: [], message: 'An input did not load' }; continue; }
        try { store[id] = { status: 'ok', data: c.fn.apply(null, ins.map((s) => s.data)) }; }
        catch (e) { store[id] = { status: 'error', data: [], message: String((e && e.message) || e) }; if (window.console) console.error('calc ' + id, e); }
      }
    }
  }
  // Today's daily candle is still forming until the US close (pre-market included): drop it for close-based signals.
  function closedOnly(rows) {
    const now = new Date();
    const et = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' }).formatToParts(now);
    const g = (t) => (et.find((p) => p.type === t) || {}).value;
    const today = `${g('year')}-${g('month')}-${g('day')}`, minutes = Number(g('hour')) * 60 + Number(g('minute'));
    const open = minutes < 16 * 60 + 15 && !['Sat', 'Sun'].includes(g('weekday'));
    return rows.map((list) => (open && list.length && list[list.length - 1].date === today ? list.slice(0, -1) : list));
  }
  function setDatasets(rowsBySym, meta, opts) {
    const close = opts && opts.closedOnly;
    const syms = DATASETS.map((d) => d[0]);
    const lists = syms.map((s) => rowsBySym[s] || []);
    const used = close ? closedOnly(lists) : lists;
    syms.forEach((s, i) => { store[s] = { status: 'ok', data: used[i] }; });
    if (!store.revolut) store.revolut = { status: 'ok', data: window.SR_REVOLUT || [] };
    if (!store.study_rules) setStudy();
    setHoldings();
    state.at = meta.at; state.source = meta.source;
    recompute();
  }

  // ---- refresh ----------------------------------------------------------------------
  let inflight = null;
  async function refresh(opts) {
    opts = opts || {};
    if (inflight) return inflight;
    inflight = (async () => {
      const cfg = config();
      const src = cfg.source === 'yahoo' ? 'yahoo' : 'etoro';
      if (src === 'etoro' && !(cfg.apiKey && cfg.userKey)) {
        state.error = { kind: 'keys', message: 'Add your eToro API keys in Settings, or switch to the no-key data source.' };
        emit();
        return false;
      }
      state.loading = true; state.error = null; emit();
      const got = {}, errors = [];
      await pool(DATASETS, 4, async ([sym, iid]) => {
        try {
          const rows = src === 'yahoo' ? await fetchYahoo(sym) : await fetchEtoro(sym, iid, cfg);
          if (!rows.length) throw new Error(sym + ': no candles');
          got[sym] = rows;
        } catch (e) { errors.push({ sym, status: e.status || 0, reason: e.reason || '', message: String(e.message || e) }); }
      });
      state.loading = false;
      if (!Object.keys(got).length) {
        const auth = errors.find((e) => e.status === 401 || e.status === 403);
        state.error = { kind: auth ? 'keys' : 'network', message: auth ? `eToro refused the API keys (${auth.status}${auth.reason ? ': ' + auth.reason : ''}). Check them in Settings, or use Test keys there.` : 'Could not reach ' + (src === 'yahoo' ? 'Yahoo Finance' : 'eToro') + ': ' + ((errors[0] && errors[0].message) || 'no connection') };
        emit();
        return false;
      }
      const cache = loadCache(), rows = {};
      for (const [s] of DATASETS) rows[s] = got[s] || (cache && cache.source === src && cache.rows && cache.rows[s] ? unpack(cache.rows[s]) : []);
      saveCache(src, rows);
      state.failed = errors.map((e) => e.sym);
      if (errors.length) state.error = { kind: 'partial', message: `${errors.length} of ${DATASETS.length} ETFs didn't update (${state.failed.join(', ')}); showing the last data for them.` };
      setDatasets(rows, { at: Date.now(), source: src }, { closedOnly: !!opts.closedOnly });
      emit();
      return true;
    })();
    try { return await inflight; } finally { inflight = null; }
  }
  function boot() {
    store.revolut = { status: 'ok', data: window.SR_REVOLUT || [] };
    setStudy();
    setHoldings();
    const cache = loadCache();
    if (cache && cache.rows) {
      const rows = {};
      for (const [s] of DATASETS) rows[s] = unpack(cache.rows[s] || []);
      setDatasets(rows, { at: cache.at, source: cache.source });
    }
    emit();
    return cache;
  }
  function isStale() { const c = loadCache(); return !c || Date.now() - c.at > STALE_MS || c.source !== (config().source === 'yahoo' ? 'yahoo' : 'etoro'); }

  // ---- what the background check compares ---------------------------------------------
  function summarize() {
    const M = (store.metrics && store.metrics.data) || [], RU = (store.rule && store.rule.data) || [];
    const etfs = {};
    for (const m of M) etfs[m.symbol] = { name: m.name, group: m.group, phase: m.phase, close: m.close, exit: m.exit, entry: m.entry, exit_hit: !!m.exit_hit, entry_hit: !!m.entry_hit };
    const spy = M.find((m) => m.symbol === 'SPY') || {};
    const G = (store.regime && store.regime.data && store.regime.data[0]) || null, P = (store.portfolio && store.portfolio.data) || [];
    return {
      asof: spy.date || null, at: Date.now(), rule: { friday: (RU.find((r) => r.last_friday) || {}).last_friday || null, picks: RU.filter((r) => r.pick).map((r) => r.symbol).sort() }, etfs,
      regime: G ? { label: G.label, stance: G.stance } : null,
      holdings: P.map((h) => ({ ticker: h.ticker, tracks: h.tracks, verdict: h.verdict, into: h.into || null })),
    };
  }
  const TRANSITIONS = {
    'Leading>Weakening': 'losing momentum', 'Weakening>Lagging': 'rolled over', 'Lagging>Improving': 'turning up', 'Improving>Leading': 'now leading',
    'Weakening>Leading': 're-accelerating', 'Improving>Lagging': 'turn failed', 'Leading>Lagging': 'broke down', 'Lagging>Leading': 'snapped back',
  };
  function diff(prev, cur, cfg) {
    const ev = [], f2 = (v) => (v == null ? '—' : Number(v).toFixed(2));
    if (!prev || !prev.etfs) return ev;
    // a new Friday whose picks differ from the previous Friday's: time to move a quarter of the rotating money
    if (cfg.notifyGo !== false && cur.rule && prev.rule && cur.rule.friday && prev.rule.friday && cur.rule.friday !== prev.rule.friday) {
      const was = prev.rule.picks || [], now = cur.rule.picks || [];
      const ins = now.filter((s) => !was.includes(s)), outs = was.filter((s) => !now.includes(s));
      if (ins.length || outs.length) ev.push(`Rotation rule, Friday ${cur.rule.friday}: picks ${now.join(', ') || 'none'} (in: ${ins.join(', ') || 'none'}; out: ${outs.join(', ') || 'none'}). Move a quarter of your rotation money.`);
    }
    if (cfg.notifyPhase !== false) {
      for (const [s, e] of Object.entries(cur.etfs)) {
        const p = prev.etfs[s];
        if (!p || !p.phase || !e.phase || p.phase === e.phase || e.group === 'Market') continue;
        const tag = TRANSITIONS[p.phase + '>' + e.phase];
        if (tag) ev.push(`${s} ${e.name}: ${p.phase} → ${e.phase} (${tag})`);
      }
    }
    if (cfg.notifyRegime !== false && cur.regime && prev.regime && cur.regime.label !== prev.regime.label) {
      ev.push(`Market regime: ${prev.regime.label} → ${cur.regime.label}. ${cur.regime.stance}`);
    }
    if (cfg.notifyHoldings !== false && cur.holdings && prev.holdings) {
      for (const h of cur.holdings) {
        const p = prev.holdings.find((x) => x.ticker === h.ticker);
        if (!p || !p.verdict || !h.verdict || p.verdict === h.verdict || h.verdict === 'No data' || p.verdict === 'No data') continue;
        ev.push(`Your ${h.ticker}: ${p.verdict} → ${h.verdict}${h.into ? ` (rotate into ${h.into})` : ''}`);
      }
    }
    if (cfg.notifyWatch !== false) {
      const watch = String(cfg.watch || '').toUpperCase().split(/[^A-Z]+/).filter(Boolean);
      for (const s of watch) {
        const e = cur.etfs[s], p = prev.etfs[s];
        if (!e || !p) continue;
        if (e.exit_hit && !p.exit_hit) ev.push(`${s} ${e.name}: closed below its exit ${f2(e.exit)}`);
        if (e.entry_hit && !p.entry_hit) ev.push(`${s} ${e.name}: closed above its entry ${f2(e.entry)}`);
      }
    }
    return ev;
  }

  // ---- drawing --------------------------------------------------------------------------
  function safe(fn) { try { fn(); } catch (e) { if (window.console) console.error(e); } }
  let queued = false;
  function render() {
    if (headless() || typeof document === 'undefined') return;
    if (queued) return;
    queued = true;
    const run = () => { queued = false; renderNow(); };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run); else setTimeout(run, 0);
  }
  function renderNow() {
    onDataFns.forEach((fn) => safe(fn));
    for (const [name, fn] of Object.entries(draws)) {
      document.querySelectorAll('[data-draw="' + name + '"]').forEach((el) => { if (!el.closest('[hidden]')) safe(() => fn(el)); });
    }
  }
  function emit() { listeners.forEach((fn) => safe(() => fn(state))); render(); }

  window.dash = {
    loader: (id, o) => { loaders[id] = o; },
    calc: (id, o) => { calcs[id] = o; },
    draw: (name, fn) => { draws[name] = fn; },
    onData: (fn) => { onDataFns.push(fn); },
    data: (id) => store[id] || { status: state.error && state.error.kind === 'keys' ? 'connect' : state.error ? 'error' : 'loading', data: [], message: state.error ? state.error.message : '' },
    params: () => Object.assign({}, params),
    setParams: (p) => {
      for (const [k, v] of Object.entries(p || {})) { if (v == null) delete params[k]; else params[k] = v; }
      ls.set('sr.params', params);
      render();
    },
    resetParams: () => { params = Object.assign({}, DEFAULT_PARAMS); ls.set('sr.params', params); render(); },
    colors: ['var(--sr-c1)', 'var(--sr-c2)', 'var(--sr-c3)', 'var(--sr-c4)', 'var(--sr-c5)', 'var(--sr-c6)', 'var(--sr-c7)', 'var(--sr-c8)'],
    setLink: () => {},
    refresh: () => refresh(),
  };
  // eToro reads for the live layer (prices, search, intraday candles) with the keys saved in Settings
  async function etoroGet(path) {
    const cfg = config();
    if (!(cfg.apiKey && cfg.userKey)) return { status: 0, body: '', reason: 'no keys' };
    return httpGet('https://public-api.etoro.com' + path, etoroHeaders(cfg.apiKey, cfg.userKey));
  }
  function renderDraw(name) {
    const fn = draws[name];
    if (fn) document.querySelectorAll('[data-draw="' + name + '"]').forEach((el) => { if (!el.closest('[hidden]')) safe(() => fn(el)); });
  }
  function applyConfig() { setHoldings(); recompute(); emit(); } // after settings arrive from another device
  const idOf = (sym) => (DATASETS.find((d) => d[0] === sym) || [])[1] || null;
  window.SRApp = { DATASETS, state, config, saveConfig, refresh, boot, isStale, render, renderDraw, summarize, diff, parseYahoo, parseHoldings, setHoldings, testKeys, reasonOf, cleanKey, etoroGet, idOf, request, applyConfig, onChange: (fn) => listeners.push(fn), _store: store };
})();
