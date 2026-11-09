const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{JSDOM,VirtualConsole}=require('jsdom');
const root=path.resolve(__dirname,'..'),tick=()=>new Promise(setImmediate);
async function until(fn){for(let i=0;i<200;i++){if(fn())return;await tick();}throw Error('fixture did not settle');}
async function fixture({allowed=true,realViewer=false,hash='#index',source=null,lateClock=null}={}){
 const errors=[],calls=[],frames=[],timers=[],storage=[],clock=[Date.parse('2026-11-08T12:00:00Z')],expiry=clock[0]+3600000;
 let online=true,hidden=false,verified=allowed,unlocked=true,viewing=false;
 const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));vc.on('error',(...a)=>errors.push(a.join(' ')));
 const dom=new JSDOM(source??fs.readFileSync(path.join(root,'web/index.html'),'utf8'),{url:'http://127.0.0.1:8765/'+hash,runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc}),w=dom.window,d=w.document;
 Object.assign(w,{TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,structuredClone,ReadableStream,Headers,Response,Request,AbortController});
 w.Date.now=()=>{lateClock?.();return clock[0];};w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};w.AbortSignal.timeout=()=>undefined;
 Object.defineProperty(d,'hidden',{get:()=>hidden});Object.defineProperty(w.navigator,'onLine',{get:()=>online});
 w.requestAnimationFrame=fn=>{frames.push(fn);return frames.length;};w.cancelAnimationFrame=()=>{throw Error('must not release held frame');};
 w.setTimeout=(fn,ms)=>{timers.push({fn,ms,kind:'timeout'});return timers.length;};w.clearTimeout=()=>{};w.setInterval=(fn,ms)=>{timers.push({fn,ms,kind:'interval'});return timers.length;};w.clearInterval=()=>{};
 Object.defineProperty(w,'localStorage',{value:{getItem:()=>null,setItem:(...args)=>storage.push(args)}});Object.defineProperty(d,'cookie',{get(){throw Error('no cookies');},set(){throw Error('no cookies');}});
 const report=JSON.parse(fs.readFileSync(path.join(root,'tests/fixtures/worker-historical-report-20261104.json'),'utf8'));
 function response(body,url,headers={}){const r=new Response(JSON.stringify(body),{status:200,headers:{'Content-Type':'application/json',...headers}});Object.defineProperty(r,'url',{value:'http://127.0.0.1:8765/'+url.replace(/^\//,'')});return r;}
 w.fetch=async(url,opt)=>{calls.push({url:String(url),opt});if(url==='version.json')return response({version:'fixture',data:'data-0123456789abcdef.json'},url,{'X-Astra-Preview':'password'});if(url==='data-0123456789abcdef.json')return response(report,url,{'X-Astra-Preview':'password'});if(url==='/__preview_controls')return response({unlocked:true,mode:'private_workspace',expiresAt:expiry},url,{'Cache-Control':'private, no-store, no-transform','CDN-Cache-Control':'no-store','Cloudflare-CDN-Cache-Control':'no-store','X-Astra-Preview':'password','X-Astra-Workspace':'private_workspace'});throw Error('forbidden request '+url);};
 w.XMLHttpRequest=()=>{throw Error('no XHR');};w.Worker=()=>{throw Error('no Worker');};w.WebSocket=()=>{throw Error('no Websocket');};w.navigator.sendBeacon=()=>{throw Error('no beacon');};
 if(realViewer){d.querySelector('footer').dataset.footerPrivacyLock='on';w.eval(fs.readFileSync(path.join(root,'web/preview-runtime.js'),'utf8'));}else{
  Object.defineProperty(w,'AstraPrivateWorkspace',{value:Object.freeze({current:()=>Object.freeze({verified:verified&&clock[0]<expiry,mode:verified?'private_workspace':'unknown',expiresAt:expiry})}),writable:false,configurable:false});
  Object.defineProperty(w,'AstraPreviewControls',{value:Object.freeze({current:()=>Object.freeze({unlocked,viewing})}),writable:false,configurable:false});
 }
 for(const n of ['community.js','rolling-benchmark-preview.js','app.js'])w.eval(fs.readFileSync(path.join(root,'web',n),'utf8'));
 const baselineTimers=timers.length;w.eval(fs.readFileSync(path.join(root,'web/scrolling-preview.js'),'utf8'));assert.equal(timers.length,baselineTimers,'joint module adds no timers');
 if(realViewer)w.eval(fs.readFileSync(path.join(root,'web/viewer-preview.js'),'utf8'));
 await until(()=>d.querySelector('#main-rate').textContent!=='—'&&w.AstraJointScrollingPreview);await tick();
 const api=w.AstraJointScrollingPreview;
 function event(type,detail){d.dispatchEvent(new w.CustomEvent(type,{detail}));}
 const f={w,d,api,clock,frames,timers,calls,storage,errors,expiry,route(hash){w.history.replaceState(null,'',hash);w.dispatchEvent(new w.Event('hashchange'));},enable(){assert.equal(api.setEnabled(true),true);this.route('#scrolling-lab');},load(key='workGloves'){[...d.querySelectorAll('#scrolling-lab-workspace button')].find(b=>b.textContent.startsWith('Load Synthetic '+(key==='workGloves'?'Work Gloves':'Blue Arten'))).click();},ack(){d.querySelector('[data-field=acknowledged]').checked=true;d.querySelector('[data-field=acknowledged]').dispatchEvent(new w.Event('change',{bubbles:true}));},calculate(){d.getElementById('scrolling-calculate').click();},flush(){const fn=frames.shift();if(fn)fn(clock[0]);},revoke(){verified=false;event('astraprivateworkspace',{verified:true});},grant(){verified=true;event('astraprivateworkspace');},lock(){unlocked=false;viewing=true;event('astrapreviewcontrols',{unlocked:true,viewing:false});},unlock(){unlocked=true;viewing=false;event('astrapreviewcontrols');},hide(value){hidden=value;event('visibilitychange');},online(value){online=value;w.dispatchEvent(new w.Event(value?'online':'offline'));},edit(selector,value){const el=d.querySelector(selector);el.value=value;el.dispatchEvent(new w.Event('input',{bubbles:true}));},result(){return d.getElementById('scrolling-results')?.textContent??'';},close(){api.dispose();w.close();}};
 return f;
}
module.exports={fixture,until,tick,root,assert};
