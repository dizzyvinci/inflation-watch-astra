'use strict';
let chartSerial=0, selectedCpiRange='all', selectedSmegaRange='24', selectedLaunchPeriod='all';
const LAUNCH_EVENTS=Object.freeze([
 Object.freeze({id:'founders',day:'2026-10-06',label:'Founders',announcedAt:'2026-10-06T18:00:00Z',detail:'Founder’s Access: October 6, 2026 at 11 AM PDT (18:00 UTC)'}),
 Object.freeze({id:'grand-launch',day:'2026-10-21',label:'Grand Launch',detail:'Grand Launch: October 21, 2026; exact launch time not established here'})
]);
function launchPeriodFilter(p,period=selectedLaunchPeriod){
 const day=p.day||p.date||String(p.at||'').slice(0,10);
 return period==='all'||(period==='founders'?day>='2026-10-06'&&day<'2026-10-21':day>='2026-10-21');
}
let snapshot, version, selectedRange='all', metric='nx', sortKey='weight', sortAsc=false, layout='table', retry=60000, timer;
let cashLookback=3, cashEvidence='daily', cashSide='sell', cashFilter='all', cashSortKey='rate', cashSortAsc=false;
let smegaComparison=false;
const mainOverlays={intraday:false,rolling:false};let reportedHistoryVisible=false;
try{smegaComparison=localStorage.getItem('astra-smega-comparison')==='on';}catch{}
const $=id=>document.getElementById(id);
// Player-reported cash history stays on the cash page; offers remain upfront.
for(const id of ['reported-section']){const section=$(id);if(section&&$('view-nx'))$('view-nx').append(section);}
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=(v,d=0)=>Number.isFinite(v)?v.toLocaleString('en-US',{maximumFractionDigits:d,minimumFractionDigits:d}):'—';
const compact=v=>Number.isFinite(v)?Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:1}).format(v):'—';
const percent=v=>`${v>=0?'+':''}${number(v,1)}%`;
function referencePeriodLabel(start=snapshot.baseStart,end=snapshot.baseEnd){
 const first=new Date(start+'T12:00:00Z'),last=new Date(end+'T12:00:00Z'),label=date=>date.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
 return start.slice(0,7)===end.slice(0,7)?`${first.toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'})}–${last.getUTCDate()}, ${last.getUTCFullYear()}`:`${label(first)}–${label(last)}`;
}
let displayTimeZone='UTC';
try{const saved=localStorage.getItem('astra-display-timezone');if(saved){new Intl.DateTimeFormat('en-US',{timeZone:saved});displayTimeZone=saved;}}catch{}
const utc=v=>v?new Date(v).toLocaleString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false,timeZone:displayTimeZone})+' '+displayTimeZone:'Not available';
const zones=[...new Set(['UTC',...(Intl.supportedValuesOf?Intl.supportedValuesOf('timeZone'):['America/Chicago','America/New_York','America/Los_Angeles','Europe/London','Asia/Seoul','Asia/Tokyo']),displayTimeZone])];
$('display-timezone').innerHTML=zones.map(zone=>`<option value="${esc(zone)}">${esc(zone.replaceAll('_',' '))}</option>`).join('');
$('display-timezone').value=displayTimeZone;
const sceneryToggle=$('scenery-toggle');
const sceneryModes=new Set(['classic','banner','backdrop','zakum-dark','zakum-set','ellinia-original','ellinia-illustrated']);
let sceneryMode='classic';
function setSceneryMode(mode){
 if(mode==='zakum')mode='zakum-dark';
 sceneryMode=sceneryModes.has(mode)?mode:'classic';document.body.dataset.sceneryMode=sceneryMode;
 document.querySelectorAll('[data-scenery-mode]').forEach(button=>{if(button.tagName==='BUTTON')button.setAttribute('aria-pressed',String(button.dataset.sceneryMode===sceneryMode));});
}
function setScenery(enabled){document.body.classList.toggle('scenery-on',enabled);sceneryToggle.setAttribute('aria-pressed',String(enabled));$('scenery-options').hidden=!enabled;}
try{setSceneryMode(localStorage.getItem('astra-scenery-mode'));}catch{setSceneryMode('classic');}
try{setScenery(localStorage.getItem('astra-scenery')==='on');}catch{setScenery(false);}
sceneryToggle.addEventListener('click',()=>{const enabled=sceneryToggle.getAttribute('aria-pressed')!=='true';setScenery(enabled);if(enabled)$('display-options').open=true;try{localStorage.setItem('astra-scenery',enabled?'on':'off');}catch{}});
document.querySelectorAll('button[data-scenery-mode]').forEach(button=>button.addEventListener('click',()=>{setSceneryMode(button.dataset.sceneryMode);try{localStorage.setItem('astra-scenery-mode',sceneryMode);}catch{}}));
const heroLayouts=new Set(['rate-first','dials-first']);
function setHeroLayout(value){
 const layout=heroLayouts.has(value)?value:'rate-first',rateSection=$('rate-section'),categorySection=$('category-section');
 if(layout==='dials-first')rateSection.before(categorySection);else categorySection.before(rateSection);
 document.body.dataset.heroLayout=layout;document.querySelectorAll('button[data-hero-layout]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.heroLayout===layout)));
}
try{setHeroLayout(localStorage.getItem('astra-hero-layout'));}catch{setHeroLayout('rate-first');}
document.querySelectorAll('button[data-hero-layout]').forEach(button=>button.addEventListener('click',()=>{setHeroLayout(button.dataset.heroLayout);try{localStorage.setItem('astra-hero-layout',document.body.dataset.heroLayout);}catch{}}));
function setCategoryHeading(value){
 const mode=['hot-not','contributors'].includes(value)?value:'stories',heading=$('category-title');
 if(mode==='hot-not'){heading.innerHTML='What’s <span class="category-hot">Hot.</span> What’s <span class="category-not">Not.</span>';heading.title='Hot and Not refer to prices relative to the fixed reference base, not trading activity or rankings.';}
 else if(mode==='contributors'){heading.textContent='Contributors to the index';heading.title='Category price indices are shown; index contribution also depends on each category’s fixed basket weight.';}
 else{heading.textContent='Different items. Different stories.';heading.removeAttribute('title');}
 document.body.dataset.categoryHeading=mode;document.querySelectorAll('button[data-category-heading]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.categoryHeading===mode)));
}
try{setCategoryHeading(localStorage.getItem('astra-category-heading'));}catch{setCategoryHeading('stories');}
document.querySelectorAll('button[data-category-heading]').forEach(button=>button.addEventListener('click',()=>{setCategoryHeading(button.dataset.categoryHeading);try{localStorage.setItem('astra-category-heading',document.body.dataset.categoryHeading);}catch{}}));
let categoryValue='index';
function setCategoryValue(value){
 categoryValue=value==='percent'?'percent':'index';$('category-section').dataset.categoryValue=categoryValue;
 document.querySelectorAll('button[data-category-value]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.categoryValue===categoryValue)));
 renderCategoryCards();
}
try{setCategoryValue(localStorage.getItem('astra-category-value'));}catch{setCategoryValue('index');}
document.querySelectorAll('button[data-category-value]').forEach(button=>button.addEventListener('click',()=>{setCategoryValue(button.dataset.categoryValue);try{localStorage.setItem('astra-category-value',categoryValue);}catch{}}));
let rateCaption='exact',rateCaptionFootnote='none';
function renderRateCaption(){
 if(!snapshot)return;
 const benchmark=benchmarkHeadline(snapshot).rate,caption=$('exact-rate');caption.textContent=rateCaption==='method'?'Modelled: reference NX rate × goods MPI / 100.':rateCaption==='weight'?'Goods basket weights stay fixed; cash sale mix is excluded.':`${number(benchmark===null?null:benchmark*1000)} modelled mesos per 1,000 NX`;
 if(rateCaption==='method'&&rateCaptionFootnote!=='none'){
  const note=document.createElement('sup'),link=document.createElement('a');note.className='weight-help rate-caption-footnote';link.textContent='?';
  link.href=rateCaptionFootnote==='weight'?'#method-weights':'#method-nx-benchmark';
  link.setAttribute('aria-label',rateCaptionFootnote==='weight'?'Read the weight explanation':'How this NX value was calculated');note.append(link);caption.append(note);
 }
}
function setRateCaptionFootnote(value){rateCaptionFootnote=['none','weight','calculation'].includes(value)?value:'none';document.querySelectorAll('button[data-rate-caption-footnote]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.rateCaptionFootnote===rateCaptionFootnote)));renderRateCaption();}
try{setRateCaptionFootnote(localStorage.getItem('astra-rate-caption-footnote'));}catch{setRateCaptionFootnote('none');}
document.querySelectorAll('button[data-rate-caption-footnote]').forEach(button=>button.addEventListener('click',()=>{setRateCaptionFootnote(button.dataset.rateCaptionFootnote);try{localStorage.setItem('astra-rate-caption-footnote',rateCaptionFootnote);}catch{}}));
function setRateCaption(value){rateCaption=['exact','method','weight'].includes(value)?value:'exact';document.querySelectorAll('button[data-rate-caption]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.rateCaption===rateCaption)));renderRateCaption();}
try{setRateCaption(localStorage.getItem('astra-rate-caption'));}catch{setRateCaption('exact');}
document.querySelectorAll('button[data-rate-caption]').forEach(button=>button.addEventListener('click',()=>{setRateCaption(button.dataset.rateCaption);try{localStorage.setItem('astra-rate-caption',rateCaption);}catch{}}));
const sectionRoutes=Object.freeze({'method-weights':'method','method-basket-size':'method','method-nx-benchmark':'method','smega-section':'index','rolling-reference-card':'nx','basket-context':'basket','nx-calculator':'nx','volume-scope':'index','volume-title':'index','method-meso-supply':'method','method-launch-context':'method','method-reference-week':'method','basket-history-section':'basket'});
function focusRouteAnchor(){const id=location.hash.slice(1);if(!Object.hasOwn(sectionRoutes,id))return false;const target=$(id);if(!target)return false;target.scrollIntoView({block:'start',behavior:'instant'});target.focus({preventScroll:true});return true;}

const sprite=(r)=>`<img class="sprite" src="${esc(snapshot?.spriteMap?.[r.slug]||`assets/${r.slug}.svg`)}" alt="" loading="lazy" width="31" height="31">`;
const referenceItem=r=>snapshot.rollingReference?.items.find(i=>i.name===r.name);
const rollingHistoryLegacy=p=>!Number.isInteger(p.comparisonMethodVersion)||p.comparisonMethodVersion<3;
const rollingHistoryNote=p=>rollingHistoryLegacy(p)?'Earlier method; roll identity unverified. Historical value and capture clock retained.':`Comparison method ${p.comparisonMethodVersion}; explicit roll eligibility policy. Capture time is not trade time.`;
const rollingHistoryPoints=(history,key)=>history.map(p=>({...p,value:p[key],kind:'rolling_scanner_reference',seriesLabel:rollingHistoryLegacy(p)?'Legacy rolling scanner reference · earlier method / unverified rolls':`Rolling scanner reference · method ${p.comparisonMethodVersion}`,referenceNote:rollingHistoryNote(p)}));
function rollingNxPolicyNote(reference){
 if(!reference)return '';const policy=reference.comparison;
 if(!(policy?.methodVersion>=3))return 'Legacy rolling NX reference · earlier method / unverified roll identity. Its original value and capture clock are retained; no explicit Clean provenance is implied.';
 const eligible=policy.comparableCashItems??0,total=policy.cashReferenceWeights?.length??(eligible+(policy.excludedCashItems?.length||0));
 const unknown=(policy.excludedCashItems||[]).filter(item=>item.reason==='cash_roll_metadata_unverified').length;
 const availability=Number.isFinite(reference.nxRateReference)?`Method ${policy.methodVersion}: ${eligible}/${total} fixed-NX items eligible.`:`Current rolling NX reference unavailable under method ${policy.methodVersion}: ${eligible}/${total} fixed-NX items eligible; at least 3 are required.`;
 return availability+(unknown?` ${unknown} captured cash input${unknown===1?' lacks':'s lack'} retained roll metadata.`:'')+' Earlier historical references retain their original values and capture clocks.';
}
function publicRollingContext(reference){
 const start=reference.captureStartedAt,end=reference.captureCompletedAt||reference.capturedAt;
 if(!start||!end)return `Scanner status when pulled: ${reference.scannerFreshnessText||'Unknown.'} The capture time is not a new trade timestamp.`;
 const recovery=/\bCapture crossed source recovery:/i.test(reference.scannerFreshnessText||'');
 return `Batch capture window: ${utc(start)} – ${utc(end)}. ${recovery?'The source reported delayed scans and maintenance, followed by resumed scans during this batch.':'The batch window does not establish source freshness.'} Per-item return clocks are retained; exact underlying scan/trade timestamps are unknown. Listing availability is unconfirmed.`;
}
const referenceRollNote=(r,i)=>i.statRoll?`Reported roll: ${i.statRoll}`:(r.category==='Equipment'||r.category==='Weapons'&&i.id<2000000)?'Roll not matched to the daily baseline':'';
const referenceCell=r=>{const i=referenceItem(r),note=i?referenceRollNote(r,i):'';return i?`<span class="ref-cell" data-sort-value="${i.price}" title="${esc((i.captureTimeKind==='per_item_return'?'Captured ':'Batch pulled ')+utc(i.capturedAt||snapshot.rollingReference.capturedAt)+'; source scan time unknown')}">${number(i.price)}<small>${i.windowDays}d window · ${number(i.salesCounted)} sales</small>${note?`<small>${esc(note)}</small>`:''}</span>`:'—';};
const nameOf=r=>esc(r.name)+(r.slug==='wolbi-throwing-stars'?'*':'');
const recentLive=()=>snapshot.live&&Date.now()-Date.parse(snapshot.live.observedAt)<2400000;
const activeRate=()=>recentLive()?(snapshot.live.nxRate??snapshot.latest.nxRate):snapshot.latest.nxRate;
const activeCpi=()=>recentLive()?(snapshot.live.cpi??snapshot.latest.cpi):snapshot.latest.cpi;
const freshLive=()=>snapshot.live?.nxRate!=null&&Date.now()-Date.parse(snapshot.live.observedAt)<2400000;
function goodsNxBenchmark(report,cpi){const base=report?.baseNxRate;if(!Number.isFinite(base)||base<=0||!Number.isFinite(cpi)||cpi<=0)return null;const value=base*(cpi/100);return Number.isFinite(value)&&value>0?value:null;}
function benchmarkHeadline(report,now=Date.now()){
 const liveAge=now-Date.parse(report?.live?.observedAt),live=Number.isFinite(liveAge)&&liveAge>=0&&liveAge<2400000&&Number.isFinite(report?.live?.cpi)&&report.live.cpi>0;
 const cpi=live?report.live.cpi:report?.latest?.cpi;
 return {rate:goodsNxBenchmark(report,cpi),cpi,at:live?report.live.observedAt:report?.sourceUpdatedAt,live};
}
function mainHistoryPoints(report,measure='nx'){
 return (report.history||[]).map(p=>({...p,value:measure==='nx'?goodsNxBenchmark(report,p.cpi):p.cpi,
  kind:measure==='nx'?'modelled_goods_nx_benchmark':'fixed_goods_mpi',datePrecision:'day',
  referenceNote:measure==='nx'?'Modelled: frozen reference NX rate × goods MPI / 100; not an observed cash quote.':''})).filter(p=>Number.isFinite(p.value)&&p.value>0&&Number.isFinite(Date.parse(p.at)));
}
function mainRangeFilter(p,report=snapshot){if(selectedRange==='all')return true;const end=Math.max(Date.parse(report.sourceUpdatedAt),...(report.history||[]).map(row=>Date.parse(row.at)).filter(Number.isFinite));return Date.parse(p.at)>=end-Number(selectedRange)*86400000;}
window.AstraGoodsNxBenchmark=Object.freeze({value:goodsNxBenchmark,headline:benchmarkHeadline,history:mainHistoryPoints});
const route=()=>{let page=location.hash.slice(1)||'index';page=sectionRoutes[page]||page;const itemSlug=page.startsWith('item/')?decodeURIComponent(page.slice(5)):null;if(itemSlug)page='item';if(!['index','basket','cash-basket','nx','method','sources','item','privacy','market-comparison','highlights','cash-catalog','price-check','mystery-boxes','speculation'].includes(page))page='index';document.querySelectorAll('.view').forEach(s=>s.hidden=s.id!==`view-${page}`);document.querySelectorAll('.nav-link').forEach(a=>{a.classList.toggle('active',a.hash===`#${page}`);a.setAttribute('aria-current',a.hash===`#${page}`?'page':'false');});if(page==='item'&&snapshot)renderItemPage(itemSlug);if(page==='cash-basket'&&snapshot)renderCashBasket();if(page==='market-comparison'&&snapshot)renderMarketComparison();if(page==='basket'&&snapshot)renderCpiDetail();if(page==='index'&&snapshot){renderMainChart();renderVolume();renderSmega();renderReportedHistory();}};

function spark(values,color='#87bdcf',width=100,height=30){
 const vals=values.filter(Number.isFinite); if(vals.length<2)return '';
 const low=Math.min(...vals),high=Math.max(...vals),span=high-low||1;
 const pts=vals.map((v,i)=>`${(i/(vals.length-1)*width).toFixed(2)},${(height-3-(v-low)/span*(height-6)).toFixed(2)}`).join(' ');
 return `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" stroke="${color}" stroke-width="1.6" fill="none" vector-effect="non-scaling-stroke"/></svg>`;
}

function chartHTML(series,{height=264,yTitle='mesos / NX',event=false,compactAxis=false,zeroBaseline=false,width=1120,allowNegative=false,dateOnlyAxis=false,allTime=false,timeAxis=false,contextStart=null}={}){
 const chartId='plot-'+(++chartSerial);
  const W=width,H=height,R=30,T=54,B=timeAxis?100:78;let L=55;
 series=series.map(s=>({...s,points:s.points.filter(p=>Number.isFinite(p.value)&&Number.isFinite(Date.parse(p.at))&&launchPeriodFilter(p))}));
 const all=series.flatMap(s=>s.points);
 if(!all.length)return '<div class="empty">No observations in this range. Missing history is not interpolated.</div>';
 let xmin=Math.min(...all.map(p=>Date.parse(p.at))),xmax=Math.max(...all.map(p=>Date.parse(p.at)));
 // All-time launch context may precede the first recorded day; no price point is added.
 const foundersDay=Date.parse('2026-10-06T00:00:00Z');
 if(allTime&&selectedLaunchPeriod!=='grand'&&xmin>foundersDay&&xmin<Date.parse('2026-10-08T00:00:00Z'))xmin=foundersDay;
 if(allTime&&Number.isFinite(Date.parse(contextStart))&&Date.parse(contextStart)<xmin)xmin=Date.parse(contextStart);
 if(xmin===xmax){xmin-=43200000;xmax+=43200000;}
 let low=Math.min(...all.map(p=>p.value)),high=Math.max(...all.map(p=>p.value)); const pad=(high-low)*.15||Math.max(high*.1,1);low=allowNegative?low-pad:Math.max(0,low-pad);high+=pad;if(zeroBaseline)low=0;
 const axisSize=W<500?14:15,axisValues=Array.from({length:5},(_,i)=>low+(high-low)*i/4);let axisLabels=axisValues.map(value=>compactAxis?compact(value):number(value,high<40?1:0));
 if(Math.max(...axisLabels.map(label=>label.length))*axisSize*.6+16>W*.32)axisLabels=axisValues.map(value=>{const label=compact(value);return label.length>10?value.toExponential(1):label;});
 L=Math.max(55,Math.ceil(Math.max(...axisLabels.map(label=>label.length))*axisSize*.6)+16);
 const x=t=>L+(Date.parse(t)-xmin)/(xmax-xmin)*(W-L-R), y=v=>T+(high-v)/(high-low)*(H-T-B);
 let out=`<svg viewBox="0 0 ${W} ${H}" data-chart-axes="spaced" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg"><title>${esc(yTitle)} over time</title><defs><linearGradient id="${chartId}-fill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#87bdcf" stop-opacity=".15"/><stop offset="1" stop-color="#87bdcf" stop-opacity="0"/></linearGradient><clipPath id="${chartId}-clip"><rect x="${L}" y="${T}" width="${W-L-R}" height="${H-T-B}"/></clipPath></defs>`;
 for(let i=0;i<=4;i++){const v=low+(high-low)*i/4,yp=y(v);out+=`<line x1="${L}" x2="${W-R}" y1="${yp}" y2="${yp}" stroke="#2c3c46" stroke-dasharray="3 6"/><text x="${L-12}" y="${yp+5}" text-anchor="end" class="chart-y-tick" style="font-size:${axisSize}px;font-weight:650;fill:#eae7dc">${axisLabels[i]}</text>`;}
  const tickSize=W<500?13:14,zone=dateOnlyAxis?'UTC':displayTimeZone;
  const dateText=date=>{if(W<600)return date.toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:zone});const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:zone}).formatToParts(date).map(part=>[part.type,part.value]));return `${parts.year}-${parts.month}-${parts.day}`;};
  const preferredTicks=W<500?2:W<800?3:5,maxDateLength=Math.max(dateText(new Date(xmin)).length,dateText(new Date(xmax)).length),minTickSpacing=maxDateLength*tickSize*.6*1.5+8,ticks=Math.max(1,Math.min(preferredTicks,Math.floor((W-L-R)/minTickSpacing)));
  for(let i=0;i<=ticks;i++){const t=xmin+(xmax-xmin)*i/ticks,date=new Date(t),tickX=x(new Date(t).toISOString()),anchor=i===0?'start':i===ticks?'end':'middle',clock=timeAxis?date.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:displayTimeZone}):'';
   out+=`<line class="chart-x-grid" x1="${tickX}" x2="${tickX}" y1="${T}" y2="${H-B}" stroke="#91a5af" stroke-opacity=".22" stroke-dasharray="3 6" vector-effect="non-scaling-stroke"/><line class="chart-x-mark" x1="${tickX}" x2="${tickX}" y1="${H-B}" y2="${H-B+7}" stroke="#91a5af" stroke-opacity=".7" vector-effect="non-scaling-stroke"/><text x="${tickX}" y="${H-(timeAxis?74:52)}" text-anchor="${anchor}" class="chart-x-tick" data-tick-at="${date.toISOString()}" style="font-size:${tickSize}px;font-weight:500;fill:#d4ddd5">${dateText(date)}${timeAxis?`<tspan x="${tickX}" dy="20">${clock}</tspan>`:''}</text>`;
  }
  const rateAxis=/NX/.test(yTitle)?`Rate (${yTitle})`:yTitle;
  out+=`<text x="${L+(W-L-R)/2}" y="18" text-anchor="middle" class="chart-y-axis-label" style="font-size:${W<500?12:14}px;font-weight:650;fill:#eae7dc">${esc(rateAxis)}</text><text x="${L+(W-L-R)/2}" y="${H-24}" text-anchor="middle" class="chart-x-axis-label" style="font-size:${W<500?12:14}px;font-weight:650;fill:#eae7dc">${esc(timeAxis?'Time ('+displayTimeZone+')':'Date')}</text>`;

 let launchMarkers='';
 for(const launch of LAUNCH_EVENTS){
  if(!launchPeriodFilter({day:launch.day}))continue;
  const start=Date.parse(launch.day+'T00:00:00Z'),end=start+86400000;
  if(end<=xmin||start>xmax)continue;
  const primary=launch.id==='grand-launch',color=primary?'#edc471':'#89c6b0';
  const left=x(new Date(Math.max(start,xmin)).toISOString()),right=x(new Date(Math.min(end,xmax)).toISOString()),mark=x(new Date(Math.min(xmax,Math.max(xmin,start+43200000))).toISOString());
  const maxLabelWidth=Math.max(16,2*Math.min(mark-4,W-4-mark)),preferredSize=primary?12:9,dayLabel='Oct '+Number(launch.day.slice(-2)),fullLabel=(primary?'GRAND LAUNCH':launch.label)+' · '+dayLabel;
  let lines=[fullLabel];if(fullLabel.length*preferredSize*.62+10>maxLabelWidth)lines=[primary?'GRAND LAUNCH':launch.label,dayLabel];if(primary&&lines[0].length*preferredSize*.62+10>maxLabelWidth)lines=['GRAND','LAUNCH',dayLabel];
  const longest=Math.max(...lines.map(line=>line.length)),fontSize=Math.min(preferredSize,(maxLabelWidth-8)/(longest*.62)),lineHeight=fontSize*1.25,labelWidth=Math.min(maxLabelWidth,longest*fontSize*.62+8),labelY=T+2,labelHeight=lineHeight*lines.length+8,lineStart=labelY+labelHeight+6;
  launchMarkers+=`<g class="launch-event" data-event-id="${launch.id}" data-event-day="${launch.day}" data-event-date-precision="day"><title>${esc(launch.detail)}. Shaded calendar day and marker are date context, not an intraday split of daily aggregates.</title><rect x="${left}" y="${T}" width="${Math.max(0,right-left)}" height="${H-T-B}" fill="${color}" opacity="${primary?'.09':'.04'}"/><line x1="${mark}" x2="${mark}" y1="${lineStart}" y2="${H-B}" stroke="${color}" stroke-width="${primary?2.5:1}" stroke-opacity="${primary?1:.55}" ${primary?'':'stroke-dasharray="4 5"'}/><rect class="launch-label-background" x="${mark-labelWidth/2}" y="${labelY}" width="${labelWidth}" height="${labelHeight}" rx="3" fill="var(--surface, #172530)" opacity=".96"/><text x="${mark}" y="${labelY+fontSize+3}" text-anchor="middle" style="font-size:${fontSize}px;font-weight:${primary?700:400};fill:${color}">${lines.map((line,i)=>`<tspan x="${mark}" dy="${i?lineHeight:0}">${esc(line)}</tspan>`).join('')}</text></g>`;

 }
 if(event){const mark=x('2026-10-25T12:00:00Z');if(mark>=L&&mark<=W-R)out+=`<line x1="${mark}" x2="${mark}" y1="${T}" y2="${H-B}" stroke="#6d6650" stroke-dasharray="3 5"/><text x="${mark+6}" y="${T+10}" style="font-size:8px;fill:#b4a983">Wolbi supply shift*</text>`;}
 for(let si=0;si<series.length;si++){
  const s=series[si];const pts=s.points.filter(p=>Number.isFinite(p.value)).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));if(!pts.length)continue;
  const pointString=pts.map(p=>`${x(p.at).toFixed(2)},${y(p.value).toFixed(2)}`).join(' ');
  if(si===0&&s.fill!==false&&pts.length>1)out+=`<polygon points="${x(pts[0].at)},${H-B} ${pointString} ${x(pts.at(-1).at)},${H-B}" fill="url(#${chartId}-fill)" clip-path="url(#${chartId}-clip)"/>`;
  if(s.line!==false&&pts.length>1){let segments=[[]];for(const p of pts){const part=segments.at(-1);if(part.length&&s.maxGapMs&&Date.parse(p.at)-Date.parse(part.at(-1).at)>s.maxGapMs)segments.push([]);segments.at(-1).push(p);}for(const part of segments.filter(p=>p.length>1))out+=`<polyline points="${part.map(p=>`${x(p.at).toFixed(2)},${y(p.value).toFixed(2)}`).join(' ')}" stroke="${s.color}" stroke-width="2.2" fill="none" ${s.dash||s.dashArray?`stroke-dasharray="${esc(s.dashArray||'5 5')}" stroke-linecap="${s.dashArray==='1 6'?'round':'butt'}"`:''} vector-effect="non-scaling-stroke" clip-path="url(#${chartId}-clip)"/>`;}

  for(const p of pts){
   const dayPrecision=p.datePrecision==='day'||!!p.day||!!p.date,dateLabel=p.kind==='cash_benchmark_carry_forward'?'Cash calculation as of '+utc(p.benchmarkAsOf):dayPrecision?(p.date||p.day||p.at.slice(0,10)):utc(p.at),note=[p.kind==='cash_benchmark_carry_forward'?'carry-forward reference at '+utc(p.at)+'; not an hourly cash trade':'',p.kind==='qualified_intraday_cash_benchmark'?'genuine qualified intraday observation':'',p.partial?'partial source interval':'',p.sampleCount!=null?'source sample '+p.sampleCount:'',p.measurementWindow==='trailing_24_hours_at_unspecified_report_time'?'trailing 24h at unspecified report time':'',p.p25!=null?'middle half '+number(p.p25,1)+'–'+number(p.p75,1):'',p.kind==='rolling_scanner_reference'?'capture time; underlying observation time unknown':'',p.referenceNote||''].filter(Boolean).join(' · ');
   out+=`<circle cx="${x(p.at)}" cy="${y(p.value)}" r="${s.line===false?4:2.6}" fill="${s.line===false?'#172530':s.color}" stroke="${s.color}" stroke-width="1.5" data-chart-value="${p.value}" data-chart-series="${esc(p.seriesLabel||s.name)}" data-chart-date="${esc(p.at)}" data-chart-date-label="${esc(dateLabel)}" data-chart-date-precision="${dayPrecision?'day':'timestamp'}" data-chart-unit="${esc(yTitle)}" data-chart-note="${esc(note)}"><title>${esc(p.seriesLabel||s.name)} · ${esc(dateLabel)}${dayPrecision?' · source time unspecified':''}: ${number(p.value,1)} ${esc(yTitle)}${note?' · '+esc(note):''}</title></circle>`;
  }
 }
 out+=launchMarkers+'</svg>';return out;
}

