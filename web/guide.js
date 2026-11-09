// Today, Portfolio and Plan: the guided screens. One plan drives clear buy/sell steps; everything else is a tap away.
(function () {
  'use strict';
  if (typeof document === 'undefined') return;
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const btn = (label, cls, fn) => { const b = el('button', 'btn ' + (cls || ''), label); b.type = 'button'; b.addEventListener('click', fn); return b; };
  const eur = (x, sign) => (x == null || !isFinite(x) ? '—' : (sign && x > 0 ? '+' : x < 0 ? '−' : '') + '€' + d3.format(',.0f')(Math.abs(x)));
  const pct = (x, d = 1) => { if (x == null || !isFinite(x)) return '—'; const s = d3.format(`.${d}%`)(Math.abs(x)); return (/^0\.0*%$/.test(s) ? '' : x > 0 ? '+' : '−') + s; };
  const day = (t) => d3.utcFormat(new Date(t).getUTCFullYear() === new Date().getUTCFullYear() ? '%a %-d %b' : '%-d %b %Y')(new Date(t));
  const cfg = () => SRApp.config();
  const plan = () => Object.assign({ id: null, add: 0, done: {} }, cfg().plan || {});
  function savePlan(p) { const c = cfg(); c.plan = p; SRApp.saveConfig(c); if (window.SRSync) window.SRSync.pushSoon(); redraw(); }
  const redraw = () => { for (const n of ['today', 'pfolio', 'plan']) SRApp.renderDraw(n); };
  const go = (tab, sub) => { if (window.appShowTab) window.appShowTab(tab, sub); };

  // ---- the two plans (both tested on the app's 15-year basis, see the Plan tab's 15 years) ----
  const DEFL = [['ZPDS', 'XLP', 'Consumer staples'], ['ZPDU', 'XLU', 'Utilities'], ['ZPDH', 'XLV', 'Health care']];
  const HAVENS = { cash: { t: 'CASH', name: 'Cash (Revolut)', study: 'smhplan' } }; // gold miners failed the 25-year test (more swings than the S&P 500)
  const PLANS = {
    smh: {
      name: 'Semis on trend + defensive',
      line: 'Half in semiconductors (SEC0) while they trend; after a 15% fall that half waits in cash until SEC0\'s US twin closes above its 30-week average. Half in staples, utilities and health care.',
      risk: 'Passed the 2000–2011 blind test. After French tax (31.4% on each sale) it earned about what the S&P 500 did, with far smaller drops (−38% vs −55%). About 7 trades a year.',
      study: (p) => (HAVENS[p.haven] || HAVENS.cash).study,
      targets: (inn, p) => { const hv = HAVENS[p.haven] || HAVENS.cash; return [inn ? { t: 'SEC0', us: 'SMH', name: 'Semiconductors', w: 0.5 } : { t: hv.t, us: hv.us, name: hv.name, w: 0.5 },
        ...DEFL.map(([t, us, name]) => ({ t, us, name, w: 0.5 / 3 }))]; },
    },
    core: {
      name: 'Nasdaq + defensive',
      line: '50% Nasdaq-100, 50% staples, utilities and health care. Reset to target every January and July.',
      risk: 'Passed the blind test; 2 trades a year, so little tax drag: slightly ahead of the S&P 500 after tax since 2004. But in the 2000–02 tech crash it fell further (−58% vs −55%).',
      study: () => 'qqqdef',
      targets: () => [{ t: 'SXRV', us: 'QQQ', name: 'Nasdaq-100', w: 0.5 }, ...DEFL.map(([t, us, name]) => ({ t, us, name, w: 0.5 / 3 }))],
    },
  };
  const NAME = { SXRV: 'Nasdaq-100', SEC0: 'Semiconductors', IS0E: 'Gold miners', CASH: 'Cash (Revolut)', ZPDS: 'Consumer staples', ZPDU: 'Utilities', ZPDH: 'Health care' };
  const planTickers = (p) => { const P = PLANS[p.id]; return P ? new Set([...P.targets(true, p), ...P.targets(false, p)].map((x) => x.t)) : new Set(); };
  const planLines = (p) => { const P = PLANS[p.id]; return P ? [...P.targets(true, p), ...P.targets(false, p)] : []; };
  const lineFor = (h, lines) => lines.find((l) => l.t === h.ticker) || lines.find((l) => l.us && h.tracks === l.us) || null;
  const inPlanAny = (h, p) => !!lineFor(h, planLines(p));
  const keepSet = (p, H) => new Set(Array.isArray(p.keep) ? p.keep : H.filter((h) => h.long_term).map((h) => h.ticker));

  // ---- themes: what each holding is exposed to, so the rotation reads in percentages ----
  const THEME = { SEC0: 'Semiconductors', VVSM: 'Semiconductors', MRVL: 'Semiconductors', AAOI: 'Semiconductors', VUAA: 'Broad market', EXI2: 'Broad market', SXRV: 'Nasdaq-100',
    AG: 'Gold & silver', IS0E: 'Gold & silver', CCJ: 'Uranium', NXE: 'Uranium', QUTM: 'Quantum', MSTR: 'Bitcoin (MSTR)', SPCX: 'SpaceX', ZPDS: 'Defensive', ZPDU: 'Defensive', ZPDH: 'Defensive', CASH: 'Cash' };
  const BY_TRACK = { SMH: 'Semiconductors', SPY: 'Broad market', QQQ: 'Broad market', GDX: 'Gold & silver', SIL: 'Gold & silver', GLD: 'Gold & silver', URA: 'Uranium', XLP: 'Defensive', XLU: 'Defensive', XLV: 'Defensive' };
  const themeOf = (t, tracks) => THEME[t] || BY_TRACK[tracks] || t;
  const TCOL = { 'Semiconductors': '#7b61ff', 'Broad market': '#2f6fed', 'Nasdaq-100': '#2f6fed', 'Gold & silver': '#d4a017', 'Uranium': '#2fa66a', 'Quantum': '#12a4b8',
    'Bitcoin (MSTR)': '#f08a24', 'SpaceX': '#6b7280', 'Defensive': '#e05a8a', 'Cash': '#a8b0ba' };
  const colorOf = (th) => TCOL[th] || '#94a3b8';

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
  function totals(H) {
    const T = SR.liveTotals ? SR.liveTotals() : null;
    return T || { total: H.reduce((s, h) => s + (h.value || 0), 0), today: null, todayPct: null };
  }

  // ---- the semiconductor signal: SMH weekly closes (completed weeks only) ----
  const SMH_ID = SRApp.idOf('SMH');
  let sig = null, sigAt = 0, sigBusy = false;
  function weekEnd(t) { // Friday 21:15 UTC of the week a candle belongs to (after the US close, summer or winter)
    const d = new Date(t + 2 * 864e5), mon = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - ((d.getUTCDay() + 6) % 7) * 864e5;
    return mon + 4 * 864e5 + (21 * 60 + 15) * 60e3;
  }
  const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  function computeSignal(w) {
    if (w.length < 110) return { error: 'not enough history' };
    let inn = true, since = w[51].end;
    for (let i = 51; i < w.length; i++) {
      const c = w[i].close, hi = Math.max(...w.slice(i - 51, i + 1).map((x) => x.close)), sma = mean(w.slice(i - 29, i + 1).map((x) => x.close));
      if (inn && c < 0.85 * hi) { inn = false; since = w[i].end; } else if (!inn && c > sma) { inn = true; since = w[i].end; }
    }
    const L = w.length - 1, closes = w.map((x) => x.close);
    return {
      inn, since, close: closes[L], at: w[L].end,
      // next Friday: out if it closes below 85% of the 52-week high; back in if it closes above the new 30-week average
      exitAt: 0.85 * Math.max(...closes.slice(L - 50)), backAt: mean(closes.slice(L - 28)),
      hist: w.slice(-52).map((x, k, a) => ({ end: x.end, close: x.close, sma: mean(closes.slice(L - 51 + k - 29, L - 51 + k + 1)), stop: 0.85 * Math.max(...closes.slice(L - 51 + k - 51, L - 51 + k + 1)) })),
    };
  }
  async function loadSignal(force) {
    if (sigBusy || !SMH_ID || !window.SRLive || !window.SRLive.candles) return;
    if (!force && sig && Date.now() - sigAt < 30 * 60e3) return;
    sigBusy = true;
    try {
      const rows = await window.SRLive.candles(SMH_ID, 'OneWeek', 200);
      sig = computeSignal(rows.filter((r) => weekEnd(r.t) <= Date.now()).map((r) => ({ close: r.close, end: weekEnd(r.t) })));
    } catch (e) { sig = { error: 'eToro did not answer (' + (e.status || 'no connection') + ')' }; }
    sigAt = Date.now(); sigBusy = false; redraw();
  }
  const smhNow = () => { const q = window.SRLive && window.SRLive.quotes.get(SMH_ID); return q ? q.price : null; };

  // ---- what the plan asks for now: from your holdings to the plan, as one list of orders ----
  function planState(H) {
    const p = plan(), P = PLANS[p.id];
    const st = { p, P, actions: [], cur: {}, size: 0, inPlan: 0, T: null, inn: null };
    if (!P) return st;
    st.inn = p.id === 'smh' ? (sig && !sig.error ? sig.inn : null) : true;
    if (st.inn == null) return st;
    // semis out of trend but a swing trade is on (bought a sharp dip): that half stays in SEC0 until the swing sells
    const sw = p.id === 'smh' && st.inn === false && SRApp.swing ? SRApp.swing().find((y) => y.us === 'SMH') : null;
    st.swing = sw && sw.inTrade ? sw : null;
    const keep = keepSet(p, H), PT = planTickers(p);
    let T = P.targets(st.inn || !!st.swing, p);
    if (st.swing) T = T.map((l) => (l.t === 'SEC0' ? { ...l, name: 'Semiconductors (swing trade)' } : l));
    st.T = T; st.keep = keep;
    const scope = H.filter((h) => !keep.has(h.ticker) && h.value > 0);
    const other = {}; // holdings not on a current line, by ticker
    for (const h of scope) { const l = lineFor(h, T); if (l) st.cur[l.t] = (st.cur[l.t] || 0) + h.value; else other[h.ticker] = (other[h.ticker] || 0) + h.value; }
    st.size = scope.reduce((x, h) => x + h.value, 0) + (p.add > 0 ? p.add : 0);
    if (st.swing && st.size > 0) { // during a semis swing trade: keep the SEC0 you hold, don't add; the rest of that half waits in cash
      const held = Math.min(0.5, (st.cur.SEC0 || 0) / st.size);
      T = T.map((l) => (l.t === 'SEC0' ? { ...l, w: held } : l));
      if (0.5 - held > 0.001) T.push({ t: 'CASH', name: 'Cash (Revolut)', w: 0.5 - held });
      st.T = T;
    }
    st.inPlan = T.reduce((x, l) => x + (st.cur[l.t] || 0), 0);
    if (st.size < 50) return st;
    const others = Object.keys(other);
    const outside = scope.filter((h) => other[h.ticker] && !inPlanAny(h, p)).map((h) => h.ticker);
    const drift = Math.max(...T.map((l) => Math.abs((st.cur[l.t] || 0) / st.size - l.w)));
    const now = new Date(), m = now.getUTCMonth(), key = `reset-${now.getUTCFullYear()}-${m + 1}`;
    const window_ = (m === 0 || m === 6) && now.getUTCDate() <= 15 && !p.done[key] && P === PLANS.core;
    let title = null;
    if (outside.length) title = st.inPlan < 0.05 * st.size ? `Switch to ${P.name}` : 'Move the rest into the plan';
    else if (p.add > 0) title = `Invest ${eur(p.add)} of new money`;
    else if (others.length) title = st.inn ? 'Semis are trending again: buy them back' : 'Semis fell 15%: move that half out';
    else if (window_) title = 'Twice-yearly reset';
    else if (drift > 0.10) title = 'Back to target (a line drifted 10 points)';
    if (!title) return st;
    const round = (x) => Math.round(x / 10) * 10, minOrder = Math.max(25, st.size * 0.01);
    const orders = others.map((t) => ({ side: 'sell', t, eur: round(other[t]), all: true }));
    for (const l of T) {
      const d = st.size * l.w - (st.cur[l.t] || 0);
      if (Math.abs(d) >= minOrder) orders.push({ side: d > 0 ? 'buy' : 'sell', t: l.t, eur: round(Math.abs(d)), all: d < 0 && st.size * l.w < 1 });
    }
    orders.sort((x, y) => (x.side === y.side ? y.eur - x.eur : x.side === 'sell' ? -1 : 1));
    st.actions.push({ title, orders, keep: [...keep].filter((t) => H.some((h) => h.ticker === t && h.value > 0)) });
    return st;
  }
  function nextReset() {
    const n = new Date(), y = n.getUTCFullYear(), m = n.getUTCMonth();
    const t = m < 6 ? Date.UTC(y, 6, 1) : Date.UTC(y + 1, 0, 1);
    return day(t);
  }
  function nextFriday() { const n = new Date(); const d = (5 - n.getUTCDay() + 7) % 7 || (n.getUTCHours() >= 21 ? 7 : 0); return day(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + d)); }

  function toast(msg) {
    const t = el('div', 'g-toast', msg); document.body.appendChild(t);
    setTimeout(() => t.classList.add('is-on'), 10); setTimeout(() => { t.classList.remove('is-on'); setTimeout(() => t.remove(), 400); }, 2600);
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
    c.appendChild(el('div', 'g-card-t', title));
    return c;
  }
  // the weakest fits go first: the most volatile holdings, where the swing rule also failed in the tests
  const FIRST_THEMES = ['Uranium', 'Gold & silver', 'Quantum'], FIRST_TICKERS = ['AAOI'];
  function splitOrders(a, H) {
    const sells = a.orders.filter((o) => o.side === 'sell' && o.t !== 'CASH'), buys = a.orders.filter((o) => o.side === 'buy' && o.t !== 'CASH');
    const keepCash = a.orders.find((o) => o.side === 'buy' && o.t === 'CASH');
    const hOf = (t) => (H || []).find((h) => h.ticker === t);
    const first = sells.filter((o) => FIRST_TICKERS.includes(o.t) || (hOf(o.t) && FIRST_THEMES.includes(themeOf(o.t, hOf(o.t).tracks))));
    const later = sells.filter((o) => !first.includes(o));
    const S = sells.reduce((x, o) => x + o.eur, 0) || 1, R10 = (x) => Math.round(x / 10) * 10;
    const mk = (ss) => { const k = ss.reduce((x, o) => x + o.eur, 0) / S; return { sells: ss, total: ss.reduce((x, o) => x + o.eur, 0), buys: buys.map((o) => ({ ...o, eur: R10(o.eur * k) })).filter((o) => o.eur >= 10), cash: keepCash ? R10(keepCash.eur * k) : 0 }; };
    return first.length && later.length ? [mk(first), mk(later)] : [mk(sells)];
  }
  function orderList(c, a, total, H) {
    const sells = a.orders.filter((o) => o.side === 'sell' && o.t !== 'CASH'), buys = a.orders.filter((o) => o.side === 'buy' && o.t !== 'CASH');
    const keepCash = a.orders.find((o) => o.side === 'buy' && o.t === 'CASH'), useCash = a.orders.find((o) => o.side === 'sell' && o.t === 'CASH');
    const hOf = (t) => (H || []).find((h) => h.ticker === t);
    const first = sells.filter((o) => FIRST_TICKERS.includes(o.t) || (hOf(o.t) && FIRST_THEMES.includes(themeOf(o.t, hOf(o.t).tracks))));
    const later = sells.filter((o) => !first.includes(o));
    const S = sells.reduce((x, o) => x + o.eur, 0) || 1, R10 = (x) => Math.round(x / 10) * 10;
    const share = (part) => part.reduce((x, o) => x + o.eur, 0) / S;
    let n = 0;
    const block = (title, sub, ss, k, withCash) => {
      c.appendChild(el('div', 'g-sec', title));
      if (sub) c.appendChild(el('div', 'g-hint g-sub2', sub));
      const ol = c.appendChild(el('ol', 'g-steps'));
      const step = (side, label, t, name, amt, all) => {
        if (amt < 10) return;
        const li = ol.appendChild(el('li', 'g-step'));
        li.appendChild(el('span', 'g-step-n', String(++n)));
        li.appendChild(el('span', 'g-side g-' + side, label));
        const w = li.appendChild(el('span', 'g-step-w')); w.appendChild(el('b', '', t)); if (name) w.appendChild(el('span', 'g-muted', name));
        const v = li.appendChild(el('span', 'g-step-v')); v.appendChild(el('b', '', (all ? 'all · ' : '') + eur(amt)));
        if (total) v.appendChild(el('span', 'g-muted', d3.format('.0%')(amt / total) + ' of portfolio'));
      };
      for (const o of ss) step('sell', 'Sell', o.t, NAME[o.t] || (hOf(o.t) && hOf(o.t).name) || '', o.eur, o.all);
      if (withCash && useCash) step('cash', 'Use', 'Cash', 'from Revolut', useCash.eur);
      for (const o of buys) step('buy', 'Buy', o.t, NAME[o.t] || '', R10(o.eur * k));
      if (keepCash) step('cash', 'Keep', 'Cash', 'stays in Revolut', R10(keepCash.eur * k));
    };
    if (first.length && later.length) {
      const k1 = share(first);
      block('Step 1 · start here', 'The most volatile holdings, where the swing rule also failed in the tests.', first, k1, true);
      block('Step 2 · when you are ready', 'Larger positions: check which are up before selling (gains are taxed at 31.4%).', later, 1 - k1, false);
    } else block('Orders on Revolut, in this order', '', sells, 1, true);
    if (a.keep && a.keep.length) {
      const kk = c.appendChild(el('div', 'g-keep'));
      kk.appendChild(el('span', 'g-muted', 'Don\'t touch: ')); kk.appendChild(el('b', '', a.keep.join(', ')));
      const ch = kk.appendChild(el('button', 'g-link', 'change')); ch.type = 'button'; ch.addEventListener('click', () => go('plan', 0));
    }
  }
  function spark(box, s) {
    const W = Math.max(260, box.clientWidth || 320), H = 110, m = { l: 4, r: 4, t: 6, b: 6 };
    const d = s.hist, x = d3.scaleLinear().domain([0, d.length - 1]).range([m.l, W - m.r]);
    const lo = d3.min(d, (r) => Math.min(r.close, r.stop)), hi = d3.max(d, (r) => Math.max(r.close, r.sma));
    const y = d3.scaleLinear().domain([lo * 0.97, hi * 1.02]).range([H - m.b, m.t]);
    const svg = d3.select(box).append('svg').attr('class', 'g-spark').attr('viewBox', `0 0 ${W} ${H}`).attr('width', '100%').attr('height', H).attr('role', 'img')
      .attr('aria-label', 'SMH weekly closes over the last year, with its 20-week average and the 15% stop');
    const line = (k) => d3.line().x((r, i) => x(i)).y((r) => y(r[k]));
    svg.append('path').datum(d).attr('d', line('stop')).attr('class', 'g-sp-stop');
    svg.append('path').datum(d).attr('d', line('sma')).attr('class', 'g-sp-sma');
    svg.append('path').datum(d).attr('d', line('close')).attr('class', 'g-sp-close');
    const L = d[d.length - 1];
    svg.append('circle').attr('cx', x(d.length - 1)).attr('cy', y(L.close)).attr('r', 3.5).attr('class', 'g-sp-dot');
    const k = box.appendChild(el('div', 'g-legend'));
    k.innerHTML = '<span><i class="g-k g-k-close"></i>SMH weekly close</span><span><i class="g-k g-k-sma"></i>30-week average</span><span><i class="g-k g-k-stop"></i>15% below the high</span>';
  }
  function signalCard(box) {
    const c = card(box, 'signal', 'Semiconductors');
    if (!sig) { c.appendChild(el('div', 'g-line g-muted', 'Checking SMH…')); return; }
    if (sig.error) { c.appendChild(el('div', 'g-line g-muted', 'No signal: ' + sig.error)); return; }
    const top = c.appendChild(el('div', 'g-sig'));
    top.appendChild(el('span', 'g-pill ' + (sig.inn ? 'g-in' : 'g-out'), sig.inn ? 'IN' : 'OUT'));
    top.appendChild(el('span', '', `since ${day(sig.since)} · SMH ${d3.format(',.0f')(sig.close)} at Friday's close`));
    const now = smhNow(), ref = now || sig.close;
    const lvl = sig.inn ? sig.exitAt : sig.backAt, gap = lvl / ref - 1;
    c.appendChild(el('div', 'g-line', sig.inn
      ? `Moves to ${(HAVENS[plan().haven] || HAVENS.cash).name.toLowerCase()} if a Friday close is below ${d3.format(',.0f')(lvl)} (${pct(gap)} from ${now ? 'now' : 'Friday'}).`
      : `Back in if a Friday close is above ${d3.format(',.0f')(lvl)} (${pct(gap)} from ${now ? 'now' : 'Friday'}).`));
    spark(c, sig);
    c.classList.add('g-tap'); c.addEventListener('click', () => SR.open && SR.open('SMH'));
  }

  function rotation(H, st) {
    const live = H.filter((h) => h.value > 0), total = live.reduce((x, h) => x + h.value, 0);
    if (!total) return null;
    const now = {}, tgt = {};
    for (const h of live) { const th = themeOf(h.ticker, h.tracks); now[th] = (now[th] || 0) + h.value / total; }
    if (st.T) {
      const kept = live.filter((h) => st.keep && st.keep.has(h.ticker)), K = kept.reduce((x, h) => x + h.value, 0);
      for (const h of kept) { const th = themeOf(h.ticker, h.tracks); tgt[th] = (tgt[th] || 0) + h.value / total; }
      for (const l of st.T) { const th = themeOf(l.t, l.us); tgt[th] = (tgt[th] || 0) + (1 - K / total) * l.w; }
    }
    const themes = [...new Set([...Object.keys(now), ...Object.keys(tgt)])];
    const rows = themes.map((th) => ({ th, now: now[th] || 0, tgt: st.T ? tgt[th] || 0 : null })).map((r) => ({ ...r, d: r.tgt == null ? 0 : r.tgt - r.now }));
    rows.sort((x, y) => (st.T ? Math.abs(y.d) - Math.abs(x.d) : y.now - x.now) || y.now - x.now);
    return { total, rows, moved: rows.reduce((x, r) => x + Math.max(0, -r.d), 0) };
  }
  function stackBar(parent, label, rows, key) {
    const r = parent.appendChild(el('div', 'g-stack-row'));
    r.appendChild(el('span', 'g-stack-l', label));
    const bar = r.appendChild(el('div', 'g-stackbar'));
    for (const x of rows) if (x[key] > 0.004) { const seg = bar.appendChild(el('span')); seg.style.width = x[key] * 100 + '%'; seg.style.background = colorOf(x.th); seg.title = `${x.th} ${d3.format('.0%')(x[key])}`; }
  }
  function rotationCard(box, H, st) {
    const R = rotation(H, st); if (!R) return;
    const c = card(box, 'rot', 'Your rotation');
    const sgn = st.P && st.p.id === 'smh' && sig && !sig.error;
    let verdict;
    if (!st.P) verdict = 'Your live mix by theme. Choose a plan to see where it should go.';
    else if (!st.T) verdict = 'Checking the semis signal…';
    else if (R.moved < 0.03) verdict = '✓ On target. Nothing to rotate.';
    else verdict = `${sgn ? (sig.inn ? 'Semis are in trend. ' : st.swing ? `Semis are out of trend, but a swing trade is on: keep SEC0 until SMH closes above ${d3.format(',.0f')(st.swing.sellAbove)}. ` : `Semis are out of trend (${pct(sig.close / Math.max(...sig.hist.map((x) => x.close)) - 1, 0)} from their high). `) : ''}Rotate ${d3.format('.0%')(R.moved)} of your portfolio.`;
    c.appendChild(el('div', 'g-verdict' + (R.moved < 0.03 && st.T ? ' g-good' : ''), verdict));
    stackBar(c, 'Now', R.rows, 'now');
    if (st.T) stackBar(c, 'Target', R.rows, 'tgt');
    if (st.T && R.moved >= 0.03) {
      const tg = c.appendChild(el('button', 'g-link g-more', 'By theme: what rotates into what')); tg.type = 'button';
      const fb = c.appendChild(el('div', 'g-flows')); fb.hidden = true;
      tg.addEventListener('click', () => { fb.hidden = !fb.hidden; });
      for (const f of flows(R, st, H)) {
        const m = fb.appendChild(el('div', 'g-flow'));
        const top = m.appendChild(el('div', 'g-flow-t'));
        const from = top.appendChild(el('span', 'g-tag')); from.style.setProperty('--c', colorOf(f.from)); from.textContent = f.from;
        top.appendChild(el('b', 'g-flow-p', d3.format('.0%')(f.pct)));
        top.appendChild(el('span', 'g-arrow', '→'));
        for (const [to, x] of f.to) { const t = top.appendChild(el('span', 'g-tag')); t.style.setProperty('--c', colorOf(to)); t.textContent = f.to.length > 1 ? `${to} ${d3.format('.0%')(x)}` : to; }
        m.appendChild(el('div', 'g-flow-s', f.how));
      }
      const same = R.rows.filter((r) => Math.abs(r.d) < 0.02 && r.now >= 0.005);
      if (same.length) fb.appendChild(el('div', 'g-hint', 'Unchanged: ' + same.map((r) => `${r.th} ${d3.format('.0%')(r.now)}`).join(' · ')));
    }
    if (st.actions.length) {
      orderList(c, st.actions[0], R.total, H);
      c.appendChild(el('div', 'g-hint', 'In each step, sell first, then buy with the proceeds. Positions at a loss can be sold without tax. After trading, send Claude a screenshot of Revolut.'));
    }
    if (!st.P) {
      const list = c.appendChild(el('div', 'g-moves'));
      for (const r of R.rows) { if (r.now < 0.005) continue; const m = list.appendChild(el('div', 'g-move')); const dot = m.appendChild(el('span', 'g-dot')); dot.style.background = colorOf(r.th); m.appendChild(el('span', 'g-move-n', r.th)); m.appendChild(el('span', 'g-move-v', d3.format('.0%')(r.now))); m.appendChild(el('span', '')); }
      c.appendChild(btn('Choose a plan', 'primary', () => go('plan', 0)));
    }
  }
  // pair what goes down with what goes up: semis go to the haven first, everything else to defensives first
  function flows(R, st, H) {
    const hv = st.p.id === 'smh' ? (HAVENS[st.p.haven] || HAVENS.cash).name : null, havenTh = hv ? themeOf((HAVENS[st.p.haven] || HAVENS.cash).t, (HAVENS[st.p.haven] || HAVENS.cash).us) : null;
    const downs = R.rows.filter((r) => r.d <= -0.02).map((r) => ({ th: r.th, left: -r.d })).sort((x, y) => y.left - x.left);
    const ups = R.rows.filter((r) => r.d >= 0.005).map((r) => ({ th: r.th, left: r.d }));
    const pref = (th) => [...ups].sort((x, y) => {
      const rank = (u) => (th === 'Semiconductors' && u.th === havenTh ? 0 : u.th === 'Defensive' ? 1 : u.th === havenTh ? 2 : 3);
      return rank(x) - rank(y);
    });
    const tick = (th, keepOut) => H.filter((h) => h.value > 0 && themeOf(h.ticker, h.tracks) === th && !(st.keep && st.keep.has(h.ticker)) && !lineFor(h, st.T)).map((h) => h.ticker).filter((t) => !keepOut.includes(t));
    const planBuys = (th) => st.T.filter((l) => themeOf(l.t, l.us) === th).map((l) => l.t);
    const out = [];
    for (const d of downs) {
      const to = [];
      for (const u of pref(d.th)) { if (d.left < 0.005) break; const x = Math.min(d.left, u.left); if (x < 0.005) continue; to.push([u.th, x]); u.left -= x; d.left -= x; }
      const pct_ = to.reduce((s_, [, x]) => s_ + x, 0);
      if (pct_ < 0.01) continue;
      const planSell = st.T.some((l) => themeOf(l.t, l.us) === d.th) ? [] : [];
      const sells = tick(d.th, planSell), buys = [...new Set(to.flatMap(([th]) => planBuys(th).filter((t) => t !== 'CASH')))];
      const cashOnly = to.every(([th]) => th === 'Cash');
      out.push({ from: d.th, pct: pct_, to, how: `Sell ${sells.length ? sells.join(', ') : 'part'}` + (buys.length ? ` · buy ${buys.join(', ')}` : '') + (cashOnly ? ' · keep the money in cash' : to.some(([th]) => th === 'Cash') ? ' · rest stays in cash' : '') });
    }
    return out;
  }

  // ---- if you add money instead of selling: which sector makes the whole portfolio steadier ----
  const CANDS = ['XLU', 'XLP', 'XLV', 'XLE', 'XLF', 'XLI', 'XLK', 'XLY', 'XLB', 'XLC', 'TLT', 'SPY', 'QQQ', 'GDX'];
  const SECTOR = { XLU: 'Utilities', XLP: 'Consumer staples', XLV: 'Health care', XLE: 'Energy', XLF: 'Financials', XLI: 'Industrials', XLK: 'Technology', XLY: 'Consumer discretionary',
    XLB: 'Materials', XLC: 'Communication', TLT: 'US long bonds', SPY: 'S&P 500', QQQ: 'Nasdaq-100', GDX: 'Gold miners' };
  const revTicker = (us) => { const r = (window.SR_REVOLUT || []).find((x) => x.us === us); return r ? r.revolut_ticker : us; };
  function series(sym) { const d = SRApp._store[sym]; if (!d || d.status !== 'ok' || !d.data.length) return null; const m = new Map(); let prev = null; for (const r of d.data) { if (prev) m.set(r.date, r.close / prev - 1); prev = r.close; } return { m, rows: d.data }; }
  let addCache = { key: '', v: null };
  function whereToAdd(H, addEur) {
    const live = H.filter((h) => h.value > 0), total = live.reduce((x, h) => x + h.value, 0);
    const key = live.map((h) => h.ticker + Math.round(h.value)).join() + '|' + Math.round(addEur) + '|' + (SRApp.state.at || 0);
    if (addCache.key === key) return addCache.v;
    const spy = series('SPY'); if (!spy || !total) return null;
    const dates = [...spy.m.keys()].slice(-252);
    const hs = live.map((h) => ({ w: h.value / total, s: series(h.tracks) })).filter((x) => x.s);
    const port = dates.map((dt) => { let r = 0, w = 0; for (const x of hs) { const v = x.s.m.get(dt); if (v != null) { r += x.w * v; w += x.w; } } return w > 0.5 ? r / w : null; });
    const sd = (a) => { const b = a.filter((x) => x != null); const mu = d3.mean(b); return Math.sqrt(d3.sum(b, (x) => (x - mu) ** 2) / (b.length - 1)) * Math.sqrt(252); };
    const volNow = sd(port), a = addEur / total, volSpy = sd(dates.map((dt) => spy.m.get(dt) ?? null));
    const RD = dash.data('rule'), RSI = new Map(RD.status === 'ok' ? RD.data.map((r) => [r.symbol, r.rsi_w]) : []);
    const res = [];
    for (const c of CANDS) {
      const cs = series(c); if (!cs) continue;
      const mix = dates.map((dt, i) => { const pc = port[i], rc = cs.m.get(dt); return pc == null || rc == null ? null : (pc + a * rc) / (1 + a); });
      const rows = cs.rows.slice(-253), ret1y = rows.length > 200 ? rows[rows.length - 1].close / rows[0].close - 1 : null;
      res.push({ us: c, t: revTicker(c), name: SECTOR[c] || c, vol: sd(mix), ret1y, hot: (RSI.get(c) || 0) > 70, held: live.some((h) => h.tracks === c) });
    }
    res.sort((x, y) => x.vol - y.vol);
    const v = { volNow, volSpy, a, addEur, res };
    addCache = { key, v };
    return v;
  }
  function addCard(box, H, st) {
    const T = totals(H), addEur = st.p.add > 0 ? st.p.add : Math.max(100, Math.round((T.total || 0) * 0.1 / 50) * 50);
    const W = whereToAdd(H, addEur); if (!W || !W.res.length) return;
    const c = card(box, 'add', 'Adding money instead of selling?');
    const best = W.res.filter((r) => !r.hot).slice(0, 3);
    c.appendChild(el('div', 'g-verdict', `Your portfolio swings ${d3.format('.0%')(W.volNow)} a year, the S&P 500 ${d3.format('.0%')(W.volSpy)}. Each ${eur(addEur)} you add steadies it most here:`));
    best.forEach((r, k) => {
      const m = c.appendChild(el('div', 'g-addrow'));
      m.appendChild(el('span', 'g-rank', String(k + 1)));
      const n = m.appendChild(el('div', 'g-addn')); n.appendChild(el('b', '', r.t)); n.appendChild(el('span', 'g-muted', r.name));
      const v = m.appendChild(el('div', 'g-addv'));
      v.appendChild(el('b', '', `${d3.format('.1%')(W.volNow)} → ${d3.format('.1%')(r.vol)}`));
      v.appendChild(el('span', 'g-muted', `volatility · last 12 months ${pct(r.ret1y, 0)}`));
    });
    const hot = W.res.filter((r) => r.hot).slice(0, 2);
    c.appendChild(el('div', 'g-hint', `From the last 12 months of daily moves of what you hold.${hot.length ? ' Skipped as overheated: ' + hot.map((r) => r.t).join(', ') + '.' : ''} Lower volatility is the reliable part; past returns don't predict.`));
  }

  // ---- swing trades in bear markets (runtime.js SRApp.swing: the tested 2000-2026 rule) ----
  function swingCard(box, st) {
    const S = SRApp.swing ? SRApp.swing() : []; if (!S.length) return;
    if (window.SRLive && window.SRLive.want) window.SRLive.want('swing', S.map((x) => SRApp.idOf(x.us)).filter(Boolean));
    const c = card(box, 'swing', 'Swing trades');
    const live = (x) => { const q = window.SRLive && window.SRLive.quotes.get(SRApp.idOf(x.us)); return q ? q.price : null; };
    const day = (d) => d3.utcFormat('%a %-d %b')(new Date(d + 'T00:00:00Z'));
    const rows = [], calm = [];
    for (const x of S) {
      const px = live(x) || x.close, f = (v) => d3.format(',.2f')(v);
      if (x.signal && x.signal.type === 'buy') rows.push([0, 'BUY', 'g-buy', x, `Buy at the open: sharp drop on ${day(x.date)} (RSI-2 ${Math.round(x.signal.rsi2)}).`]);
      else if (x.signal && x.signal.type === 'sell') rows.push([0, 'SELL', 'g-sell', x, `Sell at the open: closed above its 5-day average on ${day(x.date)} (trade ${pct(x.signal.gain)}).`]);
      else if (x.inTrade) {
        const hit = px > x.sellAbove;
        rows.push([1, 'IN', 'g-in', x, `Bought ${day(x.entry.date)} at ${f(x.entry.price)}, now ${pct(px / x.entry.price - 1)}. Sells at a close above ${f(x.sellAbove)}${hit ? ' (above it now: sells if it closes here)' : ` (${pct(x.sellAbove / px - 1)})`}. Day ${x.days + 1} of 10.`]);
      } else if (x.bear && x.buyBelow) {
        const hit = px < x.buyBelow;
        if (!hit && x.buyBelow < 0.92 * px) calm.push(x.name + ' (bear market, no sharp drop yet)');
        else rows.push([2, 'WATCH', 'g-watch', x, `Buys after a close below ${f(x.buyBelow)}${hit ? ' (below it now: buys if it closes here)' : ` (${pct(x.buyBelow / px - 1)})`}.`]);
      } else calm.push(x.name);
    }
    rows.sort((u, v) => u[0] - v[0]);
    for (const [, pill, cls, x, text] of rows) {
      const r = c.appendChild(el('button', 'g-swrow')); r.type = 'button'; r.addEventListener('click', () => SR.open && SR.open(x.us));
      const h = r.appendChild(el('div', 'g-swh'));
      h.appendChild(el('span', 'g-pill ' + cls, pill)); h.appendChild(el('b', '', x.t)); h.appendChild(el('span', 'g-muted', x.name));
      r.appendChild(el('div', 'g-swt', text));
    }
    if (!rows.length) c.appendChild(el('div', 'g-line g-muted', 'No swing setups: none of these funds is in a bear market.'));
    if (calm.length) c.appendChild(el('div', 'g-hint', 'No setup now: ' + calm.join(', ') + '.'));
    const waiting = st.P && st.p.id === 'smh' && st.inn === false ? (st.cur.CASH || 0) : 0;
    c.appendChild(el('div', 'g-hint', (waiting > 50 ? `Size: up to the ${eur(waiting)} waiting in cash for semis. ` : '') + 'Rule from the 2000–2026 test: while a fund is below its 200-day average, buy after a very sharp drop (RSI-2 below 5); sell at the first close above the 5-day average, or after 10 days. Signals come after the US close (22:00 Paris); act at the next open.'));
  }
  function signalRow(box) {
    if (!sig || sig.error) return;
    const now = smhNow(), ref = now || sig.close, lvl = sig.inn ? sig.exitAt : sig.backAt, gap = lvl / ref - 1;
    const r = box.appendChild(el('button', 'g-sigrow')); r.type = 'button'; r.addEventListener('click', () => SR.open && SR.open('SMH'));
    r.appendChild(el('span', 'g-pill ' + (sig.inn ? 'g-in' : 'g-out'), sig.inn ? 'Semis IN' : 'Semis OUT'));
    r.appendChild(el('span', 'g-sigrow-t', sig.inn ? `Out below ${d3.format(',.0f')(lvl)} (${pct(gap)})` : `Back in above ${d3.format(',.0f')(lvl)} (${pct(gap)})`));
    r.appendChild(el('span', 'g-muted', 'Friday close · SMH'));
  }

  // ---- "What to do": at most three direct lines ----
  function actionCard(box, H, st) {
    const items = [];
    const S = SRApp.swing ? SRApp.swing() : [], f0 = (v) => d3.format(',.0f')(v);
    const holds = (t) => H.some((h) => h.value > 0 && (h.ticker === t || (t === 'SEC0' && h.tracks === 'SMH')));
    for (const x of S) {
      if (x.signal && x.signal.type === 'sell' && holds(x.t)) items.push(['now', `<b>Sell ${x.t}</b> at tomorrow's open: the swing trade is over.`]);
      else if (x.signal && x.signal.type === 'buy') items.push(['now', `<b>Buy ${x.t}</b> at tomorrow's open: sharp drop, swing entry.`]);
      else if (x.inTrade && holds(x.t)) items.push(['tonight', `If ${x.us} closes <b>above ${f0(x.sellAbove)}</b> tonight, <b>sell ${x.t}</b> tomorrow. Otherwise keep it.`]);
      else if (x.bear && x.buyBelow) { const q = window.SRLive && window.SRLive.quotes.get(SRApp.idOf(x.us)); if (q && q.price < x.buyBelow) items.push(['tonight', `If ${x.us} closes <b>below ${f0(x.buyBelow)}</b> tonight, <b>buy ${x.t}</b> tomorrow.`]); }
    }
    if (st.actions && st.actions.length) {
      const steps = splitOrders(st.actions[0], H);
      const line = (p) => `<b>Sell ${p.sells.map((o) => o.t).join(', ')}</b> (${eur(p.total)}) → <b>buy ${p.buys.map((o) => `${o.t} ${eur(o.eur)}`).join(', ')}</b>${p.cash ? `, keep ${eur(p.cash)} cash` : ''}.`;
      items.push(['week', 'This week: ' + line(steps[0])]);
      if (steps[1]) items.push(['later', 'Later, when ready: ' + line(steps[1])]);
    } else if (!st.P) items.push(['week', 'Choose a plan in <b>Plan</b> to get your rotation steps.']);
    const c = card(box, "do g-docard", items.length ? 'What to do' : '✓ Nothing to do today');
    if (!items.length) { c.appendChild(el('div', 'g-line g-muted', 'No signal and no rotation step. The app notifies you when that changes.')); return; }
    const ol = c.appendChild(el('ol', 'g-do'));
    const TAG = { now: 'Now', tonight: 'Tonight', week: 'This week', later: 'Later' };
    for (const [k, html] of items.slice(0, 4)) {
      const li = ol.appendChild(el('li', 'g-do-i'));
      li.appendChild(el('span', 'g-do-t g-do-' + k, TAG[k]));
      const t = li.appendChild(el('span', 'g-do-x')); t.innerHTML = html.replace(/^This week: |^Later, when ready: /, '');
    }
    if (st.actions && st.actions.length) { const b = c.appendChild(el('button', 'g-link', 'Exact orders below ↓')); b.type = 'button'; b.addEventListener('click', () => { const e = box.querySelector('.g-steps'); if (e) e.scrollIntoView({ behavior: 'smooth', block: 'start' }); }); }
  }

  // ---- Today ----
  dash.draw('today', (box) => {
    const H = holdings(), st = planState(H), c0 = cfg();
    box.replaceChildren();
    hero(box, H);
    if (c0.source !== 'yahoo' && !(c0.apiKey && c0.userKey)) {
      const c = card(box, 'warn', 'Connect eToro for live prices');
      c.appendChild(btn('Open settings', 'primary', () => window.appOpenSettings && window.appOpenSettings()));
    }
    if (st.P && st.p.id === 'smh' && !sig) loadSignal();
    actionCard(box, H, st);
    rotationCard(box, H, st);
    swingCard(box, st);
    if (st.P && st.p.id === 'smh') signalRow(box);
    addCard(box, H, st);
    const PT = planTickers(st.p), KS = st.keep || new Set();
    const hot = H.filter((h) => h.overheated && !(st.P && (PT.has(h.ticker) || !KS.has(h.ticker))));
    if (hot.length) {
      const c = card(box, 'watch', 'Overheated: don\'t add');
      const chips = c.appendChild(el('div', 'g-chips'));
      for (const h of hot) { const b2 = chips.appendChild(el('button', 'g-chip g-chip-hot', h.ticker)); b2.type = 'button'; b2.addEventListener('click', () => openHolding(h)); }
    }
  });
  function planBars(c, st) {
    if (!st.T) { c.appendChild(el('div', 'g-line g-muted', 'Waiting for the semis signal…')); return; }
    for (const x of st.T) {
      const share = st.size ? (st.cur[x.t] || 0) / st.size : 0;
      const r = c.appendChild(el('div', 'g-bar'));
      r.appendChild(el('span', 'g-bar-l', x.t));
      const tr = r.appendChild(el('span', 'g-bar-track'));
      const f = tr.appendChild(el('span', 'g-bar-fill')); f.style.width = Math.min(100, share * 100) + '%';
      const tg = tr.appendChild(el('span', 'g-bar-target')); tg.style.left = x.w * 100 + '%';
      r.appendChild(el('span', 'g-bar-v', `${d3.format('.0%')(share)} / ${d3.format('.0%')(x.w)}`));
    }
  }

  // ---- Portfolio ----
  dash.draw('pfolio', (box) => {
    const H = holdings().filter((h) => h.value > 0).sort((a, b) => b.value - a.value), T = totals(H);
    const pst = planState(holdings()), PTs = planTickers(pst.p);
    box.replaceChildren();
    hero(box, H);
    const list = box.appendChild(el('div', 'g-list'));
    const max = d3.max(H, (h) => h.value) || 1;
    for (const h of H) {
      const r = list.appendChild(el('button', 'g-row')); r.type = 'button';
      r.addEventListener('click', () => openHolding(h));
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
      if (pst.P) {
        if (pst.keep && pst.keep.has(h.ticker)) tags.appendChild(el('span', 'g-chip', 'Keep'));
        else if (pst.T ? lineFor(h, pst.T) : PTs.has(h.ticker)) tags.appendChild(el('span', 'g-chip g-chip-plan', 'Plan'));
        else tags.appendChild(el('span', 'g-chip g-chip-sell', 'Sell'));
      }
      tags.appendChild(el('span', 'g-muted', T.total ? d3.format('.0%')(h.value / T.total) : ''));
    }
    if (!H.length) list.appendChild(el('div', 'g-line g-muted', 'No holdings yet.'));
    const row = box.appendChild(el('div', 'g-btns'));
    row.appendChild(btn('Edit holdings', '', () => { if (window.appOpenSettings) window.appOpenSettings('holdings'); }));
  });

  // ---- Plan ----
  dash.draw('plan', (box) => {
    const p = plan(), R = dash.data('study_rules'), rows = R.status === 'ok' ? R.data : [], H = holdings(), st = planState(H);
    const S = (k) => rows.find((r) => r.key === k);
    const nums = (parent, s) => {
      const n = parent.appendChild(el('div', 'g-plan-n'));
      for (const [v, lab] of [[pct(s.cagr), 'a year'], [d3.format('.1%')(s.vol), 'volatility'], [pct(s.max_dd), 'worst drop']]) { const d = n.appendChild(el('div')); d.appendChild(el('b', '', v)); d.appendChild(el('span', '', lab)); }
    };
    box.replaceChildren();
    box.appendChild(el('h2', 'g-h2', 'Your plan'));
    box.appendChild(el('p', 'g-muted g-sub', 'Pick one. Today then lists what to sell and buy on Revolut, starting from what you hold.'));
    const grid = box.appendChild(el('div', 'g-plans'));
    const opt = (id, name, line, k) => {
      const b = grid.appendChild(el('button', 'g-plan' + (p.id === id ? ' is-on' : ''))); b.type = 'button'; b.setAttribute('aria-pressed', String(p.id === id));
      const h = b.appendChild(el('div', 'g-plan-h')); h.appendChild(el('b', '', name)); if (p.id === id) h.appendChild(el('span', 'g-pill g-in', 'Selected'));
      b.appendChild(el('div', 'g-plan-l', line));
      const s = k && S(k); if (s) nums(b, s);
      b.addEventListener('click', () => { const q = plan(); q.id = id; savePlan(q); if (id === 'smh') loadSignal(); });
    };
    for (const id of ['smh', 'core']) opt(id, PLANS[id].name, PLANS[id].line, PLANS[id].study(p));
    opt(null, 'No plan', 'Just track my holdings and the market.', null);
    const spy = S('spy');
    if (spy) box.appendChild(el('p', 'g-muted g-sub', `S&P 500 in the same test: ${pct(spy.cagr)} a year, volatility ${d3.format('.1%')(spy.vol)}, worst drop ${pct(spy.max_dd)}. June 2000 – Oct 2026, dividends included, before tax. Past results, not a promise.`));
    if (!st.P) return;
    // what stays outside the plan
    const PT = planTickers(p), keep = keepSet(p, H);
    const own = H.filter((h) => h.value > 0 && !PT.has(h.ticker));
    if (own.length) {
      const kc = box.appendChild(el('div', 'g-card'));
      kc.appendChild(el('div', 'g-card-t', 'Keep outside the plan'));
      kc.appendChild(el('div', 'g-line g-muted', 'Tap to keep. Everything not kept is sold into the plan.'));
      const chips = kc.appendChild(el('div', 'g-chips'));
      for (const h of own) {
        const on = keep.has(h.ticker), b = chips.appendChild(el('button', 'g-chip g-toggle' + (on ? ' is-on' : ''), (on ? '✓ ' : '') + h.ticker)); b.type = 'button';
        b.setAttribute('aria-pressed', String(on));
        b.addEventListener('click', () => { const q = plan(), k = keepSet(q, H); if (k.has(h.ticker)) k.delete(h.ticker); else k.add(h.ticker); q.keep = [...k]; savePlan(q); });
      }
    }
    const money = box.appendChild(el('div', 'g-card g-money'));
    money.appendChild(el('div', 'g-card-t', 'New money'));
    const f = money.appendChild(el('div', 'g-field'));
    const inp = f.appendChild(el('input')); inp.id = 'g-add'; inp.type = 'number'; inp.min = '0'; inp.step = '50'; inp.inputMode = 'decimal'; inp.placeholder = 'Amount to add, €';
    if (p.add > 0) inp.value = String(p.add);
    f.appendChild(btn('Save', 'primary', () => { const q = plan(); q.add = Math.max(0, parseFloat(String(inp.value).replace(',', '.')) || 0); savePlan(q); if (q.add > 0) { toast('Your steps are on Today.'); go('today'); } }));
    const tc = box.appendChild(el('div', 'g-card'));
    tc.appendChild(el('div', 'g-card-t', `What to hold · ${eur(st.size)}`));
    if (p.id === 'smh') tc.appendChild(el('div', 'g-line g-muted', st.inn == null ? 'Checking the semis signal…' : st.inn ? 'Semis are IN: that half sits in SEC0.' : `Semis are OUT: that half waits in ${(HAVENS[p.haven] || HAVENS.cash).name.toLowerCase()}.`));
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
    box.appendChild(btn('See the 25-year test', '', () => go('plan', 1)));
  });

  // live: Today and Portfolio follow the prices (every 10 s while open); the semis signal every 30 minutes
  setInterval(() => { if (document.hidden) return; SRApp.renderDraw('today'); SRApp.renderDraw('pfolio'); }, 10000);
  setInterval(() => { if (!document.hidden && plan().id === 'smh') loadSignal(); }, 5 * 60000);
  SRApp.onChange(() => { if (plan().id === 'smh') { if (window.SRLive && window.SRLive.want) window.SRLive.want('guide', [SMH_ID]); loadSignal(); } });
  window.SRGuide = { PLANS, planState: () => planState(holdings()), signal: () => sig, computeSignal, weekEnd };
})();
