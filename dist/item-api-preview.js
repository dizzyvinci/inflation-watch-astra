(() => {
'use strict';
// ops/api-price-item-dto.mjs
var MAX_BYTES = 5e6;
var HASH = /^[0-9a-f]{64}$/;
var own = (v, k) => Object.prototype.hasOwnProperty.call(v, k);
var STAT_NAMES = Object.freeze({ "0": "STR", "1": "DEX", "2": "INT", "3": "LUK", "4": "Max HP", "5": "Max MP", "6": "Speed", "7": "Jump", "9": "Magic ATT", "10": "Weapon DEF", "11": "Magic DEF", "12": "Accuracy", "13": "Avoidability", "14": "Crit rate", "15": "Crit damage", "16": "Weapon ATT" });
var PROFILE = Object.freeze({ version: 1, kind: "market_api_price_item", sourceUrl: "https://maplestory.market/api/prices", statMapSourceUrl: "https://maplestory.market/assets/VDivider-1_mhy5kl.js", statMapSha256: "1d08886333ef15b7615efc9330c5cf673946256265caf19e672621e32a856cf7" });
var InvalidProfile = class extends Error {
  constructor(code) {
    super(code);
    this.name = "InvalidProfile";
  }
};
var fail = (code) => {
  throw new InvalidProfile(code);
};
var DecimalToken = class {
  constructor(lexeme) {
    this.lexeme = lexeme;
    Object.freeze(this);
  }
};
function bytes(value) {
  if (typeof value === "string") {
    if (value.length > MAX_BYTES) fail("body_bound");
    value = new TextEncoder().encode(value);
  }
  if (!(value instanceof Uint8Array) || !value.length || value.byteLength > MAX_BYTES) fail("body_bound");
  return value;
}
async function sha256(raw) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", raw))].map((v) => v.toString(16).padStart(2, "0")).join("");
}
function parseStrictJson(raw) {
  let s;
  try {
    s = new TextDecoder("utf-8", { fatal: true }).decode(bytes(raw));
  } catch (e) {
    if (e instanceof InvalidProfile) throw e;
    fail("invalid_utf8");
  }
  let p = 0, tokens = 0;
  const ws = () => {
    while (/[\x20\t\r\n]/.test(s[p] ?? "x")) p++;
  };
  function value(depth) {
    if (depth > 64 || ++tokens > 5e5) fail("json_complexity");
    ws();
    const c = s[p];
    if (c === '"') {
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
            fail("invalid_string");
          }
        }
      }
      fail("invalid_string");
    }
    if (c === "{") {
      p++;
      ws();
      const o = /* @__PURE__ */ Object.create(null);
      if (s[p] === "}") {
        p++;
        return o;
      }
      while (true) {
        ws();
        if (s[p] !== '"') fail("object_key");
        const k = value(depth + 1);
        if (own(o, k)) fail("duplicate_json_key");
        ws();
        if (s[p++] !== ":") fail("object_colon");
        o[k] = value(depth + 1);
        ws();
        if (s[p] === "}") {
          p++;
          return o;
        }
        if (s[p++] !== ",") fail("object_separator");
      }
    }
    if (c === "[") {
      p++;
      ws();
      const a = [];
      if (s[p] === "]") {
        p++;
        return a;
      }
      while (true) {
        a.push(value(depth + 1));
        ws();
        if (s[p] === "]") {
          p++;
          return a;
        }
        if (s[p++] !== ",") fail("array_separator");
      }
    }
    for (const [word, v] of [["true", true], ["false", false], ["null", null]]) if (s.startsWith(word, p)) {
      p += word.length;
      return v;
    }
    const number = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(s.slice(p));
    if (!number) fail("invalid_json_value");
    p += number[0].length;
    if (number[0].length > 256) fail("number_bound");
    if (!/[.eE]/.test(number[0]) && Number.isSafeInteger(Number(number[0]))) return Number(number[0]);
    return new DecimalToken(number[0]);
  }
  const result = value(0);
  ws();
  if (p !== s.length) fail("json_trailing");
  return result;
}
var object = (v) => v !== null && typeof v === "object" && !Array.isArray(v) && !(v instanceof DecimalToken);
function shape(v, required, optional = []) {
  if (!object(v) || required.some((k) => !own(v, k)) || Object.keys(v).some((k) => !required.includes(k) && !optional.includes(k))) fail("unexpected_fields");
}
function integer(v, min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(v) || v < min || v > max) fail("invalid_integer");
  return v;
}
function id(v) {
  return integer(v, 1, 999999999);
}
function freeze(v) {
  if (v && typeof v === "object") {
    for (const x of Object.values(v)) freeze(x);
    Object.freeze(v);
  }
  return v;
}
function iso(v) {
  if (typeof v !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(v) || !Number.isFinite(Date.parse(v))) fail("invalid_clock");
  const parts = /^(\d{4}-\d\d-\d\d)T(\d\d):(\d\d):(\d\d)/.exec(v), d = new Date(v);
  if (d.toISOString().slice(0, 10) !== parts[1] || Number(parts[2]) > 23 || Number(parts[3]) > 59 || Number(parts[4]) > 59) fail("invalid_clock");
  return v;
}
var META_URLS = /* @__PURE__ */ new Set(["https://maplestory.io/api/MCW/1/item/list?cashFilter=true&count=10000", "https://maplestory.io/api/MCW/1/item/list?cashFilter=false&count=10000"]);
function assertSafeItemDto(dto) {
  shape(dto, ["schemaVersion", "kind", "itemId", "identity", "source", "aggregate", "variants", "semantics"], ["sourceTypicalAttack"]);
  if (dto.schemaVersion !== 1 || dto.kind !== PROFILE.kind) fail("dto_profile");
  id(dto.itemId);
  shape(dto.identity, ["name", "status", "region", "clientVersion", "meaning", "evidence"]);
  if (dto.identity.name !== null && (typeof dto.identity.name !== "string" || !dto.identity.name.trim() || dto.identity.name.length > 300)) fail("dto_identity");
  if (!["unique_client_id", "conflicting_client_id", "unknown_client_id"].includes(dto.identity.status) || dto.identity.region !== "MCW" || dto.identity.clientVersion !== "1" || dto.identity.meaning !== "client_presence_not_market_availability_or_release" || !Array.isArray(dto.identity.evidence) || dto.identity.evidence.length > 4) fail("dto_identity");
  if (dto.identity.status === "unique_client_id" !== (dto.identity.name !== null) || dto.identity.name !== null && dto.identity.evidence.length === 0) fail("dto_identity_binding");
  for (const v of dto.identity.evidence) {
    shape(v, ["sourceUrl", "retainedMetadataSha256"]);
    if (!META_URLS.has(v.sourceUrl) || !HASH.test(v.retainedMetadataSha256)) fail("dto_identity_evidence");
  }
  shape(dto.source, ["provider", "operation", "sourceUrl", "rawBodySha256", "retrievedAt", "retrievalTimeKind", "sourceObservedAt", "window", "sourceWindowSemantics"]);
  if (dto.source.provider !== "maplestory.market" || dto.source.operation !== "prices" || dto.source.sourceUrl !== PROFILE.sourceUrl || !HASH.test(dto.source.rawBodySha256) || dto.source.sourceObservedAt !== null || dto.source.retrievalTimeKind !== "http_response_completed" || dto.source.sourceWindowSemantics !== "primary_client_reported_window_not_exact_observation_bounds") fail("dto_source");
  iso(dto.source.retrievedAt);
  shape(dto.source.window, ["reportedDays", "exactStartAt", "exactEndAt"]);
  if (dto.source.window.reportedDays !== 3 || dto.source.window.exactStartAt !== null || dto.source.window.exactEndAt !== null) fail("dto_window");
  function money(v, nullable = true) {
    if (v === null && nullable) return;
    if (typeof v !== "string" || v.length > 160 || !/^\d+(?:\.\d+)?$/.test(v)) fail("dto_price");
  }
  function s(v) {
    if (v === null) return;
    shape(v, ["reportedSalesCount", "reportedUnitCount", "reportedDaySalesCount", "reportedDayUnitCount", "averageUnitPrice", "medianUnitPrice", "basis", "dayCounterBoundsKnown"]);
    for (const k of ["reportedSalesCount", "reportedUnitCount", "reportedDaySalesCount", "reportedDayUnitCount"]) integer(v[k]);
    money(v.averageUnitPrice);
    money(v.medianUnitPrice);
    if (v.basis !== "source_labelled_sold_not_independently_confirmed_transactions" || v.dayCounterBoundsKnown !== false) fail("dto_sold");
  }
  function a(v) {
    if (v === null) return;
    shape(v, ["reportedListingCount", "reportedSellerCount", "medianUnitPrice", "p25UnitPrice", "p75UnitPrice", "basis", "currentAvailabilityVerified"]);
    integer(v.reportedListingCount);
    integer(v.reportedSellerCount);
    for (const k of ["medianUnitPrice", "p25UnitPrice", "p75UnitPrice"]) money(v[k]);
    if (v.basis !== "source_seen_asking_prices" || v.currentAvailabilityVerified !== false) fail("dto_asking");
  }
  function r(v, scopes, isItem = false) {
    if (v === null) return;
    shape(v, ["unitPrice", "basis", "reportedSamples", "scope", "aggregation", "exactVariantValue", "isNearFallback"]);
    money(v.unitPrice, false);
    integer(v.reportedSamples);
    if (!["sold", "listed"].includes(v.basis) || !scopes.includes(v.scope) || v.aggregation !== (isItem ? v.basis === "sold" ? "average" : "median" : "unknown") || v.exactVariantValue !== false || v.isNearFallback !== (v.scope === "near")) fail("dto_reference");
  }
  shape(dto.aggregate, ["sold", "asking", "reference"], ["dealReference"]);
  s(dto.aggregate.sold);
  a(dto.aggregate.asking);
  r(dto.aggregate.reference, ["item"], true);
  if (own(dto.aggregate, "dealReference")) r(dto.aggregate.dealReference, ["item"], true);
  shape(dto.variants, ["reportedStats", "successfulScrolls", "attackPools", "presence"]);
  shape(dto.variants.presence, ["reportedStats", "successfulScrolls", "attackPools"]);
  for (const value of Object.values(dto.variants.presence)) if (typeof value !== "boolean") fail("dto_presence");
  for (const [key, scopes] of [["reportedStats", ["stats"]], ["successfulScrolls", ["scrolls", "near"]], ["attackPools", ["attack", "near"]]]) {
    if (!Array.isArray(dto.variants[key]) || dto.variants[key].length > 2e4 || !dto.variants.presence[key] && dto.variants[key].length) fail("dto_groups");
    const seen = /* @__PURE__ */ new Set();
    for (const v of dto.variants[key]) {
      const stats = key === "reportedStats", attack = key === "attackPools";
      shape(v, attack ? ["groupKey", "reportedAttack", "sold", "asking", "reference", "qualityConstant", "matchSemantics"] : ["successfulUpgrades", "slotsLeft", "reference", "qualityConstant", "groupKey", "matchSemantics", ...stats ? ["reportedStats", "unreportedStats", "sourceComparisonMayIgnoreStats"] : []], stats ? [] : ["dealReference"]);
      let expectedKey;
      if (attack) {
        integer(v.reportedAttack);
        s(v.sold);
        a(v.asking);
        expectedKey = `attack:${dto.itemId}:${v.reportedAttack}`;
        if (v.matchSemantics !== "attack_only_pool_other_stats_not_constant") fail("dto_match");
      } else {
        integer(v.successfulUpgrades, 0, 100);
        integer(v.slotsLeft, 0, 100);
        expectedKey = `${stats ? "stats" : "scrolls"}:${dto.itemId}:u${v.successfulUpgrades}:s${v.slotsLeft}`;
        if (stats) {
          if (!object(v.reportedStats) || Object.keys(v.reportedStats).some((k) => !own(STAT_NAMES, k))) fail("dto_stats");
          for (const n of Object.values(v.reportedStats)) integer(n, -1e6, 1e6);
          expectedKey += ":" + Object.entries(v.reportedStats).sort((a2, b) => Number(a2[0]) - Number(b[0])).map(([k, n]) => `${k}=${n}`).join(",");
          if (v.unreportedStats !== "unknown_not_zero" || JSON.stringify(v.sourceComparisonMayIgnoreStats) !== '["10","11"]' || v.matchSemantics !== "reported_signature_not_certified_complete_roll") fail("dto_match");
        } else if (v.matchSemantics !== "successful_upgrades_and_slots_pool_all_stats") fail("dto_match");
      }
      if (v.groupKey !== expectedKey || seen.has(v.groupKey) || v.qualityConstant !== false) fail("dto_group_binding");
      seen.add(v.groupKey);
      r(v.reference, scopes);
      if (own(v, "dealReference")) r(v.dealReference, scopes);
    }
  }
  shape(dto.semantics, ["moneyUnit", "counts", "sampleThresholdApplied", "exactVariantHistoryAvailable", "cleanStateInferred", "feesApplied", "publicationAuthorized", "statMapSha256"]);
  if (dto.semantics.moneyUnit !== "source_unit_price_in_mesos" || dto.semantics.counts !== "source_reported_counts_not_independently_verified_trades" || dto.semantics.sampleThresholdApplied !== null || dto.semantics.statMapSha256 !== PROFILE.statMapSha256 || ["exactVariantHistoryAvailable", "cleanStateInferred", "feesApplied", "publicationAuthorized"].some((k) => dto.semantics[k] !== false)) fail("dto_semantics");
  if (own(dto, "sourceTypicalAttack")) integer(dto.sourceTypicalAttack);
  return true;
}
function filterReportedStats(dto, { stats = [], slotsLeft = null, successfulUpgrades = null } = {}) {
  assertSafeItemDto(dto);
  if (!Array.isArray(stats) || stats.length > 16) fail("filter_bound");
  const codes = /* @__PURE__ */ new Set();
  for (const q of stats) {
    shape(q, ["code"], ["minimum", "maximum"]);
    if (!own(STAT_NAMES, q.code) || codes.has(q.code)) fail("filter_stat");
    codes.add(q.code);
    if (own(q, "minimum")) integer(q.minimum, -1e6, 1e6);
    if (own(q, "maximum")) integer(q.maximum, -1e6, 1e6);
    if (own(q, "minimum") && own(q, "maximum") && q.minimum > q.maximum) fail("filter_range");
  }
  if (slotsLeft !== null) integer(slotsLeft, 0, 100);
  if (successfulUpgrades !== null) integer(successfulUpgrades, 0, 100);
  return dto.variants.reportedStats.filter((row) => (slotsLeft === null || row.slotsLeft === slotsLeft) && (successfulUpgrades === null || row.successfulUpgrades === successfulUpgrades) && stats.every((q) => own(row.reportedStats, q.code) && (!own(q, "minimum") || row.reportedStats[q.code] >= q.minimum) && (!own(q, "maximum") || row.reportedStats[q.code] <= q.maximum)));
}
function filterOptions(dto) {
  assertSafeItemDto(dto);
  const rows2 = dto.variants.reportedStats;
  return freeze({ stats: [...new Set(rows2.flatMap((v) => Object.keys(v.reportedStats)))].sort((a, b) => Number(a) - Number(b)).map((code) => ({ code, label: STAT_NAMES[code] })), slotsLeft: [...new Set(rows2.map((v) => v.slotsLeft))].sort((a, b) => a - b), successfulUpgrades: [...new Set(rows2.map((v) => v.successfulUpgrades))].sort((a, b) => a - b), unknownStatsMatch: false, attackPoolsAreSeparate: true });
}
function compareMoney(a, b) {
  const [ai, af = ""] = a.split("."), [bi, bf = ""] = b.split(".");
  if (ai.length !== bi.length) return ai.length < bi.length ? -1 : 1;
  if (ai !== bi) return ai < bi ? -1 : 1;
  const width = Math.max(af.length, bf.length), ap = af.padEnd(width, "0"), bp = bf.padEnd(width, "0");
  return ap === bp ? 0 : ap < bp ? -1 : 1;
}
function filterEvidenceGroups(dto, query) {
  assertSafeItemDto(dto);
  shape(query, ["kind"], ["stats", "slotsLeft", "successfulUpgrades", "minimumAttack", "maximumAttack", "minimumReferenceSamples", "basis", "includeNearFallback", "sortReference"]);
  if (!["reported_stats", "scroll_state", "attack_pool"].includes(query.kind)) fail("filter_kind");
  if (own(query, "basis") && !["sold", "listed"].includes(query.basis)) fail("filter_basis");
  if (own(query, "minimumReferenceSamples")) integer(query.minimumReferenceSamples);
  if (own(query, "includeNearFallback") && typeof query.includeNearFallback !== "boolean") fail("filter_near");
  if (own(query, "sortReference") && !["ascending", "descending"].includes(query.sortReference)) fail("filter_sort");
  let rows2;
  if (query.kind === "reported_stats") {
    if (own(query, "minimumAttack") || own(query, "maximumAttack")) fail("incompatible_filter_pool");
    rows2 = filterReportedStats(dto, { stats: query.stats ?? [], slotsLeft: query.slotsLeft ?? null, successfulUpgrades: query.successfulUpgrades ?? null });
  } else if (query.kind === "scroll_state") {
    if (own(query, "stats") || own(query, "minimumAttack") || own(query, "maximumAttack")) fail("incompatible_filter_pool");
    if (own(query, "slotsLeft")) integer(query.slotsLeft, 0, 100);
    if (own(query, "successfulUpgrades")) integer(query.successfulUpgrades, 0, 100);
    rows2 = dto.variants.successfulScrolls.filter((v) => (!own(query, "slotsLeft") || v.slotsLeft === query.slotsLeft) && (!own(query, "successfulUpgrades") || v.successfulUpgrades === query.successfulUpgrades));
  } else {
    if (own(query, "stats") || own(query, "slotsLeft") || own(query, "successfulUpgrades")) fail("incompatible_filter_pool");
    if (own(query, "minimumAttack")) integer(query.minimumAttack);
    if (own(query, "maximumAttack")) integer(query.maximumAttack);
    if (own(query, "minimumAttack") && own(query, "maximumAttack") && query.minimumAttack > query.maximumAttack) fail("filter_range");
    rows2 = dto.variants.attackPools.filter((v) => (!own(query, "minimumAttack") || v.reportedAttack >= query.minimumAttack) && (!own(query, "maximumAttack") || v.reportedAttack <= query.maximumAttack));
  }
  const matchedBeforeReferenceFilters = rows2.length;
  rows2 = rows2.filter((v) => (query.includeNearFallback === true || !v.reference?.isNearFallback) && (!own(query, "basis") || v.reference?.basis === query.basis) && (!own(query, "minimumReferenceSamples") || v.reference !== null && v.reference.reportedSamples >= query.minimumReferenceSamples));
  if (query.sortReference) rows2 = [...rows2].sort((a, b) => {
    if (a.reference === null || b.reference === null) return a.reference === b.reference ? 0 : a.reference === null ? 1 : -1;
    const n = compareMoney(a.reference.unitPrice, b.reference.unitPrice);
    return (query.sortReference === "descending" ? -n : n) || a.groupKey.localeCompare(b.groupKey, "en");
  });
  return freeze({
    kind: query.kind,
    rows: rows2,
    matchedBeforeReferenceFilters,
    nearFallbacksIncluded: query.includeNearFallback === true,
    sampleMeaning: "source_reference_samples_not_quantity_or_verified_fills",
    qualityConstant: false,
    temporalHistoryAvailable: false,
    source: dto.source
  });
}

