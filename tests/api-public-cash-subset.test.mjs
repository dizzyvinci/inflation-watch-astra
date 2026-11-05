// Synthetic-only future-CI boundary tests. No captured API body, account or key.
import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {projectReceipt} from '../ops/api-raw-prices-decoder.mjs';
import {portableHash,HASH_METHOD} from '../ops/portable-hash.mjs';
import bindings from '../ops/api-cash-bindings-v1.json' with {type:'json'};
import {publicCashSubset} from '../ops/api-public-cash-subset.mjs';
const START='2026-11-05T12:00:00.000Z',END='2026-11-05T12:00:01.000Z';
async function fixture({thin=false}={}){
  const rows=bindings.targets.map((target,i)=>({item_id:target.itemId,
    sold:{sales:thin&&i===0?4:5+i,units:1000+i,avg_unit_price:target.fixedNxCost*90,
      median_unit_price:target.fixedNxCost*(10+i/10),day_sales:1,day_units:100},seen:null,
    reference:{unit_price:target.fixedNxCost*99,basis:'listed',samples:5,scope:'item'}}));
  const raw=Buffer.from(JSON.stringify(rows));
  const envelope={operation:'prices',httpStatus:200,sourceUrl:'https://maplestory.market/api/prices',requestStartedAt:START,capturedAt:END,
    rawBodyEncoding:'base64',rawBodyBase64:raw.toString('base64'),responseBytes:raw.length,responseSha256:createHash('sha256').update(raw).digest('hex')};
  const input={schemaVersion:1,kind:'private_validated_api_cash_median_inputs',sourceUrl:envelope.sourceUrl,
    rawResponseSha256:envelope.responseSha256,rawResponseBytes:envelope.responseBytes,requestStartedAt:START,capturedAt:END,sourceObservedAt:null,
    priceField:'sold.median_unit_price',weightField:'sold.sales',...structuredClone(bindings),sourceRows:[]};
  return projectReceipt(envelope,input,'v6kkdvp6');
}
async function altered(dto,change){const next=structuredClone(dto);change(next);delete next.projectionHash;return{...next,projectionHash:await portableHash(next)};}
const enabled={enabled:true};

