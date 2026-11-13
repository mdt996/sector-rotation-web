// Long explanations are shown on two lines; a tap opens them. What was opened stays open while the app runs, even when the
// screen is drawn again (the trading tab every 5 seconds). The whole text stays in the page, only its height is limited.
(function () {
  'use strict';
  const SEL = '.g-hint, .av-note, .tc-foot, .rot-foot, .sr-note, .g-sub, .sc-how p, .g-card > .g-line.g-muted';
  const LIM = 140, opened = new Set(), key = (t) => t.slice(0, 90);
  function fold(e) {
    e.dataset.fold = '1';
    const t = (e.textContent || '').trim();
    if (t.length <= LIM || e.closest('button, a, summary') || e.querySelector('button, a, input, select, textarea, details, canvas, svg')) return;
    const k = key(t), more = document.createElement('button');
    more.type = 'button'; more.className = 'fold-more';
    const set = (open) => { e.classList.toggle('fold', !open); more.textContent = open ? 'less' : 'more'; if (open) opened.add(k); else opened.delete(k); };
    more.addEventListener('click', (ev) => { ev.stopPropagation(); set(e.classList.contains('fold')); });
    e.addEventListener('click', () => { if (e.classList.contains('fold')) set(true); });
    e.after(more); set(opened.has(k));
  }
  let soon = 0;
  const run = () => { soon = 0; for (const e of document.querySelectorAll(SEL)) if (!e.dataset.fold) fold(e); };
  const obs = new MutationObserver(() => { if (!soon) soon = requestAnimationFrame(run); });
  const start = () => { run(); obs.observe(document.body, { childList: true, subtree: true }); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