// ops/api-item-reference-protocol.mjs
var HASH2 = /^[a-f0-9]{64}$/;
var enc = new TextEncoder();
var check = (v) => {
  if (!v) throw TypeError("Invalid item reference");
};
async function validatePublicItemReference(v) {
  v = structuredClone(v);
  check(enc.encode(JSON.stringify(v)).length <= 3e5);
  const keys = ["schemaVersion", "kind", "itemId", "projectionGeneration", "dtoSha256", "sourceCapturedAt", "sourceObservedAt", "reportedWindowDays", "exactWindowBoundsKnown", "qualifiedIndividualTrades", "sourceCreditUrl", "item"];
  check(v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).sort().join(",") === keys.sort().join(","));
  assertSafeItemDto(v.item);
  check(v.schemaVersion === 1 && v.kind === "api_item_price_reference" && v.itemId === v.item.itemId && HASH2.test(v.projectionGeneration) && HASH2.test(v.dtoSha256) && v.sourceCapturedAt === v.item.source.retrievedAt && v.sourceObservedAt === null && v.reportedWindowDays === 3 && v.exactWindowBoundsKnown === false && v.qualifiedIndividualTrades === 0 && v.sourceCreditUrl === `https://maplestory.market/items/${v.itemId}?ref=v6kkdvp6`);
  check(await sha256(enc.encode(JSON.stringify(v.item))) === v.dtoSha256);
  return v;
}

