'use strict';
let chartSerial=0, selectedCpiRange='all', selectedSmegaRange='24';
let snapshot, version, selectedRange='all', metric='nx', sortKey='weight', sortAsc=false, layout='table', retry=60000, timer;
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=(v,d=0)=>Number.isFinite(v)?v.toLocaleString('en-US',{maximumFractionDigits:d,minimumFractionDigits:d}):'—';
const compact=v=>Number.isFinite(v)?Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:1}).format(v):'—';
const percent=v=>`${v>=0?'+':''}${number(v,1)}%`;
let displayTimeZone='UTC';
try{const saved=localStorage.getItem('astra-display-timezone');if(saved){new Intl.DateTimeFormat('en-US',{timeZone:saved});displayTimeZone=saved;}}catch{}
const utc=v=>v?new Date(v).toLocaleString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false,timeZone:displayTimeZone})+' '+displayTimeZone:'Not available';
const zones=[...new Set(['UTC',...(Intl.supportedValuesOf?Intl.supportedValuesOf('timeZone'):['America/Chicago','America/New_York','America/Los_Angeles','Europe/London','Asia/Seoul','Asia/Tokyo']),displayTimeZone])];
$('display-timezone').innerHTML=zones.map(zone=>`<option value="${esc(zone)}">${esc(zone.replaceAll('_',' '))}</option>`).join('');
$('display-timezone').value=displayTimeZone;

const sprite=(r)=>`<img class="sprite" src="${esc(snapshot?.spriteMap?.[r.slug]||`assets/${r.slug}.svg`)}" alt="" loading="lazy" width="31" height="31">`;
const referenceItem=r=>snapshot.rollingReference?.items.find(i=>i.name===r.name);
const referenceCell=r=>{const i=referenceItem(r);return i?`<span class="ref-cell">${number(i.price)}<small>${i.windowDays}d window · ${number(i.salesCounted)} sales</small></span>`:'—';};
const nameOf=r=>esc(r.name)+(r.slug==='wolbi-throwing-stars'?'*':'');
const recentLive=()=>snapshot.live&&Date.now()-Date.parse(snapshot.live.observedAt)<2400000;
const activeRate=()=>recentLive()?(snapshot.live.nxRate??snapshot.latest.nxRate):snapshot.latest.nxRate;
const activeCpi=()=>recentLive()?(snapshot.live.cpi??snapshot.latest.cpi):snapshot.latest.cpi;
const freshLive=()=>snapshot.live?.nxRate!=null&&Date.now()-Date.parse(snapshot.live.observedAt)<2400000;
const route=()=>{let page=location.hash.slice(1)||'index';if(page==='method-weights')page='method';if(page==='smega-section')page='index';const itemSlug=page.startsWith('item/')?decodeURIComponent(page.slice(5)):null;if(itemSlug)page='item';if(!['index','basket','nx','method','sources','item'].includes(page))page='index';document.querySelectorAll('.view').forEach(s=>s.hidden=s.id!==`view-${page}`);document.querySelectorAll('.nav-link').forEach(a=>{a.classList.toggle('active',a.hash===`#${page}`);a.setAttribute('aria-current',a.hash===`#${page}`?'page':'false');});if(page==='item'&&snapshot)renderItemPage(itemSlug);if(page==='index'&&snapshot){renderMainChart();renderVolume();renderCpiDetail();renderSmega();renderReportedHistory();}};

function spark(values,color='#87bdcf',width=100,height=30){
 const vals=values.filter(Number.isFinite); if(vals.length<2)return '';
 const low=Math.min(...vals),high=Math.max(...vals),span=high-low||1;
 const pts=vals.map((v,i)=>`${(i/(vals.length-1)*width).toFixed(2)},${(height-3-(v-low)/span*(height-6)).toFixed(2)}`).join(' ');
 return `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" stroke="${color}" stroke-width="1.6" fill="none" vector-effect="non-scaling-stroke"/></svg>`;
}

function chartHTML(series,{height=264,yTitle='mesos / NX',event=true,compactAxis=false,zeroBaseline=false,width=1120,allowNegative=false,dateOnlyAxis=false}={}){
 const chartId='plot-'+(++chartSerial);
 const W=width,H=height,L=55,R=25,T=25,B=32;
 const all=series.flatMap(s=>s.points).filter(p=>Number.isFinite(p.value));
 if(!all.length)return '<div class="empty">No observations in this range. Missing history is not interpolated.</div>';
 let xmin=Math.min(...all.map(p=>Date.parse(p.at))),xmax=Math.max(...all.map(p=>Date.parse(p.at)));
 if(xmin===xmax){xmin-=43200000;xmax+=43200000;}
 let low=Math.min(...all.map(p=>p.value)),high=Math.max(...all.map(p=>p.value)); const pad=(high-low)*.15||Math.max(high*.1,1);low=allowNegative?low-pad:Math.max(0,low-pad);high+=pad;if(zeroBaseline)low=0;
 const x=t=>L+(Date.parse(t)-xmin)/(xmax-xmin)*(W-L-R), y=v=>T+(high-v)/(high-low)*(H-T-B);
 let out=`<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg"><title>${esc(yTitle)} over time</title><defs><linearGradient id="${chartId}-fill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#87bdcf" stop-opacity=".15"/><stop offset="1" stop-color="#87bdcf" stop-opacity="0"/></linearGradient><clipPath id="${chartId}-clip"><rect x="${L}" y="${T}" width="${W-L-R}" height="${H-T-B}"/></clipPath></defs>`;
 for(let i=0;i<=4;i++){const v=low+(high-low)*i/4,yp=y(v);out+=`<line x1="${L}" x2="${W-R}" y1="${yp}" y2="${yp}" stroke="#2c3c46" stroke-dasharray="3 6"/><text x="${L-12}" y="${yp+4}" text-anchor="end">${compactAxis?compact(v):number(v,high<40?1:0)}</text>`;}
 const ticks=W<500?3:5;for(let i=0;i<=ticks;i++){const t=xmin+(xmax-xmin)*i/ticks;const label=new Date(t).toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:dateOnlyAxis?'UTC':displayTimeZone});out+=`<text x="${L+(W-L-R)*i/ticks}" y="${H-8}" text-anchor="middle">${label}</text>`;}
 if(event){const mark=x('2026-10-25T12:00:00Z');if(mark>=L&&mark<=W-R)out+=`<line x1="${mark}" x2="${mark}" y1="${T}" y2="${H-B}" stroke="#6d6650" stroke-dasharray="3 5"/><text x="${mark+6}" y="${T+10}" style="font-size:8px;fill:#b4a983">Wolbi supply shift*</text>`;}
 for(let si=0;si<series.length;si++){
  const s=series[si];const pts=s.points.filter(p=>Number.isFinite(p.value)).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));if(!pts.length)continue;
  const pointString=pts.map(p=>`${x(p.at).toFixed(2)},${y(p.value).toFixed(2)}`).join(' ');
  if(si===0&&s.fill!==false&&pts.length>1)out+=`<polygon points="${x(pts[0].at)},${H-B} ${pointString} ${x(pts.at(-1).at)},${H-B}" fill="url(#${chartId}-fill)" clip-path="url(#${chartId}-clip)"/>`;
  if(s.line!==false&&pts.length>1){let segments=[[]];for(const p of pts){const part=segments.at(-1);if(part.length&&s.maxGapMs&&Date.parse(p.at)-Date.parse(part.at(-1).at)>s.maxGapMs)segments.push([]);segments.at(-1).push(p);}for(const part of segments.filter(p=>p.length>1))out+=`<polyline points="${part.map(p=>`${x(p.at).toFixed(2)},${y(p.value).toFixed(2)}`).join(' ')}" stroke="${s.color}" stroke-width="2.2" fill="none" ${s.dash?'stroke-dasharray="5 5"':''} vector-effect="non-scaling-stroke" clip-path="url(#${chartId}-clip)"/>`;}

  for(const p of pts)out+=`<circle cx="${x(p.at)}" cy="${y(p.value)}" r="${s.line===false?4:2.6}" fill="${s.line===false?'#172530':s.color}" stroke="${s.color}" stroke-width="1.5"><title>${esc(s.name)} · ${esc(p.datePrecision==='day'?p.date+' · source time unspecified':utc(p.at))}: ${number(p.value,2)} ${esc(yTitle)}${p.partial?' · partial source interval':''}${p.sampleCount?' · source sample '+p.sampleCount:''}${p.measurementWindow==='trailing_24_hours_at_unspecified_report_time'?' · trailing 24 hours at unspecified report time':''}${p.p25!=null?' · middle half '+number(p.p25,1)+'–'+number(p.p75,1):''}</title></circle>`;
 }
 out+='</svg>';return out;
}

