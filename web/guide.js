// Today, Portfolio and Plan: the guided screens.
// Today answers in five seconds: do I act, on what (ticker, buy or sell, euros, % of portfolio) and why, in one line.
// Only tested rules create an "act": the plan's semis switch, the twice-yearly reset and, if kept on, swing trades.
// Moving other holdings into the plan is shown apart, with its fees. Every order explains itself on tap.
(function () {
  'use strict';
  if (typeof document === 'undefined') return;
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const btn = (label, cls, fn) => { const b = el('button', 'btn ' + (cls || ''), label); b.type = 'button'; b.addEventListener('click', fn); return b; };
  const eur = (x, sign) => (x == null || !isFinite(x) ? '—' : (sign && x > 0 ? '+' : x < 0 ? '−' : '') + '€' + d3.format(',.0f')(Math.abs(x)));
  const pct = (x, d = 1) => { if (x == null || !isFinite(x)) return '—'; const s = d3.format(`.${d}%`)(Math.abs(x)); return (/^0\.0*%$/.test(s) ? '' : x > 0 ? '+' : '−') + s; };
  const p0 = (x) => (x > 0 && x < 0.005 ? '<1%' : d3.format('.0%')(x)), f0 = (v) => d3.format(',.0f')(v), f2 = (v) => d3.format(',.2f')(v);
  const day = (t) => d3.utcFormat(new Date(t).getUTCFullYear() === new Date().getUTCFullYear() ? '%a %-d %b' : '%-d %b %Y')(new Date(t));
  const cfg = () => SRApp.config();
  const plan = () => Object.assign({ id: null, done: {} }, cfg().plan || {});
  function savePlan(p) { const c = cfg(); c.plan = p; SRApp.saveConfig(c); if (window.SRSync) window.SRSync.pushSoon(); redraw(); }
  const redraw = () => { for (const n of ['today', 'pfolio', 'plan']) SRApp.renderDraw(n); };
  const go = (tab, sub) => { if (window.appShowTab) window.appShowTab(tab, sub); };
  // what stays as it is between two redraws (the screens are redrawn every 10 seconds with live prices)
  const ui = { setupOpen: false, moneyOpen: false, add: 500, busy: false };

  // ---- the plans (tested on 2000-2026 and audited in Nov 2026, see the Plan tab's test) ----
  const DEFL = [['ZPDS', 'XLP', 'Consumer staples'], ['ZPDU', 'XLU', 'Utilities'], ['ZPDH', 'XLV', 'Health care']];
  const DEF_LINES = DEFL.map(([t, us, name]) => ({ t, us, name, w: 0.5 / 3 }));
  const PLANS = {
    smh: {
      name: 'Semis on trend + defensive', study: 'smhplan', signal: true,
      line: 'Half in semiconductors (SEC0) while they trend, in cash after a 15% fall. Half in staples, utilities and health care.',
      risk: 'Audited Nov 2026. Its real edge is smaller drops (worst −35% vs −55% for the S&P 500), not return: after costs and French tax it earned 6.3% a year vs 6.8% for the S&P 500 (2000–2026). About 14 orders a year. Semis were picked knowing they won.',
      targets: (inn) => [inn ? { t: 'SEC0', us: 'SMH', name: 'Semiconductors', w: 0.5 } : { t: 'CASH', name: 'Cash (Revolut)', w: 0.5 }, ...DEF_LINES],
    },
    core: {
      name: 'Nasdaq + defensive', study: 'qqqdef', reset: true,
      line: '50% Nasdaq-100, 50% staples, utilities and health care. Reset to target every January and July.',
      risk: 'Audited Nov 2026. After costs and French tax: 7.2% a year vs 6.8% for the S&P 500 (2000–2026), with slightly smaller swings. Few orders (about 8 a year), so little tax drag. But in the 2000–02 tech crash it fell further (−58% vs −55%).',
      targets: () => [{ t: 'SXRV', us: 'QQQ', name: 'Nasdaq-100', w: 0.5 }, ...DEF_LINES],
    },
    spx: {
      name: 'S&P 500, just held', study: 'spy',
      line: 'One fund (VUAA), nothing to trade. The yardstick the other two are measured against.',
      risk: 'Audited Nov 2026. 6.8% a year after costs and French tax (2000–2026), with the largest drops of the three (−55%). No orders, so no fees and no tax until you sell.',
      targets: () => [{ t: 'VUAA', us: 'SPY', name: 'S&P 500', w: 1 }],
    },
  };
  const NAME = { SXRV: 'Nasdaq-100', SEC0: 'Semiconductors', IS0E: 'Gold miners', CASH: 'Revolut cash', ZPDS: 'Consumer staples', ZPDU: 'Utilities', ZPDH: 'Health care', VUAA: 'S&P 500', ZPDT: 'Technology', ZPDD: 'Consumer discretionary', ZPDF: 'Financials' };
  const COLOR = { SEC0: '#7b61ff', CASH: '#a8b0ba', SXRV: '#2f6fed', VUAA: '#2f6fed', ZPDS: '#e05a8a', ZPDU: '#ea85a6', ZPDH: '#f2adc3', KEPT: '#6b7280', OUT: '#d4a017' };
  const allLines = (p) => { const P = PLANS[p.id]; return P ? [...P.targets(true), ...P.targets(false)] : []; };
  const planTickers = (p) => new Set(allLines(p).map((x) => x.t));
  const lineFor = (h, lines) => lines.find((l) => l.t === h.ticker) || lines.find((l) => l.us && h.tracks === l.us) || null;
  const keepSet = (p, H) => new Set(Array.isArray(p.keep) ? p.keep : H.filter((h) => h.long_term).map((h) => h.ticker));
  const nameOf = (t, H) => NAME[t] || ((H || []).find((h) => h.ticker === t) || {}).name || '';
  const study = (k) => { const R = dash.data('study_rules'); return (R.status === 'ok' ? R.data : []).find((r) => r.key === k) || null; };

  // ---- holdings with live values ----
  function holdings() {
    const P = dash.data('portfolio'), H = dash.data('holdings');
    const rows = P.status === 'ok' && P.data.length ? P.data : H.status === 'ok' ? H.data : [];
    return rows.map((h) => {
      const L = SR.liveFolio ? SR.liveFolio(h) : null;
      return { ...h, value: L && L.value != null ? L.value : h.amount || 0, chg: L ? L.chg : null, live: !!(L && L.value != null), symbol: L ? L.symbol : h.tracks };
    });
  }
  function openHolding(h) {
    const l = window.SRLive && window.SRLive.liveOf ? window.SRLive.liveOf(h) : null;
    if (l && window.SRLive.openAsset) window.SRLive.openAsset({ id: l.id, symbol: l.symbol, name: l.symbol === h.ticker ? h.name || '' : `Your ${h.ticker}, shown through its US twin ${l.symbol}`, exchange: '' });
    else if (SR.open) SR.open(h.tracks);
  }
  function openTicker(t, H) {
    const h = (H || []).find((x) => x.ticker === t); if (h) return openHolding(h);
    const r = (window.SR_REVOLUT || []).find((x) => x.revolut_ticker === t); if (SR.open) SR.open(r ? r.us : t);
  }
  function totals(H) {
    const T = SR.liveTotals ? SR.liveTotals() : null;
    return T || { total: H.reduce((s, h) => s + (h.value || 0), 0), today: null, todayPct: null };
  }
  const quote = (us) => { const q = window.SRLive && window.SRLive.quotes.get(SRApp.idOf(us)); return q ? q.price : null; };

  // ---- the semiconductor signal: SMH weekly closes (completed weeks only) ----
  const SMH_ID = SRApp.idOf('SMH');
  let sig = null, sigAt = 0, sigBusy = false;
  function weekEnd(t) { // Friday 21:15 UTC of the week a candle belongs to (after the US close, summer or winter)
    const d = new Date(t + 2 * 864e5), mon = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - ((d.getUTCDay() + 6) % 7) * 864e5;
    return mon + 4 * 864e5 + (21 * 60 + 15) * 60e3;
  }
  const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  // Semis trend on Friday closes. IN while the close is within 15% of the highest close of the last 52 weeks.
  // After an exit, back IN only when the close is again within 15% of that high AND above its 30-week average
  // (until build 24 the average alone brought it back, so it went in and out week after week during recoveries).
  function computeSignal(w) {
    if (w.length < 110) return { error: 'not enough history' };
    const closes = w.map((x) => x.close), L = w.length - 1;
    const stopAt = (i) => 0.85 * Math.max(...closes.slice(i - 51, i + 1)), smaAt = (i) => mean(closes.slice(i - 29, i + 1));
    let inn = true, since = w[51].end;
    for (let i = 51; i <= L; i++) {
      const c = closes[i], near = c >= stopAt(i), next = near && (inn || c > smaAt(i));
      if (next !== inn) { inn = next; since = w[i].end; }
    }
    // next Friday's levels: the new close joins both windows, so they are taken over the last 51 and 29 closes
    const stop = 0.85 * Math.max(...closes.slice(L - 50)), avg = mean(closes.slice(L - 28));
    return {
      inn, since, close: closes[L], at: w[L].end,
      exitAt: stop, backAt: Math.max(stop, avg), backWhy: avg >= stop ? 'avg' : 'high', avg, stop,
      hist: w.slice(-52).map((x, k) => ({ end: x.end, close: x.close, sma: smaAt(L - 51 + k), stop: stopAt(L - 51 + k) })),
    };
  }
  async function loadSignal(force) {
    if (sigBusy || !SMH_ID || !window.SRLive || !window.SRLive.candles) return;
    if (!force && sig && Date.now() - sigAt < 30 * 60e3) return;
    sigBusy = true;
    try {
      const rows = await window.SRLive.candles(SMH_ID, 'OneWeek', 200, 2);   // the Today verdict waits for it
      sig = computeSignal(rows.filter((r) => weekEnd(r.t) <= Date.now()).map((r) => ({ close: r.close, end: weekEnd(r.t) })));
    } catch (e) { sig = { error: 'eToro did not answer (' + (e.status || 'no connection') + ')' }; }
    sigAt = Date.now(); sigBusy = false; redraw();
  }

  // ---- what the plan asks for now ----
  // Orders carry a kind: 'signal' (the semis switch), 'reset' (twice-yearly reset, or a line 10 points off target),
  // 'setup' (holdings outside the plan, and the plan lines they fund). Only the first two are time-bound.
  function planState(H) {
    const p = plan(), P = PLANS[p.id], live = H.filter((h) => h.value > 0);
    const st = { p, P, orders: [], cur: {}, size: 0, inPlan: 0, T: null, inn: null, keep: keepSet(p, H), total: live.reduce((x, h) => x + h.value, 0), swing: null, swingOn: p.swing !== false };
    if (!P) return st;
    const PT = planTickers(p); st.keep = new Set([...st.keep].filter((t) => !PT.has(t))); // a plan line cannot be kept outside the plan
    st.inn = P.signal ? (sig && !sig.error ? sig.inn : null) : true;
    if (st.inn == null) return st;
    // semis out of trend but a swing trade is on (bought a sharp dip): that half stays in SEC0 until the swing sells
    const sw = P.signal && st.inn === false && st.swingOn && SRApp.swing ? SRApp.swing().find((y) => y.us === 'SMH') : null;
    st.swing = sw && sw.inTrade ? sw : null;
    let T = P.targets(st.inn || !!st.swing);
    if (st.swing) T = T.map((l) => (l.t === 'SEC0' ? { ...l, name: 'Semiconductors (swing trade)' } : l));
    const scope = live.filter((h) => !st.keep.has(h.ticker)), other = {};
    for (const h of scope) { const l = lineFor(h, T); if (l) st.cur[l.t] = (st.cur[l.t] || 0) + h.value; else other[h.ticker] = (other[h.ticker] || 0) + h.value; }
    st.size = scope.reduce((x, h) => x + h.value, 0);
    if (st.swing && st.size > 0) { // during a semis swing trade: keep the SEC0 you hold, don't add; the rest of that half waits in cash
      const held = Math.min(0.5, (st.cur.SEC0 || 0) / st.size);
      T = T.map((l) => (l.t === 'SEC0' ? { ...l, w: held } : l));
      if (0.5 - held > 0.001) T.push({ t: 'CASH', name: 'Cash (Revolut)', w: 0.5 - held });
    }
    st.T = T;
    st.inPlan = T.reduce((x, l) => x + (st.cur[l.t] || 0), 0);
    if (st.size < 50) return st;
    const all = allLines(p), hOf = (t) => scope.find((h) => h.ticker === t);
    const sigT = Object.keys(other).filter((t) => lineFor(hOf(t), all)), outT = Object.keys(other).filter((t) => !sigT.includes(t));
    const drift = Math.max(...T.map((l) => Math.abs((st.cur[l.t] || 0) / st.size - l.w)));
    const now = new Date(), m = now.getUTCMonth(), key = `reset-${now.getUTCFullYear()}-${m + 1}`;
    const resetDue = !!P.reset && (m === 0 || m === 6) && now.getUTCDate() <= 15 && !(p.done || {})[key];
    const rebalance = !outT.length && !sigT.length && (resetDue || drift > 0.10);
    if (!outT.length && !sigT.length && !rebalance) return st;
    const r10 = (x) => Math.round(x / 10) * 10, minOrder = Math.max(25, st.size * 0.01), O = [];
    for (const t of sigT) O.push({ side: 'sell', t, eur: Math.round(other[t]), all: true, kind: 'signal' });
    for (const t of outT) O.push({ side: 'sell', t, eur: Math.round(other[t]), all: true, kind: 'setup' });
    let sigCash = sigT.reduce((x, t) => x + other[t], 0); // what the signal's sale frees: it goes to cash (semis out) or to SEC0 (semis back)
    for (const l of T) {
      const tgt = st.size * l.w, held = st.cur[l.t] || 0, d = tgt - held;
      if (Math.abs(d) < minOrder) continue;
      const base = { side: d > 0 ? 'buy' : 'sell', t: l.t, line: l, target: tgt, held };
      if (rebalance) O.push({ ...base, eur: r10(Math.abs(d)), kind: 'reset', why: resetDue ? 'reset' : 'drift' });
      else if (d > 0 && sigCash > 0 && (l.t === 'CASH' || l.t === 'SEC0')) {
        const a = Math.min(d, sigCash); sigCash -= a;
        if (a >= minOrder) O.push({ ...base, eur: Math.round(a), kind: 'signal' });
        if (d - a >= minOrder) O.push({ ...base, eur: r10(d - a), kind: 'setup' });
      } else O.push({ ...base, eur: r10(Math.abs(d)), kind: 'setup' });
    }
    st.orders = O;
    return st;
  }
  // optional swing trades (Plan tab switch): a buy needs cash waiting in the plan; a sell only concerns what you hold
  function swingOrders(H, st) {
    if (!st.P || !st.swingOn || !SRApp.swing) return [];
    const out = [], waiting = st.P.signal && st.inn === false ? (st.cur.CASH || 0) : 0;
    for (const x of SRApp.swing()) {
      const held = H.find((h) => h.value > 0 && h.ticker === x.t), onLine = st.T && st.T.some((l) => l.t === x.t);
      if (x.signal && x.signal.type === 'sell' && held && !onLine && !st.orders.some((o) => o.t === x.t)) out.push({ side: 'sell', t: x.t, eur: Math.round(held.value), all: true, kind: 'swing', x });
      else if (x.signal && x.signal.type === 'buy' && waiting >= 150) out.push({ side: 'buy', t: x.t, eur: Math.round(waiting / 3 / 10) * 10, kind: 'swing', x });
    }
    return out;
  }
  const fee = (o) => (o.t === 'CASH' ? 0 : Math.max(1, 0.0025 * o.eur));
  function nextReset() { const n = new Date(), y = n.getUTCFullYear(), m = n.getUTCMonth(); return day(m < 6 ? Date.UTC(y, 6, 1) : Date.UTC(y + 1, 0, 1)); }
  function toast(msg) {
    const t = el('div', 'g-toast', msg); document.body.appendChild(t);
    setTimeout(() => t.classList.add('is-on'), 10); setTimeout(() => { t.classList.remove('is-on'); setTimeout(() => t.remove(), 400); }, 2600);
  }

  // ---- 12-month volatility of a mix (daily moves of what each part follows; cash does not move) ----
  function series(sym) { const d = SRApp._store[sym]; if (!d || d.status !== 'ok' || !d.data.length) return null; const m = new Map(); let prev = null; for (const r of d.data) { if (prev) m.set(r.date, r.close / prev - 1); prev = r.close; } return m; }
  function mixVol(parts) { // parts: [{ sym, eur }], sym 'CASH' or a US symbol
    const spy = series('SPY'), tot = parts.reduce((x, q) => x + q.eur, 0); if (!spy || !tot) return null;
    const dates = [...spy.keys()].slice(-252), S = parts.filter((q) => q.eur > 0).map((q) => ({ w: q.eur / tot, m: q.sym === 'CASH' ? null : series(q.sym), cash: q.sym === 'CASH' }));
    const known = S.filter((q) => q.cash || q.m); if (known.reduce((x, q) => x + q.w, 0) < 0.6) return null;
    const r = dates.map((dt) => { let a = 0, w = 0; for (const q of known) { const v = q.cash ? 0 : q.m.get(dt); if (v != null) { a += q.w * v; w += q.w; } } return w > 0.5 ? a / w : null; }).filter((x) => x != null);
    if (r.length < 120) return null;
    const mu = d3.mean(r); return Math.sqrt(d3.sum(r, (x) => (x - mu) ** 2) / (r.length - 1)) * Math.sqrt(252);
  }
  const partsNow = (H) => H.filter((h) => h.value > 0).map((h) => ({ sym: h.ticker === 'CASH' ? 'CASH' : h.tracks, eur: h.value }));
  const partsPlan = (H, st) => [...H.filter((h) => h.value > 0 && st.keep.has(h.ticker)).map((h) => ({ sym: h.tracks, eur: h.value })), ...st.T.map((l) => ({ sym: l.us || 'CASH', eur: st.size * l.w }))];

  // ---- a bottom sheet: the "why" behind an order or a holding ----
  let sheetEl = null;
  function closeSheet() { if (sheetEl) { sheetEl.remove(); sheetEl = null; } }
  function sheet(title, build) {
    closeSheet();
    const back = el('div', 'g-sheet-back'), s = back.appendChild(el('div', 'g-sheet'));
    s.setAttribute('role', 'dialog'); s.setAttribute('aria-label', title);
    const h = s.appendChild(el('div', 'g-sheet-h')); h.appendChild(el('b', '', title));
    const x = h.appendChild(el('button', 'g-sheet-x', '✕')); x.type = 'button'; x.setAttribute('aria-label', 'Close'); x.addEventListener('click', closeSheet);
    build(s);
    back.addEventListener('click', (e) => { if (e.target === back) closeSheet(); });
    document.body.appendChild(back); sheetEl = back;
  }
  const kv = (box, k, text) => { const r = box.appendChild(el('div', 'g-kv')); r.appendChild(el('span', 'g-kv-k', k)); r.appendChild(el('span', 'g-kv-v', text)); return r; };
  function spark(box, s) {
    const W = Math.max(260, box.clientWidth || 320), Hh = 110, m = { l: 4, r: 4, t: 6, b: 6 };
    const d = s.hist, x = d3.scaleLinear().domain([0, d.length - 1]).range([m.l, W - m.r]);
    const lo = d3.min(d, (r) => Math.min(r.close, r.stop)), hi = d3.max(d, (r) => Math.max(r.close, r.sma));
    const y = d3.scaleLinear().domain([lo * 0.97, hi * 1.02]).range([Hh - m.b, m.t]);
    const svg = d3.select(box).append('svg').attr('class', 'g-spark').attr('viewBox', `0 0 ${W} ${Hh}`).attr('width', '100%').attr('height', Hh).attr('role', 'img')
      .attr('aria-label', 'SMH weekly closes over the last year, with its 30-week average and the 15% stop');
    const line = (k) => d3.line().x((r, i) => x(i)).y((r) => y(r[k]));
    svg.append('path').datum(d).attr('d', line('stop')).attr('class', 'g-sp-stop');
    svg.append('path').datum(d).attr('d', line('sma')).attr('class', 'g-sp-sma');
    svg.append('path').datum(d).attr('d', line('close')).attr('class', 'g-sp-close');
    svg.append('circle').attr('cx', x(d.length - 1)).attr('cy', y(d[d.length - 1].close)).attr('r', 3.5).attr('class', 'g-sp-dot');
    const k = box.appendChild(el('div', 'g-legend'));
    k.innerHTML = '<span><i class="g-k g-k-close"></i>SMH weekly close</span><span><i class="g-k g-k-sma"></i>30-week average</span><span><i class="g-k g-k-stop"></i>15% below the high</span>';
  }

  // ---- one order: side, ticker, euros, % of portfolio, and why in one line ----
  const sideLabel = (o) => (o.t === 'CASH' ? (o.side === 'buy' ? 'Keep' : 'Use') : o.side === 'buy' ? 'Buy' : 'Sell');
  function whyLine(o, st) {
    if (o.kind === 'signal') return st.inn ? `Semis are back in trend (since ${day(sig.since)}).` : o.t === 'CASH' ? 'Waits in cash until semis are back in trend.' : `Semis are out of trend (since ${day(sig.since)}).`;
    if (o.kind === 'reset') return o.why === 'reset' ? 'Twice-yearly reset to target.' : 'This line is 10 points off target.';
    if (o.kind === 'swing') return o.side === 'buy' ? `Sharp drop in a downtrend (RSI-2 at ${Math.round(o.x.signal.rsi2)}). Optional, 09:00 open only.` : `Swing trade over (${pct(o.x.signal.gain)}). At the 09:00 open.`;
    if (o.kind === 'money') return o.t === 'CASH' ? 'The semis half waits in cash for now.' : `Plan line, ${p0(o.line.w)} of the plan.`;
    if (o.t === 'CASH') return o.side === 'buy' ? 'The semis half waits in cash for now.' : 'Cash goes into the plan.';
    if (o.side === 'sell') return o.line ? 'Above its share of the plan.' : 'Outside your plan.';
    return `Plan line: target ${eur(o.target)}, you hold ${eur(o.held)}.`;
  }
  function orderRow(parent, o, st, H, mode) { // mode: 'quiet' = no "Why" label, 'compact' = no why line (the card says it once)
    const r = parent.appendChild(el('button', 'g-ord' + (mode === 'compact' ? ' is-compact' : ''))); r.type = 'button';
    r.appendChild(el('span', 'g-side g-' + (o.t === 'CASH' ? 'cash' : o.side), sideLabel(o)));
    const w = r.appendChild(el('span', 'g-ord-w')); w.appendChild(el('b', '', o.t === 'CASH' ? 'Cash' : o.t)); w.appendChild(el('span', 'g-muted', nameOf(o.t, H)));
    const v = r.appendChild(el('span', 'g-ord-v')); v.appendChild(el('b', '', (o.all && o.t !== 'CASH' ? 'all · ' : '') + eur(o.eur)));
    v.appendChild(el('span', 'g-muted', st.total ? p0(o.eur / st.total) + ' of portfolio' : ''));
    if (mode === 'compact') r.setAttribute('aria-label', `${sideLabel(o)} ${o.t} ${eur(o.eur)}: ${whyLine(o, st)}`);
    else { const y = r.appendChild(el('span', 'g-ord-y')); y.appendChild(el('span', '', whyLine(o, st))); if (mode !== 'quiet') y.appendChild(el('span', 'g-ord-go', 'Why ›')); }
    r.addEventListener('click', () => whySheet(o, st, H));
    return r;
  }
  function whySheet(o, st, H) {
    const cash = o.t === 'CASH', mine = study(st.P.study), spy = study('spy');
    sheet(`${sideLabel(o)} ${cash ? 'cash' : o.t} · ${eur(o.eur)}`, (s) => {
      s.appendChild(el('div', 'g-sheet-lead', whyLine(o, st)));
      if (o.kind === 'signal' && sig && !sig.error) {
        const top = Math.max(...sig.hist.map((x) => x.close));
        kv(s, 'Rule', `Half the plan is in semis only while SMH's weekly close is within 15% of its 52-week high. Friday it closed at ${f0(sig.close)}, ${pct(sig.close / top - 1, 0)} from the high. ${sig.inn ? `Out again below ${f0(sig.exitAt)}.` : `Back in above ${f0(sig.backAt)} at a Friday close.`}`);
        spark(s, sig);
        if (mine && spy) kv(s, 'Evidence', `2000–2026 test: with this switch the plan's worst drop was ${pct(mine.max_dd, 0)} (S&P 500: ${pct(spy.max_dd, 0)}). It did not add return: ${pct(mine.cagr_tax)} a year after tax against ${pct(spy.cagr_tax)}.`);
      } else if (o.kind === 'money' && !cash) {
        kv(s, 'Rule', `New money goes to the plan lines furthest below target, so nothing has to be sold. ${o.t} (${nameOf(o.t, H)}): target ${eur(o.target)} once the money is in, you hold ${eur(o.held)}.`);
      } else if (o.kind === 'reset') {
        kv(s, 'Rule', `Back to the plan's shares: ${o.t} should be ${eur(o.target)} (${p0(o.line.w)}), you hold ${eur(o.held)}.`);
        kv(s, 'Evidence', 'The plan was tested with a reset every 6 months. Resetting more often only adds fees and tax.');
      } else if (o.kind === 'swing') {
        kv(s, 'Rule', o.side === 'buy' ? `${o.x.us} is below its 200-day average and fell hard (RSI-2 below 5). Buy at the next open; sell at the first close above its 5-day average, or after 10 days.` : `${o.x.us} closed above its 5-day average: the bounce is taken. Sell at the next open.`);
        kv(s, 'Evidence', 'Audit, Xetra funds since 2010: +0.5% a trade after costs, only when traded at the 09:00 open. A day late, nothing. After tax it adds 0 to 1.5 points a year. Optional: switch it off in Plan.');
        if (o.side === 'buy') kv(s, 'Size', `A third of the ${eur(st.cur.CASH || 0)} waiting in cash for semis.`);
      } else if (o.side === 'sell' && !o.line && !cash) {
        kv(s, 'Rule', `${o.t} is not part of “${st.P.name}”. Selling it funds the plan's lines. This has no deadline.`);
        if (mine && spy) kv(s, 'Evidence', `Your plan in the 2000–2026 test: ${pct(mine.cagr_tax)} a year after tax, worst drop ${pct(mine.max_dd, 0)}. S&P 500: ${pct(spy.cagr_tax)}, ${pct(spy.max_dd, 0)}.`);
      } else if (cash) {
        kv(s, 'Rule', o.side === 'buy' ? 'While semis are out of trend, their half of the plan waits in cash on Revolut. Nothing to place.' : 'Cash you hold goes into the plan\'s lines.');
      } else {
        kv(s, 'Rule', `${o.t} (${nameOf(o.t, H)}) is ${p0(o.line.w)} of the plan: ${eur(o.target)} of the ${eur(st.size)} in it. You hold ${eur(o.held)}.`);
        if (mine && spy) kv(s, 'Evidence', `Your plan in the 2000–2026 test: ${pct(mine.cagr_tax)} a year after tax, worst drop ${pct(mine.max_dd, 0)}. S&P 500: ${pct(spy.cagr_tax)}, ${pct(spy.max_dd, 0)}.`);
      }
      if (!cash) {
        const f = fee(o);
        kv(s, 'Cost', `Fee about €${f2(f)} (0.25%, minimum €1, after your free orders)${o.eur < 200 ? `: ${d3.format('.1%')(f / o.eur)} of this small order` : ''}.${o.side === 'sell' ? ' A gain is taxed at 31.4%; a loss costs no tax.' : ''}`);
        const row = s.appendChild(el('div', 'g-btns'));
        if (o.kind === 'setup' && o.side === 'sell' && !o.line) row.appendChild(btn(`Keep ${o.t} instead`, 'primary', () => { const q = plan(), k = keepSet(q, H); k.add(o.t); q.keep = [...k]; closeSheet(); savePlan(q); toast(`${o.t} kept. Orders updated.`); }));
        row.appendChild(btn('Open chart', '', () => { closeSheet(); openTicker(o.t, H); }));
      }
    });
  }

  // ---- pieces ----
  function hero(box, H) {
    const T = totals(H), h = box.appendChild(el('div', 'g-hero'));
    h.appendChild(el('div', 'g-hero-k', 'Your portfolio'));
    h.appendChild(el('div', 'g-hero-v', eur(T.total)));
    const c = h.appendChild(el('div', 'g-hero-chg ' + (T.today > 0 ? 'up' : T.today < 0 ? 'down' : ''), T.today == null ? 'Live values once eToro answers' : `${eur(T.today, true)}  ${pct(T.todayPct, 2)} today`));
    c.title = 'Live, from eToro';
    return h;
  }
  function card(box, kind, title) {
    const c = box.appendChild(el('div', 'g-card g-' + kind));
    if (title) c.appendChild(el('div', 'g-card-t', title));
    return c;
  }

  // ---- Today, card 1: the answer ----
  function verdictCard(box, H, st) {
    if (!st.P) {
      const c = card(box, 'verd is-idle'); c.appendChild(el('div', 'g-verd-h', 'No plan chosen'));
      c.appendChild(el('div', 'g-line g-muted', 'Pick a plan and this screen tells you each day whether to act, on what, and why.'));
      c.appendChild(btn('Choose a plan', 'primary', () => go('plan', 0))); return;
    }
    if (st.inn == null) { const c = card(box, 'verd is-idle'); c.appendChild(el('div', 'g-verd-h', 'Checking the semis signal…')); if (sig && sig.error) c.appendChild(el('div', 'g-line g-muted', sig.error)); return; }
    const acts = [...st.orders.filter((o) => o.kind === 'signal' || o.kind === 'reset'), ...swingOrders(H, st)];
    const real = acts.filter((o) => o.t !== 'CASH'), setup = st.orders.some((o) => o.kind === 'setup' && o.t !== 'CASH');
    const c = card(box, 'verd ' + (real.length ? 'is-act' : 'is-ok'));
    const h = c.appendChild(el('div', 'g-verd-h')); h.appendChild(el('span', 'g-verd-dot'));
    h.appendChild(el('span', '', real.length ? `Act now · ${real.length} order${real.length > 1 ? 's' : ''}` : 'Nothing to do today'));
    if (real.length) {
      const list = c.appendChild(el('div', 'g-ords'));
      for (const o of real) orderRow(list, o, st, H);
      const toCash = acts.find((o) => o.t === 'CASH' && o.side === 'buy'), fromCash = acts.find((o) => o.t === 'CASH' && o.side === 'sell');
      c.appendChild(el('div', 'g-hint', (toCash ? `Leave the ${eur(toCash.eur)} in cash until semis are back in trend. ` : fromCash ? `Paid with the ${eur(fromCash.eur)} waiting in cash. ` : '')
        + `Place ${real.length > 1 ? 'them' : 'it'} on Revolut while the market is open${real.length > 1 ? ', sells first' : ''}. Then send Claude a screenshot.`));
    } else {
      c.appendChild(el('div', 'g-line', st.swing ? `Semis are out of trend, but a swing trade in SEC0 is on: hold it until SMH closes above ${f2(st.swing.sellAbove)}.`
        : setup ? 'No signal. The set-up below has no deadline.' : 'You are on plan and no signal fired.'));
    }
    c.appendChild(el('div', 'g-verd-next', nextLine(st)));
  }
  function nextLine(st) {
    if (st.P.signal && sig && !sig.error) {
      const now = quote('SMH') || sig.close, lvl = sig.inn ? sig.exitAt : sig.backAt;
      return `Next check: Friday's close. Semis ${sig.inn ? 'go out below' : 'come back above'} SMH ${f0(lvl)} (${pct(lvl / now - 1)} from now).`;
    }
    if (st.P.reset) return `Next reset to target: ${nextReset()}.`;
    return 'Nothing to check: this plan never trades.';
  }

  // ---- Today: what the screener scouted (buy signals that passed the history test, last 3 days) ----
  function scoutCard(box) {
    if (!window.SRScreen || !window.SRTA) return;
    window.SRScreen.load(); window.SRScreen.loadWide();
    const T = window.SRScreen.top(4), S = (window.SR_TASTATS || {}).by || {}, c = card(box, 'scout', 'Scouted today');
    if (!T.length) c.appendChild(el('div', 'g-line g-muted', `No tested buy signal in the last 3 days among the ${window.SRScreen.count()} assets watched.`));
    for (const r of T) {
      const b = c.appendChild(el('button', 'g-wrow')); b.type = 'button'; b.addEventListener('click', () => window.SRScreen.open(r));
      b.appendChild(el('span', 'g-pill g-buy', r.sym));
      b.appendChild(el('span', 'g-wrow-t', `${window.SRScreen.SHORT[r.buy.id] || r.buy.name}, ${window.SRScreen.ago(r.buy)} · support ${pct(r.sup)}, resistance ${pct(r.res)}${r.rr ? ', reward/risk ' + Math.min(9.9, r.rr).toFixed(1) : ''}`));
      b.appendChild(el('b', 'g-wrow-g', p0(S[r.buy.id].win)));
    }
    if (T.length) c.appendChild(el('div', 'g-hint', 'Fresh signals with at least 1.5 of reward for 1 of risk. The percentage is how often that signal worked on 79 assets; buying on any day worked 54%. Tap for the chart, the levels and the asset\'s own test.'));
    const rec = window.SRScreen.record(); if (rec && rec.worked + rec.failed + rec.open > 0) c.appendChild(el('div', 'g-hint', `Record of scouted ideas so far: ${rec.worked} worked, ${rec.failed} failed, ${rec.open} still open (graded after 20 trading days).`));
    const l = c.appendChild(el('button', 'g-link', 'Open the screener')); l.type = 'button'; l.addEventListener('click', () => go('markets', 0));
    const l2 = c.appendChild(el('button', 'g-link g-link2', 'Analyse any asset')); l2.type = 'button'; l2.addEventListener('click', () => { const x = document.getElementById('btn-search'); if (x) x.click(); });
  }

  // ---- Today, card 2: holdings outside the plan (no deadline), with what-if ----
  function setupCard(box, H, st) {
    const S = st.orders.filter((o) => o.kind === 'setup'); if (!S.length) return;
    const real = S.filter((o) => o.t !== 'CASH'), sells = real.filter((o) => o.side === 'sell').sort((a, b) => b.eur - a.eur), buys = real.filter((o) => o.side === 'buy'), cash = S.filter((o) => o.t === 'CASH');
    const moved = sells.reduce((x, o) => x + o.eur, 0) + cash.filter((o) => o.side === 'sell').reduce((x, o) => x + o.eur, 0), fees = real.reduce((x, o) => x + fee(o), 0);
    const c = card(box, 'setup', 'Set up your plan');
    c.appendChild(el('div', 'g-line', `${p0(moved / st.total)} of your portfolio (${eur(moved)}) is outside the plan. Moving it takes ${real.length} order${real.length > 1 ? 's' : ''}; fees about ${eur(fees)}. No deadline.`));
    const tg = c.appendChild(btn(ui.setupOpen ? 'Hide the orders' : `Show the ${real.length} orders`, ui.setupOpen ? '' : 'primary', () => { ui.setupOpen = !ui.setupOpen; SRApp.renderDraw('today'); }));
    tg.setAttribute('aria-expanded', String(ui.setupOpen));
    if (ui.setupOpen) {
      const list = c.appendChild(el('div', 'g-ords'));
      for (const o of [...sells, ...cash.filter((x) => x.side === 'sell'), ...buys, ...cash.filter((x) => x.side === 'buy')]) orderRow(list, o, st, H, 'compact');
      const own = sells.filter((o) => !o.line);
      if (own.length) {
        c.appendChild(el('div', 'g-sec', 'What if I keep…'));
        const chips = c.appendChild(el('div', 'g-chips'));
        for (const o of own) { const b = chips.appendChild(el('button', 'g-chip g-toggle', o.t)); b.type = 'button'; b.addEventListener('click', () => { const q = plan(), k = keepSet(q, H); k.add(o.t); q.keep = [...k]; savePlan(q); toast(`${o.t} kept. Orders updated.`); }); }
        c.appendChild(el('div', 'g-hint', 'Tap one and the orders are recalculated without it. Tap an order for the why and the fee. Sell first, then buy with the proceeds.'));
      }
    }
    const kept = [...st.keep].filter((t) => H.some((h) => h.ticker === t && h.value > 0));
    if (kept.length) {
      const kk = c.appendChild(el('div', 'g-keep')); kk.appendChild(el('span', 'g-muted', 'Kept outside the plan:'));
      for (const t of kept) { const b = kk.appendChild(el('button', 'g-chip g-toggle is-on', t + ' ✕')); b.type = 'button'; b.setAttribute('aria-label', `Stop keeping ${t}`); b.addEventListener('click', () => { const q = plan(), k = keepSet(q, H); k.delete(t); q.keep = [...k]; savePlan(q); toast(`${t} is back in the set-up.`); }); }
    }
  }

  // ---- Today, card 3: the levels that would change the answer ----
  function watchCard(box, H, st) {
    const rows = [];
    if (st.P && st.P.signal && sig && !sig.error) {
      const now = quote('SMH') || sig.close, lvl = sig.inn ? sig.exitAt : sig.backAt;
      rows.push(['SMH', sig.inn ? 'IN' : 'OUT', sig.inn ? 'g-in' : 'g-out', `Semis: ${sig.inn ? 'out' : 'back in'} at a Friday close ${sig.inn ? 'below' : 'above'} ${f0(lvl)}`, pct(lvl / now - 1)]);
    }
    if (st.P && st.swingOn && SRApp.swing) {
      const S = SRApp.swing();
      if (window.SRLive && window.SRLive.want) window.SRLive.want('swing', S.map((x) => SRApp.idOf(x.us)).filter(Boolean));
      for (const x of S) {
        const px = quote(x.us) || x.close, held = H.some((h) => h.value > 0 && h.ticker === x.t);
        if (x.inTrade && held) rows.push([x.us, 'SWING', 'g-watch', `${x.t}: sell after a close of ${x.us} above ${f2(x.sellAbove)} (day ${x.days + 1} of 10)`, pct(x.sellAbove / px - 1)]);
        else if (!x.inTrade && x.bear && x.buyBelow && px / x.buyBelow - 1 < 0.03) rows.push([x.us, 'SWING', 'g-watch', `${x.t}: buy signal after a close of ${x.us} below ${f2(x.buyBelow)}`, pct(x.buyBelow / px - 1)]);
      }
    }
    if (st.P && st.P.reset) rows.push([null, 'RESET', 'g-watch', `Back to target on ${nextReset()}`, '']);
    if (!rows.length) return;
    const c = card(box, 'watchc', 'What would change this');
    for (const [us, pill, cls, text, gap] of rows) {
      const r = c.appendChild(el('button', 'g-wrow')); r.type = 'button'; if (us) r.addEventListener('click', () => SR.open && SR.open(us));
      r.appendChild(el('span', 'g-pill ' + cls, pill)); r.appendChild(el('span', 'g-wrow-t', text)); r.appendChild(el('b', 'g-wrow-g', gap));
    }
  }

  // ---- Today, card 4: new money, as a slider (buys only: no sale, no tax) ----
  function moneyOrders(st, add) {
    if (!st.T || add <= 0) return [];
    const need = st.T.map((l) => Math.max(0, (st.size + add) * l.w - (st.cur[l.t] || 0))), tot = need.reduce((x, y) => x + y, 0) || 1;
    return st.T.map((l, i) => ({ side: 'buy', t: l.t, line: l, kind: 'money', eur: Math.round(add * need[i] / tot / 10) * 10, target: (st.size + add) * l.w, held: st.cur[l.t] || 0 })).filter((o) => o.eur >= 10).sort((a, b) => (a.t === 'CASH') - (b.t === 'CASH') || b.eur - a.eur);
  }
  function moneyCard(box, H, st) {
    if (!st.T) return;
    const c = card(box, 'money', 'Adding money?');
    if (!ui.moneyOpen) {
      c.appendChild(el('div', 'g-line g-muted', 'See what to buy with new money: no sale, so no tax.'));
      c.appendChild(btn('Try an amount', '', () => { ui.moneyOpen = true; SRApp.renderDraw('today'); })); return;
    }
    const head = c.appendChild(el('div', 'g-slide-h')), amt = head.appendChild(el('b', 'g-slide-v', eur(ui.add)));
    const x = head.appendChild(el('button', 'g-link', 'close')); x.type = 'button'; x.addEventListener('click', () => { ui.moneyOpen = false; SRApp.renderDraw('today'); });
    const sl = c.appendChild(el('input', 'g-slider')); sl.type = 'range'; sl.min = '0'; sl.max = '3000'; sl.step = '50'; sl.value = String(ui.add); sl.setAttribute('aria-label', 'Amount to add, in euros');
    const out = c.appendChild(el('div', 'g-ords')), note = c.appendChild(el('div', 'g-hint'));
    const paint = () => {
      out.replaceChildren(); amt.textContent = eur(ui.add);
      const O = moneyOrders(st, ui.add), tot = { ...st, total: st.total + ui.add };
      for (const o of O) orderRow(out, o, tot, H, 'quiet');
      const v0 = mixVol(partsNow(H)), v1 = mixVol([...partsNow(H), ...O.map((o) => ({ sym: o.line.us || 'CASH', eur: o.eur }))]);
      note.textContent = !ui.add ? 'Move the slider.' : (v0 && v1 ? `Your portfolio's swings: ${p0(v0)} a year → ${p0(v1)}. ` : '') + 'Goes to the plan lines furthest below target. Orders under €400 pay the €1 minimum fee.';
    };
    sl.addEventListener('input', () => { ui.add = +sl.value; paint(); });
    sl.addEventListener('pointerdown', () => { ui.busy = true; }); sl.addEventListener('pointerup', () => { ui.busy = false; }); sl.addEventListener('pointercancel', () => { ui.busy = false; });
    paint();
  }

  // ---- Today ----
  dash.draw('today', (outer) => {
    const H = holdings(), st = planState(H), c0 = cfg();
    outer.replaceChildren();
    // a wide window (the Mac): what to do on the left, what the screener found on the right; one column on a phone
    const two = window.innerWidth >= 1100, box = two ? outer.appendChild(el('div', 'g-col')) : outer, right = two ? outer.appendChild(el('div', 'g-col')) : outer;
    outer.classList.toggle('g-two', two);
    hero(box, H);
    if (c0.source !== 'yahoo' && !(c0.apiKey && c0.userKey)) {
      const c = card(box, 'warn', 'Connect eToro for live prices');
      c.appendChild(btn('Open settings', 'primary', () => window.appOpenSettings && window.appOpenSettings()));
    }
    if (st.P && st.P.signal && !sig) loadSignal();
    verdictCard(box, H, st);
    scoutCard(right);
    setupCard(box, H, st);
    watchCard(right, H, st);
    moneyCard(box, H, st);
  });

  // ---- Portfolio: now against the plan, then every holding (tap for why) ----
  function bucketBars(c, H, st) {
    const live = H.filter((h) => h.value > 0), tot = st.total || 1, now = [], tgt = [];
    let kept = 0, out = 0;
    for (const h of live) { if (st.keep.has(h.ticker)) kept += h.value; else if (!lineFor(h, st.T)) out += h.value; }
    for (const l of st.T) { now.push([l.t, (st.cur[l.t] || 0) / tot]); tgt.push([l.t, st.size * l.w / tot]); }
    now.push(['OUT', out / tot], ['KEPT', kept / tot]); tgt.push(['KEPT', kept / tot]);
    const bar = (label, segs) => {
      const r = c.appendChild(el('div', 'g-stack-row')); r.appendChild(el('span', 'g-stack-l', label));
      const b = r.appendChild(el('div', 'g-stackbar'));
      for (const [k, w] of segs) if (w > 0.004) { const s = b.appendChild(el('span')); s.style.width = w * 100 + '%'; s.style.background = COLOR[k] || '#94a3b8'; s.title = `${k} ${p0(w)}`; }
    };
    bar('Now', now); bar('Plan', tgt);
    const lg = c.appendChild(el('div', 'g-legend'));
    const seen = new Map(); for (const [k, w] of [...now, ...tgt]) seen.set(k, Math.max(seen.get(k) || 0, w));
    for (const [k, w] of seen) if (w > 0.004) { const s = lg.appendChild(el('span')); const i = s.appendChild(el('i', 'g-dot')); i.style.background = COLOR[k] || '#94a3b8'; s.appendChild(document.createTextNode(' ' + (k === 'OUT' ? 'Outside the plan' : k === 'KEPT' ? 'Kept' : k === 'CASH' ? 'Cash' : k))); }
  }
  function holdingSheet(h, st, H) {
    const line = st.T ? lineFor(h, st.T) : null, kept = st.keep.has(h.ticker);
    sheet(`${h.ticker} · ${eur(h.value)}`, (s) => {
      s.appendChild(el('div', 'g-sheet-lead', `${nameOf(h.ticker, H) || h.name || h.ticker}${h.tracks && h.tracks !== h.ticker ? ` (follows ${h.tracks})` : ''}`));
      kv(s, 'Share', `${p0(h.value / (st.total || 1))} of your portfolio${h.chg != null ? ` · ${pct(h.chg)} today` : ''}`);
      if (st.P) kv(s, 'In the plan', kept ? 'Kept outside the plan: the app never asks you to sell it.' : line ? `Plan line ${line.t}: target ${eur(st.size * line.w)}, you hold ${eur(st.cur[line.t] || 0)}.` : st.T && lineFor(h, allLines(st.p)) ? 'Part of the plan, but its signal is off: Today asks you to sell it.' : `Outside “${st.P.name}”: the set-up on Today would sell it. No deadline.`);
      if (h.overheated) kv(s, 'Flag', 'Overheated (weekly RSI above 70): in the tests, sector funds earned less over the next 3 months. Don\'t add.');
      const row = s.appendChild(el('div', 'g-btns'));
      if (st.P && !line) row.appendChild(btn(kept ? 'Let the plan use it' : `Keep ${h.ticker}`, 'primary', () => { const q = plan(), k = keepSet(q, H); if (kept) k.delete(h.ticker); else k.add(h.ticker); q.keep = [...k]; closeSheet(); savePlan(q); toast(kept ? `${h.ticker} is back in the set-up.` : `${h.ticker} kept.`); }));
      row.appendChild(btn('Open chart', '', () => { closeSheet(); openHolding(h); }));
    });
  }
  dash.draw('pfolio', (outer) => {
    const all = holdings(), H = all.filter((h) => h.value > 0).sort((a, b) => b.value - a.value), T = totals(H), st = planState(all);
    outer.replaceChildren();
    // a wide window (the Mac): the total and the plan on the left, every holding on the right; one column on a phone
    const two = window.innerWidth >= 1100, box = two ? outer.appendChild(el('div', 'g-col')) : outer, right = two ? outer.appendChild(el('div', 'g-col')) : outer;
    outer.classList.toggle('g-two', two);
    hero(box, H);
    if (st.T && st.size > 0) {
      const c = card(box, 'mix', 'Now against your plan');
      bucketBars(c, all, st);
      const v0 = mixVol(partsNow(all)), v1 = mixVol(partsPlan(all, st)), vs = mixVol([{ sym: 'SPY', eur: 1 }]);
      if (v0 && vs) c.appendChild(el('div', 'g-line g-vol', `Swings over the last 12 months: ${p0(v0)} a year now${v1 ? `, ${p0(v1)} on plan` : ''}. S&P 500: ${p0(vs)}.`));
    } else if (!st.P) {
      const c = card(box, 'mix'); c.appendChild(el('div', 'g-line g-muted', 'No plan chosen: this is just what you hold.')); c.appendChild(btn('Choose a plan', '', () => go('plan', 0)));
    }
    const list = right.appendChild(el('div', 'g-list'));
    const max = d3.max(H, (h) => h.value) || 1;
    for (const h of H) {
      const r = list.appendChild(el('button', 'g-row')); r.type = 'button';
      r.addEventListener('click', () => holdingSheet(h, st, all));
      const a = r.appendChild(el('div', 'g-row-a'));
      a.appendChild(el('b', '', h.ticker));
      a.appendChild(el('span', 'g-muted g-row-n', NAME[h.ticker] || h.name || (h.tracks !== h.ticker ? 'follows ' + h.tracks : '')));
      const b = r.appendChild(el('div', 'g-row-b'));
      const bar = b.appendChild(el('span', 'g-row-bar')); bar.style.width = (h.value / max) * 100 + '%';
      const v = r.appendChild(el('div', 'g-row-v'));
      v.appendChild(el('b', '', eur(h.value)));
      v.appendChild(el('span', 'g-row-c ' + (h.chg >= 0.0005 ? 'up' : h.chg <= -0.0005 ? 'down' : ''), h.chg == null ? (h.live ? '' : 'not live') : pct(h.chg)));
      const tags = r.appendChild(el('div', 'g-row-tags'));
      if (h.overheated) tags.appendChild(el('span', 'g-chip g-chip-hot', 'Overheated'));
      if (st.P) {
        if (st.keep.has(h.ticker)) tags.appendChild(el('span', 'g-chip', 'Kept'));
        else if (st.T ? lineFor(h, st.T) : planTickers(st.p).has(h.ticker)) tags.appendChild(el('span', 'g-chip g-chip-plan', 'Plan'));
        else if (st.T && lineFor(h, allLines(st.p))) tags.appendChild(el('span', 'g-chip g-chip-hot', 'Signal: sell'));
        else tags.appendChild(el('span', 'g-chip g-chip-sell', 'Outside'));
      }
      tags.appendChild(el('span', 'g-muted', T.total ? p0(h.value / T.total) + ' of portfolio' : ''));
    }
    if (!H.length) list.appendChild(el('div', 'g-line g-muted', 'No holdings yet.'));
    const row = box.appendChild(el('div', 'g-btns'));
    row.appendChild(btn('Edit holdings', '', () => { if (window.appOpenSettings) window.appOpenSettings('holdings'); }));
  });

  // ---- Plan: three choices with the same three numbers, then your switches ----
  dash.draw('plan', (outer) => {
    const p = plan(), H = holdings(), st = planState(H);
    outer.replaceChildren();
    // a wide window (the Mac): the choice on the left, what it means for you on the right; one column on a phone
    const two = window.innerWidth >= 1100, box = two ? outer.appendChild(el('div', 'g-col')) : outer, right = two ? outer.appendChild(el('div', 'g-col')) : outer;
    outer.classList.toggle('g-two', two);
    box.appendChild(el('h2', 'g-h2', 'Your plan'));
    box.appendChild(el('p', 'g-muted g-sub', 'Pick one. Today then says each day whether to act. Numbers: 2000–2026, after 0.35% per order and 31.4% French tax.'));
    const grid = box.appendChild(el('div', 'g-plans'));
    const opt = (id, name, line, k) => {
      const b = grid.appendChild(el('button', 'g-plan' + (p.id === id ? ' is-on' : ''))); b.type = 'button'; b.setAttribute('aria-pressed', String(p.id === id));
      const h = b.appendChild(el('div', 'g-plan-h')); h.appendChild(el('b', '', name)); if (p.id === id) h.appendChild(el('span', 'g-pill g-in', 'Selected'));
      b.appendChild(el('div', 'g-plan-l', line));
      const s = k && study(k);
      if (s) {
        const n = b.appendChild(el('div', 'g-plan-n'));
        for (const [v, lab] of [[pct(s.cagr_tax != null ? s.cagr_tax : s.cagr), 'a year after tax'], [pct(s.max_dd, 0), 'worst drop'], [s.orders != null ? f0(s.orders) : '—', 'orders a year']]) { const d = n.appendChild(el('div')); d.appendChild(el('b', '', v)); d.appendChild(el('span', '', lab)); }
      }
      b.addEventListener('click', () => { const q = plan(); q.id = id; savePlan(q); if (id === 'smh') loadSignal(); });
    };
    for (const id of ['smh', 'core', 'spx']) opt(id, PLANS[id].name, PLANS[id].line, PLANS[id].study);
    opt(null, 'No plan', 'Just track my holdings and the market.', null);
    box.appendChild(el('p', 'g-muted g-sub', 'Past results, not a promise. The reliable difference between them is the size of the drops, not the return.'));
    if (!st.P) return;
    const PT = planTickers(p), keep = keepSet(p, H), own = H.filter((h) => h.value > 0 && !PT.has(h.ticker));
    if (own.length) {
      const kc = card(right, 'keepc', 'Keep outside the plan');
      kc.appendChild(el('div', 'g-line g-muted', 'Tap to keep. What is not kept is what the set-up on Today moves into the plan.'));
      const chips = kc.appendChild(el('div', 'g-chips'));
      for (const h of own) {
        const on = keep.has(h.ticker), b = chips.appendChild(el('button', 'g-chip g-toggle' + (on ? ' is-on' : ''), (on ? '✓ ' : '') + h.ticker)); b.type = 'button';
        b.setAttribute('aria-pressed', String(on));
        b.addEventListener('click', () => { const q = plan(), k = keepSet(q, H); if (k.has(h.ticker)) k.delete(h.ticker); else k.add(h.ticker); q.keep = [...k]; savePlan(q); });
      }
    }
    if (p.id !== 'spx') {
      const sc = card(right, 'swingc', 'Swing trades'), on = p.swing !== false;
      sc.appendChild(el('div', 'g-line g-muted', 'Optional. Buys sharp drops in a downtrend with the cash waiting for semis, for a few days. In the audit it added 0 to 1.5 points a year after fees and tax, and only when traded at the 09:00 open.'));
      const b = sc.appendChild(el('button', 'g-switch' + (on ? ' is-on' : ''), on ? 'On: swing signals count on Today' : 'Off: plan signals only')); b.type = 'button'; b.setAttribute('role', 'switch'); b.setAttribute('aria-checked', String(on));
      b.addEventListener('click', () => { const q = plan(); q.swing = !on; savePlan(q); });
    }
    const tc = card(right, 'hold', `What to hold · ${eur(st.size)}`);
    if (p.id === 'smh') tc.appendChild(el('div', 'g-line g-muted', st.inn == null ? 'Checking the semis signal…' : st.inn ? 'Semis are IN: that half sits in SEC0.' : st.swing ? 'Semis are OUT, but a swing trade in SEC0 is on.' : 'Semis are OUT: that half waits in cash.'));
    if (st.T) {
      const t = tc.appendChild(el('table', 'g-table'));
      t.innerHTML = '<thead><tr><th>Revolut</th><th></th><th class="num">Target</th><th class="num">You hold</th></tr></thead>';
      const tb = t.appendChild(el('tbody'));
      for (const x of st.T) {
        const tr = tb.appendChild(el('tr'));
        tr.appendChild(el('td', '', x.t === 'CASH' ? 'Cash' : x.t)).style.fontWeight = '600';
        tr.appendChild(el('td', 'g-muted', x.name));
        tr.appendChild(el('td', 'num', eur(st.size * x.w)));
        tr.appendChild(el('td', 'num', eur(st.cur[x.t] || 0)));
      }
    }
    tc.appendChild(el('div', 'g-hint', st.P.risk));
    box.appendChild(btn('See the 26-year test', '', () => go('plan', 1)));
  });

  // live: Today and Portfolio follow the prices (every 10 s while open); the semis signal every 30 minutes
  setInterval(() => { if (document.hidden || ui.busy) return; SRApp.renderDraw('today'); SRApp.renderDraw('pfolio'); }, 10000);
  setInterval(() => { if (!document.hidden && plan().id === 'smh') loadSignal(); }, 5 * 60000);
  SRApp.onChange(() => { if (plan().id === 'smh') { if (window.SRLive && window.SRLive.want) window.SRLive.want('guide', [SMH_ID]); loadSignal(); } });
  window.SRGuide = { PLANS, planState: () => planState(holdings()), swingOrders: () => { const H = holdings(); return swingOrders(H, planState(H)); }, signal: () => sig, computeSignal, weekEnd };
})();
