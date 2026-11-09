/* Optional joint-state extension only. Legacy ATT module stays byte-exact. */
import{ZERO,ONE,probability,sub,mul,add,equal}from'./joint-rational.mjs';
const contexts=new WeakMap(),states=new WeakMap();
const need=(ok,code)=>{if(!ok)throw Error(code);};
const tag=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,48}$/.test(v);
const integer=(v,max)=>Number.isSafeInteger(v)&&v>=0&&v<=max;
function own(value,keys){
 need(value&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value)),'own_plain_record');
 const d=Object.getOwnPropertyDescriptors(value),names=Reflect.ownKeys(d);
 need(names.length===keys.length&&names.every(n=>typeof n==='string'&&keys.includes(n)&&Object.hasOwn(d[n],'value')&&d[n].enumerable),'closed_own_data_fields');
 return Object.fromEntries(keys.map(n=>[n,d[n].value]));
}
function array(value,min,max){
 need(Array.isArray(value)&&Object.getPrototypeOf(value)===Array.prototype,'own_plain_array');
 const d=Object.getOwnPropertyDescriptors(value),n=d.length?.value;
 need(integer(n,max)&&n>=min&&Reflect.ownKeys(d).length===n+1,'array_bound_or_extra_fields');
 const out=[];for(let i=0;i<n;i++){const v=d[String(i)];need(v&&Object.hasOwn(v,'value')&&v.enumerable,'array_own_data_only');out.push(v.value);}return out;
}
function statVector(value,required=true){
 need(value&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value)),'stat_vector_record');
 const d=Object.getOwnPropertyDescriptors(value),keys=Reflect.ownKeys(d);
 need(keys.length<=16&&keys.every(k=>typeof k==='string'&&/^\d{1,4}$/.test(k)&&Object.hasOwn(d[k],'value')&&d[k].enumerable&&integer(d[k].value,10000)),'bounded_stat_vector');
 if(required)need(['9','14','16'].every(k=>keys.includes(k)),'joint_stats_explicit');
 return Object.freeze(Object.fromEntries(keys.sort().map(k=>[k,d[k].value])));
}
const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const v of Object.values(value))freeze(v);Object.freeze(value);}return value;};
function state(ctx,v){
 const out=Object.freeze({...v,stats:Object.freeze({...v.stats})});states.set(out,ctx);return out;
}
function context(ctx){const v=contexts.get(ctx);need(v,'owned_mechanics_context');return v;}
function liveState(ctx,s){context(ctx);need(states.get(s)===ctx,'same_mechanics_state_context');return s;}

/** Accepts the EXISTING parsed manual wire envelope, but admits MECHANICS ONLY.
 * Quotes, fees, money, stock and economic feasibility require the next stage.
 * Never treat this local brand as source, game-rule or quote authority.
 */
export function createJointMechanics(value,{enabled=false}={}){
 if(enabled!==true)return Object.freeze({status:'disabled',defaultEnabled:false});
 const root=own(value,['schemaVersion','kind','currency','acknowledged','entries','scrolls','quotes','grossBudget','fees','destroyedResiduals','limits']);
 need(root.schemaVersion===1&&root.kind==='private_joint_scrolling_manual_scenario_v1'&&root.currency==='mesos'&&root.acknowledged===true,'manual_contract_and_assumptions');
 const entryRows=array(root.entries,1,4),ruleRows=array(root.scrolls,1,4),entries=[],rules=[],entryKeys=new Set(),ids=new Set(),ruleKeys=new Set();
 const limits=own(root.limits,['decisions','resets','nodeCap']);need(integer(limits.decisions,24)&&integer(limits.resets,3)&&integer(limits.nodeCap,12000)&&limits.nodeCap>0,'finite_mechanics_limits');
 for(const value of entryRows){
  const r=own(value,['key','itemId','quality','stats','slotsLeft','upgrades','cost','stock']);
  need(tag(r.key)&&!entryKeys.has(r.key)&&tag(r.itemId)&&tag(r.quality)&&integer(r.slotsLeft,10)&&integer(r.upgrades,100),'entry_mechanical_identity');
  entryKeys.add(r.key);ids.add(r.itemId);entries.push({key:r.key,itemId:r.itemId,quality:r.quality,stats:statVector(r.stats),slotsLeft:r.slotsLeft,upgrades:r.upgrades,used:0,failures:0,destroyed:false});
 }
 for(const value of ruleRows){
  const r=own(value,['key','itemIds','success','gains','destroyGivenFailure','failureUsesSlot','upgradeDeltaSuccess','upgradeDeltaFailure','cost','stock']);
  const itemIds=array(r.itemIds,1,4);need(tag(r.key)&&!ruleKeys.has(r.key)&&itemIds.every(tag)&&new Set(itemIds).size===itemIds.length&&itemIds.every(i=>ids.has(i)),'rule_item_eligibility');
  need(typeof r.failureUsesSlot==='boolean'&&integer(r.upgradeDeltaSuccess,10)&&integer(r.upgradeDeltaFailure,10),'explicit_slot_upgrade_rules');
  const gains=statVector(r.gains,false);
  for(const e of entries)if(itemIds.includes(e.itemId))need(Object.keys(gains).every(k=>Object.hasOwn(e.stats,k)),'gain_stat_missing_from_start');
  rules.push(freeze({key:r.key,itemIds,success:probability(r.success),gains,destroyGivenFailure:probability(r.destroyGivenFailure),failureUsesSlot:r.failureUsesSlot,upgradeDeltaSuccess:r.upgradeDeltaSuccess,upgradeDeltaFailure:r.upgradeDeltaFailure}));ruleKeys.add(r.key);
 }
 const ctx={status:'manual_mechanics_only',defaultEnabled:false,economicInputsAdmitted:false,sourceOrGameRulesVerified:false,limits:freeze(limits)};
 contexts.set(ctx,{rules:new Map(rules.map(r=>[r.key,r]))});
 ctx.entries=Object.freeze(entries.map(e=>Object.freeze({key:e.key,state:state(ctx,Object.fromEntries(Object.entries(e).filter(([k])=>k!=='key')))})));ctx.rules=Object.freeze(rules);return Object.freeze(ctx);
}