function rangeFilter(p){if(selectedRange==='all')return true;const end=Math.max(Date.parse(snapshot.sourceUpdatedAt),...(snapshot.intraday||[]).map(p=>Date.parse(p.observedAt)),...(snapshot.comparisons||[]).map(p=>Date.parse(p.observedAt)),...(snapshot.rollingReferenceHistory||[]).map(p=>Date.parse(p.at)),...(snapshot.smega||[]).map(p=>Date.parse(p.at)));return Date.parse(p.at)>=end-Number(selectedRange)*86400000;}
function renderMainChart(){
 const key=metric==='nx'?'nxRate':'cpi';
 const series=[{name:metric==='nx'?'Cash-item sale estimate':'Fixed-basket CPI',color:'#87bdcf',points:snapshot.history.map(p=>({...p,value:p[key]})).filter(rangeFilter)},{name:'Intraday scanner',color:'#edc471',points:snapshot.intraday.map(p=>({at:p.observedAt,value:p[key]})).filter(rangeFilter)}];
 series.push({name:'Rolling scanner reference (2–30 day windows; capture time)',color:'#edc471',line:false,points:(snapshot.rollingReferenceHistory||[]).map(p=>({at:p.at,value:p[key]})).filter(rangeFilter)});
 $('main-chart').innerHTML=chartHTML(series,{yTitle:metric==='nx'?'mesos per NX':'CPI points'});
 $('main-chart').setAttribute('aria-label',metric==='nx'?'Cash-item implied NX exchange rate by observation date, with a separate rolling scanner reference. Offers are shown in their own chart.':'Fixed-basket meso price index over time.');
 $('chart-note').textContent=`Source through ${utc(snapshot.sourceUpdatedAt)} · latest day partial · ${snapshot.intraday.length} intraday observations · offers and player reports shown separately`;
}

function renderCpiDetail(){
 const end=Math.max(Date.parse(snapshot.sourceUpdatedAt),...snapshot.intraday.map(p=>Date.parse(p.observedAt)));
 const keep=p=>selectedCpiRange==='all'||Date.parse(p.at)>=end-Number(selectedCpiRange)*86400000;
 const series=[{name:'Daily fixed-basket CPI',color:'#87bdcf',points:snapshot.history.map(p=>({...p,value:p.cpi})).filter(keep)},{name:'Qualified intraday sale CPI',color:'#edc471',points:snapshot.intraday.map(p=>({at:p.observedAt,value:p.cpi})).filter(keep)}];
 $('cpi-detail-chart').innerHTML=chartHTML(series,{yTitle:'CPI points',event:true,width:Math.max(320,($('cpi-detail-chart').clientWidth||1148)-28)});
 $('cpi-detail-note').textContent=`Source through ${utc(snapshot.sourceUpdatedAt)} · latest day partial · ${snapshot.intraday.filter(p=>Number.isFinite(p.cpi)).length} qualified intraday observations · smega offers and player reports excluded`;
}
function categoryGauge(index){
 const angle=-Math.PI+Math.min(200,Math.max(0,index))/200*Math.PI;
 const x=70+43*Math.cos(angle),y=61+43*Math.sin(angle);
 return `<svg class="category-gauge" viewBox="0 0 140 72" aria-hidden="true"><path d="M18 61A52 52 0 0 1 122 61" fill="none" stroke="#3c4c40" stroke-width="9"/><path d="M18 61A52 52 0 0 1 122 61" fill="none" stroke="#bfa66a" stroke-opacity=".35" stroke-width="9" pathLength="200" stroke-dasharray="100 200"/><line x1="70" y1="61" x2="${x}" y2="${y}" stroke="#edc471" stroke-width="2"/><circle cx="70" cy="61" r="4" fill="#edc471"/><text x="14" y="71">0</text><text x="70" y="8" text-anchor="middle">100</text><text x="122" y="71" text-anchor="end">200</text></svg>`;
}

function renderReportedHistory(){
 const history=snapshot.reportedNxHistory||{},points=(history.points||[]).map(p=>({...p,at:p.date+'T12:00:00Z',value:p.rate}));
 const captures=(snapshot.comparisons||[]).filter(p=>p.kind==='player_report').map(p=>({...p,at:p.observedAt,value:p.rate}));
 $('reported-chart').innerHTML=chartHTML([{name:'NiaDB published report (date only)',color:'#89c6b0',line:false,points},{name:'NiaDB indicator capture (source observation time unknown)',color:'#d9a1a0',line:false,points:captures}],{event:false,yTitle:'reported mesos per NX',dateOnlyAxis:true,width:Math.max(320,($('reported-chart').clientWidth||1148)-28)});
 $('reported-history-note').textContent=`${points.length} exact published daily values · ${captures.length} dated indicator captures · gaps are left empty`;
 $('reported-history-sources').innerHTML=`Published report dates have day precision; their horizontal positions represent calendar days, not known intraday trade times. The October 14 indicator explicitly covers a trailing 24-hour window at an unspecified report time. Captures use our pull time because the underlying observation time is unknown. These player-reported indicators never enter the sale estimate or CPI. Sources: ${(history.sources||[]).map((source,i)=>`<a href="${esc(source.sourceUrl)}" target="_blank" rel="noreferrer">NiaDB report ${i+1}</a> (last pulled ${esc(utc(source.capturedAt))})`).join(' · ')}.`;
}

