(() => {
'use strict';
// ops/portable-hash.mjs
var HASH_METHOD = "mcat-typed-utf8-f64-v1";
var encoder = new TextEncoder();
function utf8(text) {
  for (const char of text) {
    const point = char.codePointAt(0);
    if (point >= 55296 && point <= 57343) throw Error("Unpaired surrogate is not valid UTF-8");
  }
  return encoder.encode(text);
}
function codepointCompare(a, b) {
  const left = Array.from(a), right = Array.from(b);
  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    const difference = left[i].codePointAt(0) - right[i].codePointAt(0);
    if (difference) return difference;
  }
  return left.length - right.length;
}
function concat(parts) {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}
function canonicalBytes(value) {
  if (value === null) return utf8("z");
  if (typeof value === "boolean") return utf8(value ? "t" : "f");
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) throw Error("Unsupported canonical number");
    const buffer = new ArrayBuffer(8);
    new DataView(buffer).setFloat64(0, value === 0 ? 0 : value, false);
    return utf8("n" + [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join(""));
  }
  if (typeof value === "string") {
    const bytes = utf8(value);
    return concat([utf8("s" + bytes.byteLength + ":"), bytes]);
  }
  if (Array.isArray(value)) {
    if (Object.keys(value).length !== value.length) throw Error("Sparse arrays are not canonical");
    return concat([utf8("a" + value.length + ":"), ...value.map(canonicalBytes)]);
  }
  if (value && typeof value === "object" && [Object.prototype, null].includes(Object.getPrototypeOf(value))) {
    const keys = Object.keys(value).sort(codepointCompare);
    return concat([utf8("o" + keys.length + ":"), ...keys.flatMap((key) => [canonicalBytes(key), canonicalBytes(value[key])])]);
  }
  throw Error("Unsupported canonical value");
}
async function portableHash(value) {
  const bytes = concat([utf8(HASH_METHOD + "\n"), canonicalBytes(value)]);
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

// ops/api-index-public-contract.mjs
var MAX_PUBLIC_BYTES = 6e5;
var ITEM_HISTORY_COLUMNS = Object.freeze(["day", "medianUnitPriceLexeme", "recordedSalesCount", "reportedUnitCount", "qualified", "partialCalendarDay", "sourceContextId", "linkedPrice"]);
var HASH = /^[a-f0-9]{64}$/;
var METHOD = "api-v2-chainlink-20261104-v1";
var fail = (code) => {
  throw Error("api_index_" + code);
};
var near = (a, b) => {
  if (Math.abs(a - b) > Math.max(1e-9, Math.abs(b) * 1e-12)) fail("formula");
};
function shape(v, keys, optional = []) {
  if (!v || typeof v !== "object" || Array.isArray(v) || keys.some((k) => !Object.hasOwn(v, k)) || Object.keys(v).some((k) => !keys.includes(k) && !optional.includes(k))) fail("fields");
}
function hash(v) {
  if (typeof v !== "string" || !HASH.test(v)) fail("hash");
}
function n(v, min = -Number.MAX_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER) {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) fail("number");
}
function count(v, max = Number.MAX_SAFE_INTEGER) {
  n(v, 0, max);
  if (!Number.isSafeInteger(v)) fail("count");
}
function nullableNumber(v, min = 0) {
  if (v !== null) n(v, min);
}
function str(v, max = 300) {
  if (typeof v !== "string" || !v.trim() || v.length > max) fail("text");
}
function price(v) {
  if (v !== null && (typeof v !== "string" || v.length > 160 || !/^\d+(?:\.\d+)?$/.test(v) || !Number.isFinite(Number(v)) || Number(v) > Number.MAX_SAFE_INTEGER)) fail("price_lexeme");
}
function clock(v) {
  str(v, 40);
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(v) || !Number.isFinite(Date.parse(v)) || new Date(v).toISOString().slice(0, 10) !== v.slice(0, 10)) fail("clock");
}
function day(v) {
  str(v, 10);
  if (!/^\d{4}-\d\d-\d\d$/.test(v) || (/* @__PURE__ */ new Date(v + "T00:00:00Z")).toISOString().slice(0, 10) !== v) fail("day");
}
function status(v) {
  if (!["available", "unavailable"].includes(v.status) || v.available !== (v.status === "available")) fail("status");
}
function source(v, op) {
  if (v === null) return;
  shape(v, ["operation", "sourceUrl", "rawBodySha256", "capturedAt", "sourceObservedAt", "captureTimeKind"], op === "prices" ? ["reportedDays", "exactStartAt", "exactEndAt", "captureHash"] : ["sourceGeneratedAt"]);
  if (v.operation !== op || v.sourceUrl !== (op === "prices" ? "https://maplestory.market/api/prices" : "https://maplestory.market/api/market/overview") || v.sourceObservedAt !== null || v.captureTimeKind !== "http_response_completed") fail("source");
  hash(v.rawBodySha256);
  clock(v.capturedAt);
  if (op === "prices") {
    if (v.reportedDays !== 3 || v.exactStartAt !== null || v.exactEndAt !== null) fail("window");
    hash(v.captureHash);
  } else {
    clock(v.sourceGeneratedAt);
    if (Date.parse(v.sourceGeneratedAt) > Date.parse(v.capturedAt)) fail("future_generated");
  }
}
function benchmark(v, kind) {
  if (kind === "fixed") {
    shape(v, ["status", "available", "rateMesosPerNx"], ["reason", "basis", "baseRate"]);
    status(v);
    nullableNumber(v.rateMesosPerNx);
    if (v.available) {
      if (v.basis !== "frozen_legacy_nx_base_x_current_3day_index") fail("fixed_basis");
      n(v.baseRate, Number.MIN_VALUE);
    } else if (typeof v.reason !== "string") fail("reason");
    return;
  }
  shape(v, ["status", "available", "rateMesosPerNx", "reason", "cashAnchorRate", "meanLinkedDailyMpi", "windowStart", "windowEndExclusive", "dayCount", "missingDays", "basis", "currentCapturedAt"]);
  status(v);
  for (const k of ["rateMesosPerNx", "cashAnchorRate", "meanLinkedDailyMpi"]) nullableNumber(v[k]);
  if (v.basis !== "cash_daily_anchor_x_current_3day_index_over_daily_mean" || v.dayCount !== kind) fail("rolling_basis");
  if (v.windowStart !== null) day(v.windowStart);
  if (v.windowEndExclusive !== null) day(v.windowEndExclusive);
  if (v.currentCapturedAt !== null) clock(v.currentCapturedAt);
  if (!Array.isArray(v.missingDays) || v.missingDays.length > kind) fail("missing_days");
  v.missingDays.forEach(day);
  if (v.available && (v.reason !== null || v.missingDays.length || v.rateMesosPerNx === null || v.cashAnchorRate === null || v.meanLinkedDailyMpi === null)) fail("available_benchmark");
}
function validateApiIndexSnapshot(v, { expectedDefinitionHash, expectedRows, expectedCashRows } = {}) {
  shape(v, ["schemaVersion", "kind", "methodVersion", "definitionHash", "calibration", "sources", "current", "daily", "benchmarks", "maxInputCapturedAt", "publicationEligible", "sourceObservedAt", "qualifiedIndividualTrades", "limitations", "dailyInputHash", "snapshotHash"]);
  if (v.schemaVersion !== 1 || v.kind !== "api_linked_market_calculations" || v.methodVersion !== METHOD || v.publicationEligible !== false || v.sourceObservedAt !== null || v.qualifiedIndividualTrades !== 0) fail("profile");
  hash(v.definitionHash);
  hash(v.dailyInputHash);
  hash(v.snapshotHash);
  if (expectedDefinitionHash !== void 0 && v.definitionHash !== expectedDefinitionHash) fail("definition");
  const c = v.calibration;
  shape(c, ["linkDay", "basketHash", "legacySourceUpdatedAt", "legacyReportSha256", "anchorOverviewRawSha256", "anchorOverviewCapturedAt", "qualityConstant", "retrospectiveLink"]);
  if (c.linkDay !== "2026-11-04" || c.qualityConstant !== false || c.retrospectiveLink !== true) fail("calibration");
  for (const k of ["basketHash", "legacyReportSha256", "anchorOverviewRawSha256"]) hash(c[k]);
  clock(c.legacySourceUpdatedAt);
  clock(c.anchorOverviewCapturedAt);
  shape(v.sources, ["prices", "overview"]);
  source(v.sources.prices, "prices");
  source(v.sources.overview, "overview");
  const clocks = [v.sources.prices?.capturedAt, v.sources.overview?.capturedAt].filter(Boolean).sort((a, b) => Date.parse(a) - Date.parse(b));
  if (v.maxInputCapturedAt !== (clocks.at(-1) ?? null)) fail("input_clock");
  const x = v.current;
  shape(x, ["basis", "status", "available", "index", "expectedItems", "availableItems", "observedWeight", "rows", "categories", "reason"]);
  status(x);
  if (x.basis !== "api_reported_3day_sale_median_reference" || x.expectedItems !== 50 || !Array.isArray(x.rows) || x.rows.length !== 50 || !Array.isArray(x.categories) || x.categories.length > 10) fail("current");
  count(x.availableItems, 50);
  n(x.observedWeight, 0, 1.00000000001);
  nullableNumber(x.index);
  if (x.available !== (x.availableItems === 50) || x.available !== (x.index !== null) || x.available && v.sources.prices === null) fail("current_coverage");
  const ids = /* @__PURE__ */ new Set(), slugs = /* @__PURE__ */ new Set();
  let weight = 0, available2 = 0, index = 0, observedWeight = 0;
  for (const r of x.rows) {
    shape(r, ["itemId", "slug", "name", "category", "weight", "basePrice", "legacyLinkPrice", "APIlinkPrice", "currentSaleMedianLexeme", "currentLinkedPrice", "indexContribution", "changeContribution", "changeBase", "recordedSalesCount"]);
    count(r.itemId, 999999999);
    if (r.itemId === 0 || ids.has(r.itemId) || slugs.has(r.slug)) fail("identity");
    ids.add(r.itemId);
    slugs.add(r.slug);
    str(r.slug, 200);
    str(r.name);
    str(r.category, 80);
    n(r.weight, Number.MIN_VALUE, 0.080000000001);
    weight += r.weight;
    n(r.basePrice, Number.MIN_VALUE);
    n(r.legacyLinkPrice, Number.MIN_VALUE);
    price(r.APIlinkPrice);
    if (r.APIlinkPrice === null || Number(r.APIlinkPrice) <= 0) fail("link_price");
    price(r.currentSaleMedianLexeme);
    if (r.recordedSalesCount !== null) count(r.recordedSalesCount);
    nullableNumber(r.currentLinkedPrice);
    for (const k of ["indexContribution", "changeContribution", "changeBase"]) if (r[k] !== null) n(r[k]);
    if (r.currentLinkedPrice !== null) {
      available2++;
      observedWeight += r.weight;
      if (r.currentSaleMedianLexeme === null || Number(r.currentSaleMedianLexeme) <= 0 || r.recordedSalesCount < 5) fail("thin_current");
      near(r.currentLinkedPrice, r.legacyLinkPrice * Number(r.currentSaleMedianLexeme) / Number(r.APIlinkPrice));
      near(r.indexContribution, 100 * r.weight * r.currentLinkedPrice / r.basePrice);
      near(r.changeBase, 100 * (r.currentLinkedPrice / r.basePrice - 1));
      near(r.changeContribution, r.weight * r.changeBase);
      index += r.indexContribution;
    } else if (r.indexContribution !== null || r.changeContribution !== null || r.changeBase !== null) fail("missing_contribution");
  }
  if (Math.abs(weight - 1) > 1e-12 || available2 !== x.availableItems || x.available && Math.abs(index - x.index) > 1e-9) fail("current_totals");
  near(x.observedWeight, observedWeight);
  if (expectedRows !== void 0) {
    if (!Array.isArray(expectedRows) || expectedRows.length !== 50) fail("expected_rows");
    for (const r of x.rows) {
      const e = expectedRows.find((e2) => e2.itemId === r.itemId);
      if (!e || ["slug", "name", "category", "weight", "basePrice", "legacyLinkPrice", "APIlinkPrice"].some((k) => r[k] !== e[k])) fail("static_row_binding");
    }
  }
  const seenCategories = /* @__PURE__ */ new Set();
  for (const r of x.categories) {
    shape(r, ["category", "index", "changeBase", "weight", "observedWeight", "expectedItems", "availableItems"]);
    str(r.category, 80);
    if (seenCategories.has(r.category)) fail("category_duplicate");
    seenCategories.add(r.category);
    nullableNumber(r.index);
    if (r.changeBase !== null) n(r.changeBase);
    n(r.weight, Number.MIN_VALUE, 1.00000000001);
    n(r.observedWeight, 0, 1.00000000001);
    count(r.expectedItems, 50);
    count(r.availableItems, r.expectedItems);
    const rr = x.rows.filter((x2) => x2.category === r.category), aa = rr.filter((x2) => x2.currentLinkedPrice !== null);
    if (r.expectedItems !== rr.length || r.availableItems !== aa.length || r.index !== null !== (aa.length === rr.length)) fail("category_coverage");
    near(r.weight, rr.reduce((n2, r2) => n2 + r2.weight, 0));
    near(r.observedWeight, aa.reduce((n2, r2) => n2 + r2.weight, 0));
    if (r.index !== null) {
      near(r.index, rr.reduce((n2, r2) => n2 + r2.indexContribution, 0) / r.weight);
      near(r.changeBase, r.index - 100);
    }
  }
  if (seenCategories.size !== new Set(x.rows.map((r) => r.category)).size) fail("category_missing");
  shape(v.daily, ["basis", "activeWindowDays", "availableDayCount", "latestDay", "history", "itemHistory"]);
  count(v.daily.activeWindowDays, 400);
  if (v.daily.activeWindowDays < 3 || v.daily.basis !== "api_overview_daily_linked_v2" || !Array.isArray(v.daily.history) || v.daily.history.length > v.daily.activeWindowDays || v.daily.availableDayCount !== v.daily.history.length) fail("daily");
  let prior = "";
  for (const r of v.daily.history) {
    shape(r, ["day", "index", "status", "observedWeight", "carriedWeight", "partialCalendarDay", "backcast", "nxRate", "cashItems", "cashRecordedSalesCount"]);
    day(r.day);
    if (r.day <= prior) fail("daily_order");
    prior = r.day;
    nullableNumber(r.index);
    if (!["available", "unavailable"].includes(r.status)) fail("daily_status");
    n(r.observedWeight, 0, 1.00000000001);
    n(r.carriedWeight, 0, 1.00000000001);
    if (typeof r.partialCalendarDay !== "boolean" || r.backcast !== r.day < c.linkDay) fail("daily_semantics");
    nullableNumber(r.nxRate);
    count(r.cashItems, 29);
    count(r.cashRecordedSalesCount);
  }
  if (v.daily.history.length && Date.parse(v.daily.history.at(-1).day + "T00:00:00Z") - Date.parse(v.daily.history[0].day + "T00:00:00Z") > (v.daily.activeWindowDays - 1) * 864e5) fail("daily_calendar_window");
  const cashDaily = validateItemHistory(v.daily.itemHistory, v, expectedCashRows);
  for (const h of v.daily.history) {
    if (h.day < v.daily.itemHistory.startDayInclusive || h.day > v.daily.itemHistory.endDayInclusive) continue;
    const cash = cashDaily.get(h.day) ?? { items: 0, count: 0, total: 0 };
    if (h.cashItems !== cash.items || h.cashRecordedSalesCount !== cash.count) fail("daily_cash_evidence");
    if (cash.items >= 3) {
      if (h.nxRate === null) fail("daily_cash_evidence");
      near(h.nxRate, cash.total / cash.count);
    } else if (h.nxRate !== null) fail("daily_cash_evidence");
  }
  if (v.daily.latestDay !== (v.daily.history.at(-1)?.day ?? null)) fail("daily_latest");
  shape(v.benchmarks, ["fixed", "rolling7", "rolling3"]);
  benchmark(v.benchmarks.fixed, "fixed");
  benchmark(v.benchmarks.rolling7, 7);
  benchmark(v.benchmarks.rolling3, 3);
  if (v.benchmarks.fixed.available) {
    if (!x.available) fail("benchmark_current");
    near(v.benchmarks.fixed.rateMesosPerNx, v.benchmarks.fixed.baseRate * x.index / 100);
  }
  for (const key of ["rolling7", "rolling3"]) {
    const b = v.benchmarks[key];
    if (b.currentCapturedAt !== (v.sources.prices?.capturedAt ?? null) || b.windowEndExclusive !== (v.sources.overview?.sourceGeneratedAt.slice(0, 10) ?? null)) fail("benchmark_clock");
    if (b.available) {
      if (!x.available || b.meanLinkedDailyMpi <= 0) fail("benchmark_current");
      near(b.rateMesosPerNx, b.cashAnchorRate * x.index / b.meanLinkedDailyMpi);
      if (Date.parse(b.windowEndExclusive + "T00:00:00Z") - Date.parse(b.windowStart + "T00:00:00Z") !== b.dayCount * 864e5) fail("benchmark_days");
      let sumMpi = 0, cashTotal = 0, cashCount = 0;
      for (let i = 0; i < b.dayCount; i++) {
        const targetDay = new Date(Date.parse(b.windowStart + "T00:00:00Z") + i * 864e5).toISOString().slice(0, 10), h = v.daily.history.find((r) => r.day === targetDay);
        if (!h || h.status !== "available" || h.index === null || h.index <= 0 || h.observedWeight < 0.8 || h.partialCalendarDay || h.cashItems < 3 || h.nxRate === null || h.nxRate <= 0 || h.cashRecordedSalesCount < 15) fail("anchor_day_evidence");
        sumMpi += h.index;
        cashTotal += h.nxRate * h.cashRecordedSalesCount;
        cashCount += h.cashRecordedSalesCount;
        if (!Number.isSafeInteger(cashCount) || !Number.isFinite(cashTotal) || cashTotal > Number.MAX_SAFE_INTEGER) fail("anchor_count_bound");
      }
      near(b.meanLinkedDailyMpi, sumMpi / b.dayCount);
      near(b.cashAnchorRate, cashTotal / cashCount);
    }
  }
  shape(v.limitations, ["qualityConstant", "countsAreVerifiedTradeUnits", "exactWindowBoundsKnown", "sourceCashFlagIsEconomicClassification", "linkedHistoryReplacesLegacyHistory"]);
  if (Object.values(v.limitations).some((x2) => x2 !== false)) fail("limitations");
  return v;
}
function validateItemHistory(h, v, expectedCashRows) {
  shape(h, ["schemaVersion", "basis", "windowDays", "startDayInclusive", "endDayInclusive", "columns", "contexts", "rows"]);
  if (h.schemaVersion !== 1 || h.basis !== "actual_api_overview_daily_medians_not_3day_snapshots" || h.windowDays !== 31 || JSON.stringify(h.columns) !== JSON.stringify(ITEM_HISTORY_COLUMNS) || !Array.isArray(h.contexts) || h.contexts.length > 2449 || !Array.isArray(h.rows) || h.rows.length !== 79) fail("item_history");
  if (h.endDayInclusive !== v.daily.latestDay) fail("item_history_end");
  if (h.startDayInclusive === null || h.endDayInclusive === null) {
    if (h.startDayInclusive !== null || h.endDayInclusive !== null || h.contexts.length) fail("empty_history_window");
  } else {
    day(h.startDayInclusive);
    day(h.endDayInclusive);
    if (Date.parse(h.endDayInclusive + "T00:00:00Z") - Date.parse(h.startDayInclusive + "T00:00:00Z") !== 30 * 864e5) fail("item_history_window");
  }
  const contexts = /* @__PURE__ */ new Map();
  for (const r of h.contexts) {
    shape(r, ["contextId", "captureHash", "operation", "sourceUrl", "rawBodySha256", "capturedAt", "sourceObservedAt", "captureTimeKind", "sourceGeneratedAt"]);
    if (typeof r.contextId !== "string" || !/^c\d{1,4}$/.test(r.contextId) || contexts.has(r.contextId)) fail("history_context_id");
    hash(r.captureHash);
    const { contextId, captureHash, ...s } = r;
    source(s, "overview");
    contexts.set(contextId, r);
  }
  const ids = /* @__PURE__ */ new Set(), used = /* @__PURE__ */ new Set(), cashDaily = /* @__PURE__ */ new Map();
  let points = 0, goods = 0, cash = 0;
  for (const r of h.rows) {
    shape(r, ["itemId", "slug", "name", "role", "fixedNxCost", "points"]);
    count(r.itemId, 999999999);
    if (!r.itemId || ids.has(r.itemId)) fail("history_identity");
    ids.add(r.itemId);
    str(r.slug, 200);
    str(r.name);
    if (r.role === "goods") {
      goods++;
      if (r.fixedNxCost !== null || !v.current.rows.some((x) => x.itemId === r.itemId && x.slug === r.slug && x.name === r.name)) fail("goods_history_binding");
    } else if (r.role === "cash") {
      cash++;
      n(r.fixedNxCost, Number.MIN_VALUE);
      if (expectedCashRows !== void 0) {
        if (!Array.isArray(expectedCashRows) || expectedCashRows.length !== 29) fail("expected_cash_rows");
        const target = expectedCashRows.find((x) => x.itemId === r.itemId);
        if (!target || ["slug", "name", "fixedNxCost"].some((k) => target[k] !== r[k])) fail("static_cash_binding");
      }
    } else fail("history_role");
    if (!Array.isArray(r.points) || r.points.length > 31) fail("history_point_bound");
    let prior = "";
    for (const p of r.points) {
      if (!Array.isArray(p) || p.length !== 8) fail("history_tuple");
      day(p[0]);
      if (p[0] <= prior || p[0] < h.startDayInclusive || p[0] > h.endDayInclusive) fail("history_point_day");
      prior = p[0];
      price(p[1]);
      count(p[2]);
      count(p[3]);
      if (p[4] !== Boolean(p[1] !== null && Number(p[1]) > 0 && p[2] >= 5) || typeof p[5] !== "boolean") fail("history_qualification");
      const ctx = contexts.get(p[6]);
      if (!ctx || p[5] !== p[0] >= ctx.sourceGeneratedAt.slice(0, 10)) fail("history_context");
      used.add(p[6]);
      nullableNumber(p[7]);
      if (r.role === "cash" && p[7] !== null || r.role === "goods" && p[4] !== (p[7] !== null)) fail("history_linked");
      if (r.role === "goods" && p[7] !== null) {
        const target = v.current.rows.find((x) => x.itemId === r.itemId);
        near(p[7], target.legacyLinkPrice * Number(p[1]) / Number(target.APIlinkPrice));
      }
      if (r.role === "cash" && p[4] && !p[5]) {
        const c = cashDaily.get(p[0]) ?? { items: 0, count: 0, total: 0 };
        c.items++;
        c.count += p[2];
        c.total += Number(p[1]) / r.fixedNxCost * p[2];
        if (!Number.isSafeInteger(c.count) || !Number.isFinite(c.total) || c.total > Number.MAX_SAFE_INTEGER) fail("cash_count_bound");
        cashDaily.set(p[0], c);
      }
      points++;
    }
  }
  if (goods !== 50 || cash !== 29 || points > 2449 || used.size !== contexts.size) fail("item_history_coverage");
  return cashDaily;
}
function unpackApiDailyItemHistory(snapshot) {
  validateApiIndexSnapshot(snapshot);
  const h = snapshot.daily.itemHistory, contexts = new Map(h.contexts.map((c) => [c.contextId, c]));
  return h.rows.map((r) => ({ ...r, points: r.points.map((p) => ({ ...Object.fromEntries(ITEM_HISTORY_COLUMNS.map((k, i) => [k, p[i]])), source: contexts.get(p[6]) })) }));
}
function parsePublicJson(raw) {
  if (typeof raw === "string") raw = new TextEncoder().encode(raw);
  if (!(raw instanceof Uint8Array) || raw.length < 1 || raw.length > MAX_PUBLIC_BYTES) fail("body_bound");
  let s;
  try {
    s = new TextDecoder("utf-8", { fatal: true }).decode(raw);
  } catch {
    fail("utf8");
  }
  let p = 0, tokens = 0;
  const ws = () => {
    while (/[\x20\t\r\n]/.test(s[p] ?? "x")) p++;
  };
  function value(depth) {
    if (depth > 32 || ++tokens > 1e5) fail("complexity");
    ws();
    if (s[p] === '"') {
      const start = p++;
      while (p < s.length) {
        if (s[p] === "\\") {
          p += 2;
          continue;
        }
        if (s[p++] === '"') {
          try {
            return JSON.parse(s.slice(start, p));
          } catch {
            fail("string");
          }
        }
      }
      fail("string");
    }
    if (s[p] === "{") {
      p++;
      ws();
      const o = /* @__PURE__ */ Object.create(null);
      if (s[p] === "}") {
        p++;
        return o;
      }
      while (true) {
        ws();
        if (s[p] !== '"') fail("key");
        const k = value(depth + 1);
        if (Object.hasOwn(o, k)) fail("duplicate_key");
        ws();
        if (s[p++] !== ":") fail("colon");
        o[k] = value(depth + 1);
        ws();
        if (s[p] === "}") {
          p++;
          return o;
        }
        if (s[p++] !== ",") fail("separator");
      }
    }
    if (s[p] === "[") {
      p++;
      ws();
      const out = [];
      if (s[p] === "]") {
        p++;
        return out;
      }
      while (true) {
        out.push(value(depth + 1));
        ws();
        if (s[p] === "]") {
          p++;
          return out;
        }
        if (s[p++] !== ",") fail("separator");
      }
    }
    for (const [word, v] of [["true", true], ["false", false], ["null", null]]) if (s.startsWith(word, p)) {
      p += word.length;
      return v;
    }
    const m = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(s.slice(p));
    if (!m) fail("value");
    p += m[0].length;
    const n2 = Number(m[0]);
    if (!Number.isFinite(n2) || Math.abs(n2) > Number.MAX_SAFE_INTEGER) fail("numeric_bound");
    return n2;
  }
  const result = value(0);
  ws();
  if (p !== s.length) fail("trailing");
  return result;
}
async function parseApiIndexSnapshot(raw, options = {}) {
  const v = parsePublicJson(raw);
  validateApiIndexSnapshot(v, options);
  const { snapshotHash, ...body } = v;
  if (await portableHash(body) !== snapshotHash) fail("snapshot_hash");
  return v;
}

