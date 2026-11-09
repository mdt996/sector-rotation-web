// Live prices from eToro (real time, nothing delayed): quotes, search over every eToro asset,
// an asset page with a clean chart, the Price view of the Chart tab, and live values for your holdings.
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const S = () => SRApp._store;
  const POLL_MS = 10000;
  const FX = 1; // EURUSD on eToro

  // ---- formatting ---------------------------------------------------------------
  const fmtP = (x) => (x == null || !isFinite(x) ? '—' : x >= 1000 ? d3.format(',.2f')(x) : x >= 1 ? d3.format('.2f')(x) : d3.format('.4~g')(x));
  const fmtPct = (x) => (x == null || !isFinite(x) ? '—' : (x > 0 ? '+' : x < 0 ? '−' : '') + d3.format('.2%')(Math.abs(x)));
  const fmtEur = (x, signed) => (x == null || !isFinite(x) ? '—' : (signed ? (x > 0 ? '+' : x < 0 ? '−' : '') : '') + '€' + d3.format(',.0f')(Math.abs(x)));
  const cls = (x) => (x > 0 ? 'up' : x < 0 ? 'down' : '');
  const el = (tag, className, text) => { const e = document.createElement(tag); if (className) e.className = className; if (text != null) e.textContent = text; return e; };
  const hhmm = (ms) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  // the US trading day (America/New_York): a day's change is measured against the close before it
  const todayET = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* not kept */ } };
  const hasKeys = () => { const c = SRApp.config(); return !!(c.apiKey && c.userKey); };
  async function getJSON(path) {
    const r = await SRApp.etoroGet(path);
    if (r.status !== 200) { const e = new Error('eToro ' + (r.status || 'unreachable')); e.status = r.status; throw e; }
    return JSON.parse(r.body);
  }

  // ---- live quotes: one request for every instrument on screen, every 10 seconds ----
  const quotes = new Map(); // id -> { price, usd (price in dollars), at }
  const wanted = new Map(); // who -> Set of ids
  const ticks = new Set();
  let busy = false, timer = null, soon = null, lastIds = '';
  function want(who, ids) {
    const set = new Set((ids || []).filter((x) => x > 0));
    if (set.size) wanted.set(who, set); else wanted.delete(who);
    const key = [...allIds()].sort().join(',');
    if (key !== lastIds) { lastIds = key; clearTimeout(soon); soon = setTimeout(poll, 250); }
    if (!timer) timer = setInterval(poll, POLL_MS);
  }
  function allIds() { const s = new Set([FX]); for (const set of wanted.values()) for (const i of set) s.add(i); return s; }
  async function poll() {
    if (busy || document.hidden || !hasKeys()) return;
    busy = true;
    try {
      const ids = [...allIds()].slice(0, 100);
      const j = await getJSON('/api/v1/market-data/instruments/rates?instrumentIds=' + ids.join(','));
      for (const q of j.rates || []) {
        const p = q.bid > 0 && q.ask > 0 ? (q.bid + q.ask) / 2 : q.lastExecution || q.bid || q.ask;
        const conv = q.conversionRateBid > 0 ? q.conversionRateBid : 1;
        if (p > 0) quotes.set(q.instrumentID, { price: p, usd: p * conv, conv, at: Date.parse(q.date) || Date.now() });
      }
      ticks.forEach((fn) => { try { fn(); } catch (e) { if (window.console) console.error(e); } });
    } catch (e) { /* the next round tries again */ } finally { busy = false; }
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });

  // ---- candles ------------------------------------------------------------------
  const cache = new Map();
  async function candles(id, interval, count) {
    const key = id + '/' + interval + '/' + count, hit = cache.get(key), ttl = /Day|Week/.test(interval) ? 600000 : 60000;
    if (hit && Date.now() - hit.at < ttl) return hit.rows;
    const j = await getJSON(`/api/v1/market-data/instruments/${id}/history/candles/desc/${interval}/${count}`);
    const list = (j.candles && j.candles[0] && j.candles[0].candles) || [];
    const rows = list.map((c) => ({ t: Date.parse(c.fromDate), date: String(c.fromDate).slice(0, 10), open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume || 0 }))
      .filter((r) => r.close > 0).sort((a, b) => a.t - b.t);
    cache.set(key, { at: Date.now(), rows });
    return rows;
  }
  // the close before today's trading day: from the app's own daily data when it has the instrument, else asked once a day
  const prevCache = new Map();
  function prevFromRows(rows) { const t = todayET(); let p = null; for (const r of rows || []) if (r.date < t) p = r; return p ? p.close : null; }
  function storedRows(id) { const sym = (SRApp.DATASETS.find((d) => d[1] === id) || [])[0]; const d = sym && S()[sym]; return d && d.status === 'ok' && d.data.length ? d.data : null; }
  async function prevClose(id) {
    const own = storedRows(id);
    if (own) return prevFromRows(own);
    const hit = prevCache.get(id);
    if (hit && hit.day === todayET()) return hit.price;
    const price = prevFromRows(await candles(id, 'OneDay', 6));
    prevCache.set(id, { day: todayET(), price });
    return price;
  }
  const prevSync = (id) => { const own = storedRows(id); if (own) return prevFromRows(own); const h = prevCache.get(id); return h && h.day === todayET() ? h.price : null; };

  // ---- price zones: where the price sat against its 200-day average over the last 2 years ----
  // accumulate = its cheapest 10–25%, fair value = the middle half, take profit = its richest 75–90%
  const zcache = lsGet('sr.zones', {});
  function computeZones(rows) {
    const t = todayET(), closes = rows.filter((r) => r.date < t).map((r) => r.close);
    if (closes.length < 260) return null;
    const ratios = [];
    let sum = 0;
    for (let i = 0; i < closes.length; i++) { sum += closes[i]; if (i >= 200) sum -= closes[i - 200]; if (i >= 199) ratios.push(closes[i] / (sum / 200)); }
    const sorted = ratios.slice(-500).sort((a, b) => a - b), q = (p) => sorted[Math.round(p * (sorted.length - 1))];
    return { sma: sum / 200, q10: q(0.1), q25: q(0.25), q75: q(0.75), q90: q(0.9), n: sorted.length };
  }
  function zoneLevels(z) {
    if (!z || z.none) return null;
    const s = z.sma;
    return { acc: [s * z.q10, s * z.q25], fair: [s * z.q25, s * z.q75], tp: [s * z.q75, s * z.q90] };
  }
  function zoneOf(price, L) {
    if (price == null || !L) return null;
    if (price < L.acc[0]) return { key: 'deep', label: 'Bottom of its 2-year range' };
    if (price < L.acc[1]) return { key: 'acc', label: 'Low in its 2-year range' };
    if (price <= L.fair[1]) return { key: 'fair', label: 'Middle of its 2-year range' };
    if (price <= L.tp[1]) return { key: 'tp', label: 'High in its 2-year range' };
    return { key: 'hot', label: 'Top of its 2-year range' };
  }
  function zonesFrom(id, rows) { const z = computeZones(rows); zcache[id] = Object.assign({ day: todayET() }, z || { none: true }); lsSet('sr.zones', zcache); return zcache[id]; }
  async function zones(id) {
    const hit = zcache[id];
    if (hit && hit.day === todayET()) return hit;
    return zonesFrom(id, await candles(id, 'OneDay', 1000));
  }
  // weekly RSI (14, Wilder) on completed weeks (a week counts once its Friday has closed)
  function weeklyRsi(rows) {
    if (!rows || rows.length < 80) return null;
    const mon = (d) => { const t = Date.parse(d + 'T00:00:00Z'); return t - ((new Date(t).getUTCDay() + 6) % 7) * 864e5; };
    const w = [];
    for (let i = 0; i < rows.length; i++) { const n = rows[i + 1]; if (n ? mon(n.date) !== mon(rows[i].date) : new Date(rows[i].date + 'T00:00:00Z').getUTCDay() === 5 && rows[i].date < todayET()) w.push(rows[i].close); }
    let g = 0, l = 0, v = null;
    for (let i = 1; i < w.length; i++) {
      const d = w[i] - w[i - 1], up = Math.max(d, 0), dn = Math.max(-d, 0);
      if (i <= 14) { g += up / 14; l += dn / 14; if (i === 14) v = l === 0 ? 100 : 100 - 100 / (1 + g / l); } else { g = (g * 13 + up) / 14; l = (l * 13 + dn) / 14; v = l === 0 ? 100 : 100 - 100 / (1 + g / l); }
    }
    return v;
  }
  const zonesSync = (id) => { const z = zcache[id]; return z && z.day === todayET() ? z : null; };

  // ---- the asset page: live price, an eToro-style candle chart, zones and a few facts ----
  const FRAMES = [
    { k: '5m', iv: 'FiveMinutes', n: 1000, sec: 300, show: 140 },
    { k: '15m', iv: 'FifteenMinutes', n: 1000, sec: 900, show: 140 },
    { k: '1H', iv: 'OneHour', n: 1000, sec: 3600, show: 140 },
    { k: '4H', iv: 'FourHours', n: 1000, sec: 14400, show: 140 },
    { k: '1D', iv: 'OneDay', n: 1000, sec: 86400, show: 160 },
    { k: '1W', iv: 'OneWeek', n: 1000, sec: 604800, show: 160 },
  ];
  let vid = 0;
  const views = new Set(); // open asset pages, for Back (fullscreen, drawing mode)
  function assetView(root, inst, opts) {
    opts = opts || {};
    const who = 'view' + (++vid);
    let frame = FRAMES.find((f) => f.k === lsGet('sr.frame', '1D')) || FRAMES[4], bars = [], daily = [], prev = null, L = null, dead = false, hovering = false;
    root.replaceChildren();
    const wrap = root.appendChild(el('div', 'av'));
    const top = wrap.appendChild(el('div', 'av-top'));
    const idt = top.appendChild(el('div', 'av-id'));
    idt.appendChild(el('div', 'av-sym', inst.symbol));
    idt.appendChild(el('div', 'av-name', [inst.name, inst.exchange].filter(Boolean).join(' · ')));
    if (opts.picker) top.appendChild(opts.picker);
    const priceRow = wrap.appendChild(el('div', 'av-price'));
    const last = priceRow.appendChild(el('span', 'av-last', '—'));
    const chg = priceRow.appendChild(el('span', 'av-chg', ''));
    const badge = priceRow.appendChild(el('span', 'av-zone', ''));
    const sub = wrap.appendChild(el('div', 'av-sub', hasKeys() ? 'Connecting…' : 'Add your eToro keys in Settings for live prices.'));
    const frames = wrap.appendChild(el('div', 'av-ranges'));
    for (const f of FRAMES) { const b = frames.appendChild(el('button', '', f.k)); b.type = 'button'; b.addEventListener('click', () => { frame = f; lsSet('sr.frame', f.k); load(true); }); }
    const box = wrap.appendChild(el('div', 'av-chart'));
    const stats = wrap.appendChild(el('dl', 'av-stats'));
    const stat = (k, c) => { const d = stats.appendChild(el('div', c || '')); d.appendChild(el('dt', '', k)); return d.appendChild(el('dd', '', '—')); };
    const sPrev = stat('Previous close'), sDay = stat('Today'), sYear = stat('52 weeks'), s1y = stat('1 year');
    const sRsi = stat('Weekly RSI (14)'), sFv = stat('Fair value: bear · base · bull', 'z-fv'), sVs = stat('Price vs base fair value', 'z-fv');
    const sAcc = stat('Low part of 2-year range', 'z-acc'), sFair = stat('Middle', 'z-fair'), sTp = stat('High part', 'z-tp');
    const how = wrap.appendChild(el('button', 'sr-more av-how', 'What these mean')); how.type = 'button';
    const howText = wrap.appendChild(el('p', 'av-note', 'Weekly RSI above 70 = overheated: in a 15-year test of the sectors, the next 3 months averaged about −0.2% against +2.7% for a normal week, so it is a reason not to add (trimming is optional). It is the only signal that held up. The 2-year range bands only describe where the price sits against its 200-day average over the last 2 years; they did not predict returns. Fundamental fair value (blue, dashed): a bear / base / bull valuation from cash flows, earnings or assets, refreshed by hand.'));
    howText.hidden = true;
    const fvText = wrap.appendChild(el('p', 'av-note', '')); fvText.hidden = true;
    how.addEventListener('click', () => { howText.hidden = !howText.hidden; fvText.hidden = howText.hidden || !fvText.textContent; });

    // the chart: eToro/TradingView style, with drawing tools and indicators (chart.js)
    const ch = SRChart.create(box, { id: inst.id, priceFormat: fmtP, onHover: (bar) => { hovering = !!bar; if (!bar) header(); } });

    const live = () => quotes.get(inst.id);
    function header() {
      if (dead) return;
      const q = live(), price = q ? q.price : bars.length ? bars[bars.length - 1].close : null;
      last.textContent = fmtP(price);
      const c = price != null && prev ? price / prev - 1 : null;
      chg.textContent = c == null ? '' : `${fmtPct(c)}  ${price - prev >= 0 ? '+' : '−'}${fmtP(Math.abs(price - prev))} today`;
      chg.className = 'av-chg ' + cls(c);
      const wr = weeklyRsi(daily);
      badge.textContent = wr > 70 ? `Overheated · weekly RSI ${Math.round(wr)}` : ''; badge.className = 'av-zone' + (wr > 70 ? ' z-hot' : '');
      if (hovering) return;
      sub.textContent = q ? `Live · ${hhmm(q.at)}` : hasKeys() ? 'Waiting for a live price…' : 'Add your eToro keys in Settings for live prices.';
      sub.className = 'av-sub' + (q ? ' is-live' : '');
    }
    function toBars(rows) {
      return rows.map((r) => ({ time: Math.floor(r.t / 1000), open: r.open, high: r.high, low: r.low, close: r.close, volume: r.volume || 0 }));
    }
    const fairOf = () => (window.SR_FAIR && window.SR_FAIR[inst.symbol]) || null;
    function paint(fit) {
      if (dead) return;
      for (const b of frames.children) b.setAttribute('aria-selected', String(b.textContent === frame.k));
      ch.setBars(bars, frame, fit); ch.setZones(L); ch.setFair(fairOf());
    }
    // the live price moves the newest candle, or opens the next one
    function liveCandle() {
      const q = live();
      if (!q || !bars.length) return;
      const lastBar = bars[bars.length - 1], now = Math.floor(Date.now() / 1000);
      let bucket = Math.floor(now / frame.sec) * frame.sec;
      if (frame.sec === 604800) bucket = lastBar.time; // a week: the current candle
      if (frame.sec === 86400 && new Date(lastBar.time * 1000).toISOString().slice(0, 10) === new Date(q.at).toISOString().slice(0, 10)) bucket = lastBar.time;
      if (bucket <= lastBar.time) ch.update({ time: lastBar.time, open: lastBar.open, high: Math.max(lastBar.high, q.price), low: Math.min(lastBar.low, q.price), close: q.price, volume: lastBar.volume }, false);
      else if (q.at >= bucket * 1000) ch.update({ time: bucket, open: q.price, high: q.price, low: q.price, close: q.price, volume: 0 }, true);
    }
    function facts() {
      const q = live(), price = q ? q.price : null;
      sPrev.textContent = fmtP(prev);
      const today = daily.length && daily[daily.length - 1].date >= todayET() ? daily[daily.length - 1] : null;
      sDay.textContent = today ? `${fmtP(Math.min(today.low, price || today.low))} – ${fmtP(Math.max(today.high, price || today.high))}` : '—';
      const yr = daily.filter((r) => r.t >= Date.now() - 365 * 864e5);
      sYear.textContent = yr.length ? `${fmtP(d3.min(yr, (r) => r.low))} – ${fmtP(d3.max(yr, (r) => r.high))}` : '—';
      const y1 = yr.length ? yr[0].close : null, now = price || (daily.length ? daily[daily.length - 1].close : null);
      const c = y1 && now ? now / y1 - 1 : null;
      s1y.textContent = fmtPct(c); s1y.className = cls(c);
      const wr = weeklyRsi(daily);
      sRsi.textContent = wr == null ? '—' : Math.round(wr) + (wr > 70 ? ' · overheated: don\'t add' : '');
      sRsi.className = wr > 70 ? 'sr-hot' : '';
      sAcc.textContent = L ? `${fmtP(L.acc[0])} – ${fmtP(L.acc[1])}` : 'Not enough history';
      sFair.textContent = L ? `${fmtP(L.fair[0])} – ${fmtP(L.fair[1])}` : '—';
      sTp.textContent = L ? `${fmtP(L.tp[0])} – ${fmtP(L.tp[1])}` : '—';
      const fv = fairOf();
      sFv.textContent = fv ? `${fmtP(fv.bear)} · ${fmtP(fv.base)} · ${fmtP(fv.bull)}` : 'Not valued yet';
      sFv.parentElement.title = fv && fv.method ? fv.method : '';
      const vs = fv && now ? now / fv.base - 1 : null;
      sVs.textContent = vs == null ? '—' : `${Math.abs(vs) < 0.005 ? 'at' : d3.format('.0%')(Math.abs(vs)) + (vs > 0 ? ' above' : ' below')} · ${fv.confidence || 'low'} confidence`;
      sVs.parentElement.hidden = !fv; sFv.parentElement.hidden = !fv;
      fvText.textContent = fv ? `Fair value for ${inst.symbol} (${fv.as_of || 'November 2026'}, ${fv.confidence || 'low'} confidence): ${fv.method}. ${fv.implied || ''}` : '';
    }
    async function load(fit) {
      if (!hasKeys()) { header(); return; }
      box.classList.add('is-loading');
      try {
        const [d, pc] = await Promise.all([candles(inst.id, 'OneDay', 1000), prevClose(inst.id)]);
        const rows = frame.iv === 'OneDay' ? d : await candles(inst.id, frame.iv, frame.n);
        if (dead) return;
        daily = d; prev = pc; L = zoneLevels(zonesFrom(inst.id, d));
        bars = toBars(rows);
        paint(fit); liveCandle(); header(); facts();
      } catch (e) {
        if (!dead) sub.textContent = 'eToro did not answer (' + (e.status || 'no connection') + ').';
      } finally { box.classList.remove('is-loading'); }
    }
    const tick = () => { if (dead) return; liveCandle(); header(); facts(); };
    ticks.add(tick);
    want(who, [inst.id]);
    load(true);
    const api = { id: inst.id, back: () => ch.back(), destroy() { dead = true; ticks.delete(tick); want(who, []); views.delete(api); ch.destroy(); } };
    views.add(api);
    return api;
  }

  // ---- search over every eToro asset ------------------------------------------------
  const FIELDS = 'instrumentId,displayname,internalSymbolFull,currentRate,dailyPriceChange,instrumentType,internalExchangeName,popularityUniques7Day';
  const variant = (s) => /\.(RTH|24-7)$/i.test(s);
  async function search(q) {
    const base = `/api/v1/market-data/search?fields=${FIELDS}&pageSize=15&sort=-popularityUniques7Day&`;
    const Q = q.toUpperCase().replace(/[^A-Z0-9.\-]/g, '');
    const tries = [getJSON(base + 'displayname=' + encodeURIComponent(q)).catch(() => null)];
    if (Q) {
      tries.push(getJSON(base + 'internalSymbolFull=' + encodeURIComponent(Q)).catch(() => null));
      // European listings (e.g. SEC0.DE, VUAA.L) are found by their exact symbol
      const syms = Q.includes('.') ? [Q] : [Q, Q + '.L', Q + '.DE', Q + '.MI', Q + '.PA', Q + '.AS'];
      tries.push(getJSON('/api/v2/market-data/instruments?symbols=' + syms.join(',')).catch(() => null));
    }
    const [byName, bySym, exact] = await Promise.all(tries);
    const out = new Map();
    const add = (o) => { if (o.id && !out.has(o.id)) out.set(o.id, o); };
    for (const j of [bySym, byName]) for (const it of (j && j.items) || []) {
      const prevC = it.currentRate > 0 && it.dailyPriceChange != null ? it.currentRate / (1 + it.dailyPriceChange / 100) : null;
      add({ id: it.instrumentId, symbol: it.internalSymbolFull, name: it.displayname, exchange: it.internalExchangeName, type: it.instrumentType, rate: it.currentRate, prev: prevC, pop: it.popularityUniques7Day || 0 });
    }
    for (const it of (exact && exact.results) || []) add({ id: it.instrumentId, symbol: it.symbol, name: it.displayName, exchange: '', type: it.type, rate: null, prev: null, pop: 0 });
    const rank = (o) => (o.symbol === Q ? 0 : o.symbol.split('.')[0] === Q ? 1 : o.symbol.startsWith(Q) ? 2 : o.name.toUpperCase().startsWith(q.toUpperCase()) ? 3 : 4) + (variant(o.symbol) ? 0.5 : 0);
    return [...out.values()].sort((a, b) => rank(a) - rank(b) || b.pop - a.pop).slice(0, 20);
  }

  const sheet = () => $('search');
  let results = [], view = null, qTimer = null, seq = 0;
  function open() {
    sheet().hidden = false; document.body.classList.add('sheet-open');
    showResults(); const q = $('search-q'); q.focus(); if (!q.value) listDefault();
  }
  function close() { closeDetail(); want('search', []); sheet().hidden = true; document.body.classList.remove('sheet-open'); }
  function showResults() { $('search-detail').hidden = true; $('search-results').hidden = false; }
  function closeDetail() { if (view) { view.destroy(); view = null; } showResults(); want('search', results.map((r) => r.id)); }
  function back() { for (const v of views) if (v.back()) return true; if (sheet().hidden) return false; if (!$('search-detail').hidden) closeDetail(); else close(); return true; }
  function openDetail(r) {
    const recent = lsGet('sr.recent', []).filter((x) => x.id !== r.id);
    recent.unshift({ id: r.id, symbol: r.symbol, name: r.name, exchange: r.exchange, type: r.type });
    lsSet('sr.recent', recent.slice(0, 12));
    $('search-results').hidden = true; const d = $('search-detail'); d.hidden = false;
    if (view) view.destroy();
    view = assetView(d, r);
    want('search', []);
  }
  function row(r) {
    const b = el('button', 'sr-res'); b.type = 'button';
    const av = b.appendChild(el('span', 'sr-res-av', (r.symbol || '?').replace(/[^A-Z0-9]/gi, '').slice(0, 2)));
    av.setAttribute('aria-hidden', 'true');
    const mid = b.appendChild(el('span', 'sr-res-mid'));
    mid.appendChild(el('b', '', r.symbol));
    mid.appendChild(el('span', 'sr-res-name', [r.name, r.type].filter(Boolean).join(' · ')));
    const right = b.appendChild(el('span', 'sr-res-right'));
    right.appendChild(el('span', 'sr-res-price', '—'));
    right.appendChild(el('span', 'sr-res-chg', ''));
    b.addEventListener('click', () => openDetail(r));
    b._r = r;
    return b;
  }
  function paintQuotes() {
    for (const b of document.querySelectorAll('#search-results .sr-res')) {
      const r = b._r, q = quotes.get(r.id), price = q ? q.price : null;
      if (r.prev == null) { const p = prevSync(r.id); if (p) r.prev = p; }
      b.querySelector('.sr-res-price').textContent = price != null ? fmtP(price) : 'No live price';
      b.classList.toggle('is-stale', price == null && quotesSeen.has(r.id));
      const c = price != null && r.prev ? price / r.prev - 1 : null, ce = b.querySelector('.sr-res-chg');
      ce.textContent = c == null ? '' : fmtPct(c); ce.className = 'sr-res-chg ' + cls(c);
    }
  }
  const quotesSeen = new Set();
  ticks.add(() => { for (const id of allIds()) quotesSeen.add(id); if (!sheet() || sheet().hidden) return; paintQuotes(); });
  function list(title, items) {
    const box = $('search-results'); box.replaceChildren();
    if (title) box.appendChild(el('div', 'sr-res-h', title));
    if (!items.length) { box.appendChild(el('div', 'sr-res-none', title ? '' : 'Nothing found on eToro.')); }
    for (const r of items) box.appendChild(row(r));
    results = items;
    want('search', items.map((r) => r.id));
    for (const r of items) if (r.prev == null) prevClose(r.id).then((p) => { r.prev = p; paintQuotes(); }).catch(() => {});
    paintQuotes();
  }
  function listDefault() {
    if (!hasKeys()) { const box = $('search-results'); box.replaceChildren(el('div', 'sr-res-none', 'Add your eToro keys in Settings to search and see live prices.')); return; }
    const mine = holdingsLive().map((h) => ({ id: h.id, symbol: h.symbol, name: h.name, exchange: '', type: h.proxy ? 'via ' + h.symbol : '', prev: null, pop: 0 }));
    const seen = new Set(mine.map((m) => m.id));
    const recent = lsGet('sr.recent', []).filter((r) => !seen.has(r.id)).map((r) => ({ ...r, prev: null }));
    const box = $('search-results'); box.replaceChildren();
    const all = [];
    if (recent.length) { box.appendChild(el('div', 'sr-res-h', 'Recent')); for (const r of recent) { box.appendChild(row(r)); all.push(r); } }
    if (mine.length) { box.appendChild(el('div', 'sr-res-h', 'Your holdings')); for (const r of mine) { box.appendChild(row(r)); all.push(r); } }
    results = all;
    want('search', all.map((r) => r.id));
    for (const r of all) prevClose(r.id).then((p) => { r.prev = p; paintQuotes(); }).catch(() => {});
    paintQuotes();
  }
  function onType() {
    clearTimeout(qTimer);
    const q = $('search-q').value.trim();
    if (!q) { listDefault(); return; }
    qTimer = setTimeout(async () => {
      const my = ++seq;
      $('search-results').classList.add('is-loading');
      try { const r = await search(q); if (my === seq) list('', r); }
      catch (e) { if (my === seq) $('search-results').replaceChildren(el('div', 'sr-res-none', 'eToro did not answer.')); }
      finally { if (my === seq) $('search-results').classList.remove('is-loading'); }
    }, 300);
  }

  // ---- your holdings, live -------------------------------------------------------------
  // European ETFs on Revolut with a live twin on eToro (the same fund on the London exchange)
  const TWINS = { VUAA: [1040155, 'VUAA.L'], IS0E: [3228, 'SPGP.L'], QUTM: [1047540, 'QNTM.L'] };
  function liveOf(h) {
    const t = TWINS[h.ticker];
    if (t) return { id: t[0], symbol: t[1], proxy: false };
    const own = SRApp.idOf(h.ticker);
    if (own && h.tracks === h.ticker) return { id: own, symbol: h.ticker, proxy: false };
    const tr = SRApp.idOf(h.tracks);
    return tr ? { id: tr, symbol: h.tracks, proxy: true } : null;
  }
  function holdingsLive() {
    const H = (S().holdings && S().holdings.data) || [];
    return H.map((h) => { const l = liveOf(h); return l ? { ...h, ...l, name: h.name || h.ticker } : null; }).filter(Boolean);
  }
  // amounts are anchored to the live price each holding had when its amount was typed in (or first seen live)
  function base() {
    const cfg = SRApp.config(), fx = quotes.get(FX);
    let b = cfg.holdingsBase && cfg.holdingsBase.text === cfg.holdings ? cfg.holdingsBase : { text: cfg.holdings, rows: {} };
    let changed = b !== cfg.holdingsBase;
    if (fx) for (const h of holdingsLive()) {
      const q = quotes.get(h.id), r = b.rows[h.ticker];
      if (h.amount > 0 && q && (!r || r.id !== h.id)) { b.rows[h.ticker] = { id: h.id, usd: q.usd, fx: fx.price, at: Date.now() }; changed = true; }
    }
    if (changed && Object.keys(b.rows).length) { SRApp.saveConfig(Object.assign(cfg, { holdingsBase: b })); if (window.SRSync) window.SRSync.pushSoon(); }
    return b;
  }
  const fxPrev = () => { const d = S().EURUSD; return d && d.status === 'ok' ? prevFromRows(d.data) : null; };
  let totals = null;
  function computeLive() {
    totals = null;
    const fx = quotes.get(FX), b = base(), fp = fxPrev(), out = {};
    let total = 0, prevTotal = 0, lt = 0, n = 0;
    for (const h of holdingsLive()) {
      const q = quotes.get(h.id); if (!q || !fx) continue;
      const pc = prevSync(h.id), eurNow = q.usd / fx.price, eurPrev = pc && fp ? (pc * q.conv) / fp : null;
      const chg = eurPrev ? eurNow / eurPrev - 1 : null;
      const r = b && b.rows[h.ticker];
      const value = h.amount > 0 && r ? h.amount * (eurNow / (r.usd / r.fx)) : null;
      out[h.ticker] = { chg, value, chgEur: value != null && chg != null ? value - value / (1 + chg) : null, proxy: h.proxy, symbol: h.symbol, at: q.at };
      if (value != null) { total += value; n++; prevTotal += value / (1 + (chg || 0)); if (h.long_term) lt += value; }
    }
    // holdings without a live price count at the amount typed in, so the total stays complete
    for (const h of (S().holdings && S().holdings.data) || []) if (h.amount > 0 && !(out[h.ticker] && out[h.ticker].value != null)) { total += h.amount; prevTotal += h.amount; if (h.long_term) lt += h.amount; }
    if (n) totals = { total, today: total - prevTotal, todayPct: prevTotal ? total / prevTotal - 1 : null, lt, at: fx ? fx.at : Date.now() };
    for (const k of Object.keys(out)) if (out[k].value != null && totals) out[k].share = out[k].value / totals.total;
    SR.liveRows = out;
  }
  SR.liveFolio = (h) => (SR.liveRows && SR.liveRows[h.ticker]) || null;
  SR.zoneFolio = (h) => {
    const l = liveOf(h); if (!l) return null;
    const q = quotes.get(l.id), rows = storedRows(l.id);
    const price = q ? q.price : rows ? rows[rows.length - 1].close : null;
    return zoneOf(price, zoneLevels(zonesSync(l.id)));
  };
  SR.liveTotals = () => totals;
  SR.fmtPctLive = fmtPct; SR.fmtEurLive = fmtEur;
  ticks.add(() => { computeLive(); SRApp.renderDraw('folio'); SRApp.renderDraw('foliototal'); });
  function watchHoldings() {
    const H = holdingsLive();
    want('holdings', H.map((h) => h.id));
    for (const h of H) if (!storedRows(h.id)) prevClose(h.id).catch(() => {});
    (async () => { for (const h of H) if (!zonesSync(h.id)) { try { await zones(h.id); } catch (e) { /* next time */ } } SRApp.renderDraw('folio'); })();
  }
  SRApp.onChange(watchHoldings);

  // ---- the Price view of the Chart tab: the symbol the rest of the app points at ---------
  let chartView = null;
  dash.draw('quote', (box) => {
    const sym = dash.params().sym || 'SPY', id = SRApp.idOf(sym);
    if (!id) { box.textContent = '—'; return; }
    if (chartView && chartView.id === id && box.contains(chartView.node)) return;
    if (chartView) chartView.destroy();
    const M = dash.data('metrics'), m = M.status === 'ok' ? M.data.find((r) => r.symbol === sym) : null;
    const pick = el('select', 'av-pick'); pick.setAttribute('aria-label', 'Fund or stock');
    const names = M.status === 'ok' ? M.data.map((r) => [r.symbol, r.name]) : SRApp.DATASETS.filter((d) => d[0] !== 'EURUSD').map((d) => [d[0], '']);
    for (const [s, n] of names) { const o = pick.appendChild(el('option', '', n ? `${s} · ${n}` : s)); o.value = s; if (s === sym) o.selected = true; }
    pick.addEventListener('change', () => dash.setParams({ sym: pick.value }));
    chartView = assetView(box, { id, symbol: sym, name: m ? m.name : '', exchange: '' }, { picker: pick });
    chartView.node = box.firstChild;
  });

  // ---- wiring ---------------------------------------------------------------------------
  function init() {
    const btn = $('btn-search');
    if (btn) btn.addEventListener('click', open);
    const q = $('search-q');
    if (q) q.addEventListener('input', onType);
    const bk = $('search-back');
    if (bk) bk.addEventListener('click', back);
    watchHoldings();
  }
  window.SRLive = { open, back, isOpen: () => !!sheet() && !sheet().hidden, quotes, search, assetView, poll };
  init();
})();
