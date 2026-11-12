// SRChart: an eToro/TradingView-style chart on TradingView Lightweight Charts, fed by the app's live eToro prices.
// Candles and volume; drag to move, pinch or scroll to zoom; drawing tools (measure, Fibonacci retracement,
// trend line, horizontal line) saved per asset; indicators (moving averages, Bollinger bands, RSI, MACD);
// zone bands and a fundamental fair value band; fullscreen.
(function () {
  'use strict';
  const LW = () => window.LightweightCharts;
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* not kept */ } };
  const dark = () => window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const css = (n, fb) => (getComputedStyle(document.documentElement).getPropertyValue(n) || '').trim() || fb;
  const FIB = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
  const FIB_COLORS = ['#787b86', '#f23645', '#ff9800', '#4caf50', '#089981', '#00bcd4', '#787b86'];
  const IND_DEFAULT = { ma20: false, ma50: true, ma200: true, bb: false, rsi: true, macd: false, vol: true, zones: false, fair: false, sr: true, tl: true, sig: true }; // a clean chart: two averages, RSI, the nearest levels
  const ICON = {
    cursor: '<path d="M5 3l14 8-6 1.5L10 19z"/>',
    measure: '<path d="M3 17L17 3l4 4L7 21z"/><path d="M7 13l2 2M10 10l2 2M13 7l2 2"/>',
    fib: '<path d="M3 5h18M3 10h18M3 14h18M3 19h18"/><path d="M5 19L19 5" stroke-dasharray="2 2"/>',
    trend: '<path d="M4 18L20 6"/><circle cx="4" cy="18" r="2"/><circle cx="20" cy="6" r="2"/>',
    hline: '<path d="M3 12h18"/><circle cx="12" cy="12" r="2"/>',
    ind: '<path d="M3 17l5-6 4 3 4-7 5 5"/>',
    undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
    clear: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    full: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  };
  const svg = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;

  // ---- indicator maths ----
  function sma(v, n) { const o = []; let s = 0; for (let i = 0; i < v.length; i++) { s += v[i]; if (i >= n) s -= v[i - n]; o.push(i >= n - 1 ? s / n : null); } return o; }
  function ema(v, n) { const o = [], k = 2 / (n + 1); let e = null; for (let i = 0; i < v.length; i++) { e = e == null ? v[i] : v[i] * k + e * (1 - k); o.push(i >= n - 1 ? e : null); } return o; }
  function stdev(v, n) { const o = []; for (let i = 0; i < v.length; i++) { if (i < n - 1) { o.push(null); continue; } let m = 0; for (let j = i - n + 1; j <= i; j++) m += v[j]; m /= n; let s = 0; for (let j = i - n + 1; j <= i; j++) s += (v[j] - m) ** 2; o.push(Math.sqrt(s / n)); } return o; }
  function rsi(v, n) { const o = [null]; let g = 0, l = 0; for (let i = 1; i < v.length; i++) { const d = v[i] - v[i - 1], up = Math.max(d, 0), dn = Math.max(-d, 0); if (i <= n) { g += up / n; l += dn / n; o.push(i === n ? 100 - 100 / (1 + g / (l || 1e-12)) : null); } else { g = (g * (n - 1) + up) / n; l = (l * (n - 1) + dn) / n; o.push(100 - 100 / (1 + g / (l || 1e-12))); } } return o; }

  function create(container, opts) {
    opts = opts || {};
    const fmtP = opts.priceFormat || ((x) => String(x));
    const key = 'sr.draw.' + (opts.id || 'x');
    let autos = [], marks = [];
    let drawings = lsGet(key, []), tool = 'cursor', draft = null, measure = null, bars = [], frame = { sec: 86400, show: 160 };
    let ind = Object.assign({}, IND_DEFAULT, lsGet('sr.ind3', {})), zones = null, fair = null, levels = [], dead = false;

    const root = container.appendChild(el('div', 'ch'));
    const slot = root.appendChild(el('div', 'ch-slot'));   // name, price and timeframes, shown in full view
    const tools = root.appendChild(el('div', 'ch-tools'));
    const btn = (k, title) => { const b = tools.appendChild(el('button', 'ch-btn')); b.type = 'button'; b.title = title; b.setAttribute('aria-label', title); b.innerHTML = svg(ICON[k]); b.dataset.k = k; return b; };
    const bCursor = btn('cursor', 'Move and zoom'), bMeasure = btn('measure', 'Measure'), bFib = btn('fib', 'Fibonacci retracement'), bTrend = btn('trend', 'Trend line'), bH = btn('hline', 'Horizontal line');
    tools.appendChild(el('span', 'ch-sep'));
    const bInd = btn('ind', 'Indicators'), bUndo = btn('undo', 'Undo last drawing'), bClear = btn('clear', 'Clear drawings'), bFull = btn('full', 'Fullscreen');
    const bClose = el('button', 'ch-close'); bClose.append(el('span', '', '✕'), el('span', 'ch-close-w', ' Close')); bClose.type = 'button'; bClose.setAttribute('aria-label', 'Close the full view'); tools.insertBefore(bClose, tools.firstChild);   // the way back from the full view, always first in the bar
    const hint = root.appendChild(el('div', 'ch-hint', ''));
    const noteEl = root.appendChild(el('div', 'ch-note'));   // in full view: what the tapped line or level is
    const main = root.appendChild(el('div', 'ch-main'));
    const legend = main.appendChild(el('div', 'ch-legend', ''));
    const overlay = main.appendChild(el('div', 'ch-overlay'));
    const menu = root.appendChild(el('div', 'ch-menu')); menu.hidden = true;
    const IND_LABEL = { ma20: 'MA 20', ma50: 'MA 50', ma200: 'MA 200', bb: 'Bollinger (20, 2)', rsi: 'RSI (14)', macd: 'MACD (12, 26, 9)', vol: 'Volume', zones: '2-year range bands', fair: 'Fundamental fair value', sr: 'Support, resistance and action levels', tl: 'Trendlines, wedges and gaps', sig: 'Buy and sell entries with their outcome' };
    for (const k of Object.keys(IND_LABEL)) {
      const lab = menu.appendChild(el('label', 'ch-opt')); const c = lab.appendChild(el('input')); c.type = 'checkbox'; c.checked = !!ind[k];
      lab.appendChild(document.createTextNode(' ' + IND_LABEL[k]));
      c.addEventListener('change', () => { ind[k] = c.checked; lsSet('sr.ind3', ind); applyIndicators(); });
    }

    const up = css('--av-up', '#089981'), down = css('--av-down', '#f23645');
    const chart = LW().createChart(main, {
      autoSize: true,
      layout: { background: { type: 'solid', color: 'transparent' }, textColor: dark() ? '#a0a6b0' : '#5f6672', fontSize: 11, attributionLogo: true, panes: { separatorColor: dark() ? '#2a2e39' : '#e0e3eb' } },
      grid: { vertLines: { color: dark() ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }, horzLines: { color: dark() ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' } },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.08, bottom: 0.2 } },
      timeScale: { borderVisible: false, rightOffset: 6, timeVisible: true, secondsVisible: false },
      crosshair: { mode: LW().CrosshairMode.Normal },
      localization: { priceFormatter: fmtP, timeFormatter: (t) => new Date(t * 1000).toLocaleString([], frame.sec >= 86400 ? { day: 'numeric', month: 'short', year: 'numeric' } : { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) },
    });
    const candles = chart.addSeries(LW().CandlestickSeries, { upColor: up, downColor: down, borderVisible: false, wickUpColor: up, wickDownColor: down });
    const vol = chart.addSeries(LW().HistogramSeries, { priceScaleId: 'vol', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false });
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 }, visible: false });
    // the dates after the last candle, as on TradingView: empty time slots on a series of their own (no value, nothing drawn)
    const ghost = chart.addSeries(LW().LineSeries, { priceScaleId: 'ghost', lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false, visible: true });
    chart.priceScale('ghost').applyOptions({ visible: false });
    let future = [];
    function makeFuture() {
      future = []; const n = bars.length; if (!n) { ghost.setData([]); return; }
      const sec = frame.sec, last = bars[n - 1].time, wkend = bars.slice(-80).some((b) => { const d = new Date(b.time * 1000).getUTCDay(); return d === 0 || d === 6; });
      const N = sec >= 604800 ? 104 : sec >= 86400 ? 260 : 400; let t = last;
      while (future.length < N) { t += sec; if (!wkend && sec < 604800) { const d = new Date(t * 1000).getUTCDay(); if (d === 6) { t += (sec >= 86400 ? 2 : 2 * 86400 / sec) * sec - sec; continue; } if (d === 0) { t += (sec >= 86400 ? 1 : 86400 / sec) * sec - sec; continue; } } future.push(t); }
      ghost.setData(future.map((time) => ({ time })));
    }
    const line = (color, w, pane) => chart.addSeries(LW().LineSeries, { color, lineWidth: w || 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }, pane || 0);
    const S = {}; // indicator series

    // ---- time <-> logical index (works across timeframes and beyond the last bar) ----
    function timeToLogical(t) {
      const n = bars.length; if (!n) return 0;
      if (t <= bars[0].time) return (t - bars[0].time) / frame.sec;
      if (t >= bars[n - 1].time) { if (!future.length || t > future[future.length - 1]) return n - 1 + future.length + (t - (future.length ? future[future.length - 1] : bars[n - 1].time)) / frame.sec;
        let lo = -1, hi = future.length - 1; const at = (i) => (i < 0 ? bars[n - 1].time : future[i]); while (hi - lo > 1) { const m = (lo + hi) >> 1; if (at(m) <= t) lo = m; else hi = m; }
        return n + lo + (t - at(lo)) / ((at(hi) - at(lo)) || 1); }
      let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (bars[m].time <= t) lo = m; else hi = m; }
      return lo + (t - bars[lo].time) / ((bars[hi].time - bars[lo].time) || 1);
    }
    function logicalToTime(l) {
      const n = bars.length; if (!n) return 0;
      if (l <= 0) return bars[0].time + l * frame.sec;
      if (l >= n - 1) { const k = l - (n - 1), i = Math.floor(k), at = (j) => (j <= 0 ? bars[n - 1].time : j <= future.length ? future[j - 1] : future[future.length - 1] + (j - future.length) * frame.sec); return at(i) + (k - i) * (at(i + 1) - at(i)); }
      const i = Math.floor(l), f = l - i; return bars[i].time + f * (bars[i + 1].time - bars[i].time);
    }
    const xOf = (t) => chart.timeScale().logicalToCoordinate(timeToLogical(t));
    const yOf = (p) => candles.priceToCoordinate(p);

    // ---- overlay drawing: zones, fair value, drawings, measure ----
    const prim = {
      req: null,
      attached(p) { this.req = p.requestUpdate; }, detached() { this.req = null; }, updateAllViews() {},
      paneViews() {
        return [{
          zOrder: () => 'top',
          renderer: () => ({
            drawBackground: (target) => target.useBitmapCoordinateSpace((sc) => drawBands(sc)),
            draw: (target) => target.useBitmapCoordinateSpace((sc) => drawShapes(sc)),
          }),
        }];
      },
    };
    candles.attachPrimitive(prim);
    const redraw = () => { if (prim.req) prim.req(); };

    // ---- labels: every text of the chart placed together, so that none covers another ----
    // While drawing, each text asks for a place (a point, a side) with a priority. The most important are placed first: at their place,
    // else moved up or down a little (with a thin line to what they name), else shortened, else tried on the other side; what still finds
    // no room is left out (its line stays; a tap on it explains it). Done again at every frame, so zoom, scroll and resizing re-arrange it.
    let LB = [];
    const ask = (o) => { LB.push(o); };
    const priceOf = (t) => (String(t).match(/[−-]?[\d,]+(\.\d+)?%?$/) || [''])[0];
    function layout(sc) {
      const ctx = sc.context, r = sc.verticalPixelRatio, hr = sc.horizontalPixelRatio, W = sc.bitmapSize.width / hr, H = sc.bitmapSize.height / r;
      const fs = W < 420 ? 9.5 : W < 700 ? 10 : 10.5, lh = Math.round(fs + 5);
      ctx.font = `${Math.round(fs * r)}px system-ui, sans-serif`; ctx.textBaseline = 'alphabetic';
      const taken = [], placed = []; let hidden = 0, short = 0;
      if (legend.textContent) taken.push({ x: 0, y: 0, w: Math.min(W, legend.offsetWidth + 12), h: 17 });   // the figures under the crosshair, top left
      const over = (b, t, p) => b.x < t.x + t.w + p && t.x < b.x + b.w + p && b.y < t.y + t.h + 1 && t.y < b.y + b.h + 1;
      const clash = (b, soft) => b.y < 1 || b.y + b.h > H - 1 || taken.some((t) => over(b, t, 3)) || (soft && candleBoxes.some((t) => over(b, t, 0)));
      // the candles on screen: a text goes where it hides none if it can
      const candleBoxes = [], vr = chart.timeScale().getVisibleLogicalRange(), sp = chart.timeScale().options().barSpacing || 6;
      if (vr) for (let i = Math.max(0, Math.floor(vr.from)); i <= Math.min(bars.length - 1, Math.ceil(vr.to)); i++) { const b = bars[i], x = xOf(b.time), yh = yOf(b.high), yl = yOf(b.low); if (x == null || yh == null || yl == null) continue; candleBoxes.push({ x: x - sp * 0.4, y: yh, w: sp * 0.8, h: Math.max(1, yl - yh) }); }
      const narrow = W < 480, cap = Math.max(6, Math.floor(H / (narrow ? 36 : 30)));   // on a small chart fewer and shorter texts
      for (const L of LB) if (L.reserve) taken.push(L.reserve);   // places already used (the measure's box)
      for (const L of LB.filter((x) => !x.reserve).sort((a, b) => b.pri - a.pri)) {
        if (!L.must && placed.length >= cap) { hidden++; continue; }
        const texts = [narrow && L.narrowShort ? null : L.text, L.short, L.tiny, narrow && L.narrowShort && !L.short ? L.text : null].filter((t, i, a) => t && a.indexOf(t) === i), xs = L.xs || [[L.x, L.align || 'left']], steps = L.fixed ? [0] : [0, -1, 1, -2, 2, -3, 3];
        let got = null;
        find: for (const soft of [true, false]) for (let ti = 0; ti < texts.length; ti++) { const t = texts[ti], w = ctx.measureText(t).width / hr + (L.pill || L.bg ? 10 : 2);
          for (const [ax, al] of xs) for (const k of steps) {
            const x0 = al === 'right' ? ax - w : al === 'center' ? ax - w / 2 : ax, b = { x: Math.max(1, Math.min(W - w - 1, x0)), y: L.y - lh / 2 + k * (lh + 1), w, h: lh };
            if (!clash(b, soft)) { got = { b, t, k, ax, ti: L.text === t ? 0 : 1 }; break find; } } }
        if (!got && L.must) { const t = texts[0], w = ctx.measureText(t).width / hr + 10, [ax, al] = xs[0], x0 = al === 'right' ? ax - w : al === 'center' ? ax - w / 2 : ax; got = { b: { x: Math.max(1, Math.min(W - w - 1, x0)), y: L.y - lh / 2, w, h: lh }, t, k: 0, ax, ti: 0 }; }
        if (!got) { hidden++; continue; }
        if (got.ti) short++; taken.push(got.b); placed.push({ ...got.b, pri: L.pri, t: got.t });
        const { b, t } = got, col = L.color || '#787b86';
        if (got.k) {   // moved up or down from what it names: a thin line back to it
          const lx = got.ax < b.x ? b.x : got.ax > b.x + b.w ? b.x + b.w : got.ax; ctx.strokeStyle = col; ctx.globalAlpha = 0.55; ctx.lineWidth = Math.max(1, r * 0.8); ctx.setLineDash([]);
          ctx.beginPath(); ctx.moveTo(lx * hr, (b.y + (got.k < 0 ? b.h : 0)) * r); ctx.lineTo(Math.min(W - 2, Math.max(2, got.ax)) * hr, L.y * r); ctx.stroke(); ctx.globalAlpha = 1; }
        if (L.pill) { ctx.fillStyle = L.pill; roundRect(ctx, b.x * hr, b.y * r, b.w * hr, b.h * r, 4 * r); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillText(t, (b.x + 5) * hr, (b.y + b.h - 4) * r); }
        else { if (L.bg) { ctx.fillStyle = dark() ? 'rgba(22,24,30,0.86)' : 'rgba(255,255,255,0.88)'; roundRect(ctx, b.x * hr, b.y * r, b.w * hr, b.h * r, 3 * r); ctx.fill(); }
          ctx.fillStyle = col; ctx.fillText(t, (b.x + (L.bg ? 5 : 1)) * hr, (b.y + b.h - 4) * r); }
      }
      root.__labels = placed; root.dataset.labels = String(placed.length); root.dataset.labelsShort = String(short); root.dataset.labelsLeft = String(hidden);   // for the tests
      LB = [];
    }
    function drawBands(sc) {
      const ctx = sc.context, W = sc.bitmapSize.width, r = sc.verticalPixelRatio, hr = sc.horizontalPixelRatio;
      LB = [];
      ctx.font = `${Math.round(10 * r)}px system-ui, sans-serif`;
      if (ind.zones && zones) {
        for (const [[lo, hi], color, label] of [[zones.tp, 'rgba(230,140,20,0.10)', 'High part'], [zones.fair, 'rgba(110,120,140,0.07)', 'Middle'], [zones.acc, 'rgba(26,160,70,0.10)', 'Low part']]) {
          const y1 = yOf(hi), y2 = yOf(lo); if (y1 == null || y2 == null) continue;
          ctx.fillStyle = color; ctx.fillRect(0, Math.round(y1 * r), W, Math.max(1, Math.round((y2 - y1) * r)));
          if (y2 - y1 > 16) ask({ text: label, x: 6, y: y1 + 9, color: 'rgba(120,125,135,0.95)', pri: 20 });
        }
      }
      if (ind.sr && levels.length) {
        const COL = { res: 'rgba(220,60,60,0.85)', sup: 'rgba(22,150,70,0.9)', act: 'rgba(41,98,255,0.95)' };
        const now = bars.length ? bars[bars.length - 1].close : null, near = [...levels].sort((a, b) => (now == null ? 0 : Math.abs(a.p - now) - Math.abs(b.p - now)));
        for (const lv of levels) {
          const y = yOf(lv.p); if (y == null) continue;
          const ly = y, rank = Math.min(12, near.indexOf(lv));   // the nearer to the price, the more important its words
          ctx.strokeStyle = COL[lv.kind] || COL.act; ctx.lineWidth = Math.max(1, (lv.kind === 'act' ? 1.6 : 1.1) * r);
          ctx.setLineDash(lv.kind === 'act' ? [] : [3 * hr, 3 * hr]);
          ctx.beginPath(); ctx.moveTo(0, Math.round(y * r) + 0.5); ctx.lineTo(W, Math.round(y * r) + 0.5); ctx.stroke();
          const Wc = W / hr; ask({ text: `${lv.label} ${fmtP(lv.p)}`, short: `${String(lv.label).split(' + ')[0]} ${fmtP(lv.p)}`, tiny: fmtP(lv.p), xs: [[Wc - 8, 'right'], [8, 'left'], [Wc * 0.55, 'center']], y: ly - 8, color: COL[lv.kind] || COL.act, bg: true, narrowShort: true, pri: (lv.kind === 'act' ? 66 : 52) - rank });
        }
        ctx.setLineDash([]);
      }
      if (ind.fair && fair) {
        const y1 = yOf(fair.bull), y2 = yOf(fair.bear), yb = yOf(fair.base);
        if (y1 != null && y2 != null) { ctx.fillStyle = 'rgba(41,98,255,0.07)'; ctx.fillRect(0, Math.round(y1 * r), W, Math.round((y2 - y1) * r)); }
        ctx.strokeStyle = 'rgba(41,98,255,0.75)'; ctx.lineWidth = Math.max(1, r); ctx.setLineDash([6 * hr, 4 * hr]);
        for (const [p, t] of [[fair.bear, 'Fair value, bear'], [fair.base, 'Fair value, base'], [fair.bull, 'Fair value, bull']]) {
          const y = yOf(p); if (y == null) continue;
          ctx.beginPath(); ctx.moveTo(0, Math.round(y * r) + 0.5); ctx.lineTo(W, Math.round(y * r) + 0.5); ctx.stroke();
          ask({ text: `${t} ${fmtP(p)}`, short: `${t.replace('Fair value, ', 'Fair, ')} ${fmtP(p)}`, tiny: fmtP(p), x: 6, y: y - 8, color: 'rgba(41,98,255,0.95)', bg: true, narrowShort: true, pri: 32 });
        }
        ctx.setLineDash([]);
        void yb;
      }
    }
    function drawShapes(sc) {
      const ctx = sc.context, W = sc.bitmapSize.width, r = sc.verticalPixelRatio, hr = sc.horizontalPixelRatio;
      ctx.font = `${Math.round(10.5 * r)}px system-ui, sans-serif`; ctx.lineWidth = Math.max(1, 1.3 * r);
      if (ind.tl) for (const d of autos) {   // trendlines through pivots (extended to the right edge) and unfilled gaps
        const x1 = xOf(d.a.t), y1 = yOf(d.a.p), x2 = xOf(d.b.t), y2 = yOf(d.b.p); if (x1 == null || y1 == null || x2 == null || y2 == null) continue;
        const col = d.kind === 'res' ? '#d64545' : d.kind === 'sup' ? '#1f9d55' : '#8a8f98', xEdge = W / hr;
        const xLast = bars.length ? xOf(bars[bars.length - 1].time) : null, sp = chart.timeScale().options().barSpacing || 6;
        const xe = d.type === 'line' && xLast != null ? Math.min(xEdge, xLast + 40 * sp) : xEdge;   // a line runs 40 bars past the last candle, not to infinity
        if (d.type === 'line' && x2 !== x1) {
          ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, (d.agree ? 2.6 : d.scale === 'long-term' ? 1.8 : 1.3) * r); ctx.beginPath(); ctx.moveTo(x1 * hr, y1 * r); ctx.lineTo(xe * hr, (y1 + (y2 - y1) * (xe - x1) / (x2 - x1)) * r); ctx.stroke();
          if (d.agree && xLast != null && xLast > x1) { const yl = y1 + (y2 - y1) * (xLast - x1) / (x2 - x1); ctx.beginPath(); ctx.arc(xLast * hr, yl * r, 6 * r, 0, 7); ctx.lineWidth = Math.max(1, 1.6 * r); ctx.stroke(); }   // ring: where the line meets another level today
          for (const q of d.pts || []) { const qx = xOf(q.t), qy = yOf(q.p); if (qx == null || qy == null) continue; ctx.beginPath(); ctx.arc(qx * hr, qy * r, 3 * r, 0, 7); ctx.fillStyle = col; ctx.fill(); }
          if (d.tag) {   // what the line is and its value today, at its right end
            const ye = y1 + (y2 - y1) * (xe - x1) / (x2 - x1), v = priceOf(d.tag), word = String(d.tag).split(' ')[0];
            ask({ text: d.tag, short: v ? `${word === 'support' ? 'sup.' : word === 'resistance' ? 'res.' : word} ${v}` : null, tiny: v || null, x: xe - 3, align: 'right', y: ye, pill: col, pri: d.agree ? 72 : d.scale === 'long-term' ? 62 : 56 });
          }
        } else if (d.type === 'box') {
          ctx.fillStyle = 'rgba(138,143,152,0.18)'; ctx.fillRect(x1 * hr, Math.min(y1, y2) * r, (xe - x1) * hr, Math.max(1, Math.abs(y2 - y1) * r));
          ask({ text: 'gap', x: x1 + 4, y: Math.min(y1, y2) - 8, color: '#8a8f98', pri: 15 });
        }
      }
      if (ind.sig && marks.length) {   // entries of the signals, each with its exit: green = buy, red = sell; the exit dot is green when it worked, red when it failed
        const G = '#1f9d55', R = '#d64545', sp = chart.timeScale().options().barSpacing || 6, lastT = bars.length ? bars[bars.length - 1].time : 0;
        marks.forEach((m, k) => {
          const x = xOf(m.a.t), yb = yOf(m.side > 0 ? m.a.lo : m.a.hi); if (x == null || yb == null) return;
          const col = m.side > 0 ? G : R, d = m.side > 0 ? 1 : -1, y0 = yb + d * 5, s = Math.max(4.5, Math.min(7, sp * 0.9));
          if (m.e && m.x) { const xe2 = xOf(m.e.t), ye2 = yOf(m.e.p), xx = xOf(m.x.t), yx = yOf(m.x.p);
            if (xe2 != null && ye2 != null && xx != null && yx != null) { const oc = m.st === 'win' ? G : R; ctx.strokeStyle = oc; ctx.lineWidth = Math.max(1, 1.1 * r); ctx.setLineDash([3 * hr, 3 * hr]); ctx.beginPath(); ctx.moveTo(xe2 * hr, ye2 * r); ctx.lineTo(xx * hr, yx * r); ctx.stroke(); ctx.setLineDash([]); ctx.beginPath(); ctx.arc(xx * hr, yx * r, 3.2 * r, 0, 7); ctx.fillStyle = oc; ctx.fill(); } }
          ctx.beginPath(); ctx.moveTo(x * hr, y0 * r); ctx.lineTo((x - s) * hr, (y0 + d * s * 1.5) * r); ctx.lineTo((x + s) * hr, (y0 + d * s * 1.5) * r); ctx.closePath();
          if (m.tested) { ctx.fillStyle = col; ctx.fill(); } else { ctx.fillStyle = dark() ? '#16181e' : '#fff'; ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, 1.4 * r); ctx.stroke(); }
          const recent = k >= marks.length - 2 || (lastT && lastT - m.a.t <= 30 * (frame.sec || 86400));   // words only on the latest entries: older ones are explained on tap
          if (m.tag && recent && sp >= 3) { const res = (String(m.tag).match(/[✓✗✕×]?\s*[+−-][\d.,]+%$/) || [''])[0]; ask({ text: m.tag, short: `${String(m.tag).split(' · ')[0]}${res ? ' ' + res : ''}`, x, align: 'center', y: y0 + d * (s * 1.5 + 11), color: col, bg: true, narrowShort: true, pri: 80 - (marks.length - 1 - k) }); }
        });
      }
      ctx.lineWidth = Math.max(1, 1.3 * r);
      const all = drawings.concat(draft ? [draft] : []);
      for (const d of all) {
        const x1 = xOf(d.a.t), y1 = yOf(d.a.p); if (x1 == null || y1 == null) continue;
        const x2 = d.b ? xOf(d.b.t) : null, y2 = d.b ? yOf(d.b.p) : null;
        if (d.type === 'hline') {
          ctx.strokeStyle = '#2962ff'; ctx.beginPath(); ctx.moveTo(0, y1 * r); ctx.lineTo(W, y1 * r); ctx.stroke();
          ask({ text: fmtP(d.a.p), x: W / hr - 4, align: 'right', y: y1 - 8, color: '#2962ff', bg: true, pri: 90, must: true });
        } else if (d.type === 'trend' && x2 != null && y2 != null) {
          ctx.strokeStyle = '#2962ff'; ctx.beginPath(); ctx.moveTo(x1 * hr, y1 * r); ctx.lineTo(x2 * hr, y2 * r); ctx.stroke();
          for (const [x, y] of [[x1, y1], [x2, y2]]) { ctx.beginPath(); ctx.arc(x * hr, y * r, 3 * r, 0, 7); ctx.fillStyle = '#2962ff'; ctx.fill(); }
        } else if (d.type === 'fib' && x2 != null && y2 != null) {
          const left = Math.min(x1, x2) * hr;
          FIB.forEach((lv, i) => {
            const p = d.b.p - (d.b.p - d.a.p) * lv, y = yOf(p); if (y == null) return;
            const next = i < FIB.length - 1 ? yOf(d.b.p - (d.b.p - d.a.p) * FIB[i + 1]) : null;
            if (next != null) { ctx.fillStyle = FIB_COLORS[i] + '14'; ctx.fillRect(left, Math.min(y, next) * r, W - left, Math.abs(next - y) * r); }
            ctx.strokeStyle = FIB_COLORS[i]; ctx.beginPath(); ctx.moveTo(left, y * r); ctx.lineTo(W, y * r); ctx.stroke();
            ask({ text: `${lv} (${fmtP(p)})`, short: String(lv), x: left / hr + 4, y: y - 7, color: FIB_COLORS[i], bg: true, pri: 40 });
          });
          ctx.setLineDash([4 * hr, 4 * hr]); ctx.strokeStyle = '#787b86'; ctx.beginPath(); ctx.moveTo(x1 * hr, y1 * r); ctx.lineTo(x2 * hr, y2 * r); ctx.stroke(); ctx.setLineDash([]);
        }
      }
      const m = measure && measure.b ? measure : draft && draft.type === 'measure' ? draft : null;
      if (m) {
        const x1 = xOf(m.a.t), y1 = yOf(m.a.p), x2 = xOf(m.b.t), y2 = yOf(m.b.p);
        if (x1 != null && y1 != null && x2 != null && y2 != null) {
          const upm = m.b.p >= m.a.p, col = upm ? 'rgba(41,98,255,' : 'rgba(242,54,69,';
          ctx.fillStyle = col + '0.15)'; ctx.fillRect(Math.min(x1, x2) * hr, Math.min(y1, y2) * r, Math.abs(x2 - x1) * hr, Math.abs(y2 - y1) * r);
          ctx.strokeStyle = col + '0.9)'; ctx.beginPath(); ctx.moveTo(x1 * hr, y1 * r); ctx.lineTo(x2 * hr, y2 * r); ctx.stroke();
          const dp = m.b.p - m.a.p, pct = m.a.p ? dp / m.a.p : 0, nb = Math.round(timeToLogical(m.b.t) - timeToLogical(m.a.t));
          const days = Math.abs(m.b.t - m.a.t) / 86400;
          const txt = `${dp >= 0 ? '+' : '−'}${fmtP(Math.abs(dp))} (${dp >= 0 ? '+' : '−'}${(Math.abs(pct) * 100).toFixed(2)}%) · ${Math.abs(nb)} bars, ${days >= 1 ? Math.round(days) + 'd' : Math.round(days * 24) + 'h'}`;
          const bx = Math.min(x1, x2) * hr, by = (upm ? Math.min(y1, y2) - 22 : Math.max(y1, y2) + 6) * r;
          ctx.font = `${Math.round(11 * r)}px system-ui, sans-serif`;
          const tw = ctx.measureText(txt).width + 12 * hr;
          ctx.fillStyle = col + '0.95)'; roundRect(ctx, bx, by, tw, 18 * r, 4 * r); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.fillText(txt, bx + 6 * hr, by + 13 * r);
          LB.push({ text: ' ', x: bx / hr, y: by / r + 9, w0: tw / hr, pri: 1000, fixed: true, reserve: { x: bx / hr, y: by / r, w: tw / hr, h: 18 } });   // its place is kept free
        }
      }
      layout(sc);
    }
    function roundRect(ctx, x, y, w, h, rad) { ctx.beginPath(); ctx.moveTo(x + rad, y); ctx.arcTo(x + w, y, x + w, y + h, rad); ctx.arcTo(x + w, y + h, x, y + h, rad); ctx.arcTo(x, y + h, x, y, rad); ctx.arcTo(x, y, x + w, y, rad); ctx.closePath(); }

    // ---- tools: pointer input on an overlay while a drawing tool is active ----
    const HINTS = { measure: 'Drag between two points to measure.', fib: 'Drag from a low to a high (or a high to a low).', trend: 'Drag to draw a trend line.', hline: 'Tap a price to place a line.' };
    function setTool(t) {
      tool = t;
      for (const b of [bCursor, bMeasure, bFib, bTrend, bH]) b.setAttribute('aria-pressed', String(b.dataset.k === t));
      const drawing = t !== 'cursor';
      overlay.style.pointerEvents = drawing ? 'auto' : 'none';
      overlay.style.cursor = drawing ? 'crosshair' : '';
      chart.applyOptions({ handleScroll: !drawing, handleScale: !drawing });
      hint.textContent = HINTS[t] || ''; hint.hidden = !drawing;
    }
    const pointAt = (ev) => {
      const rc = overlay.getBoundingClientRect(), x = ev.clientX - rc.left, y = ev.clientY - rc.top;
      const l = chart.timeScale().coordinateToLogical(x), p = candles.coordinateToPrice(y);
      if (l == null || p == null) return null;
      return { t: Math.round(logicalToTime(l)), p };
    };
    overlay.addEventListener('pointerdown', (ev) => {
      const pt = pointAt(ev); if (!pt) return;
      ev.preventDefault(); overlay.setPointerCapture(ev.pointerId);
      if (tool === 'hline') { drawings.push({ type: 'hline', a: pt }); save(); setTool('cursor'); redraw(); return; }
      draft = { type: tool, a: pt, b: pt };
      if (tool === 'measure') measure = null;
      redraw();
    });
    overlay.addEventListener('pointermove', (ev) => { if (!draft) return; const pt = pointAt(ev); if (pt) { draft.b = pt; redraw(); } });
    const finish = (ev) => {
      if (!draft) return;
      const pt = pointAt(ev); if (pt) draft.b = pt;
      const moved = Math.abs((xOf(draft.b.t) || 0) - (xOf(draft.a.t) || 0)) + Math.abs((yOf(draft.b.p) || 0) - (yOf(draft.a.p) || 0)) > 6;
      if (moved) { if (draft.type === 'measure') measure = draft; else { drawings.push(draft); save(); } }
      draft = null; setTool('cursor'); redraw();
    };
    overlay.addEventListener('pointerup', finish);
    overlay.addEventListener('pointercancel', () => { draft = null; redraw(); });
    function save() { lsSet(key, drawings.slice(-60)); }
    bCursor.addEventListener('click', () => setTool('cursor'));
    bMeasure.addEventListener('click', () => setTool(tool === 'measure' ? 'cursor' : 'measure'));
    bFib.addEventListener('click', () => setTool(tool === 'fib' ? 'cursor' : 'fib'));
    bTrend.addEventListener('click', () => setTool(tool === 'trend' ? 'cursor' : 'trend'));
    // tap a level or a trendline to see what it is made of
    chart.subscribeClick((ev) => {
      if (!ev || !ev.point || tool !== 'cursor' || !opts.onPick) return;
      let hit = null, bd = 10;
      if (ind.sr) for (const lv of levels) { const y = yOf(lv.p); if (y != null && Math.abs(y - ev.point.y) < bd) { bd = Math.abs(y - ev.point.y); hit = { p: lv.p, label: lv.full || lv.label, kind: lv.kind }; } }
      if (ind.tl) for (const d of autos) if (d.type === 'line') {
        const x1 = xOf(d.a.t), y1 = yOf(d.a.p), x2 = xOf(d.b.t), y2 = yOf(d.b.p); if (x1 == null || y1 == null || x2 == null || y2 == null || x2 === x1 || ev.point.x < x1) continue;
        const y = y1 + (y2 - y1) * (ev.point.x - x1) / (x2 - x1); if (Math.abs(y - ev.point.y) < bd) { bd = Math.abs(y - ev.point.y); hit = { p: d.now != null ? d.now : candles.coordinateToPrice(y), label: d.full || 'trendline', kind: d.kind }; }
      }
      if (ind.sig) for (const m of marks) { const x = xOf(m.a.t), y = yOf(m.side > 0 ? m.a.lo : m.a.hi); if (x == null || y == null) continue; const yy = y + (m.side > 0 ? 12 : -12); if (Math.abs(x - ev.point.x) < 12 && Math.abs(yy - ev.point.y) < 16) { hit = { p: m.e ? m.e.p : (m.side > 0 ? m.a.lo : m.a.hi), label: m.full, tr: m.tr || null, kind: m.side > 0 ? 'buy' : 'sell' }; break; } }
      if (!hit && ind.tl) for (const d of autos) if (d.type === 'box') {
        const x1 = xOf(d.a.t), y1 = yOf(d.a.p), y2 = yOf(d.b.p); if (x1 == null || y1 == null || y2 == null || ev.point.x < x1) continue;
        if (ev.point.y >= Math.min(y1, y2) - 4 && ev.point.y <= Math.max(y1, y2) + 4) hit = { p: (d.a.p + d.b.p) / 2, label: d.full || 'gap', kind: d.kind };
      }
      opts.onPick(hit ? { ...hit, at: { x: ev.point.x, y: ev.point.y } } : null);   // where the tap was: the explanation opens beside it
    });
    chart.timeScale().subscribeVisibleLogicalRangeChange(() => { if (opts.onPan && !dead) opts.onPan(); });
    // where the drawn trendlines are on screen, 20 px left of the last candle (used by the automated test of "tap a line")
    root.__drawings = () => drawings.length;
    root.__marks = () => marks.map((m) => { const x = xOf(m.a.t), y = yOf(m.side > 0 ? m.a.lo : m.a.hi); return x == null || y == null ? null : { x, y: y + (m.side > 0 ? 12 : -12), side: m.side, st: m.st }; }).filter(Boolean);
    root.__view = () => { const v = chart.timeScale().getVisibleLogicalRange(); return { n: bars.length, from: v ? v.from : null, to: v ? v.to : null }; };   // for the tests: is the newest candle on screen
    root.__future = (ahead) => { const n = bars.length; if (!n) return null; chart.timeScale().setVisibleLogicalRange({ from: n - 30, to: n + (ahead || 40) }); return new Promise((res) => setTimeout(() => res({ slots: future.length, lastBar: bars[n - 1].time, timeRight: chart.timeScale().coordinateToTime(main.clientWidth - 70), sec: frame.sec }), 300)); };   // for the tests: what the axis shows to the right of the last candle
    root.__probe = () => autos.filter((d) => d.type === 'line').map((d) => { const x1 = xOf(d.a.t), y1 = yOf(d.a.p), x2 = xOf(d.b.t), y2 = yOf(d.b.p), xl = bars.length ? xOf(bars[bars.length - 1].time) : null; if (x1 == null || y1 == null || x2 == null || y2 == null || xl == null || x2 === x1) return null; const x = xl - 20; return { x, y: y1 + (y2 - y1) * (x - x1) / (x2 - x1), agree: d.agree || 0 }; }).filter(Boolean);
    bH.addEventListener('click', () => setTool(tool === 'hline' ? 'cursor' : 'hline'));
    bUndo.addEventListener('click', () => { if (measure) measure = null; else drawings.pop(); save(); redraw(); });
    bClear.addEventListener('click', () => { drawings = []; measure = null; save(); redraw(); });
    bInd.addEventListener('click', () => { menu.hidden = !menu.hidden; bInd.setAttribute('aria-pressed', String(!menu.hidden)); });
    // height: the window in full view, the page's own height on a wide window (opts.height), else a phone-sized chart
    function sizeMain() { const np = +(main.dataset.panes || 1), own = opts.height ? opts.height() : 0; main.style.height = root.classList.contains('is-full') ? '' : (own || (340 + (np - 1) * 110)) + 'px'; }
    bFull.addEventListener('click', () => toggleFull());
    bClose.addEventListener('click', () => toggleFull(false));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !dead && root.classList.contains('is-full')) { e.preventDefault(); toggleFull(false); } });   // Esc leaves the full view (Mac)
    window.addEventListener('resize', () => { if (dead) return; sizeMain(); if (root.classList.contains('is-full')) { try { chart.resize(main.clientWidth, main.clientHeight); } catch (e) { /* self-sizing */ } } });
    function toggleFull(on) {
      const want = on != null ? on : !root.classList.contains('is-full');
      root.classList.toggle('is-full', want); document.body.classList.toggle('chart-full', want);
      if (opts.onFull) { try { opts.onFull(want); } catch (e) { /* the page keeps its own header */ } }
      if (!want) noteEl.textContent = '';
      bFull.setAttribute('aria-pressed', String(want));
      sizeMain();
      setTimeout(() => { try { chart.resize(main.clientWidth, main.clientHeight); } catch (e) { /* the chart sizes itself */ } redraw(); }, 90);   // fill the window in full view
    }
    setTool('cursor');

    // ---- legend: OHLC and indicator values under the crosshair ----
    chart.subscribeCrosshairMove((p) => {
      const b = p && p.time != null ? p.seriesData.get(candles) : null;
      if (!b) { legend.textContent = ''; if (opts.onHover) opts.onHover(null); return; }
      const parts = [`O ${fmtP(b.open)}`, `H ${fmtP(b.high)}`, `L ${fmtP(b.low)}`, `C ${fmtP(b.close)}`];
      const prevBar = bars[Math.max(0, bars.findIndex((x) => x.time === p.time) - 1)];
      if (prevBar) parts.push(`${b.close >= prevBar.close ? '+' : ''}${((b.close / prevBar.close - 1) * 100).toFixed(2)}%`);
      for (const [k, s] of Object.entries(S)) { const v = p.seriesData.get(s); if (v && v.value != null && !k.startsWith('bb') && !k.startsWith('macd')) parts.push(`${k.toUpperCase().replace('MA', 'MA ')} ${k === 'rsi' ? v.value.toFixed(1) : fmtP(v.value)}`); }
      legend.textContent = parts.join('  ');
      if (opts.onHover) opts.onHover({ time: p.time, ...b });
    });
    chart.timeScale().subscribeVisibleLogicalRangeChange(redraw);

    // ---- indicators ----
    function applyIndicators() {
      for (const k of Object.keys(S)) { try { chart.removeSeries(S[k]); } catch (e) { /* gone */ } delete S[k]; }
      while (chart.panes().length > 1) chart.removePane(chart.panes().length - 1);
      vol.applyOptions({ visible: !!ind.vol });
      if (!bars.length) { redraw(); return; }
      const c = bars.map((b) => b.close), t = bars.map((b) => b.time);
      const put = (s, vals) => s.setData(vals.map((v, i) => (v == null ? { time: t[i] } : { time: t[i], value: v })));
      if (ind.ma20) put(S.ma20 = line('#f7a600', 1), sma(c, 20));
      if (ind.ma50) put(S.ma50 = line('#2962ff', 1), sma(c, 50));
      if (ind.ma200) put(S.ma200 = line('#e040fb', 1.5), sma(c, 200));
      if (ind.bb) {
        const m = sma(c, 20), sd = stdev(c, 20);
        put(S.bbu = line('rgba(33,150,243,0.7)', 1), m.map((v, i) => (v == null ? null : v + 2 * sd[i])));
        put(S.bbm = line('rgba(255,152,0,0.7)', 1), m);
        put(S.bbl = line('rgba(33,150,243,0.7)', 1), m.map((v, i) => (v == null ? null : v - 2 * sd[i])));
      }
      let pane = 1;
      if (ind.rsi) {
        S.rsi = line('#7e57c2', 1.3, pane); put(S.rsi, rsi(c, 14));
        S.rsi.createPriceLine({ price: 70, color: 'rgba(120,120,120,0.6)', lineStyle: 2, lineWidth: 1, axisLabelVisible: false });
        S.rsi.createPriceLine({ price: 30, color: 'rgba(120,120,120,0.6)', lineStyle: 2, lineWidth: 1, axisLabelVisible: false });
        pane++;
      }
      if (ind.macd) {
        const fast = ema(c, 12), slow = ema(c, 26), mac = fast.map((v, i) => (v == null || slow[i] == null ? null : v - slow[i]));
        const firstIdx = mac.findIndex((v) => v != null), sig = Array(c.length).fill(null);
        if (firstIdx >= 0) { const e = ema(mac.slice(firstIdx), 9); e.forEach((v, i) => { sig[firstIdx + i] = v; }); }
        S.macdh = chart.addSeries(LW().HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, pane);
        S.macdh.setData(mac.map((v, i) => (v == null || sig[i] == null ? { time: t[i] } : { time: t[i], value: v - sig[i], color: v - sig[i] >= 0 ? 'rgba(8,153,129,0.5)' : 'rgba(242,54,69,0.5)' })));
        put(S.macd = line('#2962ff', 1.2, pane), mac); put(S.macds = line('#ff6d00', 1.2, pane), sig);
        pane++;
      }
      const panes = chart.panes();
      if (panes.length > 1) { panes[0].setStretchFactor(3); for (let i = 1; i < panes.length; i++) panes[i].setStretchFactor(1); }
      main.dataset.panes = String(panes.length); sizeMain();
      redraw();
    }

    return {
      setBars(newBars, f, fit) {
        if (dead) return;
        const n0 = bars.length, vr0 = !fit && n0 ? chart.timeScale().getVisibleLogicalRange() : null, atEnd = !!(vr0 && vr0.to >= n0 - 1.5) && (!f || f.sec === frame.sec);
        bars = newBars; frame = f || frame;
        candles.setData(bars.map(({ time, open, high, low, close }) => ({ time, open, high, low, close })));
        vol.setData(bars.some((b) => b.volume > 0) ? bars.map((b) => ({ time: b.time, value: b.volume || 0, color: b.close >= b.open ? 'rgba(8,153,129,0.35)' : 'rgba(242,54,69,0.35)' })) : []);   // no volume at all (currencies, the account's value): no empty strip
        chart.applyOptions({ timeScale: { timeVisible: frame.sec < 86400 } });
        applyIndicators(); makeFuture();
        if (fit && bars.length) chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, bars.length - (frame.show || 160)), to: bars.length + 5 });
        else if (atEnd && bars.length !== n0) { const dn = bars.length - n0; chart.timeScale().setVisibleLogicalRange({ from: vr0.from + dn, to: vr0.to + dn }); }   // new candles came in while the last one was on screen: follow them
      },
      update(bar, isNew) {
        if (dead || !bar) return;
        const vr0 = isNew && bars.length ? chart.timeScale().getVisibleLogicalRange() : null, atEnd = !!(vr0 && vr0.to >= bars.length - 1.5);
        if (isNew) bars.push(bar); else if (bars.length) Object.assign(bars[bars.length - 1], bar);
        if (atEnd) chart.timeScale().setVisibleLogicalRange({ from: vr0.from + 1, to: vr0.to + 1 });   // a new candle: the view moves one step with it, as on TradingView
        if (isNew) makeFuture();   // a new candle: the empty slots start after it again
        candles.update({ time: bar.time, open: bar.open, high: bar.high, low: bar.low, close: bar.close });
      },
      setZones(L) { zones = L; redraw(); },
      setFair(f) { fair = f && f.bear > 0 && f.bull > 0 ? f : null; redraw(); },
slot, fit: () => { sizeMain(); }, note: (t) => { noteEl.textContent = t || ''; }, isFull: () => root.classList.contains('is-full'),
      setLevels(l) { levels = Array.isArray(l) ? l : []; redraw(); },
      lw: () => ({ chart, candles }),   // for a chart of something else than an asset (the account's value): its own lines and markers
      setAuto(x) { autos = Array.isArray(x) ? x : []; redraw(); },
      setTrades(x) { marks = Array.isArray(x) ? x : []; redraw(); },
      back() { if (root.classList.contains('is-full')) { toggleFull(false); return true; } if (tool !== 'cursor' || !menu.hidden) { setTool('cursor'); menu.hidden = true; return true; } return false; },
      destroy() { dead = true; document.body.classList.remove('chart-full'); try { chart.remove(); } catch (e) { /* gone */ } },
    };
  }
  window.SRChart = { create, sma, ema, rsi };
})();
