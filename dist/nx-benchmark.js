(() => {
  'use strict';
  if (window.AstraNxBenchmark) return;

  const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
  // This is a hypothetical comparison, never an observed exchange-rate series.
  function calculate(report) {
    if(report?.apiCalculationUnavailable)return null;
    if(report?.apiCalculationView){const view=report.apiCalculationView,active=view.headline,observed=[...view.daily.history].reverse().find(p=>positive(p.nxRate)&&p.cashItems>=3);if(!active.available||!observed)return null;
      const anchorMpi=active.mode!=='rolling'?100:active.meanMpi,anchorNxRate=active.mode!=='rolling'?report.baseNxRate:active.cashAnchor,factor=view.index/anchorMpi,adjusted=observed.nxRate/factor;
      if(![anchorMpi,anchorNxRate,factor,adjusted].every(positive))return null;
      return {api:true,baseNxRate:report.baseNxRate,cpi:view.index,observedNxRate:observed.nxRate,observedDay:observed.day,observedPartial:observed.partialCalendarDay,goodsPriceFactor:factor,anchorMpi,anchorNxRate,modelBenchmarkRate:active.rate,observedGoodsAdjustedRate:adjusted,goodsBuyingPowerChange:100*(adjusted/anchorNxRate-1),rolling:active.mode==='rolling',windowDays:active.windowDays,mode:active.mode,modelLabel:active.label,anchorStart:active.startDay,anchorEnd:active.endExclusive,frozenBenchmarkRate:report.baseNxRate*view.index/100,fallbackReason:null};
    }
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
  function receiveApi(report){
    const view=report.apiCalculationView,values=calculate(report),active=view.headline;
    for(const section of sections){
      section.querySelector('.nx-benchmark-results').hidden=!values;
      section.querySelector('.nx-benchmark-intro').textContent='The headline uses the linked 3-day goods-price reference. Actual daily cash-item evidence stays separate: its dates, lookback and trading mix differ.';
      section.querySelector('.nx-benchmark-status').textContent=`Price reference captured ${view.clocks.currentPrices}; daily anchor evidence captured ${view.clocks.dailyCapture}. Original legacy source ${view.clocks.legacyDaily} is retained separately. These are HTTP receipt clocks, not trade times.`;
      section.querySelector('.nx-benchmark-inputs').textContent=values?`Latest actual daily cash reference (${values.observedDay}${values.observedPartial?' · partial calendar day':''}): ${number(values.observedNxRate)} mesos/NX. Current linked 3-day goods MPI: ${number(view.index)}. Selected anchor: ${active.mode!=='rolling'?'frozen reference':active.windowDays+' previous complete source-calendar days ('+active.startDay+'–'+active.endExclusive+', end exclusive)'}. These source windows differ; this is a model comparison, not a matched trade.`:active.reason||'The selected model or comparable daily cash evidence is unavailable; no legacy fallback is substituted.';
      section.querySelector('[data-nx-model-title]').textContent=active.label;
      section.querySelector('[data-nx-model-description]').textContent='Modelled mesos per NX preserving the selected anchor’s buying power in the fixed goods basket; not an executable exchange quote.';
      section.querySelector('[data-nx-adjusted-description]').textContent='Latest source-day cash reference divided by the modelled goods-price factor. Its daily window differs from the current three-day price reference.';
      section.querySelector('[data-nx-change-description]').textContent='Change in that model comparison against the selected cash anchor; not realized profit or a direct exchange spread.';
      section.querySelector('[data-nx-model-formula]').textContent=active.mode!=='rolling'?'Frozen reference NX rate × linked current goods index / 100.':'Count-weighted fixed-NX daily cash anchor over the previous '+active.windowDays+' complete source-calendar days × current linked goods index / arithmetic mean linked daily MPI over the same days. Every selected anchor day must qualify; missing windows remain unavailable.';
      section.querySelector('[data-nx-model-limit]').textContent='The frozen November 4 retrospective source link preserves the legacy index level, not identical samples or constant item quality. All 50 current same-capture goods prices are required. Raw API three-day sale medians differ from linked index prices. Exact three-day bounds and individual trade timestamps are unknown. Pre-link API index history is a backcast; legacy history remains separate. Cash anchors still reflect changing cash supply, demand and composition.';
      for(const node of section.querySelectorAll('[data-nx-benchmark]')){const key=node.dataset.nxBenchmark;node.textContent=values?(key==='model'?number(values.modelBenchmarkRate):key==='adjusted'?number(values.observedGoodsAdjustedRate):signed(values.goodsBuyingPowerChange)):'—';}
    }
  }
  function receive(report) {
    if(report?.apiCalculationView){lastReport=report;receiveApi(report);return;}

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
