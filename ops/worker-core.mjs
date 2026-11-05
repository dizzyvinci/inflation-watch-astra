/**
 * Pure daily-feed computation for a Cloudflare Worker.
 *
 * The caller owns fetching, clocks, last-good storage and atomic publication.
 * Pass checkedAt/builtAt explicitly in production. Omitted clocks default to the
 * source timestamp, never to an invented current observation. No runtime I/O is
 * performed here. The seed is the approved, frozen basket and NX schedule.
 */

const DAY_MS = 86_400_000;
const CATEGORY = Object.freeze({
  Etc: 'Materials', Use: 'Consumables', Scrolls: 'Scrolls', Stars: 'Weapons',
  Weapons: 'Weapons', Equips: 'Equipment', 'Cash Shop': 'Cash Shop',
});
const CATEGORIES = ['Scrolls', 'Equipment', 'Weapons', 'Materials', 'Consumables'];

function fail(message) {
  throw new TypeError(message);
}

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function positive(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function count(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) fail(`Invalid ${label}`);
  return value;
}

function dayTime(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    fail(`Invalid ${label} date`);
  }
  const time = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value) {
    fail(`Invalid ${label} date`);
  }
  return time;
}

function timestamp(value, label) {
  if (typeof value !== 'string') fail(`Invalid ${label} timestamp`);
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!match || +match[2] > 23 || +match[3] > 59 || +match[4] > 59
      || (match[6] !== undefined && (+match[6] > 23 || +match[7] > 59))) {
    fail(`Invalid ${label} timestamp`);
  }
  dayTime(match[1], label);
  const time = Date.parse(value);
  if (!Number.isFinite(time)) fail(`Invalid ${label} timestamp`);
  return time;
}

export function sourceSummary(item, sourceUpdatedAt) {
  // This source summary has no specified lookback and is distinct from h's
  // daily medians. In particular, ask is a seller ask, never a buyer bid.
  const summary = {
    sourceUpdatedAt, window: 'unspecified_source_summary', kind: 'source_published_summary',
  };
  for (const [source, output] of [['p', 'medianSale'], ['p25', 'p25'], ['p75', 'p75'],
    ['lo', 'lowSale'], ['hi', 'highSale'], ['ask', 'medianSellerAsk']]) {
    summary[output] = positive(item[source]) ? item[source] : null;
  }
  for (const [source, output] of [['asks', 'listings'], ['sellers', 'sellers']]) {
    summary[output] = Number.isSafeInteger(item[source]) && item[source] >= 0 ? item[source] : null;
  }
  summary.sellThrough = typeof item.st === 'number' && Number.isFinite(item.st)
    && item.st >= 0 && item.st <= 1 ? item.st : null;
  summary.reportedLastSaleAt = null;
  try {
    timestamp(item.last, 'reported last sale');
    summary.reportedLastSaleAt = item.last;
  } catch {
    // An invalid optional summary timestamp cannot invalidate daily medians.
  }
  return summary;
}

