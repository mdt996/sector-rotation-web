// Rotation at a glance: the board (who leads, who's coming, who's fading, where your money is),
// the heatmap (ranks over 26 weeks) and the market phase gauge (cyclicals vs defensives).
// Ranks use the rotation rule's own score: 12-month return leaving out the last month, on the S&P 500's trading days.
(function () {
  'use strict';
  const SECTORS = ['XLK', 'XLF', 'XLE', 'XLV', 'XLI', 'XLY', 'XLP', 'XLU', 'XLB', 'XLRE', 'XLC'];
  const NAME = { XLK: 'Technology', XLF: 'Financials', XLE: 'Energy', XLV: 'Health care', XLI: 'Industrials', XLY: 'Consumer discretionary', XLP: 'Consumer staples', XLU: 'Utilities', XLB: 'Materials', XLRE: 'Real estate', XLC: 'Communication' };
  const CYCLICAL = ['XLK', 'XLY', 'XLF', 'XLI', 'XLC', 'XLB'], DEFENSIVE = ['XLP', 'XLV', 'XLU'];
  // which sector a fund or stock you hold belongs to
  const SECTOR_OF = { SMH: 'XLK', IGV: 'XLK', QQQ: 'XLK', MRVL: 'XLK', AAOI: 'XLK', XBI: 'XLV', KRE: 'XLF', ITA: 'XLI', SPCX: 'XLI', GDX: 'XLB', SIL: 'XLB', COPX: 'XLB', AG: 'XLB', URA: 'XLE', CCJ: 'XLE', NXE: 'XLE' };
  const TOP = 4, LONG = 252, SKIP = 21;
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const pct = (x, d) => (x == null || !isFinite(x) ? '—' : (x > 0 ? '+' : x < 0 ? '−' : '') + (Math.abs(x) * 100).toFixed(d == null ? 1 : d) + '%');
  const eur = (x) => '€' + Math.round(x).toLocaleString('en');

  // weekly ranks of the 11 sectors (memoised on the data's last date)
  let memo = null;
  function history() {
    const st = SRApp._store, spy = st.SPY;
    if (!spy || spy.status !== 'ok') return null;
    const D = spy.data.map((r) => r.date), key = D[D.length - 1] + SECTORS.map((s) => (st[s] && st[s].status === 'ok' ? st[s].data.length : 0)).join();
    if (memo && memo.key === key) return memo;
    const closes = {};
    for (const s of SECTORS) {
      const d = st[s]; if (!d || d.status !== 'ok') continue;
      const m = new Map(d.data.map((r) => [r.date, r.close])); let last = null;
      closes[s] = D.map((dt) => (m.has(dt) ? (last = m.get(dt)) : last));
    }
    // the last trading day of each week
    const ends = [];
    for (let i = 0; i < D.length; i++) { const a = new Date(D[i] + 'T00:00:00Z'), n = D[i + 1] ? new Date(D[i + 1] + 'T00:00:00Z') : null; if (!n || n.getUTCDay() < a.getUTCDay() || (n - a) > 3 * 864e5) ends.push(i); }
    const weeks = [];
    for (const i of ends) {
      if (i < LONG) continue;
      const score = {};
      for (const s of Object.keys(closes)) { const a = closes[s][i - SKIP], b = closes[s][i - LONG]; if (a && b) score[s] = a / b - 1; }
      const order = Object.keys(score).sort((x, y) => score[y] - score[x]);
      const rank = {}; order.forEach((s, k) => { rank[s] = k + 1; });
      // market phase: 13-week return, cyclicals minus defensives
      const r13 = (s) => (closes[s] && closes[s][i] && closes[s][i - 63] ? closes[s][i] / closes[s][i - 63] - 1 : null);
      const avg = (xs) => { const v = xs.map(r13).filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
      const c = avg(CYCLICAL), d = avg(DEFENSIVE);
      weeks.push({ date: D[i], score, rank, n: order.length, spread: c != null && d != null ? c - d : null });
    }
    memo = { key, weeks };
    return memo;
  }
  // your euros per sector, through what each holding follows
  function exposure() {
    const H = (SRApp._store.holdings && SRApp._store.holdings.data) || [], out = {};
    const live = (h) => (SR.liveFolio && SR.liveFolio(h) && SR.liveFolio(h).value) || h.amount || 0;
    for (const h of H) {
      const s = SECTORS.includes(h.tracks) ? h.tracks : SECTOR_OF[h.tracks] || SECTOR_OF[h.ticker];
      if (s) out[s] = (out[s] || 0) + live(h);
    }
    return out;
  }
  const phaseOf = (x) => (x == null ? null : x > 0.02 ? 'Risk-on' : x < -0.02 ? 'Risk-off' : 'Neutral');

  // ---- market phase gauge ----
  dash.draw('rotphase', (box) => {
    const h = history(); box.replaceChildren();
    if (!h || !h.weeks.length) { box.textContent = 'Waiting for data…'; return; }
    const w = h.weeks, x = w[w.length - 1].spread, label = phaseOf(x);
    let n = 0; for (let i = w.length - 1; i >= 0 && phaseOf(w[i].spread) === label; i--) n++;
    const g = box.appendChild(el('div', 'rot-phase'));
    const top = g.appendChild(el('div', 'rot-phase-top'));
    top.appendChild(el('b', 'rot-phase-label rot-' + (label || '').toLowerCase().replace('-', ''), label || '—'));
    top.appendChild(el('span', 'rot-phase-sub', `${n} week${n === 1 ? '' : 's'} · cyclicals ${pct(x)} vs defensives over 3 months`));
    const bar = g.appendChild(el('div', 'rot-meter'));
    const pos = Math.max(0, Math.min(1, ((x || 0) + 0.1) / 0.2));
    const dot = bar.appendChild(el('span', 'rot-meter-dot')); dot.style.left = (pos * 100) + '%';
    const lab = g.appendChild(el('div', 'rot-meter-lab'));
    lab.appendChild(el('span', '', 'Defensives lead')); lab.appendChild(el('span', '', 'Cyclicals lead'));
  });

  // ---- the rotation board ----
  dash.draw('rotboard', (box) => {
    const h = history(); box.replaceChildren();
    if (!h || h.weeks.length < 5) { box.textContent = 'Waiting for data…'; return; }
    const w = h.weeks, now = w[w.length - 1], back4 = w[w.length - 5], ex = exposure();
    const order = Object.keys(now.rank).sort((a, b) => now.rank[a] - now.rank[b]);
    for (const s of order) {
      const r = now.rank[s], r4 = back4.rank[s] || r, move = r4 - r;
      let badge = null;
      if (r <= TOP && r4 > TOP) badge = ['NEW', 'new'];
      else if (r <= TOP && move <= -2) badge = ['LEAVING', 'out'];
      else if (r <= TOP) badge = ['IN', 'in'];
      else if (r4 <= TOP) badge = ['OUT', 'out'];
      else if (r <= TOP + 2 && move >= 2) badge = ['ENTERING', 'new'];
      const row = box.appendChild(el('button', 'rot-row' + (r <= TOP ? ' is-top' : ''))); row.type = 'button';
      row.addEventListener('click', () => SR.open(s));
      row.appendChild(el('span', 'rot-rank', String(r)));
      const mid = row.appendChild(el('span', 'rot-mid'));
      const t = mid.appendChild(el('span', 'rot-title'));
      t.appendChild(el('b', '', NAME[s] || s)); t.appendChild(el('span', 'rot-sym', s));
      if (badge) t.appendChild(el('span', 'rot-badge rot-b-' + badge[1], badge[0]));
      const sub = mid.appendChild(el('span', 'rot-sub', `12-month ${pct(now.score[s])}` + (ex[s] ? ` · you: ${eur(ex[s])}` : '')));
      if (ex[s]) sub.classList.add('has-money');
      // rank over the last 12 weeks (1 at the top)
      const last = w.slice(-12).map((x) => x.rank[s] || null);
      const sv = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); sv.setAttribute('viewBox', '0 0 72 26'); sv.setAttribute('class', 'rot-spark');
      const N = now.n || 11, X = (i) => (i / (last.length - 1)) * 70 + 1, Y = (k) => 2 + ((k - 1) / (N - 1)) * 22;
      const band = document.createElementNS(sv.namespaceURI, 'rect'); band.setAttribute('x', 0); band.setAttribute('y', 0); band.setAttribute('width', 72); band.setAttribute('height', Y(TOP + 0.5)); band.setAttribute('class', 'rot-spark-top'); sv.appendChild(band);
      const path = document.createElementNS(sv.namespaceURI, 'path');
      path.setAttribute('d', last.map((k, i) => (k == null ? '' : (i ? 'L' : 'M') + X(i).toFixed(1) + ',' + Y(k).toFixed(1))).join(''));
      path.setAttribute('class', 'rot-spark-line ' + (move > 0 ? 'up' : move < 0 ? 'down' : '')); sv.appendChild(path);
      row.appendChild(sv);
      row.appendChild(el('span', 'rot-move ' + (move > 0 ? 'up' : move < 0 ? 'down' : ''), move > 0 ? `↑${move}` : move < 0 ? `↓${-move}` : '·'));
    }
    box.appendChild(el('p', 'rot-foot', 'Rank by the rule\'s score; arrows compare with 4 weeks ago; the shaded band in each line is the top 4 (the rule\'s picks). Tap a sector for its chart.'));
  });

  // ---- the rotation heatmap ----
  dash.draw('rotheat', (box) => {
    const h = history(); box.replaceChildren();
    if (!h || h.weeks.length < 3) { box.textContent = 'Waiting for data…'; return; }
    const w = h.weeks.slice(-26), now = w[w.length - 1];
    const order = Object.keys(now.rank).sort((a, b) => now.rank[a] - now.rank[b]), N = now.n || 11;
    const grid = box.appendChild(el('div', 'rot-heat')); grid.style.gridTemplateColumns = `56px repeat(${w.length}, 1fr)`;
    const color = (k) => { const t = (k - 1) / (N - 1); const hue = 140 - t * 140; return `hsl(${hue}, 55%, ${k <= TOP ? 42 : 55}%)`; };
    for (const s of order) {
      const lab = grid.appendChild(el('button', 'rot-heat-lab', s)); lab.type = 'button'; lab.title = NAME[s]; lab.addEventListener('click', () => SR.open(s));
      for (const wk of w) {
        const k = wk.rank[s], c = grid.appendChild(el('span', 'rot-cell' + (k && k <= TOP ? ' is-top' : '')));
        if (k) { c.style.background = color(k); c.title = `${NAME[s]}: rank ${k} on ${wk.date}`; c.textContent = String(k); }
      }
    }
    grid.appendChild(el('span', ''));
    w.forEach((wk, i) => { const d = grid.appendChild(el('span', 'rot-heat-date', i % 4 === 0 || i === w.length - 1 ? new Date(wk.date + 'T00:00:00Z').toLocaleDateString([], { day: 'numeric', month: 'short' }) : '')); d.title = wk.date; });
    box.appendChild(el('p', 'rot-foot', 'Each row is a sector, each column a week (oldest left); green = top of the ranking, red = bottom; bold cells are the rule\'s top 4. Money rotating shows as colour moving between rows.'));
  });
})();
