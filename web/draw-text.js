// ---- Text drawings -------------------------------------------------------
dash.draw('asof', (el) => {
  const d = dash.data('settings');
  el.textContent = d.status === 'ok' && d.data[0] && d.data[0].asof ? d3.utcFormat('%a %b %-d, %Y')(new Date(d.data[0].asof + 'T00:00:00Z')) : '—';
});

dash.draw('k', (el) => {
  const d = dash.data('settings'), f = el.getAttribute('data-field'), fmt = el.getAttribute('data-fmt');
  const v = d.status === 'ok' && d.data[0] ? d.data[0][f] : null;
  el.textContent = v == null ? '—' : fmt === 'pct' ? d3.format('.1~%')(v) : String(v);
});

dash.draw('kpi', (el) => {
  const d = dash.data('summary'), f = el.getAttribute('data-field'), fmt = el.getAttribute('data-fmt');
  const row = d.status === 'ok' ? d.data[0] : null;
  const v = row ? row[f] : null;
  el.classList.remove('pos', 'neg');
  if (v == null) { el.textContent = '—'; return; }
  if (fmt === 'pct') { el.textContent = SR.pct(v); const c = SR.signCls(v); if (c) el.classList.add(c); }
  else if (fmt === 'int') el.textContent = d3.format('d')(v);
  else el.textContent = String(v);
});

dash.draw('names', (el) => {
  const d = dash.data('metrics');
  if (d.status !== 'ok') { el.textContent = '—'; return; }
  const list = el.getAttribute('data-list');
  const eq = d.data.filter((m) => ['Sector', 'Industry', 'Commodity'].includes(m.group) && m.r1m != null);
  let pick = [];
  if (list === 'leaders') pick = eq.slice().sort((a, b) => b.r1m - a.r1m).slice(0, 3).map((m) => `${m.name} ${SR.pct(m.r1m)}`);
  if (list === 'fading') pick = eq.filter((m) => m.fading).sort((a, b) => b.r1m - a.r1m).slice(0, 4).map((m) => m.name);
  if (list === 'turning') pick = eq.filter((m) => m.turning && !m.fading).sort((a, b) => (b.mom || 0) - (a.mom || 0)).slice(0, 4).map((m) => m.name);
  el.textContent = pick.length ? pick.join(', ') : 'none right now';
});

