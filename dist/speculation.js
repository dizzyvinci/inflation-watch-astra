(() => {
  'use strict';
  if (window.AstraSpeculation) return;
  const HOUR = 3600000, count = v => Number.isSafeInteger(v) && v >= 0;
  const clock = v => typeof v === 'string' && /T.*(?:Z|[+-]\d\d:\d\d)$/.test(v) && Number.isFinite(Date.parse(v)) ? Date.parse(v) : null;
  const source = raw => { try { const u = new URL(raw); return u.protocol === 'https:' && !u.username && !u.password ? u.href : null; } catch { return null; } };
  function activityModel(report) {
    const records = new Map(), fallbackSource = source(report?.smegaSource?.sourceUrl);
    for (const point of (Array.isArray(report?.smega) ? report.smega : []).slice(0, 20000)) {
      const at = clock(point?.at), origin = point?.sourceUrl == null ? fallbackSource : source(point.sourceUrl), n = point?.sampleCount ?? point?.distinctSenders;
      if (at === null || at % HOUR || !origin || !['buy', 'sell'].includes(point.side) || !count(n) || point.aggregation !== 'source_published_hourly') continue;
      const captured = point.capturedAt == null ? origin === fallbackSource ? clock(report?.smegaSource?.capturedAt) : null : clock(point.capturedAt);
      if (captured !== null && captured < at) continue;
      const key = JSON.stringify([origin, at, point.side]), old = records.get(key);
      const next = { origin, at, side: point.side, n, captured, partial: point.partial === true || captured !== null && captured < at + HOUR,
        complete: point.partial !== true && (captured === null ? point.partial === false : captured >= at + HOUR), conflict: false };
      if (!old || captured !== null && (old.captured === null || captured > old.captured)) records.set(key, next);
      else if (captured === old.captured) { if (old.n !== n) old.conflict = true; old.partial ||= next.partial; old.complete &&= next.complete; }
    }
    const sources = new Map();
    for (const point of records.values()) {
      if (!sources.has(point.origin)) sources.set(point.origin, new Map());
      const hours = sources.get(point.origin); if (!hours.has(point.at)) hours.set(point.at, { at: new Date(point.at).toISOString(), buy: null, sell: null });
      hours.get(point.at)[point.side] = point;
    }
    return [...sources].sort(([a], [b]) => a.localeCompare(b)).map(([origin, hours]) => {
      const start = Math.max(Math.min(...hours.keys()), Math.max(...hours.keys()) - 8759 * HOUR), end = Math.max(...hours.keys()), rows = [];
      for (let at = start; at <= end; at += HOUR) {
        const raw = hours.get(at), buy = raw?.buy, sell = raw?.sell;
        const buyerCount = buy && !buy.conflict ? buy.n : null, sellerCount = sell && !sell.conflict ? sell.n : null;
        const sum = buyerCount !== null && sellerCount !== null ? buyerCount + sellerCount : null;
        rows.push({ at: new Date(at).toISOString(), buyerCount, sellerCount, appearances: count(sum) ? sum : null,
          complete: buyerCount !== null && sellerCount !== null && buy.complete && sell.complete,
          partial: !!(buy?.partial || sell?.partial), conflict: !!(buy?.conflict || sell?.conflict),
          buyerCapturedAt: buy?.captured === null || buy?.captured === undefined ? null : new Date(buy.captured).toISOString(),
          sellerCapturedAt: sell?.captured === null || sell?.captured === undefined ? null : new Date(sell.captured).toISOString() });
      }
      const pulls = [...hours.values()].flatMap(h => [h.buy?.captured, h.sell?.captured]).filter(v => v !== null && v !== undefined);
      return { sourceUrl: origin, start: rows[0]?.at, end: rows.at(-1)?.at, capturedAt: pulls.length ? new Date(Math.max(...pulls)).toISOString() : null,
        completePairs: rows.filter(r => r.complete).length, truncated: start > Math.min(...hours.keys()) || report.smega.length > 20000, rows };
    });
  }
  function scenario(appearances, participation, multiplicity) {
    if (!count(appearances) || !Number.isFinite(participation) || participation <= 0 || participation > 1 || !Number.isFinite(multiplicity) || multiplicity < 1 || multiplicity > 2) return null;
    const result = appearances / (participation * multiplicity);
    return Number.isFinite(result) ? result : null;
  }
  // Consumes only the accepted calculation snapshot carried by the app event.
  const DAY = 86400000;
  const validDay = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s + 'T00:00:00Z')) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
  const shiftDay = (s, n) => new Date(Date.parse(s + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10);
  function windowSensitivity(data, selection = '2040801', custom = 3) {
    const unavailable = reason => ({ available: false, reason });
    if (!Number.isInteger(custom) || custom < 1 || custom > 30) return unavailable('Custom window must be a whole number from 1 through 30.');
    const view = data?.apiCalculationView, items = data?.apiDailyItems, publisher = view?.clocks?.dailyPublisher;
    if (clock(publisher) === null || !validDay(publisher.slice(0, 10)) || clock(view?.clocks?.dailyCapture) === null) return unavailable('Accepted daily source publication and receipt clocks are required.');
    if (!Array.isArray(items) || items.length !== 79 || items.filter(r => r?.role === 'goods').length !== 50 || items.filter(r => r?.role === 'cash').length !== 29 || new Set(items.map(r => r?.itemId)).size !== 79 || new Set(items.map(r => r?.slug)).size !== 79 || items.some(r => !Number.isSafeInteger(r?.itemId) || r.itemId < 1 || typeof r.slug !== 'string' || !Array.isArray(r.points) || r.points.length > 31)) return unavailable('The accepted fixed 50-goods / 29-cash daily cohort is unavailable.');
    const basket = selection === 'basket', selected = basket ? items.filter(r => r.role === 'goods') : items.filter(r => r.role === 'goods' && String(r.itemId) === selection);
    if (!basket && selected.length !== 1) return unavailable('Selected fixed-basket item is unavailable.');
    const endDay = shiftDay(publisher.slice(0, 10), -1), specs = new Map();
    if (basket) {
      if (!Array.isArray(data.rows) || data.rows.length !== 50) return unavailable('Fixed basket calibration is unavailable.');
      for (const r of data.rows) {
        const reference = r?.currentApiReference, id = reference?.itemId;
        if (!Number.isSafeInteger(id) || id < 1 || specs.has(id) || reference.slug !== r.slug || (r.canonicalId != null && r.canonicalId !== id) || !Number.isFinite(r.weight) || r.weight <= 0 || !Number.isFinite(r.basePrice) || r.basePrice <= 0 || reference.weight !== r.weight || reference.basePrice !== r.basePrice) return unavailable('Fixed basket calibration is invalid.');
        specs.set(id, r);
      }
      if (selected.some(r => !specs.has(r.itemId))) return unavailable('Fixed basket membership does not match daily evidence.');
    }
    const maps = [];
    for (const row of selected) {
      const m = new Map();
      for (const p of row.points) {
        if (!p || !validDay(p.day) || m.has(p.day)) return unavailable('Malformed or duplicate source days; no comparison substituted.');
        m.set(p.day, p);
      }
      maps.push({ row, m });
    }
    const observation = day => {
      let level = 0; const receipts = [];
      for (const { row, m } of maps) {
        const p = m.get(day);
        if (!p || p.qualified !== true || p.partialCalendarDay !== false || !Number.isSafeInteger(p.recordedSalesCount) || p.recordedSalesCount < 5 || clock(p.source?.capturedAt) === null || typeof p.medianUnitPriceLexeme !== 'string' || !/^\d+(?:\.\d+)?$/.test(p.medianUnitPriceLexeme)) return null;
        const price = Number(p.medianUnitPriceLexeme);
        if (!Number.isFinite(price) || price <= 0) return null;
        if (basket) { const s = specs.get(row.itemId); if (!Number.isFinite(p.linkedPrice) || p.linkedPrice <= 0) return null; level += 100 * s.weight * p.linkedPrice / s.basePrice; }
        else level = price;
        receipts.push(p.source.capturedAt);
      }
      return Number.isFinite(level) && level > 0 ? { day, value: level, receipts: [...new Set(receipts)].sort() } : null;
    };
    const compare = n => {
      const days = Array.from({ length: Math.max(n + 1, 2 * n) }, (_, i) => shiftDay(endDay, -i)), observations = days.map(observation);
      const endpointDays = observations.slice(0, n + 1), meanDays = observations.slice(0, 2 * n);
      const endpoint = endpointDays.every(Boolean) ? 100 * (observations[0].value / observations[n].value - 1) : null;
      const recentMean = meanDays.every(Boolean) ? meanDays.slice(0, n).reduce((s, p) => s + p.value, 0) / n : null;
      const priorMean = meanDays.every(Boolean) ? meanDays.slice(n).reduce((s, p) => s + p.value, 0) / n : null;
      const period = recentMean !== null && priorMean > 0 ? 100 * (recentMean / priorMean - 1) : null;
      return { days: n, startDay: shiftDay(endDay, -n), endDay, priorStart: shiftDay(endDay, -(2 * n - 1)), priorEnd: shiftDay(endDay, -n), recentStart: shiftDay(endDay, -(n - 1)), endpointPercent: Number.isFinite(endpoint) ? endpoint : null, periodPercent: Number.isFinite(period) ? period : null, recentMean, priorMean, receipts: [...new Set(observations.filter(Boolean).flatMap(p => p.receipts))].sort(), endpointReason: 'Requires every one of the N+1 actual qualified complete source days.', periodReason: 'Requires all 2N actual qualified complete source days; no partial weighting.' };
    };
    return { available: true, selection, name: basket ? 'Fixed 50-goods basket' : selected[0].name, units: basket ? 'linked MPI index points' : 'mesos per reported source unit', endDay, dailyPublisher: publisher, dailyCapture: view.clocks.dailyCapture, comparisons: [...new Set([1, 3, 7, custom])].map(compare) };
  }
  window.AstraSpeculation = Object.freeze({ activityModel, scenario, windowSensitivity });
  const options = document.getElementById('display-options'), content = document.getElementById('content'), nav = document.querySelector('.nav-wrap nav');
  if (!options || !content || !nav || document.getElementById('view-speculation')) return;
  const make = (tag, text, className) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (className) n.className = className; return n; };
  const key = 'astra-speculation-v1'; let enabled = false, report, profiles = [], pageNumber = 0;
  try { enabled = localStorage.getItem(key) === 'on'; } catch { /* Default off; tab control remains usable. */ }
  const control = make('div', undefined, 'hero-layout-options speculation-options'); control.dataset.previewControls = '';
  control.setAttribute('role', 'group'); control.setAttribute('aria-label', 'Speculation preview');
  const toggle = make('button'); toggle.type = 'button'; toggle.setAttribute('aria-controls', 'view-speculation speculation-nav');
  control.append(toggle, make('small', 'Optional assumption lab. Saved in this browser; no player or bot count is claimed.')); options.append(control);
  const link = make('a', 'Speculation', 'nav-link'); link.id = 'speculation-nav'; link.href = '#speculation'; nav.querySelector('.fallback-link')?.before(link); if (!link.isConnected) nav.append(link);
  const view = make('section', undefined, 'view speculation-page'); view.id = 'view-speculation'; view.hidden = true; view.setAttribute('aria-labelledby', 'speculation-title');
  const heading = make('h1', 'Speculation: what activity can tell us'); heading.id = 'speculation-title';
  view.append(make('p', 'ASSUMPTIONS / NOT A POPULATION ESTIMATE', 'eyebrow'), heading,
    make('p', 'Hourly offer activity is observable here. Total players, concurrent users and bot population are not identified by these market aggregates.', 'speculation-lead'));
  const evidence = make('p', undefined, 'speculation-evidence'); view.append(evidence);
  const selectRow = make('div', undefined, 'speculation-selectors'), sourceLabel = make('label', 'Source '), sourceSelect = make('select'); sourceSelect.id = 'speculation-source'; sourceLabel.append(sourceSelect);
  const periodLabel = make('label', 'Source-hour window '), period = make('select'); period.id = 'speculation-period';
  for (const [value, label] of [['24', 'Last 24 source hours'], ['48', 'Last 48 source hours'], ['all', 'All retained hours']]) { const option = make('option', label); option.value = value; period.append(option); }
  periodLabel.append(period); selectRow.append(sourceLabel, periodLabel); view.append(selectRow);
  const coverage = make('p', undefined, 'speculation-coverage'); view.append(coverage);
  const lab = make('section', undefined, 'speculation-lab'); lab.append(make('h2', 'An assumption-driven account scenario'));
  lab.append(make('p', 'A = buyer-poster count + seller-poster count for one complete source hour. P = A / (p × m), where p is assumed observed offer participation (including source coverage), and m is assumed poster-side appearances per offering account. Neither parameter is calibrated.'));
  const inputs = make('div', undefined, 'speculation-inputs');
  const participationLabel = make('label', 'Assumed observed participation (%) '), participation = make('input'); participation.type = 'number'; participation.id = 'speculation-participation'; participation.min = '.000001'; participation.max = '100'; participation.step = 'any'; participation.placeholder = 'Required assumption'; participationLabel.append(participation);
  const repeatLabel = make('label', 'Assumed side appearances / account (1–2) '), repeat = make('input'); repeat.type = 'number'; repeat.id = 'speculation-multiplicity'; repeat.min = '1'; repeat.max = '2'; repeat.step = 'any'; repeat.placeholder = 'Required assumption'; repeatLabel.append(repeat);
  inputs.append(participationLabel, repeatLabel); lab.append(inputs);
  const result = make('p', undefined, 'speculation-result'); result.setAttribute('role', 'status'); lab.append(result);
  lab.append(make('p', 'This assumes each source poster corresponds to an account within its hour, and uses only paired, complete buckets. Buyer/seller overlap, repeated posters across hours, alternative accounts and incomplete source coverage remain unknown. Accounts are not unique people. The result is arithmetic sensitivity, not measured CCU, a fitted population estimate or a confidence interval.'));
  view.append(lab);
  const tableRoot = make('div', undefined, 'table-wrap speculation-table'); view.append(tableRoot);
  const pager = make('div', undefined, 'speculation-pagination'), previous = make('button', 'Previous 24'), pageState = make('span'), next = make('button', 'Next 24'); previous.type = next.type = 'button'; pager.append(previous, pageState, next); view.append(pager);
  const policy = make('section', undefined, 'speculation-policy'); policy.append(make('h2', 'A participation change is not a player count'));
  policy.append(make('p', 'Nexon’s November 4, 2026 Classic World maintenance notice adds megaphone restrictions during the 96-hour period after a first NX purchase, alongside bot-detection changes. That can change who is able to post, even if the active population is unchanged. Treating a change in offer counts as a measured loss of players or bots would confound participation and population.'));
  const primary = make('a', 'Official Classic World maintenance notice ↗'); primary.href = 'https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/1848557880480504'; primary.target = '_blank'; primary.rel = 'noopener noreferrer'; policy.append(primary);
  policy.append(make('p', 'No numeric Classic World CCU series or independently verified active-bot denominator was identified in the reviewed primary sources (research: November 5, 2026). Ban totals count sanctioned accounts over a stated period, not the stock of active bots or unique humans. Sanction categories, repeat accounts, detection delays and reversals matter. High prices, large volumes or bulk trading alone do not identify a bot. Modern GMS or MapleStory Worlds totals must not be substituted for Classic World.'));
  view.append(policy);
  const sensitivity = make('details', undefined, 'speculation-window'); sensitivity.id = 'speculation-window';
  sensitivity.append(make('summary', 'Window sensitivity · optional daily-source comparison'));
  const windowBody = make('div', undefined, 'speculation-window-body'); windowBody.hidden = true;
  windowBody.append(make('p', 'Compare endpoints and separate arithmetic means of daily medians. These are descriptive sensitivities, not an optimal window, forecast, executable return or recommendation. This view retains at most 31 daily observations per item: an N-day endpoint needs N+1 observations and disjoint N-day means need 2N, so mean comparisons above 15 days remain unavailable here.'));
  const windowControls = make('div', undefined, 'speculation-selectors'), itemLabel = make('label', 'Daily evidence '), itemSelect = make('select'); itemSelect.id = 'speculation-window-item';
  for (const [id, label] of [['2040801', 'Gloves Attack Scroll: Intermediate'], ['basket', 'Fixed 50-goods basket']]) { const o = make('option', label); o.value = id; itemSelect.append(o); } itemLabel.append(itemSelect);
  const customLabel = make('label', 'Custom source days (1–30) '), customInput = make('input'); customInput.type = 'number'; customInput.min = '1'; customInput.max = '30'; customInput.step = '1'; customInput.value = '3'; customInput.id = 'speculation-window-custom'; customLabel.append(customInput); windowControls.append(itemLabel, customLabel); windowBody.append(windowControls);
  const windowResult = make('div'); windowResult.id = 'speculation-window-result'; windowResult.setAttribute('role', 'status'); windowBody.append(windowResult); sensitivity.append(windowBody); view.append(sensitivity); content.append(view);
  const dateLabel = day => { if (!validDay(day)) return 'unknown'; const d = new Date(day + 'T00:00:00Z'); return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) + ', ' + d.getUTCFullYear(); };
  const receiptLabel = s => { if (clock(s) === null) return 'unknown'; const zone = document.getElementById('display-timezone')?.value || 'UTC'; try { const d = new Date(s); return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: zone }) + ' ' + zone + ' ' + d.toLocaleDateString('en-US', { year: 'numeric', timeZone: zone }); } catch { return 'unknown'; } };
  function drawWindow() {
    windowBody.hidden = !enabled || !sensitivity.open;
    windowResult.replaceChildren();
    if (windowBody.hidden) return;
    const model = windowSensitivity(report, itemSelect.value, customInput.value.trim() ? Number(customInput.value) : NaN);
    if (!model.available) { windowResult.append(make('p', 'Unavailable · ' + model.reason)); return; }
    windowResult.append(make('h2', model.name));
    windowResult.append(make('p', `${model.units}; complete UTC source days through (${dateLabel(model.endDay)}), the day before source publication. Original overview receipt (${receiptLabel(model.dailyCapture)}); publisher (${receiptLabel(model.dailyPublisher)}). Newer reported three-day price references are not daily observations.`));
    const table = make('table'), head = make('tr'); for (const text of ['Source days', 'Endpoint change · %', 'Disjoint daily-mean change · %']) head.append(make('th', text)); const thead = make('thead'); thead.append(head); table.append(thead); const tbody = make('tbody');
    const percent = n => n === null ? 'Unavailable' : (n > 0 ? '+' : '') + n.toLocaleString('en-US', { maximumFractionDigits: 4 }) + '%';
    for (const r of model.comparisons) {
      const tr = make('tr'); tr.append(make('th', String(r.days)));
      const endpoint = make('td', percent(r.endpointPercent)); endpoint.append(make('small', `(${dateLabel(r.startDay)}) → (${dateLabel(r.endDay)}). ${r.endpointPercent === null ? r.endpointReason : 'N+1 complete days present.'}`));
      const mean = make('td', percent(r.periodPercent)); mean.append(make('small', `(${dateLabel(r.priorStart)})–(${dateLabel(r.priorEnd)}) versus (${dateLabel(r.recentStart)})–(${dateLabel(r.endDay)}). ${r.periodPercent === null ? r.periodReason : 'Equal-day arithmetic means, not a pooled-sale median.'}`));
      if (r.receipts.length) mean.append(make('small', `Available checked-day receipts (${receiptLabel(r.receipts[0])})–(${receiptLabel(r.receipts.at(-1))}). Receipt times are retrieval clocks, not individual sale times.`));
      tr.append(endpoint, mean); tbody.append(tr);
    }
    table.append(tbody); const wrap = make('div', undefined, 'table-wrap'); wrap.append(table); windowResult.append(wrap);
    windowResult.append(make('p', 'Missing, duplicate, thin, partial or unknown-receipt days remain unavailable; no carry, interpolation or shorter substitute. Whole-item medians can mix quality; reported sale counts are not verified individual trades. Basket levels keep all 50 frozen weights and bases without renormalizing. Retained days alone cannot identify an optimal window.'));
  }
  const number = (n, decimals = 0) => Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: decimals }) : '—';
  function selectedRows() { const profile = profiles.find(p => p.sourceUrl === sourceSelect.value); return { profile, rows: profile ? period.value === 'all' ? profile.rows : profile.rows.slice(-Number(period.value)) : [] }; }
  function parameters() { return { p: participation.value.trim() && participation.validity.valid ? Number(participation.value) / 100 : NaN, m: repeat.value.trim() && repeat.validity.valid ? Number(repeat.value) : NaN }; }
  function draw() {
    const { profile, rows } = selectedRows(), { p, m } = parameters(), complete = rows.filter(r => r.complete && r.appearances !== null), latest = complete.at(-1);
    const value = latest ? scenario(latest.appearances, p, m) : null;
    evidence.textContent = `Daily scanner: ${number(report?.allRecentQuantity)} recorded source volume during ${report?.recentStart || '?'} through the day before ${report?.recentEndExclusive || '?'}. This is neither a transaction count nor an hourly series. Qualified intraday aggregate observations: ${number(report?.intraday?.length || 0)}; no individual trade records are supplied to this lab.`;
    coverage.textContent = profile ? `${rows[0]?.at}–${rows.at(-1)?.at} · ${complete.length} / ${rows.length} paired complete hours · last retained pull ${profile.capturedAt || 'unknown'}. Source-hour clocks are UTC; missing sides/buckets are not zero. Counts can repeat across sides and hours.${profile.truncated ? ' Input exceeds the safety bound; this view is incomplete outside retained limits.' : ''}` : 'No valid source-published hourly poster counts are available.';
    result.textContent = value === null ? 'Enter both assumptions to calculate a scenario. Partial, missing or conflicting hours receive no population scenario.' : `${number(value)} active accounts under these assumptions for ${latest.at}: ${latest.appearances} poster-side appearances ÷ (${number(p * 100, 6)}% × ${m}). Halving assumed participation doubles the result; doubling it halves the result (within valid parameter bounds). This is not a measured player count or interval.`;
    tableRoot.replaceChildren(); const table = make('table'), caption = make('caption', 'Hourly offer observations and conditional arithmetic · UTC'); table.append(caption);
    const head = make('thead'), hr = make('tr'); for (const text of ['Source hour · UTC', 'Seller posters', 'Buyer posters', 'Side appearances', 'Coverage', 'Assumption result · accounts']) { const th = make('th', text); th.scope = 'col'; hr.append(th); } head.append(hr); table.append(head);
    const body = make('tbody'), pages = Math.max(1, Math.ceil(rows.length / 24)); pageNumber = Math.min(pageNumber, pages - 1);
    for (const row of [...rows].reverse().slice(pageNumber * 24, (pageNumber + 1) * 24)) {
      const tr = make('tr'), hypothetical = row.complete ? scenario(row.appearances, p, m) : null;
      const state = row.conflict ? 'Conflicting counts omitted' : row.partial ? 'Partial source hour' : row.complete ? 'Paired complete hour' : 'Missing side or completion unknown';
      for (const text of [row.at.replace('T', ' ').replace('.000Z', ' UTC'), number(row.sellerCount), number(row.buyerCount), number(row.appearances), state, number(hypothetical)]) tr.append(make('td', text));
      tr.children[1].title = 'Seller point pulled ' + (row.sellerCapturedAt || 'at an unknown time'); tr.children[2].title = 'Buyer point pulled ' + (row.buyerCapturedAt || 'at an unknown time'); body.append(tr);
    }
    if (!rows.length) { const tr = make('tr'), td = make('td', 'No hourly observations; no values imputed.'); td.colSpan = 6; tr.append(td); body.append(tr); }
    table.append(body); tableRoot.append(table); previous.disabled = pageNumber === 0; next.disabled = pageNumber + 1 >= pages; pageState.textContent = `${pageNumber + 1} / ${pages}`;
  }
  function publish(data) { report = data; const prior = sourceSelect.value; profiles = activityModel(data); sourceSelect.replaceChildren(); for (const profile of profiles) { const option = make('option', profile.sourceUrl); option.value = profile.sourceUrl; sourceSelect.append(option); } if (profiles.some(p => p.sourceUrl === prior)) sourceSelect.value = prior; draw(); drawWindow(); }
  function choice() { link.hidden = !enabled; toggle.textContent = 'Speculation tab: ' + (enabled ? 'On' : 'Off'); toggle.setAttribute('aria-pressed', String(enabled)); if (!enabled) { view.hidden = true; if (location.hash === '#speculation') location.hash = '#index'; } }
  toggle.addEventListener('click', () => { enabled = !enabled; try { localStorage.setItem(key, enabled ? 'on' : 'off'); } catch {} choice(); if (!enabled) sensitivity.open = false; drawWindow(); });
  sensitivity.addEventListener('toggle', drawWindow);
  itemSelect.addEventListener('change', drawWindow); customInput.addEventListener('input', drawWindow);
  document.addEventListener('change', event => { if (event.target?.id === 'display-timezone') drawWindow(); });
  for (const select of [sourceSelect, period]) select.addEventListener('change', () => { pageNumber = 0; draw(); });
  for (const input of [participation, repeat]) input.addEventListener('input', draw);
  previous.addEventListener('click', () => { pageNumber = Math.max(0, pageNumber - 1); draw(); }); next.addEventListener('click', () => { ++pageNumber; draw(); });
  document.addEventListener('astramarketsnapshot', event => { if (event.detail && typeof event.detail === 'object') publish(event.detail); });
  window.addEventListener('hashchange', () => { if (!enabled && location.hash === '#speculation') { view.hidden = true; location.hash = '#index'; } });
  choice(); draw(); document.dispatchEvent(new Event('astramarkethighlightsready'));
})();
