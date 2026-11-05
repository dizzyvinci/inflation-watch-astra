const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

const script = fs.readFileSync(path.join(__dirname, '../web/community.js'), 'utf8');
const personalStory = 'This page is an overnight passion project by a Mapler that is also navigating the job  market, recovering from a surgery for cancer treatment, and simultaneously trying to find an open map to farm on.';
function fixture({ preferences = new Map(), blocked = false } = {}) {
  const dom = new JSDOM(`<main id="content"></main><footer><article class="footer-story"><p>${personalStory}</p><p>Suggestions stay in their own paragraph.</p><p id="credits">Game art © Nexon</p></article><div class="footer-links"><a href="#privacy">Privacy</a></div></footer>`, {
    url: 'https://inflation.gg/', runScripts: 'outside-only', pretendToBeVisual: true,
  });
  const w = dom.window;
  const calls = { network: 0, storage: 0, reads: 0, writes: [], preferenceReads: [], preferenceWrites: [] };
  w.fetch = () => { calls.network++; throw new Error('No network allowed'); };
  w.XMLHttpRequest = function () { calls.network++; throw new Error('No network allowed'); };
  w.navigator.sendBeacon = () => { calls.network++; throw new Error('No beacon allowed'); };
  Object.defineProperty(w, 'localStorage', { value: {
    getItem(key) { calls.preferenceReads.push(key); if (blocked) throw new Error('Storage blocked'); return preferences.get(key) ?? null; },
    setItem(key, value) { calls.preferenceWrites.push([key, value]); if (blocked) throw new Error('Storage blocked'); preferences.set(key, value); },
  } });
  Object.defineProperty(w, 'sessionStorage', { get() { calls.storage++; throw new Error('No persistence allowed'); } });
  Object.defineProperty(w.navigator, 'clipboard', { configurable: true, value: {
    writeText: async text => { calls.writes.push(text); },
    readText: async () => { calls.reads++; throw new Error('No clipboard reads'); },
  } });
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new w.Event('close')); };
  const storyBefore = w.document.querySelector('.footer-story').outerHTML;
  const style = w.document.createElement('style');
  style.textContent = fs.readFileSync(path.join(__dirname, '../web/community.css'), 'utf8');
  w.document.head.append(style);
  w.eval(script);
  return { dom, w, doc: w.document, calls, storyBefore, preferences };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

(async () => {
  const preferences = new Map();
  const { dom, w, doc, calls, storyBefore } = fixture({ preferences });
  const footer = doc.querySelector('footer');
  const story = doc.querySelector('.footer-story');
  assert.equal(story.firstElementChild.textContent, personalStory);
  assert.equal(story.outerHTML, storyBefore);
  assert.equal(footer.dataset.footerStyle, 'clear');
  assert.equal(w.getComputedStyle(story).fontSize, '18px');
  const choices = [...doc.querySelectorAll('[data-footer-style-choice]')];
  assert.deepEqual(choices.map(button => button.textContent), ['Clear', 'Personal', 'Emphasis']);
  assert.equal(doc.querySelector('.community-footer-styles').getAttribute('role'), 'group');
  assert.equal(doc.querySelector('.community-footer-styles').getAttribute('aria-label'), 'Footer text style');
  for (const value of ['personal', 'emphasis', 'clear']) {
    choices.find(button => button.dataset.footerStyleChoice === value).click();
    assert.equal(footer.dataset.footerStyle, value);
    assert.equal(choices.filter(button => button.getAttribute('aria-pressed') === 'true').length, 1);
    assert.equal(choices.find(button => button.dataset.footerStyleChoice === value).getAttribute('aria-pressed'), 'true');
    assert.equal(preferences.get('inflation-footer-style'), value);
    assert.equal(story.outerHTML, storyBefore, 'style choices cannot rewrite prose');
    if (value === 'personal') {
      assert(w.getComputedStyle(story).fontFamily.includes('Georgia'));
      assert.equal(w.getComputedStyle(story.firstElementChild).fontStyle, 'italic');
    }
    if (value === 'emphasis') assert.equal(w.getComputedStyle(story).fontWeight, '600');
    const restored = fixture({ preferences });
    assert.equal(restored.doc.querySelector('footer').dataset.footerStyle, value);
    assert.equal(restored.doc.querySelector('.footer-story').outerHTML, restored.storyBefore);
    assert.equal(restored.calls.network, 0);
    restored.dom.window.close();
  }
  const invalid = fixture({ preferences: new Map([['inflation-footer-style', '<script>invalid</script>']]) });
  assert.equal(invalid.doc.querySelector('footer').dataset.footerStyle, 'clear');
  assert.equal(invalid.doc.querySelector('.footer-story').outerHTML, invalid.storyBefore);
  invalid.dom.window.close();
  const unavailable = fixture({ blocked: true });
  unavailable.doc.querySelector('[data-footer-style-choice="personal"]').click();
  assert.equal(unavailable.doc.querySelector('footer').dataset.footerStyle, 'personal');
  assert.equal(unavailable.calls.network, 0);
  unavailable.dom.window.close();
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
  assert.deepEqual(calls.preferenceReads, ['inflation-footer-style']);
  assert.deepEqual(calls.preferenceWrites, [['inflation-footer-style','personal'],['inflation-footer-style','emphasis'],['inflation-footer-style','clear']]);
  assert.equal(story.outerHTML, storyBefore, 'contact use also leaves story markup unchanged');
  assert.equal(doc.querySelectorAll('.community-footer-styles').length, 1);
  assert.equal(calls.reads, 0);
  assert.equal(doc.cookie, '');
  const another = fixture();
  assert.equal(another.doc.getElementById('contact-message').value, '', 'a fresh tab does not restore message text');
  assert.equal(another.calls.writes.length, 0);
  another.dom.window.close();
  dom.window.close();
  console.log('PASS: privacy creation, contact open/close, explicit clipboard copies/fallback, footer styles/persistence and unchanged story, no network, clipboard reads or message persistence');
})().catch(error => { console.error(error); process.exitCode = 1; });