function deriveSmegaSpreads(points){
 const groups=new Map();
 for(const p of points){if(!['sell','buy'].includes(p.side)||!Number.isFinite(p.rate)||p.rate<=0||!Number.isFinite(Date.parse(p.at)))continue;const at=new Date(p.at).toISOString(), key=(p.sourceUrl||'')+'|'+at;let g=groups.get(key);if(!g){g={at,sourceUrl:p.sourceUrl};groups.set(key,g);}if(g[p.side]&&g[p.side].rate!==p.rate)g.conflict=true;else g[p.side]=p;}
 return [...groups.values()].filter(g=>g.sell&&g.buy&&!g.conflict).map(g=>{const spread=g.sell.rate-g.buy.rate,midpoint=(g.sell.rate+g.buy.rate)/2;return {at:g.at,sourceUrl:g.sourceUrl,ask:g.sell.rate,bid:g.buy.rate,spread,spreadPercent:spread/midpoint*100,askCount:g.sell.sampleCount??g.sell.distinctSenders??null,bidCount:g.buy.sampleCount??g.buy.distinctSenders??null,partial:!!(g.sell.partial||g.buy.partial)};}).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
}
function smegaInputs(){return (snapshot.smega||[]).filter(p=>p.sourceUrl===snapshot.smegaSource?.sourceUrl&&p.aggregation==='source_published_hourly');}
function renderSmega(){
 const inputs=smegaInputs(), pairs=deriveSmegaSpreads(inputs),latest=pairs.at(-1),end=Math.max(0,...inputs.map(p=>Date.parse(p.at)));
 const keep=p=>selectedSmegaRange==='all'||Date.parse(p.at)>=end-Number(selectedSmegaRange)*3600000;
 if(!latest){$('smega-stats').innerHTML='';$('smega-offer-chart').innerHTML='<div class="empty">Awaiting published paired offers.</div>';$('smega-spread-chart').innerHTML='<div class="empty">No matching source/hour pairs.</div>';return;}
 $('smega-point-note').textContent=`Latest paired source hour: ${utc(latest.at)}${latest.partial?' · partial when pulled':''}`;
 const stats=[['SELLERS ASK','1:'+number(latest.ask,1),`${latest.askCount??'—'} source posters`],['BUYERS BID','1:'+number(latest.bid,1),`${latest.bidCount??'—'} source posters`],['MEDIAN GAP',number(latest.spread,1),'mesos per NX · ask minus bid'],['GAP / MIDPOINT',number(latest.spreadPercent,1)+'%','Same source and hourly bucket']];
 $('smega-stats').innerHTML=stats.map(([label,value,detail])=>`<div class="stat-cell"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(detail)}</small></div>`).join('');
 const width=Math.max(320,($('smega-offer-chart').clientWidth||1148)-28);
 $('smega-offer-chart').innerHTML=chartHTML([{name:'MapleStory Market sellers ask',color:'#89c6b0',fill:false,maxGapMs:5400000,points:inputs.filter(p=>p.side==='sell').map(p=>({...p,value:p.rate})).filter(keep)},{name:'MapleStory Market buyers bid',color:'#baa3cf',fill:false,maxGapMs:5400000,points:inputs.filter(p=>p.side==='buy').map(p=>({...p,value:p.rate})).filter(keep)}],{yTitle:'mesos per NX offered',event:false,width});
 const percent=$('smega-spread-unit').value==='percent', spreadPoints=pairs.filter(keep).map(p=>({...p,value:percent?p.spreadPercent:p.spread}));
 $('smega-spread-chart').innerHTML=chartHTML([{name:'Ask median minus bid median',color:'#edc471',fill:false,maxGapMs:5400000,points:spreadPoints}],{height:200,yTitle:percent?'% of midpoint':'mesos per NX gap',event:false,width,allowNegative:true});
 $('smega-history-note').textContent=`${spreadPoints.length} matched hours plotted · ${inputs.length} published side/hour observations pulled · last pulled ${utc(snapshot.smegaSource.capturedAt)} · cash-item sales appear in their own chart`;
}

function selectedVolumeRows(){
 const rows=snapshot.volumeHistory||[];
 return $('volume-period').value==='all'?rows:rows.filter(p=>!p.partial).slice(-7);
}
function renderVolume(){
 const rows=selectedVolumeRows(), mode=$('volume-metric').value;
 if(!rows.length){$('volume-stats').innerHTML='';$('volume-chart').innerHTML='<div class="empty">No recorded volume history available.</div>';$('volume-note').textContent='Awaiting daily observations.';return;}
 const total=key=>rows.reduce((sum,p)=>sum+p[key],0), all=total('allMesos'), basket=total('basketMesos');
 const stats=[['FULL FEED · EST. MESOS',compact(all),number(all)+' mesos'],['50-ITEM BASKET · EST. MESOS',compact(basket),number(basket)+' mesos'],['BASKET SHARE OF TURNOVER',all?number(basket/all*100,1)+'%':'—','Basket is included in the full feed'],['RECORDED SALES VOLUME',compact(total('allSoldVolume')),number(total('basketSoldVolume'))+' within the basket']];
 $('volume-stats').innerHTML=stats.map(([label,value,detail])=>`<div class="stat-cell"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(detail)}</small></div>`).join('');
 const series=[['Full source feed','#87bdcf','all'],['Fixed 50-item basket','#edc471','basket']].map(([name,color,prefix])=>{let running=0;return {name,color,points:rows.map(p=>{const daily=p[prefix+(mode==='sales'?'SoldVolume':'Mesos')];running+=daily;return {...p,value:mode==='cumulative'?running:daily};})};});
 const unit=mode==='sales'?'recorded sales / day':mode==='cumulative'?'cumulative estimated mesos':'estimated mesos / day';
 $('volume-chart').innerHTML=chartHTML(series,{yTitle:unit,event:false,compactAxis:true,zeroBaseline:true,width:Math.max(320,($('volume-chart').clientWidth||1148)-28)});
 $('volume-chart').setAttribute('aria-label',unit+' for the full feed and fixed 50-item basket');
 $('volume-note').textContent=`${rows[0].day} – ${rows.at(-1).day} · ${rows.length} recorded days${rows.some(p=>p.partial)?' · latest day partial':''}${mode==='cumulative'?' · cumulative totals start at this period’s first day':''} · source published ${utc(snapshot.sourceUpdatedAt)}`;
}