test('disabled path does not touch evidence, and enabled path displays only the fixed29',async()=>{
  const forbidden=new Proxy({},{ownKeys(){throw new Error('Evidence must not be touched off');}});
  for(const option of [{}, {enabled:false},{enabled:'true'}])assert.equal(await publicCashSubset(forbidden,option),null);
  const dto=await fixture(),result=await publicCashSubset(dto,enabled);
  assert.equal(result.records.length,29);assert.deepEqual(result.coverage,{expected:29,available:29,missingOrInvalid:0});
  assert.equal(result.privateProjectionHash,dto.projectionHash);assert.equal(result.records[0].mesosPerNx,10);
  assert.equal(result.records[0].recordedSalesCount,5);assert.notEqual(result.records[0].recordedSalesCount,1000);
  assert.equal(result.changesHeadlineBenchmark,false);assert.equal(result.changesGoodsIndex,false);assert.equal(result.isExecutableQuote,false);
  const {subsetHash,...hashed}=result;assert.equal(await portableHash(hashed),subsetHash);
});
test('tampered hash/method/cohort and per-record identity/cost cannot pass even if rehashed',async()=>{
  const dto=await fixture();await assert.rejects(publicCashSubset({...dto,projectionHash:'0'.repeat(64)},enabled));
  for(const change of [d=>d.hashMethod='other',d=>d.candidatePlanHash='0'.repeat(64),d=>d.fixedNxScheduleSha256='0'.repeat(64),
    d=>d.records[0].fixedNxCost++,d=>d.records[0].name='Alias',d=>d.records[0].itemId++,d=>d.records[1]=structuredClone(d.records[0])])
    await assert.rejects(async()=>publicCashSubset(await altered(dto,change),enabled));
});
test('reviewed identity subset hash and original raw binding are required, not just a self-recomputed DTO hash',async()=>{
  const dto=await fixture();
  for(const change of [d=>d.identitySubsetHash='0'.repeat(64),d=>d.rawResponseSha256='not-a-hash',d=>d.rawResponseBytes=0,d=>d.rawResponseBytes=5_000_001])
    await assert.rejects(async()=>publicCashSubset(await altered(dto,change),enabled));
});
test('verified attribution proof and exact project links are all required',async()=>{
  const dto=await fixture();
  for(const change of [d=>d.attribution.complete=false,d=>d.records[0].sourceCreditUrl='https://maplestory.market/items/1?ref=wrong',
    d=>d.attribution.itemRouteVerified=false,d=>d.attribution.routeEvidenceSha256='0'.repeat(64),d=>d.attribution.publicLinkCodePresent=false])
    await assert.rejects(async()=>publicCashSubset(await altered(dto,change),enabled));
});
test('clock precision/bounds and quality claims cannot silently be promoted',async()=>{
  const dto=await fixture();
  for(const change of [d=>d.sourceObservedAt=END,d=>d.capturedAt='2026-11-05',d=>d.requestStartedAt='2026-11-06T00:00:00.000Z',
    d=>d.window.start=START,d=>d.window.boundsKnown=true,d=>d.window.reportedLookbackDays=1,
    d=>d.records[0].qualityConstantVerified=true,d=>d.records[0].itemNameEchoVerified=true])
    await assert.rejects(async()=>publicCashSubset(await altered(dto,change),enabled));
  const result=await publicCashSubset(dto,enabled);assert.equal(result.capturedAt,END);assert.equal(result.requestStartedAt,START);
  assert.equal(result.sourceObservedAt,null);assert.deepEqual(result.window,{reportedLookbackDays:3,start:null,end:null,boundsKnown:false});
});
test('AVG/asks/unit counts, unsafe count totals and wrong rate units are rejected',async()=>{
  const dto=await fixture();
  for(const change of [d=>d.records[0].sourcePriceField='sold.avg_unit_price',d=>d.records[0].sourcePriceField='reference.unit_price',
    d=>d.records[0].sourceWeightField='sold.units',d=>d.aggregate.usesPhysicalUnitsAsWeights=true,d=>d.aggregate.qualifiedIndividualTrades=1,
    d=>d.records[0].rateMesosPerNx++,d=>{for(const r of d.records)r.recordedSalesCount=Number.MAX_SAFE_INTEGER;
      d.aggregate.recordedSalesCountWeightTotal=d.records.reduce((sum,r)=>sum+r.recordedSalesCount,0);}])
    await assert.rejects(async()=>publicCashSubset(await altered(dto,change),enabled));
});
test('partial fixed29 remains displayable with nulls and no pooled/renormalized aggregate',async()=>{
  const dto=await fixture({thin:true}),result=await publicCashSubset(dto,enabled);
  assert.equal(result.records.length,29);assert.equal(result.coverage.available,28);assert.equal(result.coverage.missingOrInvalid,1);
  const missing=result.records.find(r=>r.available===false);assert.equal(missing.saleMedianMesos,null);
  assert.equal(missing.recordedSalesCount,null);assert.equal(missing.mesosPerNx,null);assert.equal('aggregate' in result,false);
  await assert.rejects(publicCashSubset(await altered(dto,d=>d.coverage.available=29),enabled));
});
test('public whitelist excludes all raw/player/private branches without altering supported data',async()=>{
  const dto=await fixture();const poisoned=await altered(dto,d=>{d.owner_name='PRIVATE-NAME-SENTINEL';d.rawBodyBase64='RAW-BODY-SENTINEL';
    d.records[0].stats={owner:'PRIVATE-STATS-SENTINEL'};d.grantReference='PRIVATE-GRANT-SENTINEL';});
  const result=await publicCashSubset(poisoned,enabled),text=JSON.stringify(result);
  for(const sentinel of ['PRIVATE-NAME-SENTINEL','RAW-BODY-SENTINEL','PRIVATE-STATS-SENTINEL','PRIVATE-GRANT-SENTINEL'])assert.ok(!text.includes(sentinel));
  assert.deepEqual(result.records,(await publicCashSubset(dto,enabled)).records);
  for(const forbidden of ['rawResponseSha256','rawBodyBase64','owner_name','grantReference','aggregate'])assert.equal(forbidden in result,false);
});
test('caller mutation during both awaited hashes cannot change public evidence or returned rows',async()=>{
  const dto=await fixture(),expected=await publicCashSubset(dto,enabled),pending=publicCashSubset(dto,enabled);
  dto.records[0].fixedNxCost++;dto.records[0].saleMedianMesos=999999999;dto.capturedAt='2030-01-01T00:00:00.000Z';dto.attribution.complete=false;
  assert.deepEqual(await pending,expected);assert.equal(expected.privateProjectionHash.length,64);assert.equal(HASH_METHOD,'mcat-typed-utf8-f64-v1');
});
test('shared imported binding mutation cannot replace the helper owned identity/cost snapshot',async()=>{
  const dto=await fixture(),target=bindings.targets[0],oldCost=target.fixedNxCost;
  const changed=await altered(dto,d=>{const r=d.records.find(row=>row.itemId===target.itemId);r.fixedNxCost++;
    r.rateMesosPerNx=r.saleMedianMesos/r.fixedNxCost;});
  try{target.fixedNxCost++;await assert.rejects(publicCashSubset(changed,enabled));}
  finally{target.fixedNxCost=oldCost;}
  assert.equal((await publicCashSubset(dto,enabled)).records.find(r=>r.itemId===target.itemId).fixedNxCost,oldCost);
});
