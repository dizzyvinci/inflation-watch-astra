// Default-Off fixed-own-health reader. No owner/SQL/writer/source IO.
import {B,need,integer,scope as checkScope} from './api-basic-current-contract.mjs';
import {readBasic} from './api-basic-current-storage.mjs';
import {sha256,parseStrictJson} from './api-price-item-dto.mjs';
import {ownBasicBytes,BASIC_PRIVATE_CONTRACT_SHA,BASIC_PUBLIC_DEFINITION_SHA} from './api-basic-current-public-contract.mjs';
import {exportBasicSelectedPinSnapshot} from './api-basic-current-pin-export.mjs';
const POOLS=new WeakMap(),MONO=()=>performance.now(),NOW=()=>Date.now(),KEY='_private/provider-api/v1/health.json';
const ORIGIN={accountId:'7421e067d9f7155231fbe1bdc8311b03',bucketName:'inflation-watch-astra-data',ownerName:'maplestory-market-account-primary-v1'};
const unavailable=()=>Object.freeze({status:'unavailable'}),disabled=()=>Object.freeze({status:'disabled'});
export const BASIC_HEALTH_CACHE_LIMITS=Object.freeze({key:KEY,healthBytes:99999,physical:1,waiters:64,waitMs:10000,ttlMs:30000,maxHealthAgeMs:300000});
function data(value,keys){need(value&&typeof value==='object'&&!Array.isArray(value),'health_cache_configuration');const d=Object.getOwnPropertyDescriptors(value);need(Object.keys(d).sort().join('|')===keys.slice().sort().join('|'),'health_cache_configuration');const out={};for(const k of keys){need('value'in d[k],'health_cache_accessor');out[k]=d[k].value;}return out;}
function authorityInput(raw){const a=data(raw,['origin','expectedScope','expectedPrivateContractSha256','metadata']),o=data(a.origin,['accountId','bucketName','ownerName']),s=data(a.expectedScope,['grantReference','roundReference','epoch']),m=data(a.metadata,['schemaVersion','kind','profile','definitionHash']);for(const k of Object.keys(ORIGIN))need(o[k]===ORIGIN[k],'health_cache_origin');need(a.expectedPrivateContractSha256===BASIC_PRIVATE_CONTRACT_SHA&&m.schemaVersion===1&&m.kind==='root_recorded_basic_private_graph_expected_v1'&&m.profile===B.profile&&m.definitionHash===BASIC_PUBLIC_DEFINITION_SHA,'health_cache_contract');return Object.freeze({origin:Object.freeze(o),expectedScope:Object.freeze(checkScope(s)),expectedPrivateContractSha256:a.expectedPrivateContractSha256,metadata:Object.freeze(m)});}
function unknown(error){try{return Object.getOwnPropertyDescriptor(error,'basicPhysicalUnknown')?.value===true;}catch{return true;}}
const observation=x=>x===null?null:JSON.parse(JSON.stringify(x));
export function createBasicTrustedHealthCache(options={}){
 if(options?.enabled!==true)return Object.freeze({getPins:disabled,refresh:async()=>Object.freeze({status:'disabled'}),setEnabled:()=>{},state:()=>Object.freeze({enabled:false,physicalPending:0,waiters:0,quarantined:false})});
 const {bucket,isEnabled=()=>true,monotonic=MONO,now=NOW,waitMs=2500,maxWaiters=64,ttlMs=15000,maxHealthAgeMs=300000}=options;
 need(bucket&&typeof bucket.get==='function'&&typeof isEnabled==='function'&&typeof monotonic==='function'&&typeof now==='function'&&integer(waitMs,1,10000)&&integer(maxWaiters,1,64)&&integer(ttlMs,1,30000)&&integer(maxHealthAgeMs,1,300000),'health_cache_configuration');
 const authority=authorityInput(options.authority),binding=JSON.stringify([authority,ttlMs,maxHealthAgeMs]);let s=POOLS.get(bucket);
 if(!s){s={mono:monotonic,now,binding:null,revision:0,disabled:false,physical:null,quarantined:false,record:null,floor:null,retryAt:0,failures:0};POOLS.set(bucket,s);}need(s.mono===monotonic&&s.now===now,'health_cache_clock_identity');
 function advance(off,reset=false){need(s.revision<Number.MAX_SAFE_INTEGER,'health_cache_revision');s.revision++;s.disabled=off;s.record=null;if(reset)s.floor=null;}
 if(s.binding!==binding){advance(false,true);s.binding=binding;}else if(s.disabled)advance(false);
 let on=true,revision=s.revision;
 function live(){try{return on&&isEnabled()===true&&!s.disabled&&s.binding===binding&&revision===s.revision;}catch{return false;}}
 function revoke(){if(s.binding===binding&&revision===s.revision)advance(true);}
 function mono(){const at=s.mono();need(Number.isFinite(at),'health_cache_clock');return at;}
 function wall(){const at=s.now();need(integer(at,0,8639999999999999),'health_cache_wall_clock');return at;}
 function getPins(){if(!live()){revoke();return disabled();}const r=s.record;if(!r)return unavailable();try{const began=mono();const owned=r.snapshot.pins.status==='ready'?Object.freeze({...r.snapshot.pins,expectedRaw:ownBasicBytes(r.snapshot.pins.expectedRaw,16384)}):Object.freeze({...r.snapshot.pins});const age=wall()-Date.parse(r.checkedAt);if(!live()){revoke();return disabled();}const final=mono(),elapsed=final-r.admittedAt;if(final<began||elapsed<0||elapsed>=ttlMs||age<0||age+(final-began)>maxHealthAgeMs)return unavailable();return owned;}catch{return unavailable();}}
 function fence(c){need(live()&&c.revision===s.revision&&!c.cancelled&&mono()<c.deadline,'health_cache_fence');}
 function result(status,reason){return Object.freeze({status:live()?status:'disabled',reason:live()?reason:'revoked',pinsStatus:getPins().status,observation:live()&&s.record?observation(s.record.snapshot.observation):null});}
 async function perform(c){
  fence(c);const raw=(await readBasic(bucket,KEY,{max:99999,fence:()=>fence(c)})).raw;fence(c);
  const originalSha=await sha256(raw);fence(c);const head=parseStrictJson(raw);need(head&&typeof head==='object'&&typeof head.checkedAt==='string'&&integer(head.revision,0),'health_cache_header');const checkedAt=head.checkedAt,observedAt=new Date(wall()).toISOString();
  const snapshot=await exportBasicSelectedPinSnapshot({enabled:true,healthRaw:raw,expectedHealthSha256:originalSha,expectedCheckedAt:checkedAt,observedAt,maxHealthAgeMs,expectedScope:authority.expectedScope,expectedPrivateContractSha256:authority.expectedPrivateContractSha256,metadata:authority.metadata});fence(c);
  need(snapshot&&['ready','no_current','unavailable'].includes(snapshot.pins?.status),'health_cache_export');if(snapshot.pins.status==='unavailable')throw Error('health_cache_unavailable');need(new TextEncoder().encode(JSON.stringify(snapshot.observation)).length<=4096,'health_cache_observation_bound');
  const old=s.floor;need(!old||head.revision>old.revision||head.revision===old.revision&&originalSha===old.sha,'health_cache_replay');need(!old||checkedAt>=old.checkedAt,'health_cache_clock_replay');
  fence(c);const at=mono();fence(c);s.floor={revision:head.revision,sha:originalSha,checkedAt};s.record={snapshot,checkedAt,admittedAt:at};s.failures=0;s.retryAt=0;return result('refreshed','accepted_fixed_health');
 }
 function join(slot,signal){
  if(signal?.aborted){if(slot.waiters===0&&!slot.logicalDone)slot.c.cancelled=true;return Promise.resolve(result('cancelled','caller_abort'));}if(slot.waiters>=Math.min(maxWaiters,slot.limit))return Promise.resolve(result('held','waiter_cap'));slot.waiters++;
  return new Promise(resolve=>{let done=false,timer;const deadline=Math.min(mono()+waitMs,slot.c.deadline);const finish=value=>{if(done)return;done=true;clearTimeout(timer);try{signal?.removeEventListener('abort',abort);}catch{}slot.waiters--;if(slot.waiters===0&&!slot.logicalDone)slot.c.cancelled=true;if(value.status==='refreshed'){try{fence(slot.c);need(mono()<deadline,'health_cache_waiter_deadline');}catch{value=result('unavailable','deadline_or_revoked');}}resolve(value);},abort=()=>finish(result('cancelled','caller_abort'));timer=setTimeout(()=>finish(result('unavailable','waiter_deadline')),Math.max(0,Math.ceil(deadline-mono())));try{signal?.addEventListener('abort',abort,{once:true});}catch{finish(result('cancelled','invalid_signal'));}slot.visible.then(finish,()=>finish(result('unavailable','validation_failed')));});
 }
 function refresh({signal=null}={}){
  if(!live()){revoke();return Promise.resolve(result('disabled','off'));}if(signal!==null&&(typeof signal?.aborted!=='boolean'||typeof signal?.addEventListener!=='function'||typeof signal?.removeEventListener!=='function'))return Promise.resolve(result('cancelled','invalid_signal'));if(signal?.aborted)return Promise.resolve(result('cancelled','caller_abort'));
  if(s.physical){if(s.physical.c.revision===s.revision&&!s.physical.c.cancelled&&!s.physical.logicalDone&&s.physical.visible)return join(s.physical,signal);return Promise.resolve(result('held','physical_hold'));}if(s.quarantined)return Promise.resolve(result('held','physical_unknown'));
  if(getPins().status!=='unavailable')return Promise.resolve(result('cached','within_original_ttl'));
  let at;try{at=mono();}catch{return Promise.resolve(result('unavailable','clock_unavailable'));}if(at<s.retryAt)return Promise.resolve(result('unavailable','backoff'));
  const c={revision:s.revision,deadline:at+waitMs,cancelled:false},slot={c,waiters:0,limit:maxWaiters,logicalDone:false,visible:null};s.physical=slot;
  const task=Promise.resolve().then(async()=>{try{return await perform(c);}catch(error){if(unknown(error))s.quarantined=true;if(c.revision===s.revision&&live()){s.record=null;let time;try{time=mono();}catch{time=Infinity;}s.retryAt=time+Math.min(30000,1000*2**Math.min(5,s.failures++));}return result('unavailable',s.quarantined?'physical_unknown':'validation_failed');}});
  let timer;const timeout=new Promise(resolve=>{timer=setTimeout(()=>{c.cancelled=true;resolve(result('unavailable','flight_deadline'));},waitMs);});slot.visible=Promise.race([task,timeout]).then(value=>{slot.logicalDone=true;clearTimeout(timer);return value;});task.finally(()=>{if(s.physical===slot)s.physical=null;}).catch(()=>{});return join(slot,signal);
 }
 function setEnabled(value){on=value===true;if(!on){revoke();return;}if(s.binding!==binding)return;if(s.disabled)advance(false);revision=s.revision;}
 return Object.freeze({getPins,refresh,setEnabled,state:()=>{const active=live();if(!active)revoke();return Object.freeze({enabled:active,physicalPending:s.physical||s.quarantined?1:0,quarantined:s.quarantined,waiters:s.physical?.waiters??0,pinsStatus:getPins().status,observation:s.record?observation(s.record.snapshot.observation):null});}});
}