function rangeFilter(p){if(selectedRange==='all')return true;const end=Math.max(Date.parse(snapshot.sourceUpdatedAt),...(snapshot.intraday||[]).map(p=>Date.parse(p.observedAt)),...(snapshot.comparisons||[]).map(p=>Date.parse(p.observedAt)),...(snapshot.rollingReferenceHistory||[]).map(p=>Date.parse(p.at)),...(snapshot.smega||[]).map(p=>Date.parse(p.at)));return Date.parse(p.at)>=end-Number(selectedRange)*86400000;}
function renderMainChart(){
 const model=metric==='nx',series=[{name:model?'Goods-inflation NX benchmark · modelled':'Fixed-basket MPI',color:'#87bdcf',fill:false,maxGapMs:129600000,points:mainHistoryPoints(snapshot,metric).filter(p=>mainRangeFilter(p))}];
 document.querySelectorAll('[data-main-overlay],[data-main-overlay-legend]').forEach(node=>node.hidden=true);
 const legend=$('main-history-legend');if(legend)legend.textContent=model?'Modelled NX benchmark · fixed goods MPI':'Fixed-basket goods MPI';
 $('main-history-title').textContent=model?'Measured NX Rate History Over Time':'Meso Price Index History Over Time';
 $('main-chart').innerHTML=chartHTML(series,{yTitle:model?'modelled mesos per NX':'MPI points',allTime:selectedRange==='all',dateOnlyAxis:true,contextStart:'2026-10-21T00:00:00Z',width:Math.max(320,($('main-chart').clientWidth||1148)-28)});
 $('main-chart').setAttribute('aria-label',model?'Modelled goods-inflation NX benchmark: frozen reference NX rate times goods MPI divided by 100, by source calendar day. Not an observed exchange quote.':'Fixed-basket meso price index over time.');
 $('chart-note').textContent=`Goods source through ${utc(snapshot.sourceUpdatedAt)}${snapshot.latest.partial?' · latest source-calendar day partial':''}. ${model?'Reference NX rate × each daily goods MPI / 100; modelled, not observed cash sales.':'Fixed goods basket; reference week = 100.'} Missing values are not filled. Observed cash estimates and other-source references remain on the cash and methodology pages.`;
}

