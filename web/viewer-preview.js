(() => {
  'use strict';
  const options = document.getElementById('display-options');
  if (!options || document.getElementById('viewer-preview-enter')) return;

  const entry = document.createElement('div'); entry.className = 'viewer-preview-entry';
  const enter = document.createElement('button'); enter.type = 'button'; enter.id = 'viewer-preview-enter';
  enter.textContent = 'Viewer preview'; enter.setAttribute('aria-controls', 'display-options');
  enter.setAttribute('aria-describedby', 'viewer-preview-description');
  const description = document.createElement('small'); description.id = 'viewer-preview-description';
  description.textContent = 'Hide design controls while keeping the currently selected design.';
  entry.append(enter, description); options.before(entry);

  const exit = document.createElement('button'); exit.type = 'button'; exit.id = 'viewer-preview-exit';
  exit.className = 'viewer-preview-exit'; exit.textContent = 'Exit viewer preview · Esc'; exit.hidden = true;
  exit.title = 'Return to editing. Design choices and privacy settings stay unchanged.';
  document.body.append(exit);
  let viewing = false, previousFocus = null;

  function setViewer(enabled) {
    if (enabled === viewing) return;
    viewing = enabled;
    if (enabled) {
      previousFocus = document.activeElement && document.activeElement !== document.body ? document.activeElement : enter;
      document.body.dataset.viewerPreview = 'on'; entry.hidden = true; exit.hidden = false;
      exit.focus({ preventScroll: true });
    } else {
      delete document.body.dataset.viewerPreview; entry.hidden = false; exit.hidden = true;
      const target = previousFocus?.isConnected && !previousFocus.disabled ? previousFocus : enter;
      target.focus({ preventScroll: true }); previousFocus = null;
    }
  }
  enter.addEventListener('click', () => setViewer(true));
  exit.addEventListener('click', () => setViewer(false));
  document.addEventListener('keydown', event => {
    if (!viewing || event.key !== 'Escape') return;
    event.preventDefault(); setViewer(false);
  });
})();
