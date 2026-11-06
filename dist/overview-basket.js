(() => {
  'use strict';
  const view = document.getElementById('view-index'), stats = document.getElementById('market-stats');
  if (!view || !stats || stats.parentElement !== view || document.getElementById('overview-basket')) return;
  const make = (tag, text, className) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; };
  const day = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
  const origin = document.createComment('Source statistics original position'); stats.before(origin);
  const section = make('section', undefined, 'overview-basket'); section.id = 'overview-basket'; section.setAttribute('aria-labelledby', 'overview-basket-title');
  section.innerHTML = '<div class="overview-basket-content"><div class="section-heading"><div><p class="eyebrow">THE FULL FIXED GOODS BASKET / BY CATEGORY</p><h2 id="overview-basket-title">The representative 50 items of the Maple Economy and Meso Price Index</h2></div></div><p class="overview-basket-status" role="status"></p><div class="category-item-groups overview-basket-tiles"></div><p class="overview-basket-links"><a href="#basket">Full goods-basket details, weights and history →</a> · <a href="#cash-basket">Cash Basket details and history →</a> · <a href="#method-weights">Why these weights?</a></p></div>';
  stats.after(section);
  const controls = make('div', undefined, 'overview-basket-controls'); controls.dataset.previewControls = 'true'; controls.setAttribute('role', 'group'); controls.setAttribute('aria-label', 'Full Overview basket preview');
  controls.append(make('span', 'Full basket on Overview'));
  const toggle = make('button'); toggle.type = 'button'; toggle.setAttribute('aria-controls', 'overview-basket-content');
  section.querySelector('.overview-basket-content').id = 'overview-basket-content'; controls.append(toggle);
  const orderButtons = [];
  const key = 'astra-overview-basket-v1', orderKey = 'astra-overview-basket-stats-order-v1'; let enabled = true, order = 'above';
  try { enabled = localStorage.getItem(key) !== 'off'; } catch { /* Requested preview default remains On. */ }
  try { if (localStorage.getItem(orderKey) === 'below') order = 'below'; } catch { /* Source statistics stay above by default. */ }
  function apply() {
    section.dataset.enabled = String(enabled); section.querySelector('.overview-basket-content').hidden = !enabled;
    toggle.textContent = enabled ? 'On · hide basket' : 'Off · show basket'; toggle.setAttribute('aria-pressed', String(enabled));
    if (enabled && order === 'below') { if (section.nextSibling !== stats) section.after(stats); }
    else if (origin.nextSibling !== stats) origin.after(stats);
    section.dataset.statsOrder = order;
    for (const button of orderButtons) { button.disabled = !enabled; button.setAttribute('aria-pressed', String(button.dataset.overviewStatsOrder === order)); }
  }
  for (const [value, text] of [['above', 'Source stats above'], ['below', 'Source stats below']]) {
    const button = make('button', text); button.type = 'button'; button.dataset.overviewStatsOrder = value;
    button.addEventListener('click', () => { order = value; apply(); try { localStorage.setItem(orderKey, order); } catch { /* Tab choice still works. */ } });
    orderButtons.push(button); controls.append(button);
  }
  const headingKey='astra-overview-basket-heading-v1';let concise=false;try{concise=localStorage.getItem(headingKey)==='concise'}catch{}const headingToggle=make('button');headingToggle.type='button';headingToggle.dataset.overviewBasketHeading='true';const updateHeading=()=>{section.querySelector('h2').textContent=concise?'All 50 items, in context.':'The representative 50 items of the Maple Economy and Meso Price Index';headingToggle.textContent=concise?'Heading: Concise':'Heading: Representative 50';headingToggle.setAttribute('aria-pressed',String(!concise))};headingToggle.addEventListener('click',()=>{concise=!concise;try{localStorage.setItem(headingKey,concise?'concise':'representative')}catch{}updateHeading()});controls.append(headingToggle);updateHeading();
  controls.append(make('small', 'Display only · the original statistics strip and its values are preserved.'));
  section.append(controls); toggle.addEventListener('click', () => { enabled = !enabled; apply(); try { localStorage.setItem(key, enabled ? 'on' : 'off'); } catch { /* Tab choice still works. */ } });
  let dateBindings=[],statusReport=null;
  const captureClock=value=>typeof value==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(value)&&Number.isFinite(Date.parse(value));
  function captureLabel(value){
    if(!captureClock(value))return 'Unknown';let zone=document.getElementById('display-timezone')?.value||'UTC';try{new Intl.DateTimeFormat('en-US',{timeZone:zone});}catch{zone='UTC';}
    const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',timeZoneName:'short'}).formatToParts(new Date(value)).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));return `(${p.month}-${p.day}-${p.year} ${p.hour}:${p.minute}:${p.second} ${p.timeZoneName})`;
  }
  function updateDate(node,row,report){
    delete node.dataset.rawPriceCapturedAt;
    if(!report.apiCalculationView){node.textContent=day(row.priceDay)?'Source price: '+row.priceDay:'Source price date unavailable';return;}
    const ref=row.currentApiReference,view=report.apiCalculationView,bound=view.kind==='api_calculation_view'&&ref&&Number.isSafeInteger(ref.itemId)&&ref.itemId>0&&ref.slug===row.slug&&ref.name===row.name&&(row.canonicalId==null||row.canonicalId===ref.itemId)&&ref.reportedDays===3&&captureClock(ref.capturedAt)&&ref.capturedAt===view.clocks?.currentPrices;
    const known=bound&&typeof ref.currentSaleMedianLexeme==='string'&&ref.currentSaleMedianLexeme.length<=160&&/^\d+(?:\.\d+)?$/.test(ref.currentSaleMedianLexeme)&&Number.isFinite(Number(ref.currentSaleMedianLexeme))&&Number(ref.currentSaleMedianLexeme)>0&&Number(ref.currentSaleMedianLexeme)<=Number.MAX_SAFE_INTEGER&&Number.isSafeInteger(ref.recordedSalesCount)&&ref.recordedSalesCount>=5;
    node.dataset.rawDate='true';node.dataset.priceReferenceBasis='api_reported_3day_sale_median';node.textContent=(known?'Reported 3-day sale median':'API 3-day reference unavailable')+(bound?' · retrieved '+captureLabel(ref.capturedAt):' · retrieval context unavailable');node.title='Reported 3-day lookback; exact bounds and individual sale times unknown. Retrieval time is not a daily source price date.';if(bound)node.dataset.rawPriceCapturedAt=ref.capturedAt;
  }
  function updateStatus(report){
    const status=section.querySelector('.overview-basket-status');
    if(report?.apiCalculationView){const v=report.apiCalculationView;status.textContent=`The same 50-item goods basket and category cards as Methodology · basket version ${Number.isSafeInteger(report.basketVersion)?report.basketVersion:'unknown'}. Current labels identify the reported 3-day API sale-median reference where available, retrieved ${captureLabel(v.clocks?.currentPrices)}; exact source-window bounds and individual sale times are unknown. Retained legacy daily source publication: ${captureLabel(report.sourceUpdatedAt)}. Frozen reference ${day(report.baseStart)?report.baseStart:'unknown'}–${day(report.baseEnd)?report.baseEnd:'unknown'}. No retrieval clock is substituted for a source day; membership, weights and calculations are unchanged.`;return;}
    status.textContent = `The same 50-item goods basket and category cards as Methodology · basket version ${Number.isSafeInteger(report.basketVersion) ? report.basketVersion : 'unknown'}. Fixed reference ${day(report.baseStart) ? report.baseStart : 'unknown'}–${day(report.baseEnd) ? report.baseEnd : 'unknown'}; daily source published ${typeof report.sourceUpdatedAt === 'string' ? report.sourceUpdatedAt : 'unknown'}. Individual qualified price dates, frozen weights and item-history actions are retained. This display changes no membership, price, source clock or calculation.${report.sourceStatus?.status === 'degraded' ? ' Source checks are degraded; these prices retain their source dates.' : ''}`;
  }
  function receive(report) {
    dateBindings=[];statusReport=null;
    const source = document.getElementById('method-tiles'), target = section.querySelector('.overview-basket-tiles');
    const rows = report?.rows, originals = source ? [...source.querySelectorAll('button[data-item]')] : [];
    const rowMap = new Map(Array.isArray(rows) ? rows.filter(row => row && typeof row.slug === 'string').map(row => [row.slug, row]) : []);
    const seen = new Set();
    const complete = Array.isArray(rows) && rows.length === 50 && rowMap.size === 50 && originals.length === 50
      && !source.querySelector('[id]') && originals.every(button => { const slug = button.dataset.item; if (!rowMap.has(slug) || seen.has(slug)) return false; seen.add(slug); return true; });
    if (!complete) {
      target.replaceChildren(); section.querySelector('.overview-basket-status').textContent = 'A complete rendered 50-item view is not available in this snapshot. The original basket page and methodology remain available; no missing items are filled.'; apply(); return;
    }
    const copies = [...source.children].filter(node => node.classList.contains('method-category')).map(node => node.cloneNode(true));
    if (copies.reduce((count, node) => count + node.querySelectorAll('button[data-item]').length, 0) !== 50) {
      target.replaceChildren(); section.querySelector('.overview-basket-status').textContent = 'The category layout could not be verified. Open the full basket details below.'; apply(); return;
    }
    for (const copy of copies) for (const button of copy.querySelectorAll('button[data-item]')) {
      const row = rowMap.get(button.dataset.item), date = make('small', undefined, 'overview-basket-price-date');updateDate(date,row,report);dateBindings.push({node:date,row,report});
      const price = button.querySelector('strong'); if (price) price.after(date); else button.append(date);
    }
    target.replaceChildren(...copies);
    statusReport=report;updateStatus(report);
    apply();
  }
  document.addEventListener('astramarketsnapshot', event => receive(event.detail));
  document.addEventListener('change',event=>{if(event.target?.id!=='display-timezone')return;for(const b of dateBindings)if(b.report.apiCalculationView)updateDate(b.node,b.row,b.report);if(statusReport?.apiCalculationView)updateStatus(statusReport);});
  apply(); receive(null); document.dispatchEvent(new Event('astramarkethighlightsready'));
})();
