const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'web/theme-preview.js'),'utf8'),css=fs.readFileSync(path.join(root,'web/theme-preview.css'),'utf8'),key='astra-color-scheme-v1';
function fixture({saved,blocked=false,absent=false}={}){
 const dom=new JSDOM(`<meta name="theme-color" content="#141b18"><body><details id="display-options"><summary>Personal display options</summary><div id="existing-display">Existing control</div></details><div class="panel"><strong id="sample-price">1,234 mesos</strong></div><svg><circle cx="1" cy="2" stroke="#89c6b0" fill="#edc471" data-chart-value="1234" data-chart-series="Buy offers"/><path stroke="#87bdcf" d="M1 2L3 4"/></svg><i class="status-green"></i><i class="status-amber"></i><i class="status-red"></i>`,{url:'https://inflation.gg/',runScripts:'outside-only'});
 const w=dom.window,d=w.document,preferences=new Map(saved===undefined?[]:[[key,saved]]),calls={network:0,writes:[]};
 for(const name of ['fetch','XMLHttpRequest'])w[name]=()=>{calls.network++;throw Error('No network allowed');};
 w.navigator.sendBeacon=()=>{calls.network++;throw Error('No beacon allowed');};
 Object.defineProperty(w,'localStorage',{value:{getItem:name=>{if(blocked)throw Error('blocked');return preferences.get(name)??null;},setItem:(name,value)=>{if(blocked)throw Error('blocked');calls.writes.push([name,value]);preferences.set(name,value);}}});
 if(absent)d.getElementById('display-options').remove();
 const geometry=d.querySelector('svg').outerHTML,price=d.getElementById('sample-price').outerHTML;
 const style=d.createElement('style');style.textContent=css;d.head.append(style);w.eval(source);
 return{dom,w,d,preferences,calls,geometry,price,close:()=>w.close()};
}
const choose=(f,value)=>f.d.querySelector(`[data-color-scheme-choice="${value}"]`).click();
const selected=f=>[...f.d.querySelectorAll('[data-color-scheme-choice][aria-pressed="true"]')].map(b=>b.dataset.colorSchemeChoice);
const f=fixture();
assert.equal(f.d.body.hasAttribute('data-color-scheme'),false,'approved green has no theme overrides');
assert.equal(f.d.querySelector('meta[name="theme-color"]').content,'#141b18');
assert.deepEqual(selected(f),['ellinia']);assert.equal(f.d.getElementById('display-options').lastElementChild.id,'theme-preview-options');
assert.equal(f.d.querySelectorAll('[data-color-scheme-choice]').length,3);
for(const mode of ['maple-amber','moonlit-ludibrium','ellinia']){
 choose(f,mode);assert.deepEqual(selected(f),[mode]);assert.equal(f.preferences.get(key),mode);
 assert.equal(f.d.body.dataset.colorScheme,mode==='ellinia'?undefined:mode);
 assert.equal(f.d.querySelector('svg').outerHTML,f.geometry,'themes never mutate chart data or geometry');
 assert.equal(f.d.getElementById('sample-price').outerHTML,f.price,'prices remain untouched');
 const restored=fixture({saved:mode});assert.deepEqual(selected(restored),[mode]);assert.equal(restored.calls.network,0);restored.close();
}
f.w.eval(source);assert.equal(f.d.querySelectorAll('#theme-preview-options').length,1);
f.w.dispatchEvent(new f.w.StorageEvent('storage',{key,newValue:'moonlit-ludibrium'}));assert.deepEqual(selected(f),['moonlit-ludibrium']);
assert.equal(f.calls.network,0);f.close();
for(const options of [{saved:'invalid'},{saved:'maple-amber',blocked:true}]){
 const safe=fixture(options);assert.deepEqual(selected(safe),['ellinia']);choose(safe,'maple-amber');assert.deepEqual(selected(safe),['maple-amber']);
 if(options.blocked)assert.match(safe.d.querySelector('.theme-preview-note').textContent,/works in this tab/);
 assert.equal(safe.calls.network,0);safe.close();
}
const absent=fixture({absent:true});assert.equal(absent.d.getElementById('theme-preview-options'),null);absent.close();

// WCAG relative luminance / contrast checks for actual alternate CSS tokens.
const rgb=hex=>hex.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);
const luminance=hex=>{const [r,g,b]=rgb(hex);return .2126*r+.7152*g+.0722*b;};
const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
const parsed=new JSDOM('<style></style>');parsed.window.document.querySelector('style').textContent=css;
const rules=[...parsed.window.document.styleSheets[0].cssRules];
for(const theme of ['maple-amber','moonlit-ludibrium']){
 const rule=rules.find(r=>r.selectorText===`body[data-color-scheme="${theme}"]`);assert(rule);
 const colors=Object.fromEntries(['bg','surface','surface2','text','muted','gold','blue','mint','rose','violet'].map(k=>[k,rule.style.getPropertyValue('--'+k).trim()]));
 for(const background of ['bg','surface','surface2'])for(const foreground of ['text','muted','gold','blue','mint','rose','violet'])
  assert(contrast(colors[foreground],colors[background])>=4.5,`${theme} ${foreground}/${background} contrast`);
 assert.notEqual(colors.mint,colors.gold);assert.notEqual(colors.rose,colors.mint);
}
assert(!/@import|url\(/i.test(css),'no external asset requests');
assert.match(css,/\.status-green\{background:#89c6b0\}/);assert.match(css,/\.status-amber\{background:#edc471\}/);assert.match(css,/\.status-red\{background:#d9a1a0\}/);
assert.match(css,/\[stroke="#89c6b0"\]\{stroke:var\(--mint\)\}/);assert.match(css,/\[stroke="#edc471"\]\{stroke:var\(--gold\)\}/);
assert(!css.includes(':root'),'no change to default green variables');parsed.window.close();
console.log('PASS: default-green unchanged, two saved/local-only accessible palettes, blocked/invalid storage, chart/price identity, semantic buy/sell/status colors and >=4.5 text contrast');
