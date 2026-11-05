(() => {
  'use strict';
  if (window.AstraVolatilityPreview) return;
  const DAY = 86400000, positive = v => typeof v === 'number' && Number.isFinite(v) && v > 0;
  const validDay = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v + 'T00:00:00Z')) && new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v;
  const shift = (day, n) => new Date(Date.parse(day + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10);
  function sourceWindow(report) {
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
  function model(report) {
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
    return { window, cashItems, goodsItems, bySlug, categories, cashWinner: winner(cashItems), goodsWinner: winner(goodsItems), sourceUpdatedAt: report.sourceUpdatedAt };
  }
  window.AstraVolatilityPreview = Object.freeze({ sourceWindow, dailyVolatility, model });
  const options = document.getElementById('display-options'); if (!options) return;
  const make = (tag, text, className) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; };
  const key = 'astra-volatility-preview-v1'; let enabled = true, report, current, scheduled = false;
  try { enabled = localStorage.getItem(key) !== 'off'; } catch { /* The display remains usable in this tab. */ }
  const controls = make('div', undefined, 'hero-layout-options volatility-preview-options'); controls.dataset.previewControls = ''; controls.setAttribute('role', 'group'); controls.setAttribute('aria-label', 'Daily price volatility preview');
  const toggle = make('button'); toggle.type = 'button'; controls.append(toggle, make('small', 'Daily median-price dispersion over seven complete source days, not individual-trade volatility. Category labels summarize member volatilities, not category-index volatility.')); options.append(controls);
  const scopes = '#category-cards,#cash-item-highlights,#market-highlights-track,#highlights-fact-grid';
  const observer = new MutationObserver(records => {
    if (!enabled || !current || scheduled) return;
    const relevant = records.some(record => { const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
      return target?.closest(scopes) || [...record.addedNodes].some(node => node.nodeType === 1 && (node.matches(scopes) || node.querySelector(scopes))); });
    if (relevant) { scheduled = true; queueMicrotask(() => { scheduled = false; decorate(); }); }
  });
  const watch = () => observer.observe(document.body, { childList: true, subtree: true });
  const owned = node => { node.dataset.volatilityOwned = ''; return node; };
  const percent = value => value === null || value === undefined ? 'Unavailable' : value.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
  function badge(card, text, detail) { const label = owned(make('p', text, 'volatility-preview-badge')); label.title = detail; card.append(label); }
  function graphic(item, kind) {
    const root = make('span', undefined, 'market-highlight-graphic'), image = make('img', undefined, 'market-highlight-sprite'); image.alt = ''; image.width = image.height = 42; image.loading = 'lazy';
    const mapped = report.spriteMap?.[item.slug]; image.src = typeof mapped === 'string' && /^assets\/[A-Za-z0-9._-]+\.(?:png|webp|gif|svg)$/.test(mapped) ? mapped : `assets/${item.slug}.svg`;
    image.addEventListener('error', () => { if (image.getAttribute('src') === 'assets/meso-pouch.png') image.hidden = true; else image.src = 'assets/meso-pouch.png'; });
    const copy = make('span', undefined, 'market-highlight-copy'), title = make('span', undefined, 'market-highlight-title-line'), value = make('span', undefined, 'market-highlight-value-line');
    title.append(make('span', kind === 'cash' ? 'Most volatile · cash' : 'Most volatile · non-cash', 'market-highlight-kind'), make('strong', item.name, 'market-highlight-headline'));
    value.append(make('strong', `${percent(item.value)} daily price volatility`, 'market-highlight-value'));
    copy.append(title, value, make('small', `${current.window.start}–${current.window.end} · ${item.returns} consecutive daily returns · medians, not individual trades`, 'market-highlight-dates')); root.append(image, copy); return root;
  }
  function highlight(item, kind, duplicate, panel) {
    const card = owned(make(panel ? 'article' : 'li', undefined, panel ? 'panel highlights-fact volatility-preview-highlight' : 'market-highlight volatility-preview-highlight'));
    card.dataset.highlightType = 'volatility-' + kind;
    const link = make(duplicate ? 'span' : 'a');
    if (!duplicate) { const known = [...(report.rows || []), ...(report.cash || []), ...(report.contextItems || [])].some(row => row.slug === item.slug); link.href = known ? '#item/' + encodeURIComponent(item.slug) : '#cash-catalog'; }
    link.setAttribute('aria-label', `Highest observed daily price volatility in ${kind === 'cash' ? 'the captured cash catalog' : 'the captured non-cash basket/context cohort'}: ${item.name}; ${percent(item.value)}; ${current.window.start}–${current.window.end}; ${item.returns} daily returns.`);
    link.title = 'Sample standard deviation of consecutive qualified daily-median log returns × 100. Minimum five returns; no annualization. Ranking is limited to the captured cohort.';
    link.append(graphic(item, kind)); card.append(link); return card;
  }
  function decorate() {
    observer.disconnect();
    try {
      for (const node of document.querySelectorAll('[data-volatility-owned]')) node.remove();
      toggle.textContent = 'Daily price volatility: ' + (enabled ? 'On' : 'Off'); toggle.setAttribute('aria-pressed', String(enabled));
      if (!enabled || !current) return;
      const dates = `${current.window.start}–${current.window.end}; up to six within-window returns. Each daily median needs at least five recorded source sales. No missing-day bridge or carry-forward. Sample SD of daily log returns × 100; not annualized.`;
      for (const card of document.querySelectorAll('.category-card')) {
        const name = card.querySelector('[data-category]')?.dataset.category, category = current.categories.find(row => row.name === name); if (!category) continue;
        badge(card, `7-day median member volatility: ${percent(category.value)} · ${category.eligible}/${category.total} items`, `${dates} Unweighted median of sufficiently sampled member volatilities; this is not the category index's volatility.`);
      }
      for (const card of document.querySelectorAll('.cash-highlight-card[data-cash-highlight-slug]')) {
        const item = current.bySlug.get(card.dataset.cashHighlightSlug);
        badge(card, `7-day daily price volatility: ${percent(item?.value)}${item ? ' · ' + item.returns + '/6 returns' : ''}`, `${dates} This fixed daily window is independent of the cash table's rolling/lookback selection. Fewer than five returns is unavailable, not zero.`);
      }
      for (const [kind, item] of [['cash', current.cashWinner], ['goods', current.goodsWinner]]) {
        if (!item) continue;
        for (const list of document.querySelectorAll('#market-highlights-track .market-highlights-list')) list.append(highlight(item, kind, list.getAttribute('aria-hidden') === 'true', false));
        document.getElementById('highlights-fact-grid')?.append(highlight(item, kind, false, true));
      }
    } finally { watch(); }
  }
  toggle.addEventListener('click', () => { enabled = !enabled; try { localStorage.setItem(key, enabled ? 'on' : 'off'); } catch {} current = enabled && report ? model(report) : null; decorate(); });
  document.addEventListener('astramarketsnapshot', event => { if (event.detail && typeof event.detail === 'object') { report = event.detail; current = enabled ? model(report) : null; decorate(); } });
  decorate(); document.dispatchEvent(new Event('astramarkethighlightsready'));
})();
