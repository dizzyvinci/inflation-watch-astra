(() => {
  'use strict';
  const options = document.getElementById('display-options');
  if (!options || document.getElementById('viewer-preview-enter')) return;
  const footer=document.querySelector('footer'),passwordMode=footer?.dataset.footerPrivacyLock==='on';
  let controlsUnlocked=!passwordMode;

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
    const closeDialog=()=>{cancelAttempt();if(dialog.open){if(typeof dialog.close==='function')dialog.close();else dialog.removeAttribute('open');}gate.focus({preventScroll:true});};
    const lock=()=>{controlsUnlocked=false;cancelAttempt();document.body.dataset.previewControlsLocked='true';setViewer(true,false);entry.hidden=true;exit.hidden=true;gate.textContent='Preview controls';gate.setAttribute('aria-expanded','false');if(dialog.open){if(typeof dialog.close==='function')dialog.close();else dialog.removeAttribute('open');}};
    gate.addEventListener('click',()=>{if(controlsUnlocked){lock();gate.focus({preventScroll:true});return;}feedback.textContent='';input.value='';if(typeof dialog.showModal==='function')dialog.showModal();else dialog.setAttribute('open','');gate.setAttribute('aria-expanded','true');input.focus();});
    cancel.addEventListener('click',closeDialog);
    dialog.addEventListener('cancel',event=>{event.preventDefault();closeDialog();});
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
        controlsUnlocked=true;delete document.body.dataset.previewControlsLocked;closeDialog();setViewer(false,false);exit.textContent='Exit viewer preview';exit.title='Return to unlocked editing. Escape relocks preview controls.';gate.textContent='Lock preview controls';options.open=true;options.querySelector('summary')?.focus({preventScroll:true});
      }catch{if(ticket===attempt){feedback.textContent='Controls remain locked. Verification could not complete; try again after checking the site preview session.';input.focus();}}
      finally{password='';if(ticket===attempt){clearTimeout(timeout);timeout=null;controller=null;submit.disabled=false;form.removeAttribute('aria-busy');}}
    });
    document.addEventListener('keydown',event=>{if(event.key!=='Escape')return;if(dialog.open){event.preventDefault();closeDialog();return;}if(controlsUnlocked){event.preventDefault();lock();gate.focus({preventScroll:true});}});
    window.addEventListener('pageshow',event=>{if(event.persisted)lock();});
    lock();
  }
})();
