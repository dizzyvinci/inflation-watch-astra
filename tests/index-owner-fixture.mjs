import fs from 'node:fs';import {createHash} from 'node:crypto';
import {fixture as base,grant as oldGrant,sources} from './api-private-item-fixture.mjs';
import * as api from '../ops/api-index-calculations.mjs';
import {ApiIndexOwnerBridge,INDEX_POINTER} from '../ops/api-index-owner-bridge.mjs';
import {createIdentityIndex,createPriceSnapshot} from '../ops/api-price-item-dto.mjs';
export const sha=v=>createHash('sha256').update(v).digest('hex');
export const spec=JSON.parse(fs.readFileSync(new URL('../ops/api-index-definition-data-v1.json',import.meta.url),'utf8'));
export function prices({factor=1,omit=null,count=5}={}){return JSON.stringify([...spec.goods,...spec.cash].filter(r=>r.itemId!==omit).map(r=>({item_id:r.itemId,sold:{sales:count,units:count*10,day_sales:0,day_units:0,avg_unit_price:999999,median_unit_price:('APIlinkPrice'in r?Number(r.APIlinkPrice):10000)*factor},seen:null,reference:null})));}
export function overview({days=['2026-10-30','2026-10-31','2026-11-01','2026-11-02','2026-11-03','2026-11-04','2026-11-05'],factor=1,generatedAt='2026-11-06T11:59:00.000Z',omit=null}={}){
 return JSON.stringify({generated_at:Date.parse(generatedAt)/1000,window_hours:72,scanned_hours:72,previous_scanned_hours:72,comparable:true,totals:{},items:[...spec.goods,...spec.cash].filter(r=>r.itemId!==omit).map(r=>({item_id:r.itemId,cash:false,sales:50,units:500,mesos:100000,median_unit_price:100,previous_sales:50,previous_median_unit_price:100,daily:days.map(day=>({day:Date.parse(day+'T00:00:00Z')/1000,sales:5,units:500,median_unit_price:('APIlinkPrice'in r?Number(r.APIlinkPrice):10000)*factor}))})),movers:[],most_sales:[],best_sellers:[],top_turnover:[],most_listed:[],activity:[],maintenance:[],top_sellers:[]});
}
export async function fixture(t,{on=true}={}){
 const f=await base(t),definition=await api.createApiIndexDefinition(spec),identities=await createIdentityIndex(sources());
 f.now[0]=Date.parse('2026-11-06T12:10:00.000Z');
 const grant={...oldGrant,allowedOperations:['prices','overview']};f.env.API_GRANT_JSON=JSON.stringify(grant);
 const cfg={schemaVersion:1,enabled:true,methodVersion:1,publicationEnabled:false,definitionHash:definition.definitionHash};f.env.API_PRIVATE_INDEX_JSON=JSON.stringify(on?cfg:{enabled:false});
 let snapshotCalls=0;
 const registry={async createCalculationSnapshot(raw,{rawBodySha256,...context}){snapshotCalls++;return createPriceSnapshot(raw,{expectedSha256:rawBodySha256,context,identities});}};
 const open=()=>new ApiIndexOwnerBridge(f.ctx,f.env,f.core,{definition,api,registry});let bridge=open();
 function seed(operation='prices',body=prices(),{capturedAt='2026-11-06T12:00:00.000Z',requestAt=Date.parse(capturedAt)-1000}={}){
  const id=f.row('SELECT COALESCE(MAX(id),0)+1 AS id FROM api_attempts').id,jobKey='synthetic-'+operation+'-'+id,rawHash=sha(body),receiptKey=`_private/provider-api/v1/receipts/${String(id).padStart(12,'0')}-${operation}-${rawHash}.json`;
  const e={kind:'unverified_provider_api_receipt',operation,httpStatus:200,sourceUrl:operation==='prices'?'https://maplestory.market/api/prices':'https://maplestory.market/api/market/overview',schemaVerified:false,publicationEligible:false,sourceObservedAt:null,observationTimestampKnown:false,captureTimeKind:'http_response_completed',requestStartedAt:new Date(requestAt).toISOString(),capturedAt,attemptId:id,grantReference:grant.grantReference,roundReference:grant.probeRound,rawBodyEncoding:'base64',rawBodyBase64:Buffer.from(body).toString('base64'),responseBytes:Buffer.byteLength(body),responseSha256:rawHash};
  f.objects.set(receiptKey,{body:JSON.stringify(e),etag:'source-'+id});
  f.exec("INSERT INTO api_jobs(job_key,operation,round_ref,state,available_at,attempt_id,attempts)VALUES(?,?,?,'running',?,?,1)",jobKey,operation,grant.probeRound,requestAt,id);
  f.exec('INSERT INTO api_attempts(id,job_key,at,grant_ref)VALUES(?,?,?,?)',id,jobKey,requestAt,grant.grantReference);
  const done=f.core.finish({job_key:jobKey,operation,attempt_id:id,attempts:1},f.core.config(),{kind:'success',receiptKey,capturedAt});
  if(done.status!=='success'||f.row('SELECT attempt_id FROM api_jobs WHERE job_key=?',jobKey).attempt_id!==null)throw Error('real_finish_required');
  return {id,receiptKey,jobKey,e,raw:new TextEncoder().encode(body),job:{job_key:jobKey,operation,receipt_key:receiptKey}};
 }
 async function drain(max=20){for(let i=0;i<max;i++){const r=await bridge.drainOne(async until=>{if(until<=f.now[0])throw Error('recovery');});if(r.status==='index_model_published_private'||r.status==='index_pointer_ack_recovered')return r;if(['index_contract_review','index_storage_retry','index_paused','idle'].includes(r.status))return r;}throw Error('bounded completion');}
 return {...f,get core(){return f.core;},get ctx(){return f.ctx;},definition,api,registry,cfg,grant,seed,drain,get bridge(){return bridge;},reopen(){f.restart();bridge=open();},pointer:()=>f.objects.has(INDEX_POINTER)?JSON.parse(f.objects.get(INDEX_POINTER).body):null,model(){const p=this.pointer();return p?JSON.parse(f.objects.get(p.publicKey).body):null;},snapshotCalls:()=>snapshotCalls};
}
