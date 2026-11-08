// Strict optional public selector; private capture alone never publishes this path.
import {grantConfig,OWNER_NAME} from './api-collector-core.mjs';
import {basicCurrentConfiguration,BASIC_CURRENT_CONTRACT_SHA} from './api-basic-current-registration.mjs';
import {createBasicSelectedReadService} from './api-basic-current-read-service.mjs';
import {createBasicPublicItemHttpRoute} from './api-basic-item-http-route.mjs';
import {BASIC_PUBLIC_DEFINITION_SHA} from './api-basic-current-public-contract.mjs';
import {BASIC_ITEM_HTTP_PREFIX,BASIC_ITEM_HTTP_PATH,BASIC_ITEM_HTTP_PROTOCOL,basicHttpHash,validBasicHttpEpoch,basicHttpError,basicHttpResponse} from './api-basic-item-http-protocol.mjs';
const ENTRIES=new WeakMap(),MONO=()=>performance.now(),NOW=()=>Date.now(),PROFILE=BASIC_ITEM_HTTP_PREFIX+'profile.json';
const ORIGIN=Object.freeze({accountId:'7421e067d9f7155231fbe1bdc8311b03',bucketName:'inflation-watch-astra-data',ownerName:OWNER_NAME});
const FIELDS=['schemaVersion','enabled','approvalRecorded','publicationEnabled','sourceProfile','grantReference','roundReference','privateEpoch','publicEpoch'];
const compact=s=>{let out='',q=false,e=false;for(const c of s){if(q){out+=c;if(e)e=false;else if(c==='\\')e=true;else if(c==='"')q=false;}else if(c==='"'){out+=c;q=true;}else if(!/[\x20\t\r\n]/.test(c))out+=c;}return out;};
export function publicBasicConfiguration(env){try{
 const raw=env?.API_PUBLIC_BASIC_ITEM_PRICES_JSON;if(raw===undefined)return{status:'disabled'};if(typeof raw!=='string'||raw.length>2048)return{status:'invalid'};const v=JSON.parse(raw);if(JSON.stringify(v)!==compact(raw))return{status:'invalid'};
 if(v&&Object.keys(v).join('|')==='enabled'&&v.enabled===false)return{status:'disabled'};
 if(!v||Array.isArray(v)||Object.keys(v).sort().join('|')!==FIELDS.slice().sort().join('|')||v.schemaVersion!==1||v.enabled!==true||v.approvalRecorded!==true||v.publicationEnabled!==true||v.sourceProfile!=='basic_aggregate_v1'||!validBasicHttpEpoch(v.publicEpoch))return{status:'invalid'};
 for(const k of ['grantReference','roundReference'])if(typeof v[k]!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/.test(v[k]))return{status:'invalid'};
 if(typeof v.privateEpoch!=='string'||!/^[a-z][a-z0-9-]{0,63}$/.test(v.privateEpoch)||v.grantReference===OWNER_NAME)return{status:'invalid'};
 return{status:'ready',value:Object.freeze({...v})};
}catch{return{status:'invalid'};}}
function admit(env){const p=publicBasicConfiguration(env);if(p.status!=='ready')return null;try{const b=basicCurrentConfiguration(env),raw=env.API_GRANT_JSON;if(typeof raw!=='string'||raw.length>8192)return null;const g=grantConfig({API_GRANT_JSON:raw}),v=p.value;if(b.status!=='ready'||g.enabled!==true||!g.allowedOperations.includes('prices')||g.grantReference===OWNER_NAME||v.grantReference!==g.grantReference||v.roundReference!==g.probeRound||v.grantReference!==b.value.grantReference||v.roundReference!==b.value.roundReference||v.privateEpoch!==b.value.epoch)return null;return{policy:v,scope:Object.freeze({grantReference:g.grantReference,roundReference:g.probeRound,epoch:b.value.epoch}),signature:JSON.stringify([v,b.value,g])};}catch{return null;}}
const denied=req=>basicHttpError(req,404,'not_published');
function stop(entry){if(entry&&!entry.revoked){entry.revoked=true;entry.route.setEnabled(false);}}
export function createBasicPublicHostRoute({monotonic=MONO,now=NOW,waitMs=2500}={}){
 return async function publicBasicFetch(request,env){
  const url=new URL(request.url),path=url.pathname;if(!path.startsWith(BASIC_ITEM_HTTP_PREFIX))return null;
  const pin=admit(env),old=ENTRIES.get(env);if(!pin){stop(old);return denied(request);}
  if(path!==PROFILE&&!BASIC_ITEM_HTTP_PATH.test(path))return basicHttpError(request,404,'not_found');
  if(!['GET','HEAD'].includes(request.method))return basicHttpError(request,405,'method_not_allowed',{}, {Allow:'GET, HEAD'});
  if(path===PROFILE){
   if(url.search||url.href.includes('?')||url.href.includes('#'))return basicHttpError(request,400,'invalid_query');
   const body=JSON.stringify({schemaVersion:1,kind:'basic_item_public_profile',protocol:BASIC_ITEM_HTTP_PROTOCOL,definitionHash:BASIC_PUBLIC_DEFINITION_SHA,publicEpoch:pin.policy.publicEpoch,available:true});
   if(body.length>512)return basicHttpError(request,503,'basic_reference_unavailable');const response=basicHttpResponse(request,200,body);const final=admit(env);if(!final||final.signature!==pin.signature){stop(old);return denied(request);}return response;
  }
  if(request.headers.get('X-Astra-Request-Basic-Protocol')!==BASIC_ITEM_HTTP_PROTOCOL)return basicHttpError(request,400,'unsupported_basic_protocol');
  const query=[...url.searchParams];if(query.length>1||query.length===1&&(query[0][0]!=='generation'||!basicHttpHash(query[0][1])))return basicHttpError(request,400,'invalid_query');
  try{
   const bucket=env.API_RAW_RECEIPTS;if(!bucket||typeof bucket.get!=='function')return basicHttpError(request,503,'basic_reference_unavailable');
   // Do not remount a new binding capability around an old held physical task.
   if(old&&old.bucket!==bucket){stop(old);return basicHttpError(request,503,'basic_reference_unavailable');}
   let entry=old;
   if(entry&&(entry.signature!==pin.signature||entry.revoked)){stop(entry);entry=null;}
   if(entry&&(entry.monotonic!==monotonic||entry.now!==now||entry.waitMs!==waitMs))return basicHttpError(request,503,'basic_reference_unavailable');
   if(!entry){
    entry={signature:pin.signature,bucket,monotonic,now,waitMs,revoked:false,route:null};
    const active=()=>{if(entry.revoked||ENTRIES.get(env)!==entry)return false;const next=admit(env);try{return next?.signature===entry.signature&&env.API_RAW_RECEIPTS===bucket;}catch{return false;}};
    const authority={origin:ORIGIN,expectedScope:pin.scope,expectedPrivateContractSha256:BASIC_CURRENT_CONTRACT_SHA,metadata:{schemaVersion:1,kind:'root_recorded_basic_private_graph_expected_v1',profile:'basic_aggregate_v1',definitionHash:BASIC_PUBLIC_DEFINITION_SHA}};
    const service=createBasicSelectedReadService({enabled:true,bucket,authority,isEnabled:active,monotonic,now});
    entry.route=createBasicPublicItemHttpRoute({enabled:true,identity:bucket,reader:service,scope:pin.scope,publicEpoch:pin.policy.publicEpoch,isEnabled:active,monotonic,now,waitMs});ENTRIES.set(env,entry);
   }
   return await entry.route(request);
  }catch{return basicHttpError(request,503,'basic_reference_unavailable');}
 };
}
