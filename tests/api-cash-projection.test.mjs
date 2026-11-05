// Synthetic prices only: safe to carry into public CI; no captured API prices/players.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {decodePricesReceipt,projectReceipt} from '../ops/api-raw-prices-decoder.mjs';
const binding=JSON.parse(readFileSync(new URL('../ops/api-cash-bindings-v1.json',import.meta.url),'utf8'));
const START='2026-11-05T12:00:00.000Z',END='2026-11-05T12:00:01.000Z';
const rows=()=>binding.targets.map(target=>({item_id:target.itemId,
 sold:{sales:5,units:500,avg_unit_price:target.fixedNxCost*90,median_unit_price:target.fixedNxCost*10,day_sales:1,day_units:100},
 seen:null,reference:{unit_price:target.fixedNxCost*99,basis:'listed',samples:5,scope:'item'}}));
function receipt(value=rows()){
 const raw=Buffer.from(typeof value==='string'?value:JSON.stringify(value));
 return{operation:'prices',httpStatus:200,sourceUrl:'https://maplestory.market/api/prices',requestStartedAt:START,capturedAt:END,
 rawBodyEncoding:'base64',rawBodyBase64:raw.toString('base64'),responseBytes:raw.length,responseSha256:createHash('sha256').update(raw).digest('hex')};
}
function inputs(envelope=receipt()){return{schemaVersion:1,kind:'private_validated_api_cash_median_inputs',sourceUrl:envelope.sourceUrl,
 rawResponseSha256:envelope.responseSha256,rawResponseBytes:envelope.responseBytes,requestStartedAt:START,capturedAt:END,sourceObservedAt:null,
 priceField:'sold.median_unit_price',weightField:'sold.sales',...structuredClone(binding),sourceRows:[]};}

test('synthetic29 raw receipt uses medians and sale counts, never AVG/asks/units or lossy payload',async()=>{
 const envelope=receipt();Object.defineProperty(envelope,'payload',{get(){throw Error('Lossy view read');}});
 const result=await projectReceipt(envelope,inputs(envelope));
 assert.equal(result.coverage.available,29);assert.equal(result.aggregate.rateMesosPerNx,10);
 assert.equal(result.aggregate.recordedSalesCountWeightTotal,145);assert.equal(result.aggregate.usesPhysicalUnitsAsWeights,false);
 assert.equal(result.publicationEligible,false);assert.equal(result.sourceObservedAt,null);assert.equal(result.capturedAt,END);
 assert(result.records.every(row=>row.sourceCreditUrl===`https://maplestory.market/items/${row.itemId}?ref=v6kkdvp6`));
});

test('original numeric tokens and duplicate decoded keys are checked before JSON precision loss',async()=>{
 const raw=JSON.stringify(rows());
 for(const token of ['9007199254740993','5.0','5e0','true','-1'])await assert.rejects(projectReceipt(receipt(raw.replace('"sales":5','"sales":'+token)),inputs()));
 for(const raw of ['[{"item_id":1,"item_\\u0069d":2}]','[] trailing','[NaN]','[01]'])await assert.rejects(decodePricesReceipt(receipt(raw)));
 await assert.rejects(decodePricesReceipt({...receipt(),responseSha256:'0'.repeat(64)}));
 await assert.rejects(decodePricesReceipt({...receipt(),responseBytes:1}));
});

test('missing/thin records remain in fixed29 coverage without a partial aggregate',async()=>{
 let data=rows();data[0].sold.sales=4;
 let value=await projectReceipt(receipt(data),inputs());assert.equal(value.coverage.available,28);assert.equal(value.records.length,29);assert.equal(value.aggregate.rateMesosPerNx,null);
 data=rows().slice(1);value=await projectReceipt(receipt(data),inputs());assert.equal(value.coverage.missingOrInvalid,1);assert.equal(value.aggregate.rateMesosPerNx,null);
});

test('nonselected stat variants survive strict decoding without replacing selected sale medians',async()=>{
 const data=rows();data[0].by_stats=[{upgrades:1,slots_left:4,stats:{'14':1,'16':2},reference:{unit_price:1,basis:'sold',samples:5,scope:'stats'}}];
 const envelope=receipt(data),decoded=await decodePricesReceipt(envelope);
 assert.equal(decoded.rows[0].by_stats[0].stats['16'].token,'2');
 const poisoned=inputs(envelope);poisoned.sourceRows=[{itemId:data[0].item_id,saleMedianMesos:999999999,recordedSales:999999}];
 assert.equal((await projectReceipt(envelope,poisoned)).aggregate.rateMesosPerNx,10);
 data[0].by_stats[0].private_player_field='unreviewed';await assert.rejects(projectReceipt(receipt(data),inputs()));
});

test('exact decimal overflow stays preserved but cannot create an infinite projection',async()=>{
 const data=rows();data[0].sold.median_unit_price='SYNTHETIC_OUTLIER';
 const raw=JSON.stringify(data).replace('"SYNTHETIC_OUTLIER"','1e400'),envelope=receipt(raw),decoded=await decodePricesReceipt(envelope);
 assert.equal(decoded.rows[0].sold.median_unit_price.token,'1e400');
 const result=await projectReceipt(envelope,inputs());assert.equal(result.coverage.available,28);assert.equal(result.aggregate.rateMesosPerNx,null);
});

test('async receipt and binding mutation cannot split the hashed proof from projected values',async()=>{
 const envelope=receipt(),supplied=inputs(envelope),expected=await projectReceipt(envelope,supplied);
 const pending=projectReceipt(envelope,supplied);
 supplied.targets[0].fixedNxCost++;supplied.routeEvidence.verified=false;envelope.capturedAt='2030-01-01T00:00:00.000Z';envelope.rawBodyBase64='bad';
 assert.deepEqual(await pending,expected);
});
