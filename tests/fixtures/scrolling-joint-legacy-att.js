(() => {
  'use strict';
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const money = value => finite(value) && value >= 0;
  const whole = value => Number.isSafeInteger(value) && value >= 0;
  const priceKey = state => JSON.stringify([Object.entries(state.stats).sort(([a],[b])=>a.localeCompare(b)),state.slots,state.upgrades]);
  const stateKey = state => JSON.stringify([priceKey(state),state.used,state.failures,state.destroyed]);
  const fail = code => { throw Error(code); };
  function validate(start, rules) {
    if (!start || !whole(start.slots) || start.slots > 10 || !whole(start.upgrades) || !start.stats || !Object.keys(start.stats).length || Object.entries(start.stats).some(([key,value])=>!/^\d{1,4}$/.test(key)||!whole(value)||value>10000)) fail('invalid_start_state');
    if (!rules.length || rules.length>4 || new Set(rules.map(rule=>rule.key)).size!==rules.length) fail('invalid_scroll_choices');
    for (const rule of rules) {
      if (!finite(rule.p) || rule.p<0 || rule.p>1 || !finite(rule.boom) || rule.boom<0 || rule.boom>1 || typeof rule.failureUsesSlot!=='boolean' || !money(rule.cost) || !whole(rule.gain) || rule.gain>10 || !Object.hasOwn(start.stats,'16')) fail('explicit_scroll_rules_required');
    }
  }
  function transitions(state, rule) {
    if (state.destroyed || state.slots===0) return [];
    const used=state.used+1,success={...state,stats:{...state.stats,16:state.stats[16]+rule.gain},slots:state.slots-1,upgrades:state.upgrades+1,used};
    const failure={...state,stats:{...state.stats},slots:state.slots-Number(rule.failureUsesSlot),failures:state.failures+1,used};
    return [[rule.p,success],[(1-rule.p)*(1-rule.boom),failure],[(1-rule.p)*rule.boom,{...failure,destroyed:true}]].filter(([probability])=>probability>0);
  }
  function initial(start) { return {...start,stats:{...start.stats},used:0,failures:0,destroyed:false}; }
  function distribution(start, rule, attempts=5, stopAfterFailures=null) {
    validate(start,[rule]);if(!whole(attempts)||attempts>10||stopAfterFailures!==null&&(!whole(stopAfterFailures)||stopAfterFailures<1||stopAfterFailures>10))fail('invalid_attempt_bound');
    let states=new Map([[stateKey(initial(start)),{state:initial(start),probability:1}]]);
    for(let step=0;step<attempts;step++){
      const next=new Map();
      for(const {state,probability} of states.values()){
        const branches=state.destroyed||state.slots===0||stopAfterFailures!==null&&state.failures>=stopAfterFailures?[[1,state]]:transitions(state,rule);
        for(const [chance,outcome] of branches){const key=stateKey(outcome),previous=next.get(key);next.set(key,{state:outcome,probability:(previous?.probability||0)+probability*chance});}
      }
      states=next;
    }
    return [...states.values()].sort((a,b)=>Number(a.state.destroyed)-Number(b.state.destroyed)||a.state.stats[16]-b.state.stats[16]||a.state.slots-b.state.slots);
  }
  function reachable(start,rules,decisions){
    validate(start,rules);if(!whole(decisions)||decisions>6)fail('decision_bound');
    const result=new Map([[priceKey(initial(start)),initial(start)]]);let frontier=[initial(start)];
    for(let depth=0;depth<decisions;depth++){
      const next=new Map();for(const state of frontier)for(const rule of rules)for(const [,outcome]of transitions(state,rule)){
        if(outcome.destroyed)continue;const key=priceKey(outcome);result.set(key,outcome);next.set(key,outcome);
        if(result.size>1200)fail('state_budget_exceeded');
      }frontier=[...next.values()];
    }return[...result.values()];
  }
  function inputsValid(inputs){return inputs?.acknowledged===true&&['baseCost','fee','fixedFee','residual'].every(key=>money(inputs[key]))&&inputs.fee<1;}
  function sale(state,prices,inputs){const gross=state.destroyed?inputs.residual:prices.get(priceKey(state));return money(gross)?gross*(1-inputs.fee)-(state.destroyed&&gross===0?0:inputs.fixedFee):null;}
  function value(outcomes,prices,rule,inputs){
    if(!inputsValid(inputs))return{status:'unavailable',reason:'Explicit assumptions, costs, fees and residual required.'};
    let proceeds=0,spending=0,missing=0;
    for(const {state,probability}of outcomes){const amount=sale(state,prices,inputs);if(amount===null)missing++;else proceeds+=probability*amount;spending+=probability*state.used*rule.cost;}
    return missing?{status:'unavailable',reason:`${missing} exact terminal state value(s) missing.`,missing}:{status:'conditional',net:proceeds-inputs.baseCost-spending,proceeds,spending};
  }
  function optimize(start,rules,prices,inputs){
    validate(start,rules);
    if(!inputsValid(inputs)||!money(inputs.budget)||!whole(inputs.decisions)||inputs.decisions>6||!whole(inputs.resets)||inputs.resets>3||inputs.budget<inputs.baseCost)return{status:'unavailable',reason:'Finite budget, decisions and resets required.'};
    // Only budget feasibility uses micro-unit rounding, bounded to safe integers.
    const micros=value=>{const n=Math.round(value*1e6);if(!Number.isSafeInteger(n))fail('budget_precision_bound');return n;};
    const costs=new Map(rules.map(rule=>[rule.key,micros(rule.cost)])),base=micros(inputs.baseCost),cache=new Map();let evaluated=0;
    const solve=(state,left,resets,cash)=>{
      const key=JSON.stringify([stateKey(state),left,resets,cash]);if(cache.has(key))return cache.get(key);if(++evaluated>12000)fail('state_budget_exceeded');
      const candidates=[{action:'Sell / keep residual',amount:sale(state,prices,inputs),unknown:false}];
      if(left){
        for(const rule of rules){if(state.destroyed||!state.slots||cash<costs.get(rule.key))continue;let amount=-rule.cost,unknown=false;
          for(const[chance,outcome]of transitions(state,rule)){const future=solve(outcome,left-1,resets,cash-costs.get(rule.key));if(future.unknown||future.amount===null)unknown=true;else amount+=chance*future.amount;}
          candidates.push({action:'Continue · '+rule.name,amount:unknown?null:amount,unknown});
        }
        if(resets&&cash>=base){const old=sale(state,prices,inputs),future=solve(initial(start),left-1,resets-1,cash-base);candidates.push({action:'Sell / reset to starting item',amount:old===null||future.unknown||future.amount===null?null:old-inputs.baseCost+future.amount,unknown:future.unknown});}
      }
      const known=candidates.filter(candidate=>candidate.amount!==null).sort((a,b)=>b.amount-a.amount),best=known[0]||{action:null,amount:null};
      const result={...best,unknown:candidates.some(candidate=>candidate.amount===null||candidate.unknown)};cache.set(key,result);return result;
    };
    const best=solve(initial(start),inputs.decisions,inputs.resets,micros(inputs.budget)-base);
    return{status:best.unknown?'unavailable':'conditional',reason:best.unknown?'Reachable alternatives lack exact state prices; no optimum claimed.':null,
      action:best.action,net:best.unknown||best.amount===null?null:best.amount-inputs.baseCost,bestKnownNet:best.amount===null?null:best.amount-inputs.baseCost,evaluated};
  }
  window.AstraPrivateScrolling=Object.freeze({priceKey,distribution,reachable,value,optimize});
})();
