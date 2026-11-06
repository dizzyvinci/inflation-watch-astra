(() => {
  'use strict';
  if (window.AstraVolatilityPreview) return;
  const DAY = 86400000, positive = v => typeof v === 'number' && Number.isFinite(v) && v > 0;
  const validDay = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v + 'T00:00:00Z')) && new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v;
  const shift = (day, n) => new Date(Date.parse(day + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10);
  const capture=value=>{if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))return 'unknown';const zone=document.getElementById('display-timezone')?.value||'UTC';try{return new Date(value).toLocaleString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false,timeZone:zone})+' '+zone+' '+new Date(value).toLocaleDateString('en-US',{year:'numeric',timeZone:zone});}catch{return value;}};
  function sourceWindow(report) {
    if(report?.apiCalculationView){const publisher=report.apiCalculationView.clocks?.dailyPublisher,day=typeof publisher==='string'?publisher.slice(0,10):null;if(!validDay(day)||!/(?:Z|[+-]\d\d:\d\d)$/.test(publisher)||!Number.isFinite(Date.parse(publisher)))return null;const end=shift(day,-1);return {start:shift(end,-6),end,days:7,possibleReturns:6};}
    const published = String(report?.sourceUpdatedAt || '').slice(0, 10);
    if (!validDay(published)) return null;
    let end = validDay(report.lastCompleteDay) && report.lastCompleteDay <= published ? report.lastCompleteDay : report.latest?.partial === false ? published : shift(published, -1);
    if (report.latest?.partial !== false && end === published) end = shift(published, -1);
    return { start: shift(end, -6), end, days: 7, possibleReturns: 6 };
  }
  function dailyVolatility(history, window) {
    if (!window) return { value: null, returns: 0, days: 0 };
    const prices = new Map(), conflicts = new Set();
    for (const point of Array.isArray(history) ? history : []) {
      if (!Array.isArray(point) || !validDay(point[0]) || point[0] < window.start || point[0] > window.end || !positive(point[1]) || !Number.isFinite(point[2]) || point[2] < 5) continue;
      const prior = prices.get(point[0]); if (prior && (prior.price !== point[1] || prior.count !== point[2])) conflicts.add(point[0]);
      else prices.set(point[0], { price: point[1], count: point[2] });
    }
    for (const day of conflicts) prices.delete(day);
    let n = 0, mean = 0, squares = 0;
    for (let day = shift(window.start, 1); day <= window.end; day = shift(day, 1)) {
      const before = prices.get(shift(day, -1)), after = prices.get(day); if (!before || !after) continue;
      const change = Math.log(after.price) - Math.log(before.price); if (!Number.isFinite(change)) continue;
      ++n; const delta = change - mean; mean += delta / n; squares += delta * (change - mean);
    }
    const sigma = n >= 5 ? Math.sqrt(Math.max(0, squares / (n - 1))) * 100 : null;
    return { value: Number.isFinite(sigma) ? sigma : null, returns: n, days: prices.size, start: window.start, end: window.end };
  }
  function rankCohort(rows, bySlug) {
    const unique = new Set((rows || []).filter(row => row && /^[a-z0-9][a-z0-9-]*$/.test(row.slug)).map(row => row.slug));
    const sorted = [...unique].map(slug => bySlug.get(slug)).filter(row => row && Number.isFinite(row.value) && row.value >= 0).sort((a, b) => b.value - a.value || a.slug.localeCompare(b.slug));
    const values = new Map(); let rank = 0, prior;
    sorted.forEach((row, index) => { if (index === 0 || row.value !== prior) rank = index + 1; prior = row.value; values.set(row.slug, { ...row, rank }); });
    return { values, eligible: sorted.length, total: unique.size };
  }
  function legacyModel(report) {
    const window = sourceWindow(report); if (!window) return null;
    const cash = new Map(), goods = new Map();
    const accept = (map, row) => {
      if (!row || !/^[a-z0-9][a-z0-9-]*$/.test(row.slug) || typeof row.name !== 'string' || !row.name.trim()) return;
      const old = map.get(row.slug); if (!old || !old.history?.length && row.history?.length) map.set(row.slug, row);
    };
    for (const row of report.cashCatalog?.rows || []) if (row.category === 'Cash Shop') accept(cash, row);
    for (const row of [...(report.cash || []), ...(report.cashBasket?.rows || [])]) accept(cash, row);
    for (const row of [...(report.rows || []), ...(report.contextItems || [])]) if (row.category !== 'Cash Shop') accept(goods, row);
    const describe = row => ({ slug: row.slug, name: row.name, category: row.category, ...dailyVolatility(row.history, window) });
    const cashItems = [...cash.values()].map(describe), goodsItems = [...goods.values()].map(describe), bySlug = new Map([...cashItems, ...goodsItems].map(row => [row.slug, row]));
    const categories = (report.categories || []).map(category => {
      const members = (report.rows || []).filter(row => row.category === category.name), qualified = members.map(row => bySlug.get(row.slug)).filter(row => row?.value !== null && row?.value !== undefined).sort((a, b) => a.value - b.value);
      const middle = Math.floor(qualified.length / 2), value = qualified.length ? qualified.length % 2 ? qualified[middle].value : (qualified[middle - 1].value + qualified[middle].value) / 2 : null;
      return { name: category.name, value, eligible: qualified.length, total: members.length, kind: 'median_member_volatility' };
    });
    const winner = items => [...items].filter(row => row.value !== null).sort((a, b) => b.value - a.value || a.slug.localeCompare(b.slug))[0] || null;
    let nxRows = report.cash || []; try { if (typeof windowThis.buildCashPricing === 'function') nxRows = windowThis.buildCashPricing(report).rows; } catch { /* Retained cash rows still define a bounded fallback cohort. */ }
    return { window, cashItems, goodsItems, bySlug, categories, cohorts: { goods: rankCohort(report.rows, bySlug), nx: rankCohort(nxRows, bySlug), catalog: rankCohort(report.cashCatalog?.rows, bySlug) }, cashWinner: winner(cashItems), goodsWinner: winner(goodsItems), sourceUpdatedAt: report.sourceUpdatedAt };
  }
  function model(report) {
    if(!report?.apiCalculationView)return legacyModel(report);
    const view=report.apiCalculationView,window=sourceWindow(report);if(!window)return null;
    const items=Array.isArray(report.apiDailyItems)?report.apiDailyItems:[],ids=new Set(),slugs=new Set(),api=[];
    if(items.length!==79||items.filter(r=>r?.role==='goods').length!==50||items.filter(r=>r?.role==='cash').length!==29)return null;
    for(const row of items){if(!row||!Number.isSafeInteger(row.itemId)||row.itemId<1||ids.has(row.itemId)||typeof row.slug!=='string'||!/^[a-z0-9][a-z0-9-]*$/.test(row.slug)||slugs.has(row.slug)||!['goods','cash'].includes(row.role)||!Array.isArray(row.points)||row.points.length>31)return null;ids.add(row.itemId);slugs.add(row.slug);
      const seen=new Set();let duplicate=false;const history=[];for(const p of row.points){if(!p||!validDay(p.day))continue;if(seen.has(p.day)){duplicate=true;break;}seen.add(p.day);if(p.qualified!==true||p.partialCalendarDay!==false||!Number.isSafeInteger(p.recordedSalesCount)||p.recordedSalesCount<5)continue;const price=row.role==='goods'?p.linkedPrice:typeof p.medianUnitPriceLexeme==='string'?Number(p.medianUnitPriceLexeme):null;if(positive(price))history.push([p.day,price,p.recordedSalesCount]);}
      const base=(report.rows||[]).find(r=>r.slug===row.slug);if(row.role==='goods'&&!base)return null;
      const usedDays=new Set((duplicate?[]:history).filter(p=>p[0]>=window.start&&p[0]<=window.end).map(p=>p[0]));
      const originalReceipts=row.points.filter(p=>usedDays.has(p?.day)&&typeof p.source?.capturedAt==='string'&&Number.isFinite(Date.parse(p.source.capturedAt))).map(p=>p.source.capturedAt).sort((a,b)=>Date.parse(a)-Date.parse(b));
      api.push({slug:row.slug,name:row.name,category:row.role==='goods'?base.category:'Cash Shop',role:row.role,history:duplicate?[]:history,originalReceipts});
    }
    const describe=row=>({slug:row.slug,name:row.name,category:row.category,oldestOriginalReceipt:row.originalReceipts[0]??null,newestOriginalReceipt:row.originalReceipts.at(-1)??null,...dailyVolatility(row.history,window)}),cashItems=api.filter(r=>r.role==='cash').map(describe),goodsItems=api.filter(r=>r.role==='goods').map(describe),bySlug=new Map([...cashItems,...goodsItems].map(r=>[r.slug,r]));
    const categories=(report.categories||[]).map(category=>{const members=(report.rows||[]).filter(r=>r.category===category.name),qualified=members.map(r=>bySlug.get(r.slug)).filter(r=>Number.isFinite(r?.value)).sort((a,b)=>a.value-b.value),middle=Math.floor(qualified.length/2);return {name:category.name,value:qualified.length?qualified.length%2?qualified[middle].value:(qualified[middle-1].value+qualified[middle].value)/2:null,eligible:qualified.length,total:members.length,kind:'median_member_volatility'};});
    const winner=rows=>[...rows].filter(r=>Number.isFinite(r.value)).sort((a,b)=>b.value-a.value||a.slug.localeCompare(b.slug))[0]||null;
    const {apiCalculationView:_view,apiDailyItems:_items,...legacyReport}=report;
    legacyReport.sourceUpdatedAt=report.cashCatalog?.sourceUpdatedAt||view.clocks?.legacyDaily;delete legacyReport.lastCompleteDay;legacyReport.latest={...report.latest,partial:true};
    const legacy=legacyModel(legacyReport),catalog=legacy?.cohorts.catalog||rankCohort(report.cashCatalog?.rows,new Map());
    return {basis:'api_actual_daily',window,cashItems,goodsItems,bySlug,categories,cohorts:{goods:rankCohort(report.rows,bySlug),nx:rankCohort(api.filter(r=>r.role==='cash'),bySlug),catalog},cashWinner:winner(cashItems),goodsWinner:winner(goodsItems),sourceUpdatedAt:view.clocks.dailyPublisher,dailyCapturedAt:view.clocks.dailyCapture,catalogWindow:legacy?.window??null,legacyCatalogPublished:legacyReport.sourceUpdatedAt};
  }
  const windowThis = window;
  window.AstraVolatilityPreview = Object.freeze({ sourceWindow, dailyVolatility, model, rankCohort });
  const options = document.getElementById('display-options'); if (!options) return;
  const make = (tag, text, className) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; };
  const key = 'astra-volatility-preview-v1', categoryKey = 'astra-category-member-volatility-v1', cashKey = 'astra-cash-volatility-badges-v1', tableKey = 'astra-volatility-tables-v1'; let enabled = true, categoryEnabled = false, cashEnabled = false, tablesEnabled = true, report, current, scheduled = false, lastCatalogKey;
  try { enabled = localStorage.getItem(key) !== 'off'; } catch { /* The display remains usable in this tab. */ }
  try { categoryEnabled = localStorage.getItem(categoryKey) === 'on'; } catch { /* Category member badges default off. */ }
  try { cashEnabled = localStorage.getItem(cashKey) === 'on'; } catch { /* Item-card badges default off. */ }
  try { tablesEnabled = localStorage.getItem(tableKey) !== 'off'; } catch { /* Table columns default on. */ }
  const controls = make('div', undefined, 'hero-layout-options volatility-preview-options'); controls.dataset.previewControls = ''; controls.setAttribute('role', 'group'); controls.setAttribute('aria-label', 'Daily price volatility preview');
  const toggle = make('button'), categoryToggle = make('button'), cashToggle = make('button'), tableToggle = make('button'); toggle.type = categoryToggle.type = cashToggle.type = tableToggle.type = 'button'; categoryToggle.dataset.categoryVolatility = ''; categoryToggle.setAttribute('aria-controls', 'category-cards');cashToggle.dataset.cashVolatility = '';cashToggle.setAttribute('aria-controls','cash-item-highlights');tableToggle.dataset.tableVolatility = '';tableToggle.setAttribute('aria-controls','basket-table cash-table view-cash-catalog');
  const scopeNote=make('small', 'Independent display choices. 7-day window; daily medians, not individual trades. Category labels summarize member volatilities, not category-index volatility.');controls.append(toggle, categoryToggle, cashToggle, tableToggle, scopeNote); options.append(controls);
  const scopes = '#category-cards,#cash-item-highlights,#market-highlights-track,#highlights-fact-grid,#basket-table,#cash-table';
  const observer = new MutationObserver(records => {
    if (!current || scheduled || !(enabled || categoryEnabled || cashEnabled || tablesEnabled)) return;
    const relevant = records.some(record => { const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
      return target?.closest(scopes) || [...record.addedNodes].some(node => node.nodeType === 1 && (node.matches(scopes) || node.querySelector(scopes))); });
    if (relevant) { scheduled = true; queueMicrotask(() => { scheduled = false; decorate(); }); }
  });
  const watch = () => observer.observe(document.body, { childList: true, subtree: true });
  const owned = node => { node.dataset.volatilityOwned = ''; return node; };
  const failedMegaphoneSprites = new Map();
  const percent = value => value === null || value === undefined ? 'Unavailable' : value.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
  const tableStates = new Map(), tableBases = new WeakMap();
  const tableRows = (table, kind) => [...(table.tBodies[0]?.rows || [])].filter(row => kind === 'nx' ? row.dataset.cashItem : row.cells[0]?.querySelector('[data-item]'));
  const tableSlug = (row, kind) => kind === 'nx' ? row.dataset.cashItem : row.cells[0]?.querySelector('[data-item]')?.dataset.item;
  function tableTitle(cohort, kind) {
    return `${current.basis==='api_actual_daily'?'API actual daily medians · ':''}${current.window.start}–${current.window.end}: sample SD of consecutive qualified daily-median log returns × 100; minimum five of six returns, no missing-day bridge or annualization. Rank 1 is highest volatility, not best trading value. ${cohort.eligible} eligible / ${cohort.total} ${kind === 'goods' ? 'fixed goods-basket' : 'fixed-NX cash'} items before search/filter. Ranking uses unrounded values; exact ties share a competition rank.${current.basis==='api_actual_daily'?` Partial UTC source days excluded. Daily receipt ${capture(current.dailyCapturedAt)}; reported sales counts are not units; quality is mixed/unknown. Current 3-day reference is separate.`:''}`;
  }
  function sortRows(table, kind, state) {
    const cohort = current.cohorts[kind], rows = tableRows(table, kind), key = state.key === 'rank' ? 'rank' : 'value';
    const ordered = rows.map((row, order) => ({ row, order, value: cohort.values.get(tableSlug(row, kind))?.[key] ?? null })).sort((a, b) => a.value === null ? b.value === null ? a.order - b.order : 1 : b.value === null ? -1 : (a.value - b.value) * (state.ascending ? 1 : -1) || a.order - b.order);
    if (ordered.some((entry, i) => entry.row !== rows[i])) table.tBodies[0].append(...ordered.map(entry => entry.row));
    for (const header of table.tHead.rows[0].cells) { const active = header.dataset.volatilityColumn === state.key; header.setAttribute('aria-sort', active ? state.ascending ? 'ascending' : 'descending' : 'none'); const button = header.querySelector('[data-volatility-sort]'); if (button) { const label = button.dataset.volatilitySort === 'value' ? '7-day daily price volatility' : 'Volatility rank', text = label + (active ? state.ascending ? ' ↑' : ' ↓' : ''); if (button.textContent !== text) button.textContent = text; } }
  }
  function decorateTables() {
    for (const [selector, kind] of [['#basket-table > table', 'goods'], ['#cash-table > table', 'nx']]) {
      const table = document.querySelector(selector); if (!table?.tHead?.rows[0] || !table.tBodies[0]) continue;
      table.dataset.volatilityTable = kind;
      if (!tablesEnabled || !current) {
        for (const node of table.querySelectorAll('[data-volatility-column]')) node.remove();
        for (const cell of table.querySelectorAll('[data-volatility-base-span]')) { cell.colSpan = Number(cell.dataset.volatilityBaseSpan); delete cell.dataset.volatilityBaseSpan; }
        const base = tableBases.get(table); if (tableStates.has(kind) && base && base.rows.every(row => row.parentElement === table.tBodies[0])) { table.tBodies[0].append(...base.rows); for (const [header, value] of base.headers) value === null ? header.removeAttribute('aria-sort') : header.setAttribute('aria-sort', value); }
        continue;
      }
      const cohort = current.cohorts[kind], title = tableTitle(cohort, kind), headers = table.tHead.rows[0];
      if (!tableBases.has(table) || !tableStates.has(kind)) tableBases.set(table, { rows: tableRows(table, kind), headers: [...headers.cells].filter(h => !h.dataset.volatilityColumn).map(h => [h, h.getAttribute('aria-sort')]) });
      for (const [key, label] of [['value', '7-day daily price volatility'], ['rank', 'Volatility rank']]) {
        let header = [...headers.cells].find(cell => cell.dataset.volatilityColumn === key);
        if (!header) { header = make('th', undefined, 'volatility-table-heading'); header.dataset.volatilityColumn = key; header.scope = 'col'; header.setAttribute('aria-sort', 'none'); const button = make('button', label); button.type = 'button'; button.dataset.volatilitySort = key; header.append(button); headers.append(header); }
        header.title = title;
        if (!tableStates.has(kind)) { header.setAttribute('aria-sort','none'); const button=header.querySelector('button'); if(button.textContent!==label)button.textContent=label; }
      }
      for (const row of table.tBodies[0].rows) if (row.cells.length === 1 && row.cells[0].colSpan > 1) { const cell = row.cells[0]; if (!cell.dataset.volatilityBaseSpan) cell.dataset.volatilityBaseSpan = String(cell.colSpan); cell.colSpan = Number(cell.dataset.volatilityBaseSpan) + 2; }
      for (const row of tableRows(table, kind)) {
        const point = cohort.values.get(tableSlug(row, kind));
        for (const key of ['value', 'rank']) {
          let cell = [...row.cells].find(td => td.dataset.volatilityColumn === key); if (!cell) { cell = make('td', undefined, 'volatility-table-cell'); cell.dataset.volatilityColumn = key; row.append(cell); }
          const text = point ? key === 'value' ? `${percent(point.value)} · ${point.returns}/6 returns` : `#${point.rank} of ${cohort.eligible} eligible / ${cohort.total} items` : 'Unavailable';
          if (cell.textContent !== text) cell.textContent = text; cell.dataset.sortValue = point ? String(point[key]) : ''; cell.title = title+(current.basis==='api_actual_daily'&&point?` Original used daily receipt range ${capture(point.oldestOriginalReceipt)}–${capture(point.newestOriginalReceipt)}; not individual sale times.`:'');
        }
      }
      if (tableStates.has(kind)) sortRows(table, kind, tableStates.get(kind));
    }
  }
  function syncCatalog(force = false) {
    const cohort = current?.cohorts.catalog,window=current?.basis==='api_actual_daily'?current.catalogWindow:current?.window, detail = tablesEnabled && current && window ? { enabled: true, start: window.start, end: window.end, eligible: cohort.eligible, total: cohort.total,
      ...(current.basis==='api_actual_daily'?{sourceKind:'legacy_daily_catalog',sourcePublishedAt:current.legacyCatalogPublished}:{}),
      rows: [...cohort.values.values()].map(row => ({ slug: row.slug, value: row.value, rank: row.rank, returns: row.returns })) } : { enabled: false };
    const fingerprint = JSON.stringify(detail); if (!force && fingerprint === lastCatalogKey) return; lastCatalogKey = fingerprint;
    document.dispatchEvent(new CustomEvent('astracashcatalogvolatility', { detail }));
  }
  function badge(card, text, detail) { const label = owned(make('p', text, 'volatility-preview-badge')); label.title = detail; card.append(label); }
  function graphic(item, kind) {
    const root = make('span', undefined, 'market-highlight-graphic'), image = make('img', undefined, 'market-highlight-sprite'); image.alt = ''; image.width = image.height = 42; image.loading = 'lazy';
    const mapped = report.spriteMap?.[item.slug], local = typeof mapped === 'string' && /^assets\/[A-Za-z0-9._-]+\.(?:png|webp|gif|svg)$/.test(mapped), megaphone = /megaphone/.test(item.slug);
    const generic = () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 32 32'); svg.setAttribute('width', '42'); svg.setAttribute('height', '42'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'Generic megaphone icon; verified game sprite unavailable'); svg.classList.add('market-highlight-sprite', 'volatility-generic-megaphone');
      const title = document.createElementNS(svg.namespaceURI, 'title'); title.textContent = 'Original generic megaphone symbol, not a verified MapleStory item sprite'; svg.append(title);
      for (const [d, fill] of [['M5 12h7l14-7v21l-14-7H5Z', '#d8bc74'], ['M11 19h6l-2 9h-5Z', '#9b7953'], ['M5 13h6v5H5Z', '#a8d6d2']]) { const path = document.createElementNS(svg.namespaceURI, 'path'); path.setAttribute('d', d); path.setAttribute('fill', fill); path.setAttribute('stroke', '#34443b'); path.setAttribute('stroke-width', '1.5'); svg.append(path); }
      return svg;
    };
    const fallback = megaphone && (!local || /meso-pouch/.test(mapped) || failedMegaphoneSprites.get(item.slug) === mapped);
    if (!fallback) image.src = local ? mapped : `assets/${item.slug}.svg`;
    image.addEventListener('error', () => { if (megaphone) { failedMegaphoneSprites.set(item.slug, mapped); image.replaceWith(generic()); } else if (image.getAttribute('src') === 'assets/meso-pouch.png') image.hidden = true; else image.src = 'assets/meso-pouch.png'; });
    const copy = make('span', undefined, 'market-highlight-copy'), title = make('span', undefined, 'market-highlight-title-line'), value = make('span', undefined, 'market-highlight-value-line');
    title.append(make('strong', current.basis==='api_actual_daily'?kind==='cash'?'Most volatile fixed-NX cash item':'Most volatile goods-basket item':kind === 'cash' ? 'Most volatile cash item' : 'Most volatile goods item', 'market-highlight-kind'), make('span', item.name, 'market-highlight-headline'));
    value.append(make('strong', `${percent(item.value)} daily price volatility`, 'market-highlight-value'));
    copy.append(title, value, make('small', `${current.basis==='api_actual_daily'?'API actual daily · ':''}${current.window.start}–${current.window.end} · ${item.returns} consecutive daily returns · medians, not individual trades${current.basis==='api_actual_daily'?` · original daily receipt range ${capture(item.oldestOriginalReceipt)}–${capture(item.newestOriginalReceipt)}`:''}`, 'market-highlight-dates'));
    if (fallback) copy.append(make('small', 'Generic megaphone icon', 'volatility-icon-note'));
    root.append(fallback ? generic() : image, copy); return root;
  }
  function highlight(item, kind, duplicate, panel) {
    const card = owned(make(panel ? 'article' : 'li', undefined, panel ? 'panel highlights-fact volatility-preview-highlight' : 'market-highlight volatility-preview-highlight'));
    card.dataset.highlightType = 'volatility-' + kind;
    const link = make(duplicate ? 'span' : 'a');
    if (!duplicate) { const known = [...(report.rows || []), ...(report.cash || []), ...(report.contextItems || [])].some(row => row.slug === item.slug); link.href = known ? '#item/' + encodeURIComponent(item.slug) : '#cash-catalog'; }
    link.setAttribute('aria-label', `Highest observed daily price volatility in ${current.basis==='api_actual_daily'?kind==='cash'?'the fixed 29 NX-cost API cash cohort':'the fixed 50 API goods basket':kind === 'cash' ? 'the captured cash catalog' : 'the captured goods-basket/context cohort (source-category scope)'}: ${item.name}; ${percent(item.value)}; ${current.window.start}–${current.window.end}; ${item.returns} daily returns.`);
    link.title = 'Sample standard deviation of consecutive qualified daily-median log returns × 100. Minimum five returns; no annualization. Ranking is limited to the captured cohort.';
    link.append(graphic(item, kind)); card.append(link); return card;
  }
  function decorate() {
    observer.disconnect();
    try {
      for (const node of document.querySelectorAll('[data-volatility-owned]')) node.remove();
      toggle.textContent = 'Volatility highlights: ' + (enabled ? 'On' : 'Off'); toggle.setAttribute('aria-pressed', String(enabled));
      categoryToggle.textContent = 'Category member volatility: ' + (categoryEnabled ? 'On' : 'Off'); categoryToggle.setAttribute('aria-pressed', String(categoryEnabled));
      cashToggle.textContent = 'Cash-card volatility: ' + (cashEnabled ? 'On' : 'Off'); cashToggle.setAttribute('aria-pressed', String(cashEnabled));
      tableToggle.textContent = 'Volatility table columns: ' + (tablesEnabled ? 'On' : 'Off'); tableToggle.setAttribute('aria-pressed', String(tablesEnabled));
      scopeNote.textContent=current?.basis==='api_actual_daily'?`API actual daily medians: fixed 50 goods / 29 fixed-NX cash items, complete UTC source days only. Current 3-day reference is separate. Latest overview receipt ${capture(current.dailyCapturedAt)}. Broader cash-catalog volatility remains the separate legacy daily source${current.catalogWindow?` (${current.catalogWindow.start}–${current.catalogWindow.end}; published ${capture(current.legacyCatalogPublished)})`:': unavailable'}. Category labels summarize member volatilities, not category-index volatility.`:'Independent display choices. 7-day window; daily medians, not individual trades. Category labels summarize member volatilities, not category-index volatility.';
      decorateTables(); syncCatalog();
      if (!current) return;
      const dates = `${current.basis==='api_actual_daily'?'API actual daily basis; partial source days excluded. ':''}${current.window.start}–${current.window.end}; up to six within-window returns. Each daily median needs at least five recorded source sales. No missing-day bridge or carry-forward. Sample SD of daily log returns × 100; not annualized.${current.basis==='api_actual_daily'?` Daily receipt ${capture(current.dailyCapturedAt)}; reported sale counts not physical units; no constant stat/quality history is inferred.`:''}`;
      for (const card of categoryEnabled ? document.querySelectorAll('.category-card') : []) {
        const name = card.querySelector('[data-category]')?.dataset.category, category = current.categories.find(row => row.name === name); if (!category) continue;
        badge(card, `7-day median member volatility: ${percent(category.value)} · ${category.eligible}/${category.total} items`, `${dates} Unweighted median of sufficiently sampled member volatilities; this is not the category index's volatility.`);
      }
      for (const card of cashEnabled ? document.querySelectorAll('.cash-highlight-card[data-cash-highlight-slug]') : []) {
        const item = current.bySlug.get(card.dataset.cashHighlightSlug);
        badge(card, `7-day daily price volatility: ${percent(item?.value)}${item ? ' · ' + item.returns + '/6 returns' : ''}`, `${dates} This fixed daily window is independent of the cash table's rolling/lookback selection. Fewer than five returns is unavailable, not zero.`);
      }
      for (const [kind, item] of enabled ? [['cash', current.cashWinner], ['goods', current.goodsWinner]] : []) {
        if (!item) continue;
        for (const list of document.querySelectorAll('#market-highlights-track .market-highlights-list')) list.append(highlight(item, kind, list.getAttribute('aria-hidden') === 'true', false));
        document.getElementById('highlights-fact-grid')?.append(highlight(item, kind, false, true));
      }
    } finally { watch(); }
  }
  const calculate = () => { current = report && (enabled || categoryEnabled || cashEnabled || tablesEnabled) ? model(report) : null; decorate(); };
  toggle.addEventListener('click', () => { enabled = !enabled; try { localStorage.setItem(key, enabled ? 'on' : 'off'); } catch {} calculate(); });
  categoryToggle.addEventListener('click', () => { categoryEnabled = !categoryEnabled; try { localStorage.setItem(categoryKey, categoryEnabled ? 'on' : 'off'); } catch {} calculate(); });
  cashToggle.addEventListener('click', () => { cashEnabled = !cashEnabled; try { localStorage.setItem(cashKey, cashEnabled ? 'on' : 'off'); } catch {} calculate(); });
  tableToggle.addEventListener('click', () => { tablesEnabled = !tablesEnabled; try { localStorage.setItem(tableKey, tablesEnabled ? 'on' : 'off'); } catch {} calculate(); if (!tablesEnabled) tableStates.clear(); });
  document.addEventListener('click', event => {
    const button = event.target.closest?.('[data-volatility-sort]'); if (!button) return; const table = button.closest('table'), kind = table?.dataset.volatilityTable; if (!current || !['goods', 'nx'].includes(kind)) return;
    const old = tableStates.get(kind), key = button.dataset.volatilitySort; tableStates.set(kind, { key, ascending: old?.key === key ? !old.ascending : key === 'rank' }); decorate();
  });
  document.addEventListener('click', event => { if(event.target.closest?.('button[data-cash-best-value],button[data-cash-side]'))tableStates.delete('nx');const header = event.target.closest?.('th'); if (!header || !event.target.closest('button') || event.target.closest('[data-volatility-sort]')) return; const kind = header.closest('table')?.dataset.volatilityTable; if (kind) tableStates.delete(kind); }, true);
  document.addEventListener('astracashcatalogcolumnsready', () => syncCatalog(true));
  document.addEventListener('astramarketsnapshot', event => { if (event.detail && typeof event.detail === 'object') { report = event.detail; calculate(); } });
  document.addEventListener('change',event=>{if(event.target?.id==='display-timezone')calculate();});
  decorate(); document.dispatchEvent(new Event('astramarkethighlightsready'));
})();
