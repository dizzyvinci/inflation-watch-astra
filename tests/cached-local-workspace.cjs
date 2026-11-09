const{fixture,good,headers,settle,assert}=require('./fixtures/local-renewal-fixture.cjs');
const turn=()=>new Promise(setImmediate);
function cached(f,{url='version.json',status=200,type='application/json',mode=null,redirected=false}={}){
 const r=new Response(status===304?null:'{}',{status,headers:{'Content-Type':type,...(mode?{'X-Astra-Preview':mode}:{})}});Object.defineProperty(r,'url',{value:new URL(url,f.w.location.href).href});Object.defineProperty(r,'redirected',{value:redirected});return r;
}
(async()=>{let groups=0;
 for(const url of ['http://127.0.0.1:8765/','http://localhost:8765/']){
  let release;const f=fixture({candidate:false,url,withPresentation:true,reply:()=>new Promise(resolve=>{release=resolve})});
  try{f.signal(cached(f));const observed={url,candidate:f.w.astraPreviewSession.privateWorkspaceCandidate(),statusRequests:f.calls.length,verified:f.w.AstraPrivateWorkspace.current().verified};console.log(JSON.stringify({cachedRevalidated200NoHeader:observed}));assert.equal(observed.candidate,true,'maintained local cached200 should hint existing status authority');assert.equal(observed.statusRequests,1);assert.equal(observed.verified,false,'hint is not authority');assert(f.d.getElementById('review-demo-notice'));release(good());await settle(()=>f.w.AstraPrivateWorkspace.current().verified);assert.equal(f.d.getElementById('review-demo-notice'),null);assert.equal(f.calls.length,1);assert.equal(f.d.body.dataset.previewControlsLocked,undefined);assert.deepEqual(f.errors,[]);const restore=new f.w.Event('pageshow');Object.defineProperty(restore,'persisted',{value:true});f.w.dispatchEvent(restore);assert.equal(f.reloads,1);assert.equal(f.w.AstraPrivateWorkspace.current().verified,false);assert.equal(f.calls.length,1);groups++;}finally{f.close();}
 }
 for(const url of ['https://inflation.gg/','http://localhost:8766/','https://localhost:8765/','http://localhost.evil.example:8765/']){
  const f=fixture({candidate:false,url});try{f.signal(cached(f));await turn();assert.equal(f.calls.length,0);assert.equal(f.w.astraPreviewSession.privateWorkspaceCandidate(),false);assert.equal(f.w.AstraPrivateWorkspace.current().verified,false);groups++;}finally{f.close();}
 }
 for(const options of [{url:'unknown.json'},{url:'version.json?x=1'},{url:'https://foreign.invalid/version.json'},{type:'text/html'},{status:201},{status:304},{mode:'review'},{redirected:true}]){
  const f=fixture({candidate:false,url:'http://127.0.0.1:8765/'});try{f.signal(cached(f,options));await turn();assert.equal(f.calls.length,0);assert.equal(f.w.AstraPrivateWorkspace.current().verified,false);groups++;}finally{f.close();}
 }
 for(const reply of [()=>new Response('{"unlocked":false}',{status:401,headers:headers()}),()=>new Response('{"unlocked":true}',{headers:headers()})]){
  const f=fixture({candidate:false,url:'http://127.0.0.1:8765/',reply,withPresentation:true});try{f.signal(cached(f));await turn();await turn();assert.equal(f.calls.length,1);assert.equal(f.w.AstraPrivateWorkspace.current().verified,false);assert.equal(f.d.body.dataset.previewControlsLocked,'true');assert(f.d.getElementById('review-demo-notice'));groups++;}finally{f.close();}
 }
 console.log('PASS cached local candidate '+groups+' bounded cases; status remains sole authority; no actual network');
})().catch(e=>{console.error(e);process.exitCode=1;});
