import {validatePublicItemReference} from '../../ops/api-item-reference-protocol.mjs';

const fail=c=>{throw Error(c);}, need=(v,c)=>{if(!v)fail(c);};
export const knownStatLabels=Object.freeze({'0':'STR','1':'DEX','2':'INT','3':'LUK','4':'Max HP','5':'Max MP','6':'Speed','7':'Jump','9':'MATT','10':'Weapon DEF','11':'Magic DEF','12':'Accuracy','13':'Avoidability','14':'Crit','15':'Crit damage','16':'ATT'});
const rows=new WeakSet(),reviews=new WeakSet();
const freeze=v=>{if(v&&typeof v==='object'&&!Object.isFrozen(v)){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v;};
function data(v,k){need(v!==null&&typeof v==='object','cached_record');const d=Object.getOwnPropertyDescriptor(v,k);need(d&&Object.hasOwn(d,'value'),'cached_own_data');return d.value;}
/** Own only one bounded selected public wrapper, without invoking accessors. */
function ownPublic(v){let nodes=0,units=0;function copy(x,depth=0){need(depth<=32&&++nodes<=40000,'cached_reference_bound');if(x===null||typeof x==='boolean')return x;if(typeof x==='number'){need(Number.isSafeInteger(x),'cached_number');return x;}if(typeof x==='string'){units+=x.length;need(x.length<=2048&&units<=300000,'cached_reference_bound');return x;}need(x&&typeof x==='object','cached_own_data');const keys=Reflect.ownKeys(x);need(keys.every(k=>typeof k==='string'),'cached_own_data');if(Array.isArray(x)){const n=data(x,'length');need(Number.isSafeInteger(n)&&n<=20000&&keys.length===n+1,'cached_array');return Array.from({length:n},(_,i)=>copy(data(x,String(i)),depth+1));}const proto=Object.getPrototypeOf(x);need(proto===null||Object.getPrototypeOf(proto)===null,'cached_plain_record');const out=Object.create(null);for(const k of keys){units+=k.length;need(units<=300000,'cached_reference_bound');out[k]=copy(data(x,k),depth+1);}return out;}const out=copy(v);need(new TextEncoder().encode(JSON.stringify(out)).byteLength<=300000,'cached_reference_bound');return out;}
function selected(packet,itemId){need(data(packet,'status')==='cache_only','visited_references_unavailable');const list=data(packet,'references');need(Array.isArray(list)&&list.length<=64,'cached_list_bound');let found=null;for(let i=0;i<list.length;i++){const r=data(list,String(i)),v=data(r,'data');if(data(v,'itemId')===itemId){need(found===null,'duplicate_cached_item');found=r;}}need(found,'item_not_already_visited');return found;}
export async function reviewCachedScenarioReference(packet,itemId,{isCurrent=()=>true}={}){
 need(Number.isSafeInteger(itemId)&&itemId>=1&&itemId<=999999999,'exact_cached_item_id');need(isCurrent()===true,'reference_withdrawn');
 const saved=ownPublic(selected(packet,itemId));need(['validated_cache','retained'].includes(saved.mode),'cached_mode');
 const value=await validatePublicItemReference(saved.data);need(isCurrent()===true,'reference_withdrawn');need(value.itemId===itemId,'cached_item_binding');
 const dto=value.item,source=dto.source,candidates=[];
 function add(kind,row,reference){if(!reference||reference.unitPrice===null||reference.reportedSamples<1||reference.isNearFallback)return;need(candidates.length<256,'cached_candidate_bound');const result=freeze({kind,itemId,name:dto.identity.name,mode:saved.mode,groupKey:row?.groupKey??'item_reference',reportedStats:row?{...row.reportedStats}:null,slotsLeft:row?.slotsLeft??null,upgrades:row?.successfulUpgrades??null,gross:reference.unitPrice,basis:reference.basis,samples:reference.reportedSamples,aggregation:reference.aggregation,capturedAt:value.sourceCapturedAt,sourceObservedAt:source.sourceObservedAt,rawSha256:source.rawBodySha256,dtoSha256:value.dtoSha256,generation:value.projectionGeneration,sourceUrl:source.sourceUrl,reportedWindowDays:value.reportedWindowDays,exactWindowBoundsKnown:false,qualityConstant:false,availabilityKnown:false,lowestListingKnown:false});rows.add(result);candidates.push(result);}
 for(const row of dto.variants.reportedStats){need(Object.keys(row.reportedStats).every(k=>Object.hasOwn(knownStatLabels,k)),'unknown_reported_stat');add('reported_stats',row,row.reference);}
 add('scroll_item_reference',null,dto.aggregate.reference);
 const result=freeze({itemId,name:dto.identity.name,mode:saved.mode,dtoSha256:value.dtoSha256,generation:value.projectionGeneration,capturedAt:value.sourceCapturedAt,candidates});reviews.add(result);return result;
}
export function cachedReviewPresent(packet,review){try{need(reviews.has(review),'owned_cached_review');const r=selected(packet,review.itemId),v=data(r,'data');return ['validated_cache','retained'].includes(data(r,'mode'))&&data(v,'dtoSha256')===review.dtoSha256&&data(v,'projectionGeneration')===review.generation&&data(v,'sourceCapturedAt')===review.capturedAt;}catch{return false;}}
export function admitScenarioReference(row,target,{unknownsAcknowledged=false,mechanicsAcknowledged=false,purpose='gross_sale'}={}){
 need(rows.has(row),'owned_reference_candidate');need(unknownsAcknowledged===true&&mechanicsAcknowledged===true,'manual_unknowns_and_rules_acknowledgment');
 if(purpose==='scroll_cost'){need(row.kind==='scroll_item_reference'&&target.key===String(row.itemId),'scroll_identity_must_equal_rule_key');}
 else{
  need(['gross_sale','buy_cost'].includes(purpose)&&row.kind==='reported_stats','reported_signature_required');need(target.itemId===String(row.itemId)&&typeof target.quality==='string'&&target.quality.length>0,'manual_identity_quality_required');
  need(Number.isSafeInteger(target.slotsLeft)&&target.slotsLeft===row.slotsLeft&&Number.isSafeInteger(target.upgrades)&&target.upgrades===row.upgrades,'reported_slots_or_upgrades_mismatch');
  need(target.stats&&['9','14','16'].every(k=>Object.hasOwn(target.stats,k)&&Number.isSafeInteger(target.stats[k])),'explicit_joint_stats_required');
  for(const [k,v]of Object.entries(row.reportedStats))need(Object.hasOwn(target.stats,k)&&target.stats[k]===v,'reported_stat_missing_or_conflicting');
 }
 const evidence=freeze({kind:'saved_exact_reference_assumption',basis:row.basis,samples:row.samples,capturedAt:row.capturedAt,sourceObservedAt:row.sourceObservedAt,rawSha256:row.rawSha256});
 const provenance=freeze({...row,purpose,modelTarget:JSON.parse(JSON.stringify(target)),unreportedAndUnmodeledStatsUnknownAcknowledged:true,qualityManuallyAssumed:true,serverMechanicsManuallyAssumed:true,referenceIsScenarioAssumption:true,sourceCertifiesExactQuality:false,stockOrFillsInferred:false});
 return freeze({price:row.gross,evidence,provenance});
}
