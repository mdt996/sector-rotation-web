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
    ['USDOLLAR', 25, 'US dollar index'], ['IEF', 3101, '10-year Treasuries (fall when yields rise)'], ['GOLD', 18, 'Gold'], ['SILVER', 19, 'Silver'], ['OIL', 17, 'Oil'], ['NATGAS', 22, 'Natural gas'], ['BTC', 100000, 'Bitcoin'], ['ETH', 100001, 'Ether'], ['SOL', 100063, 'Solana']];
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
  // Older than 2 hours they are still shown while they are asked again (all at once, ahead of the once-a-day extras: the tiles wait for
  // them), unless their last candle is older than yesterday's.
  const stale = new Set();
  try { const all = JSON.parse(localStorage.getItem(WB) || '{}'); for (const [sym, v] of Object.entries(all)) if (v && v.r && v.r.length) { extra.set(sym, v.r.map(([date, open, high, low, close]) => ({ date, open, high, low, close }))); if (Date.now() - v.at >= TTL) stale.add(sym); } } catch (e) { /* no cache */ }
  const tooOld = (sym, R) => stale.has(sym) && R && R.length && R[R.length - 1].date < new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  async function load() {
    if (busy || !window.SRLive || !window.SRLive.candles) return;
    busy = true;
    const todo = BOARD.filter(([sym]) => (!extra.has(sym) || stale.has(sym)) && !(SRApp._store[sym] && SRApp._store[sym].status === 'ok') && Date.now() - (failAt.get(sym) || 0) >= 60000);
    await Promise.all(todo.map(async ([sym, id]) => {
      try { const r = await window.SRLive.candles(id, 'OneDay', 400, 1.5); extra.set(sym, r.map(({ date, open, high, low, close }) => ({ date, open, high, low, close }))); stale.delete(sym); if (r.length) keep(sym); } catch (e) { failAt.set(sym, Date.now()); }   // asked again a minute later, not given up for the session
    }));
    busy = false; if (todo.length) { SRApp.renderDraw('screener'); SRApp.renderDraw('ranks'); SRApp.renderDraw('today'); prepare(); }
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
  let warm = SDB.get().then((j) => { if (j && j.rows && !wide) { useWide(j); SRApp.renderDraw('screener'); SRApp.renderDraw('ranks'); SRApp.renderDraw('today'); } }).catch(() => {});
  async function loadWide(force) {
    if (wideBusy || !window.SRSync || !window.SRSync.getFile || (!force && Date.now() - wideAt < 20 * 60e3)) return;
    wideBusy = true;
    try {
      await warm;
      let need = true;
      if (wide && !force) { const m = await window.SRSync.getFile('scanmeta.json'); if (m && m.made && m.made === wide.made) need = false; }
      if (need) { const j = await window.SRSync.getFile('scan.json'); if (j && j.rows) { useWide(j); SDB.set(j); } }
    } catch (e) { /* keeps the last one */ }
    wideAt = Date.now(); wideBusy = false; SRApp.renderDraw('screener'); SRApp.renderDraw('ranks'); SRApp.renderDraw('today');
  }
  // ---- the practice portfolio (eToro demo account) and its daily review: two small files from the private folder ----
  let prac = null, review = null, audit = null, pracAt = 0, pracBusy = false;
  async function loadPractice(force) {
    if (pracBusy || !window.SRSync || !window.SRSync.getFile || (!force && Date.now() - pracAt < 60e3)) return;   // the VM's record: asked again every minute, and at once when eToro shows something it does not explain
    pracBusy = true;
    const G = (name, ok, use) => window.SRSync.getFile(name).then((j) => { if (j && ok(j)) use(j); }).catch(() => { /* keeps the last one */ });
    // the three files together, and the screens drawn as soon as the record itself is in (it was one after the other, and only then)
    await Promise.all([G('practice.json', (j) => j.made, (j) => { const first = !prac; prac = j; if (first) { SRApp.renderDraw('today'); SRApp.renderDraw('trade'); } }),
      G('review.json', (j) => j.entries, (j) => { review = j; }), G('audit.json', (j) => j.made, (j) => { audit = j; })]);
    pracAt = Date.now(); pracBusy = false;   // later readings are picked up by the cards' own repaint
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
  let demo = null, demoAt = 0, demoUrgent = 0, demoErr = null, demoBusy = false, demoTimer = null, hist = null, histAt = 0, lastKey = ''; const painters = new Set();
  // the account's value over time, as this device has seen it (one point every 10 minutes, kept for 90 days)
  let curve = []; try { curve = JSON.parse(localStorage.getItem('sr.demoCurve') || '[]'); } catch (e) { curve = []; }
  const point = (v) => { const now = Date.now(), last = curve[curve.length - 1]; if (!(v > 0)) return; const r = Math.round(v * 100) / 100; if (last && Math.floor(now / 60e3) === Math.floor(last[0] / 60e3)) { last[2] = Math.max(last[2] || last[1], r); last[3] = Math.min(last[3] || last[1], r); last[1] = r; return; } curve.push([now, r, r, r]); curve = curve.filter((p) => now - p[0] < 90 * 864e5).slice(-8000); try { localStorage.setItem('sr.demoCurve', JSON.stringify(curve)); } catch (e) { /* storage full or closed */ } };
  async function demoRead() {
    if (demoBusy || document.hidden || !window.SRApp || !SRApp.etoroGet) return;
    demoBusy = true;
    try {
      const urgent = !(demoAt && Date.now() - demoAt < 60e3) && Date.now() - demoUrgent > 60e3; if (urgent) demoUrgent = Date.now();
      const r = await SRApp.etoroGet('/api/v1/trading/info/demo/pnl', urgent ? 2.5 : 1.5);   // the first reading (or one after a minute without) goes ahead of everything in the queue: behind the fund history it waited up to a minute at start-up; the 5-second ones after it leave the charts their room
      if (r && r.status === 200) { const j = JSON.parse(r.body); if (j && j.clientPortfolio) { demo = j.clientPortfolio; demoAt = Date.now(); demoErr = null;
        const key = (demo.positions || []).map((o) => o.positionID).sort().join(',') + '|' + (demo.ordersForOpen || []).map((o) => o.orderID).sort().join(',');
        if (key !== lastKey) { if (lastKey) { histAt = 0; pracAt = Math.min(pracAt, 1); loadPractice(true); } lastKey = key; }   // something opened or closed: the closed trades and the VM's record are read again now
        point((+demo.credit || 0) + (demo.positions || []).reduce((x, o) => x + (+o.amount || 0) + (window.SRLive && window.SRLive.positionPL ? window.SRLive.positionPL(o).pl : 0), 0) + (window.SRLive && window.SRLive.positionPL ? 0 : +demo.unrealizedPnL || 0)); } }
      else demoErr = r ? (r.reason === 'no keys' ? 'no keys' : r.status) : 0;
      if (!demoErr && Date.now() - histAt > 2 * 60e3) {            // closed trades: every two minutes, and at once when a position disappears
        const since = new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10), h = await SRApp.etoroGet(`/api/v1/trading/info/trade/demo/history?minDate=${since}&pageSize=200`, hist ? 1 : 2);   // the first one is waited for
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
  // the account and the VM's record are read as soon as the app opens, not only once the Trade card is on screen: every screen then has them
  setTimeout(() => { loadPractice(); if (!demoAt) demoRead(); }, 1200);
  // ---- the ranking: the buy model's score of the last candle (ta.js mscore; its record is in tastats.js, "model") ----
  const MDL = () => (window.SRTA && window.SRTA.model && window.SRTA.model()) || null, MST = () => ((window.SR_TASTATS || {}).model || {});
  // ---- which signals count, and what each is worth (Matteo, 25 Nov 2026: "sometimes you propose very strange assets with strange
  // graphs and terrible financials....what is your logic?"). The model reads the chart only: no size, no finances. Measured that day
  // with the shipped model on the 869 assets it was not fitted on, from 2013 (/tmp harness, figures in AGENTS.md):
  //  - a "strong" signal worked no more often than a plain one (57.1% against 57.0%; the strict test said 54.2% against 54.4%);
  //  - the ugly charts are where the edge is (below the 200-day average: edge +6.0 points, above: +4.2; after a fall of over 20% in a
  //    month: 61.9% worked), so a signal is NOT dropped for its chart;
  //  - the odds grow with the company's size (53% under $2B, 55% at $2B to $10B, 57% at $10B to $50B, 59% over $50B);
  //  - no company under $317M was in any test, and that day 132 of the 208 "strong buy" shares were smaller than that.
  // So: no "strong" label any more; a share under $300M or with weak finances is not counted as a signal unless the user asks for
  // them (F.q = 'all'); signals come in the order of how their kind of asset did in the test, and each row shows that figure.
  // Finances are a choice, not a tested rule: there is no history of them to test on.
  const KIND = (r) => (r.cls === 'ETF' ? 'ETF' : r.cls === 'Crypto' ? 'Crypto' : r.cls !== 'Stocks' ? null : /\./.test(r.sym || '') ? 'non-US shares' : r.cap >= 10e9 ? 'US large (over $10B)' : r.cap >= 2e9 ? 'US medium ($2B to $10B)' : 'US small (under $2B)');
  const KINDSAY = { ETF: 'funds', Crypto: 'crypto', 'non-US shares': 'shares outside the US', 'US large (over $10B)': 'US companies over $10B', 'US medium ($2B to $10B)': 'US companies of $2B to $10B', 'US small (under $2B)': 'US companies under $2B' };
  // the test's record for this kind of asset: { win, base, kind } (the strict test: fitted on 79 assets to 2012, judged on 869 others from 2013)
  function oddsOf(r) {
    const W = MST().wide, k = KIND(r), t = W && W.tiers && k ? W.tiers[k] : null;
    if (t) return { win: t.win, base: t.base, kind: k };
    if (W && W.all) return { win: W.all.win, base: W.all.base, kind: null };
    const d = MST()['1D']; return d && d.buy ? { win: d.buy.win, base: d.buy.base, kind: null } : null;
  }
  const TESTED_FROM = 3e8;   // the smallest company of the tests was worth $317M
  const tooSmall = (r) => r.cls === 'Stocks' && !!r.scanned && !(r.cap >= TESTED_FROM);
  // a company's finances in a word, from the nightly ranking (fin.js: overall score 0-100); without a ranking, a loss says "weak"
  const health = (r) => (r.cls !== 'Stocks' ? null : Array.isArray(r.f) && r.f[0] != null ? (r.f[0] >= 60 ? 'good' : r.f[0] >= 40 ? 'mid' : 'weak') : r.pe < 0 ? 'weak' : null);
  const sound = (r) => !tooSmall(r) && health(r) !== 'weak';
  const isSig = (r) => !!r.buy && (F.q === 'all' || r.q);
  // the chart in a few words, from figures every row has: [words, 'up' | 'down' | '']
  function shape(r) {
    if (r.c20 != null && r.c20 <= -0.1) return ['Fell ' + Math.round(-r.c20 * 100) + '% in a month', 'down'];
    if (r.rsi != null && r.rsi < 30) return ['Oversold, RSI ' + Math.round(r.rsi), 'down'];
    if (r.rsi != null && r.rsi > 70) return ['Overbought, RSI ' + Math.round(r.rsi), 'up'];
    if (r.c20 != null && r.c20 >= 0.1) return ['Up ' + Math.round(r.c20 * 100) + '% in a month', 'up'];
    if (r.m200 != null && r.m200 > 0) return [r.m50 != null && r.m50 < 0 ? 'Pullback in an uptrend' : 'Uptrend', ''];
    if (r.m200 != null) return ['Under its 200-day average', ''];
    return null;
  }
  // the last three months as a line: the scan's 32 characters (spark.js in the private folder), or the same made here from candles
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  function sparkOf(R) {
    const v = []; for (let i = R.length - 1; i >= 0 && v.length < 32; i -= 2) if (R[i].close > 0) v.unshift(R[i].close);
    if (v.length < 8) return null;
    const lo = Math.min(...v), hi = Math.max(...v);
    return { k: v.map((x) => B64[hi > lo ? Math.round((x - lo) / (hi - lo) * 63) : 32]).join(''), c60: v[v.length - 1] / v[0] - 1 };
  }
  // one list for everything: this device's own analysis (yours, the funds, the world board: live) and the nightly scan
  let allMemo = null;
  function all() {
    if (allMemo && Date.now() - allMemo.at < 1200) return allMemo.rows;
    const M = new Map(), out = [], seen = new Set(), Q = window.SRLive ? window.SRLive.quotes : new Map(), today = new Date().toISOString().slice(0, 10), md = MDL(), bar = md ? md.buy : 2, bar2 = md ? md.strong : 2;
    if (wide) for (const r of wide.rows) M.set(r.id, r);
    const capOf = (c) => (c > 0 && c < 2e13 ? c : null);   // eToro sends nonsense for some funds ($2,703,850T): no company or fund is worth $20,000 billion
    const grade = (o) => { o.buy = o.ms != null && o.ms >= bar; o.strong = o.ms != null && o.ms >= bar2; o.q = sound(o); o.od = oddsOf(o); o.lv = !o.q ? 2 : o.od && o.od.win >= 0.55 ? 0 : 1; return o; };
    for (const r of rows()) {
      if (!r.A) continue; const m = M.get(r.id) || {}, A = r.A; seen.add(r.id);
      out.push(grade({ sym: r.sym, id: r.id, name: r.name, group: r.group, mine: r.group === 'Yours', cls: m.cls || (r.group === 'Funds' ? 'ETF' : null), sec: m.sec || null, cap: capOf(m.cap), sales: m.sales || null, pe: m.pe || null, pop: m.pop || null, px: r.px, chg: r.chg, c5: A.chg5, c20: A.chg20, rsi: A.rsi,
        sup: r.sup, res: r.res, rr: A.rr, ms: r.ms, stop: A.atr > 0 ? A.price - 2 * A.atr : null, target: A.atr > 0 ? A.price + 2 * A.atr : null, last: A.date, live: true, f: m.f || null,
        m50: A.s50 > 0 && r.px > 0 ? r.px / A.s50 - 1 : null, m200: A.s200 > 0 && r.px > 0 ? r.px / A.s200 - 1 : null,
        dvb: A.div && A.div.bull ? A.div.bull : null, dve: A.div && A.div.bear ? A.div.bear : null, k: r.sp ? r.sp.k : null, c60: r.sp ? r.sp.c60 : null }));
    }
    if (wide) for (const r of wide.rows) {
      if (seen.has(r.id)) continue;
      const q = Q.get(r.id), px = q && q.price > 0 ? q.price : r.px, chg = q && q.price > 0 && r.px ? (r.d < today ? px / r.px - 1 : (1 + r.c1) * px / r.px - 1) : r.c1;
      out.push(grade({ sym: r.s, id: r.id, name: r.n, group: r.g, mine: false, cls: r.cls || null, sec: r.sec || null, cap: capOf(r.cap), sales: r.sales || null, pe: r.pe || null, pop: r.pop || null, px, chg, c5: r.c5, c20: r.c20, rsi: r.rsi,
        sup: r.sup ? r.sup.d : null, res: r.res ? r.res.d : null, rr: r.rr, ms: r.ms == null ? null : r.ms, stop: r.atr > 0 ? r.px - 2 * r.atr : null, target: r.atr > 0 ? r.px + 2 * r.atr : null, last: r.d, live: !!q, scanned: true, f: r.f || null,
        // the averages are those of the last close (the scan); the price is the live one
        m50: r.m50 != null && r.px > 0 ? px * (1 + r.m50) / r.px - 1 : null, m200: r.m200 != null && r.px > 0 ? px * (1 + r.m200) / r.px - 1 : null,
        dvb: dvOf(r.db), dve: dvOf(r.de), k: r.k || null, c60: r.c60 == null ? null : r.c60 }));
    }
    allMemo = { at: Date.now(), rows: out };
    return out;
  }
  // ---- the financial ranking (Matteo, 22 Nov 2026: "rank any asset by the several financial scores on the different fields, and
  // allow to see which place of the ranking the asset currently is ... and give also an overall score"). The nightly scan scores
  // every share 0 to 100 on five fields and overall (fin.js in the private repository: the share of the ranked companies it beats,
  // from eToro's figures); here they become places: #1 is the best. Ties go to the higher overall score, then the larger company.
  const FIN = [['all', 'Overall'], ['profit', 'Profit'], ['cash', 'Cash flow'], ['debt', 'Debt'], ['growth', 'Growth'], ['outlook', 'Outlook']];
  let finMemo = null;
  function finRanks() {
    if (!wide || !wide.rows) return null; if (finMemo && finMemo.made === wide.made) return finMemo;
    const R = wide.rows.filter((r) => r.cls === 'Stocks' && Array.isArray(r.f)), out = { made: wide.made, by: new Map(), n: [], sec: new Map(), secN: new Map(), top: null };
    if (!R.length) { finMemo = out; return out; }
    FIN.forEach(([k], i) => {
      const L = R.filter((r) => r.f[i] != null).sort((a, b) => b.f[i] - a.f[i] || (b.f[0] == null ? -1 : b.f[0]) - (a.f[0] == null ? -1 : a.f[0]) || (b.cap || 0) - (a.cap || 0) || a.id - b.id);
      out.n[i] = L.length; L.forEach((r, j) => { let o = out.by.get(r.id); if (!o) out.by.set(r.id, (o = [])); o[i] = j + 1; });
      if (i === 0) { out.top = L; const per = new Map(); for (const r of L) { const s = r.sec || 'Other', k2 = (per.get(s) || 0) + 1; per.set(s, k2); out.sec.set(r.id, k2); } out.secN = per; }
    });
    finMemo = out; return out;
  }
  // one company's places: [{ k, label, score, rank, n }], its sector's place, and the date of the figures
  function finOf(id) {
    const F2 = finRanks(), r = wide && wide.rows ? wide.rows.find((x) => x.id === +id) : null; if (!F2 || !r || !Array.isArray(r.f)) return null;
    const P = F2.by.get(r.id) || [], sec = r.sec || 'Other';
    return { made: F2.made, sec: F2.sec.has(r.id) ? { name: sec, rank: F2.sec.get(r.id), n: F2.secN.get(sec) || 0 } : null,
      cats: FIN.map(([k, label], i) => ({ k, label, score: r.f[i], rank: P[i] || null, n: F2.n[i] || 0 })) };
  }
  const finIx = (k) => FIN.findIndex((x) => x[0] === k);
  // 1. the signals that count: the kinds of asset that did best in the test first (funds and large US companies), then the others;
  //    within each, the most followed on eToro first (above the bar a higher score did no better, so the score does not order them:
  //    it put tiny unknown companies on top); 2. the assets without a signal, by score (none: last); 3. the signals that do not
  //    count (too small, weak finances)
  const tier = (r) => (isSig(r) ? 0 : r.buy ? 2 : 1);
  const byScore = (a, b) => (a.ms == null) - (b.ms == null) || (b.ms || 0) - (a.ms || 0) || (b.sup == null ? -9 : b.sup) - (a.sup == null ? -9 : a.sup);
  const sigOrder = (a, b) => a.lv - b.lv || (a.pop == null) - (b.pop == null) || (a.pop || 0) - (b.pop || 0) || byScore(a, b);   // pop is eToro's rank: 1 = the most followed
  const rankOrder = (a, b) => tier(a) - tier(b) || (tier(a) === 0 ? sigOrder(a, b) : byScore(a, b));
  // the home page's shortlist: the first signals of that order, among assets one can really trade: shares of companies worth at least
  // $2 billion with finances that are not weak, any fund, index, commodity, currency or crypto
  const liquid = (r) => !r.scanned || r.cls !== 'Stocks' || r.cap >= 2e9;
  function top(n) { return all().filter((r) => r.buy && r.q && liquid(r)).sort(sigOrder).slice(0, n); }
  // an asset's analysis, kept until its history changes (a new day, a longer history)
  function analysed(u) {
    const n = u.rows.length, key = n + '|' + u.rows[n - 1].date; let c = cache.get(u.sym);
    if (!c || c.key !== key) { c = { key, A: window.SRTA.analyze(u.rows), ms: null, sp: sparkOf(u.rows) }; if (window.SRTA.mscore && n >= 262) { const p = window.SRTA.mscore(u.rows); c.ms = isFinite(p[n - 1]) ? p[n - 1] : null; } cache.set(u.sym, c); }
    return c;
  }
  // done ahead, one asset at a time when the phone has nothing else to do: opening Markets then finds them ready instead of freezing for
  // the time of some fifty analyses (about 0.8 s on a mid-range phone)
  let warming = false;
  function prepare() {
    if (warming || !window.SRTA) return; warming = true;
    const idle = window.requestIdleCallback ? (f) => window.requestIdleCallback(f, { timeout: 2000 }) : (f) => setTimeout(f, 60);
    let todo = null;
    const step = (dl) => {
      try {
        if (!todo) todo = universe().filter((u) => u.rows && u.rows.length >= 260);
        const until = Date.now() + Math.max(8, dl && dl.timeRemaining ? dl.timeRemaining() : 12);
        while (todo.length && Date.now() < until) analysed(todo.shift());
      } catch (e) { todo = []; }
      if (todo.length) idle(step); else warming = false;
    };
    idle(step);
  }
  function rows() {
    const S = stats(), out = [], today = new Date().toISOString().slice(0, 10);
    for (const u of universe()) {
      if (!u.rows || u.rows.length < 260) { if (u.group === 'World') out.push({ ...u, A: null }); continue; }
      const n = u.rows.length, c = analysed(u);
      const A = c.A; if (!A) continue;
      const q = window.SRLive && window.SRLive.quotes.get(u.id), px = q ? q.price : A.price, prev = u.rows[n - 1].date >= today && n > 1 ? u.rows[n - 2].close : u.rows[n - 1].close;
      const sig = A.signals.filter((x) => x.ago <= 3 && S[x.id] && S[x.id].ok);
      const buy = sig.filter((x) => x.side > 0).sort((a, b) => S[b.id].edge - S[a.id].edge)[0] || null, sell = sig.filter((x) => x.side < 0)[0] || null;
      out.push({ ...u, A, ms: c.ms, sp: c.sp, px, chg: px / prev - 1, buy, sell, sup: A.sup ? A.sup.p / px - 1 : null, res: A.res ? A.res.p / px - 1 : null, score: buy ? S[buy.id].edge : 0 });
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
  const p1 = (x) => (x * 100).toFixed(1) + '%', p0 = (x) => Math.round(x * 100) + '%', sc100 = (x) => Math.round(x * 100);
  // filters and sorting, kept on the device
  const FK = 'sr.scf', F0 = { sort: 'rank', cls: '', sec: '', size: '', sales: '', rsi: '', sig: '', q: '' }, F = { ...F0 };   // q: '' = only the signals that count, 'all' = every signal of the model
  try { const j = JSON.parse(localStorage.getItem(FK) || '{}'); for (const k of Object.keys(F0)) if (typeof j[k] === 'string') F[k] = j[k]; if (F.sig === 'strong') F.sig = 'buy'; } catch (e) { /* defaults */ }
  const saveF = () => { try { localStorage.setItem(FK, JSON.stringify(F)); } catch (e) { /* not kept */ } };
  let shown = 60, howOpen = false, filtOpen = false, selAt = 0; const scrollX = {};
  const T = (k) => (window.SRI18n ? window.SRI18n.t(k) : k);   // a label in the chosen language (i18n.js)
  const CLS = [['@watch', 'watchlist'], ['', 'all'], ['Stocks', 'stocks'], ['ETF', 'funds'], ['Crypto', 'crypto'], ['Indices', 'indices'], ['Commodity', 'commodities'], ['Forex', 'currencies'], ['@mine', 'yours']], CLSNAME = { ETF: 'Fund', Forex: 'Currency', Indices: 'Index' };
  const SECKEY = { XLK: 'tech', XLF: 'finance', XLE: 'energy', XLV: 'health', XLI: 'industry', XLY: 'consumer', XLP: 'staples', XLU: 'utilities', XLB: 'materials', XLRE: 'realestate', XLC: 'comms' };
  const SECTOR = { XLK: 'Information Technology', XLF: 'Financials', XLE: 'Energy', XLV: 'Healthcare', XLI: 'Industrials', XLY: 'Consumer Discretionary', XLP: 'Consumer Staples', XLU: 'Utilities', XLB: 'Materials', XLRE: 'Real Estate', XLC: 'Communication Services' };
  const SIZE = { mega: ['Over $200B', 200e9, Infinity], large: ['$10B to $200B', 10e9, 200e9], mid: ['$2B to $10B', 2e9, 10e9], small: ['Under $2B', 0, 2e9] };
  const SALES = { big: ['Revenue over $50B', 50e9, Infinity], mid: ['Revenue $5B to $50B', 5e9, 50e9], small: ['Revenue under $5B', 0, 5e9] };
  const RSIB = { lo: ['RSI below 30', 0, 30], mlo: ['RSI 30 to 50', 30, 50], mhi: ['RSI 50 to 70', 50, 70], hi: ['RSI above 70', 70, 101] };
  const inB = (v, B) => v != null && v >= B[1] && v < B[2];
  // ---- the watchlist (build 150; Matteo, 26 Nov 2026: "I want the watchlist"): the assets the user starred, kept with the settings
  // (config key "starred": [{ id, s, n }], in the order they were added, 200 at most) so they follow the person to every device like
  // the holdings (sync.js SYNCED, account.js FIELDS). NOT the older "watch" setting: that is a typed list of sector funds for alerts. ----
  let wsMemo = null;
  const starred = () => { const c = window.SRApp && SRApp.config ? SRApp.config() : {}; return Array.isArray(c.starred) ? c.starred.filter((x) => x && +x.id > 0) : []; };
  const wset = () => (wsMemo && Date.now() - wsMemo.at < 1500 ? wsMemo.s : (wsMemo = { at: Date.now(), s: new Set(starred().map((x) => +x.id)) }).s);
  const isStar = (id) => wset().has(+id);
  function toggleStar(a) {   // a: { id, sym, name } -> true when it is on the list afterwards
    if (!a || !(+a.id > 0) || !window.SRApp || !SRApp.saveConfig) return false;
    const c = SRApp.config(), L = starred(), i = L.findIndex((x) => +x.id === +a.id), on = i < 0;
    if (on) { if (L.length >= 200) return false; L.push({ id: +a.id, s: String(a.sym || ''), n: String(a.name || '').slice(0, 60) }); } else L.splice(i, 1);
    c.starred = L; SRApp.saveConfig(c); wsMemo = null; allMemo = null; if (window.SRSync && window.SRSync.pushSoon) window.SRSync.pushSoon();
    for (const b of document.querySelectorAll(`.sc-star[data-id="${+a.id}"]`)) paintStar(b, on);
    if (SRApp.renderDraw) SRApp.renderDraw('screener');
    return on;
  }
  const paintStar = (b, on) => { b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', String(on)); b.setAttribute('aria-label', on ? 'On your watchlist. Tap to remove' : 'Add to your watchlist'); b.title = on ? 'On your watchlist' : 'Add to your watchlist'; };
  function starButton(a) {   // a star for an asset, used by the asset's sheet here and by the asset's page (live.js)
    const b = el('button', 'sc-star'); b.type = 'button'; b.dataset.id = String(+a.id);
    const sv = svgEl('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }); sv.appendChild(svgEl('path', { d: 'M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z' })); b.appendChild(sv);
    paintStar(b, isStar(a.id)); b.addEventListener('click', (e) => { e.stopPropagation(); toggleStar(a); });
    return b;
  }
  const watchOrder = () => { const ix = new Map(starred().map((x, i) => [+x.id, i])); const at = (r) => (ix.has(+r.id) ? ix.get(+r.id) : 1e9); return (a, b) => at(a) - at(b); };
  function pass(r) {
    if (F.cls === '@watch' ? !isStar(r.id) : F.cls === '@mine' ? !r.mine : F.cls && r.cls !== F.cls) return false;
    if (F.sec && !(r.cls === 'Stocks' && r.sec === F.sec)) return false;
    if (F.size === 'liq' ? !liquid(r) : F.size && !inB(r.cap, SIZE[F.size])) return false;
    if (F.sales && !inB(r.sales, SALES[F.sales])) return false;
    if (F.rsi && !inB(r.rsi, RSIB[F.rsi])) return false;
    if (F.sig && !isSig(r)) return false;
    return true;
  }
  const by = (f, dir) => (a, b) => { const x = f(a), y = f(b), nx = x == null || !isFinite(x), ny = y == null || !isFinite(y); return nx - ny || (nx ? 0 : dir * (x - y)); };   // assets without the figure go last
  const SORTS = { rank: ['signals first', rankOrder], cap: ['market value, largest first', by((r) => r.cap, -1)], pop: ['most followed on eToro first', by((r) => r.pop, 1)], sales: ['revenue, largest first', by((r) => r.sales, -1)], rsiLo: ['RSI, lowest first', by((r) => r.rsi, 1)], rsiHi: ['RSI, highest first', by((r) => r.rsi, -1)],
    day: ['today, best first', by((r) => r.chg, -1)], dayLo: ['today, worst first', by((r) => r.chg, 1)],
    // the list's header line (build 148): a tap on Symbol, 3 months, Price or Today sorts by it, a second tap turns it round, a third goes back to signals first
    az: ['symbol, A to Z', (a, b) => String(a.sym).localeCompare(String(b.sym))], za: ['symbol, Z to A', (a, b) => String(b.sym).localeCompare(String(a.sym))],
    m3: ['3 months, best first', by((r) => r.c60, -1)], m3Lo: ['3 months, worst first', by((r) => r.c60, 1)], px: ['price, highest first', by((r) => r.px, -1)], pxLo: ['price, lowest first', by((r) => r.px, 1)], c5: ['5 days, best first', by((r) => r.c5, -1)], c20: ['1 month, best first', by((r) => r.c20, -1)], sup: ['nearest support', by((r) => r.sup, -1)], res: ['nearest resistance', by((r) => r.res, 1)],
    rr: ['reward to risk, highest first', by((r) => r.rr, -1)], pe: ['P/E, lowest first', by((r) => (r.pe > 0 ? r.pe : null), 1)],
    'fin:all': ['financial health, healthiest first'], 'fin:all:lo': ['financial health, least healthy first'], 'fin:profit': ['profit, best first'], 'fin:cash': ['cash flow, best first'],
    'fin:debt': ['debt, soundest first'], 'fin:growth': ['growth, fastest first'], 'fin:outlook': ['outlook, best first'],
    'div:dvb': ['bullish RSI divergence, strongest first'], 'div:dve': ['bearish RSI divergence, strongest first'],
    'ma:m200': ['200-day average, furthest above first'], 'ma:m200:lo': ['200-day average, furthest below first'], 'ma:m50': ['50-day average, furthest above first'], 'ma:m50:lo': ['50-day average, furthest below first'] };
  // Distance from the 50- and 200-day averages, in %, ranked among every asset that has one (Matteo, 23 Nov 2026: "Implement for every
  // asset the distance from the 200 MA and the 50 MA in percentage and insert it as a ranking among the others available").
  // Place 1 = the furthest above its average; the list sorted "furthest below first" counts from the last place up.
  const MA = { m50: '50-day average', m200: '200-day average' };
  // RSI divergences scored 0-100 (ta.js divergence), ranked: bullish and bearish apart (Matteo, 24 Nov 2026)
  const DV = { dvb: 'bullish RSI divergence', dve: 'bearish RSI divergence' };
  const dvOf = (a) => (Array.isArray(a) && a[0] > 0 ? { s: a[0], r1: a[1], r2: a[2], move: a[3], age: a[4], d1: a[5], d2: a[6] } : null);
  const dvSort = () => { const m = /^div:(dvb|dve)$/.exec(F.sort || ''); return m ? m[1] : null; };
  const dvCmp = (k) => (a, b) => b[k].s - a[k].s || a[k].age - b[k].age;
  let dvMemo = null;
  function dvRanks() {
    const A = all(); if (dvMemo && dvMemo.rows === A) return dvMemo;
    const by = new Map(), n = {};
    for (const k of Object.keys(DV)) { const L = A.filter((r) => r.id && r[k]).sort(dvCmp(k)); n[k] = L.length; L.forEach((r, i) => { const e = by.get(r.id) || {}; e[k] = [r[k], i + 1]; by.set(r.id, e); }); }
    dvMemo = { rows: A, by, n }; return dvMemo;
  }
  const dvRankOf = (id) => { const P = dvRanks(), e = P.by.get(+id); return e ? { dvb: e.dvb || null, dve: e.dve || null, n: P.n, made: wide ? wide.made : null } : null; };
  // in words: what RSI and the price did between the two pivots, and how long ago the second one was
  const dvSay = (d, bull) => `RSI ${Math.round(d.r1)} → ${Math.round(d.r2)} while the price ${bull ? 'fell' : 'rose'} ${Math.abs(d.move * 100).toFixed(1)}% · ${d.age} day${d.age === 1 ? '' : 's'} ago`;
  const dvPos = new Map();
  function dvStrip(b, r, k) {
    const P = dvRanks(), here = dvPos.get(r.id), d = r[k], rank = here ? here[0] : null, n = here ? here[1] : P.n[k] || 0, bull = k === 'dvb';
    b.classList.add('sc-row-dv'); const y = b.appendChild(el('span', 'sc-y sc-dv'));
    const head = y.appendChild(el('span', 'sc-dv-r')); head.appendChild(el('b', '', rank ? '#' + rank.toLocaleString('en-US') : '–')); head.appendChild(el('span', 'g-muted', ` of ${n.toLocaleString('en-US')}`));
    const sc = y.appendChild(el('span', 'sc-dv-s')); const t = sc.appendChild(el('span', 'sc-dv-t')), f = t.appendChild(el('i', bull ? 'up' : 'down')); f.style.width = d.s + '%'; sc.appendChild(el('b', bull ? 'up' : 'down', String(d.s)));
    y.appendChild(el('span', 'sc-dv-w', dvSay(d, bull)));
    y.setAttribute('aria-label', `${DV[k]}, score ${d.s} of 100, place ${rank || '–'} of ${n}: ${dvSay(d, bull)}`);
  }
  const maSort = () => { const m = /^ma:(m50|m200)(:lo)?$/.exec(F.sort || ''); return m ? { k: m[1], lo: !!m[2] } : null; };
  let maMemo = null;
  function maRanks() {
    const A = all(); if (maMemo && maMemo.rows === A) return maMemo;
    const by = new Map(), n = {};
    for (const k of Object.keys(MA)) { const L = A.filter((r) => r.id && r[k] != null && isFinite(r[k])).sort((a, b) => b[k] - a[k]); n[k] = L.length; L.forEach((r, i) => { const e = by.get(r.id) || {}; e[k] = [r[k], i + 1]; by.set(r.id, e); }); }
    maMemo = { rows: A, by, n }; return maMemo;
  }
  const maOf = (id) => { const P = maRanks(), e = P.by.get(+id); return e ? { m50: e.m50 || null, m200: e.m200 || null, n: P.n, made: wide ? wide.made : null } : null; };
  const maPos = new Map();
  // the row of a list sorted by an average: the place, the distance from each average, a bar from the average (the middle) to the price
  function maStrip(b, r, ms) {
    const P = maRanks(), here = maPos.get(r.id), e = P.by.get(r.id), rank = here ? here[0] : e && e[ms.k] ? e[ms.k][1] : null, n = here ? here[1] : P.n[ms.k] || 0;
    b.classList.add('sc-row-ma'); const y = b.appendChild(el('span', 'sc-y sc-ma'));
    const head = y.appendChild(el('span', 'sc-ma-r')); head.appendChild(el('b', '', rank ? '#' + rank.toLocaleString('en-US') : '–')); head.appendChild(el('span', 'g-muted', ` of ${n.toLocaleString('en-US')}`));
    for (const k of ['m50', 'm200']) {
      const v = r[k], c = y.appendChild(el('span', 'sc-ma-c' + (k === ms.k ? ' is-on' : ''))); c.dataset.k = k; c.appendChild(el('small', '', k === 'm50' ? '50-day' : '200-day'));
      const t = c.appendChild(el('span', 'sc-ma-t')); if (v != null) { const w = Math.min(50, Math.abs(v) * 100 * 50 / 30); const f = t.appendChild(el('i', v >= 0 ? 'up' : 'down')); f.style.width = w + '%'; if (v < 0) f.style.right = '50%'; else f.style.left = '50%'; }
      c.appendChild(el('b', v == null ? 'g-muted' : v >= 0 ? 'up' : 'down', v == null ? '–' : pct(v)));
    }
    y.setAttribute('aria-label', `place ${rank || '–'} of ${n}; ${r.m50 == null ? 'no 50-day average' : pct(r.m50) + ' from its 50-day average'}; ${r.m200 == null ? 'no 200-day average' : pct(r.m200) + ' from its 200-day average'}`);
  }
  // a financial sort: only the shares with that score, in the order of their place (the least healthy: from the last place up)
  const finSort = () => { const m = /^fin:(\w+)(:lo)?$/.exec(F.sort || ''); if (!m) return null; const i = finIx(m[1]); return i < 0 ? null : { i, k: m[1], lo: !!m[2] }; };
  const finOrder = (fs) => { const P = finRanks(); const at = (r) => { const p = P && P.by.get(r.id); return p && p[fs.i] ? p[fs.i] : null; }; return (a, b) => (fs.lo ? at(b) - at(a) : at(a) - at(b)); };
  const oddsText = (r) => { const b = r.od || oddsOf(r); return b ? `Worked ${p0(b.win)} in the test (any day ${p0(b.base)})` : ''; };
  function howBox() {
    const S = MST(), md = MDL(), d = el('details', 'sc-how'); d.open = howOpen; d.addEventListener('toggle', () => { howOpen = d.open; });
    d.appendChild(el('summary', '', 'How the ranking works'));
    const P = (t) => d.appendChild(el('p', '', t)), n = (x) => (x || 0).toLocaleString('en-US'), D1 = S['1D'];
    if (!D1 || !md) { P('The model is not loaded yet.'); return d; }
    P(`1. Every asset gets one score from 0 to 100 on its latest daily candle. The score comes from a model that reads 29 measures of the chart, all in units of the asset's own volatility: how far the price is from its 20, 50 and 200-day averages and from its 1-year high and low, its moves over 1 day to 1 year, RSI, and the shape of the last candle.`);
    P(`2. A buy signal is a score of ${sc100(md.buy)} or more: the best 5% of the scores of the past. A higher score did no better in the test${S.wide && S.wide.strong ? ` (the best 2% worked ${p1(S.wide.strong.win)}, all signals ${p1(S.wide.all.win)})` : ''}, so there is no "strong" signal any more.`);
    P('The model reads the chart only: not the size of the company, not its finances. Many signals are on falling charts, and in the test those worked as often as the others: the falls are where the edge is. What changed the odds was size: the larger the company, the more often a signal worked. No company under $317M was in any test.');
    P('So a signal is counted only on a company worth $300M or more whose finances are not weak (health score of 40 or more; without a score, not loss-making). The size rule comes from the test. The finances rule is a choice: there is no history of finances to test it on. Signals are listed by how their kind of asset did in the test (the ring on each row): funds and large US companies first, and among them the most followed on eToro.');
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
  // the five fields as five small bars (their height is the score), the place in the sorted field and its score written beside them
  function finStrip(b, r, fs) {
    const P = finRanks(), pl = P && P.by.get(r.id), here = finPos.get(r.id), rank = here ? here[0] : pl ? pl[fs.i] : null, n = here ? here[1] : P ? P.n[fs.i] : 0;   // the place in the list shown (a sector, a size), else in all
    b.classList.add('sc-row-fin'); const y = b.appendChild(el('span', 'sc-y sc-fin'));
    const head = y.appendChild(el('span', 'sc-fin-r')); head.appendChild(el('b', '', rank ? '#' + rank.toLocaleString('en-US') : '–')); head.appendChild(el('span', 'g-muted', ` of ${n.toLocaleString('en-US')} · ${FIN[fs.i][1].toLowerCase()} ${r.f[fs.i]}`));
    const bars = y.appendChild(el('span', 'sc-fin-b')); bars.setAttribute('role', 'img');
    bars.setAttribute('aria-label', FIN.slice(1).map(([, l], j) => `${l} ${r.f[j + 1] == null ? 'not scored' : r.f[j + 1]}`).join(', '));
    FIN.slice(1).forEach(([k, l], j) => { const v = r.f[j + 1], c = bars.appendChild(el('span', 'sc-fin-c' + (j + 1 === fs.i ? ' is-on' : ''))); c.dataset.k = k; const t = c.appendChild(el('i', v == null ? 'is-na' : '')); t.style.height = (v == null ? 6 : Math.max(6, v)) + '%'; c.appendChild(el('small', '', l[0])); });
  }
  // the healthiest and the least healthy companies of $2 billion or more (as the home card: tiny ones carry the oddest figures), last night
  function finCard(box) {
    const P = finRanks(); if (!P || !P.top || !P.top.length) return;
    const big2 = P.top.filter((r) => r.cap >= 2e9), S = box.appendChild(el('section', 'sc-hc')), H = S.appendChild(el('div', 'sc-hc-h'));
    H.appendChild(el('b', '', 'Financial health')); H.appendChild(el('span', '', `${P.n[0].toLocaleString('en-US')} companies ranked · eToro's figures of ${new Date(P.made).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`));
    const G = S.appendChild(el('div', 'sc-hc-g'));
    for (const [title, L, lo] of [['Healthiest', big2.slice(0, 5), false], ['Least healthy', big2.slice(-5).reverse(), true]]) {
      const C = G.appendChild(el('div', 'sc-hc-c' + (lo ? ' is-lo' : ''))); C.appendChild(el('span', 'sc-hc-t', title));
      for (const r of L) { const x = C.appendChild(el('button', 'sc-hc-r')); x.type = 'button'; x.dataset.id = r.id; x.title = `${r.n}: overall ${r.f[0]}, #${P.by.get(r.id)[0]} of ${P.n[0]}`;
        x.addEventListener('click', () => open({ id: r.id, sym: r.s, name: r.n }));
        x.appendChild(el('b', '', r.s)); const t = x.appendChild(el('span', 'sc-hc-bar')); t.appendChild(el('i', '')).style.width = r.f[0] + '%'; x.appendChild(el('span', 'sc-hc-v', String(r.f[0]))); }
      const all = C.appendChild(el('button', 'sc-hc-all', lo ? 'All, least healthy first' : 'All, healthiest first')); all.type = 'button';
      all.addEventListener('click', () => { Object.assign(F, F0, { sort: lo ? 'fin:all:lo' : 'fin:all', cls: 'Stocks' }); shown = 60; saveF(); SRApp.renderDraw('screener'); const l = document.querySelector('#screener .sc-bar'); if (l) l.scrollIntoView({ block: 'start', behavior: 'smooth' }); });
    }
    S.appendChild(el('p', 'sc-hc-n', 'Companies worth $2 billion or more. Score: the share of ranked companies it beats on profit, cash flow, debt, growth and outlook (0 to 100). A reading of figures, not advice.'));
  }
  // from an asset's page: the list in that field, the asset found and lit up (a sector narrows it to the asset's sector)
  let hlId = null; const finPos = new Map();
  function showRank(id, k, sector) {
    let place;
    if (MA[k]) { const e = maRanks().by.get(+id); if (!e || !e[k]) return false; Object.assign(F, F0, { sort: 'ma:' + k }); saveF(); place = e[k][1]; }
    else if (DV[k]) { const e = dvRanks().by.get(+id); if (!e || !e[k]) return false; Object.assign(F, F0, { sort: 'div:' + k }); saveF(); place = e[k][1]; }
    else {
      const i = finIx(k), P = finRanks(), pl = P && P.by.get(+id); if (i < 0 || !pl || !pl[i]) return false;
      Object.assign(F, F0, { sort: 'fin:' + k, cls: 'Stocks', sec: sector || '' }); saveF();
      place = sector ? P.top.filter((r) => (r.sec || 'Other') === sector).filter((r) => r.f[i] != null).sort(finOrder({ i, lo: false })).findIndex((r) => r.id === +id) + 1 : pl[i];
    }
    shown = Math.max(60, Math.ceil((place + 10) / 60) * 60); hlId = +id;
    if (!(isMac() && left && left.offsetParent !== null)) { try { if (window.SRLive && SRLive.close) SRLive.close(); } catch (e) { /* the page stays */ } if (window.appGo) window.appGo('screener'); }
    // from the top: a redraw puts the page back where it was (runtime.js renderDraw), and the list is then scrolled to the company
    window.scrollTo(0, 0); SRApp.renderDraw('screener');
    setTimeout(() => { const x = document.querySelector(`#screener .sc-list [data-id="${+id}"]`); if (!x) return; x.scrollIntoView({ block: 'center' }); x.classList.add('is-hl'); setTimeout(() => { x.classList.remove('is-hl'); }, 2600); }, 200);
    return true;
  }
  // ---- a row of the list (rebuilt 25 Nov 2026: "not visual enough, very verbose"): who it is and its price, the last three months as
  // a line, the test's record as a ring when there is a signal, then at most three short tags. Support, resistance, stop, target,
  // revenue and P/E are on the asset's own page, one tap away.
  const NS = 'http://www.w3.org/2000/svg', svgEl = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
  const dir = (v) => (v > 0.0005 ? 'up' : v < -0.0005 ? 'down' : '');
  function sparkBox(r) {
    const box = el('span', 'sc-spark'), k = r.k;
    if (!k) {   // no line yet (the scan writes one each night): the three changes instead
      box.classList.add('is-none');
      for (const [lab, v] of [['Today', r.chg], ['5 days', r.c5], ['1 month', r.c20]]) { const c = box.appendChild(el('span', 'sc-ch3')); c.appendChild(el('small', '', lab)); c.appendChild(el('b', dir(v), v == null || !isFinite(v) ? '–' : pct(v))); }
      return box;
    }
    const n = k.length, W = 100, H = 40, y = (ch) => H - 4 - (Math.max(0, B64.indexOf(ch)) / 63) * (H - 8), up = r.c60 != null ? r.c60 >= 0 : B64.indexOf(k[n - 1]) >= B64.indexOf(k[0]);
    const d = [...k].map((ch, i) => (i ? 'L' : 'M') + (i / (n - 1) * W).toFixed(1) + ' ' + y(ch).toFixed(1)).join('');
    const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', 'aria-hidden': 'true' });
    svg.appendChild(svgEl('path', { d: d + `L${W} ${H}L0 ${H}Z`, class: 'sc-spark-a' })); svg.appendChild(svgEl('path', { d, class: 'sc-spark-l' }));
    box.classList.add(up ? 'is-up' : 'is-down'); box.appendChild(svg);
    box.appendChild(el('i', 'sc-spark-d')).style.top = (y(k[n - 1]) / H * 100).toFixed(1) + '%';
    box.classList.add(B64.indexOf(k[0]) >= 32 ? 'is-hi' : 'is-lo');   // the caption goes to the corner the line starts away from
    const cap = box.appendChild(el('span', 'sc-spark-c')); cap.appendChild(el('small', '', '3 months')); if (r.c60 != null) cap.appendChild(el('b', dir(r.c60), pct(r.c60)));
    box.setAttribute('role', 'img'); box.setAttribute('aria-label', 'The last 3 months' + (r.c60 == null ? '' : ': ' + pct(r.c60)));
    return box;
  }
  // the test's record for this kind of asset, as a ring: how often a signal worked
  function ringBox(r) {
    const o = r.od, k = el('span', 'sc-key'), R = 17, C = 2 * Math.PI * R, svg = svgEl('svg', { viewBox: '0 0 44 44', 'aria-hidden': 'true' });
    svg.appendChild(svgEl('circle', { cx: 22, cy: 22, r: R, class: 'sc-ring-t' }));
    svg.appendChild(svgEl('circle', { cx: 22, cy: 22, r: R, class: 'sc-ring-v', 'stroke-dasharray': `${(C * o.win).toFixed(1)} ${C.toFixed(1)}`, transform: 'rotate(-90 22 22)' }));
    const w = k.appendChild(el('span', 'sc-ring')); w.appendChild(svg); w.appendChild(el('b', '', p0(o.win)));
    k.appendChild(el('small', '', 'worked in test'));
    k.title = `Buy signals on ${o.kind ? KINDSAY[o.kind] : 'assets the model was not fitted on'} worked ${p1(o.win)} of the time in the test, against ${p1(o.base)} on any day.`; k.setAttribute('aria-label', k.title);
    return k;
  }
  function healthChip(r) {
    const h = health(r); if (!h) return null;
    const c = el('span', 'sc-hl is-' + h), f = Array.isArray(r.f) && r.f[0] != null ? r.f : null;
    if (f) { const g = c.appendChild(el('span', 'sc-hl-b')); for (let j = 1; j <= 5; j++) g.appendChild(el('i', f[j] == null ? 'is-na' : '')).style.height = (f[j] == null ? 20 : Math.max(14, f[j])) + '%'; }
    c.appendChild(el('span', '', f ? { good: 'Sound finances', mid: 'Mixed finances', weak: 'Weak finances' }[h] : 'Loses money'));
    if (f) c.title = FIN.slice(1).map(([, l], j) => `${l} ${f[j + 1] == null ? 'not scored' : f[j + 1]}`).join(', ') + ` (overall ${f[0]} of 100)`;
    return c;
  }
  // ---- a row, in the phone design ("go for it, build", 25 Nov 2026): logo, symbol and one short line under it, a small line of
  // the last three months, the price and the day's change. Nine fit on a screen instead of three. A tap slides the asset up in a
  // sheet (openSheet) with what the row no longer carries; on a wide window, where the asset's page is beside the list, a tap
  // opens that page as before. The three ranking sorts keep their own strip under the row's head.
  function miniSpark(r) {
    const box = el('span', 'sc-mini'), k = r.k; if (!k) return box;
    const n = k.length, W = 64, H = 28, y = (ch) => H - 3 - (Math.max(0, B64.indexOf(ch)) / 63) * (H - 6);
    const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true' }); svg.appendChild(svgEl('path', { d: [...k].map((ch, i) => (i ? 'L' : 'M') + (i / (n - 1) * W).toFixed(1) + ' ' + y(ch).toFixed(1)).join('') }));
    box.classList.add((r.c60 != null ? r.c60 >= 0 : B64.indexOf(k[n - 1]) >= B64.indexOf(k[0])) ? 'is-up' : 'is-down'); box.appendChild(svg);
    return box;
  }
  const shutOf = (r) => { const M = window.SRLive && SRLive.market && r.id ? SRLive.market(r.id) : null; if (r.id && window.SRLive && SRLive.marketAsk) SRLive.marketAsk([r.id]); return M ? (M.delisted ? 'delisted' : M.tradable === false ? 'not tradable now' : M.open === false ? 'market closed' : '') : ''; };
  const metaOf = (r) => [r.mine ? T('yours') : null, r.cls === 'Stocks' ? r.sec || 'Stock' : CLSNAME[r.cls] || r.cls || (r.mine ? null : r.group), r.cap ? big(r.cap) : null].filter(Boolean);
  const outWhy = (r) => (tooSmall(r) ? 'never tested at this size' : 'weak finances');
  const wideView = () => !!(window.matchMedia && window.matchMedia('(min-width: 1100px)').matches);
  function rowEl(r) {
    const sg = isSig(r), b = el('button', 'sc-row' + (r.id === selId ? ' is-sel' : '') + (sg ? ' is-sig' : '') + (r.id && sheetEl && sheetEl.dataset.id === String(r.id) ? ' is-open' : '')); b.type = 'button'; if (r.id) b.dataset.id = r.id;
    b.addEventListener('click', () => (wideView() ? open(r) : openSheet(r)));
    const a = b.appendChild(el('span', 'sc-a')); if (window.SRLogo) window.SRLogo.lead(a, r.id, r.sym, 34);
    const id = a.appendChild(el('span', 'sc-id')), nm = id.appendChild(el('span', 'sc-nm')); nm.appendChild(el('b', '', r.sym));
    const shut = shutOf(r), out = r.buy && !r.q;   // each row says when its market is shut
    const sub = id.appendChild(el('span', 'sc-sub' + (sg ? ' is-sig' : out ? ' is-out' : ''),
      sg ? `${T('buy')} · ${out ? outWhy(r) : r.od ? p0(r.od.win) : ''}` : out ? `Signal not counted: ${outWhy(r)}` : [r.name || r.group || '', shut].filter(Boolean).join(' · ')));
    if (sg && !out && r.od) { sub.replaceChildren(el('span', 'sc-sub-t', T('buy')), el('span', 'sc-sub-p', ` · ${p0(r.od.win)}`)); sub.classList.add('is-two'); }   // on a narrow phone the words are cut, never the test's figure
    const fs = finSort(), ms = fs ? null : maSort(), ds = fs || ms ? null : dvSort(), strip = (fs && Array.isArray(r.f)) || ms || (ds && r[ds]);
    if (!strip) b.appendChild(miniSpark(r)); else b.appendChild(el('span', 'sc-mini'));
    const v = b.appendChild(el('span', 'sc-v')); v.appendChild(el('b', '', fmt(r.px))); v.appendChild(el('span', 'sc-chg ' + dir(r.chg), pct(r.chg)));
    if (fs && Array.isArray(r.f)) finStrip(b, r, fs); else if (ms) maStrip(b, r, ms); else if (ds && r[ds]) dvStrip(b, r, ds);
    return b;
  }
  // a signal as a card for Today's deck: who it is, the test's record as a ring, the last three months, one tap to the sheet
  function deckCard(r) {
    const b = el('button', 'sc-card'); b.type = 'button'; if (r.id) b.dataset.id = r.id; b.addEventListener('click', () => (wideView() ? open(r) : openSheet(r)));
    const h = b.appendChild(el('span', 'sc-card-h')); if (window.SRLogo) window.SRLogo.lead(h, r.id, r.sym, 40);
    const id = h.appendChild(el('span', 'sc-card-id')); id.appendChild(el('b', '', r.sym)); id.appendChild(el('span', 'g-muted', r.name || r.group || ''));
    if (r.od) h.appendChild(ringBox(r));
    b.appendChild(sparkBox(r));
    const y = b.appendChild(el('span', 'sc-y')); y.appendChild(el('span', 'sc-tag sc-tag-sig', T('buy'))); if (r.od) y.appendChild(el('span', 'sc-card-t g-muted', `${p0(r.od.win)} ${T('tested')}`));
    return b;
  }
  // ---- the asset in a sheet: what the row left out, and the way to its full page ----
  let sheetEl = null;
  const sheetKey = (e) => { if (e.key === 'Escape') closeSheet(); };
  const litRow = (id) => { for (const x of document.querySelectorAll('.sc-row.is-open')) x.classList.remove('is-open'); if (id) for (const x of document.querySelectorAll(`.sc-row[data-id="${+id}"]`)) x.classList.add('is-open'); };
  function closeSheet() { if (!sheetEl) return false; sheetEl.remove(); sheetEl = null; litRow(null); document.removeEventListener('keydown', sheetKey); return true; }
  function openSheet(r) {
    closeSheet();
    const sh = el('div', 'sc-sheet'); sh.id = 'sc-sheet'; sh.setAttribute('role', 'dialog'); sh.setAttribute('aria-modal', 'true'); sh.setAttribute('aria-label', r.sym); if (r.id) sh.dataset.id = r.id;
    const scrim = sh.appendChild(el('button', 'sc-sheet-scrim')); scrim.type = 'button'; scrim.setAttribute('aria-label', T('done')); scrim.addEventListener('click', closeSheet);
    const p = sh.appendChild(el('div', 'sc-sheet-panel')); p.appendChild(el('span', 'sc-sheet-grip'));
    const h = p.appendChild(el('div', 'sc-sheet-head')); if (window.SRLogo) window.SRLogo.lead(h, r.id, r.sym, 44);
    const id = h.appendChild(el('span', 'sc-sheet-id')); id.appendChild(el('b', '', r.sym)); id.appendChild(el('span', 'g-muted', r.name || r.group || ''));
    if (r.id) h.appendChild(starButton({ id: r.id, sym: r.sym, name: r.name }));
    const x = h.appendChild(el('button', 'sc-sheet-x')); x.type = 'button'; x.setAttribute('aria-label', T('done')); x.addEventListener('click', closeSheet);
    { const sv = svgEl('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }); sv.appendChild(svgEl('path', { d: 'M6 6l12 12M18 6L6 18' })); x.appendChild(sv); }
    const px = p.appendChild(el('div', 'sc-sheet-px')); px.appendChild(el('b', '', fmt(r.px))); px.appendChild(el('span', 'sc-chg ' + dir(r.chg), pct(r.chg)));
    const meta = metaOf(r), shut = shutOf(r); if (shut) meta.push(shut); if (meta.length) p.appendChild(el('div', 'sc-sheet-m', meta.join(' · ')));
    p.appendChild(sparkBox(r));
    const sg = isSig(r);
    if (sg && r.od) { const g = p.appendChild(el('div', 'sc-sheet-sig')); g.appendChild(ringBox(r)); const w = g.appendChild(el('span', 'sc-sheet-sigt')); w.appendChild(el('b', '', T('buy'))); w.appendChild(el('span', 'g-muted', `${p0(r.od.win)} ${T('tested')}`)); }
    const y = p.appendChild(el('div', 'sc-y'));
    if (r.buy && !r.q) y.appendChild(el('span', 'sc-tag sc-tag-out', (sg ? '' : 'Signal not counted: ') + (tooSmall(r) ? (sg ? 'Never tested at this size' : 'never tested at this size') : (sg ? 'Weak finances' : 'weak finances'))));
    const shp = shape(r); if (shp) y.appendChild(el('span', 'sc-tag' + (shp[1] ? ' is-' + shp[1] : ''), shp[0]));
    if (!(r.buy && !r.q && !tooSmall(r))) { const hc = healthChip(r); if (hc) y.appendChild(hc); }
    if (!y.childNodes.length) y.remove();
    const st = p.appendChild(el('div', 'sc-sheet-stats'));
    for (const [lab, val, cls] of [[T('m3'), r.c60 == null ? (r.c20 == null ? '–' : pct(r.c20)) : pct(r.c60), dir(r.c60 == null ? r.c20 : r.c60)], ['RSI', r.rsi == null ? '–' : String(Math.round(r.rsi)), ''], [T('mcap'), r.cap ? big(r.cap) : '–', '']]) { const c = st.appendChild(el('span')); c.appendChild(el('small', '', lab)); c.appendChild(el('b', cls, val)); }
    const go = p.appendChild(el('button', 'sc-sheet-open', T('openFull'))); go.type = 'button'; go.addEventListener('click', () => { closeSheet(); open(r); });
    document.body.appendChild(sh); sheetEl = sh; litRow(r.id); document.addEventListener('keydown', sheetKey);
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
    // the list near the top (the audit of 24 Nov 2026: it started after 1.5 screens): the search, the world's markets as one row
    // to swipe, the sort and the filters, then the list; the sectors' tiles, the health ranking and how it all works come after it
    const sb = box.appendChild(el('button', 'sc-search', T('search'))); sb.type = 'button';
    sb.addEventListener('click', () => { const x = document.getElementById('btn-search'); if (x) x.click(); });
    const rec = wide ? wide.record || {} : {}, U = wide && wide.universe ? wide.universe : null;
    const later = [], keep = (node, key) => { node.addEventListener('scroll', () => { scrollX[key] = node.scrollLeft; }, { passive: true }); later.push(() => { node.scrollLeft = scrollX[key] || 0; }); };
    const pick = (ch) => { Object.assign(F, ch); shown = 60; hlId = null; allMemo = null; saveF(); SRApp.renderDraw('screener'); };
    // the kinds of asset as tabs, always in view (Matteo, 25 Nov 2026: "the categorization should be clearer")
    const tabs = box.appendChild(el('div', 'sc-tabs')); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Kind of asset'); keep(tabs, 'tabs');
    for (const [val, lab] of CLS) { const on = F.cls === val, t = tabs.appendChild(el('button', 'sc-tab' + (on ? ' is-on' : '') + (val === '@watch' ? ' sc-tab-w' : ''), (val === '@watch' ? '★ ' : '') + T(lab))); t.type = 'button'; t.setAttribute('role', 'tab'); t.setAttribute('aria-selected', String(on)); t.dataset.cls = val;
      t.addEventListener('click', () => pick({ cls: val, sec: val === 'Stocks' ? F.sec : '' })); }
    // the day's change as coloured tiles: the world, then the eleven sectors (the same funds as the ranking)
    // before an asset's market has traded today its last session's change is shown, with that day's name, in paler colours (as eToro does), not 0.0%
    const UN = new Map(universe().map((u) => [u.sym, u]));
    const moveOf = (r) => { const u = UN.get(r.sym), d = SRApp._store[r.sym], RR = (u && u.rows) || r.rows || (d && Array.isArray(d.data) ? d.data : null); return tooOld(r.sym, RR) ? null : dayMove(RR, r.id); };
    // each grid in the order of the day's change: the most red first, the most green last (redrawn with the prices); not yet known: at the end
    const sorted = (items) => items.map((x) => Object.assign(x, { m: moveOf(x.r) })).sort((a, b) => (a.m == null) - (b.m == null) || (a.m ? a.m.chg : 0) - (b.m ? b.m.chg : 0));
    const heat = (m) => `color-mix(in srgb, var(--color-${m.chg >= 0 ? 'ok' : 'bad'}) ${Math.round(Math.min(55, Math.abs(m.chg) * 1800) * (m.day ? 0.55 : 1))}%, var(--color-panel))`;
    const tile = (map, r, short, m) => {
      const t = map.appendChild(el('button', 'sc-tile' + (r.id === selId ? ' is-sel' : ''))); t.type = 'button'; t.title = r.name; if (r.id) t.dataset.id = r.id; t.addEventListener('click', () => open(r));
      t.appendChild(el('b', '', r.sym)); const v = t.appendChild(el('span', '', m ? pct(m.chg) : '…')); if (m && m.day) { v.appendChild(el('i', 'sc-day', ' ' + m.day)); t.title = `${r.name || r.sym}: ${m.day}'s change. Its market has not traded yet today.`; t.classList.add('is-last'); }
      if (short) t.appendChild(el('small', '', short));
      if (m) t.style.background = heat(m);
    };
    const strip = (cap, key, cls) => { const w = box.appendChild(el('div', 'sc-strip-w' + (cls ? ' ' + cls : ''))); w.appendChild(el('span', 'sc-strip-c', cap)); const m = w.appendChild(el('div', 'sc-map sc-strip')); keep(m, key); return m; };
    const bySym = new Map(R.map((r) => [r.sym, r])), extra = el('div', 'sc-extra');
    if (F.cls !== 'Stocks') { const map = strip(T('world'), 'world'); for (const x of sorted(R.filter((r) => r.group === 'World').map((r) => ({ r })))) tile(map, x.r, null, x.m); }
    // the sectors, in view at once and in a fixed order: a tap lists that sector's companies, a second tap lets go
    // (Matteo, 25 Nov 2026: "you removed the tabs of the sector, that should be visible immediately, like the rest")
    if (!F.cls || F.cls === 'Stocks') {
      const map = strip(T('sectors'), 'sec', 'is-grid');   // the phone design: a grid of tiles, all in view
      for (const [sym, short, name] of TILES[0][1]) {
        const r = bySym.get(sym) || { sym, id: SRApp.idOf(sym), name, A: null }, m = moveOf(r), sec = SECTOR[sym], on = F.sec === sec;
        const t = map.appendChild(el('button', 'sc-tile sc-sect' + (on ? ' is-on' : ''))); t.type = 'button'; t.dataset.sec = sec; t.setAttribute('aria-pressed', String(on)); t.title = `${name}: ${on ? 'back to every sector' : 'list its companies'}`;
        t.appendChild(el('b', '', SECKEY[sym] ? T(SECKEY[sym]) : short)); const v = t.appendChild(el('span', '', m ? pct(m.chg) : '…')); if (m && m.day) { v.appendChild(el('i', 'sc-day', ' ' + m.day)); t.classList.add('is-last'); }
        if (m) t.style.background = heat(m);
        t.addEventListener('click', () => pick({ sec: on ? '' : sec }));
      }
    }
    const sectors = SRApp.disclosure(extra, 'market-sectors', 'Sectors and industries', 'weakest to strongest today');
    for (const [head, list] of TILES) {
      sectors.appendChild(el('div', 'sc-maph', head)); const m2 = sectors.appendChild(el('div', 'sc-map sc-map2'));
      for (const x of sorted(list.map(([sym, short, name]) => ({ r: bySym.get(sym) || { sym, id: SRApp.idOf(sym), name, A: null }, short })))) tile(m2, x.r, x.short, x.m);
    }
    finCard(SRApp.disclosure(extra, 'market-health', 'Financial health', 'the healthiest and least healthy companies'));
    const how = extra.appendChild(howBox());
    const scan = wide ? `Scan: ${wide.scanned} assets on ${String(wide.made).slice(0, 10)}. Ideas: ${rec.worked || 0} worked, ${rec.failed || 0} failed, ${rec.open || 0} open.` : 'The wider scan is unavailable.';
    how.insertBefore(el('p', '', scan + (U && U.next > U.limit ? ` Adds up to ${U.next - U.limit} assets per night.` : '')), how.children[1]);
    // one row: signals only, the order, the other filters
    const nOn = ['size', 'sales', 'rsi'].filter((k) => F[k]).length;
    const bar = box.appendChild(el('div', 'sc-bar')), fb = el('div', 'sc-filters');
    { const sgb = bar.appendChild(el('button', 'sc-chip' + (F.sig ? ' is-on' : ''), T('signals'))); sgb.type = 'button'; sgb.setAttribute('aria-pressed', String(!!F.sig)); sgb.title = 'Only the assets with a buy signal now'; sgb.addEventListener('click', () => pick({ sig: F.sig ? '' : 'buy' })); }
    const sel = (key, first, opts, cls) => {
      const s = (first ? fb : bar).appendChild(el('select', 'sc-sel' + (cls ? ' ' + cls : ''))); s.setAttribute('aria-label', first || 'Sort'); if (first) s.appendChild(new Option(first, ''));
      for (const [val, lab] of opts) s.appendChild(new Option(lab, val));
      s.value = F[key]; if (s.value !== F[key]) { F[key] = first ? '' : opts[0][0]; s.value = F[key]; }
      s.classList.toggle('is-on', !!first && !!F[key]); s.addEventListener('focus', () => { selAt = Date.now(); });
      s.addEventListener('change', () => { F[key] = s.value; hlId = null; shown = 60; saveF(); s.blur(); SRApp.renderDraw('screener'); });
      return s;
    };
    sel('sort', '', Object.entries(SORTS).map(([k, x]) => [k, T('sort') + ': ' + x[0]]), 'sc-sortsel');
    const ft = bar.appendChild(el('button', 'sc-ftog' + (nOn ? ' is-on' : ''), nOn ? `${T('filters')} · ${nOn}` : T('filters'))); ft.type = 'button'; ft.setAttribute('aria-expanded', String(filtOpen));
    ft.addEventListener('click', () => { filtOpen = !filtOpen; SRApp.renderDraw('screener'); });
    if (filtOpen) box.appendChild(fb);
    sel('size', 'Any market value', [['liq', 'No shares under $2B']].concat(Object.entries(SIZE).map(([k, x]) => [k, x[0]])));
    sel('sales', 'Any revenue', Object.entries(SALES).map(([k, x]) => [k, x[0]]));
    sel('rsi', 'Any RSI', Object.entries(RSIB).map(([k, x]) => [k, x[0]]));
    const fsN = finSort(), msN = maSort(), dsN = dvSort(), P0 = fsN ? finRanks() : null;
    const L = fsN ? ALL.filter(pass).filter((r) => { const p = P0 && P0.by.get(r.id); return p && p[fsN.i]; }).sort(finOrder(fsN))
      : dsN ? ALL.filter(pass).filter((r) => r[dsN]).sort(dvCmp(dsN))
      : msN ? ALL.filter(pass).filter((r) => r[msN.k] != null && isFinite(r[msN.k])).sort((a, b) => (msN.lo ? a[msN.k] - b[msN.k] : b[msN.k] - a[msN.k]))
      : ALL.filter(pass).sort(F.cls === '@watch' && (!F.sort || F.sort === 'rank') ? watchOrder() : (SORTS[F.sort] || SORTS.rank)[1]), active = Object.keys(F0).some((k) => F[k] !== F0[k]);
    const nSig = L.reduce((x, r) => x + (isSig(r) ? 1 : 0), 0), plain = !fsN && !msN && !dsN;
    // the signals left out or let in (too small to have been tested, weak finances), among the assets the other filters keep
    const nOut = plain ? ALL.reduce((x, r) => x + (r.buy && !r.q && pass(Object.assign(Object.create(r), { q: true })) ? 1 : 0), 0) : 0;
    const cnt = box.appendChild(el('div', 'sc-count')); cnt.appendChild(el('span', 'sc-count-n', fsN ? `${L.length.toLocaleString('en-US')} companies ranked on ${FIN[fsN.i][1].toLowerCase()}${fsN.lo ? ', from the last place up' : ''}` : msN ? `${L.length.toLocaleString('en-US')} assets ranked by their distance from the ${MA[msN.k]}${msN.lo ? ', from the last place up' : ''}` : dsN ? `${L.length.toLocaleString('en-US')} assets with a ${DV[dsN]} now, strongest first (score 0-100)` : F.sig ? `${T('signals')} ${nSig}` : `${T('signals')} ${nSig} · ${L.length.toLocaleString('en-US')} ${L.length === 1 && T('assets') === 'assets' ? 'asset' : T('assets')}`));
    if (active) { const rb = cnt.appendChild(el('button', 'sc-reset', T('reset'))); rb.type = 'button'; rb.addEventListener('click', () => { Object.assign(F, F0); shown = 60; hlId = null; saveF(); SRApp.renderDraw('screener'); }); }
    if (nOut) { const qb = cnt.appendChild(el('button', 'sc-q', F.q === 'all' ? `Counting ${nOut} on tiny or weak companies. Leave them out` : `${nOut} more on tiny or weak companies. Count them`)); qb.type = 'button'; qb.setAttribute('aria-pressed', String(F.q === 'all')); qb.addEventListener('click', () => pick({ q: F.q === 'all' ? '' : 'all' })); }
    finPos.clear(); if (fsN) L.forEach((r, k) => finPos.set(r.id, [fsN.lo ? L.length - k : k + 1, L.length]));
    maPos.clear(); if (msN) L.forEach((r, k) => maPos.set(r.id, [msN.lo ? L.length - k : k + 1, L.length]));
    dvPos.clear(); if (dsN) L.forEach((r, k) => dvPos.set(r.id, [k + 1, L.length]));
    if (plain && L.length) {   // Symbol · 3 months · Price · Today, each a button that sorts (the picture Matteo sent on 26 Nov 2026)
      const hd = box.appendChild(el('div', 'sc-head')); hd.setAttribute('role', 'group'); hd.setAttribute('aria-label', T('sort'));
      for (const [label, cls, first, second] of [[T('symbol'), 'sc-th-a', 'az', 'za'], [T('m3'), 'sc-th-m', 'm3', 'm3Lo'], [T('price'), 'sc-th-p', 'px', 'pxLo'], [T('today'), 'sc-th-c', 'day', 'dayLo']]) {
        const on = F.sort === first ? 1 : F.sort === second ? 2 : 0, hb = hd.appendChild(el('button', 'sc-th ' + cls + (on ? ' is-on' : ''))); hb.type = 'button'; hb.dataset.sort = first; hb.setAttribute('aria-pressed', String(!!on));
        hb.appendChild(el('span', '', label)); if (on) hb.appendChild(el('i', '', (first === 'az') === (on === 1) ? '▴' : '▾'));
        hb.addEventListener('click', () => pick({ sort: on === 1 ? second : on === 2 ? 'rank' : first }));
      }
    }
    const list = box.appendChild(el('div', 'sc-list')), vis = L.slice(0, shown);
    for (const r of vis) { const x = list.appendChild(rowEl(r)); if (r.id === hlId) x.classList.add('is-hl-keep'); }
    if (!L.length) list.appendChild(el('p', 'g-muted', 'No asset matches these filters.'));
    if (F.cls === '@watch') {   // the watchlist's own words: empty, or some of its assets are outside tonight's scan
      const S = starred(), have = new Set(ALL.map((r) => +r.id)), miss = wide ? S.filter((x) => !have.has(+x.id)) : [];
      if (!S.length) { list.replaceChildren(); const e = list.appendChild(el('div', 'sc-wempty')); e.appendChild(el('b', '', 'Your watchlist is empty')); e.appendChild(el('p', 'g-muted', 'Open any asset and tap its star to follow it here.')); }
      else if (miss.length) { const m = box.appendChild(el('div', 'sc-wmiss')); m.appendChild(el('span', 'g-muted', 'Not in the nightly scan:')); for (const x of miss) { const mb = m.appendChild(el('button', 'sc-tab', x.s || String(x.id))); mb.type = 'button'; mb.addEventListener('click', () => open({ id: x.id, sym: x.s, name: x.n })); } }
    }
    if (L.length > shown) { const mb = box.appendChild(el('button', 'sc-more', `${T('more')} (${(L.length - shown).toLocaleString('en-US')})`)); mb.type = 'button'; mb.addEventListener('click', () => { shown += 60; SRApp.renderDraw('screener'); }); }
    // live prices: this device's own assets, and the scanned ones that are on screen
    if (window.SRLive && window.SRLive.want) window.SRLive.want('screen', [...R.map((r) => r.id), ...vis.filter((r) => r.scanned).slice(0, 40).map((r) => r.id)].filter(Boolean));
    box.appendChild(extra);
    box.appendChild(el('p', 'g-hint', 'The line is the last 3 months. The ring is how often a buy signal worked in the test for that kind of asset. Market value and finances are eToro\'s figures, in dollars. A scanned asset shows the scan\'s price until its live one arrives. Analysis, not advice.'));
    for (const f of later) f();
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
  dash.onData(() => setTimeout(prepare, 1200));   // new histories: their analyses are prepared in idle moments
  // 20 s after the start (what the screen needs first goes first), then every 30 minutes: the likely next pages are loaded ahead
  const ahead = () => { try { const ids = [...((prac && prac.open) || []).map((t) => +t.id), ...top(6).map((r) => +r.id)]; if (window.SRLive && SRLive.preload) SRLive.preload(ids); } catch (e) { /* not ready */ } };
  setTimeout(ahead, 20000); setInterval(ahead, 30 * 60e3);

  // ---- Rankings (Markets, second part; Matteo, 24 Nov 2026: "organisation of the tabs, so that info are easier to reach") ----
  // Every ranking the app keeps was a line in a list of 25 sorts. Here each one shows its first three, and a tap opens the whole
  // list in the screener, sorted that way. Shares under $2 billion are left out of these lists, here and in the list a tap opens
  // (the size choice "No shares under $2B"): a list led by penny shares says little.
  const RANKS = [
    ['Signals', [['rank', 'Strongest buy signals', (r) => 'score ' + sc100(r.ms)], ['rr', 'Best reward for the risk', (r) => (r.rr != null ? r.rr.toFixed(1) + '×' : '')]]],
    ['RSI divergence', [['div:dvb', 'Bullish divergence', (r) => 'score ' + Math.round(r.dvb.s)], ['div:dve', 'Bearish divergence', (r) => 'score ' + Math.round(r.dve.s)]]],
    ['Distance from the 200-day average', [['ma:m200:lo', 'Furthest below', (r) => pct(r.m200)], ['ma:m200', 'Furthest above', (r) => pct(r.m200)]]],
    ['Distance from the 50-day average', [['ma:m50:lo', 'Furthest below', (r) => pct(r.m50)], ['ma:m50', 'Furthest above', (r) => pct(r.m50)]]],
    ['Financial health', [['fin:all', 'Healthiest', (r) => String(r.f[0])], ['fin:all:lo', 'Least healthy', (r) => String(r.f[0])]]],
    ['RSI', [['rsiLo', 'Lowest (oversold)', (r) => 'RSI ' + Math.round(r.rsi)], ['rsiHi', 'Highest (overbought)', (r) => 'RSI ' + Math.round(r.rsi)]]],
    ['Today', [['day', 'Best today', (r) => pct(r.chg)], ['dayLo', 'Worst today', (r) => pct(r.chg)]]],
    ['One month', [['c20', 'Best month', (r) => pct(r.c20)]]],
  ];
  function topOf(sort, n) {
    const A = all().filter(liquid), fm = /^fin:(\w+)(:lo)?$/.exec(sort), mm = /^ma:(m50|m200)(:lo)?$/.exec(sort), dm = /^div:(dvb|dve)$/.exec(sort);
    let L;
    if (fm) { const i = finIx(fm[1]), P = finRanks(); if (i < 0 || !P) return []; L = A.filter((r) => { const pl = P.by.get(r.id); return pl && pl[i]; }).sort(finOrder({ i, lo: !!fm[2] })); }
    else if (dm) L = A.filter((r) => r[dm[1]]).sort(dvCmp(dm[1]));
    else if (mm) L = A.filter((r) => r[mm[1]] != null && isFinite(r[mm[1]])).sort((a, b) => (mm[2] ? a[mm[1]] - b[mm[1]] : b[mm[1]] - a[mm[1]]));
    else if (sort === 'rank') L = A.filter((r) => r.buy).sort(rankOrder);
    else if (sort === 'rr') L = A.filter((r) => r.buy && r.rr != null && isFinite(r.rr)).sort(SORTS.rr[1]);
    else { const f = { rsiLo: 'rsi', rsiHi: 'rsi', day: 'chg', dayLo: 'chg', c20: 'c20' }[sort]; L = A.filter((r) => !f || (r[f] != null && isFinite(r[f]))).sort((SORTS[sort] || SORTS.rank)[1]); }
    return L.slice(0, n);
  }
  function openRank(sort) { Object.assign(F, F0, { sort, size: 'liq', sig: sort === 'rr' ? 'buy' : '' }); saveF(); shown = 60; if (window.appGo) window.appGo('screener'); else if (window.appShowTab) window.appShowTab('markets', 0); window.scrollTo(0, 0); SRApp.renderDraw('screener'); }
  dash.draw('ranks', (root) => {
    const box = d3.select(root).html('').node();
    if (!all().length) { box.appendChild(el('div', 'g-hint', 'The rankings come with the list of assets: one moment.')); return true; }
    box.appendChild(el('h2', 'g-h2', 'Rankings'));
    box.appendChild(el('p', 'g-hint rk-note', `The first three of each list. A tap on a title opens the whole list.${wide && wide.made ? ` From the scan of ${new Date(wide.made).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}, moved with live prices.` : ''}`));
    for (const [group, lists] of RANKS) {
      const tops = lists.map(([k, t, say]) => [k, t, say, topOf(k, 3)]).filter((x) => x[3].length); if (!tops.length) continue;
      const g = box.appendChild(el('section', 'rk-g')); g.appendChild(el('h3', 'rk-gh', group));
      const cols = g.appendChild(el('div', 'rk-cols'));
      for (const [k, t, say, L] of tops) {
        const c = cols.appendChild(el('div', 'rk-c')); c.dataset.rank = k;
        const h = c.appendChild(el('button', 'rk-h')); h.type = 'button'; h.appendChild(el('span', '', t)); h.appendChild(el('span', 'rk-all', 'All')); h.addEventListener('click', () => openRank(k));
        L.forEach((r, i) => { const b = c.appendChild(el('button', 'rk-r')); b.type = 'button'; b.dataset.id = r.id; b.addEventListener('click', () => open(r));
          b.appendChild(el('span', 'rk-n', String(i + 1))); const a = b.appendChild(el('span', 'rk-a')); if (window.SRLogo) window.SRLogo.lead(a, r.id, r.sym, 20); a.appendChild(el('b', '', r.sym)); a.appendChild(el('span', 'g-muted', r.name || r.group || ''));
          let v = ''; try { v = say(r); } catch (e) { v = ''; } const vv = b.appendChild(el('b', 'rk-v', v)); if (/^[+−-]/.test(v)) vv.classList.add(/^\+/.test(v) ? 'up' : 'down'); });
      }
    }
    box.appendChild(el('p', 'g-hint', 'Shares under $2 billion are left out of these lists. A ranking is a reading of figures, not advice.'));
    return true;
  });
  window.SRScreen = { watch: { list: starred, has: isStar, toggle: toggleStar, button: starButton }, closeSheet, sheet: openSheet, deckCard, fin: finOf, finRanks, ma: maOf, maRanks, dv: dvRankOf, dvRanks, dvSay, showRank, topOf, openRank, prepare, known, dayMove, scanMade: () => (wide ? wide.made : null), packs: () => packSet, rows, all, load, open, SHORT, top, loadWide, filters: F, odds: oddsText, count: () => all().length, record: () => (wide ? wide.record : null), loadPractice, practice: () => prac, review: () => review, audit: () => audit, vmSilent, demoWatch, demo: () => ({ p: demo, at: demoAt, err: demoErr, hist, curve }) };
})();
