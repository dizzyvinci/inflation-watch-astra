import {basicSqlHealthArtifact} from './fixtures/basic-sql-health-artifacts.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {fixture} from './fixtures/current-dataflow-combined-fixture.mjs';
import {privateBasicCurrentHealth as health} from '../ops/api-basic-current-health.mjs';
import {BASIC_CURRENT_CONTRACT_SHA} from '../ops/api-basic-current-registration.mjs';
const texts=JSON.parse(readFileSync(new URL('./fixtures/current-dataflow-runtime27-texts.json',import.meta.url))),g=JSON.parse(texts.API_GRANT_JSON);
const profile={schemaVersion:1,enabled:true,approvalRecorded:true,profile:'basic_aggregate_v1',contractSha256:BASIC_CURRENT_CONTRACT_SHA,grantReference:g.grantReference,roundReference:g.probeRound,epoch:'root-basic-health-v1',publicationEnabled:false};
test('Root valid independent Basic commit remains verifiable after genuine registry capacity classification',async t=>{
  const f=await fixture(t,{fast:false,runtimeTexts:texts,basicRegistrationConfig:profile,extraItems:1202});
  // Controlled valid capacity boundary, not a forged job state or producer success.
  f.registry.maxIds=1;
  const original=f.seed();f.registry.reconcile(8);
  const normalized=await f.registry.drainOne(async()=>{});
  assert.equal(normalized.status,'registry_capacity_hold');
  assert.equal(f.row('SELECT state FROM recurring_registry_jobs WHERE receipt_key=?',original.receiptKey).state,'capacity_hold');
  const owner=f.owner.basicCurrentRegistration.owner;
  for(let i=0;i<32&&!f.row("SELECT gid FROM basic_generations WHERE role='current'");i++)await owner.drainOne(async()=>{});
  const current=f.row("SELECT gid,phase FROM basic_generations WHERE role='current'");assert(current);assert.equal(current.phase,'committed');
  const selected=await owner.readItem(f.names.keys().next().value,async()=>{});assert.equal(selected.status,'basic_selected_ready');
  const d=await health(f.core,f.env,{delegate:f.owner.privateHealth.basicCurrentDelegate,checkedAt:new Date(f.now[0]).toISOString()});
  writeFileSync(basicSqlHealthArtifact('ROOT_CAPACITY_CLASSIFICATION_EVIDENCE.json'),JSON.stringify({syntheticOnly:true,capacityBoundary:1,sourceItems:f.names.size,registryResult:normalized.status,basicPhase:current.phase,selectedRead:selected.status,healthStatus:d.status,pinsPresent:d.verificationPins!==null,providerRequests:f.provider.length,qualification:'Actual normalization capacity exception and independent Basic commit/readback; only allowed capacity bound is lowered in this fixture. No production defaults or SQL job states changed.'},null,2)+'\n');
  assert.equal(d.status,'committed');
  assert.equal(d.verificationPins.source.capturedAt,original.e.capturedAt);
  assert.equal(d.sourceBindings[0].normalRegistryState,'capacity_hold');
  assert.equal(f.provider.length,0);
});