// ---- Rotation rule ---------------------------------------------------------------
SR.ruleRows = () => { const d = dash.data('rule'); return d.status === 'ok' ? d.data : null; };
SR.day = (d) => (d ? d3.utcFormat('%b %-d')(new Date(d + 'T00:00:00Z')) : '—');
dash.draw('rulesplit', (el) => {
  const R = SR.ruleRows();
  if (!R) { el.textContent = '—'; return; }
  const parts = R.filter((r) => r.target > 0).sort((a, b) => b.target - a.target || (a.rank || 99) - (b.rank || 99));
  const any = R.find((r) => r.last_friday) || {};
  el.textContent = parts.length
    ? parts.map((r) => `${r.symbol} ${d3.format('.0%')(r.target)}`).join(' · ') + ` (Fridays ${SR.day(any.first_friday)} to ${SR.day(any.last_friday)})`
    : 'no sector has a full year of history yet';
});
dash.draw('rulechg', (el) => {
  const R = SR.ruleRows();
  if (!R) { el.textContent = '—'; return; }
  const sec = R.filter((r) => r.sector).sort((a, b) => (a.rank || 99) - (b.rank || 99));
  const last = (R.find((r) => r.last_friday) || {}).last_friday, asof = (sec[0] || {}).date;
  const picks = sec.filter((r) => r.pick).map((r) => r.symbol), now = sec.filter((r) => r.now).map((r) => r.symbol);
  const added = sec.filter((r) => r.new_pick).map((r) => r.symbol), dropped = sec.filter((r) => r.dropped).map((r) => r.symbol);
  let t = `Picks on Friday ${SR.day(last)}: ${picks.join(', ') || 'none'}`;
  t += added.length || dropped.length ? ` (in: ${added.join(', ') || 'none'}; out: ${dropped.join(', ') || 'none'}).` : ', the same as the Friday before.';
  if (asof && last && asof !== last) {
    const ins = now.filter((s) => !picks.includes(s)), outs = picks.filter((s) => !now.includes(s));
    t += ins.length ? ` If the week ended on ${SR.day(asof)}, ${ins.join(', ')} would replace ${outs.join(', ')}.` : ` On ${SR.day(asof)} the ranking still gives the same picks.`;
  }
  el.textContent = t;
});
dash.draw('ruletab', (tbody) => {
  tbody.replaceChildren();
  const R = SR.ruleRows();
  if (!R) return;
  const f0 = d3.format('.0%');
  for (const r of R.filter((q) => q.sector).sort((a, b) => (a.rank || 99) - (b.rank || 99))) {
    const tr = tbody.appendChild(document.createElement('tr'));
    tr.setAttribute('data-key', r.symbol);
    if (r.pick) tr.classList.add('sr-pick');
    tr.addEventListener('click', () => SR.open(r.symbol));
    const cell = (text, cls, num) => { const c = tr.appendChild(document.createElement('td')); if (num) c.className = 'num'; if (cls) { const s = c.appendChild(document.createElement('span')); s.className = cls; s.textContent = text; } else c.textContent = text; return c; };
    const first = tr.appendChild(document.createElement('td'));
    first.appendChild(document.createElement('b')).textContent = r.symbol;
    const sub = first.appendChild(document.createElement('span')); sub.className = 'sr-sub'; sub.textContent = r.name;
    cell(r.rank == null ? '—' : String(r.rank), r.now ? 'sr-top' : 'sr-muted', true);
    cell(SR.pct(r.score), SR.signCls(r.score), true);
    const dots = tr.appendChild(document.createElement('td'));
    dots.className = 'sr-dots';
    dots.setAttribute('aria-label', r.hist ? `${r.weeks} of the last ${r.hist.length} Fridays, oldest first` : 'not ranked');
    for (const ch of r.hist || '') { const i = dots.appendChild(document.createElement('i')); if (ch === '1') i.className = 'on'; }
    cell(r.target == null ? '—' : f0(r.target), r.target > 0 ? 'sr-top' : 'sr-muted', true);
    cell(r.vol12m == null ? '—' : f0(r.vol12m), '', true);
    cell(r.per_risk == null ? '—' : d3.format('.2f')(r.per_risk), SR.signCls(r.per_risk), true);
    cell(r.vs_ma200 == null ? '—' : SR.pct(r.vs_ma200), SR.signCls(r.vs_ma200), true);
    cell(r.revolut || '—');
  }
});

