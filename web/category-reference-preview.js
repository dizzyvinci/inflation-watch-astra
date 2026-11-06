(() => {
  'use strict';
  const section=document.getElementById('category-section'),cards=document.getElementById('category-cards');
  if(!section||!cards||document.getElementById('category-reference-preview'))return;
  const make=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
  const validDay=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
  const shift=(date,n)=>new Date(Date.parse(date+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
  const positive=v=>Number.isFinite(v)&&v>0;
  const fmt=(v,d=1)=>Number.isFinite(v)?v.toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}):'Unavailable';
  const pct=v=>Number.isFinite(v)?(v>=0?'+':'')+fmt(v)+'%':'Unavailable';
  const key='astra-category-reference-v1',modes=new Set(['frozen','previous7','previous3','previous-day']);let mode='frozen',report=null;
  try{const saved=localStorage.getItem(key);if(modes.has(saved))mode=saved;}catch{}
  const controls=make('div','category-reference-preview');controls.id='category-reference-preview';controls.dataset.previewControls='true';
  const label=make('label','','Compare category prices with'),select=make('select');select.id='category-reference-select';select.setAttribute('aria-describedby','category-reference-editor-note category-reference-status');
  for(const [value,text]of [['frozen','Official frozen reference week'],['previous7','Previous 7-day average · preview'],['previous3','Previous 3-day average · preview'],['previous-day','Prior complete source day · preview']]){const o=make('option','',text);o.value=value;select.append(o);}label.append(select);controls.append(label);cards.before(controls);
  const status=make('p','category-reference-status');status.id='category-reference-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');controls.after(status);
  const editorNote=make('small','category-reference-editor-note','This selector changes the category display only; the headline, membership, base prices and weights stay fixed.');editorNote.id='category-reference-editor-note';controls.append(editorNote);
  const legend=section.querySelector('.category-gauge-legend'),legendHidden=legend?.hidden||false;
  function qualified(row,sourceDay){
    const byDay=new Map();for(const p of Array.isArray(row.history)?row.history:[]){if(!Array.isArray(p)||!validDay(p[0])||p[0]>sourceDay||!positive(p[1])||!Number.isInteger(p[2])||p[2]<5)continue;const old=byDay.get(p[0]);if(old){byDay.set(p[0],null);}else if(!byDay.has(p[0]))byDay.set(p[0],p.slice(0,3));}
    if([...byDay.values()].some(p=>p===null))return [];
    return [...byDay.values()].sort((a,b)=>a[0].localeCompare(b[0]));
  }
  const capture=value=>{if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))return 'unknown';const zone=document.getElementById('display-timezone')?.value||'UTC';try{return new Date(value).toLocaleString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false,timeZone:zone})+' '+zone+' '+new Date(value).toLocaleDateString('en-US',{year:'numeric',timeZone:zone});}catch{return value;}};
  function apiModel(data){
    const view=data?.apiCalculationView,publisher=view?.clocks?.dailyPublisher,sourceDay=typeof publisher==='string'?publisher.slice(0,10):null,currentDay=view?.daily?.latestDay;
    if(!validDay(sourceDay)||!/(?:Z|[+-]\d\d:\d\d)$/.test(publisher)||!Number.isFinite(Date.parse(publisher))||!validDay(currentDay)||currentDay>sourceDay||!Array.isArray(data.apiDailyItems)||data.apiDailyItems.length!==79||data.apiDailyItems.filter(r=>r?.role==='goods').length!==50||data.apiDailyItems.filter(r=>r?.role==='cash').length!==29||!Array.isArray(data.rows)||data.rows.length!==50||!Array.isArray(data.categories))return null;
    const bySlug=new Map(),ids=new Set();for(const item of data.apiDailyItems){if(!item||!['goods','cash'].includes(item.role)||typeof item.slug!=='string'||!Number.isSafeInteger(item.itemId)||ids.has(item.itemId)||bySlug.has(item.slug)||!Array.isArray(item.points))return null;ids.add(item.itemId);bySlug.set(item.slug,item);}
    const referenceDays=mode==='previous7'?7:mode==='previous3'?3:1,end=shift(currentDay,-1),start=shift(currentDay,-referenceDays);
    const categories=data.categories.map(cat=>{
      const members=data.rows.filter(r=>r.category===cat.name),weight=members.reduce((s,r)=>s+r.weight,0);let currentLevel=0,referenceLevel=0,currentWeight=0,referenceWeight=0,currentPartial=false,referenceObservations=0;const currentDates=[],referenceDates=[],originalCurrentReceipts=[],originalReferenceReceipts=[];
      for(const row of members){if(!positive(row.weight)||!positive(row.basePrice))continue;const item=bySlug.get(row.slug),points=new Map();let conflict=false;
        if(item?.role==='goods')for(const p of item.points){if(!p||!validDay(p.day)||p.day>sourceDay)continue;if(points.has(p.day)){conflict=true;break;}points.set(p.day,p);}
        if(conflict)continue;
        const usable=p=>p?.qualified===true&&positive(p.linkedPrice)&&Number.isSafeInteger(p.recordedSalesCount)&&p.recordedSalesCount>=5&&typeof p.partialCalendarDay==='boolean';
        const current=points.get(currentDay);currentPartial ||= current?.partialCalendarDay===true;if(usable(current)){currentWeight+=row.weight;currentLevel+=row.weight*current.linkedPrice/row.basePrice;currentDates.push(currentDay);if(typeof current.source?.capturedAt==='string')originalCurrentReceipts.push(current.source.capturedAt);}
        const refs=Array.from({length:referenceDays},(_,i)=>points.get(shift(start,i)));if(refs.every(p=>usable(p)&&p.partialCalendarDay===false)){
          let q=0,price=0,valid=true;for(const p of refs){const next=q+p.recordedSalesCount;if(!Number.isSafeInteger(next)){valid=false;break;}price+=(p.linkedPrice-price)*p.recordedSalesCount/next;q=next;}
          if(valid&&positive(price)){referenceWeight+=row.weight;referenceLevel+=row.weight*price/row.basePrice;referenceDates.push(...refs.map(p=>p.day));originalReferenceReceipts.push(...refs.map(p=>p.source?.capturedAt).filter(p=>typeof p==='string'));referenceObservations+=refs.length;}
        }
      }
      const valid=members.length>0&&members.length===cat.count&&Math.abs(weight-cat.weight)<1e-8&&Math.abs(currentWeight-weight)<1e-8&&Math.abs(referenceWeight-weight)<1e-8&&positive(referenceLevel);
      return {name:cat.name,index:valid?100*currentLevel/referenceLevel:null,count:members.length,weight,currentCoverage:weight?currentWeight/weight:0,referenceCoverage:weight?referenceWeight/weight:0,currentObservedCoverage:weight?currentWeight/weight:0,referenceCarriedCoverage:0,currentDates:currentDates.sort(),referenceDates:referenceDates.sort(),referenceObservations,currentPartial,originalCurrentReceipts:originalCurrentReceipts.sort((a,b)=>Date.parse(a)-Date.parse(b)),originalReferenceReceipts:originalReferenceReceipts.sort((a,b)=>Date.parse(a)-Date.parse(b))};
    });
    return {basis:'api_actual_daily',sourceDay,currentDay,start,end,referenceDays,categories,dailyCapture:view.clocks.dailyCapture,publisher};
  }
  function model(data){
    if(data?.apiCalculationView)return apiModel(data);
    const sourceDay=typeof data?.sourceUpdatedAt==='string'?data.sourceUpdatedAt.slice(0,10):null;
    if(!validDay(sourceDay)||!/(?:Z|[+-]\d\d:\d\d)$/.test(data.sourceUpdatedAt)||!Number.isFinite(Date.parse(data.sourceUpdatedAt))||!Array.isArray(data.rows)||!Array.isArray(data.categories))return null;
    const rows=data.rows;if(new Set(rows.map(r=>r?.slug)).size!==rows.length||rows.some(r=>!r||typeof r.slug!=='string'||!positive(r.weight)||!positive(r.basePrice)))return null;
    const referenceDays=mode==='previous7'?7:mode==='previous3'?3:1,end=shift(sourceDay,-1),start=shift(sourceDay,-referenceDays);
    const categories=data.categories.map(cat=>{
      const members=rows.filter(r=>r.category===cat.name),weight=members.reduce((s,r)=>s+r.weight,0);let currentLevel=0,referenceLevel=0,currentWeight=0,referenceWeight=0,currentObservedWeight=0,referenceCarriedWeight=0,currentDates=[],referenceDates=[],referenceObservations=0;
      for(const row of members){const h=qualified(row,sourceDay),current=h.at(-1);if(current){currentWeight+=row.weight;currentLevel+=row.weight*current[1]/row.basePrice;currentDates.push(current[0]);if(current[0]===sourceDay)currentObservedWeight+=row.weight;}
        const points=mode!=='previous-day'?h.filter(p=>p[0]>=start&&p[0]<=end):h.filter(p=>p[0]<=end).slice(-1);
        if(points.length){const q=points.reduce((s,p)=>s+p[2],0),price=points.reduce((s,p)=>s+p[1]*p[2],0)/q;referenceWeight+=row.weight;referenceLevel+=row.weight*price/row.basePrice;referenceDates.push(...points.map(p=>p[0]));referenceObservations+=points.length;if(mode==='previous-day'&&points[0][0]<end)referenceCarriedWeight+=row.weight;}
      }
      const valid=members.length>0&&members.length===cat.count&&Math.abs(weight-cat.weight)<1e-8&&Math.abs(currentWeight-weight)<1e-8&&Math.abs(referenceWeight-weight)<1e-8&&positive(referenceLevel);
      return {name:cat.name,index:valid?100*currentLevel/referenceLevel:null,count:members.length,weight,currentCoverage:weight?currentWeight/weight:0,referenceCoverage:weight?referenceWeight/weight:0,currentObservedCoverage:weight?currentObservedWeight/weight:0,referenceCarriedCoverage:weight?referenceCarriedWeight/weight:0,currentDates:currentDates.sort(),referenceDates:referenceDates.sort(),referenceObservations};
    });
    return{sourceDay,start,end,categories,referenceDays};
  }
  function apply(){
    select.value=mode;section.dataset.categoryReference=mode;status.hidden=false;
    if(report&&typeof renderCategoryCards==='function')renderCategoryCards();
    section.querySelectorAll('.category-reference-note').forEach(n=>n.remove());
    if(legend)legend.hidden=mode==='frozen'?legendHidden:true;
    if(mode==='frozen'){status.textContent=report?'':'Waiting for the published snapshot. The official frozen reference is the default.';status.hidden=!!report;return;}
    const comparison=model(report);
    if(!comparison){status.textContent='Comparison unavailable: a valid dated fixed-basket snapshot is required. No estimate is filled.';cards.querySelectorAll('.category-main').forEach(button=>{button.querySelector('.category-gauge')?.remove();const n=button.querySelector('.category-number');if(n)n.textContent='Unavailable';button.querySelector('.category-change')?.remove();button.querySelector('.category-value-label')?.remove();});return;}
    const max=typeof categoryScale==='function'?categoryScale(comparison.categories.map(c=>c.index)):Math.max(200,...comparison.categories.map(c=>c.index||0));
    const percentOnly=section.dataset.categoryValue==='percent';
    for(const button of cards.querySelectorAll('.category-main')){const cat=comparison.categories.find(c=>c.name===button.dataset.category);if(!cat)continue;
      const oldGauge=button.querySelector('.category-gauge'),gauge=Number.isFinite(cat.index)&&typeof categoryGauge==='function'?categoryGauge(cat.index,max):'';if(oldGauge){if(gauge){const holder=make('div');holder.innerHTML=gauge;const next=holder.firstElementChild;next.setAttribute('aria-label',`Display comparison ${fmt(cat.index)}; selected source-calendar reference = 100; not the official MPI baseline`);oldGauge.replaceWith(next);}else oldGauge.remove();}
      const number=button.querySelector('.category-number');if(number)number.textContent=Number.isFinite(cat.index)?percentOnly?pct(cat.index-100):fmt(cat.index):'Unavailable';
      button.querySelector('.category-change')?.remove();button.querySelector('.category-value-label')?.remove();
      const change=make('span',percentOnly?'category-value-label':'category-change '+(cat.index>=100?'up':'down'),Number.isFinite(cat.index)?percentOnly?'vs. selected comparison':pct(cat.index-100):'No complete comparable mix');button.append(change);
      const note=make('small','category-reference-note',comparison.basis==='api_actual_daily'?`API actual daily basis · current/reference priced weight ${fmt(cat.currentCoverage*100)}% / ${fmt(cat.referenceCoverage*100)}%. ${cat.currentPartial?'Partial API source day. ':''}All fixed members and every reference day required; no carry or renormalization. ${cat.referenceObservations} qualified item-day observations. Count-weighted daily-median reference; reported sale counts are not verified physical units. Separate from the NX model’s arithmetic mean MPI anchor.`:`Current/reference priced weight: ${fmt(cat.currentCoverage*100)}% / ${fmt(cat.referenceCoverage*100)}%. Current-day observed weight ${fmt(cat.currentObservedCoverage*100)}%; remaining priced weight is carried.${mode==='previous-day'?` Reference carried weight ${fmt(cat.referenceCarriedCoverage*100)}%.`:` ${cat.referenceObservations} qualified item-day observations in the ${comparison.referenceDays}-day window.`}`);
      note.title=`Current qualified dates: ${cat.currentDates[0]||'none'}–${cat.currentDates.at(-1)||'none'}. Reference qualified dates: ${cat.referenceDates[0]||'none'}–${cat.referenceDates.at(-1)||'none'}. Daily medians with recorded count ≥5 only.${comparison.basis==='api_actual_daily'?` Original current receipt range ${capture(cat.originalCurrentReceipts[0])}–${capture(cat.originalCurrentReceipts.at(-1))}; reference receipts ${capture(cat.originalReferenceReceipts[0])}–${capture(cat.originalReferenceReceipts.at(-1))}; individual sale times unknown.`:''}`;button.closest('.category-card').append(note);
    }
    status.textContent=comparison.basis==='api_actual_daily'?`API actual daily display comparison: ${comparison.referenceDays===1?'prior complete source day':`previous ${comparison.referenceDays}-day average`} (${comparison.start}–${comparison.end}, UTC source dates) versus ${comparison.currentDay}${comparison.categories.some(c=>c.currentPartial)?' · partial API source day':''}. Count-weighted daily-median reference, not a point-to-point return or the NX benchmark’s arithmetic mean linked-MPI anchor. Latest overview receipt ${capture(comparison.dailyCapture)}; source publication ${capture(comparison.publisher)}. No verified 24-hour scan coverage or constant item quality is inferred. The current 3-day reference, headline, fixed membership and weights stay unchanged; missing/thin members or reference days make the category unavailable.`:`Display comparison only: ${mode==='previous-day'?'prior complete source-calendar day':`previous ${comparison.referenceDays}-day average of observed daily medians`} (${comparison.start}–${comparison.end}); current qualified prices through source day ${comparison.sourceDay} (partial). Source publication ${report.sourceUpdatedAt}; no intraday price timing is inferred. 100 = the selected comparison level, not a new official MPI baseline. Original membership, fixed weights and base prices are preserved. Missing member prices make that category unavailable; partial mixes are never renormalized.`;
  }
  select.addEventListener('change',()=>{mode=modes.has(select.value)?select.value:'frozen';try{localStorage.setItem(key,mode);}catch{}apply();});
  document.addEventListener('astramarketsnapshot',ev=>{report=ev.detail;apply();});
  section.addEventListener('click',ev=>{if(ev.target.closest('[data-category-value]'))queueMicrotask(apply);});
  document.addEventListener('change',ev=>{if(ev.target?.id==='display-timezone')queueMicrotask(apply);});
  apply();document.dispatchEvent(new Event('astramarkethighlightsready'));
})();
