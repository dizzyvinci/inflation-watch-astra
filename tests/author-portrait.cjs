const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'web/author-portrait.js'), 'utf8');
const key = 'inflation-author-portrait-v2';
const chef = '👨‍🍳';

function fixture({ saved, blocked = false, noSignature = false } = {}) {
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'web/index.html'), 'utf8'), {
    url: 'https://inflation.gg/#privacy', runScripts: 'outside-only', pretendToBeVisual: true,
  });
  const w = dom.window, doc = w.document, preferences = new Map(saved === undefined ? [] : [[key, saved]]);
  const calls = { fetch: 0, beacon: 0, xhr: 0, writes: [] };
  w.fetch = () => { calls.fetch++; throw new Error('Unexpected request'); };
  w.XMLHttpRequest = function () { calls.xhr++; throw new Error('Unexpected request'); };
  w.navigator.sendBeacon = () => { calls.beacon++; throw new Error('Unexpected beacon'); };
  Object.defineProperty(w, 'localStorage', { value: {
    getItem(name) { if (blocked) throw new Error('Storage blocked'); return preferences.get(name) ?? null; },
    setItem(name, value) { if (blocked) throw new Error('Storage blocked'); calls.writes.push([name, value]); preferences.set(name, value); },
  } });
  w.eval(fs.readFileSync(path.join(root, 'web/community.js'), 'utf8'));
  // Existing privacy placement is independent and must remain after portrait insertion.
  const privacy = doc.createElement('section'); privacy.id = 'privacy-controls'; doc.querySelector('footer').append(privacy);
  const paragraphs = [...doc.querySelectorAll('.footer-story>p'),doc.querySelector('.footer-signature')].filter(Boolean).map(node => ({ node, text: node.textContent, html: node.outerHTML }));
  if (noSignature) doc.querySelector('.footer-signature').remove();
  const style = doc.createElement('style'); style.textContent = fs.readFileSync(path.join(root, 'web/author-portrait.css'), 'utf8'); doc.head.append(style);
  w.eval(script);
  return { dom, w, doc, preferences, calls, paragraphs, close: () => dom.window.close() };
}
const image = f => f.doc.querySelector('#author-portrait img');
const load = f => image(f).dispatchEvent(new f.w.Event('load'));
const choose = (f, mode) => f.doc.querySelector(`button[data-author-portrait="${mode}"]`).click();
const assertUnchangedWords = f => {
  for (const paragraph of f.paragraphs) {
    if (!paragraph.node.classList.contains('footer-signature')) assert.equal(paragraph.node.outerHTML, paragraph.html);
    else assert.equal(paragraph.node.textContent, paragraph.text.replace(chef, ''));
  }
};

