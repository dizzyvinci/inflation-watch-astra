// WORK only: no Worker hook, runtime flag, SDK, producer lease, or source request.
import {scope as validateScope, integer} from './api-basic-current-contract.mjs';
import {sha256} from './api-price-item-dto.mjs';
import {BASIC_PUBLIC_DEFINITION_SHA, BASIC_PUBLIC_MAX_BYTES, ownBasicBytes, parseBasicPublicItem} from './api-basic-current-public-contract.mjs';
import {BASIC_ITEM_HTTP_PREFIX, BASIC_ITEM_HTTP_PATH, BASIC_ITEM_HTTP_PROTOCOL,
  basicHttpHash, validBasicHttpEpoch, basicHttpResponse, basicHttpError, basicItemHttpHeaders} from './api-basic-item-http-protocol.mjs';

const POOLS = new WeakMap();
const need = value => { if (!value) throw Error('basic_http_reference_unavailable'); };
const unavailable = request => basicHttpError(request, 503, 'basic_reference_unavailable', {}, {'Retry-After': '1'});
export function createBasicPublicItemHttpRoute(options = {}) {
  if (options?.enabled !== true) {
    return Object.freeze(async request => new URL(request.url).pathname.startsWith(BASIC_ITEM_HTTP_PREFIX)
      ? basicHttpError(request, 404, 'not_published') : null);
  }
  const {identity, reader, publicEpoch, isEnabled = () => true, now = Date.now,
    monotonic = () => performance.now(), waitMs = 2500, maxRequests = 32} = options;
  need(identity && (typeof identity === 'object' || typeof identity === 'function'));
  need(reader && typeof reader.read === 'function' && typeof reader.setEnabled === 'function');
  need(validBasicHttpEpoch(publicEpoch) && typeof isEnabled === 'function' && typeof now === 'function'
    && typeof monotonic === 'function' && integer(waitMs, 1, 10000) && integer(maxRequests, 1, 64));
  const scope = Object.freeze(validateScope(structuredClone(options.scope)));
  const key = JSON.stringify([scope, publicEpoch]);
  let pool = POOLS.get(identity);
  if (!pool) {
    pool = {key, revision: 0, enabled: true, pending: new Set(), sequence: 0, latest: null};
    POOLS.set(identity, pool);
  }
  function advance(enabled) {
    need(pool.revision < Number.MAX_SAFE_INTEGER);
    pool.revision++;
    pool.enabled = enabled;
    pool.latest = null;
  }
  if (pool.key !== key) { advance(true); pool.key = key; }
  else if (!pool.enabled) advance(true);
  let epoch = pool.revision, on = true;
  function live() {
    try { return on && isEnabled() === true && pool.enabled && pool.key === key && epoch === pool.revision; }
    catch { return false; }
  }
  function revoke() {
    if (pool.key === key && epoch === pool.revision) {
      advance(false);
      try { reader.setEnabled(false); } catch {}
    }
  }
  function fence(context) {
    if (!live()) { revoke(); throw Error('basic_http_revoked'); }
    need(!context.cancelled && context.epoch === pool.revision
      && Number.isFinite(monotonic()) && monotonic() < context.deadline);
  }
  function sourceOrder(context, reference, current) {
    if (!current) return;
    const next = {capturedAt: reference.capturedAt, generation: reference.generation, sequence: context.sequence};
    if (pool.latest) {
      need(next.capturedAt >= pool.latest.capturedAt);
      if (next.capturedAt === pool.latest.capturedAt && next.generation !== pool.latest.generation) {
        need(next.sequence > pool.latest.sequence);
      }
    }
    if (!pool.latest || next.capturedAt > pool.latest.capturedAt || next.sequence > pool.latest.sequence) pool.latest = next;
  }
  function finalized(context, response) {
    // All request/header/Response preparation happens before the last authority check.
    fence(context);
    return response;
  }
  async function perform(context, request, id, wanted) {
    const result = await reader.read(id, {signal: context.controller.signal, deadline: context.deadline});
    fence(context);
    if (result?.status === 'disabled') { revoke(); throw Error('basic_http_revoked'); }
    need(result && ['validated', 'absent', 'retained', 'retained_absent'].includes(result.status));
    need(result.verificationScope === 'committed_sql_attestation_and_selected_page'
      && result.bodyHashVerification === 'producer_sql_attested_not_recomputed'
      && result.upstreamLatestInspected === false && basicHttpHash(result.payloadSha256));
    const current = result.status === 'validated' || result.status === 'absent';
    need(result.currentAgainstProvidedPins === current);
    const raw = ownBasicBytes(result.raw, BASIC_PUBLIC_MAX_BYTES);
    const payloadSha256 = await sha256(raw);
    fence(context);
    need(payloadSha256 === result.payloadSha256);
    const reference = await parseBasicPublicItem(raw, {
      expectedItemId: id, expectedDefinitionHash: BASIC_PUBLIC_DEFINITION_SHA,
      expectedPayloadSha256: payloadSha256, expectedGeneration: result.reference?.generation,
      expectedCapturedAt: result.reference?.capturedAt, signal: context.controller.signal,
      monotonic, waitMs: Math.max(1, Math.floor(context.deadline - monotonic())),
    });
    fence(context);
    const absent = reference.state === 'absent_in_generation';
    need(absent === (result.status === 'absent' || result.status === 'retained_absent'));
    const wall = now();
    need(Number.isFinite(wall) && Date.parse(reference.capturedAt) <= wall);
    const mode = current ? (absent ? 'absent' : 'current') : (absent ? 'retained_absent' : 'retained');
    const headers = await basicItemHttpHeaders({publicEpoch, generation: reference.generation,
      capturedAt: reference.capturedAt, payloadSha256, mode});
    fence(context);
    sourceOrder(context, reference, current);
    if (wanted && wanted !== reference.generation) {
      return finalized(context, current ? basicHttpError(request, 409, 'generation_changed', {
        itemId: id, generation: reference.generation, capturedAt: reference.capturedAt,
      }, {'X-Astra-Basic-Epoch': publicEpoch, 'X-Astra-Basic-Revision': headers['X-Astra-Basic-Revision'],
        'X-Astra-Basic-Generation': reference.generation, 'X-Astra-Basic-Captured-At': reference.capturedAt}) : unavailable(request));
    }
    if (current && !absent && request.headers.get('If-None-Match') === headers.ETag) {
      return finalized(context, basicHttpResponse(request, 304, null, headers));
    }
    // An absence is explicitly scoped to the named generation, never zero/stock.
    return finalized(context, basicHttpResponse(request, absent ? 404 : 200, raw, headers));
  }
  async function route(request) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith(BASIC_ITEM_HTTP_PREFIX)) return null;
    if (!live()) { revoke(); return basicHttpError(request, 404, 'not_published'); }
    const match = BASIC_ITEM_HTTP_PATH.exec(url.pathname);
    if (!match) return basicHttpError(request, 404, 'not_found');
    if (!['GET', 'HEAD'].includes(request.method)) return basicHttpError(request, 405, 'method_not_allowed', {}, {Allow: 'GET, HEAD'});
    if (request.headers.get('X-Astra-Request-Basic-Protocol') !== BASIC_ITEM_HTTP_PROTOCOL) return basicHttpError(request, 400, 'unsupported_basic_protocol');
    const query = [...url.searchParams];
    if (query.length > 1 || query.length === 1 && (query[0][0] !== 'generation' || !basicHttpHash(query[0][1]))) return basicHttpError(request, 400, 'invalid_query');
    if (request.signal.aborted) return unavailable(request);
    if (pool.pending.size >= maxRequests) return basicHttpError(request, 503, 'read_capacity', {}, {'Retry-After': '1'});
    let start;
    try { start = monotonic(); } catch { return unavailable(request); }
    if (!Number.isFinite(start) || pool.sequence === Number.MAX_SAFE_INTEGER) return unavailable(request);
    const context = {epoch, sequence: ++pool.sequence, deadline: start + waitMs,
      cancelled: false, controller: new AbortController()};
    pool.pending.add(context);
    let abortResolve, timer;
    const aborted = new Promise(resolve => { abortResolve = resolve; });
    const cancel = () => {
      context.cancelled = true;
      context.controller.abort();
      abortResolve(unavailable(request));
    };
    request.signal.addEventListener('abort', cancel, {once: true});
    const task = perform(context, request, Number(match[1]), url.searchParams.get('generation'))
      .catch(() => live() ? unavailable(request) : basicHttpError(request, 404, 'not_published'));
    timer = setTimeout(cancel, waitMs);
    // Logical deadlines never remove an outstanding dependency/hash reservation.
    task.finally(() => {
      clearTimeout(timer);
      request.signal.removeEventListener('abort', cancel);
      pool.pending.delete(context);
    }).catch(() => {});
    return Promise.race([task, aborted]);
  }
  Object.defineProperties(route, {
    setEnabled: {value(value) {
      on = value === true;
      if (!on) { revoke(); return; }
      if (pool.key !== key) return;
      if (!pool.enabled) advance(true);
      epoch = pool.revision;
      reader.setEnabled(true);
    }},
    state: {value: () => Object.freeze({enabled: live(), physicalResponsesPending: pool.pending.size})},
  });
  return Object.freeze(route);
}
