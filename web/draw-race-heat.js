// ---- Last month, day by day -----------------------------------------------
dash.draw('race', (el) => {
  const ids = ['race', 'metrics'];
  if (!SR.ready(ids)) { SR.wait(el, ids); return; }
  el.classList.remove('dash-skeleton');
  el.replaceChildren();
  const view = SR.view(), M = dash.data('metrics').data;
  const syms = new Set(M.filter((m) => m.group === view).map((m) => m.symbol));
  const series = d3.groups(dash.data('race').data.filter((r) => syms.has(r.symbol)), (r) => r.symbol)
    .map(([s, p]) => ({ s, m: M.find((q) => q.symbol === s) || {}, p: p.map((r) => ({ ...r, d: new Date(r.date + 'T00:00:00Z') })) }));
  if (!series.length) { const f = el.appendChild(document.createElement('div')); f.className = 'sr-failed'; f.textContent = 'No ETFs in this group'; return; }
  const W = Math.max(300, el.clientWidth), H = 320;
  const svg = SR.svg(el, W, H).attr('aria-label', 'Change over the last month');
  const tip = SR.tip(el);
  const all = series.flatMap((q) => q.p);
  const yExt = d3.extent(all, (r) => r.change);
  const labW = d3.max(series, (q) => SR.textWidth(svg, `${q.s} ${SR.pct(q.p[q.p.length - 1].change)}`)) + 10;
  const ml = 40, mr = Math.ceil(labW), mt = 10, mb = 24, iw = W - ml - mr, ih = H - mt - mb;
  const x = d3.scaleUtc().domain(d3.extent(all, (r) => r.d)).range([ml, ml + iw]);
  const y = d3.scaleLinear().domain([Math.min(0, yExt[0]), Math.max(0, yExt[1])]).nice().range([mt + ih, mt]);
  const yt = y.ticks(Math.max(3, Math.floor(ih / 45)));
  svg.append('g').selectAll('line').data(yt).join('line').attr('class', 'sr-grid-line').attr('x1', ml).attr('x2', ml + iw).attr('y1', y).attr('y2', y);
  svg.append('g').selectAll('text').data(yt).join('text').attr('x', ml - 6).attr('y', (d) => y(d) + 4).attr('text-anchor', 'end').text(d3.format('+.0%'));
  svg.append('line').style('stroke', 'var(--cds-chart-reference)').attr('x1', ml).attr('x2', ml + iw).attr('y1', y(0)).attr('y2', y(0));
  const xt = x.ticks(Math.max(2, Math.floor(iw / 80)));
  svg.append('g').selectAll('text').data(xt).join('text').attr('x', x).attr('y', H - 6).attr('text-anchor', 'middle').text(d3.utcFormat('%b %-d'));
  const line = d3.line().x((r) => x(r.d)).y((r) => y(r.change));
  const paths = series.map((q) => svg.append('path').datum(q.p).attr('d', line).attr('fill', 'none').style('stroke', SR.phaseColor(q.m.phase)).attr('stroke-width', 2).attr('stroke-linecap', 'round').attr('stroke-linejoin', 'round'));
  const ends = SR.spread(series.map((q) => ({ q, y: y(q.p[q.p.length - 1].change) })), 13, mt + 4, mt + ih);
  const labels = ends.map((e) => svg.append('text').attr('x', ml + iw + 6).attr('y', e.y + 4).style('fill', SR.phaseColor(e.q.m.phase)).style('font-weight', 600).text(`${e.q.s} ${SR.pct(e.q.p[e.q.p.length - 1].change)}`));
  const rule = svg.append('line').style('stroke', 'var(--color-fg-muted)').attr('stroke-dasharray', '3 3').attr('y1', mt).attr('y2', mt + ih).style('display', 'none');
  const dates = series[0].p.map((r) => r.d);
  svg.append('rect').attr('x', ml).attr('y', mt).attr('width', iw).attr('height', ih).attr('fill', 'transparent')
    .on('pointermove', (ev) => {
      const [mx, my] = d3.pointer(ev, svg.node());
      const dt = x.invert(mx), i = d3.bisectCenter(dates, dt), d = dates[i];
      rule.style('display', null).attr('x1', x(d)).attr('x2', x(d));
      // nearest line to the pointer gets the emphasis
      let best = null, bd = Infinity;
      series.forEach((q, k) => { const r = q.p.find((z) => +z.d === +d); if (r) { const dd = Math.abs(y(r.change) - my); if (dd < bd) { bd = dd; best = k; } } });
      paths.forEach((p, k) => p.attr('opacity', k === best ? 1 : 0.25));
      labels.forEach((l) => l.attr('opacity', 0.35));
      if (best != null) labels[ends.findIndex((e) => e.q === series[best])].attr('opacity', 1);
      const lines = series.map((q) => [q.s, q.p.find((z) => +z.d === +d)]).filter((z) => z[1]).sort((a, b) => b[1].change - a[1].change)
        .map(([s, r]) => [s, SR.pct(r.change), SR.phaseColor((M.find((q) => q.symbol === s) || {}).phase)]);
      tip.show(x(d), my, d3.utcFormat('%a %b %-d')(d), lines);
    })
    .on('pointerleave', () => { rule.style('display', 'none'); paths.forEach((p) => p.attr('opacity', 1)); labels.forEach((l) => l.attr('opacity', 1)); tip.hide(); });
});

