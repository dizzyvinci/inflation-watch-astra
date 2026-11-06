(() => {
  'use strict';
  if (window.AstraShortWindow) return;
  const validDay = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
  const shift = (day, offset) => new Date(Date.parse(day + 'T00:00:00Z') + offset * 86400000).toISOString().slice(0, 10);
  function sourceDay(value) { return typeof value === 'string' && Number.isFinite(Date.parse(value)) && validDay(value.slice(0, 10)) ? value.slice(0, 10) : null; }
  function calculate(row, publication) {
    const source = sourceDay(publication);
    if (!source) return null;
    const endDay = shift(source, -1), observations = new Map(), conflicts = new Set();
    for (const point of Array.isArray(row?.history) ? row.history : []) {
      if (!Array.isArray(point) || !validDay(point[0])) continue;
      const prior = observations.get(point[0]);
      if (prior && (prior[1] !== point[1] || prior[2] !== point[2])) conflicts.add(point[0]);
      else observations.set(point[0], point);
    }
    const endpoint = day => {
      const point = observations.get(day);
      return point && !conflicts.has(day) && Number.isFinite(point[1]) && point[1] > 0 && Number.isSafeInteger(point[2]) && point[2] >= 5 ? { day, price: point[1], quantity: point[2] } : null;
    };
    return { sourceDay: source, endDay, publication, comparisons: [1, 3, 7].map(days => {
      const startDay = shift(endDay, -days), start = endpoint(startDay), end = endpoint(endDay), percent = start && end ? (end.price / start.price - 1) * 100 : null;
      return { days, startDay, endDay, start, end, percent: Number.isFinite(percent) ? percent : null,
        reason: !start || !end ? 'Exact qualified endpoint unavailable' : !Number.isFinite(percent) ? 'Finite comparison unavailable' : null };
    }) };
  }
  function calculateApi(row, view) {
    const publication=view?.clocks?.dailyPublisher, source=sourceDay(publication);
    if(!source||!/(?:Z|[+-]\d\d:\d\d)$/.test(publication)||!row||!['goods','cash'].includes(row.role)||!Array.isArray(row.points)||row.points.length>31)return null;
    const days=row.points.map(p=>p?.day);if(new Set(days).size!==days.length)return null;
    const history=row.points.filter(p=>p&&p.qualified===true&&p.partialCalendarDay===false&&validDay(p.day)&&Number.isSafeInteger(p.recordedSalesCount)&&p.recordedSalesCount>=5&&(row.role==='goods'?Number.isFinite(p.linkedPrice)&&p.linkedPrice>0:typeof p.medianUnitPriceLexeme==='string'&&/^\d+(?:\.\d+)?$/.test(p.medianUnitPriceLexeme))).map(p=>[p.day,row.role==='goods'?p.linkedPrice:Number(p.medianUnitPriceLexeme),p.recordedSalesCount]);
    const model=calculate({history},publication);if(model)for(const comparison of model.comparisons)for(const side of ['start','end'])if(comparison[side])comparison[side].sourceCapturedAt=row.points.find(p=>p.day===comparison[side].day)?.source?.capturedAt??null;
    return model?{...model,basis:'api_actual_daily',dailyCapturedAt:view.clocks.dailyCapture,scope:row.role==='goods'?'fixed 50 goods':'fixed 29 NX-cost cash items'}:null;
  }
  const zone=()=>document.getElementById('display-timezone')?.value||'UTC';
  const capture=value=>{if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))return 'unknown';try{return new Date(value).toLocaleString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false,timeZone:zone()})+' '+zone()+' '+new Date(value).toLocaleDateString('en-US',{year:'numeric',timeZone:zone()});}catch{return value;}};
  window.AstraShortWindow = Object.freeze({ calculate, calculateApi });
  const options = document.getElementById('display-options'), view = document.getElementById('view-index');
  if (!options || !view || document.getElementById('short-window-options')) return;
  const make = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
  const key = 'astra-short-window-preview-v1', pairKey='astra-short-window-pair-v1'; let enabled = false, pair='3_1', report = null, pending = false, storageAvailable = true, models = { goods: new Map(), cash: new Map() };
  try { enabled = localStorage.getItem(key) === 'on'; if(localStorage.getItem(pairKey)==='7_3')pair='7_3'; } catch { storageAvailable = false; }
  const group = make('div', 'short-window-options'); group.id = 'short-window-options'; group.dataset.previewControls = 'short-window'; group.setAttribute('role', 'group'); group.setAttribute('aria-label', 'Complete-day item price comparisons');
  const label = make('span', '', 'Item price curiosity'), toggle = make('button'), note = make('small', 'short-window-options-note'); toggle.type = 'button'; toggle.setAttribute('aria-controls', 'view-index'); group.append(label, toggle, note); options.append(group);
  for(const [value,text] of [['7_3','7-day + 3-day'],['3_1','3-day + 1-day']]){const button=make('button','',text);button.type='button';button.dataset.shortWindowPair=value;button.setAttribute('aria-controls','view-index');button.addEventListener('click',()=>{pair=value;enabled=true;try{localStorage.setItem(pairKey,pair);localStorage.setItem(key,'on');}catch{storageAvailable=false;}draw();});group.insertBefore(button,note);}
  const signed = value => { const rounded = Math.abs(value) < .05 ? 0 : value; return (rounded > 0 ? '+' : '') + rounded.toLocaleString('en-US', { maximumFractionDigits: 1 }) + '%'; };
  const signatures = new WeakMap();
  function badge(model) {
    const host = make('span', 'short-window-badge'); host.setAttribute('role', 'note');
    host.append(make('span', 'short-window-label', report?.apiCalculationView?'API actual daily-median changes':'Separate daily-median changes'));
    if (!model) { host.append(make('span', 'short-window-unavailable', report?.apiCalculationView?'Unavailable · actual API daily endpoints absent or invalid':'Unavailable · source-calendar clock unknown')); return host; }
    host.append(make('span', 'short-window-period', `Complete through ${model.endDay}; current source day excluded`));
    for (const days of pair==='7_3'?[7,3]:[3,1]) {
      const point=model.comparisons.find(point=>point.days===days);
      const line = make('span', 'short-window-return'); line.dataset.shortWindowDays = String(point.days);
      const name = point.days === 1 ? '1 source day (24h*)' : point.days+' source days';
      const value = make('strong', point.percent === null ? 'short-window-unavailable' : point.percent > 0 ? 'short-window-up' : point.percent < 0 ? 'short-window-down' : 'short-window-flat', point.percent === null ? 'Unavailable' : signed(point.percent));
      line.append(make('span', '', name + ': '), value, make('small', '', `${point.startDay} → ${point.endDay} · ${point.percent === null ? 'needs both actual daily medians, each q ≥ 5; no carried substitute' : `recorded endpoint counts ${point.start.quantity} / ${point.end.quantity}; each q ≥ 5${model.basis==='api_actual_daily'?`; original daily receipts ${capture(point.start.sourceCapturedAt)} / ${capture(point.end.sourceCapturedAt)}`:''}`}`)); host.append(line);
    }
    host.append(make('span', 'short-window-caveat', model.basis==='api_actual_daily'?`* UTC source-calendar endpoints, not the current 3-day price reference or rolling 24h. ${model.scope}; mixed item quality, reported sale counts not units. Latest overview receipt ${capture(model.dailyCapturedAt)}; individual sale times unknown.`:'* Calendar-day comparison, not rolling 24h or intraday. Counts are source-inferred.'));
    return host;
  }
  function draw() {
    pending = false;
    toggle.textContent = enabled ? 'Extra comparisons: On' : 'Extra comparisons: Off'; toggle.setAttribute('aria-pressed', String(enabled));
    for(const button of group.querySelectorAll('[data-short-window-pair]'))button.setAttribute('aria-pressed',String(enabled&&button.dataset.shortWindowPair===pair));
    view.dataset.shortWindowPreview=enabled?pair:'off';
    note.textContent = 'Optional extra lines on Overview goods and cash cards. Exact complete-day endpoints only; existing 7-day activity, weights, indices and NX estimates stay unchanged.' + (storageAvailable ? ' Saved in this browser.' : ' Storage is blocked; this choice works in this tab.');
    for (const card of view.querySelectorAll('#overview-basket button[data-item], #cash-item-highlights [data-cash-highlight-slug]')) {
      const existing = [...card.children].find(child => child.classList.contains('short-window-badge'));
      if (!enabled) { if (existing) existing.remove(); signatures.delete(card); continue; }
      const isCash = card.hasAttribute('data-cash-highlight-slug'), slug = isCash ? card.dataset.cashHighlightSlug : card.dataset.item, model = (isCash ? models.cash : models.goods).get(slug) || null;
      const signature = pair+zone()+JSON.stringify(model);
      if (existing && signatures.get(card) === signature) continue;
      const next = badge(model); if (existing) existing.replaceWith(next); else card.append(next); signatures.set(card, signature);
    }
  }
  function schedule() { if (!pending) { pending = true; Promise.resolve().then(draw); } }
  function receive(data) {
    report = data;
    models = { goods: new Map(), cash: new Map() };
    if(report?.apiCalculationView){
      const rows=Array.isArray(report.apiDailyItems)?report.apiDailyItems:[],seen=new Set(),duplicates=new Set();
      if(rows.length!==79||rows.filter(r=>r?.role==='goods').length!==50||rows.filter(r=>r?.role==='cash').length!==29||new Set(rows.map(r=>r?.itemId)).size!==79||rows.some(r=>!Number.isSafeInteger(r?.itemId)||r.itemId<1||typeof r.slug!=='string'||!/^[a-z0-9][a-z0-9-]*$/.test(r.slug))){draw();return;}
      for(const row of rows){if(!row||typeof row.slug!=='string'||!['goods','cash'].includes(row.role))continue;if(seen.has(row.slug))duplicates.add(row.slug);seen.add(row.slug);(row.role==='goods'?models.goods:models.cash).set(row.slug,calculateApi(row,report.apiCalculationView));}
      for(const slug of duplicates){models.goods.delete(slug);models.cash.delete(slug);}draw();return;
    }
    for (const row of Array.isArray(report?.rows) ? report.rows : []) if (row && typeof row.slug === 'string') models.goods.set(row.slug, calculate(row, report.sourceUpdatedAt));
    const catalog = report?.cashCatalog, hasCatalog = catalog?.schemaVersion === 1 && catalog.kind === 'cash_shop_source_catalog' && Array.isArray(catalog.rows);
    for (const row of hasCatalog ? catalog.rows : Array.isArray(report?.cash) ? report.cash : []) if (row && typeof row.slug === 'string') models.cash.set(row.slug, calculate(row, hasCatalog ? catalog.sourceUpdatedAt : report.sourceUpdatedAt));
    draw();
  }
  toggle.addEventListener('click', () => { enabled = !enabled; try { localStorage.setItem(key, enabled ? 'on' : 'off'); } catch { storageAvailable = false; } draw(); });
  const observer = new MutationObserver(schedule); observer.observe(view, { childList: true, subtree: true });
  document.addEventListener('astramarketsnapshot', event => receive(event.detail));
  document.addEventListener('change',event=>{if(event.target?.id==='display-timezone')schedule();});
  draw(); document.dispatchEvent(new Event('astramarkethighlightsready'));
})();
