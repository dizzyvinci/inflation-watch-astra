// Actual current constructor/Core/registry/SQLite with fake own storage only.
import {fixture as currentFixture,sha,noIO} from './fixtures/current-dataflow-combined-fixture.mjs';
import {readFileSync} from 'node:fs';
import {ACTIVITY_DEFINITION_SHA,ACTIVITY_PROFILE,ACTIVITY_PROTOCOL} from '../ops/api-overview-activity-public-contract.mjs';
export {sha,noIO};
export const privatePolicy=g=>({schemaVersion:1,enabled:true,approvalRecorded:true,definitionHash:ACTIVITY_DEFINITION_SHA,profile:ACTIVITY_PROFILE,publicationEnabled:false,grantReference:g.grantReference,roundReference:g.probeRound,epoch:'activity-private-v1'});
export const publicPolicy=g=>({schemaVersion:1,enabled:true,approvalRecorded:true,publicationEnabled:true,sourceProfile:ACTIVITY_PROFILE,grantReference:g.grantReference,roundReference:g.probeRound,privateEpoch:'activity-private-v1',publicEpoch:'activity-public-v1'});
export const shared=JSON.stringify({schemaVersion:1,enabled:true,profileVersion:'overview-membership-and-derived-v1'});
export const request=(options={})=>new Request('https://synthetic.invalid/api-overview-window-activity/current.json',{...options,headers:{'X-Astra-Request-Overview-Activity-Protocol':ACTIVITY_PROTOCOL,...options.headers}});
export async function setup(t,{enabled=true,extraItems=0,beforeConstruct=null,actualRuntime=true}={}){
 const runtimeTexts=actualRuntime?JSON.parse(readFileSync(new URL('./fixtures/current-dataflow-runtime27-texts.json',import.meta.url))):undefined;
 const f=await currentFixture(t,{fast:false,stamp:false,extraItems,runtimeTexts,beforeConstruct(o){const grant=JSON.parse(o.env.API_GRANT_JSON);o.env.API_SHARED_OVERVIEW_PROFILE_JSON=shared;if(enabled)o.env.API_OVERVIEW_ACTIVITY_JSON=JSON.stringify(privatePolicy(grant));if(beforeConstruct)beforeConstruct(o);}});
 f.env.API_PUBLIC_OVERVIEW_ACTIVITY_JSON=JSON.stringify(publicPolicy(f.grant));
 const controlled=new WeakSet(),baseTime=f.now[0];
 const delivery=()=>{const d=f.owner.overviewActivityRegistration?.delivery;if(d&&!controlled.has(d)){controlled.add(d);d.mono=()=>f.now[0]-baseTime;d.openedMono=d.mono();}return d;};
 const rawOverview=({factor=1,count=2,median=3.25,items=[...f.names.keys()].slice(0,2),generatedAt='2026-11-06T12:00:00.000Z',actor='PRIVATE_ACTOR_CANARY'}={})=>JSON.stringify({generated_at:Date.parse(generatedAt)/1000,window_hours:24,scanned_hours:23,previous_scanned_hours:22,comparable:true,totals:{actor},items:items.map((item_id,i)=>({item_id,cash:false,sales:count+i,units:7+i,mesos:10.5*factor+i,median_unit_price:i===0?median:null,previous_sales:0,previous_median_unit_price:null,daily:[]})),movers:[],most_sales:[],best_sellers:[],top_turnover:[],most_listed:[],activity:[],maintenance:{actor},top_sellers:[{shop:actor}]});
 function seed(body=rawOverview(),capturedAt='2026-11-06T12:00:01.000Z'){
  const id=f.row('SELECT COALESCE(MAX(id),0)+1 id FROM api_attempts').id,at=Date.parse(capturedAt)-1000,rawSha=sha(body),jobKey='synthetic-overview-'+id,receiptKey=`_private/provider-api/v1/receipts/${String(id).padStart(12,'0')}-overview-${rawSha}.json`,e={kind:'unverified_provider_api_receipt',operation:'overview',httpStatus:200,sourceUrl:'https://maplestory.market/api/market/overview',schemaVerified:false,publicationEligible:false,sourceObservedAt:null,observationTimestampKnown:false,captureTimeKind:'http_response_completed',requestStartedAt:new Date(at).toISOString(),capturedAt,attemptId:id,grantReference:f.grant.grantReference,roundReference:f.grant.probeRound,rawBodyEncoding:'base64',rawBodyBase64:Buffer.from(body).toString('base64'),responseBytes:Buffer.byteLength(body),responseSha256:rawSha,payload:{unused:true}};
  f.objects.set(receiptKey,{body:JSON.stringify(e),etag:'source-'+id});f.exec("INSERT INTO api_jobs(job_key,operation,round_ref,state,available_at,attempt_id,attempts)VALUES(?,'overview',?,'running',?,?,1)",jobKey,f.grant.probeRound,at,id);f.exec('INSERT INTO api_attempts(id,job_key,at,grant_ref)VALUES(?,?,?,?)',id,jobKey,at,f.grant.grantReference);
  const result=f.core.finish({job_key:jobKey,operation:'overview',attempt_id:id,attempts:1},f.core.config(),{kind:'success',receiptKey,capturedAt});if(result.status!=='success')throw Error('actual_overview_finish_required');return{id,jobKey,receiptKey,e};
 }
 async function accept(source){const statuses=[];for(let n=0;n<16;n++){const stored=f.row('SELECT available_at FROM recurring_registry_jobs WHERE receipt_key=?',source.receiptKey);if(stored?.available_at>f.now[0])f.now[0]=stored.available_at;f.owner.recurring.reconcile(8,f.owner.recurring.eventFrame());const result=await f.owner.privateCash.runRegistryAlarm(f.owner.recurring.eventFrame());statuses.push(result.status);if(f.row('SELECT state FROM recurring_registry_jobs WHERE receipt_key=?',source.receiptKey)?.state==='complete'){
   // Simulate the ORIGINAL calculation mux slot too. Never bypass its64-input
   // backpressure or change counters just to make the new continuation pass.
   for(let k=0;k<8;k++){const input=f.row('SELECT state FROM api_index_inputs WHERE receipt_key=?',source.receiptKey);if(!input||!['pending','running'].includes(input.state))break;await f.owner.privateCash.runIndexAlarm();}
   return result;
  }if(result.status==='registry_storage_retry'||result.status==='registry_profile_quarantine')throw Error(JSON.stringify(result));}throw Error(JSON.stringify({kind:'registry_accept_bound',statuses,job:f.row('SELECT state,available_at,lease_until FROM recurring_registry_jobs WHERE receipt_key=?',source.receiptKey),now:f.now[0]}));}
 async function publish(max=24){const statuses=[];for(let n=0;n<max;n++){const d=delivery(),due=d?.nextDue();if(due===null)break;if(due>f.now[0])f.now[0]=due;const r=await d.drainOne(noIO);statuses.push(r.status);if(['activity_action_hold','activity_physical_unknown_hold'].includes(r.status))break;}return statuses;}
 return{f,get d(){return delivery();},rawOverview,seed,accept,publish};
}
export const tick=()=>new Promise(resolve=>setImmediate(resolve));
export function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};}
