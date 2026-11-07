(() => {
  'use strict';
  const options = document.getElementById('display-options');
  if (!options || document.getElementById('viewer-preview-enter')) return;
  const footer=document.querySelector('footer'),passwordMode=footer?.dataset.footerPrivacyLock==='on';
  let controlsUnlocked=!passwordMode;
  let workspaceExpiresAt=null,workspaceMode='unknown';
  const workspaceCurrent=()=>{const verified=Number.isSafeInteger(workspaceExpiresAt)&&workspaceExpiresAt>Date.now();return Object.freeze({mode:verified?'private_workspace':workspaceMode==='review'?'review':'unknown',verified,expiresAt:verified?workspaceExpiresAt:null});};
  Object.defineProperty(window,'AstraPrivateWorkspace',{value:Object.freeze({current:workspaceCurrent}),writable:false,configurable:false});
  const publishWorkspace=()=>{const state=workspaceCurrent();if(state.verified)document.body.dataset.privateWorkspace='verified';else delete document.body.dataset.privateWorkspace;document.dispatchEvent(new CustomEvent('astraprivateworkspace',{detail:state}));};

  const entry = document.createElement('div'); entry.className = 'viewer-preview-entry';
  const enter = document.createElement('button'); enter.type = 'button'; enter.id = 'viewer-preview-enter';
  enter.textContent = 'Viewer preview'; enter.setAttribute('aria-controls', 'display-options');
  enter.setAttribute('aria-describedby', 'viewer-preview-description');
  const description = document.createElement('small'); description.id = 'viewer-preview-description';
  description.textContent = 'Hide design controls while keeping the currently selected design.';
  entry.append(enter, description); options.before(entry);

  const exit = document.createElement('button'); exit.type = 'button'; exit.id = 'viewer-preview-exit';
  exit.className = 'viewer-preview-exit'; exit.textContent = 'Exit viewer preview · Esc'; exit.hidden = true;
  exit.title = 'Return to editing. Design choices and privacy settings stay unchanged.';
  document.body.append(exit);
  let viewing = false, previousFocus = null;

  function setViewer(enabled,focus=true) {
    if(!enabled&&!controlsUnlocked)return;
    if (enabled === viewing) return;
    viewing = enabled;
    if (enabled) {
      previousFocus = document.activeElement && document.activeElement !== document.body ? document.activeElement : enter;
      document.body.dataset.viewerPreview = 'on'; entry.hidden = true; exit.hidden = false;
      if(focus)exit.focus({ preventScroll: true });
    } else {
      delete document.body.dataset.viewerPreview; entry.hidden = false; exit.hidden = true;
      const target = previousFocus?.isConnected && !previousFocus.disabled ? previousFocus : enter;
      if(focus)target.focus({ preventScroll: true }); previousFocus = null;
    }
  }
  enter.addEventListener('click', () => setViewer(true));
  exit.addEventListener('click', () => setViewer(false));
  document.addEventListener('keydown', event => {
    if(passwordMode)return; // The password-mode Escape handler below relocks.
    if (!viewing || event.key !== 'Escape') return;
    event.preventDefault(); setViewer(false);
  });
  if(passwordMode){
    const access=document.createElement('div');access.className='preview-controls-access';
    const gate=document.createElement('button');gate.type='button';gate.id='preview-controls-access';gate.textContent='Preview controls';gate.setAttribute('aria-controls','preview-controls-dialog');access.append(gate);footer.append(access);
    const dialog=document.createElement('dialog');dialog.id='preview-controls-dialog';dialog.className='preview-controls-dialog';dialog.setAttribute('aria-labelledby','preview-controls-title');dialog.setAttribute('aria-describedby','preview-controls-note');
    const title=document.createElement('h2');title.id='preview-controls-title';title.textContent='Preview controls';
    const note=document.createElement('p');note.id='preview-controls-note';note.textContent='Unlock design controls for this tab only. Escape or Lock preview controls hides them again; reloading starts locked.';
    const form=document.createElement('form');form.autocomplete='off';
    const label=document.createElement('label');label.htmlFor='preview-controls-password';label.textContent='Preview password';
    const input=document.createElement('input');input.id='preview-controls-password';input.name='password';input.type='password';input.autocomplete='off';input.required=true;input.maxLength=256;input.setAttribute('aria-describedby','preview-controls-feedback');
    const submit=document.createElement('button');submit.type='submit';submit.textContent='Unlock controls';
    const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Cancel';
    const actions=document.createElement('div');actions.className='preview-controls-dialog-actions';actions.append(submit,cancel);
    const feedback=document.createElement('p');feedback.id='preview-controls-feedback';feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
    form.append(label,input,actions,feedback);dialog.append(title,note,form);document.body.append(dialog);
    let attempt=0,controller=null,timeout=null;
    const cancelAttempt=()=>{attempt++;controller?.abort();controller=null;clearTimeout(timeout);timeout=null;input.value='';submit.disabled=false;form.removeAttribute('aria-busy');};
    const closeDialog=(focus=true)=>{cancelAttempt();if(dialog.open){if(typeof dialog.close==='function')dialog.close();else dialog.removeAttribute('open');}if(focus)gate.focus({preventScroll:true});};
    const lock=(manual=true)=>{if(manual){workspaceManualLock=true;workspaceRenewPending=false;cancelWorkspaceProbe();}controlsUnlocked=false;cancelAttempt();document.body.dataset.previewControlsLocked='true';setViewer(true,false);entry.hidden=true;exit.hidden=true;gate.textContent='Preview controls';gate.setAttribute('aria-expanded','false');if(dialog.open){if(typeof dialog.close==='function')dialog.close();else dialog.removeAttribute('open');}};
    const workspaceCandidate=()=>window.astraPreviewSession?.privateWorkspaceCandidate?.()===true;
    let workspaceManualLock=false,workspaceEpoch=0,workspaceController=null,workspaceDeadline=null,workspaceExpiry=null,workspaceUnderlying=null,workspaceWorking=false,workspaceRetryWanted=false,workspaceRenewPending=false;
    const workspaceNote=document.createElement('small');workspaceNote.setAttribute('role','status');if(workspaceCandidate())access.append(workspaceNote);
    const localWorkspace=()=>location.protocol==='http:'&&['localhost','127.0.0.1'].includes(location.hostname);
    const canProbe=(renewOnly=false)=>workspaceCandidate()&&(renewOnly?workspaceRenewPending&&localWorkspace():!workspaceManualLock)&&!document.hidden&&navigator.onLine!==false;
    const cancelWorkspaceProbe=()=>{workspaceEpoch++;workspaceRetryWanted=false;workspaceController?.abort();workspaceController=null;clearTimeout(workspaceDeadline);workspaceDeadline=null;};
    const unlockControls=(automatic=false)=>{controlsUnlocked=true;delete document.body.dataset.previewControlsLocked;closeDialog(!automatic);setViewer(false,false);exit.textContent='Exit viewer preview';exit.title='Return to unlocked editing. Escape relocks preview controls.';gate.textContent='Lock preview controls';if(!automatic){options.open=true;options.querySelector('summary')?.focus({preventScroll:true});}};
    const revokeWorkspace=(mode='unknown')=>{workspaceExpiresAt=null;workspaceMode=mode;workspaceRenewPending=false;workspaceNote.textContent='';clearTimeout(workspaceExpiry);workspaceExpiry=null;lock(false);publishWorkspace();};
    function retryWorkspaceWhenSettled(){const renewOnly=workspaceRetryWanted==='local-renew';if(workspaceRetryWanted&&!workspaceUnderlying&&!workspaceWorking&&canProbe(renewOnly)){workspaceRetryWanted=false;void probeWorkspace(renewOnly);}}
    function expireWorkspace(){const mayRenew=localWorkspace();cancelWorkspaceProbe();revokeWorkspace();workspaceNote.textContent='Private session expired. Reload to sign in again.';if(mayRenew){workspaceRenewPending=true;void probeWorkspace(true);}}
    async function readWorkspaceStatus(response,abort){
      const rejected=async()=>{abort.abort();try{await response.body?.cancel();}catch{}return null;};
      if(response.status!==200||response.headers.get('X-Astra-Preview')!=='password'||response.headers.get('X-Astra-Workspace')!=='private_workspace'||!/^application\/json(?:;|$)/i.test(response.headers.get('Content-Type')||'')||response.headers.has('Set-Cookie'))return rejected();
      const policy=new Set((response.headers.get('Cache-Control')||'').toLowerCase().split(',').map(x=>x.trim()));
      if(policy.size!==3||!['private','no-store','no-transform'].every(x=>policy.has(x))||response.headers.get('CDN-Cache-Control')!=='no-store'||response.headers.get('Cloudflare-CDN-Cache-Control')!=='no-store')return rejected();
      const reader=response.body?.getReader();if(!reader)return null;let size=0;const chunks=[];let reads=0;
      try{while(true){if(++reads>1024)throw Error('status_chunk_bound');const{value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>512)throw Error('status_body_bound');chunks.push(value);}}
      catch(error){abort.abort();try{await reader.cancel();}catch{}throw error;}
      const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
      const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes),keys=[...text.matchAll(/"((?:\\.|[^"\\])*)"\s*:/g)].map(m=>JSON.parse('"'+m[1]+'"'));
      if(keys.length!==3||new Set(keys).size!==3)return null;
      const value=JSON.parse(text);
      if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join('|')!=='expiresAt|mode|unlocked'||value.unlocked!==true||value.mode!=='private_workspace'||!Number.isSafeInteger(value.expiresAt)||value.expiresAt<=Date.now()||value.expiresAt>Date.now()+8*60*60*1000)return null;
      return value.expiresAt;
    }
    async function probeWorkspace(renewOnly=false){
      if(!canProbe(renewOnly))return;
      if(workspaceUnderlying||workspaceWorking){workspaceRetryWanted=renewOnly?'local-renew':true;return;}
      if(!(location.protocol==='https:'||location.protocol==='http:'&&['localhost','127.0.0.1'].includes(location.hostname)))return;
      workspaceRetryWanted=false;workspaceWorking=true;const ticket=++workspaceEpoch,abort=new AbortController();workspaceController=abort;
      const physical=(async()=>{const response=await fetch('/__preview_controls',{method:'GET',credentials:'same-origin',cache:'no-store',redirect:'error',headers:{Accept:'application/json','X-Astra-Controls-Status':'1'},signal:abort.signal});return {expiresAt:await readWorkspaceStatus(response,abort),review:response.headers.get('X-Astra-Preview')==='review'};})();workspaceUnderlying=physical;
      physical.then(()=>{if(workspaceUnderlying===physical)workspaceUnderlying=null;retryWorkspaceWhenSettled();},()=>{if(workspaceUnderlying===physical)workspaceUnderlying=null;retryWorkspaceWhenSettled();});
      try{
        const deadline=new Promise((_,reject)=>{workspaceDeadline=setTimeout(()=>{abort.abort();reject(Error('status_timeout'));},15000);});
        const value=await Promise.race([physical,deadline]);if(ticket!==workspaceEpoch||!canProbe(renewOnly))return;
        if(value.expiresAt===null||value.expiresAt<=Date.now()){if(renewOnly)workspaceManualLock=true;revokeWorkspace(value.review?'review':'unknown');workspaceNote.textContent='Private session could not be verified. Reload to sign in again if needed.';return;}
        workspaceExpiresAt=value.expiresAt;workspaceMode='private_workspace';workspaceRenewPending=false;clearTimeout(workspaceExpiry);workspaceExpiry=setTimeout(expireWorkspace,Math.max(0,value.expiresAt-Date.now()));
        workspaceNote.textContent='Existing private session verified; no second password is needed.';if(!renewOnly||!workspaceManualLock)unlockControls(true);publishWorkspace();
      }catch{if(ticket===workspaceEpoch){if(renewOnly)workspaceManualLock=true;revokeWorkspace();workspaceNote.textContent='Private session verification is unavailable. Controls remain locked.';}}
      finally{if(ticket===workspaceEpoch){clearTimeout(workspaceDeadline);workspaceDeadline=null;workspaceController=null;}workspaceWorking=false;retryWorkspaceWhenSettled();}
    }
    gate.addEventListener('click',()=>{if(workspaceExpiresAt!==null&&workspaceExpiresAt<=Date.now())revokeWorkspace();if(controlsUnlocked){lock();gate.focus({preventScroll:true});return;}if(workspaceCandidate()&&workspaceMode!=='review'){workspaceManualLock=false;void probeWorkspace();return;}feedback.textContent='';input.value='';if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');gate.setAttribute('aria-expanded','true');input.focus();});
    const cancelDialog=()=>{workspaceManualLock=true;cancelWorkspaceProbe();closeDialog();};
    cancel.addEventListener('click',cancelDialog);
    dialog.addEventListener('cancel',event=>{event.preventDefault();cancelDialog();});
    dialog.addEventListener('close',()=>{cancelAttempt();gate.setAttribute('aria-expanded','false');});
    form.addEventListener('submit',async event=>{
      event.preventDefault();if(submit.disabled)return;let password=input.value;input.value='';feedback.textContent='';
      if(!password||password.length>256){feedback.textContent='Enter the preview password.';input.focus();return;}
      const ticket=++attempt;submit.disabled=true;form.setAttribute('aria-busy','true');
      try{
        let accepted=false;
        if(['localhost','127.0.0.1'].includes(location.hostname)){
          // Explicit nonsecret development password verifier. Never used on a
          // remote host, including endpoint failures or lookalike hostnames.
          if(!window.crypto?.subtle||typeof TextEncoder!=='function')throw new Error('Local verification unavailable');
          const bytes=new TextEncoder().encode(password);password='';const digest=await window.crypto.subtle.digest('SHA-256',bytes);
          accepted=[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('')==='c0f5d87e15713bcf6d395e640f41e725534be802b694edeed9b1032cb4954dc6';
        }else{
          if(location.protocol!=='https:')throw new Error('HTTPS is required');
          controller=new AbortController();timeout=setTimeout(()=>controller?.abort(),15000);
          const body=new URLSearchParams({password}).toString();password='';
          const response=await fetch('/__preview_controls',{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',headers:{'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},body,signal:controller.signal});
          if(response.status===200&&/^application\/json(?:;|$)/i.test(response.headers.get('content-type')||''))accepted=(await response.json())?.unlocked===true;
        }
        if(ticket!==attempt)return;
        if(!accepted){feedback.textContent='Password not accepted, or the site preview session has expired.';input.focus();return;}
        unlockControls();
      }catch{if(ticket===attempt){feedback.textContent='Controls remain locked. Verification could not complete; try again after checking the site preview session.';input.focus();}}
      finally{password='';if(ticket===attempt){clearTimeout(timeout);timeout=null;controller=null;submit.disabled=false;form.removeAttribute('aria-busy');}}
    });
    document.addEventListener('keydown',event=>{if(event.key!=='Escape')return;if(workspaceCandidate()&&(workspaceUnderlying||workspaceRenewPending)&&!dialog.open){event.preventDefault();lock();gate.focus({preventScroll:true});return;}if(dialog.open){event.preventDefault();cancelDialog();return;}if(controlsUnlocked){event.preventDefault();lock();gate.focus({preventScroll:true});}});
    window.addEventListener('pageshow',event=>{if(event.persisted){cancelWorkspaceProbe();revokeWorkspace();workspaceManualLock=false;if(workspaceCandidate())void probeWorkspace();}});
    window.addEventListener('pagehide',()=>{cancelWorkspaceProbe();if(workspaceCandidate())revokeWorkspace();});
    document.addEventListener('visibilitychange',()=>{if(!workspaceCandidate())return;if(document.hidden)cancelWorkspaceProbe();else if(workspaceExpiresAt!==null&&workspaceExpiresAt<=Date.now())expireWorkspace();else{const renewOnly=workspaceRenewPending&&localWorkspace();if(canProbe(renewOnly)){workspaceRetryWanted=renewOnly?'local-renew':true;void probeWorkspace(renewOnly);}}});
    window.addEventListener('online',()=>{if(workspaceExpiresAt!==null&&workspaceExpiresAt<=Date.now()){expireWorkspace();return;}const renewOnly=workspaceRenewPending&&localWorkspace();if(canProbe(renewOnly)){workspaceRetryWanted=renewOnly?'local-renew':true;void probeWorkspace(renewOnly);}});
    window.addEventListener('offline',()=>{if(workspaceCandidate())cancelWorkspaceProbe();});
    document.addEventListener('astraprivateworkspacecandidate',()=>{if(workspaceCandidate()){if(!workspaceNote.isConnected)access.append(workspaceNote);if(canProbe())void probeWorkspace();}else{cancelWorkspaceProbe();revokeWorkspace();}});
    lock(false);
    if(workspaceCandidate())void probeWorkspace();
  }
})();
