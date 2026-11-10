// ---- Small drawn values -------------------------------------------------------
// The row a drawing reads: data-row (0-based) or data-where="col=value&col=value". Values shown as they are carry
// data-field; words derived from a value (above/below, an absolute size, a verdict) name it in data-of.
SR.markRow = (el, rows) => {
  const w = el.getAttribute('data-where');
  if (w) {
    const pairs = w.split('&').map((kv) => kv.split('=').map((x) => decodeURIComponent(x)));
    return rows.find((r) => pairs.every(([k, v]) => String(r[k]) === v)) || null;
  }
  return rows[Number(el.getAttribute('data-row') || 0)] || null;
};
SR.edge = (g) => {
  if (!g || g.hit_rate == null || g.base_rate == null || g.events < 10) return 'too few cases to tell';
  const z = (g.hit_rate - g.base_rate) / Math.sqrt((g.base_rate * (1 - g.base_rate)) / g.events);
  return z >= 2 ? 'a clear edge' : z >= 1 ? 'a modest edge, not yet conclusive' : 'no better than chance';
};
SR.fmtValue = (fmt, v, row) => {
  if (v == null || (typeof v === 'number' && !isFinite(v))) return '—';
  switch (fmt) {
    case 'abs1': return d3.format('.1%')(Math.abs(v));
    case 'pct0': return d3.format('.0%')(v);
    case 'pct1': return d3.format('.1%')(v);
    case 'sgn1': return SR.pct(v);
    case 'int': return d3.format('d')(v);
    case 'pts': return d3.format('.1f')(Math.abs(v) * 100);
    case 'side': return v >= 0 ? 'above' : 'below';
    case 'lead': return v < 0 ? 'defensive sectors ahead of cyclical ones' : 'cyclical sectors ahead of defensive ones';
    case 'volrank': return v >= 0.995 ? 'the highest in a year' : `above ${d3.format('.0%')(v)} of the last year's readings`;
    case 'since': return row && row.changed ? `changed this week, from ${v}` : 'same as a week ago';
    case 'edge': return SR.edge(row);
    case 'month': return d3.utcFormat('%b %Y')(new Date(v + 'T00:00:00Z'));
    default: return String(v);
  }
};
SR.drawValue = (id) => (el) => {
  const d = dash.data(id), row = d.status === 'ok' ? SR.markRow(el, d.data) : null;
  const f = el.getAttribute('data-field') || el.getAttribute('data-of'), fmt = el.getAttribute('data-fmt') || 'text', v = row ? row[f] : null;
  el.classList.remove('pos', 'neg');
  el.textContent = row ? SR.fmtValue(fmt, v, row) : '—';
  if (fmt === 'sgn1' && row) { const c = SR.signCls(v); if (c) el.classList.add(c); }
};
dash.draw('rv', SR.drawValue('regime'));
dash.draw('sv', SR.drawValue('study_rules'));

// ---- Your holdings -------------------------------------------------------------
SR.revTicker = (sym) => {
  const R = dash.data('revolut');
  const x = R.status === 'ok' ? R.data.find((q) => q.us === sym) : null;
  return x && x.revolut_ticker ? x.revolut_ticker : null;
};
SR.verdictCls = (v) => (/overheated|^(Rotate out|Trim|Reduce)/i.test(v || '') ? 'sr-verdict-out' : v === 'Hold, strong' || /good time to add/.test(v || '') ? 'sr-verdict-in' : v === 'No signal' ? 'sr-muted' : '');

dash.draw('foliolist', (el) => {
  const d = dash.data('portfolio');
  if (d.status !== 'ok') { el.textContent = '—'; return; }
  const test = { hot: (v) => /overheated/i.test(v), out: (v) => v === 'Reduce', lag: (v) => v === 'Hold, lagging', add: (v) => /good time to add/.test(v) }[el.getAttribute('data-kind')] || (() => false);
  const rows = d.data.filter((r) => test(r.verdict || ''));
  el.textContent = rows.length ? rows.map((r) => r.ticker + (r.amount ? ' ' + SR.eur(r.amount) : '') + (r.into ? ` (or ${r.into}${r.into_revolut ? ' / ' + r.into_revolut : ''}${r.step ? ', ' + SR.eur(r.step) + ' a week' : ''})` : '')).join(', ') : 'none';
});

