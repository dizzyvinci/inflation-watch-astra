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
