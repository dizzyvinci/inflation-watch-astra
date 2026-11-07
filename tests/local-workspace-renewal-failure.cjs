const {fixture,good,headers,NOW,settle,assert}=require('./fixtures/local-renewal-fixture.cjs');
const turn=()=>new Promise(setImmediate);
(async()=>{let groups=0;
for(const failure of ['503','malformed','rejected']){
 let count=0;const f=fixture({url:'http://127.0.0.1:8765/',reply:()=>{
  count++;if(count===1)return good(NOW+1000);if(count>=3)return good(NOW+1000+28800000);
  if(failure==='503')return new Response('{}',{status:503,headers:headers()});
  if(failure==='malformed')return new Response('not-json',{headers:headers()});
  return Promise.reject(Error('synthetic status rejection'));
 }});
 try{
  await settle(()=>f.w.AstraPrivateWorkspace.current().verified);
  assert.equal(f.d.body.dataset.previewControlsLocked,undefined);
  f.advance(1000);await settle(()=>/could not be verified|unavailable/.test(f.d.querySelector('.preview-controls-access small').textContent));
  for(let i=0;i<20;i++){f.online(true);f.hide(true);f.hide(false);}await turn();await turn();
  assert.equal(f.calls.length,2);assert.equal(f.w.AstraPrivateWorkspace.current().verified,false);assert.equal(f.d.body.dataset.previewControlsLocked,'true');
  f.d.getElementById('preview-controls-access').click();await settle(()=>f.w.AstraPrivateWorkspace.current().verified);
  assert.equal(f.calls.length,3);assert.equal(f.d.body.dataset.previewControlsLocked,undefined);
  assert(f.calls.every(([,q])=>q.method==='GET'));assert.deepEqual(f.errors,[]);
  groups++;console.log('PASS failed local renewal '+failure+' stays blocked until explicit same-origin retry');
 }finally{f.close()}
}
console.log('TOTAL '+groups);
})().catch(error=>{console.error(error);process.exitCode=1});
