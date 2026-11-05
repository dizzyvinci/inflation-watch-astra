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
f = fixture(fs.readFileSync(path.join(root,'web/index.html'),'utf8'));try{
  f.w.eval(fs.readFileSync(path.join(root,'web/market-highlights.js'),'utf8'));
  f.doc.getElementById('view-highlights').hidden=false;const controls=f.doc.querySelector('.highlights-detail-controls');assert.equal(controls.dataset.previewControls,'true');assert(visible(f,controls));
  const choices=[...controls.querySelectorAll('button')].map(button=>[button,button.getAttribute('aria-pressed')]);
  f.doc.getElementById('viewer-preview-enter').click();assert.equal(visible(f,controls),false,'actual Highlights display choices hide in Viewer Preview');
  assert(visible(f,f.doc.querySelector('.market-highlights-pause')),'motion pause remains a functional control');
  f.doc.getElementById('viewer-preview-exit').click();assert(visible(f,controls));for(const [button,value]of choices)assert.equal(button.getAttribute('aria-pressed'),value);assert.equal(f.calls.network,0);assert.deepEqual(f.errors,[]);
}finally{f.close();}
f = fixture(fs.readFileSync(path.join(root,'web/index.html'),'utf8'));try{
  const report=JSON.parse(fs.readFileSync(path.join(root,'dist/data.json'),'utf8'));
  f.w.renderCategoryCards=()=>{f.doc.getElementById('category-cards').innerHTML=report.categories.map(category=>`<article class="category-card"><button class="category-main" data-category="${category.name}"><strong class="category-number">100</strong></button></article>`).join('');};
  f.w.eval(fs.readFileSync(path.join(root,'web/category-reference-preview.js'),'utf8'));f.doc.dispatchEvent(new f.w.CustomEvent('astramarketsnapshot',{detail:report}));
  const section=f.doc.getElementById('category-section'),selector=f.doc.getElementById('category-reference-select'),status=f.doc.getElementById('category-reference-status'),editor=f.doc.getElementById('category-reference-editor-note');
  assert.equal(status.hidden,true,'frozen mode relies on its existing dated reference legend');assert(editor.textContent.includes('This selector'));assert(visible(f,editor));
  f.doc.getElementById('viewer-preview-enter').click();assert.equal(visible(f,editor),false);assert.equal(status.textContent,'');assert(visible(f,section.querySelector('.category-gauge-legend')));f.doc.getElementById('viewer-preview-exit').click();
  for(const mode of ['previous7','previous-day']){selector.value=mode;selector.dispatchEvent(new f.w.Event('change'));const context=status.textContent,coverage=[...section.querySelectorAll('.category-reference-note')];assert.equal(status.hidden,false);assert(context.includes('Source publication '+report.sourceUpdatedAt));assert(context.includes('Missing member prices'));assert(!context.includes('selector'));assert(coverage.length>0);f.doc.getElementById('viewer-preview-enter').click();assert.equal(visible(f,selector),false);assert.equal(visible(f,editor),false);assert(visible(f,status),'selected calculation scope remains public');assert.equal(status.textContent,context);for(const note of coverage)assert(visible(f,note),'actual carried/coverage information remains visible');f.doc.getElementById('viewer-preview-exit').click();assert.equal(selector.value,mode);}
  f.w.eval(fs.readFileSync(path.join(root,'web/community.js'),'utf8'));f.w.eval(fs.readFileSync(path.join(root,'web/author-portrait.js'),'utf8'));
  const image=f.doc.querySelector('#author-portrait img');image.dispatchEvent(new f.w.Event('load'));const feedback=f.doc.querySelector('.author-portrait-feedback');assert(feedback.textContent.includes('portrait shown'));assert(feedback.closest('.author-portrait-options'));const signature=f.doc.querySelector('.footer-signature'),words=signature.textContent;
  f.doc.getElementById('viewer-preview-enter').click();assert.equal(visible(f,feedback),false,'portrait editing feedback hides with its controls, including screen-reader status');assert(visible(f,image));assert(visible(f,signature));assert.equal(signature.textContent,words);f.doc.getElementById('viewer-preview-exit').click();assert.equal(f.doc.querySelector('#author-portrait img'),image);assert.equal(f.calls.network,0);assert.deepEqual(f.errors,[]);
}finally{f.close();}
assert.doesNotMatch(css, /@import|https?:\/\/|url\(/);
assert.doesNotMatch(css,/body\[data-viewer-preview="on"\]\s+\*/,'no blanket removal of keyboard focus outlines');
console.log('PASS: tab-only viewer mode, hidden dynamic editing groups/red markers, selected design/node identity retained, live chart hover, functional real privacy controls, Escape/focus restoration and zero HTTP/storage');

function passwordFixture({url='https://inflation.gg/',reply=async()=>new Response('{"unlocked":true}',{headers:{'content-type':'application/json'}})}={}){
 const errors=[],calls={requests:[],storage:0,digests:0,privacy:0},vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM(html.replace('<footer>','<footer data-footer-privacy-lock="on">'),{url,runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc}),w=dom.window,doc=w.document;
 const style=doc.createElement('style');style.textContent=css;doc.head.append(style);
 for(const name of ['localStorage','sessionStorage'])Object.defineProperty(w,name,{get(){calls.storage++;throw Error('No password or unlock storage')}});
 Object.defineProperty(w,'crypto',{value:{subtle:{digest:async(...args)=>{calls.digests++;return require('node:crypto').webcrypto.subtle.digest(...args)}}}});w.TextEncoder=TextEncoder;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'))};
 w.fetch=async(...args)=>{calls.requests.push(args);return reply(...args)};doc.getElementById('policy-off').addEventListener('click',()=>calls.privacy++);
 w.eval(script);return {w,doc,calls,errors,close:()=>w.close()};
}
const settled=async predicate=>{const end=Date.now()+1500;while(!predicate()&&Date.now()<end)await new Promise(r=>setTimeout(r,5));assert(predicate(),'password state did not settle')};
const unlockAttempt=(f,password)=>{const dialog=f.doc.getElementById('preview-controls-dialog');if(!dialog.open)f.doc.getElementById('preview-controls-access').click();const input=f.doc.getElementById('preview-controls-password');input.value=password;dialog.querySelector('form').dispatchEvent(new f.w.Event('submit',{cancelable:true,bubbles:true}));assert.equal(input.value,'','password cleared immediately on submit');return dialog.querySelector('button[type="submit"]')};
(async()=>{
 let accepted=false;let f=passwordFixture({reply:async()=>new Response(JSON.stringify({unlocked:accepted}),{status:accepted?200:401,headers:{'content-type':'application/json'}})});
 try{
  const gate=f.doc.getElementById('preview-controls-access'),story=f.doc.querySelector('.footer-story').outerHTML;
  const fee=f.doc.createElement('section');fee.className='fee-preview';fee.innerHTML='<div class="fee-preview-modes"><button>Trade</button></div><div class="fee-preview-presets"><button>Reported assumptions</button></div><form class="fee-preview-form"><input value="3"></form><p class="fee-preview-status">Selected user-reported seller deduction: 3%</p>';f.doc.body.append(fee);assert.equal(visible(f,fee.querySelector('.fee-preview-form')),false);assert(visible(f,fee.querySelector('.fee-preview-status')),'active calculation provenance stays visible');
  assert.equal(f.doc.body.dataset.viewerPreview,'on');assert.equal(f.doc.body.dataset.previewControlsLocked,'true');assert(visible(f,gate));assert.equal(f.doc.getElementById('viewer-preview-enter').parentElement.hidden,true);assert.equal(f.doc.getElementById('viewer-preview-exit').hidden,true);assert.equal(f.calls.requests.length,0);assert.equal(f.calls.storage,0);
  f.doc.getElementById('viewer-preview-exit').click();f.doc.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(f.doc.body.dataset.viewerPreview,'on','old Exit/Escape cannot bypass password');assert.equal(visible(f,f.doc.getElementById('display-options')),false);
  let submit=unlockAttempt(f,'wrong');await settled(()=>!submit.disabled);assert.equal(f.doc.body.dataset.previewControlsLocked,'true');assert(f.doc.getElementById('preview-controls-feedback').textContent.includes('not accepted'));assert.equal(f.calls.digests,0,'remote verification never falls back to local hash');
  accepted=true;submit=unlockAttempt(f,'test password');await settled(()=>!submit.disabled);assert.equal(f.doc.body.dataset.previewControlsLocked,undefined);assert.equal(f.doc.body.dataset.viewerPreview,undefined);assert.equal(gate.textContent,'Lock preview controls');assert.equal(f.doc.getElementById('preview-controls-dialog').open,false);assert.equal(f.doc.getElementById('display-options').open,true);
  assert(visible(f,fee.querySelector('.fee-preview-form')));assert.equal(fee.querySelector('input').value,'3');
  for(const [url,request]of f.calls.requests){assert.equal(url,'/__preview_controls');assert.equal(request.method,'POST');assert.equal(request.credentials,'same-origin');assert.equal(request.cache,'no-store');assert.equal(request.redirect,'error');assert.equal(request.headers['Content-Type'],'application/x-www-form-urlencoded');assert.equal(request.headers.Accept,'application/json');assert.deepEqual([...new URLSearchParams(request.body).keys()],['password']);}
  f.doc.getElementById('viewer-preview-enter').click();assert.equal(f.doc.body.dataset.viewerPreview,'on');f.doc.getElementById('viewer-preview-exit').click();assert.equal(f.doc.body.dataset.viewerPreview,undefined,'normal viewer button works during current-tab authorization');
  f.doc.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(f.doc.body.dataset.previewControlsLocked,'true');assert.equal(f.doc.body.dataset.viewerPreview,'on');assert.equal(f.doc.getElementById('viewer-preview-exit').hidden,true);
  assert.equal(visible(f,fee.querySelector('.fee-preview-form')),false);assert(visible(f,fee.querySelector('.fee-preview-status')));
  gate.click();const input=f.doc.getElementById('preview-controls-password');assert.equal(f.doc.activeElement,input);input.value='clear on cancel';f.doc.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(input.value,'');assert.equal(f.doc.getElementById('preview-controls-dialog').open,false);assert.equal(f.doc.activeElement,gate);assert.equal(f.calls.requests.length,2,'opening/canceling makes no requests');
  f.doc.getElementById('view-privacy').hidden=false;assert(visible(f,f.doc.getElementById('policy-off')),'real Privacy consent controls remain functional while design controls are locked');f.doc.getElementById('policy-off').click();assert.equal(f.calls.privacy,1);assert(visible(f,f.doc.getElementById('search')));assert.equal(f.doc.querySelector('.footer-story').outerHTML,story);
  submit=unlockAttempt(f,'test password');await settled(()=>!submit.disabled);const cached=new f.w.Event('pageshow');Object.defineProperty(cached,'persisted',{value:true});f.w.dispatchEvent(cached);assert.equal(f.doc.body.dataset.previewControlsLocked,'true','restoring a cached document relocks');assert.equal(f.calls.storage,0);assert.deepEqual(f.errors,[]);
 }finally{f.close()}
 f=passwordFixture();try{assert.equal(f.doc.body.dataset.viewerPreview,'on','fresh/reloaded documents never inherit unlock');assert.equal(f.calls.requests.length,0)}finally{f.close()}
 for(const reply of [async()=>{throw Error('Network failed')},async()=>new Response('<html>Session expired</html>',{headers:{'content-type':'text/html'}}),async()=>new Response('{broken',{headers:{'content-type':'application/json'}}),async()=>new Response('{"ok":true}',{headers:{'content-type':'application/json'}})]){f=passwordFixture({reply});try{const button=unlockAttempt(f,'pre-deploy');await settled(()=>!button.disabled);assert.equal(f.doc.body.dataset.previewControlsLocked,'true');assert.equal(f.doc.body.dataset.viewerPreview,'on');assert.equal(f.calls.digests,0);assert.equal(f.calls.requests.length,1);assert(f.doc.getElementById('preview-controls-feedback').textContent)}finally{f.close()}}
 for(const url of ['http://localhost:8765/','http://127.0.0.1:8765/']){f=passwordFixture({url});try{let button=unlockAttempt(f,'wrong');await settled(()=>!button.disabled);assert.equal(f.doc.body.dataset.previewControlsLocked,'true');button=unlockAttempt(f,'pre-deploy');await settled(()=>!button.disabled);assert.equal(f.doc.body.dataset.viewerPreview,undefined);assert.equal(f.calls.requests.length,0);assert.equal(f.calls.digests,2);assert.equal(f.calls.storage,0)}finally{f.close()}}
 f=passwordFixture({url:'http://localhost.evil.example/'});try{const button=unlockAttempt(f,'pre-deploy');await settled(()=>!button.disabled);assert.equal(f.doc.body.dataset.previewControlsLocked,'true');assert.equal(f.calls.digests,0);assert.equal(f.calls.requests.length,0,'remote HTTP is refused, not locally verified')}finally{f.close()}
 let finish;f=passwordFixture({reply:()=>new Promise(resolve=>{finish=resolve})});try{unlockAttempt(f,'test password');assert(finish);f.doc.getElementById('preview-controls-dialog').querySelector('button[type="button"]').click();finish(new Response('{"unlocked":true}',{headers:{'content-type':'application/json'}}));await new Promise(r=>setTimeout(r,10));assert.equal(f.doc.body.dataset.previewControlsLocked,'true','late response cannot unlock after cancellation');assert.equal(f.doc.getElementById('preview-controls-password').value,'')}finally{f.close()}
 console.log('PASS password-mode preview controls: locked defaults, submit-only same-origin HTTPS/session check, strict200 JSON contract, local-only digest, failures/cancel/stale-response safety, Escape/relock/refresh, no stored password/unlock and real Privacy controls preserved.');
})().catch(error=>{console.error(error);process.exitCode=1});