function renderCpiDetail(){
 const end=Math.max(Date.parse(snapshot.sourceUpdatedAt),...snapshot.intraday.map(p=>Date.parse(p.observedAt)));
 const keep=p=>selectedCpiRange==='all'||Date.parse(p.at)>=end-Number(selectedCpiRange)*86400000;
 const series=[{name:'Daily fixed-basket MPI',color:'#87bdcf',points:snapshot.history.map(p=>({...p,value:p.cpi})).filter(keep)},{name:'Qualified intraday sale MPI',color:'#edc471',points:snapshot.intraday.map(p=>({at:p.observedAt,value:p.cpi})).filter(keep)}];
 $('cpi-detail-chart').innerHTML=chartHTML(series,{yTitle:'MPI points',event:false,allTime:selectedCpiRange==='all',width:Math.max(320,($('cpi-detail-chart').clientWidth||1148)-28)});
 $('cpi-detail-note').textContent=`Source through ${utc(snapshot.sourceUpdatedAt)} · latest day partial · ${snapshot.intraday.filter(p=>Number.isFinite(p.cpi)).length} qualified intraday observations · smega offers and player reports excluded`;
}
function categoryScale(values){
 const highest=Math.max(200,...values.filter(v=>Number.isFinite(v)&&v>=0));
 const padded=highest===200?200:highest<=Number.MAX_VALUE/1.1?highest*1.1:highest;
 const step=10**Math.floor(Math.log10(padded))/2,rounded=Math.ceil(padded/step)*step;
 return Number.isFinite(rounded)?Math.max(highest,rounded):highest;
}
function categoryGauge(index,scaleMax){
 if(!Number.isFinite(index)||index<0)return '<span class="muted">Index unavailable</span>';
 const upper=Math.max(200,Number.isFinite(scaleMax)&&scaleMax>0?scaleMax:categoryScale([index]),index),value=index,gradient='category-gradient-'+(++chartSerial);
 const point=(v,r=52)=>{const angle=-Math.PI+v/upper*Math.PI;return [70+r*Math.cos(angle),66+r*Math.sin(angle)];};
 const [x,y]=point(value,43),[rx1,ry1]=point(100,46),[rx2,ry2]=point(100,58),[tx,ty]=point(100,65),[bx,by]=point(value);
 const endLabel=upper>=1e6?upper.toExponential(2).replace('e+','e'):number(upper);
 return `<svg class="category-gauge" viewBox="0 0 140 88" role="img" aria-label="MPI ${number(index,1)}; reference 100; shared scale 0 to ${number(upper)}; arc fills from 0 to ${number(index,1)}" data-index="${index}" data-scale-max="${upper}"><defs><linearGradient id="${gradient}" gradientUnits="userSpaceOnUse" x1="18" y1="66" x2="122" y2="66"><stop offset="0" stop-color="#40c9d6"/><stop offset="0.5" stop-color="#f3d44a"/><stop offset="0.8" stop-color="#ed8a37"/><stop offset="1" stop-color="#ef5350"/></linearGradient></defs><path d="M18 66A52 52 0 0 1 122 66" fill="none" stroke="#3c4c40" stroke-width="8"/><path class="category-value-arc" data-start-value="0" data-end-value="${value}" d="M18 66${value>0?`A52 52 0 0 1 ${bx} ${by}`:''}" fill="none" stroke="url(#${gradient})" stroke-width="8"/><line class="category-reference" x1="${rx1}" y1="${ry1}" x2="${rx2}" y2="${ry2}" stroke="#e3e4d6" stroke-width="2"/><line class="category-needle" x1="70" y1="66" x2="${x}" y2="${y}" stroke="#e3e4d6" stroke-width="2"/><circle cx="70" cy="66" r="4" fill="#e3e4d6"/><text x="${Math.max(12,Math.min(128,tx))}" y="${Math.max(8,ty-2)}" text-anchor="middle">100</text><text x="14" y="84">0</text><text class="category-scale-end" x="126" y="84" text-anchor="end">${endLabel}</text></svg>`;
}

function renderCategoryCards(){
 if(!snapshot)return;
 const reps={Scrolls:'hat-accuracy-scroll-greater',Equipment:'emerald-earrings',Weapons:'wolbi-throwing-stars',Materials:'iron-ore',Consumables:'orange-potion'};
 const gaugeMax=categoryScale(snapshot.categories.map(c=>c.index));
 $('category-cards').innerHTML=snapshot.categories.map(c=>`<article class="category-card"><button type="button" class="category-main" data-category="${esc(c.name)}"><span class="category-top">${sprite(c.name==='Consumables'?{slug:'orange-potion'}:snapshot.rows.find(r=>r.category===c.name)||{slug:reps[c.name]})}<span class="category-name">${esc(c.name)}</span></span>${categoryGauge(c.index,gaugeMax)}<strong class="category-number">${categoryValue==='percent'?percent(c.index-100):number(c.index,1)}</strong>${categoryValue==='index'?`<span class="category-change ${c.index>=100?'up':'down'}">${percent(c.index-100)}</span>`:'<span class="category-value-label">vs. fixed base</span>'}</button><span class="cat-meta"><span class="category-item-count">${c.count} ${c.count===1?'item':'items'}</span><span class="category-weight-meta" title="Average base basket weight per item; individual weights vary. Total is this category’s share of the basket."><span class="category-average-weight">Avg ${number(c.count>0?c.weight*100/c.count:null,2)}%/item</span> · <span class="category-total-weight">${number(c.weight*100,2)}% total</span>${weightHelp()}</span></span><span class="weight-track"><i style="width:${c.weight*100}%"></i></span></article>`).join('');
}

function renderReportedHistory(){
  $('reported-content').hidden=!reportedHistoryVisible;
  $('reported-heading').hidden=!reportedHistoryVisible;
  document.querySelectorAll('[data-reported-history-toggle]').forEach(button=>{button.setAttribute('aria-pressed',String(reportedHistoryVisible));button.textContent=reportedHistoryVisible?'Hide NiaDB reported history':'Show NiaDB reported history (optional)';});
  if(!reportedHistoryVisible){$('reported-chart').innerHTML='';return;}
 const history=snapshot.reportedNxHistory||{},points=(history.points||[]).map(p=>({...p,at:p.date+'T12:00:00Z',value:p.rate}));
 const captures=(snapshot.comparisons||[]).filter(p=>p.kind==='player_report').map(p=>({...p,at:p.observedAt,value:p.rate}));
 $('reported-chart').innerHTML=chartHTML([{name:'NiaDB published report (date only)',color:'#89c6b0',line:false,points},{name:'NiaDB indicator capture (source observation time unknown)',color:'#d9a1a0',line:false,points:captures}],{event:false,yTitle:'reported mesos per NX',dateOnlyAxis:true,allTime:true,width:Math.max(320,($('reported-chart').clientWidth||1148)-28)});
 $('reported-history-note').textContent=`${points.length} exact published daily values · ${captures.length} dated indicator captures · gaps are left empty`;
 $('reported-history-sources').innerHTML=`Published report dates have day precision; their horizontal positions represent calendar days, not known intraday trade times. The October 14 indicator explicitly covers a trailing 24-hour window at an unspecified report time. Captures use this site’s pull time because the underlying observation time is unknown. These player-reported indicators never enter the sale estimate or MPI. Sources: ${(history.sources||[]).map((source,i)=>`<a href="${esc(source.sourceUrl)}" target="_blank" rel="noreferrer">NiaDB report ${i+1}</a> (last pulled ${esc(utc(source.capturedAt))})`).join(' · ')}.`;
}

function deriveSmegaSpreads(points){
 const groups=new Map();
 for(const p of points){if(!['sell','buy'].includes(p.side)||!Number.isFinite(p.rate)||p.rate<=0||!Number.isFinite(Date.parse(p.at)))continue;const at=new Date(p.at).toISOString(), key=(p.sourceUrl||'')+'|'+at;let g=groups.get(key);if(!g){g={at,sourceUrl:p.sourceUrl};groups.set(key,g);}if(g[p.side]&&g[p.side].rate!==p.rate)g.conflict=true;else g[p.side]=p;}
 return [...groups.values()].filter(g=>g.sell&&g.buy&&!g.conflict).map(g=>{const spread=g.sell.rate-g.buy.rate,midpoint=(g.sell.rate+g.buy.rate)/2;return {at:g.at,sourceUrl:g.sourceUrl,ask:g.sell.rate,bid:g.buy.rate,midpoint,spread,spreadPercent:spread/midpoint*100,askCount:g.sell.sampleCount??g.sell.distinctSenders??null,bidCount:g.buy.sampleCount??g.buy.distinctSenders??null,partial:!!(g.sell.partial||g.buy.partial)};}).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
}
function cashBenchmarkSeries(report,visiblePoints){
 const times=visiblePoints.map(point=>Date.parse(point.at)).filter(Number.isFinite);if(!times.length)return [];
 const start=Math.min(...times),end=Math.max(...times),observations=new Map();
 const add=(at,value,kind)=>{const time=Date.parse(at);if(Number.isFinite(time)&&Number.isFinite(value)&&value>0&&time<=end)observations.set(time,{at,time,value,kind});};
 // Daily history has day precision. Only the actual feed publication starts this reference.
 add(report.sourceUpdatedAt,report.latest?.nxRate,'daily_publication');
 for(const point of report.intraday||[])add(point.observedAt,point.nxRate,'qualified_intraday');
 const known=[...observations.values()].sort((a,b)=>a.time-b.time),series=[];
 for(let i=0;i<known.length;i++){
  const observation=known[i],from=Math.max(start,observation.time),to=Math.min(end,known[i+1]?.time??end);if(from>to)continue;
  const point=time=>({at:new Date(time).toISOString(),value:observation.value,benchmarkAsOf:observation.at,kind:'cash_benchmark_carry_forward'});
  series.push({name:'Cash calculation · carry-forward reference',color:'#a8c4ef',fill:false,dashArray:'8 4',points:from===to?[point(from)]:[point(from),point(to)]});
 }
 const qualified=known.filter(point=>point.kind==='qualified_intraday'&&point.time>=start).map(point=>({at:point.at,value:point.value,kind:'qualified_intraday_cash_benchmark'}));
 if(qualified.length)series.push({name:'Qualified intraday cash observations',color:'#a8c4ef',fill:false,line:false,points:qualified});
 return series;
}
function updateSmegaComparisonControls(){
 document.querySelectorAll('button[data-smega-comparison-toggle]').forEach(button=>{button.setAttribute('aria-pressed',String(smegaComparison));button.textContent=(smegaComparison?'Hide':'Show')+' midpoint + cash benchmark';});
 document.querySelectorAll('[data-smega-comparison-content]').forEach(node=>node.hidden=!smegaComparison);
}
function smegaInputs(){return (snapshot.smega||[]).filter(p=>p.sourceUrl===snapshot.smegaSource?.sourceUrl&&p.aggregation==='source_published_hourly');}
function smegaWindow(points,hours){
 const valid=points.filter(p=>Number.isFinite(Date.parse(p.at))),end=Math.max(0,...valid.map(p=>Date.parse(p.at)));
 return hours==='all'?valid:valid.filter(p=>Date.parse(p.at)>end-Number(hours)*3600000&&Date.parse(p.at)<=end);
}
// Window proxy from published hourly medians, not a pooled raw-price median.
function summarizeSmegaWindow(points){
 const buckets=new Map();
 for(const point of points){
  const count=point.sampleCount??point.distinctSenders;
  if(!['buy','sell'].includes(point.side)||!Number.isFinite(point.rate)||point.rate<=0||!Number.isFinite(count)||count<=0||!Number.isFinite(Date.parse(point.at)))continue;
  const key=(point.sourceUrl||'')+'|'+new Date(point.at).toISOString()+'|'+point.side,prior=buckets.get(key);
  if(prior){if(prior.rate!==point.rate||prior.count!==count)prior.conflict=true;}
  else buckets.set(key,{rate:point.rate,count,side:point.side});
 }
 const side=type=>{
  const rows=[...buckets.values()].filter(row=>row.side===type&&!row.conflict).sort((a,b)=>a.rate-b.rate),total=rows.reduce((sum,row)=>sum+row.count,0);let cumulative=0,value=null;
  for(let i=0;i<rows.length;i++){cumulative+=rows[i].count;if(cumulative>=total/2){value=cumulative===total/2&&rows[i+1]?(rows[i].rate+rows[i+1].rate)/2:rows[i].rate;break;}}
  return {value,hours:rows.length,posterHours:total};
 };
 const ask=side('sell'),bid=side('buy'),difference=ask.value!==null&&bid.value!==null?ask.value-bid.value:null,midpoint=difference===null?null:(ask.value+bid.value)/2;
 return {ask,bid,difference,differencePercent:midpoint>0?difference/midpoint*100:null};
}
function renderSmega(){
 updateSmegaComparisonControls();
 const inputs=smegaInputs(),pairs=deriveSmegaSpreads(inputs),visible=smegaWindow(inputs,selectedSmegaRange).filter(p=>launchPeriodFilter(p)),visibleHours=new Set(visible.map(p=>Date.parse(p.at))),spreadPoints=pairs.filter(p=>visibleHours.has(Date.parse(p.at))),summary=summarizeSmegaWindow(visible);
 const sourceTimes=inputs.map(p=>Date.parse(p.at)).filter(Number.isFinite),sourceEnd=sourceTimes.length?Math.max(...sourceTimes):null,orderedHours=[...visibleHours].sort((a,b)=>a-b),windowLabel=selectedSmegaRange==='all'?'All retained source hours':`Last ${selectedSmegaRange} source hours`;
 document.querySelectorAll('[data-smega-range]').forEach(button=>{const active=button.dataset.smegaRange===selectedSmegaRange;button.classList.toggle('selected',active);button.setAttribute('aria-pressed',String(active));});
 $('smega-point-note').textContent=`${windowLabel}${sourceEnd!==null?' · as of source hour '+utc(new Date(sourceEnd).toISOString()):''} · ${visibleHours.size}${selectedSmegaRange==='all'?'':' / '+selectedSmegaRange} hour buckets available${selectedLaunchPeriod!=='all'?' after launch-period filter':''}.`;
 const detail=side=>`${side.hours} qualifying hourly medians · ${number(side.posterHours)} poster-hour appearances`;
 const stats=[['SELLERS ASK · WINDOW PROXY',summary.ask.value===null?'—':'1:'+number(summary.ask.value,1),detail(summary.ask),'sell'],['BUYERS BID · WINDOW PROXY',summary.bid.value===null?'—':'1:'+number(summary.bid.value,1),detail(summary.bid),'buy'],['WINDOW PROXY DIFFERENCE',number(summary.difference,1),'mesos per NX · ask proxy minus bid proxy','gap'],['DIFFERENCE / PROXY MIDPOINT',summary.differencePercent===null?'—':number(summary.differencePercent,1)+'%','Window proxies; not a matched-hour spread','gap']];
 $('smega-stats').innerHTML=stats.map(([label,value,detail,side])=>`<div class="stat-cell" data-offer-side="${side}"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(detail)}</small></div>`).join('');
 const width=Math.max(320,Math.min($('smega-offer-chart').clientWidth||720,720)-28);
 const offerSeries=[{name:'MapleStory Market sellers ask',color:'#edc471',fill:false,maxGapMs:5400000,points:visible.filter(p=>p.side==='sell').map(p=>({...p,value:p.rate}))},{name:'MapleStory Market buyers bid',color:'#89c6b0',fill:false,maxGapMs:5400000,points:visible.filter(p=>p.side==='buy').map(p=>({...p,value:p.rate}))}];
 if(smegaComparison){offerSeries.push({name:'Matched-hour bid/ask midpoint',color:'#d7c2e8',fill:false,dashArray:'1 6',maxGapMs:5400000,points:spreadPoints.map(p=>({...p,value:p.midpoint}))});offerSeries.push(...cashBenchmarkSeries(snapshot,visible));}
 $('smega-offer-chart').innerHTML=chartHTML(offerSeries,{yTitle:'mesos per NX',event:false,allTime:selectedSmegaRange==='all',timeAxis:true,width});
 $('smega-comparison-note').textContent=`Cash calculation published ${utc(snapshot.sourceUpdatedAt)}: ${number(snapshot.latest.nxRate,1)} mesos per NX. Its dashed reference starts no earlier than publication and is explicitly carried forward; it is not an hourly cash-sale series. Genuine qualified intraday observations are shown only when recorded. The dotted midpoint uses matching source/hour ask and bid medians only; a missing side leaves no midpoint.`;
 const capturedAt=snapshot.smegaSource?.capturedAt,captureAge=Date.parse(capturedAt),age=Number.isFinite(captureAge)?Math.max(0,(Date.now()-captureAge)/3600000):null;
 $('smega-history-note').textContent=`Headline proxies: poster-count-weighted medians of hourly medians, not true pooled offer-price medians. ${orderedHours.length?utc(new Date(orderedHours[0]).toISOString())+' – '+utc(new Date(orderedHours.at(-1)).toISOString()):'No source hours in this view'} · ${spreadPoints.length} matched hour pairs available${visible.some(p=>p.partial)?' · includes partial source hour':''} · ${inputs.length} retained side/hour observations · last pulled ${utc(capturedAt)}${age===null?'':' ('+number(age,1)+'h ago)'}. Missing sides and buckets are not filled. Hourly poster counts are not summed into unique people; the same poster may appear across hours. Cash-item sales appear in their own chart.`;
}

