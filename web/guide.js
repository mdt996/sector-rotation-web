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
  const PLANS = {
    smh: {
      name: 'Semis on trend + defensive', study: 'smhplan',
      line: 'Half in semiconductors while they trend; after a 15% fall that half waits in gold. Half in staples, utilities and health care.',
      risk: 'Switches about 3 times a year, checked on Friday closes. In a compte-titres every sale is taxed at 31.4%.',
      targets: (inn) => [inn ? { t: 'VVSM', us: 'SMH', name: 'Semiconductors', w: 0.5 } : { t: 'PPFB', us: 'GLD', name: 'Gold', w: 0.5 },
        ...DEFL.map(([t, us, name]) => ({ t, us, name, w: 0.5 / 3 }))],
    },
    core: {
      name: 'Nasdaq + defensive', study: 'qqqdef',
      line: '60% Nasdaq-100, 40% staples, utilities and health care. Reset to target every January and July.',
      risk: 'Its edge rests on the Nasdaq-100 staying ahead of the S&P 500.',
      targets: () => [{ t: 'SXRV', us: 'QQQ', name: 'Nasdaq-100', w: 0.6 }, ...DEFL.map(([t, us, name]) => ({ t, us, name, w: 0.4 / 3 }))],
    },
  };
  const PLAN_TICKERS = ['SXRV', 'VVSM', 'PPFB', 'ZPDS', 'ZPDU', 'ZPDH'];
  const NAME = { SXRV: 'Nasdaq-100', VVSM: 'Semiconductors', PPFB: 'Gold', ZPDS: 'Consumer staples', ZPDU: 'Utilities', ZPDH: 'Health care' };
  const US = { SXRV: 'QQQ', VVSM: 'SMH', PPFB: 'GLD', ZPDS: 'XLP', ZPDU: 'XLU', ZPDH: 'XLV' };

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
    if (l && window.SRLive.openAsset) window.SRLive.openAsset({ id: l.id, symbol: l.symbol, name: h.name || h.ticker, exchange: '' });
    else if (SR.open) SR.open(h.tracks);
  }
  const held = (H, t) => H.filter((h) => h.ticker === t).reduce((s, h) => s + (h.value || 0), 0);
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
      const c = w[i].close, hi = Math.max(...w.slice(i - 51, i + 1).map((x) => x.close)), sma = mean(w.slice(i - 19, i + 1).map((x) => x.close));
      if (inn && c < 0.85 * hi) { inn = false; since = w[i].end; } else if (!inn && c > sma) { inn = true; since = w[i].end; }
    }
    const L = w.length - 1, closes = w.map((x) => x.close);
    return {
      inn, since, close: closes[L], at: w[L].end,
      // next Friday: out if it closes below 85% of the 52-week high; back in if it closes above the new 20-week average
      exitAt: 0.85 * Math.max(...closes.slice(L - 50)), backAt: mean(closes.slice(L - 18)),
      hist: w.slice(-52).map((x, k, a) => ({ end: x.end, close: x.close, sma: mean(closes.slice(L - 51 + k - 19, L - 51 + k + 1)), stop: 0.85 * Math.max(...closes.slice(L - 51 + k - 51, L - 51 + k + 1)) })),
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

  // ---- what the plan asks for now ----
  function planState(H) {
    const p = plan(), P = PLANS[p.id];
    if (!P) return { p, P: null };
    const inn = p.id === 'smh' ? (sig && !sig.error ? sig.inn : null) : true;
    const cur = Object.fromEntries(PLAN_TICKERS.map((t) => [t, held(H, t)]));
    const inPlan = PLAN_TICKERS.reduce((s, t) => s + cur[t], 0);
    const T = inn == null ? null : P.targets(inn);
    const st = { p, P, inn, cur, inPlan, T, actions: [] };
    if (!T) return st;
    const minOrder = Math.max(50, inPlan * 0.01);
    const mk = (side, t, x) => ({ side, t, us: US[t], eur: Math.round(x / 10) * 10 });
    // 1. new money: buy what is furthest under target, nothing sold
    if (p.add > 0) {
      const size = inPlan + p.add, need = T.map((x) => Math.max(0, size * x.w - (cur[x.t] || 0))), sn = need.reduce((s, x) => s + x, 0);
      const buys = T.map((x, k) => mk('buy', x.t, sn > 0 ? p.add * need[k] / sn : p.add * x.w)).filter((o) => o.eur >= 10);
      st.actions.push({ kind: 'add', title: inPlan > 0 ? `Invest ${eur(p.add)} of new money` : `Start your plan with ${eur(p.add)}`, orders: buys, after: (q) => { q.add = 0; } });
      return st;
    }
    if (inPlan < 50) return st;
    // 2. the semis signal flipped: move that half
    if (p.id === 'smh') {
      const wrong = inn ? 'PPFB' : 'VVSM', right = inn ? 'VVSM' : 'PPFB';
      if (cur[wrong] >= minOrder) {
        st.actions.push({ kind: 'switch', title: inn ? 'Semis are trending again: move the gold half back' : 'Semis fell 15%: move the semis half to gold',
          orders: [mk('sell', wrong, cur[wrong]), mk('buy', right, cur[wrong])], after: () => {} });
        return st;
      }
    }
    // 3. the reset: first half of January and July, or any line more than 10 points off target
    const now = new Date(), m = now.getUTCMonth(), key = `reset-${now.getUTCFullYear()}-${m + 1}`;
    const drift = Math.max(...T.map((x) => Math.abs((cur[x.t] || 0) / inPlan - x.w)));
    const window_ = (m === 0 || m === 6) && now.getUTCDate() <= 15 && !p.done[key];
    if (window_ || drift > 0.10) {
      const orders = T.map((x) => { const d = inPlan * x.w - (cur[x.t] || 0); return mk(d > 0 ? 'buy' : 'sell', x.t, Math.abs(d)); }).filter((o) => o.eur >= minOrder);
      if (orders.length) st.actions.push({ kind: 'reset', title: window_ ? 'Twice-yearly reset' : 'Back to target (a line drifted 10 points)', orders, after: (q) => { q.done = Object.assign({}, q.done, { [key]: new Date().toISOString().slice(0, 10) }); } });
    }
    return st;
  }
  function nextReset() {
    const n = new Date(), y = n.getUTCFullYear(), m = n.getUTCMonth();
    const t = m < 6 ? Date.UTC(y, 6, 1) : Date.UTC(y + 1, 0, 1);
    return day(t);
  }
  function nextFriday() { const n = new Date(); const d = (5 - n.getUTCDay() + 7) % 7 || (n.getUTCHours() >= 21 ? 7 : 0); return day(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + d)); }

  // ---- marking an action done: the holdings follow (amounts reset to today's live values plus the trades) ----
  const revOf = (t) => (window.SR_REVOLUT || []).find((r) => r.revolut_ticker === t);
  function lineOf(r) {
    const rev = revOf(r.ticker), auto = rev && rev.us === r.tracks;
    return [r.ticker, r.tracks && r.tracks !== r.ticker && !auto ? '= ' + r.tracks : '', String(r.amount), r.long_term ? 'long' : '', r.match === 'rough' ? 'rough' : ''].filter(Boolean).join(' ');
  }
  function markDone(action) {
    const c = cfg(), H = holdings(), val = Object.fromEntries(H.map((h) => [h.ticker, h.value]));
    const rows = SRApp.parseHoldings(c.holdings);
    for (const r of rows) r.amount = Math.round(val[r.ticker] != null ? val[r.ticker] : r.amount || 0);
    for (const o of action.orders) {
      let r = rows.find((x) => x.ticker === o.t);
      if (!r) { r = { ticker: o.t, tracks: o.us, amount: 0, long_term: false, match: 'same' }; rows.push(r); }
      r.amount = Math.max(0, Math.round(r.amount + (o.side === 'buy' ? o.eur : -o.eur)));
    }
    const text = rows.filter((r) => r.amount > 0).map(lineOf).join('\n');
    const p = plan(); action.after(p);
    Object.assign(c, { holdings: text, holdingsBase: { text, rows: {} }, plan: p });
    SRApp.saveConfig(c); SRApp.applyConfig();
    if (window.SRSync) window.SRSync.pushSoon();
    toast('Done. Your holdings are updated.');
  }
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
  function orderList(c, orders) {
    const ul = c.appendChild(el('div', 'g-orders'));
    for (const o of orders) {
      const r = ul.appendChild(el('div', 'g-order'));
      r.appendChild(el('span', 'g-side g-' + o.side, o.side === 'buy' ? 'Buy' : 'Sell'));
      r.appendChild(el('span', 'g-amt', eur(o.eur)));
      r.appendChild(el('b', '', o.t));
      r.appendChild(el('span', 'g-muted', NAME[o.t] || ''));
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
    k.innerHTML = '<span><i class="g-k g-k-close"></i>SMH weekly close</span><span><i class="g-k g-k-sma"></i>20-week average</span><span><i class="g-k g-k-stop"></i>15% below the high</span>';
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
      ? `Moves to gold if a Friday close is below ${d3.format(',.0f')(lvl)} (${pct(gap)} from ${now ? 'now' : 'Friday'}).`
      : `Back in if a Friday close is above ${d3.format(',.0f')(lvl)} (${pct(gap)} from ${now ? 'now' : 'Friday'}).`));
    spark(c, sig);
    c.classList.add('g-tap'); c.addEventListener('click', () => SR.open && SR.open('SMH'));
  }

  // ---- Today ----
  dash.draw('today', (box) => {
    const H = holdings(), st = planState(H), c0 = cfg();
    box.replaceChildren();
    hero(box, H);
    const acts = box.appendChild(el('div', 'g-stack'));
    if (c0.source !== 'yahoo' && !(c0.apiKey && c0.userKey)) {
      const c = card(acts, 'warn', 'Connect eToro for live prices');
      c.appendChild(el('div', 'g-line', 'Prices, signals and steps need your eToro keys.'));
      c.appendChild(btn('Open settings', 'primary', () => window.appOpenSettings && window.appOpenSettings()));
    }
    if (!st.P) {
      const c = card(acts, 'action', 'Choose a plan');
      c.appendChild(el('div', 'g-line', 'Pick one of two tested plans and the app tells you exactly what to buy or sell, and when.'));
      c.appendChild(btn('Choose a plan', 'primary', () => go('plan', 0)));
    } else {
      if (st.p.id === 'smh' && !sig) loadSignal();
      for (const a of st.actions) {
        const c = card(acts, 'action', a.title);
        orderList(c, a.orders);
        c.appendChild(el('div', 'g-hint', 'On Revolut, then tap Done: your holdings update by themselves.'));
        c.appendChild(btn('Done', 'primary', () => markDone(a)));
      }
      if (!st.T) {
        const c = card(acts, 'wait', 'Checking the semis signal');
        c.appendChild(el('div', 'g-line g-muted', sig && sig.error ? 'No signal yet: ' + sig.error + '.' : 'Reading SMH\'s weekly closes from eToro…'));
      }
      if (!st.actions.length && st.inPlan < 50 && st.T) {
        const c = card(acts, 'action', 'Start your plan');
        c.appendChild(el('div', 'g-line', `${st.P.name}: tell the app how much to put in and it splits it for you.`));
        c.appendChild(btn('Set the amount', 'primary', () => { go('plan', 0); setTimeout(() => { const i = document.getElementById('g-add'); if (i) i.focus(); }, 60); }));
      }
      if (!st.actions.length && st.inPlan >= 50 && st.T) {
        const c = card(acts, 'ok', '✓ Nothing to do');
        c.appendChild(el('div', 'g-line g-muted', st.p.id === 'smh' ? `Next check: ${nextFriday()}, after the US close.` : `Next reset: ${nextReset()}.`));
      }
    }
    const hot = H.filter((h) => h.overheated && !(st.P && PLAN_TICKERS.includes(h.ticker))); // the plan's own lines follow the plan
    if (hot.length) {
      const c = card(acts, 'watch', 'Overheated: don\'t add');
      const chips = c.appendChild(el('div', 'g-chips'));
      for (const h of hot) { const b = chips.appendChild(el('button', 'g-chip g-chip-hot', h.ticker)); b.type = 'button'; b.addEventListener('click', () => openHolding(h)); }
      const why = c.appendChild(el('div', 'g-hint', 'Weekly RSI above 70. Trimming is optional.'));
      why.title = 'In 15 years of sector data, the 3 months after an overheated week averaged about −0.2%, against +2.7% for a normal week.';
    }
    if (st.p.id === 'smh') signalCard(box);
    if (st.P && st.inPlan >= 50) planBars(card(box, 'bars', 'Your plan vs target'), st);
  });
  function planBars(c, st) {
    if (!st.T) { c.appendChild(el('div', 'g-line g-muted', 'Waiting for the semis signal…')); return; }
    for (const x of st.T) {
      const share = st.inPlan ? (st.cur[x.t] || 0) / st.inPlan : 0;
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
      if (PLAN_TICKERS.includes(h.ticker)) tags.appendChild(el('span', 'g-chip g-chip-plan', 'Plan'));
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
    box.replaceChildren();
    box.appendChild(el('h2', 'g-h2', 'Your plan'));
    box.appendChild(el('p', 'g-muted g-sub', 'Pick one. The app then tells you what to buy or sell on Revolut, and when.'));
    const grid = box.appendChild(el('div', 'g-plans'));
    const opt = (id, name, line, k) => {
      const b = grid.appendChild(el('button', 'g-plan' + (p.id === id ? ' is-on' : ''))); b.type = 'button'; b.setAttribute('aria-pressed', String(p.id === id));
      const h = b.appendChild(el('div', 'g-plan-h')); h.appendChild(el('b', '', name)); if (p.id === id) h.appendChild(el('span', 'g-pill g-in', 'Selected'));
      b.appendChild(el('div', 'g-plan-l', line));
      const s = k && S(k);
      if (s) {
        const n = b.appendChild(el('div', 'g-plan-n'));
        for (const [v, lab] of [[pct(s.cagr), 'a year'], [d3.format('.1%')(s.vol), 'volatility'], [pct(s.max_dd), 'worst drop']]) { const d = n.appendChild(el('div')); d.appendChild(el('b', '', v)); d.appendChild(el('span', '', lab)); }
      }
      b.addEventListener('click', () => { const q = plan(); q.id = id; savePlan(q); if (id === 'smh') loadSignal(); });
    };
    for (const id of ['smh', 'core']) opt(id, PLANS[id].name, PLANS[id].line, PLANS[id].study);
    opt(null, 'No plan', 'Just track my holdings and the market.', null);
    const spy = S('spy');
    if (spy) box.appendChild(el('p', 'g-muted g-sub', `S&P 500 in the same test: ${pct(spy.cagr)} a year, volatility ${d3.format('.1%')(spy.vol)}, worst drop ${pct(spy.max_dd)}. Nov 2011 – Oct 2026, prices only. Past results, not a promise.`));
    if (!st.P) return;
    const money = box.appendChild(el('div', 'g-card g-money'));
    money.appendChild(el('div', 'g-card-t', 'Money'));
    money.appendChild(el('div', 'g-line', `In the plan now: ${eur(st.inPlan)}`));
    const f = money.appendChild(el('div', 'g-field'));
    const inp = f.appendChild(el('input')); inp.id = 'g-add'; inp.type = 'number'; inp.min = '0'; inp.step = '50'; inp.inputMode = 'decimal'; inp.placeholder = 'New money to invest, €';
    if (p.add > 0) inp.value = String(p.add);
    f.appendChild(btn('Save', 'primary', () => { const q = plan(); q.add = Math.max(0, parseFloat(String(inp.value).replace(',', '.')) || 0); savePlan(q); if (q.add > 0) { toast('Your steps are on Today.'); go('today'); } }));
    const tc = box.appendChild(el('div', 'g-card'));
    tc.appendChild(el('div', 'g-card-t', 'What to hold'));
    if (st.p.id === 'smh') tc.appendChild(el('div', 'g-line g-muted', st.inn == null ? 'Checking the semis signal…' : st.inn ? 'Semis are IN: the half sits in VVSM.' : 'Semis are OUT: the half waits in gold (PPFB).'));
    if (st.T) {
      const t = tc.appendChild(el('table', 'g-table'));
      t.innerHTML = '<thead><tr><th>Revolut</th><th></th><th class="num">Target</th><th class="num">You hold</th></tr></thead>';
      const tb = t.appendChild(el('tbody'));
      for (const x of st.T) {
        const tr = tb.appendChild(el('tr'));
        tr.appendChild(el('td', '', x.t)).style.fontWeight = '600';
        tr.appendChild(el('td', 'g-muted', x.name));
        tr.appendChild(el('td', 'num', d3.format('.0%')(x.w)));
        tr.appendChild(el('td', 'num', eur(st.cur[x.t] || 0)));
      }
    }
    tc.appendChild(el('div', 'g-hint', st.P.risk));
    box.appendChild(btn('See the 15-year test', '', () => go('plan', 1)));
  });

  // live: Today and Portfolio follow the prices (every 10 s while open); the semis signal every 30 minutes
  setInterval(() => { if (document.hidden) return; SRApp.renderDraw('today'); SRApp.renderDraw('pfolio'); }, 10000);
  setInterval(() => { if (!document.hidden && plan().id === 'smh') loadSignal(); }, 5 * 60000);
  SRApp.onChange(() => { if (plan().id === 'smh') { if (window.SRLive && window.SRLive.want) window.SRLive.want('guide', [SMH_ID]); loadSignal(); } });
  window.SRGuide = { PLANS, planState: () => planState(holdings()), signal: () => sig, computeSignal, weekEnd, markDone };
})();
