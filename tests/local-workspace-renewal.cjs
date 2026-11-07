const {fixture,good,headers,NOW,settle,assert}=require('./fixtures/local-renewal-fixture.cjs');
const lock=f=>f.d.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Escape',cancelable:true,bubbles:true}));
const turn=()=>new Promise(setImmediate);
(async()=>{let groups=0;const check=(name,fn)=>{fn();groups++;console.log('PASS '+name)};

for(const url of ['http://127.0.0.1:8765/','http://localhost:8765/']){
 let calls=0;const f=fixture({url,withPresentation:true,reply:()=>++calls===1?good(NOW+1000):good(NOW+1000+28800000)});
 try{
  await settle(()=>f.w.AstraPrivateWorkspace.current().verified);lock(f);
  const warning=f.d.getElementById('source-warning');assert.equal(f.calls.length,1);
  f.advance(1000);assert.equal(f.w.AstraPrivateWorkspace.current().verified,false);
  await settle(()=>f.w.AstraPrivateWorkspace.current().verified);
  check('local expiry rechecks same-origin authority once and preserves manual controls lock '+url,()=>{
   assert.equal(f.calls.length,2);assert.equal(f.w.AstraPrivateWorkspace.current().expiresAt,NOW+1000+28800000);
   assert.equal(f.d.body.dataset.previewControlsLocked,'true');assert.equal(f.d.getElementById('review-demo-notice'),null);
   assert.equal(f.d.querySelectorAll('.review-section-cover').length,0);assert.equal(f.d.getElementById('source-warning'),warning);
   assert(f.calls.every(([path,q])=>path==='/__preview_controls'&&q.method==='GET'&&q.credentials==='same-origin'&&q.cache==='no-store'));
   assert.deepEqual(f.errors,[]);
  });
  f.advance(3000);await turn();assert.equal(f.calls.length,2);
 }finally{f.close()}
}

let calls=0,f=fixture({url:'https://inflation.gg/',reply:()=>{calls++;return good(NOW+1000)}});
try{await settle(()=>f.w.AstraPrivateWorkspace.current().verified);lock(f);f.advance(1000);await turn();
 check('remote session expiry stays revoked and makes no automatic renewal request',()=>{
  assert.equal(f.calls.length,1);assert.equal(f.w.AstraPrivateWorkspace.current().verified,false);assert.equal(f.d.body.dataset.previewControlsLocked,'true');
 });
}finally{f.close()}

calls=0;f=fixture({url:'http://127.0.0.1:8765/',reply:()=>++calls===1?good(NOW+1000):good(NOW+1000+28800000)});
try{await settle(()=>f.w.AstraPrivateWorkspace.current().verified);lock(f);f.hide(true);f.online(false);f.advance(1000);
 await turn();assert.equal(f.calls.length,1);f.hide(false);await turn();assert.equal(f.calls.length,1);
 f.online(true);await settle(()=>f.w.AstraPrivateWorkspace.current().verified);
 check('hidden and offline expiry performs no request until visible and online, then renews once',()=>{
  assert.equal(f.calls.length,2);assert.equal(f.d.body.dataset.previewControlsLocked,'true');assert.deepEqual(f.errors,[]);
 });
}finally{f.close()}

calls=0;let release;f=fixture({url:'http://127.0.0.1:8765/',reply:()=>++calls===1?good(NOW+1000):new Promise(resolve=>{release=resolve})});
try{await settle(()=>f.w.AstraPrivateWorkspace.current().verified);lock(f);f.advance(1000);await settle(()=>!!release);
 for(let i=0;i<100;i++)f.w.dispatchEvent(new f.w.Event('online'));assert.equal(f.calls.length,2);
 release(good(NOW+1000+28800000));await settle(()=>f.w.AstraPrivateWorkspace.current().verified);await turn();
 check('repeated events coalesce behind one renewal physical read and do not unlock controls',()=>{
  assert.equal(f.calls.length,2);assert.equal(f.d.body.dataset.previewControlsLocked,'true');assert.deepEqual(f.errors,[]);
 });
}finally{f.close()}

calls=0;release=null;f=fixture({url:'http://127.0.0.1:8765/',reply:()=>++calls===1?good(NOW+1000):calls===2?new Promise(resolve=>{release=resolve}):good(NOW+1000+28800000)});
try{await settle(()=>f.w.AstraPrivateWorkspace.current().verified);lock(f);f.advance(1000);await settle(()=>!!release);lock(f);
 release(good(NOW+1000+28800000));await turn();await turn();
 for(let i=0;i<10;i++)f.w.dispatchEvent(new f.w.Event('online'));await turn();
 check('explicit Escape during renewal rejects its late grant and prevents further automatic retries',()=>{
  assert.equal(f.w.AstraPrivateWorkspace.current().verified,false);assert.equal(f.calls.length,2);assert.equal(f.d.body.dataset.previewControlsLocked,'true');
 });
 f.d.getElementById('preview-controls-access').click();await settle(()=>f.w.AstraPrivateWorkspace.current().verified);
 assert.equal(f.calls.length,3);assert.equal(f.d.body.dataset.previewControlsLocked,undefined);
}finally{f.close()}

calls=0;f=fixture({url:'http://127.0.0.1:8765/',withPresentation:true,reply:()=>{
 if(++calls===1)return good(NOW+1000);return new Response('{"unlocked":false}',{status:401,headers:headers()});
}});
try{await settle(()=>f.w.AstraPrivateWorkspace.current().verified);lock(f);f.advance(1000);
 await settle(()=>/could not be verified/.test(f.d.querySelector('.preview-controls-access small').textContent));
 for(let i=0;i<10;i++)f.w.dispatchEvent(new f.w.Event('online'));await turn();
 check('failed local renewal keeps authority revoked, source covers restored, and no retry loop',()=>{
  assert.equal(f.w.AstraPrivateWorkspace.current().verified,false);assert.equal(f.d.querySelectorAll('.review-section-cover').length,2);
  assert.equal(f.d.body.dataset.previewControlsLocked,'true');assert.equal(f.calls.length,2);
  assert(!/Existing private session verified/.test(f.d.querySelector('.preview-controls-access small').textContent));
 });
}finally{f.close()}

calls=0;release=null;f=fixture({url:'http://127.0.0.1:8765/',reply:()=>++calls===1?good(NOW+1000):new Promise(resolve=>{release=resolve})});
try{await settle(()=>f.w.AstraPrivateWorkspace.current().verified);lock(f);f.advance(1000);await settle(()=>!!release);
 f.advance(15000);await settle(()=>/unavailable/.test(f.d.querySelector('.preview-controls-access small').textContent));
 for(let i=0;i<20;i++)f.w.dispatchEvent(new f.w.Event('online'));assert.equal(f.calls.length,2);
 release(good(NOW+1000+28800000));await turn();await turn();
 check('renewal timeout retains physical reservation and late completion cannot restore authority',()=>{
  assert.equal(f.w.AstraPrivateWorkspace.current().verified,false);assert.equal(f.calls.length,2);assert.equal(f.d.body.dataset.previewControlsLocked,'true');
 });
}finally{f.close()}

f=fixture({url:'http://localhost.attacker.example:8765/',reply:()=>good(NOW+1000)});
try{f.advance(300000);await turn();check('HTTP hostname lookalike cannot start or renew workspace verification',()=>{
 assert.equal(f.calls.length,0);assert.equal(f.w.AstraPrivateWorkspace.current().verified,false);
});}finally{f.close()}

console.log('TOTAL '+groups);
})().catch(error=>{console.error(error);process.exitCode=1});
