// Portable synthetic full-app fixture. No actual response bodies or external transport.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url'),{webcrypto,createHash}=require('node:crypto');
const project=process.env.ASTRA_TEST_PROJECT?path.resolve(process.env.ASTRA_TEST_PROJECT):path.resolve(__dirname,'..'),appPath=path.join(project,'web/app.js');
const {JSDOM,VirtualConsole}=require(path.join(project,'node_modules/jsdom')),read=p=>fs.readFileSync(path.join(project,p),'utf8'),load=p=>import(pathToFileURL(path.join(project,p)).href),tick=()=>new Promise(r=>setImmediate(r));
async function fixture({available=true,refreshGoods=true,cash=false,goodsMode='good',generated=false,markupAvailable=false}={}){
 const{createCalculationRuntime}=await load('ui-src/api-calculations/runtime.mjs'),helpers=await load('tests/api-index-test-helpers.mjs'),{calculateApiIndexSnapshot}=await load('ops/api-index-calculations.mjs'),{parseApiIndexSnapshot,unpackApiDailyItemHistory}=await load('ops/api-index-public-contract.mjs');
 const inputs=await helpers.fullFixture(),source=await calculateApiIndexSnapshot(inputs),definition=JSON.parse(read('ops/api-index-definition-data-v1.json'));
 const thin=await calculateApiIndexSnapshot({...inputs,priceCapture:await helpers.priceCapture(inputs.definition,{omit:helpers.spec.goods[0].itemId,factor:1.7,ctx:helpers.context('prices','2026-11-06T12:05:00.000Z')})});
 const next=await calculateApiIndexSnapshot({...inputs,priceCapture:await helpers.priceCapture(inputs.definition,{omit:helpers.spec.goods[0].itemId,factor:1.8,ctx:helpers.context('prices','2026-11-06T12:06:00.000Z')})});
 let clock=Date.parse('2026-11-06T12:10:03.000Z'),report=JSON.parse(read('dist/data.json')),revision=0,goodsReply=goodsMode;
 const before=JSON.stringify(report),events=[],errors=[],requests=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM(read('web/index.html'),{url:'https://inflation.gg/',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc}),w=dom.window,d=w.document;
 Object.assign(w,{TextDecoder,structuredClone,AbortController,Response,Request,Headers});w.TextEncoder=class extends TextEncoder{encode(v){return new w.Uint8Array(super.encode(v));}};Object.defineProperty(w,'crypto',{value:webcrypto});w.Date.now=()=>clock;
 w.matchMedia=()=>({matches:true,addEventListener(){}});w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};w.AbortSignal.timeout=()=>undefined;
 Object.defineProperty(d,'visibilityState',{value:'hidden',configurable:true});
 const calculationFetch=async url=>{requests.push(String(url));assert.equal(String(url),'https://inflation.gg/api-market-calculations.json');if(goodsReply==='failure')return new Response(null,{status:503});const value=goodsReply==='thin'?thin:goodsReply==='next'?next:source,raw=new w.TextEncoder().encode(JSON.stringify(value)),digest=createHash('sha256').update(raw).digest('hex');const response=new Response(raw,{headers:{ETag:'"api-calculations-'+digest+'"','Content-Type':'application/json','Cache-Control':'private, no-store, no-transform','X-Astra-Calculations-Mode':'accepted_cache','X-Astra-Calculations-Definition-Hash':source.definitionHash,'X-Astra-Calculations-Prices-Captured-At':value.sources.prices.capturedAt,'X-Astra-Calculations-Overview-Captured-At':value.sources.overview.capturedAt}});if(!generated)return response;let sent=false;return{status:200,headers:response.headers,body:{getReader:()=>({read:async()=>sent?{done:true}:(sent=true,{done:false,value:raw}),cancel:async()=>{},releaseLock(){}})}};};
 w.fetch=async u=>{if(String(u).includes('api-market-calculations.json'))return calculationFetch(u);requests.push(String(u));assert(['version.json','data-0123456789abcdef.json'].includes(u),'own-site mock only');return{ok:true,json:async()=>u==='version.json'?{version:'test'+revision,data:'data-0123456789abcdef.json'}:report};};
 let runtime;if(generated){if(available)d.body.dataset.apiCalculationsAvailable='true';w.eval(read('web/api-calculations.js'));runtime=w.AstraApiCalculations;}else{runtime=createCalculationRuntime({origin:'https://inflation.gg',available,definitionHash:source.definitionHash,parse:b=>parseApiIndexSnapshot(b,{expectedDefinitionHash:source.definitionHash,expectedRows:definition.goods,expectedCashRows:definition.cash}),unpackDaily:unpackApiDailyItemHistory,itemDefinitions:definition,now:()=>clock,selection:()=>w.AstraRollingBenchmark.getState(),fetcher:calculationFetch,notify:()=>d.dispatchEvent(new w.CustomEvent('astracalculationchange'))});w.AstraApiCalculations=runtime;}if(markupAvailable)d.body.dataset.apiCalculationsAvailable='true';
 d.addEventListener('astramarketsnapshot',e=>events.push({report:e.detail,rate:d.getElementById('main-rate').textContent,cpi:d.getElementById('main-cpi').textContent}));
 try{
  for(const p of ['community.js','rolling-benchmark-preview.js','nx-benchmark.js','rate-arrival.js'])w.eval(p==='nx-benchmark.js'&&process.env.ASTRA_TEST_METHOD?fs.readFileSync(process.env.ASTRA_TEST_METHOD,'utf8'):read('web/'+p));
  w.eval(fs.readFileSync(appPath,'utf8')+';window.__bindingTest={findItem,itemDetailHTML,showItem,renderItemPage,checkSnapshot,sourceTick:()=>{renderFreshness();renderSources();},rate:activeRate,cpi:activeCpi,headline:()=>benchmarkHeadline(snapshot),state:()=>snapshot};');
  for(let n=0;n<100&&!events.length;n++)await tick();assert(events.length);if(refreshGoods)await runtime.refresh();await tick();
  const f={w,d,source,thin,next,runtime,events,errors,requests,before,original:report,
   async replace(change){report=JSON.parse(before);change(report);revision++;await w.__bindingTest.checkSnapshot();await tick();return events.at(-1).report;},
   async goods(mode){clock+=61000;goodsReply=mode;await runtime.refresh();await tick();},
   close(){dom.window.close();}};return f;
 }catch(e){dom.window.close();throw e;}
}
module.exports={fixture,read,tick};