// ops/api-index-definition-data-v1.json
var api_index_definition_data_v1_default = {
  schemaVersion: 1,
  methodVersion: "api-v2-chainlink-20261104-v1",
  linkDay: "2026-11-04",
  basketHash: "46c0c5fd9add028b0d24c9f61b8e41d8d3ed78ae76ab8ff14ebeecd7c46f4d19",
  legacySourceUpdatedAt: "2026-11-04T08:30:56+00:00",
  legacyReportSha256: "61846f6176e268f66dea918a7436b8de187eb946928293e0a5f0716cb6f8c10e",
  anchorOverviewRawSha256: "40c33a982482a860fb1a941f5fe9d6cb4f4cd44faf1deaadb09f730a4451fbff",
  anchorOverviewCapturedAt: "2026-11-05T21:43:47.968Z",
  anchorOverviewGeneratedAt: "2026-11-05T21:32:16+00:00",
  fixedNxBaseRate: 12.370116697783677,
  goods: [
    {
      slug: "gloves-attack-scroll-intermediate",
      name: "Gloves Attack Scroll: Intermediate",
      category: "Scrolls",
      weight: 0.08,
      basePrice: 793345.2130977131,
      itemId: 2040801,
      legacyLinkPrice: 1999999,
      APIlinkPrice: "1999999.0",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 87,
      APIlinkReportedUnitCount: 94
    },
    {
      slug: "gloves-magic-attack-scroll-intermediate",
      name: "Gloves Magic Attack Scroll: Intermediate",
      category: "Scrolls",
      weight: 0.06691572540929447,
      basePrice: 209027.93516042782,
      itemId: 2040805,
      legacyLinkPrice: 274999.5,
      APIlinkPrice: "450000.0",
      legacyPriceDay: "2026-11-02",
      legacyCarried: true,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 135,
      APIlinkReportedUnitCount: 164
    },
    {
      slug: "kumbi-throwing-stars",
      name: "Kumbi Throwing Stars",
      category: "Weapons",
      weight: 0.054820882383706054,
      basePrice: 359305.79803646565,
      itemId: 2070003,
      legacyLinkPrice: 699999,
      APIlinkPrice: "749999.0",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "set",
      APIlinkRecordedSalesCount: 100,
      APIlinkReportedUnitCount: 100
    },
    {
      slug: "claw-attack-scroll-intermediate",
      name: "Claw Attack Scroll: Intermediate",
      category: "Scrolls",
      weight: 0.05198004146055375,
      basePrice: 197166.7362012987,
      itemId: 2044701,
      legacyLinkPrice: 499999,
      APIlinkPrice: "517499.5",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 130,
      APIlinkReportedUnitCount: 173
    },
    {
      slug: "earring-luk-scroll-intermediate",
      name: "Earring LUK Scroll: Intermediate",
      category: "Scrolls",
      weight: 0.03968634942455667,
      basePrice: 82942.49329159212,
      itemId: 2040313,
      legacyLinkPrice: 149999,
      APIlinkPrice: "159000.0",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 218,
      APIlinkReportedUnitCount: 343
    },
    {
      slug: "dagger-attack-scroll-intermediate",
      name: "Dagger Attack Scroll: Intermediate",
      category: "Scrolls",
      weight: 0.03651684217793313,
      basePrice: 180962.7783669141,
      itemId: 2043301,
      legacyLinkPrice: 398944,
      APIlinkPrice: "424999.5",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 98,
      APIlinkReportedUnitCount: 122
    },
    {
      slug: "earring-int-scroll-intermediate",
      name: "Earring INT Scroll: Intermediate",
      category: "Scrolls",
      weight: 0.03192979380414028,
      basePrice: 68258.02058554438,
      itemId: 2040309,
      legacyLinkPrice: 109999,
      APIlinkPrice: "120000.0",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 247,
      APIlinkReportedUnitCount: 346
    },
    {
      slug: "earring-str-scroll-intermediate",
      name: "Earring STR Scroll: Intermediate",
      category: "Scrolls",
      weight: 0.031452213539328006,
      basePrice: 64211.550458715596,
      itemId: 2040301,
      legacyLinkPrice: 94999,
      APIlinkPrice: "100000.0",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 226,
      APIlinkReportedUnitCount: 347
    },
    {
      slug: "earring-dex-scroll-intermediate",
      name: "Earring DEX Scroll: Intermediate",
      category: "Scrolls",
      weight: 0.028372106571338162,
      basePrice: 67888.63440860216,
      itemId: 2040305,
      legacyLinkPrice: 99999,
      APIlinkPrice: "109999.0",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 191,
      APIlinkReportedUnitCount: 289
    },
    {
      slug: "pan-lid",
      name: "Pan Lid",
      category: "Equipment",
      weight: 0.028153419245381568,
      basePrice: 65782.2745,
      itemId: 1092002,
      legacyLinkPrice: 84999,
      APIlinkPrice: "89999.0",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 257,
      APIlinkReportedUnitCount: 257
    },
    {
      slug: "pet-equip-speed-scroll-intermediate",
      name: "Pet Equip Speed Scroll: Intermediate",
      category: "Scrolls",
      weight: 0.02535094576615993,
      basePrice: 68756.95298897273,
      itemId: 2048001,
      legacyLinkPrice: 105e3,
      APIlinkPrice: "119999.0",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 183,
      APIlinkReportedUnitCount: 246
    },
    {
      slug: "wand-magic-attack-scroll-intermediate",
      name: "Wand Magic Attack Scroll: Intermediate",
      category: "Scrolls",
      weight: 0.024380796562818854,
      basePrice: 164883.64399421128,
      itemId: 2043701,
      legacyLinkPrice: 194999,
      APIlinkPrice: "350000.0",
      legacyPriceDay: "2026-11-02",
      legacyCarried: true,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 43,
      APIlinkReportedUnitCount: 53
    },
    {
      slug: "mokbi-throwing-stars",
      name: "Mokbi Throwing Stars",
      category: "Weapons",
      weight: 0.023837763573419157,
      basePrice: 139246.16875,
      itemId: 2070002,
      legacyLinkPrice: 199999,
      APIlinkPrice: "220000.0",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "set",
      APIlinkRecordedSalesCount: 159,
      APIlinkReportedUnitCount: 159
    },
    {
      slug: "fairy-wand",
      name: "Fairy Wand",
      category: "Weapons",
      weight: 0.02314954669195535,
      basePrice: 130969.50242130751,
      itemId: 1372006,
      legacyLinkPrice: 99999,
      APIlinkPrice: "99999.0",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 207,
      APIlinkReportedUnitCount: 207
    },
    {
      slug: "hat-accuracy-scroll-intermediate",
      name: "Hat Accuracy Scroll: Intermediate",
      category: "Scrolls",
      weight: 0.02304957276895981,
      basePrice: 26955.35985985986,
      itemId: 2040001,
      legacyLinkPrice: 42250,
      APIlinkPrice: "49999.0",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 249,
      APIlinkReportedUnitCount: 381
    },
    {
      slug: "bow-attack-scroll-intermediate",
      name: "Bow Attack Scroll: Intermediate",
      category: "Scrolls",
      weight: 0.021997086435197048,
      basePrice: 122667.31980906922,
      itemId: 2044501,
      legacyLinkPrice: 219900,
      APIlinkPrice: "249999.0",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 79,
      APIlinkReportedUnitCount: 96
    },
    {
      slug: "emerald-earrings",
      name: "Emerald Earrings",
      category: "Equipment",
      weight: 0.020160185781952222,
      basePrice: 17682.27120870871,
      itemId: 1032007,
      legacyLinkPrice: 19999,
      APIlinkPrice: "21000.0",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 922,
      APIlinkReportedUnitCount: 922
    },
    {
      slug: "mystery-palette-exchange-coupon",
      name: "Mystery Palette Exchange Coupon",
      category: "Consumables",
      weight: 0.020057961546398818,
      basePrice: 94968.01823708207,
      itemId: 2430045,
      legacyLinkPrice: 124999,
      APIlinkPrice: "145555.0",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 215,
      APIlinkReportedUnitCount: 215
    },
    {
      slug: "wooden-top",
      name: "Wooden Top",
      category: "Weapons",
      weight: 0.019739007559943917,
      basePrice: 139762.00151515153,
      itemId: 2070009,
      legacyLinkPrice: 2e5,
      APIlinkPrice: "222222.0",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "set",
      APIlinkRecordedSalesCount: 89,
      APIlinkReportedUnitCount: 89
    },
    {
      slug: "arwens-glass-shoe",
      name: "Arwen's Glass Shoe",
      category: "Materials",
      weight: 0.01676352450466836,
      basePrice: 63124.984689766316,
      itemId: 4001e3,
      legacyLinkPrice: 55e3,
      APIlinkPrice: "59999.0",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 192,
      APIlinkReportedUnitCount: 281
    },
    {
      slug: "spear-attack-scroll-intermediate",
      name: "Spear Attack Scroll: Intermediate",
      category: "Scrolls",
      weight: 0.016682375015431166,
      basePrice: 79226.5081300813,
      itemId: 2044301,
      legacyLinkPrice: 15e4,
      APIlinkPrice: "175000.0",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 98,
      APIlinkReportedUnitCount: 138
    },
    {
      slug: "steel-avarice",
      name: "Steel Avarice",
      category: "Weapons",
      weight: 0.01609047925786032,
      basePrice: 81289.59891891891,
      itemId: 1472014,
      legacyLinkPrice: 74999,
      APIlinkPrice: "75000.0",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 258,
      APIlinkReportedUnitCount: 258
    },
    {
      slug: "polearm-attack-scroll-intermediate",
      name: "Polearm Attack Scroll: Intermediate",
      category: "Scrolls",
      weight: 0.01543925793426703,
      basePrice: 105791.25806451614,
      itemId: 2044401,
      legacyLinkPrice: 199999,
      APIlinkPrice: "221110.5",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 56,
      APIlinkReportedUnitCount: 73
    },
    {
      slug: "korean-fan",
      name: "Korean Fan",
      category: "Weapons",
      weight: 0.0154342409527228,
      basePrice: 87214.2599758162,
      itemId: 1332013,
      legacyLinkPrice: 73499,
      APIlinkPrice: "80000.0",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 181,
      APIlinkReportedUnitCount: 181
    },
    {
      slug: "crossbow-attack-scroll-intermediate",
      name: "Crossbow Attack Scroll: Intermediate",
      category: "Scrolls",
      weight: 0.014799732629452285,
      basePrice: 77361.35794183445,
      itemId: 2044601,
      legacyLinkPrice: 111111,
      APIlinkPrice: "129000.0",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 103,
      APIlinkReportedUnitCount: 120
    },
    {
      slug: "two-handed-sword-attack-scroll-intermediate",
      name: "Two-handed Sword Attack Scroll: Intermediate",
      category: "Scrolls",
      weight: 0.014682157222134326,
      basePrice: 73538.70203644158,
      itemId: 2044001,
      legacyLinkPrice: 66666,
      APIlinkPrice: "119999.0",
      legacyPriceDay: "2026-11-02",
      legacyCarried: true,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 92,
      APIlinkReportedUnitCount: 123
    },
    {
      slug: "overall-armor-luk-scroll-greater",
      name: "Overall Armor LUK Scroll: Greater",
      category: "Scrolls",
      weight: 0.01385317040801408,
      basePrice: 16224.97418546366,
      itemId: 2040518,
      legacyLinkPrice: 16699,
      APIlinkPrice: "28000.0",
      legacyPriceDay: "2026-11-02",
      legacyCarried: true,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 447,
      APIlinkReportedUnitCount: 840
    },
    {
      slug: "gloves-crit-rate-scroll-chaos",
      name: "Gloves Crit. Rate Scroll: Chaos",
      category: "Scrolls",
      weight: 0.013508384262844106,
      basePrice: 67950.93326157158,
      itemId: 2040815,
      legacyLinkPrice: 99999,
      APIlinkPrice: "109943.5",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 146,
      APIlinkReportedUnitCount: 171
    },
    {
      slug: "blue-sauna-robe",
      name: "Blue Sauna Robe",
      category: "Equipment",
      weight: 0.01316618546354111,
      basePrice: 22537.46446886447,
      itemId: 1050010,
      legacyLinkPrice: 35e3,
      APIlinkPrice: "40000.0",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 514,
      APIlinkReportedUnitCount: 514
    },
    {
      slug: "dark-pilfer",
      name: "Dark Pilfer",
      category: "Equipment",
      weight: 0.012438030455931476,
      basePrice: 44988.01547987616,
      itemId: 1002156,
      legacyLinkPrice: 45e3,
      APIlinkPrice: "48994.5",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 234,
      APIlinkReportedUnitCount: 234
    },
    {
      slug: "overall-armor-int-scroll-greater",
      name: "Overall Armor INT Scroll: Greater",
      category: "Scrolls",
      weight: 0.012355824501013586,
      basePrice: 15434.471264367816,
      itemId: 2040514,
      legacyLinkPrice: 15749,
      APIlinkPrice: "25999.5",
      legacyPriceDay: "2026-11-02",
      legacyCarried: true,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 396,
      APIlinkReportedUnitCount: 795
    },
    {
      slug: "silver-guardian",
      name: "Silver Guardian",
      category: "Weapons",
      weight: 0.012173298388246729,
      basePrice: 60777.125,
      itemId: 1472012,
      legacyLinkPrice: 64999,
      APIlinkPrice: "65000.0",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 98,
      APIlinkReportedUnitCount: 98
    },
    {
      slug: "black-napoleon",
      name: "Black Napoleon",
      category: "Equipment",
      weight: 0.011660237824523835,
      basePrice: 86905.5677830941,
      itemId: 1102008,
      legacyLinkPrice: 8e4,
      APIlinkPrice: "99999.0",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 134,
      APIlinkReportedUnitCount: 134
    },
    {
      slug: "dark-shadow-pants",
      name: "Dark Shadow Pants",
      category: "Equipment",
      weight: 0.011212101645553316,
      basePrice: 75606.91630591631,
      itemId: 1060059,
      legacyLinkPrice: 94999,
      APIlinkPrice: "99999.0",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 106,
      APIlinkReportedUnitCount: 106
    },
    {
      slug: "pet-equip-speed-scroll-lesser",
      name: "Pet Equip Speed Scroll: Lesser",
      category: "Scrolls",
      weight: 0.010979267908168876,
      basePrice: 20984.675255623722,
      itemId: 2048e3,
      legacyLinkPrice: 39999.5,
      APIlinkPrice: "48999.0",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 174,
      APIlinkReportedUnitCount: 304
    },
    {
      slug: "two-handed-axe-attack-scroll-intermediate",
      name: "Two-handed Axe Attack Scroll: Intermediate",
      category: "Scrolls",
      weight: 0.010956393938955509,
      basePrice: 59054.94579008074,
      itemId: 2044101,
      legacyLinkPrice: 66e3,
      APIlinkPrice: "99999.0",
      legacyPriceDay: "2026-11-02",
      legacyCarried: true,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 72,
      APIlinkReportedUnitCount: 101
    },
    {
      slug: "overall-armor-str-scroll-greater",
      name: "Overall Armor STR Scroll: Greater",
      category: "Scrolls",
      weight: 0.010793196418979549,
      basePrice: 14760.899912203688,
      itemId: 2040506,
      legacyLinkPrice: 12999,
      APIlinkPrice: "19999.0",
      legacyPriceDay: "2026-11-02",
      legacyCarried: true,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 430,
      APIlinkReportedUnitCount: 778
    },
    {
      slug: "staff-magic-attack-scroll-intermediate",
      name: "Staff Magic Attack Scroll: Intermediate",
      category: "Scrolls",
      weight: 0.010499296953750627,
      basePrice: 67211.73287671233,
      itemId: 2043801,
      legacyLinkPrice: 12e4,
      APIlinkPrice: "148998.0",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 77,
      APIlinkReportedUnitCount: 101
    },
    {
      slug: "fairy-wing",
      name: "Fairy Wing",
      category: "Materials",
      weight: 0.009877438400026098,
      basePrice: 78234.81355932204,
      itemId: 4003005,
      legacyLinkPrice: 59999,
      APIlinkPrice: "63000.0",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 57,
      APIlinkReportedUnitCount: 94
    },
    {
      slug: "shoes-speed-scroll-intermediate",
      name: "Shoes Speed Scroll: Intermediate",
      category: "Scrolls",
      weight: 0.00969660344550808,
      basePrice: 69499.19478527608,
      itemId: 2040705,
      legacyLinkPrice: 133e3,
      APIlinkPrice: "140000.0",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 75,
      APIlinkReportedUnitCount: 87
    },
    {
      slug: "blue-starlight",
      name: "Blue Starlight",
      category: "Equipment",
      weight: 0.00925136532501713,
      basePrice: 45128.20459290188,
      itemId: 1050025,
      legacyLinkPrice: 43333,
      APIlinkPrice: "45000.0",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 236,
      APIlinkReportedUnitCount: 236
    },
    {
      slug: "overall-armor-dex-scroll-greater",
      name: "Overall Armor DEX Scroll: Greater",
      category: "Scrolls",
      weight: 0.009070538930075218,
      basePrice: 13920.458128078817,
      itemId: 2040510,
      legacyLinkPrice: 12260.5,
      APIlinkPrice: "20000.0",
      legacyPriceDay: "2026-11-02",
      legacyCarried: true,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 457,
      APIlinkReportedUnitCount: 1093
    },
    {
      slug: "dark-cleave",
      name: "Dark Cleave",
      category: "Equipment",
      weight: 0.008840051800479818,
      basePrice: 58513.737960339946,
      itemId: 1082063,
      legacyLinkPrice: 44e3,
      APIlinkPrice: "44000.0",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 253,
      APIlinkReportedUnitCount: 253
    },
    {
      slug: "dark-crusader-chainmail",
      name: "Dark Crusader Chainmail",
      category: "Equipment",
      weight: 0.008129637584293702,
      basePrice: 60494.97133757962,
      itemId: 1050017,
      legacyLinkPrice: 44444,
      APIlinkPrice: "43499.0",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 134,
      APIlinkReportedUnitCount: 134
    },
    {
      slug: "squishy-shoes",
      name: "Squishy Shoes",
      category: "Equipment",
      weight: 0.007045269397414632,
      basePrice: 8936.875678610206,
      itemId: 1072128,
      legacyLinkPrice: 15e3,
      APIlinkPrice: "19999.0",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 285,
      APIlinkReportedUnitCount: 285
    },
    {
      slug: "two-handed-blunt-weapon-attack-scroll-intermediate",
      name: "Two-handed Blunt Weapon Attack Scroll: Intermediate",
      category: "Scrolls",
      weight: 0.006921985822782007,
      basePrice: 34157.68743400211,
      itemId: 2044201,
      legacyLinkPrice: 3e4,
      APIlinkPrice: "58444.0",
      legacyPriceDay: "2026-11-02",
      legacyCarried: true,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 92,
      APIlinkReportedUnitCount: 120
    },
    {
      slug: "cape-str-scroll-lesser",
      name: "Cape STR Scroll: Lesser",
      category: "Scrolls",
      weight: 0.006801201430382483,
      basePrice: 29239.08831646734,
      itemId: 2041008,
      legacyLinkPrice: 69999,
      APIlinkPrice: "79500.0",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 92,
      APIlinkReportedUnitCount: 154
    },
    {
      slug: "hat-accuracy-scroll-lesser",
      name: "Hat Accuracy Scroll: Lesser",
      category: "Scrolls",
      weight: 0.006782054086615597,
      basePrice: 8635.806811989101,
      itemId: 204e4,
      legacyLinkPrice: 14499,
      APIlinkPrice: "15000.0",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 224,
      APIlinkReportedUnitCount: 517
    },
    {
      slug: "pet-equip-jump-scroll-intermediate",
      name: "Pet Equip Jump Scroll: Intermediate",
      category: "Scrolls",
      weight: 0.006279787790328642,
      basePrice: 17572.60838323353,
      itemId: 2048005,
      legacyLinkPrice: 17e3,
      APIlinkPrice: "19999.5",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 230,
      APIlinkReportedUnitCount: 313
    },
    {
      slug: "wizard-wand",
      name: "Wizard Wand",
      category: "Weapons",
      weight: 0.0062666695979803405,
      basePrice: 20280.43836565097,
      itemId: 1372005,
      legacyLinkPrice: 24555,
      APIlinkPrice: "24471.5",
      legacyPriceDay: "2026-11-04",
      legacyCarried: false,
      legacyUnit: "unit",
      APIlinkRecordedSalesCount: 340,
      APIlinkReportedUnitCount: 340
    }
  ],
  cash: [
    {
      itemId: 1802e3,
      name: "Red Ribbon",
      slug: "red-ribbon",
      fixedNxCost: 3200,
      identityProofHash: "1c5d0936d1b0c7350b5f86fcdc3af1f17a9613f5623c92fd4a5a083e8fa0a16a"
    },
    {
      itemId: 1802001,
      name: "Yellow Hat",
      slug: "yellow-hat",
      fixedNxCost: 3200,
      identityProofHash: "1c5d0936d1b0c7350b5f86fcdc3af1f17a9613f5623c92fd4a5a083e8fa0a16a"
    },
    {
      itemId: 1802002,
      name: "Red Hat",
      slug: "red-hat",
      fixedNxCost: 3200,
      identityProofHash: "1c5d0936d1b0c7350b5f86fcdc3af1f17a9613f5623c92fd4a5a083e8fa0a16a"
    },
    {
      itemId: 1802003,
      name: "Black Hat",
      slug: "black-hat",
      fixedNxCost: 3200,
      identityProofHash: "1c5d0936d1b0c7350b5f86fcdc3af1f17a9613f5623c92fd4a5a083e8fa0a16a"
    },
    {
      itemId: 1802007,
      name: "Red Top Hat",
      slug: "red-top-hat",
      fixedNxCost: 3200,
      identityProofHash: "1c5d0936d1b0c7350b5f86fcdc3af1f17a9613f5623c92fd4a5a083e8fa0a16a"
    },
    {
      itemId: 5e6,
      name: "Brown Kitty",
      slug: "brown-kitty",
      fixedNxCost: 3500,
      identityProofHash: "1c5d0936d1b0c7350b5f86fcdc3af1f17a9613f5623c92fd4a5a083e8fa0a16a"
    },
    {
      itemId: 5000001,
      name: "Brown Puppy",
      slug: "brown-puppy",
      fixedNxCost: 3500,
      identityProofHash: "1c5d0936d1b0c7350b5f86fcdc3af1f17a9613f5623c92fd4a5a083e8fa0a16a"
    },
    {
      itemId: 5000002,
      name: "Pink Bunny",
      slug: "pink-bunny",
      fixedNxCost: 3500,
      identityProofHash: "1c5d0936d1b0c7350b5f86fcdc3af1f17a9613f5623c92fd4a5a083e8fa0a16a"
    },
    {
      itemId: 5000004,
      name: "Black Kitty",
      slug: "black-kitty",
      fixedNxCost: 3500,
      identityProofHash: "1c5d0936d1b0c7350b5f86fcdc3af1f17a9613f5623c92fd4a5a083e8fa0a16a"
    },
    {
      itemId: 5000005,
      name: "White Bunny",
      slug: "white-bunny",
      fixedNxCost: 3500,
      identityProofHash: "1c5d0936d1b0c7350b5f86fcdc3af1f17a9613f5623c92fd4a5a083e8fa0a16a"
    },
    {
      itemId: 5000007,
      name: "Black Pig",
      slug: "black-pig",
      fixedNxCost: 3500,
      identityProofHash: "1c5d0936d1b0c7350b5f86fcdc3af1f17a9613f5623c92fd4a5a083e8fa0a16a"
    },
    {
      itemId: 5050100,
      name: "AP Reset Scroll",
      slug: "ap-reset-scroll",
      fixedNxCost: 7e3,
      identityProofHash: "1c5d0936d1b0c7350b5f86fcdc3af1f17a9613f5623c92fd4a5a083e8fa0a16a"
    },
    {
      itemId: 5051001,
      name: "SP Reset Scroll",
      slug: "sp-reset-scroll",
      fixedNxCost: 7e3,
      identityProofHash: "1c5d0936d1b0c7350b5f86fcdc3af1f17a9613f5623c92fd4a5a083e8fa0a16a"
    },
    {
      itemId: 515e4,
      name: "Mystery Hair Coupon",
      slug: "mystery-hair-coupon",
      fixedNxCost: 5500,
      identityProofHash: "1c5d0936d1b0c7350b5f86fcdc3af1f17a9613f5623c92fd4a5a083e8fa0a16a"
    },
    {
      itemId: 5150100,
      name: "Signature Hair Coupon",
      slug: "signature-hair-coupon",
      fixedNxCost: 7500,
      identityProofHash: "1c5d0936d1b0c7350b5f86fcdc3af1f17a9613f5623c92fd4a5a083e8fa0a16a"
    },
    {
      itemId: 5151e3,
      name: "Mystery Hair Color Coupon",
      slug: "mystery-hair-color-coupon",
      fixedNxCost: 1700,
      identityProofHash: "1c5d0936d1b0c7350b5f86fcdc3af1f17a9613f5623c92fd4a5a083e8fa0a16a"
    },
    {
      itemId: 5151100,
      name: "Signature Hair Color Coupon",
      slug: "signature-hair-color-coupon",
      fixedNxCost: 4500,
      identityProofHash: "1c5d0936d1b0c7350b5f86fcdc3af1f17a9613f5623c92fd4a5a083e8fa0a16a"
    },
    {
      itemId: 5152e3,
      name: "Mystery Face Coupon",
      slug: "mystery-face-coupon",
      fixedNxCost: 3500,
      identityProofHash: "1c5d0936d1b0c7350b5f86fcdc3af1f17a9613f5623c92fd4a5a083e8fa0a16a"
    },
    {
      itemId: 5152100,
      name: "Signature Eye Color Coupon",
      slug: "signature-eye-color-coupon",
      fixedNxCost: 2500,
      identityProofHash: "1c5d0936d1b0c7350b5f86fcdc3af1f17a9613f5623c92fd4a5a083e8fa0a16a"
    },
    {
      itemId: 5152200,
      name: "Signature Face Coupon",
      slug: "signature-face-coupon",
      fixedNxCost: 5500,
      identityProofHash: "1c5d0936d1b0c7350b5f86fcdc3af1f17a9613f5623c92fd4a5a083e8fa0a16a"
    },
    {
      itemId: 5153e3,
      name: "Signature Skin Color Coupon",
      slug: "signature-skin-color-coupon",
      fixedNxCost: 2e3,
      identityProofHash: "1c5d0936d1b0c7350b5f86fcdc3af1f17a9613f5623c92fd4a5a083e8fa0a16a"
    },
    {
      itemId: 517e4,
      name: "Pet Name Tag",
      slug: "pet-name-tag",
      fixedNxCost: 1800,
      identityProofHash: "1c5d0936d1b0c7350b5f86fcdc3af1f17a9613f5623c92fd4a5a083e8fa0a16a"
    },
    {
      itemId: 518e4,
      name: "Water of Life",
      slug: "water-of-life",
      fixedNxCost: 2e3,
      identityProofHash: "1c5d0936d1b0c7350b5f86fcdc3af1f17a9613f5623c92fd4a5a083e8fa0a16a"
    },
    {
      itemId: 519e4,
      name: "Auto HP Potion Skill",
      slug: "auto-hp-potion-skill",
      fixedNxCost: 2500,
      identityProofHash: "1c5d0936d1b0c7350b5f86fcdc3af1f17a9613f5623c92fd4a5a083e8fa0a16a"
    },
    {
      itemId: 5190001,
      name: "Auto MP Potion Skill",
      slug: "auto-mp-potion-skill",
      fixedNxCost: 2500,
      identityProofHash: "1c5d0936d1b0c7350b5f86fcdc3af1f17a9613f5623c92fd4a5a083e8fa0a16a"
    },
    {
      itemId: 5190002,
      name: "Auto Move Skill",
      slug: "auto-move-skill",
      fixedNxCost: 3e3,
      identityProofHash: "1c5d0936d1b0c7350b5f86fcdc3af1f17a9613f5623c92fd4a5a083e8fa0a16a"
    },
    {
      itemId: 5190003,
      name: "Expanded Auto Move Skill",
      slug: "expanded-auto-move-skill",
      fixedNxCost: 3e3,
      identityProofHash: "1c5d0936d1b0c7350b5f86fcdc3af1f17a9613f5623c92fd4a5a083e8fa0a16a"
    },
    {
      itemId: 568e4,
      name: "Storage Room 5-slot Coupon",
      slug: "storage-room-5-slot-coupon",
      fixedNxCost: 5e3,
      identityProofHash: "1c5d0936d1b0c7350b5f86fcdc3af1f17a9613f5623c92fd4a5a083e8fa0a16a"
    },
    {
      itemId: 5680001,
      name: "Selective 5-slot Coupon",
      slug: "selective-5-slot-coupon",
      fixedNxCost: 5e3,
      identityProofHash: "1c5d0936d1b0c7350b5f86fcdc3af1f17a9613f5623c92fd4a5a083e8fa0a16a"
    }
  ]
};

