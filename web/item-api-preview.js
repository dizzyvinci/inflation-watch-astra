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
  const parts2 = /^(\d{4}-\d\d-\d\d)T(\d\d):(\d\d):(\d\d)/.exec(v), d = new Date(v);
  if (d.toISOString().slice(0, 10) !== parts2[1] || Number(parts2[2]) > 23 || Number(parts2[3]) > 59 || Number(parts2[4]) > 59) fail("invalid_clock");
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
var sha = async (bytes4) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes4))].map((n) => n.toString(16).padStart(2, "0")).join("");
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
var failure = (code) => Object.assign(Error(code), { code });
function createItemReferenceClient({ fetcher, enabled: enabled2 = false, isEnabled = () => true, now = Date.now, ttlMs = 3e4, timeoutMs = 1e4, maxItems = 32, maxBytes = 2097152, maxFlights = 4 } = {}) {
  if (!Number.isInteger(ttlMs) || ttlMs < 0 || ttlMs > 6e4 || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 12e3 || !Number.isSafeInteger(maxItems) || maxItems < 1 || maxItems > 64 || !Number.isSafeInteger(maxBytes) || maxBytes < 3e5 || maxBytes > 8388608 || !Number.isSafeInteger(maxFlights) || maxFlights < 1 || maxFlights > 8) throw Error("Bounded client settings required");
  let bytes4 = 0, blocked = false;
  const cache = /* @__PURE__ */ new Map(), flights = /* @__PURE__ */ new Map(), controllers = /* @__PURE__ */ new Map(), failures = /* @__PURE__ */ new Map();
  const active = () => enabled2 === true && isEnabled() === true;
  const touch = (id2, value) => {
    if (cache.has(id2)) bytes4 -= cache.get(id2).bytes;
    cache.delete(id2);
    cache.set(id2, value);
    bytes4 += value.bytes;
    while (cache.size > maxItems || bytes4 > maxBytes) {
      const first = cache.keys().next().value;
      bytes4 -= cache.get(first).bytes;
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
    const prior = cache.get(id2), control = { controller: new AbortController(), cancelled: false, timedOut: false };
    controllers.set(id2, control);
    let timer;
    const expired = new Promise((_, reject) => {
      timer = setTimeout(() => {
        control.timedOut = true;
        control.controller.abort();
        reject(failure("timeout"));
      }, timeoutMs);
    });
    const deadline = (p) => Promise.race([p, expired]);
    const fence = () => {
      if (control.cancelled || !active()) throw abort();
      if (control.timedOut) throw failure("timeout");
      if (blocked) throw failure("access_denied");
    };
    try {
      let response;
      for (let attempt = 0; attempt < 2; attempt++) {
        const generation2 = attempt === 0 ? prior?.data.projectionGeneration : null, url = "/api-item-prices/" + id2 + ".json" + (generation2 ? "?generation=" + generation2 : "");
        response = await deadline(fetcher(url, { method: "GET", credentials: "same-origin", cache: "no-cache", redirect: "error", signal: control.controller.signal, headers: prior ? { "If-None-Match": prior.etag } : {} }));
        fence();
        if (response.status === 401 || response.status === 403) throw failure("access_denied");
        if (response.status === 404) throw failure("not_found");
        if (response.status !== 409) break;
        if (attempt === 1) throw failure("generation_changed");
      }
      const mode = response.headers.get("X-Astra-API-Item-Mode"), captured = response.headers.get("X-Astra-API-Item-Captured-At"), generation = response.headers.get("X-Astra-API-Item-Generation"), etag = response.headers.get("ETag");
      if (response.status !== 200 && response.status !== 304) throw failure("unavailable");
      if (!["validated_cache", "retained"].includes(mode) || !/^"api-item-[a-f0-9]{64}"$/.test(etag ?? "")) throw failure("invalid");
      if (response.status === 304) {
        if (!prior || prior.etag !== etag || prior.data.sourceCapturedAt !== captured || prior.data.projectionGeneration !== generation) throw failure("invalid");
        fence();
        const value2 = { ...prior, mode, expires: now() + ttlMs };
        touch(id2, value2);
        failures.delete(id2);
        return value2;
      }
      if (!/^application\/json(?:;|$)/i.test(response.headers.get("Content-Type") ?? "")) throw failure("invalid");
      const body = await deadline(boundedBytes(response, 3e5));
      fence();
      if ('"api-item-' + await deadline(sha(body)) + '"' !== etag) throw failure("invalid");
      fence();
      let data;
      try {
        data = await deadline(validatePublicItemReference(parseStrictJson(body)));
      } catch {
        throw failure("invalid");
      }
      fence();
      if (data.itemId !== id2 || data.sourceCapturedAt !== captured || data.projectionGeneration !== generation || prior && Date.parse(data.sourceCapturedAt) < Date.parse(prior.data.sourceCapturedAt)) throw failure("invalid");
      const value = { data, mode, etag, bytes: body.length, expires: now() + ttlMs };
      touch(id2, value);
      failures.delete(id2);
      return value;
    } catch (error) {
      if (control.cancelled || !active() || error?.name === "AbortError" && !control.timedOut) throw abort();
      const reason = control.timedOut ? "timeout" : ["timeout", "access_denied", "not_found", "generation_changed", "invalid", "unavailable"].includes(error?.code) ? error.code : "unavailable", old = failures.get(id2)?.count ?? 0;
      failures.set(id2, { count: old + 1, reason, checkedAt: now(), retryAt: now() + Math.min(3e5, 3e4 * 2 ** Math.min(old, 4)) });
      while (failures.size > 64) failures.delete(failures.keys().next().value);
      if (reason === "access_denied") {
        blocked = true;
        throw failure(reason);
      }
      if (prior && active()) {
        const value = { ...prior, mode: "retained" };
        touch(id2, value);
        return value;
      }
      throw failure(reason);
    } finally {
      clearTimeout(timer);
      if (controllers.get(id2) === control) controllers.delete(id2);
    }
  }
  return Object.freeze({
    async loadItem({ itemId, signal } = {}) {
      if (!Number.isSafeInteger(itemId) || itemId < 1 || itemId > 999999999) throw Error("Exact numeric ID required");
      if (!active() || typeof fetcher !== "function") throw failure("disabled");
      if (blocked) throw failure("access_denied");
      let value = cache.get(itemId);
      if (value && now() < value.expires) return { data: structuredClone(value.data), mode: value.mode };
      if ((failures.get(itemId)?.retryAt ?? 0) > now()) {
        if (value) return { data: structuredClone(value.data), mode: "retained" };
        throw failure(failures.get(itemId).reason);
      }
      if (!flights.has(itemId)) {
        if (flights.size >= maxFlights) throw failure("read_capacity");
        const task = read(itemId);
        flights.set(itemId, task);
        task.finally(() => {
          if (flights.get(itemId) === task) flights.delete(itemId);
        }).catch(() => {
        });
      }
      value = await wait(flights.get(itemId), signal);
      return { data: structuredClone(value.data), mode: value.mode };
    },
    peekCachedReferences() {
      return !active() || blocked ? { status: blocked ? "access_denied" : "disabled", references: [] } : { status: "cache_only", references: [...cache.values()].map((v) => ({ data: structuredClone(v.data), mode: now() < v.expires ? v.mode : "retained" })) };
    },
    state(id2) {
      const value = cache.get(id2);
      return value ? { mode: value.mode, capturedAt: value.data.sourceCapturedAt, generation: value.data.projectionGeneration } : null;
    },
    diagnostic(id2) {
      const f = failures.get(id2), value = cache.get(id2);
      return { blocked, reason: blocked ? "access_denied" : f?.reason ?? null, retryAt: f?.retryAt ?? 0, partial: !!value && (value.data.item.aggregate.sold === null || value.data.item.aggregate.asking === null || value.data.item.aggregate.reference === null) };
    },
    cancelItem(id2) {
      const c = controllers.get(id2);
      if (c) {
        c.cancelled = true;
        c.controller.abort();
      }
      return (flights.get(id2) ?? Promise.resolve()).catch(() => {
      });
    },
    resetAccess() {
      if (blocked) {
        for (const [id2, value] of [...cache]) touch(id2, { ...value, expires: 0 });
        failures.clear();
      }
      blocked = false;
    },
    clear() {
      for (const c of controllers.values()) {
        c.cancelled = true;
        c.controller.abort();
      }
      cache.clear();
      failures.clear();
      bytes4 = 0;
      blocked = false;
    }
  });
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
  let count2 = 0, last = 0, totalBytes = 0;
  for (const [page, d] of m.pages.entries()) {
    shape2(d, ["page", "firstItemId", "lastItemId", "itemCount", "sha256", "bytes", "url"]);
    check2(d.page === page && HASH3.test(d.sha256) && d.url === "/api-item-identities/" + d.sha256 + ".json");
    int(d.firstItemId, last + 1, 999999999);
    int(d.lastItemId, d.firstItemId, 999999999);
    int(d.itemCount, 1, 128);
    int(d.bytes, 1, 131072);
    count2 += d.itemCount;
    last = d.lastItemId;
    totalBytes += d.bytes;
  }
  check2(count2 === m.itemCount && totalBytes <= 8388608);
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
  let epoch = 0, controller = null, handle = null, currentId = null, timezone = null, lastCapture = null, lastDtoSha = null, flight = null;
  const clear = () => {
    handle?.destroy();
    handle = null;
  };
  function load(itemId, preserveState) {
    if (!Number.isSafeInteger(itemId) || itemId < 1 || itemId > 999999999) throw TypeError("Exact numeric item ID required");
    if (flight?.itemId === itemId) return flight.promise;
    const token = ++epoch;
    controller?.abort();
    controller = new AbortController();
    const ownController = controller;
    if (currentId !== itemId) {
      clear();
      lastCapture = null;
      lastDtoSha = null;
    }
    currentId = itemId;
    if (typeof loader !== "function") {
      onStatus("not_connected");
      return Promise.resolve({ status: "not_connected" });
    }
    onStatus("loading", { hasData: !!handle });
    const task = { itemId };
    task.promise = (async () => {
      try {
        const reply = await loader({ itemId, signal: ownController.signal });
        if (token !== epoch || ownController.signal.aborted) return { status: "stale" };
        const value = await validatePublicItemReference(reply);
        if (token !== epoch || ownController.signal.aborted) return { status: "stale" };
        if (value.itemId !== itemId || lastCapture !== null && Date.parse(value.sourceCapturedAt) < Date.parse(lastCapture)) throw Object.assign(TypeError("Wrong or older item reference"), { code: "invalid" });
        const options = { timezone: timezone ?? getTimezone(), spriteMap };
        if (handle) {
          if (value.dtoSha256 !== lastDtoSha) handle.updateDto(value.item, { preserveState });
          handle.updateTimezone(options.timezone);
        } else handle = mountPanel(container, value.item, options);
        lastCapture = value.sourceCapturedAt;
        lastDtoSha = value.dtoSha256;
        onStatus("shown", { hasData: true });
        return { status: "shown", itemId, sourceCapturedAt: value.sourceCapturedAt, generation: value.projectionGeneration };
      } catch (error) {
        if (token !== epoch || ownController.signal.aborted) return { status: "stale" };
        if (error?.code === "access_denied") {
          clear();
          onStatus("access_denied", { hasData: false, reason: "access_denied" });
          return { status: "access_denied" };
        }
        const status = handle ? "retained" : "unavailable";
        onStatus(status, { hasData: !!handle, reason: error?.code ?? "unavailable" });
        return { status };
      } finally {
        if (flight === task) flight = null;
      }
    })();
    flight = task;
    return task.promise;
  }
  return Object.freeze({
    show: (itemId) => load(itemId, false),
    refresh() {
      return currentId === null ? Promise.resolve({ status: "not_connected" }) : load(currentId, true);
    },
    pause() {
      epoch++;
      controller?.abort();
      controller = null;
      flight = null;
      onStatus("paused", { hasData: !!handle });
    },
    timezoneChanged(value) {
      timezone = value;
      handle?.updateTimezone(value);
    },
    hide() {
      epoch++;
      controller?.abort();
      controller = null;
      flight = null;
      currentId = null;
      lastCapture = null;
      lastDtoSha = null;
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
  if (typeof value !== "string" || value.length > 160 || !/^\d+(?:\.\d+)?$/.test(value)) return "Unknown";
  const [whole, fraction = ""] = value.split(".");
  let tenths = BigInt(whole) * 10n + BigInt(fraction[0] || "0");
  if ((fraction[1] || "0") >= "5") tenths++;
  return (tenths / 10n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + (tenths % 10n).toString();
}
function displayInteger(value) {
  return Number.isSafeInteger(value) ? value.toLocaleString("en-US", { maximumFractionDigits: 0 }) : "Unknown";
}
function retrievalClock(iso2, zone2 = "UTC") {
  if (!Number.isFinite(Date.parse(iso2))) return "Unknown";
  try {
    const parts2 = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: zone2, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso2)).map((p) => [p.type, p.value]));
    return `${parts2.month}-${parts2.day}-${parts2.year} ${parts2.hour}:${parts2.minute}:${parts2.second} ${zone2}`;
  } catch {
    return retrievalClock(iso2, "UTC");
  }
}
var spritePath = (value) => typeof value === "string" && /^\/?assets\/[A-Za-z0-9._/-]+\.png$/.test(value) && !value.split("/").includes("..") ? value : null;
var signature = (row, formatted = false) => Object.entries(labels).filter(([code]) => own2(row.reportedStats, code)).map(([code, label]) => `${label} ${formatted ? displayInteger(row.reportedStats[code]) : row.reportedStats[code]}`).join(" \xB7 ") || "No stats reported";
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
  const clock3 = el("p", void 0, "api-item-clock");
  clock3.dataset.rawDate = "true";
  section.append(clock3);
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
    clock3.textContent = "Retrieved: " + retrievalClock(dto.source.retrievedAt, zone2) + " \xB7 underlying observation time unknown";
    credit.href = `https://maplestory.market/items/${dto.itemId}?ref=v6kkdvp6`;
    summary.replaceChildren();
    const card = (heading2, lines) => {
      const box = el("div", void 0, "api-item-summary-card");
      box.append(el("h3", heading2));
      for (const line of lines) box.append(el("p", line));
      summary.append(box);
    };
    const s = dto.aggregate.sold, a = dto.aggregate.asking, r = dto.aggregate.reference;
    card("Source-labelled sales", [`Median: ${exactMoney(s?.medianUnitPrice ?? null)} mesos`, `Average (AVG): ${exactMoney(s?.averageUnitPrice ?? null)} mesos`, s ? `${displayInteger(s.reportedSalesCount)} reported sales \xB7 ${displayInteger(s.reportedUnitCount)} reported units` : "Sales counts unknown", s ? `Source day counters: ${displayInteger(s.reportedDaySalesCount)} sales \xB7 ${displayInteger(s.reportedDayUnitCount)} units (bounds unknown)` : ""]);
    card("Asking prices", [`Median ask: ${exactMoney(a?.medianUnitPrice ?? null)} mesos`, `P25: ${exactMoney(a?.p25UnitPrice ?? null)} \xB7 P75: ${exactMoney(a?.p75UnitPrice ?? null)} mesos`, a ? `${displayInteger(a.reportedListingCount)} reported listings \xB7 ${displayInteger(a.reportedSellerCount)} reported sellers` : "Listing and seller counts unknown"]);
    card("Publisher reference", [r ? `${r.aggregation === "average" ? "Average of source-labelled sales" : "Median asking price"}: ${exactMoney(r.unitPrice)} mesos` : "Reference unavailable", r ? `${displayInteger(r.reportedSamples)} reported reference samples` : "", "The reference is kept separate from the sale median."]);
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
  function buildFilters(extraStats = []) {
    const options = structuredClone(filterOptions(dto));
    for (const code of extraStats) if (!options.stats.some((v) => v.code === code)) options.stats.push({ code, label: labels[code] || code });
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
    feedback.textContent = `${displayInteger(total)} matching groups. ${near.checked && pool !== "reported_stats" ? "Nearby fallbacks included." : "Nearby fallbacks off."} Prices are mesos per item.`;
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
      const r = row.reference, deal = row.dealReference, nearText = deal ? deal.isNearFallback && !near.checked ? "Off" : `${exactMoney(deal.unitPrice)} mesos \xB7 ${deal.basis === "sold" ? "source sold" : "asking"} \xB7 ${displayInteger(deal.reportedSamples)} samples${deal.isNearFallback ? " \xB7 nearby, qualities may differ" : ""}` : "Unavailable";
      const common = [r ? exactMoney(r.unitPrice) : "Unknown", r ? `${r.basis === "sold" ? "Source sold" : "Asking"} \xB7 ${displayInteger(r.reportedSamples)} samples${r.isNearFallback ? " \xB7 nearby" : ""}` : "Unknown", nearText];
      const values = pool === "attack_pool" ? [displayInteger(row.reportedAttack), `${exactMoney(row.sold?.medianUnitPrice ?? null)} / ${exactMoney(row.sold?.averageUnitPrice ?? null)}`, row.sold ? `${displayInteger(row.sold.reportedSalesCount)} / ${displayInteger(row.sold.reportedUnitCount)}` : "Unknown", row.asking ? `${exactMoney(row.asking.medianUnitPrice)} / ${displayInteger(row.asking.reportedListingCount)}` : "Unknown", ...common] : [pool === "reported_stats" ? signature(row, true) : "Scroll-state pool", displayInteger(row.slotsLeft), displayInteger(row.successfulUpgrades), ...common];
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
    pageText.textContent = `Page ${displayInteger(page + 1)} of ${displayInteger(pages)}`;
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
  function preserveControls() {
    const fields = [...controls.querySelectorAll("[data-filter],[data-stat]")].map((n) => ({ key: n.dataset.filter || null, stat: n.dataset.stat || null, bound: n.dataset.bound || null, value: n.value, checked: n.checked, focused: doc2.activeElement === n, start: n.selectionStart, end: n.selectionEnd }));
    return { fields, page, scrollLeft: tableWrap.scrollLeft, scrollTop: tableWrap.scrollTop };
  }
  function restoreControls(saved) {
    for (const f of saved.fields) {
      const n = f.key ? controls.querySelector(`[data-filter="${f.key}"]`) : controls.querySelector(`[data-stat="${f.stat}"][data-bound="${f.bound}"]`);
      if (!n) continue;
      if (n.tagName === "SELECT" && f.value !== "" && ![...n.options].some((o) => o.value === f.value)) {
        const o = el("option", f.value + " (not reported in this update)");
        o.value = f.value;
        n.append(o);
      }
      n.value = f.value;
      if (n.type === "checkbox") n.checked = f.checked;
      if (f.focused) {
        n.focus({ preventScroll: true });
        if (f.start !== null && f.start !== void 0) try {
          n.setSelectionRange(f.start, f.end);
        } catch {
        }
      }
    }
    page = saved.page;
  }
  return Object.freeze({ element: section, updateTimezone(value) {
    zone2 = value;
    fillSummary();
  }, updateDto(value, { preserveState = false } = {}) {
    assertSafeItemDto(value);
    const saved = preserveState ? preserveControls() : null;
    dto = structuredClone(value);
    if (!saved) {
      page = 0;
      controls.reset();
    }
    fillSummary();
    buildFilters(saved ? saved.fields.filter((f) => f.stat && f.value !== "").map((f) => f.stat) : []);
    if (saved) restoreControls(saved);
    renderRows();
    if (saved) {
      tableWrap.scrollLeft = saved.scrollLeft;
      tableWrap.scrollTop = saved.scrollTop;
    }
  }, destroy() {
    destroyed = true;
    section.remove();
  } });
}

// ops/portable-hash.mjs
var encoder = new TextEncoder();

// ops/api-cash-projection.mjs
var MAX = Number.MAX_SAFE_INTEGER;

// ops/api-raw-prices-decoder.mjs
var MAX2 = BigInt(Number.MAX_SAFE_INTEGER);
var fail2 = (ok, message) => {
  if (!ok) throw new TypeError(message);
};
var own3 = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
var JsonNumber = class {
  constructor(token) {
    this.token = token;
    Object.freeze(this);
  }
};
function isOriginalJsonNumber(value) {
  return value instanceof JsonNumber;
}
function parseStrictJson2(text) {
  fail2(typeof text === "string" && text.length <= 5e6, "Bounded UTF8 JSON text required");
  let i = 0, nodes = 0;
  const white = () => {
    while (i < text.length && [" ", "\n", "\r", "	"].includes(text[i])) i++;
  };
  function string() {
    const start = i++;
    while (i < text.length) {
      const char = text[i++];
      if (char === '"') {
        const value2 = JSON.parse(text.slice(start, i));
        fail2(value2.length <= 4096, "JSON string too long");
        return value2;
      }
      if (char === "\\") i++;
    }
    throw new TypeError("Unterminated JSON string");
  }
  function numeric() {
    const start = i;
    if (text[i] === "-") i++;
    if (text[i] === "0") i++;
    else {
      fail2(text[i] >= "1" && text[i] <= "9", "Invalid JSON number");
      while (text[i] >= "0" && text[i] <= "9") i++;
    }
    if (text[i] === ".") {
      i++;
      const digits = i;
      while (text[i] >= "0" && text[i] <= "9") i++;
      fail2(i > digits, "Missing fractional digits");
    }
    if (text[i] === "e" || text[i] === "E") {
      i++;
      if (text[i] === "+" || text[i] === "-") i++;
      const digits = i;
      while (text[i] >= "0" && text[i] <= "9") i++;
      fail2(i > digits, "Missing exponent digits");
    }
    fail2(i - start <= 4096, "JSON number token too long");
    return new JsonNumber(text.slice(start, i));
  }
  function value(depth) {
    fail2(++nodes <= 1e6 && depth <= 64, "JSON complexity bound");
    white();
    const char = text[i];
    if (char === '"') return string();
    if (char === "-" || char >= "0" && char <= "9") return numeric();
    for (const [token, literal] of [["true", true], ["false", false], ["null", null]]) if (text.startsWith(token, i)) {
      i += token.length;
      return literal;
    }
    if (char === "[") {
      i++;
      white();
      const out = [];
      if (text[i] === "]") {
        i++;
        return Object.freeze(out);
      }
      while (true) {
        fail2(out.length < 1e4, "JSON array bound");
        out.push(value(depth + 1));
        white();
        if (text[i] === "]") {
          i++;
          return Object.freeze(out);
        }
        fail2(text[i++] === ",", "Expected array comma");
      }
    }
    if (char === "{") {
      i++;
      white();
      const out = /* @__PURE__ */ Object.create(null);
      let count2 = 0;
      if (text[i] === "}") {
        i++;
        return Object.freeze(out);
      }
      while (true) {
        white();
        fail2(text[i] === '"', "Expected object key");
        const key = string();
        fail2(!own3(out, key), "Duplicate JSON key");
        fail2(++count2 <= 64, "JSON object bound");
        white();
        fail2(text[i++] === ":", "Expected object colon");
        out[key] = value(depth + 1);
        white();
        if (text[i] === "}") {
          i++;
          return Object.freeze(out);
        }
        fail2(text[i++] === ",", "Expected object comma");
      }
    }
    throw new TypeError("Invalid JSON token");
  }
  const result = value(0);
  white();
  fail2(i === text.length, "Trailing JSON data");
  return result;
}

// ops/api-item-hour-history-profile.mjs
var ItemHistoryContractError = class extends TypeError {
};
var check3 = (v, why) => {
  if (!v) throw new ItemHistoryContractError(why);
};
var MAX3 = BigInt(Number.MAX_SAFE_INTEGER);
var enc3 = new TextEncoder();
var exact = (v, keys) => check3(v && typeof v === "object" && !Array.isArray(v) && !isOriginalJsonNumber(v) && Object.keys(v).sort().join("|") === keys.split(" ").sort().join("|"), "history_fields");
function decimal(v, positive) {
  check3(isOriginalJsonNumber(v) && v.token.length <= 256, "history_price_token");
  const token = v.token, m = /^(-?)([0-9]+)(?:\.([0-9]+))?(?:[eE]([+-]?[0-9]+))?$/.exec(token);
  check3(m, "history_decimal");
  const digits = (m[2] + (m[3] || "")).replace(/^0+/, ""), exponent = Number(m[4] || 0) - (m[3] || "").length;
  check3(!(m[1] && digits) && Number.isSafeInteger(exponent) && Math.abs(exponent) <= 1e3 && (!positive || digits.length > 0), "history_nonnegative_price");
  return { token, digits, power: exponent };
}
function compare(a, b) {
  if (!a.digits) return b.digits ? -1 : 0;
  if (!b.digits) return 1;
  const x = a.digits.length + a.power, y = b.digits.length + b.power;
  if (x !== y) return x < y ? -1 : 1;
  const n = Math.max(a.digits.length, b.digits.length), left = a.digits.padEnd(n, "0"), right = b.digits.padEnd(n, "0");
  return left === right ? 0 : left < right ? -1 : 1;
}
async function historyByteHash(bytes4) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes4))].map((x) => x.toString(16).padStart(2, "0")).join("");
}
function validateProjectedHour(row) {
  exact(row, "providerBucketEpochSeconds providerBucketTimestampUtc seen sold sourceObservedAt bucketCompletionKnown exactBucketStartAt exactBucketEndAt qualityConstant variantIdentity");
  const at = row.providerBucketEpochSeconds;
  check3(Number.isSafeInteger(at) && at >= 946684800 && at < 4102444800 && at % 3600 === 0 && row.providerBucketTimestampUtc === new Date(at * 1e3).toISOString().replace(".000Z", "Z") && row.sourceObservedAt === null && row.bucketCompletionKnown === false && row.exactBucketStartAt === null && row.exactBucketEndAt === null && row.qualityConstant === false && row.variantIdentity === null, "history_saved_bucket");
  const price = (v, positive) => {
    check3(typeof v === "string", "history_saved_decimal");
    return decimal(parseStrictJson2(v), positive);
  };
  for (const [kind, value] of [["seen", row.seen], ["sold", row.sold]]) {
    if (value === null) continue;
    const fields = kind === "seen" ? "reportedListingCount min_unit_price median_unit_price max_unit_price basis currentAvailabilityVerified" : "reportedBundles reportedUnits min_unit_price p25_unit_price median_unit_price p75_unit_price max_unit_price avg_unit_price basis bundlesEquivalentToSalesVerified";
    exact(value, fields);
    const keys = kind === "seen" ? ["min_unit_price", "median_unit_price", "max_unit_price"] : ["min_unit_price", "p25_unit_price", "median_unit_price", "p75_unit_price", "max_unit_price"], prices = keys.map((k) => price(value[k], true));
    check3(prices.every((p, i) => !i || compare(prices[i - 1], p) <= 0), "history_saved_quantiles");
    const counts = kind === "seen" ? [value.reportedListingCount] : [value.reportedBundles, value.reportedUnits];
    check3(counts.every((v) => Number.isSafeInteger(v) && v >= 0), "history_saved_counts");
    if (kind === "seen") check3(value.basis === "source_seen_asking_prices" && value.currentAvailabilityVerified === false, "history_saved_asking_basis");
    else {
      price(value.avg_unit_price, false);
      check3(value.basis === "source_labeled_sold_hourly_aggregate_not_individual_trades" && value.bundlesEquivalentToSalesVerified === false, "history_saved_sold_basis");
    }
  }
  return row;
}

