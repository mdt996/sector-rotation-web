// book.js: one way to see a portfolio, for the demo account (trade.js) and each paper portfolio (labs.js).
// Matteo, 28 Nov 2026: "I would like to visualize the open position more compactly, and if I click on the single asset have more
// information. The first thing I want to see is the entire portfolio with the open asset positions split in percentage (also show
// the percentage of cash) something similar to etoro, but more customizable on what I want to see", then "also the history of
// trades should be added" (eToro's History: a period, its start and end value, one row per market) and "same thing for the paper
// portfolios".
//   split()    the whole in %: each part and the cash, grouped as the reader chooses (asset, class, sector, rule, side); a thin
//              bar for the shape (the four largest parts in colour, the rest together, the cash last) and a ranked list under it
//   rows()     compact rows: a name and the figures the reader chooses (at most three); a tap opens the rest under the row
//   history()  a period (7, 30, 90 days or all), what it made, and one row per market that opens on its trades
// The reader's choices are kept on the device (localStorage sr.bookGroup, sr.bookFields, sr.bookPeriod: never renamed).
(function () {
  'use strict';
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const money = (x, d) => (x < 0 ? '−$' : '$') + Math.abs(x).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const usd = (x) => money(x, 0), usd2 = (x) => (x > 0 ? '+' : '') + money(x, 2);
  const share = (x) => (!(x > 0) ? '0%' : x < 0.1 ? '<0.1%' : x < 10 ? x.toFixed(1) + '%' : Math.round(x) + '%');
  const pc = (x) => (!Number.isFinite(x) ? '–' : (x < 0 ? '−' : '+') + Math.abs(x).toFixed(2) + '%');
  const sign = (x) => (x > 0 ? 'up' : x < 0 ? 'down' : '');
  const day = (t) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const get = (k, id, d) => { try { const o = JSON.parse(localStorage.getItem(k) || '{}'); return o && o[id] != null ? o[id] : d; } catch (e) { return d; } };
  const put = (k, id, v) => { try { const o = JSON.parse(localStorage.getItem(k) || '{}') || {}; o[id] = v; localStorage.setItem(k, JSON.stringify(o)); } catch (e) { /* not kept */ } };
  const mem = { all: new Set(), open: new Map(), pick: new Set() };   // what is unfolded, for the redraws (each new reading draws again)
  const chips = (box, label, list, on, pick) => {
    const c = box.appendChild(el('div', 't-chips bk-chips')); if (label) c.appendChild(el('span', 't-chip-l', label));
    for (const [k, l] of list) { const b = c.appendChild(el('button', 't-chip' + (k === on ? ' on' : ''), l)); b.type = 'button'; b.dataset.k = k; b.setAttribute('aria-pressed', String(k === on)); b.addEventListener('click', () => pick(k)); }
    return c;
  };

  // ---- the whole, split ----
  // o: { id, total, cash, items: [{ value, order, by: { <group>: name } }], groups: [[key, label]], redraw, cashName }
  function split(box, o) {
    const g0 = get('sr.bookGroup', o.id, o.groups[0][0]), gk = o.groups.some((x) => x[0] === g0) ? g0 : o.groups[0][0];
    const card = box.appendChild(el('div', 'bk-split')); card.dataset.book = o.id; card.dataset.group = gk;
    if (o.groups.length > 1) chips(card, 'By', o.groups, gk, (k) => { put('sr.bookGroup', o.id, k); o.redraw(); });
    // colour follows the part, never its rank: the six largest get a colour each in the order they first came in (it.order: when
    // opened), so a part keeps its colour while prices move; the bar is drawn in that order too (the palette passes in that order)
    const m = new Map(), first = new Map(), its = o.items.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    for (const it of its) { const k = (it.by && it.by[gk]) || 'Other'; m.set(k, (m.get(k) || 0) + Math.max(0, +it.value || 0)); if (!first.has(k)) first.set(k, first.size); }
    const parts = [...m.entries()].map(([name, v]) => ({ name, v, at: first.get(name) })).filter((p) => p.v > 0).sort((a, b) => b.v - a.v || a.at - b.at);
    const cash = Math.max(0, +o.cash || 0), inPos = parts.reduce((s, p) => s + p.v, 0), total = o.total > 0 ? o.total : inPos + cash;
    if (!(total > 0)) { card.appendChild(el('div', 'g-hint', 'Nothing to split yet.')); return card; }
    const sum = card.appendChild(el('div', 'bk-sum'));
    sum.appendChild(el('b', '', usd(total))); sum.appendChild(el('span', '', ` · in positions ${share(100 * inPos / total)} · ${o.cashName || 'cash'} ${share(100 * cash / total)}`));
    const lit = parts.slice(0, 6).sort((a, b) => a.at - b.at), slotOf = new Map(lit.map((p, i) => [p.name, 'bk-c' + (i + 1)])), slot = (p) => slotOf.get(p.name) || 'bk-c0';
    const restV = parts.slice(6).reduce((s, p) => s + p.v, 0);
    const segs = [...lit.map((p) => [p.name, p.v, slot(p)]), ...(restV > 0 ? [[`${parts.length - 6} smaller`, restV, 'bk-c0']] : []), ...(cash > 0 ? [[o.cashName || 'Cash', cash, 'bk-cash']] : [])];
    const bar = card.appendChild(el('div', 'bk-bar')); bar.setAttribute('role', 'img');
    bar.setAttribute('aria-label', segs.map(([n, v]) => `${n} ${share(100 * v / total)}`).join(', '));
    for (const [n, v, c] of segs) { const i = bar.appendChild(el('i', c)); i.style.flexGrow = String(v); i.title = `${n} ${share(100 * v / total)}`; }
    // the list, largest first: six shown, the rest behind a tap; the cash always last
    const list = card.appendChild(el('div', 'bk-list')), all = mem.all.has(o.id + gk), maxV = Math.max(cash, ...parts.map((p) => p.v)) || 1;
    const line = (n, v, c) => { const r = list.appendChild(el('div', 'bk-li')); r.appendChild(el('span', 'bk-dot ' + c)); r.appendChild(el('span', 'bk-li-n', n));
      const t = r.appendChild(el('span', 'bk-li-t')); t.appendChild(el('i')).style.width = (100 * v / maxV).toFixed(1) + '%';
      r.appendChild(el('span', 'bk-li-p', share(100 * v / total))); r.appendChild(el('span', 'bk-li-v', usd(v))); r.dataset.part = n; return r; };
    parts.slice(0, all ? parts.length : 6).forEach((p) => line(p.name, p.v, slot(p)));
    if (parts.length > 6) { const b = list.appendChild(el('button', 'bk-more', all ? 'Show fewer' : `Show all ${parts.length}`)); b.type = 'button';
      b.addEventListener('click', () => { if (all) mem.all.delete(o.id + gk); else mem.all.add(o.id + gk); o.redraw(); }); }
    line(o.cashName || 'Cash', cash, 'bk-cash').classList.add('bk-li-cash');
    return card;
  }

  // ---- compact rows that open ----
  // o: { id, head, fields: [[key, label]], defaults: [keys], limit (rows shown before 'Show all'), items: [{ key, name, tag, lead(nameSpan), cells: { key: [text, cls, number to sort by] }, detail(panel) }], redraw, empty }
  function rows(box, o) {
    const known = new Set(o.fields.map((f) => f[0]));
    let chosen = get('sr.bookFields', o.id, o.defaults); if (!Array.isArray(chosen)) chosen = o.defaults; chosen = chosen.filter((k) => known.has(k)).slice(0, 3); if (!chosen.length) chosen = o.defaults.slice(0, 3);
    const wrap = box.appendChild(el('div', 'bk-rows')); wrap.dataset.book = o.id; wrap.style.setProperty('--bk-n', String(chosen.length));
    // which figures a row shows: up to three, chosen here and kept on the device
    const pick = wrap.appendChild(el('details', 'bk-pick')); pick.open = mem.pick.has(o.id); pick.addEventListener('toggle', () => { if (pick.open) mem.pick.add(o.id); else mem.pick.delete(o.id); });
    pick.appendChild(el('summary', '', `Showing ${chosen.map((k) => o.fields.find((f) => f[0] === k)[1]).join(', ')}`));
    const pc0 = pick.appendChild(el('div', 't-chips bk-chips'));
    for (const [k, l] of o.fields) { const on = chosen.includes(k), b = pc0.appendChild(el('button', 't-chip' + (on ? ' on' : ''), l)); b.type = 'button'; b.dataset.k = k; b.setAttribute('aria-pressed', String(on));
      b.addEventListener('click', () => { let c = chosen.slice(); if (c.includes(k)) { if (c.length > 1) c = c.filter((x) => x !== k); } else { c.push(k); if (c.length > 3) c.shift(); } put('sr.bookFields', o.id, c); o.redraw(); }); }
    pick.appendChild(el('div', 'g-hint', 'Up to three figures; a fourth replaces the first. Tap a column\'s name to sort by it, a row for everything else.'));
    // Build 168 (Matteo, 28 Nov 2026: "Allow to click on today or value etc... on those, to sort the column values ascending or
    // descending"): a column's name sorts the rows by it, largest first (the name: A to Z); a second tap turns it round, a third
    // goes back to the box's own order. Kept on the device (sr.bookSort, never rename), only while that column is shown.
    let so = get('sr.bookSort', o.id, null); if (!so || !(so.k === 'name' || chosen.includes(so.k)) || (so.d !== 1 && so.d !== -1)) so = null;
    const hd = wrap.appendChild(el('div', 'bk-hd'));
    const hb = (k, label, cls) => { const b = hd.appendChild(el('button', cls, label)); b.type = 'button'; b.dataset.k = k;
      const on = so && so.k === k; if (on) b.setAttribute('aria-sort', so.d > 0 ? 'ascending' : 'descending'); b.classList.toggle('on', !!on);
      b.addEventListener('click', () => { const first = k === 'name' ? 1 : -1, nx = !so || so.k !== k ? { k, d: first } : so.d === first ? { k, d: -first } : null; put('sr.bookSort', o.id, nx); o.redraw(); }); };
    hb('name', o.head || 'Asset', 'bk-hd-n');
    for (const k of chosen) hb(k, o.fields.find((f) => f[0] === k)[1], 'bk-hd-c');
    // a cell's third element is the figure it sorts by; rows without one go last either way
    let items = o.items;
    if (so) { const val = (it) => (so.k === 'name' ? it.name : it.cells && it.cells[so.k] ? it.cells[so.k][2] : null), ok = (v) => (so.k === 'name' ? v != null && v !== '' : Number.isFinite(v));
      items = o.items.map((it, i) => [it, val(it), i]).sort((a, b) => { const A = ok(a[1]), B = ok(b[1]); if (A !== B) return A ? -1 : 1; if (!A) return a[2] - b[2];
        const c = so.k === 'name' ? String(a[1]).localeCompare(String(b[1])) : a[1] - b[1]; return c ? so.d * c : a[2] - b[2]; }).map((x) => x[0]); }
    if (!o.items.length && o.empty) wrap.appendChild(el('div', 'g-hint', o.empty));
    const open = mem.open.get(o.id) || new Set(); mem.open.set(o.id, open);
    const showAll = !o.limit || mem.all.has(o.id + '|rows'), shown = showAll ? items : items.slice(0, o.limit);
    for (const it of shown) {
      const isOpen = open.has(it.key), r = wrap.appendChild(el('div', 'bk-row' + (isOpen ? ' open' : ''))); r.dataset.key = it.key;
      const b = r.appendChild(el('button', 'bk-head')); b.type = 'button'; b.setAttribute('aria-expanded', String(isOpen));
      const nm = b.appendChild(el('span', 'bk-name')), tx = nm.appendChild(el('span', 'bk-nm')); if (it.lead) it.lead(nm); tx.appendChild(el('b', '', it.name)); if (it.tag) tx.appendChild(el('span', 'bk-tag', it.tag));
      for (const k of chosen) { const c = (it.cells && it.cells[k]) || ['–', '']; b.appendChild(el('span', 'bk-c ' + (c[1] || ''), c[0])).dataset.f = k; }
      const panel = r.appendChild(el('div', 'bk-detail')); panel.hidden = !isOpen; if (isOpen && it.detail) it.detail(panel);
      b.addEventListener('click', () => {
        const now = !open.has(it.key); if (now) open.add(it.key); else open.delete(it.key);
        r.classList.toggle('open', now); b.setAttribute('aria-expanded', String(now)); panel.hidden = !now;
        if (now && !panel.childNodes.length && it.detail) it.detail(panel);
      });
    }
    if (o.limit && o.items.length > o.limit) { const b = wrap.appendChild(el('button', 'bk-more', showAll ? 'Show fewer' : `Show all ${o.items.length}`)); b.type = 'button';
      b.addEventListener('click', () => { if (showAll) mem.all.delete(o.id + '|rows'); else mem.all.add(o.id + '|rows'); o.redraw(); }); }
    return wrap;
  }
  // figures in pairs, for the opened rows: [[label, value, cls]]
  function grid(panel, pairs) {
    const g = panel.appendChild(el('div', 'bk-grid'));
    for (const [k, v, c] of pairs) { if (v == null || v === '') continue; const d = g.appendChild(el('div', 'bk-gi')); d.appendChild(el('span', 'bk-gk', k)); d.appendChild(el('span', 'bk-gv ' + (c || ''), v)); }
    return g;
  }

  // ---- the history: a period, what it made, one row per market ----
  // o: { id, trades: [{ market, name, lead, at, opened, invested, net, fees, line(panel) }], valueAt(t) -> value or null, valueNow, redraw }
  const PERIODS = [['7', '7 days'], ['30', '30 days'], ['90', '90 days'], ['all', 'All']];
  function history(box, o) {
    const p0 = get('sr.bookPeriod', o.id, '30'), per = PERIODS.some((x) => x[0] === p0) ? p0 : '30';
    const card = box.appendChild(el('div', 'bk-hist')); card.dataset.book = o.id; card.dataset.period = per;
    chips(card, '', PERIODS, per, (k) => { put('sr.bookPeriod', o.id, k); o.redraw(); });
    const first = o.trades.reduce((a, t) => Math.min(a, t.opened > 0 ? t.opened : t.at), Date.now());
    const from = per === 'all' ? first : Date.now() - (+per) * 864e5, T = o.trades.filter((t) => t.at >= from);
    const net = T.reduce((s, t) => s + t.net, 0), fees = T.reduce((s, t) => s + (t.fees || 0), 0), won = T.filter((t) => t.net > 0).length;
    const v0 = o.valueAt ? o.valueAt(from) : null, g = card.appendChild(el('div', 'bk-hsum'));
    const tileH = (k, v, sub, cls) => { const d = g.appendChild(el('div', 'bk-ht')); d.appendChild(el('span', 'bk-ht-v ' + (cls || ''), v)); d.appendChild(el('span', 'bk-ht-k', k)); if (sub) d.appendChild(el('span', 'bk-ht-s', sub)); return d; };
    tileH('Period', `${day(from)} – ${day(Date.now())}`);
    if (v0 > 0) tileH('Value at the start', usd(v0));
    tileH('Closed trades P/L', usd2(net), v0 > 0 ? pc(100 * net / v0) + ' of the start' : `${T.length} trade${T.length === 1 ? '' : 's'}`, sign(net)).dataset.h = 'net';
    tileH('Fees', money(fees, 2));
    if (o.valueNow > 0) tileH('Value now', usd(o.valueNow), v0 > 0 ? pc(100 * (o.valueNow / v0 - 1)) + ' in all, open positions included' : '', v0 > 0 ? sign(o.valueNow - v0) : '');
    if (T.length) card.appendChild(el('div', 'g-hint bk-hnote', `${T.length} trade${T.length === 1 ? '' : 's'} closed, ${won} with a gain (${Math.round(100 * won / T.length)}%). P/L after costs; % against the money put in.`));
    const M = new Map(); for (const t of T) { const k = t.market; const x = M.get(k) || { name: t.name || k, lead: t.lead, n: 0, won: 0, inv: 0, net: 0, fees: 0, list: [] }; x.n++; if (t.net > 0) x.won++; x.inv += t.invested || 0; x.net += t.net; x.fees += t.fees || 0; x.list.push(t); M.set(k, x); }
    const mk = [...M.entries()].sort((a, b) => b[1].inv - a[1].inv || b[1].n - a[1].n);
    rows(card, { id: o.id + '-mk', head: `Market (${mk.length})`, redraw: o.redraw, empty: o.trades.length ? 'No trade closed in this period.' : 'No trade has closed yet.',
      fields: [['pl', 'P/L'], ['pct', 'P/L %'], ['inv', 'Invested'], ['fees', 'Fees'], ['end', 'End value'], ['n', 'Trades']], defaults: ['pl', 'pct', 'inv'],
      items: mk.map(([k, x]) => ({ key: k, name: x.name, lead: x.lead, tag: x.n > 1 ? `${x.n} trades` : '',
        cells: { pl: [usd2(x.net), sign(x.net), x.net], pct: [x.inv > 0 ? pc(100 * x.net / x.inv) : '–', sign(x.net), x.inv > 0 ? x.net / x.inv : null], inv: [x.inv > 0 ? usd(x.inv) : '–', '', x.inv > 0 ? x.inv : null], fees: [money(x.fees, 2), '', x.fees], end: [x.inv > 0 ? usd(x.inv + x.net) : '–', '', x.inv > 0 ? x.inv + x.net : null], n: [String(x.n), '', x.n] },
        detail: (panel) => {
          grid(panel, [['Trades', `${x.n} (${x.won} with a gain)`], ['Invested', x.inv > 0 ? usd(x.inv) : '–'], ['P/L', `${usd2(x.net)}${x.inv > 0 ? ' (' + pc(100 * x.net / x.inv) + ')' : ''}`, sign(x.net)], ['Fees', money(x.fees, 2)], ['End value', x.inv > 0 ? usd(x.inv + x.net) : '–']]);
          const L = panel.appendChild(el('div', 'bk-trades')); for (const t of x.list.slice().sort((a, b) => b.at - a.at)) t.line(L);
        } })) });
    return card;
  }
  window.SRBook = { split, rows, grid, history, share, _mem: mem };
})();
