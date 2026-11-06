(()=>{'use strict';if(window.AstraApiCashUi)return;
const api=window.AstraApiCash;if(!api)return;const host=document.getElementById('view-nx');if(!host)return;
const make=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
const number=(v,d=1)=>Number.isFinite(v)?v.toLocaleString('en-US',{maximumFractionDigits:d}):'Unavailable';
const clock=value=>{if(!value||!Number.isFinite(Date.parse(value)))return'Unknown';let zone=document.getElementById('display-timezone')?.value||'UTC';
 try{new Intl.DateTimeFormat('en-US',{timeZone:zone});}catch{zone='UTC';}
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',timeZoneName:'short'}).formatToParts(new Date(value)).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
 return`(${p.month}-${p.day}-${p.year} ${p.hour}:${p.minute}:${p.second} ${p.timeZoneName}${p.timeZoneName===zone?'':' · '+zone})`;};
const safeSprite=path=>typeof path==='string'&&/^assets\/[A-Za-z0-9._-]+\.(png|webp|gif|svg)$/.test(path)?path:null;
let report=null,side='sell',query='',sortKey='value',sortAsc=false;
const section=make('section','panel api-cash-section');section.id='api-cash-section';section.setAttribute('aria-labelledby','api-cash-title');
section.innerHTML='<div class="section-heading"><div><p class="eyebrow">MAPLESTORY MARKET / SEPARATE ITEM EVIDENCE</p><h2 id="api-cash-title" tabindex="-1">Cash-item API reference</h2></div></div><p class="api-cash-status" role="status" aria-live="polite" data-raw-date></p><p class="api-cash-window">Reported 3-day sale-median lookback · exact start/end and individual sale times are unknown. Quality can mix. This changes no headline, MPI or Cash Basket.</p><div class="api-cash-source-controls"></div><div class="api-cash-controls"><div class="api-cash-sides" role="group" aria-label="API cash comparison side"><button type="button" data-api-cash-side="sell">Sell NX · higher is better</button><button type="button" data-api-cash-side="buy">Buy NX items · lower is better</button></div><div class="api-cash-fee-modes" role="group" aria-label="Shared cash fee view"><button type="button" data-api-fee-mode="gross">Gross · simplified</button><button type="button" data-api-fee-mode="player_trade">Player trade</button><button type="button" data-api-fee-mode="shop">FM player shop</button></div><label>Search these 29 fixed-cost items<input id="api-cash-search" type="search" autocomplete="off" maxlength="200"></label><button type="button" data-api-best>Best value first</button><button type="button" data-api-refresh>Check cached API reference</button></div><p class="api-cash-ranking" role="status"></p><div class="table-wrap api-cash-table"></div><p class="api-cash-source-credit"><a href="https://maplestory.market/?ref=v6kkdvp6" target="_blank" rel="noopener noreferrer">Prices from maplestory.market ↗</a> · <a href="/api-cash-items.json" download>Download the dated 29-item subset ↓</a></p><details class="api-cash-method"><summary>What these prices and comparisons mean</summary><p>Each ratio is the source-reported item sale median divided by its verified fixed NX purchase cost. The count is reported sales, not physical units, unique players or executable quotes. At least five reported sales are required. Missing evidence stays unknown and is never filled from the daily source.</p><p>When all 29 are eligible, the dial reference is the reported-sale-count weighted mean of those item ratios. Partial API coverage does not create a renormalized reference. The API lookback cannot be resliced with the separate daily/rolling controls. Fee estimates use the same shared user-reported/manual assumptions as the existing table; gross prices remain visible. No official fee rule, matched equipment quality, live listing availability or individual sale time is established.</p><p>Status colors describe the age of API retrieval only (a 10-minute display band), never verified fresh trades. Your tab automatically reads this site’s cache about once a minute while visible; manual checks are throttled to at least 30 seconds apart. It never contacts a market provider. The original source capture clock survives cache checks and failures.</p></details>';
const heading=host.querySelector('.page-heading');if(heading)heading.after(section);else host.prepend(section);
// Keep original source DOM/handlers as a separate option, not a rewritten series.
const legacy=make('details','panel api-cash-legacy');legacy.id='api-cash-other-sources';const summary=make('summary','','Other dated cash sources · daily / rolling references');legacy.append(summary);
for(const child of [...host.children])if(child!==section&&child!==heading&&child.id!=='nx-calculator'&&child!==legacy)legacy.append(child);
host.append(legacy);const converter=document.getElementById('nx-calculator');if(converter){const note=make('p','api-cash-converter-note','This converter keeps the separate dated daily / rolling cash reference and its original source clock. It does not use the API29 table above.');converter.append(note);}const table=section.querySelector('.api-cash-table');let legacyTouched=false;window.AstraCashActivity?.mount(section.querySelector('.api-cash-controls'));
summary.addEventListener('click',()=>{legacyTouched=true;});
function sourceControls(where){
 if(where.querySelector('.api-cash-source-choice'))return;
 const group=make('div','api-cash-source-choice');group.setAttribute('role','group');group.setAttribute('aria-label','Best-card evidence source');
 group.append(make('span','','Best-card evidence'));
 for(const [value,label]of[['auto','Auto · API when available'],['api','API only'],['legacy','Other dated source']]){const b=make('button','',label);b.type='button';b.dataset.apiCashChoice=value;b.addEventListener('click',()=>{api.setChoice(value);if(value==='legacy')legacy.open=true;});group.append(b);}where.append(group);
}
sourceControls(section.querySelector('.api-cash-source-controls'));
const highlights=document.querySelector('#cash-item-highlights .cash-highlights-status');if(highlights){const source=make('div','api-cash-best-source');highlights.before(source);sourceControls(source);}
function image(row){const img=make('img','api-cash-sprite');const path=safeSprite(report?.spriteMap?.[row.slug]||report?.spriteMap?.[String(row.id)]);
 img.src=path||'assets/leaf.png';img.alt='';img.width=36;img.height=36;img.loading='lazy';img.dataset.spriteKind=path?'cached_original':'generic';img.title=path?'Locally cached original game icon © Nexon':'Generic fallback; reviewed item art unavailable';
 img.addEventListener('error',()=>{img.hidden=true;},{once:true});return img;}
function feesModel(model){const fees=window.AstraTradeFees,state=fees?.getState(),active=!!fees&&state.mode!=='gross',unset=active&&state.rules?.[state.mode]?.enabled!==true;
 const rows=fees?fees.decorate(model.rows,side):model.rows;return{rows,fees,state,active,unset,net:active&&!unset};}
// Public status uses only the already-validated own-site client, never private collector health.
function sourceDescriptor(state=api.getState(),now=Date.now()){
 const data=state?.data,stamp=typeof data?.capturedAt==='string'?Date.parse(data.capturedAt):NaN;
 const valid=Number.isFinite(stamp)&&data.schemaVersion===1&&data.kind==='fixed_nx_item_api_display_subset'&&data.sourceObservedAt===null&&
  data.window?.reportedLookbackDays===3&&data.window.start===null&&data.window.end===null&&data.window.boundsKnown===false&&
  data.coverage?.expected===29&&Number.isSafeInteger(data.coverage.available)&&data.coverage.available>=0&&data.coverage.available<=29;
 const label='APPROVED API / CASH-ITEM CACHE';
 if(valid){
  const age=now-stamp,retained=['retained','loading'].includes(state.status)||state.serverMode==='retained_last_good'||!!state.error;
  const phase=retained?'retained':age<0?'clock_uncertain':age<=600000?'recent':'aged';
  const tone=phase==='recent'?'green':'amber';
  const message={recent:'Recent API retrieval · not verified fresh trades',aged:'Older API retrieval · original clock retained',retained:'Retained API reference · original clock retained',clock_uncertain:'API capture clock ahead · age uncertain'}[phase];
  return{label,value:`${data.coverage.available} / 29 eligible item medians`,phase,capturedAt:data.capturedAt,state:{tone,state:message},
   detail:`API retrieved ${clock(data.capturedAt)}. Reported 3-day sale-median lookback; exact bounds and individual sale/scan times are unknown. Counts are reported sales, not physical units or unique players; qualities can mix. This separately cached subset changes no daily-source clock, headline, MPI or Cash Basket.`};
 }
 const status=state?.status||'idle',absent=status==='not_published',access=status==='site_access';
 const failed=!absent&&(['unavailable','site_access'].includes(status)||!!state?.error);
 return{label,value:absent?'Subset not published here':access?'Site access required':failed?'API cache unavailable':'Publication not yet verified',
  phase:absent?'not_published':access?'site_access':failed?'unavailable':'unverified',capturedAt:null,
  state:{tone:failed?'red':'amber',state:absent?'API approved · own-site subset absent':access?'Own-site access check failed':failed?'No verified API reference available':'Awaiting this tab’s own-site cache check'},
  detail:'API access was approved; approval and this site’s published-data availability are separate. '+(absent?'The own-site subset returned not published. ':access?'This tab cannot read the own-site subset. ':'No validated API subset is currently available in this tab. ')+'The daily feed and dated captures keep their original clocks. No fresh trade, zero price or API-key failure is inferred.'};
}
const statusLegendHost=document.getElementById('source-status-legend');
if(statusLegendHost&&!document.getElementById('api-cash-source-legend')){
 const legend=make('span','api-source-legend');legend.id='api-cash-source-legend';legend.setAttribute('role','note');
 legend.innerHTML='<strong>API cache retrieval</strong><span><i class="source-status-dot status-green" aria-hidden="true"></i>Green: retrieved within 10 minutes.</span><span><i class="source-status-dot status-amber" aria-hidden="true"></i>Amber: older, retained or not yet verified.</span><span><i class="source-status-dot status-red" aria-hidden="true"></i>Red: this tab cannot verify an available cache.</span><small>These are display bands, not provider guarantees. The clock is the original API retrieval; individual sale/scan times remain unknown. A newer API retrieval does not refresh the older daily source or establish qualified intraday trades.</small>';
 statusLegendHost.append(legend);
}
function statusText(){const s=api.getState(),m=api.model();if(!s.data)return s.status==='not_published'?'The API subset is not published here. Other dated source views remain separate.':s.status==='site_access'?'Site access is required to read this cached API reference.':'API reference unavailable or loading. Missing values are not zero; no provider request is made by this page.';
 return`${m.retained?'Retained API reference':'API reference'} · ${m.eligibleCount} / 29 items with eligible sale medians. API retrieved ${clock(m.capturedAt)}. Underlying sale/scan times unknown. ${api.client.freshness()==='recent_retrieval'?'Recent retrieval only; not verified fresh trades.':api.client.freshness()==='clock_uncertain'?'Clock age uncertain; no freshness claim.':'This is an older retrieval; original clocks are retained.'}`;}
function draw(){
 const model=api.model(),fm=feesModel(model),s=api.getState();window.AstraCashActivity?.configure(section.querySelector('.api-cash-controls'),model);section.dataset.apiStatus=s.status;section.dataset.retrievalAge=api.client.freshness();
 section.querySelector('.api-cash-status').textContent=statusText();
 for(const b of document.querySelectorAll('[data-api-cash-choice]'))b.setAttribute('aria-pressed',String(api.getChoice()===b.dataset.apiCashChoice));
 for(const b of section.querySelectorAll('[data-api-cash-side]'))b.setAttribute('aria-pressed',String(side===b.dataset.apiCashSide));
 for(const b of section.querySelectorAll('[data-api-fee-mode]')){b.setAttribute('aria-pressed',String((fm.state?.mode||'gross')===b.dataset.apiFeeMode));b.disabled=!fm.fees;}
 const effectiveKey=sortKey==='value'?(fm.net?'netRate':'rate'):sortKey,asc=sortKey==='value'?side==='buy':sortAsc;
 const activity=window.AstraCashActivity?.rank(fm.rows,{side,rateKey:fm.net?'netRate':'rate',model})||{rows:fm.rows,active:false,note:''};
 const rows=activity.rows.filter(r=>r.name.toLowerCase().includes(query.trim().toLowerCase())).map((r,index)=>({...r,index}));
 if(!(activity.orderingApplied&&sortKey==='value'))rows.sort((a,b)=>{const av=a[effectiveKey],bv=b[effectiveKey];if(effectiveKey==='name')return(asc?1:-1)*av.localeCompare(bv)||a.id-b.id;
  const aValid=Number.isFinite(av),bValid=Number.isFinite(bv);if(!aValid||!bValid)return aValid?-1:bValid?1:a.id-b.id;return(asc?1:-1)*(av-bv)||a.id-b.id;});
 const activityBest=activity.active&&sortKey==='value',displaySortKey=activityBest?'activityScore':effectiveKey,displaySortAsc=activityBest?false:asc;
 const ranking=activityBest?'Activity-adjusted value first by descending heuristic score; actual rates remain visible.':sortKey==='value'?fm.net?(rows.some(r=>Number.isFinite(r.netRate))?'Best value first under the selected fee assumptions.':'Net ranking unavailable; gross source prices stay visible.'):'Best value first by gross mesos / NX.':`Sorted by ${effectiveKey} (${asc?'ascending':'descending'}).`;
 section.querySelector('.api-cash-ranking').textContent=`${rows.length} / 29 shown · ${side==='sell'?'Higher proceeds per NX favors selling':'Lower cost per NX favors buying'}. ${ranking} ${activity.active&&sortKey!=='value'?'Column sort overrides the optional activity ordering.':activity.note} ${activity.active?'Scores use this complete source cohort before search; minimum count filter is shared with the cards. ':''}${fm.unset?'Gross order shown; net unavailable until fee rules are set.':fm.net?'Fee assumptions: '+fm.fees.label()+'. These are estimates, not official verified fees.':'Gross prices before fees.'}`;
 section.querySelector('[data-api-best]').textContent=activity.active?'Best activity-adjusted first':'Best value first';
 section.querySelector('[data-api-best]').setAttribute('aria-pressed',String(sortKey==='value'));
 const headers=[['name','Item'],['nx','Fixed NX cost'],['price','API sale median · mesos'],['rate','Gross mesos / NX'],['quantity','Reported sale count']];
 if(fm.active)headers.push(['effectiveMeso',side==='buy'?'Estimated transaction cost':'Estimated transaction proceeds'],['netRate',side==='buy'?'Estimated cost / NX':'Estimated proceeds / NX']);
 if(activity.active)headers.push(['activityScore','Activity score · heuristic']);headers.push(['source','Source']);const tbl=make('table'),caption=make('caption','sr-only','Separate API item-sale medians. Reported 3-day lookback; actual bounds and sale times unknown.');tbl.append(caption);
 const thead=make('thead'),tr=make('tr');for(const [key,label]of headers){const th=make('th');th.setAttribute('aria-sort',key===displaySortKey?(displaySortAsc?'ascending':'descending'):'none');
  if(key==='source')th.textContent=label;else{const b=make('button','',label+(key===displaySortKey?(displaySortAsc?' ↑':' ↓'):''));b.type='button';b.dataset.apiCashSort=key;th.append(b);}tr.append(th);}thead.append(tr);tbl.append(thead);
 const tbody=make('tbody');for(const row of rows){const line=make('tr');line.dataset.apiCashItem=row.slug;line.dataset.apiItemId=String(row.id);
  const name=make('td'),link=make('a','item-link');link.href='#item/'+encodeURIComponent(row.slug);link.append(image(row),make('span','',row.name));name.append(link);line.append(name);
  for(const field of ['nx','price','rate','quantity']){const cell=make('td','',number(row[field],field==='rate'?2:field==='quantity'||field==='nx'?0:1));cell.dataset.sortValue=Number.isFinite(row[field])?String(row[field]):'';if(row.missing&&field==='price')cell.append(make('small','','API median/count unavailable'));line.append(cell);}
  if(fm.active)for(const field of ['effectiveMeso','netRate']){const cell=make('td','',number(row[field],field==='netRate'?2:1));if(!Number.isFinite(row[field]))cell.append(make('small','',row.feePreview?.reason||'Fee estimate unavailable'));line.append(cell);}
  if(activity.active)line.append(make('td','',number(row.activityScore,1)));
  const source=make('td'),credit=make('a','','Source ↗');credit.href=row.sourceCreditUrl;credit.target='_blank';credit.rel='noopener noreferrer';source.append(credit);line.append(source);tbody.append(line);
 }tbl.append(tbody);const focusedSort=document.activeElement?.dataset.apiCashSort;table.replaceChildren(tbl);
 if(focusedSort)table.querySelector(`[data-api-cash-sort="${focusedSort}"]`)?.focus();
 if(!legacyTouched)legacy.open=!s.data||api.getChoice()==='legacy';
 for(const [container,item]of detailBindings)if(container.isConnected)appendItemEvidence(container,item);
 if(location.hash.startsWith('#item/')&&typeof window.findItem==='function'){
  try{const item=window.findItem(decodeURIComponent(location.hash.slice(6))),container=document.getElementById('item-page-detail');if(item&&container?.children.length)appendItemEvidence(container,item);}catch{}
 }
}
section.addEventListener('input',e=>{if(e.target.id==='api-cash-search'){query=e.target.value;draw();}});
section.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
 if(b.dataset.apiCashSide){side=b.dataset.apiCashSide;draw();return;}
 if(b.dataset.apiFeeMode){const fees=window.AstraTradeFees;if(fees)fees.setState({...fees.getState(),mode:b.dataset.apiFeeMode});return;}
 if(b.dataset.apiCashSort){const key=b.dataset.apiCashSort;if(sortKey===key)sortAsc=!sortAsc;else{sortKey=key;sortAsc=key==='name';}draw();return;}
 if(b.hasAttribute('data-api-best')){sortKey='value';draw();return;}
 if(b.hasAttribute('data-api-refresh'))void api.refresh();
});
const detailBindings=new Map();
function appendItemEvidence(container,item){
 detailBindings.set(container,item);container.querySelector('.api-cash-item-evidence')?.remove();const row=api.rowFor(item);if(!row)return;
 const box=make('section','item-evidence api-cash-item-evidence');box.dataset.apiItemId=String(row.itemId);box.append(make('h3','','Separate API sale-median reference'));
 const text=row.available?`${number(row.saleMedianMesos,1)} mesos · ${number(row.mesosPerNx,2)} mesos / fixed NX · ${number(row.recordedSalesCount,0)} reported sales.`:'No qualifying API median/count is available; missing evidence is not zero.';
 box.append(make('p','',text));const date=make('p','api-cash-clock',`API retrieved ${clock(api.getState().data.capturedAt)} · reported 3-day lookback; actual bounds and individual sale times unknown.`);date.dataset.rawDate='true';box.append(date);
 box.append(make('small','','Item-level qualities can mix. This is separate from every daily history/rolling capture below and changes no index or quote.'));
 const a=make('a','','Prices from maplestory.market ↗');a.href=row.sourceCreditUrl;a.target='_blank';a.rel='noopener noreferrer';box.append(a);container.append(box);
}
function focusList(value='sell'){sortKey='value';if(['buy','sell'].includes(value))side=value;location.hash='#nx';draw();document.getElementById('api-cash-title').focus();section.scrollIntoView?.({block:'start'});}
window.AstraApiCashUi=Object.freeze({clock,sourceDescriptor,appendItemEvidence,focusList});
document.addEventListener('astramarketsnapshot',e=>{report=e.detail;draw();});
for(const event of ['astraapicashchange','astraapicashchoice','astrafeeschange'])document.addEventListener(event,draw);
document.addEventListener('astracashactivitychange',()=>{sortKey='value';draw();});
document.getElementById('display-timezone')?.addEventListener('change',draw);draw();document.dispatchEvent(new Event('astraapicashstatusready'));document.dispatchEvent(new Event('astramarkethighlightsready'));
})();
