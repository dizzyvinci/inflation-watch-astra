import test from'node:test';import assert from'node:assert/strict';import{readFileSync}from'node:fs';import{execFileSync}from'node:child_process';import{fileURLToPath}from'node:url';import{createHash}from'node:crypto';
import{createMarketCatalog}from'../ops/market-catalog.mjs';import{computeReport,computeCashCatalog}from'../ops/worker-core.mjs';
// Capture each public input once BEFORE the Python call. Both runtimes receive
// this same owned snapshot; neither consults a moving cache during comparison.
const project=fileURLToPath(new URL('../',import.meta.url));
function snapshot(){const files={feed:'cache/market.json',seed:'dist/data.json',identities:'catalog-identities-v2.json',config:'config.json',metadata:'cache/cash-catalog-metadata.json',cashDefinition:'cache/cash-basket-v1.json'};const values={},hashes={},raws={};for(const[key,path]of Object.entries(files)){const raw=readFileSync(new URL('../'+path,import.meta.url));raws[key]=raw.toString('utf8');values[key]=JSON.parse(raw);hashes[key]=createHash('sha256').update(raw).digest('hex')}return{values,hashes,raws}}
function equivalent(actual,expected,path='root'){
 if(typeof actual==='number'&&typeof expected==='number'){
  // Source/count/price numbers stay exact. Only the established derived
  // floating-sum fields receive the existing cross-runtime tolerance.
  const derived=new Set(['cpi','coverage','pricedCoverage','changeBase','changeDay','indexContribution','changeContribution','baseExpenditure','baseQuantity','recentTurnoverProxy','rate']);
  if(!derived.has(path.split('.').at(-1))){assert.equal(actual,expected,path);return}
  assert.ok(Number.isFinite(actual)&&Number.isFinite(expected),path);assert.ok(Math.abs(actual-expected)<=1e-10+1e-12*Math.max(Math.abs(actual),Math.abs(expected)),path);return;
 }
 if(Array.isArray(expected)){assert.ok(Array.isArray(actual),path);assert.equal(actual.length,expected.length,path);for(let i=0;i<expected.length;i++)equivalent(actual[i],expected[i],path+'.'+i);return}
 if(expected!==null&&typeof expected==='object'){assert.deepEqual(Object.keys(actual).sort(),Object.keys(expected).sort(),path);for(const key of Object.keys(expected))equivalent(actual[key],expected[key],path+'.'+key);return}
 assert.deepEqual(actual,expected,path);
}
test('captured current public inputs preserve Python/Worker full catalogue parity, source clocks and frozen cash weights without fixed counts',async()=>{
 const{values:s,hashes,raws}=snapshot();const input=JSON.stringify(s),wire=JSON.stringify(raws);
 const expected=JSON.parse(execFileSync(process.env.PYTHON||'python',['-B','-c',`
import sys,json
import engine
from market_catalog import MarketCatalog
from cash_basket import compute_from_definition
s={key:json.loads(raw) for key,raw in json.loads(sys.stdin.buffer.read().decode('utf-8')).items()};feed=s['feed'];seed=s['seed'];catalog=MarketCatalog(feed,s['identities'])
cash=engine.cash_catalog(feed,s['config'],seed.get('cashBasket'),seed.get('rollingReference'),seed.get('cashCatalog',{}).get('identityMap'),s['metadata'])
print(json.dumps({'index':catalog.build_index(),'details':{i['s']:catalog.resolve_item(i['s']) for i in feed['items']},'pointCount':sum(len(i['h']) for i in feed['items']),'cashCatalog':cash,'cashBasket':compute_from_definition(feed,s['cashDefinition'],s['config'])},ensure_ascii=True,allow_nan=False))
`],{cwd:project,input:wire,encoding:'utf8',maxBuffer:16*1024*1024}));
 const catalogue=await createMarketCatalog(s.feed,s.identities),index=catalogue.buildIndex();assert.deepEqual(index,expected.index);assert.equal(index.itemCount,s.feed.items.length);let points=0;
 for(const raw of s.feed.items){const detail=catalogue.resolveItem(raw.s);assert.deepEqual(detail,expected.details[raw.s],raw.s);assert.equal(detail.sourceUpdatedAt,s.feed.updatedAt);points+=detail.history.length}
 assert.equal(points,expected.pointCount);assert.equal(points,s.feed.items.reduce((n,i)=>n+i.h.length,0));
 const cash=computeCashCatalog(s.feed,s.config,s.seed.cashBasket,s.seed.rollingReference,s.seed.cashCatalog?.identityMap,s.metadata);equivalent(cash,expected.cashCatalog);assert.equal(cash.sourceUpdatedAt,s.feed.updatedAt);
 const at=new Date(Math.max(Date.now(),Date.parse(s.feed.updatedAt),Date.parse(s.seed.builtAt))).toISOString();const report=computeReport(s.feed,s.seed,{config:s.config,checkedAt:at,builtAt:at});
 equivalent(report.cashBasket,expected.cashBasket);assert.equal(report.sourceUpdatedAt,s.feed.updatedAt);assert.equal(report.cashBasket.sourceUpdatedAt,s.feed.updatedAt);assert.equal(report.cashBasket.basketHash,s.seed.cashBasket.basketHash);
 assert.deepEqual(report.cashBasket.rows.map(r=>[r.slug,r.basePrice,r.weight]),s.seed.cashBasket.rows.map(r=>[r.slug,r.basePrice,r.weight]));
 assert.deepEqual(report.rows.map(r=>[r.slug,r.basePrice,r.weight]),s.seed.rows.map(r=>[r.slug,r.basePrice,r.weight]));
 assert.equal(JSON.stringify(s),input,'both runtimes leave captured public inputs unchanged');
 console.log('Current-input parity scope',JSON.stringify({hashes,sourceUpdatedAt:s.feed.updatedAt,items:index.itemCount,points,countsMeaning:'derived from the captured input and independent Python reference; not new fixed goldens',networkRequests:0}));
});