// ui-src/item-api/item-loader.mjs
var sha = async (bytes3) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes3))].map((n) => n.toString(16).padStart(2, "0")).join("");
var abort = () => Object.assign(Error("Aborted"), { name: "AbortError" });
async function boundedBytes(response, limit) {
  const size = Number(response.headers.get("content-length"));
  if (Number.isFinite(size) && size > limit) throw Error("Body bound");
  if (response.body?.getReader) {
    const reader = response.body.getReader(), chunks = [];
    let length = 0;
    try {
      for (; ; ) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > limit) {
          await reader.cancel();
          throw Error("Body bound");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const out = new Uint8Array(length);
    let at = 0;
    for (const b2 of chunks) {
      out.set(b2, at);
      at += b2.length;
    }
    return out;
  }
  const b = new Uint8Array(await response.arrayBuffer());
  if (b.length > limit) throw Error("Body bound");
  return b;
}
function createItemReferenceClient({ fetcher, enabled: enabled2 = false, isEnabled = () => true, now = Date.now, ttlMs = 3e4, timeoutMs = 1e4, maxItems = 32, maxBytes = 2097152, maxFlights = 4 } = {}) {
  if (!Number.isInteger(ttlMs) || ttlMs < 0 || ttlMs > 6e4 || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 12e3 || !Number.isSafeInteger(maxItems) || maxItems < 1 || maxItems > 64 || !Number.isSafeInteger(maxBytes) || maxBytes < 3e5 || maxBytes > 8388608 || !Number.isSafeInteger(maxFlights) || maxFlights < 1 || maxFlights > 8) throw Error("Bounded client settings required");
  let bytes3 = 0;
  const cache = /* @__PURE__ */ new Map(), flights = /* @__PURE__ */ new Map(), failures = /* @__PURE__ */ new Map();
  const active = () => enabled2 === true && isEnabled() === true;
  const touch = (id2, value) => {
    if (cache.has(id2)) bytes3 -= cache.get(id2).bytes;
    cache.delete(id2);
    cache.set(id2, value);
    bytes3 += value.bytes;
    while (cache.size > maxItems || bytes3 > maxBytes) {
      const first = cache.keys().next().value;
      bytes3 -= cache.get(first).bytes;
      cache.delete(first);
    }
  };
  const wait = (promise, signal) => new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abort());
    const onAbort = () => {
      cleanup();
      reject(abort());
    }, cleanup = () => signal?.removeEventListener("abort", onAbort);
    signal?.addEventListener("abort", onAbort, { once: true });
    promise.then((v) => {
      cleanup();
      signal?.aborted ? reject(abort()) : resolve(v);
    }, (e) => {
      cleanup();
      reject(e);
    });
  });
  async function read(id2) {
    const prior = cache.get(id2), controller = new AbortController();
    let timer;
    const expired = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(Error("Read deadline"));
      }, timeoutMs);
    });
    const deadline = (p) => Promise.race([p, expired]);
    try {
      let response;
      for (let attempt = 0; attempt < 2; attempt++) {
        const generation2 = attempt === 0 ? prior?.data.projectionGeneration : null, url = "/api-item-prices/" + id2 + ".json" + (generation2 ? "?generation=" + generation2 : "");
        response = await deadline(fetcher(url, { method: "GET", credentials: "same-origin", cache: "no-cache", redirect: "error", signal: controller.signal, headers: prior ? { "If-None-Match": prior.etag } : {} }));
        if (response.status !== 409) break;
        if (attempt === 1) throw Error("Generation retry bound");
      }
      if (!active()) throw Error("Disabled");
      const mode = response.headers.get("X-Astra-API-Item-Mode"), captured = response.headers.get("X-Astra-API-Item-Captured-At"), generation = response.headers.get("X-Astra-API-Item-Generation"), etag = response.headers.get("ETag");
      if (!["validated_cache", "retained"].includes(mode) || !/^"api-item-[a-f0-9]{64}"$/.test(etag ?? "")) throw Error("Missing item context");
      if (response.status === 304) {
        if (!prior || prior.etag !== etag || prior.data.sourceCapturedAt !== captured || prior.data.projectionGeneration !== generation) throw Error("Mismatched304");
        const value2 = { ...prior, mode, expires: now() + ttlMs };
        touch(id2, value2);
        failures.delete(id2);
        return value2;
      }
      if (response.status !== 200 || !/^application\/json(?:;|$)/i.test(response.headers.get("Content-Type") ?? "")) throw Error("Item unavailable");
      const body = await deadline(boundedBytes(response, 3e5));
      if ('"api-item-' + await sha(body) + '"' !== etag) throw Error("Body hash mismatch");
      const data = await validatePublicItemReference(parseStrictJson(body));
      if (data.itemId !== id2 || data.sourceCapturedAt !== captured || data.projectionGeneration !== generation || prior && Date.parse(data.sourceCapturedAt) < Date.parse(prior.data.sourceCapturedAt)) throw Error("Wrong/older item context");
      if (!active()) throw Error("Disabled");
      const value = { data, mode, etag, bytes: body.length, expires: now() + ttlMs };
      touch(id2, value);
      failures.delete(id2);
      return value;
    } catch (error) {
      const old = failures.get(id2)?.count ?? 0;
      failures.set(id2, { count: old + 1, retryAt: now() + Math.min(3e5, 3e4 * 2 ** Math.min(old, 4)) });
      while (failures.size > 64) failures.delete(failures.keys().next().value);
      if (prior && active()) {
        const value = { ...prior, mode: "retained" };
        touch(id2, value);
        return value;
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  return Object.freeze({ async loadItem({ itemId, signal } = {}) {
    if (!Number.isSafeInteger(itemId) || itemId < 1 || itemId > 999999999) throw Error("Exact numeric ID required");
    if (!active() || typeof fetcher !== "function") throw Error("Not connected");
    let value = cache.get(itemId);
    if (value && now() < value.expires) return { data: structuredClone(value.data), mode: value.mode };
    if ((failures.get(itemId)?.retryAt ?? 0) > now()) {
      if (value) return { data: structuredClone(value.data), mode: "retained" };
      throw Error("Read backoff");
    }
    if (!flights.has(itemId)) {
      if (flights.size >= maxFlights) throw Error("Read capacity");
      const p = read(itemId);
      flights.set(itemId, p);
      p.finally(() => flights.delete(itemId)).catch(() => {
      });
    }
    value = await wait(flights.get(itemId), signal);
    return { data: structuredClone(value.data), mode: value.mode };
  }, state(id2) {
    const value = cache.get(id2);
    return value ? { mode: value.mode, capturedAt: value.data.sourceCapturedAt, generation: value.data.projectionGeneration } : null;
  }, clear() {
    cache.clear();
    failures.clear();
    bytes3 = 0;
  } });
}

// ops/api-discovery-membership.mjs
var NUMBER_PROTO = Object.getPrototypeOf(parseStrictJson("0.5"));
var enc2 = new TextEncoder();
var MembershipProfileError = class extends Error {
};
var check2 = (ok, code = "membership_profile") => {
  if (!ok) throw new MembershipProfileError(code);
};
var int = (v, min = 0, max = Number.MAX_SAFE_INTEGER) => {
  check2(Number.isSafeInteger(v) && v >= min && v <= max);
  return v;
};
var shape2 = (v, keys) => check2(v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).sort().join(",") === [...keys].sort().join(","));
var clock = (v) => typeof v === "string" && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
var hash = async (value) => sha256(typeof value === "string" ? enc2.encode(value) : value);

