(() => {
  'use strict';
  const host = document.getElementById('view-cash-catalog') || document.getElementById('cash-catalog');
  if (!host || document.getElementById('cash-client-catalog-panel')) return;
  const make = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
  const panel = make('section', 'cash-client-catalog-panel'); panel.id = 'cash-client-catalog-panel';
  const title = make('h2', '', 'Broader client catalog'); title.id = 'cash-client-title'; panel.setAttribute('aria-labelledby', title.id);
  const scope = make('p', 'cash-client-scope', 'Optional client metadata complements the observed market catalog above. A cash flag proves client presence, not release, trading or listing availability. Equipment and hair/face styles are separated. No market price, direct NX cost or release date is inferred; this changes no basket or NX estimate. Cash consumables evidenced elsewhere remain separate.');
  const openControls = make('div', 'cash-client-open-controls chart-comparison-controls');
  const toggle = make('button', 'cash-client-toggle', 'Show broader client catalog'); toggle.type = 'button'; toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-controls', 'cash-client-body'); openControls.append(toggle);
  const body = make('div', 'cash-client-body'); body.id = 'cash-client-body'; body.hidden = true;
  const status = make('p', 'cash-client-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const evidence = make('p', 'cash-client-evidence');
  const controls = make('div', 'cash-client-controls'); controls.hidden = true;
  const searchLabel = make('label', '', 'Search client names or IDs'), search = make('input'); search.type = 'search'; search.autocomplete = 'off'; search.maxLength = 250; search.setAttribute('aria-describedby', 'cash-client-results'); searchLabel.append(search);
  const filterLabel = make('label', '', 'Metadata type'), filter = make('select');
  for (const [value, text] of [['all', 'All client cash metadata'], ['equipment_item', 'Equipment items'], ['appearance_style', 'Hair / face styles']]) { const option = make('option', '', text); option.value = value; filter.append(option); } filterLabel.append(filter);
  const clear = make('button', '', 'Clear search'); clear.type = 'button';
  controls.append(searchLabel, filterLabel, clear);
  const tableHost = make('div', 'table-wrap cash-client-table');
  const paging = make('div', 'cash-client-paging'); paging.hidden = true;
  const previous = make('button', '', 'Previous'), next = make('button', '', 'Next'), results = make('span'); previous.type = next.type = 'button'; results.id = 'cash-client-results'; results.setAttribute('role', 'status'); results.setAttribute('aria-live', 'polite'); paging.append(previous, results, next);
  const limitation = make('p', 'cash-client-limitation', 'This is a dated manual client capture, not an unattended connection or a complete list of released cash-shop goods. Release status, current shop availability, market availability and direct NX cost are unknown in this dataset.');
  const provenance = make('p', 'cash-client-evidence'), provenanceLink = make('a', '', 'View archived source provenance ↗'); provenanceLink.href = 'assets/cash-client-catalog-provenance.json'; provenanceLink.target = '_blank'; provenanceLink.rel = 'noopener noreferrer'; provenance.append(provenanceLink);
  body.append(status, evidence, controls, tableHost, paging, limitation, provenance); panel.append(title, scope, openControls, body); host.append(panel);
  let opened = false, rows = null, loading = null, pageIndex = 0, sortKey = 'name', ascending = true;
  const pageSize = 25, maxBytes = 4 * 1024 * 1024;
  const source = 'https://maplestory.io/api/MCW/1/item/list?cashFilter=true&count=10000';
  const count = value => Number.isInteger(value) && value > 0 && value <= 10000;
  const clock = value => typeof value === 'string' && /(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value));
  const fail = () => { throw new Error('The owned client archive failed validation.'); };
  function validateManifest(value) {
    if (!value || value.schemaVersion !== 1 || value.kind !== 'client_cash_metadata_manifest' || !count(value.recordCount)
      || !Number.isInteger(value.bytes) || value.bytes <= 0 || value.bytes > maxBytes || !clock(value.capturedAt)
      || value.timestampKind !== 'http_response_completed_at' || value.sourceObservedAt !== null || value.sourcePublishedAt !== null
      || typeof value.data !== 'string' || !/^assets\/cash-client-catalog-[a-f0-9]{16}\.json$/.test(value.data)
      || typeof value.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.sha256) || !value.data.endsWith(value.sha256.slice(0, 16) + '.json')) fail();
    const stats = value.stats;
    if (!stats || !Number.isInteger(stats.equipmentItems) || stats.equipmentItems < 0 || !Number.isInteger(stats.appearanceStyles) || stats.appearanceStyles < 0 || stats.equipmentItems + stats.appearanceStyles !== value.recordCount) fail();
    return value;
  }
  function validateData(value, manifest) {
    if (!value || value.schemaVersion !== 1 || value.kind !== 'client_cash_metadata_catalog' || value.provider !== 'maplestory.io'
      || value.region !== 'MCW' || value.clientVersion !== '1' || value.sourceUrl !== source || value.capturedAt !== manifest.capturedAt
      || value.timestampKind !== 'http_response_completed_at' || value.sourceObservedAt !== null || value.sourcePublishedAt !== null
      || value.releaseStatus !== 'unknown' || value.marketAvailability !== null || value.directNxCost !== null
      || value.recordCount !== manifest.recordCount || !Array.isArray(value.records) || value.records.length !== manifest.recordCount) fail();
    const seen = new Set(); let styles = 0;
    const allowed = ['itemId', 'name', 'isCash', 'overallCategory', 'category', 'subCategory', 'metadataKind'];
    for (const row of value.records) {
      if (!row || Object.keys(row).length !== allowed.length || Object.keys(row).some(key => !allowed.includes(key))
        || !Number.isSafeInteger(row.itemId) || row.itemId <= 0 || row.itemId >= 100000000 || seen.has(row.itemId) || row.isCash !== true
        || typeof row.name !== 'string' || !row.name.trim() || row.name.length > 250) fail();
      for (const key of ['overallCategory', 'category', 'subCategory', 'metadataKind']) if (typeof row[key] !== 'string' || !row[key] || row[key].length > 80) fail();
      if (!['equipment_item', 'appearance_style'].includes(row.metadataKind) || (row.category === 'Character') !== (row.metadataKind === 'appearance_style')) fail();
      seen.add(row.itemId); if (row.metadataKind === 'appearance_style') styles++;
    }
    if (styles !== manifest.stats.appearanceStyles || value.records.length - styles !== manifest.stats.equipmentItems
      || value.stats?.appearanceStyles !== styles || value.stats?.equipmentItems !== value.records.length - styles) fail();
    return value.records;
  }
  async function readOwned(relative, limit) {
    const url = new URL(relative, window.location.origin + '/');
    if (url.origin !== window.location.origin || url.search || url.hash) fail();
    const response = await fetch(url.href, { credentials: 'same-origin', cache: relative.endsWith('cash-client-catalog.json') ? 'no-cache' : 'force-cache' });
    if (window.astraPreviewSession?.onResponse(response) === false || !response.ok) throw new Error('The owned archive is unavailable; unlock the preview again if your session expired.');
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > limit) fail();
    return text;
  }
  function draw() {
    if (!rows) return;
    const query = search.value.trim().toLocaleLowerCase(), type = filter.value;
    const filtered = rows.filter(row => (type === 'all' || row.metadataKind === type) && (!query || `${row.name} ${row.itemId} ${row.subCategory}`.toLocaleLowerCase().includes(query)));
    filtered.sort((a, b) => (typeof a[sortKey] === 'number' ? a[sortKey] - b[sortKey] : a[sortKey].localeCompare(b[sortKey], undefined, { numeric: true })) * (ascending ? 1 : -1) || a.itemId - b.itemId);
    pageIndex = Math.max(0, Math.min(pageIndex, Math.max(0, Math.ceil(filtered.length / pageSize) - 1)));
    const visible = filtered.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);
    const table = make('table'), caption = make('caption', '', 'Cash-flagged client metadata · availability and cost unknown'), head = make('thead'), header = make('tr'), tbody = make('tbody');
    for (const [key, label] of [['itemId', 'Item ID'], ['name', 'Client item name'], ['metadataKind', 'Metadata type'], ['subCategory', 'Client category']]) {
      const th = make('th'), button = make('button', 'cash-client-sort', label + (key === sortKey ? ascending ? ' ↑' : ' ↓' : '')); th.scope = 'col'; th.setAttribute('aria-sort', key === sortKey ? ascending ? 'ascending' : 'descending' : 'none'); button.type = 'button'; button.dataset.clientSort = key; button.setAttribute('aria-label', 'Sort all matching client records by ' + label.toLowerCase()); th.append(button); header.append(th);
    }
    head.append(header);
    for (const item of visible) {
      const row = make('tr'); row.dataset.clientItemId = item.itemId;
      for (const text of [String(item.itemId), item.name, item.metadataKind === 'appearance_style' ? 'Hair / face style' : 'Equipment item', item.subCategory]) row.append(make('td', '', text));
      tbody.append(row);
    }
    if (!visible.length) { const td = make('td', '', 'No client records match. Clear the search or change the metadata type.'); td.colSpan = 4; const empty = make('tr'); empty.append(td); tbody.append(empty); }
    table.append(caption, head, tbody); tableHost.replaceChildren(table);
    results.textContent = filtered.length ? `${pageIndex * pageSize + 1}–${pageIndex * pageSize + visible.length} of ${filtered.length.toLocaleString('en-US')} matching client records` : '0 matching client records';
    previous.disabled = pageIndex === 0; next.disabled = (pageIndex + 1) * pageSize >= filtered.length; clear.disabled = !search.value;
  }
  async function load() {
    if (rows || loading) return;
    status.textContent = 'Loading this site’s archived client metadata…';
    loading = (async () => {
      try {
        const manifest = validateManifest(JSON.parse(await readOwned('assets/cash-client-catalog.json', 8192)));
        const text = await readOwned(manifest.data, maxBytes), bytes = new TextEncoder().encode(text);
        if (bytes.byteLength !== manifest.bytes || !window.crypto?.subtle) fail();
        const hash = [...new Uint8Array(await window.crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('');
        if (hash !== manifest.sha256) fail();
        rows = validateData(JSON.parse(text), manifest);
        status.textContent = `${rows.length.toLocaleString('en-US')} cash-flagged client records · ${manifest.stats.equipmentItems.toLocaleString('en-US')} equipment items · ${manifest.stats.appearanceStyles.toLocaleString('en-US')} hair/face styles.`;
        evidence.textContent = 'HTTP capture completed ' + manifest.capturedAt + '. Underlying source publication/release time unknown. Original client: MCW/1; provider: MapleStory.io.';
        controls.hidden = paging.hidden = false; draw();
      } catch (error) {
        rows = null; controls.hidden = paging.hidden = true; tableHost.replaceChildren();
        status.textContent = 'Client metadata could not be loaded or validated. Existing market data and estimates are unchanged. Close and reopen to retry.';
      } finally { loading = null; }
    })();
    await loading;
  }
  toggle.addEventListener('click', () => { opened = !opened; body.hidden = !opened; toggle.setAttribute('aria-expanded', String(opened)); toggle.textContent = opened ? 'Hide broader client catalog' : 'Show broader client catalog'; if (opened) load(); });
  search.addEventListener('input', () => { pageIndex = 0; draw(); }); search.addEventListener('search', () => { pageIndex = 0; draw(); });
  filter.addEventListener('change', () => { pageIndex = 0; draw(); });
  clear.addEventListener('click', () => { search.value = ''; pageIndex = 0; draw(); search.focus(); });
  search.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); clear.click(); } });
  previous.addEventListener('click', () => { pageIndex--; draw(); }); next.addEventListener('click', () => { pageIndex++; draw(); });
  tableHost.addEventListener('click', event => { const button = event.target.closest('[data-client-sort]'); if (!button) return; const key = button.dataset.clientSort; if (!['itemId', 'name', 'metadataKind', 'subCategory'].includes(key)) return; ascending = sortKey === key ? !ascending : true; sortKey = key; pageIndex = 0; draw(); tableHost.querySelector(`[data-client-sort="${key}"]`)?.focus(); });
})();
