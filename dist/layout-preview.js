(() => {
  'use strict';
  if (document.getElementById('banner-layout-options')) return;
  const hero = document.querySelector('.rate-hero');
  const options = document.getElementById('display-options');
  const chart = document.getElementById('main-chart');
  if (!hero || !options || !chart || !hero.querySelector('.hero-copy') || !hero.querySelector('.hero-art')) return;
  let history = document.getElementById('main-history-section');
  if (!history) {
    // Support the previous approved markup without copying the chart or controls.
    const card = chart.closest('.chart-card');
    const comparison = card?.previousElementSibling?.classList.contains('chart-comparison-controls') ? card.previousElementSibling : null;
    const heading = comparison ? comparison.previousElementSibling : card?.previousElementSibling;
    if (!card || !heading?.classList.contains('section-heading') || !heading.querySelector('#range-buttons')) return;
    history = document.createElement('section');
    history.className = 'banner-preview-history';
    card.before(history);
    history.append(heading);
    if (comparison) history.append(comparison);
    history.append(card);
  }
  if (history.contains(hero) || hero.contains(history)) return;
  const origin = document.createComment('Main rate history original position');
  history.before(origin);
  const slot = document.createElement('div');
  slot.className = 'banner-preview-chart-slot';
  const controls = document.createElement('div');
  controls.id = 'banner-layout-options';
  controls.className = 'banner-layout-options';
  controls.setAttribute('role', 'group');
  controls.setAttribute('aria-label', 'Banner layout');
  const label = document.createElement('span');
  label.textContent = 'Banner layout';
  controls.append(label);
  const buttons = [];
  const key = 'astra-banner-layout';
  const orderKey = 'astra-banner-order';
  let order = 'chart-first';
  const swap = document.createElement('button');
  swap.type = 'button';
  swap.id = 'banner-order-toggle';
  swap.textContent = 'Rate first';
  swap.setAttribute('aria-controls', 'rate-section');
  swap.title = 'Swap the rate and chart, including their stacked order on smaller screens.';
  const apply = value => {
    const layout = value === 'chart' ? 'chart' : 'original';
    const moved = layout === 'chart' ? history.parentElement !== slot : history.parentNode !== origin.parentNode;
    const reordered = document.body.dataset.bannerOrder !== order;
    if (layout === 'chart') {
      if (order === 'rate-first') hero.querySelector('.hero-copy').after(slot);
      else hero.prepend(slot);
      if (history.parentElement !== slot) slot.append(history);
    } else {
      if (history.parentNode !== origin.parentNode) origin.after(history);
      slot.remove();
    }
    document.body.dataset.bannerLayout = layout;
    document.body.dataset.bannerOrder = order;
    swap.disabled = layout !== 'chart';
    swap.setAttribute('aria-pressed', String(order === 'rate-first'));
    for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.bannerLayoutChoice === layout));
    if (moved || (reordered && layout === 'chart')) document.dispatchEvent(new CustomEvent('astrabannerlayoutchange', { bubbles: true, detail: { layout, order } }));
  };
  for (const [value, title] of [['original', 'Art banner'], ['chart', 'Chart beside rate']]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.bannerLayoutChoice = value;
    button.textContent = title;
    button.setAttribute('aria-controls', 'rate-section');
    button.addEventListener('click', () => {
      apply(value);
      try { localStorage.setItem(key, value); } catch { /* Choice remains usable with blocked storage. */ }
    });
    controls.append(button);
    buttons.push(button);
  }
  swap.addEventListener('click', () => {
    order = order === 'rate-first' ? 'chart-first' : 'rate-first';
    apply(document.body.dataset.bannerLayout);
    try { localStorage.setItem(orderKey, order); } catch { /* Choice remains usable with blocked storage. */ }
  });
  controls.append(swap);
  const note = document.createElement('small');
  note.textContent = 'Saved in this browser only.';
  controls.append(note);
  options.append(controls);
  let saved;
  try { saved = localStorage.getItem(key); } catch { /* Preserve the original layout. */ }
  try { if (localStorage.getItem(orderKey) === 'rate-first') order = 'rate-first'; } catch { /* Use chart first. */ }
  apply(saved);
})();
