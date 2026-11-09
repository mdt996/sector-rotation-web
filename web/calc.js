// eToro candle answer -> one row per daily session, oldest first.
const readCandles = ({ answer }) => {
  let a = answer;
  if (Array.isArray(a) && a[0] && typeof a[0].text === 'string') a = a[0].text;
  if (a && Array.isArray(a.content) && a.content[0] && typeof a.content[0].text === 'string') a = a.content[0].text;
  if (typeof a === 'string') a = JSON.parse(a);
  if (a.statusCode && a.statusCode !== 200) throw new Error('eToro answered ' + a.statusCode + ': ' + String(a.body || a.error || '').slice(0, 200));
  const body = typeof a.body === 'string' ? JSON.parse(a.body) : (a.body || a);
  const group = body.candles && body.candles[0];
  if (!group || !Array.isArray(group.candles)) throw new Error('No candles in eToro answer (keys: ' + Object.keys(body).join(', ') + ')');
  return group.candles
    .filter((c) => !(c.volume == null && c.open === c.high && c.high === c.low && c.low === c.close)) // placeholder candles
    .map((c) => ({ date: String(c.fromDate).slice(0, 10), open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume }))
    .sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
};
dash.loader('SPY', { description: 'eToro daily candles as rows: date, open, high, low, close, volume (oldest first)', fn: readCandles });
dash.loader('QQQ', { description: 'eToro daily candles as rows: date, open, high, low, close, volume (oldest first)', fn: readCandles });
dash.loader('IWM', { description: 'eToro daily candles as rows: date, open, high, low, close, volume (oldest first)', fn: readCandles });
dash.loader('XLK', { description: 'eToro daily candles as rows: date, open, high, low, close, volume (oldest first)', fn: readCandles });
dash.loader('XLF', { description: 'eToro daily candles as rows: date, open, high, low, close, volume (oldest first)', fn: readCandles });
dash.loader('XLE', { description: 'eToro daily candles as rows: date, open, high, low, close, volume (oldest first)', fn: readCandles });
dash.loader('XLV', { description: 'eToro daily candles as rows: date, open, high, low, close, volume (oldest first)', fn: readCandles });
dash.loader('XLI', { description: 'eToro daily candles as rows: date, open, high, low, close, volume (oldest first)', fn: readCandles });
dash.loader('XLY', { description: 'eToro daily candles as rows: date, open, high, low, close, volume (oldest first)', fn: readCandles });
dash.loader('XLP', { description: 'eToro daily candles as rows: date, open, high, low, close, volume (oldest first)', fn: readCandles });
dash.loader('XLU', { description: 'eToro daily candles as rows: date, open, high, low, close, volume (oldest first)', fn: readCandles });
dash.loader('XLB', { description: 'eToro daily candles as rows: date, open, high, low, close, volume (oldest first)', fn: readCandles });
dash.loader('XLRE', { description: 'eToro daily candles as rows: date, open, high, low, close, volume (oldest first)', fn: readCandles });
dash.loader('XLC', { description: 'eToro daily candles as rows: date, open, high, low, close, volume (oldest first)', fn: readCandles });
dash.loader('SMH', { description: 'eToro daily candles as rows: date, open, high, low, close, volume (oldest first)', fn: readCandles });
dash.loader('IGV', { description: 'eToro daily candles as rows: date, open, high, low, close, volume (oldest first)', fn: readCandles });
dash.loader('XBI', { description: 'eToro daily candles as rows: date, open, high, low, close, volume (oldest first)', fn: readCandles });
dash.loader('KRE', { description: 'eToro daily candles as rows: date, open, high, low, close, volume (oldest first)', fn: readCandles });
dash.loader('ITA', { description: 'eToro daily candles as rows: date, open, high, low, close, volume (oldest first)', fn: readCandles });
dash.loader('GDX', { description: 'eToro daily candles as rows: date, open, high, low, close, volume (oldest first)', fn: readCandles });
dash.loader('SIL', { description: 'eToro daily candles as rows: date, open, high, low, close, volume (oldest first)', fn: readCandles });
dash.loader('COPX', { description: 'eToro daily candles as rows: date, open, high, low, close, volume (oldest first)', fn: readCandles });
dash.loader('URA', { description: 'eToro daily candles as rows: date, open, high, low, close, volume (oldest first)', fn: readCandles });
dash.loader('GLD', { description: 'eToro daily candles as rows: date, open, high, low, close, volume (oldest first)', fn: readCandles });
dash.loader('TLT', { description: 'eToro daily candles as rows: date, open, high, low, close, volume (oldest first)', fn: readCandles });
dash.loader('IBIT', { description: 'eToro daily candles as rows: date, open, high, low, close, volume (oldest first)', fn: readCandles });
dash.loader('AG', { description: 'eToro daily candles as rows: date, open, high, low, close, volume (oldest first)', fn: readCandles });
dash.loader('MSTR', { description: 'eToro daily candles as rows: date, open, high, low, close, volume (oldest first)', fn: readCandles });
dash.loader('SPCX', { description: 'eToro daily candles as rows: date, open, high, low, close, volume (oldest first)', fn: readCandles });
dash.loader('EURUSD', { description: 'eToro daily candles as rows: date, open, high, low, close, volume (oldest first)', fn: readCandles });
dash.calc('settings', {
  title: "Settings",
  description: "Windows and thresholds every calculation on this page uses.",
  inputs: ["SPY"],
  fn: (SPY) => [{
  asof: SPY.length ? SPY[SPY.length - 1].date : null, // last daily candle
  benchmark: 'SPY',
  weekDays: 7, monthDays: 30, quarterDays: 91, halfDays: 182, // return windows, calendar days
  maFast: 20, maMid: 50, maSlow: 200, // moving averages, sessions
  rsiLen: 14, rsiHigh: 70, rsiLow: 30,
  rsSmooth: 10, // EMA smoothing of the relative-strength line (ETF / SPY), sessions
  rsBase: 50,   // RS-Ratio = smoothed RS / its own average over this many sessions
  rsLag: 10,    // RS-Momentum = change in RS-Ratio over this many sessions
  momFadePts: 2, // a leader is fading when RS-Momentum is this many points below its recent peak
  trailStep: 5, trailPoints: 7, // rotation-map tails: one point a week, six weeks back
  pivotSpan: 3, // a swing high/low is the extreme of this many sessions on each side
  levelLookback: 130, levelTolAtr: 0.6, atrLen: 14, // support/resistance search
  swingLookback: 40, // exit/entry triggers: the latest swing low/high within this many sessions
  heatWeeks: 8,
  wkSmooth: 4, wkBase: 26, wkLag: 4, wkTrail: 8, // weekly rotation map: the same recipe on weekly closes
  ruleLong: 252, ruleSkip: 21, ruleTop: 4, ruleSteps: 4, ruleVol: 252, // rotation rule: 12-month return without the latest month (sessions), sectors held, weekly steps, volatility window
  volLen: 20, breadthGood: 6, breadthWeak: 4, defGap: -0.03, // regime: volatility window, sector breadth thresholds, cyclicals-minus-defensives gap
}],
});
dash.calc('panel', {
  title: "Daily prices + averages",
  description: "All 26 ETFs and the 3 stocks you hold in one table, with their moving averages and RSI.",
  inputs: ["settings","SPY","QQQ","IWM","XLK","XLF","XLE","XLV","XLI","XLY","XLP","XLU","XLB","XLRE","XLC","SMH","IGV","XBI","KRE","ITA","GDX","SIL","COPX","URA","GLD","TLT","IBIT","AG","MSTR","SPCX"],
  fn: (settings, SPY, QQQ, IWM, XLK, XLF, XLE, XLV, XLI, XLY, XLP, XLU, XLB, XLRE, XLC, SMH, IGV, XBI, KRE, ITA, GDX, SIL, COPX, URA, GLD, TLT, IBIT, AG, MSTR, SPCX) => {
  const S = settings[0];
  const all = { SPY, QQQ, IWM, XLK, XLF, XLE, XLV, XLI, XLY, XLP, XLU, XLB, XLRE, XLC, SMH, IGV, XBI, KRE, ITA, GDX, SIL, COPX, URA, GLD, TLT, IBIT, AG, MSTR, SPCX };
  const r4 = (x) => (x == null || !isFinite(x) ? null : Math.round(x * 1e4) / 1e4);
  const out = [];
  for (const [symbol, rows] of Object.entries(all)) {
    const c = rows.map((r) => r.close);
    const sma = (n) => { let s = 0; return c.map((v, i) => { s += v; if (i >= n) s -= c[i - n]; return i >= n - 1 ? s / n : null; }); };
    const fast = sma(S.maFast), mid = sma(S.maMid), slow = sma(S.maSlow);
    const N = S.rsiLen; let up = 0, dn = 0;
    const rsi = c.map((v, i) => { // Wilder's RSI
      if (i === 0) return null;
      const g = Math.max(v - c[i - 1], 0), l = Math.max(c[i - 1] - v, 0);
      if (i <= N) { up += g / N; dn += l / N; if (i < N) return null; } else { up = (up * (N - 1) + g) / N; dn = (dn * (N - 1) + l) / N; }
      return dn === 0 ? 100 : 100 - 100 / (1 + up / dn);
    });
    rows.forEach((r, i) => out.push({ symbol, date: r.date, open: r.open, high: r.high, low: r.low, close: r.close, volume: r.volume,
      maFast: r4(fast[i]), maMid: r4(mid[i]), maSlow: r4(slow[i]), rsi: r4(rsi[i]) }));
  }
  return out;
},
});
dash.calc('levels', {
  title: "Support, resistance, triggers",
  description: "Clustered swing highs/lows nearest the price, plus each ETF's exit and entry triggers.",
  inputs: ["settings","panel"],
  fn: (settings, panel) => {
  const S = settings[0];
  const groups = {};
  for (const r of panel) (groups[r.symbol] = groups[r.symbol] || []).push(r);
  const r4 = (x) => Math.round(x * 1e4) / 1e4;
  const out = [];
  for (const [symbol, rows] of Object.entries(groups)) {
    const n = rows.length; if (n < 30) continue;
    const last = rows[n - 1];
    let atr = 0; // Wilder's average true range
    for (let i = 1; i < n; i++) {
      const tr = Math.max(rows[i].high - rows[i].low, Math.abs(rows[i].high - rows[i - 1].close), Math.abs(rows[i].low - rows[i - 1].close));
      atr = i <= S.atrLen ? atr + tr / S.atrLen : (atr * (S.atrLen - 1) + tr) / S.atrLen;
    }
    const k = S.pivotSpan, from = Math.max(k, n - S.levelLookback), piv = [];
    for (let i = from; i < n - k; i++) {
      let hi = true, lo = true;
      for (let j = i - k; j <= i + k; j++) { if (rows[j].high > rows[i].high) hi = false; if (rows[j].low < rows[i].low) lo = false; }
      if (hi) piv.push({ price: rows[i].high, i, type: 'high' });
      if (lo) piv.push({ price: rows[i].low, i, type: 'low' });
    }
    const recent = (type) => piv.filter((p) => p.type === type && p.i >= n - S.swingLookback).sort((a, b) => b.i - a.i)[0];
    const swingLow = recent('low'), swingHigh = recent('high');
    const tol = Math.max(S.levelTolAtr * atr, last.close * 0.004), clusters = [];
    for (const p of piv.slice().sort((a, b) => a.price - b.price)) {
      const c = clusters[clusters.length - 1];
      if (c && p.price - c.price <= tol) { c.sum += p.price; c.touches += 1; c.price = c.sum / c.touches; c.i = Math.max(c.i, p.i); }
      else clusters.push({ sum: p.price, touches: 1, price: p.price, i: p.i });
    }
    const keep = clusters.filter((c) => c.touches >= 2 || c.i >= n - S.swingLookback).map((c) => ({ ...c, basis: 'swing cluster' }));
    const year = rows.slice(-252), yi = n - year.length;
    const lowI = year.reduce((b, r, j) => (r.low < year[b].low ? j : b), 0), highI = year.reduce((b, r, j) => (r.high > year[b].high ? j : b), 0);
    let below = keep.filter((c) => c.price < last.close).sort((a, b) => b.price - a.price).slice(0, 3);
    let above = keep.filter((c) => c.price > last.close).sort((a, b) => a.price - b.price).slice(0, 3);
    if (!below.length && year[lowI].low < last.close) below = [{ price: year[lowI].low, touches: 1, i: yi + lowI, basis: '52-week low' }];
    if (!above.length && year[highI].high > last.close) above = [{ price: year[highI].high, touches: 1, i: yi + highI, basis: '52-week high' }];
    below.forEach((c, j) => out.push({ symbol, kind: 'support', rank: j + 1, price: r4(c.price), touches: c.touches, date: rows[c.i].date, basis: c.basis }));
    above.forEach((c, j) => out.push({ symbol, kind: 'resistance', rank: j + 1, price: r4(c.price), touches: c.touches, date: rows[c.i].date, basis: c.basis }));
    if (swingLow) out.push({ symbol, kind: 'exit', rank: 0, price: r4(swingLow.price), touches: 1, date: rows[swingLow.i].date, basis: 'latest swing low' });
    if (swingHigh) out.push({ symbol, kind: 'entry', rank: 0, price: r4(swingHigh.price), touches: 1, date: rows[swingHigh.i].date, basis: 'latest swing high' });
    out.push({ symbol, kind: 'atr', rank: 0, price: r4(atr), touches: 0, date: last.date, basis: 'average true range' });
  }
  return out;
},
});
dash.calc('rrg', {
  title: "Rotation vs SPY",
  description: "RS-Ratio and RS-Momentum of each ETF against SPY, one point a week.",
  inputs: ["settings","panel"],
  fn: (settings, panel) => {
  const S = settings[0];
  const groups = {};
  for (const r of panel) (groups[r.symbol] = groups[r.symbol] || []).push(r);
  const bench = new Map((groups[S.benchmark] || []).map((r) => [r.date, r.close]));
  const r4 = (x) => Math.round(x * 1e4) / 1e4, a = 2 / (S.rsSmooth + 1), out = [];
  for (const [symbol, rows] of Object.entries(groups)) {
    if (symbol === S.benchmark) continue;
    const pts = rows.filter((r) => bench.has(r.date)).map((r) => ({ date: r.date, rs: r.close / bench.get(r.date) }));
    let ema = null, sum = 0;
    pts.forEach((p, i) => {
      ema = ema == null ? p.rs : a * p.rs + (1 - a) * ema; p.ema = ema;
      sum += ema; if (i >= S.rsBase) sum -= pts[i - S.rsBase].ema;
      p.ratio = i >= S.rsBase - 1 ? (100 * ema) / (sum / S.rsBase) : null;
      const q = pts[i - S.rsLag];
      p.mom = q && q.ratio != null && p.ratio != null ? (100 * p.ratio) / q.ratio : null;
    });
    const n = pts.length;
    for (let s = S.trailPoints - 1; s >= 0; s--) {
      const p = pts[n - 1 - s * S.trailStep];
      if (p && p.ratio != null && p.mom != null) out.push({ symbol, step: S.trailPoints - 1 - s, date: p.date, ratio: r4(p.ratio), mom: r4(p.mom) });
    }
  }
  return out;
},
});
dash.calc('rrg_w', {
  title: "Rotation vs SPY, weekly",
  description: "The same rotation measures on weekly closes, eight weekly points.",
  inputs: ["settings","panel"],
  fn: (settings, panel) => {
  const S = settings[0];
  const groups = {};
  for (const r of panel) (groups[r.symbol] = groups[r.symbol] || []).push(r);
  const monday = (d) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x.toISOString().slice(0, 10); };
  const weekly = (rows) => {
    const w = [];
    for (const r of rows) { const k = monday(r.date), l = w[w.length - 1]; if (l && l.week === k) { l.close = r.close; l.date = r.date; } else w.push({ week: k, date: r.date, close: r.close }); }
    return w;
  };
  const bench = new Map(weekly(groups[S.benchmark] || []).map((x) => [x.week, x.close]));
  const r4 = (x) => Math.round(x * 1e4) / 1e4, a = 2 / (S.wkSmooth + 1), out = [];
  for (const [symbol, rows] of Object.entries(groups)) {
    if (symbol === S.benchmark) continue;
    const pts = weekly(rows).filter((x) => bench.has(x.week)).map((x) => ({ ...x, rs: x.close / bench.get(x.week) }));
    let ema = null, sum = 0;
    pts.forEach((p, i) => {
      ema = ema == null ? p.rs : a * p.rs + (1 - a) * ema; p.ema = ema;
      sum += ema; if (i >= S.wkBase) sum -= pts[i - S.wkBase].ema;
      p.ratio = i >= S.wkBase - 1 ? (100 * ema) / (sum / S.wkBase) : null;
      const q = pts[i - S.wkLag];
      p.mom = q && q.ratio != null && p.ratio != null ? (100 * p.ratio) / q.ratio : null;
    });
    const n = pts.length;
    for (let s = S.wkTrail - 1; s >= 0; s--) {
      const p = pts[n - 1 - s];
      if (p && p.ratio != null && p.mom != null) out.push({ symbol, step: S.wkTrail - 1 - s, date: p.date, ratio: r4(p.ratio), mom: r4(p.mom) });
    }
  }
  return out;
},
});
dash.calc('metrics', {
  title: "Momentum & phase per ETF",
  description: "Returns, strength vs SPY, trend, daily and weekly rotation phase, triggers and the suggested action for each ETF.",
  inputs: ["settings","panel","levels","rrg","rrg_w"],
  fn: (settings, panel, levels, rrg, rrg_w) => {
  const S = settings[0];
  const INFO = {
    SPY: ['S&P 500', 'Market'], QQQ: ['Nasdaq-100', 'Market'], IWM: ['Russell 2000 small caps', 'Market'],
    XLK: ['Technology', 'Sector'], XLF: ['Financials', 'Sector'], XLE: ['Energy', 'Sector'], XLV: ['Health care', 'Sector'],
    XLI: ['Industrials', 'Sector'], XLY: ['Consumer discretionary', 'Sector'], XLP: ['Consumer staples', 'Sector'],
    XLU: ['Utilities', 'Sector'], XLB: ['Materials', 'Sector'], XLRE: ['Real estate', 'Sector'], XLC: ['Communication services', 'Sector'],
    SMH: ['Semiconductors', 'Industry'], IGV: ['Software', 'Industry'], XBI: ['Biotech', 'Industry'], KRE: ['Regional banks', 'Industry'],
    ITA: ['Aerospace & defense', 'Industry'], GDX: ['Gold miners', 'Commodity'], SIL: ['Silver miners', 'Commodity'],
    COPX: ['Copper miners', 'Commodity'], URA: ['Uranium', 'Commodity'], GLD: ['Gold', 'Cross-asset'],
    TLT: ['20+ year Treasuries', 'Cross-asset'], IBIT: ['Bitcoin', 'Cross-asset'],
    AG: ['First Majestic Silver', 'Stock'], MSTR: ['Strategy (bitcoin holder)', 'Stock'], SPCX: ['SpaceX', 'Stock'],
  };
  const groups = {};
  for (const r of panel) (groups[r.symbol] = groups[r.symbol] || []).push(r);
  const day = 864e5, t = (d) => Date.parse(d + 'T00:00:00Z');
  const closeOn = (rows, ms) => { let c = null; for (const r of rows) { if (t(r.date) <= ms) c = r.close; else break; } return c; };
  const ret = (rows, days, endDays = 0) => {
    const end = t(rows[rows.length - 1].date) - endDays * day;
    const a = endDays ? closeOn(rows, end) : rows[rows.length - 1].close, b = closeOn(rows, end - days * day);
    return a != null && b != null ? a / b - 1 : null;
  };
  const phaseOf = (p) => (!p ? null : p.ratio >= 100 ? (p.mom >= 100 ? 'Leading' : 'Weakening') : p.mom >= 100 ? 'Improving' : 'Lagging');
  const spyMonth = groups[S.benchmark] ? ret(groups[S.benchmark], S.monthDays) : null;
  const r4 = (x) => (x == null || !isFinite(x) ? null : Math.round(x * 1e4) / 1e4);
  return Object.entries(groups).map(([symbol, rows]) => {
    const L = rows[rows.length - 1];
    const lv = levels.filter((l) => l.symbol === symbol);
    const level = (kind, rank) => { const x = lv.find((l) => l.kind === kind && (rank == null || l.rank === rank)); return x ? x.price : null; };
    const tail = rrg.filter((p) => p.symbol === symbol).sort((a, b) => a.step - b.step);
    const now = tail[tail.length - 1], before = tail[tail.length - 1 - Math.round(S.rsLag / S.trailStep)];
    const wk = rrg_w.filter((p) => p.symbol === symbol).sort((a, b) => a.step - b.step), nowW = wk[wk.length - 1];
    const r1w = ret(rows, S.weekDays), r1m = ret(rows, S.monthDays), prior = ret(rows, S.monthDays - S.weekDays, S.weekDays);
    const hi = Math.max(...rows.slice(-252).map((r) => r.high));
    const exit = level('exit'), entry = level('entry');
    const exitHit = exit != null && L.close < exit, entryHit = entry != null && L.close > entry;
    const isBench = symbol === S.benchmark;
    const phase = isBench ? 'Benchmark' : phaseOf(now), before_ = isBench ? null : phaseOf(before);
    const aboveFast = L.maFast != null && L.close > L.maFast;
    const recentMom = tail.slice(-3).map((p) => p.mom), momDrop = now ? Math.max(...recentMom) - now.mom : null;
    const momFading = phase === 'Leading' && momDrop != null && momDrop >= S.momFadePts;
    let action = '—';
    if (phase === 'Leading') action = L.rsi >= S.rsiHigh ? 'Hold, overbought' : momFading || !aboveFast ? 'Hold, tighten stop' : 'Hold';
    else if (phase === 'Weakening') action = exitHit || !aboveFast ? 'Rotate out' : 'Trim';
    else if (phase === 'Lagging') action = aboveFast && !exitHit ? 'Watch' : 'Avoid';
    else if (phase === 'Improving') action = entryHit || aboveFast ? 'Accumulate' : 'Watch';
    const fading = phase === 'Weakening' || momFading || (phase === 'Lagging' && (before_ === 'Leading' || before_ === 'Weakening'));
    const turning = phase === 'Improving' || (phase === 'Leading' && (before_ === 'Improving' || before_ === 'Lagging'));
    return {
      symbol, name: INFO[symbol] ? INFO[symbol][0] : symbol, group: INFO[symbol] ? INFO[symbol][1] : 'Other',
      date: L.date, close: L.close,
      r1d: r4(rows.length > 1 ? L.close / rows[rows.length - 2].close - 1 : null),
      r1w: r4(r1w), r1m: r4(r1m), r3m: r4(ret(rows, S.quarterDays)), r6m: r4(ret(rows, S.halfDays)),
      vs_spy_1m: r4(r1m != null && spyMonth != null ? (1 + r1m) / (1 + spyMonth) - 1 : null),
      pace_shift: r4(r1w != null && prior != null ? r1w - (prior * S.weekDays) / (S.monthDays - S.weekDays) : null),
      rsi: L.rsi, vs_ma50: r4(L.maMid ? L.close / L.maMid - 1 : null), vs_ma200: r4(L.maSlow ? L.close / L.maSlow - 1 : null),
      above_ma20: aboveFast, from_high: r4(L.close / hi - 1),
      ratio: now ? now.ratio : null, mom: now ? now.mom : null, phase, phase_before: before_, phase_w: isBench ? 'Benchmark' : phaseOf(nowW),
      support: level('support', 1), resistance: level('resistance', 1), exit, entry,
      exit_hit: exitHit, entry_hit: entryHit, exit_gap: r4(exit != null ? exit / L.close - 1 : null), entry_gap: r4(entry != null ? entry / L.close - 1 : null),
      mom_drop: r4(momDrop), atr: level('atr'), action, fading, turning,
    };
  });
},
});
dash.calc('summary', {
  title: "Sector headline figures",
  description: "Best and worst sector, SPY, phase counts and breadth for the 11 sectors.",
  inputs: ["metrics"],
  fn: (metrics) => {
  const sec = metrics.filter((m) => m.group === 'Sector' && m.r1m != null);
  if (!sec.length) return [];
  const best = sec.reduce((a, b) => (b.r1m > a.r1m ? b : a)), worst = sec.reduce((a, b) => (b.r1m < a.r1m ? b : a));
  const spy = metrics.find((m) => m.symbol === 'SPY') || {};
  const count = (p) => sec.filter((m) => m.phase === p).length;
  return [{
    asof: spy.date || sec[0].date, best: best.symbol, best_name: best.name, best_r1m: best.r1m,
    worst: worst.symbol, worst_name: worst.name, worst_r1m: worst.r1m, spy_r1m: spy.r1m == null ? null : spy.r1m,
    leading: count('Leading'), weakening: count('Weakening'), lagging: count('Lagging'), improving: count('Improving'),
    above_ma50: sec.filter((m) => m.vs_ma50 != null && m.vs_ma50 > 0).length, sectors: sec.length,
  }];
},
});
dash.calc('rule', {
  title: "Rotation rule",
  description: "Each fund's 12-month return without the latest month, its volatility and 200-day trend; the sectors' ranks, the last four Fridays' picks and the target split.",
  inputs: ["settings","panel","metrics","revolut"],
  fn: (settings, panel, metrics, revolut) => {
  const S = settings[0];
  const rev = new Map((revolut || []).filter((r) => r.revolut_ticker).map((r) => [r.us, r.revolut_ticker]));
  const r4 = (x) => (x == null || !isFinite(x) ? null : Math.round(x * 1e4) / 1e4);
  const info = new Map(metrics.map((m) => [m.symbol, m]));
  const groups = {};
  for (const r of panel) (groups[r.symbol] = groups[r.symbol] || []).push(r);
  // Friday closes on the benchmark's calendar: the last session of each week (this week counts once Friday has closed)
  const cal = (groups[S.benchmark] || []).map((r) => r.date);
  const monday = (d) => { const t = Date.parse(d + 'T00:00:00Z'); return t - ((new Date(t).getUTCDay() + 6) % 7) * 864e5; };
  const fridays = cal.filter((d, i) => (i + 1 < cal.length ? monday(cal[i + 1]) !== monday(d) : new Date(d + 'T00:00:00Z').getUTCDay() === 5)).slice(-S.ruleSteps);
  const at = (rows, d) => { let i = rows.length - 1; while (i >= 0 && rows[i].date > d) i--; return i; };
  const vol = (rows, i, h) => { // annualised volatility of daily returns over h sessions
    if (i < h) return null;
    let s = 0, s2 = 0;
    for (let k = i - h + 1; k <= i; k++) { const x = Math.log(rows[k].close / rows[k - 1].close); s += x; s2 += x * x; }
    return Math.sqrt(Math.max((s2 - (s * s) / h) / (h - 1), 0) * 252);
  };
  // every fund is measured between the same two benchmark sessions, so a missing day in one series can't shift its window
  const calIdx = new Map(cal.map((d, k) => [d, k]));
  const score = (rows, d) => {
    const k = calIdx.get(d);
    if (k == null || k < S.ruleLong || !rows.length || rows[0].date > cal[k - S.ruleLong]) return null;
    const a = at(rows, cal[k - S.ruleSkip]), b = at(rows, cal[k - S.ruleLong]);
    return a >= 0 && b >= 0 ? rows[a].close / rows[b].close - 1 : null;
  };
  const sectors = Object.keys(groups).filter((s) => (info.get(s) || {}).group === 'Sector');
  const ranked = (d) => sectors.map((s) => ({ s, v: score(groups[s], d) })).filter((x) => x.v != null).sort((a, b) => b.v - a.v);
  const picks = fridays.map((d) => ranked(d).slice(0, S.ruleTop).map((x) => x.s));
  const RANK = new Map(ranked(cal[cal.length - 1]).map((x, k) => [x.s, k + 1]));
  const slots = S.ruleSteps * S.ruleTop, lastPicks = picks[picks.length - 1] || [], prevPicks = picks[picks.length - 2] || [];
  const out = Object.entries(groups).map(([symbol, rows]) => {
    const i = rows.length - 1, L = rows[i], meta = info.get(symbol) || {}, isSec = sectors.includes(symbol);
    const sc = score(rows, cal[cal.length - 1]), v12 = vol(rows, i, S.ruleVol);
    const hist = isSec ? picks.map((p) => (p.includes(symbol) ? '1' : '0')).join('') : null;
    const weeks = hist ? hist.split('').filter((x) => x === '1').length : null;
    return {
      symbol, name: meta.name || symbol, group: meta.group || 'Other', date: L.date, close: L.close, sector: isSec, revolut: rev.get(symbol) || null,
      score: r4(sc), r1m: meta.r1m == null ? null : meta.r1m, vol12m: r4(v12), vol3m: r4(vol(rows, i, 63)),
      per_risk: r4(sc != null && v12 ? sc / v12 : null),
      ma200: L.maSlow, vs_ma200: r4(L.maSlow ? L.close / L.maSlow - 1 : null), above: L.maSlow == null ? null : L.close > L.maSlow,
      rank: isSec ? RANK.get(symbol) || null : null, now: isSec && (RANK.get(symbol) || 99) <= S.ruleTop,
      pick: lastPicks.includes(symbol), new_pick: lastPicks.includes(symbol) && !prevPicks.includes(symbol), dropped: !lastPicks.includes(symbol) && prevPicks.includes(symbol),
      hist, weeks, target: weeks == null ? null : r4(weeks / slots),
      last_friday: fridays[fridays.length - 1] || null, first_friday: fridays[0] || null,
    };
  });
  // a Friday with fewer than 4 sectors that have a year of history leaves its empty slots in cash
  const cash = 1 - picks.reduce((s, p) => s + p.length, 0) / slots;
  return cash > 1e-9 ? [...out, { symbol: 'CASH', name: 'Cash', group: 'Cash', sector: false, target: r4(cash), last_friday: fridays[fridays.length - 1] || null }] : out;
},
});
dash.calc('heat', {
  title: "Weekly returns",
  description: "Return of each calendar week for every ETF.",
  inputs: ["settings","panel"],
  fn: (settings, panel) => {
  const S = settings[0];
  const groups = {};
  for (const r of panel) (groups[r.symbol] = groups[r.symbol] || []).push(r);
  const monday = (d) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x.toISOString().slice(0, 10); };
  const out = [];
  for (const [symbol, rows] of Object.entries(groups)) {
    const weeks = [];
    for (const r of rows) { const w = monday(r.date); const last = weeks[weeks.length - 1]; if (last && last.week === w) last.close = r.close; else weeks.push({ week: w, close: r.close }); }
    const tail = weeks.slice(-(S.heatWeeks + 1));
    for (let i = 1; i < tail.length; i++) out.push({ symbol, week: tail[i].week, ret: Math.round((tail[i].close / tail[i - 1].close - 1) * 1e4) / 1e4 });
  }
  return out;
},
});
dash.calc('race', {
  title: "Last month, daily",
  description: "Each ETF's change since the close before the last-month window.",
  inputs: ["settings","panel"],
  fn: (settings, panel) => {
  const S = settings[0];
  const groups = {};
  for (const r of panel) (groups[r.symbol] = groups[r.symbol] || []).push(r);
  const t = (d) => Date.parse(d + 'T00:00:00Z');
  const out = [];
  for (const [symbol, rows] of Object.entries(groups)) {
    const start = t(rows[rows.length - 1].date) - S.monthDays * 864e5;
    let i0 = 0; rows.forEach((r, i) => { if (t(r.date) <= start) i0 = i; });
    const base = rows[i0].close;
    for (let i = i0; i < rows.length; i++) out.push({ symbol, date: rows[i].date, change: Math.round((rows[i].close / base - 1) * 1e4) / 1e4 });
  }
  return out;
},
});
dash.calc('regime', {
  title: "Market regime",
  description: "Trend, breadth, risk appetite, safe havens and volatility, now and a week ago.",
  inputs: ["settings","panel"],
  fn: (settings, panel) => {
  const S = settings[0];
  const SECTORS = ['XLK', 'XLF', 'XLE', 'XLV', 'XLI', 'XLY', 'XLP', 'XLU', 'XLB', 'XLRE', 'XLC'];
  const CYC = ['XLY', 'XLF', 'XLI', 'XLB', 'XLK'], DEF = ['XLP', 'XLU', 'XLV'];
  const groups = {};
  for (const r of panel) (groups[r.symbol] = groups[r.symbol] || []).push(r);
  const spy = groups[S.benchmark] || [], n = spy.length;
  if (n < S.maSlow + 10) return [];
  const t = (d) => Date.parse(d + 'T00:00:00Z'), day = 864e5;
  const rowAt = (s, d) => { // last row on or before the date
    const rows = groups[s]; if (!rows || !rows.length) return null;
    let lo = 0, hi = rows.length - 1, k = -1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (rows[mid].date <= d) { k = mid; lo = mid + 1; } else hi = mid - 1; }
    return k < 0 ? null : rows[k];
  };
  const back = (d, days) => new Date(t(d) - days * day).toISOString().slice(0, 10);
  const ret = (s, d) => { const a = rowAt(s, d), b = rowAt(s, back(d, S.monthDays)); return a && b ? a.close / b.close - 1 : null; };
  const avg = (xs) => { const v = xs.filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const volAt = (i) => {
    const lr = [];
    for (let j = Math.max(1, i - S.volLen + 1); j <= i; j++) lr.push(Math.log(spy[j].close / spy[j - 1].close));
    const m = avg(lr);
    return Math.sqrt(lr.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, lr.length - 1)) * Math.sqrt(252);
  };
  const at = (i) => {
    const L = spy[i], d = L.date, fresh = spy[Math.max(0, i - 5)].date;
    const hi = Math.max(...spy.slice(Math.max(0, i - 251), i + 1).map((r) => r.high));
    const sec = SECTORS.map((s) => rowAt(s, d)).filter((r) => r && r.date >= fresh);
    const spyM = ret(S.benchmark, d);
    const rel = (s) => { const r = ret(s, d); return r != null && spyM != null ? (1 + r) / (1 + spyM) - 1 : null; };
    const cyc = avg(CYC.map((s) => ret(s, d))), def = avg(DEF.map((s) => ret(s, d)));
    const xs = [];
    for (let j = Math.max(0, i - S.maMid + 1); j <= i; j++) { const a = rowAt('XLY', spy[j].date), b = rowAt('XLP', spy[j].date); if (a && b) xs.push(a.close / b.close); }
    return {
      date: d, close: L.close, ma50: L.maMid, ma200: L.maSlow, dd: L.close / hi - 1,
      breadth50: sec.filter((r) => r.maMid != null && r.close > r.maMid).length,
      breadth200: sec.filter((r) => r.maSlow != null && r.close > r.maSlow).length, sectors: sec.length,
      cyc_def: cyc != null && def != null ? cyc - def : null,
      xly_xlp: xs.length >= S.maMid * 0.8 ? xs[xs.length - 1] / avg(xs) - 1 : null,
      iwm: rel('IWM'), gld: rel('GLD'), tlt: rel('TLT'), vol: volAt(i),
    };
  };
  const classify = (x) => {
    const up200 = x.ma200 != null && x.close > x.ma200, up50 = x.ma50 != null && x.close > x.ma50;
    const defensive = (x.cyc_def != null && x.cyc_def <= S.defGap) || (x.xly_xlp != null && x.xly_xlp <= S.defGap / 1.5);
    if (up200 && up50 && x.ma50 > x.ma200 && !defensive && x.breadth50 >= S.breadthGood) return ['Risk-on uptrend', 'ok'];
    if (up200 && up50) return defensive || x.breadth50 <= S.breadthWeak ? ['Uptrend, narrowing', 'warn'] : ['Uptrend', 'ok'];
    if (up200) return [defensive ? 'Pullback, defensive rotation' : 'Pullback in an uptrend', 'warn'];
    if (up50) return ['Recovery attempt', 'warn'];
    return [defensive ? 'Downtrend, risk-off' : 'Downtrend', 'bad'];
  };
  const STANCE = {
    'Risk-on uptrend': 'Rotation tends to pay here: hold the leaders, add to sectors turning up, keep exits under the swing lows.',
    Uptrend: 'The trend is intact: follow the rotation signals as they fire.',
    'Uptrend, narrowing': 'Fewer sectors carry the market: tighten exits on the leaders and favour sectors that are still broadening.',
    'Pullback in an uptrend': 'A dip inside a rising market: let entries fire before adding, and don\'t sell leaders on noise.',
    'Pullback, defensive rotation': 'Money is moving into defensive sectors: rotate out of fading cyclicals and let entries fire before buying dips.',
    'Recovery attempt': 'A bounce below the 200-day average: it needs more sectors back above their 50-day average to be trusted.',
    Downtrend: 'Capital first: smaller positions, more cash, new buys only on fired entries.',
    'Downtrend, risk-off': 'Defensives, safe havens and cash lead: protect capital and keep new buys for fired entries.',
  };
  const now = at(n - 1), before = at(n - 6);
  const [label, tone] = classify(now), [labelBefore] = classify(before);
  const vols = [];
  for (let i = Math.max(S.volLen, n - 252); i < n; i++) vols.push(volAt(i));
  const r4 = (x) => (x == null || !isFinite(x) ? null : Math.round(x * 1e4) / 1e4);
  return [{
    asof: now.date, label, tone, stance: STANCE[label], label_before: labelBefore, changed: label !== labelBefore,
    spy_close: now.close, spy_vs_ma200: r4(now.ma200 ? now.close / now.ma200 - 1 : null), spy_vs_ma50: r4(now.ma50 ? now.close / now.ma50 - 1 : null),
    ma50_vs_ma200: r4(now.ma50 && now.ma200 ? now.ma50 / now.ma200 - 1 : null), spy_dd: r4(now.dd),
    breadth50: now.breadth50, breadth50_before: before.breadth50, breadth200: now.breadth200, sectors: now.sectors,
    cyc_def: r4(now.cyc_def), xly_xlp: r4(now.xly_xlp), iwm_vs_spy: r4(now.iwm), gld_vs_spy: r4(now.gld), tlt_vs_spy: r4(now.tlt),
    vol20: r4(now.vol), vol_pct: r4(vols.filter((v) => v <= now.vol).length / vols.length),
  }];
},
});
dash.calc('portfolio', {
  title: "Your holdings",
  description: "Each holding through the fund or stock it follows: its 12-month return against the rule's picks, verdict and euro returns.",
  inputs: ["settings","metrics","rule","holdings","EURUSD","revolut"],
  fn: (settings, metrics, rule, holdings, EURUSD, revolut) => {
  const S = settings[0];
  const t = (d) => Date.parse(d + 'T00:00:00Z'), day = 864e5;
  const fx = (EURUSD || []).filter((r) => r.close > 0);
  const rateOn = (d) => { let v = null; for (const r of fx) { if (r.date <= d) v = r.close; else break; } return v; };
  const back = (d, days) => new Date(t(d) - days * day).toISOString().slice(0, 10);
  const r4 = (x) => (x == null || !isFinite(x) ? null : Math.round(x * 1e4) / 1e4);
  // a dollar return seen from euros: the dollar's move against the euro over the same days is added or removed
  const inEur = (r, days, end) => { const a = rateOn(end), b = rateOn(back(end, days)); return r == null || !a || !b ? null : (1 + r) * (b / a) - 1; };
  const M = new Map(metrics.map((m) => [m.symbol, m])), R = new Map(rule.map((r) => [r.symbol, r]));
  const followed = new Set(holdings.map((h) => h.tracks));
  const top = rule.filter((r) => r.now).sort((a, b) => b.score - a.score);
  const cut = top.length ? top[top.length - 1].score : Infinity; // the weakest of today's top 4
  const into = (top.find((r) => !followed.has(r.symbol)) || {}).symbol || null;
  const intoRev = ((revolut || []).find((r) => r.us === into) || {}).revolut_ticker || null;
  return holdings.map((h) => {
    const m = M.get(h.tracks), r = R.get(h.tracks), lt = !!h.long_term;
    const base = { ticker: h.ticker, name: h.name, tracks: h.tracks, match: h.match || null, long_term: lt, note: h.note || '' };
    if (!m || !r) return { ...base, verdict: 'No data', into: null, into_revolut: null };
    const sc = r.score;
    let verdict;
    if (sc == null) verdict = lt ? 'Long term: hold' : 'Too new to judge';
    else if (lt) verdict = sc >= cut ? 'Long term: a good time to add' : sc < 0 ? 'Long term: hold, don\'t add yet' : 'Long term: hold';
    else verdict = sc >= cut ? 'Hold, strong' : sc < 0 ? 'Reduce' : 'Hold, lagging';
    const move = verdict === 'Reduce' || verdict === 'Hold, lagging';
    const fxEnd = rateOn(m.date), fxStart = rateOn(back(m.date, S.monthDays));
    return {
      ...base, tracks_name: m.name, date: m.date, close: m.close, r1m: m.r1m, r1m_eur: r4(inEur(m.r1m, S.monthDays, m.date)), r3m_eur: r4(inEur(m.r3m, S.quarterDays, m.date)),
      phase: m.phase, phase_w: m.phase_w, score: sc, vol12m: r.vol12m, ma200: r.ma200, vs_ma200: r.vs_ma200, above: r.above,
      verdict, into: move ? into : null, into_revolut: move ? intoRev : null, eurusd_1m: r4(fxEnd && fxStart ? fxEnd / fxStart - 1 : null),
    };
  });
},
});