// ui-src/api-calculations/view-model.mjs
var positive = (n2) => typeof n2 === "number" && Number.isFinite(n2) && n2 > 0;
var hash2 = (s) => typeof s === "string" && /^[a-f0-9]{64}$/.test(s);
var clock2 = (s) => typeof s === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(s) && new Date(s).toISOString() === s;
var need = (v) => {
  if (!v) throw Error("invalid_calculation_view_binding");
};
var freeze = (value) => {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};
var DEPENDENCIES = Object.freeze(["headline", "calculator", "mpi", "category-dials", "basket-prices", "index-contributions", "methodology", "comparison", "source-clocks"]);
function calculationHeadline(snapshot, { mode = "rolling", windowDays = 7 } = {}) {
  need(snapshot?.kind === "api_linked_market_calculations" && hash2(snapshot.snapshotHash) && hash2(snapshot.definitionHash));
  need(["rolling", "fixed", "compare"].includes(mode) && [3, 7].includes(windowDays));
  const current = snapshot.current, fixedHeadline = mode !== "rolling", model = fixedHeadline ? snapshot.benchmarks.fixed : snapshot.benchmarks["rolling" + windowDays];
  need(model && typeof model.available === "boolean" && ["available", "unavailable"].includes(model.status) && model.available === (model.status === "available"));
  const available2 = current.available === true && model.available && positive(current.index) && positive(model.rateMesosPerNx);
  const change = available2 ? fixedHeadline ? current.index - 100 : positive(model.meanLinkedDailyMpi) ? 100 * (current.index / model.meanLinkedDailyMpi - 1) : null : null;
  return freeze({
    available: available2,
    rate: available2 ? model.rateMesosPerNx : null,
    currentMpi: current.available ? current.index : null,
    at: snapshot.sources.prices?.capturedAt ?? null,
    sourceObservedAt: null,
    observed: false,
    qualityConstant: false,
    mode,
    requestedMode: mode,
    windowDays: mode === "fixed" ? null : windowDays,
    sourceKind: "api_reported_3day_sale_median_reference",
    cashAnchor: model.cashAnchorRate ?? null,
    meanMpi: model.meanLinkedDailyMpi ?? null,
    startDay: model.windowStart ?? null,
    endExclusive: model.windowEndExclusive ?? null,
    missingDays: [...model.missingDays || []],
    changePercent: change,
    label: fixedHeadline ? "Fixed-anchor goods NX model \xB7 API 3-day reference" : `Latest 3-day sale-median reference \xB7 ${windowDays}-day anchor`,
    changeLabel: fixedHeadline ? "vs frozen reference period" : `vs previous ${windowDays} source-calendar days`,
    reason: available2 ? null : current.available !== true ? "Current aggregate unavailable; all 50 same-capture item prices are required." : `The requested ${fixedHeadline ? "fixed" : windowDays + "-day"} anchor is unavailable.`,
    snapshotHash: snapshot.snapshotHash,
    definitionHash: snapshot.definitionHash
  });
}
function calculationView(legacy, snapshot, selection = {}) {
  need(legacy && Array.isArray(legacy.rows) && legacy.rows.length === 50);
  need(snapshot?.schemaVersion === 1 && snapshot.kind === "api_linked_market_calculations" && hash2(snapshot.definitionHash) && hash2(snapshot.snapshotHash));
  need(hash2(legacy.basketHash) && legacy.basketHash === snapshot.calibration.basketHash);
  need((snapshot.current.available !== true || clock2(snapshot.sources?.prices?.capturedAt) && snapshot.sources.prices.reportedDays === 3) && snapshot.sourceObservedAt === null);
  need(snapshot.current && Array.isArray(snapshot.current.rows) && Array.isArray(snapshot.current.categories));
  const original = new Map(legacy.rows.map((row) => [row.slug, row]));
  need(original.size === 50);
  const supplied = /* @__PURE__ */ new Map();
  for (const row of snapshot.current.rows) {
    need(original.has(row.slug) && !supplied.has(row.slug));
    const base = original.get(row.slug);
    need(row.category === base.category && row.weight === base.weight && row.basePrice === base.basePrice);
    supplied.set(row.slug, row);
  }
  if (snapshot.current.available) need(supplied.size === 50 && positive(snapshot.current.index));
  const rows = legacy.rows.map((base) => {
    const item = supplied.get(base.slug), rawPrice = item && typeof item.currentSaleMedianLexeme === "string" ? Number(item.currentSaleMedianLexeme) : null;
    return {
      ...structuredClone(base),
      price: positive(rawPrice) ? rawPrice : null,
      priceDay: null,
      priceTimeKind: "reported_3day_window_with_unknown_bounds",
      sourceUrl: item ? `https://maplestory.market/items/${item.itemId}?ref=v6kkdvp6` : null,
      currentApiReference: item ? { ...structuredClone(item), capturedAt: snapshot.sources.prices?.capturedAt ?? null, reportedDays: 3, sourceObservedAt: null } : null,
      changeBase: item?.changeBase ?? null,
      indexContribution: item?.indexContribution ?? null,
      changeContribution: item?.changeContribution ?? null,
      legacyEvidence: { price: base.price, priceDay: base.priceDay, sourceUrl: base.sourceUrl },
      history: base.history.map((point) => [...point])
    };
  });
  const headline = calculationHeadline(snapshot, selection);
  const categories = snapshot.current.categories.map((row) => ({
    name: row.category,
    index: row.index,
    weight: row.weight,
    count: row.expectedItems,
    availableItems: row.availableItems,
    observedWeight: row.observedWeight,
    changeBase: row.changeBase,
    capturedAt: snapshot.sources.prices?.capturedAt ?? null
  }));
  const latestDaily = snapshot.daily.history.at(-1) ?? null;
  return freeze({
    kind: "api_calculation_view",
    snapshotHash: snapshot.snapshotHash,
    definitionHash: snapshot.definitionHash,
    headline,
    index: snapshot.current.available ? snapshot.current.index : null,
    rows,
    categories,
    currentReference: {
      capturedAt: snapshot.sources.prices?.capturedAt ?? null,
      reportedDays: 3,
      exactStartAt: null,
      exactEndAt: null,
      sourceObservedAt: null,
      available: snapshot.current.available,
      availableItems: snapshot.current.availableItems,
      expectedItems: 50
    },
    daily: { ...structuredClone(snapshot.daily), latestDay: latestDaily?.day ?? null },
    clocks: {
      currentPrices: snapshot.sources.prices?.capturedAt ?? null,
      dailyCapture: snapshot.sources.overview?.capturedAt ?? null,
      dailyPublisher: snapshot.sources.overview?.sourceGeneratedAt ?? null,
      legacyDaily: legacy.sourceUpdatedAt,
      sourceObservedAt: null
    },
    legacyDailyHistory: structuredClone(legacy.history),
    calibration: structuredClone(snapshot.calibration),
    dependencies: [...DEPENDENCIES]
  });
}
function calculationItemEvidenceView(legacy, snapshot, { definitions, dailyItems, status: status2 = "current", reason = null } = {}) {
  need(definitions && Array.isArray(definitions.goods) && definitions.goods.length === 50 && Array.isArray(definitions.cash) && definitions.cash.length === 29);
  const bound = calculationView(legacy, snapshot), base = new Map(legacy.rows.map((r) => [r.slug, r])), targets = new Map([...definitions.goods.map((r) => ({ ...r, role: "goods" })), ...definitions.cash.map((r) => ({ ...r, role: "cash" }))].map((r) => [r.itemId, r]));
  need(targets.size === 79 && snapshot.current.rows.length === 50 && Array.isArray(dailyItems) && dailyItems.length === 79 && new Set(dailyItems.map((r) => r.itemId)).size === 79);
  for (const expected of definitions.goods) {
    const row = snapshot.current.rows.find((r) => r.itemId === expected.itemId), old = base.get(expected.slug);
    need(row && old && row.slug === expected.slug && row.name === expected.name && old.name === expected.name && (old.canonicalId === void 0 || old.canonicalId === null || old.canonicalId === expected.itemId));
  }
  for (const row of dailyItems) {
    const expected = targets.get(row.itemId);
    need(expected && row.slug === expected.slug && row.name === expected.name && row.role === expected.role && (row.role !== "cash" || row.fixedNxCost === expected.fixedNxCost));
  }
  need(["current", "retained"].includes(status2));
  return freeze({
    kind: "api_item_evidence_view",
    snapshotHash: snapshot.snapshotHash,
    definitionHash: snapshot.definitionHash,
    basketHash: snapshot.calibration.basketHash,
    status: status2,
    reason,
    rows: bound.rows.map((row) => ({ ...row, indexContribution: null, changeContribution: null })),
    dailyItems: structuredClone(dailyItems),
    clocks: structuredClone(bound.clocks),
    currentReference: { ...bound.currentReference },
    sourceObservedAt: null,
    qualifiedIndividualTrades: 0,
    aggregateSelectionSeparate: true
  });
}
function createCalculationSelection() {
  let good = null, evidence = null, latestCheck = null, status2 = "unavailable", evidenceStatus = "unavailable", evidenceReason = null;
  return Object.freeze({
    accept(validatedSnapshot, { checkedAt, readerMode = "accepted_cache" } = {}) {
      need(clock2(checkedAt) && ["accepted_cache", "retained_last_good"].includes(readerMode));
      latestCheck = checkedAt;
      if (good) need(validatedSnapshot.definitionHash === good.definitionHash);
      if (evidence) need(validatedSnapshot.definitionHash === evidence.definitionHash);
      if (evidence && ["prices", "overview"].some((k) => evidence.sources[k] && (!validatedSnapshot.sources[k] || validatedSnapshot.sources[k].capturedAt < evidence.sources[k].capturedAt))) {
        status2 = good ? "retained" : "unavailable";
        evidenceStatus = "retained";
        evidenceReason = "source_pair_rollback";
        return false;
      }
      if (evidence?.snapshotHash !== validatedSnapshot.snapshotHash) evidence = freeze(structuredClone(validatedSnapshot));
      evidenceStatus = readerMode === "retained_last_good" ? "retained" : "current";
      evidenceReason = readerMode === "retained_last_good" ? "route_retained_last_good" : null;
      if (validatedSnapshot.current.available !== true) {
        status2 = good ? "retained" : "unavailable";
        return false;
      }
      if (good) {
        const before = good.sources, after = validatedSnapshot.sources;
        if (after.prices.capturedAt < before.prices.capturedAt || before.overview?.capturedAt && (after.overview?.capturedAt ?? "") < before.overview.capturedAt) {
          status2 = "retained";
          return false;
        }
      }
      if (good?.snapshotHash === validatedSnapshot.snapshotHash) {
        status2 = "current";
        return false;
      }
      good = freeze(structuredClone(validatedSnapshot));
      status2 = "current";
      return true;
    },
    failed({ checkedAt, reason = "own_reader_failed" } = {}) {
      need(clock2(checkedAt));
      latestCheck = checkedAt;
      status2 = good ? "retained" : "unavailable";
      evidenceStatus = evidence ? "retained" : "unavailable";
      evidenceReason = reason;
    },
    state() {
      return { snapshot: good, evidenceSnapshot: evidence, checkedAt: latestCheck, status: status2, evidenceStatus, evidenceReason, marketSourceAt: good?.sources.prices.capturedAt ?? null };
    }
  });
}

