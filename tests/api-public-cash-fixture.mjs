// Synthetic fixtures only: no API receipt/key/account is read.
import {DatabaseSync} from 'node:sqlite';import {registerHooks} from 'node:module';
import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import path from 'node:path';
import {createHash} from 'node:crypto';import bindings from '../ops/api-cash-bindings-v1.json' with {type:'json'};
const hooks=registerHooks({resolve(s,c,n){return s==='cloudflare:workers'?{url:'data:text/javascript,export class DurableObject{constructor(ctx,env){this.ctx=ctx;this.env=env}}',shortCircuit:true}:n(s,c);}});
let ApiGrantCollector;try{({ApiGrantCollector}=await import('../ops/api-grant-collector.mjs'));}finally{hooks.deregister();}
export const START=Date.parse('2026-11-05T12:00:00Z');
export const PRIVATE_FLAG={schemaVersion:1,enabled:true,methodVersion:1,publicationEnabled:false};
export const PUBLIC_FLAG={schemaVersion:1,enabled:true,methodVersion:1,publicationEnabled:true};
export const PUBLIC_POINTER='_private/provider-api/v1/public-cash-pointer.json';
export function rawBody(scale=10){return JSON.stringify(bindings.targets.map(t=>({item_id:t.itemId,
 sold:{sales:5,units:1000,avg_unit_price:t.fixedNxCost*90,median_unit_price:t.fixedNxCost*scale,day_sales:1,day_units:100},
 seen:null,reference:{unit_price:t.fixedNxCost*99,basis:'listed',samples:5,scope:'item'}})));}
export function rawReceipt(attempt=1,scale=10){const body=rawBody(scale),sha=createHash('sha256').update(body).digest('hex');
 return{key:`_private/provider-api/v1/receipts/${String(attempt).padStart(12,'0')}-prices-${sha}.json`,body:JSON.stringify({
 kind:'unverified_provider_api_receipt',operation:'prices',httpStatus:200,sourceUrl:'https://maplestory.market/api/prices',schemaVerified:false,
 publicationEligible:false,sourceObservedAt:null,observationTimestampKnown:false,captureTimeKind:'http_response_completed',
 requestStartedAt:new Date(START+attempt*1000).toISOString(),capturedAt:new Date(START+attempt*1000+50).toISOString(),attemptId:attempt,
 rawBodyEncoding:'base64',rawBodyBase64:Buffer.from(body).toString('base64'),responseBytes:Buffer.byteLength(body),responseSha256:sha,payload:{}})};}
export async function fixture(t,{publicFlag=PUBLIC_FLAG,privateFlag=PRIVATE_FLAG,nxFlag={enabled:false},grantOverride=null,schedule={enabled:false}}={}){
 const directory=mkdtempSync(path.join(tmpdir(),'astra-public29-')),file=path.join(directory,'db.sqlite');
 let db,owner,storage,etag=0,failure=null;const now=[START+10000],objects=new Map(),reads=[],puts=[],calls=[];
 const bucket={async get(key){reads.push(key);if(failure==='get_public'&&key===PUBLIC_POINTER)throw new Error('Synthetic storage');
   const r=objects.get(key);return r?{etag:r.etag,size:Buffer.byteLength(r.body),text:async()=>r.body,json:async()=>JSON.parse(r.body)}:null;},
  async put(key,body,options){puts.push(key);if(failure==='public_body'&&key.startsWith('derived-cash-items/')||failure==='public_pointer'&&key===PUBLIC_POINTER||failure==='private_pointer'&&key==='_private/provider-api/v1/cash-projection.json')throw new Error('Synthetic storage');
   const old=objects.get(key),c=options?.onlyIf;if(c?.etagDoesNotMatch==='*'&&old||c?.etagMatches&&old?.etag!==c.etagMatches)return null;
   const r={body,etag:String(++etag)};objects.set(key,r);return r;}};
 const grant={enabled:true,approvalRecorded:true,exclusiveAccountOwnerConfirmed:true,grantReference:'synthetic-grant',grantedPerMinute:30,
   grantedPerDay:null,operatorDailyRequestCap:1000,minimumRequestIntervalSeconds:2.5,higherFrequencyExplicitlyGranted:true,
   allowedOperations:['prices'],probeRound:'synthetic-r1',publicationEnabled:false};
 const env={API_GRANT_JSON:JSON.stringify(grantOverride??grant),API_SCHEDULE_JSON:JSON.stringify(schedule),API_PRIVATE_CASH_JSON:JSON.stringify(privateFlag),API_PRIVATE_NX_JSON:JSON.stringify(nxFlag),
   API_RAW_RECEIPTS:bucket,SNAPSHOTS:bucket,MAPLESTORY_MARKET_APPROVED_API_KEY:'SYNTHETIC-ONLY'};
 if(publicFlag!==null)env.API_PUBLIC_CASH_JSON=JSON.stringify(publicFlag);
 async function open(){
  db=new DatabaseSync(file);db.exec('CREATE TABLE IF NOT EXISTS test_alarm(id INTEGER PRIMARY KEY,at INTEGER)');db.exec('INSERT OR IGNORE INTO test_alarm VALUES(1,NULL)');
  storage={sql:{exec(sql,...args){const s=db.prepare(sql),rows=s.columns().length?s.all(...args):(s.run(...args),[]);return{toArray:()=>rows};}},
   transactionSync(fn){db.exec('BEGIN IMMEDIATE');try{const v=fn();db.exec('COMMIT');return v;}catch(e){db.exec('ROLLBACK');throw e;}},
   async getAlarm(){return db.prepare('SELECT at FROM test_alarm WHERE id=1').get().at;},
   async setAlarm(at){db.prepare('UPDATE test_alarm SET at=? WHERE id=1').run(at);},async deleteAlarm(){db.prepare('UPDATE test_alarm SET at=NULL WHERE id=1').run();}};
  owner=new ApiGrantCollector({storage,blockConcurrencyWhile:fn=>fn()},env);owner.core.now=()=>now[0];
  owner.core.jitter=()=>0;owner.core.fetcher=async url=>{calls.push(url);return new Response(rawBody(),{headers:{'content-type':'application/json'}});};await owner.ready;
 }
 await open();t.after(()=>{db.close();rmSync(directory,{recursive:true,force:true});});
 return{env,bucket,now,objects,reads,puts,calls,get owner(){return owner;},get core(){return owner.core;},get publisher(){return owner.privateCash.publisher;},
  row:(sql,...args)=>db.prepare(sql).get(...args),alarm:()=>storage.getAlarm(),fail(v){failure=v;},
  async restart(){db.close();await open();},async fire(){const at=await storage.getAlarm();if(at===null)throw new Error('No local alarm');
    now[0]=Math.max(now[0],at);await storage.deleteAlarm();return owner.alarm();},
  seed(r){objects.set(r.key,{body:r.body,etag:String(++etag)});db.prepare('INSERT INTO api_jobs(job_key,operation,round_ref,state,available_at,receipt_key) VALUES(?,?,?,?,?,?)').run('stored:'+r.key,'prices','synthetic-r1','complete',START,r.key);},
  publicPointer:()=>objects.has(PUBLIC_POINTER)?JSON.parse(objects.get(PUBLIC_POINTER).body):null,
  async complete(attempt=1,scale=10){this.seed(rawReceipt(attempt,scale));await owner.kickScheduledCollection();
    for(let n=0;n<10;n++){if(this.publicPointer()?.sourceAttemptId===attempt)return this.publicPointer();if(await storage.getAlarm()===null)break;await this.fire();}throw new Error('Local publication did not complete');}};
}