// Return against volatility: the rule's yardstick on the up axis, the year's volatility across.
SR.drawRiskReturn = (el) => {
  if (!SR.ready(['rule'])) { SR.wait(el, ['rule']); return; }
  el.classList.remove('dash-skeleton');
  el.replaceChildren();
  const view = SR.view(), R = dash.data('rule').data;
  const pts = R.filter((r) => r.group === view && r.score != null && r.vol12m != null);
  const spy = R.find((r) => r.symbol === 'SPY' && r.score != null && r.vol12m != null);
  if (!pts.length) { const f = el.appendChild(document.createElement('div')); f.className = 'sr-failed'; f.textContent = 'Not a year of history yet for this group'; return; }
  const all = spy ? [...pts, spy] : pts;
  const W = Math.max(300, el.clientWidth), H = Math.round(Math.min(560, Math.max(340, W * 0.62)));
  const svg = SR.svg(el, W, H).attr('aria-label', 'Return against volatility');
  const tip = SR.tip(el);
  const ml = 58, mr = 16, mt = 12, mb = 36, iw = W - ml - mr, ih = H - mt - mb;
  const ylo = Math.min(0, d3.min(all, (r) => r.score)), yhi = Math.max(0, d3.max(all, (r) => r.score)), pad = (yhi - ylo) * 0.1 || 0.05;
  const x = d3.scaleLinear().domain([0, d3.max(all, (r) => r.vol12m) * 1.1]).nice().range([ml, ml + iw]);
  const y = d3.scaleLinear().domain([ylo - pad, yhi + pad]).nice().range([mt + ih, mt]);
  const xt = x.ticks(Math.max(3, Math.floor(iw / 70))), yt = y.ticks(Math.max(3, Math.floor(ih / 50)));
  svg.append('g').selectAll('line').data(yt).join('line').attr('class', 'sr-grid-line').attr('x1', ml).attr('x2', ml + iw).attr('y1', y).attr('y2', y);
  svg.append('g').selectAll('text').data(yt).join('text').attr('x', ml - 6).attr('y', (v) => y(v) + 4).attr('text-anchor', 'end').text(d3.format('+.0%'));
  svg.append('g').selectAll('text').data(xt).join('text').attr('x', x).attr('y', mt + ih + 14).attr('text-anchor', 'middle').text(d3.format('.0%'));
  svg.append('line').attr('class', 'sr-axis-line').attr('x1', ml).attr('x2', ml + iw).attr('y1', y(0)).attr('y2', y(0));
  // equal return-for-risk lines through zero: everything on a line earns the same per unit of volatility
  const [x0, x1] = x.domain(), [, y1] = y.domain();
  const taken = pts.map((r) => ({ x: x(r.vol12m) - 12, y: y(r.score) - 12, w: 24 + 9 + SR.textWidth(svg, r.symbol), h: 24 }));
  if (spy) taken.push({ x: x(spy.vol12m) - 40, y: y(spy.score) - 12, w: 52, h: 24 });
  const free = (b) => taken.every((t) => b.x + b.w < t.x || t.x + t.w < b.x || b.y + b.h < t.y || t.y + t.h < b.y);
  for (const k of [0.5, 1, 2]) {
    const xe = Math.min(x1, y1 / k);
    if (xe <= x0) continue;
    svg.append('line').attr('class', 'sr-guide').attr('x1', x(0)).attr('y1', y(0)).attr('x2', x(xe)).attr('y2', y(k * xe));
    const label = `${k}×`, w = SR.textWidth(svg, label) + 4;
    for (const f of [0.96, 0.86, 0.76, 0.66, 0.56, 0.46, 0.36]) {
      const px = x(xe * f), py = y(k * xe * f), b = { x: px - w - 2, y: py - 14, w, h: 12 };
      if (b.x < ml || b.y < mt || !free(b)) continue;
      svg.append('text').attr('class', 'sr-guide-label sr-halo').attr('x', px - 4).attr('y', py - 4).attr('text-anchor', 'end').text(label);
      taken.push(b);
      break;
    }
  }
  svg.append('text').attr('x', ml + iw).attr('y', H - 4).attr('text-anchor', 'end').text('Volatility over the year →');
  svg.append('text').attr('transform', `translate(12,${mt + ih / 2}) rotate(-90)`).attr('text-anchor', 'middle').text('12-month return, without the last →');
  const sectorView = view === 'Sector';
  const colorOf = (r) => (sectorView && !r.pick ? 'var(--cds-chart-muted)' : dash.colors[0]);
  const heads = pts.map((r) => ({ r, hx: x(r.vol12m), hy: y(r.score), y: y(r.score) }));
  if (spy) {
    const sx = x(spy.vol12m), sy = y(spy.score);
    svg.append('path').attr('d', d3.symbol(d3.symbolDiamond, 70)()).attr('transform', `translate(${sx},${sy})`).style('fill', 'var(--color-fg-muted)');
    svg.append('text').attr('class', 'sr-halo').attr('x', sx - 8).attr('y', sy + 4).attr('text-anchor', 'end').style('fill', 'var(--color-fg-muted)').text('SPY');
  }
  if (sectorView) svg.append('g').selectAll('circle').data(heads.filter((d) => d.r.pick)).join('circle').attr('cx', (d) => d.hx).attr('cy', (d) => d.hy).attr('r', 10)
    .attr('fill', 'none').style('stroke', dash.colors[0]).attr('stroke-width', 1.5);
  svg.append('g').selectAll('circle').data(heads).join('circle').attr('cx', (d) => d.hx).attr('cy', (d) => d.hy).attr('r', 5.5)
    .style('fill', (d) => (d.r.above === false ? 'var(--color-panel)' : colorOf(d.r))).style('stroke', (d) => (d.r.above === false ? colorOf(d.r) : 'var(--color-panel)'))
    .attr('stroke-width', (d) => (d.r.above === false ? 2 : 1.5)).style('cursor', 'pointer')
    .on('pointerenter', (ev, d) => tip.show(d.hx, d.hy, `${d.r.symbol} · ${d.r.name || ''}`, [
      ['12 months, without the last', SR.pct(d.r.score)], ['Volatility over the year', d3.format('.0%')(d.r.vol12m)],
      ['Return ÷ volatility', d.r.per_risk == null ? '—' : d3.format('.2f')(d.r.per_risk)], ['vs 200-day average', SR.pct(d.r.vs_ma200)],
      ...(d.r.sector ? [['Rule', d.r.pick ? `a pick, target ${d3.format('.0%')(d.r.target || 0)}` : `rank ${d.r.rank || '—'}, not a pick`]] : []),
    ]))
    .on('pointerleave', () => tip.hide())
    .on('click', (ev, d) => SR.open(d.r.symbol));
  for (const d of SR.spread(heads.map((d) => ({ ...d })), 12, mt + 6, mt + ih - 4)) {
    if (Math.abs(d.y - d.hy) > 5) svg.append('line').attr('x1', d.hx + 5).attr('y1', d.hy).attr('x2', d.hx + 8).attr('y2', d.y).style('stroke', 'var(--color-fg-muted)').attr('stroke-width', 0.8);
    svg.append('text').attr('class', 'sr-halo').attr('x', d.hx + 9).attr('y', d.y + 4).style('fill', 'var(--color-fg)').style('font-weight', sectorView && d.r.pick ? 700 : 600).text(d.r.symbol);
  }
};

