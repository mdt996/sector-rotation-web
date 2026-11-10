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
  const IND_DEFAULT = { ma20: false, ma50: true, ma200: true, bb: false, rsi: true, macd: false, vol: true, zones: false, fair: false, sr: true }; // a clean chart: two averages, RSI, the nearest levels
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
    let drawings = lsGet(key, []), tool = 'cursor', draft = null, measure = null, bars = [], frame = { sec: 86400, show: 160 };
    let ind = Object.assign({}, IND_DEFAULT, lsGet('sr.ind3', {})), zones = null, fair = null, levels = [], dead = false;

    const root = container.appendChild(el('div', 'ch'));
    const tools = root.appendChild(el('div', 'ch-tools'));
    const btn = (k, title) => { const b = tools.appendChild(el('button', 'ch-btn')); b.type = 'button'; b.title = title; b.setAttribute('aria-label', title); b.innerHTML = svg(ICON[k]); b.dataset.k = k; return b; };
    const bCursor = btn('cursor', 'Move and zoom'), bMeasure = btn('measure', 'Measure'), bFib = btn('fib', 'Fibonacci retracement'), bTrend = btn('trend', 'Trend line'), bH = btn('hline', 'Horizontal line');
    tools.appendChild(el('span', 'ch-sep'));
    const bInd = btn('ind', 'Indicators'), bUndo = btn('undo', 'Undo last drawing'), bClear = btn('clear', 'Clear drawings'), bFull = btn('full', 'Fullscreen');
    const hint = root.appendChild(el('div', 'ch-hint', ''));
    const main = root.appendChild(el('div', 'ch-main'));
    const legend = main.appendChild(el('div', 'ch-legend', ''));
    const overlay = main.appendChild(el('div', 'ch-overlay'));
    const menu = root.appendChild(el('div', 'ch-menu')); menu.hidden = true;
    const IND_LABEL = { ma20: 'MA 20', ma50: 'MA 50', ma200: 'MA 200', bb: 'Bollinger (20, 2)', rsi: 'RSI (14)', macd: 'MACD (12, 26, 9)', vol: 'Volume', zones: '2-year range bands', fair: 'Fundamental fair value', sr: 'Support, resistance and action levels' };
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
    const line = (color, w, pane) => chart.addSeries(LW().LineSeries, { color, lineWidth: w || 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }, pane || 0);
    const S = {}; // indicator series

    // ---- time <-> logical index (works across timeframes and beyond the last bar) ----
    function timeToLogical(t) {
      const n = bars.length; if (!n) return 0;
      if (t <= bars[0].time) return (t - bars[0].time) / frame.sec;
      if (t >= bars[n - 1].time) return n - 1 + (t - bars[n - 1].time) / frame.sec;
      let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (bars[m].time <= t) lo = m; else hi = m; }
      return lo + (t - bars[lo].time) / ((bars[hi].time - bars[lo].time) || 1);
    }
    function logicalToTime(l) {
      const n = bars.length; if (!n) return 0;
      if (l <= 0) return bars[0].time + l * frame.sec;
      if (l >= n - 1) return bars[n - 1].time + (l - (n - 1)) * frame.sec;
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

    function drawBands(sc) {
      const ctx = sc.context, W = sc.bitmapSize.width, r = sc.verticalPixelRatio, hr = sc.horizontalPixelRatio;
      ctx.font = `${Math.round(10 * r)}px system-ui, sans-serif`;
      if (ind.zones && zones) {
        for (const [[lo, hi], color, label] of [[zones.tp, 'rgba(230,140,20,0.10)', 'High part'], [zones.fair, 'rgba(110,120,140,0.07)', 'Middle'], [zones.acc, 'rgba(26,160,70,0.10)', 'Low part']]) {
          const y1 = yOf(hi), y2 = yOf(lo); if (y1 == null || y2 == null) continue;
          ctx.fillStyle = color; ctx.fillRect(0, Math.round(y1 * r), W, Math.max(1, Math.round((y2 - y1) * r)));
          if (y2 - y1 > 16) { ctx.fillStyle = 'rgba(120,125,135,0.85)'; ctx.fillText(label, Math.round(6 * hr), Math.round((y1 + 12) * r)); }
        }
      }
      if (ind.sr && levels.length) {
        const COL = { res: 'rgba(220,60,60,0.85)', sup: 'rgba(22,150,70,0.9)', act: 'rgba(41,98,255,0.95)' };
        const used = [];
        for (const lv of [...levels].sort((a, b) => (a.kind === 'act' ? -1 : 0) - (b.kind === 'act' ? -1 : 0))) {
          const y = yOf(lv.p); if (y == null) continue;
          const ly = y, clash = used.some((u) => Math.abs(u - ly) < 14); if (!clash) used.push(ly);
          ctx.strokeStyle = COL[lv.kind] || COL.act; ctx.lineWidth = Math.max(1, (lv.kind === 'act' ? 1.6 : 1.1) * r);
          ctx.setLineDash(lv.kind === 'act' ? [] : [3 * hr, 3 * hr]);
          ctx.beginPath(); ctx.moveTo(0, Math.round(y * r) + 0.5); ctx.lineTo(W, Math.round(y * r) + 0.5); ctx.stroke();
          const txt = `${lv.label} ${fmtP(lv.p)}`, tw = ctx.measureText(txt).width, x = W - tw - Math.round(70 * hr);
          if (!clash) { // a label that would overlap another is left out; the line stays
            ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(x - 3 * hr, Math.round((ly - 13) * r), tw + 6 * hr, Math.round(12 * r));
            ctx.fillStyle = COL[lv.kind] || COL.act; ctx.fillText(txt, x, Math.round((ly - 3) * r));
          }
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
          ctx.fillStyle = 'rgba(41,98,255,0.95)'; ctx.fillText(`${t} ${fmtP(p)}`, Math.round(6 * hr), Math.round((y - 3) * r));
        }
        ctx.setLineDash([]);
        void yb;
      }
    }
    function drawShapes(sc) {
      const ctx = sc.context, W = sc.bitmapSize.width, r = sc.verticalPixelRatio, hr = sc.horizontalPixelRatio;
      ctx.font = `${Math.round(10.5 * r)}px system-ui, sans-serif`; ctx.lineWidth = Math.max(1, 1.3 * r);
      const all = drawings.concat(draft ? [draft] : []);
      for (const d of all) {
        const x1 = xOf(d.a.t), y1 = yOf(d.a.p); if (x1 == null || y1 == null) continue;
        const x2 = d.b ? xOf(d.b.t) : null, y2 = d.b ? yOf(d.b.p) : null;
        if (d.type === 'hline') {
          ctx.strokeStyle = '#2962ff'; ctx.beginPath(); ctx.moveTo(0, y1 * r); ctx.lineTo(W, y1 * r); ctx.stroke();
          label(ctx, fmtP(d.a.p), W - 4 * hr, y1 * r - 4 * r, '#2962ff', 'right');
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
            label(ctx, `${lv} (${fmtP(p)})`, left + 4 * hr, y * r - 3 * r, FIB_COLORS[i], 'left');
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
        }
      }
    }
    function label(ctx, t, x, y, color, align) {
      ctx.textAlign = align; ctx.fillStyle = color; ctx.fillText(t, x, y); ctx.textAlign = 'left';
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
    bH.addEventListener('click', () => setTool(tool === 'hline' ? 'cursor' : 'hline'));
    bUndo.addEventListener('click', () => { if (measure) measure = null; else drawings.pop(); save(); redraw(); });
    bClear.addEventListener('click', () => { drawings = []; measure = null; save(); redraw(); });
    bInd.addEventListener('click', () => { menu.hidden = !menu.hidden; bInd.setAttribute('aria-pressed', String(!menu.hidden)); });
    bFull.addEventListener('click', () => toggleFull());
    function toggleFull(on) {
      const want = on != null ? on : !root.classList.contains('is-full');
      root.classList.toggle('is-full', want); document.body.classList.toggle('chart-full', want);
      bFull.setAttribute('aria-pressed', String(want));
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
      main.style.height = (root.classList.contains('is-full') ? '' : (340 + (panes.length - 1) * 110) + 'px');
      redraw();
    }

    return {
      setBars(newBars, f, fit) {
        if (dead) return;
        bars = newBars; frame = f || frame;
        candles.setData(bars.map(({ time, open, high, low, close }) => ({ time, open, high, low, close })));
        vol.setData(bars.map((b) => ({ time: b.time, value: b.volume || 0, color: b.close >= b.open ? 'rgba(8,153,129,0.35)' : 'rgba(242,54,69,0.35)' })));
        chart.applyOptions({ timeScale: { timeVisible: frame.sec < 86400 } });
        applyIndicators();
        if (fit && bars.length) chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, bars.length - (frame.show || 160)), to: bars.length + 5 });
      },
      update(bar, isNew) {
        if (dead || !bar) return;
        if (isNew) bars.push(bar); else if (bars.length) Object.assign(bars[bars.length - 1], bar);
        candles.update({ time: bar.time, open: bar.open, high: bar.high, low: bar.low, close: bar.close });
      },
      setZones(L) { zones = L; redraw(); },
      setFair(f) { fair = f && f.bear > 0 && f.bull > 0 ? f : null; redraw(); },
      setLevels(l) { levels = Array.isArray(l) ? l : []; redraw(); },
      back() { if (root.classList.contains('is-full')) { toggleFull(false); return true; } if (tool !== 'cursor' || !menu.hidden) { setTool('cursor'); menu.hidden = true; return true; } return false; },
      destroy() { dead = true; document.body.classList.remove('chart-full'); try { chart.remove(); } catch (e) { /* gone */ } },
    };
  }
  window.SRChart = { create, sma, ema, rsi };
})();
