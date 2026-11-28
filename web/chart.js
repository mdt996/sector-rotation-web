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
  const dark = () => (window.SRTheme ? window.SRTheme.dark() : !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches));   // the app's own choice (Settings), dark by default
  const css = (n, fb) => (getComputedStyle(document.documentElement).getPropertyValue(n) || '').trim() || fb;
  const FIB = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
  const FIB_COLORS = ['#787b86', '#f23645', '#ff9800', '#4caf50', '#089981', '#00bcd4', '#787b86'];
  const IND_DEFAULT = { ma20: false, ma50: true, ma200: true, bb: false, rsi: true, macd: false, vol: true, zones: false, fair: false, sr: true, tl: true, sig: true, rs: true, pos: true, ev: true, mine: false }; // a clean chart: two averages, RSI, the nearest levels
  const ICON = {
    cursor: '<path d="M5 3l14 8-6 1.5L10 19z"/>',
    measure: '<path d="M3 17L17 3l4 4L7 21z"/><path d="M7 13l2 2M10 10l2 2M13 7l2 2"/>',
    fib: '<path d="M3 5h18M3 10h18M3 14h18M3 19h18"/><path d="M5 19L19 5" stroke-dasharray="2 2"/>',
    trend: '<path d="M4 18L20 6"/><circle cx="4" cy="18" r="2"/><circle cx="20" cy="6" r="2"/>',
    hline: '<path d="M3 12h18"/><circle cx="12" cy="12" r="2"/>',
    ind: '<path d="M3 17l5-6 4 3 4-7 5 5"/>',
    undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
    clear: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    compare: '<path d="M3 18l6-6 4 3 8-9M3 15l5 2 6-8 7 4"/>',
    full: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    mine: '<circle cx="12" cy="12" r="8.5"/><path d="M9.5 16.5v-9h3a2.6 2.6 0 0 1 0 5.2h-3M12.6 12.7l2.6 3.8"/>',
    draw: '<path d="M4 20l4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10z"/><path d="M13.5 6.5l3 3"/>',
    ray: '<path d="M4 18L21 5"/><circle cx="4" cy="18" r="2"/><circle cx="11" cy="12.7" r="2"/>',
    vline: '<path d="M12 3v18"/><circle cx="12" cy="12" r="2"/>',
    rect: '<rect x="4" y="7" width="16" height="10" rx="1.5"/>',
  };
  const DCOL = ['#3B82F6', '#F59E0B', '#22C55E', '#EF4444', '#A78BFA', '#E5E7EB'];   // the drawings' colours, in the order a tap on Colour goes through them
  // how a chart draws its prices (Matteo, 28 Nov 2026: "I would like the charts to look clearer and nicer, with more options")
  const STYLES = [['candles', 'Candles'], ['hollow', 'Hollow'], ['bars', 'Bars'], ['line', 'Line'], ['area', 'Area']];
  const svg = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;

  // ---- indicator maths ----
  function sma(v, n) { const o = []; let s = 0; for (let i = 0; i < v.length; i++) { s += v[i]; if (i >= n) s -= v[i - n]; o.push(i >= n - 1 ? s / n : null); } return o; }
  function ema(v, n) { const o = [], k = 2 / (n + 1); let e = null; for (let i = 0; i < v.length; i++) { e = e == null ? v[i] : v[i] * k + e * (1 - k); o.push(i >= n - 1 ? e : null); } return o; }
  function stdev(v, n) { const o = []; for (let i = 0; i < v.length; i++) { if (i < n - 1) { o.push(null); continue; } let m = 0; for (let j = i - n + 1; j <= i; j++) m += v[j]; m /= n; let s = 0; for (let j = i - n + 1; j <= i; j++) s += (v[j] - m) ** 2; o.push(Math.sqrt(s / n)); } return o; }
  function rsi(v, n) { const o = [null]; let g = 0, l = 0; for (let i = 1; i < v.length; i++) { const d = v[i] - v[i - 1], up = Math.max(d, 0), dn = Math.max(-d, 0); if (i <= n) { g += up / n; l += dn / n; o.push(i === n ? 100 - 100 / (1 + g / (l || 1e-12)) : null); } else { g = (g * (n - 1) + up) / n; l = (l * (n - 1) + dn) / n; o.push(100 - 100 / (1 + g / (l || 1e-12))); } } return o; }

  function quoteBars(rows, quote, frame) {
    if (!rows.length || !quote || !Number.isFinite(quote.price) || quote.price <= 0 || !Number.isFinite(quote.at)) return rows;
    const last = rows[rows.length - 1], t = Math.floor(quote.at / 1000), sec = frame.sec;
    if (t < last.time) return rows;
    const time = sec === 604800 ? last.time + Math.floor((t - last.time) / sec) * sec : Math.floor(t / sec) * sec;
    if (time <= last.time && quote.price === last.close) return rows;
    return time <= last.time
      ? rows.slice(0, -1).concat({ time: last.time, close: quote.price })
      : rows.concat({ time, close: quote.price });
  }

  // Match candles in the same interval. Base both returns on the first shared close in the loaded history.
  function comparePrices(primary, other, frame, latest) {
    const sec = frame.sec, offset = sec === 604800 ? 4 * 86400 : 0;   // weekly candles start on Sunday
    const bucket = (t) => Math.floor((t + offset) / sec);
    const valid = (x) => Number.isFinite(x) && x > 0;
    // Update each asset only in its quote's interval; a missing shared interval stays empty.
    primary = quoteBars(primary, latest && latest.a, frame);
    other = quoteBars(other, latest && latest.b, frame);
    const closes = new Map(other.filter((b) => valid(b.close)).map((b) => [bucket(b.time), b.close]));
    const matches = primary.map((b) => ({ time: b.time, a: b.close, b: closes.get(bucket(b.time)) }));
    const start = matches.findIndex((x) => valid(x.a) && valid(x.b));
    if (start < 0) return null;
    const base = matches[start];
    let last = null, count = 0;
    const points = matches.slice(start).map(({ time, a, b }) => {
      if (!valid(a) || !valid(b)) return { time };
      const x = a / base.a, y = b / base.b;
      last = { time, a: (x - 1) * 100, b: (y - 1) * 100, ratio: (x / y - 1) * 100 };
      count++;
      return last;
    });
    return count > 1 ? { points, start: base.time, last } : null;
  }
  const comparePct = (v) => (v >= 0.005 ? '+' : '') + (Math.abs(v) < 0.005 ? '0.00' : v.toFixed(2)) + '%';
  const rebase = (value, base) => (100 + value) / (100 + base) * 100 - 100;
  function comparisonWindow(data, range) {
    if (!range) return null;
    let first, last;
    for (const p of data.points) {
      if (p.time > range.last.time) break;
      if (p.time < range.first.time || p.a == null) continue;
      if (!first) first = p;
      last = p;
    }
    return first && last !== first ? { first, last: { time: last.time, a: rebase(last.a, first.a), b: rebase(last.b, first.b), ratio: rebase(last.ratio, first.ratio) } } : null;
  }
  function dateInputValue(time, utc) {
    const d = new Date(time * 1000), y = utc ? d.getUTCFullYear() : d.getFullYear(), m = utc ? d.getUTCMonth() : d.getMonth(), day = utc ? d.getUTCDate() : d.getDate();
    return [y, String(m + 1).padStart(2, '0'), String(day).padStart(2, '0')].join('-');
  }
  function dateBoundary(value, utc, next = false) {
    const [y, m, d] = value.split('-').map(Number);
    return (utc ? Date.UTC(y, m - 1, d + +next) : new Date(y, m - 1, d + +next).getTime()) / 1000;
  }

  function create(container, opts) {
    opts = opts || {};
    const fmtP = opts.priceFormat || ((x) => String(x));
    const key = 'sr.draw.' + (opts.id || 'x');
    let autos = [], marks = [], bench = [], posn = null, events = [], mine = [], mineDrawn = 0;   // mine: your own trades on Revolut   // bench: the S&P 500's candles of the same size; posn: the demo account's trade; events: dates ahead (results)
    let comparison = null;
    let drawings = lsGet(key, []), tool = 'cursor', draft = null, measure = null, bars = [], frame = { sec: 86400, show: 160 };
    let sel = null, drag = null, hist = [], guide = null, lastColor = DCOL[0], paneH = 300;   // sel: the selected drawing (its index, or 'm' for the measure); guide: the point being placed or moved
    let style = lsGet('sr.chartStyle', 'candles'); if (!STYLES.some(([k]) => k === style)) style = 'candles';
    let ind = Object.assign({}, IND_DEFAULT, lsGet('sr.ind3', {})), zones = null, fair = null, levels = [], dead = false;
    // Three ways to look at the chart (Matteo, 21 Nov 2026: "sometimes they are a bit crowded ... especially when I represent
    // trendlines and horizontal resistances/support zones ... the app should be complete, but adaptable"; then, the same evening:
    // "By default clean chart must be actually clean"). Clean is the price alone: no average, line, level, arrow or label. Levels
    // adds the trendlines and the nearest levels; Full adds the rest. Nothing is removed: a view is a set of layers and how much of
    // each is drawn (tl: trendlines at most, more appear as you zoom in; lv: levels each side of the price; words: 0 prices only
    // (tap a line to read what it is), 1 short names, 2 everything written out; marks: the trades on an account's chart, 0 none, 1 dots, 2 dots with their figures
    // where there is room). The list of layers stays, for a mix of your own: ticking one there makes the view "Custom".
    const ACCOUNT = !!opts.account;   // the value of an account, not the price of an asset
    const OFF = { ma20: false, ma50: false, ma200: false, bb: false, rsi: false, macd: false, vol: false, zones: false, fair: false, sr: false, tl: false, sig: false, rs: false, pos: false, ev: false };
    const VIEWS = {
      clean: { name: 'Clean', says: ACCOUNT ? 'The value alone' : 'The price alone', ind: OFF, tl: 0, lv: 0, words: 0, marks: 0 },
      levels: { name: 'Levels', says: ACCOUNT ? 'Where trades opened and closed' : 'Trendlines, support, resistance, fair value', ind: Object.assign({}, OFF, ACCOUNT ? {} : { ma200: true, sr: true, tl: true, pos: true, fair: true }), tl: 3, lv: 1, words: 0, marks: 1 },
      full: { name: 'Full', says: ACCOUNT ? 'Trades with their results, averages, RSI' : 'Everything: averages, volume, RSI, signals', ind: Object.assign({}, OFF, { ma50: true, ma200: true, vol: true, sr: true, tl: true, sig: true, pos: true, ev: true, rsi: true, rs: true, fair: true }), tl: 6, lv: 2, words: 2, marks: 2 },
    };
    // (the views changed meaning on 21 Nov 2026, Clean became the price alone: every device starts again from Clean, once)
    if (lsGet('sr.chartViewV', 0) !== 2) { lsSet('sr.chartViewV', 2); lsSet('sr.chartView', 'clean'); }
    let view = lsGet('sr.chartView', 'clean'); if (view !== 'custom' && !VIEWS[view]) view = 'clean';
    const detail = () => VIEWS[view] || { tl: 4, lv: 2, words: 2, marks: 2 };
    if (VIEWS[view]) ind = Object.assign({}, ind, VIEWS[view].ind);   // (your own trades on Revolut keep their own switch)
    let trend = null, trendKey = '', trendShown = [], levelsShown = [], hostMarks = [], hostMarkApi = null, marksKey = '';   // the trendlines of every size (a function of what is on screen, from live.js), those this zoom shows, and the levels drawn

    const root = container.appendChild(el('div', 'ch'));
    const slot = root.appendChild(el('div', 'ch-slot'));   // name, price and timeframes, shown in full view
    const tools = root.appendChild(el('div', 'ch-tools'));
    const btn = (k, title) => { const b = tools.appendChild(el('button', 'ch-btn')); b.type = 'button'; b.title = title; b.setAttribute('aria-label', title); b.innerHTML = svg(ICON[k]); b.dataset.k = k; return b; };
    const bCursor = btn('cursor', 'Move and zoom'), bMeasure = btn('measure', 'Measure'), bDraw = btn('draw', 'Draw a line or a zone'); bDraw.setAttribute('aria-expanded', 'false');
    const drawBar = root.appendChild(el('div', 'ch-drawbar')); drawBar.hidden = true; drawBar.setAttribute('role', 'toolbar'); drawBar.setAttribute('aria-label', 'Drawing tools');
    const dbtn = (k, label, title) => { const b = drawBar.appendChild(el('button', 'ch-dbtn')); b.type = 'button'; b.dataset.k = k; b.title = title; b.innerHTML = svg(ICON[k]); b.appendChild(el('span', '', label)); b.setAttribute('aria-pressed', 'false'); return b; };
    dbtn('trend', 'Trend', 'Trend line'); dbtn('ray', 'Ray', 'A line that runs on past its second point'); dbtn('hline', 'Level', 'Horizontal line at a price'); dbtn('vline', 'Date', 'Vertical line on a day'); dbtn('rect', 'Zone', 'A zone between two prices and two days'); dbtn('fib', 'Fibonacci', 'Fibonacci retracement');
    tools.appendChild(el('span', 'ch-sep'));
    const bCompare = opts.onCompare ? btn('compare', 'Compare assets') : null;
    if (bCompare) { bCompare.addEventListener('click', opts.onCompare); bCompare.setAttribute('aria-expanded', 'false'); }
    // your own buys and sells on Revolut, on the chart or not with one tap (shown only when you traded this asset)
    const bMine = btn('mine', 'My trades on Revolut'); bMine.hidden = true; bMine.classList.add('ch-mine');
    bMine.setAttribute('aria-pressed', String(!!ind.mine));
    bMine.addEventListener('click', () => { ind.mine = !ind.mine; lsSet('sr.ind3', ind); bMine.setAttribute('aria-pressed', String(ind.mine)); hint.textContent = ind.mine ? 'Your trades on Revolut: B bought, S sold.' : ''; redraw(); });

    const bInd = btn('ind', 'Indicators'), bUndo = btn('undo', 'Undo last drawing'), bClear = btn('clear', 'Clear drawings'), bFull = btn('full', 'Fullscreen');
    const bClose = el('button', 'ch-close'); bClose.append(el('span', '', '✕'), el('span', 'ch-close-w', ' Close')); bClose.type = 'button'; bClose.setAttribute('aria-label', 'Close the full view'); tools.insertBefore(bClose, tools.firstChild);   // the way back from the full view, always first in the bar
    const hint = root.appendChild(el('div', 'ch-hint', ''));
    const noteEl = root.appendChild(el('div', 'ch-note'));   // in full view: what the tapped line or level is
    const rangeBar = root.appendChild(el('div', 'ch-range')); rangeBar.hidden = true;
    const rangeStatus = rangeBar.appendChild(el('div', 'ch-range-status'));
    const rangeValue = rangeStatus.appendChild(el('b'));
    const rangeDates = rangeStatus.appendChild(el('div'));
    const dateButton = rangeBar.appendChild(el('button', 'ch-dates', 'Dates')); dateButton.type = 'button'; dateButton.setAttribute('aria-expanded', 'false');
    const dateForm = root.appendChild(el('form', 'ch-date-form')); dateForm.hidden = true;
    const dateField = (name) => { const label = dateForm.appendChild(el('label', '', name)); const input = label.appendChild(el('input')); input.type = 'date'; input.required = true; return input; };
    const dateFrom = dateField('Start date'), dateTo = dateField('End date');
    const dateApply = dateForm.appendChild(el('button', 'ch-dates', 'Apply')); dateApply.type = 'submit';
    const dateError = dateForm.appendChild(el('span', 'ch-date-error')); dateError.setAttribute('role', 'status');
    const compareSlot = opts.onCompare ? root.appendChild(el('div', 'ch-compare-slot')) : null;
    if (compareSlot) compareSlot.hidden = true;
    // how much the chart shows: one button beside "Dates" (in the page and in the full view alike, so it never sits on a title),
    // which opens the three views with what each one draws
    const viewButton = rangeBar.insertBefore(el('button', 'ch-viewbtn'), dateButton), viewName = viewButton.appendChild(el('span', 'ch-viewname', '')), viewBtn = {};
    viewButton.type = 'button'; viewButton.setAttribute('aria-haspopup', 'menu'); viewButton.setAttribute('aria-expanded', 'false'); viewButton.insertAdjacentHTML('beforeend', '<svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>');
    const viewMenu = root.appendChild(el('div', 'ch-viewmenu')); viewMenu.hidden = true; viewMenu.setAttribute('role', 'menu'); viewMenu.setAttribute('aria-label', 'How much the chart shows');
    const openViews = (on) => {
      viewMenu.hidden = !on; viewButton.setAttribute('aria-expanded', String(on)); if (!on) return;
      const b = viewButton.getBoundingClientRect(), r = root.getBoundingClientRect(); viewMenu.style.top = Math.round(b.bottom - r.top + 4) + 'px'; viewMenu.style.right = Math.max(0, Math.round(r.right - b.right)) + 'px';
    };
    for (const k of ['clean', 'levels', 'full', 'custom']) {
      const b = viewMenu.appendChild(el('button', 'ch-view')); b.type = 'button'; b.dataset.view = k; b.setAttribute('role', 'menuitemradio');
      b.appendChild(el('b', '', k === 'custom' ? 'Custom' : VIEWS[k].name)); b.appendChild(el('small', '', k === 'custom' ? 'Your own mix of layers' : VIEWS[k].says));
      b.addEventListener('click', () => { setView(k); openViews(false); }); viewBtn[k] = b;
    }
    viewButton.addEventListener('click', () => openViews(viewMenu.hidden));
    const styleRow = viewMenu.appendChild(el('div', 'ch-styles')); styleRow.setAttribute('role', 'group'); styleRow.setAttribute('aria-label', 'How the prices are drawn');
    const styleBtn = {}; for (const [k, label] of STYLES) { const b = styleRow.appendChild(el('button', 'ch-style', label)); b.type = 'button'; b.dataset.style = k; b.addEventListener('click', () => { style = k; lsSet('sr.chartStyle', k); applyStyle(); }); styleBtn[k] = b; }
    const main = root.appendChild(el('div', 'ch-main'));
    const legend = main.appendChild(el('div', 'ch-legend', ''));
    const overlay = main.appendChild(el('div', 'ch-overlay'));
    const readout = main.appendChild(el('div', 'ch-read')); readout.hidden = true; readout.setAttribute('aria-live', 'polite');   // the measure, or the point being placed: at the top, never under the finger
    const editBar = main.appendChild(el('div', 'ch-edit')); editBar.hidden = true; editBar.setAttribute('role', 'toolbar'); editBar.setAttribute('aria-label', 'The selected drawing');
    const ebtn = (k, label) => { const b = editBar.appendChild(el('button', 'ch-ebtn', label)); b.type = 'button'; b.dataset.k = k; return b; };
    const eParallel = ebtn('parallel', 'Parallel'), eColor = ebtn('color', ''), eDash = ebtn('dash', 'Dashed'), eDel = ebtn('delete', 'Delete'), eDone = ebtn('done', 'Done');
    eColor.setAttribute('aria-label', 'Colour'); eColor.title = 'Colour'; eColor.appendChild(el('i', 'ch-swatch'));
    const menu = root.appendChild(el('div', 'ch-menu')); menu.hidden = true;
    const IND_LABEL = { ma20: 'MA 20', ma50: 'MA 50', ma200: 'MA 200', bb: 'Bollinger (20, 2)', rsi: 'RSI (14)', macd: 'MACD (12, 26, 9)', vol: 'Volume', zones: '2-year range bands', fair: 'Fundamental fair value', sr: 'Support, resistance and action levels', tl: 'Trendlines, wedges and gaps', sig: 'Buy and sell entries with their outcome', rs: 'Strength against the S&P 500', pos: 'Your demo trade: entry, stop, target', ev: 'Next results date' };
    for (const k of Object.keys(IND_LABEL)) {
      const lab = menu.appendChild(el('label', 'ch-opt')); const c = lab.appendChild(el('input')); c.type = 'checkbox'; c.checked = !!ind[k]; c.dataset.k = k;
      lab.appendChild(document.createTextNode(' ' + IND_LABEL[k]));
      c.addEventListener('change', () => { ind[k] = c.checked; view = 'custom'; lsSet('sr.chartView', view); lsSet('sr.ind3', ind); syncView(); applyIndicators(); });
    }
    function syncView() {
      for (const q of Object.keys(viewBtn)) viewBtn[q].setAttribute('aria-checked', String(q === view));
      viewBtn.custom.hidden = view !== 'custom'; root.dataset.view = view; viewName.textContent = VIEWS[view] ? VIEWS[view].name : 'Custom'; viewButton.setAttribute('aria-label', 'How much the chart shows: ' + viewName.textContent);
      for (const c of menu.querySelectorAll('input[data-k]')) c.checked = !!ind[c.dataset.k];
    }
    function setView(k) {
      if (k !== 'custom' && !VIEWS[k]) return;
      view = k; lsSet('sr.chartView', k); ind = Object.assign({}, ind, VIEWS[k] ? VIEWS[k].ind : lsGet('sr.ind3', {}));
      syncView(); trendKey = ''; marksKey = ''; applyIndicators();
    }
    syncView();

    const up = css('--av-up', '#089981'), down = css('--av-down', '#f23645');
    // the times under the chart in this device's own time (the library writes UTC); daily and weekly candles keep their calendar date, which is a UTC date
    // (the formatters are made once and kept: the labels are written again on every frame of a drag or a zoom)
    const FMT = new Map(), fmt = (key, o) => { let f = FMT.get(key); if (!f) { f = new Intl.DateTimeFormat([], o); FMT.set(key, f); } return f; };
    function tickText(t, type) {
      const d = new Date(t * 1000), utc = frame.sec >= 86400, o = utc ? { timeZone: 'UTC' } : {}, u = utc ? 'u' : 'l';
      if (type === 0) return fmt('y' + u, { year: 'numeric', ...o }).format(d);
      if (type === 1) return fmt('m' + u, { month: 'short', ...o }).format(d);
      if (type === 2) return fmt('d' + u, { day: 'numeric', ...o }).format(d);
      return fmt(type === 4 ? 's' : 't', { hour: '2-digit', minute: '2-digit', ...(type === 4 ? { second: '2-digit' } : {}) }).format(d);
    }
    const chart = LW().createChart(main, {
      autoSize: true,
      layout: { background: { type: 'solid', color: 'transparent' }, textColor: dark() ? '#a0a6b0' : '#5f6672', fontSize: 11, fontFamily: 'Archivo, system-ui, sans-serif', attributionLogo: true, panes: { separatorColor: dark() ? '#2a2e39' : '#e0e3eb' } },
      grid: { vertLines: { visible: false }, horzLines: { color: dark() ? 'rgba(255,255,255,0.055)' : 'rgba(0,0,0,0.06)' } },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.08, bottom: 0.2 } },
      timeScale: { borderVisible: false, rightOffset: 6, minBarSpacing: 0.2, timeVisible: true, secondsVisible: false, tickMarkFormatter: (t, type) => tickText(t, type) },
      crosshair: { mode: LW().CrosshairMode.Normal, vertLine: { color: dark() ? 'rgba(255,255,255,0.32)' : 'rgba(0,0,0,0.3)', width: 1, style: 3, labelBackgroundColor: dark() ? '#2a2d36' : '#4b5060' }, horzLine: { color: dark() ? 'rgba(255,255,255,0.32)' : 'rgba(0,0,0,0.3)', width: 1, style: 3, labelBackgroundColor: dark() ? '#2a2d36' : '#4b5060' } },
      localization: { timeFormatter: (t) => (frame.sec >= 86400 ? fmt('cd', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : fmt('ct', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })).format(new Date(t * 1000)) },
    });
    const pf = (minMove) => ({ type: 'custom', minMove: minMove || 0.01, formatter: fmtP });   // the prices' own format (each pane its own: a comparison in % keeps its %)
    const candles = chart.addSeries(LW().CandlestickSeries, { upColor: up, downColor: down, borderVisible: false, wickUpColor: up, wickDownColor: down, priceFormat: pf(), priceLineStyle: 3 });
    // the other ways to draw the prices: a series over the candles, which then stay (invisible) so that every line, level and drawing keeps its place
    const styleS = { bars: chart.addSeries(LW().BarSeries, { upColor: up, downColor: down, thinBars: false, priceFormat: pf(), visible: false, priceLineStyle: 3 }), line: chart.addSeries(LW().LineSeries, { color: css('--accent', '#9C8CFF'), lineWidth: 2, priceFormat: pf(), visible: false, crosshairMarkerRadius: 4, priceLineStyle: 3 }),
      area: chart.addSeries(LW().AreaSeries, { lineColor: css('--accent', '#9C8CFF'), topColor: 'rgba(156,140,255,0.28)', bottomColor: 'rgba(156,140,255,0.02)', lineWidth: 2, priceFormat: pf(), visible: false, crosshairMarkerRadius: 4, priceLineStyle: 3 }) };
    const NONE = 'rgba(0,0,0,0)';
    function styleData() { const o = bars.map(({ time, open, high, low, close }) => ({ time, open, high, low, close })), c = bars.map((b) => ({ time: b.time, value: b.close })); styleS.bars.setData(style === 'bars' ? o : []); styleS.line.setData(style === 'line' ? c : []); styleS.area.setData(style === 'area' ? c : []); }
    function applyStyle() {
      const own = style === 'candles' || style === 'hollow';
      candles.applyOptions(own ? { upColor: style === 'hollow' ? NONE : up, downColor: down, borderVisible: style === 'hollow', borderUpColor: up, borderDownColor: down, wickUpColor: up, wickDownColor: down, lastValueVisible: true, priceLineVisible: true }
        : { upColor: NONE, downColor: NONE, borderVisible: false, wickUpColor: NONE, wickDownColor: NONE, lastValueVisible: false, priceLineVisible: false });
      for (const [k, sr] of Object.entries(styleS)) sr.applyOptions({ visible: k === style });
      styleData(); for (const [k, b] of Object.entries(styleBtn || {})) b.setAttribute('aria-pressed', String(k === style)); root.dataset.style = style;
    }
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
    const scale = chart.timeScale(), datesUTC = () => frame.sec >= 86400;
    let rangeFrame = null, compareDataShown = null, compareBaseShown = null;
    const rangeDate = (t) => fmt(datesUTC() ? 'range-day' : 'range-time', datesUTC()
      ? { dateStyle: 'medium', timeZone: 'UTC' } : { dateStyle: 'short', timeStyle: 'short' }).format(new Date(t * 1000));
    function visiblePrices() {
      const visible = scale.getVisibleLogicalRange();
      if (!visible || !bars.length) return null;
      const from = Math.ceil(visible.from), to = Math.floor(visible.to);
      if (from > to) return null;
      const first = candles.dataByIndex(from, LW().MismatchDirection.NearestRight), last = candles.dataByIndex(to, LW().MismatchDirection.NearestLeft);
      return first && last && first.time <= last.time ? { first, last } : null;
    }
    function syncCompareLines(shared) {
      if (!comparison) return;
      const data = comparison.data, base = shared ? shared.first : data.points[0];
      if (data === compareDataShown && base.time === compareBaseShown) return;
      compareDataShown = data; compareBaseShown = base.time;
      const fields = comparison.mode === 'ratio' ? { compRatio: 'ratio' } : { compA: 'a', compB: 'b' };
      for (const [k, field] of Object.entries(fields)) if (S[k]) {
        S[k].setData(data.points.map((p) => p[field] == null ? { time: p.time } : { time: p.time, value: rebase(p[field], base[field]) }));
      }
    }
    function queueRange() {
      if (dead || rangeFrame !== null) return;
      rangeFrame = requestAnimationFrame(() => {
        rangeFrame = null; drawMarks();
        const range = visiblePrices();
        if (rangeBar.hidden === !!bars.length) { rangeBar.hidden = !bars.length; sizeMain(); }
        const moved = range && range.first.time < range.last.time && range.first.close > 0;
        const lab = moved ? (opts.rangeLabel || 'Price change') + ' in view: ' : '', val = moved ? comparePct((range.last.close / range.first.close - 1) * 100) : 'Fewer than two prices in view';
        const dates = moved ? rangeDate(range.first.time) + ' – ' + rangeDate(range.last.time) : '';
        if (rangeValue.textContent !== lab + val) { rangeValue.replaceChildren(); if (lab) rangeValue.appendChild(el('span', 'ch-rl', lab)); rangeValue.appendChild(document.createTextNode(val)); }   // the words apart: a phone's full view leaves them out
        if (rangeDates.textContent !== dates) rangeDates.textContent = dates;
        const shared = comparison && comparisonWindow(comparison.data, range);
        syncCompareLines(shared);
        if (opts.onRange) opts.onRange(shared, range);
      });
    }
    function toggleDates(open) {
      const changed = dateForm.hidden === open;
      dateForm.hidden = !open; dateButton.setAttribute('aria-expanded', String(open)); dateError.textContent = '';
      if (changed) sizeMain();
      if (!open || !bars.length) return;
      const range = visiblePrices(), utc = datesUTC(), min = dateInputValue(bars[0].time, utc), max = dateInputValue(bars[bars.length - 1].time, utc);
      for (const i of [dateFrom, dateTo]) { i.min = min; i.max = max; }
      dateFrom.value = range ? dateInputValue(range.first.time, utc) : min;
      dateTo.value = range ? dateInputValue(range.last.time, utc) : max;
    }
    dateButton.addEventListener('click', () => toggleDates(dateForm.hidden));
    dateForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const from = dateBoundary(dateFrom.value, datesUTC()), to = dateBoundary(dateTo.value, datesUTC(), true);
      if (from >= to) { dateError.textContent = 'Start date must be on or before end date.'; return; }
      const first = bars.find((b) => b.time >= from);
      let i = bars.length - 1; while (i >= 0 && bars[i].time >= to) i--;
      const last = bars[i];
      if (!first || !last || first.time > last.time) { dateError.textContent = 'No prices between these dates.'; return; }
      const a = scale.timeToIndex(first.time, false), b = scale.timeToIndex(last.time, false);
      if (a == null || b == null) return;
      scale.setVisibleLogicalRange({ from: a - 0.15, to: b + 0.15 });
      toggleDates(false); queueRange();
    });

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
    // the chart library answers 0 for an index between two slots, so place such a point between its two neighbours
    const xOf = (t) => { const ts = chart.timeScale(), l = timeToLogical(t), i = Math.floor(l), f = l - i, a = ts.logicalToCoordinate(i); if (!f || a == null) return a; const b2 = ts.logicalToCoordinate(i + 1); return b2 == null ? a : a + f * (b2 - a); };
    const yOf = (p) => candles.priceToCoordinate(p);
    const dayText = (t) => (frame.sec >= 86400 ? fmt('cd', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : fmt('ct', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })).format(new Date(t * 1000));

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
      ctx.font = `${Math.round(fs * r)}px Archivo, system-ui, sans-serif`; ctx.textBaseline = 'alphabetic';
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
      ctx.font = `${Math.round(10 * r)}px Archivo, system-ui, sans-serif`;
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
        // how many, and how: the nearest ones each side of the price (the action levels always); in the Clean view a short mark at
        // the right edge with its price, not a line across the candles
        const D = detail(), nearest = (kind) => near.filter((lv) => lv.kind === kind).slice(0, D.lv);
        levelsShown = D.words >= 2 ? levels : levels.filter((lv) => lv.kind === 'act').concat(nearest('res'), nearest('sup'));
        for (const lv of levelsShown) {
          const y = yOf(lv.p); if (y == null) continue;
          const ly = y, rank = Math.min(12, near.indexOf(lv)), act = lv.kind === 'act', mark = D.words === 0 && !act;   // the nearer to the price, the more important its words
          ctx.strokeStyle = COL[lv.kind] || COL.act; ctx.lineWidth = Math.max(1, (act ? 1.6 : mark ? 1.5 : 1.1) * r);
          ctx.setLineDash(act || mark ? [] : [3 * hr, 3 * hr]);
          ctx.beginPath(); ctx.moveTo(mark ? Math.round(W * 0.72) : 0, Math.round(y * r) + 0.5); ctx.lineTo(W, Math.round(y * r) + 0.5); ctx.stroke();
          const Wc = W / hr, short = `${String(lv.label).split(' + ')[0]} ${fmtP(lv.p)}`;
          ask(mark ? { text: fmtP(lv.p), xs: [[Wc - 8, 'right']], y: ly - 8, color: COL[lv.kind], bg: true, pri: 52 - rank }
            : { text: D.words >= 2 || act ? `${lv.label} ${fmtP(lv.p)}` : short, short, tiny: fmtP(lv.p), xs: [[Wc - 8, 'right'], [8, 'left'], [Wc * 0.55, 'center']], y: ly - 8, color: COL[lv.kind] || COL.act, bg: true, narrowShort: true, pri: (act ? 66 : 52) - rank });
        }
        ctx.setLineDash([]);
      }
      // the demo account's trade on this asset: its entry, stop and target, with its result so far (the result is eToro's)
      if (ind.pos && posn && posn.entry > 0) {
        const Wc = W / hr, up = posn.side > 0, pl = posn.pl, plt = pl == null ? '' : ` · ${pl >= 0 ? '+' : '−'}$${Math.abs(pl).toFixed(2)}`;
        for (const [p, col, dash, txt, sh, pri] of [[posn.entry, 'rgba(41,98,255,0.95)', [], `Demo ${up ? 'buy' : 'short'} ${fmtP(posn.entry)}${plt}`, `Demo ${fmtP(posn.entry)}${plt}`, 88], [posn.stop, 'rgba(220,60,60,0.9)', [5 * hr, 4 * hr], `Stop ${fmtP(posn.stop)}`, `Stop ${fmtP(posn.stop)}`, 86], [posn.target, 'rgba(22,150,70,0.9)', [5 * hr, 4 * hr], `Target ${fmtP(posn.target)}`, `Target ${fmtP(posn.target)}`, 86]]) {
          if (!(p > 0)) continue; const y = yOf(p); if (y == null) continue;
          ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, 1.4 * r); ctx.setLineDash(dash);
          ctx.beginPath(); ctx.moveTo(0, Math.round(y * r) + 0.5); ctx.lineTo(W, Math.round(y * r) + 0.5); ctx.stroke();
          ask({ text: txt, short: sh, tiny: fmtP(p), xs: [[Wc * 0.3, 'center'], [8, 'left'], [Wc - 8, 'right']], y: y - 8, color: col, bg: true, pri });
        }
        ctx.setLineDash([]);
      }
      // dates ahead (the next results): a dotted upright line in the empty slots after the last candle
      if (ind.ev && events.length) {
        for (const e of events) {
          const x = xOf(e.t); if (x == null || !isFinite(x)) continue;
          if (x > W / hr - 4) { ask({ text: `${e.label} →`, short: `${e.short || e.label} →`, tiny: `${e.short || e.label} →`, xs: [[W / hr - 8, 'right']], y: 14, color: 'rgba(126,87,194,1)', bg: true, pri: 70 }); continue; }   // further ahead than the screen shows
          if (x < 0) continue;
          ctx.strokeStyle = 'rgba(126,87,194,0.85)'; ctx.lineWidth = Math.max(1, r); ctx.setLineDash([3 * hr, 3 * hr]);
          ctx.beginPath(); ctx.moveTo(Math.round(x * hr) + 0.5, 0); ctx.lineTo(Math.round(x * hr) + 0.5, sc.bitmapSize.height); ctx.stroke(); ctx.setLineDash([]);
          ask({ text: e.label, short: e.short || e.label, tiny: e.short || e.label, x: x + 4, y: 14, color: 'rgba(126,87,194,1)', bg: true, pri: 70 });
        }
      }
      // The fundamental fair value of the few assets that have one (fair.js): the band from bear to bull and the three lines. A
      // value above or below what the chart shows is said at that edge with an arrow, so the band is never silently missing
      // (Matteo, 22 Nov 2026: "Fair value does not appear on charts"; since build 121 no view had the layer at all).
      if (ind.fair && fair) {
        const Hc = sc.bitmapSize.height / r, y1 = yOf(fair.bull), y2 = yOf(fair.bear);
        if (y1 != null && y2 != null) { ctx.fillStyle = fair.model ? 'rgba(41,98,255,0.04)' : 'rgba(41,98,255,0.07)'; ctx.fillRect(0, Math.round(y1 * r), W, Math.round((y2 - y1) * r)); }
        ctx.strokeStyle = 'rgba(41,98,255,0.75)'; ctx.lineWidth = Math.max(1, r); ctx.setLineDash([6 * hr, 4 * hr]);
        const seen = [];
        const FV = fair.model ? 'Model value, ' : 'Fair value, ', FS = fair.model ? 'Model, ' : 'Fair, ';   // a model value is never written as a study's
        for (const [p, t, k] of [[fair.base, FV + 'base', 'base'], [fair.bear, FV + 'bear', 'bear'], [fair.bull, FV + 'bull', 'bull']]) {
          const y = yOf(p); if (y == null) continue;
          const off = y < 2 ? '↑' : y > Hc - 2 ? '↓' : '', at = off === '↑' ? 9 : off === '↓' ? Hc - 9 : y - 8;
          if (!off) { ctx.beginPath(); ctx.moveTo(0, Math.round(y * r) + 0.5); ctx.lineTo(W, Math.round(y * r) + 0.5); ctx.stroke(); }
          seen.push({ k, p, off });
          ask({ text: `${t} ${fmtP(p)}${off ? ' ' + off : ''}`, short: `${FS}${k} ${fmtP(p)}${off ? ' ' + off : ''}`, tiny: `${fair.model ? 'model ' : ''}${k} ${fmtP(p)}${off ? ' ' + off : ''}`, x: 6, y: at, color: 'rgba(41,98,255,0.95)', bg: true, narrowShort: true, pri: k === 'base' || off ? 64 : 32, must: k === 'base' || !!off });   // the base, and a value off the chart, are always written
        }
        ctx.setLineDash([]);
        root.__fair = seen;   // for the tests
      } else root.__fair = null;
    }
    // the trades a page puts on its chart (an account's value): by the view, none (Clean), the arrows and dots (Levels), or these
    // with their words (Full) where the words have room; the newest first, and more of them as you zoom in
    function drawMarks() {
      if (!hostMarkApi) return;
      const lvl = detail().marks, ts = chart.timeScale(), vr = ts.getVisibleLogicalRange(), W = ts.width() || main.clientWidth;
      const key = !hostMarks.length || !lvl ? 'none' : `${lvl}|${hostMarks.length}|${vr ? Math.round(vr.from) + ':' + Math.round(vr.to) : ''}|${W}`;
      if (key === marksKey) return; marksKey = key;
      if (key === 'none') { hostMarkApi.setMarkers([]); root.dataset.marksShown = '0'; root.dataset.marksWords = '0'; root.__hostMarks = () => []; return; }
      const xs = hostMarks.map((m) => ts.timeToCoordinate(m.time)), seen = xs.filter((x) => x != null && x >= 0 && x <= W).length;
      const size = seen && W / seen < 5 ? 0.5 : seen && W / seen < 11 ? 0.75 : 1;   // many trades on screen: smaller arrows and dots
      const out = hostMarks.map((m) => Object.assign({}, m, { text: '', size })), lanes = {}; let words = 0;
      // a trade's words are written only where nothing else is: inside the plot, clear of the other trades' marks on its side of
      // the candles and of the words already written (the newest first)
      if (lvl >= 2) for (let i = hostMarks.length - 1; i >= 0; i--) {
        const m = hostMarks[i], x = xs[i]; if (!m.text || x == null) continue;
        const w = m.text.length * 6.3 + 6, a = x - w / 2, b = x + w / 2; if (a < 2 || b > W - 2) continue;
        if (hostMarks.some((o, k) => k !== i && o.position === m.position && xs[k] != null && xs[k] !== x && xs[k] > a - 6 && xs[k] < b + 6)) continue;
        if (hostMarks.some((o, k) => k > i && o.text && o.position === m.position && xs[k] === x)) continue;   // several on one candle: one speaks, and it is drawn outermost (below)
        const lane = lanes[m.position] || (lanes[m.position] = []); if (lane.some(([p, q]) => a < q && b > p)) continue;
        lane.push([a, b]); out[i].text = m.text; words++;
      }
      const drawn = out.map((m, i) => ({ x: xs[i], text: m.text, pos: m.position, size: m.size })); root.__hostMarks = () => drawn;   // for the tests
      out.sort((p, q) => p.time - q.time || (p.text ? 1 : 0) - (q.text ? 1 : 0));   // on one candle the mark that speaks goes last: the library stacks them outwards
      hostMarkApi.setMarkers(out); root.dataset.marksShown = String(seen); root.dataset.marksWords = String(words);
    }
    // the trendlines for what is on screen now: asked again when the zoom or the scroll changes (they appear as you zoom in)
    function shownLines() {
      if (!trend || !ind.tl || !bars.length) return (trendShown = []);
      const vr = chart.timeScale().getVisibleLogicalRange(), n = bars.length, from = vr ? Math.max(0, Math.floor(vr.from)) : 0, to = vr ? Math.min(n - 1, Math.ceil(vr.to)) : n - 1;
      const D = detail(), full = D.words >= 2, max = D.tl + (main.clientWidth >= 700 ? 1 : 0), key = `${from}|${to}|${max}|${n}|${full}`;
      if (key !== trendKey) { trendKey = key; try { trendShown = trend(from, to, max, full) || []; } catch (e) { trendShown = []; } root.dataset.lines = String(trendShown.length); }
      return trendShown;
    }
    // where a trend line or a ray is drawn on screen, left to right (a ray runs on to the edge it points to); null if off the chart
    function lineEnds(d, W, H, hr) {
      const x1 = xOf(d.a.t), y1 = yOf(d.a.p), x2 = d.b ? xOf(d.b.t) : null, y2 = d.b ? yOf(d.b.p) : null;
      if (x1 == null || y1 == null || x2 == null || y2 == null) return null;
      let ex = x2, ey = y2;
      if (d.type === 'ray') { if (Math.abs(x2 - x1) > 0.5) { ex = x2 > x1 ? W / hr : 0; ey = y1 + (y2 - y1) * (ex - x1) / (x2 - x1); } else ey = y2 >= y1 ? H : 0; }
      return x1 <= ex ? [[x1, y1], [ex, ey]] : [[ex, ey], [x1, y1]];
    }
    // the lines of one channel: made with Parallel they share d.ch; a parallel from before the link (build 163) has its line's
    // two days exactly, which is how it is still recognised
    // a channel's lines stay parallel (Matteo, 28 Nov 2026, 08:44: "as i drag one of its two extremes up or down, the other extreme
    // should go up or down the same way to guarantee that the line continues to be parallel"): the channel's first line leads (its
    // ends move freely, and its parallels follow it at their distance); a parallel only moves up or down, both ends together, at
    // the first line's days. All in screen space, like Parallel itself, so a channel stays parallel on a log scale too.
    const yAtX = (d, x) => { const x1 = xOf(d.a.t), y1 = yOf(d.a.p), x2 = xOf(d.b.t), y2 = yOf(d.b.p); if (x1 == null || y1 == null || x2 == null || y2 == null) return null; return Math.abs(x2 - x1) < 0.5 ? (y1 + y2) / 2 : y1 + (y2 - y1) * (x - x1) / (x2 - x1); };
    function offsetOf(base, d) {   // how far below (+) or above (−) the first line a parallel lies, in pixels (the mean of both ends)
      const xa = xOf(base.a.t), xb = xOf(base.b.t), ya = yOf(base.a.p), yb = yOf(base.b.p); if ([xa, xb, ya, yb].some((v) => v == null)) return null;
      const oa = yAtX(d, xa), ob = yAtX(d, xb); return oa == null || ob == null ? null : ((oa - ya) + (ob - yb)) / 2;
    }
    function place(base, d, off) {   // a parallel at that distance from the first line, at its days
      const xa = xOf(base.a.t), xb = xOf(base.b.t), ya = yOf(base.a.p), yb = yOf(base.b.p); if ([xa, xb, ya, yb].some((v) => v == null)) return;
      const pa = ptXY(xa, ya + off), pb = ptXY(xb, yb + off); if (!pa || !pb) return;
      d.a = { t: base.a.t, p: pa.p }; d.b = { t: base.b.t, p: pb.p };
    }
    function chanOf(i) {   // at a drag's start: the channel of drawing i, its first line and each parallel's distance
      const ids = channels().find((v) => v.includes(i)); if (!ids) return null;
      const lead = Math.min(...ids), base = drawings[lead], g = base.ch || Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      for (const j of ids) drawings[j].ch = g;   // a channel from before the link (build 163): linked now
      const offs = new Map(); for (const j of ids) if (j !== lead) { const o = offsetOf(base, drawings[j]); if (o != null) offs.set(j, o); }
      return { lead, offs };
    }
    function follow(c) { const base = drawings[c.lead]; for (const [j, o] of c.offs) if (drawings[j]) place(base, drawings[j], o); }
    function channels() {
      const g = new Map();
      drawings.forEach((d, i) => {
        if (!(d.type === 'trend' || d.type === 'ray') || !d.b) return;
        const k = d.ch ? 'c' + d.ch : `t${d.type}|${d.a.t}|${d.b.t}`;
        if (!g.has(k)) g.set(k, []); g.get(k).push(i);
      });
      return [...g.values()].filter((v) => v.length > 1);
    }
    let bandsDrawn = [];
    // each channel's lines from top to bottom (at the middle of their span), and the band between each line and the next one,
    // in the colour of the channel's first line, see-through
    function drawChannels(ctx, W, H, hr, r) {
      const out = [];
      for (const ids of channels()) {
        const lines = ids.map((i) => ({ i, e: lineEnds(drawings[i], W, H, hr) })).filter((l) => l.e);
        const mid = (e) => (e[0][1] + e[1][1]) / 2;
        lines.sort((u, v) => mid(u.e) - mid(v.e));
        const col = drawings[Math.min(...ids)].color || DCOL[0];
        for (let k = 0; k + 1 < lines.length; k++) {
          const A = lines[k].e, B = lines[k + 1].e;
          ctx.globalAlpha = 0.15; ctx.fillStyle = col; ctx.beginPath();
          ctx.moveTo(A[0][0] * hr, A[0][1] * r); ctx.lineTo(A[1][0] * hr, A[1][1] * r); ctx.lineTo(B[1][0] * hr, B[1][1] * r); ctx.lineTo(B[0][0] * hr, B[0][1] * r);
          ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
          out.push({ lines: [lines[k].i, lines[k + 1].i], color: col, pts: [A[0], A[1], B[1], B[0]] });
        }
      }
      return out;
    }
    function drawShapes(sc) {
      const ctx = sc.context, W = sc.bitmapSize.width, r = sc.verticalPixelRatio, hr = sc.horizontalPixelRatio;
      ctx.font = `${Math.round(10.5 * r)}px Archivo, system-ui, sans-serif`; ctx.lineWidth = Math.max(1, 1.3 * r);
      const WORDS = detail().words;
      if (ind.tl) for (const d of autos.concat(shownLines())) {   // the edges of a wedge or triangle, the trendlines this zoom shows (each runs 40 bars past the last candle) and unfilled gaps
        if (d.type === 'box' && WORDS < 2) continue;   // gaps: in the Full view
        const x1 = xOf(d.a.t), y1 = yOf(d.a.p), x2 = xOf(d.b.t), y2 = yOf(d.b.p); if (x1 == null || y1 == null || x2 == null || y2 == null) continue;
        const col = d.kind === 'res' ? '#d64545' : d.kind === 'sup' ? '#1f9d55' : '#8a8f98', xEdge = W / hr;
        const xLast = bars.length ? xOf(bars[bars.length - 1].time) : null, sp = chart.timeScale().options().barSpacing || 6;
        const xe = d.type === 'line' && xLast != null ? Math.min(xEdge, xLast + 40 * sp) : xEdge;   // a line runs 40 bars past the last candle, not to infinity
        if (d.type === 'line' && x2 !== x1) {
          // a broken line is dashed and paler; a line that meets another level today is heavier (Full view: with a ring where they meet)
          ctx.strokeStyle = col; ctx.globalAlpha = d.broken ? 0.7 : 1; ctx.setLineDash(d.broken ? [7 * hr, 4 * hr] : []);
          ctx.lineWidth = Math.max(1, (d.agree && WORDS >= 2 ? 2.4 : d.major ? 1.9 : 1.4) * r); ctx.beginPath(); ctx.moveTo(x1 * hr, y1 * r); ctx.lineTo(xe * hr, (y1 + (y2 - y1) * (xe - x1) / (x2 - x1)) * r); ctx.stroke(); ctx.setLineDash([]);
          if (d.agree && WORDS >= 2 && xLast != null && xLast > x1) { const yl = y1 + (y2 - y1) * (xLast - x1) / (x2 - x1); ctx.beginPath(); ctx.arc(xLast * hr, yl * r, 6 * r, 0, 7); ctx.lineWidth = Math.max(1, 1.6 * r); ctx.stroke(); }   // ring: where the line meets another level today
          if (WORDS >= 1) for (const q of d.pts || []) { const qx = xOf(q.t), qy = yOf(q.p); if (qx == null || qy == null) continue; ctx.beginPath(); ctx.arc(qx * hr, qy * r, 2.6 * r, 0, 7); ctx.fillStyle = col; ctx.fill(); }   // where the price met the line
          ctx.globalAlpha = 1;
          if (d.tag) {   // what the line is and its value today, at its right end (Clean: the value alone)
            const ye = y1 + (y2 - y1) * (xe - x1) / (x2 - x1), v = priceOf(d.tag), word = String(d.tag).split(' ')[0], short = v ? `${word === 'support' ? 'sup.' : word === 'resistance' ? 'res.' : word} ${v}` : null;
            ask({ text: WORDS >= 2 ? d.tag : WORDS === 1 ? short || d.tag : v || d.tag, short: WORDS >= 2 ? short : v || null, tiny: v || null, x: xe - 3, align: 'right', y: ye, pill: col, pri: d.agree ? 72 : d.major ? 62 : 56 });
          }
        } else if (d.type === 'box') {
          ctx.fillStyle = 'rgba(138,143,152,0.18)'; ctx.fillRect(x1 * hr, Math.min(y1, y2) * r, (xe - x1) * hr, Math.max(1, Math.abs(y2 - y1) * r));
          ask({ text: 'gap', x: x1 + 4, y: Math.min(y1, y2) - 8, color: '#8a8f98', pri: 15 });
        }
      }
      mineDrawn = 0;
      if (ind.mine && detail().marks && mine.length && bars.length) {   // your own trades on Revolut: a round B (bought) or S (sold) on the candle you traded in,
        const CB = '#2962ff', CS = '#f57c00';          // at your price when the chart is that very asset, at the candle's edge when it is the one your fund or coin follows
        const at = (t) => { let lo = 0, hi = bars.length - 1; if (t < bars[0].time) return null; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (bars[m].time <= t) lo = m; else hi = m - 1; } return bars[lo]; };
        for (const m of mine) {
          const bar = at(m.t); if (!bar || (bar === bars[bars.length - 1] && m.t - bar.time > 2 * (frame.sec || 86400))) continue;
          const x = xOf(bar.time); if (x == null) continue;
          const d = m.side === 'B' ? 1 : -1; let y = m.onChart && m.p > 0 ? yOf(m.p) : null;
          if (y == null) { const yb = yOf(d > 0 ? bar.low : bar.high); if (yb == null) continue; y = yb + d * 13; }
          const col = d > 0 ? CB : CS, rr = 6.5;
          ctx.beginPath(); ctx.arc(x * hr, y * r, rr * r, 0, 7); ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = dark() ? '#16181e' : '#fff'; ctx.lineWidth = Math.max(1, 1.2 * r); ctx.stroke();
          ctx.fillStyle = '#fff'; ctx.font = `600 ${Math.round(8.5 * r)}px Archivo, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(m.side, x * hr, y * r + 0.5 * r);
          ask({ text: m.label, short: m.short, x, align: 'center', y: y + d * 15, color: col, pri: 66 });
          mineDrawn++;
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
          if (m.tag && recent && sp >= 3 && WORDS >= 1) { const res = (String(m.tag).match(/[✓✗✕×]?\s*[+−-][\d.,]+%$/) || [''])[0]; ask({ text: m.tag, short: `${String(m.tag).split(' · ')[0]}${res ? ' ' + res : ''}`, x, align: 'center', y: y0 + d * (s * 1.5 + 11), color: col, bg: true, narrowShort: true, pri: 80 - (marks.length - 1 - k) }); }
        });
      }
      ctx.lineWidth = Math.max(1, 1.3 * r);
      const H = sc.bitmapSize.height / r; paneH = H;   // the price pane's height in CSS px (the grips and the hit tests use the same)
      const all = drawings.map((d, i) => [d, i]).concat(draft && draft.type !== 'measure' ? [[draft, -1]] : []);
      bandsDrawn = drawChannels(ctx, W, H, hr, r);   // a parallel and its line: the space between them filled in see-through colour, under the lines
      for (const [d, i] of all) {
        const col = d.color || DCOL[0], on = i === sel, x1 = xOf(d.a.t), y1 = yOf(d.a.p), x2 = d.b ? xOf(d.b.t) : null, y2 = d.b ? yOf(d.b.p) : null;
        ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = Math.max(1, (on ? 2.2 : 1.5) * r); ctx.setLineDash(d.dash ? [7 * hr, 5 * hr] : []);
        if (d.type === 'hline') { if (y1 == null) continue; ctx.beginPath(); ctx.moveTo(0, y1 * r); ctx.lineTo(W, y1 * r); ctx.stroke(); ctx.setLineDash([]); ask({ text: fmtP(d.a.p), x: W / hr - 4, align: 'right', y: y1 - 8, color: col, bg: true, pri: 90, must: true }); }
        else if (d.type === 'vline') { if (x1 == null) continue; ctx.beginPath(); ctx.moveTo(x1 * hr, 0); ctx.lineTo(x1 * hr, H * r); ctx.stroke(); ctx.setLineDash([]); ask({ text: dayText(d.a.t), x: x1 + 4, y: 26, color: col, bg: true, pri: 90, must: true }); }
        else if ((d.type === 'trend' || d.type === 'ray') && x1 != null && y1 != null && x2 != null && y2 != null) {
          let ex = x2, ey = y2;
          if (d.type === 'ray') { if (Math.abs(x2 - x1) > 0.5) { ex = x2 > x1 ? W / hr : 0; ey = y1 + (y2 - y1) * (ex - x1) / (x2 - x1); } else ey = y2 >= y1 ? H : 0; }
          ctx.beginPath(); ctx.moveTo(x1 * hr, y1 * r); ctx.lineTo(ex * hr, ey * r); ctx.stroke(); ctx.setLineDash([]);
          if (!on) for (const [x, y] of [[x1, y1], [x2, y2]]) { ctx.beginPath(); ctx.arc(x * hr, y * r, 2.6 * r, 0, 7); ctx.fill(); }
        } else if (d.type === 'rect' && x1 != null && y1 != null && x2 != null && y2 != null) {
          const L = Math.min(x1, x2) * hr, T = Math.min(y1, y2) * r, w = Math.abs(x2 - x1) * hr, h = Math.abs(y2 - y1) * r;
          ctx.globalAlpha = 0.14; ctx.fillRect(L, T, w, h); ctx.globalAlpha = 1; ctx.strokeRect(L, T, w, h); ctx.setLineDash([]);
        } else if (d.type === 'fib' && x1 != null && y1 != null && x2 != null && y2 != null) {
          ctx.setLineDash([]); const left = Math.min(x1, x2) * hr;
          FIB.forEach((lv, k) => {
            const p = d.b.p - (d.b.p - d.a.p) * lv, y = yOf(p); if (y == null) return;
            const next = k < FIB.length - 1 ? yOf(d.b.p - (d.b.p - d.a.p) * FIB[k + 1]) : null;
            if (next != null) { ctx.fillStyle = FIB_COLORS[k] + '14'; ctx.fillRect(left, Math.min(y, next) * r, W - left, Math.abs(next - y) * r); }
            ctx.strokeStyle = FIB_COLORS[k]; ctx.lineWidth = Math.max(1, 1.3 * r); ctx.beginPath(); ctx.moveTo(left, y * r); ctx.lineTo(W, y * r); ctx.stroke();
            ask({ text: `${lv} (${fmtP(p)})`, short: String(lv), x: left / hr + 4, y: y - 7, color: FIB_COLORS[k], bg: true, pri: 40 });
          });
          ctx.setLineDash([4 * hr, 4 * hr]); ctx.strokeStyle = '#787b86'; ctx.beginPath(); ctx.moveTo(x1 * hr, y1 * r); ctx.lineTo(x2 * hr, y2 * r); ctx.stroke();
        }
        ctx.setLineDash([]);
        if (i === -1) for (const [x, y] of [[x1, y1], [x2, y2]]) if (x != null && y != null) { ctx.beginPath(); ctx.arc(x * hr, y * r, 4 * r, 0, 7); ctx.fillStyle = col; ctx.fill(); }   // a drawing being placed: its points
        if (on) grips(sc, gripsOf(d), col);
      }
      const m = draft && draft.type === 'measure' ? draft : measure;
      if (m && m.b) {
        const x1 = xOf(m.a.t), y1 = yOf(m.a.p), x2 = xOf(m.b.t), y2 = yOf(m.b.p);
        if (x1 != null && y1 != null && x2 != null && y2 != null) {
          const upm = m.b.p >= m.a.p, colm = upm ? '#22C55E' : '#EF4444';
          ctx.globalAlpha = 0.16; ctx.fillStyle = colm; ctx.fillRect(Math.min(x1, x2) * hr, Math.min(y1, y2) * r, Math.abs(x2 - x1) * hr, Math.abs(y2 - y1) * r); ctx.globalAlpha = 1;
          ctx.strokeStyle = colm; ctx.lineWidth = Math.max(1, 1.5 * r); ctx.beginPath(); ctx.moveTo(x1 * hr, y1 * r); ctx.lineTo(x2 * hr, y2 * r); ctx.stroke();
          for (const [x, y] of [[x1, y1], [x2, y2]]) { ctx.beginPath(); ctx.arc(x * hr, y * r, 3.5 * r, 0, 7); ctx.fillStyle = colm; ctx.fill(); }
          if (sel === 'm') grips(sc, gripsOf({ ...m, type: 'trend' }), colm);
          if (sel !== 'm' && m !== draft) ask({ text: measureText(m, true), x: Math.max(x1, x2) + 6, y: upm ? Math.min(y1, y2) - 8 : Math.max(y1, y2) + 12, color: colm, bg: true, pri: 85 });   // left on the chart: its figure beside it
        }
      }
      if (guide) {   // the point being placed or moved: a crosshair through it, with its price at the right
        ctx.setLineDash([3 * hr, 3 * hr]); ctx.strokeStyle = dark() ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.55)'; ctx.lineWidth = Math.max(1, r);
        ctx.beginPath(); ctx.moveTo(0, guide.y * r); ctx.lineTo(W, guide.y * r); ctx.moveTo(guide.x * hr, 0); ctx.lineTo(guide.x * hr, H * r); ctx.stroke(); ctx.setLineDash([]);
        ctx.beginPath(); ctx.arc(guide.x * hr, guide.y * r, 5 * r, 0, 7); ctx.strokeStyle = css('--accent', '#9C8CFF'); ctx.lineWidth = 2 * r; ctx.stroke();
        ask({ text: fmtP(guide.p), x: W / hr - 4, align: 'right', y: guide.y - 8, color: dark() ? '#ffffff' : '#111111', bg: true, pri: 99, must: true });
      }
      layout(sc);
    }
    const knob = (g) => ({ x: g.x, y: g.y + (g.y > paneH - 60 ? -38 : 38) });
    function grips(sc, list, col) {
      const ctx = sc.context, r = sc.verticalPixelRatio, hr = sc.horizontalPixelRatio, bg = dark() ? '#0e0f13' : '#ffffff';
      for (const g of list) {
        const k = knob(g); ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, r); ctx.beginPath(); ctx.moveTo(g.x * hr, g.y * r); ctx.lineTo(k.x * hr, k.y * r); ctx.stroke();
        ctx.beginPath(); ctx.arc(k.x * hr, k.y * r, 10 * r, 0, 7); ctx.fillStyle = col; ctx.globalAlpha = 0.92; ctx.fill(); ctx.globalAlpha = 1;
        ctx.beginPath(); ctx.arc(k.x * hr, k.y * r, 3 * r, 0, 7); ctx.fillStyle = bg; ctx.fill();
        ctx.beginPath(); ctx.arc(g.x * hr, g.y * r, 5.5 * r, 0, 7); ctx.fillStyle = bg; ctx.fill(); ctx.lineWidth = 2 * r; ctx.strokeStyle = col; ctx.stroke();
      }
    }
    function roundRect(ctx, x, y, w, h, rad) { ctx.beginPath(); ctx.moveTo(x + rad, y); ctx.arcTo(x + w, y, x + w, y + h, rad); ctx.arcTo(x + w, y + h, x, y + h, rad); ctx.arcTo(x, y + h, x, y, rad); ctx.arcTo(x, y, x + w, y, rad); ctx.closePath(); }

    // ---- drawing, made for a finger (Matteo, 28 Nov 2026: "using a finger on the phone to drag ... the finger itself covers the
    // starting and the end point"; "when I draw a line on the chart, I would like to move it and change its extremes, or generate a
    // parallel"). With a finger the point being placed sits LIFT px above it, with a crosshair and its price, and the readout at the
    // top says where it is: a tap places a point, a second tap the other end (a mouse may also drag). A drawing is selected by a tap:
    // its ends get grips set below them (the finger holds the knob, the point stays in view), its body moves the whole of it, and a
    // bar offers a parallel copy, a colour, dashes and delete. Everything is undone step by step (hist).
    const LIFT = 56, ONE = { hline: 1, vline: 1 };
    const HINTS = { measure: 'Tap the start, then the end.', fib: 'Tap a low, then a high (or a high, then a low).', trend: 'Tap the start, then the end.', ray: 'Tap the start, then a second point: the line runs on past it.', rect: 'Tap one corner, then the opposite one.', hline: 'Tap the price for the line.', vline: 'Tap the day for the line.' };
    const local = (ev) => { const rc = overlay.getBoundingClientRect(); return { x: ev.clientX - rc.left, y: ev.clientY - rc.top }; };
    const ptXY = (x, y) => { const l = chart.timeScale().coordinateToLogical(x), p = candles.coordinateToPrice(y); if (l == null || p == null) return null; return { t: Math.round(logicalToTime(l)), p }; };
    const lifted = (ev) => { const q = local(ev), up = ev.pointerType === 'mouse' ? 0 : LIFT; return { x: q.x, y: Math.max(4, Math.min(paneH - 2, q.y - up)) }; };
    const snap = () => { hist.push(JSON.stringify({ d: drawings, m: measure })); if (hist.length > 40) hist.shift(); };
    function setMode() {
      const on = tool !== 'cursor' || sel != null; overlay.style.pointerEvents = on ? 'auto' : 'none'; overlay.style.cursor = tool !== 'cursor' ? 'crosshair' : on ? 'grab' : '';
      chart.applyOptions({ handleScroll: !on, handleScale: !on }); root.dataset.edit = sel == null ? '' : String(sel);
    }
    function openDraw(on) { drawBar.hidden = !on; bDraw.setAttribute('aria-expanded', String(on)); bDraw.setAttribute('aria-pressed', String(on || (tool !== 'cursor' && tool !== 'measure'))); }
    function setTool(t) {
      tool = t; draft = null; guide = null; if (t !== 'cursor') { sel = null; editBar.hidden = true; }
      bCursor.setAttribute('aria-pressed', String(t === 'cursor')); bMeasure.setAttribute('aria-pressed', String(t === 'measure'));
      for (const b of drawBar.querySelectorAll('.ch-dbtn')) b.setAttribute('aria-pressed', String(b.dataset.k === t));
      bDraw.setAttribute('aria-pressed', String(!drawBar.hidden || (t !== 'cursor' && t !== 'measure')));
      hint.textContent = HINTS[t] || ''; hint.hidden = t === 'cursor'; root.dataset.tool = t;
      setMode(); showRead(); redraw();
    }
    function select(i) {
      sel = i; const d = typeof i === 'number' ? drawings[i] : null;
      editBar.hidden = i == null; eParallel.hidden = !(d && (d.type === 'trend' || d.type === 'ray')); eColor.hidden = !d; eDash.hidden = !d || d.type === 'fib';
      if (d) { editBar.querySelector('.ch-swatch').style.background = d.color || DCOL[0]; eDash.setAttribute('aria-pressed', String(!!d.dash)); }
      setMode(); showRead(); redraw();
    }
    function measureText(m, short) {
      const dp = m.b.p - m.a.p, pct = m.a.p ? dp / m.a.p : 0, nb = Math.round(timeToLogical(m.b.t) - timeToLogical(m.a.t)), days = Math.abs(m.b.t - m.a.t) / 86400, s1 = dp >= 0 ? '+' : '−';
      const span = `${Math.abs(nb)} bar${Math.abs(nb) === 1 ? '' : 's'}, ${days >= 1 ? Math.round(days) + (short ? 'd' : ' days') : Math.round(days * 24) + ' h'}`;
      return short ? `${s1}${(Math.abs(pct) * 100).toFixed(2)}% · ${span}` : `${s1}${fmtP(Math.abs(dp))}   ${s1}${(Math.abs(pct) * 100).toFixed(2)}%   ·   ${span}`;
    }
    function showRead() {
      const m = draft && draft.type === 'measure' ? draft : sel === 'm' || (tool === 'measure' && measure) ? measure : null;
      let txt = '', cls = '';
      if (m && m.b && (m.b.t !== m.a.t || m.b.p !== m.a.p)) { txt = measureText(m); cls = m.b.p >= m.a.p ? ' is-up' : ' is-down'; }
      else if (guide) txt = `${fmtP(guide.p)}   ·   ${dayText(guide.t)}`;
      else if (draft && draft.stage === 'wait') txt = 'Now the other end';
      readout.hidden = !txt; readout.textContent = txt; readout.className = 'ch-read' + cls;
    }
    function gripsOf(d) {   // the points that can be dragged, in CSS px
      if (d.type === 'hline') { const y = yOf(d.a.p); return y == null ? [] : [{ k: 'a', x: overlay.clientWidth * 0.5, y }]; }
      if (d.type === 'vline') { const x = xOf(d.a.t); return x == null ? [] : [{ k: 'a', x, y: paneH * 0.5 }]; }
      const out = []; for (const k of ['a', 'b']) { const x = xOf(d[k].t), y = yOf(d[k].p); if (x != null && y != null) out.push({ k, x, y }); } return out;
    }
    function segDist(px, py, x1, y1, x2, y2, ray) { const dx = x2 - x1, dy = y2 - y1, L = dx * dx + dy * dy; let u = L ? ((px - x1) * dx + (py - y1) * dy) / L : 0; u = ray ? Math.max(0, u) : Math.max(0, Math.min(1, u)); return Math.hypot(px - (x1 + u * dx), py - (y1 + u * dy)); }
    function near(d, x, y) {   // how far a point is from a drawing (CSS px); Infinity when it is off it
      if (d.type === 'hline') { const y1 = yOf(d.a.p); return y1 == null ? Infinity : Math.abs(y - y1); }
      if (d.type === 'vline') { const x1 = xOf(d.a.t); return x1 == null || y > paneH ? Infinity : Math.abs(x - x1); }
      const x1 = xOf(d.a.t), y1 = yOf(d.a.p), x2 = xOf(d.b.t), y2 = yOf(d.b.p); if (x1 == null || y1 == null || x2 == null || y2 == null) return Infinity;
      if (d.type === 'trend' || d.type === 'ray') return segDist(x, y, x1, y1, x2, y2, d.type === 'ray');
      const l = Math.min(x1, x2), rr = Math.max(x1, x2), t = Math.min(y1, y2), bt = Math.max(y1, y2);
      if (d.type === 'fib') return x >= l - 8 && y >= t - 8 && y <= bt + 8 ? 0 : Infinity;
      return x >= l - 8 && x <= rr + 8 && y >= t - 8 && y <= bt + 8 ? 0 : Infinity;   // a zone, and the measure's box
    }
    function hitAt(x, y) {   // the drawing a tap at x, y touches: the nearest within 16 px (the measure: inside its box)
      let best = null, bd = 16;
      drawings.forEach((d, i) => { const k = near(d, x, y); if (k < bd) { bd = k; best = i; } });
      if (best == null && measure && measure.b && near({ ...measure, type: 'rect' }, x, y) === 0) best = 'm';
      return best;
    }
    function finish() {
      const d = draft; draft = null; guide = null;
      if (d.type === 'measure') { snap(); measure = { a: d.a, b: d.b }; setTool('cursor'); select('m'); return; }
      snap(); const nd = { type: d.type, a: d.a, color: d.color }; if (!ONE[d.type]) nd.b = d.b;
      drawings.push(nd); save(); setTool('cursor'); openDraw(false); select(drawings.length - 1);
    }
    let downAt = null;
    overlay.addEventListener('pointerdown', (ev) => {
      const q = local(ev); ev.preventDefault(); try { overlay.setPointerCapture(ev.pointerId); } catch (e) { /* a synthetic event */ }
      downAt = { x: q.x, y: q.y, mouse: ev.pointerType === 'mouse' };
      if (tool !== 'cursor') {
        const L = lifted(ev), pt = ptXY(L.x, L.y); if (!pt) return; guide = { ...L, ...pt };
        if (!draft) { draft = { type: tool, a: pt, b: pt, color: lastColor, stage: ONE[tool] ? 'one' : 'a' }; if (tool === 'measure') { sel = null; measure = null; } }
        else if (draft.stage === 'wait') { draft.b = pt; draft.stage = 'b'; }
        showRead(); redraw(); return;
      }
      const d = typeof sel === 'number' ? drawings[sel] : sel === 'm' ? measure : null;
      if (d) {
        for (const g of (sel === 'm' ? gripsOf({ ...measure, type: 'trend' }) : gripsOf(d))) {
          const k = knob(g);
          if (Math.hypot(q.x - k.x, q.y - k.y) <= 26 || Math.hypot(q.x - g.x, q.y - g.y) <= 14) { snap(); drag = { kind: 'end', k: g.k, off: { x: g.x - q.x, y: g.y - q.y }, y0: g.y, ch: typeof sel === 'number' ? chanOf(sel) : null }; return; }
        }
        if (near(sel === 'm' ? { ...measure, type: 'rect' } : d, q.x, q.y) <= 16) { snap(); drag = { kind: 'body', start: q, orig: JSON.parse(JSON.stringify(d)), ch: typeof sel === 'number' ? chanOf(sel) : null }; return; }
      }
      const other = hitAt(q.x, q.y);
      select(other != null && other !== sel ? other : null);   // another drawing: selected at once; nothing: the edit ends
    });
    overlay.addEventListener('pointermove', (ev) => {
      if (!downAt) return;
      const q = local(ev);
      if (tool !== 'cursor' && draft) {
        const L = lifted(ev), pt = ptXY(L.x, L.y); if (!pt) return; guide = { ...L, ...pt };
        if (draft.stage === 'one') draft.a = draft.b = pt;
        else if (draft.stage === 'a') { if (!downAt.mouse) { draft.a = draft.b = pt; } else if (Math.hypot(q.x - downAt.x, q.y - downAt.y) > 8) { draft.b = pt; draft.stage = 'drag'; } }
        else if (draft.stage === 'drag' || draft.stage === 'b') draft.b = pt;
        showRead(); redraw(); return;
      }
      if (!drag) return;
      const d = typeof sel === 'number' ? drawings[sel] : measure; if (!d) return;
      const c = drag.ch, par = c && sel !== c.lead && c.offs.has(sel);
      if (par) {   // a parallel: up or down only, both ends together, by what the finger moved up or down
        const dy = drag.kind === 'end' ? q.y + drag.off.y - drag.y0 : q.y - drag.start.y;
        place(drawings[c.lead], d, c.offs.get(sel) + dy);
        const y = yAtX(d, xOf(d[drag.k || 'a'].t)), x = xOf(d[drag.k || 'a'].t); guide = drag.kind === 'end' && x != null && y != null ? { x, y, ...ptXY(x, y) } : null;
        showRead(); redraw(); return;
      }
      if (drag.kind === 'end') {
        const x = q.x + drag.off.x, y = q.y + drag.off.y, pt = ptXY(x, y); if (!pt) return;
        if (d.type === 'hline') d.a.p = pt.p; else if (d.type === 'vline') d.a.t = pt.t; else d[drag.k] = pt;
        guide = { x, y, ...pt };
      } else {
        const dx = q.x - drag.start.x, dy = q.y - drag.start.y, o = drag.orig;
        for (const k of ['a', 'b']) if (o[k]) { const x = xOf(o[k].t), y = yOf(o[k].p); if (x == null || y == null) continue; const pt = ptXY(x + (d.type === 'hline' ? 0 : dx), y + (d.type === 'vline' ? 0 : dy)); if (pt) d[k] = { t: d.type === 'hline' ? o[k].t : pt.t, p: d.type === 'vline' ? o[k].p : pt.p }; }
      }
      if (c) follow(c);   // the first line of a channel: its parallels come with it
      showRead(); redraw();
    });
    const lift = (ev) => {
      if (!downAt) return; downAt = null;
      if (tool !== 'cursor' && draft) {
        if (draft.stage === 'one') { finish(); return; }
        if (draft.stage === 'a') { draft.stage = 'wait'; guide = null; hint.textContent = tool === 'rect' ? 'Now tap the opposite corner.' : 'Now tap the other end.'; showRead(); redraw(); return; }
        const far = Math.hypot((xOf(draft.b.t) || 0) - (xOf(draft.a.t) || 0), (yOf(draft.b.p) || 0) - (yOf(draft.a.p) || 0)) > 6;
        if (far) finish(); else { draft.stage = 'wait'; guide = null; showRead(); redraw(); }
        return;
      }
      if (drag) { drag = null; guide = null; save(); showRead(); redraw(); }
    };
    overlay.addEventListener('pointerup', lift);
    overlay.addEventListener('pointercancel', () => { downAt = null; if (drag) { const s0 = hist.pop(); if (s0) { const o = JSON.parse(s0); drawings = o.d; measure = o.m; } drag = null; } guide = null; showRead(); redraw(); });
    function save() { lsSet(key, drawings.slice(-60)); }
    bCursor.addEventListener('click', () => { openDraw(false); setTool('cursor'); select(null); });
    bMeasure.addEventListener('click', () => { openDraw(false); setTool(tool === 'measure' ? 'cursor' : 'measure'); });
    bDraw.addEventListener('click', () => { const on = drawBar.hidden; openDraw(on); if (!on && tool !== 'measure' && tool !== 'cursor') setTool('cursor'); });
    for (const b of drawBar.querySelectorAll('.ch-dbtn')) b.addEventListener('click', () => setTool(tool === b.dataset.k ? 'cursor' : b.dataset.k));
    eDone.addEventListener('click', () => select(null));
    eDel.addEventListener('click', () => { snap(); if (sel === 'm') measure = null; else if (typeof sel === 'number') { drawings.splice(sel, 1); save(); } select(null); });
    eColor.addEventListener('click', () => { const d = drawings[sel]; if (!d) return; snap(); d.color = DCOL[(DCOL.indexOf(d.color || DCOL[0]) + 1) % DCOL.length]; lastColor = d.color; save(); select(sel); });
    eDash.addEventListener('click', () => { const d = drawings[sel]; if (!d) return; snap(); d.dash = !d.dash; save(); select(sel); });
    // a parallel: the same line, set a step above or below (where there is room); it is selected, ready to be moved where you want it
    eParallel.addEventListener('click', () => {
      const d = drawings[sel]; if (!d || !(d.type === 'trend' || d.type === 'ray')) return;
      const ya = yOf(d.a.p), yb = yOf(d.b.p); if (ya == null || yb == null) return;
      const off = (Math.max(ya, yb) < paneH * 0.6 ? 1 : -1) * Math.max(30, paneH * 0.12), pa = candles.coordinateToPrice(ya + off), pb = candles.coordinateToPrice(yb + off); if (pa == null || pb == null) return;
      snap(); if (!d.ch) d.ch = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);   // the link: the band between them is filled
      drawings.push({ ...d, a: { t: d.a.t, p: pa }, b: { t: d.b.t, p: pb } }); save(); select(drawings.length - 1);
    });
    // tap a level or a trendline to see what it is made of
    chart.subscribeClick((ev) => {
      if (ev && ev.point && tool === 'cursor') { const h = hitAt(ev.point.x, ev.point.y); if (h != null) { select(h); return; } }
      if (!ev || !ev.point || tool !== 'cursor' || !opts.onPick) return;
      let hit = null, bd = 10;
      if (ind.sr) for (const lv of levelsShown) { const y = yOf(lv.p); if (y != null && Math.abs(y - ev.point.y) < bd) { bd = Math.abs(y - ev.point.y); hit = { p: lv.p, label: lv.full || lv.label, kind: lv.kind }; } }
      if (ind.tl) for (const d of autos.concat(trendShown)) if (d.type === 'line') {
        const x1 = xOf(d.a.t), y1 = yOf(d.a.p), x2 = xOf(d.b.t), y2 = yOf(d.b.p); if (x1 == null || y1 == null || x2 == null || y2 == null || x2 === x1 || ev.point.x < x1) continue;
        const y = y1 + (y2 - y1) * (ev.point.x - x1) / (x2 - x1); if (Math.abs(y - ev.point.y) < bd) { bd = Math.abs(y - ev.point.y); hit = { p: d.now != null ? d.now : candles.coordinateToPrice(y), label: d.full || 'trendline', kind: d.kind }; }
      }
      if (ind.sig) for (const m of marks) { const x = xOf(m.a.t), y = yOf(m.side > 0 ? m.a.lo : m.a.hi); if (x == null || y == null) continue; const yy = y + (m.side > 0 ? 12 : -12); if (Math.abs(x - ev.point.x) < 12 && Math.abs(yy - ev.point.y) < 16) { hit = { p: m.e ? m.e.p : (m.side > 0 ? m.a.lo : m.a.hi), label: m.full, tr: m.tr || null, kind: m.side > 0 ? 'buy' : 'sell' }; break; } }
      if (!hit && ind.tl && detail().words >= 2) for (const d of autos) if (d.type === 'box') {
        const x1 = xOf(d.a.t), y1 = yOf(d.a.p), y2 = yOf(d.b.p); if (x1 == null || y1 == null || y2 == null || ev.point.x < x1) continue;
        if (ev.point.y >= Math.min(y1, y2) - 4 && ev.point.y <= Math.max(y1, y2) + 4) hit = { p: (d.a.p + d.b.p) / 2, label: d.full || 'gap', kind: d.kind };
      }
      opts.onPick(hit ? { ...hit, at: { x: ev.point.x, y: ev.point.y } } : null);   // where the tap was: the explanation opens beside it
    });
    scale.subscribeVisibleLogicalRangeChange(() => { if (opts.onPan && !dead) opts.onPan(); queueRange(); });
    // where the drawn trendlines are on screen, 20 px left of the last candle (used by the automated test of "tap a line")
    root.__drawings = () => drawings.length; root.dataset.drawKey = key;
    root.__draw = () => ({ drawings: JSON.parse(JSON.stringify(drawings)), sel, tool, measure: measure ? JSON.parse(JSON.stringify(measure)) : null, draft: draft ? { ...draft } : null, paneH, style, bands: JSON.parse(JSON.stringify(bandsDrawn)),
      xy: (t, p) => ({ x: xOf(t), y: yOf(p) }), pt: (x, y) => ptXY(x, y), grips: () => { const d = typeof sel === 'number' ? drawings[sel] : sel === 'm' ? { ...measure, type: 'trend' } : null; return d ? gripsOf(d).map((g) => ({ ...g, knob: knob(g) })) : []; } });
    root.__marks = () => marks.map((m) => { const x = xOf(m.a.t), y = yOf(m.side > 0 ? m.a.lo : m.a.hi); return x == null || y == null ? null : { x, y: y + (m.side > 0 ? 12 : -12), side: m.side, st: m.st }; }).filter(Boolean);
    root.__tick = tickText;   // for the tests
    root.__mine = () => mineDrawn;   // for the tests: how many of your trades are drawn
    root.__view = () => { const v = chart.timeScale().getVisibleLogicalRange(); return { n: bars.length, from: v ? v.from : null, to: v ? v.to : null }; };   // for the tests: is the newest candle on screen
    root.__future = (ahead) => { const n = bars.length; if (!n) return null; chart.timeScale().setVisibleLogicalRange({ from: n - 30, to: n + (ahead || 40) }); return new Promise((res) => setTimeout(() => res({ slots: future.length, lastBar: bars[n - 1].time, timeRight: chart.timeScale().coordinateToTime(main.clientWidth - 70), sec: frame.sec }), 300)); };   // for the tests: what the axis shows to the right of the last candle
    root.__lines = () => shownLines().map((d) => ({ kind: d.kind, broken: !!d.broken, major: !!d.major, span: d.span, now: d.now, from: d.a.t, to: d.b.t, full: d.full }));   // for the tests: the trendlines this zoom shows
    root.__setView = (k) => setView(k);
    // a logarithmic price scale (Matteo, 22 Nov 2026: "Add logscale on all charts"): equal heights are equal percentage moves.
    // One setting for every chart (markets, labs, the demo account), the "log" button in the corner under the prices, as on
    // TradingView; the other panes (RSI, MACD, a comparison in %) keep their own scale. Drawings follow (priceToCoordinate).
    let logOn = !!lsGet('sr.chartLog', false);
    const bLog = main.appendChild(el('button', 'ch-log', 'log')); bLog.type = 'button'; bLog.title = 'Logarithmic price scale: equal heights are equal percentage moves'; bLog.setAttribute('aria-label', 'Logarithmic price scale');
    const applyLog = () => { chart.priceScale('right').applyOptions({ mode: logOn ? LW().PriceScaleMode.Logarithmic : LW().PriceScaleMode.Normal }); bLog.classList.toggle('on', logOn); bLog.setAttribute('aria-pressed', String(logOn)); root.dataset.log = logOn ? '1' : '0'; };
    const onLog = () => { const v = !!lsGet('sr.chartLog', false); if (v !== logOn && !dead) { logOn = v; applyLog(); redraw(); queueRange(); } };
    bLog.addEventListener('click', () => { logOn = !logOn; lsSet('sr.chartLog', logOn); applyLog(); redraw(); queueRange(); try { window.dispatchEvent(new CustomEvent('sr-chartlog')); } catch (e) { /* the other charts follow when drawn again */ } });
    window.addEventListener('sr-chartlog', onLog); applyLog();
    root.__log = () => chart.priceScale('right').options().mode;   // for the tests: 1 logarithmic, 0 normal
    root.__zoom = (count) => { const n = bars.length; if (!n) return null; chart.timeScale().setVisibleLogicalRange({ from: n - count, to: n + 3 }); return new Promise((res) => setTimeout(() => res(root.__lines()), 350)); };   // for the tests: the last `count` candles on screen, and the lines then shown
    root.__probe = () => autos.concat(shownLines()).filter((d) => d.type === 'line').map((d) => { const x1 = xOf(d.a.t), y1 = yOf(d.a.p), x2 = xOf(d.b.t), y2 = yOf(d.b.p), xl = bars.length ? xOf(bars[bars.length - 1].time) : null; if (x1 == null || y1 == null || x2 == null || y2 == null || xl == null || x2 === x1) return null; const x = xl - 20; return { x, y: y1 + (y2 - y1) * (x - x1) / (x2 - x1), agree: d.agree || 0 }; }).filter(Boolean);
    bUndo.addEventListener('click', () => { if (hist.length) { const o = JSON.parse(hist.pop()); drawings = o.d; measure = o.m; } else if (measure) measure = null; else drawings.pop(); save(); select(null); });
    bClear.addEventListener('click', () => { if (!drawings.length && !measure) return; snap(); drawings = []; measure = null; save(); select(null); });
    bInd.addEventListener('click', () => { menu.hidden = !menu.hidden; bInd.setAttribute('aria-pressed', String(!menu.hidden)); });
    // the indicators list closes with a tap anywhere outside it (or Escape), as menus do
    const outside = (e) => {
      if (!viewMenu.hidden && !viewMenu.contains(e.target) && !viewButton.contains(e.target)) openViews(false);
      if (menu.hidden || menu.contains(e.target) || bInd.contains(e.target)) return; menu.hidden = true; bInd.setAttribute('aria-pressed', 'false');
    };
    const escape = (e) => { if (e.key !== 'Escape') return; if (sel != null || tool !== 'cursor') { setTool('cursor'); select(null); openDraw(false); e.stopPropagation(); return; } if (!viewMenu.hidden) { openViews(false); e.stopPropagation(); } if (!menu.hidden) { menu.hidden = true; bInd.setAttribute('aria-pressed', 'false'); e.stopPropagation(); } };
    document.addEventListener('pointerdown', outside, true); document.addEventListener('keydown', escape, true);
    // height: the window in full view, the page's own height on a wide window (opts.height), else a phone-sized chart
    function sizeMain() {
      const np = +(main.dataset.panes || 1), own = opts.height ? opts.height() : 0, full = root.classList.contains('is-full');
      if (full && (window.innerWidth >= 900 || (window.innerWidth >= 640 && window.innerHeight <= 500))) {   // a wide window, or a phone held sideways: every row saved goes to the chart
        if (rangeBar.parentNode !== tools) tools.append(rangeBar);
      } else if (rangeBar.parentNode !== root) dateForm.before(rangeBar);
      main.style.height = full ? '' : (own || (340 + (np - 1) * 110)) + 'px';
    }
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
      openViews(false);
      setTimeout(() => { try { chart.resize(main.clientWidth, main.clientHeight); } catch (e) { /* the chart sizes itself */ } redraw(); queueRange(); }, 90);   // fill the window in full view (and the trades' words for the new width)
    }
    setTool('cursor'); applyStyle();

    // ---- legend: OHLC and indicator values under the crosshair ----
    chart.subscribeCrosshairMove((p) => {
      const b = p && p.time != null ? p.seriesData.get(candles) : null;
      if (!b) { legend.textContent = ''; if (opts.onHover) opts.onHover(null); return; }
      const parts = [`O ${fmtP(b.open)}`, `H ${fmtP(b.high)}`, `L ${fmtP(b.low)}`, `C ${fmtP(b.close)}`];
      const prevBar = bars[Math.max(0, bars.findIndex((x) => x.time === p.time) - 1)];
      if (prevBar) parts.push(`${b.close >= prevBar.close ? '+' : ''}${((b.close / prevBar.close - 1) * 100).toFixed(2)}%`);
      for (const [k, s] of Object.entries(S)) { const v = p.seriesData.get(s); if (v && v.value != null && !k.startsWith('comp') && !k.startsWith('bb') && !k.startsWith('macd')) parts.push(`${k.toUpperCase().replace('MA', 'MA ')} ${k === 'rsi' ? v.value.toFixed(1) : fmtP(v.value)}`); }
      if (comparison) for (const [k, label] of Object.entries(comparison.mode === 'ratio' ? { compRatio: `${comparison.a} ÷ ${comparison.b}` } : { compA: comparison.a, compB: comparison.b })) {
        const v = S[k] && p.seriesData.get(S[k]); if (v && v.value != null) parts.push(label + ' ' + comparePct(v.value));
      }
      legend.textContent = parts.join('  ');
      if (opts.onHover) opts.onHover({ time: p.time, ...b });
    });
    chart.timeScale().subscribeVisibleLogicalRangeChange(redraw);

    // ---- indicators ----
    function applyIndicators() {
      compareDataShown = null;
      for (const k of Object.keys(S)) { try { chart.removeSeries(S[k]); } catch (e) { /* gone */ } delete S[k]; }
      while (chart.panes().length > 1) chart.removePane(chart.panes().length - 1);
      vol.applyOptions({ visible: !!ind.vol });
      delete root.dataset.rs;
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
      // strength against the S&P 500: the asset's price divided by the index's, at the same moments, set to 100 where the first view starts
      // (above 100 and rising: it does better than the market). Its 50-candle average, dotted, shows the trend of that strength.
      if (!comparison && ind.rs && bench.length > 20) {
        const bucket = (time) => Math.floor(time / frame.sec);
        const closes = new Map(bench.map((b) => [bucket(b.time), b.close]));
        const at = (time) => closes.get(bucket(time));
        const raw = c.map((v, i) => { const x = at(t[i]); return x > 0 && v > 0 ? v / x : null; }), i0 = Math.max(0, c.length - (frame.show || 160)), base = raw.slice(i0).find((v) => v != null) || raw.find((v) => v != null);
        if (base) {
          const rel = raw.map((v) => (v == null ? null : (100 * v) / base));
          S.rs = chart.addSeries(LW().LineSeries, { color: '#ef6c00', lineWidth: 1.4, priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: false, title: 'vs S&P 500' }, pane); put(S.rs, rel);
          // Market holidays leave gaps. Average the last 50 matched candles without filling those gaps.
          const avg = sma(rel.filter((v) => v != null), 50);
          let matched = 0;
          S.rsm = line('rgba(120,120,120,0.8)', 1, pane); S.rsm.applyOptions({ lineStyle: 1 });
          put(S.rsm, rel.map((v) => v == null ? null : avg[matched++]));
          S.rs.createPriceLine({ price: 100, color: 'rgba(120,120,120,0.5)', lineStyle: 2, lineWidth: 1, axisLabelVisible: false });
          const last = rel.reduce((value, point) => point ?? value, null);
          root.dataset.rs = String(Math.round(last * 10) / 10);
          pane++;
        }
      }
      if (comparison) {
        const { mode, a, b } = comparison;
        const add = (color, title) => chart.addSeries(LW().LineSeries, { color, title, lineWidth: 2, priceLineVisible: false, lastValueVisible: false, priceFormat: { type: 'custom', minMove: 0.01, formatter: comparePct } }, pane);
        let first;
        if (mode === 'ratio') first = S.compRatio = add('#ef6c00', `${a} ÷ ${b}, %`);
        else {
          first = S.compA = add('#2962ff', a);
          S.compB = add('#ef6c00', b);
        }
        first.createPriceLine({ price: 0, color: 'rgba(120,120,120,0.6)', lineStyle: 2, lineWidth: 1, axisLabelVisible: false });
      }
      const panes = chart.panes();
      if (panes.length > 1) { panes[0].setStretchFactor(3); for (let i = 1; i < panes.length; i++) panes[i].setStretchFactor(1); }
      main.dataset.panes = String(panes.length); sizeMain();
      redraw(); queueRange();
    }

    return {
      setBars(newBars, f, fit) {
        if (dead) return;
        const n0 = bars.length, vr0 = !fit && n0 ? chart.timeScale().getVisibleLogicalRange() : null, atEnd = !!(vr0 && vr0.to >= n0 - 1.5) && (!f || f.sec === frame.sec);
        if (f && f.sec !== frame.sec) { bench = []; comparison = null; toggleDates(false); }
        bars = newBars; frame = f || frame;
        candles.setData(bars.map(({ time, open, high, low, close }) => ({ time, open, high, low, close })));
        { const c = bars.length ? bars[bars.length - 1].close : 1, mm = c >= 1 ? 0.01 : Math.pow(10, Math.floor(Math.log10(Math.max(c, 1e-9))) - 3); if (mm !== candles.options().priceFormat.minMove) { candles.applyOptions({ priceFormat: pf(mm) }); for (const sr of Object.values(styleS)) sr.applyOptions({ priceFormat: pf(mm) }); } }
        styleData();
        vol.setData(bars.some((b) => b.volume > 0) ? bars.map((b) => ({ time: b.time, value: b.volume || 0, color: b.close >= b.open ? 'rgba(8,153,129,0.35)' : 'rgba(242,54,69,0.35)' })) : []);   // no volume at all (currencies, the account's value): no empty strip
        chart.applyOptions({ timeScale: { timeVisible: frame.sec < 86400 } });
        applyIndicators(); makeFuture();
        if (fit && bars.length) chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, bars.length - (frame.show || 160)), to: bars.length + 5 });
        else if (atEnd && bars.length !== n0) { const dn = bars.length - n0; chart.timeScale().setVisibleLogicalRange({ from: vr0.from + dn, to: vr0.to + dn }); }   // new candles came in while the last one was on screen: follow them
        queueRange();
      },
      update(bar, isNew) {
        if (dead || !bar) return;
        const vr0 = isNew && bars.length ? chart.timeScale().getVisibleLogicalRange() : null, atEnd = !!(vr0 && vr0.to >= bars.length - 1.5);
        if (isNew) bars.push(bar); else if (bars.length) Object.assign(bars[bars.length - 1], bar);
        if (atEnd) chart.timeScale().setVisibleLogicalRange({ from: vr0.from + 1, to: vr0.to + 1 });   // a new candle: the view moves one step with it, as on TradingView
        if (isNew) makeFuture();   // a new candle: the empty slots start after it again
        candles.update({ time: bar.time, open: bar.open, high: bar.high, low: bar.low, close: bar.close });
        if (style === 'bars') styleS.bars.update({ time: bar.time, open: bar.open, high: bar.high, low: bar.low, close: bar.close }); else if (style === 'line' || style === 'area') styleS[style].update({ time: bar.time, value: bar.close });
        queueRange();
      },
      setZones(L) { zones = L; redraw(); },
      setFair(f) { fair = f && f.bear > 0 && f.bull > 0 ? f : null; redraw(); },
slot, fit: () => { sizeMain(); }, note: (t) => { noteEl.textContent = t || ''; }, isFull: () => root.classList.contains('is-full'),
      setLevels(l) { levels = Array.isArray(l) ? l : []; redraw(); },
      lw: () => ({ chart, candles }),   // for a chart of something else than an asset (the account's value): its own lines and markers
      setAuto(x) { autos = Array.isArray(x) ? x : []; redraw(); },
      setMarks(list) { hostMarks = Array.isArray(list) ? list : []; if (!hostMarkApi && LW().createSeriesMarkers) hostMarkApi = LW().createSeriesMarkers(candles, []); marksKey = ''; drawMarks(); },   // the trades of an account on its chart
      setTrend(fn) { trend = typeof fn === 'function' ? fn : null; trendKey = ''; trendShown = []; redraw(); },   // fn(from, to, max, full): the lines to draw when bars from..to are on screen (full: the Full view)
      view: () => view,
      setTrades(x) { marks = Array.isArray(x) ? x : []; redraw(); },
      setMine(x) { mine = Array.isArray(x) ? x : []; bMine.hidden = !mine.length; root.dataset.mine = String(mine.length); redraw(); },
      setBench(b) { if (b === bench) return; bench = Array.isArray(b) ? b : []; if (bars.length) applyIndicators(); },
      compareSlot, compareButton: bCompare,
      setComparison(value) {
        if (value === comparison) return;
        const same = value && comparison && value.a === comparison.a && value.b === comparison.b && value.mode === comparison.mode;
        comparison = value;
        if (!bars.length) return;
        if (!same) applyIndicators();
        queueRange();
      },
      setPosition(p) { posn = p && p.entry > 0 ? p : null; root.dataset.pos = posn ? String(posn.entry) : ''; redraw(); },
      setEvents(e) { events = Array.isArray(e) ? e : []; root.dataset.events = String(events.length); redraw(); },
      back() { if (!viewMenu.hidden) { openViews(false); return true; } if (sel != null) { select(null); return true; } if (tool !== 'cursor' || !drawBar.hidden) { setTool('cursor'); openDraw(false); return true; } if (root.classList.contains('is-full')) { toggleFull(false); return true; } if (tool !== 'cursor' || !menu.hidden) { setTool('cursor'); menu.hidden = true; return true; } return false; },
      destroy() { dead = true; window.removeEventListener('sr-chartlog', onLog); document.removeEventListener('pointerdown', outside, true); document.removeEventListener('keydown', escape, true); if (rangeFrame !== null) cancelAnimationFrame(rangeFrame); document.body.classList.remove('chart-full'); try { chart.remove(); } catch (e) { /* gone */ } },
    };
  }
  window.SRChart = { create, sma, ema, rsi, comparePrices, comparisonWindow, quoteBars };
})();
