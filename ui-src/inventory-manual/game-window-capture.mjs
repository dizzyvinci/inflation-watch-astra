// WORK prototype: local, manual, video-only chooser. No OCR, transport or capture loop.
export const gameWindowLimits=Object.freeze({maxWidth:1280,maxHeight:720,maxFramePixels:921600,maxFrames:3,maxSessionMs:120000,maxEncodedBytes:8000000,maxPhysicalChoosers:1,maxPhysicalFrames:1,maxCleanupTracks:4});

export function mountGameWindowCapture(root,{review,isEnabled,readAuthority,now=()=>root.ownerDocument.defaultView.Date.now()}={}){
 const d=root.ownerDocument,w=d.defaultView;
 const inert=()=>Object.freeze({sync(){},stop(){},dispose(){},state:()=>Object.freeze({enabled:false,supported:false,chooserPending:false,framePending:false,cleanupUnknown:false}),async request(){return false},async frame(){return false}});
 if(w.location.origin!=='http://127.0.0.1:8765')return inert();
 if(!review||typeof review.importFiles!=='function'||typeof review.state!=='function'||typeof isEnabled!=='function'||typeof readAuthority!=='function')throw TypeError('capture_options');
 const make=(tag,text)=>{const n=d.createElement(tag);if(text!==undefined)n.textContent=text;return n};
 const section=make('section');section.dataset.gameCapture='';section.className='inventory-screenshot-review';
 section.append(make('h2','Optional game-window frames · prototype'),make('p','Off until you explicitly open the browser chooser. Choose only your own dedicated game window, never a screen or browser tab. Unsupported or unidentified window capture is refused. The browser cannot verify that the chosen window is the game. Do not show chats, account details or other private content. No audio, OCR, automated recognition or upload.'));
 const label=make('label',' I will choose only my dedicated game window and review each frame manually.'),consent=make('input');consent.type='checkbox';consent.dataset.gameCaptureConsent='';label.prepend(consent);section.append(label);
 const start=make('button','Choose game window'),capture=make('button','Copy one frame for manual review'),stopButton=make('button','Stop sharing');for(const b of[start,capture,stopButton])b.type='button';start.dataset.gameCaptureStart='';capture.dataset.gameCaptureFrame='';stopButton.dataset.gameCaptureStop='';section.append(start,capture,stopButton);
 const status=make('p','Capture Off. Existing screenshot/file review and manual declarations remain separate.');status.setAttribute('role','status');section.append(status,make('p','At most 3 manually requested frames in 2 minutes, scaled to fit 1,280 × 720. Images stay in this tab and use the existing screenshot limits. Off, clear, expiry, hiding or losing workspace access clears images; confirmed manual pages/entries follow the existing workspace rules. A frame-copy clock is not a game-message, listing or market-source time. This is not isolated from other same-origin scripts.'));root.append(section);
 let disposed=false,epoch=0,session=null,chooserPending=false,framePending=false,cleanupUnknown=false,expiryTimer=null,activeCanvas=null,lastCopyAt=null;const unknownSessions=new Set();
 const mono=()=>w.performance.now();
 const authority=()=>{try{const a=readAuthority();return a?.verified===true&&a.mode==='private_workspace'&&Number.isSafeInteger(a.expiresAt)&&a.expiresAt>now()?a:null}catch{return null}};
 const active=()=>{try{return !disposed&&isEnabled()===true&&!d.hidden&&w.navigator.onLine!==false&&authority()!==null}catch{return false}};
 const gesture=event=>event?.isTrusted===true&&w.navigator.userActivation?.isActive===true;
 function valid(s){return s===session&&s.epoch===epoch&&active()&&now()<s.endWall&&mono()<s.endMono}
 function windowSource(s){try{const tracks=s.stream.getTracks();return tracks.length===1&&tracks[0]===s.tracks[0]&&tracks[0].kind==='video'&&tracks[0].readyState==='live'&&tracks[0].getSettings().displaySurface==='window'&&s.stream.getAudioTracks().length===0}catch{return false}}
 const supported=()=>typeof w.navigator.mediaDevices?.getDisplayMedia==='function'&&typeof w.performance?.now==='function';
 function draw(){start.disabled=!active()||!supported()||chooserPending||framePending||!!session||cleanupUnknown||!consent.checked;capture.disabled=!session||!valid(session)||framePending||chooserPending||review.state().physicalPending||session.frames>=gameWindowLimits.maxFrames;stopButton.disabled=!session&&!chooserPending&&!framePending;section.dataset.capturePending=String(chooserPending||framePending);section.dataset.captureCleanupUnknown=String(cleanupUnknown)}
 function clearExpiry(){if(expiryTimer!==null){w.clearTimeout(expiryTimer);expiryTimer=null}}
 function currentTracks(s){
  try{const tracks=s.stream.getTracks(),n=tracks?.length;if(!Array.isArray(tracks)||!Number.isSafeInteger(n)||n<0){cleanupUnknown=true;return[]}
   if(n>gameWindowLimits.maxCleanupTracks)cleanupUnknown=true;
   const owned=[];for(let i=0;i<Math.min(n,gameWindowLimits.maxCleanupTracks);i++)owned.push(tracks[i]);return owned;
  }catch{cleanupUnknown=true;return[]}
 }
 function release(s){
  if(!s||!s.stream)return;
  if(s.released){for(const t of currentTracks(s))try{if(!s.releasedTracks?.has(t)||t.readyState!=='ended')cleanupUnknown=true}catch{cleanupUnknown=true}if(cleanupUnknown)unknownSessions.add(s);return}
  s.released=true;
  // Retain initial ownership even when removed; also admit the CURRENT returned
  // stream snapshot. This cleanup bound never permits multi-track capture.
  const owned=new Set(),admit=tracks=>{for(const t of tracks){try{if(!t||typeof t.stop!=='function'){cleanupUnknown=true;continue}if(!owned.has(t)&&owned.size===gameWindowLimits.maxCleanupTracks){cleanupUnknown=true;continue}owned.add(t)}catch{cleanupUnknown=true}}};
  admit(s.tracks);admit(currentTracks(s));s.releasedTracks=owned;
  try{s.video?.pause()}catch{}try{if(s.video)s.video.srcObject=null}catch{cleanupUnknown=true}
  for(const t of owned){try{t.removeEventListener?.('ended',s.onEnded);t.stop();if(t.readyState!=='ended')cleanupUnknown=true}catch{cleanupUnknown=true}}
  // One bounded closing snapshot only: no sweep/retry/timeout settlement claim.
  for(const t of currentTracks(s))try{if(!owned.has(t)||t.readyState!=='ended')cleanupUnknown=true}catch{cleanupUnknown=true}
  if(!owned.size)cleanupUnknown=true;
  if(cleanupUnknown){s.retainedTracks=owned;unknownSessions.add(s)}
 }
 function stop({clearImages=false}={}){epoch++;clearExpiry();const s=session;session=null;release(s);if(activeCanvas){activeCanvas.width=0;activeCanvas.height=0}if(clearImages||framePending)review.clear();consent.checked=false;status.textContent=cleanupUnknown?'Sharing cleanup was not verified. No new chooser is permitted; use the browser sharing controls.':chooserPending||framePending?'Capture Off. Earlier browser chooser, encoder or decode is still physically pending; it cannot publish or permit a replacement until it settles.':'Capture stopped. Unfinished frames are discarded; manual declarations are unchanged.';draw()}
 function sync(){if(session&&!valid(session)||!active()&&(session||chooserPending||framePending))stop({clearImages:true});draw()}
 async function request(event){
  if(!gesture(event)||!consent.checked||!active()||!supported()||session||chooserPending||framePending||cleanupUnknown)return false;
  const original=authority(),wall=now(),endWall=Math.min(original.expiresAt,wall+gameWindowLimits.maxSessionMs),m=mono();
  if(!(endWall>wall))return false;
  const ticket=++epoch,s={epoch:ticket,endWall,endMono:m+(endWall-wall),frames:0,tracks:[],video:null};session=s;chooserPending=true;
  expiryTimer=w.setTimeout(()=>stop({clearImages:true}),endWall-wall);
  status.textContent='Use the browser chooser to select only the dedicated game window. No frame is copied automatically.';draw();
  try{
   // Hints are not guarantees: post-admission below requires an actual window.
   const stream=await w.navigator.mediaDevices.getDisplayMedia({video:{displaySurface:'window'},audio:false,monitorTypeSurfaces:'exclude',selfBrowserSurface:'exclude',surfaceSwitching:'exclude',systemAudio:'exclude'});
   s.stream=stream;s.tracks=currentTracks(s);
   if(!valid(s)){release(s);return false}
   const videoTracks=stream.getVideoTracks(),audioTracks=stream.getAudioTracks();
   if(s.tracks.length!==1||videoTracks.length!==1||audioTracks.length!==0||videoTracks[0]!==s.tracks[0]||videoTracks[0].kind!=='video'||videoTracks[0].getSettings().displaySurface!=='window')throw TypeError('dedicated_window_unverified');
   if(!valid(s))return false;
   s.onEnded=()=>{if(session===s)stop()};s.tracks[0].addEventListener('ended',s.onEnded);
   s.video=make('video');s.video.muted=true;s.video.playsInline=true;s.video.srcObject=stream;
   await s.video.play();
   if(!windowSource(s)||!valid(s)){if(session===s)stop({clearImages:true});else release(s);return false}
   status.textContent='Window sharing ready. Copy a frame only when the game inventory is visible. Nothing is recognized automatically.';return true;
  }catch{if(session===s){stop();status.textContent=cleanupUnknown?'Sharing cleanup was not verified; new capture is held.':'Window capture unavailable or refused. Screens, tabs, audio and unidentified sources are unsupported. Existing file review still works.'}return false}
  finally{if(!valid(s)){if(session===s)stop({clearImages:true});else release(s)}chooserPending=false;draw()}
 }
 async function frame(event){
  const s=session;
  if(!gesture(event)||!s||!valid(s)||chooserPending||framePending||cleanupUnknown||review.state().physicalPending||s.frames>=gameWindowLimits.maxFrames)return false;
  framePending=true;let canvas=null;
  try{
   if(!windowSource(s)){stop({clearImages:true});throw TypeError('window_source_changed')}
   const sw=s.video.videoWidth,sh=s.video.videoHeight;
   if(s.video.readyState<2||!Number.isSafeInteger(sw)||!Number.isSafeInteger(sh)||sw<1||sh<1||sw>8192||sh>8192)throw TypeError('frame_not_ready');
   const scale=Math.min(1,gameWindowLimits.maxWidth/sw,gameWindowLimits.maxHeight/sh),width=Math.max(1,Math.floor(sw*scale)),height=Math.max(1,Math.floor(sh*scale));
   if(width*height>gameWindowLimits.maxFramePixels)throw TypeError('frame_bound');
   s.frames++;canvas=make('canvas');activeCanvas=canvas;canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');if(!ctx)throw TypeError('canvas_unavailable');
   if(!windowSource(s)||!valid(s)){if(session===s)stop({clearImages:true});return false}
   ctx.drawImage(s.video,0,0,width,height);const copiedAt=now();
   if(!windowSource(s)||!valid(s)){if(session===s)stop({clearImages:true});return false}
   // One encoder callback remains reserved across Off/regrant until it settles.
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
   if(!windowSource(s)||!valid(s)){if(session===s)stop({clearImages:true});return false}
   const size=Object.getOwnPropertyDescriptor(w.Blob.prototype,'size').get,type=Object.getOwnPropertyDescriptor(w.Blob.prototype,'type').get;
   if(!blob||size.call(blob)<1||size.call(blob)>gameWindowLimits.maxEncodedBytes||type.call(blob)!=='image/png')throw TypeError('frame_encoding_bound');
   if(review.state().physicalPending||!valid(s))return false;
   const file=new w.File([blob],'game-window-review.png',{type:'image/png'});
   if(!valid(s))return false;
   await review.importFiles([file],{isCurrent:()=>valid(s)});
   if(!valid(s))return false;
   lastCopyAt=new w.Date(copiedAt).toISOString();
   status.textContent='Browser frame copied at '+lastCopyAt+'. Game-message/source time unknown. Review the image and manually enter exact item, quantity and stats; no stack or market record was created.';return true;
  }catch{if(valid(s))status.textContent='Frame could not be admitted. No item, quantity or price was inferred; use existing local screenshot review.';return false}
  finally{if(canvas){canvas.width=0;canvas.height=0}activeCanvas=null;if(session===s&&!valid(s))stop({clearImages:true});framePending=false;draw()}
 }
 consent.addEventListener('change',draw);start.addEventListener('click',event=>{void request(event)});capture.addEventListener('click',event=>{void frame(event)});stopButton.addEventListener('click',()=>stop());
 const hide=()=>stop({clearImages:true});for(const n of['hashchange','offline'])w.addEventListener(n,sync);w.addEventListener('pagehide',hide);d.addEventListener('visibilitychange',sync);d.addEventListener('astraprivateworkspace',sync);draw();
 return Object.freeze({request,frame,stop,sync,state:()=>Object.freeze({enabled:!!session,chooserPending,framePending,cleanupUnknown,frames:session?.frames??0,originalExpiresAt:session?.endWall??null,lastCopyAt,supported:supported(),automaticFrames:0,ocr:false,uploads:0}),dispose(){if(disposed)return;stop({clearImages:true});disposed=true;for(const n of['hashchange','offline'])w.removeEventListener(n,sync);w.removeEventListener('pagehide',hide);d.removeEventListener('visibilitychange',sync);d.removeEventListener('astraprivateworkspace',sync);section.remove()}});
}
