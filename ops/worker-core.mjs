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
  });
  // Catch arithmetic overflow in any computed field. Independent references,
  // qualified live data and their original dates pass through unchanged.
  return copyJson(report, 'report');
}
