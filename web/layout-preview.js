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
  const offers = document.getElementById('smega-section');
  const offersHeading = offers?.querySelector(':scope > .section-heading');
  const offersStats = document.getElementById('smega-stats');
  const offersChart = document.getElementById('smega-offer-chart');
  const canOffer = !!(offersHeading && offersStats?.parentElement === offers && offers.contains(offersChart) && !offers.contains(hero));
  const offersOrigin = document.createComment('Complete offer card original position');
  const offersNote = document.createElement('p'); offersNote.className = 'banner-offers-note';
  offersNote.textContent = 'Offers cannot change the calculated goods-based NX benchmark. This card keeps its source-dated summary and offer history together.';
  if (offers) offers.classList.add('banner-preview-offer-card');
  if (canOffer) offers.before(offersOrigin);
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
  swap.title = 'Swap the rate and selected chart or offer panel, including their stacked order on smaller screens.';
  const apply = value => {
    const layout = value === 'chart' ? 'chart' : value === 'offers' && canOffer ? 'offers' : 'original';
    const moved = layout === 'chart' ? history.parentElement !== slot : layout === 'offers' ? offers.parentElement !== slot : history.parentNode !== origin.parentNode || (canOffer && offers.parentNode !== offersOrigin.parentNode);
    const reordered = document.body.dataset.bannerOrder !== order;
    if (layout !== 'chart' && history.parentNode !== origin.parentNode) origin.after(history);
    if (canOffer && layout !== 'offers') {
      if (offers.parentNode !== offersOrigin.parentNode) offersOrigin.after(offers);
      offersNote.remove();
    }
    if (layout !== 'original') {
      if (order === 'rate-first') hero.querySelector('.hero-copy').after(slot);
      else hero.prepend(slot);
      if (layout === 'chart' && history.parentElement !== slot) slot.append(history);
      if (layout === 'offers') {
        if (offers.parentElement !== slot) slot.append(offers);
        if (!offers.contains(offersNote)) offers.append(offersNote);
      }
      slot.dataset.bannerPanel = layout;
    } else {
      slot.remove();
    }
    document.body.dataset.bannerLayout = layout;
    document.body.dataset.bannerOrder = order;
    swap.disabled = layout === 'original';
    swap.setAttribute('aria-pressed', String(order === 'rate-first'));
    for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.bannerLayoutChoice === layout));
    if (moved || (reordered && layout !== 'original')) document.dispatchEvent(new CustomEvent('astrabannerlayoutchange', { bubbles: true, detail: { layout, order } }));
  };
  for (const [value, title] of [['original', 'Art banner'], ['chart', 'Chart beside rate'], ['offers', 'Offers beside rate']]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.bannerLayoutChoice = value;
    button.textContent = title;
    if (value === 'offers' && !canOffer) { button.disabled = true; button.title = 'The offer summary is unavailable in this page.'; }
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
