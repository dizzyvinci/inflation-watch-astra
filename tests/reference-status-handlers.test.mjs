import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createRequire} from 'node:module';
import {describeReferenceStatus,decorateReferenceStatus} from '../ui-src/item-api/reference-status.mjs';
const {JSDOM,VirtualConsole}=createRequire(import.meta.url)('jsdom'),root=new URL('../',import.meta.url),read=n=>fs.readFileSync(new URL(n,root),'utf8');
const NOW=Date.parse('2026-11-07T09:20:00.000Z'),capture=age=>new Date(NOW-age).toISOString();
function realm(html){let now=NOW,hidden=false,online=true,calls=0;const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));const dom=new JSDOM(html,{url:'https://inflation.gg/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc}),w=dom.window,d=w.document;w.Date.now=()=>now;Object.defineProperty(d,'hidden',{get:()=>hidden});Object.defineProperty(w.navigator,'onLine',{get:()=>online});w.fetch=()=>{calls++;throw Error('status must not fetch')};w.AstraReferenceStatus={describe:o=>describeReferenceStatus({...o,now:w.Date.now()}),decorate:decorateReferenceStatus};
 return{w,d,errors,get calls(){return calls},clock(v){now=v},hidden(v){hidden=v;d.dispatchEvent(new w.Event('visibilitychange'))},online(v){online=v;w.dispatchEvent(new w.Event(v?'online':'offline'))},close(){assert.equal(calls,0);assert.deepEqual(errors,[]);w.close();}};
}

test('real main render handler qualifies future/aged/retained/paused/model-unavailable and retains original capture',()=>{
 const f=realm(read('web/index.html')),app=read('web/app.js'),start=app.indexOf('function apiCalculationStatus(){'),end=app.indexOf("\n$('chart-metric').value=metric;",start);assert(start>=0&&end>start);
 f.w.eval(read('web/community.js'));f.w.__view={headline:{mode:'fixed',available:true},clocks:{currentPrices:capture(-1000),dailyCapture:capture(600000),dailyPublisher:capture(1200000),legacyDaily:'2026-11-04T08:30:56Z'},daily:{history:[]}};f.w.__state={status:'ready',readerMode:'accepted_cache'};f.w.__failure=null;f.w.AstraApiCalculations={state:()=>f.w.__state};
 f.w.eval("const $=id=>document.getElementById(id),apiView=()=>window.__view,apiBindingFailure=()=>window.__failure,apiCalculationCopy=()=>'',referencePeriodLabel=()=>'frozen',utc=v=>String(v),spark=()=>'',esc=v=>String(v),statusDot=t=>'<i class=\"source-status-dot status-'+t+'\" aria-hidden=\"true\"></i>';"+app.slice(start,end));
 try{
  const dot=f.d.getElementById('status-dot'),card=()=>f.d.querySelector('[data-status-key="api-calculations"]');
  const draw=()=>f.w.renderApiCalculationCopy();draw();assert.equal(dot.dataset.retrievalState,'clock_uncertain');assert.equal(dot.className,'dot yellow');assert.equal(card().dataset.statusTone,'amber');assert.equal(f.w.__view.clocks.currentPrices,capture(-1000));
  for(const [age,tone,phase]of [[0,'green','recent'],[1200000,'green','recent'],[1200001,'amber','aged']]){f.w.__view.clocks.currentPrices=capture(age);draw();assert.equal(dot.dataset.statusTone,tone);assert.equal(dot.dataset.retrievalState,phase);assert.match(card().textContent,/20-minute retrieval display band/);}
  f.w.__view.clocks.currentPrices=capture(0);f.w.__view.headline.available=false;draw();assert.equal(dot.dataset.statusTone,'amber');assert.equal(dot.dataset.retrievalState,'unavailable');f.w.__view.headline.available=true;
  f.w.__state.status='retained';draw();assert.equal(dot.dataset.retrievalState,'retained');f.w.__state.status='loading';draw();assert.equal(dot.dataset.retrievalState,'loading');f.w.__state.status='current';
  f.hidden(true);draw();assert.equal(dot.dataset.retrievalState,'paused');f.hidden(false);f.online(false);draw();assert.equal(dot.dataset.retrievalState,'paused');f.online(true);
  f.w.__state.blocked=true;draw();assert.equal(dot.dataset.statusTone,'red');assert.equal(dot.dataset.retrievalState,'access_blocked');
  assert.match(dot.getAttribute('aria-label'),/not source trade freshness/);assert.equal(f.w.__view.clocks.currentPrices,capture(0));
 }finally{f.close();}
});

test('real legacy source-health handler does not clamp future source/check/observation clocks to recent',()=>{
 const f=realm('<main></main>'),app=read('web/app.js'),start=app.indexOf('function sourceHealth('),end=app.indexOf('function statusDot(',start);f.w.eval(app.slice(start,end));
 try{const data={sourceUpdatedAt:capture(-1),sourceStatus:{checkedAt:capture(-1),status:'okay'},intraday:[{cpi:101}],live:{observedAt:capture(-1),cpi:101}};const before=JSON.stringify(data),s=f.w.sourceHealth(data,NOW);assert.equal(s.daily.tone,'amber');assert.equal(s.collector.tone,'amber');assert.equal(s.intraday.tone,'amber');assert.match(s.daily.state,/clock ahead/);assert.equal(JSON.stringify(data),before);f.w.AstraApiNxOffers={sourceDescriptor:()=>({connected:true,status:'paused',tone:'green',state:'cache accepted'})};assert.equal(f.w.sourceHealth(data,NOW).offers.tone,'amber');}finally{f.close();}
});

test('real cash draw uses round 10-minute retrieval indicator for all existing client phases',()=>{
 const f=realm('<section id="view-nx"><div class="page-heading"></div></section><p id="source-status-legend"></p>');let state;const data=()=>({schemaVersion:1,kind:'fixed_nx_item_api_display_subset',capturedAt:capture(0),sourceObservedAt:null,window:{reportedLookbackDays:3,start:null,end:null,boundsKnown:false},coverage:{expected:29,available:27}});
 state={status:'ready',serverMode:'accepted_cache',data:data()};f.w.AstraApiCash={getState:()=>state,client:{freshness:()=>state.data?'recent_retrieval':'unavailable'},model:()=>({rows:[],eligibleCount:state.data?.coverage.available??0}),getChoice:()=> 'auto',rowFor:()=>null,setChoice(){},refresh(){throw Error('no transport')}};
 f.w.eval(read('web/api-cash-ui.js'));const node=f.d.querySelector('.api-cash-status'),draw=()=>f.d.dispatchEvent(new f.w.Event('astraapicashchange'));
 try{assert.equal(node.dataset.statusTone,'green');assert(node.querySelector('i.source-status-dot.status-green'));assert.equal(f.w.AstraApiCashUi.sourceDescriptor().value,'27 / 29 eligible item medians');state.data.capturedAt=capture(-1);draw();assert.equal(node.dataset.retrievalState,'clock_uncertain');
  for(const age of [600000,600001]){state.data.capturedAt=capture(age);draw();assert.equal(node.dataset.statusTone,age===600000?'green':'amber');}
  state.data.capturedAt=capture(0);for(const status of ['loading','retained']){state.status=status;draw();assert.equal(node.dataset.statusTone,'amber');}state.status='ready';f.hidden(true);assert.equal(node.dataset.retrievalState,'paused');f.hidden(false);f.online(false);assert.equal(node.dataset.retrievalState,'paused');f.online(true);
  for(const [status,tone]of [['not_published','amber'],['site_access','red'],['unavailable','red']]){state={status,data:null};draw();assert.equal(node.dataset.statusTone,tone);}
  assert.match(f.d.getElementById('api-cash-source-legend').textContent,/display bands, not provider guarantees/);
 }finally{f.close();}
});

function searchFixture(){
 const f=realm('<header class="masthead"><a class="brand">Brand</a></header><div class="nav-wrap"><nav></nav></div><main id="content"></main>'),definition=JSON.parse(read('ops/api-index-definition-data-v1.json'));
 const row=r=>({slug:r.slug,name:r.name,canonicalId:r.itemId,price:123,priceDay:'2026-11-04',quantity:10,currentApiReference:{itemId:r.itemId,slug:r.slug,name:r.name,currentSaleMedianLexeme:'1000.04999999999999',recordedSalesCount:7,reportedDays:3,capturedAt:capture(0)}});
 let report={sourceUpdatedAt:'2026-11-04T08:30:56.000Z',rows:definition.goods.map(row),cash:[],contextItems:[],spriteMap:{},latest:{nxRate:17},apiCalculationView:{kind:'api_calculation_view',clocks:{currentPrices:capture(0)}}};
 let state={status:'current',readerMode:'accepted_cache'};f.w.AstraApiCalculations={state:()=>state};
 const publish=()=>f.d.dispatchEvent(new f.w.CustomEvent('astramarketsnapshot',{detail:report}));f.d.addEventListener('astramarkethighlightsready',publish);f.w.eval(read('web/price-check.js'));
 const input=f.d.getElementById('price-check-header-query'),type=text=>{input.focus();input.value=text;input.dispatchEvent(new f.w.Event('input',{bubbles:true}));};
 return{...f,definition,input,type,publish,get report(){return report},set state(value){state=value},key:key=>input.dispatchEvent(new f.w.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true})),indicator:()=>f.d.querySelector('.price-check-suggestions [data-price-reference-status]')};
}

