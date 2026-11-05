const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

const script = fs.readFileSync(path.join(__dirname, '../web/chart-interaction.js'), 'utf8');
const markup = `<svg viewBox="0 0 100 100" preserveAspectRatio="none"><title>Market chart</title>
 <defs><clipPath id="plot"><rect x="5" y="10" width="90" height="80"/></clipPath></defs>
 <circle cx="10" cy="50" data-chart-series="Daily median" data-chart-date="2026-10-14" data-chart-date-precision="day" data-chart-value="12.3456789012345" data-chart-unit="mesos per NX"><title>rounded fallback</title></circle>
 <circle cx="50" cy="20" data-chart-label="Seller asks · exact source hour · 20.5 mesos per NX"/>
 <circle cx="50" cy="80" data-chart-label="Buyer bids · exact source hour · 13.75 mesos per NX"/>
 <circle cx="90" cy="60"><title>Native label · Oct 15 · source time unspecified: 9.00 mesos</title></circle>
</svg>`;
const dom = new JSDOM(`<div id="plot-host" class="chart" aria-label="Rates">${markup}</div><div class="chart" id="empty"><svg><path d="M0 0"/></svg></div>`, {
  url: 'https://inflation.gg/', runScripts: 'outside-only', pretendToBeVisual: true,
});
const w = dom.window;
let network = 0;
let storage = 0;
w.fetch = () => { network++; throw new Error('Unexpected network'); };
w.XMLHttpRequest = function () { network++; throw new Error('Unexpected network'); };
w.navigator.sendBeacon = () => { network++; throw new Error('Unexpected beacon'); };
Object.defineProperty(w, 'localStorage', { get() { storage++; throw new Error('Unexpected storage'); } });
Object.defineProperty(w, 'sessionStorage', { get() { storage++; throw new Error('Unexpected storage'); } });
const doc = w.document;
const host = doc.getElementById('plot-host');
host.getBoundingClientRect = () => ({ left: 10, top: 20, width: 200, height: 100 });
Object.defineProperty(host, 'clientWidth', { value: 200 });
function geometry(svg, aspect = 'none') {
  svg.getBoundingClientRect = () => ({ left: 10, top: 20, width: 200, height: 100 });
  svg.setAttribute('preserveAspectRatio', aspect);
}
let svg = host.querySelector('svg');
geometry(svg);
const pointer = (type, x, y, pointerType = 'mouse') => {
  const event = new w.MouseEvent(type, { bubbles: true, clientX: x, clientY: y });
  Object.defineProperty(event, 'pointerType', { value: pointerType });
  svg.dispatchEvent(event);
};
const key = value => svg.dispatchEvent(new w.KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true }));
const tooltip = () => host.querySelector('.chart-inspector-tooltip');
const flush = () => new Promise(resolve => setImmediate(resolve));

(async () => {
  w.eval(script);
  await flush();
  assert.equal(host.querySelectorAll('.chart-inspector-toggle').length, 1);
  assert.equal(doc.getElementById('empty').querySelector('.chart-inspector-toggle'), null);
  assert.equal(svg.getAttribute('tabindex'), '0');
  assert(svg.getAttribute('aria-describedby').includes('-help'));
  assert.equal(tooltip().getAttribute('role'), 'status');
  pointer('pointermove', 30, 70);
  assert.equal(tooltip().hidden, false);
  assert.match(tooltip().textContent, /12\.3456789012345 mesos per NX/);
  assert.match(tooltip().textContent, /2026-10-14 · source time unspecified/);
  assert.doesNotMatch(tooltip().textContent, /12:00|UTC|rounded fallback/);
  let crosshair = svg.querySelector('.chart-inspector-guide line');
  assert.equal(crosshair.getAttribute('x1'), '10');
  assert.equal(crosshair.getAttribute('y1'), '10');
  assert.equal(crosshair.getAttribute('y2'), '90');

  // CSS scales x twofold; overlapping series at x50 use the nearest y.
  pointer('pointermove', 110, 94);
  assert.match(tooltip().textContent, /Buyer bids/);
  assert.equal(crosshair.getAttribute('x1'), '50');
  pointer('pointermove', 110, 38);
  assert.match(tooltip().textContent, /Seller asks/);
  pointer('click', 110, 94, 'touch');
  assert.match(tooltip().textContent, /Buyer bids.*pinned/);
  pointer('pointermove', 30, 70);
  assert.match(tooltip().textContent, /Buyer bids/);
  pointer('pointerleave', 500, 500);
  assert.equal(tooltip().hidden, false);
  key('Escape');
  assert.equal(tooltip().hidden, true);
  key('Home');
  assert.match(tooltip().textContent, /12\.3456789012345/);
  key('ArrowRight');
  assert.match(tooltip().textContent, /Seller asks/);
  key('ArrowDown');
  assert.match(tooltip().textContent, /Buyer bids/);
  key('End');
  assert.equal(tooltip().textContent, 'Native label · Oct 15 · source time unspecified: 9.00 mesos');
  key(' ');
  assert.match(tooltip().textContent, /pinned/);
  key('ArrowLeft');
  assert.match(tooltip().textContent, /Buyer bids.*pinned/);
  key('Escape');
  host.querySelector('.chart-inspector-toggle').click();
  assert.equal(host.querySelector('.chart-inspector-toggle').getAttribute('aria-pressed'), 'false');
  pointer('pointermove', 30, 70);
  assert.equal(tooltip().hidden, true);
  key('Home');
  assert.equal(tooltip().hidden, false, 'keyboard inspection works with pointer follow off');

  // A replacement chart has one fresh inspector and no stale pinned state.
  key(' ');
  const oldSvg = svg;
  const replacement = doc.createElement('div');
  replacement.innerHTML = markup;
  svg = replacement.querySelector('svg');
  geometry(svg, 'xMidYMid meet');
  oldSvg.replaceWith(svg);
  await flush();
  assert.equal(host.querySelectorAll('.chart-inspector-ui').length, 1);
  assert.equal(host.querySelectorAll('.chart-inspector-guide').length, 1);
  assert.equal(host.classList.contains('chart-inspector-pinned'), false);
  assert.equal(tooltip().hidden, true);
  // Default meet introduces a 50px horizontal inset, unlike preserve=none.
  pointer('pointermove', 70, 70);
  assert.equal(svg.querySelector('.chart-inspector-guide line').getAttribute('x1'), '10');
  assert.match(tooltip().textContent, /12\.3456789012345/);
  assert(Number.parseFloat(tooltip().style.left) >= 8);
  w.eval(script);
  await flush();
  assert.equal(host.querySelectorAll('.chart-inspector-ui').length, 1);
  assert.equal(network, 0);
  assert.equal(storage, 0);
  assert.equal(doc.cookie, '');
  dom.window.close();
  console.log('PASS: SVG coordinate mapping, exact labels/day precision, series selection, keyboard, pin/follow, rerender deduplication and no network/storage');
})().catch(error => { console.error(error); process.exitCode = 1; dom.window.close(); });