function renderFreshness(){
 if(!snapshot)return;
 const stamp=recentLive()?snapshot.live.observedAt:snapshot.sourceUpdatedAt;const age=(Date.now()-Date.parse(stamp))/60000;
 $('header-freshness').textContent=`${freshLive()?'Live observation':'Source snapshot'} · ${utc(stamp)}`;
 $('status-dot').className='dot '+(age>180?'red':age>40?'amber':'');
 $('notice').className='notice '+(snapshot.sourceStatus.status==='degraded'?'error':'');
 $('notice').textContent=snapshot.sourceStatus.status==='degraded'?`Source unavailable. Showing the last valid market data from ${utc(snapshot.sourceUpdatedAt)}. ${snapshot.sourceStatus.detail}`:freshLive()?`Intraday scanner data · ${utc(snapshot.live.observedAt)}. Market history and tables update together when a new snapshot is available.`:`Dated market snapshot · ${utc(snapshot.sourceUpdatedAt)}. Checked ${utc(snapshot.sourceStatus.checkedAt)}. ${snapshot.rollingReference?'Rolling scanner references and hourly smega offers are available in NX → meso; these captures are dated separately.':snapshot.liveNote}`;
}

function render(){
 const rate=activeRate(),cpi=activeCpi();
 $('main-rate').textContent=number(rate,1);$('exact-rate').textContent=`${number(rate*1000)} mesos per 1,000 NX`;
 $('rate-kind').textContent=freshLive()?'INTRADAY ESTIMATE':snapshot.latest.partial?'PARTIAL DAY SNAPSHOT':'DAILY SNAPSHOT';
 $('rate-change').textContent=percent((rate/snapshot.baseNxRate-1)*100);$('main-cpi').textContent=number(cpi,1);$('cpi-change').textContent=percent(cpi-100);
 const complete=snapshot.history.filter(p=>!p.partial&&Number.isFinite(p.cpi)).at(-1);
 $('cpi-period').textContent=`${snapshot.latest.day} · ${snapshot.latest.partial?'partial day':'complete day'} · ${number(snapshot.latest.coverage*100,1)}% of weight observed on this day`;
 $('cpi-complete-note').textContent=`Basket v${snapshot.basketVersion}: fixed reference spending weights, ${snapshot.baseStart}–${snapshot.baseEnd}. ${complete?'Last complete day '+complete.day+': '+number(complete.cpi,1)+'.':''}`;
 $('snapshot-date').innerHTML=`<strong>${esc(new Date(snapshot.sourceUpdatedAt).toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric',timeZone:'UTC'}))}</strong>Base: Oct 21–27, 2026`;
 $('cpi-spark').innerHTML=spark(snapshot.history.map(p=>p.cpi));
 $('market-stats').innerHTML=[['SOURCE SALES SINCE LAUNCH',number(snapshot.salesSinceLaunch),'All items · recorded sold volume'],['ITEMS IN THE FEED',number(snapshot.itemsAvailable),'50 items in the fixed CPI basket'],['BASKET SOLD VOLUME / 7D',number(snapshot.basketRecentQuantity),`${number(snapshot.quantityCoverage*100,1)}% of feed volume`],['SOURCE CHECK INTERVAL','10 minutes','Market timestamp shown separately']].map(([label,val,sub])=>`<div class="stat-cell"><span>${esc(label)}</span><strong>${esc(val)}</strong><small>${esc(sub)}</small></div>`).join('');
 const reps={Scrolls:'hat-accuracy-scroll-greater',Equipment:'emerald-earrings',Weapons:'wolbi-throwing-stars',Materials:'iron-ore',Consumables:'orange-potion'};
 $('category-cards').innerHTML=snapshot.categories.map(c=>`<button class="category-card" data-category="${esc(c.name)}"><span class="category-top">${sprite(snapshot.rows.find(r=>r.category===c.name)||{slug:reps[c.name]})}${esc(c.name)}</span>${categoryGauge(c.index)}<strong>${number(c.index,1)}</strong><span class="category-change ${c.index>=100?'up':'down'}">${percent(c.index-100)}</span><span class="cat-meta">${c.count} items · ${number(c.weight*100,1)}% basket weight</span><span class="weight-track"><i style="width:${c.weight*100}%"></i></span></button>`).join('');
 const movers=[...snapshot.rows].sort((a,b)=>Math.abs(b.changeContribution??b.changeBase)-Math.abs(a.changeContribution??a.changeBase)).slice(0,4);
 $('movers').innerHTML=movers.map(r=>`<div class="mover">${sprite(r)}<div class="item-name">${nameOf(r)}<small>${esc(r.category)} · ${number(r.weight*100,1)}% weight</small></div><div class="mover-value">${Number.isFinite(r.changeContribution)?(r.changeContribution>=0?'+':'')+number(r.changeContribution,1)+' pts':compact(r.price)}<small class="${r.changeBase>=0?'up':'down'}">${percent(r.changeBase)} price</small></div></div>`).join('');
 $('overview-freshness').innerHTML=[['Market source',utc(snapshot.sourceUpdatedAt)],['Collector checked',utc(snapshot.sourceStatus.checkedAt)],['Page built',utc(snapshot.builtAt)],['Scanner reference',snapshot.rollingReference?'Dated '+utc(snapshot.rollingReference.capturedAt):'Not connected'],['Collection','One collector · 10 min checks']].map(([label,value])=>`<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('');
 $('wolbi-note').textContent=snapshot.wolbi.text;
 $('wolbi-short').textContent='Citizenship-shop supply coincided with a fall from 19,999 to 3,648 mesos across Oct 24–26. That is an item-specific supply shock, not a clean measure of economy-wide deflation.';
 $('basket-context').innerHTML=(snapshot.contextItems||[]).map(r=>`<p class="eyebrow">CONTEXT · OUTSIDE THE 50-ITEM INDEX</p><button class="item-link" data-item="${esc(r.slug)}">${sprite(r)}${nameOf(r)} <small>${number(r.price)} mesos · ${esc(r.priceDay)} · zero CPI weight</small></button><p>Kept here for its citizenship-shop supply event. It does not rank in the top 50 by the v2 reference-turnover rule.</p>`).join('');
 $('method-base-coverage').textContent=`The 50 selected items account for ${number(snapshot.baseTurnoverCoverageProxy*100,1)}% of qualified non-cash reference-week estimated turnover (October 21–27). All items passing the liquidity rule account for ${number(snapshot.eligibleBaseTurnoverCoverageProxy*100,1)}%; the basket takes the largest 50 by reference turnover. These shares use the frozen selection source, not today’s rankings.`;
 $('method-coverage').textContent=`This basket covers ${number(snapshot.quantityCoverage*100,1)}% of the feed’s recorded seven-day sale volume and ${number(snapshot.turnoverCoverageProxy*100,1)}% of estimated meso turnover. Activity uses ${snapshot.recentStart} through the day before ${snapshot.recentEndExclusive}; reference-period membership and weights stay fixed. These shares are computed from this snapshot, not inherited from an old artifact.`;
 $('method-tiles').innerHTML=snapshot.categories.map(c=>`<div class="method-category"><h3>${esc(c.name)} <small>${c.count} items · ${number(c.weight*100,1)}% weight</small></h3><div class="tiles">${snapshot.rows.filter(r=>r.category===c.name).map(tileHTML).join('')}</div></div>`).join('');
 renderVolume();renderBasket();renderCash();renderComparisons();renderSources();renderSourceComparisons();renderConverter();renderQuickConverter();renderMainChart();renderFreshness();route();
}

const weightHelp=()=>'<sup class="weight-help"><a href="#method-weights" aria-label="Why this weight? Read the basket methodology" title="Why this weight?">?</a></sup>';
function tileHTML(r){return `<button class="item-tile" data-item="${esc(r.slug)}"><span class="tile-title">${sprite(r)}${nameOf(r)}</span><strong>${compact(r.price)} <small>mesos / ${esc(r.unit)}</small></strong><small>${number(r.recentQuantity)} sold volume / 7d</small><span class="tile-bottom"><span>${number(r.weight*100,2)}% weight</span><span class="${r.changeBase>=0?'up':'down'}">${percent(r.changeBase)}</span></span></button>`;}
function renderBasket(){
 const query=$('basket-search').value.toLowerCase().trim(),cat=$('category-filter').value;
 let rows=snapshot.rows.filter(r=>(cat==='All categories'||r.category===cat)&&r.name.toLowerCase().includes(query));
 rows.sort((a,b)=>{const av=a[sortKey],bv=b[sortKey];return(typeof av==='string'?av.localeCompare(bv):av-bv)*(sortAsc?1:-1);});
 $('basket-summary').textContent=`${rows.length} of ${snapshot.rows.length} items · ${number(rows.reduce((n,r)=>n+r.weight,0)*100,1)}% of basket weight shown · prices from the latest qualified source day`;
 const headers=[['name','Item'],['price','Daily price'],['scanner','Rolling scanner reference'],['recentQuantity','Sold volume · 7d'],['recentTurnoverProxy','Est. turnover · 7d'],['weight','Weight'],['changeBase','Vs. base'],['history','History']];
 $('basket-table').innerHTML=`<table><thead><tr>${headers.map(([key,label])=>`<th ${key===sortKey?`aria-sort="${sortAsc?'ascending':'descending'}"`:''}>${['history','scanner'].includes(key)?label:`<button data-sort="${key}">${label} ${sortKey===key?(sortAsc?'↑':'↓'):''}</button>`}${key==='weight'?weightHelp():''}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr><td><button class="item-link" data-item="${esc(r.slug)}">${sprite(r)}<span>${nameOf(r)}<small>${esc(r.category)} · per ${esc(r.unit)} · ${esc(r.priceDay)}</small></span></button></td><td>${number(r.price)}</td><td>${referenceCell(r)}</td><td>${number(r.recentQuantity)}</td><td>${compact(r.recentTurnoverProxy)}</td><td>${number(r.weight*100,2)}%${weightHelp()}</td><td class="${r.changeBase>=0?'up':'down'}">${percent(r.changeBase)}</td><td><div class="mini-spark">${spark(r.history.map(p=>p[1]),r.changeBase>=0?'#87bdcf':'#89c6b0')}</div></td></tr>`).join('')||'<tr><td colspan="8" class="empty">No items match this search.</td></tr>'}</tbody></table>`;
 $('basket-tiles').innerHTML=rows.map(tileHTML).join('')||'<div class="empty">No items match.</div>';
 $('basket-table').hidden=layout!=='table';$('basket-tiles').hidden=layout!=='tiles';
}
function renderCash(){
 $('cash-count').textContent=`${snapshot.cash.length} FIXED-PRICE CASH ITEMS`;
 $('cash-table').innerHTML=`<table><thead><tr><th>Cash item</th><th>Fixed NX price</th><th>Daily median · mesos</th><th>Rolling scanner reference</th><th>Mesos / NX</th><th>Sold volume · source day</th><th>Price day</th></tr></thead><tbody>${[...snapshot.cash].sort((a,b)=>b.recentQuantity-a.recentQuantity).map(r=>`<tr><td><button class="item-link" data-item="${esc(r.slug)}">${sprite(r)}${esc(r.name)}</button></td><td>${number(r.nx)}</td><td>${number(r.price)}</td><td>${referenceCell(r)}</td><td>${number(r.rate,2)}</td><td>${number(r.quantity)}</td><td>${esc(r.priceDay)}</td></tr>`).join('')}</tbody></table>`;
}
function ratio(rate){return Number.isFinite(rate)?'1:'+Number(rate.toFixed(1)).toLocaleString('en-US'):'—';}
function renderComparisons(){
 const reported=snapshot.comparisons.filter(p=>p.kind==='player_report').at(-1), source=snapshot.smegaSource,s=source?.summary,r=snapshot.rollingReference;
 const pulled=source?.summaryCapturedAt||source?.capturedAt,spread=s?s.sellerRate-s.buyerRate:null,midpoint=s?(s.sellerRate+s.buyerRate)/2:null;
 $('comparison-card').innerHTML=`<section class="signal-group"><p class="eyebrow">OUR CASH-ITEM SALES</p><div class="comparison-row"><span>Our cash-item sale estimate<small>${snapshot.latest.partial?'Partial daily snapshot':'Daily snapshot'} · source ${esc(utc(recentLive()?snapshot.live.observedAt:snapshot.sourceUpdatedAt))}</small></span><strong>${ratio(activeRate())}</strong></div></section><section class="signal-group"><p class="eyebrow">OTHER SITES’ INDICATORS</p><div class="comparison-row"><span><a href="https://meowdb.com/msclassic/free-market" target="_blank" rel="noreferrer">NiaDB reports</a><small>${reported?'Last pulled '+esc(utc(reported.observedAt))+' · player-reported prices':'Not connected'}</small></span><strong>${reported?ratio(reported.rate):'—'}</strong></div><div class="comparison-row"><span><a href="https://mesos.watch/" target="_blank" rel="noreferrer">mesos.watch reports</a><small>${r?'Last pulled '+esc(utc(r.capturedAt))+' · '+r.windowMinDays+'–'+r.windowMaxDays+' day sale windows':'Not connected'}</small></span><strong>${r?ratio(r.nxRateReference):'—'}</strong></div></section><section class="signal-group"><p class="eyebrow">SELLER ASKS / BUYER BIDS · OFFERS</p><div class="comparison-row"><span><a href="https://maplestory.market/ads?tab=services" target="_blank" rel="noreferrer">MapleStory Market sellers ask</a><small>${s?'Last pulled '+esc(utc(pulled))+' · '+s.sellerPosters+' posters / '+s.windowHours+'h':'Awaiting observations'}</small></span><strong>${s?ratio(s.sellerRate):'—'}</strong></div><div class="comparison-row"><span>MapleStory Market buyers bid<small>${s?s.buyerPosters+' posters / same '+s.windowHours+'h window':'Awaiting observations'}</small></span><strong>${s?ratio(s.buyerRate):'—'}</strong></div><div class="comparison-row signal-spread"><span>Median ask − median bid<small>${s?number(spread/midpoint*100,1)+'% of midpoint · offer medians, not an executable trade spread':'Awaiting paired medians'}</small></span><strong>${s?number(spread,1):'—'}<small>mesos per NX</small></strong></div><a class="small" href="#smega-section">See hourly offers and spread history →</a></section>`;
}
function renderSourceComparisons(){
 const r=snapshot.rollingReference;
 $('rolling-reference-card').innerHTML=r?`<p class="eyebrow gold">MESOS.WATCH REPORTS</p><h2>A rolling reference, with its window visible.</h2><div class="source-comparison-grid"><div><strong>${ratio(r.nxRateReference)}</strong><span>mesos per NX · sale-count-per-hour weighting proxy</span></div><div><strong>${number(r.cpiReference,1)}</strong><span>CPI reference · ${number(r.coverage*100,1)}% basket weight captured</span></div></div><p>Last pulled ${esc(utc(r.capturedAt))}. Each item’s median uses a different ${r.windowMinDays}–${r.windowMaxDays} day sale window. This can differ substantially from the daily estimate, so it does not replace the headline or enter the daily history.</p><p class="small muted">Scanner status when pulled: ${esc(r.scannerFreshnessText)} The capture time is not a new trade timestamp. Matched inputs appear in the basket and cash tables; capture coverage is measured against the current versioned basket.</p>`:'<p>No rolling scanner reference captured yet.</p>';
 const source=snapshot.smegaSource,s=source?.summary;
 $('smega-source-card').innerHTML=s?`<p class="eyebrow">CHAT & MEGAPHONE OFFERS</p><h2>What sellers ask. What buyers offer.</h2><div class="source-comparison-grid"><div><strong>1:${number(s.sellerRate,1)}</strong><span>Sellers ask · ${s.sellerPosters} posters / ${s.windowHours} hours</span></div><div><strong>1:${number(s.buyerRate,1)}</strong><span>Buyers bid · ${s.buyerPosters} posters / ${s.windowHours} hours</span></div></div><p>${snapshot.smega.length} published hourly observations are plotted on Overview, with source sample counts and middle-half ranges in point tooltips. These are source-published aggregates, not our independent interpretation of raw messages.</p><p>Summary last pulled ${esc(utc(source.summaryCapturedAt||source.capturedAt))}; hourly series last pulled ${esc(utc(source.capturedAt))}. The source table’s Chicago local hours are converted to UTC. This browser capture is dated; continuous collection is not yet connected. <a href="${esc(source.sourceUrl)}" target="_blank" rel="noreferrer">View the live source ↗</a></p>`:'<p>Waiting for a timestamped smega source.</p>';
}
function renderSources(){
 const r=snapshot.rollingReference;
 const cards=[['DEVELOPER MARKET FEED',utc(snapshot.sourceUpdatedAt),`${snapshot.itemsAvailable} priced items · latest day partial`,snapshot.sourceStatus.status],['COLLECTOR CHECK',utc(snapshot.sourceStatus.checkedAt),'10-minute interval · conditional requests · last good cache',snapshot.sourceStatus.status],['SCANNER REFERENCE',r?utc(r.capturedAt):'Awaiting data',r?`${r.items.length} items captured · rolling ${r.windowMinDays}–${r.windowMaxDays} day medians · source scan time unknown`:'No browser capture yet.',r?'dated browser capture':'not connected'],['PAGE GENERATED',utc(snapshot.builtAt),'This clock does not reset the age of market prices.','Astra preview'],['SMEGA SERIES',snapshot.smega.length?`${snapshot.smega.length} hourly observations`:'Awaiting data',snapshot.smegaSource?'Buyer and seller offers from the published source table. Capture: '+utc(snapshot.smegaSource.capturedAt):'Explicit-unit NX asks only; deduplicated by sender and hour.','separate signal'],['PUBLICATION',location.hostname==='127.0.0.1'?'Local Astra preview':'Hosted Astra preview','Unadvertised preview. Domain selection is pending; the API application remains draft-only.','preview only']];
 cards.push(['AUTHENTICATED API',snapshot.publicApiStatus?.status||'requires_api_key','Free provider key required. Public-launch request is a draft and must not be submitted yet; domain and public-preview details are provisional. Provider responses will be validated before entering charts.','not connected']);
 cards.push(['ADDITIONAL SMEGA SOURCE','Free Market Classic','Published terms prohibit website automation. No unattended collector is enabled for this source.','permission needed']);
 $('sources-cards').innerHTML=cards.map(([label,value,detail,state])=>`<article class="panel"><p class="eyebrow">${esc(label)}</p><div class="source-clock">${esc(value)}<small>${esc(state)}</small></div><p>${esc(detail)}</p></article>`).join('');
}
function conversionValue(value,rate,direction){
 if(value.trim()===''||!Number.isFinite(Number(value))||Number(value)<0||Number(value)>1e12||!Number.isFinite(rate)||rate<=0)return 'Enter a valid amount';
 const amount=Number(value);return direction==='nx'?`≈ ${number(amount*rate)} mesos`:`≈ ${number(amount/rate,1)} NX`;
}
let quickDirection=null;
function renderQuickConverter(){if(!snapshot||!quickDirection)return;$('quick-result').textContent=conversionValue($('quick-amount').value,activeRate(),quickDirection);}
function renderConverter(){if(!snapshot)return;const amount=Number($('convert-amount').value);if(!Number.isFinite(amount)||amount<0||amount>1e12){$('convert-result').textContent='Enter a valid positive amount';return;}const dir=$('convert-direction').value;$('convert-result').textContent=dir==='nx'?`≈ ${number(amount*activeRate())} mesos`:`≈ ${number(amount/activeRate(),1)} NX`;}
function findItem(slug){return [...snapshot.rows,...snapshot.cash,...(snapshot.contextItems||[])].find(r=>r.slug===slug);}
function itemDetailHTML(r,full=false){
 const history=[...r.history].sort((a,b)=>a[0].localeCompare(b[0])),summary=r.sourceSummary,reference=referenceItem(r);
 const details=summary?`<section class="item-evidence"><h3>Source snapshot: sale-price distribution</h3><p class="small muted">Published ${esc(utc(summary.sourceUpdatedAt))}. The source does not specify this summary’s lookback; it can differ from the daily medians above.</p><div class="item-summary-grid"><div><small>Summary median sale</small><strong>${number(summary.medianSale)} mesos</strong></div><div><small>Middle half of sale prices</small><strong>${number(summary.p25)}–${number(summary.p75)}</strong></div><div><small>Recorded sale minimum–maximum</small><strong>${number(summary.lowSale)}–${number(summary.highSale)}</strong></div><div><small>Source-reported latest sale</small><strong class="small">${esc(utc(summary.reportedLastSaleAt))}</strong></div></div></section><section class="item-evidence"><h3>Seller asks · separate from sales</h3><div class="item-summary-grid"><div><small>Median seller asking price</small><strong>${summary.medianSellerAsk==null?'Unavailable':number(summary.medianSellerAsk)+' mesos'}</strong></div><div><small>Listings at source update</small><strong>${number(summary.listings)}</strong></div><div><small>Players listing at source update</small><strong>${number(summary.sellers)}</strong></div></div><p class="small muted">Asks are seller offers. No buyer-bid feed or item-specific smega history is connected here, so a bid–ask spread cannot be calculated. The sale-price range above is a distribution, not a trading spread.</p></section>`:'';
 return `<p class="eyebrow">${esc(r.category||'Cash Shop')} / SOURCE HISTORY</p><h2 class="item-detail-title">${sprite(r)}${nameOf(r)}</h2><div class="detail-metrics"><div><strong>${number(r.price)}</strong><small>daily median mesos · ${esc(r.priceDay)}</small></div><div><strong>${number(r.recentQuantity)}</strong><small>recorded sold volume · seven complete days</small></div><div><strong>${r.notIndexed?'Not indexed':r.weight!=null?number(r.weight*100,2)+'%':number(r.rate,2)}</strong><small>${r.notIndexed?'Context only':r.weight!=null?'CPI base weight '+weightHelp():'mesos / NX'}</small></div></div><p class="small muted">Available history: ${esc(history[0]?.[0]||'—')}–${esc(history.at(-1)?.[0]||'—')} · ${history.length} recorded daily observations. This is the available source history, not the item’s creation date.</p><div class="chart">${chartHTML([{name:r.name+' · daily median sale',color:'#87bdcf',points:history.map(p=>({at:p[0]+'T12:00:00Z',date:p[0],datePrecision:'day',value:p[1],sampleCount:p[2]}))}],{yTitle:'mesos',event:r.slug==='wolbi-throwing-stars',dateOnlyAxis:true,width:full?1120:700})}</div>${r.slug==='wolbi-throwing-stars'?`<p class="small muted">* ${esc(snapshot.wolbi.text)}</p>`:''}<p class="small muted">Daily median sale prices and recorded volumes are aggregates. Individual recent transaction records are unavailable in this feed; equipment stats and rolls can mix.</p>${!full?`<a class="item-full-link" href="#item/${encodeURIComponent(r.slug)}">Open this item’s full history page →</a>`:''}${details}${reference?`<section class="item-evidence"><h3>mesos.watch reports</h3><p>${number(reference.price)} mesos · median across its ${reference.windowDays}-day sale window · ${number(reference.salesCounted)} recorded sales. Last pulled ${esc(utc(snapshot.rollingReference.capturedAt))}; underlying scan time is unknown.</p></section>`:''}<details class="item-evidence" ${full?'open':''}><summary>All available daily prices and recorded volumes</summary><div class="table-wrap"><table><thead><tr><th>Source day</th><th>Median sale · mesos</th><th>Recorded sold volume</th></tr></thead><tbody>${history.map(p=>`<tr><td>${esc(p[0])}${p[0]===snapshot.sourceUpdatedAt.slice(0,10)?' · partial':''}</td><td>${number(p[1])}</td><td>${number(p[2])}</td></tr>`).join('')}</tbody></table></div></details>`;
}
function renderItemPage(slug){const r=findItem(slug);$('item-page-title').textContent=r?r.name+(r.slug==='wolbi-throwing-stars'?'*':''):'Item unavailable';$('item-page-detail').innerHTML=r?itemDetailHTML(r,true):'<p>No matching tracked item in this snapshot.</p>';}
function showItem(slug){const r=findItem(slug);if(!r)return;$('item-detail').innerHTML=itemDetailHTML(r);$('item-dialog').showModal();}
function csvDownload(filename,headers,rows){const cell=v=>'"'+String(v??'').replace(/"/g,'""')+'"';const blob=new Blob(['\ufeff'+[headers,...rows].map(r=>r.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8;'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

async function checkSnapshot(manual=false){
 if(document.hidden&&!manual)return;
 if(manual)$('refresh').disabled=true;
 try{
  const res=await fetch('version.json',{cache:'no-cache',signal:AbortSignal.timeout(12000)});if(!res.ok)throw new Error(`Version HTTP ${res.status}`);const next=await res.json();
  if(next.version!==version){if(!/^data-[a-f0-9]{16}\.json$/.test(next.data))throw new Error('Invalid snapshot pointer');const data=await fetch(next.data,{cache:'force-cache',signal:AbortSignal.timeout(12000)});if(!data.ok)throw new Error('Snapshot unavailable');const value=await data.json();if(value.schemaVersion!==1||!Array.isArray(value.rows)||value.rows.length!==50)throw new Error('Invalid snapshot');snapshot=value;version=next.version;render();navigator.serviceWorker?.controller?.postMessage({type:'refresh-fallback'});}
  else renderFreshness();if(snapshot&&next.sourceStatus){snapshot.sourceStatus=next.sourceStatus;renderFreshness();renderSources();}retry=60000;
 }catch(error){console.warn('Snapshot check failed:',error.message);retry=Math.min(retry*2,600000);if(!snapshot){$('notice').className='notice error';$('notice').innerHTML='The snapshot could not be loaded. <a href="fallback.html">Open the lightweight last-known page →</a>';}else{$('notice').className='notice error';$('notice').textContent=`Connection interrupted. Showing retained data from ${utc(snapshot.sourceUpdatedAt)}; retrying with backoff.`;}}
 finally{if(manual)$('refresh').disabled=false;clearTimeout(timer);timer=setTimeout(checkSnapshot,retry+Math.random()*10000);}
}

let volumeResizeTimer;window.addEventListener('resize',()=>{clearTimeout(volumeResizeTimer);volumeResizeTimer=setTimeout(()=>{if(snapshot&&!$('view-index').hidden){renderVolume();renderCpiDetail();renderSmega();renderReportedHistory();}},150);});
window.addEventListener('hashchange',()=>{route();if(['#method-weights','#smega-section'].includes(location.hash)){const target=$(location.hash.slice(1));target.scrollIntoView({block:'start',behavior:'instant'});target.focus({preventScroll:true});}else window.scrollTo({top:0,behavior:'instant'});});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkSnapshot();});
$('display-timezone').addEventListener('change',e=>{displayTimeZone=e.target.value;try{localStorage.setItem('astra-display-timezone',displayTimeZone);}catch{}if(snapshot){render();}});
$('quick-amount').addEventListener('input',renderQuickConverter);
document.querySelectorAll('[data-quick-direction]').forEach(button=>button.addEventListener('click',()=>{const next=button.dataset.quickDirection;if(next!==quickDirection){quickDirection=next;$('quick-amount').value=next==='nx'?'1000':'1000000';$('quick-amount').step=next==='nx'?'100':'1000';}$('quick-label').textContent=next==='nx'?'NX to sell':'Mesos to spend';$('quick-calculation').hidden=false;document.querySelectorAll('[data-quick-direction]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));renderQuickConverter();$('quick-amount').focus();}));
$('refresh').addEventListener('click',()=>checkSnapshot(true));
$('basket-search').addEventListener('input',()=>snapshot&&renderBasket());$('category-filter').addEventListener('change',()=>snapshot&&renderBasket());
$('smega-spread-unit').addEventListener('change',()=>snapshot&&renderSmega());
$('export-smega').addEventListener('click',()=>snapshot&&csvDownload('inflation-watch-smega-spreads.csv',['source_hour','source','seller_median','buyer_median','gap_mesos_per_nx','gap_percent_midpoint','seller_sample','buyer_sample','partial_when_pulled'],deriveSmegaSpreads(smegaInputs()).map(p=>[p.at,p.sourceUrl,p.ask,p.bid,p.spread,p.spreadPercent,p.askCount,p.bidCount,p.partial])));
$('volume-period').addEventListener('change',()=>snapshot&&renderVolume());
$('volume-metric').addEventListener('change',()=>snapshot&&renderVolume());
$('export-volume').addEventListener('click',()=>snapshot&&csvDownload('inflation-watch-volume.csv',['day','full_feed_estimated_mesos','basket_estimated_mesos','full_feed_recorded_sold_volume','basket_recorded_sold_volume','full_feed_items_observed','basket_items_observed','partial_day','source'],selectedVolumeRows().map(p=>[p.day,p.allMesos,p.basketMesos,p.allSoldVolume,p.basketSoldVolume,p.allItemsObserved,p.basketItemsObserved,p.partial,snapshot.feedUrl])));
$('chart-metric').addEventListener('change',e=>{metric=e.target.value;if(snapshot)renderMainChart();});
document.addEventListener('click',e=>{
 const fullItemLink=e.target.closest('.item-full-link');if(fullItemLink)$('item-dialog').close();
 const weightLink=e.target.closest('.weight-help a');if(weightLink&&$('item-dialog').open)$('item-dialog').close();
 const item=e.target.closest('[data-item]');if(item&&snapshot)showItem(item.dataset.item);
 const category=e.target.closest('[data-category]');if(category){$('category-filter').value=category.dataset.category;location.hash='basket';renderBasket();}
 const sort=e.target.closest('[data-sort]');if(sort){sortAsc=sortKey===sort.dataset.sort?!sortAsc:sort.dataset.sort==='name';sortKey=sort.dataset.sort;renderBasket();}
 const smegaRange=e.target.closest('[data-smega-range]');if(smegaRange){selectedSmegaRange=smegaRange.dataset.smegaRange;document.querySelectorAll('[data-smega-range]').forEach(b=>b.classList.toggle('selected',b===smegaRange));renderSmega();}
 const cpiRange=e.target.closest('[data-cpi-range]');if(cpiRange){selectedCpiRange=cpiRange.dataset.cpiRange;document.querySelectorAll('[data-cpi-range]').forEach(b=>b.classList.toggle('selected',b===cpiRange));renderCpiDetail();}
 const range=e.target.closest('[data-range]');if(range){selectedRange=range.dataset.range;document.querySelectorAll('[data-range]').forEach(b=>b.classList.toggle('selected',b===range));renderMainChart();}
 const view=e.target.closest('[data-layout]');if(view){layout=view.dataset.layout;document.querySelectorAll('[data-layout]').forEach(b=>b.classList.toggle('selected',b===view));renderBasket();}
});
$('convert-amount').addEventListener('input',renderConverter);$('convert-direction').addEventListener('change',renderConverter);
$('close-dialog').addEventListener('click',()=>$('item-dialog').close());
$('export-basket').addEventListener('click',()=>snapshot&&csvDownload('inflation-watch-basket.csv',['item','category','price_day','mesos','unit','sold_volume_7d','estimated_turnover_7d','base_price','base_sold_volume','weight','change_base_percent'],snapshot.rows.map(r=>[r.name,r.category,r.priceDay,r.price,r.unit,r.recentQuantity,r.recentTurnoverProxy,r.basePrice,r.baseQuantity,r.weight,r.changeBase])));
$('export-history').addEventListener('click',()=>snapshot&&csvDownload('inflation-watch-history.csv',['observed_at','kind','nx_rate_mesos_per_nx','cpi','partial_day','source'],[...snapshot.history.map(p=>[p.at,'daily_sale_medians',p.nxRate,p.cpi,p.partial,snapshot.feedUrl]),...snapshot.intraday.map(p=>[p.observedAt,'intraday_scanner',p.nxRate,p.cpi,false,p.sourceUrl]),...(snapshot.rollingReferenceHistory||[]).map(p=>[p.at,'rolling_scanner_capture_not_trade_time',p.nxRate,p.cpi,false,p.sourceUrl])]));
route();checkSnapshot();setInterval(()=>{if(snapshot){if(!freshLive()&&$('rate-kind').textContent==='INTRADAY ESTIMATE')render();else{renderFreshness();renderSources();}}},30000);
if('serviceWorker'in navigator&&location.protocol!=='file:')navigator.serviceWorker.register('sw.js').catch(()=>{});
