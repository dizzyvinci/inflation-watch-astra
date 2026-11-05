const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { JSDOM, VirtualConsole } = require('jsdom');
const project = path.resolve(__dirname, '..');
const report = JSON.parse(fs.readFileSync(path.join(project, 'dist/data.json'), 'utf8'));
const untouched = JSON.stringify(report), errors = [], requests = [], published = [];
const vc = new VirtualConsole(); vc.on('jsdomError', error => errors.push(error.message));
const dom = new JSDOM(fs.readFileSync(path.join(project, 'web/index.html'), 'utf8'), {
  url: 'https://inflation.gg/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc,
});
const w = dom.window, doc = w.document;
w.scrollTo = () => {}; w.HTMLElement.prototype.scrollIntoView = function () {};
w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
w.HTMLDialogElement.prototype.close = function () { this.open = false; };
w.AbortSignal.timeout = () => undefined;
w.fetch = async url => {
  requests.push(url); assert(['version.json', 'data-0123456789abcdef.json'].includes(url));
  return { ok: true, json: async () => url === 'version.json' ? { version: 'fixture', data: 'data-0123456789abcdef.json' } : report };
};
doc.addEventListener('astramarketsnapshot', event => published.push({ report: event.detail, rate: doc.getElementById('main-rate').textContent, at: doc.getElementById('rate-kind').dataset.marketAt }));
w.eval(fs.readFileSync(path.join(project, 'web/community.js'), 'utf8'));
w.eval(fs.readFileSync(path.join(project, 'web/app.js'), 'utf8') + ';window.__modelExport=mainHistoryExport;csvDownload=(...args)=>window.__download=args;');
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-10 * Math.max(1, Math.abs(b)), `${a} != ${b}`);
const flush = async () => { for (let i = 0; i < 200 && !published.length; i++) await new Promise(resolve => setTimeout(resolve, 5)); assert(published.length, 'No rendered snapshot event'); };
(async () => {
  try {
    await flush();
    const api = w.AstraGoodsNxBenchmark, expected = report.baseNxRate * report.latest.cpi / 100;
    assert(Object.isFrozen(api));
    assert.equal(Number(doc.getElementById('main-rate').textContent), Number(expected.toFixed(2)));
    assert.notEqual(doc.getElementById('main-rate').textContent, report.latest.nxRate.toFixed(2));
    close(Number(doc.getElementById('rate-change').textContent.replace(/[+%]/g, '')), Number((report.latest.cpi - 100).toFixed(1)));
    assert.match(doc.getElementById('overview-title').textContent, /Goods-inflation NX benchmark/);
    assert.match(doc.querySelector('.hero-model-note').textContent, /not an observed cash-sale or executable exchange quote/);
    assert.equal(doc.getElementById('rate-kind').dataset.marketAt, report.sourceUpdatedAt);
    assert.equal(published[0].rate, doc.getElementById('main-rate').textContent, 'arrival event runs after final headline render');
    assert.equal(published[0].at, report.sourceUpdatedAt);
    assert.equal(doc.querySelectorAll('#view-index [data-main-overlay]').length, 0);
    assert(doc.getElementById('view-index').contains(doc.getElementById('smega-section')), 'seller/buyer offers remain upfront');
    assert(doc.getElementById('view-nx').contains(doc.getElementById('reported-section')), 'reported cash history stays on cash page');
    assert.equal(doc.querySelector('[data-smega-comparison-toggle]').getAttribute('aria-pressed'), 'false');
    assert.equal(doc.querySelector('#comparison-card .comparison-row strong').textContent, '1:' + report.latest.nxRate.toFixed(1), 'cash page retains actual sale estimate');
    const points = [...doc.querySelectorAll('#main-chart circle[data-chart-value]')];
    const expectedHistory = report.history.filter(p => Number.isFinite(p.cpi) && p.cpi > 0);
    assert.equal(points.length, expectedHistory.length);
    points.forEach((point, i) => {
      const original = expectedHistory[i]; close(Number(point.dataset.chartValue), report.baseNxRate * original.cpi / 100);
      assert.equal(point.dataset.chartDate, original.at); assert.equal(point.dataset.chartDatePrecision, 'day');
      assert.equal(point.dataset.chartUnit, 'modelled mesos per NX'); assert.match(point.dataset.chartNote, /not an observed cash quote/);
    });
    doc.getElementById('export-history').click();
    let [filename, headers, rows] = w.__download;
    assert.equal(filename, 'inflation-watch-goods-nx-benchmark.csv');
    assert.equal(rows.length, points.length);
    assert(!headers.includes('nx_rate_mesos_per_nx'), 'model CSV does not mislabel actual cash fields');
    rows.forEach((row, i) => { const cell = Object.fromEntries(headers.map((key, j) => [key, row[j]]));
      close(cell.plotted_value, Number(points[i].dataset.chartValue)); assert.equal(cell.chart_time, points[i].dataset.chartDate);
      assert.equal(cell.unit, 'modelled_mesos_per_nx'); assert.equal(cell.formula, 'reference_nx_rate * goods_mpi / 100'); });
    doc.querySelector('[data-range="2"]').click(); doc.getElementById('export-history').click();
    assert.equal(w.__download[2].length, doc.querySelectorAll('#main-chart circle[data-chart-value]').length, 'CSV follows displayed source-based window');
    const selector = doc.getElementById('chart-metric'); selector.value = 'cpi'; selector.dispatchEvent(new w.Event('change'));
    doc.getElementById('export-history').click(); [filename, headers, rows] = w.__download;
    assert.equal(filename, 'inflation-watch-mpi-history.csv');
    assert(rows.every(row => row[headers.indexOf('unit')] === 'mpi_points'));
    assert(rows.every(row => row[headers.indexOf('plotted_value')] === row[headers.indexOf('goods_mpi')]));
    const synthetic = { baseNxRate: 10, latest: { cpi: 150, nxRate: 9999 }, sourceUpdatedAt: '2026-11-04T08:30:56Z', history: [
      { day: '2026-11-01', at: '2026-11-01T12:00:00Z', cpi: 100, nxRate: 1234 },
      { day: '2026-11-02', at: '2026-11-02T12:00:00Z', cpi: null, nxRate: 4567 },
      { day: '2026-11-03', at: '2026-11-03T12:00:00Z', nxRate: 8000 },
      { day: '2026-11-04', at: '2026-11-04T12:00:00Z', cpi: 200, nxRate: 9999 },
    ] };
    assert.deepEqual(JSON.parse(JSON.stringify(api.history(synthetic).map(p => [p.day, p.value]))), [['2026-11-01', 10], ['2026-11-04', 20]], 'missing MPI never borrows latest or cash rate');
    assert.equal(api.value(synthetic, undefined), null); assert.equal(api.value(synthetic, NaN), null); assert.equal(api.value({ baseNxRate: Infinity }, 100), null);
    const now = Date.parse('2026-11-05T12:00:00Z');
    let headline = api.headline({ ...synthetic, live: { observedAt: '2026-11-05T11:59:00Z', cpi: 200, nxRate: null } }, now);
    assert.equal(headline.rate, 20); assert.equal(headline.at, '2026-11-05T11:59:00Z'); assert.equal(headline.live, true);
    for (const live of [{ observedAt: '2026-11-05T11:59:00Z', cpi: null, nxRate: 9999 },
      { observedAt: '2026-11-05T11:20:00Z', cpi: 200 }, { observedAt: '2026-11-05T12:01:00Z', cpi: 200 }]) {
      headline = api.headline({ ...synthetic, live }, now); assert.equal(headline.rate, 15); assert.equal(headline.at, synthetic.sourceUpdatedAt); assert.equal(headline.live, false);
    }
    assert.equal(JSON.stringify(report), untouched, 'no data, weights, observed cash values or source clocks are rewritten');
    assert.equal(requests.length, 2, 'only the existing snapshot version/data reads'); assert.deepEqual(errors, []);
    console.log('PASS: goods benchmark Overview, qualified-MPI clocks and missing-point math, matching chart/CSV windows and units, preserved observed cash/offers/JSON, snapshot event after render');
  } finally { w.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