SR.eur = (x) => (x == null || !isFinite(x) ? '—' : '€' + d3.format(',.0f')(x));
// the total of the euro amounts typed in Settings (the app only; the dashboard has none)
dash.draw('foliototal', (el) => {
  const T = SR.liveTotals ? SR.liveTotals() : null; // the phone app's live prices
  if (T) {
    el.replaceChildren();
    const b = el.appendChild(document.createElement('b')); b.textContent = 'Total ' + SR.eur(T.total);
    const t = el.appendChild(document.createElement('span')); t.className = SR.signCls(T.today);
    t.textContent = `  today ${SR.fmtEurLive(T.today, true)} (${SR.fmtPctLive(T.todayPct)})`;
    if (T.lt) el.appendChild(document.createTextNode(` · long term ${d3.format('.0%')(T.lt / T.total)}`));
    return;
  }
  const d = dash.data('portfolio'), rows = d.status === 'ok' ? d.data.filter((r) => r.amount > 0) : [];
  if (!rows.length) { el.textContent = ''; return; } // nothing shows without amounts (the dashboard has none)
  const sum = (f) => rows.filter(f).reduce((a, r) => a + r.amount, 0), total = sum(() => true), lt = sum((r) => r.long_term);
  el.textContent = `Total ${SR.eur(total)}` + (lt ? `: long term ${SR.eur(lt)} (${d3.format('.0%')(lt / total)}), the rest ${SR.eur(total - lt)} (${d3.format('.0%')(1 - lt / total)})` : '') + '. ';
});

dash.draw('foliofx', (el) => {
  const d = dash.data('portfolio'), fx = d.status === 'ok' ? (d.data.find((r) => r.eurusd_1m != null) || {}).eurusd_1m : null;
  el.textContent = fx == null ? '—' : `The euro ${fx >= 0 ? 'rose' : 'fell'} ${d3.format('.1%')(Math.abs(fx))} against the dollar over the month, so your dollar-based holdings ${fx >= 0 ? 'lost' : 'gained'} that much extra in euros.`;
});

dash.draw('folio', (tbody) => {
  const d = dash.data('portfolio');
  tbody.replaceChildren();
  if (d.status !== 'ok') return;
  const table = tbody.closest('table');
  if (table) table.classList.toggle('sr-noamt', !d.data.some((h) => h.amount > 0)); // the Value column only when amounts were given
  if (table) table.classList.toggle('sr-nolive', !(SR.liveFolio && d.data.some((h) => SR.liveFolio(h)))); // Today only with live prices
  if (table) table.classList.toggle('sr-nozone', !(SR.zoneFolio && d.data.some((h) => SR.zoneFolio(h)))); // Zone only in the app
  for (const h of d.data) {
    const tr = tbody.appendChild(document.createElement('tr'));
    tr.setAttribute('data-key', h.ticker);
    tr.addEventListener('click', () => SR.open(h.tracks));
    // sr-h holding, sr-v verdict, sr-f a fact (labelled when the table turns into cards on phones)
    const td = (kind, label, num) => { const c = tr.appendChild(document.createElement('td')); c.className = [kind, num ? 'num' : ''].filter(Boolean).join(' '); if (label) c.setAttribute('data-label', label); return c; };
    const txt = (kind, label, text, cls, num) => { const c = td(kind, label, num); if (text === '—') c.classList.add('sr-empty'); if (cls) { const s = c.appendChild(document.createElement('span')); s.className = cls; s.textContent = text; } else c.textContent = text; };
    const hc = td('sr-h'); const b = hc.appendChild(document.createElement('b')); b.textContent = h.ticker;
    txt('sr-n', '', h.name || h.tracks_name || '—');
    const L = SR.liveFolio ? SR.liveFolio(h) : null, val = L && L.value != null ? L.value : h.amount, share = L && L.share != null ? L.share : h.share;
    txt('sr-f sr-amt', 'Value', val ? SR.eur(val) + (share != null ? ' · ' + d3.format('.1%')(share) : '') : '—', '', true);
    const Z = SR.zoneFolio ? SR.zoneFolio(h) : null;
    txt('sr-f sr-zone', '2-year range', Z ? Z.label : '—', Z ? 'sr-z z-' + Z.key : '');
    txt('sr-f sr-today', 'Today', L && L.chg != null ? SR.fmtPctLive(L.chg) + (L.chgEur != null ? ' · ' + SR.fmtEurLive(L.chgEur, true) : '') : '—', L ? SR.signCls(L.chg) : '', true);
    txt('sr-f', 'Follows', h.tracks || '—');
    txt('sr-f sr-c-match', 'Match', h.match || '—');
    if (h.match !== 'rough') tr.lastChild.classList.add('sr-empty'); // on phones, only a rough match is worth a line
    txt('sr-f', '1M €', SR.pct(h.r1m_eur), SR.signCls(h.r1m_eur), true);
    txt('sr-f sr-c-3m', '3M €', SR.pct(h.r3m_eur), SR.signCls(h.r3m_eur), true);
    txt('sr-f', '12 months', SR.pct(h.score), SR.signCls(h.score), true);
    txt('sr-f', 'vs 200-day', SR.pct(h.vs_ma200), SR.signCls(h.vs_ma200), true);
    txt('sr-f', 'Daily', h.phase || '—', SR.phaseCls(h.phase));
    txt('sr-f', 'Weekly', h.phase_w || '—', SR.phaseCls(h.phase_w));
    txt('sr-v', '', h.verdict || '—', SR.verdictCls(h.verdict));
    txt('sr-f', 'Weekly RSI', h.rsi_w == null ? '—' : d3.format('.0f')(h.rsi_w), h.overheated ? 'sr-hot' : '', true);
  }
});

