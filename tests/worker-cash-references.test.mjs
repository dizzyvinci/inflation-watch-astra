import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { referenceFingerprint, calculationFingerprint } from '../ops/worker.mjs';
import { computeReport } from '../ops/worker-core.mjs';
const read = file => JSON.parse(readFileSync(new URL(file, import.meta.url), 'utf8'));
const seed=read('../dist/data.json'),feed=read('../cache/market.json'),config=read('../config.json');
const reference={schemaVersion:1,kind:'supplemental_cash_rolling_references',sourceUrl:'https://mesos.watch/',items:[{id:1007133,name:'Teddy Bear Headgear',price:54999,salesCounted:330,windowDays:30,statRoll:'Clean',capturedAt:'2026-11-05T14:10:38.488Z',sourceObservedAt:null,availabilityConfirmed:false}],latestBatch:{completePlan:false,completedAttemptCount:1},plannedItemCount:50};
test('supplemental cash references independently fingerprint clocks, prices, variants and partial progress',async()=>{
 const baseline={...structuredClone(seed),cashPriceReferences:structuredClone(reference)},expected=await referenceFingerprint(baseline);
 for(const modify of [v=>v.items[0].price++,v=>v.items[0].capturedAt='2026-11-05T14:11:00Z',v=>v.items[0].statRoll=null,v=>v.latestBatch.completedAttemptCount++]){const changed=structuredClone(baseline);modify(changed.cashPriceReferences);assert.notEqual(await referenceFingerprint(changed),expected);assert.equal(await calculationFingerprint(changed),await calculationFingerprint(baseline));}
 const checked={...baseline,builtAt:'2099-01-01T00:00:00Z',sourceStatus:{status:'checked'}};assert.equal(await referenceFingerprint(checked),expected);
});
test('Worker seed passthrough preserves supplemental reference without changing daily calculations or primary79',()=>{
 const opts={config,builtAt:seed.builtAt,checkedAt:seed.builtAt},before=computeReport(feed,seed,opts),after=computeReport(feed,{...seed,cashPriceReferences:reference},opts);
 assert.deepEqual(after.cashPriceReferences,reference);assert.deepEqual(after.latest,before.latest);assert.deepEqual(after.history,before.history);assert.deepEqual(after.cash,before.cash);assert.deepEqual(after.cashBasket,before.cashBasket);assert.deepEqual(after.rollingReference,before.rollingReference);assert.deepEqual(after.cashCatalog,before.cashCatalog);
});
