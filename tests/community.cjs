const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

const script = fs.readFileSync(path.join(__dirname, '../web/community.js'), 'utf8');
const personalStory = 'This page is an overnight passion project by a Mapler that is also navigating the job  market, recovering from a surgery for cancer treatment, and simultaneously trying to find an open map to farm on.';
function originalIntroMarkup(node) { const copy=node.cloneNode(true);for(const br of copy.querySelectorAll('.footer-intro-break')){const tail=br.nextSibling;if(tail?.nodeType===3)tail.nodeValue=tail.nodeValue.replace(/^(\s*)That\b/,'$1that');br.remove();}return copy.outerHTML; }
function fixture({ preferences = new Map(), blocked = false, realFooter = false, initialBrand = null } = {}) {
  const markup=realFooter?fs.readFileSync(path.join(__dirname,'../web/index.html'),'utf8'):`<main id="content"></main><footer><article class="footer-story"><p>${personalStory}</p><p>Suggestions stay in their own paragraph.</p><p id="credits">Game art © Nexon</p></article><div class="footer-links"><a href="#privacy">Privacy</a></div></footer>`;
  const dom = new JSDOM(markup, {
    url: 'https://inflation.gg/', runScripts: 'outside-only', pretendToBeVisual: true,
  });
  const w = dom.window;
  if(initialBrand)for(const [key,value] of Object.entries(initialBrand))w.document.body.dataset[key]=value;
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
  const rawStoryBefore = w.document.querySelector('.footer-story').outerHTML;
  const rawPersonalBefore=w.document.querySelector('.footer-story>p').outerHTML;
  const personalNodeBefore=w.document.querySelector('.footer-story>p');
  const word=!blocked&&preferences.get('astra-footer-mapler-word-v1')==='a'?'a':'one';
  const storyBefore=rawStoryBefore.replace('by a Mapler','by '+word+' Mapler');
  const personalBefore=rawPersonalBefore.replace('by a Mapler','by '+word+' Mapler');
  const brandBefore=w.document.querySelector('.footer-brand');
  const style = w.document.createElement('style');
  style.textContent = fs.readFileSync(path.join(__dirname, '../web/community.css'), 'utf8');
  w.document.head.append(style);
  w.eval(script);
  return { dom, w, doc: w.document, calls, storyBefore, personalBefore, rawPersonalBefore, personalNodeBefore, preferences, brandBefore };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

(async () => {
  const real=fixture({realFooter:true});
  assert.equal(originalIntroMarkup(real.doc.querySelector('.footer-content>.footer-story>p')),real.personalBefore,'only approved wording, line break and capitalization change');
  assert.equal(real.doc.querySelector('.footer-story>p'),real.personalNodeBefore,'original paragraph node is preserved');
  const splitControl=real.doc.querySelector('[data-footer-intro-layout]');assert.equal(splitControl.getAttribute('aria-pressed'),'true');assert.equal(real.doc.querySelector('.footer-intro-break').nextSibling.nodeValue.startsWith(' That is also navigating'),true);
  splitControl.click();assert.equal(real.doc.querySelector('.footer-intro-break'),null);assert.equal(real.preferences.get('astra-footer-intro-layout-v1'),'inline');assert.equal(real.doc.querySelector('.footer-story>p').outerHTML,real.personalBefore);splitControl.click();assert.equal(real.preferences.get('astra-footer-intro-layout-v1'),'split');
  for(const [saved,blocked,expected] of [['inline',false,false],['invalid',false,true],['inline',true,true]]){const f=fixture({realFooter:true,blocked,preferences:new Map([['astra-footer-intro-layout-v1',saved]])});assert.equal(!!f.doc.querySelector('.footer-intro-break'),expected);f.doc.querySelector('[data-footer-intro-layout]').click();assert.equal(!!f.doc.querySelector('.footer-intro-break'),!expected);assert.equal(originalIntroMarkup(f.doc.querySelector('.footer-story>p')),f.personalBefore);assert.equal(f.calls.network,0);f.dom.window.close();}
  assert.equal(originalIntroMarkup(real.doc.querySelector('.footer-story>p')).replace('by one Mapler','by a Mapler'),real.rawPersonalBefore,'all other personal text is byte-for-byte preserved');
  assert.equal(real.doc.querySelector('nav a[href="#nx-calculator"]').textContent,'NX ↔ Meso Calculator');
  assert.match(real.doc.querySelector('.footer-story>p').textContent,/grad job  market/);
  const revisionText = 'As Maplers level up, reach new maps and find better drops, the economy’s representative items can change. Future basket revisions will document those changes, while preserving earlier basket definitions and histories.';
  const revisionNote = real.doc.getElementById('footer-basket-revisions'), revisionButton = real.doc.querySelector('[data-footer-basket-revisions]');
  assert.equal(revisionNote.textContent, revisionText); assert.equal(revisionNote.hidden, false); assert(revisionNote.closest('.footer-reliability'));
  assert.equal(revisionButton.parentElement.lastElementChild.dataset.footerIntroLayout,'true', 'intro layout control is at the end');
  assert.equal(revisionButton.getAttribute('aria-controls'), revisionNote.id); assert.equal(revisionButton.getAttribute('aria-pressed'), 'true');
  revisionButton.click(); assert.equal(revisionNote.hidden, true); assert.equal(real.preferences.get('astra-footer-basket-revisions-v1'), 'off');
  revisionButton.click(); assert.equal(revisionNote.hidden, false); assert.equal(real.preferences.get('astra-footer-basket-revisions-v1'), 'on');
  for (const [stored, blocked, expectedVisible] of [['off',false,false],['invalid',false,true],['off',true,true]]) {
    const other = fixture({realFooter:true, blocked, preferences:new Map([['astra-footer-basket-revisions-v1',stored]])});
    const note=other.doc.getElementById('footer-basket-revisions'); assert.equal(note.hidden,!expectedVisible);
    other.doc.querySelector('[data-footer-basket-revisions]').click(); assert.equal(note.hidden,expectedVisible); assert.equal(other.calls.network,0);
    assert.equal(originalIntroMarkup(other.doc.querySelector('.footer-story>p')),other.personalBefore); other.dom.window.close();
  }
  assert(real.doc.querySelector('.footer-content>.footer-author>.footer-signature'));
  assert.equal(real.doc.querySelector('footer>.footer-credits').textContent.startsWith('Verify current listings before trading.'),true);
  assert.equal(real.doc.querySelector('.footer-story .footer-signature'),null);
  const ordered=[...real.doc.querySelectorAll('.footer-story>p')];
  assert.equal(ordered.length,4);assert(ordered[1].textContent.startsWith('Suggestions are welcome.'));
  assert.equal(ordered[2].textContent,'A shared responsibility to look out for one another.');
  assert(ordered[3].classList.contains('footer-reuse'));assert(ordered[3].textContent.startsWith('I have no plans to monetize'));
  assert(ordered[3].querySelector('a[href="#privacy"]'));assert(ordered[3].textContent.includes('On by default'));
  assert.equal(real.w.getComputedStyle(real.doc.querySelector('.footer-content')).gridTemplateColumns,'repeat(2,minmax(0,1fr))');
  assert.equal(real.w.getComputedStyle(real.doc.querySelector('.footer-author')).alignItems,'flex-start');
  assert.equal(real.w.getComputedStyle(real.doc.querySelector('.footer-story')).maxWidth,'none');
  const about=real.doc.querySelector('.footer-brand'),aboutHref=about.getAttribute('href'),brandStory=real.doc.querySelector('.footer-story').outerHTML,author=real.doc.querySelector('.footer-author');
  const signature=real.doc.querySelector('.footer-signature'),thanks=real.doc.getElementById('footer-special-thanks');
  assert.equal(thanks.textContent,'A special thanks to my fellow Henehos that helped finalize this site, and to the broader Maple community as a whole for making the game so enjoyable in 2026');
  assert.equal(thanks.parentElement,signature);assert.equal(thanks.hidden,false);assert.match(signature.textContent,/\n[—–-] DishWasher/);assert(real.w.getComputedStyle(signature).fontFamily.includes('system-ui'));assert.equal(real.w.getComputedStyle(signature).fontStyle,'normal');
  assert.equal(revisionButton.previousElementSibling.dataset.footerThanks,'true','existing thanks choice remains immediately before the new end control');
  assert.equal(about,real.brandBefore,'the original About link is retained');assert.equal(about.querySelector('.footer-brand-words').textContent,'About inflation . gg');
  assert.equal(real.doc.querySelector('footer').dataset.footerStyle,'emphasis');
  const changeBrand=detail=>real.doc.dispatchEvent(new real.w.CustomEvent('astrabrandchange',{detail}));
  changeBrand({typeface:'display',case:'upper',placement:'center'});
  assert.equal(about.querySelector('.footer-brand-words').textContent,'About inflation . GG');assert(real.w.getComputedStyle(about).fontFamily.includes('Georgia'));assert.equal(real.w.getComputedStyle(about).fontStyle,'normal');assert.equal(real.w.getComputedStyle(about).fontWeight,'750');assert.equal(real.w.getComputedStyle(about).textAlign,'center');
  assert(real.w.getComputedStyle(signature).fontFamily.includes('Georgia'),'signature follows header typeface');assert.equal(real.w.getComputedStyle(thanks).fontFamily.includes('system-ui'),true,'thanks remains readable body type');
  assert.equal(real.w.getComputedStyle(real.doc.querySelector('.footer-story')).textAlign,'left','only the About link centers');
  real.w.dispatchEvent(new real.w.CustomEvent('astrabrandchange',{detail:{typeface:'arcade',case:'lower',placement:'left'}}));
  assert.equal(about.querySelector('.footer-brand-words').textContent,'About inflation . gg');assert(real.w.getComputedStyle(about).fontFamily.includes('monospace'));assert.equal(real.w.getComputedStyle(about).fontWeight,'700');assert.equal(real.w.getComputedStyle(about).textAlign,'left');
  changeBrand({typeface:'arcade-bold'});assert.equal(real.w.getComputedStyle(about).fontWeight,'900');assert.equal(real.w.getComputedStyle(signature).fontWeight,'900');
  changeBrand({typeface:'pixel',case:'lower',placement:'left'});assert.equal(real.doc.querySelector('footer').dataset.footerBrandTypeface,'pixel');assert(real.w.getComputedStyle(about).fontFamily.includes('Pixelify Sans'));assert.equal(real.w.getComputedStyle(about).fontWeight,'700');assert.equal(about.getAttribute('href'),aboutHref);
  for(const logo of ['lemon-stack','lemon','pouch','scroll','none']){changeBrand({logo});assert.equal(about.querySelector('.footer-brand-logo').dataset.logo,logo);assert.equal(about.querySelectorAll('.footer-brand-logo-badge').length,logo==='lemon-stack'?1:0);if(logo.startsWith('lemon'))assert.equal(about.querySelector('img').getAttribute('src'),'assets/lemon-original-v1.png');if(logo==='lemon-stack'){assert.equal(about.querySelector('.footer-brand-logo-badge').textContent,'999');assert.equal(real.w.getComputedStyle(about.querySelector('img')).width,'26px');assert.equal(real.w.getComputedStyle(about.querySelector('.footer-brand-logo')).borderTopWidth,'2px');assert.equal(about.querySelectorAll('.footer-brand-logo>*').length,2,'no keybinding label is added');}else if(logo==='lemon'||logo==='pouch')assert.equal(real.w.getComputedStyle(about.querySelector('img')).width,'52px');assert.equal(about.getAttribute('href'),aboutHref);}changeBrand({logo:'lemon-stack'});
  changeBrand({typeface:'sans',case:'upper',placement:'left'});assert(real.w.getComputedStyle(about).fontFamily.includes('system-ui'));assert.equal(real.w.getComputedStyle(about).fontWeight,'850');
  changeBrand({typeface:'url(evil)',case:'<img>',placement:'absolute'});assert.equal(about.querySelector('.footer-brand-words').textContent,'About inflation . gg');assert.equal(real.doc.querySelectorAll('.footer-brand img').length,1);assert.equal(real.doc.querySelector('.footer-brand img').getAttribute('src'),'assets/lemon-original-v1.png');
  assert.equal(about.getAttribute('href'),aboutHref);assert.equal(real.doc.querySelector('.footer-brand'),about);assert.equal(real.doc.querySelector('.footer-story').outerHTML,brandStory);assert.equal(real.doc.querySelector('.footer-author'),author);assert.equal(real.calls.network,0);
  real.dom.window.close();
  const wordChoice=fixture({realFooter:true});
  const originalPersonal=wordChoice.doc.querySelector('.footer-story>p'),wordButtons=[...wordChoice.doc.querySelectorAll('[data-footer-mapler]')];
  for(const value of ['a','one']){wordButtons.find(button=>button.dataset.footerMapler===value).click();assert.equal(wordChoice.doc.querySelector('.footer-story>p'),originalPersonal);assert.equal(originalIntroMarkup(originalPersonal),wordChoice.rawPersonalBefore.replace('by a Mapler','by '+value+' Mapler'));assert.equal(wordChoice.preferences.get('astra-footer-mapler-word-v1'),value);assert.equal(wordButtons.filter(button=>button.getAttribute('aria-pressed')==='true').length,1);}
  const thanksChoice=wordChoice.doc.querySelector('[data-footer-thanks]'),thanksNode=wordChoice.doc.getElementById('footer-special-thanks');thanksChoice.click();assert.equal(thanksNode.hidden,true);assert.equal(wordChoice.preferences.get('astra-footer-thanks-v1'),'off');thanksChoice.click();assert.equal(thanksNode.hidden,false);assert.equal(wordChoice.doc.getElementById('footer-special-thanks'),thanksNode);assert.equal(wordChoice.calls.network,0);wordChoice.dom.window.close();
  const restoredCopy=fixture({realFooter:true,preferences:new Map([['astra-footer-mapler-word-v1','a'],['astra-footer-thanks-v1','off']])});assert(restoredCopy.doc.querySelector('.footer-story>p').textContent.includes('by a Mapler'));assert.equal(restoredCopy.doc.getElementById('footer-special-thanks').hidden,true);restoredCopy.dom.window.close();
  const blockedCopy=fixture({realFooter:true,blocked:true});assert(blockedCopy.doc.querySelector('.footer-story>p').textContent.includes('by one Mapler'));assert.equal(blockedCopy.doc.getElementById('footer-special-thanks').hidden,false);blockedCopy.doc.querySelector('[data-footer-mapler="a"]').click();assert(blockedCopy.doc.querySelector('.footer-story>p').textContent.includes('by a Mapler'));blockedCopy.doc.querySelector('[data-footer-thanks]').click();assert.equal(blockedCopy.doc.getElementById('footer-special-thanks').hidden,true);assert.equal(blockedCopy.calls.network,0);blockedCopy.dom.window.close();
  const preloaded=fixture({realFooter:true,initialBrand:{brandTypeface:'arcade',brandCase:'upper',brandPlacement:'center'}});assert.equal(preloaded.doc.querySelector('.footer-brand-words').textContent,'About inflation . GG');assert.equal(preloaded.doc.querySelector('footer').dataset.footerBrandTypeface,'arcade');assert.equal(preloaded.w.getComputedStyle(preloaded.doc.querySelector('.footer-brand')).textAlign,'center');preloaded.dom.window.close();
  const preferences = new Map();
  const { dom, w, doc, calls, storyBefore } = fixture({ preferences });
  const footer = doc.querySelector('footer');
  const story = doc.querySelector('.footer-story');
  assert.equal(story.firstElementChild.textContent, personalStory.replace('by a Mapler that','by one Mapler That'));
  assert.equal(originalIntroMarkup(story), storyBefore);
  assert.equal(footer.dataset.footerStyle, 'emphasis');assert.equal(w.getComputedStyle(story).fontWeight,'600');
  assert.equal(w.getComputedStyle(story).fontSize, '14px');
  assert.equal(w.getComputedStyle(story).textAlign, 'left');
  assert.equal(w.getComputedStyle(footer).justifyItems,'start');
  assert.equal(w.getComputedStyle(doc.querySelector('.footer-links a')).textDecorationLine,'underline');
  const normalFooterBackground=w.getComputedStyle(footer).backgroundColor;
  const normalFooterPadding=w.getComputedStyle(footer).padding;
  for(const mode of ['zakum-dark','zakum-bright','zakum-raid','lantern-market']){
    doc.body.dataset.sceneryMode=mode;doc.body.classList.add('scenery-on');
    assert.equal(w.getComputedStyle(footer).backgroundColor,'rgba(14, 26, 19, 0.94)','full-cover scenery backs the whole footer');
    assert.equal(w.getComputedStyle(footer).paddingTop,'24px');
    assert.equal(w.getComputedStyle(story).textAlign,'left');
  }
  for(const mode of ['classic','banner','backdrop']){
    doc.body.dataset.sceneryMode=mode;
    assert.equal(w.getComputedStyle(footer).backgroundColor,normalFooterBackground);
    assert.equal(w.getComputedStyle(footer).padding,normalFooterPadding);
  }
  doc.body.dataset.sceneryMode='zakum-dark';doc.body.classList.remove('scenery-on');
  assert.equal(w.getComputedStyle(footer).backgroundColor,normalFooterBackground,'Scenery Off preserves the normal footer');
  assert.equal(w.getComputedStyle(footer).padding,normalFooterPadding);
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
    assert.equal(originalIntroMarkup(story), storyBefore, 'style choices cannot rewrite prose');
    if (value === 'personal') {
      assert(w.getComputedStyle(story).fontFamily.includes('Georgia'));
      assert.equal(w.getComputedStyle(story.firstElementChild).fontStyle, 'italic');
    }
    if (value === 'emphasis') assert.equal(w.getComputedStyle(story).fontWeight, '600');
    const restored = fixture({ preferences });
    assert.equal(restored.doc.querySelector('footer').dataset.footerStyle, value);
    assert.equal(originalIntroMarkup(restored.doc.querySelector('.footer-story')), restored.storyBefore);
    assert.equal(restored.calls.network, 0);
    restored.dom.window.close();
  }
  const invalid = fixture({ preferences: new Map([['inflation-footer-style', '<script>invalid</script>']]) });
  assert.equal(invalid.doc.querySelector('footer').dataset.footerStyle, 'emphasis');
  assert.equal(originalIntroMarkup(invalid.doc.querySelector('.footer-story')), invalid.storyBefore);
  invalid.dom.window.close();
  const unavailable = fixture({ blocked: true });
  assert.equal(unavailable.doc.querySelector('footer').dataset.footerStyle,'emphasis');
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
  assert.match(privacy.textContent, /I may review aggregate hosting counts/);
  assert.doesNotMatch(privacy.textContent, /We may review aggregate hosting counts/);
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
  assert.deepEqual(calls.preferenceReads, ['inflation-footer-style','astra-footer-mapler-word-v1','astra-footer-intro-layout-v1']);
  assert.deepEqual(calls.preferenceWrites, [['inflation-footer-style','personal'],['inflation-footer-style','emphasis'],['inflation-footer-style','clear']]);
  assert.equal(originalIntroMarkup(story), storyBefore, 'contact use also leaves story markup unchanged');
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

// Review lock is server/build markup, not a hideable client preference.
{
  const raw=fs.readFileSync(path.join(__dirname,'../web/index.html'),'utf8');
  const markup=raw.replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/, '<footer class="shell footer-privacy-locked" data-footer-privacy-lock="on" data-preview-analytics-default="on"><article class="footer-review-note" aria-labelledby="footer-review-draft"><h2 class="footer-review-draft" id="footer-review-draft">{DRAFT}</h2><p>Author note and full credits will appear here after review.</p></article><div class="footer-links"><a href="#sources">Sources</a><a href="#privacy">Privacy policy</a></div></footer>');
  const lockedMarkup=markup.replace('<body>','<body><aside class="shell review-demo-notice" id="review-demo-notice" role="note">{DRAFT} Demo values — not representative of the live market.</aside>');
  const dom=new JSDOM(lockedMarkup,{url:'https://inflation.gg/',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,doc=w.document;let network=0;
  w.localStorage.setItem('inflation-optional-analytics-consent-v1','off');
  w.localStorage.setItem('inflation-footer-style','personal');
  w.localStorage.setItem('inflation-author-portrait-v2','transparent-large');
  w.fetch=()=>{network++;throw new Error('Review lock must not request author assets or analytics');};
  w.eval(script);
  w.eval(fs.readFileSync(path.join(__dirname,'../web/author-portrait.js'),'utf8'));
  w.eval(fs.readFileSync(path.join(__dirname,'../web/privacy-controls.js'),'utf8'));
  assert(!doc.querySelector('#author-portrait,.footer-story,.footer-signature,.community-footer-styles,.footer-copy-options,#open-contact,#contact-dialog,[data-open-contact]'));
  assert(doc.querySelector('#view-market-comparison'));assert(doc.querySelector('#view-privacy'));assert(doc.querySelector('#privacy-controls'));
  assert(!/surgery|cancer|grad job|DishWasher|dizzyvinci/i.test(doc.body.textContent));
  assert(doc.querySelector('footer').textContent.includes('will appear here after review'));
  const reviewStyles=fs.readFileSync(path.join(__dirname,'../web/community.css'),'utf8');
  const reviewStyle=doc.createElement('style');reviewStyle.textContent=reviewStyles;doc.head.append(reviewStyle);
  const reviewNote=doc.querySelector('.footer-review-note'),draft=doc.getElementById('footer-review-draft');
  assert.equal(draft.textContent,'{DRAFT}');assert.equal(reviewNote.getAttribute('aria-labelledby'),draft.id);
  assert.equal(draft.nextElementSibling.textContent,'Author note and full credits will appear here after review.');
  assert.equal(w.getComputedStyle(reviewNote).textAlign,'center');
  assert.equal(w.getComputedStyle(reviewNote).maxWidth,'100%');assert.equal(parseFloat(w.getComputedStyle(reviewNote).minWidth),0);
  assert.equal(w.getComputedStyle(reviewNote).boxSizing,'border-box');
  assert.equal(w.getComputedStyle(reviewNote.querySelector('p')).overflowWrap,'anywhere');
  assert(reviewStyles.includes('clamp(26px,3.5vw,42px)'));assert(reviewStyles.includes('footer[data-footer-privacy-lock="on"] .footer-review-note>p'));
  const baseStyles=fs.readFileSync(path.join(__dirname,'../web/style.css'),'utf8'),themeStyles=fs.readFileSync(path.join(__dirname,'../web/theme-preview.css'),'utf8');
  const applyVars=(target,body)=>{for(const hit of body.matchAll(/--(surface|text|gold):\s*(#[0-9a-f]{6})/gi))target[hit[1]]=hit[2];return target;};
  const base={};for(const rule of baseStyles.matchAll(/:root\s*\{([^}]*)\}/g))applyVars(base,rule[1]);
  const palettes=[base,...[...themeStyles.matchAll(/body\[data-color-scheme="(?:maple-amber|moonlit-ludibrium)"\]\{([^}]*)\}/g)].map(rule=>applyVars({...base},rule[1]))];
  const lum=color=>color.slice(1).match(/../g).map(hex=>parseInt(hex,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
  const contrast=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
  const demoNotice=doc.getElementById('review-demo-notice');
  assert.equal(demoNotice.textContent,'{DRAFT} Demo values — not representative of the live market.');
  assert.equal(demoNotice.getAttribute('role'),'note');assert.equal(doc.body.firstElementChild,demoNotice);
  assert.equal(w.getComputedStyle(demoNotice).textAlign,'center');assert.equal(w.getComputedStyle(demoNotice).overflowWrap,'anywhere');
  assert.equal(w.getComputedStyle(demoNotice).borderTopWidth,'3px');assert(contrast('#fff3f5','#461c27')>=7,'Top draft notice high contrast in all themes');
  assert.equal(palettes.length,3);for(const palette of palettes){assert(contrast(palette.text,palette.surface)>=7,'Review message high contrast in each palette');assert(contrast(palette.gold,palette.surface)>=4.5,'DRAFT badge high contrast in each palette');}

  const cacheNote=doc.querySelector('#view-privacy [data-privacy-browser-storage]');
  assert(cacheNote.textContent.includes('Versioned public interface and market files'));
  assert(cacheNote.textContent.includes('browser’s private HTTP cache'));
  assert(cacheNote.textContent.includes('Pages, mutable status responses and password-control responses remain private and no-store'));
  assert(cacheNote.textContent.includes('does not create a visitor account or change your optional performance choice'));
  assert(!cacheNote.textContent.includes('Preview responses are marked private and no-store'));
  assert.equal(network,0);dom.window.close();
  console.log('PASS temporary footer review lock: personal story/signature/portrait/contact/options absent, saved preferences cannot reveal them, comparison/privacy/consent retained.');
}
