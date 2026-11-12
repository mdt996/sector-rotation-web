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
  const ui = { range: 'all', arm: 'all', sort: 'pl' };

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
    const m = new Map(); for (const p of (P.curve || [])) m.set(Math.round(p[0] / 60e3), p[1]); for (const p of (L.curve || [])) m.set(Math.round(p[0] / 60e3), p[1]); if (D) m.set(Math.round(Date.now() / 60e3), Math.round(out.value * 100) / 100);
    out.curve = [...m.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => [k * 60e3, v]).filter((p) => p[1] > 0);
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

  // ---- the value curve ----
  function chart(box, M) {
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
    const M = calc(), f = M.perf, st = M.stats; root.textContent = ''; status(root, M);
    const top = root.appendChild(el('div', 't-top')); top.appendChild(el('div', 't-value', usd(M.value)));
    const sub = top.appendChild(el('div', 't-sub'));
    if (f.total != null) { sub.appendChild(el('b', sign(f.total), `${usd2(f.total)} (${pc(f.totalPct)})`)); sub.appendChild(document.createTextNode(' since the start')); }
    if (f.day != null) { sub.appendChild(el('span', 't-sep', '·')); sub.appendChild(el('b', sign(f.day), `${usd2(f.day)} (${pc(100 * f.day / f.dayBase)})`)); sub.appendChild(document.createTextNode(' today')); }
    chart(root, M);
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
      b.appendChild(el('div', 't-l2', `${px(c.entry)} → ${px(c.exit)} (${pc(100 * c.side * (c.exit / c.entry - 1))}) · ended by ${c.how} · held ${span(c.at - c.opened)} · closed ${when(c.at)}${c.fees ? ` · fees ${usd2(-c.fees).replace('−', '')}` : ''}`)); }
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

  // one watcher for the whole tab: each reading repaints the part on screen; when no part is on screen the readings stop
  const roots = {}; let watching = false;
  const live = (name, fn) => dash.draw(name, (root) => {
    roots[name] = [root, fn]; S().loadPractice(); fn(root);
    if (watching) return; watching = true;
    S().demoWatch(() => { let any = false; for (const k in roots) { const [r, f] = roots[k]; if (r.isConnected && !r.closest('[hidden]')) { any = true; if (!document.body.classList.contains('sheet-open')) f(r); } } if (!any) watching = false; return any; });
  });
  live('trade', overview); live('tradepos', positions); live('tradehist', history); live('tradereview', review);
})();
