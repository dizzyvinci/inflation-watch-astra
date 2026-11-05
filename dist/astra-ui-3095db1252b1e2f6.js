'use strict';

;
/* Astra source: rolling-benchmark-preview.js */
try {
(() => {
  'use strict';
  if (window.AstraRollingBenchmark) return;
  const method = Object.freeze({ version: 1, windowDays: 7, defaultWindowDays: 7, allowedWindowDays: Object.freeze([3, 7]), minimumDailyCount: 5, minimumCashItemsPerDay: 3, minimumGoodsObservedCoverage: .8,
    units: 'modelled_mesos_per_NX', cashWeight: 'recorded daily item count', goodsMean: 'arithmetic mean of the selected complete-day fixed-basket MPI levels' });
  const positive = value => Number.isFinite(value) && value > 0;
  const day = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
  const shift = (value, days) => new Date(Date.parse(value + 'T00:00:00Z') + days * 86400000).toISOString().slice(0, 10);
  const clock = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
  const validPoint = point => point && day(point.day) && positive(point.cpi) && Number.isFinite(point.coverage) && point.coverage + 1e-12 >= method.minimumGoodsObservedCoverage && point.coverage <= 1 + 1e-9 && clock(point.at) && point.at.slice(0, 10) === point.day;
  const failure = (date, reason, details = {}) => ({ available: false, day: date || null, rate: null, reason, ...details });
  function index(report) {
    const source = clock(report?.sourceUpdatedAt) && day(report.sourceUpdatedAt.slice(0, 10)) ? report.sourceUpdatedAt.slice(0, 10) : null;
    const goods = new Map(), goodsConflicts = new Set(), cashDays = new Map();
    for (const point of Array.isArray(report?.history) ? report.history : []) {
      if (!point || !day(point.day)) continue;
      const prior = goods.get(point.day);
      if (prior && ['cpi', 'coverage', 'partial', 'at'].some(key => prior[key] !== point[key])) goodsConflicts.add(point.day);
      else goods.set(point.day, point);
    }
    for (const date of goodsConflicts) goods.delete(date);
    const cash = Array.isArray(report?.cash) ? report.cash : [], slugs = new Set(), names = new Set();
    let scheduleValid = cash.length >= method.minimumCashItemsPerDay;
    for (const row of cash) {
      if (!row || typeof row.slug !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(row.slug) || typeof row.name !== 'string' || !positive(row.nx) || slugs.has(row.slug) || names.has(row.name)) { scheduleValid = false; continue; }
      slugs.add(row.slug); names.add(row.name);
      const points = new Map(), conflicts = new Set();
      for (const point of Array.isArray(row.history) ? row.history : []) {
        if (!Array.isArray(point) || !day(point[0])) continue;
        const previous = points.get(point[0]);
        if (previous && (previous[1] !== point[1] || previous[2] !== point[2])) conflicts.add(point[0]);
        else points.set(point[0], point);
      }
      for (const [date, point] of points) {
        if (conflicts.has(date) || !positive(point[1]) || !Number.isSafeInteger(point[2]) || point[2] < method.minimumDailyCount) continue;
        const rate = point[1] / row.nx, weighted = rate * point[2];
        if (!positive(rate) || !Number.isFinite(weighted)) continue;
        if (!cashDays.has(date)) cashDays.set(date, { items: 0, quantity: 0, weightedRateSum: 0 });
        const total = cashDays.get(date); total.items++; total.quantity += point[2]; total.weightedRateSum += weighted;
      }
    }
    return { source, goods, cashDays, scheduleValid, configuredCashItems: cash.length };
  }
  function point(report, idx, date, days) {
    if (!method.allowedWindowDays.includes(days)) return failure(date, 'Only three- or seven-complete-day anchors are supported');
    if (!idx.source || !day(date) || date > idx.source) return failure(date, 'Source-calendar date unavailable');
    const current = idx.goods.get(date);
    if (!validPoint(current)) return failure(date, 'Current fixed-goods MPI or ≥80% same-day observed weight unavailable');
    if (!idx.scheduleValid) return failure(date, 'Configured known-NX schedule missing or ambiguous');
    const startDay = shift(date, -days), endDay = shift(date, -1), anchorDays = [], mpi = [];
    let quantity = 0, weighted = 0;
    for (let offset = -days; offset < 0; offset++) {
      const anchorDay = shift(date, offset), goods = idx.goods.get(anchorDay), cash = idx.cashDays.get(anchorDay);
      if (!validPoint(goods) || goods.partial === true) return failure(date, `${days} complete qualified fixed-goods MPI days required`, { missingDay: anchorDay, startDay, endDay, windowDays: days });
      if (!cash || cash.items < method.minimumCashItemsPerDay || !Number.isSafeInteger(cash.quantity) || !positive(cash.weightedRateSum)) return failure(date, 'At least three qualified known-NX items required on every anchor day', { missingDay: anchorDay, startDay, endDay });
      mpi.push(goods.cpi); quantity += cash.quantity; weighted += cash.weightedRateSum;
      anchorDays.push({ day: anchorDay, mpi: goods.cpi, goodsObservedCoverage: goods.coverage, cashItems: cash.items, cashQuantity: cash.quantity, cashRate: cash.weightedRateSum / cash.quantity });
    }
    const meanMpi = mpi.reduce((sum, value) => sum + value, 0) / days, cashAnchor = weighted / quantity, rate = cashAnchor * current.cpi / meanMpi;
    if (!Number.isSafeInteger(quantity) || ![meanMpi, cashAnchor, rate].every(positive)) return failure(date, 'Finite rolling-anchor arithmetic unavailable');
    const changePercent = (current.cpi / meanMpi - 1) * 100, fixedRate = positive(report?.baseNxRate) ? report.baseNxRate * current.cpi / 100 : null;
    if (!Number.isFinite(changePercent)) return failure(date, 'Finite rolling comparison unavailable');
    return { available: true, day: date, at: current.at, partial: current.partial === true, rate, changePercent, currentMpi: current.cpi,
      goodsObservedCoverage: current.coverage, cashAnchor, meanMpi, cashQuantity: quantity, configuredCashItems: idx.configuredCashItems,
      startDay, endDay, endExclusive: date, windowDays: days, anchorDays, fixedRate: positive(fixedRate) ? fixedRate : null, sourceUpdatedAt: report.sourceUpdatedAt,
      units: method.units, kind: `prior_${days}_complete_days_cash_anchored_goods_model` };
  }
  function calculate(report, { day: requestedDay, windowDays: requestedDays = windowDays } = {}) {
    const idx = index(report), date = requestedDay ?? report?.latest?.day ?? idx.source;
    return point(report, idx, date, requestedDays);
  }
  function history(report, { windowDays: requestedDays = windowDays } = {}) {
    const idx = index(report);
    return [...idx.goods.keys()].sort().map(date => point(report, idx, date, requestedDays));
  }
  function frozenPoint(report, date = report?.latest?.day) {
    const idx = index(report), current = idx.goods.get(date);
    const rate = positive(report?.baseNxRate) && positive(current?.cpi) ? report.baseNxRate * current.cpi / 100 : null;
    return idx.source && day(date) && date <= idx.source && positive(rate) && clock(current?.at) && current.at.slice(0, 10) === date ? { available: true, rate, day: date, at: current.at, partial: current.partial === true,
      currentMpi: current.cpi, changePercent: (current.cpi / 100 - 1) * 100, baseNxRate: report.baseNxRate, units: method.units } : failure(date, 'Positive fixed reference NX rate and goods MPI required');
  }
  const key = 'astra-goods-nx-benchmark-mode-v1', explanationKey = 'astra-rolling-benchmark-explanation-v1', daysKey = 'astra-goods-nx-anchor-days-v1', whyThreeKey = 'astra-benchmark-why-three-v1', inflationPhraseKey = 'astra-benchmark-inflation-phrase-v1', modes = new Set(['rolling', 'fixed', 'compare']);
  let mode = 'rolling', windowDays = 7, showExplanation = false, showWhyThree = true, showInflationPhrase = true, controls, note, explanationButton, whyThreeButton, inflationPhraseButton;
  try { const saved = localStorage.getItem(key); if (modes.has(saved)) mode = saved; const days = Number(localStorage.getItem(daysKey)); if (method.allowedWindowDays.includes(days)) windowDays = days; showExplanation = localStorage.getItem(explanationKey) === 'on'; } catch { /* User-approved weekly rolling default; math text stays off. */ }
  try { showWhyThree = localStorage.getItem(whyThreeKey) !== 'off'; showInflationPhrase = localStorage.getItem(inflationPhraseKey) !== 'off'; } catch { /* Concise notes remain on without storage. */ }
  const getState = () => ({ mode, windowDays, showExplanation, showWhyThree, showInflationPhrase });
  function decorateExplanations() {
    for (const target of document.querySelectorAll('.hero-benchmark-explanation, [data-nx-model-description]')) {
      target.querySelector('[data-benchmark-inflation-copy]')?.remove();
      if (showInflationPhrase && target.textContent.trim()) {
        const wrapper = document.createElement('span'); wrapper.dataset.benchmarkInflationCopy = '';
        const phrase = document.createElement('strong'); phrase.className = 'benchmark-inflation-phrase'; phrase.textContent = '(amount required to combat inflation)';
        const qualification = document.createElement('small'); qualification.className = 'benchmark-inflation-qualification'; qualification.textContent = 'This describes offsetting the selected basket’s purchasing-power loss, not controlling inflation or meso supply.';
        wrapper.append(' ', phrase, qualification); target.append(wrapper);
      }
      let why = target.nextElementSibling;
      if (!why?.matches('[data-benchmark-why-three]')) { why = document.createElement('p'); why.dataset.benchmarkWhyThree = ''; why.className = 'benchmark-why-three'; target.after(why); }
      why.textContent = 'Why 3 days? A shorter anchor follows recent source evidence sooner, but uses fewer observations and can be noisier than the 7-day anchor. Both use complete source-calendar days; goods-basket weights remain fixed.';
      why.hidden = !showWhyThree || windowDays !== 3 || mode === 'fixed' || !target.textContent.trim();
    }
  }
  let decorationQueued = false;
  function queueDecoration() { if (decorationQueued) return; decorationQueued = true; queueMicrotask(() => { decorationQueued = false; decorateExplanations(); }); }
  document.addEventListener('astramarketsnapshot', queueDecoration);
  function headline(report) {
    const rolling = calculate(report), fixed = frozenPoint(report), requestedMode = mode;
    if (mode === 'rolling' && rolling.available) return { ...rolling, mode: 'rolling', requestedMode, label: `Rolling-anchor goods NX benchmark · ${windowDays} complete days`, changeLabel: `vs previous ${windowDays} complete source days`, observed: false };
    const fallback = mode === 'rolling';
    return { ...fixed, mode: fallback ? 'fixed_fallback' : mode, requestedMode,
      label: fallback ? 'Reference-week NX benchmark · rolling anchor unavailable' : 'Reference-week goods NX benchmark',
      changeLabel: 'vs fixed reference week', fallbackReason: fallback ? rolling.reason : null, observed: false };
  }
  function series(report) {
    const effective = headline(report).mode, fixed = { id: 'fixed', label: effective === 'fixed_fallback' ? 'Reference-week model · rolling fallback' : 'Reference-week goods NX benchmark', points: [] };
    const idx = index(report);
    if (effective !== 'rolling') for (const point of [...idx.goods.values()].sort((a, b) => a.day.localeCompare(b.day))) {
      const value = positive(report?.baseNxRate) && positive(point?.cpi) ? report.baseNxRate * point.cpi / 100 : null;
      if (idx.source && point.day <= idx.source && positive(value) && clock(point.at) && point.at.slice(0, 10) === point.day) fixed.points.push({ day: point.day, at: point.at, value, partial: point.partial === true });
    }
    if (effective === 'fixed' || effective === 'fixed_fallback') return [fixed];
    const rolling = { id: 'rolling', label: `Prior-${windowDays}-day cash-anchored goods NX benchmark`, points: history(report).filter(point => point.available).map(point => ({ day: point.day, at: point.at, value: point.rate, partial: point.partial, windowDays: point.windowDays, anchorStart: point.startDay, anchorEnd: point.endDay, cashAnchor: point.cashAnchor, meanMpi: point.meanMpi })) };
    return effective === 'compare' ? [fixed, rolling] : [rolling];
  }
  function apply() {
    if (controls) {
      for (const button of controls.querySelectorAll('[data-benchmark-mode]')) button.setAttribute('aria-pressed', String(button.dataset.benchmarkMode === mode));
      for (const button of controls.querySelectorAll('[data-benchmark-days]')) button.setAttribute('aria-pressed', String(Number(button.dataset.benchmarkDays) === windowDays));
      explanationButton.setAttribute('aria-pressed', String(showExplanation)); explanationButton.textContent = showExplanation ? 'Rolling calculation explanation: On' : 'Rolling calculation explanation: Off'; note.hidden = !showExplanation;
      whyThreeButton.setAttribute('aria-pressed', String(showWhyThree)); whyThreeButton.textContent = `Why 3 days note: ${showWhyThree ? 'On' : 'Off'}`;
      inflationPhraseButton.setAttribute('aria-pressed', String(showInflationPhrase)); inflationPhraseButton.textContent = `Inflation parenthetical: ${showInflationPhrase ? 'On' : 'Off'}`;
      note.textContent = `Rolling anchor = the prior ${windowDays} complete source-calendar days’ qualified known-NX cash-item rates, weighted by recorded item count. Multiply this anchor by today’s fixed-goods MPI divided by the arithmetic mean of those ${windowDays} MPI levels. Every anchor day needs at least three cash items with daily count ≥5; all ${windowDays + 1} goods points need ≥80% same-day observed basket weight. Goods MPI keeps its existing dated carry-forward rules. This model reanchors to observed cash composition, supply and demand; it does not remove those effects or produce an executable quote. No fees, smega offers, rolling scanner medians or unknown-NX cosmetics enter this calculation. Early/missing windows stay unavailable; an explicit reference-week fallback is labelled separately.`;
    }
    document.dispatchEvent(new CustomEvent('astrabenchmarkmodechange', { detail: getState() }));
    decorateExplanations(); queueDecoration();
  }
  function setMode(value) {
    if (!modes.has(value)) return false;
    mode = value; try { localStorage.setItem(key, mode); } catch { /* Tab choice remains usable. */ } apply(); return true;
  }
  function setWindowDays(value) { if (!method.allowedWindowDays.includes(value)) return false; windowDays = value; try { localStorage.setItem(daysKey, String(value)); } catch { /* Tab choice remains usable. */ } apply(); return true; }
  window.AstraRollingBenchmark = Object.freeze({ method, calculate, history, frozenPoint, headline, series, getState, setMode, setWindowDays });
  const options = document.getElementById('display-options');
  if (!options || document.getElementById('rolling-benchmark-options')) return;
  controls = document.createElement('fieldset'); controls.id = 'rolling-benchmark-options'; controls.className = 'rolling-benchmark-options'; controls.dataset.previewControls = 'rolling-benchmark';
  const legend = document.createElement('legend'); legend.textContent = 'Goods-based NX model'; controls.append(legend);
  const buttons = document.createElement('div'); buttons.className = 'rolling-benchmark-choices'; buttons.setAttribute('role', 'group'); buttons.setAttribute('aria-label', 'Goods NX benchmark anchor');
  for (const [value, label] of [['rolling', 'Rolling anchor · headline + chart'], ['fixed', 'Fixed reference · revert'], ['compare', 'Compare charts · fixed headline']]) { const button = document.createElement('button'); button.type = 'button'; button.dataset.benchmarkMode = value; button.textContent = label; button.addEventListener('click', () => setMode(value)); buttons.append(button); }
  const days = document.createElement('div'); days.className = 'rolling-benchmark-choices'; days.setAttribute('role', 'group'); days.setAttribute('aria-label', 'Rolling NX anchor complete-day lookback');
  for (const count of [7, 3]) { const button = document.createElement('button'); button.type = 'button'; button.dataset.benchmarkDays = String(count); button.textContent = count === 7 ? 'Previous 7 complete days · week' : 'Previous 3 complete days'; button.addEventListener('click', () => setWindowDays(count)); days.append(button); }
  explanationButton = document.createElement('button'); explanationButton.type = 'button'; explanationButton.setAttribute('aria-controls', 'rolling-benchmark-explanation'); explanationButton.addEventListener('click', () => { showExplanation = !showExplanation; try { localStorage.setItem(explanationKey, showExplanation ? 'on' : 'off'); } catch { /* Local tab still works. */ } apply(); });
  note = document.createElement('p'); note.id = 'rolling-benchmark-explanation'; note.className = 'rolling-benchmark-explanation';
  const caution = document.createElement('small'); caution.textContent = 'Rolling is modelled, not a cash-sale quote. Compare charts keeps the fixed-reference headline; source dates and cash-item pages stay separate.';
  whyThreeButton = document.createElement('button'); whyThreeButton.type = 'button'; whyThreeButton.dataset.benchmarkNoteToggle = 'why-three'; whyThreeButton.addEventListener('click', () => { showWhyThree = !showWhyThree; try { localStorage.setItem(whyThreeKey, showWhyThree ? 'on' : 'off'); } catch {} apply(); });
  inflationPhraseButton = document.createElement('button'); inflationPhraseButton.type = 'button'; inflationPhraseButton.dataset.benchmarkNoteToggle = 'inflation-phrase'; inflationPhraseButton.addEventListener('click', () => { showInflationPhrase = !showInflationPhrase; try { localStorage.setItem(inflationPhraseKey, showInflationPhrase ? 'on' : 'off'); } catch {} apply(); });
  controls.append(buttons, days, explanationButton, caution, note, whyThreeButton, inflationPhraseButton); options.append(controls); apply();
})();

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "rolling-benchmark-preview.js", status: "initialization_failed"}})); } catch {}
}

;
/* Astra source: layout-preview.js */
try {
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

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "layout-preview.js", status: "initialization_failed"}})); } catch {}
}

;
/* Astra source: chart-interaction.js */
try {
(() => {
  'use strict';
  if (document.documentElement.dataset.chartInspectorLoaded) return;
  document.documentElement.dataset.chartInspectorLoaded = 'true';
  const NS = 'http://www.w3.org/2000/svg';
  const states = new Set();
  const managed = new WeakSet();
  let serial = 0;
  let queued = false;
  const number = new Intl.NumberFormat(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const displayValue = value => number.format(Math.abs(value) < .05 ? 0 : value);
  // Legacy labels lack numeric metadata. Round only decimal values with a known
  // unit (or at the end), leaving dates, source hours and explanatory text intact.
  const legacyLabel = text => text.replace(/([+-]?(?:\d{1,3}(?:,\d{3})+|\d+)\.\d+)(?=\s*(?:%|mesos\b|NX\b|index points\b|units\b|$))/g,
    raw => displayValue(Number(raw.replaceAll(',', ''))));

  function box(svg) {
    const values = (svg.getAttribute('viewBox') || '').trim().split(/[ ,]+/).map(Number);
    return values.length === 4 && values.every(Number.isFinite) && values[2] > 0 && values[3] > 0
      ? { x: values[0], y: values[1], width: values[2], height: values[3] }
      : { x: 0, y: 0, width: svg.clientWidth || 1, height: svg.clientHeight || 1 };
  }
  function mapping(svg) {
    const rect = svg.getBoundingClientRect();
    const view = box(svg);
    let sx = rect.width / view.width;
    let sy = rect.height / view.height;
    let ox = 0;
    let oy = 0;
    const aspect = svg.getAttribute('preserveAspectRatio') || 'xMidYMid meet';
    if (!aspect.includes('none')) {
      sx = sy = aspect.includes('slice') ? Math.max(sx, sy) : Math.min(sx, sy);
      ox = (rect.width - view.width * sx) * (aspect.includes('xMin') ? 0 : aspect.includes('xMax') ? 1 : .5);
      oy = (rect.height - view.height * sy) * (aspect.includes('YMin') ? 0 : aspect.includes('YMax') ? 1 : .5);
    }
    return { rect, view, sx: sx || 1, sy: sy || 1, ox, oy };
  }
  function localPoint(svg, clientX, clientY) {
    try {
      const matrix = svg.getScreenCTM?.();
      if (matrix && svg.createSVGPoint) {
        const point = svg.createSVGPoint();
        point.x = clientX; point.y = clientY;
        const local = point.matrixTransform(matrix.inverse());
        if (Number.isFinite(local.x) && Number.isFinite(local.y)) return local;
      }
    } catch { /* Use viewBox mapping when native SVG geometry is unavailable. */ }
    const m = mapping(svg);
    return { x: (clientX - m.rect.left - m.ox) / m.sx + m.view.x,
      y: (clientY - m.rect.top - m.oy) / m.sy + m.view.y };
  }
  function label(circle) {
    const d = circle.dataset;
    const title = circle.querySelector('title');
    let text;
    if (d.chartValue !== undefined) {
      const date = d.chartDateLabel || d.chartDate || '';
      const precision = d.chartDatePrecision === 'day' ? 'source time unspecified' : '';
      const value = d.chartValue.trim() ? Number(d.chartValue) : NaN;
      const measurement = Number.isFinite(value)
        ? `${displayValue(value)}${d.chartUnit ? ' ' + d.chartUnit : ''}` : 'unavailable';
      text = [d.chartSeries, date, precision, measurement, d.chartNote].filter(Boolean).join(' · ');
    } else text = legacyLabel(d.chartLabel || title?.textContent.trim() || '');
    if (title && title.textContent !== text) title.textContent = text;
    return text;
  }
  function enhance(svg) {
    if (managed.has(svg)) return;
    const points = [...svg.querySelectorAll('circle')].map(circle => ({
      x: Number(circle.getAttribute('cx')), y: Number(circle.getAttribute('cy')), label: label(circle),
    })).filter(point => Number.isFinite(point.x) && Number.isFinite(point.y) && point.label)
      .sort((a, b) => a.x - b.x || a.y - b.y);
    if (!points.length) return;
    managed.add(svg);
    const host = svg.closest('.chart') || svg.parentElement;
    if (!host) return;
    host.classList.add('chart-inspector-host');
    svg.classList.add('chart-inspector-ready');
    if (!svg.hasAttribute('tabindex')) svg.setAttribute('tabindex', '0');
    const chartName = svg.getAttribute('aria-label') || host.getAttribute('aria-label') || svg.querySelector('title')?.textContent || 'Chart';
    if (!svg.hasAttribute('aria-label') && !svg.hasAttribute('aria-labelledby')) svg.setAttribute('aria-label', chartName);
    const id = `chart-inspector-${++serial}`;
    const ui = document.createElement('div');
    ui.className = 'chart-inspector-ui';
    const toggle = document.createElement('button');
    toggle.type = 'button'; toggle.className = 'chart-inspector-toggle';
    toggle.textContent = 'Follow: on'; toggle.setAttribute('aria-pressed', 'true');
    toggle.setAttribute('aria-label', `${chartName}: follow nearest observation`);
    const tooltip = document.createElement('output');
    tooltip.id = id; tooltip.className = 'chart-inspector-tooltip'; tooltip.hidden = true;
    tooltip.setAttribute('role', 'status'); tooltip.setAttribute('aria-live', 'polite');
    const instructions = document.createElement('span');
    instructions.id = `${id}-help`; instructions.className = 'chart-inspector-help';
    instructions.textContent = 'Move across the chart to inspect a recorded point. Arrow keys move between points; Home and End jump to the edges. Click or tap to pin or unpin; Escape clears the selection.';
    const described = svg.getAttribute('aria-describedby');
    svg.setAttribute('aria-describedby', [described, instructions.id, id].filter(Boolean).join(' '));
    ui.append(toggle, tooltip, instructions); host.append(ui);
    const guide = document.createElementNS(NS, 'g');
    guide.classList.add('chart-inspector-guide'); guide.setAttribute('aria-hidden', 'true');
    guide.style.display = 'none';
    const line = document.createElementNS(NS, 'line');
    const mark = document.createElementNS(NS, 'circle');
    mark.setAttribute('r', '5');
    guide.append(line, mark); svg.append(guide);
    let index = -1;
    let pinned = false;
    let follow = true;
    const state = { svg, ui, host };
    states.add(state);
    const hide = () => {
      index = -1; pinned = false; guide.style.display = 'none'; tooltip.hidden = true;
      host.classList.remove('chart-inspector-pinned');
    };
    const show = next => {
      index = Math.max(0, Math.min(points.length - 1, next));
      const point = points[index];
      const clip = svg.querySelector('clipPath rect');
      const view = box(svg);
      const top = clip ? Number(clip.getAttribute('y')) : view.y;
      const bottom = clip ? top + Number(clip.getAttribute('height')) : view.y + view.height;
      line.setAttribute('x1', point.x); line.setAttribute('x2', point.x);
      line.setAttribute('y1', top); line.setAttribute('y2', bottom);
      mark.setAttribute('cx', point.x); mark.setAttribute('cy', point.y);
      guide.style.display = ''; tooltip.hidden = false;
      const text = `${point.label}${pinned ? ' · pinned' : ''}`;
      if (tooltip.textContent !== text) tooltip.textContent = text;
      host.classList.toggle('chart-inspector-pinned', pinned);
      const m = mapping(svg);
      const hostRect = host.getBoundingClientRect();
      const left = m.rect.left - hostRect.left + m.ox + (point.x - m.view.x) * m.sx;
      const width = host.clientWidth || hostRect.width || m.rect.width;
      const tipWidth = tooltip.offsetWidth || Math.min(300, width - 16);
      tooltip.style.left = `${Math.max(8, Math.min(left + 12, width - tipWidth - 8))}px`;
    };
    const nearest = event => {
      const at = localPoint(svg, event.clientX, event.clientY);
      let best = 0; let dx = Infinity; let dy = Infinity;
      points.forEach((point, i) => {
        const distanceX = Math.abs(point.x - at.x);
        const distanceY = Math.abs(point.y - at.y);
        if (distanceX < dx - 1e-6 || (Math.abs(distanceX - dx) <= 1e-6 && distanceY < dy)) {
          best = i; dx = distanceX; dy = distanceY;
        }
      });
      return best;
    };
    svg.addEventListener('pointermove', event => {
      if (follow && !pinned && event.pointerType !== 'touch') show(nearest(event));
    });
    svg.addEventListener('pointerleave', () => { if (!pinned) hide(); });
    svg.addEventListener('click', event => {
      const next = nearest(event);
      pinned = !(pinned && index === next);
      show(next);
      svg.focus({ preventScroll: true });
    });
    svg.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); hide(); return; }
      let next;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = index < 0 ? 0 : index + 1;
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = index < 0 ? points.length - 1 : index - 1;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = points.length - 1;
      else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault(); pinned = !pinned; show(index < 0 ? 0 : index); return;
      } else return;
      event.preventDefault(); show(next);
    });
    svg.addEventListener('blur', () => { if (!pinned) hide(); });
    toggle.addEventListener('click', () => {
      follow = !follow;
      toggle.textContent = `Follow: ${follow ? 'on' : 'off'}`;
      toggle.setAttribute('aria-pressed', String(follow));
      hide();
    });
  }
  function scan() {
    queued = false;
    for (const state of states) {
      if (!state.svg.isConnected) {
        state.ui.remove(); state.host.classList.remove('chart-inspector-pinned'); states.delete(state);
      }
    }
    document.querySelectorAll('.chart svg, svg[data-chart-inspector]').forEach(enhance);
  }
  const observer = new MutationObserver(() => {
    if (!queued) { queued = true; queueMicrotask(scan); }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  scan();
})();

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "chart-interaction.js", status: "initialization_failed"}})); } catch {}
}

;
/* Astra source: market-highlights.js */
try {
(() => {
  'use strict';
  const options = document.getElementById('display-options');
  const navigation = document.querySelector('.nav-wrap');
  if (!options || !navigation || document.getElementById('market-highlights')) return;
  const key = 'astra-market-highlights-v1';
  let enabled = true, paused = false, report, calculationDetail = false, showPublication = false, showContext = false, abbreviations = true;
  try { enabled = localStorage.getItem(key) !== 'off'; } catch { /* Default On without persistent storage. */ }
  try { abbreviations = localStorage.getItem('astra-highlights-abbreviations-v1') !== 'off'; } catch { /* Compact helpers default On. */ }
  const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const control = make('div', 'hero-layout-options market-highlights-options');
  control.setAttribute('role', 'group'); control.setAttribute('aria-label', 'Header market highlights');
  const toggle = make('button'); toggle.type = 'button'; toggle.setAttribute('aria-controls', 'market-highlights');
  control.append(toggle, make('small', '', 'Dated aggregates, not a live sales tape. Saved in this browser only.'));
  options.append(control);
  const panel = make('section', 'market-highlights'); panel.id = 'market-highlights';
  panel.setAttribute('aria-label', 'Dated market highlights');
  const heading = make('div', 'market-highlights-heading');
  const publication = make('span', 'market-highlights-publication');
  publication.id='market-highlights-source-publication';publication.hidden=true;
  const pause = make('button', 'market-highlights-pause'); pause.type = 'button';
  pause.setAttribute('aria-controls', 'market-highlights-track');
  heading.append(make('strong', '', 'Did you know?'), publication, pause);
  const viewport = make('div', 'market-highlights-viewport');
  const track = make('div', 'market-highlights-track'); track.id = 'market-highlights-track';
  viewport.append(track); panel.append(heading, viewport);
  navigation.after(panel);
  const page = make('section', 'view highlights-page'); page.id = 'view-highlights'; page.hidden = true;
  page.setAttribute('aria-labelledby', 'highlights-title');
  const pageHeading = make('div', 'page-heading'), pageHeadingCopy = make('div');
  const title = make('h1', '', 'Highlights & Activity'); title.id = 'highlights-title';
  pageHeadingCopy.append(make('p', 'eyebrow', 'DATED AGGREGATES / VISIBLE COVERAGE'), title,
    make('p', '', 'Standout observations in the fixed basket, plus hourly NX offer activity.'));
  pageHeading.append(pageHeadingCopy);
  const pagePublication = make('p', 'highlights-page-publication');
  pagePublication.id='highlights-source-publication';pagePublication.hidden=true;
  const cards = make('div', 'highlights-fact-grid');
  cards.id = 'highlights-fact-grid';
  const transactionNote = make('p', 'highlights-evidence-note', 'Individual-transaction trivia is pending: this snapshot contains no qualified individual transaction records. A daily median, recorded count or high/low price cannot identify a largest completed sale.');
  const activity = make('section', 'highlights-activity');
  const activityTitle = make('h2', '', 'Hourly NX offer activity'); activityTitle.id = 'highlights-activity-title';
  activity.setAttribute('aria-labelledby', activityTitle.id);
  const activityScope = make('p', 'highlights-activity-scope');
  const activityStats = make('div', 'highlights-activity-stats');
  const countCard = make('article', 'chart-card hourly-history-card highlights-count-card');
  const countTitle = make('h3', '', 'Poster counts by source hour');
  const countLegend = make('p', 'highlights-count-legend', 'Gold: sellers posting · Mint: buyers posting. Gaps mean missing or conflicting counts, not zero activity.');
  const countChart = make('div', 'highlights-count-chart');
  countChart.setAttribute('role', 'img'); countChart.setAttribute('aria-label', 'Last 24 source-hour seller and buyer poster counts; accessible values follow in the table');
  countCard.append(countTitle, countLegend, countChart);
  const activityTable = make('div', 'table-wrap highlights-activity-table');
  activity.append(activityTitle, activityScope, activityStats, countCard, activityTable,
    make('p', 'highlights-evidence-note', 'These are source-published poster counts for each UTC hour, not completed trades, unique people across hours, meso turnover or total server activity. A poster can appear in multiple hours or on both sides. Missing buckets and sides are left missing.'));
  const overview = make('p', 'highlights-overview-link'), overviewLink = make('a', '', 'View estimated meso turnover on Overview →');
  overviewLink.href = '#volume-title'; overview.append(overviewLink);
  page.append(pageHeading, pagePublication, cards, transactionNote, activity, overview);
  const calculationControls=make('div','highlights-detail-controls'),calculationToggle=make('button','','Show calculation details');calculationControls.dataset.previewControls='true';
  calculationToggle.type='button';calculationToggle.setAttribute('aria-pressed','false');calculationToggle.setAttribute('aria-controls','highlights-fact-grid market-highlights-track');calculationControls.append(calculationToggle);page.append(calculationControls);
  const publicationToggle=make('button','','Show source publication');publicationToggle.type='button';publicationToggle.setAttribute('aria-pressed','false');publicationToggle.setAttribute('aria-controls','highlights-source-publication market-highlights-source-publication');calculationControls.append(publicationToggle);
  const contextToggle=make('button','','Show Wolbi context');contextToggle.type='button';contextToggle.setAttribute('aria-pressed','false');contextToggle.setAttribute('aria-controls','highlights-fact-grid market-highlights-track');calculationControls.append(contextToggle);
  const abbreviationToggle=make('button');abbreviationToggle.type='button';abbreviationToggle.dataset.highlightsAbbreviations='true';abbreviationToggle.setAttribute('aria-controls','highlights-fact-grid market-highlights-track');
  document.getElementById('content').append(page);
  const navLink = make('a', 'nav-link', 'Highlights & Activity'); navLink.href = '#highlights';
  const nav = navigation.querySelector('nav'), fallback = nav.querySelector('.fallback-link');
  if (fallback) fallback.before(navLink); else nav.append(navLink);
  document.getElementById('volume-title')?.setAttribute('tabindex', '-1');
  const number = value => value.toLocaleString('en-US', { maximumFractionDigits: 0 });
  const positive = value => Number.isFinite(value) && value > 0;
  const day = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
  const largest = (rows, key) => rows.filter(row => Number.isFinite(row[key])).sort((a, b) => b[key] - a[key] || String(a.slug).localeCompare(String(b.slug)))[0];
  function highlights(data) {
    const rows = (data.rows || []).filter(row => row.slug && /^[a-z0-9][a-z0-9-]*$/.test(row.slug) && row.name && day(row.priceDay) && positive(row.price));
    const sourceDay=day(String(data.sourceUpdatedAt||'').slice(0,10)),windowDays=Math.round((Date.parse(data.recentEndExclusive)-Date.parse(data.recentStart))/86400000);
    const items = [], add = (row, type, label, value, date, detail = '', direction = 'neutral', numericValue = null) => {
      if (!row)return;
      const carried=sourceDay&&row.priceDay<sourceDay,frame=type==='turnover'||type==='volume'?`${windowDays>0?windowDays+'-day window':'Recorded activity window'} · complete source-calendar days`:type==='change'?'Starting price level → latest qualifying price'+(carried?' · earlier price carried':''):carried?'Earlier qualifying daily observation':'Latest source-day observation';
      const provenance=type==='change'?`Reference week ${data.baseStart}–${data.baseEnd} · ${date}`:date;
      const essential=type==='context'?detail:'';
      const displayDate=type==='turnover'||type==='volume'?date:row.priceDay;
      const compact=Number.isFinite(numericValue)&&Math.abs(numericValue)>=1000?new Intl.NumberFormat('en-US',{notation:'compact',compactDisplay:'short',maximumFractionDigits:1}).format(numericValue):null;
      items.push({ slug:row.slug,name:row.name,type,label,value,compact,date:provenance,displayDate,detail,direction,frame,essential,summary:`${label}: ${row.name} · ${value} · ${displayDate} · ${frame}${essential?' · '+essential:''}`,text:`${label}: ${row.name} · ${value} · ${provenance}${detail?' · '+detail:''}` });
    };
    const expensive = largest(rows.filter(row => positive(row.quantity)), 'price');
    if (expensive) add(expensive, 'median', 'Largest basket daily median', `${number(expensive.price)} mesos / ${expensive.unit || 'unit'}`, `${expensive.priceDay} · ${number(expensive.quantity)} recorded volume`, 'Daily median, not an individual sale', 'neutral', expensive.price);
    const moved = rows.filter(row => Number.isFinite(row.changeBase)).sort((a, b) => Math.abs(b.changeBase) - Math.abs(a.changeBase) || String(a.slug).localeCompare(String(b.slug)))[0];
    if (moved) add(moved, 'change', 'Largest basket move vs reference week', `${moved.changeBase >= 0 ? '+' : ''}${moved.changeBase.toFixed(1)}%`, `price dated ${moved.priceDay}`, 'Change from fixed reference prices', moved.changeBase > 0 ? 'up' : moved.changeBase < 0 ? 'down' : 'flat');
    const end = day(data.recentEndExclusive), through = end ? new Date(Date.parse(end + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10) : null;
    if (day(data.recentStart) && through) {
      const scope = `${data.recentStart}–${through}`;
      const turnover = largest(rows.filter(row => positive(row.recentTurnoverProxy)), 'recentTurnoverProxy');
      if (turnover) add(turnover, 'turnover', 'Largest basket turnover proxy', `${number(turnover.recentTurnoverProxy)} mesos`, scope, 'daily median × recorded volume', 'neutral', turnover.recentTurnoverProxy);
      const volume = largest(rows.filter(row => positive(row.recentQuantity)), 'recentQuantity');
      if (volume) add(volume, 'volume', 'Most recorded basket volume', `${number(volume.recentQuantity)} recorded units/count`, scope, '', 'neutral', volume.recentQuantity);
    }
    const wolbi = (data.contextItems || []).find(row => row.slug === 'wolbi-throwing-stars' && day(row.priceDay) && positive(row.price) && row.notIndexed === true && row.weight === 0);
    if (showContext && wolbi) add(wolbi, 'context', 'Wolbi* context', `${number(wolbi.price)} mesos / ${wolbi.unit || 'unit'} daily median`, wolbi.priceDay, 'zero MPI weight · item-specific supply caveat, not broad deflation', 'neutral', wolbi.price);
    return items;
  }
  function highlightGraphic(item, includeKind, headingLevel) {
    const graphic = make('span', 'market-highlight-graphic'), image = make('img', 'market-highlight-sprite');
    image.alt = ''; image.setAttribute('aria-hidden', 'true'); image.width = image.height = 42; image.loading = 'lazy'; image.decoding = 'async';
    const fallback = 'assets/' + item.slug + '.svg', candidate = report?.spriteMap?.[item.slug];
    const src = typeof candidate === 'string' && /^assets\/[a-z0-9][a-z0-9._-]*\.(?:png|svg|webp)$/.test(candidate) ? candidate : fallback;
    image.addEventListener('error', () => { if (image.getAttribute('src') !== fallback) image.src = fallback; else image.hidden = true; }); image.src = src;
    const copy = make('span', 'market-highlight-copy'), fact = make('span', 'market-highlight-fact'),titleLine=make('span','market-highlight-title-line'),valueLine=make('span','market-highlight-value-line');
    if(headingLevel){titleLine.setAttribute('role','heading');titleLine.setAttribute('aria-level',String(headingLevel));}
    titleLine.append(make('strong','market-highlight-headline',item.label));
    valueLine.append(make('span','market-highlight-item-name',item.name),make('span','market-highlight-value',' · '+item.value));
    if(abbreviations&&item.compact)valueLine.append(make('span','market-highlight-abbreviation','('+item.compact+')'));
    if(item.direction!=='neutral')valueLine.append(make('span','market-highlight-direction',item.direction==='up'?'↑ Increased':item.direction==='down'?'↓ Decreased':'→ Unchanged'));fact.append(titleLine,valueLine);
    const dates=make('small','market-highlight-dates');dates.append(document.createTextNode('('),make('strong','market-highlight-date',item.displayDate),make('span','',' · '+item.frame+(item.essential?' · '+item.essential:'')));
    const details=make('span','market-highlight-details',' · '+item.date+(item.detail?' · '+item.detail:''));details.hidden=!calculationDetail;dates.append(details,document.createTextNode(')'));
    copy.append(fact,dates);graphic.title=item.text;graphic.append(image,copy);return graphic;
  }
  function utc(value) {
    const time = Date.parse(value);
    return Number.isFinite(time) ? new Date(time).toISOString().replace('T', ' ').replace(/:00\.000Z$/, ' UTC').replace(/\.000Z$/, ' UTC') : 'Unavailable';
  }
  function hourlyActivity(data) {
    const source = data.smegaSource?.sourceUrl;
    const points = (data.smega || []).filter(point => source && point.sourceUrl === source && point.aggregation === 'source_published_hourly'
      && ['buy', 'sell'].includes(point.side) && Number.isFinite(Date.parse(point.at)));
    if (!points.length) return [];
    const end = Math.max(...points.map(point => Date.parse(point.at))), buckets = new Map();
    for (const point of points) {
      const time = Date.parse(point.at); if (time <= end - 24 * 3600000) continue;
      const at = new Date(time).toISOString(), count = point.sampleCount ?? point.distinctSenders;
      let bucket = buckets.get(at); if (!bucket) { bucket = { at, partial: false, conflicts: new Set() }; buckets.set(at, bucket); }
      bucket.partial ||= !!point.partial;
      if (!Number.isInteger(count) || count < 0) continue;
      if (bucket[point.side] !== undefined && bucket[point.side] !== count) bucket.conflicts.add(point.side);
      else bucket[point.side] = count;
    }
    return [...buckets.values()].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).map(bucket => {
      for (const side of bucket.conflicts) delete bucket[side];
      return bucket;
    });
  }
  function drawPage() {
    if (!report) return;
    pagePublication.textContent = 'Daily source publication: ' + utc(report.sourceUpdatedAt) + '. Item dates and the activity capture below are separately dated.';
    pageHeading.title=pagePublication.textContent;pagePublication.hidden=!showPublication;
    cards.replaceChildren();
    const items = highlights(report);
    for (const item of items) {
      const card = make('article', 'panel highlights-fact'); card.dataset.highlightType = item.type; card.dataset.direction = item.direction;
      const link = make('a'); link.href = '#item/' + encodeURIComponent(item.slug); link.setAttribute('aria-label', item.summary);link.title=item.text;link.append(highlightGraphic(item, true, 2));
      card.append(link); cards.append(card);
    }
    if (!items.length) cards.append(make('p', 'empty', 'No qualified dated highlights in this snapshot.'));
    const hours = hourlyActivity(report), latest = hours[0], earliest = hours.at(-1);
    drawCountChart(hours);
    activityScope.textContent = hours.length
      ? `Last 24 source hours · as of ${utc(latest.at)} · ${hours.length} / 24 buckets retained. Offer capture: ${utc(report.smegaSource?.capturedAt)}.${calculationDetail?' Exact retained interval: '+utc(earliest.at)+' – '+utc(latest.at)+'.':''}`
      : 'No source-published hourly offer counts are available in this snapshot.';
    activityScope.title=hours.length?`Exact retained interval: ${utc(earliest.at)} – ${utc(latest.at)}. Offer capture: ${utc(report.smegaSource?.capturedAt)}.`:'';
    activityStats.replaceChildren();
    for (const [side, label] of [['sell', 'Seller poster-hour appearances'], ['buy', 'Buyer poster-hour appearances']]) {
      const available = hours.filter(hour => Number.isInteger(hour[side]));
      const stat = make('article', 'panel');
      stat.append(make('span', '', label), make('strong', '', available.length ? number(available.reduce((sum, hour) => sum + hour[side], 0)) : '—'),
        make('small', '', available.length + ' source-hour counts · not unique people'));
      activityStats.append(stat);
    }
    activityTable.replaceChildren();
    if (!hours.length) { activityTable.append(make('p', 'empty', 'No hourly buckets to display.')); return; }
    const table = make('table'), caption = make('caption', '', 'Published poster counts by source hour · UTC'), head = make('thead'), headRow = make('tr'), body = make('tbody');
    for (const label of ['Source hour · UTC', 'Sellers posting', 'Buyers posting', 'Coverage']) { const th = make('th', '', label); th.scope = 'col'; headRow.append(th); }
    head.append(headRow);
    for (const hour of hours) {
      const row = make('tr'); row.dataset.sourceHour = hour.at;
      const missing = ['sell', 'buy'].filter(side => !Number.isInteger(hour[side]));
      const coverage = [hour.partial ? 'Partial source bucket' : 'Published hourly bucket', missing.length ? 'missing ' + missing.map(side => side === 'sell' ? 'seller count' : 'buyer count').join(' and ') : '', hour.conflicts.size ? 'conflicting counts omitted' : ''].filter(Boolean).join(' · ');
      for (const text of [utc(hour.at), Number.isInteger(hour.sell) ? number(hour.sell) : '—', Number.isInteger(hour.buy) ? number(hour.buy) : '—', coverage]) row.append(make('td', '', text));
      body.append(row);
    }
    table.append(caption, head, body); activityTable.append(table);
  }
  function drawCountChart(hours) {
    countChart.replaceChildren();if(!hours.length){countChart.append(make('p','empty','No source-published hourly counts to plot.'));return;}
    const ns='http://www.w3.org/2000/svg',svgNode=(tag,attrs,text)=>{const node=document.createElementNS(ns,tag);for(const [key,value] of Object.entries(attrs||{}))node.setAttribute(key,String(value));if(text!==undefined)node.textContent=text;return node;};
    const W=Math.max(320,Math.min(countChart.clientWidth||700,720)),H=264,L=48,R=20,T=54,B=100,plotW=W-L-R,plotH=H-T-B,end=Date.parse(hours[0].at),start=end-23*3600000,slot=plotW/24;
    const max=Math.max(1,...hours.flatMap(hour=>['sell','buy'].map(side=>Number.isInteger(hour[side])?hour[side]:0))),upper=Math.max(4,Math.ceil(max/4)*4),map=new Map(hours.map(hour=>[Date.parse(hour.at),hour]));
    const svg=svgNode('svg',{viewBox:`0 0 ${W} ${H}`,role:'img','aria-label':'Published poster counts for each UTC source hour; not sales or unique people'});
    svg.append(svgNode('title',{},'Last 24 source hours: published seller and buyer poster counts. Missing/conflicting sides have no bar; counts are not unique people or sales.'));
    svg.append(svgNode('text',{x:L+plotW/2,y:18,'text-anchor':'middle',class:'highlights-count-axis'},'Poster count / source hour'));
    for(let i=0;i<=4;i++){const value=upper*i/4,y=T+plotH-value/upper*plotH;svg.append(svgNode('line',{x1:L,x2:W-R,y1:y,y2:y,stroke:'var(--line)'}),svgNode('text',{x:L-8,y:y+4,'text-anchor':'end',class:'highlights-count-tick'},number(value)));}
    for(let i=0;i<24;i++){const at=start+i*3600000,hour=map.get(at),x=L+i*slot;
      if(!hour){const gap=svgNode('rect',{x:x+1,y:T,width:Math.max(1,slot-2),height:plotH,fill:'var(--line)',opacity:'.16','data-hour-coverage':'missing'});gap.append(svgNode('title',{},utc(new Date(at).toISOString())+' · source hour unavailable; no counts imputed'));svg.append(gap);continue;}
      if(hour.partial){const partial=svgNode('rect',{x,y:T,width:slot,height:plotH,fill:'#edc471',opacity:'.09','data-hour-partial':'true'});partial.append(svgNode('title',{},utc(hour.at)+' · partial source bucket when captured'));svg.append(partial);}
      for(const [side,offset,color] of [['sell',.12,'#edc471'],['buy',.55,'#89c6b0']]){if(!Number.isInteger(hour[side]))continue;const value=hour[side],height=value/upper*plotH,bar=svgNode('rect',{x:x+slot*offset,y:T+plotH-height,width:slot*.32,height,fill:color,'data-source-hour':hour.at,'data-source-side':side,'data-source-count':value});bar.append(svgNode('title',{},`${utc(hour.at)} · ${side==='sell'?'Seller':'Buyer'} source posters: ${number(value)}${hour.partial?' · partial when captured':''}; not unique people across hours or trade volume`));svg.append(bar);}
    }
    for(const i of [0,Math.round(23/2),23]){const at=start+i*3600000,date=new Date(at),x=L+(i+.5)*slot,anchor=i===0?'start':i===23?'end':'middle',label=date.toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'}),tick=svgNode('text',{x,y:H-74,'text-anchor':anchor,class:'highlights-count-tick'},label);tick.append(svgNode('tspan',{x,dy:20},date.toISOString().slice(11,16)));svg.append(tick);}
    svg.append(svgNode('text',{x:L+plotW/2,y:H-24,'text-anchor':'middle',class:'highlights-count-axis'},'Time (UTC)'));countChart.append(svg);
  }
  function draw() {
    if (!report) return;
    const items = highlights(report); track.replaceChildren();
    publication.textContent = report.sourceUpdatedAt && Number.isFinite(Date.parse(report.sourceUpdatedAt))
      ? 'Source publication ' + new Date(report.sourceUpdatedAt).toISOString().replace('T', ' ').replace('.000Z', ' UTC') : 'Source publication time unavailable';
    heading.title=publication.textContent;publication.hidden=!showPublication;
    if (!items.length) { track.append(make('p', '', 'No qualified dated highlights in this snapshot.')); return; }
    for (const duplicate of [false, true]) {
      const list = make('ul', 'market-highlights-list');
      if (duplicate) list.setAttribute('aria-hidden', 'true');
      for (const item of items) {
        const chip = make('li', 'market-highlight'); chip.dataset.highlightType = item.type; chip.dataset.direction = item.direction;
        const label = make(duplicate ? 'span' : 'a'); label.append(highlightGraphic(item, true));
        if (!duplicate) { label.href = '#item/' + encodeURIComponent(item.slug); label.setAttribute('aria-label', item.summary);label.title=item.text; }
        chip.append(label); list.append(chip);
      }
      track.append(list);
    }
  }
  function update() {
    panel.hidden = !enabled;
    toggle.textContent = 'Market highlights: ' + (enabled ? 'On' : 'Off');
    toggle.setAttribute('aria-pressed', String(enabled));
    const reduced = motion?.matches === true;
    panel.dataset.paused = String(paused || reduced); panel.dataset.reducedMotion = String(reduced);
    pause.textContent = reduced ? 'Motion off · device preference' : paused ? 'Resume motion' : 'Pause motion';
    pause.disabled = reduced; pause.setAttribute('aria-pressed', String(paused || reduced));
    if (enabled) draw();
  }
  toggle.addEventListener('click', () => {
    enabled = !enabled;
    try { localStorage.setItem(key, enabled ? 'on' : 'off'); } catch { /* Usable in this tab. */ }
    update();
  });
  calculationToggle.addEventListener('click',()=>{calculationDetail=!calculationDetail;calculationToggle.setAttribute('aria-pressed',String(calculationDetail));calculationToggle.textContent=calculationDetail?'Hide calculation details':'Show calculation details';document.querySelectorAll('.highlights-method-detail').forEach(note=>note.hidden=!calculationDetail);if(report){drawPage();if(enabled)draw();}});
  const fontButton=make('button','','Heading: Inquisitive');fontButton.type='button';let inquisitive=true;try{inquisitive=localStorage.getItem('astra-highlights-font-v1')!=='plain'}catch{}const applyFont=()=>{panel.dataset.headingFont=inquisitive?'inquisitive':'plain';fontButton.textContent='Heading: '+(inquisitive?'Inquisitive':'Plain');fontButton.setAttribute('aria-pressed',String(inquisitive))};fontButton.addEventListener('click',()=>{inquisitive=!inquisitive;try{localStorage.setItem('astra-highlights-font-v1',inquisitive?'inquisitive':'plain')}catch{}applyFont()});calculationControls.append(fontButton);applyFont();
  const applyAbbreviations=()=>{abbreviationToggle.textContent='Compact values: '+(abbreviations?'On':'Off');abbreviationToggle.setAttribute('aria-pressed',String(abbreviations));};
  abbreviationToggle.addEventListener('click',()=>{abbreviations=!abbreviations;try{localStorage.setItem('astra-highlights-abbreviations-v1',abbreviations?'on':'off')}catch{}applyAbbreviations();if(report){drawPage();if(enabled)draw();}});calculationControls.append(abbreviationToggle);applyAbbreviations();
  publicationToggle.addEventListener('click',()=>{showPublication=!showPublication;publicationToggle.setAttribute('aria-pressed',String(showPublication));publicationToggle.textContent=showPublication?'Hide source publication':'Show source publication';publication.hidden=pagePublication.hidden=!showPublication;});
  contextToggle.addEventListener('click',()=>{showContext=!showContext;contextToggle.setAttribute('aria-pressed',String(showContext));contextToggle.textContent=showContext?'Hide Wolbi context':'Show Wolbi context';if(report){drawPage();if(enabled)draw();}});
  pause.addEventListener('click', () => { paused = !paused; update(); });
  motion?.addEventListener?.('change', update);
  window.addEventListener('hashchange',()=>{if(window.location.hash==='#highlights'&&report)drawPage();});
  window.addEventListener('resize',()=>{if(report&&!page.hidden)drawCountChart(hourlyActivity(report));});
  document.addEventListener('astramarketsnapshot', event => {
    if (!event.detail || !Array.isArray(event.detail.rows)) return;
    report = event.detail;
    drawPage();
    if (enabled) draw();
  });
  update();
  // The app owns collection. This handshake only requests its existing memory snapshot.
  document.dispatchEvent(new Event('astramarkethighlightsready'));
  // Deferred modules can be loaded after the app's first route decision.
  if (window.location.hash === '#highlights') window.dispatchEvent(new Event('hashchange'));
})();

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "market-highlights.js", status: "initialization_failed"}})); } catch {}
}

;
/* Astra source: brand-preview.js */
try {
(() => {
  'use strict';
  if (document.getElementById('brand-preview-options')) return;
  const masthead = document.querySelector('header.masthead');
  const brand = masthead?.querySelector('a.brand');
  const suffix = brand?.querySelector('.brand-watch');
  const copy = suffix?.parentElement;
  const options = document.getElementById('display-options');
  if (!masthead || !brand || !suffix || !copy || !options) return;

  const choices = {
    typeface: [['sans', 'Bold sans'], ['display', 'Upright display'], ['arcade', 'Arcade mono'], ['arcade-bold', 'Arcade mono · Bold'], ['pixel', 'Pixel font']],
    placement: [['left', 'Left'], ['center', 'Center']],
    case: [['lower', '.gg'], ['upper', '.GG']],
    logo: [['lemon-stack', 'Lemon · 999 quickslot'], ['lemon', 'Lemon'], ['pouch', 'Pouch'], ['leaf', 'Maple leaf'], ['scroll', 'Scroll'], ['none', 'Wordmark only']],
    tagline: [['harnessed', 'Harnessed'], ['checked', 'Kept in check'], ['measured', 'Measured'], ['count', 'Every meso'], ['number', 'Put a number on it']],
  };
  const defaults = { typeface: 'arcade', placement: 'center', case: 'lower', logo: 'lemon-stack', tagline: 'harnessed' };
  const labels = { typeface: 'Wordmark typography', placement: 'Wordmark placement', case: 'Wordmark suffix', logo: 'Wordmark logo', tagline: 'Wordmark tagline' };
  const state = { ...defaults };
  const controls = document.createElement('fieldset');
  controls.id = 'brand-preview-options';
  controls.className = 'brand-preview-controls';
  const legend = document.createElement('legend');
  legend.textContent = 'Wordmark';
  controls.append(legend);
  masthead.classList.add('brand-preview-masthead');
  copy.classList.add('brand-wordmark-copy');
  const logo = brand.querySelector('.brand-leaf'), logoImage = logo?.querySelector('img');
  const stackBadge=document.createElement('span');stackBadge.className='brand-stack-count';stackBadge.textContent='999';stackBadge.setAttribute('aria-hidden','true');logo?.append(stackBadge);
  // Reuse the site's original leaf drawing without its favicon background box.
  const mapleLeaf = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  mapleLeaf.setAttribute('viewBox', '0 0 32 32'); mapleLeaf.setAttribute('aria-hidden', 'true'); mapleLeaf.setAttribute('focusable', 'false'); mapleLeaf.classList.add('brand-logo-maple');
  const leafPath = document.createElementNS('http://www.w3.org/2000/svg', 'path'); leafPath.setAttribute('d', 'm16 4 3 8 7-2-3 7 5 4-10 3-2 5-1-6-10-3 5-5-2-7 6 4Z'); leafPath.setAttribute('fill', 'currentColor'); mapleLeaf.append(leafPath); logo?.append(mapleLeaf);


  const apply = () => {
    document.body.dataset.brandTypeface = state.typeface;
    document.body.dataset.brandPlacement = state.placement;
    document.body.dataset.brandCase = state.case;
    masthead.dataset.brandTypeface = state.typeface;
    masthead.dataset.brandPlacement = state.placement;
    masthead.dataset.brandCase = state.case;
    masthead.dataset.brandLogo = state.logo;
    const tagline = copy.querySelector('small'); if (tagline) tagline.textContent = { harnessed: 'The Maple Classic World economy, harnessed.', checked: 'The Maple Classic World economy, kept in check.', measured: 'The Maple Classic World economy, measured.', count: 'Make every meso count.', number: 'Put a number on your mesos.' }[state.tagline];
    if (tagline) {
      const text=tagline.textContent,accent={harnessed:'harnessed',checked:'kept in check',measured:'measured',count:'count',number:'number'}[state.tagline];
      const at=text.lastIndexOf(accent);if(at>=0){const strong=document.createElement('strong');strong.className='brand-tagline-accent';strong.textContent=accent;tagline.replaceChildren(document.createTextNode(text.slice(0,at)),strong,document.createTextNode(text.slice(at+accent.length)));}
    }
    masthead.dataset.brandTagline = state.tagline;
    if (logo && logoImage) {
      logo.hidden = state.logo === 'none';
      logoImage.hidden = state.logo === 'leaf'; mapleLeaf.toggleAttribute('hidden', state.logo !== 'leaf');
      stackBadge.hidden=state.logo!=='lemon-stack';
      if (['lemon-stack','lemon','pouch','scroll'].includes(state.logo)) {
        const src = state.logo.startsWith('lemon') ? 'assets/lemon-original-v1.png' : state.logo === 'scroll' ? 'assets/ap-reset-scroll.png' : 'assets/meso-pouch.png';
        if (logoImage.getAttribute('src') !== src) logoImage.src = src;
      }
      // The adjacent wordmark supplies the accessible brand name; art is decorative.
      logoImage.alt = '';
    }

    suffix.textContent = state.case === 'upper' ? '. GG' : '. gg';
    for (const button of controls.querySelectorAll('button')) {
      button.setAttribute('aria-pressed', String(state[button.dataset.brandSetting] === button.dataset.brandChoice));
    }
    document.dispatchEvent(new CustomEvent('astrabrandchange', { detail: { ...state } }));
  };
  for (const [setting, values] of Object.entries(choices)) {
    try {
      const saved = localStorage.getItem('astra-brand-' + setting);
      if (values.some(([value]) => value === saved)) state[setting] = saved;
    } catch { /* A blocked preference store must not disable the display choices. */ }
    const group = document.createElement('div');
    group.className = 'brand-preview-group';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', labels[setting]);
    const label = document.createElement('span');
    label.textContent = labels[setting].replace('Wordmark ', '');
    group.append(label);
    for (const [value, title] of values) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.brandSetting = setting;
      button.dataset.brandChoice = value;
      button.textContent = title;
      button.setAttribute('aria-label', labels[setting] + ': ' + title);
      button.addEventListener('click', () => {
        state[setting] = value;
        apply();
        try { localStorage.setItem('astra-brand-' + setting, value); } catch { /* The current tab remains usable. */ }
      });
      group.append(button);
    }
    controls.append(group);
  }
  const note = document.createElement('small');
  note.textContent = 'Wordmark and preview controls · saved in this browser. The self-hosted pixel font loads only when selected. Other choices use system fonts. ';
  const fontLicense = document.createElement('a'); fontLicense.href = 'assets/PixelifySans-OFL.txt'; fontLicense.textContent = 'Pixel font license'; note.append(fontLicense);
  controls.append(note);
  options.append(controls);
  apply();
})();

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "brand-preview.js", status: "initialization_failed"}})); } catch {}
}

;
/* Astra source: banner-art.js */
try {
(() => {
  'use strict';
  const options = document.getElementById('display-options');
  if (!options || !document.querySelector('.hero-art') || document.getElementById('banner-art-options')) return;
  const key = 'astra-banner-art';
  const modes = new Map([['paired', 'Follow scenery pairing'], ['free-market', 'Free Market'], ['henesys', 'Henesys'], ['zakum', 'Zakum'], ['zakum-set', 'Zakum · Helmet effect'], ['lantern', 'Lantern Market']]);
  const group = document.createElement('div');
  group.id = 'banner-art-options'; group.className = 'banner-art-options';
  group.setAttribute('role', 'group'); group.setAttribute('aria-label', 'Banner artwork');
  const title = document.createElement('span'); title.textContent = 'Banner artwork'; group.append(title);
  const choose = value => {
    const selected = modes.has(value) ? value : 'zakum-set';
    document.body.dataset.bannerArt = selected;
    for (const button of group.querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.bannerArtChoice === selected));
  };
  for (const [mode, label] of modes) {
    const button = document.createElement('button'); button.type = 'button';
    button.dataset.bannerArtChoice = mode; button.textContent = label;
    button.setAttribute('aria-controls', 'rate-section');
    button.addEventListener('click', () => {
      choose(mode);
      try { localStorage.setItem(key, mode); } catch { /* Usable in this tab without storage. */ }
    });
    group.append(button);
  }
  const note = document.createElement('small');
  note.textContent = 'Independent of the page backdrop. Zakum and Lantern Market are decorative fan illustrations; the cyan/purple motif references the original Zakum Helmet equipment effect.';
  group.append(note); options.append(group);
  let saved;
  try { saved = localStorage.getItem(key); } catch { /* Use the approved helmet-effect banner. */ }
  choose(saved);
})();

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "banner-art.js", status: "initialization_failed"}})); } catch {}
}

;
/* Astra source: theme-preview.js */
try {
(() => {
  'use strict';
  const parent = document.getElementById('display-options');
  if (!parent || document.getElementById('theme-preview-options')) return;
  const key = 'astra-color-scheme-v1';
  const schemes = Object.freeze({
    ellinia: { label: 'Ellinia Green (default)', browserColor: null },
    'maple-amber': { label: 'Maple Amber', browserColor: '#211914' },
    'moonlit-ludibrium': { label: 'Moonlit Ludibrium', browserColor: '#171a2a' },
  });
  const browserTheme = document.querySelector('meta[name="theme-color"]');
  const originalBrowserColor = browserTheme?.getAttribute('content');
  const group = document.createElement('section');
  group.id = 'theme-preview-options'; group.className = 'theme-preview-options';
  group.setAttribute('role', 'group'); group.setAttribute('aria-label', 'Color scheme');
  const label = document.createElement('span'); label.textContent = 'Color scheme';
  const choices = document.createElement('div'); choices.className = 'theme-preview-buttons';
  const note = document.createElement('small'); note.className = 'theme-preview-note';
  note.setAttribute('role', 'status'); note.setAttribute('aria-live', 'polite');
  const buttons = [];
  const apply = (value, persist = false) => {
    const scheme = Object.hasOwn(schemes, value) ? value : 'ellinia';
    // Removing the attribute restores every original approved green rule.
    if (scheme === 'ellinia') delete document.body.dataset.colorScheme;
    else document.body.dataset.colorScheme = scheme;
    if (browserTheme) {
      const color = schemes[scheme].browserColor ?? originalBrowserColor;
      if (color === null) browserTheme.removeAttribute('content');
      else browserTheme.setAttribute('content', color);
    }
    for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.colorSchemeChoice === scheme));
    let saved = true;
    if (persist) {
      try { localStorage.setItem(key, scheme); } catch { saved = false; }
    }
    note.textContent = (saved ? 'Saved in this browser only. ' : 'Browser storage is unavailable; this choice works in this tab. ') +
      'Prices, calculations and buy/sell/source-status meanings stay the same.';
    document.dispatchEvent(new CustomEvent('astracolorschemechange', { detail: { scheme } }));
  };
  for (const [value, scheme] of Object.entries(schemes)) {
    const button = document.createElement('button'); button.type = 'button';
    button.dataset.colorSchemeChoice = value; button.textContent = scheme.label;
    button.addEventListener('click', () => apply(value, true));
    buttons.push(button); choices.append(button);
  }
  group.append(label, choices, note);
  // Load after the other display modules so this cosmetic group stays last.
  parent.append(group);
  let saved;
  try { saved = localStorage.getItem(key); } catch { /* Approved green remains the default. */ }
  apply(saved);
  window.addEventListener('storage', event => { if (event.key === key) apply(event.newValue); });
})();

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "theme-preview.js", status: "initialization_failed"}})); } catch {}
}

;
/* Astra source: cash-catalog.js */
try {
(() => {
  'use strict';
  const content = document.getElementById('content');
  if (!content || document.getElementById('view-cash-catalog')) return;
  const make = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
  const positive = value => Number.isFinite(value) && value > 0;
  const count = value => Number.isInteger(value) && value >= 0;
  const day = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0,10) === value;
  const clock = value => typeof value === 'string' && /(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value));
  const number = (value, decimals = 0) => Number.isFinite(value) ? value.toLocaleString('en-US', { maximumFractionDigits: decimals }) : 'Unknown';
  const time = value => clock(value) ? (value.endsWith('Z')?value.slice(0,-1).replace('T',' ')+' UTC':value.replace('T',' ')) : 'Unknown';
  const page = make('section', 'view cash-catalog'); page.id = 'view-cash-catalog'; page.hidden = true; page.setAttribute('aria-labelledby','cash-catalog-title');
  page.innerHTML = `<div class="page-heading"><div><p class="eyebrow">COLLECTED CASH ITEMS / DATED SOURCE EVIDENCE</p><h1 id="cash-catalog-title">The cash catalog.</h1><p>Browse provider market records and separately verified client metadata, including items outside the fixed Cash Basket and NX estimate.</p></div></div><p class="notice cash-catalog-status" role="status"></p><p class="cash-catalog-scope">Market rows are this provider’s collection; metadata-only rows establish client records, not release, trade or game availability. This is not every cash item in the game. Source medians have an unspecified summary window; the separate qualified daily price requires at least five recorded sales. Only configured, verified fixed NX costs support a daily-price/NX ratio. Unknown costs stay unknown.</p><div class="cash-catalog-controls"><label>Search collected cash items<input type="search" autocomplete="off" placeholder="Item name or history badge" aria-describedby="cash-catalog-results"></label><button type="button" data-catalog-clear>Clear</button><div class="cash-catalog-paging"><button type="button" data-catalog-page="previous">Previous</button><span id="cash-catalog-results" role="status" aria-live="polite"></span><button type="button" data-catalog-page="next">Next</button></div></div><div class="table-wrap cash-catalog-table"></div><p class="cash-catalog-teddy"></p><p class="cash-catalog-footnotes">¹ Source median: publisher summary window unspecified. ² Provider observation: unconfirmed source claim, not an independently verified trade timestamp.</p><p class="cash-catalog-legend"><strong>History badges:</strong> “New in collected history” means the first retained daily observation is after the fixed reference period. It is not a release date. “Short qualifying history” means fewer than seven retained days with at least five recorded sales. Retention gaps can hide older observations; these badges are descriptive and change no calculation. Provider observation clocks do not independently verify a trade or current listing availability. Daily medians may mix cosmetic/equipment quality.</p><p class="cash-catalog-back"><a href="#cash-basket">Fixed Cash Basket →</a> · <a href="#nx">Known-price NX estimates →</a></p>`;
  content.append(page);
  const status = page.querySelector('.cash-catalog-status'), tableHost = page.querySelector('.cash-catalog-table'), input = page.querySelector('input'), result = page.querySelector('#cash-catalog-results');
  const links = [];
  for (const id of ['view-nx','view-cash-basket']) { const view = document.getElementById(id); if (!view) continue; const p = make('p','cash-catalog-link'), a = make('a','','Browse the collected cash catalog →'); a.href='#cash-catalog'; p.append(a); const heading=view.querySelector('.page-heading');if(heading)heading.after(p);else view.prepend(p);links.push(a); }
  let report, rows = [], sortKey = 'name', ascending = true, pageIndex = 0, expanded = null, historyKey = 0, historyAscending = false;
  const pageSize = 25;
  const headers = [['name','Cash item / evidence'],['publisherMedian','Source median¹'],['price','Qualified daily median'],['knownNxCost','Fixed NX cost'],['dailyRate','Daily mesos / NX'],['firstObservedDay','First retained day'],['qualifyingDays','Qualifying days'],['sourceLastSeenAt','Provider observation²']];
  // Optional computed display columns supplied from the already-loaded snapshot.
  // They never become provider prices, NX costs, release metadata or history.
  let volatility = null;
  const activeHeaders = () => [...headers,...(rows.some(r=>r.supplemental)?[['supplementalPrice','Separate rolling median · mesos']]:[]),...(volatility?[['volatility7','7-day daily price volatility'],['volatilityRank','Volatility rank']]:[])];
  const sortValue = (row, key) => key === 'volatility7' ? volatility?.values.get(row.slug)?.value ?? null : key === 'volatilityRank' ? volatility?.values.get(row.slug)?.rank ?? null : row[key];
  function normalize(raw, catalog) {
    if (!raw || typeof raw.name !== 'string' || typeof raw.slug !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(raw.slug)) return null;
    const history = (Array.isArray(raw.history) ? raw.history : []).filter(p => Array.isArray(p) && day(p[0]) && positive(p[1]) && count(p[2])).map(p => p.slice(0,3)).sort((a,b)=>a[0].localeCompare(b[0]));
    const price = positive(raw.price) && day(raw.priceDay) && count(raw.quantity) && raw.quantity >= 5 ? raw.price : null;
    const nx = positive(raw.knownNxCost) ? raw.knownNxCost : null;
    const first = day(raw.firstObservedDay) ? raw.firstObservedDay : history[0]?.[0] || null;
    const qualifyingDays = count(raw.qualifyingDays) ? raw.qualifyingDays : history.filter(p=>p[2]>=5).length;
    const isNew = !!first && day(catalog.baseEnd) && first > catalog.baseEnd, short = qualifyingDays < 7;
    return { name:raw.name, key:raw.slug, slug:raw.slug, canonicalId:Number.isInteger(raw.canonicalId)?raw.canonicalId:null, metadataOnly:false, publisherMedian:positive(raw.publisherMedian)?raw.publisherMedian:null, price, priceDay:price===null?null:raw.priceDay, quantity:price===null?null:raw.quantity, partial:raw.partial===true, knownNxCost:nx, dailyRate:price!==null&&nx!==null?price/nx:null, firstObservedDay:first, qualifyingDays, historyDays:count(raw.historyDays)?raw.historyDays:history.length, sourceLastSeenAt:clock(raw.sourceLastSeenAt)?raw.sourceLastSeenAt:null, history, isNew, short, inCashBasket:raw.inCashBasket===true, sourceObservations:Array.isArray(raw.sourceObservations)?raw.sourceObservations:[] };
  }
  function metadata(raw){
    if(!raw||!Number.isInteger(raw.id)||raw.id<=0||typeof raw.name!=='string'||raw.cash!==true||raw.marketDataAvailable!==false)return null;
    return {name:raw.name,key:'metadata-'+raw.id,slug:null,canonicalId:raw.id,metadataOnly:true,publisherMedian:null,price:null,priceDay:null,quantity:null,knownNxCost:null,dailyRate:null,firstObservedDay:null,qualifyingDays:0,historyDays:0,sourceLastSeenAt:null,history:[],isNew:false,short:false,inCashBasket:false,sourceObservations:[],metadataCapturedAt:raw.metadataCapturedAt,metadataCaptureTimeKind:raw.metadataCaptureTimeKind,sourceUrl:raw.sourceUrl,region:raw.region,version:raw.version};
  }
  function references(data){const branch=data?.cashPriceReferences;if(branch?.schemaVersion!==1||branch.kind!=='supplemental_cash_rolling_references'||branch.sourceUrl!=='https://mesos.watch/'||!Array.isArray(branch.items))return[];const ids=new Set();return branch.items.filter(r=>{if(!r||!Number.isInteger(r.id)||r.id<=0||ids.has(r.id)||r.id!==r.expectedItemId||typeof r.name!=='string'||typeof r.expectedItemName!=='string'||r.name.toLocaleLowerCase()!==r.expectedItemName.toLocaleLowerCase()||!positive(r.price)||!Number.isInteger(r.salesCounted)||r.salesCounted<1||!positive(r.windowDays)||r.windowDays>90||r.priceBasis!=='median of sales'||!clock(r.capturedAt))return false;ids.add(r.id);return true;});}
  function appendReference(region,item){const r=item.supplemental;if(!r)return;region.append(make('h3','','Separate supplemental rolling reference'),make('p','cash-catalog-supplemental',`${number(r.price,1)} mesos · median of ${number(r.salesCounted)} recorded sales · ${number(r.windowDays)}-day reported lookback (not proof of that much trading history). Captured ${time(r.capturedAt)} (${r.captureTimeKind||'receipt clock'}); underlying source observation time ${r.observationTimestampKnown&&clock(r.sourceObservedAt)?time(r.sourceObservedAt):'unknown'}. Reported roll: ${r.statRollKnown?(r.statRoll===null?'explicit null':String(r.statRoll)):'not reported'}. This is not a daily-history point, fixed NX cost, live tick or quality-constant equipment history.`));if(Number.isInteger(r.listingsNow))region.append(make('p','',`${number(r.listingsNow)} listings reported at this capture.${r.cheapestListing&&positive(r.cheapestListing.price_each)?` Cheapest asking observation ${number(r.cheapestListing.price_each,1)} mesos each · channel ${r.cheapestListing.channel}, room ${r.cheapestListing.room}.`:''} Current listing availability is unconfirmed.`));}
  function compare(a,b,key,asc) { const av=key==='sourceLastSeenAt'&&a[key]!==null?Date.parse(a[key]):sortValue(a,key),bv=key==='sourceLastSeenAt'&&b[key]!==null?Date.parse(b[key]):sortValue(b,key); if(av===null||av===undefined)return bv===null||bv===undefined?a.key.localeCompare(b.key):1; if(bv===null||bv===undefined)return -1; const delta=typeof av==='number'&&typeof bv==='number'?av-bv:String(av).localeCompare(String(bv),undefined,{numeric:true}); return delta*(asc?1:-1)||a.key.localeCompare(b.key); }
  function catalogIcon(item){const fallback=()=>{const icon=make('span','cash-catalog-icon-fallback','◇');icon.dataset.spriteKind='generic';icon.setAttribute('role','img');icon.setAttribute('aria-label','Generic marker; original item icon not cached');icon.title='Generic marker · original item icon not cached';return icon;};const src=report?.spriteMap?.[item.slug]||report?.spriteMap?.[item.canonicalId];if(typeof src!=='string'||!/^assets\/[A-Za-z0-9._-]+\.(?:png|webp|gif|svg)$/.test(src))return fallback();const image=make('img','cash-catalog-icon');image.src=src;image.alt='';image.width=32;image.height=32;image.loading='lazy';image.dataset.spriteKind='item';image.title='Original game icon · Nexon via MapleStory.io';image.addEventListener('error',()=>image.replaceWith(fallback()),{once:true});return image;}
  function historyRow(item) {
    const tr=make('tr','cash-catalog-history'),td=make('td');td.colSpan=activeHeaders().length;const region=make('section');region.id='cash-catalog-history-'+item.key;region.setAttribute('aria-label',item.name+' daily history');
    if(item.metadataOnly){region.append(make('h2','',item.name+(item.supplemental?' · client metadata + separate rolling reference':' · client metadata only')),make('p','',`Verified client item ID ${item.canonicalId} · ${item.region||'Unknown region'} / ${item.version||'Unknown version'}. Within this client-metadata receipt, no provider market observations, price, fixed NX cost or release date are established. 0 retained daily history days. Metadata receipt ${time(item.metadataCapturedAt)} (${item.metadataCaptureTimeKind||'capture kind unspecified'}); this is not a trade, release or game-availability clock.`));if(typeof item.sourceUrl==='string'&&item.sourceUrl.startsWith('https://')){const link=make('a','','View primary item metadata ↗');link.href=item.sourceUrl;link.target='_blank';link.rel='noopener noreferrer';region.append(link);}const editions=make('a','','Published mystery-box editions and availability →');editions.href='#mystery-boxes';region.append(make('p','','Official edition evidence is kept separately from this metadata receipt. '),editions);appendReference(region,item);td.append(region);tr.append(td);return tr;}
    if(item.supplementalOnly){region.append(make('h2','',item.name+' · rolling reference only'),make('p','','No provider daily history or verified fixed NX cost is established for this separate item-ID record. No release date is inferred.'));appendReference(region,item);td.append(region);tr.append(td);return tr;}
    region.append(make('h2','',item.name+' · retained daily history'),make('p','',`${item.historyDays} retained source days; ${item.qualifyingDays} qualify at ≥5 recorded sales. First retained day: ${item.firstObservedDay||'Unknown'} (not a release date). Daily values are source-inferred aggregates, not individual transactions.`));
    for(const observation of item.sourceObservations.filter(o=>o&&o.kind==='rolling_scanner_median')) region.append(make('p','cash-catalog-rolling',`Separate rolling median: ${number(observation.price)} mesos · ${number(observation.salesCounted)} recorded sales · ${number(observation.windowDays)}-day window. Captured ${time(observation.capturedAt)}; underlying source time ${observation.observationTimestampKnown&&clock(observation.sourceObservedAt)?time(observation.sourceObservedAt):'unknown'}. Reported roll: ${observation.statRollKnown?(observation.statRoll===null?'explicit null':String(observation.statRoll)):'unverified'}. This is separate from the daily history and confirms no listing availability.`));
    appendReference(region,item);
    const table=make('table');table.dataset.searchReady='true';const head=table.createTHead().insertRow();
    for(const [index,label] of ['Source day','Daily median · mesos','Recorded count'].entries()){const th=make('th');th.setAttribute('aria-sort',historyKey===index?(historyAscending?'ascending':'descending'):'none');const button=make('button','',label+(historyKey===index?(historyAscending?' ↑':' ↓'):''));button.type='button';button.dataset.catalogHistorySort=String(index);th.append(button);head.append(th);}
    const body=table.createTBody(),sorted=item.history.map((point,index)=>({point,index})).sort((a,b)=>{const av=a.point[historyKey],bv=b.point[historyKey];return (typeof av==='number'?av-bv:String(av).localeCompare(String(bv)))*(historyAscending?1:-1)||a.index-b.index;});
    for(const {point} of sorted){const row=body.insertRow();row.insertCell().textContent=point[0]+(point[0]===report?.cashCatalog?.sourceUpdatedAt?.slice(0,10)?' · partial source day':'');row.insertCell().textContent=number(point[1],1);row.insertCell().textContent=number(point[2]);}
    if(!sorted.length){const cell=body.insertRow().insertCell();cell.colSpan=3;cell.textContent='No retained daily history in this snapshot.';}
    region.append(table);td.append(region);tr.append(td);return tr;
  }
  function draw() {
    const query=input.value.trim().toLocaleLowerCase(),filtered=rows.filter(row=>[row.name,row.slug,row.metadataOnly?'client metadata only':'',row.isNew?'new in collected history':'',row.short?'short qualifying history':''].join(' ').toLocaleLowerCase().includes(query)).sort((a,b)=>compare(a,b,sortKey,ascending));
    pageIndex=Math.min(pageIndex,Math.max(0,Math.ceil(filtered.length/pageSize)-1));const visible=filtered.slice(pageIndex*pageSize,(pageIndex+1)*pageSize),table=make('table');table.dataset.searchReady='true';table.setAttribute('aria-label','Collected cash items');
    const head=table.createTHead().insertRow();for(const [key,label] of activeHeaders()){const th=make('th');th.setAttribute('aria-sort',sortKey===key?(ascending?'ascending':'descending'):'none');if(key==='volatility7'||key==='volatilityRank')th.title=volatility.title;const button=make('button','',label+(sortKey===key?(ascending?' ↑':' ↓'):''));button.type='button';button.dataset.cashCatalogSort=key;th.append(button);head.append(th);}
    const body=table.createTBody();for(const item of visible){const tr=body.insertRow();tr.dataset.catalogKey=item.key;if(item.slug)tr.dataset.catalogSlug=item.slug;if(item.metadataOnly)tr.dataset.metadataId=String(item.canonicalId);const name=tr.insertCell(),button=make('button','cash-catalog-item',item.name);button.type='button';button.dataset.catalogHistory=item.key;button.setAttribute('aria-expanded',String(expanded===item.key));if(expanded===item.key)button.setAttribute('aria-controls','cash-catalog-history-'+item.key);name.append(catalogIcon(item),button);if(Number.isSafeInteger(item.canonicalId)&&item.canonicalId>0){const line=make('small'),full=make('a','cash-catalog-full-link','Full item page →');full.href='#item/id-'+item.canonicalId;full.setAttribute('aria-label','Open '+item.name+' item page');line.append(full);name.append(line);}for(const label of [item.supplementalOnly?'Separate rolling reference only':item.metadataOnly?(item.supplemental?'Client metadata + separate rolling reference':'Client metadata only · no market evidence'):null,item.isNew?'New in collected history':null,item.short?'Short qualifying history':null,item.inCashBasket?'Cash Basket member':null].filter(Boolean))name.append(make('small','cash-catalog-badge',label));
      tr.insertCell().textContent=number(item.publisherMedian,1);const daily=tr.insertCell();daily.append(make('span','',number(item.price,1)),make('small','',item.priceDay?`${item.priceDay}${item.partial?' · partial':''} · ${number(item.quantity)} recorded`:item.supplemental?'No daily market history':item.metadataOnly?'No market observations':'No ≥5-count daily price'));
      tr.insertCell().textContent=number(item.knownNxCost);tr.insertCell().textContent=number(item.dailyRate,2);tr.insertCell().textContent=item.firstObservedDay||'Unknown';const days=tr.insertCell();days.append(make('span','',number(item.qualifyingDays)),make('small','',`${item.historyDays} retained days`));const seen=tr.insertCell();seen.textContent=time(item.sourceLastSeenAt);seen.title='Provider-reported observation clock; not independently verified trade time or current availability.';
      if(rows.some(r=>r.supplemental)){const cell=tr.insertCell();cell.textContent=item.supplemental?number(item.supplemental.price,1):'Unknown';if(item.supplemental)cell.append(make('small','',`${number(item.supplemental.windowDays)}-day lookback · captured ${time(item.supplemental.capturedAt)} · source time ${item.supplemental.observationTimestampKnown&&clock(item.supplemental.sourceObservedAt)?time(item.supplemental.sourceObservedAt):'unknown'}`));}
      if(volatility){const point=volatility.values.get(item.slug),sigma=tr.insertCell(),rank=tr.insertCell();sigma.dataset.sortValue=point?String(point.value):'';rank.dataset.sortValue=point?String(point.rank):'';sigma.title=rank.title=volatility.title;sigma.append(make('span','',point?point.value.toLocaleString('en-US',{minimumFractionDigits:1,maximumFractionDigits:1})+'%':'Unavailable'));if(point)sigma.append(make('small','',point.returns+'/6 daily returns'));rank.textContent=point?`#${point.rank} of ${volatility.eligible} eligible / ${volatility.total} market items`:item.metadataOnly?'Not ranked · metadata only':'Unavailable';}
      if(expanded===item.key)body.append(historyRow(item));
    }
    if(!visible.length){const td=body.insertRow().insertCell();td.colSpan=activeHeaders().length;td.textContent='No collected items match this search.';}
    tableHost.replaceChildren(table);result.textContent=filtered.length?`${pageIndex*pageSize+1}–${pageIndex*pageSize+visible.length} of ${filtered.length} matches · ${rows.length} collected items`:`0 matches · ${rows.length} collected items`;
    page.querySelector('[data-catalog-page="previous"]').disabled=pageIndex===0;page.querySelector('[data-catalog-page="next"]').disabled=(pageIndex+1)*pageSize>=filtered.length;page.querySelector('[data-catalog-clear]').disabled=!input.value;
  }
  function receive(data) {
    report=data;const catalog=data?.cashCatalog;
    if(catalog?.schemaVersion!==1||catalog.kind!=='cash_shop_source_catalog'||!Array.isArray(catalog.rows)){rows=[];status.textContent='This snapshot does not yet include the collected cash catalog. Existing cash indexes and NX estimates are unchanged.';page.querySelector('.cash-catalog-teddy').textContent='';links.forEach(link=>link.textContent='Browse the collected cash catalog →');draw();return;}
    rows=catalog.rows.map(row=>normalize(row,catalog)).filter(Boolean);const seen=new Set();rows=rows.filter(row=>{if(seen.has(row.key))return false;seen.add(row.key);return true;});const providerCount=rows.length,ids=new Set(rows.map(row=>row.canonicalId).filter(Number.isInteger));
    for(const raw of catalog.metadataItems||[]){const item=metadata(raw);if(!item||ids.has(item.canonicalId)||raw.providerSlug&&seen.has(raw.providerSlug))continue;rows.push(item);ids.add(item.canonicalId);}
    const metadataCount=rows.length-providerCount;
    const supplemental=references(data);let supplementalOnlyCount=0;for(const ref of supplemental){let matches=rows.filter(r=>r.canonicalId===ref.id&&r.name.toLocaleLowerCase()===ref.name.toLocaleLowerCase());if(matches.length>1)continue;let item=matches[0];if(!item){if(rows.some(r=>r.canonicalId===ref.id))continue;item={name:ref.name,key:'supplemental-'+ref.id,slug:null,canonicalId:ref.id,metadataOnly:false,supplementalOnly:true,publisherMedian:null,price:null,priceDay:null,quantity:null,knownNxCost:null,dailyRate:null,firstObservedDay:null,qualifyingDays:0,historyDays:0,sourceLastSeenAt:null,history:[],isNew:false,short:false,inCashBasket:false,sourceObservations:[]};rows.push(item);supplementalOnlyCount++;}item.supplemental=ref;item.supplementalPrice=ref.price;}
    if(!supplemental.length&&sortKey==='supplementalPrice'){sortKey='name';ascending=true;}
    status.textContent=`${rows.length} displayed cash records · ${providerCount} provider market records + ${metadataCount} metadata-only entries. Daily source published ${time(catalog.sourceUpdatedAt)}. ${rows.filter(row=>row.knownNxCost!==null).length} have configured fixed NX costs; ${rows.filter(row=>row.inCashBasket).length} belong to the frozen Cash Basket. Metadata entries have no market history and change neither cohort nor headline.`;
    if(supplemental.length)status.textContent=`${rows.length} displayed cash records · ${providerCount} provider daily-market records + ${metadataCount} client-metadata records + ${supplementalOnlyCount} separate rolling-only records. ${rows.filter(r=>r.supplemental).length} have separate supplemental rolling references from a ${data.cashPriceReferences.plannedItemCount}-item plan; latest batch completed ${data.cashPriceReferences.latestBatch?.completedAttemptCount??'unknown'} attempts. Each price retains its own capture/window; mixed times are not one market snapshot. Daily source ${time(catalog.sourceUpdatedAt)}. Fixed NX costs, daily history and basket membership are unchanged.`;
    const teddyMetadata=(catalog.metadataItems||[]).some(item=>item.id===1007133);
    page.querySelector('.cash-catalog-teddy').textContent=rows.some(row=>!row.metadataOnly&&(row.slug==='teddy-mask'||row.name.toLocaleLowerCase()==='teddy mask'))?'':teddyMetadata?'Client metadata verifies Teddy Bear Headgear (item 1007133). “Teddy Mask” is not a verified alias or exact matching provider price here; no release date, random-crate value or fixed NX cost is inferred.':'The exact name “Teddy Mask” is absent from this published provider snapshot. That does not establish its release date or availability in game.';
    if(rows.some(r=>r.canonicalId===1007133&&r.supplemental))page.querySelector('.cash-catalog-teddy').textContent='Teddy Bear Headgear (1007133) has a separate rolling scanner reference. This adds no daily-history observation or fixed NX cost. “Teddy Mask” remains an unverified alias.';
    links.forEach(link=>link.textContent=`Browse ${rows.length} collected cash items →`);draw();
  }
  input.addEventListener('input',()=>{pageIndex=0;expanded=null;draw();});input.addEventListener('search',()=>{pageIndex=0;expanded=null;draw();});
  page.addEventListener('click',event=>{const sort=event.target.closest('[data-cash-catalog-sort]');if(sort){const key=sort.dataset.cashCatalogSort;ascending=sortKey===key?!ascending:key==='name'||key==='firstObservedDay'||key==='volatilityRank';sortKey=key;pageIndex=0;draw();page.querySelector('[data-cash-catalog-sort="'+key+'"]')?.focus();return;}const clear=event.target.closest('[data-catalog-clear]');if(clear){input.value='';pageIndex=0;expanded=null;draw();input.focus();return;}const paging=event.target.closest('[data-catalog-page]');if(paging){pageIndex+=paging.dataset.catalogPage==='next'?1:-1;expanded=null;draw();return;}const history=event.target.closest('[data-catalog-history]');if(history){expanded=expanded===history.dataset.catalogHistory?null:history.dataset.catalogHistory;historyKey=0;historyAscending=false;draw();page.querySelector('[data-catalog-history="'+history.dataset.catalogHistory+'"]')?.focus();return;}const historySort=event.target.closest('[data-catalog-history-sort]');if(historySort){const key=Number(historySort.dataset.catalogHistorySort);if(![0,1,2].includes(key))return;historyAscending=historyKey===key?!historyAscending:key===0;historyKey=key;draw();page.querySelector('[data-catalog-history-sort="'+key+'"]')?.focus();}});
  document.addEventListener('astracashcatalogvolatility',event=>{
    const detail=event.detail;volatility=null;
    if(detail?.enabled===true&&day(detail.start)&&day(detail.end)&&Date.parse(detail.end)-Date.parse(detail.start)===6*86400000&&count(detail.eligible)&&count(detail.total)&&detail.eligible<=detail.total&&Array.isArray(detail.rows)&&detail.rows.length<=10000){
      const values=new Map();for(const row of detail.rows){if(row&&/^[a-z0-9][a-z0-9-]*$/.test(row.slug)&&Number.isFinite(row.value)&&row.value>=0&&Number.isInteger(row.rank)&&row.rank>=1&&row.rank<=detail.eligible&&Number.isInteger(row.returns)&&row.returns>=5&&row.returns<=6)values.set(row.slug,{value:row.value,rank:row.rank,returns:row.returns});}
      if(values.size===detail.eligible)volatility={values,eligible:detail.eligible,total:detail.total,title:`${detail.start}–${detail.end}: sample SD of consecutive qualified daily-median log returns × 100. At least five returns; no missing-day bridge or annualization. Rank 1 is highest volatility among all ${detail.eligible} eligible / ${detail.total} provider market items before search or pagination. Metadata-only rows are not ranked.`};
    }
    if(!volatility&&['volatility7','volatilityRank'].includes(sortKey)){sortKey='name';ascending=true;}draw();
  });
  document.addEventListener('astracashcataloglookup',event=>{const detail=event.detail;if(!detail||typeof detail.query!=='string')return;input.value=detail.query;pageIndex=0;expanded=rows.some(row=>row.key===detail.key)?detail.key:null;draw();});
  document.addEventListener('astramarketsnapshot',event=>receive(event.detail));
  receive(null);document.dispatchEvent(new Event('astracashcatalogcolumnsready'));document.dispatchEvent(new Event('astramarkethighlightsready'));
  if(window.location.hash==='#cash-catalog')window.dispatchEvent(new Event('hashchange'));
})();

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "cash-catalog.js", status: "initialization_failed"}})); } catch {}
}

;
/* Astra source: nx-benchmark.js */
try {
(() => {
  'use strict';
  if (window.AstraNxBenchmark) return;

  const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
  // This is a hypothetical comparison, never an observed exchange-rate series.
  function calculate(report) {
    const baseNxRate = report?.baseNxRate, observedNxRate = report?.latest?.nxRate;
    const active = window.AstraGoodsNxBenchmark?.headline(report) ?? window.AstraRollingBenchmark?.headline(report);
    const selected = positive(active?.rate), rolling = selected && active.mode === 'rolling', cpi = selected ? active.currentMpi ?? active.cpi : report?.latest?.cpi;
    if (![baseNxRate, cpi, observedNxRate].every(positive)) return null;
    const anchorMpi = rolling ? active.meanMpi : 100, anchorNxRate = rolling ? active.cashAnchor : baseNxRate;
    const goodsPriceFactor = cpi / anchorMpi;
    const modelBenchmarkRate = selected ? active.rate : baseNxRate * goodsPriceFactor;
    const observedGoodsAdjustedRate = observedNxRate / goodsPriceFactor;
    const goodsBuyingPowerChange = (observedGoodsAdjustedRate / anchorNxRate - 1) * 100;
    if (![goodsPriceFactor, modelBenchmarkRate, observedGoodsAdjustedRate].every(positive)
        || !Number.isFinite(goodsBuyingPowerChange)) return null;
    return Object.freeze({ baseNxRate, cpi, observedNxRate, goodsPriceFactor, anchorMpi, anchorNxRate,
      modelBenchmarkRate, observedGoodsAdjustedRate, goodsBuyingPowerChange, rolling, windowDays: rolling ? active.windowDays : null, mode: selected ? active.mode : 'fixed',
      modelLabel: selected ? active.label : 'Reference-week goods NX benchmark', anchorStart: rolling ? active.startDay : report?.baseStart,
      anchorEnd: rolling ? active.endDay : report?.baseEnd, frozenBenchmarkRate: baseNxRate * cpi / 100,
      fallbackReason: selected ? active.fallbackReason : null });
  }
  window.AstraNxBenchmark = Object.freeze({ calculate });

  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const number = value => value.toLocaleString('en-US', { maximumFractionDigits: 2 });
  const signed = value => { const rounded = Math.abs(value) < .005 ? 0 : value; return (rounded > 0 ? '+' : '') + number(rounded) + '%'; };
  const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value + 'T00:00:00Z'))
    && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value ? value : null;
  const sections = [];
  for (const [id, suffix] of [['view-method', 'method'], ['view-nx', 'nx']]) {
    const view = document.getElementById(id);
    if (!view) continue;
    const section = make('section', 'panel nx-benchmark');
    section.id = suffix === 'method' ? 'method-nx-benchmark' : 'nx-benchmark-' + suffix;
    section.tabIndex = -1;
    section.setAttribute('aria-labelledby', section.id + '-title');
    section.innerHTML = `<p class="eyebrow">MODELLED BENCHMARK / OBSERVED CASH KEPT SEPARATE</p>
      <h2 id="${section.id}-title">NX against the goods price level.</h2>
      <p class="nx-benchmark-intro">Overview uses the hypothetical goods-inflation NX benchmark. The observed daily cash-sale estimate stays separate here for comparison; the actual item-pricing table continues to use its source sale evidence.</p>
      <p class="nx-benchmark-status" role="status"></p>
      <div class="nx-benchmark-results" hidden>
        <p class="nx-benchmark-inputs"></p>
        <div class="nx-benchmark-cards">
          <article><h3 data-nx-model-title>Modelled NX benchmark</h3><strong data-nx-benchmark="model"></strong><p data-nx-model-description></p></article>
          <article><h3>Observed NX, adjusted for goods prices</h3><strong data-nx-benchmark="adjusted"></strong><p data-nx-adjusted-description></p></article>
          <article><h3>Goods buying-power change</h3><strong data-nx-benchmark="change"></strong><p data-nx-change-description></p></article>
        </div>
      </div>
      <details><summary>How this comparison was calculated</summary>
        <p data-nx-model-formula></p>
        <p>Goods MPI uses a fixed source-category-filtered basket: items categorized Cash Shop by the provider are excluded. The Mystery Palette Exchange Coupon remains a disclosed stamp-linked exception; funding origin is not a separate exclusion rule or a fixed NX cost. MPI measures the selected basket, not all items or meso supply.</p>
        <p>The observed NX estimate uses verified fixed-NX items and daily recorded-volume weights. Changes in that trading mix, seasonal demand or supply can move it. Mystery crates and other items without verified fixed NX costs receive no invented NX cost here.</p>
        <p data-nx-model-limit>The reference-week benchmark leaves changes in real NX supply, demand and cash-item composition outside the model. These are different units, not pooled indices, a forecast or executable quotes. The actual daily best/worst-value items remain unchanged.</p>
      </details>`;
    view.append(section);
    sections.push(section);
  }

  let lastReport;
  function receive(report) {
    lastReport = report;
    const values = calculate(report);
    const published = typeof report?.sourceUpdatedAt === 'string' ? report.sourceUpdatedAt : null;
    const sourceDay = date(report?.latest?.day) ?? (published ? date(published.slice(0, 10)) : null);
    const start = date(report?.baseStart), end = date(report?.baseEnd);
    for (const section of sections) {
      const results = section.querySelector('.nx-benchmark-results');
      results.hidden = !values;
      if (!values) {
        section.querySelector('.nx-benchmark-status').textContent = 'Comparison unavailable: a positive frozen NX reference rate, goods MPI and observed daily NX rate are all required. No missing value is treated as zero.';
        section.querySelector('.nx-benchmark-inputs').textContent = '';
        for (const node of section.querySelectorAll('[data-nx-benchmark]')) node.textContent = '';
        continue;
      }
      const state = report?.sourceStatus?.status;
      const period = values.anchorStart && values.anchorEnd ? values.anchorStart + '–' + values.anchorEnd : 'period unavailable', anchorName = values.rolling ? `previous-${values.windowDays}-day anchor` : 'fixed reference week';
      section.querySelector('.nx-benchmark-intro').textContent = `Overview currently uses ${values.modelLabel.toLowerCase()}.${values.mode === 'compare' ? ' Its headline remains fixed-reference while the main chart compares both anchors.' : ''} The observed daily cash-sale estimate stays separate here; the actual item-pricing table retains its source evidence.`;
      section.querySelector('.nx-benchmark-status').textContent = `Dated daily source${sourceDay ? ': ' + sourceDay : '; source day unknown'}${report.latest?.partial ? ' · partial source-calendar day' : ''}.${state === 'degraded' ? ' Source checks are degraded; this comparison uses the retained daily evidence.' : ''}${values.fallbackReason ? ' Rolling fallback: ' + values.fallbackReason + '.' : ''} No new source observations are created by this model.`;
      section.querySelector('.nx-benchmark-inputs').textContent = `Inputs: observed daily estimate 1 NX ≈ ${number(values.observedNxRate)} mesos; goods MPI ${number(values.cpi)} (fixed reference week = 100); active ${anchorName} ${period}: ${number(values.anchorNxRate)} mesos/NX at MPI ${number(values.anchorMpi)}. Goods-basket weights remain fixed${start && end ? ' at ' + start + '–' + end : ''}; the rolling NX anchor is a different period. Frozen-reference model ${number(values.frozenBenchmarkRate)} mesos/NX remains the revert choice.`;
      section.querySelector('[data-nx-model-title]').textContent = values.modelLabel;
      section.querySelector('[data-nx-model-description]').textContent = values.rolling ? `Modelled mesos per NX preserving the previous ${values.windowDays} complete source days’ buying power in the fixed goods basket.` : 'Modelled mesos per NX preserving the frozen reference week’s buying power in the fixed goods basket.';
      section.querySelector('[data-nx-adjusted-description]').textContent = `The observed daily estimate in ${values.rolling ? `previous-${values.windowDays}-day anchor` : 'reference-week'} meso buying-power units; not a pooled price index.`;
      section.querySelector('[data-nx-change-description]').textContent = `Compared with the ${anchorName} NX rate after adjusting for the same goods-price factor.`;
      section.querySelector('[data-nx-model-formula]').textContent = values.rolling ? `Modelled benchmark = prior-${values.windowDays}-complete-day count-weighted known-NX cash anchor × current MPI ÷ arithmetic mean MPI over those same ${values.windowDays} days. Goods-adjusted observed rate = daily observed NX rate ÷ (current MPI ÷ anchor MPI). Buying-power change = (adjusted observed rate ÷ anchor NX rate − 1) × 100%. Every anchor day needs three qualified known-NX items (each daily count ≥5); all ${values.windowDays+1} goods points need at least 80% same-day observed weight. Missing windows are unavailable, with a labelled reference-week fallback.` : 'Modelled benchmark = reference-week NX rate × goods MPI ÷ 100. Goods-adjusted observed rate = daily observed NX rate ÷ (goods MPI ÷ 100). Buying-power change = (goods-adjusted rate ÷ reference-week NX rate − 1) × 100%.';
      section.querySelector('[data-nx-model-limit]').textContent = values.rolling ? 'The rolling anchor itself reflects cash-item composition and real NX supply/demand changes. Scaling it by goods inflation does not remove seasonal cash-market effects. The fixed reference reversion holds the original NX relationship constant instead. These are different units, not pooled indices, a forecast or executable quotes. Actual daily best/worst-value items and source dates remain unchanged.' : 'The reference-week benchmark holds the original NX relationship fixed while changing the selected goods price level. It leaves changes in real NX supply, demand and cash-item composition outside the model. These are different units, not pooled indices, a forecast or executable quotes. Actual daily best/worst-value items and source dates remain unchanged.';
      if (window.AstraRollingBenchmark?.getState().showExplanation) section.querySelector('details').open = true;
      section.querySelector('[data-nx-benchmark="model"]').textContent = '1 NX ≈ ' + number(values.modelBenchmarkRate) + ' mesos';
      section.querySelector('[data-nx-benchmark="adjusted"]').textContent = number(values.observedGoodsAdjustedRate) + (values.rolling ? ' anchor-period mesos / NX' : ' reference-week mesos / NX');
      section.querySelector('[data-nx-benchmark="change"]').textContent = signed(values.goodsBuyingPowerChange);
    }
  }
  document.addEventListener('astramarketsnapshot', event => receive(event.detail));
  document.addEventListener('astrabenchmarkmodechange', () => { receive(lastReport); for (const section of sections) section.querySelector('details').open = window.AstraRollingBenchmark?.getState().showExplanation === true; });
  receive(null);
  if (sections.length) document.dispatchEvent(new Event('astramarkethighlightsready'));
})();

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "nx-benchmark.js", status: "initialization_failed"}})); } catch {}
}

;
/* Astra source: cash-client-catalog.js */
try {
(() => {
  'use strict';
  const host = document.getElementById('view-cash-catalog') || document.getElementById('cash-catalog');
  if (!host || document.getElementById('cash-client-catalog-panel')) return;
  const make = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
  const panel = make('section', 'cash-client-catalog-panel'); panel.id = 'cash-client-catalog-panel';
  const title = make('h2', '', 'Broader client catalog'); title.id = 'cash-client-title'; panel.setAttribute('aria-labelledby', title.id);
  const scope = make('p', 'cash-client-scope', 'Optional client metadata complements the observed market catalog above. A cash flag proves client presence, not release, trading or listing availability. Equipment and hair/face styles are separated. No market price, direct NX cost or release date is inferred; this changes no basket or NX estimate. Cash consumables evidenced elsewhere remain separate.');
  const openControls = make('div', 'cash-client-open-controls chart-comparison-controls');
  const toggle = make('button', 'cash-client-toggle', 'Show broader client catalog'); toggle.type = 'button'; toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-controls', 'cash-client-body'); openControls.append(toggle);
  const body = make('div', 'cash-client-body'); body.id = 'cash-client-body'; body.hidden = true;
  const status = make('p', 'cash-client-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const evidence = make('p', 'cash-client-evidence');
  const controls = make('div', 'cash-client-controls'); controls.hidden = true;
  const searchLabel = make('label', '', 'Search client names or IDs'), search = make('input'); search.type = 'search'; search.autocomplete = 'off'; search.maxLength = 250; search.setAttribute('aria-describedby', 'cash-client-results'); searchLabel.append(search);
  const filterLabel = make('label', '', 'Metadata type'), filter = make('select');
  for (const [value, text] of [['all', 'All client cash metadata'], ['equipment_item', 'Equipment items'], ['appearance_style', 'Hair / face styles']]) { const option = make('option', '', text); option.value = value; filter.append(option); } filterLabel.append(filter);
  const clear = make('button', '', 'Clear search'); clear.type = 'button';
  controls.append(searchLabel, filterLabel, clear);
  const tableHost = make('div', 'table-wrap cash-client-table');
  const paging = make('div', 'cash-client-paging'); paging.hidden = true;
  const previous = make('button', '', 'Previous'), next = make('button', '', 'Next'), results = make('span'); previous.type = next.type = 'button'; results.id = 'cash-client-results'; results.setAttribute('role', 'status'); results.setAttribute('aria-live', 'polite'); paging.append(previous, results, next);
  const limitation = make('p', 'cash-client-limitation', 'This is a dated manual client capture, not an unattended connection or a complete list of released cash-shop goods. Release status, current shop availability, market availability and direct NX cost are unknown in this dataset.');
  const provenance = make('p', 'cash-client-evidence'), provenanceLink = make('a', '', 'View archived source provenance ↗'); provenanceLink.href = 'assets/cash-client-catalog-provenance.json'; provenanceLink.target = '_blank'; provenanceLink.rel = 'noopener noreferrer'; provenance.append(provenanceLink);
  body.append(status, evidence, controls, tableHost, paging, limitation, provenance); panel.append(title, scope, openControls, body); host.append(panel);
  let opened = false, rows = null, loading = null, pageIndex = 0, sortKey = 'name', ascending = true;
  const pageSize = 25, maxBytes = 4 * 1024 * 1024;
  const source = 'https://maplestory.io/api/MCW/1/item/list?cashFilter=true&count=10000';
  const count = value => Number.isInteger(value) && value > 0 && value <= 10000;
  const clock = value => typeof value === 'string' && /(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value));
  const fail = () => { throw new Error('The owned client archive failed validation.'); };
  function validateManifest(value) {
    if (!value || value.schemaVersion !== 1 || value.kind !== 'client_cash_metadata_manifest' || !count(value.recordCount)
      || !Number.isInteger(value.bytes) || value.bytes <= 0 || value.bytes > maxBytes || !clock(value.capturedAt)
      || value.timestampKind !== 'http_response_completed_at' || value.sourceObservedAt !== null || value.sourcePublishedAt !== null
      || typeof value.data !== 'string' || !/^assets\/cash-client-catalog-[a-f0-9]{16}\.json$/.test(value.data)
      || typeof value.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.sha256) || !value.data.endsWith(value.sha256.slice(0, 16) + '.json')) fail();
    const stats = value.stats;
    if (!stats || !Number.isInteger(stats.equipmentItems) || stats.equipmentItems < 0 || !Number.isInteger(stats.appearanceStyles) || stats.appearanceStyles < 0 || stats.equipmentItems + stats.appearanceStyles !== value.recordCount) fail();
    return value;
  }
  function validateData(value, manifest) {
    if (!value || value.schemaVersion !== 1 || value.kind !== 'client_cash_metadata_catalog' || value.provider !== 'maplestory.io'
      || value.region !== 'MCW' || value.clientVersion !== '1' || value.sourceUrl !== source || value.capturedAt !== manifest.capturedAt
      || value.timestampKind !== 'http_response_completed_at' || value.sourceObservedAt !== null || value.sourcePublishedAt !== null
      || value.releaseStatus !== 'unknown' || value.marketAvailability !== null || value.directNxCost !== null
      || value.recordCount !== manifest.recordCount || !Array.isArray(value.records) || value.records.length !== manifest.recordCount) fail();
    const seen = new Set(); let styles = 0;
    const allowed = ['itemId', 'name', 'isCash', 'overallCategory', 'category', 'subCategory', 'metadataKind'];
    for (const row of value.records) {
      if (!row || Object.keys(row).length !== allowed.length || Object.keys(row).some(key => !allowed.includes(key))
        || !Number.isSafeInteger(row.itemId) || row.itemId <= 0 || row.itemId >= 100000000 || seen.has(row.itemId) || row.isCash !== true
        || typeof row.name !== 'string' || !row.name.trim() || row.name.length > 250) fail();
      for (const key of ['overallCategory', 'category', 'subCategory', 'metadataKind']) if (typeof row[key] !== 'string' || !row[key] || row[key].length > 80) fail();
      if (!['equipment_item', 'appearance_style'].includes(row.metadataKind) || (row.category === 'Character') !== (row.metadataKind === 'appearance_style')) fail();
      seen.add(row.itemId); if (row.metadataKind === 'appearance_style') styles++;
    }
    if (styles !== manifest.stats.appearanceStyles || value.records.length - styles !== manifest.stats.equipmentItems
      || value.stats?.appearanceStyles !== styles || value.stats?.equipmentItems !== value.records.length - styles) fail();
    return value.records;
  }
  async function readOwned(relative, limit) {
    const url = new URL(relative, window.location.origin + '/');
    if (url.origin !== window.location.origin || url.search || url.hash) fail();
    const response = await fetch(url.href, { credentials: 'same-origin', cache: relative.endsWith('cash-client-catalog.json') ? 'no-cache' : 'force-cache' });
    if (window.astraPreviewSession?.onResponse(response) === false || !response.ok) throw new Error('The owned archive is unavailable; unlock the preview again if your session expired.');
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > limit) fail();
    return text;
  }
  function draw() {
    if (!rows) return;
    const query = search.value.trim().toLocaleLowerCase(), type = filter.value;
    const filtered = rows.filter(row => (type === 'all' || row.metadataKind === type) && (!query || `${row.name} ${row.itemId} ${row.subCategory}`.toLocaleLowerCase().includes(query)));
    filtered.sort((a, b) => (typeof a[sortKey] === 'number' ? a[sortKey] - b[sortKey] : a[sortKey].localeCompare(b[sortKey], undefined, { numeric: true })) * (ascending ? 1 : -1) || a.itemId - b.itemId);
    pageIndex = Math.max(0, Math.min(pageIndex, Math.max(0, Math.ceil(filtered.length / pageSize) - 1)));
    const visible = filtered.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);
    const table = make('table'), caption = make('caption', '', 'Cash-flagged client metadata · availability and cost unknown'), head = make('thead'), header = make('tr'), tbody = make('tbody');
    for (const [key, label] of [['itemId', 'Item ID'], ['name', 'Client item name'], ['metadataKind', 'Metadata type'], ['subCategory', 'Client category']]) {
      const th = make('th'), button = make('button', 'cash-client-sort', label + (key === sortKey ? ascending ? ' ↑' : ' ↓' : '')); th.scope = 'col'; th.setAttribute('aria-sort', key === sortKey ? ascending ? 'ascending' : 'descending' : 'none'); button.type = 'button'; button.dataset.clientSort = key; button.setAttribute('aria-label', 'Sort all matching client records by ' + label.toLowerCase()); th.append(button); header.append(th);
    }
    head.append(header);
    for (const item of visible) {
      const row = make('tr'); row.dataset.clientItemId = item.itemId;
      for (const text of [String(item.itemId), item.name, item.metadataKind === 'appearance_style' ? 'Hair / face style' : 'Equipment item', item.subCategory]) row.append(make('td', '', text));
      tbody.append(row);
    }
    if (!visible.length) { const td = make('td', '', 'No client records match. Clear the search or change the metadata type.'); td.colSpan = 4; const empty = make('tr'); empty.append(td); tbody.append(empty); }
    table.append(caption, head, tbody); tableHost.replaceChildren(table);
    results.textContent = filtered.length ? `${pageIndex * pageSize + 1}–${pageIndex * pageSize + visible.length} of ${filtered.length.toLocaleString('en-US')} matching client records` : '0 matching client records';
    previous.disabled = pageIndex === 0; next.disabled = (pageIndex + 1) * pageSize >= filtered.length; clear.disabled = !search.value;
  }
  async function load() {
    if (rows || loading) return;
    status.textContent = 'Loading this site’s archived client metadata…';
    loading = (async () => {
      try {
        const manifest = validateManifest(JSON.parse(await readOwned('assets/cash-client-catalog.json', 8192)));
        const text = await readOwned(manifest.data, maxBytes), bytes = new TextEncoder().encode(text);
        if (bytes.byteLength !== manifest.bytes || !window.crypto?.subtle) fail();
        const hash = [...new Uint8Array(await window.crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('');
        if (hash !== manifest.sha256) fail();
        rows = validateData(JSON.parse(text), manifest);
        status.textContent = `${rows.length.toLocaleString('en-US')} cash-flagged client records · ${manifest.stats.equipmentItems.toLocaleString('en-US')} equipment items · ${manifest.stats.appearanceStyles.toLocaleString('en-US')} hair/face styles.`;
        evidence.textContent = 'HTTP capture completed ' + manifest.capturedAt + '. Underlying source publication/release time unknown. Original client: MCW/1; provider: MapleStory.io.';
        controls.hidden = paging.hidden = false; draw();
      } catch (error) {
        rows = null; controls.hidden = paging.hidden = true; tableHost.replaceChildren();
        status.textContent = 'Client metadata could not be loaded or validated. Existing market data and estimates are unchanged. Close and reopen to retry.';
      } finally { loading = null; }
    })();
    await loading;
  }
  toggle.addEventListener('click', () => { opened = !opened; body.hidden = !opened; toggle.setAttribute('aria-expanded', String(opened)); toggle.textContent = opened ? 'Hide broader client catalog' : 'Show broader client catalog'; if (opened) load(); });
  search.addEventListener('input', () => { pageIndex = 0; draw(); }); search.addEventListener('search', () => { pageIndex = 0; draw(); });
  filter.addEventListener('change', () => { pageIndex = 0; draw(); });
  clear.addEventListener('click', () => { search.value = ''; pageIndex = 0; draw(); search.focus(); });
  search.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); clear.click(); } });
  previous.addEventListener('click', () => { pageIndex--; draw(); }); next.addEventListener('click', () => { pageIndex++; draw(); });
  tableHost.addEventListener('click', event => { const button = event.target.closest('[data-client-sort]'); if (!button) return; const key = button.dataset.clientSort; if (!['itemId', 'name', 'metadataKind', 'subCategory'].includes(key)) return; ascending = sortKey === key ? !ascending : true; sortKey = key; pageIndex = 0; draw(); tableHost.querySelector(`[data-client-sort="${key}"]`)?.focus(); });
})();

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "cash-client-catalog.js", status: "initialization_failed"}})); } catch {}
}

;
/* Astra source: rate-arrival.js */
try {
(() => {
  'use strict';
  if (window.AstraRateArrival) return;
  const positive = v => typeof v === 'number' && Number.isFinite(v) && v > 0;
  function points(report) {
    if (!report) return [];
    const selected = window.AstraGoodsNxBenchmark?.history?.(report) ?? window.AstraRollingBenchmark?.series(report)?.[0]?.points;
    if (selected) return selected.filter(point => /^\d{4}-\d{2}-\d{2}$/.test(point.day || '') && positive(point.value)).map(point => ({ day: point.day, at: point.at, value: point.value, partial: !!point.partial })).sort((a,b) => a.day.localeCompare(b.day)).slice(-3);
    if (!positive(report?.baseNxRate)) return [];
    const days = new Map();
    for (const row of [...(report.history || []), report.latest].filter(Boolean)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(row.day || '') || !positive(row.cpi)) continue;
      const value = report.baseNxRate * (row.cpi / 100);
      if (positive(value)) days.set(row.day, { day: row.day, at: row.at || row.day, value, partial: !!row.partial });
    }
    return [...days.values()].sort((a,b) => a.day.localeCompare(b.day)).slice(-3);
  }
  window.AstraRateArrival = Object.freeze({ points });
  const value = document.getElementById('main-rate'), copy = document.querySelector('.hero-copy');
  if (!value || !copy) return;
  const status = document.createElement('p'); status.id = 'rate-arrival-status';
  status.className = 'rate-arrival-status'; status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite'); copy.append(status);
  const options = document.getElementById('display-options');
  const group = document.createElement('div'); group.className = 'hero-layout-options rate-arrival-options';
  group.setAttribute('role','group'); group.setAttribute('aria-label','Recent calculation animation');
  const toggle = document.createElement('button'); toggle.type = 'button';
  toggle.setAttribute('aria-controls','main-rate rate-arrival-status'); group.append(toggle);
  const styleChoices = document.createElement('div'); styleChoices.className = 'rate-arrival-style-choices'; styleChoices.setAttribute('role', 'group'); styleChoices.setAttribute('aria-label', 'Headline animation style');
  const note = document.createElement('small'); note.textContent = 'Actual stored calculations and source updates only; no simulated live ticks. Still keeps the latest snapshot.';
  group.append(styleChoices, note); options?.append(group);
  const key = 'astra-rate-arrival', styleKey = 'astra-rate-arrival-style-v1'; let enabled = true, style = 'ticks', report, lastKey, lastInputKey, generation = 0;
  const pending = new Set();
  try { enabled = localStorage.getItem(key) !== 'off'; } catch { /* Device motion preference still applies. */ }
  try { const saved = localStorage.getItem(styleKey); if (['ticks', 'fade', 'pulse'].includes(saved)) style = saved; } catch { /* Source ticks remains the default. */ }
  for (const [choice, label] of [['ticks', 'Source ticks'], ['fade', 'Fade'], ['pulse', 'Update pulse'], ['still', 'Still']]) {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.rateArrivalStyle = choice; button.textContent = label;
    button.setAttribute('aria-controls', 'main-rate rate-arrival-status');
    button.addEventListener('click', () => {
      enabled = choice !== 'still'; if (enabled) style = choice;
      try { localStorage.setItem(key, enabled ? 'on' : 'off'); if (enabled) localStorage.setItem(styleKey, style); } catch {}
      renderChoice(); draw(true);
    }); styleChoices.append(button);
  }
  const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const format = v => v.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  const date = day => new Date(day+'T12:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'});
  const renderChoice = () => {
    toggle.textContent = 'Recent calculation animation: '+(enabled?'On':'Off');
    toggle.setAttribute('aria-pressed',String(enabled));
    group.dataset.arrivalStyle = enabled ? style : 'still';
    for (const button of styleChoices.querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.rateArrivalStyle === (enabled ? style : 'still')));
  };
  // Normalize actual timestamp-bearing source fields, never collection checks,
  // display clocks, inferred daily midnights or the time this function runs.
  const sourceTime = raw => typeof raw === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(raw) && Number.isFinite(Date.parse(raw)) ? new Date(raw).toISOString() : null;
  const hash = raw => typeof raw === 'string' && /^[a-f0-9]{64}$/i.test(raw) ? raw.toLowerCase() : null;
  function cancel() { ++generation; for (const timer of pending) clearTimeout(timer); pending.clear(); value.classList.remove('rate-source-arrived', 'rate-source-fade'); }
  function later(fn, delay) { const timer = setTimeout(() => { pending.delete(timer); fn(); }, delay); pending.add(timer); }
  function arrival() { value.classList.remove('rate-source-arrived', 'rate-source-fade'); void value.offsetWidth; value.classList.add(style === 'fade' ? 'rate-source-fade' : 'rate-source-arrived'); }
  value.addEventListener('animationend', event => { if (['rate-source-arrival', 'rate-source-fade'].includes(event.animationName)) value.classList.remove('rate-source-arrived', 'rate-source-fade'); });
  function draw(force = false) {
    cancel();
    const current = generation, series = points(report), headline = window.AstraGoodsNxBenchmark?.headline(report);
    const definition = { base: positive(report?.baseNxRate) ? report.baseNxRate : null, selectedMode: headline?.mode || window.AstraRollingBenchmark?.getState().mode || 'fixed', anchorWindowDays: headline?.mode==='rolling'?headline.windowDays:null, methodVersion: report?.methodVersion, basketVersion: report?.basketVersion,
      specificationHash: hash(report?.specificationHash), basketHash: hash(report?.basketHash) };
    const dailyKey = JSON.stringify({ definition, sourceAt: sourceTime(report?.sourceUpdatedAt), series });
    const liveKey = JSON.stringify({ definition, at: sourceTime(report?.live?.observedAt), cpi: positive(report?.live?.cpi) ? report.live.cpi : null });
    const inputKey = JSON.stringify([dailyKey, liveKey]);
    const live = !!headline?.live && positive(headline.rate) && sourceTime(headline.at) === sourceTime(report?.live?.observedAt) && sourceTime(headline.at) !== null;
    const fingerprint = live ? liveKey : dailyKey;
    // Both input and selected calculation must change. If a qualified point
    // merely ages out under the headline helper, wall-clock passage is not
    // treated as a new source observation or used to start an animation.
    const changed = inputKey !== lastInputKey && fingerprint !== lastKey;
    lastInputKey = inputKey; lastKey = fingerprint;
    if (headline && !positive(headline.rate)) { value.textContent='—';status.textContent='Selected benchmark unavailable; no older value is presented as current.';status.dataset.phase='unavailable';return; }
    // Qualified intraday MPI has its own real source clock; never replace it
    // with a daily animation or pretend daily points are successive live ticks.
    if (live) {
      value.textContent = format(headline.rate);
      status.textContent='Latest qualified goods calculation · see source time above.'; status.dataset.phase='live';
      if ((changed || (force && style !== 'ticks')) && enabled && !motion?.matches) arrival();
      return;
    }
    if (!series.length) { if(positive(headline?.rate))value.textContent=format(headline.rate);status.textContent=''; delete status.dataset.phase; return; }
    const latest = series.at(-1);
    const trail = series.map(p => date(p.day)+': '+format(p.value)).join(' → ');
    const finish = () => {
      if (current !== generation) return;
      value.textContent = format(latest.value);
      status.textContent = 'Latest available · '+date(latest.day)+(latest.partial?' (partial source day)':'')+'. Recent source-day calculations: '+trail+'.';
      status.dataset.phase = 'latest';
      if ((changed || (force && style !== 'ticks')) && enabled && !motion?.matches) arrival();
    };
    if (!enabled || motion?.matches || style === 'pulse' || series.length < 2 || (!force && !changed)) { finish(); return; }
    status.dataset.phase='history';
    // Show actual stored points only. No interpolated values are invented.
    series.slice(0,-1).forEach((point,index) => later(() => {
      if (current !== generation) return;
      value.textContent=format(point.value);
      if (style === 'fade') arrival();
      status.textContent='Recent source-day calculation · '+date(point.day)+' → latest '+date(latest.day)+'.';
    },index*650));
    later(finish,(series.length-1)*650);
  }
  toggle.addEventListener('click',() => {
    enabled=!enabled; try { localStorage.setItem(key,enabled?'on':'off'); } catch {}
    renderChoice(); draw(true);
  });
  motion?.addEventListener?.('change',() => draw());
  document.addEventListener('astramarketsnapshot',event => { report=event.detail; draw(); });
  document.addEventListener('astrabenchmarkmodechange',()=>{if(report)draw();});
  renderChoice(); document.dispatchEvent(new Event('astramarkethighlightsready'));
})();

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "rate-arrival.js", status: "initialization_failed"}})); } catch {}
}

;
/* Astra source: panel-size-preview.js */
try {
(() => {
  'use strict';
  const movers = document.getElementById('movers'), panel = movers?.closest('.panel');
  if (!panel || document.getElementById('mover-size-options')) return;
  panel.classList.add('mover-size-preview');
  const key = 'astra-mover-panel-size';
  const captionKey='astra-mover-impact-caption', heading=panel.querySelector('h2');
  const caption=document.createElement('p');caption.className='mover-impact-caption';
  caption.append(document.createTextNode('Most impacted by inflation '));
  const help=document.createElement('a');help.href='#method-weights';help.textContent='?';help.setAttribute('aria-label','Ranked by contribution to the index; item-specific supply and demand can also change prices.');
  const sup=document.createElement('sup');sup.append(help);caption.append(sup);heading?.after(caption);
  const group = document.createElement('div'); group.id='mover-size-options';
  group.className='panel-size-options'; group.dataset.previewControls='true';
  group.setAttribute('role','group'); group.setAttribute('aria-label','Index movers panel width');
  const label=document.createElement('span');label.textContent='Panel width';group.append(label);
  function select(value) {
    const size=value==='full'?'full':'compact';panel.dataset.panelSize=size;
    for(const button of group.querySelectorAll('button[data-panel-size-choice]'))button.setAttribute('aria-pressed',String(button.dataset.panelSizeChoice===size));
  }
  for(const [mode,label] of [['full','Full width'],['compact','Compact width']]) {
    const button=document.createElement('button');button.type='button';button.dataset.panelSizeChoice=mode;button.textContent=label;
    button.addEventListener('click',()=>{select(mode);try{localStorage.setItem(key,mode)}catch{}});group.append(button);
  }
  const captionToggle=document.createElement('button');captionToggle.type='button';
  let captionOn=true;try{captionOn=localStorage.getItem(captionKey)!=='off'}catch{}
  const updateCaption=()=>{caption.hidden=!captionOn;panel.dataset.impactCaption=captionOn?'on':'off';captionToggle.textContent='Impact heading: '+(captionOn?'On':'Off');captionToggle.setAttribute('aria-pressed',String(captionOn))};
  captionToggle.addEventListener('click',()=>{captionOn=!captionOn;try{localStorage.setItem(captionKey,captionOn?'on':'off')}catch{}updateCaption()});group.append(captionToggle);updateCaption();
  const note=document.createElement('small');note.textContent='Preview this panel only; data and column proportions stay the same.';group.append(note);panel.append(group);
  let saved;try{saved=localStorage.getItem(key)}catch{}select(saved);
})();

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "panel-size-preview.js", status: "initialization_failed"}})); } catch {}
}

;
/* Astra source: price-check.js */
try {
(() => {
  'use strict';
  const content=document.getElementById('content'),header=document.querySelector('header.masthead');
  if(!content||!header||document.getElementById('view-price-check'))return;
  const make=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;};
  const positive=value=>Number.isFinite(value)&&value>0,validSlug=value=>typeof value==='string'&&/^[a-z0-9][a-z0-9-]*$/.test(value),validId=value=>Number.isInteger(value)&&value>0;
  const validDay=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
  const number=(value,d=0)=>Number.isFinite(value)?value.toLocaleString('en-US',{maximumFractionDigits:d}):'Unknown';
  const nav=document.querySelector('.nav-wrap nav')||document.querySelector('nav');
  const headerSearch=make('form','price-check-nav price-check-searchbar');headerSearch.setAttribute('role','search');headerSearch.setAttribute('aria-label','Price check / Search for an Item');
  const headerLabel=make('label','price-check-search-label','Price check / Search for an Item');headerLabel.htmlFor='price-check-header-query';
  const headerInput=make('input');headerInput.id='price-check-header-query';headerInput.type='search';headerInput.placeholder='Search for an Item';headerInput.autocomplete='off';headerInput.maxLength=250;
  const headerSubmit=make('button','','Search');headerSubmit.type='submit';headerSearch.append(headerLabel,headerInput,headerSubmit);
  if(nav){const fallback=nav.querySelector('.fallback-link');if(fallback)fallback.before(headerSearch);else nav.append(headerSearch);}else header.append(headerSearch);
  const page=make('section','view price-check');page.id='view-price-check';page.hidden=true;page.setAttribute('aria-labelledby','price-check-title');
  page.innerHTML=`<div class="page-heading"><div><p class="eyebrow">PUBLIC TRACKED GOODS + CASH CATALOG</p><h1 id="price-check-title">Price check / Search for an Item</h1><p>Search the public tracked records. Unknown market prices remain unknown.</p></div></div><p class="notice price-check-coverage" role="status"></p><div class="price-check-controls"><label>Search collected items<input type="search" id="price-check-query" autocomplete="off" placeholder="Item name or evidence type" aria-describedby="price-check-results"></label><button type="button" data-price-clear>Clear</button><button type="button" data-price-page="previous">Previous</button><span id="price-check-results" aria-live="polite" role="status"></span><button type="button" data-price-page="next">Next</button></div><div class="table-wrap price-check-table"></div><p class="price-check-limits">Qualified daily prices require at least five recorded source sales and retain their price day; earlier qualifying prices can be shown with that earlier date. Source summary medians have an unspecified window. A client metadata record establishes neither a market price nor release/availability. Fixed NX costs are used only where supplied by the configured known-price schedule; random-crate costs and contents are not item prices. These source-inferred aggregates are not executable trade quotes. The complete daily feed and the entire game are outside this public lookup’s coverage.</p>`;
  content.append(page);const input=page.querySelector('input'),result=page.querySelector('#price-check-results'),tableHost=page.querySelector('.price-check-table'),coverage=page.querySelector('.price-check-coverage');
  let records=[],query='',pageIndex=0,sortKey='name',ascending=true;const pageSize=25;
  // The navbar scrolls horizontally. A body-level popup avoids clipping its suggestions.
  const popup=make('div','price-check-autocomplete');popup.hidden=true;
  const popupStatus=make('p','price-check-suggestion-status');popupStatus.setAttribute('role','status');popupStatus.setAttribute('aria-live','polite');
  const list=make('ul','price-check-suggestions');list.id='price-check-suggestion-list';list.setAttribute('role','listbox');list.setAttribute('aria-label','Collected item suggestions');
  const viewAll=make('button','price-check-view-all','View all matches');viewAll.type='button';popup.append(popupStatus,list,viewAll);document.body.append(popup);
  let activeInput=null,activeIndex=-1,suggestions=[],suppressFocus=false;
  const sourceDay=value=>typeof value==='string'&&validDay(value.slice(0,10))?value.slice(0,10):null;
  const safeSprite=value=>typeof value==='string'&&/^assets\/[a-zA-Z0-9._-]+\.(png|webp|gif|svg)$/.test(value)?value:null;
  function sprite(row){const image=make('img','price-check-sprite');image.src=row.sprite||'assets/leaf.png';image.alt='';image.width=32;image.height=32;image.dataset.spriteKind=row.sprite?'item':'generic';image.title=row.sprite?'Original game icon · Nexon via MapleStory.io':'Generic icon · item sprite unavailable';image.addEventListener('error',()=>{image.hidden=true;image.parentElement?.classList.add('price-check-sprite-unavailable');},{once:true});return image;}
  const matches=row=>[row.name,row.type,row.slug,row.id].join(' ').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  function closeSuggestions(){popup.hidden=true;activeIndex=-1;suggestions=[];for(const field of [headerInput,input]){field.setAttribute('aria-expanded','false');field.removeAttribute('aria-activedescendant');}}
  function positionSuggestions(){if(popup.hidden||!activeInput)return;const rect=activeInput.getBoundingClientRect(),width=Math.min(Math.max(rect.width,340),Math.max(0,window.innerWidth-16)),below=Math.max(0,window.innerHeight-rect.bottom-13),above=Math.max(0,rect.top-13),up=below<220&&above>below,height=Math.min(520,up?above:below);popup.style.width=width+'px';popup.style.left=Math.max(8,Math.min(rect.left,window.innerWidth-width-8))+'px';popup.style.top=Math.max(8,up?rect.top-height-5:rect.bottom+5)+'px';popup.style.maxHeight=height+'px';}
  function setActive(index){activeIndex=index;[...list.children].forEach((option,i)=>option.setAttribute('aria-selected',String(i===index)));if(index>=0&&suggestions[index])activeInput?.setAttribute('aria-activedescendant','price-check-option-'+index);else activeInput?.removeAttribute('aria-activedescendant');list.children[index]?.scrollIntoView?.({block:'nearest'});}
  function drawSuggestions(){
    if(popup.hidden||!activeInput)return;const text=query.trim().toLocaleLowerCase(),all=records.filter(matches).sort((a,b)=>{const rank=row=>row.name.toLocaleLowerCase()===text?0:row.name.toLocaleLowerCase().startsWith(text)?1:2;return rank(a)-rank(b)||a.name.localeCompare(b.name)||a.key.localeCompare(b.key);});
    suggestions=all.slice(0,8);list.replaceChildren();activeIndex=-1;activeInput.removeAttribute('aria-activedescendant');
    suggestions.forEach((row,i)=>{const option=make('li','price-check-suggestion');option.id='price-check-option-'+i;option.setAttribute('role','option');option.setAttribute('aria-selected','false');option.dataset.priceSuggestion=String(i);option.dataset.priceKey=row.key;const description=make('span','price-check-suggestion-copy');description.append(make('strong','',row.name),make('small','',row.type+(row.id?' · item '+row.id:'')+(row.sprite?'':' · generic icon')),make('small','price-check-suggestion-date',row.evidenceDate));option.append(sprite(row),description);list.append(option);});
    popupStatus.textContent=all.length?`${all.length} collected matches · showing ${suggestions.length}${all.length>8?' · type more to narrow':''}`:records.length?'No matching collected record. This does not establish game absence.':'No public records connected yet.';
    viewAll.textContent=all.length?`View all ${all.length} matches`:'Open price check';positionSuggestions();
  }
  function openSuggestions(field){activeInput=field;popup.hidden=false;for(const item of [headerInput,input])item.setAttribute('aria-expanded',String(item===field));drawSuggestions();}
  function openResults(){closeSuggestions();window.location.hash='#price-check';window.dispatchEvent(new Event('hashchange'));suppressFocus=true;input.focus();suppressFocus=false;}
  function openRecord(row){closeSuggestions();if(row.catalog&&validId(row.id)){window.location.hash='#item/id-'+row.id;window.dispatchEvent(new Event('hashchange'));}else if(row.catalog){window.location.hash='#cash-catalog';window.dispatchEvent(new Event('hashchange'));document.dispatchEvent(new CustomEvent('astracashcataloglookup',{detail:{key:row.catalogKey,query:row.name}}));}else{window.location.hash='#item/'+encodeURIComponent(row.slug);window.dispatchEvent(new Event('hashchange'));}}
  const columns=[['name','Item / evidence'],['price','Qualified daily price · mesos'],['publisherMedian','Source summary median'],['knownNxCost','Fixed NX cost'],['dailyRate','Daily mesos / NX'],['priceDay','Price day'],['action','History']];
  const activeColumns=()=>records.some(r=>r.rollingReference)?[...columns.slice(0,-1),['rollingPrice','Separate rolling median · mesos'],columns.at(-1)]:columns;
  function collect(data){
    const rows=[],bySlug=new Map(),byId=new Map();
    function add(raw,type,fromCatalog=false){
      if(!raw||!validSlug(raw.slug)||typeof raw.name!=='string')return;
      const id=validId(raw.canonicalId)?raw.canonicalId:null,existing=bySlug.get(raw.slug)||(id?byId.get(id):null);
      if(existing){if(fromCatalog){const qualified=positive(raw.price)&&validDay(raw.priceDay)&&Number.isInteger(raw.quantity)&&raw.quantity>=5;existing.price=qualified?raw.price:null;existing.priceDay=qualified?raw.priceDay:null;existing.type=type;existing.catalogKey=raw.slug;existing.catalog=true;existing.publisherMedian=positive(raw.publisherMedian)?raw.publisherMedian:null;existing.knownNxCost=positive(raw.knownNxCost)?raw.knownNxCost:null;existing.dailyRate=existing.price!==null&&existing.knownNxCost!==null?existing.price/existing.knownNxCost:null;if(id){existing.id=id;byId.set(id,existing);}bySlug.set(raw.slug,existing);}return;}
      const qualified=positive(raw.price)&&validDay(raw.priceDay)&&Number.isInteger(raw.quantity)&&raw.quantity>=5;
      const price=qualified?raw.price:null,nx=fromCatalog?(positive(raw.knownNxCost)?raw.knownNxCost:null):(type==='Known-price cash'&&positive(raw.nx)?raw.nx:null);
      const row={key:raw.slug,slug:raw.slug,id,name:raw.name,type,price,priceDay:qualified?raw.priceDay:null,publisherMedian:positive(raw.publisherMedian)?raw.publisherMedian:positive(raw.sourceSummary?.medianSale)?raw.sourceSummary.medianSale:null,knownNxCost:nx,dailyRate:price!==null&&nx!==null?price/nx:null,catalog:fromCatalog,catalogKey:raw.slug,metadata:false};
      rows.push(row);bySlug.set(raw.slug,row);if(id)byId.set(id,row);
    }
    for(const row of data.rows||[])add(row,'Tracked goods');for(const row of data.contextItems||[])add(row,'Tracked goods context');
    for(const row of data.cash||[])add(row,'Known-price cash');
    const catalog=data.cashCatalog;if(catalog?.schemaVersion===1&&catalog.kind==='cash_shop_source_catalog'){
      for(const row of catalog.rows||[])add(row,'Cash provider market',true);
      for(const raw of catalog.metadataItems||[]){if(!raw||!validId(raw.id)||typeof raw.name!=='string'||raw.cash!==true||raw.marketDataAvailable!==false||byId.has(raw.id)||raw.providerSlug&&bySlug.has(raw.providerSlug))continue;const row={key:'metadata-'+raw.id,slug:null,id:raw.id,name:raw.name,type:'Client metadata only',price:null,priceDay:null,publisherMedian:null,knownNxCost:null,dailyRate:null,catalog:true,catalogKey:'metadata-'+raw.id,metadata:true,metadataDate:sourceDay(raw.metadataCapturedAt)};rows.push(row);byId.set(raw.id,row);}
    }
    const refs=data.cashPriceReferences;if(refs?.schemaVersion===1&&refs.kind==='supplemental_cash_rolling_references'&&refs.sourceUrl==='https://mesos.watch/'&&Array.isArray(refs.items)){const seenRefs=new Set();for(const ref of refs.items){if(!ref||!validId(ref.id)||seenRefs.has(ref.id)||ref.id!==ref.expectedItemId||typeof ref.name!=='string'||typeof ref.expectedItemName!=='string'||ref.name.toLocaleLowerCase()!==ref.expectedItemName.toLocaleLowerCase()||ref.priceBasis!=='median of sales'||!positive(ref.price)||!Number.isInteger(ref.salesCounted)||ref.salesCounted<1||!positive(ref.windowDays)||ref.windowDays>90||!Number.isFinite(Date.parse(ref.capturedAt))||!/(?:Z|[+-]\d\d:\d\d)$/.test(ref.capturedAt))continue;seenRefs.add(ref.id);let row=byId.get(ref.id);if(row&&row.name.toLocaleLowerCase()!==ref.name.toLocaleLowerCase())continue;if(!row){row={key:'supplemental-'+ref.id,slug:null,id:ref.id,name:ref.name,type:'Separate rolling reference',price:null,priceDay:null,publisherMedian:null,knownNxCost:null,dailyRate:null,catalog:true,catalogKey:'supplemental-'+ref.id,metadata:false,supplementalOnly:true};rows.push(row);byId.set(ref.id,row);}row.rollingReference=ref;row.rollingPrice=ref.price;if(row.metadata)row.type='Client metadata + separate rolling reference';}}
    for(const row of rows){row.sprite=safeSprite(data.spriteMap?.[row.slug]||data.spriteMap?.[row.id]);row.evidenceDate=row.metadata?`${row.metadataDate?'Metadata receipt '+row.metadataDate:'Metadata receipt time unknown'} · source time unknown`:row.priceDay?'Qualified daily price · '+row.priceDay:`${sourceDay(data.sourceUpdatedAt)?'Source snapshot '+sourceDay(data.sourceUpdatedAt):'Source date unknown'} · no qualified daily price`;}
    for(const row of rows)if(row.rollingReference)row.evidenceDate+=` · separate rolling median ${number(row.rollingPrice,1)} mesos / ${row.rollingReference.windowDays}-day lookback, captured ${row.rollingReference.capturedAt}; underlying time ${row.rollingReference.observationTimestampKnown&&row.rollingReference.sourceObservedAt?row.rollingReference.sourceObservedAt:'unknown'}`;
    return rows;
  }
  function draw(){
    const filtered=records.filter(matches).sort((a,b)=>{const av=a[sortKey],bv=b[sortKey];if(av===null||av===undefined)return bv===null||bv===undefined?a.key.localeCompare(b.key):1;if(bv===null||bv===undefined)return -1;const delta=typeof av==='number'&&typeof bv==='number'?av-bv:String(av).localeCompare(String(bv),undefined,{numeric:true});return delta*(ascending?1:-1)||a.key.localeCompare(b.key);});
    pageIndex=Math.min(pageIndex,Math.max(0,Math.ceil(filtered.length/pageSize)-1));const shown=filtered.slice(pageIndex*pageSize,(pageIndex+1)*pageSize),table=make('table');table.dataset.searchReady='true';table.setAttribute('aria-label','Price check results');const head=table.createTHead().insertRow();
    for(const [key,title] of activeColumns()){const th=make('th');if(key==='action')th.textContent=title;else{th.setAttribute('aria-sort',key===sortKey?(ascending?'ascending':'descending'):'none');const button=make('button','',title+(key===sortKey?(ascending?' ↑':' ↓'):''));button.type='button';button.dataset.priceSort=key;th.append(button);}head.append(th);}
    const body=table.createTBody();for(const row of shown){const tr=body.insertRow();tr.dataset.priceKey=row.key;const name=tr.insertCell(),label=make('span','price-check-item-copy');label.append(make('strong','',row.name),make('small','',row.type+(row.id?' · item '+row.id:'')));name.append(sprite(row),label);tr.insertCell().textContent=number(row.price,1);tr.insertCell().textContent=number(row.publisherMedian,1);tr.insertCell().textContent=number(row.knownNxCost);tr.insertCell().textContent=number(row.dailyRate,2);tr.insertCell().textContent=row.priceDay||(row.rollingReference?'No daily market date':'No market date');if(records.some(r=>r.rollingReference)){const cell=tr.insertCell();cell.append(make('span','',number(row.rollingPrice,1)));if(row.rollingReference)cell.append(make('small','',`${row.rollingReference.windowDays}-day reported lookback · captured ${row.rollingReference.capturedAt} · source time ${row.rollingReference.observationTimestampKnown&&row.rollingReference.sourceObservedAt?row.rollingReference.sourceObservedAt:'unknown'}; not daily / live / fixed NX`));}const action=tr.insertCell();if(row.catalog){const button=make('button','price-check-evidence',row.rollingReference?'Separate rolling evidence':row.metadata?'Metadata evidence':'Cash history');button.type='button';button.dataset.priceCatalog=row.key;action.append(button);}else{const link=make('a','','Item history →');link.href='#item/'+encodeURIComponent(row.slug);action.append(link);}}
    if(!shown.length){const td=body.insertRow().insertCell();td.colSpan=activeColumns().length;td.textContent='No matching public tracked record. This does not establish that an item is absent from the game.';}
    tableHost.replaceChildren(table);result.textContent=filtered.length?`${pageIndex*pageSize+1}–${pageIndex*pageSize+shown.length} of ${filtered.length} matches · ${records.length} public records`:`0 matches · ${records.length} public records`;
    page.querySelector('[data-price-page="previous"]').disabled=pageIndex===0;page.querySelector('[data-price-page="next"]').disabled=(pageIndex+1)*pageSize>=filtered.length;page.querySelector('[data-price-clear]').disabled=!query;
  }
  function receive(data){records=collect(data||{});const goods=records.filter(row=>row.type.startsWith('Tracked goods')).length,cash=records.filter(row=>!row.metadata&&!row.type.startsWith('Tracked goods')).length,metadata=records.filter(row=>row.metadata).length;coverage.textContent=`${records.length} deduplicated public records: ${goods} tracked goods/context + ${cash} cash market records + ${metadata} ${records.some(r=>r.rollingReference)?'client-metadata records (separate rolling evidence labeled)':'metadata-only'}. Coverage is public tracked goods plus the cash catalog, not all feed items or the entire game. Daily source ${data?.sourceUpdatedAt||'not connected yet'}; metadata clocks are separate.`;if(records.some(r=>r.rollingReference)){const only=records.filter(r=>r.supplementalOnly).length,refs=records.filter(r=>r.rollingReference).length;coverage.textContent=`${records.length} deduplicated public records: ${goods} tracked goods/context + ${cash-only} cash provider records + ${only} rolling-only records + ${metadata} client-metadata records. ${refs} have separate supplemental rolling medians with individual capture windows/clocks; these are not additional daily observations or verified NX costs. Daily source ${data?.sourceUpdatedAt||'unknown'}. Coverage is collected public records, not all feed items or the entire game.`;}draw();drawSuggestions();}
  const setQuery=value=>{query=String(value).slice(0,250);for(const field of [headerInput,input])if(field.value!==query)field.value=query;pageIndex=0;draw();drawSuggestions();};
  for(const field of [headerInput,input]){
    field.setAttribute('role','combobox');field.setAttribute('aria-autocomplete','list');field.setAttribute('aria-controls',list.id);field.setAttribute('aria-expanded','false');field.maxLength=250;
    field.addEventListener('focus',()=>{if(!suppressFocus)openSuggestions(field);});
    field.addEventListener('input',()=>{setQuery(field.value);openSuggestions(field);});field.addEventListener('search',()=>{setQuery(field.value);openSuggestions(field);});
    field.addEventListener('keydown',event=>{if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();if(popup.hidden||activeInput!==field)openSuggestions(field);if(suggestions.length)setActive((activeIndex+(event.key==='ArrowDown'?1:activeIndex<0?0:-1)+suggestions.length)%suggestions.length);}else if(event.key==='Enter'){event.preventDefault();const row=!popup.hidden&&activeInput===field?suggestions[activeIndex]:null;if(row)openRecord(row);else openResults();}else if(event.key==='Escape'){event.preventDefault();closeSuggestions();}else if(event.key==='Tab')closeSuggestions();});
  }
  headerSearch.addEventListener('submit',event=>{event.preventDefault();openResults();});viewAll.addEventListener('click',openResults);
  popup.addEventListener('mousedown',event=>event.preventDefault());popup.addEventListener('click',event=>{const option=event.target.closest('[data-price-suggestion]');if(option&&suggestions[Number(option.dataset.priceSuggestion)])openRecord(suggestions[Number(option.dataset.priceSuggestion)]);});
  document.addEventListener('pointerdown',event=>{if(!popup.contains(event.target)&&event.target!==headerInput&&event.target!==input)closeSuggestions();});document.addEventListener('focusin',event=>{if(event.target!==headerInput&&event.target!==input&&!popup.contains(event.target))closeSuggestions();});
  window.addEventListener('resize',positionSuggestions);window.addEventListener('scroll',positionSuggestions,true);window.addEventListener('hashchange',closeSuggestions);
  page.addEventListener('click',event=>{const clear=event.target.closest('[data-price-clear]');if(clear){setQuery('');input.focus();openSuggestions(input);return;}const paging=event.target.closest('[data-price-page]');if(paging){pageIndex+=paging.dataset.pricePage==='next'?1:-1;draw();return;}const sort=event.target.closest('[data-price-sort]');if(sort){const key=sort.dataset.priceSort;ascending=sortKey===key?!ascending:key==='name'||key==='priceDay';sortKey=key;pageIndex=0;draw();page.querySelector('[data-price-sort="'+key+'"]')?.focus();return;}const evidence=event.target.closest('[data-price-catalog]');if(evidence){const row=records.find(item=>item.key===evidence.dataset.priceCatalog);if(row)openRecord(row);}});
  document.addEventListener('astramarketsnapshot',event=>receive(event.detail));receive(null);document.dispatchEvent(new Event('astramarkethighlightsready'));if(window.location.hash==='#price-check')window.dispatchEvent(new Event('hashchange'));
})();

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "price-check.js", status: "initialization_failed"}})); } catch {}
}

;
/* Astra source: cash-highlights.js */
try {
(() => {
  'use strict';
  if (document.getElementById('cash-item-highlights')) return;
  const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
  const day = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
  function model(report) {
    const basket = report?.cashBasket, sourceDay = String(basket?.sourceUpdatedAt || report?.sourceUpdatedAt || '').slice(0, 10);
    if (basket?.status !== 'ok' || !Array.isArray(basket.rows) || !Array.isArray(report?.cash)
        || !day(basket.baseStart) || !day(basket.baseEnd) || basket.baseStart > basket.baseEnd || !day(sourceDay)) return null;
    const partialSourceDay = basket.latest?.partial === true || report.latest?.partial === true;
    const schedule = new Map(report.cash.filter(row => row && typeof row.slug === 'string' && positive(row.nx)).map(row => [row.slug, row.nx]));
    const seen = new Set(), candidates = basket.rows.filter(row => {
      if (!row || typeof row.name !== 'string' || !row.name.trim() || !/^[a-z0-9][a-z0-9-]*$/.test(row.slug)
          || seen.has(row.slug) || !positive(row.basePrice) || !positive(row.weight) || !positive(row.baseExpenditure)
          || !positive(row.nx) || schedule.get(row.slug) !== row.nx) return false;
      seen.add(row.slug); return true;
    }).sort((a, b) => b.weight - a.weight || b.baseExpenditure - a.baseExpenditure || a.slug.localeCompare(b.slug)).slice(0, 5);
    const cards = candidates.map(row => {
      const qualified = row.missingSource !== true && positive(row.price) && day(row.priceDay) && row.priceDay <= sourceDay
        && Number.isSafeInteger(row.quantity) && row.quantity >= 5;
      const ratio = qualified ? row.price / row.basePrice : null, index = ratio === null ? null : ratio * 100;
      const valid = positive(index);
      return Object.freeze({ slug: row.slug, name: row.name, nx: row.nx, weight: row.weight,
        basePrice: row.basePrice, price: valid ? row.price : null, priceDay: valid ? row.priceDay : null,
        quantity: valid ? row.quantity : null, index: valid ? index : null, change: valid ? index - 100 : null,
        carried: valid && row.priceDay < sourceDay, partial: valid && row.priceDay === sourceDay && partialSourceDay });
    });
    return Object.freeze({ baseStart: basket.baseStart, baseEnd: basket.baseEnd,
      sourceUpdatedAt: basket.sourceUpdatedAt || report.sourceUpdatedAt, sourceDay, partialSourceDay,
      basketHash: basket.basketHash || null, cards: Object.freeze(cards) });
  }
  function scale(values = []) {
    const highest = Math.max(200, ...(Array.isArray(values) ? values : []).filter(value => positive(value)));
    const padded = highest === 200 ? 200 : highest <= Number.MAX_VALUE / 1.1 ? highest * 1.1 : highest;
    const step = 10 ** Math.floor(Math.log10(padded)) / 2, rounded = Math.ceil(padded / step) * step;
    return Number.isFinite(rounded) ? Math.max(highest, rounded) : highest;
  }
  function bestModel(report, selection = {}) {
    if (!report || typeof window.buildCashPricing !== 'function') return null;
    const options = { days: selection.days, evidence: selection.evidence, side: 'buy' };
    const pricing = window.buildCashPricing(report, options);
    if (!Array.isArray(pricing?.rows)) return null;
    const eligible = pricing.rows.filter(row => row && /^[a-z0-9][a-z0-9-]*$/.test(row.slug) && typeof row.name === 'string'
      && positive(row.nx) && positive(row.price) && positive(row.rate) && positive(row.referenceWeight)
      && positive(row.quantity) && positive(row.windowDays) && row.missing !== true && !row.referenceExclusion);
    const compare = (a, b) => a.rate - b.rate || a.name.localeCompare(b.name) || a.slug.localeCompare(b.slug);
    const fees=window.AstraTradeFees,feeState=fees?.getState(),feeActive=!!fees&&feeState.mode!=='gross',grossFallback=feeActive&&feeState.rules?.[feeState.mode]?.enabled!==true,netRanking=feeActive&&!grossFallback;
    const chosen=side=>netRanking?fees.rank(eligible,side).slice(0,5).map(row=>({...row,grossRate:row.rate,rate:row.netRate})):(side==='buy'?[...eligible].sort(compare):[...eligible].sort((a,b)=>b.rate-a.rate||a.name.localeCompare(b.name)||a.slug.localeCompare(b.slug))).slice(0,5);
    const buy=chosen('buy'),sell=chosen('sell');
    return { ...pricing, buy, sell, feeActive,grossFallback,netRanking,feeMode:feeState?.mode,feeReferences:netRanking?{buy:fees.reference(eligible,'buy'),sell:fees.reference(eligible,'sell')}:null,eligibleCount: eligible.length, totalCount: pricing.rows.length,
      sourceUpdatedAt: report.sourceUpdatedAt, capturedAt: report.rollingReference?.capturedAt || null };
  }
  function rateScale(values = []) {
    const highest = Math.max(1, ...values.filter(positive));
    const padded = highest <= Number.MAX_VALUE / 1.1 ? highest * 1.1 : highest;
    const step = 10 ** Math.floor(Math.log10(padded)) / 2, rounded = Math.ceil(padded / step) * step;
    return Number.isFinite(rounded) ? Math.max(highest, rounded) : highest;
  }
  window.AstraCashHighlights = Object.freeze({ model, scale, bestModel, rateScale });
  const view = document.getElementById('view-index'); if (!view) return;
  const make = (tag, text, className) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; };
  const number = (value, decimals = 1) => Number.isFinite(value) ? value >= 1e6 ? value.toExponential(2).replace('e+', 'e') : value.toLocaleString('en-US', { maximumFractionDigits: decimals }) : 'Unavailable';
  const signed = value => { const rounded = Math.abs(value) < .05 ? 0 : value; return (rounded > 0 ? '+' : '') + number(rounded) + '%'; };
  const section = make('section', undefined, 'cash-item-highlights'); section.id = 'cash-item-highlights'; section.setAttribute('aria-labelledby', 'cash-highlights-title');
  section.innerHTML = '<div class="section-heading"><div><p class="eyebrow">CASH COMPANION / INDIVIDUAL ITEM PRICES</p><h2 id="cash-highlights-title">Inside cash items</h2></div></div><div class="cash-highlights-content"><p class="cash-highlights-explanation">These individual cash-item dials are excluded from the goods MPI and the goods-based NX benchmark. Seasonal supply, demand and cosmetic mixes can move them separately.</p><p class="cash-highlights-status" role="status"></p><div class="cash-highlights-row" tabindex="0" role="region" aria-label="Individual cash-item price dials; scroll horizontally on narrow screens"></div><p class="cash-highlights-method"></p></div>';
  const controls = make('div', undefined, 'cash-highlights-controls'); controls.dataset.previewControls = 'true';
  controls.setAttribute('role', 'group'); controls.setAttribute('aria-label', 'Cash-item dial preview');
  controls.append(make('span', 'Cash-item dials'));
  const key = 'astra-cash-highlights-v1', modeKey = 'astra-cash-highlights-mode-v1'; let enabled = true, mode = 'best', report = null;
  try { enabled = localStorage.getItem(key) !== 'off'; } catch { /* The requested preview default remains On. */ }
  try { if (localStorage.getItem(modeKey) === 'reference') mode = 'reference'; } catch { /* Best-value default remains usable. */ }
  const toggle = make('button'); toggle.type = 'button'; toggle.setAttribute('aria-controls', 'cash-highlights-content');
  section.querySelector('.cash-highlights-content').id = 'cash-highlights-content';
  controls.append(toggle);
  for (const [value, label] of [['best', 'Best to buy / sell'], ['reference', 'Reference-week prices']]) {
    const button = make('button', label); button.type = 'button'; button.dataset.cashHighlightsMode = value; button.setAttribute('aria-controls', 'cash-highlights-content');
    button.addEventListener('click', () => { mode = value; try { localStorage.setItem(modeKey, mode); } catch {} draw(); }); controls.append(button);
  }
  controls.append(make('small', 'Display only · saved in this browser. No basket or price calculation changes.')); section.append(controls);
  const goods = document.getElementById('category-section'); if (goods?.parentElement === view) goods.after(section); else view.append(section);
  let serial = 0;
  const cardsRoot = section.querySelector('.cash-highlights-row');
  function gauge(index, upper, name, reference = 100, isRate = false) {
    const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
    const add = (tag, attributes, parent = svg) => { const node = document.createElementNS(ns, tag); for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value)); parent.append(node); return node; };
    svg.classList.add('cash-highlight-gauge'); svg.setAttribute('viewBox', '0 0 140 88'); svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', isRate ? `${name}: ${number(index, 2)} mesos per NX; selected-evidence reference ${number(reference, 2)}; shared scale 0 to ${number(upper, 0)} mesos per NX. Cash-item estimate, not the goods-based model benchmark.` : `${name} price index ${number(index)}; reference week 100; shared scale 0 to ${number(upper, 0)}. Individual cash price, not the goods MPI or an NX rate.`);
    svg.dataset.index = index; svg.dataset.scaleMax = upper;
    svg.dataset.reference = reference; svg.dataset.unit = isRate ? 'mesos_per_nx' : 'price_index';
    const gradientId = 'cash-highlight-gradient-' + (++serial), defs = add('defs', {}), gradient = add('linearGradient', { id: gradientId, gradientUnits: 'userSpaceOnUse', x1: 18, y1: 66, x2: 122, y2: 66 }, defs);
    for (const [offset, color] of [[0, '#40c9d6'], [.5, '#f3d44a'], [.8, '#ed8a37'], [1, '#ef5350']]) add('stop', { offset, 'stop-color': color }, gradient);
    const point = (value, radius = 52) => { const angle = -Math.PI + value / upper * Math.PI; return [70 + radius * Math.cos(angle), 66 + radius * Math.sin(angle)]; };
    const [bx, by] = point(index), [x, y] = point(index, 43), [rx1, ry1] = point(reference, 46), [rx2, ry2] = point(reference, 58), [tx, ty] = point(reference, 65);
    add('path', { class: 'cash-highlight-arc-backplate', d: 'M18 66A52 52 0 0 1 122 66', fill: 'none', 'stroke-width': 12 });
    add('path', { class: 'cash-highlight-arc-track', d: 'M18 66A52 52 0 0 1 122 66', fill: 'none', 'stroke-width': 8 });
    add('path', { class: 'cash-highlight-value-arc', d: `M18 66A52 52 0 0 1 ${bx} ${by}`, fill: 'none', stroke: `url(#${gradientId})`, 'stroke-width': 8, 'data-end-value': index });
    add('line', { class: 'cash-highlight-reference', x1: rx1, y1: ry1, x2: rx2, y2: ry2, stroke: '#e3e4d6', 'stroke-width': 2 });
    add('line', { class: 'cash-highlight-needle', x1: 70, y1: 66, x2: x, y2: y, stroke: '#e3e4d6', 'stroke-width': 2 });
    add('circle', { class: 'cash-highlight-pivot', cx: 70, cy: 66, r: 4, fill: '#e3e4d6' });
    add('text', { x: Math.max(12, Math.min(128, tx)), y: Math.max(8, ty - 2), 'text-anchor': 'middle' }).textContent = number(reference);
    add('text', { x: 14, y: 84 }).textContent = '0'; add('text', { x: 126, y: 84, 'text-anchor': 'end' }).textContent = number(upper, 0);
    return svg;
  }
  function drawReference() {
    cardsRoot.className = 'cash-highlights-row';
    const current = model(report), row = cardsRoot; row.replaceChildren();
    if (!current || !current.cards.length) {
      section.querySelector('.cash-highlights-status').textContent = 'Individual cash dials are unavailable: a verified fixed NX schedule and frozen cash reference prices are required. Missing prices are not zero.';
      section.querySelector('.cash-highlights-method').textContent = ''; return;
    }
    const upper = scale(current.cards.map(card => card.index));
    section.querySelector('.cash-highlights-status').textContent = `Reference week ${current.baseStart}–${current.baseEnd} = 100 for each item. Daily source published ${current.sourceUpdatedAt}; latest source-calendar day ${current.sourceDay}${current.partialSourceDay ? ' is partial' : ''}.${report.sourceStatus?.status === 'degraded' ? ' Source checks are degraded; the dated retained prices remain visible.' : ''}`;
    for (const card of current.cards) {
      const article = make('article', undefined, 'cash-highlight-card'); article.dataset.cashHighlightSlug = card.slug;
      const heading = make('h3'), link = make('a'); link.href = '#item/' + encodeURIComponent(card.slug);
      const image = make('img'); image.alt = ''; image.width = 40; image.height = 40; image.loading = 'lazy';
      const mapped = report.spriteMap?.[card.slug]; image.src = typeof mapped === 'string' && /^assets\/[A-Za-z0-9._-]+\.(?:png|webp|gif|svg)$/.test(mapped) ? mapped : 'assets/' + card.slug + '.svg';
      link.append(image, make('span', card.name)); heading.append(link); article.append(heading);
      if (card.index !== null) {
        article.append(gauge(card.index, upper, card.name), make('strong', number(card.index), 'cash-highlight-index'), make('span', signed(card.change) + ' vs. reference week', 'cash-highlight-change'));
        article.append(make('p', `${card.carried ? 'Carried qualifying price' : 'Qualified daily price'} · ${card.priceDay}${card.partial ? ' · partial source day' : ''}`, 'cash-highlight-date'));
        article.append(make('p', `${number(card.price, 0)} mesos · ${number(card.quantity, 0)} recorded source count`, 'cash-highlight-price'));
        if (card.carried) article.append(make('small', 'Carried from its dated observation; not a fresh sale.'));
      } else article.append(make('p', 'Price index unavailable', 'cash-highlight-unavailable'), make('p', 'No valid dated price with at least five recorded sales.'));
      article.append(make('small', `${number(card.weight * 100)}% frozen cash-basket weight · fixed NX cost ${number(card.nx, 0)}`));
      row.append(article);
    }
    section.querySelector('.cash-highlights-method').textContent = 'Individual price index = 100 × latest qualifying daily median / frozen reference-week price. Reference prices are recorded-volume-weighted daily medians over that fixed week, not exact transaction averages. The five cards are selected by frozen cash-basket weight, then reference estimated expenditure and slug; current prices or turnover never rerank them. Counts are source-inferred, not independently verified trades. Each day needs at least five recorded sales; an older qualifying price can be carried with its date shown. This is daily-source history, not a resliced rolling scanner window. Dials share a scale of at least 200; 150 means 50% above that item’s reference price.';
  }
  function drawBest() {
    cardsRoot.className = 'cash-highlights-rankings'; cardsRoot.replaceChildren();
    const selection = { days: Number(document.getElementById('cash-lookback')?.value || 3), evidence: document.getElementById('cash-evidence')?.value || 'daily' };
    const current = bestModel(report, selection), status = section.querySelector('.cash-highlights-status'), method = section.querySelector('.cash-highlights-method');
    if (!current) { status.textContent = 'Best-value cash dials are unavailable until the cash-pricing table calculation is ready. No modelled benchmark is substituted.'; method.textContent = ''; return; }
    const evidenceWindow = current.rolling ? `Rolling scanner capture pulled ${current.capturedAt || 'at an unavailable time'}; item-specific windows, not a resliced lookback.` : `${current.days}-source-day lookback · ${current.start || 'Unknown'}–${current.end || 'Unknown'} inclusive${current.partial ? ' · latest day partial' : ''}. Daily source published ${current.sourceUpdatedAt || 'at an unavailable time'}.`;
    status.textContent = `${evidenceWindow} ${current.eligibleCount} / ${current.totalCount} fixed-price items have eligible evidence. ${current.eligibleCount < 5 ? 'Fewer than five eligible items; missing items are not filled.' : 'Up to five per side.'}${current.grossFallback?' Gross order shown; net unavailable until fee rules are set.':current.netRanking?' Fee scenario: '+window.AstraTradeFees.label()+'. Only computable assumed net/outlay values are ranked; no official fee rule is claimed.':''}`;
    const upper = rateScale([...current.buy, ...current.sell].map(row => row.rate).concat(positive(current.reference) ? current.reference : []));
    for (const [side, title, rows] of [['sell', 'Best to Sell (Higher Meso/NX)', current.sell], ['buy', 'Best to Buy (Lower Meso/NX)', current.buy]]) {
      const group = make('section', undefined, 'cash-highlights-ranking'); group.dataset.cashRanking = side;
      group.append(make('h3', title));group.dataset.cashRankingBasis=current.grossFallback?'gross_unset_fees':current.netRanking?'manual_net':'gross';if(current.grossFallback)group.append(make('span','Gross ranking · fees unset','cash-highlights-gross-badge'));
      const row = make('div', undefined, 'cash-highlights-row'); row.tabIndex = 0; row.setAttribute('role', 'region'); row.setAttribute('aria-label', `${title} cash dials; scroll horizontally on narrow screens`);
      for (const item of rows) {
        const card = make('article', undefined, 'cash-highlight-card'); card.dataset.cashHighlightSlug = item.slug; card.dataset.cashRate = item.rate; card.dataset.cashSide = side;if(item.grossRate!==undefined)card.dataset.cashGrossRate=item.grossRate;
        const heading = make('h4'), link = make('a'); link.href = '#item/' + encodeURIComponent(item.slug);
        const image = make('img'); image.alt = ''; image.width = 40; image.height = 40; image.loading = 'lazy';
        const mapped = report.spriteMap?.[item.slug]; image.src = typeof mapped === 'string' && /^assets\/[A-Za-z0-9._-]+\.(?:png|webp|gif|svg)$/.test(mapped) ? mapped : 'assets/' + item.slug + '.svg';
        link.append(image, make('span', item.name)); heading.append(link); card.append(heading);
        const selectedReference=current.feeReferences?.[side]??current.reference;
        if(item.rate>=0&&positive(selectedReference))card.append(gauge(item.rate,upper,item.name,selectedReference,true));
        card.append(make('strong', number(item.rate, 2), 'cash-highlight-index'), make('span', current.grossFallback?'Gross mesos/NX':current.netRanking?(side==='buy'?'scenario outlay mesos / NX':'scenario net mesos / NX'):'mesos / NX', 'cash-highlight-change'));
        if(current.netRanking)card.append(make('small',`Gross ${number(item.grossRate,2)} mesos / NX · ${item.feePreview.itemCount} copies · ${item.feePreview.assumptionProvenance==='user_reported'?'user-reported estimate':'manual estimate'}${item.feePreview.allocatedShopCost?' · allocated shop cost included':''}`));
        card.append(make('p', `${number(item.price, 1)} mesos · fixed ${number(item.nx, 0)} NX`, 'cash-highlight-price'));
        card.append(make('p', current.rolling ? `Pulled ${current.capturedAt || 'time unavailable'} · ${number(item.windowDays)}-day source window` : `Selected dates ${current.start}–${current.end} · ${number(item.windowDays, 0)} qualifying days`, 'cash-highlight-date'));
        card.append(make('small', `${number(item.quantity, 0)} recorded source count${item.windowDays < current.days && !current.rolling ? ' · incomplete daily coverage' : ''}`)); row.append(card);
      }
      if (!rows.length) row.append(make('p',current.feeActive?'Net/outlay ranking unavailable until eligible evidence and explicit manual assumptions are available. Gross view remains available.':'No eligible prices for this evidence window.','cash-highlight-unavailable'));
      const fullList = make('button', `View full ${side === 'sell' ? 'sell' : 'buy'} list`, 'cash-ranking-full-list'); fullList.type = 'button'; fullList.dataset.cashRankingLink = side;
      fullList.addEventListener('click', () => {
        // Use the table's existing native button, preserving its sorting and fee events.
        const sideButton = document.querySelector(`button[data-cash-side="${side}"]`);
        sideButton?.click(); window.location.hash = '#nx';
      });
      group.append(row, fullList); cardsRoot.append(group);
    }
    method.textContent = (current.grossFallback?'Gross order shown; net unavailable until fee rules are set. No zero-fee assumption is made. ':current.netRanking?'The selected fee scenario uses the same shared AstraTradeFees model as the NX table. No official rate is verified; buyer outlay and seller proceeds are separate, and fixed shop-cost allocation is an explicit business-cost assumption. ':'')+'Same fixed-NX schedule and selected evidence calculation as Best NX items to Buy/Sell. Daily estimates weight qualifying daily sale medians by recorded volume; each day needs at least five recorded sales. Rolling medians retain their own windows; excluded roll/upgrade-premium references are not ranked. Missing prices and unknown NX costs are excluded. Ranking uses all eligible items before table search/verdict filters: low mesos / NX for buying, high for selling, '+(current.netRanking?'under the selected explicit fee assumptions.':'before fees.')+' The dial tick is the selected-evidence cash reference, not 100 or the goods-based benchmark. These estimates are not executable quotes or profit calculations.';
  }
  function draw() {
    section.dataset.enabled = String(enabled); section.dataset.cashHighlightsMode = mode; section.querySelector('.cash-highlights-content').hidden = !enabled;
    toggle.setAttribute('aria-pressed', String(enabled)); toggle.textContent = enabled ? 'On · hide dials' : 'Off · show dials';
    for (const button of controls.querySelectorAll('[data-cash-highlights-mode]')) button.setAttribute('aria-pressed', String(button.dataset.cashHighlightsMode === mode));
    if (mode === 'reference') drawReference(); else drawBest();
  }
  toggle.addEventListener('click', () => { enabled = !enabled; try { localStorage.setItem(key, enabled ? 'on' : 'off'); } catch { /* Tab choice still works. */ } draw(); });
  document.addEventListener('astramarketsnapshot', event => { report = event.detail; draw(); });
  document.addEventListener('astrafeeschange',draw);
  for (const id of ['cash-lookback', 'cash-evidence']) document.getElementById(id)?.addEventListener('change', draw);
  draw(); document.dispatchEvent(new Event('astramarkethighlightsready'));
})();

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "cash-highlights.js", status: "initialization_failed"}})); } catch {}
}

;
/* Astra source: fee-preview.js */
try {
(() => {
  'use strict';
  if(window.AstraTradeFees)return;
  const key='astra-trade-fees-v1',modes=['gross','player_trade','shop'],roundings=['estimate','floor','ceil','nearest'];
  const blankRule=()=>({enabled:false,sellerPercent:null,buyerPercent:null,fixedShopMeso:null,shopCopies:null,durationDays:null,provenance:'manual'});
  const reportedRule=mode=>({...blankRule(),enabled:true,sellerPercent:mode==='shop'?1.5:3,buyerPercent:0,provenance:'user_reported',reportedOn:'2026-11-05'});
  const defaults=()=>({version:2,mode:'player_trade',itemCount:1,quoteRounding:'estimate',feeRounding:'estimate',rules:{player_trade:reportedRule('player_trade'),shop:reportedRule('shop')}});
  const finite=v=>typeof v==='number'&&Number.isFinite(v),positive=v=>finite(v)&&v>0,safeCount=v=>Number.isSafeInteger(v)&&v>0;
  const clone=v=>JSON.parse(JSON.stringify(v));
  function normalize(raw){const base=defaults();if(!raw||typeof raw!=='object')return base;if(modes.includes(raw.mode))base.mode=raw.mode;if(safeCount(raw.itemCount))base.itemCount=raw.itemCount;for(const k of ['quoteRounding','feeRounding'])if(roundings.includes(raw[k]))base[k]=raw[k];for(const mode of ['player_trade','shop']){const r=raw.rules?.[mode];if(!r||typeof r!=='object')continue;const legacyEmpty=raw.version===1&&r.enabled===false&&r.sellerPercent===null&&r.buyerPercent===null&&r.fixedShopMeso==null&&r.shopCopies==null&&r.durationDays==null;if(legacyEmpty)continue;base.rules[mode]=blankRule();base.rules[mode].enabled=r.enabled===true;for(const k of ['sellerPercent','buyerPercent'])if(finite(r[k])&&r[k]>=0&&r[k]<=100)base.rules[mode][k]=r[k];if(finite(r.fixedShopMeso)&&r.fixedShopMeso>=0)base.rules[mode].fixedShopMeso=r.fixedShopMeso;for(const k of ['shopCopies','durationDays'])if(safeCount(r[k]))base.rules[mode][k]=r[k];const preset=reportedRule(mode);if(r.provenance==='user_reported'&&r.sellerPercent===preset.sellerPercent&&r.buyerPercent===0){base.rules[mode].provenance='user_reported';base.rules[mode].reportedOn=preset.reportedOn;}}return base;}
  let state=defaults();try{state=normalize(JSON.parse(localStorage.getItem(key)||'null'));}catch{}
  const rounded=(v,mode)=>mode==='floor'?Math.floor(v):mode==='ceil'?Math.ceil(v):mode==='nearest'?Math.round(v):v;
  function decimal(v){const [mantissa,exponent='0']=String(v).split('e'),digits=mantissa.replace('.',''),places=(mantissa.split('.')[1]?.length||0)-Number(exponent);return places>=0?[BigInt(digits),10n**BigInt(places)]:[BigInt(digits)*10n**BigInt(-places),1n];}
  function charge(gross,percent,mode){if(mode==='estimate')return gross*(percent/100);const [g,gd]=decimal(gross),[p,pd]=decimal(percent),n=g*p,d=gd*pd*100n,q=n/d,r=n%d;return Number(q+(mode==='ceil'&&r>0n||mode==='nearest'&&r*2n>=d?1n:0n));}
  function calculate(row,{side='sell'}={}){
    const result={mode:state.mode,status:'unavailable',manual:state.mode!=='gross',officialRuleVerified:false,grossRate:finite(row?.rate)?row.rate:null,grossUnitEstimate:positive(row?.price)?row.price:null,itemCount:state.itemCount,totalNx:null,grossMeso:null,sellerReceives:null,buyerSpends:null,allocatedShopCost:null,effectiveMeso:null,effectiveRate:null,reason:null};
    if(!positive(row?.price)||!positive(row?.nx)||!positive(row?.referenceWeight)||!positive(row?.quantity)||!positive(row?.windowDays)||row.missing===true||row.referenceExclusion){result.reason='Eligible sale evidence and a verified fixed NX cost are required.';return result;}
    const unit=state.mode==='gross'?row.price:rounded(row.price,state.quoteRounding),gross=unit*state.itemCount,nx=row.nx*state.itemCount;
    if(!positive(unit)||!Number.isSafeInteger(state.itemCount)||!positive(gross)||gross>Number.MAX_SAFE_INTEGER||!positive(nx)||nx>Number.MAX_SAFE_INTEGER){result.reason='Transaction assumptions exceed supported finite amounts.';return result;}
    result.totalNx=nx;result.grossMeso=gross;
    if(state.mode==='gross'){result.status='gross';result.manual=false;result.sellerReceives=result.buyerSpends=result.effectiveMeso=gross;result.allocatedShopCost=0;result.effectiveRate=row.rate;return result;}
    const rule=state.rules[state.mode];if(!rule.enabled||!finite(rule.sellerPercent)||!finite(rule.buyerPercent)){result.reason='Current official fees are unverified. Enable explicit manual seller/buyer assumptions, including 0 where none is assumed.';return result;}
    let allocated=0;if(state.mode==='shop'&&rule.fixedShopMeso!==null){if(!safeCount(rule.shopCopies)){result.reason='A fixed shop cost needs an explicit total number of copies over which to allocate it.';return result;}allocated=rule.fixedShopMeso/rule.shopCopies*state.itemCount;}
    const deduction=charge(gross,rule.sellerPercent,state.feeRounding),surcharge=charge(gross,rule.buyerPercent,state.feeRounding);
    if(deduction>gross){result.reason='The assumed rounding would deduct more than this transaction pays; choose an explicit executable quote or another assumption.';return result;}
    const receives=gross-deduction,spends=gross+surcharge,effective=side==='buy'?spends:receives-allocated;if(![receives,spends,allocated,effective].every(v=>finite(v)&&Math.abs(v)<=Number.MAX_SAFE_INTEGER)){result.reason='Transaction or allocated-cost assumptions exceed supported safe amounts.';return result;}
    result.sellerReceives=receives;result.buyerSpends=spends;result.allocatedShopCost=allocated;result.effectiveMeso=effective;result.effectiveRate=result.effectiveMeso/nx;
    if(!finite(result.effectiveRate)){result.reason='Manual assumptions do not produce a finite result.';result.effectiveMeso=result.effectiveRate=null;return result;}
    result.status='manual_estimate';result.assumptionProvenance=rule.provenance;result.reportedOn=rule.reportedOn||null;result.reason=(rule.provenance==='user_reported'?'User-reported rates (November 5, 2026), independently unverified.':'Manual scenario, not verified official fees.')+' Whole-transaction percentage charges; shop costs allocated by assumed copies, not time.';return result;
  }
  function decorate(rows,side){return (Array.isArray(rows)?rows:[]).map(row=>{const feePreview=calculate(row,{side});return{...row,feePreview,netRate:feePreview.effectiveRate,effectiveMeso:feePreview.effectiveMeso};});}
  function rank(rows,side){return decorate(rows,side).filter(r=>finite(r.netRate)).sort((a,b)=>(side==='buy'?a.netRate-b.netRate:b.netRate-a.netRate)||a.name.localeCompare(b.name)||a.slug.localeCompare(b.slug));}
  function reference(rows,side){const eligible=decorate(rows,side).filter(r=>finite(r.netRate)&&positive(r.referenceWeight));const weight=eligible.reduce((s,r)=>s+r.referenceWeight,0);return weight?eligible.reduce((s,r)=>s+r.netRate*r.referenceWeight,0)/weight:null;}
  const modeLabel=()=>state.mode==='gross'?'Gross · simplified':(state.mode==='shop'?'FM player shop':'Player trade')+(state.rules[state.mode].provenance==='user_reported'?' · user-reported estimate':' · manual scenario');
  function update(raw){state=normalize(raw);try{localStorage.setItem(key,JSON.stringify(state));}catch{}paint();document.dispatchEvent(new CustomEvent('astrafeeschange',{detail:{mode:state.mode,officialRuleVerified:false}}));}
  const api=Object.freeze({getState:()=>clone(state),setState:update,calculate,decorate,rank,reference,label:modeLabel});window.AstraTradeFees=api;
  const panels=[];
  const make=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
  function install(){for(const [id,anchor]of [['nx','cash-table'],['cards','cash-item-highlights']]){if(document.querySelector(`[data-fee-panel="${id}"]`))continue;const host=document.getElementById(anchor);if(!host)continue;
      const panel=make('section','fee-preview');panel.dataset.feePanel=id;panel.setAttribute('aria-label','Personal cash transaction-fee scenario');
      panel.innerHTML='<h3>Cash value after fees</h3><div class="fee-preview-modes" role="group" aria-label="Cash fee view"><button type="button" data-fee-mode="gross">Gross · simplified</button><button type="button" data-fee-mode="player_trade">Player trade</button><button type="button" data-fee-mode="shop">FM player shop</button></div><p class="fee-preview-status" role="status"></p><div class="fee-preview-presets" role="group" aria-label="Reported fee assumptions"><button type="button" data-fee-preset="player_trade">Use reported trade 3%</button><button type="button" data-fee-preset="shop">Use reported shop 1.5%</button><button type="button" data-fee-clear>Clear assumptions</button></div><details><summary>Fee assumptions: user-reported, not independently verified</summary><p>The November 5, 2026 user report supplies 3% player trade and 1.5% shop. These presets assume a seller / meso-recipient deduction and no buyer surcharge; that incidence is an explicit assumption. Current public sources conflict, and official tiers and rounding remain unverified. A source median may be fractional and is not an executable quote. Seller deductions and buyer surcharges are separate. Percentages are applied once to the whole hypothetical transaction.</p><form class="fee-preview-form"><label class="fee-enabled"><input type="checkbox" data-fee-field="enabled">Use these explicit fee assumptions</label><label>Copies in one transaction<input type="number" min="1" step="1" data-fee-field="itemCount"></label><label>Seller-paid deduction % (enter 0 if none)<input type="number" min="0" max="100" step="any" data-fee-field="sellerPercent" placeholder="Unknown"></label><label>Buyer-paid surcharge % (enter 0 if none)<input type="number" min="0" max="100" step="any" data-fee-field="buyerPercent" placeholder="Unknown"></label><label>Unit quote assumption<select data-fee-field="quoteRounding"><option value="estimate">Use source estimate · fractional allowed</option><option value="floor">Assume unit quote rounded down</option><option value="ceil">Assume unit quote rounded up</option><option value="nearest">Assume nearest-whole-meso unit quote</option></select></label><label>Fee rounding assumption<select data-fee-field="feeRounding"><option value="estimate">Fractional estimate · rounding unknown</option><option value="floor">Assume charge rounded down</option><option value="ceil">Assume charge rounded up</option><option value="nearest">Assume charge rounded nearest</option></select></label><label class="fee-shop-field">Fixed shop/access cost · assumed mesos<input type="number" min="0" step="any" data-fee-field="fixedShopMeso" placeholder="Excluded unless entered"></label><label class="fee-shop-field">Total copies sharing that shop cost<input type="number" min="1" step="1" data-fee-field="shopCopies" placeholder="Required if cost entered"></label><label class="fee-shop-field">Planning duration · days (context only)<input type="number" min="1" step="1" data-fee-field="durationDays" placeholder="Optional"></label><button type="submit">Apply manual scenario</button><p class="fee-preview-error" role="alert"></p></form><p>Permit NX purchase cost is a separate access cost, not a percentage. No NX-to-meso permit conversion is inferred. Duration is context only; allocation uses your total-copy assumption. Seller net may be negative after an allocated business cost; it is not a negative cash receipt.</p><a href="https://www.nexon.com/maplestory/news/sale/45819/founders-access-cash-shop" target="_blank" rel="noopener noreferrer">Official permit costs (not a tax schedule) ↗</a></details>';
      if(id==='nx')host.before(panel);else{const status=host.querySelector('.cash-highlights-status');if(status)status.before(panel);else host.prepend(panel);}panels.push(panel);
      panel.addEventListener('click',ev=>{const b=ev.target.closest('button[data-fee-mode]');if(b){update({...clone(state),mode:b.dataset.feeMode});return;}const preset=ev.target.closest('[data-fee-preset]');if(preset){const raw=clone(state);raw.mode=preset.dataset.feePreset;raw.rules[raw.mode]=reportedRule(raw.mode);raw.quoteRounding=raw.feeRounding='estimate';update(raw);return;}if(ev.target.closest('[data-fee-clear]')){const raw=clone(state),mode=state.mode==='gross'?'player_trade':state.mode;raw.rules[mode]=blankRule();update(raw);}});
      panel.querySelector('form').addEventListener('submit',ev=>{ev.preventDefault();const form=ev.currentTarget,mode=state.mode==='gross'?'player_trade':state.mode,raw=clone(state),error=form.querySelector('.fee-preview-error');error.textContent='';const number=k=>{const value=form.querySelector(`[data-fee-field="${k}"]`).value.trim();return value===''?null:Number(value);};
        const count=number('itemCount'),seller=number('sellerPercent'),buyer=number('buyerPercent'),cost=number('fixedShopMeso'),copies=number('shopCopies'),duration=number('durationDays');if(!safeCount(count)||[seller,buyer].some(v=>v!==null&&(!finite(v)||v<0||v>100))||cost!==null&&(!finite(cost)||cost<0)||[copies,duration].some(v=>v!==null&&!safeCount(v))){error.textContent='Use positive whole copy/day counts and finite percentages between 0 and 100. No assumption was applied.';return;}
        raw.itemCount=count;raw.quoteRounding=form.querySelector('[data-fee-field="quoteRounding"]').value;raw.feeRounding=form.querySelector('[data-fee-field="feeRounding"]').value;raw.rules[mode]={enabled:form.querySelector('[data-fee-field="enabled"]').checked,sellerPercent:seller,buyerPercent:buyer,fixedShopMeso:cost,shopCopies:copies,durationDays:duration};update(raw);
      });
    }paint();}
  function paint(){for(const panel of panels){const rule=state.rules[state.mode==='gross'?'player_trade':state.mode];for(const b of panel.querySelectorAll('[data-fee-mode]'))b.setAttribute('aria-pressed',String(b.dataset.feeMode===state.mode));for(const input of panel.querySelectorAll('[data-fee-field]')){const k=input.dataset.feeField,value=['itemCount','quoteRounding','feeRounding'].includes(k)?state[k]:rule[k];if(input.type==='checkbox')input.checked=value===true;else input.value=value??'';}for(const label of panel.querySelectorAll('.fee-shop-field'))label.hidden=state.mode!=='shop';panel.dataset.feeMode=state.mode;panel.querySelector('.fee-preview-status').textContent=state.mode==='gross'?'Gross values before fees · original simplified view.':`${modeLabel()}. ${rule.enabled&&finite(rule.sellerPercent)&&finite(rule.buyerPercent)?`Explicit assumptions: seller ${rule.sellerPercent}%, buyer ${rule.buyerPercent}%; ${state.itemCount} copies per transaction. ${state.mode==='shop'&&rule.fixedShopMeso!==null?`Assumed shop cost ${rule.fixedShopMeso} mesos / ${rule.shopCopies||'unknown'} total copies${rule.durationDays?` over ${rule.durationDays} planning days`:''}.`:''}`:'Net values unavailable until explicit manual assumptions are enabled.'} ${rule.provenance==='user_reported'?'User-reported November 5, 2026 rates, not independently verified; seller/recipient deduction and buyer 0% surcharge are assumptions. ':''}Official percentages, tiers and rounding remain unverified. Gross prices, evidence, headline and source clocks are unchanged.`;}}
  document.addEventListener('astramarketsnapshot',install);install();document.dispatchEvent(new CustomEvent('astrafeeschange',{detail:{mode:state.mode,officialRuleVerified:false}}));
})();

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "fee-preview.js", status: "initialization_failed"}})); } catch {}
}

;
/* Astra source: basket-history-layout.js */
try {
(() => {
  'use strict';
  const section=document.getElementById('view-basket'),history=document.getElementById('basket-history-section');
  if(!section||!history||document.getElementById('basket-history-layout-options'))return;
  const original=document.createComment('Basket history original location');history.before(original);
  const group=document.createElement('div');group.id='basket-history-layout-options';group.className='basket-history-layout-options';group.dataset.previewControls='true';
  group.setAttribute('role','group');group.setAttribute('aria-label','Basket history position');
  const label=document.createElement('span');label.textContent='History position';group.append(label);
  const key='astra-basket-history-position';
  function choose(value){
    const placement=value==='above'?'above':'below';
    if(placement==='above')original.after(history);else group.before(history);
    history.dataset.historyPlacement=placement;
    for(const button of group.querySelectorAll('button'))button.setAttribute('aria-pressed',String(button.dataset.basketHistoryPosition===placement));
  }
  for(const [value,title] of [['below','Below the table'],['above','Above the table']]){
    const button=document.createElement('button');button.type='button';button.dataset.basketHistoryPosition=value;button.textContent=title;
    button.addEventListener('click',()=>{choose(value);try{localStorage.setItem(key,value)}catch{}});group.append(button);
  }
  section.append(group);let saved;try{saved=localStorage.getItem(key)}catch{}choose(saved);
})();

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "basket-history-layout.js", status: "initialization_failed"}})); } catch {}
}

;
/* Astra source: rate-clock.js */
try {
(() => {
  'use strict';
  const sourceClock = document.getElementById('rate-kind');
  if (!sourceClock || document.getElementById('rate-current-clock')) return;
  const options = document.getElementById('display-options');
  const zoneSelect = document.getElementById('display-timezone');
  const preferenceKey = 'astra-rate-clock-v1', modes = new Set(['current-source', 'source']);
  let mode = 'current-source', interval;
  try { const saved = localStorage.getItem(preferenceKey); if (modes.has(saved)) mode = saved; } catch { /* Current-tab controls still work. */ }
  const clock = document.createElement('p'); clock.id = 'rate-current-clock'; clock.className = 'rate-current-clock';
  clock.dataset.clockKind = 'view'; clock.setAttribute('aria-live', 'off');
  clock.setAttribute('aria-label', 'Current viewing clock, separate from the market source time above');
  const time = document.createElement('time');
  const cadence = document.createElement('span'); cadence.textContent = ' · collector checks ~10 min';
  cadence.title = 'Approximate collector check cadence, not a promise of new market observations. The source timestamp above remains the data clock.';
  clock.append('Now: ', time, cadence); sourceClock.after(clock);
  const group = document.createElement('div'); group.className = 'hero-layout-options rate-clock-options'; group.dataset.previewControls = '';
  group.setAttribute('role', 'group'); group.setAttribute('aria-label', 'Headline clocks');
  for (const [value, label] of [['current-source', 'Current clock + source'], ['source', 'Source only']]) {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.rateClock = value;
    button.textContent = label; button.setAttribute('aria-controls', 'rate-current-clock');
    button.addEventListener('click', () => { mode = value; try { localStorage.setItem(preferenceKey, mode); } catch {} apply(); });
    group.append(button);
  }
  const note = document.createElement('small'); note.textContent = 'The ticking clock is your current viewing time. Market values keep their actual source timestamp.'; group.append(note); options?.append(group);
  function tick() {
    let zone = zoneSelect?.value || 'UTC', format;
    const configuration = { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' };
    try { format = new Intl.DateTimeFormat('en-US', { ...configuration, timeZone: zone }); }
    catch { zone = 'UTC'; format = new Intl.DateTimeFormat('en-US', { ...configuration, timeZone: zone }); }
    const now = new Date();
    time.dateTime = now.toISOString(); time.textContent = format.format(now) + ' ' + zone.replaceAll('_', ' ');
    clock.dataset.timeZone = zone;
  }
  function syncTimer() {
    if (interval !== undefined) { clearInterval(interval); interval = undefined; }
    if (mode === 'current-source') {
      tick();
      if (!document.hidden) interval = setInterval(tick, 1000);
    }
  }
  function apply() {
    clock.hidden = mode === 'source';
    for (const button of group.querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.rateClock === mode));
    syncTimer();
  }
  zoneSelect?.addEventListener('change', () => { if (mode === 'current-source') tick(); });
  document.addEventListener('visibilitychange', syncTimer);
  // No market render, value update, source-clock edit or data request occurs on a timer tick.
  apply();
})();

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "rate-clock.js", status: "initialization_failed"}})); } catch {}
}

;
/* Astra source: overview-basket.js */
try {
(() => {
  'use strict';
  const view = document.getElementById('view-index'), stats = document.getElementById('market-stats');
  if (!view || !stats || stats.parentElement !== view || document.getElementById('overview-basket')) return;
  const make = (tag, text, className) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; };
  const day = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
  const origin = document.createComment('Source statistics original position'); stats.before(origin);
  const section = make('section', undefined, 'overview-basket'); section.id = 'overview-basket'; section.setAttribute('aria-labelledby', 'overview-basket-title');
  section.innerHTML = '<div class="overview-basket-content"><div class="section-heading"><div><p class="eyebrow">THE FULL FIXED GOODS BASKET / BY CATEGORY</p><h2 id="overview-basket-title">The representative 50 items of the Maple Economy and Meso Price Index</h2></div></div><p class="overview-basket-status" role="status"></p><div class="category-item-groups overview-basket-tiles"></div><p class="overview-basket-links"><a href="#basket">Full goods-basket details, weights and history →</a> · <a href="#cash-basket">Cash Basket details and history →</a> · <a href="#method-weights">Why these weights?</a></p></div>';
  stats.after(section);
  const controls = make('div', undefined, 'overview-basket-controls'); controls.dataset.previewControls = 'true'; controls.setAttribute('role', 'group'); controls.setAttribute('aria-label', 'Full Overview basket preview');
  controls.append(make('span', 'Full basket on Overview'));
  const toggle = make('button'); toggle.type = 'button'; toggle.setAttribute('aria-controls', 'overview-basket-content');
  section.querySelector('.overview-basket-content').id = 'overview-basket-content'; controls.append(toggle);
  const orderButtons = [];
  const key = 'astra-overview-basket-v1', orderKey = 'astra-overview-basket-stats-order-v1'; let enabled = true, order = 'above';
  try { enabled = localStorage.getItem(key) !== 'off'; } catch { /* Requested preview default remains On. */ }
  try { if (localStorage.getItem(orderKey) === 'below') order = 'below'; } catch { /* Source statistics stay above by default. */ }
  function apply() {
    section.dataset.enabled = String(enabled); section.querySelector('.overview-basket-content').hidden = !enabled;
    toggle.textContent = enabled ? 'On · hide basket' : 'Off · show basket'; toggle.setAttribute('aria-pressed', String(enabled));
    if (enabled && order === 'below') { if (section.nextSibling !== stats) section.after(stats); }
    else if (origin.nextSibling !== stats) origin.after(stats);
    section.dataset.statsOrder = order;
    for (const button of orderButtons) { button.disabled = !enabled; button.setAttribute('aria-pressed', String(button.dataset.overviewStatsOrder === order)); }
  }
  for (const [value, text] of [['above', 'Source stats above'], ['below', 'Source stats below']]) {
    const button = make('button', text); button.type = 'button'; button.dataset.overviewStatsOrder = value;
    button.addEventListener('click', () => { order = value; apply(); try { localStorage.setItem(orderKey, order); } catch { /* Tab choice still works. */ } });
    orderButtons.push(button); controls.append(button);
  }
  const headingKey='astra-overview-basket-heading-v1';let concise=false;try{concise=localStorage.getItem(headingKey)==='concise'}catch{}const headingToggle=make('button');headingToggle.type='button';headingToggle.dataset.overviewBasketHeading='true';const updateHeading=()=>{section.querySelector('h2').textContent=concise?'All 50 items, in context.':'The representative 50 items of the Maple Economy and Meso Price Index';headingToggle.textContent=concise?'Heading: Concise':'Heading: Representative 50';headingToggle.setAttribute('aria-pressed',String(!concise))};headingToggle.addEventListener('click',()=>{concise=!concise;try{localStorage.setItem(headingKey,concise?'concise':'representative')}catch{}updateHeading()});controls.append(headingToggle);updateHeading();
  controls.append(make('small', 'Display only · the original statistics strip and its values are preserved.'));
  section.append(controls); toggle.addEventListener('click', () => { enabled = !enabled; apply(); try { localStorage.setItem(key, enabled ? 'on' : 'off'); } catch { /* Tab choice still works. */ } });
  function receive(report) {
    const source = document.getElementById('method-tiles'), target = section.querySelector('.overview-basket-tiles');
    const rows = report?.rows, originals = source ? [...source.querySelectorAll('button[data-item]')] : [];
    const rowMap = new Map(Array.isArray(rows) ? rows.filter(row => row && typeof row.slug === 'string').map(row => [row.slug, row]) : []);
    const seen = new Set();
    const complete = Array.isArray(rows) && rows.length === 50 && rowMap.size === 50 && originals.length === 50
      && !source.querySelector('[id]') && originals.every(button => { const slug = button.dataset.item; if (!rowMap.has(slug) || seen.has(slug)) return false; seen.add(slug); return true; });
    if (!complete) {
      target.replaceChildren(); section.querySelector('.overview-basket-status').textContent = 'A complete rendered 50-item view is not available in this snapshot. The original basket page and methodology remain available; no missing items are filled.'; apply(); return;
    }
    const copies = [...source.children].filter(node => node.classList.contains('method-category')).map(node => node.cloneNode(true));
    if (copies.reduce((count, node) => count + node.querySelectorAll('button[data-item]').length, 0) !== 50) {
      target.replaceChildren(); section.querySelector('.overview-basket-status').textContent = 'The category layout could not be verified. Open the full basket details below.'; apply(); return;
    }
    for (const copy of copies) for (const button of copy.querySelectorAll('button[data-item]')) {
      const row = rowMap.get(button.dataset.item), date = make('small', day(row.priceDay) ? 'Source price: ' + row.priceDay : 'Source price date unavailable', 'overview-basket-price-date');
      const price = button.querySelector('strong'); if (price) price.after(date); else button.append(date);
    }
    target.replaceChildren(...copies);
    section.querySelector('.overview-basket-status').textContent = `The same 50-item goods basket and category cards as Methodology · basket version ${Number.isSafeInteger(report.basketVersion) ? report.basketVersion : 'unknown'}. Fixed reference ${day(report.baseStart) ? report.baseStart : 'unknown'}–${day(report.baseEnd) ? report.baseEnd : 'unknown'}; daily source published ${typeof report.sourceUpdatedAt === 'string' ? report.sourceUpdatedAt : 'unknown'}. Individual qualified price dates, frozen weights and item-history actions are retained. This display changes no membership, price, source clock or calculation.${report.sourceStatus?.status === 'degraded' ? ' Source checks are degraded; these prices retain their source dates.' : ''}`;
    apply();
  }
  document.addEventListener('astramarketsnapshot', event => receive(event.detail));
  apply(); receive(null); document.dispatchEvent(new Event('astramarkethighlightsready'));
})();

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "overview-basket.js", status: "initialization_failed"}})); } catch {}
}

;
/* Astra source: nav-preview.js */
try {
(() => {
  'use strict';
  const navigation = document.querySelector('.nav-wrap nav') || document.querySelector('nav');
  const options = document.getElementById('display-options');
  if (!navigation || !options || document.getElementById('nav-preview-options')) return;
  const targets = [['basket', 'The Basket', '#basket'], ['cash-basket', 'Cash Basket', '#cash-basket']]
    .map(([key, label, hash]) => ({ key, label, link: [...navigation.querySelectorAll('a.nav-link')].find(link => link.hash === hash) })).filter(target => target.link);
  if (!targets.length) return;
  const group = document.createElement('fieldset'); group.id = 'nav-preview-options'; group.className = 'nav-preview-options'; group.dataset.previewControls = 'true';
  const legend = document.createElement('legend'); legend.textContent = 'Basket navigation preview'; group.append(legend);
  for (const target of targets) {
    const key = 'astra-nav-' + target.key + '-visible-v1'; let visible = false;
    try { visible = localStorage.getItem(key) === 'on'; } catch { /* The requested preview default stays Off. */ }
    const button = document.createElement('button'); button.type = 'button'; button.dataset.previewNav = target.key;
    target.link.classList.add('nav-preview-target');
    const apply = () => { target.link.hidden = !visible; button.setAttribute('aria-pressed', String(visible)); button.textContent = target.label + ' link: ' + (visible ? 'On' : 'Off'); };
    button.addEventListener('click', () => { visible = !visible; apply(); try { localStorage.setItem(key, visible ? 'on' : 'off'); } catch { /* Tab choice still works. */ } });
    group.append(button); apply();
  }
  const note = document.createElement('small'); note.textContent = 'Navigation links only. Both pages, direct links, history and methodology stay available. Saved in this browser.'; group.append(note); options.append(group);
})();

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "nav-preview.js", status: "initialization_failed"}})); } catch {}
}

;
/* Astra source: rate-title-preview.js */
try {
(() => {
  'use strict';
  const title=document.getElementById('overview-title'),options=document.getElementById('display-options');
  if(!title||!options||document.getElementById('rate-title-options'))return;
  const choices=new Map([['benchmark','Goods-inflation NX benchmark'],['calculated','Calculated NX rate'],['estimated','Estimated NX rate']]);
  const key='astra-rate-title-v1';let selected='benchmark';try{const saved=localStorage.getItem(key);if(choices.has(saved))selected=saved;}catch{}
  const group=document.createElement('div');group.id='rate-title-options';group.className='hero-layout-options';group.dataset.previewControls='true';group.setAttribute('role','group');group.setAttribute('aria-label','NX headline wording');
  const label=document.createElement('span');label.textContent='NX headline wording';group.append(label);
  function apply(){title.textContent=choices.get(selected);for(const button of group.querySelectorAll('button'))button.setAttribute('aria-pressed',String(button.dataset.rateTitle===selected));}
  for(const [value,text] of choices){const button=document.createElement('button');button.type='button';button.dataset.rateTitle=value;button.textContent=text;button.addEventListener('click',()=>{selected=value;try{localStorage.setItem(key,value)}catch{}apply()});group.append(button)}
  const note=document.createElement('small');note.textContent='Wording only. Every option retains the goods-based model and its explanation; the cash-sale estimate stays separate.';group.append(note);const explanation=document.querySelector('.hero-benchmark-explanation');if(explanation){let shown=true;const key='astra-benchmark-explanation-v1';try{shown=localStorage.getItem(key)!=='off'}catch{}const button=document.createElement('button');button.type='button';const update=()=>{explanation.hidden=!shown;button.textContent='Buying-power explanation: '+(shown?'On':'Off');button.setAttribute('aria-pressed',String(shown))};button.addEventListener('click',()=>{shown=!shown;try{localStorage.setItem(key,shown?'on':'off')}catch{}update()});group.append(button);update()}options.append(group);
  document.addEventListener('astramarketsnapshot',apply);apply();
})();

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "rate-title-preview.js", status: "initialization_failed"}})); } catch {}
}

;
/* Astra source: category-link-preview.js */
try {
(() => {
  'use strict';
  const section=document.getElementById('category-section'),link=section?.querySelector('.category-basket-link'),heading=section?.querySelector('.category-section-heading'),cards=document.getElementById('category-cards');
  if(!link||!heading||!cards||document.getElementById('category-link-options'))return;
  const key='astra-category-link-position-v1',modes=new Set(['categories','headline','cash']);let selected='headline';try{const saved=localStorage.getItem(key);if(modes.has(saved))selected=saved}catch{}
  const group=document.createElement('div');group.id='category-link-options';group.className='category-value-options';group.dataset.previewControls='true';group.setAttribute('role','group');group.setAttribute('aria-label','Representative items link position');
  const label=document.createElement('span');label.textContent='Representative items link';group.append(label);
  function apply(){const cash=document.getElementById('cash-item-highlights');if(selected==='headline')heading.append(link);else if(selected==='cash'&&cash)cash.querySelector('.cash-highlights-controls')?.before(link);else cards.after(link);link.dataset.linkPosition=selected;for(const button of group.querySelectorAll('button[data-category-link]'))button.setAttribute('aria-pressed',String(button.dataset.categoryLink===selected));}
  for(const [value,text] of [['categories','Below categories'],['headline','Beside headline'],['cash','Below cash items']]){const button=document.createElement('button');button.type='button';button.dataset.categoryLink=value;button.textContent=text;button.addEventListener('click',()=>{selected=value;try{localStorage.setItem(key,value)}catch{}apply()});group.append(button)}
  const title=heading.querySelector('.eyebrow'),titleKey='astra-category-section-label-v1';let style='gold';try{const stored=localStorage.getItem(titleKey);if(['mint','gold','classic'].includes(stored))style=stored}catch{}
  const titleGroup=document.createElement('span');titleGroup.className='category-label-options';
  const applyLabel=()=>{section.dataset.sectionLabel=style;if(title)title.textContent=style==='classic'?'INSIDE THE INFLATION':'Inside the inflation';for(const button of titleGroup.querySelectorAll('button'))button.setAttribute('aria-pressed',String(button.dataset.sectionLabel===style))};
  for(const [value,text] of [['mint','Inside the inflation · Mint'],['gold','Inside the inflation · Gold'],['classic','Original capitals']]){const button=document.createElement('button');button.type='button';button.dataset.sectionLabel=value;button.textContent=text;button.addEventListener('click',()=>{style=value;try{localStorage.setItem(titleKey,value)}catch{}applyLabel()});titleGroup.append(button)}group.append(titleGroup);applyLabel();
  section.append(group);document.addEventListener('astramarketsnapshot',apply);apply();
})();

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "category-link-preview.js", status: "initialization_failed"}})); } catch {}
}

;
/* Astra source: mystery-boxes.js */
try {
(() => {
  'use strict';
  const content = document.getElementById('content');
  if (!content || document.getElementById('view-mystery-boxes')) return;
  // Factual edition data extracted independently from the official public CMS receipts.
  const evidence = {"schemaVersion":1,"kind":"official_classic_world_mystery_box_editions","evidenceCapturedAt":"2026-11-05T13:19:55.317031+00:00","editionIdentity":"announcement + sale window + captured rate-body hash; names and original publication dates alone are insufficient","probabilityPolicy":"Published rounded probabilities are retained without renormalization. All four verified tables sum to100 as displayed; this does not recover extra precision. No equal-odds assumption.","editions":[{"id":"mystery-fashion-2026-11-04","name":"Mystery Fashion Crate","title":"Mystery Fashion Crate · Nov 4 rotation","game":"MapleStory Classic World","region":"Global","saleStart":"2026-11-04T08:00:00Z","saleEnd":null,"saleWindow":"Nov 4, 08:00 UTC → Nov 18, start of maintenance","crateDurationDays":7,"cost":{"currency":"NX","single":3500,"bundle":35000,"bundleCount":11},"announcement":{"pageUrl":"https://www.nexon.com/maplestory/news/47031","contentUrl":"https://g.nexonstatic.com/maplestory/cms/v1/news/47031","publishedAt":"2026-11-03T16:00:00Z","capturedAt":"2026-11-05T13:19:54.273863+00:00","sha256":"027f2ced10bca9eae520cfc078cd7023314730b44c5ae89e4d3b9f012acaabe1"},"probabilitySource":{"pageUrl":"https://www.nexon.com/maplestory/general-post/46331","contentUrl":"https://g.nexonstatic.com/maplestory/cms/v1/general-posts/46331","publishedAt":"2026-10-20T16:00:00Z","capturedAt":"2026-11-05T13:19:55.597466+00:00","sha256":"f965e9e5385bc7a2f8a42324e71aa25758b6dd5d43a824b97e58e1a0c1603a19"},"probabilityStatus":"verified_published_rounded","outcomes":[{"name":"Woodsman Hat","publishedPercent":3.0},{"name":"Bomber Jacket","publishedPercent":2.0},{"name":"Patched Denim Jeans","publishedPercent":2.0},{"name":"Green Sports Goggles","publishedPercent":1.0},{"name":"Pelvis Hoodie","publishedPercent":2.0},{"name":"Red Hooded Coat","publishedPercent":2.0},{"name":"Bunny-Padded Snowboard Pants","publishedPercent":2.0},{"name":"Pillow","publishedPercent":1.0},{"name":"Grey Visor Beanie","publishedPercent":2.0},{"name":"Black Fur Wrap Coat","publishedPercent":2.0},{"name":"Blue Kitty Hood","publishedPercent":2.0},{"name":"Mix-n-Match Sneakers","publishedPercent":3.0},{"name":"Starry Sky Blue Beanie","publishedPercent":3.0},{"name":"Big Rabbit Feet","publishedPercent":2.0},{"name":"White Rabbit's Foot","publishedPercent":1.0},{"name":"Olive Beanie","publishedPercent":2.0},{"name":"Bandage Strip","publishedPercent":1.0},{"name":"Pink Knitted Gumball","publishedPercent":3.0},{"name":"Pink Snowboard Top","publishedPercent":2.0},{"name":"Pink Snowboard Pants","publishedPercent":2.0},{"name":"Pink Galoshes","publishedPercent":3.0},{"name":"Bunny Hat","publishedPercent":2.0},{"name":"Bunny Slippers","publishedPercent":1.0},{"name":"Pink Rabbit Puppet","publishedPercent":1.0},{"name":"Bunny Costume","publishedPercent":2.0},{"name":"Old School Uniform Hat","publishedPercent":3.0},{"name":"Old School Blazer","publishedPercent":1.0},{"name":"Old School Uniform Top","publishedPercent":2.0},{"name":"Old School Uniform Pants","publishedPercent":1.0},{"name":"Old School Uniform Skirt","publishedPercent":3.0},{"name":"White High Top","publishedPercent":3.0},{"name":"Medical Eye Patch","publishedPercent":1.0},{"name":"My Buddy Rex","publishedPercent":2.0},{"name":"Blue Snow Flower Wear","publishedPercent":2.0},{"name":"Superstar Headphones","publishedPercent":1.0},{"name":"Kitty Hoodie","publishedPercent":2.0},{"name":"Pink Down Parka","publishedPercent":2.0},{"name":"Amorian Pink Skirt","publishedPercent":2.0},{"name":"Ice Cold Red","publishedPercent":2.0},{"name":"Teddy Bear Headgear","publishedPercent":2.0},{"name":"Teddy Bear Costume","publishedPercent":2.0},{"name":"Teddy Bear Shoes","publishedPercent":3.0},{"name":"Teddy Bear","publishedPercent":1.0},{"name":"Teddy Bear Gloves","publishedPercent":3.0},{"name":"Cuddle Bear","publishedPercent":1.0},{"name":"Teddy Bear Chat Ring","publishedPercent":1.0},{"name":"Blue Pajama Hat","publishedPercent":2.0},{"name":"Blue Polka-Dot Pajama Top","publishedPercent":3.0},{"name":"Blue Polka-Dot Pajama Pants","publishedPercent":3.0},{"name":"Blue Marble Slippers","publishedPercent":3.0}],"notes":["The probability page retains an Oct 20 publication clock but its captured body contains the Nov 4 Teddy rotation. This receipt applies only to the Nov 4 edition; it does not establish earlier contents or their probabilities."],"publishedProbabilitySum":100.0},{"id":"halloween-2026-10-28","name":"Halloween Mystery Fashion Crate","title":"Halloween Mystery Fashion Crate · Oct 28 rotation","game":"MapleStory Classic World","region":"Global","saleStart":"2026-10-28T08:00:00Z","saleEnd":"2026-11-04T07:59:00Z","saleWindow":"Oct 28, 08:00 → Nov 4, 07:59 UTC","crateDurationDays":7,"cost":{"currency":"NX","single":4900,"bundle":49000,"bundleCount":11},"announcement":{"pageUrl":"https://www.nexon.com/maplestory/news/46602","contentUrl":"https://g.nexonstatic.com/maplestory/cms/v1/news/46602","publishedAt":"2026-10-27T16:00:00Z","capturedAt":"2026-11-05T13:19:54.628854+00:00","sha256":"652f23ed72f93da323f6d734c47903e5c7770cf9aaa4fc1558fa8a9c9a29c866"},"probabilitySource":{"pageUrl":"https://www.nexon.com/maplestory/general-post/46524","contentUrl":"https://g.nexonstatic.com/maplestory/cms/v1/general-posts/46524","publishedAt":"2026-10-27T16:00:00Z","capturedAt":"2026-11-05T13:19:55.925107+00:00","sha256":"16d4689fa00b005ccee9f89e3e591fd9251dd3abe3f865fcc72685e22bf12c30"},"probabilityStatus":"verified_published_rounded","outcomes":[{"name":"Tiger Mask","publishedPercent":2.0},{"name":"Prisoner Top","publishedPercent":2.0},{"name":"Prisoner Pants","publishedPercent":2.0},{"name":"Brown Bandage","publishedPercent":2.0},{"name":"Scream Mask","publishedPercent":3.0},{"name":"Skull T-Shirt","publishedPercent":2.0},{"name":"Bone Buckled Slacks","publishedPercent":3.0},{"name":"Skull Beanie","publishedPercent":3.0},{"name":"Dark Suit","publishedPercent":3.0},{"name":"Dark Enamel Suit","publishedPercent":3.0},{"name":"Black Leather Boots","publishedPercent":3.0},{"name":"Black Bandage","publishedPercent":2.0},{"name":"Skull Patch","publishedPercent":1.0},{"name":"Grey Skull Overall","publishedPercent":2.5},{"name":"Red Skull Overall","publishedPercent":2.5},{"name":"Skull Gloves","publishedPercent":2.0},{"name":"Black Coat of Death","publishedPercent":2.0},{"name":"Ghost Suit","publishedPercent":2.0},{"name":"Black Shoes of Death","publishedPercent":3.0},{"name":"Hat of Death","publishedPercent":2.0},{"name":"Ragged Gomushin","publishedPercent":2.0},{"name":"Witch Hat","publishedPercent":2.0},{"name":"Ghost Costume","publishedPercent":3.0},{"name":"Witch Clothes","publishedPercent":2.0},{"name":"Witch's Broomstick","publishedPercent":1.0},{"name":"Gargoyle Wings","publishedPercent":1.0},{"name":"Battle Scar","publishedPercent":1.0},{"name":"Mummy Hat","publishedPercent":2.0},{"name":"Mummy Suit","publishedPercent":2.0},{"name":"Mummy Mask","publishedPercent":2.0},{"name":"White Bandage","publishedPercent":2.0},{"name":"Devil Wings","publishedPercent":1.0},{"name":"Blue Chinese Undead Hat","publishedPercent":2.0},{"name":"Blue Chinese Undead Costume","publishedPercent":2.0},{"name":"Maple-Stein Head","publishedPercent":2.0},{"name":"Maple-Stein Face","publishedPercent":2.0},{"name":"Demon Goblin","publishedPercent":1.0},{"name":"Pumpkin Hat","publishedPercent":2.0},{"name":"Pumpkin Headgear","publishedPercent":2.0},{"name":"Pumpkin Suit","publishedPercent":2.0},{"name":"Glowing Pumpkin Basket","publishedPercent":2.0},{"name":"Evil Skull","publishedPercent":1.0},{"name":"Cat Soul","publishedPercent":1.0},{"name":"Devilish Horns","publishedPercent":2.0},{"name":"Devil Horns","publishedPercent":2.0},{"name":"Dark Devil Hat","publishedPercent":2.0},{"name":"Coffin of Gloom","publishedPercent":2.0},{"name":"Count Dracula Cape","publishedPercent":1.0},{"name":"Iljimae Mask","publishedPercent":2.0},{"name":"Stealth Suit","publishedPercent":2.0}],"notes":[],"publishedProbabilitySum":100.0},{"id":"founders-2026-10-06","name":"Founder's Mystery Fashion Crate","title":"Founder's Mystery Fashion Crate · Founder’s Access","game":"MapleStory Classic World","region":"Global","saleStart":null,"saleEnd":"2026-10-28T07:59:00Z","saleWindow":"Oct 6, end of maintenance → Oct 28, 07:59 UTC","crateDurationDays":7,"cost":{"currency":"NX","single":3500,"bundle":35000,"bundleCount":11},"announcement":{"pageUrl":"https://www.nexon.com/maplestory/news/45819","contentUrl":"https://g.nexonstatic.com/maplestory/cms/v1/news/45819","publishedAt":"2026-10-05T19:55:07Z","capturedAt":"2026-11-05T13:19:55.317031+00:00","sha256":"3df1c1ba9b1794b03bd8962bdc3f52cbc5ff70ebf777ca535b909d969df7f629"},"probabilitySource":{"pageUrl":"https://www.nexon.com/maplestory/general-post/45538","contentUrl":"https://g.nexonstatic.com/maplestory/cms/v1/general-posts/45538","publishedAt":"2026-10-05T19:00:49Z","capturedAt":"2026-11-05T13:20:19.247557+00:00","sha256":"6c88e7ce3c274146bb3a5dce350142c445d5e224fd1fe3d11df24097035d5e36"},"probabilityStatus":"verified_published_rounded","outcomes":[{"name":"Angel Halo","publishedPercent":1.0},{"name":"Toga","publishedPercent":1.0},{"name":"Baby Angel Wings","publishedPercent":1.0},{"name":"Angel Wand","publishedPercent":1.0},{"name":"Cherub's Bow","publishedPercent":1.0},{"name":"Blue Cap","publishedPercent":2.0},{"name":"Orange Baseball Jacket","publishedPercent":2.5},{"name":"Rainbow Knit","publishedPercent":2.5},{"name":"Ripped Jeans","publishedPercent":2.5},{"name":"Orange Toy Hammer","publishedPercent":1.0},{"name":"Blue Bucket Hat","publishedPercent":2.5},{"name":"Tourist T","publishedPercent":2.5},{"name":"White Jeans","publishedPercent":2.5},{"name":"Black Sunglasses","publishedPercent":1.0},{"name":"Cat Hat","publishedPercent":2.5},{"name":"Cat Suit","publishedPercent":2.5},{"name":"Gold Kitty Slippers","publishedPercent":2.5},{"name":"Kitty Chat Ring","publishedPercent":2.5},{"name":"Meshcap","publishedPercent":2.5},{"name":"Pink Allstar","publishedPercent":2.5},{"name":"Jean Shorts","publishedPercent":2.5},{"name":"Beret","publishedPercent":2.5},{"name":"Red Sailor Shirt","publishedPercent":2.5},{"name":"Red Sailor Skirt","publishedPercent":2.5},{"name":"Black Enamel Shoes","publishedPercent":2.5},{"name":"Patissier Hat","publishedPercent":3.0},{"name":"Patissier Uniform","publishedPercent":3.0},{"name":"Yellow Spatula","publishedPercent":1.0},{"name":"Bunny Ears","publishedPercent":1.0},{"name":"Bunny Earmuffs","publishedPercent":1.0},{"name":"Orange Mushroom Balloon","publishedPercent":1.0},{"name":"Blue Watch","publishedPercent":2.5},{"name":"Red Trainer Jacket","publishedPercent":2.5},{"name":"Red Trainer Pants","publishedPercent":2.5},{"name":"Yellow Rainbow Sneaks","publishedPercent":2.5},{"name":"Dollish Pink","publishedPercent":1.0},{"name":"Purple Dorothy Dress","publishedPercent":2.5},{"name":"Sailor Hat","publishedPercent":2.0},{"name":"Sailor Outfit","publishedPercent":2.0},{"name":"White Ribboned Sailor Dress","publishedPercent":2.0},{"name":"Slime T-Shirt","publishedPercent":1.0},{"name":"Slime Slippers","publishedPercent":1.0},{"name":"Slime Earrings","publishedPercent":1.0},{"name":"Reggae Hat","publishedPercent":2.5},{"name":"Orange Hooded Shirt","publishedPercent":2.5},{"name":"White Hooded Vest","publishedPercent":2.5},{"name":"Butterfly Skirt","publishedPercent":2.5},{"name":"Beetle Long Sleeve","publishedPercent":2.5},{"name":"Lined Hip-Hop Pants","publishedPercent":2.5},{"name":"White Label Ring","publishedPercent":1.0}],"notes":[],"publishedProbabilitySum":100.0},{"id":"aurora-season-1-2026","name":"Aurora Mystery Fashion Crate","title":"Aurora Mystery Fashion Crate · Season 1","game":"MapleStory Classic World","region":"Global","saleStart":null,"saleEnd":"2027-01-13T07:59:00Z","saleWindow":"Oct 6, end of maintenance → Jan 13, 2027, 07:59 UTC","crateDurationDays":7,"cost":{"currency":"Aurora Stamps","single":20,"bundle":200,"bundleCount":10},"announcement":{"pageUrl":"https://www.nexon.com/maplestory/news/45819","contentUrl":"https://g.nexonstatic.com/maplestory/cms/v1/news/45819","publishedAt":"2026-10-05T19:55:07Z","capturedAt":"2026-11-05T13:19:55.317031+00:00","sha256":"3df1c1ba9b1794b03bd8962bdc3f52cbc5ff70ebf777ca535b909d969df7f629"},"probabilitySource":{"pageUrl":"https://www.nexon.com/maplestory/general-post/45659","contentUrl":"https://g.nexonstatic.com/maplestory/cms/v1/general-posts/45659","publishedAt":"2026-10-05T19:00:23Z","capturedAt":"2026-11-05T13:20:19.595096+00:00","sha256":"2da85bc74092abda3f075bb94aa001596ecc2e4a7c21d8658aef481f084861ee"},"probabilityStatus":"verified_published_rounded","outcomes":[{"name":"White Choco Bunny","publishedPercent":1.5},{"name":"Splash Choco Boy","publishedPercent":2.5},{"name":"Splash Choco Girl","publishedPercent":2.5},{"name":"Cacao Bear Shoes","publishedPercent":2.5},{"name":"Chocolate Ribbon","publishedPercent":2.5},{"name":"Soft Chocolate Fondue Scepter","publishedPercent":1.5},{"name":"Choco Candy Cookie","publishedPercent":2.0},{"name":"Black Cat Beanie","publishedPercent":5.0},{"name":"Sky Blue Cat Beanie","publishedPercent":5.0},{"name":"Orange Cat Beanie","publishedPercent":5.0},{"name":"Heart Sunglasses","publishedPercent":5.0},{"name":"Red Check Rider","publishedPercent":5.0},{"name":"Violet Dot Jeans","publishedPercent":5.0},{"name":"Pink Bunny Sweater","publishedPercent":5.0},{"name":"Hearts Tights","publishedPercent":5.0},{"name":"Pink Elephant Slippers","publishedPercent":5.0},{"name":"Loose Fit Sweater","publishedPercent":4.5},{"name":"Stocking Shorts","publishedPercent":4.5},{"name":"Detective Glass","publishedPercent":2.0},{"name":"Blank Eye Patch","publishedPercent":2.0},{"name":"Heartbreaker Lips","publishedPercent":2.0},{"name":"Starlight Heart Scepter","publishedPercent":2.0},{"name":"Ink-and-Wash Thought Bubble Ring","publishedPercent":5.75},{"name":"Ink-and-Wash Painting Name Tag Ring","publishedPercent":5.75},{"name":"Chocolate Label Ring","publishedPercent":5.75},{"name":"Chocolate Chat Ring","publishedPercent":5.75}],"notes":["Stamp cost has no fixed NX equivalent here; exchanging an unwanted reward has an opportunity cost, not a guaranteed original NX purchase cost."],"publishedProbabilitySum":100.0},{"id":"mystery-fashion-grand-launch-2026","name":"Mystery Fashion Crate","title":"Mystery Fashion Crate · Grand Launch rotation","game":"MapleStory Classic World","region":"Global","saleStart":null,"saleEnd":"2026-11-04T07:59:00Z","saleWindow":"Grand Launch Oct 21 → Nov 4, 07:59 UTC","crateDurationDays":7,"cost":{"currency":"NX","single":3500,"bundle":35000,"bundleCount":11},"announcement":{"pageUrl":"https://www.nexon.com/maplestory/news/46362","contentUrl":"https://g.nexonstatic.com/maplestory/cms/v1/news/46362","publishedAt":"2026-10-20T16:00:02Z","capturedAt":"2026-11-05T13:19:54.983299+00:00","sha256":"4984ca3d0227803b82c0ab09ac69817265b66fd36a7cae0d4cbcc3765979b2e6"},"probabilitySource":null,"probabilityStatus":"unavailable_historical_edition_overwritten","outcomes":[],"notes":["The historical announcement links to the same mutable probability URL now serving the Nov 4 rotation. No contemporaneous Grand Launch probability snapshot is verified here; do not reuse the newer table."],"publishedProbabilitySum":null}]};
  const make = (tag, cls, text) => { const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n; };
  const positive = v => Number.isFinite(v)&&v>0;
  // IDs were resolved by unique exact names in the captured MCW client catalog;
  // the independent official probability table above supplies the probabilities.
  const rollingPlanHash = 'dc2b91bb8252bd5e9556c341139bc4f3c22e14a95884ea6d6780a909c5d4b0ed';
  const rollingRewardIds = {"Woodsman Hat":1007074,"Bomber Jacket":1047135,"Patched Denim Jeans":1067174,"Green Sports Goggles":1027028,"Pelvis Hoodie":1047094,"Red Hooded Coat":1047095,"Bunny-Padded Snowboard Pants":1067079,"Pillow":1702019,"Grey Visor Beanie":1007132,"Black Fur Wrap Coat":1057094,"Blue Kitty Hood":1057089,"Mix-n-Match Sneakers":1077058,"Starry Sky Blue Beanie":1007043,"Big Rabbit Feet":1077030,"White Rabbit's Foot":1702026,"Olive Beanie":1007072,"Bandage Strip":1017015,"Pink Knitted Gumball":1007274,"Pink Snowboard Top":1047015,"Pink Snowboard Pants":1067013,"Pink Galoshes":1077023,"Bunny Hat":1007053,"Bunny Slippers":1077020,"Pink Rabbit Puppet":1702017,"Bunny Costume":1057057,"Old School Uniform Hat":1007103,"Old School Blazer":1047044,"Old School Uniform Top":1047075,"Old School Uniform Pants":1067045,"Old School Uniform Skirt":1067065,"White High Top":1077087,"Medical Eye Patch":1027022,"My Buddy Rex":1107016,"Blue Snow Flower Wear":1057128,"Superstar Headphones":1007137,"Kitty Hoodie":1057095,"Pink Down Parka":1047089,"Amorian Pink Skirt":1067078,"Ice Cold Red":1017088,"Teddy Bear Headgear":1007133,"Teddy Bear Costume":1057099,"Teddy Bear Shoes":1077053,"Teddy Bear":1702013,"Teddy Bear Gloves":1087019,"Cuddle Bear":1107013,"Teddy Bear Chat Ring":1112217,"Blue Pajama Hat":1007058,"Blue Polka-Dot Pajama Top":1047021,"Blue Polka-Dot Pajama Pants":1067018,"Blue Marble Slippers":1077018};
  const clock = v => typeof v==='string'&&/(?:Z|[+-]\d\d:\d\d)$/.test(v)&&Number.isFinite(Date.parse(v))?Date.parse(v):null;
  function rollingValue(edition,snapshot) {
    const refs=snapshot?.cashPriceReferences, supported=edition.id==='mystery-fashion-2026-11-04';
    const identity=supported&&refs?.schemaVersion===1&&refs.kind==='supplemental_cash_rolling_references'&&refs.editionId===edition.id&&refs.planHash===rollingPlanHash&&refs.sourceUrl==='https://mesos.watch/';
    const items=identity&&Array.isArray(refs.items)?refs.items:[],batch=identity?refs.latestBatch:null,start=clock(batch?.captureStartedAt),end=clock(batch?.captureCompletedAt);
    const complete=!!(batch?.completePlan===true&&batch.completedAttemptCount===50&&batch.acceptedSaleCount===50&&batch.noEligibleSalesCount===0&&Array.isArray(batch.missingItemIds)&&batch.missingItemIds.length===0&&start!==null&&end!==null&&end>=start&&items.length===50);
    const rows=edition.outcomes.map(outcome=>{
      const id=rollingRewardIds[outcome.name],matches=items.filter(r=>r&&r.id===id),r=matches.length===1?matches[0]:null,captured=clock(r?.capturedAt);
      const valid=supported&&r&&r.expectedItemId===id&&r.name===outcome.name&&r.expectedItemName===outcome.name&&positive(r.price)&&Number.isInteger(r.salesCounted)&&r.salesCounted>=5&&r.windowDays===30&&r.priceBasis==='median of sales'&&r.currency==='mesos'&&r.statRollKnown===true&&(r.statRoll==='Clean'||r.statRoll===null)&&r.captureTimeKind==='per_item_return'&&captured!==null;
      const inBatch=valid&&start!==null&&end!==null&&captured>=start&&captured<=end;
      return {...outcome,id,reference:valid?r:null,inBatch:!!inBatch};
    });
    const priced=rows.filter(r=>r.reference),probability=priced.reduce((sum,r)=>sum+r.publishedPercent,0),all=supported&&rows.length===50&&priced.length===50&&rows.every(r=>r.inBatch)&&complete&&edition.publishedProbabilitySum===100;
    return {supported,identity,rows,priced:priced.length,probability,complete,ev:all?rows.reduce((sum,r)=>sum+r.publishedPercent/100*r.reference.price,0):null,start:batch?.captureStartedAt??null,end:batch?.captureCompletedAt??null,mixedCaptureTimes:new Set(priced.map(r=>r.reference.capturedAt)).size>1,windowDays:30,contentHash:identity?refs.contentHash??null:null};
  }
  window.AstraMysteryBoxes = { rollingValue };
  const day = v => typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
  const fmt = (v,d=1) => Number.isFinite(v)?v.toLocaleString('en-US',{maximumFractionDigits:d}):'Unavailable';
  const time = v => typeof v==='string'&&/(?:Z|[+-]\d\d:\d\d)$/.test(v)&&Number.isFinite(Date.parse(v))?v.replace('T',' ').replace(/Z$/,' UTC'):'Unknown';
  const page=make('section','view mystery-boxes');page.id='view-mystery-boxes';page.hidden=true;page.setAttribute('aria-labelledby','mystery-box-title');
  page.innerHTML='<div class="page-heading"><div><p class="eyebrow">OFFICIAL EDITIONS / SEPARATE MARKET OBSERVATIONS</p><h1 id="mystery-box-title">Mystery boxes.</h1><p>Published rewards, purchase costs and dated resale evidence. Random rewards have no fixed individual NX purchase cost.</p></div></div><p class="mystery-source-clock" role="status"></p><div class="mystery-controls"><label>Cash-shop edition<select id="mystery-edition"></select></label><label>Market source day<select id="mystery-day"></select></label></div><div class="mystery-edition"></div><div class="mystery-values" aria-live="polite"></div><p class="mystery-limitations">Reward expected value is a gross resale proxy using published rounded probabilities × same-day qualified daily medians (at least five recorded sales per reward). It requires every outcome to be priced. Prices are source-inferred aggregates that can mix item quality; fees, selling delays, liquidity and unobserved trades are excluded. This is not a realized return, guaranteed sale or NX exchange rate.</p><div class="mystery-rewards"></div><details class="mystery-history"><summary>Value history and calculation coverage</summary><div></div></details><details class="mystery-provenance"><summary>Edition identity, source clocks and evidence</summary><div></div></details><p><a href="#cash-catalog">Cash catalog →</a> · <a href="#nx">Known-price NX estimates →</a></p>';
  content.append(page);
  const editionSelect=page.querySelector('#mystery-edition'),daySelect=page.querySelector('#mystery-day'),editionHost=page.querySelector('.mystery-edition'),valueHost=page.querySelector('.mystery-values'),rewardHost=page.querySelector('.mystery-rewards');
  for(const e of evidence.editions){const o=make('option','',e.title);o.value=e.id;editionSelect.append(o);}
  for(const id of ['view-cash-catalog','view-cash-basket','view-nx']){const view=document.getElementById(id);if(!view)continue;const p=make('p','mystery-box-link'),a=make('a','','Mystery boxes: rewards, costs and values →');a.href='#mystery-boxes';p.append(a);const h=view.querySelector('.page-heading');if(h)h.after(p);else view.prepend(p);}
  let report=null, sourceRows=[], selectedDay=null, sortKey='name', ascending=true, historySort='date', historyAscending=false, rollingSort='name', rollingAscending=true;
  const rollingHost=make('section','mystery-rolling');rollingHost.setAttribute('aria-labelledby','mystery-rolling-title');valueHost.after(rollingHost);
  function matching(name){const matches=sourceRows.filter(r=>typeof r.name==='string'&&r.name.toLocaleLowerCase()===name.toLocaleLowerCase());return matches.length===1?matches[0]:null;}
  function price(row,date){if(!row||!Array.isArray(row.history))return null;const found=row.history.filter(p=>Array.isArray(p)&&p[0]===date&&positive(p[1])&&Number.isInteger(p[2])&&p[2]>=5);return found.length===1?{value:found[0][1],quantity:found[0][2]}:null;}
  function valueAt(edition,date){const startDay=edition.id==='mystery-fashion-2026-11-04'?'2026-11-04':edition.id==='halloween-2026-10-28'?'2026-10-28':edition.id==='mystery-fashion-grand-launch-2026'?'2026-10-21':'2026-10-06';const eligible=day(date)&&date>=startDay;const rows=edition.outcomes.map(o=>({...o,row:matching(o.name)})).map(o=>({...o,point:eligible?price(o.row,date):null}));const priced=rows.filter(o=>o.point),probability=priced.reduce((s,o)=>s+o.publishedPercent,0),all=rows.length>0&&priced.length===rows.length;return {rows,priced:priced.length,probability,ev:all?priced.reduce((s,o)=>s+o.point.value*o.publishedPercent/100,0):null};}
  function link(url,label){const a=make('a','',label);a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;}
  function card(label,value,note){const c=make('article','mystery-value');c.append(make('h2','',label),make('strong','',value),make('p','',note));return c;}
  function drawRolling(edition){
    const value=rollingValue(edition,report);rollingHost.replaceChildren();
    if(!value.supported)return;
    const heading=make('h2','','Rolling-reference reward value');heading.id='mystery-rolling-title';
    const summary=card('Expected gross value · rolling references',value.ev===null?'Unavailable':fmt(value.ev)+' mesos',`${value.priced}/50 rewards priced · ${fmt(value.probability,2)}% published probability coverage. ${value.ev===null?'All 50 valid references within one complete capture batch are required; no partial basket is renormalized.':`${fmt(value.ev*edition.cost.bundleCount)} mesos expected gross proxy for ${edition.cost.bundleCount} openings under the same published rounded odds.`}`);summary.dataset.mysteryRollingEv='true';
    const span=clock(value.start)!==null&&clock(value.end)!==null&&clock(value.end)>=clock(value.start)?Math.ceil((clock(value.end)-clock(value.start))/60000):null;
    rollingHost.append(heading,summary,make('p','mystery-rolling-clocks',`Capture batch: ${time(value.start)} → ${time(value.end)}${span!==null?` (approximately ${span} minutes)` :''}. ${value.mixedCaptureTimes?'Mixed per-item receipt clocks.':'Per-item receipt clocks are retained where available.'} These receipt times are not underlying sale timestamps.`),make('p','mystery-rolling-caution','Separate 30-day reported-lookback medians of sales, labelled Clean or explicitly null by the source. Actual source-window boundaries and underlying observation timestamps are unknown; no same-day or instant EV is implied. A Clean label does not establish constant item quality. Prices are not guaranteed executable proceeds; fees, liquidity and selling delays are excluded. This branch does not change daily EV, fixed reward NX costs, the headline or fee settings.'));
    const details=make('details','mystery-rolling-details'),title=make('summary','','Individual rolling references and receipt clocks');details.append(title);
    const table=make('table');table.setAttribute('aria-label','Separate rolling reward medians and per-item receipt clocks');const head=table.createTHead().insertRow();
    for(const [key,label] of [['name','Reward'],['id','Verified item ID'],['price','Rolling median · mesos'],['quantity','Recorded count'],['capturedAt','Receipt time · UTC']]){const th=make('th');th.setAttribute('aria-sort',key===rollingSort?(rollingAscending?'ascending':'descending'):'none');const button=make('button','',label+(key===rollingSort?(rollingAscending?' ↑':' ↓'):''));button.type='button';button.dataset.mysteryRollingSort=key;th.append(button);head.append(th);}
    const rows=value.rows.map((r,i)=>({...r,price:r.reference?.price??null,quantity:r.reference?.salesCounted??null,capturedAt:r.reference?.capturedAt??null,i})).sort((a,b)=>{const x=a[rollingSort],y=b[rollingSort];if(x===null||x===undefined)return y===null||y===undefined?a.i-b.i:1;if(y===null||y===undefined)return-1;return(typeof x==='number'?x-y:String(x).localeCompare(String(y)))*(rollingAscending?1:-1)||a.i-b.i;});
    const body=table.createTBody();for(const r of rows){const tr=body.insertRow();tr.dataset.mysteryRollingReward=r.name;tr.insertCell().textContent=r.name;tr.insertCell().textContent=String(r.id);tr.insertCell().textContent=fmt(r.price);tr.insertCell().textContent=fmt(r.quantity,0);tr.insertCell().textContent=r.capturedAt?time(r.capturedAt):'Unavailable';}
    const wrap=make('div','table-wrap');wrap.append(table);details.append(wrap,make('p','',`Capture plan SHA-256: ${rollingPlanHash}. Source snapshot hash: ${value.contentHash||'Unavailable'}.`),link('https://mesos.watch/','Rolling-reference source: mesos.watch ↗'));rollingHost.append(details);
  }
  function draw(){
    const e=evidence.editions.find(e=>e.id===editionSelect.value)||evidence.editions[0],v=valueAt(e,selectedDay),crate=price(matching(e.name),selectedDay),cost=e.cost;
    drawRolling(e);
    editionHost.replaceChildren(make('h2','',e.title),make('p','',`Published sale window: ${e.saleWindow}. Crate duration: ${e.crateDurationDays} days. This describes the announcement, not current shop or listing availability.`),make('p','',`${fmt(cost.single,0)} ${cost.currency} for one · ${fmt(cost.bundle,0)} ${cost.currency} for ${cost.bundleCount} (${fmt(cost.bundle/cost.bundleCount,2)} per crate). Reward contents are random.`));
    valueHost.replaceChildren(card('Crate-name daily unit median',crate?fmt(crate.value)+' mesos':'Unavailable',crate?`${selectedDay} · ${fmt(crate.quantity,0)} recorded sales; name match only, not edition-identified units or a live ask.`:'No same-day qualified crate observation.'),card(`${cost.bundleCount}-crate market proxy`,crate?fmt(crate.value*cost.bundleCount)+' mesos':'Unavailable',`${cost.bundleCount} × observed unit median; not an observed bundle trade.`),card('Reward expected gross value',v.ev===null?'Unavailable':fmt(v.ev)+' mesos',e.outcomes.length?`${v.priced}/${e.outcomes.length} rewards priced · ${fmt(v.probability,2)}% published probability coverage · ${selectedDay||'no selected source day'}.${v.ev===null?'':` Expected gross value for ${cost.bundleCount} openings: ${fmt(v.ev*cost.bundleCount)} mesos under the same published odds.`}`:'Earlier-edition probability snapshot not verified; no EV computed.'));
    rewardHost.replaceChildren(make('h2','','Individual reward prices'));
    if(!e.outcomes.length)rewardHost.append(make('p','notice','Grand Launch rates are unavailable in this evidence snapshot. The official rate URL now serves the Nov 4 edition. No newer probabilities or assumed equal chances are substituted.'));
    else {
      const table=make('table');table.dataset.searchReady='true';table.setAttribute('aria-label','Published reward odds and same-day daily prices');const tr=table.createTHead().insertRow(),headers=[['name','Reward'],['publishedPercent','Published probability'],['price','Daily median · mesos'],['quantity','Recorded count']];
      for(const [key,label]of headers){const th=make('th');th.setAttribute('aria-sort',sortKey===key?(ascending?'ascending':'descending'):'none');const b=make('button','',label+(key===sortKey?(ascending?' ↑':' ↓'):''));b.type='button';b.dataset.mysterySort=key;th.append(b);tr.append(th);}
      const body=table.createTBody(),rows=v.rows.map((o,i)=>({...o,price:o.point?.value??null,quantity:o.point?.quantity??null,i})).sort((a,b)=>{const x=a[sortKey],y=b[sortKey];if(x===null||x===undefined)return y===null||y===undefined?a.i-b.i:1;if(y===null||y===undefined)return-1;return(typeof x==='number'?x-y:String(x).localeCompare(String(y)))*(ascending?1:-1)||a.i-b.i;});
      for(const o of rows){const tr=body.insertRow();tr.dataset.mysteryReward=o.name;const name=tr.insertCell();if(o.row&&typeof o.row.slug==='string'&&/^[a-z0-9-]+$/.test(o.row.slug)){const a=make('a','',o.name);a.href='#cash-catalog';a.title='See the cash catalog for retained item history';name.append(a);}else name.textContent=o.name;tr.insertCell().textContent=fmt(o.publishedPercent,2)+'%';tr.insertCell().textContent=fmt(o.price);tr.insertCell().textContent=fmt(o.quantity,0);}
      const wrap=make('div','table-wrap');wrap.append(table);rewardHost.append(make('p','',`Same-day observations: ${selectedDay||'unavailable'}${selectedDay===report?.cashCatalog?.sourceUpdatedAt?.slice(0,10)?' · partial source day':''}. Missing prices stay unavailable; no carry-forward or metadata-only prices.`),wrap);
    }
    const history=page.querySelector('.mystery-history>div');history.replaceChildren();const ht=make('table'),hh=ht.createTHead().insertRow();
    for(const [key,title] of [['date','Source day'],['priced','Rewards priced'],['probability','Probability coverage'],['ev','Reward EV · mesos'],['crate','Crate unit median · mesos']]){const th=make('th');th.setAttribute('aria-sort',key===historySort?(historyAscending?'ascending':'descending'):'none');const button=make('button','',title+(key===historySort?(historyAscending?' ↑':' ↓'):''));button.type='button';button.dataset.mysteryHistorySort=key;th.append(button);hh.append(th);}
    const hb=ht.createTBody(),historyRows=[...daySelect.options].map(o=>{const x=valueAt(e,o.value),c=price(matching(e.name),o.value);return{date:o.value,priced:x.priced,probability:e.outcomes.length?x.probability:null,ev:x.ev,crate:c?.value??null};}).sort((a,b)=>{const x=a[historySort],y=b[historySort];if(x===null)return y===null?a.date.localeCompare(b.date):1;if(y===null)return-1;return(typeof x==='number'?x-y:x.localeCompare(y))*(historyAscending?1:-1)||a.date.localeCompare(b.date);});
    for(const x of historyRows){const r=hb.insertRow();r.insertCell().textContent=x.date+(x.date===report?.cashCatalog?.sourceUpdatedAt?.slice(0,10)?' · partial':'');r.insertCell().textContent=`${x.priced}/${e.outcomes.length}`;r.insertCell().textContent=fmt(x.probability,2)+(x.probability===null?'':'%');r.insertCell().textContent=fmt(x.ev);r.insertCell().textContent=fmt(x.crate);}
    const hw=make('div','table-wrap');hw.append(ht);history.append(hw,make('p','','Each day stands alone; missing outcomes produce an unavailable EV rather than a partial basket or a substituted older price. Source counts are inferred sales, not confirmed individual transactions.'));
    const provenance=page.querySelector('.mystery-provenance>div');provenance.replaceChildren(make('p','',`Edition key: ${e.id}. Game: ${e.game}, ${e.region}.`),link(e.announcement.pageUrl,'Official cash-shop announcement ↗'),make('p','',`Announcement published ${time(e.announcement.publishedAt)}; evidence received ${time(e.announcement.capturedAt)}. Receipt SHA-256: ${e.announcement.sha256}.`));
    if(e.probabilitySource)provenance.append(link(e.probabilitySource.pageUrl,'Official reward probabilities ↗'),make('p','',`${e.outcomes.length} published outcomes; displayed sum ${fmt(e.publishedProbabilitySum,2)}%. Rates are rounded by the publisher and are not renormalized. Rate-page original publication ${time(e.probabilitySource.publishedAt)}; receipt ${time(e.probabilitySource.capturedAt)}; SHA-256 ${e.probabilitySource.sha256}. A receipt timestamp is not an underlying market observation.`));
    for(const note of e.notes)provenance.append(make('p','',note));
    page.querySelector('.mystery-source-clock').textContent=`Market source publication: ${time(report?.cashCatalog?.sourceUpdatedAt)}. Selected day: ${selectedDay||'unavailable'}. Official edition evidence is a separate dated receipt; no current availability is confirmed.`;
  }
  page.querySelector('.mystery-history').addEventListener('click',ev=>{const b=ev.target.closest('[data-mystery-history-sort]');if(!b)return;const key=b.dataset.mysteryHistorySort;historyAscending=key===historySort?!historyAscending:false;historySort=key;draw();});
  rollingHost.addEventListener('click',ev=>{const button=ev.target.closest('button[data-mystery-rolling-sort]');if(!button)return;const key=button.dataset.mysteryRollingSort;rollingAscending=key===rollingSort?!rollingAscending:key==='name';rollingSort=key;drawRolling(evidence.editions.find(e=>e.id===editionSelect.value)||evidence.editions[0]);});
  editionSelect.addEventListener('change',draw);daySelect.addEventListener('change',()=>{selectedDay=daySelect.value;draw();});rewardHost.addEventListener('click',ev=>{const b=ev.target.closest('[data-mystery-sort]');if(!b)return;const key=b.dataset.mysterySort;ascending=sortKey===key?!ascending:key==='name';sortKey=key;draw();});
  document.addEventListener('astramarketsnapshot',ev=>{report=ev.detail||{};sourceRows=(Array.isArray(report.cashCatalog?.rows)?report.cashCatalog.rows:[]).filter(r=>r&&typeof r.name==='string');const days=[...new Set(sourceRows.flatMap(r=>Array.isArray(r.history)?r.history.filter(p=>Array.isArray(p)&&day(p[0])&&positive(p[1])&&Number.isInteger(p[2])&&p[2]>=5).map(p=>p[0]):[]))].sort().reverse();daySelect.replaceChildren();for(const date of days){const o=make('option','',date+(date===report.cashCatalog?.sourceUpdatedAt?.slice(0,10)?' · partial source day':''));o.value=date;daySelect.append(o);}if(!days.includes(selectedDay))selectedDay=days.find(d=>d<report.cashCatalog?.sourceUpdatedAt?.slice(0,10))||days[0]||null;if(selectedDay)daySelect.value=selectedDay;draw();});
  draw();document.dispatchEvent(new CustomEvent('astramarkethighlightsready'));window.dispatchEvent(new Event('hashchange'));
})();

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "mystery-boxes.js", status: "initialization_failed"}})); } catch {}
}

;
/* Astra source: speculation.js */
try {
(() => {
  'use strict';
  if (window.AstraSpeculation) return;
  const HOUR = 3600000, count = v => Number.isSafeInteger(v) && v >= 0;
  const clock = v => typeof v === 'string' && /T.*(?:Z|[+-]\d\d:\d\d)$/.test(v) && Number.isFinite(Date.parse(v)) ? Date.parse(v) : null;
  const source = raw => { try { const u = new URL(raw); return u.protocol === 'https:' && !u.username && !u.password ? u.href : null; } catch { return null; } };
  function activityModel(report) {
    const records = new Map(), fallbackSource = source(report?.smegaSource?.sourceUrl);
    for (const point of (Array.isArray(report?.smega) ? report.smega : []).slice(0, 20000)) {
      const at = clock(point?.at), origin = point?.sourceUrl == null ? fallbackSource : source(point.sourceUrl), n = point?.sampleCount ?? point?.distinctSenders;
      if (at === null || at % HOUR || !origin || !['buy', 'sell'].includes(point.side) || !count(n) || point.aggregation !== 'source_published_hourly') continue;
      const captured = point.capturedAt == null ? origin === fallbackSource ? clock(report?.smegaSource?.capturedAt) : null : clock(point.capturedAt);
      if (captured !== null && captured < at) continue;
      const key = JSON.stringify([origin, at, point.side]), old = records.get(key);
      const next = { origin, at, side: point.side, n, captured, partial: point.partial === true || captured !== null && captured < at + HOUR,
        complete: point.partial !== true && (captured === null ? point.partial === false : captured >= at + HOUR), conflict: false };
      if (!old || captured !== null && (old.captured === null || captured > old.captured)) records.set(key, next);
      else if (captured === old.captured) { if (old.n !== n) old.conflict = true; old.partial ||= next.partial; old.complete &&= next.complete; }
    }
    const sources = new Map();
    for (const point of records.values()) {
      if (!sources.has(point.origin)) sources.set(point.origin, new Map());
      const hours = sources.get(point.origin); if (!hours.has(point.at)) hours.set(point.at, { at: new Date(point.at).toISOString(), buy: null, sell: null });
      hours.get(point.at)[point.side] = point;
    }
    return [...sources].sort(([a], [b]) => a.localeCompare(b)).map(([origin, hours]) => {
      const start = Math.max(Math.min(...hours.keys()), Math.max(...hours.keys()) - 8759 * HOUR), end = Math.max(...hours.keys()), rows = [];
      for (let at = start; at <= end; at += HOUR) {
        const raw = hours.get(at), buy = raw?.buy, sell = raw?.sell;
        const buyerCount = buy && !buy.conflict ? buy.n : null, sellerCount = sell && !sell.conflict ? sell.n : null;
        const sum = buyerCount !== null && sellerCount !== null ? buyerCount + sellerCount : null;
        rows.push({ at: new Date(at).toISOString(), buyerCount, sellerCount, appearances: count(sum) ? sum : null,
          complete: buyerCount !== null && sellerCount !== null && buy.complete && sell.complete,
          partial: !!(buy?.partial || sell?.partial), conflict: !!(buy?.conflict || sell?.conflict),
          buyerCapturedAt: buy?.captured === null || buy?.captured === undefined ? null : new Date(buy.captured).toISOString(),
          sellerCapturedAt: sell?.captured === null || sell?.captured === undefined ? null : new Date(sell.captured).toISOString() });
      }
      const pulls = [...hours.values()].flatMap(h => [h.buy?.captured, h.sell?.captured]).filter(v => v !== null && v !== undefined);
      return { sourceUrl: origin, start: rows[0]?.at, end: rows.at(-1)?.at, capturedAt: pulls.length ? new Date(Math.max(...pulls)).toISOString() : null,
        completePairs: rows.filter(r => r.complete).length, truncated: start > Math.min(...hours.keys()) || report.smega.length > 20000, rows };
    });
  }
  function scenario(appearances, participation, multiplicity) {
    if (!count(appearances) || !Number.isFinite(participation) || participation <= 0 || participation > 1 || !Number.isFinite(multiplicity) || multiplicity < 1 || multiplicity > 2) return null;
    const result = appearances / (participation * multiplicity);
    return Number.isFinite(result) ? result : null;
  }
  window.AstraSpeculation = Object.freeze({ activityModel, scenario });
  const options = document.getElementById('display-options'), content = document.getElementById('content'), nav = document.querySelector('.nav-wrap nav');
  if (!options || !content || !nav || document.getElementById('view-speculation')) return;
  const make = (tag, text, className) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (className) n.className = className; return n; };
  const key = 'astra-speculation-v1'; let enabled = false, report, profiles = [], pageNumber = 0;
  try { enabled = localStorage.getItem(key) === 'on'; } catch { /* Default off; tab control remains usable. */ }
  const control = make('div', undefined, 'hero-layout-options speculation-options'); control.dataset.previewControls = '';
  control.setAttribute('role', 'group'); control.setAttribute('aria-label', 'Speculation preview');
  const toggle = make('button'); toggle.type = 'button'; toggle.setAttribute('aria-controls', 'view-speculation speculation-nav');
  control.append(toggle, make('small', 'Optional assumption lab. Saved in this browser; no player or bot count is claimed.')); options.append(control);
  const link = make('a', 'Speculation', 'nav-link'); link.id = 'speculation-nav'; link.href = '#speculation'; nav.querySelector('.fallback-link')?.before(link); if (!link.isConnected) nav.append(link);
  const view = make('section', undefined, 'view speculation-page'); view.id = 'view-speculation'; view.hidden = true; view.setAttribute('aria-labelledby', 'speculation-title');
  const heading = make('h1', 'Speculation: what activity can tell us'); heading.id = 'speculation-title';
  view.append(make('p', 'ASSUMPTIONS / NOT A POPULATION ESTIMATE', 'eyebrow'), heading,
    make('p', 'Hourly offer activity is observable here. Total players, concurrent users and bot population are not identified by these market aggregates.', 'speculation-lead'));
  const evidence = make('p', undefined, 'speculation-evidence'); view.append(evidence);
  const selectRow = make('div', undefined, 'speculation-selectors'), sourceLabel = make('label', 'Source '), sourceSelect = make('select'); sourceSelect.id = 'speculation-source'; sourceLabel.append(sourceSelect);
  const periodLabel = make('label', 'Source-hour window '), period = make('select'); period.id = 'speculation-period';
  for (const [value, label] of [['24', 'Last 24 source hours'], ['48', 'Last 48 source hours'], ['all', 'All retained hours']]) { const option = make('option', label); option.value = value; period.append(option); }
  periodLabel.append(period); selectRow.append(sourceLabel, periodLabel); view.append(selectRow);
  const coverage = make('p', undefined, 'speculation-coverage'); view.append(coverage);
  const lab = make('section', undefined, 'speculation-lab'); lab.append(make('h2', 'An assumption-driven account scenario'));
  lab.append(make('p', 'A = buyer-poster count + seller-poster count for one complete source hour. P = A / (p × m), where p is assumed observed offer participation (including source coverage), and m is assumed poster-side appearances per offering account. Neither parameter is calibrated.'));
  const inputs = make('div', undefined, 'speculation-inputs');
  const participationLabel = make('label', 'Assumed observed participation (%) '), participation = make('input'); participation.type = 'number'; participation.id = 'speculation-participation'; participation.min = '.000001'; participation.max = '100'; participation.step = 'any'; participation.placeholder = 'Required assumption'; participationLabel.append(participation);
  const repeatLabel = make('label', 'Assumed side appearances / account (1–2) '), repeat = make('input'); repeat.type = 'number'; repeat.id = 'speculation-multiplicity'; repeat.min = '1'; repeat.max = '2'; repeat.step = 'any'; repeat.placeholder = 'Required assumption'; repeatLabel.append(repeat);
  inputs.append(participationLabel, repeatLabel); lab.append(inputs);
  const result = make('p', undefined, 'speculation-result'); result.setAttribute('role', 'status'); lab.append(result);
  lab.append(make('p', 'This assumes each source poster corresponds to an account within its hour, and uses only paired, complete buckets. Buyer/seller overlap, repeated posters across hours, alternative accounts and incomplete source coverage remain unknown. Accounts are not unique people. The result is arithmetic sensitivity, not measured CCU, a fitted population estimate or a confidence interval.'));
  view.append(lab);
  const tableRoot = make('div', undefined, 'table-wrap speculation-table'); view.append(tableRoot);
  const pager = make('div', undefined, 'speculation-pagination'), previous = make('button', 'Previous 24'), pageState = make('span'), next = make('button', 'Next 24'); previous.type = next.type = 'button'; pager.append(previous, pageState, next); view.append(pager);
  const policy = make('section', undefined, 'speculation-policy'); policy.append(make('h2', 'A participation change is not a player count'));
  policy.append(make('p', 'Nexon’s November 4, 2026 Classic World maintenance notice adds megaphone restrictions during the 96-hour period after a first NX purchase, alongside bot-detection changes. That can change who is able to post, even if the active population is unchanged. Treating a change in offer counts as a measured loss of players or bots would confound participation and population.'));
  const primary = make('a', 'Official Classic World maintenance notice ↗'); primary.href = 'https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/1848557880480504'; primary.target = '_blank'; primary.rel = 'noopener noreferrer'; policy.append(primary);
  policy.append(make('p', 'No numeric Classic World CCU series or independently verified active-bot denominator was identified in the reviewed primary sources (research: November 5, 2026). Ban totals count sanctioned accounts over a stated period, not the stock of active bots or unique humans. Sanction categories, repeat accounts, detection delays and reversals matter. High prices, large volumes or bulk trading alone do not identify a bot. Modern GMS or MapleStory Worlds totals must not be substituted for Classic World.'));
  view.append(policy); content.append(view);
  const number = (n, decimals = 0) => Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: decimals }) : '—';
  function selectedRows() { const profile = profiles.find(p => p.sourceUrl === sourceSelect.value); return { profile, rows: profile ? period.value === 'all' ? profile.rows : profile.rows.slice(-Number(period.value)) : [] }; }
  function parameters() { return { p: participation.value.trim() && participation.validity.valid ? Number(participation.value) / 100 : NaN, m: repeat.value.trim() && repeat.validity.valid ? Number(repeat.value) : NaN }; }
  function draw() {
    const { profile, rows } = selectedRows(), { p, m } = parameters(), complete = rows.filter(r => r.complete && r.appearances !== null), latest = complete.at(-1);
    const value = latest ? scenario(latest.appearances, p, m) : null;
    evidence.textContent = `Daily scanner: ${number(report?.allRecentQuantity)} recorded source volume during ${report?.recentStart || '?'} through the day before ${report?.recentEndExclusive || '?'}. This is neither a transaction count nor an hourly series. Qualified intraday aggregate observations: ${number(report?.intraday?.length || 0)}; no individual trade records are supplied to this lab.`;
    coverage.textContent = profile ? `${rows[0]?.at}–${rows.at(-1)?.at} · ${complete.length} / ${rows.length} paired complete hours · last retained pull ${profile.capturedAt || 'unknown'}. Source-hour clocks are UTC; missing sides/buckets are not zero. Counts can repeat across sides and hours.${profile.truncated ? ' Input exceeds the safety bound; this view is incomplete outside retained limits.' : ''}` : 'No valid source-published hourly poster counts are available.';
    result.textContent = value === null ? 'Enter both assumptions to calculate a scenario. Partial, missing or conflicting hours receive no population scenario.' : `${number(value)} active accounts under these assumptions for ${latest.at}: ${latest.appearances} poster-side appearances ÷ (${number(p * 100, 6)}% × ${m}). Halving assumed participation doubles the result; doubling it halves the result (within valid parameter bounds). This is not a measured player count or interval.`;
    tableRoot.replaceChildren(); const table = make('table'), caption = make('caption', 'Hourly offer observations and conditional arithmetic · UTC'); table.append(caption);
    const head = make('thead'), hr = make('tr'); for (const text of ['Source hour · UTC', 'Seller posters', 'Buyer posters', 'Side appearances', 'Coverage', 'Assumption result · accounts']) { const th = make('th', text); th.scope = 'col'; hr.append(th); } head.append(hr); table.append(head);
    const body = make('tbody'), pages = Math.max(1, Math.ceil(rows.length / 24)); pageNumber = Math.min(pageNumber, pages - 1);
    for (const row of [...rows].reverse().slice(pageNumber * 24, (pageNumber + 1) * 24)) {
      const tr = make('tr'), hypothetical = row.complete ? scenario(row.appearances, p, m) : null;
      const state = row.conflict ? 'Conflicting counts omitted' : row.partial ? 'Partial source hour' : row.complete ? 'Paired complete hour' : 'Missing side or completion unknown';
      for (const text of [row.at.replace('T', ' ').replace('.000Z', ' UTC'), number(row.sellerCount), number(row.buyerCount), number(row.appearances), state, number(hypothetical)]) tr.append(make('td', text));
      tr.children[1].title = 'Seller point pulled ' + (row.sellerCapturedAt || 'at an unknown time'); tr.children[2].title = 'Buyer point pulled ' + (row.buyerCapturedAt || 'at an unknown time'); body.append(tr);
    }
    if (!rows.length) { const tr = make('tr'), td = make('td', 'No hourly observations; no values imputed.'); td.colSpan = 6; tr.append(td); body.append(tr); }
    table.append(body); tableRoot.append(table); previous.disabled = pageNumber === 0; next.disabled = pageNumber + 1 >= pages; pageState.textContent = `${pageNumber + 1} / ${pages}`;
  }
  function publish(data) { report = data; const prior = sourceSelect.value; profiles = activityModel(data); sourceSelect.replaceChildren(); for (const profile of profiles) { const option = make('option', profile.sourceUrl); option.value = profile.sourceUrl; sourceSelect.append(option); } if (profiles.some(p => p.sourceUrl === prior)) sourceSelect.value = prior; draw(); }
  function choice() { link.hidden = !enabled; toggle.textContent = 'Speculation tab: ' + (enabled ? 'On' : 'Off'); toggle.setAttribute('aria-pressed', String(enabled)); if (!enabled) { view.hidden = true; if (location.hash === '#speculation') location.hash = '#index'; } }
  toggle.addEventListener('click', () => { enabled = !enabled; try { localStorage.setItem(key, enabled ? 'on' : 'off'); } catch {} choice(); });
  for (const select of [sourceSelect, period]) select.addEventListener('change', () => { pageNumber = 0; draw(); });
  for (const input of [participation, repeat]) input.addEventListener('input', draw);
  previous.addEventListener('click', () => { pageNumber = Math.max(0, pageNumber - 1); draw(); }); next.addEventListener('click', () => { ++pageNumber; draw(); });
  document.addEventListener('astramarketsnapshot', event => { if (event.detail && typeof event.detail === 'object') publish(event.detail); });
  window.addEventListener('hashchange', () => { if (!enabled && location.hash === '#speculation') { view.hidden = true; location.hash = '#index'; } });
  choice(); draw(); document.dispatchEvent(new Event('astramarkethighlightsready'));
})();

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "speculation.js", status: "initialization_failed"}})); } catch {}
}

;
/* Astra source: popular-fashion.js */
try {
(() => {
  'use strict';
  if (window.AstraPopularFashion) return;
  // Exact names from captured official Classic World fashion reward tables.
  // These receipts establish classification, never current availability or a market price.
  const evidence = {"kind":"official_classic_world_fashion_classification","editions":[{"id":"mystery-fashion-2026-11-04","title":"Mystery Fashion Crate \u00b7 Nov 4 rotation","url":"https://www.nexon.com/maplestory/general-post/46331","capturedAt":"2026-11-05T13:19:55.597466+00:00","sha256":"f965e9e5385bc7a2f8a42324e71aa25758b6dd5d43a824b97e58e1a0c1603a19","names":["Woodsman Hat","Bomber Jacket","Patched Denim Jeans","Green Sports Goggles","Pelvis Hoodie","Red Hooded Coat","Bunny-Padded Snowboard Pants","Pillow","Grey Visor Beanie","Black Fur Wrap Coat","Blue Kitty Hood","Mix-n-Match Sneakers","Starry Sky Blue Beanie","Big Rabbit Feet","White Rabbit's Foot","Olive Beanie","Bandage Strip","Pink Knitted Gumball","Pink Snowboard Top","Pink Snowboard Pants","Pink Galoshes","Bunny Hat","Bunny Slippers","Pink Rabbit Puppet","Bunny Costume","Old School Uniform Hat","Old School Blazer","Old School Uniform Top","Old School Uniform Pants","Old School Uniform Skirt","White High Top","Medical Eye Patch","My Buddy Rex","Blue Snow Flower Wear","Superstar Headphones","Kitty Hoodie","Pink Down Parka","Amorian Pink Skirt","Ice Cold Red","Teddy Bear Headgear","Teddy Bear Costume","Teddy Bear Shoes","Teddy Bear","Teddy Bear Gloves","Cuddle Bear","Teddy Bear Chat Ring","Blue Pajama Hat","Blue Polka-Dot Pajama Top","Blue Polka-Dot Pajama Pants","Blue Marble Slippers"]},{"id":"halloween-2026-10-28","title":"Halloween Mystery Fashion Crate \u00b7 Oct 28 rotation","url":"https://www.nexon.com/maplestory/general-post/46524","capturedAt":"2026-11-05T13:19:55.925107+00:00","sha256":"16d4689fa00b005ccee9f89e3e591fd9251dd3abe3f865fcc72685e22bf12c30","names":["Tiger Mask","Prisoner Top","Prisoner Pants","Brown Bandage","Scream Mask","Skull T-Shirt","Bone Buckled Slacks","Skull Beanie","Dark Suit","Dark Enamel Suit","Black Leather Boots","Black Bandage","Skull Patch","Grey Skull Overall","Red Skull Overall","Skull Gloves","Black Coat of Death","Ghost Suit","Black Shoes of Death","Hat of Death","Ragged Gomushin","Witch Hat","Ghost Costume","Witch Clothes","Witch's Broomstick","Gargoyle Wings","Battle Scar","Mummy Hat","Mummy Suit","Mummy Mask","White Bandage","Devil Wings","Blue Chinese Undead Hat","Blue Chinese Undead Costume","Maple-Stein Head","Maple-Stein Face","Demon Goblin","Pumpkin Hat","Pumpkin Headgear","Pumpkin Suit","Glowing Pumpkin Basket","Evil Skull","Cat Soul","Devilish Horns","Devil Horns","Dark Devil Hat","Coffin of Gloom","Count Dracula Cape","Iljimae Mask","Stealth Suit"]},{"id":"founders-2026-10-06","title":"Founder's Mystery Fashion Crate \u00b7 Founder\u2019s Access","url":"https://www.nexon.com/maplestory/general-post/45538","capturedAt":"2026-11-05T13:20:19.247557+00:00","sha256":"6c88e7ce3c274146bb3a5dce350142c445d5e224fd1fe3d11df24097035d5e36","names":["Angel Halo","Toga","Baby Angel Wings","Angel Wand","Cherub's Bow","Blue Cap","Orange Baseball Jacket","Rainbow Knit","Ripped Jeans","Orange Toy Hammer","Blue Bucket Hat","Tourist T","White Jeans","Black Sunglasses","Cat Hat","Cat Suit","Gold Kitty Slippers","Kitty Chat Ring","Meshcap","Pink Allstar","Jean Shorts","Beret","Red Sailor Shirt","Red Sailor Skirt","Black Enamel Shoes","Patissier Hat","Patissier Uniform","Yellow Spatula","Bunny Ears","Bunny Earmuffs","Orange Mushroom Balloon","Blue Watch","Red Trainer Jacket","Red Trainer Pants","Yellow Rainbow Sneaks","Dollish Pink","Purple Dorothy Dress","Sailor Hat","Sailor Outfit","White Ribboned Sailor Dress","Slime T-Shirt","Slime Slippers","Slime Earrings","Reggae Hat","Orange Hooded Shirt","White Hooded Vest","Butterfly Skirt","Beetle Long Sleeve","Lined Hip-Hop Pants","White Label Ring"]},{"id":"aurora-season-1-2026","title":"Aurora Mystery Fashion Crate \u00b7 Season 1","url":"https://www.nexon.com/maplestory/general-post/45659","capturedAt":"2026-11-05T13:20:19.595096+00:00","sha256":"2da85bc74092abda3f075bb94aa001596ecc2e4a7c21d8658aef481f084861ee","names":["White Choco Bunny","Splash Choco Boy","Splash Choco Girl","Cacao Bear Shoes","Chocolate Ribbon","Soft Chocolate Fondue Scepter","Choco Candy Cookie","Black Cat Beanie","Sky Blue Cat Beanie","Orange Cat Beanie","Heart Sunglasses","Red Check Rider","Violet Dot Jeans","Pink Bunny Sweater","Hearts Tights","Pink Elephant Slippers","Loose Fit Sweater","Stocking Shorts","Detective Glass","Blank Eye Patch","Heartbreaker Lips","Starlight Heart Scepter","Ink-and-Wash Thought Bubble Ring","Ink-and-Wash Painting Name Tag Ring","Chocolate Label Ring","Chocolate Chat Ring"]}]};
  const names = new Map();
  for (const edition of evidence.editions) for (const name of edition.names) {
    const key = name.toLocaleLowerCase('en-US');
    if (!names.has(key)) names.set(key, []);
    names.get(key).push(edition);
  }
  const day = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
  const slug = value => typeof value === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(value);
  const shift = (date, offset) => new Date(Date.parse(date + 'T00:00:00Z') + offset * 86400000).toISOString().slice(0, 10);
  const finitePositive = value => Number.isFinite(value) && value > 0;
  function calculate(data) {
    const catalog = data?.cashCatalog, publication = catalog?.sourceUpdatedAt || data?.sourceUpdatedAt;
    const sourceDay = typeof publication === 'string' ? publication.slice(0, 10) : null;
    if (catalog?.schemaVersion !== 1 || catalog.kind !== 'cash_shop_source_catalog' || !day(sourceDay) || !Array.isArray(catalog.rows)) return null;
    const startDay = shift(sourceDay, -7), endDay = shift(sourceDay, -1), sourceRows = catalog.rows.filter(row => row && slug(row.slug) && typeof row.name === 'string');
    const nameCounts = new Map(), slugCounts = new Map();
    for (const row of sourceRows) { const key = row.name.toLocaleLowerCase('en-US'); nameCounts.set(key, (nameCounts.get(key) || 0) + 1); slugCounts.set(row.slug, (slugCounts.get(row.slug) || 0) + 1); }
    const rows = []; let ambiguousItems = 0, mismatchedSourceItems = 0;
    for (const row of sourceRows) {
      const key = row.name.toLocaleLowerCase('en-US'), editions = names.get(key);
      if (!editions) continue;
      if (nameCounts.get(key) !== 1 || slugCounts.get(row.slug) !== 1) { ambiguousItems++; continue; }
      if (row.sourceUpdatedAt && row.sourceUpdatedAt !== publication) { mismatchedSourceItems++; continue; }
      const days = new Map(), conflicts = new Set();
      for (const point of Array.isArray(row.history) ? row.history : []) {
        if (!Array.isArray(point) || !day(point[0]) || point[0] < startDay || point[0] >= sourceDay || !Number.isSafeInteger(point[2]) || point[2] < 0) continue;
        const value = { quantity: point[2], median: finitePositive(point[1]) ? point[1] : null }, previous = days.get(point[0]);
        if (previous && (previous.quantity !== value.quantity || previous.median !== value.median)) conflicts.add(point[0]);
        else days.set(point[0], value);
      }
      for (const date of conflicts) days.delete(date);
      let quantity = 0, turnover = 0, pricedQuantity = 0, pricedDays = 0;
      for (const value of days.values()) {
        quantity += value.quantity;
        if (value.quantity === 0 || value.median !== null && Number.isFinite(value.median * value.quantity)) { turnover += (value.median || 0) * value.quantity; pricedQuantity += value.quantity; pricedDays++; }
      }
      const safeQuantity = days.size && Number.isSafeInteger(quantity) ? quantity : null;
      rows.push({ slug: row.slug, name: row.name, quantity: safeQuantity, turnoverProxy: safeQuantity !== null && pricedQuantity === quantity && Number.isFinite(turnover) ? turnover : null,
        observedDays: days.size, pricedDays, pricedQuantity, conflicts: conflicts.size, firstDay: [...days.keys()].sort()[0] || null, lastDay: [...days.keys()].sort().at(-1) || null,
        classificationEditions: editions.map(edition => edition.title), unit: 'source-recorded count / units; item-specific conventions may differ' });
    }
    return { sourceDay, publication, startDay, endDay, days: 7, providerItems: sourceRows.length, classifiedItems: rows.length, withActivity: rows.filter(row => row.quantity !== null).length, ambiguousItems, mismatchedSourceItems, rows };
  }
  window.AstraPopularFashion = Object.freeze({ calculate });
  const make = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
  const number = value => Number.isFinite(value) ? value.toLocaleString('en-US', { maximumFractionDigits: 0 }) : 'Unavailable';
  const preference = 'astra-popular-fashion-v1';
  let enabled = true, report = null, sortKey = 'quantity', ascending = false, showAll = false, section, body, tableHost, scope, toggle, expand;
  try { const stored = localStorage.getItem(preference); if (stored === 'on' || stored === 'off') enabled = stored === 'on'; } catch { /* The default remains usable when storage is blocked. */ }
  function draw() {
    if (!section) return;
    body.hidden = !enabled; toggle.setAttribute('aria-pressed', String(enabled)); toggle.textContent = enabled ? 'Fashion activity: On' : 'Fashion activity: Off';
    section.dataset.enabled = String(enabled); tableHost.replaceChildren();
    const result = calculate(report);
    if (!result) { scope.textContent = 'No dated cash-catalog history is connected. No fashion popularity is inferred from client metadata.'; expand.hidden = true; return; }
    scope.textContent = `Seven complete source-calendar days: ${result.startDay}–${result.endDay}. Current source day ${result.sourceDay} is excluded. ${result.classifiedItems} exact-name fashion matches / ${result.providerItems} cash market records; ${result.withActivity} have retained counts in this window. Source publication: ${result.publication}.`;
    const rows = [...result.rows].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (av === null) return bv === null ? a.slug.localeCompare(b.slug) : 1;
      if (bv === null) return -1;
      return (typeof av === 'number' ? av - bv : av.localeCompare(bv)) * (ascending ? 1 : -1) || a.slug.localeCompare(b.slug);
    });
    if (!rows.length) { tableHost.append(make('p', 'notice', 'No unambiguous official fashion-name matches are available in this cash collection. Other cash items are not assumed to be fashion.')); expand.hidden = true; return; }
    const table = make('table'); table.setAttribute('aria-label', 'Fashion activity by retained daily source counts'); table.dataset.searchReady = 'true';
    const caption = make('caption', '', `${showAll ? 'All' : 'Top 10'} covered fashion items · ordered by ${sortKey === 'quantity' ? 'recorded quantity' : sortKey === 'turnoverProxy' ? 'estimated meso turnover proxy' : sortKey === 'observedDays' ? 'retained day coverage' : 'item name'} ${ascending ? 'ascending' : 'descending'}`); table.append(caption);
    const head = table.createTHead().insertRow();
    for (const [key, label] of [['name', 'Fashion item'], ['quantity', 'Recorded quantity'], ['turnoverProxy', 'Meso turnover proxy'], ['observedDays', 'Retained days / 7']]) {
      const cell = make('th'); cell.scope = 'col'; cell.setAttribute('aria-sort', key === sortKey ? ascending ? 'ascending' : 'descending' : 'none');
      const button = make('button', '', label + (key === sortKey ? ascending ? ' ↑' : ' ↓' : '')); button.type = 'button'; button.dataset.fashionSort = key; cell.append(button); head.append(cell);
    }
    const tbody = table.createTBody();
    for (const row of showAll ? rows : rows.slice(0, 10)) {
      const tr = tbody.insertRow(); tr.dataset.fashionSlug = row.slug;
      const cell = tr.insertCell(), action = make('button', 'popular-fashion-item', row.name); action.type = 'button'; action.dataset.fashionItem = row.slug; action.title = 'Open retained cash-catalog evidence';
      const spritePath = report?.spriteMap?.[row.slug];
      if (typeof spritePath === 'string' && /^assets\/[a-zA-Z0-9._-]+\.(png|svg|webp|gif)$/.test(spritePath)) { const image = make('img'); image.src = spritePath; image.alt = ''; image.width = image.height = 28; image.loading = 'lazy'; image.addEventListener('error', () => { image.hidden = true; }, { once: true }); action.prepend(image); }
      cell.append(action); tr.insertCell().textContent = number(row.quantity); tr.insertCell().textContent = number(row.turnoverProxy); const coverage = tr.insertCell();
      coverage.textContent = `${row.observedDays} / 7${row.conflicts ? ' · conflicting days omitted' : ''}`; coverage.title = `${row.firstDay || 'No retained count day'}${row.lastDay ? '–' + row.lastDay : ''}; ${row.pricedDays} retained days support the turnover proxy. Missing days are not zero.`;
    }
    tableHost.append(table); expand.hidden = rows.length <= 10; expand.setAttribute('aria-expanded', String(showAll)); expand.textContent = showAll ? 'Show top 10' : `Show all ${rows.length} covered fashion items`;
  }
  function mount() {
    const host = document.getElementById('view-highlights');
    if (!host || document.getElementById('popular-fashion')) return false;
    section = make('section', 'popular-fashion'); section.id = 'popular-fashion'; section.setAttribute('aria-labelledby', 'popular-fashion-title');
    body = make('div', 'popular-fashion-body'); body.id = 'popular-fashion-content';
    const title = make('h2', '', 'Fashion activity in this collection'); title.id = 'popular-fashion-title';
    scope = make('p', 'popular-fashion-scope'); tableHost = make('div', 'table-wrap popular-fashion-table'); expand = make('button', 'popular-fashion-expand'); expand.type = 'button'; expand.setAttribute('aria-controls', 'popular-fashion-content');
    const note = make('p', 'popular-fashion-note', 'Popularity here means recorded source count, not unique buyers, verified transactions, current availability or all server fashion activity. Counts use all retained daily buckets, including low-count days; missing days remain missing. Turnover is Σ(daily median × recorded count), an estimate rather than exact traded mesos. Item-specific quantity conventions can differ. Separate rolling scanner windows and metadata-only items are not added to these counts.');
    const sources = make('details', 'popular-fashion-provenance'), summary = make('summary', '', 'How fashion classification is bounded'); sources.append(summary, make('p', '', 'Only exact, case-insensitive, unambiguous item-name matches to these official Classic World fashion reward tables are included. No fuzzy aliases, assumed crate contents or cash-category-wide classification. This is classification evidence, not proof of a canonical ID, release date or current availability.'));
    for (const edition of evidence.editions) { const p = make('p'), link = make('a', '', edition.title + ' ↗'); link.href = edition.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; p.append(link, document.createTextNode(` · ${edition.names.length} named rewards · receipt ${edition.capturedAt} · SHA-256 ${edition.sha256}`)); sources.append(p); }
    const more = make('a', '', 'Browse all cash-source evidence →'); more.href = '#cash-catalog'; body.append(title, scope, tableHost, expand, note, more, sources);
    const controls = make('div', 'popular-fashion-controls'); controls.dataset.previewControls = 'popular-fashion'; controls.setAttribute('role', 'group'); controls.setAttribute('aria-label', 'Fashion activity visibility'); toggle = make('button'); toggle.type = 'button'; toggle.setAttribute('aria-controls', body.id); controls.append(toggle, make('small', '', 'Display choice only; indices and source collection are unchanged.')); section.append(body, controls);
    const before = host.querySelector('.highlights-activity'); if (before) before.before(section); else host.append(section);
    toggle.addEventListener('click', () => { enabled = !enabled; try { localStorage.setItem(preference, enabled ? 'on' : 'off'); } catch { /* Continue without persistence. */ } draw(); });
    expand.addEventListener('click', () => { showAll = !showAll; draw(); });
    tableHost.addEventListener('click', event => {
      const sort = event.target.closest('[data-fashion-sort]'); if (sort) { const key = sort.dataset.fashionSort; if (!['name', 'quantity', 'turnoverProxy', 'observedDays'].includes(key)) return; ascending = key === sortKey ? !ascending : key === 'name'; sortKey = key; draw(); tableHost.querySelector(`[data-fashion-sort="${key}"]`)?.focus(); return; }
      const item = event.target.closest('[data-fashion-item]'); if (!item) return; const row = report?.cashCatalog?.rows?.find(row => row.slug === item.dataset.fashionItem); if (!row) return;
      window.location.hash = '#cash-catalog'; window.dispatchEvent(new Event('hashchange')); document.dispatchEvent(new CustomEvent('astracashcataloglookup', { detail: { key: row.slug, query: row.name } }));
    });
    draw(); document.dispatchEvent(new Event('astramarkethighlightsready')); return true;
  }
  document.addEventListener('astramarketsnapshot', event => { report = event.detail; draw(); });
  if (!mount() && !document.getElementById('popular-fashion')) { const observer = new MutationObserver(() => { if (mount()) observer.disconnect(); }); observer.observe(document.body, { childList: true, subtree: true }); }
})();

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "popular-fashion.js", status: "initialization_failed"}})); } catch {}
}

;
/* Astra source: volatility-preview.js */
try {
(() => {
  'use strict';
  if (window.AstraVolatilityPreview) return;
  const DAY = 86400000, positive = v => typeof v === 'number' && Number.isFinite(v) && v > 0;
  const validDay = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v + 'T00:00:00Z')) && new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v;
  const shift = (day, n) => new Date(Date.parse(day + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10);
  function sourceWindow(report) {
    const published = String(report?.sourceUpdatedAt || '').slice(0, 10);
    if (!validDay(published)) return null;
    let end = validDay(report.lastCompleteDay) && report.lastCompleteDay <= published ? report.lastCompleteDay : report.latest?.partial === false ? published : shift(published, -1);
    if (report.latest?.partial !== false && end === published) end = shift(published, -1);
    return { start: shift(end, -6), end, days: 7, possibleReturns: 6 };
  }
  function dailyVolatility(history, window) {
    if (!window) return { value: null, returns: 0, days: 0 };
    const prices = new Map(), conflicts = new Set();
    for (const point of Array.isArray(history) ? history : []) {
      if (!Array.isArray(point) || !validDay(point[0]) || point[0] < window.start || point[0] > window.end || !positive(point[1]) || !Number.isFinite(point[2]) || point[2] < 5) continue;
      const prior = prices.get(point[0]); if (prior && (prior.price !== point[1] || prior.count !== point[2])) conflicts.add(point[0]);
      else prices.set(point[0], { price: point[1], count: point[2] });
    }
    for (const day of conflicts) prices.delete(day);
    let n = 0, mean = 0, squares = 0;
    for (let day = shift(window.start, 1); day <= window.end; day = shift(day, 1)) {
      const before = prices.get(shift(day, -1)), after = prices.get(day); if (!before || !after) continue;
      const change = Math.log(after.price) - Math.log(before.price); if (!Number.isFinite(change)) continue;
      ++n; const delta = change - mean; mean += delta / n; squares += delta * (change - mean);
    }
    const sigma = n >= 5 ? Math.sqrt(Math.max(0, squares / (n - 1))) * 100 : null;
    return { value: Number.isFinite(sigma) ? sigma : null, returns: n, days: prices.size, start: window.start, end: window.end };
  }
  function rankCohort(rows, bySlug) {
    const unique = new Set((rows || []).filter(row => row && /^[a-z0-9][a-z0-9-]*$/.test(row.slug)).map(row => row.slug));
    const sorted = [...unique].map(slug => bySlug.get(slug)).filter(row => row && Number.isFinite(row.value) && row.value >= 0).sort((a, b) => b.value - a.value || a.slug.localeCompare(b.slug));
    const values = new Map(); let rank = 0, prior;
    sorted.forEach((row, index) => { if (index === 0 || row.value !== prior) rank = index + 1; prior = row.value; values.set(row.slug, { ...row, rank }); });
    return { values, eligible: sorted.length, total: unique.size };
  }
  function model(report) {
    const window = sourceWindow(report); if (!window) return null;
    const cash = new Map(), goods = new Map();
    const accept = (map, row) => {
      if (!row || !/^[a-z0-9][a-z0-9-]*$/.test(row.slug) || typeof row.name !== 'string' || !row.name.trim()) return;
      const old = map.get(row.slug); if (!old || !old.history?.length && row.history?.length) map.set(row.slug, row);
    };
    for (const row of report.cashCatalog?.rows || []) if (row.category === 'Cash Shop') accept(cash, row);
    for (const row of [...(report.cash || []), ...(report.cashBasket?.rows || [])]) accept(cash, row);
    for (const row of [...(report.rows || []), ...(report.contextItems || [])]) if (row.category !== 'Cash Shop') accept(goods, row);
    const describe = row => ({ slug: row.slug, name: row.name, category: row.category, ...dailyVolatility(row.history, window) });
    const cashItems = [...cash.values()].map(describe), goodsItems = [...goods.values()].map(describe), bySlug = new Map([...cashItems, ...goodsItems].map(row => [row.slug, row]));
    const categories = (report.categories || []).map(category => {
      const members = (report.rows || []).filter(row => row.category === category.name), qualified = members.map(row => bySlug.get(row.slug)).filter(row => row?.value !== null && row?.value !== undefined).sort((a, b) => a.value - b.value);
      const middle = Math.floor(qualified.length / 2), value = qualified.length ? qualified.length % 2 ? qualified[middle].value : (qualified[middle - 1].value + qualified[middle].value) / 2 : null;
      return { name: category.name, value, eligible: qualified.length, total: members.length, kind: 'median_member_volatility' };
    });
    const winner = items => [...items].filter(row => row.value !== null).sort((a, b) => b.value - a.value || a.slug.localeCompare(b.slug))[0] || null;
    let nxRows = report.cash || []; try { if (typeof windowThis.buildCashPricing === 'function') nxRows = windowThis.buildCashPricing(report).rows; } catch { /* Retained cash rows still define a bounded fallback cohort. */ }
    return { window, cashItems, goodsItems, bySlug, categories, cohorts: { goods: rankCohort(report.rows, bySlug), nx: rankCohort(nxRows, bySlug), catalog: rankCohort(report.cashCatalog?.rows, bySlug) }, cashWinner: winner(cashItems), goodsWinner: winner(goodsItems), sourceUpdatedAt: report.sourceUpdatedAt };
  }
  const windowThis = window;
  window.AstraVolatilityPreview = Object.freeze({ sourceWindow, dailyVolatility, model, rankCohort });
  const options = document.getElementById('display-options'); if (!options) return;
  const make = (tag, text, className) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; };
  const key = 'astra-volatility-preview-v1', categoryKey = 'astra-category-member-volatility-v1', cashKey = 'astra-cash-volatility-badges-v1', tableKey = 'astra-volatility-tables-v1'; let enabled = true, categoryEnabled = false, cashEnabled = false, tablesEnabled = true, report, current, scheduled = false, lastCatalogKey;
  try { enabled = localStorage.getItem(key) !== 'off'; } catch { /* The display remains usable in this tab. */ }
  try { categoryEnabled = localStorage.getItem(categoryKey) === 'on'; } catch { /* Category member badges default off. */ }
  try { cashEnabled = localStorage.getItem(cashKey) === 'on'; } catch { /* Item-card badges default off. */ }
  try { tablesEnabled = localStorage.getItem(tableKey) !== 'off'; } catch { /* Table columns default on. */ }
  const controls = make('div', undefined, 'hero-layout-options volatility-preview-options'); controls.dataset.previewControls = ''; controls.setAttribute('role', 'group'); controls.setAttribute('aria-label', 'Daily price volatility preview');
  const toggle = make('button'), categoryToggle = make('button'), cashToggle = make('button'), tableToggle = make('button'); toggle.type = categoryToggle.type = cashToggle.type = tableToggle.type = 'button'; categoryToggle.dataset.categoryVolatility = ''; categoryToggle.setAttribute('aria-controls', 'category-cards');cashToggle.dataset.cashVolatility = '';cashToggle.setAttribute('aria-controls','cash-item-highlights');tableToggle.dataset.tableVolatility = '';tableToggle.setAttribute('aria-controls','basket-table cash-table view-cash-catalog');
  controls.append(toggle, categoryToggle, cashToggle, tableToggle, make('small', 'Independent display choices. 7-day window; daily medians, not individual trades. Category labels summarize member volatilities, not category-index volatility.')); options.append(controls);
  const scopes = '#category-cards,#cash-item-highlights,#market-highlights-track,#highlights-fact-grid,#basket-table,#cash-table';
  const observer = new MutationObserver(records => {
    if (!current || scheduled || !(enabled || categoryEnabled || cashEnabled || tablesEnabled)) return;
    const relevant = records.some(record => { const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
      return target?.closest(scopes) || [...record.addedNodes].some(node => node.nodeType === 1 && (node.matches(scopes) || node.querySelector(scopes))); });
    if (relevant) { scheduled = true; queueMicrotask(() => { scheduled = false; decorate(); }); }
  });
  const watch = () => observer.observe(document.body, { childList: true, subtree: true });
  const owned = node => { node.dataset.volatilityOwned = ''; return node; };
  const failedMegaphoneSprites = new Map();
  const percent = value => value === null || value === undefined ? 'Unavailable' : value.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
  const tableStates = new Map(), tableBases = new WeakMap();
  const tableRows = (table, kind) => [...(table.tBodies[0]?.rows || [])].filter(row => kind === 'nx' ? row.dataset.cashItem : row.cells[0]?.querySelector('[data-item]'));
  const tableSlug = (row, kind) => kind === 'nx' ? row.dataset.cashItem : row.cells[0]?.querySelector('[data-item]')?.dataset.item;
  function tableTitle(cohort, kind) {
    return `${current.window.start}–${current.window.end}: sample SD of consecutive qualified daily-median log returns × 100; minimum five of six returns, no missing-day bridge or annualization. Rank 1 is highest volatility, not best trading value. ${cohort.eligible} eligible / ${cohort.total} ${kind === 'goods' ? 'fixed goods-basket' : 'fixed-NX cash'} items before search/filter. Ranking uses unrounded values; exact ties share a competition rank.`;
  }
  function sortRows(table, kind, state) {
    const cohort = current.cohorts[kind], rows = tableRows(table, kind), key = state.key === 'rank' ? 'rank' : 'value';
    const ordered = rows.map((row, order) => ({ row, order, value: cohort.values.get(tableSlug(row, kind))?.[key] ?? null })).sort((a, b) => a.value === null ? b.value === null ? a.order - b.order : 1 : b.value === null ? -1 : (a.value - b.value) * (state.ascending ? 1 : -1) || a.order - b.order);
    if (ordered.some((entry, i) => entry.row !== rows[i])) table.tBodies[0].append(...ordered.map(entry => entry.row));
    for (const header of table.tHead.rows[0].cells) { const active = header.dataset.volatilityColumn === state.key; header.setAttribute('aria-sort', active ? state.ascending ? 'ascending' : 'descending' : 'none'); const button = header.querySelector('[data-volatility-sort]'); if (button) { const label = button.dataset.volatilitySort === 'value' ? '7-day daily price volatility' : 'Volatility rank', text = label + (active ? state.ascending ? ' ↑' : ' ↓' : ''); if (button.textContent !== text) button.textContent = text; } }
  }
  function decorateTables() {
    for (const [selector, kind] of [['#basket-table > table', 'goods'], ['#cash-table > table', 'nx']]) {
      const table = document.querySelector(selector); if (!table?.tHead?.rows[0] || !table.tBodies[0]) continue;
      table.dataset.volatilityTable = kind;
      if (!tablesEnabled || !current) {
        for (const node of table.querySelectorAll('[data-volatility-column]')) node.remove();
        for (const cell of table.querySelectorAll('[data-volatility-base-span]')) { cell.colSpan = Number(cell.dataset.volatilityBaseSpan); delete cell.dataset.volatilityBaseSpan; }
        const base = tableBases.get(table); if (tableStates.has(kind) && base && base.rows.every(row => row.parentElement === table.tBodies[0])) { table.tBodies[0].append(...base.rows); for (const [header, value] of base.headers) value === null ? header.removeAttribute('aria-sort') : header.setAttribute('aria-sort', value); }
        continue;
      }
      const cohort = current.cohorts[kind], title = tableTitle(cohort, kind), headers = table.tHead.rows[0];
      if (!tableBases.has(table) || !tableStates.has(kind)) tableBases.set(table, { rows: tableRows(table, kind), headers: [...headers.cells].filter(h => !h.dataset.volatilityColumn).map(h => [h, h.getAttribute('aria-sort')]) });
      for (const [key, label] of [['value', '7-day daily price volatility'], ['rank', 'Volatility rank']]) {
        let header = [...headers.cells].find(cell => cell.dataset.volatilityColumn === key);
        if (!header) { header = make('th', undefined, 'volatility-table-heading'); header.dataset.volatilityColumn = key; header.scope = 'col'; header.setAttribute('aria-sort', 'none'); const button = make('button', label); button.type = 'button'; button.dataset.volatilitySort = key; header.append(button); headers.append(header); }
        header.title = title;
        if (!tableStates.has(kind)) { header.setAttribute('aria-sort','none'); const button=header.querySelector('button'); if(button.textContent!==label)button.textContent=label; }
      }
      for (const row of table.tBodies[0].rows) if (row.cells.length === 1 && row.cells[0].colSpan > 1) { const cell = row.cells[0]; if (!cell.dataset.volatilityBaseSpan) cell.dataset.volatilityBaseSpan = String(cell.colSpan); cell.colSpan = Number(cell.dataset.volatilityBaseSpan) + 2; }
      for (const row of tableRows(table, kind)) {
        const point = cohort.values.get(tableSlug(row, kind));
        for (const key of ['value', 'rank']) {
          let cell = [...row.cells].find(td => td.dataset.volatilityColumn === key); if (!cell) { cell = make('td', undefined, 'volatility-table-cell'); cell.dataset.volatilityColumn = key; row.append(cell); }
          const text = point ? key === 'value' ? `${percent(point.value)} · ${point.returns}/6 returns` : `#${point.rank} of ${cohort.eligible} eligible / ${cohort.total} items` : 'Unavailable';
          if (cell.textContent !== text) cell.textContent = text; cell.dataset.sortValue = point ? String(point[key]) : ''; cell.title = title;
        }
      }
      if (tableStates.has(kind)) sortRows(table, kind, tableStates.get(kind));
    }
  }
  function syncCatalog(force = false) {
    const cohort = current?.cohorts.catalog, detail = tablesEnabled && current ? { enabled: true, start: current.window.start, end: current.window.end, eligible: cohort.eligible, total: cohort.total,
      rows: [...cohort.values.values()].map(row => ({ slug: row.slug, value: row.value, rank: row.rank, returns: row.returns })) } : { enabled: false };
    const fingerprint = JSON.stringify(detail); if (!force && fingerprint === lastCatalogKey) return; lastCatalogKey = fingerprint;
    document.dispatchEvent(new CustomEvent('astracashcatalogvolatility', { detail }));
  }
  function badge(card, text, detail) { const label = owned(make('p', text, 'volatility-preview-badge')); label.title = detail; card.append(label); }
  function graphic(item, kind) {
    const root = make('span', undefined, 'market-highlight-graphic'), image = make('img', undefined, 'market-highlight-sprite'); image.alt = ''; image.width = image.height = 42; image.loading = 'lazy';
    const mapped = report.spriteMap?.[item.slug], local = typeof mapped === 'string' && /^assets\/[A-Za-z0-9._-]+\.(?:png|webp|gif|svg)$/.test(mapped), megaphone = /megaphone/.test(item.slug);
    const generic = () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 32 32'); svg.setAttribute('width', '42'); svg.setAttribute('height', '42'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'Generic megaphone icon; verified game sprite unavailable'); svg.classList.add('market-highlight-sprite', 'volatility-generic-megaphone');
      const title = document.createElementNS(svg.namespaceURI, 'title'); title.textContent = 'Original generic megaphone symbol, not a verified MapleStory item sprite'; svg.append(title);
      for (const [d, fill] of [['M5 12h7l14-7v21l-14-7H5Z', '#d8bc74'], ['M11 19h6l-2 9h-5Z', '#9b7953'], ['M5 13h6v5H5Z', '#a8d6d2']]) { const path = document.createElementNS(svg.namespaceURI, 'path'); path.setAttribute('d', d); path.setAttribute('fill', fill); path.setAttribute('stroke', '#34443b'); path.setAttribute('stroke-width', '1.5'); svg.append(path); }
      return svg;
    };
    const fallback = megaphone && (!local || /meso-pouch/.test(mapped) || failedMegaphoneSprites.get(item.slug) === mapped);
    if (!fallback) image.src = local ? mapped : `assets/${item.slug}.svg`;
    image.addEventListener('error', () => { if (megaphone) { failedMegaphoneSprites.set(item.slug, mapped); image.replaceWith(generic()); } else if (image.getAttribute('src') === 'assets/meso-pouch.png') image.hidden = true; else image.src = 'assets/meso-pouch.png'; });
    const copy = make('span', undefined, 'market-highlight-copy'), title = make('span', undefined, 'market-highlight-title-line'), value = make('span', undefined, 'market-highlight-value-line');
    title.append(make('strong', kind === 'cash' ? 'Most volatile cash item' : 'Most volatile non-cash item', 'market-highlight-kind'), make('span', item.name, 'market-highlight-headline'));
    value.append(make('strong', `${percent(item.value)} daily price volatility`, 'market-highlight-value'));
    copy.append(title, value, make('small', `${current.window.start}–${current.window.end} · ${item.returns} consecutive daily returns · medians, not individual trades`, 'market-highlight-dates'));
    if (fallback) copy.append(make('small', 'Generic megaphone icon', 'volatility-icon-note'));
    root.append(fallback ? generic() : image, copy); return root;
  }
  function highlight(item, kind, duplicate, panel) {
    const card = owned(make(panel ? 'article' : 'li', undefined, panel ? 'panel highlights-fact volatility-preview-highlight' : 'market-highlight volatility-preview-highlight'));
    card.dataset.highlightType = 'volatility-' + kind;
    const link = make(duplicate ? 'span' : 'a');
    if (!duplicate) { const known = [...(report.rows || []), ...(report.cash || []), ...(report.contextItems || [])].some(row => row.slug === item.slug); link.href = known ? '#item/' + encodeURIComponent(item.slug) : '#cash-catalog'; }
    link.setAttribute('aria-label', `Highest observed daily price volatility in ${kind === 'cash' ? 'the captured cash catalog' : 'the captured non-cash basket/context cohort'}: ${item.name}; ${percent(item.value)}; ${current.window.start}–${current.window.end}; ${item.returns} daily returns.`);
    link.title = 'Sample standard deviation of consecutive qualified daily-median log returns × 100. Minimum five returns; no annualization. Ranking is limited to the captured cohort.';
    link.append(graphic(item, kind)); card.append(link); return card;
  }
  function decorate() {
    observer.disconnect();
    try {
      for (const node of document.querySelectorAll('[data-volatility-owned]')) node.remove();
      toggle.textContent = 'Volatility highlights: ' + (enabled ? 'On' : 'Off'); toggle.setAttribute('aria-pressed', String(enabled));
      categoryToggle.textContent = 'Category member volatility: ' + (categoryEnabled ? 'On' : 'Off'); categoryToggle.setAttribute('aria-pressed', String(categoryEnabled));
      cashToggle.textContent = 'Cash-card volatility: ' + (cashEnabled ? 'On' : 'Off'); cashToggle.setAttribute('aria-pressed', String(cashEnabled));
      tableToggle.textContent = 'Volatility table columns: ' + (tablesEnabled ? 'On' : 'Off'); tableToggle.setAttribute('aria-pressed', String(tablesEnabled));
      decorateTables(); syncCatalog();
      if (!current) return;
      const dates = `${current.window.start}–${current.window.end}; up to six within-window returns. Each daily median needs at least five recorded source sales. No missing-day bridge or carry-forward. Sample SD of daily log returns × 100; not annualized.`;
      for (const card of categoryEnabled ? document.querySelectorAll('.category-card') : []) {
        const name = card.querySelector('[data-category]')?.dataset.category, category = current.categories.find(row => row.name === name); if (!category) continue;
        badge(card, `7-day median member volatility: ${percent(category.value)} · ${category.eligible}/${category.total} items`, `${dates} Unweighted median of sufficiently sampled member volatilities; this is not the category index's volatility.`);
      }
      for (const card of cashEnabled ? document.querySelectorAll('.cash-highlight-card[data-cash-highlight-slug]') : []) {
        const item = current.bySlug.get(card.dataset.cashHighlightSlug);
        badge(card, `7-day daily price volatility: ${percent(item?.value)}${item ? ' · ' + item.returns + '/6 returns' : ''}`, `${dates} This fixed daily window is independent of the cash table's rolling/lookback selection. Fewer than five returns is unavailable, not zero.`);
      }
      for (const [kind, item] of enabled ? [['cash', current.cashWinner], ['goods', current.goodsWinner]] : []) {
        if (!item) continue;
        for (const list of document.querySelectorAll('#market-highlights-track .market-highlights-list')) list.append(highlight(item, kind, list.getAttribute('aria-hidden') === 'true', false));
        document.getElementById('highlights-fact-grid')?.append(highlight(item, kind, false, true));
      }
    } finally { watch(); }
  }
  const calculate = () => { current = report && (enabled || categoryEnabled || cashEnabled || tablesEnabled) ? model(report) : null; decorate(); };
  toggle.addEventListener('click', () => { enabled = !enabled; try { localStorage.setItem(key, enabled ? 'on' : 'off'); } catch {} calculate(); });
  categoryToggle.addEventListener('click', () => { categoryEnabled = !categoryEnabled; try { localStorage.setItem(categoryKey, categoryEnabled ? 'on' : 'off'); } catch {} calculate(); });
  cashToggle.addEventListener('click', () => { cashEnabled = !cashEnabled; try { localStorage.setItem(cashKey, cashEnabled ? 'on' : 'off'); } catch {} calculate(); });
  tableToggle.addEventListener('click', () => { tablesEnabled = !tablesEnabled; try { localStorage.setItem(tableKey, tablesEnabled ? 'on' : 'off'); } catch {} calculate(); if (!tablesEnabled) tableStates.clear(); });
  document.addEventListener('click', event => {
    const button = event.target.closest?.('[data-volatility-sort]'); if (!button) return; const table = button.closest('table'), kind = table?.dataset.volatilityTable; if (!current || !['goods', 'nx'].includes(kind)) return;
    const old = tableStates.get(kind), key = button.dataset.volatilitySort; tableStates.set(kind, { key, ascending: old?.key === key ? !old.ascending : key === 'rank' }); decorate();
  });
  document.addEventListener('click', event => { if(event.target.closest?.('button[data-cash-best-value],button[data-cash-side]'))tableStates.delete('nx');const header = event.target.closest?.('th'); if (!header || !event.target.closest('button') || event.target.closest('[data-volatility-sort]')) return; const kind = header.closest('table')?.dataset.volatilityTable; if (kind) tableStates.delete(kind); }, true);
  document.addEventListener('astracashcatalogcolumnsready', () => syncCatalog(true));
  document.addEventListener('astramarketsnapshot', event => { if (event.detail && typeof event.detail === 'object') { report = event.detail; calculate(); } });
  decorate(); document.dispatchEvent(new Event('astramarkethighlightsready'));
})();

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "volatility-preview.js", status: "initialization_failed"}})); } catch {}
}

;
/* Astra source: fm-backdrop-preview.js */
try {
(() => {
  'use strict';
  const options = document.getElementById('display-options');
  if (!options || document.getElementById('fm-backdrop-options')) return;
  const key = 'astra-fm-backdrop-v1';
  const modes = new Map([['original', 'Original'], ['wide', 'Wide scene'], ['soft', 'Soft gradient'], ['glow', 'Stronger glow']]);
  let storageAvailable = true, selected = 'original';
  try { const saved = localStorage.getItem(key); if (modes.has(saved)) selected = saved; } catch { storageAvailable = false; }
  const group = document.createElement('fieldset'); group.id = 'fm-backdrop-options'; group.className = 'fm-backdrop-options'; group.dataset.previewControls = 'fm-backdrop';
  const legend = document.createElement('legend'); legend.textContent = 'Scenery · Free Market backdrop';
  const buttons = document.createElement('div'); buttons.className = 'fm-backdrop-buttons'; buttons.setAttribute('role', 'group'); buttons.setAttribute('aria-label', 'Free Market backdrop coverage and gradient');
  const note = document.createElement('p'); note.className = 'fm-backdrop-note'; note.id = 'fm-backdrop-note'; group.setAttribute('aria-describedby', note.id);
  function context() {
    const isFM = ['classic', 'banner'].includes(document.body.dataset.sceneryMode);
    const applies = document.body.classList.contains('scenery-on') && isFM;
    group.dataset.applies = String(applies);
    const text = applies ? 'Applies to the Free Market page backdrop. The original 2311 × 1137 map is reused; the banner is unchanged.'
      : 'Choose Current pairing or Different banner with Scenery on to see this backdrop choice. Other scenery and banner artwork are unchanged.';
    const value = text + (storageAvailable ? ' Saved in this browser only.' : ' Storage is blocked; this choice still works in this tab.');
    if (note.textContent !== value) note.textContent = value;
  }
  function apply(mode) {
    selected = modes.has(mode) ? mode : 'original';
    if (selected === 'original') delete document.body.dataset.fmBackdrop;
    else if (document.body.dataset.fmBackdrop !== selected) document.body.dataset.fmBackdrop = selected;
    for (const button of buttons.children) button.setAttribute('aria-pressed', String(button.dataset.fmBackdropChoice === selected));
    context();
  }
  for (const [mode, label] of modes) {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.fmBackdropChoice = mode; button.textContent = label;
    button.addEventListener('click', () => {
      try { localStorage.setItem(key, mode); } catch { storageAvailable = false; }
      apply(mode);
    });
    buttons.append(button);
  }
  group.append(legend, buttons, note); options.append(group); apply(selected);
  const observer = new MutationObserver(context); observer.observe(document.body, { attributes: true, attributeFilter: ['class', 'data-scenery-mode'] });
  window.addEventListener('storage', event => { if (event.key === key && event.storageArea !== null) apply(event.newValue); });
})();

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "fm-backdrop-preview.js", status: "initialization_failed"}})); } catch {}
}

;
/* Astra source: category-reference-preview.js */
try {
(() => {
  'use strict';
  const section=document.getElementById('category-section'),cards=document.getElementById('category-cards');
  if(!section||!cards||document.getElementById('category-reference-preview'))return;
  const make=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
  const validDay=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
  const shift=(date,n)=>new Date(Date.parse(date+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
  const positive=v=>Number.isFinite(v)&&v>0;
  const fmt=(v,d=1)=>Number.isFinite(v)?v.toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}):'Unavailable';
  const pct=v=>Number.isFinite(v)?(v>=0?'+':'')+fmt(v)+'%':'Unavailable';
  const key='astra-category-reference-v1',modes=new Set(['frozen','previous7','previous-day']);let mode='frozen',report=null;
  try{const saved=localStorage.getItem(key);if(modes.has(saved))mode=saved;}catch{}
  const controls=make('div','category-reference-preview');controls.id='category-reference-preview';controls.dataset.previewControls='true';
  const label=make('label','','Compare category prices with'),select=make('select');select.id='category-reference-select';select.setAttribute('aria-describedby','category-reference-editor-note category-reference-status');
  for(const [value,text]of [['frozen','Official frozen reference week'],['previous7','Previous 7 complete source days · preview'],['previous-day','Prior complete source day · preview']]){const o=make('option','',text);o.value=value;select.append(o);}label.append(select);controls.append(label);cards.before(controls);
  const status=make('p','category-reference-status');status.id='category-reference-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');controls.after(status);
  const editorNote=make('small','category-reference-editor-note','This selector changes the category display only; the headline, membership, base prices and weights stay fixed.');editorNote.id='category-reference-editor-note';controls.append(editorNote);
  const legend=section.querySelector('.category-gauge-legend'),legendHidden=legend?.hidden||false;
  function qualified(row,sourceDay){
    const byDay=new Map();for(const p of Array.isArray(row.history)?row.history:[]){if(!Array.isArray(p)||!validDay(p[0])||p[0]>sourceDay||!positive(p[1])||!Number.isInteger(p[2])||p[2]<5)continue;const old=byDay.get(p[0]);if(old){byDay.set(p[0],null);}else if(!byDay.has(p[0]))byDay.set(p[0],p.slice(0,3));}
    if([...byDay.values()].some(p=>p===null))return [];
    return [...byDay.values()].sort((a,b)=>a[0].localeCompare(b[0]));
  }
  function model(data){
    const sourceDay=typeof data?.sourceUpdatedAt==='string'?data.sourceUpdatedAt.slice(0,10):null;
    if(!validDay(sourceDay)||!/(?:Z|[+-]\d\d:\d\d)$/.test(data.sourceUpdatedAt)||!Number.isFinite(Date.parse(data.sourceUpdatedAt))||!Array.isArray(data.rows)||!Array.isArray(data.categories))return null;
    const rows=data.rows;if(new Set(rows.map(r=>r?.slug)).size!==rows.length||rows.some(r=>!r||typeof r.slug!=='string'||!positive(r.weight)||!positive(r.basePrice)))return null;
    const end=shift(sourceDay,-1),start=mode==='previous7'?shift(sourceDay,-7):end;
    const categories=data.categories.map(cat=>{
      const members=rows.filter(r=>r.category===cat.name),weight=members.reduce((s,r)=>s+r.weight,0);let currentLevel=0,referenceLevel=0,currentWeight=0,referenceWeight=0,currentObservedWeight=0,referenceCarriedWeight=0,currentDates=[],referenceDates=[],referenceObservations=0;
      for(const row of members){const h=qualified(row,sourceDay),current=h.at(-1);if(current){currentWeight+=row.weight;currentLevel+=row.weight*current[1]/row.basePrice;currentDates.push(current[0]);if(current[0]===sourceDay)currentObservedWeight+=row.weight;}
        const points=mode==='previous7'?h.filter(p=>p[0]>=start&&p[0]<=end):h.filter(p=>p[0]<=end).slice(-1);
        if(points.length){const q=points.reduce((s,p)=>s+p[2],0),price=points.reduce((s,p)=>s+p[1]*p[2],0)/q;referenceWeight+=row.weight;referenceLevel+=row.weight*price/row.basePrice;referenceDates.push(...points.map(p=>p[0]));referenceObservations+=points.length;if(mode==='previous-day'&&points[0][0]<end)referenceCarriedWeight+=row.weight;}
      }
      const valid=members.length>0&&members.length===cat.count&&Math.abs(weight-cat.weight)<1e-8&&Math.abs(currentWeight-weight)<1e-8&&Math.abs(referenceWeight-weight)<1e-8&&positive(referenceLevel);
      return {name:cat.name,index:valid?100*currentLevel/referenceLevel:null,count:members.length,weight,currentCoverage:weight?currentWeight/weight:0,referenceCoverage:weight?referenceWeight/weight:0,currentObservedCoverage:weight?currentObservedWeight/weight:0,referenceCarriedCoverage:weight?referenceCarriedWeight/weight:0,currentDates:currentDates.sort(),referenceDates:referenceDates.sort(),referenceObservations};
    });
    return{sourceDay,start,end,categories};
  }
  function apply(){
    select.value=mode;section.dataset.categoryReference=mode;status.hidden=false;
    if(report&&typeof renderCategoryCards==='function')renderCategoryCards();
    section.querySelectorAll('.category-reference-note').forEach(n=>n.remove());
    if(legend)legend.hidden=mode==='frozen'?legendHidden:true;
    if(mode==='frozen'){status.textContent=report?'':'Waiting for the published snapshot. The official frozen reference is the default.';status.hidden=!!report;return;}
    const comparison=model(report);
    if(!comparison){status.textContent='Comparison unavailable: a valid dated fixed-basket snapshot is required. No estimate is filled.';cards.querySelectorAll('.category-main').forEach(button=>{button.querySelector('.category-gauge')?.remove();const n=button.querySelector('.category-number');if(n)n.textContent='Unavailable';button.querySelector('.category-change')?.remove();button.querySelector('.category-value-label')?.remove();});return;}
    const max=typeof categoryScale==='function'?categoryScale(comparison.categories.map(c=>c.index)):Math.max(200,...comparison.categories.map(c=>c.index||0));
    const percentOnly=section.dataset.categoryValue==='percent';
    for(const button of cards.querySelectorAll('.category-main')){const cat=comparison.categories.find(c=>c.name===button.dataset.category);if(!cat)continue;
      const oldGauge=button.querySelector('.category-gauge'),gauge=Number.isFinite(cat.index)&&typeof categoryGauge==='function'?categoryGauge(cat.index,max):'';if(oldGauge){if(gauge){const holder=make('div');holder.innerHTML=gauge;const next=holder.firstElementChild;next.setAttribute('aria-label',`Display comparison ${fmt(cat.index)}; selected source-calendar reference = 100; not the official MPI baseline`);oldGauge.replaceWith(next);}else oldGauge.remove();}
      const number=button.querySelector('.category-number');if(number)number.textContent=Number.isFinite(cat.index)?percentOnly?pct(cat.index-100):fmt(cat.index):'Unavailable';
      button.querySelector('.category-change')?.remove();button.querySelector('.category-value-label')?.remove();
      const change=make('span',percentOnly?'category-value-label':'category-change '+(cat.index>=100?'up':'down'),Number.isFinite(cat.index)?percentOnly?'vs. selected comparison':pct(cat.index-100):'No complete comparable mix');button.append(change);
      const note=make('small','category-reference-note',`Current/reference priced weight: ${fmt(cat.currentCoverage*100)}% / ${fmt(cat.referenceCoverage*100)}%. Current-day observed weight ${fmt(cat.currentObservedCoverage*100)}%; remaining priced weight is carried.${mode==='previous-day'?` Reference carried weight ${fmt(cat.referenceCarriedCoverage*100)}%.`:` ${cat.referenceObservations} qualified item-day observations in the 7-day window.`}`);
      note.title=`Current qualified dates: ${cat.currentDates[0]||'none'}–${cat.currentDates.at(-1)||'none'}. Reference qualified dates: ${cat.referenceDates[0]||'none'}–${cat.referenceDates.at(-1)||'none'}. Daily medians with recorded count ≥5 only.`;button.closest('.category-card').append(note);
    }
    status.textContent=`Display comparison only: ${mode==='previous7'?'previous 7 complete source-calendar days':'prior complete source-calendar day'} (${comparison.start}–${comparison.end}); current qualified prices through source day ${comparison.sourceDay} (partial). Source publication ${report.sourceUpdatedAt}; no intraday price timing is inferred. 100 = the selected comparison level, not a new official MPI baseline. Original membership, fixed weights and base prices are preserved. Missing member prices make that category unavailable; partial mixes are never renormalized.`;
  }
  select.addEventListener('change',()=>{mode=modes.has(select.value)?select.value:'frozen';try{localStorage.setItem(key,mode);}catch{}apply();});
  document.addEventListener('astramarketsnapshot',ev=>{report=ev.detail;apply();});
  section.addEventListener('click',ev=>{if(ev.target.closest('[data-category-value]'))queueMicrotask(apply);});
  apply();document.dispatchEvent(new Event('astramarkethighlightsready'));
})();

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "category-reference-preview.js", status: "initialization_failed"}})); } catch {}
}

;
/* Astra source: short-window-preview.js */
try {
(() => {
  'use strict';
  if (window.AstraShortWindow) return;
  const validDay = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
  const shift = (day, offset) => new Date(Date.parse(day + 'T00:00:00Z') + offset * 86400000).toISOString().slice(0, 10);
  function sourceDay(value) { return typeof value === 'string' && Number.isFinite(Date.parse(value)) && validDay(value.slice(0, 10)) ? value.slice(0, 10) : null; }
  function calculate(row, publication) {
    const source = sourceDay(publication);
    if (!source) return null;
    const endDay = shift(source, -1), observations = new Map(), conflicts = new Set();
    for (const point of Array.isArray(row?.history) ? row.history : []) {
      if (!Array.isArray(point) || !validDay(point[0])) continue;
      const prior = observations.get(point[0]);
      if (prior && (prior[1] !== point[1] || prior[2] !== point[2])) conflicts.add(point[0]);
      else observations.set(point[0], point);
    }
    const endpoint = day => {
      const point = observations.get(day);
      return point && !conflicts.has(day) && Number.isFinite(point[1]) && point[1] > 0 && Number.isSafeInteger(point[2]) && point[2] >= 5 ? { day, price: point[1], quantity: point[2] } : null;
    };
    return { sourceDay: source, endDay, publication, comparisons: [1, 3, 7].map(days => {
      const startDay = shift(endDay, -days), start = endpoint(startDay), end = endpoint(endDay), percent = start && end ? (end.price / start.price - 1) * 100 : null;
      return { days, startDay, endDay, start, end, percent: Number.isFinite(percent) ? percent : null,
        reason: !start || !end ? 'Exact qualified endpoint unavailable' : !Number.isFinite(percent) ? 'Finite comparison unavailable' : null };
    }) };
  }
  window.AstraShortWindow = Object.freeze({ calculate });
  const options = document.getElementById('display-options'), view = document.getElementById('view-index');
  if (!options || !view || document.getElementById('short-window-options')) return;
  const make = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
  const key = 'astra-short-window-preview-v1', pairKey='astra-short-window-pair-v1'; let enabled = false, pair='3_1', report = null, pending = false, storageAvailable = true, models = { goods: new Map(), cash: new Map() };
  try { enabled = localStorage.getItem(key) === 'on'; if(localStorage.getItem(pairKey)==='7_3')pair='7_3'; } catch { storageAvailable = false; }
  const group = make('div', 'short-window-options'); group.id = 'short-window-options'; group.dataset.previewControls = 'short-window'; group.setAttribute('role', 'group'); group.setAttribute('aria-label', 'Complete-day item price comparisons');
  const label = make('span', '', 'Item price curiosity'), toggle = make('button'), note = make('small', 'short-window-options-note'); toggle.type = 'button'; toggle.setAttribute('aria-controls', 'view-index'); group.append(label, toggle, note); options.append(group);
  for(const [value,text] of [['7_3','7-day + 3-day'],['3_1','3-day + 1-day']]){const button=make('button','',text);button.type='button';button.dataset.shortWindowPair=value;button.setAttribute('aria-controls','view-index');button.addEventListener('click',()=>{pair=value;enabled=true;try{localStorage.setItem(pairKey,pair);localStorage.setItem(key,'on');}catch{storageAvailable=false;}draw();});group.insertBefore(button,note);}
  const signed = value => { const rounded = Math.abs(value) < .05 ? 0 : value; return (rounded > 0 ? '+' : '') + rounded.toLocaleString('en-US', { maximumFractionDigits: 1 }) + '%'; };
  const signatures = new WeakMap();
  function badge(model) {
    const host = make('span', 'short-window-badge'); host.setAttribute('role', 'note');
    host.append(make('span', 'short-window-label', 'Separate daily-median changes'));
    if (!model) { host.append(make('span', 'short-window-unavailable', 'Unavailable · source-calendar clock unknown')); return host; }
    host.append(make('span', 'short-window-period', `Complete through ${model.endDay}; current source day excluded`));
    for (const days of pair==='7_3'?[7,3]:[3,1]) {
      const point=model.comparisons.find(point=>point.days===days);
      const line = make('span', 'short-window-return'); line.dataset.shortWindowDays = String(point.days);
      const name = point.days === 1 ? '1 source day (24h*)' : point.days+' source days';
      const value = make('strong', point.percent === null ? 'short-window-unavailable' : point.percent > 0 ? 'short-window-up' : point.percent < 0 ? 'short-window-down' : 'short-window-flat', point.percent === null ? 'Unavailable' : signed(point.percent));
      line.append(make('span', '', name + ': '), value, make('small', '', `${point.startDay} → ${point.endDay} · ${point.percent === null ? 'needs both actual daily medians, each q ≥ 5; no carried substitute' : `recorded endpoint counts ${point.start.quantity} / ${point.end.quantity}; each q ≥ 5`}`)); host.append(line);
    }
    host.append(make('span', 'short-window-caveat', '* Calendar-day comparison, not rolling 24h or intraday. Counts are source-inferred.'));
    return host;
  }
  function draw() {
    pending = false;
    toggle.textContent = enabled ? 'Extra comparisons: On' : 'Extra comparisons: Off'; toggle.setAttribute('aria-pressed', String(enabled));
    for(const button of group.querySelectorAll('[data-short-window-pair]'))button.setAttribute('aria-pressed',String(enabled&&button.dataset.shortWindowPair===pair));
    view.dataset.shortWindowPreview=enabled?pair:'off';
    note.textContent = 'Optional extra lines on Overview goods and cash cards. Exact complete-day endpoints only; existing 7-day activity, weights, indices and NX estimates stay unchanged.' + (storageAvailable ? ' Saved in this browser.' : ' Storage is blocked; this choice works in this tab.');
    for (const card of view.querySelectorAll('#overview-basket button[data-item], #cash-item-highlights [data-cash-highlight-slug]')) {
      const existing = [...card.children].find(child => child.classList.contains('short-window-badge'));
      if (!enabled) { if (existing) existing.remove(); signatures.delete(card); continue; }
      const isCash = card.hasAttribute('data-cash-highlight-slug'), slug = isCash ? card.dataset.cashHighlightSlug : card.dataset.item, model = (isCash ? models.cash : models.goods).get(slug) || null;
      const signature = pair+JSON.stringify(model);
      if (existing && signatures.get(card) === signature) continue;
      const next = badge(model); if (existing) existing.replaceWith(next); else card.append(next); signatures.set(card, signature);
    }
  }
  function schedule() { if (!pending) { pending = true; Promise.resolve().then(draw); } }
  function receive(data) {
    report = data;
    models = { goods: new Map(), cash: new Map() };
    for (const row of Array.isArray(report?.rows) ? report.rows : []) if (row && typeof row.slug === 'string') models.goods.set(row.slug, calculate(row, report.sourceUpdatedAt));
    const catalog = report?.cashCatalog, hasCatalog = catalog?.schemaVersion === 1 && catalog.kind === 'cash_shop_source_catalog' && Array.isArray(catalog.rows);
    for (const row of hasCatalog ? catalog.rows : Array.isArray(report?.cash) ? report.cash : []) if (row && typeof row.slug === 'string') models.cash.set(row.slug, calculate(row, hasCatalog ? catalog.sourceUpdatedAt : report.sourceUpdatedAt));
    draw();
  }
  toggle.addEventListener('click', () => { enabled = !enabled; try { localStorage.setItem(key, enabled ? 'on' : 'off'); } catch { storageAvailable = false; } draw(); });
  const observer = new MutationObserver(schedule); observer.observe(view, { childList: true, subtree: true });
  document.addEventListener('astramarketsnapshot', event => receive(event.detail));
  draw(); document.dispatchEvent(new Event('astramarkethighlightsready'));
})();

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "short-window-preview.js", status: "initialization_failed"}})); } catch {}
}

;
/* Astra source: ellinia-backdrop-preview.js */
try {
(() => {
  'use strict';
  const host = document.getElementById('scenery-options');
  if (!host || document.getElementById('ellinia-backdrop-options')) return;
  const key = 'astra-ellinia-backdrop-v1';
  const choices = [['current', 'Current map'], ['bright', 'Brighter map'], ['soft', 'Softer map'], ['framed', 'Framed original']];
  let selected = 'current';
  try { const saved = localStorage.getItem(key); if (choices.some(([value]) => value === saved)) selected = saved; } catch { /* Current map remains the default. */ }
  const group = document.createElement('fieldset'); group.id = 'ellinia-backdrop-options'; group.className = 'ellinia-backdrop-options'; group.dataset.previewControls = 'true';
  const legend = document.createElement('legend'); legend.textContent = 'Ellinia backdrop'; group.append(legend);
  const buttons = document.createElement('div'); buttons.className = 'ellinia-backdrop-buttons'; group.append(buttons);
  const note = document.createElement('small'); note.id = 'ellinia-backdrop-note'; note.textContent = 'Applies to Different backdrop only. Original Maple artwork; the banner and other scenery stay the same.'; group.setAttribute('aria-describedby', note.id);
  const apply = () => {
    document.body.dataset.elliniaBackdrop = selected;
    for (const button of buttons.children) button.setAttribute('aria-pressed', String(button.dataset.elliniaBackdropChoice === selected));
  };
  for (const [value, label] of choices) {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.elliniaBackdropChoice = value; button.textContent = label;
    button.addEventListener('click', () => { selected = value; apply(); try { localStorage.setItem(key, value); } catch { /* The choice still works in this tab. */ } }); buttons.append(button);
  }
  group.append(note); host.append(group); apply();
})();

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "ellinia-backdrop-preview.js", status: "initialization_failed"}})); } catch {}
}

;
/* Astra source: viewer-preview.js */
try {
(() => {
  'use strict';
  const options = document.getElementById('display-options');
  if (!options || document.getElementById('viewer-preview-enter')) return;
  const footer=document.querySelector('footer'),passwordMode=footer?.dataset.footerPrivacyLock==='on';
  let controlsUnlocked=!passwordMode;

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

  function setViewer(enabled,focus=true) {
    if(!enabled&&!controlsUnlocked)return;
    if (enabled === viewing) return;
    viewing = enabled;
    if (enabled) {
      previousFocus = document.activeElement && document.activeElement !== document.body ? document.activeElement : enter;
      document.body.dataset.viewerPreview = 'on'; entry.hidden = true; exit.hidden = false;
      if(focus)exit.focus({ preventScroll: true });
    } else {
      delete document.body.dataset.viewerPreview; entry.hidden = false; exit.hidden = true;
      const target = previousFocus?.isConnected && !previousFocus.disabled ? previousFocus : enter;
      if(focus)target.focus({ preventScroll: true }); previousFocus = null;
    }
  }
  enter.addEventListener('click', () => setViewer(true));
  exit.addEventListener('click', () => setViewer(false));
  document.addEventListener('keydown', event => {
    if(passwordMode)return; // The password-mode Escape handler below relocks.
    if (!viewing || event.key !== 'Escape') return;
    event.preventDefault(); setViewer(false);
  });
  if(passwordMode){
    const access=document.createElement('div');access.className='preview-controls-access';
    const gate=document.createElement('button');gate.type='button';gate.id='preview-controls-access';gate.textContent='Preview controls';gate.setAttribute('aria-controls','preview-controls-dialog');access.append(gate);footer.append(access);
    const dialog=document.createElement('dialog');dialog.id='preview-controls-dialog';dialog.className='preview-controls-dialog';dialog.setAttribute('aria-labelledby','preview-controls-title');dialog.setAttribute('aria-describedby','preview-controls-note');
    const title=document.createElement('h2');title.id='preview-controls-title';title.textContent='Preview controls';
    const note=document.createElement('p');note.id='preview-controls-note';note.textContent='Unlock design controls for this tab only. Escape or Lock preview controls hides them again; reloading starts locked.';
    const form=document.createElement('form');form.autocomplete='off';
    const label=document.createElement('label');label.htmlFor='preview-controls-password';label.textContent='Preview password';
    const input=document.createElement('input');input.id='preview-controls-password';input.name='password';input.type='password';input.autocomplete='off';input.required=true;input.maxLength=256;input.setAttribute('aria-describedby','preview-controls-feedback');
    const submit=document.createElement('button');submit.type='submit';submit.textContent='Unlock controls';
    const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Cancel';
    const actions=document.createElement('div');actions.className='preview-controls-dialog-actions';actions.append(submit,cancel);
    const feedback=document.createElement('p');feedback.id='preview-controls-feedback';feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
    form.append(label,input,actions,feedback);dialog.append(title,note,form);document.body.append(dialog);
    let attempt=0,controller=null,timeout=null;
    const cancelAttempt=()=>{attempt++;controller?.abort();controller=null;clearTimeout(timeout);timeout=null;input.value='';submit.disabled=false;form.removeAttribute('aria-busy');};
    const closeDialog=()=>{cancelAttempt();if(dialog.open){if(typeof dialog.close==='function')dialog.close();else dialog.removeAttribute('open');}gate.focus({preventScroll:true});};
    const lock=()=>{controlsUnlocked=false;cancelAttempt();document.body.dataset.previewControlsLocked='true';setViewer(true,false);entry.hidden=true;exit.hidden=true;gate.textContent='Preview controls';gate.setAttribute('aria-expanded','false');if(dialog.open){if(typeof dialog.close==='function')dialog.close();else dialog.removeAttribute('open');}};
    gate.addEventListener('click',()=>{if(controlsUnlocked){lock();gate.focus({preventScroll:true});return;}feedback.textContent='';input.value='';if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');gate.setAttribute('aria-expanded','true');input.focus();});
    cancel.addEventListener('click',closeDialog);
    dialog.addEventListener('cancel',event=>{event.preventDefault();closeDialog();});
    dialog.addEventListener('close',()=>{cancelAttempt();gate.setAttribute('aria-expanded','false');});
    form.addEventListener('submit',async event=>{
      event.preventDefault();if(submit.disabled)return;let password=input.value;input.value='';feedback.textContent='';
      if(!password||password.length>256){feedback.textContent='Enter the preview password.';input.focus();return;}
      const ticket=++attempt;submit.disabled=true;form.setAttribute('aria-busy','true');
      try{
        let accepted=false;
        if(['localhost','127.0.0.1'].includes(location.hostname)){
          // Explicit nonsecret development password verifier. Never used on a
          // remote host, including endpoint failures or lookalike hostnames.
          if(!window.crypto?.subtle||typeof TextEncoder!=='function')throw new Error('Local verification unavailable');
          const bytes=new TextEncoder().encode(password);password='';const digest=await window.crypto.subtle.digest('SHA-256',bytes);
          accepted=[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('')==='c0f5d87e15713bcf6d395e640f41e725534be802b694edeed9b1032cb4954dc6';
        }else{
          if(location.protocol!=='https:')throw new Error('HTTPS is required');
          controller=new AbortController();timeout=setTimeout(()=>controller?.abort(),15000);
          const body=new URLSearchParams({password}).toString();password='';
          const response=await fetch('/__preview_controls',{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',headers:{'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},body,signal:controller.signal});
          if(response.status===200&&/^application\/json(?:;|$)/i.test(response.headers.get('content-type')||''))accepted=(await response.json())?.unlocked===true;
        }
        if(ticket!==attempt)return;
        if(!accepted){feedback.textContent='Password not accepted, or the site preview session has expired.';input.focus();return;}
        controlsUnlocked=true;delete document.body.dataset.previewControlsLocked;closeDialog();setViewer(false,false);exit.textContent='Exit viewer preview';exit.title='Return to unlocked editing. Escape relocks preview controls.';gate.textContent='Lock preview controls';options.open=true;options.querySelector('summary')?.focus({preventScroll:true});
      }catch{if(ticket===attempt){feedback.textContent='Controls remain locked. Verification could not complete; try again after checking the site preview session.';input.focus();}}
      finally{password='';if(ticket===attempt){clearTimeout(timeout);timeout=null;controller=null;submit.disabled=false;form.removeAttribute('aria-busy');}}
    });
    document.addEventListener('keydown',event=>{if(event.key!=='Escape')return;if(dialog.open){event.preventDefault();closeDialog();return;}if(controlsUnlocked){event.preventDefault();lock();gate.focus({preventScroll:true});}});
    window.addEventListener('pageshow',event=>{if(event.persisted)lock();});
    lock();
  }
})();

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "viewer-preview.js", status: "initialization_failed"}})); } catch {}
}

;
/* Astra source: date-presentation.js */
try {
(() => {
  'use strict';
  if(window.AstraDatePresentation)return;
  const pattern=/\b(20\d{2})-(\d{2})-(\d{2})(?=T|\b)/g;
  const normalized=text=>String(text).replace(pattern,(match,y,m,d)=>{const date=new Date(`${y}-${m}-${d}T00:00:00Z`);return Number.isFinite(date.valueOf())&&date.toISOString().slice(0,10)===match?`${m}-${d}-${y}`:match});
  const format=(text,wrap=true)=>{const value=normalized(text);if(!wrap)return value;return value.replace(/\b\d{2}-\d{2}-20\d{2}(?:[–—]\d{2}-\d{2}-20\d{2})?(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?/g,(match,offset,all)=>all[offset-1]==='('&&all[offset+match.length]===')'?match:'('+match.replace('T',' ')+')')};
  const options=document.getElementById('display-options');if(options){const group=document.createElement('div');group.className='hero-layout-options';group.dataset.previewControls='true';group.setAttribute('role','group');group.setAttribute('aria-label','Date detail emphasis');let bold=false;try{bold=localStorage.getItem('astra-date-tone-v1')==='bold'}catch{}const button=document.createElement('button');button.type='button';const apply=()=>{document.body.dataset.dateTone=bold?'bold':'plain';button.textContent='Date details: '+(bold?'Bold white':'Match explanation');button.setAttribute('aria-pressed',String(bold))};button.addEventListener('click',()=>{bold=!bold;try{localStorage.setItem('astra-date-tone-v1',bold?'bold':'plain')}catch{}apply()});group.append(button);options.append(group);apply()}
  const skip=node=>node.parentElement?.closest('script,style,pre,code,textarea,input,[contenteditable="true"],[data-raw-date]');
  function visit(node){if(node.nodeType===3){if(!skip(node)){const next=format(node.nodeValue,!node.parentElement?.closest('.market-highlight-dates'));if(next!==node.nodeValue)node.nodeValue=next}return}if(node.nodeType!==1||node.matches?.('script,style,pre,code,textarea,input,[contenteditable="true"],[data-raw-date]'))return;const walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT);let text;while(text=walker.nextNode())visit(text)}
  window.AstraDatePresentation=Object.freeze({format});
  visit(document.body);
  const pending=new Set();let scheduled=false;
  const flush=()=>{scheduled=false;const nodes=[...pending];pending.clear();for(const node of nodes)if(node.isConnected)visit(node)};
  new MutationObserver(records=>{for(const record of records){if(record.type==='characterData')pending.add(record.target);else for(const node of record.addedNodes)pending.add(node)}if(pending.size&&!scheduled){scheduled=true;requestAnimationFrame(flush)}}).observe(document.body,{childList:true,subtree:true,characterData:true});
})();

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "date-presentation.js", status: "initialization_failed"}})); } catch {}
}

;
/* Astra source: local-preview-refresh.js */
try {
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

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "local-preview-refresh.js", status: "initialization_failed"}})); } catch {}
}
