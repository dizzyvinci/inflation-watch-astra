const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {JSDOM,VirtualConsole}=require('jsdom');
const script=fs.readFileSync(path.join(__dirname,'../web/ellinia-backdrop-preview.js'),'utf8'),css=fs.readFileSync(path.join(__dirname,'../web/ellinia-backdrop-preview.css'),'utf8');
const key='astra-ellinia-backdrop-v1';
function fixture(saved,blocked=false,host=true){
 const errors=[],calls={network:0,writes:[]},preferences=new Map(saved===undefined?[]:[[key,saved]]),vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM(`<body class="scenery-on" data-scenery-mode="backdrop"><div class="market-scene">Original banner</div>${host?'<fieldset id="scenery-options"><legend>Scenery</legend><button data-scenery-mode="classic">Current pairing</button><p>Original scenery explanation.</p></fieldset>':''}<footer>Protected personal paragraph.</footer></body>`,{url:'https://inflation.gg/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});
 const w=dom.window,d=w.document;w.fetch=()=>{calls.network++;throw Error('No HTTP')};w.XMLHttpRequest=function(){calls.network++;throw Error('No HTTP')};w.navigator.sendBeacon=()=>{calls.network++;throw Error('No tracking')};
 Object.defineProperty(w,'localStorage',{value:{getItem(k){if(blocked)throw Error('Blocked');return preferences.get(k)??null},setItem(k,v){calls.writes.push([k,v]);if(blocked)throw Error('Blocked');preferences.set(k,v)}}});
 const style=d.createElement('style');style.textContent=css;d.head.append(style);const before={banner:d.querySelector('.market-scene').outerHTML,footer:d.querySelector('footer').outerHTML};w.eval(script);
 return {w,d,calls,preferences,errors,before,close:()=>w.close()};
}
const pick=(f,value)=>f.d.querySelector(`[data-ellinia-backdrop-choice="${value}"]`);
for(const [saved,blocked,expected] of [[undefined,false,'current'],['invalid',false,'current'],['framed',true,'current'],['bright',false,'bright'],['soft',false,'soft'],['framed',false,'framed']]){
 const f=fixture(saved,blocked);try{
  assert.equal(f.d.body.dataset.elliniaBackdrop,expected);assert.equal(f.d.querySelectorAll('[aria-pressed="true"]').length,1);assert.equal(pick(f,expected).getAttribute('aria-pressed'),'true');
  assert.equal(f.d.getElementById('scenery-options').lastElementChild.id,'ellinia-backdrop-options');
  for(const value of ['bright','soft','framed','current']){pick(f,value).click();assert.equal(f.d.body.dataset.elliniaBackdrop,value);assert.equal(pick(f,value).getAttribute('aria-pressed'),'true');if(!blocked)assert.equal(f.preferences.get(key),value)}
  for(const mode of ['classic','banner','zakum-dark','ellinia-original']){f.d.body.dataset.sceneryMode=mode;pick(f,'bright').click();assert.equal(f.d.body.dataset.sceneryMode,mode)}
  f.d.body.classList.remove('scenery-on');pick(f,'framed').click();assert.equal(f.d.body.classList.contains('scenery-on'),false);
  assert.equal(f.d.querySelector('.market-scene').outerHTML,f.before.banner);assert.equal(f.d.querySelector('footer').outerHTML,f.before.footer);
  f.d.body.dataset.viewerPreview='on';assert.equal(f.w.getComputedStyle(f.d.getElementById('ellinia-backdrop-options')).display,'none');
  f.w.eval(script);assert.equal(f.d.querySelectorAll('#ellinia-backdrop-options').length,1);assert.equal(f.calls.network,0);assert.deepEqual(f.errors,[]);
 }finally{f.close()}
}
const missing=fixture(undefined,false,false);assert.equal(missing.d.querySelector('#ellinia-backdrop-options'),null);assert.equal(missing.calls.network,0);missing.close();
assert.doesNotMatch(css,/@import|https?:\/\//);assert(!css.includes('[data-ellinia-backdrop="current"]::before'),'default makes no backdrop override');
for(const value of ['bright','soft','framed'])assert(css.includes(`body.scenery-on[data-scenery-mode="backdrop"][data-ellinia-backdrop="${value}"]::before`));
assert(css.includes('mask-image:none'));assert(css.includes('background-repeat:no-repeat'));assert(css.includes('background-color:#315b3d'));assert(css.includes('auto 85vh,auto 75vh,100% 100%'));assert(!css.includes('background-size:cover'));
for(const name of ['ellinia-game-map-v1.webp','ellinia-scenery.png'])assert(fs.existsSync(path.join(__dirname,'../assets',name)),`original local asset exists: ${name}`);
console.log('PASS Ellinia-only backdrop choices: untouched current default, persistence/blocked fallback, end controls, no duplicate injection/network, scenery/banner isolation, viewer hiding and original local art.');
