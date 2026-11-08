const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { pathToFileURL } = require('node:url'), { createHash } = require('node:crypto'), { JSDOM, VirtualConsole } = require('jsdom');
const project = process.env.ASTRA_TEST_PROJECT ? path.resolve(process.env.ASTRA_TEST_PROJECT) : path.resolve(__dirname, '..');
const script = fs.readFileSync(path.join(__dirname, '../web/speculation.js'), 'utf8');
const spec = JSON.parse(fs.readFileSync(path.join(project, 'ops/api-index-definition-data-v1.json'), 'utf8'));
const near = (a,b) => assert(Math.abs(a-b) < 1e-9, `${a} != ${b}`), clone = structuredClone;
async function accepted() {
  const { parseApiIndexSnapshot, unpackApiDailyItemHistory } = await import(pathToFileURL(path.join(project,'ops/api-index-public-contract.mjs')).href);
  const raw = fs.readFileSync(path.join(__dirname,'fixtures/window-sensitivity-calculations.json'));
  assert.equal(createHash('sha256').update(raw).digest('hex'),'74898a44bcfb65b0555a4c131a6b1e604096586b680f3dd6435b0e896d05558d');
  const dto = await parseApiIndexSnapshot(raw,{ expectedDefinitionHash:'865944dc992219e01b2aad45a6191174d112f3f1902e4ac86c79a6d23a481e17', expectedRows:spec.goods, expectedCashRows:spec.cash });
  const {calculationView}=await import(pathToFileURL(path.join(project,'ui-src/api-calculations/view-model.mjs')).href);
  const legacy={basketHash:spec.basketHash,sourceUpdatedAt:spec.legacySourceUpdatedAt,history:[],smega:[],rows:spec.goods.map(r=>({slug:r.slug,name:r.name,category:r.category,weight:r.weight,basePrice:r.basePrice,price:r.legacyLinkPrice,priceDay:spec.linkDay,sourceUrl:null,history:[]}))};
  const view=calculationView(legacy,dto);
  return {...legacy,rows:view.rows,apiDailyItems:unpackApiDailyItemHistory(dto),apiCalculationView:view};
}
function fixture(report) {
  const errors=[], vc=new VirtualConsole(); vc.on('jsdomError',e=>errors.push(e.message));
  const dom=new JSDOM('<details id="display-options"></details><select id="display-timezone"><option>UTC</option><option>America/Chicago</option></select><div class="nav-wrap"><nav><a class="fallback-link">Fallback</a></nav></div><main id="content"><section id="view-index">Original Overview</section></main><footer>Original private footer</footer>',{url:'https://inflation.gg/#index',runScripts:'outside-only',virtualConsole:vc}),w=dom.window,d=w.document;
  let requests=0,timers=0;w.fetch=w.XMLHttpRequest=w.navigator.sendBeacon=()=>{++requests;throw Error('No request');};w.setTimeout=w.setInterval=()=>{++timers;throw Error('No timer');};
  const prefs=new Map();Object.defineProperty(w,'localStorage',{value:{getItem:k=>prefs.get(k)??null,setItem:(k,v)=>prefs.set(k,v)}});
  const publish=r=>d.dispatchEvent(new w.CustomEvent('astramarketsnapshot',{detail:r}));d.addEventListener('astramarkethighlightsready',()=>publish(report));w.eval(script);
  const open=()=>{d.querySelector('.speculation-options button').click();d.getElementById('speculation-window').open=true;d.getElementById('speculation-window').dispatchEvent(new w.Event('toggle'));};
  return {w,d,errors,prefs,publish,open,get requests(){return requests;},get timers(){return timers;},close:()=>w.close()};
}
test('accepted typed dated79 fixture matches independent1/3/7 rational results and disjoint means',async()=>{
  const data=await accepted(),before=JSON.stringify(data),f=fixture(data);try{
    const m=f.w.AstraSpeculation.windowSensitivity(data);assert.equal(m.endDay,'2026-11-06');assert.equal(m.units,'mesos per reported source unit');
    for(const [n,v]of [[1,-11.764660899601058],[3,-6.2500625],[7,50.00005000005]])near(m.comparisons.find(x=>x.days===n).endpointPercent,v);
    near(m.comparisons.find(x=>x.days===3).periodPercent,28.39496296296296);assert.equal(m.comparisons.find(x=>x.days===7).periodPercent,null);
    assert.equal(m.comparisons.find(x=>x.days===3).priorStart,'2026-11-01');assert.equal(JSON.stringify(data),before);
  }finally{f.close();}
});
test('custom finite integer1..30 and complete-calendar refusal; no shorter substitutions',async()=>{
  const data=await accepted(),f=fixture(data);try{const calc=f.w.AstraSpeculation.windowSensitivity;
    for(const n of [0,31,1.5,NaN,Infinity,'3'])assert.equal(calc(data,'2040801',n).available,false);
    const m=calc(data,'2040801',30);assert.equal(m.comparisons.at(-1).endpointPercent,null);assert.equal(m.comparisons.at(-1).periodPercent,null);
    for(const kind of ['gap','partial','thin','unqualified','null','clock','duplicate']){const bad=clone(data),r=bad.apiDailyItems.find(x=>x.itemId===2040801),p=r.points.find(x=>x.day==='2026-11-04');
      if(kind==='gap')r.points=r.points.filter(x=>x!==p);if(kind==='partial')p.partialCalendarDay=true;if(kind==='thin')p.recordedSalesCount=4;if(kind==='unqualified')p.qualified=false;if(kind==='null')p.medianUnitPriceLexeme=null;if(kind==='clock')p.source.capturedAt=null;if(kind==='duplicate')r.points.push(clone(p));
      const x=calc(bad);assert(x.available===false||x.comparisons.find(y=>y.days===3).endpointPercent===null,kind);
    }
  }finally{f.close();}
});
test('all50 basket index levels retain fixed weights/base with no renormalization or source-unit mixing',async()=>{
  const data=await accepted(),f=fixture(data);try{const calc=f.w.AstraSpeculation.windowSensitivity,m=calc(data,'basket');assert.equal(m.units,'linked MPI index points');
    const level=day=>data.rows.reduce((sum,r)=>sum+100*r.weight*data.apiDailyItems.find(x=>x.itemId===r.currentApiReference.itemId).points.find(p=>p.day===day).linkedPrice/r.basePrice,0);
    near(m.comparisons.find(x=>x.days===3).endpointPercent,100*(level('2026-11-06')/level('2026-11-03')-1));
    const bad=clone(data);bad.apiDailyItems.find(r=>r.role==='goods').points.find(p=>p.day==='2026-11-06').qualified=false;assert(calc(bad,'basket').comparisons.every(r=>r.endpointPercent===null&&r.periodPercent===null));
    bad.rows.pop();assert.equal(calc(bad,'basket').available,false);
  }finally{f.close();}
});
test('custom30 needs31 actual endpoint days and60 mean days; full14day synthetic control enables7vs7',async()=>{
  const data=await accepted(),f=fixture(data);try{
    const end=Date.parse('2026-11-06T00:00:00Z');for(const r of data.apiDailyItems)r.points=Array.from({length:31},(_,i)=>({day:new Date(end-(30-i)*86400000).toISOString().slice(0,10),medianUnitPriceLexeme:String(100+i),recordedSalesCount:5,qualified:true,partialCalendarDay:false,linkedPrice:100+i,source:{capturedAt:'2026-11-07T14:14:10.772Z'}}));
    const m=f.w.AstraSpeculation.windowSensitivity(data,'2040801',30),r=m.comparisons.find(x=>x.days===30);near(r.endpointPercent,30);assert.equal(r.periodPercent,null);
    const seven=m.comparisons.find(x=>x.days===7);assert.notEqual(seven.periodPercent,null);near(seven.recentMean,127);near(seven.priorMean,120);
    assert.equal(m.endDay,'2026-11-06');
  }finally{f.close();}
});
test('source publication anchor, atomic snapshots and unknown cohort: newer three-day references never supply daily days',async()=>{
  const data=await accepted(),f=fixture(data);try{const calc=f.w.AstraSpeculation.windowSensitivity,a=calc(data),changed=clone(data);changed.apiCalculationView.clocks.currentPrices='2030-01-01T00:00:00Z';changed.rows.forEach(r=>{r.price=999999999;r.currentApiReference.currentSaleMedianLexeme='999999999';});assert.equal(JSON.stringify(calc(changed)),JSON.stringify(a));
    changed.apiCalculationView.clocks.dailyPublisher='2026-11-08T00:00:00Z';const b=calc(changed);assert.equal(b.endDay,'2026-11-07');assert(b.comparisons.every(r=>r.endpointPercent===null));
    for(const bad of [{...data,apiDailyItems:undefined},{...data,apiCalculationView:undefined},{...data,apiDailyItems:[...data.apiDailyItems.slice(1),data.apiDailyItems[1]]}])assert.equal(calc(bad).available,false);
  }finally{f.close();}
});
test('route defaultOff and panel collapsed, custom DOM rendering/clock formatting/Off revocation makes zero HTTP or timers',async()=>{
  const data=await accepted(),f=fixture(data);try{const panel=f.d.getElementById('speculation-window'),body=f.d.querySelector('.speculation-window-body'),result=f.d.getElementById('speculation-window-result');
    assert.equal(f.d.getElementById('speculation-nav').hidden,true);assert.equal(panel.open,false);assert.equal(body.hidden,true);assert.equal(result.textContent,'');f.open();assert.equal(body.hidden,false);assert.match(result.textContent,/\(Nov 6, 2026\)/);assert.match(result.textContent,/\+50\.0001%/);assert.match(result.textContent,/not a pooled-sale median|Equal-day arithmetic means/);
    const custom=f.d.getElementById('speculation-window-custom');custom.value='30';custom.dispatchEvent(new f.w.Event('input'));assert.equal(result.querySelectorAll('tbody tr').length,4);assert.match(result.querySelector('tbody tr:last-child').textContent,/Unavailable/);
    const z=f.d.getElementById('display-timezone');z.value='America/Chicago';z.dispatchEvent(new f.w.Event('change',{bubbles:true}));assert.match(result.textContent,/America\/Chicago 2026/);assert.match(result.textContent,/\(Nov 6, 2026\)/);
    f.publish({smega:[]});assert.match(result.textContent,/Unavailable/);f.publish(data);f.d.querySelector('.speculation-options button').click();assert.equal(panel.open,false);assert.equal(body.hidden,true);assert.equal(result.textContent,'');
    f.w.eval(script);assert.equal(f.d.querySelectorAll('#speculation-window').length,1);assert.equal(f.d.querySelector('footer').textContent,'Original private footer');assert.equal(f.requests,0);assert.equal(f.timers,0);assert.deepEqual(f.errors,[]);
  }finally{f.close();}
});
