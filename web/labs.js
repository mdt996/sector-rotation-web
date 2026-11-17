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

  const KEYS = ['gold', 'etoro', 'crypto'], VENUE = { gold: 'etoro', etoro: 'etoro', crypto: 'revx' };
  const TFS = [['1', '1m'], ['5', '5m'], ['15', '15m'], ['60', '1h'], ['240', '4h'], ['1440', '1D']];
  const SHORT = { orb: 'Opening range', revert: 'Back to average', squeeze: 'Squeeze', momo: 'Push', breakout: 'Breakout', dip: 'Dip', random: 'Random' };
  // a rule on slower bars carries its speed in its name ("momo15": the push on 15-minute bars)
  const barName = (k) => (+k === 60 ? '1-hour' : +k === 240 ? '4-hour' : +k === 1440 ? 'daily' : `${k}-minute`), barShort = (k) => (+k === 60 ? '1 h' : +k === 240 ? '4 h' : +k === 1440 ? 'daily' : `${k} min`);
  const short = (r) => { const m = /^([a-z]+?)(\d+)$/.exec(r || ''); return m ? `${SHORT[m[1]] || m[1]} · ${barShort(m[2])}` : SHORT[r] || r || ''; }, isRandom = (r) => /^random\d*$/.test(r || '');
  const ALIGN = { with: 'with the trend', pullback: 'dip or bounce inside the trend', reversal: 'early reversal', against: 'against the trend', unknown: 'trend not known' };
  const ALIGN_S = { with: 'with trend', pullback: 'dip/bounce', reversal: 'reversal', against: 'against trend', unknown: 'trend unknown' };
  const TIER = { bench: 'Benched', probe: 'Test 0.1%', build: 'Half 0.25%', full: 'Full 0.5%' }, RANK = { bench: 0, probe: 1, build: 2, full: 3 };
  const PHASE = { up: 'rising', 'up-pullback': 'rising, pulling back', down: 'falling', 'down-bounce': 'falling, bouncing', 'turning-down': 'turning down', 'turning-up': 'turning up', flat: 'flat', unknown: 'trend not known yet' };
  const SLOW = { up: 'rising', down: 'falling', 'turning-down': 'turning down', 'turning-up': 'turning up' };
  const EXIT_S = { tight: '1 ATR stop and target', base: 'stop 1.5, target 2.25 ATR', trail: 'trailing stop', quick: 'out at +$1', wide: 'wide: stop 3.5, target 5.25 ATR' };

  const LB = { live: null, liveAt: 0, liveOk: 0, sum: null, sumAt: 0, det: {}, detAt: {}, loading: false, failed: false, sel: 'gold', tf: '5', style: 'candles', more: {}, root: null, R: null, tv: null, bodySig: '', timer: null, untick: null, lastPaint: 0, wanted: '' };
  try { const k = localStorage.getItem('sr.labSel'); if (KEYS.includes(k)) LB.sel = k; const c = JSON.parse(localStorage.getItem('sr.labChart') || '{}'); if (TFS.some((t) => t[0] === c.tf)) LB.tf = c.tf; if (c.style === 'line') LB.style = 'line'; } catch (e) { /* the gold lab, 5-minute candles */ }
  const keep = () => { try { localStorage.setItem('sr.labSel', LB.sel); localStorage.setItem('sr.labChart', JSON.stringify({ tf: LB.tf, style: LB.style })); } catch (e) { /* not kept */ } };

  // ---- reading ----
  const read = async (name) => { try { return window.SRSync && window.SRSync.getFile ? await window.SRSync.getFile(name) : null; } catch (e) { return null; } };
  const validSum = (j) => !!(j && Number.isFinite(Date.parse(j.made)) && Array.isArray(j.labs) && KEYS.every((k) => j.labs.some((l) => l && l.key === k && Number.isFinite(l.equity) && l.start > 0 && l.port && Array.isArray(l.open) && Array.isArray(l.assets) && Array.isArray(l.entries))));
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
      // the backtest: read once, then when the live file says a new one was made (once a day)
      const btMade = LB.bt ? Date.parse(LB.bt.made) : 0; now = Date.now();
      if (rev.bt > 0 && (rev.bt > btMade + 500 || force) && now - (LB.btAt || 0) >= (force ? 5000 : 600000)) { const j = await read('lab-backtest.json'); LB.btAt = Date.now(); got = true; if (j && j.labs && Number.isFinite(Date.parse(j.made))) LB.bt = j; }
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
    if (u > 0 && VENUE[key] === 'etoro' && window.SRLive && SRLive.quotes) {
      const q = SRLive.quotes.get(+o.a), conv = o.quote === 'USD' ? 1 : q && q.conv > 0 ? q.conv : 0;
      if (q && q.bid > 0 && q.ask > 0 && conv > 0 && Date.now() - q.got < 60000) { const slip = 0.25 * (q.ask - q.bid), p = o.dir > 0 ? q.bid - slip : q.ask + slip; return [o.dir * u * (p - o.e) * conv - fee0 - (+o.fee || 0) * u * p * conv, (q.bid + q.ask) / 2, true]; }
    }
    if (u > 0 && VENUE[key] === 'revx' && window.SRRevx && window.SRRevx.book) {
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
    const ids = new Set(); for (const k of KEYS) if (VENUE[k] === 'etoro') { const N = now(k); if (N) for (const o of N.open) if (+o.a > 0) ids.add(+o.a); }
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
    const bars = [...m.values()].sort((a, b) => a.b - b.b), last = bars[bars.length - 1];
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
    T.api = SRChart.create(host, { id: 'lab-' + key, rangeLabel: 'Value change', priceFormat: (v) => '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      height: () => (window.innerWidth >= 900 ? Math.max(380, Math.min(560, window.innerHeight - 420)) : 0),
      onFull: (on) => { if (on) T.api.slot.replaceChildren(hdr); else B.insertBefore(hdr, host); },
      onHover: (b) => { T.hover = b ? T.bars.find((k) => k.time === b.time) || null : null; say(T); } });
    const Lw = window.LightweightCharts, { chart: ch, candles } = T.api.lw(), blue = cssVar('--sr-c1', '#2563eb');
    T.candles = candles;
    T.line = ch.addSeries(Lw.AreaSeries || Lw.LineSeries, { lineColor: blue, topColor: 'rgba(37,99,235,0.22)', bottomColor: 'rgba(37,99,235,0.02)', color: blue, lineWidth: 2, priceLineVisible: false, lastValueVisible: true, visible: false }, 0);
    T.marks = Lw.createSeriesMarkers ? Lw.createSeriesMarkers(candles, []) : null;
    T.offBack = window.SRLive && SRLive.onBack ? SRLive.onBack(() => T.host.isConnected && T.api.back()) : null;
    T.destroy = () => { if (T.offBack) T.offBack(); try { T.api.destroy(); } catch (e) { /* gone */ } };
    return T;
  }
  function say(T) {
    const lg = T.legend, k = T.hover || T.bars[T.bars.length - 1]; if (!lg || !k) return; const d = k.close - k.open, f = (v) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    lg.textContent = ''; lg.appendChild(el('span', 't-leg-t', new Date(k.b).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })));
    for (const [n, v] of [['O', k.open], ['H', k.high], ['L', k.low], ['C', k.close]]) { lg.appendChild(el('span', 't-leg-k', n)); lg.appendChild(el('span', '', f(v))); }
    lg.appendChild(el('span', sign(d), `${usd2(d)} (${pc(k.open ? 100 * d / k.open : 0)})`));
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
      // readable marks: a lab with one market does not repeat its name on every arrow, and when many trades are in view only the
      // arrows and dots stay (the closed trades' list below has every figure)
      const one = Array.isArray(L.assets) && L.assets.length === 1, crowded = mk.length > 14;
      for (const m of mk) if (m.shape !== 'circle' ? one || crowded : crowded) m.text = '';
      mk.sort((a, b) => a.time - b.time); tv.marks.setMarkers(mk.slice(-90)); tv.host.dataset.marks = String(mk.length);
    }
    tv.host.dataset.bars = String(bars.length); tv.host.dataset.tf = LB.tf; say(tv);
    const lo = Math.min(...bars.map((k) => k.low)), hi = Math.max(...bars.map((k) => k.high)), first = bars[0];
    tv.note.textContent = `Since ${when(first.b)}: low ${usd(lo)}, high ${usd(hi)}. The same chart as the markets: drag, pinch or scroll to zoom, draw and measure, the square for the full view. ${tf <= 15 ? 'Arrows: a trade opened; dots: one closed, with its result.' : 'Dots: the trades closed in that candle, with their result.'} Dashed line: the $${L.start.toLocaleString('en-US')} it started with.${tf < 60 ? ' Minutes with nothing open are not drawn.' : ''}`;
  }

  // ---- the page ----
  function skeleton(root) {
    root.textContent = '';
    const R = { status: root.appendChild(el('div', 't-status t-labstatus')), warn: root.appendChild(el('div', 't-labwarn')), cards: root.appendChild(el('div', 'g-stats t-labcards')), top: root.appendChild(el('div', 't-labtop')),
      chart: root.appendChild(el('div', 't-labchartbox')), body: root.appendChild(el('div', 't-labbody')) };
    LB.R = R; LB.bodySig = ''; return R;
  }
  function status(R) {
    const S = R.status, made = LB.live ? Date.parse(LB.live.made) : LB.sum ? Date.parse(LB.sum.made) : 0, age = made ? Date.now() - made : null, slow = age == null || age > 6 * 60000;
    const stream = window.SRLive && SRLive.streamState ? SRLive.streamState() : null, any = KEYS.some((k) => { const v = valued(k); return v && v.live; });
    S.textContent = ''; S.appendChild(el('span', 't-dot ' + (slow ? 'off' : 'on')));
    S.appendChild(el('span', '', slow ? (age == null ? 'No report yet' : `VM report ${span(age)} ago: check the lab runner`) : any && stream && stream.ok ? `Live · ${clock(Date.now())}` : `VM report ${span(age)} ago`));
    S.appendChild(el('span', 't-sep', '·')); S.appendChild(el('span', '', 'Paper only: no order is ever sent'));
    const b = S.appendChild(el('button', 'btn t-labrefresh', LB.loading ? 'Reading…' : 'Refresh')); b.type = 'button'; b.disabled = LB.loading; b.addEventListener('click', () => { load(true); });
    R.warn.textContent = '';
    if (LB.failed && LB.sum) R.warn.appendChild(el('div', 'g-warn', 'Could not read a new lab report. Showing the last one.'));
    const H = (LB.live && LB.live.health) || null, hs = LB.sum && LB.sum.health;
    const et = H ? H.etoro : hs && hs.etoro && hs.etoro.state, rx = H ? H.revx : hs && hs.revx && hs.revx.state;
    if (!slow && ((et && et !== 'streaming') || (rx && rx !== 'live'))) R.warn.appendChild(el('div', 'g-hint', `Prices on the VM: eToro ${et || '?'}, Revolut X ${rx || '?'}.`));
  }
  function cards(R) {
    R.cards.textContent = '';
    for (const key of KEYS) {
      const L = sumLab(key), V = valued(key); if (!L || !V) continue;
      const n = L.cycleTrades == null ? L.port.n : L.cycleTrades, d = tile(R.cards, L.name, usd(V.equity), `${pc(100 * V.total / L.start)}${V.day != null ? ' · today ' + usd2(V.day) : ''} · ${n} trade${n === 1 ? '' : 's'}${V.N.open.length ? ' · ' + V.N.open.length + ' open' : ''}`, sign(V.total));
      d.classList.add('t-labcard'); d.dataset.lab = key; if (key === LB.sel) d.classList.add('on'); d.setAttribute('role', 'button'); d.tabIndex = 0;
      const pick = () => { if (LB.sel === key) return; LB.sel = key; keep(); LB.bodySig = ''; paint(); load(false); };
      d.addEventListener('click', pick); d.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') pick(); });
    }
  }
  function top(R, L, V) {
    const T = R.top; T.textContent = '';
    head(T, L.name);
    const box = T.appendChild(el('div', 't-top')), v = box.appendChild(el('div', 't-value', usd(V.equity))); v.dataset.live = 'equity';
    const sub = box.appendChild(el('div', 't-sub'));
    sub.appendChild(el('b', sign(V.total), `${usd2(V.total)} (${pc(100 * V.total / L.start)})`)); sub.appendChild(document.createTextNode(L.cycle > 1 ? ` in cycle ${L.cycle}` : ' since the start'));
    if (V.day != null) { sub.appendChild(el('span', 't-sep', '·')); sub.appendChild(el('b', sign(V.day), usd2(V.day))); sub.appendChild(document.createTextNode(V.N.day && V.N.day.stopped ? ' today (down 3%: no new trade until midnight UTC)' : ' today')); }
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
    for (const [k, name] of [['full', 'Full 0.5%'], ['build', 'Half 0.25%'], ['probe', 'Test 0.1%'], ['bench', 'Benched (not taken)']]) { const c = t[k]; if (c && c.n) row(tb, name, '', [String(c.n), pct0(c.won), [rtxt(c.mR), sign(c.mR)]], 't-labbtrow'); }
    if (rnd.n) row(tb, 'Random entries', 'the yardstick', [String(rnd.n), pct0(rnd.won), [rtxt(rnd.mR), sign(rnd.mR)]], 't-labbtrow');
    const sp = B.speeds || {}, keys = Object.keys(sp).sort((a, b) => +a - +b).filter((k) => sp[k].rules.n);
    if (keys.length) { const d = SRApp.disclosure(box, `lab-${key}-btspeeds`, 'The history by bar length'), tb2 = table(d, ['Bars', 'Paper trades', 'Before costs', 'After costs'], 't-t4'); for (const k of keys) row(tb2, barName(k), sp[k].random.n ? `random entries: ${rtxt(sp[k].random.mR)}` : '', [String(sp[k].rules.n), rtxt(sp[k].rules.gR), [rtxt(sp[k].rules.mR), sign(sp[k].rules.mR)]]); }
    if (B.best && B.best.length) box.appendChild(el('div', 'g-hint', 'Best in this history: ' + B.best.slice(0, 3).map((b) => `${short(b.rule)} ${ALIGN_S[b.align] || b.align} (${rtxt(b.m)} over ${b.n})`).join(' · ') + '.'));
    box.appendChild(el('div', 'g-hint', `${B.days} day${B.days === 1 ? '' : 's'} of history replayed ${when(Date.parse(LB.bt.made))}: ${B.n.toLocaleString('en-US')} paper trades with this lab's own rules, fees and sizes. Each trade is counted under the stake its setup had when it opened, from what was known until then: no hindsight. The venues give only a few days of candles; the VM now keeps them, so this gets deeper every day. Each rule starts live from what it made here; live trades confirm it or overturn it.`));
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
    box.appendChild(el('div', 'g-line', 'After every closed paper trade each setup (a rule, in one place in the trend) is scored again. Its stake moves between benched, a test stake, half and full; the exit changes when another does clearly better; losses in a row and a falling value cut all stakes.'));
    if (!J.length) { box.appendChild(el('div', 'g-hint', 'No change yet: every setup starts at the test stake until it has 20 paper trades.')); return; }
    const line = (w, j) => { const r = w.appendChild(el('div', 't-labj ' + (j.k === 'up' ? 'up' : j.k === 'down' ? 'down' : j.k === 'risk' ? 'risk' : ''))); r.appendChild(el('span', 't-labjt', when(j.t))); r.appendChild(el('span', '', j.s)); };
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
    for (const s of shown) row(tb, `${short(s.rule)} · ${ALIGN_S[s.align] || s.align}`, `${EXIT_S[s.exit] || s.exit}${many ? (s.style === 'wait' ? ', waiting buy' : ', buys at once') : ''} · ${s.n} trades${s.fresh ? ` · confirming: ${s.fresh.n} of ${s.fresh.need} new trades${s.fresh.n && s.fresh.m != null ? ` (${rtxt(s.fresh.m)})` : ''}` : ''}`, [[TIER[s.tier] || s.tier, s.tier === 'bench' ? 'down' : RANK[s.tier] >= 2 ? 'up' : ''], s.p == null ? '–' : pct0(s.p), [rtxt(s.m), sign(s.m)]], 't-labsetup');
    if (S.length > 8 && !LB.more['setups' + key]) { const b = box.appendChild(el('button', 'btn t-labmore', `Show all ${S.length}`)); b.type = 'button'; b.addEventListener('click', () => { LB.more['setups' + key] = true; LB.bodySig = ''; paint(); }); }
    box.appendChild(el('div', 'g-hint', 'Chance: how likely the setup earns after costs, from its paper trades (recent ones weigh more; few trades lean on the rule\'s wider record). Expected: R per trade. Test stake until 20 trades; half from 60%; full from 75%, ahead of random entries at the same speed, and only once 10 new trades since the half stake have earned too (a winner picked among many is partly luck); benched under 25%.'));
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
    const names = L.assets.join(', '), cap = L.venue === 'revx' ? 'Buys only, no leverage (Revolut X lends nothing). A buy either waits at the bid (no fee) or is made at once (0.09%), whichever has done better for the setup; a stop sells at once (0.09%). ' + (sps.length ? `The rules run on ${ladder(5)}.` : '') : `Long and short, only at eToro's leverage steps (1, 2, 5, 10, 20${key === 'gold' ? '' : '; oil up to 10, currencies up to 30'}). Costs as on a real account: the spread, plus eToro's fee when a trade opens and when it closes (${key === 'gold' ? '0.01% each time' : 'gold 0.01%, indices 0.007%, EUR/USD 0.005%, USD/JPY 0.002%, oil 0.04%'}). The rules run on ${ladder(1)}, all built from eToro's 1-minute prices. Trades of the rules up to 30 minutes are closed by 20:50 UTC, before eToro's nightly fee. Trades of the 1-hour, 4-hour and daily rules may stay open for days: each night they pay eToro's overnight fee (gold bought about 0.022% of the position a night, three nights at once on Wednesday; the indices on Friday).`;
    head(box, 'Rules of this lab');
    box.appendChild(el('div', 'g-line', `${names} at ${L.venue === 'revx' ? "Revolut X's" : "eToro's"} live prices. ${cap}`));
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
    const R = LB.R && root.contains(LB.R.body) ? LB.R : skeleton(root), key = LB.sel, L = sumLab(key), V = valued(key), D = LB.det[key];
    want(); status(R); cards(R); top(R, L, V);
    const cf = key + '|' + LB.sum.made + '|' + (D ? D.made : '') + '|' + V.N.open.length; chart(R.chart, key, V, R.chart.dataset.for === cf ? 'tick' : 'data'); R.chart.dataset.for = cf;
    const sig = [key, LB.sum.made, D ? D.made : '', LB.live ? LB.live.made : '', LB.bt ? LB.bt.made : '', JSON.stringify(LB.more)].join('|');
    if (sig !== LB.bodySig) {   // built aside and swapped in at once: the page does not jump
      LB.bodySig = sig; const f = document.createDocumentFragment();
      openBox(f, key, L, V); statsBox(f, L, D); reviewBox(f, D); journalBox(f, key, L, D); trendBox(f, key, L, D); speedsBox(f, key, L, D); backtestBox(f, key, L); setupsBox(f, key, L, D); closedBox(f, key, L, D); breakdownBox(f, key, D); restBox(f, key, L, D);
      R.body.replaceChildren(f);
    }
    LB.lastPaint = Date.now();
  }
  // between two readings: the figures that follow the prices (cards, the value, the open trades, the last candle)
  function tick() {
    const root = LB.root, R = LB.R; if (!root || !R || !LB.sum || !root.isConnected || root.closest('[hidden]') || document.hidden) return;
    if (Date.now() - LB.lastTick < 250) return; LB.lastTick = Date.now();
    const key = LB.sel, L = sumLab(key), V = valued(key); if (!L || !V) return;
    for (const k of KEYS) { const c = R.cards.querySelector(`[data-lab="${k}"]`), v = k === key ? V : valued(k), Lk = sumLab(k); if (!c || !v || !Lk) continue; const b = c.querySelector('.g-stat-v'), s = c.querySelector('.g-stat-s'), n = Lk.cycleTrades == null ? Lk.port.n : Lk.cycleTrades;
      b.textContent = usd(v.equity); b.className = 'g-stat-v ' + sign(v.total); s.textContent = `${pc(100 * v.total / Lk.start)}${v.day != null ? ' · today ' + usd2(v.day) : ''} · ${n} trade${n === 1 ? '' : 's'}${v.N.open.length ? ' · ' + v.N.open.length + ' open' : ''}`; }
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
