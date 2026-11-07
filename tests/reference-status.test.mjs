import test from 'node:test';import assert from 'node:assert/strict';
import {describeReferenceStatus as describe} from '../ui-src/item-api/reference-status.mjs';
const now=Date.parse('2026-11-07T09:20:00.000Z'),clock=age=>new Date(now-age).toISOString();
const base={now,status:'current',hasData:true,capturedAt:clock(0),bandMinutes:20};
test('10/20-minute inclusive display bands and every permitted future skew stay correctly qualified',()=>{
 for(const bandMinutes of [10,20]){
  for(const age of [0,1,bandMinutes*60000]){const s=describe({...base,bandMinutes,capturedAt:clock(age)});assert.equal(s.tone,'green');assert.equal(s.phase,'recent');assert.match(s.label,/display band; not verified fresh trades/);}
  assert.equal(describe({...base,bandMinutes,capturedAt:clock(bandMinutes*60000+1)}).phase,'aged');
  for(const age of [-1,-1000,-30000]){const value=clock(age),s=describe({...base,bandMinutes,capturedAt:value});assert.equal(s.tone,'amber');assert.equal(s.phase,'clock_uncertain');assert.equal(s.capturedAt,value);}
 }
});
test('loading, retained, partial, missing-model, paused and inactive evidence never produce green',()=>{
 for(const edit of [{status:'loading'},{status:'retained'},{retained:true},{partial:true},{available:false},{visible:false},{online:false},{status:'paused'},{status:'hidden'},{status:'off'},{status:'idle'}])assert.equal(describe({...base,...edit}).tone,'amber',JSON.stringify(edit));
 for(const edit of [{hasData:false},{capturedAt:null},{capturedAt:'bad'},{bandMinutes:NaN}])assert.equal(describe({...base,...edit}).tone,'amber');
 assert.equal(describe({...base,status:'site_access'}).tone,'red');assert.equal(describe({...base,status:'access_denied'}).tone,'red');
 assert.equal(describe({...base,hasData:false,status:'unavailable'}).tone,'red');assert.equal(describe({...base,hasData:false,status:'not_published'}).tone,'amber');
 assert.equal(describe({...base,status:'unavailable'}).phase,'retained');
 assert.match(describe({...base,hasData:false,visible:false,capturedAt:null}).label,/no validated reference yet/);assert.match(describe({...base,visible:false}).label,/original retrieval retained/);
});
test('classification reads no check/owner/secret fields and never mutates source evidence',()=>{
 const input={...base};for(const key of ['checkedAt','privateHealth','key','owner','quota','attemptId'])Object.defineProperty(input,key,{get(){throw Error('private or irrelevant field read');}});
 const before=input.capturedAt;const s=describe(input);assert.equal(s.capturedAt,before);assert.equal(input.capturedAt,before);assert(Object.isFrozen(s));
});
