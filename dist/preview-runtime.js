(() => {
  'use strict';
  if (window.astraPreviewSession) return;
  const footer = document.querySelector('footer');
  const root = new URL('./', location.href);
  const maintainedLocalPreview = root.protocol === 'http:' && root.port === '8765' && ['127.0.0.1', 'localhost'].includes(root.hostname);
  const workerUrl = new URL('sw.js', root).href;
  let form,workspaceCandidate=false,localPasswordSession=false;
  const notifyWorkspaceCandidate=()=>document.dispatchEvent(new document.defaultView.CustomEvent('astraprivateworkspacecandidate'));
  function ownedWorkspaceResponse(response) {
    if(response?.status!==200||response.ok!==true||response.redirected===true||typeof response.url!=='string'||!/^application\/json(?:;|$)/i.test(response.headers?.get?.('Content-Type')||''))return false;
    try{const url=new URL(response.url);if(url.origin!==root.origin||url.search||url.hash||!url.pathname.startsWith(root.pathname))return false;const file=url.pathname.slice(root.pathname.length);return file==='version.json'||file==='data.json'||/^data-[a-f0-9]{16}\.json$/.test(file);}catch{return false;}
  }
  function showLock() {
    if (!footer || form) return;
    if (maintainedLocalPreview) { localPasswordSession=true; return; }
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
    workspaceCandidate=false;notifyWorkspaceCandidate();
    document.documentElement.dataset.previewLocked = 'true';
    document.body.hidden = true;
    location.reload();
  }
  window.astraPreviewSession = {
    privateWorkspaceCandidate:()=>workspaceCandidate,
    onResponse(response) {
      const accessMode=response?.headers?.get?.('X-Astra-Preview');
      if (accessMode !== 'password') {
        if(workspaceCandidate&&accessMode==='review'&&ownedWorkspaceResponse(response)){
          workspaceCandidate=false;form?.remove();form=undefined;localPasswordSession=false;notifyWorkspaceCandidate();
        }
        return true;
      }
      if (response.status === 401) { lockDocument(); return false; }
      if (response.ok) showLock();
      // Candidate only: the controls status endpoint remains the authority.
      if(!workspaceCandidate&&ownedWorkspaceResponse(response)){workspaceCandidate=true;notifyWorkspaceCandidate();}
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
    if (event.persisted && (form || localPasswordSession)) lockDocument();
  });
})();