// ui-src/api-calculations/client.mjs
var ROUTE = "/api-market-calculations.json";
var MAX_BYTES = 6e5;
var allowed = /* @__PURE__ */ new Set(["https://inflation.gg", "https://inflation-watch-astra.dizzyvinci.workers.dev", "http://127.0.0.1:8765"]);
var sha = async (raw) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", raw))].map((x) => x.toString(16).padStart(2, "0")).join("");
var need2 = (v, c) => {
  if (!v) throw Error(c);
};
var iso = (t) => new Date(t).toISOString();
function createApiCalculationClient({ origin, parse: parse2, expectedDefinitionHash, fetcher = fetch, now = () => Date.now(), timeoutMs = 8e3, onChange = () => {
}, onAccessDenied = () => {
} }) {
  need2(allowed.has(origin) && typeof parse2 === "function" && /^[a-f0-9]{64}$/.test(expectedDefinitionHash), "invalid_own_reader_configuration");
  need2(Number.isFinite(timeoutMs) && timeoutMs > 0 && timeoutMs <= 8e3, "invalid_own_reader_deadline");
  const selection = createCalculationSelection();
  let flight = null, etag = null, nextCheck = 0, failures = 0, blocked = false, readerMode = null, evidenceReaderMode = null, reason = null;
  const state = () => ({ ...selection.state(), readerMode, evidenceReaderMode, reason, blocked, nextCheckAt: nextCheck });
  function context(response, snapshot) {
    need2(response.headers.get("X-Astra-Calculations-Definition-Hash") === expectedDefinitionHash && snapshot.definitionHash === expectedDefinitionHash, "definition_changed");
    need2(response.headers.get("X-Astra-Calculations-Prices-Captured-At") === (snapshot.sources.prices?.capturedAt ?? "none") && response.headers.get("X-Astra-Calculations-Overview-Captured-At") === (snapshot.sources.overview?.capturedAt ?? "none"), "source_clock_binding");
    const mode = response.headers.get("X-Astra-Calculations-Mode");
    need2(["accepted_cache", "retained_last_good"].includes(mode), "invalid_reader_mode");
    return mode;
  }
  async function read() {
    const controller = new AbortController();
    let deadline;
    const guard = new Promise((_, reject) => {
      deadline = setTimeout(() => {
        controller.abort();
        reject(Error("own_reader_timeout"));
      }, timeoutMs);
    });
    const wait = (p) => Promise.race([p, guard]);
    try {
      const response = await wait(fetcher(origin + ROUTE, {
        method: "GET",
        credentials: "same-origin",
        redirect: "error",
        cache: "no-store",
        signal: controller.signal,
        headers: { Accept: "application/json", ...etag ? { "If-None-Match": etag } : {} }
      }));
      if ([401, 403].includes(response.status)) {
        blocked = true;
        onAccessDenied(response.status);
        throw Error("access_denied");
      }
      need2(response.status === 200 || response.status === 304, response.status === 404 ? "not_published" : "own_reader_unavailable");
      need2(/(?:^|,)\s*private\s*(?:,|$)/i.test(response.headers.get("Cache-Control") || "") && /(?:^|,)\s*no-store\s*(?:,|$)/i.test(response.headers.get("Cache-Control") || ""), "private_policy");
      if (response.status === 304) {
        const snapshot2 = selection.state().evidenceSnapshot;
        need2(snapshot2 && response.headers.get("ETag") === etag, "invalid_not_modified");
        evidenceReaderMode = context(response, snapshot2);
        selection.accept(snapshot2, { checkedAt: iso(now()), readerMode: evidenceReaderMode });
        readerMode = selection.state().status === "retained" ? "retained_last_good" : evidenceReaderMode;
        reason = selection.state().status === "retained" ? "current_aggregate_unavailable_or_older" : null;
        failures = 0;
        nextCheck = now() + 6e4;
        onChange(state());
        return state();
      }
      need2((response.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase() === "application/json", "not_json");
      const length = response.headers.get("Content-Length");
      if (length !== null) need2(/^\d+$/.test(length) && Number(length) > 0 && Number(length) <= MAX_BYTES, "body_bound");
      const reader = response.body?.getReader();
      need2(reader, "missing_body");
      let size = 0;
      const chunks = [];
      try {
        for (; ; ) {
          const chunk = await wait(reader.read());
          if (chunk.done) break;
          need2(chunk.value instanceof Uint8Array, "body_chunk");
          size += chunk.value.length;
          need2(size <= MAX_BYTES, "body_bound");
          chunks.push(chunk.value);
        }
      } catch (error) {
        reader.cancel().catch(() => {
        });
        throw error;
      } finally {
        reader.releaseLock();
      }
      need2(size > 0 && (length === null || Number(length) === size), "body_bound");
      const raw = new Uint8Array(size);
      let at = 0;
      for (const chunk of chunks) {
        raw.set(chunk, at);
        at += chunk.length;
      }
      const digest2 = await wait(sha(raw)), nextEtag = '"api-calculations-' + digest2 + '"';
      need2(response.headers.get("ETag") === nextEtag, "body_hash");
      const snapshot = await wait(parse2(raw, { expectedDefinitionHash })), previousEvidenceHash = selection.state().evidenceSnapshot?.snapshotHash;
      const routeMode = context(response, snapshot);
      const accepted = selection.accept(snapshot, { checkedAt: iso(now()), readerMode: routeMode }), evidenceAccepted = selection.state().evidenceSnapshot?.snapshotHash === snapshot.snapshotHash;
      if (evidenceAccepted) etag = nextEtag;
      evidenceReaderMode = evidenceAccepted ? routeMode : "retained_last_good";
      readerMode = selection.state().status === "retained" ? "retained_last_good" : routeMode;
      reason = !evidenceAccepted ? "source_pair_rollback" : selection.state().status === "retained" ? "current_aggregate_unavailable_or_older" : null;
      failures = 0;
      nextCheck = now() + 6e4;
      onChange({ ...state(), changed: accepted, evidenceChanged: selection.state().evidenceSnapshot?.snapshotHash !== previousEvidenceHash });
      return state();
    } catch (error) {
      failures++;
      selection.failed({ checkedAt: iso(now()), reason: error.message === "access_denied" ? "access_denied" : error.message === "not_published" ? "not_published" : "own_reader_failed" });
      reason = ["access_denied", "not_published"].includes(error.message) ? error.message : "own_reader_failed";
      readerMode = selection.state().snapshot ? "retained_last_good" : null;
      evidenceReaderMode = selection.state().evidenceSnapshot ? "retained_last_good" : null;
      nextCheck = blocked ? Infinity : now() + Math.min(6e5, 6e4 * 2 ** Math.min(failures - 1, 4));
      onChange(state());
      return state();
    } finally {
      clearTimeout(deadline);
    }
  }
  return Object.freeze({ state, refresh() {
    if (blocked || now() < nextCheck) return Promise.resolve(state());
    if (flight) return flight;
    flight = read();
    return flight.finally(() => {
      flight = null;
    });
  } });
}

// ui-src/api-calculations/runtime.mjs
function createCalculationRuntime({ origin, available: available2, parse: parse2, definitionHash, unpackDaily, itemDefinitions = null, fetcher = fetch, now = () => Date.now(), selection = () => ({ mode: "rolling", windowDays: 7 }), notify = () => {
} }) {
  let legacy = null, view = null, cacheKey = null, bindingError = null, notificationKey = null, itemView = null, itemKey = null, itemBindingError = null;
  const captured = [];
  const definitions = available2 === true && itemDefinitions ? structuredClone(itemDefinitions) : null;
  const client = available2 === true ? createApiCalculationClient({ origin, parse: parse2, expectedDefinitionHash: definitionHash, fetcher, now, onChange: (state) => {
    const key = [state.snapshot?.snapshotHash ?? null, state.status, state.readerMode, state.reason, state.evidenceSnapshot?.snapshotHash ?? null, state.evidenceStatus, state.evidenceReaderMode, state.evidenceReason];
    const changed = !notificationKey || key.some((value, i) => value !== notificationKey[i]);
    if (changed) {
      cacheKey = null;
      view = null;
      itemKey = null;
      itemView = null;
      notificationKey = key;
    }
    if (state.changed && state.snapshot) {
      const dto = state.snapshot;
      captured.push({ snapshotHash: dto.snapshotHash, at: dto.maxInputCapturedAt ?? dto.sources.prices.capturedAt, pricesCapturedAt: dto.sources.prices.capturedAt, overviewCapturedAt: dto.sources.overview?.capturedAt ?? null, currentIndex: dto.current.index, fixed: dto.benchmarks.fixed.rateMesosPerNx, rolling7: dto.benchmarks.rolling7.rateMesosPerNx, rolling3: dto.benchmarks.rolling3.rateMesosPerNx });
      if (captured.length > 128) captured.shift();
    }
    if (changed) notify(state);
  } }) : Object.freeze({ state: () => ({ snapshot: null, status: "off", readerMode: null, reason: null, blocked: false, nextCheckAt: Infinity }) });
  function getView() {
    const state = client.state();
    if (!legacy || !state.snapshot) return null;
    const chosen = selection(), key = [state.snapshot.snapshotHash, chosen.mode, chosen.windowDays];
    if (!cacheKey || key.some((v, i) => v !== cacheKey[i])) {
      try {
        view = calculationView(legacy, state.snapshot, chosen);
        bindingError = null;
      } catch {
        view = null;
        bindingError = "legacy_calculation_definition_mismatch";
      }
      cacheKey = key;
    }
    return view;
  }
  function getItemEvidence() {
    const state = client.state();
    if (!legacy || !state.evidenceSnapshot || !definitions) return null;
    const key = [state.evidenceSnapshot.snapshotHash, state.evidenceStatus, state.evidenceReason];
    if (!itemKey || key.some((v, i) => v !== itemKey[i])) {
      try {
        itemView = calculationItemEvidenceView(legacy, state.evidenceSnapshot, { definitions, dailyItems: unpackDaily(state.evidenceSnapshot), status: state.evidenceStatus, reason: state.evidenceReason });
        itemBindingError = null;
      } catch {
        itemView = null;
        itemBindingError = "legacy_item_evidence_definition_mismatch";
      }
      itemKey = key;
    }
    return itemView;
  }
  const api = {
    available: available2 === true,
    setLegacy(report) {
      if (!report || !Array.isArray(report.rows) || report.rows.length !== 50) return false;
      if (legacy !== report) {
        legacy = report;
        cacheKey = null;
        view = null;
        itemKey = null;
        itemView = null;
      }
      return true;
    },
    getView,
    getItemEvidence,
    headline() {
      return getView()?.headline ?? null;
    },
    state() {
      return { ...client.state(), available: available2 === true, hasBoundLegacy: !!legacy, bindingError, itemBindingError };
    },
    async refresh() {
      if (available2 !== true) return api.state();
      await client.refresh();
      return api.state();
    },
    dailyItems() {
      const dto = client.state().snapshot;
      return dto ? unpackDaily(dto) : [];
    },
    overlayReport(report) {
      const current = getView(), items = getItemEvidence(), base = current ? { ...report, rows: current.rows, categories: current.categories, apiCalculationView: current, apiDailyItems: api.dailyItems() } : report;
      if (items) return { ...base, apiItemEvidence: items };
      if (Object.hasOwn(base, "apiItemEvidence")) {
        const { apiItemEvidence: _old, ...without } = base;
        return without;
      }
      return base;
    },
    capturePoints() {
      return captured.map((point) => ({ ...point }));
    },
    sourceSeries(metric) {
      const dto = client.state().snapshot;
      if (!dto || !getView()) return [];
      const chosen = selection();
      if (metric === "observed-nx" || metric === "cpi") {
        const observed = metric === "observed-nx";
        const points = dto.daily.history.filter((p) => Number.isFinite(observed ? p.nxRate : p.index) && (!observed || p.cashItems >= 3)).map((p) => ({ at: p.day + "T12:00:00Z", day: p.day, value: observed ? p.nxRate : p.index, kind: observed ? "api_overview_daily_cash_reference" : "api_linked_daily_mpi", datePrecision: "day", partial: p.partialCalendarDay, backcast: p.backcast, referenceNote: observed ? "API source-day cash-item sale-median reference; not individual trades." : "Retrospectively linked API daily price index; not a live trade observation." }));
        return [{ id: observed ? "api-observed-nx" : "api-linked-mpi", name: observed ? "API daily cash-sale reference" : "API-linked daily MPI", color: observed ? "#edc471" : "#87bdcf", fill: false, dash: true, maxGapMs: 1296e5, points }];
      }
      const modes = chosen.mode === "compare" ? ["fixed", "rolling" + chosen.windowDays] : [chosen.mode === "fixed" ? "fixed" : "rolling" + chosen.windowDays];
      return modes.map((mode) => ({ id: "api-" + mode, name: mode === "fixed" ? "API 3-day reference \xB7 fixed anchor" : `API 3-day reference \xB7 ${chosen.windowDays}-day anchor`, color: mode === "fixed" ? "#edc471" : "#87bdcf", fill: false, maxGapMs: 9e5, points: captured.filter((p) => Number.isFinite(p[mode]) && p[mode] > 0).map((p) => ({ at: p.at, value: p[mode], kind: "api_captured_3day_goods_nx_model", datePrecision: "capture", snapshotHash: p.snapshotHash, referenceNote: `Latest input HTTP capture; prices captured ${p.pricesCapturedAt}, daily source captured ${p.overviewCapturedAt ?? "unknown"}. Underlying trades and exact three-day bounds are unknown. Browser capture points are session-only; the owner retains its separate durable calculation archive.` })) }));
    }
  };
  return Object.freeze(api);
}

// ui-src/overview-activity/contract.mjs
var PROTOCOL = "overview-window-activity-v1";
var DEFINITION_SHA = "65bf9403902e24eb6ab24a9d9b3d1f2ec4c49304ec57671869208e45335f8b36";
var PROFILE_PATH = "/api-overview-window-activity/profile.json";
var CURRENT_PATH = "/api-overview-window-activity/current.json";
var REQUEST_HEADER = "X-Astra-Request-Overview-Activity-Protocol";
var HEADERS = Object.freeze({ hash: "X-Astra-Overview-Activity-Body-Sha256", epoch: "X-Astra-Overview-Activity-Epoch", state: "X-Astra-Overview-Activity-State", capture: "X-Astra-Overview-Activity-Captured-At", generated: "X-Astra-Overview-Activity-Generated-At" });
var SEMANTICS = Object.freeze({ grain: "source_reported_overview_window_not_daily", coverageUniverse: "received_overview_rows", counterSums: Object.freeze({ sourceRecordedSalesCounterSumLexeme: "source_reported_counts_not_unique_or_verified_trades", sourceReportedUnitCounterSumLexeme: "reported_unit_counters_not_standardized_market_volume", sourceReportedMesosSumLexeme: "source_labelled_mesos_not_verified_trade_value", medianCountProxySumLexeme: "median_unit_price_times_recorded_sales_count_not_actual_traded_mesos" }), exactObservationBoundsKnown: false, sinceLaunch: false, dailyLedgerIncluded: false, itemRowsPublished: false, uniqueParticipantsKnown: false, marketInventoryKnown: false, upstreamLatestInspected: false });
var need3 = (v) => {
  if (!v) throw Error("overview_activity_unavailable");
};
var hash3 = (v) => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
var publicEpoch = (v) => typeof v === "string" && /^[a-z][a-z0-9-]{0,63}$/.test(v);
var integer = (v, max) => Number.isSafeInteger(v) && v >= 0 && v <= max;
var shape2 = (v, keys) => need3(v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === keys.length && keys.every((k) => Object.hasOwn(v, k)));
function clock3(v) {
  need3(typeof v === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v) && v >= "1970-01-01T00:00:00.000Z" && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v);
  return v;
}
function freeze2(v) {
  if (v && typeof v === "object") {
    for (const x of Object.values(v)) freeze2(x);
    Object.freeze(v);
  }
  return v;
}
var own = (v) => structuredClone(v);
var ta = Object.getPrototypeOf(Uint8Array.prototype);
var lengthOf = Object.getOwnPropertyDescriptor(ta, "byteLength").get;
var bufferOf = Object.getOwnPropertyDescriptor(ta, "buffer").get;
var offsetOf = Object.getOwnPropertyDescriptor(ta, "byteOffset").get;
function copyBytes(v, limit) {
  need3(v instanceof Uint8Array);
  const n2 = lengthOf.call(v);
  need3(n2 > 0 && n2 <= limit);
  const view = new Uint8Array(bufferOf.call(v), offsetOf.call(v), n2), out = new Uint8Array(n2);
  out.set(view);
  return out;
}
function parse(raw, limit) {
  const s = new TextDecoder("utf-8", { fatal: true }).decode(copyBytes(raw, limit));
  let i = 0, tokens = 0;
  const ws = () => {
    while (/[ \n\r\t]/.test(s[i] ?? "x")) i++;
  };
  function value(depth) {
    need3(depth <= 12 && ++tokens <= 512);
    ws();
    const c = s[i];
    if (c === '"') {
      const a = i++;
      while (i < s.length) {
        if (s[i] === "\\") {
          i += 2;
          continue;
        }
        if (s[i++] === '"') return JSON.parse(s.slice(a, i));
      }
      need3(false);
    }
    if (c === "{") {
      i++;
      ws();
      const o = /* @__PURE__ */ Object.create(null);
      if (s[i] === "}") {
        i++;
        return o;
      }
      for (; ; ) {
        ws();
        need3(s[i] === '"');
        const k = value(depth + 1);
        need3(!Object.hasOwn(o, k));
        ws();
        need3(s[i++] === ":");
        o[k] = value(depth + 1);
        ws();
        if (s[i] === "}") {
          i++;
          return o;
        }
        need3(s[i++] === ",");
      }
    }
    for (const [word, v3] of [["true", true], ["false", false], ["null", null]]) if (s.startsWith(word, i)) {
      i += word.length;
      return v3;
    }
    const n2 = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(s.slice(i));
    need3(n2 && n2[0].length <= 32);
    i += n2[0].length;
    const v2 = Number(n2[0]);
    need3(Number.isFinite(v2));
    return v2;
  }
  const v = value(0);
  ws();
  need3(i === s.length);
  return v;
}
function profile(raw) {
  const v = parse(raw, 512);
  shape2(v, ["schemaVersion", "kind", "protocol", "definitionHash", "publicEpoch", "available"]);
  need3(v.schemaVersion === 1 && v.kind === "overview_activity_public_profile" && v.protocol === PROTOCOL && v.definitionHash === DEFINITION_SHA && publicEpoch(v.publicEpoch) && v.available === true);
  return freeze2(v);
}
var amount = (v, int = false) => need3(typeof v === "string" && v.length <= 192 && (int ? /^(?:0|[1-9][0-9]*)$/ : /^(?:0|[1-9][0-9]*)(?:\.[0-9]*[1-9])?$/).test(v));
function frame(raw, status2, epoch2) {
  need3([200, 409].includes(status2) && publicEpoch(epoch2));
  const v = parse(raw, 8192);
  shape2(v, ["schemaVersion", "kind", "protocol", "definitionHash", "publicEpoch", "state", "currentAgainstPublishedPointer", "upstreamLatestInspected", "reference"]);
  need3(v.schemaVersion === 1 && v.kind === "overview_window_activity_response" && v.protocol === PROTOCOL && v.definitionHash === DEFINITION_SHA && v.publicEpoch === epoch2 && v.upstreamLatestInspected === false && v.state === (status2 === 200 ? "current" : "retained") && v.currentAgainstPublishedPointer === (status2 === 200));
  const r = v.reference;
  shape2(r, ["schemaVersion", "kind", "profile", "definitionHash", "generation", "sourceWitnessSha256", "derivedBodySha256", "source", "window", "coverage", "counterSums", "semantics"]);
  need3(r.schemaVersion === 1 && r.kind === "overview_window_activity" && r.profile === "overview_window_aggregate_v1" && r.definitionHash === DEFINITION_SHA && hash3(r.generation) && hash3(r.sourceWitnessSha256) && hash3(r.derivedBodySha256));
  const s = r.source;
  shape2(s, ["operation", "sourceUrl", "rawBodySha256", "capturedAt", "sourceObservedAt", "captureTimeKind", "sourceGeneratedAt"]);
  need3(s.operation === "overview" && s.sourceUrl === "https://maplestory.market/api/market/overview" && hash3(s.rawBodySha256) && s.sourceObservedAt === null && s.captureTimeKind === "http_response_completed");
  clock3(s.capturedAt);
  clock3(s.sourceGeneratedAt);
  need3(s.sourceGeneratedAt <= s.capturedAt);
  const w = r.window;
  shape2(w, ["windowHours", "scannedHours", "previousScannedHours", "comparable", "exactStartAt", "exactEndAt"]);
  need3(["windowHours", "scannedHours", "previousScannedHours"].every((k) => integer(w[k], 1e5)) && typeof w.comparable === "boolean" && w.exactStartAt === null && w.exactEndAt === null);
  const c = r.coverage;
  shape2(c, ["receivedItemRows", "countEligibleItemRows", "reportedUnitEligibleItemRows", "sourceReportedMesosEligibleItemRows", "medianCountProxyEligibleItemRows", "medianCountProxyMissingPriceRows"]);
  need3(Object.values(c).every((n2) => integer(n2, 2e4)) && ["countEligibleItemRows", "reportedUnitEligibleItemRows", "sourceReportedMesosEligibleItemRows"].every((k) => c[k] === c.receivedItemRows) && c.medianCountProxyEligibleItemRows + c.medianCountProxyMissingPriceRows === c.receivedItemRows);
  const a = r.counterSums;
  shape2(a, Object.keys(SEMANTICS.counterSums));
  amount(a.sourceRecordedSalesCounterSumLexeme, true);
  amount(a.sourceReportedUnitCounterSumLexeme, true);
  amount(a.sourceReportedMesosSumLexeme);
  need3(a.medianCountProxySumLexeme === null === (c.medianCountProxyEligibleItemRows === 0));
  if (a.medianCountProxySumLexeme !== null) amount(a.medianCountProxySumLexeme);
  shape2(r.semantics, Object.keys(SEMANTICS));
  for (const k of Object.keys(SEMANTICS)) {
    if (k === "counterSums") {
      shape2(r.semantics[k], Object.keys(SEMANTICS[k]));
      for (const key of Object.keys(SEMANTICS[k])) need3(r.semantics[k][key] === SEMANTICS[k][key]);
    } else need3(r.semantics[k] === SEMANTICS[k]);
  }
  return freeze2(v);
}
async function digest(raw, cryptoImpl = globalThis.crypto) {
  return [...new Uint8Array(await cryptoImpl.subtle.digest("SHA-256", raw))].map((x) => x.toString(16).padStart(2, "0")).join("");
}
function headers(response, expected) {
  const h = response.headers, record = { hash: h.get(HEADERS.hash), epoch: h.get(HEADERS.epoch), state: h.get(HEADERS.state), capture: h.get(HEADERS.capture), generated: h.get(HEADERS.generated), etag: h.get("ETag") };
  need3(record.hash === expected.hash && record.epoch === expected.publicEpoch && record.state === expected.state && record.capture === expected.capture && record.generated === expected.generated && record.etag === '"overview-activity-' + expected.hash + '"');
  need3(h.get("Cache-Control") === "private, no-store, no-transform" && h.get("CDN-Cache-Control") === "no-store" && h.get("Cloudflare-CDN-Cache-Control") === "no-store");
  return freeze2(record);
}

