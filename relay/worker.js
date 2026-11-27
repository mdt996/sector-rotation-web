// Sector Rotation for the iPhone: a Cloudflare Worker on Matteo's account (free plan, no card).
// 1. It serves the app's screens from the public repository mdt996/sector-rotation-web, always the newest build. Each
//    file is checked against the build's list of SHA-256 sums before it is served, like the Android and Mac updaters do.
// 2. It relays the few requests a web page can't make itself, because those sites don't answer web pages: eToro's API,
//    Yahoo Finance charts, and the Revolut X balances, prices and staking rewards. GET only, to those addresses only.
// It keeps nothing: no keys, no holdings, no prices. The keys travel inside each request from the phone, as in the apps,
// and are never logged. The settings sync goes from the phone straight to GitHub, not through here.
// 3. Accounts for other people (16 Nov 2026), in Cloudflare KV (binding ACCT, free plan): a username, a check value of a key
//    made from the password on the phone, and one blob of their settings and keys, encrypted on the phone with another key
//    made from the same password. The password and that second key never come here: nobody here can read the blob.
// 4. The nightly scan's market files (no holdings, no trades), read-only, for phones without the owner's own sync: read
//    from the private sync repository with a read-only key kept as a secret (SYNC_READ), these files only.
// 5. /get: the page to give to people (the iPhone version and the Android app), /android: the newest Android app.
const RAW = 'https://raw.githubusercontent.com/mdt996/sector-rotation-web/main/';
const RELAYED = [
  /^https:\/\/public-api\.etoro\.com\/api\/v1\//,
  /^https:\/\/query[12]\.finance\.yahoo\.com\//,
  /^https:\/\/revx\.revolut\.com\/api\/1\.0\/(balances|tickers)$/,
  /^https:\/\/revx\.revolut\.com\/api\/1\.0\/transactions\?[^#]*$/,   // the staking rewards (GET, read only)
];
const PASS = ['accept', 'user-agent', 'x-api-key', 'x-user-key', 'x-request-id', 'x-revx-api-key', 'x-revx-timestamp', 'x-revx-signature'];
const TYPES = { js: 'application/javascript; charset=utf-8', css: 'text/css; charset=utf-8', html: 'text/html; charset=utf-8', json: 'application/json', png: 'image/png', svg: 'image/svg+xml', txt: 'text/plain; charset=utf-8' };
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const NO_STORE = { 'Cache-Control': 'no-store' };
const SYNC_API = 'https://api.github.com/repos/mdt996/sector-rotation-sync/contents/';
const DATA = /^(scan\.json|scanmeta\.json|about\/(meta|\d{2})\.json|packs\/\d{1,8}\.json)$/;   // market files only
// the Android app for other people: android/SectorRotation.apk of the public repository, served only if its SHA-256 is the one
// android/version.json gives (as every screen file is checked against the manifest)
const USER = /^[a-z0-9][a-z0-9._-]{2,31}$/, KEY = /^[0-9a-f]{64}$/, MAX_BLOB = 300000;

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const sha256 = async (buf) => hex(await crypto.subtle.digest('SHA-256', buf));
const text = (s, status = 200, more = {}) => new Response(s, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', ...NO_STORE, ...more } });

// the newest list of files (GitHub's copy can be up to 5 minutes old; asking with the minute in the address gets a fresh one)
async function manifest() {
  const r = await fetch(RAW + 'manifest.json?t=' + Math.floor(Date.now() / 60000));
  if (!r.ok) throw new Error('manifest ' + r.status);
  const m = await r.json();
  if (!m || !m.files || !m.build) throw new Error('manifest unreadable');
  return m;
}

// one file of the screens, only if its SHA-256 is the expected one
async function file(name, sum) {
  for (const q of ['?v=' + sum, '?v=' + sum + '&n=' + Date.now()]) {
    const r = await fetch(RAW + 'web/' + encodeURIComponent(name) + q);
    if (!r.ok) continue;
    const buf = await r.arrayBuffer();
    if (await sha256(buf) === sum) return buf;
  }
  return null;
}

const waitPage = (why) => new Response(
  `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="20">` +
  `<body style="font:16px -apple-system,sans-serif;padding:40px 24px;color:#555">The app is updating (${why}). This page tries again in 20 seconds.</body>`,
  { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', ...NO_STORE } });

async function page() {
  let m, html;
  try { m = await manifest(); } catch (e) { return waitPage('the list of files is not readable yet'); }
  const buf = await file('index.html', m.files['index.html']);
  if (!buf) return waitPage('a new build is on its way');
  html = new TextDecoder().decode(buf);
  const at = (n) => m.files[n] ? `/c/${m.files[n]}/${n}` : null;
  // every script and style by its checksum, so the phone keeps them until they change; the private holdings file is not published
  html = html.replace(/<script src="([^"/]+)"><\/script>\n?/g, (all, n) => (at(n) ? `<script src="${at(n)}"></script>\n` : ''));
  html = html.replace(/<link rel="stylesheet" href="([^"/]+)">/g, (all, n) => (at(n) ? `<link rel="stylesheet" href="${at(n)}">` : all));
  const head = [
    `<meta name="sr-build" content="${m.build}">`,
    '<meta name="apple-mobile-web-app-capable" content="yes">',
    '<meta name="mobile-web-app-capable" content="yes">',
    '<meta name="apple-mobile-web-app-title" content="Gameplan">',
    '<meta name="apple-mobile-web-app-status-bar-style" content="default">',
    '<meta name="theme-color" content="#f3f4f6" media="(prefers-color-scheme: light)">',
    '<meta name="theme-color" content="#0e1013" media="(prefers-color-scheme: dark)">',
    at('icon-180.png') ? `<link rel="apple-touch-icon" href="${at('icon-180.png')}">` : '',
    '<link rel="manifest" href="/app.webmanifest">',
    at('webshim.js') ? `<script src="${at('webshim.js')}"></script>` : '',
  ].filter(Boolean).join('\n');
  // edge to edge on the iPhone; the styles keep clear of the status bar, the rounded corners and the home bar
  html = html.replace(/<meta name="viewport" content="([^"]*)">/, (all, c) => `<meta name="viewport" content="${/viewport-fit/.test(c) ? c : c + ', viewport-fit=cover'}">`);
  html = html.replace(/<head>/i, '<head>\n' + head);
  return new Response(html, { headers: { 'Content-Type': TYPES.html, ...NO_STORE } });
}

async function asset(sum, name) {
  if (!/^[0-9a-f]{64}$/.test(sum) || !/^[\w.-]+$/.test(name)) return text('not found', 404);
  const buf = await file(name, sum);
  if (!buf) return text('not found', 404);
  const ext = name.split('.').pop();
  return new Response(buf, { headers: { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' } });
}

async function webmanifest() {
  let icon = null;
  try { const m = await manifest(); if (m.files['icon-512.png']) icon = `/c/${m.files['icon-512.png']}/icon-512.png`; } catch (e) { icon = null; }
  return new Response(JSON.stringify({
    name: 'Gameplan', short_name: 'Gameplan', start_url: '/', scope: '/', display: 'standalone',
    background_color: '#0f1520', theme_color: '#0f1520', icons: icon ? [{ src: icon, sizes: '512x512', type: 'image/png' }] : [],
  }), { headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'max-age=3600' } });
}

// the relay: only from the app's own page, GET only, the same addresses the Android and Mac apps allow
async function relay(req, self) {
  const origin = req.headers.get('Origin'), site = req.headers.get('Sec-Fetch-Site');
  if (origin !== self && site !== 'same-origin') return text('relay: only for the app', 403);
  let job;
  try { job = await req.json(); } catch (e) { return text('relay: bad request', 400); }
  const url = String((job && job.url) || '');
  if (!RELAYED.some((re) => re.test(url))) return text('blocked: the relay only reaches eToro, Yahoo Finance and Revolut X', 403);
  const h = new Headers();
  const given = (job && typeof job.headers === 'object' && job.headers) || {};
  for (const [k, v] of Object.entries(given)) if (PASS.includes(k.toLowerCase())) h.set(k, String(v));
  if (!h.has('user-agent')) h.set('User-Agent', UA);
  if (!h.has('accept')) h.set('Accept', 'application/json');
  let r;
  try { r = await fetch(url, { method: 'GET', headers: h, redirect: 'follow' }); } catch (e) { return text('relay: ' + String((e && e.message) || e), 502); }
  return new Response(await r.text(), { status: r.status, headers: { 'Content-Type': r.headers.get('Content-Type') || 'text/plain', ...NO_STORE } });
}

// ---- accounts: one KV entry per username, { h: SHA-256 of the login key, d: the encrypted blob, iv, v: version, at } ----
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json', ...NO_STORE } });
async function account(req, env, op) {
  if (!env || !env.ACCT) return json({ error: 'Accounts are not set up yet.' }, 503);
  let b;
  try { b = await req.json(); } catch (e) { return json({ error: 'bad request' }, 400); }
  const u = String((b && b.u) || '').trim().toLowerCase(), a = String((b && b.a) || '');
  if (!USER.test(u)) return json({ error: 'Usernames are 3 to 32 letters, digits, dots, dashes or underscores.' }, 400);
  if (!KEY.test(a)) return json({ error: 'bad request' }, 400);
  const k = 'u:' + u, h = await sha256(new TextEncoder().encode(a));
  const rec = await env.ACCT.get(k, 'json');
  if (op === 'signup') {
    if (rec) return json({ error: 'This username is taken.' }, 409);
    await env.ACCT.put(k, JSON.stringify({ h, d: null, iv: null, v: 0, at: Date.now(), c: Date.now() }));
    return json({ ok: true, v: 0 });
  }
  if (!rec || rec.h !== h) return json({ error: 'Wrong username or password.' }, 401);   // the same answer whether the name exists or not
  if (op === 'get') return json({ v: rec.v, at: rec.at, d: rec.d, iv: rec.iv });
  if (op === 'delete') { await env.ACCT.delete(k); return json({ ok: true }); }
  const d = String((b && b.d) || ''), iv = String((b && b.iv) || '');
  if (!d || d.length > MAX_BLOB || !/^[A-Za-z0-9+/=]+$/.test(d) || !/^[A-Za-z0-9+/=]{16,24}$/.test(iv)) return json({ error: 'bad request' }, 400);
  if (+b.v !== rec.v) return json({ error: 'changed on another device', v: rec.v }, 409);   // the phone reads the newer copy first
  const next = { ...rec, d, iv, v: rec.v + 1, at: Date.now() };
  if (op === 'rekey') { const a2 = String(b.a2 || ''); if (!KEY.test(a2)) return json({ error: 'bad request' }, 400); next.h = await sha256(new TextEncoder().encode(a2)); }
  else if (op !== 'put') return text('not found', 404);
  await env.ACCT.put(k, JSON.stringify(next));
  return json({ ok: true, v: next.v, at: next.at });
}

// ---- the nightly scan's market files, read-only (the candle files are on their own branch, "packs") ----
async function data(path, env) {
  if (!DATA.test(path)) return text('not found', 404);
  if (!env || !env.SYNC_READ) return text('The market data is not set up yet.', 503);
  const h = { Authorization: 'Bearer ' + env.SYNC_READ, Accept: 'application/vnd.github.raw+json', 'User-Agent': 'sector-rotation-worker', 'X-GitHub-Api-Version': '2022-11-28' };
  let r = await fetch(SYNC_API + path + (/^packs\//.test(path) ? '?ref=packs' : ''), { headers: h });
  if (r.status === 404 && /^packs\//.test(path)) r = await fetch(SYNC_API + path, { headers: h });
  if (!r.ok) return text('not available', r.status === 404 ? 404 : 502);
  return new Response(r.body, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=600', 'X-Content-Type-Options': 'nosniff' } });
}

async function android() {
  const t = '?t=' + Math.floor(Date.now() / 60000);
  let v;
  try { const r = await fetch(RAW + 'android/version.json' + t); if (!r.ok) throw new Error(); v = await r.json(); } catch (e) { return text('The Android app is not published yet.', 503); }
  const r = await fetch(RAW + 'android/SectorRotation.apk?v=' + encodeURIComponent(v.sha256 || ''));
  if (!r.ok) return text('The Android app is not available right now.', 503);
  const buf = await r.arrayBuffer();
  if (!v.sha256 || await sha256(buf) !== v.sha256) return text('The Android app is being updated: try again in a few minutes.', 503);
  return new Response(buf, { headers: { 'Content-Type': 'application/vnd.android.package-archive', 'Content-Disposition': `attachment; filename="SectorRotation-${String(v.version || '').replace(/[^\d.]/g, '')}.apk"`, ...NO_STORE } });
}

// ---- the page to give to people ----
const getPage = (origin) => new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Gameplan</title><style>body{font:17px/1.5 -apple-system,system-ui,sans-serif;max-width:560px;margin:0 auto;padding:32px 22px;color:#1d2330;background:#f3f4f6}
h1{font-size:26px;margin:0 0 6px}h2{font-size:19px;margin:28px 0 6px}.c{background:#fff;border-radius:16px;padding:16px 18px;margin:12px 0;border:1px solid #e3e6ea}
a.b{display:inline-block;background:#2f6fed;color:#fff;text-decoration:none;padding:12px 18px;border-radius:12px;font-weight:600}ol{padding-left:22px;margin:6px 0}
.m{color:#5b6472;font-size:15px}@media(prefers-color-scheme:dark){body{background:#0e1013;color:#e7e9ee}.c{background:#171a20;border-color:#262b33}.m{color:#9aa3b2}}</style>
<h1>Gameplan</h1><p class="m">Market screener, charts and your own portfolio, with live eToro prices. You need your own eToro API keys.</p>
<div class="c"><h2>iPhone</h2><ol><li>Open <b>${origin}</b> in <b>Safari</b>.</li><li>Tap Share, then <b>Add to Home Screen</b>.</li><li>Open it from the Home Screen.</li></ol></div>
<div class="c"><h2>Android</h2><p><a class="b" href="/android">Download the app (.apk)</a></p><p class="m">Open the file to install it. Android asks once to allow installing from your browser.</p></div>
<div class="c"><h2>Then</h2><ol><li>Settings → <b>eToro</b>: paste your own API keys (from eToro: Settings → Trading → API keys; read-only is enough).</li>
<li>Optional: Settings → <b>Your account</b>: make a username and password to keep your settings and keys on all your phones. They are encrypted on your phone with your password: nobody else can read them, and a forgotten password cannot be recovered.</li>
<li>Optional: Settings → <b>Revolut X</b> for your coins.</li></ol></div>
<p class="m">Analysis, not investment advice. Updates arrive on their own.</p></html>`, { headers: { 'Content-Type': TYPES.html, 'Cache-Control': 'max-age=300' } });

export default {
  async fetch(req, env) {
    const url = new URL(req.url), p = url.pathname;
    if (p === '/relay') return req.method === 'POST' ? relay(req, url.origin) : text('relay: POST only', 405);
    const ac = p.match(/^\/acct\/(signup|get|put|rekey|delete)$/);
    if (ac) return req.method === 'POST' ? account(req, env, ac[1]) : text('POST only', 405);
    if (req.method !== 'GET' && req.method !== 'HEAD') return text('not allowed', 405);
    if (p === '/' || p === '/index.html') return page();
    if (p === '/latest') {
      try { const m = await manifest(); return new Response(JSON.stringify({ build: m.build }), { headers: { 'Content-Type': 'application/json', ...NO_STORE } }); } catch (e) { return text('not readable', 503); }
    }
    if (p === '/app.webmanifest') return webmanifest();
    if (p.startsWith('/data/')) return data(decodeURIComponent(p.slice(6)), env);
    if (p === '/get') return getPage(url.origin);
    if (p === '/android') return android();
    const c = p.match(/^\/c\/([^/]+)\/([^/]+)$/);
    if (c) return asset(c[1], decodeURIComponent(c[2]));
    return text('not found', 404);
  },
};