// Catalog coverage is additive. It never admits new members into a frozen
// index or mixes a rolling scanner median into daily provider history.
export function computeCashCatalog(feed, config, cashBasket = {}, rollingReference = {}, identities = [], metadataItems = []) {
  cashBasket ??= {};
  rollingReference ??= {};
  const identityBySlug = new Map(identities.map(entry => [entry.slug, entry]));
  const members = new Set((cashBasket.rows ?? []).map(row => row.slug));
  const rolling = rollingReference.items ?? [];
  const rows = feed.items.filter(item => item.k === 'Cash Shop').map(item => {
    const history = item.h.map(point => [...point]);
    const qualified = history.filter(point => point[2] >= 5);
    const latest = qualified.at(-1);
    const summary = sourceSummary(item, feed.updatedAt);
    const configuredNx = config.nx_prices?.[item.n];
    const nx = positive(configuredNx) ? configuredNx : null;
    const member = members.has(item.s);
    const reasons = [];
    if (!member) {
      if (nx === null) reasons.push('no_verified_fixed_nx_cost');
      if (!qualified.some(point => config.base_start <= point[0] && point[0] <= config.base_end)) {
        reasons.push('no_qualifying_reference_period_history_in_retained_source');
      }
      reasons.push('outside_frozen_cash_cohort');
    }
    const observations = [{ ...summary, kind: 'daily_provider_summary', sourceUrl: config.feed_url }];
    const identity = identityBySlug.get(item.s);
    const canonicalId = identity?.name === item.n ? identity.id : null;
    for (const observation of rolling) {
      if (!(identity && observation.id === canonicalId && rollingReference.sourceUrl === 'https://mesos.watch/'
        && rollingReference.planHash === identity.planHash && observation.expectedItemId === canonicalId
        && observation.expectedItemName === item.n && observation.name === item.n
        && observation.priceBasis === 'median of sales' && positive(observation.price)
        && positive(observation.windowDays))) continue;
      const fields = ['id', 'price', 'priceBasis', 'salesCounted', 'windowDays', 'capturedAt',
        'captureTimeKind', 'sourceObservedAt', 'observationTimestampKnown',
        'sourceWindowStartAt', 'sourceWindowEndAt', 'statRoll', 'statRollKnown',
        'statRollStatus', 'variantKey', 'seriesKey'];
      observations.push({ kind: 'rolling_scanner_median', sourceUrl: `https://mesos.watch/item/${canonicalId}`,
        ...Object.fromEntries(fields.map(field => [field, observation[field] ?? null])) });
    }
    return {
      name: item.n, slug: item.s, category: 'Cash Shop', canonicalId,
      sourceUrl: `https://maplestory-classic.com/market/${item.s}`, sourceUpdatedAt: feed.updatedAt,
      publisherMedian: summary.medianSale, publisherP25: summary.p25, publisherP75: summary.p75,
      sourceSummary: summary, sourceLastSeenAt: summary.reportedLastSaleAt,
      sourceLastSeenKind: 'provider_reported_last_sale_unconfirmed',
      firstObservedDay: history[0]?.[0] ?? null, lastHistoryDay: history.at(-1)?.[0] ?? null,
      historyDays: history.length, qualifyingDays: qualified.length,
      recordedCount: safeSum(history.map(point => point[2]), 'catalog recorded count', true), history,
      price: latest?.[1] ?? null, priceDay: latest?.[0] ?? null, quantity: latest?.[2] ?? null,
      partial: !!latest && latest[0] === feed.updatedAt.slice(0, 10),
      knownNxCost: nx, inCashBasket: member, notIndexed: !member, notIndexedReasons: reasons,
      limitedHistory: qualified.length < 7, sourceObservations: observations,
    };
  });
  const metadata = cashCatalogMetadata(metadataItems, rows);
  return {
    schemaVersion: 1, kind: 'cash_shop_source_catalog',
    sourceScope: 'daily_provider_collection_with_verified_supplemental_observations',
    sourceUrl: config.feed_url, sourceUpdatedAt: feed.updatedAt,
    baseStart: config.base_start, baseEnd: config.base_end,
    cashIndexStatus: cashBasket.status ?? 'unavailable', cashIndexBasketHash: cashBasket.basketHash ?? null,
    qualification: { minimumDailyCount: 5, limitedHistoryBelowDays: 7 }, itemCount: rows.length,
    providerItemCount: rows.length, catalogItemCount: rows.length + metadata.filter(item => !item.marketDataAvailable).length,
    identityMap: copyJson(identities), metadataItems: metadata,
    coverage: {
      sourceCashItems: rows.length, withPublisherMedian: rows.filter(row => row.publisherMedian !== null).length,
      withQualifyingHistory: rows.filter(row => row.qualifyingDays > 0).length,
      fixedNxItems: rows.filter(row => row.knownNxCost !== null).length,
      cashIndexItems: rows.filter(row => row.inCashBasket).length,
      withRollingObservation: rows.filter(row => row.sourceObservations.length > 1).length,
    },
    notes: {
      firstObservedDay: 'First observed in retained collected daily history; not a release date.',
      counts: 'Recorded source volume is inferred, not independently confirmed transactions.',
      limitedHistory: 'Fewer than 7 daily points with recorded count at least 5; a display flag, not an accuracy test.',
      windows: 'Daily history, unspecified publisher summary and item-specific rolling captures are separate observations.',
      scope: 'This provider collection plus verified supplemental observations and game metadata is not a complete cash-item universe.',
      metadata: 'Game metadata establishes item identity, not a market price, fixed NX cost, release date or verified trade.',
    }, rows,
  };
}

