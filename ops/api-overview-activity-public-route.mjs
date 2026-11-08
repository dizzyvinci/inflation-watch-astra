// Own-cache GET/HEAD only; mounted beneath the unchanged whole-site gate.
import {grantConfig,OWNER_NAME} from './api-collector-core.mjs';
import {overviewActivityConfiguration} from './api-overview-activity-registration.mjs';
import {sharedOverviewConfiguration} from './api-shared-overview-guard.mjs';
import {createOverviewActivityReader} from './api-overview-activity-reader.mjs';
import {sha256} from './api-price-item-dto.mjs';
import {ACTIVITY_HTTP_PREFIX as PREFIX,ACTIVITY_PROTOCOL as PROTOCOL,ACTIVITY_PROFILE,ACTIVITY_DEFINITION_SHA as DEF,ACTIVITY_MAX_BYTES,activityResponse,activityEpoch,activityEnc,activityDefinitionReady,activityNeed as need} from './api-overview-activity-public-contract.mjs';
const MONO=()=>performance.now(),NOW=()=>Date.now(),ENTRIES=new WeakMap();
const BASE={'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store, no-transform','CDN-Cache-Control':'no-store','Cloudflare-CDN-Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow, noarchive'};
function response(method,status,body,extra={}){const h=new Headers({...BASE,...extra});if(body!==null)h.set('Content-Length',String(activityEnc.encode(body).length));return new Response(method==='HEAD'||status===304?null:body,{status,headers:h});}
function error(method,status,code){return response(method,status,JSON.stringify({error:code,sourceObservedAt:null}));}
function compact(s){let r='',q=false,e=false;for(const c of s){if(q){r+=c;if(e)e=false;else if(c==='\\')e=true;else if(c==='"')q=false;}else if(c==='"'){r+=c;q=true;}else if(!/[\x20\t\r\n]/.test(c))r+=c;}return r;}
export function publicOverviewActivityConfiguration(env){try{const raw=env?.API_PUBLIC_OVERVIEW_ACTIVITY_JSON;if(raw===undefined)return{status:'disabled'};if(typeof raw!=='string'||raw.length>2048)return{status:'invalid'};const v=JSON.parse(raw);if(JSON.stringify(v)!==compact(raw))return{status:'invalid'};if(v&&Object.keys(v).join('|')==='enabled'&&v.enabled===false)return{status:'disabled'};
 if(!v||Array.isArray(v)||Object.keys(v).sort().join('|')!=='approvalRecorded|enabled|grantReference|privateEpoch|publicEpoch|publicationEnabled|roundReference|schemaVersion|sourceProfile'||v.schemaVersion!==1||v.enabled!==true||v.approvalRecorded!==true||v.publicationEnabled!==true||v.sourceProfile!==ACTIVITY_PROFILE||!activityEpoch(v.privateEpoch)||!activityEpoch(v.publicEpoch)||typeof v.grantReference!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/.test(v.grantReference)||v.grantReference===OWNER_NAME||typeof v.roundReference!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/.test(v.roundReference))return{status:'invalid'};return{status:'ready',value:Object.freeze({...v})};}catch{return{status:'invalid'};}}