// One joint branch-state builder supplies success, failed and destroyed paths.
// It changes only explicit manual gains/rules, never applies a built-in game table.
function branch(ctx,s,r,success,destroyed=false){
 const stats={...s.stats};if(success)for(const[k,gain]of Object.entries(r.gains))stats[k]+=gain;
 return state(ctx,{itemId:s.itemId,quality:s.quality,stats,slotsLeft:s.slotsLeft-(success?1:Number(r.failureUsesSlot)),upgrades:s.upgrades+(success?r.upgradeDeltaSuccess:r.upgradeDeltaFailure),used:s.used+1,failures:s.failures+Number(!success),destroyed});
}
export function transitions(ctx,s,key){
 liveState(ctx,s);const r=context(ctx).rules.get(key);need(r&&r.itemIds.includes(s.itemId),'rule_not_eligible_for_item');
 if(s.destroyed||s.slotsLeft===0)return Object.freeze([]);
 need(s.used<24,'attempt_horizon_bound');
 const failure=sub(ONE,r.success),out=[];
 for(const[p,success,dead]of[[r.success,true,false],[mul(failure,sub(ONE,r.destroyGivenFailure)),false,false],[mul(failure,r.destroyGivenFailure),false,true]])if(!equal(p,ZERO))out.push(Object.freeze({probability:p,state:branch(ctx,s,r,success,dead)}));
 need(equal(out.reduce((n,row)=>add(n,row.probability),ZERO),ONE),'branch_probability_sum');return Object.freeze(out);
}
export function priceKey(ctx,s){liveState(ctx,s);need(!s.destroyed,'destroyed_has_no_item_sale_quote');return JSON.stringify([s.itemId,s.quality,Object.entries(s.stats).sort(([a],[b])=>a<b?-1:a>b?1:0),s.slotsLeft,s.upgrades]);}
export function stateKey(ctx,s){liveState(ctx,s);return JSON.stringify([s.itemId,s.quality,Object.entries(s.stats).sort(([a],[b])=>a<b?-1:a>b?1:0),s.slotsLeft,s.upgrades,s.used,s.failures,s.destroyed]);}
export function distribution(ctx,entryKey,ruleKey,attempts,stopAfterFailures=null){
 context(ctx);need(integer(attempts,24)&&attempts<=ctx.limits.decisions&& (stopAfterFailures===null||integer(stopAfterFailures,24)&&stopAfterFailures>0),'distribution_attempt_bound');
 const start=ctx.entries.find(e=>e.key===entryKey)?.state;need(start,'known_entry_key');let points=new Map([[stateKey(ctx,start),{state:start,probability:ONE}]]),evaluated=0;
 for(let step=0;step<attempts;step++){
  const next=new Map();for(const point of points.values()){
   need(++evaluated<=ctx.limits.nodeCap,'distribution_evaluated_state_budget');
   const s=point.state,branches=s.destroyed||s.slotsLeft===0||stopAfterFailures!==null&&s.failures>=stopAfterFailures?[{state:s,probability:ONE}]:transitions(ctx,s,ruleKey);
   for(const row of branches){const k=stateKey(ctx,row.state),p=mul(point.probability,row.probability),old=next.get(k);next.set(k,{state:row.state,probability:old?add(old.probability,p):p});need(next.size<=12000,'distribution_state_budget');}
  }points=next;
 }
 return Object.freeze([...points.values()].map(freeze));
}
export function toWireState(ctx,s){liveState(ctx,s);return freeze({itemId:s.itemId,quality:s.quality,stats:{...s.stats},slotsLeft:s.slotsLeft,upgrades:s.upgrades,used:s.used,failures:s.failures,destroyed:s.destroyed});}
export const capability=Object.freeze({kind:'private_joint_manual_mechanics_only_v1',defaultEnabled:false,admittedEconomicRecurrence:false,quoteOrSourceAuthority:false,probabilityEncoding:'exact_normalized_rational'});
