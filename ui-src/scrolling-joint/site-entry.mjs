import {createPage} from './page.mjs';
import {admittedSnapshot} from './scenario-model.mjs';
import {evaluateManualScenario} from './solver/joint-economics.mjs';

(() => {
 'use strict';
 const w=window,d=document,host=d.getElementById('scrolling-lab-workspace'),nav=d.getElementById('scrolling-lab-nav'),options=d.getElementById('display-options');
 if(!host||!nav||!options||w.AstraJointScrollingPreview)return;
 let wanted=false,disposed=false,epoch=0,revision=0,page=null,pending=null;
 function workspace(){try{const descriptor=Object.getOwnPropertyDescriptor(w,'AstraPrivateWorkspace');if(!descriptor||descriptor.writable!==false||descriptor.configurable!==false)return null;const s=descriptor.value.current();const expiry=s?.expiresAt;const now=w.Date.now();return s?.verified===true&&s.mode==='private_workspace'&&Number.isSafeInteger(expiry)&&expiry>now?expiry:null;}catch{return null;}}
 function controls(){try{const p=Object.getOwnPropertyDescriptor(w,'AstraPreviewControls');if(!p||p.writable!==false||p.configurable!==false)return false;const s=p.value.current();return s?.unlocked===true&&s.viewing===false;}catch{return false;}}
 const onRoute=()=>w.location.hash==='#scrolling-lab',visible=()=>!d.hidden&&w.navigator.onLine!==false;
 const enabled=()=>wanted&&!disposed&&workspace()!==null;
 const active=()=>enabled()&&onRoute()&&visible();
 const wrap=d.createElement('div');wrap.className='scrolling-toggle-controls';wrap.dataset.previewControls='true';
 const label=d.createElement('label'),toggle=d.createElement('input');toggle.type='checkbox';toggle.id='scrolling-lab-toggle';label.append(toggle,d.createTextNode(' Private joint scrolling lab (manual, Off by default)'));wrap.append(label);options.append(wrap);
 function home(){if(onRoute()){w.history.replaceState(null,'','#index');w.dispatchEvent(new w.Event('hashchange'));}}
 function invalidate(){epoch++;revision++;page?.invalidate();}
 function withdraw(){wanted=false;invalidate();page?.clear();nav.hidden=true;host.hidden=true;toggle.checked=false;home();}
 function edit(){invalidate();}
 function guard(){if(!enabled()){withdraw();return false;}if(!onRoute()||!visible())return false;return true;}
 function mount(){if(page)return;page=createPage(host,{edit,calculate,clear(){invalidate();page.clear();},guard});}
 function sync(){if(disposed)return;const privateOk=workspace()!==null;if(!privateOk&&wanted)withdraw();const on=wanted&&privateOk;nav.hidden=!on;host.hidden=!on;toggle.checked=on;toggle.disabled=!privateOk||!controls();wrap.hidden=!privateOk||!controls();if(on){mount();page.busy(!!pending);page.pause(!active()||!!pending);}else home();}
 function setEnabled(value){if(disposed)return false;if(value===false){withdraw();sync();return true;}if(value!==true||workspace()===null||!controls())return false;wanted=true;epoch++;mount();sync();return true;}
 toggle.addEventListener('change',()=>{if(!setEnabled(toggle.checked))toggle.checked=wanted;});
 function calculate(){if(!guard()||pending)return false;const originalExpiry=workspace();if(originalExpiry===null){withdraw();return false;}let snapshot;try{snapshot=admittedSnapshot(page.read());}catch{page.invalidate();page.status('Unavailable: check explicit fields, acknowledgment, exact quote keys and 65,536-byte bounds.');return false;}
  page.invalidate();const queuedAt=w.Date.now();if(!Number.isSafeInteger(queuedAt)||queuedAt>=originalExpiry){page.status('This calculation expired before queueing. Calculate explicitly again.');sync();return false;}const task=Object.freeze({epoch,revision,originalExpiry});pending=task;page.busy(true);
  // One scheduling turn, not a timer/poller. Physical ownership lasts to finally.
  w.requestAnimationFrame(()=>{
   try{if(disposed||task.epoch!==epoch||task.revision!==revision||!active())return;
    if(w.Date.now()>=task.originalExpiry){page.status('Queued calculation expired. Calculate explicitly again under the current workspace.');return;}
    const raw=evaluateManualScenario(snapshot,{enabled:true}),result=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
    const prepared=page.prepare(result);
    // All formatting/DOM preparation finishes before closing authority and clock.
    const expiry=workspace(),now=w.Date.now();
    if(expiry===null||!Number.isSafeInteger(now)||now>=expiry){withdraw();return;}
    if(now>=task.originalExpiry){page.status('Queued calculation expired. Calculate explicitly again under the current workspace.');return;}
    if(disposed||!wanted||task.epoch!==epoch||task.revision!==revision||!onRoute()||!visible())return;
    page.reveal(prepared);
   }catch{if(!disposed&&wanted&&task.epoch===epoch)page.status('Unavailable: bounded calculation refused. No partial optimum is shown.');}
   finally{if(pending===task)pending=null;if(!disposed)sync();}
  });return true;
 }
 function pause(){invalidate();sync();}
 function state(){return Object.freeze({enabled:enabled(),mounted:!!page,pending:!!pending,active:active(),defaultEnabled:false,manualOnly:true,sourceRequests:0});}
 const api=Object.freeze({getState:state,setEnabled,clear(){if(page){invalidate();page.clear();}},dispose(){if(disposed)return;withdraw();disposed=true;wrap.remove();host.replaceChildren();}});
 Object.defineProperty(w,'AstraJointScrollingPreview',{value:api,writable:false,configurable:false});
 for(const type of ['beforeinput','paste','drop','click','submit'])host.addEventListener(type,event=>{if(!guard()){event.preventDefault();event.stopImmediatePropagation();}},true);
 for(const type of ['input','change'])host.addEventListener(type,event=>{if(!guard()){event.preventDefault();event.stopImmediatePropagation();}},true);
 d.addEventListener('astraprivateworkspace',sync);d.addEventListener('astrapreviewcontrols',sync);
 d.addEventListener('visibilitychange',pause);w.addEventListener('online',pause);w.addEventListener('offline',pause);w.addEventListener('hashchange',pause);w.addEventListener('pagehide',()=>{withdraw();sync();});sync();
})();
