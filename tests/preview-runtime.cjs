const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');
const script=fs.readFileSync('web/preview-runtime.js','utf8');
const sw=fs.readFileSync('web/sw.js','utf8');
(async()=>{
 const dom=new JSDOM('<body><main>Market</main><footer><p>Author story</p></footer></body>',{url:'https://inflation.gg/#nx'});
 dom.window.localStorage.setItem('astra-scenery-mode','classic');
 const removed=[],unregistered=[],events={};let reloads=0;
 const registration=(name,scope,url)=>({scope,active:{scriptURL:url},unregister:async()=>unregistered.push(name)});
 const navigator={serviceWorker:{getRegistrations:async()=>[
  registration('own','https://inflation.gg/','https://inflation.gg/sw.js'),
  registration('other-script','https://inflation.gg/','https://inflation.gg/other-worker.js'),
  registration('other-scope','https://inflation.gg/other/','https://inflation.gg/sw.js')]}};
 const window={caches:{keys:async()=>['inflation-watch-shell-v1','another-app'],delete:async name=>removed.push(name)},addEventListener:(name,fn)=>events[name]=fn};
 const location={href:'https://inflation.gg/#nx',reload:()=>reloads++};
 const context={window,document:dom.window.document,navigator,location,URL,Promise};
 vm.runInNewContext(script,context);await new Promise(setImmediate);
 assert.deepEqual(removed,['inflation-watch-shell-v1']);assert.deepEqual(unregistered,['own']);
 assert.equal(dom.window.localStorage.getItem('astra-scenery-mode'),'classic');
 const response=(status,flag)=>({status,ok:status===200,headers:{get:()=>flag}});
 assert.equal(window.astraPreviewSession.onResponse(response(200,null)),true);
 assert.equal(dom.window.document.querySelectorAll('.preview-session').length,0);
 window.astraPreviewSession.onResponse(response(200,'password'));
 window.astraPreviewSession.onResponse(response(200,'password'));
 const form=dom.window.document.querySelector('.preview-session');
 assert.equal(dom.window.document.querySelectorAll('.preview-session').length,1);
 assert.equal(form.method,'post');assert.equal(form.action,'https://inflation.gg/__preview_logout');
 assert.equal(dom.window.document.querySelector('footer p').textContent,'Author story');
 window.astraPreviewSession.onResponse(response(401,'password'));
 assert.equal(reloads,1);assert.equal(dom.window.document.body.hidden,true);
 events.pageshow({persisted:true});assert.equal(reloads,2);
 const before=window.astraPreviewSession;vm.runInNewContext(script,context);assert.equal(window.astraPreviewSession,before);
 const swEvents={};let claimed=0,retired=0;const deleted=[];
 const self={addEventListener:(name,fn)=>swEvents[name]=fn,skipWaiting:async()=>{},clients:{claim:async()=>claimed++},registration:{unregister:async()=>retired++}};
 vm.runInNewContext(sw,{self,caches:{keys:async()=>['inflation-watch-shell-v1','other'],delete:async name=>deleted.push(name)},Promise});
 assert.equal(swEvents.fetch,undefined);assert.equal(swEvents.message,undefined);
 await new Promise((resolve,reject)=>swEvents.activate({waitUntil:p=>p.then(resolve,reject)}));
 assert.deepEqual(deleted,['inflation-watch-shell-v1']);assert.equal(claimed,1);assert.equal(retired,1);
 // Exact maintained IPv4 loopback HTTP origin only; no authority or network change.
 const localCases=['http://127.0.0.1:8765/#index','http://localhost:8765/#price-check'];
 const hostedCases=['https://inflation.gg/#index','https://inflation.gg/sub/index.html','http://localhost:8766/','https://localhost:8765/','http://127.0.0.1.evil.example:8765/','http://localhost.evil.example:8765/','http://[::1]:8765/'];
 function runtimeFrame(url){
  const d=new JSDOM('<body><main>Original market view</main><footer><p>Original footer</p></footer></body>',{url}),events={},seen={reload:0,candidates:0,requests:0,timers:0};
  const w={addEventListener:(name,fn)=>events[name]=fn},l={href:url,reload:()=>seen.reload++};d.window.document.addEventListener('astraprivateworkspacecandidate',()=>seen.candidates++);
  const forbidden=()=>{seen.requests++;throw Error('No new transport');};
  vm.runInNewContext(script,{window:w,document:d.window.document,navigator:{},location:l,URL,Promise,fetch:forbidden,setTimeout:()=>{seen.timers++;throw Error('No new timer');}});
  const data=(mode='password',status=200)=>({status,ok:status===200,redirected:false,url:new URL('version.json',new URL('./',url)).href,headers:{get:key=>({'content-type':'application/json; charset=utf-8','x-astra-preview':mode}[key.toLowerCase()]||null)}});
  return{d,w,events,seen,data,close:()=>d.window.close()};
 }
 for(const url of [...localCases,...hostedCases]){
  const f=runtimeFrame(url);try{
   const local=localCases.includes(url);assert.equal(f.w.astraPreviewSession.privateWorkspaceCandidate(),false);
   f.w.astraPreviewSession.onResponse(f.data(null));assert.equal(f.d.window.document.querySelectorAll('.preview-session').length,0);
   f.w.astraPreviewSession.onResponse(f.data());f.w.astraPreviewSession.onResponse(f.data());
   assert.equal(f.d.window.document.querySelectorAll('.preview-session').length,local?0:1,url);
   if(!local){const form=f.d.window.document.querySelector('.preview-session');assert.equal(form.method,'post');assert.equal(form.action,new URL('__preview_logout',new URL('./',url)).href);}
   assert.equal(f.d.window.document.querySelector('footer p').textContent,'Original footer');assert.equal(f.w.astraPreviewSession.privateWorkspaceCandidate(),true);assert.equal(f.seen.candidates,1);
   assert.equal(f.d.window.document.body.dataset.privateWorkspace,undefined,'candidate cannot confer private controls authority');
   f.events.pageshow({persisted:false});assert.equal(f.seen.reload,0);assert.equal(f.w.astraPreviewSession.onResponse(f.data('password',401)),false);assert.equal(f.seen.reload,1);assert.equal(f.d.window.document.body.hidden,true);
   f.events.pageshow({persisted:true});assert.equal(f.seen.reload,2,'local form suppression must preserve persisted-session relock');assert.equal(f.seen.requests,0);assert.equal(f.seen.timers,0);
  }finally{f.close();}
 }
 for(const url of [...localCases,'https://inflation.gg/']){
  const f=runtimeFrame(url);try{f.w.astraPreviewSession.onResponse(f.data());assert.equal(f.w.astraPreviewSession.privateWorkspaceCandidate(),true);f.w.astraPreviewSession.onResponse(f.data('review'));assert.equal(f.w.astraPreviewSession.privateWorkspaceCandidate(),false);assert.equal(f.d.window.document.querySelector('.preview-session'),null);f.events.pageshow({persisted:true});assert.equal(f.seen.reload,0,'owned review downgrade clears obsolete form/session witness');assert.equal(f.seen.requests,0);assert.equal(f.seen.timers,0);}finally{f.close();}
 }
 console.log('PASS local-loopback footer suppression: 2 maintained origins, 7 nonmatching/hosted origins, 3 review downgrades;401/bfcache/candidate preserved;0requests/timers');
 dom.window.close();console.log('PASS: preview session expiry/logout, own-cache retirement, preserved preferences and no offline fetch bypass');
})().catch(error=>{console.error(error);process.exitCode=1});
