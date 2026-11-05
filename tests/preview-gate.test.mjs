import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import worker from '../ops/worker.mjs';
import { safeReturnTo, withPreviewGate } from '../ops/preview-gate.mjs';

const origin = 'https://inflation.gg';
const NOW = Date.parse('2026-11-05T08:00:00Z');
const env = { PREVIEW_ACCESS: 'password', PREVIEW_PASSWORD: 'test-only-password', PREVIEW_SESSION_SECRET: 'test-only-random-session-secret-at-least-32-characters' };
const request = (path = '/', init = {}) => new Request(origin + path, init);
function login(password = env.PREVIEW_PASSWORD, returnTo = '/data.json', headers = {}) {
  return request('/__preview_login', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded', ...headers }, body: new URLSearchParams({ password, returnTo }) });
}
const privateResponse = response => {
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store, no-transform');
  assert.equal(response.headers.get('CDN-Cache-Control'), 'no-store');
  assert.equal(response.headers.get('Cloudflare-CDN-Cache-Control'), 'no-store');
  assert.equal(response.headers.get('X-Astra-Preview'), 'password');
};
async function cookie(handler, overrides = env) {
  const response = await handler(login(), overrides);
  assert.equal(response.status, 303);
  return response.headers.get('Set-Cookie').split(';')[0];
}

test('every unauthenticated route and both hosts stop before assets/storage/cache', async () => {
  let reads = 0;
  const guarded = { ...env, ASSETS: { fetch() { reads++; throw new Error('Must be protected'); } }, SNAPSHOTS: { get() { reads++; throw new Error('Must be protected'); } } };
  for (const host of [origin, 'https://inflation-watch-astra.dizzyvinci.workers.dev']) {
    for (const path of ['/', '/index.html', '/fallback.html', '/style.css', '/assets/fredrick.png', '/version.json', '/data.json', '/data-1234567890abcdef.json', '/health.json', '/_private/collector-state.json', '/missing']) {
      const response = await worker.fetch(new Request(host + path), guarded);
      assert.equal(response.status, 401, path); privateResponse(response);
      const text = await response.text();
      assert.match(text, /Private preview/); assert.doesNotMatch(text, /<script|<img|cloudflareinsights|data-cf-beacon/i);
      assert.match(response.headers.get('Content-Security-Policy'), /script-src 'none'/);
    }
  }
  assert.equal(reads, 0);
});

test('flag missing preserves normal handler; unknown/missing/weak bindings fail closed', async () => {
  let calls = 0;
  const handler = withPreviewGate(() => { calls++; return new Response('normal'); });
  assert.equal(await (await handler(request(), {})).text(), 'normal');
  for (const settings of [{ PREVIEW_ACCESS: 'password' }, { ...env, PREVIEW_PASSWORD: '' }, { ...env, PREVIEW_SESSION_SECRET: 'weak' }, { ...env, PREVIEW_ACCESS: 'typo' }]) {
    const response = await handler(request(), settings);
    assert.equal(response.status, 503); privateResponse(response);
    assert.doesNotMatch(await response.text(), /test-only-password|session-secret/);
  }
  assert.equal(calls, 1);
});

test('valid login signs eight-hour secure host cookie and sanitized redirect', async () => {
  const handler = withPreviewGate(() => new Response('unlocked'), { now: () => NOW });
  const response = await handler(login(undefined, '/?item=123#basket'), env);
  assert.equal(response.status, 303); privateResponse(response);
  assert.equal(response.headers.get('Location'), '/?item=123#basket');
  const header = response.headers.get('Set-Cookie');
  assert.match(header, /^__Host-astra-preview=\d+\.[\w-]{22}\.[\w-]{43}; Path=\/; Max-Age=28800; Secure; HttpOnly; SameSite=Strict$/);
  assert.doesNotMatch(header, /Domain=|test-only-password/);
  const unlocked = await handler(request('/assets/fredrick.png', { headers: { Cookie: header.split(';')[0] } }), env);
  assert.equal(await unlocked.text(), 'unlocked'); privateResponse(unlocked);
});

test('centered green login style is authorized by its exact CSP hash without script or external requests', async () => {
  const handler = withPreviewGate(() => { throw new Error('Not unlocked'); });
  const response = await handler(request(), env);
  const html = await response.text();
  const styles = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)];
  assert.equal(styles.length, 1);
  const hash = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(styles[0][1]))).toString('base64');
  const csp = response.headers.get('Content-Security-Policy');
  assert.ok(csp.includes(`style-src 'sha256-${hash}'`));
  assert.ok(csp.includes("script-src 'none'"));
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|https?:|\*/);
  assert.match(styles[0][1], /place-items:center/);
  assert.match(styles[0][1], /min-height:52px/);
  assert.match(html, /<main aria-labelledby="preview-title">/);
  assert.doesNotMatch(html, /<script|<img|<link|style=/i);
});

test('wrong password and password-prefix are rejected without echoing input', async () => {
  const handler = withPreviewGate(() => { throw new Error('Not unlocked'); });
  for (const password of ['bad-password-do-not-echo', env.PREVIEW_PASSWORD.slice(0, -1), env.PREVIEW_PASSWORD + 'x']) {
    const response = await handler(login(password), env);
    assert.equal(response.status, 401); privateResponse(response);
    assert.ok(!(await response.text()).includes(password));
    assert.equal(response.headers.get('Set-Cookie'), null);
  }
});

