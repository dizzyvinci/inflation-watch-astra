const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{JSDOM,VirtualConsole}=require('jsdom');
const packet=path.resolve(__dirname,'..'),root=fs.existsSync(path.join(packet,'site'))?path.resolve(packet,'../../outputs/inflation-watch'):packet,site=fs.existsSync(path.join(packet,'site'))?path.join(packet,'site'):path.join(packet,'web');
const read=n=>fs.readFileSync(path.join(site,n),'utf8'),report=JSON.parse(fs.readFileSync(path.join(packet,'dist/data.json'),'utf8'));
let checks=0;async function check(name,fn){await fn();checks++;console.log('PASS '+name);}
function env(full=false,gross=true){const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));const dom=new JSDOM(`<select id="display-timezone"><option>UTC</option><option>America/Chicago</option></select><select id="cash-lookback"><option selected>3</option></select><select id="cash-evidence"><option value="daily">Daily</option></select><main><section id="view-index"><div id="category-section">Goods unchanged</div><b id="main-rate">17.09</b><b id="goods-index">156.1</b></section><section id="view-nx"><h1 class="page-heading">NX</h1><div class="cash-controls"></div><div id="cash-table"></div><div id="nx-calculator"></div></section></main><footer data-footer-privacy-lock="on"></footer>`,{url:'https://inflation.gg',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});const w=dom.window,d=w.document;let network=0;w.fetch=()=>{network++;throw Error('forbidden fetch')};w.navigator.sendBeacon=()=>{network++;throw Error('forbidden beacon')};w.eval(read('cash-activity-ranking.js'));
 const app=read('app.js');w.eval(app.slice(app.indexOf('const CASH_SCHEDULE='),app.indexOf('function renderCash(){')));
 const legacy=w.buildCashPricing(report,{days:3,evidence:'daily'}),rows=legacy.rows.map((r,i)=>({...r,id:100+i,price:r.nx*(i===0?100:i===1?80:10+i),rate:i===0?100:i===1?80:10+i,quantity:i===0?5:100+i,referenceWeight:i===0?5:100+i,windowDays:3,missing:false,referenceExclusion:null,sourceCreditUrl:'https://maplestory.market/items/'+(100+i)+'?ref=v6kkdvp6'}));
 const capture='2026-11-06T12:00:01.000Z',model=()=>({api:true,rows:rows.map(r=>({...r})),days:3,rolling:false,eligibleCount:29,reference:25,capturedAt:capture,retained:false});
 const data={schemaVersion:1,kind:'fixed_nx_item_api_display_subset',capturedAt:capture,sourceObservedAt:null,window:{reportedLookbackDays:3,start:null,end:null,boundsKnown:false},coverage:{expected:29,available:29}};let choice='auto';
 w.AstraApiCash={model,pricing:()=>choice==='legacy'?null:model(),getState:()=>({status:'ready',data}),client:{freshness:()=> 'recent_retrieval'},getChoice:()=>choice,setChoice(v){choice=v;d.dispatchEvent(new w.Event('astraapicashchoice'));},rowFor:()=>null,refresh(){throw Error('unexpected refresh')},fallbackReason:()=> 'Other dated source selected'};
 if(full){w.eval(read('cash-highlights.js'));w.eval(read('fee-preview.js'));if(gross){const fees=w.AstraTradeFees.getState();fees.mode='gross';w.AstraTradeFees.setState(fees);}w.eval(read('api-cash-ui.js'));d.dispatchEvent(new w.CustomEvent('astramarketsnapshot',{detail:report}));}
 return{w,d,rows,model,legacy,capture,errors,network:()=>network,close:()=>w.close()};}
