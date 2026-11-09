// ---- TradingView-style price chart ------------------------------------------
dash.draw('tv', (el) => {
  const ids = ['panel', 'levels', 'metrics', 'settings'];
  if (!SR.ready(ids)) { SR.wait(el, ids); return; }
  el.classList.remove('dash-skeleton');
  el.replaceChildren();
  const S = dash.data('settings').data[0];
  const sym = SR.sym(), range = SR.range();
  const m = dash.data('metrics').data.find((x) => x.symbol === sym);
  const all = dash.data('panel').data.filter((r) => r.symbol === sym);
  if (!m || all.length < 2) { const f = el.appendChild(document.createElement('div')); f.className = 'sr-failed'; f.textContent = 'No candles for this ETF'; return; }
  const rev = dash.data('revolut').status === 'ok' ? dash.data('revolut').data.find((r) => r.us === sym) : null;
  const days = { '1M': S.monthDays, '3M': S.quarterDays, '6M': S.halfDays, '1Y': 365 }[range];
  const lastT = SR.t(all[all.length - 1].date);
  const rows = all.filter((r) => SR.t(r.date) >= lastT - days * 864e5);
  const monthStart = lastT - S.monthDays * 864e5;
  const lv = dash.data('levels').data.filter((l) => l.symbol === sym);

  // header
  const head = el.appendChild(document.createElement('div')); head.className = 'sr-tv-head';
  const add = (tag, text, cls) => { const n = head.appendChild(document.createElement(tag)); n.textContent = text; if (cls) n.className = cls; return n; };
  add('strong', sym); add('span', m.name); add('span', SR.px(m.close), 'px');
  add('span', SR.pct(m.r1m) + ' last month', SR.signCls(m.r1m));
  if (m.phase) add('span', m.phase, SR.phaseCls(m.phase));
  if (m.action && m.action !== '—') add('span', m.action);
  if (rev && rev.revolut_ticker) add('span', 'Revolut: ' + rev.revolut_ticker);

  const box = el.appendChild(document.createElement('div')); box.className = 'sr-chart';
  const W = Math.max(300, el.clientWidth), H = W < 560 ? 380 : W < 900 ? 440 : 500;
  const svg = SR.svg(box, W, H).attr('aria-label', `${sym} daily candles`);
  const up = 'var(--sr-up)', down = 'var(--sr-down)';
  const maColors = [dash.colors[0], dash.colors[1], dash.colors[2]];

  // visible levels
  const L = [];
  const pushL = (kind, rank, label, color, dash_) => { const x = lv.find((l) => l.kind === kind && l.rank === rank); if (x) L.push({ price: x.price, label, color, dash: dash_, kind }); };
  pushL('support', 1, 'S1', up, '5 4'); pushL('support', 2, 'S2', up, '5 4');
  pushL('resistance', 1, 'R1', down, '5 4'); pushL('resistance', 2, 'R2', down, '5 4');
  pushL('exit', 0, 'Exit', 'var(--color-warn)', null); pushL('entry', 0, 'Entry', dash.colors[0], null);
  // merge levels that sit on top of each other
  const merged = [];
  for (const l of L.sort((a, b) => a.price - b.price)) {
    const prev = merged.find((x) => Math.abs(x.price - l.price) / l.price < 0.0025);
    if (prev) { prev.label += ' · ' + l.label; if (!l.dash) { prev.dash = null; prev.color = l.color; } } else merged.push({ ...l });
  }
  let lo = d3.min(rows, (r) => r.low), hi = d3.max(rows, (r) => r.high);
  const span = hi - lo;
  const shown = merged.filter((l) => l.price >= lo - span * 0.12 && l.price <= hi + span * 0.12);
  lo = Math.min(lo, ...shown.map((l) => l.price)); hi = Math.max(hi, ...shown.map((l) => l.price));
  const pad = (hi - lo) * 0.04; lo -= pad; hi += pad;

  // layout: the right margin fits the widest price tag
  const fmtAxis = d3.format(hi >= 1000 ? ',.0f' : hi >= 100 ? ',.1f' : ',.2f');
  const tagTexts = shown.map((l) => `${l.label} ${SR.px(l.price)}`).concat([SR.px(hi), fmtAxis(hi)]);
  const tagW = d3.max(tagTexts, (t) => SR.textWidth(svg, t)) + 14;
  const compact = W < 560;
  const mt = 30, mr = Math.ceil(tagW) + 4, ml = 4, mb = 22, gap = 10;
  const iw = W - ml - mr, ih = H - mt - mb;
  const ph = Math.round((ih - gap) * 0.76), rh = ih - gap - ph;
  const x = d3.scaleBand().domain(rows.map((r) => r.date)).range([ml, ml + iw]).paddingInner(0.3).paddingOuter(0.2);
  const y = d3.scaleLinear().domain([lo, hi]).range([mt + ph, mt]);
  const yr = d3.scaleLinear().domain([0, 100]).range([mt + ph + gap + rh, mt + ph + gap]);
  const vmax = d3.max(rows, (r) => r.volume) || 1;
  const yv = d3.scaleLinear().domain([0, vmax]).range([mt + ph, mt + ph - ph * 0.18]);
  const cx = (d) => x(d) + x.bandwidth() / 2;

  // grid + axes
  const yt = y.ticks(Math.max(3, Math.floor(ph / 55)));
  svg.append('g').selectAll('line').data(yt).join('line').attr('class', 'sr-grid-line').attr('x1', ml).attr('x2', ml + iw).attr('y1', y).attr('y2', y);
  const ytl = svg.append('g').selectAll('text').data(yt).join('text').attr('x', ml + iw + 6).attr('y', (d) => y(d) + 4).text(fmtAxis);
  const nT = Math.max(2, Math.floor(iw / 90)), step = Math.max(1, Math.ceil(rows.length / nT));
  const xt = rows.filter((r, i) => (rows.length - 1 - i) % step === 0).map((r) => r.date);
  const fx = d3.utcFormat(range === '1Y' ? '%b %Y' : '%b %-d');
  svg.append('g').selectAll('line').data(xt).join('line').attr('class', 'sr-grid-line').attr('x1', cx).attr('x2', cx).attr('y1', mt).attr('y2', mt + ph + gap + rh);
  const xl = svg.append('g').selectAll('text').data(xt).join('text').attr('y', H - 6).attr('text-anchor', 'middle').attr('x', cx).text((d) => fx(new Date(d + 'T00:00:00Z')));
  let lastRight = Infinity; // drop labels that would collide (from the right)
  xl.nodes().reverse().forEach((n) => { const b = n.getBBox(); if (b.x + b.width > lastRight - 6 || b.x < 0 || b.x + b.width > ml + iw + mr) n.remove(); else lastRight = b.x; });
  svg.append('line').attr('class', 'sr-axis-line').attr('x1', ml + iw).attr('x2', ml + iw).attr('y1', mt).attr('y2', mt + ph + gap + rh);

  // last-month band
  const firstIn = rows.find((r) => SR.t(r.date) > monthStart);
  if (firstIn && range !== '1M') {
    const bx = x(firstIn.date) - (x.step() * x.paddingInner()) / 2;
    svg.append('rect').attr('x', bx).attr('y', mt).attr('width', ml + iw - bx).attr('height', ph).style('fill', 'var(--color-fg)').attr('opacity', 0.045);
  }

  // volume
  svg.append('g').selectAll('rect').data(rows).join('rect')
    .attr('x', (d) => x(d.date)).attr('width', x.bandwidth()).attr('y', (d) => yv(d.volume)).attr('height', (d) => mt + ph - yv(d.volume))
    .style('fill', (d) => (d.close >= d.open ? up : down)).attr('opacity', 0.22);

  // moving averages
  const maKeys = [['maFast', S.maFast], ['maMid', S.maMid], ['maSlow', S.maSlow]];
  maKeys.forEach(([k], i) => {
    const line = d3.line().defined((d) => d[k] != null && d[k] >= lo && d[k] <= hi).x((d) => cx(d.date)).y((d) => y(d[k]));
    svg.append('path').datum(rows).attr('d', line).attr('fill', 'none').style('stroke', maColors[i]).attr('stroke-width', 1.4).attr('stroke-linejoin', 'round').attr('stroke-linecap', 'round').attr('opacity', 0.9);
  });

  // candles
  const g = svg.append('g');
  g.selectAll('line').data(rows).join('line').attr('x1', (d) => cx(d.date)).attr('x2', (d) => cx(d.date)).attr('y1', (d) => y(d.high)).attr('y2', (d) => y(d.low))
    .style('stroke', (d) => (d.close >= d.open ? up : down)).attr('stroke-width', 1);
  g.selectAll('rect').data(rows).join('rect').attr('x', (d) => x(d.date)).attr('width', Math.max(1, x.bandwidth()))
    .attr('y', (d) => y(Math.max(d.open, d.close))).attr('height', (d) => Math.max(1, Math.abs(y(d.open) - y(d.close))))
    .style('fill', (d) => (d.close >= d.open ? up : down));

  // levels + right-axis tags
  const tags = [];
  for (const l of shown) {
    svg.append('line').attr('x1', ml).attr('x2', ml + iw).attr('y1', y(l.price)).attr('y2', y(l.price))
      .style('stroke', l.color).attr('stroke-width', l.dash ? 1 : 1.4).attr('stroke-dasharray', l.dash).attr('opacity', 0.9);
    tags.push({ y: y(l.price), text: `${l.label} ${SR.px(l.price)}`, color: l.color });
  }
  const lastBar = rows[rows.length - 1], prevClose = all.length > 1 ? all[all.length - 2].close : lastBar.open;
  const lastColor = lastBar.close >= prevClose ? up : down;
  svg.append('line').attr('x1', ml).attr('x2', ml + iw).attr('y1', y(lastBar.close)).attr('y2', y(lastBar.close)).style('stroke', lastColor).attr('stroke-dasharray', '1 3').attr('stroke-width', 1);
  tags.push({ y: y(lastBar.close), text: SR.px(lastBar.close), color: lastColor, solid: true });
  const placed = SR.spread(tags, 15, mt + 7, mt + ph - 7);
  ytl.filter((d) => placed.some((t) => Math.abs(t.y - y(d)) < 13) || y(d) < mt + 4).remove();
  for (const t of placed) {
    const tg = svg.append('g').attr('transform', `translate(${ml + iw + 1},${t.y})`);
    tg.append('rect').attr('x', 0).attr('y', -7.5).attr('width', mr - 2).attr('height', 15).attr('rx', 2).style('fill', t.solid ? t.color : 'var(--color-panel)').style('stroke', t.color);
    tg.append('text').attr('x', 5).attr('y', 4).text(t.text).style('fill', t.solid ? '#fff' : t.color);
  }

  // RSI pane
  const ry0 = yr(S.rsiHigh), ry1 = yr(S.rsiLow);
  svg.append('rect').attr('x', ml).attr('width', iw).attr('y', ry0).attr('height', ry1 - ry0).style('fill', dash.colors[3]).attr('opacity', 0.07);
  [S.rsiLow, 50, S.rsiHigh].forEach((v) => {
    svg.append('line').attr('class', 'sr-grid-line').attr('x1', ml).attr('x2', ml + iw).attr('y1', yr(v)).attr('y2', yr(v)).attr('stroke-dasharray', v === 50 ? null : '3 3');
    svg.append('text').attr('x', ml + iw + 6).attr('y', yr(v) + 4).text(v);
  });
  svg.append('path').datum(rows).attr('d', d3.line().defined((d) => d.rsi != null).x((d) => cx(d.date)).y((d) => yr(d.rsi)))
    .attr('fill', 'none').style('stroke', dash.colors[3]).attr('stroke-width', 1.4);
  svg.append('text').attr('x', ml + 4).attr('y', yr(100) + 10).text(`RSI ${S.rsiLen}`);

  // legend (top-left) — updates under the crosshair
  const leg = svg.append('text').attr('x', ml + 2).attr('y', 14);
  const legMa = svg.append('text').attr('x', ml + 2).attr('y', 27);
  const fmtLeg = (d) => {
    leg.selectAll('tspan').remove();
    const chg = d.close / (all[all.indexOf(d) - 1] || d).close - 1;
    const c = d.close >= d.open ? up : down;
    const ohlc = compact ? [['O', d.open], ['C', d.close]] : [['O', d.open], ['H', d.high], ['L', d.low], ['C', d.close]];
    ohlc.forEach(([k, v]) => { leg.append('tspan').text(k + ' '); leg.append('tspan').text(SR.px(v) + '  ').style('fill', c); });
    leg.append('tspan').text(SR.pct(chg)).style('fill', c);
    leg.append('tspan').text('  ' + d3.utcFormat(compact ? '%b %-d' : '%a %b %-d')(new Date(d.date + 'T00:00:00Z')));
    legMa.selectAll('tspan').remove();
    maKeys.forEach(([k, n], i) => { if (d[k] != null) { legMa.append('tspan').text(`MA${n} `); legMa.append('tspan').text(SR.px(d[k]) + '  ').style('fill', maColors[i]); } });
    if (d.rsi != null && !compact) legMa.append('tspan').text(`RSI ${d3.format('.0f')(d.rsi)}`);
  };
  fmtLeg(lastBar);

  // crosshair
  const ch = svg.append('g').style('display', 'none').attr('pointer-events', 'none');
  const vx = ch.append('line').style('stroke', 'var(--color-fg-muted)').attr('stroke-dasharray', '3 3').attr('y1', mt).attr('y2', mt + ph + gap + rh);
  const hy = ch.append('line').style('stroke', 'var(--color-fg-muted)').attr('stroke-dasharray', '3 3').attr('x1', ml).attr('x2', ml + iw);
  const py = ch.append('g'); py.append('rect').attr('x', 0).attr('y', -7.5).attr('width', mr - 2).attr('height', 15).attr('rx', 2).style('fill', 'var(--color-fg)');
  const pyt = py.append('text').attr('x', 5).attr('y', 4).style('fill', 'var(--color-panel)');
  svg.append('rect').attr('x', ml).attr('y', mt).attr('width', iw).attr('height', ph + gap + rh).attr('fill', 'transparent')
    .on('pointermove', (ev) => {
      const [mx, my] = d3.pointer(ev, svg.node());
      const i = Math.max(0, Math.min(rows.length - 1, Math.round((mx - ml - x.step() * x.paddingOuter() - x.bandwidth() / 2) / x.step())));
      const d = rows[i];
      ch.style('display', null); vx.attr('x1', cx(d.date)).attr('x2', cx(d.date));
      hy.attr('y1', my).attr('y2', my);
      const inPrice = my <= mt + ph;
      const val = inPrice ? y.invert(my) : yr.invert(my);
      py.attr('transform', `translate(${ml + iw + 1},${my})`); pyt.text(inPrice ? SR.px(val) : d3.format('.0f')(val));
      fmtLeg(d);
    })
    .on('pointerleave', () => { ch.style('display', 'none'); fmtLeg(lastBar); });
});
