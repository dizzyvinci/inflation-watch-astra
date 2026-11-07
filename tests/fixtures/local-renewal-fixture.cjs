const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{JSDOM,VirtualConsole}=require('jsdom');
const root=path.resolve(__dirname,'../..'),source=fs.readFileSync(path.join(root,'web/viewer-preview.js'),'utf8'),presentation=fs.readFileSync(path.join(root,'web/review-section-covers.js'),'utf8');
const runtimeSource=fs.readFileSync(path.join(root,'web/preview-runtime.js'),'utf8');
const NOW=Date.now();const baseHtml='<main><details id="display-options"><summary>Options</summary><input id="kept" value="retained"></details><aside id="review-demo-notice" class="review-demo-notice">{DRAFT} Demo values</aside><section id="view-method"><p id="source-warning">Original source warning</p></section><section id="view-market-comparison"><p>Preserved compare</p></section></main><footer data-footer-privacy-lock="on"><p id="footer-source">Original credits/privacy</p></footer>';
const headers=()=>({'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store, no-transform','CDN-Cache-Control':'no-store','Cloudflare-CDN-Cache-Control':'no-store','X-Astra-Preview':'password','X-Astra-Workspace':'private_workspace'});
const good=(expiresAt=NOW+28800000)=>new Response(JSON.stringify({unlocked:true,mode:'private_workspace',expiresAt}),{headers:headers()});
function fixture({candidate=true,url='https://inflation.gg/',reply=()=>good(),withPresentation=false,markup=baseHtml,earlyCandidate=false}={}){
 const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));const dom=new JSDOM(markup,{url,runScripts:'outside-only',pretendToBeVisual:true,virtualConsole:vc}),w=dom.window,d=w.document,calls=[];let clock=NOW,hidden=false,online=true,id=0,reloads=0;const timers=new Map();
 Object.defineProperty(d,'hidden',{get:()=>hidden});Object.defineProperty(w.navigator,'onLine',{get:()=>online});w.Date.now=()=>clock;w.TextDecoder=TextDecoder;w.TextEncoder=TextEncoder;w.AbortController=AbortController;
 w.setTimeout=(fn,delay)=>{const n=++id;timers.set(n,{fn,at:clock+delay});return n};w.clearTimeout=n=>timers.delete(n);w.fetch=(...a)=>{calls.push(a);return reply(...a)};
 for(const k of ['localStorage','sessionStorage'])Object.defineProperty(w,k,{get(){throw Error('No storage')}});Object.defineProperty(d,'cookie',{get(){throw Error('No browser cookie extraction')},set(){throw Error('No browser cookies')}});
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'))};
 vm.runInNewContext(runtimeSource,{window:w,document:d,navigator:w.navigator,location:{href:url,reload:()=>reloads++},URL,Promise});
 const signal=response=>w.astraPreviewSession.onResponse(response);
 const dataResponse=()=>{const r=new Response('{}',{headers:{'Content-Type':'application/json','X-Astra-Preview':'password'}});Object.defineProperty(r,'url',{value:new URL('version.json',url).href});return r;};
 if(candidate&&earlyCandidate)signal(dataResponse());
 if(withPresentation)w.eval(presentation);w.eval(source);
 if(candidate&&!earlyCandidate)signal(dataResponse());
 return{w,d,calls,errors,timers,signal,dataResponse,get reloads(){return reloads},advance(ms){clock+=ms;for(let rounds=0;rounds<30;rounds++){const due=[...timers].filter(([,t])=>t.at<=clock);if(!due.length)return;for(const[n,t]of due){timers.delete(n);t.fn()}}throw Error('timer loop')},hide(v){hidden=v;d.dispatchEvent(new w.Event('visibilitychange'))},online(v){online=v;w.dispatchEvent(new w.Event(v?'online':'offline'))},close(){timers.clear();w.close()}};
}
const settle=async predicate=>{for(let i=0;i<250;i++){if(predicate())return;await new Promise(setImmediate)}assert(predicate(),'state did not settle')};

module.exports={fixture,good,headers,NOW,settle,assert};