const slugs=(f,side)=>[...f.d.querySelectorAll(`[data-cash-ranking="${side}"] [data-cash-highlight-slug]`)].map(n=>n.dataset.cashHighlightSlug);
const table=f=>[...f.d.querySelectorAll('.api-cash-table tbody tr')].map(n=>n.dataset.apiCashItem);
(async()=>{
await check('API activity best identifies score-descending, never a raw rate sort on either side',()=>{
 for(const side of ['sell','buy']){const f=env(true);try{
  f.rows.forEach((r,i)=>{r.rate=side==='sell'?(i===0?100:i===1?80:10+i):(i===0?5:i===1?6:10+i);r.price=r.rate*r.nx;r.quantity=i===0?15:300;r.referenceWeight=r.quantity;});
  f.w.AstraCashActivity.setState({mode:'activity',minimumCount:0});f.d.querySelector(`[data-api-cash-side="${side}"]`).click();
  const first=f.d.querySelector('.api-cash-table tbody tr');assert.equal(Number(first.cells[3].dataset.sortValue),side==='sell'?80:6);
  const rate=f.d.querySelector('[data-api-cash-sort="rate"]'),score=f.d.querySelector('[data-api-cash-sort="activityScore"]');
  assert.equal(rate.closest('th').getAttribute('aria-sort'),'none');assert.doesNotMatch(rate.textContent,/[↑↓]/);
  assert.equal(score.closest('th').getAttribute('aria-sort'),'descending');assert.match(score.textContent,/↓/);
  assert.match(f.d.querySelector('.api-cash-ranking').textContent,/Activity-adjusted value first by descending heuristic score/);assert.doesNotMatch(f.d.querySelector('.api-cash-ranking').textContent,/Best value first by gross mesos/);assert.equal(f.network(),0);assert.deepEqual(f.errors,[]);
 }finally{f.close();}}
});
await check('API manual raw-rate headers and Value/minimum-only retain actual direction and best reset',()=>{
 for(const side of ['sell','buy']){const f=env(true);try{const a=f.w.AstraCashActivity;a.setState({mode:'activity',minimumCount:0});f.d.querySelector(`[data-api-cash-side="${side}"]`).click();
  for(let i=0;i<2;i++){f.d.querySelector('[data-api-cash-sort="rate"]').click();const h=f.d.querySelector('[data-api-cash-sort="rate"]').closest('th'),rates=[...f.d.querySelectorAll('.api-cash-table tbody tr')].map(r=>Number(r.cells[3].dataset.sortValue));assert.deepEqual(rates,[...rates].sort((a,b)=>h.getAttribute('aria-sort')==='ascending'?a-b:b-a));assert.equal(f.d.querySelector('[data-api-cash-sort="activityScore"]').closest('th').getAttribute('aria-sort'),'none');}
  f.w.AstraApiCashUi.focusList(side);assert.equal(f.d.querySelector('[data-api-cash-sort="activityScore"]').closest('th').getAttribute('aria-sort'),'descending');
  for(const minimumCount of [0,10]){a.setState({mode:'value',minimumCount});assert.equal(f.d.querySelector('[data-api-cash-sort="rate"]').closest('th').getAttribute('aria-sort'),side==='sell'?'descending':'ascending');assert.equal(f.d.querySelector('[data-api-cash-sort="activityScore"]'),null);}
  assert.equal(f.network(),0);assert.deepEqual(f.errors,[]);
 }finally{f.close();}}
});
await check('normal Player trade default sorts net metadata on both sides while gross evidence/clocks remain unchanged',()=>{
 for(const side of ['sell','buy']){const f=env(true,false);try{
  const fees=f.w.AstraTradeFees.getState(),before=JSON.stringify(f.rows);assert.equal(fees.mode,'player_trade');assert.equal(fees.rules.player_trade.sellerPercent,3);assert.equal(fees.rules.player_trade.buyerPercent,0);
  f.w.AstraCashActivity.setState({mode:'value',minimumCount:0});f.d.querySelector(`[data-api-cash-side="${side}"]`).click();
  const raw=f.d.querySelector('[data-api-cash-sort="rate"]'),net=f.d.querySelector('[data-api-cash-sort="netRate"]');assert(net);assert.equal(raw.closest('th').getAttribute('aria-sort'),'none');assert.doesNotMatch(raw.textContent,/[↑↓]/);assert.equal(net.closest('th').getAttribute('aria-sort'),side==='sell'?'descending':'ascending');assert.match(net.textContent,side==='sell'?/↓/:/↑/);
  const expected=[...f.rows].sort((a,b)=>{const av=a.price*(side==='sell'?0.97:1)/a.nx,bv=b.price*(side==='sell'?0.97:1)/b.nx;return(side==='sell'?bv-av:av-bv)||a.id-b.id;});
  const shown=[...f.d.querySelectorAll('.api-cash-table tbody tr')];assert.deepEqual(shown.map(r=>Number(r.dataset.apiItemId)),expected.map(r=>r.id));
  const index=net.closest('th').cellIndex;for(let i=0;i<shown.length;i++){const wanted=expected[i].price*(side==='sell'?0.97:1)/expected[i].nx,actual=Number(shown[i].cells[index].textContent.replace(/,/g,''));assert(Math.abs(actual-wanted)<=0.0051);}
  assert.match(f.d.querySelector('.api-cash-ranking').textContent,/selected fee assumptions/);assert.match(f.d.querySelector('.api-cash-ranking').textContent,/not official verified fees/);assert.equal(JSON.stringify(f.rows),before);assert.equal(f.w.AstraApiCash.model().capturedAt,f.capture);assert.equal(f.network(),0);assert.deepEqual(f.errors,[]);
 }finally{f.close();}}
});
await check('actual legacy activity best clears raw arrows/aria; manual and Value/min-only directions remain truthful',async()=>{
 const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));const dom=new JSDOM(read('index.html'),{url:'http://127.0.0.1:8765/#nx',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc}),w=dom.window,d=w.document;let requests=0;
 w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=function(){};w.AbortSignal.timeout=()=>undefined;w.fetch=async url=>{requests++;const name=path.join(packet,'dist',url);return{ok:fs.existsSync(name),status:200,json:async()=>JSON.parse(fs.readFileSync(name,'utf8'))};};
 try{for(const file of ['community.js','cash-activity-ranking.js','app.js','cash-highlights.js','fee-preview.js'])w.eval(read(file)+(file==='app.js'?';window.buildCashPricing=buildCashPricing;window.__replacePricing=f=>{buildCashPricing=f;window.buildCashPricing=f;renderCash();};':''));for(let n=0;n<100&&!d.querySelector('#cash-table tbody tr');n++)await new Promise(setImmediate);
  const original=w.buildCashPricing(report,{days:3,evidence:'daily'}),base=original.rows.filter(r=>r.rate>0&&r.referenceWeight>0).slice(0,3);assert.equal(base.length,3);
  w.__replacePricing((_,{side}={})=>({...original,days:3,rolling:false,rows:base.map((r,i)=>{const rate=side==='buy'?[5,6,7][i]:[100,80,60][i];return{...r,rate,price:rate*r.nx,quantity:[15,300,300][i],referenceWeight:[15,300,300][i],windowDays:3,missing:false,referenceExclusion:null};})}));const fee=w.AstraTradeFees.getState();fee.mode='gross';w.AstraTradeFees.setState(fee);const before=requests;
  for(const side of ['sell','buy']){w.AstraCashActivity.setState({mode:'activity',minimumCount:0});d.querySelector(`[data-cash-side="${side}"]`).click();assert.equal(Number(d.querySelector('#cash-table [data-cash-item]').dataset.rate),side==='sell'?80:6);
   let button=d.querySelector('#cash-table [data-cash-sort="rate"]');assert.equal(button.closest('th').getAttribute('aria-sort'),'none');assert.doesNotMatch(button.textContent,/[↑↓]/);assert.equal(d.querySelector('#cash-table [data-cash-sort="activityScore"]'),null);
   button.click();button=d.querySelector('#cash-table [data-cash-sort="rate"]');let rates=[...d.querySelectorAll('#cash-table [data-cash-item]')].map(r=>Number(r.dataset.rate));assert.deepEqual(rates,[...rates].sort((a,b)=>button.closest('th').getAttribute('aria-sort')==='ascending'?a-b:b-a));
   d.getElementById('cash-best-value').click();assert.equal(d.querySelector('#cash-table [data-cash-sort="rate"]').closest('th').getAttribute('aria-sort'),'none');
   for(const minimumCount of [0,10]){w.AstraCashActivity.setState({mode:'value',minimumCount});const rate=d.querySelector('#cash-table [data-cash-sort="rate"]');assert.equal(rate.closest('th').getAttribute('aria-sort'),side==='sell'?'descending':'ascending');assert.match(rate.textContent,/[↑↓]/);}
  }
  assert.equal(requests,before);assert.deepEqual(errors,[]);
 }finally{w.close();}
});
console.log('TOTAL '+checks);})().catch(e=>{console.error(e);process.exitCode=1});
