// eToro's logo of an asset, next to its name (https://etoro-cdn.etorostatic.com/market-avatars/<id>/50x50.png).
// The apps let the page load these pictures, and nothing else, from the version that says so in appInfo ("logos": true).
// With an older app nothing is drawn (the rows look as before); a logo that does not load becomes a round badge with the first letter.
(function () {
  'use strict';
  let can = null;
  function able() {
    if (can == null) { try { can = !window.Native ? true : !!JSON.parse(window.Native.appInfo() || '{}').logos; } catch (e) { can = false; } }
    return can;
  }
  const failed = new Set();
  // the logo as an element (size in px), or null when this app cannot show logos
  function logo(id, sym, size) {
    if (!able()) return null;
    const s = size || 22, n = +id, box = document.createElement('span');
    box.className = 'sr-logo'; box.style.width = box.style.height = s + 'px'; box.setAttribute('aria-hidden', 'true');
    const letter = () => { box.replaceChildren(document.createTextNode(String(sym || '?').replace(/^[^A-Za-z0-9]+/, '').charAt(0).toUpperCase() || '?')); box.classList.add('is-letter'); box.style.fontSize = Math.round(s * 0.45) + 'px'; };
    if (!(n > 0) || failed.has(n)) { letter(); return box; }
    const img = document.createElement('img');
    img.alt = ''; img.decoding = 'async'; img.loading = 'lazy'; img.width = img.height = s;
    img.src = `https://etoro-cdn.etorostatic.com/market-avatars/${n}/${s > 40 ? '150x150' : '50x50'}.png`;
    img.addEventListener('error', () => { failed.add(n); letter(); });
    box.appendChild(img);
    return box;
  }
  // put the logo first in a row's element (nothing when the app cannot show logos)
  function lead(parent, id, sym, size) { const l = logo(id, sym, size); if (l) parent.insertBefore(l, parent.firstChild); return l; }
  // a pill (or any element) with the logo before it, in one span, so that a row's columns stay as they are
  function wrap(node, id, sym, size) { const l = logo(id, sym, size); if (!l) return node; const s = document.createElement('span'); s.className = 'sr-lead'; s.append(l, node); return s; }
  window.SRLogo = { logo, lead, wrap, able };
})();