// ui-src/overview-activity/client.mjs
var codes = /* @__PURE__ */ new Set(["configuration", "clock", "access_disabled", "cancelled", "body", "access_denied", "off", "unavailable", "disabled", "busy", "profile", "epoch_changed", "conditional", "status", "physical_unknown", "timed_out"]);
var fail2 = (code) => Object.assign(Error("overview_activity_unavailable"), { code: codes.has(code) ? code : "unavailable" });
var errorCode = (error) => {
  try {
    return codes.has(error?.code) ? error.code : "unavailable";
  } catch {
    return "unavailable";
  }
};
function createOverviewActivityClient({ fetcher, isEnabled = () => false, origin = globalThis.location?.origin, timeoutMs = 1e4, monotonic = () => performance.now(), wall = () => Date.now(), cryptoImpl = globalThis.crypto } = {}) {
  if (typeof fetcher !== "function" || !["https://inflation.gg", "https://www.inflation.gg", "http://127.0.0.1:8765", "http://localhost:8765"].includes(origin) || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 12e3) throw fail2("configuration");
  let enabled = false, paused = false, pauseReason = "paused", epoch2 = 0, flight = null, last = null, profileEpoch = null, status2 = "off", quarantined = false;
  const allowed2 = () => {
    try {
      return isEnabled() === true;
    } catch {
      return false;
    }
  };
  const mono = () => {
    const n2 = monotonic();
    if (!Number.isFinite(n2) || n2 < 0) throw fail2("clock");
    return n2;
  };
  const wallTime = () => {
    const n2 = wall();
    if (!Number.isFinite(n2) || n2 < 0) throw fail2("clock");
    return n2;
  };
  const live = (c) => {
    const yes = allowed2(), at = mono();
    if (!yes || !enabled || paused || c.epoch !== epoch2 || c.cancelled || at >= c.deadline) throw fail2(!yes ? "access_disabled" : "cancelled");
  };
  function cancel(c) {
    c.cancelled = true;
    c.controller.abort();
    if (c.reader && !c.cancel) c.cancel = Promise.resolve().then(() => c.reader.cancel()).catch(() => {
      quarantined = true;
    });
  }
  function revoke(next, drop = true) {
    epoch2++;
    status2 = next;
    if (drop) last = null;
    if (flight) cancel(flight);
  }
  function snapshot() {
    const before = epoch2, selected = last, prepared = selected ? own(selected.record.reference) : null, displayNow = wallTime(), yes = allowed2(), at = mono();
    const same = selected === last, active = yes && enabled && !paused && before === epoch2 && same, fresh = selected && at - selected.checkedMono < 3e4 && at >= selected.checkedMono, shown = status2 === "current" && !fresh ? "retained" : status2;
    return { status: !enabled || !yes ? "off" : paused ? "paused" : shown, pauseReason: paused ? pauseReason : null, reference: enabled && yes && same ? prepared : null, currentAgainstPublishedPointer: active && shown === "current" && selected?.record.currentAgainstPublishedPointer === true, upstreamLatestInspected: false, displayNow, lastVerifiedAt: same ? selected?.verifiedAt ?? null : null, physicalPending: flight !== null, quarantined };
  }
  async function body(r, limit, c) {
    const declared = r.headers.get("Content-Length");
    if (declared !== null && (!/^[1-9][0-9]*$/.test(declared) || Number(declared) > limit)) throw fail2("body");
    if (!/^application\/json(?:;|$)/i.test(r.headers.get("Content-Type") ?? "") || !r.body) throw fail2("body");
    live(c);
    const storage = new Uint8Array(limit);
    let n2 = 0;
    c.reader = r.body.getReader();
    for (; ; ) {
      const chunk = await c.reader.read();
      live(c);
      if (chunk.done) break;
      const owned = copyBytes(chunk.value, limit - n2);
      storage.set(owned, n2);
      n2 += owned.byteLength;
    }
    c.reader.releaseLock();
    c.reader = null;
    if (n2 === 0 || declared !== null && n2 !== Number(declared)) throw fail2("body");
    return storage.slice(0, n2);
  }
  async function request(path, limit, c, conditions = {}) {
    live(c);
    const r = await fetcher(path, { method: "GET", credentials: "same-origin", cache: "no-store", redirect: "error", headers: { [REQUEST_HEADER]: PROTOCOL, ...conditions }, signal: c.controller.signal });
    c.response = r;
    live(c);
    if (r.status === 401 || r.status === 403) {
      revoke("access_denied");
      throw fail2("access_denied");
    }
    if (r.status === 404) {
      revoke("unavailable");
      throw fail2("off");
    }
    if (r.status === 503) throw fail2("unavailable");
    return r;
  }
  async function closeBody(c) {
    if (c.reader) {
      if (!c.cancel) c.cancel = Promise.resolve().then(() => c.reader.cancel()).catch(() => {
        quarantined = true;
      });
      await c.cancel;
      try {
        c.reader.releaseLock();
      } catch {
      }
      c.reader = null;
    } else if (c.response?.body && !c.response.body.locked) {
      try {
        await c.response.body.cancel();
      } catch {
        quarantined = true;
      }
    }
    c.response = null;
  }
  function delivered(c, candidate) {
    const prepared = { status: candidate.record.state, reference: own(candidate.record.reference), currentAgainstPublishedPointer: candidate.record.currentAgainstPublishedPointer, upstreamLatestInspected: false, lastVerifiedAt: candidate.verifiedAt, physicalPending: flight !== null, quarantined };
    live(c);
    if (last !== candidate || quarantined) throw fail2("cancelled");
    return prepared;
  }
  return Object.freeze({
    setEnabled(value) {
      if (value !== true) {
        enabled = false;
        revoke("off");
      } else {
        enabled = true;
        status2 = last ? "retained" : "idle";
      }
    },
    setPaused(value, reason = "paused") {
      if (!["paused", "hidden", "offline"].includes(reason)) throw fail2("configuration");
      if (value === true) {
        paused = true;
        pauseReason = reason;
        revoke("paused", false);
      } else {
        paused = false;
        status2 = last ? "retained" : enabled ? "idle" : "off";
      }
    },
    clear() {
      revoke(enabled ? "idle" : "off");
    },
    withdraw() {
      revoke("access_denied");
    },
    state: snapshot,
    refresh() {
      if (!enabled || paused || !allowed2()) return Promise.reject(fail2("disabled"));
      if (flight || quarantined) return Promise.reject(fail2("busy"));
      const before = last, c = { epoch: epoch2, deadline: mono() + timeoutMs, controller: new AbortController(), cancelled: false, reader: null, response: null, cancel: null }, startEpoch = epoch2;
      flight = c;
      status2 = "loading";
      let rejectTimeout, timer2;
      const stopped = new Promise((_, reject) => rejectTimeout = reject);
      const task = (async () => {
        try {
          const pr = await request(PROFILE_PATH, 512, c);
          if (pr.status !== 200) throw fail2("profile");
          const p = profile(await body(pr, 512, c));
          await closeBody(c);
          live(c);
          if (profileEpoch !== null && profileEpoch !== p.publicEpoch) {
            revoke("unavailable");
            throw fail2("epoch_changed");
          }
          profileEpoch = p.publicEpoch;
          const prior = last?.record.state === "current" && last.record.publicEpoch === p.publicEpoch ? last : null;
          const r = await request(CURRENT_PATH, 8192, c, prior ? { "If-None-Match": prior.etag } : {});
          let candidate;
          if (r.status === 304) {
            if (!prior) throw fail2("conditional");
            headers(r, { hash: prior.responseHash, publicEpoch: p.publicEpoch, state: "current", capture: prior.record.reference.source.capturedAt, generated: prior.record.reference.source.sourceGeneratedAt });
            live(c);
            candidate = prior;
          } else {
            if (![200, 409].includes(r.status)) throw fail2("status");
            const bytes = await body(r, 8192, c), record = frame(bytes, r.status, p.publicEpoch), responseHash = await digest(bytes, cryptoImpl);
            live(c);
            const checked = headers(r, { hash: responseHash, publicEpoch: p.publicEpoch, state: record.state, capture: record.reference.source.capturedAt, generated: record.reference.source.sourceGeneratedAt });
            live(c);
            candidate = { record, responseHash, etag: checked.etag };
          }
          await closeBody(c);
          candidate = { ...candidate, checkedMono: mono(), verifiedAt: wallTime() };
          live(c);
          if (quarantined) throw fail2("physical_unknown");
          last = candidate;
          status2 = candidate.record.state;
          return candidate;
        } catch (error) {
          if (last !== null && last !== before && epoch2 === startEpoch) last = before;
          if (epoch2 === startEpoch) status2 = before ? "retained" : "unavailable";
          throw fail2(errorCode(error));
        } finally {
          await closeBody(c);
          clearTimeout(timer2);
          if (!quarantined && flight === c) flight = null;
        }
      })();
      timer2 = setTimeout(() => {
        cancel(c);
        if (epoch2 === startEpoch) {
          last = before;
          status2 = before ? "retained" : "unavailable";
        }
        rejectTimeout(fail2("timed_out"));
      }, timeoutMs);
      task.catch(() => {
      });
      return Promise.race([task, stopped]).then((candidate) => delivered(c, candidate)).catch((error) => {
        if (epoch2 === startEpoch) {
          last = before;
          status2 = before ? "retained" : "unavailable";
        }
        throw fail2(errorCode(error));
      });
    },
    dispose() {
      enabled = false;
      revoke("off");
    }
  });
}