// ---- 15-year study (a fixed file) ----------------------------------------------
SR.btColors = () => ({ smhplan: dash.colors[3], rule: dash.colors[0], qqqdef: dash.colors[1], equal: dash.colors[2], spy: 'var(--color-fg-muted)' });

dash.draw('bt', (el) => {
  if (!SR.ready(['study_curve'])) { SR.wait(el, ['study_curve']); return; }
  el.classList.remove('dash-skeleton');
  el.replaceChildren();
  const B = dash.data('study_curve').data.map((r) => ({ ...r, d: new Date(r.date + 'T00:00:00Z') }));
  if (B.length < 2) { const f = el.appendChild(document.createElement('div')); f.className = 'sr-failed'; f.textContent = 'No study data'; return; }
  const col = SR.btColors(), keys = [['smhplan', 'Semis on trend'], ['qqqdef', 'Nasdaq + defensive'], ['rule', 'Rule'], ['spy', 'SPY']].filter(([k]) => B[0][k] != null);
  const W = Math.max(300, el.clientWidth), H = W < 560 ? 280 : 330;
  const svg = SR.svg(el, W, H).attr('aria-label', '15-year study: value of 100 invested');
  const tip = SR.tip(el);
  const lab = (k, name) => `${name} ${d3.format(',.0f')(B[B.length - 1][k])}`;
  const labW = d3.max(keys, ([k, n]) => SR.textWidth(svg, lab(k, n))) + 10;
  const ml = 42, mr = Math.ceil(labW), mt = 10, mb = 24, iw = W - ml - mr, ih = H - mt - mb;
  const x = d3.scaleUtc().domain(d3.extent(B, (r) => r.d)).range([ml, ml + iw]);
  const lo = d3.min(B, (r) => d3.min(keys, ([k]) => r[k])), hi = d3.max(B, (r) => d3.max(keys, ([k]) => r[k]));
  const y = d3.scaleLog().domain([Math.min(lo, 100) * 0.95, hi * 1.05]).range([mt + ih, mt]); // log scale: equal heights are equal percentage moves
  const yt = [50, 75, 100, 150, 200, 300, 400, 600, 800, 1200, 1600].filter((v) => v >= y.domain()[0] && v <= y.domain()[1]);
  svg.append('g').selectAll('line').data(yt).join('line').attr('class', 'sr-grid-line').attr('x1', ml).attr('x2', ml + iw).attr('y1', y).attr('y2', y);
  svg.append('g').selectAll('text').data(yt).join('text').attr('x', ml - 6).attr('y', (v) => y(v) + 4).attr('text-anchor', 'end').text((v) => String(v));
  svg.append('line').style('stroke', 'var(--cds-chart-reference)').attr('x1', ml).attr('x2', ml + iw).attr('y1', y(100)).attr('y2', y(100));
  const xt = x.ticks(Math.max(3, Math.floor(iw / 50)));
  const xl = svg.append('g').selectAll('text').data(xt).join('text').attr('x', x).attr('y', H - 6).attr('text-anchor', 'middle').text(d3.utcFormat('%Y'));
  let lastRight = -Infinity; // drop date labels that would overlap the one before
  xl.nodes().forEach((n) => { const b = n.getBBox(); if (b.x < lastRight + 8 || b.x < 0 || b.x + b.width > W) n.remove(); else lastRight = b.x + b.width; });
  for (const [k] of keys) svg.append('path').datum(B).attr('d', d3.line().x((r) => x(r.d)).y((r) => y(r[k])))
    .attr('fill', 'none').style('stroke', col[k]).attr('stroke-width', k === 'smhplan' || k === 'qqqdef' ? 2.2 : 1.6).attr('stroke-dasharray', k === 'spy' ? '4 3' : null).attr('stroke-linejoin', 'round');
  const ends = SR.spread(keys.map(([k, n]) => ({ k, n, y: y(B[B.length - 1][k]) })), 13, mt + 4, mt + ih);
  for (const e of ends) svg.append('text').attr('x', ml + iw + 6).attr('y', e.y + 4).style('fill', col[e.k]).style('font-weight', 600).text(lab(e.k, e.n));
  const rule = svg.append('line').style('stroke', 'var(--color-fg-muted)').attr('stroke-dasharray', '3 3').attr('y1', mt).attr('y2', mt + ih).style('display', 'none');
  const dates = B.map((r) => r.d);
  svg.append('rect').attr('x', ml).attr('y', mt).attr('width', iw).attr('height', ih).attr('fill', 'transparent')
    .on('pointermove', (ev) => {
      const [mx, my] = d3.pointer(ev, svg.node());
      const r = B[d3.bisectCenter(dates, x.invert(mx))];
      rule.style('display', null).attr('x1', x(r.d)).attr('x2', x(r.d));
      tip.show(x(r.d), my, 'Week of ' + d3.utcFormat('%b %-d, %Y')(r.d), keys.map(([k, n]) => [n, d3.format(',.0f')(r[k]), col[k]]));
    })
    .on('pointerleave', () => { rule.style('display', 'none'); tip.hide(); });
});

