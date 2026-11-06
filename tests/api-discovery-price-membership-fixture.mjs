import assert from 'node:assert/strict';
import {fixture,receipt,sources,sha,grant} from './api-private-item-fixture.mjs';


import {RecurringItemRegistry} from '../ops/item-recurring-registry.mjs';
import {OwnerItemGenerationRefs} from '../ops/api-item-generation-refs.mjs';
import {ItemDiscoveryProducer} from '../ops/api-item-discovery-producer.mjs';
const beforeIO=async()=>{};
const rawPrices=ids=>JSON.stringify(ids.map(item_id=>({item_id,sold:null,seen:null,reference:null})));
function rawMembership(operation,ids){return JSON.stringify(operation==='catalogue'?ids.map(item_id=>({item_id,listings:1,sold_out:0,total_units:1,min_unit_price:10})):{generated_at:1793912000,window_hours:24,scanned_hours:24,previous_scanned_hours:24,comparable:true,totals:{},items:ids.map(item_id=>({item_id,cash:false,sales:1,units:2,mesos:20,median_unit_price:10,previous_sales:0,previous_median_unit_price:null,daily:[]})),movers:[],most_sales:[],best_sellers:[],top_turnover:[],most_listed:[],activity:[],maintenance:[],top_sellers:[]});}
function seed(f,id,op,ids,{round=grant.probeRound,granted=grant.grantReference,result='success'}={}){
 const r=receipt(id,op==='prices'?rawPrices(ids):rawMembership(op,ids),{operation:op,sourceUrl:'https://maplestory.market'+({prices:'/api/prices',catalogue:'/api/items',overview:'/api/market/overview'})[op],roundReference:round,grantReference:granted});
 r.key=r.key.replace('-prices-',`-${op}-`);const job=`${round}:r:001:synthetic-schedule:${r.at}:${op}`;
 f.objects.set(r.key,{body:JSON.stringify(r.value),etag:sha(r.key)});
 f.exec("INSERT INTO api_jobs(job_key,operation,round_ref,state,available_at,attempt_id,attempts)VALUES(?,?,?,'running',?,?,1)",job,op,round,r.at,id);
 f.exec('INSERT INTO api_attempts(id,job_key,at,grant_ref)VALUES(?,?,?,?)',id,job,r.at,granted);
 assert.equal(f.core.finish({...f.row('SELECT * FROM api_jobs WHERE job_key=?',job)},f.core.config(),{kind:'success',receiptKey:r.key,capturedAt:r.value.capturedAt}).status,'success');
 if(result!=='success')f.exec('UPDATE api_attempts SET result=? WHERE id=?',result,id);
 assert.equal(f.row('SELECT attempt_id FROM api_jobs WHERE job_key=?',job).attempt_id,null);return{...r,job};
}
const staticInputs=()=>({identitySources:sources(),art:{raw:new TextEncoder().encode('{}'),expectedSha256:sha('{}')},bindings:{raw:new TextEncoder().encode('[]'),expectedSha256:sha('[]')}});
async function drainMembership(d){for(let i=0;i<100;i++){const pending=d.row("SELECT COUNT(*)n FROM discovery_jobs WHERE state IN ('pending','running')").n;if(!pending)return;const r=await d.drainOne(beforeIO);assert(['metadata_ready','membership_accepted'].includes(r.status),JSON.stringify(r));}assert.fail('bounded synthetic membership drain');}
async function registry(f){const r=new RecurringItemRegistry(f.ctx,f.core,{enabled:true,loaderFactory:()=>({load:async()=>({status:'ready',sources:sources()})})});assert.equal((await r.drainOne(beforeIO)).status,'registry_metadata_ready');return r;}
async function drainRegistry(r){for(let i=0;i<100;i++){r.reconcile(8);const v=await r.drainOne(beforeIO);if(v.status==='idle')return;assert.equal(v.status,'registry_capture_accepted',JSON.stringify(v));}assert.fail('bounded registry drain');}


export {seed,staticInputs,rawPrices,registry,drainRegistry,beforeIO,fixture,grant,sources,sha};
