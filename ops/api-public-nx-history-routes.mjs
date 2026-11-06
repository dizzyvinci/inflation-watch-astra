// Mount only behind withPreviewGate. Public opt-in is separate from private writing.
import {createNxHistoryReader} from './nx-history-reader.mjs';
import {MANIFEST_PATH,PAGE_PREFIX} from './nx-history-contract.mjs';
export function publicNxHistoryEnabled(env){
 try{const v=JSON.parse(env.API_PUBLIC_NX_HISTORY_JSON);return v&&Object.keys(v).sort().join('|')==='enabled|methodVersion|publicationEnabled|schemaVersion'&&v.schemaVersion===1&&v.methodVersion===1&&v.enabled===true&&v.publicationEnabled===true;}catch{return false;}
}
const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store, no-transform','CDN-Cache-Control':'no-store','Cloudflare-CDN-Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow, noarchive'};
const off=r=>new Response(r.method==='HEAD'?null:'{"error":"not_published","sourceObservedAt":null}',{status:404,headers});
export function createPublicNxHistoryRoute(options={}){
 const readers=new WeakMap();
 return async(request,env)=>{
  const path=new URL(request.url).pathname;if(path!==MANIFEST_PATH&&!path.startsWith(PAGE_PREFIX))return null;
  if(!publicNxHistoryEnabled(env))return off(request);
  // Malformed suffixes never fall through to ASSETS or touch storage.
  if(path!==MANIFEST_PATH&&!/^\/api-nx-history\/[a-f0-9]{64}\.json$/.test(path))return off(request);
  let response;
  try{const bucket=env.API_RAW_RECEIPTS;if(!bucket||typeof bucket.get!=='function')throw Error();let reader=readers.get(bucket);if(!reader){reader=createNxHistoryReader({...options,bucket,enabled:true});readers.set(bucket,reader);}response=await reader(request);}
  catch{response=new Response(request.method==='HEAD'?null:'{"error":"nx_history_unavailable","sourceObservedAt":null}',{status:503,headers});}
  return publicNxHistoryEnabled(env)?response:off(request);
 };
}
