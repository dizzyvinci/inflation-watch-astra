import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import os from'node:os';import path from'node:path';
import{fixture}from'./fixtures/current-dataflow-basic-fixture.mjs';
import{BASIC_CURRENT_CONTRACT_SHA}from'../ops/api-basic-current-registration.mjs';
import{B}from'../ops/api-basic-current-contract.mjs';
const noIO=async()=>{},tick=()=>new Promise(setImmediate);
const config={schemaVersion:1,enabled:true,approvalRecorded:true,profile:'basic_aggregate_v1',contractSha256:BASIC_CURRENT_CONTRACT_SHA,grantReference:'synthetic-grant',roundReference:'synthetic-r1',epoch:'synthetic-basic-settlement-v1',publicationEnabled:false};
test('one transient final SQL-clear failure after genuine compile must not strand settled Basic owner',async t=>{
 const temp=fs.mkdtempSync(path.join(path.resolve(os.tmpdir()),'astra-basic-settlement-counter-'));const proof=path.join(temp,'ACTUAL_FINAL_CLEAR_RESULT.json');t.after(()=>{assert.equal(path.dirname(temp),path.resolve(os.tmpdir()));assert.match(path.basename(temp),/^astra-basic-settlement-counter-/);if(fs.existsSync(proof))fs.unlinkSync(proof);fs.rmdirSync(temp)});
 const f=await fixture(t,{fast:false,stamp:false,basicRegistrationConfig:config}),o=f.owner.basicCurrentRegistration?.owner;
 assert(o,'actual_constructor_basic_owner_required');assert.equal(f.owner.basicCurrentRegistration.delegate.registry,f.registry);
 const receipt=f.seed();f.owner.recurring.reconcile(8,f.owner.recurring.eventFrame());assert.equal((await f.registry.drainOne(noIO)).status,'registry_capture_accepted');
 const original=o.exec.bind(o);let injected=0;
 o.exec=(sql,...args)=>{if(!injected&&sql.startsWith('UPDATE basic_control SET action_token=NULL')){injected++;throw Error('source_one_transient_final_clear_failure')}return original(sql,...args)};
 await assert.rejects(o.drainOne(noIO),/source_one_transient_final_clear_failure/);await tick();
 assert.equal(injected,1);assert.equal(o.pool.task,null);assert.notEqual(o.pool.unknown,true);
 const originalToken=o.control().action_token,phase=o.job()?.phase;assert.equal(typeof originalToken,'string');
 const hot=await o.drainOne(noIO);await f.restart();const cold=f.owner.basicCurrentRegistration?.owner;assert(cold,'actual_cold_constructor_basic_owner_required');
 f.now[0]+=B.leaseMs+1;const beforeReads=f.reads.length,beforePuts=f.puts.length,statuses=[];for(let i=0;i<3;i++){statuses.push((await cold.drainOne(noIO)).status);f.now[0]+=B.leaseMs+1}
 const result={schemaVersion:1,scope:'actual canonical170 constructor/Core.finish/registry/Basic action with one transient SQL adapter exception; fake bucket only',injectedFinalClearErrors:injected,settledRamTask:o.pool.task===null,physicalUnknown:o.pool.unknown===true,phaseAfterCompile:phase,survivingToken:originalToken!==null,coldTokenSame:cold.control().action_token===originalToken,hotStatus:hot.status,coldStatuses:statuses,afterKnownLeaseExpiry:true,extraReads:f.reads.length-beforeReads,extraPuts:f.puts.length-beforePuts,originalRawReads:f.reads.filter(k=>k===receipt.receiptKey).length,providerRequests:f.provider.length,actualNativeNetworkOperations:0,desired:'known physical settlement remains recoverable after transient durable-clear failure; unknown tokens remain held'};
 fs.writeFileSync(proof,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
 assert.notEqual(statuses[0],'basic_physical_or_unknown_hold','positive physical settlement must not become a permanent cold hold');
});
