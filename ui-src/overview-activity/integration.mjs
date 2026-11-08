// One optional data view on the existing calculation cadence. No timer or storage.
import {createOverviewActivityClient} from './client.mjs';
import {createOverviewActivityPanel} from './view.mjs';
const origins=new Set(['https://inflation.gg','https://www.inflation.gg','http://127.0.0.1:8765','http://localhost:8765']);
const epoch=v=>typeof v==='string'&&/^[a-z][a-z0-9-]{0,63}$/.test(v);
export function createOverviewActivityIntegration({document:doc,window:win,parentAvailable=false,parentState,fetcher}={}){
 const origin=win.location.origin,local=origin.startsWith('http:'),marker=()=>local?[doc.body.dataset.overviewActivityProfile,doc.body.dataset.overviewActivityEnabled,doc.body.dataset.overviewActivityEpoch].join('|'):'host-profile-on-demand';
 const initial=marker(),markerReady=!local||doc.body.dataset.overviewActivityProfile==='overview_window_aggregate_v1'&&doc.body.dataset.overviewActivityEnabled==='true'&&epoch(doc.body.dataset.overviewActivityEpoch);
 const available=parentAvailable===true&&origins.has(origin)&&markerReady;
 let intent=false,blocked=false,contextChanged=false,disposed=false,working=false,queued=null,lastKey=null,receiptKey='',pausedState=false,pausedReason='paused',workspaceKey=null;
 const state=()=>{try{return parentState();}catch{return {blocked:true,reason:'parent_unavailable'};}};
 const workspaceSnapshot=()=>{try{const authority=win.AstraPrivateWorkspace;if(!authority)return {allowed:true,key:'outer-host'};const p=authority.current();return {allowed:p?.verified===true&&p.mode==='private_workspace'&&Number.isFinite(p.expiresAt)&&p.expiresAt>win.Date.now(),key:p?.mode+'|'+p?.expiresAt};}catch{return {allowed:false,key:null};}};
 const workspaceAllows=()=>{const p=workspaceSnapshot();return p.allowed&&(workspaceKey===null||p.key===workspaceKey);};
 const parentAllows=()=>{const p=state();return available&&!disposed&&!contextChanged&&marker()===initial&&p.blocked!==true&&p.reason!=='access_denied'&&workspaceAllows();};
 const visible=()=>!doc.hidden&&win.navigator.onLine!==false&&win.location.hash==='#highlights';
 const client=available?createOverviewActivityClient({origin,fetcher,isEnabled:()=>intent&&!blocked&&parentAllows()}):null;
 let panel=null,root=null,toggle=null,note=null;
 function mount(){
  if(!available||disposed||root)return;
  const host=doc.getElementById('view-highlights'),before=doc.getElementById('highlights-fact-grid');if(!host||!before||!host.contains(before))return;
  root=doc.createElement('section');root.className='overview-window-activity-integration';root.dataset.overviewActivity='optional';
  toggle=doc.createElement('button');toggle.type='button';toggle.dataset.overviewActivityToggle='';toggle.setAttribute('aria-controls','overview-window-activity-data');
  note=doc.createElement('p');note.className='small muted';note.textContent='Optional own-site window summary. It does not replace retained since-launch totals, daily histories or item evidence.';
  panel=createOverviewActivityPanel({document:doc,client:Object.freeze({...client,state:snapshot,refresh:()=>refreshOwned(true)})});panel.element.id='overview-window-activity-data';
  root.append(toggle,note,panel.element);host.insertBefore(root,before);toggle.addEventListener('click',()=>setEnabled(!intent));
 }
 function render(){mount();if(!root)return;toggle.textContent='Overview window activity: '+(intent?'On':'Off');toggle.setAttribute('aria-pressed',String(intent));toggle.disabled=!parentAllows()&&!intent;panel.render();if(contextChanged)note.textContent='Overview context changed. Reload an authenticated page before enabling this data again.';else if(blocked)note.textContent='Own-site access was withdrawn. Data is cleared; re-enable only after access is restored.';}
 function snapshot(){const value=client?.state()??{status:'off',reference:null,currentAgainstPublishedPointer:false,physicalPending:false};return blocked&&intent?{...value,status:'access_denied'}:value;}
 function withdraw(){if(!client)return;blocked=true;queued=null;lastKey=null;client.withdraw();render();}
 function checkParent(){
  if(!client||disposed)return false;
  if(marker()!==initial){contextChanged=true;withdraw();return false;}
  const p=state();if(p.blocked===true||p.reason==='access_denied'){withdraw();return false;}
  if(!workspaceAllows()){if(intent)withdraw();return false;}
  return parentAllows(); // Partial/unavailable API50 is not an auth failure.
 }
 function key(){const p=state(),v=p.evidenceSnapshot??p.snapshot;return JSON.stringify([p.checkedAt??null,v?.snapshotHash??null,v?.sources?.overview?.capturedAt??null,receiptKey]);}
 async function refreshOwned(force=false){
  if(!client||!intent||blocked||!checkParent()||!visible())return;
  const wanted=key();if(!force&&wanted===lastKey)return;
  if(working||client.state().physicalPending||client.state().quarantined){queued=wanted;return;}
  working=true;lastKey=wanted;queued=null;
  try{const task=client.refresh();render();await task;}catch{if(client.state().status==='access_denied')withdraw();}
  finally{working=false;render();if(queued!==null&&queued!==lastKey&&!client.state().physicalPending&&!client.state().quarantined){queued=null;void refreshOwned();}}
 }
 function lifetime(){
  if(!client||disposed)return;checkParent();
  const paused=!visible(),reason=doc.hidden||win.location.hash!=='#highlights'?'hidden':win.navigator.onLine===false?'offline':'paused';
  if(paused!==pausedState||paused&&reason!==pausedReason){pausedState=paused;pausedReason=reason;client.setPaused(paused,reason);}if(paused)queued=null;render();
 }
 function setEnabled(value){
  if(!client||disposed)return false;
  if(value!==true){intent=false;blocked=false;queued=null;lastKey=null;workspaceKey=null;client.setEnabled(false);render();return false;}
  if(blocked&&intent||!checkParent())return false;
  const proof=workspaceSnapshot();if(!proof.allowed)return false;workspaceKey=proof.key;blocked=false;intent=true;lastKey=null;client.setEnabled(true);lifetime();if(visible())void refreshOwned(true);return true;
 }
 function afterOwnedCheck(){if(!client||disposed)return;checkParent();lifetime();if(intent&&!blocked)void refreshOwned();}
 function receipt(event){
  // Event fields only coalesce demand; never authorize/enable or supply amounts.
  const d=event.detail,stamp=typeof d?.sourceUpdatedAt==='string'&&d.sourceUpdatedAt.length<=40&&Number.isFinite(Date.parse(d.sourceUpdatedAt))?d.sourceUpdatedAt:'';
  receiptKey=stamp;afterOwnedCheck();
 }
 function wake(){const wasPaused=client?.state().status==='paused';lifetime();if(wasPaused&&visible())lastKey=null;afterOwnedCheck();}
 function workspace(){if(!workspaceAllows())withdraw();else render();}
 doc.addEventListener('astramarkethighlightsready',render);doc.addEventListener('astramarketsnapshot',receipt);doc.addEventListener('astracalculationagetick',render);doc.addEventListener('astraprivateworkspace',workspace);doc.addEventListener('visibilitychange',wake);
 for(const name of ['online','offline','hashchange'])win.addEventListener(name,wake);
 render();
 return Object.freeze({available,setEnabled,afterOwnedCheck,observeParent(){checkParent();render();},withdraw,render,state:snapshot,dispose(){disposed=true;intent=false;queued=null;client?.dispose();panel?.dispose();root?.remove();doc.removeEventListener('astramarkethighlightsready',render);doc.removeEventListener('astramarketsnapshot',receipt);doc.removeEventListener('astracalculationagetick',render);doc.removeEventListener('astraprivateworkspace',workspace);doc.removeEventListener('visibilitychange',wake);for(const name of ['online','offline','hashchange'])win.removeEventListener(name,wake);}});
}
