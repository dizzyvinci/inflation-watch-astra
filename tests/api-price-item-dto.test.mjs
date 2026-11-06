import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createPriceSnapshot,createIdentityIndex,parseStrictJson,sha256,filterReportedStats,filterOptions,filterEvidenceGroups,assertSafeItemDto,PROFILE,InvalidProfile} from '../ops/api-price-item-dto.mjs';
const fixture=fs.readFileSync(new URL('./api-price-item-fixture.json',import.meta.url));
const context={operation:'prices',sourceUrl:PROFILE.sourceUrl,capturedAt:'2026-11-05T21:13:49.724Z',sourceObservedAt:null,captureTimeKind:'http_response_completed'};
const url='https://maplestory.io/api/MCW/1/item/list?cashFilter=false&count=10000';
async function identity(rows=[{id:1082000,name:'Synthetic Glove'}]){const raw=JSON.stringify(rows);return createIdentityIndex([{raw,expectedSha256:await sha256(new TextEncoder().encode(raw)),sourceUrl:url,format:'noncash_list'}]);}
async function snapshot(raw=fixture,options={}){return createPriceSnapshot(raw,{expectedSha256:await sha256(raw),context,identities:await identity(),...options});}
const clone=v=>JSON.parse(JSON.stringify(v));
function mutation(fn){const v=JSON.parse(fixture);fn(v);return new TextEncoder().encode(JSON.stringify(v));}

