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
    const rows = list.map((c) => ({ t: Date.parse(c.fromDate), date: String(c.fromDate).slice(0, 10), open: c.open, high: c.high, low: c.low, close: c.close }))
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

  // ---- a clean price chart --------------------------------------------------------
  const RANGES = [
    { k: '1D', iv: 'FiveMinutes', n: 600, session: true },
    { k: '1W', iv: 'OneHour', n: 240, days: 7 },
    { k: '1M', iv: 'OneDay', n: 400, days: 31 },
    { k: '6M', iv: 'OneDay', n: 400, days: 183 },
    { k: '1Y', iv: 'OneDay', n: 400, days: 366 },
    { k: '5Y', iv: 'OneWeek', n: 270, days: 1830 },
  ];
  function slice(rows, R) {
    if (!rows.length) return rows;
    const end = rows[rows.length - 1].t;
    if (R.session) {
      // the latest session; with less than an hour of it so far, the one before as well
      const starts = [0];
      for (let i = 1; i < rows.length; i++) if (rows[i].t - rows[i - 1].t > 2 * 3600e3) starts.push(i);
      let s = starts[starts.length - 1];
      if (rows.length - s < 12 && starts.length > 1) s = starts[starts.length - 2];
      return rows.slice(Math.max(s, rows.findIndex((r) => r.t >= end - 36 * 3600e3)));
    }
    return rows.filter((r) => r.t >= end - R.days * 864e5);
  }
  function tickLabel(ms, R) {
    const d = new Date(ms);
    if (R.k === '1D') return hhmm(ms);
    if (R.k === '1W') return d.toLocaleDateString([], { weekday: 'short' });
    if (R.k === '5Y' || R.k === '1Y') return d.toLocaleDateString([], { month: 'short', year: '2-digit' });
    return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
  }
  let gid = 0;
  function drawChart(box, pts, R, ref, onScrub) {
    box.replaceChildren();
    const W = Math.max(260, box.clientWidth || 340), H = 210, top = 10, bottom = 22, right = 2;
    if (pts.length < 2) { box.appendChild(el('div', 'av-empty', 'No prices for this range yet.')); return; }
    const vals = pts.map((p) => p.close).concat(ref ? [ref] : []);
    let lo = d3.min(vals), hi = d3.max(vals); const pad = (hi - lo || hi * 0.01) * 0.08; lo -= pad; hi += pad;
    const x = d3.scaleLinear().domain([0, pts.length - 1]).range([0, W - right]);
    const y = d3.scaleLinear().domain([lo, hi]).range([H - bottom, top]);
    const base = ref != null ? ref : pts[0].close, up = pts[pts.length - 1].close >= base;
    const color = up ? 'var(--av-up)' : 'var(--av-down)', id = 'avg' + (++gid);
    const svg = d3.select(box).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('width', '100%').attr('height', H).attr('class', 'av-svg');
    const g = svg.append('defs').append('linearGradient').attr('id', id).attr('x1', 0).attr('x2', 0).attr('y1', 0).attr('y2', 1);
    g.append('stop').attr('offset', '0%').attr('stop-color', color).attr('stop-opacity', 0.22);
    g.append('stop').attr('offset', '100%').attr('stop-color', color).attr('stop-opacity', 0);
    // three quiet price levels
    for (const v of y.ticks(3)) {
      svg.append('line').attr('class', 'av-grid').attr('x1', 0).attr('x2', W).attr('y1', y(v)).attr('y2', y(v));
      svg.append('text').attr('class', 'av-axis').attr('x', W - 2).attr('y', y(v) - 3).attr('text-anchor', 'end').text(fmtP(v));
    }
    if (ref != null) svg.append('line').attr('class', 'av-ref').attr('x1', 0).attr('x2', W).attr('y1', y(ref)).attr('y2', y(ref));
    svg.append('path').attr('d', d3.area().x((p, i) => x(i)).y0(H - bottom).y1((p) => y(p.close)).curve(d3.curveMonotoneX)(pts)).attr('fill', `url(#${id})`);
    svg.append('path').attr('d', d3.line().x((p, i) => x(i)).y((p) => y(p.close)).curve(d3.curveMonotoneX)(pts)).attr('fill', 'none').attr('stroke', color).attr('stroke-width', 2);
    const last = pts.length - 1;
    svg.append('circle').attr('class', 'av-dot-live').attr('cx', x(last)).attr('cy', y(pts[last].close)).attr('r', 3.5).attr('fill', color);
    for (const i of [0, Math.round(last / 2), last]) {
      svg.append('text').attr('class', 'av-axis').attr('x', x(i)).attr('y', H - 6).attr('text-anchor', i === 0 ? 'start' : i === last ? 'end' : 'middle').text(tickLabel(pts[i].t, R));
    }
    // touch the chart to read any point
    const v = svg.append('line').attr('class', 'av-cross').attr('y1', top).attr('y2', H - bottom).style('display', 'none');
    const dot = svg.append('circle').attr('r', 4.5).attr('fill', color).attr('stroke', 'var(--color-panel, #fff)').attr('stroke-width', 2).style('display', 'none');
    const hit = svg.append('rect').attr('width', W).attr('height', H).attr('fill', 'transparent');
    const at = (ev) => { const [px] = d3.pointer(ev, svg.node()); return Math.max(0, Math.min(last, Math.round(x.invert(px)))); };
    const show = (ev) => { const i = at(ev); v.style('display', null).attr('x1', x(i)).attr('x2', x(i)); dot.style('display', null).attr('cx', x(i)).attr('cy', y(pts[i].close)); onScrub(pts[i], base); };
    const hide = () => { v.style('display', 'none'); dot.style('display', 'none'); onScrub(null, base); };
    hit.on('pointerdown', show).on('pointermove', (ev) => { if (ev.pointerType === 'mouse' || ev.buttons || ev.pressure) show(ev); }).on('pointerup pointerleave pointercancel', hide);
  }

  // ---- the asset page: live price, chart with ranges, a few facts ---------------------
  let vid = 0;
  function assetView(root, inst, opts) {
    opts = opts || {};
    const who = 'view' + (++vid);
    let range = RANGES.find((r) => r.k === (lsGet('sr.range', '1D'))) || RANGES[0], pts = [], prev = null, daily = [], scrub = false, dead = false;
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
    const sub = wrap.appendChild(el('div', 'av-sub', hasKeys() ? 'Connecting…' : 'Add your eToro keys in Settings for live prices.'));
    const box = wrap.appendChild(el('div', 'av-chart'));
    const chips = wrap.appendChild(el('div', 'av-ranges'));
    for (const R of RANGES) {
      const b = chips.appendChild(el('button', '', R.k)); b.type = 'button';
      b.addEventListener('click', () => { range = R; lsSet('sr.range', R.k); load(); });
    }
    const stats = wrap.appendChild(el('dl', 'av-stats'));
    const stat = (k) => { const d = stats.appendChild(el('div')); d.appendChild(el('dt', '', k)); return d.appendChild(el('dd', '', '—')); };
    const sPrev = stat('Previous close'), sDay = stat('Today'), sYear = stat('52 weeks'), s1y = stat('1 year');

    const live = () => quotes.get(inst.id);
    function header(p, base) {
      if (dead) return;
      const q = live();
      if (p) { // reading a point on the chart
        last.textContent = fmtP(p.close);
        const c = base ? p.close / base - 1 : null;
        chg.textContent = c == null ? '' : fmtPct(c); chg.className = 'av-chg ' + cls(c);
        sub.textContent = new Date(p.t).toLocaleString([], range.k === '1D' || range.k === '1W' ? { weekday: 'short', hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short', year: 'numeric' });
        return;
      }
      const price = q ? q.price : pts.length ? pts[pts.length - 1].close : null;
      last.textContent = fmtP(price);
      const c = price != null && prev ? price / prev - 1 : null;
      chg.textContent = c == null ? '' : `${fmtPct(c)}  ${price - prev >= 0 ? '+' : '−'}${fmtP(Math.abs(price - prev))} today`;
      chg.className = 'av-chg ' + cls(c);
      sub.textContent = q ? `Live · ${hhmm(q.at)}` : hasKeys() ? 'Waiting for a live price…' : 'Add your eToro keys in Settings for live prices.';
      sub.className = 'av-sub' + (q ? ' is-live' : '');
    }
    function redraw() {
      if (dead) return;
      for (const b of chips.children) b.setAttribute('aria-selected', String(b.textContent === range.k));
      let p = slice(pts, range);
      const q = live();
      if (q && range.session && p.length) { // the live price as the newest point of the day
        const end = p[p.length - 1];
        p = Date.now() - end.t < 5 * 60e3 ? p.slice(0, -1).concat([{ ...end, close: q.price }]) : p.concat([{ t: Math.max(Date.now(), end.t + 1), close: q.price }]);
      }
      drawChart(box, p, range, range.session ? prev : null, (pt, base) => { scrub = !!pt; header(pt, base); });
      if (!scrub) header(null);
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
    }
    async function load() {
      if (!hasKeys()) { header(null); return; }
      box.classList.add('is-loading');
      try {
        const [rows, d, pc] = await Promise.all([candles(inst.id, range.iv, range.n), candles(inst.id, 'OneDay', 400), prevClose(inst.id)]);
        if (dead) return;
        pts = rows; daily = d; prev = pc;
        redraw(); facts();
      } catch (e) {
        if (!dead) { box.replaceChildren(el('div', 'av-empty', 'eToro did not answer (' + (e.status || 'no connection') + ').')); }
      } finally { box.classList.remove('is-loading'); }
    }
    const tick = () => { if (dead || scrub) return; if (range.session) redraw(); else header(null); facts(); };
    ticks.add(tick);
    want(who, [inst.id]);
    load();
    let rt = null;
    const onResize = () => { clearTimeout(rt); rt = setTimeout(redraw, 150); };
    window.addEventListener('resize', onResize);
    return { id: inst.id, destroy() { dead = true; ticks.delete(tick); want(who, []); window.removeEventListener('resize', onResize); } };
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
  function back() { if (sheet().hidden) return false; if (!$('search-detail').hidden) closeDetail(); else close(); return true; }
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
    if (changed && Object.keys(b.rows).length) SRApp.saveConfig(Object.assign(cfg, { holdingsBase: b }));
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
  SR.liveTotals = () => totals;
  SR.fmtPctLive = fmtPct; SR.fmtEurLive = fmtEur;
  ticks.add(() => { computeLive(); SRApp.renderDraw('folio'); SRApp.renderDraw('foliototal'); });
  function watchHoldings() {
    const H = holdingsLive();
    want('holdings', H.map((h) => h.id));
    for (const h of H) if (!storedRows(h.id)) prevClose(h.id).catch(() => {});
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
