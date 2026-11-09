(() => {
  const SR = (window.SR = window.SR || {});
  const fmtPct = d3.format('+.1%');
  SR.pct = (v) => (v == null || !isFinite(v) ? '—' : fmtPct(v));
  SR.px = (v) => (v == null || !isFinite(v) ? '—' : d3.format(Math.abs(v) >= 1000 ? ',.0f' : ',.2f')(v));
  SR.phaseCls = (p) => ({ Leading: 'is-lead', Weakening: 'is-weak', Lagging: 'is-lag', Improving: 'is-imp' })[p] || '';
  SR.phaseColor = (p) => ({ Leading: 'var(--color-ok)', Weakening: 'var(--color-warn)', Lagging: 'var(--color-bad)', Improving: dash.colors[0] })[p] || 'var(--cds-chart-muted)';
  SR.signCls = (v) => (v == null ? '' : v > 0 ? 'pos' : v < 0 ? 'neg' : '');
  SR.t = (d) => Date.parse(d + 'T00:00:00Z');
  SR.groupOrder = ['Sector', 'Industry', 'Commodity', 'Cross-asset', 'Stock', 'Market'];
  SR.groupName = { Sector: 'Sectors', Industry: 'Industries', Commodity: 'Miners', 'Cross-asset': 'Cross-asset', Stock: 'Stocks', Market: 'Indices' };

  // Statuses of the sources a drawing needs: true when every one is ready.
  SR.ready = (ids) => ids.every((id) => dash.data(id).status === 'ok');
  // A chart box while its data isn't there: skeleton while loading, one line when it failed or needs access.
  SR.wait = (el, ids) => {
    const st = ids.map((id) => dash.data(id).status);
    el.replaceChildren();
    if (st.some((s) => s === 'error' || s === 'missing' || s === 'connect' || s === 'declined')) {
      el.classList.remove('dash-skeleton');
      const d = el.appendChild(document.createElement('div'));
      d.className = 'sr-failed';
      d.textContent = st.some((s) => s === 'connect' || s === 'declined') ? 'Needs your eToro connection' : 'Failed to load';
    } else el.classList.add('dash-skeleton');
  };
  // The ETF the chart shows: the one picked, else the best-performing fading sector, else the best sector.
  SR.sym = () => {
    const M = dash.data('metrics');
    const picked = dash.params().sym;
    if (M.status !== 'ok') return picked || null;
    if (picked && M.data.some((m) => m.symbol === picked)) return picked;
    const sec = M.data.filter((m) => m.group === 'Sector' && m.r1m != null).sort((a, b) => b.r1m - a.r1m);
    const fading = sec.find((m) => m.fading);
    return (fading || sec[0] || M.data[0] || {}).symbol || null;
  };
  SR.range = () => (['1M', '3M', '6M', '1Y'].includes(dash.params().range) ? dash.params().range : '3M');
  SR.view = () => (['Sector', 'Industry', 'Commodity', 'Cross-asset', 'Stock'].includes(dash.params().view) ? dash.params().view : 'Sector');
  SR.tf = () => (['W', 'R'].includes(dash.params().tf) ? dash.params().tf : 'D');
  SR.tgrp = () => dash.params().tgrp || 'all';
  SR.open = (sym) => {
    dash.setParams({ sym });
    const el = document.getElementById('chart');
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); dash.setLink('chart'); }
  };
  // Tooltip inside a chart box.
  SR.tip = (box) => {
    const tip = box.appendChild(document.createElement('div'));
    tip.className = 'sr-tip';
    return {
      show(x, y, title, lines) {
        tip.replaceChildren();
        const t = tip.appendChild(document.createElement('div')); t.className = 't'; t.textContent = title;
        for (const [label, value, color] of lines) {
          const r = tip.appendChild(document.createElement('div')); r.className = 'r';
          const a = r.appendChild(document.createElement('span'));
          if (color) { const i = a.appendChild(document.createElement('i')); i.style.background = color; }
          a.appendChild(document.createTextNode(label));
          const b = r.appendChild(document.createElement('span')); b.textContent = value;
        }
        tip.style.display = 'block';
        const bw = box.clientWidth, tw = tip.offsetWidth, th = tip.offsetHeight;
        let left = x + 14; if (left + tw > bw) left = Math.max(0, x - tw - 14);
        let top = y - th - 10; if (top < 0) top = y + 14;
        tip.style.left = left + 'px'; tip.style.top = top + 'px';
      },
      hide() { tip.style.display = 'none'; },
    };
  };
  // Keep labels at least `gap` apart vertically, inside [lo, hi].
  SR.spread = (items, gap, lo, hi) => {
    const s = items.slice().sort((a, b) => a.y - b.y);
    for (let i = 1; i < s.length; i++) if (s[i].y - s[i - 1].y < gap) s[i].y = s[i - 1].y + gap;
    if (s.length && s[s.length - 1].y > hi) { s[s.length - 1].y = hi; for (let i = s.length - 2; i >= 0; i--) if (s[i + 1].y - s[i].y < gap) s[i].y = s[i + 1].y - gap; }
    if (s.length && s[0].y < lo) { const shift = lo - s[0].y; s.forEach((d) => (d.y += shift)); }
    return s;
  };
  SR.resolve = (el, value, prop = 'color') => {
    const probe = el.appendChild(document.createElement('span'));
    probe.style[prop] = value; probe.style.display = 'none';
    const c = getComputedStyle(probe)[prop]; probe.remove();
    return c && c !== 'rgba(0, 0, 0, 0)' ? c : prop === 'color' ? '#888' : '#fff';
  };
  SR.svg = (el, w, h) => d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${w} ${h}`).attr('preserveAspectRatio', 'xMinYMin meet').attr('role', 'img');
  SR.textWidth = (svg, str) => { const t = svg.append('text').text(str); const w = t.node().getComputedTextLength(); t.remove(); return w; };

  // Controls: write params on click; show the state in onData.
  const bind = (sel, attr, key) => {
    document.querySelectorAll(sel).forEach((group) => group.addEventListener('click', (e) => {
      const b = e.target.closest('button[' + attr + ']');
      if (b) dash.setParams({ [key]: b.getAttribute(attr) });
    }));
  };
  bind('.sr-range', 'data-range', 'range');
  bind('.sr-view', 'data-view', 'view');
  bind('.sr-tgrp', 'data-tgrp', 'tgrp');
  bind('.sr-tf', 'data-tf', 'tf');
  document.querySelectorAll('.sr-rank thead').forEach((head) => head.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-sort]');
    if (!b) return;
    const key = b.getAttribute('data-sort'), p = dash.params();
    const dir = p.sort === key && p.dir === 'desc' ? 'asc' : p.sort === key ? 'desc' : ['symbol', 'name', 'phase', 'action'].includes(key) ? 'asc' : 'desc';
    dash.setParams({ sort: key, dir });
  }));
  document.querySelectorAll('.sr-rank tbody').forEach((body) => body.addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-key]');
    if (tr) SR.open(tr.getAttribute('data-key'));
  }));
  document.querySelectorAll('.sr-heat').forEach((box) => box.addEventListener('click', (e) => {
    const s = e.target.closest('[data-sym]');
    if (s) SR.open(s.getAttribute('data-sym'));
  }));

  dash.onData(() => {
    document.querySelectorAll('.sr').forEach((root) => root.style.setProperty('--sr-imp', dash.colors[0]));
    const p = dash.params();
    document.querySelectorAll('.sr-range button').forEach((b) => b.setAttribute('aria-pressed', String(b.getAttribute('data-range') === SR.range())));
    document.querySelectorAll('.sr-view button').forEach((b) => b.setAttribute('aria-pressed', String(b.getAttribute('data-view') === SR.view())));
    document.querySelectorAll('.sr-tgrp button').forEach((b) => b.setAttribute('aria-pressed', String(b.getAttribute('data-tgrp') === SR.tgrp())));
    document.querySelectorAll('.sr-tf button').forEach((b) => b.setAttribute('aria-pressed', String(b.getAttribute('data-tf') === SR.tf())));
    const G = dash.data('regime'), tone = G.status === 'ok' && G.data[0] ? G.data[0].tone : null;
    document.querySelectorAll('.sr-regime').forEach((el) => ['ok', 'warn', 'bad'].forEach((t) => el.classList.toggle('tone-' + t, t === tone)));
    const keyColors = { smhplan: dash.colors[3], rule: dash.colors[0], qqqdef: dash.colors[1], equal: dash.colors[2], spy: 'var(--color-fg-muted)' };
    document.querySelectorAll('.sr-key[data-key]').forEach((i) => { i.style.background = keyColors[i.getAttribute('data-key')] || ''; });
    const sort = p.sort || 'r1m', dir = p.dir || 'desc';
    document.querySelectorAll('.sr-rank th').forEach((th) => {
      const b = th.querySelector('button[data-sort]');
      if (b && b.getAttribute('data-sort') === sort) th.setAttribute('aria-sort', dir === 'asc' ? 'ascending' : 'descending');
      else th.removeAttribute('aria-sort');
    });
  });
})();
