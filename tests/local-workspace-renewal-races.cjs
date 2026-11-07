const test=require('node:test');
const {fixture,good,headers,NOW,settle,assert}=require('./fixtures/local-renewal-fixture.cjs');
const turn=()=>new Promise(setImmediate),escape=f=>f.d.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Escape',cancelable:true,bubbles:true}));
test('review downgrade during held local renewal revokes and rejects the late grant',async()=>{
 let calls=0,release;const f=fixture({url:'http://127.0.0.1:8765/',reply:()=>++calls===1?good(NOW+1000):new Promise(r=>release=r)});
 try{await settle(()=>f.w.AstraPrivateWorkspace.current().verified);f.advance(1000);await settle(()=>!!release);const r=new Response('{}',{headers:{'Content-Type':'application/json','X-Astra-Preview':'review'}});Object.defineProperty(r,'url',{value:'http://127.0.0.1:8765/version.json'});f.signal(r);release(good(NOW+28800000));await turn();await turn();assert.equal(f.w.AstraPrivateWorkspace.current().verified,false);assert.equal(f.w.AstraPrivateWorkspace.current().mode,'unknown');assert.equal(f.d.body.dataset.previewControlsLocked,'true');for(let i=0;i<5;i++)f.online(true);await turn();assert.equal(f.calls.length,2);}finally{release?.(good());f.close();}
});
test('Escape while expired renewal waits offline must cancel queued authority and control unlock',async t=>{
 let calls=0;const f=fixture({url:'http://127.0.0.1:8765/',reply:()=>++calls===1?good(NOW+1000):good(NOW+28800000)});
 try{await settle(()=>f.w.AstraPrivateWorkspace.current().verified);assert.equal(f.d.body.dataset.previewControlsLocked,undefined);f.online(false);f.advance(1000);assert.equal(f.calls.length,1);assert.equal(f.w.AstraPrivateWorkspace.current().verified,false);escape(f);f.online(true);await turn();await turn();
  t.diagnostic(JSON.stringify({afterExplicitEscapeWhileQueued:{verified:f.w.AstraPrivateWorkspace.current().verified,controlsLocked:f.d.body.dataset.previewControlsLocked??false,statusGets:f.calls.length}}));assert.equal(f.calls.length,1,'explicit Escape should cancel the queued automatic renewal');assert.equal(f.w.AstraPrivateWorkspace.current().verified,false);assert.equal(f.d.body.dataset.previewControlsLocked,'true');
 }finally{f.close();}
});
test('failed renewal from previously unlocked state must not start more automatic status reads',async t=>{
 let calls=0;const f=fixture({url:'http://127.0.0.1:8765/',reply:()=>++calls===1?good(NOW+1000):new Response('{}',{status:401,headers:headers()})});
 try{await settle(()=>f.w.AstraPrivateWorkspace.current().verified);f.advance(1000);await settle(()=>/could not be verified/.test(f.d.querySelector('.preview-controls-access small').textContent));for(let i=0;i<3;i++){f.online(true);await turn();await turn();}t.diagnostic(JSON.stringify({afterFailedRenewal:{verified:f.w.AstraPrivateWorkspace.current().verified,statusGets:f.calls.length}}));assert.equal(f.calls.length,2,'one failed local expiry continuation must not become repeated event-driven renewal');assert.equal(f.w.AstraPrivateWorkspace.current().verified,false);}finally{f.close();}
});
