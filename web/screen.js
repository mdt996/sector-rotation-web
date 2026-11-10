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
  // the world board's daily candles are kept 2 hours on the device (the live price still updates the last candle): reopening the app does not spend 15 of eToro's 60 reads a minute
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
  async function loadWide(force) {
    if (wideBusy || !window.SRSync || !window.SRSync.getFile || (!force && Date.now() - wideAt < 20 * 60e3)) return;
    wideBusy = true;
    try { const j = await window.SRSync.getFile('scan.json'); if (j && j.rows) { wide = j; packSet = new Set(j.packs || []); } } catch (e) { /* keeps the last one */ }
    wideAt = Date.now(); wideBusy = false; SRApp.renderDraw('screener'); SRApp.renderDraw('today');
  }
  // ---- the ranking: how often the exact situation worked in the history test (tools/ta/bt_rank.js and rank_final.js) ----
  const RK = () => (window.SR_TASTATS || {}).rank || { cells: {}, n: 0, assets: 0, grades: {}, not: {} };
  const GR = { A: 'clean chart', B: 'contested chart', M: 'sell signal too' };
  // sigs = every signal of the last 5 days ({ id, ago }). Mixed: a tested sell signal in the last 3 days. Clean: at most one bearish signal of any kind. Contested: two or more.
  function judge(sigs) {
    const S = stats(), SIDE = window.SRTA.SIDE, ok3 = sigs.filter((x) => x.ago <= 3 && S[x.id] && S[x.id].ok);
    const buys = ok3.filter((x) => SIDE[x.id] > 0), sells = ok3.filter((x) => SIDE[x.id] < 0), bear = sigs.filter((x) => SIDE[x.id] < 0).length, bull = sigs.filter((x) => SIDE[x.id] > 0).length;
    const g = sells.length ? 'M' : bear <= 1 ? 'A' : 'B', C = RK().cells; let best = null;
    for (const x of buys) {
      let c = C[x.id + '|' + g + '|' + (x.ago ? 1 : 0)] || null;
      if (!c && g !== 'M' && x.ago === 0) { const q = S[x.id]; c = { n: q.n, win: q.win, base: q.base, edge: q.edge, ok: true, score: Math.max(0, Math.min(q.p1, q.p2)) }; }   // triangle and wedge breakouts: measured on the day itself only
      const y = { id: x.id, ago: x.ago, date: x.date || null, g, cell: c, score: c && c.ok ? c.score : 0, edge: c ? c.edge : -1 };
      if (!best || y.score > best.score || (y.score === best.score && y.edge > best.edge)) best = y;
    }
    return { buy: best, sell: sells.sort((x, y) => x.ago - y.ago)[0] || null, nb: buys.length, bear, bull };
  }
  // one list for everything: this device's own analysis (yours, the funds, the world board: live) and the nightly scan
  function all() {
    const M = new Map(), out = [], seen = new Set(), Q = window.SRLive ? window.SRLive.quotes : new Map(), today = new Date().toISOString().slice(0, 10);
    if (wide) for (const r of wide.rows) M.set(r.id, r);
    for (const r of rows()) {
      if (!r.A) continue; const m = M.get(r.id) || {}, A = r.A; seen.add(r.id);
      out.push({ sym: r.sym, id: r.id, name: r.name, group: r.group, mine: r.group === 'Yours', cls: m.cls || (r.group === 'Funds' ? 'ETF' : null), sec: m.sec || null, cap: m.cap || null, sales: m.sales || null, pe: m.pe || null, pop: m.pop || null, px: r.px, chg: r.chg, c5: A.chg5, c20: A.chg20, rsi: A.rsi,
        sup: r.sup, res: r.res, rr: A.rr, stop: A.sup ? A.sup.p - 0.5 * A.atr : null, target: A.res ? A.res.p : null, last: A.date, J: judge(A.signals), live: true });
    }
    if (wide) for (const r of wide.rows) {
      if (seen.has(r.id)) continue;
      const q = Q.get(r.id), px = q && q.price > 0 ? q.price : r.px, chg = q && q.price > 0 && r.px ? (r.d < today ? px / r.px - 1 : (1 + r.c1) * px / r.px - 1) : r.c1;
      out.push({ sym: r.s, id: r.id, name: r.n, group: r.g, mine: false, cls: r.cls || null, sec: r.sec || null, cap: r.cap || null, sales: r.sales || null, pe: r.pe || null, pop: r.pop || null, px, chg, c5: r.c5, c20: r.c20, rsi: r.rsi,
        sup: r.sup ? r.sup.d : null, res: r.res ? r.res.d : null, rr: r.rr, stop: r.stop == null ? null : r.stop, target: r.target == null ? null : r.target, last: r.d, J: judge(r.sig || []), live: !!q, scanned: true });
    }
    return out;
  }
  const tier = (r) => (r.J.buy ? (r.J.buy.score > 0 ? 0 : 1) : 2);
  // 1. situations that passed the test, best first (then freshest); 2. signals whose situation showed no edge; 3. no signal: nearest to its support first
  const rankOrder = (a, b) => tier(a) - tier(b) || (a.J.buy && b.J.buy ? b.J.buy.score - a.J.buy.score || a.J.buy.ago - b.J.buy.ago || b.J.buy.edge - a.J.buy.edge : 0) || (b.sup == null ? -9 : b.sup) - (a.sup == null ? -9 : a.sup);
  // the home page's shortlist: the best-ranked situations that passed the test
  function top(n) { return all().filter((r) => tier(r) === 0).sort(rankOrder).slice(0, n).map((r) => ({ ...r, buy: r.J.buy })); }
  function rows() {
    const S = stats(), out = [], today = new Date().toISOString().slice(0, 10);
    for (const u of universe()) {
      if (!u.rows || u.rows.length < 260) { if (u.group === 'World') out.push({ ...u, A: null }); continue; }
      const n = u.rows.length, key = n + '|' + u.rows[n - 1].date; let c = cache.get(u.sym);
      if (!c || c.key !== key) { c = { key, A: window.SRTA.analyze(u.rows) }; cache.set(u.sym, c); }
      const A = c.A; if (!A) continue;
      const q = window.SRLive && window.SRLive.quotes.get(u.id), px = q ? q.price : A.price, prev = u.rows[n - 1].date >= today && n > 1 ? u.rows[n - 2].close : u.rows[n - 1].close;
      const sig = A.signals.filter((x) => x.ago <= 3 && S[x.id] && S[x.id].ok);
      const buy = sig.filter((x) => x.side > 0).sort((a, b) => S[b.id].edge - S[a.id].edge)[0] || null, sell = sig.filter((x) => x.side < 0)[0] || null;
      out.push({ ...u, A, px, chg: px / prev - 1, buy, sell, sup: A.sup ? A.sup.p / px - 1 : null, res: A.res ? A.res.p / px - 1 : null, score: buy ? S[buy.id].edge : 0 });
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
  const ago = (x) => (x.ago === 0 ? 'today' : x.ago === 1 ? 'yesterday' : x.ago + ' days ago');
  // the day a signal fired, in words. A scanned row only knows "n candles before its last one": the date is walked back over weekdays (every day for crypto).
  const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], iso = (d) => d.toISOString().slice(0, 10);
  function when(r, x) {
    let date = x.date;
    if (!date && r.last) { const d = new Date(r.last + 'T12:00:00Z'); for (let k = x.ago; k > 0;) { d.setUTCDate(d.getUTCDate() - 1); if (r.cls === 'Crypto' || (d.getUTCDay() !== 0 && d.getUTCDay() !== 6)) k--; } date = iso(d); }
    if (!date) return ago(x);
    const now = new Date(), y = new Date(now.getTime() - 864e5), d = new Date(date + 'T12:00:00Z');
    return date === iso(now) ? 'today' : date === iso(y) ? 'yesterday' : DAY[d.getUTCDay()] + ' ' + d.getUTCDate();
  }
  const big = (x) => '$' + (x >= 1e12 ? (x / 1e12).toFixed(x >= 1e13 ? 0 : 1) + 'T' : x >= 1e9 ? (x / 1e9).toFixed(x >= 1e11 ? 0 : 1) + 'B' : Math.max(1, Math.round(x / 1e6)) + 'M');
  const p1 = (x) => (x * 100).toFixed(1) + '%';
  // filters and sorting, kept on the device
  const FK = 'sr.scf', F0 = { sort: 'rank', cls: '', sec: '', size: '', sales: '', rsi: '', sig: '' }, F = { ...F0 };
  try { const j = JSON.parse(localStorage.getItem(FK) || '{}'); for (const k of Object.keys(F0)) if (typeof j[k] === 'string') F[k] = j[k]; } catch (e) { /* defaults */ }
  const saveF = () => { try { localStorage.setItem(FK, JSON.stringify(F)); } catch (e) { /* not kept */ } };
  let shown = 60, howOpen = false, filtOpen = false, selAt = 0;
  const SIZE = { mega: ['Over $200B', 200e9, Infinity], large: ['$10B to $200B', 10e9, 200e9], mid: ['$2B to $10B', 2e9, 10e9], small: ['Under $2B', 0, 2e9] };
  const SALES = { big: ['Revenue over $50B', 50e9, Infinity], mid: ['Revenue $5B to $50B', 5e9, 50e9], small: ['Revenue under $5B', 0, 5e9] };
  const RSIB = { lo: ['RSI below 30', 0, 30], mlo: ['RSI 30 to 50', 30, 50], mhi: ['RSI 50 to 70', 50, 70], hi: ['RSI above 70', 70, 101] };
  const SIG = { buy: 'Buy: passed the test', fresh: 'Buy: passed, fresh', any: 'Buy: any tested signal', sell: 'Sell: tested signal' };   // all within the last 3 days; fresh = fired at the latest close
  const inB = (v, B) => v != null && v >= B[1] && v < B[2];
  function pass(r) {
    if (F.cls === '@mine' ? !r.mine : F.cls && r.cls !== F.cls) return false;
    if (F.sec && !(r.cls === 'Stocks' && r.sec === F.sec)) return false;
    if (F.size && !inB(r.cap, SIZE[F.size])) return false;
    if (F.sales && !inB(r.sales, SALES[F.sales])) return false;
    if (F.rsi && !inB(r.rsi, RSIB[F.rsi])) return false;
    const b = r.J.buy;
    if (F.sig === 'buy' && !(b && b.score > 0)) return false;
    if (F.sig === 'fresh' && !(b && b.score > 0 && b.ago === 0)) return false;
    if (F.sig === 'any' && !b) return false;
    if (F.sig === 'sell' && !r.J.sell) return false;
    return true;
  }
  const by = (f, dir) => (a, b) => { const x = f(a), y = f(b), nx = x == null || !isFinite(x), ny = y == null || !isFinite(y); return nx - ny || (nx ? 0 : dir * (x - y)); };   // assets without the figure go last
  const SORTS = { rank: ['our ranking', rankOrder], cap: ['market value, largest first', by((r) => r.cap, -1)], pop: ['most followed on eToro first', by((r) => r.pop, 1)], sales: ['revenue, largest first', by((r) => r.sales, -1)], rsiLo: ['RSI, lowest first', by((r) => r.rsi, 1)], rsiHi: ['RSI, highest first', by((r) => r.rsi, -1)],
    day: ['today, best first', by((r) => r.chg, -1)], dayLo: ['today, worst first', by((r) => r.chg, 1)], c5: ['5 days, best first', by((r) => r.c5, -1)], c20: ['1 month, best first', by((r) => r.c20, -1)], sup: ['nearest support', by((r) => r.sup, -1)], res: ['nearest resistance', by((r) => r.res, 1)],
    rr: ['reward to risk, highest first', by((r) => r.rr, -1)], pe: ['P/E, lowest first', by((r) => (r.pe > 0 ? r.pe : null), 1)] };
  const cellName = (k) => { const [id, g, fr] = k.split('|'); return (SHORT[id] || id) + ', ' + (fr === '1' ? '1 to 3 days old' : 'fresh') + ', ' + GR[g]; };
  function howBox() {
    const R = RK(), N = R.not || {}, d = el('details', 'sc-how'); d.open = howOpen; d.addEventListener('toggle', () => { howOpen = d.open; });
    d.appendChild(el('summary', '', 'How the ranking works'));
    const P = (t) => d.appendChild(el('p', '', t)), n = (x) => (x || 0).toLocaleString('en-US');
    P('1. First come the assets where a buy signal that passed the history test fired in the last 3 days. Four passed: trendline break, RSI divergence, Fibonacci pullback, RSI below 30.');
    P(`2. Their order is how often that exact situation worked in the test: the signal, its age (fresh = fired at the latest close, or 1 to 3 days old) and the rest of the chart (clean = at most one bearish signal in the last 5 days; contested = two or more; mixed = a tested sell signal at the same time). The test: ${n(R.n)} readings on ${R.assets} assets since the 1990s. "Worked" = up 2 ATR before down 2 ATR within 20 days, buying at the next open. Buying on any day worked ${R.all ? p1(R.all.base) : '54%'}. The rank is the edge in the weaker of the two test periods (to 2014, from 2015), so one lucky period cannot lift it.`);
    const t = d.appendChild(el('div', 'sc-howt')); t.appendChild(el('b', '', 'Situation, best first')); t.appendChild(el('b', 'sc-n', 'Worked')); t.appendChild(el('b', 'sc-n', 'Edge'));
    for (const [k, c] of Object.entries(R.cells).filter((x) => x[1].ok).sort((x, y) => y[1].score - x[1].score)) { t.appendChild(el('span', '', cellName(k))); t.appendChild(el('span', 'sc-n', p1(c.win))); t.appendChild(el('span', 'sc-n', '+' + (c.score * 100).toFixed(1))); }
    P('Edge = points above "any day" in the weaker period. "Worked" is over the whole test.');
    if (R.grades && R.grades.M) P(`3. Then the signals whose situation did not beat "any day" (grey label). Every mixed one is there: ${p1(R.grades.M.win)} worked against ${p1(R.grades.M.base)} on any day.`);
    P('4. Last, the assets without a signal, nearest to their support first.');
    if (N.bull0) P(`What does not move the rank, because it did not change the odds in the test: more signals agreeing (${p1(N.bull0.win)} with no other bullish signal, ${p1(N.bull3.win)} with three or more), reward to risk (${p1(N.rrLow.win)} below 1, ${p1(N.rrHigh.win)} above 3), a support made of several levels (${p1(N.sup1.win)} with one, ${p1(N.sup3.win)} with three or more) and being above the 200-day average (${p1(N.up200.win)} against ${p1(N.dn200.win)}, and it reverses between the two periods). They are shown on each row for your own reading.`);
    P('The edges are small: 55 to 59% against 54%. The stop is half an ATR under the support, the target is the first resistance. Analysis, not advice.');
    return d;
  }
  function rowEl(r) {
    const b = el('button', 'sc-row' + (r.id === selId ? ' is-sel' : '')); b.type = 'button'; if (r.id) b.dataset.id = r.id; b.addEventListener('click', () => open(r));
    const a = b.appendChild(el('span', 'sc-a')); a.appendChild(el('b', '', r.sym)); a.appendChild(el('span', 'g-muted', r.name || r.group || ''));
    const v = b.appendChild(el('span', 'sc-v')); v.appendChild(el('b', '', fmt(r.px))); v.appendChild(el('span', 'g-row-c ' + (r.chg > 0.0005 ? 'up' : r.chg < -0.0005 ? 'down' : ''), pct(r.chg)));
    const m = [r.mine ? 'Yours' : null, r.cls === 'Stocks' ? r.sec || 'Stock' : r.cls || (r.mine ? null : r.group), r.cap ? big(r.cap) : null, r.sales ? 'revenue ' + big(r.sales) : null, r.pe > 0 ? 'P/E ' + (r.pe >= 100 ? Math.round(r.pe) : r.pe.toFixed(1)) : null].filter(Boolean);
    if (m.length) b.appendChild(el('span', 'sc-m', m.join(' · ')));
    const y = b.appendChild(el('span', 'sc-y')), B = r.J.buy;
    if (B) { y.appendChild(el('span', 'g-pill ' + (B.score > 0 ? 'g-buy' : 'g-watch'), (SHORT[B.id] || B.id) + ' · ' + when(r, B))); y.appendChild(el('span', 'sc-g', GR[B.g])); }
    if (r.J.sell) y.appendChild(el('span', 'g-pill g-sell', (SHORT[r.J.sell.id] || r.J.sell.id) + ' · ' + when(r, r.J.sell)));
    y.appendChild(el('span', 'sc-t', `RSI ${Math.round(r.rsi)} · support ${pct(r.sup)} · resistance ${pct(r.res)}${r.rr ? ' · reward/risk ' + Math.min(9.9, r.rr).toFixed(1) : ''}`));
    if (B) {
      const c = B.cell, n = c ? c.n.toLocaleString('en-US') : '';
      const t = !c ? 'This situation was not measured in the test.' : c.ok ? `This situation worked ${p1(c.win)} of ${n} times in the test; any day, ${p1(c.base)}.` : `No edge in the test for this situation: ${p1(c.win)} of ${n} times; any day, ${p1(c.base)}.`;
      b.appendChild(el('span', 'sc-rec', t + (B.score > 0 && r.stop && r.target ? ` Stop ${fmt(r.stop)} · target ${fmt(r.target)}.` : '')));
    }
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
    const map = box.appendChild(el('div', 'sc-map'));
    for (const r of R.filter((x) => x.group === 'World')) {
      const t = map.appendChild(el('button', 'sc-tile' + (r.id === selId ? ' is-sel' : ''))); t.type = 'button'; t.title = r.name; if (r.id) t.dataset.id = r.id; t.addEventListener('click', () => open(r));
      t.appendChild(el('b', '', r.sym)); t.appendChild(el('span', '', r.A ? pct(r.chg) : '…'));
      if (r.A) t.style.background = `color-mix(in srgb, var(--color-${r.chg >= 0 ? 'ok' : 'bad'}) ${Math.min(55, Math.round(Math.abs(r.chg) * 1800))}%, var(--color-panel))`;
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
    const cnt = box.appendChild(el('div', 'sc-count')); cnt.appendChild(el('span', '', `${L.length} of ${ALL.length} assets` + (L.length ? ` · ${L.filter((r) => tier(r) === 0).length} with a buy situation that passed the test` : '')));
    if (active || F.sort !== 'rank') { const rb = cnt.appendChild(el('button', 'sc-reset', 'Reset')); rb.type = 'button'; rb.addEventListener('click', () => { Object.assign(F, F0); shown = 60; saveF(); SRApp.renderDraw('screener'); }); }
    const list = box.appendChild(el('div', 'sc-list')), vis = L.slice(0, shown);
    for (const r of vis) list.appendChild(rowEl(r));
    if (!L.length) list.appendChild(el('p', 'g-muted', 'No asset matches these filters.'));
    if (L.length > shown) { const mb = box.appendChild(el('button', 'sc-more', `Show ${Math.min(60, L.length - shown)} more (${L.length - shown} left)`)); mb.type = 'button'; mb.addEventListener('click', () => { shown += 60; SRApp.renderDraw('screener'); }); }
    // live prices: this device's own assets, and the scanned ones that are on screen
    if (window.SRLive && window.SRLive.want) window.SRLive.want('screen', [...R.map((r) => r.id), ...vis.filter((r) => r.scanned).slice(0, 40).map((r) => r.id)].filter(Boolean));
    box.appendChild(el('p', 'g-hint', 'Support and resistance are the nearest zones made of averages, pivots, Fibonacci levels, trendlines and gaps. Market value, revenue and P/E are eToro\'s figures, in dollars. Scanned assets show the price of the scan until their live price arrives. Analysis, not advice.'));
    if (two && selId == null && outer.offsetParent !== null) { const first = L.find((r) => r.id); if (first) select(first); }   // the best-ranked asset is shown first
  });
  setInterval(() => { if (!document.hidden) SRApp.renderDraw('screener'); }, 15000);
  let wasMac = isMac(); window.addEventListener('resize', () => { if (isMac() !== wasMac) { wasMac = isMac(); for (const n of ['screener', 'today', 'pfolio', 'plan']) SRApp.renderDraw(n); } });
  window.SRScreen = { packs: () => packSet, rows, all, judge, when, GR, load, open, ago, SHORT, top, loadWide, filters: F, count: () => all().length, record: () => (wide ? wide.record : null) };
})();
