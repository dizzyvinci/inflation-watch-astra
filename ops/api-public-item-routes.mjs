// Narrow derived-item reads only. The existing outer site gate runs first.
import {createApiItemPriceRoute} from './api-item-price-route.mjs';
const HEADERS={'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store, no-transform','CDN-Cache-Control':'no-store','Cloudflare-CDN-Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow, noarchive'};
const METADATA=Object.freeze([
 Object.freeze({expectedSha256:'e66a5fb71974f55bad03130d2c3c8926f57ac8a5db949d58a369c4835ca6537f',sourceUrl:'https://maplestory.io/api/MCW/1/item/list?cashFilter=true&count=10000',format:'cash_client_catalog'}),
 Object.freeze({expectedSha256:'60166ef0713a547a73b81473fbfa43d5d63f5182c978f5194b16411cd5e88a92',sourceUrl:'https://maplestory.io/api/MCW/1/item/list?cashFilter=false&count=10000',format:'noncash_list'})]);
export function publicItemPricesStatus(env){
 try{const v=JSON.parse(env.API_PUBLIC_ITEM_PRICES_JSON??'{"enabled":false}');
  if(v&&Object.keys(v).join(',')==='enabled'&&v.enabled===false)return'disabled';
  return v&&Object.keys(v).sort().join(',')==='enabled,methodVersion,publicationEnabled,schemaVersion'&&v.schemaVersion===1&&v.methodVersion===1&&v.enabled===true&&v.publicationEnabled===true?'ready':'invalid';
 }catch{return'invalid';}
}
const response=(request,status,code,extra={})=>new Response(request.method==='HEAD'?null:JSON.stringify({error:code}),{status,headers:{...HEADERS,...extra}});
export function createPublicItemPriceRoute({routeFactory=createApiItemPriceRoute}={}){
 const readers=new WeakMap();
 return async function publicItemPriceFetch(request,env){
  const url=new URL(request.url);if(!url.pathname.startsWith('/api-item-prices/'))return null;
  // Off exits before bucket, owner, grant, provider credential or cached DTO access.
  if(publicItemPricesStatus(env)!=='ready')return response(request,404,'not_published');
  if(!/^\/api-item-prices\/[1-9][0-9]{0,8}\.json$/.test(url.pathname))return response(request,404,'not_found');
  if(!['GET','HEAD'].includes(request.method))return response(request,405,'method_not_allowed',{Allow:'GET, HEAD'});
  const query=[...url.searchParams];if(query.length>1||query.length===1&&(query[0][0]!=='generation'||!/^[a-f0-9]{64}$/.test(query[0][1])))return response(request,400,'invalid_query');
  try{
   const bucket=env.API_RAW_RECEIPTS;if(!bucket||typeof bucket.get!=='function')return response(request,503,'item_reference_unavailable');
   let reader=readers.get(bucket);
   if(!reader){reader=routeFactory({bucket,metadata:METADATA,enabled:true,isEnabled:()=>publicItemPricesStatus(env)==='ready'});readers.set(bucket,reader);}
   const result=await reader(request);
   if(publicItemPricesStatus(env)!=='ready')return response(request,404,'not_published');
   return result??response(request,404,'not_found');
  }catch{return publicItemPricesStatus(env)==='ready'?response(request,503,'item_reference_unavailable'):response(request,404,'not_published');}
 };
}
