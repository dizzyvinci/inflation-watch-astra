// Call only INSIDE the existing outer preview gate. Visitor path has no provider/DO.
import {readPrivateNxProjection,byteHash,byteSize} from './api-private-nx-projection.mjs';
import {PUBLIC_NX_PATH,MAX_PUBLIC_NX_BYTES,publicNxStatus,publicNxSubset} from './api-public-nx-contract.mjs';
const HEADERS={'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
const error=(request,status,code)=>new Response(request.method==='HEAD'?null:JSON.stringify({error:code,sourceObservedAt:null}),{status,headers:HEADERS});
export function createPublicNxRoute({now=Date.now,ttlMs=30000}={}){
 if(!Number.isSafeInteger(ttlMs)||ttlMs<0||ttlMs>30000)throw TypeError('bounded_nx_route_cache');const scopes=new WeakMap();
 function scope(bucket){let s=scopes.get(bucket);if(!s){s={current:null,lastGood:null,expires:0,flight:null,failures:0,retryAt:0};scopes.set(bucket,s);}return s;}
 async function load(env,bucket,s){
  // One stalled SDK operation remains singleflight regardless of elapsed time.
  if(s.flight)return s.flight;
  // A cold failure is cached too: absence of lastGood must not amplify R2 reads.
  // This deadline is isolate/operator metadata only; no source clock is renewed.
  if(now()<s.retryAt){if(!s.lastGood)throw Error('nx_storage_cooldown');return{...s.lastGood,mode:'retained_last_good'};}
  if(s.current&&now()<s.expires)return s.current;
  s.flight=(async()=>{let record;
   try{
    const {pointer,projection}=await readPrivateNxProjection(bucket);
    if(s.lastGood){const old=s.lastGood.pointer;if(pointer.generation<old.generation)throw Error('rollback');if(pointer.generation===old.generation&&!Object.keys(pointer).every(k=>pointer[k]===old[k]))throw Error('changed_same_generation');if(pointer.receiptWatermarkAt<old.receiptWatermarkAt)throw Error('clock_regression');}
    const dto=await publicNxSubset(projection),text=JSON.stringify(dto);if(byteSize(text)>MAX_PUBLIC_NX_BYTES)throw Error('subset_bound');
    record={pointer,text,etag:'"'+await byteHash(text)+'"',capturedAt:dto.capturedAt,mode:'accepted_cache'};
    if(publicNxStatus(env)!=='ready')throw Error('disabled');s.lastGood=record;s.failures=0;s.retryAt=0;
   }catch{
    s.failures=Math.min(16,s.failures+1);s.retryAt=now()+Math.min(300000,30000*2**Math.min(s.failures-1,4));
    if(!s.lastGood)throw Error('no_verified_nx_subset');record={...s.lastGood,mode:'retained_last_good'};
   }
   s.current=record;s.expires=now()+ttlMs;return record;
  })().finally(()=>{s.flight=null;});return s.flight;
 }
 return async function publicNxRoute(request,env){
  const url=new URL(request.url);if(url.pathname!==PUBLIC_NX_PATH)return null;
  // Feature authorization is separate from provider grant/key/budget. Off exits
  // before any binding/cache/DO access. Only an existing private artifact is read.
  if(publicNxStatus(env)!=='ready')return error(request,404,'not_found');
  if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers:{...HEADERS,Allow:'GET, HEAD'}});
  if(url.search)return error(request,400,'unsupported_query');let record;
  try{const bucket=env.API_RAW_RECEIPTS;if(!bucket?.get)throw Error('no_private_storage');record=await load(env,bucket,scope(bucket));}
  catch{return publicNxStatus(env)==='ready'?error(request,503,'nx_offers_unavailable'):error(request,404,'not_found');}
  if(publicNxStatus(env)!=='ready')return error(request,404,'not_found');
  const headers={...HEADERS,ETag:record.etag,'X-Astra-NX-Phase':'published_offer_subset','X-Astra-NX-Mode':record.mode,'X-Astra-NX-Captured-At':record.capturedAt};
  if(request.headers.get('If-None-Match')===record.etag)return new Response(null,{status:304,headers});
  return new Response(request.method==='HEAD'?null:record.text,{status:200,headers});
 };
}