// ops/item-hour-public-contract.mjs
var METHOD = "retained-whole-item-hour-public-v1";
var LIMITS = Object.freeze({ pages: 128, rowsPerPage: 128, manifestBytes: 131072, pageBytes: 262144, totalBytes: 8388608, rows: 16384 });
var HASH4 = /^[a-f0-9]{64}$/;
var need = (v, c = "invalid_history_contract") => {
  if (!v) throw Error(c);
};
var shape3 = (v, keys) => need(v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).sort().join("|") === keys.split(" ").sort().join("|"), "history_closed_fields");
var int2 = (v, min = 0, max = Number.MAX_SAFE_INTEGER) => need(Number.isSafeInteger(v) && v >= min && v <= max, "history_integer");
var clock2 = (v) => {
  need(typeof v === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v, "history_original_clock");
  return v;
};
var freeze2 = (v) => {
  if (v && typeof v === "object") {
    for (const x of Object.values(v)) freeze2(x);
    Object.freeze(v);
  }
  return v;
};
var bytes3 = (v) => new TextEncoder().encode(typeof v === "string" ? v : JSON.stringify(v));
var hash2 = async (v) => historyByteHash(v instanceof Uint8Array ? v : bytes3(v));
var sourceUrl = (id2) => `https://maplestory.market/api/items/${id2}/history`;
var creditUrl = (id2) => `https://maplestory.market/items/${id2}?ref=v6kkdvp6`;
var manifestPath = (id2) => `/api-item-history/${id2}/manifest.json`;
var weekStart = (epoch) => {
  int2(epoch, 946684800, 4102444799);
  const d = new Date(epoch * 1e3);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - (d.getUTCDay() + 6) % 7)).toISOString().slice(0, 10);
};
var seenKeys = "reportedListingCount min_unit_price median_unit_price max_unit_price basis currentAvailabilityVerified".split(" ");
var soldKeys = "reportedBundles reportedUnits min_unit_price p25_unit_price median_unit_price p75_unit_price max_unit_price avg_unit_price basis bundlesEquivalentToSalesVerified".split(" ");
function canonicalHour(input) {
  validateProjectedHour(input);
  const row = Object.fromEntries("providerBucketEpochSeconds providerBucketTimestampUtc seen sold sourceObservedAt bucketCompletionKnown exactBucketStartAt exactBucketEndAt qualityConstant variantIdentity".split(" ").map((k) => [k, input[k]]));
  for (const [name, keys] of [["seen", seenKeys], ["sold", soldKeys]]) if (row[name] !== null) row[name] = Object.fromEntries(keys.map((k) => [k, row[name][k]]));
  return row;
}
function validateRevision(r) {
  shape3(r, "hour originalRetrievedAt revisionOrder latest");
  canonicalHour(r.hour);
  clock2(r.originalRetrievedAt);
  int2(r.revisionOrder, 1, LIMITS.rows);
  need(typeof r.latest === "boolean");
  return r;
}
async function validateManifest2(input, id2) {
  const m = structuredClone(input);
  shape3(m, "schemaVersion kind methodVersion itemId identityScope source priceRepresentation priceUnitMeaning sourceObservedAt individualTradesQualified qualityConstant variantIdentity bucketCompletionKnown completeTradeHistory missingBucketMeansZero nullSoldMeansVerifiedZero firstHourUtc lastHourUtc oldestOriginalRetrievedAt latestOriginalRetrievedAt retainedHours retainedRevisionRows pages generation");
  need(m.schemaVersion === 1 && m.kind === "retained_item_hour_manifest" && m.methodVersion === METHOD && m.itemId === id2 && m.identityScope === "whole_item_unknown_roll_identity");
  int2(id2, 1, 999999999);
  shape3(m.source, "provider sourceUrl creditUrl");
  need(m.source.provider === "maplestory.market" && m.source.sourceUrl === sourceUrl(id2) && m.source.creditUrl === creditUrl(id2));
  need(m.priceRepresentation === "original_JSON_decimal_lexeme_not_binary64_price" && m.priceUnitMeaning === "source_unit_price_fields_physical_stack_conversion_unverified" && m.sourceObservedAt === null && m.individualTradesQualified === 0 && m.qualityConstant === false && m.variantIdentity === null && m.bucketCompletionKnown === false && m.completeTradeHistory === false && m.missingBucketMeansZero === false && m.nullSoldMeansVerifiedZero === false);
  int2(m.retainedHours, 0, LIMITS.rows);
  int2(m.retainedRevisionRows, m.retainedHours, LIMITS.rows);
  need(Array.isArray(m.pages) && m.pages.length <= LIMITS.pages);
  if (!m.retainedHours) {
    need(!m.pages.length && m.retainedRevisionRows === 0 && m.firstHourUtc === null && m.lastHourUtc === null && m.oldestOriginalRetrievedAt === null && m.latestOriginalRetrievedAt === null);
  } else {
    for (const k of ["oldestOriginalRetrievedAt", "latestOriginalRetrievedAt"]) clock2(m[k]);
    need(m.oldestOriginalRetrievedAt <= m.latestOriginalRetrievedAt);
    for (const k of ["firstHourUtc", "lastHourUtc"]) need(typeof m[k] === "string" && /^\d{4}-\d\d-\d\dT\d\d:00:00Z$/.test(m[k]) && Number.isFinite(Date.parse(m[k])) && new Date(m[k]).toISOString().replace(".000Z", "Z") === m[k]);
    need(m.firstHourUtc <= m.lastHourUtc && m.pages.length > 0);
  }
  let total = 0, rows2 = 0, last = "", part = 0;
  const paths = /* @__PURE__ */ new Set();
  for (const d of m.pages) {
    shape3(d, "weekStart part path sha256 bytes revisionRows firstEpoch lastEpoch");
    need(typeof d.weekStart === "string" && /^\d{4}-\d\d-\d\d$/.test(d.weekStart) && Number.isFinite(Date.parse(d.weekStart)) && weekStart(Date.parse(d.weekStart) / 1e3) === d.weekStart && HASH4.test(d.sha256));
    int2(d.part, 0, LIMITS.pages - 1);
    need(d.weekStart >= last && d.part === (d.weekStart === last ? part + 1 : 0));
    last = d.weekStart;
    part = d.part;
    need(d.path === `/api-item-history/${id2}/week/${d.weekStart}-${d.part}-${d.sha256}.json` && !paths.has(d.path));
    paths.add(d.path);
    int2(d.bytes, 1, LIMITS.pageBytes);
    int2(d.revisionRows, 1, LIMITS.rowsPerPage);
    int2(d.firstEpoch, 946684800, 4102444799);
    int2(d.lastEpoch, d.firstEpoch, 4102444799);
    need(weekStart(d.firstEpoch) === d.weekStart && weekStart(d.lastEpoch) === d.weekStart && d.firstEpoch % 3600 === 0 && d.lastEpoch % 3600 === 0);
    total += d.bytes;
    rows2 += d.revisionRows;
  }
  need(total <= LIMITS.totalBytes && rows2 === m.retainedRevisionRows);
  const { generation, ...unsigned } = m;
  need(HASH4.test(generation) && await hash2(unsigned) === generation, "history_generation_hash");
  return freeze2(m);
}
function validatePage2(input, d, m) {
  const p = structuredClone(input);
  shape3(p, "schemaVersion kind methodVersion itemId weekStart part rows");
  need(p.schemaVersion === 1 && p.kind === "retained_item_hour_revisions" && p.methodVersion === METHOD && p.itemId === m.itemId && p.weekStart === d.weekStart && p.part === d.part && Array.isArray(p.rows) && p.rows.length === d.revisionRows);
  let at = -1, order = 0;
  for (const r of p.rows) {
    validateRevision(r);
    const epoch = r.hour.providerBucketEpochSeconds;
    need(weekStart(epoch) === d.weekStart && (epoch > at || epoch === at && r.revisionOrder === order + 1));
    if (epoch > at) order = r.revisionOrder;
    else order++;
    at = epoch;
    need(r.originalRetrievedAt >= m.oldestOriginalRetrievedAt && r.originalRetrievedAt <= m.latestOriginalRetrievedAt);
  }
  need(p.rows[0].hour.providerBucketEpochSeconds === d.firstEpoch && p.rows.at(-1).hour.providerBucketEpochSeconds === d.lastEpoch);
  return freeze2(p);
}
function parseBody(raw, max) {
  need(raw instanceof Uint8Array && raw.length > 0 && raw.length <= max, "history_bytes");
  return parseStrictJson(raw);
}
function validateSelection(pages, m, { fromEpoch = 0, toEpoch = 4102444800 } = {}) {
  int2(fromEpoch, 0, 4102444800);
  int2(toEpoch, fromEpoch, 4102444800);
  const records = pages.flatMap((p) => p.rows), hours = /* @__PURE__ */ new Map();
  for (const r of records) {
    const epoch = r.hour.providerBucketEpochSeconds;
    if (epoch < fromEpoch || epoch >= toEpoch) continue;
    const list = hours.get(epoch) ?? [];
    list.push(r);
    hours.set(epoch, list);
  }
  for (const list of hours.values()) {
    list.sort((a, b) => a.revisionOrder - b.revisionOrder);
    need(list.every((r, i) => r.revisionOrder === i + 1) && list.filter((r) => r.latest).length === 1 && list.at(-1).latest, "history_revision_selection");
    need(list.every((r, i) => !i || r.originalRetrievedAt >= list[i - 1].originalRetrievedAt), "history_revision_capture_order");
  }
  if (fromEpoch === 0 && toEpoch === 4102444800) {
    need(pages.length === m.pages.length && hours.size === m.retainedHours && records.length === m.retainedRevisionRows, "history_full_selection_coverage");
    if (records.length) need(records[0].hour.providerBucketTimestampUtc === m.firstHourUtc && records.at(-1).hour.providerBucketTimestampUtc === m.lastHourUtc, "history_full_selection_bounds");
  }
  return freeze2({ itemId: m.itemId, generation: m.generation, source: m.source, sourceObservedAt: null, identityScope: m.identityScope, latestOriginalRetrievedAt: m.latestOriginalRetrievedAt, rows: [...hours.values()].map((list) => list.at(-1)), revisions: records.filter((r) => r.hour.providerBucketEpochSeconds >= fromEpoch && r.hour.providerBucketEpochSeconds < toEpoch), individualTradesQualified: 0, qualityConstant: false, variantIdentity: null, bucketCompletionKnown: false, completeTradeHistory: false });
}

