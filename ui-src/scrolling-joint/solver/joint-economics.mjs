/* Exact finite economic port. Inputs are manual assumptions, never trade proof. */
import*as R from'./joint-rational.mjs';
import*as K from'./joint-mechanics.mjs';
import{admitManualWire,decodeManualBytes,encodedKey}from'./joint-manual-wire.mjs';
const need=(ok,code)=>{if(!ok)throw Error(code);};
const failures=new Set(('rational_intermediate_bound rational_size_bound rational_input_bound owned_rational_required exact_decimal_or_rational_string rational_divide_by_zero rational_sum_bound bounded_rational_probability bounded_nonnegative_rational own_plain_record closed_own_data_fields own_plain_array array_bound_or_extra_fields array_own_data_only stat_vector_record bounded_stat_vector joint_stats_explicit owned_mechanics_context same_mechanics_state_context manual_contract_and_assumptions finite_mechanics_limits entry_mechanical_identity rule_item_eligibility explicit_slot_upgrade_rules gain_stat_missing_from_start rule_not_eligible_for_item attempt_horizon_bound branch_probability_sum destroyed_has_no_item_sale_quote distribution_attempt_bound known_entry_key distribution_evaluated_state_budget distribution_state_budget manual_body_bound invalid_json manual_string_bound manual_tree_bound duplicate_or_bounded_json_key manual_array_bound integer_or_exact_string_required bounded_integer own_plain_data own_data_only own_array_data manual_key_bound closed_manual_schema manual_counts stock_cap_or_unknown full_stat_vector quote_full_identity saved_reference_provenance quote_clock_order finite_policy_bounds node_cap unique_cost_keys scroll_item_eligibility explicit_slot_and_upgrade_rules_required invalid_stat_vector scroll_cost_decimal_lexeme unique_exact_quote explicit_destroyed_residuals state_budget_exceeded projection_header_bound manual_output_bound').split(' '));
const unit=key=>new Map([[key,R.ONE]]);
const flow=(quotes=new Map(),buys=new Map(),scrolls=new Map(),paidSales=R.ZERO)=>({quotes,buys,scrolls,paidSales});
function addFlow(parts){
 const out=flow();for(const[weight,f]of parts){for(const name of['quotes','buys','scrolls'])for(const[key,n]of f[name])out[name].set(key,R.add(out[name].get(key)??R.ZERO,R.mul(weight,n)));out.paidSales=R.add(out.paidSales,R.mul(weight,f.paidSales));}return out;
}
const increment=(counts,index)=>counts.map((n,i)=>n+Number(i===index));
const available=(stock,used)=>stock===null||used<stock;
const sortedStats=s=>Object.entries(s.stats).sort(([a],[b])=>a<b?-1:a>b?1:0);
const pyItem=s=>({identity:s.itemId,quality:s.quality,state:{stats:sortedStats(s),slots_left:s.slotsLeft,upgrades:s.upgrades,used_scrolls:s.used,failures:s.failures,destroyed:s.destroyed}});
const repr=v=>Array.isArray(v)?'('+v.map(repr).join(', ')+(v.length===1?',':'')+')':typeof v==='string'?"'"+v+"'":String(v);
const sorted=(map,meta=null)=>[...map].sort(([a],[b])=>{const x=repr(meta?meta.get(a):a),y=repr(meta?meta.get(b):b);return x<y?-1:x>y?1:0;});

