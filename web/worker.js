// Hourly background check (runs in an off-screen WebView started by RefreshJob).
// Fetches fresh candles (this also refreshes the app's cache), recomputes the signals on
// completed daily closes only, compares them with the last check and reports what changed.
(async function () {
  const done = (o) => { try { Native.workerDone(JSON.stringify(o)); } catch (e) { /* app gone */ } };
  try {
    const cfg = SRApp.config();
    const ok = await SRApp.refresh({ closedOnly: true });
    if (!ok) { done({ ok: false, error: (SRApp.state.error && SRApp.state.error.message) || 'refresh failed' }); return; }
    const M = dash.data('metrics');
    if (M.status !== 'ok') { done({ ok: false, error: 'metrics: ' + (M.message || M.status) }); return; }
    const summary = SRApp.summarize();
    let prev = null;
    try { prev = JSON.parse(Native.getState('summary') || 'null'); } catch (e) { prev = null; }
    const events = SRApp.diff(prev, summary, cfg);
    Native.setState('summary', JSON.stringify(summary));
    done({ ok: true, notify: cfg.notify !== false, events, asof: summary.asof });
  } catch (e) {
    done({ ok: false, error: String((e && e.message) || e) });
  }
})();
