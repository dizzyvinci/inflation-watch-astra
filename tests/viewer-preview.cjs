const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { JSDOM, VirtualConsole } = require('jsdom');
const root = path.resolve(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'web/viewer-preview.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'web/viewer-preview.css'), 'utf8');
const markers = fs.readFileSync(path.join(root, 'web/preview-controls.css'), 'utf8');
const html = `<nav><a href="#price-check" id="price-nav">Price check</a><button id="scenery-toggle" aria-pressed="true">Scenery</button></nav>
<main><details id="display-options" open><summary>Personal display options</summary><div class="hero-layout-options"><button aria-pressed="true" data-selected-layout="offers">Offers beside rate</button></div></details>
<section id="view-index"><div class="category-value-options" id="category-value-options"><button aria-pressed="true">Both values</button></div><div class="basket-view-controls"><div id="basket-layout"><button aria-pressed="true">Tiles</button></div></div><div class="chart-comparison-controls"><button aria-pressed="true">Existing selected chart comparison</button></div><div class="smega-comparison-controls"><button aria-pressed="false">Offers comparison</button></div><div class="panel-size-options" data-preview-controls="true"><input value="large"></div>
<div id="critical-controls"><input id="search" type="search" value="scroll"><select id="date-window"><option selected>7 days</option></select><input id="calculator" type="number" value="250"><button id="sort-button">Sort</button><span id="source-status">Last source observation: Nov 4</span></div>
<div id="chart"><svg id="source-svg"><circle data-chart-value="19.30714854735594"></circle></svg><div class="chart-inspector-ui"><button class="chart-inspector-toggle">Follow pointer</button><output class="chart-inspector-tooltip" hidden>Original chart tooltip</output></div></div></section>
<section id="view-privacy" hidden><h1>Privacy policy</h1><div class="privacy-controls-panel" data-preview-controls="true"><p id="policy-state">Optional metrics On</p><div class="privacy-choice-options" data-preview-controls="true"><button id="policy-off" aria-pressed="false">Off</button><button aria-pressed="true">On</button></div></div></section></main>
<footer><article class="footer-story"><p>Exact personal paragraph.</p><p>Optional metrics are On. <a id="footer-policy" href="#privacy">Privacy policy</a>.</p></article><section class="author-portrait"><img id="original-portrait" alt="Selected transparent portrait"><p class="footer-signature">— DishWasher</p><div class="author-portrait-options"><button aria-pressed="true">Large transparent</button></div></section><div class="community-footer-styles"><button aria-pressed="true">Personal</button></div><section id="privacy-controls"><p id="footer-state">Optional metrics On</p><div class="privacy-choice-options"><button aria-pressed="true">On</button></div></section><form id="preview-lock" action="/__preview_logout" method="post"><button>Lock preview</button></form></footer>`;

function fixture(markup = html) {
  const errors = [], calls = { network: 0, storage: 0, privacy: 0, hover: 0, sort: 0 }, vc = new VirtualConsole();
  vc.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM(markup, { url: 'https://inflation.gg/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: vc });
  const w = dom.window, doc = w.document;
  w.fetch = () => { calls.network++; throw Error('No HTTP'); };
  w.XMLHttpRequest = function () { calls.network++; throw Error('No XHR'); };
  w.navigator.sendBeacon = () => { calls.network++; throw Error('No beacon'); };
  for (const name of ['localStorage', 'sessionStorage']) Object.defineProperty(w, name, { get() { calls.storage++; throw Error('No storage access'); } });
  Object.assign(doc.body.dataset, { bannerLayout: 'offers', bannerOrder: 'rate-first', colorScheme: 'moonlit', sceneryMode: 'zakum' });
  doc.body.className = 'scenery-on';
  const style = doc.createElement('style'); style.textContent = markers + '\n' + css; doc.head.append(style);
  doc.getElementById('footer-policy')?.addEventListener('click', event => { event.preventDefault(); doc.getElementById('view-index').hidden = true; doc.getElementById('view-privacy').hidden = false; });
  doc.getElementById('policy-off')?.addEventListener('click', () => { calls.privacy++; doc.getElementById('policy-state').textContent = 'Optional metrics Off'; doc.getElementById('footer-state').textContent = 'Optional metrics Off'; });
  doc.getElementById('source-svg')?.addEventListener('pointermove', () => { calls.hover++; doc.querySelector('.chart-inspector-tooltip').hidden = false; });
  doc.getElementById('sort-button')?.addEventListener('click', () => calls.sort++);
  w.eval(script);
  return { w, doc, calls, errors, close: () => w.close() };
}
const visible = (f, node) => { for (let at = node; at; at = at.parentElement) if (at.hidden || f.w.getComputedStyle(at).display === 'none') return false; return true; };
let f = fixture();
try {
  const { doc, w, calls } = f, enter = doc.getElementById('viewer-preview-enter'), exit = doc.getElementById('viewer-preview-exit');
  const designBefore = JSON.stringify(doc.body.dataset), storyBefore = doc.querySelector('.footer-story').outerHTML;
  const nodes = ['display-options', 'scenery-toggle', 'search', 'date-window', 'calculator', 'source-svg', 'original-portrait'].map(id => doc.getElementById(id));
  const choices = [...doc.querySelectorAll('[aria-pressed]')].map(node => [node, node.getAttribute('aria-pressed')]);
  assert(enter); assert(!enter.closest('#display-options')); assert(visible(f, enter)); assert.equal(exit.hidden, true);
  assert.equal(doc.body.dataset.viewerPreview, undefined);
  enter.focus(); enter.click();
  assert.equal(doc.body.dataset.viewerPreview, 'on'); assert.equal(doc.activeElement, exit);
  assert.match(w.getComputedStyle(exit).outline,/2px solid/,'keyboard focus keeps its visible non-red cue');
  assert.equal(visible(f, enter), false); assert(visible(f, exit)); assert.match(exit.textContent, /Exit viewer preview/);
  for (const selector of ['#display-options', '#scenery-toggle', '#category-value-options', '.basket-view-controls', '.chart-comparison-controls', '.smega-comparison-controls', '[data-preview-controls]', '.author-portrait-options', '.community-footer-styles', 'footer #privacy-controls', '.chart-inspector-toggle']) {
    for (const node of doc.querySelectorAll(selector)) if (!node.closest('#view-privacy')) assert.equal(visible(f, node), false, selector);
  }
  assert.equal(doc.getElementById('display-options').open, true, 'selected open/closed state is not reset');
  for (const [node, value] of choices) assert.equal(node.getAttribute('aria-pressed'), value);
  for (const node of nodes) assert.equal(doc.getElementById(node.id), node, 'no source/control/image nodes are replaced');
  assert.equal(doc.querySelector('.footer-story').outerHTML, storyBefore);
  assert.equal(doc.getElementById('footer-state').textContent, 'Optional metrics On', 'hidden consent widget is not an Off action');
  assert.equal(w.getComputedStyle(doc.querySelector('.chart-inspector-ui')).outline, 'none');
  assert(visible(f, doc.getElementById('source-svg'))); doc.getElementById('source-svg').dispatchEvent(new w.Event('pointermove'));
  assert.equal(calls.hover, 1); assert(visible(f, doc.querySelector('.chart-inspector-tooltip')), 'hover tooltip stays usable');
  for (const id of ['search', 'date-window', 'calculator', 'sort-button', 'source-status', 'price-nav', 'preview-lock']) assert(visible(f, doc.getElementById(id)), id);
  doc.getElementById('sort-button').click(); assert.equal(calls.sort, 1);
  assert.equal(doc.getElementById('search').value, 'scroll'); assert.equal(doc.getElementById('calculator').value, '250');
  const dynamic = doc.createElement('div'); dynamic.dataset.previewControls = 'true'; dynamic.innerHTML = '<button aria-pressed="true">New preview group</button>'; doc.body.append(dynamic);
  assert.equal(visible(f, dynamic), false, 'new generic editing groups are hidden by CSS without observer/fetch');
  assert.equal(w.getComputedStyle(dynamic).outline, 'none');
  doc.getElementById('footer-policy').click();
  const realOptions = doc.querySelector('#view-privacy .privacy-choice-options');
  assert(visible(f, realOptions)); assert.equal(w.getComputedStyle(realOptions).outline, 'none', 'real privacy controls lose only the red preview outline');
  doc.getElementById('policy-off').click(); assert.equal(calls.privacy, 1); assert.equal(doc.getElementById('policy-state').textContent, 'Optional metrics Off');
  exit.click(); assert.equal(doc.body.dataset.viewerPreview, undefined); assert.equal(doc.activeElement, enter);
  assert.equal(JSON.stringify(doc.body.dataset), designBefore); assert.equal(doc.body.className, 'scenery-on');
  assert(visible(f, dynamic)); assert.equal(doc.getElementById('policy-state').textContent, 'Optional metrics Off', 'an explicit real privacy action survives mode changes');
  assert.equal(doc.querySelector('.footer-story').outerHTML, storyBefore);
  enter.click(); w.eval(script); assert.equal(doc.querySelectorAll('#viewer-preview-enter').length, 1); assert.equal(doc.querySelectorAll('#viewer-preview-exit').length, 1);
  const escape = new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }); doc.dispatchEvent(escape);
  assert.equal(escape.defaultPrevented, true); assert.equal(doc.body.dataset.viewerPreview, undefined); assert.equal(doc.activeElement, enter);
  const editingEscape = new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }); doc.dispatchEvent(editingEscape); assert.equal(editingEscape.defaultPrevented, false);
  doc.getElementById('view-index').hidden = false; doc.getElementById('search').focus(); enter.click(); exit.click(); assert.equal(doc.activeElement.id, 'search', 'prior focus is restored');
  doc.getElementById('search').focus(); enter.click(); doc.getElementById('search').remove(); exit.click(); assert.equal(doc.activeElement, enter, 'removed focus target falls back to entry');
  assert.equal(calls.network, 0); assert.equal(calls.storage, 0); assert.deepEqual(f.errors, []);
} finally { f.close(); }
f = fixture(); try { assert.equal(f.doc.body.dataset.viewerPreview, undefined, 'new page starts in editing mode'); assert(visible(f, f.doc.getElementById('viewer-preview-enter'))); } finally { f.close(); }
f = fixture('<main>No personal options</main>'); try { assert.equal(f.doc.getElementById('viewer-preview-enter'), null); assert.equal(f.calls.network, 0); assert.deepEqual(f.errors, []); } finally { f.close(); }
assert.doesNotMatch(css, /@import|https?:\/\/|url\(/);
assert.doesNotMatch(css,/body\[data-viewer-preview="on"\]\s+\*/,'no blanket removal of keyboard focus outlines');
console.log('PASS: tab-only viewer mode, hidden dynamic editing groups/red markers, selected design/node identity retained, live chart hover, functional real privacy controls, Escape/focus restoration and zero HTTP/storage');
