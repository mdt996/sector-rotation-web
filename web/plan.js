// Your game plan (build 161). Matteo, 27 Nov 2026, after a look at While25 and at what traders write on Reddit: "build anything
// you recommend". What those threads keep saying: decide the risk and the size before the entry, write the plan before the trade,
// set your own limits and see when one is broken. So: a trade is planned BEFORE it is made (entry, stop, target, what you accept to
// lose: the size follows), kept on this device with the settings and shown against the live price; three limits of your own are
// shown kept or broken. Arithmetic on your own numbers. No order is ever sent, and nothing here is advice.
(function () {
  'use strict';
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const eur = (x, sign) => { if (x == null || !isFinite(x)) return '—'; const s = Math.abs(x).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); return (s === '0.00' ? '' : sign && x > 0 ? '+' : x < 0 ? '−' : '') + '€' + s; };
  const pc = (x) => (x == null || !isFinite(x) ? '—' : (Math.abs(x) >= 9.95 ? Math.round(x) : Math.round(x * 10) / 10) + '%');
  const units = (q) => (q >= 100 ? Math.round(q).toLocaleString('en-GB') : q >= 10 ? q.toFixed(1) : q.toFixed(2));
  // a typed amount: 1500, 1,500, 1 500, 1500.50, 1.500,50
  const num = (t) => { let s = String(t == null ? '' : t).replace(/[\s€$%]/g, ''); if (!s) return null; const c = s.lastIndexOf(','), d = s.lastIndexOf('.'); if (c >= 0 && d >= 0) s = c > d ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, ''); else if (c >= 0) s = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.'); else if (/^\d{1,3}(\.\d{3}){2,}$/.test(s)) s = s.replace(/\./g, ''); const x = Number(s); return isFinite(x) ? x : null; };

  // ---- the sums (no screen; test/plan.test.js) ----
  // The size of a trade from what you accept to lose: the loss when the stop is reached, divided into the distance to the stop.
  // `rate` is how many euros one unit of the asset's price is worth (1 for an asset priced in euros).
  function size(p) {
    const entry = +p.entry, stop = +p.stop, risk = +p.risk, rate = +p.rate, target = p.target == null || p.target === '' ? null : +p.target;
    if (!(entry > 0)) return { ok: false, why: 'entry' };
    if (!(stop > 0) || stop === entry) return { ok: false, why: 'stop' };
    if (!(risk > 0)) return { ok: false, why: 'risk' };
    if (!(rate > 0)) return { ok: false, why: 'rate' };
    const long = stop < entry, per = Math.abs(entry - stop) * rate, q = risk / per, out = { ok: true, long, per, q, value: q * entry * rate, loss: risk, gain: null, rr: null, away: Math.abs(entry - stop) / entry };
    if (target != null) { if (!(target > 0) || (long ? target <= entry : target >= entry)) return { ok: false, why: 'target' }; out.gain = q * Math.abs(target - entry) * rate; out.rr = out.gain / risk; }
    return out;
  }
  // Where a price stands on a plan: 0 at the stop, 1 at the target (with no target: at twice the distance to the stop beyond the entry).
  function where(p, px) {
    const d = p.st < p.e ? 1 : -1, far = p.t != null ? p.t : p.e + (p.e - p.st) * 2, span = (far - p.st) * d;
    if (!(px > 0) || !(span > 0)) return null;
    const at = ((px - p.st) * d) / span, zone = (px - p.st) * d <= 0 ? 'stop' : p.t != null && (px - p.t) * d >= 0 ? 'target' : (px - p.e) * d < 0 ? 'under' : 'over';
    return { pos: Math.max(0, Math.min(1, at)), entry: ((p.e - p.st) * d) / span, zone, toEntry: px / p.e - 1 };
  }
  // Your limits, kept or broken. H: the holdings ({ ticker, value in euros, pending }); plans: the saved plans ({ s, risk }).
  const RULES0 = { one: 20, cash: 10, risk: 1 };
  function rules(R, H, plans) {
    R = Object.assign({}, RULES0, R || {});
    const live = (H || []).filter((h) => h && !h.pending && h.value > 0), total = live.reduce((a, h) => a + h.value, 0);
    if (!(total > 0)) return { total: 0, list: [] };
    const isCash = (h) => /^CASH/i.test(h.ticker || ''), cash = live.filter(isCash).reduce((a, h) => a + h.value, 0), top = live.filter((h) => !isCash(h)).sort((a, b) => b.value - a.value)[0] || null;
    const worst = (plans || []).filter((p) => p && p.risk > 0).sort((a, b) => b.risk - a.risk)[0] || null, list = [];
    if (R.one > 0) list.push({ id: 'one', short: 'Largest', label: 'Largest holding', limit: `at most ${R.one}%`, actual: top ? `${top.ticker} ${pc(100 * top.value / total)}` : 'none', ok: !top || 100 * top.value / total <= R.one + 1e-9 });
    if (R.cash > 0) list.push({ id: 'cash', short: 'Cash', label: 'Cash', limit: `at least ${R.cash}%`, actual: pc(100 * cash / total), ok: 100 * cash / total >= R.cash - 1e-9 });
    if (R.risk > 0) list.push({ id: 'risk', short: 'Plan risk', label: 'Risk of a plan', limit: `at most ${R.risk}%`, actual: worst ? `${worst.s} ${pc(100 * worst.risk / total)}` : 'no plan', ok: !worst || worst.risk <= total * R.risk / 100 + 0.005 });   // half a cent of grace: the amount offered is the limit rounded to the cent
    return { total, list, R };
  }
  // The S&P 500 against its own 200-day average: a fact shown beside the plan, not a rule and not a signal.
  function weather(rows) {
    const c = (rows || []).map((r) => r.close).filter((x) => x > 0); if (c.length < 200) return null;
    const avg = c.slice(-200).reduce((a, x) => a + x, 0) / 200, last = c[c.length - 1];
    return { above: last >= avg, gap: last / avg - 1 };
  }

  // ---- kept with the settings (so they follow you to your other devices) ----
  const cfg = () => (window.SRApp && SRApp.config ? SRApp.config() : {});
  const plans = () => (Array.isArray(cfg().tradePlans) ? cfg().tradePlans : []);   // config keys `tradePlans` and `limits` (NOT `plan`, the rotation plan): synced like the holdings, never renamed
  const myRules = () => Object.assign({}, RULES0, cfg().limits || {});
  const save = (f) => { const c = SRApp.config(); f(c); SRApp.saveConfig(c); if (window.SRSync && window.SRSync.pushSoon) window.SRSync.pushSoon(); redraw(); try { window.dispatchEvent(new Event('sr-plans')); } catch (e) { /* no listener */ } };
  const redraw = () => { if (window.SRApp && SRApp.renderDraw) SRApp.renderDraw('today'); };
  const holdings = () => { try { return window.SRGuide && window.SRGuide.holdings ? window.SRGuide.holdings() : []; } catch (e) { return []; } };
  const quote = (id) => (window.SRLive && SRLive.quotes ? SRLive.quotes.get(+id) : null);
  // how many euros one unit of this asset's price is worth, from eToro's own conversion and the live euro-dollar rate
  const rateOf = (id) => { const q = quote(id), fx = quote(1); return q && q.conv > 0 && fx && fx.price > 0 ? q.conv / fx.price : null; };
  const WHY = { entry: 'Type the price you would buy at.', stop: 'Type the price at which you would give up: it cannot be the entry.', risk: 'Type what you accept to lose if the stop is reached.', rate: 'No live price yet: the size cannot be worked out in euros.', target: 'The target must be beyond the entry, on the other side from the stop.' };

  // ---- the sheet: plan a trade on one asset ----
  let sheetEl = null;
  const close = () => { if (sheetEl) { sheetEl.remove(); sheetEl = null; } };
  function sheet(title, cls, build) {
    close();
    const back = el('div', 'g-sheet-back gp-back'), s = back.appendChild(el('div', 'g-sheet ' + cls)); s.setAttribute('role', 'dialog'); s.setAttribute('aria-label', title);
    const h = s.appendChild(el('div', 'g-sheet-h')); h.appendChild(el('b', '', title));
    const x = h.appendChild(el('button', 'g-sheet-x', '✕')); x.type = 'button'; x.setAttribute('aria-label', 'Close'); x.addEventListener('click', close);
    build(s); back.addEventListener('click', (e) => { if (e.target === back) close(); }); document.body.appendChild(back); sheetEl = back;
  }
  const field = (box, label, value, hint) => { const f = box.appendChild(el('label', 'gp-f')); f.appendChild(el('span', '', label)); const i = f.appendChild(el('input')); i.type = 'text'; i.inputMode = 'decimal'; i.autocomplete = 'off'; i.value = value == null ? '' : value; if (hint) i.placeholder = hint; return i; };
  const trim = (x) => (x == null || !isFinite(x) ? '' : String(+(+x).toPrecision(6)));
  function open(inst) {
    const id = +inst.id, sym = inst.symbol || inst.sym || '', old = plans().find((p) => +p.id === id) || null, q = quote(id), R = rules(myRules(), holdings(), []), scan = (() => { try { return window.SRScreen && window.SRScreen.all ? window.SRScreen.all().find((r) => +r.id === id) : null; } catch (e) { return null; } })();
    sheet(`Plan · ${sym}`, 'gp-sheet', (s) => {
      s.dataset.id = id;
      const g = s.appendChild(el('div', 'gp-grid'));
      const iE = field(g, 'Entry', old ? trim(old.e) : q ? trim(q.price) : ''), iS = field(g, 'Stop', old ? trim(old.st) : scan && scan.stop > 0 ? trim(scan.stop) : ''), iT = field(g, 'Target', old ? trim(old.t) : scan && scan.target > 0 ? trim(scan.target) : '', 'optional');
      const iR = field(g, 'I accept to lose €', old ? trim(old.risk) : R.total > 0 ? (R.total * R.R.risk / 100).toFixed(2) : '');
      const out = s.appendChild(el('div', 'gp-out')); out.setAttribute('aria-live', 'polite');
      const btns = s.appendChild(el('div', 'g-btns gp-btns')), bSave = btns.appendChild(el('button', 'btn primary gp-save', old ? 'Save changes' : 'Save the plan')); bSave.type = 'button';
      if (old) { const bDel = btns.appendChild(el('button', 'btn gp-del', 'Delete')); bDel.type = 'button'; bDel.addEventListener('click', () => { save((c) => { c.tradePlans = plans().filter((p) => +p.id !== id); }); close(); }); }
      s.appendChild(el('div', 'gp-note', 'Arithmetic on your own numbers, before fees. Not advice: the app sends no order.'));
      let last = null;
      const draw = () => {
        const rate = rateOf(id), sz = size({ entry: num(iE.value), stop: num(iS.value), target: num(iT.value), risk: num(iR.value), rate }); last = sz.ok ? { sz, rate } : null;
        out.replaceChildren(); bSave.disabled = !sz.ok;
        if (!sz.ok) { out.appendChild(el('div', 'gp-why', WHY[sz.why])); return; }
        const big = out.appendChild(el('div', 'gp-size')); big.appendChild(el('span', '', sz.long ? 'Buy' : 'Sell short')); big.appendChild(el('b', '', units(sz.q))); big.appendChild(el('span', '', `= ${eur(sz.value)}${R.total > 0 ? ` · ${pc(100 * sz.value / R.total)} of your portfolio` : ''}`));
        // the picture: what the stop costs against what the target pays
        const top = Math.max(sz.loss, sz.gain || 0), bar = out.appendChild(el('div', 'gp-rr')); bar.setAttribute('role', 'img'); bar.setAttribute('aria-label', `At the stop ${eur(-sz.loss)}${sz.gain != null ? `, at the target ${eur(sz.gain, true)}` : ''}`);
        const one = (cls, w, label, v) => { const r = bar.appendChild(el('div', 'gp-rr-r ' + cls)); r.appendChild(el('span', '', label)); const t = r.appendChild(el('div', 'gp-rr-t')); t.appendChild(el('i')).style.width = Math.max(2, 100 * w / top) + '%'; r.appendChild(el('b', '', v)); };
        one('is-stop', sz.loss, 'Stop', eur(-sz.loss)); if (sz.gain != null) one('is-target', sz.gain, 'Target', eur(sz.gain, true));
        const facts = [`The stop is ${pc(100 * sz.away)} away`]; if (sz.rr != null) facts.push(`the target pays ${sz.rr.toFixed(1)} for 1 risked`); out.appendChild(el('div', 'gp-facts', facts.join(' · ') + '.'));
        const warn = []; if (R.total > 0 && sz.value > R.total) warn.push('This size is more than your whole portfolio.'); else if (R.total > 0 && R.R.one > 0 && 100 * sz.value / R.total > R.R.one) warn.push(`This size is above your limit of ${R.R.one}% for one holding.`);
        if (R.total > 0 && R.R.risk > 0 && sz.loss > R.total * R.R.risk / 100 + 0.005) warn.push(`You would risk ${pc(100 * sz.loss / R.total)} of your portfolio: your limit is ${R.R.risk}%.`);
        for (const w of warn) out.appendChild(el('div', 'gp-warn', w));
      };
      for (const i of [iE, iS, iT, iR]) i.addEventListener('input', draw);
      bSave.addEventListener('click', () => { if (!last) return; const p = { id, s: sym, n: inst.name || '', at: old ? old.at : new Date().toISOString(), e: num(iE.value), st: num(iS.value), t: num(iT.value), risk: num(iR.value), q: last.sz.q, rate: last.rate };
        save((c) => { c.tradePlans = [...plans().filter((x) => +x.id !== id), p].slice(-30); }); close(); });
      draw();
    });
  }
  // ---- the sheet: your three limits ----
  function openRules() {
    const R = myRules();
    sheet('Your rules', 'gp-sheet gp-rules', (s) => {
      const g = s.appendChild(el('div', 'gp-grid'));
      const a = field(g, 'Largest holding, at most %', R.one > 0 ? R.one : '', 'off'), b = field(g, 'Cash, at least %', R.cash > 0 ? R.cash : '', 'off'), c = field(g, 'Risk of a plan, at most %', R.risk > 0 ? R.risk : '', 'off');
      const btns = s.appendChild(el('div', 'g-btns gp-btns')), ok = btns.appendChild(el('button', 'btn primary gp-save', 'Save')); ok.type = 'button';
      ok.addEventListener('click', () => { const v = (i) => { const x = num(i.value); return x > 0 && x <= 100 ? x : 0; }; save((cf) => { cf.limits = { one: v(a), cash: v(b), risk: v(c) }; }); close(); });
      s.appendChild(el('div', 'gp-note', 'Your own limits. The app shows each one kept or broken; it never trades. Leave one empty to switch it off.'));
    });
  }

  // ---- Today: the rules as chips, the plans against the live price ----
  function todayBlock(box) {
    const P = plans(), H = holdings(), R = rules(myRules(), H, P);
    if (!R.list.length && !P.length) return null;
    if (P.length && window.SRLive && SRLive.want) SRLive.want('plans', P.map((p) => +p.id));
    const s = box.appendChild(el('section', 'gp')), hd = s.appendChild(el('div', 'gp-h')); hd.appendChild(el('h3', '', 'Your game plan'));
    const add = hd.appendChild(el('button', 'g-link gp-add', '+ Plan a trade')); add.type = 'button'; add.addEventListener('click', () => { const b = document.getElementById('btn-search'); if (b) b.click(); });
    if (R.list.length) {
      const chips = s.appendChild(el('div', 'gp-chips'));
      for (const r of R.list) { const c = chips.appendChild(el('button', 'gp-chip ' + (r.ok ? 'is-ok' : 'is-bad'))); c.type = 'button'; c.dataset.rule = r.id; c.title = `${r.label}: ${r.limit}. Now ${r.actual}.`; c.appendChild(el('i', '', r.ok ? '✓' : '✕')); const t = c.appendChild(el('span')); t.appendChild(el('b', '', r.short)); t.appendChild(el('small', '', r.actual)); c.addEventListener('click', openRules); }
    }
    for (const p of P) {
      const q = quote(p.id), w = q ? where(p, q.price) : null, row = s.appendChild(el('button', 'gp-row' + (w ? ' is-' + w.zone : ''))); row.type = 'button'; row.dataset.id = p.id;
      row.appendChild(el('b', 'gp-sym', p.s));
      const t = row.appendChild(el('div', 'gp-track')); t.setAttribute('role', 'img'); t.setAttribute('aria-label', `Stop ${trim(p.st)}, entry ${trim(p.e)}${p.t != null ? `, target ${trim(p.t)}` : ''}${q ? `, now ${trim(q.price)}` : ''}`);
      if (w) { t.appendChild(el('i', 'gp-tick')).style.left = (100 * w.entry) + '%'; t.appendChild(el('i', 'gp-dot')).style.left = (100 * w.pos) + '%'; }
      row.appendChild(el('span', 'gp-state', !w ? '…' : w.zone === 'stop' ? 'at the stop' : w.zone === 'target' ? 'at the target' : `${w.toEntry >= 0 ? '+' : '−'}${Math.abs(100 * w.toEntry).toFixed(1)}% from entry`));
      row.addEventListener('click', () => open({ id: p.id, symbol: p.s, name: p.n }));
    }
    const sp = (() => { try { const d = SRApp._store && SRApp._store.SPY; return d && d.status === 'ok' ? weather(d.data) : null; } catch (e) { return null; } })();
    if (sp) s.appendChild(el('div', 'gp-weather', `S&P 500: ${Math.abs(100 * sp.gap).toFixed(1)}% ${sp.above ? 'above' : 'below'} its 200-day average.`));
    return s;
  }

  window.SRPlan = { size, where, rules, weather, num, RULES0, plans, open, openRules, todayBlock, has: (id) => plans().some((p) => +p.id === +id), close };
})();
