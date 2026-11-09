'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{JSDOM,VirtualConsole}=require('jsdom');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'web/theme-preview.js'),'utf8'),css=fs.readFileSync(path.join(root,'web/theme-preview.css'),'utf8');
const key='astra-design-preset-v1',backdropKey='astra-design-preset-backdrop-v1';
function fixture({saved={},blocked=false,absent=false}={}){
 const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM('<meta name="theme-color" content="#141b18"><body class="scenery-on" data-scenery-mode="classic" data-fm-backdrop="forest-room" data-brand-typeface="arcade"><header class="masthead brand-preview-masthead"><a class="brand">inflation .gg</a><span class="header-status">Original source clock</span></header><details id="display-options"><summary>Personal display options</summary><div id="brand-preview-options"><button id="brand-option">Individual brand</button></div><button data-scenery-mode="banner">Different scenery</button></details><div class="panel"><strong id="price">1,234 mesos</strong><time>2026-11-08T11:00:56Z</time></div><svg viewBox="0 0 140 88"><defs><linearGradient id="dial"><stop stop-color="#40c9d6"/><stop stop-color="#f3d44a"/><stop stop-color="#ef5350"/></linearGradient></defs><path d="M18 66 A52 52 0 0 1 122 66" stroke="url(#dial)"/><text x="70" y="80">200</text></svg><table><tbody><tr><td class="offer-buy">Buy</td><td class="offer-sell">Sell</td></tr></tbody></table>',{url:'https://inflation.gg/',runScripts:'outside-only',virtualConsole:vc});
 const w=dom.window,d=w.document,prefs=new Map([['astra-scenery','on'],['astra-scenery-mode','classic'],['astra-fm-backdrop-v1','forest-room'],['astra-brand-typeface','arcade'],...Object.entries(saved)]),calls={network:0,writes:[]};
 const store={getItem(k){if(blocked)throw Error('blocked');return prefs.get(k)??null},setItem(k,v){if(blocked)throw Error('blocked');calls.writes.push([k,v]);prefs.set(k,v)}};
 Object.defineProperty(w,'localStorage',{value:store});
 for(const method of ['fetch','XMLHttpRequest'])w[method]=()=>{calls.network++;throw Error('No data network')};w.navigator.sendBeacon=()=>{calls.network++;throw Error('No beacon')};
 let brandClicks=0;d.getElementById('brand-option').addEventListener('click',()=>brandClicks++);
 if(absent)d.getElementById('display-options').remove();
 const original={class:d.body.className,scenery:d.body.dataset.sceneryMode,backdrop:d.body.dataset.fmBackdrop,price:d.getElementById('price').outerHTML,clock:d.querySelector('time').outerHTML,svg:d.querySelector('svg').outerHTML};
 const style=d.createElement('style');style.textContent=css;d.head.append(style);w.eval(source);
 return{w,d,prefs,calls,errors,original,brandClicks:()=>brandClicks,close:()=>w.close()};
}
const choose=(f,value)=>f.d.querySelector(`[data-design-preset-choice="${value}"]`).click();
const back=(f,value)=>f.d.querySelector(`[data-design-preset-backdrop-choice="${value}"]`).click();
const selected=f=>[...f.d.querySelectorAll('[data-design-preset-choice][aria-pressed="true"]')].map(n=>n.dataset.designPresetChoice);
let groups=0;
{
 const f=fixture();try{
  assert.deepEqual(selected(f),['custom']);assert.equal(f.d.body.dataset.designPreset,undefined);assert.equal(f.calls.writes.length,0);assert.equal(f.d.getElementById('display-options').lastElementChild.id,'theme-preview-options');
  assert.equal(f.d.querySelectorAll('[data-color-scheme-choice]').length,3);assert.equal(f.calls.network,0);assert.deepEqual(f.errors,[]);groups++;
 }finally{f.close()}
}
{
 const f=fixture({saved:{'astra-color-scheme-v1':'maple-amber'}});try{
  const prior=new Map(f.prefs),meta=f.d.querySelector('meta').content,bodyColor=f.w.getComputedStyle(f.d.body).color;
  choose(f,'mesowatch');assert.equal(f.d.body.dataset.designPreset,'mesowatch');assert.equal(f.d.body.dataset.designPresetBackdrop,'sky');assert.deepEqual(selected(f),['mesowatch']);
  assert.equal(f.d.body.dataset.colorScheme,'maple-amber');back(f,'keep');assert.equal(f.d.body.dataset.designPresetBackdrop,'keep');
  choose(f,'custom');assert.equal(f.d.body.dataset.designPreset,undefined);assert.equal(f.d.body.dataset.designPresetBackdrop,undefined);assert.equal(f.w.getComputedStyle(f.d.body).color,bodyColor);assert.equal(f.d.querySelector('meta').content,meta);
  for(const[k,v]of prior)assert.equal(f.prefs.get(k),v,k);
  assert.equal(f.d.body.className,f.original.class);assert.equal(f.d.body.dataset.sceneryMode,f.original.scenery);assert.equal(f.d.body.dataset.fmBackdrop,f.original.backdrop);
  assert.equal(f.d.getElementById('price').outerHTML,f.original.price);assert.equal(f.d.querySelector('time').outerHTML,f.original.clock);assert.equal(f.d.querySelector('svg').outerHTML,f.original.svg);assert.equal(f.calls.network,0);groups++;
 }finally{f.close()}
}
for(const saved of [{[key]:'mesowatch',[backdropKey]:'keep'},{[key]:'invalid',[backdropKey]:'invalid'}]){
 const f=fixture({saved});try{assert.equal(f.d.body.dataset.designPreset,saved[key]==='mesowatch'?'mesowatch':undefined);if(saved[key]==='mesowatch')assert.equal(f.d.body.dataset.designPresetBackdrop,'keep');assert.equal(f.calls.network,0);groups++;}finally{f.close()}
}
{
 const f=fixture({blocked:true});try{choose(f,'mesowatch');back(f,'keep');assert.equal(f.d.body.dataset.designPreset,'mesowatch');assert.match(f.d.getElementById('design-preset-note').textContent,/works in this tab/);choose(f,'custom');assert.equal(f.d.body.dataset.designPreset,undefined);assert.deepEqual(f.errors,[]);groups++;}finally{f.close()}
}
{
 const f=fixture();try{
  choose(f,'mesowatch');f.d.querySelector('[data-scenery-mode]').click();assert.equal(f.d.body.dataset.designPreset,'mesowatch','scenery remains independent');
  f.d.querySelector('[data-color-scheme-choice="moonlit-ludibrium"]').click();assert.equal(f.d.body.dataset.designPreset,undefined);assert.equal(f.d.body.dataset.colorScheme,'moonlit-ludibrium');
  choose(f,'mesowatch');f.d.getElementById('brand-option').click();assert.equal(f.brandClicks(),1);assert.equal(f.d.body.dataset.designPreset,undefined);groups++;
 }finally{f.close()}
}
{
 const f=fixture();try{
  const storage=(k,v)=>f.w.dispatchEvent(new f.w.StorageEvent('storage',{key:k,newValue:v}));
  storage(key,'mesowatch');storage(backdropKey,'keep');assert.equal(f.d.body.dataset.designPresetBackdrop,'keep');storage('unrelated','custom');assert.equal(f.d.body.dataset.designPreset,'mesowatch');
  f.w.dispatchEvent(new f.w.StorageEvent('storage',{key,newValue:'custom',storageArea:f.w.sessionStorage}));assert.equal(f.d.body.dataset.designPreset,'mesowatch','session storage is not the preference source');
  storage(null,null);assert.equal(f.d.body.dataset.designPreset,undefined);choose(f,'mesowatch');assert.equal(f.d.body.dataset.designPresetBackdrop,'sky');
  f.w.eval(source);assert.equal(f.d.querySelectorAll('#design-preset-options').length,1);assert.equal(f.d.querySelectorAll('#theme-preview-options').length,1);groups++;
 }finally{f.close()}
}
{
 const f=fixture({absent:true});try{assert.equal(f.d.getElementById('design-preset-options'),null);assert.equal(f.d.body.dataset.designPreset,undefined);assert.equal(f.calls.network,0);groups++;}finally{f.close()}
}
const parsed=new JSDOM('<style></style>');parsed.window.document.querySelector('style').textContent=css;const rules=[...parsed.window.document.styleSheets[0].cssRules];
const rule=rules.find(r=>r.selectorText==='body[data-design-preset="mesowatch"]');assert(rule);
const colors=Object.fromEntries(['bg','surface','surface2','text','muted','gold','blue','mint','rose','violet'].map(k=>[k,rule.style.getPropertyValue('--'+k).trim()]));
const luminance=c=>c.slice(1).match(/../g).map(n=>parseInt(n,16)/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4).reduce((sum,n,i)=>sum+n*[.2126,.7152,.0722][i],0);
for(const background of ['bg','surface','surface2'])for(const foreground of ['text','muted','gold','blue','mint','rose','violet']){const x=luminance(colors[foreground]),y=luminance(colors[background]);assert((Math.max(x,y)+.05)/(Math.min(x,y)+.05)>=4.5,foreground+'/'+background)}
assert.notEqual(colors.mint,colors.gold);assert(!/@import|url\(/i.test(css),'no new font/image/network import');
assert(!/stop-color|stroke-dasharray|viewBox/.test(css.slice(css.indexOf('/* Optional Maple-style reference treatment;'))),'continuous dial stops/reference geometry remain original');
assert(rules.some(r=>r.conditionText==='(max-width:600px)'));assert(rules.some(r=>r.selectorText?.includes('[data-design-preset-backdrop="sky"]')));parsed.window.close();groups++;
assert(rules.some(r=>r.selectorText?.includes('[data-brand-typeface="pixel"]')&&r.style.getPropertyValue('font-family')==='var(--font)'),'preset overrides optional pixel control type only while active');groups++;
console.log(JSON.stringify({presetGroupsPassed:groups,defaultAndSavedChoicesUnchanged:true,pricesClocksSvgRawUnchanged:true,networkCalls:0,contrast:'>=4.5 all 21 light-preset token pairs',responsive:'scoped CSS rules; native viewport/ink QA remains separate'}));

// R2: the actual existing API-cash markup and selectors must retain side roles.
{
 const api=fs.readFileSync(path.join(root,'web/api-cash-ui.js'),'utf8'),markup=api.match(/section\.innerHTML='([^']+)';/)[1];
 const dom=new JSDOM('<!doctype html><head></head><body>'+markup+'<button id="neutral-preset-test" aria-pressed="true">Neutral</button></body>');
 const w=dom.window,d=w.document;
 for(const name of ['style.css','api-cash-ui.css','theme-preview.css']){const s=d.createElement('style');s.textContent=fs.readFileSync(path.join(root,'web',name),'utf8');d.head.append(s)}
 const buttons=['buy','sell'].map(side=>d.querySelector('[data-api-cash-side="'+side+'"]')),labels=buttons.map(n=>n.textContent),result=[];
 for(const scheme of [null,'maple-amber','moonlit-ludibrium'])for(const selected of [null,'buy','sell']){
  if(scheme===null)delete d.body.dataset.colorScheme;else d.body.dataset.colorScheme=scheme;
  buttons.forEach(n=>n.setAttribute('aria-pressed',String(n.dataset.apiCashSide===selected)));
  delete d.body.dataset.designPreset;const off=buttons.map(n=>w.getComputedStyle(n).color);assert.notEqual(off[0],off[1]);
  d.body.dataset.designPreset='mesowatch';const on=buttons.map(n=>w.getComputedStyle(n).color);assert.notEqual(on[0],on[1],'both selected and unselected API side text keeps distinct meanings');assert.equal(on[0],'var(--mint)');assert.equal(on[1],'var(--gold)');
  assert.deepEqual(buttons.map(n=>n.textContent),labels);assert.equal(w.getComputedStyle(d.getElementById('neutral-preset-test')).color,'var(--text)','ordinary preset button treatment still applies');
  delete d.body.dataset.designPreset;assert.deepEqual(buttons.map(n=>w.getComputedStyle(n).color),off,'Off restores original role colors');result.push(selected);
 }
 w.close();console.log(JSON.stringify({actualApiSideStatesPassed:result.length,labelsAndRolesPreserved:true,neutralPresetStyleRetained:true,native:false}));
}

