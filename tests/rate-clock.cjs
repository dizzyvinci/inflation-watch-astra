const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {JSDOM,VirtualConsole}=require('jsdom');
const script=fs.readFileSync(path.join(__dirname,'../web/rate-clock.js'),'utf8');
function fixture({saved=null,blocked=false,zone='UTC',html}={}){
 const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM(html??'<details id="display-options"><summary>Personal display options</summary></details><select id="display-timezone"><option>UTC</option><option>America/Chicago</option><option>invalid-zone</option></select><div class="hero-copy"><p id="rate-kind" data-market-at="2026-11-04T08:30:00Z" data-observation-kind="daily">As of MPI source Nov 4, 08:30 UTC</p><span id="main-rate">19.31</span></div>',{url:'https://inflation.gg/#index',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});
 const w=dom.window,intervals=new Map(),calls={network:0,reads:[],writes:[],clears:0};let now=Date.parse('2026-11-05T12:34:56Z'),serial=0,hidden=false;
 const RealDate=w.Date;w.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}};
 Object.defineProperty(w.document,'hidden',{get:()=>hidden});
 w.setInterval=(fn,ms)=>{assert.equal(ms,1000);intervals.set(++serial,fn);return serial;};w.clearInterval=id=>{calls.clears++;intervals.delete(id);};
 Object.defineProperty(w,'localStorage',{value:{getItem(k){calls.reads.push(k);if(blocked)throw Error('Storage blocked');return saved;},setItem(k,v){calls.writes.push([k,v]);if(blocked)throw Error('Storage blocked');saved=v;}}});
 w.fetch=()=>{calls.network++;throw Error('No requests');};w.XMLHttpRequest=function(){calls.network++;throw Error('No requests');};w.navigator.sendBeacon=()=>{calls.network++;throw Error('No beacons');};
 if(w.document.querySelector('select'))w.document.querySelector('select').value=zone;
 const sourceBefore=w.document.getElementById('rate-kind')?.outerHTML;w.eval(script);
 return{dom,w,doc:w.document,calls,intervals,errors,sourceBefore,advance(ms=1000){now+=ms;for(const fn of [...intervals.values()])fn();},visibility(value){hidden=value;w.document.dispatchEvent(new w.Event('visibilitychange'));}};
}
function choose(f,mode){f.doc.querySelector(`[data-rate-clock="${mode}"]`).click();}
const f=fixture();
try{
 const clock=f.doc.getElementById('rate-current-clock'),time=clock.querySelector('time'),source=f.doc.getElementById('rate-kind');
 assert.equal(clock.previousElementSibling,source);assert.equal(clock.hidden,false);assert.equal(time.textContent,'12:34:56 UTC');assert.equal(time.dateTime,'2026-11-05T12:34:56.000Z');assert.match(clock.textContent,/Now: .*collector checks ~10 min/);assert.equal(clock.dataset.clockKind,'view');assert.equal(clock.getAttribute('aria-live'),'off');assert.equal(f.intervals.size,1);assert.equal(f.doc.getElementById('display-options').open,false);
 f.advance();assert.equal(time.textContent,'12:34:57 UTC');assert.equal(time.dateTime,'2026-11-05T12:34:57.000Z');assert.equal(source.outerHTML,f.sourceBefore);assert.equal(f.doc.getElementById('main-rate').textContent,'19.31');assert.equal(f.calls.network,0);
 const select=f.doc.getElementById('display-timezone');select.value='America/Chicago';select.dispatchEvent(new f.w.Event('change'));assert.equal(time.textContent,'06:34:57 America/Chicago');assert.equal(clock.dataset.timeZone,'America/Chicago');assert.equal(source.outerHTML,f.sourceBefore,'App owns market-source formatting; the view clock never writes it');
 select.value='invalid-zone';select.dispatchEvent(new f.w.Event('change'));assert.equal(time.textContent,'12:34:57 UTC');assert.equal(clock.dataset.timeZone,'UTC');
 choose(f,'source');assert.equal(clock.hidden,true);assert.equal(f.intervals.size,0);assert.deepEqual(f.calls.writes.at(-1),['astra-rate-clock-v1','source']);const old=time.textContent;f.advance(10000);assert.equal(time.textContent,old);
 choose(f,'current-source');assert.equal(clock.hidden,false);assert.equal(f.intervals.size,1);assert.equal(time.textContent,'12:35:07 UTC');assert.equal(source.outerHTML,f.sourceBefore);
 f.visibility(true);assert.equal(f.intervals.size,0);f.advance(3000);f.visibility(false);assert.equal(f.intervals.size,1);assert.equal(time.textContent,'12:35:10 UTC');
 const data={sourceUpdatedAt:'2026-11-04T08:30:00Z',live:{observedAt:'2026-11-04T09:00:00Z'}};const original=JSON.stringify(data);f.doc.dispatchEvent(new f.w.CustomEvent('astramarketsnapshot',{detail:data}));assert.equal(JSON.stringify(data),original);assert.equal(source.outerHTML,f.sourceBefore);
 f.w.eval(script);assert.equal(f.doc.querySelectorAll('#rate-current-clock').length,1);assert.equal(f.doc.querySelectorAll('.rate-clock-options').length,1);assert.equal(f.intervals.size,1);assert.equal(f.doc.querySelectorAll('#display-timezone').length,1);assert(f.calls.writes.every(([key])=>key==='astra-rate-clock-v1'));assert.equal(f.calls.network,0);assert.deepEqual(f.errors,[]);
}finally{f.dom.window.close();}
for(const [saved,blocked,expected] of [['source',false,'source'],['current-source',false,'current-source'],['invalid',false,'current-source'],['source',true,'current-source']]){
 const p=fixture({saved,blocked});try{assert.equal(p.doc.querySelector('#rate-current-clock').hidden,expected==='source');assert.equal(p.intervals.size,expected==='source'?0:1);choose(p,'source');assert.equal(p.intervals.size,0);choose(p,'current-source');assert.equal(p.intervals.size,1);assert.equal(p.calls.network,0);assert.deepEqual(p.errors,[]);}finally{p.dom.window.close();}
}
const missing=fixture({html:'<main>No headline</main>'});try{assert.equal(missing.intervals.size,0);assert.equal(missing.doc.querySelector('#rate-current-clock'),null);assert.equal(missing.calls.network,0);}finally{missing.dom.window.close();}
console.log('PASS: independent second-by-second view clock, selected zone/fallback, source-only persistence, hidden-tab timer stop, immutable market clocks/values, idempotence and zero network.');
