(() => {
  'use strict';
  const options = document.getElementById('display-options');
  const navigation = document.querySelector('.nav-wrap');
  if (!options || !navigation || document.getElementById('market-highlights')) return;
  const key = 'astra-market-highlights-v1';
  let enabled = true, paused = false, report, calculationDetail = false, showPublication = false, showContext = false, abbreviations = true;
  try { enabled = localStorage.getItem(key) !== 'off'; } catch { /* Default On without persistent storage. */ }
  try { abbreviations = localStorage.getItem('astra-highlights-abbreviations-v1') !== 'off'; } catch { /* Compact helpers default On. */ }
  const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const control = make('div', 'hero-layout-options market-highlights-options');
  control.setAttribute('role', 'group'); control.setAttribute('aria-label', 'Header market highlights');
  const toggle = make('button'); toggle.type = 'button'; toggle.setAttribute('aria-controls', 'market-highlights');
  control.append(toggle, make('small', '', 'Dated aggregates, not a live sales tape. Saved in this browser only.'));
  options.append(control);
  const panel = make('section', 'market-highlights'); panel.id = 'market-highlights';
  panel.setAttribute('aria-label', 'Dated market highlights');
  const heading = make('div', 'market-highlights-heading');
  const publication = make('span', 'market-highlights-publication');
  publication.id='market-highlights-source-publication';publication.hidden=true;
  const pause = make('button', 'market-highlights-pause'); pause.type = 'button';
  pause.setAttribute('aria-controls', 'market-highlights-track');
  heading.append(make('strong', '', 'Did you know?'), publication, pause);
  const viewport = make('div', 'market-highlights-viewport');
  const track = make('div', 'market-highlights-track'); track.id = 'market-highlights-track';
  viewport.append(track); panel.append(heading, viewport);
  navigation.after(panel);
  const page = make('section', 'view highlights-page'); page.id = 'view-highlights'; page.hidden = true;
  page.setAttribute('aria-labelledby', 'highlights-title');
  const pageHeading = make('div', 'page-heading'), pageHeadingCopy = make('div');
  const title = make('h1', '', 'Highlights & Activity'); title.id = 'highlights-title';
  pageHeadingCopy.append(make('p', 'eyebrow', 'DATED AGGREGATES / VISIBLE COVERAGE'), title,
    make('p', '', 'Standout observations in the fixed basket, plus hourly NX offer activity.'));
  pageHeading.append(pageHeadingCopy);
  const pagePublication = make('p', 'highlights-page-publication');
  pagePublication.id='highlights-source-publication';pagePublication.hidden=true;
  const apiEvidenceScope=make('p','highlights-api-scope');apiEvidenceScope.hidden=true;
  const cards = make('div', 'highlights-fact-grid');
  cards.id = 'highlights-fact-grid';
  const transactionNote = make('p', 'highlights-evidence-note', 'Individual-transaction trivia is pending: this snapshot contains no qualified individual transaction records. A daily median, recorded count or high/low price cannot identify a largest completed sale.');
  const activity = make('section', 'highlights-activity');
  const activityTitle = make('h2', '', 'Hourly NX offer activity'); activityTitle.id = 'highlights-activity-title';
  activity.setAttribute('aria-labelledby', activityTitle.id);
  const activityScope = make('p', 'highlights-activity-scope');
  const activityStats = make('div', 'highlights-activity-stats');
  const countCard = make('article', 'chart-card hourly-history-card highlights-count-card');
  const countTitle = make('h3', '', 'Poster counts by source hour');
  const countLegend = make('p', 'highlights-count-legend', 'Gold: sellers posting · Mint: buyers posting. Gaps mean missing or conflicting counts, not zero activity.');
  const countChart = make('div', 'highlights-count-chart');
  countChart.setAttribute('role', 'img'); countChart.setAttribute('aria-label', 'Last 24 source-hour seller and buyer poster counts; accessible values follow in the table');
  countCard.append(countTitle, countLegend, countChart);
  const activityTable = make('div', 'table-wrap highlights-activity-table');
  activity.append(activityTitle, activityScope, activityStats, countCard, activityTable,
    make('p', 'highlights-evidence-note', 'These are source-published poster counts for each UTC hour, not completed trades, unique people across hours, meso turnover or total server activity. A poster can appear in multiple hours or on both sides. Missing buckets and sides are left missing.'));
  const overview = make('p', 'highlights-overview-link'), overviewLink = make('a', '', 'View estimated meso turnover on Overview →');
  overviewLink.href = '#volume-title'; overview.append(overviewLink);
  page.append(pageHeading, pagePublication,apiEvidenceScope, cards, transactionNote, activity, overview);
  const calculationControls=make('div','highlights-detail-controls'),calculationToggle=make('button','','Show calculation details');calculationControls.dataset.previewControls='true';
  calculationToggle.type='button';calculationToggle.setAttribute('aria-pressed','false');calculationToggle.setAttribute('aria-controls','highlights-fact-grid market-highlights-track');calculationControls.append(calculationToggle);page.append(calculationControls);
  const publicationToggle=make('button','','Show source publication');publicationToggle.type='button';publicationToggle.setAttribute('aria-pressed','false');publicationToggle.setAttribute('aria-controls','highlights-source-publication market-highlights-source-publication');calculationControls.append(publicationToggle);
  const contextToggle=make('button','','Show Wolbi context');contextToggle.type='button';contextToggle.setAttribute('aria-pressed','false');contextToggle.setAttribute('aria-controls','highlights-fact-grid market-highlights-track');calculationControls.append(contextToggle);
  const abbreviationToggle=make('button');abbreviationToggle.type='button';abbreviationToggle.dataset.highlightsAbbreviations='true';abbreviationToggle.setAttribute('aria-controls','highlights-fact-grid market-highlights-track');
  document.getElementById('content').append(page);
  const navLink = make('a', 'nav-link', 'Highlights & Activity'); navLink.href = '#highlights';
  const nav = navigation.querySelector('nav'), fallback = nav.querySelector('.fallback-link');
  if (fallback) fallback.before(navLink); else nav.append(navLink);
  document.getElementById('volume-title')?.setAttribute('tabindex', '-1');
  const number = value => value.toLocaleString('en-US', { maximumFractionDigits: 0 });
  const positive = value => Number.isFinite(value) && value > 0;
  const day = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
  const largest = (rows, key) => rows.filter(row => Number.isFinite(row[key])).sort((a, b) => b[key] - a[key] || String(a.slug).localeCompare(String(b.slug)))[0];
  function legacyHighlights(data) {
    const rows = (data.rows || []).filter(row => row.slug && /^[a-z0-9][a-z0-9-]*$/.test(row.slug) && row.name && day(row.priceDay) && positive(row.price));
    const sourceDay=day(String(data.sourceUpdatedAt||'').slice(0,10)),windowDays=Math.round((Date.parse(data.recentEndExclusive)-Date.parse(data.recentStart))/86400000);
    const items = [], add = (row, type, label, value, date, detail = '', direction = 'neutral', numericValue = null) => {
      if (!row)return;
      const carried=sourceDay&&row.priceDay<sourceDay,frame=type==='turnover'||type==='volume'?`${windowDays>0?windowDays+'-day window':'Recorded activity window'} · complete source-calendar days`:type==='change'?'Starting price level → latest qualifying price'+(carried?' · earlier price carried':''):carried?'Earlier qualifying daily observation':'Latest source-day observation';
      const provenance=type==='change'?`Reference week ${data.baseStart}–${data.baseEnd} · ${date}`:date;
      const essential=type==='context'?detail:'';
      const displayDate=type==='turnover'||type==='volume'?date:row.priceDay;
      const compact=Number.isFinite(numericValue)&&Math.abs(numericValue)>=1000?new Intl.NumberFormat('en-US',{notation:'compact',compactDisplay:'short',maximumFractionDigits:1}).format(numericValue):null;
      items.push({ slug:row.slug,name:row.name,type,label,value,compact,date:provenance,displayDate,detail,direction,frame,essential,summary:`${label}: ${row.name} · ${value} · ${displayDate} · ${frame}${essential?' · '+essential:''}`,text:`${label}: ${row.name} · ${value} · ${provenance}${detail?' · '+detail:''}` });
    };
    const expensive = largest(rows.filter(row => positive(row.quantity)), 'price');
    if (expensive) add(expensive, 'median', 'Largest basket daily median', `${number(expensive.price)} mesos / ${expensive.unit || 'unit'}`, `${expensive.priceDay} · ${number(expensive.quantity)} recorded volume`, 'Daily median, not an individual sale', 'neutral', expensive.price);
    const moved = rows.filter(row => Number.isFinite(row.changeBase)).sort((a, b) => Math.abs(b.changeBase) - Math.abs(a.changeBase) || String(a.slug).localeCompare(String(b.slug)))[0];
    if (moved) add(moved, 'change', 'Largest basket move vs reference week', `${moved.changeBase >= 0 ? '+' : ''}${moved.changeBase.toFixed(1)}%`, `price dated ${moved.priceDay}`, 'Change from fixed reference prices', moved.changeBase > 0 ? 'up' : moved.changeBase < 0 ? 'down' : 'flat');
    const end = day(data.recentEndExclusive), through = end ? new Date(Date.parse(end + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10) : null;
    if (day(data.recentStart) && through) {
      const scope = `${data.recentStart}–${through}`;
      const turnover = largest(rows.filter(row => positive(row.recentTurnoverProxy)), 'recentTurnoverProxy');
      if (turnover) add(turnover, 'turnover', 'Largest basket turnover proxy', `${number(turnover.recentTurnoverProxy)} mesos`, scope, 'daily median × recorded volume', 'neutral', turnover.recentTurnoverProxy);
      const volume = largest(rows.filter(row => positive(row.recentQuantity)), 'recentQuantity');
      if (volume) add(volume, 'volume', 'Most recorded basket volume', `${number(volume.recentQuantity)} recorded units/count`, scope, '', 'neutral', volume.recentQuantity);
    }
    const wolbi = (data.contextItems || []).find(row => row.slug === 'wolbi-throwing-stars' && day(row.priceDay) && positive(row.price) && row.notIndexed === true && row.weight === 0);
    if (showContext && wolbi) add(wolbi, 'context', 'Wolbi* context', `${number(wolbi.price)} mesos / ${wolbi.unit || 'unit'} daily median`, wolbi.priceDay, 'zero MPI weight · item-specific supply caveat, not broad deflation', 'neutral', wolbi.price);
    return items;
  }
  const sourceDay=value=>{try{return !!day(value)&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;}catch{return false;}};
  const shiftDay=(value,n)=>new Date(Date.parse(value+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
  function receiptClock(value){
    if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))return 'Unknown';
    let zone=document.getElementById('display-timezone')?.value||'UTC';try{new Intl.DateTimeFormat('en-US',{timeZone:zone});}catch{zone='UTC';}
    const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',timeZoneName:'short'}).formatToParts(new Date(value)).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
    return `${parts.month}-${parts.day}-${parts.year} ${parts.hour}:${parts.minute}:${parts.second} ${parts.timeZoneName}`;
  }
  function apiHighlights(data){
    const view=data?.apiCalculationView,items=data?.apiDailyItems,latest=view?.daily?.latestDay;
    if(!view||!sourceDay(latest)||!Array.isArray(data.rows)||data.rows.length!==50||new Set(data.rows.map(r=>r.slug)).size!==50||new Set(data.rows.map(r=>r.currentApiReference?.itemId)).size!==50||!Array.isArray(items)||items.length!==79||items.filter(i=>i.role==='goods').length!==50||items.filter(i=>i.role==='cash').length!==29||new Set(items.map(i=>i.itemId)).size!==79||new Set(items.map(i=>i.slug)).size!==79)return [];
    const rows=[];
    for(const row of data.rows){const item=items.find(i=>i.role==='goods'&&i.slug===row.slug&&i.name===row.name&&i.itemId===row.currentApiReference?.itemId);if(!item||!Array.isArray(item.points)||item.points.length>31)continue;const points=new Map();let valid=true;
      for(const p of item.points){const median=p?.medianUnitPriceLexeme,known=typeof median==='string'&&median.length<=160&&/^\d+(?:\.\d+)?$/.test(median)&&Number.isFinite(Number(median))&&Number(median)<=Number.MAX_SAFE_INTEGER;if(!p||!sourceDay(p.day)||points.has(p.day)||median!==null&&!known||!Number.isSafeInteger(p.recordedSalesCount)||p.recordedSalesCount<0||!Number.isSafeInteger(p.reportedUnitCount)||p.reportedUnitCount<0||typeof p.partialCalendarDay!=='boolean'||p.qualified!==(known&&Number(median)>0&&p.recordedSalesCount>=5)||!Number.isFinite(Date.parse(p.source?.capturedAt))||p.linkedPrice!==null&&!positive(p.linkedPrice)){valid=false;break;}points.set(p.day,p);}
      if(valid)rows.push({...row,points});
    }
    const out=[],latestRows=rows.filter(r=>r.points.get(latest)?.qualified),days=Array.from({length:7},(_,i)=>shiftDay(latest,i-7)),completeRows=rows.filter(r=>days.every(d=>r.points.has(d)&&!r.points.get(d).partialCalendarDay));
    const add=(r,type,label,value,points,numericValue,eligibleCount)=>{if(!r)return;const captures=points.map(p=>p.source.capturedAt).sort((a,b)=>Date.parse(a)-Date.parse(b)),partial=points.some(p=>p.partialCalendarDay),frame=`Actual API daily basis · ${type==='api-count'||type==='api-proxy'?'previous 7 complete source-calendar days':partial?'partial API source day':'completed source-calendar day'} · ${eligibleCount}/50 goods with required evidence`,date=type==='api-count'||type==='api-proxy'?`${days[0]}–${days.at(-1)}`:latest,detail=`Original daily retrievals ${receiptClock(captures[0])}–${receiptClock(captures.at(-1))}; source days stay UTC; calendar cutoff does not prove 24 scanned hours. ${type==='api-proxy'?'Sum of daily median × reported sales count; not exact turnover. ':''}${type==='api-change'?'Frozen linked base; quality/rolls not constant. ':''}Counts are not verified physical units or individual trades.`;
      out.push({slug:r.slug,name:r.name,type,label,value,compact:Number.isFinite(numericValue)&&Math.abs(numericValue)>=1000?new Intl.NumberFormat('en-US',{notation:'compact',compactDisplay:'short',maximumFractionDigits:1}).format(numericValue):null,date,displayDate:date,detail,direction:'neutral',frame,essential:'',summary:`${label}: ${r.name} · ${value} · ${date} · ${frame}`,text:`${label}: ${r.name} · ${value} · ${date} · ${frame} · ${detail}`,numericValue});};
    const median=largest(latestRows.map(r=>({...r,observedMedian:Number(r.points.get(latest).medianUnitPriceLexeme)})),'observedMedian');add(median,'api-median','Largest covered API goods daily median',median?`${number(median.observedMedian)} mesos / source unit`:'',median?[median.points.get(latest)]:[],median?.observedMedian,latestRows.length);
    const changedRows=latestRows.filter(r=>positive(r.basePrice)&&positive(r.points.get(latest).linkedPrice)).map(r=>({...r,dailyLinkedChange:100*(r.points.get(latest).linkedPrice/r.basePrice-1)})).filter(r=>Number.isFinite(r.dailyLinkedChange)),changed=changedRows.sort((a,b)=>Math.abs(b.dailyLinkedChange)-Math.abs(a.dailyLinkedChange)||a.slug.localeCompare(b.slug))[0];add(changed,'api-change','Largest covered API daily linked move',changed?`${changed.dailyLinkedChange>=0?'+':''}${changed.dailyLinkedChange.toFixed(1)}%`:'',changed?[changed.points.get(latest)]:[],changed?.dailyLinkedChange,changedRows.length);
    const activity=completeRows.map(r=>{let count=0,proxy=0,priced=true;for(const d of days){const p=r.points.get(d);count+=p.recordedSalesCount;if(!p.qualified)priced=false;else proxy+=Number(p.medianUnitPriceLexeme)*p.recordedSalesCount;}return {...r,count:Number.isSafeInteger(count)?count:null,proxy:priced&&Number.isFinite(proxy)&&proxy<=Number.MAX_SAFE_INTEGER?proxy:null};});
    const countRows=activity.filter(r=>Number.isFinite(r.count)),proxyRows=activity.filter(r=>Number.isFinite(r.proxy));
    const count=largest(countRows,'count');add(count,'api-count','Most covered API goods reported sales',count?`${number(count.count)} reported sales counts`:'',count?days.map(d=>count.points.get(d)):[],count?.count,countRows.length);
    const proxy=largest(proxyRows,'proxy');add(proxy,'api-proxy','Largest covered API goods turnover proxy',proxy?`${number(proxy.proxy)} mesos proxy`:'',proxy?days.map(d=>proxy.points.get(d)):[],proxy?.proxy,proxyRows.length);
    return out;
  }
  function highlights(data){
    if(!data?.apiCalculationView)return legacyHighlights(data);
    const legacy=legacyHighlights({...data,rows:Array.isArray(data.retainedLegacyRows)?data.retainedLegacyRows:[]}).map(item=>({...item,label:'Retained source · '+item.label,frame:'Retained legacy source · '+item.frame,summary:'Retained legacy source · '+item.summary,text:'Retained legacy source · '+item.text}));
    return [...apiHighlights(data),...legacy];
  }
  function highlightGraphic(item, includeKind, headingLevel) {
    const graphic = make('span', 'market-highlight-graphic'), image = make('img', 'market-highlight-sprite');
    image.alt = ''; image.setAttribute('aria-hidden', 'true'); image.width = image.height = 42; image.loading = 'lazy'; image.decoding = 'async';
    const fallback = 'assets/' + item.slug + '.svg', candidate = report?.spriteMap?.[item.slug];
    const src = typeof candidate === 'string' && /^assets\/[a-z0-9][a-z0-9._-]*\.(?:png|svg|webp)$/.test(candidate) ? candidate : fallback;
    image.addEventListener('error', () => { if (image.getAttribute('src') !== fallback) image.src = fallback; else image.hidden = true; }); image.src = src;
    const copy = make('span', 'market-highlight-copy'), fact = make('span', 'market-highlight-fact'),titleLine=make('span','market-highlight-title-line'),valueLine=make('span','market-highlight-value-line');
    if(headingLevel){titleLine.setAttribute('role','heading');titleLine.setAttribute('aria-level',String(headingLevel));}
    titleLine.append(make('strong','market-highlight-headline',item.label));
    valueLine.append(make('span','market-highlight-item-name',item.name),make('span','market-highlight-value',' · '+item.value));
    if(abbreviations&&item.compact)valueLine.append(make('span','market-highlight-abbreviation','('+item.compact+')'));
    if(item.direction!=='neutral')valueLine.append(make('span','market-highlight-direction',item.direction==='up'?'↑ Increased':item.direction==='down'?'↓ Decreased':'→ Unchanged'));fact.append(titleLine,valueLine);
    const dates=make('small','market-highlight-dates');dates.append(document.createTextNode('('),make('strong','market-highlight-date',item.displayDate),make('span','',' · '+item.frame+(item.essential?' · '+item.essential:'')));
    const details=make('span','market-highlight-details',' · '+item.date+(item.detail?' · '+item.detail:''));details.hidden=!calculationDetail;dates.append(details,document.createTextNode(')'));
    copy.append(fact,dates);graphic.title=item.text;graphic.append(image,copy);return graphic;
  }
  function utc(value) {
    const time = Date.parse(value);
    return Number.isFinite(time) ? new Date(time).toISOString().replace('T', ' ').replace(/:00\.000Z$/, ' UTC').replace(/\.000Z$/, ' UTC') : 'Unavailable';
  }
  function hourlyActivity(data) {
    const source = data.smegaSource?.sourceUrl;
    const points = (data.smega || []).filter(point => source && point.sourceUrl === source && point.aggregation === 'source_published_hourly'
      && ['buy', 'sell'].includes(point.side) && Number.isFinite(Date.parse(point.at)));
    if (!points.length) return [];
    const end = Math.max(...points.map(point => Date.parse(point.at))), buckets = new Map();
    for (const point of points) {
      const time = Date.parse(point.at); if (time <= end - 24 * 3600000) continue;
      const at = new Date(time).toISOString(), count = point.sampleCount ?? point.distinctSenders;
      let bucket = buckets.get(at); if (!bucket) { bucket = { at, partial: false, conflicts: new Set() }; buckets.set(at, bucket); }
      bucket.partial ||= !!point.partial;
      if (!Number.isInteger(count) || count < 0) continue;
      if (bucket[point.side] !== undefined && bucket[point.side] !== count) bucket.conflicts.add(point.side);
      else bucket[point.side] = count;
    }
    return [...buckets.values()].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).map(bucket => {
      for (const side of bucket.conflicts) delete bucket[side];
      return bucket;
    });
  }
  function drawPage() {
    if (!report) return;
    apiEvidenceScope.hidden=!report.apiCalculationView;
    if(report.apiCalculationView){const v=report.apiCalculationView;apiEvidenceScope.textContent=`API facts cover only the fixed 50 goods, using actual UTC daily aggregates through ${sourceDay(v.daily?.latestDay)?v.daily.latestDay:'an unavailable source day'}. Daily publication ${receiptClock(v.clocks?.dailyPublisher)}; original daily retrieval ${receiptClock(v.clocks?.dailyCapture)}. A latest partial source day is identified on its facts; prior-week facts require all seven prior calendar days per ranked item. These are not the current 3-day reference or a full-market ranking. Retained legacy facts keep their separate original dates.`;}
    pagePublication.textContent = 'Daily source publication: ' + utc(report.sourceUpdatedAt) + '. Item dates and the activity capture below are separately dated.';
    pageHeading.title=pagePublication.textContent;pagePublication.hidden=!showPublication;
    cards.replaceChildren();
    const items = highlights(report);
    for (const item of items) {
      const card = make('article', 'panel highlights-fact'); card.dataset.highlightType = item.type; card.dataset.direction = item.direction;
      const link = make('a'); link.href = '#item/' + encodeURIComponent(item.slug); link.setAttribute('aria-label', item.summary);link.title=item.text;link.append(highlightGraphic(item, true, 2));
      card.append(link); cards.append(card);
    }
    if (!items.length) cards.append(make('p', 'empty', 'No qualified dated highlights in this snapshot.'));
    const hours = hourlyActivity(report), latest = hours[0], earliest = hours.at(-1);
    drawCountChart(hours);
    activityScope.textContent = hours.length
      ? `Last 24 source hours · as of ${utc(latest.at)} · ${hours.length} / 24 buckets retained. Offer capture: ${utc(report.smegaSource?.capturedAt)}.${calculationDetail?' Exact retained interval: '+utc(earliest.at)+' – '+utc(latest.at)+'.':''}`
      : 'No source-published hourly offer counts are available in this snapshot.';
    activityScope.title=hours.length?`Exact retained interval: ${utc(earliest.at)} – ${utc(latest.at)}. Offer capture: ${utc(report.smegaSource?.capturedAt)}.`:'';
    activityStats.replaceChildren();
    for (const [side, label] of [['sell', 'Seller poster-hour appearances'], ['buy', 'Buyer poster-hour appearances']]) {
      const available = hours.filter(hour => Number.isInteger(hour[side]));
      const stat = make('article', 'panel');
      stat.append(make('span', '', label), make('strong', '', available.length ? number(available.reduce((sum, hour) => sum + hour[side], 0)) : '—'),
        make('small', '', available.length + ' source-hour counts · not unique people'));
      activityStats.append(stat);
    }
    activityTable.replaceChildren();
    if (!hours.length) { activityTable.append(make('p', 'empty', 'No hourly buckets to display.')); return; }
    const table = make('table'), caption = make('caption', '', 'Published poster counts by source hour · UTC'), head = make('thead'), headRow = make('tr'), body = make('tbody');
    for (const label of ['Source hour · UTC', 'Sellers posting', 'Buyers posting', 'Coverage']) { const th = make('th', '', label); th.scope = 'col'; headRow.append(th); }
    head.append(headRow);
    for (const hour of hours) {
      const row = make('tr'); row.dataset.sourceHour = hour.at;
      const missing = ['sell', 'buy'].filter(side => !Number.isInteger(hour[side]));
      const coverage = [hour.partial ? 'Partial source bucket' : 'Published hourly bucket', missing.length ? 'missing ' + missing.map(side => side === 'sell' ? 'seller count' : 'buyer count').join(' and ') : '', hour.conflicts.size ? 'conflicting counts omitted' : ''].filter(Boolean).join(' · ');
      for (const text of [utc(hour.at), Number.isInteger(hour.sell) ? number(hour.sell) : '—', Number.isInteger(hour.buy) ? number(hour.buy) : '—', coverage]) row.append(make('td', '', text));
      body.append(row);
    }
    table.append(caption, head, body); activityTable.append(table);
  }
  function drawCountChart(hours) {
    countChart.replaceChildren();if(!hours.length){countChart.append(make('p','empty','No source-published hourly counts to plot.'));return;}
    const ns='http://www.w3.org/2000/svg',svgNode=(tag,attrs,text)=>{const node=document.createElementNS(ns,tag);for(const [key,value] of Object.entries(attrs||{}))node.setAttribute(key,String(value));if(text!==undefined)node.textContent=text;return node;};
    const W=Math.max(320,Math.min(countChart.clientWidth||700,720)),H=264,L=48,R=20,T=54,B=100,plotW=W-L-R,plotH=H-T-B,end=Date.parse(hours[0].at),start=end-23*3600000,slot=plotW/24;
    const max=Math.max(1,...hours.flatMap(hour=>['sell','buy'].map(side=>Number.isInteger(hour[side])?hour[side]:0))),upper=Math.max(4,Math.ceil(max/4)*4),map=new Map(hours.map(hour=>[Date.parse(hour.at),hour]));
    const svg=svgNode('svg',{viewBox:`0 0 ${W} ${H}`,role:'img','aria-label':'Published poster counts for each UTC source hour; not sales or unique people'});
    svg.append(svgNode('title',{},'Last 24 source hours: published seller and buyer poster counts. Missing/conflicting sides have no bar; counts are not unique people or sales.'));
    svg.append(svgNode('text',{x:L+plotW/2,y:18,'text-anchor':'middle',class:'highlights-count-axis'},'Poster count / source hour'));
    for(let i=0;i<=4;i++){const value=upper*i/4,y=T+plotH-value/upper*plotH;svg.append(svgNode('line',{x1:L,x2:W-R,y1:y,y2:y,stroke:'var(--line)'}),svgNode('text',{x:L-8,y:y+4,'text-anchor':'end',class:'highlights-count-tick'},number(value)));}
    for(let i=0;i<24;i++){const at=start+i*3600000,hour=map.get(at),x=L+i*slot;
      if(!hour){const gap=svgNode('rect',{x:x+1,y:T,width:Math.max(1,slot-2),height:plotH,fill:'var(--line)',opacity:'.16','data-hour-coverage':'missing'});gap.append(svgNode('title',{},utc(new Date(at).toISOString())+' · source hour unavailable; no counts imputed'));svg.append(gap);continue;}
      if(hour.partial){const partial=svgNode('rect',{x,y:T,width:slot,height:plotH,fill:'#edc471',opacity:'.09','data-hour-partial':'true'});partial.append(svgNode('title',{},utc(hour.at)+' · partial source bucket when captured'));svg.append(partial);}
      for(const [side,offset,color] of [['sell',.12,'#edc471'],['buy',.55,'#89c6b0']]){if(!Number.isInteger(hour[side]))continue;const value=hour[side],height=value/upper*plotH,bar=svgNode('rect',{x:x+slot*offset,y:T+plotH-height,width:slot*.32,height,fill:color,'data-source-hour':hour.at,'data-source-side':side,'data-source-count':value});bar.append(svgNode('title',{},`${utc(hour.at)} · ${side==='sell'?'Seller':'Buyer'} source posters: ${number(value)}${hour.partial?' · partial when captured':''}; not unique people across hours or trade volume`));svg.append(bar);}
    }
    for(const i of [0,Math.round(23/2),23]){const at=start+i*3600000,date=new Date(at),x=L+(i+.5)*slot,anchor=i===0?'start':i===23?'end':'middle',label=date.toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'}),tick=svgNode('text',{x,y:H-74,'text-anchor':anchor,class:'highlights-count-tick'},label);tick.append(svgNode('tspan',{x,dy:20},date.toISOString().slice(11,16)));svg.append(tick);}
    svg.append(svgNode('text',{x:L+plotW/2,y:H-24,'text-anchor':'middle',class:'highlights-count-axis'},'Time (UTC)'));countChart.append(svg);
  }
  function draw() {
    if (!report) return;
    const items = highlights(report); track.replaceChildren();
    publication.textContent = report.sourceUpdatedAt && Number.isFinite(Date.parse(report.sourceUpdatedAt))
      ? 'Source publication ' + new Date(report.sourceUpdatedAt).toISOString().replace('T', ' ').replace('.000Z', ' UTC') : 'Source publication time unavailable';
    heading.title=publication.textContent;publication.hidden=!showPublication;
    if (!items.length) { track.append(make('p', '', 'No qualified dated highlights in this snapshot.')); return; }
    for (const duplicate of [false, true]) {
      const list = make('ul', 'market-highlights-list');
      if (duplicate) list.setAttribute('aria-hidden', 'true');
      for (const item of items) {
        const chip = make('li', 'market-highlight'); chip.dataset.highlightType = item.type; chip.dataset.direction = item.direction;
        const label = make(duplicate ? 'span' : 'a'); label.append(highlightGraphic(item, true));
        if (!duplicate) { label.href = '#item/' + encodeURIComponent(item.slug); label.setAttribute('aria-label', item.summary);label.title=item.text; }
        chip.append(label); list.append(chip);
      }
      track.append(list);
    }
  }
  function update() {
    panel.hidden = !enabled;
    toggle.textContent = 'Market highlights: ' + (enabled ? 'On' : 'Off');
    toggle.setAttribute('aria-pressed', String(enabled));
    const reduced = motion?.matches === true;
    panel.dataset.paused = String(paused || reduced); panel.dataset.reducedMotion = String(reduced);
    pause.textContent = reduced ? 'Motion off · device preference' : paused ? 'Resume motion' : 'Pause motion';
    pause.disabled = reduced; pause.setAttribute('aria-pressed', String(paused || reduced));
    if (enabled) draw();
  }
  toggle.addEventListener('click', () => {
    enabled = !enabled;
    try { localStorage.setItem(key, enabled ? 'on' : 'off'); } catch { /* Usable in this tab. */ }
    update();
  });
  calculationToggle.addEventListener('click',()=>{calculationDetail=!calculationDetail;calculationToggle.setAttribute('aria-pressed',String(calculationDetail));calculationToggle.textContent=calculationDetail?'Hide calculation details':'Show calculation details';document.querySelectorAll('.highlights-method-detail').forEach(note=>note.hidden=!calculationDetail);if(report){drawPage();if(enabled)draw();}});
  const fontButton=make('button','','Heading: Inquisitive');fontButton.type='button';let inquisitive=true;try{inquisitive=localStorage.getItem('astra-highlights-font-v1')!=='plain'}catch{}const applyFont=()=>{panel.dataset.headingFont=inquisitive?'inquisitive':'plain';fontButton.textContent='Heading: '+(inquisitive?'Inquisitive':'Plain');fontButton.setAttribute('aria-pressed',String(inquisitive))};fontButton.addEventListener('click',()=>{inquisitive=!inquisitive;try{localStorage.setItem('astra-highlights-font-v1',inquisitive?'inquisitive':'plain')}catch{}applyFont()});calculationControls.append(fontButton);applyFont();
  const applyAbbreviations=()=>{abbreviationToggle.textContent='Compact values: '+(abbreviations?'On':'Off');abbreviationToggle.setAttribute('aria-pressed',String(abbreviations));};
  abbreviationToggle.addEventListener('click',()=>{abbreviations=!abbreviations;try{localStorage.setItem('astra-highlights-abbreviations-v1',abbreviations?'on':'off')}catch{}applyAbbreviations();if(report){drawPage();if(enabled)draw();}});calculationControls.append(abbreviationToggle);applyAbbreviations();
  publicationToggle.addEventListener('click',()=>{showPublication=!showPublication;publicationToggle.setAttribute('aria-pressed',String(showPublication));publicationToggle.textContent=showPublication?'Hide source publication':'Show source publication';publication.hidden=pagePublication.hidden=!showPublication;});
  contextToggle.addEventListener('click',()=>{showContext=!showContext;contextToggle.setAttribute('aria-pressed',String(showContext));contextToggle.textContent=showContext?'Hide Wolbi context':'Show Wolbi context';if(report){drawPage();if(enabled)draw();}});
  pause.addEventListener('click', () => { paused = !paused; update(); });
  motion?.addEventListener?.('change', update);
  window.addEventListener('hashchange',()=>{if(window.location.hash==='#highlights'&&report)drawPage();});
  window.addEventListener('resize',()=>{if(report&&!page.hidden)drawCountChart(hourlyActivity(report));});
  document.addEventListener('change',event=>{if(event.target?.id==='display-timezone'&&report?.apiCalculationView){drawPage();if(enabled)draw();}});
  document.addEventListener('astramarketsnapshot', event => {
    if (!event.detail || !Array.isArray(event.detail.rows)) return;
    report = event.detail;
    drawPage();
    if (enabled) draw();
  });
  update();
  // The app owns collection. This handshake only requests its existing memory snapshot.
  document.dispatchEvent(new Event('astramarkethighlightsready'));
  // Deferred modules can be loaded after the app's first route decision.
  if (window.location.hash === '#highlights') window.dispatchEvent(new Event('hashchange'));
})();