// ---- Ranking table ---------------------------------------------------------
dash.draw('rank', (tbody) => {
  const d = dash.data('metrics');
  tbody.replaceChildren();
  if (d.status !== 'ok') return;
  const p = dash.params(), key = p.sort || 'r1m', dir = p.dir === 'asc' ? 1 : -1, grp = SR.tgrp();
  const sel = SR.sym();
  const rows = d.data.filter((m) => grp === 'all' || m.group === grp).slice().sort((a, b) => {
    const x = a[key], y = b[key];
    if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1;
    return (typeof x === 'string' ? x.localeCompare(y) : x - y) * dir;
  });
  for (const m of rows) {
    const tr = tbody.appendChild(document.createElement('tr'));
    tr.setAttribute('data-key', m.symbol);
    if (m.symbol === sel) tr.className = 'is-sel';
    const cell = (text, cls, num) => {
      const td = tr.appendChild(document.createElement('td'));
      if (num) td.className = 'num';
      if (cls) { const s = td.appendChild(document.createElement('span')); s.className = cls; s.textContent = text; } else td.textContent = text;
    };
    cell(m.symbol);
    cell(m.name);
    cell(SR.px(m.close), '', true);
    for (const f of ['r1d', 'r1w', 'r1m', 'r3m', 'vs_spy_1m', 'pace_shift']) cell(SR.pct(m[f]), SR.signCls(m[f]), true);
    cell(m.rsi == null ? '—' : d3.format('.0f')(m.rsi), '', true);
    cell(m.phase || '—', SR.phaseCls(m.phase));
    cell(m.phase_w || '—', SR.phaseCls(m.phase_w));
    cell(m.action || '—');
    cell(SR.px(m.exit), m.exit_hit ? 'sr-hit neg' : '', true);
    cell(SR.px(m.entry), m.entry_hit ? 'sr-hit pos' : '', true);
  }
});

// ---- Revolut table ---------------------------------------------------------
dash.draw('rev', (tbody) => {
  const d = dash.data('revolut');
  tbody.replaceChildren();
  if (d.status !== 'ok') return;
  for (const r of d.data) {
    const tr = tbody.appendChild(document.createElement('tr'));
    tr.setAttribute('data-key', r.us);
    const cell = (text, num, cls) => { const td = tr.appendChild(document.createElement('td')); if (num) td.className = 'num'; if (cls) { const s = td.appendChild(document.createElement('span')); s.className = cls; s.textContent = text; } else td.textContent = text; };
    cell(r.us);
    cell(r.ucits_name || '—');
    cell(r.revolut_ticker || '—');
    cell(r.exchange || '—');
    cell(r.isin || '—');
    cell(r.ter == null ? '—' : d3.format('.2%')(r.ter), true);
    cell(r.match || '—');
    cell(r.revolut || '—', false, r.revolut === 'confirmed' ? 'pos' : r.revolut === 'unknown' ? 'neg' : '');
    cell(r.you_hold || '');
  }
});

// ---- Symbol picker ---------------------------------------------------------
dash.draw('sympick', (sel) => {
  const d = dash.data('metrics');
  sel.replaceChildren();
  if (d.status !== 'ok') return;
  for (const g of SR.groupOrder) {
    const ms = d.data.filter((m) => m.group === g).sort((a, b) => a.symbol.localeCompare(b.symbol));
    if (!ms.length) continue;
    const og = sel.appendChild(document.createElement('optgroup')); og.label = SR.groupName[g] || g;
    for (const m of ms) og.appendChild(new Option(`${m.symbol} · ${m.name}`, m.symbol));
  }
  sel.value = SR.sym() || '';
  sel.onchange = () => dash.setParams({ sym: sel.value });
});