// ops/api-item-discovery-contract.mjs
var HASH3 = /^[a-f0-9]{64}$/;
async function validateManifest(m, p = null) {
  shape2(m, ["schemaVersion", "kind", "scope", "sourceCreditUrl", "priceProjectionGeneration", "identityMetadata", "spriteBindingsSha256", "providerBindingsSha256", "sources", "itemCount", "pages", "indexHash"]);
  check2(m.schemaVersion === 1 && m.kind === "api_item_identity_manifest" && m.scope === "accepted_api_identity_union_with_retained_api_memberships" && m.sourceCreditUrl === "https://maplestory.market/?ref=v6kkdvp6" && HASH3.test(m.priceProjectionGeneration) && HASH3.test(m.spriteBindingsSha256) && HASH3.test(m.providerBindingsSha256) && HASH3.test(m.indexHash) && Array.isArray(m.identityMetadata) && m.identityMetadata.length >= 1 && m.identityMetadata.length <= 4 && Array.isArray(m.sources) && m.sources.length >= 1 && m.sources.length <= 3 && Array.isArray(m.pages) && m.pages.length > 0 && m.pages.length <= 128);
  int(m.itemCount, 1, 1e4);
  let count = 0, last = 0, totalBytes = 0;
  for (const [page, d] of m.pages.entries()) {
    shape2(d, ["page", "firstItemId", "lastItemId", "itemCount", "sha256", "bytes", "url"]);
    check2(d.page === page && HASH3.test(d.sha256) && d.url === "/api-item-identities/" + d.sha256 + ".json");
    int(d.firstItemId, last + 1, 999999999);
    int(d.lastItemId, d.firstItemId, 999999999);
    int(d.itemCount, 1, 128);
    int(d.bytes, 1, 131072);
    count += d.itemCount;
    last = d.lastItemId;
    totalBytes += d.bytes;
  }
  check2(count === m.itemCount && totalBytes <= 8388608);
  const ops = /* @__PURE__ */ new Set();
  for (const s of m.sources) {
    shape2(s, ["operation", "sourceUrl", "retrievedAt", "sourceObservedAt", "sourceGeneratedAt", "sourceGeneratedAtKind", "itemCount"]);
    check2(["prices", "catalogue", "overview"].includes(s.operation) && !ops.has(s.operation) && s.sourceUrl === { prices: "https://maplestory.market/api/prices", catalogue: "https://maplestory.market/api/items", overview: "https://maplestory.market/api/market/overview" }[s.operation] && clock(s.retrievedAt) && s.sourceObservedAt === null);
    ops.add(s.operation);
    int(s.itemCount, 0, m.itemCount);
    check2(s.sourceGeneratedAt === null ? s.sourceGeneratedAtKind === null : clock(s.sourceGeneratedAt) && s.sourceGeneratedAtKind === "publisher_generation_not_individual_sale_time" && Date.parse(s.sourceGeneratedAt) <= Date.parse(s.retrievedAt));
  }
  check2(ops.has("prices"));
  for (const d of m.identityMetadata) {
    shape2(d, ["expectedSha256", "sourceUrl", "format"]);
    check2(HASH3.test(d.expectedSha256) && ["cash_client_catalog", "noncash_list"].includes(d.format) && d.sourceUrl === `https://maplestory.io/api/MCW/1/item/list?cashFilter=${d.format === "cash_client_catalog" ? "true" : "false"}&count=10000`);
  }
  const { indexHash, ...unsigned } = m;
  check2(await hash(JSON.stringify(unsigned)) === indexHash && (!p || p.indexHash === indexHash), "manifest_semantic_hash");
  return m;
}
function validatePage(page, descriptor, manifest) {
  shape2(page, ["schemaVersion", "kind", "rows"]);
  check2(page.schemaVersion === 1 && page.kind === "api_item_identity_page" && Array.isArray(page.rows) && page.rows.length === descriptor.itemCount);
  let last = descriptor.firstItemId - 1;
  for (const r of page.rows) {
    shape2(r, ["itemId", "name", "nameStatus", "sprite", "spriteStatus", "providerBindings", "memberships", "priceMembership"]);
    int(r.itemId, last + 1, descriptor.lastItemId);
    last = r.itemId;
    check2(["unique_client_id", "unknown_client_id", "conflicting_client_id"].includes(r.nameStatus) && (r.nameStatus === "unique_client_id" ? typeof r.name === "string" && r.name.trim() && r.name.length <= 300 : r.name === null));
    check2(r.sprite === null ? r.spriteStatus === "unavailable" : r.spriteStatus === "reviewed_local" && typeof r.sprite === "string" && /^assets\/[A-Za-z0-9._-]+\.(?:png|webp|gif|svg)$/.test(r.sprite));
    check2(Array.isArray(r.providerBindings) && r.providerBindings.length <= 4 && Array.isArray(r.memberships) && r.memberships.length > 0 && r.memberships.length <= 3 && ["in_committed_price_snapshot", "retained_price_identity_only", "no_accepted_price_membership"].includes(r.priceMembership));
    for (const b of r.providerBindings) {
      shape2(b, ["slug", "name", "planHash"]);
      check2(typeof b.slug === "string" && /^[a-z0-9][a-z0-9-]*$/.test(b.slug) && typeof b.name === "string" && b.name.length <= 300 && HASH3.test(b.planHash));
    }
    const ops = /* @__PURE__ */ new Set();
    for (const m of r.memberships) {
      shape2(m, ["operation", "presentInSnapshot", "lastSeenRetrievedAt", "latestSnapshotRetrievedAt", "sourceObservedAt"]);
      const s = manifest.sources.find((s2) => s2.operation === m.operation);
      check2(s && !ops.has(m.operation) && typeof m.presentInSnapshot === "boolean" && clock(m.lastSeenRetrievedAt) && m.latestSnapshotRetrievedAt === s.retrievedAt && Date.parse(m.lastSeenRetrievedAt) <= Date.parse(s.retrievedAt) && m.sourceObservedAt === null && (!m.presentInSnapshot || m.lastSeenRetrievedAt === m.latestSnapshotRetrievedAt));
      ops.add(m.operation);
    }
    const priced = r.memberships.find((m) => m.operation === "prices");
    check2(r.priceMembership === (priced?.presentInSnapshot ? "in_committed_price_snapshot" : priced ? "retained_price_identity_only" : "no_accepted_price_membership"));
  }
  check2(page.rows[0].itemId === descriptor.firstItemId && page.rows.at(-1).itemId === descriptor.lastItemId);
  return page;
}

