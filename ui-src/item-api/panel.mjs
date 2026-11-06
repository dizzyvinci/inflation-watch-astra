// WORK-only explicit renderer: no fetch, route, authentication or automatic mount.
import {assertSafeItemDto,filterOptions,filterEvidenceGroups} from '../../ops/api-price-item-dto.mjs';
let instance=0;
const pools={reported_stats:'Reported stats',scroll_state:'Scroll state',attack_pool:'ATT pools'};
const labels={'0':'STR','1':'DEX','2':'INT','3':'LUK','4':'Max HP','5':'Max MP','6':'Speed','7':'Jump','9':'Magic ATT','10':'Weapon DEF','11':'Magic DEF','12':'Accuracy','13':'Avoidability','14':'Crit rate','15':'Crit damage','16':'Weapon ATT'};
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
// Group only the integer part; decimal lexemes must never be rounded for display.
export function exactMoney(value){if(value===null)return 'Unknown';const [whole,decimal]=value.split('.');return whole.replace(/\B(?=(\d{3})+(?!\d))/g,',')+(decimal===undefined?'':'.'+decimal);}
export function retrievalClock(iso,zone='UTC'){
  if(!Number.isFinite(Date.parse(iso)))return 'Unknown';
  try{const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(iso)).map(p=>[p.type,p.value]));return `${parts.month}-${parts.day}-${parts.year} ${parts.hour}:${parts.minute}:${parts.second} ${zone}`;}catch{return retrievalClock(iso,'UTC');}
}
const spritePath=value=>typeof value==='string'&&/^\/?assets\/[A-Za-z0-9._/-]+\.png$/.test(value)&&!value.split('/').includes('..')?value:null;
const signature=row=>Object.entries(labels).filter(([code])=>own(row.reportedStats,code)).map(([code,label])=>`${label} ${row.reportedStats[code]}`).join(' · ')||'No stats reported';
export function itemPanelModel(dto,query={kind:'reported_stats'},search=''){
  assertSafeItemDto(dto);const result=filterEvidenceGroups(dto,query),needle=String(search).trim().toLowerCase();
  const rows=result.rows.filter(row=>!needle||[query.kind==='reported_stats'?signature(row):query.kind==='attack_pool'?`Weapon ATT ${row.reportedAttack}`:`${row.successfulUpgrades} successful upgrades ${row.slotsLeft} slots`,row.reference?.basis??'unknown',row.reference?.unitPrice??''].join(' ').toLowerCase().includes(needle));
  return {result,rows,options:filterOptions(dto)};
}
export function mountItemPricingPanel(container,input,{timezone='UTC',spriteMap={}}={}){
  if(!container?.ownerDocument)throw new TypeError('A DOM container is required');
  assertSafeItemDto(input);let dto=structuredClone(input),zone=timezone,destroyed=false,page=0;
  const doc=container.ownerDocument,id=`item-api-panel-${++instance}`,el=(tag,text,cls)=>{const n=doc.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  const section=el('section',undefined,'api-item-panel');section.setAttribute('aria-labelledby',id+'-title');
  const title=el('h2','Item prices & reported rolls');title.id=id+'-title';section.append(title);
  const identity=el('div',undefined,'api-item-identity'),name=el('h3'),image=el('img');image.width=48;image.height=48;identity.append(name);section.append(identity);
  const clock=el('p',undefined,'api-item-clock');clock.dataset.rawDate='true';section.append(clock);
  section.append(el('p','Reported 3-day lookback; exact start/end and individual sale times are unknown. Retrieval time does not establish when a trade occurred. Asking prices are separate evidence, not verified available offers.','api-item-context'));
  const summary=el('div',undefined,'api-item-summary');section.append(summary);
  const credit=el('a','Item prices from MapleStory Market ↗');credit.target='_blank';credit.rel='noopener noreferrer';section.append(credit);
  const heading=el('h3','Explore the reported price groups');section.append(heading);
  const tabs=el('div',undefined,'api-item-pools');tabs.setAttribute('role','group');tabs.setAttribute('aria-label','Price group');let pool='reported_stats';
  for(const [key,label]of Object.entries(pools)){const b=el('button',label);b.type='button';b.dataset.pool=key;b.addEventListener('click',()=>{pool=key;page=0;sortColumn='reference';sort='ascending';renderRows();});tabs.append(b);}section.append(tabs);
  const explanation=el('p',undefined,'api-item-context');section.append(explanation);
  const controls=el('form',undefined,'api-item-filters');controls.addEventListener('submit',event=>event.preventDefault());section.append(controls);
  const select=(key,label,choices)=>{const wrapper=el('label',label),n=el('select');n.dataset.filter=key;for(const [value,text]of choices){const option=el('option',text);option.value=value;n.append(option);}wrapper.append(n);controls.append(wrapper);return n;};
  const searchLabel=el('label','Search these groups'),search=el('input');search.type='search';search.maxLength=200;search.dataset.filter='search';searchLabel.append(search);controls.append(searchLabel);
  const slots=select('slots','Slots remaining',[['','Any']]),upgrades=select('upgrades','Successful upgrades',[['','Any']]),basis=select('basis','Reference basis',[['','Any'],['sold','Source sold'],['listed','Asking']]);
  const samplesLabel=el('label','Minimum reference samples'),samples=el('input');samples.type='number';samples.min='0';samples.step='1';samples.value='0';samples.dataset.filter='samples';samplesLabel.append(samples);controls.append(samplesLabel);
  const attackBox=el('div',undefined,'api-item-stat-pair'),attackInputs={};
  for(const [key,label]of [['minimumAttack','ATT at least'],['maximumAttack','ATT at most']]){const l=el('label',label),n=el('input');n.type='number';n.step='1';n.min='0';n.dataset.filter=key;attackInputs[key]=n;l.append(n);attackBox.append(l);}controls.append(attackBox);
  const statBox=el('fieldset'),legend=el('legend','Reported stats — all entered limits must match');statBox.append(legend);controls.append(statBox);let statInputs=[];
  const nearLabel=el('label',undefined,'api-item-near'),near=el('input');near.type='checkbox';near.dataset.filter='near';nearLabel.append(near,doc.createTextNode(' Include nearby fallback references (other qualities may differ)'));controls.append(nearLabel);
  const reset=el('button','Reset filters');reset.type='button';reset.dataset.reset='true';reset.addEventListener('click',()=>{controls.reset();samples.value='0';page=0;sort='ascending';sortColumn='reference';renderRows();});controls.append(reset);
  const feedback=el('p',undefined,'api-item-feedback');feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');section.append(feedback);
  const tableWrap=el('div',undefined,'api-item-table-wrap');tableWrap.tabIndex=0;tableWrap.setAttribute('role','region');tableWrap.setAttribute('aria-label','Reported price groups, horizontally scrollable');section.append(tableWrap);
  const pager=el('div',undefined,'api-item-pager'),previous=el('button','Previous 25'),next=el('button','Next 25'),pageText=el('span');for(const b of [previous,next])b.type='button';previous.addEventListener('click',()=>{page--;renderRows();});next.addEventListener('click',()=>{page++;renderRows();});pager.append(previous,pageText,next);section.append(pager);
  section.append(el('p','Unknown stats are not zero or proof of a clean item. Reported signatures may omit stats; DEF can be ignored by the source comparison. Scroll-state and ATT pools can mix other rolls. Group reference aggregation is unspecified. No per-roll price history, individual transactions, verified availability or fee adjustment is inferred.','api-item-context'));
  let sort='ascending',sortColumn='reference';
  const fieldInt=(n,min=0,max=Number.MAX_SAFE_INTEGER)=>{if(n.value.trim()==='')return null;const value=Number(n.value);if(!Number.isSafeInteger(value)||value<min||value>max)throw Error('Use whole numbers within the stated limits.');return value;};
  function query(){const q={kind:pool,sortReference:sort,includeNearFallback:pool!=='reported_stats'&&near.checked},minimumSamples=fieldInt(samples);if(minimumSamples!==null&&minimumSamples>0)q.minimumReferenceSamples=minimumSamples;if(basis.value)q.basis=basis.value;
    if(pool==='attack_pool'){for(const [key,n]of Object.entries(attackInputs)){const v=fieldInt(n);if(v!==null)q[key]=v;}}
    else{const s=fieldInt(slots,0,100),u=fieldInt(upgrades,0,100);if(s!==null)q.slotsLeft=s;if(u!==null)q.successfulUpgrades=u;if(pool==='reported_stats')q.stats=statInputs.flatMap(({code,min,max})=>{const a=fieldInt(min,-1000000,1000000),b=fieldInt(max,-1000000,1000000);return a===null&&b===null?[]:[{code,...(a===null?{}:{minimum:a}),...(b===null?{}:{maximum:b})}];});}return q;
  }
  function fillSummary(){name.textContent=dto.identity.name??`Item ${dto.itemId} — name unverified`;const path=spritePath(spriteMap[String(dto.itemId)]);image.remove();if(path&&dto.identity.status==='unique_client_id'){image.src=path;image.alt=dto.identity.name+' game icon';identity.prepend(image);}clock.textContent='Retrieved: '+retrievalClock(dto.source.retrievedAt,zone)+' · underlying observation time unknown';credit.href=`https://maplestory.market/items/${dto.itemId}?ref=v6kkdvp6`;
    summary.replaceChildren();const card=(heading,lines)=>{const box=el('div',undefined,'api-item-summary-card');box.append(el('h3',heading));for(const line of lines)box.append(el('p',line));summary.append(box);};const s=dto.aggregate.sold,a=dto.aggregate.asking,r=dto.aggregate.reference;
    card('Source-labelled sales',[`Median: ${exactMoney(s?.medianUnitPrice??null)} mesos`, `Average (AVG): ${exactMoney(s?.averageUnitPrice??null)} mesos`,s?`${s.reportedSalesCount} reported sales · ${s.reportedUnitCount} reported units`:'Sales counts unknown',s?`Source day counters: ${s.reportedDaySalesCount} sales · ${s.reportedDayUnitCount} units (bounds unknown)`:'']);
    card('Asking prices',[`Median ask: ${exactMoney(a?.medianUnitPrice??null)} mesos`,`P25: ${exactMoney(a?.p25UnitPrice??null)} · P75: ${exactMoney(a?.p75UnitPrice??null)} mesos`,a?`${a.reportedListingCount} reported listings · ${a.reportedSellerCount} reported sellers`:'Listing and seller counts unknown']);
    card('Publisher reference',[r?`${r.aggregation==='average'?'Average of source-labelled sales':'Median asking price'}: ${exactMoney(r.unitPrice)} mesos`:'Reference unavailable',r?`${r.reportedSamples} reported reference samples`:'','The reference is kept separate from the sale median.']);
  }
  let selectedPool='';
  function fillPoolOptions(){const rows=pool==='scroll_state'?dto.variants.successfulScrolls:dto.variants.reportedStats;for(const [select,key]of [[slots,'slotsLeft'],[upgrades,'successfulUpgrades']]){select.replaceChildren();for(const value of ['',...[...new Set(rows.map(row=>row[key]))].sort((a,b)=>a-b)]){const option=el('option',value===''?'Any':String(value));option.value=String(value);select.append(option);}}selectedPool=pool;}
  function buildFilters(){const options=filterOptions(dto);statInputs=[];fillPoolOptions();statBox.replaceChildren(legend);
    for(const {code,label}of options.stats){const pair=el('div',undefined,'api-item-stat-pair'),entry={code};for(const [key,suffix]of [['min','at least'],['max','at most']]){const l=el('label',label+' '+suffix),n=el('input');n.type='number';n.step='1';n.min='-1000000';n.max='1000000';n.dataset.stat=code;n.dataset.bound=key;l.append(n);pair.append(l);entry[key]=n;}statInputs.push(entry);statBox.append(pair);}
  }
  function renderRows(){if(destroyed)return;if(selectedPool!==pool)fillPoolOptions();for(const b of tabs.children)b.setAttribute('aria-pressed',String(b.dataset.pool===pool));statBox.hidden=pool!=='reported_stats';attackBox.hidden=pool!=='attack_pool';slots.parentElement.hidden=upgrades.parentElement.hidden=pool==='attack_pool';nearLabel.hidden=pool==='reported_stats';explanation.textContent=pool==='reported_stats'?'Filter the reported signature, slots and successful upgrades together. Unreported fields never match a numeric limit.':pool==='scroll_state'?'This pool matches successful upgrades and remaining slots; other stats are not held constant.':'This pool matches only Weapon ATT; other stats, slots and upgrades are not held constant.';
    let model;try{model=itemPanelModel(dto,query(),search.value);}catch{feedback.textContent='Check filter limits: use whole numbers, and a minimum no greater than its maximum.';tableWrap.replaceChildren();previous.disabled=next.disabled=true;pageText.textContent='';return;}
    if(sortColumn!=='reference'){const value=row=>sortColumn==='samples'?row.reference?.reportedSamples??null:row[sortColumn]??null;model.rows.sort((a,b)=>{const x=value(a),y=value(b);if(x===null||y===null)return x===y?0:x===null?1:-1;return (sort==='descending'?-1:1)*(x-y)||a.groupKey.localeCompare(b.groupKey,'en');});}
    const total=model.rows.length,pages=Math.max(1,Math.ceil(total/25));page=Math.max(0,Math.min(page,pages-1));feedback.textContent=`${total} matching groups. ${near.checked&&pool!=='reported_stats'?'Nearby fallbacks included.':'Nearby fallbacks off.'} Prices are mesos per item.`;
    const table=el('table'),caption=el('caption',pools[pool]+' · reported 3-day lookback'),thead=el('thead'),head=el('tr'),tbody=el('tbody');table.append(caption,thead,tbody);thead.append(head);
    const headings=pool==='attack_pool'?['Weapon ATT','Sale median / average','Sales / units','Asking median / listings','Reference price','Basis / samples','Nearby fallback']:['Reported signature / pool','Slots left','Successful upgrades','Reference price','Basis / samples','Nearby fallback'];
    const sortable={'Reference price':'reference','Slots left':'slotsLeft','Successful upgrades':'successfulUpgrades','Weapon ATT':'reportedAttack','Basis / samples':'samples'};
    for(const label of headings){const th=el('th');th.scope='col';if(sortable[label]){const key=sortable[label],active=key===sortColumn;th.setAttribute('aria-sort',active?sort:'none');const b=el('button',label+(active?(sort==='ascending'?' ↑':' ↓'):''));b.type='button';b.dataset.sort=key;b.addEventListener('click',()=>{sort=key===sortColumn?(sort==='ascending'?'descending':'ascending'):'ascending';sortColumn=key;page=0;renderRows();});th.append(b);}else th.textContent=label;head.append(th);}
    for(const row of model.rows.slice(page*25,page*25+25)){const tr=el('tr');tr.dataset.groupKey=row.groupKey;const r=row.reference,deal=row.dealReference,nearText=deal?(deal.isNearFallback&&!near.checked?'Off':`${exactMoney(deal.unitPrice)} mesos · ${deal.basis==='sold'?'source sold':'asking'} · ${deal.reportedSamples} samples${deal.isNearFallback?' · nearby, qualities may differ':''}`):'Unavailable';
      const common=[r?exactMoney(r.unitPrice):'Unknown',r?`${r.basis==='sold'?'Source sold':'Asking'} · ${r.reportedSamples} samples${r.isNearFallback?' · nearby':''}`:'Unknown',nearText];
      const values=pool==='attack_pool'?[row.reportedAttack,`${exactMoney(row.sold?.medianUnitPrice??null)} / ${exactMoney(row.sold?.averageUnitPrice??null)}`,row.sold?`${row.sold.reportedSalesCount} / ${row.sold.reportedUnitCount}`:'Unknown',row.asking?`${exactMoney(row.asking.medianUnitPrice)} / ${row.asking.reportedListingCount}`:'Unknown',...common]:[pool==='reported_stats'?signature(row):'Scroll-state pool',row.slotsLeft,row.successfulUpgrades,...common];for(const value of values)tr.append(el('td',String(value)));tbody.append(tr);}
    if(!total){const tr=el('tr'),td=el('td','No matching reported groups. Broader pools are available separately; they do not fill this result.');td.colSpan=headings.length;tr.append(td);tbody.append(tr);}tableWrap.replaceChildren(table);pageText.textContent=`Page ${page+1} of ${pages}`;previous.disabled=page===0;next.disabled=page+1===pages;
  }
  controls.addEventListener('input',()=>{page=0;renderRows();});controls.addEventListener('change',()=>{page=0;renderRows();});container.append(section);fillSummary();buildFilters();renderRows();
  return Object.freeze({element:section,updateTimezone(value){zone=value;fillSummary();},updateDto(value){assertSafeItemDto(value);dto=structuredClone(value);page=0;controls.reset();fillSummary();buildFilters();renderRows();},destroy(){destroyed=true;section.remove();}});
}
