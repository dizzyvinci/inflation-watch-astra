// Temporary whole-site preview access. Secrets are runtime bindings only.
const COOKIE = '__Host-astra-preview';
const SESSION_SECONDS = 8 * 60 * 60;
const MAX_BODY = 4096;
const PREVIEW_CSS = `:root{color-scheme:dark;font-family:Segoe UI,system-ui,sans-serif;color:#edf4e7;background:#10251b}*{box-sizing:border-box}body{margin:0;min-height:100vh;min-height:100dvh;display:grid;place-items:center;padding:24px;line-height:1.6}main{width:min(100%,440px);padding:32px;background:#193526;border:1px solid #48634a;border-radius:18px;box-shadow:0 18px 60px #06130c66;text-align:center}h1{margin:0 0 12px;font-size:32px;line-height:1.2;letter-spacing:-.5px}p{margin:0 0 24px;color:#c4d6bf}form{display:grid;gap:18px}label{display:grid;gap:8px;text-align:left;font-size:16px;font-weight:600}input,button{font:inherit;font-size:18px;border-radius:9px;min-height:52px;width:100%}input{padding:12px 14px;background:#10291c;color:#fff;border:1px solid #71906b}button{padding:12px 18px;background:#b9d897;color:#152815;border:1px solid #d3e9b6;font-weight:700;cursor:pointer}button:hover{background:#cbe4ad}input:focus-visible,button:focus-visible{outline:3px solid #edc471;outline-offset:4px}small{display:block;margin-top:20px;color:#b3c8ad;font-size:13px}@media(max-width:420px){main{padding:26px 22px}h1{font-size:28px}}`;
const PREVIEW_STYLE_HASH = 'sha256-BpOjXFXviQTga1JEPFA1dr76Q48eKE71szRPsqqs//8=';
const encoder = new TextEncoder();
const bytes = value => encoder.encode(value);
const b64 = value => btoa(String.fromCharCode(...new Uint8Array(value))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function unb64(value) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(value)) return null;
  try {
    const decoded = Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='), c => c.charCodeAt(0));
    return b64(decoded) === value ? decoded : null;
  }
  catch { return null; }
}
function equal(a, b) {
  if (!a || !b || a.length !== 32 || b.length !== 32) return false;
  let difference = 0;
  for (let i = 0; i < 32; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}
const digest = async value => new Uint8Array(await crypto.subtle.digest('SHA-256', bytes(value)));
async function signature(payload, secret) {
  const key = await crypto.subtle.importKey('raw', bytes(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, bytes(payload)));
}
function bindingsReady(env) {
  return typeof env.PREVIEW_PASSWORD === 'string' && env.PREVIEW_PASSWORD.length > 0 && env.PREVIEW_PASSWORD.length <= 256 &&
    typeof env.PREVIEW_SESSION_SECRET === 'string' && env.PREVIEW_SESSION_SECRET.length >= 32 && env.PREVIEW_SESSION_SECRET.length <= 1024;
}
export function safeReturnTo(value) {
  if (typeof value !== 'string' || value.length > 2048 || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u0020\u007f]/.test(value)) return '/';
  try {
    if (/[\\\u0000-\u001f\u007f]/.test(decodeURIComponent(value))) return '/';
    const url = new URL(value, 'https://preview.invalid');
    if (url.origin !== 'https://preview.invalid' || url.pathname.startsWith('/__preview_')) return '/';
    return url.pathname + url.search + url.hash;
  } catch { return '/'; }
}
const escape = value => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
function privateHeaders() {
  return {
    'Cache-Control': 'private, no-store, no-transform',
    'CDN-Cache-Control': 'no-store', 'Cloudflare-CDN-Cache-Control': 'no-store',
    'Content-Type': 'text/html; charset=utf-8', 'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin', 'X-Robots-Tag': 'noindex, nofollow, noarchive',
    'X-Astra-Preview': 'password',
    'Content-Security-Policy': `default-src 'none'; script-src 'none'; style-src '${PREVIEW_STYLE_HASH}'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`,
  };
}
function gateResponse(request, status, message = 'Enter the preview password to continue.') {
  const url = new URL(request.url);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Private preview</title><style>${PREVIEW_CSS}</style></head><body><main aria-labelledby="preview-title"><h1 id="preview-title">Private preview</h1><p id="preview-message" role="status">${escape(message)}</p><form method="post" action="/__preview_login"><input type="hidden" name="returnTo" value="${escape(safeReturnTo(url.pathname + url.search))}"><label>Preview password <input type="password" name="password" required maxlength="256" autocomplete="current-password" aria-describedby="preview-message" autofocus></label><button type="submit">Unlock preview</button></form><small>Access lasts eight hours in this browser.</small></main></body></html>`;
  return new Response(request.method === 'HEAD' ? null : html, { status, headers: privateHeaders() });
}
async function validSession(request, secret, now) {
  const header = request.headers.get('Cookie') ?? '';
  if (header.length > 8192) return false;
  const matches = header.split(';').map(part => part.trim()).filter(part => part.startsWith(COOKIE + '='));
  if (matches.length !== 1) return false;
  const match = matches[0].slice(COOKIE.length + 1).match(/^(\d{10,11})\.([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/);
  if (!match) return false;
  const expires = Number(match[1]), seconds = Math.floor(now / 1000);
  if (expires <= seconds || expires > seconds + SESSION_SECONDS) return false;
  const payload = `${match[1]}.${match[2]}`;
  return equal(unb64(match[3]), await signature(payload, secret));
}
async function formBody(request) {
  if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/x-www-form-urlencoded') throw new Error('Invalid form');
  const length = request.headers.get('Content-Length');
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_BODY)) throw new Error('Oversized form');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Missing form');
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY) { await reader.cancel(); throw new Error('Oversized form'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const body = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return new URLSearchParams(new TextDecoder('utf-8', { fatal: true }).decode(body));
}
function sessionCookie(value, age) {
  return `${COOKIE}=${value}; Path=/; Max-Age=${age}; Secure; HttpOnly; SameSite=Strict`;
}
export function withPreviewGate(next, { now = Date.now } = {}) {
  return async function previewFetch(request, env, ctx) {
    if (env.PREVIEW_ACCESS === undefined) return next(request, env, ctx);
    if (env.PREVIEW_ACCESS !== 'password' || !bindingsReady(env)) return gateResponse(request, 503, 'Preview access is temporarily unavailable.');
    const url = new URL(request.url), time = now();
    if (url.pathname === '/__preview_login' || url.pathname === '/__preview_logout') {
      if (request.method !== 'POST') {
        const response = gateResponse(request, 405, 'Use the preview form to continue.');
        response.headers.set('Allow', 'POST'); return response;
      }
      if (url.protocol !== 'https:' || request.headers.get('Origin') !== url.origin) return gateResponse(request, 403, 'The preview form must be submitted from this site.');
      if (url.pathname === '/__preview_logout') {
        const headers = privateHeaders();
        headers.Location = '/'; headers['Set-Cookie'] = sessionCookie('', 0);
        return new Response(null, { status: 303, headers });
      }
      let form;
      try { form = await formBody(request); }
      catch { return gateResponse(request, 400, 'The preview form could not be read.'); }
      const password = form.get('password');
      if (form.getAll('password').length !== 1 || form.getAll('returnTo').length > 1 || typeof password !== 'string' || password.length > 256 ||
        !equal(await digest(password), await digest(env.PREVIEW_PASSWORD))) return gateResponse(request, 401, 'That preview password was not accepted.');
      const expires = Math.floor(time / 1000) + SESSION_SECONDS;
      const nonce = b64(crypto.getRandomValues(new Uint8Array(16)));
      const payload = `${expires}.${nonce}`;
      const headers = privateHeaders();
      headers.Location = safeReturnTo(form.get('returnTo'));
      headers['Set-Cookie'] = sessionCookie(`${payload}.${b64(await signature(payload, env.PREVIEW_SESSION_SECRET))}`, SESSION_SECONDS);
      return new Response(null, { status: 303, headers });
    }
    if (!await validSession(request, env.PREVIEW_SESSION_SECRET, time)) return gateResponse(request, 401);
    const response = await next(request, env, ctx);
    const headers = new Headers(response.headers);
    headers.set('Cache-Control', 'private, no-store, no-transform');
    headers.set('CDN-Cache-Control', 'no-store'); headers.set('Cloudflare-CDN-Cache-Control', 'no-store');
    headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
    headers.set('X-Astra-Preview', 'password');
    headers.delete('Expires');
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  };
}