// ---- Week by week heatmap ----------------------------------------------------
dash.draw('heat', (el) => {
  const ids = ['heat', 'metrics'];
  if (!SR.ready(ids)) { SR.wait(el, ids); return; }
  el.classList.remove('dash-skeleton');
  el.replaceChildren();
  const view = SR.view(), M = dash.data('metrics').data;
  const ms = M.filter((m) => m.group === view).sort((a, b) => (b.r1m ?? -9) - (a.r1m ?? -9));
  const H = dash.data('heat').data.filter((h) => ms.some((m) => m.symbol === h.symbol));
  const weeks = Array.from(new Set(H.map((h) => h.week))).sort();
  if (!ms.length || !weeks.length) { const f = el.appendChild(document.createElement('div')); f.className = 'sr-failed'; f.textContent = 'No ETFs in this group'; return; }
  const bg = SR.resolve(el, 'var(--color-panel)', 'backgroundColor'), okC = SR.resolve(el, 'var(--color-ok)'), badC = SR.resolve(el, 'var(--color-bad)');
  const maxAbs = d3.max(H, (h) => Math.abs(h.ret)) || 0.01;
  const color = (v) => (v >= 0 ? d3.interpolateRgb(bg, okC) : d3.interpolateRgb(bg, badC))(Math.min(1, Math.abs(v) / maxAbs) * 0.75);
  const narrow = el.clientWidth < 460;
  const shownWeeks = narrow ? weeks.slice(-6) : weeks;
  const grid = el.appendChild(document.createElement('div')); grid.className = 'sr-heatgrid';
  grid.style.gridTemplateColumns = `minmax(3.2rem, auto) repeat(${shownWeeks.length}, minmax(0, 1fr))`;
  const tip = SR.tip(el);
  const hd = grid.appendChild(document.createElement('div')); hd.className = 'h';
  for (const w of shownWeeks) { const c = grid.appendChild(document.createElement('div')); c.className = 'h'; c.textContent = d3.utcFormat('%b %-d')(new Date(w + 'T00:00:00Z')); }
  for (const m of ms) {
    const s = grid.appendChild(document.createElement('div')); s.className = 's'; s.textContent = m.symbol; s.setAttribute('data-sym', m.symbol);
    s.style.color = SR.phaseColor(m.phase);
    for (const w of shownWeeks) {
      const h = H.find((z) => z.symbol === m.symbol && z.week === w);
      const c = grid.appendChild(document.createElement('div'));
      c.textContent = h ? d3.format('+.1%')(h.ret) : '';
      if (h) {
        c.style.background = color(h.ret);
        c.addEventListener('pointerenter', () => {
          const b = c.getBoundingClientRect(), o = el.getBoundingClientRect();
          tip.show(b.left - o.left + b.width / 2, b.top - o.top, `${m.symbol} · ${m.name}`, [['Week of ' + d3.utcFormat('%b %-d')(new Date(w + 'T00:00:00Z')), d3.format('+.1%')(h.ret)]]);
        });
        c.addEventListener('pointerleave', () => tip.hide());
      }
    }
  }
});