// ops/item-hour-client.mjs
function createItemHourClient({ origin = globalThis.location?.origin, fetcher = globalThis.fetch, enabled: enabled2 = false, onChange = () => {
}, maxSelections = 8 } = {}) {
  const own4 = new URL(origin);
  need(own4.origin === origin && ["https:", "http:"].includes(own4.protocol) && (!globalThis.location || globalThis.location.origin === origin), "history_own_origin");
  need(Number.isInteger(maxSelections) && maxSelections >= 1 && maxSelections <= 16);
  let active = enabled2 === true, epoch = 0, controller = null, model = freeze2({ status: active ? "idle" : "off", data: null }), flightCount = 0;
  const lastgood = /* @__PURE__ */ new Map();
  const emit = (value) => {
    model = freeze2(value);
    onChange(model);
    return model;
  };
  async function get(path, signal, max) {
    need(path.startsWith("/api-item-history/") && !path.startsWith("//") && new URL(path, origin).origin === origin, "history_own_path");
    flightCount++;
    try {
      const response = await fetcher(path, { method: "GET", credentials: "same-origin", cache: "no-store", redirect: "error", signal, headers: { Accept: "application/json" } });
      if (response.status === 409) throw Object.assign(Error("generation_changed"), { generationChanged: true });
      need(response.status === 200, "history_response_status");
      need(response.headers.get("content-type")?.toLowerCase().startsWith("application/json"), "history_response_mime");
      const length = response.headers.get("content-length");
      if (length !== null) need(/^[1-9][0-9]*$/.test(length) && Number(length) <= max, "history_response_length");
      const raw = new Uint8Array(await response.arrayBuffer());
      need(raw.length <= max && raw.length > 0, "history_response_bound");
      const sha2 = await hash2(raw);
      need(response.headers.get("etag") === `"item-hour-${sha2}"` && ["current", "retained"].includes(response.headers.get("X-Astra-History-Mode")), "history_response_hash");
      return { raw, generation: response.headers.get("X-Astra-History-Generation"), mode: response.headers.get("X-Astra-History-Mode"), retrieved: response.headers.get("X-Astra-History-Source-Retrieved") };
    } finally {
      flightCount--;
    }
  }
  async function transaction(id2, range, signal) {
    const local = new AbortController(), abort3 = () => local.abort();
    signal.addEventListener("abort", abort3, { once: true });
    if (signal.aborted) local.abort();
    try {
      const result = await get(manifestPath(id2), local.signal, LIMITS.manifestBytes), m = await validateManifest2(parseBody(result.raw, LIMITS.manifestBytes), id2);
      need(result.generation === m.generation && result.retrieved === (m.latestOriginalRetrievedAt ?? "none"), "history_response_clock_binding");
      const descriptors = m.pages.filter((d) => d.lastEpoch >= range.fromEpoch && d.firstEpoch < range.toEpoch), loaded = new Array(descriptors.length);
      let cursor = 0, total = 0, retained = result.mode === "retained", failure2 = null;
      async function worker() {
        try {
          for (; ; ) {
            need(!local.signal.aborted, "history_selection_aborted");
            const n = cursor++;
            if (n >= descriptors.length) return;
            const d = descriptors[n], p = await get(`${d.path}?generation=${m.generation}`, local.signal, LIMITS.pageBytes);
            need(p.generation === m.generation && p.retrieved === (m.latestOriginalRetrievedAt ?? "none") && p.raw.length === d.bytes && await hash2(p.raw) === d.sha256, "history_page_binding");
            total += p.raw.length;
            need(total <= LIMITS.totalBytes);
            loaded[n] = validatePage2(parseBody(p.raw, LIMITS.pageBytes), d, m);
            retained ||= p.mode === "retained";
          }
        } catch (error) {
          failure2 ??= error;
          local.abort();
        }
      }
      await Promise.all(Array.from({ length: Math.min(4, descriptors.length) }, worker));
      if (failure2) throw failure2;
      const data = validateSelection(loaded, m, range);
      return { data, retained };
    } finally {
      signal.removeEventListener("abort", abort3);
      local.abort();
    }
  }
  return { get model() {
    return model;
  }, setEnabled(value) {
    active = value === true;
    epoch++;
    controller?.abort();
    controller = null;
    return emit({ status: active ? "idle" : "off", data: null });
  }, async select(id2, { fromEpoch = 0, toEpoch = 4102444800 } = {}) {
    int2(id2, 1, 999999999);
    int2(fromEpoch, 0, 4102444800);
    int2(toEpoch, fromEpoch, 4102444800);
    const mine = ++epoch;
    controller?.abort();
    controller = new AbortController();
    const current2 = controller, signal = current2.signal, key = `${id2}:${fromEpoch}:${toEpoch}`, previous = lastgood.get(key) ?? null;
    if (!active) return emit({ status: "off", data: null });
    emit({ status: "loading", data: previous });
    const timer = setTimeout(() => current2.abort(), 15e3);
    try {
      let value;
      for (let retry = 0; retry < 2; retry++) {
        try {
          value = await transaction(id2, { fromEpoch, toEpoch }, signal);
          break;
        } catch (error) {
          if (!error.generationChanged || retry || signal.aborted) throw error;
        }
      }
      if (mine !== epoch || !active || signal.aborted) return model;
      lastgood.delete(key);
      lastgood.set(key, value.data);
      while (lastgood.size > maxSelections) lastgood.delete(lastgood.keys().next().value);
      return emit({ status: value.retained ? "retained" : "ready", data: value.data });
    } catch {
      current2.abort();
      if (mine !== epoch || !active) return model;
      return emit({ status: previous ? "retained" : "unavailable", data: previous });
    } finally {
      clearTimeout(timer);
      if (controller === current2) controller = null;
    }
  }, stats() {
    return { cachedSelections: lastgood.size, inFlightRequests: flightCount, providerRequests: 0 };
  } };
}

