// The Trading tab: the eToro demo account as a trading desk. Everything on it is read from eToro every 5 seconds (positions,
// running result, orders, closed trades); the VM's record adds what eToro does not know: which rule opened a trade, the money
// it risked, the stop the program watches, what was skipped and why, and the daily review. Nothing here can place an order.
(function () {
  'use strict';
  const S = () => window.SRScreen;
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const usd = (x) => (x < 0 ? '−$' : '$') + Math.round(Math.abs(x)).toLocaleString('en-US');
  const usd2 = (x) => (x < 0 ? '−$' : '+$') + Math.abs(x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pc = (x, d) => (x < 0 ? '−' : '+') + Math.abs(x).toFixed(d == null ? 2 : d) + '%';
  const px = (x) => (!(x > 0) ? '–' : x >= 1000 ? x.toLocaleString('en-US', { maximumFractionDigits: 2 }) : x >= 100 ? x.toFixed(2) : x >= 1 ? x.toFixed(3) : x.toFixed(5));
  const sign = (x) => (x > 0 ? 'up' : x < 0 ? 'down' : '');
  const when = (t) => new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const clock = (t) => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const span = (ms) => { const h = ms / 3600e3; return h < 1 ? Math.max(1, Math.round(ms / 60e3)) + ' min' : h < 48 ? Math.round(h) + ' h' : Math.round(h / 24) + ' days'; };
  const ARM = { buy: 'Nightly buys', short: 'Nightly shorts', 'fast-buy': 'Fast buys (1-hour)', 'fast-short': 'Fast shorts (1-hour)', hand: 'Opened by hand' };
  const FASTCLS = { 27: 'Indices', 28: 'Indices', 29: 'Indices', 32: 'Indices', 30: 'Indices', 31: 'Indices', 36: 'Indices', 18: 'Commodity', 19: 'Commodity', 17: 'Commodity', 1: 'Forex', 2: 'Forex', 5: 'Forex', 6: 'Forex', 4: 'Forex', 7: 'Forex' };
  const FASTSYM = { 27: 'SPX500', 28: 'NSDQ100', 29: 'DJ30', 32: 'GER40', 30: 'UK100', 31: 'FRA40', 36: 'JPN225', 18: 'GOLD', 19: 'SILVER', 17: 'OIL', 1: 'EURUSD', 2: 'GBPUSD', 5: 'USDJPY', 6: 'USDCHF', 4: 'USDCAD', 7: 'AUDUSD' };
  const ui = { range: 'all', arm: 'all', sort: 'pl', tf: '60', style: 'candles', bench: false };
  try { const k = JSON.parse(localStorage.getItem('sr.pfChart') || '{}'); if (['1', '5', '15', '30', '60', '240', '1440'].includes(k.tf)) ui.tf = k.tf; if (k.style === 'line') ui.style = 'line'; ui.bench = !!k.bench; } catch (e) { /* defaults */ }
  const keepUi = () => { try { localStorage.setItem('sr.pfChart', JSON.stringify({ tf: ui.tf, style: ui.style, bench: ui.bench })); } catch (e) { /* not kept */ } };
  // the account's value between two readings of eToro (every 5 s), moved with each price eToro pushes for the open positions: minute by minute extremes kept in memory
  const liveMin = new Map(); let liveA = null, liveOff = null;

  // ---- one reading of everything, worked into the figures every part of the tab uses ----
  function calc() {
    const P = S().practice() || {}, L = S().demo(), live = !!(L.p && !(L.err && Date.now() - L.at > 25000)), D = live ? L.p : null;
    const rec = P.open || [], recClosed = P.closed || [], rows = new Map(S().all().map((r) => [r.id, r]));
    const symOf = (id, t) => (t && t.s) || FASTSYM[id] || (rows.get(id) || {}).sym || '#' + id, clsOf = (id, t) => (t && t.cls) || FASTCLS[id] || (rows.get(id) || {}).cls || 'Other';
    const known = (o) => rec.find((t) => (t.positionId && t.positionId === o.positionID) || (t.orderId && t.orderId === o.orderID)) || rec.find((t) => t.id === o.instrumentID && !t.positionId && !o.positionID) || null;
    const out = { P, L, live, D, positions: [], waiting: [], closed: [], rules: P.rules || {}, start: +P.startEquity > 0 ? +P.startEquity : null };
    if (D) {
      for (const o of D.positions || []) {
        const t = known(o), u = o.unrealizedPnL || {}, now = +u.closeRate || +o.openRate, side = o.isBuy ? 1 : -1, expo = Math.abs(+u.exposureInAccountCurrency || (+o.amount || 0) * (+o.leverage || 1));
        const stop = t && t.softStop ? t.stop : +o.stopLossRate > 0 ? +o.stopLossRate : t ? t.stop : 0, target = +o.takeProfitRate > 0 ? +o.takeProfitRate : t ? t.target : 0;
        const risk = stop > 0 ? expo * Math.abs(now - stop) / now : 0;                        // what is lost from here if the stop is hit
        out.positions.push({ o, t, id: o.instrumentID, sym: symOf(o.instrumentID, t), cls: clsOf(o.instrumentID, t), arm: t ? t.arm : 'hand', side, lev: +o.leverage || 1, entry: +o.openRate, now, stop, target, soft: !!(t && t.softStop), etoroStop: +o.stopLossRate || 0,
          amount: +o.amount || 0, expo, pl: +u.pnL || 0, plPct: (+o.amount || 0) > 0 ? 100 * (+u.pnL || 0) / +o.amount : 0, move: 100 * side * (now / +o.openRate - 1), r: t && t.riskMoney > 0 ? (+u.pnL || 0) / t.riskMoney : null, risk, opened: Date.parse(o.openDateTime), due: t ? Date.parse(t.due) : null, fees: (+o.totalExternalFees || 0) + (+o.totalFees || 0), score: t ? t.score : null });
      }
      for (const o of D.ordersForOpen || []) { const t = known(o); out.waiting.push({ o, t, id: o.instrumentID, sym: symOf(o.instrumentID, t), arm: t ? t.arm : 'hand', side: o.isBuy ? 1 : -1, amount: +o.amount || 0, frozen: +o.frozenAmount || +o.amount || 0, stop: t ? t.stop : 0, target: t ? t.target : 0, placed: Date.parse(o.openDateTime) || (t ? Date.parse(t.placed) : NaN) }); }
    }
    for (const h of (L.hist || [])) {
      if (P.start && String(h.closeTimestamp) < P.start) continue;
      const t = recClosed.find((q) => q.positionId === h.positionId) || rec.find((q) => q.positionId === h.positionId) || null, side = h.isBuy === false ? -1 : 1, net = +h.netProfit || 0;
      const sl = +h.stopLossRate || (t ? t.stop : 0), tp = +h.takeProfitRate || (t ? t.target : 0), x = +h.closeRate;
      const how = t && t.how ? t.how : tp > 0 && (side > 0 ? x >= tp * 0.9995 : x <= tp * 1.0005) ? 'target' : sl > 0 && (side > 0 ? x <= sl * 1.0005 : x >= sl * 0.9995) ? 'stop' : 'closed before either';
      out.closed.push({ h, t, id: h.instrumentId, sym: symOf(h.instrumentId, t), cls: clsOf(h.instrumentId, t), arm: t ? t.arm : 'hand', side, lev: +h.leverage || 1, entry: +h.openRate, exit: x, net, fees: +h.fees || 0, r: t && t.riskMoney > 0 ? net / t.riskMoney : null, how, opened: Date.parse(h.openTimestamp), at: Date.parse(h.closeTimestamp), amount: +h.investment || 0 });
    }
    out.closed.sort((a, b) => b.at - a.at);
    const pos = out.positions, cl = out.closed, sum = (a, f) => a.reduce((x, y) => x + f(y), 0);
    out.cash = D ? +D.credit || 0 : P.account ? P.account.cash : 0; out.frozen = sum(out.waiting, (w) => w.frozen); out.margin = sum(pos, (p) => p.amount); out.run = D ? +D.unrealizedPnL || sum(pos, (p) => p.pl) : 0;
    out.value = D ? out.cash + out.margin + out.run : P.account ? +P.account.equity : 0;
    out.long = sum(pos.filter((p) => p.side > 0), (p) => p.expo); out.short = sum(pos.filter((p) => p.side < 0), (p) => p.expo); out.gross = out.long + out.short; out.net = out.long - out.short;
    out.riskOpen = sum(pos, (p) => p.risk); out.feesOpen = sum(pos, (p) => p.fees);
    const wins = cl.filter((c) => c.net > 0), loss = cl.filter((c) => c.net <= 0), gp = sum(wins, (c) => c.net), gl = -sum(loss, (c) => c.net), rs = cl.filter((c) => c.r != null);
    out.stats = { n: cl.length, wins: wins.length, winPct: cl.length ? 100 * wins.length / cl.length : null, realized: gp - gl, gp, gl, pf: gl > 0 ? gp / gl : wins.length ? Infinity : null, avgWin: wins.length ? gp / wins.length : null, avgLoss: loss.length ? -gl / loss.length : null,
      expR: rs.length ? sum(rs, (c) => c.r) / rs.length : null, best: cl.length ? cl.reduce((a, b) => (b.net > a.net ? b : a)) : null, worst: cl.length ? cl.reduce((a, b) => (b.net < a.net ? b : a)) : null, hold: cl.filter((c) => c.at > c.opened).length ? sum(cl.filter((c) => c.at > c.opened), (c) => c.at - c.opened) / cl.filter((c) => c.at > c.opened).length : null, fees: sum(cl, (c) => c.fees) + out.feesOpen,
      target: cl.filter((c) => c.how === 'target').length, stop: cl.filter((c) => c.how === 'stop').length, time: cl.filter((c) => c.how === 'time limit').length };
    // the account's value over time: the VM's half-hourly points, plus what this device has seen, plus now
    // (a point may carry the highest and lowest value seen since the point before it: the candles' wicks)
    // each point: [time, value, 0, highest, lowest, minutes between points of its source] — the VM's half-hourly points (30), its 5-minute looks (5), this device (1)
    const m = new Map(); for (const p of (P.curve || [])) m.set(Math.round(p[0] / 60e3), [p[1], p[3], p[4], 30]); for (const p of (P.fine || [])) m.set(Math.round(p[0] / 60e3), [p[1], 0, 0, 5]);
    for (const p of (L.curve || [])) m.set(Math.round(p[0] / 60e3), [p[1], p[2], p[3], 1]); if (D) m.set(Math.round(Date.now() / 60e3), [Math.round(out.value * 100) / 100, 0, 0, 1]);
    for (const [k, x] of liveMin) { const o = m.get(k); m.set(k, [o && k === Math.round(Date.now() / 60e3) ? o[0] : x.last, Math.max(x.hi, o && o[1] > 0 ? o[1] : 0), Math.min(x.lo, o && o[2] > 0 ? o[2] : Infinity), 1]); }
    out.curve = [...m.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => [k * 60e3, v[0], 0, v[1], v[2], v[3]]).filter((p) => p[1] > 0);
    const C = out.curve, base = out.start || (C.length ? C[0][1] : null), last = C.length ? C[C.length - 1][1] : out.value;
    const at = (ms) => { let v = null; for (const p of C) { if (p[0] <= ms) v = p[1]; else break; } return v; }, mid = new Date(); mid.setHours(0, 0, 0, 0);
    let peak = base || 0, dd = 0; for (const p of C) { if (p[1] > peak) peak = p[1]; if (peak > 0) dd = Math.min(dd, p[1] / peak - 1); }
    const days = new Map(); for (const p of C) days.set(new Date(p[0]).toISOString().slice(0, 10), p[1]); const dv = [...days.values()], rets = []; for (let i = 1; i < dv.length; i++) rets.push(dv[i] / dv[i - 1] - 1);
    const mean = rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : 0, sd = rets.length > 1 ? Math.sqrt(rets.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (rets.length - 1)) : 0;
    out.perf = { base, total: base ? last - base : null, totalPct: base ? 100 * (last / base - 1) : null, day: at(mid.getTime()) ? last - at(mid.getTime()) : null, dayBase: at(mid.getTime()), week: at(Date.now() - 7 * 864e5) ? last - at(Date.now() - 7 * 864e5) : null, dd: 100 * dd, peak, days: dv.length, sharpe: rets.length >= 20 && sd > 0 ? mean / sd * Math.sqrt(252) : null };
    return out;
  }

  const tile = (grid, k, v, sub, cls) => { const d = grid.appendChild(el('div', 'g-stat')); d.appendChild(el('span', 'g-stat-k', k)); d.appendChild(el('b', 'g-stat-v' + (cls ? ' ' + cls : ''), v)); if (sub) d.appendChild(el('span', 'g-stat-s', sub)); return d; };
  const head = (box, text) => box.appendChild(el('h3', 't-h', text));
  const openAsset = (x) => S().open({ sym: x.sym, id: x.id, name: (x.t && x.t.n) || x.sym });
  function status(box, M) {
    const s = box.appendChild(el('div', 't-status')), P = M.P;
    s.appendChild(el('span', 't-dot ' + (M.live ? 'on' : 'off'))); s.appendChild(el('span', '', M.live ? `Live from eToro · ${clock(M.L.at)}` : M.L.err === 'no keys' ? 'Not live: add your eToro keys in Settings' : M.L.err ? `Not live: eToro answered ${M.L.err} (the key in this app needs "Trading – Demo, Read")` : 'Connecting to eToro…'));
    const quiet = S().vmSilent();
    if (P.made) { s.appendChild(el('span', 't-sep', '·')); s.appendChild(el('span', quiet ? 'g-warn' : '', `VM record ${when(P.made)}${P.mode !== 'live' ? ' (dry run: no orders)' : ''}`)); }
    s.appendChild(el('span', 't-sep', '·')); s.appendChild(el('span', '', 'virtual money'));
    if (quiet) box.appendChild(el('div', 'g-line g-warn t-alarm', `No sign of the VM for ${span(quiet * 60e3)} (its record should be at most half an hour old). Until it is back: no new order, no close at a time limit, and no watch on the stops eToro does not hold. The stops and targets that sit on eToro still work.`));
  }

  // ---- the account's value on the same chart as the markets (SRChart: drag, pinch or scroll to zoom, drawing tools, indicators, full view) ----
  // The chart is made once and stays in place: the 5-second readings only update its last candles, so a drag, a zoom or a drawing is never cut.
  let tv = null;
  const isDark = () => window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const cssVar = (n, fb) => (getComputedStyle(document.documentElement).getPropertyValue(n) || '').trim() || fb;
  const cp = (k) => ({ time: k.time, open: k.open, high: k.high, low: k.low, close: k.close, volume: 0 });
  function makeChart(B) {
    B.textContent = '';
    const hdr = B.appendChild(el('div', 't-chhdr')), host = B.appendChild(el('div', 't-tv')), note = B.appendChild(el('div', 'g-hint t-chnote'));
    const T = { B, hdr, host, note, sig: '', n: 0, bars: [], hover: null, startLine: null, startAt: null, tf: 36e5 };
    T.api = SRChart.create(host, { id: 'demo-account', priceFormat: (v) => '$' + Math.round(v).toLocaleString('en-US'), height: () => (window.innerWidth >= 900 ? Math.max(420, Math.min(620, window.innerHeight - 380)) : 0),
      onFull: (on) => { if (on) T.api.slot.replaceChildren(hdr); else B.insertBefore(hdr, host); },   // in full view the time frames and the figures move above the chart, as on an asset
      onHover: (b) => { T.hover = b ? T.bars.find((k) => k.time === b.time) || null : null; T.say(); } });
    const L = window.LightweightCharts, { chart: ch, candles } = T.api.lw(), blue = cssVar('--sr-c1', '#2563eb');
    T.candles = candles;
    T.line = ch.addSeries(L.AreaSeries || L.LineSeries, { lineColor: blue, topColor: 'rgba(37,99,235,0.22)', bottomColor: 'rgba(37,99,235,0.02)', color: blue, lineWidth: 2, priceLineVisible: false, lastValueVisible: true, visible: false }, 0);
    T.bench = ch.addSeries(L.LineSeries, { color: '#f59e0b', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, visible: false }, 0);
    T.marks = L.createSeriesMarkers ? L.createSeriesMarkers(candles, []) : null;
    T.offBack = window.SRLive && SRLive.onBack ? SRLive.onBack(() => T.host.isConnected && T.api.back()) : null;   // Back leaves the full view or a drawing tool first
    T.destroy = () => { if (T.offBack) T.offBack(); try { T.api.destroy(); } catch (e) { /* gone */ } };
    T.say = () => { const lg = T.legend, k = T.hover || T.bars[T.bars.length - 1]; if (!lg || !k) return; const d = k.close - k.open, f = (v) => Math.round(v).toLocaleString('en-US');
      lg.textContent = ''; lg.appendChild(el('span', 't-leg-t', new Date(k.b).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })));
      for (const [n, v] of [['O', k.open], ['H', k.high], ['L', k.low], ['C', k.close]]) { lg.appendChild(el('span', 't-leg-k', n)); lg.appendChild(el('span', '', f(v))); }
      lg.appendChild(el('span', sign(d), `${usd2(d)} (${pc(k.open ? 100 * d / k.open : 0)})`)); };
    return T;
  }
  function chart(B, M) {
    const C = M.curve;
    if (!window.SRChart || !window.LightweightCharts) { B.textContent = ''; return chartPlain(B, M); }
    if (!tv || tv.B !== B || !B.contains(tv.host)) { if (tv) tv.destroy(); tv = makeChart(B); }
    // what is drawn again at each reading: the time frames, the figures of the candle, the line under the chart
    const H = tv.hdr; H.textContent = '';
    const fv = H.appendChild(el('div', 't-fullval')); fv.appendChild(el('b', '', 'Demo account ' + usd(M.value))); if (M.perf.total != null) fv.appendChild(el('span', sign(M.perf.total), ` ${usd2(M.perf.total)} (${pc(M.perf.totalPct)}) since the start`));
    const bar = H.appendChild(el('div', 't-chips t-tfs')), chip = (key, val, label) => { const b = bar.appendChild(el('button', 't-chip' + (ui[key] === val ? ' on' : ''), label)); b.type = 'button'; b.addEventListener('click', () => { ui[key] = key === 'bench' ? !ui.bench : val; keepUi(); SRApp.renderDraw('trade'); }); return b; };
    for (const [k, l] of [['1', '1m'], ['5', '5m'], ['15', '15m'], ['30', '30m'], ['60', '1h'], ['240', '4h'], ['1440', '1D']]) chip('tf', k, l);
    bar.appendChild(el('span', 't-sep', '·')); chip('style', 'candles', 'Candles'); chip('style', 'line', 'Line');
    bar.appendChild(el('span', 't-sep', '·')); const bb = chip('bench', true, 'S&P 500'); bb.classList.toggle('on', !!ui.bench);
    tv.legend = H.appendChild(el('div', 't-legend')); tv.note.textContent = '';
    if (C.length < 2) { tv.host.hidden = true; tv.note.textContent = 'The chart fills in as the account is followed: one point every 5 minutes from the VM, and every reading of this device.'; return; }
    tv.host.hidden = false;
    const tf = +ui.tf * 60e3, bars = [];
    let pts = +ui.tf < 30 ? C.filter((p) => p[5] <= 5) : C; if (pts.length < 2) pts = C;    // short candles only from points that are close enough: the half-hourly points would make false flat candles
    for (const p of pts) { const k0 = bars[bars.length - 1], bk = Math.floor(p[0] / tf) * tf, hi = p[3] > 0 ? Math.max(p[3], p[1]) : p[1], lo = p[4] > 0 ? Math.min(p[4], p[1]) : p[1];
      if (!k0 || k0.b !== bk) { const o = k0 ? k0.close : p[1]; bars.push({ b: bk, time: bk / 1000, open: o, high: Math.max(o, hi), low: Math.min(o, lo), close: p[1] }); } else { k0.high = Math.max(k0.high, hi); k0.low = Math.min(k0.low, lo); k0.close = p[1]; } }
    const up = cssVar('--av-up', '#089981'), down = cssVar('--av-down', '#f23645'), muted = isDark() ? '#a0a6b0' : '#5f6672', L = window.LightweightCharts;
    const sig = ui.tf + '|' + bars[0].b, lineOf = (k) => ({ time: k.time, value: k.close });
    if (tv.sig !== sig || bars.length < tv.n) { tv.api.setBars(bars.map(cp), { sec: tf / 1000, show: 120 }, true); tv.line.setData(bars.map(lineOf)); }
    else for (let i = Math.max(0, tv.n - 1); i < bars.length; i++) { tv.api.update(cp(bars[i]), i >= tv.n); tv.line.update(lineOf(bars[i])); }
    tv.sig = sig; tv.n = bars.length; tv.bars = bars; tv.tf = tf;
    tv.candles.applyOptions({ visible: ui.style !== 'line' }); tv.line.applyOptions({ visible: ui.style === 'line' });
    if (M.start > 0 && tv.startAt !== M.start) { if (tv.startLine) tv.candles.removePriceLine(tv.startLine); tv.startAt = M.start; tv.startLine = tv.candles.createPriceLine({ price: M.start, color: muted, lineWidth: 1, lineStyle: L.LineStyle ? L.LineStyle.Dashed : 2, axisLabelVisible: true, title: 'start' }); }
    // the S&P 500 over the same hours, set to the account's value at the first point they share
    const Bn = M.P.bench, bp = new Map(); if (Bn && Bn.px > 0 && Bn.value > 0) for (const p of (M.P.curve || [])) if (p[2] > 0) bp.set(Math.floor(p[0] / tf) * tf / 1000, +(Bn.value * p[2] / Bn.px).toFixed(2));
    tv.bench.setData([...bp.entries()].sort((x, y) => x[0] - y[0]).map(([time, value]) => ({ time, value }))); tv.bench.applyOptions({ visible: !!ui.bench && bp.size > 1 });
    // where the program's trades opened and closed
    if (tv.marks) { const have = new Set(bars.map((k) => k.time)), at = (ms) => Math.floor(ms / tf) * tf / 1000, mk = [];
      for (const p of M.positions) if (p.t && isFinite(p.opened) && have.has(at(p.opened))) mk.push({ time: at(p.opened), position: 'belowBar', color: p.side > 0 ? up : down, shape: p.side > 0 ? 'arrowUp' : 'arrowDown', text: p.sym });
      for (const c of M.closed) if (c.t && isFinite(c.at) && have.has(at(c.at))) mk.push({ time: at(c.at), position: 'aboveBar', color: c.net >= 0 ? up : down, shape: 'circle', text: `${c.sym} ${c.net >= 0 ? '+' : '−'}$${Math.round(Math.abs(c.net))}` });
      mk.sort((x, y) => x.time - y.time); tv.marks.setMarkers(mk.slice(-80)); tv.host.dataset.marks = String(mk.length); }
    tv.host.dataset.bars = String(bars.length); tv.host.dataset.wicks = String(bars.filter((k) => k.high > Math.max(k.open, k.close) + 0.005 || k.low < Math.min(k.open, k.close) - 0.005).length); tv.host.dataset.bench = String(ui.bench ? bp.size : 0); tv.say();
    const lo0 = Math.min(...bars.map((k) => k.low)), hi0 = Math.max(...bars.map((k) => k.high));
    tv.note.textContent = `Since the first reading: ${usd2(C[C.length - 1][1] - C[0][1])} (${pc(100 * (C[C.length - 1][1] / C[0][1] - 1))}), low ${usd(lo0)}, high ${usd(hi0)}. The same chart as the markets: drag to move, pinch or scroll to zoom, the tools above it to draw and measure, the square for the full view. Arrows: a trade of the program opened; dots: one closed, with its result. The dashed line is the starting value${ui.bench ? '; the orange line is the S&P 500 over the same hours' : ''}.`;
  }

  // ---- the value between two readings, moved by the prices eToro pushes (its WebSocket, as on the asset charts): up to four times a second ----
  // Each reading of the account (every 5 s) is the anchor: its exact value, and the streamed price of each open position at that moment.
  // Between readings the value moves by side × (money × leverage ÷ opening price) × the price's change since the anchor. The next reading puts it right again.
  function liveFollow(root, M) {
    const S = window.SRLive; if (!S || !S.onTick || !S.want || !M.D || !(M.value > 0)) return;
    const Q = S.quotes, ids = [...new Set(M.positions.map((p) => p.id).filter((x) => x > 0))];
    liveA = { value: M.value, at: Date.now(), pos: M.positions.filter((p) => p.id > 0 && p.entry > 0).map((p) => { const q = Q.get(p.id); return { id: p.id, k: p.side * p.amount * p.lev / p.entry, base: q && q.price > 0 ? q.price : null }; }) };
    S.want('demo', ids);
    if (!liveOff) liveOff = S.onTick(liveTick);
  }
  function liveTick() {
    const S = window.SRLive, A = liveA, page = document.querySelector('#trade .t-value');
    if (!A || !page || !tv || !tv.host.isConnected) { if (liveOff) { liveOff(); liveOff = null; } if (S && S.want) S.want('demo', []); return; }
    let d = 0, moved = false; for (const p of A.pos) { const q = S.quotes.get(p.id); if (!q || !(q.price > 0)) continue; if (p.base == null) { p.base = q.price; continue; } if (Math.abs(q.price / p.base - 1) > 0.1) continue; if (q.price !== p.base) moved = true; d += p.k * (q.price - p.base); }   // a jump of more than 10% within seconds is a wrong price, not a move
    if (!moved && tv.liveV === A.value) return;
    const v = Math.round((A.value + d) * 100) / 100, now = Date.now(), mk = Math.round(now / 60e3); tv.liveV = v;
    const x = liveMin.get(mk); if (x) { x.hi = Math.max(x.hi, v); x.lo = Math.min(x.lo, v); x.last = v; } else liveMin.set(mk, { hi: v, lo: v, last: v });
    for (const k of liveMin.keys()) if (k < mk - 360) liveMin.delete(k);                     // six hours in memory; the device's own points keep the rest
    page.textContent = usd(v); page.classList.add('t-tick'); tv.host.dataset.live = String((+tv.host.dataset.live || 0) + 1); tv.host.dataset.v = String(v);
    const bk = Math.floor(now / tv.tf) * tv.tf, last = tv.bars[tv.bars.length - 1]; if (!last || tv.host.hidden) return; let k = last, isNew = false;
    if (last.b === bk) { last.close = v; last.high = Math.max(last.high, v); last.low = Math.min(last.low, v); }
    else if (bk > last.b) { k = { b: bk, time: bk / 1000, open: last.close, high: Math.max(last.close, v), low: Math.min(last.close, v), close: v }; tv.bars.push(k); tv.n = tv.bars.length; isNew = true; }
    else return;
    try { tv.api.update(cp(k), isNew); tv.line.update({ time: k.time, value: k.close }); } catch (e) { /* a candle older than the chart's last: the next reading redraws */ }
    if (!tv.hover) tv.say();
  }

  // the plain curve, used only if the chart library is not there
  function chartPlain(box, M) {
    const bar = box.appendChild(el('div', 't-chips'));
    for (const [k, l] of [['1d', '1 day'], ['1w', '1 week'], ['1m', '1 month'], ['all', 'All']]) { const b = bar.appendChild(el('button', 't-chip' + (ui.range === k ? ' on' : ''), l)); b.type = 'button'; b.addEventListener('click', () => { ui.range = k; SRApp.renderDraw('trade'); }); }
    const from = ui.range === '1d' ? Date.now() - 864e5 : ui.range === '1w' ? Date.now() - 7 * 864e5 : ui.range === '1m' ? Date.now() - 30 * 864e5 : 0, C = M.curve.filter((p) => p[0] >= from);
    if (C.length < 2) { box.appendChild(el('div', 'g-hint', 'The curve fills in as the account is followed: one point every half hour from the VM, and every reading of this device.')); return; }
    const W = 640, H = 190, ml = 6, mr = 58, mt = 8, mb = 20, lo0 = Math.min(...C.map((p) => p[1])), hi0 = Math.max(...C.map((p) => p[1])), pad = Math.max((hi0 - lo0) * 0.12, hi0 * 0.0004), lo = lo0 - pad, hi = hi0 + pad;
    const x = (t) => ml + (W - ml - mr) * (t - C[0][0]) / (C[C.length - 1][0] - C[0][0] || 1), y = (v) => mt + (H - mt - mb) * (1 - (v - lo) / (hi - lo || 1));
    const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg'), mk = (n, a) => { const e = document.createElementNS(ns, n); for (const k in a) e.setAttribute(k, a[k]); return svg.appendChild(e); };
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('class', 't-chart'); const up = C[C.length - 1][1] >= C[0][1], line = C.map((p) => `${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(' ');
    for (const v of [lo0, (lo0 + hi0) / 2, hi0]) { mk('line', { x1: ml, x2: W - mr, y1: y(v), y2: y(v), class: 't-grid' }); const t = mk('text', { x: W - mr + 6, y: y(v) + 4, class: 't-axis' }); t.textContent = usd(v); }
    if (M.start && M.start >= lo && M.start <= hi) { mk('line', { x1: ml, x2: W - mr, y1: y(M.start), y2: y(M.start), class: 't-base' }); }
    mk('polygon', { points: `${x(C[0][0]).toFixed(1)},${H - mb} ${line} ${x(C[C.length - 1][0]).toFixed(1)},${H - mb}`, class: 't-area ' + (up ? 'up' : 'down') }); mk('polyline', { points: line, class: 't-line ' + (up ? 'up' : 'down') });
    mk('circle', { cx: x(C[C.length - 1][0]), cy: y(C[C.length - 1][1]), r: 3.2, class: 't-last ' + (up ? 'up' : 'down') });
    const a = mk('text', { x: ml, y: H - 5, class: 't-axis' }); a.textContent = when(C[0][0]); const b = mk('text', { x: W - mr, y: H - 5, class: 't-axis', 'text-anchor': 'end' }); b.textContent = when(C[C.length - 1][0]);
    box.appendChild(svg);
    box.appendChild(el('div', 'g-hint', `${ui.range === 'all' ? 'Since the first reading' : 'In this period'}: ${usd2(C[C.length - 1][1] - C[0][1])} (${pc(100 * (C[C.length - 1][1] / C[0][1] - 1))}), low ${usd(lo0)}, high ${usd(hi0)}.${M.start ? ' The dashed line is the starting value.' : ''}`));
  }

  // ---- Overview ----
  function overview(root) {
    const M = calc(), f = M.perf, st = M.stats;
    // three parts: the figures on top and everything under the chart are drawn again at each reading; the chart in between stays (a drag or a pinch on it is never cut)
    let A = root.querySelector(':scope > .t-ov-a'), Bc = root.querySelector(':scope > .t-ov-b'), Z = root.querySelector(':scope > .t-ov-c');
    if (!A || !Bc || !Z) { root.textContent = ''; A = root.appendChild(el('div', 't-ov-a')); Bc = root.appendChild(el('div', 't-ov-b')); Z = root.appendChild(el('div', 't-ov-c')); }
    A.textContent = ''; Z.textContent = ''; status(A, M);
    const top = A.appendChild(el('div', 't-top')); top.appendChild(el('div', 't-value', usd(M.value)));
    const sub = top.appendChild(el('div', 't-sub'));
    if (f.total != null) { sub.appendChild(el('b', sign(f.total), `${usd2(f.total)} (${pc(f.totalPct)})`)); sub.appendChild(document.createTextNode(' since the start')); }
    if (f.day != null) { sub.appendChild(el('span', 't-sep', '·')); sub.appendChild(el('b', sign(f.day), `${usd2(f.day)} (${pc(100 * f.day / f.dayBase)})`)); sub.appendChild(document.createTextNode(' today')); }
    chart(Bc, M); liveFollow(Bc, M); root = Z;
    head(root, 'Result'); let g = root.appendChild(el('div', 'g-stats'));
    tile(g, 'Open positions', usd2(M.run), `${M.positions.length} open, ${M.waiting.length} waiting`, sign(M.run));
    tile(g, 'Closed trades', usd2(st.realized), st.n ? `${st.n} closed since the start` : 'none closed yet', sign(st.realized));
    tile(g, 'This week', f.week != null ? usd2(f.week) : '–', f.week != null ? 'change in value over 7 days' : 'needs a week of readings', f.week != null ? sign(f.week) : '');
    tile(g, 'Costs paid', usd(st.fees), 'fees booked by eToro');
    head(root, 'Quality of the trades'); g = root.appendChild(el('div', 'g-stats'));
    tile(g, 'Trades with a gain', st.winPct != null ? `${Math.round(st.winPct)}%` : '–', st.n ? `${st.wins} of ${st.n}` : 'no closed trade yet');
    tile(g, 'Profit factor', st.pf == null ? '–' : st.pf === Infinity ? 'no loss yet' : st.pf.toFixed(2), 'gains divided by losses; above 1 earns');
    tile(g, 'Average gain / loss', `${st.avgWin != null ? usd2(st.avgWin) : '–'} / ${st.avgLoss != null ? usd2(st.avgLoss) : '–'}`, 'per closed trade, after costs');
    tile(g, 'Result per trade', st.expR != null ? `${st.expR >= 0 ? '+' : '−'}${Math.abs(st.expR).toFixed(2)} R` : '–', 'average, in units of the money risked', st.expR != null ? sign(st.expR) : '');
    tile(g, 'How they ended', st.n ? `${st.target} target · ${st.stop} stop · ${st.time} time` : '–', st.n ? `${st.n - st.target - st.stop - st.time} otherwise` : '');
    tile(g, 'Average holding time', st.hold != null ? span(st.hold) : '–', '');
    tile(g, 'Best trade', st.best ? usd2(st.best.net) : '–', st.best ? st.best.sym : '', st.best ? sign(st.best.net) : '');
    tile(g, 'Worst trade', st.worst ? usd2(st.worst.net) : '–', st.worst ? st.worst.sym : '', st.worst ? sign(st.worst.net) : '');
    head(root, 'Risk'); g = root.appendChild(el('div', 'g-stats'));
    tile(g, 'Worst fall so far', f.dd < 0 ? pc(f.dd) : '0%', `from a high of ${usd(f.peak || M.value)}`, f.dd < -0.005 ? 'down' : '');
    tile(g, 'If every stop is hit', usd(-M.riskOpen), M.value ? `${(100 * M.riskOpen / M.value).toFixed(2)}% of the account, from here` : '', M.riskOpen > 0 ? 'down' : '');
    tile(g, 'In the market', M.value ? `${Math.round(100 * M.gross / M.value)}%` : '–', `long ${usd(M.long)} · short ${usd(M.short)}`);
    tile(g, 'Net direction', M.value ? pc(100 * M.net / M.value, 0) : '–', M.net >= 0 ? 'net long' : 'net short');
    tile(g, 'Money set aside', usd(M.margin), `${M.gross > 0 && M.margin > 0 ? (M.gross / M.margin).toFixed(1) + '× leverage on average' : 'no position'}`);
    tile(g, 'Free cash', usd(M.cash - M.frozen), M.frozen ? `${usd(M.frozen)} held for waiting orders` : '');
    tile(g, 'Sharpe ratio', f.sharpe != null ? f.sharpe.toFixed(2) : '–', f.sharpe != null ? `from ${f.days} days` : `needs 20 days of history (${f.days} so far)`);
    // by rule and by kind of asset
    const group = (key, names) => { const G = {}; for (const p of M.positions) { const o = G[key(p)] = G[key(p)] || { open: 0, run: 0, expo: 0, n: 0, won: 0, net: 0, r: 0, rn: 0 }; o.open++; o.run += p.pl; o.expo += p.expo; } for (const c of M.closed) { const o = G[key(c)] = G[key(c)] || { open: 0, run: 0, expo: 0, n: 0, won: 0, net: 0, r: 0, rn: 0 }; o.n++; o.won += c.net > 0 ? 1 : 0; o.net += c.net; if (c.r != null) { o.r += c.r; o.rn++; } }
      const tb = root.appendChild(el('div', 't-table')); const hd = tb.appendChild(el('div', 't-tr t-th')); for (const h of ['', 'Open', 'Running', 'Closed', 'Gain %', 'Result', 'Per trade']) hd.appendChild(el('span', '', h));
      for (const [k, o] of Object.entries(G).sort((a, b) => (b[1].net + b[1].run) - (a[1].net + a[1].run))) { const r = tb.appendChild(el('div', 't-tr')); r.appendChild(el('span', 't-name', (names && names[k]) || k)); r.appendChild(el('span', '', String(o.open))); r.appendChild(el('span', sign(o.run), o.open ? usd2(o.run) : '–')); r.appendChild(el('span', '', String(o.n))); r.appendChild(el('span', '', o.n ? Math.round(100 * o.won / o.n) + '%' : '–')); r.appendChild(el('span', sign(o.net), o.n ? usd2(o.net) : '–')); r.appendChild(el('span', '', o.rn ? `${o.r / o.rn >= 0 ? '+' : '−'}${Math.abs(o.r / o.rn).toFixed(2)} R` : '–')); }
      if (!Object.keys(G).length) tb.appendChild(el('div', 'g-hint', 'Nothing yet.')); };
    head(root, 'By rule'); group((x) => x.arm, ARM); head(root, 'By kind of asset'); group((x) => x.cls);
    if ([...M.positions, ...M.closed].some((x) => x.t && x.t.fast && x.t.now)) { head(root, 'Fast trades: what the signal did while the trade was on'); group((x) => (!(x.t && x.t.fast) ? 'Other trades' : x.t.faded ? 'Signal faded or reversed' : 'Signal held')); root.appendChild(el('div', 'g-hint', 'The program reads the score of each open fast trade again every hour and records it. It closes nothing on it: on ten weeks of eToro\'s candles that would not have helped. These two lines will show whether the real trades agree.')); }
    for (const [k, v] of Object.entries(M.P.paused || {})) root.appendChild(el('div', 'g-line g-warn', `Paused by the program: ${ARM[k] || k} since ${v.since} (${v.why}).`));
    root.appendChild(el('div', 'g-hint', 'Figures are eToro\'s own, read every 5 seconds. Orders are placed by the program on your VM, never from this app. Virtual money: a test of the signals, not advice.'));
    return true;
  }

  // ---- Positions ----
  function positions(root) {
    const M = calc(); root.textContent = ''; status(root, M);
    const bar = root.appendChild(el('div', 't-chips')); bar.appendChild(el('span', 't-chip-l', 'Sort'));
    for (const [k, l] of [['pl', 'Result'], ['pct', 'Move %'], ['size', 'Size'], ['stop', 'Nearest stop'], ['age', 'Newest']]) { const b = bar.appendChild(el('button', 't-chip' + (ui.sort === k ? ' on' : ''), l)); b.type = 'button'; b.addEventListener('click', () => { ui.sort = k; SRApp.renderDraw('tradepos'); }); }
    const key = { pl: (p) => -p.pl, pct: (p) => -p.move, size: (p) => -p.expo, stop: (p) => (p.stop > 0 ? Math.abs(p.now / p.stop - 1) : 9), age: (p) => -p.opened }[ui.sort], pos = M.positions.slice().sort((a, b) => key(a) - key(b));
    head(root, `Open positions (${pos.length})`);
    if (!pos.length) root.appendChild(el('div', 'g-hint', M.live ? 'No open position.' : 'Waiting for eToro.'));
    for (const p of pos) {
      const b = root.appendChild(el('button', 't-pos')); b.type = 'button'; b.addEventListener('click', () => openAsset(p));
      const l1 = b.appendChild(el('div', 't-l1')); l1.appendChild(el('span', 'g-pill ' + (p.side > 0 ? 'g-buy' : 'g-sell'), p.sym)); l1.appendChild(el('span', 't-tag', `${p.side > 0 ? 'Long' : 'Short'}${p.lev > 1 ? ' ×' + p.lev : ''}`)); l1.appendChild(el('span', 't-tag t-arm', ARM[p.arm] || p.arm));
      const r = l1.appendChild(el('span', 't-pl ' + sign(p.pl))); r.appendChild(el('b', '', usd2(p.pl))); r.appendChild(el('span', '', ` ${pc(p.move)}${p.r != null ? ` · ${p.r >= 0 ? '+' : '−'}${Math.abs(p.r).toFixed(2)} R` : ''}`));
      // where the price stands between the stop and the target
      if (p.stop > 0 && p.target > 0) { const lo = Math.min(p.stop, p.target), hi = Math.max(p.stop, p.target), at = (v) => Math.max(0, Math.min(100, 100 * (v - lo) / (hi - lo || 1))), flip = p.side < 0;
        const tr = b.appendChild(el('div', 't-track')); const fill = tr.appendChild(el('i', 't-fill ' + sign(p.pl))); const a = at(p.entry), c = at(p.now); fill.style.left = Math.min(a, c) + '%'; fill.style.width = Math.abs(c - a) + '%';
        const e = tr.appendChild(el('i', 't-entry')); e.style.left = a + '%'; const n = tr.appendChild(el('i', 't-now ' + sign(p.pl))); n.style.left = c + '%';
        const ends = b.appendChild(el('div', 't-ends')); ends.appendChild(el('span', flip ? 'up' : 'down', `${flip ? 'target' : 'stop'} ${px(lo)}`)); ends.appendChild(el('span', '', `now ${px(p.now)}`)); ends.appendChild(el('span', flip ? 'down' : 'up', `${flip ? 'stop' : 'target'} ${px(hi)}`)); }
      const toStop = p.stop > 0 ? Math.abs(p.now / p.stop - 1) * 100 : null, toTp = p.target > 0 ? Math.abs(p.target / p.now - 1) * 100 : null;
      b.appendChild(el('div', 't-l2', `Entry ${px(p.entry)} · size ${usd(p.expo)}${p.lev > 1 ? ` (${usd(p.amount)} set aside)` : ''} · stop ${toStop != null ? toStop.toFixed(1) + '% away' : 'not set'} · target ${toTp != null ? toTp.toFixed(1) + '% away' : 'not set'}`));
      b.appendChild(el('div', 't-l2', `${p.opened > 0 ? `Opened ${when(p.opened)} (${span(Date.now() - p.opened)} ago)` : 'Open'}${p.due ? ` · time limit in ${span(Math.max(0, p.due - Date.now()))}` : ''}${p.risk > 0 ? ` · ${usd(p.risk)} lost from here if stopped` : ''}${p.score != null ? ` · score ${Math.round(p.score * 1000) / 10}` : ''}`));
      if (p.t && p.t.best != null && p.t.worst != null) b.appendChild(el('div', 't-l2', `So far: best ${rtxt(p.t.best)}, worst ${rtxt(p.t.worst)} (R = the money this trade risks)`));
      if (p.t && p.t.now) { const n = p.t.now, w = n.state !== 'holds'; b.appendChild(el('div', 't-l2' + (w ? ' g-warn' : ''), `Signal at ${clock(Date.parse(n.at))}: ${n.state === 'holds' ? 'still holds' : n.state === 'gone' ? 'gone (the score is back to neutral)' : 'reversed (the score now points the other way)'} · score ${Math.round(n.score * 1000) / 10}${w ? ' · left to its stop, target and time limit' : ''}`)); }
      if (p.soft) b.appendChild(el('div', 't-l2 g-warn', `eToro takes no stop this close on this asset (its own is at ${px(p.etoroStop)}): the program watches ${px(p.stop)} itself every 5 minutes.`));
      if (!p.t) b.appendChild(el('div', 't-l2', 'Not opened by the program.'));
    }
    head(root, `Orders waiting for the market (${M.waiting.length})`);
    if (!M.waiting.length) root.appendChild(el('div', 'g-hint', 'None.'));
    for (const w of M.waiting) { const b = root.appendChild(el('button', 't-pos')); b.type = 'button'; b.addEventListener('click', () => openAsset(w)); const l1 = b.appendChild(el('div', 't-l1')); l1.appendChild(el('span', 'g-pill ' + (w.side > 0 ? 'g-buy' : 'g-sell'), w.sym)); l1.appendChild(el('span', 't-tag', w.side > 0 ? 'Buy order' : 'Short order')); l1.appendChild(el('span', 't-tag t-arm', ARM[w.arm] || w.arm)); l1.appendChild(el('span', 't-pl', usd(w.amount)));
      b.appendChild(el('div', 't-l2', `${isFinite(w.placed) ? 'Sent ' + when(w.placed) + ' · ' : ''}opens when its market opens${w.stop ? ` · planned stop ${px(w.stop)} · target ${px(w.target)}` : ''}`)); }
    const stuck = (M.P.open || []).filter((t) => t.status !== 'open' && M.live && !M.waiting.some((w) => w.t === t) && !M.positions.some((p) => p.t === t));
    if (stuck.length) { head(root, 'Orders eToro did not open'); for (const t of stuck) root.appendChild(el('div', 'g-hint', `${t.s}: sent ${when(t.placed)}; eToro neither opened it nor keeps it waiting. No money was taken. The program clears it at its next look.`)); }
    return true;
  }

  // ---- History ----
  function history(root) {
    const M = calc(); root.textContent = ''; status(root, M);
    const arms = ['all', ...new Set(M.closed.map((c) => c.arm))], bar = root.appendChild(el('div', 't-chips'));
    for (const k of arms) { const b = bar.appendChild(el('button', 't-chip' + (ui.arm === k ? ' on' : ''), k === 'all' ? 'All rules' : ARM[k] || k)); b.type = 'button'; b.addEventListener('click', () => { ui.arm = k; SRApp.renderDraw('tradehist'); }); }
    const list = M.closed.filter((c) => ui.arm === 'all' || c.arm === ui.arm), net = list.reduce((x, c) => x + c.net, 0), won = list.filter((c) => c.net > 0).length;
    head(root, `Closed trades (${list.length})`);
    if (list.length) root.appendChild(el('div', 'g-line', `${won} with a gain (${Math.round(100 * won / list.length)}%), ${usd2(net)} after costs.`)); else root.appendChild(el('div', 'g-hint', 'No trade has closed yet. Each one will appear here with its entry, exit, result and how it ended.'));
    for (const c of list.slice(0, 80)) { const b = root.appendChild(el('button', 't-pos')); b.type = 'button'; b.addEventListener('click', () => openAsset(c)); const l1 = b.appendChild(el('div', 't-l1')); l1.appendChild(el('span', 'g-pill ' + (c.side > 0 ? 'g-buy' : 'g-sell'), c.sym)); l1.appendChild(el('span', 't-tag', `${c.side > 0 ? 'Long' : 'Short'}${c.lev > 1 ? ' ×' + c.lev : ''}`)); l1.appendChild(el('span', 't-tag t-arm', ARM[c.arm] || c.arm));
      const r = l1.appendChild(el('span', 't-pl ' + sign(c.net))); r.appendChild(el('b', '', usd2(c.net))); if (c.r != null) r.appendChild(el('span', '', ` ${c.r >= 0 ? '+' : '−'}${Math.abs(c.r).toFixed(2)} R`));
      b.appendChild(el('div', 't-l2', `${px(c.entry)} → ${px(c.exit)} (${pc(100 * c.side * (c.exit / c.entry - 1))}) · ended by ${c.how}${isFinite(c.opened) ? ` · held ${span(c.at - c.opened)}` : ''} · closed ${when(c.at)}${c.fees ? ` · fees ${usd2(-c.fees).replace('−', '')}` : ''}`)); }
    // what the program did, look by look
    head(root, 'What the program did');
    const log = (M.P.log || []).slice().reverse().filter((l) => l.sent || (l.closed || []).length || (l.skipped || []).length || (l.notes || []).length).slice(0, 25);
    if (!log.length) root.appendChild(el('div', 'g-hint', 'Nothing recorded yet.'));
    for (const l of log) { const d = root.appendChild(el('div', 't-log')); d.appendChild(el('b', '', when(l.at))); const parts = [];
      if ((l.opened || []).length) parts.push('sent ' + l.opened.map((x) => x.replace(' fast-short', ' (fast short)').replace(' fast-buy', ' (fast buy)').replace(' short', ' (short)').replace(' buy', ' (buy)')).join(', '));
      for (const c of l.closed || []) parts.push(`${c.s} closed by ${c.how}${c.net != null ? ' ' + usd2(c.net) : ''}`);
      for (const s of l.skipped || []) parts.push('skipped ' + s); for (const n of l.notes || []) parts.push(n);
      d.appendChild(el('span', '', ' ' + parts.join(' · '))); }
    return true;
  }

  // ---- Rules and review ----
  function review(root) {
    const M = calc(), P = M.P, R = M.rules, V = S().review(), E = V && V.entries ? V.entries.slice().reverse() : []; root.textContent = ''; status(root, M);
    head(root, 'Daily review');
    if (!E.length) root.appendChild(el('div', 'g-hint', 'The first review appears here after its first morning run (06:47).'));
    E.slice(0, 7).forEach((e, i) => { const d = root.appendChild(el('details', 't-rev')); if (!i) d.open = true; d.appendChild(el('summary', '', `Review of ${e.date}${e.account && e.account.equity ? ` · ${usd(e.account.equity)}` : ''}${(e.decisions || []).length ? ` · ${e.decisions.length} decision${e.decisions.length > 1 ? 's' : ''}` : ''}`));
      for (const [k, t] of [['health', 'Health'], ['decisions', 'Decisions'], ['questions', 'Questions asked'], ['next', 'Next']]) { if (!(e[k] || []).length) continue; d.appendChild(el('div', 't-revh', t)); for (const x of e[k]) d.appendChild(el('div', /^ALERT/.test(x) ? 'g-line g-warn' : 'g-line', x)); } });
    const A = S().audit();
    if (A && A.live) {
      head(root, 'Check of the orders');
      const tr = A.live.trades || [], bad = tr.filter((x) => (x.issues || []).length), ms = A.live.missed || [];
      root.appendChild(el('div', 'g-line' + (bad.length ? ' g-warn' : ''), `${when(A.made)}: ${tr.length} fast trade${tr.length === 1 ? '' : 's'} compared with a replay of the rule on eToro's 1-hour candles: ${bad.length ? bad.length + ' with a difference' : 'no difference'}${tr.length ? `; opened ${Math.round(tr.reduce((x, y) => x + (y.delay || 0), 0) / tr.length)} seconds after the signal on average` : ''}.`));
      for (const x of bad) root.appendChild(el('div', 'g-line g-warn', `${x.s} ${x.side > 0 ? 'buy' : 'short'} of ${when(x.signal)}: ${x.issues.join('; ')}`));
      root.appendChild(el('div', 'g-line' + (ms.length ? ' g-warn' : ''), ms.length ? `Signals the program did not take: ${ms.map((x) => `${x.s} ${x.side > 0 ? 'buy' : 'short'} ${when(x.signal)}`).join(', ')}.` : 'No signal of the replay was left untaken.'));
      const V = A.variants || {}, W = A.whole || {};
      if (Object.keys(V).length) { root.appendChild(el('div', 't-revh', `The same rule on ${Math.round((W.hours || 0) / 168)} weeks of candles, before costs`));
        const tb = root.appendChild(el('div', 't-table t-t4')); const hd = tb.appendChild(el('div', 't-tr t-th')); for (const h of ['While a trade is on', 'Trades', 'Gain %', 'Per trade']) hd.appendChild(el('span', '', h));
        for (const [k, v] of Object.entries(V)) { const r = tb.appendChild(el('div', 't-tr')); r.appendChild(el('span', 't-name', k.charAt(0).toUpperCase() + k.slice(1))); r.appendChild(el('span', '', String(v.n))); r.appendChild(el('span', '', v.share != null ? Math.round(v.share * 100) + '%' : '–')); r.appendChild(el('span', sign(v.avgR), v.avgR != null ? `${v.avgR >= 0 ? '+' : '−'}${Math.abs(v.avgR).toFixed(2)} R` : '–')); }
        root.appendChild(el('div', 'g-hint', 'R is the money risked on a trade. Costs take about 0.02 to 0.07 R per trade, and on this many trades anything within 0.07 R of zero is chance. Run again every night on the VM.')); }
    }
    head(root, 'The rules in force');
    if (R.arms) for (const [k, v] of Object.entries(R.arms)) root.appendChild(el('div', 'g-line', `${ARM[k] || k}${(P.paused || {})[k] ? ' (PAUSED)' : ''}: ${v}`));
    if (R.risk) { const F = R.fast || {}; root.appendChild(el('div', 'g-hint', `Nightly trades: ${(R.risk * 100).toFixed(2)}% of the account at risk each, at most ${(R.maxPosition * 100).toFixed(0)}% per position, ${R.maxNew} new a night, ${R.maxOpen} open, stop and target ${R.stopATR} ATR away, ${R.days} days at most, no leverage, companies of at least $${(R.minCap / 1e9).toFixed(0)} billion.`));
      if (F.risk) root.appendChild(el('div', 'g-hint', `Fast trades: ${(F.risk * 100).toFixed(2)}% at risk each, about ${(F.margin * 100).toFixed(0)}% set aside (so with leverage), at most ${F.maxOpen} open and ${F.maxNew} new per hour, ${F.hours} hours at most, nothing new around the nightly rollover, flat for the weekend.`));
      root.appendChild(el('div', 'g-hint', `A rule with ${R.pauseAfter} closed trades and an average under ${R.pauseBelow} R is paused by the program itself. Rules version ${R.version}.`)); }
    head(root, 'System');
    const g = root.appendChild(el('div', 'g-stats'));
    tile(g, 'eToro reading', M.live ? 'live' : 'not live', M.live ? `every 5 seconds · ${clock(M.L.at)}` : String(M.L.err || 'connecting'), M.live ? 'up' : 'down');
    tile(g, 'VM record', P.made ? when(P.made) : '–', S().vmSilent() ? 'SILENT: see the note at the top' : P.mode === 'live' ? 'orders are being sent (demo)' : P.mode ? 'dry run: no orders' : '', S().vmSilent() ? 'down' : '');
    tile(g, 'VM timetable', '5 min · 02:15', 'a look every 5 minutes on weekdays, also during the scan; scan, orders and the check of the orders at 02:15');
    tile(g, 'Daily review', E.length ? E[0].date : '–', 'every morning at 06:47');
    return true;
  }

  // ---- Progress: is the system getting better? ----
  // Three questions, each answered from the record: does a rule earn money beyond chance, does the program do what its rule says,
  // and are fewer faults found as the days pass. Nothing here is a forecast.
  const NEED = 30;                                                             // closed trades before a rule is judged at all
  const judge = (rs) => {
    const n = rs.length, mean = n ? rs.reduce((a, b) => a + b, 0) / n : null, sd = n > 1 ? Math.sqrt(rs.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (n - 1)) : null, m = n >= 5 && sd != null ? 1.96 * sd / Math.sqrt(n) : null;
    const v = n < NEED ? ['wait', `Too early: ${n} of ${NEED} trades`] : mean - m > 0 ? ['up', 'Earns, beyond chance'] : mean + m < 0 ? ['down', 'Loses, beyond chance'] : ['', 'No proof either way'];
    return { n, mean, m, cls: v[0], text: v[1] };
  };
  const rtxt = (x) => (x == null ? '–' : `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(2)} R`);
  function progress(root) {
    const M = calc(), P = M.P, V = S().review(), A = S().audit(); root.textContent = ''; status(root, M);
    const mine = M.closed.filter((c) => c.t && c.r != null), all = judge(mine.map((c) => c.r));
    // 1. the verdict
    head(root, 'Is there an edge yet?');
    const top = root.appendChild(el('div', 't-verdict ' + (all.cls === 'wait' ? '' : all.cls)));
    top.appendChild(el('div', 't-vbig', all.n < NEED ? 'Too early to say' : all.text));
    top.appendChild(el('div', 't-vsub', all.n < NEED ? `${all.n} of the ${NEED} closed trades needed before any rule can be judged. Until then every figure below is mostly chance.` : `${all.n} closed trades: ${rtxt(all.mean)} per trade, give or take ${all.m.toFixed(2)} R.`));
    const bar = top.appendChild(el('div', 't-need')); bar.appendChild(el('i')).style.width = Math.min(100, 100 * all.n / NEED) + '%';
    const tb = root.appendChild(el('div', 't-table t-t4')), hd = tb.appendChild(el('div', 't-tr t-th')); for (const h of ['Rule', 'Trades', 'Per trade', 'Give or take']) hd.appendChild(el('span', '', h));
    const rowsOf = (name, list) => { const j = judge(list.map((c) => c.r)), r = tb.appendChild(el('div', 't-tr')); const nm = r.appendChild(el('span', 't-name', name)); nm.appendChild(el('small', 't-sub ' + (j.cls === 'wait' ? '' : j.cls), j.text)); r.appendChild(el('span', '', String(j.n))); r.appendChild(el('span', sign(j.mean), rtxt(j.mean))); r.appendChild(el('span', '', j.m == null ? '–' : '±' + j.m.toFixed(2))); };
    for (const a of ['buy', 'short', 'fast-buy', 'fast-short']) rowsOf(ARM[a] + (P.paused && P.paused[a] ? ' (paused)' : ''), mine.filter((c) => c.arm === a));
    rowsOf('All rules', mine);
    root.appendChild(el('div', 'g-hint', 'R is the money risked on a trade: +1 R is a trade that won what it risked. "Give or take" is the range chance alone can produce on this many trades; a rule is said to earn only when its result stays above zero after taking that range off. A rule with 30 trades and a clearly negative result pauses itself.'));
    // 2. week by week, and by version of the rules
    head(root, 'Week by week');
    const wk = new Map(); for (const c of mine) { const d = new Date(c.at); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); const k = d.toISOString().slice(0, 10); if (!wk.has(k)) wk.set(k, []); wk.get(k).push(c); }
    if (!wk.size) root.appendChild(el('div', 'g-hint', 'No closed trade of the program yet.'));
    else { const w = root.appendChild(el('div', 't-table t-t4')), h2 = w.appendChild(el('div', 't-tr t-th')); for (const h of ['Week of', 'Trades', 'In R', 'In money']) h2.appendChild(el('span', '', h));
      for (const [k, list] of [...wk.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 12)) { const r = w.appendChild(el('div', 't-tr')), sr = list.reduce((a, c) => a + c.r, 0), sn = list.reduce((a, c) => a + c.net, 0); r.appendChild(el('span', 't-name', new Date(k).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }))); r.appendChild(el('span', '', `${list.length} (${list.filter((c) => c.net > 0).length} won)`)); r.appendChild(el('span', sign(sr), rtxt(sr))); r.appendChild(el('span', sign(sn), usd2(sn))); } }
    const vers = new Map(); for (const c of mine) { const k = c.t.rules || 1; if (!vers.has(k)) vers.set(k, []); vers.get(k).push(c); }
    if (vers.size > 1 || (M.rules && M.rules.version > 1)) { head(root, 'By version of the rules'); const w = root.appendChild(el('div', 't-table t-t4')), h2 = w.appendChild(el('div', 't-tr t-th')); for (const h of ['Version', 'Trades', 'Gain %', 'Per trade']) h2.appendChild(el('span', '', h));
      for (const [k, list] of [...vers.entries()].sort((a, b) => b[0] - a[0])) { const j = judge(list.map((c) => c.r)), r = w.appendChild(el('div', 't-tr')); r.appendChild(el('span', 't-name', `Version ${k}${M.rules && M.rules.version === k ? ' (in force)' : ''}`)); r.appendChild(el('span', '', String(j.n))); r.appendChild(el('span', '', Math.round(100 * list.filter((c) => c.net > 0).length / list.length) + '%')); r.appendChild(el('span', sign(j.mean), rtxt(j.mean))); } }
    else root.appendChild(el('div', 'g-hint', `Rules: version ${M.rules && M.rules.version ? M.rules.version : 1}, unchanged since the start. When a review changes a rule, the versions are compared here.`));
    // 3. does the program do what its rule says?
    head(root, 'Does the program follow its rule?');
    const H = A && A.history ? A.history.slice().reverse() : [];
    if (!H.length) root.appendChild(el('div', 'g-hint', 'The first nightly check appears here tomorrow morning.'));
    else { const last = H[0]; root.appendChild(el('div', 'g-line' + (last.differences || last.missed ? ' g-warn' : ''), `Last check (${last.date}): ${last.trades} trades compared with the rule replayed on eToro's candles; ${last.differences} with a difference, ${last.missed} signal${last.missed === 1 ? '' : 's'} not taken${last.delay != null ? `; orders opened ${Math.round(last.delay)} seconds after the signal` : ''}${last.slipR != null ? `, ${Math.abs(last.slipR).toFixed(2)} R ${last.slipR <= 0 ? 'lost' : 'gained'} on the price` : ''}.`));
      const w = root.appendChild(el('div', 't-table t-t4')), h2 = w.appendChild(el('div', 't-tr t-th')); for (const h of ['Night', 'Trades', 'Not as the rule', 'Missed']) h2.appendChild(el('span', '', h));
      for (const x of H.slice(0, 14)) { const r = w.appendChild(el('div', 't-tr')); r.appendChild(el('span', 't-name', new Date(x.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }))); r.appendChild(el('span', '', String(x.trades))); r.appendChild(el('span', x.differences ? 'down' : '', String(x.differences))); r.appendChild(el('span', x.missed ? 'down' : '', String(x.missed))); }
      const fastMine = mine.filter((c) => c.t.fast), fj = judge(fastMine.map((c) => c.r));
      if (last.replayR != null) root.appendChild(el('div', 'g-line', `What the replay expects from the fast rule: ${rtxt(last.replayR)} per trade before costs, on ${last.replayN} trades. What the real fast trades gave: ${fj.n ? rtxt(fj.mean) + ' after costs, on ' + fj.n + (fj.n < NEED ? ' (too few to compare)' : '') : 'none closed yet'}.`)); }
    // 4. the question left open on purpose: closing when the signal fades
    head(root, 'Would closing on a faded signal have helped?');
    const fd = mine.filter((c) => c.t.fast && c.t.fadedPx > 0 && c.t.stop > 0 && c.t.entry > 0 && Math.abs(c.t.entry - c.t.stop) > 0), shadow = (c) => c.side * (c.t.fadedPx - c.t.entry) / Math.abs(c.t.entry - c.t.stop);
    if (!fd.length) root.appendChild(el('div', 'g-hint', 'No closed trade yet whose signal faded while it was on. The program reads the signal every 5 minutes and notes the price when it first stops holding; the comparison appears here.'));
    else { const got = fd.reduce((a, c) => a + c.r, 0), sh = fd.reduce((a, c) => a + shadow(c), 0); root.appendChild(el('div', 'g-line', `${fd.length} closed trade${fd.length === 1 ? '' : 's'} whose signal faded while on: left alone they gave ${rtxt(got)} in all; closed at that moment they would have given ${rtxt(sh)} (before the cost of closing). ${fd.length < 20 ? 'Too few to decide.' : sh > got ? 'Closing would have been better so far.' : 'Leaving them alone was better so far.'}`)); }
    // 4b. against a yardstick, the twin without a target, and how far trades went
    head(root, 'Against a yardstick');
    const B = P.bench, lastC = (P.curve || []).filter((p) => p.length > 2).slice(-1)[0];
    if (B && lastC && B.px > 0 && B.value > 0) { const a = 100 * (lastC[1] / B.value - 1), b = 100 * (lastC[2] / B.px - 1); root.appendChild(el('div', 'g-line', `Since ${when(B.t)}: the account ${pc(a)}, the S&P 500 ${pc(b)}. The account keeps most of its money in cash, so on a strong day for shares it will lag, and on a weak day it will fall less.`)); }
    else root.appendChild(el('div', 'g-hint', 'The S&P 500 is recorded beside the account from the next half hour on; the comparison appears here.'));
    const withCost = mine.filter((c) => c.t.riskMoney > 0 && c.t.cost), costR = withCost.length ? withCost.reduce((a, c) => a + ((c.fees || 0) + (c.t.cost.spread || 0)) / c.t.riskMoney, 0) / withCost.length : null;
    root.appendChild(el('div', 'g-line', costR == null ? 'A coin flip on the same trades would lose their costs; the figure appears with the first closed trades.' : `A coin flip on the same ${withCost.length} trades (same assets, same moments, same stops and targets) would have given about ${rtxt(-costR)} per trade: it loses the costs and nothing else. The program gave ${rtxt(judge(withCost.map((c) => c.r)).mean)}.`));
    head(root, 'Do targets cut the winners?');
    const tw = (P.shadow || []).filter((x) => x.status === 'closed' && x.real && x.real.r != null && x.r != null), twOpen = (P.shadow || []).filter((x) => x.status === 'open').length;
    if (!tw.length) root.appendChild(el('div', 'g-hint', `Every trade has a twin on paper with the same entry, stop and time limit but no target (${twOpen} running now). When both have ended they are compared here, pair by pair. No order is sent for a twin.`));
    else { const d = judge(tw.map((x) => x.r - x.real.r)), a = judge(tw.map((x) => x.real.r)), b = judge(tw.map((x) => x.r)), w = root.appendChild(el('div', 't-table t-t4')), h2 = w.appendChild(el('div', 't-tr t-th')); for (const h of ['Same entries', 'Pairs', 'Gain %', 'Per trade']) h2.appendChild(el('span', '', h));
      for (const [nm, j, arr] of [['As traded (with the target)', a, tw.map((x) => x.real.r)], ['Twin without a target', b, tw.map((x) => x.r)]]) { const r = w.appendChild(el('div', 't-tr')); r.appendChild(el('span', 't-name', nm)); r.appendChild(el('span', '', String(j.n))); r.appendChild(el('span', '', Math.round(100 * arr.filter((x) => x > 0).length / arr.length) + '%')); r.appendChild(el('span', sign(j.mean), rtxt(j.mean))); }
      root.appendChild(el('div', 'g-line', `Difference, pair by pair: ${rtxt(d.mean)} per trade for the twin${d.m != null ? `, give or take ${d.m.toFixed(2)}` : ''}. ${d.n < NEED ? `Too early: ${d.n} of ${NEED} pairs.` : d.mean - d.m > 0 ? 'Without the target has done better, beyond chance.' : d.mean + d.m < 0 ? 'The target has done better, beyond chance.' : 'No proof either way yet.'} ${twOpen} twin${twOpen === 1 ? '' : 's'} still running.`)); }
    head(root, 'How far trades went before they ended');
    const ex = mine.filter((c) => c.t.best != null && c.t.worst != null), wn = ex.filter((c) => c.r > 0), ls = ex.filter((c) => c.r <= 0), avg = (a, f) => (a.length ? a.reduce((x, c) => x + f(c), 0) / a.length : null);
    if (!ex.length) root.appendChild(el('div', 'g-hint', 'From today each trade keeps its best and its worst point, in units of its risk. With the first closed trades this shows whether losers had been ahead and whether winners had to survive a fall first.'));
    else { const w = root.appendChild(el('div', 't-table t-t4')), h2 = w.appendChild(el('div', 't-tr t-th')); for (const h of ['Trades', 'Number', 'Best point', 'Worst point']) h2.appendChild(el('span', '', h));
      for (const [nm, a] of [['That ended with a gain', wn], ['That ended with a loss', ls]]) { const r = w.appendChild(el('div', 't-tr')); r.appendChild(el('span', 't-name', nm)); r.appendChild(el('span', '', String(a.length))); r.appendChild(el('span', 'up', rtxt(avg(a, (c) => c.t.best)))); r.appendChild(el('span', 'down', rtxt(avg(a, (c) => c.t.worst)))); }
      const ahead = ls.filter((c) => c.t.best >= 0.5).length; root.appendChild(el('div', 'g-line', `${ahead} of the ${ls.length} losing trade${ls.length === 1 ? '' : 's'} had been ahead by half their risk or more before turning.`)); }
    // 5. faults found and fixed
    head(root, 'Faults found and fixed');
    const E = V && V.entries ? V.entries : [], days = new Map(); for (const e of E) { const n = (e.decisions || []).filter((x) => /^(Found|Fixed|ALERT)/i.test(x)).length; days.set(e.date, (days.get(e.date) || 0) + n); }
    if (!days.size) root.appendChild(el('div', 'g-hint', 'No review yet.'));
    else { const w = root.appendChild(el('div', 't-fix')); for (const [d, n] of [...days.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 14)) { const r = w.appendChild(el('div', 't-fixrow')); r.appendChild(el('span', '', new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }))); const b = r.appendChild(el('span', 't-fixbar')); b.appendChild(el('i')).style.width = Math.min(100, n * 12) + '%'; r.appendChild(el('span', '', n ? String(n) : 'none')); }
      root.appendChild(el('div', 'g-hint', 'Each morning review and each check lists what it found wrong in the program and corrected. A system that is settling shows fewer of them as the days pass; the details are under Review.')); }
    return true;
  }

  // one watcher for the whole tab: each reading repaints the part on screen; when no part is on screen the readings stop
  const roots = {}; let watching = false;
  const live = (name, fn) => dash.draw(name, (root) => {
    roots[name] = [root, fn]; S().loadPractice(); fn(root);
    if (watching) return; watching = true;
    S().demoWatch(() => { let any = false; for (const k in roots) { const [r, f] = roots[k]; if (r.isConnected && !r.closest('[hidden]')) { any = true; if (!document.body.classList.contains('sheet-open')) f(r); } } if (!any) watching = false; return any; });
  });
  live('trade', overview); live('tradepos', positions); live('tradehist', history); live('tradereview', review); live('tradeprog', progress);
})();
