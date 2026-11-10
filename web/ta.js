/* global module */
// Chart indicators as code: one set of definitions for the screener in the app and for the test on history (tools/ta/bt.js).
// Every signal on day t uses bars up to t only. A pivot high/low (5 bars each side) is known 5 bars after it formed.
(function (root) {
  'use strict';
  const K = 5, LOOK = 250;
  function prep(b) {
    const n = b.length, c = b.map((x) => x.close), h = b.map((x) => x.high), l = b.map((x) => x.low), o = b.map((x) => x.open);
    const sma = (k) => { const out = new Array(n).fill(null); let s = 0; for (let i = 0; i < n; i++) { s += c[i]; if (i >= k) s -= c[i - k]; if (i >= k - 1) out[i] = s / k; } return out; };
    const rsi = new Array(n).fill(null), atr = new Array(n).fill(null); let up = 0, dn = 0, a = 0;
    for (let i = 1; i < n; i++) {
      const d = c[i] - c[i - 1], u = Math.max(d, 0), w = Math.max(-d, 0), tr = Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1]));
      if (i <= 14) { up += u / 14; dn += w / 14; a += tr / 14; } else { up = (up * 13 + u) / 14; dn = (dn * 13 + w) / 14; a = (a * 13 + tr) / 14; }
      if (i >= 14) { rsi[i] = dn === 0 ? 100 : 100 - 100 / (1 + up / dn); atr[i] = a; }
    }
    const ph = [], pl = [];
    for (let i = K; i < n - K; i++) {
      let isH = true, isL = true;
      for (let j = i - K; j <= i + K; j++) { if (j === i) continue; if (h[j] >= h[i]) isH = false; if (l[j] <= l[i]) isL = false; }
      if (isH) ph.push(i);
      if (isL) pl.push(i);
    }
    return { n, c, h, l, o, s20: sma(20), s50: sma(50), s200: sma(200), rsi, atr, ph, pl };
  }
  // horizontal zones: pivot highs and lows of the last year that sit within 1.5% of each other, at least two of them
  function zonesAt(P, t, hs, ls) {
    const pts = [];
    for (const p of hs) pts.push(P.h[p]);
    for (const p of ls) pts.push(P.l[p]);
    pts.sort((x, y) => x - y);
    const out = []; let g = [];
    const flush = () => { if (g.length >= 2) out.push({ p: g.reduce((s, x) => s + x, 0) / g.length, n: g.length }); g = []; };
    for (const x of pts) { if (g.length && x > g[0] * 1.015) flush(); g.push(x); }
    flush();
    return out;
  }
  const BULL = ['sup', 'ma50_sup', 'ma200_sup', 'fib_sup', 'tl_sup', 'gap_sup', 'rsi30', 'div_bull'];
  const BEAR = ['res', 'ma50_res', 'ma200_res', 'fib_res', 'tl_res', 'gap_res', 'rsi70', 'div_bear'];
  // candle signals (the day's own shape) and what happens right after a breakout
  const CANDLE = { tail_top: [-1, 'Topping tail after a rise'], tail_bot: [1, 'Bottoming tail after a fall'], engulf_bull: [1, 'Bullish engulfing after a fall'], engulf_bear: [-1, 'Bearish engulfing after a rise'],
    rev_up: [1, 'Reversal day up from a 20-day low'], rev_dn: [-1, 'Reversal day down from a 20-day high'], neg_bull: [1, 'Strong down candle negated the next day'], neg_bear: [-1, 'Strong up candle negated the next day'],
    brk_up_conf: [1, 'Breakout confirmed the next day'], brk_up_fail: [-1, 'Breakout failed: back below the level'], brk_dn_conf: [-1, 'Breakdown confirmed the next day'], brk_dn_fail: [1, 'Breakdown failed: back above the level'],
    tl_brk_up_conf: [1, 'Trendline break confirmed the next day'], tl_brk_up_fail: [-1, 'Trendline break failed within 5 days'] };
  const SIDE = { tri_brk_up: 1, wedge_fall_brk: 1, tri_brk_dn: -1, wedge_rise_brk: -1, sup3: 1, sup4: 1, res3: -1, res4: -1, sup: 1, ma50_sup: 1, ma200_sup: 1, fib_sup: 1, tl_sup: 1, gap_sup: 1, rsi30: 1, div_bull: 1, golden: 1, brk_up: 1, tl_brk_up: 1, hi250: 1, ihs: 1, cup: 1, conf2: 1, conf3: 1,
    res: -1, ma50_res: -1, ma200_res: -1, fib_res: -1, tl_res: -1, gap_res: -1, rsi70: -1, div_bear: -1, death: -1, brk_dn: -1, tl_brk_dn: -1, lo250: -1, hs: -1, conf2_res: -1, conf3_res: -1 };
  const NAME = { tri_brk_up: 'Break up out of a triangle', wedge_fall_brk: 'Break up out of a falling wedge', tri_brk_dn: 'Break down out of a triangle', wedge_rise_brk: 'Break down out of a rising wedge', sup3: 'Touch of a support made of 3+ pivots', sup4: 'Touch of a support made of 4+ pivots', res3: 'Touch of a resistance made of 3+ pivots', res4: 'Touch of a resistance made of 4+ pivots', sup: 'Touch of a horizontal support', res: 'Touch of a horizontal resistance', ma50_sup: 'Pullback to the 50-day average in an uptrend', ma50_res: 'Rally to the 50-day average in a downtrend',
    ma200_sup: 'Touch of the 200-day average from above', ma200_res: 'Touch of the 200-day average from below', fib_sup: 'Fibonacci retracement of a rise (38-62%)', fib_res: 'Fibonacci retracement of a fall (38-62%)',
    tl_sup: 'Touch of a rising trendline', tl_res: 'Touch of a falling trendline', tl_brk_up: 'Break above a falling trendline', tl_brk_dn: 'Break below a rising trendline', gap_sup: 'Fill of a gap up', gap_res: 'Fill of a gap down',
    rsi30: 'RSI falls below 30', rsi70: 'RSI rises above 70', div_bull: 'Bullish RSI divergence', div_bear: 'Bearish RSI divergence', golden: 'Golden cross (50 over 200)', death: 'Death cross (50 under 200)',
    brk_up: 'Break above a horizontal resistance', brk_dn: 'Break below a horizontal support', hi250: 'New 1-year high', lo250: 'New 1-year low', ihs: 'Inverse head and shoulders, neckline broken', hs: 'Head and shoulders, neckline broken',
    cup: 'Cup and handle, rim broken', conf2: 'Two buy signals at once', conf3: 'Three or more buy signals at once', conf2_res: 'Two sell signals at once', conf3_res: 'Three or more sell signals at once' };

  for (const [k, v] of Object.entries(CANDLE)) { SIDE[k] = v[0]; NAME[k] = v[1]; }
  // events[t] = list of signal ids that fired at the close of day t
  function scan(bars, opts) {
    const P = prep(bars), { n, c, h, l, s50, s200, rsi } = P, ev = new Array(n);
    const short = !!(opts && opts.short), from = Math.max(short ? 60 : 200, (opts && opts.from) || 0);   // short: an asset with under a year of history
    let ihK = 0, ilK = 0;                         // pivots known so far: ph[0..ihK), pl[0..ilK)
    const ups = [], downs = [];                   // unfilled gaps
    let tlS = null, tlR = null, lastHi = -99, lastLo = -99, fibKey = '', fibHit = {};
    let pUp = null, pDn = null, pTl = null;      // a breakout waiting for its confirmation or its failure
    for (let t = 1; t < n; t++) {
      const e = [];
      while (ihK < P.ph.length && P.ph[ihK] + K <= t) ihK++;
      while (ilK < P.pl.length && P.pl[ilK] + K <= t) ilK++;
      // gaps are tracked from the start so that old ones are known
      for (let i = ups.length - 1; i >= 0; i--) { const g = ups[i]; if (t - g.at > 120) ups.splice(i, 1); else if (l[t] <= g.edge * 1.005) { if (t >= from) e.push('gap_sup'); ups.splice(i, 1); } }
      for (let i = downs.length - 1; i >= 0; i--) { const g = downs[i]; if (t - g.at > 120) downs.splice(i, 1); else if (h[t] >= g.edge * 0.995) { if (t >= from) e.push('gap_res'); downs.splice(i, 1); } }
      if (l[t] > h[t - 1] * 1.01) ups.push({ edge: h[t - 1], at: t });
      if (h[t] < l[t - 1] * 0.99) downs.push({ edge: l[t - 1], at: t });
      if (t < from || (!short && s200[t - 1] == null)) { ev[t] = e.length ? [...new Set(e)] : null; continue; }
      const has200 = s200[t - 1] != null;
      const hs = [], ls = [];
      for (let i = ihK - 1; i >= 0 && P.ph[i] >= t - LOOK; i--) hs.push(P.ph[i]);
      for (let i = ilK - 1; i >= 0 && P.pl[i] >= t - LOOK; i--) ls.push(P.pl[i]);
      // the days after a breakout: confirmed (next day closes higher and stays above the level) or failed (closes back through it within 5 days)
      if (pUp) { if (t - pUp.at > 5) pUp = null; else if (c[t] < pUp.p * 0.99) { e.push('brk_up_fail'); pUp = null; } else if (t === pUp.at + 1 && c[t] > pUp.c && l[t] > pUp.p) e.push('brk_up_conf'); }
      if (pDn) { if (t - pDn.at > 5) pDn = null; else if (c[t] > pDn.p * 1.01) { e.push('brk_dn_fail'); pDn = null; } else if (t === pDn.at + 1 && c[t] < pDn.c && h[t] < pDn.p) e.push('brk_dn_conf'); }
      if (pTl) { if (t - pTl.at > 5) pTl = null; else if (c[t] < pTl.lo) { e.push('tl_brk_up_fail'); pTl = null; } else if (t === pTl.at + 1 && c[t] > pTl.c) e.push('tl_brk_up_conf'); }
      // horizontal support and resistance
      for (const z of zonesAt(P, t, hs, ls)) {
        if (l[t - 1] > z.p * 1.01 && l[t] <= z.p * 1.01 && c[t] >= z.p * 0.98) { e.push('sup'); if (z.n >= 3) e.push('sup3'); if (z.n >= 4) e.push('sup4'); }
        if (h[t - 1] < z.p * 0.99 && h[t] >= z.p * 0.99 && c[t] <= z.p * 1.02) { e.push('res'); if (z.n >= 3) e.push('res3'); if (z.n >= 4) e.push('res4'); }
        if (c[t - 1] <= z.p * 1.01 && c[t] > z.p * 1.01 && c[t - 5] < z.p) { e.push('brk_up'); pUp = { at: t, p: z.p, c: c[t] }; }
        if (c[t - 1] >= z.p * 0.99 && c[t] < z.p * 0.99 && c[t - 5] > z.p) { e.push('brk_dn'); pDn = { at: t, p: z.p, c: c[t] }; }
      }
      // moving averages
      const above = (s, k) => { for (let j = t - k; j < t; j++) if (!(c[j] > s[j])) return false; return true; };
      const below = (s, k) => { for (let j = t - k; j < t; j++) if (!(c[j] < s[j])) return false; return true; };
      if ((!has200 || c[t] > s200[t]) && above(s50, 10) && l[t] <= s50[t] * 1.005 && c[t] >= s50[t] * 0.98) e.push('ma50_sup');
      if ((!has200 || c[t] < s200[t]) && below(s50, 10) && h[t] >= s50[t] * 0.995 && c[t] <= s50[t] * 1.02) e.push('ma50_res');
      if (has200 && above(s200, 20) && l[t] <= s200[t] * 1.005 && c[t] >= s200[t] * 0.98) e.push('ma200_sup');
      if (has200 && below(s200, 20) && h[t] >= s200[t] * 0.995 && c[t] <= s200[t] * 1.02) e.push('ma200_res');
      if (has200 && s50[t] > s200[t] && s50[t - 1] <= s200[t - 1]) e.push('golden');
      if (has200 && s50[t] < s200[t] && s50[t - 1] >= s200[t - 1]) e.push('death');
      // RSI
      if (rsi[t] < 30 && rsi[t - 1] >= 30) e.push('rsi30');
      if (rsi[t] > 70 && rsi[t - 1] <= 70) e.push('rsi70');
      if (ilK >= 2 && P.pl[ilK - 1] + K === t) { const p2 = P.pl[ilK - 1], p1 = P.pl[ilK - 2]; if (p2 - p1 <= 60 && l[p2] < l[p1] && rsi[p1] < 40 && rsi[p2] > rsi[p1] + 2) e.push('div_bull'); }
      if (ihK >= 2 && P.ph[ihK - 1] + K === t) { const p2 = P.ph[ihK - 1], p1 = P.ph[ihK - 2]; if (p2 - p1 <= 60 && h[p2] > h[p1] && rsi[p1] > 60 && rsi[p2] < rsi[p1] - 2) e.push('div_bear'); }
      // Fibonacci: the last big swing between the extreme pivots of the year
      if (hs.length && ls.length) {
        let hi = hs[0], lo = ls[0];
        for (const p of hs) if (h[p] > h[hi]) hi = p;
        for (const p of ls) if (l[p] < l[lo]) lo = p;
        if (hi > lo && h[hi] / l[lo] >= 1.15) {                       // a rise, now retracing
          const key = 'u' + hi + '_' + lo; if (key !== fibKey) { fibKey = key; fibHit = {}; }
          for (const r of [0.382, 0.5, 0.618]) { const f = h[hi] - r * (h[hi] - l[lo]); if (!fibHit[r] && l[t - 1] > f * 1.01 && l[t] <= f * 1.01 && c[t] >= f * 0.98) { e.push('fib_sup'); fibHit[r] = 1; } }
        } else if (lo > hi && h[hi] / l[lo] >= 1.15) {                // a fall, now bouncing
          const key = 'd' + hi + '_' + lo; if (key !== fibKey) { fibKey = key; fibHit = {}; }
          for (const r of [0.382, 0.5, 0.618]) { const f = l[lo] + r * (h[hi] - l[lo]); if (!fibHit[r] && h[t - 1] < f * 0.99 && h[t] >= f * 0.99 && c[t] <= f * 1.02) { e.push('fib_res'); fibHit[r] = 1; } }
        }
      }
      // trendlines through the last two pivots (straight on a log scale)
      const lineAt = (T, x) => T.a * Math.pow(T.b / T.a, (x - T.i) / (T.j - T.i));
      if (ilK >= 2) { const p2 = P.pl[ilK - 1], p1 = P.pl[ilK - 2]; if ((!tlS || tlS.j !== p2) && l[p2] > l[p1] && p2 - p1 >= 10) tlS = { i: p1, j: p2, a: l[p1], b: l[p2], dead: false }; }
      if (ihK >= 2) { const p2 = P.ph[ihK - 1], p1 = P.ph[ihK - 2]; if ((!tlR || tlR.j !== p2) && h[p2] < h[p1] && p2 - p1 >= 10) tlR = { i: p1, j: p2, a: h[p1], b: h[p2], dead: false }; }
      if (tlS && !tlS.dead && t - tlS.j <= 120) {
        const v = lineAt(tlS, t), v1 = lineAt(tlS, t - 1);
        if (c[t] < v * 0.99) { e.push('tl_brk_dn'); tlS.dead = true; } else if (l[t - 1] > v1 * 1.01 && l[t] <= v * 1.01) e.push('tl_sup');
      }
      if (tlR && !tlR.dead && t - tlR.j <= 120) {
        const v = lineAt(tlR, t), v1 = lineAt(tlR, t - 1);
        if (c[t] > v * 1.01) { e.push('tl_brk_up'); tlR.dead = true; pTl = { at: t, c: c[t], lo: l[t] }; } else if (h[t - 1] < v1 * 0.99 && h[t] >= v * 0.99) e.push('tl_res');
      }
      // new 1-year closing highs and lows (first in 20 days)
      let mx = -Infinity, mn = Infinity; for (let j = t - LOOK; j < t; j++) if (j >= 0) { if (c[j] > mx) mx = c[j]; if (c[j] < mn) mn = c[j]; }
      if (c[t] > mx) { if (t - lastHi > 20 && (!short || t >= LOOK)) e.push('hi250'); lastHi = t; }
      if (c[t] < mn) { if (t - lastLo > 20 && (!short || t >= LOOK)) e.push('lo250'); lastLo = t; }
      // head and shoulders (three pivots, the middle one the extreme, shoulders within 6%), on the break of the neckline
      if (ilK >= 3) { const [a, b, d] = [P.pl[ilK - 3], P.pl[ilK - 2], P.pl[ilK - 1]];
        if (d - a >= 20 && d - a <= 150 && t - d <= 40 && l[b] <= 0.96 * Math.min(l[a], l[d]) && Math.abs(l[a] / l[d] - 1) <= 0.06) { let N = -Infinity; for (let j = a; j <= d; j++) if (h[j] > N) N = h[j]; if (c[t] > N && c[t - 1] <= N) e.push('ihs'); } }
      if (ihK >= 3) { const [a, b, d] = [P.ph[ihK - 3], P.ph[ihK - 2], P.ph[ihK - 1]];
        if (d - a >= 20 && d - a <= 150 && t - d <= 40 && h[b] >= 1.04 * Math.max(h[a], h[d]) && Math.abs(h[a] / h[d] - 1) <= 0.06) { let N = Infinity; for (let j = a; j <= d; j++) if (l[j] < N) N = l[j]; if (c[t] < N && c[t - 1] >= N) e.push('hs'); } }
      // cup and handle: a 12-35% rounded dip below an old high, a recovery to it, a shallow pullback, then a close above the rim
      if (t >= 210) {
        let iA = t - 200; for (let j = t - 200; j <= t - 30; j++) if (h[j] > h[iA]) iA = j;
        const A = h[iA];
        if (c[t] > A && c[t - 1] <= A) {
          let iB = iA + 1; for (let j = iA + 1; j <= t - 8; j++) if (l[j] < l[iB]) iB = j;
          const B = l[iB], depth = 1 - B / A;
          if (depth >= 0.12 && depth <= 0.35 && iB - iA >= 10) {
            let iC = -1; for (let j = iB + 10; j <= t - 5; j++) if (h[j] >= 0.95 * A) { iC = j; break; }
            if (iC > 0) { let lowH = Infinity, hiH = -Infinity; for (let j = iC; j < t; j++) { if (l[j] < lowH) lowH = l[j]; if (h[j] > hiH) hiH = h[j]; }
              if (lowH >= B + 0.5 * (A - B) && lowH <= 0.97 * hiH) e.push('cup'); }
          }
        }
      }
      { // candles: the shape of the day, read at its close
        const A = P.atr[t], o = P.o, rng = h[t] - l[t], body = Math.abs(c[t] - o[t]), upW = h[t] - Math.max(o[t], c[t]), loW = Math.min(o[t], c[t]) - l[t];
        if (A > 0 && rng > 0) {
          const pos = (c[t] - l[t]) / rng, ch5 = c[t - 1] - c[t - 6], pb = Math.abs(c[t - 1] - o[t - 1]), A1 = P.atr[t - 1] || A;
          let hi20 = -Infinity, lo20 = Infinity; for (let j = t - 20; j < t; j++) { if (h[j] > hi20) hi20 = h[j]; if (l[j] < lo20) lo20 = l[j]; }
          if (rng >= 0.8 * A && upW >= 0.6 * rng && pos <= 0.4 && (h[t] >= hi20 || ch5 >= A)) e.push('tail_top');
          if (rng >= 0.8 * A && loW >= 0.6 * rng && pos >= 0.6 && (l[t] <= lo20 || ch5 <= -A)) e.push('tail_bot');
          if (c[t] > o[t] && c[t - 1] < o[t - 1] && c[t] >= o[t - 1] && o[t] <= c[t - 1] && body >= 0.6 * A && ch5 <= -A) e.push('engulf_bull');
          if (c[t] < o[t] && c[t - 1] > o[t - 1] && c[t] <= o[t - 1] && o[t] >= c[t - 1] && body >= 0.6 * A && ch5 >= A) e.push('engulf_bear');
          if (l[t] < lo20 && c[t] > c[t - 1] && c[t] > o[t] && pos >= 0.65) e.push('rev_up');
          if (h[t] > hi20 && c[t] < c[t - 1] && c[t] < o[t] && pos <= 0.35) e.push('rev_dn');
          if (c[t - 1] < o[t - 1] && pb >= 0.7 * A1 && c[t] > h[t - 1]) e.push('neg_bull');
          if (c[t - 1] > o[t - 1] && pb >= 0.7 * A1 && c[t] < l[t - 1]) e.push('neg_bear');
        }
      }
      const u = [...new Set(e)], nb = u.filter((x) => BULL.includes(x)).length, ns = u.filter((x) => BEAR.includes(x)).length;
      if (nb >= 3) u.push('conf3'); else if (nb === 2) u.push('conf2');
      if (ns >= 3) u.push('conf3_res'); else if (ns === 2) u.push('conf2_res');
      ev[t] = u.length ? u : null;
    }
    return { P, events: ev };
  }
  // The picture today for one asset: every level, merged into zones where several fall within 1.5% of each other,
  // the nearest support and resistance, and the signals of the last 5 bars. `live` is the live price, if any.
  function analyze(bars, live) {
    const n = bars.length; if (n < 80) return null;
    const young = n < 260, R = scan(bars, { from: Math.max(young ? 60 : 0, n - 130), short: young }), P = R.P, t = n - 1, { c, h, l } = P, px = live > 0 ? live : c[t], raw = [];
    const add = (p, k) => { if (p > 0 && isFinite(p)) raw.push({ p, k }); };
    add(P.s20[t], '20-day average'); add(P.s50[t], '50-day average'); add(P.s200[t], '200-day average');
    const hs = P.ph.filter((p) => p + K <= t && p >= t - LOOK), ls = P.pl.filter((p) => p + K <= t && p >= t - LOOK);
    for (const z of zonesAt(P, t, hs, ls)) add(z.p, 'pivots ×' + z.n);
    if (hs.length && ls.length) {
      let hi = hs[0], lo = ls[0];
      for (const p of hs) if (h[p] > h[hi]) hi = p;
      for (const p of ls) if (l[p] < l[lo]) lo = p;
      if (h[hi] / l[lo] >= 1.15) for (const r of [0.382, 0.5, 0.618]) add(hi > lo ? h[hi] - r * (h[hi] - l[lo]) : l[lo] + r * (h[hi] - l[lo]), 'Fibonacci ' + (r * 100).toFixed(1) + '%');
    }
    const line = (i, j, a, b2, x) => a * Math.pow(b2 / a, (x - i) / (j - i));
    if (ls.length >= 2) { const p2 = ls[ls.length - 1], p1 = ls[ls.length - 2]; if (l[p2] > l[p1] && p2 - p1 >= 10 && t - p2 <= 120) { let ok = true; for (let j = p2 + 1; j <= t; j++) if (c[j] < line(p1, p2, l[p1], l[p2], j) * 0.99) ok = false; if (ok) add(line(p1, p2, l[p1], l[p2], t), 'rising trendline'); } }
    if (hs.length >= 2) { const p2 = hs[hs.length - 1], p1 = hs[hs.length - 2]; if (h[p2] < h[p1] && p2 - p1 >= 10 && t - p2 <= 120) { let ok = true; for (let j = p2 + 1; j <= t; j++) if (c[j] > line(p1, p2, h[p1], h[p2], j) * 1.01) ok = false; if (ok) add(line(p1, p2, h[p1], h[p2], t), 'falling trendline'); } }
    for (let g = Math.max(1, t - 120); g <= t; g++) {
      if (l[g] > h[g - 1] * 1.01) { let m = Infinity; for (let j = g; j <= t; j++) if (l[j] < m) m = l[j]; if (m > h[g - 1] * 1.005) add(h[g - 1], 'gap to fill'); }
      if (h[g] < l[g - 1] * 0.99) { let m = -Infinity; for (let j = g; j <= t; j++) if (h[j] > m) m = h[j]; if (m < l[g - 1] * 0.995) add(l[g - 1], 'gap to fill'); }
    }
    let mx = -Infinity, mn = Infinity; for (let j = Math.max(0, t - LOOK + 1); j <= t; j++) { if (h[j] > mx) mx = h[j]; if (l[j] < mn) mn = l[j]; }
    add(mx, young ? 'high since listing' : '1-year high'); add(mn, young ? 'low since listing' : '1-year low');
    raw.sort((x, y) => x.p - y.p);
    const levels = []; let g = [];
    const flush = () => { if (g.length) { const kinds = [...new Set(g.map((x) => x.k))], p = g.reduce((s2, x) => s2 + x.p, 0) / g.length; levels.push({ p, kinds, n: kinds.length, side: p >= px ? 'res' : 'sup', dist: p / px - 1 }); } g = []; };
    for (const x of raw) { if (g.length && x.p > g[0].p * 1.015) flush(); g.push(x); }
    flush();
    const below = levels.filter((z) => z.dist < -0.003).sort((x, y) => y.p - x.p), above = levels.filter((z) => z.dist > 0.003).sort((x, y) => x.p - y.p);
    const signals = [];
    for (let d = 0; d <= 5; d++) for (const id of R.events[t - d] || []) if (!signals.some((x) => x.id === id)) signals.push({ id, name: NAME[id], side: SIDE[id], ago: d, date: bars[t - d].date });
    // breaks out of a triangle or a wedge (the drawn lines, as known the day before), last 5 bars
    for (let d = 0; d <= 5 && t - d - 261 >= 0; d++) {
      const G0 = geometry(bars.slice(t - d - 261, t - d)), cc = c[t - d], c1 = c[t - d - 1], tol = 0.6 * P.atr[t - d];
      const Rr = G0.lines.find((x) => x.kind === 'res'), Ss = G0.lines.find((x) => x.kind === 'sup');
      const up = Rr && cc > Rr.now + Rr.m + tol && c1 <= Rr.now + tol, dn = Ss && cc < Ss.now + Ss.m - tol && c1 >= Ss.now - tol;
      const add2 = (id) => { if (!signals.some((x) => x.id === id)) signals.push({ id, name: NAME[id], side: SIDE[id], ago: d, date: bars[t - d].date }); };
      if (up && G0.pattern === 'Triangle') add2('tri_brk_up');
      if (up && G0.pattern === 'Falling wedge') add2('wedge_fall_brk');
      if (dn && G0.pattern === 'Triangle') add2('tri_brk_dn');
      if (dn && G0.pattern === 'Rising wedge') add2('wedge_rise_brk');
    }
    return { price: px, date: bars[t].date, rsi: P.rsi[t], atr: P.atr[t], above50: px > P.s50[t], above200: P.s200[t] == null ? null : px > P.s200[t], young, days: n, s50: P.s50[t], s200: P.s200[t], levels, below, above,
      sup: below[0] || null, res: above[0] || null, rr: below[0] && above[0] ? above[0].dist / -below[0].dist : null, signals, chg5: c[t] / c[t - 5] - 1, chg20: c[t] / c[t - 20] - 1 };
  }
  // The history test for ONE asset on its own candles (same rule as the big test: next open, +2 ATR before -2 ATR within 20 days),
  // with its first half against its second half as a walk-forward check.
  function backtest(bars) {
    const { P, events } = scan(bars), n = P.n, end = n - 21; if (end - 200 < 120) return null;
    const half = Math.floor((200 + end) / 2), any = [{ n: 0, b: 0, s: 0 }, { n: 0, b: 0, s: 0 }], by = {};
    for (let t = 200; t < end; t++) {
      const en = P.o[t + 1], A = P.atr[t]; let res = 0;
      for (let j = t + 1; j <= t + 20; j++) { const hu = P.h[j] >= en + 2 * A, hd = P.l[j] <= en - 2 * A; if (hu && hd) { res = 3; break; } if (hu) { res = 1; break; } if (hd) { res = 2; break; } }
      const bw = res === 1 || (res === 0 && P.c[t + 20] > en) ? 1 : 0, sw = res === 2 || (res === 0 && P.c[t + 20] < en) ? 1 : 0, k = t < half ? 0 : 1;
      any[k].n++; any[k].b += bw; any[k].s += sw;
      for (const id of events[t] || []) { const x = (by[id] = by[id] || { n: 0, w: 0, h: [{ n: 0, w: 0 }, { n: 0, w: 0 }] }), w = SIDE[id] > 0 ? bw : sw; x.n++; x.w += w; x.h[k].n++; x.h[k].w += w; }
    }
    const rate = (k, side) => (side > 0 ? any[k].b : any[k].s) / Math.max(1, any[k].n), N = any[0].n + any[1].n;
    for (const [id, x] of Object.entries(by)) {
      const side = SIDE[id]; x.win = x.w / x.n; x.base = ((side > 0 ? any[0].b + any[1].b : any[0].s + any[1].s)) / N; x.edge = x.win - x.base;
      x.e1 = x.h[0].n >= 3 ? x.h[0].w / x.h[0].n - rate(0, side) : null; x.e2 = x.h[1].n >= 3 ? x.h[1].w / x.h[1].n - rate(1, side) : null;
    }
    return { days: N, from: bars[200].date, to: bars[end - 1].date, anyBuy: (any[0].b + any[1].b) / N, anySell: (any[0].s + any[1].s) / N, by };
  }
  // What to DRAW on the candles of any timeframe: the best support and resistance trendlines (a line counts when at least two
  // pivots sit on it within a tolerance of 0.6 ATR and no close has gone through it), unfilled gaps, and a wedge or triangle
  // when the two lines converge. For display: the tested signals above keep their own, stricter definitions.
  function geometry(b) {
    const n = b.length; if (n < 60) return { lines: [], gaps: [], pattern: null };
    const P = prep(b), t = n - 1, { c, h, l } = P, tol = 0.6 * (P.atr[t] || h[t] - l[t]), from = Math.max(0, t - 160);
    const best = (piv, val, side) => {
      const ps = piv.filter((p) => p >= from); let out = null;
      for (let a = 0; a < ps.length; a++) for (let d = a + 1; d < ps.length; d++) {
        const i = ps[a], j = ps[d]; if (j - i < 10) continue;
        const m = (val[j] - val[i]) / (j - i), at = (x) => val[i] + m * (x - i);
        let ok = true; for (let x = i; x <= t; x++) if (side > 0 ? c[x] < at(x) - tol : c[x] > at(x) + tol) { ok = false; break; }
        if (!ok) continue;
        const touch = ps.filter((q) => q >= i && Math.abs(val[q] - at(q)) <= tol), score = touch.length * 10 + (j - i) / 10 + (t - j < 60 ? 5 : 0);
        if (touch.length >= 2 && (!out || score > out.score)) out = { kind: side > 0 ? 'sup' : 'res', i, j, p1: val[i], p2: val[j], m, now: at(t), at0: at, touches: touch.length, pts: touch.map((q) => [q, val[q]]), score };
      }
      return out;
    };
    const S = best(P.pl, l, 1), R = best(P.ph, h, -1), lines = [S, R].filter(Boolean), gaps = [];
    for (let g = Math.max(1, t - 120); g <= t; g++) {
      if (l[g] > h[g - 1] * 1.005) { let m = Infinity; for (let j = g; j <= t; j++) if (l[j] < m) m = l[j]; if (m > h[g - 1]) gaps.push({ i: g, top: m, bottom: h[g - 1], dir: 'up' }); }
      if (h[g] < l[g - 1] * 0.995) { let m = -Infinity; for (let j = g; j <= t; j++) if (h[j] > m) m = h[j]; if (m < l[g - 1]) gaps.push({ i: g, top: l[g - 1], bottom: m, dir: 'down' }); }
    }
    let pattern = null;
    if (S && R) {
      const x0 = Math.max(S.i, R.i), g0 = R.at0(x0) - S.at0(x0), g1 = R.now - S.now, sS = S.m / c[t], sR = R.m / c[t];
      if (g1 > 0 && g0 > 0 && g1 < 0.75 * g0) pattern = sS > 0.0003 && sR > 0.0003 ? 'Rising wedge' : sS < -0.0003 && sR < -0.0003 ? 'Falling wedge' : 'Triangle';
    }
    return { lines: lines.map(({ at0, score, ...x }) => x), gaps: gaps.slice(-4), pattern };
  }
  // Elastic trendlines, for display. A line runs through two major pivots and is kept when other points respect it within a
  // tolerance: major and internal pivots, highs and lows alike (a line can turn from resistance into support), and gap edges.
  // It may be crossed: a breakout and the retest that follows count as touches; crossings only lower its score. Flat lines
  // are left to the horizontal levels. Two scales on a long chart: the whole history given, and the last 260 bars.
  function tlScale(b, tag, near) {
    const n = b.length; if (n < 80) return [];
    const P = prep(b), t = n - 1, { c, h, l } = P, px = c[t], atr = P.atr[t] || 0, tolP = Math.max(0.008, 0.6 * atr / px), cap = near ? Math.max(0.12, 4 * atr / px) : Math.max(0.25, 6 * atr / px);
    const KM = Math.max(8, Math.round(n / 40)), sep = Math.max(5, Math.round(n / 80)), maj = [];
    for (let i = KM; i < n - 3; i++) {
      let H = true, L = true;
      for (let j = i - KM; j <= Math.min(n - 1, i + KM); j++) { if (j === i) continue; if (h[j] > h[i]) H = false; if (l[j] < l[i]) L = false; }
      if (H) maj.push({ i, p: h[i] });
      if (L) maj.push({ i, p: l[i] });
    }
    const anc = maj.map((x) => ({ i: x.i, p: x.p, w: 3 }));
    for (const q of P.ph) anc.push({ i: q, p: h[q], w: 1 });
    for (const q of P.pl) anc.push({ i: q, p: l[q], w: 1 });
    for (let g = 1; g < n; g++) {
      if (l[g] > h[g - 1] * 1.01) anc.push({ i: g, p: h[g - 1], w: 1 }, { i: g, p: l[g], w: 1 });
      if (h[g] < l[g - 1] * 0.99) anc.push({ i: g, p: l[g - 1], w: 1 }, { i: g, p: h[g], w: 1 });
    }
    anc.sort((x, y) => x.i - y.i || y.w - x.w);
    const minSpan = Math.max(15, Math.round(n / 30)), flat = Math.max(0.04 * px, 2 * atr), out = [];
    for (let a = 0; a < maj.length; a++) for (let d = a + 1; d < maj.length; d++) {
      const A = maj[a], B = maj[d]; if (B.i - A.i < minSpan) continue;
      const m = (B.p - A.p) / (B.i - A.i), at = (x) => A.p + m * (x - A.i), now = at(t), dist = Math.abs(now / px - 1);
      if (!(now > 0) || dist > cap || Math.abs(m) * n < flat) continue;
      let w = 0, last = -99; const pts = [];
      for (const q of anc) { if (q.i < A.i) continue; const v = at(q.i); if (v > 0 && Math.abs(q.p / v - 1) <= tolP) { if (q.i - last >= sep) { pts.push([q.i, q.p]); w += q.w; last = q.i; } else if (q.w > 1) w += 1; } }
      if (pts.length < 3) continue;
      let cross = 0, side = 0;
      for (let x = A.i; x <= t && cross <= 3; x++) { const v = at(x), sd = c[x] > v * (1 + tolP) ? 1 : c[x] < v * (1 - tolP) ? -1 : 0; if (sd && side && sd !== side) cross++; if (sd) side = sd; }
      if (cross > 3) continue;
      const score = w - 2 * cross + Math.min(3, (t - A.i) / (n / 8)) + (t - last < n / 5 ? 2 : 0) + 4 * (1 - dist / cap);
      out.push({ i: A.i, j: B.i, p1: A.p, p2: B.p, m, now, touches: pts.length, cross, pts, score, scale: tag, kind: now >= px ? 'res' : 'sup' });
    }
    return out.sort((x, y) => y.score - x.score);
  }
  // levels: optional [{ p, label }] (averages, pivot zones, Fibonacci, gaps). A line whose value today sits on one of them, or
  // on another line, scores higher and carries `agree` (what it agrees with). Display only: on history, a line touch that
  // coincided with a level did no better than a line touch alone (research/ta/bt_conf.js).
  function trendlines(b, max, levels) {
    const n = b.length, M = max || 4; if (n < 80) return [];
    const sets = [tlScale(b, n > 420 ? 'long-term' : '', false)];
    if (n > 420) { const off = n - 260; sets.push(tlScale(b.slice(off), 'recent', true).map((L) => ({ ...L, i: L.i + off, j: L.j + off, pts: L.pts.map(([x, q]) => [x + off, q]) }))); }
    const P = prep(b.slice(-60)), px = b[n - 1].close, tolA = Math.max(0.008, 0.3 * (P.atr[P.n - 1] || 0) / px), LV = (levels || []).filter((z) => z && z.p > 0);
    for (const S of sets) { for (const L of S.slice(0, 40)) { L.agree = LV.filter((z) => Math.abs(z.p / L.now - 1) <= tolA).map((z) => z.label).slice(0, 3); L.score += 2 * Math.min(2, L.agree.length); } for (const L of S.slice(40)) L.agree = []; S.sort((x, y) => y.score - x.score); }
    // two lines are the same when they sit at about the same price today with about the same slope, or fan out from one pivot
    const pick = [], same = (q, L) => { const dn = Math.abs(q.now / L.now - 1), dm = Math.abs(q.m - L.m) / px; return (dn < 0.03 && dm < 0.0005) || (dn < 0.02 && q.m * L.m > 0 && dm < 0.0015) || (Math.abs(q.i - L.i) <= 3 && dn < 0.12); };
    const take = (L) => { if (L && pick.length < M && !pick.some((q) => same(q, L))) pick.push(L); };
    const all = sets.flat().sort((x, y) => y.score - x.score);
    take(all.find((x) => x.kind === 'res')); take(all.find((x) => x.kind === 'sup'));   // the best resistance and the best support,
    for (const S of sets) if (S.length && !pick.some((q) => q.scale === S[0].scale)) take(S.find((x) => !pick.some((q) => same(q, x))));   // one of each scale,
    for (const L of all) take(L);   // then the best of the rest
    for (const L of pick) if (pick.some((q) => q !== L && Math.abs(q.now / L.now - 1) <= tolA)) L.agree = L.agree.concat('another trendline');
    return pick.sort((x, y) => Math.abs(x.now - px) - Math.abs(y.now - px));   // nearest to the price first
  }
  // Daily candles grouped into weeks (Monday to Friday): the long-term chart and its signals, with no extra request.
  function weekly(bars) {
    const out = [];
    for (const r of bars) {
      const d = new Date(r.date + 'T00:00:00Z'), k = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 864e5).toISOString().slice(0, 10), w = out[out.length - 1];
      if (w && w.week === k) { if (r.high > w.high) w.high = r.high; if (r.low < w.low) w.low = r.low; w.close = r.close; w.last = r.date; } else out.push({ week: k, date: k, last: r.date, open: r.open, high: r.high, low: r.low, close: r.close });
    }
    return out;
  }
  // Every entry the given signals produced on these candles, with its exit, by the rule of the history test: in at the next
  // open, out at +2 ATR (target) or -2 ATR (stop), or after 20 candles. One trade per side at a time. `ids` = the signals to mark.
  function trades(bars, ids) {
    const n = bars.length; if (n < 80) return [];
    const short = n < 260, { P, events } = scan(bars, { short }), out = [], busy = { 1: -1, [-1]: -1 }, want = new Set(ids || []);
    for (let t = short ? 60 : 200; t < n; t++) {
      const e = (events[t] || []).filter((id) => want.has(id)); if (!e.length) continue;
      for (const side of [1, -1]) {
        const mine = e.filter((id) => SIDE[id] === side); if (!mine.length || t <= busy[side]) continue;
        const A = P.atr[t], tr = { side, ids: mine, name: NAME[mine[0]], t, date: bars[t].date, res: 'open', i: null, j: null, en: null, ex: null, pct: null };
        if (t + 1 < n && A > 0) {
          const en = P.o[t + 1], up = en + 2 * A, dn = en - 2 * A; tr.i = t + 1; tr.en = en; tr.stop = side > 0 ? dn : up; tr.target = side > 0 ? up : dn;
          for (let j = t + 1; j <= Math.min(n - 1, t + 20); j++) {
            const hu = P.h[j] >= up, hd = P.l[j] <= dn;
            if (hu || hd) { const good = side > 0 ? hu && !hd : hd && !hu; tr.j = j; tr.ex = good ? tr.target : tr.stop; tr.res = good ? 'win' : 'loss'; tr.how = good ? 'target' : 'stop'; break; }
          }
          if (tr.j == null && t + 20 <= n - 1) { tr.j = t + 20; tr.ex = P.c[t + 20]; tr.res = side * (tr.ex - en) > 0 ? 'win' : 'loss'; tr.how = '20 candles'; }
          if (tr.ex != null) tr.pct = side * (tr.ex / en - 1);
          busy[side] = tr.j == null ? n : tr.j;
        } else busy[side] = n;
        out.push(tr);
      }
    }
    return out;
  }
  // Gaps not filled yet, anywhere in the bars given, nearest to the price first.
  function openGaps(b, max) {
    const n = b.length, t = n - 1; if (n < 30) return [];
    const P = prep(b), { h, l } = P, px = P.c[t], min = Math.max(0.003 * px, 0.15 * (P.atr[t] || 0)), mn = new Array(n), mx = new Array(n), out = [];
    for (let i = t, a = Infinity, z = -Infinity; i >= 0; i--) { a = Math.min(a, l[i]); z = Math.max(z, h[i]); mn[i] = a; mx[i] = z; }
    for (let g = 1; g <= t; g++) {
      if (l[g] > h[g - 1] * 1.005 && mn[g] - h[g - 1] >= min) out.push({ i: g, top: mn[g], bottom: h[g - 1], dir: 'up' });
      if (h[g] < l[g - 1] * 0.995 && l[g - 1] - mx[g] >= min) out.push({ i: g, top: l[g - 1], bottom: mx[g], dir: 'down' });
    }
    const mid = (g) => (g.top + g.bottom) / 2;
    return out.filter((g) => Math.abs(mid(g) / px - 1) < 0.3).sort((x, y) => Math.abs(mid(x) - px) - Math.abs(mid(y) - px)).slice(0, max || 5);
  }
  const API = { prep, scan, analyze, backtest, geometry, trendlines, openGaps, weekly, trades, zonesAt, SIDE, NAME, BULL, BEAR, K, LOOK };
  root.SRTA = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
