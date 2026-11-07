// Memory-only manual page/stack ledger. No browser, transport, timer or storage.
import{sanitizeEntries,displayMoney}from'./inventory.mjs';
import{createManualInventoryOwnCacheAdapter}from'./reference-cache-adapter.mjs';
import{describeReferenceStatus}from'../item-api/reference-status.mjs';
import{describeSearchPriceRelation,qualifySearchPriceStatus}from'../item-api/search-price-relation.mjs';
import{validateIdentityRow}from'../../ops/api-search-identity-contract.mjs';
const need=(v,c)=>{if(!v)throw TypeError(c)},copy=v=>structuredClone(v),H=/^[a-f0-9]{64}$/;
export async function createManualPageWorkspace({enabled=false,now=Date.now}={}){
 need(typeof now==='function','inventory_clock');let on=enabled===true,serial=0,pageSerial=0,referenceEpoch=0,cacheState='unavailable',priceProfile='legacy_dated',pages=[],entries=[],identities=new Map(),identitySources=[];const listeners=new Set();
 const adapter=await createManualInventoryOwnCacheAdapter({enabled:true,isEnabled:()=>on});
 const flat=()=>entries.map(r=>r.entry),notify=()=>{for(const fn of listeners)try{fn()}catch{}},reseed=()=>{if(on)adapter.replaceEntries(flat())};
 function withdraw(reason='unavailable'){referenceEpoch++;cacheState=reason;adapter.clear();reseed();if(reason==='access_denied'){identities=new Map();identitySources=[]}notify();}
 function view({online=true,visible=true}={}){
  const value=adapter.view(),byId=new Map(entries.map(e=>[e.entry.entryId,e])),rows=(value.rows??[]).map(r=>{
   const owner=byId.get(r.entryId),known=identities.get(r.itemId),sale=r.evidence?.sale;
   const plain=owner.entry.kind==='commodity'&&!r.evidence?.hasVariantEvidence&&owner.entry.stats===null&&owner.entry.slots===null&&owner.entry.upgrades===null;
   const available=r.gross!==null||(plain&&sale?.medianUnitPriceLexeme!==null&&sale?.reportedSalesCount>=5);
   const status=['loading','access_denied','retained'].includes(cacheState)?cacheState:r.evidence?.source.cacheMode??'unavailable';
   const relation=priceProfile==='fast_ordered'?describeSearchPriceRelation({schemaVersion:2,sourceSnapshots:identitySources,rows:known?[{itemId:r.itemId,memberships:known.currentMemberships.map(operation=>({operation}))}]:[]},r.itemId,r.source?.capturedAt??null):null;
   return{...r,pageId:owner.pageId,pageLabel:pages.find(p=>p.pageId===owner.pageId).label,name:r.evidence?r.name:known?.name??r.name,sprite:known?.sprite??null,
    knownIdentityOnly:!r.evidence&&!!known,priceMembershipRelation:relation,sourceStatus:qualifySearchPriceStatus(describeReferenceStatus({capturedAt:r.source?.capturedAt??null,status,hasData:!!r.evidence,available,retained:r.evidence?.source.cacheMode==='retained',online,visible,now:now()}),relation)};
  });
  return{enabled:on,cacheState,priceProfile,pages:pages.map(p=>({...copy(p),rows:entries.filter(e=>e.pageId===p.pageId).length,valued:rows.filter(r=>r.pageId===p.pageId&&r.gross!==null).length,possibleRepeatedSource:p.sourceHash!==null&&pages.filter(q=>q.sourceHash===p.sourceHash).length>1})),rows,
   coverage:on?value.coverage:{entries:entries.length,valued:0,excludedOrUnknown:entries.length},subtotal:value.subtotal??{status:'unavailable',gross:null,net:null},suggestions:value.suggestions??[],duplicateStackPolicy:'keep_all_physical_rows_until_manual_removal',sourceClocksRenewed:false,displayMoney};
 }
 return Object.freeze({get enabled(){return on},subscribe(fn){need(typeof fn==='function','inventory_listener');listeners.add(fn);return()=>listeners.delete(fn)},
  setEnabled(value){need(typeof value==='boolean','inventory_enabled');if(!value){on=false;withdraw('disabled')}else{on=true;cacheState='unavailable';reseed();notify()}return{enabled:on,automaticRequests:0}},
  addPage(input={}){need(on,'inventory_off');need(input&&typeof input==='object'&&!Array.isArray(input)&&Object.keys(input).every(k=>['label','sourceKind','sourceHash'].includes(k)),'manual_page_fields');const{label,sourceKind='manual',sourceHash=null}=copy(input);need(pages.length<10&&typeof label==='string'&&label.trim().length>0&&label.length<=80&&['manual','screenshot_transcription'].includes(sourceKind)&&(sourceHash===null||typeof sourceHash==='string'&&H.test(sourceHash)),'manual_page');need(pageSerial<999999,'page_serial');const page={pageId:'page-'+(++pageSerial),label:label.trim(),sourceKind,sourceHash,sourceHashAuthority:sourceHash===null?'not_supplied':'user_entered_not_verified'};pages.push(page);notify();return copy(page)},
  removePage(pageId){need(on&&pages.some(p=>p.pageId===pageId),'manual_page');pages=pages.filter(p=>p.pageId!==pageId);entries=entries.filter(e=>e.pageId!==pageId);reseed();notify()},
  addEntry(pageId,input){need(on&&pages.some(p=>p.pageId===pageId)&&entries.length<200&&serial<999999,'manual_entry_bound');need(input&&typeof input==='object'&&!Array.isArray(input)&&!Object.hasOwn(input,'entryId'),'manual_entry_fields');const entry=sanitizeEntries([{...copy(input),entryId:'row-'+(serial+1)}])[0];serial++;entries.push({pageId,entry});reseed();notify();return copy({pageId,entry})},
  removeEntry(entryId){need(on&&entries.some(e=>e.entry.entryId===entryId),'manual_entry');entries=entries.filter(e=>e.entry.entryId!==entryId);reseed();notify()},
  getEntries:()=>copy(entries),getPages:()=>copy(pages),reviewedIds:()=>[...new Set(entries.map(r=>r.entry.itemId))],
  setPriceProfile(value){need(['legacy_dated','fast_ordered'].includes(value),'price_profile');if(value!==priceProfile){priceProfile=value;withdraw('unavailable')}},
  setCacheState(value){need(['loading','unavailable','retained','ready','access_denied','disabled','physical_wait'].includes(value),'cache_state');cacheState=value;notify()},
  async applyCachedReferences(records){if(!on)return{status:'disabled'};const ticket=++referenceEpoch;const result=await adapter.replaceCachedReferences(records);if(!on||ticket!==referenceEpoch)return{status:'discarded'};if(!['loading','access_denied','retained','disabled'].includes(cacheState))cacheState='ready';notify();return result},
  setKnownIdentities(snapshot){if(!on)return;const{rows,manifest}=snapshot;need(Array.isArray(rows)&&rows.length<=10000&&Array.isArray(manifest.sources)&&manifest.sources.length<=3,'identity_bound');const next=new Map();for(const row of rows){const r=validateIdentityRow(copy(row));need(!next.has(r.itemId),'identity_duplicate');next.set(r.itemId,{name:r.name??'Item #'+r.itemId,sprite:r.sprite??null,currentMemberships:copy(r.currentMemberships)})}identities=next;identitySources=copy(manifest.sources);notify()},
  withdrawCachedReferences:withdraw,
  clear(){referenceEpoch++;pages=[];entries=[];identities=new Map();identitySources=[];adapter.clear();cacheState='unavailable';notify()},
  exportManual(){return{schemaVersion:2,kind:'user_reviewed_manual_inventory_pages',pages:copy(pages),entries:copy(entries),automaticRecognition:false,containsPriceReferences:false}},
  view
 });
}
