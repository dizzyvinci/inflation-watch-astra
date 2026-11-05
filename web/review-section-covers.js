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
  function install() { for (const [id, name] of sections) {
    const view = document.getElementById(id);
    if (!view || view.querySelector(':scope > .review-section-cover')) continue;
    const cover = document.createElement('div'); cover.className = 'review-section-cover';
    const title = document.createElement('h2'); title.textContent = '[ Being written up ]';
    title.setAttribute('aria-label', name + ': being written up');
    const controls = document.createElement('div'); controls.className = 'preview-controls review-cover-controls';
    const button = document.createElement('button'); button.type = 'button';
    button.textContent = 'Show preserved draft content'; button.setAttribute('aria-pressed', 'false');
    controls.append(button); cover.append(title, controls); view.prepend(cover);
    const state = {view, cover, button, revealed: false}; states.push(state);
    button.addEventListener('click', () => {
      if (document.body.dataset.previewControlsLocked === 'true' || document.body.dataset.viewerPreview === 'on') return;
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
  install();
  new MutationObserver(() => {
    install();
    if (document.body.dataset.previewControlsLocked !== 'true') return;
    for (const state of states) if (state.revealed) {state.revealed = false; paint(state);}
  }).observe(document.body, {attributes: true, attributeFilter: ['data-preview-controls-locked'], childList: true, subtree: true});
})();
