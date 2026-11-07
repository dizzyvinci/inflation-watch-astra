const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {JSDOM,VirtualConsole}=require('jsdom');
const root=path.resolve(__dirname,'..'),read=n=>fs.readFileSync(path.join(root,'web',n),'utf8');
const css=read('brand-preview.css'),html=read('index.html');
const masthead=html.slice(html.indexOf('  <header class="masthead'),html.indexOf('  <main class="shell"'));
const report={sourceUpdatedAt:'2026-11-04T08:30:56Z',latest:{nxRate:1},rows:[{slug:'iron-ore',name:'Iron Ore',price:300,priceDay:'2026-11-04',quantity:10}],cash:[],contextItems:[],spriteMap:{'iron-ore':'assets/iron-ore.png'}};
let cases=0;
for(const saved of [false,true]){
 const prefs=new Map(saved?[['astra-brand-typeface','sans'],['astra-brand-placement','left'],['astra-nav-basket-visible-v1','on'],['astra-nav-cash-basket-visible-v1','on']]:[]),calls={network:0,writes:0};
 const vc=new VirtualConsole(),errors=[];vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM(masthead+'<details id="display-options"></details><main id="content"><section class="view" id="view-index"></section><section class="view" id="view-nx"><div class="page-heading"></div></section><section class="view" id="view-cash-basket"><div class="page-heading"></div></section></main>',{url:'https://inflation.gg/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});const w=dom.window,d=w.document;
 try{
  w.fetch=w.XMLHttpRequest=w.navigator.sendBeacon=()=>{calls.network++;throw Error('No network');};Object.defineProperty(w,'localStorage',{value:{getItem:k=>prefs.get(k)??null,setItem:()=>{calls.writes++;}}});
  const style=d.createElement('style');style.textContent=read('style.css')+'\n'+css+'\n'+read('price-check.css')+'\n'+read('nav-preview.css');d.head.append(style);
  const header=d.querySelector('header'),clock=d.querySelector('.header-status'),clockBefore=clock.innerHTML,refresh=d.querySelector('#refresh'),nav=d.querySelector('nav'),links=[...nav.querySelectorAll('a')];
  d.addEventListener('astramarkethighlightsready',()=>d.dispatchEvent(new w.CustomEvent('astramarketsnapshot',{detail:report})));
  for(const n of ['brand-preview.js','nav-preview.js','cash-catalog.js','price-check.js'])w.eval(read(n));
  assert.equal(header.dataset.brandTypeface,saved?'sans':'arcade');assert.equal(header.dataset.brandPlacement,saved?'left':'center');assert.equal(clock.innerHTML,clockBefore);assert.equal(d.querySelector('#refresh'),refresh);assert(links.every(a=>nav.contains(a)));
  const form=d.querySelector('form.price-check-searchbar'),input=d.querySelector('#price-check-header-query');assert.equal(form.parentElement,nav);assert.equal(form.getAttribute('role'),'search');assert.equal(input.type,'search');assert.equal(d.querySelector('label[for="price-check-header-query"]').textContent,'Price check / Search for an Item');assert.equal(input.maxLength,250);
  input.focus();input.value='Iron';input.dispatchEvent(new w.Event('input',{bubbles:true}));const popup=d.querySelector('.price-check-autocomplete');assert.equal(popup.parentElement,d.body);assert.equal(popup.hidden,false);assert.equal(input.getAttribute('role'),'combobox');assert.equal(d.querySelectorAll('[role="option"]').length,1);assert.equal(d.querySelector('[role="option"] img').getAttribute('src'),'assets/iron-ore.png');
  input.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));assert(input.getAttribute('aria-activedescendant'));input.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));assert.equal(w.location.hash,'#item/iron-ore');assert.equal(popup.hidden,true);assert.equal(clock.innerHTML,clockBefore);assert.equal(calls.network,0);assert.equal(calls.writes,0);assert.deepEqual(errors,[]);cases++;
  // CSS declaration contracts, NOT browser geometry. JSDOM has no layout engine.
  const rules=[...style.sheet.cssRules];const direct=selector=>rules.find(r=>r.selectorText===selector)?.style;
  assert.equal(direct('.nav-wrap>nav.shell').getPropertyValue('width'),'100%');assert.equal(direct('.nav-wrap>nav.shell').getPropertyPriority('width'),'important');assert.equal(direct('.nav-wrap>nav.shell').flexWrap,'wrap');assert.equal(parseFloat(direct('.nav-wrap>nav.shell').minWidth),0);assert.equal(direct('.nav-wrap .nav-link').fontSize,'18px');assert.equal(direct('.nav-wrap .nav-link').whiteSpace,'normal');assert.equal(direct('.nav-wrap .nav-link').maxWidth,'100%');
  const row=rules.find(r=>r.conditionText==='(max-width:1500px)'),mobile=rules.find(r=>r.conditionText==='(max-width:700px)'&&[...r.cssRules].some(x=>x.selectorText==='.nav-wrap .nav-link'));assert(row&&mobile);
  const searchRule=[...row.cssRules].find(r=>r.selectorText==='.nav-wrap>nav.shell>.price-check-searchbar').style;assert.equal(searchRule.order,'-1');assert.equal(searchRule.flex,'0 0 100%');assert.equal(searchRule.justifyContent,'flex-end');assert.equal([...mobile.cssRules].find(r=>r.selectorText==='.nav-wrap .nav-link').style.fontSize,'16px');
 }finally{dom.window.close();}
}
assert(!/width:max-content!important/.test(css));assert(!/\.nav-wrap\{[^}]*overflow-(?:x|y):(?:auto|scroll|hidden)/.test(css));
console.log('PASS: '+cases+' DOM/CSS contract checks; actual native geometry UNVERIFIED; no HTTP/preferences writes');