function solveModel(admitted){
 const a=admitted,ctx=K.createJointMechanics(a.wire,{enabled:true}),entries=a.entries.map((e,i)=>({...e,state:ctx.entries[i].state})),rules=a.rules;
 const quotes=new Map(a.quotes.map(q=>[q.encoded,q])),gross=new Map(a.quotes.map(q=>[q.encoded,q.gross])),keyMeta=new Map(a.quotes.map(q=>[q.encoded,q.key]));
 for(const r of a.residuals){const key=['destroyed',r.id],encoded=encodedKey(key);gross.set(encoded,r.gross);keyMeta.set(encoded,key);}
 const entryCosts=new Map(entries.map(e=>[e.key,e.cost])),ruleCosts=new Map(rules.map(r=>[r.key,r.cost])),valueCache=new WeakMap(),cache=new Map(),rows=[];let evaluated=0;
 const netFactor=R.sub(R.ONE,a.fee);
 function value(f){
  if(valueCache.has(f))return valueCache.get(f);let amount=R.ZERO;
  for(const[key,n]of f.quotes)amount=R.add(amount,R.mul(gross.get(key),n));amount=R.sub(R.mul(amount,netFactor),R.mul(a.fixed,f.paidSales));
  for(const[key,n]of f.buys)amount=R.sub(amount,R.mul(entryCosts.get(key),n));for(const[key,n]of f.scrolls)amount=R.sub(amount,R.mul(ruleCosts.get(key),n));valueCache.set(f,amount);return amount;
 }
 function sell(s){
  const key=s.destroyed?encodedKey(['destroyed',s.itemId]):K.priceKey(ctx,s);if(!gross.has(key))return null;
  return flow(unit(key),new Map(),new Map(),!s.destroyed||!R.equal(gross.get(key),R.ZERO)?R.ONE:R.ZERO);
 }
 function solve(s,left,resets,cash,purchases,uses){
  const key=JSON.stringify([K.stateKey(ctx,s),left,resets,R.text(cash),purchases,uses]);if(cache.has(key))return cache.get(key);
  need(++evaluated<=a.limits.nodeCap,'state_budget_exceeded');const index=rows.length<64?rows.push(null)-1:-1,sale=sell(s),candidates=[{action:'sell_stop',flow:sale,unknown:sale===null}];
  if(left){
   for(let i=0;i<rules.length;i++){
    const r=rules[i];if(!r.itemIds.includes(s.itemId)||s.destroyed||s.slotsLeft===0||R.compare(cash,r.cost)<0||!available(r.stock,uses[i]))continue;
    const parts=[[R.ONE,flow(new Map(),new Map(),unit(r.key))]];let missing=false,coverage=false;
    for(const branch of K.transitions(ctx,s,r.key)){
     const future=solve(branch.state,left-1,resets,R.sub(cash,r.cost),purchases,increment(uses,i));missing||=future.flow===null;coverage||=future.unknown;
     if(future.flow!==null)parts.push([branch.probability,future.flow]);
    }
    candidates.push({action:'scroll:'+r.key,flow:missing?null:addFlow(parts),unknown:coverage||missing});
   }
   if(resets)for(let i=0;i<entries.length;i++){
    const e=entries[i];if(R.compare(cash,e.cost)<0||!available(e.stock,purchases[i]))continue;
    const future=solve(e.state,left-1,resets-1,R.sub(cash,e.cost),increment(purchases,i),uses),f=sale===null||future.flow===null?null:addFlow([[R.ONE,sale],[R.ONE,flow(new Map(),unit(e.key))],[R.ONE,future.flow]]);
    candidates.push({action:'sell_rebuy:'+e.key,flow:f,unknown:future.unknown||f===null});
   }
  }
  let selected=null;for(const candidate of candidates)if(candidate.flow!==null&&(selected===null||R.compare(value(candidate.flow),value(selected.flow))>0))selected=candidate;
  const unknown=candidates.some(c=>c.unknown||c.flow===null),result={flow:selected?.flow??null,action:selected?.action??null,unknown};
  if(index>=0)rows[index]={item:pyItem(s),decisionsRemaining:left,resetsRemaining:resets,grossCashRemaining:cash,purchases:[...purchases],scrollsUsed:[...uses],selectedAction:result.action,knownFutureNet:result.flow===null?null:value(result.flow),unknownFeasibleAlternative:unknown,alternatives:candidates.map(c=>[c.action,c.flow===null?null:value(c.flow)]),alternativeCoverageUnknown:candidates.map(c=>[c.action,c.unknown])};
  cache.set(key,result);return result;
 }
 const results=[];
 try{
  for(let i=0;i<entries.length;i++){
   const e=entries[i];if(R.compare(e.cost,a.budget)>0||!available(e.stock,0))continue;
   const future=solve(e.state,a.limits.decisions,a.limits.resets,R.sub(a.budget,e.cost),increment(entries.map(()=>0),i),rules.map(()=>0));
   const f=future.flow===null?null:addFlow([[R.ONE,future.flow],[R.ONE,flow(new Map(),unit(e.key))]]);results.push({entry:e.key,action:future.action,flow:f,knownNet:f===null?null:value(f),unknown:future.unknown});
  }
 }catch(error){return{status:'unavailable',reason:fixedReason(error),evaluated,marketProfitClaim:false};}
 if(!results.length)return{status:'unavailable',reason:'no_affordable_available_entry',evaluated,marketProfitClaim:false};
 let best={entry:null,action:'do_not_enter',flow:flow(),knownNet:R.ZERO,unknown:false};
 for(const result of results)if(result.knownNet!==null&&R.compare(result.knownNet,best.knownNet)>0)best=result;
 const incomplete=results.some(r=>r.unknown),thresholds=[];
 for(const[kind,terms,values,sign,meta]of[['buy',best.flow.buys,entryCosts,R.neg(R.ONE),null],['scroll',best.flow.scrolls,ruleCosts,R.neg(R.ONE),null],['gross_sale',best.flow.quotes,gross,netFactor,keyMeta]]){
  for(const[key,n]of sorted(terms,meta)){
   const slope=R.mul(sign,n);if(!R.equal(slope,R.ZERO))thresholds.push({kind,key:meta?meta.get(key):key,value:R.sub(values.get(key),R.div(best.knownNet,slope)),expectedPolicyQuantity:n});
  }
 }
 return{status:incomplete?'unavailable':'conditional_model',reason:incomplete?'reachable_exact_state_price_missing':null,selectedEntry:best.entry,selectedAction:best.action,optimalExpectedNet:incomplete?null:best.knownNet,bestKnownNet:best.knownNet,entries:results,rows,evaluated,projectionTruncated:evaluated>rows.length,fixedPolicyBreakEven:thresholds,breakEvenScope:'fixed_selected_policy_only_replan_after_price_or_budget_edits',quoteEvidence:a.quotes.map(q=>({key:q.key,gross:q.gross,evidence:q.evidence})),optimizationScope:{decisions:a.limits.decisions,resets:a.limits.resets,stateBudget:a.limits.nodeCap,allTimeOptimum:false},assumptions:{feesVerified:false,realizationAssumed:true,fillProbability:null,turnover:null,timeToSale:null,entryStockCaps:entries.map(e=>e.stock),scrollStockCaps:rules.map(r=>r.stock),unknownStockAssumedObtainable:entries.some(e=>e.stock===null)||rules.some(r=>r.stock===null),saleProceedsReinvested:false,modeledContinuationsNotObservedLedger:true},marketProfitClaim:false,defaultEnabled:false};
}
function fixedReason(error){const reason=typeof error?.message==='string'?error.message:'';return failures.has(reason)?reason:'invalid_manual_scenario';}
function wire(value){
 if(value===null||typeof value!=='object')return value;
 if(typeof value.n==='bigint'&&typeof value.d==='bigint')return R.text(value);
 if(Array.isArray(value))return value.map(wire);return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,wire(v)]));
}
const bytes=object=>new TextEncoder().encode(JSON.stringify(object));
function project(result){
 const out=Object.fromEntries(Object.entries(result).filter(([k])=>!['rows','quoteEvidence','entries','fixedPolicyBreakEven'].includes(k)).map(([k,v])=>[k,wire(v)]));
 out.entries=(result.entries??[]).map(e=>Object.fromEntries(Object.entries(e).filter(([k])=>k!=='flow').map(([k,v])=>[k,wire(v)])));
 Object.assign(out,{rows:[],quoteEvidence:[],fixedPolicyBreakEven:[],projectionTruncated:!!result.projectionTruncated,projectionByteCap:15800});
 for(const[field,cap]of[['fixedPolicyBreakEven',16],['quoteEvidence',16],['rows',64]]){
  for(const row of(result[field]??[]).slice(0,cap)){out[field].push(wire(row));if(bytes(out).length>15800){out[field].pop();out.projectionTruncated=true;break;}}
  if(out[field].length<(result[field]??[]).length)out.projectionTruncated=true;
 }need(bytes(out).length<=15800,'projection_header_bound');return out;
}
function evaluate(input,enabled,decode){
 if(enabled!==true)return bytes({status:'disabled',defaultEnabled:false});
 try{
  const admitted=admitManualWire(decode?decodeManualBytes(input):input),result=solveModel(admitted),out=project(result);
  Object.assign(out,{schemaVersion:1,kind:'private_joint_scrolling_model_result_v1',currency:'mesos',verification:'manual_assumptions_not_market_or_game_rules',websiteIntegrationImplemented:false});
  const raw=bytes(out);need(raw.length<=16384,'manual_output_bound');return raw;
 }catch(error){return bytes({status:'unavailable',reason:fixedReason(error),marketProfitClaim:false});}
}
export function evaluateManualBytes(raw,{enabled=false}={}){return evaluate(raw,enabled,true);}
export function evaluateManualScenario(value,{enabled=false}={}){return evaluate(value,enabled,false);}
export const capability=Object.freeze({kind:'private_finite_joint_economic_model_v1',defaultEnabled:false,horizonMax:24,resetsMax:3,stateCap:12000,inputBytes:65536,outputBytes:16384,websiteIntegrationImplemented:false,sourceOrGameRulesVerified:false,quoteRealizationAssumed:true,globalOptimalPriceFrontier:false});
