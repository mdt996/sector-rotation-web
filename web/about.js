// Two things about assets that work the same everywhere in the app:
// 1. An asset's name is a way into its page: a ticker the app knows (its funds, the world board, your holdings, the account's trades,
//    today's ideas), written as plain text on any screen, opens that asset's page (its chart first) when tapped. Text inside buttons,
//    links, fields, charts and the asset page itself is left alone, and words that are also common abbreviations (US, ETF, RSI…) never are.
// 2. The "About" box of an asset's page, as on eToro: what the asset is in a few sentences, then eToro's own facts about it (sector,
//    market value, P/E, results date, analysts, what eToro's investors do, the changes over a week, a month, a year).
//    eToro's public interface has no description text. For the app's own funds, indices, metals, energy and crypto the text is written
//    here; for shares it is Wikipedia's, matched through the ISIN eToro gives (gathered now and then by the VM into about/NN.json of your
//    private repository; the phone only reads it). The facts are read from eToro when the page opens (one read, kept 6 hours).
(function () {
  'use strict';
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* not kept */ } };

  // ---- what the app's own assets are (by eToro instrument id) ----
  const SECTOR = (what) => `One of the eleven Select Sector SPDR funds, which together make up the S&P 500: it holds the ${what}, weighted by size.`;
  const TEXT = {
    27: 'The S&P 500: the 500 largest companies listed in the United States, weighted by market value. eToro\'s contract on the index has no expiry date.',
    28: 'The Nasdaq-100: the 100 largest companies listed on the Nasdaq other than banks and insurers, weighted by market value. Technology makes up most of it.',
    32: 'The DAX: the 40 largest companies listed in Frankfurt, Germany\'s main share index.',
    43: 'The Euro Stoxx 50: 50 of the largest companies of the countries that use the euro.',
    36: 'The Nikkei 225: 225 large companies listed in Tokyo, weighted by their share price rather than their size.',
    38: 'The Hang Seng Index: the largest companies listed in Hong Kong, many of them Chinese.',
    253: 'The FTSE China A50: the 50 largest companies of the Shanghai and Shenzhen markets (China\'s A-shares).',
    25: 'The US dollar index: the dollar against six currencies, mostly the euro, then the yen, the pound, the Canadian dollar, the Swedish krona and the Swiss franc. It rises when the dollar strengthens.',
    3101: 'iShares 7-10 Year Treasury Bond ETF: US government bonds that mature in 7 to 10 years. Its price falls when long-term interest rates rise, and rises when they fall.',
    18: 'Gold, in US dollars per troy ounce. eToro\'s contract has no expiry date. Often sought when real interest rates fall or in times of stress.',
    19: 'Silver, in US dollars per troy ounce: a precious metal and an industrial one (solar panels, electronics), so it usually moves more than gold.',
    17: 'Crude oil (WTI, the US benchmark), in US dollars per barrel. eToro\'s contract has no expiry date.',
    22: 'Natural gas (the US Henry Hub price), in US dollars per million BTU. Very volatile, with strong seasons.',
    100000: 'Bitcoin: the first and largest cryptocurrency, with a supply fixed at 21 million coins. It trades every day, around the clock.',
    100001: 'Ether: the currency of the Ethereum network, on which many crypto applications and stablecoins run. It trades every day, around the clock.',
    1: 'The euro in US dollars: how many dollars one euro buys.',
    3000: 'SPDR S&P 500 ETF Trust: the oldest and largest fund that follows the S&P 500, the 500 largest US companies.',
    3006: 'Invesco QQQ: the fund that follows the Nasdaq-100, the 100 largest non-financial companies on the Nasdaq.',
    3005: 'iShares Russell 2000 ETF: about 2,000 small US companies.',
    3021: SECTOR('technology companies of the S&P 500 (chips, software, computers and phones)'),
    3004: SECTOR('financial companies of the S&P 500 (banks, insurers, payment networks, asset managers)'),
    3008: SECTOR('energy companies of the S&P 500 (oil and gas producers, refiners, oil services)'),
    3017: SECTOR('health-care companies of the S&P 500 (drug makers, medical devices, health insurers)'),
    3019: SECTOR('industrial companies of the S&P 500 (aerospace and defense, machinery, transport, building products)'),
    3024: SECTOR('consumer-discretionary companies of the S&P 500 (online and other shops, cars, restaurants, hotels)'),
    3022: SECTOR('consumer-staples companies of the S&P 500 (food, drinks, household products, supermarkets)'),
    3013: SECTOR('utilities of the S&P 500 (electricity, gas and water suppliers)'),
    4438: SECTOR('materials companies of the S&P 500 (chemicals, metals and mining, packaging, construction materials)'),
    4442: SECTOR('real-estate companies of the S&P 500 (property trusts: data centres, towers, warehouses, homes)'),
    4427: SECTOR('communication-services companies of the S&P 500 (internet platforms, media, telecoms)'),
    6357: 'VanEck Semiconductor ETF: about 25 of the largest makers of chips and of chip-making equipment.',
    10879: 'iShares Expanded Tech-Software Sector ETF: North American software companies.',
    4431: 'SPDR S&P Biotech ETF: US biotech companies, held in near-equal amounts, so small firms count about as much as large ones.',
    4443: 'SPDR S&P Regional Banking ETF: US regional banks, held in near-equal amounts.',
    6961: 'iShares U.S. Aerospace & Defense ETF: US makers of aircraft, weapons and defense systems.',
    3002: 'VanEck Gold Miners ETF: the largest gold-mining companies. It moves with gold, usually more.',
    14481: 'Global X Silver Miners ETF: silver-mining companies. It moves with silver, usually more.',
    10805: 'Global X Copper Miners ETF: copper-mining companies.',
    8748: 'Global X Uranium ETF: uranium miners and companies of the nuclear-fuel chain.',
    3025: 'SPDR Gold Shares: a fund that holds physical gold in vaults, so it follows the gold price.',
    3020: 'iShares 20+ Year Treasury Bond ETF: US government bonds that mature in more than 20 years. It falls a lot when long-term interest rates rise.',
    1367: 'iShares Bitcoin Trust: a US fund that holds bitcoin, so it follows its price during US market hours.',
  };

  // ---- eToro's facts (its search interface, one read per asset, kept 6 hours) ----
  const FIELDS = 'instrumentId,displayname,internalSymbolFull,internalExchangeName,internalAssetClassName,industry,sector,marketCapInUSD,peRatio-TTM,eps-TTM,dividendYieldDaily-TTM,priceToSales-TTM,tipranksConsensus,tipranksTargetPrice,nextEarningDate,isin,buyHoldingPct,traders7DayChange,weeklyPriceChange,monthlyPriceChange,oneYearPriceChange,currYearPriceChange';
  const facts = new Map();
  async function factsOf(id) {
    const c = facts.get(id); if (c && Date.now() - c.at < 6 * 36e5) return c.f;
    if (!window.SRApp || !SRApp.etoroGet) return c ? c.f : null;
    const r = await SRApp.etoroGet(`/api/v1/market-data/search?fields=${FIELDS}&instrumentId=${id}&pageSize=1`, 1.5);
    if (!r || r.status !== 200) return c ? c.f : null;
    let it = null; try { const j = JSON.parse(r.body); it = (j.items || []).find((x) => +x.instrumentId === id) || null; } catch (e) { it = null; }
    const f = {}; if (it) for (const [k, v] of Object.entries(it)) f[k.toLowerCase()] = v;   // eToro answers some names in another case (epS-TTM)
    facts.set(id, { at: Date.now(), f: it ? f : null }); return it ? f : null;
  }
  // ---- the description of a share (Wikipedia, gathered by the VM), kept 14 days on the device ----
  const shards = new Map();
  async function textOf(id) {
    if (TEXT[id]) return { d: TEXT[id] };
    const key = 'sr.about.' + id, c = lsGet(key, null); if (c && Date.now() - c.at < 14 * 864e5) return c.v;
    if (!window.SRSync || !window.SRSync.getFile) return c ? c.v : null;
    const n = String(id % 64).padStart(2, '0');
    if (!shards.has(n)) shards.set(n, window.SRSync.getFile(`about/${n}.json`).catch(() => null));
    const j = await shards.get(n); if (!j) { shards.delete(n); return c ? c.v : null; }
    const v = j[id] || null; lsSet(key, { at: Date.now(), v }); return v;
  }

  // ---- the box ----
  const big = (x) => (x >= 1e12 ? `$${(x / 1e12).toFixed(2)}T` : x >= 1e9 ? `$${(x / 1e9).toFixed(1)}B` : x >= 1e6 ? `$${Math.round(x / 1e6)}M` : `$${Math.round(x).toLocaleString('en-US')}`);
  const pc = (x, d = 1) => (x == null || !isFinite(x) ? '—' : (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x).toFixed(d) + '%');
  const num = (x, d = 2) => (x == null || !isFinite(+x) ? null : (+x).toFixed(d));
  const NOT = new Set(['etf', 'indices', 'crypto', 'currencies', 'commodities', 'forex']);
  function render(box, inst) {
    box.replaceChildren(); box.hidden = false;
    const id = +inst.id; if (!(id > 0)) { box.hidden = true; return; }
    const head = box.appendChild(el('div', 'ab-h'));
    head.appendChild(el('span', 'ab-av', String(inst.symbol || '?').replace(/[^A-Z0-9]/gi, '').slice(0, 2).toUpperCase())).setAttribute('aria-hidden', 'true');
    const hm = head.appendChild(el('div', 'ab-hm')), title = hm.appendChild(el('b', 'ab-t', 'About ' + (inst.symbol || ''))), sub = hm.appendChild(el('span', 'ab-sub', ''));
    const desc = box.appendChild(el('p', 'ab-d g-muted', '…')), more = box.appendChild(el('button', 'ab-more', 'More')), src = box.appendChild(el('div', 'ab-src'));
    more.type = 'button'; more.hidden = true; more.addEventListener('click', () => { const on = box.classList.toggle('is-open'); more.textContent = on ? 'Less' : 'More'; });
    const perf = box.appendChild(el('div', 'ab-perf')), grid = box.appendChild(el('dl', 'ab-grid'));
    textOf(id).then((v) => {
      if (!box.isConnected) return;
      desc.classList.toggle('g-muted', !v); desc.textContent = v && v.d ? v.d : 'No description of this asset yet.';
      src.textContent = v && v.w ? `From Wikipedia: “${v.w}”` : '';
      requestAnimationFrame(() => { more.hidden = !(desc.scrollHeight > desc.clientHeight + 4); });
    }).catch(() => { desc.textContent = 'No description of this asset yet.'; });
    factsOf(id).then((f) => {
      if (!box.isConnected) return;
      if (!f) { sub.textContent = [inst.symbol, inst.exchange].filter(Boolean).join(' · '); return; }
      title.textContent = 'About ' + (f.displayname || inst.name || inst.symbol);
      sub.textContent = [f.internalsymbolfull || inst.symbol, f.internalexchangename, f.internalassetclassname].filter(Boolean).join(' · ');
      for (const [k, v] of [['1 week', f.weeklypricechange], ['1 month', f.monthlypricechange], ['This year', f.curryearpricechange], ['1 year', f.oneyearpricechange]]) {
        if (v == null || !isFinite(+v)) continue; const s = perf.appendChild(el('span', 'ab-p')); s.appendChild(el('i', '', k)); s.appendChild(el('b', +v > 0 ? 'up' : +v < 0 ? 'down' : '', pc(+v)));
      }
      const row = (k, v, cls) => { if (v == null || v === '') return; const d = grid.appendChild(el('div', cls || '')); d.appendChild(el('dt', '', k)); d.appendChild(el('dd', '', v)); };
      const sec = f.sector && !NOT.has(String(f.sector).toLowerCase()) ? f.sector : null, ind = f.industry && !NOT.has(String(f.industry).toLowerCase()) ? f.industry : null;
      row('Sector', sec); row('Industry', ind);
      row('Market value', +f.marketcapinusd > 0 ? big(+f.marketcapinusd) : null);
      row('P/E (last 12 months)', +f['peratio-ttm'] > 0 ? num(f['peratio-ttm'], 1) : null);
      row('Earnings per share', f['eps-ttm'] != null && isFinite(+f['eps-ttm']) && +f['eps-ttm'] !== 0 ? num(f['eps-ttm']) : null);
      row('Dividend yield', f['dividendyielddaily-ttm'] != null && isFinite(+f['dividendyielddaily-ttm']) && sec ? (+f['dividendyielddaily-ttm'] > 0 ? (100 * f['dividendyielddaily-ttm']).toFixed(2) + '%' : 'none') : null);
      row('Price / sales', +f['pricetosales-ttm'] > 0 ? num(f['pricetosales-ttm'], 1) : null);
      const nx = f.nextearningdate ? Date.parse(String(f.nextearningdate).slice(0, 10) + 'T12:00:00Z') : NaN;
      row('Next results', isFinite(nx) && nx > Date.now() - 864e5 ? new Date(nx).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null);
      if (f.tipranksconsensus || +f.tiprankstargetprice > 0) {
        const tp = +f.tiprankstargetprice, q = window.SRLive && SRLive.quotes ? SRLive.quotes.get(id) : null, px = q && q.price > 0 ? q.price : null;
        row('Analysts (TipRanks)', [f.tipranksconsensus, tp > 0 ? `target ${tp.toFixed(2)}${px ? ` (${pc(100 * (tp / px - 1))} from the price)` : ''}` : ''].filter(Boolean).join(', '), 'ab-wide');
      }
      const bh = +f.buyholdingpct; if (isFinite(bh) && f.buyholdingpct != null) row('eToro investors in it', `${Math.round(bh)}% buying, ${100 - Math.round(bh)}% selling`);
      if (f.traders7daychange != null && isFinite(+f.traders7daychange)) row('Its traders on eToro, 7 days', pc(+f.traders7daychange));
      row('ISIN', f.isin || null);
      box.dataset.facts = String(grid.children.length);
    }).catch(() => { sub.textContent = inst.symbol || ''; });
  }

  // ---- names that open their asset's page ----
  const NOLINK = new Set('US UK EU ETF ETFS RSI ATR VM UTC OK AI CEO ID PE EPS IPO USD EUR GBP HKD NOK AUD JPY CHF CAD SEK DKK FX TA SMA EMA MA PM AM NY ON IT ALL ARE BE NOW SO GO OR AN AT BY DO IF IN IS ME MY NO OF TO UP WE TP SL CFD NAV GDP CPI FED API APP NEW TOP BIG ONE'.split(' '));
  const SKIP = 'button, a, input, textarea, select, option, label, svg, canvas, code, pre, script, style, .ch, #search, .g-sheet, [contenteditable], .sr-asset, [role="button"], [data-nolink]';
  let K = null, KAt = 0, RE = null, rescan = false;
  function table() {
    if (K && Date.now() - KAt < 20000) return RE;
    const m = new Map(), add = (s, id, n) => { if (!s || !(+id > 0) || m.has(s) || s.length < 2 || NOLINK.has(s) || !/^[A-Z0-9][A-Z0-9.]*[A-Z0-9]$/.test(s) || !/[A-Z]/.test(s)) return; m.set(s, { id: +id, name: n || '' }); };
    try { if (window.SRScreen && window.SRScreen.known) for (const [s, v] of window.SRScreen.known()) add(s, v.id, v.name); } catch (e) { /* not ready */ }
    try { for (const [s, id] of SRApp.DATASETS) add(s, id); } catch (e) { /* not ready */ }
    const sig = [...m.keys()].sort().join(','); KAt = Date.now();
    if (K && K.sig === sig) return RE;
    if (K) rescan = true; K = m; K.sig = sig;
    const keys = [...m.keys()].sort((a, b) => b.length - a.length).map((s) => s.replace(/[.]/g, '\\.'));
    RE = keys.length ? new RegExp('(^|[^A-Za-z0-9.$])(' + keys.join('|') + ')(?![A-Za-z0-9]|\\.[A-Za-z])', 'g') : null;
    return RE;
  }
  function linkText(tn, re) {
    const s = tn.nodeValue; re.lastIndex = 0; let m, at = 0, frag = null;
    while ((m = re.exec(s))) {
      const start = m.index + m[1].length, sym = m[2], k = K.get(sym); if (!k) continue;
      frag = frag || document.createDocumentFragment(); if (start > at) frag.appendChild(document.createTextNode(s.slice(at, start)));
      const a = frag.appendChild(el('span', 'sr-asset', sym)); a.dataset.assetId = k.id; a.dataset.assetSym = sym; if (k.name) a.dataset.assetName = k.name; a.setAttribute('role', 'link'); a.tabIndex = 0;
      at = start + sym.length;
    }
    if (frag && tn.parentNode) { if (at < s.length) frag.appendChild(document.createTextNode(s.slice(at))); tn.parentNode.replaceChild(frag, tn); }
  }
  const ok = (t) => t.nodeValue && t.nodeValue.length >= 2 && /[A-Z0-9]{2}/.test(t.nodeValue) && t.parentElement && !t.parentElement.closest(SKIP);
  function scan(node) {
    const re = table(); if (!re) return;
    if (node.nodeType === 3) { if (ok(node)) linkText(node, re); return; }
    if (node.nodeType !== 1 || (node.closest && node.closest(SKIP))) return;
    const w = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, { acceptNode: (t) => (ok(t) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT) }), list = [];
    while (w.nextNode()) list.push(w.currentNode);
    for (const t of list) linkText(t, re);
  }
  const pend = new Set(); let raf = 0, root = null;
  function flush() { raf = 0; const L = [...pend]; pend.clear(); try { table(); if (rescan && root) { rescan = false; scan(root); } for (const n of L) if (n.isConnected) scan(n); } catch (e) { if (window.console) console.error(e); } }
  const soon = () => { if (!raf) raf = (window.requestAnimationFrame || setTimeout)(flush); };
  function start() {
    root = document.getElementById('dash-root'); if (!root || !window.MutationObserver) return;
    new MutationObserver((recs) => { for (const r of recs) { if (r.type === 'characterData') pend.add(r.target); else for (const n of r.addedNodes) pend.add(n); } soon(); }).observe(root, { childList: true, subtree: true, characterData: true });
    pend.add(root); soon();
    setInterval(() => { KAt = 0; table(); if (rescan) soon(); }, 30000);   // the VM's record or the holdings arrived since: names newly known get their link
  }
  const go = (a) => { const id = +a.dataset.assetId; if (!(id > 0) || !window.SRLive || !SRLive.openAsset) return; SRLive.openAsset({ id, symbol: a.dataset.assetSym, name: a.dataset.assetName || '', exchange: '' }); };
  document.addEventListener('click', (e) => { const a = e.target && e.target.closest ? e.target.closest('.sr-asset') : null; if (!a) return; e.preventDefault(); e.stopPropagation(); go(a); }, true);   // first, before the card under it reacts
  document.addEventListener('keydown', (e) => { if (e.key !== 'Enter' || !e.target || !e.target.closest) return; const a = e.target.closest('.sr-asset'); if (a) { e.preventDefault(); go(a); } }, true);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();

  window.SRAbout = { facts: factsOf, render, text: (id) => TEXT[id] || null, linked: () => (K ? [...K.keys()] : []) };
})();