// ui-src/item-api/reference-status.mjs
var known = /* @__PURE__ */ new Set(["current", "ready", "shown", "validated", "accepted_cache", "validated_cache"]);
function describeReferenceStatus({ capturedAt = null, status: status2 = "idle", hasData = false, available: available2 = true, retained = false, partial = false, visible: visible2 = true, online = true, bandMinutes = 20, now = Date.now() } = {}) {
  const stamp = typeof capturedAt === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/.test(capturedAt) ? Date.parse(capturedAt) : NaN;
  const age = Number.isFinite(stamp) && Number.isFinite(now) ? now - stamp : null;
  let phase, tone = "amber", label;
  if (status2 === "site_access" || status2 === "access_denied") {
    phase = "access_blocked";
    tone = "red";
    label = "Site access unavailable";
  } else if (status2 === "off" || status2 === "disabled" || status2 === "hidden") {
    phase = "off";
    label = "Reference display inactive";
  } else if (!visible2 || !online || status2 === "paused") {
    phase = "paused";
    label = hasData ? "Checks paused; original retrieval retained" : "Checks paused; no validated reference yet";
  } else if (status2 === "loading") {
    phase = "loading";
    label = hasData ? "Checking cache; displayed reference keeps its original retrieval" : "Awaiting a validated cache response";
  } else if (!hasData) {
    phase = status2 === "not_published" || status2 === "not_found" ? "not_published" : ["unavailable", "failure", "failed", "error"].includes(status2) ? "unavailable" : "unverified";
    tone = phase === "unavailable" ? "red" : "amber";
    label = phase === "not_published" ? "Reference not published here" : phase === "unavailable" ? "No validated reference available" : "Reference not yet verified";
  } else if (retained || status2 === "retained" || ["unavailable", "failure", "failed", "error"].includes(status2)) {
    phase = "retained";
    label = "Retained reference; original retrieval unchanged";
  } else if (age === null) {
    phase = "clock_unknown";
    label = "Retrieval clock unavailable; age unknown";
  } else if (age < 0) {
    phase = "clock_uncertain";
    label = "Capture clock ahead; retrieval age uncertain";
  } else if (!available2) {
    phase = "unavailable";
    label = "Selected reference unavailable; missing values are not zero";
  } else if (partial && age <= bandMinutes * 6e4) {
    phase = "partial";
    label = "Partial item evidence; original retrieval retained";
  } else if (!known.has(status2)) {
    phase = "unverified";
    label = "Reference state not yet verified";
  } else if (!Number.isFinite(bandMinutes) || bandMinutes <= 0) {
    phase = "clock_unknown";
    label = "Retrieval display band unavailable";
  } else if (age <= bandMinutes * 6e4) {
    phase = "recent";
    tone = "green";
    label = `Retrieved within ${bandMinutes}-minute display band; not verified fresh trades`;
  } else {
    phase = "aged";
    label = `Retrieval older than ${bandMinutes}-minute display band${partial ? "; partial item evidence remains incomplete" : ""}`;
  }
  return Object.freeze({ tone, phase, label, capturedAt: Number.isFinite(stamp) ? capturedAt : null, ageMs: age, bandMinutes });
}
function decorateReferenceStatus(node, state, text = node.textContent) {
  const icon = node.ownerDocument.createElement("i");
  icon.className = "source-status-dot status-" + state.tone;
  icon.setAttribute("aria-hidden", "true");
  const copy = node.ownerDocument.createElement("span");
  copy.textContent = text;
  node.replaceChildren(icon, copy);
  node.dataset.statusTone = state.tone;
  node.dataset.retrievalState = state.phase;
  node.title = state.label + "; retrieval is not individual sale or scan time.";
  if (state.capturedAt) node.dataset.rawCapturedAt = state.capturedAt;
  else delete node.dataset.rawCapturedAt;
}

