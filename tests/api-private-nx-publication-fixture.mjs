// Synthetic-only SQLite/R2 fixture. No secrets, HTTP, native alarms or provider transport.
import {DatabaseSync} from 'node:sqlite';import {createHash} from 'node:crypto';
import {PrivateNxOffersProducer} from '../ops/api-private-nx-offers.mjs';
import {PrivateNxPublisher} from '../ops/api-private-nx-publisher.mjs';
import {NX_POINTER,NX_PREFIX,readPrivateNxProjection} from '../ops/api-private-nx-projection.mjs';
export const START=Date.parse('2026-11-06T00:00:00Z'),HOUR=1793916000;
export const row=(side='buy',at=HOUR,rate=15,count=1)=>({at,side,posters:count,p25:count?rate:null,median:count?rate:null,p75:count?rate:null,low:count?rate:null,high:count?rate:null,steps:count?{[rate]:count}:{}});
const stats=(rate,count)=>({posters:count,median:rate,mode:rate,low:rate,high:rate,steps:[[rate,count]]});
export const summary=()=>({buy:stats(15,2),sell:stats(20,3),window_hours:8,limited:false,last_heard:HOUR+3000});
export function receipt(op='nx-history',attempt=1,value=[row('buy'),row('sell',HOUR,20)],capture='2026-11-05T22:53:51.939Z'){
 const raw=JSON.stringify(value),hash=createHash('sha256').update(raw).digest('hex');const key=`_private/provider-api/v1/receipts/${String(attempt).padStart(12,'0')}-${op}-${hash}.json`;
 return{key,envelope:{kind:'unverified_provider_api_receipt',operation:op,httpStatus:200,sourceUrl:'https://maplestory.market/api/nx-rate'+(op==='nx-history'?'/history?range=7d&step=hour':''),rawBodyEncoding:'base64',schemaVerified:false,publicationEligible:false,sourceObservedAt:null,observationTimestampKnown:false,captureTimeKind:'http_response_completed',requestStartedAt:'2026-11-05T20:00:00.000Z',capturedAt:capture,attemptId:attempt,rawBodyBase64:Buffer.from(raw).toString('base64'),responseBytes:Buffer.byteLength(raw),responseSha256:hash,roundReference:'synthetic-r1',grantReference:'synthetic-grant'}};
}
export function fixture(t,{publication=true,active=true}={}){
 const db=new DatabaseSync(':memory:');t.after(()=>db.close());const now=[START],enabled=[active],events=[],objects=new Map(),reads=[],puts=[];let etag=0,fail=null,sqlFailure=null,recovery=0,getHook=null,putHook=null,pointerContentions=0;
 const sql={exec(q,...a){if(sqlFailure?.(q))throw Error('Synthetic SQL fault');const s=db.prepare(q),r=s.columns().length?s.all(...a):(s.run(...a),[]);return{toArray:()=>r};}};
 const ctx={storage:{sql,transactionSync(fn){db.exec('BEGIN IMMEDIATE');try{const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}}};
 sql.exec('CREATE TABLE api_jobs(job_key TEXT PRIMARY KEY,operation TEXT,state TEXT,receipt_key TEXT)');sql.exec('CREATE TABLE api_attempts(id INTEGER PRIMARY KEY,round_ref TEXT,owner_name TEXT)');sql.exec("INSERT INTO api_attempts VALUES(17,'synthetic-r1','synthetic-owner')");
 const bucket={async get(key){reads.push(key);events.push('get:'+key);if(getHook)await getHook(key);if(fail==='get')throw Error('Synthetic R2 read');const r=objects.get(key);return r?{etag:r.etag,size:Buffer.byteLength(r.body),text:async()=>r.body,json:async()=>JSON.parse(r.body)}:null;},
 async put(key,body,options){puts.push(key);events.push('put:'+key);if(putHook)await putHook(key,body);if(fail==='body'&&key.startsWith(NX_PREFIX)||fail==='pointer'&&key===NX_POINTER)throw Error('Synthetic R2 write');if(key===NX_POINTER&&pointerContentions>0){pointerContentions--;return null;}const old=objects.get(key),c=options?.onlyIf;if(c?.etagDoesNotMatch==='*'&&old||c?.etagMatches&&old?.etag!==c.etagMatches)return null;const v={body,etag:String(++etag)};objects.set(key,v);return v;}};
 let producer=new PrivateNxOffersProducer(ctx,bucket,{enabled:true,now:()=>now[0],isEnabled:()=>enabled[0],privatePublicationEnabled:publication});
 let publisher=publication?new PrivateNxPublisher(ctx,bucket,{enabled:true,now:()=>now[0],isEnabled:()=>enabled[0]}):null;
 const arm=async at=>{events.push('arm');recovery=at;};
 return{db,ctx,sql,bucket,now,enabled,events,objects,reads,puts,get producer(){return producer;},get publisher(){return publisher;},get recovery(){return recovery;},row:(q,...a)=>sql.exec(q,...a).toArray()[0],fail:v=>fail=v,failSql:fn=>sqlFailure=fn,onGet:fn=>getHook=fn,onPut:fn=>putHook=fn,contentions:n=>pointerContentions=n,
  seed(r){objects.set(r.key,{body:JSON.stringify(r.envelope),etag:String(++etag)});sql.exec('INSERT OR IGNORE INTO api_jobs VALUES(?,?,?,?)','synthetic-job-'+r.envelope.attemptId,r.envelope.operation,'complete',r.key);return r;},
  async accept(r=receipt()){this.seed(r);producer.reconcile();return producer.drainOne(arm);},
  publish(){return publisher.drainOne(arm);},
  restart(){producer=new PrivateNxOffersProducer(ctx,bucket,{enabled:true,now:()=>now[0],isEnabled:()=>enabled[0],privatePublicationEnabled:publication});publisher=new PrivateNxPublisher(ctx,bucket,{enabled:true,now:()=>now[0],isEnabled:()=>enabled[0]});},
  pointer(){return objects.has(NX_POINTER)?JSON.parse(objects.get(NX_POINTER).body):null;},read(){return readPrivateNxProjection(bucket);},
  set(key,body){objects.set(key,{body,etag:String(++etag)});}
 };
}
