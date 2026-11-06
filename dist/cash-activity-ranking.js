(()=>{'use strict';if(window.AstraCashActivity)return;
const finite=v=>typeof v==='number'&&Number.isFinite(v),count=v=>Number.isSafeInteger(v)&&v>0;
const state={mode:'value',minimumCount:0},controls=new Set();
const getState=()=>Object.freeze({...state});
const tie=(a,b)=>String(a.name||'').localeCompare(String(b.name||''))||String(a.slug||'').localeCompare(String(b.slug||''));
function cohort(model){
 if(model?.referenceOnly)return{available:false,kind:'fixed_basket',label:'Reference-week inflation dials keep their frozen item selection and weights; activity ranking does not apply'};
 if(model?.api===true)return{available:model.days===3,kind:'api_3day',label:'API reported 3-day count window (exact bounds unknown)'};
 if(!model||!Array.isArray(model.rows))return{available:false,kind:'unknown',label:'Count window unavailable'};
 if(!model.rolling)return{available:Number.isSafeInteger(model.days)&&model.days>0,kind:'daily',days:model.days,label:`Selected ${model.days}-source-day window · only complete qualifying-day coverage`};
 const candidates=model.rows.filter(r=>r&&!r.missing&&!r.referenceExclusion&&finite(r.referenceWeight)&&r.referenceWeight>0&&finite(r.rate)&&r.rate>0);
 const windows=new Set(candidates.map(r=>r.windowDays));
 const available=windows.size===1&&finite([...windows][0])&&[...windows][0]>0;
 return{available,kind:'rolling',days:available?[...windows][0]:null,label:available?`Common ${[...windows][0]}-day scanner count window`:'Activity unavailable: rolling item count windows differ or are unknown'};
}
function rank(input,{side='sell',rateKey='rate',model,selection=getState()}={}){
 const rows=Array.isArray(input)?input:[],scope=cohort(model),minimum=Number.isSafeInteger(selection.minimumCount)&&selection.minimumCount>=0?selection.minimumCount:0,active=selection.mode==='activity';
 if(!active&&minimum===0)return{rows:rows.slice(),scope,active:false,orderingApplied:false,excluded:0,status:'value',note:''};
 if(!scope.available)return{rows:[],scope,active,orderingApplied:true,excluded:rows.length,status:'unavailable',note:scope.label+'; choose Value ranking to see the dated raw ordering.'};
 const eligible=rows.filter(r=>r&&!r.missing&&!r.referenceExclusion&&finite(r.referenceWeight)&&r.referenceWeight>0&&count(r.quantity)&&r.quantity>=minimum&&(scope.kind!=='daily'||r.windowDays===scope.days));
 const result=active?eligible.filter(r=>finite(r[rateKey])&&r[rateKey]>0).map(r=>{
  const factor=r.quantity/(r.quantity+20),raw=side==='buy'?factor/r[rateKey]:r[rateKey]*factor;
  return{...r,activityFactor:factor,activityRawScore:finite(raw)&&raw>0?raw:null};
 }).filter(r=>r.activityRawScore!==null):eligible.filter(r=>finite(r[rateKey])).sort((a,b)=>(side==='buy'?a[rateKey]-b[rateKey]:b[rateKey]-a[rateKey])||tie(a,b));
 if(active){const max=Math.max(0,...result.map(r=>r.activityRawScore));for(const r of result)r.activityScore=100*(r.activityRawScore/max);result.sort((a,b)=>b.activityRawScore-a.activityRawScore||tie(a,b));}
 return{rows:result,scope,active,orderingApplied:true,excluded:rows.length-result.length,status:active?'activity':'minimum_count',note:active?'Activity-adjusted ordering; actual displayed rates and reference are unchanged.':'Reported-count filter; raw value order remains.'};
}
function explain(scope){return`Optional heuristic for ${scope?.label||'this single count window'}. Factor = n / (n + 20), where n is reported source sales count. Sell score = selected mesos/NX rate × factor; buy score = factor ÷ selected positive rate. Scores are rescaled to 0–100 within this cohort only. This trades some raw value for more recorded activity; 20 is an arbitrary transparent tuning choice, not statistical confidence. Counts are not physical units, verified trades, current stock or a liquidity guarantee. Captures are never summed. Missing counts and nonpositive fee-adjusted rates are excluded, not treated as zero. Scores across different windows/sources are not comparable.`;}
function setState(next){if(!next||!['value','activity'].includes(next.mode)||!Number.isSafeInteger(next.minimumCount)||next.minimumCount<0||next.minimumCount>Number.MAX_SAFE_INTEGER)return false;state.mode=next.mode;state.minimumCount=next.minimumCount;for(const c of controls){c.mode.value=state.mode;c.minimum.value=String(state.minimumCount);}document.dispatchEvent(new CustomEvent('astracashactivitychange',{detail:getState()}));return true;}
function configure(host,model){const box=host?.querySelector(':scope > .cash-activity-controls');if(!box)return;const scope=cohort(model);box.querySelector('[data-cash-activity-mode] option[value=activity]').disabled=!scope.available;box.querySelector('.cash-activity-window').textContent=scope.label+(scope.available?' · same-source counts only.':' · Activity option unavailable here.');box.querySelector('details p').textContent=explain(scope);}
function mount(host,model){if(!host)return;if(host.querySelector(':scope > .cash-activity-controls')){if(model)configure(host,model);return;}
 const box=document.createElement('section');box.className='cash-activity-controls';box.setAttribute('aria-label','Optional reported-activity ranking');
 const title=document.createElement('h3');title.textContent='Value and reported activity';box.append(title);
 const ml=document.createElement('label');ml.textContent='Ranking ';const mode=document.createElement('select');mode.dataset.cashActivityMode='true';for(const [value,label]of[['value','Value · original order'],['activity','Activity-adjusted value · optional']]){const o=document.createElement('option');o.value=value;o.textContent=label;mode.append(o);}ml.append(mode);box.append(ml);
 const cl=document.createElement('label');cl.textContent='Minimum reported sales count ';const minimum=document.createElement('input');minimum.type='number';minimum.min='0';minimum.step='1';minimum.value='0';minimum.dataset.cashActivityMinimum='true';cl.append(minimum);box.append(cl);
 const status=document.createElement('p');status.className='cash-activity-window';status.setAttribute('role','status');box.append(status);
 const details=document.createElement('details'),summary=document.createElement('summary'),p=document.createElement('p');summary.textContent='Activity score method and limitations';p.textContent=explain();details.append(summary,p);box.append(details);
 const update=()=>{const text=minimum.value.trim(),n=/^(0|[1-9][0-9]*)$/.test(text)?Number(text):NaN;if(!setState({mode:mode.value,minimumCount:n})){minimum.setCustomValidity('Use a safe nonnegative whole reported count.');minimum.reportValidity();}else minimum.setCustomValidity('');};mode.addEventListener('change',update);minimum.addEventListener('change',update);mode.value=state.mode;minimum.value=String(state.minimumCount);controls.add({mode,minimum});host.append(box);if(model)configure(host,model);
}
window.AstraCashActivity=Object.freeze({getState,setState,cohort,rank,explain,mount,configure});
})();
