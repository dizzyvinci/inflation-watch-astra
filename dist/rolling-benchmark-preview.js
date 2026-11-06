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
    if(report?.apiCalculationView){const model=window.AstraApiCalculations?.headline();return !requestedDay&&requestedDays===windowDays&&model?model:failure(requestedDay,'API historical model captures are distinct from daily observations; no legacy fallback.');}
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
  let latestApiReport=null;
  function decorateExplanations() {
    if(note&&latestApiReport?.apiCalculationView)note.textContent='API model: latest reported 3-day sale-median reference, linked retrospectively to the frozen November 4 index. Rolling NX = count-weighted daily fixed-NX cash anchor over the previous '+windowDays+' complete UTC source-calendar days × current linked goods index / arithmetic mean linked daily MPI over those same days. All 50 same-capture current goods prices are required; no cross-capture carry or reweighting is used for that current reference. Daily goods indices retain the last qualified daily observation where needed and require at least 80% observed basket weight. Every selected complete anchor day must qualify; no seven-to-three-day fallback. Exact 3-day observation bounds and trade times are unknown. The fixed-anchor option retains the frozen reference NX rate. Smega offers and asks do not enter this model.';

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
  document.addEventListener('astramarketsnapshot', event=>{latestApiReport=event.detail;queueDecoration();});
  function headline(report) {
    if(report?.apiCalculationView&&window.AstraApiCalculations)return window.AstraApiCalculations.headline();
    const rolling = calculate(report), fixed = frozenPoint(report), requestedMode = mode;
    if (mode === 'rolling' && rolling.available) return { ...rolling, mode: 'rolling', requestedMode, label: `Rolling-anchor goods NX benchmark · ${windowDays} complete days`, changeLabel: `vs previous ${windowDays} complete source days`, observed: false };
    const fallback = mode === 'rolling';
    return { ...fixed, mode: fallback ? 'fixed_fallback' : mode, requestedMode,
      label: fallback ? 'Reference-week NX benchmark · rolling anchor unavailable' : 'Reference-week goods NX benchmark',
      changeLabel: 'vs fixed reference week', fallbackReason: fallback ? rolling.reason : null, observed: false };
  }
  function series(report) {
    if(report?.apiCalculationView)return (window.AstraApiCalculations?.sourceSeries('nx')||[]).map(s=>({...s,label:s.name}));
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