// ui-src/item-api/discovery-client.mjs
var bytes2 = new TextEncoder();
var abort2 = () => Object.assign(Error("aborted"), { name: "AbortError" });
function createIdentityDiscoveryClient({ enabled: enabled2 = false, isEnabled = () => true, fetcher, now = Date.now, ttlMs = 3e4, timeoutMs = 1e4 } = {}) {
  if (!Number.isSafeInteger(ttlMs) || ttlMs < 0 || ttlMs > 6e4 || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 12e3) throw TypeError("Bounded client settings required");
  let good = null, flight = null, expires = 0, retryAt = 0, failures = 0;
  const pages = /* @__PURE__ */ new Map();
  let cacheBytes = 0;
  const active = () => {
    try {
      return enabled2 === true && isEnabled() === true;
    } catch {
      return false;
    }
  };
  const wait = (p, signal) => new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abort2());
    const clear = () => signal?.removeEventListener("abort", cancel), cancel = () => {
      clear();
      reject(abort2());
    };
    signal?.addEventListener("abort", cancel, { once: true });
    p.then((v) => {
      clear();
      signal?.aborted ? reject(abort2()) : resolve(v);
    }, (e) => {
      clear();
      reject(e);
    });
  });
  async function get(url, limit, previous = null) {
    const controller = new AbortController();
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(Error("read_deadline"));
      }, timeoutMs);
    });
    const deadline = (p) => Promise.race([p, timeout]);
    try {
      const response = await deadline(fetcher(url, { method: "GET", credentials: "same-origin", cache: "no-cache", redirect: "error", signal: controller.signal, headers: previous ? { "If-None-Match": previous.etag } : {} }));
      if (response.status === 409) throw Object.assign(Error("generation_changed"), { generationChanged: true });
      const mode = response.headers.get("X-Astra-API-Identity-Mode"), generation = response.headers.get("X-Astra-API-Identity-Generation"), etag = response.headers.get("ETag");
      if (!["validated_cache", "retained"].includes(mode) || !/^"api-identities-[a-f0-9]{64}"$/.test(etag ?? "")) throw Error("response_context");
      if (response.status === 304) {
        if (!previous || etag !== previous.etag || generation !== previous.generation) throw Error("invalid304");
        return { ...previous, mode };
      }
      if (response.status !== 200 || !/^application\/json(?:;|$)/i.test(response.headers.get("Content-Type") ?? "")) throw Error("unavailable");
      const chunks = [], reader = response.body.getReader();
      let size = 0;
      try {
        for (; ; ) {
          const { done, value } = await deadline(reader.read());
          if (done) break;
          size += value.byteLength;
          if (size > limit) {
            await reader.cancel();
            throw Error("body_bound");
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
      const raw = new Uint8Array(size);
      let offset = 0;
      for (const c of chunks) {
        raw.set(c, offset);
        offset += c.length;
      }
      const sha2 = await hash(raw);
      if (etag !== '"api-identities-' + sha2 + '"') throw Error("body_hash");
      return { text: new TextDecoder("utf-8", { fatal: true }).decode(raw), document: parseStrictJson(raw), etag, generation, mode, sha: sha2, bytes: size };
    } finally {
      clearTimeout(timer);
    }
  }
  const remember = (key, value) => {
    if (pages.has(key)) cacheBytes -= pages.get(key).bytes;
    pages.delete(key);
    pages.set(key, value);
    cacheBytes += value.bytes;
    while (pages.size > 8 || cacheBytes > 1048576) {
      const first = pages.keys().next().value;
      cacheBytes -= pages.get(first).bytes;
      pages.delete(first);
    }
  };
  async function collect() {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const manifestRecord = await get("/api-item-identities.json", 65536, good?.manifestRecord), manifest = await validateManifest(manifestRecord.document);
        if (manifestRecord.generation !== manifest.indexHash) throw Error("manifest_context");
        if (good) for (const old of good.manifest.sources) {
          const next = manifest.sources.find((s) => s.operation === old.operation);
          if (!next || Date.parse(next.retrievedAt) < Date.parse(old.retrievedAt)) throw Error("source_clock_regression");
        }
        const output = new Array(manifest.pages.length);
        let cursor = 0, retained = manifestRecord.mode === "retained";
        let cancelled = false;
        const workers = Array.from({ length: Math.min(4, manifest.pages.length) }, async () => {
          try {
            for (; ; ) {
              if (cancelled) return;
              if (!active()) throw Error("disabled");
              const i = cursor++;
              if (i >= manifest.pages.length) return;
              const d = manifest.pages[i];
              let record = pages.get(d.sha256);
              if (!record) {
                record = await get(d.url + "?generation=" + manifest.indexHash, 131072);
                if (record.generation !== manifest.indexHash || record.sha !== d.sha256 || record.bytes !== d.bytes) throw Error("page_context");
              }
              validatePage(record.document, d, manifest);
              if (record.mode === "retained") retained = true;
              remember(d.sha256, record);
              output[i] = record.document.rows;
            }
          } catch (error) {
            cancelled = true;
            throw error;
          }
        });
        const settled = await Promise.allSettled(workers), failed = settled.find((r) => r.status === "rejected");
        if (failed) throw failed.reason;
        const rows2 = output.flat();
        if (rows2.length !== manifest.itemCount) throw Error("row_count");
        for (const source of manifest.sources) if (rows2.filter((r) => r.memberships.some((m) => m.operation === source.operation && m.presentInSnapshot)).length !== source.itemCount) throw Error("membership_count");
        if (!active()) throw Error("disabled");
        const value = { manifest, rows: rows2, mode: retained ? "retained" : "validated_cache", manifestRecord };
        good = value;
        failures = 0;
        retryAt = 0;
        expires = now() + ttlMs;
        return value;
      } catch (error) {
        if (error.generationChanged && attempt === 0) continue;
        throw error;
      }
    }
    throw Error("generation_retry_bound");
  }
  return Object.freeze({ async load({ signal } = {}) {
    if (!active() || typeof fetcher !== "function") throw Error("not_connected");
    if (good && (now() < expires || now() < retryAt)) return structuredClone({ manifest: good.manifest, rows: good.rows, mode: now() < retryAt ? "retained" : good.mode });
    if (now() < retryAt) throw Error("read_backoff");
    if (!flight) {
      flight = collect().catch((error) => {
        retryAt = now() + Math.min(3e5, 3e4 * 2 ** Math.min(failures++, 4));
        if (good && active()) return { ...good, mode: "retained" };
        throw error;
      }).finally(() => flight = null);
    }
    const value = await wait(flight, signal);
    return structuredClone({ manifest: value.manifest, rows: value.rows, mode: value.mode });
  }, state() {
    return good ? { mode: now() < retryAt ? "retained" : good.mode, indexHash: good.manifest.indexHash, sources: structuredClone(good.manifest.sources) } : null;
  } });
}

// ui-src/item-api/discovery-bridge.mjs
function searchIdentityView(value) {
  const { manifest, rows: rows2, mode } = value;
  return {
    itemCount: manifest.itemCount,
    pricedItemCount: manifest.sources.find((s) => s.operation === "prices").itemCount,
    indexHash: manifest.indexHash,
    priceProjectionGeneration: manifest.priceProjectionGeneration,
    mode,
    sourceSnapshots: manifest.sources.map((s) => ({ ...s, capturedAt: s.retrievedAt })),
    rows: rows2.map((r) => ({
      ...r,
      name: r.name ?? `Item ${r.itemId} (name unavailable)`,
      memberships: r.memberships.map((m) => ({ ...m, capturedAt: m.lastSeenRetrievedAt })),
      hasRetainedPriceSnapshot: r.memberships.some((m) => m.operation === "prices"),
      hasCurrentAcceptedPriceSnapshot: r.priceMembership === "in_committed_price_snapshot",
      retainedPriceCapturedAt: r.memberships.find((m) => m.operation === "prices")?.lastSeenRetrievedAt ?? null
    }))
  };
}
function createSearchIdentityBridge(options = {}) {
  const client2 = createIdentityDiscoveryClient(options);
  return Object.freeze({
    async load({ signal } = {}) {
      return searchIdentityView(await client2.load({ signal }));
    },
    state: () => client2.state()
  });
}

// ui-src/item-api/lifecycle.mjs
function createItemPanelLifecycle({ container, mountPanel, loader, getTimezone = () => "UTC", spriteMap = {}, onStatus = () => {
} } = {}) {
  if (!container?.ownerDocument || typeof mountPanel !== "function") throw TypeError("Explicit item panel dependencies required");
  let epoch = 0, controller = null, handle = null, currentId = null, timezone = null, lastCapture = null;
  const clear = () => {
    handle?.destroy();
    handle = null;
  };
  return Object.freeze({
    async show(itemId) {
      if (!Number.isSafeInteger(itemId) || itemId < 1 || itemId > 999999999) throw TypeError("Exact numeric item ID required");
      const token = ++epoch;
      controller?.abort();
      controller = new AbortController();
      const ownController = controller;
      if (currentId !== itemId) {
        clear();
        lastCapture = null;
      }
      currentId = itemId;
      if (typeof loader !== "function") {
        onStatus("not_connected");
        return { status: "not_connected" };
      }
      onStatus("loading");
      try {
        const reply = await loader({ itemId, signal: ownController.signal });
        if (token !== epoch || ownController.signal.aborted) return { status: "stale" };
        const value = await validatePublicItemReference(reply);
        if (token !== epoch || ownController.signal.aborted) return { status: "stale" };
        if (value.itemId !== itemId || lastCapture !== null && Date.parse(value.sourceCapturedAt) < Date.parse(lastCapture)) throw TypeError("Wrong or older item reference");
        const options = { timezone: timezone ?? getTimezone(), spriteMap };
        if (handle) {
          handle.updateDto(value.item);
          handle.updateTimezone(options.timezone);
        } else handle = mountPanel(container, value.item, options);
        lastCapture = value.sourceCapturedAt;
        onStatus("shown");
        return { status: "shown", itemId, sourceCapturedAt: value.sourceCapturedAt, generation: value.projectionGeneration };
      } catch {
        if (token !== epoch || ownController.signal.aborted) return { status: "stale" };
        onStatus(handle ? "retained" : "unavailable");
        return { status: handle ? "retained" : "unavailable" };
      }
    },
    timezoneChanged(value) {
      timezone = value;
      handle?.updateTimezone(value);
    },
    hide() {
      epoch++;
      controller?.abort();
      controller = null;
      currentId = null;
      lastCapture = null;
      clear();
      onStatus("hidden");
    }
  });
}

