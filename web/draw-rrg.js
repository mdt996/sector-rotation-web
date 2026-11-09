// ---- Rotation map (relative rotation graph) ----------------------------------
dash.draw('rrg', (el) => {
  const tf = SR.tf();
  if (tf === 'R') { SR.drawRiskReturn(el); return; }
  const src = tf === 'W' ? 'rrg_w' : 'rrg', pkey = tf === 'W' ? 'phase_w' : 'phase';
  const ids = [src, 'metrics'];
  if (!SR.ready(ids)) { SR.wait(el, ids); return; }
  el.classList.remove('dash-skeleton');
  el.replaceChildren();
  const view = SR.view();
  const M = dash.data('metrics').data;
  const syms = new Set(M.filter((m) => m.group === view).map((m) => m.symbol));
  const tails = d3.groups(dash.data(src).data.filter((r) => syms.has(r.symbol)), (r) => r.symbol).map(([s, pts]) => [s, pts.sort((a, b) => a.step - b.step)]);
  if (!tails.length) { const f = el.appendChild(document.createElement('div')); f.className = 'sr-failed'; f.textContent = 'No ETFs in this group'; return; }
  const W = Math.max(300, el.clientWidth), H = Math.round(Math.min(560, Math.max(340, W * 0.62)));
  const svg = SR.svg(el, W, H).attr('aria-label', tf === 'W' ? 'Rotation map, weekly' : 'Rotation map, daily');
  const tip = SR.tip(el);
  const ml = 44, mr = 16, mt = 12, mb = 34, iw = W - ml - mr, ih = H - mt - mb;
  const pts = tails.flatMap(([, p]) => p);
  const dx = (d3.max(pts, (p) => Math.abs(p.ratio - 100)) || 1) * 1.25, dy = (d3.max(pts, (p) => Math.abs(p.mom - 100)) || 1) * 1.25;
  const x = d3.scaleLinear().domain([100 - dx, 100 + dx]).range([ml, ml + iw]);
  const y = d3.scaleLinear().domain([100 - dy, 100 + dy]).range([mt + ih, mt]);
  const quad = [['Improving', x(100 - dx), y(100 + dy), 'start', 14], ['Leading', x(100 + dx), y(100 + dy), 'end', 14], ['Lagging', x(100 - dx), y(100 - dy), 'start', -6], ['Weakening', x(100 + dx), y(100 - dy), 'end', -6]];
  for (const [name, qx, qy] of quad) {
    const x0 = Math.min(qx, x(100)), y0 = Math.min(qy, y(100));
    svg.append('rect').attr('x', x0).attr('y', y0).attr('width', Math.abs(x(100) - qx)).attr('height', Math.abs(y(100) - qy)).style('fill', SR.phaseColor(name)).attr('opacity', 0.06);
  }
  for (const [name, qx, qy, anchor, dyy] of quad) svg.append('text').attr('x', qx + (anchor === 'start' ? 6 : -6)).attr('y', qy + dyy).attr('text-anchor', anchor).style('fill', SR.phaseColor(name)).style('font-weight', 600).text(name);
  svg.append('line').attr('class', 'sr-axis-line').attr('x1', x(100)).attr('x2', x(100)).attr('y1', mt).attr('y2', mt + ih);
  svg.append('line').attr('class', 'sr-axis-line').attr('x1', ml).attr('x2', ml + iw).attr('y1', y(100)).attr('y2', y(100));
  const xt = x.ticks(Math.max(3, Math.floor(iw / 80))), yt = y.ticks(Math.max(3, Math.floor(ih / 50)));
  svg.append('g').selectAll('text').data(xt).join('text').attr('x', x).attr('y', mt + ih + 14).attr('text-anchor', 'middle').text(d3.format('.0f'));
  svg.append('g').selectAll('text').data(yt).join('text').attr('x', ml - 6).attr('y', (d) => y(d) + 4).attr('text-anchor', 'end').text(d3.format('.0f'));
  svg.append('text').attr('x', ml + iw).attr('y', H - 4).attr('text-anchor', 'end').text('RS-Ratio: strength vs SPY →');
  svg.append('text').attr('transform', `translate(11,${mt + ih / 2}) rotate(-90)`).attr('text-anchor', 'middle').text('RS-Momentum →');
  const line = d3.line().x((p) => x(p.ratio)).y((p) => y(p.mom)).curve(d3.curveCatmullRom.alpha(0.5));
  const heads = [];
  for (const [s, p] of tails) {
    const m = M.find((q) => q.symbol === s) || {};
    const col = SR.phaseColor(m[pkey]);
    svg.append('path').datum(p).attr('d', line).attr('fill', 'none').style('stroke', col).attr('stroke-width', 1.5).attr('opacity', 0.55);
    svg.append('g').selectAll('circle').data(p.slice(0, -1)).join('circle').attr('cx', (q) => x(q.ratio)).attr('cy', (q) => y(q.mom)).attr('r', 2).style('fill', col).attr('opacity', (q, i) => 0.25 + (0.5 * i) / p.length);
    const h = p[p.length - 1];
    heads.push({ s, m, col, hx: x(h.ratio), hy: y(h.mom), y: y(h.mom), h });
  }
  const labels = SR.spread(heads.map((d) => ({ ...d })), 12, mt + 6, mt + ih - 4);
  for (const d of labels) {
    if (Math.abs(d.y - d.hy) > 5) svg.append('line').attr('x1', d.hx + 5).attr('y1', d.hy).attr('x2', d.hx + 8).attr('y2', d.y).style('stroke', 'var(--color-fg-muted)').attr('stroke-width', 0.8);
    svg.append('text').attr('class', 'sr-halo').attr('x', d.hx + 9).attr('y', d.y + 4).style('fill', 'var(--color-fg)').style('font-weight', 600).text(d.s);
  }
  const RU = dash.data('rule'), picks = new Set(RU.status === 'ok' ? RU.data.filter((r) => r.pick).map((r) => r.symbol) : []);
  svg.append('g').selectAll('circle').data(heads.filter((d) => picks.has(d.s))).join('circle').attr('cx', (d) => d.hx).attr('cy', (d) => d.hy).attr('r', 10)
    .attr('fill', 'none').style('stroke', dash.colors[0]).attr('stroke-width', 1.5);
  svg.append('g').selectAll('circle').data(heads).join('circle').attr('cx', (d) => d.hx).attr('cy', (d) => d.hy).attr('r', 5.5)
    .style('fill', (d) => d.col).style('stroke', 'var(--color-panel)').attr('stroke-width', 1.5).style('cursor', 'pointer')
    .on('pointerenter', (ev, d) => tip.show(d.hx, d.hy, `${d.s} · ${d.m.name || ''}`, [
      [tf === 'W' ? 'Weekly phase' : 'Daily phase', d.m[pkey] || '—', d.col],
      [tf === 'W' ? 'Daily phase' : 'Weekly phase', d.m[tf === 'W' ? 'phase' : 'phase_w'] || '—', SR.phaseColor(d.m[tf === 'W' ? 'phase' : 'phase_w'])],
      ['RS-Ratio', d3.format('.1f')(d.h.ratio)], ['RS-Momentum', d3.format('.1f')(d.h.mom)], ['Last month', SR.pct(d.m.r1m)],
      ...(picks.has(d.s) ? [['Rule', 'one of the picks']] : []),
    ]))
    .on('pointerleave', () => tip.hide())
    .on('click', (ev, d) => SR.open(d.s));
});
