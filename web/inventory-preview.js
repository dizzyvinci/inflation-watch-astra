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
    let controller = null, selectedPage = null, connection = null, update = null, nextSnapshot = null, disposed = false, ageTimer = null;
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
    const node = (tag, text) => {
      const n = d.createElement(tag);
      if (text !== void 0) n.textContent = text;
      return n;
    };
    root.replaceChildren();
    root.append(node("h1", "Manual inventory \xB7 cached reference workspace"));
    root.append(node("p", "Manual workspace \xB7 Off by default. Review each page and physical stack yourself. No screenshot upload, OCR, game capture, IGN lookup, account setup or automatic saving."));
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
    root.append(node("p", "Privacy on this proposed page: quantities, stat details and page identities stay in this document\u2019s memory. Explicit Refresh sends item IDs to our cached-reference endpoints, where hosting logs may record them. This module adds no browser storage, analytics, automatic export, image bytes or account lookup. An explicit local export contains manual pages/entries only, without price bodies. Existing site privacy and optional performance choices still apply. Other same-origin code and already-loaded scripts can access document memory; this is not an isolated privacy guarantee."));
    function safeDraw() {
      if (disposed) return;
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
        action.append(remove);
        tr.append(action);
        body.append(tr);
      }
      table.append(body);
      armAgeTimer();
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
    const unsubscribe = model.subscribe(safeDraw);
    function setEnabled(value) {
      if (disposed || typeof value !== "boolean") return { enabled: model.enabled };
      if (value && !available()) return { enabled: model.enabled };
      if (value === model.enabled) return { enabled: model.enabled };
      if (!value) {
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
      const text = JSON.stringify(model.exportManual(), null, 2), blob = new w.Blob([text], { type: "application/json" }), url = w.URL.createObjectURL(blob), a = node("a");
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
        model.addEntry(selectedPage, { itemId: Number(e.itemId.value), quantity: e.quantity.value.trim() || null, tradeable: e.tradeable.value, kind: e.kind.value, unitFactor: e.unitFactor.value.trim() || null, unitConfirmed: e.unitConfirmed.checked, upgrades: int("upgrades"), slots: int("slots"), stats: e.stats.value.trim() ? JSON.parse(e.stats.value) : null, reportedSignatureAcknowledged: e.reportedSignatureAcknowledged.checked });
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
    const make = (tag, text) => {
      const n = doc.createElement(tag);
      if (text !== void 0) n.textContent = text;
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
    controls.append(toggle, make("small", "Off in each tab. Manual declarations only; explicit Refresh reads existing own-site cached references. No OCR or IGN lookup."));
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
