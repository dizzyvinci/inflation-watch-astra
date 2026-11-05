import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../ops/worker.mjs';

const origin='https://inflation.gg';
const paths=['/astra-ui-0123456789abcdef.js','/astra-ui-0123456789abcdef.css','/astra-app-0123456789abcdef.js'];
const responseFor=(request,status=200)=>new Response(status===304||request.method==='HEAD'?null:'asset',{
  status,headers:{'Content-Type':request.url.endsWith('.css')?'text/css':'application/javascript','Cache-Control':'public, max-age=0, must-revalidate','ETag':'"fixture-hash"'},
});

test('content-addressed UI caches publicly for GET, HEAD and conditional responses without source/storage access',async()=>{
  let calls=0;
  for(const method of ['GET','HEAD'])for(const path of paths){
    const response=await worker.fetch(new Request(origin+path,{method}),{ASSETS:{fetch(request){calls++;return responseFor(request);}}});
    assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'public, max-age=31536000, immutable');
    assert.equal(response.headers.get('ETag'),'"fixture-hash"');assert.equal(await response.text(),method==='HEAD'?'':'asset');
  }
  const conditional=await worker.fetch(new Request(origin+paths[0]),{ASSETS:{fetch:request=>responseFor(request,304)}});
  assert.equal(conditional.status,304);assert.equal(conditional.headers.get('Cache-Control'),'public, max-age=31536000, immutable');
  assert.equal(calls,6);
});

test('unknown hashes, HTML fallback, errors and ordinary mutable files never acquire immutable cache policy',async()=>{
  for(const [path,status,type] of [[paths[0],404,'application/javascript'],[paths[0],200,'text/html'],['/app.js',200,'application/javascript'],['/astra-ui-invalid.js',200,'application/javascript']]){
    const response=await worker.fetch(new Request(origin+path),{ASSETS:{fetch:()=>new Response('fallback',{status,headers:{'Content-Type':type,'Cache-Control':'no-cache'}})}});
    assert.equal(response.headers.get('Cache-Control'),'no-cache');
  }
});

test('whole-site gate denies anonymous hash assets and keeps authenticated responses private regardless of immutable policy',async()=>{
  let assetReads=0;
  const env={PREVIEW_ACCESS:'password',PREVIEW_PASSWORD:'test-only-password',PREVIEW_SESSION_SECRET:'test-only-session-secret-with-at-least-32-characters',ASSETS:{fetch(request){assetReads++;return responseFor(request);}}};
  for(const path of paths){const response=await worker.fetch(new Request(origin+path),env);assert.equal(response.status,401);assert.match(response.headers.get('Cache-Control'),/private, no-store/);}
  assert.equal(assetReads,0);
  const login=await worker.fetch(new Request(origin+'/__preview_login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({password:env.PREVIEW_PASSWORD,returnTo:'/'})}),env);
  assert.equal(login.status,303);const cookie=login.headers.get('Set-Cookie').split(';')[0];
  for(const path of paths){const response=await worker.fetch(new Request(origin+path,{headers:{Cookie:cookie}}),env);assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'private, no-store, no-transform');assert.equal(response.headers.get('CDN-Cache-Control'),'no-store');}
  assert.equal(assetReads,3);
});
