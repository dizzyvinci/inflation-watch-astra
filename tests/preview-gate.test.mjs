import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import worker from '../ops/worker.mjs';
import { safeReturnTo, withPreviewGate } from '../ops/preview-gate.mjs';

const origin = 'https://inflation.gg';
const NOW = Date.parse('2026-11-05T08:00:00Z');
const env = { PREVIEW_ACCESS: 'password', PREVIEW_PASSWORD: 'test-only-password', PREVIEW_SESSION_SECRET: 'test-only-random-session-secret-at-least-32-characters' };
const request = (path = '/', init = {}) => new Request(origin + path, init);
function login(password = env.PREVIEW_PASSWORD, returnTo = '/data.json', headers = {}) {
  return request('/__preview_login', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded', ...headers }, body: new URLSearchParams({ password, returnTo }) });
}
const privateResponse = (response, mode = 'password') => {
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store, no-transform');
  assert.equal(response.headers.get('CDN-Cache-Control'), 'no-store');
  assert.equal(response.headers.get('Cloudflare-CDN-Cache-Control'), 'no-store');
  assert.equal(response.headers.get('X-Astra-Preview'), mode);
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

test('login page preserves same-origin form context without weakening strict Origin verification', async () => {
  const handler = withPreviewGate(() => new Response('unlocked'), { now: () => NOW });
  const page = await handler(request('/'), env);
  assert.equal(page.headers.get('Referrer-Policy'), 'same-origin');
  assert.match(await page.text(), /<form method="post" action="\/__preview_login">/);
  assert.equal((await handler(login(), env)).status, 303);
  assert.equal((await handler(login(undefined, '/', { Origin: 'null' }), env)).status, 403);
  assert.equal((await handler(login(undefined, '/', { Origin: 'https://example.com' }), env)).status, 403);
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
  assert.equal(cfg.vars.PREVIEW_ACCESS, 'review');
  assert.equal(cfg.vars.PREVIEW_PASSWORD, undefined);
  assert.equal(cfg.vars.PREVIEW_SESSION_SECRET, undefined);
});

const controlsRequest = (password, token, options = {}) => request('/__preview_controls', {
  method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded', ...(token ? { Cookie: token } : {}), ...options.headers },
  body: new URLSearchParams({ password }), ...options,
});
const controlsJson = async (response, status, unlocked = false, mode = 'password') => {
  assert.equal(response.status, status); privateResponse(response, mode);
  assert.match(response.headers.get('Content-Type'), /^application\/json/);
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(response.headers.get('Set-Cookie'), null); assert.equal(response.headers.get('Location'), null);
  assert.deepEqual(await response.json(), { unlocked });
};

test('controls require an existing session and correct existing password, with no new cookie or delegate', async () => {
  let calls = 0;
  const handler = withPreviewGate(() => { calls++; return new Response('normal'); }, { now: () => NOW });
  const token = await cookie(handler);
  await controlsJson(await handler(controlsRequest(env.PREVIEW_PASSWORD, token), env), 200, true);
  for (const password of ['incorrect-private-input', env.PREVIEW_PASSWORD.slice(0, -1), env.PREVIEW_PASSWORD + 'x', 'x'.repeat(257)]) {
    await controlsJson(await handler(controlsRequest(password, token), env), 401);
  }
  await controlsJson(await handler(controlsRequest(env.PREVIEW_PASSWORD), env), 401);
  await controlsJson(await handler(controlsRequest(env.PREVIEW_PASSWORD, token + 'x'), env), 401);
  assert.equal(calls, 0, 'Controls verification must never delegate to assets/storage or create server unlock state');
  const ordinary = await handler(request('/data.json', { headers: { Cookie: token } }), env);
  assert.equal(await ordinary.text(), 'normal'); assert.equal(calls, 1);
});

test('controls origin, HTTPS, methods and bindings fail closed as private JSON', async () => {
  const handler = withPreviewGate(() => { throw Error('Must not delegate'); }, { now: () => NOW });
  const token = await cookie(handler);
  for (const value of [null, 'null', 'https://example.com', origin + '.evil.test']) {
    const headers = { Cookie: token, 'Content-Type': 'application/x-www-form-urlencoded' };
    if (value !== null) headers.Origin = value;
    await controlsJson(await handler(request('/__preview_controls', { method: 'POST', headers, body: 'password=not-echoed' }), env), 403);
  }
  await controlsJson(await handler(new Request('http://inflation.gg/__preview_controls', { method: 'POST', headers: { Origin: 'http://inflation.gg', Cookie: token }, body: 'password=not-echoed' }), env), 403);
  for (const method of ['GET', 'PUT', 'DELETE']) {
    const response = await handler(request('/__preview_controls', { method, headers: { Cookie: token } }), env);
    assert.equal(response.headers.get('Allow'), 'POST'); await controlsJson(response, 405);
  }
  const head = await handler(request('/__preview_controls', { method: 'HEAD', headers: { Cookie: token } }), env);
  assert.equal(head.status, 405); assert.equal(head.headers.get('Allow'), 'POST'); assert.equal(await head.text(), '');
  for (const settings of [{}, { PREVIEW_ACCESS: 'password' }, { ...env, PREVIEW_SESSION_SECRET: 'weak' }]) {
    await controlsJson(await handler(controlsRequest(env.PREVIEW_PASSWORD, token), settings), 503);
  }
});

test('controls bounded form, encoding, duplicate fields and expired session cannot unlock', async () => {
  let time = NOW;
  const handler = withPreviewGate(() => { throw Error('Must not delegate'); }, { now: () => time });
  const token = await cookie(handler);
  const headers = { Origin: origin, Cookie: token, 'Content-Type': 'application/x-www-form-urlencoded' };
  for (const req of [
    request('/__preview_controls', { method: 'POST', headers, body: 'password=' + 'x'.repeat(5000) }),
    request('/__preview_controls', { method: 'POST', headers: { ...headers, 'Content-Length': '5000' }, body: 'password=private' }),
    request('/__preview_controls', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: '{"password":"private"}' }),
    request('/__preview_controls', { method: 'POST', headers, body: new Uint8Array([255, 254]) }),
  ]) await controlsJson(await handler(req, env), 400);
  await controlsJson(await handler(request('/__preview_controls', { method: 'POST', headers, body: new URLSearchParams([['password', env.PREVIEW_PASSWORD], ['password', env.PREVIEW_PASSWORD]]) }), env), 401);
  await controlsJson(await handler(request('/__preview_controls', { method: 'POST', headers, body: 'other=private' }), env), 401);
  time += 8 * 60 * 60 * 1000;
  await controlsJson(await handler(controlsRequest(env.PREVIEW_PASSWORD, token), env), 401);
});

const reviewEnv = { ...env, PREVIEW_ACCESS: 'review' };
const immutableResponse = response => {
  assert.equal(response.headers.get('Cache-Control'), 'private, max-age=31536000, immutable, no-transform');
  assert.equal(response.headers.get('CDN-Cache-Control'), 'no-store');
  assert.equal(response.headers.get('Cloudflare-CDN-Cache-Control'), 'no-store');
  assert.equal(response.headers.get('X-Astra-Preview'), 'review');
  assert.equal(response.headers.get('X-Robots-Tag'), 'noindex, nofollow, noarchive');
};
const immutableCases = [
  ['/astra-ui-0123456789abcdef.js', 'application/javascript; charset=utf-8'],
  ['/astra-app-0123456789abcdef.js', 'text/javascript'],
  ['/astra-ui-0123456789abcdef.css', 'text/css; charset=utf-8'],
  ['/data-0123456789abcdef.json', 'application/json; charset=utf-8'],
];

test('review browser caching is limited to successful typed content-addressed resources and preserves independent bodies', async () => {
  for (const [path, type] of immutableCases) {
    const handler = withPreviewGate(req => new Response(req.method === 'HEAD' ? null : 'unchanged public payload', {
      headers: { 'Content-Type': type, ETag: '"original"', Expires: 'tomorrow', Vary: 'Accept-Encoding' },
    }));
    for (const method of ['GET', 'HEAD']) {
      const responses = await Promise.all(Array.from({ length: 8 }, () => handler(request(path, { method }), reviewEnv)));
      for (const response of responses) {
        immutableResponse(response);
        assert.equal(await response.text(), method === 'HEAD' ? '' : 'unchanged public payload');
        assert.equal(response.headers.get('ETag'), '"original"');
        assert.equal(response.headers.get('Vary'), 'Accept-Encoding');
        assert.equal(response.headers.get('Expires'), null);
        assert.equal(response.headers.get('Content-Encoding'), null, 'No compression is introduced');
      }
    }
  }
});

test('review HTML, mutable/catalog paths and noncanonical hash URLs remain no-store', async () => {
  const handler = withPreviewGate(() => new Response('unchanged', { headers: { 'Content-Type': 'application/json' } }));
  for (const path of ['/', '/index.html', '/fallback.html', '/version.json', '/health.json', '/data.json', '/ui-bundles.json',
    '/analytics-config.json', '/cash-catalog.json', '/assets/cash-client-catalog-0123456789abcdef.json', '/app.js', '/style.css',
    '/astra-ui-0123456789abcde.js', '/astra-ui-0123456789abcdef0.js', '/astra-ui-0123456789ABCDEf.js',
    '/astra-ui-0123456789abcdef.js.map', '/astra-ui-0123456789abcdef.js/extra', '/astra-app-0123456789abcdef.css',
    '/data-0123456789abcdef.json?variant=unverified', '/_private/data-0123456789abcdef.json']) {
    privateResponse(await handler(request(path), reviewEnv), 'review');
  }
  privateResponse(await handler(request('/data-0123456789abcdef.json', { method: 'POST' }), reviewEnv), 'review');
});

test('hash-shaped fallbacks, wrong MIME, cookies and every unmatched status retain review no-store', async () => {
  for (const [path] of immutableCases) {
    for (const type of ['text/html', 'application/octet-stream', 'application/problem+json', '']) {
      const handler = withPreviewGate(() => new Response('fallback', { headers: type ? { 'Content-Type': type } : {} }));
      privateResponse(await handler(request(path), reviewEnv), 'review');
    }
  }
  for (const [path, type] of immutableCases) {
    for (const cookieValue of ['private=value; HttpOnly', '']) {
      const handler = withPreviewGate(() => new Response('not shared', { headers: { 'Content-Type': type, 'Set-Cookie': cookieValue } }));
      const response = await handler(request(path), reviewEnv);
      privateResponse(response, 'review'); assert.equal(response.headers.get('Set-Cookie'), cookieValue);
    }
    for (const status of [201, 204, 206, 301, 302, 304, 400, 401, 403, 404, 429, 500, 503]) {
      const handler = withPreviewGate(() => new Response([204, 304].includes(status) ? null : 'retained status', { status, headers: { 'Content-Type': type, ETag: '"same"' } }));
      const response = await handler(request(path, { headers: { 'If-None-Match': '"same"' } }), reviewEnv);
      assert.equal(response.status, status); privateResponse(response, 'review');
    }
  }
});

test('password mode never enables immutable browser caching even after valid authentication', async () => {
  for (const [path, type] of immutableCases) {
    const handler = withPreviewGate(req => new Response(req.method === 'HEAD' ? null : 'authorized only', { headers: { 'Content-Type': type } }), { now: () => NOW });
    const token = await cookie(handler);
    for (const method of ['GET', 'HEAD']) {
      const response = await handler(request(path, { method, headers: { Cookie: token } }), env);
      privateResponse(response); assert.equal(response.status, 200);
      assert.equal((await handler(request(path, { method }), env)).status, 401);
    }
  }
});

test('review phase1 leaves existing gzip bytes, encoding, variation and validators unchanged', async () => {
  const compressed = gzipSync('public immutable content');
  const handler = withPreviewGate(() => new Response(compressed, { headers: {
    'Content-Type': 'application/javascript', 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding', ETag: 'W/"encoded"',
  } }));
  const response = await handler(request('/astra-ui-0123456789abcdef.js', { headers: { 'Accept-Encoding': 'gzip' } }), reviewEnv);
  immutableResponse(response);
  assert.equal(response.headers.get('Content-Encoding'), 'gzip');
  assert.equal(response.headers.get('Vary'), 'Accept-Encoding');
  assert.equal(response.headers.get('ETag'), 'W/"encoded"');
  assert.deepEqual(new Uint8Array(await response.arrayBuffer()), new Uint8Array(compressed));
});
test('review mode serves pages and assets without a cookie while preserving response and private review headers', async () => {
  const calls = [];
  const handler = withPreviewGate(req => {
    calls.push(new URL(req.url).pathname);
    return new Response(req.method === 'HEAD' ? null : 'public review content', { headers: {
      'Content-Type': 'application/octet-stream', ETag: '"review-asset"',
      'Cache-Control': 'public, max-age=31536000', Expires: 'tomorrow',
    } });
  }, { now: () => NOW });
  for (const path of ['/', '/index.html', '/style.css', '/assets/fredrick.png', '/data.json']) {
    const response = await handler(request(path), reviewEnv);
    assert.equal(response.status, 200); privateResponse(response, 'review');
    assert.equal(await response.text(), 'public review content');
    assert.equal(response.headers.get('Content-Type'), 'application/octet-stream');
    assert.equal(response.headers.get('ETag'), '"review-asset"');
    assert.equal(response.headers.get('Expires'), null);
    assert.equal(response.headers.get('Set-Cookie'), null);
    assert.equal(response.headers.get('X-Robots-Tag'), 'noindex, nofollow, noarchive');
    assert.equal(response.headers.get('Content-Security-Policy'), null, 'Do not apply the password-form CSP to the app');
  }
  const head = await handler(request('/style.css', { method: 'HEAD' }), reviewEnv);
  assert.equal(await head.text(), ''); privateResponse(head, 'review');
  assert.equal(calls.length, 6);
});

test('review controls need the existing password but no site cookie and never delegate or create credentials', async () => {
  const handler = withPreviewGate(() => { throw Error('Controls must not delegate'); }, { now: () => NOW });
  await controlsJson(await handler(controlsRequest(env.PREVIEW_PASSWORD), reviewEnv), 200, true, 'review');
  await controlsJson(await handler(controlsRequest(env.PREVIEW_PASSWORD, 'malformed-cookie'), reviewEnv), 200, true, 'review');
  for (const password of ['do-not-echo-input', env.PREVIEW_PASSWORD.slice(0, -1), env.PREVIEW_PASSWORD + 'x', 'x'.repeat(257)]) {
    await controlsJson(await handler(controlsRequest(password), reviewEnv), 401, false, 'review');
  }
  const headers = { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' };
  for (const body of ['other=value', `password=${env.PREVIEW_PASSWORD}&password=${env.PREVIEW_PASSWORD}`]) {
    await controlsJson(await handler(request('/__preview_controls', { method: 'POST', headers, body }), reviewEnv), 401, false, 'review');
  }
});

test('public review controls still enforce HTTPS, exact Origin, methods and bounded forms', async () => {
  const handler = withPreviewGate(() => { throw Error('Controls must not delegate'); });
  const headers = { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' };
  for (const source of [undefined, 'null', 'https://example.com', origin + '.evil.test']) {
    const supplied = { ...headers }; if (source === undefined) delete supplied.Origin; else supplied.Origin = source;
    await controlsJson(await handler(request('/__preview_controls', { method: 'POST', headers: supplied, body: 'password=private' }), reviewEnv), 403, false, 'review');
  }
  await controlsJson(await handler(new Request('http://inflation.gg/__preview_controls', { method: 'POST', headers: { ...headers, Origin: 'http://inflation.gg' }, body: 'password=private' }), reviewEnv), 403, false, 'review');
  for (const method of ['GET', 'PUT', 'DELETE']) {
    const response = await handler(request('/__preview_controls', { method }), reviewEnv);
    assert.equal(response.headers.get('Allow'), 'POST'); await controlsJson(response, 405, false, 'review');
  }
  const head = await handler(request('/__preview_controls', { method: 'HEAD' }), reviewEnv);
  assert.equal(head.status, 405); assert.equal(head.headers.get('Allow'), 'POST');
  assert.equal(await head.text(), ''); privateResponse(head, 'review');
  for (const req of [
    request('/__preview_controls', { method: 'POST', headers, body: 'password=' + 'x'.repeat(5000) }),
    request('/__preview_controls', { method: 'POST', headers: { ...headers, 'Content-Length': '5000' }, body: 'password=private' }),
    request('/__preview_controls', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: '{}' }),
    request('/__preview_controls', { method: 'POST', headers, body: new Uint8Array([255, 254]) }),
  ]) await controlsJson(await handler(req, reviewEnv), 400, false, 'review');
});

test('review missing or invalid bindings fail closed before public delegate or controls verification', async () => {
  const handler = withPreviewGate(() => { throw Error('Invalid configuration must not delegate'); });
  for (const settings of [{ PREVIEW_ACCESS: 'review' }, { ...reviewEnv, PREVIEW_PASSWORD: '' }, { ...reviewEnv, PREVIEW_SESSION_SECRET: 'weak' }]) {
    const page = await handler(request('/'), settings);
    assert.equal(page.status, 503); privateResponse(page, 'review');
    assert.doesNotMatch(await page.text(), /test-only-password|test-only-random/);
    await controlsJson(await handler(controlsRequest(env.PREVIEW_PASSWORD), settings), 503, false, 'review');
  }
});