function admit(env){const p=publicOverviewActivityConfiguration(env);if(p.status!=='ready')return null;try{const v=p.value,b=overviewActivityConfiguration(env),shared=sharedOverviewConfiguration(env),raw=env.API_GRANT_JSON;if(typeof raw!=='string'||raw.length>8192)return null;const g=grantConfig({API_GRANT_JSON:raw});if(b.status!=='ready'||shared.status!=='ready'||g.enabled!==true||!g.allowedOperations.includes('overview')||g.grantReference===OWNER_NAME||v.grantReference!==g.grantReference||v.roundReference!==g.probeRound||v.grantReference!==b.value.grantReference||v.roundReference!==b.value.roundReference||v.privateEpoch!==b.value.epoch)return null;const scope={grantReference:g.grantReference,roundReference:g.probeRound,epoch:b.value.epoch,definitionHash:DEF};return{value:v,scope,signature:JSON.stringify([v,b.value,g])};}catch{return null;}}
function stop(entry){if(entry&&!entry.revoked){entry.revoked=true;entry.reader?.setEnabled(false);}}
export function createPublicOverviewActivityRoute({monotonic=MONO,now=NOW,waitMs=2500}={}){
 return async(request,env)=>{
  const url=new URL(request.url),path=url.pathname;if(!path.startsWith(PREFIX))return null;
  const method=request.method,pin=admit(env),prior=ENTRIES.get(env);if(!pin){stop(prior);return error(method,404,'not_published');}
  if(!['GET','HEAD'].includes(method))return error(method,405,'method_not_allowed');
  if(url.search||url.href.includes('?')||url.href.includes('#'))return error(method,400,'invalid_query');
  if(path!==PREFIX+'profile.json'&&path!==PREFIX+'current.json')return error(method,404,'not_found');
  const live=()=>admit(env)?.signature===pin.signature;
  let start;try{start=monotonic();need(Number.isFinite(start)&&start>=0,'activity_http_clock');}catch{return error(method,503,'activity_not_ready');}const deadline=start+waitMs;
  try{await activityDefinitionReady();}catch{return error(method,503,'activity_not_ready');}
  if(path===PREFIX+'profile.json'){
   const body=JSON.stringify({schemaVersion:1,kind:'overview_activity_public_profile',protocol:PROTOCOL,definitionHash:DEF,publicEpoch:pin.value.publicEpoch,available:true});if(activityEnc.encode(body).length>512)return error(method,503,'activity_not_ready');const ready=response(method,200,body);if(!live())return error(method,404,'not_published');const end=monotonic();return Number.isFinite(end)&&end>=start&&end<deadline?ready:error(method,503,'activity_not_ready');
  }
  if(request.headers.get('X-Astra-Request-Overview-Activity-Protocol')!==PROTOCOL)return error(method,400,'unsupported_activity_protocol');
  try{
   const bucket=env.API_RAW_RECEIPTS;need(bucket&&typeof bucket.get==='function','activity_read_bucket');
   let entry=ENTRIES.get(env);if(entry&&entry.bucket!==bucket){stop(entry);return error(method,503,'activity_not_ready');}
   if(entry&&(entry.signature!==pin.signature||entry.revoked)){stop(entry);entry=null;}
   if(entry&&(entry.monotonic!==monotonic||entry.now!==now||entry.waitMs!==waitMs))return error(method,503,'activity_not_ready');
   if(!entry){entry={signature:pin.signature,bucket,monotonic,now,waitMs,revoked:false,reader:null,ready:null};ENTRIES.set(env,entry);
    const active=()=>{if(entry.revoked||ENTRIES.get(env)!==entry)return false;const next=admit(env);try{return next?.signature===entry.signature&&env.API_RAW_RECEIPTS===bucket;}catch{return false;}};
    entry.ready=(async()=>{const scopeHash=await sha256(activityEnc.encode(JSON.stringify(pin.scope)));need(active(),'activity_http_revoked');entry.reader=createOverviewActivityReader({enabled:true,bucket,scopeHash,isEnabled:active,monotonic,now,waitMs});})();
   }
   await entry.ready;need(!request.signal.aborted&&monotonic()<deadline,'activity_http_expired');
   const got=await entry.reader.read({signal:request.signal,deadline});if(!got.reference)return live()?error(method,503,'activity_not_ready'):error(method,404,'not_published');
   const state=got.status==='ready'?'current':'retained',body=JSON.stringify(activityResponse(got.reference,pin.value.publicEpoch,state));need(activityEnc.encode(body).length<=ACTIVITY_MAX_BYTES,'activity_http_bound');const digest=await sha256(activityEnc.encode(body)),etag='"overview-activity-'+digest+'"',matched=state==='current'&&request.headers.get('If-None-Match')===etag;
   const headers={'ETag':etag,'X-Astra-Overview-Activity-Body-Sha256':digest,'X-Astra-Overview-Activity-Epoch':pin.value.publicEpoch,'X-Astra-Overview-Activity-State':state,'X-Astra-Overview-Activity-Captured-At':got.reference.source.capturedAt,'X-Astra-Overview-Activity-Generated-At':got.reference.source.sourceGeneratedAt};
   const ready=response(method,matched?304:state==='current'?200:409,body,headers);
   // Construct all output/read caller headers before final authority+time fence.
   if(request.signal.aborted||!live()||entry.revoked||ENTRIES.get(env)!==entry||env.API_RAW_RECEIPTS!==bucket)return error(method,404,'not_published');
   const end=monotonic();if(!Number.isFinite(end)||end<start||end>=deadline||state==='current'&&!(end<got.currentValidUntil))return error(method,503,'activity_not_ready');return ready;
  }catch{return error(method,503,'activity_not_ready');}
 };
}
