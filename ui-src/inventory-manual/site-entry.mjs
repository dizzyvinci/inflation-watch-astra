import{mountManualInventory}from'./page.mjs';
import{approvedInventoryOrigin}from'./physical-fetch.mjs';
import{validPublicEpoch}from'../../ops/api-fast-item-public-protocol.mjs';
// Tab-only intent. No storage, timers, credentials, source or automatic requests.
export function mountInventoryPreview(doc){
 const w=doc.defaultView,view=doc.getElementById('view-inventory'),host=doc.getElementById('inventory-workspace'),inactive=doc.getElementById('inventory-inactive'),note=doc.getElementById('inventory-access-note'),enable=doc.getElementById('inventory-enable-page'),nav=doc.getElementById('inventory-nav'),options=doc.getElementById('display-options');
 if(!w||!view||!host||!inactive||!note||!enable||!nav||!options)return null;
 let wanted=false,api=null,mounting=null,disposed=false,revoking=false,lastVerified=false;
 const make=(tag,text)=>{const n=doc.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
 const controls=make('div');controls.className='inventory-preview-options';controls.dataset.previewControls='manual-inventory';controls.setAttribute('role','group');controls.setAttribute('aria-label','Manual inventory workspace');
 const toggle=make('button');toggle.id='inventory-preview-toggle';toggle.type='button';toggle.setAttribute('aria-controls','view-inventory inventory-nav');
 controls.append(toggle,make('small','Off in each tab. Manual declarations only; explicit Refresh reads existing own-site cached references. No OCR or IGN lookup.'));options.append(controls);
 function verified(){try{const s=w.AstraPrivateWorkspace?.current?.();return s?.verified===true&&s.mode==='private_workspace'&&Number.isSafeInteger(s.expiresAt)&&s.expiresAt>w.Date.now()}catch{return false}}
 const onRoute=()=>w.location.hash==='#inventory',visibleOnline=()=>!doc.hidden&&w.navigator.onLine!==false;
 function desired(){return !disposed&&wanted&&onRoute()&&visibleOnline()&&verified()}
 function state(){const p=api?.state().cache;return Object.freeze({wanted,active:api?.model.enabled===true,privateWorkspaceVerified:verified(),mounted:!!api,mountPending:!!mounting,physicalPending:p?.physical.physicalPending??0,actionPending:p?.actionPending??false,cacheStatus:p?.status??'not_connected',sourceClocksRenewed:false,automaticInventoryRequests:0})}
 function draw(){const allowed=verified();toggle.textContent='Manual inventory page: '+(wanted?'On':'Off');toggle.setAttribute('aria-pressed',String(wanted));toggle.disabled=disposed||!allowed;enable.disabled=disposed||!allowed;nav.hidden=!wanted||!allowed;
  inactive.hidden=!!api&&allowed;host.hidden=!api||!allowed;
  note.textContent=!allowed?"Existing private workspace is not verified. Use the site's existing preview controls; no inventory password prompt is added.":'Manual entry is local to this tab. Enable the workspace; Refresh is a separate explicit cached-reference check.';
 }
 function resetPrivate(){if(revoking)return;revoking=true;try{wanted=false;api?.setEnabled(false);api?.clear();for(const form of host.querySelectorAll('form'))form.reset();host.hidden=true;}finally{revoking=false}}
 function transportAllowed(){const allowed=verified();if(!allowed&&!revoking&&api)resetPrivate();return allowed&&!disposed&&onRoute()&&visibleOnline()}
 function profile(){const type=doc.body.dataset.searchIdentityProfile;if(type===undefined)return{priceProfile:'legacy_dated'};if(type==='price_free_owned_membership_v2'&&validPublicEpoch(doc.body.dataset.fastItemEpoch)&&validPublicEpoch(doc.body.dataset.searchIdentityEpoch))return{priceProfile:'fast_ordered',fastEpoch:doc.body.dataset.fastItemEpoch,identityEpoch:doc.body.dataset.searchIdentityEpoch};throw Error('inventory_profile_unavailable')}
 async function ensureMounted(){if(api)return api;if(mounting)return mounting;
  mounting=mountManualInventory(host,{autoConnect:false,isAvailable:transportAllowed,onToggle:value=>{wanted=value===true&&verified();sync();}}).then(value=>{api=value;
   if(approvedInventoryOrigin(w.location.origin)){try{api.connectOwnSiteCache({origin:w.location.origin,...profile(),fetcher:(...args)=>w.fetch(...args)})}catch{api.model.setCacheState('unavailable')}}
   if(!verified())resetPrivate();else api.setEnabled(desired());draw();return api;
  }).catch(()=>{wanted=false;note.textContent='The manual workspace could not be prepared. No inventory reference was requested.';draw();return null;}).finally(()=>{mounting=null});return mounting;
 }
 function sync(){if(disposed)return;const allowed=verified();if(!allowed&&(lastVerified||api))resetPrivate();lastVerified=allowed;
  if(api)api.setEnabled(desired());else if(desired())void ensureMounted();draw();
 }
 function setEnabled(value){if(typeof value!=='boolean')throw TypeError('inventory_enabled');wanted=value&&verified()&&!disposed;sync();return state()}
 toggle.addEventListener('click',()=>setEnabled(!wanted));enable.addEventListener('click',()=>setEnabled(true));
 const guard=event=>{if(verified())return;event.preventDefault();event.stopImmediatePropagation();resetPrivate();draw()};
 const guarded=['beforeinput','paste','drop','submit','click','change'];for(const name of guarded)host.addEventListener(name,guard,true);
 const hide=()=>{resetPrivate();draw()};w.addEventListener('hashchange',sync);w.addEventListener('online',sync);w.addEventListener('offline',sync);w.addEventListener('pagehide',hide);doc.addEventListener('visibilitychange',sync);doc.addEventListener('astraprivateworkspace',sync);
 sync();return Object.freeze({getState:state,setEnabled,dispose(){if(disposed)return;resetPrivate();disposed=true;api?.dispose();w.removeEventListener('hashchange',sync);w.removeEventListener('online',sync);w.removeEventListener('offline',sync);w.removeEventListener('pagehide',hide);doc.removeEventListener('visibilitychange',sync);doc.removeEventListener('astraprivateworkspace',sync);for(const n of guarded)host.removeEventListener(n,guard,true);draw()}});
}
if(typeof document!=='undefined'&&!window.AstraInventoryPreview){const api=mountInventoryPreview(document);if(api)Object.defineProperty(window,'AstraInventoryPreview',{value:api,writable:false,configurable:false});}
