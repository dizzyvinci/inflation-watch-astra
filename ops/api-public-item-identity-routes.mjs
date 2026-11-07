import {currentSubsetPublicConfiguration} from './api-search-identity-public-routes.mjs';
// Explicit public subset reads only; the existing whole-site gate wraps dispatch.
import {createIdentityDiscoveryReader} from './api-item-discovery-reader.mjs';
const HEADERS={'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store, no-transform','CDN-Cache-Control':'no-store','Cloudflare-CDN-Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow, noarchive'};
export function publicItemIdentitiesStatus(env){
 if(currentSubsetPublicConfiguration(env,'identities').status==='ready')return'ready';
 try{const v=JSON.parse(env.API_PUBLIC_ITEM_IDENTITIES_JSON??'{"enabled":false}');
  if(v&&Object.keys(v).join(',')==='enabled'&&v.enabled===false)return'disabled';
  return v&&Object.keys(v).sort().join(',')==='enabled,methodVersion,publicationEnabled,schemaVersion'&&v.schemaVersion===1&&v.methodVersion===1&&v.enabled===true&&v.publicationEnabled===true?'ready':'invalid';
 }catch{return'invalid';}
}
const error=(request,status,code,extra={})=>new Response(request.method==='HEAD'?null:JSON.stringify({error:code,sourceObservedAt:null}),{status,headers:{...HEADERS,...extra}});
export function createPublicItemIdentitiesRoute({readerFactory=createIdentityDiscoveryReader}={}){
 const readers=new WeakMap();
 return async function publicItemIdentitiesFetch(request,env){
  const url=new URL(request.url),manifest=url.pathname==='/api-item-identities.json',prefix=url.pathname.startsWith('/api-item-identities/');
  if(!manifest&&!prefix)return null;
  // Existing v1 URLs keep their separately dated legacy generation.
  // No binding, grant, key, owner or accepted cache access while not published.
  if(publicItemIdentitiesStatus(env)!=='ready')return error(request,404,'not_published');
  if(!manifest&&!/^\/api-item-identities\/[a-f0-9]{64}\.json$/.test(url.pathname))return error(request,404,'not_found');
  if(!['GET','HEAD'].includes(request.method))return error(request,405,'method_not_allowed',{Allow:'GET, HEAD'});
  const query=[...url.searchParams];if(query.length>1||query.length===1&&(query[0][0]!=='generation'||!/^[a-f0-9]{64}$/.test(query[0][1])))return error(request,400,'invalid_query');
  try{
   const bucket=env.API_RAW_RECEIPTS;if(!bucket||typeof bucket.get!=='function')return error(request,503,'identity_reference_unavailable');
   let reader=readers.get(bucket);
   if(!reader){reader=readerFactory({bucket,enabled:true,isEnabled:()=>publicItemIdentitiesStatus(env)==='ready'});readers.set(bucket,reader);}
   const response=await reader(request);
   if(publicItemIdentitiesStatus(env)!=='ready')return error(request,404,'not_published');
   return response??error(request,404,'not_found');
  }catch{return publicItemIdentitiesStatus(env)==='ready'?error(request,503,'identity_reference_unavailable'):error(request,404,'not_published');}
 };
}
