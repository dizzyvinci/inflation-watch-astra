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
  function stats2(rows2) {
    const out = {};
    if (rows2.length > 16) fail("stat_row_bound");
    for (const [code, value] of rows2) {
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

  // ops/api-price-item-dto.mjs
  var HASH = /^[0-9a-f]{64}$/;
  var own2 = (v, k) => Object.prototype.hasOwnProperty.call(v, k);
  var STAT_NAMES = Object.freeze({ "0": "STR", "1": "DEX", "2": "INT", "3": "LUK", "4": "Max HP", "5": "Max MP", "6": "Speed", "7": "Jump", "9": "Magic ATT", "10": "Weapon DEF", "11": "Magic DEF", "12": "Accuracy", "13": "Avoidability", "14": "Crit rate", "15": "Crit damage", "16": "Weapon ATT" });
  var PROFILE = Object.freeze({ version: 1, kind: "market_api_price_item", sourceUrl: "https://maplestory.market/api/prices", statMapSourceUrl: "https://maplestory.market/assets/VDivider-1_mhy5kl.js", statMapSha256: "1d08886333ef15b7615efc9330c5cf673946256265caf19e672621e32a856cf7" });
  var InvalidProfile = class extends Error {
    constructor(code) {
      super(code);
      this.name = "InvalidProfile";
    }
  };
  var fail2 = (code) => {
    throw new InvalidProfile(code);
  };
  var DecimalToken = class {
    constructor(lexeme) {
      this.lexeme = lexeme;
      Object.freeze(this);
    }
  };
  async function sha256(raw) {
    return [...new Uint8Array(await crypto.subtle.digest("SHA-256", raw))].map((v) => v.toString(16).padStart(2, "0")).join("");
  }
  var object = (v) => v !== null && typeof v === "object" && !Array.isArray(v) && !(v instanceof DecimalToken);
  function shape(v, required, optional = []) {
    if (!object(v) || required.some((k) => !own2(v, k)) || Object.keys(v).some((k) => !required.includes(k) && !optional.includes(k))) fail2("unexpected_fields");
  }
  function integer4(v, min = 0, max = Number.MAX_SAFE_INTEGER) {
    if (!Number.isSafeInteger(v) || v < min || v > max) fail2("invalid_integer");
    return v;
  }
  function id(v) {
    return integer4(v, 1, 999999999);
  }
  function iso(v) {
    if (typeof v !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(v) || !Number.isFinite(Date.parse(v))) fail2("invalid_clock");
    const parts = /^(\d{4}-\d\d-\d\d)T(\d\d):(\d\d):(\d\d)/.exec(v), d = new Date(v);
    if (d.toISOString().slice(0, 10) !== parts[1] || Number(parts[2]) > 23 || Number(parts[3]) > 59 || Number(parts[4]) > 59) fail2("invalid_clock");
    return v;
  }
  var META_URLS = /* @__PURE__ */ new Set(["https://maplestory.io/api/MCW/1/item/list?cashFilter=true&count=10000", "https://maplestory.io/api/MCW/1/item/list?cashFilter=false&count=10000"]);
  function assertSafeItemDto(dto) {
    shape(dto, ["schemaVersion", "kind", "itemId", "identity", "source", "aggregate", "variants", "semantics"], ["sourceTypicalAttack"]);
    if (dto.schemaVersion !== 1 || dto.kind !== PROFILE.kind) fail2("dto_profile");
    id(dto.itemId);
    shape(dto.identity, ["name", "status", "region", "clientVersion", "meaning", "evidence"]);
    if (dto.identity.name !== null && (typeof dto.identity.name !== "string" || !dto.identity.name.trim() || dto.identity.name.length > 300)) fail2("dto_identity");
    if (!["unique_client_id", "conflicting_client_id", "unknown_client_id"].includes(dto.identity.status) || dto.identity.region !== "MCW" || dto.identity.clientVersion !== "1" || dto.identity.meaning !== "client_presence_not_market_availability_or_release" || !Array.isArray(dto.identity.evidence) || dto.identity.evidence.length > 4) fail2("dto_identity");
    if (dto.identity.status === "unique_client_id" !== (dto.identity.name !== null) || dto.identity.name !== null && dto.identity.evidence.length === 0) fail2("dto_identity_binding");
    for (const v of dto.identity.evidence) {
      shape(v, ["sourceUrl", "retainedMetadataSha256"]);
      if (!META_URLS.has(v.sourceUrl) || !HASH.test(v.retainedMetadataSha256)) fail2("dto_identity_evidence");
    }
    shape(dto.source, ["provider", "operation", "sourceUrl", "rawBodySha256", "retrievedAt", "retrievalTimeKind", "sourceObservedAt", "window", "sourceWindowSemantics"]);
    if (dto.source.provider !== "maplestory.market" || dto.source.operation !== "prices" || dto.source.sourceUrl !== PROFILE.sourceUrl || !HASH.test(dto.source.rawBodySha256) || dto.source.sourceObservedAt !== null || dto.source.retrievalTimeKind !== "http_response_completed" || dto.source.sourceWindowSemantics !== "primary_client_reported_window_not_exact_observation_bounds") fail2("dto_source");
    iso(dto.source.retrievedAt);
    shape(dto.source.window, ["reportedDays", "exactStartAt", "exactEndAt"]);
    if (dto.source.window.reportedDays !== 3 || dto.source.window.exactStartAt !== null || dto.source.window.exactEndAt !== null) fail2("dto_window");
    function money2(v, nullable = true) {
      if (v === null && nullable) return;
      if (typeof v !== "string" || v.length > 160 || !/^\d+(?:\.\d+)?$/.test(v)) fail2("dto_price");
    }
    function s(v) {
      if (v === null) return;
      shape(v, ["reportedSalesCount", "reportedUnitCount", "reportedDaySalesCount", "reportedDayUnitCount", "averageUnitPrice", "medianUnitPrice", "basis", "dayCounterBoundsKnown"]);
      for (const k of ["reportedSalesCount", "reportedUnitCount", "reportedDaySalesCount", "reportedDayUnitCount"]) integer4(v[k]);
      money2(v.averageUnitPrice);
      money2(v.medianUnitPrice);
      if (v.basis !== "source_labelled_sold_not_independently_confirmed_transactions" || v.dayCounterBoundsKnown !== false) fail2("dto_sold");
    }
    function a(v) {
      if (v === null) return;
      shape(v, ["reportedListingCount", "reportedSellerCount", "medianUnitPrice", "p25UnitPrice", "p75UnitPrice", "basis", "currentAvailabilityVerified"]);
      integer4(v.reportedListingCount);
      integer4(v.reportedSellerCount);
      for (const k of ["medianUnitPrice", "p25UnitPrice", "p75UnitPrice"]) money2(v[k]);
      if (v.basis !== "source_seen_asking_prices" || v.currentAvailabilityVerified !== false) fail2("dto_asking");
    }
    function r(v, scopes, isItem = false) {
      if (v === null) return;
      shape(v, ["unitPrice", "basis", "reportedSamples", "scope", "aggregation", "exactVariantValue", "isNearFallback"]);
      money2(v.unitPrice, false);
      integer4(v.reportedSamples);
      if (!["sold", "listed"].includes(v.basis) || !scopes.includes(v.scope) || v.aggregation !== (isItem ? v.basis === "sold" ? "average" : "median" : "unknown") || v.exactVariantValue !== false || v.isNearFallback !== (v.scope === "near")) fail2("dto_reference");
    }
    shape(dto.aggregate, ["sold", "asking", "reference"], ["dealReference"]);
    s(dto.aggregate.sold);
    a(dto.aggregate.asking);
    r(dto.aggregate.reference, ["item"], true);
    if (own2(dto.aggregate, "dealReference")) r(dto.aggregate.dealReference, ["item"], true);
    shape(dto.variants, ["reportedStats", "successfulScrolls", "attackPools", "presence"]);
    shape(dto.variants.presence, ["reportedStats", "successfulScrolls", "attackPools"]);
    for (const value of Object.values(dto.variants.presence)) if (typeof value !== "boolean") fail2("dto_presence");
    for (const [key, scopes] of [["reportedStats", ["stats"]], ["successfulScrolls", ["scrolls", "near"]], ["attackPools", ["attack", "near"]]]) {
      if (!Array.isArray(dto.variants[key]) || dto.variants[key].length > 2e4 || !dto.variants.presence[key] && dto.variants[key].length) fail2("dto_groups");
      const seen = /* @__PURE__ */ new Set();
      for (const v of dto.variants[key]) {
        const stats3 = key === "reportedStats", attack = key === "attackPools";
        shape(v, attack ? ["groupKey", "reportedAttack", "sold", "asking", "reference", "qualityConstant", "matchSemantics"] : ["successfulUpgrades", "slotsLeft", "reference", "qualityConstant", "groupKey", "matchSemantics", ...stats3 ? ["reportedStats", "unreportedStats", "sourceComparisonMayIgnoreStats"] : []], stats3 ? [] : ["dealReference"]);
        let expectedKey;
        if (attack) {
          integer4(v.reportedAttack);
          s(v.sold);
          a(v.asking);
          expectedKey = `attack:${dto.itemId}:${v.reportedAttack}`;
          if (v.matchSemantics !== "attack_only_pool_other_stats_not_constant") fail2("dto_match");
        } else {
          integer4(v.successfulUpgrades, 0, 100);
          integer4(v.slotsLeft, 0, 100);
          expectedKey = `${stats3 ? "stats" : "scrolls"}:${dto.itemId}:u${v.successfulUpgrades}:s${v.slotsLeft}`;
          if (stats3) {
            if (!object(v.reportedStats) || Object.keys(v.reportedStats).some((k) => !own2(STAT_NAMES, k))) fail2("dto_stats");
            for (const n of Object.values(v.reportedStats)) integer4(n, -1e6, 1e6);
            expectedKey += ":" + Object.entries(v.reportedStats).sort((a2, b) => Number(a2[0]) - Number(b[0])).map(([k, n]) => `${k}=${n}`).join(",");
            if (v.unreportedStats !== "unknown_not_zero" || JSON.stringify(v.sourceComparisonMayIgnoreStats) !== '["10","11"]' || v.matchSemantics !== "reported_signature_not_certified_complete_roll") fail2("dto_match");
          } else if (v.matchSemantics !== "successful_upgrades_and_slots_pool_all_stats") fail2("dto_match");
        }
        if (v.groupKey !== expectedKey || seen.has(v.groupKey) || v.qualityConstant !== false) fail2("dto_group_binding");
        seen.add(v.groupKey);
        r(v.reference, scopes);
        if (own2(v, "dealReference")) r(v.dealReference, scopes);
      }
    }
    shape(dto.semantics, ["moneyUnit", "counts", "sampleThresholdApplied", "exactVariantHistoryAvailable", "cleanStateInferred", "feesApplied", "publicationAuthorized", "statMapSha256"]);
    if (dto.semantics.moneyUnit !== "source_unit_price_in_mesos" || dto.semantics.counts !== "source_reported_counts_not_independently_verified_trades" || dto.semantics.sampleThresholdApplied !== null || dto.semantics.statMapSha256 !== PROFILE.statMapSha256 || ["exactVariantHistoryAvailable", "cleanStateInferred", "feesApplied", "publicationAuthorized"].some((k) => dto.semantics[k] !== false)) fail2("dto_semantics");
    if (own2(dto, "sourceTypicalAttack")) integer4(dto.sourceTypicalAttack);
    return true;
  }

  // ops/api-item-reference-protocol.mjs
  var HASH2 = /^[a-f0-9]{64}$/;
  var enc = new TextEncoder();
  var check2 = (v) => {
    if (!v) throw TypeError("Invalid item reference");
  };
  async function validatePublicItemReference(v) {
    v = structuredClone(v);
    check2(enc.encode(JSON.stringify(v)).length <= 3e5);
    const keys = ["schemaVersion", "kind", "itemId", "projectionGeneration", "dtoSha256", "sourceCapturedAt", "sourceObservedAt", "reportedWindowDays", "exactWindowBoundsKnown", "qualifiedIndividualTrades", "sourceCreditUrl", "item"];
    check2(v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).sort().join(",") === keys.sort().join(","));
    assertSafeItemDto(v.item);
    check2(v.schemaVersion === 1 && v.kind === "api_item_price_reference" && v.itemId === v.item.itemId && HASH2.test(v.projectionGeneration) && HASH2.test(v.dtoSha256) && v.sourceCapturedAt === v.item.source.retrievedAt && v.sourceObservedAt === null && v.reportedWindowDays === 3 && v.exactWindowBoundsKnown === false && v.qualifiedIndividualTrades === 0 && v.sourceCreditUrl === `https://maplestory.market/items/${v.itemId}?ref=v6kkdvp6`);
    check2(await sha256(enc.encode(JSON.stringify(v.item))) === v.dtoSha256);
    return v;
  }

  // ui-src/scrolling-joint/cached-scenario-reference.mjs
  var fail3 = (c) => {
    throw Error(c);
  };
  var need4 = (v, c) => {
    if (!v) fail3(c);
  };
  var knownStatLabels = Object.freeze({ "0": "STR", "1": "DEX", "2": "INT", "3": "LUK", "4": "Max HP", "5": "Max MP", "6": "Speed", "7": "Jump", "9": "MATT", "10": "Weapon DEF", "11": "Magic DEF", "12": "Accuracy", "13": "Avoidability", "14": "Crit", "15": "Crit damage", "16": "ATT" });
  var rows = /* @__PURE__ */ new WeakSet();
  var reviews = /* @__PURE__ */ new WeakSet();
  var freeze5 = (v) => {
    if (v && typeof v === "object" && !Object.isFrozen(v)) {
      for (const x of Object.values(v)) freeze5(x);
      Object.freeze(v);
    }
    return v;
  };
  function data(v, k) {
    need4(v !== null && typeof v === "object", "cached_record");
    const d = Object.getOwnPropertyDescriptor(v, k);
    need4(d && Object.hasOwn(d, "value"), "cached_own_data");
    return d.value;
  }
  function ownPublic(v) {
    let nodes = 0, units = 0;
    function copy(x, depth = 0) {
      need4(depth <= 32 && ++nodes <= 4e4, "cached_reference_bound");
      if (x === null || typeof x === "boolean") return x;
      if (typeof x === "number") {
        need4(Number.isSafeInteger(x), "cached_number");
        return x;
      }
      if (typeof x === "string") {
        units += x.length;
        need4(x.length <= 2048 && units <= 3e5, "cached_reference_bound");
        return x;
      }
      need4(x && typeof x === "object", "cached_own_data");
      const keys = Reflect.ownKeys(x);
      need4(keys.every((k) => typeof k === "string"), "cached_own_data");
      if (Array.isArray(x)) {
        const n = data(x, "length");
        need4(Number.isSafeInteger(n) && n <= 2e4 && keys.length === n + 1, "cached_array");
        return Array.from({ length: n }, (_, i) => copy(data(x, String(i)), depth + 1));
      }
      const proto = Object.getPrototypeOf(x);
      need4(proto === null || Object.getPrototypeOf(proto) === null, "cached_plain_record");
      const out2 = /* @__PURE__ */ Object.create(null);
      for (const k of keys) {
        units += k.length;
        need4(units <= 3e5, "cached_reference_bound");
        out2[k] = copy(data(x, k), depth + 1);
      }
      return out2;
    }
    const out = copy(v);
    need4(new TextEncoder().encode(JSON.stringify(out)).byteLength <= 3e5, "cached_reference_bound");
    return out;
  }
  function selected(packet, itemId) {
    need4(data(packet, "status") === "cache_only", "visited_references_unavailable");
    const list = data(packet, "references");
    need4(Array.isArray(list) && list.length <= 64, "cached_list_bound");
    let found = null;
    for (let i = 0; i < list.length; i++) {
      const r = data(list, String(i)), v = data(r, "data");
      if (data(v, "itemId") === itemId) {
        need4(found === null, "duplicate_cached_item");
        found = r;
      }
    }
    need4(found, "item_not_already_visited");
    return found;
  }
  async function reviewCachedScenarioReference(packet, itemId, { isCurrent = () => true } = {}) {
    need4(Number.isSafeInteger(itemId) && itemId >= 1 && itemId <= 999999999, "exact_cached_item_id");
    need4(isCurrent() === true, "reference_withdrawn");
    const saved = ownPublic(selected(packet, itemId));
    need4(["validated_cache", "retained"].includes(saved.mode), "cached_mode");
    const value = await validatePublicItemReference(saved.data);
    need4(isCurrent() === true, "reference_withdrawn");
    need4(value.itemId === itemId, "cached_item_binding");
    const dto = value.item, source = dto.source, candidates = [];
    function add2(kind, row, reference2) {
      if (!reference2 || reference2.unitPrice === null || reference2.reportedSamples < 1 || reference2.isNearFallback) return;
      need4(candidates.length < 256, "cached_candidate_bound");
      const result2 = freeze5({ kind, itemId, name: dto.identity.name, mode: saved.mode, groupKey: row?.groupKey ?? "item_reference", reportedStats: row ? { ...row.reportedStats } : null, slotsLeft: row?.slotsLeft ?? null, upgrades: row?.successfulUpgrades ?? null, gross: reference2.unitPrice, basis: reference2.basis, samples: reference2.reportedSamples, aggregation: reference2.aggregation, capturedAt: value.sourceCapturedAt, sourceObservedAt: source.sourceObservedAt, rawSha256: source.rawBodySha256, dtoSha256: value.dtoSha256, generation: value.projectionGeneration, sourceUrl: source.sourceUrl, reportedWindowDays: value.reportedWindowDays, exactWindowBoundsKnown: false, qualityConstant: false, availabilityKnown: false, lowestListingKnown: false });
      rows.add(result2);
      candidates.push(result2);
    }
    for (const row of dto.variants.reportedStats) {
      need4(Object.keys(row.reportedStats).every((k) => Object.hasOwn(knownStatLabels, k)), "unknown_reported_stat");
      add2("reported_stats", row, row.reference);
    }
    add2("scroll_item_reference", null, dto.aggregate.reference);
    const result = freeze5({ itemId, name: dto.identity.name, mode: saved.mode, dtoSha256: value.dtoSha256, generation: value.projectionGeneration, capturedAt: value.sourceCapturedAt, candidates });
    reviews.add(result);
    return result;
  }
  function cachedReviewPresent(packet, review) {
    try {
      need4(reviews.has(review), "owned_cached_review");
      const r = selected(packet, review.itemId), v = data(r, "data");
      return ["validated_cache", "retained"].includes(data(r, "mode")) && data(v, "dtoSha256") === review.dtoSha256 && data(v, "projectionGeneration") === review.generation && data(v, "sourceCapturedAt") === review.capturedAt;
    } catch {
      return false;
    }
  }
  function admitScenarioReference(row, target, { unknownsAcknowledged = false, mechanicsAcknowledged = false, purpose = "gross_sale" } = {}) {
    need4(rows.has(row), "owned_reference_candidate");
    need4(unknownsAcknowledged === true && mechanicsAcknowledged === true, "manual_unknowns_and_rules_acknowledgment");
    if (purpose === "scroll_cost") {
      need4(row.kind === "scroll_item_reference" && target.key === String(row.itemId), "scroll_identity_must_equal_rule_key");
    } else {
      need4(["gross_sale", "buy_cost"].includes(purpose) && row.kind === "reported_stats", "reported_signature_required");
      need4(target.itemId === String(row.itemId) && typeof target.quality === "string" && target.quality.length > 0, "manual_identity_quality_required");
      need4(Number.isSafeInteger(target.slotsLeft) && target.slotsLeft === row.slotsLeft && Number.isSafeInteger(target.upgrades) && target.upgrades === row.upgrades, "reported_slots_or_upgrades_mismatch");
      need4(target.stats && ["9", "14", "16"].every((k) => Object.hasOwn(target.stats, k) && Number.isSafeInteger(target.stats[k])), "explicit_joint_stats_required");
      for (const [k, v] of Object.entries(row.reportedStats)) need4(Object.hasOwn(target.stats, k) && target.stats[k] === v, "reported_stat_missing_or_conflicting");
    }
    const evidence2 = freeze5({ kind: "saved_exact_reference_assumption", basis: row.basis, samples: row.samples, capturedAt: row.capturedAt, sourceObservedAt: row.sourceObservedAt, rawSha256: row.rawSha256 });
    const provenance = freeze5({ ...row, purpose, modelTarget: JSON.parse(JSON.stringify(target)), unreportedAndUnmodeledStatsUnknownAcknowledged: true, qualityManuallyAssumed: true, serverMechanicsManuallyAssumed: true, referenceIsScenarioAssumption: true, sourceCertifiesExactQuality: false, stockOrFillsInferred: false });
    return freeze5({ price: row.gross, evidence: evidence2, provenance });
  }

  // ui-src/scrolling-joint/page.mjs
  function createPage(host, { edit, calculate, clear, guard, readCached = () => ({ status: "disabled", references: [] }), readExpiry = () => null, now = () => 0 }) {
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
    let quotes = [], presentationReferences = Object.freeze([]);
    const sourceBindings = /* @__PURE__ */ new Map();
    let reviewed = null, referenceEpoch = 0, referencePending = false;
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
      const section = card.querySelector(".scrolling-stats"), rows2 = ["9", "14", "16"].map((k) => [k, val(section, k)]);
      for (const row of section.querySelectorAll(".scrolling-extra-row")) rows2.push([val(row, "code"), val(row, "value")]);
      return stats2(rows2);
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
        return gross === "" ? [] : [{ ...q, gross, evidence: sourceBindings.get(quoteRows.querySelector(`[data-quote="${i}"]`))?.evidence ?? { kind: "manual" } }];
      }), budget: val(finite, "budget").trim(), feePercent: val(finite, "feePercent"), fixedFee: val(finite, "fixedFee").trim(), residuals, decisions: decisions.value, resets: resets.value, acknowledged });
    }
    function renderQuotes(rows2, values = []) {
      quotes = rows2;
      quoteRows.replaceChildren();
      for (const [i, q] of rows2.entries()) {
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
        revertReferences("Quote grid regenerated. Imported reference assumptions withdrawn; previous manual prices restored.");
        const w = wire2(true);
        renderQuotes(generateQuoteRows(w), w.quotes);
        edit();
        status("Quote grid generated; all blank prices remain unknown.");
      } catch {
        status("Cannot generate: check explicit identities/stats/rules/fees and bounded horizon. Nothing was truncated.");
      }
    }), quoteRows);
    const referencePanel = el("section", void 0, "scrolling-reference-review");
    referencePanel.dataset.cachedScenarioReference = "true";
    referencePanel.append(el("h3", "Review already-visited price references"), el("p", "Reads only the item-detail references already in this tab. Visit the exact item through existing item details first if absent. This button never fetches, refreshes, supplies stock or finds the lowest listing. Shared aggregate medians are not equipment-state matches."));
    const referenceId = field(referencePanel, "MCW item ID to review", "cachedItemId");
    const referenceStatus = el("p", "No cached reference selected."), candidateSelect = el("select"), purpose = el("select"), targetSelect = el("select");
    candidateSelect.dataset.cachedCandidate = "true";
    targetSelect.dataset.cachedTarget = "true";
    purpose.dataset.cachedPurpose = "true";
    for (const [value, label] of [["gross_sale", "Resale quote assumption"], ["buy_cost", "Base / partial buy-cost assumption"], ["scroll_cost", "Scroll-cost assumption (rule key must equal MCW scroll ID)"]]) {
      const n = el("option", label);
      n.value = value;
      purpose.append(n);
    }
    const candidateLabel = el("label", "Reported reference ");
    candidateLabel.append(candidateSelect);
    const purposeLabel = el("label", "Scenario use ");
    purposeLabel.append(purpose);
    const targetLabel = el("label", "Existing declared scenario target ");
    targetLabel.append(targetSelect);
    const unknownAck = field(referencePanel, "I explicitly accept that quality is manually assumed and all unreported / unmodeled stats remain UNKNOWN and can affect value", "referenceUnknowns", false, "checkbox");
    const mechanicsAck = field(referencePanel, "I have entered the model-required stats, quality, remaining slots/upgrades and manually confirmed every server mechanic; cached client notes do not verify them", "referenceMechanics", false, "checkbox");
    const referencePreview = el("div");
    referencePreview.dataset.cachedReferencePreview = "true";
    function sourceText(row) {
      const signature = row.kind === "reported_stats" ? Object.entries(row.reportedStats).map(([k, v]) => (knownStatLabels[k] ?? "Unknown stat") + ": " + v).join(" / ") + " \xB7 Slots left: " + row.slotsLeft + " \xB7 Upgrades: " + row.upgrades : "Item-level reference; allowed only as a scroll-cost assumption";
      return `${row.itemId} ${row.name ?? "Name unknown"} \xB7 ${signature} \xB7 ${row.basis === "sold" ? "Source-labelled sold" : "Source-listed asking"} reference ${row.gross} mesos \xB7 ${row.samples} reference samples (not units or stock) \xB7 ${row.mode === "retained" ? "Retained" : "Previously accepted"} \xB7 Reported ${row.reportedWindowDays}-day window; exact bounds unknown`;
    }
    function clockNode(row) {
      const n = el("p"), date = new Date(row.capturedAt);
      const t = el("time", Number.isFinite(date.getTime()) ? "Retrieved (" + date.toLocaleString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }) + " UTC)" : "Retrieval clock unknown");
      t.dateTime = row.capturedAt;
      t.title = row.capturedAt;
      n.append(t, el("span", " \xB7 Source observation clock: " + (row.sourceObservedAt ?? "Unknown") + " \xB7 Provider: " + row.sourceUrl));
      return n;
    }
    function referenceFragment(row) {
      const fragment = d.createDocumentFragment();
      if (!row) return fragment;
      fragment.append(el("p", sourceText(row)), clockNode(row), el("p", "Full equipment quality is not certified. Unreported stats are unknown, never zero. No fill probability, available units, lowest listing or realized sale is established."));
      const proof = el("details"), summary = el("summary", "Original reference provenance");
      proof.append(summary, el("p", "Raw aggregate body SHA256: " + row.rawSha256), el("p", "Public item DTO SHA256: " + row.dtoSha256), el("p", "Reported signature: " + row.groupKey));
      fragment.append(proof);
      return fragment;
    }
    function showReference() {
      const row = reviewed?.candidates[Number(candidateSelect.value)], fragment = referenceFragment(row);
      if (!guard() || !syncReferences() || !guard()) return;
      referencePreview.replaceChildren(fragment);
      unknownAck.checked = false;
      mechanicsAck.checked = false;
    }
    function revertReferences(message) {
      referenceEpoch++;
      for (const [input, b] of sourceBindings) {
        if (input.isConnected && input.value === b.price) input.value = b.prior;
      }
      sourceBindings.clear();
      reviewed = null;
      candidateSelect.replaceChildren();
      targetSelect.replaceChildren();
      referencePreview.replaceChildren();
      unknownAck.checked = false;
      mechanicsAck.checked = false;
      referenceStatus.textContent = message;
    }
    function syncReferences() {
      if (!reviewed && !sourceBindings.size) return true;
      let packet;
      try {
        packet = readCached();
      } catch {
        packet = null;
      }
      const checks = new Set([...sourceBindings.values()].map((b) => b.review));
      if (reviewed) checks.add(reviewed);
      if ([...checks].every((v) => cachedReviewPresent(packet, v))) return true;
      revertReferences("Cached reference withdrawn or changed. Previous manual prices restored; review again explicitly.");
      edit();
      return false;
    }
    const reviewButton = button("Review this visited item reference", async () => {
      if (!guard() || referencePending) return;
      const expiry = readExpiry(), started = now();
      if (!Number.isSafeInteger(expiry) || started >= expiry) return;
      const token = ++referenceEpoch;
      referencePending = true;
      reviewButton.disabled = true;
      referenceStatus.textContent = "Validating the already-cached public reference; no request is sent.";
      const current = () => token === referenceEpoch && guard() && now() < expiry;
      try {
        if (!/^[1-9][0-9]{0,8}$/.test(referenceId.value.trim())) throw Error("exact_cached_id");
        const id2 = Number(referenceId.value.trim()), value = await reviewCachedScenarioReference(readCached(), id2, { isCurrent: current });
        const options = d.createDocumentFragment();
        for (const [i, row] of value.candidates.entries()) {
          const n = el("option", sourceText(row));
          n.value = String(i);
          options.append(n);
        }
        const preview = referenceFragment(value.candidates[0]);
        if (!cachedReviewPresent(readCached(), value) || !current()) return;
        reviewed = value;
        candidateSelect.replaceChildren(options);
        referencePreview.replaceChildren(preview);
        unknownAck.checked = false;
        mechanicsAck.checked = false;
        referenceStatus.textContent = value.candidates.length ? "Review a reported reference and choose a matching manually declared target." : "No usable reported-state or scroll-item reference with positive reference samples is cached.";
      } catch {
        if (token === referenceEpoch && guard()) referenceStatus.textContent = "Reference unavailable: check the exact already-visited item ID, cache access and complete accepted public record. No fallback or request was made.";
      } finally {
        referencePending = false;
        reviewButton.disabled = false;
      }
    });
    function currentTargets(kind = purpose.value) {
      const w = admittedSnapshot(wire2(true));
      if (kind === "gross_sale") return quotes.map((q, i) => ({ key: quoteKey(q), target: q, input: quoteRows.querySelector(`[data-quote="${i}"]`), label: matchedState(JSON.parse(quoteKey(q))).display }));
      if (kind === "buy_cost") return w.entries.map((q, i) => ({ key: q.key, target: q, input: offerRows.children[i].querySelector("[data-field=cost]"), label: "Offer " + q.key + " \xB7 " + matchedState(JSON.parse(quoteKey(q))).display }));
      return w.scrolls.map((q, i) => ({ key: q.key, target: q, input: ruleRows.children[i].querySelector("[data-field=cost]"), label: "Scroll rule " + q.key }));
    }
    function targets() {
      targetSelect.replaceChildren();
      try {
        for (const row of currentTargets()) {
          const n = el("option", row.label);
          n.value = row.key;
          targetSelect.append(n);
        }
        referenceStatus.textContent = "Targets read from your explicit scenario declarations. Nothing was filled automatically.";
      } catch {
        referenceStatus.textContent = "Complete the manual model fields and generate the quote grid first. No missing stat, quality or rule is inferred.";
      }
    }
    const applyReference = button("Use as this scenario assumption", () => {
      if (!guard() || !syncReferences()) return;
      try {
        const row = reviewed?.candidates[Number(candidateSelect.value)], target = currentTargets().find((r) => r.key === targetSelect.value);
        if (!row || !target) throw Error("target_required");
        const value = admitScenarioReference(row, target.target, { purpose: purpose.value, unknownsAcknowledged: unknownAck.checked, mechanicsAcknowledged: mechanicsAck.checked }), prior = sourceBindings.get(target.input)?.prior ?? target.input.value;
        if (!syncReferences() || !guard()) return;
        target.input.value = value.price;
        sourceBindings.set(target.input, { ...value, prior, review: reviewed, candidate: row, purpose: purpose.value, targetKey: target.key });
        referenceStatus.textContent = "Dated reference copied only as a scenario assumption. Unknown stats/quality, stock, fills and server rules remain unverified.";
        edit();
      } catch {
        referenceStatus.textContent = "Not applied: every reported stat and slots/upgrades must match your explicit model; select the correct target and acknowledge unknowns and manual rules. Item aggregates cannot price equipment states.";
      }
    });
    referenceId.addEventListener("input", () => {
      referenceEpoch++;
      reviewed = null;
      candidateSelect.replaceChildren();
      targetSelect.replaceChildren();
      referencePreview.replaceChildren();
      unknownAck.checked = false;
      mechanicsAck.checked = false;
      referenceStatus.textContent = "Item ID changed. Review the chosen visited reference explicitly; existing admitted assumptions remain separately recorded.";
    });
    candidateSelect.addEventListener("change", showReference);
    purpose.addEventListener("change", targets);
    for (const n of [unknownAck, mechanicsAck]) n.addEventListener("change", () => {
      if (!n.checked && sourceBindings.size) {
        revertReferences("Reference acknowledgments withdrawn; previous manual prices restored.");
        edit();
      }
    });
    referencePanel.append(reviewButton, candidateLabel, purposeLabel, button("Choose current scenario targets", targets), targetLabel, applyReference, referenceStatus, referencePreview);
    form.append(referencePanel);
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
      if (sourceBindings.has(e.target)) sourceBindings.delete(e.target);
      if (e.target.dataset.mechanical === "true" || e.target === decisions) {
        revertReferences("Model state changed; cached assumptions withdrawn and previous manual prices restored.");
        quotes = [];
        quoteRows.replaceChildren();
      }
      edit();
    });
    form.addEventListener("change", () => edit());
    function load(x) {
      revertReferences("Example loaded. Imported reference assumptions withdrawn.");
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
      revertReferences("No cached reference selected.");
      referenceId.value = "";
      purpose.value = "gross_sale";
      presentationReferences = Object.freeze([]);
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
    function table(title, headers, rows2) {
      const section = el("section"), t = el("table"), thead = el("thead"), tr = el("tr");
      for (const h of headers) tr.append(el("th", h));
      thead.append(tr);
      t.append(thead);
      const tbody = el("tbody");
      for (const row of rows2) {
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
      const selected2 = el("p", `Starting offer: ${result.selectedEntry ?? "none"}. First action: ${action(result.selectedAction).display}. ${presentationReferences.length ? "Source: explicitly reviewed dated cached references plus manual assumptions." : "Source capture Unknown/manual."} No fill probability, turnover, volume or time-to-sale evidence.`);
      selected2.dataset.modelAction = result.selectedAction;
      fragment.append(p, selected2, el("p", "Campaign net includes the starting equipment purchase and all modeled later costs, fees and sale proceeds. State rows show the expected future net cash flow of the known policy from that point; money already spent is excluded. Budget left is unused gross spending allowance, not your meso balance. Sale proceeds do not replenish this budget."));
      fragment.append(el("p", `Shown ${result.rows.length} state rows / ${result.evaluated} evaluated; projection ${result.projectionTruncated ? "truncated" : "not truncated"}. Up to 64 rows / 16 KiB output; exact recurrence is bounded, never sampled. Unknown stock is assumed obtainable only inside this scenario.`));
      fragment.append(table("Starting offers", ["Offer", "First action", "Campaign net after starting buy", "Unknown alternatives?"], result.entries.map((r) => [r.entry, action(r.action), money(r.knownNet), yesNo(r.unknown)])));
      fragment.append(table("Modeled policy states \u2014 not an observed ledger", ["Equipment state", "Budget left (spending allowance)", "Decisions / rebuy resets left", "Offers bought in campaign", "Scrolls consumed in campaign", "Chosen action", "Expected future net cash flow of known policy", "Unknown alternative?"], result.rows.map((r) => [fullState(r.item), money(r.grossCashRemaining), r.decisionsRemaining + " / " + r.resetsRemaining, quantities(r.purchases, presentationKeys.offers, "Offer"), quantities(r.scrollsUsed, presentationKeys.scrolls, "Scroll"), action(r.selectedAction), money(r.knownFutureNet), yesNo(r.unknownFeasibleAlternative)])));
      fragment.append(el("p", "Fixed-policy algebraic roots below are NOT a globally reoptimized price frontier. Recalculate after any price edit; affordability and chosen policy can change. Negative roots are outside the nonnegative input domain."));
      fragment.append(table("Fixed-policy break-even roots", ["Price being varied", "Offer, scroll or exactly matched equipment", "Break-even price (mesos)", "Expected quantity in this policy"], result.fixedPolicyBreakEven.map((r) => [{ display: r.kind === "buy" ? "Equipment buy price" : r.kind === "scroll" ? "Scroll buy price" : r.kind === "gross_sale" ? "Matched equipment gross sale" : "Unknown price", exact: r.kind }, r.kind === "gross_sale" ? matchedState(r.key) : { display: (r.kind === "buy" ? "Offer " : "Scroll ") + r.key, exact: typeof r.key === "string" ? r.key : JSON.stringify(r.key) }, money(r.value), money(r.expectedPolicyQuantity)])));
      if (presentationReferences.length) {
        const provenance = el("section");
        provenance.dataset.scenarioReferenceProvenance = "true";
        provenance.append(el("h3", "Dated reference assumptions used in this calculation"), el("p", "Unreported and unmodeled stats remain UNKNOWN and can affect value. Quality and server mechanics were manually assumed, not source-certified. Reference samples are not stock, units or verified fills."));
        for (const row of presentationReferences.slice(0, 16)) {
          provenance.append(el("p", row.purpose.replaceAll("_", " ") + " \xB7 " + sourceText(row)), clockNode(row), el("p", "Original raw body SHA256: " + row.rawSha256));
        }
        if (presentationReferences.length > 16) provenance.append(el("p", "Showing 16 of " + presentationReferences.length + " explicitly reviewed assumptions."));
        fragment.append(provenance);
      }
      return fragment;
    }
    clearData();
    return Object.freeze({ read: () => {
      if (!syncReferences()) throw Error("reference_withdrawn");
      for (const [input, b] of sourceBindings) {
        if (input.value !== b.price) {
          sourceBindings.delete(input);
          continue;
        }
        const target = currentTargets(b.purpose).find((v) => v.input === input && v.key === b.targetKey);
        if (!target || b.purpose !== "scroll_cost" && quoteKey(target.target) !== quoteKey(b.provenance.modelTarget)) {
          revertReferences("Manual model state changed; review the reference assumptions again.");
          throw Error("reference_target_changed");
        }
        admitScenarioReference(b.candidate, target.target, { purpose: b.purpose, unknownsAcknowledged: b.provenance.unreportedAndUnmodeledStatsUnknownAcknowledged, mechanicsAcknowledged: b.provenance.serverMechanicsManuallyAssumed });
      }
      const value = wire2(ack.checked);
      presentationReferences = Object.freeze([...sourceBindings.values()].map((r) => r.provenance));
      presentationKeys = Object.freeze({ offers: Object.freeze(value.entries.map((r) => r.key)), scrolls: Object.freeze(value.scrolls.map((r) => r.key)) });
      return value;
    }, synchronizeReferences: syncReferences, invalidate, clear: clearData, prepare, reveal: (fragment) => {
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
  var need5 = (ok, code) => {
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
    const entryCosts = new Map(entries.map((e) => [e.key, e.cost])), ruleCosts = new Map(rules.map((r) => [r.key, r.cost])), valueCache = /* @__PURE__ */ new WeakMap(), cache = /* @__PURE__ */ new Map(), rows2 = [];
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
      need5(++evaluated <= a.limits.nodeCap, "state_budget_exceeded");
      const index = rows2.length < 64 ? rows2.push(null) - 1 : -1, sale = sell(s), candidates = [{ action: "sell_stop", flow: sale, unknown: sale === null }];
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
      let selected2 = null;
      for (const candidate of candidates) if (candidate.flow !== null && (selected2 === null || compare(value(candidate.flow), value(selected2.flow)) > 0)) selected2 = candidate;
      const unknown = candidates.some((c) => c.unknown || c.flow === null), result = { flow: selected2?.flow ?? null, action: selected2?.action ?? null, unknown };
      if (index >= 0) rows2[index] = { item: pyItem(s), decisionsRemaining: left, resetsRemaining: resets, grossCashRemaining: cash, purchases: [...purchases], scrollsUsed: [...uses], selectedAction: result.action, knownFutureNet: result.flow === null ? null : value(result.flow), unknownFeasibleAlternative: unknown, alternatives: candidates.map((c) => [c.action, c.flow === null ? null : value(c.flow)]), alternativeCoverageUnknown: candidates.map((c) => [c.action, c.unknown]) };
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
    return { status: incomplete ? "unavailable" : "conditional_model", reason: incomplete ? "reachable_exact_state_price_missing" : null, selectedEntry: best.entry, selectedAction: best.action, optimalExpectedNet: incomplete ? null : best.knownNet, bestKnownNet: best.knownNet, entries: results, rows: rows2, evaluated, projectionTruncated: evaluated > rows2.length, fixedPolicyBreakEven: thresholds, breakEvenScope: "fixed_selected_policy_only_replan_after_price_or_budget_edits", quoteEvidence: a.quotes.map((q) => ({ key: q.key, gross: q.gross, evidence: q.evidence })), optimizationScope: { decisions: a.limits.decisions, resets: a.limits.resets, stateBudget: a.limits.nodeCap, allTimeOptimum: false }, assumptions: { feesVerified: false, realizationAssumed: true, fillProbability: null, turnover: null, timeToSale: null, entryStockCaps: entries.map((e) => e.stock), scrollStockCaps: rules.map((r) => r.stock), unknownStockAssumedObtainable: entries.some((e) => e.stock === null) || rules.some((r) => r.stock === null), saleProceedsReinvested: false, modeledContinuationsNotObservedLedger: true }, marketProfitClaim: false, defaultEnabled: false };
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
  var bytes = (object2) => new TextEncoder().encode(JSON.stringify(object2));
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
    need5(bytes(out).length <= 15800, "projection_header_bound");
    return out;
  }
  function evaluate(input, enabled, decode) {
    if (enabled !== true) return bytes({ status: "disabled", defaultEnabled: false });
    try {
      const admitted = admitManualWire(decode ? decodeManualBytes(input) : input), result = solveModel(admitted), out = project(result);
      Object.assign(out, { schemaVersion: 1, kind: "private_joint_scrolling_model_result_v1", currency: "mesos", verification: "manual_assumptions_not_market_or_game_rules", websiteIntegrationImplemented: false });
      const raw = bytes(out);
      need5(raw.length <= 16384, "manual_output_bound");
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
    function readCached() {
      const api2 = w.AstraItemApiPreview;
      try {
        if (api2?.peekCachedBasicReferences?.().status === "access_denied") return { status: "access_denied", references: [] };
        return api2?.peekCachedReferences?.() ?? { status: "disabled", references: [] };
      } catch {
        return { status: "unavailable", references: [] };
      }
    }
    function mount() {
      if (page) return;
      page = createPage(host, { edit, calculate, clear() {
        invalidate();
        page.clear();
      }, guard, readCached, readExpiry: workspace, now: () => w.Date.now() });
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
    for (const type of ["astrapiitemcache", "astrabasicitemcache"]) d.addEventListener(type, () => {
      page?.synchronizeReferences();
    });
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
