// Sector Rotation for the iPhone: a Cloudflare Worker on Matteo's account (free plan, no card).
// 1. It serves the app's screens from the public repository mdt996/sector-rotation-web, always the newest build. Each
//    file is checked against the build's list of SHA-256 sums before it is served, like the Android and Mac updaters do.
// 2. It relays the few requests a web page can't make itself, because those sites don't answer web pages: eToro's API,
//    Yahoo Finance charts, and the Revolut X balances, prices and staking rewards. GET only, to those addresses only.
// It keeps nothing: no keys, no holdings, no prices. The keys travel inside each request from the phone, as in the apps,
// and are never logged. The settings sync goes from the phone straight to GitHub, not through here.
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
    '<meta name="apple-mobile-web-app-title" content="Sector Rotation">',
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
    name: 'Sector Rotation', short_name: 'Sectors', start_url: '/', scope: '/', display: 'standalone',
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

export default {
  async fetch(req) {
    const url = new URL(req.url), p = url.pathname;
    if (p === '/relay') return req.method === 'POST' ? relay(req, url.origin) : text('relay: POST only', 405);
    if (req.method !== 'GET' && req.method !== 'HEAD') return text('not allowed', 405);
    if (p === '/' || p === '/index.html') return page();
    if (p === '/latest') {
      try { const m = await manifest(); return new Response(JSON.stringify({ build: m.build }), { headers: { 'Content-Type': 'application/json', ...NO_STORE } }); } catch (e) { return text('not readable', 503); }
    }
    if (p === '/app.webmanifest') return webmanifest();
    const c = p.match(/^\/c\/([^/]+)\/([^/]+)$/);
    if (c) return asset(c[1], decodeURIComponent(c[2]));
    return text('not found', 404);
  },
};
