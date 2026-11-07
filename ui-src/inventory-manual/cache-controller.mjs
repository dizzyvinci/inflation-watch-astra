// Finite explicit own-site cached reads via UNCHANGED accepted typed clients.
import{createItemReferenceClient}from'../item-api/item-loader.mjs';
import{createSearchIdentityClient}from'../item-api/search-identity-client.mjs';
import{createSearchSelectedPriceFetcher}from'../item-api/search-selected-price.mjs';
import{createInventoryPhysicalFetch,approvedInventoryOrigin}from'./physical-fetch.mjs';
import{validPublicEpoch,hasFastItemHeaders}from'../../ops/api-fast-item-public-protocol.mjs';
const need=(v,c)=>{if(!v)throw TypeError(c)},E=new TextEncoder();
export function createManualInventoryCacheController({enabled=false,isEnabled=()=>true,origin=null,priceProfile='legacy_dated',fastEpoch=null,identityEpoch=null,fetcher=null,now=Date.now,onSnapshot=()=>{},onIdentities=()=>{},onWithdraw=()=>{},onState=()=>{},timeoutMs=30000}={}){
 need(typeof isEnabled==='function'&&typeof onSnapshot==='function'&&typeof onIdentities==='function'&&typeof onWithdraw==='function'&&typeof onState==='function'&&Number.isSafeInteger(timeoutMs)&&timeoutMs>=1&&timeoutMs<=30000,'inventory_cache_options');
 if(enabled===true)need(approvedInventoryOrigin(origin)&&typeof fetcher==='function'&&['legacy_dated','fast_ordered'].includes(priceProfile)&&(priceProfile!=='fast_ordered'||validPublicEpoch(fastEpoch))&&(identityEpoch===null||validPublicEpoch(identityEpoch)),'inventory_cache_profile');
 let epoch=0,physicalWork=null,batch=null,blocked=false,records=new Map(),prices=null,identities=null,status='disabled';const capacityIds=new Set();
 const active=()=>{try{return enabled===true&&isEnabled()===true}catch{return false}},emit=()=>{try{onState(state())}catch{}},state=()=>({status,blocked,actionPending:!!physicalWork,physical:pool.state(),cachedReferenceItems:records.size,referenceCapacityUnknown:capacityIds.size,priceProfile,sourceClocksRenewed:false});
 const snapshot=()=>[...records.values()].map(v=>structuredClone(v));
 function changed(admit=null){if(active()&&!blocked){const owned=snapshot();admit?.();try{onSnapshot(owned)}catch{}}emit();admit?.()}
 function stop(reason,target=batch){if(target&&!target.reason){target.reason=reason;target.controller.abort();target.resolveStop();}status=reason;if(['timed_out','response_budget'].includes(reason)){for(const[id,r]of records)records.set(id,{...r,mode:'retained'});changed()}emit()}
 function invalidate(reason){epoch++;records.clear();capacityIds.clear();prices?.clear();identities?.clear();pool.revoke();onWithdraw(reason);stop(reason);emit()}
 const pool=createInventoryPhysicalFetch({origin,fetcher,isEnabled:()=>active()&&!blocked,onState:value=>{if(value.budgetExceeded&&batch&&!batch.reason){stop('response_budget');prices?.clear();identities?.clear();pool.revoke()}emit()},onHeaders:frame=>{
  if(frame.status===401||frame.status===403){blocked=true;invalidate('access_denied');return}
  if(frame.status===404&&frame.itemId!==null&&(priceProfile==='fast_ordered'?frame.protocol==='fast-current-v1'&&frame.epoch===fastEpoch:frame.protocol===null)){records.delete(frame.itemId);onWithdraw('membership_withdrawal');changed()}
 }});
 function clients(){
  if(prices)return;
  const current=()=>active()&&!blocked;
  const selected=priceProfile==='fast_ordered'?createSearchSelectedPriceFetcher(pool.read,{expectedEpoch:fastEpoch,isEnabled:current}):async(...args)=>{const r=await pool.read(...args);if(hasFastItemHeaders(r.headers)){if(r.body)await r.body.cancel();throw Error('explicit_legacy_profile_required')}return r};
  prices=createItemReferenceClient({enabled:true,isEnabled:current,fetcher:selected,now,ttlMs:30000,timeoutMs:10000,maxItems:64,maxBytes:2000000,maxFlights:4});
  if(identityEpoch!==null)identities=createSearchIdentityClient({enabled:true,isEnabled:current,expectedEpoch:identityEpoch,fetcher:pool.read,now,ttlMs:30000,timeoutMs:Math.min(timeoutMs,30000),readTimeoutMs:10000});
 }
 function mergeMemory(selected,admit){
  const peek=prices.peekCachedReferences(),memory=new Map(peek.references.map(v=>[v.data.itemId,v]));
  if(peek.status==='access_denied'){blocked=true;invalidate('access_denied');return}
  const next=new Map(records);
  for(const id of [...next.keys()])if(!selected.has(id))next.delete(id);
  for(const[id,record]of next)if(!memory.has(id))next.set(id,{data:record.data,mode:'retained'});
  for(const[id,record]of memory)if(selected.has(id))next.set(id,record);
  // Commit the complete bounded candidate only; overflow never leaves an
  // over-budget retained map or fabricates zero for the missing item.
  need(E.encode(JSON.stringify([...next.values()])).length<=2000000,'inventory_reference_bound');admit();records=next;changed(admit);
 }
 return Object.freeze({state,peek:()=>active()&&!blocked?snapshot():[],
  clear(){invalidate('cleared');blocked=false;status=active()?'unavailable':'disabled';emit()},
  disable(){enabled=false;invalidate('disabled')},
  async refresh(ids){
   if(!active())return{status:'disabled'};if(physicalWork||pool.busy)return{status:'physical_wait'};
   const deadline=performance.now()+timeoutMs;
   need(Array.isArray(ids)&&ids.length<=200&&ids.every(id=>Number.isSafeInteger(id)&&id>=1&&id<=999999999),'reviewed_item_ids');const selected=new Set(ids),list=[...selected];
   // This is an explicit retry after separate existing-site authentication,
   // never an in-page password/login flow or automatic401 retry.
   if(blocked){blocked=false;prices?.resetAccess();identities?.resetAccess()}
   clients();capacityIds.clear();const token=epoch,a=pool.begin(),controller=new AbortController();let resolveStop;const stopped=new Promise(r=>resolveStop=r),b={controller,resolveStop,reason:null};batch=b;status='loading';emit();let timer;
   const expire=()=>{prices.clear();identities?.clear();pool.revoke();stop('timed_out',b)};
   // The timer cannot interrupt synchronous validation/digest continuations.
   // Check monotonic time LAST, after authority/metadata reads, before admission.
   const fence=()=>{const allowed=active();if(token!==epoch||!allowed||blocked||b.reason){if(!b.reason)stop(blocked?'access_denied':allowed?'cleared':'disabled',b);throw Error('inventory_action_revoked')}if(performance.now()>=deadline){expire();throw Error('inventory_action_revoked')}};
   timer=setTimeout(expire,timeoutMs);
   const work=(async()=>{
    try{
     fence();
     try{if(identities){const known=await identities.load({signal:controller.signal});fence();onIdentities(known)}}catch(error){if(blocked||b.reason)throw error}
     finally{await pool.settlePhase('identity')}
     fence();let index=0;
     const worker=async()=>{while(index<list.length){fence();const id=list[index++];try{await prices.loadItem({itemId:id,signal:controller.signal});fence();mergeMemory(selected,fence)}catch(error){
      if(blocked||b.reason)throw error;
      const reason=prices.diagnostic(id).reason;
      if(reason==='not_found')records.delete(id);else if(records.has(id))records.set(id,{...records.get(id),mode:'retained'});
      if(error instanceof TypeError&&error.message==='inventory_reference_bound'){capacityIds.add(id);status='reference_capacity'}
      changed();
     }finally{await pool.settleItem(id)}}};
     await Promise.allSettled(Array.from({length:Math.min(4,list.length)},worker));fence();mergeMemory(selected,fence);fence();status='ready';return{status:'ready',referenceItems:records.size};
    }finally{await pool.settlePhase('identity');await pool.settlePhase('price');pool.end(a)}
   })();
   physicalWork=work;work.finally(()=>{if(physicalWork===work)physicalWork=null;emit()}).catch(()=>{});
   let outcome;try{
    const answer=await Promise.race([work.then(value=>({value}),error=>({error})),stopped.then(()=>({stopped:true}))]);
    // Physical settlement/end callbacks also run before a ready return. A late
    // timer delivery must not turn an elapsed campaign into a successful one.
    if(!b.reason&&!answer.error&&!answer.stopped)try{fence()}catch{}
    if(answer.error&&!b.reason){status=blocked?'access_denied':'unavailable';for(const[id,r]of records)records.set(id,{...r,mode:'retained'});changed()}
    outcome=b.reason?{status:b.reason}:answer.value??{status};
   }finally{clearTimeout(timer);if(batch===b)batch=null;emit()}
   // The final status callback above can itself consume time. No callback or
   // retained-map serialization remains after this last success boundary.
   if(!b.reason&&outcome?.status==='ready')try{fence()}catch{}
   return b.reason?{status:b.reason}:outcome;
  }
 });
}
