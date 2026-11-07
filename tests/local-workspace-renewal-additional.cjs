const test=require('node:test');
const {fixture,good,headers,NOW,settle,assert}=require('./fixtures/local-renewal-fixture.cjs');
const turn=()=>new Promise(setImmediate);
const escape=f=>f.d.dispatchEvent(new f.w.KeyboardEvent('keydown',{key:'Escape',cancelable:true,bubbles:true}));
test('own hidden queued expiry Escape blocks visibility/online/candidate floods until explicit retry',async()=>{
 let count=0;const f=fixture({url:'http://localhost:8765/',reply:()=>++count===1?good(NOW+1000):good(NOW+28800000)});
 try{await settle(()=>f.w.AstraPrivateWorkspace.current().verified);f.hide(true);f.advance(1000);escape(f);
  for(let i=0;i<20;i++){f.online(true);f.hide(false);f.d.dispatchEvent(new f.w.CustomEvent('astraprivateworkspacecandidate'));f.hide(true);}
  f.hide(false);await turn();await turn();assert.equal(f.calls.length,1);assert.equal(f.w.AstraPrivateWorkspace.current().verified,false);
  assert.equal(f.d.body.dataset.previewControlsLocked,'true');f.d.getElementById('preview-controls-access').click();
  await settle(()=>f.w.AstraPrivateWorkspace.current().verified);assert.equal(f.calls.length,2);assert.equal(f.d.body.dataset.previewControlsLocked,undefined);
 }finally{f.close();}
});
test('own timeout retains physical slot; queued explicit retry can be escaped and late grant stays revoked',async()=>{
 let count=0,release;const f=fixture({url:'http://127.0.0.1:8765/',reply:()=>++count===1?good(NOW+1000):count===2?new Promise(r=>release=r):good(NOW+28800000)});
 try{await settle(()=>f.w.AstraPrivateWorkspace.current().verified);f.advance(1000);await settle(()=>!!release);f.advance(15000);
  await settle(()=>/unavailable/.test(f.d.querySelector('.preview-controls-access small').textContent));
  for(let i=0;i<10;i++){f.online(true);f.hide(true);f.hide(false);}await turn();assert.equal(f.calls.length,2);
  f.d.getElementById('preview-controls-access').click();assert.equal(f.calls.length,2);escape(f);
  release(good(NOW+28800000));await turn();await turn();assert.equal(f.w.AstraPrivateWorkspace.current().verified,false);
  assert.equal(f.calls.length,2);assert.equal(f.d.body.dataset.previewControlsLocked,'true');
  f.d.getElementById('preview-controls-access').click();await settle(()=>f.w.AstraPrivateWorkspace.current().verified);assert.equal(f.calls.length,3);
 }finally{release?.(good());f.close();}
});
test('own BFcache pageshow first revokes candidate and cannot restore failed authority by itself',async t=>{
 let count=0;const f=fixture({url:'http://localhost:8765/',reply:()=>++count===1?good(NOW+1000):count===2?new Response('{}',{status:401,headers:headers()}):good(NOW+28800000)});
 try{await settle(()=>f.w.AstraPrivateWorkspace.current().verified);f.advance(1000);
  await settle(()=>/could not be verified/.test(f.d.querySelector('.preview-controls-access small').textContent));
  assert.equal(f.calls.length,2);assert.equal(f.w.AstraPrivateWorkspace.current().verified,false);
  f.w.dispatchEvent(new f.w.PageTransitionEvent('pageshow',{persisted:true}));await turn();await turn();
  t.diagnostic(JSON.stringify({afterPersistedPageshow:{statusGets:f.calls.length,verified:f.w.AstraPrivateWorkspace.current().verified,
    controlsLocked:f.d.body.dataset.previewControlsLocked??false,reloads:f.reloads}}));
  assert.equal(f.calls.length,2);assert.equal(f.reloads,1);assert.equal(f.w.AstraPrivateWorkspace.current().verified,false);
  assert.equal(f.d.body.dataset.previewControlsLocked,'true');
 }finally{f.close();}
});