function selectedVolumeRows(){
 const rows=snapshot.volumeHistory||[];
 return ($('volume-period').value==='all'?rows:rows.filter(p=>!p.partial).slice(-7)).filter(p=>launchPeriodFilter(p));
}
function renderVolume(){
 const rows=selectedVolumeRows(), mode=$('volume-metric').value;
 if(!rows.length){$('volume-stats').innerHTML='';$('volume-chart').innerHTML='<div class="empty">No recorded volume observations in the selected ranges.</div>';$('volume-note').textContent='Try All launch periods or a wider volume range.';return;}
 const total=key=>rows.reduce((sum,p)=>sum+p[key],0), all=total('allMesos'), basket=total('basketMesos');
 const stats=[['FULL FEED · EST. MESOS',compact(all),number(all)+' mesos'],['50-ITEM BASKET · EST. MESOS',compact(basket),number(basket)+' mesos'],['BASKET SHARE OF TURNOVER',all?number(basket/all*100,1)+'%':'—','Basket is included in the full feed'],['RECORDED SALES VOLUME',compact(total('allSoldVolume')),number(total('basketSoldVolume'))+' within the basket']];
 $('volume-stats').innerHTML=stats.map(([label,value,detail])=>`<div class="stat-cell"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(detail)}</small></div>`).join('');
 const series=[['Full source feed','#87bdcf','all'],['Fixed 50-item basket','#edc471','basket']].map(([name,color,prefix])=>{let running=0;return {name,color,points:rows.map(p=>{const daily=p[prefix+(mode==='sales'?'SoldVolume':'Mesos')];running+=daily;return {...p,value:mode==='cumulative'?running:daily};})};});
 const unit=mode==='sales'?'recorded sales / day':mode==='cumulative'?'cumulative estimated mesos':'estimated mesos / day';
 $('volume-chart').innerHTML=chartHTML(series,{yTitle:unit,event:false,compactAxis:true,zeroBaseline:true,allTime:$('volume-period').value==='all',width:Math.max(320,($('volume-chart').clientWidth||1148)-28)});
 $('volume-chart').setAttribute('aria-label',unit+' for the full feed and fixed 50-item basket');
 $('volume-note').textContent=`${rows[0].day} – ${rows.at(-1).day} · ${rows.length} recorded days${rows.some(p=>p.partial)?' · latest day partial':''}${mode==='cumulative'?' · cumulative totals start at this period’s first day':''} · source published ${utc(snapshot.sourceUpdatedAt)}`;
}

function sourceHealth(data,now=Date.now()){
 const age=value=>{const time=Date.parse(value);return Number.isFinite(time)?Math.max(0,(now-time)/60000):null;};
 const dailyAge=age(data.sourceUpdatedAt),checkAge=age(data.sourceStatus?.checkedAt),failed=data.sourceStatus?.status==='degraded';
 const daily={tone:dailyAge==null||dailyAge>4320?'red':failed||dailyAge>2160?'amber':'green',state:dailyAge==null?'Source time unavailable':failed?'Retained daily data':dailyAge>4320?'Daily source older than 72h':dailyAge>2160?'Daily source delayed':'Dated daily source · within 36h band'};
 const collector={tone:failed||checkAge>180?'red':checkAge==null||checkAge>30?'amber':'green',state:failed?'Last check failed · last good retained':checkAge==null?'No collector check recorded':checkAge>180?'No check within 3h':checkAge>30?'Collector check delayed':'Collector check within 30 min'};
 const intraday=(data.intraday||[]).filter(p=>Number.isFinite(p.cpi)||Number.isFinite(p.nxRate)),liveAge=age(data.live?.observedAt);
 const liveQualified=liveAge!=null&&liveAge<40&&(Number.isFinite(data.live?.cpi)||Number.isFinite(data.live?.nxRate));
 return {daily,collector,intraday:{tone:liveQualified?'green':'amber',state:liveQualified?'Qualified recent intraday input':intraday.length?`${intraday.length} qualified dated points · no fresh live input`:'0 qualified intraday points · not connected'},
  reference:{tone:'amber',state:data.rollingReference?'Dated capture · observation time unknown':'No rolling capture connected'},
  offers:{tone:'amber',state:data.smegaSource?'Dated hourly capture · unattended collection not connected':'Hourly offers not connected'}};
}
function statusDot(tone){return `<i class="source-status-dot status-${tone}" aria-hidden="true"></i>`;}
function renderOverviewFreshness(){
 if(!snapshot)return;
 const health=sourceHealth(snapshot);
 const rows=[['Daily market source',utc(snapshot.sourceUpdatedAt),health.daily],['Collector checked',utc(snapshot.sourceStatus.checkedAt),health.collector],['Qualified intraday',String(snapshot.intraday.filter(p=>Number.isFinite(p.cpi)||Number.isFinite(p.nxRate)).length)+' dated points',health.intraday],['Rolling reference capture',snapshot.rollingReference?utc(snapshot.rollingReference.capturedAt):'Not connected',health.reference],['Hourly offers capture',snapshot.smegaSource?utc(snapshot.smegaSource.capturedAt):'Not connected',health.offers]];
 $('overview-freshness').innerHTML=rows.map(([label,value,state])=>`<div data-status-tone="${state.tone}"><dt>${statusDot(state.tone)}${esc(label)}</dt><dd>${esc(value)}<small>${esc(state.state)}</small></dd></div>`).join('');
}
function renderFreshness(){
 if(!snapshot)return;
 const stamp=recentLive()?snapshot.live.observedAt:snapshot.sourceUpdatedAt;const age=(Date.now()-Date.parse(stamp))/60000;
 $('header-freshness').textContent=`${freshLive()?'Live observation':'Source snapshot'} · ${utc(stamp)}`;
 const health=sourceHealth(snapshot),tone=health.collector.tone==='red'?'red':health.daily.tone;
 $('status-dot').className='dot '+(tone==='green'?'':tone);$('status-dot').setAttribute('aria-label',health.daily.state+'; '+health.collector.state);
 renderOverviewFreshness();
 $('notice').className='notice '+(snapshot.sourceStatus.status==='degraded'?'error':'');
 $('notice').textContent=snapshot.sourceStatus.status==='degraded'?`Source unavailable. Showing the last valid market data from ${utc(snapshot.sourceUpdatedAt)}. ${snapshot.sourceStatus.detail}`:freshLive()?`Intraday scanner data · ${utc(snapshot.live.observedAt)}. Market history and tables update together when a new snapshot is available.`:`Dated market snapshot · ${utc(snapshot.sourceUpdatedAt)}. Checked ${utc(snapshot.sourceStatus.checkedAt)}. ${snapshot.rollingReference?'Rolling scanner references and hourly smega offers are available in NX → meso; these captures are dated separately.':snapshot.liveNote}`;
}

function render(){
 document.querySelectorAll('[data-reference-period]').forEach(node=>node.textContent=referencePeriodLabel());
 const benchmark=benchmarkHeadline(snapshot),rate=benchmark.rate,cpi=activeCpi();
 $('main-rate').textContent=number(rate,2);renderRateCaption();
 const headlineAt=benchmark.at;
 $('rate-kind').textContent='As of MPI source '+utc(headlineAt);$('rate-kind').dataset.marketAt=headlineAt;$('rate-kind').dataset.observationKind=benchmark.live?'live':'daily';
 $('rate-change').textContent=rate===null?'—':percent(benchmark.cpi-100);$('main-cpi').textContent=number(cpi,1);$('cpi-change').textContent=percent(cpi-100);
 const complete=snapshot.history.filter(p=>!p.partial&&Number.isFinite(p.cpi)).at(-1);
 $('cpi-period').textContent=`${snapshot.latest.day} · ${snapshot.latest.partial?'partial day':'complete day'} · ${number(snapshot.latest.coverage*100,1)}% of weight observed on this day`;
 $('mpi-explanation').textContent=Number.isFinite(cpi)?`MPI ${number(cpi,1)} means this fixed basket’s weighted prices are ${number(Math.abs(cpi-100),1)}% ${cpi>=100?'higher':'lower'} than their reference-week level of 100. It tracks selected item prices, not the amount of mesos in circulation.`:'The MPI needs complete priced basket coverage; a missing value is not a zero-price market.';
 $('cpi-complete-note').textContent=`Basket v${snapshot.basketVersion}: fixed reference spending weights, ${snapshot.baseStart}–${snapshot.baseEnd}. ${complete?'Last complete day '+complete.day+': '+number(complete.cpi,1)+'.':''}`;
 $('cpi-spark').innerHTML=spark(snapshot.history.map(p=>p.cpi));
 $('market-stats').innerHTML=[['SOURCE SALES SINCE LAUNCH',number(snapshot.salesSinceLaunch),'All items · recorded sold volume'],['ITEMS IN THE FEED',number(snapshot.itemsAvailable),'50 items in the fixed MPI basket'],['BASKET SOLD VOLUME / 7D',number(snapshot.basketRecentQuantity),`${number(snapshot.quantityCoverage*100,1)}% of feed volume`],['SOURCE CHECK INTERVAL','10 minutes','Market timestamp shown separately']].map(([label,val,sub])=>`<div class="stat-cell"><span>${esc(label)}</span><strong>${esc(val)}</strong><small>${esc(sub)}</small></div>`).join('');
 renderCategoryCards();
 const qualifiedDays=snapshot.rows.map(r=>r.priceDay).filter(Boolean).sort();
 $('movers-period').textContent=`${referencePeriodLabel()} reference prices → latest qualified item prices (${qualifiedDays[0]}–${qualifiedDays.at(-1)}). Contributions are index points since the fixed base, not a daily change.`;
 const movers=[...snapshot.rows].sort((a,b)=>Math.abs(b.changeContribution??b.changeBase)-Math.abs(a.changeContribution??a.changeBase)).slice(0,4);
 $('movers').innerHTML=movers.map(r=>`<div class="mover"><div class="mover-item">${sprite(r)}<div class="item-name">${nameOf(r)}<small>${esc(r.category)} · ${number(r.weight*100,1)}% weight</small></div></div><div class="mover-value">${Number.isFinite(r.changeContribution)?(r.changeContribution>=0?'+':'')+number(r.changeContribution,1)+' pts':compact(r.price)}<small class="${r.changeBase>=0?'up':'down'}">${percent(r.changeBase)} vs. base · ${esc(r.priceDay)}</small></div></div>`).join('');
 renderOverviewFreshness();
 $('wolbi-note').textContent='Citizenship-shop supply shifted this item’s price around October 25–26. This is not economy-wide deflation. '+snapshot.wolbi.text+' Similar item-specific supply shifts can occur if players raise crafting levels and unlock equipment they could not previously craft. Such a shift would not automatically indicate broad deflation.';
 $('wolbi-short').textContent='Wolbi’s item-specific supply shift needs context. See its basket note and full history.';
 $('basket-context').innerHTML=(snapshot.contextItems||[]).map(r=>`<p class="eyebrow">A SUPPLY ASTERISK</p><button class="item-link" data-item="${esc(r.slug)}">${sprite(r)}<span>${nameOf(r)}</span></button><p>${number(r.price)} mesos · ${esc(r.priceDay)}<br>zero MPI weight</p><p>Citizenship-shop supply shifted this item’s price around October 25–26. This is not economy-wide deflation.</p><a href="#item/${encodeURIComponent(r.slug)}">Full item history →</a><a href="#method">Method caveat →</a>`).join('');$('basket-context').hidden=!(snapshot.contextItems||[]).length;
 $('method-base-coverage').textContent=`The 50 selected items account for ${number(snapshot.baseTurnoverCoverageProxy*100,1)}% of qualified non-cash reference-week estimated turnover (${referencePeriodLabel()}). All items passing the liquidity rule account for ${number(snapshot.eligibleBaseTurnoverCoverageProxy*100,1)}%; the basket takes the largest 50 by reference turnover. These shares use the frozen selection source, not today’s rankings.`;
 $('method-coverage').textContent=`This basket covers ${number(snapshot.quantityCoverage*100,1)}% of the feed’s recorded seven-day sale volume and ${number(snapshot.turnoverCoverageProxy*100,1)}% of estimated meso turnover. Activity uses ${snapshot.recentStart} through the day before ${snapshot.recentEndExclusive}; reference-period membership and weights stay fixed. These shares are computed from this snapshot, not inherited from an old artifact.`;
 $('method-tiles').innerHTML=categoryItemsHTML(snapshot.rows);
 renderVolume();renderBasket();renderCpiDetail();renderCash();renderCashBasket();renderComparisons();renderSources();renderSourceComparisons();renderQuickConverter();renderMainChart();renderFreshness();route();publishMarketHighlights();
}

