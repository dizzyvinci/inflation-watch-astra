(() => {
  'use strict';
  if (document.getElementById('cash-item-highlights')) return;
  const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
  const day = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
  function model(report) {
    const basket = report?.cashBasket, sourceDay = String(basket?.sourceUpdatedAt || report?.sourceUpdatedAt || '').slice(0, 10);
    if (basket?.status !== 'ok' || !Array.isArray(basket.rows) || !Array.isArray(report?.cash)
        || !day(basket.baseStart) || !day(basket.baseEnd) || basket.baseStart > basket.baseEnd || !day(sourceDay)) return null;
    const partialSourceDay = basket.latest?.partial === true || report.latest?.partial === true;
    const schedule = new Map(report.cash.filter(row => row && typeof row.slug === 'string' && positive(row.nx)).map(row => [row.slug, row.nx]));
    const seen = new Set(), candidates = basket.rows.filter(row => {
      if (!row || typeof row.name !== 'string' || !row.name.trim() || !/^[a-z0-9][a-z0-9-]*$/.test(row.slug)
          || seen.has(row.slug) || !positive(row.basePrice) || !positive(row.weight) || !positive(row.baseExpenditure)
          || !positive(row.nx) || schedule.get(row.slug) !== row.nx) return false;
      seen.add(row.slug); return true;
    }).sort((a, b) => b.weight - a.weight || b.baseExpenditure - a.baseExpenditure || a.slug.localeCompare(b.slug)).slice(0, 5);
    const cards = candidates.map(row => {
      const qualified = row.missingSource !== true && positive(row.price) && day(row.priceDay) && row.priceDay <= sourceDay
        && Number.isSafeInteger(row.quantity) && row.quantity >= 5;
      const ratio = qualified ? row.price / row.basePrice : null, index = ratio === null ? null : ratio * 100;
      const valid = positive(index);
      return Object.freeze({ slug: row.slug, name: row.name, nx: row.nx, weight: row.weight,
        basePrice: row.basePrice, price: valid ? row.price : null, priceDay: valid ? row.priceDay : null,
        quantity: valid ? row.quantity : null, index: valid ? index : null, change: valid ? index - 100 : null,
        carried: valid && row.priceDay < sourceDay, partial: valid && row.priceDay === sourceDay && partialSourceDay });
    });
    return Object.freeze({ baseStart: basket.baseStart, baseEnd: basket.baseEnd,
      sourceUpdatedAt: basket.sourceUpdatedAt || report.sourceUpdatedAt, sourceDay, partialSourceDay,
      basketHash: basket.basketHash || null, cards: Object.freeze(cards) });
  }
  function scale(values = []) {
    const highest = Math.max(200, ...(Array.isArray(values) ? values : []).filter(value => positive(value)));
    const padded = highest === 200 ? 200 : highest <= Number.MAX_VALUE / 1.1 ? highest * 1.1 : highest;
    const step = 10 ** Math.floor(Math.log10(padded)) / 2, rounded = Math.ceil(padded / step) * step;
    return Number.isFinite(rounded) ? Math.max(highest, rounded) : highest;
  }
  function bestModel(report, selection = {}) {
    if (!report || typeof window.buildCashPricing !== 'function') return null;
    const options = { days: selection.days, evidence: selection.evidence, side: 'buy' };
    const pricing = window.buildCashPricing(report, options);
    if (!Array.isArray(pricing?.rows)) return null;
    const eligible = pricing.rows.filter(row => row && /^[a-z0-9][a-z0-9-]*$/.test(row.slug) && typeof row.name === 'string'
      && positive(row.nx) && positive(row.price) && positive(row.rate) && positive(row.referenceWeight)
      && positive(row.quantity) && positive(row.windowDays) && row.missing !== true && !row.referenceExclusion);
    const compare = (a, b) => a.rate - b.rate || a.name.localeCompare(b.name) || a.slug.localeCompare(b.slug);
    const fees=window.AstraTradeFees,feeState=fees?.getState(),feeActive=!!fees&&feeState.mode!=='gross',grossFallback=feeActive&&feeState.rules?.[feeState.mode]?.enabled!==true,netRanking=feeActive&&!grossFallback;
    const chosen=side=>netRanking?fees.rank(eligible,side).slice(0,5).map(row=>({...row,grossRate:row.rate,rate:row.netRate})):(side==='buy'?[...eligible].sort(compare):[...eligible].sort((a,b)=>b.rate-a.rate||a.name.localeCompare(b.name)||a.slug.localeCompare(b.slug))).slice(0,5);
    const buy=chosen('buy'),sell=chosen('sell');
    return { ...pricing, buy, sell, feeActive,grossFallback,netRanking,feeMode:feeState?.mode,feeReferences:netRanking?{buy:fees.reference(eligible,'buy'),sell:fees.reference(eligible,'sell')}:null,eligibleCount: eligible.length, totalCount: pricing.rows.length,
      sourceUpdatedAt: report.sourceUpdatedAt, capturedAt: report.rollingReference?.capturedAt || null };
  }
  function rateScale(values = []) {
    const highest = Math.max(1, ...values.filter(positive));
    const padded = highest <= Number.MAX_VALUE / 1.1 ? highest * 1.1 : highest;
    const step = 10 ** Math.floor(Math.log10(padded)) / 2, rounded = Math.ceil(padded / step) * step;
    return Number.isFinite(rounded) ? Math.max(highest, rounded) : highest;
  }
  window.AstraCashHighlights = Object.freeze({ model, scale, bestModel, rateScale });
  const view = document.getElementById('view-index'); if (!view) return;
  const make = (tag, text, className) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; };
  const number = (value, decimals = 1) => Number.isFinite(value) ? value >= 1e6 ? value.toExponential(2).replace('e+', 'e') : value.toLocaleString('en-US', { maximumFractionDigits: decimals }) : 'Unavailable';
  const signed = value => { const rounded = Math.abs(value) < .05 ? 0 : value; return (rounded > 0 ? '+' : '') + number(rounded) + '%'; };
  const section = make('section', undefined, 'cash-item-highlights'); section.id = 'cash-item-highlights'; section.setAttribute('aria-labelledby', 'cash-highlights-title');
  section.innerHTML = '<div class="section-heading"><div><p class="eyebrow">CASH COMPANION / INDIVIDUAL ITEM PRICES</p><h2 id="cash-highlights-title">Inside cash items</h2></div></div><div class="cash-highlights-content"><p class="cash-highlights-explanation">These individual cash-item dials are excluded from the goods MPI and the goods-based NX benchmark. Seasonal supply, demand and cosmetic mixes can move them separately.</p><p class="cash-highlights-status" role="status"></p><div class="cash-highlights-row" tabindex="0" role="region" aria-label="Individual cash-item price dials; scroll horizontally on narrow screens"></div><p class="cash-highlights-method"></p></div>';
  const controls = make('div', undefined, 'cash-highlights-controls'); controls.dataset.previewControls = 'true';
  controls.setAttribute('role', 'group'); controls.setAttribute('aria-label', 'Cash-item dial preview');
  controls.append(make('span', 'Cash-item dials'));
  const key = 'astra-cash-highlights-v1', modeKey = 'astra-cash-highlights-mode-v1'; let enabled = true, mode = 'best', report = null;
  try { enabled = localStorage.getItem(key) !== 'off'; } catch { /* The requested preview default remains On. */ }
  try { if (localStorage.getItem(modeKey) === 'reference') mode = 'reference'; } catch { /* Best-value default remains usable. */ }
  const toggle = make('button'); toggle.type = 'button'; toggle.setAttribute('aria-controls', 'cash-highlights-content');
  section.querySelector('.cash-highlights-content').id = 'cash-highlights-content';
  controls.append(toggle);
  for (const [value, label] of [['best', 'Best to buy / sell'], ['reference', 'Reference-week prices']]) {
    const button = make('button', label); button.type = 'button'; button.dataset.cashHighlightsMode = value; button.setAttribute('aria-controls', 'cash-highlights-content');
    button.addEventListener('click', () => { mode = value; try { localStorage.setItem(modeKey, mode); } catch {} draw(); }); controls.append(button);
  }
  controls.append(make('small', 'Display only · saved in this browser. No basket or price calculation changes.')); section.append(controls);
  const goods = document.getElementById('category-section'); if (goods?.parentElement === view) goods.after(section); else view.append(section);
  let serial = 0;
  const cardsRoot = section.querySelector('.cash-highlights-row');
  function gauge(index, upper, name, reference = 100, isRate = false) {
    const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
    const add = (tag, attributes, parent = svg) => { const node = document.createElementNS(ns, tag); for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value)); parent.append(node); return node; };
    svg.classList.add('cash-highlight-gauge'); svg.setAttribute('viewBox', '0 0 140 88'); svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', isRate ? `${name}: ${number(index, 2)} mesos per NX; selected-evidence reference ${number(reference, 2)}; shared scale 0 to ${number(upper, 0)} mesos per NX. Cash-item estimate, not the goods-based model benchmark.` : `${name} price index ${number(index)}; reference week 100; shared scale 0 to ${number(upper, 0)}. Individual cash price, not the goods MPI or an NX rate.`);
    svg.dataset.index = index; svg.dataset.scaleMax = upper;
    svg.dataset.reference = reference; svg.dataset.unit = isRate ? 'mesos_per_nx' : 'price_index';
    const gradientId = 'cash-highlight-gradient-' + (++serial), defs = add('defs', {}), gradient = add('linearGradient', { id: gradientId, gradientUnits: 'userSpaceOnUse', x1: 18, y1: 66, x2: 122, y2: 66 }, defs);
    for (const [offset, color] of [[0, '#40c9d6'], [.5, '#f3d44a'], [.8, '#ed8a37'], [1, '#ef5350']]) add('stop', { offset, 'stop-color': color }, gradient);
    const point = (value, radius = 52) => { const angle = -Math.PI + value / upper * Math.PI; return [70 + radius * Math.cos(angle), 66 + radius * Math.sin(angle)]; };
    const [bx, by] = point(index), [x, y] = point(index, 43), [rx1, ry1] = point(reference, 46), [rx2, ry2] = point(reference, 58), [tx, ty] = point(reference, 65);
    add('path', { class: 'cash-highlight-arc-backplate', d: 'M18 66A52 52 0 0 1 122 66', fill: 'none', 'stroke-width': 12 });
    add('path', { class: 'cash-highlight-arc-track', d: 'M18 66A52 52 0 0 1 122 66', fill: 'none', 'stroke-width': 8 });
    add('path', { class: 'cash-highlight-value-arc', d: `M18 66A52 52 0 0 1 ${bx} ${by}`, fill: 'none', stroke: `url(#${gradientId})`, 'stroke-width': 8, 'data-end-value': index });
    add('line', { class: 'cash-highlight-reference', x1: rx1, y1: ry1, x2: rx2, y2: ry2, stroke: '#e3e4d6', 'stroke-width': 2 });
    add('line', { class: 'cash-highlight-needle', x1: 70, y1: 66, x2: x, y2: y, stroke: '#e3e4d6', 'stroke-width': 2 });
    add('circle', { class: 'cash-highlight-pivot', cx: 70, cy: 66, r: 4, fill: '#e3e4d6' });
    add('text', { x: Math.max(12, Math.min(128, tx)), y: Math.max(8, ty - 2), 'text-anchor': 'middle' }).textContent = number(reference);
    add('text', { x: 14, y: 84 }).textContent = '0'; add('text', { x: 126, y: 84, 'text-anchor': 'end' }).textContent = number(upper, 0);
    return svg;
  }
  function drawReference() {
    cardsRoot.className = 'cash-highlights-row';
    const current = model(report), row = cardsRoot; row.replaceChildren();
    if (!current || !current.cards.length) {
      section.querySelector('.cash-highlights-status').textContent = 'Individual cash dials are unavailable: a verified fixed NX schedule and frozen cash reference prices are required. Missing prices are not zero.';
      section.querySelector('.cash-highlights-method').textContent = ''; return;
    }
    const upper = scale(current.cards.map(card => card.index));
    section.querySelector('.cash-highlights-status').textContent = `Reference week ${current.baseStart}–${current.baseEnd} = 100 for each item. Daily source published ${current.sourceUpdatedAt}; latest source-calendar day ${current.sourceDay}${current.partialSourceDay ? ' is partial' : ''}.${report.sourceStatus?.status === 'degraded' ? ' Source checks are degraded; the dated retained prices remain visible.' : ''}`;
    for (const card of current.cards) {
      const article = make('article', undefined, 'cash-highlight-card'); article.dataset.cashHighlightSlug = card.slug;
      const heading = make('h3'), link = make('a'); link.href = '#item/' + encodeURIComponent(card.slug);
      const image = make('img'); image.alt = ''; image.width = 40; image.height = 40; image.loading = 'lazy';
      const mapped = report.spriteMap?.[card.slug]; image.src = typeof mapped === 'string' && /^assets\/[A-Za-z0-9._-]+\.(?:png|webp|gif|svg)$/.test(mapped) ? mapped : 'assets/' + card.slug + '.svg';
      link.append(image, make('span', card.name)); heading.append(link); article.append(heading);
      if (card.index !== null) {
        article.append(gauge(card.index, upper, card.name), make('strong', number(card.index), 'cash-highlight-index'), make('span', signed(card.change) + ' vs. reference week', 'cash-highlight-change'));
        article.append(make('p', `${card.carried ? 'Carried qualifying price' : 'Qualified daily price'} · ${card.priceDay}${card.partial ? ' · partial source day' : ''}`, 'cash-highlight-date'));
        article.append(make('p', `${number(card.price, 0)} mesos · ${number(card.quantity, 0)} recorded source count`, 'cash-highlight-price'));
        if (card.carried) article.append(make('small', 'Carried from its dated observation; not a fresh sale.'));
      } else article.append(make('p', 'Price index unavailable', 'cash-highlight-unavailable'), make('p', 'No valid dated price with at least five recorded sales.'));
      article.append(make('small', `${number(card.weight * 100)}% frozen cash-basket weight · fixed NX cost ${number(card.nx, 0)}`));
      row.append(article);
    }
    section.querySelector('.cash-highlights-method').textContent = 'Individual price index = 100 × latest qualifying daily median / frozen reference-week price. Reference prices are recorded-volume-weighted daily medians over that fixed week, not exact transaction averages. The five cards are selected by frozen cash-basket weight, then reference estimated expenditure and slug; current prices or turnover never rerank them. Counts are source-inferred, not independently verified trades. Each day needs at least five recorded sales; an older qualifying price can be carried with its date shown. This is daily-source history, not a resliced rolling scanner window. Dials share a scale of at least 200; 150 means 50% above that item’s reference price.';
  }
  function drawBest() {
    cardsRoot.className = 'cash-highlights-rankings'; cardsRoot.replaceChildren();
    const selection = { days: Number(document.getElementById('cash-lookback')?.value || 3), evidence: document.getElementById('cash-evidence')?.value || 'daily' };
    const current = bestModel(report, selection), status = section.querySelector('.cash-highlights-status'), method = section.querySelector('.cash-highlights-method');
    if (!current) { status.textContent = 'Best-value cash dials are unavailable until the cash-pricing table calculation is ready. No modelled benchmark is substituted.'; method.textContent = ''; return; }
    const evidenceWindow = current.rolling ? `Rolling scanner capture pulled ${current.capturedAt || 'at an unavailable time'}; item-specific windows, not a resliced lookback.` : `${current.days}-source-day lookback · ${current.start || 'Unknown'}–${current.end || 'Unknown'} inclusive${current.partial ? ' · latest day partial' : ''}. Daily source published ${current.sourceUpdatedAt || 'at an unavailable time'}.`;
    status.textContent = `${evidenceWindow} ${current.eligibleCount} / ${current.totalCount} fixed-price items have eligible evidence. ${current.eligibleCount < 5 ? 'Fewer than five eligible items; missing items are not filled.' : 'Up to five per side.'}${current.grossFallback?' Gross order shown; net unavailable until fee rules are set.':current.netRanking?' Fee scenario: '+window.AstraTradeFees.label()+'. Only computable assumed net/outlay values are ranked; no official fee rule is claimed.':''}`;
    const upper = rateScale([...current.buy, ...current.sell].map(row => row.rate).concat(positive(current.reference) ? current.reference : []));
    for (const [side, title, rows] of [['sell', 'Best to Sell (Higher Meso/NX)', current.sell], ['buy', 'Best to Buy (Lower Meso/NX)', current.buy]]) {
      const group = make('section', undefined, 'cash-highlights-ranking'); group.dataset.cashRanking = side;
      group.append(make('h3', title));group.dataset.cashRankingBasis=current.grossFallback?'gross_unset_fees':current.netRanking?'manual_net':'gross';if(current.grossFallback)group.append(make('span','Gross ranking · fees unset','cash-highlights-gross-badge'));
      const row = make('div', undefined, 'cash-highlights-row'); row.tabIndex = 0; row.setAttribute('role', 'region'); row.setAttribute('aria-label', `${title} cash dials; scroll horizontally on narrow screens`);
      for (const item of rows) {
        const card = make('article', undefined, 'cash-highlight-card'); card.dataset.cashHighlightSlug = item.slug; card.dataset.cashRate = item.rate; card.dataset.cashSide = side;if(item.grossRate!==undefined)card.dataset.cashGrossRate=item.grossRate;
        const heading = make('h4'), link = make('a'); link.href = '#item/' + encodeURIComponent(item.slug);
        const image = make('img'); image.alt = ''; image.width = 40; image.height = 40; image.loading = 'lazy';
        const mapped = report.spriteMap?.[item.slug]; image.src = typeof mapped === 'string' && /^assets\/[A-Za-z0-9._-]+\.(?:png|webp|gif|svg)$/.test(mapped) ? mapped : 'assets/' + item.slug + '.svg';
        link.append(image, make('span', item.name)); heading.append(link); card.append(heading);
        const selectedReference=current.feeReferences?.[side]??current.reference;
        if(item.rate>=0&&positive(selectedReference))card.append(gauge(item.rate,upper,item.name,selectedReference,true));
        card.append(make('strong', number(item.rate, 2), 'cash-highlight-index'), make('span', current.grossFallback?'Gross mesos/NX':current.netRanking?(side==='buy'?'scenario outlay mesos / NX':'scenario net mesos / NX'):'mesos / NX', 'cash-highlight-change'));
        if(current.netRanking)card.append(make('small',`Gross ${number(item.grossRate,2)} mesos / NX · ${item.feePreview.itemCount} copies · ${item.feePreview.assumptionProvenance==='user_reported'?'user-reported estimate':'manual estimate'}${item.feePreview.allocatedShopCost?' · allocated shop cost included':''}`));
        card.append(make('p', `${number(item.price, 1)} mesos · fixed ${number(item.nx, 0)} NX`, 'cash-highlight-price'));
        card.append(make('p', current.rolling ? `Pulled ${current.capturedAt || 'time unavailable'} · ${number(item.windowDays)}-day source window` : `Selected dates ${current.start}–${current.end} · ${number(item.windowDays, 0)} qualifying days`, 'cash-highlight-date'));
        card.append(make('small', `${number(item.quantity, 0)} recorded source count${item.windowDays < current.days && !current.rolling ? ' · incomplete daily coverage' : ''}`)); row.append(card);
      }
      if (!rows.length) row.append(make('p',current.feeActive?'Net/outlay ranking unavailable until eligible evidence and explicit manual assumptions are available. Gross view remains available.':'No eligible prices for this evidence window.','cash-highlight-unavailable'));
      const fullList = make('button', `View full ${side === 'sell' ? 'sell' : 'buy'} list`, 'cash-ranking-full-list'); fullList.type = 'button'; fullList.dataset.cashRankingLink = side;
      fullList.addEventListener('click', () => {
        // Use the table's existing native button, preserving its sorting and fee events.
        const sideButton = document.querySelector(`button[data-cash-side="${side}"]`);
        sideButton?.click(); window.location.hash = '#nx';
      });
      group.append(row, fullList); cardsRoot.append(group);
    }
    method.textContent = (current.grossFallback?'Gross order shown; net unavailable until fee rules are set. No zero-fee assumption is made. ':current.netRanking?'The selected fee scenario uses the same shared AstraTradeFees model as the NX table. No official rate is verified; buyer outlay and seller proceeds are separate, and fixed shop-cost allocation is an explicit business-cost assumption. ':'')+'Same fixed-NX schedule and selected evidence calculation as Best NX items to Buy/Sell. Daily estimates weight qualifying daily sale medians by recorded volume; each day needs at least five recorded sales. Rolling medians retain their own windows; excluded roll/upgrade-premium references are not ranked. Missing prices and unknown NX costs are excluded. Ranking uses all eligible items before table search/verdict filters: low mesos / NX for buying, high for selling, '+(current.netRanking?'under the selected explicit fee assumptions.':'before fees.')+' The dial tick is the selected-evidence cash reference, not 100 or the goods-based benchmark. These estimates are not executable quotes or profit calculations.';
  }
  function draw() {
    section.dataset.enabled = String(enabled); section.dataset.cashHighlightsMode = mode; section.querySelector('.cash-highlights-content').hidden = !enabled;
    toggle.setAttribute('aria-pressed', String(enabled)); toggle.textContent = enabled ? 'On · hide dials' : 'Off · show dials';
    for (const button of controls.querySelectorAll('[data-cash-highlights-mode]')) button.setAttribute('aria-pressed', String(button.dataset.cashHighlightsMode === mode));
    if (mode === 'reference') drawReference(); else drawBest();
  }
  toggle.addEventListener('click', () => { enabled = !enabled; try { localStorage.setItem(key, enabled ? 'on' : 'off'); } catch { /* Tab choice still works. */ } draw(); });
  document.addEventListener('astramarketsnapshot', event => { report = event.detail; draw(); });
  document.addEventListener('astrafeeschange',draw);
  for (const id of ['cash-lookback', 'cash-evidence']) document.getElementById(id)?.addEventListener('change', draw);
  draw(); document.dispatchEvent(new Event('astramarkethighlightsready'));
})();
