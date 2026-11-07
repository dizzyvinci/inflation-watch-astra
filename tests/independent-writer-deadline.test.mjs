import test from 'node:test';import assert from 'node:assert/strict';
import {fixture,noIO} from './fast-registration-fixture.mjs';
import {fastCurrentRegistrationConfiguration as cfg,createFastCurrentRegistryRegistration,isOwnedFastCurrentRegistryDelegate} from '../ops/api-fast-current-registration.mjs';
import {ApiPrivateCashAlarm} from '../ops/api-private-cash-alarm.mjs';
const proposal={schemaVersion:1,enabled:true,approvalRecorded:true,mode:'continuous_v2_reprojection',contractSha256:'e0c58417ac4bc4097d7a61d85797002708073a35fac48a7234c0bc646e977893',grantReference:'synthetic-grant',roundReference:'synthetic-r1',publicationEnabled:false};
const FAST_TABLES="SELECT name FROM sqlite_master WHERE name LIKE 'fast_%'";

test('independent registered writer retry deadline does not become a now-loop when no ordinary work is ready',async t=>{
 const f=await fixture(t,{fast:false,registrationConfig:proposal}),a=f.seed(),slot=f.owner.fastCurrentRegistration.delegate;await f.owner.privateCash.afterProviderEvent(f.owner.recurring.eventFrame());for(let i=0;i<60&&!f.row('SELECT 1 n FROM fast_current_outbox');i++)await f.owner.alarm();assert(f.row('SELECT 1 n FROM fast_current_outbox'));
 let once=true;f.hook(async(kind,key)=>{if(once&&kind==='put'&&key.includes('/fast-current/v1/shards/')){once=false;throw Error('synthetic transient immutable writer PUT failure');}});
 for(let i=0;i<60&&!(f.row('SELECT failures FROM fast_current_write_jobs')?.failures>0);i++)await f.owner.alarm();const w=f.row('SELECT state,retry_at,lease_until,failures FROM fast_current_write_jobs');assert.equal(w.state,'pending');assert(w.retry_at>f.now[0]);assert.equal(w.failures,1);await f.owner.recurring.drainOne(noIO,f.owner.recurring.eventFrame());const ordinary=f.owner.recurring.nextDue();assert(ordinary>f.now[0]);assert.equal(slot.inner.registryDue(),null);assert.equal(slot.inner.maintenance(),null);assert.equal(slot.inner.journal.gate.task,null);const due=slot.nextDue(),expected=Math.min(w.retry_at,ordinary);console.log(JSON.stringify({operatorNow:f.now[0],writer:w,ordinaryDue:ordinary,publicationDue:slot.inner.publication.nextDue(),reportedDelegateDue:due,expectedEarliestLegalDue:expected,providerCalls:f.provider.length}));assert.equal(due,expected);assert.equal(f.provider.length,0);
});
