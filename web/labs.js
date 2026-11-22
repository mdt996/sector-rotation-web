// Trading → Labs: three paper portfolios of $2,000 (gold, eToro's leveraged markets, Revolut X crypto) that the VM trades on paper on
// 1- and 5-minute bars, always on (lab/ of the private repository, LAB.md). Paper only: the VM reads prices and sends no order, and
// nothing here can place one.
//
// What is read, from the branch "lab" of the sync repository (devices with the owner's sync key):
//   lab-live.json   every 10 seconds while this page is on screen: balances and the open trades. Between two readings each open trade
//                   is valued here, from eToro's price stream (as the demo account is) and from Revolut X's own prices where this
//                   device reads them, with the lab's own arithmetic: units × (the price to close at − the entry) − fees.
//   lab.json        the summary of the three labs, when the live file says it changed
//   lab-<key>.json  the lab on screen in full: its value as candles (drawn with the markets' chart), closed trades, statistics,
//                   the review of what went well and wrong, the stakes of each setup and the journal of what was changed and why
(function () {
  'use strict';
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const usd = (x) => (x < 0 ? '−$' : '$') + Math.abs(x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const usd0 = (x) => '$' + Math.round(x).toLocaleString('en-US');
  const usd2 = (x) => (x < 0 ? '−$' : '+$') + Math.abs(x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pc = (x, d) => (x < 0 ? '−' : '+') + Math.abs(x).toFixed(d == null ? 2 : d) + '%';
  const px = (x) => (!(x > 0) ? '–' : x >= 1000 ? x.toLocaleString('en-US', { maximumFractionDigits: 2 }) : x >= 100 ? x.toFixed(2) : x >= 1 ? x.toFixed(3) : x >= 0.01 ? x.toFixed(5) : x.toPrecision(4));
  const sign = (x) => (x > 0 ? 'up' : x < 0 ? 'down' : '');
  const when = (t) => new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const hm = (t) => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const clock = (t) => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const span = (ms) => { const s = Math.max(0, ms) / 1000; return s < 90 ? Math.round(s) + ' s' : s < 5400 ? Math.round(s / 60) + ' min' : s < 172800 ? Math.round(s / 3600) + ' h' : Math.round(s / 86400) + ' days'; };
  const rtxt = (x) => (x == null || !isFinite(x) ? '–' : `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(2)} R`);
  const pct0 = (x) => (x == null || !isFinite(x) ? '–' : Math.round(100 * x) + '%');
  const isDark = () => window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const cssVar = (n, fb) => (getComputedStyle(document.documentElement).getPropertyValue(n) || '').trim() || fb;
  const head = (box, text) => box.appendChild(el('h3', 't-h', text));
  const tile = (grid, k, v, sub, cls) => { const d = grid.appendChild(el('div', 'g-stat')); d.appendChild(el('span', 'g-stat-k', k)); d.appendChild(el('b', 'g-stat-v' + (cls ? ' ' + cls : ''), v)); if (sub) d.appendChild(el('span', 'g-stat-s', sub)); return d; };
  const table = (box, cols, cls) => { const tb = box.appendChild(el('div', 't-table ' + (cls || 't-t4'))), hd = tb.appendChild(el('div', 't-tr t-th')); for (const h of cols) hd.appendChild(el('span', '', h)); return tb; };
  const row = (tb, name, sub, cells, cls) => { const r = tb.appendChild(el('div', 't-tr' + (cls ? ' ' + cls : ''))), nm = r.appendChild(el('span', 't-name', name)); if (sub) nm.appendChild(el('small', 't-sub', sub)); for (const c of cells) r.appendChild(Array.isArray(c) ? el('span', c[1] || '', c[0]) : el('span', '', c)); return r; };

  // the three labs, then the portfolios made in the app (Matteo, 22 Nov 2026: "offer the possibility of deleting or creating new paper
  // trading portfolios for etoro or revolut x auto trading rules"), as the VM's summary lists them (custom: true)
  const BASE = ['gold', 'etoro', 'crypto'], VENUE0 = { gold: 'etoro', etoro: 'etoro', crypto: 'revx' };
  const keysOf = () => BASE.concat(LB.sum && Array.isArray(LB.sum.labs) ? LB.sum.labs.filter((l) => l && l.custom && /^u[a-z0-9]{3,10}$/.test(l.key)).map((l) => l.key) : []);
  const venueOf = (k) => VENUE0[k] || ((LB.sum && LB.sum.labs.find((x) => x.key === k)) || {}).venue || 'etoro';
  // the markets a portfolio may hold: those the labs already follow (lab/engine.js ETORO and REVX)
  // eToro, grouped as the form shows them, with the most leverage eToro gives a retail account in Europe (Matteo, 22 Nov: "add more
  // options for currencies and commodities (etoro leveraged)")
  const GROUPS = { etoro: [['Indices', 'up to 20×', [['27', 'S&P 500'], ['28', 'Nasdaq 100'], ['32', 'DAX']]],
    ['Commodities', 'gold 20×, the others 10×', [['18', 'Gold'], ['19', 'Silver'], ['40', 'Platinum'], ['17', 'Oil'], ['22', 'Natural gas']]],
    ['Currencies', 'up to 30×', [['1', 'EUR/USD'], ['2', 'GBP/USD'], ['5', 'USD/JPY'], ['4', 'USD/CAD'], ['6', 'USD/CHF'], ['7', 'AUD/USD']]]] };
  const MARKETS = { etoro: GROUPS.etoro.flatMap((g) => g[2]),
    revx: ['BTC', 'ETH', 'XRP', 'SOL', 'PEPE', 'HYPE', 'NEAR', 'LINK', 'DOGE', 'AAVE', 'JUP', 'ADA', 'XLM', 'AVAX', 'HBAR', 'LTC'].map((c) => [c + '-USD', c]) };
  const CUSTOM_MAX = 3, START = [500, 100000], STARTS = [1000, 2000, 5000, 10000, 25000];   // the VM keeps a start within START (lab/engine.js)
  const TFS = [['1', '1m'], ['5', '5m'], ['15', '15m'], ['60', '1h'], ['240', '4h'], ['1440', '1D']];
  // the market each lab is measured against, as a line on its chart (Matteo, 22 Nov 2026: "offer the comparison, like you do for
  // the etoro demo portfolio with the sp500, with the reference asset. For example the gold only portfolio can be compared with
  // actual gold holding"): the same markets as the VM's "Against holding" figures (engine.js, versus), read as eToro's candles
  const REF = { gold: { id: 18, name: 'Gold' }, etoro: { id: 27, name: 'S&P 500' }, crypto: { id: 100000, name: 'Bitcoin' } }, IV = { 1: 'OneMinute', 5: 'FiveMinutes', 15: 'FifteenMinutes', 60: 'OneHour', 240: 'FourHours', 1440: 'OneDay' };
  const SHORT = { orb: 'Opening range', revert: 'Back to average', squeeze: 'Squeeze', momo: 'Push', breakout: 'Breakout', dip: 'Dip', random: 'Random', noise: 'Out of range', low: '7-day low', tom: 'Turn of month' };
  // a rule on slower bars carries its speed in its name ("momo15": the push on 15-minute bars)
  const barName = (k) => (+k === 1440 ? 'daily' : +k >= 60 && +k % 60 === 0 ? `${+k / 60}-hour` : `${k}-minute`), barShort = (k) => (+k === 1440 ? 'daily' : +k >= 60 && +k % 60 === 0 ? `${+k / 60} h` : `${k} min`);
  const short = (r) => { const m = /^([a-z]+?)(\d+)$/.exec(r || ''); return m ? `${SHORT[m[1]] || m[1]} · ${barShort(m[2])}` : SHORT[r] || r || ''; }, isRandom = (r) => /^random\d*$/.test(r || '');
  const ALIGN = { with: 'with the trend', pullback: 'dip or bounce inside the trend', reversal: 'early reversal', against: 'against the trend', unknown: 'trend not known' };
  const ALIGN_S = { with: 'with trend', pullback: 'dip/bounce', reversal: 'reversal', against: 'against trend', unknown: 'trend unknown' };
  const TIER = { bench: 'Benched', probe: 'Test 0.1%', build: 'Half 0.25%', full: 'Full 0.5%' }, RANK = { bench: 0, probe: 1, build: 2, full: 3 };
  const PHASE = { up: 'rising', 'up-pullback': 'rising, pulling back', down: 'falling', 'down-bounce': 'falling, bouncing', 'turning-down': 'turning down', 'turning-up': 'turning up', flat: 'flat', unknown: 'trend not known yet' };
  const SLOW = { up: 'rising', down: 'falling', 'turning-down': 'turning down', 'turning-up': 'turning up' };
  const EXIT_S = { tight: '1 ATR stop and target', base: 'stop 1.5, target 2.25 ATR', trail: 'trailing stop', quick: 'out at +$1', wide: 'wide: stop 3.5, target 5.25 ATR' };

  const LB = { live: null, liveAt: 0, liveOk: 0, sum: null, sumAt: 0, det: {}, detAt: {}, loading: false, failed: false, sel: 'gold', pane: 'now', tf: '5', style: 'candles', bench: true, more: {}, root: null, R: null, tv: null, bodySig: '', timer: null, untick: null, lastPaint: 0, wanted: '' };
  try { const k = localStorage.getItem('sr.labSel'); if (/^[a-z0-9]{3,12}$/.test(k || '')) LB.sel = k; const c = JSON.parse(localStorage.getItem('sr.labChart') || '{}'); if (TFS.some((t) => t[0] === c.tf)) LB.tf = c.tf; if (c.style === 'line') LB.style = 'line'; LB.bench = c.ref == null ? true : !!c.ref; } catch (e) { /* the gold lab, 5-minute candles */ }   // the market's line is on unless switched off (Matteo, 22 Nov 2026: the comparison "also in the chart")
  // The selected lab's page in four parts instead of one long scroll (Matteo, 21 Nov 2026: "very verbose ... less verbose and more
  // organized"): what it holds now, its trades, what the history says, what it learned. "All" is the long page as it was.
  const PANES = [['now', 'Now'], ['trades', 'Trades'], ['history', 'History'], ['learning', 'Learning'], ['all', 'All']];
  try { const q = JSON.parse(localStorage.getItem('sr.labPane') || 'null'); if (PANES.some((x) => x[0] === q)) LB.pane = q; } catch (e) { /* the first part */ }
  const keep = () => { try { localStorage.setItem('sr.labPane', JSON.stringify(LB.pane)); localStorage.setItem('sr.labSel', LB.sel); localStorage.setItem('sr.labChart', JSON.stringify({ tf: LB.tf, style: LB.style, ref: LB.bench })); } catch (e) { /* not kept */ } };

  // ---- reading ----
  const read = async (name) => { try { return window.SRSync && window.SRSync.getFile ? await window.SRSync.getFile(name) : null; } catch (e) { return null; } };
  const validSum = (j) => !!(j && Number.isFinite(Date.parse(j.made)) && Array.isArray(j.labs) && BASE.every((k) => j.labs.some((l) => l && l.key === k && Number.isFinite(l.equity) && l.start > 0 && l.port && Array.isArray(l.open) && Array.isArray(l.assets) && Array.isArray(l.entries))));
  async function load(force) {
    if (LB.loading) return; LB.loading = true; let got = false;
    try {
      let now = Date.now();
      if (force) paint();   // "Reading…" on the button at once
      if (force || now - LB.liveAt >= 9000) {
        const j = await read('lab-live.json'); LB.liveAt = Date.now(); got = true;
        if (j && Array.isArray(j.labs) && Number.isFinite(Date.parse(j.made))) { if (!LB.live || Date.parse(j.made) >= Date.parse(LB.live.made)) LB.live = j; LB.liveOk = Date.now(); }
      }
      now = Date.now();
      const rev = (LB.live && LB.live.rev) || {}, sumMade = LB.sum ? Date.parse(LB.sum.made) : 0;
      const wantSum = !LB.sum || force || rev.sum > sumMade + 500 || now - LB.sumAt >= (LB.live ? 150000 : 60000);   // without a live file (a VM not updated yet): the summary every minute
      if (wantSum && (force || now - LB.sumAt >= 5000)) { const j = await read('lab.json'); LB.sumAt = Date.now(); got = true; if (validSum(j)) { LB.sum = j; LB.failed = false; } else LB.failed = true; }
      const k = LB.sel, d = LB.det[k], dMade = d ? Date.parse(d.made) : 0; now = Date.now();
      const wantDet = LB.sum && LB.sum.format === 2 && (!d || force || (rev.det && rev.det[k] > dMade + 500) || now - (LB.detAt[k] || 0) >= 300000);
      if (wantDet && (force || now - (LB.detAt[k] || 0) >= 5000)) { const j = await read(`lab-${k}.json`); LB.detAt[k] = Date.now(); got = true; if (j && j.key === k && Array.isArray(j.eq60) && Number.isFinite(Date.parse(j.made))) LB.det[k] = j; }
      // the portfolios made in the app, as written (one may be waiting for the VM to start it): at the start, on Refresh, then every 10 minutes
      if (window.SRSync && window.SRSync.canWrite && window.SRSync.canWrite() && (force || now - (LB.custAt || 0) >= 600000)) { const j = await read('lab/custom.json'); LB.custAt = Date.now(); if (j && Array.isArray(j.labs)) LB.cust = j; else if (!LB.cust) LB.cust = { v: 1, labs: [] }; }
      // the backtest: read once, then when the live file says a new one was made (once a day)
      const btMade = LB.bt ? Date.parse(LB.bt.made) : 0; now = Date.now();
      if (rev.bt > 0 && (rev.bt > btMade + 500 || force) && now - (LB.btAt || 0) >= (force ? 5000 : 600000)) { const j = await read('lab-backtest.json'); LB.btAt = Date.now(); got = true; if (j && j.labs && Number.isFinite(Date.parse(j.made))) LB.bt = j; }
      // the scan of every bar length is made with the backtest: read when that one is newer (a VM not updated yet has none)
      if (LB.bt && (!LB.scan || LB.scan.made !== LB.bt.made) && Date.now() - (LB.scanAt || 0) >= (force ? 5000 : 600000)) { const j = await read('lab-scan.json'); LB.scanAt = Date.now(); got = true; if (j && j.labs && Number.isFinite(Date.parse(j.made))) LB.scan = j; }
    } finally { LB.loading = false; }
    if (got) paint();
  }

  // ---- the three labs as they stand: the summary, with the live file's fresher balances and open trades ----
  const sumLab = (key) => (LB.sum ? LB.sum.labs.find((x) => x.key === key) : null);
  function now(key) {
    const L = sumLab(key), V = LB.live && LB.live.labs.find((x) => x.key === key), newer = V && L && Date.parse(LB.live.made) >= Date.parse(LB.sum.made) - 1000;
    return newer ? { open: V.open || [], waiting: V.waiting || [], bal: V.bal, added: V.added || 0, day: V.day, equity: V.equity, scale: V.scale, at: Date.parse(LB.live.made) }
      : L ? { open: L.open || [], waiting: L.waiting || [], bal: L.bal, added: L.added || 0, day: L.day, equity: L.equity, scale: L.scale, at: Date.parse(LB.sum.made) } : null;
  }
  // an open trade's result now: [dollars after costs, the price, valued on this device or not]
  // eToro offers leverage only in steps: a figure in between (reports made before 17 Nov 2026) is shown as the step eToro would use
  const levStep = (v) => { for (const st of [1, 2, 5, 10, 20, 30]) if (st >= v - 1e-9) return st; return Math.round(v); };
  function valueOf(o, key) {
    const u = +o.units, fee0 = +o.fee0 || 0;
    if (u > 0 && venueOf(key) === 'etoro' && window.SRLive && SRLive.quotes) {
      const q = SRLive.quotes.get(+o.a), conv = o.quote === 'USD' ? 1 : q && q.conv > 0 ? q.conv : 0;
      if (q && q.bid > 0 && q.ask > 0 && conv > 0 && Date.now() - q.got < 60000) { const slip = 0.25 * (q.ask - q.bid), p = o.dir > 0 ? q.bid - slip : q.ask + slip; return [o.dir * u * (p - o.e) * conv - fee0 - (+o.fee || 0) * u * p * conv, (q.bid + q.ask) / 2, true]; }
    }
    if (u > 0 && venueOf(key) === 'revx' && window.SRRevx && window.SRRevx.book) {
      const B = window.SRRevx.book(), q = B && B.usd && B.usd[o.sym];
      if (q && q.bid > 0 && q.ask > 0 && Date.now() - B.at < 30000) { const slip = 0.25 * (q.ask - q.bid), p = o.dir > 0 ? q.bid - slip : q.ask + slip; return [o.dir * u * (p - o.e) - fee0 - (+o.fee || 0) * u * p, (q.bid + q.ask) / 2, true]; }
    }
    return [+o.pl || 0, +o.now || 0, false];
  }
  function valued(key) {
    const N = now(key); if (!N) return null;
    let pl = 0, all = true; const rows = N.open.map((o) => { const v = valueOf(o, key); pl += v[0]; if (!v[2]) all = false; return v; });
    const eq = N.open.length ? N.bal + pl : N.equity, L = sumLab(key);
    return { N, rows, equity: eq, live: all && N.open.length > 0, day: N.day ? eq - N.day.eq0 : null, total: L ? eq - L.start : 0, adj: eq - (N.added || 0) };
  }
  // which prices this page needs from eToro's stream: the open trades' markets
  function want() {
    if (!window.SRLive || !SRLive.want) return;
    const ids = new Set(); for (const k of keysOf()) if (venueOf(k) === 'etoro') { const N = now(k); if (N) for (const o of N.open) if (+o.a > 0) ids.add(+o.a); }
    const key = [...ids].sort().join(','); if (key !== LB.wanted) { LB.wanted = key; SRLive.want('labs', [...ids]); }
  }

  // ---- the value as candles, on the markets' chart ----
  function barsFor(key, tf, liveAdj) {
    const D = LB.det[key], L = sumLab(key), ms = tf * 60000, m = new Map();
    const fold = (c) => { if (!Array.isArray(c) || !(c[4] > 0)) return; const b = Math.floor(c[0] / ms) * ms, k = m.get(b); if (!k) m.set(b, { b, time: b / 1000, open: c[1], high: c[2], low: c[3], close: c[4] }); else { k.high = Math.max(k.high, c[2]); k.low = Math.min(k.low, c[3]); k.close = c[4]; } };
    const src = D ? (tf < 5 ? D.eq1 : tf < 60 ? D.eq5 : D.eq60) : [], seen = new Set();
    for (const c of src || []) { fold(c); seen.add(c[0]); }
    // the newest minutes: the full file's unfinished candle and the summary's last candles (the summary is read more often)
    const from = D ? Date.parse(D.made) - 60000 : 0, tail = [...(D && D.cur ? [D.cur] : []), ...((L && L.tail) || [])].sort((a, b) => a[0] - b[0]);
    for (const c of tail) if (tf < 5 ? !seen.has(c[0]) || c[0] >= from : c[0] >= from) fold(c);
    if (!m.size && L) for (const p of (L.lifetimeCurve && L.lifetimeCurve.length > 1 ? L.lifetimeCurve : L.curve) || []) fold([p[0], p[1], p[1], p[1], p[1]]);   // a VM not updated yet: its 15-minute points
    // every slot of the time frame, as on the markets' charts: the lab's 1- and 5-minute histories keep only the minutes when its
    // value moved, so a night or a weekend without a trade would vanish from the time line and the market's line beside it
    // would jump there (Matteo, 22 Nov 2026: "sometimes the data does not follow the asset compared on the same timeline").
    // A slot without a reading keeps the last value.
    const bars = []; for (const k of [...m.values()].sort((a, b) => a.b - b.b)) {
      const p = bars[bars.length - 1]; if (p) for (let b = p.b + ms; b < k.b && bars.length < 40000; b += ms) bars.push({ b, time: b / 1000, open: p.close, high: p.close, low: p.close, close: p.close, flat: true });
      bars.push(k);
    }
    if (bars.length > 20000) bars.splice(0, bars.length - 20000);
    const last = bars[bars.length - 1];
    if (liveAdj > 0 && last) {
      const b = Math.floor(Date.now() / ms) * ms;
      if (last.b === b) { last.close = liveAdj; last.high = Math.max(last.high, liveAdj); last.low = Math.min(last.low, liveAdj); }
      else if (b > last.b) bars.push({ b, time: b / 1000, open: last.close, high: Math.max(last.close, liveAdj), low: Math.min(last.close, liveAdj), close: liveAdj });
    }
    return bars;
  }
  const cp = (k) => ({ time: k.time, open: k.open, high: k.high, low: k.low, close: k.close, volume: 0 });
  function makeChart(B, key) {
    B.textContent = '';
    const hdr = B.appendChild(el('div', 't-chhdr')), host = B.appendChild(el('div', 't-tv')), note = B.appendChild(el('div', 'g-hint t-chnote'));
    const T = { B, key, hdr, host, note, sig: '', n: 0, bars: [], hover: null, startLine: null };
    T.api = SRChart.create(host, { id: 'lab-' + key, account: true, rangeLabel: 'Value change', priceFormat: (v) => '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      height: () => (window.innerWidth >= 900 ? Math.max(380, Math.min(560, window.innerHeight - 420)) : 0),
      onFull: (on) => { if (on) T.api.slot.replaceChildren(hdr); else B.insertBefore(hdr, host); },
      onHover: (b) => { T.hover = b ? T.bars.find((k) => k.time === b.time) || null : null; say(T); } });
    const Lw = window.LightweightCharts, { chart: ch, candles } = T.api.lw(), blue = cssVar('--sr-c1', '#2563eb');
    T.candles = candles;
    T.line = ch.addSeries(Lw.AreaSeries || Lw.LineSeries, { lineColor: blue, topColor: 'rgba(37,99,235,0.22)', bottomColor: 'rgba(37,99,235,0.02)', color: blue, lineWidth: 2, priceLineVisible: false, lastValueVisible: true, visible: false }, 0);
    T.bench = ch.addSeries(Lw.LineSeries, { color: '#f59e0b', lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, visible: false }, 0);
    T.marks = !!(Lw.createSeriesMarkers && T.api.setMarks);   // the chart draws them, by its view and the room there is
    T.offBack = window.SRLive && SRLive.onBack ? SRLive.onBack(() => T.host.isConnected && T.api.back()) : null;
    T.destroy = () => { if (T.offBack) T.offBack(); try { T.api.destroy(); } catch (e) { /* gone */ } };
    return T;
  }
  // the reference market over the lab's own candles, set to the lab's value at the first candle they share (as the demo account's
  // S&P 500 line): where the two part, the lab did something holding would not have. eToro's candles; kept a minute.
  // a lab's market for the line on its chart: the three's own, or the one chosen for a portfolio made in the app (eToro's candles)
  function refOf(key) {
    if (REF[key]) return REF[key]; const L = sumLab(key); if (!L || !L.versusId) return null;
    const v = String(L.versusId), id = venueOf(key) === 'revx' ? (window.SRLive && SRLive.liveIdOf ? SRLive.liveIdOf(v.replace(/-USD$/, '')) : null) : +v;
    const nm = ((MARKETS[venueOf(key)] || []).find((m) => m[0] === v) || [])[1] || L.versusName || v; return id > 0 ? { id, name: nm } : null;
  }
  function bench(tv, key, bars, tf) {
    const R = refOf(key); if (!tv.bench) return;
    if (!LB.bench || !R || !IV[tf] || !window.SRLive || !SRLive.candles) { tv.bench.applyOptions({ visible: false }); tv.host.dataset.bench = '0'; tv.benchAt0 = null; return; }
    const ms = tf * 60000, want = `${key}|${tf}|${bars[0].b}|${bars.length}`; tv.benchWant = want;
    const paint = (rows) => {
      if (tv.benchWant !== want || !tv.host.isConnected) return;
      const px = new Map(); for (const r of rows || []) if (r && r.close > 0) px.set(Math.floor(r.t / ms) * ms, r.close);
      let k = null; const out = []; for (const b of bars) { const p = px.get(b.b); if (!(p > 0)) continue; if (k == null) k = b.close / p; out.push({ time: b.time, value: +(p * k).toFixed(2) }); }
      tv.bench.setData(out); tv.bench.applyOptions({ visible: out.length > 1 }); tv.host.dataset.bench = String(out.length); tv.benchData = out.length > 1 ? new Map(out.map((o) => [o.time, o.value])) : null; tv.benchName = R.name; say(tv);
    };
    if (tv.benchRows && tv.benchKey === key + '|' + tf && Date.now() - tv.benchAt < 60000) { paint(tv.benchRows); return; }
    const n = Math.max(5, Math.min(1000, Math.ceil((bars[bars.length - 1].b - bars[0].b) / ms) + 3));
    SRLive.candles(R.id, IV[tf], n, 1.5).then((rows) => { tv.benchRows = rows || []; tv.benchKey = key + '|' + tf; tv.benchAt = Date.now(); paint(tv.benchRows); }).catch(() => { /* the line waits for the next reading */ });
  }
  function say(T) {
    const lg = T.legend, k = T.hover || T.bars[T.bars.length - 1]; if (!lg || !k) return; const d = k.close - k.open, f = (v) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    lg.textContent = ''; lg.appendChild(el('span', 't-leg-t', new Date(k.b).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })));
    for (const [n, v] of [['O', k.open], ['H', k.high], ['L', k.low], ['C', k.close]]) { lg.appendChild(el('span', 't-leg-k', n)); lg.appendChild(el('span', '', f(v))); }
    lg.appendChild(el('span', sign(d), `${usd2(d)} (${pc(k.open ? 100 * d / k.open : 0)})`));
    const rv = LB.bench && T.benchData ? T.benchData.get(k.time) : null; if (rv != null) { const r = lg.appendChild(el('span', 't-leg-ref', `${T.benchName} ${f(rv)}`)); r.dataset.ref = '1'; }
  }
  // mode: 'full' (the header with the time frames, the candles, the trade marks), 'data' (candles and marks), 'tick' (the last candle only)
  function chart(B, key, V, mode) {
    const L = sumLab(key), D = LB.det[key];
    if (!window.SRChart || !window.LightweightCharts) { B.textContent = ''; B.appendChild(el('div', 'g-hint', 'The chart needs the app\'s chart module.')); return; }
    if (!LB.tv || LB.tv.key !== key || LB.tv.B !== B || !B.contains(LB.tv.host)) { if (LB.tv) LB.tv.destroy(); LB.tv = makeChart(B, key); mode = 'full'; }
    const tv = LB.tv;
    if (mode === 'full') {
      const H = tv.hdr; H.textContent = '';
      const fv = H.appendChild(el('div', 't-fullval')); fv.appendChild(el('b', '', L.name + ' ')); tv.fullV = fv.appendChild(el('span', 't-fullv')); tv.fullS = fv.appendChild(el('span'));
      const bar = H.appendChild(el('div', 't-chips t-tfs')), chip = (k, val, label) => { const b = bar.appendChild(el('button', 't-chip' + (LB[k] === val ? ' on' : ''), label)); b.type = 'button'; b.dataset.k = k + ':' + val; b.addEventListener('click', () => { LB[k] = val; keep(); chart(B, key, valued(key), 'full'); }); };
      for (const [k, l] of TFS) chip('tf', k, l);
      bar.appendChild(el('span', 't-sep', '·')); chip('style', 'candles', 'Candles'); chip('style', 'line', 'Line');
      const RF = refOf(key); if (RF) { bar.appendChild(el('span', 't-sep', '·')); const bb = bar.appendChild(el('button', 't-chip t-chip-ref' + (LB.bench ? ' on' : ''), 'vs ' + RF.name)); bb.type = 'button'; bb.dataset.k = 'bench'; bb.setAttribute('aria-pressed', String(!!LB.bench));
        bb.title = `Holding ${RF.name.toLowerCase() === 'gold' ? 'gold' : RF.name} over the same candles, set to the lab's value at the first one they share`; bb.addEventListener('click', () => { LB.bench = !LB.bench; keep(); chart(B, key, valued(key), 'full'); }); }
      tv.legend = H.appendChild(el('div', 't-legend'));
    }
    if (tv.fullV) { tv.fullV.textContent = usd(V.equity); tv.fullS.textContent = ` ${usd2(V.total)} (${pc(100 * V.total / L.start)})`; tv.fullS.className = sign(V.total); }
    const tf = +LB.tf, bars = barsFor(key, tf, V.adj);
    if (bars.length < 2) { tv.host.hidden = true; tv.note.textContent = 'The chart fills in as the lab runs: one candle a minute while a trade is open.'; return; }
    tv.host.hidden = false;
    const sig = `${key}|${LB.tf}|${bars[0].b}|${D ? D.made : ''}`, lineOf = (k) => ({ time: k.time, value: k.close });
    if (tv.sig !== sig || bars.length < tv.n) { tv.api.setBars(bars.map(cp), { sec: tf * 60, show: 120 }, tv.sigTf !== key + LB.tf); tv.line.setData(bars.map(lineOf)); tv.sigTf = key + LB.tf; }
    else for (let i = Math.max(0, tv.n - 1); i < bars.length; i++) { tv.api.update(cp(bars[i]), i >= tv.n); tv.line.update(lineOf(bars[i])); }
    tv.sig = sig; tv.n = bars.length; tv.bars = bars; tv.host.__bars = bars.map((k) => [k.time, k.open, k.high, k.low, k.close]);   // for the tests
    tv.candles.applyOptions({ visible: LB.style !== 'line' }); tv.line.applyOptions({ visible: LB.style === 'line' });
    const Lw = window.LightweightCharts, muted = isDark() ? '#a0a6b0' : '#5f6672', up = cssVar('--av-up', '#089981'), down = cssVar('--av-down', '#f23645');
    if (!tv.startLine) tv.startLine = tv.candles.createPriceLine({ price: L.start, color: muted, lineWidth: 1, lineStyle: Lw.LineStyle ? Lw.LineStyle.Dashed : 2, axisLabelVisible: true, title: 'start' });
    // where the lab's trades opened and closed (on the larger candles: each candle's trades together)
    if (tv.marks && mode !== 'tick') {
      const have = new Set(bars.map((k) => k.time)), at = (t) => Math.floor(t / (tf * 60000)) * tf * 60, mk = [], C = (D && D.closed) || L.closed || [];
      if (tf <= 15) {
        for (const c of C.slice(-60)) { if (have.has(at(c.t0))) mk.push({ time: at(c.t0), position: c.dir > 0 ? 'belowBar' : 'aboveBar', color: c.dir > 0 ? up : down, shape: c.dir > 0 ? 'arrowUp' : 'arrowDown', text: c.sym });
          if (have.has(at(c.t1))) mk.push({ time: at(c.t1), position: 'aboveBar', color: c.net >= 0 ? up : down, shape: 'circle', text: `${c.net >= 0 ? '+' : '−'}$${Math.abs(c.net).toFixed(2)}` }); }
        for (const o of V.N.open) if (have.has(at(o.t0))) mk.push({ time: at(o.t0), position: o.dir > 0 ? 'belowBar' : 'aboveBar', color: o.dir > 0 ? up : down, shape: o.dir > 0 ? 'arrowUp' : 'arrowDown', text: o.sym });
      } else {
        const by = new Map(); for (const c of C) { const t = at(c.t1); if (!have.has(t)) continue; const g = by.get(t) || { n: 0, net: 0 }; g.n++; g.net += c.net; by.set(t, g); }
        for (const [t, g] of by) mk.push({ time: t, position: 'aboveBar', color: g.net >= 0 ? up : down, shape: 'circle', text: `${g.net >= 0 ? '+' : '−'}$${Math.abs(g.net).toFixed(0)} (${g.n})` });
      }
      // readable marks: a lab with one market does not repeat its name on every arrow; the chart itself writes a figure only
      // where it has room, by its view (the closed trades' list below has every figure)
      const one = Array.isArray(L.assets) && L.assets.length === 1;
      if (one) for (const m of mk) if (m.shape !== 'circle') m.text = '';
      mk.sort((a, b) => a.time - b.time); tv.api.setMarks(mk.slice(-90)); tv.host.dataset.marks = String(mk.length);
    }
    tv.host.dataset.bars = String(bars.length); tv.host.dataset.tf = LB.tf; if (mode !== 'tick') bench(tv, key, bars, tf); say(tv);
    const lo = Math.min(...bars.map((k) => k.low)), hi = Math.max(...bars.map((k) => k.high)), first = bars[0];
    tv.note.textContent = `Since ${when(first.b)}: low ${usd(lo)}, high ${usd(hi)}. The same chart as the markets: drag, pinch or scroll to zoom, draw and measure, the square for the full view. ${tf <= 15 ? 'Arrows: a trade opened; dots: one closed, with its result.' : 'Dots: the trades closed in that candle, with their result.'} Dashed line: the $${L.start.toLocaleString('en-US')} it started with.${tf < 60 ? ' Minutes with nothing open are not drawn.' : ''}`;
  }

  // ---- the page ----
  function skeleton(root) {
    root.textContent = '';
    const R = { status: root.appendChild(el('div', 't-status t-labstatus')), warn: root.appendChild(el('div', 't-labwarn')), cards: root.appendChild(el('div', 'g-stats t-labcards')), form: root.appendChild(el('div', 't-labform')), top: root.appendChild(el('div', 't-labtop')),
      tabs: root.appendChild(el('div', 't-labtabs')), chart: root.appendChild(el('div', 't-labchartbox')), body: root.appendChild(el('div', 't-labbody')) };
    R.tabs.setAttribute('role', 'tablist'); R.tabs.setAttribute('aria-label', 'Parts of this lab');
    for (const [k, name] of PANES) { const b = R.tabs.appendChild(el('button', 't-labtab', name)); b.type = 'button'; b.dataset.pane = k; b.setAttribute('role', 'tab'); b.addEventListener('click', () => { if (LB.pane === k) return; LB.pane = k; keep(); panes(R); }); }
    LB.R = R; LB.bodySig = ''; return R;
  }
  // one part on screen at a time; the chart belongs to "Now"
  function panes(R) {
    for (const b of R.tabs.children) b.setAttribute('aria-selected', String(b.dataset.pane === LB.pane));
    for (const p of R.body.children) if (p.dataset.pane) p.hidden = !(LB.pane === 'all' || p.dataset.pane === LB.pane);
    const withChart = LB.pane === 'now' || LB.pane === 'all'; if (R.chart.hidden === withChart) { R.chart.hidden = !withChart; if (withChart && LB.tv && LB.tv.fit) try { LB.tv.fit(); } catch (e) { /* drawn at the next paint */ } }
    R.body.dataset.pane = LB.pane;
  }
  function status(R) {
    const S = R.status, made = LB.live ? Date.parse(LB.live.made) : LB.sum ? Date.parse(LB.sum.made) : 0, age = made ? Date.now() - made : null, slow = age == null || age > 6 * 60000;
    const stream = window.SRLive && SRLive.streamState ? SRLive.streamState() : null, any = keysOf().some((k) => { const v = valued(k); return v && v.live; });
    S.textContent = ''; S.appendChild(el('span', 't-dot ' + (slow ? 'off' : 'on')));
    S.appendChild(el('span', '', slow ? (age == null ? 'No report yet' : `VM report ${span(age)} ago: check the lab runner`) : any && stream && stream.ok ? `Live · ${clock(Date.now())}` : `VM report ${span(age)} ago`));
    S.appendChild(el('span', 't-labpaper', 'Paper only: no order is ever sent'));   // on its own line: the age of the report changes length and must not rewrap the page
    const b = S.appendChild(el('button', 'btn t-labrefresh', LB.loading ? 'Reading…' : 'Refresh')); b.type = 'button'; b.disabled = LB.loading; b.addEventListener('click', () => { load(true); });
    R.warn.textContent = '';
    if (LB.failed && LB.sum) R.warn.appendChild(el('div', 'g-warn', 'Could not read a new lab report. Showing the last one.'));
    const H = (LB.live && LB.live.health) || null, hs = LB.sum && LB.sum.health;
    const et = H ? H.etoro : hs && hs.etoro && hs.etoro.state, rx = H ? H.revx : hs && hs.revx && hs.revx.state;
    if (!slow && ((et && et !== 'streaming') || (rx && rx !== 'live'))) R.warn.appendChild(el('div', 'g-hint', `Prices on the VM: eToro ${et || '?'}, Revolut X ${rx || '?'}.`));
  }
  function cards(R) {
    R.cards.textContent = '';
    for (const key of keysOf()) {
      const L = sumLab(key), V = valued(key); if (!L || !V) continue;
      const P = L.top && L.top.proof, d = tile(R.cards, L.name, usd(V.equity), ' ', sign(V.total)); tileSub(d.querySelector('.g-stat-s'), L, V);
      // where it stands, in a word: the VM's own verdict (the "Proof so far" line under the lab's value says why)
      if (P && P.bar) { const c = d.appendChild(el('span', 't-labword', VERDICT[P.verdict] || VERDICT.holding)); c.dataset.verdict = P.verdict; d.dataset.verdict = P.verdict; }
      d.classList.add('t-labcard'); d.dataset.lab = key; if (key === LB.sel) d.classList.add('on'); d.setAttribute('role', 'button'); d.tabIndex = 0;
      const pick = () => { if (LB.sel === key) return; LB.sel = key; keep(); LB.bodySig = ''; paint(); load(false); };
      d.addEventListener('click', pick); d.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') pick(); });
      if (L.custom && LB.cust && !custList().some((c) => c.key === key)) d.appendChild(el('span', 't-labword t-labgone', 'Stopping'));   // deleted here, still running until the VM restarts it
    }
    if (!(window.SRSync && window.SRSync.canWrite && window.SRSync.canWrite())) return;
    for (const c of custList()) if (!sumLab(c.key)) { const w = R.cards.appendChild(el('div', 'g-stat t-labcard t-labwait')); w.dataset.lab = c.key; w.appendChild(el('span', 'g-stat-k', `${c.name} · ${c.venue === 'revx' ? 'Revolut X' : 'eToro'}`)); w.appendChild(el('span', 'g-stat-v', usd(c.start > 0 ? c.start : 2000))); w.appendChild(el('span', 'g-stat-s', 'Starting on the VM…')); }
    const full = custList().length >= CUSTOM_MAX, nb = R.cards.appendChild(el('button', 'g-stat t-labnew' + (LB.form ? ' on' : ''))); nb.type = 'button'; nb.disabled = full && !LB.form;
    nb.appendChild(el('span', 't-labnew-p', '+')); nb.appendChild(el('span', '', full ? `Up to ${CUSTOM_MAX} portfolios of your own` : 'New paper portfolio'));
    nb.addEventListener('click', () => { LB.form = LB.form ? null : { name: '', venue: 'etoro', assets: [], versus: '', start: 2000, msg: '' }; drawForm(R); cards(R); });
  }
  const custList = () => (LB.cust && Array.isArray(LB.cust.labs) ? LB.cust.labs.filter((c) => c && /^u[a-z0-9]{3,10}$/.test(c.key)) : []);
  // the form of a new portfolio: a name, eToro or Revolut X, its markets, the market it is set against. Drawn only when something in it
  // changes (never by the live repaints, which would take the keyboard away while typing).
  function drawForm(R) {
    const B = R.form, F = LB.form; B.textContent = ''; B.hidden = !F; if (!F) return;
    B.appendChild(el('b', 't-labform-h', 'New paper portfolio'));
    const nm = B.appendChild(el('label', 't-labform-f')); nm.appendChild(el('span', '', 'Name'));
    const inp = nm.appendChild(el('input', '')); inp.type = 'text'; inp.maxLength = 32; inp.value = F.name; inp.placeholder = F.venue === 'revx' ? 'My crypto' : 'My eToro'; inp.addEventListener('input', () => { F.name = inp.value; });
    const vrow = B.appendChild(el('div', 't-labform-f')); vrow.appendChild(el('span', '', 'Where'));
    const vs = vrow.appendChild(el('div', 't-chips t-labform-v'));
    for (const [v, t] of [['etoro', 'eToro: leveraged, long and short'], ['revx', 'Revolut X: crypto, buy only']]) { const b = vs.appendChild(el('button', 't-chip' + (F.venue === v ? ' on' : ''), t)); b.type = 'button'; b.setAttribute('aria-pressed', String(F.venue === v)); b.addEventListener('click', () => { if (F.venue === v) return; F.venue = v; F.assets = []; F.versus = ''; drawForm(R); }); }
    const mrow = B.appendChild(el('div', 't-labform-f')); mrow.appendChild(el('span', '', 'Markets'));
    const mbox = mrow.appendChild(el('div', 't-labform-mg'));
    for (const [g, lev, list] of GROUPS[F.venue] || [['', '', MARKETS[F.venue]]]) {
      if (g) { const h = mbox.appendChild(el('div', 't-labform-g')); h.appendChild(el('b', '', g)); h.appendChild(el('span', 'g-hint', lev)); }
      const ms = mbox.appendChild(el('div', 't-chips t-labform-m'));
      for (const [id, t] of list) { const on = F.assets.includes(id), b = ms.appendChild(el('button', 't-chip' + (on ? ' on' : ''), t)); b.type = 'button'; b.dataset.id = id; b.setAttribute('aria-pressed', String(on));
        b.addEventListener('click', () => { F.assets = on ? F.assets.filter((x) => x !== id) : F.assets.concat(id); if (!F.assets.includes(F.versus)) F.versus = F.assets[0] || ''; drawForm(R); }); }
    }
    if (F.assets.length) {
      const crow = B.appendChild(el('label', 't-labform-f')); crow.appendChild(el('span', '', 'Compare with')); const sel = crow.appendChild(el('select', 'sc-sel'));
      for (const id of F.assets) sel.appendChild(new Option('Holding ' + MARKETS[F.venue].find((m) => m[0] === id)[1], id)); sel.value = F.versus || F.assets[0]; sel.addEventListener('change', () => { F.versus = sel.value; });
    }
    const srow = B.appendChild(el('div', 't-labform-f')); srow.appendChild(el('span', '', 'Start with'));
    const sbox = srow.appendChild(el('div', 't-labform-s')), sc = sbox.appendChild(el('div', 't-chips'));
    const amt = sbox.appendChild(el('label', 't-labform-amt')); amt.appendChild(el('span', '', '$')); const sin = amt.appendChild(el('input', ''));
    sin.type = 'number'; sin.inputMode = 'numeric'; sin.min = String(START[0]); sin.max = String(START[1]); sin.step = '100'; sin.value = String(F.start); sin.setAttribute('aria-label', 'Starting paper money, in dollars');
    const okStart = (v) => Number.isFinite(v) && v >= START[0] && v <= START[1];
    for (const v of STARTS) { const b = sc.appendChild(el('button', 't-chip' + (F.start === v ? ' on' : ''), usd0(v))); b.type = 'button'; b.setAttribute('aria-pressed', String(F.start === v)); b.addEventListener('click', () => { F.start = v; drawForm(R); }); }
    sin.addEventListener('input', () => { const v = Math.round(+sin.value); F.start = okStart(v) ? v : NaN; for (const c of sc.children) { const on = c.textContent === usd0(F.start); c.classList.toggle('on', on); c.setAttribute('aria-pressed', String(on)); } go.disabled = !!F.busy || !F.assets.length || !okStart(F.start); amt.classList.toggle('bad', !okStart(F.start)); });
    amt.classList.toggle('bad', !okStart(F.start));
    B.appendChild(el('p', 'g-hint', `Between ${usd0(START[0])} and ${usd0(START[1])}. The ${F.venue === 'revx' ? 'Revolut X' : 'eToro'} lab's rules and costs. Paper only: no order is ever sent. Starts within 20 min.`));
    const act = B.appendChild(el('div', 't-labform-a')), go = act.appendChild(el('button', 'btn btn-primary', F.busy ? 'Saving…' : 'Create')), no = act.appendChild(el('button', 'btn', 'Cancel'));
    go.type = no.type = 'button'; go.disabled = !!F.busy || !F.assets.length || !okStart(F.start); no.addEventListener('click', () => { LB.form = null; drawForm(R); cards(R); });
    if (F.msg) act.appendChild(el('span', 'g-hint t-labform-msg', F.msg));
    go.addEventListener('click', async () => {
      F.busy = true; F.msg = ''; drawForm(R);
      const fresh = await read('lab/custom.json'), list = fresh && Array.isArray(fresh.labs) ? fresh.labs : custList();   // another device may have changed it
      if (list.length >= CUSTOM_MAX) { F.busy = false; F.msg = `There are already ${CUSTOM_MAX}: delete one first.`; drawForm(R); return; }
      const item = { key: 'u' + Date.now().toString(36).slice(-7), name: (F.name.trim() || (F.venue === 'revx' ? 'My crypto' : 'My eToro')).slice(0, 32), venue: F.venue, assets: F.assets.slice(), versus: F.versus || F.assets[0], start: F.start, at: Date.now() };
      const doc = { v: 1, about: 'Paper portfolios made in the app; lab/engine.js setCustom checks every field. Paper only.', labs: list.concat(item) };
      const r = await window.SRSync.putFile('lab/custom.json', doc, 'Paper portfolio added in the app: ' + item.name);
      if (r.ok) { LB.cust = doc; LB.form = null; drawForm(R); cards(R); } else { F.busy = false; F.msg = 'Not saved: ' + r.why; drawForm(R); }
    });
  }
  // a portfolio made in the app can be deleted there: two taps, the second within 6 seconds
  async function remove(key) {
    if (!(LB.del && LB.del.key === key && Date.now() - LB.del.at < 6000)) { LB.del = { key, at: Date.now() }; paint(); setTimeout(() => { if (LB.del && LB.del.key === key && !LB.del.busy) { LB.del = null; paint(); } }, 6100); return; }
    LB.del.busy = true; paint();
    const fresh = await read('lab/custom.json'), list = (fresh && Array.isArray(fresh.labs) ? fresh.labs : custList()).filter((c) => c && c.key !== key);
    const doc = { v: 1, about: 'Paper portfolios made in the app; lab/engine.js setCustom checks every field. Paper only.', labs: list };
    const r = await window.SRSync.putFile('lab/custom.json', doc, 'Paper portfolio deleted in the app');
    LB.del = null; if (r.ok) { LB.cust = doc; LB.gone = 'Deleted. It stops on the VM in about 10 to 20 minutes, and its record goes with it.'; } else LB.gone = 'Not deleted: ' + r.why; setTimeout(() => { LB.gone = null; paint(); }, 20000);
    paint();
  }
  // under a tile's value: its return, then its trades, each on one line of its own (the same at every reading and between two:
  // a line that came and went made the page jump)
  function tileSub(s, L, V) {
    const n = L.cycleTrades == null ? L.port.n : L.cycleTrades, a = pc(100 * V.total / L.start), b = `${n} trade${n === 1 ? '' : 's'}${V.N.open.length ? ' · ' + V.N.open.length + ' open' : ''}`;
    if (s.dataset.t === a + '|' + b) return; s.dataset.t = a + '|' + b; s.textContent = '';
    s.appendChild(el('b', sign(V.total), a)); s.appendChild(el('span', '', b));
  }
  const wordsOpen = new Map();   // the fold of sentences under a lab's pictures stays as the reader left it across the refreshes
  const VERDICT = { few: 'Too early', losing: 'Losing', luck: 'Not proven', ahead: 'Ahead so far', holding: 'Holding up' };
  function top(R, L, V) {
    const T = R.top; T.textContent = '';
    head(T, L.name);
    const box = T.appendChild(el('div', 't-top')), v = box.appendChild(el('div', 't-value', usd(V.equity))); v.dataset.live = 'equity';
    const sub = box.appendChild(el('div', 't-sub'));
    sub.appendChild(el('b', sign(V.total), `${usd2(V.total)} (${pc(100 * V.total / L.start)})`)); sub.appendChild(document.createTextNode(L.cycle > 1 ? ` in cycle ${L.cycle}` : ' since the start'));
    if (V.day != null) { sub.appendChild(el('span', 't-sep', '·')); sub.appendChild(el('b', sign(V.day), usd2(V.day))); sub.appendChild(document.createTextNode(V.N.day && V.N.day.stopped ? ' today (down 3%: no new trade until midnight UTC)' : ' today')); }
    // proof so far: where the lab stands on the road to "more than luck" (the VM's verdict: trades, luck, kinds of market)
    const P = L.top && L.top.proof, words = [];
    if (P && P.bar) {
      const txt = P.verdict === 'few' ? `too early to say anything: ${P.n} closed trade${P.n === 1 ? '' : 's'}.`
        : P.verdict === 'losing' ? `losing by more than luck would give, over ${P.n.toLocaleString('en-US')} trades.`
        : P.verdict === 'luck' ? (P.mR > 0 ? `not proven. ${P.n.toLocaleString('en-US')} trades so far of about ${(P.need || P.bar.n).toLocaleString('en-US')} needed, and the result is still within what luck gives.` : `not proven. ${P.n.toLocaleString('en-US')} trades, a result below zero but within what luck gives.`)
        : P.verdict === 'ahead' ? `ahead of luck so far, not proven. ${P.n.toLocaleString('en-US')} of ${P.bar.n} trades, a gain in ${P.earned} of the ${P.bar.kinds} kinds of market needed.`
        : `holding up: beyond luck over ${P.n.toLocaleString('en-US')} trades, in ${P.earned} kinds of market. The next proof is real fills on the demo account.`;
      // the picture first (Matteo, 22 Nov 2026: "more visualization features than verbose info"): how far along the road of trades, the
      // verdict in a word, and what each kind of market and each side made; the sentences fold under "In words"
      const need = P.verdict === 'luck' && P.mR > 0 ? (P.need || P.bar.n) : P.bar.n, M = T.appendChild(el('div', 't-labmeter')); M.dataset.verdict = P.verdict;
      const mh = M.appendChild(el('div', 't-labmeter-h')); mh.appendChild(el('b', '', 'Proof')); mh.appendChild(el('span', 't-labmeter-w', VERDICT[P.verdict] || '')); mh.appendChild(el('span', 't-labmeter-n', `${P.n.toLocaleString('en-US')} of ${need.toLocaleString('en-US')} trades`));
      const mt = M.appendChild(el('div', 't-labmeter-t')); mt.setAttribute('role', 'img'); mt.setAttribute('aria-label', `${P.n} of ${need} trades needed`); mt.appendChild(el('i', '')).style.width = Math.max(1, Math.min(100, 100 * P.n / Math.max(1, need))).toFixed(1) + '%';
      if (P.verdict !== 'few') {
        const chips = [['Falling days', P.kinds && P.kinds.falling], ['Rising days', P.kinds && P.kinds.rising], ['Flat days', P.kinds && P.kinds.flat]].concat(L.short && P.sides ? [['Shorts', P.sides.short], ['Buys', P.sides.long]] : []).filter((c) => c[1] && c[1].n);
        for (const grp of chips.length > 4 ? [chips.filter((c) => / days$/.test(c[0])), chips.filter((c) => !/ days$/.test(c[0]))] : [chips]) { if (!grp.length) continue; const C = M.appendChild(el('div', 't-labchips')); C.style.setProperty('--n', grp.length); for (const [k, v] of grp) { const c = C.appendChild(el('span', 't-labchip')); c.appendChild(el('i', '', k)); c.appendChild(el('b', sign(v.net), usd2(v.net))); c.appendChild(el('small', '', `${v.n} trade${v.n === 1 ? '' : 's'}`)); } }
      }
      const d = el('div', 'g-line t-labproof'); words.push(d); d.dataset.verdict = P.verdict; d.appendChild(el('b', '', 'Proof so far: ')); d.appendChild(document.createTextNode(txt));
      const kinds = ['falling', 'rising', 'flat'].filter((k) => P.kinds && P.kinds[k] && P.kinds[k].n).map((k) => `${k} ${usd2(P.kinds[k].net)} over ${P.kinds[k].n}`);
      if (P.verdict !== 'few' && (kinds.length || L.short)) words.push(el('div', 'g-hint t-labproofk', `${kinds.length ? `By what the market did the day before each trade: ${kinds.join(' · ')}. ` : ''}${L.short && P.sides ? `Shorts ${usd2(P.sides.short.net)} over ${P.sides.short.n}, buys ${usd2(P.sides.long.net)} over ${P.sides.long.n}.` : ''}`.trim()));
    }
    // against simply holding the lab's market over the same days, and what the lab's own average position explains (the VM's figures)
    const H = L.top && L.top.vs;
    if (H && Number.isFinite(H.ret) && Number.isFinite(H.lab)) {
      // drawn: the lab, holding its market over the same days, and what the lab's own average position alone would have made, on one
      // scale around zero; the average position stays written beside it (never the comparison without it)
      const rows = [['This lab', H.lab], ['Holding ' + H.name, H.usd]].concat(H.n && H.pos != null ? [['Average position alone', H.pos]] : []);
      const lo = Math.min(0, ...rows.map((r) => r[1])), hi = Math.max(0, ...rows.map((r) => r[1])), span = hi - lo || 1, zero = 100 * (0 - lo) / span;
      const G = T.appendChild(el('div', 't-labvsg')); G.appendChild(el('b', 't-labvsg-h', 'Against holding'));
      for (const [k, v] of rows) { const r = G.appendChild(el('div', 't-labvsrow')); r.dataset.k = k; r.appendChild(el('span', 't-labvsrow-k', k)); const t = r.appendChild(el('span', 't-labvsrow-t')); t.style.setProperty('--zero', zero.toFixed(2) + '%');
        const b = t.appendChild(el('i', v < 0 ? 'is-neg' : '')); b.style.left = (v < 0 ? 100 * (v - lo) / span : zero).toFixed(2) + '%'; b.style.width = (100 * Math.abs(v) / span).toFixed(2) + '%'; r.appendChild(el('b', 't-labvsrow-v', usd2(v))); }
      G.appendChild(el('div', 't-labvsg-c', `Average position open: ${usd(H.share * L.start)}${!L.short ? '' : Math.abs(H.side) < 0.2 * H.share ? ', long and short about equally' : H.side < 0 ? ', short on balance' : ', long on balance'}`));
      const d = el('div', 'g-line t-labvs'); words.push(d); d.appendChild(el('b', '', 'Against holding: '));
      d.appendChild(document.createTextNode(`this lab ${usd2(H.lab)} (${pc(100 * H.lab / L.start)}), holding ${H.name} over the same days ${usd2(H.usd)} (${pc(100 * H.ret)}).`));
      const side = !L.short ? '' : Math.abs(H.side) < 0.2 * H.share ? ', long and short about equally' : H.side < 0 ? ', short on balance' : ', long on balance';
      const split = !H.n ? ' No trade closed yet.' : H.pos != null && H.timing != null ? ` Before costs ${usd2(H.gross)}: its average position alone would have made ${usd2(H.pos)}, timing the rest (${usd2(H.timing)}). Costs ${usd2(-H.cost)}.` : ` Before costs ${usd2(H.gross)}, costs ${usd2(-H.cost)}.`;
      words.push(el('div', 'g-hint t-labvsk', `Average position open: ${usd(H.share * L.start)}${side}.${split} A lab mostly out of the market beats holding when prices fall and trails it when they rise.`));
    }
    if (words.length) {
      const W = T.appendChild(el('details', 't-labwords')); W.appendChild(el('summary', '', 'In words')); for (const w of words) W.appendChild(w);
      W.open = wordsOpen.get(L.key) === true; W.addEventListener('toggle', () => wordsOpen.set(L.key, W.open));
    }
    if (L.custom) {
      const C = T.appendChild(el('div', 't-labmine')); C.appendChild(el('span', 'g-hint', `Made in the app · ${usd0(L.start)} at the start · ${(L.assets || []).join(', ')} · set against ${L.versusName || '—'}`));
      if (window.SRSync && window.SRSync.canWrite && window.SRSync.canWrite() && custList().some((c) => c.key === L.key)) {
        const sure = LB.del && LB.del.key === L.key, b = C.appendChild(el('button', 'btn t-labdel' + (sure ? ' is-sure' : ''), LB.del && LB.del.busy ? 'Deleting…' : sure ? 'Tap again to delete: its record goes' : 'Delete this portfolio')); b.type = 'button'; b.disabled = !!(LB.del && LB.del.busy);
        b.addEventListener('click', () => remove(L.key));
      }
    }
    if (LB.gone) { T.appendChild(el('div', 'g-hint t-labgonemsg', LB.gone)); }
    const sc = V.N.scale == null ? L.scale : V.N.scale;
    if (sc != null && sc < 1) T.appendChild(el('div', 'g-warn t-labbrake', `Stakes at ${Math.round(sc * 100)}% of normal${L.streak >= 3 ? `: ${L.streak} losses in a row` : ': a fall from the 3-day high'}.${L.coolUntil > Date.now() ? ` No new trade before ${hm(L.coolUntil)}.` : ''}`));
    if (L.resetPending) T.appendChild(el('div', 'g-warn', 'Reset pending: waiting for fresh prices to settle the remaining paper trades. No new entries.'));
  }
  // the open trades: a table whose figures follow the live prices
  function openBox(box, key, L, V) {
    const W = V.N.waiting || [], O = V.N.open, T = LB.sum.text || {};
    head(box, `Open now: ${O.length}${W.length ? ` (+${W.length} waiting)` : ''}`);
    if (!O.length && !W.length) { box.appendChild(el('div', 'g-hint', 'Nothing open.')); return; }
    const tb = table(box, ['Trade', 'Entry', 'Now', 'Result'], 't-t4 t-labopen');
    // a price with many digits (a coin worth a few millionths of a dollar) is set smaller, so two of them never run into each other
    const num = (t) => [t, t.length > 9 ? 't-long' : ''];
    O.forEach((o, i) => {
      const v = V.rows[i], r = row(tb, `${o.sym} ${o.dir > 0 ? 'buy' : 'short'}`, '', [num(px(o.e)), num(px(v[1])), [`${usd2(v[0])}`, sign(v[0])]]);
      // the rule, its place in the trend, the stake and the leverage on their own line, over the full width
      tb.appendChild(el('div', 't-l2 t-labl2 t-labl1', `${short(o.rule)} · ${ALIGN_S[o.align] || ''} · ${TIER[o.tier] || ''}${o.lev > 1.05 ? ' · ' + levStep(o.lev) + 'x' : ''}`)).dataset.openl1 = String(o.id);
      r.dataset.open = String(o.id);
      const pc0 = (p) => (p > 0 && o.e > 0 ? ` (${pc(100 * (p / o.e - 1))})` : ''), left = o.max ? o.max - Date.now() : null;
      const l2 = tb.appendChild(el('div', 't-l2 t-labl2', `Stop ${px(o.stop)}${pc0(o.stop)}${o.tgt ? ` · target ${px(o.tgt)}${pc0(o.tgt)}` : o.quick ? ` · out at ${usd2(o.quick)} net` : ' · no target: the stop trails'} · $${Math.round(o.notional).toLocaleString('en-US')} position, ${usd(o.risk)} at risk · ${span(Date.now() - o.t0)} in${left != null && left > 0 ? `, at most ${span(left)} more` : ''}${o.swing ? ` · may stay overnight${o.nights ? `: ${o.nights} night${o.nights === 1 ? '' : 's'} paid (${usd(o.nightFee)})` : ''}` : ''}`));
      l2.dataset.openl2 = String(o.id); r.dataset.risk = String(o.risk);
      r.title = (T.rules && T.rules[o.rule]) || '';
    });
    for (const o of W) { row(tb, `${o.sym} buy at ${px(o.lim)}`, `${short(o.rule)} · ${ALIGN_S[o.align] || ''} · waiting order, no fee`, [span(Date.now() - o.t), 'waiting'], 't-labwait'); }
    box.appendChild(el('div', 'g-hint', V.live ? 'Valued here from live prices, as the lab does: the price to close at, minus costs.' : 'Values as of the VM\'s last report.'));
  }
  function statsBox(box, L, D) {
    const t = (D && D.report && D.report.top) || L.top; if (!t) return;
    head(box, 'Statistics of its own trades');
    const g = box.appendChild(el('div', 'g-stats t-labstats')), n = t.n || 0;
    tile(g, 'Trades', String(n), n ? `${t.w} won · ${pct0(t.winRate)} success` : 'none closed yet', '');
    tile(g, 'Result', usd2(t.net || 0), n ? `${rtxt(t.meanR)} per trade after costs` : '', sign(t.net));
    tile(g, 'Profit factor', t.pf == null ? '–' : t.pf.toFixed(2), 'gains ÷ losses; above 1 earns', t.pf == null ? '' : sign(t.pf - 1));
    tile(g, 'Sharpe ratio', t.sharpe ? t.sharpe.v.toFixed(1) : '–', t.sharpe ? (t.sharpe.basis === 'days' ? `from ${t.sharpe.n} days, on a year` : `from ${t.sharpe.n} hours: rough until 8 days`) : 'needs half a day of history', t.sharpe ? sign(t.sharpe.v) : '');
    tile(g, 'Average win / loss', t.avgWin == null && t.avgLoss == null ? '–' : `${t.avgWin == null ? '–' : usd2(t.avgWin)} / ${t.avgLoss == null ? '–' : usd2(t.avgLoss)}`, t.payoff ? `a win is ${t.payoff.toFixed(2)}× a loss` : '', '');
    tile(g, 'Largest fall', t.maxDD ? '−$' + t.maxDD.toFixed(2) : '$0', `${pc(-100 * (t.maxDD || 0) / L.start, 1)} of the start · now ${pc(-(t.dd || 0), 1)} from the 3-day high`, t.maxDD ? 'down' : '');
    tile(g, 'Costs', '$' + (t.cost || 0).toFixed(2), t.costShare != null ? `${pct0(t.costShare)} of what the winners made` : 'spreads and fees', '');
    tile(g, 'Best / worst trade', t.best == null ? '–' : `${usd2(t.best)} / ${usd2(t.worst)}`, t.hold != null ? `${t.hold < 90 ? t.hold + ' min' : (t.hold / 60).toFixed(1) + ' h'} in a trade on average` : '', '');
    tile(g, 'Losses in a row', String(t.streak || 0), `longest run ${t.worstStreak || 0}`, t.streak >= 3 ? 'down' : '');
    tile(g, 'Daily swing', t.volDay == null ? '–' : t.volDay.toFixed(2) + '%', 'how much the value moves in a day', '');
    // could it be luck, and what if the fills were worse (a VM not updated yet does not send them)
    if (t.luck !== undefined || t.stress !== undefined) {
      const lk = t.luck, gain = lk && t.meanR > 0;
      tile(g, 'Could it be luck?', gain ? (lk.p < 0.01 ? 'under 1%' : pct0(lk.p)) : '–', !lk ? 'needs 5 closed trades' : gain ? `how often luck alone does this well; under 5% starts to count${lk.need ? ` · about ${lk.need.toLocaleString('en-US')} trades to tell` : ''}` : 'no gain to test so far', gain && lk.p < 0.05 ? 'up' : '');
      tile(g, 'If fills were twice as bad', t.stress == null ? '–' : usd2(t.stress), 'the spread and slippage counted double', t.stress == null ? '' : sign(t.stress));
    }
  }
  // the backtest and its walk-forward: did what the learner picked go on to earn?
  function backtestBox(box, key, L) {
    const B = LB.bt && LB.bt.labs && LB.bt.labs[key]; if (!B) return;
    head(box, 'Backtest and walk-forward');
    if (!B.n) { box.appendChild(el('div', 'g-hint', 'No history replayed yet for this lab.')); return; }
    const t = B.tiers || {}, r = (c) => (c && c.n ? `${rtxt(c.mR)} a trade over ${c.n.toLocaleString('en-US')}` : 'none yet');
    const pick = B.picked || {}, rest = { n: (t.probe ? t.probe.n : 0) + (t.bench ? t.bench.n : 0), s: (t.probe && t.probe.n ? t.probe.mR * t.probe.n : 0) + (t.bench && t.bench.n ? t.bench.mR * t.bench.n : 0) };
    const restM = rest.n ? rest.s / rest.n : null, rnd = B.random || {};
    const verdict = !pick.n ? 'Nothing was promoted in this history yet: too little of it, or nothing earned enough.'
      : pick.n < 30 ? `Too early to say: only ${pick.n} trades of promoted setups in this history.`
      : pick.mR > 0 && (restM == null || pick.mR > restM) ? `So far, picking works here: what the learner had promoted went on to make ${rtxt(pick.mR)} a trade, against ${rtxt(restM)} for what it had not.`
      : pick.mR > (restM == null ? -9 : restM) ? `Picking helped but did not pay: what the learner had promoted went on to make ${rtxt(pick.mR)} a trade, against ${rtxt(restM)} for the rest.`
      : `So far, picking does not work here: what the learner had promoted went on to make ${rtxt(pick.mR)} a trade, no better than the rest (${rtxt(restM)}).`;
    box.appendChild(el('div', 'g-line t-labbtv', verdict));
    const tb = table(box, ['Stake when the trade opened', 'Trades', 'Won', 'Per trade'], 't-t4 t-labbt');
    for (const [k, name] of [['full', 'Full 0.5%'], ['build', 'Half 0.25%'], ['probe', 'Test 0.1%'], ['bench', 'No money (not taken)']]) { const c = t[k]; if (c && c.n) row(tb, name, '', [String(c.n), pct0(c.won), [rtxt(c.mR), sign(c.mR)]], 't-labbtrow'); }
    if (rnd.n) row(tb, 'Random entries', 'the yardstick', [String(rnd.n), pct0(rnd.won), [rtxt(rnd.mR), sign(rnd.mR)]], 't-labbtrow');
    const sp = B.speeds || {}, keys = Object.keys(sp).sort((a, b) => +a - +b).filter((k) => sp[k].rules.n);
    if (keys.length) { const d = SRApp.disclosure(box, `lab-${key}-btspeeds`, 'The history by bar length'), tb2 = table(d, ['Bars', 'Paper trades', 'Before costs', 'After costs'], 't-t4'); for (const k of keys) row(tb2, barName(k), [sp[k].days ? `${sp[k].days.toLocaleString('en-US')} day${sp[k].days === 1 ? '' : 's'}` : '', sp[k].sig ? `${sp[k].sig.toLocaleString('en-US')} signal${sp[k].sig === 1 ? '' : 's'}` : '', sp[k].random.n ? `random ${rtxt(sp[k].random.mR)}` : ''].filter(Boolean).join(' · '), [sp[k].rules.n.toLocaleString('en-US'), rtxt(sp[k].rules.gR), [rtxt(sp[k].rules.mR), sign(sp[k].rules.mR)]], 't-labbtsrow'); if (keys.some((k) => sp[k].days)) d.appendChild(el('div', 'g-hint t-labbtsh', 'Under each bar length: the days of history behind it and its signals (each signal is followed with several exits, so it makes several paper trades). The slow bars reach back much further than the fast ones.')); }
    const CO = B.costs || {}, ck = [['<0.05', 'under 0.05 R'], ['0.05-0.1', '0.05 to 0.1 R'], ['0.1-0.2', '0.1 to 0.2 R'], ['0.2-0.4', '0.2 to 0.4 R'], ['0.4+', 'over 0.4 R']].filter(([k]) => CO[k] && CO[k].n);
    if (ck.length) { const d = SRApp.disclosure(box, `lab-${key}-btcosts`, 'What the costs decide'), tb3 = table(d, ['Costs of the trade', 'Signals', 'Before costs', 'After costs'], 't-t4 t-labbtcosts'); for (const [k, name] of ck) row(tb3, name, k === '0.4+' ? 'the money does not take these' : '', [CO[k].n.toLocaleString('en-US'), rtxt(CO[k].gR), [rtxt(CO[k].mR), sign(CO[k].mR)]], 't-labbtcrow'); d.appendChild(el('div', 'g-hint', 'Every signal of the history by what its spread and fees were going to take, known before it opened, in R (1 R: what the trade risks). Where the result before costs is about nothing, the result is the costs.')); }
    const CH = B.chance || {}, hk = [['75+', 'over 75%'], ['55-75', '55 to 75%'], ['45-55', '45 to 55%'], ['25-45', '25 to 45%'], ['<25', 'under 25%'], ['new', 'not scored yet']].filter(([k]) => CH[k] && CH[k].n);
    if (hk.length) { const d = SRApp.disclosure(box, `lab-${key}-btchance`, 'What the learner\'s own confidence was worth'), tb4 = table(d, ['Chance to earn it gave', 'Trades', 'Won', 'Per trade'], 't-t4 t-labbtchance'); for (const [k, name] of hk) row(tb4, name, '', [CH[k].n.toLocaleString('en-US'), pct0(CH[k].won), [rtxt(CH[k].mR), sign(CH[k].mR)]], 't-labbthrow'); d.appendChild(el('div', 'g-hint', 'Each trade of the history by the chance to earn the learner gave its setup before it opened. A setup gets a test stake above 55% and loses it under 45%: the top rows must go on to do better than the bottom ones for that to be worth anything.')); }
    if (B.best && B.best.length) box.appendChild(el('div', 'g-hint', 'Best in this history: ' + B.best.slice(0, 3).map((b) => `${short(b.rule)} ${ALIGN_S[b.align] || b.align} (${rtxt(b.m)} over ${b.n})`).join(' · ') + '.'));
    box.appendChild(el('div', 'g-hint', `${B.days} day${B.days === 1 ? '' : 's'} of history replayed ${when(Date.parse(LB.bt.made))}: ${B.n.toLocaleString('en-US')} paper trades with this lab's own rules, fees and sizes. Each trade is counted under the stake its setup had when it opened, from what was known until then: no hindsight. ${L.venue === 'revx' ? 'Revolut X gives only a few days of fast candles; the VM keeps them, so this gets deeper every day.' : 'Costs are today\'s spreads and fees, by the hour of the day. The fast bars go back a few weeks (the VM keeps them, deeper every day), the hourly ones two years, the daily ones longer.'} Each rule starts live from what it made here; live trades confirm it or overturn it.`));
  }
  // eToro's weekend session: followed on paper only at its own spreads, kept apart from everything the lab learns (the VM's figures)
  function weekendBox(box, key, L, D) {
    if (L.venue === 'revx') return;
    const B = LB.bt && LB.bt.labs && LB.bt.labs[key], BW = B && B.weekend ? B.weekend : null, H = BW && BW.all && BW.all.n ? BW : null, W = D && D.weekend ? D.weekend : null;
    if (!BW && !W) return;
    const left = (n) => `${n.toLocaleString('en-US')} more signal${n === 1 ? ' was' : 's were'} not followed: the spread and fees alone were more than the trade risks.`;
    head(box, 'Weekend session (paper only)');
    box.appendChild(el('div', 'g-line t-labwk', 'This lab\'s money stays out at the weekend. eToro keeps a few markets open then, at much wider spreads: the rules are followed there on paper only, to see whether anything pays them.'));
    if (H) {
      const a = H.all, v = a.n < 30 ? `Too few weekend signals in the history to read: ${a.n}.` : a.mR > 0 ? `In the history the weekend paid its costs: ${rtxt(a.mR)} a trade after costs over ${a.n.toLocaleString('en-US')} signals. To be seen live before any money.` : `In the history nothing paid the weekend's costs: ${rtxt(a.gR)} a trade before costs, ${rtxt(a.mR)} after, over ${a.n.toLocaleString('en-US')} signals.`;
      box.appendChild(el('div', 'g-line t-labwkv', v));
      const sp = Object.keys(H.rules || {}).sort((x, y) => +x - +y).filter((k) => H.rules[k].n);
      if (sp.length) { const tb = table(box, ['Bars', 'Signals', 'Before costs', 'After costs'], 't-t4 t-labwkt'); for (const k of sp) { const c = H.rules[k], r = H.random && H.random[k]; row(tb, barName(k), `costs ${c.c0.toFixed(2)} R${r && r.n ? ` · random ${rtxt(r.mR)}` : ''}`, [c.n.toLocaleString('en-US'), rtxt(c.gR), [rtxt(c.mR), sign(c.mR)]], 't-labwkrow'); } }
      box.appendChild(el('div', 'g-hint t-labwkh', `Weekend sessions of the history${H.from ? ` since ${new Date(H.from).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}, one trade a signal. Costs: the spread and fees known before the trade, in R (1 R is what the trade risks).${BW.costly ? ' ' + left(BW.costly) : ''}`));
    } else box.appendChild(el('div', 'g-hint t-labwkh', BW && BW.costly ? `In the history no weekend signal could be followed: for all ${BW.costly.toLocaleString('en-US')}, the spread and fees alone were more than the trade risks.` : 'No weekend session replayed in the history yet.'));
    const live = W && W.rules && W.rules.n ? `Live since ${when(W.since)}: ${W.rules.n} signal${W.rules.n === 1 ? '' : 's'} followed on paper, ${rtxt(W.rules.gR)} a trade before costs, ${rtxt(W.rules.mR)} after (costs ${W.rules.c0.toFixed(2)} R).` : 'Live: no weekend signal followed on paper yet.';
    box.appendChild(el('div', 'g-line t-labwklive', live + (W && W.costly ? ' ' + left(W.costly) : '')));
    box.appendChild(el('div', 'g-hint', 'None of this reaches the learner, the bar-length gates or the lessons. If something ever pays these spreads over many weekends, it shows here first.'));
  }
  // the shorts a lab cannot take (Revolut X sells nothing short), followed on paper at another venue's costs (Matteo, 22 Nov 2026:
  // "Yes add the paper only"): do they pay that fee, and do the rules' shorts beat random ones. By bar length: the fee is the same
  // share of the position everywhere, so it is many times the stop on fast bars and a fraction of it on slow ones.
  function shortsBox(box, key, L, D) {
    const B = LB.bt && LB.bt.labs && LB.bt.labs[key], H = B && B.shorts ? B.shorts : null, W = D && D.shorts ? D.shorts : null, I = H || W; if (!I) return;
    head(box, 'Shorts (paper only)');
    const num = (n) => n.toLocaleString('en-US'), sp = H ? Object.keys(H.rules || {}).sort((x, y) => +x - +y).filter((k) => H.rules[k].n) : [], solid = sp.filter((k) => H.rules[k].n >= 30);
    const best = solid.slice().sort((x, y) => H.rules[y].mR - H.rules[x].mR)[0], b = best ? H.rules[best] : null, br = best && H.random && H.random[best] && H.random[best].n >= 30 ? H.random[best] : null;
    const v = !sp.length ? 'No short replayed in the history yet.' : !b ? 'Too few shorts in the history to read yet.'
      : b.mR <= 0 ? `In the history no bar length's shorts pay ${I.venue}'s fee. The closest: ${barName(best)} bars, ${rtxt(b.gR)} a trade before costs, ${rtxt(b.mR)} after, over ${num(b.n)}.`
      : `In the history the shorts on ${barName(best)} bars paid ${I.venue}'s fee: ${rtxt(b.mR)} a trade after costs over ${num(b.n)}${br ? ` (random shorts ${rtxt(br.mR)})` : ''}. The best of ${solid.length} bar length${solid.length === 1 ? '' : 's'}, so partly luck: to be seen live.`;
    box.appendChild(el('div', 'g-line t-labshv', v));
    if (sp.length) {
      const tb = table(box, ['Bars', 'Shorts', 'Before costs', 'After costs'], 't-t4 t-labsht');
      for (const k of sp) { const c = H.rules[k], r = H.random && H.random[k]; row(tb, barName(k), `${r && r.n ? `random ${rtxt(r.gR)}, then ${rtxt(r.mR)}` : 'no random shorts'}${c.days ? ` · ${num(c.days)} day${c.days === 1 ? '' : 's'}` : ''}`, [num(c.n), rtxt(c.gR), [rtxt(c.mR), sign(c.mR)]], 't-labshrow'); }
    }
    const live = W && W.rules && W.rules.n ? `Live since ${when(W.since)}: ${W.rules.n} short${W.rules.n === 1 ? '' : 's'} closed, ${rtxt(W.rules.gR)} a trade before costs, ${rtxt(W.rules.mR)} after${W.open ? `; ${W.open} open` : ''}.`
      : W && W.since ? `Live since ${when(W.since)}: no short closed yet${W.open ? ` (${W.open} open)` : ''}.` : 'Live: no short signal yet.';
    box.appendChild(el('div', 'g-line t-labshlive', live));
    const list = W && Array.isArray(W.coins) ? W.coins : Array.isArray(I.coins) ? I.coins : null, coins = list ? list.length : I.coins;   // the live file names the coins, the history counts them
    box.appendChild(el('div', 'g-hint t-labshh', `No money follows these: Revolut X sells nothing short. Costs are ${I.venue}'s for a real account: ${(100 * I.fee).toFixed(2)}% of the position in and out, ${(100 * I.night).toFixed(3)}% a night, on the ${coins} coins it sells short${list ? ` (${list.join(', ')})` : ''}. One trade a signal; random shorts beside, since any short earns before costs while coins fall.`));
  }
  // every bar length tried on the history: one small chart a rule, the same scale on all three. A shape to read, not a winner to pick.
  const lenTxt = (m) => (m === 1440 ? '1 day' : m >= 60 && m % 60 === 0 ? `${m / 60} h` : `${m} min`), SOLID = 20, NS = 'http://www.w3.org/2000/svg';
  const svg = (tag, attrs, text) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (text != null) e.textContent = text; return e; };
  function scanBox(box, key, L) {
    const S = LB.scan && LB.scan.labs && LB.scan.labs[key]; if (!S || !S.rules) return;
    const rules = ['momo', 'revert', 'squeeze'].filter((r) => S.rules[r] && Array.isArray(S.rules[r].pts) && S.rules[r].pts.length); if (!rules.length) return;
    head(box, 'Every bar length, tried');
    const solid = (r) => S.rules[r].pts.filter((p) => p[1] >= SOLID), all = rules.flatMap(solid), ladder = [...new Set([L.venue === 'revx' ? 5 : 1, ...(L.entries || []).map((r) => +((/(\d+)$/.exec(r) || [])[1] || 0)).filter(Boolean)])].sort((a, b) => a - b);
    // a plateau: three or more neighbouring lengths that each earn; firm when by more than luck would give (the VM's verdict)
    const firm = (r) => (S.rules[r].plateau && S.rules[r].plateau.firm === true ? S.rules[r].plateau : null), flat = rules.filter(firm), inside = (pl) => ladder.filter((x) => x >= pl.from && x <= pl.to);
    const verdict = !all.length ? 'Too little history yet: no bar length has 20 trades of a rule.'
      : !flat.length ? 'No bar length earns after costs in this history: no rule has three neighbouring lengths that each earn by more than luck would give.'
      : flat.map((r) => { const pl = firm(r), own = inside(pl); return `${SHORT[r]} earns after costs on bars from ${lenTxt(pl.from)} to ${lenTxt(pl.to)}: ${rtxt(pl.mR)} a trade over ${pl.n.toLocaleString('en-US')}, ${pl.lengths} neighbouring lengths that each earn.${own.length ? ` The lab trades ${own.map(lenTxt).join(', ')} inside it.` : ''}`; }).join(' ') + ' Worth watching, not proof yet: neighbouring lengths share the same moves.';
    box.appendChild(el('div', 'g-line t-labscanv', verdict));
    if (all.length) {
      const step = (v) => (Math.abs(v) > 1 ? 0.5 : 0.25), nice = (v) => (v === 0 ? 0 : Math.sign(v) * Math.ceil(Math.abs(v) / step(v) - 1e-9) * step(v));   // the scale ends on quarters or halves
      const x0 = Math.log(Math.min(...rules.map((r) => S.rules[r].pts[0][0]))), x1 = Math.log(1440), lo = nice(Math.max(-2, Math.min(0, ...all.map((p) => p[3])))), hi = nice(Math.min(2, Math.max(0, ...all.map((p) => p[3])))), pad = Math.max(0.05, (hi - lo) * 0.06);
      const W = 340, H = 118, PL = 44, PR = 8, PT = 8, PB = 24, X = (m) => PL + (W - PL - PR) * (Math.log(m) - x0) / Math.max(1e-9, x1 - x0), Y = (v) => PT + (H - PT - PB) * (hi + pad - Math.max(lo, Math.min(hi, v))) / (hi - lo + 2 * pad);
      for (const r of rules) {
        const R = S.rules[r], pts = solid(r), thin = R.pts.filter((p) => p[1] < SOLID && p[1] >= 5), pl = firm(r), weak = pl ? null : R.plateau, best = R.best;
        const reading = !pts.length ? 'Too few trades at any length yet.'
          : pl ? `Earns from ${lenTxt(pl.from)} to ${lenTxt(pl.to)}: ${rtxt(pl.mR)} a trade over ${pl.n.toLocaleString('en-US')}.`
          : weak ? `A little above zero from ${lenTxt(weak.from)} to ${lenTxt(weak.to)} (${rtxt(weak.mR)} over ${weak.n.toLocaleString('en-US')} trades): not told from luck yet.`
          : best && best[3] > 0 ? `No run of lengths earns. Best single length: ${lenTxt(best[0])} (${rtxt(best[3])} over ${best[1]} trades); no neighbour confirms it, so it may be luck.`
          : `Loses at every length${best ? `; the least bad is ${lenTxt(best[0])} (${rtxt(best[3])})` : ''}.`;
        const wrap = box.appendChild(el('div', 't-labscan')); wrap.dataset.rule = r;
        wrap.appendChild(el('div', 't-labscan-t', SHORT[r] || r));
        const g = wrap.appendChild(svg('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `${SHORT[r] || r}: result a trade after costs, by bar length. ${reading}` }));
        for (const v of [...new Set([hi, 0, lo])]) { g.appendChild(svg('line', { class: v === 0 ? 'zero' : 'ax', x1: PL, x2: W - PR, y1: Y(v), y2: Y(v) })); g.appendChild(svg('text', { x: PL - 5, y: Y(v) + 3, 'text-anchor': 'end' }, v === 0 ? '0' : rtxt(v))); }
        for (const m of [1, 5, 15, 60, 240, 1440]) if (Math.log(m) >= x0 - 1e-9) g.appendChild(svg('text', { x: X(m), y: H - 3, 'text-anchor': m === 1440 ? 'end' : Math.log(m) <= x0 + 1e-9 ? 'start' : 'middle' }, lenTxt(m)));
        for (const m of ladder) if (Math.log(m) >= x0 - 1e-9) g.appendChild(svg('line', { class: 'lad', x1: X(m), x2: X(m), y1: H - PB + 2, y2: H - PB + 7 }));
        if (pl) g.appendChild(svg('rect', { class: 'band', x: X(pl.from) - 2, y: PT, width: Math.max(4, X(pl.to) - X(pl.from) + 4), height: H - PT - PB, rx: 3 }));
        for (const p of thin) if (p[3] >= lo && p[3] <= hi) g.appendChild(svg('circle', { class: 'thin', cx: X(p[0]), cy: Y(p[3]), r: 1.6 }));
        // the line joins neighbouring lengths only: it stops where a length has too few trades, and a length alone is a point
        const runs = []; let run = null; for (const p of R.pts) { if (p[1] >= SOLID) { if (!run) runs.push(run = []); run.push(p); } else run = null; }
        for (const q of runs) g.appendChild(q.length > 1 ? svg('polyline', { class: 'ln', points: q.map((p) => `${X(p[0]).toFixed(1)},${Y(p[3]).toFixed(1)}`).join(' ') }) : svg('circle', { class: 'pt', cx: X(q[0][0]), cy: Y(q[0][3]), r: 2.5 }));
        const cross = g.appendChild(svg('line', { class: 'cross', y1: PT, y2: H - PB, visibility: 'hidden' })), dot = g.appendChild(svg('circle', { class: 'dot', r: 4, visibility: 'hidden' }));
        const out = wrap.appendChild(el('div', 't-labscan-r', reading)), hit = g.appendChild(svg('rect', { class: 'hit', x: PL - 6, y: 0, width: W - PL - PR + 12, height: H }));
        if (pts.length) {
          const show = (ev) => { const b = g.getBoundingClientRect(), xv = (ev.clientX - b.left) * W / Math.max(1, b.width); let p = pts[0]; for (const q of pts) if (Math.abs(X(q[0]) - xv) < Math.abs(X(p[0]) - xv)) p = q;
            for (const [n, a] of [[cross, { x1: X(p[0]), x2: X(p[0]) }], [dot, { cx: X(p[0]), cy: Y(p[3]) }]]) { for (const k in a) n.setAttribute(k, a[k]); n.setAttribute('visibility', 'visible'); }
            out.textContent = `${lenTxt(p[0])} bars: ${rtxt(p[3])} a trade after costs (${rtxt(p[2])} before), ${p[1].toLocaleString('en-US')} trades`; out.classList.add('on'); };
          const hide = () => { cross.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); out.textContent = reading; out.classList.remove('on'); };
          hit.addEventListener('pointerdown', show); hit.addEventListener('pointermove', show); hit.addEventListener('pointerleave', hide); hit.addEventListener('pointercancel', hide);
        }
      }
      const d = SRApp.disclosure(box, `lab-${key}-scan`, 'The numbers'), tb = table(d, ['Bars', ...rules.map((r) => SHORT[r] || r)], rules.length === 3 ? 't-t4 t-labscant' : 't-labscant'), at = (r, m) => S.rules[r].pts.find((p) => p[0] === m);
      for (const m of [...new Set([...ladder, 60, 240, 1440])].sort((a, b) => a - b)) { if (!rules.some((r) => at(r, m))) continue; row(tb, lenTxt(m), '', rules.map((r) => { const p = at(r, m); return p ? [`${rtxt(p[3])} · ${p[1]}`, p[1] >= SOLID ? sign(p[3]) : 't-dim'] : '–'; }), 't-labscanrow'); }
      d.appendChild(el('div', 'g-hint', 'After costs, a trade, then the number of trades. Grey: under 20 trades, too few to read.'));
    }
    const first = Math.min(...rules.map((r) => S.rules[r].pts[0][0]));
    box.appendChild(el('div', 'g-hint t-labscanh', `Every bar length from ${lenTxt(first)} to 1 day (${S.lengths} of them), each rule with one standard exit, on the candles the VM keeps, with ${L.venue === 'revx' ? "Revolut X's" : "eToro's"} costs. The line is the result a trade after costs; it stops where a length has under 20 trades (grey dots). With this many lengths tried, the best single one is nearly always luck: only neighbouring lengths that each earn mean something (shaded when three or more do, by more than luck would give). That is why the lab trades a few spaced lengths live, the small marks under each chart, and not all of them. Made ${when(Date.parse(LB.scan.made))}; it reaches further as more candles are kept.`));
  }
  // how many combinations are under test, whether any stands out from luck, and which splits of the history differ beyond luck
  const luckN = (x) => (x >= 10 ? String(Math.round(x)) : x >= 1 ? x.toFixed(1) : x >= 0.01 ? x.toFixed(2) : 'under 0.01');
  const MARKET = { 18: 'GOLD', 32: 'GER40', 28: 'NSDQ100', 27: 'SPX500', 1: 'EURUSD', 5: 'USDJPY', 17: 'OIL' }, DIM = { rule: 'Rule', speed: 'Bar length', align: 'Place in the trend', asset: 'Market', side: 'Buys or shorts', exit: 'Exit', higher: 'Higher trend', pace: 'Market pace', hour: 'Time of day', move: 'Trending or choppy' };
  const CXV = { higher: { with: 'with it', against: 'against it', flat: 'flat' }, pace: { calm: 'calm', usual: 'usual', busy: 'busy' }, move: { trending: 'trending', mixed: 'mixed', choppy: 'choppy' }, hour: { morning: '07-12', midday: '12-16', late: '16-21', asia: '00-07', europe: '07-13', us: '13-21', night: '21-24' } };
  const dimName = (dim, k) => (CXV[dim] ? CXV[dim][k] || k : dim === 'rule' ? SHORT[k] || k : dim === 'speed' ? barShort(k) : dim === 'align' ? ALIGN_S[k] || k : dim === 'asset' ? MARKET[k] || String(k).replace(/-USD$/, '') : dim === 'side' ? (k === 'long' ? 'buys' : 'shorts') : EXIT_S[k] || k);
  // the lessons the lab has learned by itself: circumstances in which a setup loses clearly more than luck would give (learn.js)
  function lessonsBox(box, key, L, D) {
    const live = (D && D.lessons) || [], B = LB.bt && LB.bt.labs && LB.bt.labs[key], bl = B && B.lessons;
    if (!(D && D.lessonK != null) && !bl) return;
    head(box, 'Lessons learned');
    const K = (D && D.lessonK) || (bl && bl.K) || 0;
    box.appendChild(el('div', 'g-line t-lablessonv', live.length ? `${live.length} lesson${live.length === 1 ? '' : 's'} in force: the money stays out of these signals, and paper keeps following them so a lesson that stops being true is dropped.`
      : `No lesson in force: among ${K.toLocaleString('en-US')} circumstances tested (the higher trend, trending or choppy markets, the market's pace, the time of day), none loses clearly more than luck would give.`));
    for (const l of live) {
      const r = box.appendChild(el('div', 't-lablesson'));
      r.appendChild(el('div', 't-lablesson-t', `${l.who}: no money when ${l.when}`));
      r.appendChild(el('div', 't-lablesson-s', `${rtxt(l.m)} a signal over ${Number(l.n).toLocaleString('en-US')}, against ${rtxt(l.mr)} over ${Number(l.nr).toLocaleString('en-US')} otherwise${l.since ? ` · since ${when(l.since)}` : ''}`));
    }
    if (bl && bl.kept && bl.kept.n) box.appendChild(el('div', 'g-hint t-lablessonbt', bl.skipped && bl.skipped.n
      ? `In the history, walked forward: the lessons known at each signal kept the money out of ${bl.skipped.n.toLocaleString('en-US')} signals that went on to make ${rtxt(bl.skipped.mR)} each; the ones let through made ${rtxt(bl.kept.mR)}.`
      : `In the history, walked forward, no lesson was found that kept the money out of anything: ${bl.kept.n.toLocaleString('en-US')} signals, ${rtxt(bl.kept.mR)} each.`));
    for (const [dim, name] of [['higher', 'By the higher trend'], ['move', 'By trending or choppy markets']]) {
      const hg = B && (B.splits || []).find((x) => x.dim === dim); if (!hg) continue;
      const d = box.appendChild(el('div', 'g-hint t-lablessonhg', `${name} in the history: best ${dimName(dim, hg.best[0])} (${rtxt(hg.best[1])} a signal over ${hg.best[2].toLocaleString('en-US')}), worst ${dimName(dim, hg.worst[0])} (${rtxt(hg.worst[1])} over ${hg.worst[2].toLocaleString('en-US')}); luck explains ${pct0(hg.luck)} of the difference.`)); d.dataset.dim = dim;
    }
    box.appendChild(el('div', 'g-hint', 'The lab learns and drops lessons by itself, from its paper trades and its history, with no new version of the app: each one appears here and in the journal. A lesson must lose after costs, 0.15 R a signal worse than the rest, and stand out from luck among every circumstance tested.'));
  }
  function searchBox(box, key, L, D) {
    const B = LB.bt && LB.bt.labs && LB.bt.labs[key], S = (D && D.search) || (B && B.search); if (!S || !(S.K >= 0)) return;
    head(box, 'How many strategies, and is any beyond luck?');
    const live = !!(D && D.search), need = (e) => Math.ceil(Math.pow(S.z * 1.2 / e, 2) / 10) * 10;
    const kTxt = `${S.K.toLocaleString('en-US')} combinations in this lab's search${S.J != null && S.J < S.K ? ` (${S.J.toLocaleString('en-US')} with 20 trades${live ? ' on live prices' : ''} so far)` : ''}`;
    const verdict = S.z == null ? `${kTxt}: too few to compare yet.`
      : S.beyond > 0 ? `${kTxt}; ${S.beyond} stand${S.beyond === 1 ? 's' : ''} out from luck${S.near > S.beyond ? `, ${S.near - S.beyond} more ${S.near - S.beyond === 1 ? 'is' : 'are'} close` : ''}. About one in ten of those may still be luck.`
      : `${kTxt}; none stands out from luck yet${S.near > 0 ? ` (${S.near} ${S.near === 1 ? 'is' : 'are'} close)` : ''}. No setup gets more than ${S.near > 0 ? 'the half stake' : 'the test stake'}.`;
    box.appendChild(el('div', 'g-line t-labsearchv', verdict));
    if (S.z != null) box.appendChild(el('div', 'g-hint t-labsearchz', `A combination is a rule, on one bar length, in one place against the trend, with one exit. With this many tried, the best one must stand ${S.z.toFixed(1)} standard errors above zero before the full stake: an edge of 0.2 R a trade needs about ${need(0.2).toLocaleString('en-US')} trades of that one combination to show, 0.1 R about ${need(0.1).toLocaleString('en-US')}. More strategies raise that bar; more trades for each are what help.`));
    if (B && B.was && B.was.n && B.picked) box.appendChild(el('div', 'g-hint t-labsearchwas', `In the history: what the learner promoted before this test went on to make ${rtxt(B.was.mR)} a trade over ${B.was.n.toLocaleString('en-US')}; with the test it ${B.picked.n ? `promotes ${B.picked.n.toLocaleString('en-US')} (${rtxt(B.picked.mR)} a trade)` : 'promotes none'}.`));
    const sp = (B && B.splits) || [];
    if (sp.length) {
      const tb = table(box, ['The history split by', 'Groups', 'Luck explains', 'So'], 't-t4 t-labsplits');
      for (const x of sp) row(tb, DIM[x.dim] || x.dim, `best ${dimName(x.dim, x.best[0])} ${rtxt(x.best[1])} · worst ${dimName(x.dim, x.worst[0])} ${rtxt(x.worst[1])}`, [String(x.J), pct0(x.luck), x.luck >= 0.8 ? 'luck' : x.luck <= 0.4 ? ['real', 'up'] : 'unclear'], 't-labsplit');
      box.appendChild(el('div', 'g-hint', '"Luck explains": the share of the spread between the groups that chance alone would give. Near 100%, the groups do not differ in any way that shows yet, so choosing among them is choosing noise. A low figure is where a real difference is, good or bad.'));
    }
  }
  // the paper record by the bars the rules read: where the spread and eToro's fee leave something
  function speedsBox(box, key, L, D) {
    const S = D && D.speeds; if (!S || !Object.keys(S).length) return;
    head(box, 'Which speed pays its costs?');
    const tb = table(box, ['Bars', 'Paper trades', 'Before costs', 'After costs'], 't-t4 t-labspeeds');
    for (const k of Object.keys(S).sort((a, b) => +a - +b)) {
      const r = S[k]; if (!r || !(r.rules.n || r.random.n)) continue;
      row(tb, barName(k), r.random.n ? `random entries: ${rtxt(r.random.mR)} over ${r.random.n}` : '', [String(r.rules.n), r.rules.n ? rtxt(r.rules.gR) : '–', [r.rules.n ? rtxt(r.rules.mR) : '–', r.rules.n ? sign(r.rules.mR) : '']], 't-labspeed');
    }
    box.appendChild(el('div', 'g-hint', L.venue === 'revx' ? 'Every paper trade of the rules, by the bars the rule reads (the lab\'s own rules read 5-minute bars, with stops from 15-minute ones). The gap between the two columns is what the spread and Revolut X\'s 0.09% fee take: it shrinks on slower bars.' : 'Every paper trade of the rules, by the bars the rule reads, all built from eToro\'s 1-minute prices. The gap between the two columns is what the spread and eToro\'s fee take: it shrinks on slower bars, where the same money at risk needs a smaller position.'));
  }
  function reviewBox(box, D) {
    const rv = D && D.report && D.report.review; if (!rv) return;
    head(box, 'What went well, what went wrong');
    if (rv.note) { box.appendChild(el('div', 'g-hint', rv.note)); return; }
    const list = (title, items, cls) => { if (!items.length) return; const w = box.appendChild(el('div', 't-labrev ' + cls)); w.appendChild(el('b', '', title)); const ul = w.appendChild(el('ul')); for (const s of items) ul.appendChild(el('li', '', s)); };
    list('Went well', rv.well || [], 'up'); list('Went wrong', rv.wrong || [], 'down');
    box.appendChild(el('div', 'g-hint', `On its last ${rv.n} trades. R: the money risked on a trade (+1 R won what it risked). Each losing trade below says why it lost and what would have won on the same signal; the lab learns from these counts, not from one trade.`));
  }
  function journalBox(box, key, L, D) {
    const J = ((D && D.journal) || L.journal || []).slice().reverse();
    head(box, 'How it corrects itself');
    box.appendChild(el('div', 'g-line', 'After every closed paper trade each setup (a rule, in one place in the trend) is scored again. A setup has no money until its paper record leans its way; then its stake moves between a test stake, half and full. The exit changes only when another clearly does better; losses in a row and a falling value cut all stakes.'));
    if (!J.length) { box.appendChild(el('div', 'g-hint', 'No change yet: a setup gets its test stake once its paper record leans its way.')); return; }
    const line = (w, j) => { const r = w.appendChild(el('div', 't-labj ' + (j.k === 'up' ? 'up' : j.k === 'down' ? 'down' : j.k === 'risk' ? 'risk' : j.k === 'lesson' ? 'lesson' : ''))); r.appendChild(el('span', 't-labjt', when(j.t))); r.appendChild(el('span', '', j.s)); };
    const w = box.appendChild(el('div', 't-labjournal')); for (const j of J.slice(0, 6)) line(w, j);
    if (J.length > 6) { const d = SRApp.disclosure(box, `lab-${key}-journal`, `${J.length - 6} earlier changes`); const w2 = d.appendChild(el('div', 't-labjournal')); for (const j of J.slice(6, 80)) line(w2, j); }
  }
  // with the trend or against it: every paper signal counted once, buys and shorts apart, next to random entries
  function trendBox(box, key, L, D) {
    head(box, 'With the trend or against it?');
    const T = D && D.trend; if (!T) { box.appendChild(el('div', 'g-hint', 'Counted from the lab\'s full report.')); return; }
    const agg = (tab) => { const o = {}; for (const [k, v] of Object.entries(tab || {})) { const [a, side] = k.split('|'), id = a + '|' + side, r = o[id] || (o[id] = { n: 0, w: 0, sR: 0 }); r.n += v.n; r.w += v.w; r.sR += (v.mR || 0) * v.n; } return o; };
    const R = agg(T.rules), X = agg(T.random), total = Object.values(R).reduce((s, r) => s + r.n, 0), sides = L.short ? ['long', 'short'] : ['long'];
    const sumOf = (tab, aligns) => { let n = 0, s = 0; for (const a of aligns) for (const sd of sides) { const r = tab[a + '|' + sd]; if (r) { n += r.n; s += r.sR; } } return { n, m: n ? s / n : null }; };
    const withT = sumOf(R, ['with']), agT = sumOf(R, ['against', 'reversal']);
    const verdict = withT.n >= 30 && agT.n >= 30 ? (withT.m > agT.m + 0.05 ? `So far trades with the trend do better: ${rtxt(withT.m)} a signal against ${rtxt(agT.m)} for those against it.` : agT.m > withT.m + 0.05 ? `So far trades against the trend do better: ${rtxt(agT.m)} a signal against ${rtxt(withT.m)} with it.` : `So far no real difference: ${rtxt(withT.m)} with the trend, ${rtxt(agT.m)} against it.`)
      : `Too early to say: ${withT.n} signals with the trend and ${agT.n} against it so far (30 of each for a first answer, a few hundred to trust it).`;
    box.appendChild(el('div', 'g-line', verdict));
    if (total) {
      const tb = table(box, ['Paper signals', 'Count', 'Won', 'Per signal'], 't-t4 t-labtrend');
      for (const a of ['with', 'pullback', 'reversal', 'against']) for (const sd of sides) {
        const r = R[a + '|' + sd], x = X[a + '|' + sd]; if (!r && !x) continue;
        row(tb, `${sd === 'long' ? 'Buys' : 'Shorts'} · ${ALIGN[a]}`, x && x.n ? `random entries: ${rtxt(x.sR / x.n)} over ${x.n}` : '', [String(r ? r.n : 0), r && r.n ? pct0(r.w / r.n) : '–', [r && r.n ? rtxt(r.sR / r.n) : '–', r && r.n ? sign(r.sR) : '']]);
      }
      box.appendChild(el('div', 'g-hint', `Each signal counted once (${T.exit === 'wide' ? 'stop 3.5 ATR, target 5.25' : 'stop 1.5 ATR, target 2.25'}), after costs. ` + 'Trend: 15-minute candles against their 50-bar average; "dip or bounce" and "early reversal" also use the 5-minute trend. Random entries with the same exit are the yardstick: they show what the market alone paid.'));
    }
    const slow = T.slow && agg(T.slow.rules), sTot = slow ? Object.values(slow).reduce((s, r) => s + r.n, 0) : 0;
    if (sTot > total) {
      const d = SRApp.disclosure(box, `lab-${key}-slowtrend`, `Since the start, by the slower trend alone (${sTot} signals)`), tb = table(d, ['Paper signals', 'Count', 'Won', 'Per signal'], 't-t4 t-labtrend');
      for (const a of ['with', 'against', 'flat']) for (const sd of sides) { const r = slow[a + '|' + sd]; if (r && r.n) row(tb, `${sd === 'long' ? 'Buys' : 'Shorts'} · ${a === 'flat' ? 'price across its average' : a === 'with' ? 'with the trend' : 'against the trend'}`, '', [String(r.n), pct0(r.w / r.n), [rtxt(r.sR / r.n), sign(r.sR)]]); }
    }
    // each market's trend now, and its last turns
    const info = (D.info || L.info || []).filter((a) => a.phase && a.phase !== 'unknown');
    if (info.length) {
      head(box, 'Trend of each market now');
      const w = box.appendChild(el('div', 't-labphases'));
      for (const a of info) { const c = w.appendChild(el('span', 't-labphase ' + (/^up/.test(a.phase) ? 'up' : /^down/.test(a.phase) ? 'down' : 'turn'))); c.appendChild(el('b', '', a.sym)); c.appendChild(document.createTextNode(' ' + (PHASE[a.phase] || a.phase) + (a.since ? ' since ' + hm(a.since) : '') + (a.open === false ? ' · closed' : ''))); }
    }
    const turns = (D.turns || []).slice(-8).reverse();
    if (turns.length) {
      const d = SRApp.disclosure(box, `lab-${key}-turns`, `Last trend turns (${turns.length})`);
      for (const t of turns) d.appendChild(el('div', 'g-line t-labturn', `${when(t.t)} · ${t.sym}: ${SLOW[t.from] || t.from} → ${SLOW[t.to] || t.to}${t.px ? ' at ' + px(t.px) : ''}`));
    }
  }
  function setupsBox(box, key, L, D) {
    const S = ((D && D.setups) || L.setups || []).slice().sort((a, b) => (RANK[b.tier] - RANK[a.tier]) || ((b.p || 0) - (a.p || 0)));
    head(box, 'Setups and their stakes');
    if (!S.length) { box.appendChild(el('div', 'g-hint', 'No paper trade closed yet under the new learner.')); return; }
    const many = (L.styles || []).length > 1, tb = table(box, ['Setup', 'Stake', 'Chance', 'Expected'], 't-t4 t-labsetups');
    const shown = LB.more['setups' + key] ? S : S.slice(0, 8);
    for (const s of shown) row(tb, `${short(s.rule)} · ${ALIGN_S[s.align] || s.align}`, `${EXIT_S[s.exit] || s.exit}${many ? (s.style === 'wait' ? ', waiting buy' : ', buys at once') : ''} · ${s.n} trades${s.fresh ? ` · confirming: ${s.fresh.n} of ${s.fresh.need} new trades${s.fresh.n && s.fresh.m != null ? ` (${rtxt(s.fresh.m)})` : ''}` : ''}${s.lucky != null && s.n >= 20 ? ` · luck alone gives ${luckN(s.lucky)} this good` : ''}`, [[TIER[s.tier] || s.tier, s.tier === 'bench' ? 'down' : RANK[s.tier] >= 2 ? 'up' : ''], s.p == null ? '–' : pct0(s.p), [rtxt(s.m), sign(s.m)]], 't-labsetup');
    if (S.length > 8 && !LB.more['setups' + key]) { const b = box.appendChild(el('button', 'btn t-labmore', `Show all ${S.length}`)); b.type = 'button'; b.addEventListener('click', () => { LB.more['setups' + key] = true; LB.bodySig = ''; paint(); }); }
    box.appendChild(el('div', 'g-hint', 'Chance: how likely the setup earns after costs, from its paper trades (recent ones weigh more; few trades lean on the rule\'s wider record). Expected: R per trade. Test stake until 20 trades; half from 60%; full from 75%, ahead of random entries at the same speed, and only once 10 new trades since the half stake have earned too; benched under 25%. Since 17 Nov a bigger stake also needs a record that luck alone would rarely give among all the combinations under test ("luck alone gives…": how many as good as this one chance would produce; it must be well under 1).'));
    const V = (D && D.vetoes) || []; if (V.length) box.appendChild(el('div', 'g-hint', 'Blocked on one market: ' + V.map((v) => `${v.sym} ${v.side === 'long' ? 'buys' : 'shorts'} (${short(v.rule)}, ${ALIGN_S[v.align]}: ${rtxt(v.m)})`).join(' · ') + '.'));
  }
  function closedBox(box, key, L, D) {
    const C = ((D && D.closed) || L.closed || []).slice().reverse(), show = LB.more['closed' + key] ? 60 : 10;
    head(box, `Closed trades${C.length ? ` (last ${Math.min(show, C.length)})` : ''}`);
    if (!C.length) { box.appendChild(el('div', 'g-hint', 'None closed yet.')); return; }
    const tb = table(box, ['Trade', 'Ended by', 'Costs', 'Result'], 't-t4 t-labclosed');
    // the post-mortem of a losing trade: why it lost, and what would have won on the same signal (other exits, the opposite side)
    const exitName = (k) => { const [x, st] = k.split('/'); return `${EXIT_S[x] || x}${st ? (st === 'wait' ? ', waiting buy' : ', bought at once') : ''}`; };
    const wouldWin = (c) => {
      if (!c.alt) return '';
      const w = Object.entries(c.alt.exits || {}).filter(([k, r]) => r > 0 && k.split('/')[0] !== c.exit).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k, r]) => `${exitName(k)} (${rtxt(r)})`);
      if (c.alt.mirror > 0) w.push(`the opposite side (${rtxt(c.alt.mirror)})`);
      return w.length ? ` Would have won: ${w.join('; ')}.` : Object.keys(c.alt.exits || {}).length >= 3 ? ' No other exit of this signal won' + (c.alt.mirror != null ? ', nor the opposite side.' : '.') : '';
    };
    for (const c of C.slice(0, show)) {
      row(tb, `${c.sym} ${c.dir > 0 ? 'buy' : 'short'}`, `${when(c.t1)} · ${span(c.t1 - c.t0)} · ${short(c.rule)}${c.align && c.align !== 'unknown' ? ' · ' + ALIGN_S[c.align] : ''}${c.tier ? ' · ' + (TIER[c.tier] || '') : ''}`, [c.how, '$' + (+c.cost).toFixed(2), [`${usd2(c.net)} (${rtxt(c.R)})`, sign(c.net)]]);
      if (c.net < 0 && c.why) tb.appendChild(el('div', 't-l2 t-labl2 t-labwhy', `Why: ${c.why}.${wouldWin(c)}`));
    }
    if (C.length > show) { const b = box.appendChild(el('button', 'btn t-labmore', `Show ${Math.min(60, C.length)} trades`)); b.type = 'button'; b.addEventListener('click', () => { LB.more['closed' + key] = true; LB.bodySig = ''; paint(); }); }
  }
  function breakdownBox(box, key, D) {
    const by = D && D.report && D.report.by; if (!by || !by.asset) return;
    const d = SRApp.disclosure(box, `lab-${key}-by`, 'Its trades by market, rule, trend, hour and ending');
    const one = (title, dim, name, order) => {
      const rows = Object.entries(by[dim] || {}); if (!rows.length) return;
      rows.sort(order || ((a, b) => b[1].net - a[1].net)); head(d, title);
      const tb = table(d, [title, 'Trades', 'Won', 'Result'], 't-t4');
      for (const [k, r] of rows) row(tb, name ? name(k) : k, rtxt(r.R) + ' a trade', [String(r.n), pct0(r.w / r.n), [usd2(r.net), sign(r.net)]]);
    };
    one('Market', 'asset'); one('Rule', 'rule', short); one('Bars of the rule', 'speed', barName, (a, b) => +a[0] - +b[0]); one('Place in the trend', 'align', (k) => ALIGN[k] || k); one('Side', 'side', (k) => (k === 'long' ? 'Buys' : 'Shorts'));
    one('Stake', 'tier', (k) => TIER[k] || k); one('Ended by', 'how');
    one('Hour it opened', 'hour', (k) => { const t = new Date(); t.setUTCHours(+k, 0, 0, 0); return hm(t.getTime()); }, (a, b) => +a[0] - +b[0]);
  }
  function restBox(box, key, L, D) {
    const sps = [...new Set((L.entries || []).map((r) => +((/(\d+)$/.exec(r) || [])[1] || 0)).filter(Boolean))].sort((a, b) => a - b), ladder = (own) => { const all = [own, ...sps.filter((x) => x !== own)], min = all.filter((x) => x < 60), slow = all.filter((x) => x >= 60).map(barName); return `${min.join('-, ')}-minute${slow.length ? `, ${slow.join(', ')}` : ''} bars`; };
    const names = L.assets.join(', '), cap = L.venue === 'revx' ? 'Buys only, no leverage (Revolut X lends nothing). A buy either waits at the bid (no fee) or is made at once (0.09%), whichever has done better for the setup; a stop sells at once (0.09%). ' + (sps.length ? `The rules run on ${ladder(5)}.` : '') : `Long and short, only at eToro's leverage steps (1, 2, 5, 10, 20${key === 'gold' ? '' : '; oil up to 10, currencies up to 30'}). Costs as on a real account: the spread, plus eToro's fee when a trade opens and when it closes (${key === 'gold' ? '0.01% each time' : 'gold 0.01%, indices 0.007%, EUR/USD 0.005%, USD/JPY 0.002%, oil 0.04%'}). The rules run on ${ladder(1)}, all built from eToro's 1-minute prices. Trades of the rules up to 30 minutes are closed by 20:50 UTC, before eToro's nightly fee. Trades of the rules on 1-hour bars or slower may stay open for days: each night they pay eToro's overnight fee (gold bought about 0.022% of the position a night, three nights at once on Wednesday; the indices on Friday).`;
    head(box, 'Rules of this lab');
    box.appendChild(el('div', 'g-line', `${names} at ${L.venue === 'revx' ? "Revolut X's" : "eToro's"} live prices. ${cap}`));
    if ((L.entries || []).includes('tom1440')) box.appendChild(el('div', 'g-hint t-labextra', 'Three more rules, on the three stock indices only, each with evidence behind it: a move out of the usual range for the time of day (30-minute bars, inside the stock exchange\'s hours); a 7-day low while above the 200-day average (buy the bounce); the turn of the month (bought on the last weekday, held to the third weekday of the next month). Like every rule they trade on paper first and get money only if their record stands out from luck.'));
    box.appendChild(el('div', 'g-hint', 'One trade per market and per group of linked markets, at most 3 open. A trade risks 0.1% to 0.5% of the lab, by its setup\'s record. No new trade after a 3% loss in the day. Below $600 the lab settles and starts again at $2,000, keeping its lessons.'));
    if (L.resets && L.resets.length) { const d = SRApp.disclosure(box, `lab-${key}-resets`, `${L.resets.length} reset${L.resets.length === 1 ? '' : 's'} · all-cycle result ${usd2(L.lifetimeNet)}`); d.classList.add('t-labresets'); d.appendChild(el('div', 'g-hint', `Added paper money: ${usd(L.added)}. This is excluded from the all-cycle result.`)); for (const r of L.resets.slice(-10).reverse()) d.appendChild(el('div', 'g-line', `Cycle ${r.cycle} · ${when(r.at)} · ended ${usd(r.equity)} · result ${usd2(r.net)} · ${r.trades} trades`)); }
    // Matteo's idea: out at +$1 net, against the other exits and random entries
    if (D && D.latency > 0) box.appendChild(el('div', 'g-hint t-lablag', `An order "at once" is filled at the first price at least ${D.latency / 1000} seconds after its signal, as a real order would be.${D.lag ? ` So far the delay has ${D.lag.atr > 0 ? 'cost' : 'gained'} ${Math.abs(D.lag.atr).toFixed(3)} ATR a signal (${D.lag.n.toLocaleString('en-US')} signals).` : ''}`));
    // how long a trade may last is learned, per bar length and exit (a VM not updated yet does not send it)
    if (D && Array.isArray(D.hold)) { const moved = D.hold.filter((h) => h.k !== 1); box.appendChild(el('div', 'g-hint t-labhold', 'A trade\'s stop, target and time limit are fixed when it opens. The time limit itself is learned: longer when paper trades that ran out of time would have done better by waiting, shorter when they were better at half time. ' + (moved.length ? 'Now: ' + moved.slice(0, 6).map((h) => { const [sp, x] = h.key.split('|'); return `${barName(sp)} bars, ${EXIT_S[x] || x}: ${h.k}× the usual`; }).join(' · ') + '.' : 'None has moved yet.'))); }
    const st = L.stats || {}, rules = L.entries.filter((r) => !isRandom(r)), mean = (rows, k) => { const n = rows.reduce((a, r) => a + r.n, 0); return n ? rows.reduce((a, r) => a + (r[k] || 0) * r.n, 0) / n : null; };
    const qs = rules.map((r) => (st[r] || {}).quick).filter(Boolean), qn = qs.reduce((a, q) => a + q.n, 0), qw = qs.reduce((a, q) => a + q.w, 0), others = ['tight', 'base', 'trail', 'wide'].map((x) => rules.map((r) => (st[r] || {})[x]).filter(Boolean)).flat(), rnd = (st.random || {}).quick;
    head(box, 'Your idea: out at +$1 net');
    const I = L.idea;
    if (I && I.quick) box.appendChild(el('div', 'g-line', I.quick.n ? `${I.quick.n.toLocaleString('en-US')} paper trades: ${pct0(I.quick.w / I.quick.n)} won, ${rtxt(I.quick.mR)} per trade after costs (${rtxt(I.quick.mG)} before). The other exits: ${rtxt(I.others.mR)}. Random entries with this exit: ${rtxt(I.random.mR)}.${I.quick.n < 100 ? ' Too early: fewer than 100 trades.' : ''}` : 'Every signal is also followed with this exit: out as soon as the trade has made $1 after all costs (for each $10 risked), or at its stop.'));
    else box.appendChild(el('div', 'g-line', qn ? `${qn} paper trades: ${pct0(qw / qn)} won, ${rtxt(mean(qs, 'mR'))} per trade after costs (${rtxt(mean(qs, 'mG'))} before). The other exits: ${rtxt(mean(others, 'mR'))}. Random entries with this exit: ${rtxt(rnd ? rnd.mR : null)}.${qn < 100 ? ' Too early: fewer than 100 trades.' : ''}` : 'Every signal is also followed with this exit: out as soon as the trade has made $1 after all costs (for each $10 risked), or at its stop.'));
    const sk = Object.entries(L.skipped || {}).sort((a, b) => b[1] - a[1]).slice(0, 6);
    if (sk.length) { const d = SRApp.disclosure(box, `lab-${key}-skipped`, `Signals the money did not take (${L.signals} signals so far)`); for (const [k, v] of sk) d.appendChild(el('div', 'g-line', `${k}: ${v}`)); }
    const errs = ((LB.sum.health || {}).errors || []).slice(-3); if (errs.length && Date.now() - errs[errs.length - 1][0] < 3600000) box.appendChild(el('div', 'g-hint', 'Last problems on the VM: ' + errs.map((e) => `${clock(e[0])} ${e[1]}`).join(' · ')));
  }

  function paint() {
    const root = LB.root; if (!root || !root.isConnected || root.closest('[hidden]')) return;
    if (!LB.sum) {
      if (LB.tv) { LB.tv.destroy(); LB.tv = null; } LB.R = null; root.textContent = '';
      const b = root.appendChild(el('button', 'btn t-labrefresh', LB.loading ? 'Reading…' : 'Refresh')); b.type = 'button'; b.disabled = LB.loading; b.addEventListener('click', () => { load(true); });
      root.appendChild(el('div', 'g-hint', LB.sumAt ? 'No lab report available. The lab runner must be installed and running on the VM, and this device needs the owner’s GitHub sync key.' : 'Reading the labs…')); return;
    }
    if (!sumLab(LB.sel)) LB.sel = 'gold';
    const R = LB.R && root.contains(LB.R.body) ? LB.R : skeleton(root), key = LB.sel, L = sumLab(key), V = valued(key), D = LB.det[key];
    if (!!LB.form !== !R.form.hidden || (LB.form && !R.form.childElementCount)) drawForm(R);
    want(); status(R); cards(R); top(R, L, V);
    const cf = key + '|' + LB.sum.made + '|' + (D ? D.made : '') + '|' + V.N.open.length; chart(R.chart, key, V, R.chart.dataset.for === cf ? 'tick' : 'data'); R.chart.dataset.for = cf;
    const sig = [key, LB.sum.made, D ? D.made : '', LB.live ? LB.live.made : '', LB.bt ? LB.bt.made : '', LB.scan ? LB.scan.made : '', JSON.stringify(LB.more)].join('|');
    if (sig !== LB.bodySig) {   // built aside and swapped in at once: the page does not jump
      LB.bodySig = sig; const f = document.createDocumentFragment(), P = {};
      for (const [k] of PANES) if (k !== 'all') { P[k] = f.appendChild(el('div', 't-labpane')); P[k].dataset.pane = k; }
      openBox(P.now, key, L, V); statsBox(P.now, L, D); trendBox(P.now, key, L, D);
      closedBox(P.trades, key, L, D); reviewBox(P.trades, D); breakdownBox(P.trades, key, D);
      backtestBox(P.history, key, L); weekendBox(P.history, key, L, D); shortsBox(P.history, key, L, D); speedsBox(P.history, key, L, D); scanBox(P.history, key, L);
      lessonsBox(P.learning, key, L, D); searchBox(P.learning, key, L, D); journalBox(P.learning, key, L, D); setupsBox(P.learning, key, L, D); restBox(P.learning, key, L, D);
      for (const k of Object.keys(P)) if (!P[k].childElementCount) P[k].appendChild(el('div', 'g-hint', 'Nothing here yet.'));
      R.body.replaceChildren(f);
    }
    panes(R);
    LB.lastPaint = Date.now();
  }
  // between two readings: the figures that follow the prices (cards, the value, the open trades, the last candle)
  function tick() {
    const root = LB.root, R = LB.R; if (!root || !R || !LB.sum || !root.isConnected || root.closest('[hidden]') || document.hidden) return;
    if (Date.now() - LB.lastTick < 250) return; LB.lastTick = Date.now();
    const key = LB.sel, L = sumLab(key), V = valued(key); if (!L || !V) return;
    for (const k of keysOf()) { const c = R.cards.querySelector(`[data-lab="${k}"]`), v = k === key ? V : valued(k), Lk = sumLab(k); if (!c || !v || !Lk) continue; const b = c.querySelector('.g-stat-v'), s = c.querySelector('.g-stat-s');
      b.textContent = usd(v.equity); b.className = 'g-stat-v ' + sign(v.total); tileSub(s, Lk, v); }
    const big = R.top.querySelector('[data-live="equity"]'); if (big) { const t = usd(V.equity); if (big.textContent !== t) big.textContent = t; }
    const sub = R.top.querySelectorAll('.t-sub b'); if (sub[0]) { sub[0].textContent = `${usd2(V.total)} (${pc(100 * V.total / L.start)})`; sub[0].className = sign(V.total); } if (sub[1] && V.day != null) { sub[1].textContent = usd2(V.day); sub[1].className = sign(V.day); }
    V.N.open.forEach((o, i) => { const r = R.body.querySelector(`[data-open="${o.id}"]`); if (!r) return; const cells = r.querySelectorAll(':scope > span'), v = V.rows[i]; if (cells[2]) { const t = px(v[1]); cells[2].textContent = t; cells[2].className = t.length > 9 ? 't-long' : ''; } if (cells[3]) { cells[3].textContent = usd2(v[0]); cells[3].className = sign(v[0]); } });
    if (LB.tv && LB.tv.key === key && !LB.tv.host.hidden) chart(R.chart, key, V, 'tick');
    const st = R.status.children[1]; if (st && /^Live/.test(st.textContent)) st.textContent = `Live · ${clock(Date.now())}`;
  }
  function start(root) {
    LB.root = root; paint(); load(false);
    if (!LB.timer) LB.timer = setInterval(() => {
      const r = LB.root, on = r && r.isConnected && !r.closest('[hidden]') && !document.hidden;
      if (!on) { if (LB.wanted && window.SRLive && SRLive.want) { SRLive.want('labs', []); LB.wanted = ''; } return; }
      if (!document.body.classList.contains('sheet-open')) { load(false); tick(); }
    }, 1000);
    if (!LB.untick && window.SRLive && SRLive.onTick) LB.untick = SRLive.onTick(tick);
  }
  dash.draw('tradelab', start);
  window.SRLabs = { state: LB, load, paint, tick, valueOf, valued, barsFor };   // for the tests
})();
