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
  const key='astra-category-reference-v1',modes=new Set(['frozen','previous7','previous-day']);let mode='frozen',report=null;
  try{const saved=localStorage.getItem(key);if(modes.has(saved))mode=saved;}catch{}
  const controls=make('div','category-reference-preview');controls.id='category-reference-preview';controls.dataset.previewControls='true';
  const label=make('label','','Compare category prices with'),select=make('select');select.id='category-reference-select';select.setAttribute('aria-describedby','category-reference-status');
  for(const [value,text]of [['frozen','Official frozen reference week'],['previous7','Previous 7 complete source days · preview'],['previous-day','Prior complete source day · preview']]){const o=make('option','',text);o.value=value;select.append(o);}label.append(select);controls.append(label);cards.before(controls);
  const status=make('p','category-reference-status');status.id='category-reference-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');controls.after(status);
  const legend=section.querySelector('.category-gauge-legend'),legendHidden=legend?.hidden||false;
  function qualified(row,sourceDay){
    const byDay=new Map();for(const p of Array.isArray(row.history)?row.history:[]){if(!Array.isArray(p)||!validDay(p[0])||p[0]>sourceDay||!positive(p[1])||!Number.isInteger(p[2])||p[2]<5)continue;const old=byDay.get(p[0]);if(old){byDay.set(p[0],null);}else if(!byDay.has(p[0]))byDay.set(p[0],p.slice(0,3));}
    if([...byDay.values()].some(p=>p===null))return [];
    return [...byDay.values()].sort((a,b)=>a[0].localeCompare(b[0]));
  }
  function model(data){
    const sourceDay=typeof data?.sourceUpdatedAt==='string'?data.sourceUpdatedAt.slice(0,10):null;
    if(!validDay(sourceDay)||!/(?:Z|[+-]\d\d:\d\d)$/.test(data.sourceUpdatedAt)||!Number.isFinite(Date.parse(data.sourceUpdatedAt))||!Array.isArray(data.rows)||!Array.isArray(data.categories))return null;
    const rows=data.rows;if(new Set(rows.map(r=>r?.slug)).size!==rows.length||rows.some(r=>!r||typeof r.slug!=='string'||!positive(r.weight)||!positive(r.basePrice)))return null;
    const end=shift(sourceDay,-1),start=mode==='previous7'?shift(sourceDay,-7):end;
    const categories=data.categories.map(cat=>{
      const members=rows.filter(r=>r.category===cat.name),weight=members.reduce((s,r)=>s+r.weight,0);let currentLevel=0,referenceLevel=0,currentWeight=0,referenceWeight=0,currentObservedWeight=0,referenceCarriedWeight=0,currentDates=[],referenceDates=[],referenceObservations=0;
      for(const row of members){const h=qualified(row,sourceDay),current=h.at(-1);if(current){currentWeight+=row.weight;currentLevel+=row.weight*current[1]/row.basePrice;currentDates.push(current[0]);if(current[0]===sourceDay)currentObservedWeight+=row.weight;}
        const points=mode==='previous7'?h.filter(p=>p[0]>=start&&p[0]<=end):h.filter(p=>p[0]<=end).slice(-1);
        if(points.length){const q=points.reduce((s,p)=>s+p[2],0),price=points.reduce((s,p)=>s+p[1]*p[2],0)/q;referenceWeight+=row.weight;referenceLevel+=row.weight*price/row.basePrice;referenceDates.push(...points.map(p=>p[0]));referenceObservations+=points.length;if(mode==='previous-day'&&points[0][0]<end)referenceCarriedWeight+=row.weight;}
      }
      const valid=members.length>0&&members.length===cat.count&&Math.abs(weight-cat.weight)<1e-8&&Math.abs(currentWeight-weight)<1e-8&&Math.abs(referenceWeight-weight)<1e-8&&positive(referenceLevel);
      return {name:cat.name,index:valid?100*currentLevel/referenceLevel:null,count:members.length,weight,currentCoverage:weight?currentWeight/weight:0,referenceCoverage:weight?referenceWeight/weight:0,currentObservedCoverage:weight?currentObservedWeight/weight:0,referenceCarriedCoverage:weight?referenceCarriedWeight/weight:0,currentDates:currentDates.sort(),referenceDates:referenceDates.sort(),referenceObservations};
    });
    return{sourceDay,start,end,categories};
  }
  function apply(){
    select.value=mode;section.dataset.categoryReference=mode;
    if(report&&typeof renderCategoryCards==='function')renderCategoryCards();
    section.querySelectorAll('.category-reference-note').forEach(n=>n.remove());
    if(legend)legend.hidden=mode==='frozen'?legendHidden:true;
    if(mode==='frozen'){status.textContent=report?`Official dials use the frozen ${report.baseStart||'unknown'}–${report.baseEnd||'unknown'} reference week. This selector changes the category display only; the headline, membership, base prices and weights stay fixed.`:'Waiting for the published snapshot. The official frozen reference is the default.';return;}
    const comparison=model(report);
    if(!comparison){status.textContent='Comparison unavailable: a valid dated fixed-basket snapshot is required. No estimate is filled.';cards.querySelectorAll('.category-main').forEach(button=>{button.querySelector('.category-gauge')?.remove();const n=button.querySelector('.category-number');if(n)n.textContent='Unavailable';button.querySelector('.category-change')?.remove();button.querySelector('.category-value-label')?.remove();});return;}
    const max=typeof categoryScale==='function'?categoryScale(comparison.categories.map(c=>c.index)):Math.max(200,...comparison.categories.map(c=>c.index||0));
    const percentOnly=section.dataset.categoryValue==='percent';
    for(const button of cards.querySelectorAll('.category-main')){const cat=comparison.categories.find(c=>c.name===button.dataset.category);if(!cat)continue;
      const oldGauge=button.querySelector('.category-gauge'),gauge=Number.isFinite(cat.index)&&typeof categoryGauge==='function'?categoryGauge(cat.index,max):'';if(oldGauge){if(gauge){const holder=make('div');holder.innerHTML=gauge;const next=holder.firstElementChild;next.setAttribute('aria-label',`Display comparison ${fmt(cat.index)}; selected source-calendar reference = 100; not the official MPI baseline`);oldGauge.replaceWith(next);}else oldGauge.remove();}
      const number=button.querySelector('.category-number');if(number)number.textContent=Number.isFinite(cat.index)?percentOnly?pct(cat.index-100):fmt(cat.index):'Unavailable';
      button.querySelector('.category-change')?.remove();button.querySelector('.category-value-label')?.remove();
      const change=make('span',percentOnly?'category-value-label':'category-change '+(cat.index>=100?'up':'down'),Number.isFinite(cat.index)?percentOnly?'vs. selected comparison':pct(cat.index-100):'No complete comparable mix');button.append(change);
      const note=make('small','category-reference-note',`Current/reference priced weight: ${fmt(cat.currentCoverage*100)}% / ${fmt(cat.referenceCoverage*100)}%. Current-day observed weight ${fmt(cat.currentObservedCoverage*100)}%; remaining priced weight is carried.${mode==='previous-day'?` Reference carried weight ${fmt(cat.referenceCarriedCoverage*100)}%.`:` ${cat.referenceObservations} qualified item-day observations in the 7-day window.`}`);
      note.title=`Current qualified dates: ${cat.currentDates[0]||'none'}–${cat.currentDates.at(-1)||'none'}. Reference qualified dates: ${cat.referenceDates[0]||'none'}–${cat.referenceDates.at(-1)||'none'}. Daily medians with recorded count ≥5 only.`;button.closest('.category-card').append(note);
    }
    status.textContent=`Display comparison only: ${mode==='previous7'?'previous 7 complete source-calendar days':'prior complete source-calendar day'} (${comparison.start}–${comparison.end}); current qualified prices through source day ${comparison.sourceDay} (partial). Source publication ${report.sourceUpdatedAt}; no intraday price timing is inferred. 100 = the selected comparison level, not a new official MPI baseline. Original membership, fixed weights and base prices are preserved. Missing member prices make that category unavailable; partial mixes are never renormalized.`;
  }
  select.addEventListener('change',()=>{mode=modes.has(select.value)?select.value:'frozen';try{localStorage.setItem(key,mode);}catch{}apply();});
  document.addEventListener('astramarketsnapshot',ev=>{report=ev.detail;apply();});
  section.addEventListener('click',ev=>{if(ev.target.closest('[data-category-value]'))queueMicrotask(apply);});
  apply();document.dispatchEvent(new Event('astramarkethighlightsready'));
})();
