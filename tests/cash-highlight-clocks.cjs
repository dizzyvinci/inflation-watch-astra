const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {JSDOM,VirtualConsole}=require('jsdom');
const root=path.resolve(__dirname,'..');
const script=fs.readFileSync(path.join(root,'web/cash-highlights.js'),'utf8');
const app=fs.readFileSync(path.join(root,'web/app.js'),'utf8');
const pricing=app.slice(app.indexOf('const CASH_SCHEDULE='),app.indexOf('function renderCash(){'));
const saved=JSON.parse(fs.readFileSync(path.join(root,'dist/data.json'),'utf8'));
function fixture({zone='UTC',blocked=false}={}){
 const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));let network=0;
 const dom=new JSDOM('<select id="display-timezone"></select><select id="cash-lookback"><option selected>3</option><option>7</option></select><select id="cash-evidence"><option value="daily">Daily</option><option value="rolling">Rolling</option></select><main id="view-index"><section id="category-section"></section></main>',{url:'https://inflation.gg/',runScripts:'outside-only',virtualConsole:vc});
 const w=dom.window,d=w.document;let formatterCalls=0;const NativeFormatter=w.Intl.DateTimeFormat;w.Intl.DateTimeFormat=new Proxy(NativeFormatter,{construct(target,args){formatterCalls++;return Reflect.construct(target,args);}});for(const value of ['UTC','America/Chicago','Asia/Tokyo','invalid/zone']){const o=d.createElement('option');o.value=value;o.textContent=value;d.getElementById('display-timezone').append(o);}d.getElementById('display-timezone').value=zone;
 Object.defineProperty(w,'localStorage',{value:{getItem(){if(blocked)throw Error('blocked');return null;},setItem(){if(blocked)throw Error('blocked');}}});
 w.fetch=()=>{network++;throw Error('No HTTP');};w.XMLHttpRequest=function(){network++;throw Error('No XHR');};w.navigator.sendBeacon=()=>{network++;throw Error('No beacon');};
 w.eval(pricing);w.eval(script);const publish=data=>d.dispatchEvent(new w.CustomEvent('astramarketsnapshot',{detail:data}));
 return{w,d,errors,publish,network:()=>network,formatterCalls:()=>formatterCalls,zone(value){d.getElementById('display-timezone').value=value;d.getElementById('display-timezone').dispatchEvent(new w.Event('change'));},close:()=>w.close()};
}
const status=f=>f.d.querySelector('.cash-highlights-status');
const copied=()=>JSON.parse(JSON.stringify(saved));
async function run(){
 let f=fixture();try{
  const data=copied(),before=JSON.stringify(data);f.publish(data);const model=f.w.AstraCashHighlights.bestModel(data,{days:3,evidence:'daily'}),cards=[...f.d.querySelectorAll('.cash-highlight-card')],rates=cards.map(n=>n.dataset.cashRate);
  assert(status(f).textContent.includes('Daily source published (11-04-2026 08:30:56 UTC)'));
  assert.equal(status(f).dataset.rawSourcePublicationAt,data.sourceUpdatedAt);
  const node=cards[0];f.zone('America/Chicago');
  assert.equal(f.d.querySelector('.cash-highlight-card'),node,'timezone label refresh keeps cards/actions');
  assert(status(f).textContent.includes('11-04-2026 02:30:56 CST · America/Chicago'));
  assert.deepEqual([...f.d.querySelectorAll('.cash-highlight-card')].map(n=>n.dataset.cashRate),rates);
  assert(status(f).textContent.includes('(11-02-2026–11-04-2026) inclusive'),'source-calendar endpoints never shift');
  assert(cards[0].querySelector('.cash-highlight-date').textContent.includes('Selected dates (11-02-2026–11-04-2026)'));
  assert.equal(JSON.stringify(data),before);assert.equal(model.days,3);
  f.zone('invalid/zone');assert(status(f).textContent.includes('08:30:56 UTC'));
  f.d.getElementById('display-timezone').remove();f.publish(data);assert(status(f).textContent.includes('08:30:56 UTC'));
  assert.equal(f.network(),0);assert.deepEqual(f.errors,[]);
 }finally{f.close();}
 f=fixture({zone:'America/Chicago',blocked:true});try{
  const data=copied();data.rollingReference={capturedAt:'2026-11-02T00:00:00.999Z',items:[
   {name:'AP Reset Scroll',price:35000,salesCounted:10,windowDays:3,capturedAt:'2026-11-01T06:30:00.123Z',captureTimeKind:'per_item_return',sourceObservedAt:'2026-11-01T06:00:00Z',observationTimestampKnown:false},
   {name:'Water of Life',price:40000,salesCounted:20,windowDays:7,capturedAt:'2026-11-01T07:30:00.456Z',captureTimeKind:'per_item_return',sourceObservedAt:'2026-11-01T07:00:00Z',observationTimestampKnown:true},
   {name:'SP Reset Scroll',price:70000,salesCounted:20,windowDays:3}],comparison:{cashReferenceWeights:[]}};
  f.publish(data);const evidence=f.d.getElementById('cash-evidence');evidence.value='rolling';evidence.dispatchEvent(new f.w.Event('change'));
  const label=slug=>f.d.querySelector(`[data-cash-highlight-slug="${slug}"] .cash-highlight-date`);
  assert(status(f).textContent.includes('Batch retrieved (11-01-2026 18:00:00 CST · America/Chicago)'));
  assert.equal(status(f).dataset.rawBatchCapturedAt,'2026-11-02T00:00:00.999Z');
  assert(label('ap-reset-scroll').textContent.includes('11-01-2026 01:30:00 CDT · America/Chicago'));
  assert(label('water-of-life').textContent.includes('11-01-2026 01:30:00 CST · America/Chicago'),'DST repeated hour distinct');
  assert.equal(f.d.querySelector('[data-cash-highlight-slug="ap-reset-scroll"] .cash-highlight-source-time'),null,'unverified source time has no extra line despite raw value');
  assert.equal(label('ap-reset-scroll').dataset.rawCapturedAt,'2026-11-01T06:30:00.123Z');
  assert.equal(label('ap-reset-scroll').dataset.rawSourceObservedAt,'2026-11-01T06:00:00Z');
  assert(label('sp-reset-scroll').textContent.includes('Retrieved Unknown'),'no invented batch fallback for absent item receipt');
  assert(f.d.querySelector('[data-cash-highlight-slug="water-of-life"] .cash-highlight-source-time').textContent.includes('Source observed (11-01-2026 01:00:00 CST · America/Chicago)'));
  assert(!label('water-of-life').textContent.includes('per_item_return'));assert.equal(label('water-of-life').dataset.captureTimeKind,'per_item_return');
  assert.equal((f.d.querySelector('#cash-item-highlights').textContent.match(/Retrieval times are not trade times/g)||[]).length,1);assert(label('water-of-life').title.includes('not a trade timestamp'));
  const count=f.formatterCalls();f.zone('America/Chicago');assert.equal(f.formatterCalls(),count,'formatter reused for same zone across all cards');
  const node=label('water-of-life');f.zone('Asia/Tokyo');assert.equal(label('water-of-life'),node);assert(node.textContent.includes('11-01-2026 16:30:00 GMT+9 · Asia/Tokyo'));
  f.w.eval(fs.readFileSync(path.join(root,'web/date-presentation.js'),'utf8'));await new Promise(r=>setTimeout(r,20));assert(node.textContent.includes('(11-01-2026 16:30:00 GMT+9 · Asia/Tokyo)'));
  assert(!node.textContent.includes('(('));assert.equal(node.dataset.rawCapturedAt,'2026-11-01T07:30:00.456Z');
  for(const invalid of ['2026-02-30T00:00:00Z','2026-11-01T24:00:00Z','2026-11-01T06:30:00','2026-11-01','bad']){
   const bad=JSON.parse(JSON.stringify(data));bad.rollingReference.items[0].capturedAt=invalid;f.publish(bad);assert(label('ap-reset-scroll').textContent.includes('Retrieved Unknown'));
  }
  f.publish({cash:[]});assert(!status(f).hasAttribute('data-raw-batch-captured-at'));f.zone('UTC');assert(status(f).textContent.includes('0 / 29'));assert(status(f).textContent.includes('Batch retrieved Unknown'));assert(!status(f).textContent.includes('18:00:00'));
  assert.equal(f.network(),0);assert.deepEqual(f.errors,[]);
 }finally{f.close();}
 console.log('PASS: source clock proposal — timezone/DST, batch vs item receipts, explicit source observation gate, raw precision, unchanged calendar dates/rates/nodes, invalid/missing/blocked, no HTTP.');
}
run().catch(e=>{console.error(e);process.exitCode=1;});