// ui-src/overview-activity/view.mjs
function displayClock(iso2) {
  return typeof iso2 === "string" ? `(${iso2.slice(5, 7)}-${iso2.slice(8, 10)}-${iso2.slice(0, 4)} ${iso2.slice(11, 19)} UTC)` : "Unknown";
}
function exactAmount(lexeme) {
  if (lexeme === null) return "Unknown";
  const [a, b] = lexeme.split(".");
  return a.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (b === void 0 ? "" : "." + b);
}
function overviewActivityView(state, { now = Date.now() } = {}) {
  const r = state.reference, s = r?.source, hasData = !!r;
  const mode = state.status === "current" && state.currentAgainstPublishedPointer !== true ? "retained" : state.status;
  let indicator = describeReferenceStatus({ status: mode, capturedAt: s?.capturedAt, hasData, retained: mode === "retained", online: state.pauseReason !== "offline", visible: state.pauseReason !== "hidden", now });
  if (state.pauseReason === "offline") indicator = { ...indicator, label: "Offline; checks paused and original evidence retained." };
  if (indicator.tone === "green" && s && now - Date.parse(s.sourceGeneratedAt) > 20 * 6e4) indicator = { ...indicator, tone: "amber", phase: "publisher_aged", label: "Capture is recent; publisher clock remains older than the 20-minute display band." };
  const counts = r ? [
    ["Recorded-sales counters", exactAmount(r.counterSums.sourceRecordedSalesCounterSumLexeme), "Source counters; not unique or independently verified trades."],
    ["Reported-unit counters", exactAmount(r.counterSums.sourceReportedUnitCounterSumLexeme), "Reported counters; not standardized market volume."],
    ["Source-labelled mesos", exactAmount(r.counterSums.sourceReportedMesosSumLexeme), "Not independently verified completed trade value."],
    ["Median \xD7 count proxy", exactAmount(r.counterSums.medianCountProxySumLexeme), "Median unit price \xD7 recorded sales count; not actual traded mesos."]
  ] : [];
  return Object.freeze({
    title: "Reported overview window activity",
    status: indicator,
    counts,
    sourceCapture: s ? displayClock(s.capturedAt) : "Unknown",
    publisherTime: s ? displayClock(s.sourceGeneratedAt) : "Unknown",
    rawCapture: s?.capturedAt ?? null,
    window: r ? `${r.window.windowHours}h reported window; scanned ${r.window.scannedHours}h (previous ${r.window.previousScannedHours}h); comparable: ${r.window.comparable ? "yes" : "no"}. Exact start/end unknown.` : "No validated window available.",
    coverage: r ? `${r.coverage.receivedItemRows} received source rows; eligible counters: ${r.coverage.countEligibleItemRows} sales, ${r.coverage.reportedUnitEligibleItemRows} units, ${r.coverage.sourceReportedMesosEligibleItemRows} source mesos; ${r.coverage.medianCountProxyEligibleItemRows} proxy-eligible, ${r.coverage.medianCountProxyMissingPriceRows} missing median. Received rows are not whole-market coverage.` : "Coverage unknown.",
    publication: state.currentAgainstPublishedPointer ? "Matches the published cache pointer; upstream latest was not inspected." : hasData ? "Retained evidence; it is not current against the published pointer." : "No current published evidence admitted.",
    disclaimer: "Not since-launch totals or a daily ledger. Stock, turnover, unique participants and optimal trade window are unknown."
  });
}
function createOverviewActivityPanel({ document: document2, client } = {}) {
  if (!document2?.createElement || !client?.refresh || !client?.state) throw Error("overview_activity_view_unavailable");
  const root = document2.createElement("section");
  root.className = "overview-window-activity";
  root.setAttribute("aria-label", "Optional reported overview window activity");
  const title = document2.createElement("h3"), status2 = document2.createElement("p"), window2 = document2.createElement("p"), coverage = document2.createElement("p"), clocks = document2.createElement("p"), publication = document2.createElement("p"), list = document2.createElement("dl"), note = document2.createElement("p"), button = document2.createElement("button");
  button.type = "button";
  button.textContent = "Refresh cached window activity";
  root.append(title, status2, window2, coverage, clocks, publication, list, note, button);
  let disposed = false;
  function render({ now = Date.now() } = {}) {
    if (disposed) return;
    const state = client.state(), v = overviewActivityView(state, { now });
    root.hidden = state.status === "off";
    title.textContent = v.title;
    decorateReferenceStatus(status2, v.status, v.status.label);
    window2.textContent = v.window;
    coverage.textContent = v.coverage;
    clocks.textContent = `Publisher time ${v.publisherTime}; capture ${v.sourceCapture}.`;
    if (v.rawCapture) clocks.dataset.rawCapturedAt = v.rawCapture;
    else delete clocks.dataset.rawCapturedAt;
    publication.textContent = v.publication;
    note.textContent = v.disclaimer;
    list.replaceChildren();
    for (const [label, value, explanation] of v.counts) {
      const term = document2.createElement("dt"), detail = document2.createElement("dd");
      term.textContent = label;
      detail.textContent = value;
      detail.title = explanation;
      list.append(term, detail);
    }
    button.disabled = state.physicalPending || ["off", "paused", "access_denied", "loading"].includes(state.status);
  }
  async function refresh() {
    if (disposed) return;
    try {
      const promise = client.refresh();
      render();
      await promise;
    } catch {
    }
    if (!disposed) render();
  }
  button.addEventListener("click", refresh);
  render();
  return Object.freeze({ element: root, render, refresh, setEnabled(value) {
    client.setEnabled(value);
    render();
  }, setPaused(value, reason = "paused") {
    client.setPaused(value, reason);
    render();
  }, withdraw() {
    client.withdraw();
    render();
  }, clear() {
    client.clear();
    render();
  }, dispose() {
    disposed = true;
    client.setPaused?.(true, "hidden");
    button.removeEventListener("click", refresh);
    root.replaceChildren();
  } });
}

