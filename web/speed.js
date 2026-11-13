// How fast the app is on this device, measured here and shown in Settings ("Speed on this phone"): the start, the refreshes, the tabs,
// the asset pages, and eToro's answers (how long they take, how many in the last minute, the waits for its limit of 120 a minute).
// The last 30 values of each are kept on the device, so a slow start is still there to see after the app is reopened.
(function () {
  'use strict';
  const K = 'sr.speed', MAX = 30;
  let S = {}; try { S = JSON.parse(localStorage.getItem(K) || '{}') || {}; } catch (e) { S = {}; }
  let saveT = 0;
  const save = () => { if (saveT) return; saveT = setTimeout(() => { saveT = 0; try { localStorage.setItem(K, JSON.stringify(S)); } catch (e) { /* not kept */ } }, 2000); };
  function mark(name, ms, extra) { if (!(ms >= 0) || !isFinite(ms)) return; const a = S[name] || (S[name] = []); a.push([Date.now(), Math.round(ms), extra || 0]); if (a.length > MAX) a.splice(0, a.length - MAX); save(); }
  const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[s.length >> 1] : null; };
  const sec = (ms) => (ms == null ? '—' : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);
  function summary() {
    const out = [], line = (k, v) => out.push([k, v]);
    const one = (name) => { const a = S[name] || []; return a.length ? a[a.length - 1][1] : null; }, many = (name) => (S[name] || []).map((x) => x[1]);
    line('App start (to the first screen)', `${sec(one('start'))} last time, ${sec(med(many('start')))} usually`);
    line('Refresh of the funds', `${sec(one('refresh'))} last time, ${sec(med(many('refresh')))} usually`);
    const tabs = Object.keys(S).filter((k) => k.startsWith('tab:'));
    if (tabs.length) line('Changing tab', tabs.map((k) => `${k.slice(4)} ${sec(med(many(k)))}`).join(' · '));
    const as = S.asset || []; if (as.length) { const q = as.filter((x) => x[2] === 1).length; line('Asset page, until its chart shows', `${sec(med(as.map((x) => x[1])))} usually, slowest ${sec(Math.max(...as.map((x) => x[1])))}; ${q} of the last ${as.length} opened at once from this phone`); }
    const L = window.SRApp && SRApp.etoroLog ? SRApp.etoroLog() : [], now = Date.now(), m1 = L.filter((x) => now - x.at < 60000), h1 = L.filter((x) => now - x.at < 3600e3);
    if (L.length) {
      line('eToro, last minute', `${m1.length} requests from this phone (eToro allows 120 a minute for all your devices together)`);
      const ok = L.filter((x) => x.status === 200).slice(-100).map((x) => x.ms);
      line('eToro answers in', `${sec(med(ok))} usually, slowest ${sec(ok.length ? Math.max(...ok) : null)} (last ${ok.length})`);
      const waited = h1.filter((x) => x.wait > 1500);
      line('Waits for eToro\'s limit, last hour', waited.length ? `${waited.length} requests waited, the longest ${sec(Math.max(...waited.map((x) => x.wait)))}` : 'none');
      const bad = h1.filter((x) => x.status !== 200); if (bad.length) line('Refused or failed, last hour', `${bad.length} (${[...new Set(bad.map((x) => x.status || 'no connection'))].join(', ')})`);
    }
    if (window.SRLive && SRLive.streamState) { try { const st = SRLive.streamState(); line('Live prices', st && st.state ? st.state : String(st)); } catch (e) { /* none */ } }
    return out;
  }
  function draw(box) {
    box.replaceChildren();
    const dl = document.createElement('dl'); dl.className = 'sp-list';
    for (const [k, v] of summary()) { const dt = document.createElement('dt'); dt.textContent = k; const dd = document.createElement('dd'); dd.textContent = v; dl.append(dt, dd); }
    box.appendChild(dl);
  }
  // one line at the top of Settings: is everything the app depends on up to date?
  let meta = null, metaAsked = false;
  function status(p) {
    const S2 = window.SRScreen, parts = [], ago = (t) => { const m = (Date.now() - t) / 60e3; return m < 1 ? 'now' : m < 60 ? `${Math.round(m)} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`; };
    const add = (k, v, ok) => parts.push([k, v, ok]);
    try { const P = S2 && S2.practice ? S2.practice() : null; if (P && P.made) add('VM', ago(Date.parse(P.made)), !(S2.vmSilent && S2.vmSilent())); else add('VM', 'no record yet', false); } catch (e) { /* not ready */ }
    try { const m = S2 && S2.scanMade ? S2.scanMade() : null; if (m) { const t = Date.parse(String(m).slice(0, 10) + 'T12:00:00Z'); add('Scan', new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), Date.now() - t < 4 * 864e5); } } catch (e) { /* not ready */ }
    try { const D = S2 && S2.demo ? S2.demo() : null; if (D && D.at) add('Account', ago(D.at), !D.err && Date.now() - D.at < 120000); else if (D) add('Account', D.err ? 'not read' : 'not read yet', false); } catch (e) { /* not ready */ }
    if (!metaAsked && window.SRSync && window.SRSync.getFile) { metaAsked = true; window.SRSync.getFile('about/meta.json').then((j) => { meta = j; }).catch(() => { metaAsked = false; }); }
    if (meta && meta.looked) add('Descriptions', `${meta.described.toLocaleString('en-US')} of ${meta.looked.toLocaleString('en-US')} shares`, Date.now() - Date.parse(meta.made) < 40 * 864e5);
    p.replaceChildren(); for (const [k, v, ok] of parts) { const s = p.appendChild(document.createElement('span')); s.className = 'sp-st ' + (ok ? 'ok' : 'warn'); s.textContent = `${k} ${v}`; }
  }
  function mount() {
    const body = document.querySelector('#settings .sheet-body'); if (!body || document.getElementById('speed')) return;
    const st = document.createElement('p'); st.id = 'sys-status'; st.className = 'sp-status'; body.insertBefore(st, body.firstChild);
    setInterval(() => { if (!document.hidden && body.offsetParent !== null) status(st); }, 5000); status(st);
    const d = document.createElement('details'); d.id = 'speed'; d.className = 'sp';
    const s = document.createElement('summary'); s.textContent = 'Speed on this phone'; d.appendChild(s);
    const box = document.createElement('div'); d.appendChild(box); body.appendChild(d);
    let t = 0; d.addEventListener('toggle', () => { clearInterval(t); if (d.open) { draw(box); t = setInterval(() => draw(box), 2000); } });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
  window.SRSpeed = { mark, summary, data: () => S };
})();