test('lossless number lexemes retain sold average/median/ask separately',async()=>{
 const s=await snapshot(),d=s.getItem(1082000);
 assert.equal(d.aggregate.sold.averageUnitPrice,'10.123456789123456789');assert.equal(d.aggregate.sold.medianUnitPrice,'9.500');assert.equal(d.aggregate.asking.medianUnitPrice,'12.25');
 assert.equal(d.aggregate.sold.reportedSalesCount,2);assert.equal(d.aggregate.sold.reportedUnitCount,19);assert.equal(d.aggregate.reference.aggregation,'average');
 assert.equal(d.variants.reportedStats[1].reference.aggregation,'unknown');assert.equal(d.variants.reportedStats[1].reference.basis,'listed');assert.equal(d.variants.attackPools[0].reference.isNearFallback,true);
 assert.equal(d.semantics.exactVariantHistoryAvailable,false);assert.equal(d.semantics.feesApplied,false);
 assert.equal(d.source.retrievedAt,context.capturedAt);assert.equal(d.source.sourceObservedAt,null);assert.equal(d.source.window.exactStartAt,null);
 assert.equal(s.getItem(888),null);assert.equal(s.summary.itemCount,2);assert.equal(s.getItem(9999999).identity.name,null);assert.equal(s.getItem(9999999).aggregate.sold,null);
});
test('strict raw JSON rejects duplicates, parser ambiguity, nonfinite, depth and huge exponent',async()=>{
 for(const raw of ['{"a":1,"a":2}','[01]','[NaN]','[1,]','{"a":1}x','"bad\ntext"','['.repeat(66)+']'.repeat(66)])assert.throws(()=>parseStrictJson(raw),InvalidProfile);
 await assert.rejects(snapshot(new TextEncoder().encode('[{"item_id":1,"sold":null,"seen":null,"reference":{"unit_price":1e999999999,"basis":"sold","samples":1,"scope":"item"}}]')),/amount_precision_bound/);
 const parsed=parseStrictJson('{"__proto__":{"polluted":true}}');assert.equal(Object.getPrototypeOf(parsed),null);assert.equal({}.polluted,undefined);
});
test('wrong hash/source/clock and incompatible price profile fail closed',async()=>{
 await assert.rejects(snapshot(fixture,{expectedSha256:'0'.repeat(64)}),/raw_hash/);
 for(const c of [{...context,sourceUrl:'https://other.example/api/prices'},{...context,sourceObservedAt:context.capturedAt},{...context,capturedAt:'2026-02-30T00:00:00Z'}])await assert.rejects(snapshot(fixture,{context:c}));
 for(const change of [v=>v[0].sold.sales=true,v=>v[0].sold.units=-1,v=>v[0].item_id='1082000',v=>v.push(v[0]),v=>v[0].reference.unit_price='10.5',v=>v[0].actor='SYNTHETIC_PERSON_MARKER'])await assert.rejects(snapshot(mutation(change)),InvalidProfile);
});
test('stat14 is crit, ATT16, filters require present values and preserve zero/unknown distinction',async()=>{
 const d=(await snapshot()).getItem(1082000);
 assert.deepEqual(filterOptions(d).stats,[{code:'14',label:'Crit rate'},{code:'16',label:'Weapon ATT'}]);
 assert.deepEqual(filterReportedStats(d,{stats:[{code:'16',minimum:0}],slotsLeft:5}).map(v=>v.reportedStats['16']),[0]);
 assert.equal(filterReportedStats(d,{stats:[{code:'14',minimum:2}],slotsLeft:5,successfulUpgrades:0}).length,1);
 assert.equal(filterReportedStats(d,{stats:[{code:'16',minimum:2}],slotsLeft:5}).length,0);
 assert.equal(d.variants.attackPools.length,1); // pool never fills an empty stat-filter result
 assert.throws(()=>filterReportedStats(d,{stats:[{code:'8'}]}),/filter_stat/);
 assert.throws(()=>filterReportedStats(d,{stats:[{code:'14',minimum:2,maximum:1}]}),/filter_range/);
});
test('successful upgrades are not attempts; group identity stable and unknown stats stay absent',async()=>{
 const d=(await snapshot()).getItem(1082000),g=d.variants.reportedStats[0];
 assert.equal(g.groupKey,'stats:1082000:u1:s3:14=1,16=2');assert.equal(g.successfulUpgrades,1);assert.equal(g.slotsLeft,3);assert.equal(g.qualityConstant,false);assert.equal(g.unreportedStats,'unknown_not_zero');assert.equal(own(g,'attempts'),false);
 const raw=mutation(v=>{v[0].by_stats[0].stats={'16':2,'14':1};});assert.equal((await snapshot(raw)).getItem(1082000).variants.reportedStats[0].groupKey,g.groupKey);
 for(const change of [v=>v[0].by_stats[0].stats['8']=1,v=>v[0].by_stats.push(v[0].by_stats[0]),v=>v[0].by_stats[0].upgrades=1.5])await assert.rejects(snapshot(mutation(change)));
});
const own=(v,k)=>Object.prototype.hasOwnProperty.call(v,k);
test('metadata exact ID/hash and world binding; duplicate names are not fuzzy joins',async()=>{
 const ids=await identity([{id:1082000,name:'Same Name'},{id:1082001,name:'Same Name'}]);assert.equal(ids.get(1082000).name,'Same Name');assert.equal(ids.get(1082001).name,'Same Name');assert.equal(ids.get(1).name,null);
 const raw=JSON.stringify([{id:1082000,name:'Other Name'}]);const conflict=await createIdentityIndex([
  {raw:JSON.stringify([{id:1082000,name:'First Name'}]),expectedSha256:await sha256(new TextEncoder().encode(JSON.stringify([{id:1082000,name:'First Name'}]))),sourceUrl:url,format:'noncash_list'},
  {raw,expectedSha256:await sha256(new TextEncoder().encode(raw)),sourceUrl:url,format:'noncash_list'}]);assert.equal(conflict.get(1082000).name,null);assert.equal(conflict.get(1082000).status,'conflicting_client_id');
 await assert.rejects(createIdentityIndex([{raw,expectedSha256:'0'.repeat(64),sourceUrl:url,format:'noncash_list'}]),/identity_hash/);
 await assert.rejects(createIdentityIndex([{raw,expectedSha256:await sha256(new TextEncoder().encode(raw)),sourceUrl:url,format:'cash_client_catalog'}]),/identity_source/);
});
test('DTO is allowlisted at every nested egress boundary, not a raw mirror',async()=>{
 const d=(await snapshot()).getItem(1082000);assert.equal(assertSafeItemDto(d),true);
 for(const accessor of [v=>v,v=>v.source,v=>v.identity,v=>v.identity.evidence[0],v=>v.aggregate,v=>v.aggregate.sold,v=>v.aggregate.asking,v=>v.aggregate.reference,v=>v.variants,v=>v.variants.reportedStats[0],v=>v.variants.reportedStats[0].reference,v=>v.variants.attackPools[0],v=>v.semantics]){
  const copy=clone(d);accessor(copy).owner_name='SYNTHETIC_PERSON_MARKER';assert.throws(()=>assertSafeItemDto(copy),InvalidProfile);
 }
 const wrong=clone(d);wrong.variants.reportedStats[0].groupKey='stats:OTHER';assert.throws(()=>assertSafeItemDto(wrong),/dto_group_binding/);
 assert(!JSON.stringify(d).includes('attemptId'));assert(!JSON.stringify(d).includes('rawBodyBase64'));
});
test('immutable independent DTO bodies and parsed input cannot mutate snapshot',async()=>{
 const raw=new Uint8Array(fixture),s=await snapshot(raw),d=s.getItem(1082000),first=JSON.stringify(d);raw.fill(0);
 assert.throws(()=>{d.aggregate.sold.medianUnitPrice='0';},TypeError);assert.throws(()=>{d.variants.reportedStats.push({});},TypeError);
 const a=clone(d),b=clone(d);a.aggregate.sold.medianUnitPrice='0';assert.notEqual(a.aggregate.sold.medianUnitPrice,b.aggregate.sold.medianUnitPrice);assert.equal(JSON.stringify(s.getItem(1082000)),first);
});
test('absent groups remain distinguishable from present empty groups',async()=>{
 const s=await snapshot(),d=s.getItem(9999999);assert.equal(d.variants.presence.reportedStats,false);assert.deepEqual(d.variants.reportedStats,[]);
 const raw=mutation(v=>{v[1].by_stats=[];});assert.equal((await snapshot(raw)).getItem(9999999).variants.presence.reportedStats,true);
});
test('pool selection refuses incompatible filters and near fallbacks require explicit inclusion',async()=>{
 const d=(await snapshot()).getItem(1082000);
 assert.equal(filterEvidenceGroups(d,{kind:'attack_pool',minimumAttack:2,maximumAttack:2}).rows.length,0);
 assert.equal(filterEvidenceGroups(d,{kind:'attack_pool',minimumAttack:2,includeNearFallback:true}).rows.length,1);
 assert.equal(filterEvidenceGroups(d,{kind:'scroll_state',slotsLeft:3,successfulUpgrades:1,minimumReferenceSamples:4,basis:'sold'}).rows.length,1);
 assert.equal(filterEvidenceGroups(d,{kind:'scroll_state',minimumReferenceSamples:5}).rows.length,0);
 assert.throws(()=>filterEvidenceGroups(d,{kind:'scroll_state',stats:[{code:'14'}]}),/incompatible_filter_pool/);
 assert.throws(()=>filterEvidenceGroups(d,{kind:'attack_pool',slotsLeft:3}),/incompatible_filter_pool/);
 const exact=filterEvidenceGroups(d,{kind:'reported_stats',stats:[{code:'16',minimum:2}],slotsLeft:3});assert.equal(exact.rows.length,1);assert.equal(exact.qualityConstant,false);assert.equal(exact.temporalHistoryAvailable,false);
});
test('exact decimal reference sorting never rounds and missing prices sort last both ways',async()=>{
 const source=fs.readFileSync(new URL('./api-price-item-fixture.json',import.meta.url),'utf8').replace('200.25','100.500000000000000001');
 const d=(await snapshot(new TextEncoder().encode(source))).getItem(1082000);
 const up=filterEvidenceGroups(d,{kind:'reported_stats',sortReference:'ascending'}).rows;
 const down=filterEvidenceGroups(d,{kind:'reported_stats',sortReference:'descending'}).rows;
 assert.equal(up[0].reference.unitPrice,'100.5');assert.equal(down[0].reference.unitPrice,'100.500000000000000001');
 assert.equal(up.at(-1).reference,null);assert.equal(down.at(-1).reference,null);
});
