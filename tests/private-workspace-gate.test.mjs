import test from'node:test';import assert from'node:assert/strict';import{gzipSync,deflateSync,brotliCompressSync}from'node:zlib';import{withPreviewGate}from'../ops/preview-gate.mjs';
const origin='https://inflation.gg',NOW=Date.now(),env={PREVIEW_ACCESS:'password',PREVIEW_PASSWORD:'synthetic-existing-password',PREVIEW_SESSION_SECRET:'synthetic-session-secret-only-at-least-32chars'};
const req=(p='/',init={})=>new Request(origin+p,init);
const html='<!doctype html><html><head><title>Kept</title></head><body class="original" data-footer="kept"><p>Kept source text</p></body></html>';
async function login(h){const r=await h(req('/__preview_login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({password:env.PREVIEW_PASSWORD,returnTo:'/'})}),env);assert.equal(r.status,303);return r.headers.get('Set-Cookie').split(';')[0];}
const status=(cookie,headers={},p='/__preview_controls')=>req(p,{headers:{Cookie:cookie,Origin:origin,'X-Astra-Controls-Status':'1',Accept:'application/json',...headers}});
function privateHeaders(r){for(const x of ['CDN-Cache-Control','Cloudflare-CDN-Cache-Control'])assert.equal(r.headers.get(x),'no-store');assert.equal(r.headers.get('Cache-Control'),'private, no-store, no-transform');assert.equal(r.headers.get('Set-Cookie'),null);assert.equal(r.headers.get('X-Astra-Preview'),'password');}
test('one existing login authorizes closed status with original expiry, no new cookie, source I/O or renewal',async()=>{
 let delegated=0,time=NOW;const h=withPreviewGate(()=>{delegated++;return new Response('kept')},{now:()=>time}),cookie=await login(h),expiry=Number(cookie.split('=')[1].split('.')[0])*1000;
 for(const elapsed of [0,3600000,8*3600000-1000]){time=NOW+elapsed;const r=await h(status(cookie),env);assert.equal(r.status,200);privateHeaders(r);assert.equal(r.headers.get('X-Astra-Workspace'),'private_workspace');assert.deepEqual(await r.json(),{unlocked:true,mode:'private_workspace',expiresAt:expiry});}
 assert.equal(delegated,0);time=expiry;const r=await h(status(cookie),env);assert.equal(r.status,401);assert.deepEqual(await r.json(),{unlocked:false});
});
test('status custom header, secure sameorigin and session binding reject CSRF, duplicates, queries and weak config',async()=>{
 const h=withPreviewGate(()=>{throw Error('no delegate')},{now:()=>NOW}),cookie=await login(h);
 for(const headers of [{Origin:'https://evil.test'},{Origin:'null'},{Origin:origin,'Sec-Fetch-Site':'cross-site'},{Origin:origin,'Sec-Fetch-Site':'same-site'}])assert.equal((await h(status(cookie,headers),env)).status,403);
 let r=status(cookie);r.headers.delete('Origin');assert.equal((await h(r,env)).status,403);r=status(cookie,{'Sec-Fetch-Site':'same-origin'});r.headers.delete('Origin');assert.equal((await h(r,env)).status,200);
 assert.equal((await h(status(cookie,{},'/__preview_controls?x=1'),env)).status,403);r=status(cookie);r.headers.delete('X-Astra-Controls-Status');assert.equal((await h(r,env)).status,405);
 assert.equal((await h(status(cookie+'; '+cookie),env)).status,401);assert.equal((await h(status(cookie+'x'),env)).status,401);assert.equal((await h(status(cookie),{...env,PREVIEW_SESSION_SECRET:'weak'})).status,503);
 r=new Request('http://inflation.gg/__preview_controls',{headers:{Cookie:cookie,Origin:'http://inflation.gg','X-Astra-Controls-Status':'1'}});assert.equal((await h(r,env)).status,403);
});
test('review mode retains old restricted GET and same password POST without cookies or new authority',async()=>{
 const review={...env,PREVIEW_ACCESS:'review'},h=withPreviewGate(()=>new Response(html,{headers:{'Content-Type':'text/html','Content-Security-Policy':"default-src 'self'",ETag:'old'}}),{now:()=>NOW});
 let r=await h(status(''),review);assert.equal(r.status,405);assert.equal(r.headers.get('Allow'),'POST');assert.equal(r.headers.get('X-Astra-Workspace'),null);assert.deepEqual(await r.json(),{unlocked:false});
 r=await h(req('/__preview_controls',{method:'POST',headers:{Origin:origin,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({password:env.PREVIEW_PASSWORD})}),review);assert.equal(r.status,200);assert.deepEqual(await r.json(),{unlocked:true});assert.equal(r.headers.get('Set-Cookie'),null);
 r=await h(req('/'),review);assert.equal(await r.text(),html);assert.equal(r.headers.get('ETag'),'old');assert.equal(r.headers.get('Content-Security-Policy'),"default-src 'self'");
});
test('authenticated HTML remains byte/header identical for identity,gzip,deflate,br; no rewrite or decompression',async()=>{
 for(const[encoding,body]of [[null,Buffer.from(html)],['gzip',gzipSync(Buffer.from(html))],['deflate',deflateSync(Buffer.from(html))],['br',brotliCompressSync(Buffer.from(html))]]){
  let accepted;const headers={'Content-Type':'text/html; charset=utf-8','Content-Length':String(body.length),ETag:'original','Content-Security-Policy':"default-src 'self'",...(encoding?{'Content-Encoding':encoding}:{})};
  const h=withPreviewGate(request=>{accepted=request.headers.get('Accept-Encoding');return new Response(body,{headers})},{now:()=>NOW}),cookie=await login(h),r=await h(req('/',{headers:{Cookie:cookie,'Accept-Encoding':'br,gzip,deflate'}}),env);privateHeaders(r);assert.equal(accepted,'br,gzip,deflate');assert.equal(r.headers.get('Content-Length'),String(body.length));assert.equal(r.headers.get('Content-Encoding'),encoding);assert.equal(r.headers.get('ETag'),'original');assert.equal(r.headers.get('Content-Security-Policy'),"default-src 'self'");assert.deepEqual(Buffer.from(await r.arrayBuffer()),body);
 }
});
