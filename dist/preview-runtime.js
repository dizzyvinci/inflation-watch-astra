(() => {
  'use strict';
  if (window.astraPreviewSession) return;
  const footer = document.querySelector('footer');
  const root = new URL('./', location.href);
  const workerUrl = new URL('sw.js', root).href;
  let form;
  function showLock() {
    if (!footer || form) return;
    form = document.createElement('form');
    form.className = 'preview-session';
    form.method = 'post';
    form.action = new URL('__preview_logout', root).href;
    const label = document.createElement('span');
    label.textContent = 'Password-protected preview';
    const button = document.createElement('button');
    button.type = 'submit';
    button.textContent = 'Lock preview';
    form.append(label, button);
    footer.append(form);
  }
  function lockDocument() {
    document.documentElement.dataset.previewLocked = 'true';
    document.body.hidden = true;
    location.reload();
  }
  window.astraPreviewSession = {
    onResponse(response) {
      if (response?.headers?.get?.('X-Astra-Preview') !== 'password') return true;
      if (response.status === 401) { lockDocument(); return false; }
      if (response.ok) showLock();
      return true;
    },
  };
  const retire = async () => {
    if (navigator.serviceWorker?.getRegistrations) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.allSettled(registrations.filter(registration =>
        registration.scope === root.href && ['active', 'waiting', 'installing'].some(state =>
          registration[state]?.scriptURL === workerUrl)).map(registration => registration.unregister()));
    }
  };
  // Keep display preferences and cookies; remove only this project's old offline shell.
  retire().catch(() => {});
  if (window.caches?.keys) window.caches.keys().then(names => Promise.allSettled(
    names.filter(name => name.startsWith('inflation-watch-shell-')).map(name => window.caches.delete(name)))).catch(() => {});
  window.addEventListener('pageshow', event => {
    if (event.persisted && form) lockDocument();
  });
})();