const f = fixture();
assert.equal(f.doc.querySelectorAll('#author-portrait').length, 1);
assert.equal(f.doc.querySelectorAll('#author-portrait img').length, 1);
assert.equal(image(f).getAttribute('src'), '/assets/dishwasher-transparent-v2.png');
assert(image(f).alt.includes('Large transparent')); assert.equal(image(f).getAttribute('srcset'), null);
assert.equal(f.doc.getElementById('author-portrait').dataset.portraitMode,'transparent-large');
assert.equal(f.calls.writes.length,0,'implicit default does not overwrite an explicit saved preference');
assert.equal(f.doc.querySelector('.author-portrait-frame').hidden, true);
assert(f.doc.querySelector('.footer-signature').textContent.includes(chef), 'failed/unloaded image must not remove the existing emoji');
assert.equal(f.w.getComputedStyle(image(f)).objectFit, 'contain');
assert.equal(f.w.getComputedStyle(f.doc.querySelector('.author-portrait-frame')).width, '380px');
assert.equal(f.doc.querySelector('.author-portrait-options').getAttribute('role'), 'group');
assert.equal(f.doc.querySelector('.author-portrait-feedback').closest('.author-portrait-options'),f.doc.querySelector('.author-portrait-options'),'portrait editing status belongs to the hidden-with-controls group');
assert.deepEqual([...f.doc.querySelectorAll('[data-author-portrait]')].map(node => node.textContent), ['Original', 'Transparent', 'Large transparent', 'Pixelart']);
assert.equal(f.doc.querySelector('.footer-signature').parentElement.id,'author-portrait');
assert.equal(f.doc.querySelector('.footer-signature').previousElementSibling.className,'author-portrait-figure','signature follows the original portrait figure');
assert(f.doc.querySelector('.footer-author>#author-portrait'),'portrait stays in the separate right column');
assert(f.doc.querySelector('.footer-author .footer-signature'),'signature stays under the image in the right column');
assert.equal(f.doc.querySelector('.footer-story .footer-signature'),null);
assert.equal(f.doc.querySelector('.footer-story .footer-reuse').previousElementSibling.textContent,'A shared responsibility to look out for one another.');
assert.equal(f.doc.querySelectorAll('.footer-signature').length,1,'the original signature is moved rather than copied');
assert.equal(f.doc.querySelector('.footer-signature'),f.paragraphs.find(row=>row.node.classList.contains('footer-signature')).node);
assert.equal(f.doc.querySelector('.footer-story .author-portrait'),null);
assert.equal(f.w.getComputedStyle(f.doc.querySelector('.author-portrait')).alignItems,'flex-start');
assert.equal(f.doc.querySelector('#author-portrait').lastElementChild.className,'author-portrait-options','portrait toggles come last after image and signature content');
load(f); assert.equal(f.doc.querySelector('.author-portrait-frame').hidden, false); assertUnchangedWords(f);
const originalImage = image(f);
choose(f, 'transparent'); assert.equal(image(f).getAttribute('src'), '/assets/dishwasher-transparent-v2.png');
assert.equal(f.preferences.get(key), 'transparent'); assert.equal(f.doc.querySelectorAll('#author-portrait img').length, 1);
assert(f.doc.querySelector('.footer-signature').textContent.includes(chef));
originalImage.dispatchEvent(new f.w.Event('load')); assert.equal(f.doc.querySelector('.author-portrait-frame').hidden, true, 'stale image event must not show the wrong source');
load(f); assert(image(f).alt.includes('Transparent')); assertUnchangedWords(f);
assert.equal(f.w.getComputedStyle(f.doc.querySelector('.author-portrait-frame')).backgroundColor,'rgba(0, 0, 0, 0)');
assert.equal(f.w.getComputedStyle(f.doc.querySelector('.author-portrait-frame')).borderTopWidth,'0px');
choose(f,'transparent-large');load(f);
assert.equal(image(f).getAttribute('src'),'/assets/dishwasher-transparent-v2.png');
assert.equal(f.preferences.get(key),'transparent-large');
assert.equal(f.w.getComputedStyle(f.doc.querySelector('.author-portrait-frame')).width,'380px');
assert.equal(f.w.getComputedStyle(f.doc.querySelector('.author-portrait-frame')).backgroundColor,'rgba(0, 0, 0, 0)');assertUnchangedWords(f);
choose(f, 'pixelart'); assert.equal(image(f).getAttribute('src'), '/assets/dishwasher-pixel-v2.png');
assert.equal(f.w.getComputedStyle(image(f)).imageRendering, 'pixelated'); load(f); assertUnchangedWords(f);
assert.equal(f.doc.querySelectorAll('[data-author-portrait][aria-pressed="true"]').length, 1);
assert.equal(f.preferences.get(key), 'pixelart');
assert.equal(f.doc.querySelector('footer').dataset.footerStyle, 'emphasis');
assert(f.doc.querySelector('.footer-story').compareDocumentPosition(f.doc.getElementById('privacy-controls')) & f.w.Node.DOCUMENT_POSITION_FOLLOWING);
f.doc.querySelector('[data-footer-style-choice="personal"]').click();
assert.equal(f.doc.querySelector('footer').dataset.footerStyle, 'personal');
assert.equal(f.doc.getElementById('author-portrait').dataset.portraitMode, 'pixelart');
assertUnchangedWords(f);
f.w.eval(script); assert.equal(f.doc.querySelectorAll('#author-portrait').length, 1); assert.equal(f.doc.querySelectorAll('#author-portrait img').length, 1);
assert.equal(f.calls.fetch, 0); assert.equal(f.calls.beacon, 0); assert.equal(f.calls.xhr, 0); f.close();

for (const mode of ['original', 'transparent', 'transparent-large', 'pixelart']) {
  const restored = fixture({ saved: mode }); assert.equal(restored.doc.getElementById('author-portrait').dataset.portraitMode, mode);
  assert.equal(restored.doc.querySelectorAll('#author-portrait img').length, 1); load(restored); assertUnchangedWords(restored); restored.close();
}
for (const options of [{ saved: 'unknown' }, { saved: 'pixelart', blocked: true }]) {
  const safe = fixture(options); assert.equal(safe.doc.getElementById('author-portrait').dataset.portraitMode, 'transparent-large');
  choose(safe, 'transparent'); load(safe); assertUnchangedWords(safe); safe.close();
}
const failed = fixture(); image(failed).dispatchEvent(new failed.w.Event('error'));
assert.equal(failed.doc.querySelector('.author-portrait-frame').hidden, true);
assert.equal(failed.doc.querySelector('.footer-signature').textContent, failed.paragraphs.find(row => row.node.classList.contains('footer-signature')).text);
assert(failed.doc.querySelector('.author-portrait-feedback').textContent.includes('unavailable'));
choose(failed, 'pixelart'); load(failed); assertUnchangedWords(failed); failed.close();
const absent = fixture({ noSignature: true }); assert.equal(absent.doc.getElementById('author-portrait'), null); absent.close();

console.log('PASS: selected-only local portrait, contain/pixel rendering, delayed emoji replacement, failure/stale-event safety, saved choices, unchanged footer words and independent style/privacy sections');
