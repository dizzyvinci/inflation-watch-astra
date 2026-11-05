// Optional production edge wrapper, supplied for review only. Not deployed.
export default {
  async fetch(request, env, ctx) {
    if (!env.ORIGIN) return new Response('Origin not configured', { status: 503 });
    const incoming = new URL(request.url);
    const origin = new URL(env.ORIGIN);
    if (origin.protocol !== 'https:' || origin.host === incoming.host) {
      return new Response('Invalid origin configuration', { status: 503 });
    }
    if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405 });
    const target = new URL(incoming.pathname + incoming.search, origin);
    const cache = caches.default;
    const cacheKey = new Request(incoming.toString(), { method: 'GET' });
    try {
      const response = await fetch(target, { method: request.method, signal: AbortSignal.timeout(5000), redirect: 'follow' });
      if (!response.ok && response.status >= 500) throw new Error('Origin unavailable');
      if (response.status === 200 && request.method === 'GET' && !response.headers.has('Set-Cookie')) {
        const stored = new Response(response.clone().body, response);
        stored.headers.set('Cache-Control', 'public, max-age=86400');
        stored.headers.set('X-Inflation-Origin-Fetched', new Date().toISOString());
        ctx.waitUntil(cache.put(cacheKey, stored));
      }
      return response;
    } catch {
      const previous = await cache.match(cacheKey);
      if (previous) {
        const result = new Response(previous.body, previous);
        result.headers.set('Warning', '110 - "Response is stale"');
        result.headers.set('X-Inflation-Fallback', 'cached-origin');
        result.headers.set('Cache-Control', 'public, max-age=60');
        return result;
      }
      // Navigation gets the last cached lightweight page. Missing assets remain 503.
      if (request.headers.get('Accept')?.includes('text/html')) {
        const fallback = await cache.match(new Request(new URL('/fallback.html', incoming).toString()));
        if (fallback) return new Response(fallback.body, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=60', 'X-Inflation-Fallback': 'lightweight-snapshot' } });
      }
      return new Response('Market snapshot temporarily unavailable. Please retry shortly.', { status: 503, headers: { 'Retry-After': '60', 'Cache-Control': 'no-store' } });
    }
  }
};