const referenceHelp=()=>`<sup class="weight-help"><a href="#method-reference-week" aria-label="Fixed reference period: ${esc(referencePeriodLabel())}. Read the explanation" title="Fixed reference: ${esc(referencePeriodLabel())}">?</a></sup>`;
const weightHelp=()=>'<sup class="weight-help"><a href="#method-weights" aria-label="Why this weight? Read the basket methodology" title="Why this weight?">?</a></sup>';
function tileHTML(r){return `<button class="item-tile" data-item="${esc(r.slug)}"><span class="tile-title">${sprite(r)}${nameOf(r)}</span><strong>${compact(r.price)} <small>mesos / ${esc(r.unit)}</small></strong><small>${number(r.recentQuantity)} sold volume / 7d</small><span class="tile-bottom"><span>${number(r.weight*100,2)}% weight</span><span class="${r.changeBase>=0?'up':'down'}">${percent(r.changeBase)}</span></span></button>`;}
function categoryItemsHTML(rows){
 return snapshot.categories.map(c=>{const members=rows.filter(r=>r.category===c.name);if(!members.length)return '';const weight=members.reduce((sum,r)=>sum+r.weight,0);return `<section class="method-category" aria-label="${esc(c.name)}"><h3>${esc(c.name)}<small>${members.length} ${members.length===1?'item':'items'} · ${number(weight*100,2)}% basket weight shown</small></h3><div class="tiles">${members.map(tileHTML).join('')}</div></section>`;}).join('')||'<p class="empty">No items match this search.</p>';
}
function renderBasket(){
 const query=$('basket-search').value.toLowerCase().trim(),cat=$('category-filter').value;
 let rows=snapshot.rows.filter(r=>(cat==='All categories'||r.category===cat)&&r.name.toLowerCase().includes(query));
 rows.sort((a,b)=>{const av=a[sortKey],bv=b[sortKey];return(typeof av==='string'?av.localeCompare(bv):av-bv)*(sortAsc?1:-1);});
 $('basket-summary').textContent=`${rows.length} of ${snapshot.rows.length} items · ${number(rows.reduce((n,r)=>n+r.weight,0)*100,1)}% of basket weight shown · prices from the latest qualified source day`;
 const headers=[['name','Item'],['price','Daily price'],['scanner','Rolling scanner reference'],['recentQuantity','Sold volume · 7d'],['recentTurnoverProxy','Est. turnover · 7d'],['weight','Weight'],['changeBase','Vs. base'],['history','History']];
 $('basket-table').innerHTML=`<table><thead><tr>${headers.map(([key,label])=>`<th ${key===sortKey?`aria-sort="${sortAsc?'ascending':'descending'}"`:''}>${['history','scanner'].includes(key)?label:`<button data-sort="${key}">${label} ${sortKey===key?(sortAsc?'↑':'↓'):''}</button>`}${key==='weight'?weightHelp():key==='changeBase'?referenceHelp():''}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr><td><button class="item-link" data-item="${esc(r.slug)}">${sprite(r)}<span>${nameOf(r)}<small>${esc(r.category)} · per ${esc(r.unit)} · ${esc(r.priceDay)}</small></span></button></td><td>${number(r.price)}</td><td>${referenceCell(r)}</td><td>${number(r.recentQuantity)}</td><td>${compact(r.recentTurnoverProxy)}</td><td>${number(r.weight*100,2)}%</td><td class="${r.changeBase>=0?'up':'down'}">${percent(r.changeBase)}</td><td><div class="mini-spark">${spark(r.history.map(p=>p[1]),r.changeBase>=0?'#87bdcf':'#89c6b0')}</div></td></tr>`).join('')||'<tr><td colspan="8" class="empty">No items match this search.</td></tr>'}</tbody></table>`;
 $('basket-tiles').innerHTML=rows.map(tileHTML).join('')||'<div class="empty">No items match.</div>';
 $('basket-categories').innerHTML=categoryItemsHTML(rows);
 $('basket-table').hidden=layout!=='table';$('basket-tiles').hidden=layout!=='tiles';$('basket-categories').hidden=layout!=='categories';
 document.querySelectorAll('#basket-layout [data-layout]').forEach(button=>{const selected=button.dataset.layout===layout;button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected));});
}
// Fixed single-item schedule: source gaps must not silently remove a cash item.
const CASH_SCHEDULE=Object.freeze([{"slug":"selective-5-slot-coupon","name":"Selective 5-slot Coupon","nx":5000},{"slug":"ap-reset-scroll","name":"AP Reset Scroll","nx":7000},{"slug":"sp-reset-scroll","name":"SP Reset Scroll","nx":7000},{"slug":"brown-kitty","name":"Brown Kitty","nx":3500},{"slug":"brown-puppy","name":"Brown Puppy","nx":3500},{"slug":"pink-bunny","name":"Pink Bunny","nx":3500},{"slug":"black-kitty","name":"Black Kitty","nx":3500},{"slug":"white-bunny","name":"White Bunny","nx":3500},{"slug":"black-pig","name":"Black Pig","nx":3500},{"slug":"water-of-life","name":"Water of Life","nx":2000},{"slug":"pet-name-tag","name":"Pet Name Tag","nx":1800},{"slug":"auto-hp-potion-skill","name":"Auto HP Potion Skill","nx":2500},{"slug":"auto-mp-potion-skill","name":"Auto MP Potion Skill","nx":2500},{"slug":"auto-move-skill","name":"Auto Move Skill","nx":3000},{"slug":"expanded-auto-move-skill","name":"Expanded Auto Move Skill","nx":3000},{"slug":"signature-hair-coupon","name":"Signature Hair Coupon","nx":7500},{"slug":"signature-face-coupon","name":"Signature Face Coupon","nx":5500},{"slug":"signature-hair-color-coupon","name":"Signature Hair Color Coupon","nx":4500},{"slug":"signature-eye-color-coupon","name":"Signature Eye Color Coupon","nx":2500},{"slug":"signature-skin-color-coupon","name":"Signature Skin Color Coupon","nx":2000},{"slug":"mystery-hair-coupon","name":"Mystery Hair Coupon","nx":5500},{"slug":"mystery-face-coupon","name":"Mystery Face Coupon","nx":3500},{"slug":"mystery-hair-color-coupon","name":"Mystery Hair Color Coupon","nx":1700},{"slug":"red-ribbon","name":"Red Ribbon","nx":3200},{"slug":"yellow-hat","name":"Yellow Hat","nx":3200},{"slug":"red-hat","name":"Red Hat","nx":3200},{"slug":"black-hat","name":"Black Hat","nx":3200},{"slug":"red-top-hat","name":"Red Top Hat","nx":3200},{"slug":"storage-room-5-slot-coupon","name":"Storage Room 5-slot Coupon","nx":5000}]);
function buildCashPricing(report,{days=3,evidence='daily',side='sell'}={}){
 const validDay=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
 const sourceDay=String(report.sourceUpdatedAt||'').slice(0,10),end=validDay(sourceDay)?sourceDay:null;
 days=[1,3,7,14,30].includes(Number(days))?Number(days):3;
 const start=end?new Date(Date.parse(end+'T00:00:00Z')-(days-1)*86400000).toISOString().slice(0,10):null;
 const rolling=evidence==='rolling';
 const rows=CASH_SCHEDULE.map(item=>{
  const source=(report.cash||[]).find(r=>r.slug===item.slug),capture=report.rollingReference?.items?.find(r=>r.name===item.name);
  const daily=(source?.history||[]).filter(p=>Array.isArray(p)&&validDay(p[0])&&start&&p[0]>=start&&p[0]<=end&&Number.isFinite(p[1])&&p[1]>0&&Number.isFinite(p[2])&&p[2]>=5);
  const quantity=rolling?(Number.isFinite(capture?.salesCounted)&&capture.salesCounted>0?capture.salesCounted:null):daily.reduce((sum,p)=>sum+p[2],0);
  const windowDays=rolling?(Number.isFinite(capture?.windowDays)&&capture.windowDays>0?capture.windowDays:null):daily.length;
  const price=rolling?(Number.isFinite(capture?.price)&&capture.price>0?capture.price:null):(quantity>0?daily.reduce((sum,p)=>sum+p[1]*p[2],0)/quantity:null);
  const rate=price==null?null:price/item.nx;
  const eligibility=rolling?report.rollingReference?.comparison?.cashReferenceWeights?.find(r=>r.name===item.name):null;
  const referenceWeight=rolling?(eligibility?.eligible===false?0:quantity&&windowDays?quantity/(windowDays*24):0):(quantity||0);
  return {...item,price,rate,quantity:quantity||null,windowDays,statRoll:rolling?capture?.statRoll:null,referenceExclusion:eligibility?.exclusionReason||null,lowRate:!rolling&&daily.length?Math.min(...daily.map(p=>p[1]))/item.nx:null,highRate:!rolling&&daily.length?Math.max(...daily.map(p=>p[1]))/item.nx:null,referenceWeight,missing:price==null};
 });
 const eligible=rows.filter(r=>Number.isFinite(r.rate)&&r.referenceWeight>0),totalWeight=eligible.reduce((sum,r)=>sum+r.referenceWeight,0);
 const reference=totalWeight?eligible.reduce((sum,r)=>sum+r.rate*r.referenceWeight,0)/totalWeight:null;
 for(const row of rows){row.deltaPct=Number.isFinite(row.rate)&&row.referenceWeight>0&&reference>0?(row.rate/reference-1)*100:null;const advantage=row.deltaPct==null?null:row.deltaPct*(side==='buy'?-1:1);row.verdict=advantage==null?'unknown':Math.abs(advantage)<1e-9?'neutral':advantage>0?'favorable':'less-favorable';}
 return {rows,reference,start,end,days,rolling,eligibleCount:eligible.length,partial:report.latest?.partial!==false};
}
function renderCash(){
 const model=buildCashPricing(snapshot,{days:cashLookback,evidence:cashEvidence,side:cashSide}),rolling=model.rolling;
 let rows=model.rows.filter(r=>cashFilter==='all'||r.verdict===cashFilter);
 rows.sort((a,b)=>{const av=a[cashSortKey],bv=b[cashSortKey];if(cashSortKey==='name')return (cashSortAsc?1:-1)*a.name.localeCompare(b.name);if(!Number.isFinite(av))return Number.isFinite(bv)?1:a.name.localeCompare(b.name);if(!Number.isFinite(bv))return -1;return (cashSortAsc?1:-1)*(av-bv)||a.name.localeCompare(b.name);});
 const bestOrder=cashSortKey==='rate'&&cashSortAsc===(cashSide==='buy'),sortNames={name:'item name',nx:'fixed NX cost',price:'meso price',rate:'mesos per NX',quantity:'recorded volume',windowDays:'source days',lowRate:'lowest daily median / NX',highRate:'highest daily median / NX',deltaPct:'difference from reference'};
 let bestButton=$('cash-best-value');if(!bestButton){bestButton=document.createElement('button');bestButton.id='cash-best-value';bestButton.type='button';bestButton.className='secondary';bestButton.dataset.cashBestValue='';bestButton.textContent='Best value first';document.querySelector('#view-nx .cash-controls').append(bestButton);}
 bestButton.setAttribute('aria-pressed',String(bestOrder));bestButton.setAttribute('aria-label',cashSide==='sell'?'Best value first for selling NX: highest mesos per NX':'Best value first for buying NX items: lowest mesos per NX');
 const sortNote=bestOrder?`Best value first for ${cashSide==='sell'?'selling NX: highest mesos per NX.':'buying NX items: lowest mesos per NX.'}`:`Sorted by ${sortNames[cashSortKey]||cashSortKey} (${cashSortAsc?'ascending':'descending'}).`;
 $('cash-count').textContent=`${rows.length} / ${model.rows.length} FIXED-PRICE CASH ITEMS`;
 $('cash-lookback').disabled=rolling;
 document.querySelectorAll('[data-cash-side]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.cashSide===cashSide)));
 $('cash-window-note').textContent=rolling?`Captured ${utc(snapshot.rollingReference?.capturedAt)}. Each row retains its own source window; capture time is not trade time. Lookback is disabled because this capture cannot be resliced into another window.`:`${model.start||'Unknown'}–${model.end||'Unknown'} · ${model.days} source-calendar day${model.days===1?'':'s'}, inclusive. ${model.partial?'Latest source day is partial. ':''}Only days with at least 5 recorded sales qualify; missing days are not filled.`;
 const eligibleWindows=model.rows.filter(row=>row.referenceWeight>0&&Number.isFinite(row.windowDays)).map(row=>row.windowDays);
 const evidenceWindow=rolling?`Rolling capture · ${eligibleWindows.length?Math.min(...eligibleWindows)+'–'+Math.max(...eligibleWindows)+'-day item windows':'eligible item windows unavailable'} · pulled ${utc(snapshot.rollingReference?.capturedAt)}`:`Daily history · ${model.days}-day lookback · ${model.start||'Unknown'}–${model.end||'Unknown'} inclusive`;
 $('cash-reference').textContent=`Selected evidence reference (${evidenceWindow}): ${number(model.reference,2)} mesos / NX · ${model.eligibleCount} items · ${rolling?'weighted by recorded sales per hour of each item window':'weighted by recorded volume across qualifying days'}.`;
 $('cash-pricing-note').textContent=`${sortNote} ${cashSide==='sell'?'Higher mesos / NX is more favorable when selling NX.':'Lower mesos / NX is more favorable when buying NX items.'} Color and verdict compare each item with the selected evidence reference, before filters. These estimates are not executable quotes or profit calculations. This explorer differs from the Cash Basket’s frozen reference-week expenditure weights; these daily-lookback/rolling controls do not change that index.`;
 const rateChange=snapshot.baseNxRate>0&&Number.isFinite(snapshot.latest?.nxRate)?(snapshot.latest.nxRate/snapshot.baseNxRate-1)*100:null;
 $('cash-goods-comparison').innerHTML=`<h3>Cash conversion and ordinary goods measure different things.</h3><p>Latest daily cash-implied NX rate: <strong>${rateChange==null?'Unavailable':percent(rateChange)}</strong> versus its frozen reference-week rate (<a href="#method-reference-week">${esc(referencePeriodLabel())}</a>). Non-cash fixed-basket MPI: <strong>${Number.isFinite(snapshot.latest?.cpi)?percent(snapshot.latest.cpi-100):'Unavailable'}</strong> versus its base of 100 (${esc(snapshot.latest?.day||model.end)}${snapshot.latest?.partial?' · partial':''}). These are not directly comparable: NX uses cash-item ratios and changing daily volume weights; MPI uses fixed base-expenditure weights.</p><p>Cash Shop items are excluded from MPI to keep ordinary meso-goods prices separate from NX conversion and monetized-item supply. This is the non-cash index’s scope choice. A <a href="#cash-basket">separate fixed Cash Basket</a> tracks cash-item price changes. <a href="#method-weights">Read the method →</a></p>`;
 const headers=[['name','Cash item'],['nx','Fixed NX'],['price',rolling?'Captured median · mesos':'Daily-median estimate · mesos'],['rate','Mesos / NX'],['quantity','Recorded volume'],['windowDays',rolling?'Source window · days':'Qualifying days'],['lowRate','Lowest daily median / NX'],['highRate','Highest daily median / NX'],['deltaPct','Vs. reference']];
 $('cash-table').innerHTML=`<table><caption class="sr-only">Cash pricing exploration; ${rolling?'rolling scanner capture':'volume-weighted daily-median estimates'}; ${cashSide==='sell'?'selling NX':'buying NX items'}</caption><thead><tr>${headers.map(([key,label])=>`<th aria-sort="${cashSortKey===key?(cashSortAsc?'ascending':'descending'):'none'}"><button type="button" data-cash-sort="${key}">${label} ${cashSortKey===key?(cashSortAsc?'↑':'↓'):''}</button></th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr data-cash-item="${esc(r.slug)}" data-rate="${r.rate??''}" data-verdict="${r.verdict}"><td><button class="item-link" data-item="${esc(r.slug)}">${sprite(r)}<span>${esc(r.name)}<small>${rolling?(r.windowDays?`${number(r.windowDays)}-day source window`:'Source window unknown'):`${model.start||'?'}–${model.end||'?'}`}${r.missing?' · Evidence unavailable':''}${r.statRoll?' · Reported '+esc(r.statRoll):''}${r.price!=null&&r.referenceExclusion?' · Excluded from reference: '+(r.referenceExclusion==='cash_roll_may_include_upgrade_premium'?'upgrade premium not isolated':'stat roll unverified'):''}</small></span></button></td><td>${number(r.nx)}</td><td>${number(r.price,1)}</td><td class="cash-${r.verdict}">${number(r.rate,2)}</td><td>${number(r.quantity)}</td><td>${number(r.windowDays)}</td><td>${rolling?'Unavailable':number(r.lowRate,2)}</td><td>${rolling?'Unavailable':number(r.highRate,2)}</td><td class="cash-${r.verdict}">${r.deltaPct==null?'Unknown':`${percent(r.deltaPct)}<small>${r.verdict==='favorable'?'More favorable':r.verdict==='less-favorable'?'Less favorable':'At reference'}</small>`}</td></tr>`).join('')||'<tr><td colspan="9" class="empty">No items match this comparison filter.</td></tr>'}</tbody></table>`;
}

function marketComparisonModel(report){
 const day=report.latest.day,start=report.recentStart,end=report.recentEndExclusive;
 const activity=(rows,from,to)=>{let quantity=0,turnover=0,observations=0,qualifiedItems=0;const seen=new Set();
  for(const row of rows){if(seen.has(row.slug))throw new Error('Duplicate comparison cohort member');seen.add(row.slug);let qualified=false;
   for(const p of row.history||[]){if(!Array.isArray(p)||p[0]<from||p[0]>=to||!Number.isFinite(p[1])||p[1]<=0||!Number.isFinite(p[2])||p[2]<0)continue;quantity+=p[2];turnover+=p[1]*p[2];observations++;if(p[2]>=5)qualified=true;}
   if(qualified)qualifiedItems++;
  }return {quantity:observations?quantity:null,turnover:observations?turnover:null,observations,qualifiedItems};};
 const nextDay=new Date(Date.parse(day+'T00:00:00Z')+86400000).toISOString().slice(0,10);
 const cash=report.cashBasket,goodsRows=report.rows||[],cashRows=cash?.status==='ok'?cash.rows:[],nxRows=CASH_SCHEDULE.map(item=>(report.cash||[]).find(row=>row.slug===item.slug)||{...item,history:[]});
 const cohorts=[{key:'goods',name:'Goods MPI',rows:goodsRows,value:report.latest.cpi,unit:'price index · reference = 100',coverage:report.latest.coverage},
  {key:'cash',name:'Cash Basket',rows:cashRows,value:cash?.latest?.cpi,unit:'price index · reference = 100',coverage:cash?.latest?.day===day?cash.latest.coverage:null},
  {key:'nx',name:'NX sale estimate',rows:nxRows,value:report.latest.nxRate,unit:'mesos per NX',coverage:null}].map(cohort=>({...cohort,count:cohort.rows.length,current:activity(cohort.rows,day,nextDay),recent:activity(cohort.rows,start,end),carriedItems:cohort.key==='nx'?0:cohort.rows.filter(row=>row.priceDay&&row.priceDay<day).length}));
 const totals=(report.volumeHistory||[]).filter(p=>p.day>=start&&p.day<end);
 const feedQuantity=totals.length?totals.reduce((sum,p)=>sum+p.allSoldVolume,0):null,feedTurnover=totals.length?totals.reduce((sum,p)=>sum+p.allMesos,0):null;
 const nxSlugs=new Set(nxRows.map(row=>row.slug));
 return {day,start,end,partial:!!report.latest.partial,sourceUpdatedAt:report.sourceUpdatedAt,cohorts,feedQuantity,feedTurnover,cashNxOverlap:cashRows.filter(row=>nxSlugs.has(row.slug)).length};
}
function renderMarketComparison(){
 if(!$('view-market-comparison'))return;const model=marketComparisonModel(snapshot),cash=snapshot.cashBasket;
 $('market-comparison-clock').textContent=`Daily source published ${utc(model.sourceUpdatedAt)} · ${model.day}${model.partial?' is partial':''}. Reference period ${snapshot.baseStart}–${snapshot.baseEnd}; these are source-dated comparisons, not new intraday measurements.`;
 $('market-comparison-cards').innerHTML=model.cohorts.map(cohort=>`<article class="market-comparison-card"><h2>${esc(cohort.name)}</h2><strong class="market-comparison-value">${cohort.key==='nx'?'≈1:':''}${number(cohort.value,cohort.key==='nx'?2:1)}</strong><small>${cohort.key==='nx'?'NX : mesos':esc(cohort.unit)}</small><p>${cohort.count} ${cohort.key==='nx'?'fixed-NX-cost items':'frozen members'} · ${cohort.current.qualifiedItems} with ≥5 recorded sales on ${esc(model.day)}</p><p>${cohort.key==='nx'?'Daily quantity-weighted item price / NX cost; no carried price enters this day’s rate.':`${Number.isFinite(cohort.coverage)?number(cohort.coverage*100,1)+'% of fixed weight observed on this day':'Observed-weight coverage unavailable'} · ${cohort.carriedItems} earlier qualifying prices carried.`}</p><small>${cohort.key==='cash'?`Cash definition v${cash?.version||'—'} · ${cash?.missingBaselineCount??'—'} configured items lack a qualifying baseline.`:cohort.key==='goods'?`Goods definition v${snapshot.basketVersion} · fixed base-expenditure weights.`:'The explorer’s default 3-day window is a separate table estimate; it is not this daily headline.'}</small></article>`).join('');
 $('market-comparison-window').textContent=`Common activity window: ${model.start} ≤ source day < ${model.end} (seven complete source-calendar days). Denominator: ${number(model.feedQuantity)} recorded source counts and ${number(model.feedTurnover)} estimated mesos across the published feed (${number(snapshot.itemsAvailable)} catalog items).`;
 const share=(value,total)=>Number.isFinite(value)&&total>0?value/total*100:null;
 $('market-comparison-table').innerHTML=`<table data-search-key="market-cohort-comparison"><thead><tr><th>Measure</th><th>Qualified items on latest source day</th><th>Latest day recorded count</th><th>Latest day estimated mesos</th><th>7-day recorded count</th><th>7-day estimated mesos</th><th>Share of feed count · 7d</th><th>Share of feed estimated mesos · 7d</th></tr></thead><tbody>${model.cohorts.map(c=>{const qShare=share(c.recent.quantity,model.feedQuantity),eShare=share(c.recent.turnover,model.feedTurnover);return `<tr><td>${esc(c.name)}</td><td data-sort-value="${c.current.qualifiedItems}">${c.current.qualifiedItems} / ${c.count}</td><td data-sort-value="${c.current.quantity??''}">${number(c.current.quantity)}</td><td data-sort-value="${c.current.turnover??''}">${number(c.current.turnover)}</td><td data-sort-value="${c.recent.quantity??''}">${number(c.recent.quantity)}</td><td data-sort-value="${c.recent.turnover??''}">${number(c.recent.turnover)}</td><td data-sort-value="${qShare??''}">${qShare==null?'—':number(qShare,1)+'%'}</td><td data-sort-value="${eShare??''}">${eShare==null?'—':number(eShare,1)+'%'}</td></tr>`;}).join('')}</tbody></table>`;
 const countLeader=model.cohorts.filter(c=>Number.isFinite(c.recent.quantity)).sort((a,b)=>b.recent.quantity-a.recent.quantity)[0],turnoverLeader=model.cohorts.filter(c=>Number.isFinite(c.recent.turnover)).sort((a,b)=>b.recent.turnover-a.recent.turnover)[0];
 $('market-comparison-activity').textContent=`${model.cashNxOverlap} cash-index members also belong to the NX cohort; these rows overlap and must not be summed. ${countLeader?countLeader.name+' has the largest recorded count in this window. ':''}${turnoverLeader?turnoverLeader.name+' has the largest estimated turnover proxy. ':''}More recorded activity is not evidence that a measure is more accurate or covers the entire game.`;
 enhanceTables();
}
function fixedCashNxEquivalent(model){
 if(model?.status!=='ok'||model.baseIndex!==100||!Array.isArray(model.rows)||!model.rows.length||model.rows.length!==model.itemCount||!Number.isFinite(model.latest?.cpi)||!Number.isFinite(model.latest?.pricedCoverage)||model.latest.pricedCoverage<1-1e-9)return null;
 const rows=model.rows,valid=value=>Number.isFinite(value)&&value>0,day=model.latest.day;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day||'')||rows.some(row=>!valid(row.weight)||!valid(row.nx)||!valid(row.basePrice)||!valid(row.price)||row.missingSource||!/^\d{4}-\d{2}-\d{2}$/.test(row.priceDay||'')||row.priceDay>day))return null;
 const weightSum=rows.reduce((sum,row)=>sum+row.weight,0),mesos=rows.reduce((sum,row)=>sum+row.weight*row.price/row.basePrice,0),nx=rows.reduce((sum,row)=>sum+row.weight*row.nx/row.basePrice,0);
 if(Math.abs(weightSum-1)>1e-8||Math.abs(mesos*100-model.latest.cpi)>1e-7||!valid(nx)||!valid(mesos))return null;
 const days=rows.map(row=>row.priceDay).sort();
 return {rate:mesos/nx,baseRate:weightSum/nx,itemCount:rows.length,day,partial:!!model.latest.partial,oldestPriceDay:days[0],newestPriceDay:days.at(-1),carriedCount:rows.filter(row=>row.priceDay<day).length};
}
function renderCashBasketChart(){
 const model=snapshot.cashBasket;if(model?.status!=='ok'||!Array.isArray(model.history))return;const point=model.latest;
 const sameBase=model.baseStart===snapshot.baseStart&&model.baseEnd===snapshot.baseEnd;
 const dated=rows=>rows.map(p=>({...p,date:p.day,datePrecision:'day',value:p.cpi}));
 const series=[{name:'Fixed cash-item price index',color:'#89c6b0',fill:false,maxGapMs:129600000,points:dated(model.history)}];
 if(sameBase)series.push({name:'Non-cash public 50 price index',color:'#edc471',fill:false,maxGapMs:129600000,points:dated(snapshot.history)});
 $('cash-basket-chart').innerHTML=chartHTML(series,{yTitle:'Price index · reference week = 100',event:false,dateOnlyAxis:true,allTime:true,width:Math.max(320,($('cash-basket-chart').clientWidth||1148)-28)});
 $('cash-basket-chart-note').textContent=`${sameBase?'Cash and non-cash indexes share the same reference week.':'Non-cash comparison omitted because reference periods differ.'} ${point?`${number(point.coverage*100,1)}% of fixed cash weight observed on ${point.day}; ${number(point.pricedCoverage*100,1)}% has a qualifying current or carried price.`:''} No partial-cohort renormalization; initial incomplete history stays blank.`;
}
function renderCashBasket(){
 const model=snapshot.cashBasket;
 const available=model?.status==='ok'&&Array.isArray(model.rows)&&Array.isArray(model.history)&&model.rows.length>0;
 $('cash-basket-body').hidden=!available;
 $('cash-basket-nav-count').textContent=available?String(model.itemCount):'—';
 if(!available){$('cash-basket-status').textContent=model?.reason?`Cash Basket unavailable: ${model.reason}`:'This snapshot does not yet include a validated frozen cash-basket definition. The existing non-cash index and NX rate remain available.';$('cash-basket-stats').innerHTML='';$('cash-basket-chart').innerHTML='';$('cash-basket-table').innerHTML='';return;}
 const point=model.latest,complete=model.history.filter(p=>!p.partial&&Number.isFinite(p.cpi)).at(-1);
 $('cash-basket-status').textContent=`Experimental fixed cash basket v${model.version} · ${model.itemCount} of ${model.configuredItemCount} configured known-price items have a qualifying baseline · ${model.baseStart}–${model.baseEnd} = 100. Reconstructed history; source published ${utc(model.sourceUpdatedAt)}.`;
 const stats=[['FIXED CASH ITEMS',String(model.itemCount),`${model.missingBaselineCount} missing a qualifying baseline`],['LATEST CASH INDEX',number(point?.cpi,1),point?`${point.day}${point.partial?' · partial source day':''}`:'No qualified index point'],['CHANGE VS. BASE',Number.isFinite(point?.cpi)?percent(point.cpi-100):'Unavailable','Fixed base expenditure weights'],['LAST COMPLETE DAY',complete?number(complete.cpi,1):'Unavailable',complete?.day||'Awaiting complete priced coverage']];
 $('cash-basket-stats').innerHTML=stats.map(([label,value,note])=>`<div class="stat-cell"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(note)}</small></div>`).join('');
 const nxDay=snapshot.latest?.day,nxChange=snapshot.baseNxRate>0?(snapshot.latest.nxRate/snapshot.baseNxRate-1)*100:null;
 $('cash-basket-implications').innerHTML=`<h2>Cash prices and the NX rate can move differently.</h2><p>The fixed Cash Basket is <strong>${Number.isFinite(point?.cpi)?percent(point.cpi-100):'unavailable'}</strong> versus its base on ${esc(point?.day||'an unavailable day')}; the daily NX estimate is <strong>${Number.isFinite(nxChange)?percent(nxChange):'unavailable'}</strong> versus its frozen reference rate on ${esc(nxDay||'an unavailable day')}. ${point?.partial||snapshot.latest?.partial?'The latest source day is partial. ':''}The Cash Basket holds reference expenditure weights fixed. NX divides cash-item meso prices by their NX costs and weights the ratios by each day’s recorded sale quantities.</p><p>More sales shifting toward high-ratio or low-ratio items can move the NX estimate even when the fixed price mix changes less. Cohort coverage and qualifying or carried prices can also differ. This gap is consistent with those methodological differences; it does not measure the exact composition effect or an individual player’s purchasing power.</p>`;
 const equivalent=fixedCashNxEquivalent(model);
 $('cash-basket-implications').insertAdjacentHTML('beforeend',`<h3>Does this index imply an NX rate?</h3><p>A normalized price index alone has no absolute NX conversion unit. ${equivalent?`The underlying frozen rows support a separate, experimental fixed-mix equivalent of <strong>≈1:${number(equivalent.rate,2)} (NX : mesos)</strong> as of ${esc(equivalent.day)}${equivalent.partial?' (partial source day)':''}. It uses the same ${equivalent.itemCount} members and capped base weights, with qualifying or carried prices; it is not the changing-volume headline or the <a href="#nx">selected daily/rolling explorer estimate</a>.`:'The underlying fixed-mix conversion is unavailable while complete consistent price/cost coverage is missing; no absolute rate is inferred from the index alone.'}</p><details><summary>Fixed-mix conversion formula and source dates</summary><p>Use synthetic fixed quantities qᵢ = fixed weightᵢ / base meso priceᵢ; a common scale cancels. This preserves the capped weights rather than reusing uncapped recorded base quantities.</p><div class="formula">Fixed-mix mesos / NX = Σ(qᵢ × current meso priceᵢ) / Σ(qᵢ × fixed NX costᵢ)</div>${equivalent?`<p>The same synthetic mix implies ≈1:${number(equivalent.baseRate,2)} (NX : mesos) at reference prices. Current qualifying price dates span ${esc(equivalent.oldestPriceDay)}–${esc(equivalent.newestPriceDay)}; ${equivalent.carriedCount} item${equivalent.carriedCount===1?' uses':'s use'} an earlier qualifying price. Those dates and the frozen weights are shown in the table. This is an analytical basket equivalent, not an executable exchange quote.</p>`:''}</details>`);
 renderCashBasketChart();
 const missing=(model.missingBaselineNames||[]).map(esc).join(', ');
 $('cash-basket-exclusions').innerHTML=`${model.missingBaselineCount} of ${model.configuredItemCount} configured items ${model.missingBaselineCount===1?'has':'have'} no qualifying reference-week baseline${missing?`: ${missing}`:''}. Those items remain in the <a href="#nx">all-${model.configuredItemCount}-item NX pricing explorer</a> with zero cash-index weight. Other cash-category cosmetics with unverified fixed NX costs are outside this known-price cohort.`;
 $('cash-basket-definition').textContent=JSON.stringify({version:model.version,baseStart:model.baseStart,baseEnd:model.baseEnd,historyKind:model.historyKind,indexSpecification:model.indexSpecification,specificationHash:model.specificationHash,basketHash:model.basketHash,sourceSnapshotHash:model.sourceSnapshotHash,selectionSourceUpdatedAt:model.selectionSourceUpdatedAt},null,2);
 $('cash-basket-row-count').textContent=`${model.rows.length} FROZEN MEMBERS`;
 $('cash-basket-table').innerHTML=`<table><thead><tr><th>Cash item</th><th>Fixed NX cost</th><th>Base meso price ${referenceHelp()}</th><th>Current qualifying price</th><th>Source price day</th><th>Fixed weight</th><th>Vs. base ${referenceHelp()}</th><th>Index change contribution</th></tr></thead><tbody>${model.rows.map(r=>`<tr><td><button class="item-link" data-item="${esc(r.slug)}">${sprite(r)}<span>${esc(r.name)}<small>${r.missingSource?'Source item missing':`${number(r.baseObservationDays)} qualifying base days`}</small></span></button></td><td data-sort-value="${r.nx}">${number(r.nx)}</td><td data-sort-value="${r.basePrice}">${number(r.basePrice,1)}</td><td data-sort-value="${r.price??''}">${number(r.price,1)}</td><td class="source-date-cell">${esc(r.priceDay||'Unavailable')}</td><td data-sort-value="${r.weight*100}">${number(r.weight*100,2)}%</td><td data-sort-value="${r.changeBase??''}">${Number.isFinite(r.changeBase)?percent(r.changeBase):'Unavailable'}</td><td data-sort-value="${r.changeContribution??''}">${Number.isFinite(r.changeContribution)?(r.changeContribution>=0?'+':'')+number(r.changeContribution,2)+' points':'Unavailable'}</td></tr>`).join('')}</tbody></table>`;
}

