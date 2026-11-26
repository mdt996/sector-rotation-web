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
      const p = pos.get(key) || { q: 0, cost: 0, fees: 0, guess: 0 }, own = (t.f != null && isFinite(t.f)) || fq > 0;   // own: this trade's fee is known
      const y = years[year(t.d)] = years[year(t.d)] || { sec: 0, crypto: 0, cryptoSales: 0, sales: 0, fees: 0, list: [] };
      y.fees = (y.fees || 0) + fee + (fq ? money * (fq / t.q) : 0);
      if (t.side === 'S') {
        const q = Math.min(t.q, p.q), cost = p.q > 0 ? (p.cost / p.q) * q : 0, bf = p.q > 0 ? (p.fees / p.q) * q : 0, g = (money - fee) * (q / t.q) - cost;
        // for the year's report: the number sold (qAll; q of it was seen bought), the cost with the buying fees (cost) and those fees apart (buyFees)
        y.list.push({ s: t.s, d: t.d, kind, money, fee, gain: g, cfd: !!t.cfd, q, qAll: t.q, cost, buyFees: bf, feeKnown: own, buyGuess: p.guess > 0, cur: t.c || 'EUR' });
        p.q -= q; p.cost -= cost; p.fees -= bf; if (p.q < 1e-9) { p.q = 0; p.cost = 0; p.fees = 0; p.guess = 0; }
        y[kind] += g; y.sales++; if (kind === 'crypto') y.cryptoSales += money;
      } else { p.q += t.q - fq; p.cost += money + fee; p.fees += fee; if (!own) p.guess++; }
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

  // ---- what a sale would leave (build 152): "After tax" on Portfolio and "I need €" ----
  // A sale's tax is the EXTRA tax it adds to the year: this year's other gains and losses (both brokers, once eToro's trades
  // are read) and the earlier losses come first. So a gain can cost nothing, and a loss can give back tax already due.
  const baseOf = (S) => ({ sec: S.R.Y.sec + (S.E ? S.E.sec : 0), crypto: S.R.Y.crypto + (S.E ? S.E.by.crypto.eur : 0), cryptoSales: S.R.Y.cryptoSales + (S.E ? S.E.by.crypto.sales : 0), carry: S.R.carry });
  // sales: [{ value: euros sold, gain: their gain before the selling fee, crypto }]
  function ifSold(base, sales) {
    let money = 0, fees = 0, sec = 0, cry = 0, cryMoney = 0;
    for (const s of sales || []) {
      if (!(s.value > 0)) continue;
      const fee = feeFor(s.crypto ? 'crypto' : 'sec', s.value); money += s.value; fees += fee;
      if (s.crypto) { cry += s.gain - fee; cryMoney += s.value; } else sec += s.gain - fee;
    }
    const was = taxOn(base.sec, base.crypto, base.cryptoSales, base.carry), now = taxOn(base.sec + sec, base.crypto + cry, base.cryptoSales + cryMoney, base.carry);
    // on shares and funds: how much of the gain the year's losses took, and how much of a loss is left for later years
    const room = Math.max(0, (base.carry || 0) - base.sec), covered = sec > 0 ? Math.min(sec, room) : 0, later = sec < 0 ? Math.max(0, -sec - Math.max(0, base.sec - (base.carry || 0))) : 0;
    return { money, fees, gain: sec + cry, tax: now.tax - was.tax, keep: money - fees - (now.tax - was.tax), covered, later };
  }
  const partOf = (h, k) => ({ value: h.value * k, gain: (h.value - h.paid) * k, crypto: !!h.crypto });
  const priced = (h) => h.paid > 0;   // as on the Taxes tab: a holding with no live price counts at the amount typed
  // every holding as if sold alone, and all of them at once. One with no price paid cannot be worked out: it is named in
  // `unknown` and stays at its full value in the total, which the screen says.
  function afterTax(holdings, base) {
    const rows = new Map(), known = [], unknown = [];
    let cash = 0, other = 0;
    for (const h of holdings || []) {
      if (!(h.value > 0) || h.pending) continue;
      if (h.ticker === 'CASH') { cash += h.value; continue; }
      if (!priced(h)) { unknown.push(h.ticker); other += h.value; continue; }
      known.push(h); rows.set(h.ticker, ifSold(base, [partOf(h, 1)]));
    }
    const all = ifSold(base, known.map((h) => partOf(h, 1)));
    return { rows, all, cash, other, known: known.length, unknown, total: cash + other + all.money, keep: cash + other + all.keep };
  }
  // "I need €x": what to sell so that x is left after the selling fees and the extra tax, losing the least to tax and fees.
  // Cash first (no tax). Then shares and funds from the smallest gain per euro sold, a loss first: at the average price a
  // part sold carries the same part of the gain, so this order raises the money with the least taxable gain. Then a holding
  // can be left out when doing without it costs less (a small sale's €1 fee can be more than the tax it saves): with up to
  // ten holdings every choice of them is tried, with more one is dropped at a time until no drop helps. Coins are not offered (French tax on coins counts the whole crypto portfolio: which coin is sold
  // does not change it), nor a holding with no price paid. `even` is the same money raised by selling the same part of
  // every holding, to compare.
  function need(x, base, cash, list) {
    const C = (list || []).filter((h) => h.value > 0 && priced(h) && !h.crypto && h.ticker !== 'CASH' && !h.pending).slice().sort((a, b) => (a.value - a.paid) / a.value - (b.value - b.paid) / b.value);
    const fromCash = Math.max(0, Math.min(x, cash || 0)), rest = x - fromCash, sumOf = (L) => L.reduce((s, h) => s + h.value, 0), G = sumOf(C);
    const first = (L) => (g) => { const out = []; let left = g; for (const h of L) { if (left <= 1e-9) break; const v = Math.min(h.value, left); out.push({ ticker: h.ticker, value: v, of: h.value, gain: (h.value - h.paid) * (v / h.value), all: v >= h.value - 1e-9, crypto: false }); left -= v; } return out; };
    const slice = (g) => C.map((h) => ({ ticker: h.ticker, value: h.value * (g / G), of: h.value, gain: (h.value - h.paid) * (g / G), all: g >= G - 1e-9, crypto: false }));
    const solve = (make, top) => {   // the smallest sale that leaves `rest`; with all of it sold and still short, `short`
      if (!(rest > 0.005)) return { sells: [], r: ifSold(base, []), short: false };
      if (!(top > 0)) return { sells: [], r: ifSold(base, []), short: true };
      const all = ifSold(base, make(top)); if (all.keep < rest - 0.005) return { sells: make(top), r: all, short: true };
      let lo = 0, hi = top; for (let i = 0; i < 44; i++) { const m = (lo + hi) / 2; if (ifSold(base, make(m)).keep >= rest) hi = m; else lo = m; }
      return { sells: make(hi), r: ifSold(base, make(hi)), short: false };
    };
    const cost = (S) => S.r.fees + S.r.tax;
    let use = C, A = solve(first(use), G);
    if (!A.short && A.sells.length > 1 && C.length <= 10) {   // up to ten holdings: every choice of them is tried
      for (let mask = 1, all = (1 << C.length) - 1; mask < all; mask++) {
        const L = C.filter((_, i) => mask & (1 << i)), top = sumOf(L); if (top < rest) continue;
        const B = solve(first(L), top); if (!B.short && cost(B) < cost(A) - 0.005) A = B;
      }
    } else for (let again = !A.short && A.sells.length > 1, n = 0; again && n < 200; n++) {   // more: drop a holding while that costs less
      again = false;
      for (const z of A.sells) {
        const L = use.filter((h) => h.ticker !== z.ticker), B = solve(first(L), sumOf(L));
        if (!B.short && cost(B) < cost(A) - 0.005) { use = L; A = B; again = A.sells.length > 1; break; }
      }
    }
    const E = C.length > 1 ? solve(slice, G) : null;
    return { x, cash: fromCash, sells: A.sells, money: A.r.money, fees: A.r.fees, gain: A.r.gain, tax: A.r.tax, covered: A.r.covered, later: A.r.later, keep: fromCash + A.r.keep, ok: !A.short,
      max: (cash || 0) + (G > 0 ? ifSold(base, first(C)(G)).keep : 0), even: E && !E.short && !A.short ? { tax: E.r.tax, fees: E.r.fees, money: E.r.money } : null, offered: C.map((h) => h.ticker) };
  }
  // the live figures for Portfolio: the year so far, each holding and the whole
  function keepNow() { const S = summary(), base = baseOf(S), H = holdingsNow(); return { S, y: S.y, base, H, ...afterTax(H, base) }; }

  // ---- the year's report (build 153): each figure next to the box of the French return it goes in ----
  // Box and line numbers as on the forms published in 2026 for 2025 income (read on impots.gouv.fr on 26 Nov 2026; the 2027
  // forms may move them): form 2074 cadre 5, lines 511 to 524, one column a sale; its total on form 2042 C, box 3VG (a gain,
  // after the losses of earlier years) or 3VH (the year's loss); a gain received on an account abroad also on form 2047,
  // cadre 3, line 30; coins on form 2086 (lines 211 to 224, a gain to 3AN, a loss to 3BN, nothing when the year's sales are
  // within EUR 305); accounts abroad: box 8UU and one form 3916-bis each. Sources and what is NOT covered: AGENTS.md.
  const FORMS = 2026;
  function report(trades, y, usdPerEur) {
    const R = realised(trades, usdPerEur), Y = R.years[y] || { sec: 0, crypto: 0, cryptoSales: 0, sales: 0, fees: 0, list: [] }, carry = carryFor(R.years, y);
    const sec = Y.list.filter((x) => x.kind === 'sec' && !x.cfd), cfd = Y.list.filter((x) => x.kind === 'sec' && x.cfd), cry = Y.list.filter((x) => x.kind === 'crypto');
    const lines = sec.map((x) => {
      const short = x.qAll - x.q > 1e-9;   // more sold than the app saw bought: the cost cannot be worked out
      return { s: x.s, d: String(x.d).slice(0, 10), cur: x.cur, short, feeGuess: !x.feeKnown, buyGuess: !!x.buyGuess,
        l514: x.money / x.qAll, l515: x.qAll, l516: x.money, l517: x.fee, l518: x.money - x.fee,
        l520: short ? null : (x.cost - x.buyFees) / x.q, l521: short ? null : x.cost - x.buyFees, l522: short ? null : x.buyFees, l523: short ? null : x.cost, l524: short ? null : x.gain };
    });
    const net = Y.sec, used = Math.min(carry, Math.max(0, net)), taxable = Math.max(0, net - carry), boxes = [];
    if (sec.length || cfd.length) {
      if (net >= 0) boxes.push({ box: '3VG', form: '2042 C', amount: taxable, used }); else boxes.push({ box: '3VH', form: '2042 C', amount: -net });
      if (taxable > 0) boxes.push({ box: '30', form: '2047', amount: taxable });
    }
    const exempt = Y.cryptoSales <= ALLOWANCE;
    if (cry.length && !exempt) boxes.push({ box: Y.crypto >= 0 ? '3AN' : '3BN', form: '2086', amount: Math.abs(Y.crypto), estimate: true });
    return { year: y, forms: FORMS, boxes,
      sec: { n: sec.length, net, carry, used, taxable, lines, sum524: lines.reduce((t, l) => t + (l.l524 || 0), 0) },
      crypto: { n: cry.length, sales: Y.cryptoSales, exempt, est: Y.crypto, lines: cry.map((x) => ({ s: x.s, d: String(x.d).slice(0, 10), l213: x.money, l214: x.fee, l215: x.money - x.fee })) },
      flags: { missing: R.missing, short: lines.filter((l) => l.short).length, guess: lines.filter((l) => l.feeGuess || l.buyGuess).length, cfd: cfd.length, cfdNet: cfd.reduce((t, x) => t + x.gain, 0) },
      years: Object.keys(R.years).map(Number).filter((k) => R.years[k].sales > 0).sort((a, b) => b - a) };
  }
  const dmy = (d) => { const m = /^(\d{4})-(\d\d)-(\d\d)/.exec(String(d)); return m ? `${m[3]}/${m[2]}/${m[1]}` : String(d); };
  const num = (x) => (x == null || !isFinite(x) ? '—' : (+x.toFixed(6)).toLocaleString('en-GB', { maximumFractionDigits: 6 }));
  // the lines of form 2074 for one sale, as [line, label, value]
  const lines2074 = (l) => [['511', 'Security', l.s], ['512', 'Date sold', dmy(l.d)], ['514', 'Price of one', eur4(l.l514)], ['515', 'Number sold', num(l.l515)], ['516', 'Sold for', eur(l.l516)], ['517', 'Selling fees', eur(l.l517)], ['518', 'Net sale price', eur(l.l518)],
    ['520', 'Cost of one (average)', eur4(l.l520)], ['521', 'Cost', eur(l.l521)], ['522', 'Buying fees', eur(l.l522)], ['523', 'Cost with fees', eur(l.l523)], ['524', 'Result', eur(l.l524, true)]];
  const eur4 = (x) => (x == null || !isFinite(x) ? '—' : '€' + x.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 4 }));
  // what the app cannot know, said in the report
  const UNKNOWN = ['Dividends and interest (form 2047, cadre 2) and the tax already taken on them abroad.', 'Your other brokers: every box is the total of your household.', 'Losses of earlier years that are not among the trades in the app.',
    'Splits, mergers and transfers of securities.', 'The number, the opening date and the address of each account (form 3916-bis): they are on your Revolut statements.', 'How staking rewards are taxed when received (here they only count as coins bought at zero).'];
  function reportText(Rp) {
    const L = [`Proofbench: ${Rp.year} return, Revolut. An estimate, not yet checked by an accountant. Box and line numbers as on the ${Rp.forms} forms.`, ''];
    for (const b of Rp.boxes) L.push(b.form === '2042 C' ? `Form 2042 C, box ${b.box}: ${eur(b.amount)}${b.used ? ` (after ${eur(b.used)} of earlier losses)` : ''}` : b.form === '2047' ? `Form 2047, cadre 3, line 30: ${eur(b.amount)}` : `Form 2086, then 2042 C box ${b.box}: ${eur(b.amount)} (the app's estimate, not the official sum)`);
    if (Rp.crypto.n && Rp.crypto.exempt) L.push(`Coins: ${eur(Rp.crypto.sales)} sold in the year, within €${ALLOWANCE}: exempt (form 2086 lists each sale's price).`);
    L.push('Accounts abroad: box 8UU, and one form 3916-bis for each account.');
    if (Rp.sec.lines.length) { L.push('', 'Form 2074, cadre 5, one column a sale:'); for (const l of Rp.sec.lines) L.push(lines2074(l).map(([k, , v]) => `${k} ${v}`).join(' | ') + (l.short ? ' (purchase missing in the app)' : '') + (l.feeGuess || l.buyGuess ? ' (a fee assumed)' : '')); }
    if (Rp.crypto.lines.length) { L.push('', 'Form 2086, one column a sale (212 and 220 to 223 need your whole coin portfolio):'); for (const l of Rp.crypto.lines) L.push(`${l.s} | 211 ${dmy(l.d)} | 213 ${eur(l.l213)} | 214 ${eur(l.l214)} | 215 ${eur(l.l215)}`); }
    L.push('', 'Not known to the app:', ...UNKNOWN.map((u) => '- ' + u));
    return L.join('\n');
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
  // ---- the year's report on the Taxes tab: the boxes first, then each sale's lines, then what the app cannot know ----
  const TL = (k) => (window.SRI18n ? window.SRI18n.t(k) : k);
  let repYear = null, repSaid = '';
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* the older way below */ }
    const t = document.createElement('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0'; document.body.appendChild(t); t.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; } t.remove(); return ok;
  }
  function drawReport(box, y0) {
    const fx = fxOf(), trades = SRApp.config().trades || [];
    let Rp = report(trades, y0, fx);
    const years = [...new Set([y0, ...Rp.years])].sort((a, b) => b - a).slice(0, 3), y = years.includes(repYear) ? repYear : y0;
    if (y !== y0) Rp = report(trades, y, fx);
    const c = card(box, `Your ${y} return: what goes where`); c.classList.add('x-rep'); c.dataset.year = y;
    if (years.length > 1) {   // the return for a year is filed the spring after: last year's stays one tap away
      const sw = c.appendChild(el('div', 'pf-view x-rep-years')); sw.setAttribute('role', 'group'); sw.setAttribute('aria-label', 'The year of the report');
      for (const k of years) { const b = sw.appendChild(el('button', 'pf-view-b' + (k === y ? ' is-on' : ''), String(k))); b.type = 'button'; b.setAttribute('aria-pressed', String(k === y)); b.addEventListener('click', () => { repYear = k; repSaid = ''; SRApp.renderDraw('ptax'); }); }
    }
    const row = (code, label, note, value, cls) => { const r = c.appendChild(el('div', 'x-box')); r.dataset.box = code; r.appendChild(el('span', 'x-code', code)); const m = r.appendChild(el('div', 'x-box-m')); m.appendChild(el('b', '', label)); if (note) m.appendChild(el('span', '', note)); r.appendChild(el('b', 'x-box-v ' + (cls || ''), value)); return r; };
    const S = Rp.sec, C = Rp.crypto;
    if (!S.n && !Rp.flags.cfd && !C.n) c.appendChild(el('div', 'g-line g-muted', `No sale in ${y} among the trades in the app: no gain or loss to declare from Revolut.`));
    for (const b of Rp.boxes) {
      if (b.box === '3VG') row('3VG', 'Gains on shares and funds', `form 2042 C${b.used > 0.005 ? ` · after ${eur(b.used)} of earlier losses` : ''}`, eur(b.amount));
      else if (b.box === '3VH') row('3VH', 'Loss of the year on shares and funds', 'form 2042 C · it comes off such gains for 10 years', eur(b.amount));
      else if (b.form === '2047') row('2047', 'The same gain, received abroad', 'cadre 3, line 30, with the country of the account', eur(b.amount));
      else row(b.box, b.box === '3AN' ? 'Gain on coins' : 'Loss on coins', 'form 2086 · the app’s estimate, not the official sum', eur(b.amount));
    }
    if (C.n && C.exempt) row('2086', `Coins: ${eur(C.sales)} sold in the year`, `within €${ALLOWANCE}: exempt, nothing in 3AN. Form 2086 lists each sale’s price`, 'exempt');
    row('8UU', 'Accounts abroad: tick the box', 'then one form 3916-bis for each account (investments, and Revolut X apart)', '');
    // what needs a look before the figures are used
    const warn = [Rp.flags.short ? `${Rp.flags.short} sale${Rp.flags.short === 1 ? '' : 's'} sold more than the app saw bought: add the missing purchase, the totals are incomplete.` : '', Rp.flags.guess ? `${Rp.flags.guess} sale${Rp.flags.guess === 1 ? '' : 's'} with a fee the app assumed (Revolut’s standard fee): put the real one from your statement.` : '',
      Rp.flags.missing ? `${Rp.flags.missing} trade${Rp.flags.missing === 1 ? '' : 's'} left out: no euro rate for that day.` : '', Rp.flags.cfd ? `${Rp.flags.cfd} CFD result${Rp.flags.cfd === 1 ? '' : 's'} (${eur(Rp.flags.cfdNet, true)}) counted in the total: on form 2074 they go in the part for “instruments financiers à terme”, not in cadre 5.` : ''].filter(Boolean);
    for (const w of warn) c.appendChild(el('div', 'x-rep-warn', w));
    if (S.lines.length) {
      const d = SRApp.disclosure(c, 'tax-report-2074', `Form 2074, sale by sale (${S.lines.length})`);
      d.appendChild(el('div', 'g-hint', 'Cadre 5, one column a sale. Needed when the broker did not work out your gains by the French rule (the average price paid).'));
      for (const l of S.lines) {
        const b = d.appendChild(el('div', 'x-sale')); b.dataset.s = l.s; const h = b.appendChild(el('div', 'x-sale-h')); h.appendChild(el('b', '', `${l.s} · ${dmy(l.d)}`)); h.appendChild(el('b', l.l524 > 0.005 ? 'up' : l.l524 < -0.005 ? 'down' : '', l.short ? 'incomplete' : eur(l.l524, true)));
        const g = b.appendChild(el('div', 'x-lines')); for (const [k, lab, v] of lines2074(l).slice(1)) { const r = g.appendChild(el('div', 'x-line')); r.appendChild(el('span', 'x-code', k)); r.appendChild(el('span', '', lab)); r.appendChild(el('b', '', v)); }
        const n = [l.cur !== 'EUR' ? `In euros at each day’s ${l.cur} rate` : '', l.feeGuess ? 'selling fee assumed' : '', l.buyGuess ? 'a buying fee assumed' : '', l.short ? 'purchase missing in the app' : ''].filter(Boolean); if (n.length) b.appendChild(el('div', 'g-hint', n.join(' · ') + '.'));
      }
    }
    if (C.lines.length) {
      const d = SRApp.disclosure(c, 'tax-report-2086', `Form 2086, sale by sale (${C.lines.length})`);
      d.appendChild(el('div', 'g-hint', 'The app knows these lines. Lines 212 and 220 to 223 ask for the value and the cost of ALL your coins at each sale, which it does not have.'));
      for (const l of C.lines) { const b = d.appendChild(el('div', 'x-sale')); b.appendChild(el('div', 'x-sale-h')).appendChild(el('b', '', `${l.s} · ${dmy(l.d)}`)); const g = b.appendChild(el('div', 'x-lines')); for (const [k, lab, v] of [['211', 'Date sold', dmy(l.d)], ['213', 'Sold for', eur(l.l213)], ['214', 'Selling fees', eur(l.l214)], ['215', 'Net of fees', eur(l.l215)]]) { const r = g.appendChild(el('div', 'x-line')); r.appendChild(el('span', 'x-code', k)); r.appendChild(el('span', '', lab)); r.appendChild(el('b', '', v)); } }
    }
    { const d = SRApp.disclosure(c, 'tax-report-unknown', 'What the app cannot know'); const u = d.appendChild(el('ul', 'x-unknown')); for (const t of UNKNOWN) u.appendChild(el('li', '', t)); }
    const f = c.appendChild(el('div', 'g-btns')), say = c.appendChild(el('div', 'g-hint x-rep-said', repSaid)); say.setAttribute('aria-live', 'polite');
    f.appendChild(btn(TL('copy'), '', async () => { const ok = await copyText(reportText(Rp)); repSaid = ok ? 'Copied: paste it in a note to keep it beside your return.' : 'Could not copy on this device.'; say.textContent = repSaid; })).classList.add('x-rep-copy');
    c.appendChild(el('div', 'g-hint x-rep-note', 'An estimate, not yet checked by an accountant.'));
    c.appendChild(el('div', 'g-hint', `Box and line numbers as on the ${Rp.forms} forms (for ${Rp.forms - 1}): check them on the forms of the year you file. The return takes whole euros. Made on this device from the trades in the app.`));
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
    drawReport(box, S.y);
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

  window.SRTax = { RATE, ALLOWANCE, realised, revolut, taxOn, carryFor, compact, etoroYear, etoroRead, summary, kindOf, ifSold, afterTax, need, keepNow, baseOf, report, reportText, lines2074 };
})();