SR.cells = (tr) => (text, cls, num = true, label) => { const c = tr.appendChild(document.createElement('td')); if (num) c.className = 'num'; if (label) c.setAttribute('data-label', label); if (cls) { const x = c.appendChild(document.createElement('span')); x.className = cls; x.textContent = text; } else c.textContent = text; return c; };
dash.draw('bts', (tbody) => {
  const d = dash.data('study_rules');
  tbody.replaceChildren();
  if (d.status !== 'ok') return;
  const f1 = d3.format('.1%');
  for (const s of d.data) {
    const tr = tbody.appendChild(document.createElement('tr'));
    tr.setAttribute('data-key', s.key);
    const cell = SR.cells(tr);
    cell(s.label, '', false);
    cell(SR.pct(s.cagr_tax), SR.signCls(s.cagr_tax), true, 'A year, after tax');
    cell(SR.pct(s.cagr), SR.signCls(s.cagr), true, 'Before tax');
    cell(f1(s.vol), '', true, 'Volatility');
    cell(f1(s.max_dd), 'neg', true, 'Worst drop');
    cell(SR.pct(s.cagr_2011_18), SR.signCls(s.cagr_2011_18), true, '2000–11');
    cell(SR.pct(s.cagr_2019_26), SR.signCls(s.cagr_2019_26), true, '2011–26');
  }
});
dash.draw('splits', (tbody) => {
  const d = dash.data('study_splits');
  tbody.replaceChildren();
  if (d.status !== 'ok') return;
  const f1 = d3.format('.1%'), my = (v) => d3.utcFormat('%b %Y')(new Date(v + 'T00:00:00Z'));
  for (const s of d.data) {
    const tr = tbody.appendChild(document.createElement('tr'));
    tr.setAttribute('data-key', s.key);
    const cell = SR.cells(tr);
    const p = cell(s.period, '', false);
    const sub = p.appendChild(document.createElement('span')); sub.className = 'sr-sub'; sub.textContent = `${my(s.from)} – ${my(s.to)}` + (s.sectors && s.sectors < 11 ? `, ${s.sectors} sectors` : '');
    cell(s.split, '', false);
    cell(SR.pct(s.cagr), SR.signCls(s.cagr), true, 'Per year');
    cell(f1(s.vol), '', true, 'Volatility');
    cell(f1(s.max_dd), 'neg', true, 'Worst drop');
    cell(SR.pct(s.spy_cagr), SR.signCls(s.spy_cagr), true, 'S&P 500');
    cell(f1(s.spy_max_dd), 'neg', true, 'S&P 500 worst drop');
  }
});
