import test from 'node:test';import assert from 'node:assert/strict';
import {fixture,PUBLIC_FLAG} from './api-public-cash-fixture.mjs';
test('private health reports publication state/attempts/retry only, with no raw data read or leak',async t=>{
 const f=await fixture(t);const now=f.now[0];
 f.core.sql.exec("UPDATE api_public_cash_outbox SET state='pending',target_attempt=268,published_attempt=0,retry_at=?,lease_until=?,body=?,target_json=? WHERE id=1",now+30000,now+120000,'SYNTHETIC_RAW_MARKER','SYNTHETIC_ACTOR_MARKER');
 const result=await f.owner.privateHealth.afterRun({status:'success'});assert.equal(result.status,'published_private_health');
 const saved=JSON.parse(f.objects.get('_private/provider-api/v1/health.json').body),p=saved.publicCashPublication;
 assert.equal(p.configuration,'ready');assert.equal(p.outboxState,'pending');assert.equal(p.targetAttempt,268);assert.equal(p.publishedAttempt,0);assert.equal(p.retryAt,new Date(now+30000).toISOString());assert.equal(p.leaseUntil,new Date(now+120000).toISOString());assert.equal(p.nextEligibleAt,p.leaseUntil);
 assert.equal(p.clockKind,'operator_publication_queue_not_market_observation');assert.equal(saved.sourceObservedAt,null);
 for(const marker of ['SYNTHETIC_RAW_MARKER','SYNTHETIC_ACTOR_MARKER','target_json','projectionKey','MAPLESTORY_MARKET_APPROVED_API_KEY'])assert(!JSON.stringify(p).includes(marker));
 assert(f.reads.every(key=>key==='_private/provider-api/v1/health.json'));assert.equal(f.calls.length,0);
 f.core.sql.exec("UPDATE api_public_cash_outbox SET state='quarantined',retry_at=0,lease_until=NULL WHERE id=1");assert.equal(f.owner.privateHealth.publicCashProgress().outboxState,'quarantined');
 f.core.sql.exec("UPDATE api_public_cash_outbox SET state='SYNTHETIC_PRIVATE_ERROR' WHERE id=1");assert.equal(f.owner.privateHealth.publicCashProgress().outboxState,'invalid_state');assert(!JSON.stringify(f.owner.privateHealth.publicCashProgress()).includes('SYNTHETIC_PRIVATE_ERROR'));
});
test('diagnostic distinguishes flagOff, invalid configuration, and missing outbox without creating it',async t=>{
 const f=await fixture(t,{publicFlag:{enabled:false}});assert.equal(f.owner.privateHealth.publicCashProgress().configuration,'public_disabled');
 f.env.API_PUBLIC_CASH_JSON=JSON.stringify(PUBLIC_FLAG);assert.equal(f.owner.privateHealth.publicCashProgress().outboxState,'not_initialized');
 f.env.API_PUBLIC_CASH_JSON='{bad';assert.equal(f.owner.privateHealth.publicCashProgress().configuration,'invalid_public_configuration');
 assert.equal(f.row("SELECT COUNT(*) AS n FROM sqlite_master WHERE name='api_public_cash_outbox'").n,0);assert.equal(f.calls.length,0);
});