test('real search indicators age only the bound row and retain selected key/source clock during lifecycle presentation',()=>{
 const f=searchFixture();try{
  f.type(f.definition.goods[0].name);f.key('ArrowDown');const selected=()=>f.d.querySelector('[aria-selected="true"][data-price-suggestion]')?.dataset.priceKey,original=selected();assert(original);
  assert.equal(f.indicator().dataset.statusTone,'green');assert.equal(f.indicator().dataset.rawCapturedAt,capture(0));assert.match(f.d.querySelector('tr[data-price-key="'+original+'"]').textContent,/1,000.0/);
  f.hidden(true);assert.equal(f.indicator().dataset.retrievalState,'paused');assert.equal(selected(),original);f.hidden(false);
  f.clock(NOW+1200001);f.d.dispatchEvent(new f.w.Event('visibilitychange'));assert.equal(f.indicator().dataset.retrievalState,'aged');assert.equal(f.indicator().dataset.rawCapturedAt,capture(0));assert.equal(selected(),original);assert.equal(f.report.rows[0].currentApiReference.capturedAt,capture(0));
  f.state={status:'retained',readerMode:'retained_last_good'};f.publish();assert.equal(f.indicator().dataset.retrievalState,'retained');assert.equal(selected(),original);
  f.state={status:'retained',blocked:true};f.publish();assert.equal(f.indicator().dataset.retrievalState,'access_blocked');assert.equal(f.indicator().dataset.statusTone,'red');
 }finally{f.close();}
});