// ui-src/item-api/history.mjs
var FINITE_HISTORY_ITEM_ID = 1082002;
var NAME = "Steel Fingerless Gloves";
var NS = "http://www.w3.org/2000/svg";
function historyMoney(value) {
  if (typeof value !== "string" || value.length > 256) return "Unknown";
  const m = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(value);
  if (!m) return "Unknown";
  const digits = (m[2] + (m[3] || "")).replace(/^0+/, "") || "0", power = Number(m[4] || 0) - (m[3] || "").length + 1;
  if (!Number.isSafeInteger(power) || Math.abs(power) > 1260 || m[1] && digits !== "0") return "Unknown";
  let n = BigInt(digits);
  if (power >= 0) n *= 10n ** BigInt(power);
  else {
    const d = 10n ** BigInt(-power), r = n % d;
    n = n / d + (r * 2n >= d ? 1n : 0n);
  }
  return (n / 10n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + n % 10n;
}
var count = (n) => Number.isSafeInteger(n) && n >= 0 ? n.toLocaleString("en-US") : "Unknown";
function safeZone(value) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(0);
    return value;
  } catch {
    return "UTC";
  }
}
function parts(iso2, zone2) {
  return Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: safeZone(zone2), month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso2)).map((p) => [p.type, p.value]));
}
function historyClock(iso2, zone2 = "UTC") {
  if (!Number.isFinite(Date.parse(iso2))) return "Unknown";
  const p = parts(iso2, zone2);
  return `${p.month} ${p.day} ${p.hour}:${p.minute}:${p.second} ${safeZone(zone2)} (${p.year})`;
}
var quote = (v) => '"' + String(v ?? "").replaceAll('"', '""') + '"';
function historyCsv(data, revisions = false) {
  const headings = ["provider_hour_utc", "original_retrieved_at", "revision_order", "latest_version", "source_sold_median_unit_price_raw", "source_sold_average_unit_price_raw", "reported_bundles", "reported_units", "source_seen_median_unit_price_raw", "reported_listings", "quality_constant", "individual_trades_qualified"];
  const records = revisions ? data.revisions : data.rows;
  return [headings, ...records.map((r) => [r.hour.providerBucketTimestampUtc, r.originalRetrievedAt, r.revisionOrder, r.latest, r.hour.sold?.median_unit_price, r.hour.sold?.avg_unit_price, r.hour.sold?.reportedBundles, r.hour.sold?.reportedUnits, r.hour.seen?.median_unit_price, r.hour.seen?.reportedListingCount, false, 0])].map((r) => r.map(quote).join(",")).join("\r\n") + "\r\n";
}
function historyPlotModel(data) {
  const series = [{ key: "sold", label: "Source-labelled sold median", color: "var(--mint,#b5e5d1)" }, { key: "seen", label: "Seen asking median", color: "var(--gold,#e4c573)" }];
  let omitted = 0;
  const lines = series.map((s) => ({ ...s, points: data.rows.map((r) => {
    const raw = r.hour[s.key]?.median_unit_price ?? null, value = raw === null ? null : Number(raw), drawable = value !== null && Number.isFinite(value) && value > 0;
    if (raw !== null && !drawable) omitted++;
    return { epoch: r.hour.providerBucketEpochSeconds, raw, value: drawable ? value : null, retrievedAt: r.originalRetrievedAt };
  }) }));
  return { series: lines, omitted, first: data.rows[0]?.hour.providerBucketEpochSeconds ?? null, last: data.rows.at(-1)?.hour.providerBucketEpochSeconds ?? null, max: Math.max(0, ...lines.flatMap((s) => s.points.map((p) => p.value ?? 0))) };
}
function mountItemHistoryPreview(container, { itemId, fetcher = globalThis.fetch, timezone = "UTC", parentActive = () => true, isCurrent = () => true, download = null } = {}) {
  if (!container?.ownerDocument || !Number.isSafeInteger(itemId) || itemId < 1 || itemId > 999999999) throw TypeError("Exact item history context required");
  const doc2 = container.ownerDocument, win = doc2.defaultView, el = (tag, text, cls) => {
    const n = doc2.createElement(tag);
    if (text !== void 0) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  };
  let destroyed = false, selected = false, zone2 = safeZone(timezone), model = { status: "off", data: null }, page = 0, allRevisions = false, transportEpoch = 0;
  const section = el("section", void 0, "item-hour-preview"), body = el("div", void 0, "item-hour-body"), options = el("div", void 0, "item-hour-options");
  body.hidden = true;
  options.dataset.previewControls = "true";
  options.setAttribute("role", "group");
  options.setAttribute("aria-label", "Finite whole-item history preview");
  const toggle = el("button", "Hourly whole-item history: Off");
  toggle.type = "button";
  toggle.setAttribute("aria-pressed", "false");
  toggle.dataset.itemHourToggle = "true";
  options.append(toggle, el("p", "Off by default. Only the independently retained 1082002 Steel Fingerless Gloves snapshot is available; other item IDs remain unavailable."));
  section.append(body, options);
  container.append(section);
  const live = () => !destroyed && parentActive() === true && isCurrent() === true;
  let client2;
  function makeClient() {
    let own4;
    own4 = createItemHourClient({ origin: win.location.origin, enabled: false, fetcher: async (...args) => {
      if (!live() || !selected || itemId !== FINITE_HISTORY_ITEM_ID) throw Error("Inactive finite history");
      const epoch = transportEpoch, response = await fetcher(...args);
      if (response.status === 404 && own4 === client2 && epoch === transportEpoch && live() && selected) {
        transportEpoch++;
        own4.setEnabled(false);
        client2 = makeClient();
        model = { status: "unavailable", data: null };
        render();
      }
      return response;
    }, onChange: (value) => {
      if (own4 !== client2) return;
      model = value;
      if (live() && selected) render();
    } });
    return own4;
  }
  client2 = makeClient();
  function svgNode(tag, attributes, text) {
    const n = doc2.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attributes || {})) n.setAttribute(k, String(v));
    if (text !== void 0) n.textContent = text;
    return n;
  }
  function chart(data) {
    const chart2 = el("div", void 0, "item-hour-chart"), help = el("p", "Hover a point, or focus the chart and use Left/Right arrows. Points use the latest retained version of each source bucket once; gaps and null fields are not zero.", "item-hour-chart-help"), tip = el("p", "No point selected.", "item-hour-tooltip");
    tip.setAttribute("role", "status");
    tip.setAttribute("aria-live", "polite");
    const p = historyPlotModel(data);
    if (!data.rows.length || p.max === 0) {
      chart2.append(el("p", "No plottable source medians in this retained selection. Missing fields are not zero; any exact values remain in the table and CSV.", "item-hour-context"));
      return chart2;
    }
    const W = Math.max(320, Math.min(960, Math.round(container.clientWidth || 760))), H = 360, L = 85, R = 22, T = 48, B = 105, plotW = W - L - R, plotH = H - T - B, center = (L + W - R) / 2;
    const svg = svgNode("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", tabindex: 0, "aria-label": "Whole-item hourly medians: source-labelled sold and seen asking; no quality-matched history" });
    chart2.append(svg, help, tip);
    svg.append(svgNode("title", {}, "Retained whole-item hourly aggregate medians"), svgNode("text", { x: center, y: 20, "text-anchor": "middle", class: "item-hour-axis-title" }, "Price (mesos / source unit)"));
    const first = p.first ?? 0, last = p.last ?? first, span = last - first || 3600, x = (epoch) => L + (last === first ? 0.5 : (epoch - first) / span) * plotW, y = (value) => T + plotH * (1 - value / (p.max || 1));
    for (let i = 0; i <= 4; i++) {
      const at = T + plotH * i / 4, n = p.max * (1 - i / 4);
      svg.append(svgNode("line", { x1: L, x2: W - R, y1: at, y2: at, class: "item-hour-grid" }), svgNode("text", { x: L - 9, y: at + 5, "text-anchor": "end", class: "item-hour-tick" }, new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n)));
    }
    const ticks = first === last ? 1 : W < 480 ? 2 : 4;
    for (let i = 0; i < ticks; i++) {
      const epoch = ticks === 1 ? first : first + Math.round((last - first) * i / (ticks - 1)), at = x(epoch), date = parts(new Date(epoch * 1e3).toISOString(), zone2), anchor = ticks === 1 ? "middle" : i === 0 ? "start" : i === ticks - 1 ? "end" : "middle";
      svg.append(svgNode("line", { x1: at, x2: at, y1: T, y2: H - B, class: "item-hour-grid item-hour-grid-vertical" }), svgNode("line", { x1: at, x2: at, y1: H - B, y2: H - B + 6, class: "item-hour-tick-line" }), svgNode("text", { x: at, y: H - B + 25, "text-anchor": anchor, class: "item-hour-tick" }, `${date.month} ${date.day}`), svgNode("text", { x: at, y: H - B + 45, "text-anchor": anchor, class: "item-hour-tick" }, `${date.hour}:${date.minute}`));
    }
    svg.append(svgNode("text", { x: center, y: H - B + 76, "text-anchor": "middle", class: "item-hour-axis-title" }, "Source hour (" + zone2 + ")"));
    const targets = [];
    for (const s of p.series) {
      let previous = null;
      for (const point of s.points) {
        if (point.value === null) {
          previous = null;
          continue;
        }
        if (previous && point.epoch - previous.epoch === 3600) svg.append(svgNode("line", { x1: x(previous.epoch), y1: y(previous.value), x2: x(point.epoch), y2: y(point.value), stroke: s.color, "stroke-width": 2, class: "item-hour-series-line" }));
        const circle = svgNode("circle", { cx: x(point.epoch), cy: y(point.value), r: 4, fill: s.color, "data-history-series": s.key, "data-history-epoch": point.epoch, "data-history-raw": point.raw }), text = `${s.label}: ${historyMoney(point.raw)} mesos. Source bucket: ${historyClock(new Date(point.epoch * 1e3).toISOString(), zone2)}. Original retrieval: ${historyClock(point.retrievedAt, zone2)}. Exact source price: ${point.raw}.`, show = () => {
          for (const t of targets) t.node.classList.remove("is-inspected");
          circle.classList.add("is-inspected");
          tip.textContent = text;
        };
        circle.append(svgNode("title", {}, text));
        circle.addEventListener("mouseenter", show);
        circle.addEventListener("click", show);
        svg.append(circle);
        targets.push({ node: circle, show });
        previous = point;
      }
    }
    let chosen = -1;
    svg.addEventListener("keydown", (event) => {
      if (!["ArrowLeft", "ArrowRight"].includes(event.key) || !targets.length) return;
      event.preventDefault();
      chosen = (chosen + (event.key === "ArrowRight" ? 1 : -1) + targets.length) % targets.length;
      targets[chosen].show();
    });
    const legend = el("div", void 0, "item-hour-legend");
    for (const s of p.series) {
      const n = el("span", s.label);
      n.style.color = s.color;
      legend.append(n);
    }
    chart2.append(legend, el("p", "Plotted coordinates use approximate numeric scale; hover shows one decimal and the exact source string. " + (p.omitted ? `${count(p.omitted)} values outside the chart numeric range remain in the table and CSV.` : ""), "item-hour-context"));
    return chart2;
  }
  function table(data) {
    const details = el("details", void 0, "item-hour-inspection");
    details.open = false;
    details.append(el("summary", "Inspect source rows and retained revisions"));
    const modes = el("div", void 0, "item-hour-table-modes");
    for (const [value, label] of [[false, "Latest version per hour"], [true, "All retained revisions"]]) {
      const b = el("button", label);
      b.type = "button";
      b.setAttribute("aria-pressed", String(allRevisions === value));
      b.addEventListener("click", () => {
        allRevisions = value;
        page = 0;
        renderTable();
      });
      modes.append(b);
    }
    details.append(modes);
    const feedback = el("p", void 0, "item-hour-table-feedback"), wrap = el("div", void 0, "item-hour-table-wrap");
    wrap.tabIndex = 0;
    wrap.setAttribute("role", "region");
    wrap.setAttribute("aria-label", "Hourly source rows, horizontally scrollable");
    const pager = el("div", void 0, "item-hour-pager"), prev = el("button", "Previous 25"), next = el("button", "Next 25"), pageText = el("span"), csv = el("button", "Download exact CSV");
    for (const b of [prev, next, csv]) b.type = "button";
    prev.addEventListener("click", () => {
      page--;
      renderTable();
    });
    next.addEventListener("click", () => {
      page++;
      renderTable();
    });
    csv.addEventListener("click", () => {
      const text = historyCsv(data, allRevisions), filename = `item-1082002-whole-hour-${allRevisions ? "revisions" : "latest"}.csv`;
      if (download) {
        download(text, filename);
        return;
      }
      const url = win.URL.createObjectURL(new win.Blob([text], { type: "text/csv;charset=utf-8" })), a = el("a");
      a.href = url;
      a.download = filename;
      a.click();
      win.setTimeout(() => win.URL.revokeObjectURL(url), 0);
    });
    pager.append(prev, pageText, next, csv);
    details.append(feedback, wrap, pager);
    function renderTable() {
      const records = allRevisions ? data.revisions : data.rows, pages = Math.max(1, Math.ceil(records.length / 25));
      page = Math.max(0, Math.min(page, pages - 1));
      for (const b of modes.children) b.setAttribute("aria-pressed", String(b.textContent === "All retained revisions" === allRevisions));
      feedback.textContent = allRevisions ? "Each retained version is shown separately. Revisions overlap; their bundle/unit/listing counts must not be added." : "One latest retained version per source hour. Missing hours are not zero.";
      const t = el("table"), head = el("thead"), tr = el("tr"), tbody = el("tbody");
      t.append(el("caption", allRevisions ? "Retained revisions \u2014 overlapping observations" : "Latest whole-item source buckets"), head, tbody);
      head.append(tr);
      for (const name of ["Source bucket hour", "Source-labelled sold median / AVG", "Reported bundles / units", "Seen asking median / listings", "Original retrieval", "Revision"]) {
        const th = el("th", name);
        th.scope = "col";
        tr.append(th);
      }
      for (const r of records.slice(page * 25, page * 25 + 25)) {
        const row = el("tr");
        row.dataset.revisionOrder = String(r.revisionOrder);
        for (const text of [historyClock(r.hour.providerBucketTimestampUtc, zone2), `${historyMoney(r.hour.sold?.median_unit_price)} / ${historyMoney(r.hour.sold?.avg_unit_price)}`, r.hour.sold ? `${count(r.hour.sold.reportedBundles)} / ${count(r.hour.sold.reportedUnits)}` : "Unknown", `${historyMoney(r.hour.seen?.median_unit_price)} / ${r.hour.seen ? count(r.hour.seen.reportedListingCount) : "Unknown"}`, historyClock(r.originalRetrievedAt, zone2), `${r.revisionOrder} \xB7 ${r.latest ? "latest" : "superseded"}`]) row.append(el("td", text));
        row.title = "Exact source values remain in CSV; bucket " + r.hour.providerBucketTimestampUtc + "; original retrieval " + r.originalRetrievedAt;
        tbody.append(row);
      }
      if (!records.length) {
        const row = el("tr"), td = el("td", "No retained source buckets in this snapshot.");
        td.colSpan = 6;
        row.append(td);
        tbody.append(row);
      }
      wrap.replaceChildren(t);
      pageText.textContent = `Page ${count(page + 1)} of ${count(pages)}`;
      prev.disabled = page === 0;
      next.disabled = page + 1 === pages;
    }
    renderTable();
    return details;
  }
  function render() {
    if (!live() || !selected) return;
    body.hidden = false;
    body.replaceChildren();
    if (itemId !== FINITE_HISTORY_ITEM_ID) {
      body.append(el("p", "Hourly history unavailable for this item. The finite preview covers only 1082002 Steel Fingerless Gloves.", "item-hour-status"));
      return;
    }
    const title = el("h2", "Hourly whole-item price history"), identity2 = el("h3", NAME + " \xB7 1082002"), status = el("p", model.status === "loading" ? "Checking this site\u2019s retained hourly snapshot\u2026" : model.status === "ready" ? "Validated finite snapshot; retrieval is not trade time." : model.data ? "Retained snapshot; original retrieval is unchanged." : "No validated hourly snapshot is published for this item. Other price evidence remains separate.", "item-hour-status");
    status.setAttribute("role", "status");
    status.dataset.mode = model.status;
    body.append(title, identity2, status);
    body.append(el("p", "Whole-item aggregates with unknown roll identity. Current ATT, stat, slot and upgrade filters above do not apply. No matched-quality history or individual transactions are inferred.", "item-hour-context"));
    const data = model.data;
    if (!data) return;
    const clock3 = el("p", "Original included retrieval: " + historyClock(data.latestOriginalRetrievedAt, zone2) + " \xB7 underlying observation and individual sale times unknown.", "item-hour-original-clock");
    clock3.dataset.rawDate = "true";
    clock3.title = data.latestOriginalRetrievedAt ?? "Unknown";
    body.append(clock3, el("p", `${count(data.rows.length)} retained source hours \xB7 ${count(data.revisions.length)} separately retained versions \xB7 0 qualified individual trades. Bucket completion and physical stack conversion are unverified.`, "item-hour-context"), chart(data), table(data));
    const credit = el("a", "Hourly aggregate source: MapleStory Market \u2197");
    credit.href = data.source.creditUrl;
    credit.rel = "noopener noreferrer";
    credit.target = "_blank";
    body.append(credit);
  }
  async function setEnabled(value) {
    if (destroyed) return;
    if (value === true && (!live() || doc2.body.dataset.previewControlsLocked === "true")) return;
    transportEpoch++;
    selected = value === true;
    toggle.textContent = "Hourly whole-item history: " + (selected ? "On" : "Off");
    toggle.setAttribute("aria-pressed", String(selected));
    client2.setEnabled(selected && itemId === FINITE_HISTORY_ITEM_ID);
    if (!selected) {
      body.replaceChildren();
      body.hidden = true;
      return;
    }
    page = 0;
    allRevisions = false;
    render();
    if (itemId === FINITE_HISTORY_ITEM_ID) await client2.select(itemId);
  }
  toggle.addEventListener("click", () => void setEnabled(!selected));
  const resize = () => {
    if (live() && selected && model.data) render();
  };
  win.addEventListener("resize", resize);
  return Object.freeze({ element: section, get enabled() {
    return selected;
  }, setEnabled, updateTimezone(value) {
    zone2 = safeZone(value);
    if (live() && selected) render();
  }, destroy() {
    destroyed = true;
    client2.setEnabled(false);
    win.removeEventListener("resize", resize);
    section.remove();
  }, stats: () => client2.stats() });
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
var hourHistory = null;
var lastId = null;
var latest = null;
var identityEpoch = 0;
var refreshTimer = null;
var refreshFlight = null;
var refreshEpoch = 0;
var started = false;
var pausedRead = null;
var zone = () => doc.getElementById("display-timezone")?.value || "UTC";
var make = (tag, text) => {
  const n = doc.createElement(tag);
  if (text !== void 0) n.textContent = text;
  return n;
};
var validId = (id2) => Number.isSafeInteger(id2) && id2 > 0 && id2 <= 999999999;
var client = createItemReferenceClient({ fetcher: (...args) => fetch(...args), enabled: available, isEnabled: () => enabled });
var discovery = createSearchIdentityBridge({ fetcher: (...args) => fetch(...args), enabled: available, isEnabled: () => enabled });
var visibleOnline = () => !doc.hidden && navigator.onLine !== false;
function sameItemRoute() {
  try {
    return location.hash.startsWith("#item/") && decodeURIComponent(location.hash.slice(6).split(/[?&]/)[0]) === latest?.slug;
  } catch {
    return false;
  }
}
var current = () => available && enabled && host && life && validId(lastId) && sameItemRoute();
function clearRefreshTimer() {
  if (refreshTimer !== null) clearTimeout(refreshTimer);
  refreshTimer = null;
}
function scheduleRefresh() {
  if (!current() || !visibleOnline() || client.diagnostic(lastId).blocked) {
    clearRefreshTimer();
    return;
  }
  if (refreshTimer !== null) return;
  const delay = Math.max(6e4, client.diagnostic(lastId).retryAt - Date.now());
  const epoch = refreshEpoch, id2 = lastId, ownLife = life;
  const timer = setTimeout(() => {
    if (refreshTimer !== timer || epoch !== refreshEpoch || life !== ownLife || lastId !== id2) return;
    refreshTimer = null;
    void refreshCurrentItem();
  }, delay);
  refreshTimer = timer;
}
function pauseRefresh() {
  clearRefreshTimer();
  refreshEpoch++;
  refreshFlight = null;
  life?.pause();
  if (validId(lastId)) pausedRead = { id: lastId, promise: client.cancelItem(lastId) };
}
function refreshCurrentItem() {
  if (!current()) return Promise.resolve();
  if (!visibleOnline()) {
    pauseRefresh();
    return Promise.resolve();
  }
  if (client.diagnostic(lastId).blocked) return Promise.resolve();
  if (refreshFlight) return refreshFlight.promise;
  const ownLife = life, id2 = lastId, epoch = refreshEpoch, task = {};
  task.promise = (async () => {
    try {
      if (pausedRead?.id === id2) await pausedRead.promise;
      if (epoch !== refreshEpoch || life !== ownLife || lastId !== id2 || !current() || !visibleOnline()) return;
      if (!started) {
        started = true;
        await ownLife.show(id2);
      } else await ownLife.refresh();
    } finally {
      if (refreshFlight === task) refreshFlight = null;
      if (epoch === refreshEpoch && life === ownLife) scheduleRefresh();
    }
  })();
  refreshFlight = task;
  return task.promise;
}
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
  pauseRefresh();
  started = false;
  hourHistory?.destroy();
  hourHistory = null;
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
    hourHistory?.updateTimezone(zone());
    scheduleRefresh();
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
    try {
      const value = await client.loadItem(query);
      status.dataset.mode = value.mode;
      return value.data;
    } finally {
      doc.dispatchEvent(new Event("astrapiitemcache"));
    }
  }, getTimezone: zone, spriteMap: { ...args.spriteMap, ...Object.fromEntries(rows().filter((r) => r.sprite).map((r) => [r.itemId, r.sprite])) }, onStatus: (value, meta = {}) => {
    const state = client.state(id2), d = client.diagnostic(id2), reason = meta.reason || d.reason, retained = value === "retained" || value === "shown" && state?.mode === "retained";
    status.dataset.status = value;
    status.dataset.reason = reason || "";
    if (value === "access_denied" || value === "unavailable") status.dataset.mode = value;
    else if (retained) status.dataset.mode = "retained";
    const reasons = { not_found: "This item is not in the currently published collection.", generation_changed: "The item generation changed during the bounded check.", invalid: "The new item response failed validation.", timeout: "The own-site check timed out.", unavailable: "The own-site check failed.", read_capacity: "The bounded item reader is busy." };
    let text = value === "access_denied" ? "Item access unavailable; prior panel withdrawn. After access is restored, turn Item API details Off and On to retry." : value === "paused" ? "Item checks paused while hidden or offline; original retrieval is unchanged." : value === "loading" ? meta.hasData ? "Checking this site\u2019s cached item reference; displayed values keep their original retrieval\u2026" : "Reading this site\u2019s cached item reference\u2026" : retained ? "Retained item reference; original retrieval preserved. " + (reasons[reason] || "The latest check did not supply a replacement.") : value === "shown" ? d.partial ? "Separate item reference; some source fields are unavailable. Retrieval is not trade time." : "Separate item reference; retrieval is not trade time." : value === "unavailable" ? "No validated item reference is connected. " + (reasons[reason] || "") + " Daily and other-source evidence remain separate." : "";
    status.textContent = (doc.body.dataset.itemApiSynthetic === "true" ? "SYNTHETIC OWN-SITE FIXTURE \xB7 " : "") + text;
  } });
  void refreshCurrentItem();
  const ownHost = host;
  hourHistory = mountItemHistoryPreview(host, { itemId: id2, timezone: zone(), parentActive: () => available && enabled, isCurrent: () => {
    try {
      return host === ownHost && lastId === id2 && decodeURIComponent(location.hash.slice(6).split(/[?&]/)[0]) === latest?.slug && resolveId(latest?.record, latest?.slug) === id2;
    } catch {
      return false;
    }
  } });
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
var api = { available, peekCachedReferences: () => client.peekCachedReferences(), get enabled() {
  return enabled;
}, async setEnabled(value) {
  if (!available) return;
  const next = value === true;
  if (next !== enabled) identityEpoch++;
  if (next && !enabled) client.resetAccess();
  enabled = next;
  if (button) {
    button.textContent = "Item API details: " + (enabled ? "On" : "Off");
    button.setAttribute("aria-pressed", String(enabled));
  }
  if (!enabled) {
    hide();
    doc.dispatchEvent(new CustomEvent("astrapiitemidentities"));
    doc.dispatchEvent(new Event("astrapiitemcache"));
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
doc.getElementById("display-timezone")?.addEventListener("change", () => {
  life?.timezoneChanged(zone());
  hourHistory?.updateTimezone(zone());
});
window.addEventListener("hashchange", () => {
  if (!location.hash.startsWith("#item/") || host && !sameItemRoute()) hide();
});
function resumeRefresh() {
  if (current() && visibleOnline()) void refreshCurrentItem();
}
doc.addEventListener("visibilitychange", () => {
  if (visibleOnline()) resumeRefresh();
  else pauseRefresh();
});
window.addEventListener("online", resumeRefresh);
window.addEventListener("offline", pauseRefresh);
doc.getElementById("refresh")?.addEventListener("click", resumeRefresh);
doc.addEventListener("astramarketsnapshot", () => {
  if (enabled) void loadIdentities().catch(() => {
  });
});

})();
