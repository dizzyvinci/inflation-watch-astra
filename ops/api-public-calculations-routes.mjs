// Call only inside the outer preview gate. No provider, key or owner/DO access.
import {INDEX_POINTER,MAX_PUBLIC_BYTES,validateIndexPointer} from './api-index-publication-contract.mjs';
import {loadApiIndexDefinition,EXPECTED_DEFINITION_HASH} from './api-index-definition.mjs';
import {definitionData} from './api-index-calculations.mjs';
import {parseApiIndexSnapshot,parsePublicJson} from './api-index-public-contract.mjs';
import {createSharedReadWait,cachedBodyStream} from './bounded-read-flight.mjs';
const PATH='/api-market-calculations.json',enc=new TextEncoder();
const HEADERS={'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store, no-transform','CDN-Cache-Control':'no-store','Cloudflare-CDN-Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow, noarchive'};
const sha=async b=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',b))].map(n=>n.toString(16).padStart(2,'0')).join('');
const integer=(v,a,b)=>Number.isSafeInteger(v)&&v>=a&&v<=b;
const need=v=>{if(!v)throw Error('calculations_read_contract');};
export function publicCalculationsStatus(env){try{const v=JSON.parse(env.API_PUBLIC_MARKET_CALCULATIONS_JSON??'{"enabled":false}');if(v&&Object.keys(v).join(',')==='enabled'&&v.enabled===false)return'disabled';return v&&Object.keys(v).sort().join(',')==='definitionHash,enabled,methodVersion,publicationEnabled,schemaVersion'&&v.schemaVersion===1&&v.methodVersion===1&&v.enabled===true&&v.publicationEnabled===true&&v.definitionHash===EXPECTED_DEFINITION_HASH?'ready':'invalid';}catch{return'invalid';}}
const error=(r,status,code,extra={})=>new Response(r.method==='HEAD'?null:JSON.stringify({error:code}),{status,headers:{...HEADERS,...extra}});
async function boundedText(object,max){need(object&&integer(object.size,1,max));let b;
 if(object.body?.getReader){const reader=object.body.getReader(),chunks=[];let n=0;try{for(;;){const p=await reader.read();if(p.done)break;need(p.value instanceof Uint8Array);n+=p.value.byteLength;need(n<=max);chunks.push(p.value);}}catch(e){try{await reader.cancel();}catch{}throw e;}finally{reader.releaseLock();}need(n===object.size);b=new Uint8Array(n);let at=0;for(const p of chunks){b.set(p,at);at+=p.byteLength;}}
 else{const text=await object.text();need(typeof text==='string');b=enc.encode(text);need(b.byteLength===object.size&&b.byteLength<=max);}
 return{bytes:b,text:new TextDecoder('utf-8',{fatal:true}).decode(b)};
}
export function createPublicCalculationsRoute({now=Date.now,ttlMs=30000,waitMs=2500,maxRequests=128}={}){
 if(!integer(ttlMs,0,30000)||!integer(waitMs,1,10000)||!integer(maxRequests,1,128))throw TypeError('bounded_calculations_reader');
 const scopes=new WeakMap(),wait=createSharedReadWait(waitMs);
 function scope(bucket){let s=scopes.get(bucket);if(!s){s={flight:null,current:null,lastGood:null,expires:0,waiters:0,retryAt:0,failures:0};scopes.set(bucket,s);}return s;}
 async function read(bucket,s,env){
  const po=await bucket.get(INDEX_POINTER);need(publicCalculationsStatus(env)==='ready');const rawPointer=await boundedText(po,8192);need(publicCalculationsStatus(env)==='ready');const pointer=validateIndexPointer(parsePublicJson(rawPointer.text),{definitionHash:EXPECTED_DEFINITION_HASH});
  if(s.lastGood){const p=s.lastGood.pointer;need(pointer.publicationOrdinal>=p.publicationOrdinal);if(pointer.publicationOrdinal===p.publicationOrdinal)need(JSON.stringify(pointer)===JSON.stringify(p));for(const k of ['pricesCapturedAt','overviewCapturedAt'])if(p[k]!==null)need(pointer[k]!==null&&Date.parse(pointer[k])>=Date.parse(p[k]));}
  const object=await bucket.get(pointer.publicKey);need(publicCalculationsStatus(env)==='ready');const raw=await boundedText(object,MAX_PUBLIC_BYTES);need(publicCalculationsStatus(env)==='ready');need(raw.bytes.byteLength===pointer.publicBytes&&await sha(raw.bytes)===pointer.publicBodySha256);
  const definition=await loadApiIndexDefinition(),spec=definitionData(definition),model=await parseApiIndexSnapshot(raw.bytes,{expectedDefinitionHash:EXPECTED_DEFINITION_HASH,expectedRows:spec.goods,expectedCashRows:spec.cash});
  need(model.snapshotHash===pointer.snapshotHash&&(model.sources.prices?.capturedAt??null)===pointer.pricesCapturedAt&&(model.sources.overview?.capturedAt??null)===pointer.overviewCapturedAt);
  need(publicCalculationsStatus(env)==='ready');
  return Object.freeze({pointer,body:raw.bytes,etag:'"api-calculations-'+pointer.publicBodySha256+'"',pricesAt:pointer.pricesCapturedAt??'none',overviewAt:pointer.overviewCapturedAt??'none',mode:'accepted_cache'});
 }
 function load(bucket,s,env){if(s.flight)return wait(s.flight);if(now()<s.retryAt){if(s.lastGood)return{...s.lastGood,mode:'retained_last_good'};throw Error('calculations_cooldown');}
  s.flight=(async()=>{try{const record=await read(bucket,s,env);s.lastGood=record;s.current=record;s.failures=0;s.retryAt=0;s.expires=now()+ttlMs;return record;}catch{if(publicCalculationsStatus(env)!=='ready')throw Error('disabled');s.failures=Math.min(16,s.failures+1);s.retryAt=now()+Math.min(300000,30000*2**Math.min(s.failures-1,4));if(!s.lastGood)throw Error('calculations_unavailable');const record={...s.lastGood,mode:'retained_last_good'};s.current=record;s.expires=now()+ttlMs;return record;}})().finally(()=>{s.flight=null;});return wait(s.flight);
 }
 return async function calculationsFetch(request,env){const url=new URL(request.url);if(url.pathname!==PATH)return null;
  if(publicCalculationsStatus(env)!=='ready')return error(request,404,'not_published');
  if(!['GET','HEAD'].includes(request.method))return error(request,405,'method_not_allowed',{Allow:'GET, HEAD'});if(url.search)return error(request,400,'invalid_query');let record;
  try{const bucket=env.API_RAW_RECEIPTS;need(bucket&&typeof bucket.get==='function');const s=scope(bucket);
   if(s.lastGood&&now()<s.retryAt)record={...s.lastGood,mode:'retained_last_good'};
   else if(s.current&&now()<s.expires)record=s.current;
   else if(s.waiters>=maxRequests){if(!s.lastGood)throw Error('admission');record={...s.lastGood,mode:'retained_last_good'};}
   else{s.waiters++;try{record=await load(bucket,s,env);}catch(e){if(s.lastGood&&publicCalculationsStatus(env)==='ready')record={...s.lastGood,mode:'retained_last_good'};else throw e;}finally{s.waiters--;}}
  }catch{return publicCalculationsStatus(env)==='ready'?error(request,503,'calculations_unavailable'):error(request,404,'not_published');}
  if(publicCalculationsStatus(env)!=='ready')return error(request,404,'not_published');
  const headers={...HEADERS,ETag:record.etag,'X-Astra-Calculations-Mode':record.mode,'X-Astra-Calculations-Prices-Captured-At':record.pricesAt,'X-Astra-Calculations-Overview-Captured-At':record.overviewAt,'X-Astra-Calculations-Definition-Hash':EXPECTED_DEFINITION_HASH};
  if(request.headers.get('If-None-Match')===record.etag)return new Response(null,{status:304,headers});
  return new Response(request.method==='HEAD'?null:cachedBodyStream(record.body),{status:200,headers});
 };
}
export function calculationsAvailability(asset,env,request){
 if(request.method!=='GET'||asset.status!==200||!/^text\/html\b/i.test(asset.headers.get('Content-Type')??'')||typeof globalThis.HTMLRewriter!=='function')return asset;
 const on=publicCalculationsStatus(env)==='ready';
 const result=new HTMLRewriter().on('body',{element(e){if(on)e.setAttribute('data-api-calculations-available','true');else e.removeAttribute('data-api-calculations-available');}}).transform(asset);
 const headers=new Headers(result.headers);headers.delete('ETag');headers.delete('Content-Length');headers.set('Cache-Control','private, no-store, no-transform');headers.set('CDN-Cache-Control','no-store');headers.set('Cloudflare-CDN-Cache-Control','no-store');
 return new Response(result.body,{status:result.status,statusText:result.statusText,headers});
}
