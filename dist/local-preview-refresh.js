(() => {
  'use strict';
  // The hosted site must not poll this route, install listeners or reload itself.
  if (!['127.0.0.1', 'localhost'].includes(window.location.hostname) || !['http:', 'https:'].includes(window.location.protocol) || window.AstraLocalPreviewRefresh) return;
  function create({ fetcher = (...args) => window.fetch(...args), reload = () => window.location.reload() } = {}) {
    let baseline = null, pendingVersion = null, reloading = false, running = false, inflight = false, timer, currentAbort;
    const blocked = () => {
      const active = document.activeElement;
      return document.hidden || !!active?.matches?.('input,textarea,select') || !!active?.isContentEditable
        || !!active?.closest?.('[contenteditable]:not([contenteditable="false"])') || !!document.querySelector('dialog[open]')
        || !!document.getElementById('contact-message')?.value?.length;
    };
    function clearTimer() { if (timer !== undefined) window.clearTimeout(timer); timer = undefined; }
    function maybeReload() {
      if (!running || reloading || !baseline || !pendingVersion || pendingVersion === baseline || blocked()) return;
      reloading = true; clearTimer(); currentAbort?.abort();
      // Native reload preserves the current URL/hash and saved browser preferences.
      // No draft text, cookies or other browser state is copied into storage.
      reload();
    }
    function schedule() { clearTimer(); if (running && !reloading && !document.hidden) timer = window.setTimeout(poll, 4500); }
    async function poll() {
      clearTimer();
      if (!running || reloading || inflight || document.hidden) return;
      inflight = true;
      const controller = new AbortController(); currentAbort = controller;
      const deadline = window.setTimeout(() => controller.abort(), 3000);
      try {
        const response = await fetcher('/__ui_version', { cache: 'no-store', credentials: 'omit', headers: { Accept: 'application/json' }, signal: controller.signal });
        if (!running || reloading || !response.ok) return;
        const text = await response.text(); if (text.length > 1024) return;
        const value = JSON.parse(text);
        if (value?.schemaVersion !== 1 || value.kind !== 'local_preview_ui' || typeof value.version !== 'string' || !/^[a-f0-9]{64}$/.test(value.version)) return;
        if (!running || reloading) return;
        if (baseline === null) baseline = value.version;
        else { pendingVersion = value.version === baseline ? null : value.version; maybeReload(); }
      } catch { /* A build, stopped server or invalid marker never causes a reload. */ }
      finally { window.clearTimeout(deadline); if (currentAbort === controller) currentAbort = undefined; inflight = false; schedule(); }
    }
    function visibility() { if (document.hidden) clearTimer(); else poll(); }
    // Revalidate after an editing/hidden pause. A newer build may now be in
    // progress; a formerly pending committed hash alone must not trigger reload.
    const interaction = () => Promise.resolve().then(() => { if (pendingVersion && !blocked() && !inflight) poll(); });
    function start() {
      if (running || reloading) return;
      running = true; document.addEventListener('visibilitychange', visibility); document.addEventListener('focusout', interaction);
      document.addEventListener('close', interaction, true); document.addEventListener('input', interaction);
      poll();
    }
    function stop() {
      running = false; clearTimer(); currentAbort?.abort(); document.removeEventListener('visibilitychange', visibility);
      document.removeEventListener('focusout', interaction); document.removeEventListener('close', interaction, true); document.removeEventListener('input', interaction);
    }
    return Object.freeze({ start, stop, poll, state: () => ({ baseline, pendingVersion, reloading, running, inflight }) });
  }
  const controller = create(); window.AstraLocalPreviewRefresh = Object.freeze({ create, controller }); controller.start();
})();
