// Canonical Price Check presentation regression. Synthetic fixtures; no HTTP, preferences or price math.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {JSDOM,VirtualConsole}=require('jsdom');
const root=path.resolve(__dirname,'..');
const script=fs.readFileSync(path.join(root,'web/price-check.js'),'utf8');
const dateScript=fs.readFileSync(path.join(root,'web/date-presentation.js'),'utf8');
const clone=value=>JSON.parse(JSON.stringify(value));
const pause=()=>new Promise(resolve=>setTimeout(resolve,20));
const source='2026-11-01T00:30:00Z';
function dataFixture(sourceUpdatedAt=source){
  const ref=(id,name,capturedAt,sourceObservedAt)=>({id,expectedItemId:id,name,expectedItemName:name,price:5000,salesCounted:10,windowDays:3,priceBasis:'median of sales',capturedAt,observationTimestampKnown:true,sourceObservedAt});
  return{sourceUpdatedAt,spriteMap:{},rows:Array.from({length:5},(_,i)=>({slug:'base-'+i,name:'Synthetic base '+i,price:100+i,priceDay:'2026-11-01',quantity:10})),contextItems:[],cash:[],
    cashCatalog:{schemaVersion:1,kind:'cash_shop_source_catalog',rows:[],metadataItems:[{id:1007133,name:'Synthetic metadata',cash:true,marketDataAvailable:false,metadataCapturedAt:'2026-11-01T00:15:00Z'}]},
    cashPriceReferences:{schemaVersion:1,kind:'supplemental_cash_rolling_references',sourceUrl:'https://mesos.watch/',items:[ref(1001,'DST Summer Ref','2026-11-01T06:30:00Z','2026-11-01T06:25:00Z'),ref(1002,'DST Winter Ref','2026-11-01T07:30:00Z','2026-11-01T07:25:00Z')]},
    latest:{cpi:156,nxRate:17},intraday:[]};
}
async function fixture({zoneControl=true,sourceUpdatedAt=source,transform=value=>value}={}){
  const errors=[],requests={http:0,indexLoads:0,storage:0},vc=new VirtualConsole();vc.on('jsdomError',error=>errors.push(error.message));
  const dom=new JSDOM('<!doctype html><header class="masthead"><a class="brand">Brand</a><span class="header-status">Original clocks</span></header><nav></nav><main id="content"></main><footer>Original footer</footer>'+(zoneControl?'<select id="display-timezone"><option>UTC</option><option>America/Chicago</option><option>Asia/Tokyo</option><option>Bad/Zone</option></select>':''),{url:'https://inflation.gg/#price-check',runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc});
  const w=dom.window,d=w.document,data=transform(dataFixture(sourceUpdatedAt)),before=JSON.stringify(data);
  w.fetch=()=>{requests.http++;throw Error('No HTTP for timezone formatting');};w.XMLHttpRequest=function(){throw Error('No XHR');};w.navigator.sendBeacon=()=>{throw Error('No telemetry');};
  Object.defineProperty(w,'localStorage',{get(){requests.storage++;throw Error('Blocked storage');}});Object.defineProperty(w,'sessionStorage',{get(){throw Error('No sessions');}});
  w.HTMLElement.prototype.scrollIntoView=function(){};
  const loaded={itemCount:60,sourceUpdatedAt,coverage:{withoutQualifiedDailyPrice:0}};
  const full=Array.from({length:60},(_,i)=>({key:'full-'+i,slug:'full-'+i,name:'Synthetic full '+i,id:2000+i,type:'Provider daily · Equips · qualified price',sourceCategory:'Equips',price:1000+i,priceDay:i===0?'2026-10-31':'2026-11-01',quantity:10,publisherMedian:1000+i,knownNxCost:null,dailyRate:null,lazyDetail:true,sourceUpdatedAt,evidenceDate:'Raw source field '+sourceUpdatedAt}));
  w.AstraFullMarket={hasVersionedReport:()=>true,matchesReport:()=>true,client:{peek:()=>loaded,loadIndex:async()=>{requests.indexLoads++;return loaded;}},mergeSearchRecords:base=>[...base,...full]};
  const publish=value=>d.dispatchEvent(new w.CustomEvent('astramarketsnapshot',{detail:value}));
  // Match app.js order: its existing change handler renders and republishes
  // the SAME object before the later Price Check listener runs.
  d.getElementById('display-timezone')?.addEventListener('change',()=>publish(data));
  d.addEventListener('astramarkethighlightsready',()=>publish(data));w.eval(script);await pause();
  return{w,d,data,before,requests,errors,publish,zone:value=>{const field=d.getElementById('display-timezone');field.value=value;field.dispatchEvent(new w.Event('change',{bubbles:true}));},type:value=>{const field=d.getElementById('price-check-header-query');field.focus();field.value=value;field.dispatchEvent(new w.Event('input',{bubbles:true}));},close:()=>w.close()};
}
const rows=f=>[...f.d.querySelectorAll('.price-check-table tr[data-price-key]')];
const choose=(f,value)=>{const el=f.d.getElementById('price-check-category');el.value=value;el.dispatchEvent(new f.w.Event('change',{bubbles:true}));};
const labels=f=>[...f.d.querySelectorAll('.price-check-suggestion-date')].map(node=>node.textContent);

