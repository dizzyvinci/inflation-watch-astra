const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {JSDOM,VirtualConsole}=require('jsdom');
const root=path.resolve(__dirname,'..'),script=fs.readFileSync(path.join(root,'web/nav-preview.js'),'utf8'),css=fs.readFileSync(path.join(root,'web/nav-preview.css'),'utf8'),viewer=fs.readFileSync(path.join(root,'web/viewer-preview.css'),'utf8');
const basketKey='astra-nav-basket-visible-v1',cashKey='astra-nav-cash-basket-visible-v1';
function fixture({preferences=new Map(),blocked=false,missing=false}={}){
 const calls={network:0,reads:[],writes:[]},errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM(missing?'<main>No navigation</main>':'<div class="nav-wrap"><nav><a class="nav-link" href="#index">Overview</a><a class="nav-link" href="#basket">The Basket</a><a class="nav-link" href="#cash-basket">Cash Basket</a><a class="nav-link" href="#sources">Status</a></nav></div><main><details id="display-options"></details><section id="view-basket">Original basket content/history</section><section id="view-cash-basket">Original cash content/history</section><a id="goods-details" href="#basket">Full basket details</a><a id="cash-details" href="#cash-basket">Cash history and weights</a></main>',{url:'https://inflation.gg/#cash-basket',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});
 const w=dom.window,doc=w.document;w.fetch=()=>{calls.network++;throw Error('No HTTP');};w.XMLHttpRequest=function(){calls.network++;throw Error('No XHR');};w.navigator.sendBeacon=()=>{calls.network++;throw Error('No analytics');};
 Object.defineProperty(w,'localStorage',{value:{getItem(key){calls.reads.push(key);if(blocked)throw Error('Blocked');return preferences.get(key)??null;},setItem(key,value){calls.writes.push([key,value]);if(blocked)throw Error('Blocked');preferences.set(key,value);}}});
 const style=doc.createElement('style');style.textContent='.nav-link{display:flex}\n'+viewer+'\n'+css;doc.head.append(style);
 const before={links:[...doc.querySelectorAll('nav a')],pages:[...doc.querySelectorAll('section')].map(node=>[node,node.outerHTML]),hash:w.location.hash};w.eval(script);return{w,doc,calls,errors,before,preferences,close:()=>w.close()};
}
let f=fixture();try{
 const [overview,basket,cash,status]=f.before.links;assert.equal(basket.hidden,true);assert.equal(cash.hidden,true);assert.equal(f.w.getComputedStyle(basket).display,'none');assert.equal(overview.hidden,false);assert.equal(status.hidden,false);
 assert.equal(f.doc.getElementById('goods-details').hidden,false);assert.equal(f.doc.getElementById('cash-details').hidden,false);
 assert.equal(f.w.location.hash,f.before.hash);for(const [node,html]of f.before.pages)assert.equal(node.outerHTML,html,'only navigation changes');
 const controls=f.doc.getElementById('nav-preview-options');assert.equal(controls.parentElement.id,'display-options');assert.equal(controls.dataset.previewControls,'true');assert.match(f.w.getComputedStyle(controls).outline,/3px solid #d65b68/);
 const button=f.doc.querySelector('[data-preview-nav="basket"]');button.click();assert.equal(basket.hidden,false);assert.equal(button.getAttribute('aria-pressed'),'true');assert.equal(f.preferences.get(basketKey),'on');assert.equal(f.doc.querySelector('nav a[href="#basket"]'),basket);
 f.doc.querySelector('[data-preview-nav="cash-basket"]').click();assert.equal(cash.hidden,false);assert.equal(cash.getAttribute('href'),'#cash-basket');
 f.doc.body.dataset.viewerPreview='on';assert.equal(f.w.getComputedStyle(controls).display,'none');assert.equal(basket.hidden,false,'viewer preserves the selected nav state');delete f.doc.body.dataset.viewerPreview;
 button.click();assert.equal(basket.hidden,true);assert.equal(f.preferences.get(basketKey),'off');f.w.eval(script);assert.equal(f.doc.querySelectorAll('#nav-preview-options').length,1);assert.equal(f.doc.querySelectorAll('nav a').length,4);
 assert.deepEqual(f.calls.reads,[basketKey,cashKey]);assert.equal(f.calls.network,0);assert.deepEqual(f.errors,[]);
}finally{f.close();}
for(const [preference,expected]of [['on',false],['off',true],['invalid',true]]){f=fixture({preferences:new Map([[basketKey,preference],[cashKey,preference]])});try{assert.equal(f.doc.querySelector('nav a[href="#basket"]').hidden,expected);assert.equal(f.doc.querySelector('nav a[href="#cash-basket"]').hidden,expected);}finally{f.close();}}
f=fixture({blocked:true});try{const link=f.doc.querySelector('nav a[href="#basket"]');assert(link.hidden);f.doc.querySelector('[data-preview-nav="basket"]').click();assert.equal(link.hidden,false);assert.equal(f.calls.network,0);assert.deepEqual(f.errors,[]);}finally{f.close();}
f=fixture({missing:true});try{assert.equal(f.doc.getElementById('nav-preview-options'),null);assert.equal(f.calls.network,0);}finally{f.close();}
assert.doesNotMatch(css,/@import|https?:\/\/|url\(/);
console.log('PASS: two optional nav links default Off, original pages/anchors/routes retained, explicit preferences/viewer selection, bold preview controls, blocked storage and zero HTTP');
