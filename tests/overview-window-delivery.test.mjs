import test from 'node:test';import assert from 'node:assert/strict';
import {writeFileSync,mkdtempSync,realpathSync,unlinkSync,rmdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,basename} from 'node:path';
import {setup,request,sha,noIO} from './overview-window-fixture.mjs';
import {createPublicOverviewActivityRoute} from '../ops/api-overview-activity-public-route.mjs';
import {verifyActivityDefinition,parseActivityResponse,ACTIVITY_DEFINITION_SHA} from '../ops/api-overview-activity-public-contract.mjs';

test('actual current factory→one owned overview→SQL→immutable readback→typed own-cache HTTP',async t=>{
 await verifyActivityDefinition();const g=await setup(t),s=g.seed();assert(g.d);const result=await g.accept(s);assert.equal(result.overviewActivity,'activity_summary_admitted');assert.equal(g.f.reads.filter(k=>k===s.receiptKey).length,1);
 const phases=await g.publish();assert(phases.includes('activity_current_readback_confirmed'),JSON.stringify(phases));assert.equal(g.d.current().phase,'committed');assert.equal(g.f.reads.filter(k=>k===s.receiptKey).length,1);
 const route=createPublicOverviewActivityRoute(),response=await route(request(),g.f.env);assert.equal(response.status,200);const raw=new Uint8Array(await response.arrayBuffer()),value=await parseActivityResponse(raw,{expectedEpoch:'activity-public-v1',expectedSha256:response.headers.get('X-Astra-Overview-Activity-Body-Sha256'),status:200});assert.equal(value.definitionHash,ACTIVITY_DEFINITION_SHA);assert.equal(value.reference.counterSums.sourceRecordedSalesCounterSumLexeme,'5');assert.equal(value.reference.counterSums.sourceReportedUnitCounterSumLexeme,'15');assert.equal(value.reference.counterSums.medianCountProxySumLexeme,'6.5');assert.equal(value.reference.coverage.medianCountProxyMissingPriceRows,1);assert.equal(value.reference.source.capturedAt,s.e.capturedAt);assert.equal(value.upstreamLatestInspected,false);assert.equal(value.reference.window.exactStartAt,null);assert.equal(new TextDecoder().decode(raw).includes('PRIVATE_ACTOR_CANARY'),false);assert.equal(g.f.provider.length,0);
 const head=await route(request({method:'HEAD'}),g.f.env);assert.equal(head.status,200);assert.equal(await head.text(),'');const notModified=await route(request({headers:{'If-None-Match':response.headers.get('etag')}}),g.f.env);assert.equal(notModified.status,304);assert.equal(await notModified.text(),'');
 if(process.env.ACTIVITY_RECORD_SYNTHETIC_WIRE==='1'){
  const profile=await route(new Request('https://synthetic.invalid/api-overview-window-activity/profile.json'),g.f.env);
  const wire={schemaVersion:1,kind:'synthetic_actual_owner_overview_activity_route_wire',backendAccepted:false,actualNetworkOrProviderCalls:0,sourceDeclaration:{scope:'Actual current constructor/Core.finish/registry SQL/shared one-parse summary/immutable write+readback/fake own-cache route; synthetic source only',capturedAt:s.e.capturedAt,rawBodySha256:s.e.responseSha256,receivedItemRows:2,sourceActorsPublished:false,sinceLaunchOrDaily:false},profile:{status:profile.status,headers:Object.fromEntries(profile.headers),body:await profile.text()},current:{status:response.status,headers:Object.fromEntries(response.headers),body:new TextDecoder().decode(raw)},head:{status:head.status,headers:Object.fromEntries(head.headers),body:''},notModified:{status:notModified.status,headers:Object.fromEntries(notModified.headers),body:''}};
  const tempRoot=realpathSync(tmpdir()),owned=mkdtempSync(join(tempRoot,'astra-overview-window-wire-'));assert.equal(dirname(owned),tempRoot);assert.match(basename(owned),/^astra-overview-window-wire-/);
  const output=join(owned,'SYNTHETIC_ROUTE_WIRE.json');let written=false;try{writeFileSync(output,JSON.stringify(wire,null,2)+'\n',{flag:'wx'});written=true;}finally{if(written)unlinkSync(output);rmdirSync(owned);}
 }
});
