// The screener: every watched asset analysed with the same indicator code (ta.js), ranked on the signals that passed the
// history test (tastats.js). Live prices from eToro. Tap a row for the chart, the levels and the asset's own history test.
(function () {
  'use strict';
  if (typeof document === 'undefined') return;
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const pct = (x, d = 1) => (x == null || !isFinite(x) ? '—' : (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x * 100).toFixed(d) + '%'), p0 = (x) => Math.round(x * 100) + '%';
  const fmt = (x) => (x >= 1000 ? d3.format(',.0f')(x) : x >= 10 ? d3.format('.2f')(x) : d3.format('.4~g')(x));
  // the wider picture: indices, the dollar, Treasuries, metals, energy, crypto (eToro instrument ids)
  const BOARD = [['SPX500', 27, 'S&P 500'], ['NSDQ100', 28, 'Nasdaq-100'], ['GER40', 32, 'Germany 40'], ['EUSTX50', 43, 'Euro Stoxx 50'], ['JPN225', 36, 'Japan 225'], ['HKG50', 38, 'Hong Kong 50'], ['CHINA50', 253, 'China A50'],
    ['USDOLLAR', 25, 'US dollar index'], ['IEF', 3101, '10-year Treasuries (fall when yields rise)'], ['GOLD', 18, 'Gold'], ['SILVER', 19, 'Silver'], ['OIL', 17, 'Oil'], ['NATGAS', 22, 'Natural gas'], ['BTC', 100000, 'Bitcoin'], ['ETH', 100001, 'Ether']];
  const SHORT = { tl_brk_up: 'Trendline break', div_bull: 'RSI divergence', fib_sup: 'Fibonacci pullback', rsi30: 'RSI below 30', rsi70: 'RSI above 70', lo250: 'New 1-year low' };
  const stats = () => (window.SR_TASTATS || {}).by || {};
  const cache = new Map(), extra = new Map();
  let busy = false, sort = 'signal';
  function universe() {
    const U = [], seen = new Set(), H = dash.data('holdings'), M = dash.data('metrics');
    const names = new Map((M.status === 'ok' ? M.data : []).map((m) => [m.symbol, m.name])), ok = (s) => { const d = SRApp._store[s]; return d && d.status === 'ok' && d.data && d.data.length ? d.data : null; };
    for (const h of (H.status === 'ok' ? H.data : [])) if (ok(h.tracks) && !seen.has(h.tracks)) { seen.add(h.tracks); U.push({ sym: h.tracks, id: SRApp.idOf(h.tracks), name: h.ticker === h.tracks ? h.name || names.get(h.tracks) || '' : 'your ' + h.ticker, group: 'Yours', rows: ok(h.tracks) }); }
    for (const [sym, id, name] of BOARD) if (!seen.has(sym)) { seen.add(sym); U.push({ sym, id, name, group: 'World', rows: ok(sym) || extra.get(sym) || null }); }
    for (const [sym, id] of SRApp.DATASETS) if (!seen.has(sym) && sym !== 'EURUSD' && ok(sym)) { seen.add(sym); U.push({ sym, id, name: names.get(sym) || '', group: 'Funds', rows: ok(sym) }); }
    return U;
  }
  async function load() {
    if (busy || !window.SRLive || !window.SRLive.candles) return;
    busy = true; let k = 0;
    for (const [sym, id] of BOARD) {
      if (extra.has(sym) || (SRApp._store[sym] && SRApp._store[sym].status === 'ok')) continue;
      try { const r = await window.SRLive.candles(id, 'OneDay', 400); extra.set(sym, r.map(({ date, open, high, low, close }) => ({ date, open, high, low, close }))); } catch (e) { extra.set(sym, []); }
      if (++k % 5 === 0) { SRApp.renderDraw('screener'); SRApp.renderDraw('today'); }
    }
    busy = false; if (k) { SRApp.renderDraw('screener'); SRApp.renderDraw('today'); }
  }
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
  const open = (r) => { if (window.SRLive && window.SRLive.openAsset && r.id) window.SRLive.openAsset({ id: r.id, symbol: r.sym, name: r.name, exchange: '' }); };
  const ago = (x) => (x.ago === 0 ? 'today' : x.ago === 1 ? 'yesterday' : x.ago + ' days ago');
  const ORDER = {
    signal: (a, b) => b.score - a.score || (b.sup == null ? -9 : b.sup) - (a.sup == null ? -9 : a.sup),
    support: (a, b) => (b.sup == null ? -9 : b.sup) - (a.sup == null ? -9 : a.sup),
    resistance: (a, b) => (a.res == null ? 9 : a.res) - (b.res == null ? 9 : b.res),
    today: (a, b) => b.chg - a.chg,
  };
  dash.draw('screener', (box) => {
    box.replaceChildren();
    if (!window.SRTA) return;
    load();
    const R = rows(), S = stats(), live = R.filter((r) => r.A);
    if (window.SRLive && window.SRLive.want) window.SRLive.want('screen', R.map((r) => r.id).filter(Boolean));
    box.appendChild(el('h2', 'g-h2', 'Screener'));
    box.appendChild(el('p', 'g-muted g-sub', `${live.length} assets, analysed with the same rules and ranked on the signals that passed the history test. Tap one for its chart, levels and its own test.`));
    const map = box.appendChild(el('div', 'sc-map'));
    for (const r of R.filter((x) => x.group === 'World')) {
      const t = map.appendChild(el('button', 'sc-tile')); t.type = 'button'; t.title = r.name; t.addEventListener('click', () => open(r));
      t.appendChild(el('b', '', r.sym)); t.appendChild(el('span', '', r.A ? pct(r.chg) : '…'));
      if (r.A) t.style.background = `color-mix(in srgb, var(--color-${r.chg >= 0 ? 'ok' : 'bad'}) ${Math.min(55, Math.round(Math.abs(r.chg) * 1800))}%, var(--color-panel))`;
    }
    const bar = box.appendChild(el('div', 'g-chips sc-sort'));
    for (const [k, lab] of [['signal', 'Signals first'], ['support', 'Nearest support'], ['resistance', 'Nearest resistance'], ['today', 'Today']]) { const b = bar.appendChild(el('button', 'g-chip g-toggle' + (sort === k ? ' is-on' : ''), lab)); b.type = 'button'; b.addEventListener('click', () => { sort = k; SRApp.renderDraw('screener'); }); }
    const list = box.appendChild(el('div', 'sc-list'));
    for (const r of live.sort(ORDER[sort])) {
      const b = list.appendChild(el('button', 'sc-row')); b.type = 'button'; b.addEventListener('click', () => open(r));
      const a = b.appendChild(el('span', 'sc-a')); a.appendChild(el('b', '', r.sym)); a.appendChild(el('span', 'g-muted', r.name));
      const v = b.appendChild(el('span', 'sc-v')); v.appendChild(el('b', '', fmt(r.px))); v.appendChild(el('span', 'g-row-c ' + (r.chg > 0.0005 ? 'up' : r.chg < -0.0005 ? 'down' : ''), pct(r.chg)));
      const y = b.appendChild(el('span', 'sc-y'));
      if (r.buy) y.appendChild(el('span', 'g-pill g-buy', (SHORT[r.buy.id] || r.buy.name) + ' · ' + ago(r.buy)));
      if (r.sell) y.appendChild(el('span', 'g-pill g-sell', (SHORT[r.sell.id] || r.sell.name) + ' · ' + ago(r.sell)));
      y.appendChild(el('span', 'sc-t', `support ${pct(r.sup)} · resistance ${pct(r.res)} · RSI ${Math.round(r.A.rsi)}`));
      if (r.buy) b.appendChild(el('span', 'sc-rec', `This signal worked ${p0(S[r.buy.id].win)} of ${S[r.buy.id].n.toLocaleString('en-US')} times on 79 assets; buying on any day, ${p0(S[r.buy.id].base)}.`));
    }
    box.appendChild(el('p', 'g-hint', 'Support and resistance are the nearest zones made of averages, pivots, Fibonacci levels, trendlines and gaps. Only four buy signals passed the test (trendline break, RSI divergence, Fibonacci pullback, RSI below 30); the rest is context. Analysis, not advice.'));
  });
  setInterval(() => { if (!document.hidden) SRApp.renderDraw('screener'); }, 15000);
  window.SRScreen = { rows, load, open, ago, SHORT, top: (n) => rows().filter((r) => r.buy).sort((a, b) => b.score - a.score).slice(0, n), count: () => rows().filter((r) => r.A).length };
})();
