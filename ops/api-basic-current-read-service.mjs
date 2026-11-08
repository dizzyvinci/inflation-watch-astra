// Read-only composition. Caller passes ONE original absolute HTTP deadline.
import {integer,need} from './api-basic-current-contract.mjs';
import {createBasicTrustedHealthCache} from './api-basic-current-health-cache.mjs';
import {createBasicSelectedCacheReader} from './api-basic-current-cache-reader.mjs';
const MONO=()=>performance.now(),NOW=()=>Date.now();
const empty=status=>Object.freeze({status,reference:null,raw:null,currentAgainstProvidedPins:false,upstreamLatestInspected:false});
function data(v,keys){need(v&&typeof v==='object'&&!Array.isArray(v),'basic_service_configuration');const d=Object.getOwnPropertyDescriptors(v);need(Object.keys(d).sort().join('|')===keys.slice().sort().join('|'),'basic_service_configuration');const out={};for(const k of keys){need('value'in d[k],'basic_service_accessor');out[k]=d[k].value;}return out;}
export function createBasicSelectedReadService(options={}){
 if(options?.enabled!==true)return Object.freeze({read:async()=>empty('disabled'),setEnabled:()=>{},state:()=>Object.freeze({enabled:false,healthPhysicalPending:0,selectedPhysicalPending:0})});
 const {bucket,isEnabled=()=>true,monotonic=MONO,now=NOW,ttlMs=15000,maxHealthAgeMs=300000,maxWaiters=64}=options;
 need(typeof isEnabled==='function'&&typeof monotonic==='function'&&typeof now==='function','basic_service_configuration');
 const raw=data(options.authority,['origin','expectedScope','expectedPrivateContractSha256','metadata']);const authority=Object.freeze({origin:Object.freeze(data(raw.origin,['accountId','bucketName','ownerName'])),expectedScope:Object.freeze(data(raw.expectedScope,['grantReference','roundReference','epoch'])),expectedPrivateContractSha256:raw.expectedPrivateContractSha256,metadata:Object.freeze(data(raw.metadata,['schemaVersion','kind','profile','definitionHash']))});
 let on=true,lastReader=null,lastHealth=null;
 const active=()=>{try{return on&&isEnabled()===true;}catch{return false;}};
 const healthOptions={enabled:true,bucket,authority,isEnabled:active,monotonic,now,ttlMs,maxHealthAgeMs,maxWaiters};
 // Initial factory validates immutable authority, but performs no I/O or timer.
 const health=createBasicTrustedHealthCache({...healthOptions,waitMs:10000});
 function clock(){const at=monotonic();need(Number.isFinite(at),'basic_service_clock');return at;}
 async function read(id,{signal=null,deadline}={}){
  if(!active())return empty('disabled');if(!integer(id,1,999999999))return empty('invalid_item_id');
  try{
   const start=clock();need(Number.isFinite(deadline)&&deadline>start&&deadline<=start+10000,'basic_service_deadline');
   const fence=()=>need(active()&&!signal?.aborted&&clock()<deadline,'basic_service_expired');
   const remaining=()=>{fence();const left=Math.floor(deadline-clock());need(integer(left,1,10000),'basic_service_expired');return left;};
   const callerHealth=createBasicTrustedHealthCache({...healthOptions,waitMs:remaining()});lastHealth=callerHealth;
   const refreshed=await callerHealth.refresh({signal});fence();
   // A visible health caller timeout is terminal for THIS caller even if a
   // coarse/injected clock has not advanced; do not poison shared reader backoff.
   if(refreshed.status==='cancelled'||['waiter_deadline','flight_deadline','deadline_or_revoked'].includes(refreshed.reason))return empty('unavailable');
   if(refreshed.status==='disabled')return empty('disabled');
   const reader=createBasicSelectedCacheReader({enabled:true,bucket,scope:authority.expectedScope,committedPinsProvider:callerHealth.getPins,isEnabled:active,monotonic,waitMs:remaining(),maxWaiters});lastReader=reader;
   const result=await reader.read(id,{signal});fence();return result;
  }catch{return empty(active()?'unavailable':'disabled');}
 }
 function setEnabled(value){on=value===true;if(!on){(lastHealth??health).setEnabled(false);lastReader?.setEnabled(false);}}
 return Object.freeze({read,setEnabled,state:()=>Object.freeze({enabled:active(),healthPhysicalPending:health.state().physicalPending,selectedPhysicalPending:lastReader?.state().physicalPending??0})});
}
