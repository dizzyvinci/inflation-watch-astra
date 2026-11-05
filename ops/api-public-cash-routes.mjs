// Ungated own-site handler. Call ONLY inside the existing single outer preview gate.
import {PUBLIC_PATH,PUBLIC_POINTER,publicCashStatus,validatePublicPointer,validatePublicBody,
 boundedText,bytes,hash,check,samePointer} from './api-public-cash-contract.mjs';
const HEADERS={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const error=(request,status,code)=>new Response(request.method==='HEAD'?null:JSON.stringify({error:code,sourceObservedAt:null}),{status,headers:HEADERS});
export function createPublicCashRoute({now=Date.now,ttlMs=30000}={}){
  check(Number.isSafeInteger(ttlMs)&&ttlMs>=0&&ttlMs<=30000,'Bounded cache lifetime required');const scopes=new WeakMap();
  function scopeFor(bucket){let s=scopes.get(bucket);if(!s){s={current:null,lastGood:null,expires:0,flight:null};scopes.set(bucket,s);}return s;}
  async function load(env,bucket,s){
    if(s.current&&now()<s.expires)return s.current;
    if(s.flight)return s.flight;
    s.flight=(async()=>{
      let record;
      try{
        const object=await bucket.get(PUBLIC_POINTER),pointer=validatePublicPointer(JSON.parse(await boundedText(object,5000)));
        if(s.lastGood){check(pointer.sourceAttemptId>=s.lastGood.pointer.sourceAttemptId,'Public pointer rollback');
          if(pointer.sourceAttemptId===s.lastGood.pointer.sourceAttemptId)check(samePointer(pointer,s.lastGood.pointer),'Changed same-attempt descriptor');}
        if(s.lastGood?.pointer.subsetSha256===pointer.subsetSha256){
          // Equal bytes permit reusing parsed evidence, never new clocks or
          // lineage/coverage metadata. Only the internal monotonic ordinal may
          // advance independently of this exact already-validated public body.
          const {sourceAttemptId:_newAttempt,...binding}=pointer;
          const {sourceAttemptId:_oldAttempt,...previousBinding}=s.lastGood.pointer;
          check(samePointer(binding,previousBinding),'Cached subset context mismatch');
          record={...s.lastGood,pointer,mode:'accepted_cache'};
        }
        else{
          const text=await boundedText(await bucket.get(pointer.dataKey));
          check(bytes(text)===pointer.subsetBytes&&await hash(text)===pointer.subsetSha256,'Subset byte integrity mismatch');
          const dto=await validatePublicBody(JSON.parse(text));
          check(dto.subsetHash===pointer.subsetHash&&dto.privateProjectionHash===pointer.privateProjectionHash&&dto.capturedAt===pointer.capturedAt&&dto.requestStartedAt===pointer.requestStartedAt&&dto.coverage.available===pointer.availableItems,'Subset descriptor mismatch');
          record={text,pointer,mode:'accepted_cache'};
        }
        check(publicCashStatus(env)==='ready','Publication disabled during read');
        s.lastGood=record;
      }catch{if(!s.lastGood)throw new Error('No verified subset');record={...s.lastGood,mode:'retained_last_good'};}
      s.current=record;s.expires=now()+ttlMs;return record;
    })().finally(()=>{s.flight=null;});return s.flight;
  }
  return async function publicCashRoute(request,env){
    const url=new URL(request.url);if(url.pathname!==PUBLIC_PATH)return null;
    // Off checks precede any R2 binding/cache access; no APIkey/grant is read.
    if(publicCashStatus(env)!=='ready')return error(request,404,'not_found');
    if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers:{...HEADERS,Allow:'GET, HEAD'}});
    if(url.search)return error(request,400,'unsupported_query');
    let record;
    try{const bucket=env.SNAPSHOTS;check(bucket?.get,'No cached subset binding');record=await load(env,bucket,scopeFor(bucket));}
    catch{return publicCashStatus(env)==='ready'?error(request,503,'cash_reference_unavailable'):error(request,404,'not_found');}
    if(publicCashStatus(env)!=='ready')return error(request,404,'not_found');
    const headers={...HEADERS,ETag:`"${record.pointer.subsetSha256}"`,
      'X-Astra-Cash-Phase':'published_subset','X-Astra-Cash-Mode':record.mode,
      'X-Astra-Cash-Captured-At':record.pointer.capturedAt};
    if(request.headers.get('If-None-Match')===headers.ETag)return new Response(null,{status:304,headers});
    return new Response(request.method==='HEAD'?null:record.text,{status:200,headers});
  };
}