export function cashCatalogMetadata(entries, rows) {
  if (object(entries)) entries = entries.schemaVersion === 1 ? entries.items ?? [] : [];
  if (!Array.isArray(entries)) return [];
  const result = [], seen = new Set();
  const byId = new Map(rows.filter(row => row.canonicalId !== null).map(row => [row.canonicalId, row]));
  for (const entry of entries.slice(0, 64)) {
    if (!object(entry) || !Number.isSafeInteger(entry.id) || entry.id <= 0 || seen.has(entry.id)
        || typeof entry.name !== 'string' || !entry.name.trim() || entry.name.length > 200
        || entry.cash !== true || entry.region !== 'MCW' || entry.version !== '1'
        || entry.sourceUrl !== `https://maplestory.io/api/MCW/1/item/${entry.id}`) continue;
    try { timestamp(entry.metadataCapturedAt, 'metadata capture'); } catch { continue; }
    seen.add(entry.id);
    const linked = byId.get(entry.id);
    result.push({
      id: entry.id, name: entry.name, category: 'Cash Shop', cash: true,
      region: 'MCW', version: '1', sourceUrl: entry.sourceUrl, metadataCapturedAt: entry.metadataCapturedAt,
      metadataCaptureTimeKind: ['local_receipt_file_timestamp', 'http_response_received_at'].includes(entry.metadataCaptureTimeKind) ? entry.metadataCaptureTimeKind : 'captured_at',
      marketDataAvailable: !!linked, providerSlug: linked?.slug ?? null, knownNxCost: linked?.knownNxCost ?? null,
      inCashBasket: !!linked?.inCashBasket, notIndexed: !linked?.inCashBasket,
      notIndexedReasons: linked?.notIndexedReasons ?? ['metadata_only_no_market_observations', 'no_verified_fixed_nx_cost', 'outside_frozen_cash_cohort'],
      price: null, priceDay: null, quantity: null, publisherMedian: null, publisherP25: null, publisherP75: null,
      history: [], firstObservedDay: null, sourceLastSeenAt: null,
      sourceObservations: [{ kind: 'game_item_metadata', sourceUrl: entry.sourceUrl, metadataCapturedAt: entry.metadataCapturedAt }],
    });
  }
  return result;
}

// Clone JSON values without letting JSON.stringify silently turn NaN into null.
function copyJson(value, path = 'value') {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail(`Non-finite number at ${path}`);
    return value;
  }
  if (Array.isArray(value)) return value.map((entry, i) => copyJson(entry, `${path}[${i}]`));
  if (object(value)) {
    const out = {};
    for (const [key, entry] of Object.entries(value)) {
      Object.defineProperty(out, key, {
        value: copyJson(entry, `${path}.${key}`), enumerable: true, writable: true, configurable: true,
      });
    }
    return out;
  }
  fail(`Non-JSON value at ${path}`);
}

function safeSum(values, label, integers = false) {
  let total = 0;
  for (const value of values) {
    total += value;
    if (!Number.isFinite(total) || (integers && !Number.isSafeInteger(total))) {
      fail(`Unsafe ${label} total`);
    }
  }
  return total;
}

function validateFeed(feed, checkedTime, seed) {
  if (!object(feed) || !Array.isArray(feed.items) || feed.items.length < 50) {
    fail('Feed has no usable item list');
  }
  const sourceTime = timestamp(feed.updatedAt, 'feed');
  if (sourceTime > checkedTime + 600_000) fail('Feed timestamp is in the future');
  if (seed.sourceUpdatedAt && sourceTime < timestamp(seed.sourceUpdatedAt, 'seed source')) {
    fail('Source timestamp moved backwards; retain last good output');
  }
  const sourceDay = feed.updatedAt.slice(0, 10);
  const seen = new Set();
  for (const item of feed.items) {
    if (!object(item) || typeof item.n !== 'string' || !item.n.trim()
        || typeof item.s !== 'string' || !item.s.trim() || seen.has(item.s)
        || !Object.hasOwn(CATEGORY, item.k) || !Array.isArray(item.h)
        || (item.u !== undefined && typeof item.u !== 'string')) {
      fail('Malformed or duplicate feed item');
    }
    seen.add(item.s);
    if (item.sold !== undefined) count(item.sold, 'sold count');
    let previous = '';
    for (const observation of item.h) {
      if (!Array.isArray(observation) || observation.length !== 3) fail('Malformed historical observation');
      const [day, price, quantity] = observation;
      dayTime(day, 'observation');
      if (day <= previous || day > sourceDay || !positive(price)) fail('Invalid historical observation');
      count(quantity, 'historical quantity');
      if (!Number.isFinite(price * quantity)) fail('Unsafe historical turnover');
      previous = day;
    }
  }
}