function ratio(rate){return Number.isFinite(rate)?'1:'+Number(rate.toFixed(1)).toLocaleString('en-US'):'—';}
function renderComparisons(){
 const reported=snapshot.comparisons.filter(p=>p.kind==='player_report').at(-1), source=snapshot.smegaSource,s=source?.summary,r=snapshot.rollingReference;
 const pulled=source?.summaryCapturedAt||source?.capturedAt,spread=s?s.sellerRate-s.buyerRate:null,midpoint=s?(s.sellerRate+s.buyerRate)/2:null;
 $('comparison-card').innerHTML=`<section class="signal-group"><p class="eyebrow">THIS CASH-ITEM ESTIMATE</p><div class="comparison-row"><span>Cash-item sale estimate<small>${snapshot.latest.partial?'Partial daily snapshot':'Daily snapshot'} · source ${esc(utc(recentLive()?snapshot.live.observedAt:snapshot.sourceUpdatedAt))}</small></span><strong>${ratio(activeRate())}</strong></div><p class="comparison-method">Here, scanner-inferred sale medians are weighted by recorded sold volume, with the NX purchase schedule and source dates shown.</p></section><section class="signal-group"><p class="eyebrow">OTHER SOURCES / CROSS-CHECKS</p><div class="comparison-row"><span><a href="https://meowdb.com/msclassic/free-market" target="_blank" rel="noreferrer">NiaDB reports</a><small>${reported?'Last pulled '+esc(utc(reported.observedAt))+' · player-reported prices':'Not connected'}</small><small>Player-reported prices for fixed-NX cash items; the reviewed source does not disclose its cross-item weighting. <a href="https://meowdb.com/msclassic/news/niadb-grand-launch-week-exploration-report" target="_blank" rel="noreferrer">Source method ↗</a></small></span><strong>${reported?ratio(reported.rate):'—'}</strong></div><div class="comparison-row"><span><a href="https://mesos.watch/" target="_blank" rel="noreferrer">mesos.watch item medians</a><small>${r?'Last pulled '+esc(utc(r.capturedAt))+' · item-specific sale windows':'Not connected'}</small><small>Recent item-sale medians over item-specific rolling windows; this rate is reconstructed here, weighting by recorded sales per hour of each window. ${r&&rollingNxPolicyNote(r)?esc(rollingNxPolicyNote(r))+' ':''}<a href="#rolling-reference-card">See windows and weighting →</a> · <a href="https://mesos.watch/about" target="_blank" rel="noreferrer">Source method ↗</a></small></span><strong>${r?ratio(r.nxRateReference):'—'}</strong></div></section><section class="signal-group"><p class="eyebrow">SELLER ASKS / BUYER BIDS · OFFERS</p><p class="comparison-method">Published seller-ask and buyer-bid medians with separate poster counts.</p><div class="comparison-row" data-offer-side="sell"><span><a href="https://maplestory.market/ads?tab=services" target="_blank" rel="noreferrer">MapleStory Market sellers ask</a><small>${s?'Last pulled '+esc(utc(pulled))+' · '+s.sellerPosters+' source posters / published '+s.windowHours+'h summary':'Awaiting observations'}</small></span><strong>${s?ratio(s.sellerRate):'—'}</strong></div><div class="comparison-row" data-offer-side="buy"><span>MapleStory Market buyers bid<small>${s?s.buyerPosters+' source posters / same published '+s.windowHours+'h summary':'Awaiting observations'}</small></span><strong>${s?ratio(s.buyerRate):'—'}</strong></div><div class="comparison-row signal-spread"><span>Median ask − median bid<small>${s?number(spread/midpoint*100,1)+'% of midpoint · offer medians, not an executable trade spread':'Awaiting paired medians'}</small></span><strong>${s?number(spread,1):'—'}<small>mesos per NX</small></strong></div><a class="small" href="#smega-section">See hourly offers and history →</a></section>`;
}
function renderSourceComparisons(){
 const r=snapshot.rollingReference;
 $('rolling-reference-card').innerHTML=r?`<p class="eyebrow gold">MESOS.WATCH ITEM MEDIANS</p><h2>A rolling reference, with its window visible.</h2><div class="source-comparison-grid"><div><strong>${ratio(r.nxRateReference)}</strong><span>mesos per NX · sale-count-per-hour weighting proxy</span></div><div><strong>${number(r.cpiReference,1)}</strong><span>MPI reference · ${number(r.coverage*100,1)}% ${r.comparison?'comparable basket weight':'basket weight captured · legacy comparison'}</span></div></div>${rollingNxPolicyNote(r)?`<p class="small muted rolling-policy-note">${esc(rollingNxPolicyNote(r))}</p>`:''}<p>The NX rate is reconstructed here from captured item sale medians, weighted by recorded sales per hour of each item’s window; it is not a source-published NX headline. Last pulled ${esc(utc(r.capturedAt))}. Across all captured items, sale windows span ${r.windowMinDays}–${r.windowMaxDays} days; each input retains its own window. This can differ substantially from the daily estimate, so it does not replace the headline or enter the daily history.</p><p class="small muted">${esc(publicRollingContext(r))} Matched inputs appear in the basket and cash tables; capture coverage is measured against the current versioned basket.</p><p class="small muted">The daily estimate uses a common source-calendar day; rolling references retain their individual windows. Asking-price fallbacks are excluded from this reconstruction.${r.comparison?` Captured inputs cover ${number(r.comparison.capturedBasketCoverage*100,1)}% of the basket; ${number(r.comparison.comparableBasketCoverage*100,1)}% is eligible for comparison after unmatched equipment/roll baselines are excluded. An MPI reference requires at least 80% comparable weight. Different reported rolls and windows must be compared separately; repeated captures are not independent trade volumes.`:''}</p>`:'<p>No rolling scanner reference captured yet.</p>';
 const source=snapshot.smegaSource,s=source?.summary;
 const latest=deriveSmegaSpreads(smegaInputs()).at(-1);
 $('smega-source-card').innerHTML=s?`<p class="eyebrow">CHAT & MEGAPHONE OFFERS · PUBLISHED ${s.windowHours}H SUMMARY</p><h2>How close are smegas to ground-truth?</h2><p class="smega-comparison-subtitle">A dated source-derived cash-item benchmark is a cross-check; offers and this proxy are not verified completed trades.</p><div class="smega-comparison-controls"><button type="button" id="nx-smega-comparison-toggle" data-smega-comparison-toggle aria-pressed="false">Show midpoint + cash benchmark</button></div><p class="offer-clock-note" data-smega-comparison-content hidden>${latest?`Latest matched-hour midpoint: ${number(latest.midpoint,1)} mesos per NX at ${esc(utc(latest.at))}. `:'No paired hour is available. '}The cash calculation is ${number(snapshot.latest.nxRate,1)} as of ${esc(utc(snapshot.sourceUpdatedAt))}; carry-forward is a dated reference, not a new trade. The <a href="#smega-section">hourly history</a> shows both overlays together, separately from this published summary.</p><div class="source-comparison-grid"><div data-offer-side="sell"><span>Sellers ask</span><strong>1:${number(s.sellerRate,1)}</strong><small>${s.sellerPosters} source posters / ${s.windowHours}-hour summary</small></div><div data-offer-side="buy"><span>Buyers offer</span><strong>1:${number(s.buyerRate,1)}</strong><small>${s.buyerPosters} source posters / ${s.windowHours}-hour summary</small></div></div><p class="offer-clock-note">This is the source’s separate ${s.windowHours}-hour summary, captured ${esc(utc(source.summaryCapturedAt||source.capturedAt))}. ${latest?`The latest paired hourly bucket is ${esc(utc(latest.at))}: sellers ask ${ratio(latest.ask)}, buyers bid ${ratio(latest.bid)}${latest.partial?' (partial when pulled)':''}.`:''} These summary and hourly medians use different windows.</p><p>${snapshot.smega.length} published hourly observations are available in the hourly history view, with source sample counts and middle-half ranges in point tooltips. These are source-published aggregates, not an independent interpretation of raw messages. Poster counts belong to their stated windows; they are not a deduplicated total across hours.</p><p>Hourly series last pulled ${esc(utc(source.capturedAt))}. The source table’s Chicago local hours are converted to UTC. This browser capture is dated; continuous collection is not connected. <a href="${esc(source.sourceUrl)}" target="_blank" rel="noreferrer">View the live source ↗</a></p><a class="small" href="#smega-section">Choose an hourly history window →</a>`:'<p>Waiting for a timestamped smega source.</p>';
 updateSmegaComparisonControls();
}
function renderSources(){
 const r=snapshot.rollingReference,health=sourceHealth(snapshot),count=snapshot.intraday.filter(p=>Number.isFinite(p.cpi)||Number.isFinite(p.nxRate)).length;
 const cards=[['daily','DEVELOPER MARKET FEED',utc(snapshot.sourceUpdatedAt),`${snapshot.itemsAvailable} priced items · daily source${snapshot.latest.partial?' · latest source day partial':''}. A ten-minute check does not make this an intraday feed.`,health.daily],
 ['collector','COLLECTOR CHECK',utc(snapshot.sourceStatus.checkedAt),'10-minute scheduled checks · conditional requests · last good cache. '+(snapshot.sourceStatus.status==='degraded'?(snapshot.sourceStatus.detail||'Check failed; retained source clocks do not advance.'):'A successful unchanged response does not renew the market timestamp.'),health.collector],
 ['intraday','QUALIFIED INTRADAY INPUT',`${count} dated observations`,'Only validated, timestamped sold evidence can enter the intraday headline gates. '+(count?'The latest qualified observation remains dated independently.':'No qualified intraday observations are connected.'),health.intraday],
 ['reference','SCANNER REFERENCE',r?utc(r.capturedAt):'Awaiting data',r?`${r.items.length} items captured · rolling ${r.windowMinDays}–${r.windowMaxDays} day medians. Pull time is known; exact source scan/trade time is unknown.`:'No browser capture yet.',health.reference],
 ['build','PAGE GENERATED',utc(snapshot.builtAt),'Build time records calculation/publication, and does not reset the age of market prices.',{tone:'amber',state:'Build metadata · not a market observation'}],
 ['offers','SMEGA SERIES',snapshot.smega.length?`${snapshot.smega.length} hourly side observations`:'Awaiting data',snapshot.smegaSource?'Published buyer/seller hourly offer medians. Captured '+utc(snapshot.smegaSource.capturedAt)+'. Poster counts are per published window, not a cross-hour unique total.':'No timestamped hourly source capture is connected.',health.offers],
 ['publication','PUBLICATION',location.hostname==='127.0.0.1'?'Local Astra preview':'Hosted Astra preview',location.hostname==='inflation.gg'?'Unadvertised public test on inflation.gg.':'Unadvertised public test. The selected inflation.gg domain is activating.',{tone:'green',state:'Test publication · not a source clock'}],
 ['api','AUTHENTICATED API',snapshot.publicApiStatus?.status||'requires_api_key','The authenticated intraday source is not connected. The public daily feed and separately dated reference captures remain available.',{tone:'amber',state:'Not connected'}],
 ['additional','ADDITIONAL SMEGA SOURCE','Free Market Classic','Published terms prohibit website automation. No unattended collector is enabled for this source.',{tone:'amber',state:'Not connected'}]];
 $('sources-cards').innerHTML=cards.map(([key,label,value,detail,state])=>`<article class="panel" data-status-key="${key}" data-status-tone="${state.tone}"><p class="eyebrow">${statusDot(state.tone)}${esc(label)}</p><div class="source-clock">${esc(value)}<small>${esc(state.state)}</small></div><p>${esc(detail)}</p></article>`).join('');
}

