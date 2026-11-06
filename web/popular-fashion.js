(() => {
  'use strict';
  if (window.AstraPopularFashion) return;
  // Exact names from captured official Classic World fashion reward tables.
  // These receipts establish classification, never current availability or a market price.
  const evidence = {"kind":"official_classic_world_fashion_classification","editions":[{"id":"mystery-fashion-2026-11-04","title":"Mystery Fashion Crate \u00b7 Nov 4 rotation","url":"https://www.nexon.com/maplestory/general-post/46331","capturedAt":"2026-11-05T13:19:55.597466+00:00","sha256":"f965e9e5385bc7a2f8a42324e71aa25758b6dd5d43a824b97e58e1a0c1603a19","names":["Woodsman Hat","Bomber Jacket","Patched Denim Jeans","Green Sports Goggles","Pelvis Hoodie","Red Hooded Coat","Bunny-Padded Snowboard Pants","Pillow","Grey Visor Beanie","Black Fur Wrap Coat","Blue Kitty Hood","Mix-n-Match Sneakers","Starry Sky Blue Beanie","Big Rabbit Feet","White Rabbit's Foot","Olive Beanie","Bandage Strip","Pink Knitted Gumball","Pink Snowboard Top","Pink Snowboard Pants","Pink Galoshes","Bunny Hat","Bunny Slippers","Pink Rabbit Puppet","Bunny Costume","Old School Uniform Hat","Old School Blazer","Old School Uniform Top","Old School Uniform Pants","Old School Uniform Skirt","White High Top","Medical Eye Patch","My Buddy Rex","Blue Snow Flower Wear","Superstar Headphones","Kitty Hoodie","Pink Down Parka","Amorian Pink Skirt","Ice Cold Red","Teddy Bear Headgear","Teddy Bear Costume","Teddy Bear Shoes","Teddy Bear","Teddy Bear Gloves","Cuddle Bear","Teddy Bear Chat Ring","Blue Pajama Hat","Blue Polka-Dot Pajama Top","Blue Polka-Dot Pajama Pants","Blue Marble Slippers"]},{"id":"halloween-2026-10-28","title":"Halloween Mystery Fashion Crate \u00b7 Oct 28 rotation","url":"https://www.nexon.com/maplestory/general-post/46524","capturedAt":"2026-11-05T13:19:55.925107+00:00","sha256":"16d4689fa00b005ccee9f89e3e591fd9251dd3abe3f865fcc72685e22bf12c30","names":["Tiger Mask","Prisoner Top","Prisoner Pants","Brown Bandage","Scream Mask","Skull T-Shirt","Bone Buckled Slacks","Skull Beanie","Dark Suit","Dark Enamel Suit","Black Leather Boots","Black Bandage","Skull Patch","Grey Skull Overall","Red Skull Overall","Skull Gloves","Black Coat of Death","Ghost Suit","Black Shoes of Death","Hat of Death","Ragged Gomushin","Witch Hat","Ghost Costume","Witch Clothes","Witch's Broomstick","Gargoyle Wings","Battle Scar","Mummy Hat","Mummy Suit","Mummy Mask","White Bandage","Devil Wings","Blue Chinese Undead Hat","Blue Chinese Undead Costume","Maple-Stein Head","Maple-Stein Face","Demon Goblin","Pumpkin Hat","Pumpkin Headgear","Pumpkin Suit","Glowing Pumpkin Basket","Evil Skull","Cat Soul","Devilish Horns","Devil Horns","Dark Devil Hat","Coffin of Gloom","Count Dracula Cape","Iljimae Mask","Stealth Suit"]},{"id":"founders-2026-10-06","title":"Founder's Mystery Fashion Crate \u00b7 Founder\u2019s Access","url":"https://www.nexon.com/maplestory/general-post/45538","capturedAt":"2026-11-05T13:20:19.247557+00:00","sha256":"6c88e7ce3c274146bb3a5dce350142c445d5e224fd1fe3d11df24097035d5e36","names":["Angel Halo","Toga","Baby Angel Wings","Angel Wand","Cherub's Bow","Blue Cap","Orange Baseball Jacket","Rainbow Knit","Ripped Jeans","Orange Toy Hammer","Blue Bucket Hat","Tourist T","White Jeans","Black Sunglasses","Cat Hat","Cat Suit","Gold Kitty Slippers","Kitty Chat Ring","Meshcap","Pink Allstar","Jean Shorts","Beret","Red Sailor Shirt","Red Sailor Skirt","Black Enamel Shoes","Patissier Hat","Patissier Uniform","Yellow Spatula","Bunny Ears","Bunny Earmuffs","Orange Mushroom Balloon","Blue Watch","Red Trainer Jacket","Red Trainer Pants","Yellow Rainbow Sneaks","Dollish Pink","Purple Dorothy Dress","Sailor Hat","Sailor Outfit","White Ribboned Sailor Dress","Slime T-Shirt","Slime Slippers","Slime Earrings","Reggae Hat","Orange Hooded Shirt","White Hooded Vest","Butterfly Skirt","Beetle Long Sleeve","Lined Hip-Hop Pants","White Label Ring"]},{"id":"aurora-season-1-2026","title":"Aurora Mystery Fashion Crate \u00b7 Season 1","url":"https://www.nexon.com/maplestory/general-post/45659","capturedAt":"2026-11-05T13:20:19.595096+00:00","sha256":"2da85bc74092abda3f075bb94aa001596ecc2e4a7c21d8658aef481f084861ee","names":["White Choco Bunny","Splash Choco Boy","Splash Choco Girl","Cacao Bear Shoes","Chocolate Ribbon","Soft Chocolate Fondue Scepter","Choco Candy Cookie","Black Cat Beanie","Sky Blue Cat Beanie","Orange Cat Beanie","Heart Sunglasses","Red Check Rider","Violet Dot Jeans","Pink Bunny Sweater","Hearts Tights","Pink Elephant Slippers","Loose Fit Sweater","Stocking Shorts","Detective Glass","Blank Eye Patch","Heartbreaker Lips","Starlight Heart Scepter","Ink-and-Wash Thought Bubble Ring","Ink-and-Wash Painting Name Tag Ring","Chocolate Label Ring","Chocolate Chat Ring"]}]};
  const names = new Map();
  for (const edition of evidence.editions) for (const name of edition.names) {
    const key = name.toLocaleLowerCase('en-US');
    if (!names.has(key)) names.set(key, []);
    names.get(key).push(edition);
  }
  const day = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
  const slug = value => typeof value === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(value);
  const shift = (date, offset) => new Date(Date.parse(date + 'T00:00:00Z') + offset * 86400000).toISOString().slice(0, 10);
  const finitePositive = value => Number.isFinite(value) && value > 0;
  function calculate(data) {
    const catalog = data?.cashCatalog, publication = catalog?.sourceUpdatedAt || data?.sourceUpdatedAt;
    const sourceDay = typeof publication === 'string' ? publication.slice(0, 10) : null;
    if (catalog?.schemaVersion !== 1 || catalog.kind !== 'cash_shop_source_catalog' || !day(sourceDay) || !Array.isArray(catalog.rows)) return null;
    const startDay = shift(sourceDay, -7), endDay = shift(sourceDay, -1), sourceRows = catalog.rows.filter(row => row && slug(row.slug) && typeof row.name === 'string');
    const nameCounts = new Map(), slugCounts = new Map();
    for (const row of sourceRows) { const key = row.name.toLocaleLowerCase('en-US'); nameCounts.set(key, (nameCounts.get(key) || 0) + 1); slugCounts.set(row.slug, (slugCounts.get(row.slug) || 0) + 1); }
    const rows = []; let ambiguousItems = 0, mismatchedSourceItems = 0;
    for (const row of sourceRows) {
      const key = row.name.toLocaleLowerCase('en-US'), editions = names.get(key);
      if (!editions) continue;
      if (nameCounts.get(key) !== 1 || slugCounts.get(row.slug) !== 1) { ambiguousItems++; continue; }
      if (row.sourceUpdatedAt && row.sourceUpdatedAt !== publication) { mismatchedSourceItems++; continue; }
      const days = new Map(), conflicts = new Set();
      for (const point of Array.isArray(row.history) ? row.history : []) {
        if (!Array.isArray(point) || !day(point[0]) || point[0] < startDay || point[0] >= sourceDay || !Number.isSafeInteger(point[2]) || point[2] < 0) continue;
        const value = { quantity: point[2], median: finitePositive(point[1]) ? point[1] : null }, previous = days.get(point[0]);
        if (previous && (previous.quantity !== value.quantity || previous.median !== value.median)) conflicts.add(point[0]);
        else days.set(point[0], value);
      }
      for (const date of conflicts) days.delete(date);
      let quantity = 0, turnover = 0, pricedQuantity = 0, pricedDays = 0;
      for (const value of days.values()) {
        quantity += value.quantity;
        if (value.quantity === 0 || value.median !== null && Number.isFinite(value.median * value.quantity)) { turnover += (value.median || 0) * value.quantity; pricedQuantity += value.quantity; pricedDays++; }
      }
      const safeQuantity = days.size && Number.isSafeInteger(quantity) ? quantity : null;
      rows.push({ slug: row.slug, name: row.name, quantity: safeQuantity, turnoverProxy: safeQuantity !== null && pricedQuantity === quantity && Number.isFinite(turnover) ? turnover : null,
        observedDays: days.size, pricedDays, pricedQuantity, conflicts: conflicts.size, firstDay: [...days.keys()].sort()[0] || null, lastDay: [...days.keys()].sort().at(-1) || null,
        classificationEditions: editions.map(edition => edition.title), unit: 'source-recorded count / units; item-specific conventions may differ' });
    }
    return { sourceDay, publication, startDay, endDay, days: 7, providerItems: sourceRows.length, classifiedItems: rows.length, withActivity: rows.filter(row => row.quantity !== null).length, ambiguousItems, mismatchedSourceItems, rows };
  }
  window.AstraPopularFashion = Object.freeze({ calculate });
  const make = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
  const number = value => Number.isFinite(value) ? value.toLocaleString('en-US', { maximumFractionDigits: 0 }) : 'Unavailable';
  const preference = 'astra-popular-fashion-v1';
  let enabled = true, report = null, sortKey = 'quantity', ascending = false, showAll = false, section, body, tableHost, scope, toggle, expand,apiScope;
  try { const stored = localStorage.getItem(preference); if (stored === 'on' || stored === 'off') enabled = stored === 'on'; } catch { /* The default remains usable when storage is blocked. */ }
  function draw() {
    if (!section) return;
    body.hidden = !enabled; toggle.setAttribute('aria-pressed', String(enabled)); toggle.textContent = enabled ? 'Fashion activity: On' : 'Fashion activity: Off';
    section.dataset.enabled = String(enabled); tableHost.replaceChildren();
    const result = calculate(report);
    const apiItems=report?.apiDailyItems,apiActive=!!report?.apiCalculationView;
    apiScope.hidden=!apiActive;
    if(apiActive){const valid=Array.isArray(apiItems)&&apiItems.length===79&&new Set(apiItems.map(r=>r.itemId)).size===79&&apiItems.filter(r=>r.role==='goods').length===50&&apiItems.filter(r=>r.role==='cash').length===29,matches=valid?apiItems.filter(r=>typeof r.name==='string'&&names.has(r.name.toLocaleLowerCase('en-US'))).length:null;apiScope.textContent=matches===0?'The current API calculation scope contains 50 goods and 29 fixed-NX items, with no exact-name matches to these official fashion tables. It does not refresh the broader fashion ranking below. Those retained source rows keep their own publication and daily window.':matches===null?'Current API daily scope is unavailable for fashion coverage. The broader ranking retains its separately dated source.':`${matches} exact-name candidates occur within the partial 79-item API calculation scope; that is not a full fashion universe. This broader ranking remains on its separately dated source until all-item API daily activity is connected.`;}
    if (!result) { scope.textContent = 'No dated cash-catalog history is connected. No fashion popularity is inferred from client metadata.'; expand.hidden = true; return; }
    scope.textContent = `Seven complete source-calendar days: ${result.startDay}–${result.endDay}. Current source day ${result.sourceDay} is excluded. ${result.classifiedItems} exact-name fashion matches / ${result.providerItems} cash market records; ${result.withActivity} have retained counts in this window. Source publication: ${result.publication}.`;
    const rows = [...result.rows].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (av === null) return bv === null ? a.slug.localeCompare(b.slug) : 1;
      if (bv === null) return -1;
      return (typeof av === 'number' ? av - bv : av.localeCompare(bv)) * (ascending ? 1 : -1) || a.slug.localeCompare(b.slug);
    });
    if (!rows.length) { tableHost.append(make('p', 'notice', 'No unambiguous official fashion-name matches are available in this cash collection. Other cash items are not assumed to be fashion.')); expand.hidden = true; return; }
    const table = make('table'); table.setAttribute('aria-label', 'Fashion activity by retained daily source counts'); table.dataset.searchReady = 'true';
    const caption = make('caption', '', `${showAll ? 'All' : 'Top 10'} covered fashion items · ordered by ${sortKey === 'quantity' ? 'recorded quantity' : sortKey === 'turnoverProxy' ? 'estimated meso turnover proxy' : sortKey === 'observedDays' ? 'retained day coverage' : 'item name'} ${ascending ? 'ascending' : 'descending'}`); table.append(caption);
    const head = table.createTHead().insertRow();
    for (const [key, label] of [['name', 'Fashion item'], ['quantity', 'Recorded quantity'], ['turnoverProxy', 'Meso turnover proxy'], ['observedDays', 'Retained days / 7']]) {
      const cell = make('th'); cell.scope = 'col'; cell.setAttribute('aria-sort', key === sortKey ? ascending ? 'ascending' : 'descending' : 'none');
      const button = make('button', '', label + (key === sortKey ? ascending ? ' ↑' : ' ↓' : '')); button.type = 'button'; button.dataset.fashionSort = key; cell.append(button); head.append(cell);
    }
    const tbody = table.createTBody();
    for (const row of showAll ? rows : rows.slice(0, 10)) {
      const tr = tbody.insertRow(); tr.dataset.fashionSlug = row.slug;
      const cell = tr.insertCell(), action = make('button', 'popular-fashion-item', row.name); action.type = 'button'; action.dataset.fashionItem = row.slug; action.title = 'Open retained cash-catalog evidence';
      const spritePath = report?.spriteMap?.[row.slug];
      if (typeof spritePath === 'string' && /^assets\/[a-zA-Z0-9._-]+\.(png|svg|webp|gif)$/.test(spritePath)) { const image = make('img'); image.src = spritePath; image.alt = ''; image.width = image.height = 28; image.loading = 'lazy'; image.addEventListener('error', () => { image.hidden = true; }, { once: true }); action.prepend(image); }
      cell.append(action); tr.insertCell().textContent = number(row.quantity); tr.insertCell().textContent = number(row.turnoverProxy); const coverage = tr.insertCell();
      coverage.textContent = `${row.observedDays} / 7${row.conflicts ? ' · conflicting days omitted' : ''}`; coverage.title = `${row.firstDay || 'No retained count day'}${row.lastDay ? '–' + row.lastDay : ''}; ${row.pricedDays} retained days support the turnover proxy. Missing days are not zero.`;
    }
    tableHost.append(table); expand.hidden = rows.length <= 10; expand.setAttribute('aria-expanded', String(showAll)); expand.textContent = showAll ? 'Show top 10' : `Show all ${rows.length} covered fashion items`;
  }
  function mount() {
    const host = document.getElementById('view-highlights');
    if (!host || document.getElementById('popular-fashion')) return false;
    section = make('section', 'popular-fashion'); section.id = 'popular-fashion'; section.setAttribute('aria-labelledby', 'popular-fashion-title');
    body = make('div', 'popular-fashion-body'); body.id = 'popular-fashion-content';
    const title = make('h2', '', 'Fashion activity in this collection'); title.id = 'popular-fashion-title';
    scope = make('p', 'popular-fashion-scope'); tableHost = make('div', 'table-wrap popular-fashion-table'); expand = make('button', 'popular-fashion-expand'); expand.type = 'button'; expand.setAttribute('aria-controls', 'popular-fashion-content');
    const note = make('p', 'popular-fashion-note', 'Popularity here means recorded source count, not unique buyers, verified transactions, current availability or all server fashion activity. Counts use all retained daily buckets, including low-count days; missing days remain missing. Turnover is Σ(daily median × recorded count), an estimate rather than exact traded mesos. Item-specific quantity conventions can differ. Separate rolling scanner windows and metadata-only items are not added to these counts.');
    const sources = make('details', 'popular-fashion-provenance'), summary = make('summary', '', 'How fashion classification is bounded'); sources.append(summary, make('p', '', 'Only exact, case-insensitive, unambiguous item-name matches to these official Classic World fashion reward tables are included. No fuzzy aliases, assumed crate contents or cash-category-wide classification. This is classification evidence, not proof of a canonical ID, release date or current availability.'));
    for (const edition of evidence.editions) { const p = make('p'), link = make('a', '', edition.title + ' ↗'); link.href = edition.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; p.append(link, document.createTextNode(` · ${edition.names.length} named rewards · receipt ${edition.capturedAt} · SHA-256 ${edition.sha256}`)); sources.append(p); }
    apiScope=make('p','popular-fashion-api-scope');apiScope.dataset.apiFashionScope='true';apiScope.hidden=true;
    const more = make('a', '', 'Browse all cash-source evidence →'); more.href = '#cash-catalog'; body.append(title, scope,apiScope, tableHost, expand, note, more, sources);
    const controls = make('div', 'popular-fashion-controls'); controls.dataset.previewControls = 'popular-fashion'; controls.setAttribute('role', 'group'); controls.setAttribute('aria-label', 'Fashion activity visibility'); toggle = make('button'); toggle.type = 'button'; toggle.setAttribute('aria-controls', body.id); controls.append(toggle, make('small', '', 'Display choice only; indices and source collection are unchanged.')); section.append(body, controls);
    const before = host.querySelector('.highlights-activity'); if (before) before.before(section); else host.append(section);
    toggle.addEventListener('click', () => { enabled = !enabled; try { localStorage.setItem(preference, enabled ? 'on' : 'off'); } catch { /* Continue without persistence. */ } draw(); });
    expand.addEventListener('click', () => { showAll = !showAll; draw(); });
    tableHost.addEventListener('click', event => {
      const sort = event.target.closest('[data-fashion-sort]'); if (sort) { const key = sort.dataset.fashionSort; if (!['name', 'quantity', 'turnoverProxy', 'observedDays'].includes(key)) return; ascending = key === sortKey ? !ascending : key === 'name'; sortKey = key; draw(); tableHost.querySelector(`[data-fashion-sort="${key}"]`)?.focus(); return; }
      const item = event.target.closest('[data-fashion-item]'); if (!item) return; const row = report?.cashCatalog?.rows?.find(row => row.slug === item.dataset.fashionItem); if (!row) return;
      window.location.hash = '#cash-catalog'; window.dispatchEvent(new Event('hashchange')); document.dispatchEvent(new CustomEvent('astracashcataloglookup', { detail: { key: row.slug, query: row.name } }));
    });
    draw(); document.dispatchEvent(new Event('astramarkethighlightsready')); return true;
  }
  document.addEventListener('astramarketsnapshot', event => { report = event.detail; draw(); });
  if (!mount() && !document.getElementById('popular-fashion')) { const observer = new MutationObserver(() => { if (mount()) observer.disconnect(); }); observer.observe(document.body, { childList: true, subtree: true }); }
})();
