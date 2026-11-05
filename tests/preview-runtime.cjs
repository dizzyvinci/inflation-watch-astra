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
 dom.window.close();console.log('PASS: preview session expiry/logout, own-cache retirement, preserved preferences and no offline fetch bypass');
})().catch(error=>{console.error(error);process.exitCode=1});