function validateSeed(seed, config) {
  if (!object(seed) || seed.schemaVersion !== 1 || !Array.isArray(seed.rows)
      || seed.rows.length !== 50 || !Array.isArray(seed.cash) || !seed.cash.length) {
    fail('Seed must contain the approved 50-item basket and NX schedule');
  }
  if (!Number.isSafeInteger(seed.basketVersion) || seed.basketVersion < 1) fail('Invalid basket version');
  if (!positive(seed.baseNxRate)) fail('Seed must retain a positive frozen base NX rate');
  if (seed.methodVersion !== undefined && seed.methodVersion !== seed.basketVersion) {
    fail('Method version does not match the frozen basket');
  }
  for (const key of ['baseStart', 'baseEnd', 'selectionStart', 'selectionEndExclusive']) {
    dayTime(seed[key], `seed ${key}`);
  }
  if (seed.baseStart > seed.baseEnd || seed.selectionStart >= seed.selectionEndExclusive) {
    fail('Invalid frozen basket dates');
  }
  if ((config.base_start !== undefined && config.base_start !== seed.baseStart)
      || (config.base_end !== undefined && config.base_end !== seed.baseEnd)
      || (config.basket_size !== undefined && config.basket_size !== seed.rows.length)
      || (config.basket_version !== undefined && config.basket_version !== seed.basketVersion)) {
    fail('Configuration cannot rebase the frozen seed basket');
  }
  if (object(seed.indexSpecification)) {
    const specFields = {
      weight_cap: 'weightCap', minimum_base_daily_volume: 'minimumBaseDailyVolume',
      basket_liquidity_daily_volume: 'liquidityDailyVolume',
      basket_minimum_liquidity_days: 'minimumLiquidityDays',
    };
    for (const [configKey, specKey] of Object.entries(specFields)) {
      if (config[configKey] !== undefined && config[configKey] !== seed.indexSpecification[specKey]) {
        fail('Configuration cannot change the frozen index specification');
      }
    }
  }
  const slugs = new Set();
  for (const row of seed.rows) {
    if (!object(row) || typeof row.slug !== 'string' || !row.slug
        || slugs.has(row.slug) || !positive(row.basePrice) || !positive(row.weight)) {
      fail('Invalid frozen basket row');
    }
    slugs.add(row.slug);
  }
  if (Math.abs(safeSum(seed.rows.map(row => row.weight), 'basket weight') - 1) > 1e-9) {
    fail('Frozen basket weights must sum to one');
  }
  const cashSlugs = new Set();
  for (const row of seed.cash) {
    if (!object(row) || typeof row.slug !== 'string' || !row.slug
        || typeof row.name !== 'string' || !row.name || !positive(row.nx)
        || cashSlugs.has(row.slug)) fail('Invalid frozen NX schedule');
    cashSlugs.add(row.slug);
  }
}

function nxRate(points) {
  const quantity = safeSum(points.map(point => point[2]), 'NX quantity', true);
  if (!quantity) return null;
  return safeSum(points.map(([price, nx, qty]) => price / nx * qty), 'NX rate') / quantity;
}

function recentStats(history, start, end) {
  const observations = history.filter(([day]) => start <= day && day < end);
  return {
    recentQuantity: safeSum(observations.map(point => point[2]), 'recent quantity', true),
    recentTurnoverProxy: safeSum(observations.map(([, price, quantity]) => price * quantity), 'recent turnover'),
  };
}

function volumeHistory(items, basketSlugs, sourceDay) {
  const days = new Map();
  for (const item of items) {
    for (const [day, price, quantity] of item.h) {
      if (!days.has(day)) days.set(day, {
        day, at: `${day}T12:00:00Z`, allMesos: 0, basketMesos: 0,
        allSoldVolume: 0, basketSoldVolume: 0, allItemsObserved: 0,
        basketItemsObserved: 0, partial: day === sourceDay,
      });
      const point = days.get(day);
      point.allMesos = safeSum([point.allMesos, price * quantity], 'daily turnover');
      point.allSoldVolume = safeSum([point.allSoldVolume, quantity], 'daily quantity', true);
      point.allItemsObserved += 1;
      if (basketSlugs.has(item.s)) {
        point.basketMesos = safeSum([point.basketMesos, price * quantity], 'daily basket turnover');
        point.basketSoldVolume = safeSum([point.basketSoldVolume, quantity], 'daily basket quantity', true);
        point.basketItemsObserved += 1;
      }
    }
  }
  return [...days.keys()].sort().map(day => days.get(day));
}