// R3: native findings, exercised against the actual category SVG function and CSS.
{
 const app=fs.readFileSync(path.join(root,'web/app.js'),'utf8');
 const start=app.indexOf('function categoryScale(values){'),end=app.indexOf('function renderCategoryCards(){',start);
 assert(start>=0&&end>start);const functions=app.slice(start,end);
 const gauge=new Function('number','let chartSerial=0;'+functions+';return categoryGauge;')((v,d=0)=>v.toLocaleString('en-US',{maximumFractionDigits:d}));
 const dom=new JSDOM('<!doctype html><head><style>'+css+'</style></head><body><section id="category-section">'+gauge(159.3,200)+gauge(409,500)+gauge(0,200)+'</section></body>');
 const d=dom.window.document,w=dom.window,svgs=[...d.querySelectorAll('svg')],raw=svgs.map(n=>n.outerHTML);
 const strokes=[...d.querySelectorAll('.category-needle,.category-reference')],hubs=[...d.querySelectorAll('circle[fill="#e3e4d6"]')];
 assert.equal(strokes.length,6);assert.equal(hubs.length,3);assert(strokes.every(n=>n.getAttribute('stroke')==='#e3e4d6'));
 const off=strokes.map(n=>w.getComputedStyle(n).stroke),offFill=hubs.map(n=>w.getComputedStyle(n).fill);
 d.body.dataset.designPreset='mesowatch';
 for(const n of strokes)assert.equal(w.getComputedStyle(n).stroke,'var(--text)','actual needle/reference uses light-theme ink');
 for(const n of hubs)assert.equal(w.getComputedStyle(n).fill,'var(--text)','actual hub uses light-theme ink');
 const x=luminance(colors.text),y=luminance(colors.surface);assert((y+.05)/(x+.05)>=4.5);
 assert.deepEqual(svgs.map(n=>n.outerHTML),raw,'CSS leaves all original paths/coordinates/stops/attributes byte-identical');
 delete d.body.dataset.designPreset;assert.deepEqual(strokes.map(n=>w.getComputedStyle(n).stroke),off);assert.deepEqual(hubs.map(n=>w.getComputedStyle(n).fill),offFill);
 w.close();console.log(JSON.stringify({actualCategorySvgCases:3,needleReferenceHubContrast:'>=4.5:1 cream',rawGeometryGradientsUnchanged:true,offRestored:true}));
}
{
 // JSDOM has no native media layout: evaluate the real stylesheet's width rules
 // explicitly, then ask its cascade for the actual category-name element.
 function widthCss(sheet,width){return [...sheet.cssRules].map(r=>{
  if(r.type===1)return r.cssText;
  if(r.type!==4)return '';
  const terms=r.conditionText.split(/\s+and\s+/),matches=terms.every(t=>{const m=t.match(/^\((max|min)-width:\s*(\d+)px\)$/);return m?(m[1]==='max'?width<=+m[2]:width>=+m[2]):false});
  return matches?[...r.cssRules].map(n=>n.cssText).join('\n'):'';
 }).join('\n')}
 const d=new JSDOM('<style></style>').window.document;d.querySelector('style').textContent=css;
 const media=[...d.styleSheets[0].cssRules].filter(r=>r.type===4&&r.conditionText==='(max-width:600px)');
 const font=media.flatMap(r=>[...r.cssRules]).find(r=>r.selectorText==='body[data-design-preset="mesowatch"] .category-name');
 assert(font);assert.equal(font.style.getPropertyValue('font-size'),'16px');assert.equal(font.style.length,1,'only narrow label size changes');
 for(const width of [320,600,601,1280])for(const enabled of [false,true]){
  const h=new JSDOM('<style></style><body><section id="category-section"><article class="category-card"><div class="category-main"><div class="category-top"><span class="category-name">Consumables</span></div></div></article></section></body>');
  const hd=h.window.document,style=hd.querySelector('style');
  for(const file of ['style.css','theme-preview.css']){
   const s=new JSDOM('<style></style>');s.window.document.querySelector('style').textContent=fs.readFileSync(path.join(root,'web',file),'utf8');style.textContent+='\n'+widthCss(s.window.document.styleSheets[0],width);s.window.close();
  }
  if(enabled)hd.body.dataset.designPreset='mesowatch';
  const name=hd.querySelector('.category-name'),computed=h.window.getComputedStyle(name);
  if(enabled&&width<=600)assert.equal(computed.fontSize,'16px');else assert.notEqual(computed.fontSize,'16px','new rule does not escape breakpoint or preset');
  assert.equal(name.textContent,'Consumables');h.window.close();
 }
 d.defaultView.close();console.log(JSON.stringify({narrowFontCases:8,cssOnlyFontBound:'16px at <=600 only with preset',nativeTextFit:'Root viewport QA required'}));
}
{
 const h=new JSDOM('<style></style><body class="scenery-on" data-scenery-mode="backdrop" data-ellinia-backdrop="bright"></body>'),d=h.window.document;
 d.querySelector('style').textContent=css;const all=[...d.styleSheets[0].cssRules];
 const keep=all.find(r=>r.selectorText==='body[data-design-preset="mesowatch"][data-design-preset-backdrop="keep"]::before');
 assert(keep);assert.equal(keep.style.length,1);assert.equal(Number(keep.style.opacity),.25);assert.equal(keep.style.getPropertyPriority('opacity'),'important');
 const target=keep.selectorText.replace('::before','');assert(!d.body.matches(target),'Off never caps art');
 const attrs=d.body.outerHTML;d.body.dataset.designPreset='mesowatch';d.body.dataset.designPresetBackdrop='sky';assert(!d.body.matches(target));
 d.body.dataset.designPresetBackdrop='keep';assert(d.body.matches(target));
 const opacity=Number(keep.style.opacity),ink=luminance(colors.text),backgrounds=['#6ec6ff','#a4ddfa','#d7eed5'];
 for(const bg of backgrounds){const mixed='#'+bg.slice(1).match(/../g).map(n=>Math.round(parseInt(n,16)*(1-opacity)).toString(16).padStart(2,'0')).join('');assert((luminance(mixed)+.05)/(ink+.05)>=4.5,'primary ink remains readable even over opaque black art at all base-gradient stops')}
 for(const value of ['bright','soft','framed']){d.body.dataset.elliniaBackdrop=value;assert(d.body.matches(target))}
 delete d.body.dataset.designPreset;delete d.body.dataset.designPresetBackdrop;d.body.dataset.elliniaBackdrop='bright';assert.equal(d.body.outerHTML,attrs,'all original scenery attributes restored');
 const scenery=fs.readFileSync(path.join(root,'web/ellinia-backdrop-preview.css'),'utf8');assert(/opacity:1/.test(scenery));assert(/ellinia-game-map-v1\.webp/.test(scenery));
 h.window.close();console.log(JSON.stringify({keepSceneryPrimaryTextWorstBlackContrast:'>=4.5 across sky-gradient endpoints',artOpacity:.25,offAndSkyExcluded:true,originalSceneryPreferencesAndAssetsUnchanged:true,nativeCompositing:'Root QA required'}));
}