test('search never grants a current-price success icon to an identity-only row or missing per-item median',()=>{
 const f=searchFixture();try{
  f.report.rows[0].currentApiReference.currentSaleMedianLexeme=null;f.report.rows[0].currentApiReference.recordedSalesCount=4;f.d.dispatchEvent(new f.w.CustomEvent('astramarketsnapshot',{detail:{...f.report}}));f.type(f.definition.goods[0].name);assert.equal(f.indicator().dataset.statusTone,'amber');assert.equal(f.indicator().dataset.retrievalState,'unavailable');
  f.w.AstraItemApiPreview={enabled:true,coverage:()=>'',mergeSearchRecords:rows=>[...rows,{key:'api-identity-9000000',slug:'id-9000000',id:9000000,name:'Synthetic Identity',type:'Retained API identity',price:null,catalog:true,metadata:true,apiIdentityOnly:true,apiIdentity:{memberships:[{operation:'prices',presentInSnapshot:true,capturedAt:capture(0)}]}}]};f.d.dispatchEvent(new f.w.Event('astrapiitemidentities'));f.type('Synthetic Identity');assert.equal(f.indicator().dataset.statusTone,'amber');assert.equal(f.indicator().dataset.retrievalState,'identity_only');assert.equal(f.indicator().dataset.rawCapturedAt,undefined);assert.match(f.indicator().textContent,/no current item price verified/);
 }finally{f.close();}
});

