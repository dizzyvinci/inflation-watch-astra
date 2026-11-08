const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {pathToFileURL}=require('node:url'),{createHash}=require('node:crypto');
const project=process.env.ASTRA_TEST_PROJECT?path.resolve(process.env.ASTRA_TEST_PROJECT):path.resolve(__dirname,'..');
async function genuineAppReport(){
 const contract=await import(pathToFileURL(path.join(project,'ops/api-index-public-contract.mjs')).href);
 const {createCalculationRuntime}=await import(pathToFileURL(path.join(project,'ui-src/api-calculations/runtime.mjs')).href);
 const definition=JSON.parse(fs.readFileSync(path.join(project,'ops/api-index-definition-data-v1.json'),'utf8'));
 const raw=fs.readFileSync(path.join(project,'tests/fixtures/window-sensitivity-calculations.json'));
 const hash=createHash('sha256').update(raw).digest('hex'),dto=await contract.parseApiIndexSnapshot(raw,{expectedDefinitionHash:'865944dc992219e01b2aad45a6191174d112f3f1902e4ac86c79a6d23a481e17',expectedRows:definition.goods,expectedCashRows:definition.cash});
 // Only legacy presentation fields: deliberately no top-level itemId/canonicalId.
 const legacy={basketHash:definition.basketHash,sourceUpdatedAt:definition.legacySourceUpdatedAt,history:[],smega:[],rows:definition.goods.map(r=>({slug:r.slug,name:r.name,category:r.category,weight:r.weight,basePrice:r.basePrice,price:r.legacyLinkPrice,priceDay:definition.linkDay,sourceUrl:null,history:[]}))};
 let requests=0;
 const runtime=createCalculationRuntime({origin:'http://127.0.0.1:8765',available:true,definitionHash:dto.definitionHash,parse:contract.parseApiIndexSnapshot,unpackDaily:contract.unpackApiDailyItemHistory,itemDefinitions:definition,now:()=>Date.parse('2026-11-08T04:05:10.000Z'),fetcher:async url=>{
  requests++;assert.equal(url,'http://127.0.0.1:8765/api-market-calculations.json');
  return new Response(raw,{status:200,headers:{'Content-Type':'application/json','Content-Length':String(raw.length),'Cache-Control':'private, no-store','ETag':'"api-calculations-'+hash+'"','X-Astra-Calculations-Definition-Hash':dto.definitionHash,'X-Astra-Calculations-Prices-Captured-At':dto.sources.prices.capturedAt,'X-Astra-Calculations-Overview-Captured-At':dto.sources.overview.capturedAt,'X-Astra-Calculations-Mode':'accepted_cache'}});
 }});
 assert(runtime.setLegacy(legacy));await runtime.refresh();assert.equal(runtime.state().status,'current');assert(runtime.getView());
 const report=runtime.overlayReport(legacy);assert.equal(report.apiDailyItems.length,79);
 assert(report.rows.every(r=>!Object.hasOwn(r,'itemId')&&!Object.hasOwn(r,'canonicalId')&&r.currentApiReference?.itemId));
 assert.equal(requests,1);return{report,dto};
}
function calculator(){const c={window:{},document:{getElementById:()=>null,querySelector:()=>null},URL};vm.createContext(c);vm.runInContext(fs.readFileSync(path.join(project,'web/speculation.js'),'utf8'),c,{timeout:1000});return c.window.AstraSpeculation.windowSensitivity;}
const near=(a,b)=>assert(Math.abs(a-b)<1e-9,`${a} != ${b}`);
test('actual calculation runtime overlay binds basket from currentApiReference, without invented top-level IDs',async()=>{
 const {report,dto}=await genuineAppReport(),calc=calculator(),model=calc(report,'basket',3);
 assert.equal(model.available,true,model.reason);assert.equal(model.endDay,'2026-11-06');
 const days=new Map(dto.daily.history.map(r=>[r.day,r.index]));
 near(model.comparisons.find(r=>r.days===1).endpointPercent,100*(days.get('2026-11-06')/days.get('2026-11-05')-1));
 near(model.comparisons.find(r=>r.days===3).endpointPercent,100*(days.get('2026-11-06')/days.get('2026-11-03')-1));
 near(model.comparisons.find(r=>r.days===7).endpointPercent,100*(days.get('2026-11-06')/days.get('2026-10-30')-1));
 assert.equal(model.comparisons.find(r=>r.days===7).periodPercent,null);
 near(calc(report,'2040801',3).comparisons.find(r=>r.days===3).endpointPercent,-6.2500625);
});
test('wrong or missing API-reference calibration stays unavailable rather than joining display aliases',async()=>{
 const {report}=await genuineAppReport(),calc=calculator();
 for(const mutate of [r=>{delete r.currentApiReference;r.itemId=2040801;},r=>{r.currentApiReference.itemId++;},r=>{r.currentApiReference.weight*=2;},r=>{r.currentApiReference.basePrice++;},r=>{r.currentApiReference.slug='other';},r=>{r.canonicalId=r.currentApiReference.itemId+1;}]){
  const bad=structuredClone(report);mutate(bad.rows[0]);assert.equal(calc(bad,'basket').available,false);
 }
});
