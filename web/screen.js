// The screener: one list of every asset (this device's own live analysis and the nightly scan), analysed with the same
// indicator code (ta.js) and ranked on how often each exact situation worked in the history test (tastats.js, "rank").
// Filters and sorting are kept on the device. Tap a row for the chart, the levels and the asset's own history test.
(function () {
  'use strict';
  if (typeof document === 'undefined') return;
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const pct = (x, d = 1) => { if (x == null || !isFinite(x)) return '—'; const s = Math.abs(x * 100).toFixed(d); return (+s === 0 ? '' : x > 0 ? '+' : '−') + s + '%'; };
  const fmt = (x) => (x >= 1000 ? d3.format(',.0f')(x) : x >= 10 ? d3.format('.2f')(x) : d3.format('.4~g')(x));
  // the wider picture: indices, the dollar, Treasuries, metals, energy, crypto (eToro instrument ids)
  const BOARD = [['SPX500', 27, 'S&P 500'], ['NSDQ100', 28, 'Nasdaq-100'], ['GER40', 32, 'Germany 40'], ['EUSTX50', 43, 'Euro Stoxx 50'], ['JPN225', 36, 'Japan 225'], ['HKG50', 38, 'Hong Kong 50'], ['CHINA50', 253, 'China A50'],
    ['USDOLLAR', 25, 'US dollar index'], ['IEF', 3101, '10-year Treasuries (fall when yields rise)'], ['GOLD', 18, 'Gold'], ['SILVER', 19, 'Silver'], ['OIL', 17, 'Oil'], ['NATGAS', 22, 'Natural gas'], ['BTC', 100000, 'Bitcoin'], ['ETH', 100001, 'Ether']];
  const TILES = [['US sectors', [['XLK', 'Tech', 'Technology'], ['XLF', 'Financials', 'Financials'], ['XLE', 'Energy', 'Energy'], ['XLV', 'Health', 'Health care'], ['XLI', 'Industrials', 'Industrials'], ['XLY', 'Cons. disc.', 'Consumer discretionary'],
    ['XLP', 'Staples', 'Consumer staples'], ['XLU', 'Utilities', 'Utilities'], ['XLB', 'Materials', 'Materials'], ['XLRE', 'Real estate', 'Real estate'], ['XLC', 'Comms', 'Communication services']]],
  ['Industries', [['SMH', 'Chips', 'Semiconductors'], ['IGV', 'Software', 'Software'], ['XBI', 'Biotech', 'Biotech'], ['KRE', 'Reg. banks', 'Regional banks'], ['ITA', 'Defense', 'Aerospace & defense'], ['GDX', 'Gold miners', 'Gold miners'],
    ['SIL', 'Silver miners', 'Silver miners'], ['COPX', 'Copper', 'Copper miners'], ['URA', 'Uranium', 'Uranium']]]];
  const SHORT = { tri_brk_up: 'Triangle breakout', wedge_fall_brk: 'Falling-wedge breakout', tl_brk_up: 'Trendline break', div_bull: 'RSI divergence', fib_sup: 'Fibonacci pullback', rsi30: 'RSI below 30', rsi70: 'RSI above 70', lo250: 'New 1-year low', neg_bear: 'Up candle negated', tri_brk_dn: 'Triangle breakdown', wedge_rise_brk: 'Rising-wedge breakdown' };
  const stats = () => (window.SR_TASTATS || {}).by || {};
  const cache = new Map(), extra = new Map();
  let busy = false;
  function universe() {
    const U = [], seen = new Set(), H = dash.data('holdings'), M = dash.data('metrics');
    const names = new Map((M.status === 'ok' ? M.data : []).map((m) => [m.symbol, m.name])), ok = (s) => { const d = SRApp._store[s]; return d && d.status === 'ok' && d.data && d.data.length ? d.data : null; };
    for (const h of (H.status === 'ok' ? H.data : [])) if (ok(h.tracks) && !seen.has(h.tracks)) { seen.add(h.tracks); U.push({ sym: h.tracks, id: SRApp.idOf(h.tracks), name: h.ticker === h.tracks ? h.name || names.get(h.tracks) || '' : 'your ' + h.ticker, group: 'Yours', rows: ok(h.tracks) }); }
    for (const [sym, id, name] of BOARD) if (!seen.has(sym)) { seen.add(sym); U.push({ sym, id, name, group: 'World', rows: ok(sym) || extra.get(sym) || null }); }
    for (const [sym, id] of SRApp.DATASETS) if (!seen.has(sym) && sym !== 'EURUSD' && ok(sym)) { seen.add(sym); U.push({ sym, id, name: names.get(sym) || '', group: 'Funds', rows: ok(sym) }); }
    return U;
  }
  // the world board's daily candles are kept 2 hours on the device (the live price still updates the last candle): reopening the app does not spend 15 of eToro's 120 reads a minute
  const WB = 'sr.wb2', TTL = 2 * 3600e3;
  const failAt = new Map();
  function keep(sym) { try { const all = JSON.parse(localStorage.getItem(WB) || '{}'); all[sym] = { at: Date.now(), r: extra.get(sym).map((x) => [x.date, x.open, x.high, x.low, x.close]) }; localStorage.setItem(WB, JSON.stringify(all)); } catch (e) { /* storage full: asked again next time */ } }
  try { const all = JSON.parse(localStorage.getItem(WB) || '{}'); for (const [sym, v] of Object.entries(all)) if (v && Date.now() - v.at < TTL && v.r && v.r.length) extra.set(sym, v.r.map(([date, open, high, low, close]) => ({ date, open, high, low, close }))); } catch (e) { /* no cache */ }
  async function load() {
    if (busy || !window.SRLive || !window.SRLive.candles) return;
    busy = true; let k = 0;
    for (const [sym, id] of BOARD) {
      if (extra.has(sym) || (SRApp._store[sym] && SRApp._store[sym].status === 'ok') || Date.now() - (failAt.get(sym) || 0) < 60000) continue;
      try { const r = await window.SRLive.candles(id, 'OneDay', 400, 0); extra.set(sym, r.map(({ date, open, high, low, close }) => ({ date, open, high, low, close }))); if (r.length) keep(sym); } catch (e) { failAt.set(sym, Date.now()); }   // asked again a minute later, not given up for the session
      if (++k % 5 === 0) { SRApp.renderDraw('screener'); SRApp.renderDraw('today'); }
    }
    busy = false; if (k) { SRApp.renderDraw('screener'); SRApp.renderDraw('today'); }
  }
  // last night's wide scan (a job in the private sync repository writes scan.json; see scan.js there)
  let wide = null, wideAt = 0, wideBusy = false;
  let packSet = new Set();
  // The ranking can be several MB (thousands of assets). It is kept on the device, shown at once when the app opens, and read
  // again from GitHub only when the small file scanmeta.json says a newer one exists.
  const SDB = {
    open() { return new Promise((res) => { if (typeof indexedDB === 'undefined') return res(null); const giveUp = setTimeout(() => res(null), 1500); try { const r = indexedDB.open('sr-scan', 1); r.onupgradeneeded = () => r.result.createObjectStore('s'); r.onsuccess = () => { clearTimeout(giveUp); res(r.result); }; r.onerror = r.onblocked = () => { clearTimeout(giveUp); res(null); }; } catch (e) { clearTimeout(giveUp); res(null); } }); },
    async get() { const db = await this.open(); if (!db) return null; return new Promise((res) => { try { const q = db.transaction('s').objectStore('s').get('scan'); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); } catch (e) { res(null); } }); },
    async set(v) { const db = await this.open(); if (!db) return; try { db.transaction('s', 'readwrite').objectStore('s').put(v, 'scan'); } catch (e) { /* not kept: read again next time */ } },
  };
  const useWide = (j) => { wide = j; packSet = new Set(j.packs || []); allMemo = null; };
  let warm = SDB.get().then((j) => { if (j && j.rows && !wide) { useWide(j); SRApp.renderDraw('screener'); SRApp.renderDraw('today'); } }).catch(() => {});
  async function loadWide(force) {
    if (wideBusy || !window.SRSync || !window.SRSync.getFile || (!force && Date.now() - wideAt < 20 * 60e3)) return;
    wideBusy = true;
    try {
      await warm;
      let need = true;
      if (wide && !force) { const m = await window.SRSync.getFile('scanmeta.json'); if (m && m.made && m.made === wide.made) need = false; }
      if (need) { const j = await window.SRSync.getFile('scan.json'); if (j && j.rows) { useWide(j); SDB.set(j); } }
    } catch (e) { /* keeps the last one */ }
    wideAt = Date.now(); wideBusy = false; SRApp.renderDraw('screener'); SRApp.renderDraw('today');
  }
  // ---- the practice portfolio (eToro demo account) and its daily review: two small files from the private folder ----
  let prac = null, review = null, audit = null, pracAt = 0, pracBusy = false;
  async function loadPractice(force) {
    if (pracBusy || !window.SRSync || !window.SRSync.getFile || (!force && Date.now() - pracAt < 60e3)) return;   // the VM's record: asked again every minute, and at once when eToro shows something it does not explain
    pracBusy = true;
    try { const j = await window.SRSync.getFile('practice.json'); if (j && j.made) prac = j; const v = await window.SRSync.getFile('review.json'); if (v && v.entries) review = v; const a = await window.SRSync.getFile('audit.json'); if (a && a.made) audit = a; } catch (e) { /* keeps the last one */ }
    const was = pracAt; pracAt = Date.now(); pracBusy = false; if (!was) SRApp.renderDraw('today');   // later readings are picked up by the card's own repaint
  }
  // Is the VM silent? Its program writes its record at least every half hour from Monday to Friday (a look every 5 minutes), and once
  // a night at the weekend. Returns the minutes of silence when that is longer than it should be, else 0. Nothing is said while this
  // device's own copy of the record is old (the fault would then be the reading, not the VM).
  function vmSilent() {
    if (!prac || !prac.made || !pracAt || Date.now() - pracAt > 4 * 60e3) return 0;
    const age = (Date.now() - Date.parse(prac.made)) / 60e3, d = new Date(), wd = d.getUTCDay(), h = d.getUTCHours() + d.getUTCMinutes() / 60;
    const week = (wd >= 2 && wd <= 4) || (wd === 1 && h >= 1) || (wd === 5 && h < 21);   // the hours in which the 5-minute looks run, with a margin at both ends
    return age > (week ? 50 : 31 * 60) ? Math.round(age) : 0;
  }
  // ---- the demo account, live from eToro itself: positions with their running result, waiting orders, cash, closed trades ----
  // The VM's record (practice.json) only adds what eToro does not know: which rule opened a trade and the stop and target it planned.
  let demo = null, demoAt = 0, demoErr = null, demoBusy = false, demoTimer = null, hist = null, histAt = 0, lastKey = ''; const painters = new Set();
  // the account's value over time, as this device has seen it (one point every 10 minutes, kept for 90 days)
  let curve = []; try { curve = JSON.parse(localStorage.getItem('sr.demoCurve') || '[]'); } catch (e) { curve = []; }
  const point = (v) => { const now = Date.now(), last = curve[curve.length - 1]; if (!(v > 0)) return; const r = Math.round(v * 100) / 100; if (last && Math.floor(now / 60e3) === Math.floor(last[0] / 60e3)) { last[2] = Math.max(last[2] || last[1], r); last[3] = Math.min(last[3] || last[1], r); last[1] = r; return; } curve.push([now, r, r, r]); curve = curve.filter((p) => now - p[0] < 90 * 864e5).slice(-8000); try { localStorage.setItem('sr.demoCurve', JSON.stringify(curve)); } catch (e) { /* storage full or closed */ } };
  async function demoRead() {
    if (demoBusy || document.hidden || !window.SRApp || !SRApp.etoroGet) return;
    demoBusy = true;
    try {
      const r = await SRApp.etoroGet('/api/v1/trading/info/demo/pnl', 1.5);
      if (r && r.status === 200) { const j = JSON.parse(r.body); if (j && j.clientPortfolio) { demo = j.clientPortfolio; demoAt = Date.now(); demoErr = null;
        const key = (demo.positions || []).map((o) => o.positionID).sort().join(',') + '|' + (demo.ordersForOpen || []).map((o) => o.orderID).sort().join(',');
        if (key !== lastKey) { if (lastKey) { histAt = 0; pracAt = Math.min(pracAt, 1); loadPractice(true); } lastKey = key; }   // something opened or closed: the closed trades and the VM's record are read again now
        point((+demo.credit || 0) + (demo.positions || []).reduce((x, o) => x + (+o.amount || 0), 0) + (+demo.unrealizedPnL || 0)); } }
      else demoErr = r ? (r.reason === 'no keys' ? 'no keys' : r.status) : 0;
      if (!demoErr && Date.now() - histAt > 2 * 60e3) {            // closed trades: every two minutes, and at once when a position disappears
        const since = new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10), h = await SRApp.etoroGet(`/api/v1/trading/info/trade/demo/history?minDate=${since}&pageSize=200`, 1);
        if (h && h.status === 200) { const a = JSON.parse(h.body); if (Array.isArray(a)) { hist = a; histAt = Date.now(); } }
      }
    } catch (e) { demoErr = 'unreadable'; }
    demoBusy = false;
    for (const fn of [...painters]) { let keep = false; try { keep = fn(); } catch (e) { if (window.console) console.error(e); } if (!keep) painters.delete(fn); }
    if (!painters.size && demoTimer) { clearInterval(demoTimer); demoTimer = null; }
    loadPractice();
  }
  // a card on screen asks to be repainted with every reading; the readings stop when no card is left
  function demoWatch(fn) { painters.add(fn); if (!demoTimer) demoTimer = setInterval(demoRead, 5000); if (Date.now() - demoAt > 4000) demoRead(); }
  // ---- the ranking: the buy model's score of the last candle (ta.js mscore; its record is in tastats.js, "model") ----
  const MDL = () => (window.SRTA && window.SRTA.model && window.SRTA.model()) || null, MST = () => ((window.SR_TASTATS || {}).model || {});
  // one list for everything: this device's own analysis (yours, the funds, the world board: live) and the nightly scan
  let allMemo = null;
  function all() {
    if (allMemo && Date.now() - allMemo.at < 1200) return allMemo.rows;
    const M = new Map(), out = [], seen = new Set(), Q = window.SRLive ? window.SRLive.quotes : new Map(), today = new Date().toISOString().slice(0, 10), md = MDL(), bar = md ? md.buy : 2, bar2 = md ? md.strong : 2;
    if (wide) for (const r of wide.rows) M.set(r.id, r);
    const grade = (o) => { o.buy = o.ms != null && o.ms >= bar; o.strong = o.ms != null && o.ms >= bar2; return o; };
    for (const r of rows()) {
      if (!r.A) continue; const m = M.get(r.id) || {}, A = r.A; seen.add(r.id);
      out.push(grade({ sym: r.sym, id: r.id, name: r.name, group: r.group, mine: r.group === 'Yours', cls: m.cls || (r.group === 'Funds' ? 'ETF' : null), sec: m.sec || null, cap: m.cap || null, sales: m.sales || null, pe: m.pe || null, pop: m.pop || null, px: r.px, chg: r.chg, c5: A.chg5, c20: A.chg20, rsi: A.rsi,
        sup: r.sup, res: r.res, rr: A.rr, ms: r.ms, stop: A.atr > 0 ? A.price - 2 * A.atr : null, target: A.atr > 0 ? A.price + 2 * A.atr : null, last: A.date, live: true }));
    }
    if (wide) for (const r of wide.rows) {
      if (seen.has(r.id)) continue;
      const q = Q.get(r.id), px = q && q.price > 0 ? q.price : r.px, chg = q && q.price > 0 && r.px ? (r.d < today ? px / r.px - 1 : (1 + r.c1) * px / r.px - 1) : r.c1;
      out.push(grade({ sym: r.s, id: r.id, name: r.n, group: r.g, mine: false, cls: r.cls || null, sec: r.sec || null, cap: r.cap || null, sales: r.sales || null, pe: r.pe || null, pop: r.pop || null, px, chg, c5: r.c5, c20: r.c20, rsi: r.rsi,
        sup: r.sup ? r.sup.d : null, res: r.res ? r.res.d : null, rr: r.rr, ms: r.ms == null ? null : r.ms, stop: r.atr > 0 ? r.px - 2 * r.atr : null, target: r.atr > 0 ? r.px + 2 * r.atr : null, last: r.d, live: !!q, scanned: true }));
    }
    allMemo = { at: Date.now(), rows: out };
    return out;
  }
  const tier = (r) => (r.buy ? 0 : 1);
  // 1. the assets with a buy signal now, highest score first; 2. the others, by score; an asset without a year of candles has no score and comes last
  const rankOrder = (a, b) => tier(a) - tier(b) || (a.ms == null) - (b.ms == null) || (b.ms || 0) - (a.ms || 0) || (b.sup == null ? -9 : b.sup) - (a.sup == null ? -9 : a.sup);
  // the home page's shortlist: the highest scores among the buy signals
  // the home card shows assets one can really trade: shares of companies worth at least $2 billion (the tested edge is smaller on tiny ones), any fund, index, commodity, currency or crypto
  const liquid = (r) => !r.scanned || r.cls !== 'Stocks' || r.cap >= 2e9;
  function top(n) { return all().filter((r) => r.buy && liquid(r)).sort(rankOrder).slice(0, n); }
  function rows() {
    const S = stats(), out = [], today = new Date().toISOString().slice(0, 10);
    for (const u of universe()) {
      if (!u.rows || u.rows.length < 260) { if (u.group === 'World') out.push({ ...u, A: null }); continue; }
      const n = u.rows.length, key = n + '|' + u.rows[n - 1].date; let c = cache.get(u.sym);
      if (!c || c.key !== key) { c = { key, A: window.SRTA.analyze(u.rows), ms: null }; if (window.SRTA.mscore && n >= 262) { const p = window.SRTA.mscore(u.rows); c.ms = isFinite(p[n - 1]) ? p[n - 1] : null; } cache.set(u.sym, c); }
      const A = c.A; if (!A) continue;
      const q = window.SRLive && window.SRLive.quotes.get(u.id), px = q ? q.price : A.price, prev = u.rows[n - 1].date >= today && n > 1 ? u.rows[n - 2].close : u.rows[n - 1].close;
      const sig = A.signals.filter((x) => x.ago <= 3 && S[x.id] && S[x.id].ok);
      const buy = sig.filter((x) => x.side > 0).sort((a, b) => S[b.id].edge - S[a.id].edge)[0] || null, sell = sig.filter((x) => x.side < 0)[0] || null;
      out.push({ ...u, A, ms: c.ms, px, chg: px / prev - 1, buy, sell, sup: A.sup ? A.sup.p / px - 1 : null, res: A.res ? A.res.p / px - 1 : null, score: buy ? S[buy.id].edge : 0 });
    }
    return out;
  }
  // On a wide window (the Mac) the list stays on the left and the chosen asset is analysed beside it; on a phone it opens as a page.
  let left = null, detail = null, detView = null, selId = null;
  const isMac = () => window.innerWidth >= 1100;
  function select(r) {
    selId = r.id; if (detView) detView.destroy();
    detView = window.SRLive.assetView(detail, { id: r.id, symbol: r.sym, name: r.name || '', exchange: '' }, { embed: true });
    detail.scrollTop = 0;
    for (const x of document.querySelectorAll('#screener [data-id]')) x.classList.toggle('is-sel', +x.dataset.id === r.id);
  }
  const open = (r) => {
    if (!r.id || !window.SRLive) return;
    if (isMac() && detail && detail.offsetParent !== null && window.SRLive.assetView) select(r);   // only when the screener itself is on screen
    else if (window.SRLive.openAsset) window.SRLive.openAsset({ id: r.id, symbol: r.sym, name: r.name, exchange: '' });
  };
  const big = (x) => '$' + (x >= 1e12 ? (x / 1e12).toFixed(x >= 1e13 ? 0 : 1) + 'T' : x >= 1e9 ? (x / 1e9).toFixed(x >= 1e11 ? 0 : 1) + 'B' : Math.max(1, Math.round(x / 1e6)) + 'M');
  const p1 = (x) => (x * 100).toFixed(1) + '%', sc100 = (x) => Math.round(x * 100);
  // filters and sorting, kept on the device
  const FK = 'sr.scf', F0 = { sort: 'rank', cls: '', sec: '', size: '', sales: '', rsi: '', sig: '' }, F = { ...F0 };
  try { const j = JSON.parse(localStorage.getItem(FK) || '{}'); for (const k of Object.keys(F0)) if (typeof j[k] === 'string') F[k] = j[k]; } catch (e) { /* defaults */ }
  const saveF = () => { try { localStorage.setItem(FK, JSON.stringify(F)); } catch (e) { /* not kept */ } };
  let shown = 60, howOpen = false, filtOpen = false, selAt = 0;
  const SIZE = { mega: ['Over $200B', 200e9, Infinity], large: ['$10B to $200B', 10e9, 200e9], mid: ['$2B to $10B', 2e9, 10e9], small: ['Under $2B', 0, 2e9] };
  const SALES = { big: ['Revenue over $50B', 50e9, Infinity], mid: ['Revenue $5B to $50B', 5e9, 50e9], small: ['Revenue under $5B', 0, 5e9] };
  const RSIB = { lo: ['RSI below 30', 0, 30], mlo: ['RSI 30 to 50', 30, 50], mhi: ['RSI 50 to 70', 50, 70], hi: ['RSI above 70', 70, 101] };
  const SIG = { buy: 'Buy signal now', strong: 'Strong buy signal now' };
  const inB = (v, B) => v != null && v >= B[1] && v < B[2];
  function pass(r) {
    if (F.cls === '@mine' ? !r.mine : F.cls && r.cls !== F.cls) return false;
    if (F.sec && !(r.cls === 'Stocks' && r.sec === F.sec)) return false;
    if (F.size && !inB(r.cap, SIZE[F.size])) return false;
    if (F.sales && !inB(r.sales, SALES[F.sales])) return false;
    if (F.rsi && !inB(r.rsi, RSIB[F.rsi])) return false;
    if (F.sig === 'buy' && !r.buy) return false;
    if (F.sig === 'strong' && !r.strong) return false;
    return true;
  }
  const by = (f, dir) => (a, b) => { const x = f(a), y = f(b), nx = x == null || !isFinite(x), ny = y == null || !isFinite(y); return nx - ny || (nx ? 0 : dir * (x - y)); };   // assets without the figure go last
  const SORTS = { rank: ['our ranking (buy score)', rankOrder], cap: ['market value, largest first', by((r) => r.cap, -1)], pop: ['most followed on eToro first', by((r) => r.pop, 1)], sales: ['revenue, largest first', by((r) => r.sales, -1)], rsiLo: ['RSI, lowest first', by((r) => r.rsi, 1)], rsiHi: ['RSI, highest first', by((r) => r.rsi, -1)],
    day: ['today, best first', by((r) => r.chg, -1)], dayLo: ['today, worst first', by((r) => r.chg, 1)], c5: ['5 days, best first', by((r) => r.c5, -1)], c20: ['1 month, best first', by((r) => r.c20, -1)], sup: ['nearest support', by((r) => r.sup, -1)], res: ['nearest resistance', by((r) => r.res, 1)],
    rr: ['reward to risk, highest first', by((r) => r.rr, -1)], pe: ['P/E, lowest first', by((r) => (r.pe > 0 ? r.pe : null), 1)] };
  const oddsText = (r) => { const st = MST()['1D']; if (!st) return ''; const b = r.strong && st.strong ? st.strong : st.buy; return `Signals like this worked ${p1(b.win)} of ${b.n.toLocaleString('en-US')} cases the model had never seen; any day, ${p1(b.base)}.`; };
  function howBox() {
    const S = MST(), md = MDL(), d = el('details', 'sc-how'); d.open = howOpen; d.addEventListener('toggle', () => { howOpen = d.open; });
    d.appendChild(el('summary', '', 'How the ranking works'));
    const P = (t) => d.appendChild(el('p', '', t)), n = (x) => (x || 0).toLocaleString('en-US'), D1 = S['1D'];
    if (!D1 || !md) { P('The model is not loaded yet.'); return d; }
    P(`1. Every asset gets one score from 0 to 100 on its latest daily candle. The score comes from a model that reads 29 measures of the chart, all in units of the asset's own volatility: how far the price is from its 20, 50 and 200-day averages and from its 1-year high and low, its moves over 1 day to 1 year, RSI, and the shape of the last candle.`);
    P(`2. A buy signal is a score of ${sc100(md.buy)} or more (${sc100(md.strong)} for a strong one): the best 5% and 2% of the scores of the past. The list shows these first, highest score first, then the other assets by score.`);
    P(`3. The record, on cases the model had never seen (it was fitted on the years before each 3-year block since 1999, then judged on the block; ${n(D1.bars)} days of ${D1.assets} assets). "Worked" = up 2 ATR before down 2 ATR within 20 candles, buying at the next open.`);
    const t = d.appendChild(el('div', 'sc-howt')); t.appendChild(el('b', '', 'Candles')); t.appendChild(el('b', 'sc-n', 'Buy signals')); t.appendChild(el('b', 'sc-n', 'Any candle'));
    for (const k of ['1D', '4H', '1H', '30m', '1W']) { const x = S[k]; if (!x || !x.buy) continue; t.appendChild(el('span', '', k + (x.ok ? '' : ' (not reliable)'))); t.appendChild(el('span', 'sc-n', p1(x.buy.win))); t.appendChild(el('span', 'sc-n', p1(x.buy.base))); }
    P('On 4-hour and 1-hour candles: the daily model fitted up to October 2023, judged on candles from December 2023, including 40 assets it had never seen. On 30-minute and weekly candles its edge was not steady: signals there are drawn hollow.' + (S['1Dx'] && S['1Dx'].buy ? ` On daily candles of 40 assets it had never seen, from 2013 (model fitted to 2012): ${p1(S['1Dx'].buy.win)} against ${p1(S['1Dx'].buy.base)}.` : ''));
    if (S.wide && S.wide.all) {
      P(`Checked on ${S.wide.assets} other assets (large, medium and small companies of every sector, non-US shares, funds, crypto): the model fitted on the first 79 assets up to 2012, judged from 2013. Buy signals worked ${p1(S.wide.all.win)} of ${n(S.wide.all.n)} times against ${p1(S.wide.all.base)} on any day. By kind:`);
      const t2 = d.appendChild(el('div', 'sc-howt')); t2.appendChild(el('b', '', 'Kind of asset')); t2.appendChild(el('b', 'sc-n', 'Buy signals')); t2.appendChild(el('b', 'sc-n', 'Any day'));
      for (const [k, x] of Object.entries(S.wide.tiers)) if (x) { t2.appendChild(el('span', '', k === 'ETF' ? 'Funds' : k)); t2.appendChild(el('span', 'sc-n', p1(x.win))); t2.appendChild(el('span', 'sc-n', p1(x.base))); }
      const weak = Object.entries(S.wide.sectors || {}).filter(([, x]) => x.win - x.base < 0.01).map(([k]) => k.toLowerCase());
      P(`The edge is smaller on medium-sized companies${weak.length ? ', and close to nothing in ' + weak.join(', ') : ''}. Fitting the model again on all these assets made it worse on the same test (${p1(S.wide.refit.onAll.win)} against ${p1(S.wide.refit.onAll.base)}, instead of ${p1(S.wide.refit.on79.win)} against ${p1(S.wide.refit.on79.base)}), so it stays as it is.`);
    }
    if (S.drivers) P(`4. What the model mostly buys: a pullback inside a longer rise. The typical signal is just under its 50-day average, above a rising 200-day average, RSI in the mid-40s. Buying at a 1-year high did worse than buying on any day (${p1(S.drivers.list[4].win)} against ${p1(S.drivers.any)}), and so did buying after a steep rise of the 200-day average (${p1(S.drivers.list[5].win)}).`);
    P('5. What did not help when tested the same way, and is not used: sell signals (the model\'s best sell scores worked 47.3% against 47.4% on any day), the market\'s own state (from 14 points worse in 2008-2010 to 16 better in 2011-2013), an asset\'s own past record (no link between before and after 2015), counting how many signals agree, and reward to risk. The sell side of a buy is its stop, its target or 20 candles.');
    P('The edge is small: about 57% against 54%. Four signals in ten fail, which is why each comes with a stop. Analysis, not advice.');
    return d;
  }
  function rowEl(r) {
    const b = el('button', 'sc-row' + (r.id === selId ? ' is-sel' : '')); b.type = 'button'; if (r.id) b.dataset.id = r.id; b.addEventListener('click', () => open(r));
    const a = b.appendChild(el('span', 'sc-a')); a.appendChild(el('b', '', r.sym)); a.appendChild(el('span', 'g-muted', r.name || r.group || ''));
    const v = b.appendChild(el('span', 'sc-v')); v.appendChild(el('b', '', fmt(r.px))); v.appendChild(el('span', 'g-row-c ' + (r.chg > 0.0005 ? 'up' : r.chg < -0.0005 ? 'down' : ''), pct(r.chg)));
    const m = [r.mine ? 'Yours' : null, r.cls === 'Stocks' ? r.sec || 'Stock' : r.cls || (r.mine ? null : r.group), r.cap ? big(r.cap) : null, r.sales ? 'revenue ' + big(r.sales) : null, r.pe > 0 ? 'P/E ' + (r.pe >= 100 ? Math.round(r.pe) : r.pe.toFixed(1)) : null].filter(Boolean);
    if (m.length) b.appendChild(el('span', 'sc-m', m.join(' · ')));
    const y = b.appendChild(el('span', 'sc-y'));
    if (r.buy) y.appendChild(el('span', 'g-pill g-buy', (r.strong ? 'STRONG BUY' : 'BUY') + ' · score ' + sc100(r.ms)));
    y.appendChild(el('span', 'sc-t', `${r.buy || r.ms == null ? '' : 'score ' + sc100(r.ms) + ' · '}RSI ${Math.round(r.rsi)} · support ${pct(r.sup)} · resistance ${pct(r.res)}`));
    if (r.buy) b.appendChild(el('span', 'sc-rec', oddsText(r) + (r.stop && r.target ? ` Stop ${fmt(r.stop)} · target ${fmt(r.target)}.` : '')));
    return b;
  }
  dash.draw('screener', (outer) => {
    if (!window.SRTA) { outer.replaceChildren(); return; }
    const ae = document.activeElement; if (ae && ae.classList && ae.classList.contains('sc-sel') && outer.contains(ae) && Date.now() - selAt < 30000) return;   // a filter is being chosen: the list is not rebuilt under the finger
    const two = isMac(); let box = outer;
    outer.classList.toggle('sc-two', two);
    if (two) {   // the detail panel is kept across the 15-second refresh of the list
      if (!left) { left = el('div', 'sc-left'); detail = el('div', 'sc-detail'); detail.appendChild(el('p', 'g-muted', 'Choose an asset on the left: its chart and analysis open here.')); }
      if (left.parentNode !== outer) outer.replaceChildren(left, detail);
      left.replaceChildren(); box = left;
    } else { if (detView) detView.destroy(); detView = null; selId = null; left = null; detail = null; outer.replaceChildren(); }
    load(); loadWide();
    const R = rows(), ALL = all();
    box.appendChild(el('h2', 'g-h2', 'Screener'));
    const sb = box.appendChild(el('button', 'sc-search', 'Search any eToro asset for its full analysis')); sb.type = 'button';
    sb.addEventListener('click', () => { const x = document.getElementById('btn-search'); if (x) x.click(); });
    const rec = wide ? wide.record || {} : {}, U = wide && wide.universe ? wide.universe : null;
    box.appendChild(el('p', 'g-muted g-sub', `${ALL.length} assets analysed with the same rules. ` + (wide ? `${wide.scanned} come from the scan of ${String(wide.made).slice(0, 10)}: the largest of every sector and asset class first${U && U.next > U.limit ? `, ${U.next - U.limit} more each night` : ''}. Ideas graded so far: ${rec.worked || 0} worked, ${rec.failed || 0} failed, ${rec.open || 0} open.` : 'The wide scan has not been read yet.')));
    // the day's change as coloured tiles: the world first, then the eleven US sectors and the industries the app follows (the same funds as the ranking)
    // before an asset's market has traded today its last session's change is shown, with that day's name, in paler colours (as eToro does), not 0.0%
    const UN = new Map(universe().map((u) => [u.sym, u]));
    const tile = (map, r, short) => {
      const t = map.appendChild(el('button', 'sc-tile' + (r.id === selId ? ' is-sel' : ''))); t.type = 'button'; t.title = r.name; if (r.id) t.dataset.id = r.id; t.addEventListener('click', () => open(r));
      const u = UN.get(r.sym), d = SRApp._store[r.sym], m = dayMove((u && u.rows) || r.rows || (d && Array.isArray(d.data) ? d.data : null), r.id);
      t.appendChild(el('b', '', r.sym)); const v = t.appendChild(el('span', '', m ? pct(m.chg) : '…')); if (m && m.day) { v.appendChild(el('i', 'sc-day', ' ' + m.day)); t.title = `${r.name || r.sym}: ${m.day}'s change. Its market has not traded yet today.`; t.classList.add('is-last'); }
      if (short) t.appendChild(el('small', '', short));
      if (m) t.style.background = `color-mix(in srgb, var(--color-${m.chg >= 0 ? 'ok' : 'bad'}) ${Math.round(Math.min(55, Math.abs(m.chg) * 1800) * (m.day ? 0.55 : 1))}%, var(--color-panel))`;
    };
    const map = box.appendChild(el('div', 'sc-map'));
    for (const r of R.filter((x) => x.group === 'World')) tile(map, r);
    const bySym = new Map(R.map((r) => [r.sym, r]));
    for (const [head, list] of TILES) {
      box.appendChild(el('div', 'sc-maph', head)); const m2 = box.appendChild(el('div', 'sc-map sc-map2'));
      for (const [sym, short, name] of list) tile(m2, bySym.get(sym) || { sym, id: SRApp.idOf(sym), name, A: null }, short);
    }
    box.appendChild(howBox());
    // filters: every choice is one tap; the list below answers at once
    const nOn = Object.keys(F0).filter((k) => k !== 'sort' && F[k]).length;
    const bar = box.appendChild(el('div', 'sc-bar')), fb = el('div', 'sc-filters');
    const sel = (key, first, opts, cls) => {
      const s = (first ? fb : bar).appendChild(el('select', 'sc-sel' + (cls ? ' ' + cls : ''))); s.setAttribute('aria-label', first || 'Sort'); if (first) s.appendChild(new Option(first, ''));
      for (const [val, lab] of opts) s.appendChild(new Option(lab, val));
      s.value = F[key]; if (s.value !== F[key]) { F[key] = first ? '' : opts[0][0]; s.value = F[key]; }
      s.classList.toggle('is-on', !!first && !!F[key]); s.addEventListener('focus', () => { selAt = Date.now(); });
      s.addEventListener('change', () => { F[key] = s.value; if (key === 'cls' && F.cls && F.cls !== 'Stocks') F.sec = ''; shown = 60; saveF(); s.blur(); SRApp.renderDraw('screener'); });
      return s;
    };
    const uniq = (f) => [...new Set(ALL.map(f).filter(Boolean))].sort();
    sel('sort', '', Object.entries(SORTS).map(([k, x]) => [k, 'Sort: ' + x[0]]), 'sc-sortsel');
    const ft = bar.appendChild(el('button', 'sc-ftog' + (nOn ? ' is-on' : ''), nOn ? `Filters · ${nOn}` : 'Filters')); ft.type = 'button'; ft.setAttribute('aria-expanded', String(filtOpen));
    ft.addEventListener('click', () => { filtOpen = !filtOpen; SRApp.renderDraw('screener'); });
    if (filtOpen) box.appendChild(fb);
    sel('sig', 'All signals', Object.entries(SIG));
    sel('cls', 'All asset classes', [['@mine', 'Yours'], ...uniq((r) => r.cls).map((c) => [c, c])]);
    if (!F.cls || F.cls === 'Stocks' || F.cls === '@mine') sel('sec', 'All sectors', uniq((r) => (r.cls === 'Stocks' ? r.sec : null)).map((c) => [c, c]));
    sel('size', 'Any market value', Object.entries(SIZE).map(([k, x]) => [k, x[0]]));
    sel('sales', 'Any revenue', Object.entries(SALES).map(([k, x]) => [k, x[0]]));
    sel('rsi', 'Any RSI', Object.entries(RSIB).map(([k, x]) => [k, x[0]]));
    const L = ALL.filter(pass).sort((SORTS[F.sort] || SORTS.rank)[1]), active = nOn > 0;
    const cnt = box.appendChild(el('div', 'sc-count')); cnt.appendChild(el('span', '', `${L.length} of ${ALL.length} assets` + (L.length ? ` · ${L.filter((r) => r.buy).length} with a buy signal now` : '')));
    if (active || F.sort !== 'rank') { const rb = cnt.appendChild(el('button', 'sc-reset', 'Reset')); rb.type = 'button'; rb.addEventListener('click', () => { Object.assign(F, F0); shown = 60; saveF(); SRApp.renderDraw('screener'); }); }
    const list = box.appendChild(el('div', 'sc-list')), vis = L.slice(0, shown);
    for (const r of vis) list.appendChild(rowEl(r));
    if (!L.length) list.appendChild(el('p', 'g-muted', 'No asset matches these filters.'));
    if (L.length > shown) { const mb = box.appendChild(el('button', 'sc-more', `Show ${Math.min(60, L.length - shown)} more (${L.length - shown} left)`)); mb.type = 'button'; mb.addEventListener('click', () => { shown += 60; SRApp.renderDraw('screener'); }); }
    // live prices: this device's own assets, and the scanned ones that are on screen
    if (window.SRLive && window.SRLive.want) window.SRLive.want('screen', [...R.map((r) => r.id), ...vis.filter((r) => r.scanned).slice(0, 40).map((r) => r.id)].filter(Boolean));
    box.appendChild(el('p', 'g-hint', 'The score is that of the latest daily candle. Stop and target are 2 ATR either side of that close. Support and resistance are the nearest zones made of averages, pivots, Fibonacci levels, trendlines and gaps. Market value, revenue and P/E are eToro\'s figures, in dollars. Scanned assets show the price of the scan until their live price arrives. Analysis, not advice.'));
    if (two && selId == null && outer.offsetParent !== null) { const first = L.find((r) => r.id); if (first) select(first); }   // the best-ranked asset is shown first
  });
  setInterval(() => { if (!document.hidden) SRApp.renderDraw('screener'); }, 15000);
  let wasMac = isMac(); window.addEventListener('resize', () => { if (isMac() !== wasMac) { wasMac = isMac(); for (const n of ['screener', 'today', 'pfolio', 'plan']) SRApp.renderDraw(n); } });
  // a tile's change: today's against the last close; before the asset's market has traded today (no candle of today, eToro says it is closed
  // or the price is still the last close), the last session's change and that day's name
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  function dayMove(R, id) {
    if (!R || R.length < 2) return null;
    const n = R.length, last = R[n - 1], today = new Date().toISOString().slice(0, 10), q = window.SRLive && SRLive.quotes ? SRLive.quotes.get(id) : null, px = q && q.price > 0 ? q.price : last.close;
    const open = window.SRLive && SRLive.marketOpen ? SRLive.marketOpen(id) : undefined;
    if (!(last.close > 0) || !(R[n - 2].close > 0)) return null;
    if (last.date >= today) return { chg: px / R[n - 2].close - 1, day: '' };
    if (open === true || (open !== false && Math.abs(px / last.close - 1) >= 0.0005)) return { chg: px / last.close - 1, day: '' };
    return { chg: last.close / R[n - 2].close - 1, day: WD[new Date(last.date + 'T12:00:00Z').getUTCDay()] };
  }
  // the assets the app itself knows by their ticker (for the names that open their page wherever they are written): its funds, the world
  // board, your holdings (a Revolut ticker opens its US twin), the account's trades and today's scouted ideas
  function known() {
    const m = new Map(), add = (s, id, name) => { if (s && id > 0 && !m.has(s)) m.set(s, { id, name: name || '' }); };
    for (const [s, id, name] of BOARD) add(s, id, name);
    try { for (const u of universe()) add(u.sym, u.id, u.group === 'Yours' && /^your /.test(u.name) ? '' : u.name); } catch (e) { /* not ready yet */ }
    const H = dash.data('holdings'); for (const h of (H.status === 'ok' ? H.data : [])) if (h.ticker && h.tracks && h.ticker !== h.tracks) add(h.ticker, SRApp.idOf(h.tracks), `Your ${h.ticker}, shown through its US twin ${h.tracks}`);
    for (const t of [...((prac && prac.open) || []), ...((prac && prac.closed) || [])]) add(t.s, t.id, t.n);
    try { for (const r of top(6)) add(r.sym, r.id, r.name); } catch (e) { /* no scan yet */ }
    return m;
  }
  window.SRScreen = { known, dayMove, packs: () => packSet, rows, all, load, open, SHORT, top, loadWide, filters: F, odds: oddsText, count: () => all().length, record: () => (wide ? wide.record : null), loadPractice, practice: () => prac, review: () => review, audit: () => audit, vmSilent, demoWatch, demo: () => ({ p: demo, at: demoAt, err: demoErr, hist, curve }) };
})();