test('same-hash cash status-only retained/failure transitions refresh existing row and selected suggestion indicators',()=>{
 const f=realm('<header class="masthead"><a class="brand">Brand</a></header><div class="nav-wrap"><nav></nav></div><main id="content"></main>');
 let state={status:'ready',serverMode:'accepted_cache',data:{capturedAt:capture(0),subsetHash:'a'.repeat(64)}},hasReference=true;
 f.w.AstraApiCash={getState:()=>state,rowFor:row=>hasReference&&row.name==='Synthetic Cash'?{available:true,saleMedianMesos:1000,recordedSalesCount:7}:null};
 const report={sourceUpdatedAt:'2026-11-04T08:30:56Z',rows:[{slug:'synthetic-cash',name:'Synthetic Cash',canonicalId:12345,price:123,priceDay:'2026-11-04',quantity:7}],cash:[],contextItems:[],spriteMap:{},latest:{nxRate:17}};
 f.d.addEventListener('astramarkethighlightsready',()=>f.d.dispatchEvent(new f.w.CustomEvent('astramarketsnapshot',{detail:report})));f.w.eval(read('web/price-check.js'));
 const input=f.d.getElementById('price-check-header-query');input.focus();input.value='Synthetic Cash';input.dispatchEvent(new f.w.Event('input',{bubbles:true}));f.d.dispatchEvent(new f.w.Event('astraapicashchange'));
 input.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));
 const option=f.d.querySelector('[aria-selected="true"][data-price-suggestion]'),row=f.d.querySelector('tr[data-price-key]'),key=option.dataset.priceKey,active=input.getAttribute('aria-activedescendant'),price=row.cells[1].textContent;
 const icon=()=>option.querySelector('[data-price-reference-status]'),tableIcon=()=>row.querySelector('[data-price-reference-status]'),fire=()=>f.d.dispatchEvent(new f.w.Event('astraapicashchange'));
 try{assert.equal(icon().dataset.statusTone,'green');
  for(const next of [{status:'retained',serverMode:'retained_last_good'},{status:'loading',serverMode:'retained_last_good'},{status:'unavailable',serverMode:'accepted_cache',error:'failed'}]){
   state={...state,...next};fire();assert.equal(icon().dataset.statusTone,'amber');assert.equal(tableIcon().dataset.statusTone,'amber');assert(['retained','loading'].includes(icon().dataset.retrievalState));assert.equal(icon().dataset.rawCapturedAt,capture(0));
   assert.strictEqual(f.d.querySelector('[aria-selected="true"][data-price-suggestion]'),option);assert.strictEqual(f.d.querySelector('tr[data-price-key]'),row);assert.equal(option.dataset.priceKey,key);assert.equal(input.getAttribute('aria-activedescendant'),active);assert.equal(row.cells[1].textContent,price);
  }
  state={status:'site_access',serverMode:'accepted_cache',data:state.data};fire();assert.equal(icon().dataset.statusTone,'red');assert.equal(icon().dataset.retrievalState,'access_blocked');assert.strictEqual(f.d.querySelector('[aria-selected="true"][data-price-suggestion]'),option);assert.equal(input.getAttribute('aria-activedescendant'),active);
  state={status:'ready',serverMode:'accepted_cache',data:state.data};fire();assert.equal(icon().dataset.statusTone,'green');assert.equal(icon().dataset.rawCapturedAt,capture(0));
  // With no validated reference the row is not upgraded from stale prices: its API icon is withdrawn by the ordinary changed-hash draw.
  hasReference=false;state={status:'unavailable',data:null};fire();assert.equal(f.d.querySelector('.price-check-suggestions [data-price-reference-status]'),null);assert.equal(state.data,null);assert.equal(report.rows[0].price,123);
 }finally{f.close();}
});