/**
 * Recompute daily-derived fields, preserving independently dated seed evidence.
 * Live/intraday normalization is deliberately outside this public-feed adapter:
 * a daily check never creates scanner sales or renews their observation times.
 */
export function computeCashBasket(feed, seedBasket, config = {}) {
  const unavailable = reason => ({
    status: 'unavailable', reason, kind: 'cash_price_index', experimental: true,
    version: 1, methodVersion: 1, baseStart: seedBasket?.baseStart ?? config.base_start ?? null,
    baseEnd: seedBasket?.baseEnd ?? config.base_end ?? null, baseIndex: 100,
    configuredItemCount: seedBasket?.configuredItemCount ?? Object.keys(config.nx_prices ?? {}).length,
    missingBaselineCount: null, missingBaselineNames: [], itemCount: 0,
    sourceUpdatedAt: feed.updatedAt, rows: [], history: [], latest: null, historyKind: 'reconstructed',
  });
  try {
    if (!object(seedBasket) || seedBasket.status !== 'ok') return unavailable('Frozen cash baseline is unavailable in the compiled seed');
    const spec = seedBasket.indexSpecification;
    if (seedBasket.version !== 1 || seedBasket.kind !== 'cash_price_index' || !object(spec)
        || spec.methodVersion !== 1 || spec.weightCap !== 0.08 || spec.minimumBaseDailyVolume !== 5
        || spec.minimumBaseObservationDays !== 1 || !Array.isArray(spec.configuredCashSchedule)) {
      return unavailable('Unsupported frozen cash basket specification');
    }
    dayTime(spec.baseStart, 'cash base start');
    dayTime(spec.baseEnd, 'cash base end');
    if (spec.baseStart > spec.baseEnd || seedBasket.baseStart !== spec.baseStart || seedBasket.baseEnd !== spec.baseEnd) {
      return unavailable('Invalid frozen cash reference period');
    }
    for (const [key, field] of [['base_start', 'baseStart'], ['base_end', 'baseEnd'], ['feed_url', 'sourceUrl'], ['weight_cap', 'weightCap']]) {
      if (config[key] !== undefined && config[key] !== spec[field]) return unavailable('Frozen cash basket configuration changed; explicit new version required');
    }
    const schedule = new Map(spec.configuredCashSchedule.map(row => [row.name, row.nx]));
    if (schedule.size !== spec.configuredCashSchedule.length || [...schedule.values()].some(nx => !positive(nx))) {
      return unavailable('Invalid frozen cash schedule');
    }
    if (config.nx_prices !== undefined && (Object.keys(config.nx_prices).length !== schedule.size
        || [...schedule].some(([name, nx]) => config.nx_prices[name] !== nx))) {
      return unavailable('Frozen cash basket configuration changed; explicit new version required');
    }
    for (const key of ['specificationHash', 'basketHash', 'sourceSnapshotHash']) {
      if (!/^[a-f0-9]{64}$/.test(seedBasket[key] ?? '')) return unavailable('Missing frozen cash integrity metadata');
    }
    // The bundled seed is trusted and Python checks its canonical hashes at
    // creation/load. Validate its numerical definition here without rebasing it.
    const bases = seedBasket.rows;
    if (!Array.isArray(bases) || bases.length < 13 || new Set(bases.map(row => row.slug)).size !== bases.length
        || new Set(bases.map(row => row.name)).size !== bases.length) return unavailable('Invalid frozen cash cohort');
    if (bases.some(row => !object(row) || typeof row.slug !== 'string' || !row.slug || schedule.get(row.name) !== row.nx
        || ['basePrice', 'baseQuantity', 'baseExpenditure', 'weight'].some(key => !positive(row[key]))
        || row.weight > 0.08 + 1e-10 || !Number.isSafeInteger(row.baseObservationDays) || row.baseObservationDays < 1)
        || Math.abs(safeSum(bases.map(row => row.weight), 'cash weights') - 1) > 1e-9) {
      return unavailable('Invalid frozen cash baseline weights or prices');
    }
    const sourceDay = feed.updatedAt.slice(0, 10);
    const bySlug = new Map(feed.items.map(item => [item.s, item]));
    const frozenFields = ['slug', 'name', 'nx', 'basePrice', 'baseQuantity', 'baseExpenditure', 'baseObservationDays', 'weight'];
    const rows = bases.map(base => {
      const frozen = Object.fromEntries(frozenFields.map(key => [key, base[key]]));
      const item = bySlug.get(base.slug);
      const valid = item?.k === 'Cash Shop' && item.n === base.name;
      const history = valid ? item.h.filter(point => point[0] <= sourceDay && point[2] >= 5).map(point => [...point]) : [];
      const last = history.at(-1), price = last?.[1] ?? null;
      return {
        ...frozen, history, price, priceDay: last?.[0] ?? null, quantity: last?.[2] ?? null,
        sourceUpdatedAt: feed.updatedAt, missingSource: !valid,
        changeBase: last ? (price / base.basePrice - 1) * 100 : null,
        indexContribution: last ? 100 * base.weight * price / base.basePrice : null,
        changeContribution: last ? 100 * base.weight * (price / base.basePrice - 1) : null,
      };
    });
    const dates = [...new Set([sourceDay, ...feed.items.flatMap(item => item.h.filter(point => point[2] >= 5 && point[0] <= sourceDay).map(point => point[0]))])].sort();
    const history = dates.map(day => {
      const points = [];
      let priced = 0, observed = 0;
      for (const row of rows) {
        let last;
        for (const point of row.history) {
          if (point[0] > day) break;
          last = point;
        }
        if (last) {
          points.push(row.weight * last[1] / row.basePrice);
          priced += row.weight;
          if (last[0] === day) observed += row.weight;
        }
      }
      return { at: day === sourceDay ? feed.updatedAt : `${day}T23:59:59Z`, day,
        cpi: priced > 0.999999 ? 100 * safeSum(points, 'cash index') : null,
        coverage: observed, pricedCoverage: priced, partial: day === sourceDay };
    });
    const metadata = Object.fromEntries(['indexSpecification', 'specificationHash', 'basketHash', 'sourceSnapshotHash',
      'selectionSourceUpdatedAt', 'selectedAt'].map(key => [key, seedBasket[key]]));
    return {
      status: 'ok', reason: null, kind: 'cash_price_index', experimental: true,
      version: 1, methodVersion: 1, baseStart: spec.baseStart, baseEnd: spec.baseEnd, baseIndex: 100,
      configuredItemCount: schedule.size, missingBaselineCount: seedBasket.missingBaselineNames.length,
      missingBaselineNames: [...seedBasket.missingBaselineNames], itemCount: rows.length, ...metadata,
      baseExpenditure: safeSum(rows.map(row => row.baseExpenditure), 'cash base expenditure'),
      baseQuantity: safeSum(rows.map(row => row.baseQuantity), 'cash base quantity'),
      sourceUpdatedAt: feed.updatedAt, historyKind: 'reconstructed', rows, history, latest: history.at(-1),
    };
  } catch (error) {
    return unavailable(`Cash basket unavailable: ${error.message}`);
  }
}

