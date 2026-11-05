const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

const script = fs.readFileSync(path.join(__dirname, '../web/community.js'), 'utf8');
function fixture() {
  const dom = new JSDOM('<main id="content"></main><footer><p id="credits">Game art © Nexon</p><div class="footer-links"><a href="#privacy">Privacy</a></div></footer>', {
    url: 'https://inflation.gg/', runScripts: 'outside-only', pretendToBeVisual: true,
  });
  const w = dom.window;
  const calls = { network: 0, storage: 0, reads: 0, writes: [] };
  w.fetch = () => { calls.network++; throw new Error('No network allowed'); };
  w.XMLHttpRequest = function () { calls.network++; throw new Error('No network allowed'); };
  w.navigator.sendBeacon = () => { calls.network++; throw new Error('No beacon allowed'); };
  Object.defineProperty(w, 'localStorage', { get() { calls.storage++; throw new Error('No persistence allowed'); } });
  Object.defineProperty(w, 'sessionStorage', { get() { calls.storage++; throw new Error('No persistence allowed'); } });
  Object.defineProperty(w.navigator, 'clipboard', { configurable: true, value: {
    writeText: async text => { calls.writes.push(text); },
    readText: async () => { calls.reads++; throw new Error('No clipboard reads'); },
  } });
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new w.Event('close')); };
  w.eval(script);
  return { dom, w, doc: w.document, calls };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

(async () => {
  const { dom, w, doc, calls } = fixture();
  const privacy = doc.getElementById('view-privacy');
  assert(privacy && privacy.classList.contains('view'));
  assert.equal(privacy.hidden, true);
  assert.equal(privacy.parentElement.id, 'content');
  assert.equal(privacy.getAttribute('aria-labelledby'), 'privacy-title');
  assert.match(privacy.textContent, /Draft privacy note/);
  assert.match(privacy.textContent, /request count is not a count of distinct visitors/i);
  assert.match(privacy.textContent, /localStorage/);
  assert.match(privacy.textContent, /security cookies/);
  assert.equal(privacy.querySelector('.community-back').getAttribute('href'), '#index');
  assert.equal(doc.getElementById('credits').textContent, 'Game art © Nexon');
  assert.equal(doc.querySelectorAll('footer #open-contact').length, 1);
  assert.equal(doc.getElementById('contact-message').value, '');
  assert.equal(doc.getElementById('copy-contact-message').disabled, true);
  assert.deepEqual(calls.writes, []);

  const dialog = doc.getElementById('contact-dialog');
  doc.getElementById('open-contact').click();
  assert.equal(dialog.open, true);
  assert.equal(doc.getElementById('contact-title').textContent, 'Hey, it’s Dish 👨‍🍳. What’s on your mind?');
  assert.match(dialog.textContent, /DishWasher/);
  assert.match(dialog.textContent, /optional message stays in this tab unless you copy it/);
  const external = dialog.querySelector('.community-discord');
  assert.equal(external.href, 'https://discord.com/channels/@me');
  assert.equal(external.target, '_blank');
  assert.deepEqual(external.rel.split(' ').sort(), ['noopener', 'noreferrer']);
  assert.equal(dialog.querySelector('form'), null);
  assert.equal(dialog.querySelector('iframe'), null);
  assert.equal(doc.querySelector('a[href*="discord.com/users/"]'), null);

  doc.getElementById('copy-contact-username').click();
  await flush();
  assert.deepEqual(calls.writes, ['dizzyvinci']);
  assert.match(doc.getElementById('contact-feedback').textContent, /Username copied/);
  const textarea = doc.getElementById('contact-message');
  textarea.value = 'Hi Dish!\nI noticed a price change.';
  textarea.dispatchEvent(new w.Event('input'));
  assert.equal(doc.getElementById('copy-contact-message').disabled, false);
  assert.equal(calls.writes.length, 1, 'typing must not copy or send');
  doc.getElementById('copy-contact-message').click();
  await flush();
  assert.equal(calls.writes[1], textarea.value);
  assert.match(doc.getElementById('contact-feedback').textContent, /Message copied/);
  doc.getElementById('close-contact').click();
  assert.equal(dialog.open, false);
  assert.equal(textarea.value, 'Hi Dish!\nI noticed a price change.', 'message stays only in current tab memory');
  privacy.querySelector('[data-open-contact]').click();
  assert.equal(dialog.open, true);

  Object.defineProperty(w.navigator, 'clipboard', { configurable: true, value: {
    writeText: async () => { throw new Error('Permission denied'); },
  } });
  doc.getElementById('copy-contact-username').click();
  await flush();
  assert.match(doc.getElementById('contact-feedback').textContent, /Couldn’t copy automatically/);
  assert.equal(doc.getElementById('contact-username').textContent, '@dizzyvinci');
  textarea.value = '   ';
  textarea.dispatchEvent(new w.Event('input'));
  assert.equal(doc.getElementById('copy-contact-message').disabled, true);

  w.eval(script);
  assert.equal(doc.querySelectorAll('#view-privacy').length, 1);
  assert.equal(doc.querySelectorAll('#contact-dialog').length, 1);
  assert.equal(doc.querySelectorAll('#open-contact').length, 1);
  assert.equal(calls.network, 0);
  assert.equal(calls.storage, 0);
  assert.equal(calls.reads, 0);
  assert.equal(doc.cookie, '');
  const another = fixture();
  assert.equal(another.doc.getElementById('contact-message').value, '', 'a fresh tab does not restore message text');
  assert.equal(another.calls.writes.length, 0);
  another.dom.window.close();
  dom.window.close();
  console.log('PASS: privacy creation, contact open/close, explicit clipboard copies/fallback, no network, clipboard reads or persistence');
})().catch(error => { console.error(error); process.exitCode = 1; });
