const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { JSDOM, VirtualConsole } = require('jsdom');
const project = path.resolve(__dirname, '..');
const script = fs.readFileSync(path.join(project, 'web/nx-benchmark.js'), 'utf8');
const css = fs.readFileSync(path.join(project, 'web/nx-benchmark.css'), 'utf8');
const report = {
  baseNxRate: 10, baseStart: '2026-10-21', baseEnd: '2026-10-27',
  sourceUpdatedAt: '2026-11-04T08:30:56Z', sourceStatus: { status: 'degraded', checkedAt: '2026-11-05T11:43:00Z' },
  latest: { day: '2026-11-04', cpi: 200, nxRate: 25, partial: true },
  rows: [{ slug: 'synthetic-good', weight: 1 }], cash: [{ slug: 'synthetic-cash', nx: 100 }],
};
function fixture(initial = report, noViews = false) {
  const calls = { network: 0, storage: 0, ready: 0 }, errors = [], vc = new VirtualConsole();
  vc.on('jsdomError', error => errors.push(error.message));
  const html = noViews ? '<main></main>' : '<main><section id="view-method"><h1>Methodology</h1><div id="unchanged-comparison">Existing calculations</div></section><section id="view-nx"><h1>NX</h1><strong id="nx-headline">Observed headline</strong><table id="actual-nx-items"><tbody><tr><td>Actual best/worst items</td></tr></tbody></table></section></main><footer>Exact personal story.</footer>';
  const dom = new JSDOM(html, { url: 'https://inflation.gg/#nx', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window, doc = w.document;
  w.fetch = () => { calls.network++; throw Error('No HTTP'); };
  w.XMLHttpRequest = function () { calls.network++; throw Error('No XHR'); };
  w.navigator.sendBeacon = () => { calls.network++; throw Error('No analytics'); };
  for (const name of ['localStorage', 'sessionStorage']) Object.defineProperty(w, name, { get() { calls.storage++; throw Error('No new preferences'); } });
  const publish = value => doc.dispatchEvent(new w.CustomEvent('astramarketsnapshot', { detail: value }));
  doc.addEventListener('astramarkethighlightsready', () => { calls.ready++; if (initial) publish(initial); });
  const style = doc.createElement('style'); style.textContent = css; doc.head.append(style);
  w.eval(script);
  return { w, doc, calls, errors, publish, calculate: w.AstraNxBenchmark.calculate, close: () => w.close() };
}
const close = (a, b) => assert.ok(Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(b)), `${a} != ${b}`);
let f = fixture();
try {
  const original = JSON.stringify(report), result = f.calculate(report);
  assert(Object.isFrozen(result));
  assert.equal(result.modelBenchmarkRate, 20);
  assert.equal(result.observedGoodsAdjustedRate, 12.5);
  assert.equal(result.goodsBuyingPowerChange, 25);
  const base = f.calculate({ baseNxRate: 10, latest: { cpi: 100, nxRate: 10 } });
  assert.equal(base.modelBenchmarkRate, 10); assert.equal(base.observedGoodsAdjustedRate, 10); assert.equal(base.goodsBuyingPowerChange, 0);
  const inflation = f.calculate({ baseNxRate: 10, latest: { cpi: 200, nxRate: 10 } });
  assert.equal(inflation.modelBenchmarkRate, 20); assert.equal(inflation.observedGoodsAdjustedRate, 5); assert.equal(inflation.goodsBuyingPowerChange, -50);
  const deflation = f.calculate({ baseNxRate: 10, latest: { cpi: 50, nxRate: 10 } });
  assert.equal(deflation.modelBenchmarkRate, 5); assert.equal(deflation.observedGoodsAdjustedRate, 20); assert.equal(deflation.goodsBuyingPowerChange, 100);
  for (const value of [null, undefined, false, true, '10', 0, -1, NaN, Infinity, -Infinity]) {
    assert.equal(f.calculate({ ...report, baseNxRate: value }), null);
    assert.equal(f.calculate({ ...report, latest: { ...report.latest, cpi: value } }), null);
    assert.equal(f.calculate({ ...report, latest: { ...report.latest, nxRate: value } }), null);
  }
  assert.equal(f.calculate(null), null);
  assert.equal(f.calculate({}), null);
  assert.equal(f.calculate({ baseNxRate: Number.MAX_VALUE, latest: { cpi: Number.MAX_VALUE, nxRate: 10 } }), null);
  assert.equal(f.calculate({ baseNxRate: 10, latest: { cpi: Number.MIN_VALUE, nxRate: 10 } }), null);
  assert.equal(f.calls.ready, 1);
  assert.equal(f.doc.querySelectorAll('.nx-benchmark').length, 2);
  for (const section of f.doc.querySelectorAll('.nx-benchmark')) {
    assert.equal(section.parentElement.lastElementChild, section, 'comparison appends after the existing page');
    assert(f.doc.getElementById(section.getAttribute('aria-labelledby')));
    assert.equal(section.querySelector('.nx-benchmark-results').hidden, false);
    assert.equal(section.querySelector('[data-nx-benchmark="model"]').textContent, '1 NX ≈ 20 mesos');
    assert.equal(section.querySelector('[data-nx-benchmark="adjusted"]').textContent, '12.5 reference-week mesos / NX');
    assert.equal(section.querySelector('[data-nx-benchmark="change"]').textContent, '+25%');
    assert.match(section.textContent, /MODELLED BENCHMARK/);
    assert.match(section.textContent, /excludes cash items and cosmetics/);
    assert.match(section.textContent, /seasonal demand or supply/);
    assert.match(section.textContent, /outside the model/);
    assert.match(section.textContent, /not pooled indices/);
    assert.match(section.querySelector('.nx-benchmark-status').textContent, /2026-11-04 · partial source-calendar day/);
    assert.match(section.querySelector('.nx-benchmark-status').textContent, /degraded.*retained daily evidence/);
    assert.equal(f.w.getComputedStyle(section.querySelector('details p')).textAlign, 'left');
  }
  assert.equal(f.doc.getElementById('nx-headline').textContent, 'Observed headline');
  assert.equal(f.doc.getElementById('actual-nx-items').textContent, 'Actual best/worst items');
  assert.equal(f.doc.getElementById('unchanged-comparison').textContent, 'Existing calculations');
  assert.equal(f.doc.querySelector('footer').textContent, 'Exact personal story.');
  assert.equal(f.doc.querySelectorAll('select,input,button').length, 0, 'no pending default-measure selector is introduced');
  assert.equal(JSON.stringify(report), original);
  f.publish({ baseNxRate: 10, latest: { cpi: 150, nxRate: 30 } });
  assert.equal(f.doc.querySelector('[data-nx-benchmark="model"]').textContent, '1 NX ≈ 15 mesos');
  assert.equal(f.doc.querySelector('[data-nx-benchmark="adjusted"]').textContent, '20 reference-week mesos / NX');
  assert.equal(f.doc.querySelector('[data-nx-benchmark="change"]').textContent, '+100%');
  f.publish({});
  for (const section of f.doc.querySelectorAll('.nx-benchmark')) {
    assert.equal(section.querySelector('.nx-benchmark-results').hidden, true);
    assert.match(section.querySelector('.nx-benchmark-status').textContent, /unavailable/);
    assert.equal(section.querySelector('[data-nx-benchmark="model"]').textContent, '', 'invalid input clears old model numbers');
  }
  f.publish(report); f.w.eval(script);
  assert.equal(f.doc.querySelectorAll('.nx-benchmark').length, 2);
  assert.equal(f.calls.ready, 1);
  assert.equal(f.calls.network, 0); assert.equal(f.calls.storage, 0); assert.deepEqual(f.errors, []);
  const saved = JSON.parse(fs.readFileSync(path.join(project, 'dist/data.json'), 'utf8'));
  const actual = f.calculate(saved);
  close(actual.modelBenchmarkRate, saved.baseNxRate * saved.latest.cpi / 100);
  close(actual.observedGoodsAdjustedRate, saved.latest.nxRate / (saved.latest.cpi / 100));
  close(actual.goodsBuyingPowerChange, (saved.latest.nxRate / saved.baseNxRate / (saved.latest.cpi / 100) - 1) * 100);
} finally { f.close(); }
f = fixture(null, true);
try { assert.equal(f.doc.querySelectorAll('.nx-benchmark').length, 0); assert.equal(f.calls.ready, 0); assert.equal(f.calculate(report).modelBenchmarkRate, 20); assert.deepEqual(f.errors, []); } finally { f.close(); }
// Selected rolling/fixed model propagates to both Method and NX comparisons;
// raw observed cash evidence and the frozen goods weights remain separate.
const current=JSON.parse(fs.readFileSync(path.join(project,'dist/data.json'),'utf8'));
f=fixture(current);
try{
  const untouched=JSON.stringify(current),options=f.doc.createElement('details');options.id='display-options';f.doc.body.prepend(options);
  f.w.eval(fs.readFileSync(path.join(project,'web/rolling-benchmark-preview.js'),'utf8'));
  f.publish(current);
  const rolling=f.w.AstraRollingBenchmark,model=rolling.calculate(current),values=f.calculate(current);
  close(values.modelBenchmarkRate,model.rate);close(values.observedGoodsAdjustedRate,current.latest.nxRate/(current.latest.cpi/model.meanMpi));
  close(values.goodsBuyingPowerChange,(current.latest.nxRate/model.rate-1)*100);
  for(const section of f.doc.querySelectorAll('.nx-benchmark')){
    assert(section.querySelector('[data-nx-benchmark="model"]').textContent.includes(model.rate.toLocaleString('en-US',{maximumFractionDigits:2})));
    assert(section.querySelector('[data-nx-benchmark="adjusted"]').textContent.includes('anchor-period mesos'));
    assert(section.querySelector('.nx-benchmark-inputs').textContent.includes(model.startDay+'–'+model.endDay));
    assert(section.querySelector('.nx-benchmark-inputs').textContent.includes(current.baseStart+'–'+current.baseEnd));
    assert(section.querySelector('[data-nx-model-formula]').textContent.includes('arithmetic mean MPI'));
    assert(section.querySelector('[data-nx-model-limit]').textContent.includes('does not remove seasonal cash-market effects'));
    assert.equal(section.querySelector('details').open,false);
  }
  rolling.setWindowDays(3);const three=rolling.calculate(current);close(f.calculate(current).modelBenchmarkRate,three.rate);assert.equal(f.calculate(current).windowDays,3);
  assert(f.doc.querySelector('[data-nx-model-formula]').textContent.includes('prior-3-complete-day'));assert(f.doc.querySelector('[data-nx-model-formula]').textContent.includes('all 4 goods points'));assert(!f.doc.querySelector('[data-nx-model-formula]').textContent.includes('seven'));
  assert(f.doc.querySelector('.nx-benchmark-inputs').textContent.includes(three.startDay+'–'+three.endDay));rolling.setWindowDays(7);
  rolling.setMode('fixed');close(f.calculate(current).modelBenchmarkRate,current.baseNxRate*current.latest.cpi/100);
  assert(f.doc.querySelector('[data-nx-benchmark="adjusted"]').textContent.includes('reference-week mesos'));
  rolling.setMode('compare');assert(f.doc.querySelector('.nx-benchmark-intro').textContent.includes('headline remains fixed-reference'));
  rolling.setMode('rolling');f.doc.querySelector('[aria-controls="rolling-benchmark-explanation"]').click();
  assert([...f.doc.querySelectorAll('.nx-benchmark details')].every(detail=>detail.open));
  f.doc.querySelector('[aria-controls="rolling-benchmark-explanation"]').click();assert([...f.doc.querySelectorAll('.nx-benchmark details')].every(detail=>!detail.open));
  assert.equal(f.doc.getElementById('actual-nx-items').textContent,'Actual best/worst items');assert.equal(JSON.stringify(current),untouched);assert.equal(f.calls.network,0);assert.deepEqual(f.errors,[]);
}finally{f.close();}
assert.doesNotMatch(css, /@import|https?:\/\/|url\(/);
assert(css.includes(':focus-visible'));
console.log('PASS: modelled NX benchmark and goods buying power, strict finite-input math, in-memory updates/unknowns, explicit units/limitations, unchanged headlines/tables/clocks and zero HTTP/storage');
