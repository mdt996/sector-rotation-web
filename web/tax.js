// Estimated French tax on your gains, live: Portfolio → Taxes (Revolut) and eToro taxes. 2026: flat tax 31.4% (12.8% income
// tax + 18.6% social charges) on shares, funds, CFDs and crypto. An estimate, not tax advice: the official figures are the
// brokers' yearly tax statements.
// - Shares and funds (Revolut compte-titres; CFDs counted with them): each sale's gain against the weighted average price paid
//   ("prix moyen pondéré"), in euros at that day's euro-dollar rate; the year's gains and losses net out; a net loss of an earlier
//   year (up to 10 years) is set against later gains.
// - Crypto: taxed only when sold for money, and not at all in a year whose sales total €305 or less (all platforms together);
//   gains and losses of the year net out. A sale's gain is taken against that coin's average price paid (the official formula
//   uses the whole crypto portfolio: close for a small one). Staking rewards count as bought at zero.
// - Fees are deducted: a buy's fee adds to what was paid, a sale's fee comes off what was received. Each trade's own fee when
//   known ("f": money, in the trade's currency; "fq": taken in the coin on a Revolut X buy, which then gives that much less);
//   otherwise Revolut's standard fee for a share or fund (0.25%, at least €1) and Revolut X's 0.09% for a coin.
// - eToro (real account, in dollars): its closed trades this year, read with this device's eToro keys (GET
//   /api/v1/trading/info/trade/history, read only); real shares and crypto against their cost in euros on the day bought, CFDs
//   (leverage, short, commodities, indices, currencies) at their result in euros on the day closed, fees deducted.
(function () {
  'use strict';
  const RATE = 0.314, ALLOWANCE = 305, CARRY_YEARS = 10, DAY = 864e5;
  // the fee a trade of this many euros costs when its own fee is not known
  const feeFor = (kind, eurV) => (kind === 'crypto' ? 0.0009 * eurV : Math.max(1, 0.0025 * eurV));
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const btn = (label, cls, fn) => { const b = el('button', 'btn ' + (cls || ''), label); b.type = 'button'; b.addEventListener('click', fn); return b; };
  const eur = (x, sign) => { if (x == null || !isFinite(x)) return '—'; const s = Math.abs(x).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); return (s === '0.00' ? '' : sign && x > 0 ? '+' : x < 0 ? '−' : '') + '€' + s; };
  const usd = (x) => (x == null || !isFinite(x) ? '—' : (x < 0 ? '−' : '') + '$' + Math.abs(x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const year = (d) => +String(d).slice(0, 4);
  const thisYear = () => new Date().getFullYear();

  // ---- the euro-dollar rate of a day (dollars for one euro), from the app's daily EURUSD rows ----
  function fxOf() {
    const S = window.SRApp && SRApp._store && SRApp._store.EURUSD, rows = S && S.status === 'ok' ? S.data : [];
    return (day) => {
      if (!rows.length) return null;
      let v = rows[0].close;
      for (const r of rows) { if (r.date > day) break; v = r.close; }
      return v > 0 ? v : null;
    };
  }

  // ---- Revolut: per year, the gains and losses of your sales and the total of crypto sold ----
  function realised(trades, usdPerEur) {
    const pos = new Map(), years = {};
    let missing = 0;
    const T = (trades || []).filter((t) => t && t.s && t.q > 0 && t.p > 0 && t.d).slice().sort((a, b) => String(a.d).localeCompare(String(b.d)));
    for (const t of T) {
      const kind = t.src === 'revx' ? 'crypto' : 'sec', key = kind + ':' + t.s + (t.cfd ? ':cfd' : '');
      let money = t.q * t.p, k = 1;
      if (t.c === 'USD') { k = usdPerEur ? usdPerEur(String(t.d).slice(0, 10)) : null; if (!(k > 0)) { missing++; continue; } money /= k; }
      else if (t.c && t.c !== 'EUR') { missing++; continue; }
      // the fee: the trade's own (in its currency, or in the coin) or the standard one
      const fq = t.fq > 0 ? Math.min(+t.fq, t.q) : 0, fee = t.f != null && isFinite(t.f) ? +t.f / k : fq ? 0 : feeFor(kind, money);
      const p = pos.get(key) || { q: 0, cost: 0 };
      const y = years[year(t.d)] = years[year(t.d)] || { sec: 0, crypto: 0, cryptoSales: 0, sales: 0, fees: 0, list: [] };
      y.fees = (y.fees || 0) + fee + (fq ? money * (fq / t.q) : 0);
      if (t.side === 'S') {
        const q = Math.min(t.q, p.q), cost = p.q > 0 ? (p.cost / p.q) * q : 0, g = (money - fee) * (q / t.q) - cost;
        p.q -= q; p.cost -= cost; if (p.q < 1e-9) { p.q = 0; p.cost = 0; }
        y[kind] += g; y.sales++; if (kind === 'crypto') y.cryptoSales += money;
        y.list.push({ s: t.s, d: t.d, kind, money, fee, gain: g, cfd: !!t.cfd });
      } else { p.q += t.q - fq; p.cost += money + fee; }
      pos.set(key, p);
    }
    return { years, missing };
  }
  // the unused net losses on shares of the ten years before
  function carryFor(years, y) {
    let carry = 0;
    for (let k = y - CARRY_YEARS; k < y; k++) { const v = (years[k] || {}).sec || 0; if (v < 0) carry += -v; else carry = Math.max(0, carry - v); }
    return carry;
  }
  // tax on: shares' net gains (after earlier losses), crypto's net gains when the year's crypto sales pass €305
  const taxOn = (sec, crypto, cryptoSales, carry) => {
    const secBase = Math.max(0, sec - (carry || 0)), cryptoBase = cryptoSales > ALLOWANCE ? Math.max(0, crypto) : 0;
    return { secBase, cryptoBase, secTax: RATE * secBase, cryptoTax: RATE * cryptoBase, tax: RATE * (secBase + cryptoBase) };
  };
  function revolut(trades, holdings, y, usdPerEur) {
    const R = realised(trades, usdPerEur), Y = R.years[y] || { sec: 0, crypto: 0, cryptoSales: 0, sales: 0, fees: 0, list: [] }, carry = carryFor(R.years, y);
    const due = taxOn(Y.sec, Y.crypto, Y.cryptoSales, carry);
    let secU = 0, cryU = 0, cryValue = 0, secValue = 0, sellFees = 0, unknown = [];
    for (const h of holdings || []) {
      if (!(h.value > 0) || h.ticker === 'CASH' || h.pending) continue;   // cash and an order not filled yet are not sold
      if (!(h.paid > 0)) { unknown.push(h.ticker); continue; }
      const fee = feeFor(h.crypto ? 'crypto' : 'sec', h.value); sellFees += fee;   // what selling it would cost
      if (h.crypto) { cryU += h.value - fee - h.paid; cryValue += h.value; } else { secU += h.value - fee - h.paid; secValue += h.value; }
    }
    const all = taxOn(Y.sec + secU, Y.crypto + cryU, Y.cryptoSales + cryValue, carry);
    return { year: y, Y, carry, due, all, secU, cryU, secValue, cryValue, sellFees, unknown, missing: R.missing };
  }

  // ---- eToro: the real account's closed trades of the year ----
  const ET_KEY = 'sr.etoroTax';
  const kindOf = (t) => (t.lev === 1 && t.buy && t.i >= 100000 && t.i < 200000 ? 'crypto' : t.lev === 1 && t.buy && t.i >= 1000 ? 'real' : 'cfd');
  function compact(raw) {
    const list = Array.isArray(raw) ? raw : (raw && (raw.trades || raw.items || raw.data)) || [];
    const out = [];
    for (const t of list) {
      const c = t.closeTimestamp || t.closeTime, o = t.openTimestamp || t.openTime, buy = t.isBuy != null ? !!t.isBuy : t.direction ? t.direction === 'long' : true;
      const i = +(t.instrumentId || (t.market && t.market.instrumentId)), id = t.positionId;
      if (!c || !(i > 0)) continue;
      out.push({ id, i, o: String(o || c), c: String(c), inv: +t.investment || 0, np: +t.netProfit || 0, f: +t.fees || 0, lev: +t.leverage || 1, buy, m: !!(t.parentPositionId || t.isMirrorTrade), s: (t.market && t.market.symbol) || '' });
    }
    return out;
  }
  // each trade's result in euros: real shares and crypto bought and sold at each day's rate; CFDs at the closing day's rate
  function etoroYear(trades, y, usdPerEur) {
    const by = { real: { n: 0, eur: 0, usd: 0, sales: 0 }, cfd: { n: 0, eur: 0, usd: 0, sales: 0 }, crypto: { n: 0, eur: 0, usd: 0, sales: 0 } };
    let fees = 0, missing = 0, copy = 0;
    const list = [];
    for (const t of trades || []) {
      if (year(t.c) !== y) continue;
      const k = kindOf(t), fc = usdPerEur(t.c.slice(0, 10)), fo = usdPerEur(t.o.slice(0, 10));
      if (!(fc > 0) || !(fo > 0)) { missing++; continue; }
      const resUsd = t.np - t.f;
      const g = k === 'cfd' ? resUsd / fc : (t.inv + resUsd) / fc - t.inv / fo;
      const b = by[k]; b.n++; b.eur += g; b.usd += resUsd; if (k === 'crypto') b.sales += (t.inv + resUsd) / fc;
      fees += t.f; if (t.m) copy++;
      list.push({ ...t, k, g });
    }
    const sec = by.real.eur + by.cfd.eur, due = taxOn(sec, by.crypto.eur, by.crypto.sales, 0);
    return { y, by, sec, due, fees, copy, missing, n: list.length, list };
  }
  function etoroCache() { try { return JSON.parse(localStorage.getItem(ET_KEY) || 'null'); } catch (e) { return null; } }
  // one reading at a time: a second ask while one is on its way waits for that one (never a new read, never a loop of redraws)
  let etRun = null;
  function etoroRead(force) {
    const c = etoroCache(), y = thisYear();
    if (etRun) return etRun;
    if (!force && c && c.year === y && Date.now() - Math.max(c.at || 0, c.errAt || 0) < 6 * 3600e3) return Promise.resolve(c);
    etRun = etoroFetch(c, y).finally(() => { etRun = null; });
    return etRun;
  }
  async function etoroFetch(c, y) {
    {
      const all = [], seen = new Set();
      let err = null;
      for (let page = 1; page <= 60; page++) {   // thousands of trades with copy trading: up to 12,000
        const r = await SRApp.etoroGet(`/api/v1/trading/info/trade/history?minDate=${y}-01-01&page=${page}&pageSize=200`, 2);   // what the open screen waits for
        if (r.status !== 200) { err = r.reason === 'no keys' ? 'no keys' : String(r.status || 'no connection'); break; }
        let j; try { j = JSON.parse(r.body); } catch (e) { err = 'unreadable'; break; }
        const got = compact(j).filter((t) => !seen.has(t.id) && seen.add(t.id));
        if (!got.length) break;   // a short page is not the last one on this route: read on until a page brings nothing new
        all.push(...got);
      }
      if (err && !all.length) { const out = { ...(c || {}), err, errAt: Date.now() }; try { localStorage.setItem(ET_KEY, JSON.stringify(out)); } catch (e) { /* full */ } return out; }
      // symbols for the list (one lookup of the instruments' names)
      const ids = [...new Set(all.filter((t) => !t.s).map((t) => t.i))], names = (c && c.names) || {};
      for (let k = 0; k < ids.length; k += 50) {
        const part = ids.slice(k, k + 50).filter((i) => !names[i]); if (!part.length) continue;
        try { const r = await SRApp.etoroGet('/api/v2/market-data/instruments?instrumentIds=' + part.join(','), 2); if (r.status === 200) for (const it of (JSON.parse(r.body).results || [])) names[it.instrumentId] = it.symbol || it.displayName; } catch (e) { /* ids */ }
      }
      const out = { at: Date.now(), year: y, trades: all, names, err: null };
      try { localStorage.setItem(ET_KEY, JSON.stringify(out)); } catch (e) { /* full */ }
      return out;
    }
  }
  // the eToro screen asks for a reading at most once per reading, and redraws once when it is done
  function readThenDraw(force) { const first = !etRun; const run = etoroRead(force); if (first) run.then(() => SRApp.renderDraw('petax'), () => {}); }

  // ---- the live holdings (from guide.js), with which are coins ----
  function holdingsNow() {
    const G = window.SRGuide, H = G && G.holdings ? G.holdings() : [];
    const coin = (h) => !!(window.SRLive && SRLive.isCoin && SRLive.isCoin(h));
    return H.map((h) => ({ ...h, crypto: coin(h) && h.tracks === h.ticker }));
  }
  function summary() {
    const y = thisYear(), fx = fxOf(), cfg = SRApp.config();
    const R = revolut(cfg.trades || [], holdingsNow(), y, fx);
    const c = etoroCache(), E = c && c.trades ? etoroYear(c.trades, y, fx) : null;
    // the return adds both brokers up: shares with shares (net of earlier losses), crypto with crypto (one €305 allowance)
    const both = (s, crypto, sales) => taxOn(s, crypto, sales, R.carry);
    const comb = E ? both(R.Y.sec + E.sec, R.Y.crypto + E.by.crypto.eur, R.Y.cryptoSales + E.by.crypto.sales) : null;
    const combAll = E ? both(R.Y.sec + R.secU + E.sec, R.Y.crypto + R.cryU + E.by.crypto.eur, R.Y.cryptoSales + R.cryValue + E.by.crypto.sales) : null;
    return { y, R, E, c, comb, combAll };
  }

  // ---- screens ----
  const kv = (box, k, v, cls) => { const r = box.appendChild(el('div', 'g-kv' + (cls ? ' ' + cls : ''))); r.appendChild(el('span', 'g-kv-k', k)); r.appendChild(el('span', 'g-kv-v', v)); return r; };
  const card = (box, title) => { const c = box.appendChild(el('div', 'g-card')); if (title) c.appendChild(el('div', 'g-card-t', title)); return c; };
  const big = (box, label, value, note) => { const h = box.appendChild(el('div', 'g-hero x-tax')); h.appendChild(el('div', 'g-hero-k', label)); h.appendChild(el('div', 'g-hero-v', value)); if (note) h.appendChild(el('div', 'g-hero-chg', note)); return h; };
  const gainTxt = (g) => (g >= 0 ? `${eur(g)} of net gains` : `a net loss of ${eur(-g)}`);
  const cryptoTxt = (sales, g) => (sales <= ALLOWANCE ? `${eur(sales)} sold this year, under the €${ALLOWANCE} yearly allowance: no tax` : `${eur(sales)} sold this year: tax on ${gainTxt(g)}`);
  const note = 'An estimate at 31.4% (2026 flat tax), not tax advice: your official figures are the brokers\' yearly tax statements. Dividends are not counted.';
  function salesList(box, id, label, rows) {
    if (!rows.length) return;
    const d = SRApp.disclosure(box, id, label);
    for (const x of rows.slice().sort((a, b) => String(b.d || b.c).localeCompare(String(a.d || a.c)))) {
      const r = d.appendChild(el('div', 'x-row'));
      r.appendChild(el('span', '', `${String(x.d || x.c).slice(0, 10)} · ${x.label}`));
      r.appendChild(el('b', x.gain > 0.005 ? 'up' : x.gain < -0.005 ? 'down' : '', eur(x.gain, true)));
    }
  }
  function drawRevolut(box) {
    box.replaceChildren();
    const S = summary(), R = S.R, Y = R.Y;
    big(box, `Tax for ${S.y} so far (Revolut)`, eur(R.due.tax), Y.sales ? `On this year's ${Y.sales} sale${Y.sales === 1 ? '' : 's'}` : 'No sale this year yet');
    const a = card(box, 'Sales this year');
    kv(a, 'Shares and funds', `${gainTxt(Y.sec)}${R.carry > 0 ? `, less ${eur(R.carry)} of earlier losses` : ''} → ${eur(R.due.secTax)}`);
    kv(a, 'Crypto (Revolut X)', `${cryptoTxt(Y.cryptoSales, Y.crypto)}${Y.cryptoSales > ALLOWANCE ? ` → ${eur(R.due.cryptoTax)}` : ''}`);
    if (Y.fees > 0) kv(a, 'Fees', `${eur(Y.fees)} on this year's trades, deducted`);
    if (R.missing) a.appendChild(el('div', 'g-hint', `${R.missing} trade${R.missing === 1 ? '' : 's'} left out: no euro rate for that day yet.`));
    const b = card(box, 'If you sold everything now (live)');
    b.appendChild(el('div', 'x-big', eur(R.all.tax)));
    kv(b, 'Investments', `${eur(R.secValue)} now, ${gainTxt(R.secU)} on what you hold → ${eur(R.all.secTax)} with this year's sales`);
    kv(b, 'Revolut X', `${eur(R.cryValue)} now, ${gainTxt(R.cryU)} → ${eur(R.all.cryptoTax)}`);
    if (R.sellFees > 0) kv(b, 'Selling fees', `about ${eur(R.sellFees)}, deducted`);
    kv(b, 'You would keep', eur(R.secValue + R.cryValue - R.sellFees - R.all.tax));
    if (R.unknown.length) b.appendChild(el('div', 'g-hint', `Not counted (no amount paid typed): ${R.unknown.join(', ')}.`));
    if (S.combAll) kv(b, 'With eToro too', `${eur(S.combAll.tax)} in all (both brokers add up on the return)`);
    salesList(box, 'tax-revolut-sales', `This year's sales (${Y.sales})`, Y.list.map((x) => ({ ...x, label: `${x.s}${x.cfd ? ' CFD' : ''}${x.kind === 'crypto' ? ' (crypto)' : ''} · sold ${eur(x.money)}` })));
    box.appendChild(el('div', 'g-hint', note + ' Gains use the average price paid and each day\'s euro-dollar rate; staking rewards count as bought at zero.'));
  }
  function drawEtoro(box) {
    box.replaceChildren();
    const S = summary(), c = S.c, E = S.E;
    if (!c || (!c.trades && c.err)) {
      big(box, `eToro tax for ${S.y}`, '—', !c ? 'Reading your eToro account…' : c.err === 'no keys' ? 'Add your eToro keys in Settings to read your real account.' : `eToro did not give the history (${c.err}). The keys in this app need read access to your real account.`);
      box.appendChild(btn('Read again', '', () => readThenDraw(true)));
      if (!c) readThenDraw(false);
      return;
    }
    big(box, `Tax for ${S.y} so far (eToro)`, eur(E.due.tax), `On ${E.n} closed trade${E.n === 1 ? '' : 's'} this year${E.copy ? `, ${E.copy} of them copy trading` : ''}`);
    const a = card(box, 'Closed this year (real account)');
    kv(a, 'Shares and ETFs', `${E.by.real.n} trades, ${gainTxt(E.by.real.eur)} (${usd(E.by.real.usd)})`);
    kv(a, 'CFDs', `${E.by.cfd.n} trades (leverage, short, commodities), ${gainTxt(E.by.cfd.eur)} (${usd(E.by.cfd.usd)})`);
    kv(a, 'Together', `${gainTxt(E.sec)} → ${eur(E.due.secTax)}`);
    kv(a, 'Crypto', `${E.by.crypto.n} trades, ${cryptoTxt(E.by.crypto.sales, E.by.crypto.eur)}${E.by.crypto.sales > ALLOWANCE ? ` → ${eur(E.due.cryptoTax)}` : ''}`);
    if (E.fees) kv(a, 'Fees', `${usd(E.fees)}, deducted`);
    if (E.missing) a.appendChild(el('div', 'g-hint', `${E.missing} trade${E.missing === 1 ? '' : 's'} left out: no euro rate for that day yet.`));
    if (S.comb) {
      const b = card(box, `Your ${S.y} return, Revolut and eToro together`);
      b.appendChild(el('div', 'x-big', eur(S.comb.tax)));
      kv(b, 'Shares, funds, CFDs', `${gainTxt(S.R.Y.sec + E.sec)} → ${eur(S.comb.secTax)}`);
      kv(b, 'Crypto', `${cryptoTxt(S.R.Y.cryptoSales + E.by.crypto.sales, S.R.Y.crypto + E.by.crypto.eur)}${S.comb.cryptoTax ? ` → ${eur(S.comb.cryptoTax)}` : ''}`);
      const net = S.R.Y.sec + E.sec - S.R.carry;
      if (net < 0) kv(b, 'Loss to carry forward', `${eur(-net)}: no tax on shares, funds and CFDs this year, and this loss can be set against such gains in the next 10 years`);
      b.appendChild(el('div', 'g-hint', 'Gains and losses of both brokers net out on the return; the €305 crypto allowance is for all platforms together.'));
    }
    const names = c.names || {};
    salesList(box, 'tax-etoro-trades', `This year's closed trades (${E.n})`, E.list.map((t) => ({ c: t.c, gain: t.g, label: `${t.s || names[t.i] || '#' + t.i}${t.k === 'cfd' ? ` CFD${t.lev > 1 ? ' x' + t.lev : ''}${t.buy ? '' : ' short'}` : t.k === 'crypto' ? ' (crypto)' : ''}${t.m ? ' · copy' : ''}` })));
    const f = box.appendChild(el('div', 'g-btns'));
    f.appendChild(btn('Read again', '', () => readThenDraw(true)));
    box.appendChild(el('div', 'g-hint', `Read ${new Date(c.at).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}${c.err ? ` (the last try failed: ${c.err})` : ''}. ` + note + ' eToro\'s amounts are in dollars: each is turned into euros at that day\'s rate; positions still open are not counted until closed.'));
    if (Date.now() - Math.max(c.at || 0, c.errAt || 0) > 6 * 3600e3) readThenDraw(false);   // a failed try waits 6 hours too
  }

  dash.draw('ptax', (outer) => drawRevolut(outer));
  dash.draw('petax', (outer) => drawEtoro(outer));
  setInterval(() => { if (document.hidden) return; SRApp.renderDraw('ptax'); }, 10000);   // live: the values move with the prices

  window.SRTax = { RATE, ALLOWANCE, realised, revolut, taxOn, carryFor, compact, etoroYear, etoroRead, summary, kindOf };
})();
