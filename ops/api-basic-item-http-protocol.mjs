// A separate thin-item HTTP protocol. It never impersonates full variant data.
import {sha256} from './api-price-item-dto.mjs';
import {BASIC_PUBLIC_DEFINITION_SHA} from './api-basic-current-public-contract.mjs';

export const BASIC_ITEM_HTTP_PROTOCOL = 'basic-aggregate-v1';
export const BASIC_ITEM_HTTP_PREFIX = '/api-basic-item-prices/';
export const BASIC_ITEM_HTTP_PATH = /^\/api-basic-item-prices\/([1-9][0-9]{0,8})\.json$/;
export const BASIC_HTTP_BASE = Object.freeze({
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'private, no-store, no-transform',
  'CDN-Cache-Control': 'no-store',
  'Cloudflare-CDN-Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex, nofollow, noarchive',
  'X-Astra-Basic-Protocol': BASIC_ITEM_HTTP_PROTOCOL,
  'X-Astra-Basic-Definition': BASIC_PUBLIC_DEFINITION_SHA,
});
const enc = new TextEncoder();
export const basicHttpHash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export const validBasicHttpEpoch = value => typeof value === 'string' && /^[a-z0-9][a-z0-9-]{7,95}$/.test(value);
export function basicHttpResponse(request, status, raw, headers = {}) {
  const bytes = typeof raw === 'string' ? enc.encode(raw) : raw;
  return new Response(request.method === 'HEAD' || status === 304 ? null : bytes, {
    status,
    headers: {
      ...BASIC_HTTP_BASE,
      ...(status === 304 ? {} : {'Content-Length': String(bytes?.byteLength ?? 0)}),
      ...headers,
    },
  });
}
export function basicHttpError(request, status, error, extra = {}, headers = {}) {
  return basicHttpResponse(request, status, JSON.stringify({
    schemaVersion: 1, kind: 'basic_item_reference_error', error, sourceObservedAt: null, ...extra,
  }), headers);
}
export async function basicItemHttpHeaders({publicEpoch, generation, capturedAt, payloadSha256, mode}) {
  if (!validBasicHttpEpoch(publicEpoch) || !basicHttpHash(generation) || !basicHttpHash(payloadSha256)
      || !['current', 'retained', 'absent', 'retained_absent'].includes(mode)
      || typeof capturedAt !== 'string' || new Date(Date.parse(capturedAt)).toISOString() !== capturedAt) {
    throw Error('basic_http_metadata');
  }
  // Opaque tokens: neither is a private attempt ID or a sortable global ordinal.
  const revision = await sha256(enc.encode(JSON.stringify([publicEpoch, generation])));
  const etagHash = await sha256(enc.encode(JSON.stringify([publicEpoch, payloadSha256])));
  return Object.freeze({
    ETag: '"basic-item-' + etagHash + '"',
    'X-Astra-Basic-Epoch': publicEpoch,
    'X-Astra-Basic-Revision': revision,
    'X-Astra-Basic-Generation': generation,
    'X-Astra-Basic-Captured-At': capturedAt,
    'X-Astra-Basic-Body-SHA256': payloadSha256,
    'X-Astra-Basic-Mode': mode,
    'X-Astra-Basic-Verification': 'committed-sql-and-selected-page',
    'X-Astra-Basic-Body-Verification': 'producer-sql-attested-not-recomputed',
    'Last-Modified': new Date(capturedAt).toUTCString(),
  });
}