test('cross-origin/missing-origin/insecure login and logout requests are rejected', async () => {
  const handler = withPreviewGate(() => new Response('unlocked'));
  for (const path of ['/__preview_login', '/__preview_logout']) {
    for (const source of [null, 'https://example.com', 'null', 'https://inflation.gg.evil.test']) {
      const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
      if (source !== null) headers.Origin = source;
      const response = await handler(request(path, { method: 'POST', headers, body: 'password=test' }), env);
      assert.equal(response.status, 403); privateResponse(response);
    }
    const response = await handler(new Request('http://inflation.gg' + path, { method: 'POST', headers: { Origin: 'http://inflation.gg' }, body: 'password=test' }), env);
    assert.equal(response.status, 403);
  }
});

test('body/content-type/duplicate-password limits do not unlock', async () => {
  const handler = withPreviewGate(() => { throw new Error('Not unlocked'); });
  for (const req of [login('x'.repeat(5000)), login(undefined, '/', { 'Content-Length': '5000' }), login(undefined, '/', { 'Content-Type': 'application/json' }), request('/__preview_login', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' }, body: `password=${env.PREVIEW_PASSWORD}&password=${env.PREVIEW_PASSWORD}` })]) {
    const response = await handler(req, env);
    assert.ok([400, 401].includes(response.status)); privateResponse(response);
  }
});

test('tampering, expiry, duplicate cookies and secret rotation reject sessions', async () => {
  let time = NOW;
  const handler = withPreviewGate(() => new Response('unlocked'), { now: () => time });
  const valid = await cookie(handler);
  const [name, token] = valid.split('=');
  const parts = token.split('.');
  const signature = parts[2];
  const modified = `${name}=${parts[0]}.${parts[1]}.${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`;
  for (const value of [modified, `${name}=${Number(parts[0]) + 1}.${parts[1]}.${signature}`, valid + '; ' + valid, valid + 'x']) {
    assert.equal((await handler(request('/', { headers: { Cookie: value } }), env)).status, 401);
  }
  assert.equal((await handler(request('/', { headers: { Cookie: valid } }), { ...env, PREVIEW_SESSION_SECRET: 'rotated-test-only-secret-32-characters-minimum' })).status, 401);
  time += 8 * 60 * 60 * 1000;
  assert.equal((await handler(request('/', { headers: { Cookie: valid } }), env)).status, 401);
});

test('authorized bodies, status and etags survive independently with public caching removed', async () => {
  const handler = withPreviewGate(req => new Response(req.method === 'HEAD' ? null : 'original payload', { headers: { ETag: '"abc"', 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=31536000, immutable', Expires: 'tomorrow' } }), { now: () => NOW });
  const token = await cookie(handler);
  const responses = await Promise.all(Array.from({ length: 20 }, () => handler(request('/data.json', { headers: { Cookie: token } }), env)));
  for (const response of responses) {
    assert.equal(await response.text(), 'original payload'); privateResponse(response);
    assert.equal(response.headers.get('ETag'), '"abc"'); assert.equal(response.headers.get('Content-Type'), 'application/json');
    assert.equal(response.headers.get('Expires'), null);
  }
  const head = await handler(request('/data.json', { method: 'HEAD', headers: { Cookie: token } }), env);
  assert.equal(await head.text(), ''); privateResponse(head);
  const unauthorizedHead = await handler(request('/data.json', { method: 'HEAD' }), env);
  assert.equal(unauthorizedHead.status, 401); assert.equal(await unauthorizedHead.text(), '');
});

test('logout expires cookie and auth endpoints reject GET', async () => {
  const handler = withPreviewGate(() => new Response('normal'));
  const response = await handler(request('/__preview_logout', { method: 'POST', headers: { Origin: origin } }), env);
  assert.equal(response.status, 303); privateResponse(response);
  assert.match(response.headers.get('Set-Cookie'), /Max-Age=0; Secure; HttpOnly; SameSite=Strict/);
  for (const path of ['/__preview_login', '/__preview_logout']) assert.equal((await handler(request(path), env)).status, 405);
});

test('return paths cannot redirect outside host or inject headers/markup', () => {
  for (const value of ['https://evil.test', '//evil.test', '/\\evil.test', '/%5cevil.test', '/%0d%0aLocation:evil', '/__preview_login', '/a b', null]) assert.equal(safeReturnTo(value), '/');
  assert.equal(safeReturnTo('/?a=1&b=2#cash'), '/?a=1&b=2#cash');
});

test('deployment routes every asset through the gate and contains no secret values', () => {
  const cfg = JSON.parse(readFileSync(new URL('../ops/wrangler.jsonc', import.meta.url), 'utf8'));
  assert.equal(cfg.assets.run_worker_first, true);
  assert.equal(cfg.vars.PREVIEW_ACCESS, 'password');
  assert.equal(cfg.vars.PREVIEW_PASSWORD, undefined);
  assert.equal(cfg.vars.PREVIEW_SESSION_SECRET, undefined);
});
