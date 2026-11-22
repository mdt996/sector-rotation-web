// Two things about assets that work the same everywhere in the app:
// 1. An asset's name is a way into its page: a ticker the app knows (its funds, the world board, your holdings, the account's trades,
//    today's ideas), written as plain text on any screen, opens that asset's page (its chart first) when tapped. Text inside buttons,
//    links, fields, charts and the asset page itself is left alone, and words that are also common abbreviations (US, ETF, RSI…) never are.
// 2. The "About" box of an asset's page, as on eToro: what the asset is in a few sentences, then eToro's own facts about it (sector,
//    market value, P/E, results date, analysts, what eToro's investors do, the changes over a week, a month, a year).
//    For the app's own funds, indices, metals, energy and crypto the text is written here; for shares it is Wikipedia's, matched through
//    the ISIN eToro gives (gathered now and then into about/NN.json of your private repository; the phone only reads it), else eToro's
//    own description of the company, read with the facts when the page opens (one read, kept 6 hours).
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
    100063: 'Solana: the currency of the Solana network, a fast blockchain used for payments, trading apps and tokens. It trades every day, around the clock.',
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
  const FIELDS = 'instrumentId,displayname,internalSymbolFull,internalExchangeName,internalAssetClassName,industry,sector,marketCapInUSD,peRatio-TTM,eps-TTM,dividendYieldDaily-TTM,priceToSales-TTM,tipranksConsensus,tipranksTargetPrice,nextEarningDate,isin,umbrellaSector,internalClosingPrice,annualEPSValue,annualEPSLow,annualEPSHigh,annualEPSEstimates,fiscalPeriod,5YearAveragePERatio-TTM,1YearAnnualRevenueGrowthRate-TTM,3YearAnnualRevenueGrowthRate-TTM,5YearAnnualRevenueGrowthRate-TTM,currency-TTM,fiscalPeriodEndDate-TTM,fiscalPeriod-Annual,salesOrRevenue-TTM,salesOrRevenue-Annual,grossIncome-TTM,grossIncome-Annual,operatingIncome-TTM,operatingIncome-Annual,netIncomeAfterExtraordinaryItems-TTM,netIncomeAfterExtraordinaryItems-Annual,netOperatingCashFlow-TTM,netOperatingCashFlow-Annual,capitalExpenditures-TTM,freeCashFlow-TTM,freeCashFlow-Annual,cashShortTermInvestments-TTM,totalDebt-TTM,totalShareholdersEquity-TTM,ebitdA-TTM,priceToBook-TTM,annualSalesValue,annualSalesEstimates,tipranksHighPriceTarget,tipranksLowPriceTarget,tipranksTotalAnalysts,tipranksAnalystsSupportingBuy,tipranksAnalystsSupportingHold,tipranksAnalystsSupportingSell,buyHoldingPct,traders7DayChange,weeklyPriceChange,monthlyPriceChange,oneYearPriceChange,currYearPriceChange,longBusinessDescription-TTM,shortBio-en-gb';
  const facts = new Map();
  // one request per asset at a time: the About block and the page's own figures ask together, and both get the same answer
  const asking = new Map();
  function factsOf(id) {
    const c = facts.get(id); if (c && Date.now() - c.at < 6 * 36e5) return Promise.resolve(c.f);
    if (asking.has(id)) return asking.get(id);
    const p = fetchFacts(id).finally(() => asking.delete(id)); asking.set(id, p); return p;
  }
  async function fetchFacts(id) {
    const c = facts.get(id);
    if (!window.SRApp || !SRApp.etoroGet) return c ? c.f : null;
    const r = await SRApp.etoroGet(`/api/v1/market-data/search?fields=${FIELDS}&instrumentId=${id}&pageSize=1`, 1.5);
    if (!r || r.status !== 200) return c ? c.f : null;
    let it = null; try { const j = JSON.parse(r.body); it = (j.items || []).find((x) => +x.instrumentId === id) || null; } catch (e) { it = null; }
    const f = {}; if (it) for (const [k, v] of Object.entries(it)) f[k.toLowerCase()] = v;   // eToro answers some names in another case (epS-TTM)
    facts.set(id, { at: Date.now(), f: it ? f : null }); return it ? f : null;
  }
  // ---- a model value for any share with earnings (Matteo, 22 Nov 2026: "All assets need to have fair value"; asked which
  // coverage, he chose "Model for all stocks": an automatic estimate from earnings, growth and sector multiples, marked low
  // confidence; the twelve studies made by hand stay and come first). From eToro's figures alone, read when the asset opens:
  //   earnings   analysts' average for the fiscal year in progress when at least three give one, else the last twelve months;
  //   multiple   the middle of three price/earnings ratios: the share's own 5-year average (kept between 6 and 45), the
  //              median of its sector among the shares of the nightly scan, and one from growth (8.5 + 1.5 x the yearly growth
  //              of its sales over three and five years, growth kept between 0 and 12%: Graham's rule, made more careful);
  //   bear/bull  the lowest multiple on the analysts' lowest earnings, the highest on their highest, within half and twice
  //              the base.
  // The value does not follow the price: it is the price eToro's P/E was computed on, divided by that P/E, times the
  // multiple. No earnings, fewer than two multiples, or a result under a quarter or over four times the price: no value.
  // A rough yardstick: against three of the studies made by hand it gave the same base once (MRVL) and was 60 to 70% away
  // twice (AG above, CCJ below). It is never shown without "model" and "low confidence".
  function valuation(f, sectorPE) {
    if (!f) return null;
    const n = (k) => { const v = +f[k]; return f[k] != null && f[k] !== '' && Number.isFinite(v) ? v : null; };
    const px = n('internalclosingprice'), pe = n('peratio-ttm'), e0 = n('eps-ttm'), e1 = n('annualepsvalue'), lo = n('annualepslow'), hi = n('annualepshigh'), cnt = n('annualepsestimates') || 0;
    if (!/^stocks?$/i.test(String(f.internalassetclassname || '')) || !(px > 0) || !(pe > 0) || !(e0 > 0)) return null;
    const clamp = (x, a, b) => Math.max(a, Math.min(b, x)), med = (a) => { const q = a.slice().sort((x, y) => x - y), h = q.length >> 1; return q.length % 2 ? q[h] : (q[h - 1] + q[h]) / 2; };
    const fwd = cnt >= 3 && e1 > 0, k1 = fwd ? clamp(e1 / e0, 0.5, 2) : 1, kLo = fwd && lo > 0 ? clamp(lo / e0, 0.4, k1) : k1 * 0.85, kHi = fwd && hi > 0 ? clamp(hi / e0, k1, 2.5) : k1 * 1.15;
    const g = [n('3yearannualrevenuegrowthrate-ttm'), n('5yearannualrevenuegrowthrate-ttm')].filter((x) => x != null), growth = g.length ? clamp(g.reduce((a, b) => a + b, 0) / g.length, 0, 12) : null;
    const own = n('5yearaverageperatio-ttm'), M = {};
    if (own > 4 && own < 100) M.own = clamp(own, 6, 45);
    if (sectorPE > 4 && sectorPE < 60) M.sector = sectorPE;
    if (growth != null) M.growth = 8.5 + 1.5 * growth;
    const ms = Object.values(M); if (ms.length < 2) return null;
    const mid = med(ms), base = px * (mid / pe) * k1; if (!(base / px > 0.25 && base / px < 4)) return null;
    const bear = clamp(px * (Math.min(...ms) / pe) * kLo, 0.5 * base, 0.95 * base), bull = clamp(px * (Math.max(...ms) / pe) * kHi, 1.05 * base, 2 * base), r1 = (x) => (Math.round(x * 10) / 10).toFixed(1);
    const parts = [M.own ? `its own 5-year average ${r1(M.own)}` : null, M.sector ? `its sector's median ${r1(M.sector)}` : null, M.growth ? `${r1(M.growth)} from its sales growth` : null].filter(Boolean);
    const method = `${fwd ? `analysts' earnings for ${f.fiscalperiod ? String(f.fiscalperiod).replace(/^(\d{4})FY$/, 'fiscal $1') : 'the year in progress'} (${cnt} estimates)` : 'the earnings of the last twelve months'} times a price/earnings ratio of ${r1(mid)}, the middle of ${parts.join(', ')}. A rough yardstick from eToro's figures, not a study`;
    return { model: true, bear, base, bull, confidence: 'low', as_of: new Date().toISOString().slice(0, 10), method, mult: M, mid, fwd, n: cnt };
  }
  // a share the earnings cannot value (a loss, or no usable price/earnings yardstick): what the figures can still say is what it
  // owns and what it sells (Matteo, 22 Nov 2026: "make sure that all assets have the fair value properly calculated and displayed
  // on the charts. for example ... rigetti ... I see no fair value"). Up to three yardsticks, each in the price's own terms so a
  // report in another currency cannot bend them: its book value per share (price / price-to-book), its net cash per share (the
  // share of the book that is cash beyond debt, when there is some), and its sales at its sector's median price/sales (analysts'
  // sales for the fiscal year under way when three or more give them). Bear the lowest, bull the highest, base the middle one. For
  // a company priced on a future it has not earned yet the three sit far under the price: that is what the figures say, not an error.
  function assetValue(f, sectorPS) {
    if (!f || !/^stocks?$/i.test(String(f.internalassetclassname || ''))) return null;
    const n = (k) => { const v = +f[k]; return f[k] != null && f[k] !== '' && Number.isFinite(v) ? v : null; }, clamp = (x, a, b) => Math.max(a, Math.min(b, x));
    const px = n('internalclosingprice'), pb = n('pricetobook-ttm'), ps = n('pricetosales-ttm'), rev = n('salesorrevenue-ttm'), sE = +f.annualsalesestimates >= 3 ? n('annualsalesvalue') : null; if (!(px > 0)) return null;
    const Y = [], r2 = (x) => (x >= 100 ? x.toFixed(0) : x >= 1 ? x.toFixed(2) : x.toPrecision(2));
    if (pb > 0.05 && pb < 500) {
      const book = px / pb, cash = n('cashshortterminvestments-ttm'), debt = n('totaldebt-ttm'), eq = n('totalshareholdersequity-ttm');
      Y.push({ k: 'book', v: book, say: `its book value per share ${r2(book)}` });
      if (cash != null && debt != null && eq > 0 && cash - debt > 0 && (cash - debt) / eq < 1) Y.push({ k: 'cash', v: book * (cash - debt) / eq, say: `its net cash per share ${r2(book * (cash - debt) / eq)}` });
    }
    const fwd = sE != null && rev > 0 && sE / rev > 0.2 && sE / rev < 5;
    if (ps > 0 && sectorPS > 0.1 && sectorPS < 50) { const v = px * (sectorPS / ps) * (fwd ? clamp(sE / rev, 0.5, 3) : 1); Y.push({ k: 'sales', v, say: `${fwd ? "analysts' sales for the fiscal year" : 'its sales'} at its sector's median price/sales of ${sectorPS.toFixed(1)}, ${r2(v)} a share` }); }
    if (!Y.length) return null;
    const q = Y.map((y) => y.v).sort((a, b) => a - b), base = q.length === 1 ? q[0] : q.length === 2 ? (q[0] + q[1]) / 2 : q[1]; if (!(base / px > 0.02 && base / px < 4)) return null;
    const bear = Math.min(q.length > 1 ? q[0] : 0.6 * base, 0.95 * base), bull = Math.max(q.length > 1 ? q[q.length - 1] : 1.5 * base, 1.05 * base), loss = !(n('eps-ttm') > 0);
    const method = `${loss ? 'No earnings to value' : 'Its earnings give no usable yardstick'}, so only what it owns and sells: ${q.length === 1 ? Y[0].say : `${q.length === 2 ? 'between' : 'the middle of'} ${Y.map((y) => y.say).join(q.length === 2 ? ' and ' : ', ')}`}.${base < 0.5 * px ? ' The price pays for a future these figures do not show.' : ''} A rough yardstick from eToro's figures, not a study`;
    return { model: true, kind: 'assets', bear, base, bull, confidence: 'low', as_of: new Date().toISOString().slice(0, 10), method, parts: Y.map((y) => [y.k, y.v]) };
  }
  // the median price/sales of a sector (market value over sales), among the shares of the nightly scan that have both (15 or more)
  function sectorPS(sector) {
    if (!sector || !window.SRScreen || !window.SRScreen.all) return null;
    let v = []; try { v = window.SRScreen.all().filter((r) => r.cls === 'Stocks' && r.sec === sector && r.cap > 0 && r.sales > 0).map((r) => r.cap / r.sales).filter((x) => x > 0.1 && x < 50).sort((a, b) => a - b); } catch (e) { v = []; }
    return v.length >= 15 ? v[v.length >> 1] : null;
  }
  // the median price/earnings ratio of a sector, among the shares of the nightly scan that have earnings (at least 15 of them)
  function sectorPE(sector) {
    if (!sector || !window.SRScreen || !window.SRScreen.all) return null;
    let v = []; try { v = window.SRScreen.all().filter((r) => r.cls === 'Stocks' && r.sec === sector && r.pe > 3 && r.pe < 80).map((r) => r.pe).sort((a, b) => a - b); } catch (e) { v = []; }
    return v.length >= 15 ? v[v.length >> 1] : null;
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

  // eToro's description of a company: the business description (factual), else its short presentation without the lines about eToro itself
  function etoroText(f) {
    if (!f) return '';
    const one = (x) => String(x || '').replace(/\s+/g, ' ').trim();
    // eToro sometimes gives the text of another company with the same ticker (THG Holdings got the Hanover Insurance Group's):
    // a text is used only if its opening names the company (the first distinctive word of eToro's name for it)
    const key = String(f.displayname || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)
      .find((w) => w.length > 2 && !/^(the|inc|plc|corp|ltd|group|holdings|company|class|adr|and)$/.test(w));
    const fits = (t) => !key || t.slice(0, 160).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(key);
    const long = one(f['longbusinessdescription-ttm'] || f['businessdescription-ttm']); if (long.length > 40 && fits(long)) return long;
    const bio = String(f['shortbio-en-gb'] || '').split(/\n+/).map(one).filter(Boolean).join(' ');
    const b = (bio.match(/[^.!?]+(?:[.!?]+(?=\s|$)|$)/g) || []).map((x) => x.trim()).filter((x) => x && !/etoro|generated by artificial intelligence|guarantee the accuracy/i.test(x)).join(' ');
    return b.length > 40 && fits(b) ? b : '';
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
    { const lg = window.SRLogo && window.SRLogo.logo(id, inst.symbol, 36); if (lg) head.firstChild.replaceWith(lg); }
    const hm = head.appendChild(el('div', 'ab-hm')), title = hm.appendChild(el('b', 'ab-t', 'About ' + (inst.symbol || ''))), sub = hm.appendChild(el('span', 'ab-sub', ''));
    const desc = box.appendChild(el('p', 'ab-d g-muted', '…')), more = box.appendChild(el('button', 'ab-more', 'More')), src = box.appendChild(el('div', 'ab-src'));
    more.type = 'button'; more.hidden = true; more.addEventListener('click', () => { const on = box.classList.toggle('is-open'); more.textContent = on ? 'Less' : 'More'; });
    const perf = box.appendChild(el('div', 'ab-perf')), grid = box.appendChild(el('dl', 'ab-grid'));
    // the text: the app's own or Wikipedia's when there is one, else eToro's (both readings arrive in any order)
    let wiki, eto, wikiDone = false, etoDone = false;
    const showText = () => {
      if (!box.isConnected) return;
      const own = wiki && wiki.d ? wiki.d : '', t = own || (eto || '');
      if (!t && !(wikiDone && etoDone)) return;   // wait for the other one before saying there is none
      desc.classList.toggle('g-muted', !t); desc.textContent = t || 'No description of this asset yet.';
      src.textContent = own ? (wiki.w ? `From Wikipedia: “${wiki.w}”` : '') : t ? 'From eToro' : '';
      requestAnimationFrame(() => { more.hidden = !(desc.scrollHeight > desc.clientHeight + 4); });
    };
    textOf(id).then((v) => { wiki = v; }).catch(() => { /* none */ }).then(() => { wikiDone = true; showText(); });
    factsOf(id).then((f) => {
      eto = etoroText(f); etoDone = true; showText();
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
      const q = window.SRLive && SRLive.quotes ? SRLive.quotes.get(id) : null, px = q && q.price > 0 ? q.price : +f.internalclosingprice > 0 ? +f.internalclosingprice : null;
      if (!targetOf(f, px) && f.tipranksconsensus) row('Analysts (TipRanks)', String(f.tipranksconsensus), 'ab-wide');
      const bh = +f.buyholdingpct; if (isFinite(bh) && f.buyholdingpct != null) row('eToro investors in it', `${Math.round(bh)}% buying, ${100 - Math.round(bh)}% selling`);
      if (f.traders7daychange != null && isFinite(+f.traders7daychange)) row('Its traders on eToro, 7 days', pc(+f.traders7daychange));
      row('ISIN', f.isin || null);
      box.dataset.facts = String(grid.children.length);
      try { const t = target(box, f, px); box.dataset.tgt = t ? '1' : '0'; } catch (e) { box.dataset.tgt = '0'; }
      try { const fin = financials(box, f); box.dataset.fin = fin ? String(fin.querySelectorAll('.ab-fin-row').length) : '0'; } catch (e) { box.dataset.fin = '0'; }
    }).catch(() => { etoDone = true; showText(); sub.textContent = inst.symbol || ''; });
  }

  // ---- a company's financials, drawn (Matteo, 22 Nov 2026: "add for every asset the info ... about the cashflow, net
  // revenue....basically the financials info", and "it could become better if you have more visualization features than
  // verbose info"). eToro's figures for the last twelve months. One picture, from sales down to cash: every bar on the scale of
  // the sales, so a bar's length is its share of them (the margin, written beside it); a tick marks the last fiscal year, so the
  // direction shows. Then cash against debt, and how fast the sales grew. A loss is drawn in red and written with its sign.
  const amount = (x) => { const a = Math.abs(x), t = a >= 1e12 ? (a / 1e12).toFixed(2) + 'T' : a >= 1e9 ? (a / 1e9).toFixed(a >= 1e11 ? 0 : 1) + 'B' : a >= 1e6 ? (a / 1e6).toFixed(a >= 1e8 ? 0 : 1) + 'M' : Math.round(a).toLocaleString('en-US'); return (x < 0 ? '−' : '') + t; };
  function financialsOf(f) {
    if (!f) return null; const n = (k) => { const v = +f[k]; return f[k] != null && f[k] !== '' && Number.isFinite(v) ? v : null; };
    const rev = n('salesorrevenue-ttm'); if (!(rev > 0)) return null;
    const rows = [['Sales', rev, n('salesorrevenue-annual')], ['Gross profit', n('grossincome-ttm'), n('grossincome-annual')], ['Operating profit', n('operatingincome-ttm'), n('operatingincome-annual')],
      ['Net profit', n('netincomeafterextraordinaryitems-ttm'), n('netincomeafterextraordinaryitems-annual')], ['Cash from operations', n('netoperatingcashflow-ttm'), n('netoperatingcashflow-annual')], ['Free cash flow', n('freecashflow-ttm'), n('freecashflow-annual')]]
      .filter((r) => r[1] != null).map(([k, v, a]) => ({ k, v, a, share: v / rev }));
    if (rows.length < 3) return null;
    const end = String(f['fiscalperiodenddate-ttm'] || ''), m = /^(\d{1,2})\/\d{1,2}\/(\d{4})/.exec(end) || [], iso = /^(\d{4})-(\d{2})/.exec(end) || [], mo = +(m[1] || iso[2] || 0), yr = +(m[2] || iso[1] || 0);
    const cash = n('cashshortterminvestments-ttm'), debt = n('totaldebt-ttm'), eq = n('totalshareholdersequity-ttm');
    const growth = [['Last year', n('1yearannualrevenuegrowthrate-ttm')], ['Last 3 years', n('3yearannualrevenuegrowthrate-ttm')], ['Last 5 years', n('5yearannualrevenuegrowthrate-ttm')]].filter((g) => g[1] != null);
    return { rows, cur: String(f['currency-ttm'] || '').toUpperCase() || null, to: mo >= 1 && mo <= 12 && yr > 2000 ? `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][mo - 1]} ${yr}` : null,
      year: f['fiscalperiod-annual'] ? String(f['fiscalperiod-annual']).replace(/^(\d{4})FY$/, '$1') : null, cash, debt, eq, growth, health: healthOf(f, n, rev) };
  }
  // is the business healthy, and where do analysts see it going (Matteo, 22 Nov 2026: "those info should help understand if the
  // business of those assets is healthy, projected healthy, or projected unhealthy"). Five plain tests on eToro's figures, each
  // passed, failed or unknown: a profit, cash left after investment, debt it can carry (net debt up to three years of EBITDA; not
  // asked of a bank or an insurer, whose debt is its trade), sales that grow, and the analysts' estimates for the fiscal year under
  // way (three estimates or more). Now: Healthy when it earns, keeps cash and fails nothing; Weak when it does neither; else Mixed.
  // Projected: unhealthy when a loss is expected, weaker when earnings fall more than 10% or sales more than 3%, else healthy. A
  // reading of figures, not a study: it knows nothing of the product, the management or the price.
  function healthOf(f, n, rev) {
    const ni = n('netincomeafterextraordinaryitems-ttm'), fcf = n('freecashflow-ttm'), ocf = n('netoperatingcashflow-ttm'), cashGen = fcf != null ? fcf : ocf, cash = n('cashshortterminvestments-ttm'), debt = n('totaldebt-ttm'), ebitda = n('ebitda-ttm'), g1 = n('1yearannualrevenuegrowthrate-ttm');
    if (ni == null || cashGen == null) return null;
    const T = [], add = (k, ok, say) => T.push({ k, ok, say }), pcs = (x) => (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(100 * x).toFixed(Math.abs(x) < 0.1 ? 1 : 0) + '%';
    add('Profit', ni > 0, `Net ${ni > 0 ? 'profit' : 'loss'} ${amount(Math.abs(ni))} over the last 12 months, ${Math.abs(Math.round(100 * ni / rev))}% of sales`);
    add('Cash flow', cashGen > 0, `${fcf != null ? 'Free cash flow' : 'Cash from operations'} ${amount(cashGen)} over the last 12 months`);
    const money = /financ/i.test(String(f.umbrellasector || f.sector || ''));
    if (money || cash == null || debt == null) add('Debt', null, money ? 'Not judged for a financial company: its debt is its trade' : 'No figures for cash and debt');
    else { const net = debt - cash; if (net <= 0) add('Debt', true, `More cash (${amount(cash)}) than debt (${amount(debt)})`); else if (ebitda > 0) add('Debt', net / ebitda <= 3, `Net debt ${amount(net)}, ${(net / ebitda).toFixed(1)} years of operating earnings (EBITDA)`); else add('Debt', ocf != null && ocf > 0 && net / ocf <= 3, `Net debt ${amount(net)}${ebitda != null ? ', and no operating earnings to carry it' : ''}`); }
    add('Growth', g1 == null ? null : g1 > 0, g1 == null ? 'No figure for the growth of sales' : `Sales ${pc(g1)} over the last year`);
    const eps = n('eps-ttm'), eE = +f.annualepsestimates >= 3 ? n('annualepsvalue') : null, sE0 = +f.annualsalesestimates >= 3 ? n('annualsalesvalue') : null, sE = sE0 != null && sE0 / rev > 0.2 && sE0 / rev < 5 ? sE0 : null;
    const eCmp = eE != null && eps != null && eps > 0 && eE > 0 && eE / eps > 0.2 && eE / eps < 5 ? eE / eps - 1 : null, fy = f.fiscalperiod ? String(f.fiscalperiod).replace(/^(\d{4})FY$/, 'fiscal $1') : 'this fiscal year';
    let next = null;
    if (eE != null || sE != null) {
      next = eE != null && eE <= 0 ? 'unhealthy' : (eCmp != null && eCmp < -0.1) || (sE != null && sE / rev - 1 < -0.03) ? 'weaker' : (eE != null && eE > 0) || sE != null ? 'healthy' : null;
      add('Outlook', next == null ? null : next === 'healthy', `Analysts, ${fy}: ${[sE != null ? `sales ${pcs(sE / rev - 1)}` : '', eE != null && eE <= 0 ? 'a loss per share' : eCmp != null ? `earnings per share ${pcs(eCmp)}` : eE != null && !(eps > 0) ? 'a profit per share' : ''].filter(Boolean).join(', ')} against the last 12 months`);
    } else add('Outlook', null, 'Fewer than three analysts give estimates');
    const known = T.slice(0, 4).filter((t) => t.ok != null), now = T[0].ok && T[1].ok && known.every((t) => t.ok) ? 'Healthy' : !T[0].ok && !T[1].ok ? 'Weak' : 'Mixed';
    return { tests: T, now, next };
  }
  // what analysts expect of the price over a year: their average 12-month target against the price, with their lowest and highest
  // (Matteo: "and also the 1 year % predicted return"). Their forecast, never the app's: written as theirs, with how many they are.
  function targetOf(f, px) {
    if (!f) return null; const tp = +f.tiprankstargetprice, lo = +f.tiprankslowpricetarget, hi = +f.tiprankshighpricetarget; if (!(tp > 0) || !(px > 0)) return null;
    const r = tp / px - 1; if (!(r > -0.9 && r < 5)) return null;   // a target in another currency than the price, or a stale one
    const okR = lo > 0 && hi > 0 && lo <= tp && tp <= hi, b = +f.tipranksanalystssupportingbuy || 0, h = +f.tipranksanalystssupportinghold || 0, se = +f.tipranksanalystssupportingsell || 0;
    return { tp, r, lo: okR ? lo : null, hi: okR ? hi : null, rlo: okR ? lo / px - 1 : null, rhi: okR ? hi / px - 1 : null, n: +f.tiprankstotalanalysts > 0 ? +f.tiprankstotalanalysts : b + h + se || null, votes: b + h + se > 0 ? [b, h, se] : null, word: f.tipranksconsensus ? String(f.tipranksconsensus).replace(/([a-z])([A-Z])/g, '$1 $2') : null };
  }
  function target(box, f, px) {
    const A = targetOf(f, px); if (!A) return null; const pcs = (x) => (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(100 * x).toFixed(Math.abs(x) < 0.1 ? 1 : 0) + '%';
    const S = box.appendChild(el('section', 'ab-tgt')), H = S.appendChild(el('div', 'ab-tgt-h')); const hk = H.appendChild(el('div', '')); hk.appendChild(el('b', '', '1-year return analysts expect')); hk.appendChild(el('span', '', [A.n ? `${A.n} analyst${A.n === 1 ? '' : 's'}` : '', A.word].filter(Boolean).join(' · ')));
    H.appendChild(el('strong', A.r > 0 ? 'up' : A.r < 0 ? 'down' : '', pcs(A.r)));
    if (A.lo != null) {
      const a = Math.min(0, A.rlo), z = Math.max(0, A.rhi), w = z - a || 1, at = (v) => (100 * (v - a) / w).toFixed(2) + '%', T = S.appendChild(el('div', 'ab-tgt-t')); T.setAttribute('role', 'img');
      T.setAttribute('aria-label', `Targets from ${pcs(A.rlo)} to ${pcs(A.rhi)} against the price, average ${pcs(A.r)}`);
      const band = T.appendChild(el('i', 'ab-tgt-band')); band.style.left = at(A.rlo); band.style.width = (100 * (A.rhi - A.rlo) / w).toFixed(2) + '%'; T.appendChild(el('i', 'ab-tgt-now')).style.left = at(0); T.appendChild(el('i', 'ab-tgt-avg')).style.left = at(A.r);
      const X = S.appendChild(el('div', 'ab-tgt-x')); for (const [k, v, p] of [['Lowest', A.rlo, A.lo], ['Average target', A.r, A.tp], ['Highest', A.rhi, A.hi]]) { const c = X.appendChild(el('span', '')); c.appendChild(el('i', '', k)); c.appendChild(el('b', '', `${num(p)} (${pcs(v)})`)); }
    } else S.appendChild(el('div', 'ab-tgt-x')).appendChild(el('span', '')).appendChild(el('b', '', `Average target ${num(A.tp)}`));
    if (A.votes) { const tot = A.votes[0] + A.votes[1] + A.votes[2], V = S.appendChild(el('div', 'ab-tgt-v')), bar = V.appendChild(el('span', 'ab-tgt-vb')); A.votes.forEach((v, i) => { if (v) bar.appendChild(el('i', ['is-buy', 'is-hold', 'is-sell'][i])).style.flexGrow = String(v); }); bar.setAttribute('role', 'img'); bar.setAttribute('aria-label', `${A.votes[0]} of ${tot} say buy`);
      V.appendChild(el('span', 'ab-tgt-vk', `${A.votes[0]} buy · ${A.votes[1]} hold · ${A.votes[2]} sell`)); }
    S.appendChild(el('div', 'ab-fin-n', 'Black line: today\'s price. Their forecast (TipRanks, on eToro), not the app\'s.'));
    return S;
  }
  function financials(box, f) {
    const F = financialsOf(f); if (!F) return null;
    const S = box.appendChild(el('section', 'ab-fin')), H = S.appendChild(el('div', 'ab-fin-h')); H.appendChild(el('b', '', 'Financials')); H.appendChild(el('span', '', ['last 12 months' + (F.to ? ' to ' + F.to : ''), F.cur].filter(Boolean).join(' · ')));
    if (F.health) {
      const Hh = F.health, B = S.appendChild(el('div', 'ab-hl')), top = B.appendChild(el('div', 'ab-hl-h')); B.dataset.now = Hh.now; B.dataset.next = Hh.next || '';
      top.appendChild(el('span', 'ab-hl-b is-' + Hh.now.toLowerCase(), Hh.now + ' now')); if (Hh.next) top.appendChild(el('span', 'ab-hl-b is-' + (Hh.next === 'healthy' ? 'healthy' : Hh.next === 'weaker' ? 'mixed' : 'weak'), 'Projected ' + Hh.next));
      const pips = B.appendChild(el('div', 'ab-hl-p')), say = B.appendChild(el('div', 'ab-hl-say', '')); say.setAttribute('aria-live', 'polite');
      const show = (t, b) => { say.textContent = t.say + '.'; for (const x of pips.children) x.setAttribute('aria-pressed', String(x === b)); };
      Hh.tests.forEach((t) => { const b = pips.appendChild(el('button', 'ab-hl-t ' + (t.ok == null ? 'is-na' : t.ok ? 'is-ok' : 'is-no'))); b.type = 'button'; b.appendChild(el('i', '', t.ok == null ? '–' : t.ok ? '✓' : '✕')).setAttribute('aria-hidden', 'true'); b.appendChild(el('span', '', t.k)); b.setAttribute('aria-label', `${t.k}: ${t.ok == null ? 'not judged' : t.ok ? 'passed' : 'failed'}`); b.addEventListener('click', () => show(t, b)); });
      const first = Hh.tests.find((t) => t.ok === false) || Hh.tests[4] || Hh.tests[0]; show(first, pips.children[Hh.tests.indexOf(first)]);
    }
    const max = Math.max(...F.rows.map((r) => Math.abs(r.v)), ...F.rows.map((r) => Math.abs(r.a || 0))), bars = S.appendChild(el('div', 'ab-fin-bars')); bars.setAttribute('role', 'list');
    for (const r of F.rows) {
      const row = bars.appendChild(el('div', 'ab-fin-row' + (r.v < 0 ? ' is-neg' : ''))); row.setAttribute('role', 'listitem'); row.dataset.k = r.k;
      row.title = `${r.k}: ${amount(r.v)}${r.k === 'Sales' ? '' : `, ${Math.round(100 * r.share)}% of sales`}${r.a != null && F.year ? `; fiscal year ${F.year}: ${amount(r.a)}` : ''}`;
      row.appendChild(el('span', 'ab-fin-k', r.k));
      const track = row.appendChild(el('span', 'ab-fin-t')), bar = track.appendChild(el('i', 'ab-fin-b')); bar.style.width = (100 * Math.abs(r.v) / max).toFixed(2) + '%';
      if (r.a != null && r.a > 0 === r.v > 0) { const t = track.appendChild(el('i', 'ab-fin-tick')); t.style.left = (100 * Math.abs(r.a) / max).toFixed(2) + '%'; }
      const v = row.appendChild(el('span', 'ab-fin-v')); v.appendChild(el('b', '', amount(r.v))); if (r.k !== 'Sales') v.appendChild(el('small', '', `${r.share < 0 ? '−' : ''}${Math.abs(Math.round(100 * r.share))}%`));
    }
    if (F.cash != null && F.debt != null && (F.cash > 0 || F.debt > 0)) {
      const m2 = Math.max(F.cash, F.debt, 1), pair = S.appendChild(el('div', 'ab-fin-bars ab-fin-pair'));
      for (const [k, v, c] of [['Cash', F.cash, 'is-cash'], ['Debt', F.debt, 'is-debt']]) { const row = pair.appendChild(el('div', 'ab-fin-row ' + c)); row.dataset.k = k; row.title = `${k}: ${amount(v)}`; row.appendChild(el('span', 'ab-fin-k', k)); row.appendChild(el('span', 'ab-fin-t')).appendChild(el('i', 'ab-fin-b')).style.width = (100 * Math.max(0, v) / m2).toFixed(2) + '%'; row.appendChild(el('span', 'ab-fin-v')).appendChild(el('b', '', amount(v))); }
    }
    // the growth is the past and is said as the past (Matteo, 22 Nov 2026: "what do you mean by 16.1% 3 years? ... it is not clear")
    if (F.growth.length) { const G = S.appendChild(el('div', 'ab-fin-g')); G.appendChild(el('span', 'ab-fin-gk', 'How fast sales grew, per year on average')); for (const [k, v] of F.growth) { const c = G.appendChild(el('span', 'ab-p')); c.appendChild(el('i', '', k)); c.appendChild(el('b', v > 0 ? 'up' : v < 0 ? 'down' : '', pc(v))); } }
    S.appendChild(el('div', 'ab-fin-n', `Bars: share of sales.${F.year && F.rows.some((r) => r.a != null) ? ` Tick: fiscal year ${F.year}.` : ''} Figures from eToro.${F.health ? ' The health reading is five tests on these figures, not a study.' : ''}`));
    return S;
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

  window.SRAbout = { facts: factsOf, valuation, sectorPE, assetValue, sectorPS, financials: financialsOf, target: targetOf, render, text: (id) => TEXT[id] || null, linked: () => (K ? [...K.keys()] : []) };
})();
