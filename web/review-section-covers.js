(() => {
  'use strict';
  // Temporary review presentation. Original nodes, anchors and calculations stay
  // in place; revealing them is a tab-only owner preview choice.
  if (document.querySelector('footer')?.dataset.footerPrivacyLock !== 'on') return;
  if (document.body.dataset.reviewSectionCovers === 'on') return;
  document.body.dataset.reviewSectionCovers = 'on';
  const sections = [
    ['view-method', 'Methodology'],
    ['view-market-comparison', 'Compare'],
  ];
  const states = [];
  let noticeRecord = null;
  function privateWorkspace() {
    try {
      const value = window.AstraPrivateWorkspace?.current?.();
      return !!value && Object.isFrozen(value) && Object.keys(value).sort().join(',') === 'expiresAt,mode,verified'
        && value.mode === 'private_workspace' && value.verified === true
        && Number.isSafeInteger(value.expiresAt) && value.expiresAt > Date.now() && value.expiresAt < 8640000000000000;
    } catch { return false; }
  }
  function install() { for (const [id, name] of sections) {
    const view = document.getElementById(id);
    if (!view || view.querySelector(':scope > .review-section-cover')) continue;
    const saved = states.find(state => state.view === view);
    if (saved) { view.prepend(saved.cover); paint(saved); continue; }
    const cover = document.createElement('div'); cover.className = 'review-section-cover';
    const title = document.createElement('h2'); title.textContent = '[ Being written up ]';
    title.setAttribute('aria-label', name + ': being written up');
    const controls = document.createElement('div'); controls.className = 'preview-controls review-cover-controls';
    const button = document.createElement('button'); button.type = 'button';
    button.textContent = 'Show preserved draft content'; button.setAttribute('aria-pressed', 'false');
    controls.append(button); cover.append(title, controls); view.prepend(cover);
    const state = {view, cover, button, revealed: false}; states.push(state);
    button.addEventListener('click', () => {
      if (privateWorkspace() || document.body.dataset.previewControlsLocked === 'true' || document.body.dataset.viewerPreview === 'on') return;
      state.revealed = !state.revealed; paint(state);
    });
    paint(state);
  }}
  function paint(state) {
    state.view.classList.toggle('review-section-covered', !state.revealed);
    state.view.dataset.reviewSectionRevealed = String(state.revealed);
    state.button.textContent = state.revealed ? 'Restore “Being written up” cover' : 'Show preserved draft content';
    state.button.setAttribute('aria-pressed', String(state.revealed));
  }
  function reconcilePresentation() {
    if (privateWorkspace()) {
      const notice = document.getElementById('review-demo-notice');
      if (!noticeRecord && notice?.classList.contains('review-demo-notice')) {
        const anchor = document.createComment('Private workspace review notice position');
        noticeRecord = {notice, anchor, parent: notice.parentNode, next: notice.nextSibling};
        notice.replaceWith(anchor);
      }
      for (const state of states) {
        state.cover.remove(); state.view.classList.remove('review-section-covered');
        delete state.view.dataset.reviewSectionRevealed;
      }
      return;
    }
    if (noticeRecord) {
      const {notice, anchor, parent, next} = noticeRecord;
      if (anchor.isConnected) anchor.replaceWith(notice);
      else if (parent?.isConnected) parent.insertBefore(notice, next?.parentNode === parent ? next : null);
      else document.body.prepend(notice);
      noticeRecord = null;
    }
    install();
    if (document.body.dataset.previewControlsLocked !== 'true') return;
    for (const state of states) if (state.revealed) {state.revealed = false; paint(state);}
  }
  reconcilePresentation();
  // Notification only. Authority is the viewer's validated getter, never event detail or a body marker.
  document.addEventListener('astraprivateworkspace', reconcilePresentation);
  new MutationObserver(reconcilePresentation).observe(document.body, {attributes: true, attributeFilter: ['data-preview-controls-locked'], childList: true, subtree: true});
})();