// ui-src/item-api/panel.mjs
var instance = 0;
var pools = { reported_stats: "Reported stats", scroll_state: "Scroll state", attack_pool: "ATT pools" };
var labels = { "0": "STR", "1": "DEX", "2": "INT", "3": "LUK", "4": "Max HP", "5": "Max MP", "6": "Speed", "7": "Jump", "9": "Magic ATT", "10": "Weapon DEF", "11": "Magic DEF", "12": "Accuracy", "13": "Avoidability", "14": "Crit rate", "15": "Crit damage", "16": "Weapon ATT" };
var own2 = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
function exactMoney(value) {
  if (value === null) return "Unknown";
  const [whole, decimal] = value.split(".");
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (decimal === void 0 ? "" : "." + decimal);
}
function retrievalClock(iso2, zone2 = "UTC") {
  if (!Number.isFinite(Date.parse(iso2))) return "Unknown";
  try {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: zone2, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso2)).map((p) => [p.type, p.value]));
    return `${parts.month}-${parts.day}-${parts.year} ${parts.hour}:${parts.minute}:${parts.second} ${zone2}`;
  } catch {
    return retrievalClock(iso2, "UTC");
  }
}
var spritePath = (value) => typeof value === "string" && /^\/?assets\/[A-Za-z0-9._/-]+\.png$/.test(value) && !value.split("/").includes("..") ? value : null;
var signature = (row) => Object.entries(labels).filter(([code]) => own2(row.reportedStats, code)).map(([code, label]) => `${label} ${row.reportedStats[code]}`).join(" \xB7 ") || "No stats reported";
function itemPanelModel(dto, query = { kind: "reported_stats" }, search = "") {
  assertSafeItemDto(dto);
  const result = filterEvidenceGroups(dto, query), needle = String(search).trim().toLowerCase();
  const rows2 = result.rows.filter((row) => !needle || [query.kind === "reported_stats" ? signature(row) : query.kind === "attack_pool" ? `Weapon ATT ${row.reportedAttack}` : `${row.successfulUpgrades} successful upgrades ${row.slotsLeft} slots`, row.reference?.basis ?? "unknown", row.reference?.unitPrice ?? ""].join(" ").toLowerCase().includes(needle));
  return { result, rows: rows2, options: filterOptions(dto) };
}
function mountItemPricingPanel(container, input, { timezone = "UTC", spriteMap = {} } = {}) {
  if (!container?.ownerDocument) throw new TypeError("A DOM container is required");
  assertSafeItemDto(input);
  let dto = structuredClone(input), zone2 = timezone, destroyed = false, page = 0;
  const doc2 = container.ownerDocument, id2 = `item-api-panel-${++instance}`, el = (tag, text, cls) => {
    const n = doc2.createElement(tag);
    if (text !== void 0) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  };
  const section = el("section", void 0, "api-item-panel");
  section.setAttribute("aria-labelledby", id2 + "-title");
  const title = el("h2", "Item prices & reported rolls");
  title.id = id2 + "-title";
  section.append(title);
  const identity2 = el("div", void 0, "api-item-identity"), name = el("h3"), image = el("img");
  image.width = 48;
  image.height = 48;
  identity2.append(name);
  section.append(identity2);
  const clock2 = el("p", void 0, "api-item-clock");
  clock2.dataset.rawDate = "true";
  section.append(clock2);
  section.append(el("p", "Reported 3-day lookback; exact start/end and individual sale times are unknown. Retrieval time does not establish when a trade occurred. Asking prices are separate evidence, not verified available offers.", "api-item-context"));
  const summary = el("div", void 0, "api-item-summary");
  section.append(summary);
  const credit = el("a", "Item prices from MapleStory Market \u2197");
  credit.target = "_blank";
  credit.rel = "noopener noreferrer";
  section.append(credit);
  const heading = el("h3", "Explore the reported price groups");
  section.append(heading);
  const tabs = el("div", void 0, "api-item-pools");
  tabs.setAttribute("role", "group");
  tabs.setAttribute("aria-label", "Price group");
  let pool = "reported_stats";
  for (const [key, label] of Object.entries(pools)) {
    const b = el("button", label);
    b.type = "button";
    b.dataset.pool = key;
    b.addEventListener("click", () => {
      pool = key;
      page = 0;
      sortColumn = "reference";
      sort = "ascending";
      renderRows();
    });
    tabs.append(b);
  }
  section.append(tabs);
  const explanation = el("p", void 0, "api-item-context");
  section.append(explanation);
  const controls = el("form", void 0, "api-item-filters");
  controls.addEventListener("submit", (event) => event.preventDefault());
  section.append(controls);
  const select = (key, label, choices) => {
    const wrapper = el("label", label), n = el("select");
    n.dataset.filter = key;
    for (const [value, text] of choices) {
      const option = el("option", text);
      option.value = value;
      n.append(option);
    }
    wrapper.append(n);
    controls.append(wrapper);
    return n;
  };
  const searchLabel = el("label", "Search these groups"), search = el("input");
  search.type = "search";
  search.maxLength = 200;
  search.dataset.filter = "search";
  searchLabel.append(search);
  controls.append(searchLabel);
  const slots = select("slots", "Slots remaining", [["", "Any"]]), upgrades = select("upgrades", "Successful upgrades", [["", "Any"]]), basis = select("basis", "Reference basis", [["", "Any"], ["sold", "Source sold"], ["listed", "Asking"]]);
  const samplesLabel = el("label", "Minimum reference samples"), samples = el("input");
  samples.type = "number";
  samples.min = "0";
  samples.step = "1";
  samples.value = "0";
  samples.dataset.filter = "samples";
  samplesLabel.append(samples);
  controls.append(samplesLabel);
  const attackBox = el("div", void 0, "api-item-stat-pair"), attackInputs = {};
  for (const [key, label] of [["minimumAttack", "ATT at least"], ["maximumAttack", "ATT at most"]]) {
    const l = el("label", label), n = el("input");
    n.type = "number";
    n.step = "1";
    n.min = "0";
    n.dataset.filter = key;
    attackInputs[key] = n;
    l.append(n);
    attackBox.append(l);
  }
  controls.append(attackBox);
  const statBox = el("fieldset"), legend = el("legend", "Reported stats \u2014 all entered limits must match");
  statBox.append(legend);
  controls.append(statBox);
  let statInputs = [];
  const nearLabel = el("label", void 0, "api-item-near"), near = el("input");
  near.type = "checkbox";
  near.dataset.filter = "near";
  nearLabel.append(near, doc2.createTextNode(" Include nearby fallback references (other qualities may differ)"));
  controls.append(nearLabel);
  const reset = el("button", "Reset filters");
  reset.type = "button";
  reset.dataset.reset = "true";
  reset.addEventListener("click", () => {
    controls.reset();
    samples.value = "0";
    page = 0;
    sort = "ascending";
    sortColumn = "reference";
    renderRows();
  });
  controls.append(reset);
  const feedback = el("p", void 0, "api-item-feedback");
  feedback.setAttribute("role", "status");
  feedback.setAttribute("aria-live", "polite");
  section.append(feedback);
  const tableWrap = el("div", void 0, "api-item-table-wrap");
  tableWrap.tabIndex = 0;
  tableWrap.setAttribute("role", "region");
  tableWrap.setAttribute("aria-label", "Reported price groups, horizontally scrollable");
  section.append(tableWrap);
  const pager = el("div", void 0, "api-item-pager"), previous = el("button", "Previous 25"), next = el("button", "Next 25"), pageText = el("span");
  for (const b of [previous, next]) b.type = "button";
  previous.addEventListener("click", () => {
    page--;
    renderRows();
  });
  next.addEventListener("click", () => {
    page++;
    renderRows();
  });
  pager.append(previous, pageText, next);
  section.append(pager);
  section.append(el("p", "Unknown stats are not zero or proof of a clean item. Reported signatures may omit stats; DEF can be ignored by the source comparison. Scroll-state and ATT pools can mix other rolls. Group reference aggregation is unspecified. No per-roll price history, individual transactions, verified availability or fee adjustment is inferred.", "api-item-context"));
  let sort = "ascending", sortColumn = "reference";
  const fieldInt = (n, min = 0, max = Number.MAX_SAFE_INTEGER) => {
    if (n.value.trim() === "") return null;
    const value = Number(n.value);
    if (!Number.isSafeInteger(value) || value < min || value > max) throw Error("Use whole numbers within the stated limits.");
    return value;
  };
  function query() {
    const q = { kind: pool, sortReference: sort, includeNearFallback: pool !== "reported_stats" && near.checked }, minimumSamples = fieldInt(samples);
    if (minimumSamples !== null && minimumSamples > 0) q.minimumReferenceSamples = minimumSamples;
    if (basis.value) q.basis = basis.value;
    if (pool === "attack_pool") {
      for (const [key, n] of Object.entries(attackInputs)) {
        const v = fieldInt(n);
        if (v !== null) q[key] = v;
      }
    } else {
      const s = fieldInt(slots, 0, 100), u = fieldInt(upgrades, 0, 100);
      if (s !== null) q.slotsLeft = s;
      if (u !== null) q.successfulUpgrades = u;
      if (pool === "reported_stats") q.stats = statInputs.flatMap(({ code, min, max }) => {
        const a = fieldInt(min, -1e6, 1e6), b = fieldInt(max, -1e6, 1e6);
        return a === null && b === null ? [] : [{ code, ...a === null ? {} : { minimum: a }, ...b === null ? {} : { maximum: b } }];
      });
    }
    return q;
  }
  function fillSummary() {
    name.textContent = dto.identity.name ?? `Item ${dto.itemId} \u2014 name unverified`;
    const path = spritePath(spriteMap[String(dto.itemId)]);
    image.remove();
    if (path && dto.identity.status === "unique_client_id") {
      image.src = path;
      image.alt = dto.identity.name + " game icon";
      identity2.prepend(image);
    }
    clock2.textContent = "Retrieved: " + retrievalClock(dto.source.retrievedAt, zone2) + " \xB7 underlying observation time unknown";
    credit.href = `https://maplestory.market/items/${dto.itemId}?ref=v6kkdvp6`;
    summary.replaceChildren();
    const card = (heading2, lines) => {
      const box = el("div", void 0, "api-item-summary-card");
      box.append(el("h3", heading2));
      for (const line of lines) box.append(el("p", line));
      summary.append(box);
    };
    const s = dto.aggregate.sold, a = dto.aggregate.asking, r = dto.aggregate.reference;
    card("Source-labelled sales", [`Median: ${exactMoney(s?.medianUnitPrice ?? null)} mesos`, `Average (AVG): ${exactMoney(s?.averageUnitPrice ?? null)} mesos`, s ? `${s.reportedSalesCount} reported sales \xB7 ${s.reportedUnitCount} reported units` : "Sales counts unknown", s ? `Source day counters: ${s.reportedDaySalesCount} sales \xB7 ${s.reportedDayUnitCount} units (bounds unknown)` : ""]);
    card("Asking prices", [`Median ask: ${exactMoney(a?.medianUnitPrice ?? null)} mesos`, `P25: ${exactMoney(a?.p25UnitPrice ?? null)} \xB7 P75: ${exactMoney(a?.p75UnitPrice ?? null)} mesos`, a ? `${a.reportedListingCount} reported listings \xB7 ${a.reportedSellerCount} reported sellers` : "Listing and seller counts unknown"]);
    card("Publisher reference", [r ? `${r.aggregation === "average" ? "Average of source-labelled sales" : "Median asking price"}: ${exactMoney(r.unitPrice)} mesos` : "Reference unavailable", r ? `${r.reportedSamples} reported reference samples` : "", "The reference is kept separate from the sale median."]);
  }
  let selectedPool = "";
  function fillPoolOptions() {
    const rows2 = pool === "scroll_state" ? dto.variants.successfulScrolls : dto.variants.reportedStats;
    for (const [select2, key] of [[slots, "slotsLeft"], [upgrades, "successfulUpgrades"]]) {
      select2.replaceChildren();
      for (const value of ["", ...[...new Set(rows2.map((row) => row[key]))].sort((a, b) => a - b)]) {
        const option = el("option", value === "" ? "Any" : String(value));
        option.value = String(value);
        select2.append(option);
      }
    }
    selectedPool = pool;
  }
  function buildFilters() {
    const options = filterOptions(dto);
    statInputs = [];
    fillPoolOptions();
    statBox.replaceChildren(legend);
    for (const { code, label } of options.stats) {
      const pair = el("div", void 0, "api-item-stat-pair"), entry = { code };
      for (const [key, suffix] of [["min", "at least"], ["max", "at most"]]) {
        const l = el("label", label + " " + suffix), n = el("input");
        n.type = "number";
        n.step = "1";
        n.min = "-1000000";
        n.max = "1000000";
        n.dataset.stat = code;
        n.dataset.bound = key;
        l.append(n);
        pair.append(l);
        entry[key] = n;
      }
      statInputs.push(entry);
      statBox.append(pair);
    }
  }
  function renderRows() {
    if (destroyed) return;
    if (selectedPool !== pool) fillPoolOptions();
    for (const b of tabs.children) b.setAttribute("aria-pressed", String(b.dataset.pool === pool));
    statBox.hidden = pool !== "reported_stats";
    attackBox.hidden = pool !== "attack_pool";
    slots.parentElement.hidden = upgrades.parentElement.hidden = pool === "attack_pool";
    nearLabel.hidden = pool === "reported_stats";
    explanation.textContent = pool === "reported_stats" ? "Filter the reported signature, slots and successful upgrades together. Unreported fields never match a numeric limit." : pool === "scroll_state" ? "This pool matches successful upgrades and remaining slots; other stats are not held constant." : "This pool matches only Weapon ATT; other stats, slots and upgrades are not held constant.";
    let model;
    try {
      model = itemPanelModel(dto, query(), search.value);
    } catch {
      feedback.textContent = "Check filter limits: use whole numbers, and a minimum no greater than its maximum.";
      tableWrap.replaceChildren();
      previous.disabled = next.disabled = true;
      pageText.textContent = "";
      return;
    }
    if (sortColumn !== "reference") {
      const value = (row) => sortColumn === "samples" ? row.reference?.reportedSamples ?? null : row[sortColumn] ?? null;
      model.rows.sort((a, b) => {
        const x = value(a), y = value(b);
        if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
        return (sort === "descending" ? -1 : 1) * (x - y) || a.groupKey.localeCompare(b.groupKey, "en");
      });
    }
    const total = model.rows.length, pages = Math.max(1, Math.ceil(total / 25));
    page = Math.max(0, Math.min(page, pages - 1));
    feedback.textContent = `${total} matching groups. ${near.checked && pool !== "reported_stats" ? "Nearby fallbacks included." : "Nearby fallbacks off."} Prices are mesos per item.`;
    const table = el("table"), caption = el("caption", pools[pool] + " \xB7 reported 3-day lookback"), thead = el("thead"), head = el("tr"), tbody = el("tbody");
    table.append(caption, thead, tbody);
    thead.append(head);
    const headings = pool === "attack_pool" ? ["Weapon ATT", "Sale median / average", "Sales / units", "Asking median / listings", "Reference price", "Basis / samples", "Nearby fallback"] : ["Reported signature / pool", "Slots left", "Successful upgrades", "Reference price", "Basis / samples", "Nearby fallback"];
    const sortable = { "Reference price": "reference", "Slots left": "slotsLeft", "Successful upgrades": "successfulUpgrades", "Weapon ATT": "reportedAttack", "Basis / samples": "samples" };
    for (const label of headings) {
      const th = el("th");
      th.scope = "col";
      if (sortable[label]) {
        const key = sortable[label], active = key === sortColumn;
        th.setAttribute("aria-sort", active ? sort : "none");
        const b = el("button", label + (active ? sort === "ascending" ? " \u2191" : " \u2193" : ""));
        b.type = "button";
        b.dataset.sort = key;
        b.addEventListener("click", () => {
          sort = key === sortColumn ? sort === "ascending" ? "descending" : "ascending" : "ascending";
          sortColumn = key;
          page = 0;
          renderRows();
        });
        th.append(b);
      } else th.textContent = label;
      head.append(th);
    }
    for (const row of model.rows.slice(page * 25, page * 25 + 25)) {
      const tr = el("tr");
      tr.dataset.groupKey = row.groupKey;
      const r = row.reference, deal = row.dealReference, nearText = deal ? deal.isNearFallback && !near.checked ? "Off" : `${exactMoney(deal.unitPrice)} mesos \xB7 ${deal.basis === "sold" ? "source sold" : "asking"} \xB7 ${deal.reportedSamples} samples${deal.isNearFallback ? " \xB7 nearby, qualities may differ" : ""}` : "Unavailable";
      const common = [r ? exactMoney(r.unitPrice) : "Unknown", r ? `${r.basis === "sold" ? "Source sold" : "Asking"} \xB7 ${r.reportedSamples} samples${r.isNearFallback ? " \xB7 nearby" : ""}` : "Unknown", nearText];
      const values = pool === "attack_pool" ? [row.reportedAttack, `${exactMoney(row.sold?.medianUnitPrice ?? null)} / ${exactMoney(row.sold?.averageUnitPrice ?? null)}`, row.sold ? `${row.sold.reportedSalesCount} / ${row.sold.reportedUnitCount}` : "Unknown", row.asking ? `${exactMoney(row.asking.medianUnitPrice)} / ${row.asking.reportedListingCount}` : "Unknown", ...common] : [pool === "reported_stats" ? signature(row) : "Scroll-state pool", row.slotsLeft, row.successfulUpgrades, ...common];
      for (const value of values) tr.append(el("td", String(value)));
      tbody.append(tr);
    }
    if (!total) {
      const tr = el("tr"), td = el("td", "No matching reported groups. Broader pools are available separately; they do not fill this result.");
      td.colSpan = headings.length;
      tr.append(td);
      tbody.append(tr);
    }
    tableWrap.replaceChildren(table);
    pageText.textContent = `Page ${page + 1} of ${pages}`;
    previous.disabled = page === 0;
    next.disabled = page + 1 === pages;
  }
  controls.addEventListener("input", () => {
    page = 0;
    renderRows();
  });
  controls.addEventListener("change", () => {
    page = 0;
    renderRows();
  });
  container.append(section);
  fillSummary();
  buildFilters();
  renderRows();
  return Object.freeze({ element: section, updateTimezone(value) {
    zone2 = value;
    fillSummary();
  }, updateDto(value) {
    assertSafeItemDto(value);
    dto = structuredClone(value);
    page = 0;
    controls.reset();
    fillSummary();
    buildFilters();
    renderRows();
  }, destroy() {
    destroyed = true;
    section.remove();
  } });
}

