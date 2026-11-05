(() => {
  'use strict';
  if (window.AstraNxBenchmark) return;

  const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
  // This is a hypothetical comparison, never an observed exchange-rate series.
  function calculate(report) {
    const baseNxRate = report?.baseNxRate, cpi = report?.latest?.cpi, observedNxRate = report?.latest?.nxRate;
    if (![baseNxRate, cpi, observedNxRate].every(positive)) return null;
    const goodsPriceFactor = cpi / 100;
    const modelBenchmarkRate = baseNxRate * goodsPriceFactor;
    const observedGoodsAdjustedRate = observedNxRate / goodsPriceFactor;
    const goodsBuyingPowerChange = (observedGoodsAdjustedRate / baseNxRate - 1) * 100;
    if (![goodsPriceFactor, modelBenchmarkRate, observedGoodsAdjustedRate].every(positive)
        || !Number.isFinite(goodsBuyingPowerChange)) return null;
    return Object.freeze({ baseNxRate, cpi, observedNxRate, goodsPriceFactor,
      modelBenchmarkRate, observedGoodsAdjustedRate, goodsBuyingPowerChange });
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
          <article><h3>Modelled NX benchmark</h3><strong data-nx-benchmark="model"></strong><p>Current mesos per NX, <em>if only selected goods prices changed</em> from the reference week.</p></article>
          <article><h3>Observed NX, adjusted for goods prices</h3><strong data-nx-benchmark="adjusted"></strong><p>Reference-week meso buying power per NX, using the observed daily estimate.</p></article>
          <article><h3>Goods buying-power change</h3><strong data-nx-benchmark="change"></strong><p>Compared with the frozen reference-week NX rate, after the goods-price adjustment.</p></article>
        </div>
      </div>
      <details><summary>How this comparison was calculated</summary>
        <p><strong>Modelled benchmark:</strong> reference-week NX rate × (goods MPI ÷ 100). <strong>Goods-adjusted observed rate:</strong> observed daily NX rate ÷ (goods MPI ÷ 100). <strong>Buying-power change:</strong> (goods-adjusted rate ÷ reference-week NX rate − 1) × 100%.</p>
        <p>Goods MPI uses a fixed non-cash basket. It excludes cash items and cosmetics, keeping the goods price level separate from the cash sales used to estimate NX. It measures the selected basket, not all items or meso supply.</p>
        <p>The observed NX estimate uses verified fixed-NX items and daily recorded-volume weights. Changes in that trading mix, seasonal demand or supply can move it. Mystery crates and other items without verified fixed NX costs receive no invented NX cost here.</p>
        <p>The benchmark holds the reference NX relationship fixed while changing only the selected goods price level. It leaves real NX supply, demand and cash-item composition outside the model. These are different units, not pooled indices, a forecast or executable quotes. The actual daily best/worst-value items remain unchanged.</p>
      </details>`;
    view.append(section);
    sections.push(section);
  }

  function receive(report) {
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
      section.querySelector('.nx-benchmark-status').textContent = `Dated daily source${sourceDay ? ': ' + sourceDay : '; source day unknown'}${report.latest?.partial ? ' · partial source-calendar day' : ''}.${state === 'degraded' ? ' Source checks are degraded; this comparison uses the retained daily evidence.' : ''} No new source observations are created by this model.`;
      section.querySelector('.nx-benchmark-inputs').textContent = `Inputs: observed daily estimate 1 NX ≈ ${number(values.observedNxRate)} mesos; goods MPI ${number(values.cpi)} (reference week = 100); frozen reference NX rate ${number(values.baseNxRate)} mesos per NX${start && end ? ' · ' + start + '–' + end : ''}.`;
      section.querySelector('[data-nx-benchmark="model"]').textContent = '1 NX ≈ ' + number(values.modelBenchmarkRate) + ' mesos';
      section.querySelector('[data-nx-benchmark="adjusted"]').textContent = number(values.observedGoodsAdjustedRate) + ' reference-week mesos / NX';
      section.querySelector('[data-nx-benchmark="change"]').textContent = signed(values.goodsBuyingPowerChange);
    }
  }
  document.addEventListener('astramarketsnapshot', event => receive(event.detail));
  receive(null);
  if (sections.length) document.dispatchEvent(new Event('astramarkethighlightsready'));
})();