function conversionValue(value,rate,direction){
 if(value.trim()===''||!Number.isFinite(Number(value))||Number(value)<0||Number(value)>1e12||!Number.isFinite(rate)||rate<=0)return 'Enter a valid amount';
 const amount=Number(value);return direction==='nx'?`≈ ${number(amount*rate)} mesos`:`≈ ${number(amount/rate,1)} NX`;
}
let quickDirection=null;
function renderQuickConverter(){if(!snapshot||!quickDirection)return;$('quick-result').textContent=conversionValue($('quick-amount').value,activeRate(),quickDirection);}
function findItem(slug){return [...snapshot.rows,...snapshot.cash,...(snapshot.contextItems||[])].find(r=>r.slug===slug)||CASH_SCHEDULE.map(r=>({...r,history:[]})).find(r=>r.slug===slug);}
function itemDetailHTML(r,full=false){
 const history=[...r.history].sort((a,b)=>a[0].localeCompare(b[0])),summary=r.sourceSummary,reference=referenceItem(r);
 const details=summary?`<section class="item-evidence"><h3>Source snapshot: sale-price distribution</h3><p class="small muted">Published ${esc(utc(summary.sourceUpdatedAt))}. The source does not specify this summary’s lookback; it can differ from the daily medians above.</p><div class="item-summary-grid"><div><small>Summary median sale</small><strong>${number(summary.medianSale)} mesos</strong></div><div><small>Middle half of sale prices</small><strong>${number(summary.p25)}–${number(summary.p75)}</strong></div><div><small>Recorded sale minimum–maximum</small><strong>${number(summary.lowSale)}–${number(summary.highSale)}</strong></div><div><small>Source-reported latest sale</small><strong class="small">${esc(utc(summary.reportedLastSaleAt))}</strong></div></div></section><section class="item-evidence"><h3>Seller asks · separate from sales</h3><div class="item-summary-grid"><div><small>Median seller asking price</small><strong>${summary.medianSellerAsk==null?'Unavailable':number(summary.medianSellerAsk)+' mesos'}</strong></div><div><small>Listings at source update</small><strong>${number(summary.listings)}</strong></div><div><small>Players listing at source update</small><strong>${number(summary.sellers)}</strong></div></div><p class="small muted">Asks are seller offers. No buyer-bid feed or item-specific smega history is connected here, so a bid–ask spread cannot be calculated. The sale-price range above is a distribution, not a trading spread.</p></section>`:'';
 return `<p class="eyebrow">${esc(r.category||'Cash Shop')} / SOURCE HISTORY</p><h2 class="item-detail-title">${sprite(r)}${nameOf(r)}</h2><div class="detail-metrics"><div><strong>${number(r.price)}</strong><small>daily median mesos · ${esc(r.priceDay)}</small></div><div><strong>${number(r.recentQuantity)}</strong><small>recorded sold volume · seven complete days</small></div><div><strong>${r.notIndexed?'Not indexed':r.weight!=null?number(r.weight*100,2)+'%':number(r.rate,2)}</strong><small>${r.notIndexed?'Context only':r.weight!=null?'MPI base weight':'mesos / NX'}</small></div></div><p class="small muted">Available history: ${esc(history[0]?.[0]||'—')}–${esc(history.at(-1)?.[0]||'—')} · ${history.length} recorded daily observations. This is the available source history, not the item’s creation date.</p><div class="chart" data-item-chart="${esc(r.slug)}" data-item-full="${full}" role="img" aria-label="${esc(r.name)} daily median sale prices by source date"></div>${r.slug==='wolbi-throwing-stars'?`<p class="small muted">* ${esc(snapshot.wolbi.text)}</p>`:''}<p class="small muted">Daily median sale prices and recorded volumes are aggregates. Individual recent transaction records are unavailable in this feed; equipment stats and rolls can mix.</p>${!full?`<a class="item-full-link" href="#item/${encodeURIComponent(r.slug)}">Open this item’s full history page →</a>`:''}${details}${reference?`<section class="item-evidence"><h3>mesos.watch reports</h3><p>${number(reference.price)} mesos · median across its ${reference.windowDays}-day sale window · ${number(reference.salesCounted)} recorded sales. ${reference.captureTimeKind==='per_item_return'?'Captured':'Batch pulled'} ${esc(utc(reference.capturedAt||snapshot.rollingReference.capturedAt))}; underlying scan time is unknown.</p>${referenceRollNote(r,reference)?`<p>${esc(referenceRollNote(r,reference))}. Different reported rolls are separate observations, not quality-adjusted matches.</p>`:''}${reference.cheapestListing?`<p>Cheapest asking price seen in this capture: ${number(reference.cheapestListing.price_each)} mesos each · channel ${number(reference.cheapestListing.channel)}, room ${number(reference.cheapestListing.room)}. Its current availability is not verified.</p>`:''}</section>`:''}<details class="item-evidence" ${full?'open':''}><summary>All available daily prices and recorded volumes</summary><div class="table-wrap"><table data-search-key="item-history-${esc(r.slug)}" data-search-label="daily item history"><thead><tr><th>Source day</th><th>Median sale · mesos</th><th>Recorded sold volume</th></tr></thead><tbody>${history.map(p=>`<tr><td class="source-date-cell">${esc(p[0])}${p[0]===snapshot.sourceUpdatedAt.slice(0,10)?' · partial':''}</td><td data-sort-value="${p[1]}">${number(p[1])}</td><td data-sort-value="${p[2]}">${number(p[2])}</td></tr>`).join('')}</tbody></table></div></details>`;
}
function renderItemChart(container){
 const chart=container?.querySelector('[data-item-chart]');if(!chart)return;
 const r=findItem(chart.dataset.itemChart);if(!r)return;
 const history=[...r.history].sort((a,b)=>a[0].localeCompare(b[0])),style=getComputedStyle(chart);
 const padding=(parseFloat(style.paddingLeft)||0)+(parseFloat(style.paddingRight)||0);
 const width=Math.max(240,Math.round((chart.clientWidth||(chart.dataset.itemFull==='true'?1120:700))-padding));
 chart.innerHTML=chartHTML([{name:r.name+' · daily median sale',color:'#87bdcf',points:history.map(p=>({at:p[0]+'T12:00:00Z',date:p[0],datePrecision:'day',value:p[1],sampleCount:p[2]}))}],{yTitle:'mesos',event:r.slug==='wolbi-throwing-stars',dateOnlyAxis:true,allTime:true,width});
}
function renderItemPage(slug){const r=findItem(slug);$('item-page-title').textContent=r?r.name+(r.slug==='wolbi-throwing-stars'?'*':''):'Item unavailable';$('item-page-detail').innerHTML=r?itemDetailHTML(r,true):'<p>No matching tracked item in this snapshot.</p>';renderItemChart($('item-page-detail'));}
function showItem(slug){const r=findItem(slug);if(!r)return;$('item-detail').innerHTML=itemDetailHTML(r);$('item-dialog').showModal();renderItemChart($('item-detail'));}
function tableCellValue(cell,forceText=false){
 if(!cell)return null;
 const nested=cell.querySelector('[data-sort-value]');if(nested&&!Object.hasOwn(cell.dataset,'sortValue'))return tableCellValue(nested,forceText);
 if(Object.hasOwn(cell.dataset,'sortValue')){const value=cell.dataset.sortValue.trim();if(!value)return null;return cell.dataset.sortType==='text'?value:Number.isFinite(Number(value))?Number(value):value;}
 const copy=cell.cloneNode(true);copy.querySelectorAll('small,sup,svg,img').forEach(node=>node.remove());const text=copy.textContent.trim();
 if(!text||/^(?:—|–|-|Unavailable|Unknown|Not available)$/i.test(text))return null;
 if(forceText)return text.toLocaleLowerCase();
 if(/^\d{4}-\d{2}-\d{2}(?:$|[ ·T])/.test(text))return text.slice(0,10);
 const ratio=/^1:\s*([\d,.]+)$/.exec(text);if(ratio)return Number(ratio[1].replaceAll(',',''));
 const numeric=/^([+−-]?[\d,]+(?:\.\d+)?)([KMB])?(?:%|\s+(?:points?|pts|mesos|NX|days?|sales|units?|items?))?$/i.exec(text);
 if(numeric){const value=Number(numeric[1].replaceAll(',','').replace('−','-'))*({K:1e3,M:1e6,B:1e9}[numeric[2]?.toUpperCase()]||1);return Number.isFinite(value)?value:null;}
 const scanner=cell.querySelector('.ref-cell');if(scanner){const first=Number(scanner.firstChild.textContent.replaceAll(',','').trim());return Number.isFinite(first)?first:null;}
 return text.toLocaleLowerCase();
}
const tableQueries=new Map();let tableSearchSerial=0;
function enhanceTableSearch(table){
 const wrap=table.closest('.table-wrap'),key=table.dataset.searchKey||wrap?.id;
 if(!wrap||!key||key==='basket-table'||table.dataset.searchReady)return;
 table.dataset.searchReady='true';
 const label=table.dataset.searchLabel||wrap.dataset.searchLabel||'table rows',id='table-search-'+(++tableSearchSerial),controls=document.createElement('div');controls.className='table-search-controls';
 const field=document.createElement('label');field.htmlFor=id;field.textContent='Search '+label;
 const input=document.createElement('input');input.id=id;input.type='search';input.placeholder='Type to filter these rows';input.value=tableQueries.get(key)||'';input.setAttribute('aria-describedby',id+'-status');input.autocomplete='off';field.append(input);
 const clear=document.createElement('button');clear.type='button';clear.textContent='Clear';clear.setAttribute('aria-label','Clear search for '+label);
 const status=document.createElement('span');status.id=id+'-status';status.className='table-search-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 const apply=()=>{const query=input.value.trim().toLocaleLowerCase(),rows=[...(table.tBodies[0]?.rows||[])].filter(row=>!row.querySelector('.empty'));let shown=0;for(const row of rows){row.hidden=!!query&&!row.textContent.toLocaleLowerCase().includes(query);if(!row.hidden)shown++;}tableQueries.set(key,input.value);clear.disabled=!input.value;const message=rows.length?`${shown} of ${rows.length} rows${!shown?' · No matches. Clear search to show all rows.':''}`:'No recorded rows.';if(status.textContent!==message)status.textContent=message;};
 const reset=()=>{input.value='';apply();input.focus();};input.addEventListener('input',apply);input.addEventListener('search',apply);input.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();reset();}});clear.addEventListener('click',reset);
 controls.append(field,clear,status);wrap.insertBefore(controls,table);apply();
}
function enhanceTables(root=document){
 root.querySelectorAll('table').forEach(table=>{
  enhanceTableSearch(table);
  const headers=[...(table.tHead?.rows[0]?.cells||[])];
  headers.forEach((header,index)=>{
   if(header.querySelector('button')||header.textContent.trim()==='History')return;
   const button=document.createElement('button');button.type='button';button.dataset.tableSort=String(index);button.className='table-sort-button';
   for(const node of [...header.childNodes])if(!(node.nodeType===1&&node.matches('a,sup,.weight-help')))button.append(node);
   const arrow=document.createElement('span');arrow.className='table-sort-direction';arrow.setAttribute('aria-hidden','true');button.append(arrow);header.prepend(button);header.setAttribute('aria-sort','none');
  });
 });
}
function sortTable(button){
 const header=button.closest('th'),table=button.closest('table'),body=table?.tBodies[0];if(!header||!body)return;
 const index=Number(button.dataset.tableSort),ascending=header.getAttribute('aria-sort')!=='ascending',forceText=/item/i.test(button.textContent);
 const rows=[...body.rows].map((row,order)=>({row,order,value:tableCellValue(row.cells[index],forceText)}));
 rows.sort((a,b)=>{if(a.value==null)return b.value==null?a.order-b.order:1;if(b.value==null)return -1;const delta=typeof a.value==='number'&&typeof b.value==='number'?a.value-b.value:String(a.value).localeCompare(String(b.value),undefined,{numeric:true});return delta*(ascending?1:-1)||a.order-b.order;});
 table.querySelectorAll('th').forEach(th=>{th.setAttribute('aria-sort','none');const arrow=th.querySelector('.table-sort-direction');if(arrow)arrow.textContent='';});
 header.setAttribute('aria-sort',ascending?'ascending':'descending');button.querySelector('.table-sort-direction').textContent=ascending?' ↑':' ↓';
 body.append(...rows.map(entry=>entry.row));
}
let tableEnhanceQueued=false;
new MutationObserver(()=>{if(!tableEnhanceQueued){tableEnhanceQueued=true;queueMicrotask(()=>{tableEnhanceQueued=false;enhanceTables();});}}).observe(document.body,{childList:true,subtree:true});
function csvDownload(filename,headers,rows){const cell=v=>'"'+String(v??'').replace(/"/g,'""')+'"';const blob=new Blob(['\ufeff'+[headers,...rows].map(r=>r.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8;'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

async function checkSnapshot(manual=false){
 if(document.hidden&&!manual)return;
 if(manual)$('refresh').disabled=true;
 try{
  const res=await fetch('version.json',{cache:'no-cache',signal:AbortSignal.timeout(12000)});if(window.astraPreviewSession?.onResponse(res)===false)return;if(!res.ok)throw new Error(`Version HTTP ${res.status}`);const next=await res.json();
  if(next.version!==version){if(!/^data-[a-f0-9]{16}\.json$/.test(next.data))throw new Error('Invalid snapshot pointer');const data=await fetch(next.data,{cache:'force-cache',signal:AbortSignal.timeout(12000)});if(window.astraPreviewSession?.onResponse(data)===false)return;if(!data.ok)throw new Error('Snapshot unavailable');const value=await data.json();if(value.schemaVersion!==1||!Array.isArray(value.rows)||value.rows.length!==50)throw new Error('Invalid snapshot');snapshot=value;version=next.version;render();}
  else renderFreshness();if(snapshot&&next.sourceStatus){snapshot.sourceStatus=next.sourceStatus;renderFreshness();renderSources();}retry=60000;
 }catch(error){console.warn('Snapshot check failed:',error.message);retry=Math.min(retry*2,600000);if(!snapshot){$('notice').className='notice error';$('notice').innerHTML='The snapshot could not be loaded. <a href="fallback.html">Open the lightweight last-known page →</a>';}else{$('notice').className='notice error';$('notice').textContent=`Connection interrupted. Showing retained data from ${utc(snapshot.sourceUpdatedAt)}; retrying with backoff.`;}}
 finally{if(manual)$('refresh').disabled=false;clearTimeout(timer);timer=setTimeout(checkSnapshot,retry+Math.random()*10000);}
}

window.addEventListener('astrabannerlayoutchange',()=>{if(snapshot&&!$('view-index').hidden){renderMainChart();renderSmega();}});
let volumeResizeTimer;window.addEventListener('resize',()=>{clearTimeout(volumeResizeTimer);volumeResizeTimer=setTimeout(()=>{if(snapshot){if(!$('view-index').hidden){renderMainChart();renderVolume();renderSmega();renderReportedHistory();}if(!$('view-basket').hidden)renderCpiDetail();if(!$('view-cash-basket').hidden)renderCashBasketChart();if(!$('view-item').hidden)renderItemChart($('item-page-detail'));if($('item-dialog').open)renderItemChart($('item-detail'));}},150);});
function publishMarketHighlights(){if(snapshot)document.dispatchEvent(new CustomEvent('astramarketsnapshot',{detail:snapshot}));}
document.addEventListener('astramarkethighlightsready',publishMarketHighlights);
window.addEventListener('hashchange',()=>{route();if(!focusRouteAnchor())window.scrollTo({top:0,behavior:'instant'});});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkSnapshot();});
$('launch-period').addEventListener('change',e=>{selectedLaunchPeriod=e.target.value;if(snapshot)render();});
$('display-timezone').addEventListener('change',e=>{displayTimeZone=e.target.value;try{localStorage.setItem('astra-display-timezone',displayTimeZone);}catch{}if(snapshot){render();}});
$('quick-amount').addEventListener('input',renderQuickConverter);
document.querySelectorAll('[data-quick-direction]').forEach(button=>button.addEventListener('click',()=>{const next=button.dataset.quickDirection;if(next!==quickDirection){quickDirection=next;$('quick-amount').value=next==='nx'?'1000':'1000000';$('quick-amount').step=next==='nx'?'100':'1000';}$('quick-label').textContent=next==='nx'?'NX to sell':'Mesos to spend';$('quick-calculation').hidden=false;document.querySelectorAll('[data-quick-direction]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));renderQuickConverter();$('quick-amount').focus();}));
$('refresh').addEventListener('click',()=>checkSnapshot(true));
$('cash-evidence').addEventListener('change',e=>{cashEvidence=e.target.value;if(snapshot)renderCash();});
$('cash-lookback').addEventListener('change',e=>{cashLookback=Number(e.target.value);if(snapshot)renderCash();});
$('cash-filter').addEventListener('change',e=>{cashFilter=e.target.value;if(snapshot)renderCash();});
$('basket-search').addEventListener('input',()=>snapshot&&renderBasket());$('category-filter').addEventListener('change',()=>snapshot&&renderBasket());
$('export-smega').addEventListener('click',()=>snapshot&&csvDownload('inflation-watch-smega-spreads.csv',['source_hour','source','seller_median','buyer_median','gap_mesos_per_nx','gap_percent_midpoint','seller_sample','buyer_sample','partial_when_pulled'],deriveSmegaSpreads(smegaInputs()).map(p=>[p.at,p.sourceUrl,p.ask,p.bid,p.spread,p.spreadPercent,p.askCount,p.bidCount,p.partial])));
$('volume-period').addEventListener('change',()=>snapshot&&renderVolume());
$('volume-metric').addEventListener('change',()=>snapshot&&renderVolume());
$('export-volume').addEventListener('click',()=>snapshot&&csvDownload('inflation-watch-volume.csv',['day','full_feed_estimated_mesos','basket_estimated_mesos','full_feed_recorded_sold_volume','basket_recorded_sold_volume','full_feed_items_observed','basket_items_observed','partial_day','source'],selectedVolumeRows().map(p=>[p.day,p.allMesos,p.basketMesos,p.allSoldVolume,p.basketSoldVolume,p.allItemsObserved,p.basketItemsObserved,p.partial,snapshot.feedUrl])));
$('chart-metric').addEventListener('change',e=>{metric=e.target.value;if(snapshot)renderMainChart();});
document.addEventListener('click',e=>{
 const comparisonToggle=e.target.closest('button[data-smega-comparison-toggle]');if(comparisonToggle&&snapshot){smegaComparison=!smegaComparison;try{localStorage.setItem('astra-smega-comparison',smegaComparison?'on':'off');}catch{}renderSmega();updateSmegaComparisonControls();}
 const overlay=e.target.closest('button[data-main-overlay]');if(overlay&&snapshot&&Object.hasOwn(mainOverlays,overlay.dataset.mainOverlay)){mainOverlays[overlay.dataset.mainOverlay]=!mainOverlays[overlay.dataset.mainOverlay];renderMainChart();}
 const reportedToggle=e.target.closest('button[data-reported-history-toggle]');if(reportedToggle&&snapshot){reportedHistoryVisible=!reportedHistoryVisible;renderReportedHistory();}
 const tableSort=e.target.closest('[data-table-sort]');if(tableSort)sortTable(tableSort);
 const fullItemLink=e.target.closest('.item-full-link');if(fullItemLink)$('item-dialog').close();
 const weightLink=e.target.closest('.weight-help a');if(weightLink&&$('item-dialog').open)$('item-dialog').close();
 const item=e.target.closest('[data-item]');if(item&&snapshot)showItem(item.dataset.item);
 const category=e.target.closest('[data-category]');if(category){$('category-filter').value=category.dataset.category;location.hash='basket';renderBasket();}
 const cashSideButton=e.target.closest('[data-cash-side]');if(cashSideButton&&snapshot){cashSide=cashSideButton.dataset.cashSide;cashSortKey='rate';cashSortAsc=cashSide==='buy';renderCash();}
 const bestCash=e.target.closest('[data-cash-best-value]');if(bestCash&&snapshot){cashSortKey='rate';cashSortAsc=cashSide==='buy';renderCash();}
 const cashSort=e.target.closest('[data-cash-sort]');if(cashSort&&snapshot){cashSortAsc=cashSortKey===cashSort.dataset.cashSort?!cashSortAsc:cashSort.dataset.cashSort==='name';cashSortKey=cashSort.dataset.cashSort;renderCash();}
 const sort=e.target.closest('[data-sort]');if(sort){sortAsc=sortKey===sort.dataset.sort?!sortAsc:sort.dataset.sort==='name';sortKey=sort.dataset.sort;renderBasket();}
 const smegaRange=e.target.closest('[data-smega-range]');if(smegaRange){selectedSmegaRange=smegaRange.dataset.smegaRange;document.querySelectorAll('[data-smega-range]').forEach(b=>b.classList.toggle('selected',b===smegaRange));renderSmega();}
 const cpiRange=e.target.closest('[data-cpi-range]');if(cpiRange){selectedCpiRange=cpiRange.dataset.cpiRange;document.querySelectorAll('[data-cpi-range]').forEach(b=>b.classList.toggle('selected',b===cpiRange));renderCpiDetail();}
 const range=e.target.closest('[data-range]');if(range){selectedRange=range.dataset.range;document.querySelectorAll('[data-range]').forEach(b=>b.classList.toggle('selected',b===range));renderMainChart();}
 const view=e.target.closest('[data-layout]');if(view){layout=view.dataset.layout;document.querySelectorAll('[data-layout]').forEach(b=>b.classList.toggle('selected',b===view));renderBasket();}
});
$('close-dialog').addEventListener('click',()=>$('item-dialog').close());
$('export-basket').addEventListener('click',()=>snapshot&&csvDownload('inflation-watch-basket.csv',['item','category','price_day','mesos','unit','sold_volume_7d','estimated_turnover_7d','base_price','base_sold_volume','weight','change_base_percent'],snapshot.rows.map(r=>[r.name,r.category,r.priceDay,r.price,r.unit,r.recentQuantity,r.recentTurnoverProxy,r.basePrice,r.baseQuantity,r.weight,r.changeBase])));
function marketHistoryExport(report){
 return {headers:['observed_at','kind','nx_rate_mesos_per_nx','cpi','partial_day','source','timestamp_kind','source_observation_time_known','comparison_method_version','roll_identity_status','reference_note','content_hash','comparable_basket_coverage','captured_basket_coverage','quality_constant'],rows:[
  ...report.history.map(p=>[p.at,'daily_sale_medians',p.nxRate,p.cpi,p.partial,report.feedUrl,'source_day',false,...Array(7).fill('')]),
  ...report.intraday.map(p=>[p.observedAt,'intraday_scanner',p.nxRate,p.cpi,false,p.sourceUrl,'source_observation',true,...Array(7).fill('')]),
  ...(report.rollingReferenceHistory||[]).map(p=>[p.at,rollingHistoryLegacy(p)?'legacy_rolling_scanner_capture_not_trade_time':'rolling_scanner_capture_not_trade_time',p.nxRate,p.cpi,false,p.sourceUrl,p.timestampKind||'captured_at',p.observationTimestampKnown===true,p.comparisonMethodVersion??'',rollingHistoryLegacy(p)?'unverified_legacy_roll_identity':'explicit_roll_eligibility_policy',rollingHistoryNote(p),p.contentHash??'',p.comparableCoverage??'',p.capturedCoverage??'',p.qualityConstant??''])]};
}
function mainHistoryExport(report,measure=metric){
 const model=measure==='nx',points=mainHistoryPoints(report,measure).filter(p=>mainRangeFilter(p,report)&&launchPeriodFilter(p));
 return {headers:['source_day','chart_time','kind','plotted_value','unit','goods_mpi','reference_nx_rate_mesos_per_nx','partial_day','source','timestamp_kind','formula'],rows:points.map(p=>[p.day||p.at.slice(0,10),p.at,p.kind,p.value,model?'modelled_mesos_per_nx':'mpi_points',p.cpi,model?report.baseNxRate:'',p.partial,report.feedUrl,'source_calendar_day_plot_anchor',model?'reference_nx_rate * goods_mpi / 100':'fixed_goods_basket_mpi'])};
}
$('export-history').addEventListener('click',()=>{if(snapshot){const data=mainHistoryExport(snapshot);csvDownload(metric==='nx'?'inflation-watch-goods-nx-benchmark.csv':'inflation-watch-mpi-history.csv',data.headers,data.rows);}});
if($('view-nx')&&!$('export-cash-history')){
 const paragraph=document.createElement('p'),button=document.createElement('button');paragraph.className='footnote';button.type='button';button.id='export-cash-history';button.className='text-button';button.textContent='↓ Export observed cash and reference evidence CSV';paragraph.append(button);$('view-nx').append(paragraph);
 button.addEventListener('click',()=>{if(snapshot){const data=marketHistoryExport(snapshot);csvDownload('inflation-watch-cash-reference-history.csv',data.headers,data.rows);}});
}
window.addEventListener('hashchange',()=>{if(snapshot&&(!$('view-nx').hidden||$('view-highlights')&&!$('view-highlights').hidden))renderSmega();if(snapshot&&!$('view-nx').hidden)renderReportedHistory();});
document.addEventListener('astrahourlyhistorychange',()=>{if(snapshot)renderSmega();});
window.addEventListener('resize',()=>{if(snapshot&&$('view-highlights')&&!$('view-highlights').hidden)renderSmega();});
route();focusRouteAnchor();checkSnapshot();setInterval(()=>{if(snapshot){if(!benchmarkHeadline(snapshot).live&&$('rate-kind').dataset.observationKind==='live')render();else{renderFreshness();renderSources();}}},30000);