// ui-src/item-api/entry.mjs
var doc = document;
var available = doc.body.dataset.itemApiPreview === "available";
var scope = doc.getElementById("display-options");
var enabled = false;
var identity = null;
var identityFlight = null;
var host = null;
var life = null;
var lastId = null;
var latest = null;
var identityEpoch = 0;
var zone = () => doc.getElementById("display-timezone")?.value || "UTC";
var make = (tag, text) => {
  const n = doc.createElement(tag);
  if (text !== void 0) n.textContent = text;
  return n;
};
var validId = (id2) => Number.isSafeInteger(id2) && id2 > 0 && id2 <= 999999999;
var client = createItemReferenceClient({ fetcher: (...args) => fetch(...args), enabled: available, isEnabled: () => enabled });
var discovery = createSearchIdentityBridge({ fetcher: (...args) => fetch(...args), enabled: available, isEnabled: () => enabled });
var rows = () => identity?.rows ?? [];
var byId = (id2) => rows().find((r) => r.itemId === id2) || null;
function resolveId(record, slug) {
  const direct = /^id-([1-9][0-9]{0,8})$/.exec(slug ?? "");
  if (direct) return Number(direct[1]);
  if (validId(record?.canonicalId)) return record.canonicalId;
  const matched = rows().filter((r) => r.providerBindings.some((b) => b.slug === record?.slug && b.name === record?.name));
  return matched.length === 1 ? matched[0].itemId : null;
}
function hide() {
  life?.hide();
  host?.remove();
  life = null;
  host = null;
  lastId = null;
}
function identityShell(record, container) {
  const row = byId(record.canonicalId);
  container.replaceChildren();
  const title = make("h2", record.name), p = make("p", "Retained API identity. No daily history, fixed NX cost or current price is inferred from this entry.");
  container.append(title, p);
  if (row?.sprite) {
    const image = make("img");
    image.src = row.sprite;
    image.alt = record.name + " original game icon";
    image.width = 48;
    image.height = 48;
    title.prepend(image);
  }
  container.append(make("p", "Identity presence was retained from " + row.memberships.map((m) => m.operation + (m.presentInSnapshot ? " accepted snapshot \xB7 " : " retained membership \xB7 ") + retrievalClock(m.capturedAt, zone())).join(" \xB7 ") + ". Underlying source observation times are unknown."));
}
async function loadIdentities() {
  if (!available || !enabled) return null;
  const epoch = identityEpoch;
  if (identityFlight?.epoch === epoch) return identityFlight.promise;
  const task = { epoch };
  task.promise = (async () => {
    const value = await discovery.load();
    if (!enabled || epoch !== identityEpoch) return null;
    const changed = !identity || identity.indexHash !== value.indexHash || identity.mode !== value.mode;
    identity = value;
    if (changed) doc.dispatchEvent(new CustomEvent("astrapiitemidentities"));
    return value;
  })().finally(() => {
    if (identityFlight === task) identityFlight = null;
  });
  identityFlight = task;
  return task.promise;
}
function showItem(args) {
  latest = args;
  if (!available || !enabled) return;
  const id2 = resolveId(args.record, args.slug);
  if (!validId(id2)) {
    hide();
    return;
  }
  if (host && lastId === id2) {
    args.container.append(host);
    life.timezoneChanged(zone());
    return;
  }
  hide();
  lastId = id2;
  host = make("section");
  host.className = "api-item-preview-host";
  const status = make("p", "Loading separate item reference\u2026");
  status.className = "api-item-preview-status";
  status.setAttribute("role", "status");
  const body = make("div");
  host.append(status, body);
  args.container.append(host);
  life = createItemPanelLifecycle({ container: body, mountPanel: mountItemPricingPanel, loader: async (query) => {
    const value = await client.loadItem(query);
    status.dataset.mode = value.mode;
    return value.data;
  }, getTimezone: zone, spriteMap: { ...args.spriteMap, ...Object.fromEntries(rows().filter((r) => r.sprite).map((r) => [r.itemId, r.sprite])) }, onStatus: (value) => {
    const state = client.state(id2);
    status.textContent = (doc.body.dataset.itemApiSynthetic === "true" ? "SYNTHETIC OWN-SITE FIXTURE \xB7 " : "") + (value === "shown" ? state?.mode === "retained" ? "Retained item reference; original retrieval preserved." : "Separate item reference; retrieval is not trade time." : value === "retained" ? "Retained item reference; the new check failed." : value === "loading" ? "Reading this site\u2019s cached item reference\u2026" : value === "unavailable" ? "No validated item reference is connected. Daily and other-source evidence remain separate." : "");
  } });
  void life.show(id2);
}
function mergeSearchRecords(input) {
  const out = input.filter((r) => !r.apiIdentityOnly).map((r) => {
    const base = r.apiOriginal || { id: r.id, sprite: r.sprite, aliasNames: r.aliasNames };
    const copy = { ...r, ...base };
    delete copy.apiIdentity;
    delete copy.apiOriginal;
    return copy;
  });
  if (!enabled || !identity) return out;
  const originalFields = new Map(out.map((r) => [r, { id: r.id, sprite: r.sprite, aliasNames: r.aliasNames }]));
  const existing = /* @__PURE__ */ new Map();
  for (const r of out) {
    if (!validId(r.id)) {
      const id2 = resolveId({ slug: r.sourceSlug || r.slug, name: r.name });
      if (id2) r.id = id2;
    }
    if (validId(r.id)) {
      if (!existing.has(r.id)) existing.set(r.id, []);
      existing.get(r.id).push(r);
    }
  }
  for (const item of rows()) {
    const matches = existing.get(item.itemId) || [];
    if (matches.length) {
      for (const r of matches) {
        r.apiOriginal = originalFields.get(r);
        r.apiIdentity = item;
        r.aliasNames = [...r.aliasNames || [], item.name];
        r.sprite = r.sprite || item.sprite;
      }
      continue;
    }
    out.push({ key: "api-identity-" + item.itemId, slug: "id-" + item.itemId, id: item.itemId, name: item.name, type: "Retained API identity \xB7 no daily price inferred", price: null, priceDay: null, publisherMedian: null, knownNxCost: null, dailyRate: null, catalog: true, catalogKey: "api-identity-" + item.itemId, metadata: true, apiIdentityOnly: true, apiIdentity: item, sprite: item.sprite });
  }
  return out;
}
var api = { available, get enabled() {
  return enabled;
}, async setEnabled(value) {
  if (!available) return;
  const next = value === true;
  if (next !== enabled) identityEpoch++;
  enabled = next;
  if (button) {
    button.textContent = "Item API details: " + (enabled ? "On" : "Off");
    button.setAttribute("aria-pressed", String(enabled));
  }
  if (!enabled) {
    hide();
    doc.dispatchEvent(new CustomEvent("astrapiitemidentities"));
    if (location.hash.startsWith("#item/")) window.dispatchEvent(new Event("hashchange"));
    return;
  }
  try {
    const loaded = await loadIdentities();
    if (loaded && enabled && location.hash.startsWith("#item/")) window.dispatchEvent(new Event("hashchange"));
  } catch {
    if (note) note.textContent = "API identity collection unavailable; prior-source search remains available.";
  }
}, loadIdentities, resolveId, disabledIdentity(slug) {
  const match = /^id-([1-9][0-9]{0,8})$/.exec(slug ?? "");
  return available && !enabled && !!(match && byId(Number(match[1])));
}, findIdentity(slug) {
  const m = /^id-([1-9][0-9]{0,8})$/.exec(slug ?? ""), row = m && byId(Number(m[1]));
  return enabled && row ? { apiIdentityOnly: true, canonicalId: row.itemId, slug: "id-" + row.itemId, name: row.name } : null;
}, existingBinding(id2) {
  const row = byId(id2);
  return enabled && row?.providerBindings.length === 1 ? row.providerBindings[0] : null;
}, identityShell, showItem, beforeItemRender() {
  host?.remove();
}, hide, mergeSearchRecords, coverage() {
  return identity ? `${identity.mode === "retained" ? "Retained complete collection: " : ""}${identity.itemCount} accepted/retained API identity IDs; ${identity.pricedItemCount} appear in the accepted prices snapshot. Other entries may be retained or have no accepted price membership. Identity presence is not a price, sale, release or fresh observation.` : "";
}, peekIdentities: () => identity };
window.AstraItemApiPreview = Object.freeze(api);
var button = null;
var note = null;
if (available && scope) {
  const group = make("div");
  group.className = "api-item-preview-options";
  group.dataset.previewControls = "true";
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", "Separate item API preview");
  button = make("button", "Item API details: Off");
  button.type = "button";
  button.setAttribute("aria-pressed", "false");
  button.addEventListener("click", () => void api.setEnabled(!enabled));
  note = make("p", "Off by default. On adds a separate dated item panel and retained API identity search; it changes no headline, daily history or fee setting.");
  group.append(button, note);
  scope.append(group);
}
doc.getElementById("display-timezone")?.addEventListener("change", () => life?.timezoneChanged(zone()));
window.addEventListener("hashchange", () => {
  if (!location.hash.startsWith("#item/")) hide();
});
doc.addEventListener("astramarketsnapshot", () => {
  if (enabled) void loadIdentities().catch(() => {
  });
});

})();
