import {createJointMechanics,transitions,priceKey,stateKey,toWireState} from './solver/joint-mechanics.mjs';
import {parse,div,rational,text} from './solver/joint-rational.mjs';
import {admitManualWire} from './solver/joint-manual-wire.mjs';

const fail=code=>{throw Error(code);};
export const freeze=value=>{if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const v of Object.values(value))freeze(v);Object.freeze(value);}return value;};
export function integer(value,max){if(typeof value!=='string'||!/^\d{1,5}$/.test(value)||!Number.isSafeInteger(+value)||+value>max)fail('explicit_integer_required');return +value;}
export const stock=value=>value.trim()===''?null:integer(value,100);
export function percent(value){if(typeof value!=='string'||value.trim()==='')fail('explicit_percentage_required');return text(div(parse(value.trim()),rational(100n)));}
export function stats(rows){const out={};if(rows.length>16)fail('stat_row_bound');for(const [code,value]of rows){if(!/^\d{1,4}$/.test(code)||Object.hasOwn(out,code))fail('unique_stat_code_required');out[code]=integer(value,10000);}if(!['9','14','16'].every(k=>Object.hasOwn(out,k)))fail('joint_stats_explicit');return out;}
export const quoteKey=row=>JSON.stringify([row.itemId,row.quality,Object.entries(row.stats).sort(([a],[b])=>a<b?-1:a>b?1:0),row.slotsLeft,row.upgrades]);
export function envelope({entries,scrolls,quotes=[],budget='',feePercent='',fixedFee='',residuals=[],decisions='5',resets='0',acknowledged=false}){
 if(entries.length<1||entries.length>4||scrolls.length<1||scrolls.length>4||quotes.length>256)fail('row_bound');
 return {schemaVersion:1,kind:'private_joint_scrolling_manual_scenario_v1',currency:'mesos',acknowledged,entries,scrolls,quotes,grossBudget:budget,fees:{rate:percent(feePercent),fixed:fixedFee},destroyedResiduals:residuals,limits:{decisions:integer(decisions,24),resets:integer(resets,3),nodeCap:12000}};
}
/** Mechanical over-approximation, never a source quote or budget/stock claim.
 * Refuse rather than truncate; resets reuse start states and add no new price key. */
export function generateQuoteRows(wire){
 const ctx=createJointMechanics({...wire,acknowledged:true},{enabled:true}),quotes=new Map(),seen=new Set(),queue=ctx.entries.map(x=>[x.state,0]);let at=0;
 while(at<queue.length){const [s,depth]=queue[at++],sk=stateKey(ctx,s)+'|'+depth;if(seen.has(sk))continue;seen.add(sk);if(seen.size>12000)fail('quote_generation_state_budget');const w=toWireState(ctx,s);if(w.destroyed)continue;
  const key=priceKey(ctx,s);if(!quotes.has(key)){if(quotes.size===256)fail('quote_grid_bound_256');quotes.set(key,freeze({itemId:w.itemId,quality:w.quality,stats:{...w.stats},slotsLeft:w.slotsLeft,upgrades:w.upgrades,gross:'',evidence:{kind:'manual'}}));}
  if(depth>=ctx.limits.decisions||w.slotsLeft===0)continue;
  for(const rule of ctx.rules)if(rule.itemIds.includes(w.itemId))for(const row of transitions(ctx,s,rule.key))queue.push([row.state,depth+1]);
  if(queue.length>36000)fail('quote_generation_state_budget');
 }
 return Object.freeze([...quotes.values()]);
}
export function admittedSnapshot(wire){const captured=admitManualWire(wire).wire,raw=new TextEncoder().encode(JSON.stringify(captured));if(raw.byteLength>65536)fail('manual_body_bound');return captured;}
/** Presentation only: exact signed BigInt fraction retained in title. */
export function money(value){if(typeof value!=='string'||!/^(-?\d+)(?:\/(\d+))?$/.test(value)||value.length>5000)return {display:'Unknown',exact:'Unknown'};const [n0,d0='1']=value.split('/'),n=BigInt(n0),d=BigInt(d0);if(d<=0n)return {display:'Unknown',exact:'Unknown'};const sign=n<0n?'-':'',a=n<0n?-n:n,scaled=(a*100n+d/2n)/d,whole=(scaled/100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g,','),fraction=(scaled%100n).toString().padStart(2,'0');return {display:sign+whole+(fraction==='00'?'':'.'+fraction),exact:value};}
