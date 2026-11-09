'use strict';

;
/* Astra source: inventory-preview.js */
try {
(() => {
'use strict';
(() => {
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
  async function makePublicItemReference(dto, generation, dtoHash) {
    const value = { schemaVersion: 1, kind: "api_item_price_reference", itemId: dto.itemId, projectionGeneration: generation, dtoSha256: dtoHash, sourceCapturedAt: dto.source.retrievedAt, sourceObservedAt: null, reportedWindowDays: 3, exactWindowBoundsKnown: false, qualifiedIndividualTrades: 0, sourceCreditUrl: `https://maplestory.market/items/${dto.itemId}?ref=v6kkdvp6`, item: dto };
    return validatePublicItemReference(value);
  }

  // ui-src/inventory-manual/inventory.mjs
  var CAPS = /* @__PURE__ */ new WeakMap();
  var STAT = /^(?:[0-7]|9|1[0-6])$/;
  var need = (v, m) => {
    if (!v) throw TypeError(m);
  };
  function freeze(v) {
    if (v && typeof v === "object") {
      Object.values(v).forEach(freeze);
      Object.freeze(v);
    }
    return v;
  }
  function amount(s) {
    need(typeof s === "string" && s.length <= 180 && /^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,32})?$/.test(s), "decimal");
    const [a, b = ""] = s.split(".");
    return { n: BigInt(a + b), d: 10n ** BigInt(b.length) };
  }
  var mul = (a, b) => ({ n: a.n * b.n, d: a.d * b.d });
  var add = (a, b) => ({ n: a.n * b.d + b.n * a.d, d: a.d * b.d });
  var sub = (a, b) => ({ n: a.n * b.d - b.n * a.d, d: a.d * b.d });
  function displayMoney(v, places = 1) {
    if (v === null) return "Unknown";
    need(Number.isSafeInteger(places) && places >= 0 && places <= 6, "places");
    const sign = v.n < 0n ? "-" : "", n = v.n < 0n ? -v.n : v.n, p = 10n ** BigInt(places), scaled = (n * p * 2n + v.d) / (2n * v.d), s = scaled.toString().padStart(places + 1, "0"), whole = places ? s.slice(0, -places) : s;
    return sign + whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (places ? "." + s.slice(-places) : "");
  }
  async function createReferenceCache(input) {
    const refs = structuredClone(input);
    need(Array.isArray(refs) && refs.length <= 200, "reference_bound");
    need(new TextEncoder().encode(JSON.stringify(refs)).length <= 2e6, "reference_total_bytes");
    const byId = /* @__PURE__ */ new Map(), contexts = /* @__PURE__ */ new Map();
    for (const value of refs) {
      const r = await validatePublicItemReference(value);
      need(!byId.has(r.itemId), "duplicate_reference");
      const context2 = JSON.stringify([r.sourceCapturedAt, r.item.source.rawBodySha256, r.item.source.window]);
      need(!contexts.has(r.projectionGeneration) || contexts.get(r.projectionGeneration) === context2, "generation_context");
      contexts.set(r.projectionGeneration, context2);
      for (const price of [r.item.aggregate.sold?.medianUnitPrice, ...r.item.variants.reportedStats.map((v) => v.reference?.unitPrice)]) if (price !== null && price !== void 0) amount(price);
      byId.set(r.itemId, freeze(r));
    }
    const cap = Object.freeze({ size: byId.size });
    CAPS.set(cap, byId);
    return cap;
  }
  function sanitizeEntries(input) {
    const rows = structuredClone(input);
    need(Array.isArray(rows) && rows.length <= 200, "inventory_bound");
    const seen = /* @__PURE__ */ new Set(), allowed = ["entryId", "itemId", "quantity", "unitFactor", "unitConfirmed", "tradeable", "kind", "upgrades", "slots", "stats", "reportedSignatureAcknowledged"];
    for (const r of rows) {
      need(r && Object.keys(r).sort().join(",") === allowed.slice().sort().join(","), "entry_fields");
      need(/^row-[1-9][0-9]{0,5}$/.test(r.entryId) && !seen.has(r.entryId), "entry_identity");
      seen.add(r.entryId);
      need(Number.isSafeInteger(r.itemId) && r.itemId > 0 && r.itemId <= 999999999, "item_id");
      need(r.quantity === null || typeof r.quantity === "string" && /^[1-9][0-9]{0,8}$/.test(r.quantity), "quantity");
      need(r.unitFactor === null || typeof r.unitFactor === "string" && r.unitFactor.length <= 20 && amount(r.unitFactor).n > 0n, "unit_factor");
      need(typeof r.unitConfirmed === "boolean" && typeof r.reportedSignatureAcknowledged === "boolean", "confirmation");
      need(["unknown", "yes", "no"].includes(r.tradeable) && ["unknown", "commodity", "equipment"].includes(r.kind), "entry_state");
      for (const k of ["upgrades", "slots"]) need(r[k] === null || Number.isSafeInteger(r[k]) && r[k] >= 0 && r[k] <= 100, "slots");
      if (r.stats !== null) {
        need(r.stats && typeof r.stats === "object" && !Array.isArray(r.stats) && Object.keys(r.stats).length <= 17, "stats");
        for (const [k, v] of Object.entries(r.stats)) need(STAT.test(k) && Number.isSafeInteger(v) && Math.abs(v) <= 1e6, "stat");
      }
    }
    return freeze(rows);
  }
  var signature = (s) => Object.entries(s).sort((a, b) => Number(a[0]) - Number(b[0])).map(([k, v]) => k + "=" + v).join(",");
  function selection(entry, dto) {
    if (entry.kind === "commodity") {
      const s = dto.aggregate.sold;
      if (s?.medianUnitPrice !== null && s?.medianUnitPrice !== void 0 && s.reportedSalesCount >= 5) return { lexeme: s.medianUnitPrice, count: s.reportedSalesCount, basis: "item-level reported sale median; quality mix possible" };
      return null;
    }
    if (entry.kind !== "equipment" || entry.upgrades === null || entry.slots === null || entry.stats === null || !entry.reportedSignatureAcknowledged) return null;
    const matches = dto.variants.reportedStats.filter((v) => v.successfulUpgrades === entry.upgrades && v.slotsLeft === entry.slots && signature(v.reportedStats) === signature(entry.stats) && v.reference?.basis === "sold" && v.reference?.scope === "stats" && v.reference?.isNearFallback === false && v.reference.reportedSamples >= 5 && v.reference.unitPrice !== null);
    if (matches.length !== 1) return null;
    const r = matches[0].reference;
    return { lexeme: r.unitPrice, count: r.reportedSamples, basis: "reported-signature source reference; aggregation/complete quality unverified; some stats may be ignored" };
  }
  function evaluateInventory(input, cache, { sellerFeePercent = null, fixedFeePerRow = null } = {}) {
    const rows = sanitizeEntries(input), refs = CAPS.get(cache);
    need(refs, "owned_reference_cache");
    let percent = null, fixed = null;
    if (sellerFeePercent !== null) {
      percent = amount(sellerFeePercent);
      need(percent.n <= percent.d * 100n, "fee_percent");
    }
    if (fixedFeePerRow !== null) fixed = amount(fixedFeePerRow);
    const result = rows.map((entry) => {
      const r = refs.get(entry.itemId), out = { entryId: entry.entryId, itemId: entry.itemId, name: r?.item.identity.name ?? "Item #" + entry.itemId, status: "unknown", gross: null, net: null, source: r ? { capturedAt: r.sourceCapturedAt, sourceObservedAt: null, windowDays: 3, exactBoundsKnown: false, generation: r.projectionGeneration, credit: r.sourceCreditUrl } : null, basis: null, reportedCount: null };
      if (entry.tradeable === "no") {
        out.status = "untradeable_excluded";
        return out;
      }
      if (entry.tradeable !== "yes") {
        out.status = "tradeability_unknown";
        return out;
      }
      if (entry.quantity === null) {
        out.status = "quantity_unknown";
        return out;
      }
      if (!entry.unitConfirmed || entry.unitFactor === null) {
        out.status = "unit_conversion_unknown";
        return out;
      }
      if (!r) {
        out.status = "reference_unavailable";
        return out;
      }
      const s = selection(entry, r.item);
      if (!s || amount(s.lexeme).n === 0n) {
        out.status = entry.kind === "equipment" ? "reported_variant_unavailable" : "qualified_reference_unavailable";
        return out;
      }
      out.gross = mul(mul(amount(s.lexeme), amount(entry.quantity)), amount(entry.unitFactor));
      out.status = "dated_reference_estimate";
      out.basis = s.basis;
      out.reportedCount = s.count;
      if (percent !== null) {
        out.net = mul(out.gross, { n: 100n * percent.d - percent.n, d: 100n * percent.d });
        if (fixed !== null) out.net = sub(out.net, fixed);
      }
      return out;
    });
    const valued = result.filter((r) => r.gross !== null), gens = new Set(valued.map((r) => r.source.generation)), same = gens.size === 1;
    let gross = null, net = null;
    if (valued.length && same) {
      gross = valued.reduce((s, r) => add(s, r.gross), { n: 0n, d: 1n });
      if (valued.every((r) => r.net !== null)) net = valued.reduce((s, r) => add(s, r.net), { n: 0n, d: 1n });
    }
    const ordered = same ? [...valued].sort((a, b) => {
      const d = a.gross.n * b.gross.d - b.gross.n * a.gross.d;
      return d === 0n ? a.itemId - b.itemId : d > 0n ? -1 : 1;
    }) : [];
    const suggestions = [];
    if (result.length > valued.length) suggestions.push("Review unknown quantities, tradeability, unit conversions and variants before treating this as a complete inventory valuation.");
    if (!same && valued.length) suggestions.push("References span different generations: per-item estimates remain dated, but no common-snapshot subtotal/ranking is produced.");
    if (ordered.length) suggestions.push("Largest included holding by dated reference value: " + ordered[0].name + ". This is not a sell recommendation or executable quote.");
    return freeze({ rows: result, coverage: { entries: result.length, valued: valued.length, excludedOrUnknown: result.length - valued.length }, subtotal: { status: gross === null ? "unavailable" : valued.length === result.length ? "complete_declared_tradeable_reference_subset" : "priced_tradeable_subset_only", gross, net }, orderedEntryIds: ordered.map((r) => r.entryId), suggestions, individualTradesVerified: 0, inventoryUserDeclared: true });
  }
  var inventoryPolicy = Object.freeze({ maxEntries: 200, maxReferenceItems: 200, maxImages: 10, maxImageBytes: 8e6, maxBatchBytes: 32e6, remoteProcessing: false, ocrImplemented: false, ignLookupImplemented: false, priceBasis: "dated qualified references, not executable offers", unitConversions: "user explicitly confirmed", saveFields: "manual entries only; no screenshot/filename/EXIF/IGN" });

  // ui-src/inventory-manual/reference-cache-adapter.mjs
  var need2 = (v, c) => {
    if (!v) throw TypeError(c);
  };
  var enc2 = new TextEncoder();
  var H = /^[a-f0-9]{64}$/;
  var freeze2 = (v) => {
    if (v && typeof v === "object") {
      for (const x of Object.values(v)) freeze2(x);
      Object.freeze(v);
    }
    return v;
  };
  var exact = (v, keys) => need2(v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).sort().join("|") === keys.split(" ").sort().join("|"), "adapter_fields");
  var inventoryAdapterPolicy = Object.freeze({ defaultEnabled: false, maxEntries: 200, maxReferenceItems: 200, maxInputBytes: 2e6, maxPendingImports: 2, noPriceRequests: true, readBrowserCache: false, readTokens: false, screenshotOrIgnProcessing: false, perCopyQualityVerified: false });
  function context(r, mode) {
    return freeze2({ capturedAt: r.sourceCapturedAt, sourceObservedAt: null, window: structuredClone(r.item.source.window), sourceWindowSemantics: r.item.source.sourceWindowSemantics, generation: r.projectionGeneration, dtoSha256: r.dtoSha256, rawBodySha256: r.item.source.rawBodySha256, credit: r.sourceCreditUrl, cacheMode: mode, cacheModeAuthority: "caller_supplied_not_independent_transport_verification" });
  }
  var hasVariants = (dto) => dto.variants.reportedStats.length > 0 || dto.variants.successfulScrolls.length > 0 || dto.variants.attackPools.length > 0;
  function evidence(r, mode) {
    const a = r.item.aggregate;
    return freeze2({ itemId: r.itemId, source: context(r, mode), sale: a.sold ? { kind: "source_reported_sale_aggregate_not_individual_trades", medianUnitPriceLexeme: a.sold.medianUnitPrice, averageUnitPriceLexeme: a.sold.averageUnitPrice, reportedSalesCount: a.sold.reportedSalesCount, reportedUnitCount: a.sold.reportedUnitCount, countsAreInventoryQuantity: false } : null, asking: a.asking ? { kind: "asking_median_not_lowest_or_executable_quote", medianUnitPriceLexeme: a.asking.medianUnitPrice, reportedListingCount: a.asking.reportedListingCount, reportedSellerCount: a.asking.reportedSellerCount, currentAvailabilityVerified: false } : null, publisherReference: a.reference ? { kind: "separate_publisher_reference_not_used_as_sale_fallback", ...structuredClone(a.reference) } : null, hasVariantEvidence: hasVariants(r.item), qualityConstant: false, completeRollVerified: false, unitConversionVerified: false });
  }
  async function createManualInventoryOwnCacheAdapter({ enabled = false, isEnabled = () => true } = {}) {
    need2(typeof isEnabled === "function", "adapter_options");
    const emptyCache = enabled === true ? await createReferenceCache([]) : null;
    let epoch = 0, pending = 0, revision = 0, entries = Object.freeze([]), references = /* @__PURE__ */ new Map(), statuses = /* @__PURE__ */ new Map(), cache = emptyCache;
    const active = () => {
      try {
        return enabled === true && isEnabled() === true;
      } catch {
        return false;
      }
    };
    function clear() {
      epoch++;
      entries = Object.freeze([]);
      references = /* @__PURE__ */ new Map();
      statuses = /* @__PURE__ */ new Map();
      cache = emptyCache;
      revision++;
      return { status: "cleared", localRevision: revision };
    }
    async function replace(input, kind, mode) {
      if (!active()) return { status: "disabled", applied: false };
      if (kind !== "records") need2(["validated_cache", "retained"].includes(mode), "cache_mode");
      if (pending >= 2) return { status: "import_capacity", applied: false };
      pending++;
      const ticket = ++epoch;
      try {
        const owned = structuredClone(input);
        need2(Array.isArray(owned) && owned.length <= 200 && enc2.encode(JSON.stringify(owned)).length <= 2e6, "reference_snapshot_bound");
        const next = /* @__PURE__ */ new Map(), state = /* @__PURE__ */ new Map(), supported = [], generationContexts = /* @__PURE__ */ new Map();
        const previous = references;
        for (const value of owned) {
          let r, refMode = mode;
          if (kind === "records") {
            exact(value, "data mode");
            need2(["validated_cache", "retained"].includes(value.mode), "cache_mode");
            refMode = value.mode;
            r = await validatePublicItemReference(value.data);
          } else if (kind === "reference") r = await validatePublicItemReference(value);
          else {
            exact(value, "item projectionGeneration dtoSha256");
            assertSafeItemDto(value.item);
            need2(typeof value.projectionGeneration === "string" && H.test(value.projectionGeneration) && typeof value.dtoSha256 === "string" && H.test(value.dtoSha256), "dto_context_required");
            r = await makePublicItemReference(value.item, value.projectionGeneration, value.dtoSha256);
          }
          if (ticket !== epoch || !active()) return { status: "discarded_after_clear_or_off", applied: false };
          need2(!next.has(r.itemId), "duplicate_reference");
          const prior = previous.get(r.itemId);
          need2(!prior || Date.parse(r.sourceCapturedAt) >= Date.parse(prior.data.sourceCapturedAt), "older_reference_snapshot");
          const cohort = JSON.stringify([r.sourceCapturedAt, r.item.source.rawBodySha256, r.item.source.window]);
          need2(!generationContexts.has(r.projectionGeneration) || generationContexts.get(r.projectionGeneration) === cohort, "generation_context");
          generationContexts.set(r.projectionGeneration, cohort);
          next.set(r.itemId, freeze2({ data: freeze2(r), mode: refMode }));
          let valid = true;
          try {
            await createReferenceCache([r]);
          } catch (e) {
            if (e instanceof TypeError && e.message === "decimal") {
              valid = false;
            } else throw e;
          }
          if (valid) {
            supported.push(r);
            state.set(r.itemId, "validated_reference");
          } else state.set(r.itemId, "validated_but_ledger_numeric_unavailable");
        }
        const nextCache = await createReferenceCache(supported);
        if (ticket !== epoch || !active()) return { status: "discarded_after_clear_or_off", applied: false };
        references = next;
        statuses = state;
        cache = nextCache;
        revision++;
        return freeze2({ status: "reference_snapshot_replaced", applied: true, referenceItems: next.size, valuationSupportedItems: supported.length, localRevision: revision, sourceClocksRenewed: false });
      } finally {
        pending--;
      }
    }
    function view(feeAssumptions = {}) {
      if (!active()) return freeze2({ status: "disabled", rows: [], coverage: { entries: 0, valued: 0, excludedOrUnknown: 0 }, subtotal: { status: "unavailable", gross: null, net: null }, sourceClocksRenewed: false });
      const fees = structuredClone(feeAssumptions), held = /* @__PURE__ */ new Map(), input = entries.map((e) => {
        const r = references.get(e.itemId);
        if (r && e.tradeable === "yes" && e.quantity !== null && e.unitConfirmed && e.unitFactor !== null) {
          if (e.kind === "commodity" && (hasVariants(r.data.item) || e.stats !== null || e.slots !== null || e.upgrades !== null || e.reportedSignatureAcknowledged)) {
            held.set(e.entryId, hasVariants(r.data.item) ? "variant_evidence_requires_equipment_review" : "declared_roll_fields_require_equipment_review");
            return { ...e, kind: "unknown" };
          }
          if (e.kind === "equipment" && e.stats !== null && Object.keys(e.stats).length === 0) {
            held.set(e.entryId, "reported_stats_unknown_or_empty");
            return { ...e, kind: "unknown" };
          }
        }
        return e;
      });
      const value = evaluateInventory(input, cache, fees);
      const declared = new Map(entries.map((e) => [e.entryId, e]));
      const rows = value.rows.map((row) => {
        const r = references.get(row.itemId), hold = held.has(row.entryId), manual = declared.get(row.entryId);
        return freeze2({ ...row, declaredQuantity: manual.quantity, declaredUnitFactor: manual.unitFactor, unitConversionUserConfirmed: manual.unitConfirmed, userDeclaredKind: manual.kind, ...hold ? { status: held.get(row.entryId) } : {}, referenceStatus: statuses.get(row.itemId) ?? "not_in_supplied_cache", evidence: r ? evidence(r.data, r.mode) : null, qualityConstant: false, completeRollVerified: false });
      });
      const unknown = rows.filter((r) => r.gross === null), byReason = {};
      for (const r of unknown) byReason[r.status] = (byReason[r.status] ?? 0) + 1;
      return freeze2({ status: "manual_cache_reference_estimates", rows, coverage: { entries: entries.length, valued: value?.coverage.valued ?? 0, excludedOrUnknown: unknown.length, suppliedReferenceItems: references.size, ledgerSupportedItems: [...statuses.values()].filter((x) => x === "validated_reference").length, unpricedByReason: byReason }, subtotal: value?.subtotal ?? { status: "unavailable", gross: null, net: null }, orderedEntryIds: value?.orderedEntryIds ?? [], suggestions: value?.suggestions ?? ["No supplied qualified local references; no inventory price requests are made."], individualTradesVerified: 0, inventoryUserDeclared: true, localReferenceRevision: revision, sourceClocksRenewed: false, referenceOrigin: "caller_supplied_production_contract_validated_not_independent_transport", policy: inventoryAdapterPolicy });
    }
    return Object.freeze({ get active() {
      return active();
    }, policy: inventoryAdapterPolicy, replaceCachedReferences: (values) => active() ? replace(values, "records", null) : Promise.resolve({ status: "disabled", applied: false }), replacePublicReferences: (values, options) => active() ? replace(values, "reference", options?.mode ?? "validated_cache") : Promise.resolve({ status: "disabled", applied: false }), replaceSafeDtos: (values, options) => active() ? replace(values, "dto", options?.mode ?? "validated_cache") : Promise.resolve({ status: "disabled", applied: false }), replaceEntries(values) {
      if (!active()) return { status: "disabled" };
      entries = sanitizeEntries(values);
      return { status: "manual_entries_replaced", entries: entries.length };
    }, appendReviewedEntries(values) {
      if (!active()) return { status: "disabled" };
      const owned = sanitizeEntries(values);
      entries = sanitizeEntries([...entries, ...owned]);
      return { status: "manual_entries_appended", entries: entries.length };
    }, getEntries: () => structuredClone(entries), view, clear, displayMoney, get pendingImports() {
      return pending;
    } });
  }

  // ui-src/item-api/reference-status.mjs
  var known = /* @__PURE__ */ new Set(["current", "ready", "shown", "validated", "accepted_cache", "validated_cache"]);
  function describeReferenceStatus({ capturedAt = null, status = "idle", hasData = false, available = true, retained = false, partial = false, visible = true, online = true, bandMinutes = 20, now = Date.now() } = {}) {
    const stamp = typeof capturedAt === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/.test(capturedAt) ? Date.parse(capturedAt) : NaN;
    const age = Number.isFinite(stamp) && Number.isFinite(now) ? now - stamp : null;
    let phase, tone = "amber", label2;
    if (status === "site_access" || status === "access_denied") {
      phase = "access_blocked";
      tone = "red";
      label2 = "Site access unavailable";
    } else if (status === "off" || status === "disabled" || status === "hidden") {
      phase = "off";
      label2 = "Reference display inactive";
    } else if (!visible || !online || status === "paused") {
      phase = "paused";
      label2 = hasData ? "Checks paused; original retrieval retained" : "Checks paused; no validated reference yet";
    } else if (status === "loading") {
      phase = "loading";
      label2 = hasData ? "Checking cache; displayed reference keeps its original retrieval" : "Awaiting a validated cache response";
    } else if (!hasData) {
      phase = status === "not_published" || status === "not_found" ? "not_published" : ["unavailable", "failure", "failed", "error"].includes(status) ? "unavailable" : "unverified";
      tone = phase === "unavailable" ? "red" : "amber";
      label2 = phase === "not_published" ? "Reference not published here" : phase === "unavailable" ? "No validated reference available" : "Reference not yet verified";
    } else if (retained || status === "retained" || ["unavailable", "failure", "failed", "error"].includes(status)) {
      phase = "retained";
      label2 = "Retained reference; original retrieval unchanged";
    } else if (age === null) {
      phase = "clock_unknown";
      label2 = "Retrieval clock unavailable; age unknown";
    } else if (age < 0) {
      phase = "clock_uncertain";
      label2 = "Capture clock ahead; retrieval age uncertain";
    } else if (!available) {
      phase = "unavailable";
      label2 = "Selected reference unavailable; missing values are not zero";
    } else if (partial && age <= bandMinutes * 6e4) {
      phase = "partial";
      label2 = "Partial item evidence; original retrieval retained";
    } else if (!known.has(status)) {
      phase = "unverified";
      label2 = "Reference state not yet verified";
    } else if (!Number.isFinite(bandMinutes) || bandMinutes <= 0) {
      phase = "clock_unknown";
      label2 = "Retrieval display band unavailable";
    } else if (age <= bandMinutes * 6e4) {
      phase = "recent";
      tone = "green";
      label2 = `Retrieved within ${bandMinutes}-minute display band; not verified fresh trades`;
    } else {
      phase = "aged";
      label2 = `Retrieval older than ${bandMinutes}-minute display band${partial ? "; partial item evidence remains incomplete" : ""}`;
    }
    return Object.freeze({ tone, phase, label: label2, capturedAt: Number.isFinite(stamp) ? capturedAt : null, ageMs: age, bandMinutes });
  }

  // ui-src/item-api/search-price-relation.mjs
  function qualifySearchPriceStatus(indicator, relation) {
    return relation?.pending && indicator.phase === "recent" ? { ...indicator, tone: "amber", phase: "publication_pending", label: "FAST price publication is separately dated" } : indicator;
  }
  function describeSearchPriceRelation(identity, itemId, capturedAt) {
    if (identity?.schemaVersion !== 2) return null;
    const source = identity.sourceSnapshots.find((s) => s.operation === "prices"), row = identity.rows.find((r) => r.itemId === itemId);
    if (!capturedAt) return { pending: false, label: "Identity membership is not a price; a current FAST price has not been verified for this selection." };
    if (!source || !row) return { pending: true, label: "No matching admitted identity membership is connected; the FAST reference remains separately dated." };
    if (Date.parse(source.capturedAt) < Date.parse(capturedAt)) return { pending: false, label: "The FAST price capture is newer than this identity membership snapshot; they remain independently versioned." };
    if (!row.memberships.some((m) => m.operation === "prices")) return { pending: true, label: "This known ID is absent from the latest published normalized prices membership. The FAST reference remains separately dated; membership does not verify stock or a current sale." };
    if (Date.parse(source.capturedAt) > Date.parse(capturedAt)) return { pending: true, label: "A newer normalized prices membership has been accepted. The displayed FAST reference keeps its older original retrieval until price publication catches up." };
    return { pending: false, label: source.capturedAt === capturedAt ? "Identity membership and FAST prices are independently versioned; equal capture clocks do not establish the same receipt." : "FAST prices and identity membership keep their separate original retrievals and publication versions." };
  }

  // ops/api-search-identity-contract.mjs
  var SEARCH_IDENTITY_PROFILE = "price_free_owned_membership_v2";
  var SEARCH_IDENTITY_ROUTE = "/api-search-identities/v2/";
  var SEARCH_IDENTITY_LIMITS = Object.freeze({ items: 1e4, pageRows: 128, pageBytes: 131072, rowBytes: 2048, pages: 128, collectionBytes: 8388608, manifestBytes: 65536 });
  var SEARCH_SOURCE_URLS = Object.freeze({ prices: "https://maplestory.market/api/prices", catalogue: "https://maplestory.market/api/items", overview: "https://maplestory.market/api/market/overview" });
  var SEARCH_OPERATIONS = Object.freeze(["prices", "catalogue", "overview"]);
  var HASH3 = /^[a-f0-9]{64}$/;
  var EPOCH = /^[a-z][a-z0-9-]{0,63}$/;
  var LOCAL = /^assets\/[A-Za-z0-9._-]+\.(?:png|webp|gif|svg)$/;
  var enc3 = new TextEncoder();
  var U8 = Uint8Array;
  var typed = Object.getPrototypeOf(Uint8Array.prototype);
  var typedBytes = Object.getOwnPropertyDescriptor(typed, "byteLength").get;
  var typedOffset = Object.getOwnPropertyDescriptor(typed, "byteOffset").get;
  var typedBuffer = Object.getOwnPropertyDescriptor(typed, "buffer").get;
  var typedKind = Object.getOwnPropertyDescriptor(typed, Symbol.toStringTag).get;
  var arrayBytes = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, "byteLength").get;
  var setBytes = Uint8Array.prototype.set;
  var SearchIdentityError = class extends Error {
    constructor(code) {
      super(code);
      this.name = "SearchIdentityError";
    }
  };
  function need3(ok, code = "identity_shape") {
    if (!ok) throw new SearchIdentityError(code);
  }
  function closed(v, keys) {
    need3(v !== null && typeof v === "object" && !Array.isArray(v));
    need3(Object.keys(v).sort().join("|") === [...keys].sort().join("|"));
    return v;
  }
  function integer2(v, min, max) {
    need3(Number.isSafeInteger(v) && v >= min && v <= max, "identity_integer");
    return v;
  }
  function identityHash(v) {
    need3(typeof v === "string" && HASH3.test(v), "identity_hash");
    return v;
  }
  function identityClock(v) {
    need3(typeof v === "string" && Number.isFinite(Date.parse(v)) && Date.parse(v) >= 0 && new Date(v).toISOString() === v, "identity_clock");
    return v;
  }
  function publicEpoch(v) {
    need3(typeof v === "string" && EPOCH.test(v), "identity_epoch");
    return v;
  }
  function identityByteLength(raw) {
    try {
      need3(typedKind.call(raw) === "Uint8Array", "identity_bytes");
      const buffer = typedBuffer.call(raw);
      arrayBytes.call(buffer);
      return typedBytes.call(raw);
    } catch {
      throw new SearchIdentityError("identity_bytes");
    }
  }
  function ownIdentityBytes(raw, max) {
    const n = identityByteLength(raw);
    need3(n > 0 && n <= max, "identity_bytes_bound");
    const result = new U8(n), view = new U8(typedBuffer.call(raw), typedOffset.call(raw), n);
    setBytes.call(result, view);
    return result;
  }
  var jsonBytes = (v) => enc3.encode(JSON.stringify(v));
  function validateIdentityRow(r) {
    closed(r, ["itemId", "name", "nameStatus", "sprite", "spriteStatus", "currentMemberships"]);
    integer2(r.itemId, 1, 999999999);
    need3(["unique_client_id", "unknown_client_id", "conflicting_client_id"].includes(r.nameStatus), "identity_name_status");
    need3(r.nameStatus === "unique_client_id" ? typeof r.name === "string" && r.name.trim().length > 0 && r.name.length <= 300 : r.name === null, "identity_name");
    need3(r.sprite === null ? r.spriteStatus === "unavailable" : r.spriteStatus === "reviewed_local" && typeof r.sprite === "string" && LOCAL.test(r.sprite), "identity_sprite");
    need3(Array.isArray(r.currentMemberships) && r.currentMemberships.length <= 3, "identity_memberships");
    let prior = -1;
    for (const op of r.currentMemberships) {
      const at = SEARCH_OPERATIONS.indexOf(op);
      need3(at > prior, "identity_membership_order");
      prior = at;
    }
    need3(jsonBytes(r).length <= SEARCH_IDENTITY_LIMITS.rowBytes, "identity_row_bound");
    return r;
  }
  function validateIdentitySources(sources, itemCount) {
    need3(Array.isArray(sources) && sources.length >= 1 && sources.length <= 3, "identity_sources");
    let prior = -1;
    for (const s of sources) {
      closed(s, ["operation", "sourceUrl", "capturedAt", "sourceObservedAt", "setSha256", "itemCount"]);
      const at = SEARCH_OPERATIONS.indexOf(s.operation);
      need3(at > prior, "identity_source_order");
      prior = at;
      need3(s.sourceUrl === SEARCH_SOURCE_URLS[s.operation] && s.sourceObservedAt === null, "identity_source");
      identityClock(s.capturedAt);
      identityHash(s.setSha256);
      integer2(s.itemCount, 0, itemCount);
    }
    need3(sources[0].operation === "prices", "identity_prices_required");
    return sources;
  }
  function metadata(items) {
    need3(Array.isArray(items) && items.length >= 1 && items.length <= 4, "identity_metadata");
    const seen = /* @__PURE__ */ new Set();
    for (const d of items) {
      closed(d, ["expectedSha256", "sourceUrl", "format"]);
      identityHash(d.expectedSha256);
      need3(["cash_client_catalog", "noncash_list"].includes(d.format) && d.sourceUrl === `https://maplestory.io/api/MCW/1/item/list?cashFilter=${d.format === "cash_client_catalog" ? "true" : "false"}&count=10000` && !seen.has(d.sourceUrl), "identity_metadata");
      seen.add(d.sourceUrl);
    }
    return items;
  }
  async function parseIdentityManifest(raw) {
    raw = ownIdentityBytes(raw, SEARCH_IDENTITY_LIMITS.manifestBytes);
    const m = parseStrictJson(raw);
    closed(m, ["schemaVersion", "kind", "profile", "publicationEpoch", "publicationRevision", "sourceCreditUrl", "identityMetadata", "spriteBindingsSha256", "sources", "admittedItemLimit", "itemCount", "pages", "indexHash"]);
    need3(m.schemaVersion === 2 && m.kind === "api_search_identity_manifest" && m.profile === SEARCH_IDENTITY_PROFILE && m.sourceCreditUrl === "https://maplestory.market/?ref=v6kkdvp6" && m.admittedItemLimit === 1e4, "identity_profile");
    publicEpoch(m.publicationEpoch);
    integer2(m.publicationRevision, 1, Number.MAX_SAFE_INTEGER);
    integer2(m.itemCount, 1, 1e4);
    metadata(m.identityMetadata);
    identityHash(m.spriteBindingsSha256);
    validateIdentitySources(m.sources, m.itemCount);
    identityHash(m.indexHash);
    need3(Array.isArray(m.pages) && m.pages.length >= 1 && m.pages.length <= 128, "identity_pages");
    let count = 0, last = 0, total = 0;
    for (const [i, d] of m.pages.entries()) {
      closed(d, ["page", "firstItemId", "lastItemId", "itemCount", "sha256", "bytes", "url"]);
      need3(d.page === i, "identity_page_order");
      integer2(d.firstItemId, last + 1, 999999999);
      integer2(d.lastItemId, d.firstItemId, 999999999);
      integer2(d.itemCount, 1, 128);
      integer2(d.bytes, 1, 131072);
      identityHash(d.sha256);
      need3(d.url === SEARCH_IDENTITY_ROUTE + d.sha256 + ".json", "identity_page_url");
      last = d.lastItemId;
      count += d.itemCount;
      total += d.bytes;
    }
    need3(count === m.itemCount && total <= 8388608, "identity_collection_bound");
    const { indexHash, ...unsigned } = m;
    need3(await sha256(jsonBytes(unsigned)) === indexHash, "identity_index_hash");
    return m;
  }
  async function parseIdentityPage(raw, d, m) {
    raw = ownIdentityBytes(raw, 131072);
    need3(raw.length === d.bytes && await sha256(raw) === d.sha256, "identity_page_hash");
    const p = parseStrictJson(raw);
    closed(p, ["schemaVersion", "kind", "rows"]);
    need3(p.schemaVersion === 2 && p.kind === "api_search_identity_page" && Array.isArray(p.rows) && p.rows.length === d.itemCount, "identity_page");
    let prior = d.firstItemId - 1;
    for (const r of p.rows) {
      validateIdentityRow(r);
      need3(r.itemId > prior && r.itemId <= d.lastItemId, "identity_row_order");
      prior = r.itemId;
      for (const op of r.currentMemberships) need3(m.sources.some((s) => s.operation === op), "identity_unknown_source");
    }
    need3(p.rows[0].itemId === d.firstItemId && p.rows.at(-1).itemId === d.lastItemId, "identity_page_range");
    return p;
  }
  function validateCompleteIdentityRows(m, rows) {
    need3(Array.isArray(rows) && rows.length === m.itemCount, "identity_rows");
    let prior = 0;
    const counts = { prices: 0, catalogue: 0, overview: 0 };
    for (const r of rows) {
      validateIdentityRow(r);
      need3(r.itemId > prior, "identity_duplicate_id");
      prior = r.itemId;
      for (const op of r.currentMemberships) counts[op]++;
    }
    for (const s of m.sources) need3(counts[s.operation] === s.itemCount, "identity_membership_count");
    return rows;
  }

  // ui-src/inventory-manual/multipage.mjs
  var need4 = (v, c) => {
    if (!v) throw TypeError(c);
  };
  var copy = (v) => structuredClone(v);
  var H2 = /^[a-f0-9]{64}$/;
  async function createManualPageWorkspace({ enabled = false, now = Date.now } = {}) {
    need4(typeof now === "function", "inventory_clock");
    let on = enabled === true, serial = 0, pageSerial = 0, referenceEpoch = 0, cacheState = "unavailable", priceProfile = "legacy_dated", pages = [], entries = [], identities = /* @__PURE__ */ new Map(), identitySources = [];
    const listeners = /* @__PURE__ */ new Set();
    const adapter = await createManualInventoryOwnCacheAdapter({ enabled: true, isEnabled: () => on });
    const flat = () => entries.map((r) => r.entry), notify = () => {
      for (const fn of listeners) try {
        fn();
      } catch {
      }
    }, reseed = () => {
      if (on) adapter.replaceEntries(flat());
    };
    function withdraw(reason = "unavailable") {
      referenceEpoch++;
      cacheState = reason;
      adapter.clear();
      reseed();
      if (reason === "access_denied") {
        identities = /* @__PURE__ */ new Map();
        identitySources = [];
      }
      notify();
    }
    function view({ online = true, visible = true } = {}) {
      const value = adapter.view(), byId = new Map(entries.map((e) => [e.entry.entryId, e])), rows = (value.rows ?? []).map((r) => {
        const owner = byId.get(r.entryId), known2 = identities.get(r.itemId), sale = r.evidence?.sale;
        const plain = owner.entry.kind === "commodity" && !r.evidence?.hasVariantEvidence && owner.entry.stats === null && owner.entry.slots === null && owner.entry.upgrades === null;
        const available = r.gross !== null || plain && sale?.medianUnitPriceLexeme !== null && sale?.reportedSalesCount >= 5;
        const status = ["loading", "access_denied", "retained"].includes(cacheState) ? cacheState : r.evidence?.source.cacheMode ?? "unavailable";
        const relation = priceProfile === "fast_ordered" ? describeSearchPriceRelation({ schemaVersion: 2, sourceSnapshots: identitySources, rows: known2 ? [{ itemId: r.itemId, memberships: known2.currentMemberships.map((operation) => ({ operation })) }] : [] }, r.itemId, r.source?.capturedAt ?? null) : null;
        return {
          ...r,
          pageId: owner.pageId,
          pageLabel: pages.find((p) => p.pageId === owner.pageId).label,
          name: r.evidence ? r.name : known2?.name ?? r.name,
          sprite: known2?.sprite ?? null,
          knownIdentityOnly: !r.evidence && !!known2,
          priceMembershipRelation: relation,
          sourceStatus: qualifySearchPriceStatus(describeReferenceStatus({ capturedAt: r.source?.capturedAt ?? null, status, hasData: !!r.evidence, available, retained: r.evidence?.source.cacheMode === "retained", online, visible, now: now() }), relation)
        };
      });
      return {
        enabled: on,
        cacheState,
        priceProfile,
        pages: pages.map((p) => ({ ...copy(p), rows: entries.filter((e) => e.pageId === p.pageId).length, valued: rows.filter((r) => r.pageId === p.pageId && r.gross !== null).length, possibleRepeatedSource: p.sourceHash !== null && pages.filter((q) => q.sourceHash === p.sourceHash).length > 1 })),
        rows,
        coverage: on ? value.coverage : { entries: entries.length, valued: 0, excludedOrUnknown: entries.length },
        subtotal: value.subtotal ?? { status: "unavailable", gross: null, net: null },
        suggestions: value.suggestions ?? [],
        duplicateStackPolicy: "keep_all_physical_rows_until_manual_removal",
        sourceClocksRenewed: false,
        displayMoney
      };
    }
    return Object.freeze({
      get enabled() {
        return on;
      },
      subscribe(fn) {
        need4(typeof fn === "function", "inventory_listener");
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
      setEnabled(value) {
        need4(typeof value === "boolean", "inventory_enabled");
        if (!value) {
          on = false;
          withdraw("disabled");
        } else {
          on = true;
          cacheState = "unavailable";
          reseed();
          notify();
        }
        return { enabled: on, automaticRequests: 0 };
      },
      addPage(input = {}) {
        need4(on, "inventory_off");
        need4(input && typeof input === "object" && !Array.isArray(input) && Object.keys(input).every((k) => ["label", "sourceKind", "sourceHash"].includes(k)), "manual_page_fields");
        const { label: label2, sourceKind = "manual", sourceHash = null } = copy(input);
        need4(pages.length < 10 && typeof label2 === "string" && label2.trim().length > 0 && label2.length <= 80 && ["manual", "screenshot_transcription"].includes(sourceKind) && (sourceHash === null || typeof sourceHash === "string" && H2.test(sourceHash)), "manual_page");
        need4(pageSerial < 999999, "page_serial");
        const page = { pageId: "page-" + ++pageSerial, label: label2.trim(), sourceKind, sourceHash, sourceHashAuthority: sourceHash === null ? "not_supplied" : "user_entered_not_verified" };
        pages.push(page);
        notify();
        return copy(page);
      },
      removePage(pageId) {
        need4(on && pages.some((p) => p.pageId === pageId), "manual_page");
        pages = pages.filter((p) => p.pageId !== pageId);
        entries = entries.filter((e) => e.pageId !== pageId);
        reseed();
        notify();
      },
      addEntry(pageId, input) {
        need4(on && pages.some((p) => p.pageId === pageId) && entries.length < 200 && serial < 999999, "manual_entry_bound");
        need4(input && typeof input === "object" && !Array.isArray(input) && !Object.hasOwn(input, "entryId"), "manual_entry_fields");
        const entry = sanitizeEntries([{ ...copy(input), entryId: "row-" + (serial + 1) }])[0];
        serial++;
        entries.push({ pageId, entry });
        reseed();
        notify();
        return copy({ pageId, entry });
      },
      updateEntry(entryId, input) {
        need4(on && entries.some((e) => e.entry.entryId === entryId), "manual_entry");
        need4(input && typeof input === "object" && !Array.isArray(input) && !Object.hasOwn(input, "entryId"), "manual_entry_fields");
        const entry = sanitizeEntries([{ ...copy(input), entryId }])[0];
        entries = entries.map((row) => row.entry.entryId === entryId ? { ...row, entry } : row);
        reseed();
        notify();
        return copy(entry);
      },
      removeEntry(entryId) {
        need4(on && entries.some((e) => e.entry.entryId === entryId), "manual_entry");
        entries = entries.filter((e) => e.entry.entryId !== entryId);
        reseed();
        notify();
      },
      getEntries: () => copy(entries),
      getPages: () => copy(pages),
      reviewedIds: () => [...new Set(entries.map((r) => r.entry.itemId))],
      setPriceProfile(value) {
        need4(["legacy_dated", "fast_ordered"].includes(value), "price_profile");
        if (value !== priceProfile) {
          priceProfile = value;
          withdraw("unavailable");
        }
      },
      setCacheState(value) {
        need4(["loading", "unavailable", "retained", "ready", "access_denied", "disabled", "physical_wait"].includes(value), "cache_state");
        cacheState = value;
        notify();
      },
      async applyCachedReferences(records) {
        if (!on) return { status: "disabled" };
        const ticket = ++referenceEpoch;
        const result = await adapter.replaceCachedReferences(records);
        if (!on || ticket !== referenceEpoch) return { status: "discarded" };
        if (!["loading", "access_denied", "retained", "disabled"].includes(cacheState)) cacheState = "ready";
        notify();
        return result;
      },
      setKnownIdentities(snapshot) {
        if (!on) return;
        const { rows, manifest } = snapshot;
        need4(Array.isArray(rows) && rows.length <= 1e4 && Array.isArray(manifest.sources) && manifest.sources.length <= 3, "identity_bound");
        const next = /* @__PURE__ */ new Map();
        for (const row of rows) {
          const r = validateIdentityRow(copy(row));
          need4(!next.has(r.itemId), "identity_duplicate");
          next.set(r.itemId, { name: r.name ?? "Item #" + r.itemId, sprite: r.sprite ?? null, currentMemberships: copy(r.currentMemberships) });
        }
        identities = next;
        identitySources = copy(manifest.sources);
        notify();
      },
      withdrawCachedReferences: withdraw,
      clear() {
        referenceEpoch++;
        pages = [];
        entries = [];
        identities = /* @__PURE__ */ new Map();
        identitySources = [];
        adapter.clear();
        cacheState = "unavailable";
        notify();
      },
      exportManual() {
        return { schemaVersion: 2, kind: "user_reviewed_manual_inventory_pages", pages: copy(pages), entries: copy(entries), automaticRecognition: false, containsPriceReferences: false };
      },
      view
    });
  }

  // ops/api-fast-item-public-protocol.mjs
  var enc4 = new TextEncoder();
  var H3 = /^[a-f0-9]{64}$/;
  var FAST_ITEM_PROTOCOL = "fast-current-v1";
  var FAST_ITEM_HEADERS = Object.freeze({ protocol: "X-Astra-API-Item-Protocol", epoch: "X-Astra-API-Item-Epoch", revision: "X-Astra-API-Item-Publication", binding: "X-Astra-API-Item-Binding" });
  var need5 = (v) => {
    if (!v) throw TypeError("Invalid FAST item ordering");
  };
  var validPublicEpoch = (v) => typeof v === "string" && /^[a-z][a-z0-9-]{0,63}$/.test(v);
  var iso2 = (v) => typeof v === "string" && v.length === 24 && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
  function fields(v, now) {
    need5(v && validPublicEpoch(v.epoch) && Number.isSafeInteger(v.revision) && v.revision > 0 && H3.test(v.generation) && iso2(v.capturedAt) && Date.parse(v.capturedAt) <= now && H3.test(v.bodySha256));
  }
  var tuple = (v) => enc4.encode(JSON.stringify([FAST_ITEM_PROTOCOL, v.epoch, String(v.revision), v.generation, v.capturedAt, v.bodySha256]));
  function hasFastItemHeaders(headers) {
    return Object.values(FAST_ITEM_HEADERS).some((k) => headers.has(k));
  }
  async function validateFastItemHeaders(headers, { generation, capturedAt, bodySha256, now = Date.now() } = {}) {
    need5(headers.get(FAST_ITEM_HEADERS.protocol) === FAST_ITEM_PROTOCOL);
    const raw = headers.get(FAST_ITEM_HEADERS.revision);
    need5(typeof raw === "string" && /^[1-9][0-9]{0,15}$/.test(raw));
    const v = { epoch: headers.get(FAST_ITEM_HEADERS.epoch), revision: Number(raw), generation, capturedAt, bodySha256 };
    fields(v, now);
    need5(String(v.revision) === raw && headers.get(FAST_ITEM_HEADERS.binding) === await sha256(tuple(v)));
    return Object.freeze(v);
  }
  function parseFastItemError(raw, { kind, itemId, generation, capturedAt }) {
    need5(raw instanceof Uint8Array && raw.length > 0 && raw.length <= 4096);
    const v = parseStrictJson(raw);
    need5(v && Object.keys(v).sort().join("|") === "generation|itemId|kind|schemaVersion|sourceCapturedAt|sourceObservedAt" && v.schemaVersion === 1 && v.kind === "fast_item_" + kind && v.itemId === itemId && v.generation === generation && v.sourceCapturedAt === capturedAt && v.sourceObservedAt === null);
    return v;
  }

  // ui-src/item-api/item-loader.mjs
  var sha = async (bytes2) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes2))].map((n) => n.toString(16).padStart(2, "0")).join("");
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
  function createItemReferenceClient({ fetcher, enabled = false, isEnabled = () => true, now = Date.now, ttlMs = 3e4, timeoutMs = 1e4, maxItems = 32, maxBytes = 2097152, maxFlights = 4 } = {}) {
    if (!Number.isInteger(ttlMs) || ttlMs < 0 || ttlMs > 6e4 || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 12e3 || !Number.isSafeInteger(maxItems) || maxItems < 1 || maxItems > 64 || !Number.isSafeInteger(maxBytes) || maxBytes < 3e5 || maxBytes > 8388608 || !Number.isSafeInteger(maxFlights) || maxFlights < 1 || maxFlights > 8) throw Error("Bounded client settings required");
    let bytes2 = 0, blocked = false, fastSeen = false, fastEpoch = null, high = null, saturatedAt = 0;
    const cache = /* @__PURE__ */ new Map(), flights = /* @__PURE__ */ new Map(), controllers = /* @__PURE__ */ new Map(), failures = /* @__PURE__ */ new Map(), tombstones = /* @__PURE__ */ new Map();
    const active = () => enabled === true && isEnabled() === true;
    const touch = (id2, value) => {
      if (cache.has(id2)) bytes2 -= cache.get(id2).bytes;
      cache.delete(id2);
      cache.set(id2, value);
      bytes2 += value.bytes;
      while (cache.size > maxItems || bytes2 > maxBytes) {
        const first = cache.keys().next().value;
        bytes2 -= cache.get(first).bytes;
        cache.delete(first);
      }
    };
    const drop = (id2) => {
      const old = cache.get(id2);
      if (old) bytes2 -= old.bytes;
      cache.delete(id2);
    };
    function recognize(response) {
      const marked = hasFastItemHeaders(response.headers);
      if (marked && !fastSeen) {
        fastSeen = true;
        for (const [id2, v] of [...cache]) if (!v.fast) drop(id2);
      }
      return marked;
    }
    function missing(id2, frame) {
      if (!frame) return;
      const old = tombstones.get(id2);
      if (old && old.revision > frame.revision) return;
      if (!old && tombstones.size >= 64) {
        saturatedAt = Math.max(saturatedAt, frame.revision);
        return;
      }
      tombstones.set(id2, frame);
    }
    function admit(frame, id2, negative = false, prior = null) {
      if (fastEpoch !== null && frame.epoch !== fastEpoch) throw failure("invalid");
      if (high && (frame.revision < high.revision || Date.parse(frame.capturedAt) < Date.parse(high.capturedAt) || frame.revision === high.revision && (frame.generation !== high.generation || frame.capturedAt !== high.capturedAt))) throw failure("invalid");
      const absent = tombstones.get(id2);
      if (!negative && (frame.revision <= saturatedAt || absent && frame.revision <= absent.revision)) throw failure("invalid");
      if (!negative && prior?.fast && frame.revision === prior.fast.revision && (frame.bodySha256 !== prior.fast.bodySha256 || frame.generation !== prior.fast.generation || frame.capturedAt !== prior.fast.capturedAt)) throw failure("invalid");
      if (!high || frame.revision > high.revision) {
        for (const [k, v] of tombstones) if (v.revision < frame.revision) tombstones.delete(k);
        if (saturatedAt < frame.revision) saturatedAt = 0;
        for (const [k, v] of [...cache]) if (v.fast && v.fast.revision < frame.revision) touch(k, { ...v, mode: "retained", expires: 0 });
      }
      high = { epoch: frame.epoch, revision: frame.revision, generation: frame.generation, capturedAt: frame.capturedAt };
      fastEpoch = frame.epoch;
      if (negative) missing(id2, frame);
      else tombstones.delete(id2);
    }
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
      const prior = cache.get(id2), control = { controller: new AbortController(), cancelled: false, timedOut: false, fastDeadline: performance.now() + timeoutMs };
      let captureFloor = prior?.data.sourceCapturedAt ?? failures.get(id2)?.capturedAtFloor ?? null, negativeSeen = false;
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
        if (control.timedOut || performance.now() >= control.fastDeadline) {
          control.timedOut = true;
          control.controller.abort();
          throw failure("timeout");
        }
        if (blocked) throw failure("access_denied");
      };
      function commit(action) {
        const old = { bytes: bytes2, fastEpoch, high, saturatedAt, cache: new Map(cache), tombstones: new Map(tombstones), failures: new Map(failures) };
        fence();
        try {
          action();
          fence();
        } catch (error) {
          bytes2 = old.bytes;
          fastEpoch = old.fastEpoch;
          high = old.high;
          saturatedAt = old.saturatedAt;
          for (const [target, saved] of [[cache, old.cache], [tombstones, old.tombstones], [failures, old.failures]]) {
            target.clear();
            for (const [k, v] of saved) target.set(k, v);
          }
          throw error;
        }
      }
      async function headerFrame(response, values) {
        try {
          const frame = await deadline(validateFastItemHeaders(response.headers, { ...values, now: now() }));
          fence();
          return frame;
        } catch {
          fence();
          throw failure("invalid");
        }
      }
      async function errorFrame(response, kind) {
        const capturedAt = response.headers.get("X-Astra-API-Item-Captured-At"), generation = response.headers.get("X-Astra-API-Item-Generation"), etag = response.headers.get("ETag");
        if (!/^application\/json(?:;|$)/i.test(response.headers.get("Content-Type") ?? "") || !/^"api-item-[a-f0-9]{64}"$/.test(etag ?? "")) throw failure("invalid");
        const raw = await deadline(boundedBytes(response, 4096));
        fence();
        const bodySha256 = await deadline(sha(raw));
        fence();
        if (etag !== '"api-item-' + bodySha256 + '"') throw failure("invalid");
        try {
          parseFastItemError(raw, { kind, itemId: id2, generation, capturedAt });
        } catch {
          throw failure("invalid");
        }
        return headerFrame(response, { generation, capturedAt, bodySha256 });
      }
      try {
        let response;
        for (let attempt = 0; attempt < 2; attempt++) {
          const generation2 = attempt === 0 ? prior?.data.projectionGeneration : null, url = "/api-item-prices/" + id2 + ".json" + (generation2 ? "?generation=" + generation2 : "");
          response = await deadline(fetcher(url, { method: "GET", credentials: "same-origin", cache: "no-cache", redirect: "error", signal: control.controller.signal, headers: prior ? { "If-None-Match": prior.etag } : {} }));
          fence();
          if (response.status === 401 || response.status === 403) throw failure("access_denied");
          const marked = recognize(response);
          fence();
          if (response.status === 404) {
            negativeSeen = true;
            drop(id2);
            missing(id2, prior?.fast);
            if (fastSeen) {
              if (!marked) throw failure("invalid");
              const frame = await errorFrame(response, "membership_absent");
              commit(() => admit(frame, id2, true));
              if (captureFloor === null || Date.parse(frame.capturedAt) > Date.parse(captureFloor)) captureFloor = frame.capturedAt;
            }
            throw failure("not_found");
          }
          if (response.status !== 409) break;
          if (fastSeen) {
            if (!marked) throw failure("invalid");
            const frame = await errorFrame(response, "generation_changed");
            commit(() => admit(frame, id2));
          }
          if (attempt === 1) throw failure("generation_changed");
        }
        const mode = response.headers.get("X-Astra-API-Item-Mode"), captured = response.headers.get("X-Astra-API-Item-Captured-At"), generation = response.headers.get("X-Astra-API-Item-Generation"), etag = response.headers.get("ETag");
        if (response.status !== 200 && response.status !== 304) throw failure("unavailable");
        if (!["validated_cache", "retained"].includes(mode) || !/^"api-item-[a-f0-9]{64}"$/.test(etag ?? "")) throw failure("invalid");
        if (response.status === 304) {
          if (!prior || prior.etag !== etag || prior.data.sourceCapturedAt !== captured || prior.data.projectionGeneration !== generation) throw failure("invalid");
          let fast2 = null;
          if (fastSeen) {
            if (!hasFastItemHeaders(response.headers)) throw failure("invalid");
            fast2 = await headerFrame(response, { generation, capturedAt: captured, bodySha256: etag.slice(10, -1) });
            fence();
          }
          const value2 = { ...prior, mode, fast: fast2, expires: now() + ttlMs };
          commit(() => {
            if (fast2) admit(fast2, id2, false, prior);
            touch(id2, value2);
            failures.delete(id2);
          });
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
        if (data.itemId !== id2 || data.sourceCapturedAt !== captured || data.projectionGeneration !== generation || captureFloor !== null && Date.parse(data.sourceCapturedAt) < Date.parse(captureFloor)) throw failure("invalid");
        let fast = null;
        if (fastSeen) {
          if (!hasFastItemHeaders(response.headers)) throw failure("invalid");
          fast = await headerFrame(response, { generation, capturedAt: captured, bodySha256: etag.slice(10, -1) });
          fence();
        }
        const value = { data, mode, etag, fast, bytes: body.length, expires: now() + ttlMs };
        commit(() => {
          if (fast) admit(fast, id2, false, prior);
          touch(id2, value);
          failures.delete(id2);
        });
        return value;
      } catch (error) {
        if (control.cancelled || !active() || error?.name === "AbortError" && !control.timedOut) throw abort();
        const reason = control.timedOut ? "timeout" : ["timeout", "access_denied", "not_found", "generation_changed", "invalid", "unavailable"].includes(error?.code) ? error.code : "unavailable", old = failures.get(id2)?.count ?? 0;
        failures.set(id2, { count: old + 1, reason, checkedAt: now(), retryAt: now() + Math.min(3e5, 3e4 * 2 ** Math.min(old, 4)), capturedAtFloor: captureFloor });
        while (failures.size > 64) failures.delete(failures.keys().next().value);
        if (reason === "access_denied") {
          blocked = true;
          throw failure(reason);
        }
        if (negativeSeen || reason === "not_found") {
          drop(id2);
          throw failure("not_found");
        }
        if (prior && active() && (!fastSeen || prior.fast)) {
          const value = { ...prior, mode: "retained", expires: prior.fast && high && prior.fast.revision < high.revision ? 0 : prior.expires };
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
      ordering() {
        return Object.freeze({ protocolSeen: fastSeen, epoch: fastEpoch, revision: high?.revision ?? null, tombstones: tombstones.size, saturatedAt });
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
        bytes2 = 0;
        blocked = false;
      }
    });
  }

  // ops/api-search-identity-definition.mjs
  var SEARCH_IDENTITY_DEFINITION = Object.freeze({
    metadata: Object.freeze([
      Object.freeze({ expectedSha256: "e66a5fb71974f55bad03130d2c3c8926f57ac8a5db949d58a369c4835ca6537f", sourceUrl: "https://maplestory.io/api/MCW/1/item/list?cashFilter=true&count=10000", format: "cash_client_catalog" }),
      Object.freeze({ expectedSha256: "60166ef0713a547a73b81473fbfa43d5d63f5182c978f5194b16411cd5e88a92", sourceUrl: "https://maplestory.io/api/MCW/1/item/list?cashFilter=false&count=10000", format: "noncash_list" })
    ]),
    spriteBindingsSha256: "356280fac3d0b4719ce31aa9e263b5de5a2797e191600f178c3fa4e53d1711de"
  });
  function matchesSearchIdentityDefinition(manifest, definition = SEARCH_IDENTITY_DEFINITION) {
    const sort = (rows) => [...rows].sort((a, b) => a.sourceUrl.localeCompare(b.sourceUrl));
    return manifest.spriteBindingsSha256 === definition.spriteBindingsSha256 && JSON.stringify(sort(manifest.identityMetadata)) === JSON.stringify(sort(definition.metadata));
  }

  // ops/api-search-identity-protocol.mjs
  var SEARCH_IDENTITY_PROTOCOL = "search-identities-v2";
  var SEARCH_IDENTITY_PAGE_HEADER = "X-Astra-Search-Identity-Object";
  var SEARCH_IDENTITY_HEADERS = Object.freeze({ protocol: "X-Astra-Search-Identity-Protocol", epoch: "X-Astra-Search-Identity-Epoch", revision: "X-Astra-Search-Identity-Revision", index: "X-Astra-Search-Identity-Index", binding: "X-Astra-Search-Identity-Binding", mode: "X-Astra-Search-Identity-Mode" });
  var searchIdentityEtag = (sha2) => '"search-identities-v2-' + identityHash(sha2) + '"';
  function validateSearchIdentityPageHeaders(headers, { bodySha256 }) {
    need3(headers?.get && headers.get(SEARCH_IDENTITY_PAGE_HEADER) === "page-v2" && headers.get("ETag") === searchIdentityEtag(bodySha256), "identity_http_page_protocol");
    need3(Object.values(SEARCH_IDENTITY_HEADERS).every((k) => !headers.has(k)), "identity_page_not_current_revision");
    return { objectProtocol: "page-v2" };
  }
  async function makeSearchIdentityHeaders({ publicationEpoch, publicationRevision, indexHash, bodySha256, mode = "validated_cache" }) {
    publicEpoch(publicationEpoch);
    integer2(publicationRevision, 1, Number.MAX_SAFE_INTEGER);
    identityHash(indexHash);
    identityHash(bodySha256);
    need3(["validated_cache", "retained"].includes(mode), "identity_mode");
    return { [SEARCH_IDENTITY_HEADERS.protocol]: SEARCH_IDENTITY_PROTOCOL, [SEARCH_IDENTITY_HEADERS.epoch]: publicationEpoch, [SEARCH_IDENTITY_HEADERS.revision]: String(publicationRevision), [SEARCH_IDENTITY_HEADERS.index]: indexHash, [SEARCH_IDENTITY_HEADERS.binding]: await sha256(jsonBytes([SEARCH_IDENTITY_PROTOCOL, publicationEpoch, String(publicationRevision), indexHash, bodySha256])), [SEARCH_IDENTITY_HEADERS.mode]: mode, ETag: searchIdentityEtag(bodySha256) };
  }
  async function validateSearchIdentityHeaders(headers, { expectedEpoch, bodySha256 }) {
    need3(headers?.get && headers.get(SEARCH_IDENTITY_HEADERS.protocol) === SEARCH_IDENTITY_PROTOCOL, "identity_http_protocol");
    const epoch = headers.get(SEARCH_IDENTITY_HEADERS.epoch), revision = headers.get(SEARCH_IDENTITY_HEADERS.revision), indexHash = headers.get(SEARCH_IDENTITY_HEADERS.index), mode = headers.get(SEARCH_IDENTITY_HEADERS.mode);
    publicEpoch(epoch);
    need3(epoch === expectedEpoch && /^[1-9][0-9]{0,15}$/.test(revision ?? ""), "identity_http_epoch_revision");
    const n = integer2(Number(revision), 1, Number.MAX_SAFE_INTEGER);
    need3(String(n) === revision, "identity_http_revision");
    const expected = await makeSearchIdentityHeaders({ publicationEpoch: epoch, publicationRevision: n, indexHash, bodySha256, mode });
    for (const [k, v] of Object.entries(expected)) need3(headers.get(k) === v, "identity_http_binding");
    return { publicationEpoch: epoch, publicationRevision: n, indexHash, mode };
  }

  // ui-src/item-api/search-identity-client.mjs
  var clone = (v) => structuredClone(v);
  var abort2 = () => Object.assign(Error("identity_aborted"), { name: "AbortError" });
  function createSearchIdentityClient({ enabled = false, isEnabled = () => true, fetcher, expectedEpoch, expectedDefinition = SEARCH_IDENTITY_DEFINITION, now = Date.now, monotonic = () => performance.now(), ttlMs = 3e4, timeoutMs = 3e4, readTimeoutMs = 1e4 } = {}) {
    if (enabled === true) publicEpoch(expectedEpoch);
    for (const [n, v, max] of [["ttl", ttlMs, 6e4], ["deadline", timeoutMs, 3e4], ["read", readTimeoutMs, 1e4]]) if (!Number.isSafeInteger(v) || v < 1 || v > max) throw TypeError("identity_" + n + "_bound");
    expectedDefinition = structuredClone(expectedDefinition);
    let good = null, flight = null, epoch = 0, floor = 0, floorIndex = null, expires = 0, retryAt = 0, failures = 0, blocked = false, lastFailure = null;
    const active = () => {
      try {
        return enabled === true && isEnabled() === true && !blocked;
      } catch {
        return false;
      }
    };
    const view = (mode = good?.mode) => good ? clone({ manifest: good.manifest, rows: good.rows, mode }) : null;
    function cancelTask() {
      if (flight) {
        flight.cancelled = true;
        for (const c of flight.controllers) c.abort();
      }
    }
    function revoke() {
      epoch++;
      good = null;
      expires = 0;
      cancelTask();
    }
    function failure2(latch, reason) {
      if (latch.reported) return;
      latch.reported = true;
      lastFailure = reason;
      expires = 0;
      retryAt = now() + Math.min(3e5, 3e4 * 2 ** Math.min(failures++, 4));
    }
    function fence(latch, readEnd = Infinity) {
      need3(active() && latch.epoch === epoch && !latch.cancelled, "identity_revoked");
      need3(monotonic() < latch.end && monotonic() < readEnd, "identity_deadline");
    }
    async function read(latch, path, limit, previous = null) {
      fence(latch);
      need3(path === SEARCH_IDENTITY_ROUTE + "manifest.json" || new RegExp("^" + SEARCH_IDENTITY_ROUTE + "[a-f0-9]{64}\\.json$").test(path), "identity_fixed_path");
      const controller = new AbortController(), end = Math.min(latch.end, monotonic() + readTimeoutMs);
      latch.controllers.add(controller);
      const timer = setTimeout(() => controller.abort(), Math.max(1, end - monotonic()));
      let response, reader = null, finished = false;
      try {
        response = await fetcher(path, { method: "GET", credentials: "same-origin", redirect: "error", cache: "no-cache", signal: controller.signal, headers: previous ? { "If-None-Match": previous.etag } : {} });
        fence(latch, end);
        if (response.status === 401) {
          blocked = true;
          revoke();
          throw Error("identity_authentication_withdrawn");
        }
        need3(response.status === 200 || response.status === 304, "identity_http_unavailable");
        const etag = response.headers.get("ETag");
        need3(/^"search-identities-v2-[a-f0-9]{64}"$/.test(etag ?? ""), "identity_http_etag");
        if (response.status === 304) {
          need3(previous && previous.etag === etag, "identity_http_304");
          const context3 = await validateSearchIdentityHeaders(response.headers, { expectedEpoch, bodySha256: previous.sha });
          fence(latch, end);
          finished = true;
          return { ...previous, ...context3, unchanged: true };
        }
        need3(/^application\/json(?:;|$)/i.test(response.headers.get("Content-Type") ?? ""), "identity_http_type");
        const declared = response.headers.get("Content-Length");
        need3(declared === null || /^[1-9][0-9]*$/.test(declared) && Number(declared) <= limit, "identity_http_length");
        need3(response.body && typeof response.body.getReader === "function", "identity_http_body");
        reader = response.body.getReader();
        const chunks = [];
        let n = 0, chunksRead = 0;
        for (; ; ) {
          const p = await reader.read();
          fence(latch, end);
          if (p.done) break;
          need3(++chunksRead <= 1024, "identity_http_chunks");
          if (identityByteLength(p.value) === 0) continue;
          const owned = ownIdentityBytes(p.value, limit - n);
          n += owned.byteLength;
          chunks.push(owned);
        }
        need3(n > 0 && (declared === null || n === Number(declared)), "identity_http_length");
        const raw = new Uint8Array(n);
        let at = 0;
        for (const p of chunks) {
          raw.set(p, at);
          at += p.length;
        }
        const sha2 = await sha256(raw);
        fence(latch, end);
        need3(etag === searchIdentityEtag(sha2), "identity_http_body_hash");
        const context2 = path.endsWith("/manifest.json") ? await validateSearchIdentityHeaders(response.headers, { expectedEpoch, bodySha256: sha2 }) : validateSearchIdentityPageHeaders(response.headers, { bodySha256: sha2 });
        fence(latch, end);
        finished = true;
        return { raw, sha: sha2, etag, ...context2, unchanged: false };
      } finally {
        clearTimeout(timer);
        latch.controllers.delete(controller);
        try {
          if (!finished) {
            if (reader) await reader.cancel();
            else if (response?.body && !response.body.locked) await response.body.cancel();
          }
        } finally {
          reader?.releaseLock();
        }
      }
    }
    async function collect(latch) {
      const record = await read(latch, SEARCH_IDENTITY_ROUTE + "manifest.json", 65536, good?.record), manifest = await parseIdentityManifest(record.raw);
      fence(latch);
      need3(matchesSearchIdentityDefinition(manifest, expectedDefinition), "identity_reviewed_metadata_definition");
      need3(manifest.publicationEpoch === record.publicationEpoch && manifest.publicationRevision === record.publicationRevision && manifest.indexHash === record.indexHash, "identity_manifest_context");
      need3(manifest.publicationRevision >= floor && (manifest.publicationRevision !== floor || floorIndex === null || manifest.indexHash === floorIndex), "identity_revision_regression");
      if (good) for (const s of good.manifest.sources) {
        const next = manifest.sources.find((v) => v.operation === s.operation);
        need3(next && Date.parse(next.capturedAt) >= Date.parse(s.capturedAt), "identity_source_clock_regression");
      }
      floor = manifest.publicationRevision;
      floorIndex = manifest.indexHash;
      if (record.unchanged) {
        need3(good?.manifest.indexHash === manifest.indexHash, "identity_304_collection");
        fence(latch);
        const value2 = { ...good, record, mode: record.mode };
        good = value2;
        expires = now() + ttlMs;
        failures = 0;
        retryAt = 0;
        lastFailure = null;
        return value2;
      }
      const prior = good?.pages ?? /* @__PURE__ */ new Map(), pages = /* @__PURE__ */ new Map(), parts = new Array(manifest.pages.length);
      let cursor = 0, failed = false, retained = record.mode === "retained";
      const workers = Array.from({ length: Math.min(4, manifest.pages.length) }, async () => {
        try {
          while (!failed) {
            fence(latch);
            const i = cursor++;
            if (i >= manifest.pages.length) return;
            const d = manifest.pages[i];
            let page = prior.get(d.sha256);
            if (page) {
              need3(page.bytes === d.bytes && page.firstItemId === d.firstItemId && page.lastItemId === d.lastItemId && page.rows.length === d.itemCount, "identity_cached_page");
            } else {
              const r = await read(latch, d.url, 131072);
              need3(r.sha === d.sha256 && r.raw.length === d.bytes, "identity_page_context");
              const p = await parseIdentityPage(r.raw, d, manifest);
              fence(latch);
              page = { rows: p.rows, bytes: d.bytes, firstItemId: d.firstItemId, lastItemId: d.lastItemId };
            }
            for (const row of page.rows) for (const op of row.currentMemberships) need3(manifest.sources.some((s) => s.operation === op), "identity_page_source");
            pages.set(d.sha256, page);
            parts[i] = page.rows;
          }
        } catch (error2) {
          failed = true;
          for (const c of latch.controllers) c.abort();
          throw error2;
        }
      });
      const results = await Promise.allSettled(workers), error = results.find((r) => r.status === "rejected");
      if (error) throw error.reason;
      const rows = validateCompleteIdentityRows(manifest, parts.flat());
      fence(latch);
      need3(manifest.publicationRevision === floor && manifest.indexHash === floorIndex, "identity_late_revision");
      const value = { manifest, rows, mode: retained ? "retained" : "validated_cache", record, pages };
      good = value;
      expires = now() + ttlMs;
      retryAt = 0;
      failures = 0;
      lastFailure = null;
      return value;
    }
    async function wait(latch, signal) {
      if (signal?.aborted) throw abort2();
      let timer, cancel;
      const deadline = new Promise((resolve) => {
        timer = setTimeout(() => {
          latch.cancelled = true;
          for (const c of latch.controllers) c.abort();
          resolve({ error: Error("identity_deadline") });
        }, Math.max(1, latch.end - monotonic()));
      }), stop = new Promise((_, reject) => {
        cancel = () => reject(abort2());
        signal?.addEventListener("abort", cancel, { once: true });
      });
      try {
        return await Promise.race([latch.promise, deadline, stop]);
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", cancel);
      }
    }
    return Object.freeze({
      async load({ signal } = {}) {
        if (!active() || typeof fetcher !== "function") throw Error("identity_not_connected");
        if (good && now() < expires && good.manifest.publicationRevision === floor) return view();
        if (now() < retryAt) {
          if (good) return view("retained");
          throw Error("identity_read_backoff");
        }
        if (!flight) {
          const latch2 = { epoch, end: monotonic() + timeoutMs, controllers: /* @__PURE__ */ new Set(), cancelled: false, reported: false, promise: null };
          flight = latch2;
          latch2.promise = collect(latch2).then((value) => ({ value }), (error) => ({ error })).finally(() => {
            if (flight === latch2) flight = null;
          });
        }
        const latch = flight, result = await wait(latch, signal);
        if (result.error) {
          failure2(latch, result.error.message);
          if (good && active()) return view("retained");
          throw result.error;
        }
        need3(active() && latch.epoch === epoch && !latch.cancelled, "identity_revoked");
        return view(result.value.mode);
      },
      clear() {
        revoke();
        lastFailure = "identity_disabled";
        retryAt = 0;
      },
      resetAccess() {
        revoke();
        blocked = false;
        retryAt = 0;
        lastFailure = null;
      },
      state() {
        return { mode: blocked ? "authentication_unavailable" : good ? lastFailure || good.manifest.publicationRevision < floor ? "retained" : good.mode : "unavailable", itemCount: good?.manifest.itemCount ?? 0, indexHash: good?.manifest.indexHash ?? null, sourceSnapshots: clone(good?.manifest.sources ?? []), latestObservedRevision: floor, retainedRevision: good?.manifest.publicationRevision ?? null, physicalFlight: flight !== null, retryAt, blocked, lastFailure, priceAuthority: false };
      }
    });
  }

  // ui-src/item-api/search-selected-price.mjs
  var FAST_SELECTION_REQUEST_HEADER = "X-Astra-Request-Item-Protocol";
  function createSearchSelectedPriceFetcher(fetcher, { expectedEpoch, isEnabled = () => true } = {}) {
    return async (...args) => {
      if (!validPublicEpoch(expectedEpoch) || isEnabled() !== true) throw Error("fast_selection_not_configured");
      const options = { ...args[1] ?? {}, headers: new Headers(args[1]?.headers) };
      options.headers.set(FAST_SELECTION_REQUEST_HEADER, FAST_ITEM_PROTOCOL);
      const response = await fetcher(args[0], options);
      if (isEnabled() !== true) {
        if (response.body && !response.body.locked) await response.body.cancel();
        throw Error("fast_selection_revoked");
      }
      if ([200, 304, 404, 409].includes(response.status) && (response.headers.get(FAST_ITEM_HEADERS.protocol) !== FAST_ITEM_PROTOCOL || response.headers.get(FAST_ITEM_HEADERS.epoch) !== expectedEpoch)) {
        if (response.body && !response.body.locked) await response.body.cancel();
        throw Error("ordered_fast_selection_required");
      }
      return response;
    };
  }

  // ui-src/inventory-manual/physical-fetch.mjs
  var ORIGINS = /* @__PURE__ */ new Set(["https://inflation.gg", "https://inflation-watch-astra.dizzyvinci.workers.dev", "http://127.0.0.1:8765"]);
  var approvedInventoryOrigin = (value) => typeof value === "string" && ORIGINS.has(value);
  var fail2 = (c) => Object.assign(Error(c), { code: c });
  var need6 = (v, c) => {
    if (!v) throw fail2(c);
  };
  var ALLOWED = /* @__PURE__ */ new Set(["etag", "content-type", "content-length", "x-astra-api-item-mode", "x-astra-api-item-captured-at", "x-astra-api-item-generation", "x-astra-api-item-protocol", "x-astra-api-item-epoch", "x-astra-api-item-publication", "x-astra-api-item-binding", "x-astra-search-identity-protocol", "x-astra-search-identity-epoch", "x-astra-search-identity-revision", "x-astra-search-identity-index", "x-astra-search-identity-binding", "x-astra-search-identity-mode", "x-astra-search-identity-object"]);
  function route(path) {
    need6(typeof path === "string" && path.length <= 220, "fixed_cache_path");
    if (path === "/api-search-identities/v2/manifest.json") return { phase: "identity", id: null, max: 65536 };
    if (/^\/api-search-identities\/v2\/[a-f0-9]{64}\.json$/.test(path)) return { phase: "identity", id: null, max: 131072 };
    const m = /^\/api-item-prices\/([1-9][0-9]{0,8})\.json(?:\?generation=[a-f0-9]{64})?$/.exec(path);
    need6(m, "fixed_cache_path");
    return { phase: "price", id: Number(m[1]), max: 3e5 };
  }
  function createInventoryPhysicalFetch({ origin, fetcher, isEnabled = () => false, onHeaders = () => {
  }, onState = () => {
  } } = {}) {
    const leases = /* @__PURE__ */ new Set();
    let epoch = 0, action = null, peak = 0, totalStarts = 0;
    const state = () => ({ physicalPending: leases.size, physicalPeak: peak, totalStarts, actionPending: action !== null, budgetExceeded: action?.failed === true, unknownLockedBodies: [...leases].filter((l) => l.unknownLockedBody).length });
    const notify = () => {
      try {
        onState(state());
      } catch {
      }
    }, active = () => {
      try {
        return isEnabled() === true;
      } catch {
        return false;
      }
    };
    const cancelLease = async (l) => {
      l.cancelRequested = true;
      if (l.cancelBody) await l.cancelBody();
      return l.done;
    };
    function begin() {
      need6(active() && ORIGINS.has(origin) && typeof fetcher === "function", "cache_not_connected");
      need6(action === null && leases.size === 0, "physical_wait");
      action = { epoch, starts: 0, priceBytes: 0, identityBytes: 0 };
      return action;
    }
    function end(a) {
      if (action === a) action = null;
      notify();
    }
    async function read(path, options = {}) {
      const r = route(path), a = action;
      need6(a && !a.failed && a.epoch === epoch && active(), "cache_action_revoked");
      need6(leases.size < 4 && a.starts < 529, "physical_capacity");
      need6(ORIGINS.has(origin) && typeof fetcher === "function", "cache_not_connected");
      need6(options.method === "GET" && options.credentials === "same-origin" && options.redirect === "error" && options.body === void 0, "fixed_cache_request");
      const reqHeaders = new Headers(options.headers);
      for (const [k, v] of reqHeaders) {
        need6(k === "if-none-match" || k === "x-astra-request-item-protocol", "fixed_cache_header");
        need6(v.length <= 160 && !/[\r\n]/.test(v), "fixed_cache_header");
        if (k === "x-astra-request-item-protocol") need6(r.phase === "price" && v === "fast-current-v1", "fixed_cache_header");
      }
      let resolve;
      const l = { ...r, cancelRequested: false, cancelBody: null, done: new Promise((done) => resolve = done) };
      leases.add(l);
      peak = Math.max(peak, leases.size);
      a.starts++;
      totalStarts++;
      notify();
      let completed = false;
      const release = () => {
        if (!completed) {
          completed = true;
          leases.delete(l);
          resolve();
          notify();
        }
      };
      let response = null, reader = null, ended = false, cancelling = null;
      const cancel = () => {
        l.cancelRequested = true;
        if (!cancelling) cancelling = (async () => {
          try {
            if (reader) await reader.cancel();
            else if (response?.body) {
              if (response.body.locked) {
                l.unknownLockedBody = true;
                notify();
                await new Promise(() => {
                });
              } else await response.body.cancel();
            }
          } finally {
            try {
              reader?.releaseLock();
            } catch {
            }
            release();
          }
        })();
        return cancelling;
      };
      try {
        response = await fetcher(path, { ...options, mode: "same-origin", referrerPolicy: "no-referrer" });
        l.cancelBody = cancel;
        need6(response && response.url === origin + path && !response.redirected, "cache_response_destination");
        const headers = new Headers();
        let count = 0, bytes2 = 0;
        for (const [k, v] of response.headers) {
          count++;
          bytes2 += k.length + v.length;
          need6(count <= 100 && bytes2 <= 65536, "cache_header_bound");
          if (ALLOWED.has(k.toLowerCase())) headers.set(k, v);
        }
        if (response.headers.get("Content-Encoding") && response.headers.get("Content-Encoding").toLowerCase() !== "identity") headers.delete("Content-Length");
        onHeaders({ itemId: r.id, status: response.status, protocol: headers.get("X-Astra-API-Item-Protocol"), epoch: headers.get("X-Astra-API-Item-Epoch") });
        if (a.epoch !== epoch || !active() || l.cancelRequested) {
          await cancel();
          throw fail2("cache_action_revoked");
        }
        if (response.status === 304) {
          if (response.body) await cancel();
          else release();
          return { status: 304, headers, body: null };
        }
        if (![200, 404, 409].includes(response.status)) {
          await cancel();
          return { status: response.status, headers, body: null };
        }
        need6(response.body && typeof response.body.getReader === "function", "cache_body_missing");
        reader = response.body.getReader();
        let length = 0, chunks = 0;
        const max = [404, 409].includes(response.status) ? 4096 : r.max;
        const body = new ReadableStream({ async pull(controller) {
          try {
            const declared = headers.get("Content-Length");
            need6(declared === null || /^[0-9]+$/.test(declared) && Number(declared) <= max, "cache_body_bound");
            const p = await reader.read();
            need6(a.epoch === epoch && active() && !l.cancelRequested, "cache_action_revoked");
            if (p.done) {
              need6(declared === null || Number(declared) === length, "cache_body_length");
              ended = true;
              reader.releaseLock();
              release();
              controller.close();
              return;
            }
            need6(++chunks <= 1024 && p.value instanceof Uint8Array, "cache_chunk_bound");
            length += p.value.byteLength;
            need6(length <= max, "cache_body_bound");
            const field = r.phase === "price" ? "priceBytes" : "identityBytes";
            a[field] += p.value.byteLength;
            if (a[field] > (r.phase === "price" ? 2e6 : 8454144)) {
              a.failed = true;
              notify();
              throw fail2("cache_action_byte_bound");
            }
            controller.enqueue(new Uint8Array(p.value));
          } catch (error) {
            try {
              await cancel();
            } finally {
              controller.error(fail2(["cache_action_revoked", "cache_action_byte_bound"].includes(error?.code) ? error.code : "cache_body_unavailable"));
            }
          }
        }, async cancel() {
          if (!ended) await cancel();
        } }, { highWaterMark: 0 });
        return { status: response.status, headers, body };
      } catch (error) {
        await cancel();
        throw fail2(["cache_response_destination", "cache_action_revoked"].includes(error?.code) ? error.code : "cache_unavailable");
      }
    }
    return Object.freeze({ read, begin, end, state, async settlePhase(phase) {
      const set = [...leases].filter((l) => l.phase === phase);
      await Promise.all(set.map(cancelLease));
    }, async settleItem(id2) {
      await Promise.all([...leases].filter((l) => l.id === id2).map(cancelLease));
    }, revoke() {
      epoch++;
      for (const l of leases) {
        l.cancelRequested = true;
        if (l.cancelBody) void l.cancelBody().catch(() => {
        });
      }
      notify();
    }, get busy() {
      return leases.size > 0 || action !== null;
    } });
  }

  // ui-src/inventory-manual/cache-controller.mjs
  var need7 = (v, c) => {
    if (!v) throw TypeError(c);
  };
  var E = new TextEncoder();
  function createManualInventoryCacheController({ enabled = false, isEnabled = () => true, origin = null, priceProfile = "legacy_dated", fastEpoch = null, identityEpoch = null, fetcher = null, now = Date.now, onSnapshot = () => {
  }, onIdentities = () => {
  }, onWithdraw = () => {
  }, onState = () => {
  }, timeoutMs = 3e4 } = {}) {
    need7(typeof isEnabled === "function" && typeof onSnapshot === "function" && typeof onIdentities === "function" && typeof onWithdraw === "function" && typeof onState === "function" && Number.isSafeInteger(timeoutMs) && timeoutMs >= 1 && timeoutMs <= 3e4, "inventory_cache_options");
    if (enabled === true) need7(approvedInventoryOrigin(origin) && typeof fetcher === "function" && ["legacy_dated", "fast_ordered"].includes(priceProfile) && (priceProfile !== "fast_ordered" || validPublicEpoch(fastEpoch)) && (identityEpoch === null || validPublicEpoch(identityEpoch)), "inventory_cache_profile");
    let epoch = 0, physicalWork = null, batch = null, blocked = false, records = /* @__PURE__ */ new Map(), prices = null, identities = null, status = "disabled";
    const capacityIds = /* @__PURE__ */ new Set();
    const active = () => {
      try {
        return enabled === true && isEnabled() === true;
      } catch {
        return false;
      }
    }, emit = () => {
      try {
        onState(state());
      } catch {
      }
    }, state = () => ({ status, blocked, actionPending: !!physicalWork, physical: pool.state(), cachedReferenceItems: records.size, referenceCapacityUnknown: capacityIds.size, priceProfile, sourceClocksRenewed: false });
    const snapshot = () => [...records.values()].map((v) => structuredClone(v));
    function changed(admit = null) {
      if (active() && !blocked) {
        const owned = snapshot();
        admit?.();
        try {
          onSnapshot(owned);
        } catch {
        }
      }
      emit();
      admit?.();
    }
    function stop(reason, target = batch) {
      if (target && !target.reason) {
        target.reason = reason;
        target.controller.abort();
        target.resolveStop();
      }
      status = reason;
      if (["timed_out", "response_budget"].includes(reason)) {
        for (const [id2, r] of records) records.set(id2, { ...r, mode: "retained" });
        changed();
      }
      emit();
    }
    function invalidate(reason) {
      epoch++;
      records.clear();
      capacityIds.clear();
      prices?.clear();
      identities?.clear();
      pool.revoke();
      onWithdraw(reason);
      stop(reason);
      emit();
    }
    const pool = createInventoryPhysicalFetch({ origin, fetcher, isEnabled: () => active() && !blocked, onState: (value) => {
      if (value.budgetExceeded && batch && !batch.reason) {
        stop("response_budget");
        prices?.clear();
        identities?.clear();
        pool.revoke();
      }
      emit();
    }, onHeaders: (frame) => {
      if (frame.status === 401 || frame.status === 403) {
        blocked = true;
        invalidate("access_denied");
        return;
      }
      if (frame.status === 404 && frame.itemId !== null && (priceProfile === "fast_ordered" ? frame.protocol === "fast-current-v1" && frame.epoch === fastEpoch : frame.protocol === null)) {
        records.delete(frame.itemId);
        onWithdraw("membership_withdrawal");
        changed();
      }
    } });
    function clients() {
      if (prices) return;
      const current = () => active() && !blocked;
      const selected = priceProfile === "fast_ordered" ? createSearchSelectedPriceFetcher(pool.read, { expectedEpoch: fastEpoch, isEnabled: current }) : async (...args) => {
        const r = await pool.read(...args);
        if (hasFastItemHeaders(r.headers)) {
          if (r.body) await r.body.cancel();
          throw Error("explicit_legacy_profile_required");
        }
        return r;
      };
      prices = createItemReferenceClient({ enabled: true, isEnabled: current, fetcher: selected, now, ttlMs: 3e4, timeoutMs: 1e4, maxItems: 64, maxBytes: 2e6, maxFlights: 4 });
      if (identityEpoch !== null) identities = createSearchIdentityClient({ enabled: true, isEnabled: current, expectedEpoch: identityEpoch, fetcher: pool.read, now, ttlMs: 3e4, timeoutMs: Math.min(timeoutMs, 3e4), readTimeoutMs: 1e4 });
    }
    function mergeMemory(selected, admit) {
      const peek = prices.peekCachedReferences(), memory = new Map(peek.references.map((v) => [v.data.itemId, v]));
      if (peek.status === "access_denied") {
        blocked = true;
        invalidate("access_denied");
        return;
      }
      const next = new Map(records);
      for (const id2 of [...next.keys()]) if (!selected.has(id2)) next.delete(id2);
      for (const [id2, record] of next) if (!memory.has(id2)) next.set(id2, { data: record.data, mode: "retained" });
      for (const [id2, record] of memory) if (selected.has(id2)) next.set(id2, record);
      need7(E.encode(JSON.stringify([...next.values()])).length <= 2e6, "inventory_reference_bound");
      admit();
      records = next;
      changed(admit);
    }
    return Object.freeze({
      state,
      peek: () => active() && !blocked ? snapshot() : [],
      clear() {
        invalidate("cleared");
        blocked = false;
        status = active() ? "unavailable" : "disabled";
        emit();
      },
      disable() {
        enabled = false;
        invalidate("disabled");
      },
      async refresh(ids) {
        if (!active()) return { status: "disabled" };
        if (physicalWork || pool.busy) return { status: "physical_wait" };
        const deadline = performance.now() + timeoutMs;
        need7(Array.isArray(ids) && ids.length <= 200 && ids.every((id2) => Number.isSafeInteger(id2) && id2 >= 1 && id2 <= 999999999), "reviewed_item_ids");
        const selected = new Set(ids), list = [...selected];
        if (blocked) {
          blocked = false;
          prices?.resetAccess();
          identities?.resetAccess();
        }
        clients();
        capacityIds.clear();
        const token = epoch, a = pool.begin(), controller = new AbortController();
        let resolveStop;
        const stopped = new Promise((r) => resolveStop = r), b = { controller, resolveStop, reason: null };
        batch = b;
        status = "loading";
        emit();
        let timer;
        const expire = () => {
          prices.clear();
          identities?.clear();
          pool.revoke();
          stop("timed_out", b);
        };
        const fence = () => {
          const allowed = active();
          if (token !== epoch || !allowed || blocked || b.reason) {
            if (!b.reason) stop(blocked ? "access_denied" : allowed ? "cleared" : "disabled", b);
            throw Error("inventory_action_revoked");
          }
          if (performance.now() >= deadline) {
            expire();
            throw Error("inventory_action_revoked");
          }
        };
        timer = setTimeout(expire, timeoutMs);
        const work = (async () => {
          try {
            fence();
            try {
              if (identities) {
                const known2 = await identities.load({ signal: controller.signal });
                fence();
                onIdentities(known2);
              }
            } catch (error) {
              if (blocked || b.reason) throw error;
            } finally {
              await pool.settlePhase("identity");
            }
            fence();
            let index = 0;
            const worker = async () => {
              while (index < list.length) {
                fence();
                const id2 = list[index++];
                try {
                  await prices.loadItem({ itemId: id2, signal: controller.signal });
                  fence();
                  mergeMemory(selected, fence);
                } catch (error) {
                  if (blocked || b.reason) throw error;
                  const reason = prices.diagnostic(id2).reason;
                  if (reason === "not_found") records.delete(id2);
                  else if (records.has(id2)) records.set(id2, { ...records.get(id2), mode: "retained" });
                  if (error instanceof TypeError && error.message === "inventory_reference_bound") {
                    capacityIds.add(id2);
                    status = "reference_capacity";
                  }
                  changed();
                } finally {
                  await pool.settleItem(id2);
                }
              }
            };
            await Promise.allSettled(Array.from({ length: Math.min(4, list.length) }, worker));
            fence();
            mergeMemory(selected, fence);
            fence();
            status = "ready";
            return { status: "ready", referenceItems: records.size };
          } finally {
            await pool.settlePhase("identity");
            await pool.settlePhase("price");
            pool.end(a);
          }
        })();
        physicalWork = work;
        work.finally(() => {
          if (physicalWork === work) physicalWork = null;
          emit();
        }).catch(() => {
        });
        let outcome;
        try {
          const answer = await Promise.race([work.then((value) => ({ value }), (error) => ({ error })), stopped.then(() => ({ stopped: true }))]);
          if (!b.reason && !answer.error && !answer.stopped) try {
            fence();
          } catch {
          }
          if (answer.error && !b.reason) {
            status = blocked ? "access_denied" : "unavailable";
            for (const [id2, r] of records) records.set(id2, { ...r, mode: "retained" });
            changed();
          }
          outcome = b.reason ? { status: b.reason } : answer.value ?? { status };
        } finally {
          clearTimeout(timer);
          if (batch === b) batch = null;
          emit();
        }
        if (!b.reason && outcome?.status === "ready") try {
          fence();
        } catch {
        }
        return b.reason ? { status: b.reason } : outcome;
      }
    });
  }

  // ui-src/inventory-manual/screenshot-image.mjs
  var need8 = (v, c) => {
    if (!v) throw TypeError(c);
  };
  var be16 = (b, i) => b[i] << 8 | b[i + 1];
  var be32 = (b, i) => b[i] * 16777216 + b[i + 1] * 65536 + b[i + 2] * 256 + b[i + 3];
  var text = (b, i, n) => String.fromCharCode(...b.subarray(i, i + n));
  var CRC = Uint32Array.from({ length: 256 }, (_, n) => {
    for (let k = 0; k < 8; k++) n = n & 1 ? 3988292384 ^ n >>> 1 : n >>> 1;
    return n >>> 0;
  });
  function crc(b, start, end) {
    let c = 4294967295;
    for (let i = start; i < end; i++) c = CRC[(c ^ b[i]) & 255] ^ c >>> 8;
    return (c ^ 4294967295) >>> 0;
  }
  function dimensions(width, height) {
    need8(Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0 && width <= 8192 && height <= 8192 && width * height <= 12e6, "image_dimensions");
    return { width, height };
  }
  function png(b) {
    need8(b.length >= 45 && [137, 80, 78, 71, 13, 10, 26, 10].every((x, i) => b[i] === x), "png_signature");
    let p = 8, count = 0, ihdr = false, idat = false, endIdat = false, plte = false, ended = false, d;
    while (p < b.length) {
      need8(++count <= 4096 && p + 12 <= b.length, "png_chunks_bound");
      const n = be32(b, p), t = text(b, p + 4, 4);
      need8(/^[A-Za-z]{4}$/.test(t) && t[2] === t[2].toUpperCase() && n <= b.length - p - 12, "png_chunk");
      need8(crc(b, p + 4, p + 8 + n) === be32(b, p + 8 + n), "png_crc");
      need8(!["acTL", "fcTL", "fdAT"].includes(t), "animated_image_unsupported");
      need8(t !== "eXIf", "png_exif_orientation_held");
      if (!ihdr) {
        need8(t === "IHDR" && n === 13, "png_ihdr");
        const w = be32(b, p + 8), h = be32(b, p + 12), bits = b[p + 16], color = b[p + 17];
        d = dimensions(w, h);
        need8({ 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] }[color]?.includes(bits) && b[p + 18] === 0 && b[p + 19] === 0 && b[p + 20] <= 1, "png_profile");
        d.color = color;
        ihdr = true;
      } else if (t === "IHDR") need8(false, "png_duplicate_ihdr");
      else if (t === "PLTE") {
        need8(!plte && !idat && n > 0 && n <= 768 && n % 3 === 0 && d.color !== 0 && d.color !== 4, "png_palette");
        plte = true;
      } else if (t === "IDAT") {
        need8(!endIdat && (d.color !== 3 || plte), "png_idat_order");
        idat = true;
      } else if (t === "IEND") {
        need8(idat && n === 0 && p + 12 === b.length, "png_iend");
        ended = true;
        p += 12;
        break;
      } else {
        need8(t[0] === t[0].toLowerCase(), "png_unknown_critical");
        if (idat) endIdat = true;
      }
      p += n + 12;
    }
    need8(ended && p === b.length, "png_incomplete");
    return { ...dimensions(d.width, d.height), format: "png", mime: "image/png", orientation: "encoding_orientation_only" };
  }
  function exif(b, start, end) {
    need8(end - start >= 14 && text(b, start, 6) === "Exif\0\0", "jpeg_app1_metadata_held");
    const o = start + 6, le = text(b, o, 2) === "II";
    need8(le || text(b, o, 2) === "MM", "jpeg_exif_profile");
    const u16 = (i) => {
      need8(i >= o && i + 2 <= end, "jpeg_exif_bounds");
      return le ? b[i] + b[i + 1] * 256 : be16(b, i);
    }, u32 = (i) => {
      need8(i >= o && i + 4 <= end, "jpeg_exif_bounds");
      return le ? b[i] + b[i + 1] * 256 + b[i + 2] * 65536 + b[i + 3] * 16777216 : be32(b, i);
    };
    need8(u16(o + 2) === 42, "jpeg_exif_profile");
    const offset = u32(o + 4);
    need8(offset >= 8, "jpeg_exif_bounds");
    const p = o + offset, n = u16(p);
    need8(n <= 128 && p + 2 + n * 12 + 4 <= end, "jpeg_exif_entries");
    let seen = false;
    for (let k = 0; k < n; k++) {
      const q = p + 2 + k * 12;
      if (u16(q) === 274) {
        need8(!seen && u16(q + 2) === 3 && u32(q + 4) === 1, "jpeg_exif_orientation");
        seen = true;
        need8(u16(q + 8) === 1, "jpeg_orientation_held");
      }
    }
    need8(u32(p + 2 + n * 12) === 0, "jpeg_exif_secondary_held");
  }
  function jpeg(b) {
    need8(b.length >= 4 && b[0] === 255 && b[1] === 216, "jpeg_signature");
    let p = 2, markers = 0, d = null, scans = 0, inScan = false, exifSeen = false, ended = false;
    while (p < b.length) {
      if (inScan) {
        while (p < b.length) {
          if (b[p++] !== 255) continue;
          while (p < b.length && b[p] === 255) p++;
          need8(p < b.length, "jpeg_truncated_scan");
          if (b[p] === 0 || b[p] >= 208 && b[p] <= 215) {
            p++;
            continue;
          }
          p--;
          break;
        }
        inScan = false;
      }
      need8(++markers <= 16384 && p + 2 <= b.length && b[p++] === 255, "jpeg_markers_bound");
      while (p < b.length && b[p] === 255) p++;
      need8(p < b.length, "jpeg_marker");
      const m = b[p++];
      if (m === 217) {
        need8(d && scans > 0 && p === b.length, "jpeg_eoi");
        ended = true;
        break;
      }
      need8(m !== 0 && m !== 216 && m !== 1 && !(m >= 208 && m <= 215) && m !== 220, "jpeg_marker");
      need8(p + 2 <= b.length, "jpeg_segment");
      const n = be16(b, p);
      need8(n >= 2 && n <= b.length - p, "jpeg_segment");
      const s = p + 2, e = p + n;
      if (m === 225) {
        need8(!exifSeen, "jpeg_duplicate_exif");
        exifSeen = true;
        exif(b, s, e);
      }
      if (m === 226) need8(text(b, s, Math.min(4, e - s)) !== "MPF\0", "animated_image_unsupported");
      if (m >= 192 && m <= 207 && ![196, 200, 204].includes(m)) {
        need8([192, 193, 194].includes(m) && !d && n >= 8 && b[s] === 8, "jpeg_sof_profile");
        const components = b[s + 5];
        need8([1, 3, 4].includes(components) && n === 8 + components * 3, "jpeg_sof_components");
        d = dimensions(be16(b, s + 3), be16(b, s + 1));
        d.components = components;
      }
      if (m === 218) {
        need8(d && n >= 6 && b[s] >= 1 && b[s] <= d.components && n === 6 + b[s] * 2, "jpeg_sos");
        scans++;
        inScan = true;
      }
      p = e;
    }
    need8(ended, "jpeg_incomplete");
    return { ...dimensions(d.width, d.height), format: "jpeg", mime: "image/jpeg", orientation: "absent_or_explicit_identity_only" };
  }
  var screenshotLimits = Object.freeze({ maxBytes: 8e6, maxBatchBytes: 32e6, maxDimension: 4096, maxPixels: 8e6, maxTotalPixels: 16e6, maxPages: 10, maxPhysicalDecodes: 1 });
  var typed2 = Object.getPrototypeOf(Uint8Array.prototype);
  var nativeLength = Object.getOwnPropertyDescriptor(typed2, "byteLength").get;
  var nativeOffset = Object.getOwnPropertyDescriptor(typed2, "byteOffset").get;
  var nativeBuffer = Object.getOwnPropertyDescriptor(typed2, "buffer").get;
  var nativeTag = Object.getOwnPropertyDescriptor(typed2, Symbol.toStringTag).get;
  var abLength = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, "byteLength").get;
  function ownScreenshotBytes(input) {
    let n, o, buffer;
    try {
      need8(nativeTag.call(input) === "Uint8Array", "image_bytes");
      n = nativeLength.call(input);
      o = nativeOffset.call(input);
      buffer = nativeBuffer.call(input);
      abLength.call(buffer);
    } catch {
      throw TypeError("image_bytes");
    }
    need8(n > 0 && n <= screenshotLimits.maxBytes, "image_bytes");
    const out = new Uint8Array(n);
    out.set(new Uint8Array(buffer, o, n));
    return out;
  }
  var le32 = (b, i) => b[i] + b[i + 1] * 256 + b[i + 2] * 65536 + b[i + 3] * 16777216;
  var le24 = (b, i) => b[i] + b[i + 1] * 256 + b[i + 2] * 65536;
  function webp(b) {
    need8(b.length >= 20 && text(b, 0, 4) === "RIFF" && text(b, 8, 4) === "WEBP" && le32(b, 4) + 8 === b.length, "webp_riff");
    let p = 12, count = 0, canvas = null, payload = null, alpha = false;
    while (p < b.length) {
      need8(++count <= 256 && p + 8 <= b.length, "webp_chunks");
      const t = text(b, p, 4), n = le32(b, p + 4), s = p + 8;
      need8(n <= b.length - s && s + n + n % 2 <= b.length, "webp_chunk_bound");
      if (n % 2) need8(b[s + n] === 0, "webp_padding");
      if (t === "VP8X") {
        need8(count === 1 && n === 10 && !canvas && (b[s] & ~16) === 0 && b[s + 1] === 0 && b[s + 2] === 0 && b[s + 3] === 0, "webp_extended_profile");
        canvas = dimensions(le24(b, s + 4) + 1, le24(b, s + 7) + 1);
      } else if (t === "ALPH") {
        need8(canvas && !payload && !alpha && n > 0, "webp_alpha");
        alpha = true;
      } else if (t === "VP8 ") {
        need8(!payload && n >= 10 && (b[s] & 1) === 0 && b[s + 3] === 157 && b[s + 4] === 1 && b[s + 5] === 42, "webp_vp8");
        payload = dimensions(b[s + 6] + b[s + 7] * 256 & 16383, b[s + 8] + b[s + 9] * 256 & 16383);
      } else if (t === "VP8L") {
        need8(!payload && !alpha && n >= 5 && b[s] === 47 && (b[s + 4] & 224) === 0, "webp_vp8l");
        payload = dimensions(1 + b[s + 1] + ((b[s + 2] & 63) << 8), 1 + (b[s + 2] >> 6) + (b[s + 3] << 2) + ((b[s + 4] & 15) << 10));
      } else need8(false, "webp_metadata_or_animation_unsupported");
      p = s + n + n % 2;
    }
    need8(payload && p === b.length && (!canvas || canvas.width === payload.width && canvas.height === payload.height), "webp_dimensions");
    return { ...payload, format: "webp", mime: "image/webp", orientation: "encoding_orientation_only" };
  }
  function inspectScreenshotBytes(bytes2, mime) {
    const b = ownScreenshotBytes(bytes2);
    try {
      need8(["image/png", "image/jpeg", "image/webp"].includes(mime), "image_type_unsupported");
      const d = mime === "image/png" ? png(b) : mime === "image/jpeg" ? jpeg(b) : webp(b);
      need8(d.width <= 4096 && d.height <= 4096 && d.width * d.height <= 8e6, "image_dimensions");
      return Object.freeze({ ...d, bytes: b.length, pixelCount: d.width * d.height, sourceCapturedAt: null, recognition: false });
    } finally {
      b.fill(0);
    }
  }

  // ui-src/inventory-manual/screenshot-review.mjs
  function mountScreenshotReview(root, { isEnabled, addPage, getPages, selectPage }) {
    const d = root.ownerDocument, w = d.defaultView;
    if (w.location.origin !== "http://127.0.0.1:8765") return Object.freeze({ sync() {
    }, clear() {
    }, state: () => Object.freeze({ images: 0, physicalPending: false, encodedBytes: 0, pixels: 0 }), dispose() {
    } });
    const make = (tag, text2) => {
      const el = d.createElement(tag);
      if (text2 !== void 0) el.textContent = text2;
      return el;
    };
    let epoch = 0, disposed = false, busy = false, reader = null, queue = [], pages = [], serial = 0;
    const active = () => {
      try {
        return !disposed && isEnabled() === true;
      } catch {
        return false;
      }
    };
    const section = make("section");
    section.className = "inventory-screenshot-review";
    section.dataset.screenshotReview = "";
    section.append(make("h2", "Review local inventory screenshots"), make("p", "Choose up to 10 PNG, JPEG or WebP screenshots. Each becomes a separate review page. Images stay in this tab; nothing is recognized automatically. Read the image and confirm each exact item, quantity and stat in the existing stack form. Correct mistakes before adding, or remove and replace a stack. Refresh cached prices remains a separate action."));
    const label2 = make("label", "Choose local screenshots"), input = make("input");
    input.type = "file";
    input.multiple = true;
    input.accept = "image/png,image/jpeg,image/webp";
    input.autocomplete = "off";
    input.dataset.screenshotFiles = "";
    label2.append(input);
    section.append(label2);
    const clearButton = make("button", "Clear images only");
    clearButton.type = "button";
    clearButton.dataset.clearScreenshots = "";
    section.append(clearButton);
    const status = make("p", "No images selected. No upload, filename export, image saving or screenshot source clock.");
    status.setAttribute("role", "status");
    status.dataset.screenshotStatus = "";
    section.append(status);
    const gallery = make("div");
    gallery.className = "inventory-screenshot-gallery";
    section.append(gallery);
    root.append(section);
    const release = (p) => {
      p.canvas.width = 0;
      p.canvas.height = 0;
      p.card.remove();
    };
    function draw() {
      input.disabled = !active() || busy;
      clearButton.disabled = pages.length === 0 && !busy;
      for (const p of pages) p.select.disabled = !active();
      section.dataset.physicalPending = String(busy);
    }
    function clear() {
      epoch++;
      queue.length = 0;
      for (const p of pages) release(p);
      pages = [];
      input.value = "";
      try {
        if (reader?.readyState === 1) reader.abort();
      } catch {
      }
      status.textContent = busy ? "Images cleared. An earlier native decode remains reserved until it physically settles; late pixels cannot return." : "Images cleared. Confirmed manual pages and stacks remain until you remove them or clear the workspace.";
      draw();
    }
    function sync() {
      if (!active()) {
        if (pages.length || queue.length || reader || busy) clear();
        else draw();
        return;
      }
      const ids = new Set(getPages().map((p) => p.pageId));
      pages = pages.filter((p) => {
        if (ids.has(p.pageId)) return true;
        release(p);
        return false;
      });
      draw();
    }
    const read = (file) => new Promise((resolve, reject) => {
      const r = new w.FileReader();
      reader = r;
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(TypeError("local_image_read_failed"));
      r.onabort = () => reject(TypeError("local_image_read_cancelled"));
      try {
        r.readAsArrayBuffer(file);
      } catch {
        reject(TypeError("local_image_read_failed"));
      }
    });
    async function importFiles(files) {
      if (!active() || busy) return;
      let count;
      try {
        count = files.length;
        if (!Number.isSafeInteger(count) || count < 1 || count > 10) throw Error();
        queue = Array.from(files);
        if (queue.length !== count || count + getPages().length > 10) throw Error();
      } catch {
        queue = [];
        status.textContent = "Choose 1 to 10 images within the remaining 10-page limit.";
        return;
      }
      const ticket = epoch;
      busy = true;
      draw();
      let bytes2 = null, bitmap = null, canvas = null, file = null;
      const valid = () => ticket === epoch && active();
      try {
        const size = Object.getOwnPropertyDescriptor(w.Blob.prototype, "size").get, type = Object.getOwnPropertyDescriptor(w.Blob.prototype, "type").get;
        let total = pages.reduce((n, p) => n + p.bytes, 0);
        for (const f of queue) {
          const n = size.call(f);
          if (!(f instanceof w.File) || !Number.isSafeInteger(n) || n < 1 || n > screenshotLimits.maxBytes || !["image/png", "image/jpeg", "image/webp"].includes(type.call(f))) throw TypeError("local_image_profile");
          total += n;
        }
        if (total > screenshotLimits.maxBatchBytes) throw TypeError("local_image_batch_bound");
        while (queue.length && valid()) {
          file = queue.shift();
          const mime = type.call(file), expected = size.call(file);
          status.textContent = "Reading and decoding one local image. No item identity or stats have been inferred.";
          const buffer = await read(file);
          reader = null;
          bytes2 = new Uint8Array(buffer);
          if (!valid()) break;
          if (bytes2.length !== expected) throw TypeError("local_image_size_changed");
          const info = inspectScreenshotBytes(bytes2, mime);
          if (pages.reduce((n, p) => n + p.pixels, 0) + info.pixelCount > screenshotLimits.maxTotalPixels) throw TypeError("local_image_pixel_budget");
          if (typeof w.createImageBitmap !== "function") throw TypeError("native_image_decoder_unavailable");
          const pendingBitmap = w.createImageBitmap(new w.Blob([bytes2], { type: mime }), { imageOrientation: "from-image" });
          bytes2.fill(0);
          bytes2 = null;
          file = null;
          bitmap = await pendingBitmap;
          if (!valid()) break;
          if (!bitmap || typeof bitmap.close !== "function" || bitmap.width !== info.width || bitmap.height !== info.height) throw TypeError("native_image_dimensions_mismatch");
          canvas = make("canvas");
          canvas.width = info.width;
          canvas.height = info.height;
          canvas.setAttribute("aria-label", "Local screenshot for manual transcription");
          const ctx = canvas.getContext("2d");
          if (!ctx) throw TypeError("local_canvas_unavailable");
          ctx.drawImage(bitmap, 0, 0);
          bitmap.close();
          bitmap = null;
          if (!valid()) break;
          const page = addPage({ label: "Screenshot review " + ++serial, sourceKind: "screenshot_transcription", sourceHash: null });
          if (!valid()) break;
          const card = make("article"), title = make("h3", page.label), select = make("button", "Review / enter stacks for this page"), remove = make("button", "Remove this image only");
          select.type = remove.type = "button";
          select.dataset.reviewScreenshot = page.pageId;
          remove.dataset.removeScreenshot = page.pageId;
          const row = { pageId: page.pageId, canvas, card, select, bytes: info.bytes, pixels: info.pixelCount };
          select.addEventListener("click", () => {
            if (active()) selectPage(page.pageId);
          });
          remove.addEventListener("click", () => {
            release(row);
            pages = pages.filter((p) => p !== row);
            draw();
          });
          card.append(title, canvas, make("p", "Manually transcribed image; capture time, completeness, item identity and stack counts are not verified."), select, remove);
          gallery.append(card);
          pages.push(row);
          canvas = null;
          selectPage(page.pageId);
        }
        if (valid()) status.textContent = "Local images ready. Review each page and enter separate stacks; only explicit Refresh may request typed cached prices. No recognition or inventory completeness is claimed.";
      } catch {
        if (valid()) status.textContent = "Image could not be admitted. Use a nonanimated PNG, JPEG or WebP up to 8 MB, 4,096 pixels per side and 8 million pixels. All images together are limited to 32 MB and 16 million pixels. Some metadata or orientation profiles need a fresh plain screenshot. Earlier admitted pages remain separate.";
      } finally {
        bytes2?.fill(0);
        try {
          bitmap?.close();
        } finally {
          if (canvas) {
            canvas.width = 0;
            canvas.height = 0;
          }
          file = null;
          reader = null;
          queue.length = 0;
          busy = false;
          input.value = "";
          draw();
        }
      }
    }
    input.addEventListener("change", () => {
      void importFiles(input.files);
    });
    clearButton.addEventListener("click", clear);
    draw();
    return Object.freeze({ sync, clear, state: () => Object.freeze({ images: pages.length, physicalPending: busy, encodedBytes: pages.reduce((n, p) => n + p.bytes, 0), pixels: pages.reduce((n, p) => n + p.pixels, 0) }), dispose() {
      clear();
      disposed = true;
      section.remove();
    } });
  }

  // ui-src/inventory-manual/page.mjs
  var label = (code) => ({ dated_reference_estimate: "Dated reference estimate", quantity_unknown: "Quantity unknown", tradeability_unknown: "Tradeability not confirmed", untradeable_excluded: "Declared not tradeable", unit_conversion_unknown: "Unit conversion not confirmed", reference_unavailable: "Cached price unknown", reported_variant_unavailable: "No qualified reported-stat match", qualified_reference_unavailable: "No qualified sale reference", variant_evidence_requires_equipment_review: "Variants need equipment review", declared_roll_fields_require_equipment_review: "Declared stats need equipment review", reported_stats_unknown_or_empty: "Reported stats unknown" })[code] ?? "Needs review";
  async function mountManualInventory(root, { now = Date.now, isAvailable = () => true, onToggle = () => {
  }, autoConnect = true } = {}) {
    if (typeof isAvailable !== "function" || typeof onToggle !== "function") throw TypeError("inventory_lifecycle_options");
    const available = () => {
      try {
        return isAvailable() === true;
      } catch {
        return false;
      }
    };
    const model = await createManualPageWorkspace({ now }), d = root.ownerDocument, w = d.defaultView;
    let controller = null, selectedPage = null, editing = null, connection = null, update = null, nextSnapshot = null, disposed = false, ageTimer = null, screenshots = null;
    const stopAgeTimer = () => {
      if (ageTimer !== null) {
        w.clearTimeout(ageTimer);
        ageTimer = null;
      }
    };
    function armAgeTimer() {
      if (disposed || !model.enabled || d.hidden || w.navigator.onLine === false) {
        stopAgeTimer();
        return;
      }
      if (ageTimer === null) ageTimer = w.setTimeout(() => {
        ageTimer = null;
        safeDraw();
      }, 6e4);
    }
    const node = (tag, text2) => {
      const n = d.createElement(tag);
      if (text2 !== void 0) n.textContent = text2;
      return n;
    };
    root.replaceChildren();
    root.append(node("h1", "Manual inventory \xB7 cached reference workspace"));
    root.append(node("p", "Manual workspace \xB7 Off by default. Review each page and physical stack yourself. Local screenshot transcription is optional; no upload, OCR, game capture, IGN lookup, account setup or automatic saving."));
    const controls = node("section");
    controls.innerHTML = "<button data-enable>Enable manual workspace</button><button data-refresh disabled>Refresh cached prices</button><button data-remove-page disabled>Remove selected page and its stacks</button><button data-clear disabled>Clear workspace</button><button data-export disabled>Export manual entries locally</button>";
    root.append(controls);
    const privacy = node("p", "Refresh reads only our cached item/identity endpoints through the existing typed clients. Item IDs in ordinary GET URLs may appear in our hosting logs. Quantities, stats, page identities, IGN and screenshots are not sent. Existing site access may accompany same-origin requests; this page never asks for a password.");
    privacy.className = "privacy";
    root.append(privacy);
    const status = node("p");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    root.append(status);
    const pagesForm = node("form");
    pagesForm.innerHTML = '<h2>Keep pages separate</h2><label>Page label<input name="label" maxlength="80" required></label><label>Page source<select name="sourceKind"><option value="manual">Manual page</option><option value="screenshot_transcription">Manually transcribed screenshot page</option></select></label><label>Optional page SHA-256 entered by you<input name="sourceHash" maxlength="64" autocomplete="off"></label><p>This label/hash does not process or verify an image. Matching hashes never delete stacks automatically.</p><button>Add page</button>';
    root.append(pagesForm);
    const pageNav = node("section");
    pageNav.setAttribute("aria-label", "Inventory pages");
    root.append(pageNav);
    const form = node("form");
    form.innerHTML = '<h2>Add one physical stack to the selected page</h2><label>Exact item ID<input name="itemId" inputmode="numeric" required></label><label>Quantity (blank = unknown)<input name="quantity" inputmode="numeric"></label><label>Tradeability<select name="tradeable"><option value="unknown">Unknown</option><option value="yes">I confirm tradeable</option><option value="no">Not tradeable</option></select></label><label>Reference kind<select name="kind"><option value="unknown">Unknown</option><option value="commodity">Item-level median \xB7 quality mix possible</option><option value="equipment">Reported equipment signature</option></select></label><label>Source units per inventory unit (no default)<input name="unitFactor" inputmode="decimal"></label><label class="check"><input name="unitConfirmed" type="checkbox">I checked this exact unit conversion</label><label>Successful upgrades (blank = unknown)<input name="upgrades" inputmode="numeric"></label><label>Slots left (blank = unknown)<input name="slots" inputmode="numeric"></label><label>Reported stats by code, e.g. {"16":2}<input name="stats" autocomplete="off"></label><label class="check"><input name="reportedSignatureAcknowledged" type="checkbox">Use only a matching source-reported signature; complete roll quality remains unverified</label><button>Add separate stack</button>';
    root.append(form);
    const coverage = node("p");
    coverage.setAttribute("role", "status");
    const wrap = node("div");
    wrap.className = "table-wrap";
    const table = node("table");
    wrap.append(table);
    root.append(coverage, wrap);
    root.append(node("p", "Prices are dated source-reported references, not current lowest listings or executable sale proceeds. A mixed-roll item median is not a matched-stat quote. Unknown quantities, units, tradeability, missing prices and unmatched variants stay unknown, never zero. Different price generations have no common-snapshot total."));
    root.append(node("p", "Privacy on this proposed page: quantities, stat details and page identities stay in this document\u2019s memory. Explicit Refresh sends item IDs to our cached-reference endpoints, where hosting logs may record them. This module adds no browser storage, analytics, automatic export, image transmission or account lookup. An explicit local export contains manual pages/entries only, without price bodies. Existing site privacy and optional performance choices still apply. Other same-origin code and already-loaded scripts can access document memory; this is not an isolated privacy guarantee."));
    function safeDraw() {
      if (disposed) return;
      if (editing && !model.getEntries().some((r) => r.entry.entryId === editing)) editing = null;
      form.querySelector("button").textContent = editing ? "Save correction to this physical stack" : "Add separate stack";
      const value = model.view({ online: w.navigator.onLine !== false, visible: !d.hidden });
      const enabled = model.enabled, network = controller?.state(), busy = !!network && (network.actionPending || network.physical.actionPending || network.physical.physicalPending > 0);
      controls.querySelector("[data-enable]").textContent = enabled ? "Pause workspace; clear cached quotes" : "Enable manual workspace";
      controls.querySelector("[data-clear]").disabled = false;
      controls.querySelector("[data-export]").disabled = model.getEntries().length === 0 && model.getPages().length === 0;
      controls.querySelector("[data-refresh]").disabled = !enabled || !controller || busy;
      controls.querySelector("[data-remove-page]").disabled = !enabled || selectedPage === null;
      for (const el of pagesForm.elements) el.disabled = !enabled;
      for (const el of form.elements) el.disabled = !enabled || selectedPage === null;
      status.textContent = !enabled ? "Workspace Off. Manual pages are retained in memory when paused; no requests are made." : !controller ? "Manual workspace ready. Own-site cache is not connected on this origin or profile; missing prices remain unknown." : busy ? "Checking cached references or waiting for an earlier physical request to settle; original captures stay dated." : network.blocked ? "Site access unavailable. Manual pages remain; cached prices were withdrawn. Use existing site authentication separately, then an explicit Refresh." : network.referenceCapacityUnknown ? "Some requested references exceeded the bounded cache. Coverage is partial; missing prices are unknown and older values remain dated." : value.priceProfile === "legacy_dated" ? "Using separately dated legacy item snapshots. A cache check is not a new price capture." : "Using the explicitly ordered FAST cache profile; identity membership does not establish a price.";
      pageNav.replaceChildren();
      for (const p of value.pages) {
        const b = node("button", p.label + " \xB7 " + p.valued + "/" + p.rows + " stacks priced" + (p.possibleRepeatedSource ? " \xB7 repeated source hash: review manually" : ""));
        b.type = "button";
        b.dataset.pageId = p.pageId;
        b.setAttribute("aria-pressed", String(p.pageId === selectedPage));
        b.disabled = !enabled;
        b.addEventListener("click", () => {
          selectedPage = p.pageId;
          safeDraw();
        });
        pageNav.append(b);
      }
      coverage.textContent = `${value.coverage.valued} / ${value.coverage.entries} declared stacks priced across ${value.pages.length} pages. ${value.coverage.excludedOrUnknown} excluded or unknown. Common-generation dated subtotal: ${value.displayMoney(value.subtotal.gross)} mesos. This covers included declared stacks, not a verified complete inventory.`;
      table.replaceChildren();
      const head = node("thead"), hr = node("tr");
      for (const s of ["Page / physical stack", "Declared item / quantity", "Valuation state", "Dated estimate \xB7 mesos", "Original retrieval / status", "Action"]) hr.append(node("th", s));
      head.append(hr);
      table.append(head);
      const body = node("tbody");
      const shown = selectedPage === null ? value.rows : value.rows.filter((r) => r.pageId === selectedPage);
      for (const r of shown) {
        const tr = node("tr");
        tr.dataset.entryId = r.entryId;
        tr.dataset.pageId = r.pageId;
        tr.append(node("td", r.pageLabel + " \xB7 " + r.entryId));
        const identity = node("td", r.name + " \xB7 ID " + r.itemId + " \xB7 quantity " + (r.declaredQuantity ?? "Unknown"));
        if (r.sprite) {
          const img = node("img");
          img.src = r.sprite;
          img.alt = "";
          img.width = 32;
          img.height = 32;
          identity.prepend(img);
        }
        tr.append(identity, node("td", label(r.status) + (r.basis ? " \xB7 " + r.basis : "") + (r.evidence?.asking ? " \xB7 asking median is not a lowest listing" : "")), node("td", value.displayMoney(r.gross)));
        const retrieval = node("td"), indicator = node("span", r.sourceStatus.label);
        indicator.dataset.statusTone = r.sourceStatus.tone;
        indicator.dataset.retrievalState = r.sourceStatus.phase;
        retrieval.append(node("div", r.source?.capturedAt ?? "Original retrieval unknown"), indicator);
        if (r.source?.credit) {
          const credit = node("a", "Prices from maplestory.market");
          credit.href = r.source.credit;
          credit.target = "_blank";
          credit.rel = "noopener noreferrer";
          retrieval.append(credit);
        }
        if (r.priceMembershipRelation) retrieval.append(node("p", r.priceMembershipRelation.label));
        tr.append(retrieval);
        const action = node("td"), remove = node("button", "Remove this physical stack");
        remove.type = "button";
        remove.addEventListener("click", () => model.removeEntry(r.entryId));
        const review = node("button", "Review / correct declaration");
        review.type = "button";
        review.dataset.reviewEntry = r.entryId;
        review.disabled = !enabled;
        review.addEventListener("click", () => {
          const row = model.getEntries().find((x) => x.entry.entryId === r.entryId);
          if (!model.enabled || !available() || !row) return;
          selectedPage = row.pageId;
          editing = row.entry.entryId;
          const e = form.elements, v = row.entry;
          for (const k of ["itemId", "quantity", "tradeable", "kind", "unitFactor", "upgrades", "slots"]) e[k].value = v[k] ?? "";
          e.stats.value = v.stats === null ? "" : JSON.stringify(v.stats);
          e.unitConfirmed.checked = v.unitConfirmed;
          e.reportedSignatureAcknowledged.checked = v.reportedSignatureAcknowledged;
          safeDraw();
          form.scrollIntoView?.({ block: "nearest" });
        });
        action.append(review, remove);
        tr.append(action);
        body.append(tr);
      }
      table.append(body);
      armAgeTimer();
      screenshots?.sync();
    }
    async function applyLatest() {
      if (update) return update;
      update = (async () => {
        while (nextSnapshot !== null) {
          const snapshot2 = nextSnapshot;
          nextSnapshot = null;
          try {
            await model.applyCachedReferences(snapshot2);
          } catch {
            model.setCacheState("unavailable");
          }
        }
      })().finally(() => {
        update = null;
        safeDraw();
        if (nextSnapshot !== null && !disposed) void applyLatest();
      });
      return update;
    }
    async function flushSnapshots() {
      while (update || nextSnapshot !== null) await applyLatest();
    }
    function snapshot(records) {
      nextSnapshot = records;
      void applyLatest();
    }
    function connectOwnSiteCache(config) {
      if (!config || config.origin !== w.location.origin || !approvedInventoryOrigin(config.origin) || typeof config.fetcher !== "function") throw Error("Only this reviewed origin may supply cached references");
      if (controller) {
        const s = controller.state();
        if (s.actionPending || s.physical.physicalPending > 0) throw Error("Earlier cache work still physically pending");
        controller.disable();
      }
      connection = { ...config };
      model.setPriceProfile(config.priceProfile ?? "legacy_dated");
      controller = createManualInventoryCacheController({ ...config, enabled: true, isEnabled: () => model.enabled && !disposed && available(), onSnapshot: snapshot, onIdentities: (value) => model.setKnownIdentities(value), onWithdraw: (reason) => {
        nextSnapshot = null;
        model.withdrawCachedReferences(reason);
      }, onState: (state) => {
        if (state.status === "loading") model.setCacheState("loading");
        else if (state.status === "ready") model.setCacheState("ready");
        else if (state.status === "access_denied") model.setCacheState("access_denied");
        else if (["timed_out", "unavailable", "response_budget", "reference_capacity"].includes(state.status)) model.setCacheState("retained");
        safeDraw();
      } });
      safeDraw();
    }
    screenshots = mountScreenshotReview(root, { isEnabled: () => model.enabled && !disposed && available(), getPages: () => model.getPages(), addPage: (input) => model.addPage(input), selectPage: (id2) => {
      selectedPage = id2;
      safeDraw();
      form.scrollIntoView?.({ block: "nearest" });
    } });
    const unsubscribe = model.subscribe(safeDraw);
    function setEnabled(value) {
      if (disposed || typeof value !== "boolean") return { enabled: model.enabled };
      if (value && !available()) return { enabled: model.enabled };
      if (value === model.enabled) return { enabled: model.enabled };
      if (!value) {
        screenshots?.clear();
        controller?.clear();
        nextSnapshot = null;
        model.setEnabled(false);
      } else {
        model.setEnabled(true);
        if (autoConnect && !controller && approvedInventoryOrigin(w.location.origin)) connectOwnSiteCache({ origin: w.location.origin, priceProfile: "legacy_dated", fetcher: (...args) => w.fetch(...args) });
      }
      return { enabled: model.enabled };
    }
    controls.querySelector("[data-enable]").addEventListener("click", () => {
      setEnabled(!model.enabled);
      onToggle(model.enabled);
    });
    function clear() {
      editing = null;
      screenshots?.clear();
      pagesForm.reset();
      form.reset();
      controller?.clear();
      nextSnapshot = null;
      selectedPage = null;
      model.clear();
    }
    controls.querySelector("[data-clear]").addEventListener("click", clear);
    controls.querySelector("[data-remove-page]").addEventListener("click", () => {
      model.removePage(selectedPage);
      selectedPage = model.getPages()[0]?.pageId ?? null;
      safeDraw();
    });
    controls.querySelector("[data-refresh]").addEventListener("click", async () => {
      try {
        await controller.refresh(model.reviewedIds());
        await flushSnapshots();
      } catch {
        model.setCacheState("unavailable");
      }
      safeDraw();
    });
    controls.querySelector("[data-export]").addEventListener("click", () => {
      const text2 = JSON.stringify(model.exportManual(), null, 2), blob = new w.Blob([text2], { type: "application/json" }), url = w.URL.createObjectURL(blob), a = node("a");
      a.href = url;
      a.download = "manual-inventory.json";
      a.click();
      w.URL.revokeObjectURL(url);
    });
    pagesForm.addEventListener("submit", (event) => {
      event.preventDefault();
      try {
        const e = pagesForm.elements, p = model.addPage({ label: e.label.value, sourceKind: e.sourceKind.value, sourceHash: e.sourceHash.value.trim() || null });
        selectedPage = p.pageId;
        safeDraw();
      } catch {
        status.textContent = "Review the page label and optional64-character lowercase hash; maximum10 separate pages.";
      }
    });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      try {
        const e = form.elements, int = (k) => e[k].value.trim() === "" ? null : Number(e[k].value);
        const input = { itemId: Number(e.itemId.value), quantity: e.quantity.value.trim() || null, tradeable: e.tradeable.value, kind: e.kind.value, unitFactor: e.unitFactor.value.trim() || null, unitConfirmed: e.unitConfirmed.checked, upgrades: int("upgrades"), slots: int("slots"), stats: e.stats.value.trim() ? JSON.parse(e.stats.value) : null, reportedSignatureAcknowledged: e.reportedSignatureAcknowledged.checked };
        if (editing) {
          model.updateEntry(editing, input);
          editing = null;
          safeDraw();
        } else model.addEntry(selectedPage, input);
      } catch {
        status.textContent = "Review exact ID, positive integer quantity, units and stat fields. Unknown is allowed; maximum200 stacks. Nothing was inferred or uploaded.";
      }
    });
    for (const event of ["online", "offline"]) w.addEventListener(event, safeDraw);
    d.addEventListener("visibilitychange", safeDraw);
    safeDraw();
    return Object.freeze({ model, connectOwnSiteCache, setEnabled, clear, state: () => ({ enabled: model.enabled, cache: controller?.state() ?? null, disposed }), async refresh() {
      if (!controller) return { status: "not_connected" };
      const r = await controller.refresh(model.reviewedIds());
      await flushSnapshots();
      safeDraw();
      return r;
    }, getConnection: () => connection ? { origin: connection.origin, priceProfile: connection.priceProfile ?? "legacy_dated" } : null, dispose() {
      disposed = true;
      screenshots?.dispose();
      stopAgeTimer();
      controller?.disable();
      unsubscribe();
      for (const event of ["online", "offline"]) w.removeEventListener(event, safeDraw);
      d.removeEventListener("visibilitychange", safeDraw);
    } });
  }

  // ui-src/inventory-manual/site-entry.mjs
  function mountInventoryPreview(doc) {
    const w = doc.defaultView, view = doc.getElementById("view-inventory"), host = doc.getElementById("inventory-workspace"), inactive = doc.getElementById("inventory-inactive"), note = doc.getElementById("inventory-access-note"), enable = doc.getElementById("inventory-enable-page"), nav = doc.getElementById("inventory-nav"), options = doc.getElementById("display-options");
    if (!w || !view || !host || !inactive || !note || !enable || !nav || !options) return null;
    let wanted = false, api = null, mounting = null, disposed = false, revoking = false, lastVerified = false;
    const make = (tag, text2) => {
      const n = doc.createElement(tag);
      if (text2 !== void 0) n.textContent = text2;
      return n;
    };
    const controls = make("div");
    controls.className = "inventory-preview-options";
    controls.dataset.previewControls = "manual-inventory";
    controls.setAttribute("role", "group");
    controls.setAttribute("aria-label", "Manual inventory workspace");
    const toggle = make("button");
    toggle.id = "inventory-preview-toggle";
    toggle.type = "button";
    toggle.setAttribute("aria-controls", "view-inventory inventory-nav");
    controls.append(toggle, make("small", "Off in each tab. Manual declarations only; explicit Refresh reads existing own-site cached references. Local screenshot review; no OCR or IGN lookup."));
    options.append(controls);
    function verified() {
      try {
        const s = w.AstraPrivateWorkspace?.current?.();
        return s?.verified === true && s.mode === "private_workspace" && Number.isSafeInteger(s.expiresAt) && s.expiresAt > w.Date.now();
      } catch {
        return false;
      }
    }
    const onRoute = () => w.location.hash === "#inventory", visibleOnline = () => !doc.hidden && w.navigator.onLine !== false;
    function desired() {
      return !disposed && wanted && onRoute() && visibleOnline() && verified();
    }
    function state() {
      const p = api?.state().cache;
      return Object.freeze({ wanted, active: api?.model.enabled === true, privateWorkspaceVerified: verified(), mounted: !!api, mountPending: !!mounting, physicalPending: p?.physical.physicalPending ?? 0, actionPending: p?.actionPending ?? false, cacheStatus: p?.status ?? "not_connected", sourceClocksRenewed: false, automaticInventoryRequests: 0 });
    }
    function draw() {
      const allowed = verified();
      toggle.textContent = "Manual inventory page: " + (wanted ? "On" : "Off");
      toggle.setAttribute("aria-pressed", String(wanted));
      toggle.disabled = disposed || !allowed;
      enable.disabled = disposed || !allowed;
      nav.hidden = !wanted || !allowed;
      inactive.hidden = !!api && allowed;
      host.hidden = !api || !allowed;
      note.textContent = !allowed ? "Existing private workspace is not verified. Use the site's existing preview controls; no inventory password prompt is added." : "Manual entry is local to this tab. Enable the workspace; Refresh is a separate explicit cached-reference check.";
    }
    function resetPrivate() {
      if (revoking) return;
      revoking = true;
      try {
        wanted = false;
        api?.setEnabled(false);
        api?.clear();
        for (const form of host.querySelectorAll("form")) form.reset();
        host.hidden = true;
      } finally {
        revoking = false;
      }
    }
    function transportAllowed() {
      const allowed = verified();
      if (!allowed && !revoking && api) resetPrivate();
      return allowed && !disposed && onRoute() && visibleOnline();
    }
    function profile() {
      const type = doc.body.dataset.searchIdentityProfile;
      if (type === void 0) return { priceProfile: "legacy_dated" };
      if (type === "price_free_owned_membership_v2" && validPublicEpoch(doc.body.dataset.fastItemEpoch) && validPublicEpoch(doc.body.dataset.searchIdentityEpoch)) return { priceProfile: "fast_ordered", fastEpoch: doc.body.dataset.fastItemEpoch, identityEpoch: doc.body.dataset.searchIdentityEpoch };
      throw Error("inventory_profile_unavailable");
    }
    async function ensureMounted() {
      if (api) return api;
      if (mounting) return mounting;
      mounting = mountManualInventory(host, { autoConnect: false, isAvailable: transportAllowed, onToggle: (value) => {
        wanted = value === true && verified();
        sync();
      } }).then((value) => {
        api = value;
        if (approvedInventoryOrigin(w.location.origin)) {
          try {
            api.connectOwnSiteCache({ origin: w.location.origin, ...profile(), fetcher: (...args) => w.fetch(...args) });
          } catch {
            api.model.setCacheState("unavailable");
          }
        }
        if (!verified()) resetPrivate();
        else api.setEnabled(desired());
        draw();
        return api;
      }).catch(() => {
        wanted = false;
        note.textContent = "The manual workspace could not be prepared. No inventory reference was requested.";
        draw();
        return null;
      }).finally(() => {
        mounting = null;
      });
      return mounting;
    }
    function sync() {
      if (disposed) return;
      const allowed = verified();
      if (!allowed && (lastVerified || api)) resetPrivate();
      lastVerified = allowed;
      if (api) api.setEnabled(desired());
      else if (desired()) void ensureMounted();
      draw();
    }
    function setEnabled(value) {
      if (typeof value !== "boolean") throw TypeError("inventory_enabled");
      wanted = value && verified() && !disposed;
      sync();
      return state();
    }
    toggle.addEventListener("click", () => setEnabled(!wanted));
    enable.addEventListener("click", () => setEnabled(true));
    const guard = (event) => {
      if (verified()) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      resetPrivate();
      draw();
    };
    const guarded = ["beforeinput", "paste", "drop", "submit", "click", "change"];
    for (const name of guarded) host.addEventListener(name, guard, true);
    const hide = () => {
      resetPrivate();
      draw();
    };
    w.addEventListener("hashchange", sync);
    w.addEventListener("online", sync);
    w.addEventListener("offline", sync);
    w.addEventListener("pagehide", hide);
    doc.addEventListener("visibilitychange", sync);
    doc.addEventListener("astraprivateworkspace", sync);
    sync();
    return Object.freeze({ getState: state, setEnabled, dispose() {
      if (disposed) return;
      resetPrivate();
      disposed = true;
      api?.dispose();
      w.removeEventListener("hashchange", sync);
      w.removeEventListener("online", sync);
      w.removeEventListener("offline", sync);
      w.removeEventListener("pagehide", hide);
      doc.removeEventListener("visibilitychange", sync);
      doc.removeEventListener("astraprivateworkspace", sync);
      for (const n of guarded) host.removeEventListener(n, guard, true);
      draw();
    } });
  }
  if (typeof document !== "undefined" && !window.AstraInventoryPreview) {
    const api = mountInventoryPreview(document);
    if (api) Object.defineProperty(window, "AstraInventoryPreview", { value: api, writable: false, configurable: false });
  }
})();

})();

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "inventory-preview.js", status: "initialization_failed"}})); } catch {}
}

;
/* Astra source: scrolling-preview.js */
try {
(() => {
'use strict';
(() => {
  // ui-src/scrolling-joint/solver/joint-rational.mjs
  var owned = /* @__PURE__ */ new WeakSet();
  var BITS = 4096;
  var need = (ok, code) => {
    if (!ok) throw Error(code);
  };
  var abs = (n) => n < 0n ? -n : n;
  var bits = (n) => abs(n).toString(2).length;
  var gcd = (a, b) => {
    a = abs(a);
    b = abs(b);
    while (b) {
      const t = a % b;
      a = b;
      b = t;
    }
    return a;
  };
  function normalized(n, d) {
    need(typeof n === "bigint" && typeof d === "bigint" && d !== 0n && bits(n) <= BITS * 2 && bits(d) <= BITS * 2, "rational_intermediate_bound");
    if (d < 0n) {
      n = -n;
      d = -d;
    }
    const g = gcd(n, d);
    n /= g;
    d /= g;
    need(bits(n) <= BITS && bits(d) <= BITS, "rational_size_bound");
    const out = Object.freeze(Object.assign(/* @__PURE__ */ Object.create(null), { n, d }));
    owned.add(out);
    return out;
  }
  function rational(n, d = 1n) {
    need(typeof n === "bigint" && typeof d === "bigint" && bits(n) <= BITS && bits(d) <= BITS, "rational_input_bound");
    return normalized(n, d);
  }
  var check = (x) => {
    need(owned.has(x), "owned_rational_required");
    return x;
  };
  var ZERO = rational(0n);
  var ONE = rational(1n);
  function parse(value) {
    need(typeof value === "string" && value.length <= 32 && /^(?:0|[1-9]\d{0,12})(?:\.\d{1,9}|\/[1-9]\d{0,8})?$/.test(value), "exact_decimal_or_rational_string");
    if (value.includes("/")) {
      const [n, d] = value.split("/");
      return rational(BigInt(n), BigInt(d));
    }
    if (value.includes(".")) {
      const [n, f] = value.split(".");
      return rational(BigInt(n + f), 10n ** BigInt(f.length));
    }
    return rational(BigInt(value));
  }
  function text(x) {
    check(x);
    return x.d === 1n ? String(x.n) : x.n + "/" + x.d;
  }
  function add(x, y) {
    check(x);
    check(y);
    const g = gcd(x.d, y.d), a = x.d / g, b = y.d / g;
    return normalized(x.n * b + y.n * a, a * y.d);
  }
  function neg(x) {
    check(x);
    return normalized(-x.n, x.d);
  }
  function sub(x, y) {
    return add(x, neg(y));
  }
  function mul(x, y) {
    check(x);
    check(y);
    const a = gcd(x.n, y.d), b = gcd(y.n, x.d);
    return normalized(x.n / a * (y.n / b), x.d / b * (y.d / a));
  }
  function div(x, y) {
    check(x);
    check(y);
    need(y.n !== 0n, "rational_divide_by_zero");
    return mul(x, normalized(y.d, y.n));
  }
  function compare(x, y) {
    check(x);
    check(y);
    const n = x.n * y.d - y.n * x.d;
    return n < 0n ? -1 : n > 0n ? 1 : 0;
  }
  function equal(x, y) {
    return compare(x, y) === 0;
  }
  function probability(value) {
    const x = parse(value);
    need(x.d <= 1000000000n && compare(x, ONE) <= 0, "bounded_rational_probability");
    return x;
  }
  function amount(value) {
    const x = parse(value);
    need(x.d <= 1000000000n && compare(x, rational(1000000000000n)) <= 0, "bounded_nonnegative_rational");
    return x;
  }

  // ui-src/scrolling-joint/solver/joint-mechanics.mjs
  var contexts = /* @__PURE__ */ new WeakMap();
  var states = /* @__PURE__ */ new WeakMap();
  var need2 = (ok, code) => {
    if (!ok) throw Error(code);
  };
  var tag = (v) => typeof v === "string" && /^[A-Za-z0-9_-]{1,48}$/.test(v);
  var integer = (v, max) => Number.isSafeInteger(v) && v >= 0 && v <= max;
  function own(value, keys) {
    need2(value && typeof value === "object" && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value)), "own_plain_record");
    const d = Object.getOwnPropertyDescriptors(value), names = Reflect.ownKeys(d);
    need2(names.length === keys.length && names.every((n) => typeof n === "string" && keys.includes(n) && Object.hasOwn(d[n], "value") && d[n].enumerable), "closed_own_data_fields");
    return Object.fromEntries(keys.map((n) => [n, d[n].value]));
  }
  function array(value, min, max) {
    need2(Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype, "own_plain_array");
    const d = Object.getOwnPropertyDescriptors(value), n = d.length?.value;
    need2(integer(n, max) && n >= min && Reflect.ownKeys(d).length === n + 1, "array_bound_or_extra_fields");
    const out = [];
    for (let i = 0; i < n; i++) {
      const v = d[String(i)];
      need2(v && Object.hasOwn(v, "value") && v.enumerable, "array_own_data_only");
      out.push(v.value);
    }
    return out;
  }
  function statVector(value, required = true) {
    need2(value && typeof value === "object" && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value)), "stat_vector_record");
    const d = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(d);
    need2(keys.length <= 16 && keys.every((k) => typeof k === "string" && /^\d{1,4}$/.test(k) && Object.hasOwn(d[k], "value") && d[k].enumerable && integer(d[k].value, 1e4)), "bounded_stat_vector");
    if (required) need2(["9", "14", "16"].every((k) => keys.includes(k)), "joint_stats_explicit");
    return Object.freeze(Object.fromEntries(keys.sort().map((k) => [k, d[k].value])));
  }
  var freeze = (value) => {
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
      for (const v of Object.values(value)) freeze(v);
      Object.freeze(value);
    }
    return value;
  };
  function state(ctx, v) {
    const out = Object.freeze({ ...v, stats: Object.freeze({ ...v.stats }) });
    states.set(out, ctx);
    return out;
  }
  function context(ctx) {
    const v = contexts.get(ctx);
    need2(v, "owned_mechanics_context");
    return v;
  }
  function liveState(ctx, s) {
    context(ctx);
    need2(states.get(s) === ctx, "same_mechanics_state_context");
    return s;
  }
  function createJointMechanics(value, { enabled = false } = {}) {
    if (enabled !== true) return Object.freeze({ status: "disabled", defaultEnabled: false });
    const root = own(value, ["schemaVersion", "kind", "currency", "acknowledged", "entries", "scrolls", "quotes", "grossBudget", "fees", "destroyedResiduals", "limits"]);
    need2(root.schemaVersion === 1 && root.kind === "private_joint_scrolling_manual_scenario_v1" && root.currency === "mesos" && root.acknowledged === true, "manual_contract_and_assumptions");
    const entryRows = array(root.entries, 1, 4), ruleRows = array(root.scrolls, 1, 4), entries = [], rules = [], entryKeys = /* @__PURE__ */ new Set(), ids = /* @__PURE__ */ new Set(), ruleKeys = /* @__PURE__ */ new Set();
    const limits = own(root.limits, ["decisions", "resets", "nodeCap"]);
    need2(integer(limits.decisions, 24) && integer(limits.resets, 3) && integer(limits.nodeCap, 12e3) && limits.nodeCap > 0, "finite_mechanics_limits");
    for (const value2 of entryRows) {
      const r = own(value2, ["key", "itemId", "quality", "stats", "slotsLeft", "upgrades", "cost", "stock"]);
      need2(tag(r.key) && !entryKeys.has(r.key) && tag(r.itemId) && tag(r.quality) && integer(r.slotsLeft, 10) && integer(r.upgrades, 100), "entry_mechanical_identity");
      entryKeys.add(r.key);
      ids.add(r.itemId);
      entries.push({ key: r.key, itemId: r.itemId, quality: r.quality, stats: statVector(r.stats), slotsLeft: r.slotsLeft, upgrades: r.upgrades, used: 0, failures: 0, destroyed: false });
    }
    for (const value2 of ruleRows) {
      const r = own(value2, ["key", "itemIds", "success", "gains", "destroyGivenFailure", "failureUsesSlot", "upgradeDeltaSuccess", "upgradeDeltaFailure", "cost", "stock"]);
      const itemIds = array(r.itemIds, 1, 4);
      need2(tag(r.key) && !ruleKeys.has(r.key) && itemIds.every(tag) && new Set(itemIds).size === itemIds.length && itemIds.every((i) => ids.has(i)), "rule_item_eligibility");
      need2(typeof r.failureUsesSlot === "boolean" && integer(r.upgradeDeltaSuccess, 10) && integer(r.upgradeDeltaFailure, 10), "explicit_slot_upgrade_rules");
      const gains = statVector(r.gains, false);
      for (const e of entries) if (itemIds.includes(e.itemId)) need2(Object.keys(gains).every((k) => Object.hasOwn(e.stats, k)), "gain_stat_missing_from_start");
      rules.push(freeze({ key: r.key, itemIds, success: probability(r.success), gains, destroyGivenFailure: probability(r.destroyGivenFailure), failureUsesSlot: r.failureUsesSlot, upgradeDeltaSuccess: r.upgradeDeltaSuccess, upgradeDeltaFailure: r.upgradeDeltaFailure }));
      ruleKeys.add(r.key);
    }
    const ctx = { status: "manual_mechanics_only", defaultEnabled: false, economicInputsAdmitted: false, sourceOrGameRulesVerified: false, limits: freeze(limits) };
    contexts.set(ctx, { rules: new Map(rules.map((r) => [r.key, r])) });
    ctx.entries = Object.freeze(entries.map((e) => Object.freeze({ key: e.key, state: state(ctx, Object.fromEntries(Object.entries(e).filter(([k]) => k !== "key"))) })));
    ctx.rules = Object.freeze(rules);
    return Object.freeze(ctx);
  }
  function branch(ctx, s, r, success, destroyed = false) {
    const stats3 = { ...s.stats };
    if (success) for (const [k, gain] of Object.entries(r.gains)) stats3[k] += gain;
    return state(ctx, { itemId: s.itemId, quality: s.quality, stats: stats3, slotsLeft: s.slotsLeft - (success ? 1 : Number(r.failureUsesSlot)), upgrades: s.upgrades + (success ? r.upgradeDeltaSuccess : r.upgradeDeltaFailure), used: s.used + 1, failures: s.failures + Number(!success), destroyed });
  }
  function transitions(ctx, s, key) {
    liveState(ctx, s);
    const r = context(ctx).rules.get(key);
    need2(r && r.itemIds.includes(s.itemId), "rule_not_eligible_for_item");
    if (s.destroyed || s.slotsLeft === 0) return Object.freeze([]);
    need2(s.used < 24, "attempt_horizon_bound");
    const failure = sub(ONE, r.success), out = [];
    for (const [p, success, dead] of [[r.success, true, false], [mul(failure, sub(ONE, r.destroyGivenFailure)), false, false], [mul(failure, r.destroyGivenFailure), false, true]]) if (!equal(p, ZERO)) out.push(Object.freeze({ probability: p, state: branch(ctx, s, r, success, dead) }));
    need2(equal(out.reduce((n, row) => add(n, row.probability), ZERO), ONE), "branch_probability_sum");
    return Object.freeze(out);
  }
  function priceKey(ctx, s) {
    liveState(ctx, s);
    need2(!s.destroyed, "destroyed_has_no_item_sale_quote");
    return JSON.stringify([s.itemId, s.quality, Object.entries(s.stats).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0), s.slotsLeft, s.upgrades]);
  }
  function stateKey(ctx, s) {
    liveState(ctx, s);
    return JSON.stringify([s.itemId, s.quality, Object.entries(s.stats).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0), s.slotsLeft, s.upgrades, s.used, s.failures, s.destroyed]);
  }
  function toWireState(ctx, s) {
    liveState(ctx, s);
    return freeze({ itemId: s.itemId, quality: s.quality, stats: { ...s.stats }, slotsLeft: s.slotsLeft, upgrades: s.upgrades, used: s.used, failures: s.failures, destroyed: s.destroyed });
  }
  var capability = Object.freeze({ kind: "private_joint_manual_mechanics_only_v1", defaultEnabled: false, admittedEconomicRecurrence: false, quoteOrSourceAuthority: false, probabilityEncoding: "exact_normalized_rational" });

  // ui-src/scrolling-joint/solver/joint-manual-wire.mjs
  var need3 = (ok, code) => {
    if (!ok) throw Error(code);
  };
  var integer2 = (v, max) => Number.isSafeInteger(v) && v >= 0 && v <= max;
  var tag2 = (v) => typeof v === "string" && /^[A-Za-z0-9_-]{1,48}$/.test(v);
  var INPUT_CAP = 65536;
  var U8 = Uint8Array;
  var typed = Object.getPrototypeOf(U8.prototype);
  var viewTag = Object.getOwnPropertyDescriptor(typed, Symbol.toStringTag).get;
  var viewLength = Object.getOwnPropertyDescriptor(typed, "byteLength").get;
  var viewOffset = Object.getOwnPropertyDescriptor(typed, "byteOffset").get;
  var viewBuffer = Object.getOwnPropertyDescriptor(typed, "buffer").get;
  var bufferLength = Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, "byteLength").get;
  var copyView = U8.prototype.set;
  function ownManualBytes(raw) {
    try {
      need3(viewTag.call(raw) === "Uint8Array", "manual_body_bound");
      const n = viewLength.call(raw), offset = viewOffset.call(raw), buffer = viewBuffer.call(raw), backing = bufferLength.call(buffer);
      need3(integer2(n, INPUT_CAP) && n > 0 && Number.isSafeInteger(offset) && offset >= 0 && Number.isSafeInteger(backing) && offset + n <= backing, "manual_body_bound");
      const out = new U8(n);
      copyView.call(out, raw);
      need3(viewLength.call(raw) === n && viewOffset.call(raw) === offset && viewBuffer.call(raw) === buffer && bufferLength.call(buffer) === backing, "manual_body_bound");
      return out;
    } catch {
      throw Error("manual_body_bound");
    }
  }
  function decodeManualBytes(raw) {
    raw = ownManualBytes(raw);
    need3(!(raw[0] === 239 && raw[1] === 187 && raw[2] === 191), "invalid_json");
    const source = new TextDecoder("utf-8", { fatal: true }).decode(raw);
    let at = 0, count = 0;
    const space = () => {
      while (/[\x20\t\r\n]/.test(source[at] ?? "x")) at++;
    };
    function string() {
      need3(source[at] === '"', "invalid_json");
      const start = at++;
      let escaped = false;
      for (; at < source.length; at++) {
        const c = source[at];
        if (c === '"' && !escaped) {
          at++;
          const value2 = JSON.parse(source.slice(start, at));
          need3(value2.length <= 256, "manual_string_bound");
          return value2;
        }
        if (c === "\\" && !escaped) escaped = true;
        else escaped = false;
      }
      throw Error("invalid_json");
    }
    function value(depth = 0) {
      need3(++count <= 16e3 && depth <= 12, "manual_tree_bound");
      space();
      const c = source[at];
      if (c === '"') return string();
      if (c === "{") {
        at++;
        space();
        const out2 = /* @__PURE__ */ Object.create(null), keys = /* @__PURE__ */ new Set();
        if (source[at] === "}") {
          at++;
          return out2;
        }
        while (true) {
          space();
          const key = string();
          need3(key.length <= 48 && !keys.has(key), "duplicate_or_bounded_json_key");
          keys.add(key);
          space();
          need3(source[at++] === ":", "invalid_json");
          out2[key] = value(depth + 1);
          space();
          const next = source[at++];
          if (next === "}") return out2;
          need3(next === ",", "invalid_json");
        }
      }
      if (c === "[") {
        at++;
        space();
        const out2 = [];
        if (source[at] === "]") {
          at++;
          return out2;
        }
        while (true) {
          need3(out2.length < 256, "manual_array_bound");
          out2.push(value(depth + 1));
          space();
          const next = source[at++];
          if (next === "]") return out2;
          need3(next === ",", "invalid_json");
        }
      }
      for (const [word, result] of [["true", true], ["false", false], ["null", null]]) if (source.startsWith(word, at)) {
        at += word.length;
        return result;
      }
      const token = source.slice(at).match(/^-?(?:0|[1-9]\d*)/);
      need3(token && token[0].length <= 17, "integer_or_exact_string_required");
      at += token[0].length;
      const n = Number(token[0]);
      need3(Number.isSafeInteger(n), "bounded_integer");
      return n;
    }
    const out = value();
    space();
    need3(at === source.length, "invalid_json");
    return out;
  }
  function capture(value) {
    let count = 0;
    function clone(v, depth = 0) {
      need3(++count <= 16e3 && depth <= 12, "manual_tree_bound");
      if (v === null || typeof v === "boolean" || typeof v === "number" && Number.isSafeInteger(v)) return v;
      if (typeof v === "string") {
        need3(v.length <= 256, "manual_string_bound");
        return v;
      }
      need3(v && typeof v === "object", "integer_or_exact_string_required");
      const array3 = Array.isArray(v);
      need3(Object.getPrototypeOf(v) === (array3 ? Array.prototype : Object.prototype) || !array3 && Object.getPrototypeOf(v) === null, "own_plain_data");
      const d = Object.getOwnPropertyDescriptors(v), keys = Reflect.ownKeys(d);
      need3(keys.length <= 257 && keys.every((k) => typeof k === "string" && Object.hasOwn(d[k], "value")), "own_data_only");
      if (array3) {
        const n = d.length?.value;
        need3(integer2(n, 256) && keys.length === n + 1, "manual_array_bound");
        const out2 = [];
        for (let i = 0; i < n; i++) {
          need3(d[i] && d[i].enumerable, "own_array_data");
          out2.push(clone(d[i].value, depth + 1));
        }
        return out2;
      }
      const out = /* @__PURE__ */ Object.create(null);
      for (const k of keys) {
        need3(k.length <= 48 && d[k].enumerable, "manual_key_bound");
        out[k] = clone(d[k].value, depth + 1);
      }
      return out;
    }
    return clone(value);
  }
  var exact = (v, fields) => need3(v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === fields.length && fields.every((k) => Object.hasOwn(v, k)), "closed_manual_schema");
  var array2 = (v, min, max) => {
    need3(Array.isArray(v) && v.length >= min && v.length <= max, "manual_counts");
    return v;
  };
  var stock = (v) => need3(v === null || integer2(v, 100), "stock_cap_or_unknown");
  var freeze2 = (v) => {
    if (v && typeof v === "object" && !Object.isFrozen(v)) {
      for (const x of Object.values(v)) freeze2(x);
      Object.freeze(v);
    }
    return v;
  };
  function stats(v) {
    need3(v && typeof v === "object" && !Array.isArray(v), "full_stat_vector");
    const keys = Object.keys(v);
    need3(keys.length <= 16 && keys.every((k) => /^\d{1,4}$/.test(k) && integer2(v[k], 1e4)) && ["9", "14", "16"].every((k) => keys.includes(k)), "joint_stats_explicit");
    return Object.fromEntries(keys.sort().map((k) => [k, v[k]]));
  }
  function identity(v, ids = null) {
    need3(tag2(v.itemId) && tag2(v.quality) && integer2(v.slotsLeft, 10) && integer2(v.upgrades, 100) && (!ids || ids.has(v.itemId)), "quote_full_identity");
    v.stats = stats(v.stats);
    return v;
  }
  function tupleKey(v) {
    return [v.itemId, v.quality, Object.entries(v.stats).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0), v.slotsLeft, v.upgrades];
  }
  var encodedKey = (key) => JSON.stringify(key);
  function instant(v) {
    const m = typeof v === "string" && v.match(/^(20\d\d)-(\d\d)-(\d\d)T(\d\d):(\d\d):(\d\d)(?:\.(\d{1,6}))?(?:Z|\+00:00)$/);
    need3(m, "saved_reference_provenance");
    const [y, mo, d, h, mi, s] = m.slice(1, 7).map(Number);
    need3(mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && h <= 23 && mi <= 59 && s <= 59, "saved_reference_provenance");
    const stamp = Date.UTC(y, mo - 1, d, h, mi, s), date = new Date(stamp);
    need3(date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d, "saved_reference_provenance");
    return BigInt(stamp) * 1000n + BigInt((m[7] ?? "").padEnd(6, "0"));
  }
  function evidence(e) {
    if (e?.kind === "manual") {
      exact(e, ["kind"]);
      return { kind: "manual", basis: "assumption", samples: null, captured_at: null, source_observed_at: null, raw_sha256: null };
    }
    exact(e, ["kind", "basis", "samples", "capturedAt", "sourceObservedAt", "rawSha256"]);
    need3(e.kind === "saved_exact_reference_assumption" && ["sold", "listed"].includes(e.basis) && integer2(e.samples, 1e9) && typeof e.rawSha256 === "string" && /^[a-f0-9]{64}$/.test(e.rawSha256), "saved_reference_provenance");
    const capture2 = instant(e.capturedAt);
    if (e.sourceObservedAt !== null) need3(instant(e.sourceObservedAt) <= capture2, "quote_clock_order");
    return { kind: e.kind, basis: e.basis, samples: e.samples, captured_at: e.capturedAt, source_observed_at: e.sourceObservedAt, raw_sha256: e.rawSha256 };
  }
  function admitManualWire(input) {
    const root = capture(input);
    exact(root, ["schemaVersion", "kind", "currency", "acknowledged", "entries", "scrolls", "quotes", "grossBudget", "fees", "destroyedResiduals", "limits"]);
    need3(root.schemaVersion === 1 && root.kind === "private_joint_scrolling_manual_scenario_v1" && root.currency === "mesos" && root.acknowledged === true, "manual_contract_and_assumptions");
    array2(root.entries, 1, 4);
    array2(root.scrolls, 1, 4);
    array2(root.quotes, 0, 256);
    array2(root.destroyedResiduals, 1, 4);
    exact(root.fees, ["rate", "fixed"]);
    exact(root.limits, ["decisions", "resets", "nodeCap"]);
    need3(integer2(root.limits.decisions, 24) && integer2(root.limits.resets, 3), "finite_policy_bounds");
    need3(integer2(root.limits.nodeCap, 12e3) && root.limits.nodeCap > 0, "node_cap");
    const budget = amount(root.grossBudget), fee = amount(root.fees.rate), fixed = amount(root.fees.fixed);
    need3(compare(fee, ONE) < 0, "finite_policy_bounds");
    const ids = /* @__PURE__ */ new Set(), entryKeys = /* @__PURE__ */ new Set(), ruleKeys = /* @__PURE__ */ new Set(), quoteKeys = /* @__PURE__ */ new Set(), entries = [], rules = [], quotes = [], residuals = [];
    for (const e of root.entries) {
      exact(e, ["key", "itemId", "quality", "stats", "slotsLeft", "upgrades", "cost", "stock"]);
      identity(e);
      need3(tag2(e.key) && !entryKeys.has(e.key), "unique_cost_keys");
      stock(e.stock);
      entryKeys.add(e.key);
      ids.add(e.itemId);
      entries.push({ key: e.key, cost: amount(e.cost), stock: e.stock });
    }
    for (const r of root.scrolls) {
      exact(r, ["key", "itemIds", "success", "gains", "destroyGivenFailure", "failureUsesSlot", "upgradeDeltaSuccess", "upgradeDeltaFailure", "cost", "stock"]);
      need3(tag2(r.key) && !ruleKeys.has(r.key), "unique_cost_keys");
      array2(r.itemIds, 1, 4);
      need3(new Set(r.itemIds).size === r.itemIds.length && r.itemIds.every((i) => tag2(i) && ids.has(i)), "scroll_item_eligibility");
      probability(r.success);
      probability(r.destroyGivenFailure);
      need3(typeof r.failureUsesSlot === "boolean" && integer2(r.upgradeDeltaSuccess, 10) && integer2(r.upgradeDeltaFailure, 10), "explicit_slot_and_upgrade_rules_required");
      need3(r.gains && typeof r.gains === "object" && !Array.isArray(r.gains) && Object.keys(r.gains).length <= 16 && Object.entries(r.gains).every(([k, v]) => /^\d{1,4}$/.test(k) && integer2(v, 1e4)), "invalid_stat_vector");
      for (const e of root.entries) if (r.itemIds.includes(e.itemId)) need3(Object.keys(r.gains).every((k) => Object.hasOwn(e.stats, k)), "gain_stat_missing_from_start");
      need3(typeof r.cost === "string" && !r.cost.includes("/"), "scroll_cost_decimal_lexeme");
      stock(r.stock);
      rules.push({ key: r.key, cost: amount(r.cost), stock: r.stock, itemIds: [...r.itemIds] });
      ruleKeys.add(r.key);
    }
    for (const q of root.quotes) {
      exact(q, ["itemId", "quality", "stats", "slotsLeft", "upgrades", "gross", "evidence"]);
      identity(q, ids);
      const key = tupleKey(q), encoded = encodedKey(key);
      need3(!quoteKeys.has(encoded), "unique_exact_quote");
      quoteKeys.add(encoded);
      quotes.push({ key, encoded, gross: amount(q.gross), evidence: evidence(q.evidence) });
    }
    const residualIds = /* @__PURE__ */ new Set();
    for (const r of root.destroyedResiduals) {
      exact(r, ["itemId", "gross"]);
      need3(tag2(r.itemId) && ids.has(r.itemId) && !residualIds.has(r.itemId), "explicit_destroyed_residuals");
      residualIds.add(r.itemId);
      residuals.push({ id: r.itemId, gross: amount(r.gross) });
    }
    need3(residualIds.size === ids.size, "explicit_destroyed_residuals");
    return freeze2({ wire: root, budget, fee, fixed, entries, rules, quotes, residuals, limits: root.limits, sourceOrGameRulesVerified: false });
  }

  // ui-src/scrolling-joint/scenario-model.mjs
  var fail = (code) => {
    throw Error(code);
  };
  var freeze3 = (value) => {
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
      for (const v of Object.values(value)) freeze3(v);
      Object.freeze(value);
    }
    return value;
  };
  function integer3(value, max) {
    if (typeof value !== "string" || !/^\d{1,5}$/.test(value) || !Number.isSafeInteger(+value) || +value > max) fail("explicit_integer_required");
    return +value;
  }
  var stock2 = (value) => value.trim() === "" ? null : integer3(value, 100);
  function percent(value) {
    if (typeof value !== "string" || value.trim() === "") fail("explicit_percentage_required");
    return text(div(parse(value.trim()), rational(100n)));
  }
  function stats2(rows) {
    const out = {};
    if (rows.length > 16) fail("stat_row_bound");
    for (const [code, value] of rows) {
      if (!/^\d{1,4}$/.test(code) || Object.hasOwn(out, code)) fail("unique_stat_code_required");
      out[code] = integer3(value, 1e4);
    }
    if (!["9", "14", "16"].every((k) => Object.hasOwn(out, k))) fail("joint_stats_explicit");
    return out;
  }
  var quoteKey = (row) => JSON.stringify([row.itemId, row.quality, Object.entries(row.stats).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0), row.slotsLeft, row.upgrades]);
  function envelope({ entries, scrolls, quotes = [], budget = "", feePercent = "", fixedFee = "", residuals = [], decisions = "5", resets = "0", acknowledged = false }) {
    if (entries.length < 1 || entries.length > 4 || scrolls.length < 1 || scrolls.length > 4 || quotes.length > 256) fail("row_bound");
    return { schemaVersion: 1, kind: "private_joint_scrolling_manual_scenario_v1", currency: "mesos", acknowledged, entries, scrolls, quotes, grossBudget: budget, fees: { rate: percent(feePercent), fixed: fixedFee }, destroyedResiduals: residuals, limits: { decisions: integer3(decisions, 24), resets: integer3(resets, 3), nodeCap: 12e3 } };
  }
  function generateQuoteRows(wire2) {
    const ctx = createJointMechanics({ ...wire2, acknowledged: true }, { enabled: true }), quotes = /* @__PURE__ */ new Map(), seen = /* @__PURE__ */ new Set(), queue = ctx.entries.map((x) => [x.state, 0]);
    let at = 0;
    while (at < queue.length) {
      const [s, depth] = queue[at++], sk = stateKey(ctx, s) + "|" + depth;
      if (seen.has(sk)) continue;
      seen.add(sk);
      if (seen.size > 12e3) fail("quote_generation_state_budget");
      const w = toWireState(ctx, s);
      if (w.destroyed) continue;
      const key = priceKey(ctx, s);
      if (!quotes.has(key)) {
        if (quotes.size === 256) fail("quote_grid_bound_256");
        quotes.set(key, freeze3({ itemId: w.itemId, quality: w.quality, stats: { ...w.stats }, slotsLeft: w.slotsLeft, upgrades: w.upgrades, gross: "", evidence: { kind: "manual" } }));
      }
      if (depth >= ctx.limits.decisions || w.slotsLeft === 0) continue;
      for (const rule of ctx.rules) if (rule.itemIds.includes(w.itemId)) for (const row of transitions(ctx, s, rule.key)) queue.push([row.state, depth + 1]);
      if (queue.length > 36e3) fail("quote_generation_state_budget");
    }
    return Object.freeze([...quotes.values()]);
  }
  function admittedSnapshot(wire2) {
    const captured = admitManualWire(wire2).wire, raw = new TextEncoder().encode(JSON.stringify(captured));
    if (raw.byteLength > 65536) fail("manual_body_bound");
    return captured;
  }
  function money(value) {
    if (typeof value !== "string" || !/^(-?\d+)(?:\/(\d+))?$/.test(value) || value.length > 5e3) return { display: "Unknown", exact: "Unknown" };
    const [n0, d0 = "1"] = value.split("/"), n = BigInt(n0), d = BigInt(d0);
    if (d <= 0n) return { display: "Unknown", exact: "Unknown" };
    const sign = n < 0n ? "-" : "", a = n < 0n ? -n : n, scaled = (a * 100n + d / 2n) / d, whole = (scaled / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ","), fraction = (scaled % 100n).toString().padStart(2, "0");
    return { display: sign + whole + (fraction === "00" ? "" : "." + fraction), exact: value };
  }

  // ui-src/scrolling-joint/manual-examples.json
  var manual_examples_default = {
    workGloves: {
      label: "Synthetic Work Gloves / GFA-like (2 Crit partial)",
      warning: "Every identity, stat, slot, rate, price, fee and stock below is a manual synthetic assumption. No MCW/GMS rule, obtainable stock or realizable sale is verified.",
      entries: [{ key: "partial", itemId: "WG_MANUAL", quality: "SYNTHETIC", stats: { "9": 0, "14": 2, "16": 0 }, slotsLeft: 2, upgrades: 0, cost: "4", stock: 1 }],
      scrolls: [{ key: "GFA_HYPOTHETICAL", itemIds: ["WG_MANUAL"], success: "1", gains: { "9": 0, "14": 0, "16": 2 }, destroyGivenFailure: "0", failureUsesSlot: true, upgradeDeltaSuccess: 1, upgradeDeltaFailure: 0, cost: "1", stock: 2 }],
      budget: "6",
      feePercent: "0",
      fixedFee: "0",
      residuals: [{ itemId: "WG_MANUAL", gross: "0" }],
      decisions: "2",
      resets: "0",
      quoteByState: [{ stats: { "9": 0, "14": 2, "16": 0 }, slotsLeft: 2, upgrades: 0, gross: "4" }, { stats: { "9": 0, "14": 2, "16": 2 }, slotsLeft: 1, upgrades: 1, gross: "5" }, { stats: { "9": 0, "14": 2, "16": 4 }, slotsLeft: 0, upgrades: 2, gross: "100" }]
    },
    blueArten: {
      label: "Synthetic Blue Arten / GFMA-like \u2014 identity unverified",
      warning: "BlueArten_MANUAL and GFMA_HYPOTHETICAL are labels, not verified catalogue IDs or game mechanics. All base stats, slots, rates, prices, fees, stock and outcomes are synthetic.",
      entries: [{ key: "base", itemId: "BlueArten_MANUAL", quality: "SYNTHETIC", stats: { "9": 1, "14": 0, "16": 0 }, slotsLeft: 1, upgrades: 0, cost: "10", stock: 1 }],
      scrolls: [{ key: "GFMA_HYPOTHETICAL", itemIds: ["BlueArten_MANUAL"], success: "1/2", gains: { "9": 2, "14": 0, "16": 0 }, destroyGivenFailure: "0", failureUsesSlot: true, upgradeDeltaSuccess: 1, upgradeDeltaFailure: 0, cost: "2", stock: 1 }],
      budget: "12",
      feePercent: "0",
      fixedFee: "0",
      residuals: [{ itemId: "BlueArten_MANUAL", gross: "0" }],
      decisions: "1",
      resets: "0",
      quoteByState: [{ stats: { "9": 1, "14": 0, "16": 0 }, slotsLeft: 1, upgrades: 0, gross: "10" }, { stats: { "9": 3, "14": 0, "16": 0 }, slotsLeft: 0, upgrades: 1, gross: "30" }, { stats: { "9": 1, "14": 0, "16": 0 }, slotsLeft: 0, upgrades: 0, gross: "5" }]
    }
  };

  // ui-src/scrolling-joint/client-reference.mjs
  var reference = {
    "schemaVersion": 1,
    "region": "MCW",
    "clientVersion": "1",
    "authority": "cached_client_template_not_server_or_market",
    "records": [
      {
        "id": 1082e3,
        "name": "Work Gloves",
        "url": "https://maplestory.io/api/MCW/1/item/1082000",
        "retrievedAt": "2026-11-05T21:39:16.049945+00:00",
        "rawSha256": "be2c8e6fd997d6724cc92dead0c3a59912ee02385b7726ff0d841bf4f6227ef8",
        "fields": [
          {
            "rawField": "tuc",
            "pointer": "/metaInfo/tuc",
            "present": true,
            "value": 5
          },
          {
            "rawField": "incCRT",
            "pointer": "/metaInfo/incCRT",
            "present": true,
            "value": 1
          },
          {
            "rawField": "incPDD",
            "pointer": "/metaInfo/incPDD",
            "present": true,
            "value": 6
          },
          {
            "rawField": "incINT",
            "pointer": "/metaInfo/incINT",
            "present": false,
            "value": null
          },
          {
            "rawField": "incPAD",
            "pointer": "/metaInfo/incPAD",
            "present": false,
            "value": null
          },
          {
            "rawField": "incWAT",
            "pointer": "/metaInfo/incWAT",
            "present": false,
            "value": null
          },
          {
            "rawField": "incMAD",
            "pointer": "/metaInfo/incMAD",
            "present": false,
            "value": null
          },
          {
            "rawField": "success",
            "pointer": "/metaInfo/success",
            "present": false,
            "value": null
          }
        ],
        "retrievalLabel": "(Nov 5, 09:39 PM UTC, 2026)"
      },
      {
        "id": 1082056,
        "name": "Blue Arten",
        "url": "https://maplestory.io/api/MCW/1/item/1082056",
        "retrievedAt": "2026-11-08T22:28:41.307479+00:00",
        "rawSha256": "34090328af1c93828d7ef4d20f10e7a716972a66642313d8bd098317e10d9037",
        "fields": [
          {
            "rawField": "tuc",
            "pointer": "/metaInfo/tuc",
            "present": true,
            "value": 5
          },
          {
            "rawField": "incINT",
            "pointer": "/metaInfo/incINT",
            "present": true,
            "value": 4
          },
          {
            "rawField": "incCRT",
            "pointer": "/metaInfo/incCRT",
            "present": true,
            "value": 2
          },
          {
            "rawField": "incPAD",
            "pointer": "/metaInfo/incPAD",
            "present": false,
            "value": null
          },
          {
            "rawField": "incWAT",
            "pointer": "/metaInfo/incWAT",
            "present": false,
            "value": null
          },
          {
            "rawField": "incMAD",
            "pointer": "/metaInfo/incMAD",
            "present": false,
            "value": null
          },
          {
            "rawField": "success",
            "pointer": "/metaInfo/success",
            "present": false,
            "value": null
          }
        ],
        "retrievalLabel": "(Nov 8, 10:28 PM UTC, 2026)"
      },
      {
        "id": 2040801,
        "name": "Gloves Attack Scroll: Intermediate",
        "url": "https://maplestory.io/api/MCW/1/item/2040801",
        "retrievedAt": "2026-11-08T22:28:41.429645+00:00",
        "rawSha256": "1f5072809227789ad1ad9ff0831ce00614128a64f3e3e25b71d403c1e61960f5",
        "fields": [
          {
            "rawField": "tuc",
            "pointer": "/metaInfo/tuc",
            "present": false,
            "value": null
          },
          {
            "rawField": "incINT",
            "pointer": "/metaInfo/incINT",
            "present": false,
            "value": null
          },
          {
            "rawField": "incCRT",
            "pointer": "/metaInfo/incCRT",
            "present": false,
            "value": null
          },
          {
            "rawField": "incPAD",
            "pointer": "/metaInfo/incPAD",
            "present": false,
            "value": null
          },
          {
            "rawField": "incWAT",
            "pointer": "/metaInfo/incWAT",
            "present": true,
            "value": 2
          },
          {
            "rawField": "incMAD",
            "pointer": "/metaInfo/incMAD",
            "present": false,
            "value": null
          },
          {
            "rawField": "success",
            "pointer": "/metaInfo/success",
            "present": true,
            "value": 60
          }
        ],
        "retrievalLabel": "(Nov 8, 10:28 PM UTC, 2026)"
      },
      {
        "id": 2040805,
        "name": "Gloves Magic Attack Scroll: Intermediate",
        "url": "https://maplestory.io/api/MCW/1/item/2040805",
        "retrievedAt": "2026-11-08T22:28:41.573934+00:00",
        "rawSha256": "d74c97e1eed73172acee616a58ff0b09cd6dc097de2c1e924b00a80071a28767",
        "fields": [
          {
            "rawField": "tuc",
            "pointer": "/metaInfo/tuc",
            "present": false,
            "value": null
          },
          {
            "rawField": "incINT",
            "pointer": "/metaInfo/incINT",
            "present": false,
            "value": null
          },
          {
            "rawField": "incCRT",
            "pointer": "/metaInfo/incCRT",
            "present": false,
            "value": null
          },
          {
            "rawField": "incPAD",
            "pointer": "/metaInfo/incPAD",
            "present": false,
            "value": null
          },
          {
            "rawField": "incWAT",
            "pointer": "/metaInfo/incWAT",
            "present": false,
            "value": null
          },
          {
            "rawField": "incMAD",
            "pointer": "/metaInfo/incMAD",
            "present": true,
            "value": 4
          },
          {
            "rawField": "success",
            "pointer": "/metaInfo/success",
            "present": true,
            "value": 60
          }
        ],
        "retrievalLabel": "(Nov 8, 10:28 PM UTC, 2026)"
      }
    ],
    "automaticRunnable": false
  };
  function freeze4(v) {
    if (v && typeof v === "object") {
      for (const x of Object.values(v)) freeze4(x);
      Object.freeze(v);
    }
    return v;
  }
  var cachedClientReference = freeze4(reference);
  var labels = { tuc: "Nominal template slots", incCRT: "Client Crit", incPDD: "Client physical defense", incINT: "Client INT (not MATT)", incPAD: "Client physical ATT field", incWAT: "Explicit Weapon ATT field", incMAD: "Explicit Magic ATT field", success: "Client success percentage" };
  function createCachedClientReference(d) {
    const node = (tag3, text2) => {
      const n = d.createElement(tag3);
      if (text2 !== void 0) n.textContent = text2;
      return n;
    };
    const panel = node("details");
    panel.className = "scrolling-client-reference";
    panel.dataset.clientReference = "MCW/1";
    panel.open = false;
    panel.append(node("summary", "Cached client reference notes (not verified server rules)"));
    panel.append(node("p", "These are MCW/1 client-template fields. They do not describe your owned roll or verify current server mechanics. Nothing here fills the form, supplies prices, confirms a rule, or calculates."));
    panel.append(node("p", "Failure-slot use, destruction, omitted gains, upgrade effects and server eligibility remain unknown. In particular, viewing these notes does not confirm the form\u2019s failure-uses-slot checkbox. Keep every manual assumption explicit."));
    for (const record of cachedClientReference.records) {
      const section = node("section");
      section.dataset.clientItemId = String(record.id);
      section.append(node("h3", record.name + " \u2014 client ID " + record.id));
      const clock = node("p", "Client metadata retrieved "), time = node("time", record.retrievalLabel);
      time.dateTime = record.retrievedAt;
      time.title = record.retrievedAt;
      clock.append(time);
      section.append(clock);
      const list = node("dl");
      for (const field of record.fields) {
        const term = node("dt", labels[field.rawField] || field.rawField), value = node("dd", field.present ? String(field.value) + (field.rawField === "success" ? "%" : "") : "Not present \u2014 unknown");
        value.dataset.rawField = field.rawField;
        value.dataset.present = String(field.present);
        value.dataset.jsonPointer = field.pointer;
        value.title = field.pointer + "; original body SHA256 " + record.rawSha256;
        list.append(term, value);
      }
      section.append(list, node("p", "Original public source: " + record.url), node("p", "Original body SHA256: " + record.rawSha256));
      panel.append(section);
    }
    panel.append(node("p", "Unknown is not zero. Blue Arten\u2019s client INT4 is not MATT4; the GFMA scroll\u2019s incMAD4 is a separate gain. Template slots are not remaining slots, and nominal Crit is not proof of quality or prior scrolling. No NPC template price, item median or asking count is a matched-state quote or executable inventory."));
    return panel;
  }

  // ui-src/scrolling-joint/page.mjs
  function createPage(host, { edit, calculate, clear, guard }) {
    const d = host.ownerDocument, el = (tag3, text2, cls) => {
      const n = d.createElement(tag3);
      if (text2 !== void 0) n.textContent = text2;
      if (cls) n.className = cls;
      return n;
    };
    const statNames = Object.freeze({ "16": "ATT", "14": "Crit", "9": "MATT" });
    const statText = (pairs) => pairs.map(([code, value]) => `${statNames[code] ?? "Unverified stat " + code}: ${value}`).join(" \xB7 ");
    const yesNo = (value) => ({ display: value === true ? "Yes" : value === false ? "No" : "Unknown", exact: JSON.stringify(value ?? null) });
    const matchedState = (key) => ({ display: `${key[0]} \xB7 Quality: ${key[1]} \xB7 ${statText(key[2])} \xB7 Slots left: ${key[3]} \xB7 Upgrades: ${key[4]}`, exact: JSON.stringify(key) });
    const fullState = (item) => ({ display: `${matchedState([item.identity, item.quality, item.state.stats, item.state.slots_left, item.state.upgrades]).display} \xB7 Scrolls applied to this item: ${item.state.used_scrolls} \xB7 Failed scrolls on this item: ${item.state.failures} \xB7 Destroyed: ${yesNo(item.state.destroyed).display}`, exact: JSON.stringify(item) });
    const action = (value) => ({ display: value === "sell_stop" ? "Sell and stop" : value === "do_not_enter" ? "Do not start a campaign" : typeof value === "string" && value.startsWith("scroll:") ? "Apply scroll " + value.slice("scroll:".length) : typeof value === "string" && value.startsWith("sell_rebuy:") ? "Sell and buy offer " + value.slice("sell_rebuy:".length) + " again" : "Unknown action", exact: typeof value === "string" ? value : JSON.stringify(value ?? null) });
    let presentationKeys = Object.freeze({ offers: Object.freeze([]), scrolls: Object.freeze([]) });
    const quantities = (values, keys, kind) => ({ display: values.map((value, i) => `${kind} ${keys[i] ?? String(i + 1)}: ${value}`).join(" \xB7 "), exact: JSON.stringify(values) });
    const button = (label, fn) => {
      const n = el("button", label);
      n.type = "button";
      n.addEventListener("click", fn);
      return n;
    };
    const field = (parent, label, key, value = "", type = "text", mechanical = false) => {
      const wrap = el("label"), n = el("input");
      wrap.append(el("span", label));
      n.type = type;
      n.autocomplete = "off";
      n.dataset.field = key;
      if (mechanical) n.dataset.mechanical = "true";
      if (type === "checkbox") n.checked = value === true;
      else {
        n.value = String(value);
        n.maxLength = 96;
      }
      wrap.append(n);
      parent.append(wrap);
      return n;
    };
    host.replaceChildren();
    const form = el("form", void 0, "scrolling-form");
    form.autocomplete = "off";
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      calculate();
    });
    host.append(form);
    const notice = el("p", "Manual assumptions only. No verified game rules, quotes, fees, available stock, liquidity, time to sale or market-profit claim. Original source capture: Unknown / manual.", "scrolling-warning");
    form.append(notice);
    form.append(createCachedClientReference(d));
    const actions = el("div", void 0, "scrolling-actions");
    for (const [key, x] of Object.entries(manual_examples_default)) actions.append(button("Load " + x.label, () => {
      if (!guard()) return;
      load(x);
      edit();
    }));
    actions.append(button("Clear declarations", clear));
    form.append(actions);
    const exampleNote = el("p", "No example loaded. Fields start blank.");
    form.append(exampleNote);
    const offers = el("section"), rules = el("section"), book = el("section");
    offers.append(el("h3", "Base / partial offers \u2014 exact joint state"));
    rules.append(el("h3", "Manual scroll rules"));
    book.append(el("h3", "Matched-state assumed gross resale quotes"));
    const offerRows = el("div"), ruleRows = el("div"), quoteRows = el("div");
    offers.append(offerRows);
    rules.append(ruleRows);
    book.append(el("p", "Blank means unknown, never zero. Keys include identity, quality, all stats, slots and upgrades. Mechanical generation may include states infeasible under your cash/stock limits; it supplies no prices."));
    let quotes = [];
    const val = (node, key) => node.querySelector(`[data-field="${key}"]`).value;
    function statFields(card, values = {}, gains = false) {
      const section = el("div", void 0, "scrolling-stats");
      for (const [code, label] of [["16", "ATT"], ["14", "Crit"], ["9", "MATT"]]) field(section, label, code, values[code] ?? "", "text", true);
      const extra = el("div", void 0, "scrolling-extra-stats");
      section.append(extra);
      function add2(code = "", value = "") {
        if (extra.children.length >= 13) return;
        const row = el("div", void 0, "scrolling-extra-row");
        field(row, "Extra stat code", "code", code, "text", true);
        field(row, gains ? "Gain" : "Value", "value", value, "text", true);
        row.append(button("Remove stat", () => {
          if (!guard()) return;
          row.remove();
          quotes = [];
          quoteRows.replaceChildren();
          edit();
        }));
        extra.append(row);
      }
      for (const [k, v] of Object.entries(values)) if (!["9", "14", "16"].includes(k)) add2(k, v);
      section.append(button("Add explicit stat", () => {
        if (!guard()) return;
        add2();
        quotes = [];
        quoteRows.replaceChildren();
        edit();
      }));
      card.append(section);
    }
    function getStats(card) {
      const section = card.querySelector(".scrolling-stats"), rows = ["9", "14", "16"].map((k) => [k, val(section, k)]);
      for (const row of section.querySelectorAll(".scrolling-extra-row")) rows.push([val(row, "code"), val(row, "value")]);
      return stats2(rows);
    }
    function offer(value = {}) {
      if (offerRows.children.length >= 4) return;
      const card = el("fieldset", void 0, "scrolling-offer");
      card.append(el("legend", "Offer " + (offerRows.children.length + 1)));
      for (const [k, label] of [["key", "Offer key"], ["itemId", "Manual item identity"], ["quality", "Exact quality"]]) field(card, label, k, value[k] ?? "", "text", true);
      statFields(card, value.stats);
      field(card, "Slots left", "slotsLeft", value.slotsLeft ?? "", "text", true);
      field(card, "Successful upgrades", "upgrades", value.upgrades ?? "", "text", true);
      field(card, "Buy cost (mesos)", "cost", value.cost ?? "");
      field(card, "Stock \u2014 blank unknown, 0 none", "stock", value.stock ?? "");
      field(card, "Destroyed residual gross (mesos)", "residual", value.residual ?? "");
      card.append(button("Remove offer", () => {
        if (!guard()) return;
        card.remove();
        quotes = [];
        quoteRows.replaceChildren();
        edit();
      }));
      offerRows.append(card);
    }
    function rule(value = {}) {
      if (ruleRows.children.length >= 4) return;
      const card = el("fieldset", void 0, "scrolling-rule");
      card.append(el("legend", "Rule " + (ruleRows.children.length + 1)));
      field(card, "Manual rule key", "key", value.key ?? "", "text", true);
      field(card, "Eligible manual item IDs (comma separated)", "itemIds", (value.itemIds || []).join(","), "text", true);
      field(card, "Success % (exact decimal or fraction)", "success", value.success === void 0 ? "" : percentage(value.success), "text", true);
      statFields(card, value.gains, true);
      field(card, "Destruction % conditional on failure", "destroy", value.destroyGivenFailure === void 0 ? "" : percentage(value.destroyGivenFailure), "text", true);
      field(card, "Failure consumes a slot", "failureUsesSlot", value.failureUsesSlot ?? true, "checkbox", true);
      field(card, "Upgrade increment on success", "upgradeDeltaSuccess", value.upgradeDeltaSuccess ?? "", "text", true);
      field(card, "Upgrade increment on failure", "upgradeDeltaFailure", value.upgradeDeltaFailure ?? "", "text", true);
      field(card, "Cost per scroll (decimal mesos)", "cost", value.cost ?? "");
      field(card, "Stock \u2014 blank unknown, 0 none", "stock", value.stock ?? "");
      card.append(button("Remove rule", () => {
        if (!guard()) return;
        card.remove();
        quotes = [];
        quoteRows.replaceChildren();
        edit();
      }));
      ruleRows.append(card);
    }
    offers.append(button("Add offer (max 4)", () => {
      if (!guard()) return;
      offer();
      edit();
    }));
    rules.append(button("Add rule (max 4)", () => {
      if (!guard()) return;
      rule();
      edit();
    }));
    const finite = el("fieldset");
    finite.append(el("legend", "Finite policy / costs"));
    field(finite, "Gross outlay budget \u2014 no sale reinvestment", "budget");
    field(finite, "Sale fee % (manual, no default)", "feePercent");
    field(finite, "Fixed sale fee (manual)", "fixedFee");
    const horizon = el("label", "Decision horizon (0\u201324) "), decisions = el("select");
    decisions.dataset.field = "decisions";
    for (let i = 0; i <= 24; i++) {
      const n = el("option", String(i));
      n.value = String(i);
      decisions.append(n);
    }
    decisions.value = "5";
    horizon.append(decisions);
    finite.append(horizon);
    const resetLabel = el("label", "Rebuy resets (0\u20133) "), resets = el("select");
    resets.dataset.field = "resets";
    for (let i = 0; i <= 3; i++) {
      const n = el("option", String(i));
      n.value = String(i);
      resets.append(n);
    }
    resetLabel.append(resets);
    finite.append(resetLabel, el("p", "Two / three / four complete five-slot campaigns need at least 11 / 17 / 23 decisions. Exact limits: 12,000 states, 4,096-bit rationals, 256 quote rows, 65,536-byte manual payload. Refusal is not an optimal result."));
    function wire2(acknowledged = false) {
      const entries = [...offerRows.children].map((c) => ({ key: val(c, "key").trim(), itemId: val(c, "itemId").trim(), quality: val(c, "quality").trim(), stats: getStats(c), slotsLeft: integer3(val(c, "slotsLeft"), 10), upgrades: integer3(val(c, "upgrades"), 100), cost: val(c, "cost").trim(), stock: stock2(val(c, "stock")) })), scrolls = [...ruleRows.children].map((c) => ({ key: val(c, "key").trim(), itemIds: val(c, "itemIds").split(",").map((s) => s.trim()), success: percent(val(c, "success")), gains: getStats(c), destroyGivenFailure: percent(val(c, "destroy")), failureUsesSlot: c.querySelector('[data-field="failureUsesSlot"]').checked, upgradeDeltaSuccess: integer3(val(c, "upgradeDeltaSuccess"), 10), upgradeDeltaFailure: integer3(val(c, "upgradeDeltaFailure"), 10), cost: val(c, "cost").trim(), stock: stock2(val(c, "stock")) }));
      const allResiduals = [...offerRows.children].map((c) => ({ itemId: val(c, "itemId").trim(), gross: val(c, "residual").trim() }));
      if (allResiduals.some((r) => allResiduals.some((x) => x.itemId === r.itemId && x.gross !== r.gross))) throw Error("same_item_residual_disagreement");
      const residuals = allResiduals.filter((r, i, a) => a.findIndex((x) => x.itemId === r.itemId) === i);
      return envelope({ entries, scrolls, quotes: quotes.flatMap((q, i) => {
        const gross = quoteRows.querySelector(`[data-quote="${i}"]`).value.trim();
        return gross === "" ? [] : [{ ...q, gross, evidence: { kind: "manual" } }];
      }), budget: val(finite, "budget").trim(), feePercent: val(finite, "feePercent"), fixedFee: val(finite, "fixedFee").trim(), residuals, decisions: decisions.value, resets: resets.value, acknowledged });
    }
    function renderQuotes(rows, values = []) {
      quotes = rows;
      quoteRows.replaceChildren();
      for (const [i, q] of rows.entries()) {
        const row = el("label", void 0, "scrolling-quote"), key = el("span", matchedState(JSON.parse(quoteKey(q))).display), input = el("input");
        key.dataset.exactQuoteKey = quoteKey(q);
        key.title = "Exact manually matched state retained in the quote key";
        input.autocomplete = "off";
        input.maxLength = 32;
        input.dataset.quote = String(i);
        input.setAttribute("aria-label", "Assumed gross mesos for " + key.textContent);
        input.placeholder = "Unknown";
        input.value = values.find((v) => quoteKey(v) === quoteKey(q))?.gross ?? "";
        row.append(key, input);
        quoteRows.append(row);
      }
    }
    book.append(button("Generate exact-state quote grid", () => {
      if (!guard()) return;
      try {
        const w = wire2(true);
        renderQuotes(generateQuoteRows(w), w.quotes);
        edit();
        status("Quote grid generated; all blank prices remain unknown.");
      } catch {
        status("Cannot generate: check explicit identities/stats/rules/fees and bounded horizon. Nothing was truncated.");
      }
    }), quoteRows);
    const ack = field(form, "I understand all rules, quotes, fees, stock and realization are manual assumptions", "acknowledged", false, "checkbox");
    form.append(offers, rules, finite, book);
    const calc = el("button", "Calculate conditional policy");
    calc.type = "submit";
    calc.id = "scrolling-calculate";
    form.append(calc);
    const feedback = el("p", "Enter explicit assumptions, then Calculate.");
    feedback.id = "scrolling-feedback";
    feedback.setAttribute("role", "status");
    form.append(feedback);
    const results = el("section");
    results.id = "scrolling-results";
    form.append(results);
    function status(text2) {
      feedback.textContent = text2;
    }
    function invalidate() {
      results.replaceChildren();
      status("Inputs changed \u2014 previous result withdrawn. Calculate explicitly.");
    }
    form.addEventListener("input", (e) => {
      if (e.target.dataset.mechanical === "true" || e.target === decisions) {
        quotes = [];
        quoteRows.replaceChildren();
      }
      edit();
    });
    form.addEventListener("change", () => edit());
    function load(x) {
      offerRows.replaceChildren();
      ruleRows.replaceChildren();
      for (const row of x.entries) offer({ ...row, residual: x.residuals.find((r) => r.itemId === row.itemId)?.gross ?? "" });
      for (const row of x.scrolls) rule(row);
      for (const key of ["budget", "feePercent", "fixedFee"]) finite.querySelector(`[data-field="${key}"]`).value = x[key];
      decisions.value = x.decisions;
      resets.value = x.resets;
      ack.checked = false;
      exampleNote.textContent = x.warning;
      const w = wire2(true);
      renderQuotes(generateQuoteRows(w), x.quoteByState.map((q) => ({ ...q, itemId: x.entries[0].itemId, quality: x.entries[0].quality })));
      invalidate();
    }
    function clearData() {
      presentationKeys = Object.freeze({ offers: Object.freeze([]), scrolls: Object.freeze([]) });
      offerRows.replaceChildren();
      ruleRows.replaceChildren();
      quoteRows.replaceChildren();
      quotes = [];
      offer();
      rule();
      for (const k of ["budget", "feePercent", "fixedFee"]) finite.querySelector(`[data-field="${k}"]`).value = "";
      decisions.value = "5";
      resets.value = "0";
      ack.checked = false;
      exampleNote.textContent = "No example loaded. Fields start blank.";
      results.replaceChildren();
      status("Declarations cleared.");
    }
    function table(title, headers, rows) {
      const section = el("section"), t = el("table"), thead = el("thead"), tr = el("tr");
      for (const h of headers) tr.append(el("th", h));
      thead.append(tr);
      t.append(thead);
      const tbody = el("tbody");
      for (const row of rows) {
        const r = el("tr");
        for (const value of row) {
          const cell = el("td");
          if (value && typeof value === "object" && Object.hasOwn(value, "display")) {
            cell.textContent = value.display;
            cell.title = value.exact;
            cell.dataset.exactValue = value.exact;
          } else cell.textContent = String(value ?? "Unknown");
          r.append(cell);
        }
        tbody.append(r);
      }
      t.append(tbody);
      section.append(el("h3", title), t);
      return section;
    }
    function prepare(result) {
      const fragment = d.createDocumentFragment();
      fragment.append(el("h3", "Conditional manual model \u2014 not a market-profit claim"));
      if (!Object.hasOwn(result, "bestKnownNet")) {
        const reason = el("p", result.reason === "no_affordable_available_entry" ? "Unavailable: no offer can be bought within the budget and stated stock." : "Unavailable: check the manual assumptions and calculation limits.");
        reason.dataset.modelReason = result.reason || "invalid_manual_scenario";
        fragment.append(reason);
        return fragment;
      }
      const p = el("p"), known = money(result.bestKnownNet);
      p.textContent = `Best known complete campaign net: ${known.display} mesos. `;
      p.title = known.exact;
      p.append(el("strong", result.optimalExpectedNet === null ? "Global model optimum unknown: missing feasible assumptions." : "Optimum only within declared finite manual model: " + money(result.optimalExpectedNet).display + " mesos."));
      const selected = el("p", `Starting offer: ${result.selectedEntry ?? "none"}. First action: ${action(result.selectedAction).display}. Source capture Unknown/manual. No fill probability, turnover, volume or time-to-sale evidence.`);
      selected.dataset.modelAction = result.selectedAction;
      fragment.append(p, selected, el("p", "Campaign net includes the starting equipment purchase and all modeled later costs, fees and sale proceeds. State rows show the expected future net cash flow of the known policy from that point; money already spent is excluded. Budget left is unused gross spending allowance, not your meso balance. Sale proceeds do not replenish this budget."));
      fragment.append(el("p", `Shown ${result.rows.length} state rows / ${result.evaluated} evaluated; projection ${result.projectionTruncated ? "truncated" : "not truncated"}. Up to 64 rows / 16 KiB output; exact recurrence is bounded, never sampled. Unknown stock is assumed obtainable only inside this scenario.`));
      fragment.append(table("Starting offers", ["Offer", "First action", "Campaign net after starting buy", "Unknown alternatives?"], result.entries.map((r) => [r.entry, action(r.action), money(r.knownNet), yesNo(r.unknown)])));
      fragment.append(table("Modeled policy states \u2014 not an observed ledger", ["Equipment state", "Budget left (spending allowance)", "Decisions / rebuy resets left", "Offers bought in campaign", "Scrolls consumed in campaign", "Chosen action", "Expected future net cash flow of known policy", "Unknown alternative?"], result.rows.map((r) => [fullState(r.item), money(r.grossCashRemaining), r.decisionsRemaining + " / " + r.resetsRemaining, quantities(r.purchases, presentationKeys.offers, "Offer"), quantities(r.scrollsUsed, presentationKeys.scrolls, "Scroll"), action(r.selectedAction), money(r.knownFutureNet), yesNo(r.unknownFeasibleAlternative)])));
      fragment.append(el("p", "Fixed-policy algebraic roots below are NOT a globally reoptimized price frontier. Recalculate after any price edit; affordability and chosen policy can change. Negative roots are outside the nonnegative input domain."));
      fragment.append(table("Fixed-policy break-even roots", ["Price being varied", "Offer, scroll or exactly matched equipment", "Break-even price (mesos)", "Expected quantity in this policy"], result.fixedPolicyBreakEven.map((r) => [{ display: r.kind === "buy" ? "Equipment buy price" : r.kind === "scroll" ? "Scroll buy price" : r.kind === "gross_sale" ? "Matched equipment gross sale" : "Unknown price", exact: r.kind }, r.kind === "gross_sale" ? matchedState(r.key) : { display: (r.kind === "buy" ? "Offer " : "Scroll ") + r.key, exact: typeof r.key === "string" ? r.key : JSON.stringify(r.key) }, money(r.value), money(r.expectedPolicyQuantity)])));
      return fragment;
    }
    clearData();
    return Object.freeze({ read: () => {
      const value = wire2(ack.checked);
      presentationKeys = Object.freeze({ offers: Object.freeze(value.entries.map((r) => r.key)), scrolls: Object.freeze(value.scrolls.map((r) => r.key)) });
      return value;
    }, invalidate, clear: clearData, prepare, reveal: (fragment) => {
      results.replaceChildren(fragment);
      status("Conditional result ready. Every declaration remains manual.");
    }, status, busy: (value) => {
      calc.disabled = value;
      form.setAttribute("aria-busy", String(value));
    }, pause: (value) => {
      calc.disabled = value;
    }, loadExample: (key) => {
      if (!Object.hasOwn(manual_examples_default, key)) throw Error("example");
      load(manual_examples_default[key]);
      edit();
    } });
  }
  function percentage(value) {
    const [n, d = "1"] = value.split("/");
    return `${BigInt(n) * 100n}/${d}`;
  }

  // ui-src/scrolling-joint/solver/joint-economics.mjs
  var need4 = (ok, code) => {
    if (!ok) throw Error(code);
  };
  var failures = new Set("rational_intermediate_bound rational_size_bound rational_input_bound owned_rational_required exact_decimal_or_rational_string rational_divide_by_zero rational_sum_bound bounded_rational_probability bounded_nonnegative_rational own_plain_record closed_own_data_fields own_plain_array array_bound_or_extra_fields array_own_data_only stat_vector_record bounded_stat_vector joint_stats_explicit owned_mechanics_context same_mechanics_state_context manual_contract_and_assumptions finite_mechanics_limits entry_mechanical_identity rule_item_eligibility explicit_slot_upgrade_rules gain_stat_missing_from_start rule_not_eligible_for_item attempt_horizon_bound branch_probability_sum destroyed_has_no_item_sale_quote distribution_attempt_bound known_entry_key distribution_evaluated_state_budget distribution_state_budget manual_body_bound invalid_json manual_string_bound manual_tree_bound duplicate_or_bounded_json_key manual_array_bound integer_or_exact_string_required bounded_integer own_plain_data own_data_only own_array_data manual_key_bound closed_manual_schema manual_counts stock_cap_or_unknown full_stat_vector quote_full_identity saved_reference_provenance quote_clock_order finite_policy_bounds node_cap unique_cost_keys scroll_item_eligibility explicit_slot_and_upgrade_rules_required invalid_stat_vector scroll_cost_decimal_lexeme unique_exact_quote explicit_destroyed_residuals state_budget_exceeded projection_header_bound manual_output_bound".split(" "));
  var unit = (key) => /* @__PURE__ */ new Map([[key, ONE]]);
  var flow = (quotes = /* @__PURE__ */ new Map(), buys = /* @__PURE__ */ new Map(), scrolls = /* @__PURE__ */ new Map(), paidSales = ZERO) => ({ quotes, buys, scrolls, paidSales });
  function addFlow(parts) {
    const out = flow();
    for (const [weight, f] of parts) {
      for (const name of ["quotes", "buys", "scrolls"]) for (const [key, n] of f[name]) out[name].set(key, add(out[name].get(key) ?? ZERO, mul(weight, n)));
      out.paidSales = add(out.paidSales, mul(weight, f.paidSales));
    }
    return out;
  }
  var increment = (counts, index) => counts.map((n, i) => n + Number(i === index));
  var available = (stock3, used) => stock3 === null || used < stock3;
  var sortedStats = (s) => Object.entries(s.stats).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  var pyItem = (s) => ({ identity: s.itemId, quality: s.quality, state: { stats: sortedStats(s), slots_left: s.slotsLeft, upgrades: s.upgrades, used_scrolls: s.used, failures: s.failures, destroyed: s.destroyed } });
  var repr = (v) => Array.isArray(v) ? "(" + v.map(repr).join(", ") + (v.length === 1 ? "," : "") + ")" : typeof v === "string" ? "'" + v + "'" : String(v);
  var sorted = (map, meta = null) => [...map].sort(([a], [b]) => {
    const x = repr(meta ? meta.get(a) : a), y = repr(meta ? meta.get(b) : b);
    return x < y ? -1 : x > y ? 1 : 0;
  });
  function solveModel(admitted) {
    const a = admitted, ctx = createJointMechanics(a.wire, { enabled: true }), entries = a.entries.map((e, i) => ({ ...e, state: ctx.entries[i].state })), rules = a.rules;
    const quotes = new Map(a.quotes.map((q) => [q.encoded, q])), gross = new Map(a.quotes.map((q) => [q.encoded, q.gross])), keyMeta = new Map(a.quotes.map((q) => [q.encoded, q.key]));
    for (const r of a.residuals) {
      const key = ["destroyed", r.id], encoded = encodedKey(key);
      gross.set(encoded, r.gross);
      keyMeta.set(encoded, key);
    }
    const entryCosts = new Map(entries.map((e) => [e.key, e.cost])), ruleCosts = new Map(rules.map((r) => [r.key, r.cost])), valueCache = /* @__PURE__ */ new WeakMap(), cache = /* @__PURE__ */ new Map(), rows = [];
    let evaluated = 0;
    const netFactor = sub(ONE, a.fee);
    function value(f) {
      if (valueCache.has(f)) return valueCache.get(f);
      let amount2 = ZERO;
      for (const [key, n] of f.quotes) amount2 = add(amount2, mul(gross.get(key), n));
      amount2 = sub(mul(amount2, netFactor), mul(a.fixed, f.paidSales));
      for (const [key, n] of f.buys) amount2 = sub(amount2, mul(entryCosts.get(key), n));
      for (const [key, n] of f.scrolls) amount2 = sub(amount2, mul(ruleCosts.get(key), n));
      valueCache.set(f, amount2);
      return amount2;
    }
    function sell(s) {
      const key = s.destroyed ? encodedKey(["destroyed", s.itemId]) : priceKey(ctx, s);
      if (!gross.has(key)) return null;
      return flow(unit(key), /* @__PURE__ */ new Map(), /* @__PURE__ */ new Map(), !s.destroyed || !equal(gross.get(key), ZERO) ? ONE : ZERO);
    }
    function solve(s, left, resets, cash, purchases, uses) {
      const key = JSON.stringify([stateKey(ctx, s), left, resets, text(cash), purchases, uses]);
      if (cache.has(key)) return cache.get(key);
      need4(++evaluated <= a.limits.nodeCap, "state_budget_exceeded");
      const index = rows.length < 64 ? rows.push(null) - 1 : -1, sale = sell(s), candidates = [{ action: "sell_stop", flow: sale, unknown: sale === null }];
      if (left) {
        for (let i = 0; i < rules.length; i++) {
          const r = rules[i];
          if (!r.itemIds.includes(s.itemId) || s.destroyed || s.slotsLeft === 0 || compare(cash, r.cost) < 0 || !available(r.stock, uses[i])) continue;
          const parts = [[ONE, flow(/* @__PURE__ */ new Map(), /* @__PURE__ */ new Map(), unit(r.key))]];
          let missing = false, coverage = false;
          for (const branch2 of transitions(ctx, s, r.key)) {
            const future = solve(branch2.state, left - 1, resets, sub(cash, r.cost), purchases, increment(uses, i));
            missing ||= future.flow === null;
            coverage ||= future.unknown;
            if (future.flow !== null) parts.push([branch2.probability, future.flow]);
          }
          candidates.push({ action: "scroll:" + r.key, flow: missing ? null : addFlow(parts), unknown: coverage || missing });
        }
        if (resets) for (let i = 0; i < entries.length; i++) {
          const e = entries[i];
          if (compare(cash, e.cost) < 0 || !available(e.stock, purchases[i])) continue;
          const future = solve(e.state, left - 1, resets - 1, sub(cash, e.cost), increment(purchases, i), uses), f = sale === null || future.flow === null ? null : addFlow([[ONE, sale], [ONE, flow(/* @__PURE__ */ new Map(), unit(e.key))], [ONE, future.flow]]);
          candidates.push({ action: "sell_rebuy:" + e.key, flow: f, unknown: future.unknown || f === null });
        }
      }
      let selected = null;
      for (const candidate of candidates) if (candidate.flow !== null && (selected === null || compare(value(candidate.flow), value(selected.flow)) > 0)) selected = candidate;
      const unknown = candidates.some((c) => c.unknown || c.flow === null), result = { flow: selected?.flow ?? null, action: selected?.action ?? null, unknown };
      if (index >= 0) rows[index] = { item: pyItem(s), decisionsRemaining: left, resetsRemaining: resets, grossCashRemaining: cash, purchases: [...purchases], scrollsUsed: [...uses], selectedAction: result.action, knownFutureNet: result.flow === null ? null : value(result.flow), unknownFeasibleAlternative: unknown, alternatives: candidates.map((c) => [c.action, c.flow === null ? null : value(c.flow)]), alternativeCoverageUnknown: candidates.map((c) => [c.action, c.unknown]) };
      cache.set(key, result);
      return result;
    }
    const results = [];
    try {
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        if (compare(e.cost, a.budget) > 0 || !available(e.stock, 0)) continue;
        const future = solve(e.state, a.limits.decisions, a.limits.resets, sub(a.budget, e.cost), increment(entries.map(() => 0), i), rules.map(() => 0));
        const f = future.flow === null ? null : addFlow([[ONE, future.flow], [ONE, flow(/* @__PURE__ */ new Map(), unit(e.key))]]);
        results.push({ entry: e.key, action: future.action, flow: f, knownNet: f === null ? null : value(f), unknown: future.unknown });
      }
    } catch (error) {
      return { status: "unavailable", reason: fixedReason(error), evaluated, marketProfitClaim: false };
    }
    if (!results.length) return { status: "unavailable", reason: "no_affordable_available_entry", evaluated, marketProfitClaim: false };
    let best = { entry: null, action: "do_not_enter", flow: flow(), knownNet: ZERO, unknown: false };
    for (const result of results) if (result.knownNet !== null && compare(result.knownNet, best.knownNet) > 0) best = result;
    const incomplete = results.some((r) => r.unknown), thresholds = [];
    for (const [kind, terms, values, sign, meta] of [["buy", best.flow.buys, entryCosts, neg(ONE), null], ["scroll", best.flow.scrolls, ruleCosts, neg(ONE), null], ["gross_sale", best.flow.quotes, gross, netFactor, keyMeta]]) {
      for (const [key, n] of sorted(terms, meta)) {
        const slope = mul(sign, n);
        if (!equal(slope, ZERO)) thresholds.push({ kind, key: meta ? meta.get(key) : key, value: sub(values.get(key), div(best.knownNet, slope)), expectedPolicyQuantity: n });
      }
    }
    return { status: incomplete ? "unavailable" : "conditional_model", reason: incomplete ? "reachable_exact_state_price_missing" : null, selectedEntry: best.entry, selectedAction: best.action, optimalExpectedNet: incomplete ? null : best.knownNet, bestKnownNet: best.knownNet, entries: results, rows, evaluated, projectionTruncated: evaluated > rows.length, fixedPolicyBreakEven: thresholds, breakEvenScope: "fixed_selected_policy_only_replan_after_price_or_budget_edits", quoteEvidence: a.quotes.map((q) => ({ key: q.key, gross: q.gross, evidence: q.evidence })), optimizationScope: { decisions: a.limits.decisions, resets: a.limits.resets, stateBudget: a.limits.nodeCap, allTimeOptimum: false }, assumptions: { feesVerified: false, realizationAssumed: true, fillProbability: null, turnover: null, timeToSale: null, entryStockCaps: entries.map((e) => e.stock), scrollStockCaps: rules.map((r) => r.stock), unknownStockAssumedObtainable: entries.some((e) => e.stock === null) || rules.some((r) => r.stock === null), saleProceedsReinvested: false, modeledContinuationsNotObservedLedger: true }, marketProfitClaim: false, defaultEnabled: false };
  }
  function fixedReason(error) {
    const reason = typeof error?.message === "string" ? error.message : "";
    return failures.has(reason) ? reason : "invalid_manual_scenario";
  }
  function wire(value) {
    if (value === null || typeof value !== "object") return value;
    if (typeof value.n === "bigint" && typeof value.d === "bigint") return text(value);
    if (Array.isArray(value)) return value.map(wire);
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, wire(v)]));
  }
  var bytes = (object) => new TextEncoder().encode(JSON.stringify(object));
  function project(result) {
    const out = Object.fromEntries(Object.entries(result).filter(([k]) => !["rows", "quoteEvidence", "entries", "fixedPolicyBreakEven"].includes(k)).map(([k, v]) => [k, wire(v)]));
    out.entries = (result.entries ?? []).map((e) => Object.fromEntries(Object.entries(e).filter(([k]) => k !== "flow").map(([k, v]) => [k, wire(v)])));
    Object.assign(out, { rows: [], quoteEvidence: [], fixedPolicyBreakEven: [], projectionTruncated: !!result.projectionTruncated, projectionByteCap: 15800 });
    for (const [field, cap] of [["fixedPolicyBreakEven", 16], ["quoteEvidence", 16], ["rows", 64]]) {
      for (const row of (result[field] ?? []).slice(0, cap)) {
        out[field].push(wire(row));
        if (bytes(out).length > 15800) {
          out[field].pop();
          out.projectionTruncated = true;
          break;
        }
      }
      if (out[field].length < (result[field] ?? []).length) out.projectionTruncated = true;
    }
    need4(bytes(out).length <= 15800, "projection_header_bound");
    return out;
  }
  function evaluate(input, enabled, decode) {
    if (enabled !== true) return bytes({ status: "disabled", defaultEnabled: false });
    try {
      const admitted = admitManualWire(decode ? decodeManualBytes(input) : input), result = solveModel(admitted), out = project(result);
      Object.assign(out, { schemaVersion: 1, kind: "private_joint_scrolling_model_result_v1", currency: "mesos", verification: "manual_assumptions_not_market_or_game_rules", websiteIntegrationImplemented: false });
      const raw = bytes(out);
      need4(raw.length <= 16384, "manual_output_bound");
      return raw;
    } catch (error) {
      return bytes({ status: "unavailable", reason: fixedReason(error), marketProfitClaim: false });
    }
  }
  function evaluateManualScenario(value, { enabled = false } = {}) {
    return evaluate(value, enabled, false);
  }
  var capability2 = Object.freeze({ kind: "private_finite_joint_economic_model_v1", defaultEnabled: false, horizonMax: 24, resetsMax: 3, stateCap: 12e3, inputBytes: 65536, outputBytes: 16384, websiteIntegrationImplemented: false, sourceOrGameRulesVerified: false, quoteRealizationAssumed: true, globalOptimalPriceFrontier: false });

  // ui-src/scrolling-joint/site-entry.mjs
  (() => {
    "use strict";
    const w = window, d = document, host = d.getElementById("scrolling-lab-workspace"), nav = d.getElementById("scrolling-lab-nav"), options = d.getElementById("display-options");
    if (!host || !nav || !options || w.AstraJointScrollingPreview) return;
    let wanted = false, disposed = false, epoch = 0, revision = 0, page = null, pending = null;
    function workspace() {
      try {
        const descriptor = Object.getOwnPropertyDescriptor(w, "AstraPrivateWorkspace");
        if (!descriptor || descriptor.writable !== false || descriptor.configurable !== false) return null;
        const s = descriptor.value.current();
        const expiry = s?.expiresAt;
        const now = w.Date.now();
        return s?.verified === true && s.mode === "private_workspace" && Number.isSafeInteger(expiry) && expiry > now ? expiry : null;
      } catch {
        return null;
      }
    }
    function controls() {
      try {
        const p = Object.getOwnPropertyDescriptor(w, "AstraPreviewControls");
        if (!p || p.writable !== false || p.configurable !== false) return false;
        const s = p.value.current();
        return s?.unlocked === true && s.viewing === false;
      } catch {
        return false;
      }
    }
    const onRoute = () => w.location.hash === "#scrolling-lab", visible = () => !d.hidden && w.navigator.onLine !== false;
    const enabled = () => wanted && !disposed && workspace() !== null;
    const active = () => enabled() && onRoute() && visible();
    const wrap = d.createElement("div");
    wrap.className = "scrolling-toggle-controls";
    wrap.dataset.previewControls = "true";
    const label = d.createElement("label"), toggle = d.createElement("input");
    toggle.type = "checkbox";
    toggle.id = "scrolling-lab-toggle";
    label.append(toggle, d.createTextNode(" Private joint scrolling lab (manual, Off by default)"));
    wrap.append(label);
    options.append(wrap);
    function home() {
      if (onRoute()) {
        w.history.replaceState(null, "", "#index");
        w.dispatchEvent(new w.Event("hashchange"));
      }
    }
    function invalidate() {
      epoch++;
      revision++;
      page?.invalidate();
    }
    function withdraw() {
      wanted = false;
      invalidate();
      page?.clear();
      nav.hidden = true;
      host.hidden = true;
      toggle.checked = false;
      home();
    }
    function edit() {
      invalidate();
    }
    function guard() {
      if (!enabled()) {
        withdraw();
        return false;
      }
      if (!onRoute() || !visible()) return false;
      return true;
    }
    function mount() {
      if (page) return;
      page = createPage(host, { edit, calculate, clear() {
        invalidate();
        page.clear();
      }, guard });
    }
    function sync() {
      if (disposed) return;
      const privateOk = workspace() !== null;
      if (!privateOk && wanted) withdraw();
      const on = wanted && privateOk;
      nav.hidden = !on;
      host.hidden = !on;
      toggle.checked = on;
      toggle.disabled = !privateOk || !controls();
      wrap.hidden = !privateOk || !controls();
      if (on) {
        mount();
        page.busy(!!pending);
        page.pause(!active() || !!pending);
      } else home();
    }
    function setEnabled(value) {
      if (disposed) return false;
      if (value === false) {
        withdraw();
        sync();
        return true;
      }
      if (value !== true || workspace() === null || !controls()) return false;
      wanted = true;
      epoch++;
      mount();
      sync();
      return true;
    }
    toggle.addEventListener("change", () => {
      if (!setEnabled(toggle.checked)) toggle.checked = wanted;
    });
    function calculate() {
      if (!guard() || pending) return false;
      const originalExpiry = workspace();
      if (originalExpiry === null) {
        withdraw();
        return false;
      }
      let snapshot;
      try {
        snapshot = admittedSnapshot(page.read());
      } catch {
        page.invalidate();
        page.status("Unavailable: check explicit fields, acknowledgment, exact quote keys and 65,536-byte bounds.");
        return false;
      }
      page.invalidate();
      const queuedAt = w.Date.now();
      if (!Number.isSafeInteger(queuedAt) || queuedAt >= originalExpiry) {
        page.status("This calculation expired before queueing. Calculate explicitly again.");
        sync();
        return false;
      }
      const task = Object.freeze({ epoch, revision, originalExpiry });
      pending = task;
      page.busy(true);
      w.requestAnimationFrame(() => {
        try {
          if (disposed || task.epoch !== epoch || task.revision !== revision || !active()) return;
          if (w.Date.now() >= task.originalExpiry) {
            page.status("Queued calculation expired. Calculate explicitly again under the current workspace.");
            return;
          }
          const raw = evaluateManualScenario(snapshot, { enabled: true }), result = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw));
          const prepared = page.prepare(result);
          const expiry = workspace(), now = w.Date.now();
          if (expiry === null || !Number.isSafeInteger(now) || now >= expiry) {
            withdraw();
            return;
          }
          if (now >= task.originalExpiry) {
            page.status("Queued calculation expired. Calculate explicitly again under the current workspace.");
            return;
          }
          if (disposed || !wanted || task.epoch !== epoch || task.revision !== revision || !onRoute() || !visible()) return;
          page.reveal(prepared);
        } catch {
          if (!disposed && wanted && task.epoch === epoch) page.status("Unavailable: bounded calculation refused. No partial optimum is shown.");
        } finally {
          if (pending === task) pending = null;
          if (!disposed) sync();
        }
      });
      return true;
    }
    function pause() {
      invalidate();
      sync();
    }
    function state2() {
      return Object.freeze({ enabled: enabled(), mounted: !!page, pending: !!pending, active: active(), defaultEnabled: false, manualOnly: true, sourceRequests: 0 });
    }
    const api = Object.freeze({ getState: state2, setEnabled, clear() {
      if (page) {
        invalidate();
        page.clear();
      }
    }, dispose() {
      if (disposed) return;
      withdraw();
      disposed = true;
      wrap.remove();
      host.replaceChildren();
    } });
    Object.defineProperty(w, "AstraJointScrollingPreview", { value: api, writable: false, configurable: false });
    for (const type of ["beforeinput", "paste", "drop", "click", "submit"]) host.addEventListener(type, (event) => {
      if (!guard()) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }, true);
    for (const type of ["input", "change"]) host.addEventListener(type, (event) => {
      if (!guard()) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }, true);
    d.addEventListener("astraprivateworkspace", sync);
    d.addEventListener("astrapreviewcontrols", sync);
    d.addEventListener("visibilitychange", pause);
    w.addEventListener("online", pause);
    w.addEventListener("offline", pause);
    w.addEventListener("hashchange", pause);
    w.addEventListener("pagehide", () => {
      withdraw();
      sync();
    });
    sync();
  })();
})();

})();

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "scrolling-preview.js", status: "initialization_failed"}})); } catch {}
}

;
/* Astra source: nx-stamp-finder.js */
try {
(() => {
'use strict';
(() => {
  // ui-src/nx-stamp/registry.mjs
  var registry_default = {
    "schemaVersion": 1,
    "kind": "verified_conditional_stamp_item_types",
    "season": "Aurora Season 1",
    "expiresAt": "2027-01-13T07:59:00Z",
    "ruleUrl": "https://www.nexon.com/maplestory/news/45819",
    "metadataHashes": [
      "e66a5fb71974f55bad03130d2c3c8926f57ac8a5db949d58a369c4835ca6537f",
      "60166ef0713a547a73b81473fbfa43d5d63f5182c978f5194b16411cd5e88a92"
    ],
    "rows": [
      {
        "itemId": 1067078,
        "name": "Amorian Pink Skirt",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-2026-11-04"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-2026-11-04",
            "url": "https://www.nexon.com/maplestory/general-post/46331",
            "sha256": "f965e9e5385bc7a2f8a42324e71aa25758b6dd5d43a824b97e58e1a0c1603a19"
          }
        ],
        "legacySlug": "1067078",
        "sprite": "assets/metadata-item-1067078.png",
        "spriteSha256": "75bccc264e8e94c3b9374131881f19415f9a32a3196b9aee5f45079a4d74a83b"
      },
      {
        "itemId": 1007077,
        "name": "Angel Halo",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "founders-2026-10-06"
        ],
        "evidence": [
          {
            "edition": "founders-2026-10-06",
            "url": "https://www.nexon.com/maplestory/general-post/45538",
            "sha256": "6c88e7ce3c274146bb3a5dce350142c445d5e224fd1fe3d11df24097035d5e36"
          }
        ],
        "legacySlug": "angel-halo",
        "sprite": "assets/angel-halo.png",
        "spriteSha256": "4609c7aceb2357dc88deec6e43c91f74f4bf4ce97130cc0b8fc9fd69309d7da1"
      },
      {
        "itemId": 1702004,
        "name": "Angel Wand",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "founders-2026-10-06"
        ],
        "evidence": [
          {
            "edition": "founders-2026-10-06",
            "url": "https://www.nexon.com/maplestory/general-post/45538",
            "sha256": "6c88e7ce3c274146bb3a5dce350142c445d5e224fd1fe3d11df24097035d5e36"
          }
        ],
        "legacySlug": "angel-wand",
        "sprite": "assets/angel-wand.png",
        "spriteSha256": "9e931a2c6d8031060ac40773d1d106a48debd658842a167ba2e455b38d180cc8"
      },
      {
        "itemId": 1107011,
        "name": "Baby Angel Wings",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "founders-2026-10-06"
        ],
        "evidence": [
          {
            "edition": "founders-2026-10-06",
            "url": "https://www.nexon.com/maplestory/general-post/45538",
            "sha256": "6c88e7ce3c274146bb3a5dce350142c445d5e224fd1fe3d11df24097035d5e36"
          }
        ],
        "legacySlug": "baby-angel-wings",
        "sprite": "assets/baby-angel-wings.png",
        "spriteSha256": "f972e4993d91768222d8491b9cf1f2cebc1734df93e6f974405b9ae9705f60fb"
      },
      {
        "itemId": 1017015,
        "name": "Bandage Strip",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-2026-11-04"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-2026-11-04",
            "url": "https://www.nexon.com/maplestory/general-post/46331",
            "sha256": "f965e9e5385bc7a2f8a42324e71aa25758b6dd5d43a824b97e58e1a0c1603a19"
          }
        ],
        "legacySlug": "1017015",
        "sprite": "assets/metadata-item-1017015.png",
        "spriteSha256": "9e4317e41e89cc21e38706fa9b0a6288a3d9b81cd7fe63e04b5ec5303e993ef3"
      },
      {
        "itemId": 1017e3,
        "name": "Battle Scar",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "halloween-2026-10-28"
        ],
        "evidence": [
          {
            "edition": "halloween-2026-10-28",
            "url": "https://www.nexon.com/maplestory/general-post/46524",
            "sha256": "16d4689fa00b005ccee9f89e3e591fd9251dd3abe3f865fcc72685e22bf12c30"
          }
        ],
        "legacySlug": "battle-scar",
        "sprite": "assets/battle-scar.png",
        "spriteSha256": "ab6feb6b930ad60a199b29f6783045b6837ce603964fdb75252408bfe55fa1b6"
      },
      {
        "itemId": 1047027,
        "name": "Beetle Long Sleeve",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "founders-2026-10-06"
        ],
        "evidence": [
          {
            "edition": "founders-2026-10-06",
            "url": "https://www.nexon.com/maplestory/general-post/45538",
            "sha256": "6c88e7ce3c274146bb3a5dce350142c445d5e224fd1fe3d11df24097035d5e36"
          }
        ],
        "legacySlug": "beetle-long-sleeve",
        "sprite": "assets/beetle-long-sleeve.png",
        "spriteSha256": "57f48243dac79387788ea19b461d6d1f94dc14496fd781f123ae708b6c42b7c8"
      },
      {
        "itemId": 1007090,
        "name": "Beige Checkered Hat",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-grand-launch-2026"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-grand-launch-2026",
            "url": "https://www.nexon.com/maplestory/news/46362",
            "sha256": "4984ca3d0227803b82c0ab09ac69817265b66fd36a7cae0d4cbcc3765979b2e6"
          }
        ],
        "legacySlug": "beige-checkered-hat",
        "sprite": "assets/beige-checkered-hat.png",
        "spriteSha256": "fb0529636d24f410ef7995343472b2b160d38f37fee87fb5bc1fd3955af058d0"
      },
      {
        "itemId": 1007116,
        "name": "Beret",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "founders-2026-10-06"
        ],
        "evidence": [
          {
            "edition": "founders-2026-10-06",
            "url": "https://www.nexon.com/maplestory/general-post/45538",
            "sha256": "6c88e7ce3c274146bb3a5dce350142c445d5e224fd1fe3d11df24097035d5e36"
          }
        ],
        "legacySlug": "beret",
        "sprite": "assets/beret.png",
        "spriteSha256": "4d89ebd1ff4815d98d17e06ecf13d04c4e90abcb1899adfbb1fd300fb42deaa3"
      },
      {
        "itemId": 1077030,
        "name": "Big Rabbit Feet",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-2026-11-04"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-2026-11-04",
            "url": "https://www.nexon.com/maplestory/general-post/46331",
            "sha256": "f965e9e5385bc7a2f8a42324e71aa25758b6dd5d43a824b97e58e1a0c1603a19"
          }
        ],
        "legacySlug": "1077030",
        "sprite": "assets/metadata-item-1077030.png",
        "spriteSha256": "ecdd9fc60ec678bc95e237e0d2b834b0241236a63b356a2bed86eb77ae3cde69"
      },
      {
        "itemId": 1047097,
        "name": 'Black "Hit Me" Shirt',
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-grand-launch-2026"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-grand-launch-2026",
            "url": "https://www.nexon.com/maplestory/news/46362",
            "sha256": "4984ca3d0227803b82c0ab09ac69817265b66fd36a7cae0d4cbcc3765979b2e6"
          }
        ],
        "legacySlug": null,
        "sprite": null,
        "spriteSha256": null
      },
      {
        "itemId": 1087006,
        "name": "Black Bandage",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "halloween-2026-10-28"
        ],
        "evidence": [
          {
            "edition": "halloween-2026-10-28",
            "url": "https://www.nexon.com/maplestory/general-post/46524",
            "sha256": "16d4689fa00b005ccee9f89e3e591fd9251dd3abe3f865fcc72685e22bf12c30"
          }
        ],
        "legacySlug": "black-bandage",
        "sprite": "assets/black-bandage.png",
        "spriteSha256": "7a13316740e6b9a6e27efa94c660a47929c7122d451517f8951357156b6a73c1"
      },
      {
        "itemId": 1047042,
        "name": "Black Blazer",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-grand-launch-2026"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-grand-launch-2026",
            "url": "https://www.nexon.com/maplestory/news/46362",
            "sha256": "4984ca3d0227803b82c0ab09ac69817265b66fd36a7cae0d4cbcc3765979b2e6"
          }
        ],
        "legacySlug": "black-blazer",
        "sprite": "assets/black-blazer.png",
        "spriteSha256": "3f0aaa171d8ce1ea17e74d1feeb08be0c957669dfee5fb67383e3c1bd46ddc1a"
      },
      {
        "itemId": 1047092,
        "name": "Black Cardigan Set",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-grand-launch-2026"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-grand-launch-2026",
            "url": "https://www.nexon.com/maplestory/news/46362",
            "sha256": "4984ca3d0227803b82c0ab09ac69817265b66fd36a7cae0d4cbcc3765979b2e6"
          }
        ],
        "legacySlug": "black-cardigan-set",
        "sprite": "assets/black-cardigan-set.png",
        "spriteSha256": "fadb41ca608520a3c98039032f7dc742c233452b0a4c1630eb90346494c3e592"
      },
      {
        "itemId": 1007145,
        "name": "Black Cat Beanie",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "aurora-season-1-2026"
        ],
        "evidence": [
          {
            "edition": "aurora-season-1-2026",
            "url": "https://www.nexon.com/maplestory/general-post/45659",
            "sha256": "2da85bc74092abda3f075bb94aa001596ecc2e4a7c21d8658aef481f084861ee"
          }
        ],
        "legacySlug": "black-cat-beanie",
        "sprite": "assets/black-cat-beanie.png",
        "spriteSha256": "3048d06910d876b2d850aff36300830175edd8fcb4031fb623efba7aa92f0e38"
      },
      {
        "itemId": 1077054,
        "name": "Black Classic Sneakers",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-grand-launch-2026"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-grand-launch-2026",
            "url": "https://www.nexon.com/maplestory/news/46362",
            "sha256": "4984ca3d0227803b82c0ab09ac69817265b66fd36a7cae0d4cbcc3765979b2e6"
          }
        ],
        "legacySlug": "black-classic-sneakers",
        "sprite": "assets/black-classic-sneakers.png",
        "spriteSha256": "3a14b9cc835924000a18c8585a26c6a61a04d248493733ad5a0c1072133299a1"
      },
      {
        "itemId": 1057040,
        "name": "Black Coat of Death",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "halloween-2026-10-28"
        ],
        "evidence": [
          {
            "edition": "halloween-2026-10-28",
            "url": "https://www.nexon.com/maplestory/general-post/46524",
            "sha256": "16d4689fa00b005ccee9f89e3e591fd9251dd3abe3f865fcc72685e22bf12c30"
          }
        ],
        "legacySlug": "black-coat-of-death",
        "sprite": "assets/black-coat-of-death.png",
        "spriteSha256": "f7bd2be6a5d7255ab7df1dcd8c7e287372e903b15f45b876b72ef6890469ceec"
      },
      {
        "itemId": 1077e3,
        "name": "Black Dress Shoes",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-grand-launch-2026"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-grand-launch-2026",
            "url": "https://www.nexon.com/maplestory/news/46362",
            "sha256": "4984ca3d0227803b82c0ab09ac69817265b66fd36a7cae0d4cbcc3765979b2e6"
          }
        ],
        "legacySlug": "black-dress-shoes",
        "sprite": "assets/black-dress-shoes.png",
        "spriteSha256": "ccfe96568c486ce43a70693a9c763320406a4948754f17a28ccdaaecd93f0429"
      },
      {
        "itemId": 1077056,
        "name": "Black Enamel Shoes",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "founders-2026-10-06"
        ],
        "evidence": [
          {
            "edition": "founders-2026-10-06",
            "url": "https://www.nexon.com/maplestory/general-post/45538",
            "sha256": "6c88e7ce3c274146bb3a5dce350142c445d5e224fd1fe3d11df24097035d5e36"
          }
        ],
        "legacySlug": "black-enamel-shoes",
        "sprite": "assets/black-enamel-shoes.png",
        "spriteSha256": "d56f39ce0c748c1e2f595895916d2974a2171b86e7861157a7f05137f828d790"
      },
      {
        "itemId": 1057094,
        "name": "Black Fur Wrap Coat",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-2026-11-04"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-2026-11-04",
            "url": "https://www.nexon.com/maplestory/general-post/46331",
            "sha256": "f965e9e5385bc7a2f8a42324e71aa25758b6dd5d43a824b97e58e1a0c1603a19"
          }
        ],
        "legacySlug": "1057094",
        "sprite": "assets/metadata-item-1057094.png",
        "spriteSha256": "df133d44068ef63984b85bbe319b8c5affd910e91dcd469e12b3419ead40bbf5"
      },
      {
        "itemId": 1077014,
        "name": "Black Leather Boots",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "halloween-2026-10-28"
        ],
        "evidence": [
          {
            "edition": "halloween-2026-10-28",
            "url": "https://www.nexon.com/maplestory/general-post/46524",
            "sha256": "16d4689fa00b005ccee9f89e3e591fd9251dd3abe3f865fcc72685e22bf12c30"
          }
        ],
        "legacySlug": "black-leather-boots",
        "sprite": "assets/black-leather-boots.png",
        "spriteSha256": "a9f528ff92897acdbfab7f08a19a5fe9e4cd8b1d0b4bbeffc56f839dc13b8dbb"
      },
      {
        "itemId": 1077034,
        "name": "Black Shoes of Death",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "halloween-2026-10-28"
        ],
        "evidence": [
          {
            "edition": "halloween-2026-10-28",
            "url": "https://www.nexon.com/maplestory/general-post/46524",
            "sha256": "16d4689fa00b005ccee9f89e3e591fd9251dd3abe3f865fcc72685e22bf12c30"
          }
        ],
        "legacySlug": "black-shoes-of-death",
        "sprite": "assets/black-shoes-of-death.png",
        "spriteSha256": "1ac964cd5bb53f07ed8b008118b847b0a21d4f98cb83d72de690a28230b90059"
      },
      {
        "itemId": 1067030,
        "name": "Black Suit Pants",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-grand-launch-2026"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-grand-launch-2026",
            "url": "https://www.nexon.com/maplestory/news/46362",
            "sha256": "4984ca3d0227803b82c0ab09ac69817265b66fd36a7cae0d4cbcc3765979b2e6"
          }
        ],
        "legacySlug": "black-suit-pants",
        "sprite": "assets/black-suit-pants.png",
        "spriteSha256": "be035e5deb98ccde9f2c35f1bf17fa492936437e4bb8c5f2228a791477b90b12"
      },
      {
        "itemId": 1027004,
        "name": "Black Sunglasses",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "founders-2026-10-06"
        ],
        "evidence": [
          {
            "edition": "founders-2026-10-06",
            "url": "https://www.nexon.com/maplestory/general-post/45538",
            "sha256": "6c88e7ce3c274146bb3a5dce350142c445d5e224fd1fe3d11df24097035d5e36"
          }
        ],
        "legacySlug": "black-sunglasses",
        "sprite": "assets/black-sunglasses.png",
        "spriteSha256": "7c33150838a096911b4f308f904f45d2a3fccaf7e126ef1e335c6a153b8dc822"
      },
      {
        "itemId": 1027037,
        "name": "Blank Eye Patch",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "aurora-season-1-2026"
        ],
        "evidence": [
          {
            "edition": "aurora-season-1-2026",
            "url": "https://www.nexon.com/maplestory/general-post/45659",
            "sha256": "2da85bc74092abda3f075bb94aa001596ecc2e4a7c21d8658aef481f084861ee"
          }
        ],
        "legacySlug": "blank-eye-patch",
        "sprite": "assets/blank-eye-patch.png",
        "spriteSha256": "c6b5923c5349673b8fd688310f8198b8532ef4423002bc620975fb70b6114717"
      },
      {
        "itemId": 1067052,
        "name": "Blue Bell Dress",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-grand-launch-2026"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-grand-launch-2026",
            "url": "https://www.nexon.com/maplestory/news/46362",
            "sha256": "4984ca3d0227803b82c0ab09ac69817265b66fd36a7cae0d4cbcc3765979b2e6"
          }
        ],
        "legacySlug": "blue-bell-dress",
        "sprite": "assets/blue-bell-dress.png",
        "spriteSha256": "3a6ed528d00527a1d169b7d03a07dc54938eca734e43e3b7fe15c4339cfc477a"
      },
      {
        "itemId": 1007061,
        "name": "Blue Bucket Hat",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "founders-2026-10-06"
        ],
        "evidence": [
          {
            "edition": "founders-2026-10-06",
            "url": "https://www.nexon.com/maplestory/general-post/45538",
            "sha256": "6c88e7ce3c274146bb3a5dce350142c445d5e224fd1fe3d11df24097035d5e36"
          }
        ],
        "legacySlug": "blue-bucket-hat",
        "sprite": "assets/blue-bucket-hat.png",
        "spriteSha256": "17a69f8695298fb52717765784065a6d197f135b8ad1882e051becce94e030e1"
      },
      {
        "itemId": 1007046,
        "name": "Blue Cap",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "founders-2026-10-06"
        ],
        "evidence": [
          {
            "edition": "founders-2026-10-06",
            "url": "https://www.nexon.com/maplestory/general-post/45538",
            "sha256": "6c88e7ce3c274146bb3a5dce350142c445d5e224fd1fe3d11df24097035d5e36"
          }
        ],
        "legacySlug": "blue-cap",
        "sprite": "assets/blue-cap.png",
        "spriteSha256": "8edfb7cc83199250c47ac2aa0ccbd098549c37c2f29cb4b3a612d0e2eeb82c64"
      },
      {
        "itemId": 1057003,
        "name": "Blue Chinese Undead Costume",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "halloween-2026-10-28"
        ],
        "evidence": [
          {
            "edition": "halloween-2026-10-28",
            "url": "https://www.nexon.com/maplestory/general-post/46524",
            "sha256": "16d4689fa00b005ccee9f89e3e591fd9251dd3abe3f865fcc72685e22bf12c30"
          }
        ],
        "legacySlug": "blue-chinese-undead-costume",
        "sprite": "assets/blue-chinese-undead-costume.png",
        "spriteSha256": "c0ad3fab7b82091af40d97d6613e9fde496c6b2add57e4bd9e61ee72bb5e8cfc"
      },
      {
        "itemId": 1007013,
        "name": "Blue Chinese Undead Hat",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "halloween-2026-10-28"
        ],
        "evidence": [
          {
            "edition": "halloween-2026-10-28",
            "url": "https://www.nexon.com/maplestory/general-post/46524",
            "sha256": "16d4689fa00b005ccee9f89e3e591fd9251dd3abe3f865fcc72685e22bf12c30"
          }
        ],
        "legacySlug": "blue-chinese-undead-hat",
        "sprite": "assets/blue-chinese-undead-hat.png",
        "spriteSha256": "c22e0583b2751d5033913d0fcc32b6a1c705c9e8f4ee8dae6c60fe5a9e13e40b"
      },
      {
        "itemId": 1047069,
        "name": "Blue Frill Blouse",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-grand-launch-2026"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-grand-launch-2026",
            "url": "https://www.nexon.com/maplestory/news/46362",
            "sha256": "4984ca3d0227803b82c0ab09ac69817265b66fd36a7cae0d4cbcc3765979b2e6"
          }
        ],
        "legacySlug": "blue-frill-blouse",
        "sprite": "assets/blue-frill-blouse.png",
        "spriteSha256": "2ab8c8538c5092716b4682e211413895c1a1ef97c8ca7f2c22489b201565acae"
      },
      {
        "itemId": 1057089,
        "name": "Blue Kitty Hood",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-2026-11-04"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-2026-11-04",
            "url": "https://www.nexon.com/maplestory/general-post/46331",
            "sha256": "f965e9e5385bc7a2f8a42324e71aa25758b6dd5d43a824b97e58e1a0c1603a19"
          }
        ],
        "legacySlug": "1057089",
        "sprite": "assets/metadata-item-1057089.png",
        "spriteSha256": "7c414bcf59d6015c900d4636a1027428656885d7011b3a0cebf91dbf71a13c80"
      },
      {
        "itemId": 1077018,
        "name": "Blue Marble Slippers",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-2026-11-04"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-2026-11-04",
            "url": "https://www.nexon.com/maplestory/general-post/46331",
            "sha256": "f965e9e5385bc7a2f8a42324e71aa25758b6dd5d43a824b97e58e1a0c1603a19"
          }
        ],
        "legacySlug": "1077018",
        "sprite": "assets/metadata-item-1077018.png",
        "spriteSha256": "0c794d875428cc9dea83f3fdc30dc0bc2bfafce1f95d3371edd7954c48c2598a"
      },
      {
        "itemId": 1007058,
        "name": "Blue Pajama Hat",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-2026-11-04"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-2026-11-04",
            "url": "https://www.nexon.com/maplestory/general-post/46331",
            "sha256": "f965e9e5385bc7a2f8a42324e71aa25758b6dd5d43a824b97e58e1a0c1603a19"
          }
        ],
        "legacySlug": "1007058",
        "sprite": "assets/metadata-item-1007058.png",
        "spriteSha256": "cd0aa4e5c2b04da8052d14244050e812ef0224da02b4dfdf45ba13504535099e"
      },
      {
        "itemId": 1067018,
        "name": "Blue Polka-Dot Pajama Pants",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-2026-11-04"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-2026-11-04",
            "url": "https://www.nexon.com/maplestory/general-post/46331",
            "sha256": "f965e9e5385bc7a2f8a42324e71aa25758b6dd5d43a824b97e58e1a0c1603a19"
          }
        ],
        "legacySlug": "1067018",
        "sprite": "assets/metadata-item-1067018.png",
        "spriteSha256": "40caa34ad9fbf587e491843f8d346acac0de1610ac38dc75a9c7b5236b6a1461"
      },
      {
        "itemId": 1047021,
        "name": "Blue Polka-Dot Pajama Top",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-2026-11-04"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-2026-11-04",
            "url": "https://www.nexon.com/maplestory/general-post/46331",
            "sha256": "f965e9e5385bc7a2f8a42324e71aa25758b6dd5d43a824b97e58e1a0c1603a19"
          }
        ],
        "legacySlug": "1047021",
        "sprite": "assets/metadata-item-1047021.png",
        "spriteSha256": "bc6631565c713798b53d3203682d8d923ab6c2dfe61cca3cb7e995644e95e79d"
      },
      {
        "itemId": 1057128,
        "name": "Blue Snow Flower Wear",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-2026-11-04"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-2026-11-04",
            "url": "https://www.nexon.com/maplestory/general-post/46331",
            "sha256": "f965e9e5385bc7a2f8a42324e71aa25758b6dd5d43a824b97e58e1a0c1603a19"
          }
        ],
        "legacySlug": "1057128",
        "sprite": "assets/metadata-item-1057128.png",
        "spriteSha256": "daac1aa9f883b727e2674eb6804631ee4537a0e83a52803ee397492fe4e75c1b"
      },
      {
        "itemId": 1087020,
        "name": "Blue Watch",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "founders-2026-10-06"
        ],
        "evidence": [
          {
            "edition": "founders-2026-10-06",
            "url": "https://www.nexon.com/maplestory/general-post/45538",
            "sha256": "6c88e7ce3c274146bb3a5dce350142c445d5e224fd1fe3d11df24097035d5e36"
          }
        ],
        "legacySlug": "blue-watch",
        "sprite": "assets/blue-watch.png",
        "spriteSha256": "5028779e8db7ebb3becd0bbbeafc784f9e011145817e6bf78e50874577b57cfe"
      },
      {
        "itemId": 1047135,
        "name": "Bomber Jacket",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-2026-11-04"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-2026-11-04",
            "url": "https://www.nexon.com/maplestory/general-post/46331",
            "sha256": "f965e9e5385bc7a2f8a42324e71aa25758b6dd5d43a824b97e58e1a0c1603a19"
          }
        ],
        "legacySlug": "1047135",
        "sprite": "assets/metadata-item-1047135.png",
        "spriteSha256": "0bb7ee4b03756325b40d98bc8ad185b4d9e16ec3e1934563bbb0b2e08c108ec2"
      },
      {
        "itemId": 1067166,
        "name": "Bone Buckled Slacks",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "halloween-2026-10-28"
        ],
        "evidence": [
          {
            "edition": "halloween-2026-10-28",
            "url": "https://www.nexon.com/maplestory/general-post/46524",
            "sha256": "16d4689fa00b005ccee9f89e3e591fd9251dd3abe3f865fcc72685e22bf12c30"
          }
        ],
        "legacySlug": "bone-buckled-slacks",
        "sprite": "assets/bone-buckled-slacks.png",
        "spriteSha256": "397039e4f776357a47579b48db5d6a7d02beeed1e20f72d448b589962552c413"
      },
      {
        "itemId": 1087005,
        "name": "Brown Bandage",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "halloween-2026-10-28"
        ],
        "evidence": [
          {
            "edition": "halloween-2026-10-28",
            "url": "https://www.nexon.com/maplestory/general-post/46524",
            "sha256": "16d4689fa00b005ccee9f89e3e591fd9251dd3abe3f865fcc72685e22bf12c30"
          }
        ],
        "legacySlug": "brown-bandage",
        "sprite": "assets/brown-bandage.png",
        "spriteSha256": "32aed40b49765f5c271f05db72b9082fd15153a441e0e3c515f09c2e9c021187"
      },
      {
        "itemId": 1057088,
        "name": "Brown Casual Look",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-grand-launch-2026"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-grand-launch-2026",
            "url": "https://www.nexon.com/maplestory/news/46362",
            "sha256": "4984ca3d0227803b82c0ab09ac69817265b66fd36a7cae0d4cbcc3765979b2e6"
          }
        ],
        "legacySlug": "brown-casual-look",
        "sprite": "assets/brown-casual-look.png",
        "spriteSha256": "f07260bc759525c3c35fddb038668e9682877118fdda64efced3ffae89793fdf"
      },
      {
        "itemId": 1077100,
        "name": "Brown Dress Shoes",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-grand-launch-2026"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-grand-launch-2026",
            "url": "https://www.nexon.com/maplestory/news/46362",
            "sha256": "4984ca3d0227803b82c0ab09ac69817265b66fd36a7cae0d4cbcc3765979b2e6"
          }
        ],
        "legacySlug": "brown-dress-shoes",
        "sprite": "assets/brown-dress-shoes.png",
        "spriteSha256": "8074195680a9302cfb0f745fd4cc5dafdc601555d1102e53633304d63236a99f"
      },
      {
        "itemId": 1057090,
        "name": "Buddy Overall Jeans (Blue)",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-grand-launch-2026"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-grand-launch-2026",
            "url": "https://www.nexon.com/maplestory/news/46362",
            "sha256": "4984ca3d0227803b82c0ab09ac69817265b66fd36a7cae0d4cbcc3765979b2e6"
          }
        ],
        "legacySlug": null,
        "sprite": null,
        "spriteSha256": null
      },
      {
        "itemId": 1057096,
        "name": "Buddy Overall Jeans (Red)",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-grand-launch-2026"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-grand-launch-2026",
            "url": "https://www.nexon.com/maplestory/news/46362",
            "sha256": "4984ca3d0227803b82c0ab09ac69817265b66fd36a7cae0d4cbcc3765979b2e6"
          }
        ],
        "legacySlug": null,
        "sprite": null,
        "spriteSha256": null
      },
      {
        "itemId": 1057057,
        "name": "Bunny Costume",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-2026-11-04"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-2026-11-04",
            "url": "https://www.nexon.com/maplestory/general-post/46331",
            "sha256": "f965e9e5385bc7a2f8a42324e71aa25758b6dd5d43a824b97e58e1a0c1603a19"
          }
        ],
        "legacySlug": "1057057",
        "sprite": "assets/metadata-item-1057057.png",
        "spriteSha256": "d4a110be191b63999ddc81989b588280163833d39a678123975793160d53a709"
      },
      {
        "itemId": 1007136,
        "name": "Bunny Earmuffs",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "founders-2026-10-06"
        ],
        "evidence": [
          {
            "edition": "founders-2026-10-06",
            "url": "https://www.nexon.com/maplestory/general-post/45538",
            "sha256": "6c88e7ce3c274146bb3a5dce350142c445d5e224fd1fe3d11df24097035d5e36"
          }
        ],
        "legacySlug": "bunny-earmuffs",
        "sprite": "assets/bunny-earmuffs.png",
        "spriteSha256": "f04369c01f24673efc9fc70c895086b2a3b03b5bb6107d311677d00fd68de72d"
      },
      {
        "itemId": 1007142,
        "name": "Bunny Ears",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "founders-2026-10-06"
        ],
        "evidence": [
          {
            "edition": "founders-2026-10-06",
            "url": "https://www.nexon.com/maplestory/general-post/45538",
            "sha256": "6c88e7ce3c274146bb3a5dce350142c445d5e224fd1fe3d11df24097035d5e36"
          }
        ],
        "legacySlug": "bunny-ears",
        "sprite": "assets/bunny-ears.png",
        "spriteSha256": "861aef95095518285d1fb7bfd766a49e8b283b085aba8777e18e464911ae1abb"
      },
      {
        "itemId": 1007053,
        "name": "Bunny Hat",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-2026-11-04"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-2026-11-04",
            "url": "https://www.nexon.com/maplestory/general-post/46331",
            "sha256": "f965e9e5385bc7a2f8a42324e71aa25758b6dd5d43a824b97e58e1a0c1603a19"
          }
        ],
        "legacySlug": "1007053",
        "sprite": "assets/metadata-item-1007053.png",
        "spriteSha256": "40e7801fec1a4a61e2df6fb9707755357f68c2b6868a04fcd40aaab87081330c"
      },
      {
        "itemId": 1077020,
        "name": "Bunny Slippers",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-2026-11-04"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-2026-11-04",
            "url": "https://www.nexon.com/maplestory/general-post/46331",
            "sha256": "f965e9e5385bc7a2f8a42324e71aa25758b6dd5d43a824b97e58e1a0c1603a19"
          }
        ],
        "legacySlug": "1077020",
        "sprite": "assets/metadata-item-1077020.png",
        "spriteSha256": "c243976d72233893856f30f0f229ac8cde911a9228220842ffffac2b6242d4b1"
      },
      {
        "itemId": 1067079,
        "name": "Bunny-Padded Snowboard Pants",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-2026-11-04"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-2026-11-04",
            "url": "https://www.nexon.com/maplestory/general-post/46331",
            "sha256": "f965e9e5385bc7a2f8a42324e71aa25758b6dd5d43a824b97e58e1a0c1603a19"
          }
        ],
        "legacySlug": "1067079",
        "sprite": "assets/metadata-item-1067079.png",
        "spriteSha256": "91f0a552eef7a152d0bfe1941b5f3965c929e8b22327f7852f7f3983dbab2a42"
      },
      {
        "itemId": 1067076,
        "name": "Butterfly Skirt",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "founders-2026-10-06"
        ],
        "evidence": [
          {
            "edition": "founders-2026-10-06",
            "url": "https://www.nexon.com/maplestory/general-post/45538",
            "sha256": "6c88e7ce3c274146bb3a5dce350142c445d5e224fd1fe3d11df24097035d5e36"
          }
        ],
        "legacySlug": "butterfly-skirt",
        "sprite": "assets/butterfly-skirt.png",
        "spriteSha256": "44b45698f538efd43747d56e71fb913ca745cc6920ee14444aebb8cfcf8f8774"
      },
      {
        "itemId": 1077060,
        "name": "Cacao Bear Shoes",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "aurora-season-1-2026"
        ],
        "evidence": [
          {
            "edition": "aurora-season-1-2026",
            "url": "https://www.nexon.com/maplestory/general-post/45659",
            "sha256": "2da85bc74092abda3f075bb94aa001596ecc2e4a7c21d8658aef481f084861ee"
          }
        ],
        "legacySlug": "cacao-bear-shoes",
        "sprite": "assets/cacao-bear-shoes.png",
        "spriteSha256": "dbdd03e0024e5353b6ce9b47550bdf531d058fa918af0b252a51489248b5d808"
      },
      {
        "itemId": 1077004,
        "name": "Camping Boots",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-grand-launch-2026"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-grand-launch-2026",
            "url": "https://www.nexon.com/maplestory/news/46362",
            "sha256": "4984ca3d0227803b82c0ab09ac69817265b66fd36a7cae0d4cbcc3765979b2e6"
          }
        ],
        "legacySlug": "camping-boots",
        "sprite": "assets/camping-boots.png",
        "spriteSha256": "f12d32f1c9ee9803e9fe19d7875de63b01edd9760540b6e78127fbd9533d28de"
      },
      {
        "itemId": 1702326,
        "name": "Cat Soul",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "halloween-2026-10-28"
        ],
        "evidence": [
          {
            "edition": "halloween-2026-10-28",
            "url": "https://www.nexon.com/maplestory/general-post/46524",
            "sha256": "16d4689fa00b005ccee9f89e3e591fd9251dd3abe3f865fcc72685e22bf12c30"
          }
        ],
        "legacySlug": null,
        "sprite": null,
        "spriteSha256": null
      },
      {
        "itemId": 1057049,
        "name": "Cat Suit",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "founders-2026-10-06"
        ],
        "evidence": [
          {
            "edition": "founders-2026-10-06",
            "url": "https://www.nexon.com/maplestory/general-post/45538",
            "sha256": "6c88e7ce3c274146bb3a5dce350142c445d5e224fd1fe3d11df24097035d5e36"
          }
        ],
        "legacySlug": "cat-suit",
        "sprite": "assets/cat-suit.png",
        "spriteSha256": "2654a53772f70780fabee0306dba6fd5afbbb09c361e8c94f041b59aa0d72215"
      },
      {
        "itemId": 1702022,
        "name": "Cherub's Bow",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "founders-2026-10-06"
        ],
        "evidence": [
          {
            "edition": "founders-2026-10-06",
            "url": "https://www.nexon.com/maplestory/general-post/45538",
            "sha256": "6c88e7ce3c274146bb3a5dce350142c445d5e224fd1fe3d11df24097035d5e36"
          }
        ],
        "legacySlug": "cherubs-bow",
        "sprite": "assets/cherubs-bow.png",
        "spriteSha256": "de183b7a797386a746296c1b991094cd4a232175c54165257ab4c0546ace0ef9"
      },
      {
        "itemId": 1017024,
        "name": "Choco Candy Cookie",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "aurora-season-1-2026"
        ],
        "evidence": [
          {
            "edition": "aurora-season-1-2026",
            "url": "https://www.nexon.com/maplestory/general-post/45659",
            "sha256": "2da85bc74092abda3f075bb94aa001596ecc2e4a7c21d8658aef481f084861ee"
          }
        ],
        "legacySlug": "choco-candy-cookie",
        "sprite": "assets/choco-candy-cookie.png",
        "spriteSha256": "8ff5dd1eedb385bd518da46b2c4bd1a638b51bff27d16ab39dac83cf28af105c"
      },
      {
        "itemId": 1112231,
        "name": "Chocolate Chat Ring",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "aurora-season-1-2026"
        ],
        "evidence": [
          {
            "edition": "aurora-season-1-2026",
            "url": "https://www.nexon.com/maplestory/general-post/45659",
            "sha256": "2da85bc74092abda3f075bb94aa001596ecc2e4a7c21d8658aef481f084861ee"
          }
        ],
        "legacySlug": "chocolate-chat-ring",
        "sprite": "assets/chocolate-chat-ring.png",
        "spriteSha256": "07484fc88a96156d208189e6a3005fa085ce65b65325639a18db2fc6f8787812"
      },
      {
        "itemId": 1112113,
        "name": "Chocolate Label Ring",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "aurora-season-1-2026"
        ],
        "evidence": [
          {
            "edition": "aurora-season-1-2026",
            "url": "https://www.nexon.com/maplestory/general-post/45659",
            "sha256": "2da85bc74092abda3f075bb94aa001596ecc2e4a7c21d8658aef481f084861ee"
          }
        ],
        "legacySlug": "chocolate-label-ring",
        "sprite": "assets/chocolate-label-ring.png",
        "spriteSha256": "491b4e8e363e653d49ccceb8d22e2f8a61a36ad45143c5008c093175b101b691"
      },
      {
        "itemId": 1087021,
        "name": "Chocolate Ribbon",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "aurora-season-1-2026"
        ],
        "evidence": [
          {
            "edition": "aurora-season-1-2026",
            "url": "https://www.nexon.com/maplestory/general-post/45659",
            "sha256": "2da85bc74092abda3f075bb94aa001596ecc2e4a7c21d8658aef481f084861ee"
          }
        ],
        "legacySlug": "chocolate-ribbon",
        "sprite": "assets/chocolate-ribbon.png",
        "spriteSha256": "b087e222c1580eb4326c32dad9ecc332abed3d644904e8ad928aeaa46fedaf74"
      },
      {
        "itemId": 1107052,
        "name": "Coffin of Gloom",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "halloween-2026-10-28"
        ],
        "evidence": [
          {
            "edition": "halloween-2026-10-28",
            "url": "https://www.nexon.com/maplestory/general-post/46524",
            "sha256": "16d4689fa00b005ccee9f89e3e591fd9251dd3abe3f865fcc72685e22bf12c30"
          }
        ],
        "legacySlug": "coffin-of-gloom",
        "sprite": "assets/coffin-of-gloom.png",
        "spriteSha256": "73a37e5a036939a4201ccb8511e9d1e8edee0b6208944c87c72903d775630ce3"
      },
      {
        "itemId": 1107065,
        "name": "Count Dracula Cape",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "halloween-2026-10-28"
        ],
        "evidence": [
          {
            "edition": "halloween-2026-10-28",
            "url": "https://www.nexon.com/maplestory/general-post/46524",
            "sha256": "16d4689fa00b005ccee9f89e3e591fd9251dd3abe3f865fcc72685e22bf12c30"
          }
        ],
        "legacySlug": "count-dracula-cape",
        "sprite": "assets/count-dracula-cape.png",
        "spriteSha256": "0acd373fe2a11f35cb4bf805e6dbc39f267eaebe14c4dd1a2db6a9caec58208e"
      },
      {
        "itemId": 1047061,
        "name": "Crusader T-Shirt",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-grand-launch-2026"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-grand-launch-2026",
            "url": "https://www.nexon.com/maplestory/news/46362",
            "sha256": "4984ca3d0227803b82c0ab09ac69817265b66fd36a7cae0d4cbcc3765979b2e6"
          }
        ],
        "legacySlug": "crusader-t-shirt",
        "sprite": "assets/crusader-t-shirt.png",
        "spriteSha256": "eb0e5ad6cc02fde16b0ee9ccf15af564a980e1df4035ae5a09d1659b81c125b3"
      },
      {
        "itemId": 1107013,
        "name": "Cuddle Bear",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-2026-11-04"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-2026-11-04",
            "url": "https://www.nexon.com/maplestory/general-post/46331",
            "sha256": "f965e9e5385bc7a2f8a42324e71aa25758b6dd5d43a824b97e58e1a0c1603a19"
          }
        ],
        "legacySlug": "1107013",
        "sprite": "assets/metadata-item-1107013.png",
        "spriteSha256": "cacf92553967439ab1375df4799e3806d071a22153ac9fe5e423a8f5ae53cc82"
      },
      {
        "itemId": 1007140,
        "name": "Cute Mouse Ears",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-grand-launch-2026"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-grand-launch-2026",
            "url": "https://www.nexon.com/maplestory/news/46362",
            "sha256": "4984ca3d0227803b82c0ab09ac69817265b66fd36a7cae0d4cbcc3765979b2e6"
          }
        ],
        "legacySlug": "cute-mouse-ears",
        "sprite": "assets/cute-mouse-ears.png",
        "spriteSha256": "4f96cc55041d41348e44f039a6d1735dee1332ea79ff9e35a68c314a051dce17"
      },
      {
        "itemId": 1007706,
        "name": "Dark Devil Hat",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "halloween-2026-10-28"
        ],
        "evidence": [
          {
            "edition": "halloween-2026-10-28",
            "url": "https://www.nexon.com/maplestory/general-post/46524",
            "sha256": "16d4689fa00b005ccee9f89e3e591fd9251dd3abe3f865fcc72685e22bf12c30"
          }
        ],
        "legacySlug": "dark-devil-hat",
        "sprite": "assets/dark-devil-hat.png",
        "spriteSha256": "261d92bfaf313aaefc3f17ae5585a3be68c07d510d1deaaf8bd287767309d691"
      },
      {
        "itemId": 1057052,
        "name": "Dark Enamel Suit",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "halloween-2026-10-28"
        ],
        "evidence": [
          {
            "edition": "halloween-2026-10-28",
            "url": "https://www.nexon.com/maplestory/general-post/46524",
            "sha256": "16d4689fa00b005ccee9f89e3e591fd9251dd3abe3f865fcc72685e22bf12c30"
          }
        ],
        "legacySlug": "dark-enamel-suit",
        "sprite": "assets/dark-enamel-suit.png",
        "spriteSha256": "d66c3ab2160687717bc3209a38e81d813cffc06dd94f47b52c074b37443de1dc"
      },
      {
        "itemId": 1057036,
        "name": "Dark Suit",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "halloween-2026-10-28"
        ],
        "evidence": [
          {
            "edition": "halloween-2026-10-28",
            "url": "https://www.nexon.com/maplestory/general-post/46524",
            "sha256": "16d4689fa00b005ccee9f89e3e591fd9251dd3abe3f865fcc72685e22bf12c30"
          }
        ],
        "legacySlug": "dark-suit",
        "sprite": "assets/dark-suit.png",
        "spriteSha256": "2de051d8cfb2865e98b72b63eaeeecc891e99f2e0e392a27b1a25e3ecc436e9f"
      },
      {
        "itemId": 1007367,
        "name": "Demon Goblin",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "halloween-2026-10-28"
        ],
        "evidence": [
          {
            "edition": "halloween-2026-10-28",
            "url": "https://www.nexon.com/maplestory/general-post/46524",
            "sha256": "16d4689fa00b005ccee9f89e3e591fd9251dd3abe3f865fcc72685e22bf12c30"
          }
        ],
        "legacySlug": "demon-goblin",
        "sprite": "assets/demon-goblin.png",
        "spriteSha256": "274b60d20cadccecdd835b3b8ed7d89b0dfeea38801b4d9a87924f77713634a1"
      },
      {
        "itemId": 1067092,
        "name": "Denim Wrinkled Skirt",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-grand-launch-2026"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-grand-launch-2026",
            "url": "https://www.nexon.com/maplestory/news/46362",
            "sha256": "4984ca3d0227803b82c0ab09ac69817265b66fd36a7cae0d4cbcc3765979b2e6"
          }
        ],
        "legacySlug": "denim-wrinkled-skirt",
        "sprite": "assets/denim-wrinkled-skirt.png",
        "spriteSha256": "68f112f8744a5e84ecbf62d3988d0120722594fb79768a5cc05a31071cd2b33e"
      },
      {
        "itemId": 1702047,
        "name": "Detective Glass",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "aurora-season-1-2026"
        ],
        "evidence": [
          {
            "edition": "aurora-season-1-2026",
            "url": "https://www.nexon.com/maplestory/general-post/45659",
            "sha256": "2da85bc74092abda3f075bb94aa001596ecc2e4a7c21d8658aef481f084861ee"
          }
        ],
        "legacySlug": "detective-glass",
        "sprite": "assets/detective-glass.png",
        "spriteSha256": "2115d70157b035c913cda6c625a261965cf11cd05a1c9721adb5a7abb2220156"
      },
      {
        "itemId": 1007105,
        "name": "Detective Hat",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-grand-launch-2026"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-grand-launch-2026",
            "url": "https://www.nexon.com/maplestory/news/46362",
            "sha256": "4984ca3d0227803b82c0ab09ac69817265b66fd36a7cae0d4cbcc3765979b2e6"
          }
        ],
        "legacySlug": "detective-hat",
        "sprite": "assets/detective-hat.png",
        "spriteSha256": "6aa1dc3a453a86fc85ddd6d73062961898bc937858fcc3c3e8d8ff82fa786aeb"
      },
      {
        "itemId": 1007525,
        "name": "Devil Horns",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "halloween-2026-10-28"
        ],
        "evidence": [
          {
            "edition": "halloween-2026-10-28",
            "url": "https://www.nexon.com/maplestory/general-post/46524",
            "sha256": "16d4689fa00b005ccee9f89e3e591fd9251dd3abe3f865fcc72685e22bf12c30"
          }
        ],
        "legacySlug": "devil-horns",
        "sprite": "assets/devil-horns.png",
        "spriteSha256": "54c4ebe17556c8b50bb2f6633586cce9a6683b26891e11e196c4c74bb774b276"
      },
      {
        "itemId": 1107012,
        "name": "Devil Wings",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "halloween-2026-10-28"
        ],
        "evidence": [
          {
            "edition": "halloween-2026-10-28",
            "url": "https://www.nexon.com/maplestory/general-post/46524",
            "sha256": "16d4689fa00b005ccee9f89e3e591fd9251dd3abe3f865fcc72685e22bf12c30"
          }
        ],
        "legacySlug": "devil-wings",
        "sprite": "assets/devil-wings.png",
        "spriteSha256": "67d6db01ae438aef7d3b81f5fd9a021cb5e3d5f69ed9f677db2b350bc6bacee6"
      },
      {
        "itemId": 1007287,
        "name": "Devilish Horns",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "halloween-2026-10-28"
        ],
        "evidence": [
          {
            "edition": "halloween-2026-10-28",
            "url": "https://www.nexon.com/maplestory/general-post/46524",
            "sha256": "16d4689fa00b005ccee9f89e3e591fd9251dd3abe3f865fcc72685e22bf12c30"
          }
        ],
        "legacySlug": "devilish-horns",
        "sprite": "assets/devilish-horns.png",
        "spriteSha256": "240302790b1b770f413c7732994a6f2cfe04bc86b41899395aa1cfc871060405"
      },
      {
        "itemId": 1017022,
        "name": "Dollish Pink",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "founders-2026-10-06"
        ],
        "evidence": [
          {
            "edition": "founders-2026-10-06",
            "url": "https://www.nexon.com/maplestory/general-post/45538",
            "sha256": "6c88e7ce3c274146bb3a5dce350142c445d5e224fd1fe3d11df24097035d5e36"
          }
        ],
        "legacySlug": "dollish-pink",
        "sprite": "assets/dollish-pink.png",
        "spriteSha256": "0898c5e5f8d83f0d3fc3e027bd97029263db3cd921b243cf7d5b02e4c9dd55f9"
      },
      {
        "itemId": 1702325,
        "name": "Evil Skull",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "halloween-2026-10-28"
        ],
        "evidence": [
          {
            "edition": "halloween-2026-10-28",
            "url": "https://www.nexon.com/maplestory/general-post/46524",
            "sha256": "16d4689fa00b005ccee9f89e3e591fd9251dd3abe3f865fcc72685e22bf12c30"
          }
        ],
        "legacySlug": null,
        "sprite": null,
        "spriteSha256": null
      },
      {
        "itemId": 1067012,
        "name": "Faded Bell-Bottom Jeans",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-grand-launch-2026"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-grand-launch-2026",
            "url": "https://www.nexon.com/maplestory/news/46362",
            "sha256": "4984ca3d0227803b82c0ab09ac69817265b66fd36a7cae0d4cbcc3765979b2e6"
          }
        ],
        "legacySlug": "faded-bell-bottom-jeans",
        "sprite": "assets/faded-bell-bottom-jeans.png",
        "spriteSha256": "cb27f58d4324d510000ae5155614b01ecedf510f019ba4ae063f57a49c1c5cfe"
      },
      {
        "itemId": 1027029,
        "name": "Frameless Glasses",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-grand-launch-2026"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-grand-launch-2026",
            "url": "https://www.nexon.com/maplestory/news/46362",
            "sha256": "4984ca3d0227803b82c0ab09ac69817265b66fd36a7cae0d4cbcc3765979b2e6"
          }
        ],
        "legacySlug": "frameless-glasses",
        "sprite": "assets/frameless-glasses.png",
        "spriteSha256": "2b16a3d1ff682c0814b26ae220a06c4e0920c45841328501b95ccbda94479fb6"
      },
      {
        "itemId": 1107006,
        "name": "Gargoyle Wings",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "halloween-2026-10-28"
        ],
        "evidence": [
          {
            "edition": "halloween-2026-10-28",
            "url": "https://www.nexon.com/maplestory/general-post/46524",
            "sha256": "16d4689fa00b005ccee9f89e3e591fd9251dd3abe3f865fcc72685e22bf12c30"
          }
        ],
        "legacySlug": "gargoyle-wings",
        "sprite": "assets/gargoyle-wings.png",
        "spriteSha256": "53ac152606320ff31019752c2c90d26a29ac298b18df9c8a1a427438cc714871"
      },
      {
        "itemId": 1017013,
        "name": "Gentleman's Mustache",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-grand-launch-2026"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-grand-launch-2026",
            "url": "https://www.nexon.com/maplestory/news/46362",
            "sha256": "4984ca3d0227803b82c0ab09ac69817265b66fd36a7cae0d4cbcc3765979b2e6"
          }
        ],
        "legacySlug": "gentlemans-mustache",
        "sprite": "assets/gentlemans-mustache.png",
        "spriteSha256": "732f7f145ff8845e4e01f42f56d7c6ca3ccc69576476c793249030388616ee63"
      },
      {
        "itemId": 1057037,
        "name": "Ghost Costume",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "halloween-2026-10-28"
        ],
        "evidence": [
          {
            "edition": "halloween-2026-10-28",
            "url": "https://www.nexon.com/maplestory/general-post/46524",
            "sha256": "16d4689fa00b005ccee9f89e3e591fd9251dd3abe3f865fcc72685e22bf12c30"
          }
        ],
        "legacySlug": "ghost-costume",
        "sprite": "assets/ghost-costume.png",
        "spriteSha256": "dd48bb326e4cfd633d128474f0e9727f49cf7908d2ad37d851d3f7fe11582017"
      },
      {
        "itemId": 1057058,
        "name": "Ghost Suit",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "halloween-2026-10-28"
        ],
        "evidence": [
          {
            "edition": "halloween-2026-10-28",
            "url": "https://www.nexon.com/maplestory/general-post/46524",
            "sha256": "16d4689fa00b005ccee9f89e3e591fd9251dd3abe3f865fcc72685e22bf12c30"
          }
        ],
        "legacySlug": "ghost-suit",
        "sprite": "assets/ghost-suit.png",
        "spriteSha256": "e44db1217c663176bb5de66a7c0da0b7cae669c1aea15675032b2d5fbd72052c"
      },
      {
        "itemId": 1702096,
        "name": "Glowing Pumpkin Basket",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "halloween-2026-10-28"
        ],
        "evidence": [
          {
            "edition": "halloween-2026-10-28",
            "url": "https://www.nexon.com/maplestory/general-post/46524",
            "sha256": "16d4689fa00b005ccee9f89e3e591fd9251dd3abe3f865fcc72685e22bf12c30"
          }
        ],
        "legacySlug": null,
        "sprite": null,
        "spriteSha256": null
      },
      {
        "itemId": 1077017,
        "name": "Gold Kitty Slippers",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "founders-2026-10-06"
        ],
        "evidence": [
          {
            "edition": "founders-2026-10-06",
            "url": "https://www.nexon.com/maplestory/general-post/45538",
            "sha256": "6c88e7ce3c274146bb3a5dce350142c445d5e224fd1fe3d11df24097035d5e36"
          }
        ],
        "legacySlug": "gold-kitty-slippers",
        "sprite": "assets/gold-kitty-slippers.png",
        "spriteSha256": "c2e103c534041ac295be7563cb7de55753c2cfe150ca45fff97ef47d440655b9"
      },
      {
        "itemId": 1007002,
        "name": "Green Camping Hat",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-grand-launch-2026"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-grand-launch-2026",
            "url": "https://www.nexon.com/maplestory/news/46362",
            "sha256": "4984ca3d0227803b82c0ab09ac69817265b66fd36a7cae0d4cbcc3765979b2e6"
          }
        ],
        "legacySlug": "green-camping-hat",
        "sprite": "assets/green-camping-hat.png",
        "spriteSha256": "3112af611abf27192174780dc65ef00433718f6022a735a0a6fd59d97a10d72b"
      },
      {
        "itemId": 1047005,
        "name": "Green Camping Shirt",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-grand-launch-2026"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-grand-launch-2026",
            "url": "https://www.nexon.com/maplestory/news/46362",
            "sha256": "4984ca3d0227803b82c0ab09ac69817265b66fd36a7cae0d4cbcc3765979b2e6"
          }
        ],
        "legacySlug": "green-camping-shirt",
        "sprite": "assets/green-camping-shirt.png",
        "spriteSha256": "04ccd4f083d667e910a3c220a4e9d27888e693c42a5bf98cefe360166dee5908"
      },
      {
        "itemId": 1067003,
        "name": "Green Camping Shorts",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-grand-launch-2026"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-grand-launch-2026",
            "url": "https://www.nexon.com/maplestory/news/46362",
            "sha256": "4984ca3d0227803b82c0ab09ac69817265b66fd36a7cae0d4cbcc3765979b2e6"
          }
        ],
        "legacySlug": "green-camping-shorts",
        "sprite": "assets/green-camping-shorts.png",
        "spriteSha256": "cf1c5d7ab0aa209738a127b788ad254da32190b952260f401d58f4bdead3bee6"
      },
      {
        "itemId": 1057012,
        "name": "Green Overall",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-grand-launch-2026"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-grand-launch-2026",
            "url": "https://www.nexon.com/maplestory/news/46362",
            "sha256": "4984ca3d0227803b82c0ab09ac69817265b66fd36a7cae0d4cbcc3765979b2e6"
          }
        ],
        "legacySlug": "green-overall",
        "sprite": "assets/green-overall.png",
        "spriteSha256": "8e91cefa0d359f4f1ff397f2d54f012920b484081ca0e624c5920da9123b4723"
      },
      {
        "itemId": 1027028,
        "name": "Green Sports Goggles",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-2026-11-04"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-2026-11-04",
            "url": "https://www.nexon.com/maplestory/general-post/46331",
            "sha256": "f965e9e5385bc7a2f8a42324e71aa25758b6dd5d43a824b97e58e1a0c1603a19"
          }
        ],
        "legacySlug": "1027028",
        "sprite": "assets/metadata-item-1027028.png",
        "spriteSha256": "9d75d34878f42841e16b69570cfb7249a09807620bc13c411de2fab703071356"
      },
      {
        "itemId": 1057024,
        "name": "Grey Skull Overall",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "halloween-2026-10-28"
        ],
        "evidence": [
          {
            "edition": "halloween-2026-10-28",
            "url": "https://www.nexon.com/maplestory/general-post/46524",
            "sha256": "16d4689fa00b005ccee9f89e3e591fd9251dd3abe3f865fcc72685e22bf12c30"
          }
        ],
        "legacySlug": "grey-skull-overall",
        "sprite": "assets/grey-skull-overall.png",
        "spriteSha256": "0ba7bdf1c797920fcc6cf55e9ee2c5bfb912b9d4dfc5f37ca8f30f7560f6822c"
      },
      {
        "itemId": 1007132,
        "name": "Grey Visor Beanie",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-2026-11-04"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-2026-11-04",
            "url": "https://www.nexon.com/maplestory/general-post/46331",
            "sha256": "f965e9e5385bc7a2f8a42324e71aa25758b6dd5d43a824b97e58e1a0c1603a19"
          }
        ],
        "legacySlug": "1007132",
        "sprite": "assets/metadata-item-1007132.png",
        "spriteSha256": "d12b788cb74f0986c53fe02edae5342ab8b6d0ba15d83a80d57c51d3142cf846"
      },
      {
        "itemId": 1007104,
        "name": "Hat of Death",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "halloween-2026-10-28"
        ],
        "evidence": [
          {
            "edition": "halloween-2026-10-28",
            "url": "https://www.nexon.com/maplestory/general-post/46524",
            "sha256": "16d4689fa00b005ccee9f89e3e591fd9251dd3abe3f865fcc72685e22bf12c30"
          }
        ],
        "legacySlug": "hat-of-death",
        "sprite": "assets/hat-of-death.png",
        "spriteSha256": "03679aeff96b0eb8fe1a081eb70e33f18275a594f020a9553f80b983e3181a3b"
      },
      {
        "itemId": 1107014,
        "name": "Heart Balloon",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-grand-launch-2026"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-grand-launch-2026",
            "url": "https://www.nexon.com/maplestory/news/46362",
            "sha256": "4984ca3d0227803b82c0ab09ac69817265b66fd36a7cae0d4cbcc3765979b2e6"
          }
        ],
        "legacySlug": "heart-balloon",
        "sprite": "assets/heart-balloon.png",
        "spriteSha256": "22c6597cfd5d7ef2051e057b4276b5964938980c3dbaa6a31a72803b772db06a"
      },
      {
        "itemId": 1007143,
        "name": "Heart Sunglasses",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "aurora-season-1-2026"
        ],
        "evidence": [
          {
            "edition": "aurora-season-1-2026",
            "url": "https://www.nexon.com/maplestory/general-post/45659",
            "sha256": "2da85bc74092abda3f075bb94aa001596ecc2e4a7c21d8658aef481f084861ee"
          }
        ],
        "legacySlug": "heart-sunglasses",
        "sprite": "assets/heart-sunglasses.png",
        "spriteSha256": "299c46ffa2f19a6322f99f55b0a48202867b4361bb1c74ffe717d27126a7e1b1"
      },
      {
        "itemId": 1017023,
        "name": "Heartbreaker Lips",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "aurora-season-1-2026"
        ],
        "evidence": [
          {
            "edition": "aurora-season-1-2026",
            "url": "https://www.nexon.com/maplestory/general-post/45659",
            "sha256": "2da85bc74092abda3f075bb94aa001596ecc2e4a7c21d8658aef481f084861ee"
          }
        ],
        "legacySlug": "heartbreaker-lips",
        "sprite": "assets/heartbreaker-lips.png",
        "spriteSha256": "c4e2a6e20c58bc21135f5823caa7e54a706d79e53f74da57032a0a46ad028937"
      },
      {
        "itemId": 1067081,
        "name": "Hearts Tights",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "aurora-season-1-2026"
        ],
        "evidence": [
          {
            "edition": "aurora-season-1-2026",
            "url": "https://www.nexon.com/maplestory/general-post/45659",
            "sha256": "2da85bc74092abda3f075bb94aa001596ecc2e4a7c21d8658aef481f084861ee"
          }
        ],
        "legacySlug": "hearts-tights",
        "sprite": "assets/hearts-tights.png",
        "spriteSha256": "6be08452e4222a68ae03746b1241c06224586e15a68e81fbeb1349b36d1f6211"
      },
      {
        "itemId": 1017088,
        "name": "Ice Cold Red",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-2026-11-04"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-2026-11-04",
            "url": "https://www.nexon.com/maplestory/general-post/46331",
            "sha256": "f965e9e5385bc7a2f8a42324e71aa25758b6dd5d43a824b97e58e1a0c1603a19"
          }
        ],
        "legacySlug": "1017088",
        "sprite": "assets/metadata-item-1017088.png",
        "spriteSha256": "e5bf359404f522306eeaf91802af6c831d8281cc654649305ed315056c7761e7"
      },
      {
        "itemId": 1007489,
        "name": "Iljimae Mask",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "halloween-2026-10-28"
        ],
        "evidence": [
          {
            "edition": "halloween-2026-10-28",
            "url": "https://www.nexon.com/maplestory/general-post/46524",
            "sha256": "16d4689fa00b005ccee9f89e3e591fd9251dd3abe3f865fcc72685e22bf12c30"
          }
        ],
        "legacySlug": "iljimae-mask",
        "sprite": "assets/iljimae-mask.png",
        "spriteSha256": "489be6d98a84696bb9b12e36ec277aef2a81f6ef553448388ab032a585522cc0"
      },
      {
        "itemId": 1112223,
        "name": "Ink-and-Wash Painting Name Tag Ring",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "aurora-season-1-2026"
        ],
        "evidence": [
          {
            "edition": "aurora-season-1-2026",
            "url": "https://www.nexon.com/maplestory/general-post/45659",
            "sha256": "2da85bc74092abda3f075bb94aa001596ecc2e4a7c21d8658aef481f084861ee"
          }
        ],
        "legacySlug": "ink-and-wash-painting-name-tag-ring",
        "sprite": "assets/ink-and-wash-painting-name-tag-ring.png",
        "spriteSha256": "2554fdac85d7311afd1f7a55c2aa7601472e4d1ed9a19be03e1574c385ac15d5"
      },
      {
        "itemId": 1112227,
        "name": "Ink-and-Wash Thought Bubble Ring",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "aurora-season-1-2026"
        ],
        "evidence": [
          {
            "edition": "aurora-season-1-2026",
            "url": "https://www.nexon.com/maplestory/general-post/45659",
            "sha256": "2da85bc74092abda3f075bb94aa001596ecc2e4a7c21d8658aef481f084861ee"
          }
        ],
        "legacySlug": "ink-and-wash-thought-bubble-ring",
        "sprite": "assets/ink-and-wash-thought-bubble-ring.png",
        "spriteSha256": "e595abd3c05d12ad8bcf79cf8a3dc78a52c93a7e23be724a96942bf1aec305f8"
      },
      {
        "itemId": 1067015,
        "name": "Jean Shorts",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "founders-2026-10-06"
        ],
        "evidence": [
          {
            "edition": "founders-2026-10-06",
            "url": "https://www.nexon.com/maplestory/general-post/45538",
            "sha256": "6c88e7ce3c274146bb3a5dce350142c445d5e224fd1fe3d11df24097035d5e36"
          }
        ],
        "legacySlug": "jean-shorts",
        "sprite": "assets/jean-shorts.png",
        "spriteSha256": "decfd0aaac66a52a74b81bd5db824c4e2642e9f249826c5046c7a84bd2da5731"
      },
      {
        "itemId": 1007141,
        "name": "Kitty Camping Hat",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-grand-launch-2026"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-grand-launch-2026",
            "url": "https://www.nexon.com/maplestory/news/46362",
            "sha256": "4984ca3d0227803b82c0ab09ac69817265b66fd36a7cae0d4cbcc3765979b2e6"
          }
        ],
        "legacySlug": "kitty-camping-hat",
        "sprite": "assets/kitty-camping-hat.png",
        "spriteSha256": "84047bf2321038f19b663f49eb795d7102f646bcbdbbbcb530b9d75930fa3222"
      },
      {
        "itemId": 1112215,
        "name": "Kitty Chat Ring",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "founders-2026-10-06"
        ],
        "evidence": [
          {
            "edition": "founders-2026-10-06",
            "url": "https://www.nexon.com/maplestory/general-post/45538",
            "sha256": "6c88e7ce3c274146bb3a5dce350142c445d5e224fd1fe3d11df24097035d5e36"
          }
        ],
        "legacySlug": "kitty-chat-ring",
        "sprite": "assets/kitty-chat-ring.png",
        "spriteSha256": "5e1b6f15ed4fdde3fb76e40fa83ead0434219666d32310a040cc708a8113ab4c"
      },
      {
        "itemId": 1057095,
        "name": "Kitty Hoodie",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-2026-11-04"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-2026-11-04",
            "url": "https://www.nexon.com/maplestory/general-post/46331",
            "sha256": "f965e9e5385bc7a2f8a42324e71aa25758b6dd5d43a824b97e58e1a0c1603a19"
          }
        ],
        "legacySlug": "1057095",
        "sprite": "assets/metadata-item-1057095.png",
        "spriteSha256": "309b7feef15fa8c0c59178abb8dbb030f1ca42f3881ddd968e8634defbeddd8a"
      },
      {
        "itemId": 1067001,
        "name": "Lined Hip-Hop Pants",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "founders-2026-10-06"
        ],
        "evidence": [
          {
            "edition": "founders-2026-10-06",
            "url": "https://www.nexon.com/maplestory/general-post/45538",
            "sha256": "6c88e7ce3c274146bb3a5dce350142c445d5e224fd1fe3d11df24097035d5e36"
          }
        ],
        "legacySlug": "lined-hip-hop-pants",
        "sprite": "assets/lined-hip-hop-pants.png",
        "spriteSha256": "970652844fd39833e77df8fc95c5d9c1f22f69a16b89a0a92c1d744a66430e3f"
      },
      {
        "itemId": 1047098,
        "name": "Loose Fit Sweater",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "aurora-season-1-2026"
        ],
        "evidence": [
          {
            "edition": "aurora-season-1-2026",
            "url": "https://www.nexon.com/maplestory/general-post/45659",
            "sha256": "2da85bc74092abda3f075bb94aa001596ecc2e4a7c21d8658aef481f084861ee"
          }
        ],
        "legacySlug": "loose-fit-sweater",
        "sprite": "assets/loose-fit-sweater.png",
        "spriteSha256": "89e27bd77fcfd44d7e4c9a03d05b5ff58bd66642d17cb6be4d2b6ab441d300e5"
      },
      {
        "itemId": 1017074,
        "name": "Maple-Stein Face",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "halloween-2026-10-28"
        ],
        "evidence": [
          {
            "edition": "halloween-2026-10-28",
            "url": "https://www.nexon.com/maplestory/general-post/46524",
            "sha256": "16d4689fa00b005ccee9f89e3e591fd9251dd3abe3f865fcc72685e22bf12c30"
          }
        ],
        "legacySlug": "maple-stein-face",
        "sprite": "assets/maple-stein-face.png",
        "spriteSha256": "34d30c1aeee5a8a8b9606796806af20bc283a9490fcc2698a3718866d817ccd7"
      },
      {
        "itemId": 1007368,
        "name": "Maple-Stein Head",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "halloween-2026-10-28"
        ],
        "evidence": [
          {
            "edition": "halloween-2026-10-28",
            "url": "https://www.nexon.com/maplestory/general-post/46524",
            "sha256": "16d4689fa00b005ccee9f89e3e591fd9251dd3abe3f865fcc72685e22bf12c30"
          }
        ],
        "legacySlug": "maple-stein-head",
        "sprite": "assets/maple-stein-head.png",
        "spriteSha256": "e5fde6913d4bb830be6aa1f0643d453f33dd4b5606a851cb06858987f30758a0"
      },
      {
        "itemId": 1027022,
        "name": "Medical Eye Patch",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-2026-11-04"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-2026-11-04",
            "url": "https://www.nexon.com/maplestory/general-post/46331",
            "sha256": "f965e9e5385bc7a2f8a42324e71aa25758b6dd5d43a824b97e58e1a0c1603a19"
          }
        ],
        "legacySlug": "1027022",
        "sprite": "assets/metadata-item-1027022.png",
        "spriteSha256": "2303edc48562a87e1bcc83740aaf08a9c44b11a3eb6a1927ea56fddc8c9d5e80"
      },
      {
        "itemId": 1007091,
        "name": "Meshcap",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "founders-2026-10-06"
        ],
        "evidence": [
          {
            "edition": "founders-2026-10-06",
            "url": "https://www.nexon.com/maplestory/general-post/45538",
            "sha256": "6c88e7ce3c274146bb3a5dce350142c445d5e224fd1fe3d11df24097035d5e36"
          }
        ],
        "legacySlug": "meshcap",
        "sprite": "assets/meshcap.png",
        "spriteSha256": "955473a7a2ea57581c6a899a25a0ec80eaa59eb1c038131428d71b3353031448"
      },
      {
        "itemId": 1107007,
        "name": "Michael Wings",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-grand-launch-2026"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-grand-launch-2026",
            "url": "https://www.nexon.com/maplestory/news/46362",
            "sha256": "4984ca3d0227803b82c0ab09ac69817265b66fd36a7cae0d4cbcc3765979b2e6"
          }
        ],
        "legacySlug": "michael-wings",
        "sprite": "assets/michael-wings.png",
        "spriteSha256": "8a3e24b451ea94bce0711f194ef0180a2216999911c2bb9b46f9111f05807a55"
      },
      {
        "itemId": 1077058,
        "name": "Mix-n-Match Sneakers",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-2026-11-04"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-2026-11-04",
            "url": "https://www.nexon.com/maplestory/general-post/46331",
            "sha256": "f965e9e5385bc7a2f8a42324e71aa25758b6dd5d43a824b97e58e1a0c1603a19"
          }
        ],
        "legacySlug": "1077058",
        "sprite": "assets/metadata-item-1077058.png",
        "spriteSha256": "6f20f5e510ba31e5d95cc4252cef27e8a1de7927f2caffc90628d8f09cb73446"
      },
      {
        "itemId": 1007135,
        "name": "Mummy Hat",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "halloween-2026-10-28"
        ],
        "evidence": [
          {
            "edition": "halloween-2026-10-28",
            "url": "https://www.nexon.com/maplestory/general-post/46524",
            "sha256": "16d4689fa00b005ccee9f89e3e591fd9251dd3abe3f865fcc72685e22bf12c30"
          }
        ],
        "legacySlug": "mummy-hat",
        "sprite": "assets/mummy-hat.png",
        "spriteSha256": "b9fdd977ef59e6acf982a3261c951c20790bdda0a2512f1273adcf9236cff2fc"
      },
      {
        "itemId": 1017021,
        "name": "Mummy Mask",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "halloween-2026-10-28"
        ],
        "evidence": [
          {
            "edition": "halloween-2026-10-28",
            "url": "https://www.nexon.com/maplestory/general-post/46524",
            "sha256": "16d4689fa00b005ccee9f89e3e591fd9251dd3abe3f865fcc72685e22bf12c30"
          }
        ],
        "legacySlug": "mummy-mask",
        "sprite": "assets/mummy-mask.png",
        "spriteSha256": "ed317500bb013032c875597e75b038a56da0dc7778e4c97c9e7c6b1adc3d47a9"
      },
      {
        "itemId": 1057100,
        "name": "Mummy Suit",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "halloween-2026-10-28"
        ],
        "evidence": [
          {
            "edition": "halloween-2026-10-28",
            "url": "https://www.nexon.com/maplestory/general-post/46524",
            "sha256": "16d4689fa00b005ccee9f89e3e591fd9251dd3abe3f865fcc72685e22bf12c30"
          }
        ],
        "legacySlug": "mummy-suit",
        "sprite": "assets/mummy-suit.png",
        "spriteSha256": "db18ab1339fc25730a130a696c1e9a356ab8906721a715cee26f6cc980d4f3f2"
      },
      {
        "itemId": 1107016,
        "name": "My Buddy Rex",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-2026-11-04"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-2026-11-04",
            "url": "https://www.nexon.com/maplestory/general-post/46331",
            "sha256": "f965e9e5385bc7a2f8a42324e71aa25758b6dd5d43a824b97e58e1a0c1603a19"
          }
        ],
        "legacySlug": "1107016",
        "sprite": "assets/metadata-item-1107016.png",
        "spriteSha256": "1df96716017c9b65c02f50017db8c9487a7f0c60c0417d3bc4a4424ff025a521"
      },
      {
        "itemId": 1047044,
        "name": "Old School Blazer",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-2026-11-04"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-2026-11-04",
            "url": "https://www.nexon.com/maplestory/general-post/46331",
            "sha256": "f965e9e5385bc7a2f8a42324e71aa25758b6dd5d43a824b97e58e1a0c1603a19"
          }
        ],
        "legacySlug": "1047044",
        "sprite": "assets/metadata-item-1047044.png",
        "spriteSha256": "6363e8da7ee5442549791108f7a8011a78ed069be4d6d46ad12d3b309009ca7e"
      },
      {
        "itemId": 1007103,
        "name": "Old School Uniform Hat",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-2026-11-04"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-2026-11-04",
            "url": "https://www.nexon.com/maplestory/general-post/46331",
            "sha256": "f965e9e5385bc7a2f8a42324e71aa25758b6dd5d43a824b97e58e1a0c1603a19"
          }
        ],
        "legacySlug": "1007103",
        "sprite": "assets/metadata-item-1007103.png",
        "spriteSha256": "9f2520e21b979008af96d950a176e9ca8383fc623626368219fc8e1e274120c0"
      },
      {
        "itemId": 1067045,
        "name": "Old School Uniform Pants",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-2026-11-04"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-2026-11-04",
            "url": "https://www.nexon.com/maplestory/general-post/46331",
            "sha256": "f965e9e5385bc7a2f8a42324e71aa25758b6dd5d43a824b97e58e1a0c1603a19"
          }
        ],
        "legacySlug": "1067045",
        "sprite": "assets/metadata-item-1067045.png",
        "spriteSha256": "d20e55befa118ed1b0c91f773980b45cde307eeaf601262e31256e24e040df8e"
      },
      {
        "itemId": 1067065,
        "name": "Old School Uniform Skirt",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-2026-11-04"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-2026-11-04",
            "url": "https://www.nexon.com/maplestory/general-post/46331",
            "sha256": "f965e9e5385bc7a2f8a42324e71aa25758b6dd5d43a824b97e58e1a0c1603a19"
          }
        ],
        "legacySlug": "1067065",
        "sprite": "assets/metadata-item-1067065.png",
        "spriteSha256": "ad9254abcdecbbceed44f1ab531dc0c79e4b316494a918e0b7d2e320afb6abc0"
      },
      {
        "itemId": 1047075,
        "name": "Old School Uniform Top",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-2026-11-04"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-2026-11-04",
            "url": "https://www.nexon.com/maplestory/general-post/46331",
            "sha256": "f965e9e5385bc7a2f8a42324e71aa25758b6dd5d43a824b97e58e1a0c1603a19"
          }
        ],
        "legacySlug": "1047075",
        "sprite": "assets/metadata-item-1047075.png",
        "spriteSha256": "55ee4c149b0533ef0817bd1c1600368e031a6ce23a0262befdbde88f1ba29944"
      },
      {
        "itemId": 1007072,
        "name": "Olive Beanie",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-2026-11-04"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-2026-11-04",
            "url": "https://www.nexon.com/maplestory/general-post/46331",
            "sha256": "f965e9e5385bc7a2f8a42324e71aa25758b6dd5d43a824b97e58e1a0c1603a19"
          }
        ],
        "legacySlug": "1007072",
        "sprite": "assets/metadata-item-1007072.png",
        "spriteSha256": "16ba6fc40b3fb9e6990295bb0ba61bb86b654d82f49eea71c3b9af3f284a0e72"
      },
      {
        "itemId": 1047043,
        "name": "Orange Baseball Jacket",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "founders-2026-10-06"
        ],
        "evidence": [
          {
            "edition": "founders-2026-10-06",
            "url": "https://www.nexon.com/maplestory/general-post/45538",
            "sha256": "6c88e7ce3c274146bb3a5dce350142c445d5e224fd1fe3d11df24097035d5e36"
          }
        ],
        "legacySlug": "orange-baseball-jacket",
        "sprite": "assets/orange-baseball-jacket.png",
        "spriteSha256": "ec79fdc4108ad1d991b89e8c08835eda9b9292b1a1a6bec70bc2ce17d4759b10"
      },
      {
        "itemId": 1007147,
        "name": "Orange Cat Beanie",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "aurora-season-1-2026"
        ],
        "evidence": [
          {
            "edition": "aurora-season-1-2026",
            "url": "https://www.nexon.com/maplestory/general-post/45659",
            "sha256": "2da85bc74092abda3f075bb94aa001596ecc2e4a7c21d8658aef481f084861ee"
          }
        ],
        "legacySlug": "orange-cat-beanie",
        "sprite": "assets/orange-cat-beanie.png",
        "spriteSha256": "36c3d77922f367124e7ec8ee8b2caef4df287b36629930b51cc1153b173f4ec4"
      },
      {
        "itemId": 1027008,
        "name": "Orange Hard-Rimmed Glasses",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-grand-launch-2026"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-grand-launch-2026",
            "url": "https://www.nexon.com/maplestory/news/46362",
            "sha256": "4984ca3d0227803b82c0ab09ac69817265b66fd36a7cae0d4cbcc3765979b2e6"
          }
        ],
        "legacySlug": "orange-hard-rimmed-glasses",
        "sprite": "assets/orange-hard-rimmed-glasses.png",
        "spriteSha256": "dd016e76cc25bd0afd275a67151d97793d331bacb788d17efd34c7b4e51015bf"
      },
      {
        "itemId": 1047090,
        "name": "Orange Hooded Shirt",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "founders-2026-10-06"
        ],
        "evidence": [
          {
            "edition": "founders-2026-10-06",
            "url": "https://www.nexon.com/maplestory/general-post/45538",
            "sha256": "6c88e7ce3c274146bb3a5dce350142c445d5e224fd1fe3d11df24097035d5e36"
          }
        ],
        "legacySlug": "orange-hooded-shirt",
        "sprite": "assets/orange-hooded-shirt.png",
        "spriteSha256": "618237ff435905cda6c58ac0d7e9cd135888317cf4a2f80d7a22ba9c6d8bb6d2"
      },
      {
        "itemId": 1047e3,
        "name": "Orange Hooded Vest",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-grand-launch-2026"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-grand-launch-2026",
            "url": "https://www.nexon.com/maplestory/news/46362",
            "sha256": "4984ca3d0227803b82c0ab09ac69817265b66fd36a7cae0d4cbcc3765979b2e6"
          }
        ],
        "legacySlug": "orange-hooded-vest",
        "sprite": "assets/orange-hooded-vest.png",
        "spriteSha256": "2829105f332613ceb22e60bd9f3af7b90e11b4b58ff71b622b317e29b6da750c"
      },
      {
        "itemId": 1107015,
        "name": "Orange Mushroom Balloon",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "founders-2026-10-06"
        ],
        "evidence": [
          {
            "edition": "founders-2026-10-06",
            "url": "https://www.nexon.com/maplestory/general-post/45538",
            "sha256": "6c88e7ce3c274146bb3a5dce350142c445d5e224fd1fe3d11df24097035d5e36"
          }
        ],
        "legacySlug": "orange-mushroom-balloon",
        "sprite": "assets/orange-mushroom-balloon.png",
        "spriteSha256": "356b32a4258e6d1bac4b936fad39d6c1598e7c0fc98ffc81d36ef00299509b78"
      },
      {
        "itemId": 1702010,
        "name": "Orange Toy Hammer",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "founders-2026-10-06"
        ],
        "evidence": [
          {
            "edition": "founders-2026-10-06",
            "url": "https://www.nexon.com/maplestory/general-post/45538",
            "sha256": "6c88e7ce3c274146bb3a5dce350142c445d5e224fd1fe3d11df24097035d5e36"
          }
        ],
        "legacySlug": "orange-toy-hammer",
        "sprite": "assets/orange-toy-hammer.png",
        "spriteSha256": "a1f9b4306cc60cb69ecc14053211d02ff6a917b61b92254f69ea1678cc10c046"
      },
      {
        "itemId": 1067174,
        "name": "Patched Denim Jeans",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-2026-11-04"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-2026-11-04",
            "url": "https://www.nexon.com/maplestory/general-post/46331",
            "sha256": "f965e9e5385bc7a2f8a42324e71aa25758b6dd5d43a824b97e58e1a0c1603a19"
          }
        ],
        "legacySlug": "1067174",
        "sprite": "assets/metadata-item-1067174.png",
        "spriteSha256": "348a17be1c49c9bf998c2e18b353be38a7eab449f6c9cf67745fbc220c263fe3"
      },
      {
        "itemId": 1007096,
        "name": "Patissier Hat",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "founders-2026-10-06"
        ],
        "evidence": [
          {
            "edition": "founders-2026-10-06",
            "url": "https://www.nexon.com/maplestory/general-post/45538",
            "sha256": "6c88e7ce3c274146bb3a5dce350142c445d5e224fd1fe3d11df24097035d5e36"
          }
        ],
        "legacySlug": "patissier-hat",
        "sprite": "assets/patissier-hat.png",
        "spriteSha256": "a9cda06b2d27513f1bef76252448f60ab652f33050402cf35600ecf09b39bf9b"
      },
      {
        "itemId": 1057022,
        "name": "Patissier Uniform",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "founders-2026-10-06"
        ],
        "evidence": [
          {
            "edition": "founders-2026-10-06",
            "url": "https://www.nexon.com/maplestory/general-post/45538",
            "sha256": "6c88e7ce3c274146bb3a5dce350142c445d5e224fd1fe3d11df24097035d5e36"
          }
        ],
        "legacySlug": "patissier-uniform",
        "sprite": "assets/patissier-uniform.png",
        "spriteSha256": "9aff0cff7184a76968c99ca0b441b9b85e5c50174086dd544c7631862c81f170"
      },
      {
        "itemId": 1047094,
        "name": "Pelvis Hoodie",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-2026-11-04"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-2026-11-04",
            "url": "https://www.nexon.com/maplestory/general-post/46331",
            "sha256": "f965e9e5385bc7a2f8a42324e71aa25758b6dd5d43a824b97e58e1a0c1603a19"
          }
        ],
        "legacySlug": "1047094",
        "sprite": "assets/metadata-item-1047094.png",
        "spriteSha256": "3832cb7b7876ce907f0d9aaa9e3890606270c87645e3e914a1f90daeb6549f73"
      },
      {
        "itemId": 1702019,
        "name": "Pillow",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-2026-11-04"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-2026-11-04",
            "url": "https://www.nexon.com/maplestory/general-post/46331",
            "sha256": "f965e9e5385bc7a2f8a42324e71aa25758b6dd5d43a824b97e58e1a0c1603a19"
          }
        ],
        "legacySlug": "1702019",
        "sprite": "assets/metadata-item-1702019.png",
        "spriteSha256": "e710568a8e17bc23437920b1460306705223c37c3ff1a62aae455054c4fc46b2"
      },
      {
        "itemId": 1047035,
        "name": "Pink Allstar",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "founders-2026-10-06"
        ],
        "evidence": [
          {
            "edition": "founders-2026-10-06",
            "url": "https://www.nexon.com/maplestory/general-post/45538",
            "sha256": "6c88e7ce3c274146bb3a5dce350142c445d5e224fd1fe3d11df24097035d5e36"
          }
        ],
        "legacySlug": "pink-allstar",
        "sprite": "assets/pink-allstar.png",
        "spriteSha256": "f45780c47b43e0f9115742ea2fbac0a2a2d008ec67e53273974f019fc3a0fbed"
      },
      {
        "itemId": 1047099,
        "name": "Pink Bunny Sweater",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "aurora-season-1-2026"
        ],
        "evidence": [
          {
            "edition": "aurora-season-1-2026",
            "url": "https://www.nexon.com/maplestory/general-post/45659",
            "sha256": "2da85bc74092abda3f075bb94aa001596ecc2e4a7c21d8658aef481f084861ee"
          }
        ],
        "legacySlug": "pink-bunny-sweater",
        "sprite": "assets/pink-bunny-sweater.png",
        "spriteSha256": "9757ebf8dbed9bfe9659da11994b931127eb0dda66e25bb08299a2d31da72303"
      },
      {
        "itemId": 1047089,
        "name": "Pink Down Parka",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-2026-11-04"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-2026-11-04",
            "url": "https://www.nexon.com/maplestory/general-post/46331",
            "sha256": "f965e9e5385bc7a2f8a42324e71aa25758b6dd5d43a824b97e58e1a0c1603a19"
          }
        ],
        "legacySlug": "1047089",
        "sprite": "assets/metadata-item-1047089.png",
        "spriteSha256": "3cf36a731a88b82848b546964b2d340b44407dbb1e7d3925815c6086f59558f6"
      },
      {
        "itemId": 1077059,
        "name": "Pink Elephant Slippers",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "aurora-season-1-2026"
        ],
        "evidence": [
          {
            "edition": "aurora-season-1-2026",
            "url": "https://www.nexon.com/maplestory/general-post/45659",
            "sha256": "2da85bc74092abda3f075bb94aa001596ecc2e4a7c21d8658aef481f084861ee"
          }
        ],
        "legacySlug": "pink-elephant-slippers",
        "sprite": "assets/pink-elephant-slippers.png",
        "spriteSha256": "513b2b74c926f1f1f8660280e7bf7fe538c8f32a5c843a025aad93745131a542"
      },
      {
        "itemId": 1077023,
        "name": "Pink Galoshes",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-2026-11-04"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-2026-11-04",
            "url": "https://www.nexon.com/maplestory/general-post/46331",
            "sha256": "f965e9e5385bc7a2f8a42324e71aa25758b6dd5d43a824b97e58e1a0c1603a19"
          }
        ],
        "legacySlug": "1077023",
        "sprite": "assets/metadata-item-1077023.png",
        "spriteSha256": "4eac84d71fa0d5ffd5ed4cf504a5ceff0a1946d25dd67f57aa99117eb8766857"
      },
      {
        "itemId": 1007274,
        "name": "Pink Knitted Gumball",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-2026-11-04"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-2026-11-04",
            "url": "https://www.nexon.com/maplestory/general-post/46331",
            "sha256": "f965e9e5385bc7a2f8a42324e71aa25758b6dd5d43a824b97e58e1a0c1603a19"
          }
        ],
        "legacySlug": "1007274",
        "sprite": "assets/metadata-item-1007274.png",
        "spriteSha256": "d1f4ab6f8bd8ce3ad1c8d03e23ea753773419530675e53d21d0423d42b9d53bf"
      },
      {
        "itemId": 1702017,
        "name": "Pink Rabbit Puppet",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-2026-11-04"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-2026-11-04",
            "url": "https://www.nexon.com/maplestory/general-post/46331",
            "sha256": "f965e9e5385bc7a2f8a42324e71aa25758b6dd5d43a824b97e58e1a0c1603a19"
          }
        ],
        "legacySlug": "1702017",
        "sprite": "assets/metadata-item-1702017.png",
        "spriteSha256": "2b7b11681e442ba03eee17de3a3e72745f96ea54e467b96e501a38ab209c21af"
      },
      {
        "itemId": 1067013,
        "name": "Pink Snowboard Pants",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-2026-11-04"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-2026-11-04",
            "url": "https://www.nexon.com/maplestory/general-post/46331",
            "sha256": "f965e9e5385bc7a2f8a42324e71aa25758b6dd5d43a824b97e58e1a0c1603a19"
          }
        ],
        "legacySlug": "1067013",
        "sprite": "assets/metadata-item-1067013.png",
        "spriteSha256": "a65c7acc3fee0969fb34012989b1679fcd99f337649e0fcb42c8392d9c72eea6"
      },
      {
        "itemId": 1047015,
        "name": "Pink Snowboard Top",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-2026-11-04"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-2026-11-04",
            "url": "https://www.nexon.com/maplestory/general-post/46331",
            "sha256": "f965e9e5385bc7a2f8a42324e71aa25758b6dd5d43a824b97e58e1a0c1603a19"
          }
        ],
        "legacySlug": "1047015",
        "sprite": "assets/metadata-item-1047015.png",
        "spriteSha256": "d6b1d7d49cf8cc10d5130e4cd6821e76581b0c03b982b0af20749fe25708f0a3"
      },
      {
        "itemId": 1702003,
        "name": "Plastic Slingshot",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-grand-launch-2026"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-grand-launch-2026",
            "url": "https://www.nexon.com/maplestory/news/46362",
            "sha256": "4984ca3d0227803b82c0ab09ac69817265b66fd36a7cae0d4cbcc3765979b2e6"
          }
        ],
        "legacySlug": "plastic-slingshot",
        "sprite": "assets/plastic-slingshot.png",
        "spriteSha256": "2d5c64d8a1ceff00aaf3cf13dcaed04ab4580177e5fff6a6b7f33261b58df78f"
      },
      {
        "itemId": 1057019,
        "name": "Premium Trenchcoat",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-grand-launch-2026"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-grand-launch-2026",
            "url": "https://www.nexon.com/maplestory/news/46362",
            "sha256": "4984ca3d0227803b82c0ab09ac69817265b66fd36a7cae0d4cbcc3765979b2e6"
          }
        ],
        "legacySlug": "premium-trenchcoat",
        "sprite": "assets/premium-trenchcoat.png",
        "spriteSha256": "c273dba5b1fd387eeeae7523a1a001385f3916e221dd6bb038905318cc11878e"
      },
      {
        "itemId": 1067020,
        "name": "Prisoner Pants",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "halloween-2026-10-28"
        ],
        "evidence": [
          {
            "edition": "halloween-2026-10-28",
            "url": "https://www.nexon.com/maplestory/general-post/46524",
            "sha256": "16d4689fa00b005ccee9f89e3e591fd9251dd3abe3f865fcc72685e22bf12c30"
          }
        ],
        "legacySlug": "prisoner-pants",
        "sprite": "assets/prisoner-pants.png",
        "spriteSha256": "19720fdf409dd81cc118dab1203574f93c760d0a91582af29a59ea61ecb1c318"
      },
      {
        "itemId": 1047023,
        "name": "Prisoner Top",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "halloween-2026-10-28"
        ],
        "evidence": [
          {
            "edition": "halloween-2026-10-28",
            "url": "https://www.nexon.com/maplestory/general-post/46524",
            "sha256": "16d4689fa00b005ccee9f89e3e591fd9251dd3abe3f865fcc72685e22bf12c30"
          }
        ],
        "legacySlug": "prisoner-top",
        "sprite": "assets/prisoner-top.png",
        "spriteSha256": "983a0103fd13c2a31383c95aab24eba20c8d1621511266b8b6050dfe4e0f97df"
      },
      {
        "itemId": 1007004,
        "name": "Puffy Brown Hat",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-grand-launch-2026"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-grand-launch-2026",
            "url": "https://www.nexon.com/maplestory/news/46362",
            "sha256": "4984ca3d0227803b82c0ab09ac69817265b66fd36a7cae0d4cbcc3765979b2e6"
          }
        ],
        "legacySlug": "puffy-brown-hat",
        "sprite": "assets/puffy-brown-hat.png",
        "spriteSha256": "950a23a5e8076df5fdc7337ec742daf76fcc7b78475ac137a2bb6820492724fe"
      },
      {
        "itemId": 1007465,
        "name": "Pumpkin Hat",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "halloween-2026-10-28"
        ],
        "evidence": [
          {
            "edition": "halloween-2026-10-28",
            "url": "https://www.nexon.com/maplestory/general-post/46524",
            "sha256": "16d4689fa00b005ccee9f89e3e591fd9251dd3abe3f865fcc72685e22bf12c30"
          }
        ],
        "legacySlug": "pumpkin-hat",
        "sprite": "assets/pumpkin-hat.png",
        "spriteSha256": "8b2326c64441ec93118863eea92ad75265ce46dede13ab9f3378763e70423ede"
      },
      {
        "itemId": 1007362,
        "name": "Pumpkin Headgear",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "halloween-2026-10-28"
        ],
        "evidence": [
          {
            "edition": "halloween-2026-10-28",
            "url": "https://www.nexon.com/maplestory/general-post/46524",
            "sha256": "16d4689fa00b005ccee9f89e3e591fd9251dd3abe3f865fcc72685e22bf12c30"
          }
        ],
        "legacySlug": "pumpkin-headgear",
        "sprite": "assets/pumpkin-headgear.png",
        "spriteSha256": "dd4e1449c978394560b693800437b14ebc259b588ef2b4c466932fa395dd212b"
      },
      {
        "itemId": 1057346,
        "name": "Pumpkin Suit",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "halloween-2026-10-28"
        ],
        "evidence": [
          {
            "edition": "halloween-2026-10-28",
            "url": "https://www.nexon.com/maplestory/general-post/46524",
            "sha256": "16d4689fa00b005ccee9f89e3e591fd9251dd3abe3f865fcc72685e22bf12c30"
          }
        ],
        "legacySlug": "pumpkin-suit",
        "sprite": "assets/pumpkin-suit.png",
        "spriteSha256": "d3330337ddb32fa127c0c16cf24b65d6887d885c50ce2d18e1909eb9123ad205"
      },
      {
        "itemId": 1057097,
        "name": "Purple Dorothy Dress",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "founders-2026-10-06"
        ],
        "evidence": [
          {
            "edition": "founders-2026-10-06",
            "url": "https://www.nexon.com/maplestory/general-post/45538",
            "sha256": "6c88e7ce3c274146bb3a5dce350142c445d5e224fd1fe3d11df24097035d5e36"
          }
        ],
        "legacySlug": "purple-dorothy-dress",
        "sprite": "assets/purple-dorothy-dress.png",
        "spriteSha256": "fc062e8b6984e7a13dbb6e3a01b51f5cfe24d93532a740da75e5f7dac52aa4af"
      },
      {
        "itemId": 1007111,
        "name": "Race Ace Cap",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-grand-launch-2026"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-grand-launch-2026",
            "url": "https://www.nexon.com/maplestory/news/46362",
            "sha256": "4984ca3d0227803b82c0ab09ac69817265b66fd36a7cae0d4cbcc3765979b2e6"
          }
        ],
        "legacySlug": "race-ace-cap",
        "sprite": "assets/race-ace-cap.png",
        "spriteSha256": "f76b59138064e27ebd15e779fdad4fd99023647bcce218030ff172ce6d9fa8f7"
      },
      {
        "itemId": 1057048,
        "name": "Race Ace Suit",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-grand-launch-2026"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-grand-launch-2026",
            "url": "https://www.nexon.com/maplestory/news/46362",
            "sha256": "4984ca3d0227803b82c0ab09ac69817265b66fd36a7cae0d4cbcc3765979b2e6"
          }
        ],
        "legacySlug": "race-ace-suit",
        "sprite": "assets/race-ace-suit.png",
        "spriteSha256": "c2fa0cab9f0c67dead8aa6761dbfc3f1a8d74436147c17a8b2b9c10e3853821e"
      },
      {
        "itemId": 1077040,
        "name": "Race Queen Boots",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-grand-launch-2026"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-grand-launch-2026",
            "url": "https://www.nexon.com/maplestory/news/46362",
            "sha256": "4984ca3d0227803b82c0ab09ac69817265b66fd36a7cae0d4cbcc3765979b2e6"
          }
        ],
        "legacySlug": "race-queen-boots",
        "sprite": "assets/race-queen-boots.png",
        "spriteSha256": "5b25bd4568d626866577bf477a09c97c47c2ea651d4da275ba1871816c4e3fbd"
      },
      {
        "itemId": 1057069,
        "name": "Race Queen Uniform",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-grand-launch-2026"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-grand-launch-2026",
            "url": "https://www.nexon.com/maplestory/news/46362",
            "sha256": "4984ca3d0227803b82c0ab09ac69817265b66fd36a7cae0d4cbcc3765979b2e6"
          }
        ],
        "legacySlug": "race-queen-uniform",
        "sprite": "assets/race-queen-uniform.png",
        "spriteSha256": "9b20b5bba017b3fec4973e76bb2ce54c2f90a8096780e55ca88f073593fe5f3c"
      },
      {
        "itemId": 1077099,
        "name": "Ragged Gomushin",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "halloween-2026-10-28"
        ],
        "evidence": [
          {
            "edition": "halloween-2026-10-28",
            "url": "https://www.nexon.com/maplestory/general-post/46524",
            "sha256": "16d4689fa00b005ccee9f89e3e591fd9251dd3abe3f865fcc72685e22bf12c30"
          }
        ],
        "legacySlug": "ragged-gomushin",
        "sprite": "assets/ragged-gomushin.png",
        "spriteSha256": "1be3d3043893fcb3853547207dae0f60c78d2866e803049b6b98d33c87766656"
      },
      {
        "itemId": 1047060,
        "name": "Ragged Top",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-grand-launch-2026"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-grand-launch-2026",
            "url": "https://www.nexon.com/maplestory/news/46362",
            "sha256": "4984ca3d0227803b82c0ab09ac69817265b66fd36a7cae0d4cbcc3765979b2e6"
          }
        ],
        "legacySlug": "ragged-top",
        "sprite": "assets/ragged-top.png",
        "spriteSha256": "8c3d32a4d4e89cfd76472b74396db060e178c9c2fef6d86d62f3b8f2e370aa7e"
      },
      {
        "itemId": 1047082,
        "name": "Rainbow Knit",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "founders-2026-10-06"
        ],
        "evidence": [
          {
            "edition": "founders-2026-10-06",
            "url": "https://www.nexon.com/maplestory/general-post/45538",
            "sha256": "6c88e7ce3c274146bb3a5dce350142c445d5e224fd1fe3d11df24097035d5e36"
          }
        ],
        "legacySlug": "rainbow-knit",
        "sprite": "assets/rainbow-knit.png",
        "spriteSha256": "0fa14c468f863a2a67ed393b7a1352f544ada5132586880c129ae1a80bb2046c"
      },
      {
        "itemId": 1047100,
        "name": "Red Check Rider",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "aurora-season-1-2026"
        ],
        "evidence": [
          {
            "edition": "aurora-season-1-2026",
            "url": "https://www.nexon.com/maplestory/general-post/45659",
            "sha256": "2da85bc74092abda3f075bb94aa001596ecc2e4a7c21d8658aef481f084861ee"
          }
        ],
        "legacySlug": "red-check-rider",
        "sprite": "assets/red-check-rider.png",
        "spriteSha256": "ad57532a8f21f3bd20fcd34df73ab87e0c1b244328159fc38a648f504c32b7b7"
      },
      {
        "itemId": 1047095,
        "name": "Red Hooded Coat",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-2026-11-04"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-2026-11-04",
            "url": "https://www.nexon.com/maplestory/general-post/46331",
            "sha256": "f965e9e5385bc7a2f8a42324e71aa25758b6dd5d43a824b97e58e1a0c1603a19"
          }
        ],
        "legacySlug": "1047095",
        "sprite": "assets/metadata-item-1047095.png",
        "spriteSha256": "f38141d384130ab4d9fa81a94d6abc415f42af9900af14829cb3800ee54544c8"
      },
      {
        "itemId": 1047072,
        "name": "Red Sailor Shirt",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "founders-2026-10-06"
        ],
        "evidence": [
          {
            "edition": "founders-2026-10-06",
            "url": "https://www.nexon.com/maplestory/general-post/45538",
            "sha256": "6c88e7ce3c274146bb3a5dce350142c445d5e224fd1fe3d11df24097035d5e36"
          }
        ],
        "legacySlug": "red-sailor-shirt",
        "sprite": "assets/red-sailor-shirt.png",
        "spriteSha256": "726c5e4a793162f3ac367fb68f843f57e0c9c8b4134c63984bc9efff45d65c44"
      },
      {
        "itemId": 1067056,
        "name": "Red Sailor Skirt",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "founders-2026-10-06"
        ],
        "evidence": [
          {
            "edition": "founders-2026-10-06",
            "url": "https://www.nexon.com/maplestory/general-post/45538",
            "sha256": "6c88e7ce3c274146bb3a5dce350142c445d5e224fd1fe3d11df24097035d5e36"
          }
        ],
        "legacySlug": "red-sailor-skirt",
        "sprite": "assets/red-sailor-skirt.png",
        "spriteSha256": "8c0b452bf3c184b81b4a077a1109ea7a0b8ba41df98d69d5f875375f5937bdb7"
      },
      {
        "itemId": 1057025,
        "name": "Red Skull Overall",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "halloween-2026-10-28"
        ],
        "evidence": [
          {
            "edition": "halloween-2026-10-28",
            "url": "https://www.nexon.com/maplestory/general-post/46524",
            "sha256": "16d4689fa00b005ccee9f89e3e591fd9251dd3abe3f865fcc72685e22bf12c30"
          }
        ],
        "legacySlug": "red-skull-overall",
        "sprite": "assets/red-skull-overall.png",
        "spriteSha256": "5484bdae2950e9b4f463104116a013799f81565253087410d6581d442f2989e7"
      },
      {
        "itemId": 1047076,
        "name": "Red Trainer Jacket",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "founders-2026-10-06"
        ],
        "evidence": [
          {
            "edition": "founders-2026-10-06",
            "url": "https://www.nexon.com/maplestory/general-post/45538",
            "sha256": "6c88e7ce3c274146bb3a5dce350142c445d5e224fd1fe3d11df24097035d5e36"
          }
        ],
        "legacySlug": "red-trainer-jacket",
        "sprite": "assets/red-trainer-jacket.png",
        "spriteSha256": "1cd270d6fd52bc32675738ac269ea10096e0b45a435f7609933f84414b7823d4"
      },
      {
        "itemId": 1067060,
        "name": "Red Trainer Pants",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "founders-2026-10-06"
        ],
        "evidence": [
          {
            "edition": "founders-2026-10-06",
            "url": "https://www.nexon.com/maplestory/general-post/45538",
            "sha256": "6c88e7ce3c274146bb3a5dce350142c445d5e224fd1fe3d11df24097035d5e36"
          }
        ],
        "legacySlug": "red-trainer-pants",
        "sprite": "assets/red-trainer-pants.png",
        "spriteSha256": "c68e11f44c3e10ababa01ffc0def7f104b424a48b76996c847ebefaae5cbf72d"
      },
      {
        "itemId": 1007134,
        "name": "Reggae Hat",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "founders-2026-10-06"
        ],
        "evidence": [
          {
            "edition": "founders-2026-10-06",
            "url": "https://www.nexon.com/maplestory/general-post/45538",
            "sha256": "6c88e7ce3c274146bb3a5dce350142c445d5e224fd1fe3d11df24097035d5e36"
          }
        ],
        "legacySlug": "reggae-hat",
        "sprite": "assets/reggae-hat.png",
        "spriteSha256": "6f8c082826270c033275af794e1fba74a0b58664fe859c2c73a034532d187baf"
      },
      {
        "itemId": 1067009,
        "name": "Ripped Jeans",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "founders-2026-10-06"
        ],
        "evidence": [
          {
            "edition": "founders-2026-10-06",
            "url": "https://www.nexon.com/maplestory/general-post/45538",
            "sha256": "6c88e7ce3c274146bb3a5dce350142c445d5e224fd1fe3d11df24097035d5e36"
          }
        ],
        "legacySlug": "ripped-jeans",
        "sprite": "assets/ripped-jeans.png",
        "spriteSha256": "f83e7b60086232f15bf9d527dbd02037b9424d9436bd6fb7c96471bd1f5682d5"
      },
      {
        "itemId": 1007139,
        "name": "Sailor Hat",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "founders-2026-10-06"
        ],
        "evidence": [
          {
            "edition": "founders-2026-10-06",
            "url": "https://www.nexon.com/maplestory/general-post/45538",
            "sha256": "6c88e7ce3c274146bb3a5dce350142c445d5e224fd1fe3d11df24097035d5e36"
          }
        ],
        "legacySlug": "sailor-hat",
        "sprite": "assets/sailor-hat.png",
        "spriteSha256": "07dcb49c328f043c3803002c6d501a5e10d9b63a75720c28be23567d8accfb00"
      },
      {
        "itemId": 1007102,
        "name": "Scream Mask",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "halloween-2026-10-28"
        ],
        "evidence": [
          {
            "edition": "halloween-2026-10-28",
            "url": "https://www.nexon.com/maplestory/general-post/46524",
            "sha256": "16d4689fa00b005ccee9f89e3e591fd9251dd3abe3f865fcc72685e22bf12c30"
          }
        ],
        "legacySlug": "scream-mask",
        "sprite": "assets/scream-mask.png",
        "spriteSha256": "f4245f9cf394693e61be92b6f735423f170f739c66ed803cb695709a32afb786"
      },
      {
        "itemId": 1037002,
        "name": "Silver Earrings",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-grand-launch-2026"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-grand-launch-2026",
            "url": "https://www.nexon.com/maplestory/news/46362",
            "sha256": "4984ca3d0227803b82c0ab09ac69817265b66fd36a7cae0d4cbcc3765979b2e6"
          }
        ],
        "legacySlug": "silver-earrings",
        "sprite": "assets/silver-earrings.png",
        "spriteSha256": "a716304c81b848850eb3826046360f143d3904061037699ff2bbbcef4b7d4fbe"
      },
      {
        "itemId": 1007374,
        "name": "Skull Beanie",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "halloween-2026-10-28"
        ],
        "evidence": [
          {
            "edition": "halloween-2026-10-28",
            "url": "https://www.nexon.com/maplestory/general-post/46524",
            "sha256": "16d4689fa00b005ccee9f89e3e591fd9251dd3abe3f865fcc72685e22bf12c30"
          }
        ],
        "legacySlug": "skull-beanie",
        "sprite": "assets/skull-beanie.png",
        "spriteSha256": "ba603c0e14ecb86acdcf980ea46ad8d586d0536f9433595eb57d7395f27de24f"
      },
      {
        "itemId": 1087036,
        "name": "Skull Gloves",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "halloween-2026-10-28"
        ],
        "evidence": [
          {
            "edition": "halloween-2026-10-28",
            "url": "https://www.nexon.com/maplestory/general-post/46524",
            "sha256": "16d4689fa00b005ccee9f89e3e591fd9251dd3abe3f865fcc72685e22bf12c30"
          }
        ],
        "legacySlug": "skull-gloves",
        "sprite": "assets/skull-gloves.png",
        "spriteSha256": "a9e6e6e373584d6e64214b9eeb113d01c4e35ca17f992cce1b7ca5cc65806c00"
      },
      {
        "itemId": 1027019,
        "name": "Skull Patch",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "halloween-2026-10-28"
        ],
        "evidence": [
          {
            "edition": "halloween-2026-10-28",
            "url": "https://www.nexon.com/maplestory/general-post/46524",
            "sha256": "16d4689fa00b005ccee9f89e3e591fd9251dd3abe3f865fcc72685e22bf12c30"
          }
        ],
        "legacySlug": "skull-patch",
        "sprite": "assets/skull-patch.png",
        "spriteSha256": "8cf0a67f7e1fe16b7e6a2720fddc4ab8377b242620bcc5d4240e51fb382f1e7a"
      },
      {
        "itemId": 1047058,
        "name": "Skull T-Shirt",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "halloween-2026-10-28"
        ],
        "evidence": [
          {
            "edition": "halloween-2026-10-28",
            "url": "https://www.nexon.com/maplestory/general-post/46524",
            "sha256": "16d4689fa00b005ccee9f89e3e591fd9251dd3abe3f865fcc72685e22bf12c30"
          }
        ],
        "legacySlug": "skull-t-shirt",
        "sprite": "assets/skull-t-shirt.png",
        "spriteSha256": "20bfee8303aedb5049adba4fb54b881bf9258836dc72e060a2a9ae6add6b6922"
      },
      {
        "itemId": 1007146,
        "name": "Sky Blue Cat Beanie",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "aurora-season-1-2026"
        ],
        "evidence": [
          {
            "edition": "aurora-season-1-2026",
            "url": "https://www.nexon.com/maplestory/general-post/45659",
            "sha256": "2da85bc74092abda3f075bb94aa001596ecc2e4a7c21d8658aef481f084861ee"
          }
        ],
        "legacySlug": "sky-blue-cat-beanie",
        "sprite": "assets/sky-blue-cat-beanie.png",
        "spriteSha256": "c23e8f6106cfa2568b8aea12d4c2c632676ed93b107496973881246e9b5d81a8"
      },
      {
        "itemId": 1037003,
        "name": "Slime Earrings",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "founders-2026-10-06"
        ],
        "evidence": [
          {
            "edition": "founders-2026-10-06",
            "url": "https://www.nexon.com/maplestory/general-post/45538",
            "sha256": "6c88e7ce3c274146bb3a5dce350142c445d5e224fd1fe3d11df24097035d5e36"
          }
        ],
        "legacySlug": "slime-earrings",
        "sprite": "assets/slime-earrings.png",
        "spriteSha256": "0bc476a681e4a8577c2ce655a876a24ad3a299ec4ee3a4a18bddaa39ba12ec1b"
      },
      {
        "itemId": 1077029,
        "name": "Slime Slippers",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "founders-2026-10-06"
        ],
        "evidence": [
          {
            "edition": "founders-2026-10-06",
            "url": "https://www.nexon.com/maplestory/general-post/45538",
            "sha256": "6c88e7ce3c274146bb3a5dce350142c445d5e224fd1fe3d11df24097035d5e36"
          }
        ],
        "legacySlug": "slime-slippers",
        "sprite": "assets/slime-slippers.png",
        "spriteSha256": "0e958d5ea56d453614ef62e4ada3eda806dcd3848a9b60869627ee6f9561490b"
      },
      {
        "itemId": 1047025,
        "name": "Slime T-Shirt",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "founders-2026-10-06"
        ],
        "evidence": [
          {
            "edition": "founders-2026-10-06",
            "url": "https://www.nexon.com/maplestory/general-post/45538",
            "sha256": "6c88e7ce3c274146bb3a5dce350142c445d5e224fd1fe3d11df24097035d5e36"
          }
        ],
        "legacySlug": "slime-t-shirt",
        "sprite": "assets/slime-t-shirt.png",
        "spriteSha256": "20fc795d014afa7b67822efd462a2184e5eefe6e3fadc91f9679a56a71b8fba7"
      },
      {
        "itemId": 1702048,
        "name": "Soft Chocolate Fondue Scepter",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "aurora-season-1-2026"
        ],
        "evidence": [
          {
            "edition": "aurora-season-1-2026",
            "url": "https://www.nexon.com/maplestory/general-post/45659",
            "sha256": "2da85bc74092abda3f075bb94aa001596ecc2e4a7c21d8658aef481f084861ee"
          }
        ],
        "legacySlug": "soft-chocolate-fondue-scepter",
        "sprite": "assets/soft-chocolate-fondue-scepter.png",
        "spriteSha256": "c975a7f6ff42e487358ab1d5bd1699a165f19989eefaf426bd7a4ec428e0aa68"
      },
      {
        "itemId": 1057092,
        "name": "Splash Choco Boy",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "aurora-season-1-2026"
        ],
        "evidence": [
          {
            "edition": "aurora-season-1-2026",
            "url": "https://www.nexon.com/maplestory/general-post/45659",
            "sha256": "2da85bc74092abda3f075bb94aa001596ecc2e4a7c21d8658aef481f084861ee"
          }
        ],
        "legacySlug": "splash-choco-boy",
        "sprite": "assets/splash-choco-boy.png",
        "spriteSha256": "c8e9c20c752c8e4caddad3e515b42039c8e433fff0cd4b78fe249b0bd494a889"
      },
      {
        "itemId": 1057098,
        "name": "Splash Choco Girl",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "aurora-season-1-2026"
        ],
        "evidence": [
          {
            "edition": "aurora-season-1-2026",
            "url": "https://www.nexon.com/maplestory/general-post/45659",
            "sha256": "2da85bc74092abda3f075bb94aa001596ecc2e4a7c21d8658aef481f084861ee"
          }
        ],
        "legacySlug": "splash-choco-girl",
        "sprite": "assets/splash-choco-girl.png",
        "spriteSha256": "b15e6d50a48fc5fd06ea5e0e65debb6e4926207673b4bc93eb5af8fc25c984c2"
      },
      {
        "itemId": 1702046,
        "name": "Starlight Heart Scepter",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "aurora-season-1-2026"
        ],
        "evidence": [
          {
            "edition": "aurora-season-1-2026",
            "url": "https://www.nexon.com/maplestory/general-post/45659",
            "sha256": "2da85bc74092abda3f075bb94aa001596ecc2e4a7c21d8658aef481f084861ee"
          }
        ],
        "legacySlug": "starlight-heart-scepter",
        "sprite": "assets/starlight-heart-scepter.png",
        "spriteSha256": "c0b10344ad1e755d7688e5e346dcadce588ccbdc8b4f3e6b471d4fa0dbd48e55"
      },
      {
        "itemId": 1007056,
        "name": "Starred Hunting Hat",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-grand-launch-2026"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-grand-launch-2026",
            "url": "https://www.nexon.com/maplestory/news/46362",
            "sha256": "4984ca3d0227803b82c0ab09ac69817265b66fd36a7cae0d4cbcc3765979b2e6"
          }
        ],
        "legacySlug": "starred-hunting-hat",
        "sprite": "assets/starred-hunting-hat.png",
        "spriteSha256": "5da664f0f1c3be60d0927dcc546d0352e0b884d52667686c077b2668f8efc28c"
      },
      {
        "itemId": 1007043,
        "name": "Starry Sky Blue Beanie",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-2026-11-04"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-2026-11-04",
            "url": "https://www.nexon.com/maplestory/general-post/46331",
            "sha256": "f965e9e5385bc7a2f8a42324e71aa25758b6dd5d43a824b97e58e1a0c1603a19"
          }
        ],
        "legacySlug": "1007043",
        "sprite": "assets/metadata-item-1007043.png",
        "spriteSha256": "fb99a8d9efb606c79c1c1b293268cb7344e734a6bd0087c0675c9128d796028e"
      },
      {
        "itemId": 1057354,
        "name": "Stealth Suit",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "halloween-2026-10-28"
        ],
        "evidence": [
          {
            "edition": "halloween-2026-10-28",
            "url": "https://www.nexon.com/maplestory/general-post/46524",
            "sha256": "16d4689fa00b005ccee9f89e3e591fd9251dd3abe3f865fcc72685e22bf12c30"
          }
        ],
        "legacySlug": "stealth-suit",
        "sprite": "assets/stealth-suit.png",
        "spriteSha256": "a7f6f8fe18a35606768641ed45ca694989d1f132b3065cb1490eb7b7c69f320b"
      },
      {
        "itemId": 1067080,
        "name": "Stocking Shorts",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "aurora-season-1-2026"
        ],
        "evidence": [
          {
            "edition": "aurora-season-1-2026",
            "url": "https://www.nexon.com/maplestory/general-post/45659",
            "sha256": "2da85bc74092abda3f075bb94aa001596ecc2e4a7c21d8658aef481f084861ee"
          }
        ],
        "legacySlug": "stocking-shorts",
        "sprite": "assets/stocking-shorts.png",
        "spriteSha256": "5a841f5118c73628841fc861b40f3ec550970634ca91a426bd1a87fe46af2784"
      },
      {
        "itemId": 1007138,
        "name": "Stylish Pink Cotton Cap",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-grand-launch-2026"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-grand-launch-2026",
            "url": "https://www.nexon.com/maplestory/news/46362",
            "sha256": "4984ca3d0227803b82c0ab09ac69817265b66fd36a7cae0d4cbcc3765979b2e6"
          }
        ],
        "legacySlug": "stylish-pink-cotton-cap",
        "sprite": "assets/stylish-pink-cotton-cap.png",
        "spriteSha256": "4d4807dc154adb4e0f9c2c90b395d4ea28c02b4afea2c6f37ad7805dd0d0e13c"
      },
      {
        "itemId": 1007137,
        "name": "Superstar Headphones",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-2026-11-04"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-2026-11-04",
            "url": "https://www.nexon.com/maplestory/general-post/46331",
            "sha256": "f965e9e5385bc7a2f8a42324e71aa25758b6dd5d43a824b97e58e1a0c1603a19"
          }
        ],
        "legacySlug": "1007137",
        "sprite": "assets/metadata-item-1007137.png",
        "spriteSha256": "aa524eba3b1d869cba84bb1c7b4557057d940a3072dd454795ee7eab3842a95f"
      },
      {
        "itemId": 1047096,
        "name": "Superstar Hoodie",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-grand-launch-2026"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-grand-launch-2026",
            "url": "https://www.nexon.com/maplestory/news/46362",
            "sha256": "4984ca3d0227803b82c0ab09ac69817265b66fd36a7cae0d4cbcc3765979b2e6"
          }
        ],
        "legacySlug": "superstar-hoodie",
        "sprite": "assets/superstar-hoodie.png",
        "spriteSha256": "9a652796297b844c3f7661fbccfee473f22c07466fb07d0d06476bca1b758e64"
      },
      {
        "itemId": 1702013,
        "name": "Teddy Bear",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-2026-11-04"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-2026-11-04",
            "url": "https://www.nexon.com/maplestory/general-post/46331",
            "sha256": "f965e9e5385bc7a2f8a42324e71aa25758b6dd5d43a824b97e58e1a0c1603a19"
          }
        ],
        "legacySlug": "1702013",
        "sprite": "assets/metadata-item-1702013.png",
        "spriteSha256": "b3e51505b29b0ed2ade161e8045806afffe1675952598b8b92c0557a1565b4ad"
      },
      {
        "itemId": 1112217,
        "name": "Teddy Bear Chat Ring",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-2026-11-04"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-2026-11-04",
            "url": "https://www.nexon.com/maplestory/general-post/46331",
            "sha256": "f965e9e5385bc7a2f8a42324e71aa25758b6dd5d43a824b97e58e1a0c1603a19"
          }
        ],
        "legacySlug": "1112217",
        "sprite": "assets/metadata-item-1112217.png",
        "spriteSha256": "0a69ac6d5a59ac92b2d63afccb7861618da11f401e5380fb51d175855e93b751"
      },
      {
        "itemId": 1057099,
        "name": "Teddy Bear Costume",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-2026-11-04"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-2026-11-04",
            "url": "https://www.nexon.com/maplestory/general-post/46331",
            "sha256": "f965e9e5385bc7a2f8a42324e71aa25758b6dd5d43a824b97e58e1a0c1603a19"
          }
        ],
        "legacySlug": "1057099",
        "sprite": "assets/metadata-item-1057099.png",
        "spriteSha256": "aec60b38e9540bcec814f704628f5ab57d7a5022eb9b9d376c62a6d0b7bf4b4d"
      },
      {
        "itemId": 1087019,
        "name": "Teddy Bear Gloves",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-2026-11-04"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-2026-11-04",
            "url": "https://www.nexon.com/maplestory/general-post/46331",
            "sha256": "f965e9e5385bc7a2f8a42324e71aa25758b6dd5d43a824b97e58e1a0c1603a19"
          }
        ],
        "legacySlug": "1087019",
        "sprite": "assets/metadata-item-1087019.png",
        "spriteSha256": "362dc90f0cb511c815c5a4a1ec106c6e6dcf80e81524e0d20222986ba4485a8b"
      },
      {
        "itemId": 1007133,
        "name": "Teddy Bear Headgear",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-2026-11-04"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-2026-11-04",
            "url": "https://www.nexon.com/maplestory/general-post/46331",
            "sha256": "f965e9e5385bc7a2f8a42324e71aa25758b6dd5d43a824b97e58e1a0c1603a19"
          }
        ],
        "legacySlug": "1007133",
        "sprite": "assets/metadata-item-1007133.png",
        "spriteSha256": "0e53333b9db3a330e772517d72b2bbef1635783dec9b69270a5f74642e12534c"
      },
      {
        "itemId": 1077053,
        "name": "Teddy Bear Shoes",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-2026-11-04"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-2026-11-04",
            "url": "https://www.nexon.com/maplestory/general-post/46331",
            "sha256": "f965e9e5385bc7a2f8a42324e71aa25758b6dd5d43a824b97e58e1a0c1603a19"
          }
        ],
        "legacySlug": "1077053",
        "sprite": "assets/metadata-item-1077053.png",
        "spriteSha256": "3aa9971d2dbc723c1a7b0d13e017fc2177cd33f9e54085a27dc7979cee405137"
      },
      {
        "itemId": 1007033,
        "name": "Tiger Mask",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "halloween-2026-10-28"
        ],
        "evidence": [
          {
            "edition": "halloween-2026-10-28",
            "url": "https://www.nexon.com/maplestory/general-post/46524",
            "sha256": "16d4689fa00b005ccee9f89e3e591fd9251dd3abe3f865fcc72685e22bf12c30"
          }
        ],
        "legacySlug": "tiger-mask",
        "sprite": "assets/tiger-mask.png",
        "spriteSha256": "0e7d57552e12c0f686ef0c3183844c6bf4bcc6ee943797be36eed36eec16c71b"
      },
      {
        "itemId": 1057020,
        "name": "Toga",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "founders-2026-10-06"
        ],
        "evidence": [
          {
            "edition": "founders-2026-10-06",
            "url": "https://www.nexon.com/maplestory/general-post/45538",
            "sha256": "6c88e7ce3c274146bb3a5dce350142c445d5e224fd1fe3d11df24097035d5e36"
          }
        ],
        "legacySlug": "toga",
        "sprite": "assets/toga.png",
        "spriteSha256": "1923840e48f8be24a0b20f988fad72befb41a6104cc6a77687b02705ef6b98b3"
      },
      {
        "itemId": 1047093,
        "name": "Tourist T",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "founders-2026-10-06"
        ],
        "evidence": [
          {
            "edition": "founders-2026-10-06",
            "url": "https://www.nexon.com/maplestory/general-post/45538",
            "sha256": "6c88e7ce3c274146bb3a5dce350142c445d5e224fd1fe3d11df24097035d5e36"
          }
        ],
        "legacySlug": "tourist-t",
        "sprite": "assets/tourist-t.png",
        "spriteSha256": "22123c932a3927818b4b9822ad772e79fa9402e6099bddadaa08234a2237e784"
      },
      {
        "itemId": 1702014,
        "name": "Toy Rifle",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-grand-launch-2026"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-grand-launch-2026",
            "url": "https://www.nexon.com/maplestory/news/46362",
            "sha256": "4984ca3d0227803b82c0ab09ac69817265b66fd36a7cae0d4cbcc3765979b2e6"
          }
        ],
        "legacySlug": "toy-rifle",
        "sprite": "assets/toy-rifle.png",
        "spriteSha256": "c1f861e90ab5f8144fe315a4a98d0366061bc3620cc51a6bb191282654029605"
      },
      {
        "itemId": 1077055,
        "name": "Velcro High Tops",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-grand-launch-2026"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-grand-launch-2026",
            "url": "https://www.nexon.com/maplestory/news/46362",
            "sha256": "4984ca3d0227803b82c0ab09ac69817265b66fd36a7cae0d4cbcc3765979b2e6"
          }
        ],
        "legacySlug": "velcro-high-tops",
        "sprite": "assets/velcro-high-tops.png",
        "spriteSha256": "0cdf7749f026adf32bc6f42b758f9a130c9744187e811b238850300ac14ee719"
      },
      {
        "itemId": 1067082,
        "name": "Violet Dot Jeans",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "aurora-season-1-2026"
        ],
        "evidence": [
          {
            "edition": "aurora-season-1-2026",
            "url": "https://www.nexon.com/maplestory/general-post/45659",
            "sha256": "2da85bc74092abda3f075bb94aa001596ecc2e4a7c21d8658aef481f084861ee"
          }
        ],
        "legacySlug": "violet-dot-jeans",
        "sprite": "assets/violet-dot-jeans.png",
        "spriteSha256": "357efa21e4f86e50e70cb2772368239937298a0d7711a307605ec77490a18af1"
      },
      {
        "itemId": 1067049,
        "name": "Washed Jeans",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-grand-launch-2026"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-grand-launch-2026",
            "url": "https://www.nexon.com/maplestory/news/46362",
            "sha256": "4984ca3d0227803b82c0ab09ac69817265b66fd36a7cae0d4cbcc3765979b2e6"
          }
        ],
        "legacySlug": "washed-jeans",
        "sprite": "assets/washed-jeans.png",
        "spriteSha256": "4fdf9155914f4de39664ac44e72aae795b1f1295ffbc4d8b2f662d7e753303aa"
      },
      {
        "itemId": 1087018,
        "name": "White Bandage",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "halloween-2026-10-28"
        ],
        "evidence": [
          {
            "edition": "halloween-2026-10-28",
            "url": "https://www.nexon.com/maplestory/general-post/46524",
            "sha256": "16d4689fa00b005ccee9f89e3e591fd9251dd3abe3f865fcc72685e22bf12c30"
          }
        ],
        "legacySlug": "white-bandage",
        "sprite": "assets/white-bandage.png",
        "spriteSha256": "90ccba41adf4dabfe3bbb64764b978e5c4a2790cb70bbb417e9860858d892e5f"
      },
      {
        "itemId": 1007073,
        "name": "White Beanie",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-grand-launch-2026"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-grand-launch-2026",
            "url": "https://www.nexon.com/maplestory/news/46362",
            "sha256": "4984ca3d0227803b82c0ab09ac69817265b66fd36a7cae0d4cbcc3765979b2e6"
          }
        ],
        "legacySlug": "white-beanie",
        "sprite": "assets/white-beanie.png",
        "spriteSha256": "6dc35bf26add939cff3f21d5d252b4708ff67ecdb10469bddfe9ff29bf09bd52"
      },
      {
        "itemId": 1007144,
        "name": "White Choco Bunny",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "aurora-season-1-2026"
        ],
        "evidence": [
          {
            "edition": "aurora-season-1-2026",
            "url": "https://www.nexon.com/maplestory/general-post/45659",
            "sha256": "2da85bc74092abda3f075bb94aa001596ecc2e4a7c21d8658aef481f084861ee"
          }
        ],
        "legacySlug": "white-choco-bunny",
        "sprite": "assets/white-choco-bunny.png",
        "spriteSha256": "59f68b5d6d1f39942beeb4e3ea7b93216984476724b08b172b05cba410c1c4ff"
      },
      {
        "itemId": 1077087,
        "name": "White High Top",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-2026-11-04"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-2026-11-04",
            "url": "https://www.nexon.com/maplestory/general-post/46331",
            "sha256": "f965e9e5385bc7a2f8a42324e71aa25758b6dd5d43a824b97e58e1a0c1603a19"
          }
        ],
        "legacySlug": "1077087",
        "sprite": "assets/metadata-item-1077087.png",
        "spriteSha256": "7f32b422326f48e9034a38d2d827e48edae0ff0698c8ec6e493ac2ab824d0c65"
      },
      {
        "itemId": 1047037,
        "name": "White Hooded Vest",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "founders-2026-10-06"
        ],
        "evidence": [
          {
            "edition": "founders-2026-10-06",
            "url": "https://www.nexon.com/maplestory/general-post/45538",
            "sha256": "6c88e7ce3c274146bb3a5dce350142c445d5e224fd1fe3d11df24097035d5e36"
          }
        ],
        "legacySlug": "white-hooded-vest",
        "sprite": "assets/white-hooded-vest.png",
        "spriteSha256": "70cc234bdd06e4437bcfbf5d488572551c0410a750208437dec5acb8bc3ca1b8"
      },
      {
        "itemId": 1702026,
        "name": "White Rabbit's Foot",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-2026-11-04"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-2026-11-04",
            "url": "https://www.nexon.com/maplestory/general-post/46331",
            "sha256": "f965e9e5385bc7a2f8a42324e71aa25758b6dd5d43a824b97e58e1a0c1603a19"
          }
        ],
        "legacySlug": "1702026",
        "sprite": "assets/metadata-item-1702026.png",
        "spriteSha256": "5fa5617910fa06d2205f8306a584cd12ebc1a3cc175538bd73002e7ec3fa5968"
      },
      {
        "itemId": 1057093,
        "name": "White Ribboned Sailor Dress",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "founders-2026-10-06"
        ],
        "evidence": [
          {
            "edition": "founders-2026-10-06",
            "url": "https://www.nexon.com/maplestory/general-post/45538",
            "sha256": "6c88e7ce3c274146bb3a5dce350142c445d5e224fd1fe3d11df24097035d5e36"
          }
        ],
        "legacySlug": "white-ribboned-sailor-dress",
        "sprite": "assets/white-ribboned-sailor-dress.png",
        "spriteSha256": "329396916e7c8ae6d37b5935de08451d9f84761fa0a5b65c4c902433def14ad5"
      },
      {
        "itemId": 1067041,
        "name": "Wild Pants",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-grand-launch-2026"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-grand-launch-2026",
            "url": "https://www.nexon.com/maplestory/news/46362",
            "sha256": "4984ca3d0227803b82c0ab09ac69817265b66fd36a7cae0d4cbcc3765979b2e6"
          }
        ],
        "legacySlug": "wild-pants",
        "sprite": "assets/wild-pants.png",
        "spriteSha256": "2232860bf6a45a7287d08c9440a4bc2ecf4d2bbd939e0f7b87c040d31dbcaf55"
      },
      {
        "itemId": 1057053,
        "name": "Witch Clothes",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "halloween-2026-10-28"
        ],
        "evidence": [
          {
            "edition": "halloween-2026-10-28",
            "url": "https://www.nexon.com/maplestory/general-post/46524",
            "sha256": "16d4689fa00b005ccee9f89e3e591fd9251dd3abe3f865fcc72685e22bf12c30"
          }
        ],
        "legacySlug": "witch-clothes",
        "sprite": "assets/witch-clothes.png",
        "spriteSha256": "26b602e33025d1dedb30ff473ea5cd6fa6978db55d5ad003f768c943a60df987"
      },
      {
        "itemId": 1007115,
        "name": "Witch Hat",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "halloween-2026-10-28"
        ],
        "evidence": [
          {
            "edition": "halloween-2026-10-28",
            "url": "https://www.nexon.com/maplestory/general-post/46524",
            "sha256": "16d4689fa00b005ccee9f89e3e591fd9251dd3abe3f865fcc72685e22bf12c30"
          }
        ],
        "legacySlug": "witch-hat",
        "sprite": "assets/witch-hat.png",
        "spriteSha256": "a337da16b249ce5d16b7111936c97d6804492bcf62a5b185eff27873c6ff69a8"
      },
      {
        "itemId": 1702036,
        "name": "Witch's Broomstick",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "halloween-2026-10-28"
        ],
        "evidence": [
          {
            "edition": "halloween-2026-10-28",
            "url": "https://www.nexon.com/maplestory/general-post/46524",
            "sha256": "16d4689fa00b005ccee9f89e3e591fd9251dd3abe3f865fcc72685e22bf12c30"
          }
        ],
        "legacySlug": "witchs-broomstick",
        "sprite": "assets/witchs-broomstick.png",
        "spriteSha256": "10cfe84de7c0fb4ac6a86aa522eb6d0110f2b10cb3a5441262d22a9360c15ffa"
      },
      {
        "itemId": 1007074,
        "name": "Woodsman Hat",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "mystery-fashion-2026-11-04"
        ],
        "evidence": [
          {
            "edition": "mystery-fashion-2026-11-04",
            "url": "https://www.nexon.com/maplestory/general-post/46331",
            "sha256": "f965e9e5385bc7a2f8a42324e71aa25758b6dd5d43a824b97e58e1a0c1603a19"
          }
        ],
        "legacySlug": "1007074",
        "sprite": "assets/metadata-item-1007074.png",
        "spriteSha256": "f31c8296f07d0e4507894ae386d9b952c97c42e92245cb6960eaedd6b5bee31d"
      },
      {
        "itemId": 1077057,
        "name": "Yellow Rainbow Sneaks",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "founders-2026-10-06"
        ],
        "evidence": [
          {
            "edition": "founders-2026-10-06",
            "url": "https://www.nexon.com/maplestory/general-post/45538",
            "sha256": "6c88e7ce3c274146bb3a5dce350142c445d5e224fd1fe3d11df24097035d5e36"
          }
        ],
        "legacySlug": "yellow-rainbow-sneaks",
        "sprite": "assets/yellow-rainbow-sneaks.png",
        "spriteSha256": "22e701bede01424b18c02b1989b1fae822744d665c68ad32d6d9791e81190486"
      },
      {
        "itemId": 1702012,
        "name": "Yellow Spatula",
        "stamps": 1,
        "condition": "unequipped_Mystery_Fashion_Crate_reward",
        "editions": [
          "founders-2026-10-06"
        ],
        "evidence": [
          {
            "edition": "founders-2026-10-06",
            "url": "https://www.nexon.com/maplestory/general-post/45538",
            "sha256": "6c88e7ce3c274146bb3a5dce350142c445d5e224fd1fe3d11df24097035d5e36"
          }
        ],
        "legacySlug": "yellow-spatula",
        "sprite": "assets/yellow-spatula.png",
        "spriteSha256": "e193d288cbca82017ac9ed526afd7086bdd1e798af0899bc4595dff88369e08a"
      }
    ],
    "held": [
      {
        "name": "Cat Hat",
        "reason": "not_unique_exact_MCW_name",
        "candidateIds": [
          1007003,
          1007430
        ]
      },
      {
        "name": "Sailor Outfit",
        "reason": "not_unique_exact_MCW_name",
        "candidateIds": [
          1057091,
          1057206
        ]
      },
      {
        "name": "Torn-up Jeans",
        "reason": "not_unique_exact_MCW_name",
        "candidateIds": []
      },
      {
        "name": "White Jeans",
        "reason": "not_unique_exact_MCW_name",
        "candidateIds": [
          1067027,
          1067187
        ]
      },
      {
        "name": "White Label Ring",
        "reason": "not_unique_exact_MCW_name",
        "candidateIds": [
          1112100,
          1112222
        ]
      }
    ],
    "verifiedTwoStampItemIds": [],
    "exits": [
      {
        "itemId": 2430045,
        "name": "Mystery Palette Exchange Coupon",
        "stamps": 5
      },
      {
        "itemId": 2430046,
        "name": "Palette Cleanser Exchange Coupon",
        "stamps": 10
      },
      {
        "itemId": 5222100,
        "name": "Aurora Mystery Fashion Crate",
        "stamps": 20
      }
    ]
  };

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
    function money2(v, nullable = true) {
      if (v === null && nullable) return;
      if (typeof v !== "string" || v.length > 160 || !/^\d+(?:\.\d+)?$/.test(v)) fail("dto_price");
    }
    function s(v) {
      if (v === null) return;
      shape(v, ["reportedSalesCount", "reportedUnitCount", "reportedDaySalesCount", "reportedDayUnitCount", "averageUnitPrice", "medianUnitPrice", "basis", "dayCounterBoundsKnown"]);
      for (const k of ["reportedSalesCount", "reportedUnitCount", "reportedDaySalesCount", "reportedDayUnitCount"]) integer(v[k]);
      money2(v.averageUnitPrice);
      money2(v.medianUnitPrice);
      if (v.basis !== "source_labelled_sold_not_independently_confirmed_transactions" || v.dayCounterBoundsKnown !== false) fail("dto_sold");
    }
    function a(v) {
      if (v === null) return;
      shape(v, ["reportedListingCount", "reportedSellerCount", "medianUnitPrice", "p25UnitPrice", "p75UnitPrice", "basis", "currentAvailabilityVerified"]);
      integer(v.reportedListingCount);
      integer(v.reportedSellerCount);
      for (const k of ["medianUnitPrice", "p25UnitPrice", "p75UnitPrice"]) money2(v[k]);
      if (v.basis !== "source_seen_asking_prices" || v.currentAvailabilityVerified !== false) fail("dto_asking");
    }
    function r(v, scopes, isItem = false) {
      if (v === null) return;
      shape(v, ["unitPrice", "basis", "reportedSamples", "scope", "aggregation", "exactVariantValue", "isNearFallback"]);
      money2(v.unitPrice, false);
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

  // ops/stamp-reference-definition.mjs
  var STAMP_DEFINITION_SHA256 = "7afa43a94ec714c16bf3fb5010c7646aa318181204cec2656fcad3197ddc862f";
  var STAMP_DEFINITION_TEXT = `{"schemaVersion":1,"kind":"fixed_conditional_stamp_reference_definition","registryArtifactSha256":"9544096e01cef5fc19300dc554875ffd6e703acb97736e1a018f914f0a4ef421","expiresAt":"2027-01-13T07:59:00.000Z","metadataSha256":["e66a5fb71974f55bad03130d2c3c8926f57ac8a5db949d58a369c4835ca6537f","60166ef0713a547a73b81473fbfa43d5d63f5182c978f5194b16411cd5e88a92"],"rows":[[1007002,"Green Camping Hat",1],[1007004,"Puffy Brown Hat",1],[1007013,"Blue Chinese Undead Hat",1],[1007033,"Tiger Mask",1],[1007043,"Starry Sky Blue Beanie",1],[1007046,"Blue Cap",1],[1007053,"Bunny Hat",1],[1007056,"Starred Hunting Hat",1],[1007058,"Blue Pajama Hat",1],[1007061,"Blue Bucket Hat",1],[1007072,"Olive Beanie",1],[1007073,"White Beanie",1],[1007074,"Woodsman Hat",1],[1007077,"Angel Halo",1],[1007090,"Beige Checkered Hat",1],[1007091,"Meshcap",1],[1007096,"Patissier Hat",1],[1007102,"Scream Mask",1],[1007103,"Old School Uniform Hat",1],[1007104,"Hat of Death",1],[1007105,"Detective Hat",1],[1007111,"Race Ace Cap",1],[1007115,"Witch Hat",1],[1007116,"Beret",1],[1007132,"Grey Visor Beanie",1],[1007133,"Teddy Bear Headgear",1],[1007134,"Reggae Hat",1],[1007135,"Mummy Hat",1],[1007136,"Bunny Earmuffs",1],[1007137,"Superstar Headphones",1],[1007138,"Stylish Pink Cotton Cap",1],[1007139,"Sailor Hat",1],[1007140,"Cute Mouse Ears",1],[1007141,"Kitty Camping Hat",1],[1007142,"Bunny Ears",1],[1007143,"Heart Sunglasses",1],[1007144,"White Choco Bunny",1],[1007145,"Black Cat Beanie",1],[1007146,"Sky Blue Cat Beanie",1],[1007147,"Orange Cat Beanie",1],[1007274,"Pink Knitted Gumball",1],[1007287,"Devilish Horns",1],[1007362,"Pumpkin Headgear",1],[1007367,"Demon Goblin",1],[1007368,"Maple-Stein Head",1],[1007374,"Skull Beanie",1],[1007465,"Pumpkin Hat",1],[1007489,"Iljimae Mask",1],[1007525,"Devil Horns",1],[1007706,"Dark Devil Hat",1],[1017000,"Battle Scar",1],[1017013,"Gentleman's Mustache",1],[1017015,"Bandage Strip",1],[1017021,"Mummy Mask",1],[1017022,"Dollish Pink",1],[1017023,"Heartbreaker Lips",1],[1017024,"Choco Candy Cookie",1],[1017074,"Maple-Stein Face",1],[1017088,"Ice Cold Red",1],[1027004,"Black Sunglasses",1],[1027008,"Orange Hard-Rimmed Glasses",1],[1027019,"Skull Patch",1],[1027022,"Medical Eye Patch",1],[1027028,"Green Sports Goggles",1],[1027029,"Frameless Glasses",1],[1027037,"Blank Eye Patch",1],[1037002,"Silver Earrings",1],[1037003,"Slime Earrings",1],[1047000,"Orange Hooded Vest",1],[1047005,"Green Camping Shirt",1],[1047015,"Pink Snowboard Top",1],[1047021,"Blue Polka-Dot Pajama Top",1],[1047023,"Prisoner Top",1],[1047025,"Slime T-Shirt",1],[1047027,"Beetle Long Sleeve",1],[1047035,"Pink Allstar",1],[1047037,"White Hooded Vest",1],[1047042,"Black Blazer",1],[1047043,"Orange Baseball Jacket",1],[1047044,"Old School Blazer",1],[1047058,"Skull T-Shirt",1],[1047060,"Ragged Top",1],[1047061,"Crusader T-Shirt",1],[1047069,"Blue Frill Blouse",1],[1047072,"Red Sailor Shirt",1],[1047075,"Old School Uniform Top",1],[1047076,"Red Trainer Jacket",1],[1047082,"Rainbow Knit",1],[1047089,"Pink Down Parka",1],[1047090,"Orange Hooded Shirt",1],[1047092,"Black Cardigan Set",1],[1047093,"Tourist T",1],[1047094,"Pelvis Hoodie",1],[1047095,"Red Hooded Coat",1],[1047096,"Superstar Hoodie",1],[1047097,"Black \\"Hit Me\\" Shirt",1],[1047098,"Loose Fit Sweater",1],[1047099,"Pink Bunny Sweater",1],[1047100,"Red Check Rider",1],[1047135,"Bomber Jacket",1],[1057003,"Blue Chinese Undead Costume",1],[1057012,"Green Overall",1],[1057019,"Premium Trenchcoat",1],[1057020,"Toga",1],[1057022,"Patissier Uniform",1],[1057024,"Grey Skull Overall",1],[1057025,"Red Skull Overall",1],[1057036,"Dark Suit",1],[1057037,"Ghost Costume",1],[1057040,"Black Coat of Death",1],[1057048,"Race Ace Suit",1],[1057049,"Cat Suit",1],[1057052,"Dark Enamel Suit",1],[1057053,"Witch Clothes",1],[1057057,"Bunny Costume",1],[1057058,"Ghost Suit",1],[1057069,"Race Queen Uniform",1],[1057088,"Brown Casual Look",1],[1057089,"Blue Kitty Hood",1],[1057090,"Buddy Overall Jeans (Blue)",1],[1057092,"Splash Choco Boy",1],[1057093,"White Ribboned Sailor Dress",1],[1057094,"Black Fur Wrap Coat",1],[1057095,"Kitty Hoodie",1],[1057096,"Buddy Overall Jeans (Red)",1],[1057097,"Purple Dorothy Dress",1],[1057098,"Splash Choco Girl",1],[1057099,"Teddy Bear Costume",1],[1057100,"Mummy Suit",1],[1057128,"Blue Snow Flower Wear",1],[1057346,"Pumpkin Suit",1],[1057354,"Stealth Suit",1],[1067001,"Lined Hip-Hop Pants",1],[1067003,"Green Camping Shorts",1],[1067009,"Ripped Jeans",1],[1067012,"Faded Bell-Bottom Jeans",1],[1067013,"Pink Snowboard Pants",1],[1067015,"Jean Shorts",1],[1067018,"Blue Polka-Dot Pajama Pants",1],[1067020,"Prisoner Pants",1],[1067030,"Black Suit Pants",1],[1067041,"Wild Pants",1],[1067045,"Old School Uniform Pants",1],[1067049,"Washed Jeans",1],[1067052,"Blue Bell Dress",1],[1067056,"Red Sailor Skirt",1],[1067060,"Red Trainer Pants",1],[1067065,"Old School Uniform Skirt",1],[1067076,"Butterfly Skirt",1],[1067078,"Amorian Pink Skirt",1],[1067079,"Bunny-Padded Snowboard Pants",1],[1067080,"Stocking Shorts",1],[1067081,"Hearts Tights",1],[1067082,"Violet Dot Jeans",1],[1067092,"Denim Wrinkled Skirt",1],[1067166,"Bone Buckled Slacks",1],[1067174,"Patched Denim Jeans",1],[1077000,"Black Dress Shoes",1],[1077004,"Camping Boots",1],[1077014,"Black Leather Boots",1],[1077017,"Gold Kitty Slippers",1],[1077018,"Blue Marble Slippers",1],[1077020,"Bunny Slippers",1],[1077023,"Pink Galoshes",1],[1077029,"Slime Slippers",1],[1077030,"Big Rabbit Feet",1],[1077034,"Black Shoes of Death",1],[1077040,"Race Queen Boots",1],[1077053,"Teddy Bear Shoes",1],[1077054,"Black Classic Sneakers",1],[1077055,"Velcro High Tops",1],[1077056,"Black Enamel Shoes",1],[1077057,"Yellow Rainbow Sneaks",1],[1077058,"Mix-n-Match Sneakers",1],[1077059,"Pink Elephant Slippers",1],[1077060,"Cacao Bear Shoes",1],[1077087,"White High Top",1],[1077099,"Ragged Gomushin",1],[1077100,"Brown Dress Shoes",1],[1087005,"Brown Bandage",1],[1087006,"Black Bandage",1],[1087018,"White Bandage",1],[1087019,"Teddy Bear Gloves",1],[1087020,"Blue Watch",1],[1087021,"Chocolate Ribbon",1],[1087036,"Skull Gloves",1],[1107006,"Gargoyle Wings",1],[1107007,"Michael Wings",1],[1107011,"Baby Angel Wings",1],[1107012,"Devil Wings",1],[1107013,"Cuddle Bear",1],[1107014,"Heart Balloon",1],[1107015,"Orange Mushroom Balloon",1],[1107016,"My Buddy Rex",1],[1107052,"Coffin of Gloom",1],[1107065,"Count Dracula Cape",1],[1112113,"Chocolate Label Ring",1],[1112215,"Kitty Chat Ring",1],[1112217,"Teddy Bear Chat Ring",1],[1112223,"Ink-and-Wash Painting Name Tag Ring",1],[1112227,"Ink-and-Wash Thought Bubble Ring",1],[1112231,"Chocolate Chat Ring",1],[1702003,"Plastic Slingshot",1],[1702004,"Angel Wand",1],[1702010,"Orange Toy Hammer",1],[1702012,"Yellow Spatula",1],[1702013,"Teddy Bear",1],[1702014,"Toy Rifle",1],[1702017,"Pink Rabbit Puppet",1],[1702019,"Pillow",1],[1702022,"Cherub's Bow",1],[1702026,"White Rabbit's Foot",1],[1702036,"Witch's Broomstick",1],[1702046,"Starlight Heart Scepter",1],[1702047,"Detective Glass",1],[1702048,"Soft Chocolate Fondue Scepter",1],[1702096,"Glowing Pumpkin Basket",1],[1702325,"Evil Skull",1],[1702326,"Cat Soul",1]]}`;

  // ops/stamp-reference-contract.mjs
  var STAMP_BODY_LIMIT = 131072;
  var enc2 = new TextEncoder();
  var HASH3 = /^[a-f0-9]{64}$/;
  var DEFINITIONS = /* @__PURE__ */ new WeakSet();
  var frozen = (v) => {
    if (v && typeof v === "object") {
      for (const x of Object.values(v)) frozen(x);
      Object.freeze(v);
    }
    return v;
  };
  var StampContractError = class extends Error {
    constructor(code = "stamp_reference_contract") {
      super(code);
      this.name = "StampContractError";
    }
  };
  var need = (v, c) => {
    if (!v) throw new StampContractError(c);
  };
  var integer2 = (v, min = 0, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(v) && v >= min && v <= max;
  var shape2 = (v, keys) => need(v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).sort().join("|") === keys.split(" ").sort().join("|"));
  var stampIso = (v) => typeof v === "string" && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
  async function stampSha256(raw) {
    return [...new Uint8Array(await crypto.subtle.digest("SHA-256", raw))].map((v) => v.toString(16).padStart(2, "0")).join("");
  }
  var definition = null;
  var definitionFlight = null;
  async function loadStampReferenceDefinition() {
    if (definition) return definition;
    if (definitionFlight) return definitionFlight;
    definitionFlight = (async () => {
      const text = STAMP_DEFINITION_TEXT, v = JSON.parse(text);
      need(await stampSha256(enc2.encode(text)) === STAMP_DEFINITION_SHA256, "stamp_definition_hash");
      shape2(v, "schemaVersion kind registryArtifactSha256 expiresAt metadataSha256 rows");
      need(v.schemaVersion === 1 && v.kind === "fixed_conditional_stamp_reference_definition" && HASH3.test(v.registryArtifactSha256) && stampIso(v.expiresAt) && v.rows.length === 219 && v.metadataSha256.length === 2 && v.metadataSha256.every((h) => HASH3.test(h)), "stamp_definition");
      let previous = 0;
      for (const r of v.rows) {
        need(Array.isArray(r) && r.length === 3 && integer2(r[0], previous + 1, 999999999) && typeof r[1] === "string" && r[1].length > 0 && r[1].length <= 300 && r[2] === 1, "stamp_definition_row");
        previous = r[0];
      }
      const out = frozen({ ...v, definitionHash: STAMP_DEFINITION_SHA256 });
      DEFINITIONS.add(out);
      definition = out;
      return out;
    })();
    try {
      return await definitionFlight;
    } finally {
      definitionFlight = null;
    }
  }
  var price = (v) => {
    need(v === null || typeof v === "string" && v.length <= 160 && /^\d+(?:\.\d+)?$/.test(v), "stamp_price");
    return v !== null && /[1-9]/.test(v);
  };
  function validateStampReferenceCapture(value, { definition: definition2, checkedAt = null } = {}) {
    need(DEFINITIONS.has(definition2), "stamp_definition_capability");
    const v = structuredClone(value);
    shape2(v, "schemaVersion kind definitionHash registryArtifactSha256 source sourcePricesSnapshotItemCount rows coverage qualifiedIndividualTrades activeAvailabilityVerified minimumOfferVerified");
    need(v.schemaVersion === 1 && v.kind === "stamp_reference_median_capture" && v.definitionHash === definition2.definitionHash && v.registryArtifactSha256 === definition2.registryArtifactSha256 && integer2(v.sourcePricesSnapshotItemCount, 1, 2e4) && v.qualifiedIndividualTrades === 0 && v.activeAvailabilityVerified === false && v.minimumOfferVerified === false);
    shape2(v.source, "capturedAt rawBodySha256 reportedWindowDays exactWindowBoundsKnown sourceObservedAt");
    need(stampIso(v.source.capturedAt) && HASH3.test(v.source.rawBodySha256) && v.source.reportedWindowDays === 3 && v.source.exactWindowBoundsKnown === false && v.source.sourceObservedAt === null);
    if (checkedAt !== null) need(integer2(checkedAt) && Date.parse(v.source.capturedAt) <= checkedAt, "stamp_future_source");
    need(Array.isArray(v.rows) && v.rows.length === definition2.rows.length, "stamp_target_rows");
    const coverage = { targetItemTypes: definition2.rows.length, presentSnapshotIds: 0, verifiedIdentityTypes: 0, positiveAskingMedianTypes: 0, positiveSaleMedianTypes: 0 };
    for (let i = 0; i < v.rows.length; i++) {
      const r = v.rows[i];
      need(Array.isArray(r) && r.length === 7 && r[0] === definition2.rows[i][0] && ["verified_exact_identity", "absent_from_capture", "identity_unverified"].includes(r[1]), "stamp_row");
      if (r[1] !== "absent_from_capture") coverage.presentSnapshotIds++;
      if (r[1] === "verified_exact_identity") {
        coverage.verifiedIdentityTypes++;
        if (price(r[2])) coverage.positiveAskingMedianTypes++;
        if (price(r[3])) coverage.positiveSaleMedianTypes++;
        for (const n of r.slice(4)) need(n === null || integer2(n), "stamp_count");
      } else need(r.slice(2).every((x) => x === null), "stamp_unknown_row");
    }
    need(coverage.presentSnapshotIds <= v.sourcePricesSnapshotItemCount, "stamp_source_count");
    shape2(v.coverage, Object.keys(coverage).join(" "));
    need(Object.keys(coverage).every((k) => v.coverage[k] === coverage[k]), "stamp_coverage");
    need(enc2.encode(JSON.stringify(v)).length <= STAMP_BODY_LIMIT, "stamp_body_bound");
    return frozen(v);
  }
  function parseStampReferenceCapture(raw, options) {
    need(raw instanceof Uint8Array && raw.length > 0 && raw.length <= STAMP_BODY_LIMIT, "stamp_body_bound");
    return validateStampReferenceCapture(parseStrictJson(new Uint8Array(raw)), options);
  }

  // ops/api-basic-current-public-definition-v1.json
  var api_basic_current_public_definition_v1_default = { schemaVersion: 1, profile: "basic_aggregate_v1", rowColumns: ["itemId", "presenceMask", "soldMedianUnitPriceLexeme", "soldAverageUnitPriceLexeme", "reportedSalesCount", "reportedUnitCount", "reportedDaySalesCount", "reportedDayUnitCount", "askingMedianUnitPriceLexeme", "reportedListingCount", "reportedSellerCount"], moneyUnit: "mesos_per_reported_source_unit", reportedWindowDays: 3, exactWindowBoundsKnown: false, sourceObservedAtKnown: false, qualityMatched: false, lowestListingKnown: false, availabilityKnown: false, verifiedIndividualTrades: false, fullVariantFreshness: false, upstreamLatestInspected: false };

  // ops/api-basic-public-structure.mjs
  var B = Object.freeze({ totalBytes: 8388608 });
  var enc3 = new TextEncoder();
  var need2 = (v, c = "basic_contract_hold") => {
    if (!v) throw Error(c);
  };
  var integer3 = (n, a = 0, b = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(n) && n >= a && n <= b;
  function exact(v, keys) {
    need2(v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).sort().join("|") === keys.slice().sort().join("|"), "basic_shape");
  }
  var hash = (s) => typeof s === "string" && /^[a-f0-9]{64}$/.test(s);
  function iso2(s) {
    need2(typeof s === "string" && s.length === 24 && Number.isFinite(Date.parse(s)) && new Date(s).toISOString() === s, "basic_clock");
    return s;
  }

  // ops/api-basic-current-public-contract.mjs
  var BASIC_PUBLIC_DEFINITION_SHA = "3d7f8257dda8568ab99e743a4e6adee8ca911786528b5e56919d65675a724705";
  var BASIC_PUBLIC_MAX_BYTES = 8192;
  Object.freeze(api_basic_current_public_definition_v1_default.rowColumns);
  Object.freeze(api_basic_current_public_definition_v1_default);
  var proto = Object.getPrototypeOf(Uint8Array.prototype);
  var byteLength = Object.getOwnPropertyDescriptor(proto, "byteLength").get;
  var tag = Object.getOwnPropertyDescriptor(proto, Symbol.toStringTag).get;
  var money = (v) => v === null || typeof v === "string" && v.length <= 160 && /^\d+(?:\.\d+)?$/.test(v);
  function basicPublicShape(v) {
    exact(v, ["schemaVersion", "kind", "profile", "definitionHash", "itemId", "generation", "sourceBodySha256", "capturedAt", "sourceObservedAt", "captureTimeKind", "reportedWindowDays", "exactStartAt", "exactEndAt", "state", "sold", "asking", "upstreamLatestInspected", "fullVariantFreshness", "availabilityKnown", "lowestListingKnown", "qualityMatched", "verifiedIndividualTrades"]);
    need2(v.schemaVersion === 1 && v.kind === "basic_current_item_reference" && v.profile === "basic_aggregate_v1" && v.definitionHash === BASIC_PUBLIC_DEFINITION_SHA && integer3(v.itemId, 1, 999999999) && hash(v.generation) && hash(v.sourceBodySha256), "basic_public_profile");
    iso2(v.capturedAt);
    need2(v.sourceObservedAt === null && v.captureTimeKind === "http_response_completed" && v.reportedWindowDays === 3 && v.exactStartAt === null && v.exactEndAt === null, "basic_public_source_clock");
    for (const k of ["upstreamLatestInspected", "fullVariantFreshness", "availabilityKnown", "lowestListingKnown", "qualityMatched", "verifiedIndividualTrades"]) need2(v[k] === false, "basic_public_false_claim");
    need2(["present_in_generation", "absent_in_generation"].includes(v.state), "basic_public_state");
    if (v.state === "absent_in_generation") need2(v.sold === null && v.asking === null, "basic_public_absence");
    if (v.sold !== null) {
      exact(v.sold, ["medianUnitPrice", "averageUnitPrice", "reportedSalesCount", "reportedUnitCount", "reportedDaySalesCount", "reportedDayUnitCount"]);
      need2(money(v.sold.medianUnitPrice) && money(v.sold.averageUnitPrice), "basic_public_sold_money");
      for (const k of ["reportedSalesCount", "reportedUnitCount", "reportedDaySalesCount", "reportedDayUnitCount"]) need2(integer3(v.sold[k]), "basic_public_sold_count");
      Object.freeze(v.sold);
    }
    if (v.asking !== null) {
      exact(v.asking, ["medianUnitPrice", "reportedListingCount", "reportedSellerCount"]);
      need2(money(v.asking.medianUnitPrice) && integer3(v.asking.reportedListingCount) && integer3(v.asking.reportedSellerCount), "basic_public_asking");
      Object.freeze(v.asking);
    }
    return Object.freeze(v);
  }

  // ui-src/nx-stamp/model.mjs
  var DEC = /^\d+(?:\.\d+)?$/;
  function rational(text) {
    if (typeof text !== "string" || text.length > 160 || !DEC.test(text)) throw TypeError("Exact bounded decimal required");
    const [a, b = ""] = text.split(".");
    return { n: BigInt(a + b), d: 10n ** BigInt(b.length) };
  }
  function formatPerStamp(text, stamps = 1) {
    if (!Number.isSafeInteger(stamps) || stamps < 1 || stamps > 20) throw TypeError("Stamp count");
    const { n, d } = rational(text), den = d * BigInt(stamps), t = (n * 10n * 2n + den) / (2n * den), s = t.toString().padStart(2, "0");
    return s.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + s.slice(-1);
  }
  function comparePerStamp(a, b) {
    const x = rational(a.priceLexeme), y = rational(b.priceLexeme), d = x.n * y.d * BigInt(b.stamps) - y.n * x.d * BigInt(a.stamps);
    return d < 0n ? -1 : d > 0n ? 1 : a.itemId - b.itemId;
  }
  function underSanityThreshold(text, stamps = 1) {
    const { n, d } = rational(text);
    return n < 30000n * d * BigInt(stamps);
  }
  var stampRow = (rule, ref, mode) => {
    const a = ref.item.aggregate.asking, s = ref.item.aggregate.sold;
    const asking = a?.medianUnitPrice ?? null, sold = s?.medianUnitPrice ?? null;
    return { ...rule, askingLexeme: asking, soldLexeme: sold, reportedListingCount: a?.reportedListingCount ?? null, reportedSalesCount: s?.reportedSalesCount ?? null, capturedAt: ref.sourceCapturedAt, generation: ref.projectionGeneration, dtoSha256: ref.dtoSha256, mode, currentAvailabilityVerified: false, copyState: "unknown", sourceUrl: ref.sourceCreditUrl, reportedWindowDays: 3, exactWindowBoundsKnown: false };
  };
  var BASIC_KEYS = ["data", "mode", "evidenceKind", "quoteAuthority", "currentAgainstProvidedPins", "globalLatestVerified", "verificationScope", "bodyHashVerification", "upstreamLatestInspected"].sort().join("|");
  function basicStampRow(rule, entry) {
    if (!entry || Object.keys(entry).sort().join("|") !== BASIC_KEYS || !["current", "retained", "absent", "retained_absent"].includes(entry.mode) || entry.evidenceKind !== "basic_aggregate" || entry.globalLatestVerified !== false || entry.upstreamLatestInspected !== false || entry.verificationScope !== "committed_sql_attestation_and_selected_page" || entry.bodyHashVerification !== "producer_sql_attested_not_recomputed") throw TypeError("Selected aggregate cache context");
    if (new TextEncoder().encode(JSON.stringify(entry.data)).length > BASIC_PUBLIC_MAX_BYTES) throw TypeError("Selected aggregate bytes");
    const value = basicPublicShape(entry.data), present = value.state === "present_in_generation", current = ["current", "absent"].includes(entry.mode);
    if (present !== ["current", "retained"].includes(entry.mode) || entry.currentAgainstProvidedPins !== current || entry.quoteAuthority !== (entry.mode === "current" && present && [value.sold?.medianUnitPrice, value.sold?.averageUnitPrice, value.asking?.medianUnitPrice].some((x) => typeof x === "string"))) throw TypeError("Selected aggregate mode");
    return { ...rule, askingLexeme: value.asking?.medianUnitPrice ?? null, soldLexeme: value.sold?.medianUnitPrice ?? null, reportedListingCount: value.asking?.reportedListingCount ?? null, reportedSalesCount: value.sold?.reportedSalesCount ?? null, capturedAt: value.capturedAt, generation: value.generation, dtoSha256: null, mode: current ? "validated_cache" : "retained", referenceKind: "selected_basic_cache", basicState: value.state, currentAvailabilityVerified: false, copyState: "unknown", sourceUrl: "https://maplestory.market/items/" + value.itemId + "?ref=v6kkdvp6", reportedWindowDays: 3, exactWindowBoundsKnown: false };
  }
  function createStampReferenceStore(registry) {
    if (registry?.kind !== "verified_conditional_stamp_item_types" || registry.rows.length > 512) throw TypeError("Verified registry required");
    const registryArtifactHash = () => "9544096e01cef5fc19300dc554875ffd6e703acb97736e1a018f914f0a4ef421";
    const rules = new Map(registry.rows.map((r) => {
      if (!Number.isSafeInteger(r.itemId) || ![1, 2].includes(r.stamps) || typeof r.name !== "string") throw TypeError("Rule");
      return [r.itemId, structuredClone(r)];
    }));
    if (rules.size !== registry.rows.length) throw TypeError("Duplicate rule");
    let epoch = 0, refs = /* @__PURE__ */ new Map(), basicRefs = /* @__PURE__ */ new Map(), conflicts = /* @__PURE__ */ new Set(), shared = null;
    return Object.freeze({
      async ingest(values) {
        if (shared) return false;
        if (!Array.isArray(values) || values.length > 32) throw TypeError("Bounded cache batch");
        const owned = structuredClone(values);
        if (new TextEncoder().encode(JSON.stringify(owned)).length > 2097152) throw TypeError("Cache bytes");
        const ticket = epoch, validated = [];
        for (const v of owned) {
          if (!v || !["validated_cache", "retained"].includes(v.mode)) throw TypeError("Cache mode");
          const ref = await validatePublicItemReference(v.data);
          if (rules.has(ref.itemId) && ref.item.identity.name === rules.get(ref.itemId).name && ref.item.identity.status === "unique_client_id") validated.push(stampRow(rules.get(ref.itemId), ref, v.mode));
        }
        if (ticket !== epoch) return false;
        for (const row of validated) {
          const old = refs.get(row.itemId);
          if (old && Date.parse(old.capturedAt) > Date.parse(row.capturedAt)) continue;
          if (old && old.capturedAt === row.capturedAt && old.dtoSha256 !== row.dtoSha256) {
            conflicts.add(row.itemId);
            continue;
          }
          if (!old || Date.parse(row.capturedAt) > Date.parse(old.capturedAt)) conflicts.delete(row.itemId);
          refs.set(row.itemId, row);
        }
        return true;
      },
      async replaceSharedCapture(capture, { mode, bodySha256, publicationOrdinal } = {}) {
        const owned = structuredClone(capture), ticket = epoch;
        if (!["validated_cache", "retained"].includes(mode) || !/^[a-f0-9]{64}$/.test(bodySha256 ?? "") || !Number.isSafeInteger(publicationOrdinal) || publicationOrdinal < 1) throw TypeError("Shared stamp context");
        const definition2 = await loadStampReferenceDefinition(), value = validateStampReferenceCapture(owned, { definition: definition2 });
        if (ticket !== epoch) return false;
        if (value.registryArtifactSha256 !== registryArtifactHash()) throw TypeError("Stamp rule binding");
        if (shared && (value.source.capturedAt < shared.capturedAt || publicationOrdinal < shared.publicationOrdinal || publicationOrdinal === shared.publicationOrdinal && bodySha256 !== shared.bodySha256)) throw TypeError("Shared stamp rollback");
        const next = /* @__PURE__ */ new Map();
        for (const r of value.rows) {
          if (r[1] !== "verified_exact_identity") continue;
          const rule = rules.get(r[0]);
          if (!rule) throw TypeError("Shared stamp target");
          next.set(r[0], { ...rule, askingLexeme: r[2], soldLexeme: r[3], reportedListingCount: r[4], reportedSalesCount: r[6], capturedAt: r[2] !== null || r[3] !== null ? value.source.capturedAt : null, generation: bodySha256, dtoSha256: null, mode, currentAvailabilityVerified: false, copyState: "unknown", sourceUrl: "https://maplestory.market/items/" + r[0] + "?ref=v6kkdvp6", reportedWindowDays: 3, exactWindowBoundsKnown: false });
        }
        refs = next;
        conflicts = /* @__PURE__ */ new Set();
        shared = { capturedAt: value.source.capturedAt, coverage: value.coverage, sourcePricesSnapshotItemCount: value.sourcePricesSnapshotItemCount, publicationOrdinal, bodySha256, mode };
        return true;
      },
      replaceBasicReferences(values) {
        if (shared) return false;
        if (!Array.isArray(values) || values.length > 64) throw TypeError("Selected aggregate batch");
        const ticket = epoch, owned = structuredClone(values);
        if (new TextEncoder().encode(JSON.stringify(owned)).length > 1048576) throw TypeError("Selected aggregate batch bytes");
        const next = /* @__PURE__ */ new Map();
        for (const entry of owned) {
          const id2 = entry?.data?.itemId, rule = rules.get(id2);
          if (!rule) continue;
          if (next.has(id2)) throw TypeError("Duplicate selected aggregate");
          next.set(id2, basicStampRow(rule, entry));
        }
        if (ticket !== epoch) return false;
        basicRefs = next;
        return true;
      },
      clear() {
        epoch++;
        refs = /* @__PURE__ */ new Map();
        basicRefs = /* @__PURE__ */ new Map();
        conflicts = /* @__PURE__ */ new Set();
        shared = null;
      },
      view({ basis = "asking", search = "", showUnpriced = false, now = Date.now(), referenceSource = "visited" } = {}) {
        if (!["asking", "sold"].includes(basis) || !["visited", "basic"].includes(referenceSource) || typeof search !== "string" || search.length > 100 || !Number.isFinite(now)) throw TypeError("View");
        const selected = shared || referenceSource === "visited" ? refs : basicRefs, out = [];
        let pricedTypes = 0, basicCachedTypes = 0;
        for (const rule of rules.values()) {
          const r = selected.get(rule.itemId), conflict = selected === refs && conflicts.has(rule.itemId);
          if (r?.referenceKind === "selected_basic_cache") basicCachedTypes++;
          let priceLexeme = conflict ? null : (basis === "asking" ? r?.askingLexeme : r?.soldLexeme) ?? null;
          if (r && Date.parse(r.capturedAt) > now) priceLexeme = null;
          if (priceLexeme !== null) {
            try {
              if (rational(priceLexeme).n === 0n) priceLexeme = null;
            } catch {
              priceLexeme = null;
            }
          }
          if (priceLexeme !== null) pricedTypes++;
          if (!rule.name.toLowerCase().includes(search.toLowerCase())) continue;
          if (priceLexeme === null && !showUnpriced) continue;
          out.push({ ...rule, ...r || {}, priceLexeme, basis, conflict, seasonExpired: now >= Date.parse(registry.expiresAt), displayPerStamp: priceLexeme === null ? null : formatPerStamp(priceLexeme, rule.stamps), under30000: priceLexeme === null ? false : underSanityThreshold(priceLexeme, rule.stamps) });
        }
        out.sort((a, b) => a.priceLexeme === null ? b.priceLexeme === null ? a.itemId - b.itemId : 1 : b.priceLexeme === null ? -1 : comparePerStamp(a, b));
        return structuredClone({ rows: out, eligibleTypes: rules.size, pricedTypes: selected === refs ? [...refs.keys()].filter((id2) => !conflicts.has(id2)).length : pricedTypes, basicCachedTypes, referenceSource: shared ? "shared" : referenceSource, conflictedTypes: selected === refs ? conflicts.size : 0, verifiedTwoStampTypes: registry.verifiedTwoStampItemIds.length, cheapestActiveOfferCoverage: 0, individualTrades: 0, shared });
      }
    });
  }

  // ui-src/nx-stamp/shared-client.mjs
  var HASH4 = /^"stamp-references-([a-f0-9]{64})"$/;
  var integer4 = (v) => typeof v === "string" && /^[1-9][0-9]{0,15}$/.test(v) && Number.isSafeInteger(Number(v));
  function createStampReferenceClient({ available = false, isEnabled = () => true, fetcher = globalThis.fetch, now = Date.now, ttlMilliseconds = 6e4, timeoutMilliseconds = 8e3 } = {}) {
    const off = () => ({ status: "off", capture: null, mode: null, reason: null, blocked: false, nextCheckAt: Infinity });
    if (available !== true) return Object.freeze({ available: false, state: off, refresh: async () => off(), clear() {
    }, resetAccess() {
    } });
    if (typeof fetcher !== "function" || typeof isEnabled !== "function" || !Number.isSafeInteger(ttlMilliseconds) || ttlMilliseconds < 0 || ttlMilliseconds > 6e4 || !Number.isSafeInteger(timeoutMilliseconds) || timeoutMilliseconds < 1 || timeoutMilliseconds > 1e4) throw TypeError("Bounded stamp client required");
    let cache = null, flight = null, physical = null, control = null, epoch = 0, blocked = false, retryAt = 0, failures = 0, status = "empty", reason = null;
    const active = () => isEnabled() === true, state = () => ({ status, capture: cache?.capture ?? null, bodySha256: cache?.sha ?? null, publicationOrdinal: cache?.ordinal ?? null, mode: cache?.mode ?? null, reason, blocked, nextCheckAt: blocked ? Infinity : Math.max(cache?.expires ?? 0, retryAt) });
    async function read(c) {
      const guard = () => {
        if (c.expired || c.epoch !== epoch || !active()) throw Object.assign(Error("cancelled"), { code: "cancelled" });
      };
      const definition2 = await loadStampReferenceDefinition();
      guard();
      const prior = cache, response = await fetcher("/api-stamp-references.json", { method: "GET", credentials: "same-origin", cache: "no-cache", redirect: "error", signal: c.abort.signal, headers: prior ? { "If-None-Match": prior.etag } : {} });
      guard();
      if ([401, 403].includes(response.status)) throw Object.assign(Error("access_denied"), { code: "access_denied" });
      if (response.status === 404) throw Object.assign(Error("not_published"), { code: "not_published" });
      if (![200, 304].includes(response.status)) throw Object.assign(Error("unavailable"), { code: "unavailable" });
      const etag = response.headers.get("ETag"), match = HASH4.exec(etag ?? ""), mode = response.headers.get("X-Astra-Stamp-Mode"), at = response.headers.get("X-Astra-Stamp-Captured-At"), registry = response.headers.get("X-Astra-Stamp-Registry-Hash"), ordinalText = response.headers.get("X-Astra-Stamp-Publication-Ordinal");
      if (!match || !["validated_cache", "retained"].includes(mode) || !stampIso(at) || registry !== definition2.registryArtifactSha256 || !integer4(ordinalText)) throw Object.assign(Error("invalid"), { code: "invalid" });
      const ordinal = Number(ordinalText);
      if (response.status === 304) {
        if (!prior || prior.etag !== etag || prior.capture.source.capturedAt !== at || ordinal < prior.ordinal) throw Object.assign(Error("invalid"), { code: "invalid" });
        guard();
        return { ...prior, mode, ordinal, expires: now() + ttlMilliseconds };
      }
      if (!/^application\/json(?:;|$)/i.test(response.headers.get("Content-Type") ?? "")) throw Object.assign(Error("invalid"), { code: "invalid" });
      const length = response.headers.get("Content-Length");
      if (length !== null && (!/^[0-9]+$/.test(length) || Number(length) > STAMP_BODY_LIMIT)) throw Object.assign(Error("invalid"), { code: "invalid" });
      const reader = response.body?.getReader();
      if (!reader) throw Object.assign(Error("invalid"), { code: "invalid" });
      const parts = [];
      let n = 0, chunks = 0;
      try {
        for (; ; ) {
          const value = await reader.read();
          guard();
          if (value.done) break;
          n += value.value.length;
          if (++chunks > 1024 || n > STAMP_BODY_LIMIT) {
            void reader.cancel().catch(() => {
            });
            throw Object.assign(Error("invalid"), { code: "invalid" });
          }
          parts.push(value.value);
        }
      } finally {
        reader.releaseLock();
      }
      if (length !== null && n !== Number(length)) throw Object.assign(Error("invalid"), { code: "invalid" });
      const raw = new Uint8Array(n);
      let offset = 0;
      for (const p of parts) {
        raw.set(p, offset);
        offset += p.length;
      }
      if (await stampSha256(raw) !== match[1]) throw Object.assign(Error("invalid"), { code: "invalid" });
      guard();
      let capture;
      try {
        capture = parseStampReferenceCapture(raw, { definition: definition2, checkedAt: now() + 6e4 });
      } catch {
        throw Object.assign(Error("invalid"), { code: "invalid" });
      }
      guard();
      if (capture.source.capturedAt !== at || prior && (at < prior.capture.source.capturedAt || ordinal < prior.ordinal || ordinal === prior.ordinal && match[1] !== prior.sha)) throw Object.assign(Error("invalid"), { code: "invalid" });
      return { capture, etag, sha: match[1], ordinal, mode, expires: now() + ttlMilliseconds };
    }
    async function refresh() {
      if (!active()) return state();
      if (blocked) return state();
      if (cache && now() < cache.expires || now() < retryAt) return state();
      if (flight) return flight;
      if (physical) {
        reason = "underlying_pending";
        status = cache ? "retained" : "unavailable";
        retryAt = now() + 3e4;
        return state();
      }
      const c = { epoch, expired: false, abort: new AbortController() };
      control = c;
      const task = read(c);
      physical = task;
      task.finally(() => {
        if (physical === task) physical = null;
      }).catch(() => {
      });
      let timer;
      const own2 = (async () => {
        try {
          status = cache ? "checking_retained" : "loading";
          const value = await Promise.race([task, new Promise((_, reject) => {
            timer = setTimeout(() => {
              c.expired = true;
              c.abort.abort();
              reject(Object.assign(Error("timeout"), { code: "timeout" }));
            }, timeoutMilliseconds);
          })]);
          if (c.epoch !== epoch || !active() || c.expired) return state();
          cache = value;
          failures = 0;
          retryAt = 0;
          reason = null;
          status = value.mode === "retained" ? "retained" : "accepted";
          return state();
        } catch (error) {
          if (c.epoch !== epoch || !active() || error?.code === "cancelled") return state();
          reason = ["access_denied", "not_published", "invalid", "timeout", "unavailable"].includes(error?.code) ? error.code : "unavailable";
          if (reason === "access_denied") {
            blocked = true;
            cache = null;
            status = "access_denied";
          } else if (reason === "not_published") {
            cache = null;
            status = "not_published";
            retryAt = now() + 6e4;
          } else {
            failures++;
            retryAt = now() + Math.min(3e5, 3e4 * 2 ** Math.min(failures - 1, 4));
            if (cache) cache = { ...cache, mode: "retained" };
            status = cache ? "retained" : "unavailable";
          }
          return state();
        } finally {
          clearTimeout(timer);
          if (flight === own2) flight = null;
        }
      })();
      flight = own2;
      return own2;
    }
    return Object.freeze({ available: true, state, refresh, clear() {
      epoch++;
      if (control) {
        control.expired = true;
        control.abort.abort();
      }
      cache = null;
      status = "empty";
      reason = null;
      retryAt = 0;
      failures = 0;
      blocked = false;
    }, pause() {
      epoch++;
      if (control) {
        control.expired = true;
        control.abort.abort();
      }
      if (cache) cache = { ...cache, mode: "retained" };
      status = cache ? "retained" : "empty";
      reason = "paused";
    }, resetAccess() {
      if (blocked) {
        epoch++;
        blocked = false;
        retryAt = 0;
        failures = 0;
        reason = null;
        status = "empty";
      }
    } });
  }

  // ui-src/nx-stamp/entry.mjs
  function mountStampFinder(doc, host, { peek = () => window.AstraItemApiPreview?.peekCachedReferences?.() ?? { status: "unavailable", references: [] }, now = Date.now, sharedAvailable = doc.body.dataset.stampReferences === "available", sharedClient = null, peekBasic = null } = {}) {
    const store = createStampReferenceStore(registry_default), section = doc.createElement("section");
    section.className = "panel stamp-finder card";
    section.id = "nx-stamp-finder";
    let enabled = true, basis = "asking", search = "", unpriced = true, version = 0;
    const ownWindow = doc.defaultView, sharedActive = () => enabled && !doc.hidden && ownWindow?.navigator.onLine !== false && ownWindow?.location.hash === "#nx", shared = sharedClient ?? createStampReferenceClient({ available: sharedAvailable, isEnabled: sharedActive, fetcher: (...args) => ownWindow.fetch(...args), now });
    let sharedStatus = null;
    const basicCapable = typeof peekBasic === "function" || typeof ownWindow?.AstraItemApiPreview?.peekCachedBasicReferences === "function", basicPeek = peekBasic ?? (() => ownWindow?.AstraItemApiPreview?.peekCachedBasicReferences?.() ?? { status: "disabled", references: [] });
    let referenceSource = "visited", cacheStatus = "unavailable";
    const deniedSources = /* @__PURE__ */ new Set();
    if (!sharedAvailable && basicCapable) {
      try {
        const initial = basicPeek();
        if (initial?.status === "cache_only") {
          store.replaceBasicReferences(initial.references);
          if (store.view({ referenceSource: "basic", basis: "asking", now: now() }).rows.length > 0) referenceSource = "basic";
        }
      } catch {
        store.replaceBasicReferences([]);
      }
    }
    const make = (tag2, text) => {
      const n = doc.createElement(tag2);
      if (text !== void 0) n.textContent = text;
      return n;
    }, title = make("h2", "Trash NX finder \xB7 Aurora Stamp candidates"), intro = make("p", "Conditional item types, not executable deals. Unequipped eligible Mystery Fashion Crate rewards yield one stamp. Verified unopened Signature outfit sets yield two; exact set IDs are not verified here."), toggle = make("button", "Stamp candidates: On"), select = make("select"), sourceSelect = make("select"), input = make("input"), check2 = make("input"), label = make("label", " Include unpriced eligible types"), status = make("p"), content = make("div"), note = make("p", "Observed asking MEDIAN per stamp is not the lowest listing or available stock. Both references use the source-reported 3-day window; exact bounds are unknown. Source listing/sale counts are not quantities. Tradeability, unequipped/unopened state and live availability are unknown. Required upfront purchase, lot quantity and minimum listing price are not supplied by these medians. Under 30,000 mesos/stamp is a sanity highlight, not an eligibility rule."), exits = make("p", "Season 1 expires (01-13-2027 07:59 UTC). Shop costs: Mystery Palette Exchange Coupon 5 stamps; Palette Cleanser Exchange Coupon 10; Aurora Mystery Fashion Crate 20. Stamps move within the same account/world. Exit quotes, fees and stock are unverified; no profit is calculated."), credit = make("a", "Official Aurora Stamp rules");
    credit.href = registry_default.ruleUrl;
    credit.target = "_blank";
    credit.rel = "noreferrer";
    toggle.type = "button";
    toggle.setAttribute("aria-pressed", "true");
    input.type = "search";
    input.placeholder = "Search verified item types";
    input.setAttribute("aria-label", "Search stamp item types");
    input.maxLength = 100;
    check2.type = "checkbox";
    check2.checked = true;
    label.prepend(check2);
    select.setAttribute("aria-label", "Stamp reference basis");
    for (const [value, text] of [["asking", "Observed asking median"], ["sold", "Reported 3-day sale median"]]) {
      const o = make("option", text);
      o.value = value;
      select.append(o);
    }
    sourceSelect.setAttribute("aria-label", "Stamp reference source");
    for (const [value, text] of basicCapable ? [["basic", "Shared price references"], ["visited", "Visited item references"]] : [["visited", "Visited item references"]]) {
      const o = make("option", text);
      o.value = value;
      sourceSelect.append(o);
    }
    sourceSelect.value = referenceSource;
    sourceSelect.hidden = sharedAvailable || !basicCapable;
    status.setAttribute("role", "status");
    content.className = "stamp-table-wrap";
    section.append(title, intro, toggle, select, sourceSelect, input, label, status, content, note, exits, credit);
    host.append(section);
    function clock(at) {
      if (!at) return "Unknown retrieval";
      let z = doc.getElementById("display-timezone")?.value || "UTC";
      try {
        const parts = new Intl.DateTimeFormat("en-US", { timeZone: z, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(at)), v = (k) => parts.find((p) => p.type === k)?.value;
        return "(" + v("month") + "-" + v("day") + "-" + v("year") + " " + v("hour") + ":" + v("minute") + ":" + v("second") + " " + z + ")";
      } catch {
        return "Unknown retrieval";
      }
    }
    function draw() {
      toggle.textContent = "Stamp candidates: " + (enabled ? "On" : "Off");
      toggle.setAttribute("aria-pressed", String(enabled));
      content.hidden = !enabled;
      select.disabled = sourceSelect.disabled = input.disabled = check2.disabled = !enabled;
      if (!enabled) {
        status.textContent = "Stamp candidates Off. No additional source requests were made.";
        return;
      }
      if (deniedSources.size) {
        content.replaceChildren();
        status.textContent = "Price references unavailable after access denial. Fresh accepted references are required; changing the source does not restore access.";
        return;
      }
      const v = store.view({ basis, search, showUnpriced: unpriced, now: now(), referenceSource });
      status.textContent = v.shared ? v.eligibleTypes + " verified conditional types; " + v.shared.coverage.verifiedIdentityTypes + " exact identities in the shared prices capture, " + v.shared.coverage.positiveAskingMedianTypes + " positive asking medians. Capture retrieved " + clock(v.shared.capturedAt) + (v.shared.mode === "retained" ? " \xB7 retained original input. " : ". ") + "Cheapest active offers, stock and upfront lots are not verified." : sharedAvailable ? "Shared stamp medians " + (sharedStatus?.status === "access_denied" ? "unavailable until access is restored" : sharedStatus?.status === "not_published" ? "not published" : sharedStatus?.reason === "paused" ? "paused while hidden/offline" : "not connected yet") + ". " + v.eligibleTypes + " conditional types; no missing price is inferred." : v.eligibleTypes + " verified conditional one-stamp item types (" + registry_default.held.length + " names held unresolved); " + v.pricedTypes + " " + (referenceSource === "basic" ? "shared-price" : "visited-item") + " cached median references; " + v.verifiedTwoStampTypes + " verified two-stamp IDs. Cheapest active offers/stock: not connected. Cache coverage is partial, not the entire cash catalog." + (referenceSource === "basic" ? " Shared price references are " + ({ cache_only: "available", access_denied: "unavailable after access denial", disabled: "Off or not published", paused: "paused", invalid: "unavailable after validation", unavailable: "unavailable" }[cacheStatus] ?? "unavailable") + ". Missing selected values never fall back to visited-item prices." : "");
      content.replaceChildren();
      if (v.pricedTypes === 0) content.append(make("p", sharedAvailable ? "The shared feed supplies all defined types together when published; no individual item visit is required. Missing values remain unknown." : referenceSource === "basic" ? "Accepted Price check references appear here automatically. Item API details must be On and shared references published. This guide makes no individual item-price requests; missing values remain unknown." : "For a cached price, open an eligible item and turn Item API details On. This does not scan the whole catalog."));
      if (now() >= Date.parse(registry_default.expiresAt)) content.append(make("p", "This stamp season has expired; references are historical, not current conversion opportunities."));
      if (!v.rows.length) {
        content.append(make("p", "No matching validated cached reference. Open an eligible item with Item API details On, or include unpriced types. No fashion price is inferred from the fixed 29-item cash subset."));
        return;
      }
      const table = make("table"), head = make("thead"), tr = make("tr");
      for (const text of ["Exact item", "Stamps \xB7 conditional", "Median mesos / source unit", "Mesos / stamp", "Upfront lot cost / quantity", "Source count \xB7 not stock", "Original retrieval"]) tr.append(make("th", text));
      head.append(tr);
      const body = make("tbody");
      for (const r of v.rows.slice(0, 20)) {
        const row = make("tr"), name = make("td"), link = make("a", r.name);
        link.href = "#item/id-" + r.itemId;
        if (r.sprite) {
          const img = make("img");
          img.src = r.sprite;
          img.alt = r.name + " original MCW game art";
          img.width = 32;
          img.height = 32;
          name.append(img);
        }
        name.append(link);
        const count = basis === "asking" ? r.reportedListingCount : r.reportedSalesCount;
        row.append(name, make("td", String(r.stamps) + " \xB7 copy state unknown"), make("td", r.priceLexeme === null ? "Unknown" : formatPerStamp(r.priceLexeme)), make("td", r.displayPerStamp ?? "Unknown"), make("td", "Unknown / unknown"), make("td", count == null ? "Unknown" : count.toLocaleString("en-US") + (basis === "asking" ? " reported listings" : " reported sales")), make("td", clock(r.capturedAt) + (r.mode === "retained" ? " \xB7 retained" : "") + (r.referenceKind === "selected_basic_cache" ? " \xB7 shared aggregate median" : "")));
        if (r.referenceKind) row.dataset.referenceKind = r.referenceKind;
        if (r.under30000) row.dataset.sanity = "under-30000";
        if (r.sourceUrl) {
          const a = make("a", "Source");
          a.href = r.sourceUrl;
          a.target = "_blank";
          a.rel = "noreferrer";
          row.lastChild.append(" ", a);
        }
        body.append(row);
      }
      table.append(head, body);
      content.append(table);
      if (v.rows.length > 20) content.append(make("p", "Showing first 20 sorted candidates; narrow the search."));
    }
    async function refresh() {
      const own2 = ++version;
      if (!enabled) return;
      if (sharedAvailable) {
        if (!sharedActive()) {
          shared.pause?.();
          sharedStatus = shared.state();
          draw();
          return;
        }
        const value2 = await shared.refresh();
        if (own2 !== version || !enabled) return;
        sharedStatus = value2;
        if (value2.capture) {
          try {
            await store.replaceSharedCapture(value2.capture, { mode: value2.mode, bodySha256: value2.bodySha256, publicationOrdinal: value2.publicationOrdinal });
          } catch {
            if (own2 === version) store.clear();
          }
        } else store.clear();
        if (own2 === version) draw();
        return;
      }
      const snapshot = (fn) => {
        try {
          return fn();
        } catch {
          return { status: "unavailable", references: [] };
        }
      };
      let value = snapshot(peek), basic = snapshot(basicPeek);
      for (const [name, source] of [["visited", value], ["basic", basic]]) if (source?.status === "access_denied") deniedSources.add(name);
      if (value?.status === "access_denied" || basic?.status === "access_denied") {
        store.clear();
        cacheStatus = "access_denied";
        draw();
        return;
      }
      if (deniedSources.size) {
        try {
          let accepted = true;
          if (deniedSources.has("basic")) {
            if (basic?.status !== "cache_only") accepted = false;
            else {
              store.replaceBasicReferences(basic.references);
              accepted = store.view({ referenceSource: "basic", showUnpriced: true, now: now() }).rows.some((r) => r.referenceKind === "selected_basic_cache" && r.mode === "validated_cache" && Date.parse(r.capturedAt) <= now());
            }
          }
          if (deniedSources.has("visited")) {
            if (value?.status !== "cache_only") accepted = false;
            else {
              await store.ingest(value.references);
              accepted = accepted && store.view({ referenceSource: "visited", showUnpriced: true, now: now() }).rows.some((r) => r.mode === "validated_cache" && Date.parse(r.capturedAt) <= now());
            }
          }
          if (own2 !== version || !enabled) return;
          value = snapshot(peek);
          basic = snapshot(basicPeek);
          if (!accepted || deniedSources.has("basic") && basic?.status !== "cache_only" || deniedSources.has("visited") && value?.status !== "cache_only" || value?.status === "access_denied" || basic?.status === "access_denied") {
            store.clear();
            draw();
            return;
          }
          deniedSources.clear();
        } catch {
          store.clear();
          draw();
          return;
        }
      }
      if (referenceSource === "basic") {
        try {
          cacheStatus = basic?.status ?? "unavailable";
          if (basic?.status !== "cache_only") {
            store.clear();
            draw();
            return;
          }
          store.replaceBasicReferences(basic.references);
          const closing = snapshot(basicPeek);
          cacheStatus = closing?.status ?? "unavailable";
          if (closing?.status === "access_denied") {
            deniedSources.add("basic");
            store.clear();
          } else if (closing?.status !== "cache_only") store.clear();
          else store.replaceBasicReferences(closing.references);
        } catch {
          store.clear();
          cacheStatus = "invalid";
        }
        if (own2 === version && enabled) draw();
        return;
      }
      if (value?.status !== "cache_only") {
        store.clear();
        draw();
        return;
      }
      try {
        await store.ingest(value.references);
      } catch {
        if (own2 === version) {
          store.clear();
          status.textContent = "Cached references failed validation; no price shown.";
        }
        return;
      }
      if (own2 === version && enabled) draw();
    }
    sourceSelect.addEventListener("change", () => {
      version++;
      store.clear();
      referenceSource = sourceSelect.value;
      cacheStatus = "unavailable";
      draw();
      void refresh();
    });
    toggle.addEventListener("click", () => {
      enabled = !enabled;
      version++;
      if (!enabled) {
        store.clear();
        shared.clear();
        sharedStatus = null;
      } else shared.resetAccess();
      draw();
      if (enabled) void refresh();
    });
    select.addEventListener("change", () => {
      basis = select.value;
      draw();
    });
    input.addEventListener("input", () => {
      search = input.value.slice(0, 100);
      draw();
    });
    check2.addEventListener("change", () => {
      unpriced = check2.checked;
      draw();
    });
    doc.addEventListener("astrapiitemcache", refresh);
    const basicWake = () => {
      if (!sharedAvailable) void refresh();
    };
    doc.addEventListener("astrabasicitemcache", basicWake);
    const wake = () => void refresh(), pause = () => {
      version++;
      shared.pause?.();
      sharedStatus = shared.state();
      if (!sharedAvailable) store.replaceBasicReferences([]);
      draw();
    };
    doc.addEventListener("astracalculationcheck", wake);
    ownWindow?.addEventListener("hashchange", wake);
    ownWindow?.addEventListener("online", wake);
    ownWindow?.addEventListener("offline", pause);
    const visibility = () => {
      if (!doc.hidden) wake();
      else pause();
    };
    doc.addEventListener("visibilitychange", visibility);
    doc.getElementById("display-timezone")?.addEventListener("change", draw);
    draw();
    void refresh();
    return Object.freeze({ refresh, element: section, get enabled() {
      return enabled;
    }, destroy() {
      version++;
      store.clear();
      doc.removeEventListener("astrapiitemcache", refresh);
      doc.removeEventListener("astrabasicitemcache", basicWake);
      doc.removeEventListener("astracalculationcheck", wake);
      doc.removeEventListener("visibilitychange", visibility);
      ownWindow?.removeEventListener("hashchange", wake);
      ownWindow?.removeEventListener("online", wake);
      ownWindow?.removeEventListener("offline", pause);
      shared.clear();
      doc.getElementById("display-timezone")?.removeEventListener("change", draw);
      section.remove();
    } });
  }
  if (typeof document !== "undefined") {
    const host = document.getElementById("view-nx");
    if (host) mountStampFinder(document, host);
  }
})();

})();

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "nx-stamp-finder.js", status: "initialization_failed"}})); } catch {}
}

;
/* Astra source: api-nx-ui.js */
try {
(()=>{'use strict';if(window.AstraApiNxUi)return;
let report=null;const formatters=new Map();
const rate=value=>Number.isFinite(value)?value.toLocaleString('en-US',{maximumFractionDigits:2})+' mesos / NX':'Unavailable';
function instant(value){if(!value||!Number.isFinite(Date.parse(value)))return'Unknown';let zone=document.getElementById('display-timezone')?.value||'UTC';try{if(!formatters.has(zone))formatters.set(zone,new Intl.DateTimeFormat('en-US',{timeZone:zone,month:'short',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',timeZoneName:'short'}));return formatters.get(zone).format(new Date(value));}catch{zone='UTC';if(!formatters.has(zone))formatters.set(zone,new Intl.DateTimeFormat('en-US',{timeZone:zone,month:'short',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',timeZoneName:'short'}));return formatters.get(zone).format(new Date(value));}}
function paragraph(parent,text,klass){const p=document.createElement('p');p.textContent=text;if(klass)p.className=klass;parent.append(p);return p;}
function render(){
 const api=window.AstraApiNxOffers;if(!api||!report)return;const host=document.getElementById('smega-section');if(!host)return;
 let panel=document.getElementById('api-nx-evidence');if(!panel){panel=document.createElement('section');panel.id='api-nx-evidence';panel.className='api-nx-evidence';panel.setAttribute('aria-label','API offer source evidence');host.append(panel);}
 panel.replaceChildren();const state=api.getState(),data=state.data,description=api.sourceDescriptor(),status=paragraph(panel,description.state,'api-nx-status');status.setAttribute('role','status');status.dataset.tone=description.tone;panel.dataset.status=state.status;
 paragraph(panel,'Green: verified recent receipt · Amber: dated, paused or unpublished · Red: read failed without accepted API data.','api-nx-legend small');
 if(!data){paragraph(panel,description.detail,'small');return;}
 const grid=document.createElement('div');grid.className='api-nx-evidence-grid';panel.append(grid);
 const native=document.createElement('section'),derived=document.createElement('section');grid.append(native,derived);const n=data.nativeSummary,d=data.derived24;
 paragraph(native,n?'Source-native '+n.reportedWindowHours+'-hour summary':'Source-native summary unavailable','eyebrow');native.dataset.nativeHours=String(n?.reportedWindowHours??'');
 if(n){paragraph(native,'Sellers ask: '+rate(n.sell?.median)+' · Buyers bid: '+rate(n.buy?.median));const captured=paragraph(native,'Retrieved ('+instant(n.capturedAt)+')','small');captured.dataset.rawCapturedAt=n.capturedAt;const heard=paragraph(native,'Source last-heard label: ('+instant(n.sourceLastHeardAt)+')','small');heard.dataset.rawSourceLastHeardAt=n.sourceLastHeardAt||'';paragraph(native,'Poster counts: seller '+(n.sell?.reportedPosterCount??'unknown')+', buyer '+(n.buy?.reportedPosterCount??'unknown')+'. Exact window bounds are unavailable.','small');}
 paragraph(derived,'Derived 24 source-hour histogram pool','eyebrow');derived.dataset.derivedHours='24';paragraph(derived,'Sellers ask: '+rate(d.sides.sell.median)+' · Buyers bid: '+rate(d.sides.buy.median));paragraph(derived,'Available source buckets: buyer '+d.sides.buy.availableHourBuckets+'/24, seller '+d.sides.sell.availableHourBuckets+'/24. Missing buckets remain missing.','small');
 const anchor=paragraph(derived,'Source hours end ('+instant(d.anchorSourceHourLabel)+')','small');anchor.dataset.rawSourceHour=d.anchorSourceHourLabel||'';
 paragraph(panel,'Native summary and derived pool use different windows. Poster-hour appearances can repeat people; these are offers, not trades. Retrieval times do not renew source hours.','small');
 const view=report.offerEvidence?report:api.view(report),detail=view.offerEvidence;paragraph(panel,detail.mergedSourceHourSideRows+' retained source/hour/side rows after overlap resolution; older browser history stays available. '+(detail.conflictingHourSideKeys.length?detail.conflictingHourSideKeys.length+' equal-capture conflicts are excluded from calculations.':''),'small');
 const credit=document.createElement('a');credit.href=data.attribution.url;credit.target='_blank';credit.rel='noreferrer';credit.textContent=data.attribution.label+' ↗';credit.className='small';panel.append(credit);
}
window.AstraApiNxUi=Object.freeze({render,instant});document.addEventListener('astramarketsnapshot',event=>{report=event.detail;render();});document.addEventListener('astraapinxchange',render);document.getElementById('display-timezone')?.addEventListener('change',render);document.dispatchEvent(new CustomEvent('astramarkethighlightsready'));
})();

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "api-nx-ui.js", status: "initialization_failed"}})); } catch {}
}

;
/* Astra source: nx-history-browser.js */
try {
(() => {
  'use strict';
  // ops/portable-hash.mjs
  var encoder = new TextEncoder();

  // ops/api-cash-projection.mjs
  var MAX = Number.MAX_SAFE_INTEGER;

  // ops/api-raw-prices-decoder.mjs
  var MAX2 = BigInt(Number.MAX_SAFE_INTEGER);
  var fail = (ok, message) => {
    if (!ok) throw new TypeError(message);
  };
  var own = (value2, key) => Object.prototype.hasOwnProperty.call(value2, key);
  var JsonNumber = class {
    constructor(token) {
      this.token = token;
      Object.freeze(this);
    }
  };
  function parseStrictJson(text) {
    fail(typeof text === "string" && text.length <= 5e6, "Bounded UTF8 JSON text required");
    let i = 0, nodes = 0;
    const white = () => {
      while (i < text.length && [" ", "\n", "\r", "	"].includes(text[i])) i++;
    };
    function string() {
      const start = i++;
      while (i < text.length) {
        const char = text[i++];
        if (char === '"') {
          const value3 = JSON.parse(text.slice(start, i));
          fail(value3.length <= 4096, "JSON string too long");
          return value3;
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
        fail(text[i] >= "1" && text[i] <= "9", "Invalid JSON number");
        while (text[i] >= "0" && text[i] <= "9") i++;
      }
      if (text[i] === ".") {
        i++;
        const digits = i;
        while (text[i] >= "0" && text[i] <= "9") i++;
        fail(i > digits, "Missing fractional digits");
      }
      if (text[i] === "e" || text[i] === "E") {
        i++;
        if (text[i] === "+" || text[i] === "-") i++;
        const digits = i;
        while (text[i] >= "0" && text[i] <= "9") i++;
        fail(i > digits, "Missing exponent digits");
      }
      fail(i - start <= 4096, "JSON number token too long");
      return new JsonNumber(text.slice(start, i));
    }
    function value2(depth) {
      fail(++nodes <= 1e6 && depth <= 64, "JSON complexity bound");
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
          fail(out.length < 1e4, "JSON array bound");
          out.push(value2(depth + 1));
          white();
          if (text[i] === "]") {
            i++;
            return Object.freeze(out);
          }
          fail(text[i++] === ",", "Expected array comma");
        }
      }
      if (char === "{") {
        i++;
        white();
        const out = /* @__PURE__ */ Object.create(null);
        let count = 0;
        if (text[i] === "}") {
          i++;
          return Object.freeze(out);
        }
        while (true) {
          white();
          fail(text[i] === '"', "Expected object key");
          const key = string();
          fail(!own(out, key), "Duplicate JSON key");
          fail(++count <= 64, "JSON object bound");
          white();
          fail(text[i++] === ":", "Expected object colon");
          out[key] = value2(depth + 1);
          white();
          if (text[i] === "}") {
            i++;
            return Object.freeze(out);
          }
          fail(text[i++] === ",", "Expected object comma");
        }
      }
      throw new TypeError("Invalid JSON token");
    }
    const result = value2(0);
    white();
    fail(i === text.length, "Trailing JSON data");
    return result;
  }

  // ops/api-private-nx-projection.mjs
  var MAX_NX_BYTES = 2e6;
  var NxProjectionContractError = class extends TypeError {
  };
  var check = (ok, code) => {
    if (!ok) throw new NxProjectionContractError(code);
  };
  var byteSize = (text) => new TextEncoder().encode(text).length;
  var byteHash = async (text) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)))].map((v) => v.toString(16).padStart(2, "0")).join("");
  function parseStored(text, max = MAX_NX_BYTES) {
    check(typeof text === "string" && byteSize(text) <= max, "stored_body_bound");
    try {
      parseStrictJson(text);
      return JSON.parse(text);
    } catch {
      throw new NxProjectionContractError("stored_json_contract");
    }
  }

  // ops/nx-history-contract.mjs
  var SOURCE = "https://maplestory.market/api/nx-rate/history?range=7d&step=hour";
  var CANONICAL_SOURCE = "https://maplestory.market/ads?tab=services";
  var MANIFEST_PATH = "/api-nx-history.json";
  var PAGE_PREFIX = "/api-nx-history/";
  var LIMITS = Object.freeze({ weeks: 260, rows: 87360, variants: 1e6, variantsPerIdentity: 4096, pageBytes: 196608, manifestBytes: 131072, rowsPerWeek: 336 });
  var HEX = /^[a-f0-9]{64}$/;
  var SIDES = ["buy", "sell"];
  var FIELDS = ["low", "p25", "median", "p75", "high"];
  var check2 = (v, code) => {
    if (!v) throw new TypeError(code);
  };
  var shape = (v, keys) => check2(v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).sort().join("|") === keys.split(" ").sort().join("|"), "closed_fields");
  var clock = (v) => typeof v === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
  var hour = (v) => typeof v === "string" && /^\d{4}-\d\d-\d\dT\d\d:00:00Z$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().replace(".000Z", "Z") === v;
  var uint = (n, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(n) && n >= 0 && n <= max;
  var value = (v) => v === null || typeof v === "number" && Number.isFinite(v) && v > 0 && v <= Number.MAX_SAFE_INTEGER;
  var identity = (r) => r.at + "|" + r.side;
  function validateRow(r) {
    shape(r, "at side capturedAt sourceObservedAt low p25 median p75 high reportedPosterCount statisticsComplete conflict");
    check2(hour(r.at) && SIDES.includes(r.side) && clock(r.capturedAt) && Date.parse(r.at) <= Date.parse(r.capturedAt) && r.sourceObservedAt === null, "row_clock_identity");
    check2(typeof r.conflict === "boolean" && typeof r.statisticsComplete === "boolean" && FIELDS.every((k) => value(r[k])), "row_rates");
    if (r.conflict) check2(FIELDS.every((k) => r[k] === null) && r.reportedPosterCount === null && !r.statisticsComplete, "conflict_excluded");
    else {
      check2(uint(r.reportedPosterCount) && r.statisticsComplete === FIELDS.every((k) => r[k] !== null), "row_stats");
      const known = FIELDS.map((k) => r[k]).filter((v) => v !== null);
      check2(known.every((v, i) => !i || v >= known[i - 1]), "row_order");
      if (!r.reportedPosterCount) check2(!known.length, "zero_count_unknown");
    }
    return r;
  }
  function weekOf(at) {
    check2(hour(at), "week_hour");
    const date = new Date(at), day2 = date.getUTCDay();
    date.setUTCDate(date.getUTCDate() - (day2 + 6) % 7);
    return date.toISOString().slice(0, 10);
  }
  async function validateManifest(input) {
    const m = structuredClone(input);
    shape(m, "schemaVersion kind sourceIdentity sourceUrl coverageScope completeProviderHistory unit basis sourceObservedAt qualifiedIndividualTrades bucketCompletionKnown countMeaning attribution receiptWatermarkAt firstHourLabel lastHourLabel rowCount excludedConflictRows pages indexHash");
    check2(m.schemaVersion === 1 && m.kind === "nx_offer_history_manifest" && m.sourceIdentity === "maplestory_market_nx_offers" && m.sourceUrl === SOURCE && m.coverageScope === "retained_curated_hour_side_rows_published_so_far" && m.completeProviderHistory === false && m.unit === "mesos_per_NX" && m.basis === "advertised_NX_offer_rates_not_completed_sales" && m.sourceObservedAt === null && m.qualifiedIndividualTrades === 0 && m.bucketCompletionKnown === false && m.countMeaning === "poster_hour_observations_not_unique_people_or_trades", "manifest_source");
    shape(m.attribution, "label url");
    check2(m.attribution.label === "NX offers from maplestory.market" && m.attribution.url === "https://maplestory.market/?ref=v6kkdvp6", "credit");
    check2(clock(m.receiptWatermarkAt) && hour(m.firstHourLabel) && hour(m.lastHourLabel) && m.firstHourLabel <= m.lastHourLabel && uint(m.rowCount, LIMITS.rows) && m.rowCount > 0 && uint(m.excludedConflictRows, m.rowCount) && Array.isArray(m.pages) && m.pages.length > 0 && m.pages.length <= LIMITS.weeks && HEX.test(m.indexHash), "manifest_bounds");
    let n = 0, conflicts = 0, last = "";
    for (const d of m.pages) {
      shape(d, "weekStartUtc firstHourLabel lastHourLabel rowCount receiptWatermarkAt excludedConflictRows sha256 bytes url");
      check2(clock(d.receiptWatermarkAt) && d.receiptWatermarkAt <= m.receiptWatermarkAt && d.weekStartUtc > last && weekOf(d.firstHourLabel) === d.weekStartUtc && weekOf(d.lastHourLabel) === d.weekStartUtc && d.firstHourLabel <= d.lastHourLabel && HEX.test(d.sha256) && uint(d.bytes, LIMITS.pageBytes) && d.bytes > 0 && uint(d.rowCount, LIMITS.rowsPerWeek) && d.rowCount > 0 && uint(d.excludedConflictRows, d.rowCount) && d.url === PAGE_PREFIX + d.sha256 + ".json", "page_descriptor");
      last = d.weekStartUtc;
      n += d.rowCount;
      conflicts += d.excludedConflictRows;
    }
    check2(m.receiptWatermarkAt === m.pages.reduce((a, d) => a > d.receiptWatermarkAt ? a : d.receiptWatermarkAt, "") && n === m.rowCount && conflicts === m.excludedConflictRows && m.pages[0].firstHourLabel === m.firstHourLabel && m.pages.at(-1).lastHourLabel === m.lastHourLabel, "manifest_coverage");
    const { indexHash, ...body } = m;
    check2(await byteHash(JSON.stringify(body)) === indexHash, "manifest_semantic_hash");
    return m;
  }
  async function validateWeek(text, descriptor, manifest) {
    descriptor = structuredClone(descriptor);
    manifest = structuredClone(manifest);
    check2(typeof text === "string", "page_text");
    const m = await validateManifest(manifest);
    check2(m.pages.some((d) => JSON.stringify(d) === JSON.stringify(descriptor)), "unknown_descriptor");
    check2(byteSize(text) === descriptor.bytes && await byteHash(text) === descriptor.sha256, "page_bytes");
    const page = parseStored(text, LIMITS.pageBytes);
    shape(page, "schemaVersion kind weekStartUtc rows");
    check2(page.schemaVersion === 1 && page.kind === "nx_offer_history_week" && page.weekStartUtc === descriptor.weekStartUtc && Array.isArray(page.rows) && page.rows.length === descriptor.rowCount, "week_profile");
    let last = "";
    for (const row of page.rows) {
      validateRow(row);
      check2(identity(row) > last && weekOf(row.at) === descriptor.weekStartUtc && row.capturedAt <= m.receiptWatermarkAt, "week_context");
      last = identity(row);
    }
    check2(page.rows.reduce((a, r) => a > r.capturedAt ? a : r.capturedAt, "") === descriptor.receiptWatermarkAt && page.rows[0].at === descriptor.firstHourLabel && page.rows.at(-1).at === descriptor.lastHourLabel && page.rows.filter((r) => r.conflict).length === descriptor.excludedConflictRows, "week_coverage");
    return page;
  }

  // browser/nx-history-client.mjs
  var aborted = () => Object.assign(Error("aborted"), { name: "AbortError" });
  function createNxHistoryClient({ enabled = false, isEnabled = () => true, fetcher, now = Date.now, ttlMs = 3e4, timeoutMs = 1e4, maxWeeks = 12 } = {}) {
    if (!Number.isSafeInteger(ttlMs) || ttlMs < 0 || ttlMs > 6e4 || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 12e3 || !Number.isSafeInteger(maxWeeks) || maxWeeks < 1 || maxWeeks > 12) throw TypeError("bounded_history_client");
    let current = null, manifestFlight = null, expires = 0, retryAt = 0, failures = 0;
    const pageCache = /* @__PURE__ */ new Map(), pageFlights = /* @__PURE__ */ new Map(), ranges = /* @__PURE__ */ new Map(), rangeFlights = /* @__PURE__ */ new Map(), rangeRetry = /* @__PURE__ */ new Map();
    let pageBytes = 0, rangeBytes = 0;
    const active = () => {
      try {
        return enabled === true && isEnabled() === true && typeof fetcher === "function";
      } catch {
        return false;
      }
    }, wait = (p, signal) => new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(aborted());
      const stop = () => {
        signal?.removeEventListener("abort", stop);
        reject(aborted());
      };
      signal?.addEventListener("abort", stop, { once: true });
      p.then((v) => {
        signal?.removeEventListener("abort", stop);
        signal?.aborted ? reject(aborted()) : resolve(v);
      }, (e) => {
        signal?.removeEventListener("abort", stop);
        reject(e);
      });
    });
    async function get(url, max, previous = null) {
      const controller = new AbortController();
      let timer;
      const timeout = new Promise((_, reject) => timer = setTimeout(() => {
        controller.abort();
        reject(Error("read_deadline"));
      }, timeoutMs)), deadline = (p) => Promise.race([p, timeout]);
      try {
        const response = await deadline(fetcher(url, { method: "GET", credentials: "same-origin", cache: "no-cache", redirect: "error", signal: controller.signal, headers: previous ? { "If-None-Match": previous.etag } : {} }));
        if (response.status === 409) throw Object.assign(Error("generation_changed"), { generationChanged: true });
        if (response.status === 404) throw Object.assign(Error("not_published"), { notPublished: true });
        const etag = response.headers.get("ETag"), mode = response.headers.get("X-Astra-NX-History-Mode"), generation = response.headers.get("X-Astra-NX-History-Generation"), capturedAt = response.headers.get("X-Astra-NX-History-Captured-At");
        if (!/^"nx-history-[a-f0-9]{64}"$/.test(etag ?? "") || !["accepted_cache", "retained_last_good"].includes(mode) || !/^[a-f0-9]{64}$/.test(generation ?? "")) throw Error("response_context");
        if (response.status === 304) {
          if (!previous || etag !== previous.etag || generation !== previous.generation || capturedAt !== previous.capturedAt) throw Error("invalid304");
          return { ...previous, mode };
        }
        if (response.status !== 200 || !/^application\/json(?:;|$)/i.test(response.headers.get("Content-Type") ?? "")) throw Error("history_unavailable");
        if (Number(response.headers.get("Content-Length")) > max) throw Error("body_bound");
        const reader = response.body.getReader(), parts = [];
        let size = 0;
        try {
          for (; ; ) {
            const { done, value: value2 } = await deadline(reader.read());
            if (done) break;
            size += value2.byteLength;
            if (size > max) {
              await reader.cancel();
              throw Error("body_bound");
            }
            parts.push(value2);
          }
        } finally {
          reader.releaseLock();
        }
        const raw = new Uint8Array(size);
        let offset = 0;
        for (const part of parts) {
          raw.set(part, offset);
          offset += part.byteLength;
        }
        const text = new TextDecoder("utf-8", { fatal: true }).decode(raw), sha = await byteHash(text);
        if (etag !== '"nx-history-' + sha + '"') throw Error("body_hash");
        return { text, sha, bytes: size, etag, mode, generation, capturedAt };
      } finally {
        clearTimeout(timer);
      }
    }
    async function manifest({ force = false, signal } = {}) {
      if (!active()) throw Error("not_connected");
      if (!force && current && (now() < expires || now() < retryAt)) return structuredClone({ ...current, mode: now() < retryAt ? "retained_last_good" : current.mode });
      if (now() < retryAt) {
        if (current) return structuredClone({ ...current, mode: "retained_last_good" });
        throw Error("read_backoff");
      }
      if (!manifestFlight) {
        manifestFlight = (async () => {
          try {
            const record = await get(MANIFEST_PATH, LIMITS.manifestBytes, current?.record), m = await validateManifest(parseStored(record.text, LIMITS.manifestBytes));
            if (record.generation !== m.indexHash || record.capturedAt !== m.receiptWatermarkAt) throw Error("manifest_context");
            if (current && (m.receiptWatermarkAt < current.manifest.receiptWatermarkAt || m.rowCount < current.manifest.rowCount || current.manifest.pages.some((d) => !m.pages.some((n) => n.weekStartUtc === d.weekStartUtc && n.rowCount >= d.rowCount)))) throw Error("archive_rollback");
            if (!active()) throw Error("disabled");
            current = { manifest: m, record, mode: record.mode };
            expires = now() + ttlMs;
            retryAt = 0;
            failures = 0;
            return current;
          } catch (error) {
            retryAt = now() + Math.min(3e5, 3e4 * 2 ** Math.min(failures++, 4));
            if (current && active()) return { ...current, mode: "retained_last_good" };
            throw error;
          } finally {
            manifestFlight = null;
          }
        })();
      }
      return structuredClone(await wait(manifestFlight, signal));
    }
    function rememberPage(sha, value2) {
      if (pageCache.has(sha)) pageBytes -= pageCache.get(sha).bytes;
      pageCache.delete(sha);
      pageCache.set(sha, value2);
      pageBytes += value2.bytes;
      while (pageCache.size > 8 || pageBytes > 2097152) {
        const first = pageCache.keys().next().value;
        pageBytes -= pageCache.get(first).bytes;
        pageCache.delete(first);
      }
    }
    async function page(d, m) {
      let value2 = pageCache.get(d.sha256), cached = !!value2;
      if (!value2) {
        if (pageFlights.has(d.sha256)) value2 = await pageFlights.get(d.sha256);
        else {
          if (pageFlights.size >= 4) throw Error("read_capacity");
          const p = get(d.url + "?generation=" + m.indexHash, LIMITS.pageBytes);
          pageFlights.set(d.sha256, p);
          p.finally(() => pageFlights.delete(d.sha256)).catch(() => {
          });
          value2 = await p;
        }
      }
      if (!cached && value2.generation !== m.indexHash) throw Object.assign(Error("generation_changed"), { generationChanged: true });
      if (value2.bytes !== d.bytes || value2.sha !== d.sha256 || value2.capturedAt !== d.receiptWatermarkAt) throw Error("page_context");
      await validateWeek(value2.text, d, m);
      if (!active()) throw Error("disabled");
      rememberPage(d.sha256, value2);
      return value2;
    }
    function rememberRange(key, value2) {
      if (ranges.has(key)) rangeBytes -= ranges.get(key).bytes;
      ranges.delete(key);
      ranges.set(key, value2);
      rangeBytes += value2.bytes;
      while (ranges.size > 4 || rangeBytes > 8388608) {
        const first = ranges.keys().next().value;
        rangeBytes -= ranges.get(first).bytes;
        ranges.delete(first);
      }
    }
    async function loadWeeks({ weeks, signal } = {}) {
      if (!active()) throw Error("not_connected");
      const selected = structuredClone(weeks);
      if (!Array.isArray(selected) || !selected.length || selected.length > maxWeeks || new Set(selected).size !== selected.length || selected.some((s) => typeof s !== "string" || !/^\d{4}-\d\d-\d\d$/.test(s))) throw TypeError("explicit_bounded_week_selection");
      selected.sort();
      const key = selected.join("|");
      if (rangeFlights.has(key)) return structuredClone(await wait(rangeFlights.get(key), signal));
      if (rangeFlights.size >= 4) throw Error("range_capacity");
      const prior = ranges.get(key);
      if ((rangeRetry.get(key) ?? 0) > now() && !prior) throw Error("range_backoff");
      if (prior?.retryAt > now()) return structuredClone({ ...prior.value, mode: "retained_last_good" });
      const task = (async () => {
        try {
          for (let attempt = 0; attempt < 2; attempt++) {
            try {
              const entry = await manifest({ force: attempt === 1 }), descriptors = selected.map((week) => entry.manifest.pages.find((d) => d.weekStartUtc === week));
              if (descriptors.some((d) => !d)) throw Error("selected_week_not_published");
              const results = new Array(descriptors.length);
              let cursor = 0, cancelled = false;
              const workers = Array.from({ length: Math.min(4, descriptors.length) }, async () => {
                try {
                  for (; ; ) {
                    if (cancelled) return;
                    const index = cursor++;
                    if (index >= descriptors.length) return;
                    results[index] = await page(descriptors[index], entry.manifest);
                  }
                } catch (error) {
                  cancelled = true;
                  throw error;
                }
              });
              const settled = await Promise.allSettled(workers), failed = settled.find((r) => r.status === "rejected");
              if (failed) throw failed.reason;
              if (current?.manifest.indexHash !== entry.manifest.indexHash) throw Object.assign(Error("generation_changed"), { generationChanged: true });
              const rows = results.flatMap((r) => parseStored(r.text, LIMITS.pageBytes).rows);
              if (rows.length !== descriptors.reduce((n, d) => n + d.rowCount, 0) || rows.length > 4032) throw Error("selected_coverage");
              const value2 = { indexHash: entry.manifest.indexHash, weeks: selected, rows, mode: entry.mode === "retained_last_good" || results.some((r) => r.mode === "retained_last_good") ? "retained_last_good" : "accepted_cache", archivePublishedRows: entry.manifest.rowCount, sourceObservedAt: null, qualifiedIndividualTrades: 0 };
              if (!active()) throw Error("disabled");
              rememberRange(key, { value: value2, bytes: byteSize(JSON.stringify(value2)), retryAt: 0 });
              rangeRetry.delete(key);
              return value2;
            } catch (error) {
              if (error.generationChanged && attempt === 0) continue;
              throw error;
            }
          }
          throw Error("generation_retry_bound");
        } catch (error) {
          rangeRetry.set(key, now() + 3e4);
          while (rangeRetry.size > 32) rangeRetry.delete(rangeRetry.keys().next().value);
          if (prior && active()) {
            prior.retryAt = now() + 3e4;
            return { ...prior.value, mode: "retained_last_good" };
          }
          throw error;
        } finally {
          rangeFlights.delete(key);
        }
      })();
      rangeFlights.set(key, task);
      return structuredClone(await wait(task, signal));
    }
    return Object.freeze({ manifest, loadWeeks, state: () => current ? { indexHash: current.manifest.indexHash, receiptWatermarkAt: current.manifest.receiptWatermarkAt, mode: now() < retryAt ? "retained_last_good" : current.mode } : null });
  }

  // browser/nx-history-merge.mjs
  var aliases = /* @__PURE__ */ new Set([SOURCE, CANONICAL_SOURCE]);
  var clock2 = (v) => typeof v === "string" && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : null;
  function mergeNxArchivedWeeks(report, input, { enabled = false } = {}) {
    if (!enabled) return report;
    if (!report || !Array.isArray(report.smega) || report.smega.length > 2e4) throw TypeError("bounded_existing_offer_view");
    const archive = structuredClone(input);
    if (!Array.isArray(archive.rows) || archive.rows.length > 4032 || !Array.isArray(archive.weeks) || archive.weeks.length > 12 || archive.weeks.some((w) => typeof w !== "string" || !/^\d{4}-\d\d-\d\d$/.test(w)) || !/^[a-f0-9]{64}$/.test(archive.indexHash ?? "") || !["accepted_cache", "retained_last_good"].includes(archive.mode)) throw TypeError("bounded_loaded_archive");
    const rows = /* @__PURE__ */ new Map(), other = [], detail = new Map((report.offerEvidence?.api?.hourlyHistory?.rows || []).map((r) => [clock2(r.at) + "|" + r.side, r]));
    const add = (p) => {
      const at = clock2(p.at), capturedAt = clock2(p.capturedAt);
      if (!at || Date.parse(at) % 36e5 || !["buy", "sell"].includes(p.side)) throw TypeError("source_hour_side");
      const key = at + "|" + p.side, next = { ...p, at, capturedAt, sourceUrl: CANONICAL_SOURCE, sourceObservedAt: null }, old = rows.get(key);
      if (!old) {
        rows.set(key, next);
        return;
      }
      const newer = capturedAt !== null && (old.capturedAt === null || capturedAt > old.capturedAt), older = old.capturedAt !== null && (capturedAt === null || capturedAt < old.capturedAt);
      if (newer) {
        rows.set(key, next);
        return;
      }
      if (older) return;
      const same = ["rate", "p25", "p75", "sampleCount"].every((k) => (next[k] ?? null) === (old[k] ?? null)) && ["low", "high", "statisticsComplete"].every((k) => !Object.hasOwn(old, k) || !Object.hasOwn(next, k) || old[k] === next[k]);
      if (same) {
        rows.set(key, { ...old, provenance: [...old.provenance || [], ...next.provenance || []] });
        return;
      }
      rows.set(key, { ...old, rate: null, p25: null, p75: null, low: null, high: null, statisticsComplete: false, sampleCount: null, conflict: true, provenance: [...old.provenance || [], ...next.provenance || []] });
    };
    for (const p of report.smega) {
      if (!aliases.has(p.sourceUrl) || p.aggregation !== "source_published_hourly") {
        other.push(structuredClone(p));
        continue;
      }
      const copy = structuredClone(p), full = detail.get(clock2(p.at) + "|" + p.side);
      if (full && clock2(full.capturedAt) === clock2(p.capturedAt)) for (const key of ["low", "high", "statisticsComplete"]) copy[key] = full[key];
      add(copy);
    }
    for (const r of archive.rows) {
      validateRow(r);
      if (!archive.weeks.includes(weekOf(r.at))) throw TypeError("archive_selected_window");
      add({ at: r.at, side: r.side, rate: r.median, p25: r.p25, p75: r.p75, low: r.low, high: r.high, statisticsComplete: r.statisticsComplete, sampleCount: r.reportedPosterCount, capturedAt: r.capturedAt, sourceUrl: SOURCE, sourceObservedAt: null, kind: r.side === "sell" ? "smega_ask" : "smega_bid", aggregation: "source_published_hourly", partial: null, bucketCompletionKnown: false, conflict: r.conflict, provenance: [{ sourceUrl: SOURCE, capturedAt: r.capturedAt, transport: "own_site_curated_archive" }] });
    }
    return { ...report, smega: [...other, ...[...rows.values()].sort((a, b) => a.at.localeCompare(b.at) || a.side.localeCompare(b.side))], archivedOfferEvidence: { mode: archive.mode, indexHash: archive.indexHash, loadedWeeks: [...archive.weeks], loadedHourSideRows: archive.rows.length, archivePublishedRows: archive.archivePublishedRows, sourceObservedAt: null, qualifiedIndividualTrades: 0, meaning: "curated_source_hour_offers_not_individual_trades" } };
  }

  // browser/nx-history-controller.mjs
  var DAY = 864e5;
  var utcDay = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  var windowLabel = (selection) => `${utcDay.format(new Date(selection.from))} through ${utcDay.format(/* @__PURE__ */ new Date(selection.end + "T00:00:00Z"))} (UTC)`;
  var day = (v) => typeof v === "string" && /^\d{4}-\d\d-\d\d$/.test(v) && Number.isFinite(Date.parse(v + "T00:00:00Z")) && (/* @__PURE__ */ new Date(v + "T00:00:00Z")).toISOString().slice(0, 10) === v;
  function historicalWindow(start, end) {
    if (!day(start) || !day(end) || end < start || (Date.parse(end) - Date.parse(start)) / DAY > 76) throw TypeError("bounded_utc_date_window");
    return { start, end, from: start + "T00:00:00.000Z", until: new Date(Date.parse(end + "T00:00:00Z") + DAY).toISOString() };
  }
  function monthWindow(month) {
    if (typeof month !== "string" || !/^\d{4}-\d\d$/.test(month)) throw TypeError("month");
    const first = month + "-01";
    if (!day(first)) throw TypeError("month");
    const end = /* @__PURE__ */ new Date(first + "T00:00:00Z");
    end.setUTCMonth(end.getUTCMonth() + 1);
    end.setUTCDate(0);
    return historicalWindow(first, end.toISOString().slice(0, 10));
  }
  function createNxHistoricalController({ fetcher, now = Date.now, onChange = () => {
  }, isVisible = () => true, isOnline = () => true } = {}) {
    let selection = null, loaded = null, pending = false, status = "current", lastError = null, epoch = 0, flight = null, attempted = null;
    const transports = /* @__PURE__ */ new Set();
    const available = () => isVisible() && isOnline();
    const transport = async (url, options) => {
      if (!available()) throw Error("paused");
      if (transports.size >= 5) throw Error("transport_capacity");
      const abort = new AbortController(), stop = () => abort.abort(), cleanup = () => {
        options.signal.removeEventListener("abort", stop);
        transports.delete(abort);
      };
      options.signal.addEventListener("abort", stop, { once: true });
      transports.add(abort);
      try {
        const response = await fetcher(url, { ...options, signal: abort.signal });
        if (abort.signal.aborted) {
          response.body?.cancel().catch(() => {
          });
          throw Error("paused");
        }
        const max = url === "/api-nx-history.json" ? LIMITS.manifestBytes : LIMITS.pageBytes;
        if (response.status !== 200 || !/^"nx-history-[a-f0-9]{64}"$/.test(response.headers.get("ETag") ?? "") || !["accepted_cache", "retained_last_good"].includes(response.headers.get("X-Astra-NX-History-Mode")) || !/^[a-f0-9]{64}$/.test(response.headers.get("X-Astra-NX-History-Generation") ?? "") || !/^application\/json(?:;|$)/i.test(response.headers.get("Content-Type") ?? "") || Number(response.headers.get("Content-Length")) > max) {
          cleanup();
          response.body?.cancel().catch(() => {
          });
          return response;
        }
        if (!response.body) {
          cleanup();
          return response;
        }
        const reader = response.body.getReader();
        return new Response(new ReadableStream({ async pull(controller) {
          try {
            const part = await reader.read();
            if (part.done) {
              cleanup();
              controller.close();
            } else controller.enqueue(part.value);
          } catch (error) {
            cleanup();
            controller.error(error);
          }
        }, async cancel(reason) {
          cleanup();
          await reader.cancel(reason);
        } }), { status: response.status, statusText: response.statusText, headers: response.headers });
      } catch (error) {
        cleanup();
        throw error;
      }
    };
    const client = createNxHistoryClient({ enabled: true, fetcher: transport, now, isEnabled: available });
    const state = () => ({ selection: selection ? { ...selection } : null, pending, status, error: lastError, requested: attempted ? { ...attempted } : null, mode: loaded?.mode ?? null, indexHash: loaded?.indexHash ?? null });
    const emit = () => onChange(state());
    async function load(window2) {
      if (!available()) {
        status = "paused";
        emit();
        return null;
      }
      if (flight) return flight;
      const mine = ++epoch;
      attempted = window2;
      pending = true;
      status = "loading";
      lastError = null;
      emit();
      flight = (async () => {
        try {
          const entry = await client.manifest(), weeks = entry.manifest.pages.filter((p) => Date.parse(p.weekStartUtc + "T00:00:00Z") < Date.parse(window2.until) && Date.parse(p.weekStartUtc + "T00:00:00Z") + 7 * DAY > Date.parse(window2.from)).map((p) => p.weekStartUtc);
          if (!weeks.length) throw Object.assign(Error("no_published_hours_in_window"), { emptyWindow: true });
          const next = await client.loadWeeks({ weeks });
          if (mine !== epoch || !available()) return null;
          selection = window2;
          loaded = next;
          status = next.mode === "retained_last_good" ? "retained" : "accepted";
          lastError = null;
          emit();
          return next;
        } catch (error) {
          if (mine !== epoch) return null;
          status = available() ? loaded ? "retained" : error.notPublished ? "unpublished" : error.emptyWindow ? "empty" : "unavailable" : "paused";
          lastError = error.notPublished ? "not_published" : error.emptyWindow ? "no_published_hours" : "read_failed";
          emit();
          return null;
        } finally {
          if (mine === epoch) {
            pending = false;
            flight = null;
            emit();
          }
        }
      })();
      return flight;
    }
    function current() {
      epoch++;
      for (const abort of transports) abort.abort();
      transports.clear();
      flight = null;
      selection = null;
      loaded = null;
      pending = false;
      status = "current";
      lastError = null;
      attempted = null;
      emit();
    }
    function pause() {
      epoch++;
      for (const abort of transports) abort.abort();
      transports.clear();
      flight = null;
      pending = false;
      if (selection || attempted) status = "paused";
      emit();
    }
    function chartView(report) {
      if (!selection || !loaded) return null;
      const merged = mergeNxArchivedWeeks(report, loaded, { enabled: true });
      const points = merged.smega.filter((p) => [CANONICAL_SOURCE, SOURCE].includes(p.sourceUrl) && p.aggregation === "source_published_hourly" && Date.parse(p.at) >= Date.parse(selection.from) && Date.parse(p.at) < Date.parse(selection.until)).map((p) => ({ ...p }));
      return { points, selection: { ...selection }, mode: status === "accepted" ? "accepted_cache" : "retained_last_good", indexHash: loaded.indexHash, label: "Historical source hours · " + windowLabel(selection), sourceObservedAt: null, qualifiedIndividualTrades: 0 };
    }
    return Object.freeze({ state, selectWindow: (start, end) => load(historicalWindow(start, end)), selectMonth: (month) => load(monthWindow(month)), refresh: () => selection ? load(selection) : Promise.resolve(null), current, pause, chartView });
  }

  // browser/nx-history-entry.mjs
  var section = document.getElementById("smega-section");
  var chart = document.getElementById("smega-offer-chart");
  if (section && chart && !document.getElementById("nx-history-picker")) {
    let schedule = function() {
      clearTimeout(timer);
      if (!visible() || !online()) {
        controller.pause();
        return;
      }
      if (controller.state().selection) timer = setTimeout(async () => {
        await controller.refresh();
        schedule();
      }, 6e4);
    };
    const panel = document.createElement("div");
    panel.id = "nx-history-picker";
    panel.className = "nx-history-picker";
    panel.innerHTML = '<div role="group" aria-label="Offer chart history"><button type="button" data-nx-history-current aria-pressed="true">Current offers</button><label>Historical month <input type="month" data-nx-history-month aria-label="Historical source month"></label><button type="button" data-nx-history-load>Show history</button></div><p class="small muted" data-nx-history-status role="status">Historical archive is optional; no history request is made until selected.</p><p class="small muted">Hourly advertised offers, not completed trades. The current summary cards stay on their selected current window. <a href="https://maplestory.market/?ref=v6kkdvp6" target="_blank" rel="noopener noreferrer">NX offers from maplestory.market</a></p>';
    chart.parentNode.insertBefore(panel, chart);
    const input = panel.querySelector("input"), button = panel.querySelector("[data-nx-history-current]"), status = panel.querySelector("[data-nx-history-status]");
    let timer = null, lastSnapshot = null;
    const visible = () => !document.hidden && !!section.getClientRects().length, online = () => navigator.onLine !== false;
    const announce = (state) => {
      button.setAttribute("aria-pressed", String(!state.selection));
      panel.querySelector("[data-nx-history-load]").setAttribute("aria-pressed", String(!!state.selection));
      panel.querySelector("[data-nx-history-load]").disabled = state.pending;
      input.disabled = state.pending;
      panel.dataset.status = state.status;
      const bounds = state.selection ? windowLabel(state.selection) : "";
      status.textContent = state.status === "current" ? "Current offers selected; native 8h and derived 24h evidence are unchanged." : state.pending ? "Loading selected historical source hours…" : state.status === "accepted" ? `Historical chart selected: ${bounds}. Only published hours are available; gaps are not filled.` : state.status === "retained" ? `Previously accepted historical chart retained: ${bounds}. The requested refresh or selection did not replace it.` : state.status === "paused" ? "History updates paused while this card is hidden or offline; accepted source times are retained." : state.status === "unpublished" ? "Historical archive is not published yet. Current offers remain available." : state.status === "empty" ? "No published source hours in that historical window. Current or previously accepted chart remains selected." : "Historical archive could not be validated or retrieved. Current or previously accepted chart remains selected.";
      document.dispatchEvent(new CustomEvent("astranxhistorychange", { detail: state }));
    };
    const controller = createNxHistoricalController({ fetcher: (url, options) => fetch(url, options), onChange: announce, isVisible: visible, isOnline: online });
    window.AstraNxHistory = Object.freeze({ ...controller });
    button.addEventListener("click", () => {
      controller.current();
      schedule();
    });
    panel.querySelector("[data-nx-history-load]").addEventListener("click", async () => {
      if (!input.value) {
        status.textContent = "Choose a historical source month first.";
        input.focus();
        return;
      }
      try {
        await controller.selectMonth(input.value);
      } catch {
        status.textContent = "Choose a valid historical source month.";
      }
      schedule();
    });
    document.addEventListener("click", (event) => {
      if (event.target.closest("[data-smega-range]")) {
        controller.current();
        schedule();
      }
    });
    document.addEventListener("astramarketsnapshot", (event) => {
      lastSnapshot = event.detail?.snapshot || event.detail?.data || event.detail || lastSnapshot;
      if (!input.value && lastSnapshot?.sourceUpdatedAt) input.value = lastSnapshot.sourceUpdatedAt.slice(0, 7);
    });
    document.addEventListener("visibilitychange", schedule);
    window.addEventListener("offline", schedule);
    window.addEventListener("online", schedule);
    window.addEventListener("hashchange", schedule);
    window.addEventListener("pagehide", () => {
      clearTimeout(timer);
      controller.pause();
    });
  }
})();

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "nx-history-browser.js", status: "initialization_failed"}})); } catch {}
}

;
/* Astra source: rolling-benchmark-preview.js */
try {
(() => {
  'use strict';
  if (window.AstraRollingBenchmark) return;
  const method = Object.freeze({ version: 1, windowDays: 7, defaultWindowDays: 7, allowedWindowDays: Object.freeze([3, 7]), minimumDailyCount: 5, minimumCashItemsPerDay: 3, minimumGoodsObservedCoverage: .8,
    units: 'modelled_mesos_per_NX', cashWeight: 'recorded daily item count', goodsMean: 'arithmetic mean of the selected complete-day fixed-basket MPI levels' });
  const positive = value => Number.isFinite(value) && value > 0;
  const day = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
  const shift = (value, days) => new Date(Date.parse(value + 'T00:00:00Z') + days * 86400000).toISOString().slice(0, 10);
  const clock = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
  const validPoint = point => point && day(point.day) && positive(point.cpi) && Number.isFinite(point.coverage) && point.coverage + 1e-12 >= method.minimumGoodsObservedCoverage && point.coverage <= 1 + 1e-9 && clock(point.at) && point.at.slice(0, 10) === point.day;
  const failure = (date, reason, details = {}) => ({ available: false, day: date || null, rate: null, reason, ...details });
  function index(report) {
    const source = clock(report?.sourceUpdatedAt) && day(report.sourceUpdatedAt.slice(0, 10)) ? report.sourceUpdatedAt.slice(0, 10) : null;
    const goods = new Map(), goodsConflicts = new Set(), cashDays = new Map();
    for (const point of Array.isArray(report?.history) ? report.history : []) {
      if (!point || !day(point.day)) continue;
      const prior = goods.get(point.day);
      if (prior && ['cpi', 'coverage', 'partial', 'at'].some(key => prior[key] !== point[key])) goodsConflicts.add(point.day);
      else goods.set(point.day, point);
    }
    for (const date of goodsConflicts) goods.delete(date);
    const cash = Array.isArray(report?.cash) ? report.cash : [], slugs = new Set(), names = new Set();
    let scheduleValid = cash.length >= method.minimumCashItemsPerDay;
    for (const row of cash) {
      if (!row || typeof row.slug !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(row.slug) || typeof row.name !== 'string' || !positive(row.nx) || slugs.has(row.slug) || names.has(row.name)) { scheduleValid = false; continue; }
      slugs.add(row.slug); names.add(row.name);
      const points = new Map(), conflicts = new Set();
      for (const point of Array.isArray(row.history) ? row.history : []) {
        if (!Array.isArray(point) || !day(point[0])) continue;
        const previous = points.get(point[0]);
        if (previous && (previous[1] !== point[1] || previous[2] !== point[2])) conflicts.add(point[0]);
        else points.set(point[0], point);
      }
      for (const [date, point] of points) {
        if (conflicts.has(date) || !positive(point[1]) || !Number.isSafeInteger(point[2]) || point[2] < method.minimumDailyCount) continue;
        const rate = point[1] / row.nx, weighted = rate * point[2];
        if (!positive(rate) || !Number.isFinite(weighted)) continue;
        if (!cashDays.has(date)) cashDays.set(date, { items: 0, quantity: 0, weightedRateSum: 0 });
        const total = cashDays.get(date); total.items++; total.quantity += point[2]; total.weightedRateSum += weighted;
      }
    }
    return { source, goods, cashDays, scheduleValid, configuredCashItems: cash.length };
  }
  function point(report, idx, date, days) {
    if (!method.allowedWindowDays.includes(days)) return failure(date, 'Only three- or seven-complete-day anchors are supported');
    if (!idx.source || !day(date) || date > idx.source) return failure(date, 'Source-calendar date unavailable');
    const current = idx.goods.get(date);
    if (!validPoint(current)) return failure(date, 'Current fixed-goods MPI or ≥80% same-day observed weight unavailable');
    if (!idx.scheduleValid) return failure(date, 'Configured known-NX schedule missing or ambiguous');
    const startDay = shift(date, -days), endDay = shift(date, -1), anchorDays = [], mpi = [];
    let quantity = 0, weighted = 0;
    for (let offset = -days; offset < 0; offset++) {
      const anchorDay = shift(date, offset), goods = idx.goods.get(anchorDay), cash = idx.cashDays.get(anchorDay);
      if (!validPoint(goods) || goods.partial === true) return failure(date, `${days} complete qualified fixed-goods MPI days required`, { missingDay: anchorDay, startDay, endDay, windowDays: days });
      if (!cash || cash.items < method.minimumCashItemsPerDay || !Number.isSafeInteger(cash.quantity) || !positive(cash.weightedRateSum)) return failure(date, 'At least three qualified known-NX items required on every anchor day', { missingDay: anchorDay, startDay, endDay });
      mpi.push(goods.cpi); quantity += cash.quantity; weighted += cash.weightedRateSum;
      anchorDays.push({ day: anchorDay, mpi: goods.cpi, goodsObservedCoverage: goods.coverage, cashItems: cash.items, cashQuantity: cash.quantity, cashRate: cash.weightedRateSum / cash.quantity });
    }
    const meanMpi = mpi.reduce((sum, value) => sum + value, 0) / days, cashAnchor = weighted / quantity, rate = cashAnchor * current.cpi / meanMpi;
    if (!Number.isSafeInteger(quantity) || ![meanMpi, cashAnchor, rate].every(positive)) return failure(date, 'Finite rolling-anchor arithmetic unavailable');
    const changePercent = (current.cpi / meanMpi - 1) * 100, fixedRate = positive(report?.baseNxRate) ? report.baseNxRate * current.cpi / 100 : null;
    if (!Number.isFinite(changePercent)) return failure(date, 'Finite rolling comparison unavailable');
    return { available: true, day: date, at: current.at, partial: current.partial === true, rate, changePercent, currentMpi: current.cpi,
      goodsObservedCoverage: current.coverage, cashAnchor, meanMpi, cashQuantity: quantity, configuredCashItems: idx.configuredCashItems,
      startDay, endDay, endExclusive: date, windowDays: days, anchorDays, fixedRate: positive(fixedRate) ? fixedRate : null, sourceUpdatedAt: report.sourceUpdatedAt,
      units: method.units, kind: `prior_${days}_complete_days_cash_anchored_goods_model` };
  }
  function calculate(report, { day: requestedDay, windowDays: requestedDays = windowDays } = {}) {
    if(report?.apiCalculationView){const model=window.AstraApiCalculations?.headline();return !requestedDay&&requestedDays===windowDays&&model?model:failure(requestedDay,'API historical model captures are distinct from daily observations; no legacy fallback.');}
    const idx = index(report), date = requestedDay ?? report?.latest?.day ?? idx.source;
    return point(report, idx, date, requestedDays);
  }
  function history(report, { windowDays: requestedDays = windowDays } = {}) {
    const idx = index(report);
    return [...idx.goods.keys()].sort().map(date => point(report, idx, date, requestedDays));
  }
  function frozenPoint(report, date = report?.latest?.day) {
    const idx = index(report), current = idx.goods.get(date);
    const rate = positive(report?.baseNxRate) && positive(current?.cpi) ? report.baseNxRate * current.cpi / 100 : null;
    return idx.source && day(date) && date <= idx.source && positive(rate) && clock(current?.at) && current.at.slice(0, 10) === date ? { available: true, rate, day: date, at: current.at, partial: current.partial === true,
      currentMpi: current.cpi, changePercent: (current.cpi / 100 - 1) * 100, baseNxRate: report.baseNxRate, units: method.units } : failure(date, 'Positive fixed reference NX rate and goods MPI required');
  }
  const key = 'astra-goods-nx-benchmark-mode-v1', explanationKey = 'astra-rolling-benchmark-explanation-v1', daysKey = 'astra-goods-nx-anchor-days-v1', whyThreeKey = 'astra-benchmark-why-three-v1', inflationPhraseKey = 'astra-benchmark-inflation-phrase-v1', modes = new Set(['rolling', 'fixed', 'compare']);
  let mode = 'rolling', windowDays = 7, showExplanation = false, showWhyThree = true, showInflationPhrase = true, controls, note, explanationButton, whyThreeButton, inflationPhraseButton;
  try { const saved = localStorage.getItem(key); if (modes.has(saved)) mode = saved; const days = Number(localStorage.getItem(daysKey)); if (method.allowedWindowDays.includes(days)) windowDays = days; showExplanation = localStorage.getItem(explanationKey) === 'on'; } catch { /* User-approved weekly rolling default; math text stays off. */ }
  try { showWhyThree = localStorage.getItem(whyThreeKey) !== 'off'; showInflationPhrase = localStorage.getItem(inflationPhraseKey) !== 'off'; } catch { /* Concise notes remain on without storage. */ }
  const getState = () => ({ mode, windowDays, showExplanation, showWhyThree, showInflationPhrase });
  let latestApiReport=null;
  function decorateExplanations() {
    if(note&&latestApiReport?.apiCalculationView)note.textContent='API model: latest reported 3-day sale-median reference, linked retrospectively to the frozen November 4 index. Rolling NX = count-weighted daily fixed-NX cash anchor over the previous '+windowDays+' complete UTC source-calendar days × current linked goods index / arithmetic mean linked daily MPI over those same days. All 50 same-capture current goods prices are required; no cross-capture carry or reweighting is used for that current reference. Daily goods indices retain the last qualified daily observation where needed and require at least 80% observed basket weight. Every selected complete anchor day must qualify; no seven-to-three-day fallback. Exact 3-day observation bounds and trade times are unknown. The fixed-anchor option retains the frozen reference NX rate. Smega offers and asks do not enter this model.';

    for (const target of document.querySelectorAll('.hero-benchmark-explanation, [data-nx-model-description]')) {
      target.querySelector('[data-benchmark-inflation-copy]')?.remove();
      if (showInflationPhrase && target.textContent.trim()) {
        const wrapper = document.createElement('span'); wrapper.dataset.benchmarkInflationCopy = '';
        const phrase = document.createElement('strong'); phrase.className = 'benchmark-inflation-phrase'; phrase.textContent = '(amount required to combat inflation)';
        const qualification = document.createElement('small'); qualification.className = 'benchmark-inflation-qualification'; qualification.textContent = 'This describes offsetting the selected basket’s purchasing-power loss, not controlling inflation or meso supply.';
        wrapper.append(' ', phrase, qualification); target.append(wrapper);
      }
      let why = target.nextElementSibling;
      if (!why?.matches('[data-benchmark-why-three]')) { why = document.createElement('p'); why.dataset.benchmarkWhyThree = ''; why.className = 'benchmark-why-three'; target.after(why); }
      why.textContent = 'Why 3 days? A shorter anchor follows recent source evidence sooner, but uses fewer observations and can be noisier than the 7-day anchor. Both use complete source-calendar days; goods-basket weights remain fixed.';
      why.hidden = !showWhyThree || windowDays !== 3 || mode === 'fixed' || !target.textContent.trim();
    }
  }
  let decorationQueued = false;
  function queueDecoration() { if (decorationQueued) return; decorationQueued = true; queueMicrotask(() => { decorationQueued = false; decorateExplanations(); }); }
  document.addEventListener('astramarketsnapshot', event=>{latestApiReport=event.detail;queueDecoration();});
  function headline(report) {
    if(report?.apiCalculationView&&window.AstraApiCalculations)return window.AstraApiCalculations.headline();
    const rolling = calculate(report), fixed = frozenPoint(report), requestedMode = mode;
    if (mode === 'rolling' && rolling.available) return { ...rolling, mode: 'rolling', requestedMode, label: `Rolling-anchor goods NX benchmark · ${windowDays} complete days`, changeLabel: `vs previous ${windowDays} complete source days`, observed: false };
    const fallback = mode === 'rolling';
    return { ...fixed, mode: fallback ? 'fixed_fallback' : mode, requestedMode,
      label: fallback ? 'Reference-week NX benchmark · rolling anchor unavailable' : 'Reference-week goods NX benchmark',
      changeLabel: 'vs fixed reference week', fallbackReason: fallback ? rolling.reason : null, observed: false };
  }
  function series(report) {
    if(report?.apiCalculationView)return (window.AstraApiCalculations?.sourceSeries('nx')||[]).map(s=>({...s,label:s.name}));
    const effective = headline(report).mode, fixed = { id: 'fixed', label: effective === 'fixed_fallback' ? 'Reference-week model · rolling fallback' : 'Reference-week goods NX benchmark', points: [] };
    const idx = index(report);
    if (effective !== 'rolling') for (const point of [...idx.goods.values()].sort((a, b) => a.day.localeCompare(b.day))) {
      const value = positive(report?.baseNxRate) && positive(point?.cpi) ? report.baseNxRate * point.cpi / 100 : null;
      if (idx.source && point.day <= idx.source && positive(value) && clock(point.at) && point.at.slice(0, 10) === point.day) fixed.points.push({ day: point.day, at: point.at, value, partial: point.partial === true });
    }
    if (effective === 'fixed' || effective === 'fixed_fallback') return [fixed];
    const rolling = { id: 'rolling', label: `Prior-${windowDays}-day cash-anchored goods NX benchmark`, points: history(report).filter(point => point.available).map(point => ({ day: point.day, at: point.at, value: point.rate, partial: point.partial, windowDays: point.windowDays, anchorStart: point.startDay, anchorEnd: point.endDay, cashAnchor: point.cashAnchor, meanMpi: point.meanMpi })) };
    return effective === 'compare' ? [fixed, rolling] : [rolling];
  }
  function apply() {
    if (controls) {
      for (const button of controls.querySelectorAll('[data-benchmark-mode]')) button.setAttribute('aria-pressed', String(button.dataset.benchmarkMode === mode));
      for (const button of controls.querySelectorAll('[data-benchmark-days]')) button.setAttribute('aria-pressed', String(Number(button.dataset.benchmarkDays) === windowDays));
      explanationButton.setAttribute('aria-pressed', String(showExplanation)); explanationButton.textContent = showExplanation ? 'Rolling calculation explanation: On' : 'Rolling calculation explanation: Off'; note.hidden = !showExplanation;
      whyThreeButton.setAttribute('aria-pressed', String(showWhyThree)); whyThreeButton.textContent = `Why 3 days note: ${showWhyThree ? 'On' : 'Off'}`;
      inflationPhraseButton.setAttribute('aria-pressed', String(showInflationPhrase)); inflationPhraseButton.textContent = `Inflation parenthetical: ${showInflationPhrase ? 'On' : 'Off'}`;
      note.textContent = `Rolling anchor = the prior ${windowDays} complete source-calendar days’ qualified known-NX cash-item rates, weighted by recorded item count. Multiply this anchor by today’s fixed-goods MPI divided by the arithmetic mean of those ${windowDays} MPI levels. Every anchor day needs at least three cash items with daily count ≥5; all ${windowDays + 1} goods points need ≥80% same-day observed basket weight. Goods MPI keeps its existing dated carry-forward rules. This model reanchors to observed cash composition, supply and demand; it does not remove those effects or produce an executable quote. No fees, smega offers, rolling scanner medians or unknown-NX cosmetics enter this calculation. Early/missing windows stay unavailable; an explicit reference-week fallback is labelled separately.`;
    }
    document.dispatchEvent(new CustomEvent('astrabenchmarkmodechange', { detail: getState() }));
    decorateExplanations(); queueDecoration();
  }
  function setMode(value) {
    if (!modes.has(value)) return false;
    mode = value; try { localStorage.setItem(key, mode); } catch { /* Tab choice remains usable. */ } apply(); return true;
  }
  function setWindowDays(value) { if (!method.allowedWindowDays.includes(value)) return false; windowDays = value; try { localStorage.setItem(daysKey, String(value)); } catch { /* Tab choice remains usable. */ } apply(); return true; }
  window.AstraRollingBenchmark = Object.freeze({ method, calculate, history, frozenPoint, headline, series, getState, setMode, setWindowDays });
  const options = document.getElementById('display-options');
  if (!options || document.getElementById('rolling-benchmark-options')) return;
  controls = document.createElement('fieldset'); controls.id = 'rolling-benchmark-options'; controls.className = 'rolling-benchmark-options'; controls.dataset.previewControls = 'rolling-benchmark';
  const legend = document.createElement('legend'); legend.textContent = 'Goods-based NX model'; controls.append(legend);
  const buttons = document.createElement('div'); buttons.className = 'rolling-benchmark-choices'; buttons.setAttribute('role', 'group'); buttons.setAttribute('aria-label', 'Goods NX benchmark anchor');
  for (const [value, label] of [['rolling', 'Rolling anchor · headline + chart'], ['fixed', 'Fixed reference · revert'], ['compare', 'Compare charts · fixed headline']]) { const button = document.createElement('button'); button.type = 'button'; button.dataset.benchmarkMode = value; button.textContent = label; button.addEventListener('click', () => setMode(value)); buttons.append(button); }
  const days = document.createElement('div'); days.className = 'rolling-benchmark-choices'; days.setAttribute('role', 'group'); days.setAttribute('aria-label', 'Rolling NX anchor complete-day lookback');
  for (const count of [7, 3]) { const button = document.createElement('button'); button.type = 'button'; button.dataset.benchmarkDays = String(count); button.textContent = count === 7 ? 'Previous 7 complete days · week' : 'Previous 3 complete days'; button.addEventListener('click', () => setWindowDays(count)); days.append(button); }
  explanationButton = document.createElement('button'); explanationButton.type = 'button'; explanationButton.setAttribute('aria-controls', 'rolling-benchmark-explanation'); explanationButton.addEventListener('click', () => { showExplanation = !showExplanation; try { localStorage.setItem(explanationKey, showExplanation ? 'on' : 'off'); } catch { /* Local tab still works. */ } apply(); });
  note = document.createElement('p'); note.id = 'rolling-benchmark-explanation'; note.className = 'rolling-benchmark-explanation';
  const caution = document.createElement('small'); caution.textContent = 'Rolling is modelled, not a cash-sale quote. Compare charts keeps the fixed-reference headline; source dates and cash-item pages stay separate.';
  whyThreeButton = document.createElement('button'); whyThreeButton.type = 'button'; whyThreeButton.dataset.benchmarkNoteToggle = 'why-three'; whyThreeButton.addEventListener('click', () => { showWhyThree = !showWhyThree; try { localStorage.setItem(whyThreeKey, showWhyThree ? 'on' : 'off'); } catch {} apply(); });
  inflationPhraseButton = document.createElement('button'); inflationPhraseButton.type = 'button'; inflationPhraseButton.dataset.benchmarkNoteToggle = 'inflation-phrase'; inflationPhraseButton.addEventListener('click', () => { showInflationPhrase = !showInflationPhrase; try { localStorage.setItem(inflationPhraseKey, showInflationPhrase ? 'on' : 'off'); } catch {} apply(); });
  controls.append(buttons, days, explanationButton, caution, note, whyThreeButton, inflationPhraseButton); options.append(controls); apply();
})();

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "rolling-benchmark-preview.js", status: "initialization_failed"}})); } catch {}
}

;
/* Astra source: layout-preview.js */
try {
(() => {
  'use strict';
  if (document.getElementById('banner-layout-options')) return;
  const hero = document.querySelector('.rate-hero');
  const options = document.getElementById('display-options');
  const chart = document.getElementById('main-chart');
  if (!hero || !options || !chart || !hero.querySelector('.hero-copy') || !hero.querySelector('.hero-art')) return;
  let history = document.getElementById('main-history-section');
  if (!history) {
    // Support the previous approved markup without copying the chart or controls.
    const card = chart.closest('.chart-card');
    const comparison = card?.previousElementSibling?.classList.contains('chart-comparison-controls') ? card.previousElementSibling : null;
    const heading = comparison ? comparison.previousElementSibling : card?.previousElementSibling;
    if (!card || !heading?.classList.contains('section-heading') || !heading.querySelector('#range-buttons')) return;
    history = document.createElement('section');
    history.className = 'banner-preview-history';
    card.before(history);
    history.append(heading);
    if (comparison) history.append(comparison);
    history.append(card);
  }
  if (history.contains(hero) || hero.contains(history)) return;
  const origin = document.createComment('Main rate history original position');
  history.before(origin);
  const offers = document.getElementById('smega-section');
  const offersHeading = offers?.querySelector(':scope > .section-heading');
  const offersStats = document.getElementById('smega-stats');
  const offersChart = document.getElementById('smega-offer-chart');
  const canOffer = !!(offersHeading && offersStats?.parentElement === offers && offers.contains(offersChart) && !offers.contains(hero));
  const offersOrigin = document.createComment('Complete offer card original position');
  const offersNote = document.createElement('p'); offersNote.className = 'banner-offers-note';
  offersNote.textContent = 'Offers cannot change the calculated goods-based NX benchmark. This card keeps its source-dated summary and offer history together.';
  if (offers) offers.classList.add('banner-preview-offer-card');
  if (canOffer) offers.before(offersOrigin);
  const slot = document.createElement('div');
  slot.className = 'banner-preview-chart-slot';
  const controls = document.createElement('div');
  controls.id = 'banner-layout-options';
  controls.className = 'banner-layout-options';
  controls.setAttribute('role', 'group');
  controls.setAttribute('aria-label', 'Banner layout');
  const label = document.createElement('span');
  label.textContent = 'Banner layout';
  controls.append(label);
  const buttons = [];
  const key = 'astra-banner-layout';
  const orderKey = 'astra-banner-order';
  let order = 'chart-first';
  const swap = document.createElement('button');
  swap.type = 'button';
  swap.id = 'banner-order-toggle';
  swap.textContent = 'Rate first';
  swap.setAttribute('aria-controls', 'rate-section');
  swap.title = 'Swap the rate and selected chart or offer panel, including their stacked order on smaller screens.';
  const apply = value => {
    const layout = value === 'chart' ? 'chart' : value === 'offers' && canOffer ? 'offers' : 'original';
    const moved = layout === 'chart' ? history.parentElement !== slot : layout === 'offers' ? offers.parentElement !== slot : history.parentNode !== origin.parentNode || (canOffer && offers.parentNode !== offersOrigin.parentNode);
    const reordered = document.body.dataset.bannerOrder !== order;
    if (layout !== 'chart' && history.parentNode !== origin.parentNode) origin.after(history);
    if (canOffer && layout !== 'offers') {
      if (offers.parentNode !== offersOrigin.parentNode) offersOrigin.after(offers);
      offersNote.remove();
    }
    if (layout !== 'original') {
      if (order === 'rate-first') hero.querySelector('.hero-copy').after(slot);
      else hero.prepend(slot);
      if (layout === 'chart' && history.parentElement !== slot) slot.append(history);
      if (layout === 'offers') {
        if (offers.parentElement !== slot) slot.append(offers);
        if (!offers.contains(offersNote)) offers.append(offersNote);
      }
      slot.dataset.bannerPanel = layout;
    } else {
      slot.remove();
    }
    document.body.dataset.bannerLayout = layout;
    document.body.dataset.bannerOrder = order;
    swap.disabled = layout === 'original';
    swap.setAttribute('aria-pressed', String(order === 'rate-first'));
    for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.bannerLayoutChoice === layout));
    if (moved || (reordered && layout !== 'original')) document.dispatchEvent(new CustomEvent('astrabannerlayoutchange', { bubbles: true, detail: { layout, order } }));
  };
  for (const [value, title] of [['original', 'Art banner'], ['chart', 'Chart beside rate'], ['offers', 'Offers beside rate']]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.bannerLayoutChoice = value;
    button.textContent = title;
    if (value === 'offers' && !canOffer) { button.disabled = true; button.title = 'The offer summary is unavailable in this page.'; }
    button.setAttribute('aria-controls', 'rate-section');
    button.addEventListener('click', () => {
      apply(value);
      try { localStorage.setItem(key, value); } catch { /* Choice remains usable with blocked storage. */ }
    });
    controls.append(button);
    buttons.push(button);
  }
  swap.addEventListener('click', () => {
    order = order === 'rate-first' ? 'chart-first' : 'rate-first';
    apply(document.body.dataset.bannerLayout);
    try { localStorage.setItem(orderKey, order); } catch { /* Choice remains usable with blocked storage. */ }
  });
  controls.append(swap);
  const note = document.createElement('small');
  note.textContent = 'Saved in this browser only.';
  controls.append(note);
  options.append(controls);
  let saved;
  try { saved = localStorage.getItem(key); } catch { /* Preserve the original layout. */ }
  try { if (localStorage.getItem(orderKey) === 'rate-first') order = 'rate-first'; } catch { /* Use chart first. */ }
  apply(saved);
})();

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "layout-preview.js", status: "initialization_failed"}})); } catch {}
}

;
/* Astra source: chart-interaction.js */
try {
(() => {
  'use strict';
  if (document.documentElement.dataset.chartInspectorLoaded) return;
  document.documentElement.dataset.chartInspectorLoaded = 'true';
  const NS = 'http://www.w3.org/2000/svg';
  const states = new Set();
  const managed = new WeakSet();
  let serial = 0;
  let queued = false;
  const number = new Intl.NumberFormat(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const displayValue = value => number.format(Math.abs(value) < .05 ? 0 : value);
  // Legacy labels lack numeric metadata. Round only decimal values with a known
  // unit (or at the end), leaving dates, source hours and explanatory text intact.
  const legacyLabel = text => text.replace(/([+-]?(?:\d{1,3}(?:,\d{3})+|\d+)\.\d+)(?=\s*(?:%|mesos\b|NX\b|index points\b|units\b|$))/g,
    raw => displayValue(Number(raw.replaceAll(',', ''))));

  function box(svg) {
    const values = (svg.getAttribute('viewBox') || '').trim().split(/[ ,]+/).map(Number);
    return values.length === 4 && values.every(Number.isFinite) && values[2] > 0 && values[3] > 0
      ? { x: values[0], y: values[1], width: values[2], height: values[3] }
      : { x: 0, y: 0, width: svg.clientWidth || 1, height: svg.clientHeight || 1 };
  }
  function mapping(svg) {
    const rect = svg.getBoundingClientRect();
    const view = box(svg);
    let sx = rect.width / view.width;
    let sy = rect.height / view.height;
    let ox = 0;
    let oy = 0;
    const aspect = svg.getAttribute('preserveAspectRatio') || 'xMidYMid meet';
    if (!aspect.includes('none')) {
      sx = sy = aspect.includes('slice') ? Math.max(sx, sy) : Math.min(sx, sy);
      ox = (rect.width - view.width * sx) * (aspect.includes('xMin') ? 0 : aspect.includes('xMax') ? 1 : .5);
      oy = (rect.height - view.height * sy) * (aspect.includes('YMin') ? 0 : aspect.includes('YMax') ? 1 : .5);
    }
    return { rect, view, sx: sx || 1, sy: sy || 1, ox, oy };
  }
  function localPoint(svg, clientX, clientY) {
    try {
      const matrix = svg.getScreenCTM?.();
      if (matrix && svg.createSVGPoint) {
        const point = svg.createSVGPoint();
        point.x = clientX; point.y = clientY;
        const local = point.matrixTransform(matrix.inverse());
        if (Number.isFinite(local.x) && Number.isFinite(local.y)) return local;
      }
    } catch { /* Use viewBox mapping when native SVG geometry is unavailable. */ }
    const m = mapping(svg);
    return { x: (clientX - m.rect.left - m.ox) / m.sx + m.view.x,
      y: (clientY - m.rect.top - m.oy) / m.sy + m.view.y };
  }
  function label(circle) {
    const d = circle.dataset;
    const title = circle.querySelector('title');
    let text;
    if (d.chartValue !== undefined) {
      const date = d.chartDateLabel || d.chartDate || '';
      const precision = d.chartDatePrecision === 'day' ? 'source time unspecified' : '';
      const value = d.chartValue.trim() ? Number(d.chartValue) : NaN;
      const displayCandidate=typeof d.chartDisplayValue==='string'&&d.chartDisplayValue.length<=40&&/^(?:\d{1,3}(?:,\d{3})*|\d+)\.\d$/.test(d.chartDisplayValue)?d.chartDisplayValue:null;
      const exactDisplay=displayCandidate!==null&&Number.isFinite(value)&&value>=0&&Math.abs(Number(displayCandidate.replaceAll(',',''))-value)<=.05+Math.abs(value)*Number.EPSILON*2?displayCandidate:null;
      const measurement = Number.isFinite(value)
        ? `${exactDisplay??displayValue(value)}${d.chartUnit ? ' ' + d.chartUnit : ''}` : 'unavailable';
      text = [d.chartSeries, date, precision, measurement, d.chartNote].filter(Boolean).join(' · ');
    } else text = legacyLabel(d.chartLabel || title?.textContent.trim() || '');
    if (title && title.textContent !== text) title.textContent = text;
    return text;
  }
  function enhance(svg) {
    if (managed.has(svg)) return;
    const points = [...svg.querySelectorAll('circle')].map(circle => ({
      x: Number(circle.getAttribute('cx')), y: Number(circle.getAttribute('cy')), label: label(circle),
    })).filter(point => Number.isFinite(point.x) && Number.isFinite(point.y) && point.label)
      .sort((a, b) => a.x - b.x || a.y - b.y);
    if (!points.length) return;
    managed.add(svg);
    const host = svg.closest('.chart') || svg.parentElement;
    if (!host) return;
    host.classList.add('chart-inspector-host');
    svg.classList.add('chart-inspector-ready');
    if (!svg.hasAttribute('tabindex')) svg.setAttribute('tabindex', '0');
    const chartName = svg.getAttribute('aria-label') || host.getAttribute('aria-label') || svg.querySelector('title')?.textContent || 'Chart';
    if (!svg.hasAttribute('aria-label') && !svg.hasAttribute('aria-labelledby')) svg.setAttribute('aria-label', chartName);
    const id = `chart-inspector-${++serial}`;
    const ui = document.createElement('div');
    ui.className = 'chart-inspector-ui';
    const toggle = document.createElement('button');
    toggle.type = 'button'; toggle.className = 'chart-inspector-toggle';
    toggle.textContent = 'Follow: on'; toggle.setAttribute('aria-pressed', 'true');
    toggle.setAttribute('aria-label', `${chartName}: follow nearest observation`);
    const tooltip = document.createElement('output');
    tooltip.id = id; tooltip.className = 'chart-inspector-tooltip'; tooltip.hidden = true;
    tooltip.setAttribute('role', 'status'); tooltip.setAttribute('aria-live', 'polite');
    const instructions = document.createElement('span');
    instructions.id = `${id}-help`; instructions.className = 'chart-inspector-help';
    instructions.textContent = 'Move across the chart to inspect a recorded point. Arrow keys move between points; Home and End jump to the edges. Click or tap to pin or unpin; Escape clears the selection.';
    const described = svg.getAttribute('aria-describedby');
    svg.setAttribute('aria-describedby', [described, instructions.id, id].filter(Boolean).join(' '));
    ui.append(toggle, tooltip, instructions); host.append(ui);
    const guide = document.createElementNS(NS, 'g');
    guide.classList.add('chart-inspector-guide'); guide.setAttribute('aria-hidden', 'true');
    guide.style.display = 'none';
    const line = document.createElementNS(NS, 'line');
    const mark = document.createElementNS(NS, 'circle');
    mark.setAttribute('r', '5');
    guide.append(line, mark); svg.append(guide);
    let index = -1;
    let pinned = false;
    let follow = true;
    const state = { svg, ui, host };
    states.add(state);
    const hide = () => {
      index = -1; pinned = false; guide.style.display = 'none'; tooltip.hidden = true;
      host.classList.remove('chart-inspector-pinned');
    };
    const show = next => {
      index = Math.max(0, Math.min(points.length - 1, next));
      const point = points[index];
      const clip = svg.querySelector('clipPath rect');
      const view = box(svg);
      const top = clip ? Number(clip.getAttribute('y')) : view.y;
      const bottom = clip ? top + Number(clip.getAttribute('height')) : view.y + view.height;
      line.setAttribute('x1', point.x); line.setAttribute('x2', point.x);
      line.setAttribute('y1', top); line.setAttribute('y2', bottom);
      mark.setAttribute('cx', point.x); mark.setAttribute('cy', point.y);
      guide.style.display = ''; tooltip.hidden = false;
      const text = `${point.label}${pinned ? ' · pinned' : ''}`;
      if (tooltip.textContent !== text) tooltip.textContent = text;
      host.classList.toggle('chart-inspector-pinned', pinned);
      const m = mapping(svg);
      const hostRect = host.getBoundingClientRect();
      const left = m.rect.left - hostRect.left + m.ox + (point.x - m.view.x) * m.sx;
      const width = host.clientWidth || hostRect.width || m.rect.width;
      const tipWidth = tooltip.offsetWidth || Math.min(300, width - 16);
      tooltip.style.left = `${Math.max(8, Math.min(left + 12, width - tipWidth - 8))}px`;
    };
    const nearest = event => {
      const at = localPoint(svg, event.clientX, event.clientY);
      let best = 0; let dx = Infinity; let dy = Infinity;
      points.forEach((point, i) => {
        const distanceX = Math.abs(point.x - at.x);
        const distanceY = Math.abs(point.y - at.y);
        if (distanceX < dx - 1e-6 || (Math.abs(distanceX - dx) <= 1e-6 && distanceY < dy)) {
          best = i; dx = distanceX; dy = distanceY;
        }
      });
      return best;
    };
    svg.addEventListener('pointermove', event => {
      if (follow && !pinned && event.pointerType !== 'touch') show(nearest(event));
    });
    svg.addEventListener('pointerleave', () => { if (!pinned) hide(); });
    svg.addEventListener('click', event => {
      const next = nearest(event);
      pinned = !(pinned && index === next);
      show(next);
      svg.focus({ preventScroll: true });
    });
    svg.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); hide(); return; }
      let next;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = index < 0 ? 0 : index + 1;
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = index < 0 ? points.length - 1 : index - 1;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = points.length - 1;
      else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault(); pinned = !pinned; show(index < 0 ? 0 : index); return;
      } else return;
      event.preventDefault(); show(next);
    });
    svg.addEventListener('blur', () => { if (!pinned) hide(); });
    toggle.addEventListener('click', () => {
      follow = !follow;
      toggle.textContent = `Follow: ${follow ? 'on' : 'off'}`;
      toggle.setAttribute('aria-pressed', String(follow));
      hide();
    });
  }
  function scan() {
    queued = false;
    for (const state of states) {
      if (!state.svg.isConnected) {
        state.ui.remove(); state.host.classList.remove('chart-inspector-pinned'); states.delete(state);
      }
    }
    document.querySelectorAll('.chart svg, svg[data-chart-inspector]').forEach(enhance);
  }
  const observer = new MutationObserver(() => {
    if (!queued) { queued = true; queueMicrotask(scan); }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  scan();
})();

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "chart-interaction.js", status: "initialization_failed"}})); } catch {}
}

;
/* Astra source: market-highlights.js */
try {
(() => {
  'use strict';
  const options = document.getElementById('display-options');
  const navigation = document.querySelector('.nav-wrap');
  if (!options || !navigation || document.getElementById('market-highlights')) return;
  const key = 'astra-market-highlights-v1';
  let enabled = true, paused = false, report, calculationDetail = false, showPublication = false, showContext = false, abbreviations = true;
  try { enabled = localStorage.getItem(key) !== 'off'; } catch { /* Default On without persistent storage. */ }
  try { abbreviations = localStorage.getItem('astra-highlights-abbreviations-v1') !== 'off'; } catch { /* Compact helpers default On. */ }
  const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const control = make('div', 'hero-layout-options market-highlights-options');
  control.setAttribute('role', 'group'); control.setAttribute('aria-label', 'Header market highlights');
  const toggle = make('button'); toggle.type = 'button'; toggle.setAttribute('aria-controls', 'market-highlights');
  control.append(toggle, make('small', '', 'Dated aggregates, not a live sales tape. Saved in this browser only.'));
  options.append(control);
  const panel = make('section', 'market-highlights'); panel.id = 'market-highlights';
  panel.setAttribute('aria-label', 'Dated market highlights');
  const heading = make('div', 'market-highlights-heading');
  const publication = make('span', 'market-highlights-publication');
  publication.id='market-highlights-source-publication';publication.hidden=true;
  const pause = make('button', 'market-highlights-pause'); pause.type = 'button';
  pause.setAttribute('aria-controls', 'market-highlights-track');
  heading.append(make('strong', '', 'Did you know?'), publication, pause);
  const viewport = make('div', 'market-highlights-viewport');
  const track = make('div', 'market-highlights-track'); track.id = 'market-highlights-track';
  viewport.append(track); panel.append(heading, viewport);
  navigation.after(panel);
  const page = make('section', 'view highlights-page'); page.id = 'view-highlights'; page.hidden = true;
  page.setAttribute('aria-labelledby', 'highlights-title');
  const pageHeading = make('div', 'page-heading'), pageHeadingCopy = make('div');
  const title = make('h1', '', 'Highlights & Activity'); title.id = 'highlights-title';
  pageHeadingCopy.append(make('p', 'eyebrow', 'DATED AGGREGATES / VISIBLE COVERAGE'), title,
    make('p', '', 'Standout observations in the fixed basket, plus hourly NX offer activity.'));
  pageHeading.append(pageHeadingCopy);
  const pagePublication = make('p', 'highlights-page-publication');
  pagePublication.id='highlights-source-publication';pagePublication.hidden=true;
  const apiEvidenceScope=make('p','highlights-api-scope');apiEvidenceScope.hidden=true;
  const cards = make('div', 'highlights-fact-grid');
  cards.id = 'highlights-fact-grid';
  const transactionNote = make('p', 'highlights-evidence-note', 'Individual-transaction trivia is pending: this snapshot contains no qualified individual transaction records. A daily median, recorded count or high/low price cannot identify a largest completed sale.');
  const activity = make('section', 'highlights-activity');
  const activityTitle = make('h2', '', 'Hourly NX offer activity'); activityTitle.id = 'highlights-activity-title';
  activity.setAttribute('aria-labelledby', activityTitle.id);
  const activityScope = make('p', 'highlights-activity-scope');
  const activityStats = make('div', 'highlights-activity-stats');
  const countCard = make('article', 'chart-card hourly-history-card highlights-count-card');
  const countTitle = make('h3', '', 'Poster counts by source hour');
  const countLegend = make('p', 'highlights-count-legend', 'Gold: sellers posting · Mint: buyers posting. Gaps mean missing or conflicting counts, not zero activity.');
  const countChart = make('div', 'highlights-count-chart');
  countChart.setAttribute('role', 'img'); countChart.setAttribute('aria-label', 'Last 24 source-hour seller and buyer poster counts; accessible values follow in the table');
  countCard.append(countTitle, countLegend, countChart);
  const activityTable = make('div', 'table-wrap highlights-activity-table');
  activity.append(activityTitle, activityScope, activityStats, countCard, activityTable,
    make('p', 'highlights-evidence-note', 'These are source-published poster counts for each UTC hour, not completed trades, unique people across hours, meso turnover or total server activity. A poster can appear in multiple hours or on both sides. Missing buckets and sides are left missing.'));
  const overview = make('p', 'highlights-overview-link'), overviewLink = make('a', '', 'View estimated meso turnover on Overview →');
  overviewLink.href = '#volume-title'; overview.append(overviewLink);
  page.append(pageHeading, pagePublication,apiEvidenceScope, cards, transactionNote, activity, overview);
  const calculationControls=make('div','highlights-detail-controls'),calculationToggle=make('button','','Show calculation details');calculationControls.dataset.previewControls='true';
  calculationToggle.type='button';calculationToggle.setAttribute('aria-pressed','false');calculationToggle.setAttribute('aria-controls','highlights-fact-grid market-highlights-track');calculationControls.append(calculationToggle);page.append(calculationControls);
  const publicationToggle=make('button','','Show source publication');publicationToggle.type='button';publicationToggle.setAttribute('aria-pressed','false');publicationToggle.setAttribute('aria-controls','highlights-source-publication market-highlights-source-publication');calculationControls.append(publicationToggle);
  const contextToggle=make('button','','Show Wolbi context');contextToggle.type='button';contextToggle.setAttribute('aria-pressed','false');contextToggle.setAttribute('aria-controls','highlights-fact-grid market-highlights-track');calculationControls.append(contextToggle);
  const abbreviationToggle=make('button');abbreviationToggle.type='button';abbreviationToggle.dataset.highlightsAbbreviations='true';abbreviationToggle.setAttribute('aria-controls','highlights-fact-grid market-highlights-track');
  document.getElementById('content').append(page);
  const navLink = make('a', 'nav-link', 'Highlights & Activity'); navLink.href = '#highlights';
  const nav = navigation.querySelector('nav'), fallback = nav.querySelector('.fallback-link');
  if (fallback) fallback.before(navLink); else nav.append(navLink);
  document.getElementById('volume-title')?.setAttribute('tabindex', '-1');
  const number = value => value.toLocaleString('en-US', { maximumFractionDigits: 0 });
  const positive = value => Number.isFinite(value) && value > 0;
  const day = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
  const largest = (rows, key) => rows.filter(row => Number.isFinite(row[key])).sort((a, b) => b[key] - a[key] || String(a.slug).localeCompare(String(b.slug)))[0];
  function legacyHighlights(data) {
    const rows = (data.rows || []).filter(row => row.slug && /^[a-z0-9][a-z0-9-]*$/.test(row.slug) && row.name && day(row.priceDay) && positive(row.price));
    const sourceDay=day(String(data.sourceUpdatedAt||'').slice(0,10)),windowDays=Math.round((Date.parse(data.recentEndExclusive)-Date.parse(data.recentStart))/86400000);
    const items = [], add = (row, type, label, value, date, detail = '', direction = 'neutral', numericValue = null) => {
      if (!row)return;
      const carried=sourceDay&&row.priceDay<sourceDay,frame=type==='turnover'||type==='volume'?`${windowDays>0?windowDays+'-day window':'Recorded activity window'} · complete source-calendar days`:type==='change'?'Starting price level → latest qualifying price'+(carried?' · earlier price carried':''):carried?'Earlier qualifying daily observation':'Latest source-day observation';
      const provenance=type==='change'?`Reference week ${data.baseStart}–${data.baseEnd} · ${date}`:date;
      const essential=type==='context'?detail:'';
      const displayDate=type==='turnover'||type==='volume'?date:row.priceDay;
      const compact=Number.isFinite(numericValue)&&Math.abs(numericValue)>=1000?new Intl.NumberFormat('en-US',{notation:'compact',compactDisplay:'short',maximumFractionDigits:1}).format(numericValue):null;
      items.push({ slug:row.slug,name:row.name,type,label,value,compact,date:provenance,displayDate,detail,direction,frame,essential,summary:`${label}: ${row.name} · ${value} · ${displayDate} · ${frame}${essential?' · '+essential:''}`,text:`${label}: ${row.name} · ${value} · ${provenance}${detail?' · '+detail:''}` });
    };
    const expensive = largest(rows.filter(row => positive(row.quantity)), 'price');
    if (expensive) add(expensive, 'median', 'Largest basket daily median', `${number(expensive.price)} mesos / ${expensive.unit || 'unit'}`, `${expensive.priceDay} · ${number(expensive.quantity)} recorded volume`, 'Daily median, not an individual sale', 'neutral', expensive.price);
    const moved = rows.filter(row => Number.isFinite(row.changeBase)).sort((a, b) => Math.abs(b.changeBase) - Math.abs(a.changeBase) || String(a.slug).localeCompare(String(b.slug)))[0];
    if (moved) add(moved, 'change', 'Largest basket move vs reference week', `${moved.changeBase >= 0 ? '+' : ''}${moved.changeBase.toFixed(1)}%`, `price dated ${moved.priceDay}`, 'Change from fixed reference prices', moved.changeBase > 0 ? 'up' : moved.changeBase < 0 ? 'down' : 'flat');
    const end = day(data.recentEndExclusive), through = end ? new Date(Date.parse(end + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10) : null;
    if (day(data.recentStart) && through) {
      const scope = `${data.recentStart}–${through}`;
      const turnover = largest(rows.filter(row => positive(row.recentTurnoverProxy)), 'recentTurnoverProxy');
      if (turnover) add(turnover, 'turnover', 'Largest basket turnover proxy', `${number(turnover.recentTurnoverProxy)} mesos`, scope, 'daily median × recorded volume', 'neutral', turnover.recentTurnoverProxy);
      const volume = largest(rows.filter(row => positive(row.recentQuantity)), 'recentQuantity');
      if (volume) add(volume, 'volume', 'Most recorded basket volume', `${number(volume.recentQuantity)} recorded units/count`, scope, '', 'neutral', volume.recentQuantity);
    }
    const wolbi = (data.contextItems || []).find(row => row.slug === 'wolbi-throwing-stars' && day(row.priceDay) && positive(row.price) && row.notIndexed === true && row.weight === 0);
    if (showContext && wolbi) add(wolbi, 'context', 'Wolbi* context', `${number(wolbi.price)} mesos / ${wolbi.unit || 'unit'} daily median`, wolbi.priceDay, 'zero MPI weight · item-specific supply caveat, not broad deflation', 'neutral', wolbi.price);
    return items;
  }
  const sourceDay=value=>{try{return !!day(value)&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;}catch{return false;}};
  const shiftDay=(value,n)=>new Date(Date.parse(value+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
  function receiptClock(value){
    if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))return 'Unknown';
    let zone=document.getElementById('display-timezone')?.value||'UTC';try{new Intl.DateTimeFormat('en-US',{timeZone:zone});}catch{zone='UTC';}
    const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',timeZoneName:'short'}).formatToParts(new Date(value)).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
    return `${parts.month}-${parts.day}-${parts.year} ${parts.hour}:${parts.minute}:${parts.second} ${parts.timeZoneName}`;
  }
  function apiHighlights(data){
    const view=data?.apiCalculationView,items=data?.apiDailyItems,latest=view?.daily?.latestDay;
    if(!view||!sourceDay(latest)||!Array.isArray(data.rows)||data.rows.length!==50||new Set(data.rows.map(r=>r.slug)).size!==50||new Set(data.rows.map(r=>r.currentApiReference?.itemId)).size!==50||!Array.isArray(items)||items.length!==79||items.filter(i=>i.role==='goods').length!==50||items.filter(i=>i.role==='cash').length!==29||new Set(items.map(i=>i.itemId)).size!==79||new Set(items.map(i=>i.slug)).size!==79)return [];
    const rows=[];
    for(const row of data.rows){const item=items.find(i=>i.role==='goods'&&i.slug===row.slug&&i.name===row.name&&i.itemId===row.currentApiReference?.itemId);if(!item||!Array.isArray(item.points)||item.points.length>31)continue;const points=new Map();let valid=true;
      for(const p of item.points){const median=p?.medianUnitPriceLexeme,known=typeof median==='string'&&median.length<=160&&/^\d+(?:\.\d+)?$/.test(median)&&Number.isFinite(Number(median))&&Number(median)<=Number.MAX_SAFE_INTEGER;if(!p||!sourceDay(p.day)||points.has(p.day)||median!==null&&!known||!Number.isSafeInteger(p.recordedSalesCount)||p.recordedSalesCount<0||!Number.isSafeInteger(p.reportedUnitCount)||p.reportedUnitCount<0||typeof p.partialCalendarDay!=='boolean'||p.qualified!==(known&&Number(median)>0&&p.recordedSalesCount>=5)||!Number.isFinite(Date.parse(p.source?.capturedAt))||p.linkedPrice!==null&&!positive(p.linkedPrice)){valid=false;break;}points.set(p.day,p);}
      if(valid)rows.push({...row,points});
    }
    const out=[],latestRows=rows.filter(r=>r.points.get(latest)?.qualified),days=Array.from({length:7},(_,i)=>shiftDay(latest,i-7)),completeRows=rows.filter(r=>days.every(d=>r.points.has(d)&&!r.points.get(d).partialCalendarDay));
    const add=(r,type,label,value,points,numericValue,eligibleCount)=>{if(!r)return;const captures=points.map(p=>p.source.capturedAt).sort((a,b)=>Date.parse(a)-Date.parse(b)),partial=points.some(p=>p.partialCalendarDay),frame=`Actual API daily basis · ${type==='api-count'||type==='api-proxy'?'previous 7 complete source-calendar days':partial?'partial API source day':'completed source-calendar day'} · ${eligibleCount}/50 goods with required evidence`,date=type==='api-count'||type==='api-proxy'?`${days[0]}–${days.at(-1)}`:latest,detail=`Original daily retrievals ${receiptClock(captures[0])}–${receiptClock(captures.at(-1))}; source days stay UTC; calendar cutoff does not prove 24 scanned hours. ${type==='api-proxy'?'Sum of daily median × reported sales count; not exact turnover. ':''}${type==='api-change'?'Frozen linked base; quality/rolls not constant. ':''}Counts are not verified physical units or individual trades.`;
      out.push({slug:r.slug,name:r.name,type,label,value,compact:Number.isFinite(numericValue)&&Math.abs(numericValue)>=1000?new Intl.NumberFormat('en-US',{notation:'compact',compactDisplay:'short',maximumFractionDigits:1}).format(numericValue):null,date,displayDate:date,detail,direction:'neutral',frame,essential:'',summary:`${label}: ${r.name} · ${value} · ${date} · ${frame}`,text:`${label}: ${r.name} · ${value} · ${date} · ${frame} · ${detail}`,numericValue});};
    const median=largest(latestRows.map(r=>({...r,observedMedian:Number(r.points.get(latest).medianUnitPriceLexeme)})),'observedMedian');add(median,'api-median','Largest covered API goods daily median',median?`${number(median.observedMedian)} mesos / source unit`:'',median?[median.points.get(latest)]:[],median?.observedMedian,latestRows.length);
    const changedRows=latestRows.filter(r=>positive(r.basePrice)&&positive(r.points.get(latest).linkedPrice)).map(r=>({...r,dailyLinkedChange:100*(r.points.get(latest).linkedPrice/r.basePrice-1)})).filter(r=>Number.isFinite(r.dailyLinkedChange)),changed=changedRows.sort((a,b)=>Math.abs(b.dailyLinkedChange)-Math.abs(a.dailyLinkedChange)||a.slug.localeCompare(b.slug))[0];add(changed,'api-change','Largest covered API daily linked move',changed?`${changed.dailyLinkedChange>=0?'+':''}${changed.dailyLinkedChange.toFixed(1)}%`:'',changed?[changed.points.get(latest)]:[],changed?.dailyLinkedChange,changedRows.length);
    const activity=completeRows.map(r=>{let count=0,proxy=0,priced=true;for(const d of days){const p=r.points.get(d);count+=p.recordedSalesCount;if(!p.qualified)priced=false;else proxy+=Number(p.medianUnitPriceLexeme)*p.recordedSalesCount;}return {...r,count:Number.isSafeInteger(count)?count:null,proxy:priced&&Number.isFinite(proxy)&&proxy<=Number.MAX_SAFE_INTEGER?proxy:null};});
    const countRows=activity.filter(r=>Number.isFinite(r.count)),proxyRows=activity.filter(r=>Number.isFinite(r.proxy));
    const count=largest(countRows,'count');add(count,'api-count','Most covered API goods reported sales',count?`${number(count.count)} reported sales counts`:'',count?days.map(d=>count.points.get(d)):[],count?.count,countRows.length);
    const proxy=largest(proxyRows,'proxy');add(proxy,'api-proxy','Largest covered API goods turnover proxy',proxy?`${number(proxy.proxy)} mesos proxy`:'',proxy?days.map(d=>proxy.points.get(d)):[],proxy?.proxy,proxyRows.length);
    return out;
  }
  function highlights(data){
    if(!data?.apiCalculationView)return legacyHighlights(data);
    const legacy=legacyHighlights({...data,rows:Array.isArray(data.retainedLegacyRows)?data.retainedLegacyRows:[]}).map(item=>({...item,label:'Retained source · '+item.label,frame:'Retained legacy source · '+item.frame,summary:'Retained legacy source · '+item.summary,text:'Retained legacy source · '+item.text}));
    return [...apiHighlights(data),...legacy];
  }
  function highlightGraphic(item, includeKind, headingLevel) {
    const graphic = make('span', 'market-highlight-graphic'), image = make('img', 'market-highlight-sprite');
    image.alt = ''; image.setAttribute('aria-hidden', 'true'); image.width = image.height = 42; image.loading = 'lazy'; image.decoding = 'async';
    const fallback = 'assets/' + item.slug + '.svg', candidate = report?.spriteMap?.[item.slug];
    const src = typeof candidate === 'string' && /^assets\/[a-z0-9][a-z0-9._-]*\.(?:png|svg|webp)$/.test(candidate) ? candidate : fallback;
    image.addEventListener('error', () => { if (image.getAttribute('src') !== fallback) image.src = fallback; else image.hidden = true; }); image.src = src;
    const copy = make('span', 'market-highlight-copy'), fact = make('span', 'market-highlight-fact'),titleLine=make('span','market-highlight-title-line'),valueLine=make('span','market-highlight-value-line');
    if(headingLevel){titleLine.setAttribute('role','heading');titleLine.setAttribute('aria-level',String(headingLevel));}
    titleLine.append(make('strong','market-highlight-headline',item.label));
    valueLine.append(make('span','market-highlight-item-name',item.name),make('span','market-highlight-value',' · '+item.value));
    if(abbreviations&&item.compact)valueLine.append(make('span','market-highlight-abbreviation','('+item.compact+')'));
    if(item.direction!=='neutral')valueLine.append(make('span','market-highlight-direction',item.direction==='up'?'↑ Increased':item.direction==='down'?'↓ Decreased':'→ Unchanged'));fact.append(titleLine,valueLine);
    const dates=make('small','market-highlight-dates');dates.append(document.createTextNode('('),make('strong','market-highlight-date',item.displayDate),make('span','',' · '+item.frame+(item.essential?' · '+item.essential:'')));
    const details=make('span','market-highlight-details',' · '+item.date+(item.detail?' · '+item.detail:''));details.hidden=!calculationDetail;dates.append(details,document.createTextNode(')'));
    copy.append(fact,dates);graphic.title=item.text;graphic.append(image,copy);return graphic;
  }
  function utc(value) {
    const time = Date.parse(value);
    return Number.isFinite(time) ? new Date(time).toISOString().replace('T', ' ').replace(/:00\.000Z$/, ' UTC').replace(/\.000Z$/, ' UTC') : 'Unavailable';
  }
  function hourlyActivity(data) {
    const source = data.smegaSource?.sourceUrl;
    const points = (data.smega || []).filter(point => source && point.sourceUrl === source && point.aggregation === 'source_published_hourly'
      && ['buy', 'sell'].includes(point.side) && Number.isFinite(Date.parse(point.at)));
    if (!points.length) return [];
    const end = Math.max(...points.map(point => Date.parse(point.at))), buckets = new Map();
    for (const point of points) {
      const time = Date.parse(point.at); if (time <= end - 24 * 3600000) continue;
      const at = new Date(time).toISOString(), count = point.sampleCount ?? point.distinctSenders;
      let bucket = buckets.get(at); if (!bucket) { bucket = { at, partial: false, conflicts: new Set() }; buckets.set(at, bucket); }
      bucket.partial ||= !!point.partial;
      if (!Number.isInteger(count) || count < 0) continue;
      if (bucket[point.side] !== undefined && bucket[point.side] !== count) bucket.conflicts.add(point.side);
      else bucket[point.side] = count;
    }
    return [...buckets.values()].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).map(bucket => {
      for (const side of bucket.conflicts) delete bucket[side];
      return bucket;
    });
  }
  function drawPage() {
    if (!report) return;
    apiEvidenceScope.hidden=!report.apiCalculationView;
    if(report.apiCalculationView){const v=report.apiCalculationView;apiEvidenceScope.textContent=`API facts cover only the fixed 50 goods, using actual UTC daily aggregates through ${sourceDay(v.daily?.latestDay)?v.daily.latestDay:'an unavailable source day'}. Daily publication ${receiptClock(v.clocks?.dailyPublisher)}; original daily retrieval ${receiptClock(v.clocks?.dailyCapture)}. A latest partial source day is identified on its facts; prior-week facts require all seven prior calendar days per ranked item. These are not the current 3-day reference or a full-market ranking. Retained legacy facts keep their separate original dates.`;}
    pagePublication.textContent = 'Daily source publication: ' + utc(report.sourceUpdatedAt) + '. Item dates and the activity capture below are separately dated.';
    pageHeading.title=pagePublication.textContent;pagePublication.hidden=!showPublication;
    cards.replaceChildren();
    const items = highlights(report);
    for (const item of items) {
      const card = make('article', 'panel highlights-fact'); card.dataset.highlightType = item.type; card.dataset.direction = item.direction;
      const link = make('a'); link.href = '#item/' + encodeURIComponent(item.slug); link.setAttribute('aria-label', item.summary);link.title=item.text;link.append(highlightGraphic(item, true, 2));
      card.append(link); cards.append(card);
    }
    if (!items.length) cards.append(make('p', 'empty', 'No qualified dated highlights in this snapshot.'));
    const hours = hourlyActivity(report), latest = hours[0], earliest = hours.at(-1);
    drawCountChart(hours);
    activityScope.textContent = hours.length
      ? `Last 24 source hours · as of ${utc(latest.at)} · ${hours.length} / 24 buckets retained. Offer capture: ${utc(report.smegaSource?.capturedAt)}.${calculationDetail?' Exact retained interval: '+utc(earliest.at)+' – '+utc(latest.at)+'.':''}`
      : 'No source-published hourly offer counts are available in this snapshot.';
    activityScope.title=hours.length?`Exact retained interval: ${utc(earliest.at)} – ${utc(latest.at)}. Offer capture: ${utc(report.smegaSource?.capturedAt)}.`:'';
    activityStats.replaceChildren();
    for (const [side, label] of [['sell', 'Seller poster-hour appearances'], ['buy', 'Buyer poster-hour appearances']]) {
      const available = hours.filter(hour => Number.isInteger(hour[side]));
      const stat = make('article', 'panel');
      stat.append(make('span', '', label), make('strong', '', available.length ? number(available.reduce((sum, hour) => sum + hour[side], 0)) : '—'),
        make('small', '', available.length + ' source-hour counts · not unique people'));
      activityStats.append(stat);
    }
    activityTable.replaceChildren();
    if (!hours.length) { activityTable.append(make('p', 'empty', 'No hourly buckets to display.')); return; }
    const table = make('table'), caption = make('caption', '', 'Published poster counts by source hour · UTC'), head = make('thead'), headRow = make('tr'), body = make('tbody');
    for (const label of ['Source hour · UTC', 'Sellers posting', 'Buyers posting', 'Coverage']) { const th = make('th', '', label); th.scope = 'col'; headRow.append(th); }
    head.append(headRow);
    for (const hour of hours) {
      const row = make('tr'); row.dataset.sourceHour = hour.at;
      const missing = ['sell', 'buy'].filter(side => !Number.isInteger(hour[side]));
      const coverage = [hour.partial ? 'Partial source bucket' : 'Published hourly bucket', missing.length ? 'missing ' + missing.map(side => side === 'sell' ? 'seller count' : 'buyer count').join(' and ') : '', hour.conflicts.size ? 'conflicting counts omitted' : ''].filter(Boolean).join(' · ');
      for (const text of [utc(hour.at), Number.isInteger(hour.sell) ? number(hour.sell) : '—', Number.isInteger(hour.buy) ? number(hour.buy) : '—', coverage]) row.append(make('td', '', text));
      body.append(row);
    }
    table.append(caption, head, body); activityTable.append(table);
  }
  function drawCountChart(hours) {
    countChart.replaceChildren();if(!hours.length){countChart.append(make('p','empty','No source-published hourly counts to plot.'));return;}
    const ns='http://www.w3.org/2000/svg',svgNode=(tag,attrs,text)=>{const node=document.createElementNS(ns,tag);for(const [key,value] of Object.entries(attrs||{}))node.setAttribute(key,String(value));if(text!==undefined)node.textContent=text;return node;};
    const W=Math.max(320,Math.min(countChart.clientWidth||700,720)),H=264,L=48,R=20,T=54,B=100,plotW=W-L-R,plotH=H-T-B,end=Date.parse(hours[0].at),start=end-23*3600000,slot=plotW/24;
    const max=Math.max(1,...hours.flatMap(hour=>['sell','buy'].map(side=>Number.isInteger(hour[side])?hour[side]:0))),upper=Math.max(4,Math.ceil(max/4)*4),map=new Map(hours.map(hour=>[Date.parse(hour.at),hour]));
    const svg=svgNode('svg',{viewBox:`0 0 ${W} ${H}`,role:'img','aria-label':'Published poster counts for each UTC source hour; not sales or unique people'});
    svg.append(svgNode('title',{},'Last 24 source hours: published seller and buyer poster counts. Missing/conflicting sides have no bar; counts are not unique people or sales.'));
    svg.append(svgNode('text',{x:L+plotW/2,y:18,'text-anchor':'middle',class:'highlights-count-axis'},'Poster count / source hour'));
    for(let i=0;i<=4;i++){const value=upper*i/4,y=T+plotH-value/upper*plotH;svg.append(svgNode('line',{x1:L,x2:W-R,y1:y,y2:y,stroke:'var(--line)'}),svgNode('text',{x:L-8,y:y+4,'text-anchor':'end',class:'highlights-count-tick'},number(value)));}
    for(let i=0;i<24;i++){const at=start+i*3600000,hour=map.get(at),x=L+i*slot;
      if(!hour){const gap=svgNode('rect',{x:x+1,y:T,width:Math.max(1,slot-2),height:plotH,fill:'var(--line)',opacity:'.16','data-hour-coverage':'missing'});gap.append(svgNode('title',{},utc(new Date(at).toISOString())+' · source hour unavailable; no counts imputed'));svg.append(gap);continue;}
      if(hour.partial){const partial=svgNode('rect',{x,y:T,width:slot,height:plotH,fill:'#edc471',opacity:'.09','data-hour-partial':'true'});partial.append(svgNode('title',{},utc(hour.at)+' · partial source bucket when captured'));svg.append(partial);}
      for(const [side,offset,color] of [['sell',.12,'#edc471'],['buy',.55,'#89c6b0']]){if(!Number.isInteger(hour[side]))continue;const value=hour[side],height=value/upper*plotH,bar=svgNode('rect',{x:x+slot*offset,y:T+plotH-height,width:slot*.32,height,fill:color,'data-source-hour':hour.at,'data-source-side':side,'data-source-count':value});bar.append(svgNode('title',{},`${utc(hour.at)} · ${side==='sell'?'Seller':'Buyer'} source posters: ${number(value)}${hour.partial?' · partial when captured':''}; not unique people across hours or trade volume`));svg.append(bar);}
    }
    for(const i of [0,Math.round(23/2),23]){const at=start+i*3600000,date=new Date(at),x=L+(i+.5)*slot,anchor=i===0?'start':i===23?'end':'middle',label=date.toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'}),tick=svgNode('text',{x,y:H-74,'text-anchor':anchor,class:'highlights-count-tick'},label);tick.append(svgNode('tspan',{x,dy:20},date.toISOString().slice(11,16)));svg.append(tick);}
    svg.append(svgNode('text',{x:L+plotW/2,y:H-24,'text-anchor':'middle',class:'highlights-count-axis'},'Time (UTC)'));countChart.append(svg);
  }
  function draw() {
    if (!report) return;
    const items = highlights(report); track.replaceChildren();
    publication.textContent = report.sourceUpdatedAt && Number.isFinite(Date.parse(report.sourceUpdatedAt))
      ? 'Source publication ' + new Date(report.sourceUpdatedAt).toISOString().replace('T', ' ').replace('.000Z', ' UTC') : 'Source publication time unavailable';
    heading.title=publication.textContent;publication.hidden=!showPublication;
    if (!items.length) { track.append(make('p', '', 'No qualified dated highlights in this snapshot.')); return; }
    for (const duplicate of [false, true]) {
      const list = make('ul', 'market-highlights-list');
      if (duplicate) list.setAttribute('aria-hidden', 'true');
      for (const item of items) {
        const chip = make('li', 'market-highlight'); chip.dataset.highlightType = item.type; chip.dataset.direction = item.direction;
        const label = make(duplicate ? 'span' : 'a'); label.append(highlightGraphic(item, true));
        if (!duplicate) { label.href = '#item/' + encodeURIComponent(item.slug); label.setAttribute('aria-label', item.summary);label.title=item.text; }
        chip.append(label); list.append(chip);
      }
      track.append(list);
    }
  }
  function update() {
    panel.hidden = !enabled;
    toggle.textContent = 'Market highlights: ' + (enabled ? 'On' : 'Off');
    toggle.setAttribute('aria-pressed', String(enabled));
    const reduced = motion?.matches === true;
    panel.dataset.paused = String(paused || reduced); panel.dataset.reducedMotion = String(reduced);
    pause.textContent = reduced ? 'Motion off · device preference' : paused ? 'Resume motion' : 'Pause motion';
    pause.disabled = reduced; pause.setAttribute('aria-pressed', String(paused || reduced));
    if (enabled) draw();
  }
  toggle.addEventListener('click', () => {
    enabled = !enabled;
    try { localStorage.setItem(key, enabled ? 'on' : 'off'); } catch { /* Usable in this tab. */ }
    update();
  });
  calculationToggle.addEventListener('click',()=>{calculationDetail=!calculationDetail;calculationToggle.setAttribute('aria-pressed',String(calculationDetail));calculationToggle.textContent=calculationDetail?'Hide calculation details':'Show calculation details';document.querySelectorAll('.highlights-method-detail').forEach(note=>note.hidden=!calculationDetail);if(report){drawPage();if(enabled)draw();}});
  const fontButton=make('button','','Heading: Inquisitive');fontButton.type='button';let inquisitive=true;try{inquisitive=localStorage.getItem('astra-highlights-font-v1')!=='plain'}catch{}const applyFont=()=>{panel.dataset.headingFont=inquisitive?'inquisitive':'plain';fontButton.textContent='Heading: '+(inquisitive?'Inquisitive':'Plain');fontButton.setAttribute('aria-pressed',String(inquisitive))};fontButton.addEventListener('click',()=>{inquisitive=!inquisitive;try{localStorage.setItem('astra-highlights-font-v1',inquisitive?'inquisitive':'plain')}catch{}applyFont()});calculationControls.append(fontButton);applyFont();
  const applyAbbreviations=()=>{abbreviationToggle.textContent='Compact values: '+(abbreviations?'On':'Off');abbreviationToggle.setAttribute('aria-pressed',String(abbreviations));};
  abbreviationToggle.addEventListener('click',()=>{abbreviations=!abbreviations;try{localStorage.setItem('astra-highlights-abbreviations-v1',abbreviations?'on':'off')}catch{}applyAbbreviations();if(report){drawPage();if(enabled)draw();}});calculationControls.append(abbreviationToggle);applyAbbreviations();
  publicationToggle.addEventListener('click',()=>{showPublication=!showPublication;publicationToggle.setAttribute('aria-pressed',String(showPublication));publicationToggle.textContent=showPublication?'Hide source publication':'Show source publication';publication.hidden=pagePublication.hidden=!showPublication;});
  contextToggle.addEventListener('click',()=>{showContext=!showContext;contextToggle.setAttribute('aria-pressed',String(showContext));contextToggle.textContent=showContext?'Hide Wolbi context':'Show Wolbi context';if(report){drawPage();if(enabled)draw();}});
  pause.addEventListener('click', () => { paused = !paused; update(); });
  motion?.addEventListener?.('change', update);
  window.addEventListener('hashchange',()=>{if(window.location.hash==='#highlights'&&report)drawPage();});
  window.addEventListener('resize',()=>{if(report&&!page.hidden)drawCountChart(hourlyActivity(report));});
  document.addEventListener('change',event=>{if(event.target?.id==='display-timezone'&&report?.apiCalculationView){drawPage();if(enabled)draw();}});
  document.addEventListener('astramarketsnapshot', event => {
    if (!event.detail || !Array.isArray(event.detail.rows)) return;
    report = event.detail;
    drawPage();
    if (enabled) draw();
  });
  update();
  // The app owns collection. This handshake only requests its existing memory snapshot.
  document.dispatchEvent(new Event('astramarkethighlightsready'));
  // Deferred modules can be loaded after the app's first route decision.
  if (window.location.hash === '#highlights') window.dispatchEvent(new Event('hashchange'));
})();

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "market-highlights.js", status: "initialization_failed"}})); } catch {}
}

;
/* Astra source: brand-preview.js */
try {
(() => {
  'use strict';
  if (document.getElementById('brand-preview-options')) return;
  const masthead = document.querySelector('header.masthead');
  const brand = masthead?.querySelector('a.brand');
  const suffix = brand?.querySelector('.brand-watch');
  const copy = suffix?.parentElement;
  const options = document.getElementById('display-options');
  if (!masthead || !brand || !suffix || !copy || !options) return;

  const choices = {
    typeface: [['sans', 'Bold sans'], ['display', 'Upright display'], ['arcade', 'Arcade mono'], ['arcade-bold', 'Arcade mono · Bold'], ['pixel', 'Pixel font']],
    placement: [['left', 'Left'], ['center', 'Center']],
    case: [['lower', '.gg'], ['upper', '.GG']],
    logo: [['lemon-stack', 'Lemon · 999 quickslot'], ['lemon', 'Lemon'], ['pouch', 'Pouch'], ['leaf', 'Maple leaf'], ['scroll', 'Scroll'], ['none', 'Wordmark only']],
    tagline: [['harnessed', 'Harnessed'], ['checked', 'Kept in check'], ['measured', 'Measured'], ['count', 'Every meso'], ['number', 'Put a number on it']],
  };
  const defaults = { typeface: 'arcade', placement: 'center', case: 'lower', logo: 'lemon-stack', tagline: 'harnessed' };
  const labels = { typeface: 'Wordmark typography', placement: 'Wordmark placement', case: 'Wordmark suffix', logo: 'Wordmark logo', tagline: 'Wordmark tagline' };
  const state = { ...defaults };
  const controls = document.createElement('fieldset');
  controls.id = 'brand-preview-options';
  controls.className = 'brand-preview-controls';
  const legend = document.createElement('legend');
  legend.textContent = 'Wordmark';
  controls.append(legend);
  masthead.classList.add('brand-preview-masthead');
  copy.classList.add('brand-wordmark-copy');
  const logo = brand.querySelector('.brand-leaf'), logoImage = logo?.querySelector('img');
  const stackBadge=document.createElement('span');stackBadge.className='brand-stack-count';stackBadge.textContent='999';stackBadge.setAttribute('aria-hidden','true');logo?.append(stackBadge);
  // Reuse the site's original leaf drawing without its favicon background box.
  const mapleLeaf = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  mapleLeaf.setAttribute('viewBox', '0 0 32 32'); mapleLeaf.setAttribute('aria-hidden', 'true'); mapleLeaf.setAttribute('focusable', 'false'); mapleLeaf.classList.add('brand-logo-maple');
  const leafPath = document.createElementNS('http://www.w3.org/2000/svg', 'path'); leafPath.setAttribute('d', 'm16 4 3 8 7-2-3 7 5 4-10 3-2 5-1-6-10-3 5-5-2-7 6 4Z'); leafPath.setAttribute('fill', 'currentColor'); mapleLeaf.append(leafPath); logo?.append(mapleLeaf);


  const apply = () => {
    document.body.dataset.brandTypeface = state.typeface;
    document.body.dataset.brandPlacement = state.placement;
    document.body.dataset.brandCase = state.case;
    masthead.dataset.brandTypeface = state.typeface;
    masthead.dataset.brandPlacement = state.placement;
    masthead.dataset.brandCase = state.case;
    masthead.dataset.brandLogo = state.logo;
    const tagline = copy.querySelector('small'); if (tagline) tagline.textContent = { harnessed: 'The Maple Classic World economy, harnessed.', checked: 'The Maple Classic World economy, kept in check.', measured: 'The Maple Classic World economy, measured.', count: 'Make every meso count.', number: 'Put a number on your mesos.' }[state.tagline];
    if (tagline) {
      const text=tagline.textContent,accent={harnessed:'harnessed',checked:'kept in check',measured:'measured',count:'count',number:'number'}[state.tagline];
      const at=text.lastIndexOf(accent);if(at>=0){const strong=document.createElement('strong');strong.className='brand-tagline-accent';strong.textContent=accent;tagline.replaceChildren(document.createTextNode(text.slice(0,at)),strong,document.createTextNode(text.slice(at+accent.length)));}
    }
    masthead.dataset.brandTagline = state.tagline;
    if (logo && logoImage) {
      logo.hidden = state.logo === 'none';
      logoImage.hidden = state.logo === 'leaf'; mapleLeaf.toggleAttribute('hidden', state.logo !== 'leaf');
      stackBadge.hidden=state.logo!=='lemon-stack';
      if (['lemon-stack','lemon','pouch','scroll'].includes(state.logo)) {
        const src = state.logo.startsWith('lemon') ? 'assets/lemon-original-v1.png' : state.logo === 'scroll' ? 'assets/ap-reset-scroll.png' : 'assets/meso-pouch.png';
        if (logoImage.getAttribute('src') !== src) logoImage.src = src;
      }
      // The adjacent wordmark supplies the accessible brand name; art is decorative.
      logoImage.alt = '';
    }

    suffix.textContent = state.case === 'upper' ? '. GG' : '. gg';
    for (const button of controls.querySelectorAll('button')) {
      button.setAttribute('aria-pressed', String(state[button.dataset.brandSetting] === button.dataset.brandChoice));
    }
    document.dispatchEvent(new CustomEvent('astrabrandchange', { detail: { ...state } }));
  };
  for (const [setting, values] of Object.entries(choices)) {
    try {
      const saved = localStorage.getItem('astra-brand-' + setting);
      if (values.some(([value]) => value === saved)) state[setting] = saved;
    } catch { /* A blocked preference store must not disable the display choices. */ }
    const group = document.createElement('div');
    group.className = 'brand-preview-group';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', labels[setting]);
    const label = document.createElement('span');
    label.textContent = labels[setting].replace('Wordmark ', '');
    group.append(label);
    for (const [value, title] of values) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.brandSetting = setting;
      button.dataset.brandChoice = value;
      button.textContent = title;
      button.setAttribute('aria-label', labels[setting] + ': ' + title);
      button.addEventListener('click', () => {
        state[setting] = value;
        apply();
        try { localStorage.setItem('astra-brand-' + setting, value); } catch { /* The current tab remains usable. */ }
      });
      group.append(button);
    }
    controls.append(group);
  }
  const note = document.createElement('small');
  note.textContent = 'Wordmark and preview controls · saved in this browser. The self-hosted pixel font loads only when selected. Other choices use system fonts. ';
  const fontLicense = document.createElement('a'); fontLicense.href = 'assets/PixelifySans-OFL.txt'; fontLicense.textContent = 'Pixel font license'; note.append(fontLicense);
  controls.append(note);
  options.append(controls);
  apply();
})();

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "brand-preview.js", status: "initialization_failed"}})); } catch {}
}

;
/* Astra source: banner-art.js */
try {
(() => {
  'use strict';
  const options = document.getElementById('display-options');
  if (!options || !document.querySelector('.hero-art') || document.getElementById('banner-art-options')) return;
  const key = 'astra-banner-art';
  const modes = new Map([['paired', 'Follow scenery pairing'], ['free-market', 'Free Market'], ['henesys', 'Henesys'], ['zakum', 'Zakum'], ['zakum-set', 'Zakum · Helmet effect'], ['lantern', 'Lantern Market']]);
  const group = document.createElement('div');
  group.id = 'banner-art-options'; group.className = 'banner-art-options';
  group.setAttribute('role', 'group'); group.setAttribute('aria-label', 'Banner artwork');
  const title = document.createElement('span'); title.textContent = 'Banner artwork'; group.append(title);
  const choose = value => {
    const selected = modes.has(value) ? value : 'zakum-set';
    document.body.dataset.bannerArt = selected;
    for (const button of group.querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.bannerArtChoice === selected));
  };
  for (const [mode, label] of modes) {
    const button = document.createElement('button'); button.type = 'button';
    button.dataset.bannerArtChoice = mode; button.textContent = label;
    button.setAttribute('aria-controls', 'rate-section');
    button.addEventListener('click', () => {
      choose(mode);
      try { localStorage.setItem(key, mode); } catch { /* Usable in this tab without storage. */ }
    });
    group.append(button);
  }
  const note = document.createElement('small');
  note.textContent = 'Independent of the page backdrop. Zakum and Lantern Market are decorative fan illustrations; the cyan/purple motif references the original Zakum Helmet equipment effect.';
  group.append(note); options.append(group);
  let saved;
  try { saved = localStorage.getItem(key); } catch { /* Use the approved helmet-effect banner. */ }
  choose(saved);
})();

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "banner-art.js", status: "initialization_failed"}})); } catch {}
}

;
/* Astra source: theme-preview.js */
try {
(() => {
  'use strict';
  const parent = document.getElementById('display-options');
  if (!parent || document.getElementById('theme-preview-options')) return;
  const key = 'astra-color-scheme-v1';
  const schemes = Object.freeze({
    ellinia: { label: 'Ellinia Green (default)', browserColor: null },
    'maple-amber': { label: 'Maple Amber', browserColor: '#211914' },
    'moonlit-ludibrium': { label: 'Moonlit Ludibrium', browserColor: '#171a2a' },
  });
  const browserTheme = document.querySelector('meta[name="theme-color"]');
  const originalBrowserColor = browserTheme?.getAttribute('content');
  const group = document.createElement('section');
  group.id = 'theme-preview-options'; group.className = 'theme-preview-options';
  group.setAttribute('role', 'group'); group.setAttribute('aria-label', 'Color scheme');
  const label = document.createElement('span'); label.textContent = 'Color scheme';
  const choices = document.createElement('div'); choices.className = 'theme-preview-buttons';
  const note = document.createElement('small'); note.className = 'theme-preview-note';
  note.setAttribute('role', 'status'); note.setAttribute('aria-live', 'polite');
  const buttons = [];
  const apply = (value, persist = false) => {
    const scheme = Object.hasOwn(schemes, value) ? value : 'ellinia';
    // Removing the attribute restores every original approved green rule.
    if (scheme === 'ellinia') delete document.body.dataset.colorScheme;
    else document.body.dataset.colorScheme = scheme;
    if (browserTheme) {
      const color = schemes[scheme].browserColor ?? originalBrowserColor;
      if (color === null) browserTheme.removeAttribute('content');
      else browserTheme.setAttribute('content', color);
    }
    for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.colorSchemeChoice === scheme));
    let saved = true;
    if (persist) {
      try { localStorage.setItem(key, scheme); } catch { saved = false; }
    }
    note.textContent = (saved ? 'Saved in this browser only. ' : 'Browser storage is unavailable; this choice works in this tab. ') +
      'Prices, calculations and buy/sell/source-status meanings stay the same.';
    document.dispatchEvent(new CustomEvent('astracolorschemechange', { detail: { scheme } }));
  };
  for (const [value, scheme] of Object.entries(schemes)) {
    const button = document.createElement('button'); button.type = 'button';
    button.dataset.colorSchemeChoice = value; button.textContent = scheme.label;
    button.addEventListener('click', () => apply(value, true));
    buttons.push(button); choices.append(button);
  }
  group.append(label, choices, note);
  // Load after the other display modules so this cosmetic group stays last.
  parent.append(group);
  let saved;
  try { saved = localStorage.getItem(key); } catch { /* Approved green remains the default. */ }
  apply(saved);
  window.addEventListener('storage', event => { if (event.key === key) apply(event.newValue); });
})();

// Optional coordinated presentation. Existing preferences, art and data are kept.
(() => {
  'use strict';
  const options = document.getElementById('display-options');
  if (!options || document.getElementById('design-preset-options')) return;
  const key = 'astra-design-preset-v1', backdropKey = 'astra-design-preset-backdrop-v1';
  let selected = 'custom', backdrop = 'sky', storageAvailable = true;
  try {
    const saved = localStorage.getItem(key);
    if (['mesowatch', 'mesowatch-refine'].includes(saved)) selected = saved;
    if (localStorage.getItem(backdropKey) === 'keep') backdrop = 'keep';
  } catch { storageAvailable = false; }
  const group = document.createElement('section');
  group.id = 'design-preset-options'; group.className = 'theme-preview-options design-preset-options';
  group.dataset.previewControls = 'design-preset';
  group.setAttribute('role', 'group'); group.setAttribute('aria-label', 'Coordinated design preset');
  const title = document.createElement('span'); title.textContent = 'Design preset';
  const choices = document.createElement('div'); choices.className = 'theme-preview-buttons';
  const backgrounds = document.createElement('div'); backgrounds.className = 'design-preset-backgrounds';
  backgrounds.setAttribute('role', 'group'); backgrounds.setAttribute('aria-label', 'Preset backdrop');
  const note = document.createElement('small'); note.className = 'theme-preview-note';
  note.id = 'design-preset-note'; note.setAttribute('role', 'status'); note.setAttribute('aria-live', 'polite');
  group.setAttribute('aria-describedby', note.id);
  function save(name, value) { try { localStorage.setItem(name, value); } catch { storageAvailable = false; } }
  function render() {
    const active = selected === 'mesowatch' || selected === 'mesowatch-refine';
    if (active) { document.body.dataset.designPreset = 'mesowatch'; document.body.dataset.designPresetBackdrop = backdrop; }
    else { delete document.body.dataset.designPreset; delete document.body.dataset.designPresetBackdrop; }
    if (selected === 'mesowatch-refine') document.body.dataset.designPresetRefine = 'on';
    else delete document.body.dataset.designPresetRefine;
    for (const button of choices.children) button.setAttribute('aria-pressed', String(button.dataset.designPresetChoice === selected));
    for (const button of backgrounds.children) button.setAttribute('aria-pressed', String(button.dataset.designPresetBackdropChoice === backdrop));
    backgrounds.hidden = !active;
    note.textContent = (storageAvailable ? 'Saved in this browser only. ' : 'Storage is unavailable; this choice works in this tab. ') +
      (active ? (selected === 'mesowatch-refine' ? 'Refined spacing, softer panel edges and a lighter source note. ' : '') + 'Rounded type, parchment panels and orange tabs. Sky only temporarily covers scenery; Keep my scenery uses the existing art. Individual style controls return to My choices. ' : 'Your existing design and scenery choices are used. ') +
      'Prices, dates, calculation methods and saved individual choices are unchanged.';
    document.dispatchEvent(new CustomEvent('astradesignpresetchange', { detail: { preset: selected, backdrop: active ? backdrop : null } }));
  }
  function choose(value, persist = false) {
    selected = ['mesowatch', 'mesowatch-refine'].includes(value) ? value : 'custom';
    if (persist) save(key, selected);
    render();
  }
  for (const [value, label] of [['custom', 'My choices'], ['mesowatch', 'Meso.watch-inspired'], ['mesowatch-refine', 'Meso.watch refine']]) {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.designPresetChoice = value; button.textContent = label;
    button.addEventListener('click', () => choose(value, true)); choices.append(button);
  }
  for (const [value, label] of [['sky', 'Sky only'], ['keep', 'Keep my scenery']]) {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.designPresetBackdropChoice = value; button.textContent = label;
    button.addEventListener('click', () => { backdrop = value; save(backdropKey, value); render(); }); backgrounds.append(button);
  }
  group.append(title, choices, backgrounds, note);
  options.insertBefore(group, document.getElementById('theme-preview-options'));
  // A deliberate individual type/palette/footer choice takes precedence. Scenery,
  // layout order and every calculation control remain independent.
  document.addEventListener('click', event => {
    if (selected === 'custom' || !(event.target instanceof Element)) return;
    if (event.target.closest('#brand-preview-options button, #theme-preview-options button, .community-footer-styles button')) choose('custom', true);
  });
  window.addEventListener('storage', event => {
    if (event.storageArea !== null) { try { if (event.storageArea !== localStorage) return; } catch { return; } }
    if (event.key === null) { backdrop = 'sky'; choose('custom'); }
    else if (event.key === key) choose(event.newValue);
    else if (event.key === backdropKey) { backdrop = event.newValue === 'keep' ? 'keep' : 'sky'; render(); }
  });
  render();
})();

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "theme-preview.js", status: "initialization_failed"}})); } catch {}
}

;
/* Astra source: cash-catalog.js */
try {
(() => {
  'use strict';
  const content = document.getElementById('content');
  if (!content || document.getElementById('view-cash-catalog')) return;
  const make = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
  const positive = value => Number.isFinite(value) && value > 0;
  const count = value => Number.isInteger(value) && value >= 0;
  const day = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0,10) === value;
  const clock = value => typeof value === 'string' && /(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value));
  const number = (value, decimals = 0) => Number.isFinite(value) ? value.toLocaleString('en-US', { maximumFractionDigits: decimals }) : 'Unknown';
  const time = value => clock(value) ? (value.endsWith('Z')?value.slice(0,-1).replace('T',' ')+' UTC':value.replace('T',' ')) : 'Unknown';
  const page = make('section', 'view cash-catalog'); page.id = 'view-cash-catalog'; page.hidden = true; page.setAttribute('aria-labelledby','cash-catalog-title');
  page.innerHTML = `<div class="page-heading"><div><p class="eyebrow">COLLECTED CASH ITEMS / DATED SOURCE EVIDENCE</p><h1 id="cash-catalog-title">The cash catalog.</h1><p>Browse provider market records and separately verified client metadata, including items outside the fixed Cash Basket and NX estimate.</p></div></div><p class="notice cash-catalog-status" role="status"></p><p class="cash-catalog-scope">Market rows are this provider’s collection; metadata-only rows establish client records, not release, trade or game availability. This is not every cash item in the game. Source medians have an unspecified summary window; the separate qualified daily price requires at least five recorded sales. Only configured, verified fixed NX costs support a daily-price/NX ratio. Unknown costs stay unknown.</p><div class="cash-catalog-controls"><label>Search collected cash items<input type="search" autocomplete="off" placeholder="Item name or history badge" aria-describedby="cash-catalog-results"></label><button type="button" data-catalog-clear>Clear</button><div class="cash-catalog-paging"><button type="button" data-catalog-page="previous">Previous</button><span id="cash-catalog-results" role="status" aria-live="polite"></span><button type="button" data-catalog-page="next">Next</button></div></div><div class="table-wrap cash-catalog-table"></div><p class="cash-catalog-teddy"></p><p class="cash-catalog-footnotes">¹ Source median: publisher summary window unspecified. ² Provider observation: unconfirmed source claim, not an independently verified trade timestamp.</p><p class="cash-catalog-legend"><strong>History badges:</strong> “New in collected history” means the first retained daily observation is after the fixed reference period. It is not a release date. “Short qualifying history” means fewer than seven retained days with at least five recorded sales. Retention gaps can hide older observations; these badges are descriptive and change no calculation. Provider observation clocks do not independently verify a trade or current listing availability. Daily medians may mix cosmetic/equipment quality.</p><p class="cash-catalog-back"><a href="#cash-basket">Fixed Cash Basket →</a> · <a href="#nx">Known-price NX estimates →</a></p>`;
  content.append(page);
  const status = page.querySelector('.cash-catalog-status'), tableHost = page.querySelector('.cash-catalog-table'), input = page.querySelector('input'), result = page.querySelector('#cash-catalog-results');
  const links = [];
  for (const id of ['view-nx','view-cash-basket']) { const view = document.getElementById(id); if (!view) continue; const p = make('p','cash-catalog-link'), a = make('a','','Browse the collected cash catalog →'); a.href='#cash-catalog'; p.append(a); const heading=view.querySelector('.page-heading');if(heading)heading.after(p);else view.prepend(p);links.push(a); }
  let report, rows = [], sortKey = 'name', ascending = true, pageIndex = 0, expanded = null, historyKey = 0, historyAscending = false;
  const pageSize = 25;
  const headers = [['name','Cash item / evidence'],['publisherMedian','Source median¹'],['price','Qualified daily median'],['knownNxCost','Fixed NX cost'],['dailyRate','Daily mesos / NX'],['firstObservedDay','First retained day'],['qualifyingDays','Qualifying days'],['sourceLastSeenAt','Provider observation²']];
  // Optional computed display columns supplied from the already-loaded snapshot.
  // They never become provider prices, NX costs, release metadata or history.
  let volatility = null;
  const activeHeaders = () => [...headers,...(rows.some(r=>r.supplemental)?[['supplementalPrice','Separate rolling median · mesos']]:[]),...(volatility?[['volatility7','7-day daily price volatility'],['volatilityRank','Volatility rank']]:[])];
  const sortValue = (row, key) => key === 'volatility7' ? volatility?.values.get(row.slug)?.value ?? null : key === 'volatilityRank' ? volatility?.values.get(row.slug)?.rank ?? null : row[key];
  function normalize(raw, catalog) {
    if (!raw || typeof raw.name !== 'string' || typeof raw.slug !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(raw.slug)) return null;
    const history = (Array.isArray(raw.history) ? raw.history : []).filter(p => Array.isArray(p) && day(p[0]) && positive(p[1]) && count(p[2])).map(p => p.slice(0,3)).sort((a,b)=>a[0].localeCompare(b[0]));
    const price = positive(raw.price) && day(raw.priceDay) && count(raw.quantity) && raw.quantity >= 5 ? raw.price : null;
    const nx = positive(raw.knownNxCost) ? raw.knownNxCost : null;
    const first = day(raw.firstObservedDay) ? raw.firstObservedDay : history[0]?.[0] || null;
    const qualifyingDays = count(raw.qualifyingDays) ? raw.qualifyingDays : history.filter(p=>p[2]>=5).length;
    const isNew = !!first && day(catalog.baseEnd) && first > catalog.baseEnd, short = qualifyingDays < 7;
    return { name:raw.name, key:raw.slug, slug:raw.slug, canonicalId:Number.isInteger(raw.canonicalId)?raw.canonicalId:null, metadataOnly:false, publisherMedian:positive(raw.publisherMedian)?raw.publisherMedian:null, price, priceDay:price===null?null:raw.priceDay, quantity:price===null?null:raw.quantity, partial:raw.partial===true, knownNxCost:nx, dailyRate:price!==null&&nx!==null?price/nx:null, firstObservedDay:first, qualifyingDays, historyDays:count(raw.historyDays)?raw.historyDays:history.length, sourceLastSeenAt:clock(raw.sourceLastSeenAt)?raw.sourceLastSeenAt:null, history, isNew, short, inCashBasket:raw.inCashBasket===true, sourceObservations:Array.isArray(raw.sourceObservations)?raw.sourceObservations:[] };
  }
  function metadata(raw){
    if(!raw||!Number.isInteger(raw.id)||raw.id<=0||typeof raw.name!=='string'||raw.cash!==true||raw.marketDataAvailable!==false)return null;
    return {name:raw.name,key:'metadata-'+raw.id,slug:null,canonicalId:raw.id,metadataOnly:true,publisherMedian:null,price:null,priceDay:null,quantity:null,knownNxCost:null,dailyRate:null,firstObservedDay:null,qualifyingDays:0,historyDays:0,sourceLastSeenAt:null,history:[],isNew:false,short:false,inCashBasket:false,sourceObservations:[],metadataCapturedAt:raw.metadataCapturedAt,metadataCaptureTimeKind:raw.metadataCaptureTimeKind,sourceUrl:raw.sourceUrl,region:raw.region,version:raw.version};
  }
  function references(data){const branch=data?.cashPriceReferences;if(branch?.schemaVersion!==1||branch.kind!=='supplemental_cash_rolling_references'||branch.sourceUrl!=='https://mesos.watch/'||!Array.isArray(branch.items))return[];const ids=new Set();return branch.items.filter(r=>{if(!r||!Number.isInteger(r.id)||r.id<=0||ids.has(r.id)||r.id!==r.expectedItemId||typeof r.name!=='string'||typeof r.expectedItemName!=='string'||r.name.toLocaleLowerCase()!==r.expectedItemName.toLocaleLowerCase()||!positive(r.price)||!Number.isInteger(r.salesCounted)||r.salesCounted<1||!positive(r.windowDays)||r.windowDays>90||r.priceBasis!=='median of sales'||!clock(r.capturedAt))return false;ids.add(r.id);return true;});}
  function appendReference(region,item){const r=item.supplemental;if(!r)return;region.append(make('h3','','Separate supplemental rolling reference'),make('p','cash-catalog-supplemental',`${number(r.price,1)} mesos · median of ${number(r.salesCounted)} recorded sales · ${number(r.windowDays)}-day reported lookback (not proof of that much trading history). Captured ${time(r.capturedAt)} (${r.captureTimeKind||'receipt clock'}); underlying source observation time ${r.observationTimestampKnown&&clock(r.sourceObservedAt)?time(r.sourceObservedAt):'unknown'}. Reported roll: ${r.statRollKnown?(r.statRoll===null?'explicit null':String(r.statRoll)):'not reported'}. This is not a daily-history point, fixed NX cost, live tick or quality-constant equipment history.`));if(Number.isInteger(r.listingsNow))region.append(make('p','',`${number(r.listingsNow)} listings reported at this capture.${r.cheapestListing&&positive(r.cheapestListing.price_each)?` Cheapest asking observation ${number(r.cheapestListing.price_each,1)} mesos each · channel ${r.cheapestListing.channel}, room ${r.cheapestListing.room}.`:''} Current listing availability is unconfirmed.`));}
  function compare(a,b,key,asc) { const av=key==='sourceLastSeenAt'&&a[key]!==null?Date.parse(a[key]):sortValue(a,key),bv=key==='sourceLastSeenAt'&&b[key]!==null?Date.parse(b[key]):sortValue(b,key); if(av===null||av===undefined)return bv===null||bv===undefined?a.key.localeCompare(b.key):1; if(bv===null||bv===undefined)return -1; const delta=typeof av==='number'&&typeof bv==='number'?av-bv:String(av).localeCompare(String(bv),undefined,{numeric:true}); return delta*(asc?1:-1)||a.key.localeCompare(b.key); }
  function catalogIcon(item){const fallback=()=>{const icon=make('span','cash-catalog-icon-fallback','◇');icon.dataset.spriteKind='generic';icon.setAttribute('role','img');icon.setAttribute('aria-label','Generic marker; original item icon not cached');icon.title='Generic marker · original item icon not cached';return icon;};const src=report?.spriteMap?.[item.slug]||report?.spriteMap?.[item.canonicalId];if(typeof src!=='string'||!/^assets\/[A-Za-z0-9._-]+\.(?:png|webp|gif|svg)$/.test(src))return fallback();const image=make('img','cash-catalog-icon');image.src=src;image.alt='';image.width=32;image.height=32;image.loading='lazy';image.dataset.spriteKind='item';image.title='Original game icon · Nexon via MapleStory.io';image.addEventListener('error',()=>image.replaceWith(fallback()),{once:true});return image;}
  function historyRow(item) {
    const tr=make('tr','cash-catalog-history'),td=make('td');td.colSpan=activeHeaders().length;const region=make('section');region.id='cash-catalog-history-'+item.key;region.setAttribute('aria-label',item.name+' daily history');
    if(item.metadataOnly){region.append(make('h2','',item.name+(item.supplemental?' · client metadata + separate rolling reference':' · client metadata only')),make('p','',`Verified client item ID ${item.canonicalId} · ${item.region||'Unknown region'} / ${item.version||'Unknown version'}. Within this client-metadata receipt, no provider market observations, price, fixed NX cost or release date are established. 0 retained daily history days. Metadata receipt ${time(item.metadataCapturedAt)} (${item.metadataCaptureTimeKind||'capture kind unspecified'}); this is not a trade, release or game-availability clock.`));if(typeof item.sourceUrl==='string'&&item.sourceUrl.startsWith('https://')){const link=make('a','','View primary item metadata ↗');link.href=item.sourceUrl;link.target='_blank';link.rel='noopener noreferrer';region.append(link);}const editions=make('a','','Published mystery-box editions and availability →');editions.href='#mystery-boxes';region.append(make('p','','Official edition evidence is kept separately from this metadata receipt. '),editions);appendReference(region,item);td.append(region);tr.append(td);return tr;}
    if(item.supplementalOnly){region.append(make('h2','',item.name+' · rolling reference only'),make('p','','No provider daily history or verified fixed NX cost is established for this separate item-ID record. No release date is inferred.'));appendReference(region,item);td.append(region);tr.append(td);return tr;}
    region.append(make('h2','',item.name+' · retained daily history'),make('p','',`${item.historyDays} retained source days; ${item.qualifyingDays} qualify at ≥5 recorded sales. First retained day: ${item.firstObservedDay||'Unknown'} (not a release date). Daily values are source-inferred aggregates, not individual transactions.`));
    for(const observation of item.sourceObservations.filter(o=>o&&o.kind==='rolling_scanner_median')) region.append(make('p','cash-catalog-rolling',`Separate rolling median: ${number(observation.price)} mesos · ${number(observation.salesCounted)} recorded sales · ${number(observation.windowDays)}-day window. Captured ${time(observation.capturedAt)}; underlying source time ${observation.observationTimestampKnown&&clock(observation.sourceObservedAt)?time(observation.sourceObservedAt):'unknown'}. Reported roll: ${observation.statRollKnown?(observation.statRoll===null?'explicit null':String(observation.statRoll)):'unverified'}. This is separate from the daily history and confirms no listing availability.`));
    appendReference(region,item);
    const table=make('table');table.dataset.searchReady='true';const head=table.createTHead().insertRow();
    for(const [index,label] of ['Source day','Daily median · mesos','Recorded count'].entries()){const th=make('th');th.setAttribute('aria-sort',historyKey===index?(historyAscending?'ascending':'descending'):'none');const button=make('button','',label+(historyKey===index?(historyAscending?' ↑':' ↓'):''));button.type='button';button.dataset.catalogHistorySort=String(index);th.append(button);head.append(th);}
    const body=table.createTBody(),sorted=item.history.map((point,index)=>({point,index})).sort((a,b)=>{const av=a.point[historyKey],bv=b.point[historyKey];return (typeof av==='number'?av-bv:String(av).localeCompare(String(bv)))*(historyAscending?1:-1)||a.index-b.index;});
    for(const {point} of sorted){const row=body.insertRow();row.insertCell().textContent=point[0]+(point[0]===report?.cashCatalog?.sourceUpdatedAt?.slice(0,10)?' · partial source day':'');row.insertCell().textContent=number(point[1],1);row.insertCell().textContent=number(point[2]);}
    if(!sorted.length){const cell=body.insertRow().insertCell();cell.colSpan=3;cell.textContent='No retained daily history in this snapshot.';}
    region.append(table);td.append(region);tr.append(td);return tr;
  }
  function draw() {
    const query=input.value.trim().toLocaleLowerCase(),filtered=rows.filter(row=>[row.name,row.slug,row.metadataOnly?'client metadata only':'',row.isNew?'new in collected history':'',row.short?'short qualifying history':''].join(' ').toLocaleLowerCase().includes(query)).sort((a,b)=>compare(a,b,sortKey,ascending));
    pageIndex=Math.min(pageIndex,Math.max(0,Math.ceil(filtered.length/pageSize)-1));const visible=filtered.slice(pageIndex*pageSize,(pageIndex+1)*pageSize),table=make('table');table.dataset.searchReady='true';table.setAttribute('aria-label','Collected cash items');
    const head=table.createTHead().insertRow();for(const [key,label] of activeHeaders()){const th=make('th');th.setAttribute('aria-sort',sortKey===key?(ascending?'ascending':'descending'):'none');if(key==='volatility7'||key==='volatilityRank')th.title=volatility.title;const button=make('button','',label+(sortKey===key?(ascending?' ↑':' ↓'):''));button.type='button';button.dataset.cashCatalogSort=key;th.append(button);head.append(th);}
    const body=table.createTBody();for(const item of visible){const tr=body.insertRow();tr.dataset.catalogKey=item.key;if(item.slug)tr.dataset.catalogSlug=item.slug;if(item.metadataOnly)tr.dataset.metadataId=String(item.canonicalId);const name=tr.insertCell(),button=make('button','cash-catalog-item',item.name);button.type='button';button.dataset.catalogHistory=item.key;button.setAttribute('aria-expanded',String(expanded===item.key));if(expanded===item.key)button.setAttribute('aria-controls','cash-catalog-history-'+item.key);name.append(catalogIcon(item),button);if(Number.isSafeInteger(item.canonicalId)&&item.canonicalId>0){const line=make('small'),full=make('a','cash-catalog-full-link','Full item page →');full.href='#item/id-'+item.canonicalId;full.setAttribute('aria-label','Open '+item.name+' item page');line.append(full);name.append(line);}for(const label of [item.supplementalOnly?'Separate rolling reference only':item.metadataOnly?(item.supplemental?'Client metadata + separate rolling reference':'Client metadata only · no market evidence'):null,item.isNew?'New in collected history':null,item.short?'Short qualifying history':null,item.inCashBasket?'Cash Basket member':null].filter(Boolean))name.append(make('small','cash-catalog-badge',label));
      tr.insertCell().textContent=number(item.publisherMedian,1);const daily=tr.insertCell();daily.append(make('span','',number(item.price,1)),make('small','',item.priceDay?`${item.priceDay}${item.partial?' · partial':''} · ${number(item.quantity)} recorded`:item.supplemental?'No daily market history':item.metadataOnly?'No market observations':'No ≥5-count daily price'));
      tr.insertCell().textContent=number(item.knownNxCost);tr.insertCell().textContent=number(item.dailyRate,2);tr.insertCell().textContent=item.firstObservedDay||'Unknown';const days=tr.insertCell();days.append(make('span','',number(item.qualifyingDays)),make('small','',`${item.historyDays} retained days`));const seen=tr.insertCell();seen.textContent=time(item.sourceLastSeenAt);seen.title='Provider-reported observation clock; not independently verified trade time or current availability.';
      if(rows.some(r=>r.supplemental)){const cell=tr.insertCell();cell.textContent=item.supplemental?number(item.supplemental.price,1):'Unknown';if(item.supplemental)cell.append(make('small','',`${number(item.supplemental.windowDays)}-day lookback · captured ${time(item.supplemental.capturedAt)} · source time ${item.supplemental.observationTimestampKnown&&clock(item.supplemental.sourceObservedAt)?time(item.supplemental.sourceObservedAt):'unknown'}`));}
      if(volatility){const point=volatility.values.get(item.slug),sigma=tr.insertCell(),rank=tr.insertCell();sigma.dataset.sortValue=point?String(point.value):'';rank.dataset.sortValue=point?String(point.rank):'';sigma.title=rank.title=volatility.title;sigma.append(make('span','',point?point.value.toLocaleString('en-US',{minimumFractionDigits:1,maximumFractionDigits:1})+'%':'Unavailable'));if(point)sigma.append(make('small','',point.returns+'/6 daily returns'));rank.textContent=point?`#${point.rank} of ${volatility.eligible} eligible / ${volatility.total} market items`:item.metadataOnly?'Not ranked · metadata only':'Unavailable';}
      if(expanded===item.key)body.append(historyRow(item));
    }
    if(!visible.length){const td=body.insertRow().insertCell();td.colSpan=activeHeaders().length;td.textContent='No collected items match this search.';}
    tableHost.replaceChildren(table);result.textContent=filtered.length?`${pageIndex*pageSize+1}–${pageIndex*pageSize+visible.length} of ${filtered.length} matches · ${rows.length} collected items`:`0 matches · ${rows.length} collected items`;
    page.querySelector('[data-catalog-page="previous"]').disabled=pageIndex===0;page.querySelector('[data-catalog-page="next"]').disabled=(pageIndex+1)*pageSize>=filtered.length;page.querySelector('[data-catalog-clear]').disabled=!input.value;
  }
  function receive(data) {
    report=data;const catalog=data?.cashCatalog;
    if(catalog?.schemaVersion!==1||catalog.kind!=='cash_shop_source_catalog'||!Array.isArray(catalog.rows)){rows=[];status.textContent='This snapshot does not yet include the collected cash catalog. Existing cash indexes and NX estimates are unchanged.';page.querySelector('.cash-catalog-teddy').textContent='';links.forEach(link=>link.textContent='Browse the collected cash catalog →');draw();return;}
    rows=catalog.rows.map(row=>normalize(row,catalog)).filter(Boolean);const seen=new Set();rows=rows.filter(row=>{if(seen.has(row.key))return false;seen.add(row.key);return true;});const providerCount=rows.length,ids=new Set(rows.map(row=>row.canonicalId).filter(Number.isInteger));
    for(const raw of catalog.metadataItems||[]){const item=metadata(raw);if(!item||ids.has(item.canonicalId)||raw.providerSlug&&seen.has(raw.providerSlug))continue;rows.push(item);ids.add(item.canonicalId);}
    const metadataCount=rows.length-providerCount;
    const supplemental=references(data);let supplementalOnlyCount=0;for(const ref of supplemental){let matches=rows.filter(r=>r.canonicalId===ref.id&&r.name.toLocaleLowerCase()===ref.name.toLocaleLowerCase());if(matches.length>1)continue;let item=matches[0];if(!item){if(rows.some(r=>r.canonicalId===ref.id))continue;item={name:ref.name,key:'supplemental-'+ref.id,slug:null,canonicalId:ref.id,metadataOnly:false,supplementalOnly:true,publisherMedian:null,price:null,priceDay:null,quantity:null,knownNxCost:null,dailyRate:null,firstObservedDay:null,qualifyingDays:0,historyDays:0,sourceLastSeenAt:null,history:[],isNew:false,short:false,inCashBasket:false,sourceObservations:[]};rows.push(item);supplementalOnlyCount++;}item.supplemental=ref;item.supplementalPrice=ref.price;}
    if(!supplemental.length&&sortKey==='supplementalPrice'){sortKey='name';ascending=true;}
    status.textContent=`${rows.length} displayed cash records · ${providerCount} provider market records + ${metadataCount} metadata-only entries. Daily source published ${time(catalog.sourceUpdatedAt)}. ${rows.filter(row=>row.knownNxCost!==null).length} have configured fixed NX costs; ${rows.filter(row=>row.inCashBasket).length} belong to the frozen Cash Basket. Metadata entries have no market history and change neither cohort nor headline.`;
    if(supplemental.length)status.textContent=`${rows.length} displayed cash records · ${providerCount} provider daily-market records + ${metadataCount} client-metadata records + ${supplementalOnlyCount} separate rolling-only records. ${rows.filter(r=>r.supplemental).length} have separate supplemental rolling references from a ${data.cashPriceReferences.plannedItemCount}-item plan; latest batch completed ${data.cashPriceReferences.latestBatch?.completedAttemptCount??'unknown'} attempts. Each price retains its own capture/window; mixed times are not one market snapshot. Daily source ${time(catalog.sourceUpdatedAt)}. Fixed NX costs, daily history and basket membership are unchanged.`;
    const teddyMetadata=(catalog.metadataItems||[]).some(item=>item.id===1007133);
    page.querySelector('.cash-catalog-teddy').textContent=rows.some(row=>!row.metadataOnly&&(row.slug==='teddy-mask'||row.name.toLocaleLowerCase()==='teddy mask'))?'':teddyMetadata?'Client metadata verifies Teddy Bear Headgear (item 1007133). “Teddy Mask” is not a verified alias or exact matching provider price here; no release date, random-crate value or fixed NX cost is inferred.':'The exact name “Teddy Mask” is absent from this published provider snapshot. That does not establish its release date or availability in game.';
    if(rows.some(r=>r.canonicalId===1007133&&r.supplemental))page.querySelector('.cash-catalog-teddy').textContent='Teddy Bear Headgear (1007133) has a separate rolling scanner reference. This adds no daily-history observation or fixed NX cost. “Teddy Mask” remains an unverified alias.';
    links.forEach(link=>link.textContent=`Browse ${rows.length} collected cash items →`);draw();
  }
  input.addEventListener('input',()=>{pageIndex=0;expanded=null;draw();});input.addEventListener('search',()=>{pageIndex=0;expanded=null;draw();});
  page.addEventListener('click',event=>{const sort=event.target.closest('[data-cash-catalog-sort]');if(sort){const key=sort.dataset.cashCatalogSort;ascending=sortKey===key?!ascending:key==='name'||key==='firstObservedDay'||key==='volatilityRank';sortKey=key;pageIndex=0;draw();page.querySelector('[data-cash-catalog-sort="'+key+'"]')?.focus();return;}const clear=event.target.closest('[data-catalog-clear]');if(clear){input.value='';pageIndex=0;expanded=null;draw();input.focus();return;}const paging=event.target.closest('[data-catalog-page]');if(paging){pageIndex+=paging.dataset.catalogPage==='next'?1:-1;expanded=null;draw();return;}const history=event.target.closest('[data-catalog-history]');if(history){expanded=expanded===history.dataset.catalogHistory?null:history.dataset.catalogHistory;historyKey=0;historyAscending=false;draw();page.querySelector('[data-catalog-history="'+history.dataset.catalogHistory+'"]')?.focus();return;}const historySort=event.target.closest('[data-catalog-history-sort]');if(historySort){const key=Number(historySort.dataset.catalogHistorySort);if(![0,1,2].includes(key))return;historyAscending=historyKey===key?!historyAscending:key===0;historyKey=key;draw();page.querySelector('[data-catalog-history-sort="'+key+'"]')?.focus();}});
  document.addEventListener('astracashcatalogvolatility',event=>{
    const detail=event.detail;volatility=null;
    if(detail?.enabled===true&&day(detail.start)&&day(detail.end)&&Date.parse(detail.end)-Date.parse(detail.start)===6*86400000&&count(detail.eligible)&&count(detail.total)&&detail.eligible<=detail.total&&Array.isArray(detail.rows)&&detail.rows.length<=10000){
      const values=new Map();for(const row of detail.rows){if(row&&/^[a-z0-9][a-z0-9-]*$/.test(row.slug)&&Number.isFinite(row.value)&&row.value>=0&&Number.isInteger(row.rank)&&row.rank>=1&&row.rank<=detail.eligible&&Number.isInteger(row.returns)&&row.returns>=5&&row.returns<=6)values.set(row.slug,{value:row.value,rank:row.rank,returns:row.returns});}
      if(values.size===detail.eligible)volatility={values,eligible:detail.eligible,total:detail.total,title:`${detail.start}–${detail.end}: sample SD of consecutive qualified daily-median log returns × 100. At least five returns; no missing-day bridge or annualization. Rank 1 is highest volatility among all ${detail.eligible} eligible / ${detail.total} provider market items before search or pagination. Metadata-only rows are not ranked.`};
    }
    if(!volatility&&['volatility7','volatilityRank'].includes(sortKey)){sortKey='name';ascending=true;}draw();
  });
  document.addEventListener('astracashcataloglookup',event=>{const detail=event.detail;if(!detail||typeof detail.query!=='string')return;input.value=detail.query;pageIndex=0;expanded=rows.some(row=>row.key===detail.key)?detail.key:null;draw();});
  document.addEventListener('astramarketsnapshot',event=>receive(event.detail));
  receive(null);document.dispatchEvent(new Event('astracashcatalogcolumnsready'));document.dispatchEvent(new Event('astramarkethighlightsready'));
  if(window.location.hash==='#cash-catalog')window.dispatchEvent(new Event('hashchange'));
})();

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "cash-catalog.js", status: "initialization_failed"}})); } catch {}
}

;
/* Astra source: nx-benchmark.js */
try {
(() => {
  'use strict';
  if (window.AstraNxBenchmark) return;

  const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
  // This is a hypothetical comparison, never an observed exchange-rate series.
  function calculate(report) {
    if(report?.apiCalculationUnavailable)return null;
    if(report?.apiCalculationView){const view=report.apiCalculationView,active=view.headline,observed=[...view.daily.history].reverse().find(p=>positive(p.nxRate)&&p.cashItems>=3);if(!active.available||!observed)return null;
      const anchorMpi=active.mode!=='rolling'?100:active.meanMpi,anchorNxRate=active.mode!=='rolling'?report.baseNxRate:active.cashAnchor,factor=view.index/anchorMpi,adjusted=observed.nxRate/factor;
      if(![anchorMpi,anchorNxRate,factor,adjusted].every(positive))return null;
      return {api:true,baseNxRate:report.baseNxRate,cpi:view.index,observedNxRate:observed.nxRate,observedDay:observed.day,observedPartial:observed.partialCalendarDay,goodsPriceFactor:factor,anchorMpi,anchorNxRate,modelBenchmarkRate:active.rate,observedGoodsAdjustedRate:adjusted,goodsBuyingPowerChange:100*(adjusted/anchorNxRate-1),rolling:active.mode==='rolling',windowDays:active.windowDays,mode:active.mode,modelLabel:active.label,anchorStart:active.startDay,anchorEnd:active.endExclusive,frozenBenchmarkRate:report.baseNxRate*view.index/100,fallbackReason:null};
    }
    const baseNxRate = report?.baseNxRate, observedNxRate = report?.latest?.nxRate;
    const active = window.AstraGoodsNxBenchmark?.headline(report) ?? window.AstraRollingBenchmark?.headline(report);
    const selected = positive(active?.rate), rolling = selected && active.mode === 'rolling', cpi = selected ? active.currentMpi ?? active.cpi : report?.latest?.cpi;
    if (![baseNxRate, cpi, observedNxRate].every(positive)) return null;
    const anchorMpi = rolling ? active.meanMpi : 100, anchorNxRate = rolling ? active.cashAnchor : baseNxRate;
    const goodsPriceFactor = cpi / anchorMpi;
    const modelBenchmarkRate = selected ? active.rate : baseNxRate * goodsPriceFactor;
    const observedGoodsAdjustedRate = observedNxRate / goodsPriceFactor;
    const goodsBuyingPowerChange = (observedGoodsAdjustedRate / anchorNxRate - 1) * 100;
    if (![goodsPriceFactor, modelBenchmarkRate, observedGoodsAdjustedRate].every(positive)
        || !Number.isFinite(goodsBuyingPowerChange)) return null;
    return Object.freeze({ baseNxRate, cpi, observedNxRate, goodsPriceFactor, anchorMpi, anchorNxRate,
      modelBenchmarkRate, observedGoodsAdjustedRate, goodsBuyingPowerChange, rolling, windowDays: rolling ? active.windowDays : null, mode: selected ? active.mode : 'fixed',
      modelLabel: selected ? active.label : 'Reference-week goods NX benchmark', anchorStart: rolling ? active.startDay : report?.baseStart,
      anchorEnd: rolling ? active.endDay : report?.baseEnd, frozenBenchmarkRate: baseNxRate * cpi / 100,
      fallbackReason: selected ? active.fallbackReason : null });
  }
  window.AstraNxBenchmark = Object.freeze({ calculate });

  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const number = value => value.toLocaleString('en-US', { maximumFractionDigits: 2 });
  const signed = value => { const rounded = Math.abs(value) < .005 ? 0 : value; return (rounded > 0 ? '+' : '') + number(rounded) + '%'; };
  const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value + 'T00:00:00Z'))
    && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value ? value : null;
  const sections = [];
  for (const [id, suffix] of [['view-method', 'method'], ['view-nx', 'nx']]) {
    const view = document.getElementById(id);
    if (!view) continue;
    const section = make('section', 'panel nx-benchmark');
    section.id = suffix === 'method' ? 'method-nx-benchmark' : 'nx-benchmark-' + suffix;
    section.tabIndex = -1;
    section.setAttribute('aria-labelledby', section.id + '-title');
    section.innerHTML = `<p class="eyebrow">MODELLED BENCHMARK / OBSERVED CASH KEPT SEPARATE</p>
      <h2 id="${section.id}-title">NX against the goods price level.</h2>
      <p class="nx-benchmark-intro">Overview uses the hypothetical goods-inflation NX benchmark. The observed daily cash-sale estimate stays separate here for comparison; the actual item-pricing table continues to use its source sale evidence.</p>
      <p class="nx-benchmark-status" role="status"></p>
      <div class="nx-benchmark-results" hidden>
        <p class="nx-benchmark-inputs"></p>
        <div class="nx-benchmark-cards">
          <article><h3 data-nx-model-title>Modelled NX benchmark</h3><strong data-nx-benchmark="model"></strong><p data-nx-model-description></p></article>
          <article><h3>Observed NX, adjusted for goods prices</h3><strong data-nx-benchmark="adjusted"></strong><p data-nx-adjusted-description></p></article>
          <article><h3>Goods buying-power change</h3><strong data-nx-benchmark="change"></strong><p data-nx-change-description></p></article>
        </div>
      </div>
      <details><summary>How this comparison was calculated</summary>
        <p data-nx-model-formula></p>
        <p>Goods MPI uses a fixed source-category-filtered basket: items categorized Cash Shop by the provider are excluded. The Mystery Palette Exchange Coupon remains a disclosed stamp-linked exception; funding origin is not a separate exclusion rule or a fixed NX cost. MPI measures the selected basket, not all items or meso supply.</p>
        <p>The observed NX estimate uses verified fixed-NX items and daily recorded-volume weights. Changes in that trading mix, seasonal demand or supply can move it. Mystery crates and other items without verified fixed NX costs receive no invented NX cost here.</p>
        <p data-nx-model-limit>The reference-week benchmark leaves changes in real NX supply, demand and cash-item composition outside the model. These are different units, not pooled indices, a forecast or executable quotes. The actual daily best/worst-value items remain unchanged.</p>
      </details>`;
    view.append(section);
    sections.push(section);
  }

  let lastReport;
  function receiveApi(report){
    const view=report.apiCalculationView,values=calculate(report),active=view.headline;
    for(const section of sections){
      section.querySelector('.nx-benchmark-results').hidden=!values;
      section.querySelector('.nx-benchmark-intro').textContent='The headline uses the linked 3-day goods-price reference. Actual daily cash-item evidence stays separate: its dates, lookback and trading mix differ.';
      section.querySelector('.nx-benchmark-status').textContent=`Price reference captured ${view.clocks.currentPrices}; daily anchor evidence captured ${view.clocks.dailyCapture}. Original legacy source ${view.clocks.legacyDaily} is retained separately. These are HTTP receipt clocks, not trade times.`;
      section.querySelector('.nx-benchmark-inputs').textContent=values?`Latest actual daily cash reference (${values.observedDay}${values.observedPartial?' · partial calendar day':''}): ${number(values.observedNxRate)} mesos/NX. Current linked 3-day goods MPI: ${number(view.index)}. Selected anchor: ${active.mode!=='rolling'?'frozen reference':active.windowDays+' previous complete source-calendar days ('+active.startDay+'–'+active.endExclusive+', end exclusive)'}. These source windows differ; this is a model comparison, not a matched trade.`:active.reason||'The selected model or comparable daily cash evidence is unavailable; no legacy fallback is substituted.';
      section.querySelector('[data-nx-model-title]').textContent=active.label;
      section.querySelector('[data-nx-model-description]').textContent='Modelled mesos per NX preserving the selected anchor’s buying power in the fixed goods basket; not an executable exchange quote.';
      section.querySelector('[data-nx-adjusted-description]').textContent='Latest source-day cash reference divided by the modelled goods-price factor. Its daily window differs from the current three-day price reference.';
      section.querySelector('[data-nx-change-description]').textContent='Change in that model comparison against the selected cash anchor; not realized profit or a direct exchange spread.';
      section.querySelector('[data-nx-model-formula]').textContent=active.mode!=='rolling'?'Frozen reference NX rate × linked current goods index / 100.':'Count-weighted fixed-NX daily cash anchor over the previous '+active.windowDays+' complete source-calendar days × current linked goods index / arithmetic mean linked daily MPI over the same days. Every selected anchor day must qualify; missing windows remain unavailable.';
      section.querySelector('[data-nx-model-limit]').textContent='The frozen November 4 retrospective source link preserves the legacy index level, not identical samples or constant item quality. All 50 current same-capture goods prices are required. Raw API three-day sale medians differ from linked index prices. Exact three-day bounds and individual trade timestamps are unknown. Pre-link API index history is a backcast; legacy history remains separate. Cash anchors still reflect changing cash supply, demand and composition.';
      for(const node of section.querySelectorAll('[data-nx-benchmark]')){const key=node.dataset.nxBenchmark;node.textContent=values?(key==='model'?number(values.modelBenchmarkRate):key==='adjusted'?number(values.observedGoodsAdjustedRate):signed(values.goodsBuyingPowerChange)):'—';}
    }
  }
  function receive(report) {
    if(report?.apiCalculationView){lastReport=report;receiveApi(report);return;}

    lastReport = report;
    const values = calculate(report);
    const published = typeof report?.sourceUpdatedAt === 'string' ? report.sourceUpdatedAt : null;
    const sourceDay = date(report?.latest?.day) ?? (published ? date(published.slice(0, 10)) : null);
    const start = date(report?.baseStart), end = date(report?.baseEnd);
    for (const section of sections) {
      const results = section.querySelector('.nx-benchmark-results');
      results.hidden = !values;
      if (!values) {
        section.querySelector('.nx-benchmark-status').textContent = 'Comparison unavailable: a positive frozen NX reference rate, goods MPI and observed daily NX rate are all required. No missing value is treated as zero.';
        section.querySelector('.nx-benchmark-inputs').textContent = '';
        for (const node of section.querySelectorAll('[data-nx-benchmark]')) node.textContent = '';
        continue;
      }
      const state = report?.sourceStatus?.status;
      const period = values.anchorStart && values.anchorEnd ? values.anchorStart + '–' + values.anchorEnd : 'period unavailable', anchorName = values.rolling ? `previous-${values.windowDays}-day anchor` : 'fixed reference week';
      section.querySelector('.nx-benchmark-intro').textContent = `Overview currently uses ${values.modelLabel.toLowerCase()}.${values.mode === 'compare' ? ' Its headline remains fixed-reference while the main chart compares both anchors.' : ''} The observed daily cash-sale estimate stays separate here; the actual item-pricing table retains its source evidence.`;
      section.querySelector('.nx-benchmark-status').textContent = `Dated daily source${sourceDay ? ': ' + sourceDay : '; source day unknown'}${report.latest?.partial ? ' · partial source-calendar day' : ''}.${state === 'degraded' ? ' Source checks are degraded; this comparison uses the retained daily evidence.' : ''}${values.fallbackReason ? ' Rolling fallback: ' + values.fallbackReason + '.' : ''} No new source observations are created by this model.`;
      section.querySelector('.nx-benchmark-inputs').textContent = `Inputs: observed daily estimate 1 NX ≈ ${number(values.observedNxRate)} mesos; goods MPI ${number(values.cpi)} (fixed reference week = 100); active ${anchorName} ${period}: ${number(values.anchorNxRate)} mesos/NX at MPI ${number(values.anchorMpi)}. Goods-basket weights remain fixed${start && end ? ' at ' + start + '–' + end : ''}; the rolling NX anchor is a different period. Frozen-reference model ${number(values.frozenBenchmarkRate)} mesos/NX remains the revert choice.`;
      section.querySelector('[data-nx-model-title]').textContent = values.modelLabel;
      section.querySelector('[data-nx-model-description]').textContent = values.rolling ? `Modelled mesos per NX preserving the previous ${values.windowDays} complete source days’ buying power in the fixed goods basket.` : 'Modelled mesos per NX preserving the frozen reference week’s buying power in the fixed goods basket.';
      section.querySelector('[data-nx-adjusted-description]').textContent = `The observed daily estimate in ${values.rolling ? `previous-${values.windowDays}-day anchor` : 'reference-week'} meso buying-power units; not a pooled price index.`;
      section.querySelector('[data-nx-change-description]').textContent = `Compared with the ${anchorName} NX rate after adjusting for the same goods-price factor.`;
      section.querySelector('[data-nx-model-formula]').textContent = values.rolling ? `Modelled benchmark = prior-${values.windowDays}-complete-day count-weighted known-NX cash anchor × current MPI ÷ arithmetic mean MPI over those same ${values.windowDays} days. Goods-adjusted observed rate = daily observed NX rate ÷ (current MPI ÷ anchor MPI). Buying-power change = (adjusted observed rate ÷ anchor NX rate − 1) × 100%. Every anchor day needs three qualified known-NX items (each daily count ≥5); all ${values.windowDays+1} goods points need at least 80% same-day observed weight. Missing windows are unavailable, with a labelled reference-week fallback.` : 'Modelled benchmark = reference-week NX rate × goods MPI ÷ 100. Goods-adjusted observed rate = daily observed NX rate ÷ (goods MPI ÷ 100). Buying-power change = (goods-adjusted rate ÷ reference-week NX rate − 1) × 100%.';
      section.querySelector('[data-nx-model-limit]').textContent = values.rolling ? 'The rolling anchor itself reflects cash-item composition and real NX supply/demand changes. Scaling it by goods inflation does not remove seasonal cash-market effects. The fixed reference reversion holds the original NX relationship constant instead. These are different units, not pooled indices, a forecast or executable quotes. Actual daily best/worst-value items and source dates remain unchanged.' : 'The reference-week benchmark holds the original NX relationship fixed while changing the selected goods price level. It leaves changes in real NX supply, demand and cash-item composition outside the model. These are different units, not pooled indices, a forecast or executable quotes. Actual daily best/worst-value items and source dates remain unchanged.';
      if (window.AstraRollingBenchmark?.getState().showExplanation) section.querySelector('details').open = true;
      section.querySelector('[data-nx-benchmark="model"]').textContent = '1 NX ≈ ' + number(values.modelBenchmarkRate) + ' mesos';
      section.querySelector('[data-nx-benchmark="adjusted"]').textContent = number(values.observedGoodsAdjustedRate) + (values.rolling ? ' anchor-period mesos / NX' : ' reference-week mesos / NX');
      section.querySelector('[data-nx-benchmark="change"]').textContent = signed(values.goodsBuyingPowerChange);
    }
  }
  document.addEventListener('astramarketsnapshot', event => receive(event.detail));
  document.addEventListener('astrabenchmarkmodechange', () => { receive(lastReport); for (const section of sections) section.querySelector('details').open = window.AstraRollingBenchmark?.getState().showExplanation === true; });
  receive(null);
  if (sections.length) document.dispatchEvent(new Event('astramarkethighlightsready'));
})();

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "nx-benchmark.js", status: "initialization_failed"}})); } catch {}
}

;
/* Astra source: cash-client-catalog.js */
try {
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

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "cash-client-catalog.js", status: "initialization_failed"}})); } catch {}
}

;
/* Astra source: rate-arrival.js */
try {
(() => {
  'use strict';
  if (window.AstraRateArrival) return;
  const positive = v => typeof v === 'number' && Number.isFinite(v) && v > 0;
  function points(report) {
    if (!report) return [];
    if(report.apiCalculationView)return (window.AstraGoodsNxBenchmark?.history(report)||[]).filter(p=>positive(p.value)&&typeof p.at==='string'&&Number.isFinite(Date.parse(p.at))).map(p=>({at:p.at,value:p.value,pricesCapturedAt:report.apiCalculationView.clocks.currentPrices,snapshotHash:p.snapshotHash,datePrecision:'capture'})).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)).slice(-3);
    const selected = window.AstraGoodsNxBenchmark?.history?.(report) ?? window.AstraRollingBenchmark?.series(report)?.[0]?.points;
    if (selected) return selected.filter(point => /^\d{4}-\d{2}-\d{2}$/.test(point.day || '') && positive(point.value)).map(point => ({ day: point.day, at: point.at, value: point.value, partial: !!point.partial })).sort((a,b) => a.day.localeCompare(b.day)).slice(-3);
    if (!positive(report?.baseNxRate)) return [];
    const days = new Map();
    for (const row of [...(report.history || []), report.latest].filter(Boolean)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(row.day || '') || !positive(row.cpi)) continue;
      const value = report.baseNxRate * (row.cpi / 100);
      if (positive(value)) days.set(row.day, { day: row.day, at: row.at || row.day, value, partial: !!row.partial });
    }
    return [...days.values()].sort((a,b) => a.day.localeCompare(b.day)).slice(-3);
  }
  window.AstraRateArrival = Object.freeze({ points });
  const value = document.getElementById('main-rate'), copy = document.querySelector('.hero-copy');
  if (!value || !copy) return;
  const status = document.createElement('p'); status.id = 'rate-arrival-status';
  status.className = 'rate-arrival-status'; status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite'); copy.append(status);
  const options = document.getElementById('display-options');
  const group = document.createElement('div'); group.className = 'hero-layout-options rate-arrival-options';
  group.setAttribute('role','group'); group.setAttribute('aria-label','Recent calculation animation');
  const toggle = document.createElement('button'); toggle.type = 'button';
  toggle.setAttribute('aria-controls','main-rate rate-arrival-status'); group.append(toggle);
  const styleChoices = document.createElement('div'); styleChoices.className = 'rate-arrival-style-choices'; styleChoices.setAttribute('role', 'group'); styleChoices.setAttribute('aria-label', 'Headline animation style');
  const note = document.createElement('small'); note.textContent = 'Actual stored calculations and source updates only; no simulated live ticks. Still keeps the latest snapshot.';
  group.append(styleChoices, note); options?.append(group);
  const key = 'astra-rate-arrival', styleKey = 'astra-rate-arrival-style-v1'; let enabled = true, style = 'ticks', report, lastKey, lastInputKey, generation = 0;
  const pending = new Set();
  try { enabled = localStorage.getItem(key) !== 'off'; } catch { /* Device motion preference still applies. */ }
  try { const saved = localStorage.getItem(styleKey); if (['ticks', 'fade', 'pulse'].includes(saved)) style = saved; } catch { /* Source ticks remains the default. */ }
  for (const [choice, label] of [['ticks', 'Source ticks'], ['fade', 'Fade'], ['pulse', 'Update pulse'], ['still', 'Still']]) {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.rateArrivalStyle = choice; button.textContent = label;
    button.setAttribute('aria-controls', 'main-rate rate-arrival-status');
    button.addEventListener('click', () => {
      enabled = choice !== 'still'; if (enabled) style = choice;
      try { localStorage.setItem(key, enabled ? 'on' : 'off'); if (enabled) localStorage.setItem(styleKey, style); } catch {}
      renderChoice(); draw(true);
    }); styleChoices.append(button);
  }
  const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const format = v => v.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
  const date = day => new Date(day+'T12:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'});
  const renderChoice = () => {
    toggle.textContent = 'Recent calculation animation: '+(enabled?'On':'Off');
    toggle.setAttribute('aria-pressed',String(enabled));
    group.dataset.arrivalStyle = enabled ? style : 'still';
    for (const button of styleChoices.querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.rateArrivalStyle === (enabled ? style : 'still')));
  };
  // Normalize actual timestamp-bearing source fields, never collection checks,
  // display clocks, inferred daily midnights or the time this function runs.
  const sourceTime = raw => typeof raw === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(raw) && Number.isFinite(Date.parse(raw)) ? new Date(raw).toISOString() : null;
  const hash = raw => typeof raw === 'string' && /^[a-f0-9]{64}$/i.test(raw) ? raw.toLowerCase() : null;
  function cancel() { ++generation; for (const timer of pending) clearTimeout(timer); pending.clear(); value.classList.remove('rate-source-arrived', 'rate-source-fade'); }
  function later(fn, delay) { const timer = setTimeout(() => { pending.delete(timer); fn(); }, delay); pending.add(timer); }
  function arrival() { value.classList.remove('rate-source-arrived', 'rate-source-fade'); void value.offsetWidth; value.classList.add(style === 'fade' ? 'rate-source-fade' : 'rate-source-arrived'); }
  value.addEventListener('animationend', event => { if (['rate-source-arrival', 'rate-source-fade'].includes(event.animationName)) value.classList.remove('rate-source-arrived', 'rate-source-fade'); });
  function draw(force = false) {
    cancel();
    const current = generation, series = points(report), headline = window.AstraGoodsNxBenchmark?.headline(report);
    if(report?.apiCalculationView){
      const view=report.apiCalculationView,key=JSON.stringify([view.snapshotHash,headline?.mode,headline?.windowDays,headline?.rate]),changed=key!==lastKey;lastKey=key;lastInputKey=key;
      if(!positive(headline?.rate)){value.textContent='—';status.textContent='Selected API benchmark unavailable; no legacy value is substituted.';status.dataset.phase='unavailable';return;}
      const stamp=raw=>{const zone=document.getElementById('display-timezone')?.value||'UTC';try{return new Date(raw).toLocaleString('en-US',{year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',timeZone:zone})+' '+zone;}catch{return raw;}};
      const finish=()=>{if(current!==generation)return;value.textContent=format(headline.rate);status.textContent='Latest accepted calculation · price reference captured ('+stamp(view.clocks.currentPrices)+'). Calculation capture history is session-only; receipt times are not trade times.';status.dataset.phase='latest-api';if((changed||(force&&style!=='ticks'))&&enabled&&!motion?.matches)arrival();};
      if(!enabled||motion?.matches||style==='pulse'||series.length<2||(!force&&!changed)){finish();return;}
      status.dataset.phase='history';series.slice(0,-1).forEach((point,index)=>later(()=>{if(current!==generation)return;value.textContent=format(point.value);status.textContent='Earlier accepted calculation capture ('+stamp(point.at)+') → latest accepted calculation.';if(style==='fade')arrival();},index*650));later(finish,(series.length-1)*650);return;
    }
    const definition = { base: positive(report?.baseNxRate) ? report.baseNxRate : null, selectedMode: headline?.mode || window.AstraRollingBenchmark?.getState().mode || 'fixed', anchorWindowDays: headline?.mode==='rolling'?headline.windowDays:null, methodVersion: report?.methodVersion, basketVersion: report?.basketVersion,
      specificationHash: hash(report?.specificationHash), basketHash: hash(report?.basketHash) };
    const dailyKey = JSON.stringify({ definition, sourceAt: sourceTime(report?.sourceUpdatedAt), series });
    const liveKey = JSON.stringify({ definition, at: sourceTime(report?.live?.observedAt), cpi: positive(report?.live?.cpi) ? report.live.cpi : null });
    const inputKey = JSON.stringify([dailyKey, liveKey]);
    const live = !!headline?.live && positive(headline.rate) && sourceTime(headline.at) === sourceTime(report?.live?.observedAt) && sourceTime(headline.at) !== null;
    const fingerprint = live ? liveKey : dailyKey;
    // Both input and selected calculation must change. If a qualified point
    // merely ages out under the headline helper, wall-clock passage is not
    // treated as a new source observation or used to start an animation.
    const changed = inputKey !== lastInputKey && fingerprint !== lastKey;
    lastInputKey = inputKey; lastKey = fingerprint;
    if (headline && !positive(headline.rate)) { value.textContent='—';status.textContent='Selected benchmark unavailable; no older value is presented as current.';status.dataset.phase='unavailable';return; }
    // Qualified intraday MPI has its own real source clock; never replace it
    // with a daily animation or pretend daily points are successive live ticks.
    if (live) {
      value.textContent = format(headline.rate);
      status.textContent='Latest qualified goods calculation · see source time above.'; status.dataset.phase='live';
      if ((changed || (force && style !== 'ticks')) && enabled && !motion?.matches) arrival();
      return;
    }
    if (!series.length) { if(positive(headline?.rate))value.textContent=format(headline.rate);status.textContent=''; delete status.dataset.phase; return; }
    const latest = series.at(-1);
    const trail = series.map(p => date(p.day)+': '+format(p.value)).join(' → ');
    const finish = () => {
      if (current !== generation) return;
      value.textContent = format(latest.value);
      status.textContent = 'Latest available · '+date(latest.day)+(latest.partial?' (partial source day)':'')+'. Recent source-day calculations: '+trail+'.';
      status.dataset.phase = 'latest';
      if ((changed || (force && style !== 'ticks')) && enabled && !motion?.matches) arrival();
    };
    if (!enabled || motion?.matches || style === 'pulse' || series.length < 2 || (!force && !changed)) { finish(); return; }
    status.dataset.phase='history';
    // Show actual stored points only. No interpolated values are invented.
    series.slice(0,-1).forEach((point,index) => later(() => {
      if (current !== generation) return;
      value.textContent=format(point.value);
      if (style === 'fade') arrival();
      status.textContent='Recent source-day calculation · '+date(point.day)+' → latest '+date(latest.day)+'.';
    },index*650));
    later(finish,(series.length-1)*650);
  }
  toggle.addEventListener('click',() => {
    enabled=!enabled; try { localStorage.setItem(key,enabled?'on':'off'); } catch {}
    renderChoice(); draw(true);
  });
  motion?.addEventListener?.('change',() => draw());
  document.addEventListener('astramarketsnapshot',event => { report=event.detail; draw(); });
  document.addEventListener('astrabenchmarkmodechange',()=>{if(report)draw();});
  renderChoice(); document.dispatchEvent(new Event('astramarkethighlightsready'));
})();

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "rate-arrival.js", status: "initialization_failed"}})); } catch {}
}

;
/* Astra source: panel-size-preview.js */
try {
(() => {
  'use strict';
  const movers = document.getElementById('movers'), panel = movers?.closest('.panel');
  if (!panel || document.getElementById('mover-size-options')) return;
  panel.classList.add('mover-size-preview');
  const key = 'astra-mover-panel-size';
  const captionKey='astra-mover-impact-caption', heading=panel.querySelector('h2');
  const caption=document.createElement('p');caption.className='mover-impact-caption';
  caption.append(document.createTextNode('Most impacted by inflation '));
  const help=document.createElement('a');help.href='#method-weights';help.textContent='?';help.setAttribute('aria-label','Ranked by contribution to the index; item-specific supply and demand can also change prices.');
  const sup=document.createElement('sup');sup.append(help);caption.append(sup);heading?.after(caption);
  const group = document.createElement('div'); group.id='mover-size-options';
  group.className='panel-size-options'; group.dataset.previewControls='true';
  group.setAttribute('role','group'); group.setAttribute('aria-label','Index movers panel width');
  const label=document.createElement('span');label.textContent='Panel width';group.append(label);
  function select(value) {
    const size=value==='full'?'full':'compact';panel.dataset.panelSize=size;
    for(const button of group.querySelectorAll('button[data-panel-size-choice]'))button.setAttribute('aria-pressed',String(button.dataset.panelSizeChoice===size));
  }
  for(const [mode,label] of [['full','Full width'],['compact','Compact width']]) {
    const button=document.createElement('button');button.type='button';button.dataset.panelSizeChoice=mode;button.textContent=label;
    button.addEventListener('click',()=>{select(mode);try{localStorage.setItem(key,mode)}catch{}});group.append(button);
  }
  const captionToggle=document.createElement('button');captionToggle.type='button';
  let captionOn=true;try{captionOn=localStorage.getItem(captionKey)!=='off'}catch{}
  const updateCaption=()=>{caption.hidden=!captionOn;panel.dataset.impactCaption=captionOn?'on':'off';captionToggle.textContent='Impact heading: '+(captionOn?'On':'Off');captionToggle.setAttribute('aria-pressed',String(captionOn))};
  captionToggle.addEventListener('click',()=>{captionOn=!captionOn;try{localStorage.setItem(captionKey,captionOn?'on':'off')}catch{}updateCaption()});group.append(captionToggle);updateCaption();
  const note=document.createElement('small');note.textContent='Preview this panel only; data and column proportions stay the same.';group.append(note);panel.append(group);
  let saved;try{saved=localStorage.getItem(key)}catch{}select(saved);
})();

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "panel-size-preview.js", status: "initialization_failed"}})); } catch {}
}

;
/* Astra source: price-check.js */
try {
(() => {
  'use strict';
  const content=document.getElementById('content'),header=document.querySelector('header.masthead');
  if(!content||!header||document.getElementById('view-price-check'))return;
  const make=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;};
  const positive=value=>Number.isFinite(value)&&value>0,validSlug=value=>typeof value==='string'&&/^[a-z0-9][a-z0-9-]*$/.test(value),validId=value=>Number.isInteger(value)&&value>0;
  const validDay=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;

  // These are instants in the selected zone, never daily source-calendar dates.
  const statusBindings=new WeakMap(),clockBindings=new WeakMap();let instantZone=null,instantFormatter=null;
  function selectedZone(){const value=document.getElementById('display-timezone')?.value||'UTC';try{new Intl.DateTimeFormat('en-US',{timeZone:value});return value;}catch{return 'UTC';}}
  function instant(value,missing='Unknown'){
    if(value===null||value===undefined||value==='')return missing;
    if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)||!validDay(value.slice(0,10))||Number(value.slice(11,13))>23||Number(value.slice(14,16))>59||Number(value.slice(17,19))>59||!Number.isFinite(Date.parse(value)))return 'Unknown';
    const zone=selectedZone();if(zone!==instantZone){instantFormatter=new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',timeZoneName:'short'});instantZone=zone;}
    const parts=Object.fromEntries(instantFormatter.formatToParts(new Date(value)).filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));
    return `(${parts.month}-${parts.day}-${parts.year} ${parts.hour}:${parts.minute}:${parts.second} ${parts.timeZoneName}${parts.timeZoneName===zone?'':' · '+zone})`;
  }
  const calendarDay=value=>validDay(value)?`${value.slice(5,7)}-${value.slice(8,10)}-${value.slice(0,4)}`:'Unknown';
  function bindClockText(node,render,raw={}){node.dataset.priceInstantLabel='true';node.dataset.rawDate='true';for(const [key,value]of Object.entries(raw))if(typeof value==='string')node.dataset[key]=value;clockBindings.set(node,render);node.textContent=render();return node;}
  function setCoverage(render){return bindClockText(coverage,render,{rawSourcePublicationAt:currentReport?.sourceUpdatedAt});}
  function refreshClockLabels(){for(const scope of [page,popup])for(const node of scope.querySelectorAll('[data-price-instant-label]')){const render=clockBindings.get(node);if(render)node.textContent=render();}for(const scope of [page,popup])for(const node of scope.querySelectorAll('[data-price-reference-status]')){const update=statusBindings.get(node);if(update)update();}}
  function apiStatusNode(row){
    const helper=window.AstraReferenceStatus;if(!helper)return null;const ref=row.calculationReference,cash=window.AstraApiCash?.rowFor(row);if(!ref&&!cash&&!row.apiIdentity)return null;
    const node=make('small','price-check-reference-status');node.dataset.priceReferenceStatus='';const update=()=>{
      let descriptor;
      if(ref){const view=currentReport?.apiItemEvidence||currentReport?.apiCalculationView,state=window.AstraApiCalculations?.state(),status=state?.blocked?'access_denied':view?.status||state?.status||'unverified';descriptor=helper.describe({capturedAt:ref.capturedAt,status,hasData:true,available:ref.available,retained:status==='retained'||(currentReport?.apiItemEvidence?state?.evidenceReaderMode:state?.readerMode)==='retained_last_good',visible:!document.hidden,online:navigator.onLine!==false,bandMinutes:20});}
      else if(cash){const state=window.AstraApiCash.getState();descriptor=helper.describe({capturedAt:state.data?.capturedAt,status:state.status,hasData:!!state.data,available:cash.available,retained:state.serverMode==='retained_last_good'||!!state.error,visible:!document.hidden,online:navigator.onLine!==false,bandMinutes:10});}
      else descriptor={tone:'amber',phase:'identity_only',capturedAt:null,label:row.apiIdentity?.knownSourceId?'Known source ID; price checked separately on selection':'Retained identity only; no current item price verified'};
      helper.decorate(node,descriptor,descriptor.label);
    };statusBindings.set(node,update);update();return node;
  }
  function currentIdentityEvidence(identity){return(identity.collectionRetained?'Retained complete identity collection · ':'')+'Known source ID · '+(identity.memberships.length?identity.memberships.map(m=>m.operation+' normalized membership · '+instant(m.capturedAt)).join(' · '):'retained ID, absent from latest published source sets')+'; observation times unknown; price not prefetched by search, checked on selection.';}
  function evidenceNode(row){
    const reference=row.rollingReference;
    if(row.apiIdentityOnly)return bindClockText(make('small'),()=> row.apiIdentity.knownSourceId?currentIdentityEvidence(row.apiIdentity):'Retained API identity · '+row.apiIdentity.memberships.map(m=>m.operation+(m.presentInSnapshot?' · accepted snapshot · ':' · retained membership · ')+instant(m.capturedAt)).join(' · ')+'; observation times unknown; no daily price inferred.');
    const render=()=>{
      let label=row.calculationReference?calculationLabel(row):row.metadata?`${row.metadataCapturedAt?'Metadata receipt '+instant(row.metadataCapturedAt):row.metadataDate?'Metadata receipt day '+calendarDay(row.metadataDate):'Metadata receipt time unknown'} · source time unknown`:
        row.priceDay?'Qualified daily price · '+calendarDay(row.priceDay)+(row.carried?' · carried':''):
        'Source publication '+instant(row.sourceUpdatedAt||currentReport?.sourceUpdatedAt)+' · no qualifying daily price';
      if(reference)label+=` · separate rolling median ${number(row.rollingPrice,1)} mesos / ${reference.windowDays}-day lookback, captured ${instant(reference.capturedAt)}; underlying time ${reference.observationTimestampKnown&&reference.sourceObservedAt?instant(reference.sourceObservedAt):'unknown'}`;
      if(!row.metadata&&row.metadataCapturedAt)label+=' · metadata receipt '+instant(row.metadataCapturedAt);
      if(row.apiIdentity?.knownSourceId)label+=' · '+currentIdentityEvidence(row.apiIdentity);else if(row.apiIdentity)label+=' · retained API identity evidence '+row.apiIdentity.memberships.map(m=>m.operation+(m.presentInSnapshot?' · accepted snapshot · ':' · retained membership · ')+instant(m.capturedAt)).join(' · ')+'; observation times unknown';
      const api=window.AstraApiCash?.rowFor(row),apiData=window.AstraApiCash?.getState().data;
      if(api)label+=api.available?` · separate API sale median ${number(api.saleMedianMesos,1)} mesos · ${number(api.recordedSalesCount,0)} reported sales / 3-day reported lookback (bounds unknown), API retrieved ${instant(apiData.capturedAt)}; individual sale times unknown`:' · fixed29 API evidence currently unavailable';
      return label;
    };
    return bindClockText(make('small','price-check-suggestion-date'),render,{sourceDay:row.priceDay,rawSourcePublicationAt:row.sourceUpdatedAt||currentReport?.sourceUpdatedAt,rawCapturedAt:reference?.capturedAt,rawSourceObservedAt:reference?.sourceObservedAt,rawMetadataReceiptAt:row.metadataCapturedAt,rawApiCapturedAt:row.calculationReference?.capturedAt||(window.AstraApiCash?.rowFor(row)?window.AstraApiCash.getState().data?.capturedAt:null)});
  }
  const number=(value,d=0)=>Number.isFinite(value)?value.toLocaleString('en-US',{maximumFractionDigits:d}):'Unknown';
  const nav=document.querySelector('.nav-wrap nav')||document.querySelector('nav');
  const headerSearch=make('form','price-check-nav price-check-searchbar');headerSearch.setAttribute('role','search');headerSearch.setAttribute('aria-label','Price check / Search for an Item');
  const headerLabel=make('label','price-check-search-label','Price check / Search for an Item');headerLabel.htmlFor='price-check-header-query';
  const headerInput=make('input');headerInput.id='price-check-header-query';headerInput.type='search';headerInput.placeholder='Search for an Item';headerInput.autocomplete='off';headerInput.maxLength=250;
  const headerSubmit=make('button','','Search');headerSubmit.type='submit';headerSearch.append(headerLabel,headerInput,headerSubmit);
  if(nav){const fallback=nav.querySelector('.fallback-link');if(fallback)fallback.before(headerSearch);else nav.append(headerSearch);}else header.append(headerSearch);
  const page=make('section','view price-check');page.id='view-price-check';page.hidden=true;page.setAttribute('aria-labelledby','price-check-title');
  page.innerHTML=`<div class="page-heading"><div><p class="eyebrow">PUBLIC TRACKED GOODS + CASH CATALOG</p><h1 id="price-check-title">Price check / Search for an Item</h1><p>Search the public tracked records. Unknown market prices remain unknown.</p></div></div><p class="notice price-check-coverage" role="status"></p><div class="price-check-controls"><label>Search collected items<input type="search" id="price-check-query" autocomplete="off" placeholder="Item name or evidence type" aria-describedby="price-check-results"></label><button type="button" data-price-clear>Clear</button><button type="button" data-price-page="previous">Previous</button><span id="price-check-results" aria-live="polite" role="status"></span><button type="button" data-price-page="next">Next</button></div><div class="table-wrap price-check-table"></div><p class="price-check-limits">Qualified daily prices require at least five recorded source sales and retain their price day; earlier qualifying prices can be shown with that earlier date. Source summary medians have an unspecified window. A client metadata record establishes neither a market price nor release/availability. Fixed NX costs are used only where supplied by the configured known-price schedule; random-crate costs and contents are not item prices. These source-inferred aggregates are not executable trade quotes. Coverage follows the loaded records above; a complete provider collection is not the entire game.</p>`;
  content.append(page);const input=page.querySelector('input'),result=page.querySelector('#price-check-results'),tableHost=page.querySelector('.price-check-table'),coverage=page.querySelector('.price-check-coverage');
  let records=[],query='',categoryChoice='all',pageIndex=0,sortKey='name',ascending=true;const pageSize=25;
  let baseRecords=[],currentReport=null,fallbackCoverage=null,fullCatalogDemanded=false;
  function applyFullCatalog(index){
    if(!currentReport)return;const api=window.AstraFullMarket;if(!api)return;
    if(!api.matchesReport(currentReport,index))throw Error('Catalog and displayed snapshot versions differ');
    records=api.mergeSearchRecords(baseRecords,index);
    for(const row of records)row.sprite=safeSprite(currentReport.spriteMap?.[row.slug]||currentReport.spriteMap?.[row.id]);
    setCoverage(()=>`${records.length} collected records: ${index.itemCount} provider items, including ${index.coverage.withoutQualifiedDailyPrice} without a qualifying daily price; separate supplemental evidence is retained. Full lookup source ${instant(index.sourceUpdatedAt)}. This is the accepted provider collection, not every game item. Summary medians have an unspecified window; typed searches stay in this tab.`);
    apiCoverageBase=clockBindings.get(coverage);applyApiIdentities();draw();drawSuggestions();
  }
  function demandFullCatalog(force=false){
    const api=window.AstraFullMarket;if(!api)return;fullCatalogDemanded=true;
    if(!api.hasVersionedReport(currentReport)){if(fallbackCoverage)setCoverage(()=>fallbackCoverage()+' Awaiting the versioned full catalog; the existing dated lookup remains available.');return;}
    if(fallbackCoverage)setCoverage(()=>fallbackCoverage()+' Loading the remaining collected provider records…');
    void api.client.loadIndex({force}).then(applyFullCatalog).catch(()=>{setCoverage(()=>fallbackCoverage()+' Full catalog is temporarily unavailable or a different source version; the existing dated lookup remains available.');});
  }
  // The navbar scrolls horizontally. A body-level popup avoids clipping its suggestions.
  const popup=make('div','price-check-autocomplete');popup.hidden=true;
  const popupStatus=make('p','price-check-suggestion-status');popupStatus.setAttribute('role','status');popupStatus.setAttribute('aria-live','polite');
  const list=make('ul','price-check-suggestions');list.id='price-check-suggestion-list';list.setAttribute('role','listbox');list.setAttribute('aria-label','Collected item suggestions');
  const viewAll=make('button','price-check-view-all','View all matches');viewAll.type='button';popup.append(popupStatus,list,viewAll);document.body.append(popup);
  let activeInput=null,activeIndex=-1,suggestions=[],suggestionInput=null,suggestionQuery=null,suppressFocus=false;
  const sourceDay=value=>typeof value==='string'&&validDay(value.slice(0,10))?value.slice(0,10):null;
  const safeSprite=value=>typeof value==='string'&&/^assets\/[a-zA-Z0-9._-]+\.(png|webp|gif|svg)$/.test(value)?value:null;
  function sprite(row){const image=make('img','price-check-sprite');image.src=row.sprite||'assets/leaf.png';image.alt='';image.width=32;image.height=32;image.dataset.spriteKind=row.sprite?'item':'generic';image.title=row.sprite?'Original game icon © Nexon · see Sources for delivery attribution':'Generic icon · item sprite unavailable';image.addEventListener('error',()=>{image.hidden=true;image.parentElement?.classList.add('price-check-sprite-unavailable');},{once:true});return image;}
  // A provider category is not a stat/slot/roll-constant equipment variant.
  const sourceCategory=row=>typeof row.sourceCategory==='string'&&row.sourceCategory.trim()&&row.sourceCategory.length<=120&&!/[\u0000-\u001f]/.test(row.sourceCategory)?row.sourceCategory:null;
  const categoryLabel=make('label','','Results category'),categorySelect=make('select');categorySelect.id='price-check-category';categorySelect.setAttribute('aria-describedby','price-check-category-note');categoryLabel.append(categorySelect);page.querySelector('.price-check-controls').prepend(categoryLabel);
  const categoryNote=make('p','price-check-category-note','Provider category filters apply to this results table; the header search still searches all collected records. “Not reported” is not zero. Daily histories do not identify matched ATT, Crit, STR/DEX/INT/LUK or slot variants; separately reported rolls do not make daily prices variant-specific.');categoryNote.id='price-check-category-note';page.querySelector('.price-check-controls').after(categoryNote);
  function populateCategories(){
    const counts=new Map();let unknown=0;for(const row of records){const value=sourceCategory(row);if(value===null)unknown++;else counts.set(value,(counts.get(value)||0)+1);}
    const options=[['all','All provider categories · '+records.length],...Array.from(counts).sort(([a],[b])=>a.localeCompare(b)).map(([value,count])=>['category:'+value,value+' · '+count]),['unknown','Not reported in loaded records · '+unknown]];
    if(categoryChoice.startsWith('category:')&&!counts.has(categoryChoice.slice(9)))options.push([categoryChoice,categoryChoice.slice(9)+' · not present in loaded records']);
    categorySelect.replaceChildren(...options.map(([value,label])=>{const option=make('option','',label);option.value=value;return option;}));categorySelect.value=categoryChoice;
  }
  const matchesCategory=row=>categoryChoice==='all'||categoryChoice==='unknown'?categoryChoice==='all'||sourceCategory(row)===null:sourceCategory(row)===categoryChoice.slice(9);
  categorySelect.addEventListener('change',()=>{categoryChoice=categorySelect.value;pageIndex=0;draw();});
  const matches=row=>[row.name,row.type,row.slug,row.id,...(row.aliasNames||[])].join(' ').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  function closeSuggestions(){setActive(-1);popup.hidden=true;suggestions=[];for(const field of [headerInput,input]){field.setAttribute('aria-expanded','false');field.removeAttribute('aria-activedescendant');}}
  function positionSuggestions(){
    if(popup.hidden||!activeInput)return;
    // innerWidth includes a classic scrollbar; fixed overlays must fit the usable viewport.
    const viewportWidth=document.documentElement.clientWidth||window.innerWidth;
    const viewportHeight=document.documentElement.clientHeight||window.innerHeight;
    const rect=activeInput.getBoundingClientRect(),width=Math.min(Math.max(rect.width,340),Math.max(0,viewportWidth-16));
    const below=Math.max(0,viewportHeight-rect.bottom-13),above=Math.max(0,rect.top-13),up=below<220&&above>below,height=Math.min(520,up?above:below);
    popup.style.width=width+'px';popup.style.left=Math.max(8,Math.min(rect.left,viewportWidth-width-8))+'px';
    popup.style.top=Math.max(8,up?rect.top-height-5:rect.bottom+5)+'px';popup.style.maxHeight=height+'px';
  }
  function setActive(index){activeIndex=index;[...list.children].forEach((option,i)=>option.setAttribute('aria-selected',String(i===index)));if(index>=0&&suggestions[index])activeInput?.setAttribute('aria-activedescendant','price-check-option-'+index);else activeInput?.removeAttribute('aria-activedescendant');list.children[index]?.scrollIntoView?.({block:'nearest'});}
  function drawSuggestions(){
    if(popup.hidden||!activeInput)return;const text=query.trim().toLocaleLowerCase(),all=records.filter(matches).sort((a,b)=>{const rank=row=>row.name.toLocaleLowerCase()===text?0:row.name.toLocaleLowerCase().startsWith(text)?1:2;return rank(a)-rank(b)||a.name.localeCompare(b.name)||a.key.localeCompare(b.key);});
    const selected=suggestionInput===activeInput&&suggestionQuery===query?suggestions[activeIndex]:null;
    const retained=selected?all.find(row=>row.key===selected.key&&!(validId(row.id)&&validId(selected.id)&&row.id!==selected.id)):null;
    suggestions=all.slice(0,8);if(retained&&!suggestions.includes(retained))suggestions=[...suggestions.slice(0,7),retained];
    list.replaceChildren();activeIndex=-1;activeInput.removeAttribute('aria-activedescendant');suggestionInput=activeInput;suggestionQuery=query;
    suggestions.forEach((row,i)=>{const option=make('li','price-check-suggestion');option.id='price-check-option-'+i;option.setAttribute('role','option');option.setAttribute('aria-selected','false');option.dataset.priceSuggestion=String(i);option.dataset.priceKey=row.key;const description=make('span','price-check-suggestion-copy');description.append(make('strong','',row.name),make('small','',row.type+(row.id?' · item '+row.id:'')+(row.sprite?'':' · generic icon')),evidenceNode(row));const indicator=apiStatusNode(row);if(indicator)description.append(indicator);const basic=basicEvidenceNode(row);if(basic)description.append(basic);option.append(sprite(row),description);list.append(option);});
    popupStatus.textContent=all.length?`${all.length} collected matches · showing ${suggestions.length}${all.length>8?' · type more to narrow':''}`:records.length?'No matching collected record. This does not establish game absence.':'No public records connected yet.';
    viewAll.textContent=all.length?`View all ${all.length} matches`:'Open price check';positionSuggestions();if(retained)setActive(suggestions.indexOf(retained));
  }
  function openSuggestions(field){if(popup.hidden||activeInput!==field)setActive(-1);activeInput=field;popup.hidden=false;for(const item of [headerInput,input])item.setAttribute('aria-expanded',String(item===field));drawSuggestions();}
  function openResults(){closeSuggestions();window.location.hash='#price-check';window.dispatchEvent(new Event('hashchange'));suppressFocus=true;input.focus();suppressFocus=false;}
  function openRecord(row){closeSuggestions();if(row.lazyDetail&&row.sourceSlug){window.location.hash='#item/'+encodeURIComponent(row.sourceSlug);window.dispatchEvent(new Event('hashchange'));}else if(row.catalog&&validId(row.id)){window.location.hash='#item/id-'+row.id;window.dispatchEvent(new Event('hashchange'));}else if(row.catalog){window.location.hash='#cash-catalog';window.dispatchEvent(new Event('hashchange'));document.dispatchEvent(new CustomEvent('astracashcataloglookup',{detail:{key:row.catalogKey,query:row.name}}));}else{window.location.hash='#item/'+encodeURIComponent(row.slug);window.dispatchEvent(new Event('hashchange'));}}
  function apiEvidenceNode(row){const value=window.AstraApiCash?.rowFor(row);if(!value)return null;
    return bindClockText(make('small','price-check-api-evidence'),()=>value.available?`Separate API median ${number(value.saleMedianMesos,1)} mesos · ${number(value.recordedSalesCount,0)} reported sales / reported 3-day lookback (bounds unknown) · retrieved ${instant(window.AstraApiCash.getState().data.capturedAt)}; not individual sale time`:'Fixed29 API evidence unavailable; not zero',{rawApiCapturedAt:window.AstraApiCash.getState().data.capturedAt});
  }
  const columns=[['name','Item / evidence'],['price','Qualified daily price · mesos'],['publisherMedian','Source summary median'],['knownNxCost','Fixed NX cost'],['dailyRate','Daily mesos / NX'],['priceDay','Price day'],['action','History']];
  const activeColumns=()=>{const active=(currentReport?.apiCalculationView||currentReport?.apiItemEvidence)?columns.map(([key,title])=>[key,key==='price'?'Price reference · mesos':key==='priceDay'?'Price basis / date':title]):columns;return records.some(r=>r.rollingReference)?[...active.slice(0,-1),['rollingPrice','Separate rolling median · mesos'],active.at(-1)]:active;};
  const captureClock=value=>typeof value==='string'&&Number.isFinite(Date.parse(value))&&/(?:Z|[+-]\d\d:\d\d)$/.test(value);
  function exactTenths(lexeme){
    if(typeof lexeme!=='string'||lexeme.length>160||!/^\d+(?:\.\d+)?$/.test(lexeme))return 'Unknown';
    const [whole,fraction='']=lexeme.split('.');let tenths=BigInt(whole)*10n+BigInt(fraction[0]||'0');if((fraction[1]||'0')>='5')tenths++;
    return (tenths/10n).toLocaleString('en-US')+'.'+String(tenths%10n);
  }
  function basicEvidenceNode(row){
    const api=window.AstraItemApiPreview;if(!api?.enabled)return null;const id=row.apiIdentity?.itemId||row.id,entry=api.peekCachedBasicReferences?.().references?.find(v=>v.data.itemId===id);if(!entry)return null;
    const d=entry.data,node=make('small','price-check-basic-evidence');node.dataset.basicItemId=String(id);
    return bindClockText(node,()=>{const retained=entry.mode==='retained'||entry.mode==='retained_absent',state=window.AstraReferenceStatus?.describe({capturedAt:d.capturedAt,status:retained?'retained':'shown',hasData:true,retained,available:d.state==='present_in_generation',visible:!document.hidden,online:navigator.onLine!==false,bandMinutes:20});if(state){node.dataset.statusTone=state.tone;node.dataset.statusPhase=state.phase;}return (retained?'Retained dated Basic aggregate':'Basic shared cached aggregate')+' · '+(d.state==='absent_in_generation'?'absent in this generation; no price':'sold median '+exactTenths(d.sold?.medianUnitPrice)+' / average '+exactTenths(d.sold?.averageUnitPrice)+' mesos; asking median '+exactTenths(d.asking?.medianUnitPrice)+' mesos')+' · original retrieval '+instant(d.capturedAt)+(state?' · '+state.label:'')+'; reported 3-day window, exact bounds/quality/stock unknown; daily/full variants remain separate.';},{rawBasicCapturedAt:d.capturedAt});
  }
  const displayPrice=row=>row.calculationReference?.available?exactTenths(row.calculationReference.exactMedianLexeme):number(row.price,1);
  function calculationLabel(row){
    const ref=row.calculationReference,history=row.apiDailyHistory||[],latest=history.at(-1),legacy=row.legacyDailyEvidence;
    let text=ref.available?`API sale median ${displayPrice(row)} mesos · ${number(ref.recordedSalesCount)} reported sales / reported 3-day lookback (bounds unknown), retrieved ${instant(ref.capturedAt)}; individual sale times and constant item quality unknown`:'API 3-day sale-median reference unavailable; no prior-source price filled';
    text+=history.length?` · separate actual API daily history ${calendarDay(history[0].day)}–${calendarDay(latest.day)} (${history.length} retained source days${latest.partialCalendarDay?' · latest source day partial':''}); latest original daily receipt ${instant(latest.source.capturedAt)}`:' · separate actual API daily history unavailable';
    if(legacy?.priceDay)text+=` · prior-source daily evidence ${calendarDay(legacy.priceDay)}, publication ${instant(legacy.sourceUpdatedAt)}; retained separately`;
    return text;
  }
  function applyCalculationEvidence(){
    const data=currentReport,independent=Object.hasOwn(data||{},'apiItemEvidence'),view=independent?data.apiItemEvidence:data?.apiCalculationView,sourceRows=independent?view?.rows:data?.rows;if(!view||independent&&view.kind!=='api_item_evidence_view'||!Array.isArray(sourceRows)||sourceRows.length!==50)return;
    const refs=new Map(),slugs=new Set(),ids=new Set();
    for(const row of sourceRows){const ref=row?.currentApiReference;if(!validSlug(row?.slug)||typeof row.name!=='string'||!ref||!validId(ref.itemId)||ref.slug!==row.slug||ref.name!==row.name||slugs.has(row.slug)||ids.has(ref.itemId))return;slugs.add(row.slug);ids.add(ref.itemId);refs.set(row.slug,{row,ref});}
    const daily=new Map(),items=independent?view.dailyItems:data.apiDailyItems;
    if(Array.isArray(items)&&items.length===79&&items.filter(r=>r?.role==='goods').length===50&&items.filter(r=>r?.role==='cash').length===29&&new Set(items.map(r=>r?.itemId)).size===79&&new Set(items.map(r=>r?.slug)).size===79){
      for(const item of items){if(!validId(item.itemId)||!validSlug(item.slug)||!Array.isArray(item.points)||item.points.length>31)continue;const days=new Set();let valid=true;const points=[];
        for(const p of item.points){if(!p||!validDay(p.day)||days.has(p.day)||!(p.medianUnitPriceLexeme===null&&p.qualified===false||typeof p.medianUnitPriceLexeme==='string'&&/^\d+(?:\.\d+)?$/.test(p.medianUnitPriceLexeme)&&Number.isFinite(Number(p.medianUnitPriceLexeme)))||!Number.isSafeInteger(p.recordedSalesCount)||p.recordedSalesCount<0||typeof p.qualified!=='boolean'||typeof p.partialCalendarDay!=='boolean'||!captureClock(p.source?.capturedAt)){valid=false;break;}days.add(p.day);points.push({...p,source:{...p.source}});}
        if(valid)daily.set(item.slug,{itemId:item.itemId,role:item.role,points:points.sort((a,b)=>a.day.localeCompare(b.day))});
      }
    }
    records=records.map(existing=>{const match=refs.get(existing.sourceSlug||existing.slug);if(!match||match.row.name!==existing.name||existing.id!==null&&existing.id!==undefined&&existing.id!==match.ref.itemId)return existing;
      const {row,ref}=match,lexeme=ref.currentSaleMedianLexeme,available=typeof lexeme==='string'&&lexeme.length<=160&&/^\d+(?:\.\d+)?$/.test(lexeme)&&positive(Number(lexeme))&&Number(lexeme)<=Number.MAX_SAFE_INTEGER&&Number.isSafeInteger(ref.recordedSalesCount)&&ref.recordedSalesCount>=5&&ref.reportedDays===3&&captureClock(ref.capturedAt)&&ref.capturedAt===view.clocks?.currentPrices;
      const actual=daily.get(row.slug),legacy={...(row.legacyEvidence||{}),history:Array.isArray(row.history)?row.history.map(p=>Array.isArray(p)?[...p]:p):[],sourceUpdatedAt:data.sourceUpdatedAt};
      return {...existing,id:ref.itemId,price:available?Number(lexeme):null,priceDay:null,carried:false,dailyRate:null,type:'Fixed goods basket · API 3-day reference',calculationReference:{available,exactMedianLexeme:available?lexeme:null,recordedSalesCount:ref.recordedSalesCount,capturedAt:ref.capturedAt},apiDailyHistory:actual?.role==='goods'&&actual.itemId===ref.itemId?actual.points:[],legacyDailyEvidence:legacy};
    });
  }
  function calculationCoverage(){const view=currentReport?.apiItemEvidence||currentReport?.apiCalculationView;if(!view)return '';const count=records.filter(r=>r.calculationReference?.available).length;return ` Fixed-basket API references: ${count}/50 raw sale medians over a reported 3-day lookback (bounds unknown), retrieved ${instant(view.clocks?.currentPrices)}. Actual API daily histories and older source records retain their separate dates; other items are not refreshed by this clock.${currentReport.apiItemEvidence?' Item evidence is independent of any separately retained complete goods calculation.':''}`;}
  function collect(data){
    const rows=[],bySlug=new Map(),byId=new Map();
    function add(raw,type,fromCatalog=false){
      if(!raw||!validSlug(raw.slug)||typeof raw.name!=='string')return;
      const id=validId(raw.canonicalId)?raw.canonicalId:null,existing=bySlug.get(raw.slug)||(id?byId.get(id):null);
      if(existing){if(fromCatalog){const qualified=positive(raw.price)&&validDay(raw.priceDay)&&Number.isInteger(raw.quantity)&&raw.quantity>=5;existing.price=qualified?raw.price:null;existing.priceDay=qualified?raw.priceDay:null;existing.type=type;existing.catalogKey=raw.slug;existing.catalog=true;existing.publisherMedian=positive(raw.publisherMedian)?raw.publisherMedian:null;existing.knownNxCost=positive(raw.knownNxCost)?raw.knownNxCost:null;existing.dailyRate=existing.price!==null&&existing.knownNxCost!==null?existing.price/existing.knownNxCost:null;if(id){existing.id=id;byId.set(id,existing);}bySlug.set(raw.slug,existing);}return;}
      const qualified=positive(raw.price)&&validDay(raw.priceDay)&&Number.isInteger(raw.quantity)&&raw.quantity>=5;
      const price=qualified?raw.price:null,nx=fromCatalog?(positive(raw.knownNxCost)?raw.knownNxCost:null):(type==='Known-price cash'&&positive(raw.nx)?raw.nx:null);
      const row={key:raw.slug,slug:raw.slug,id,name:raw.name,type,price,priceDay:qualified?raw.priceDay:null,publisherMedian:positive(raw.publisherMedian)?raw.publisherMedian:positive(raw.sourceSummary?.medianSale)?raw.sourceSummary.medianSale:null,knownNxCost:nx,dailyRate:price!==null&&nx!==null?price/nx:null,catalog:fromCatalog,catalogKey:raw.slug,metadata:false};
      rows.push(row);bySlug.set(raw.slug,row);if(id)byId.set(id,row);
    }
    for(const row of data.rows||[])add(row,'Tracked goods');for(const row of data.contextItems||[])add(row,'Tracked goods context');
    for(const row of data.cash||[])add(row,'Known-price cash');
    const catalog=data.cashCatalog;if(catalog?.schemaVersion===1&&catalog.kind==='cash_shop_source_catalog'){
      for(const row of catalog.rows||[])add(row,'Cash provider market',true);
      for(const raw of catalog.metadataItems||[]){if(!raw||!validId(raw.id)||typeof raw.name!=='string'||raw.cash!==true||raw.marketDataAvailable!==false||byId.has(raw.id)||raw.providerSlug&&bySlug.has(raw.providerSlug))continue;const row={key:'metadata-'+raw.id,slug:null,id:raw.id,name:raw.name,type:'Client metadata only',price:null,priceDay:null,publisherMedian:null,knownNxCost:null,dailyRate:null,catalog:true,catalogKey:'metadata-'+raw.id,metadata:true,metadataDate:sourceDay(raw.metadataCapturedAt),metadataCapturedAt:raw.metadataCapturedAt??null};rows.push(row);byId.set(raw.id,row);}
    }
    const refs=data.cashPriceReferences;if(refs?.schemaVersion===1&&refs.kind==='supplemental_cash_rolling_references'&&refs.sourceUrl==='https://mesos.watch/'&&Array.isArray(refs.items)){const seenRefs=new Set();for(const ref of refs.items){if(!ref||!validId(ref.id)||seenRefs.has(ref.id)||ref.id!==ref.expectedItemId||typeof ref.name!=='string'||typeof ref.expectedItemName!=='string'||ref.name.toLocaleLowerCase()!==ref.expectedItemName.toLocaleLowerCase()||ref.priceBasis!=='median of sales'||!positive(ref.price)||!Number.isInteger(ref.salesCounted)||ref.salesCounted<1||!positive(ref.windowDays)||ref.windowDays>90||!Number.isFinite(Date.parse(ref.capturedAt))||!/(?:Z|[+-]\d\d:\d\d)$/.test(ref.capturedAt))continue;seenRefs.add(ref.id);let row=byId.get(ref.id);if(row&&row.name.toLocaleLowerCase()!==ref.name.toLocaleLowerCase())continue;if(!row){row={key:'supplemental-'+ref.id,slug:null,id:ref.id,name:ref.name,type:'Separate rolling reference',price:null,priceDay:null,publisherMedian:null,knownNxCost:null,dailyRate:null,catalog:true,catalogKey:'supplemental-'+ref.id,metadata:false,supplementalOnly:true};rows.push(row);byId.set(ref.id,row);}row.rollingReference=ref;row.rollingPrice=ref.price;if(row.metadata)row.type='Client metadata + separate rolling reference';}}
    for(const row of rows){row.sprite=safeSprite(data.spriteMap?.[row.slug]||data.spriteMap?.[row.id]);row.evidenceDate=row.metadata?`${row.metadataDate?'Metadata receipt '+row.metadataDate:'Metadata receipt time unknown'} · source time unknown`:row.priceDay?'Qualified daily price · '+row.priceDay:`${sourceDay(data.sourceUpdatedAt)?'Source snapshot '+sourceDay(data.sourceUpdatedAt):'Source date unknown'} · no qualified daily price`;}
    for(const row of rows)if(row.rollingReference)row.evidenceDate+=` · separate rolling median ${number(row.rollingPrice,1)} mesos / ${row.rollingReference.windowDays}-day lookback, captured ${row.rollingReference.capturedAt}; underlying time ${row.rollingReference.observationTimestampKnown&&row.rollingReference.sourceObservedAt?row.rollingReference.sourceObservedAt:'unknown'}`;
    return rows;
  }
  function draw(){
    populateCategories();
    const filtered=records.filter(row=>matches(row)&&matchesCategory(row)).sort((a,b)=>{const av=a[sortKey],bv=b[sortKey];if(av===null||av===undefined)return bv===null||bv===undefined?a.key.localeCompare(b.key):1;if(bv===null||bv===undefined)return -1;const delta=typeof av==='number'&&typeof bv==='number'?av-bv:String(av).localeCompare(String(bv),undefined,{numeric:true});return delta*(ascending?1:-1)||a.key.localeCompare(b.key);});
    pageIndex=Math.min(pageIndex,Math.max(0,Math.ceil(filtered.length/pageSize)-1));const shown=filtered.slice(pageIndex*pageSize,(pageIndex+1)*pageSize),table=make('table');table.dataset.searchReady='true';table.setAttribute('aria-label','Price check results');const head=table.createTHead().insertRow();
    for(const [key,title] of activeColumns()){const th=make('th');if(key==='action')th.textContent=title;else{th.setAttribute('aria-sort',key===sortKey?(ascending?'ascending':'descending'):'none');const button=make('button','',title+(key===sortKey?(ascending?' ↑':' ↓'):''));button.type='button';button.dataset.priceSort=key;th.append(button);}head.append(th);}
    const body=table.createTBody();for(const row of shown){const tr=body.insertRow();tr.dataset.priceKey=row.key;tr.dataset.priceCategory=sourceCategory(row)||'unknown';const name=tr.insertCell(),label=make('span','price-check-item-copy');label.append(make('strong','',row.name),make('small','',row.type+(row.id?' · item '+row.id:'')));if(row.calculationReference)label.append(bindClockText(make('small','price-check-calculation-evidence'),()=>calculationLabel(row),{rawApiCapturedAt:row.calculationReference.capturedAt}));const apiEvidence=apiEvidenceNode(row);if(apiEvidence)label.append(apiEvidence);const indicator=apiStatusNode(row);if(indicator)label.append(indicator);const basic=basicEvidenceNode(row);if(basic)label.append(basic);if(row.apiIdentity)label.append(bindClockText(make('small','price-check-api-identity-evidence'),()=> row.apiIdentity.knownSourceId?currentIdentityEvidence(row.apiIdentity):'Retained API identity · '+row.apiIdentity.memberships.map(m=>m.operation+(m.presentInSnapshot?' · accepted snapshot · ':' · retained membership · ')+instant(m.capturedAt)).join(' · ')+'; observation times unknown.'));name.append(sprite(row),label);const priceCell=tr.insertCell();priceCell.textContent=displayPrice(row);if(row.calculationReference?.exactMedianLexeme){priceCell.dataset.exactApiMedian=row.calculationReference.exactMedianLexeme;priceCell.title='Exact API sale-median lexeme '+row.calculationReference.exactMedianLexeme+' mesos; reported 3-day window, unknown bounds.';}const summaryCell=tr.insertCell();summaryCell.textContent=number(row.publisherMedian,1);if(row.calculationReference)summaryCell.title='Separate prior-source summary median; unspecified window; publication '+instant(row.legacyDailyEvidence.sourceUpdatedAt);tr.insertCell().textContent=number(row.knownNxCost);tr.insertCell().textContent=number(row.dailyRate,2);const dateCell=tr.insertCell();if(row.calculationReference)bindClockText(dateCell,()=> 'Reported 3-day lookback · bounds unknown · retrieved '+instant(row.calculationReference.capturedAt),{rawApiCapturedAt:row.calculationReference.capturedAt});else dateCell.textContent=row.priceDay||(row.lazyDetail?'No qualifying daily price date':row.rollingReference?'No daily market date':'No market date');if(records.some(r=>r.rollingReference)){const cell=tr.insertCell();cell.append(make('span','',number(row.rollingPrice,1)));if(row.rollingReference)cell.append(bindClockText(make('small'),()=>`${row.rollingReference.windowDays}-day reported lookback · captured ${instant(row.rollingReference.capturedAt)} · source time ${row.rollingReference.observationTimestampKnown&&row.rollingReference.sourceObservedAt?instant(row.rollingReference.sourceObservedAt):'unknown'}; not daily / live / fixed NX`,{rawCapturedAt:row.rollingReference.capturedAt,rawSourceObservedAt:row.rollingReference.sourceObservedAt}));}const action=tr.insertCell();if(row.catalog&&!row.lazyDetail){const button=make('button','price-check-evidence',row.rollingReference?'Separate rolling evidence':row.metadata?'Metadata evidence':'Cash history');button.type='button';button.dataset.priceCatalog=row.key;action.append(button);}else{const link=make('a','','Item history →');link.href='#item/'+encodeURIComponent(row.slug);action.append(link);}}
    if(!shown.length){const td=body.insertRow().insertCell();td.colSpan=activeColumns().length;td.textContent='No matching public tracked record. This does not establish that an item is absent from the game.';}
    tableHost.replaceChildren(table);result.textContent=filtered.length?`${pageIndex*pageSize+1}–${pageIndex*pageSize+shown.length} of ${filtered.length} matches · ${records.length} public records`:`0 matches · ${records.length} public records`;
    page.querySelector('[data-price-page="previous"]').disabled=pageIndex===0;page.querySelector('[data-price-page="next"]').disabled=(pageIndex+1)*pageSize>=filtered.length;page.querySelector('[data-price-clear]').disabled=!query&&categoryChoice==='all';
  }
  function receive(data){if(data&&data===currentReport){refreshClockLabels();return;}currentReport=data||null;baseRecords=collect(data||{});records=baseRecords;const goods=records.filter(row=>row.type.startsWith('Tracked goods')).length,cash=records.filter(row=>!row.metadata&&!row.type.startsWith('Tracked goods')).length,metadata=records.filter(row=>row.metadata).length;setCoverage(()=>`${records.length} deduplicated public records: ${goods} tracked goods/context + ${cash} cash market records + ${metadata} ${records.some(r=>r.rollingReference)?'client-metadata records (separate rolling evidence labeled)':'metadata-only'}. Coverage is public tracked goods plus the cash catalog, not all feed items or the entire game. Daily source ${instant(data?.sourceUpdatedAt,'not connected yet')}; metadata clocks are separate.`);if(records.some(r=>r.rollingReference)){const only=records.filter(r=>r.supplementalOnly).length,refs=records.filter(r=>r.rollingReference).length;setCoverage(()=>`${records.length} deduplicated public records: ${goods} tracked goods/context + ${cash-only} cash provider records + ${only} rolling-only records + ${metadata} client-metadata records. ${refs} have separate supplemental rolling medians with individual capture windows/clocks; these are not additional daily observations or verified NX costs. Daily source ${instant(data?.sourceUpdatedAt)}. Coverage is collected public records, not all feed items or the entire game.`);}fallbackCoverage=clockBindings.get(coverage);apiCoverageBase=fallbackCoverage;applyApiIdentities();draw();drawSuggestions();if(fullCatalogDemanded){const loaded=window.AstraFullMarket?.client.peek();demandFullCatalog(!!loaded&&!window.AstraFullMarket.matchesReport(currentReport,loaded));}}
  const setQuery=value=>{setActive(-1);query=String(value).slice(0,250);for(const field of [headerInput,input])if(field.value!==query)field.value=query;pageIndex=0;draw();drawSuggestions();};
  for(const field of [headerInput,input]){
    field.setAttribute('role','combobox');field.setAttribute('aria-autocomplete','list');field.setAttribute('aria-controls',list.id);field.setAttribute('aria-expanded','false');field.maxLength=250;
    field.addEventListener('focus',()=>{if(!suppressFocus)openSuggestions(field);demandFullCatalog();});
    field.addEventListener('input',()=>{setQuery(field.value);openSuggestions(field);});field.addEventListener('search',()=>{setQuery(field.value);openSuggestions(field);});
    field.addEventListener('keydown',event=>{if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();if(popup.hidden||activeInput!==field)openSuggestions(field);if(suggestions.length)setActive((activeIndex+(event.key==='ArrowDown'?1:activeIndex<0?0:-1)+suggestions.length)%suggestions.length);}else if(event.key==='Enter'){event.preventDefault();const row=!popup.hidden&&activeInput===field?suggestions[activeIndex]:null;if(row)openRecord(row);else openResults();}else if(event.key==='Escape'){event.preventDefault();closeSuggestions();}else if(event.key==='Tab')closeSuggestions();});
  }
  headerSearch.addEventListener('submit',event=>{event.preventDefault();openResults();});viewAll.addEventListener('click',openResults);
  popup.addEventListener('mousedown',event=>event.preventDefault());popup.addEventListener('click',event=>{const option=event.target.closest('[data-price-suggestion]');if(option&&suggestions[Number(option.dataset.priceSuggestion)])openRecord(suggestions[Number(option.dataset.priceSuggestion)]);});
  document.addEventListener('pointerdown',event=>{if(!popup.contains(event.target)&&event.target!==headerInput&&event.target!==input)closeSuggestions();});document.addEventListener('focusin',event=>{if(event.target!==headerInput&&event.target!==input&&!popup.contains(event.target))closeSuggestions();});
  window.addEventListener('resize',positionSuggestions);window.addEventListener('scroll',positionSuggestions,true);window.addEventListener('hashchange',()=>{closeSuggestions();if(location.hash==='#price-check')demandFullCatalog();});
  page.addEventListener('click',event=>{const clear=event.target.closest('[data-price-clear]');if(clear){categoryChoice='all';setQuery('');input.focus();openSuggestions(input);return;}const paging=event.target.closest('[data-price-page]');if(paging){pageIndex+=paging.dataset.pricePage==='next'?1:-1;draw();return;}const sort=event.target.closest('[data-price-sort]');if(sort){const key=sort.dataset.priceSort;ascending=sortKey===key?!ascending:key==='name'||key==='priceDay';sortKey=key;pageIndex=0;draw();page.querySelector('[data-price-sort="'+key+'"]')?.focus();return;}const evidence=event.target.closest('[data-price-catalog]');if(evidence){const row=records.find(item=>item.key===evidence.dataset.priceCatalog);if(row)openRecord(row);}});
  document.getElementById('display-timezone')?.addEventListener('change',refreshClockLabels);
  document.addEventListener('visibilitychange',refreshClockLabels);window.addEventListener('offline',refreshClockLabels);window.addEventListener('online',refreshClockLabels);
  let apiCoverageBase=null;function applyApiIdentities(){const api=window.AstraItemApiPreview;if(api)records=api.mergeSearchRecords(records);applyCalculationEvidence();if(apiCoverageBase)setCoverage(()=> (api?.enabled?'Prior-source collection: ':'')+apiCoverageBase()+(api?.enabled?' '+api.coverage():'')+calculationCoverage());draw();drawSuggestions();}document.addEventListener('astrapiitemidentities',applyApiIdentities);
  document.addEventListener('astrabasicitemcache',()=>{draw();drawSuggestions();});
  let apiEvidenceHash=null;document.addEventListener('astraapicashchange',()=>{const hash=window.AstraApiCash?.getState().data?.subsetHash||null;if(hash===apiEvidenceHash){refreshClockLabels();return;}apiEvidenceHash=hash;draw();drawSuggestions();refreshClockLabels();});
  document.addEventListener('astramarketsnapshot',event=>receive(event.detail));receive(null);document.dispatchEvent(new Event('astramarkethighlightsready'));if(window.location.hash==='#price-check')window.dispatchEvent(new Event('hashchange'));
})();

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "price-check.js", status: "initialization_failed"}})); } catch {}
}

;
/* Astra source: cash-highlights.js */
try {
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
    const pricing = window.AstraApiCash?.pricing(report, options) || window.buildCashPricing(report, options);
    if (!Array.isArray(pricing?.rows)) return null;
    const eligible = pricing.rows.filter(row => row && /^[a-z0-9][a-z0-9-]*$/.test(row.slug) && typeof row.name === 'string'
      && positive(row.nx) && positive(row.price) && positive(row.rate) && positive(row.referenceWeight)
      && positive(row.quantity) && positive(row.windowDays) && row.missing !== true && !row.referenceExclusion);
    const compare = (a, b) => a.rate - b.rate || a.name.localeCompare(b.name) || a.slug.localeCompare(b.slug);
    const fees=window.AstraTradeFees,feeState=fees?.getState(),feeActive=!!fees&&feeState.mode!=='gross',grossFallback=feeActive&&feeState.rules?.[feeState.mode]?.enabled!==true,netRanking=feeActive&&!grossFallback;
    const activity=window.AstraCashActivity;let activityResult=null;
    const chosen=side=>{let rows=netRanking?fees.rank(eligible,side).map(row=>({...row,grossRate:row.rate,rate:row.netRate})):(side==='buy'?[...eligible].sort(compare):[...eligible].sort((a,b)=>b.rate-a.rate||a.name.localeCompare(b.name)||a.slug.localeCompare(b.slug)));
      const result=activity?.rank(rows,{side,model:pricing});if(result){rows=result.rows;activityResult=result;}return rows.slice(0,5);};
    const buy=chosen('buy'),sell=chosen('sell');
    const fullFeeReference=!pricing.api||(eligible.length===29&&(!netRanking||(fees.rank(eligible,'buy').length===29&&fees.rank(eligible,'sell').length===29)));
    return { ...pricing, buy, sell, activityResult, feeActive,grossFallback,netRanking,feeMode:feeState?.mode,feeReferences:netRanking&&fullFeeReference?{buy:fees.reference(eligible,'buy'),sell:fees.reference(eligible,'sell')}:null,eligibleCount: eligible.length, totalCount: pricing.rows.length,
      sourceUpdatedAt: pricing.api?null:report.sourceUpdatedAt, capturedAt: pricing.api?pricing.capturedAt:report.rollingReference?.capturedAt || null, apiFallbackReason:pricing.api?null:window.AstraApiCash?.fallbackReason()||null };
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
  const clockBindings = new WeakMap();
  let requestedZone = null, validatedZone = 'UTC', formatterZone = null, instantFormatter = null;
  function selectedZone() {
    const value = document.getElementById('display-timezone')?.value || 'UTC';
    if (value !== requestedZone) {
      requestedZone = value;
      try { new Intl.DateTimeFormat('en-US', { timeZone: value }); validatedZone = value; } catch { validatedZone = 'UTC'; }
    }
    return validatedZone;
  }
  const calendarDay = value => day(value) ? `${value.slice(5, 7)}-${value.slice(8, 10)}-${value.slice(0, 4)}` : 'Unknown';
  function instant(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
        || !day(value.slice(0, 10)) || Number(value.slice(11, 13)) > 23 || Number(value.slice(14, 16)) > 59
        || Number(value.slice(17, 19)) > 59 || !Number.isFinite(Date.parse(value))) return 'Unknown';
    const zone = selectedZone();
    if (zone !== formatterZone) {
      instantFormatter = new Intl.DateTimeFormat('en-US', { timeZone: zone,
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZoneName: 'short' });
      formatterZone = zone;
    }
    const parts = Object.fromEntries(instantFormatter.formatToParts(new Date(value)).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
    return `(${parts.month}-${parts.day}-${parts.year} ${parts.hour}:${parts.minute}:${parts.second} ${parts.timeZoneName}${parts.timeZoneName === zone ? '' : ' · ' + zone})`;
  }
  function bindClock(node, render, raw = {}) {
    node.dataset.cashInstantLabel = 'true'; node.dataset.rawDate = 'true';
    for (const [key, value] of Object.entries(raw)) if (typeof value === 'string') node.dataset[key] = value;
    clockBindings.set(node, render); node.textContent = render(); return node;
  }
  function refreshClocks() {
    for (const node of section.querySelectorAll('[data-cash-instant-label]')) {
      const render = clockBindings.get(node); if (render) node.textContent = render();
    }
  }
  const signed = value => { const rounded = Math.abs(value) < .05 ? 0 : value; return (rounded > 0 ? '+' : '') + number(rounded) + '%'; };
  const section = make('section', undefined, 'cash-item-highlights'); section.id = 'cash-item-highlights'; section.setAttribute('aria-labelledby', 'cash-highlights-title');
  section.innerHTML = '<div class="section-heading"><div><p class="eyebrow">CASH COMPANION / INDIVIDUAL ITEM PRICES</p><h2 id="cash-highlights-title">Inside cash items</h2></div></div><div class="cash-highlights-content"><p class="cash-highlights-explanation">These individual cash-item dials are excluded from the goods MPI and the goods-based NX benchmark. Seasonal supply, demand and cosmetic mixes can move them separately.</p><p class="cash-highlights-status" role="status"></p><div class="cash-highlights-row" tabindex="0" role="region" aria-label="Individual cash-item price dials; scroll horizontally on narrow screens"></div><p class="cash-highlights-method"></p></div>';
  const apiCredit=make('p',undefined,'cash-highlights-api-credit'),apiCreditLink=make('a','Prices from maplestory.market ↗');apiCreditLink.href='https://maplestory.market/?ref=v6kkdvp6';apiCreditLink.target='_blank';apiCreditLink.rel='noopener noreferrer';apiCredit.append(apiCreditLink);apiCredit.hidden=true;section.querySelector('.cash-highlights-content').append(apiCredit);
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
  window.AstraCashActivity?.mount(section);
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
    const referenceLabel=number(reference),labelInset=Math.min(64,Math.max(20,referenceLabel.length*6+2));
    add('text', { x: Math.max(labelInset, Math.min(140-labelInset, tx)), y: Math.max(14, Math.min(60, ty - 2)), 'text-anchor': 'middle' }).textContent = referenceLabel;
    add('text', { x: 14, y: 82 }).textContent = '0'; add('text', { x: 126, y: 82, 'text-anchor': 'end' }).textContent = number(upper, 0);
    return svg;
  }
  function drawReference() {
    window.AstraCashActivity?.configure(section,{referenceOnly:true});
    section.dataset.apiEvidence='false';apiCredit.hidden=true;
    cardsRoot.className = 'cash-highlights-row';
    const current = model(report), row = cardsRoot; row.replaceChildren();
    if (!current || !current.cards.length) {
      section.querySelector('.cash-highlights-status').textContent = 'Individual cash dials are unavailable: a verified fixed NX schedule and frozen cash reference prices are required. Missing prices are not zero.';
      section.querySelector('.cash-highlights-method').textContent = ''; return;
    }
    const upper = scale(current.cards.map(card => card.index));
    bindClock(section.querySelector('.cash-highlights-status'), () => `Reference week (${calendarDay(current.baseStart)}–${calendarDay(current.baseEnd)}) = 100 for each item. Daily source published ${instant(current.sourceUpdatedAt)}; latest source-calendar day (${calendarDay(current.sourceDay)})${current.partialSourceDay ? ' is partial' : ''}.${report.sourceStatus?.status === 'degraded' ? ' Source checks are degraded; the dated retained prices remain visible.' : ''}`, { rawSourcePublicationAt: current.sourceUpdatedAt });
    for (const card of current.cards) {
      const article = make('article', undefined, 'cash-highlight-card'); article.dataset.cashHighlightSlug = card.slug;
      const heading = make('h3'), link = make('a'); link.href = '#item/' + encodeURIComponent(card.slug);
      const image = make('img'); image.alt = ''; image.width = 40; image.height = 40; image.loading = 'lazy';
      const mapped = report.spriteMap?.[card.slug]; image.src = typeof mapped === 'string' && /^assets\/[A-Za-z0-9._-]+\.(?:png|webp|gif|svg)$/.test(mapped) ? mapped : 'assets/' + card.slug + '.svg';
      link.append(image, make('span', card.name)); heading.append(link); article.append(heading);
      if (card.index !== null) {
        article.append(gauge(card.index, upper, card.name), make('strong', number(card.index), 'cash-highlight-index'), make('span', signed(card.change) + ' vs. reference week', 'cash-highlight-change'));
        article.append(bindClock(make('p', undefined, 'cash-highlight-date'), () => `${card.carried ? 'Carried qualifying price' : 'Qualified daily price'} · (${calendarDay(card.priceDay)})${card.partial ? ' · partial source day' : ''}`, { sourceDay: card.priceDay }));
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
    window.AstraCashActivity?.configure(section,current);
    section.dataset.apiEvidence=String(current.api===true);apiCredit.hidden=current.api!==true;
    const evidenceWindow = () => current.api ? `${current.retained?'Retained API reference':'API sale medians'} · reported 3-day window (exact bounds unknown) · API retrieved ${instant(current.capturedAt)}; individual sale/scan times unknown.` : current.rolling ? `Rolling scanner capture · Batch retrieved ${instant(current.capturedAt)}; item timestamps and lookbacks are separate. Retrieval times are not trade times; source times unavailable where not supplied.` : `${current.days}-source-day lookback · (${calendarDay(current.start)}–${calendarDay(current.end)}) inclusive${current.partial ? ' · latest day partial' : ''}. Daily source published ${instant(current.sourceUpdatedAt)}.`;
    bindClock(status, () => `${current.apiFallbackReason?current.apiFallbackReason+'. ':''}${evidenceWindow()} ${current.activityResult?.note||''} ${current.eligibleCount} / ${current.totalCount} fixed-price items have eligible evidence. ${current.eligibleCount < 5 ? 'Fewer than five eligible items; missing items are not filled.' : 'Up to five per side.'}${current.grossFallback?' Gross order shown; net unavailable until fee rules are set.':current.netRanking?' Fee assumptions: '+window.AstraTradeFees.label()+'. Only computable estimated costs/proceeds are ranked; no official fee rule is claimed.':''}`, { rawSourcePublicationAt: current.sourceUpdatedAt, rawBatchCapturedAt: current.rolling ? current.capturedAt : null });
    const upper = rateScale([...current.buy, ...current.sell].map(row => row.rate).concat(positive(current.reference) ? current.reference : []));
    for (const [side, title, rows] of [['sell', 'Best to Sell (Higher Meso/NX)', current.sell], ['buy', 'Best to Buy (Lower Meso/NX)', current.buy]]) {
      const group = make('section', undefined, 'cash-highlights-ranking'); group.dataset.cashRanking = side;
      const rankingTitle=current.activityResult?.active?(side==='sell'?'Best to Sell · activity-adjusted value':'Best to Buy · activity-adjusted value'):title;
      group.append(make('h3', rankingTitle));group.dataset.cashRankingBasis=current.grossFallback?'gross_unset_fees':current.netRanking?'manual_net':'gross';if(current.grossFallback)group.append(make('span','Gross ranking · fees unset','cash-highlights-gross-badge'));
      const row = make('div', undefined, 'cash-highlights-row'); row.tabIndex = 0; row.setAttribute('role', 'region'); row.setAttribute('aria-label', `${rankingTitle} cash dials; scroll horizontally on narrow screens`);
      for (const item of rows) {
        const card = make('article', undefined, 'cash-highlight-card'); card.dataset.cashHighlightSlug = item.slug; card.dataset.cashRate = item.rate; card.dataset.cashCardSide = side;if(item.grossRate!==undefined)card.dataset.cashGrossRate=item.grossRate;
        const heading = make('h4'), link = make('a'); link.href = '#item/' + encodeURIComponent(item.slug);
        const image = make('img'); image.alt = ''; image.width = 40; image.height = 40; image.loading = 'lazy';
        const mapped = report.spriteMap?.[item.slug]; image.src = typeof mapped === 'string' && /^assets\/[A-Za-z0-9._-]+\.(?:png|webp|gif|svg)$/.test(mapped) ? mapped : 'assets/' + item.slug + '.svg';
        link.append(image, make('span', item.name)); heading.append(link); card.append(heading);
        const selectedReference=current.feeReferences?.[side]??current.reference;
        if(item.rate>=0&&positive(selectedReference))card.append(gauge(item.rate,upper,item.name,selectedReference,true));
        card.append(make('strong', number(item.rate, 2), 'cash-highlight-index'), make('span', current.grossFallback?'Gross mesos/NX':current.netRanking?(side==='buy'?'Estimated cost · mesos / NX':'Estimated proceeds · mesos / NX'):'mesos / NX', 'cash-highlight-change'));
        if(current.netRanking)card.append(make('small',`Gross ${number(item.grossRate,2)} mesos / NX · ${item.feePreview.itemCount} copies · ${item.feePreview.assumptionProvenance==='user_reported'?'user-reported estimate':'manual estimate'}${item.feePreview.allocatedShopCost?' · allocated shop cost included':''}`));
        if(current.activityResult?.active&&Number.isFinite(item.activityScore))card.append(make('small',`Activity score ${number(item.activityScore,1)} / 100 · count factor ${number(item.activityFactor,2)} · heuristic, not liquidity`));
        card.append(make('p', `${number(item.price, 1)} mesos · fixed ${number(item.nx, 0)} NX`, 'cash-highlight-price'));
        const dateLabel = make('p', undefined, 'cash-highlight-date'); let sourceLabel = null;
        if (current.api) {
          dateLabel.title='API receipt time, not an individual sale timestamp. Item-level qualities can mix.';
          bindClock(dateLabel,()=>`API retrieved ${instant(current.capturedAt)} · reported 3-day lookback`,{rawApiCapturedAt:current.capturedAt});
        } else if (current.rolling) {
          const observation = report.rollingReference?.items?.find(entry => entry.name === item.name);
          dateLabel.title = 'Retrieved is this item’s capture receipt, not a trade timestamp. A separate source-observation clock appears only when supplied and marked as known.';
          bindClock(dateLabel, () => `Retrieved ${instant(observation?.capturedAt)} · ${number(item.windowDays)}-day lookback`,
            { rawCapturedAt: observation?.capturedAt, rawSourceObservedAt: observation?.sourceObservedAt, captureTimeKind: observation?.captureTimeKind });
          if (observation?.observationTimestampKnown === true && instant(observation.sourceObservedAt) !== 'Unknown') {
            sourceLabel = make('small', undefined, 'cash-highlight-source-time');
            bindClock(sourceLabel, () => `Source observed ${instant(observation.sourceObservedAt)}`, { rawSourceObservedAt: observation.sourceObservedAt });
          }
        } else bindClock(dateLabel, () => `Selected dates (${calendarDay(current.start)}–${calendarDay(current.end)}) · ${number(item.windowDays, 0)} qualifying days`,
          { sourceStartDay: current.start, sourceEndDay: current.end });
        card.append(dateLabel);
        if (sourceLabel) card.append(sourceLabel);
        card.append(make('small', `${number(item.quantity, 0)} ${current.api?'reported sales (not physical units)':'recorded source count'}${item.windowDays < current.days && !current.rolling&&!current.api ? ' · incomplete daily coverage' : ''}`)); row.append(card);
      }
      if (!rows.length) row.append(make('p',current.feeActive?'Estimated cost/proceeds ranking unavailable until eligible evidence and explicit manual assumptions are available. Gross view remains available.':'No eligible prices for this evidence window.','cash-highlight-unavailable'));
      const fullList = make('button', `View full ${side === 'sell' ? 'sell' : 'buy'} list`, 'cash-ranking-full-list'); fullList.type = 'button'; fullList.dataset.cashRankingLink = side;
      fullList.addEventListener('click', () => {
        if(current.api&&window.AstraApiCashUi){window.AstraApiCashUi.focusList(side);return;}
        // Use the table's existing native button, preserving its sorting and fee events.
        const sideButton = document.querySelector(`button[data-cash-side="${side}"]`);
        sideButton?.click(); window.location.hash = '#nx';
      });
      group.append(row, fullList); cardsRoot.append(group);
    }
    method.textContent = current.api ? (current.grossFallback?'Gross order shown; net unavailable until fee rules are set. ':current.netRanking?'Same shared user-reported/manual fee assumptions as the API table. ':'')+'API per-item sale medians divided by the verified fixed NX cost; reported 3-day lookback, exact bounds and individual sale times unknown. Counts are reported sales, not physical units or unique players. All eligible API rows are ranked before filters; missing rows are never filled with daily or rolling prices. '+(current.eligibleCount===29?'The dial reference is the reported-sale-count weighted mean of all 29 item ratios.':'Full 29-item reference unavailable; partial coverage is not renormalized. Individual eligible prices remain visible.')+' Item-level qualities can mix. This is separate from the daily/rolling source views and the fixed Cash Basket. It changes no goods benchmark, MPI or history and is not an executable exchange quote.' : (current.grossFallback?'Gross order shown; net unavailable until fee rules are set. No zero-fee assumption is made. ':current.netRanking?'The selected fee assumptions use the same shared AstraTradeFees model as the NX table. No official rate is verified; estimated buyer cost and seller proceeds are separate, and fixed shop-cost allocation is an explicit business-cost assumption. ':'')+'Same fixed-NX schedule and selected evidence calculation as Best NX items to Buy/Sell. Daily estimates weight qualifying daily sale medians by recorded volume; each day needs at least five recorded sales. Rolling medians retain their own windows; excluded roll/upgrade-premium references are not ranked. Missing prices and unknown NX costs are excluded. Ranking uses all eligible items before table search/verdict filters: low mesos / NX for buying, high for selling, '+(current.netRanking?'under the selected explicit fee assumptions.':'before fees.')+' The dial tick is the selected-evidence cash reference, not 100 or the goods-based benchmark. These estimates are not executable quotes or profit calculations.';
  }
  function draw() {
    const status = section.querySelector('.cash-highlights-status'); clockBindings.delete(status);
    for (const key of Object.keys(status.dataset)) if (key === 'cashInstantLabel' || key === 'rawDate' || key.startsWith('raw')) delete status.dataset[key];
    section.dataset.enabled = String(enabled); section.dataset.cashHighlightsMode = mode; section.querySelector('.cash-highlights-content').hidden = !enabled;
    toggle.setAttribute('aria-pressed', String(enabled)); toggle.textContent = enabled ? 'On · hide dials' : 'Off · show dials';
    for (const button of controls.querySelectorAll('[data-cash-highlights-mode]')) button.setAttribute('aria-pressed', String(button.dataset.cashHighlightsMode === mode));
    if (mode === 'reference') drawReference(); else drawBest();
  }
  toggle.addEventListener('click', () => { enabled = !enabled; try { localStorage.setItem(key, enabled ? 'on' : 'off'); } catch { /* Tab choice still works. */ } draw(); });
  document.addEventListener('astramarketsnapshot', event => { report = event.detail; draw(); });
  document.getElementById('display-timezone')?.addEventListener('change', refreshClocks);
  document.addEventListener('astrafeeschange',draw);document.addEventListener('astracashactivitychange',draw);
  document.addEventListener('astraapicashchange',draw);document.addEventListener('astraapicashchoice',draw);
  for (const id of ['cash-lookback', 'cash-evidence']) document.getElementById(id)?.addEventListener('change', draw);
  draw(); document.dispatchEvent(new Event('astramarkethighlightsready'));
})();

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "cash-highlights.js", status: "initialization_failed"}})); } catch {}
}

;
/* Astra source: fee-preview.js */
try {
(() => {
  'use strict';
  if(window.AstraTradeFees)return;
  const key='astra-trade-fees-v1',modes=['gross','player_trade','shop'],roundings=['estimate','floor','ceil','nearest'];
  const blankRule=()=>({enabled:false,sellerPercent:null,buyerPercent:null,fixedShopMeso:null,shopCopies:null,durationDays:null,provenance:'manual'});
  const reportedRule=mode=>({...blankRule(),enabled:true,sellerPercent:mode==='shop'?1.5:3,buyerPercent:0,provenance:'user_reported',reportedOn:'2026-11-05'});
  const defaults=()=>({version:2,mode:document.documentElement.dataset.cashFeeDefault==='gross'?'gross':'player_trade',itemCount:1,quoteRounding:'estimate',feeRounding:'estimate',rules:{player_trade:reportedRule('player_trade'),shop:reportedRule('shop')}});
  const finite=v=>typeof v==='number'&&Number.isFinite(v),positive=v=>finite(v)&&v>0,safeCount=v=>Number.isSafeInteger(v)&&v>0;
  const clone=v=>JSON.parse(JSON.stringify(v));
  function normalize(raw){const base=defaults();if(!raw||typeof raw!=='object')return base;if(modes.includes(raw.mode))base.mode=raw.mode;if(safeCount(raw.itemCount))base.itemCount=raw.itemCount;for(const k of ['quoteRounding','feeRounding'])if(roundings.includes(raw[k]))base[k]=raw[k];for(const mode of ['player_trade','shop']){const r=raw.rules?.[mode];if(!r||typeof r!=='object')continue;const legacyEmpty=raw.version===1&&r.enabled===false&&r.sellerPercent===null&&r.buyerPercent===null&&r.fixedShopMeso==null&&r.shopCopies==null&&r.durationDays==null;if(legacyEmpty)continue;base.rules[mode]=blankRule();base.rules[mode].enabled=r.enabled===true;for(const k of ['sellerPercent','buyerPercent'])if(finite(r[k])&&r[k]>=0&&r[k]<=100)base.rules[mode][k]=r[k];if(finite(r.fixedShopMeso)&&r.fixedShopMeso>=0)base.rules[mode].fixedShopMeso=r.fixedShopMeso;for(const k of ['shopCopies','durationDays'])if(safeCount(r[k]))base.rules[mode][k]=r[k];const preset=reportedRule(mode);if(r.provenance==='user_reported'&&r.sellerPercent===preset.sellerPercent&&r.buyerPercent===0){base.rules[mode].provenance='user_reported';base.rules[mode].reportedOn=preset.reportedOn;}}return base;}
  let state=defaults();try{state=normalize(JSON.parse(localStorage.getItem(key)||'null'));}catch{}
  const rounded=(v,mode)=>mode==='floor'?Math.floor(v):mode==='ceil'?Math.ceil(v):mode==='nearest'?Math.round(v):v;
  function decimal(v){const [mantissa,exponent='0']=String(v).split('e'),digits=mantissa.replace('.',''),places=(mantissa.split('.')[1]?.length||0)-Number(exponent);return places>=0?[BigInt(digits),10n**BigInt(places)]:[BigInt(digits)*10n**BigInt(-places),1n];}
  function charge(gross,percent,mode){if(mode==='estimate')return gross*(percent/100);const [g,gd]=decimal(gross),[p,pd]=decimal(percent),n=g*p,d=gd*pd*100n,q=n/d,r=n%d;return Number(q+(mode==='ceil'&&r>0n||mode==='nearest'&&r*2n>=d?1n:0n));}
  function calculate(row,{side='sell'}={}){
    const result={mode:state.mode,status:'unavailable',manual:state.mode!=='gross',officialRuleVerified:false,grossRate:finite(row?.rate)?row.rate:null,grossUnitEstimate:positive(row?.price)?row.price:null,itemCount:state.itemCount,totalNx:null,grossMeso:null,sellerReceives:null,buyerSpends:null,allocatedShopCost:null,effectiveMeso:null,effectiveRate:null,reason:null};
    if(!positive(row?.price)||!positive(row?.nx)||!positive(row?.referenceWeight)||!positive(row?.quantity)||!positive(row?.windowDays)||row.missing===true||row.referenceExclusion){result.reason='Eligible sale evidence and a verified fixed NX cost are required.';return result;}
    const unit=state.mode==='gross'?row.price:rounded(row.price,state.quoteRounding),gross=unit*state.itemCount,nx=row.nx*state.itemCount;
    if(!positive(unit)||!Number.isSafeInteger(state.itemCount)||!positive(gross)||gross>Number.MAX_SAFE_INTEGER||!positive(nx)||nx>Number.MAX_SAFE_INTEGER){result.reason='Transaction assumptions exceed supported finite amounts.';return result;}
    result.totalNx=nx;result.grossMeso=gross;
    if(state.mode==='gross'){result.status='gross';result.manual=false;result.sellerReceives=result.buyerSpends=result.effectiveMeso=gross;result.allocatedShopCost=0;result.effectiveRate=row.rate;return result;}
    const rule=state.rules[state.mode];if(!rule.enabled||!finite(rule.sellerPercent)||!finite(rule.buyerPercent)){result.reason='Current official fees are unverified. Enable explicit manual seller/buyer assumptions, including 0 where none is assumed.';return result;}
    let allocated=0;if(state.mode==='shop'&&rule.fixedShopMeso!==null){if(!safeCount(rule.shopCopies)){result.reason='A fixed shop cost needs an explicit total number of copies over which to allocate it.';return result;}allocated=rule.fixedShopMeso/rule.shopCopies*state.itemCount;}
    const deduction=charge(gross,rule.sellerPercent,state.feeRounding),surcharge=charge(gross,rule.buyerPercent,state.feeRounding);
    if(deduction>gross){result.reason='The assumed rounding would deduct more than this transaction pays; choose an explicit executable quote or another assumption.';return result;}
    const receives=gross-deduction,spends=gross+surcharge,effective=side==='buy'?spends:receives-allocated;if(![receives,spends,allocated,effective].every(v=>finite(v)&&Math.abs(v)<=Number.MAX_SAFE_INTEGER)){result.reason='Transaction or allocated-cost assumptions exceed supported safe amounts.';return result;}
    result.sellerReceives=receives;result.buyerSpends=spends;result.allocatedShopCost=allocated;result.effectiveMeso=effective;result.effectiveRate=result.effectiveMeso/nx;
    if(!finite(result.effectiveRate)){result.reason='Manual assumptions do not produce a finite result.';result.effectiveMeso=result.effectiveRate=null;return result;}
    result.status='manual_estimate';result.assumptionProvenance=rule.provenance;result.reportedOn=rule.reportedOn||null;result.reason=(rule.provenance==='user_reported'?'User-reported rates (November 5, 2026), independently unverified.':'Manual estimate, not verified official fees.')+' Whole-transaction percentage charges; shop costs allocated by assumed copies, not time.';return result;
  }
  function decorate(rows,side){return (Array.isArray(rows)?rows:[]).map(row=>{const feePreview=calculate(row,{side});return{...row,feePreview,netRate:feePreview.effectiveRate,effectiveMeso:feePreview.effectiveMeso};});}
  function rank(rows,side){return decorate(rows,side).filter(r=>finite(r.netRate)).sort((a,b)=>(side==='buy'?a.netRate-b.netRate:b.netRate-a.netRate)||a.name.localeCompare(b.name)||a.slug.localeCompare(b.slug));}
  function reference(rows,side){const eligible=decorate(rows,side).filter(r=>finite(r.netRate)&&positive(r.referenceWeight));const weight=eligible.reduce((s,r)=>s+r.referenceWeight,0);return weight?eligible.reduce((s,r)=>s+r.netRate*r.referenceWeight,0)/weight:null;}
  const modeLabel=()=>state.mode==='gross'?'Gross · simplified':(state.mode==='shop'?'FM player shop':'Player trade')+(state.rules[state.mode].provenance==='user_reported'?' · user-reported estimate':' · manual estimate');
  function update(raw){state=normalize(raw);try{localStorage.setItem(key,JSON.stringify(state));}catch{}paint();document.dispatchEvent(new CustomEvent('astrafeeschange',{detail:{mode:state.mode,officialRuleVerified:false}}));}
  const api=Object.freeze({getState:()=>clone(state),setState:update,calculate,decorate,rank,reference,label:modeLabel});window.AstraTradeFees=api;
  const panels=[];
  const make=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
  function install(){for(const [id,anchor]of [['nx','cash-table'],['cards','cash-item-highlights']]){if(document.querySelector(`[data-fee-panel="${id}"]`))continue;const host=document.getElementById(anchor);if(!host)continue;
      const panel=make('section','fee-preview');panel.dataset.feePanel=id;panel.setAttribute('aria-label','Personal cash transaction-fee estimate');
      panel.innerHTML='<h3>Cash value after fees</h3><div class="fee-preview-modes" role="group" aria-label="Cash fee view"><button type="button" data-fee-mode="gross">Gross · simplified</button><button type="button" data-fee-mode="player_trade">Player trade</button><button type="button" data-fee-mode="shop">FM player shop</button></div><p class="fee-preview-status" role="status"></p><div class="fee-preview-presets" role="group" aria-label="Reported fee assumptions"><button type="button" data-fee-preset="player_trade">Use reported trade 3%</button><button type="button" data-fee-preset="shop">Use reported shop 1.5%</button><button type="button" data-fee-clear>Clear assumptions</button></div><details><summary>Fee assumptions: user-reported, not independently verified</summary><p>The November 5, 2026 user report supplies 3% player trade and 1.5% shop. These presets assume a seller / meso-recipient deduction and no buyer surcharge; that incidence is an explicit assumption. Current public sources conflict, and official tiers and rounding remain unverified. A source median may be fractional and is not an executable quote. Seller deductions and buyer surcharges are separate. Percentages are applied once to the whole hypothetical transaction.</p><form class="fee-preview-form"><label class="fee-enabled"><input type="checkbox" data-fee-field="enabled">Use these explicit fee assumptions</label><label>Copies in one transaction<input type="number" min="1" step="1" data-fee-field="itemCount"></label><label>Seller-paid deduction % (enter 0 if none)<input type="number" min="0" max="100" step="any" data-fee-field="sellerPercent" placeholder="Unknown"></label><label>Buyer-paid surcharge % (enter 0 if none)<input type="number" min="0" max="100" step="any" data-fee-field="buyerPercent" placeholder="Unknown"></label><label>Unit quote assumption<select data-fee-field="quoteRounding"><option value="estimate">Use source estimate · fractional allowed</option><option value="floor">Assume unit quote rounded down</option><option value="ceil">Assume unit quote rounded up</option><option value="nearest">Assume nearest-whole-meso unit quote</option></select></label><label>Fee rounding assumption<select data-fee-field="feeRounding"><option value="estimate">Fractional estimate · rounding unknown</option><option value="floor">Assume charge rounded down</option><option value="ceil">Assume charge rounded up</option><option value="nearest">Assume charge rounded nearest</option></select></label><label class="fee-shop-field">Fixed shop/access cost · assumed mesos<input type="number" min="0" step="any" data-fee-field="fixedShopMeso" placeholder="Excluded unless entered"></label><label class="fee-shop-field">Total copies sharing that shop cost<input type="number" min="1" step="1" data-fee-field="shopCopies" placeholder="Required if cost entered"></label><label class="fee-shop-field">Planning duration · days (context only)<input type="number" min="1" step="1" data-fee-field="durationDays" placeholder="Optional"></label><button type="submit">Apply fee assumptions</button><p class="fee-preview-error" role="alert"></p></form><p>Permit NX purchase cost is a separate access cost, not a percentage. No NX-to-meso permit conversion is inferred. Duration is context only; allocation uses your total-copy assumption. Seller net may be negative after an allocated business cost; it is not a negative cash receipt.</p><p class="fee-permit-context">Published Grand Launch access prices: Regular Store Permit — 1,500 NX for 90 days and 12 item slots; Pink Store Permit — 3,000 NX for 90 days and 18 item slots. These are separate access purchases, not percentage trade fees or automatic per-sale deductions.</p><a href="https://www.nexon.com/maplestory/news/sale/46362" target="_blank" rel="noopener noreferrer">Published permit costs (not a percentage-fee schedule) ↗</a></details>';
      if(id==='nx')host.before(panel);else{const status=host.querySelector('.cash-highlights-status');if(status)status.before(panel);else host.prepend(panel);}panels.push(panel);
      panel.addEventListener('click',ev=>{const b=ev.target.closest('button[data-fee-mode]');if(b){update({...clone(state),mode:b.dataset.feeMode});return;}const preset=ev.target.closest('[data-fee-preset]');if(preset){const raw=clone(state);raw.mode=preset.dataset.feePreset;raw.rules[raw.mode]=reportedRule(raw.mode);raw.quoteRounding=raw.feeRounding='estimate';update(raw);return;}if(ev.target.closest('[data-fee-clear]')){const raw=clone(state),mode=state.mode==='gross'?'player_trade':state.mode;raw.rules[mode]=blankRule();update(raw);}});
      panel.querySelector('form').addEventListener('submit',ev=>{ev.preventDefault();const form=ev.currentTarget,mode=state.mode==='gross'?'player_trade':state.mode,raw=clone(state),error=form.querySelector('.fee-preview-error');error.textContent='';const number=k=>{const value=form.querySelector(`[data-fee-field="${k}"]`).value.trim();return value===''?null:Number(value);};
        const count=number('itemCount'),seller=number('sellerPercent'),buyer=number('buyerPercent'),cost=number('fixedShopMeso'),copies=number('shopCopies'),duration=number('durationDays');if(!safeCount(count)||[seller,buyer].some(v=>v!==null&&(!finite(v)||v<0||v>100))||cost!==null&&(!finite(cost)||cost<0)||[copies,duration].some(v=>v!==null&&!safeCount(v))){error.textContent='Use positive whole copy/day counts and finite percentages between 0 and 100. No assumption was applied.';return;}
        raw.itemCount=count;raw.quoteRounding=form.querySelector('[data-fee-field="quoteRounding"]').value;raw.feeRounding=form.querySelector('[data-fee-field="feeRounding"]').value;raw.rules[mode]={enabled:form.querySelector('[data-fee-field="enabled"]').checked,sellerPercent:seller,buyerPercent:buyer,fixedShopMeso:cost,shopCopies:copies,durationDays:duration};update(raw);
      });
    }paint();}
  function paint(){for(const panel of panels){const rule=state.rules[state.mode==='gross'?'player_trade':state.mode];for(const b of panel.querySelectorAll('[data-fee-mode]'))b.setAttribute('aria-pressed',String(b.dataset.feeMode===state.mode));for(const input of panel.querySelectorAll('[data-fee-field]')){const k=input.dataset.feeField,value=['itemCount','quoteRounding','feeRounding'].includes(k)?state[k]:rule[k];if(input.type==='checkbox')input.checked=value===true;else input.value=value??'';}for(const label of panel.querySelectorAll('.fee-shop-field'))label.hidden=state.mode!=='shop';panel.dataset.feeMode=state.mode;panel.querySelector('.fee-preview-status').textContent=state.mode==='gross'?'Gross values before fees · original simplified view.':`${modeLabel()}. ${rule.enabled&&finite(rule.sellerPercent)&&finite(rule.buyerPercent)?`Explicit assumptions: seller ${rule.sellerPercent}%, buyer ${rule.buyerPercent}%; ${state.itemCount} copies per transaction. ${state.mode==='shop'&&rule.fixedShopMeso!==null?`Assumed shop cost ${rule.fixedShopMeso} mesos / ${rule.shopCopies||'unknown'} total copies${rule.durationDays?` over ${rule.durationDays} planning days`:''}.`:''}`:'Net values unavailable until explicit manual assumptions are enabled.'} ${rule.provenance==='user_reported'?'User-reported November 5, 2026 rates, not independently verified; seller/recipient deduction and buyer 0% surcharge are assumptions. ':''}Official percentages, tiers and rounding remain unverified. Gross prices, evidence, headline and source clocks are unchanged.`;}}
  document.addEventListener('astramarketsnapshot',install);install();document.dispatchEvent(new CustomEvent('astrafeeschange',{detail:{mode:state.mode,officialRuleVerified:false}}));
})();

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "fee-preview.js", status: "initialization_failed"}})); } catch {}
}

;
/* Astra source: api-cash-ui.js */
try {
(()=>{'use strict';if(window.AstraApiCashUi)return;
const api=window.AstraApiCash;if(!api)return;const host=document.getElementById('view-nx');if(!host)return;
const make=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
const number=(v,d=1)=>Number.isFinite(v)?v.toLocaleString('en-US',{maximumFractionDigits:d}):'Unavailable';
const clock=value=>{if(!value||!Number.isFinite(Date.parse(value)))return'Unknown';let zone=document.getElementById('display-timezone')?.value||'UTC';
 try{new Intl.DateTimeFormat('en-US',{timeZone:zone});}catch{zone='UTC';}
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',timeZoneName:'short'}).formatToParts(new Date(value)).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
 return`(${p.month}-${p.day}-${p.year} ${p.hour}:${p.minute}:${p.second} ${p.timeZoneName}${p.timeZoneName===zone?'':' · '+zone})`;};
const safeSprite=path=>typeof path==='string'&&/^assets\/[A-Za-z0-9._-]+\.(png|webp|gif|svg)$/.test(path)?path:null;
let report=null,side='sell',query='',sortKey='value',sortAsc=false;
const section=make('section','panel api-cash-section');section.id='api-cash-section';section.setAttribute('aria-labelledby','api-cash-title');
section.innerHTML='<div class="section-heading"><div><p class="eyebrow">MAPLESTORY MARKET / SEPARATE ITEM EVIDENCE</p><h2 id="api-cash-title" tabindex="-1">Cash-item API reference</h2></div></div><p class="api-cash-status" role="status" aria-live="polite" data-raw-date></p><p class="api-cash-window">Reported 3-day sale-median lookback · exact start/end and individual sale times are unknown. Quality can mix. This changes no headline, MPI or Cash Basket.</p><div class="api-cash-source-controls"></div><div class="api-cash-controls"><div class="api-cash-sides" role="group" aria-label="API cash comparison side"><button type="button" data-api-cash-side="sell">Sell NX · higher is better</button><button type="button" data-api-cash-side="buy">Buy NX items · lower is better</button></div><div class="api-cash-fee-modes" role="group" aria-label="Shared cash fee view"><button type="button" data-api-fee-mode="gross">Gross · simplified</button><button type="button" data-api-fee-mode="player_trade">Player trade</button><button type="button" data-api-fee-mode="shop">FM player shop</button></div><label>Search these 29 fixed-cost items<input id="api-cash-search" type="search" autocomplete="off" maxlength="200"></label><button type="button" data-api-best>Best value first</button><button type="button" data-api-refresh>Check cached API reference</button></div><p class="api-cash-ranking" role="status"></p><div class="table-wrap api-cash-table"></div><p class="api-cash-source-credit"><a href="https://maplestory.market/?ref=v6kkdvp6" target="_blank" rel="noopener noreferrer">Prices from maplestory.market ↗</a> · <a href="/api-cash-items.json" download>Download the dated 29-item subset ↓</a></p><details class="api-cash-method"><summary>What these prices and comparisons mean</summary><p>Each ratio is the source-reported item sale median divided by its verified fixed NX purchase cost. The count is reported sales, not physical units, unique players or executable quotes. At least five reported sales are required. Missing evidence stays unknown and is never filled from the daily source.</p><p>When all 29 are eligible, the dial reference is the reported-sale-count weighted mean of those item ratios. Partial API coverage does not create a renormalized reference. The API lookback cannot be resliced with the separate daily/rolling controls. Fee estimates use the same shared user-reported/manual assumptions as the existing table; gross prices remain visible. No official fee rule, matched equipment quality, live listing availability or individual sale time is established.</p><p>Status colors describe the age of API retrieval only (a 10-minute display band), never verified fresh trades. Your tab automatically reads this site’s cache about once a minute while visible; manual checks are throttled to at least 30 seconds apart. It never contacts a market provider. The original source capture clock survives cache checks and failures.</p></details>';
const heading=host.querySelector('.page-heading');if(heading)heading.after(section);else host.prepend(section);
// Keep original source DOM/handlers as a separate option, not a rewritten series.
const legacy=make('details','panel api-cash-legacy');legacy.id='api-cash-other-sources';const summary=make('summary','','Other dated cash sources · daily / rolling references');legacy.append(summary);
for(const child of [...host.children])if(child!==section&&child!==heading&&child.id!=='nx-calculator'&&child.id!=='nx-stamp-finder'&&child!==legacy)legacy.append(child);
host.append(legacy);const converter=document.getElementById('nx-calculator');if(converter){const note=make('p','api-cash-converter-note','This converter keeps the separate dated daily / rolling cash reference and its original source clock. It does not use the API29 table above.');converter.append(note);}const table=section.querySelector('.api-cash-table');let legacyTouched=false;window.AstraCashActivity?.mount(section.querySelector('.api-cash-controls'));
summary.addEventListener('click',()=>{legacyTouched=true;});
function sourceControls(where){
 if(where.querySelector('.api-cash-source-choice'))return;
 const group=make('div','api-cash-source-choice');group.setAttribute('role','group');group.setAttribute('aria-label','Best-card evidence source');
 group.append(make('span','','Best-card evidence'));
 for(const [value,label]of[['auto','Auto · API when available'],['api','API only'],['legacy','Other dated source']]){const b=make('button','',label);b.type='button';b.dataset.apiCashChoice=value;b.addEventListener('click',()=>{api.setChoice(value);if(value==='legacy')legacy.open=true;});group.append(b);}where.append(group);
}
sourceControls(section.querySelector('.api-cash-source-controls'));
const highlights=document.querySelector('#cash-item-highlights .cash-highlights-status');if(highlights){const source=make('div','api-cash-best-source');highlights.before(source);sourceControls(source);}
function image(row){const img=make('img','api-cash-sprite');const path=safeSprite(report?.spriteMap?.[row.slug]||report?.spriteMap?.[String(row.id)]);
 img.src=path||'assets/leaf.png';img.alt='';img.width=36;img.height=36;img.loading='lazy';img.dataset.spriteKind=path?'cached_original':'generic';img.title=path?'Locally cached original game icon © Nexon':'Generic fallback; reviewed item art unavailable';
 img.addEventListener('error',()=>{img.hidden=true;},{once:true});return img;}
function feesModel(model){const fees=window.AstraTradeFees,state=fees?.getState(),active=!!fees&&state.mode!=='gross',unset=active&&state.rules?.[state.mode]?.enabled!==true;
 const rows=fees?fees.decorate(model.rows,side):model.rows;return{rows,fees,state,active,unset,net:active&&!unset};}
// Public status uses only the already-validated own-site client, never private collector health.
function sourceDescriptor(state=api.getState(),now=Date.now()){
 const data=state?.data,stamp=typeof data?.capturedAt==='string'?Date.parse(data.capturedAt):NaN;
 const valid=state?.status!=='site_access'&&state?.status!=='not_published'&&Number.isFinite(stamp)&&data.schemaVersion===1&&data.kind==='fixed_nx_item_api_display_subset'&&data.sourceObservedAt===null&&
  data.window?.reportedLookbackDays===3&&data.window.start===null&&data.window.end===null&&data.window.boundsKnown===false&&
  data.coverage?.expected===29&&Number.isSafeInteger(data.coverage.available)&&data.coverage.available>=0&&data.coverage.available<=29;
 const label='APPROVED API / CASH-ITEM CACHE';
 if(valid){
  const age=now-stamp,retained=['retained','loading','unavailable','failed','error'].includes(state.status)||state.serverMode==='retained_last_good'||!!state.error;
  const phase=document.hidden||navigator.onLine===false?'paused':retained?'retained':age<0?'clock_uncertain':age<=600000?'recent':'aged';
  const tone=phase==='recent'?'green':'amber';
  const message={recent:'Recent API retrieval · not verified fresh trades',aged:'Older API retrieval · original clock retained',retained:'Retained API reference · original clock retained',clock_uncertain:'API capture clock ahead · age uncertain',paused:'API checks paused · original retrieval retained'}[phase];
  return{label,value:`${data.coverage.available} / 29 eligible item medians`,phase,capturedAt:data.capturedAt,state:{tone,state:message},
   detail:`API retrieved ${clock(data.capturedAt)}. Reported 3-day sale-median lookback; exact bounds and individual sale/scan times are unknown. Counts are reported sales, not physical units or unique players; qualities can mix. This separately cached subset changes no daily-source clock, headline, MPI or Cash Basket.`};
 }
 const status=state?.status||'idle',absent=status==='not_published',access=status==='site_access';
 const failed=!absent&&(['unavailable','site_access'].includes(status)||!!state?.error);
 return{label,value:absent?'Subset not published here':access?'Site access required':failed?'API cache unavailable':'Publication not yet verified',
  phase:absent?'not_published':access?'site_access':failed?'unavailable':'unverified',capturedAt:null,
  state:{tone:failed?'red':'amber',state:absent?'API approved · own-site subset absent':access?'Own-site access check failed':failed?'No verified API reference available':'Awaiting this tab’s own-site cache check'},
  detail:'API access was approved; approval and this site’s published-data availability are separate. '+(absent?'The own-site subset returned not published. ':access?'This tab cannot read the own-site subset. ':'No validated API subset is currently available in this tab. ')+'The daily feed and dated captures keep their original clocks. No fresh trade, zero price or API-key failure is inferred.'};
}
const statusLegendHost=document.getElementById('source-status-legend');
if(statusLegendHost&&!document.getElementById('api-cash-source-legend')){
 const legend=make('span','api-source-legend');legend.id='api-cash-source-legend';legend.setAttribute('role','note');
 legend.innerHTML='<strong>API cache retrieval</strong><span><i class="source-status-dot status-green" aria-hidden="true"></i>Green: retrieved within 10 minutes.</span><span><i class="source-status-dot status-amber" aria-hidden="true"></i>Amber: older, retained or not yet verified.</span><span><i class="source-status-dot status-red" aria-hidden="true"></i>Red: this tab cannot verify an available cache.</span><small>These are display bands, not provider guarantees. The clock is the original API retrieval; individual sale/scan times remain unknown. A newer API retrieval does not refresh the older daily source or establish qualified intraday trades.</small>';
 statusLegendHost.append(legend);
}
function statusText(){const s=api.getState(),m=api.model();if(!s.data)return s.status==='not_published'?'The API subset is not published here. Other dated source views remain separate.':s.status==='site_access'?'Site access is required to read this cached API reference.':'API reference unavailable or loading. Missing values are not zero; no provider request is made by this page.';
 return`${m.retained?'Retained API reference':'API reference'} · ${m.eligibleCount} / 29 items with eligible sale medians. API retrieved ${clock(m.capturedAt)}. Underlying sale/scan times unknown. ${api.client.freshness()==='recent_retrieval'?'Recent retrieval only; not verified fresh trades.':api.client.freshness()==='clock_uncertain'?'Clock age uncertain; no freshness claim.':'This is an older retrieval; original clocks are retained.'}`;}
function draw(){
 const model=api.model(),fm=feesModel(model),s=api.getState();window.AstraCashActivity?.configure(section.querySelector('.api-cash-controls'),model);section.dataset.apiStatus=s.status;section.dataset.retrievalAge=api.client.freshness();
 const status=section.querySelector('.api-cash-status'),descriptor=sourceDescriptor(),icon=make('i','source-status-dot status-'+descriptor.state.tone);icon.setAttribute('aria-hidden','true');status.replaceChildren(icon,document.createTextNode(descriptor.state.state+'. '+statusText()));status.dataset.statusTone=descriptor.state.tone;status.dataset.retrievalState=descriptor.phase;status.title=descriptor.state.state+'; 10-minute retrieval display band, not verified fresh trades.';
 for(const b of document.querySelectorAll('[data-api-cash-choice]'))b.setAttribute('aria-pressed',String(api.getChoice()===b.dataset.apiCashChoice));
 for(const b of section.querySelectorAll('[data-api-cash-side]'))b.setAttribute('aria-pressed',String(side===b.dataset.apiCashSide));
 for(const b of section.querySelectorAll('[data-api-fee-mode]')){b.setAttribute('aria-pressed',String((fm.state?.mode||'gross')===b.dataset.apiFeeMode));b.disabled=!fm.fees;}
 const effectiveKey=sortKey==='value'?(fm.net?'netRate':'rate'):sortKey,asc=sortKey==='value'?side==='buy':sortAsc;
 const activity=window.AstraCashActivity?.rank(fm.rows,{side,rateKey:fm.net?'netRate':'rate',model})||{rows:fm.rows,active:false,note:''};
 const rows=activity.rows.filter(r=>r.name.toLowerCase().includes(query.trim().toLowerCase())).map((r,index)=>({...r,index}));
 if(!(activity.orderingApplied&&sortKey==='value'))rows.sort((a,b)=>{const av=a[effectiveKey],bv=b[effectiveKey];if(effectiveKey==='name')return(asc?1:-1)*av.localeCompare(bv)||a.id-b.id;
  const aValid=Number.isFinite(av),bValid=Number.isFinite(bv);if(!aValid||!bValid)return aValid?-1:bValid?1:a.id-b.id;return(asc?1:-1)*(av-bv)||a.id-b.id;});
 const activityBest=activity.active&&sortKey==='value',displaySortKey=activityBest?'activityScore':effectiveKey,displaySortAsc=activityBest?false:asc;
 const ranking=activityBest?'Activity-adjusted value first by descending heuristic score; actual rates remain visible.':sortKey==='value'?fm.net?(rows.some(r=>Number.isFinite(r.netRate))?'Best value first under the selected fee assumptions.':'Net ranking unavailable; gross source prices stay visible.'):'Best value first by gross mesos / NX.':`Sorted by ${effectiveKey} (${asc?'ascending':'descending'}).`;
 section.querySelector('.api-cash-ranking').textContent=`${rows.length} / 29 shown · ${side==='sell'?'Higher proceeds per NX favors selling':'Lower cost per NX favors buying'}. ${ranking} ${activity.active&&sortKey!=='value'?'Column sort overrides the optional activity ordering.':activity.note} ${activity.active?'Scores use this complete source cohort before search; minimum count filter is shared with the cards. ':''}${fm.unset?'Gross order shown; net unavailable until fee rules are set.':fm.net?'Fee assumptions: '+fm.fees.label()+'. These are estimates, not official verified fees.':'Gross prices before fees.'}`;
 section.querySelector('[data-api-best]').textContent=activity.active?'Best activity-adjusted first':'Best value first';
 section.querySelector('[data-api-best]').setAttribute('aria-pressed',String(sortKey==='value'));
 const headers=[['name','Item'],['nx','Fixed NX cost'],['price','API sale median · mesos'],['rate','Gross mesos / NX'],['quantity','Reported sale count']];
 if(fm.active)headers.push(['effectiveMeso',side==='buy'?'Estimated transaction cost':'Estimated transaction proceeds'],['netRate',side==='buy'?'Estimated cost / NX':'Estimated proceeds / NX']);
 if(activity.active)headers.push(['activityScore','Activity score · heuristic']);headers.push(['source','Source']);const tbl=make('table'),caption=make('caption','sr-only','Separate API item-sale medians. Reported 3-day lookback; actual bounds and sale times unknown.');tbl.append(caption);
 const thead=make('thead'),tr=make('tr');for(const [key,label]of headers){const th=make('th');th.setAttribute('aria-sort',key===displaySortKey?(displaySortAsc?'ascending':'descending'):'none');
  if(key==='source')th.textContent=label;else{const b=make('button','',label+(key===displaySortKey?(displaySortAsc?' ↑':' ↓'):''));b.type='button';b.dataset.apiCashSort=key;th.append(b);}tr.append(th);}thead.append(tr);tbl.append(thead);
 const tbody=make('tbody');for(const row of rows){const line=make('tr');line.dataset.apiCashItem=row.slug;line.dataset.apiItemId=String(row.id);
  const name=make('td'),link=make('a','item-link');link.href='#item/'+encodeURIComponent(row.slug);link.append(image(row),make('span','',row.name));name.append(link);line.append(name);
  for(const field of ['nx','price','rate','quantity']){const cell=make('td','',number(row[field],field==='rate'?2:field==='quantity'||field==='nx'?0:1));cell.dataset.sortValue=Number.isFinite(row[field])?String(row[field]):'';if(row.missing&&field==='price')cell.append(make('small','','API median/count unavailable'));line.append(cell);}
  if(fm.active)for(const field of ['effectiveMeso','netRate']){const cell=make('td','',number(row[field],field==='netRate'?2:1));if(!Number.isFinite(row[field]))cell.append(make('small','',row.feePreview?.reason||'Fee estimate unavailable'));line.append(cell);}
  if(activity.active)line.append(make('td','',number(row.activityScore,1)));
  const source=make('td'),credit=make('a','','Source ↗');credit.href=row.sourceCreditUrl;credit.target='_blank';credit.rel='noopener noreferrer';source.append(credit);line.append(source);tbody.append(line);
 }tbl.append(tbody);const focusedSort=document.activeElement?.dataset.apiCashSort;table.replaceChildren(tbl);
 if(focusedSort)table.querySelector(`[data-api-cash-sort="${focusedSort}"]`)?.focus();
 if(!legacyTouched)legacy.open=!s.data||api.getChoice()==='legacy';
 for(const [container,item]of detailBindings)if(container.isConnected)appendItemEvidence(container,item);
 if(location.hash.startsWith('#item/')&&typeof window.findItem==='function'){
  try{const item=window.findItem(decodeURIComponent(location.hash.slice(6))),container=document.getElementById('item-page-detail');if(item&&container?.children.length)appendItemEvidence(container,item);}catch{}
 }
}
section.addEventListener('input',e=>{if(e.target.id==='api-cash-search'){query=e.target.value;draw();}});
section.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
 if(b.dataset.apiCashSide){side=b.dataset.apiCashSide;draw();return;}
 if(b.dataset.apiFeeMode){const fees=window.AstraTradeFees;if(fees)fees.setState({...fees.getState(),mode:b.dataset.apiFeeMode});return;}
 if(b.dataset.apiCashSort){const key=b.dataset.apiCashSort;if(sortKey===key)sortAsc=!sortAsc;else{sortKey=key;sortAsc=key==='name';}draw();return;}
 if(b.hasAttribute('data-api-best')){sortKey='value';draw();return;}
 if(b.hasAttribute('data-api-refresh'))void api.refresh();
});
const detailBindings=new Map();
function appendItemEvidence(container,item){
 detailBindings.set(container,item);container.querySelector('.api-cash-item-evidence')?.remove();const row=api.rowFor(item);if(!row)return;
 const box=make('section','item-evidence api-cash-item-evidence');box.dataset.apiItemId=String(row.itemId);box.append(make('h3','','Separate API sale-median reference'));
 const text=row.available?`${number(row.saleMedianMesos,1)} mesos · ${number(row.mesosPerNx,2)} mesos / fixed NX · ${number(row.recordedSalesCount,0)} reported sales.`:'No qualifying API median/count is available; missing evidence is not zero.';
 box.append(make('p','',text));const date=make('p','api-cash-clock',`API retrieved ${clock(api.getState().data.capturedAt)} · reported 3-day lookback; actual bounds and individual sale times unknown.`);date.dataset.rawDate='true';box.append(date);
 box.append(make('small','','Item-level qualities can mix. This is separate from every daily history/rolling capture below and changes no index or quote.'));
 const a=make('a','','Prices from maplestory.market ↗');a.href=row.sourceCreditUrl;a.target='_blank';a.rel='noopener noreferrer';box.append(a);container.append(box);
}
function focusList(value='sell'){sortKey='value';if(['buy','sell'].includes(value))side=value;location.hash='#nx';draw();document.getElementById('api-cash-title').focus();section.scrollIntoView?.({block:'start'});}
window.AstraApiCashUi=Object.freeze({clock,sourceDescriptor,appendItemEvidence,focusList});
document.addEventListener('astramarketsnapshot',e=>{report=e.detail;draw();});
for(const event of ['astraapicashchange','astraapicashchoice','astrafeeschange'])document.addEventListener(event,draw);
document.addEventListener('visibilitychange',draw);window.addEventListener('offline',draw);window.addEventListener('online',draw);
document.addEventListener('astracashactivitychange',()=>{sortKey='value';draw();});
document.getElementById('display-timezone')?.addEventListener('change',draw);draw();document.dispatchEvent(new Event('astraapicashstatusready'));document.dispatchEvent(new Event('astramarkethighlightsready'));
})();

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "api-cash-ui.js", status: "initialization_failed"}})); } catch {}
}

;
/* Astra source: basket-history-layout.js */
try {
(() => {
  'use strict';
  const section=document.getElementById('view-basket'),history=document.getElementById('basket-history-section');
  if(!section||!history||document.getElementById('basket-history-layout-options'))return;
  const original=document.createComment('Basket history original location');history.before(original);
  const group=document.createElement('div');group.id='basket-history-layout-options';group.className='basket-history-layout-options';group.dataset.previewControls='true';
  group.setAttribute('role','group');group.setAttribute('aria-label','Basket history position');
  const label=document.createElement('span');label.textContent='History position';group.append(label);
  const key='astra-basket-history-position';
  function choose(value){
    const placement=value==='above'?'above':'below';
    if(placement==='above')original.after(history);else group.before(history);
    history.dataset.historyPlacement=placement;
    for(const button of group.querySelectorAll('button'))button.setAttribute('aria-pressed',String(button.dataset.basketHistoryPosition===placement));
  }
  for(const [value,title] of [['below','Below the table'],['above','Above the table']]){
    const button=document.createElement('button');button.type='button';button.dataset.basketHistoryPosition=value;button.textContent=title;
    button.addEventListener('click',()=>{choose(value);try{localStorage.setItem(key,value)}catch{}});group.append(button);
  }
  section.append(group);let saved;try{saved=localStorage.getItem(key)}catch{}choose(saved);
})();

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "basket-history-layout.js", status: "initialization_failed"}})); } catch {}
}

;
/* Astra source: rate-clock.js */
try {
(() => {
  'use strict';
  const sourceClock = document.getElementById('rate-kind');
  if (!sourceClock || document.getElementById('rate-current-clock')) return;
  const options = document.getElementById('display-options');
  const zoneSelect = document.getElementById('display-timezone');
  const preferenceKey = 'astra-rate-clock-v1', modes = new Set(['current-source', 'source']);
  let mode = 'current-source', interval;
  try { const saved = localStorage.getItem(preferenceKey); if (modes.has(saved)) mode = saved; } catch { /* Current-tab controls still work. */ }
  const clock = document.createElement('p'); clock.id = 'rate-current-clock'; clock.className = 'rate-current-clock';
  clock.dataset.clockKind = 'view'; clock.setAttribute('aria-live', 'off');
  clock.setAttribute('aria-label', 'Current viewing clock, separate from the market source time above');
  const time = document.createElement('time');
  const cadence = document.createElement('span'); cadence.textContent = ' · collector checks ~10 min';
  cadence.title = 'Approximate collector check cadence, not a promise of new market observations. The source timestamp above remains the data clock.';
  clock.append('Now: ', time, cadence); sourceClock.after(clock);
  const group = document.createElement('div'); group.className = 'hero-layout-options rate-clock-options'; group.dataset.previewControls = '';
  group.setAttribute('role', 'group'); group.setAttribute('aria-label', 'Headline clocks');
  for (const [value, label] of [['current-source', 'Current clock + source'], ['source', 'Source only']]) {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.rateClock = value;
    button.textContent = label; button.setAttribute('aria-controls', 'rate-current-clock');
    button.addEventListener('click', () => { mode = value; try { localStorage.setItem(preferenceKey, mode); } catch {} apply(); });
    group.append(button);
  }
  const note = document.createElement('small'); note.textContent = 'The ticking clock is your current viewing time. Market values keep their actual source timestamp.'; group.append(note); options?.append(group);
  function tick() {
    let zone = zoneSelect?.value || 'UTC', format;
    const configuration = { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' };
    try { format = new Intl.DateTimeFormat('en-US', { ...configuration, timeZone: zone }); }
    catch { zone = 'UTC'; format = new Intl.DateTimeFormat('en-US', { ...configuration, timeZone: zone }); }
    const now = new Date();
    time.dateTime = now.toISOString(); time.textContent = format.format(now) + ' ' + zone.replaceAll('_', ' ');
    clock.dataset.timeZone = zone;
  }
  function syncTimer() {
    if (interval !== undefined) { clearInterval(interval); interval = undefined; }
    if (mode === 'current-source') {
      tick();
      if (!document.hidden) interval = setInterval(tick, 1000);
    }
  }
  function apply() {
    clock.hidden = mode === 'source';
    for (const button of group.querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.rateClock === mode));
    syncTimer();
  }
  zoneSelect?.addEventListener('change', () => { if (mode === 'current-source') tick(); });
  document.addEventListener('visibilitychange', syncTimer);
  function renderCadence() {
    const api = document.body?.dataset.apiCalculationsAvailable === 'true';
    cadence.textContent = api ? ' · prices ~5 min · overview ~15 min · visible cache ~60 s' : ' · collector checks ~10 min';
    cadence.title = api ? 'Scheduled API retrieval targets: prices every 5 minutes and daily overview every 15 minutes. A visible tab checks only this site’s cache about every 60 seconds while healthy; failures and backoff can delay checks. Retrieval is not an individual trade time. The source timestamps remain unchanged by this viewing clock.' : 'Approximate collector check cadence, not a promise of new market observations. The source timestamp above remains the data clock.';
    cadence.dataset.cadenceKind = api ? 'api_retrieval_and_own_cache' : 'legacy_collector';
  }
  document.addEventListener('astracalculationchange', renderCadence);
  document.addEventListener('astramarketsnapshot', renderCadence);
  renderCadence();
  // No market render, value update, source-clock edit or data request occurs on a timer tick.
  apply();
})();

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "rate-clock.js", status: "initialization_failed"}})); } catch {}
}

;
/* Astra source: overview-basket.js */
try {
(() => {
  'use strict';
  const view = document.getElementById('view-index'), stats = document.getElementById('market-stats');
  if (!view || !stats || stats.parentElement !== view || document.getElementById('overview-basket')) return;
  const make = (tag, text, className) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; };
  const day = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
  const origin = document.createComment('Source statistics original position'); stats.before(origin);
  const section = make('section', undefined, 'overview-basket'); section.id = 'overview-basket'; section.setAttribute('aria-labelledby', 'overview-basket-title');
  section.innerHTML = '<div class="overview-basket-content"><div class="section-heading"><div><p class="eyebrow">THE FULL FIXED GOODS BASKET / BY CATEGORY</p><h2 id="overview-basket-title">The representative 50 items of the Maple Economy and Meso Price Index</h2></div></div><p class="overview-basket-status" role="status"></p><div class="category-item-groups overview-basket-tiles"></div><p class="overview-basket-links"><a href="#basket">Full goods-basket details, weights and history →</a> · <a href="#cash-basket">Cash Basket details and history →</a> · <a href="#method-weights">Why these weights?</a></p></div>';
  stats.after(section);
  const controls = make('div', undefined, 'overview-basket-controls'); controls.dataset.previewControls = 'true'; controls.setAttribute('role', 'group'); controls.setAttribute('aria-label', 'Full Overview basket preview');
  controls.append(make('span', 'Full basket on Overview'));
  const toggle = make('button'); toggle.type = 'button'; toggle.setAttribute('aria-controls', 'overview-basket-content');
  section.querySelector('.overview-basket-content').id = 'overview-basket-content'; controls.append(toggle);
  const orderButtons = [];
  const key = 'astra-overview-basket-v1', orderKey = 'astra-overview-basket-stats-order-v1'; let enabled = true, order = 'above';
  try { enabled = localStorage.getItem(key) !== 'off'; } catch { /* Requested preview default remains On. */ }
  try { if (localStorage.getItem(orderKey) === 'below') order = 'below'; } catch { /* Source statistics stay above by default. */ }
  function apply() {
    section.dataset.enabled = String(enabled); section.querySelector('.overview-basket-content').hidden = !enabled;
    toggle.textContent = enabled ? 'On · hide basket' : 'Off · show basket'; toggle.setAttribute('aria-pressed', String(enabled));
    if (enabled && order === 'below') { if (section.nextSibling !== stats) section.after(stats); }
    else if (origin.nextSibling !== stats) origin.after(stats);
    section.dataset.statsOrder = order;
    for (const button of orderButtons) { button.disabled = !enabled; button.setAttribute('aria-pressed', String(button.dataset.overviewStatsOrder === order)); }
  }
  for (const [value, text] of [['above', 'Source stats above'], ['below', 'Source stats below']]) {
    const button = make('button', text); button.type = 'button'; button.dataset.overviewStatsOrder = value;
    button.addEventListener('click', () => { order = value; apply(); try { localStorage.setItem(orderKey, order); } catch { /* Tab choice still works. */ } });
    orderButtons.push(button); controls.append(button);
  }
  const headingKey='astra-overview-basket-heading-v1';let concise=false;try{concise=localStorage.getItem(headingKey)==='concise'}catch{}const headingToggle=make('button');headingToggle.type='button';headingToggle.dataset.overviewBasketHeading='true';const updateHeading=()=>{section.querySelector('h2').textContent=concise?'All 50 items, in context.':'The representative 50 items of the Maple Economy and Meso Price Index';headingToggle.textContent=concise?'Heading: Concise':'Heading: Representative 50';headingToggle.setAttribute('aria-pressed',String(!concise))};headingToggle.addEventListener('click',()=>{concise=!concise;try{localStorage.setItem(headingKey,concise?'concise':'representative')}catch{}updateHeading()});controls.append(headingToggle);updateHeading();
  controls.append(make('small', 'Display only · the original statistics strip and its values are preserved.'));
  section.append(controls); toggle.addEventListener('click', () => { enabled = !enabled; apply(); try { localStorage.setItem(key, enabled ? 'on' : 'off'); } catch { /* Tab choice still works. */ } });
  let dateBindings=[],statusReport=null;
  const captureClock=value=>typeof value==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(value)&&Number.isFinite(Date.parse(value));
  function captureLabel(value){
    if(!captureClock(value))return 'Unknown';let zone=document.getElementById('display-timezone')?.value||'UTC';try{new Intl.DateTimeFormat('en-US',{timeZone:zone});}catch{zone='UTC';}
    const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',timeZoneName:'short'}).formatToParts(new Date(value)).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));return `(${p.month}-${p.day}-${p.year} ${p.hour}:${p.minute}:${p.second} ${p.timeZoneName})`;
  }
  function updateDate(node,row,report){
    delete node.dataset.rawPriceCapturedAt;
    if(!report.apiCalculationView){node.textContent=day(row.priceDay)?'Source price: '+row.priceDay:'Source price date unavailable';return;}
    const ref=row.currentApiReference,view=report.apiCalculationView,bound=view.kind==='api_calculation_view'&&ref&&Number.isSafeInteger(ref.itemId)&&ref.itemId>0&&ref.slug===row.slug&&ref.name===row.name&&(row.canonicalId==null||row.canonicalId===ref.itemId)&&ref.reportedDays===3&&captureClock(ref.capturedAt)&&ref.capturedAt===view.clocks?.currentPrices;
    const known=bound&&typeof ref.currentSaleMedianLexeme==='string'&&ref.currentSaleMedianLexeme.length<=160&&/^\d+(?:\.\d+)?$/.test(ref.currentSaleMedianLexeme)&&Number.isFinite(Number(ref.currentSaleMedianLexeme))&&Number(ref.currentSaleMedianLexeme)>0&&Number(ref.currentSaleMedianLexeme)<=Number.MAX_SAFE_INTEGER&&Number.isSafeInteger(ref.recordedSalesCount)&&ref.recordedSalesCount>=5;
    node.dataset.rawDate='true';node.dataset.priceReferenceBasis='api_reported_3day_sale_median';node.textContent=(known?'Reported 3-day sale median':'API 3-day reference unavailable')+(bound?' · retrieved '+captureLabel(ref.capturedAt):' · retrieval context unavailable');node.title='Reported 3-day lookback; exact bounds and individual sale times unknown. Retrieval time is not a daily source price date.';if(bound)node.dataset.rawPriceCapturedAt=ref.capturedAt;
  }
  function updateStatus(report){
    const status=section.querySelector('.overview-basket-status');
    if(report?.apiCalculationView){const v=report.apiCalculationView;status.textContent=`The same 50-item goods basket and category cards as Methodology · basket version ${Number.isSafeInteger(report.basketVersion)?report.basketVersion:'unknown'}. Current labels identify the reported 3-day API sale-median reference where available, retrieved ${captureLabel(v.clocks?.currentPrices)}; exact source-window bounds and individual sale times are unknown. Retained legacy daily source publication: ${captureLabel(report.sourceUpdatedAt)}. Frozen reference ${day(report.baseStart)?report.baseStart:'unknown'}–${day(report.baseEnd)?report.baseEnd:'unknown'}. No retrieval clock is substituted for a source day; membership, weights and calculations are unchanged.`;return;}
    status.textContent = `The same 50-item goods basket and category cards as Methodology · basket version ${Number.isSafeInteger(report.basketVersion) ? report.basketVersion : 'unknown'}. Fixed reference ${day(report.baseStart) ? report.baseStart : 'unknown'}–${day(report.baseEnd) ? report.baseEnd : 'unknown'}; daily source published ${typeof report.sourceUpdatedAt === 'string' ? report.sourceUpdatedAt : 'unknown'}. Individual qualified price dates, frozen weights and item-history actions are retained. This display changes no membership, price, source clock or calculation.${report.sourceStatus?.status === 'degraded' ? ' Source checks are degraded; these prices retain their source dates.' : ''}`;
  }
  function receive(report) {
    dateBindings=[];statusReport=null;
    const source = document.getElementById('method-tiles'), target = section.querySelector('.overview-basket-tiles');
    const rows = report?.rows, originals = source ? [...source.querySelectorAll('button[data-item]')] : [];
    const rowMap = new Map(Array.isArray(rows) ? rows.filter(row => row && typeof row.slug === 'string').map(row => [row.slug, row]) : []);
    const seen = new Set();
    const complete = Array.isArray(rows) && rows.length === 50 && rowMap.size === 50 && originals.length === 50
      && !source.querySelector('[id]') && originals.every(button => { const slug = button.dataset.item; if (!rowMap.has(slug) || seen.has(slug)) return false; seen.add(slug); return true; });
    if (!complete) {
      target.replaceChildren(); section.querySelector('.overview-basket-status').textContent = 'A complete rendered 50-item view is not available in this snapshot. The original basket page and methodology remain available; no missing items are filled.'; apply(); return;
    }
    const copies = [...source.children].filter(node => node.classList.contains('method-category')).map(node => node.cloneNode(true));
    if (copies.reduce((count, node) => count + node.querySelectorAll('button[data-item]').length, 0) !== 50) {
      target.replaceChildren(); section.querySelector('.overview-basket-status').textContent = 'The category layout could not be verified. Open the full basket details below.'; apply(); return;
    }
    for (const copy of copies) for (const button of copy.querySelectorAll('button[data-item]')) {
      const row = rowMap.get(button.dataset.item), date = make('small', undefined, 'overview-basket-price-date');updateDate(date,row,report);dateBindings.push({node:date,row,report});
      const price = button.querySelector('strong'); if (price) price.after(date); else button.append(date);
    }
    target.replaceChildren(...copies);
    statusReport=report;updateStatus(report);
    apply();
  }
  document.addEventListener('astramarketsnapshot', event => receive(event.detail));
  document.addEventListener('change',event=>{if(event.target?.id!=='display-timezone')return;for(const b of dateBindings)if(b.report.apiCalculationView)updateDate(b.node,b.row,b.report);if(statusReport?.apiCalculationView)updateStatus(statusReport);});
  apply(); receive(null); document.dispatchEvent(new Event('astramarkethighlightsready'));
})();

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "overview-basket.js", status: "initialization_failed"}})); } catch {}
}

;
/* Astra source: nav-preview.js */
try {
(() => {
  'use strict';
  const navigation = document.querySelector('.nav-wrap nav') || document.querySelector('nav');
  const options = document.getElementById('display-options');
  if (!navigation || !options || document.getElementById('nav-preview-options')) return;
  const targets = [['basket', 'The Basket', '#basket'], ['cash-basket', 'Cash Basket', '#cash-basket']]
    .map(([key, label, hash]) => ({ key, label, link: [...navigation.querySelectorAll('a.nav-link')].find(link => link.hash === hash) })).filter(target => target.link);
  if (!targets.length) return;
  const group = document.createElement('fieldset'); group.id = 'nav-preview-options'; group.className = 'nav-preview-options'; group.dataset.previewControls = 'true';
  const legend = document.createElement('legend'); legend.textContent = 'Basket navigation preview'; group.append(legend);
  for (const target of targets) {
    const key = 'astra-nav-' + target.key + '-visible-v1'; let visible = false;
    try { visible = localStorage.getItem(key) === 'on'; } catch { /* The requested preview default stays Off. */ }
    const button = document.createElement('button'); button.type = 'button'; button.dataset.previewNav = target.key;
    target.link.classList.add('nav-preview-target');
    const apply = () => { target.link.hidden = !visible; button.setAttribute('aria-pressed', String(visible)); button.textContent = target.label + ' link: ' + (visible ? 'On' : 'Off'); };
    button.addEventListener('click', () => { visible = !visible; apply(); try { localStorage.setItem(key, visible ? 'on' : 'off'); } catch { /* Tab choice still works. */ } });
    group.append(button); apply();
  }
  const note = document.createElement('small'); note.textContent = 'Navigation links only. Both pages, direct links, history and methodology stay available. Saved in this browser.'; group.append(note); options.append(group);
})();

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "nav-preview.js", status: "initialization_failed"}})); } catch {}
}

;
/* Astra source: rate-title-preview.js */
try {
(() => {
  'use strict';
  const title=document.getElementById('overview-title'),options=document.getElementById('display-options');
  if(!title||!options||document.getElementById('rate-title-options'))return;
  const choices=new Map([['benchmark','Goods-inflation NX benchmark'],['calculated','Calculated NX rate'],['estimated','Estimated NX rate']]);
  const key='astra-rate-title-v1';let selected='benchmark';try{const saved=localStorage.getItem(key);if(choices.has(saved))selected=saved;}catch{}
  const group=document.createElement('div');group.id='rate-title-options';group.className='hero-layout-options';group.dataset.previewControls='true';group.setAttribute('role','group');group.setAttribute('aria-label','NX headline wording');
  const label=document.createElement('span');label.textContent='NX headline wording';group.append(label);
  function apply(){title.textContent=choices.get(selected);for(const button of group.querySelectorAll('button'))button.setAttribute('aria-pressed',String(button.dataset.rateTitle===selected));}
  for(const [value,text] of choices){const button=document.createElement('button');button.type='button';button.dataset.rateTitle=value;button.textContent=text;button.addEventListener('click',()=>{selected=value;try{localStorage.setItem(key,value)}catch{}apply()});group.append(button)}
  const note=document.createElement('small');note.textContent='Wording only. Every option retains the goods-based model and its explanation; the cash-sale estimate stays separate.';group.append(note);const explanation=document.querySelector('.hero-benchmark-explanation');if(explanation){let shown=true;const key='astra-benchmark-explanation-v1';try{shown=localStorage.getItem(key)!=='off'}catch{}const button=document.createElement('button');button.type='button';const update=()=>{explanation.hidden=!shown;button.textContent='Buying-power explanation: '+(shown?'On':'Off');button.setAttribute('aria-pressed',String(shown))};button.addEventListener('click',()=>{shown=!shown;try{localStorage.setItem(key,shown?'on':'off')}catch{}update()});group.append(button);update()}options.append(group);
  document.addEventListener('astramarketsnapshot',apply);apply();
})();

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "rate-title-preview.js", status: "initialization_failed"}})); } catch {}
}

;
/* Astra source: category-link-preview.js */
try {
(() => {
  'use strict';
  const section=document.getElementById('category-section'),link=section?.querySelector('.category-basket-link'),heading=section?.querySelector('.category-section-heading'),cards=document.getElementById('category-cards');
  if(!link||!heading||!cards||document.getElementById('category-link-options'))return;
  const key='astra-category-link-position-v1',modes=new Set(['categories','headline','cash']);let selected='headline';try{const saved=localStorage.getItem(key);if(modes.has(saved))selected=saved}catch{}
  const group=document.createElement('div');group.id='category-link-options';group.className='category-value-options';group.dataset.previewControls='true';group.setAttribute('role','group');group.setAttribute('aria-label','Representative items link position');
  const label=document.createElement('span');label.textContent='Representative items link';group.append(label);
  function apply(){const cash=document.getElementById('cash-item-highlights');if(selected==='headline')heading.append(link);else if(selected==='cash'&&cash)cash.querySelector('.cash-highlights-controls')?.before(link);else cards.after(link);link.dataset.linkPosition=selected;for(const button of group.querySelectorAll('button[data-category-link]'))button.setAttribute('aria-pressed',String(button.dataset.categoryLink===selected));}
  for(const [value,text] of [['categories','Below categories'],['headline','Beside headline'],['cash','Below cash items']]){const button=document.createElement('button');button.type='button';button.dataset.categoryLink=value;button.textContent=text;button.addEventListener('click',()=>{selected=value;try{localStorage.setItem(key,value)}catch{}apply()});group.append(button)}
  const title=heading.querySelector('.eyebrow'),titleKey='astra-category-section-label-v1';let style='gold';try{const stored=localStorage.getItem(titleKey);if(['mint','gold','classic'].includes(stored))style=stored}catch{}
  const titleGroup=document.createElement('span');titleGroup.className='category-label-options';
  const applyLabel=()=>{section.dataset.sectionLabel=style;if(title)title.textContent=style==='classic'?'INSIDE THE INFLATION':'Inside the inflation';for(const button of titleGroup.querySelectorAll('button'))button.setAttribute('aria-pressed',String(button.dataset.sectionLabel===style))};
  for(const [value,text] of [['mint','Inside the inflation · Mint'],['gold','Inside the inflation · Gold'],['classic','Original capitals']]){const button=document.createElement('button');button.type='button';button.dataset.sectionLabel=value;button.textContent=text;button.addEventListener('click',()=>{style=value;try{localStorage.setItem(titleKey,value)}catch{}applyLabel()});titleGroup.append(button)}group.append(titleGroup);applyLabel();
  section.append(group);document.addEventListener('astramarketsnapshot',apply);apply();
})();

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "category-link-preview.js", status: "initialization_failed"}})); } catch {}
}

;
/* Astra source: mystery-boxes.js */
try {
(() => {
  'use strict';
  const content = document.getElementById('content');
  if (!content || document.getElementById('view-mystery-boxes')) return;
  // Factual edition data extracted independently from the official public CMS receipts.
  const evidence = {"schemaVersion":1,"kind":"official_classic_world_mystery_box_editions","evidenceCapturedAt":"2026-11-05T13:19:55.317031+00:00","editionIdentity":"announcement + sale window + captured rate-body hash; names and original publication dates alone are insufficient","probabilityPolicy":"Published rounded probabilities are retained without renormalization. All four verified tables sum to100 as displayed; this does not recover extra precision. No equal-odds assumption.","editions":[{"id":"mystery-fashion-2026-11-04","name":"Mystery Fashion Crate","title":"Mystery Fashion Crate · Nov 4 rotation","game":"MapleStory Classic World","region":"Global","saleStart":"2026-11-04T08:00:00Z","saleEnd":null,"saleWindow":"Nov 4, 08:00 UTC → Nov 18, start of maintenance","crateDurationDays":7,"cost":{"currency":"NX","single":3500,"bundle":35000,"bundleCount":11},"announcement":{"pageUrl":"https://www.nexon.com/maplestory/news/47031","contentUrl":"https://g.nexonstatic.com/maplestory/cms/v1/news/47031","publishedAt":"2026-11-03T16:00:00Z","capturedAt":"2026-11-05T13:19:54.273863+00:00","sha256":"027f2ced10bca9eae520cfc078cd7023314730b44c5ae89e4d3b9f012acaabe1"},"probabilitySource":{"pageUrl":"https://www.nexon.com/maplestory/general-post/46331","contentUrl":"https://g.nexonstatic.com/maplestory/cms/v1/general-posts/46331","publishedAt":"2026-10-20T16:00:00Z","capturedAt":"2026-11-05T13:19:55.597466+00:00","sha256":"f965e9e5385bc7a2f8a42324e71aa25758b6dd5d43a824b97e58e1a0c1603a19"},"probabilityStatus":"verified_published_rounded","outcomes":[{"name":"Woodsman Hat","publishedPercent":3.0},{"name":"Bomber Jacket","publishedPercent":2.0},{"name":"Patched Denim Jeans","publishedPercent":2.0},{"name":"Green Sports Goggles","publishedPercent":1.0},{"name":"Pelvis Hoodie","publishedPercent":2.0},{"name":"Red Hooded Coat","publishedPercent":2.0},{"name":"Bunny-Padded Snowboard Pants","publishedPercent":2.0},{"name":"Pillow","publishedPercent":1.0},{"name":"Grey Visor Beanie","publishedPercent":2.0},{"name":"Black Fur Wrap Coat","publishedPercent":2.0},{"name":"Blue Kitty Hood","publishedPercent":2.0},{"name":"Mix-n-Match Sneakers","publishedPercent":3.0},{"name":"Starry Sky Blue Beanie","publishedPercent":3.0},{"name":"Big Rabbit Feet","publishedPercent":2.0},{"name":"White Rabbit's Foot","publishedPercent":1.0},{"name":"Olive Beanie","publishedPercent":2.0},{"name":"Bandage Strip","publishedPercent":1.0},{"name":"Pink Knitted Gumball","publishedPercent":3.0},{"name":"Pink Snowboard Top","publishedPercent":2.0},{"name":"Pink Snowboard Pants","publishedPercent":2.0},{"name":"Pink Galoshes","publishedPercent":3.0},{"name":"Bunny Hat","publishedPercent":2.0},{"name":"Bunny Slippers","publishedPercent":1.0},{"name":"Pink Rabbit Puppet","publishedPercent":1.0},{"name":"Bunny Costume","publishedPercent":2.0},{"name":"Old School Uniform Hat","publishedPercent":3.0},{"name":"Old School Blazer","publishedPercent":1.0},{"name":"Old School Uniform Top","publishedPercent":2.0},{"name":"Old School Uniform Pants","publishedPercent":1.0},{"name":"Old School Uniform Skirt","publishedPercent":3.0},{"name":"White High Top","publishedPercent":3.0},{"name":"Medical Eye Patch","publishedPercent":1.0},{"name":"My Buddy Rex","publishedPercent":2.0},{"name":"Blue Snow Flower Wear","publishedPercent":2.0},{"name":"Superstar Headphones","publishedPercent":1.0},{"name":"Kitty Hoodie","publishedPercent":2.0},{"name":"Pink Down Parka","publishedPercent":2.0},{"name":"Amorian Pink Skirt","publishedPercent":2.0},{"name":"Ice Cold Red","publishedPercent":2.0},{"name":"Teddy Bear Headgear","publishedPercent":2.0},{"name":"Teddy Bear Costume","publishedPercent":2.0},{"name":"Teddy Bear Shoes","publishedPercent":3.0},{"name":"Teddy Bear","publishedPercent":1.0},{"name":"Teddy Bear Gloves","publishedPercent":3.0},{"name":"Cuddle Bear","publishedPercent":1.0},{"name":"Teddy Bear Chat Ring","publishedPercent":1.0},{"name":"Blue Pajama Hat","publishedPercent":2.0},{"name":"Blue Polka-Dot Pajama Top","publishedPercent":3.0},{"name":"Blue Polka-Dot Pajama Pants","publishedPercent":3.0},{"name":"Blue Marble Slippers","publishedPercent":3.0}],"notes":["The probability page retains an Oct 20 publication clock but its captured body contains the Nov 4 Teddy rotation. This receipt applies only to the Nov 4 edition; it does not establish earlier contents or their probabilities."],"publishedProbabilitySum":100.0},{"id":"halloween-2026-10-28","name":"Halloween Mystery Fashion Crate","title":"Halloween Mystery Fashion Crate · Oct 28 rotation","game":"MapleStory Classic World","region":"Global","saleStart":"2026-10-28T08:00:00Z","saleEnd":"2026-11-04T07:59:00Z","saleWindow":"Oct 28, 08:00 → Nov 4, 07:59 UTC","crateDurationDays":7,"cost":{"currency":"NX","single":4900,"bundle":49000,"bundleCount":11},"announcement":{"pageUrl":"https://www.nexon.com/maplestory/news/46602","contentUrl":"https://g.nexonstatic.com/maplestory/cms/v1/news/46602","publishedAt":"2026-10-27T16:00:00Z","capturedAt":"2026-11-05T13:19:54.628854+00:00","sha256":"652f23ed72f93da323f6d734c47903e5c7770cf9aaa4fc1558fa8a9c9a29c866"},"probabilitySource":{"pageUrl":"https://www.nexon.com/maplestory/general-post/46524","contentUrl":"https://g.nexonstatic.com/maplestory/cms/v1/general-posts/46524","publishedAt":"2026-10-27T16:00:00Z","capturedAt":"2026-11-05T13:19:55.925107+00:00","sha256":"16d4689fa00b005ccee9f89e3e591fd9251dd3abe3f865fcc72685e22bf12c30"},"probabilityStatus":"verified_published_rounded","outcomes":[{"name":"Tiger Mask","publishedPercent":2.0},{"name":"Prisoner Top","publishedPercent":2.0},{"name":"Prisoner Pants","publishedPercent":2.0},{"name":"Brown Bandage","publishedPercent":2.0},{"name":"Scream Mask","publishedPercent":3.0},{"name":"Skull T-Shirt","publishedPercent":2.0},{"name":"Bone Buckled Slacks","publishedPercent":3.0},{"name":"Skull Beanie","publishedPercent":3.0},{"name":"Dark Suit","publishedPercent":3.0},{"name":"Dark Enamel Suit","publishedPercent":3.0},{"name":"Black Leather Boots","publishedPercent":3.0},{"name":"Black Bandage","publishedPercent":2.0},{"name":"Skull Patch","publishedPercent":1.0},{"name":"Grey Skull Overall","publishedPercent":2.5},{"name":"Red Skull Overall","publishedPercent":2.5},{"name":"Skull Gloves","publishedPercent":2.0},{"name":"Black Coat of Death","publishedPercent":2.0},{"name":"Ghost Suit","publishedPercent":2.0},{"name":"Black Shoes of Death","publishedPercent":3.0},{"name":"Hat of Death","publishedPercent":2.0},{"name":"Ragged Gomushin","publishedPercent":2.0},{"name":"Witch Hat","publishedPercent":2.0},{"name":"Ghost Costume","publishedPercent":3.0},{"name":"Witch Clothes","publishedPercent":2.0},{"name":"Witch's Broomstick","publishedPercent":1.0},{"name":"Gargoyle Wings","publishedPercent":1.0},{"name":"Battle Scar","publishedPercent":1.0},{"name":"Mummy Hat","publishedPercent":2.0},{"name":"Mummy Suit","publishedPercent":2.0},{"name":"Mummy Mask","publishedPercent":2.0},{"name":"White Bandage","publishedPercent":2.0},{"name":"Devil Wings","publishedPercent":1.0},{"name":"Blue Chinese Undead Hat","publishedPercent":2.0},{"name":"Blue Chinese Undead Costume","publishedPercent":2.0},{"name":"Maple-Stein Head","publishedPercent":2.0},{"name":"Maple-Stein Face","publishedPercent":2.0},{"name":"Demon Goblin","publishedPercent":1.0},{"name":"Pumpkin Hat","publishedPercent":2.0},{"name":"Pumpkin Headgear","publishedPercent":2.0},{"name":"Pumpkin Suit","publishedPercent":2.0},{"name":"Glowing Pumpkin Basket","publishedPercent":2.0},{"name":"Evil Skull","publishedPercent":1.0},{"name":"Cat Soul","publishedPercent":1.0},{"name":"Devilish Horns","publishedPercent":2.0},{"name":"Devil Horns","publishedPercent":2.0},{"name":"Dark Devil Hat","publishedPercent":2.0},{"name":"Coffin of Gloom","publishedPercent":2.0},{"name":"Count Dracula Cape","publishedPercent":1.0},{"name":"Iljimae Mask","publishedPercent":2.0},{"name":"Stealth Suit","publishedPercent":2.0}],"notes":[],"publishedProbabilitySum":100.0},{"id":"founders-2026-10-06","name":"Founder's Mystery Fashion Crate","title":"Founder's Mystery Fashion Crate · Founder’s Access","game":"MapleStory Classic World","region":"Global","saleStart":null,"saleEnd":"2026-10-28T07:59:00Z","saleWindow":"Oct 6, end of maintenance → Oct 28, 07:59 UTC","crateDurationDays":7,"cost":{"currency":"NX","single":3500,"bundle":35000,"bundleCount":11},"announcement":{"pageUrl":"https://www.nexon.com/maplestory/news/45819","contentUrl":"https://g.nexonstatic.com/maplestory/cms/v1/news/45819","publishedAt":"2026-10-05T19:55:07Z","capturedAt":"2026-11-05T13:19:55.317031+00:00","sha256":"3df1c1ba9b1794b03bd8962bdc3f52cbc5ff70ebf777ca535b909d969df7f629"},"probabilitySource":{"pageUrl":"https://www.nexon.com/maplestory/general-post/45538","contentUrl":"https://g.nexonstatic.com/maplestory/cms/v1/general-posts/45538","publishedAt":"2026-10-05T19:00:49Z","capturedAt":"2026-11-05T13:20:19.247557+00:00","sha256":"6c88e7ce3c274146bb3a5dce350142c445d5e224fd1fe3d11df24097035d5e36"},"probabilityStatus":"verified_published_rounded","outcomes":[{"name":"Angel Halo","publishedPercent":1.0},{"name":"Toga","publishedPercent":1.0},{"name":"Baby Angel Wings","publishedPercent":1.0},{"name":"Angel Wand","publishedPercent":1.0},{"name":"Cherub's Bow","publishedPercent":1.0},{"name":"Blue Cap","publishedPercent":2.0},{"name":"Orange Baseball Jacket","publishedPercent":2.5},{"name":"Rainbow Knit","publishedPercent":2.5},{"name":"Ripped Jeans","publishedPercent":2.5},{"name":"Orange Toy Hammer","publishedPercent":1.0},{"name":"Blue Bucket Hat","publishedPercent":2.5},{"name":"Tourist T","publishedPercent":2.5},{"name":"White Jeans","publishedPercent":2.5},{"name":"Black Sunglasses","publishedPercent":1.0},{"name":"Cat Hat","publishedPercent":2.5},{"name":"Cat Suit","publishedPercent":2.5},{"name":"Gold Kitty Slippers","publishedPercent":2.5},{"name":"Kitty Chat Ring","publishedPercent":2.5},{"name":"Meshcap","publishedPercent":2.5},{"name":"Pink Allstar","publishedPercent":2.5},{"name":"Jean Shorts","publishedPercent":2.5},{"name":"Beret","publishedPercent":2.5},{"name":"Red Sailor Shirt","publishedPercent":2.5},{"name":"Red Sailor Skirt","publishedPercent":2.5},{"name":"Black Enamel Shoes","publishedPercent":2.5},{"name":"Patissier Hat","publishedPercent":3.0},{"name":"Patissier Uniform","publishedPercent":3.0},{"name":"Yellow Spatula","publishedPercent":1.0},{"name":"Bunny Ears","publishedPercent":1.0},{"name":"Bunny Earmuffs","publishedPercent":1.0},{"name":"Orange Mushroom Balloon","publishedPercent":1.0},{"name":"Blue Watch","publishedPercent":2.5},{"name":"Red Trainer Jacket","publishedPercent":2.5},{"name":"Red Trainer Pants","publishedPercent":2.5},{"name":"Yellow Rainbow Sneaks","publishedPercent":2.5},{"name":"Dollish Pink","publishedPercent":1.0},{"name":"Purple Dorothy Dress","publishedPercent":2.5},{"name":"Sailor Hat","publishedPercent":2.0},{"name":"Sailor Outfit","publishedPercent":2.0},{"name":"White Ribboned Sailor Dress","publishedPercent":2.0},{"name":"Slime T-Shirt","publishedPercent":1.0},{"name":"Slime Slippers","publishedPercent":1.0},{"name":"Slime Earrings","publishedPercent":1.0},{"name":"Reggae Hat","publishedPercent":2.5},{"name":"Orange Hooded Shirt","publishedPercent":2.5},{"name":"White Hooded Vest","publishedPercent":2.5},{"name":"Butterfly Skirt","publishedPercent":2.5},{"name":"Beetle Long Sleeve","publishedPercent":2.5},{"name":"Lined Hip-Hop Pants","publishedPercent":2.5},{"name":"White Label Ring","publishedPercent":1.0}],"notes":[],"publishedProbabilitySum":100.0},{"id":"aurora-season-1-2026","name":"Aurora Mystery Fashion Crate","title":"Aurora Mystery Fashion Crate · Season 1","game":"MapleStory Classic World","region":"Global","saleStart":null,"saleEnd":"2027-01-13T07:59:00Z","saleWindow":"Oct 6, end of maintenance → Jan 13, 2027, 07:59 UTC","crateDurationDays":7,"cost":{"currency":"Aurora Stamps","single":20,"bundle":200,"bundleCount":10},"announcement":{"pageUrl":"https://www.nexon.com/maplestory/news/45819","contentUrl":"https://g.nexonstatic.com/maplestory/cms/v1/news/45819","publishedAt":"2026-10-05T19:55:07Z","capturedAt":"2026-11-05T13:19:55.317031+00:00","sha256":"3df1c1ba9b1794b03bd8962bdc3f52cbc5ff70ebf777ca535b909d969df7f629"},"probabilitySource":{"pageUrl":"https://www.nexon.com/maplestory/general-post/45659","contentUrl":"https://g.nexonstatic.com/maplestory/cms/v1/general-posts/45659","publishedAt":"2026-10-05T19:00:23Z","capturedAt":"2026-11-05T13:20:19.595096+00:00","sha256":"2da85bc74092abda3f075bb94aa001596ecc2e4a7c21d8658aef481f084861ee"},"probabilityStatus":"verified_published_rounded","outcomes":[{"name":"White Choco Bunny","publishedPercent":1.5},{"name":"Splash Choco Boy","publishedPercent":2.5},{"name":"Splash Choco Girl","publishedPercent":2.5},{"name":"Cacao Bear Shoes","publishedPercent":2.5},{"name":"Chocolate Ribbon","publishedPercent":2.5},{"name":"Soft Chocolate Fondue Scepter","publishedPercent":1.5},{"name":"Choco Candy Cookie","publishedPercent":2.0},{"name":"Black Cat Beanie","publishedPercent":5.0},{"name":"Sky Blue Cat Beanie","publishedPercent":5.0},{"name":"Orange Cat Beanie","publishedPercent":5.0},{"name":"Heart Sunglasses","publishedPercent":5.0},{"name":"Red Check Rider","publishedPercent":5.0},{"name":"Violet Dot Jeans","publishedPercent":5.0},{"name":"Pink Bunny Sweater","publishedPercent":5.0},{"name":"Hearts Tights","publishedPercent":5.0},{"name":"Pink Elephant Slippers","publishedPercent":5.0},{"name":"Loose Fit Sweater","publishedPercent":4.5},{"name":"Stocking Shorts","publishedPercent":4.5},{"name":"Detective Glass","publishedPercent":2.0},{"name":"Blank Eye Patch","publishedPercent":2.0},{"name":"Heartbreaker Lips","publishedPercent":2.0},{"name":"Starlight Heart Scepter","publishedPercent":2.0},{"name":"Ink-and-Wash Thought Bubble Ring","publishedPercent":5.75},{"name":"Ink-and-Wash Painting Name Tag Ring","publishedPercent":5.75},{"name":"Chocolate Label Ring","publishedPercent":5.75},{"name":"Chocolate Chat Ring","publishedPercent":5.75}],"notes":["Stamp cost has no fixed NX equivalent here; exchanging an unwanted reward has an opportunity cost, not a guaranteed original NX purchase cost."],"publishedProbabilitySum":100.0},{"id":"mystery-fashion-grand-launch-2026","name":"Mystery Fashion Crate","title":"Mystery Fashion Crate · Grand Launch rotation","game":"MapleStory Classic World","region":"Global","saleStart":null,"saleEnd":"2026-11-04T07:59:00Z","saleWindow":"Grand Launch Oct 21 → Nov 4, 07:59 UTC","crateDurationDays":7,"cost":{"currency":"NX","single":3500,"bundle":35000,"bundleCount":11},"announcement":{"pageUrl":"https://www.nexon.com/maplestory/news/46362","contentUrl":"https://g.nexonstatic.com/maplestory/cms/v1/news/46362","publishedAt":"2026-10-20T16:00:02Z","capturedAt":"2026-11-05T13:19:54.983299+00:00","sha256":"4984ca3d0227803b82c0ab09ac69817265b66fd36a7cae0d4cbcc3765979b2e6"},"probabilitySource":null,"probabilityStatus":"unavailable_historical_edition_overwritten","outcomes":[],"notes":["The historical announcement links to the same mutable probability URL now serving the Nov 4 rotation. No contemporaneous Grand Launch probability snapshot is verified here; do not reuse the newer table."],"publishedProbabilitySum":null}]};
  const make = (tag, cls, text) => { const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n; };
  const positive = v => Number.isFinite(v)&&v>0;
  // IDs were resolved by unique exact names in the captured MCW client catalog;
  // the independent official probability table above supplies the probabilities.
  const rollingPlanHash = 'dc2b91bb8252bd5e9556c341139bc4f3c22e14a95884ea6d6780a909c5d4b0ed';
  const rollingRewardIds = {"Woodsman Hat":1007074,"Bomber Jacket":1047135,"Patched Denim Jeans":1067174,"Green Sports Goggles":1027028,"Pelvis Hoodie":1047094,"Red Hooded Coat":1047095,"Bunny-Padded Snowboard Pants":1067079,"Pillow":1702019,"Grey Visor Beanie":1007132,"Black Fur Wrap Coat":1057094,"Blue Kitty Hood":1057089,"Mix-n-Match Sneakers":1077058,"Starry Sky Blue Beanie":1007043,"Big Rabbit Feet":1077030,"White Rabbit's Foot":1702026,"Olive Beanie":1007072,"Bandage Strip":1017015,"Pink Knitted Gumball":1007274,"Pink Snowboard Top":1047015,"Pink Snowboard Pants":1067013,"Pink Galoshes":1077023,"Bunny Hat":1007053,"Bunny Slippers":1077020,"Pink Rabbit Puppet":1702017,"Bunny Costume":1057057,"Old School Uniform Hat":1007103,"Old School Blazer":1047044,"Old School Uniform Top":1047075,"Old School Uniform Pants":1067045,"Old School Uniform Skirt":1067065,"White High Top":1077087,"Medical Eye Patch":1027022,"My Buddy Rex":1107016,"Blue Snow Flower Wear":1057128,"Superstar Headphones":1007137,"Kitty Hoodie":1057095,"Pink Down Parka":1047089,"Amorian Pink Skirt":1067078,"Ice Cold Red":1017088,"Teddy Bear Headgear":1007133,"Teddy Bear Costume":1057099,"Teddy Bear Shoes":1077053,"Teddy Bear":1702013,"Teddy Bear Gloves":1087019,"Cuddle Bear":1107013,"Teddy Bear Chat Ring":1112217,"Blue Pajama Hat":1007058,"Blue Polka-Dot Pajama Top":1047021,"Blue Polka-Dot Pajama Pants":1067018,"Blue Marble Slippers":1077018};
  const clock = v => typeof v==='string'&&/(?:Z|[+-]\d\d:\d\d)$/.test(v)&&Number.isFinite(Date.parse(v))?Date.parse(v):null;
  function rollingValue(edition,snapshot) {
    const refs=snapshot?.cashPriceReferences, supported=edition.id==='mystery-fashion-2026-11-04';
    const identity=supported&&refs?.schemaVersion===1&&refs.kind==='supplemental_cash_rolling_references'&&refs.editionId===edition.id&&refs.planHash===rollingPlanHash&&refs.sourceUrl==='https://mesos.watch/';
    const items=identity&&Array.isArray(refs.items)?refs.items:[],batch=identity?refs.latestBatch:null,start=clock(batch?.captureStartedAt),end=clock(batch?.captureCompletedAt);
    const complete=!!(batch?.completePlan===true&&batch.completedAttemptCount===50&&batch.acceptedSaleCount===50&&batch.noEligibleSalesCount===0&&Array.isArray(batch.missingItemIds)&&batch.missingItemIds.length===0&&start!==null&&end!==null&&end>=start&&items.length===50);
    const rows=edition.outcomes.map(outcome=>{
      const id=rollingRewardIds[outcome.name],matches=items.filter(r=>r&&r.id===id),r=matches.length===1?matches[0]:null,captured=clock(r?.capturedAt);
      const valid=supported&&r&&r.expectedItemId===id&&r.name===outcome.name&&r.expectedItemName===outcome.name&&positive(r.price)&&Number.isInteger(r.salesCounted)&&r.salesCounted>=5&&r.windowDays===30&&r.priceBasis==='median of sales'&&r.currency==='mesos'&&r.statRollKnown===true&&(r.statRoll==='Clean'||r.statRoll===null)&&r.captureTimeKind==='per_item_return'&&captured!==null;
      const inBatch=valid&&start!==null&&end!==null&&captured>=start&&captured<=end;
      return {...outcome,id,reference:valid?r:null,inBatch:!!inBatch};
    });
    const priced=rows.filter(r=>r.reference),probability=priced.reduce((sum,r)=>sum+r.publishedPercent,0),all=supported&&rows.length===50&&priced.length===50&&rows.every(r=>r.inBatch)&&complete&&edition.publishedProbabilitySum===100;
    return {supported,identity,rows,priced:priced.length,probability,complete,ev:all?rows.reduce((sum,r)=>sum+r.publishedPercent/100*r.reference.price,0):null,start:batch?.captureStartedAt??null,end:batch?.captureCompletedAt??null,mixedCaptureTimes:new Set(priced.map(r=>r.reference.capturedAt)).size>1,windowDays:30,contentHash:identity?refs.contentHash??null:null};
  }
  window.AstraMysteryBoxes = { rollingValue };
  const day = v => typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
  const fmt = (v,d=1) => Number.isFinite(v)?v.toLocaleString('en-US',{maximumFractionDigits:d}):'Unavailable';
  const time = v => typeof v==='string'&&/(?:Z|[+-]\d\d:\d\d)$/.test(v)&&Number.isFinite(Date.parse(v))?v.replace('T',' ').replace(/Z$/,' UTC'):'Unknown';
  const page=make('section','view mystery-boxes');page.id='view-mystery-boxes';page.hidden=true;page.setAttribute('aria-labelledby','mystery-box-title');
  page.innerHTML='<div class="page-heading"><div><p class="eyebrow">OFFICIAL EDITIONS / SEPARATE MARKET OBSERVATIONS</p><h1 id="mystery-box-title">Mystery boxes.</h1><p>Published rewards, purchase costs and dated resale evidence. Random rewards have no fixed individual NX purchase cost.</p></div></div><p class="mystery-source-clock" role="status"></p><div class="mystery-controls"><label>Cash-shop edition<select id="mystery-edition"></select></label><label>Market source day<select id="mystery-day"></select></label></div><div class="mystery-edition"></div><div class="mystery-values" aria-live="polite"></div><p class="mystery-limitations">Reward expected value is a gross resale proxy using published rounded probabilities × same-day qualified daily medians (at least five recorded sales per reward). It requires every outcome to be priced. Prices are source-inferred aggregates that can mix item quality; fees, selling delays, liquidity and unobserved trades are excluded. This is not a realized return, guaranteed sale or NX exchange rate.</p><div class="mystery-rewards"></div><details class="mystery-history"><summary>Value history and calculation coverage</summary><div></div></details><details class="mystery-provenance"><summary>Edition identity, source clocks and evidence</summary><div></div></details><p><a href="#cash-catalog">Cash catalog →</a> · <a href="#nx">Known-price NX estimates →</a></p>';
  content.append(page);
  const editionSelect=page.querySelector('#mystery-edition'),daySelect=page.querySelector('#mystery-day'),editionHost=page.querySelector('.mystery-edition'),valueHost=page.querySelector('.mystery-values'),rewardHost=page.querySelector('.mystery-rewards');
  for(const e of evidence.editions){const o=make('option','',e.title);o.value=e.id;editionSelect.append(o);}
  for(const id of ['view-cash-catalog','view-cash-basket','view-nx']){const view=document.getElementById(id);if(!view)continue;const p=make('p','mystery-box-link'),a=make('a','','Mystery boxes: rewards, costs and values →');a.href='#mystery-boxes';p.append(a);const h=view.querySelector('.page-heading');if(h)h.after(p);else view.prepend(p);}
  let report=null, sourceRows=[], selectedDay=null, sortKey='name', ascending=true, historySort='date', historyAscending=false, rollingSort='name', rollingAscending=true;
  const rollingHost=make('section','mystery-rolling');rollingHost.setAttribute('aria-labelledby','mystery-rolling-title');valueHost.after(rollingHost);
  function matching(name){const matches=sourceRows.filter(r=>typeof r.name==='string'&&r.name.toLocaleLowerCase()===name.toLocaleLowerCase());return matches.length===1?matches[0]:null;}
  function price(row,date){if(!row||!Array.isArray(row.history))return null;const found=row.history.filter(p=>Array.isArray(p)&&p[0]===date&&positive(p[1])&&Number.isInteger(p[2])&&p[2]>=5);return found.length===1?{value:found[0][1],quantity:found[0][2]}:null;}
  function valueAt(edition,date){const startDay=edition.id==='mystery-fashion-2026-11-04'?'2026-11-04':edition.id==='halloween-2026-10-28'?'2026-10-28':edition.id==='mystery-fashion-grand-launch-2026'?'2026-10-21':'2026-10-06';const eligible=day(date)&&date>=startDay;const rows=edition.outcomes.map(o=>({...o,row:matching(o.name)})).map(o=>({...o,point:eligible?price(o.row,date):null}));const priced=rows.filter(o=>o.point),probability=priced.reduce((s,o)=>s+o.publishedPercent,0),all=rows.length>0&&priced.length===rows.length;return {rows,priced:priced.length,probability,ev:all?priced.reduce((s,o)=>s+o.point.value*o.publishedPercent/100,0):null};}
  function link(url,label){const a=make('a','',label);a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;}
  function card(label,value,note){const c=make('article','mystery-value');c.append(make('h2','',label),make('strong','',value),make('p','',note));return c;}
  function drawRolling(edition){
    const value=rollingValue(edition,report);rollingHost.replaceChildren();
    if(!value.supported)return;
    const heading=make('h2','','Rolling-reference reward value');heading.id='mystery-rolling-title';
    const summary=card('Expected gross value · rolling references',value.ev===null?'Unavailable':fmt(value.ev)+' mesos',`${value.priced}/50 rewards priced · ${fmt(value.probability,2)}% published probability coverage. ${value.ev===null?'All 50 valid references within one complete capture batch are required; no partial basket is renormalized.':`${fmt(value.ev*edition.cost.bundleCount)} mesos expected gross proxy for ${edition.cost.bundleCount} openings under the same published rounded odds.`}`);summary.dataset.mysteryRollingEv='true';
    const span=clock(value.start)!==null&&clock(value.end)!==null&&clock(value.end)>=clock(value.start)?Math.ceil((clock(value.end)-clock(value.start))/60000):null;
    rollingHost.append(heading,summary,make('p','mystery-rolling-clocks',`Capture batch: ${time(value.start)} → ${time(value.end)}${span!==null?` (approximately ${span} minutes)` :''}. ${value.mixedCaptureTimes?'Mixed per-item receipt clocks.':'Per-item receipt clocks are retained where available.'} These receipt times are not underlying sale timestamps.`),make('p','mystery-rolling-caution','Separate 30-day reported-lookback medians of sales, labelled Clean or explicitly null by the source. Actual source-window boundaries and underlying observation timestamps are unknown; no same-day or instant EV is implied. A Clean label does not establish constant item quality. Prices are not guaranteed executable proceeds; fees, liquidity and selling delays are excluded. This branch does not change daily EV, fixed reward NX costs, the headline or fee settings.'));
    const details=make('details','mystery-rolling-details'),title=make('summary','','Individual rolling references and receipt clocks');details.append(title);
    const table=make('table');table.setAttribute('aria-label','Separate rolling reward medians and per-item receipt clocks');const head=table.createTHead().insertRow();
    for(const [key,label] of [['name','Reward'],['id','Verified item ID'],['price','Rolling median · mesos'],['quantity','Recorded count'],['capturedAt','Receipt time · UTC']]){const th=make('th');th.setAttribute('aria-sort',key===rollingSort?(rollingAscending?'ascending':'descending'):'none');const button=make('button','',label+(key===rollingSort?(rollingAscending?' ↑':' ↓'):''));button.type='button';button.dataset.mysteryRollingSort=key;th.append(button);head.append(th);}
    const rows=value.rows.map((r,i)=>({...r,price:r.reference?.price??null,quantity:r.reference?.salesCounted??null,capturedAt:r.reference?.capturedAt??null,i})).sort((a,b)=>{const x=a[rollingSort],y=b[rollingSort];if(x===null||x===undefined)return y===null||y===undefined?a.i-b.i:1;if(y===null||y===undefined)return-1;return(typeof x==='number'?x-y:String(x).localeCompare(String(y)))*(rollingAscending?1:-1)||a.i-b.i;});
    const body=table.createTBody();for(const r of rows){const tr=body.insertRow();tr.dataset.mysteryRollingReward=r.name;tr.insertCell().textContent=r.name;tr.insertCell().textContent=String(r.id);tr.insertCell().textContent=fmt(r.price);tr.insertCell().textContent=fmt(r.quantity,0);tr.insertCell().textContent=r.capturedAt?time(r.capturedAt):'Unavailable';}
    const wrap=make('div','table-wrap');wrap.append(table);details.append(wrap,make('p','',`Capture plan SHA-256: ${rollingPlanHash}. Source snapshot hash: ${value.contentHash||'Unavailable'}.`),link('https://mesos.watch/','Rolling-reference source: mesos.watch ↗'));rollingHost.append(details);
  }
  function draw(){
    const e=evidence.editions.find(e=>e.id===editionSelect.value)||evidence.editions[0],v=valueAt(e,selectedDay),crate=price(matching(e.name),selectedDay),cost=e.cost;
    drawRolling(e);
    editionHost.replaceChildren(make('h2','',e.title),make('p','',`Published sale window: ${e.saleWindow}. Crate duration: ${e.crateDurationDays} days. This describes the announcement, not current shop or listing availability.`),make('p','',`${fmt(cost.single,0)} ${cost.currency} for one · ${fmt(cost.bundle,0)} ${cost.currency} for ${cost.bundleCount} (${fmt(cost.bundle/cost.bundleCount,2)} per crate). Reward contents are random.`));
    valueHost.replaceChildren(card('Crate-name daily unit median',crate?fmt(crate.value)+' mesos':'Unavailable',crate?`${selectedDay} · ${fmt(crate.quantity,0)} recorded sales; name match only, not edition-identified units or a live ask.`:'No same-day qualified crate observation.'),card(`${cost.bundleCount}-crate market proxy`,crate?fmt(crate.value*cost.bundleCount)+' mesos':'Unavailable',`${cost.bundleCount} × observed unit median; not an observed bundle trade.`),card('Reward expected gross value',v.ev===null?'Unavailable':fmt(v.ev)+' mesos',e.outcomes.length?`${v.priced}/${e.outcomes.length} rewards priced · ${fmt(v.probability,2)}% published probability coverage · ${selectedDay||'no selected source day'}.${v.ev===null?'':` Expected gross value for ${cost.bundleCount} openings: ${fmt(v.ev*cost.bundleCount)} mesos under the same published odds.`}`:'Earlier-edition probability snapshot not verified; no EV computed.'));
    rewardHost.replaceChildren(make('h2','','Individual reward prices'));
    if(!e.outcomes.length)rewardHost.append(make('p','notice','Grand Launch rates are unavailable in this evidence snapshot. The official rate URL now serves the Nov 4 edition. No newer probabilities or assumed equal chances are substituted.'));
    else {
      const table=make('table');table.dataset.searchReady='true';table.setAttribute('aria-label','Published reward odds and same-day daily prices');const tr=table.createTHead().insertRow(),headers=[['name','Reward'],['publishedPercent','Published probability'],['price','Daily median · mesos'],['quantity','Recorded count']];
      for(const [key,label]of headers){const th=make('th');th.setAttribute('aria-sort',sortKey===key?(ascending?'ascending':'descending'):'none');const b=make('button','',label+(key===sortKey?(ascending?' ↑':' ↓'):''));b.type='button';b.dataset.mysterySort=key;th.append(b);tr.append(th);}
      const body=table.createTBody(),rows=v.rows.map((o,i)=>({...o,price:o.point?.value??null,quantity:o.point?.quantity??null,i})).sort((a,b)=>{const x=a[sortKey],y=b[sortKey];if(x===null||x===undefined)return y===null||y===undefined?a.i-b.i:1;if(y===null||y===undefined)return-1;return(typeof x==='number'?x-y:String(x).localeCompare(String(y)))*(ascending?1:-1)||a.i-b.i;});
      for(const o of rows){const tr=body.insertRow();tr.dataset.mysteryReward=o.name;const name=tr.insertCell();if(o.row&&typeof o.row.slug==='string'&&/^[a-z0-9-]+$/.test(o.row.slug)){const a=make('a','',o.name);a.href='#cash-catalog';a.title='See the cash catalog for retained item history';name.append(a);}else name.textContent=o.name;tr.insertCell().textContent=fmt(o.publishedPercent,2)+'%';tr.insertCell().textContent=fmt(o.price);tr.insertCell().textContent=fmt(o.quantity,0);}
      const wrap=make('div','table-wrap');wrap.append(table);rewardHost.append(make('p','',`Same-day observations: ${selectedDay||'unavailable'}${selectedDay===report?.cashCatalog?.sourceUpdatedAt?.slice(0,10)?' · partial source day':''}. Missing prices stay unavailable; no carry-forward or metadata-only prices.`),wrap);
    }
    const history=page.querySelector('.mystery-history>div');history.replaceChildren();const ht=make('table'),hh=ht.createTHead().insertRow();
    for(const [key,title] of [['date','Source day'],['priced','Rewards priced'],['probability','Probability coverage'],['ev','Reward EV · mesos'],['crate','Crate unit median · mesos']]){const th=make('th');th.setAttribute('aria-sort',key===historySort?(historyAscending?'ascending':'descending'):'none');const button=make('button','',title+(key===historySort?(historyAscending?' ↑':' ↓'):''));button.type='button';button.dataset.mysteryHistorySort=key;th.append(button);hh.append(th);}
    const hb=ht.createTBody(),historyRows=[...daySelect.options].map(o=>{const x=valueAt(e,o.value),c=price(matching(e.name),o.value);return{date:o.value,priced:x.priced,probability:e.outcomes.length?x.probability:null,ev:x.ev,crate:c?.value??null};}).sort((a,b)=>{const x=a[historySort],y=b[historySort];if(x===null)return y===null?a.date.localeCompare(b.date):1;if(y===null)return-1;return(typeof x==='number'?x-y:x.localeCompare(y))*(historyAscending?1:-1)||a.date.localeCompare(b.date);});
    for(const x of historyRows){const r=hb.insertRow();r.insertCell().textContent=x.date+(x.date===report?.cashCatalog?.sourceUpdatedAt?.slice(0,10)?' · partial':'');r.insertCell().textContent=`${x.priced}/${e.outcomes.length}`;r.insertCell().textContent=fmt(x.probability,2)+(x.probability===null?'':'%');r.insertCell().textContent=fmt(x.ev);r.insertCell().textContent=fmt(x.crate);}
    const hw=make('div','table-wrap');hw.append(ht);history.append(hw,make('p','','Each day stands alone; missing outcomes produce an unavailable EV rather than a partial basket or a substituted older price. Source counts are inferred sales, not confirmed individual transactions.'));
    const provenance=page.querySelector('.mystery-provenance>div');provenance.replaceChildren(make('p','',`Edition key: ${e.id}. Game: ${e.game}, ${e.region}.`),link(e.announcement.pageUrl,'Official cash-shop announcement ↗'),make('p','',`Announcement published ${time(e.announcement.publishedAt)}; evidence received ${time(e.announcement.capturedAt)}. Receipt SHA-256: ${e.announcement.sha256}.`));
    if(e.probabilitySource)provenance.append(link(e.probabilitySource.pageUrl,'Official reward probabilities ↗'),make('p','',`${e.outcomes.length} published outcomes; displayed sum ${fmt(e.publishedProbabilitySum,2)}%. Rates are rounded by the publisher and are not renormalized. Rate-page original publication ${time(e.probabilitySource.publishedAt)}; receipt ${time(e.probabilitySource.capturedAt)}; SHA-256 ${e.probabilitySource.sha256}. A receipt timestamp is not an underlying market observation.`));
    for(const note of e.notes)provenance.append(make('p','',note));
    page.querySelector('.mystery-source-clock').textContent=`Market source publication: ${time(report?.cashCatalog?.sourceUpdatedAt)}. Selected day: ${selectedDay||'unavailable'}. Official edition evidence is a separate dated receipt; no current availability is confirmed.`;
  }
  page.querySelector('.mystery-history').addEventListener('click',ev=>{const b=ev.target.closest('[data-mystery-history-sort]');if(!b)return;const key=b.dataset.mysteryHistorySort;historyAscending=key===historySort?!historyAscending:false;historySort=key;draw();});
  rollingHost.addEventListener('click',ev=>{const button=ev.target.closest('button[data-mystery-rolling-sort]');if(!button)return;const key=button.dataset.mysteryRollingSort;rollingAscending=key===rollingSort?!rollingAscending:key==='name';rollingSort=key;drawRolling(evidence.editions.find(e=>e.id===editionSelect.value)||evidence.editions[0]);});
  editionSelect.addEventListener('change',draw);daySelect.addEventListener('change',()=>{selectedDay=daySelect.value;draw();});rewardHost.addEventListener('click',ev=>{const b=ev.target.closest('[data-mystery-sort]');if(!b)return;const key=b.dataset.mysterySort;ascending=sortKey===key?!ascending:key==='name';sortKey=key;draw();});
  document.addEventListener('astramarketsnapshot',ev=>{report=ev.detail||{};sourceRows=(Array.isArray(report.cashCatalog?.rows)?report.cashCatalog.rows:[]).filter(r=>r&&typeof r.name==='string');const days=[...new Set(sourceRows.flatMap(r=>Array.isArray(r.history)?r.history.filter(p=>Array.isArray(p)&&day(p[0])&&positive(p[1])&&Number.isInteger(p[2])&&p[2]>=5).map(p=>p[0]):[]))].sort().reverse();daySelect.replaceChildren();for(const date of days){const o=make('option','',date+(date===report.cashCatalog?.sourceUpdatedAt?.slice(0,10)?' · partial source day':''));o.value=date;daySelect.append(o);}if(!days.includes(selectedDay))selectedDay=days.find(d=>d<report.cashCatalog?.sourceUpdatedAt?.slice(0,10))||days[0]||null;if(selectedDay)daySelect.value=selectedDay;draw();});
  draw();document.dispatchEvent(new CustomEvent('astramarkethighlightsready'));window.dispatchEvent(new Event('hashchange'));
})();

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "mystery-boxes.js", status: "initialization_failed"}})); } catch {}
}

;
/* Astra source: speculation.js */
try {
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

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "speculation.js", status: "initialization_failed"}})); } catch {}
}

;
/* Astra source: popular-fashion.js */
try {
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

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "popular-fashion.js", status: "initialization_failed"}})); } catch {}
}

;
/* Astra source: volatility-preview.js */
try {
(() => {
  'use strict';
  if (window.AstraVolatilityPreview) return;
  const DAY = 86400000, positive = v => typeof v === 'number' && Number.isFinite(v) && v > 0;
  const validDay = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v + 'T00:00:00Z')) && new Date(v + 'T00:00:00Z').toISOString().slice(0, 10) === v;
  const shift = (day, n) => new Date(Date.parse(day + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10);
  const capture=value=>{if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))return 'unknown';const zone=document.getElementById('display-timezone')?.value||'UTC';try{return new Date(value).toLocaleString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false,timeZone:zone})+' '+zone+' '+new Date(value).toLocaleDateString('en-US',{year:'numeric',timeZone:zone});}catch{return value;}};
  function sourceWindow(report) {
    if(report?.apiCalculationView){const publisher=report.apiCalculationView.clocks?.dailyPublisher,day=typeof publisher==='string'?publisher.slice(0,10):null;if(!validDay(day)||!/(?:Z|[+-]\d\d:\d\d)$/.test(publisher)||!Number.isFinite(Date.parse(publisher)))return null;const end=shift(day,-1);return {start:shift(end,-6),end,days:7,possibleReturns:6};}
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
  function rankCohort(rows, bySlug) {
    const unique = new Set((rows || []).filter(row => row && /^[a-z0-9][a-z0-9-]*$/.test(row.slug)).map(row => row.slug));
    const sorted = [...unique].map(slug => bySlug.get(slug)).filter(row => row && Number.isFinite(row.value) && row.value >= 0).sort((a, b) => b.value - a.value || a.slug.localeCompare(b.slug));
    const values = new Map(); let rank = 0, prior;
    sorted.forEach((row, index) => { if (index === 0 || row.value !== prior) rank = index + 1; prior = row.value; values.set(row.slug, { ...row, rank }); });
    return { values, eligible: sorted.length, total: unique.size };
  }
  function legacyModel(report) {
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
    let nxRows = report.cash || []; try { if (typeof windowThis.buildCashPricing === 'function') nxRows = windowThis.buildCashPricing(report).rows; } catch { /* Retained cash rows still define a bounded fallback cohort. */ }
    return { window, cashItems, goodsItems, bySlug, categories, cohorts: { goods: rankCohort(report.rows, bySlug), nx: rankCohort(nxRows, bySlug), catalog: rankCohort(report.cashCatalog?.rows, bySlug) }, cashWinner: winner(cashItems), goodsWinner: winner(goodsItems), sourceUpdatedAt: report.sourceUpdatedAt };
  }
  function model(report) {
    if(!report?.apiCalculationView)return legacyModel(report);
    const view=report.apiCalculationView,window=sourceWindow(report);if(!window)return null;
    const items=Array.isArray(report.apiDailyItems)?report.apiDailyItems:[],ids=new Set(),slugs=new Set(),api=[];
    if(items.length!==79||items.filter(r=>r?.role==='goods').length!==50||items.filter(r=>r?.role==='cash').length!==29)return null;
    for(const row of items){if(!row||!Number.isSafeInteger(row.itemId)||row.itemId<1||ids.has(row.itemId)||typeof row.slug!=='string'||!/^[a-z0-9][a-z0-9-]*$/.test(row.slug)||slugs.has(row.slug)||!['goods','cash'].includes(row.role)||!Array.isArray(row.points)||row.points.length>31)return null;ids.add(row.itemId);slugs.add(row.slug);
      const seen=new Set();let duplicate=false;const history=[];for(const p of row.points){if(!p||!validDay(p.day))continue;if(seen.has(p.day)){duplicate=true;break;}seen.add(p.day);if(p.qualified!==true||p.partialCalendarDay!==false||!Number.isSafeInteger(p.recordedSalesCount)||p.recordedSalesCount<5)continue;const price=row.role==='goods'?p.linkedPrice:typeof p.medianUnitPriceLexeme==='string'?Number(p.medianUnitPriceLexeme):null;if(positive(price))history.push([p.day,price,p.recordedSalesCount]);}
      const base=(report.rows||[]).find(r=>r.slug===row.slug);if(row.role==='goods'&&!base)return null;
      const usedDays=new Set((duplicate?[]:history).filter(p=>p[0]>=window.start&&p[0]<=window.end).map(p=>p[0]));
      const originalReceipts=row.points.filter(p=>usedDays.has(p?.day)&&typeof p.source?.capturedAt==='string'&&Number.isFinite(Date.parse(p.source.capturedAt))).map(p=>p.source.capturedAt).sort((a,b)=>Date.parse(a)-Date.parse(b));
      api.push({slug:row.slug,name:row.name,category:row.role==='goods'?base.category:'Cash Shop',role:row.role,history:duplicate?[]:history,originalReceipts});
    }
    const describe=row=>({slug:row.slug,name:row.name,category:row.category,oldestOriginalReceipt:row.originalReceipts[0]??null,newestOriginalReceipt:row.originalReceipts.at(-1)??null,...dailyVolatility(row.history,window)}),cashItems=api.filter(r=>r.role==='cash').map(describe),goodsItems=api.filter(r=>r.role==='goods').map(describe),bySlug=new Map([...cashItems,...goodsItems].map(r=>[r.slug,r]));
    const categories=(report.categories||[]).map(category=>{const members=(report.rows||[]).filter(r=>r.category===category.name),qualified=members.map(r=>bySlug.get(r.slug)).filter(r=>Number.isFinite(r?.value)).sort((a,b)=>a.value-b.value),middle=Math.floor(qualified.length/2);return {name:category.name,value:qualified.length?qualified.length%2?qualified[middle].value:(qualified[middle-1].value+qualified[middle].value)/2:null,eligible:qualified.length,total:members.length,kind:'median_member_volatility'};});
    const winner=rows=>[...rows].filter(r=>Number.isFinite(r.value)).sort((a,b)=>b.value-a.value||a.slug.localeCompare(b.slug))[0]||null;
    const {apiCalculationView:_view,apiDailyItems:_items,...legacyReport}=report;
    legacyReport.sourceUpdatedAt=report.cashCatalog?.sourceUpdatedAt||view.clocks?.legacyDaily;delete legacyReport.lastCompleteDay;legacyReport.latest={...report.latest,partial:true};
    const legacy=legacyModel(legacyReport),catalog=legacy?.cohorts.catalog||rankCohort(report.cashCatalog?.rows,new Map());
    return {basis:'api_actual_daily',window,cashItems,goodsItems,bySlug,categories,cohorts:{goods:rankCohort(report.rows,bySlug),nx:rankCohort(api.filter(r=>r.role==='cash'),bySlug),catalog},cashWinner:winner(cashItems),goodsWinner:winner(goodsItems),sourceUpdatedAt:view.clocks.dailyPublisher,dailyCapturedAt:view.clocks.dailyCapture,catalogWindow:legacy?.window??null,legacyCatalogPublished:legacyReport.sourceUpdatedAt};
  }
  const windowThis = window;
  window.AstraVolatilityPreview = Object.freeze({ sourceWindow, dailyVolatility, model, rankCohort });
  const options = document.getElementById('display-options'); if (!options) return;
  const make = (tag, text, className) => { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; };
  const key = 'astra-volatility-preview-v1', categoryKey = 'astra-category-member-volatility-v1', cashKey = 'astra-cash-volatility-badges-v1', tableKey = 'astra-volatility-tables-v1'; let enabled = true, categoryEnabled = false, cashEnabled = false, tablesEnabled = true, report, current, scheduled = false, lastCatalogKey;
  try { enabled = localStorage.getItem(key) !== 'off'; } catch { /* The display remains usable in this tab. */ }
  try { categoryEnabled = localStorage.getItem(categoryKey) === 'on'; } catch { /* Category member badges default off. */ }
  try { cashEnabled = localStorage.getItem(cashKey) === 'on'; } catch { /* Item-card badges default off. */ }
  try { tablesEnabled = localStorage.getItem(tableKey) !== 'off'; } catch { /* Table columns default on. */ }
  const controls = make('div', undefined, 'hero-layout-options volatility-preview-options'); controls.dataset.previewControls = ''; controls.setAttribute('role', 'group'); controls.setAttribute('aria-label', 'Daily price volatility preview');
  const toggle = make('button'), categoryToggle = make('button'), cashToggle = make('button'), tableToggle = make('button'); toggle.type = categoryToggle.type = cashToggle.type = tableToggle.type = 'button'; categoryToggle.dataset.categoryVolatility = ''; categoryToggle.setAttribute('aria-controls', 'category-cards');cashToggle.dataset.cashVolatility = '';cashToggle.setAttribute('aria-controls','cash-item-highlights');tableToggle.dataset.tableVolatility = '';tableToggle.setAttribute('aria-controls','basket-table cash-table view-cash-catalog');
  const scopeNote=make('small', 'Independent display choices. 7-day window; daily medians, not individual trades. Category labels summarize member volatilities, not category-index volatility.');controls.append(toggle, categoryToggle, cashToggle, tableToggle, scopeNote); options.append(controls);
  const scopes = '#category-cards,#cash-item-highlights,#market-highlights-track,#highlights-fact-grid,#basket-table,#cash-table';
  const observer = new MutationObserver(records => {
    if (!current || scheduled || !(enabled || categoryEnabled || cashEnabled || tablesEnabled)) return;
    const relevant = records.some(record => { const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
      return target?.closest(scopes) || [...record.addedNodes].some(node => node.nodeType === 1 && (node.matches(scopes) || node.querySelector(scopes))); });
    if (relevant) { scheduled = true; queueMicrotask(() => { scheduled = false; decorate(); }); }
  });
  const watch = () => observer.observe(document.body, { childList: true, subtree: true });
  const owned = node => { node.dataset.volatilityOwned = ''; return node; };
  const failedMegaphoneSprites = new Map();
  const percent = value => value === null || value === undefined ? 'Unavailable' : value.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
  const tableStates = new Map(), tableBases = new WeakMap();
  const tableRows = (table, kind) => [...(table.tBodies[0]?.rows || [])].filter(row => kind === 'nx' ? row.dataset.cashItem : row.cells[0]?.querySelector('[data-item]'));
  const tableSlug = (row, kind) => kind === 'nx' ? row.dataset.cashItem : row.cells[0]?.querySelector('[data-item]')?.dataset.item;
  function tableTitle(cohort, kind) {
    return `${current.basis==='api_actual_daily'?'API actual daily medians · ':''}${current.window.start}–${current.window.end}: sample SD of consecutive qualified daily-median log returns × 100; minimum five of six returns, no missing-day bridge or annualization. Rank 1 is highest volatility, not best trading value. ${cohort.eligible} eligible / ${cohort.total} ${kind === 'goods' ? 'fixed goods-basket' : 'fixed-NX cash'} items before search/filter. Ranking uses unrounded values; exact ties share a competition rank.${current.basis==='api_actual_daily'?` Partial UTC source days excluded. Daily receipt ${capture(current.dailyCapturedAt)}; reported sales counts are not units; quality is mixed/unknown. Current 3-day reference is separate.`:''}`;
  }
  function sortRows(table, kind, state) {
    const cohort = current.cohorts[kind], rows = tableRows(table, kind), key = state.key === 'rank' ? 'rank' : 'value';
    const ordered = rows.map((row, order) => ({ row, order, value: cohort.values.get(tableSlug(row, kind))?.[key] ?? null })).sort((a, b) => a.value === null ? b.value === null ? a.order - b.order : 1 : b.value === null ? -1 : (a.value - b.value) * (state.ascending ? 1 : -1) || a.order - b.order);
    if (ordered.some((entry, i) => entry.row !== rows[i])) table.tBodies[0].append(...ordered.map(entry => entry.row));
    for (const header of table.tHead.rows[0].cells) { const active = header.dataset.volatilityColumn === state.key; header.setAttribute('aria-sort', active ? state.ascending ? 'ascending' : 'descending' : 'none'); const button = header.querySelector('[data-volatility-sort]'); if (button) { const label = button.dataset.volatilitySort === 'value' ? '7-day daily price volatility' : 'Volatility rank', text = label + (active ? state.ascending ? ' ↑' : ' ↓' : ''); if (button.textContent !== text) button.textContent = text; } }
  }
  function decorateTables() {
    for (const [selector, kind] of [['#basket-table > table', 'goods'], ['#cash-table > table', 'nx']]) {
      const table = document.querySelector(selector); if (!table?.tHead?.rows[0] || !table.tBodies[0]) continue;
      table.dataset.volatilityTable = kind;
      if (!tablesEnabled || !current) {
        for (const node of table.querySelectorAll('[data-volatility-column]')) node.remove();
        for (const cell of table.querySelectorAll('[data-volatility-base-span]')) { cell.colSpan = Number(cell.dataset.volatilityBaseSpan); delete cell.dataset.volatilityBaseSpan; }
        const base = tableBases.get(table); if (tableStates.has(kind) && base && base.rows.every(row => row.parentElement === table.tBodies[0])) { table.tBodies[0].append(...base.rows); for (const [header, value] of base.headers) value === null ? header.removeAttribute('aria-sort') : header.setAttribute('aria-sort', value); }
        continue;
      }
      const cohort = current.cohorts[kind], title = tableTitle(cohort, kind), headers = table.tHead.rows[0];
      if (!tableBases.has(table) || !tableStates.has(kind)) tableBases.set(table, { rows: tableRows(table, kind), headers: [...headers.cells].filter(h => !h.dataset.volatilityColumn).map(h => [h, h.getAttribute('aria-sort')]) });
      for (const [key, label] of [['value', '7-day daily price volatility'], ['rank', 'Volatility rank']]) {
        let header = [...headers.cells].find(cell => cell.dataset.volatilityColumn === key);
        if (!header) { header = make('th', undefined, 'volatility-table-heading'); header.dataset.volatilityColumn = key; header.scope = 'col'; header.setAttribute('aria-sort', 'none'); const button = make('button', label); button.type = 'button'; button.dataset.volatilitySort = key; header.append(button); headers.append(header); }
        header.title = title;
        if (!tableStates.has(kind)) { header.setAttribute('aria-sort','none'); const button=header.querySelector('button'); if(button.textContent!==label)button.textContent=label; }
      }
      for (const row of table.tBodies[0].rows) if (row.cells.length === 1 && row.cells[0].colSpan > 1) { const cell = row.cells[0]; if (!cell.dataset.volatilityBaseSpan) cell.dataset.volatilityBaseSpan = String(cell.colSpan); cell.colSpan = Number(cell.dataset.volatilityBaseSpan) + 2; }
      for (const row of tableRows(table, kind)) {
        const point = cohort.values.get(tableSlug(row, kind));
        for (const key of ['value', 'rank']) {
          let cell = [...row.cells].find(td => td.dataset.volatilityColumn === key); if (!cell) { cell = make('td', undefined, 'volatility-table-cell'); cell.dataset.volatilityColumn = key; row.append(cell); }
          const text = point ? key === 'value' ? `${percent(point.value)} · ${point.returns}/6 returns` : `#${point.rank} of ${cohort.eligible} eligible / ${cohort.total} items` : 'Unavailable';
          if (cell.textContent !== text) cell.textContent = text; cell.dataset.sortValue = point ? String(point[key]) : ''; cell.title = title+(current.basis==='api_actual_daily'&&point?` Original used daily receipt range ${capture(point.oldestOriginalReceipt)}–${capture(point.newestOriginalReceipt)}; not individual sale times.`:'');
        }
      }
      if (tableStates.has(kind)) sortRows(table, kind, tableStates.get(kind));
    }
  }
  function syncCatalog(force = false) {
    const cohort = current?.cohorts.catalog,window=current?.basis==='api_actual_daily'?current.catalogWindow:current?.window, detail = tablesEnabled && current && window ? { enabled: true, start: window.start, end: window.end, eligible: cohort.eligible, total: cohort.total,
      ...(current.basis==='api_actual_daily'?{sourceKind:'legacy_daily_catalog',sourcePublishedAt:current.legacyCatalogPublished}:{}),
      rows: [...cohort.values.values()].map(row => ({ slug: row.slug, value: row.value, rank: row.rank, returns: row.returns })) } : { enabled: false };
    const fingerprint = JSON.stringify(detail); if (!force && fingerprint === lastCatalogKey) return; lastCatalogKey = fingerprint;
    document.dispatchEvent(new CustomEvent('astracashcatalogvolatility', { detail }));
  }
  function badge(card, text, detail) { const label = owned(make('p', text, 'volatility-preview-badge')); label.title = detail; card.append(label); }
  function graphic(item, kind) {
    const root = make('span', undefined, 'market-highlight-graphic'), image = make('img', undefined, 'market-highlight-sprite'); image.alt = ''; image.width = image.height = 42; image.loading = 'lazy';
    const mapped = report.spriteMap?.[item.slug], local = typeof mapped === 'string' && /^assets\/[A-Za-z0-9._-]+\.(?:png|webp|gif|svg)$/.test(mapped), megaphone = /megaphone/.test(item.slug);
    const generic = () => {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 32 32'); svg.setAttribute('width', '42'); svg.setAttribute('height', '42'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'Generic megaphone icon; verified game sprite unavailable'); svg.classList.add('market-highlight-sprite', 'volatility-generic-megaphone');
      const title = document.createElementNS(svg.namespaceURI, 'title'); title.textContent = 'Original generic megaphone symbol, not a verified MapleStory item sprite'; svg.append(title);
      for (const [d, fill] of [['M5 12h7l14-7v21l-14-7H5Z', '#d8bc74'], ['M11 19h6l-2 9h-5Z', '#9b7953'], ['M5 13h6v5H5Z', '#a8d6d2']]) { const path = document.createElementNS(svg.namespaceURI, 'path'); path.setAttribute('d', d); path.setAttribute('fill', fill); path.setAttribute('stroke', '#34443b'); path.setAttribute('stroke-width', '1.5'); svg.append(path); }
      return svg;
    };
    const fallback = megaphone && (!local || /meso-pouch/.test(mapped) || failedMegaphoneSprites.get(item.slug) === mapped);
    if (!fallback) image.src = local ? mapped : `assets/${item.slug}.svg`;
    image.addEventListener('error', () => { if (megaphone) { failedMegaphoneSprites.set(item.slug, mapped); image.replaceWith(generic()); } else if (image.getAttribute('src') === 'assets/meso-pouch.png') image.hidden = true; else image.src = 'assets/meso-pouch.png'; });
    const copy = make('span', undefined, 'market-highlight-copy'), title = make('span', undefined, 'market-highlight-title-line'), value = make('span', undefined, 'market-highlight-value-line');
    title.append(make('strong', current.basis==='api_actual_daily'?kind==='cash'?'Most volatile fixed-NX cash item':'Most volatile goods-basket item':kind === 'cash' ? 'Most volatile cash item' : 'Most volatile goods item', 'market-highlight-kind'), make('span', item.name, 'market-highlight-headline'));
    value.append(make('strong', `${percent(item.value)} daily price volatility`, 'market-highlight-value'));
    const dates = make('small', undefined, 'market-highlight-dates');
    dates.append(document.createTextNode('('), make('strong', `${current.window.start}–${current.window.end}`, 'market-highlight-date'), document.createTextNode(` · ${current.basis==='api_actual_daily'?'API actual daily · ':''}${item.returns} consecutive daily returns · medians, not individual trades${current.basis==='api_actual_daily'?` · original daily receipt range ${capture(item.oldestOriginalReceipt)}–${capture(item.newestOriginalReceipt)}`:''})`));
    copy.append(title, value, dates);
    if (fallback) copy.append(make('small', 'Generic megaphone icon', 'volatility-icon-note'));
    root.append(fallback ? generic() : image, copy); return root;
  }
  function highlight(item, kind, duplicate, panel) {
    const card = owned(make(panel ? 'article' : 'li', undefined, panel ? 'panel highlights-fact volatility-preview-highlight' : 'market-highlight volatility-preview-highlight'));
    card.dataset.highlightType = 'volatility-' + kind;
    const link = make(duplicate ? 'span' : 'a');
    if (!duplicate) { const known = [...(report.rows || []), ...(report.cash || []), ...(report.contextItems || [])].some(row => row.slug === item.slug); link.href = known ? '#item/' + encodeURIComponent(item.slug) : '#cash-catalog'; }
    link.setAttribute('aria-label', `Highest observed daily price volatility in ${current.basis==='api_actual_daily'?kind==='cash'?'the fixed 29 NX-cost API cash cohort':'the fixed 50 API goods basket':kind === 'cash' ? 'the captured cash catalog' : 'the captured goods-basket/context cohort (source-category scope)'}: ${item.name}; ${percent(item.value)}; ${current.window.start}–${current.window.end}; ${item.returns} daily returns.`);
    link.title = 'Sample standard deviation of consecutive qualified daily-median log returns × 100. Minimum five returns; no annualization. Ranking is limited to the captured cohort.';
    link.append(graphic(item, kind)); card.append(link); return card;
  }
  function decorate() {
    observer.disconnect();
    try {
      for (const node of document.querySelectorAll('[data-volatility-owned]')) node.remove();
      toggle.textContent = 'Volatility highlights: ' + (enabled ? 'On' : 'Off'); toggle.setAttribute('aria-pressed', String(enabled));
      categoryToggle.textContent = 'Category member volatility: ' + (categoryEnabled ? 'On' : 'Off'); categoryToggle.setAttribute('aria-pressed', String(categoryEnabled));
      cashToggle.textContent = 'Cash-card volatility: ' + (cashEnabled ? 'On' : 'Off'); cashToggle.setAttribute('aria-pressed', String(cashEnabled));
      tableToggle.textContent = 'Volatility table columns: ' + (tablesEnabled ? 'On' : 'Off'); tableToggle.setAttribute('aria-pressed', String(tablesEnabled));
      scopeNote.textContent=current?.basis==='api_actual_daily'?`API actual daily medians: fixed 50 goods / 29 fixed-NX cash items, complete UTC source days only. Current 3-day reference is separate. Latest overview receipt ${capture(current.dailyCapturedAt)}. Broader cash-catalog volatility remains the separate legacy daily source${current.catalogWindow?` (${current.catalogWindow.start}–${current.catalogWindow.end}; published ${capture(current.legacyCatalogPublished)})`:': unavailable'}. Category labels summarize member volatilities, not category-index volatility.`:'Independent display choices. 7-day window; daily medians, not individual trades. Category labels summarize member volatilities, not category-index volatility.';
      decorateTables(); syncCatalog();
      if (!current) return;
      const dates = `${current.basis==='api_actual_daily'?'API actual daily basis; partial source days excluded. ':''}${current.window.start}–${current.window.end}; up to six within-window returns. Each daily median needs at least five recorded source sales. No missing-day bridge or carry-forward. Sample SD of daily log returns × 100; not annualized.${current.basis==='api_actual_daily'?` Daily receipt ${capture(current.dailyCapturedAt)}; reported sale counts not physical units; no constant stat/quality history is inferred.`:''}`;
      for (const card of categoryEnabled ? document.querySelectorAll('.category-card') : []) {
        const name = card.querySelector('[data-category]')?.dataset.category, category = current.categories.find(row => row.name === name); if (!category) continue;
        badge(card, `7-day median member volatility: ${percent(category.value)} · ${category.eligible}/${category.total} items`, `${dates} Unweighted median of sufficiently sampled member volatilities; this is not the category index's volatility.`);
      }
      for (const card of cashEnabled ? document.querySelectorAll('.cash-highlight-card[data-cash-highlight-slug]') : []) {
        const item = current.bySlug.get(card.dataset.cashHighlightSlug);
        badge(card, `7-day daily price volatility: ${percent(item?.value)}${item ? ' · ' + item.returns + '/6 returns' : ''}`, `${dates} This fixed daily window is independent of the cash table's rolling/lookback selection. Fewer than five returns is unavailable, not zero.`);
      }
      for (const [kind, item] of enabled ? [['cash', current.cashWinner], ['goods', current.goodsWinner]] : []) {
        if (!item) continue;
        for (const list of document.querySelectorAll('#market-highlights-track .market-highlights-list')) list.append(highlight(item, kind, list.getAttribute('aria-hidden') === 'true', false));
        document.getElementById('highlights-fact-grid')?.append(highlight(item, kind, false, true));
      }
    } finally { watch(); }
  }
  const calculate = () => { current = report && (enabled || categoryEnabled || cashEnabled || tablesEnabled) ? model(report) : null; decorate(); };
  toggle.addEventListener('click', () => { enabled = !enabled; try { localStorage.setItem(key, enabled ? 'on' : 'off'); } catch {} calculate(); });
  categoryToggle.addEventListener('click', () => { categoryEnabled = !categoryEnabled; try { localStorage.setItem(categoryKey, categoryEnabled ? 'on' : 'off'); } catch {} calculate(); });
  cashToggle.addEventListener('click', () => { cashEnabled = !cashEnabled; try { localStorage.setItem(cashKey, cashEnabled ? 'on' : 'off'); } catch {} calculate(); });
  tableToggle.addEventListener('click', () => { tablesEnabled = !tablesEnabled; try { localStorage.setItem(tableKey, tablesEnabled ? 'on' : 'off'); } catch {} calculate(); if (!tablesEnabled) tableStates.clear(); });
  document.addEventListener('click', event => {
    const button = event.target.closest?.('[data-volatility-sort]'); if (!button) return; const table = button.closest('table'), kind = table?.dataset.volatilityTable; if (!current || !['goods', 'nx'].includes(kind)) return;
    const old = tableStates.get(kind), key = button.dataset.volatilitySort; tableStates.set(kind, { key, ascending: old?.key === key ? !old.ascending : key === 'rank' }); decorate();
  });
  document.addEventListener('click', event => { if(event.target.closest?.('button[data-cash-best-value],button[data-cash-side]'))tableStates.delete('nx');const header = event.target.closest?.('th'); if (!header || !event.target.closest('button') || event.target.closest('[data-volatility-sort]')) return; const kind = header.closest('table')?.dataset.volatilityTable; if (kind) tableStates.delete(kind); }, true);
  document.addEventListener('astracashcatalogcolumnsready', () => syncCatalog(true));
  document.addEventListener('astramarketsnapshot', event => { if (event.detail && typeof event.detail === 'object') { report = event.detail; calculate(); } });
  document.addEventListener('change',event=>{if(event.target?.id==='display-timezone')calculate();});
  decorate(); document.dispatchEvent(new Event('astramarkethighlightsready'));
})();

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "volatility-preview.js", status: "initialization_failed"}})); } catch {}
}

;
/* Astra source: fm-backdrop-preview.js */
try {
(() => {
  'use strict';
  const options = document.getElementById('display-options');
  if (!options || document.getElementById('fm-backdrop-options')) return;
  const key = 'astra-fm-backdrop-v1';
  const modes = new Map([['original', 'Original'], ['wide', 'Wide scene'], ['soft', 'Soft gradient'], ['glow', 'Stronger glow'], ['daylight', 'Sunlit market'], ['portal-night', 'Portal blue'], ['golden-hour', 'Golden hour'], ['forest-room', 'Mushroom room · FM 1'], ['stone-room', 'Stone room · FM 7']]);
  let storageAvailable = true, selected = 'original';
  try { const saved = localStorage.getItem(key); if (modes.has(saved)) selected = saved; } catch { storageAvailable = false; }
  const group = document.createElement('fieldset'); group.id = 'fm-backdrop-options'; group.className = 'fm-backdrop-options'; group.dataset.previewControls = 'fm-backdrop';
  const legend = document.createElement('legend'); legend.textContent = 'Scenery · Free Market backdrop';
  const buttons = document.createElement('div'); buttons.className = 'fm-backdrop-buttons'; buttons.setAttribute('role', 'group'); buttons.setAttribute('aria-label', 'Free Market backdrop coverage and gradient');
  const note = document.createElement('p'); note.className = 'fm-backdrop-note'; note.id = 'fm-backdrop-note'; group.setAttribute('aria-describedby', note.id);
  function context() {
    const isFM = ['classic', 'banner'].includes(document.body.dataset.sceneryMode);
    const applies = document.body.classList.contains('scenery-on') && isFM;
    group.dataset.applies = String(applies);
    const source = selected === 'forest-room' ? 'Original MCW Free Market <1> room, map 80002001.' : selected === 'stone-room' ? 'Original MCW Free Market <7> room, map 80002007.' : 'The original 2311 × 1137 entrance map is reused.';
    const text = applies ? 'Applies to the Free Market page backdrop. ' + source + ' The banner is unchanged.'
      : 'Choose Current pairing or Different banner with Scenery on to see this backdrop choice. Other scenery and banner artwork are unchanged.';
    const value = text + (storageAvailable ? ' Saved in this browser only.' : ' Storage is blocked; this choice still works in this tab.');
    if (note.textContent !== value) note.textContent = value;
  }
  function apply(mode) {
    selected = modes.has(mode) ? mode : 'original';
    if (selected === 'original') delete document.body.dataset.fmBackdrop;
    else if (document.body.dataset.fmBackdrop !== selected) document.body.dataset.fmBackdrop = selected;
    for (const button of buttons.children) button.setAttribute('aria-pressed', String(button.dataset.fmBackdropChoice === selected));
    context();
  }
  for (const [mode, label] of modes) {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.fmBackdropChoice = mode; button.textContent = label;
    button.addEventListener('click', () => {
      try { localStorage.setItem(key, mode); } catch { storageAvailable = false; }
      apply(mode);
    });
    buttons.append(button);
  }
  group.append(legend, buttons, note); options.append(group); apply(selected);
  const observer = new MutationObserver(context); observer.observe(document.body, { attributes: true, attributeFilter: ['class', 'data-scenery-mode'] });
  window.addEventListener('storage', event => { if (event.key === key && event.storageArea !== null) apply(event.newValue); });
})();

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "fm-backdrop-preview.js", status: "initialization_failed"}})); } catch {}
}

;
/* Astra source: category-reference-preview.js */
try {
(() => {
  'use strict';
  const section=document.getElementById('category-section'),cards=document.getElementById('category-cards');
  if(!section||!cards||document.getElementById('category-reference-preview'))return;
  const make=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
  const validDay=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
  const shift=(date,n)=>new Date(Date.parse(date+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
  const positive=v=>Number.isFinite(v)&&v>0;
  const fmt=(v,d=1)=>Number.isFinite(v)?v.toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}):'Unavailable';
  const pct=v=>Number.isFinite(v)?(v>=0?'+':'')+fmt(v)+'%':'Unavailable';
  const key='astra-category-reference-v1',modes=new Set(['frozen','previous7','previous3','previous-day']);let mode='frozen',report=null;
  try{const saved=localStorage.getItem(key);if(modes.has(saved))mode=saved;}catch{}
  const controls=make('div','category-reference-preview');controls.id='category-reference-preview';controls.dataset.previewControls='true';
  const label=make('label','','Compare category prices with'),select=make('select');select.id='category-reference-select';select.setAttribute('aria-describedby','category-reference-editor-note category-reference-status');
  for(const [value,text]of [['frozen','Official frozen reference week'],['previous7','Previous 7-day average · preview'],['previous3','Previous 3-day average · preview'],['previous-day','Prior complete source day · preview']]){const o=make('option','',text);o.value=value;select.append(o);}label.append(select);controls.append(label);cards.before(controls);
  const status=make('p','category-reference-status');status.id='category-reference-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');controls.after(status);
  const editorNote=make('small','category-reference-editor-note','This selector changes the category display only; the headline, membership, base prices and weights stay fixed.');editorNote.id='category-reference-editor-note';controls.append(editorNote);
  const legend=section.querySelector('.category-gauge-legend'),legendHidden=legend?.hidden||false;
  function qualified(row,sourceDay){
    const byDay=new Map();for(const p of Array.isArray(row.history)?row.history:[]){if(!Array.isArray(p)||!validDay(p[0])||p[0]>sourceDay||!positive(p[1])||!Number.isInteger(p[2])||p[2]<5)continue;const old=byDay.get(p[0]);if(old){byDay.set(p[0],null);}else if(!byDay.has(p[0]))byDay.set(p[0],p.slice(0,3));}
    if([...byDay.values()].some(p=>p===null))return [];
    return [...byDay.values()].sort((a,b)=>a[0].localeCompare(b[0]));
  }
  const capture=value=>{if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))return 'unknown';const zone=document.getElementById('display-timezone')?.value||'UTC';try{return new Date(value).toLocaleString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false,timeZone:zone})+' '+zone+' '+new Date(value).toLocaleDateString('en-US',{year:'numeric',timeZone:zone});}catch{return value;}};
  function apiModel(data){
    const view=data?.apiCalculationView,publisher=view?.clocks?.dailyPublisher,sourceDay=typeof publisher==='string'?publisher.slice(0,10):null,currentDay=view?.daily?.latestDay;
    if(!validDay(sourceDay)||!/(?:Z|[+-]\d\d:\d\d)$/.test(publisher)||!Number.isFinite(Date.parse(publisher))||!validDay(currentDay)||currentDay>sourceDay||!Array.isArray(data.apiDailyItems)||data.apiDailyItems.length!==79||data.apiDailyItems.filter(r=>r?.role==='goods').length!==50||data.apiDailyItems.filter(r=>r?.role==='cash').length!==29||!Array.isArray(data.rows)||data.rows.length!==50||!Array.isArray(data.categories))return null;
    const bySlug=new Map(),ids=new Set();for(const item of data.apiDailyItems){if(!item||!['goods','cash'].includes(item.role)||typeof item.slug!=='string'||!Number.isSafeInteger(item.itemId)||ids.has(item.itemId)||bySlug.has(item.slug)||!Array.isArray(item.points))return null;ids.add(item.itemId);bySlug.set(item.slug,item);}
    const referenceDays=mode==='previous7'?7:mode==='previous3'?3:1,end=shift(currentDay,-1),start=shift(currentDay,-referenceDays);
    const categories=data.categories.map(cat=>{
      const members=data.rows.filter(r=>r.category===cat.name),weight=members.reduce((s,r)=>s+r.weight,0);let currentLevel=0,referenceLevel=0,currentWeight=0,referenceWeight=0,currentPartial=false,referenceObservations=0;const currentDates=[],referenceDates=[],originalCurrentReceipts=[],originalReferenceReceipts=[];
      for(const row of members){if(!positive(row.weight)||!positive(row.basePrice))continue;const item=bySlug.get(row.slug),points=new Map();let conflict=false;
        if(item?.role==='goods')for(const p of item.points){if(!p||!validDay(p.day)||p.day>sourceDay)continue;if(points.has(p.day)){conflict=true;break;}points.set(p.day,p);}
        if(conflict)continue;
        const usable=p=>p?.qualified===true&&positive(p.linkedPrice)&&Number.isSafeInteger(p.recordedSalesCount)&&p.recordedSalesCount>=5&&typeof p.partialCalendarDay==='boolean';
        const current=points.get(currentDay);currentPartial ||= current?.partialCalendarDay===true;if(usable(current)){currentWeight+=row.weight;currentLevel+=row.weight*current.linkedPrice/row.basePrice;currentDates.push(currentDay);if(typeof current.source?.capturedAt==='string')originalCurrentReceipts.push(current.source.capturedAt);}
        const refs=Array.from({length:referenceDays},(_,i)=>points.get(shift(start,i)));if(refs.every(p=>usable(p)&&p.partialCalendarDay===false)){
          let q=0,price=0,valid=true;for(const p of refs){const next=q+p.recordedSalesCount;if(!Number.isSafeInteger(next)){valid=false;break;}price+=(p.linkedPrice-price)*p.recordedSalesCount/next;q=next;}
          if(valid&&positive(price)){referenceWeight+=row.weight;referenceLevel+=row.weight*price/row.basePrice;referenceDates.push(...refs.map(p=>p.day));originalReferenceReceipts.push(...refs.map(p=>p.source?.capturedAt).filter(p=>typeof p==='string'));referenceObservations+=refs.length;}
        }
      }
      const valid=members.length>0&&members.length===cat.count&&Math.abs(weight-cat.weight)<1e-8&&Math.abs(currentWeight-weight)<1e-8&&Math.abs(referenceWeight-weight)<1e-8&&positive(referenceLevel);
      return {name:cat.name,index:valid?100*currentLevel/referenceLevel:null,count:members.length,weight,currentCoverage:weight?currentWeight/weight:0,referenceCoverage:weight?referenceWeight/weight:0,currentObservedCoverage:weight?currentWeight/weight:0,referenceCarriedCoverage:0,currentDates:currentDates.sort(),referenceDates:referenceDates.sort(),referenceObservations,currentPartial,originalCurrentReceipts:originalCurrentReceipts.sort((a,b)=>Date.parse(a)-Date.parse(b)),originalReferenceReceipts:originalReferenceReceipts.sort((a,b)=>Date.parse(a)-Date.parse(b))};
    });
    return {basis:'api_actual_daily',sourceDay,currentDay,start,end,referenceDays,categories,dailyCapture:view.clocks.dailyCapture,publisher};
  }
  function model(data){
    if(data?.apiCalculationView)return apiModel(data);
    const sourceDay=typeof data?.sourceUpdatedAt==='string'?data.sourceUpdatedAt.slice(0,10):null;
    if(!validDay(sourceDay)||!/(?:Z|[+-]\d\d:\d\d)$/.test(data.sourceUpdatedAt)||!Number.isFinite(Date.parse(data.sourceUpdatedAt))||!Array.isArray(data.rows)||!Array.isArray(data.categories))return null;
    const rows=data.rows;if(new Set(rows.map(r=>r?.slug)).size!==rows.length||rows.some(r=>!r||typeof r.slug!=='string'||!positive(r.weight)||!positive(r.basePrice)))return null;
    const referenceDays=mode==='previous7'?7:mode==='previous3'?3:1,end=shift(sourceDay,-1),start=shift(sourceDay,-referenceDays);
    const categories=data.categories.map(cat=>{
      const members=rows.filter(r=>r.category===cat.name),weight=members.reduce((s,r)=>s+r.weight,0);let currentLevel=0,referenceLevel=0,currentWeight=0,referenceWeight=0,currentObservedWeight=0,referenceCarriedWeight=0,currentDates=[],referenceDates=[],referenceObservations=0;
      for(const row of members){const h=qualified(row,sourceDay),current=h.at(-1);if(current){currentWeight+=row.weight;currentLevel+=row.weight*current[1]/row.basePrice;currentDates.push(current[0]);if(current[0]===sourceDay)currentObservedWeight+=row.weight;}
        const points=mode!=='previous-day'?h.filter(p=>p[0]>=start&&p[0]<=end):h.filter(p=>p[0]<=end).slice(-1);
        if(points.length){const q=points.reduce((s,p)=>s+p[2],0),price=points.reduce((s,p)=>s+p[1]*p[2],0)/q;referenceWeight+=row.weight;referenceLevel+=row.weight*price/row.basePrice;referenceDates.push(...points.map(p=>p[0]));referenceObservations+=points.length;if(mode==='previous-day'&&points[0][0]<end)referenceCarriedWeight+=row.weight;}
      }
      const valid=members.length>0&&members.length===cat.count&&Math.abs(weight-cat.weight)<1e-8&&Math.abs(currentWeight-weight)<1e-8&&Math.abs(referenceWeight-weight)<1e-8&&positive(referenceLevel);
      return {name:cat.name,index:valid?100*currentLevel/referenceLevel:null,count:members.length,weight,currentCoverage:weight?currentWeight/weight:0,referenceCoverage:weight?referenceWeight/weight:0,currentObservedCoverage:weight?currentObservedWeight/weight:0,referenceCarriedCoverage:weight?referenceCarriedWeight/weight:0,currentDates:currentDates.sort(),referenceDates:referenceDates.sort(),referenceObservations};
    });
    return{sourceDay,start,end,categories,referenceDays};
  }
  function apply(){
    select.value=mode;section.dataset.categoryReference=mode;status.hidden=false;
    if(report&&typeof renderCategoryCards==='function')renderCategoryCards();
    section.querySelectorAll('.category-reference-note').forEach(n=>n.remove());
    if(legend)legend.hidden=mode==='frozen'?legendHidden:true;
    if(mode==='frozen'){status.textContent=report?'':'Waiting for the published snapshot. The official frozen reference is the default.';status.hidden=!!report;return;}
    const comparison=model(report);
    if(!comparison){status.textContent='Comparison unavailable: a valid dated fixed-basket snapshot is required. No estimate is filled.';cards.querySelectorAll('.category-main').forEach(button=>{button.querySelector('.category-gauge')?.remove();const n=button.querySelector('.category-number');if(n)n.textContent='Unavailable';button.querySelector('.category-change')?.remove();button.querySelector('.category-value-label')?.remove();});return;}
    const max=typeof categoryScale==='function'?categoryScale(comparison.categories.map(c=>c.index)):Math.max(200,...comparison.categories.map(c=>c.index||0));
    const percentOnly=section.dataset.categoryValue==='percent';
    for(const button of cards.querySelectorAll('.category-main')){const cat=comparison.categories.find(c=>c.name===button.dataset.category);if(!cat)continue;
      const oldGauge=button.querySelector('.category-gauge'),gauge=Number.isFinite(cat.index)&&typeof categoryGauge==='function'?categoryGauge(cat.index,max):'';if(oldGauge){if(gauge){const holder=make('div');holder.innerHTML=gauge;const next=holder.firstElementChild;next.setAttribute('aria-label',`Display comparison ${fmt(cat.index)}; selected source-calendar reference = 100; not the official MPI baseline`);oldGauge.replaceWith(next);}else oldGauge.remove();}
      const number=button.querySelector('.category-number');if(number)number.textContent=Number.isFinite(cat.index)?percentOnly?pct(cat.index-100):fmt(cat.index):'Unavailable';
      button.querySelector('.category-change')?.remove();button.querySelector('.category-value-label')?.remove();
      const change=make('span',percentOnly?'category-value-label':'category-change '+(cat.index>=100?'up':'down'),Number.isFinite(cat.index)?percentOnly?'vs. selected comparison':pct(cat.index-100):'No complete comparable mix');button.append(change);
      const note=make('small','category-reference-note',comparison.basis==='api_actual_daily'?`API actual daily basis · current/reference priced weight ${fmt(cat.currentCoverage*100)}% / ${fmt(cat.referenceCoverage*100)}%. ${cat.currentPartial?'Partial API source day. ':''}All fixed members and every reference day required; no carry or renormalization. ${cat.referenceObservations} qualified item-day observations. Count-weighted daily-median reference; reported sale counts are not verified physical units. Separate from the NX model’s arithmetic mean MPI anchor.`:`Current/reference priced weight: ${fmt(cat.currentCoverage*100)}% / ${fmt(cat.referenceCoverage*100)}%. Current-day observed weight ${fmt(cat.currentObservedCoverage*100)}%; remaining priced weight is carried.${mode==='previous-day'?` Reference carried weight ${fmt(cat.referenceCarriedCoverage*100)}%.`:` ${cat.referenceObservations} qualified item-day observations in the ${comparison.referenceDays}-day window.`}`);
      note.title=`Current qualified dates: ${cat.currentDates[0]||'none'}–${cat.currentDates.at(-1)||'none'}. Reference qualified dates: ${cat.referenceDates[0]||'none'}–${cat.referenceDates.at(-1)||'none'}. Daily medians with recorded count ≥5 only.${comparison.basis==='api_actual_daily'?` Original current receipt range ${capture(cat.originalCurrentReceipts[0])}–${capture(cat.originalCurrentReceipts.at(-1))}; reference receipts ${capture(cat.originalReferenceReceipts[0])}–${capture(cat.originalReferenceReceipts.at(-1))}; individual sale times unknown.`:''}`;button.closest('.category-card').append(note);
    }
    status.textContent=comparison.basis==='api_actual_daily'?`API actual daily display comparison: ${comparison.referenceDays===1?'prior complete source day':`previous ${comparison.referenceDays}-day average`} (${comparison.start}–${comparison.end}, UTC source dates) versus ${comparison.currentDay}${comparison.categories.some(c=>c.currentPartial)?' · partial API source day':''}. Count-weighted daily-median reference, not a point-to-point return or the NX benchmark’s arithmetic mean linked-MPI anchor. Latest overview receipt ${capture(comparison.dailyCapture)}; source publication ${capture(comparison.publisher)}. No verified 24-hour scan coverage or constant item quality is inferred. The current 3-day reference, headline, fixed membership and weights stay unchanged; missing/thin members or reference days make the category unavailable.`:`Display comparison only: ${mode==='previous-day'?'prior complete source-calendar day':`previous ${comparison.referenceDays}-day average of observed daily medians`} (${comparison.start}–${comparison.end}); current qualified prices through source day ${comparison.sourceDay} (partial). Source publication ${report.sourceUpdatedAt}; no intraday price timing is inferred. 100 = the selected comparison level, not a new official MPI baseline. Original membership, fixed weights and base prices are preserved. Missing member prices make that category unavailable; partial mixes are never renormalized.`;
  }
  select.addEventListener('change',()=>{mode=modes.has(select.value)?select.value:'frozen';try{localStorage.setItem(key,mode);}catch{}apply();});
  document.addEventListener('astramarketsnapshot',ev=>{report=ev.detail;apply();});
  section.addEventListener('click',ev=>{if(ev.target.closest('[data-category-value]'))queueMicrotask(apply);});
  document.addEventListener('change',ev=>{if(ev.target?.id==='display-timezone')queueMicrotask(apply);});
  apply();document.dispatchEvent(new Event('astramarkethighlightsready'));
})();

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "category-reference-preview.js", status: "initialization_failed"}})); } catch {}
}

;
/* Astra source: short-window-preview.js */
try {
(() => {
  'use strict';
  if (window.AstraShortWindow) return;
  const validDay = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
  const shift = (day, offset) => new Date(Date.parse(day + 'T00:00:00Z') + offset * 86400000).toISOString().slice(0, 10);
  function sourceDay(value) { return typeof value === 'string' && Number.isFinite(Date.parse(value)) && validDay(value.slice(0, 10)) ? value.slice(0, 10) : null; }
  function calculate(row, publication) {
    const source = sourceDay(publication);
    if (!source) return null;
    const endDay = shift(source, -1), observations = new Map(), conflicts = new Set();
    for (const point of Array.isArray(row?.history) ? row.history : []) {
      if (!Array.isArray(point) || !validDay(point[0])) continue;
      const prior = observations.get(point[0]);
      if (prior && (prior[1] !== point[1] || prior[2] !== point[2])) conflicts.add(point[0]);
      else observations.set(point[0], point);
    }
    const endpoint = day => {
      const point = observations.get(day);
      return point && !conflicts.has(day) && Number.isFinite(point[1]) && point[1] > 0 && Number.isSafeInteger(point[2]) && point[2] >= 5 ? { day, price: point[1], quantity: point[2] } : null;
    };
    return { sourceDay: source, endDay, publication, comparisons: [1, 3, 7].map(days => {
      const startDay = shift(endDay, -days), start = endpoint(startDay), end = endpoint(endDay), percent = start && end ? (end.price / start.price - 1) * 100 : null;
      return { days, startDay, endDay, start, end, percent: Number.isFinite(percent) ? percent : null,
        reason: !start || !end ? 'Exact qualified endpoint unavailable' : !Number.isFinite(percent) ? 'Finite comparison unavailable' : null };
    }) };
  }
  function calculateApi(row, view) {
    const publication=view?.clocks?.dailyPublisher, source=sourceDay(publication);
    if(!source||!/(?:Z|[+-]\d\d:\d\d)$/.test(publication)||!row||!['goods','cash'].includes(row.role)||!Array.isArray(row.points)||row.points.length>31)return null;
    const days=row.points.map(p=>p?.day);if(new Set(days).size!==days.length)return null;
    const history=row.points.filter(p=>p&&p.qualified===true&&p.partialCalendarDay===false&&validDay(p.day)&&Number.isSafeInteger(p.recordedSalesCount)&&p.recordedSalesCount>=5&&(row.role==='goods'?Number.isFinite(p.linkedPrice)&&p.linkedPrice>0:typeof p.medianUnitPriceLexeme==='string'&&/^\d+(?:\.\d+)?$/.test(p.medianUnitPriceLexeme))).map(p=>[p.day,row.role==='goods'?p.linkedPrice:Number(p.medianUnitPriceLexeme),p.recordedSalesCount]);
    const model=calculate({history},publication);if(model)for(const comparison of model.comparisons)for(const side of ['start','end'])if(comparison[side])comparison[side].sourceCapturedAt=row.points.find(p=>p.day===comparison[side].day)?.source?.capturedAt??null;
    return model?{...model,basis:'api_actual_daily',dailyCapturedAt:view.clocks.dailyCapture,scope:row.role==='goods'?'fixed 50 goods':'fixed 29 NX-cost cash items'}:null;
  }
  const zone=()=>document.getElementById('display-timezone')?.value||'UTC';
  const capture=value=>{if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))return 'unknown';try{return new Date(value).toLocaleString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false,timeZone:zone()})+' '+zone()+' '+new Date(value).toLocaleDateString('en-US',{year:'numeric',timeZone:zone()});}catch{return value;}};
  window.AstraShortWindow = Object.freeze({ calculate, calculateApi });
  const options = document.getElementById('display-options'), view = document.getElementById('view-index');
  if (!options || !view || document.getElementById('short-window-options')) return;
  const make = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
  const key = 'astra-short-window-preview-v1', pairKey='astra-short-window-pair-v1'; let enabled = false, pair='3_1', report = null, pending = false, storageAvailable = true, models = { goods: new Map(), cash: new Map() };
  try { enabled = localStorage.getItem(key) === 'on'; if(localStorage.getItem(pairKey)==='7_3')pair='7_3'; } catch { storageAvailable = false; }
  const group = make('div', 'short-window-options'); group.id = 'short-window-options'; group.dataset.previewControls = 'short-window'; group.setAttribute('role', 'group'); group.setAttribute('aria-label', 'Complete-day item price comparisons');
  const label = make('span', '', 'Item price curiosity'), toggle = make('button'), note = make('small', 'short-window-options-note'); toggle.type = 'button'; toggle.setAttribute('aria-controls', 'view-index'); group.append(label, toggle, note); options.append(group);
  for(const [value,text] of [['7_3','7-day + 3-day'],['3_1','3-day + 1-day']]){const button=make('button','',text);button.type='button';button.dataset.shortWindowPair=value;button.setAttribute('aria-controls','view-index');button.addEventListener('click',()=>{pair=value;enabled=true;try{localStorage.setItem(pairKey,pair);localStorage.setItem(key,'on');}catch{storageAvailable=false;}draw();});group.insertBefore(button,note);}
  const signed = value => { const rounded = Math.abs(value) < .05 ? 0 : value; return (rounded > 0 ? '+' : '') + rounded.toLocaleString('en-US', { maximumFractionDigits: 1 }) + '%'; };
  const signatures = new WeakMap();
  function badge(model) {
    const host = make('span', 'short-window-badge'); host.setAttribute('role', 'note');
    host.append(make('span', 'short-window-label', report?.apiCalculationView?'API actual daily-median changes':'Separate daily-median changes'));
    if (!model) { host.append(make('span', 'short-window-unavailable', report?.apiCalculationView?'Unavailable · actual API daily endpoints absent or invalid':'Unavailable · source-calendar clock unknown')); return host; }
    host.append(make('span', 'short-window-period', `Complete through ${model.endDay}; current source day excluded`));
    for (const days of pair==='7_3'?[7,3]:[3,1]) {
      const point=model.comparisons.find(point=>point.days===days);
      const line = make('span', 'short-window-return'); line.dataset.shortWindowDays = String(point.days);
      const name = point.days === 1 ? '1 source day (24h*)' : point.days+' source days';
      const value = make('strong', point.percent === null ? 'short-window-unavailable' : point.percent > 0 ? 'short-window-up' : point.percent < 0 ? 'short-window-down' : 'short-window-flat', point.percent === null ? 'Unavailable' : signed(point.percent));
      line.append(make('span', '', name + ': '), value, make('small', '', `${point.startDay} → ${point.endDay} · ${point.percent === null ? 'needs both actual daily medians, each q ≥ 5; no carried substitute' : `recorded endpoint counts ${point.start.quantity} / ${point.end.quantity}; each q ≥ 5${model.basis==='api_actual_daily'?`; original daily receipts ${capture(point.start.sourceCapturedAt)} / ${capture(point.end.sourceCapturedAt)}`:''}`}`)); host.append(line);
    }
    host.append(make('span', 'short-window-caveat', model.basis==='api_actual_daily'?`* UTC source-calendar endpoints, not the current 3-day price reference or rolling 24h. ${model.scope}; mixed item quality, reported sale counts not units. Latest overview receipt ${capture(model.dailyCapturedAt)}; individual sale times unknown.`:'* Calendar-day comparison, not rolling 24h or intraday. Counts are source-inferred.'));
    return host;
  }
  function draw() {
    pending = false;
    toggle.textContent = enabled ? 'Extra comparisons: On' : 'Extra comparisons: Off'; toggle.setAttribute('aria-pressed', String(enabled));
    for(const button of group.querySelectorAll('[data-short-window-pair]'))button.setAttribute('aria-pressed',String(enabled&&button.dataset.shortWindowPair===pair));
    view.dataset.shortWindowPreview=enabled?pair:'off';
    note.textContent = 'Optional extra lines on Overview goods and cash cards. Exact complete-day endpoints only; existing 7-day activity, weights, indices and NX estimates stay unchanged.' + (storageAvailable ? ' Saved in this browser.' : ' Storage is blocked; this choice works in this tab.');
    for (const card of view.querySelectorAll('#overview-basket button[data-item], #cash-item-highlights [data-cash-highlight-slug]')) {
      const existing = [...card.children].find(child => child.classList.contains('short-window-badge'));
      if (!enabled) { if (existing) existing.remove(); signatures.delete(card); continue; }
      const isCash = card.hasAttribute('data-cash-highlight-slug'), slug = isCash ? card.dataset.cashHighlightSlug : card.dataset.item, model = (isCash ? models.cash : models.goods).get(slug) || null;
      const signature = pair+zone()+JSON.stringify(model);
      if (existing && signatures.get(card) === signature) continue;
      const next = badge(model); if (existing) existing.replaceWith(next); else card.append(next); signatures.set(card, signature);
    }
  }
  function schedule() { if (!pending) { pending = true; Promise.resolve().then(draw); } }
  function receive(data) {
    report = data;
    models = { goods: new Map(), cash: new Map() };
    if(report?.apiCalculationView){
      const rows=Array.isArray(report.apiDailyItems)?report.apiDailyItems:[],seen=new Set(),duplicates=new Set();
      if(rows.length!==79||rows.filter(r=>r?.role==='goods').length!==50||rows.filter(r=>r?.role==='cash').length!==29||new Set(rows.map(r=>r?.itemId)).size!==79||rows.some(r=>!Number.isSafeInteger(r?.itemId)||r.itemId<1||typeof r.slug!=='string'||!/^[a-z0-9][a-z0-9-]*$/.test(r.slug))){draw();return;}
      for(const row of rows){if(!row||typeof row.slug!=='string'||!['goods','cash'].includes(row.role))continue;if(seen.has(row.slug))duplicates.add(row.slug);seen.add(row.slug);(row.role==='goods'?models.goods:models.cash).set(row.slug,calculateApi(row,report.apiCalculationView));}
      for(const slug of duplicates){models.goods.delete(slug);models.cash.delete(slug);}draw();return;
    }
    for (const row of Array.isArray(report?.rows) ? report.rows : []) if (row && typeof row.slug === 'string') models.goods.set(row.slug, calculate(row, report.sourceUpdatedAt));
    const catalog = report?.cashCatalog, hasCatalog = catalog?.schemaVersion === 1 && catalog.kind === 'cash_shop_source_catalog' && Array.isArray(catalog.rows);
    for (const row of hasCatalog ? catalog.rows : Array.isArray(report?.cash) ? report.cash : []) if (row && typeof row.slug === 'string') models.cash.set(row.slug, calculate(row, hasCatalog ? catalog.sourceUpdatedAt : report.sourceUpdatedAt));
    draw();
  }
  toggle.addEventListener('click', () => { enabled = !enabled; try { localStorage.setItem(key, enabled ? 'on' : 'off'); } catch { storageAvailable = false; } draw(); });
  const observer = new MutationObserver(schedule); observer.observe(view, { childList: true, subtree: true });
  document.addEventListener('astramarketsnapshot', event => receive(event.detail));
  document.addEventListener('change',event=>{if(event.target?.id==='display-timezone')schedule();});
  draw(); document.dispatchEvent(new Event('astramarkethighlightsready'));
})();

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "short-window-preview.js", status: "initialization_failed"}})); } catch {}
}

;
/* Astra source: ellinia-backdrop-preview.js */
try {
(() => {
  'use strict';
  const host = document.getElementById('scenery-options');
  if (!host || document.getElementById('ellinia-backdrop-options')) return;
  const key = 'astra-ellinia-backdrop-v1';
  const choices = [['current', 'Current map'], ['bright', 'Brighter map'], ['soft', 'Softer map'], ['framed', 'Framed original']];
  let selected = 'current';
  try { const saved = localStorage.getItem(key); if (choices.some(([value]) => value === saved)) selected = saved; } catch { /* Current map remains the default. */ }
  const group = document.createElement('fieldset'); group.id = 'ellinia-backdrop-options'; group.className = 'ellinia-backdrop-options'; group.dataset.previewControls = 'true';
  const legend = document.createElement('legend'); legend.textContent = 'Ellinia backdrop'; group.append(legend);
  const buttons = document.createElement('div'); buttons.className = 'ellinia-backdrop-buttons'; group.append(buttons);
  const note = document.createElement('small'); note.id = 'ellinia-backdrop-note'; note.textContent = 'Applies to Different backdrop only. Original Maple artwork; the banner and other scenery stay the same.'; group.setAttribute('aria-describedby', note.id);
  const apply = () => {
    document.body.dataset.elliniaBackdrop = selected;
    for (const button of buttons.children) button.setAttribute('aria-pressed', String(button.dataset.elliniaBackdropChoice === selected));
  };
  for (const [value, label] of choices) {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.elliniaBackdropChoice = value; button.textContent = label;
    button.addEventListener('click', () => { selected = value; apply(); try { localStorage.setItem(key, value); } catch { /* The choice still works in this tab. */ } }); buttons.append(button);
  }
  group.append(note); host.append(group); apply();
})();

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "ellinia-backdrop-preview.js", status: "initialization_failed"}})); } catch {}
}

;
/* Astra source: viewer-preview.js */
try {
(() => {
  'use strict';
  const options = document.getElementById('display-options');
  if (!options || document.getElementById('viewer-preview-enter')) return;
  const footer=document.querySelector('footer'),passwordMode=footer?.dataset.footerPrivacyLock==='on';
  let controlsUnlocked=!passwordMode;
  let workspaceExpiresAt=null,workspaceMode='unknown';
  const workspaceCurrent=()=>{const verified=Number.isSafeInteger(workspaceExpiresAt)&&workspaceExpiresAt>Date.now();return Object.freeze({mode:verified?'private_workspace':workspaceMode==='review'?'review':'unknown',verified,expiresAt:verified?workspaceExpiresAt:null});};
  Object.defineProperty(window,'AstraPrivateWorkspace',{value:Object.freeze({current:workspaceCurrent}),writable:false,configurable:false});
  const publishWorkspace=()=>{const state=workspaceCurrent();if(state.verified)document.body.dataset.privateWorkspace='verified';else delete document.body.dataset.privateWorkspace;document.dispatchEvent(new CustomEvent('astraprivateworkspace',{detail:state}));};

  const entry = document.createElement('div'); entry.className = 'viewer-preview-entry';
  const enter = document.createElement('button'); enter.type = 'button'; enter.id = 'viewer-preview-enter';
  enter.textContent = 'Viewer preview'; enter.setAttribute('aria-controls', 'display-options');
  enter.setAttribute('aria-describedby', 'viewer-preview-description');
  const description = document.createElement('small'); description.id = 'viewer-preview-description';
  description.textContent = 'Hide design controls while keeping the currently selected design.';
  entry.append(enter, description); options.before(entry);

  const exit = document.createElement('button'); exit.type = 'button'; exit.id = 'viewer-preview-exit';
  exit.className = 'viewer-preview-exit'; exit.textContent = 'Exit viewer preview · Esc'; exit.hidden = true;
  exit.title = 'Return to editing. Design choices and privacy settings stay unchanged.';
  document.body.append(exit);
  let viewing = false, previousFocus = null;
  const previewControlsCurrent=()=>Object.freeze({unlocked:controlsUnlocked===true,viewing:viewing===true});
  Object.defineProperty(window,'AstraPreviewControls',{value:Object.freeze({current:previewControlsCurrent}),writable:false,configurable:false});
  const publishPreviewControls=()=>document.dispatchEvent(new CustomEvent('astrapreviewcontrols'));

  function setViewer(enabled,focus=true) {
    if(!enabled&&!controlsUnlocked)return;
    if (enabled === viewing) return;
    viewing = enabled;
    publishPreviewControls();
    if (enabled) {
      previousFocus = document.activeElement && document.activeElement !== document.body ? document.activeElement : enter;
      document.body.dataset.viewerPreview = 'on'; entry.hidden = true; exit.hidden = false;
      if(focus)exit.focus({ preventScroll: true });
    } else {
      delete document.body.dataset.viewerPreview; entry.hidden = false; exit.hidden = true;
      const target = previousFocus?.isConnected && !previousFocus.disabled ? previousFocus : enter;
      if(focus)target.focus({ preventScroll: true }); previousFocus = null;
    }
  }
  enter.addEventListener('click', () => setViewer(true));
  exit.addEventListener('click', () => setViewer(false));
  document.addEventListener('keydown', event => {
    if(passwordMode)return; // The password-mode Escape handler below relocks.
    if (!viewing || event.key !== 'Escape') return;
    event.preventDefault(); setViewer(false);
  });
  if(passwordMode){
    const access=document.createElement('div');access.className='preview-controls-access';
    const gate=document.createElement('button');gate.type='button';gate.id='preview-controls-access';gate.textContent='Preview controls';gate.setAttribute('aria-controls','preview-controls-dialog');access.append(gate);footer.append(access);
    const dialog=document.createElement('dialog');dialog.id='preview-controls-dialog';dialog.className='preview-controls-dialog';dialog.setAttribute('aria-labelledby','preview-controls-title');dialog.setAttribute('aria-describedby','preview-controls-note');
    const title=document.createElement('h2');title.id='preview-controls-title';title.textContent='Preview controls';
    const note=document.createElement('p');note.id='preview-controls-note';note.textContent='Unlock design controls for this tab only. Escape or Lock preview controls hides them again; reloading starts locked.';
    const form=document.createElement('form');form.autocomplete='off';
    const label=document.createElement('label');label.htmlFor='preview-controls-password';label.textContent='Preview password';
    const input=document.createElement('input');input.id='preview-controls-password';input.name='password';input.type='password';input.autocomplete='off';input.required=true;input.maxLength=256;input.setAttribute('aria-describedby','preview-controls-feedback');
    const submit=document.createElement('button');submit.type='submit';submit.textContent='Unlock controls';
    const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Cancel';
    const actions=document.createElement('div');actions.className='preview-controls-dialog-actions';actions.append(submit,cancel);
    const feedback=document.createElement('p');feedback.id='preview-controls-feedback';feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
    form.append(label,input,actions,feedback);dialog.append(title,note,form);document.body.append(dialog);
    let attempt=0,controller=null,timeout=null;
    const cancelAttempt=()=>{attempt++;controller?.abort();controller=null;clearTimeout(timeout);timeout=null;input.value='';submit.disabled=false;form.removeAttribute('aria-busy');};
    const closeDialog=(focus=true)=>{cancelAttempt();if(dialog.open){if(typeof dialog.close==='function')dialog.close();else dialog.removeAttribute('open');}if(focus)gate.focus({preventScroll:true});};
    const lock=(manual=true)=>{if(manual){workspaceManualLock=true;workspaceRenewPending=false;cancelWorkspaceProbe();}controlsUnlocked=false;cancelAttempt();document.body.dataset.previewControlsLocked='true';setViewer(true,false);entry.hidden=true;exit.hidden=true;gate.textContent='Preview controls';gate.setAttribute('aria-expanded','false');publishPreviewControls();if(dialog.open){if(typeof dialog.close==='function')dialog.close();else dialog.removeAttribute('open');}};
    const workspaceCandidate=()=>window.astraPreviewSession?.privateWorkspaceCandidate?.()===true;
    let workspaceManualLock=false,workspaceEpoch=0,workspaceController=null,workspaceDeadline=null,workspaceExpiry=null,workspaceUnderlying=null,workspaceWorking=false,workspaceRetryWanted=false,workspaceRenewPending=false;
    const workspaceNote=document.createElement('small');workspaceNote.setAttribute('role','status');if(workspaceCandidate())access.append(workspaceNote);
    const localWorkspace=()=>location.protocol==='http:'&&['localhost','127.0.0.1'].includes(location.hostname);
    const canProbe=(renewOnly=false)=>workspaceCandidate()&&(renewOnly?workspaceRenewPending&&localWorkspace():!workspaceManualLock)&&!document.hidden&&navigator.onLine!==false;
    const cancelWorkspaceProbe=()=>{workspaceEpoch++;workspaceRetryWanted=false;workspaceController?.abort();workspaceController=null;clearTimeout(workspaceDeadline);workspaceDeadline=null;};
    const unlockControls=(automatic=false)=>{controlsUnlocked=true;delete document.body.dataset.previewControlsLocked;closeDialog(!automatic);setViewer(false,false);exit.textContent='Exit viewer preview';exit.title='Return to unlocked editing. Escape relocks preview controls.';gate.textContent='Lock preview controls';if(!automatic){options.open=true;options.querySelector('summary')?.focus({preventScroll:true});}publishPreviewControls();};
    const revokeWorkspace=(mode='unknown')=>{workspaceExpiresAt=null;workspaceMode=mode;workspaceRenewPending=false;workspaceNote.textContent='';clearTimeout(workspaceExpiry);workspaceExpiry=null;lock(false);publishWorkspace();};
    function retryWorkspaceWhenSettled(){const renewOnly=workspaceRetryWanted==='local-renew';if(workspaceRetryWanted&&!workspaceUnderlying&&!workspaceWorking&&canProbe(renewOnly)){workspaceRetryWanted=false;void probeWorkspace(renewOnly);}}
    function expireWorkspace(){const mayRenew=localWorkspace();cancelWorkspaceProbe();revokeWorkspace();workspaceNote.textContent='Private session expired. Reload to sign in again.';if(mayRenew){workspaceRenewPending=true;void probeWorkspace(true);}}
    async function readWorkspaceStatus(response,abort){
      const rejected=async()=>{abort.abort();try{await response.body?.cancel();}catch{}return null;};
      if(response.status!==200||response.headers.get('X-Astra-Preview')!=='password'||response.headers.get('X-Astra-Workspace')!=='private_workspace'||!/^application\/json(?:;|$)/i.test(response.headers.get('Content-Type')||'')||response.headers.has('Set-Cookie'))return rejected();
      const policy=new Set((response.headers.get('Cache-Control')||'').toLowerCase().split(',').map(x=>x.trim()));
      if(policy.size!==3||!['private','no-store','no-transform'].every(x=>policy.has(x))||response.headers.get('CDN-Cache-Control')!=='no-store'||response.headers.get('Cloudflare-CDN-Cache-Control')!=='no-store')return rejected();
      const reader=response.body?.getReader();if(!reader)return null;let size=0;const chunks=[];let reads=0;
      try{while(true){if(++reads>1024)throw Error('status_chunk_bound');const{value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>512)throw Error('status_body_bound');chunks.push(value);}}
      catch(error){abort.abort();try{await reader.cancel();}catch{}throw error;}
      const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
      const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes),keys=[...text.matchAll(/"((?:\\.|[^"\\])*)"\s*:/g)].map(m=>JSON.parse('"'+m[1]+'"'));
      if(keys.length!==3||new Set(keys).size!==3)return null;
      const value=JSON.parse(text);
      if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join('|')!=='expiresAt|mode|unlocked'||value.unlocked!==true||value.mode!=='private_workspace'||!Number.isSafeInteger(value.expiresAt)||value.expiresAt<=Date.now()||value.expiresAt>Date.now()+8*60*60*1000)return null;
      return value.expiresAt;
    }
    async function probeWorkspace(renewOnly=false){
      if(!canProbe(renewOnly))return;
      if(workspaceUnderlying||workspaceWorking){workspaceRetryWanted=renewOnly?'local-renew':true;return;}
      if(!(location.protocol==='https:'||location.protocol==='http:'&&['localhost','127.0.0.1'].includes(location.hostname)))return;
      workspaceRetryWanted=false;workspaceWorking=true;const ticket=++workspaceEpoch,abort=new AbortController();workspaceController=abort;
      const physical=(async()=>{const response=await fetch('/__preview_controls',{method:'GET',credentials:'same-origin',cache:'no-store',redirect:'error',headers:{Accept:'application/json','X-Astra-Controls-Status':'1'},signal:abort.signal});return {expiresAt:await readWorkspaceStatus(response,abort),review:response.headers.get('X-Astra-Preview')==='review'};})();workspaceUnderlying=physical;
      physical.then(()=>{if(workspaceUnderlying===physical)workspaceUnderlying=null;retryWorkspaceWhenSettled();},()=>{if(workspaceUnderlying===physical)workspaceUnderlying=null;retryWorkspaceWhenSettled();});
      try{
        const deadline=new Promise((_,reject)=>{workspaceDeadline=setTimeout(()=>{abort.abort();reject(Error('status_timeout'));},15000);});
        const value=await Promise.race([physical,deadline]);if(ticket!==workspaceEpoch||!canProbe(renewOnly))return;
        if(value.expiresAt===null||value.expiresAt<=Date.now()){if(renewOnly)workspaceManualLock=true;revokeWorkspace(value.review?'review':'unknown');workspaceNote.textContent='Private session could not be verified. Reload to sign in again if needed.';return;}
        workspaceExpiresAt=value.expiresAt;workspaceMode='private_workspace';workspaceRenewPending=false;clearTimeout(workspaceExpiry);workspaceExpiry=setTimeout(expireWorkspace,Math.max(0,value.expiresAt-Date.now()));
        workspaceNote.textContent='Existing private session verified; no second password is needed.';if(!renewOnly||!workspaceManualLock)unlockControls(true);publishWorkspace();
      }catch{if(ticket===workspaceEpoch){if(renewOnly)workspaceManualLock=true;revokeWorkspace();workspaceNote.textContent='Private session verification is unavailable. Controls remain locked.';}}
      finally{if(ticket===workspaceEpoch){clearTimeout(workspaceDeadline);workspaceDeadline=null;workspaceController=null;}workspaceWorking=false;retryWorkspaceWhenSettled();}
    }
    gate.addEventListener('click',()=>{if(workspaceExpiresAt!==null&&workspaceExpiresAt<=Date.now())revokeWorkspace();if(controlsUnlocked){lock();gate.focus({preventScroll:true});return;}if(workspaceCandidate()&&workspaceMode!=='review'){workspaceManualLock=false;void probeWorkspace();return;}feedback.textContent='';input.value='';if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');gate.setAttribute('aria-expanded','true');input.focus();});
    const cancelDialog=()=>{workspaceManualLock=true;cancelWorkspaceProbe();closeDialog();};
    cancel.addEventListener('click',cancelDialog);
    dialog.addEventListener('cancel',event=>{event.preventDefault();cancelDialog();});
    dialog.addEventListener('close',()=>{cancelAttempt();gate.setAttribute('aria-expanded','false');});
    form.addEventListener('submit',async event=>{
      event.preventDefault();if(submit.disabled)return;let password=input.value;input.value='';feedback.textContent='';
      if(!password||password.length>256){feedback.textContent='Enter the preview password.';input.focus();return;}
      const ticket=++attempt;submit.disabled=true;form.setAttribute('aria-busy','true');
      try{
        let accepted=false;
        if(['localhost','127.0.0.1'].includes(location.hostname)){
          // Explicit nonsecret development password verifier. Never used on a
          // remote host, including endpoint failures or lookalike hostnames.
          if(!window.crypto?.subtle||typeof TextEncoder!=='function')throw new Error('Local verification unavailable');
          const bytes=new TextEncoder().encode(password);password='';const digest=await window.crypto.subtle.digest('SHA-256',bytes);
          accepted=[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('')==='c0f5d87e15713bcf6d395e640f41e725534be802b694edeed9b1032cb4954dc6';
        }else{
          if(location.protocol!=='https:')throw new Error('HTTPS is required');
          controller=new AbortController();timeout=setTimeout(()=>controller?.abort(),15000);
          const body=new URLSearchParams({password}).toString();password='';
          const response=await fetch('/__preview_controls',{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',headers:{'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},body,signal:controller.signal});
          if(response.status===200&&/^application\/json(?:;|$)/i.test(response.headers.get('content-type')||''))accepted=(await response.json())?.unlocked===true;
        }
        if(ticket!==attempt)return;
        if(!accepted){feedback.textContent='Password not accepted, or the site preview session has expired.';input.focus();return;}
        unlockControls();
      }catch{if(ticket===attempt){feedback.textContent='Controls remain locked. Verification could not complete; try again after checking the site preview session.';input.focus();}}
      finally{password='';if(ticket===attempt){clearTimeout(timeout);timeout=null;controller=null;submit.disabled=false;form.removeAttribute('aria-busy');}}
    });
    document.addEventListener('keydown',event=>{if(event.key!=='Escape')return;if(workspaceCandidate()&&(workspaceUnderlying||workspaceRenewPending)&&!dialog.open){event.preventDefault();lock();gate.focus({preventScroll:true});return;}if(dialog.open){event.preventDefault();cancelDialog();return;}if(controlsUnlocked){event.preventDefault();lock();gate.focus({preventScroll:true});}});
    window.addEventListener('pageshow',event=>{if(event.persisted){cancelWorkspaceProbe();revokeWorkspace();workspaceManualLock=false;if(workspaceCandidate())void probeWorkspace();}});
    window.addEventListener('pagehide',()=>{cancelWorkspaceProbe();if(workspaceCandidate())revokeWorkspace();});
    document.addEventListener('visibilitychange',()=>{if(!workspaceCandidate())return;if(document.hidden)cancelWorkspaceProbe();else if(workspaceExpiresAt!==null&&workspaceExpiresAt<=Date.now())expireWorkspace();else{const renewOnly=workspaceRenewPending&&localWorkspace();if(canProbe(renewOnly)){workspaceRetryWanted=renewOnly?'local-renew':true;void probeWorkspace(renewOnly);}}});
    window.addEventListener('online',()=>{if(workspaceExpiresAt!==null&&workspaceExpiresAt<=Date.now()){expireWorkspace();return;}const renewOnly=workspaceRenewPending&&localWorkspace();if(canProbe(renewOnly)){workspaceRetryWanted=renewOnly?'local-renew':true;void probeWorkspace(renewOnly);}});
    window.addEventListener('offline',()=>{if(workspaceCandidate())cancelWorkspaceProbe();});
    document.addEventListener('astraprivateworkspacecandidate',()=>{if(workspaceCandidate()){if(!workspaceNote.isConnected)access.append(workspaceNote);if(canProbe())void probeWorkspace();}else{cancelWorkspaceProbe();revokeWorkspace();}});
    lock(false);
    if(workspaceCandidate())void probeWorkspace();
  }
})();

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "viewer-preview.js", status: "initialization_failed"}})); } catch {}
}

;
/* Astra source: review-section-covers.js */
try {
(() => {
  'use strict';
  // Temporary review presentation. Original nodes, anchors and calculations stay
  // in place; revealing them is a tab-only owner preview choice.
  if (document.querySelector('footer')?.dataset.footerPrivacyLock !== 'on') return;
  if (document.body.dataset.reviewSectionCovers === 'on') return;
  document.body.dataset.reviewSectionCovers = 'on';
  const sections = [
    ['view-method', 'Methodology'],
    ['view-market-comparison', 'Compare'],
  ];
  const states = [];
  let noticeRecord = null;
  function privateWorkspace() {
    try {
      const value = window.AstraPrivateWorkspace?.current?.();
      return !!value && Object.isFrozen(value) && Object.keys(value).sort().join(',') === 'expiresAt,mode,verified'
        && value.mode === 'private_workspace' && value.verified === true
        && Number.isSafeInteger(value.expiresAt) && value.expiresAt > Date.now() && value.expiresAt < 8640000000000000;
    } catch { return false; }
  }
  function install() { for (const [id, name] of sections) {
    const view = document.getElementById(id);
    if (!view || view.querySelector(':scope > .review-section-cover')) continue;
    const saved = states.find(state => state.view === view);
    if (saved) { view.prepend(saved.cover); paint(saved); continue; }
    const cover = document.createElement('div'); cover.className = 'review-section-cover';
    const title = document.createElement('h2'); title.textContent = '[ Being written up ]';
    title.setAttribute('aria-label', name + ': being written up');
    const controls = document.createElement('div'); controls.className = 'preview-controls review-cover-controls';
    const button = document.createElement('button'); button.type = 'button';
    button.textContent = 'Show preserved draft content'; button.setAttribute('aria-pressed', 'false');
    controls.append(button); cover.append(title, controls); view.prepend(cover);
    const state = {view, cover, button, revealed: false}; states.push(state);
    button.addEventListener('click', () => {
      if (privateWorkspace() || document.body.dataset.previewControlsLocked === 'true' || document.body.dataset.viewerPreview === 'on') return;
      state.revealed = !state.revealed; paint(state);
    });
    paint(state);
  }}
  function paint(state) {
    state.view.classList.toggle('review-section-covered', !state.revealed);
    state.view.dataset.reviewSectionRevealed = String(state.revealed);
    state.button.textContent = state.revealed ? 'Restore “Being written up” cover' : 'Show preserved draft content';
    state.button.setAttribute('aria-pressed', String(state.revealed));
  }
  function reconcilePresentation() {
    if (privateWorkspace()) {
      const notice = document.getElementById('review-demo-notice');
      if (!noticeRecord && notice?.classList.contains('review-demo-notice')) {
        const anchor = document.createComment('Private workspace review notice position');
        noticeRecord = {notice, anchor, parent: notice.parentNode, next: notice.nextSibling};
        notice.replaceWith(anchor);
      }
      for (const state of states) {
        state.cover.remove(); state.view.classList.remove('review-section-covered');
        delete state.view.dataset.reviewSectionRevealed;
      }
      return;
    }
    if (noticeRecord) {
      const {notice, anchor, parent, next} = noticeRecord;
      if (anchor.isConnected) anchor.replaceWith(notice);
      else if (parent?.isConnected) parent.insertBefore(notice, next?.parentNode === parent ? next : null);
      else document.body.prepend(notice);
      noticeRecord = null;
    }
    install();
    if (document.body.dataset.previewControlsLocked !== 'true') return;
    for (const state of states) if (state.revealed) {state.revealed = false; paint(state);}
  }
  reconcilePresentation();
  // Notification only. Authority is the viewer's validated getter, never event detail or a body marker.
  document.addEventListener('astraprivateworkspace', reconcilePresentation);
  new MutationObserver(reconcilePresentation).observe(document.body, {attributes: true, attributeFilter: ['data-preview-controls-locked'], childList: true, subtree: true});
})();

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "review-section-covers.js", status: "initialization_failed"}})); } catch {}
}

;
/* Astra source: date-presentation.js */
try {
(() => {
  'use strict';
  if(window.AstraDatePresentation)return;
  const pattern=/\b(20\d{2})-(\d{2})-(\d{2})(?=T|\b)/g;
  const normalized=text=>String(text).replace(pattern,(match,y,m,d)=>{const date=new Date(`${y}-${m}-${d}T00:00:00Z`);return Number.isFinite(date.valueOf())&&date.toISOString().slice(0,10)===match?`${m}-${d}-${y}`:match});
  const format=(text,wrap=true)=>{const value=normalized(text);if(!wrap)return value;return value.replace(/\b\d{2}-\d{2}-20\d{2}(?:[–—]\d{2}-\d{2}-20\d{2})?(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?/g,(match,offset,all)=>all[offset-1]==='('&&/^[^()\r\n]*\)/.test(all.slice(offset+match.length))?match:'('+match.replace('T',' ')+')')};
  const options=document.getElementById('display-options');if(options){const group=document.createElement('div');group.className='hero-layout-options';group.dataset.previewControls='true';group.setAttribute('role','group');group.setAttribute('aria-label','Date detail emphasis');let bold=false;try{bold=localStorage.getItem('astra-date-tone-v1')==='bold'}catch{}const button=document.createElement('button');button.type='button';const apply=()=>{document.body.dataset.dateTone=bold?'bold':'plain';button.textContent='Date details: '+(bold?'Bold white':'Match explanation');button.setAttribute('aria-pressed',String(bold))};button.addEventListener('click',()=>{bold=!bold;try{localStorage.setItem('astra-date-tone-v1',bold?'bold':'plain')}catch{}apply()});group.append(button);options.append(group);apply()}
  const skip=node=>node.parentElement?.closest('script,style,pre,code,textarea,input,[contenteditable="true"],[data-raw-date]');
  function visit(node){if(node.nodeType===3){if(!skip(node)){const next=format(node.nodeValue,!node.parentElement?.closest('.market-highlight-dates'));if(next!==node.nodeValue)node.nodeValue=next}return}if(node.nodeType!==1||node.matches?.('script,style,pre,code,textarea,input,[contenteditable="true"],[data-raw-date]'))return;const walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT);let text;while(text=walker.nextNode())visit(text)}
  window.AstraDatePresentation=Object.freeze({format});
  visit(document.body);
  const pending=new Set();let scheduled=false;
  const flush=()=>{scheduled=false;const nodes=[...pending];pending.clear();for(const node of nodes)if(node.isConnected)visit(node)};
  new MutationObserver(records=>{for(const record of records){if(record.type==='characterData')pending.add(record.target);else for(const node of record.addedNodes)pending.add(node)}if(pending.size&&!scheduled){scheduled=true;requestAnimationFrame(flush)}}).observe(document.body,{childList:true,subtree:true,characterData:true});
})();

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "date-presentation.js", status: "initialization_failed"}})); } catch {}
}

;
/* Astra source: local-preview-refresh.js */
try {
(() => {
  'use strict';
  // The hosted site must not poll this route, install listeners or reload itself.
  if (!['127.0.0.1', 'localhost'].includes(window.location.hostname) || !['http:', 'https:'].includes(window.location.protocol) || window.AstraLocalPreviewRefresh) return;
  function create({ fetcher = (...args) => window.fetch(...args), reload = () => window.location.reload() } = {}) {
    let baseline = null, pendingVersion = null, reloading = false, running = false, inflight = false, timer, currentAbort;
    const blocked = () => {
      const active = document.activeElement;
      return document.hidden || !!active?.matches?.('input,textarea,select') || !!active?.isContentEditable
        || !!active?.closest?.('[contenteditable]:not([contenteditable="false"])') || !!document.querySelector('dialog[open]')
        || !!document.getElementById('contact-message')?.value?.length;
    };
    function clearTimer() { if (timer !== undefined) window.clearTimeout(timer); timer = undefined; }
    function maybeReload() {
      if (!running || reloading || !baseline || !pendingVersion || pendingVersion === baseline || blocked()) return;
      reloading = true; clearTimer(); currentAbort?.abort();
      // Native reload preserves the current URL/hash and saved browser preferences.
      // No draft text, cookies or other browser state is copied into storage.
      reload();
    }
    function schedule() { clearTimer(); if (running && !reloading && !document.hidden) timer = window.setTimeout(poll, 4500); }
    async function poll() {
      clearTimer();
      if (!running || reloading || inflight || document.hidden) return;
      inflight = true;
      const controller = new AbortController(); currentAbort = controller;
      const deadline = window.setTimeout(() => controller.abort(), 3000);
      try {
        const response = await fetcher('/__ui_version', { cache: 'no-store', credentials: 'omit', headers: { Accept: 'application/json' }, signal: controller.signal });
        if (!running || reloading || !response.ok) return;
        const text = await response.text(); if (text.length > 1024) return;
        const value = JSON.parse(text);
        if (value?.schemaVersion !== 1 || value.kind !== 'local_preview_ui' || typeof value.version !== 'string' || !/^[a-f0-9]{64}$/.test(value.version)) return;
        if (!running || reloading) return;
        if (baseline === null) baseline = value.version;
        else { pendingVersion = value.version === baseline ? null : value.version; maybeReload(); }
      } catch { /* A build, stopped server or invalid marker never causes a reload. */ }
      finally { window.clearTimeout(deadline); if (currentAbort === controller) currentAbort = undefined; inflight = false; schedule(); }
    }
    function visibility() { if (document.hidden) clearTimer(); else poll(); }
    // Revalidate after an editing/hidden pause. A newer build may now be in
    // progress; a formerly pending committed hash alone must not trigger reload.
    const interaction = () => Promise.resolve().then(() => { if (pendingVersion && !blocked() && !inflight) poll(); });
    function start() {
      if (running || reloading) return;
      running = true; document.addEventListener('visibilitychange', visibility); document.addEventListener('focusout', interaction);
      document.addEventListener('close', interaction, true); document.addEventListener('input', interaction);
      poll();
    }
    function stop() {
      running = false; clearTimer(); currentAbort?.abort(); document.removeEventListener('visibilitychange', visibility);
      document.removeEventListener('focusout', interaction); document.removeEventListener('close', interaction, true); document.removeEventListener('input', interaction);
    }
    return Object.freeze({ start, stop, poll, state: () => ({ baseline, pendingVersion, reloading, running, inflight }) });
  }
  const controller = create(); window.AstraLocalPreviewRefresh = Object.freeze({ create, controller }); controller.start();
})();

;
} catch {
  try { document.dispatchEvent(new CustomEvent("astrauimoduleerror", {detail: {module: "local-preview-refresh.js", status: "initialization_failed"}})); } catch {}
}
