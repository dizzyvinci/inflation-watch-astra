/* Pure manual wire decoder/admission. Never origin, game-rule or source proof. */
import{amount,probability,ONE,compare}from'./joint-rational.mjs';
const need=(ok,code)=>{if(!ok)throw Error(code);};
const integer=(v,max)=>Number.isSafeInteger(v)&&v>=0&&v<=max;
const tag=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,48}$/.test(v);
export const INPUT_CAP=65536;
// Same admitted public-contract pattern: call captured typed-array intrinsics,
// not shadowable instance properties; own only the admitted view before decode.
const U8=Uint8Array,typed=Object.getPrototypeOf(U8.prototype),viewTag=Object.getOwnPropertyDescriptor(typed,Symbol.toStringTag).get,viewLength=Object.getOwnPropertyDescriptor(typed,'byteLength').get,viewOffset=Object.getOwnPropertyDescriptor(typed,'byteOffset').get,viewBuffer=Object.getOwnPropertyDescriptor(typed,'buffer').get,bufferLength=Object.getOwnPropertyDescriptor(ArrayBuffer.prototype,'byteLength').get,copyView=U8.prototype.set;
function ownManualBytes(raw){
 try{
  need(viewTag.call(raw)==='Uint8Array','manual_body_bound');
  const n=viewLength.call(raw),offset=viewOffset.call(raw),buffer=viewBuffer.call(raw),backing=bufferLength.call(buffer);
  need(integer(n,INPUT_CAP)&&n>0&&Number.isSafeInteger(offset)&&offset>=0&&Number.isSafeInteger(backing)&&offset+n<=backing,'manual_body_bound');
  const out=new U8(n);copyView.call(out,raw);
  need(viewLength.call(raw)===n&&viewOffset.call(raw)===offset&&viewBuffer.call(raw)===buffer&&bufferLength.call(buffer)===backing,'manual_body_bound');return out;
 }catch{throw Error('manual_body_bound');}
}
export function decodeManualBytes(raw){
 raw=ownManualBytes(raw);
 need(!(raw[0]===239&&raw[1]===187&&raw[2]===191),'invalid_json');
 const source=new TextDecoder('utf-8',{fatal:true}).decode(raw);let at=0,count=0;
 const space=()=>{while(/[\x20\t\r\n]/.test(source[at]??'x'))at++;};
 function string(){
  need(source[at]==='"','invalid_json');const start=at++;let escaped=false;
  for(;at<source.length;at++){
   const c=source[at];if(c==='"'&&!escaped){at++;const value=JSON.parse(source.slice(start,at));need(value.length<=256,'manual_string_bound');return value;}
   if(c==='\\'&&!escaped)escaped=true;else escaped=false;
  }throw Error('invalid_json');
 }
 function value(depth=0){
  need(++count<=16000&&depth<=12,'manual_tree_bound');space();const c=source[at];
  if(c==='"')return string();
  if(c==='{'){
   at++;space();const out=Object.create(null),keys=new Set();if(source[at]==='}'){at++;return out;}
   while(true){space();const key=string();need(key.length<=48&&!keys.has(key),'duplicate_or_bounded_json_key');keys.add(key);space();need(source[at++]===':','invalid_json');out[key]=value(depth+1);space();const next=source[at++];if(next==='}')return out;need(next===',','invalid_json');}
  }
  if(c==='['){
   at++;space();const out=[];if(source[at]===']'){at++;return out;}
   while(true){need(out.length<256,'manual_array_bound');out.push(value(depth+1));space();const next=source[at++];if(next===']')return out;need(next===',','invalid_json');}
  }
  for(const[word,result]of[['true',true],['false',false],['null',null]])if(source.startsWith(word,at)){at+=word.length;return result;}
  const token=source.slice(at).match(/^-?(?:0|[1-9]\d*)/);need(token&&token[0].length<=17,'integer_or_exact_string_required');at+=token[0].length;
  const n=Number(token[0]);need(Number.isSafeInteger(n),'bounded_integer');return n;
 }
 const out=value();space();need(at===source.length,'invalid_json');return out;
}
function capture(value){
 let count=0;
 function clone(v,depth=0){
  need(++count<=16000&&depth<=12,'manual_tree_bound');
  if(v===null||typeof v==='boolean'||typeof v==='number'&&Number.isSafeInteger(v))return v;
  if(typeof v==='string'){need(v.length<=256,'manual_string_bound');return v;}
  need(v&&typeof v==='object','integer_or_exact_string_required');
  const array=Array.isArray(v);need(Object.getPrototypeOf(v)===(array?Array.prototype:Object.prototype)||!array&&Object.getPrototypeOf(v)===null,'own_plain_data');
  const d=Object.getOwnPropertyDescriptors(v),keys=Reflect.ownKeys(d);need(keys.length<=257&&keys.every(k=>typeof k==='string'&&Object.hasOwn(d[k],'value')),'own_data_only');
  if(array){const n=d.length?.value;need(integer(n,256)&&keys.length===n+1,'manual_array_bound');const out=[];for(let i=0;i<n;i++){need(d[i]&&d[i].enumerable,'own_array_data');out.push(clone(d[i].value,depth+1));}return out;}
  const out=Object.create(null);for(const k of keys){need(k.length<=48&&d[k].enumerable,'manual_key_bound');out[k]=clone(d[k].value,depth+1);}return out;
 }return clone(value);
}
const exact=(v,fields)=>need(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===fields.length&&fields.every(k=>Object.hasOwn(v,k)),'closed_manual_schema');
const array=(v,min,max)=>{need(Array.isArray(v)&&v.length>=min&&v.length<=max,'manual_counts');return v;};
const stock=v=>need(v===null||integer(v,100),'stock_cap_or_unknown');
const freeze=v=>{if(v&&typeof v==='object'&&!Object.isFrozen(v)){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v;};
function stats(v){
 need(v&&typeof v==='object'&&!Array.isArray(v),'full_stat_vector');const keys=Object.keys(v);
 need(keys.length<=16&&keys.every(k=>/^\d{1,4}$/.test(k)&&integer(v[k],10000))&&['9','14','16'].every(k=>keys.includes(k)),'joint_stats_explicit');return Object.fromEntries(keys.sort().map(k=>[k,v[k]]));
}
function identity(v,ids=null){
 need(tag(v.itemId)&&tag(v.quality)&&integer(v.slotsLeft,10)&&integer(v.upgrades,100)&&(!ids||ids.has(v.itemId)),'quote_full_identity');v.stats=stats(v.stats);return v;
}
export function tupleKey(v){return[v.itemId,v.quality,Object.entries(v.stats).sort(([a],[b])=>a<b?-1:a>b?1:0),v.slotsLeft,v.upgrades];}
export const encodedKey=key=>JSON.stringify(key);
function instant(v){
 const m=typeof v==='string'&&v.match(/^(20\d\d)-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:\.(\d{1,6}))?(?:Z|\+00:00)$/);need(m,'saved_reference_provenance');
 const[y,mo,d,h,mi,s]=m.slice(1,7).map(Number);need(mo>=1&&mo<=12&&d>=1&&d<=31&&h<=23&&mi<=59&&s<=59,'saved_reference_provenance');const stamp=Date.UTC(y,mo-1,d,h,mi,s),date=new Date(stamp);
 need(date.getUTCFullYear()===y&&date.getUTCMonth()===mo-1&&date.getUTCDate()===d,'saved_reference_provenance');return BigInt(stamp)*1000n+BigInt((m[7]??'').padEnd(6,'0'));
}
function evidence(e){
 if(e?.kind==='manual'){exact(e,['kind']);return{kind:'manual',basis:'assumption',samples:null,captured_at:null,source_observed_at:null,raw_sha256:null};}
 exact(e,['kind','basis','samples','capturedAt','sourceObservedAt','rawSha256']);need(e.kind==='saved_exact_reference_assumption'&&['sold','listed'].includes(e.basis)&&integer(e.samples,1000000000)&&typeof e.rawSha256==='string'&&/^[a-f0-9]{64}$/.test(e.rawSha256),'saved_reference_provenance');
 const capture=instant(e.capturedAt);if(e.sourceObservedAt!==null)need(instant(e.sourceObservedAt)<=capture,'quote_clock_order');
 return{kind:e.kind,basis:e.basis,samples:e.samples,captured_at:e.capturedAt,source_observed_at:e.sourceObservedAt,raw_sha256:e.rawSha256};
}
export function admitManualWire(input){
 const root=capture(input);exact(root,['schemaVersion','kind','currency','acknowledged','entries','scrolls','quotes','grossBudget','fees','destroyedResiduals','limits']);
 need(root.schemaVersion===1&&root.kind==='private_joint_scrolling_manual_scenario_v1'&&root.currency==='mesos'&&root.acknowledged===true,'manual_contract_and_assumptions');
 array(root.entries,1,4);array(root.scrolls,1,4);array(root.quotes,0,256);array(root.destroyedResiduals,1,4);exact(root.fees,['rate','fixed']);exact(root.limits,['decisions','resets','nodeCap']);
 need(integer(root.limits.decisions,24)&&integer(root.limits.resets,3),'finite_policy_bounds');need(integer(root.limits.nodeCap,12000)&&root.limits.nodeCap>0,'node_cap');
 const budget=amount(root.grossBudget),fee=amount(root.fees.rate),fixed=amount(root.fees.fixed);need(compare(fee,ONE)<0,'finite_policy_bounds');
 const ids=new Set(),entryKeys=new Set(),ruleKeys=new Set(),quoteKeys=new Set(),entries=[],rules=[],quotes=[],residuals=[];
 for(const e of root.entries){exact(e,['key','itemId','quality','stats','slotsLeft','upgrades','cost','stock']);identity(e);need(tag(e.key)&&!entryKeys.has(e.key),'unique_cost_keys');stock(e.stock);entryKeys.add(e.key);ids.add(e.itemId);entries.push({key:e.key,cost:amount(e.cost),stock:e.stock});}
 for(const r of root.scrolls){
  exact(r,['key','itemIds','success','gains','destroyGivenFailure','failureUsesSlot','upgradeDeltaSuccess','upgradeDeltaFailure','cost','stock']);
  need(tag(r.key)&&!ruleKeys.has(r.key),'unique_cost_keys');array(r.itemIds,1,4);need(new Set(r.itemIds).size===r.itemIds.length&&r.itemIds.every(i=>tag(i)&&ids.has(i)),'scroll_item_eligibility');
  probability(r.success);probability(r.destroyGivenFailure);need(typeof r.failureUsesSlot==='boolean'&&integer(r.upgradeDeltaSuccess,10)&&integer(r.upgradeDeltaFailure,10),'explicit_slot_and_upgrade_rules_required');
  need(r.gains&&typeof r.gains==='object'&&!Array.isArray(r.gains)&&Object.keys(r.gains).length<=16&&Object.entries(r.gains).every(([k,v])=>/^\d{1,4}$/.test(k)&&integer(v,10000)),'invalid_stat_vector');
  for(const e of root.entries)if(r.itemIds.includes(e.itemId))need(Object.keys(r.gains).every(k=>Object.hasOwn(e.stats,k)),'gain_stat_missing_from_start');
  need(typeof r.cost==='string'&&!r.cost.includes('/'),'scroll_cost_decimal_lexeme');stock(r.stock);rules.push({key:r.key,cost:amount(r.cost),stock:r.stock,itemIds:[...r.itemIds]});ruleKeys.add(r.key);
 }
 for(const q of root.quotes){exact(q,['itemId','quality','stats','slotsLeft','upgrades','gross','evidence']);identity(q,ids);const key=tupleKey(q),encoded=encodedKey(key);need(!quoteKeys.has(encoded),'unique_exact_quote');quoteKeys.add(encoded);quotes.push({key,encoded,gross:amount(q.gross),evidence:evidence(q.evidence)});}
 const residualIds=new Set();for(const r of root.destroyedResiduals){exact(r,['itemId','gross']);need(tag(r.itemId)&&ids.has(r.itemId)&&!residualIds.has(r.itemId),'explicit_destroyed_residuals');residualIds.add(r.itemId);residuals.push({id:r.itemId,gross:amount(r.gross)});}need(residualIds.size===ids.size,'explicit_destroyed_residuals');
 return freeze({wire:root,budget,fee,fixed,entries,rules,quotes,residuals,limits:root.limits,sourceOrGameRulesVerified:false});
}