(async()=>{
  let f=await fixture();try{
    f.type('DST');await pause();f.zone('America/Chicago');
    const copy=labels(f);assert(copy.some(text=>text.includes('11-01-2026 01:30:00 CDT · America/Chicago')),'First repeated DST hour keeps daylight offset');assert(copy.some(text=>text.includes('11-01-2026 01:30:00 CST · America/Chicago')),'Second repeated DST hour keeps standard offset');
    assert(copy.some(text=>text.includes('11-01-2026 01:25:00 CDT')));assert(copy.some(text=>text.includes('11-01-2026 01:25:00 CST')));
    assert(f.d.querySelector('.price-check-coverage').textContent.includes('10-31-2026 19:30:00 CDT'),'Source publication crosses local midnight correctly');
    assert.equal(f.d.querySelector('.price-check-suggestion-date').dataset.rawCapturedAt,'2026-11-01T06:30:00Z');
    f.zone('Asia/Tokyo');assert(labels(f).some(text=>text.includes('11-01-2026 15:30:00 GMT+9 · Asia/Tokyo')));assert.equal(f.d.querySelector('.price-check-suggestion-date').dataset.rawCapturedAt,'2026-11-01T06:30:00Z');
    f.type('Synthetic metadata');await pause();f.zone('America/Chicago');assert(labels(f)[0].includes('Metadata receipt (10-31-2026 19:15:00 CDT'));assert.equal(f.d.querySelector('.price-check-suggestion-date').dataset.rawMetadataReceiptAt,'2026-11-01T00:15:00Z');
    assert.equal(JSON.stringify(f.data),f.before);assert.equal(f.requests.http,0);assert.equal(f.requests.storage,0);assert.deepEqual(f.errors,[]);
  }finally{f.close();}

  f=await fixture();try{
    choose(f,'category:Equips');f.d.querySelector('[data-price-sort="price"]').click();f.d.querySelector('[data-price-page="next"]').click();
    const table=f.d.querySelector('.price-check-table table'),result=f.d.getElementById('price-check-results').textContent,keys=rows(f).map(row=>row.dataset.priceKey),sort=f.d.querySelector('[data-price-sort="price"]').closest('th').getAttribute('aria-sort'),loads=f.requests.indexLoads;
    assert(result.startsWith('26–50'));
    f.zone('America/Chicago');await pause();
    assert.equal(f.d.querySelector('.price-check-table table'),table,'Timezone refresh never replaces the results table');assert.equal(f.d.getElementById('price-check-results').textContent,result);assert.deepEqual(rows(f).map(row=>row.dataset.priceKey),keys);assert.equal(f.d.getElementById('price-check-category').value,'category:Equips');assert.equal(f.d.querySelector('[data-price-sort="price"]').closest('th').getAttribute('aria-sort'),sort);assert.equal(f.requests.indexLoads,loads,'Same-snapshot timezone render does not call loadIndex again');
    f.type('Synthetic');await pause();choose(f,'category:Equips');f.d.querySelector('[data-price-page="next"]').click();const query=f.d.getElementById('price-check-query').value,ids=rows(f).map(row=>row.dataset.priceKey);f.zone('Asia/Tokyo');await pause();assert.equal(f.d.getElementById('price-check-query').value,query);assert.deepEqual(rows(f).map(row=>row.dataset.priceKey),ids);
    f.d.querySelector('[data-price-clear]').click();choose(f,'category:Equips');f.d.querySelector('[data-price-sort="name"]').click();
    const row=rows(f).find(row=>row.dataset.priceKey==='full-0');assert(row);const rawDay=row.cells[5].textContent;
    f.zone('America/Chicago');assert.equal(row.cells[5].textContent,rawDay);f.zone('Asia/Tokyo');assert.equal(row.cells[5].textContent,rawDay);assert.equal(rawDay,'2026-10-31','Daily source day never goes through an instant timezone formatter');
    assert.equal(f.d.querySelector('footer').textContent,'Original footer');assert.equal(f.d.querySelector('.header-status').textContent,'Original clocks');assert.equal(JSON.stringify(f.data),f.before);assert.equal(f.requests.http,0);assert.deepEqual(f.errors,[]);
  }finally{f.close();}

  f=await fixture();try{
    f.type('DST');await pause();f.zone('Bad/Zone');assert(labels(f).some(text=>text.includes('11-01-2026 06:30:00 UTC')),'Invalid selected zone explicitly falls back to UTC');
    f.w.eval(dateScript);await pause();const original=f.d.querySelector('.price-check-suggestion-date').textContent;f.zone('America/Chicago');await pause();assert(labels(f).some(text=>text.includes('01:30:00 CDT')));assert(!labels(f).includes(original));
    assert.equal(f.d.querySelector('.price-check-suggestion-date').dataset.rawCapturedAt,'2026-11-01T06:30:00Z');assert.equal(f.requests.http,0);assert.deepEqual(f.errors,[]);
  }finally{f.close();}
  f=await fixture({zoneControl:false});try{f.type('DST');await pause();assert(labels(f).some(text=>text.includes('06:30:00 UTC')));assert.deepEqual(f.errors,[]);assert.equal(f.requests.http,0);}finally{f.close();}
  f=await fixture({transform:data=>{data.cashCatalog.metadataItems[0].metadataCapturedAt=null;data.cashPriceReferences.items[0].observationTimestampKnown=false;data.cashPriceReferences.items[0].sourceObservedAt=null;return data;}});try{
    f.type('DST Summer');await pause();f.zone('America/Chicago');assert(labels(f)[0].includes('underlying time unknown'));
    f.type('Synthetic metadata');await pause();assert(labels(f)[0].includes('Metadata receipt time unknown'));assert(!labels(f)[0].includes('1970'));
    f.type('Synthetic base 0');await pause();const label=f.d.querySelector('.price-check-suggestion-date');assert.equal(label.dataset.sourceDay,'2026-11-01');assert(label.textContent.includes('Qualified daily price · 11-01-2026'));f.zone('Asia/Tokyo');assert.equal(label.dataset.sourceDay,'2026-11-01');assert(label.textContent.includes('11-01-2026'));assert.equal(JSON.stringify(f.data),f.before);
  }finally{f.close();}
  for(const bad of ['not a date','2026-02-30T00:00:00Z','2026-11-01T24:00:00Z','2026-11-01T00:30:00']){
    f=await fixture({sourceUpdatedAt:bad});try{assert(f.d.querySelector('.price-check-coverage').textContent.includes('Full lookup source Unknown.'));assert.deepEqual(f.errors,[]);}finally{f.close();}
  }
  console.log(JSON.stringify({status:'PASS Price Check timezone',actualHttpRequests:0,checks:'DST repeated hour/CDT+CST; UTC/local midnight; source-day unchanged; raw attrs/report preserved; query/category/sort/page and DOM identity retained; no loadIndex on timezone-only render; invalid/missing timezone UTC; invalid/missing instant Unknown; blocked storage; existing date observer compatibility'}));
})().catch(error=>{console.error(error);process.exitCode=1;});