// ui-src/overview-activity/integration.mjs
var origins = /* @__PURE__ */ new Set(["https://inflation.gg", "https://www.inflation.gg", "http://127.0.0.1:8765", "http://localhost:8765"]);
var epoch = (v) => typeof v === "string" && /^[a-z][a-z0-9-]{0,63}$/.test(v);
function createOverviewActivityIntegration({ document: doc2, window: win, parentAvailable = false, parentState, fetcher } = {}) {
  const origin = win.location.origin, local = origin.startsWith("http:"), marker = () => local ? [doc2.body.dataset.overviewActivityProfile, doc2.body.dataset.overviewActivityEnabled, doc2.body.dataset.overviewActivityEpoch].join("|") : "host-profile-on-demand";
  const initial = marker(), markerReady = !local || doc2.body.dataset.overviewActivityProfile === "overview_window_aggregate_v1" && doc2.body.dataset.overviewActivityEnabled === "true" && epoch(doc2.body.dataset.overviewActivityEpoch);
  const available2 = parentAvailable === true && origins.has(origin) && markerReady;
  let intent = false, blocked = false, contextChanged = false, disposed = false, working = false, queued = null, lastKey = null, receiptKey = "", pausedState = false, pausedReason = "paused", workspaceKey = null;
  const state = () => {
    try {
      return parentState();
    } catch {
      return { blocked: true, reason: "parent_unavailable" };
    }
  };
  const workspaceSnapshot = () => {
    try {
      const authority = win.AstraPrivateWorkspace;
      if (!authority) return { allowed: true, key: "outer-host" };
      const p = authority.current();
      return { allowed: p?.verified === true && p.mode === "private_workspace" && Number.isFinite(p.expiresAt) && p.expiresAt > win.Date.now(), key: p?.mode + "|" + p?.expiresAt };
    } catch {
      return { allowed: false, key: null };
    }
  };
  const workspaceAllows = () => {
    const p = workspaceSnapshot();
    return p.allowed && (workspaceKey === null || p.key === workspaceKey);
  };
  const parentAllows = () => {
    const p = state();
    return available2 && !disposed && !contextChanged && marker() === initial && p.blocked !== true && p.reason !== "access_denied" && workspaceAllows();
  };
  const visible2 = () => !doc2.hidden && win.navigator.onLine !== false && win.location.hash === "#highlights";
  const client = available2 ? createOverviewActivityClient({ origin, fetcher, isEnabled: () => intent && !blocked && parentAllows() }) : null;
  let panel = null, root = null, toggle = null, note = null;
  function mount() {
    if (!available2 || disposed || root) return;
    const host = doc2.getElementById("view-highlights"), before = doc2.getElementById("highlights-fact-grid");
    if (!host || !before || !host.contains(before)) return;
    root = doc2.createElement("section");
    root.className = "overview-window-activity-integration";
    root.dataset.overviewActivity = "optional";
    toggle = doc2.createElement("button");
    toggle.type = "button";
    toggle.dataset.overviewActivityToggle = "";
    toggle.setAttribute("aria-controls", "overview-window-activity-data");
    note = doc2.createElement("p");
    note.className = "small muted";
    note.textContent = "Optional own-site window summary. It does not replace retained since-launch totals, daily histories or item evidence.";
    panel = createOverviewActivityPanel({ document: doc2, client: Object.freeze({ ...client, state: snapshot, refresh: () => refreshOwned(true) }) });
    panel.element.id = "overview-window-activity-data";
    root.append(toggle, note, panel.element);
    host.insertBefore(root, before);
    toggle.addEventListener("click", () => setEnabled(!intent));
  }
  function render() {
    mount();
    if (!root) return;
    toggle.textContent = "Overview window activity: " + (intent ? "On" : "Off");
    toggle.setAttribute("aria-pressed", String(intent));
    toggle.disabled = !parentAllows() && !intent;
    panel.render();
    if (contextChanged) note.textContent = "Overview context changed. Reload an authenticated page before enabling this data again.";
    else if (blocked) note.textContent = "Own-site access was withdrawn. Data is cleared; re-enable only after access is restored.";
  }
  function snapshot() {
    const value = client?.state() ?? { status: "off", reference: null, currentAgainstPublishedPointer: false, physicalPending: false };
    return blocked && intent ? { ...value, status: "access_denied" } : value;
  }
  function withdraw() {
    if (!client) return;
    blocked = true;
    queued = null;
    lastKey = null;
    client.withdraw();
    render();
  }
  function checkParent() {
    if (!client || disposed) return false;
    if (marker() !== initial) {
      contextChanged = true;
      withdraw();
      return false;
    }
    const p = state();
    if (p.blocked === true || p.reason === "access_denied") {
      withdraw();
      return false;
    }
    if (!workspaceAllows()) {
      if (intent) withdraw();
      return false;
    }
    return parentAllows();
  }
  function key() {
    const p = state(), v = p.evidenceSnapshot ?? p.snapshot;
    return JSON.stringify([p.checkedAt ?? null, v?.snapshotHash ?? null, v?.sources?.overview?.capturedAt ?? null, receiptKey]);
  }
  async function refreshOwned(force = false) {
    if (!client || !intent || blocked || !checkParent() || !visible2()) return;
    const wanted = key();
    if (!force && wanted === lastKey) return;
    if (working || client.state().physicalPending || client.state().quarantined) {
      queued = wanted;
      return;
    }
    working = true;
    lastKey = wanted;
    queued = null;
    try {
      const task = client.refresh();
      render();
      await task;
    } catch {
      if (client.state().status === "access_denied") withdraw();
    } finally {
      working = false;
      render();
      if (queued !== null && queued !== lastKey && !client.state().physicalPending && !client.state().quarantined) {
        queued = null;
        void refreshOwned();
      }
    }
  }
  function lifetime() {
    if (!client || disposed) return;
    checkParent();
    const paused = !visible2(), reason = doc2.hidden || win.location.hash !== "#highlights" ? "hidden" : win.navigator.onLine === false ? "offline" : "paused";
    if (paused !== pausedState || paused && reason !== pausedReason) {
      pausedState = paused;
      pausedReason = reason;
      client.setPaused(paused, reason);
    }
    if (paused) queued = null;
    render();
  }
  function setEnabled(value) {
    if (!client || disposed) return false;
    if (value !== true) {
      intent = false;
      blocked = false;
      queued = null;
      lastKey = null;
      workspaceKey = null;
      client.setEnabled(false);
      render();
      return false;
    }
    if (blocked && intent || !checkParent()) return false;
    const proof = workspaceSnapshot();
    if (!proof.allowed) return false;
    workspaceKey = proof.key;
    blocked = false;
    intent = true;
    lastKey = null;
    client.setEnabled(true);
    lifetime();
    if (visible2()) void refreshOwned(true);
    return true;
  }
  function afterOwnedCheck() {
    if (!client || disposed) return;
    checkParent();
    lifetime();
    if (intent && !blocked) void refreshOwned();
  }
  function receipt(event) {
    const d = event.detail, stamp = typeof d?.sourceUpdatedAt === "string" && d.sourceUpdatedAt.length <= 40 && Number.isFinite(Date.parse(d.sourceUpdatedAt)) ? d.sourceUpdatedAt : "";
    receiptKey = stamp;
    afterOwnedCheck();
  }
  function wake() {
    const wasPaused = client?.state().status === "paused";
    lifetime();
    if (wasPaused && visible2()) lastKey = null;
    afterOwnedCheck();
  }
  function workspace() {
    if (!workspaceAllows()) withdraw();
    else render();
  }
  doc2.addEventListener("astramarkethighlightsready", render);
  doc2.addEventListener("astramarketsnapshot", receipt);
  doc2.addEventListener("astracalculationagetick", render);
  doc2.addEventListener("astraprivateworkspace", workspace);
  doc2.addEventListener("visibilitychange", wake);
  for (const name of ["online", "offline", "hashchange"]) win.addEventListener(name, wake);
  render();
  return Object.freeze({ available: available2, setEnabled, afterOwnedCheck, observeParent() {
    checkParent();
    render();
  }, withdraw, render, state: snapshot, dispose() {
    disposed = true;
    intent = false;
    queued = null;
    client?.dispose();
    panel?.dispose();
    root?.remove();
    doc2.removeEventListener("astramarkethighlightsready", render);
    doc2.removeEventListener("astramarketsnapshot", receipt);
    doc2.removeEventListener("astracalculationagetick", render);
    doc2.removeEventListener("astraprivateworkspace", workspace);
    doc2.removeEventListener("visibilitychange", wake);
    for (const name of ["online", "offline", "hashchange"]) win.removeEventListener(name, wake);
  } });
}

// ui-src/api-calculations/entry.mjs
var doc = document;
var available = doc.body.dataset.apiCalculationsAvailable === "true";
var EXPECTED = "865944dc992219e01b2aad45a6191174d112f3f1902e4ac86c79a6d23a481e17";
var timer = null;
var running = false;
var activity = null;
var runtime = createCalculationRuntime({
  origin: location.origin,
  available,
  definitionHash: EXPECTED,
  parse: (bytes) => parseApiIndexSnapshot(bytes, { expectedDefinitionHash: EXPECTED, expectedRows: api_index_definition_data_v1_default.goods, expectedCashRows: api_index_definition_data_v1_default.cash }),
  unpackDaily: unpackApiDailyItemHistory,
  itemDefinitions: api_index_definition_data_v1_default,
  selection: () => {
    const s = window.AstraRollingBenchmark?.getState();
    return { mode: s?.mode || "rolling", windowDays: s?.windowDays || 7 };
  },
  notify: (state) => {
    activity?.observeParent();
    doc.dispatchEvent(new CustomEvent("astracalculationchange", { detail: { status: state.status, readerMode: state.readerMode, snapshotHash: state.snapshot?.snapshotHash ?? null, evidenceSnapshotHash: state.evidenceSnapshot?.snapshotHash ?? null } }));
  }
});
window.AstraApiCalculations = runtime;
activity = createOverviewActivityIntegration({ document: doc, window, parentAvailable: available, parentState: () => runtime.state(), fetcher: (...args) => fetch(...args) });
window.AstraOverviewWindowActivity = activity;
var visible = () => !doc.hidden && navigator.onLine !== false;
async function poll() {
  if (!available || running || !visible()) return;
  running = true;
  try {
    await runtime.refresh();
  } finally {
    running = false;
    activity.afterOwnedCheck();
    doc.dispatchEvent(new Event("astracalculationcheck"));
    clearTimeout(timer);
    if (!runtime.state().blocked && visible()) timer = setTimeout(poll, Math.max(1e3, runtime.state().nextCheckAt - Date.now()));
  }
}
doc.addEventListener("visibilitychange", () => {
  if (!visible()) clearTimeout(timer);
  else void poll();
});
window.addEventListener("online", () => void poll());
window.addEventListener("offline", () => clearTimeout(timer));
doc.addEventListener("input", (event) => {
  if (event.target?.matches?.("#price-check-header-query,#price-check-query")) void poll();
});
doc.getElementById("refresh")?.addEventListener("click", () => void poll());
if (available) void poll();

})();