// The refinement must never replace or silently migrate the original cute preset.
{
 const f=fixture({saved:{[key]:'mesowatch',[backdropKey]:'keep'}});try{
  assert.deepEqual(selected(f),['mesowatch']);assert.equal(f.d.body.dataset.designPresetRefine,undefined);
  const oldAttrs=[f.d.body.dataset.sceneryMode,f.d.body.dataset.fmBackdrop,f.d.body.dataset.brandTypeface], oldSvg=f.d.querySelector('svg').outerHTML;
  const oldFont=f.w.getComputedStyle(f.d.querySelector('.brand')).fontSize;
  choose(f,'mesowatch-refine');assert.deepEqual(selected(f),['mesowatch-refine']);assert.equal(f.d.body.dataset.designPreset,'mesowatch');assert.equal(f.d.body.dataset.designPresetRefine,'on');assert.equal(f.d.body.dataset.designPresetBackdrop,'keep');
  assert.match(f.d.getElementById('design-preset-note').textContent,/Refined spacing/);assert.equal(f.prefs.get(key),'mesowatch-refine');
  choose(f,'mesowatch');assert.deepEqual(selected(f),['mesowatch']);assert.equal(f.d.body.dataset.designPresetRefine,undefined);assert.equal(f.w.getComputedStyle(f.d.querySelector('.brand')).fontSize,oldFont);
  assert.deepEqual([f.d.body.dataset.sceneryMode,f.d.body.dataset.fmBackdrop,f.d.body.dataset.brandTypeface],oldAttrs);assert.equal(f.d.querySelector('svg').outerHTML,oldSvg);assert.equal(f.calls.network,0);
  choose(f,'mesowatch-refine');f.d.getElementById('brand-option').click();assert.equal(f.d.body.dataset.designPreset,undefined);assert.equal(f.d.body.dataset.designPresetRefine,undefined);
 }finally{f.close()}
}
{
 const f=fixture({saved:{[key]:'mesowatch-refine',[backdropKey]:'keep'}});try{
  assert.equal(f.d.body.dataset.designPresetRefine,'on');assert.equal(f.d.body.dataset.designPresetBackdrop,'keep');
  back(f,'sky');assert.equal(f.d.body.dataset.designPresetRefine,'on');
  f.w.dispatchEvent(new f.w.StorageEvent('storage',{key,newValue:'mesowatch'}));assert.equal(f.d.body.dataset.designPresetRefine,undefined);assert.equal(f.d.body.dataset.designPreset,'mesowatch');
  f.w.dispatchEvent(new f.w.StorageEvent('storage',{key,newValue:'mesowatch-refine'}));assert.equal(f.d.body.dataset.designPresetRefine,'on');
  f.w.dispatchEvent(new f.w.StorageEvent('storage',{key:null,newValue:null}));assert.equal(f.d.body.dataset.designPreset,undefined);assert.equal(f.d.body.dataset.designPresetRefine,undefined);
  assert.equal(f.d.querySelectorAll('[data-design-preset-choice]').length,3);assert.equal(f.calls.network,0);
 }finally{f.close()}
}
{
 const f=fixture({blocked:true});try{choose(f,'mesowatch-refine');assert.equal(f.d.body.dataset.designPresetRefine,'on');choose(f,'custom');assert.equal(f.d.body.dataset.designPresetRefine,undefined);assert.deepEqual(f.errors,[])}finally{f.close()}
 const h=new JSDOM('<style></style><body><header class="masthead brand-preview-masthead"><a class="brand">Logo</a></header><p class="notice">Same source clock</p></body>');const d=h.window.document;d.querySelector('style').textContent=css;
 d.body.dataset.designPreset='mesowatch';const original=h.window.getComputedStyle(d.querySelector('.notice')).backgroundColor;
 d.body.dataset.designPresetRefine='on';assert.equal(h.window.getComputedStyle(d.querySelector('.notice')).backgroundColor,'rgb(255, 248, 230)');
 delete d.body.dataset.designPresetRefine;assert.equal(h.window.getComputedStyle(d.querySelector('.notice')).backgroundColor,original);
 const block=css.slice(css.indexOf('/* Refinement is a separate optional layer;'));
 assert(!/url\(|@import|stop-color|stroke-dasharray|viewBox|data-api-cash-side/.test(block));assert.equal(d.querySelector('.notice').textContent,'Same source clock');h.window.close();
 console.log(JSON.stringify({refinementGroupsPassed:3,originalCutePresetRetained:true,savedOriginalDoesNotMigrate:true,independentRefinementRestoreAndStorage:true,networkCalls:0,nativeQaPending:true}));
}