export function computeReport(feed, seedReport, {
  checkedAt, builtAt, sourceStatus, config = {},
} = {}) {
  if (!object(config)) fail('Invalid configuration');
  validateSeed(seedReport, config);
  const checked = checkedAt ?? sourceStatus?.checkedAt ?? builtAt ?? feed?.updatedAt;
  const generated = builtAt ?? checked;
  const checkedTime = timestamp(checked, 'check');
  timestamp(generated, 'build');
  if (sourceStatus !== undefined && !object(sourceStatus)) fail('Invalid source status');
  validateFeed(feed, checkedTime, seedReport);
  // Cloning also rejects non-finite seed/reference numbers before publication.
  const report = copyJson(seedReport, 'seed');
  const sourceDay = feed.updatedAt.slice(0, 10);
  const cutoff = dayTime(sourceDay, 'source');
  const recentStart = new Date(cutoff - 7 * DAY_MS).toISOString().slice(0, 10);
  const recentEnd = sourceDay;
  const bySlug = new Map(feed.items.map(item => [item.s, item]));
  const missing = report.rows.filter(row => !bySlug.has(row.slug)).map(row => row.slug);
  if (missing.length) fail(`Basket members disappeared; retain last good output instead of rebasing: ${missing.join(', ')}`);

  const rows = report.rows.map(base => {
    const item = bySlug.get(base.slug);
    if (item.k === 'Cash Shop') fail(`Basket member changed category to Cash Shop: ${base.slug}`);
    const history = item.h.map(point => [...point]);
    const qualified = history.filter(point => point[2] >= 5);
    if (!qualified.length) fail(`No qualified historical observation for basket member: ${base.slug}`);
    const [priceDay, price, quantity] = qualified.at(-1);
    const previous = qualified.length > 1 ? qualified.at(-2)[1] : price;
    return {
      ...base, name: item.n, category: CATEGORY[item.k], price, priceDay, quantity,
      ...recentStats(history, recentStart, recentEnd), unit: item.u ?? 'unit',
      changeBase: (price / base.basePrice - 1) * 100,
      changeDay: (price / previous - 1) * 100, history,
      indexContribution: 100 * base.weight * price / base.basePrice,
      changeContribution: 100 * base.weight * (price / base.basePrice - 1),
      notIndexed: false,
      sourceSummary: sourceSummary(item, feed.updatedAt),
      sourceUrl: `https://maplestory-classic.com/market/${encodeURIComponent(item.s)}`,
    };
  });
  const selectedSlugs = new Set(rows.map(row => row.slug));
  if (report.contextItems !== undefined && !Array.isArray(report.contextItems)) fail('Invalid context items');
  const contextItems = (report.contextItems ?? []).filter(context => !selectedSlugs.has(context.slug)).map(context => {
    if (!object(context) || typeof context.slug !== 'string' || !context.slug || !positive(context.basePrice)) {
      fail('Invalid frozen context item');
    }
    dayTime(context.priceDay, 'context price');
    const item = bySlug.get(context.slug);
    const qualified = item?.h.filter(point => point[2] >= 5) ?? [];
    const excluded = { weight: 0, notIndexed: true, indexContribution: 0, changeContribution: 0 };
    if (!qualified.length) {
      // This independent item cannot block the index. Keep its original dated
      // observations, and make the retained source date explicit per item.
      return {
        ...context, ...excluded, retained: true,
        sourceSummary: item ? sourceSummary(item, feed.updatedAt) : null,
        retainedReason: item ? 'No qualified current source history; retained prior context.' : 'Context item missing from source; retained prior context.',
        sourceUpdatedAt: context.sourceUpdatedAt ?? seedReport.sourceUpdatedAt,
        recentStart: context.recentStart ?? seedReport.recentStart
          ?? new Date(dayTime(seedReport.sourceUpdatedAt.slice(0, 10), 'seed context source') - 7 * DAY_MS).toISOString().slice(0, 10),
        recentEndExclusive: context.recentEndExclusive ?? seedReport.recentEndExclusive
          ?? seedReport.sourceUpdatedAt.slice(0, 10),
      };
    }
    const [priceDay, price, quantity] = qualified.at(-1);
    const previous = qualified.length > 1 ? qualified.at(-2)[1] : price;
    const refreshed = {
      ...context, ...excluded, name: item.n, category: CATEGORY[item.k],
      price, priceDay, quantity, ...recentStats(item.h, recentStart, recentEnd),
      changeBase: (price / context.basePrice - 1) * 100,
      changeDay: (price / previous - 1) * 100,
      unit: item.u ?? 'unit', history: item.h.map(point => [...point]),
      sourceUrl: `https://maplestory-classic.com/market/${encodeURIComponent(item.s)}`,
      sourceUpdatedAt: feed.updatedAt, retained: false,
      sourceSummary: sourceSummary(item, feed.updatedAt),
      recentStart, recentEndExclusive: recentEnd,
    };
    delete refreshed.retainedReason;
    return refreshed;
  });
  const cash = [];
  for (const schedule of report.cash) {
    const item = bySlug.get(schedule.slug);
    if (!item) continue;
    if (item.k !== 'Cash Shop') fail(`NX schedule member changed category: ${schedule.slug}`);
    const qualified = item.h.filter(point => point[2] >= 5);
    if (!qualified.length) continue;
    const [priceDay, price, quantity] = qualified.at(-1);
    cash.push({
      name: item.n, slug: item.s, nx: schedule.nx, price, priceDay, quantity,
      rate: price / schedule.nx,
      recentQuantity: recentStats(item.h, recentStart, recentEnd).recentQuantity,
      history: item.h.map(point => [...point]),
      sourceSummary: sourceSummary(item, feed.updatedAt),
    });
  }

  const dates = [...new Set(feed.items.flatMap(item => item.h.map(point => point[0])))].sort();
  if (!dates.length) fail('Feed has no historical observations');
  const history = dates.map(day => {
    const points = [];
    let covered = 0;
    let observed = 0;
    for (const row of rows) {
      // Carry a qualified historical price forward for CPI, matching the daily
      // engine. Coverage explicitly counts only observations on this date.
      let last;
      for (const observation of row.history) {
        if (observation[0] > day) break;
        if (observation[2] >= 5) last = observation;
      }
      if (last) {
        points.push(row.weight * last[1] / row.basePrice);
        covered += row.weight;
        if (last[0] === day) observed += row.weight;
      }
    }
    const cashPoints = [];
    for (const row of cash) {
      const observation = row.history.find(point => point[0] === day && point[2] >= 5);
      if (observation) cashPoints.push([observation[1], row.nx, observation[2]]);
    }
    return {
      at: day === sourceDay ? feed.updatedAt : `${day}T23:59:59Z`, day,
      cpi: covered > 0.999999 ? safeSum(points, 'CPI') * 100 : null,
      coverage: observed, nxRate: cashPoints.length >= 3 ? nxRate(cashPoints) : null,
      cashItems: cashPoints.length, partial: day === sourceDay,
    };
  });
  const categories = CATEGORIES.flatMap(name => {
    const subset = rows.filter(row => row.category === name);
    const weight = safeSum(subset.map(row => row.weight), 'category weight');
    return weight ? [{
      name, count: subset.length, weight,
      index: safeSum(subset.map(row => row.weight * row.price / row.basePrice), 'category index') / weight * 100,
    }] : [];
  });
  const totals = feed.items.map(item => recentStats(item.h, recentStart, recentEnd));
  const allRecentQuantity = safeSum(totals.map(row => row.recentQuantity), 'all recent quantity', true);
  const allTurnover = safeSum(totals.map(row => row.recentTurnoverProxy), 'all recent turnover');
  const basketRecentQuantity = safeSum(rows.map(row => row.recentQuantity), 'basket recent quantity', true);
  const basketTurnover = safeSum(rows.map(row => row.recentTurnoverProxy), 'basket recent turnover');
  const pollSeconds = config.poll_seconds ?? report.pollSeconds ?? 600;
  if (!Number.isSafeInteger(pollSeconds) || pollSeconds < 1) fail('Invalid poll interval');
  const feedUrl = config.feed_url ?? report.feedUrl;
  if (typeof feedUrl !== 'string' || !feedUrl.startsWith('https://')) fail('Invalid public feed URL');
  Object.assign(report, {
    builtAt: generated, sourceUpdatedAt: feed.updatedAt,
    sourceStatus: { ...copyJson(sourceStatus ?? {}, 'sourceStatus'), status: sourceStatus?.status ?? 'ok', checkedAt: checked },
    pollSeconds, feedUrl, lastCompleteDay: new Date(cutoff - DAY_MS).toISOString().slice(0, 10),
    recentStart, recentEndExclusive: recentEnd,
    itemsAvailable: feed.items.length,
    salesSinceLaunch: safeSum(feed.items.map(item => item.sold ?? 0), 'sales since launch', true),
    allRecentQuantity, basketRecentQuantity,
    quantityCoverage: allRecentQuantity ? basketRecentQuantity / allRecentQuantity : null,
    turnoverCoverageProxy: allTurnover ? basketTurnover / allTurnover : null,
    latest: history.at(-1), baseNxRate: seedReport.baseNxRate, rows, contextItems, cash, categories, history,
    volumeHistory: volumeHistory(feed.items, new Set(rows.map(row => row.slug)), sourceDay),
    cashBasket: computeCashBasket(feed, seedReport.cashBasket, config),
  });
  report.cashCatalog = computeCashCatalog(feed, {
    feed_url: feedUrl, base_start: seedReport.baseStart, base_end: seedReport.baseEnd,
    nx_prices: Object.fromEntries(seedReport.cash.map(row => [row.name, row.nx])),
  }, report.cashBasket, seedReport.rollingReference, seedReport.cashCatalog?.identityMap ?? [], seedReport.cashCatalog?.metadataItems ?? []);
  // Catch arithmetic overflow in any computed field. Independent references,
  // qualified live data and their original dates pass through unchanged.
  return copyJson(report, 'report');
}
