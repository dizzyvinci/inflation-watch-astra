import{inspectScreenshotBytes,screenshotLimits}from'./screenshot-image.mjs';
// Local user-selected files only. No transport, storage, URLs, OCR or timers.
export function mountScreenshotReview(root,{isEnabled,addPage,getPages,selectPage}){
 const d=root.ownerDocument,w=d.defaultView;
 if(w.location.origin!=='http://127.0.0.1:8765')return Object.freeze({sync(){},clear(){},state:()=>Object.freeze({images:0,physicalPending:false,encodedBytes:0,pixels:0}),dispose(){}});
 const make=(tag,text)=>{const el=d.createElement(tag);if(text!==undefined)el.textContent=text;return el};
 let epoch=0,disposed=false,busy=false,reader=null,queue=[],pages=[],serial=0;
 const active=()=>{try{return !disposed&&isEnabled()===true}catch{return false}};
 const section=make('section');section.className='inventory-screenshot-review';section.dataset.screenshotReview='';
 section.append(make('h2','Review local inventory screenshots'),make('p','Choose up to 10 PNG, JPEG or WebP screenshots. Each becomes a separate review page. Images stay in this tab; nothing is recognized automatically. Read the image and confirm each exact item, quantity and stat in the existing stack form. Correct mistakes before adding, or remove and replace a stack. Refresh cached prices remains a separate action.'));
 const label=make('label','Choose local screenshots'),input=make('input');input.type='file';input.multiple=true;input.accept='image/png,image/jpeg,image/webp';input.autocomplete='off';input.dataset.screenshotFiles='';label.append(input);section.append(label);
 const clearButton=make('button','Clear images only');clearButton.type='button';clearButton.dataset.clearScreenshots='';section.append(clearButton);
 const status=make('p','No images selected. No upload, filename export, image saving or screenshot source clock.');status.setAttribute('role','status');status.dataset.screenshotStatus='';section.append(status);
 const gallery=make('div');gallery.className='inventory-screenshot-gallery';section.append(gallery);root.append(section);
 const release=p=>{p.canvas.width=0;p.canvas.height=0;p.card.remove()};
 function draw(){input.disabled=!active()||busy;clearButton.disabled=pages.length===0&&!busy;for(const p of pages)p.select.disabled=!active();section.dataset.physicalPending=String(busy)}
 function clear(){epoch++;queue.length=0;for(const p of pages)release(p);pages=[];input.value='';try{if(reader?.readyState===1)reader.abort()}catch{}status.textContent=busy?'Images cleared. An earlier native decode remains reserved until it physically settles; late pixels cannot return.':'Images cleared. Confirmed manual pages and stacks remain until you remove them or clear the workspace.';draw()}
 function sync(){if(!active()){if(pages.length||queue.length||reader||busy)clear();else draw();return}const ids=new Set(getPages().map(p=>p.pageId));pages=pages.filter(p=>{if(ids.has(p.pageId))return true;release(p);return false});draw()}
 const read=file=>new Promise((resolve,reject)=>{const r=new w.FileReader();reader=r;r.onload=()=>resolve(r.result);r.onerror=()=>reject(TypeError('local_image_read_failed'));r.onabort=()=>reject(TypeError('local_image_read_cancelled'));try{r.readAsArrayBuffer(file)}catch{reject(TypeError('local_image_read_failed'))}});
 async function importFiles(files,{isCurrent=()=>true}={}){
  if(typeof isCurrent!=='function')return;const callerCurrent=()=>{try{return isCurrent()===true}catch{return false}};
  if(!active()||busy||!callerCurrent())return;let count;try{count=files.length;if(!Number.isSafeInteger(count)||count<1||count>10)throw Error();queue=Array.from(files);if(queue.length!==count||count+getPages().length>10)throw Error()}catch{queue=[];status.textContent='Choose 1 to 10 images within the remaining 10-page limit.';return}
  const ticket=epoch;busy=true;draw();let bytes=null,bitmap=null,canvas=null,file=null;
  const valid=()=>ticket===epoch&&active()&&callerCurrent();
  try{
   const size=Object.getOwnPropertyDescriptor(w.Blob.prototype,'size').get,type=Object.getOwnPropertyDescriptor(w.Blob.prototype,'type').get;
   let total=pages.reduce((n,p)=>n+p.bytes,0);for(const f of queue){const n=size.call(f);if(!(f instanceof w.File)||!Number.isSafeInteger(n)||n<1||n>screenshotLimits.maxBytes||!['image/png','image/jpeg','image/webp'].includes(type.call(f)))throw TypeError('local_image_profile');total+=n}if(total>screenshotLimits.maxBatchBytes)throw TypeError('local_image_batch_bound');
   while(queue.length&&valid()){
    file=queue.shift();const mime=type.call(file),expected=size.call(file);status.textContent='Reading and decoding one local image. No item identity or stats have been inferred.';
    const buffer=await read(file);reader=null;bytes=new Uint8Array(buffer);if(!valid())break;if(bytes.length!==expected)throw TypeError('local_image_size_changed');
    const info=inspectScreenshotBytes(bytes,mime);if(pages.reduce((n,p)=>n+p.pixels,0)+info.pixelCount>screenshotLimits.maxTotalPixels)throw TypeError('local_image_pixel_budget');
    if(typeof w.createImageBitmap!=='function')throw TypeError('native_image_decoder_unavailable');
    const pendingBitmap=w.createImageBitmap(new w.Blob([bytes],{type:mime}),{imageOrientation:'from-image'});bytes.fill(0);bytes=null;file=null;bitmap=await pendingBitmap;
    if(!valid())break;if(!bitmap||typeof bitmap.close!=='function'||bitmap.width!==info.width||bitmap.height!==info.height)throw TypeError('native_image_dimensions_mismatch');
    canvas=make('canvas');canvas.width=info.width;canvas.height=info.height;canvas.setAttribute('aria-label','Local screenshot for manual transcription');const ctx=canvas.getContext('2d');if(!ctx)throw TypeError('local_canvas_unavailable');ctx.drawImage(bitmap,0,0);bitmap.close();bitmap=null;if(!valid())break;
    // The existing page ledger and stack form are the only item authority.
    const page=addPage({label:'Screenshot review '+(++serial),sourceKind:'screenshot_transcription',sourceHash:null});
    if(!valid())break;const card=make('article'),title=make('h3',page.label),select=make('button','Review / enter stacks for this page'),remove=make('button','Remove this image only');select.type=remove.type='button';select.dataset.reviewScreenshot=page.pageId;remove.dataset.removeScreenshot=page.pageId;
    const row={pageId:page.pageId,canvas,card,select,bytes:info.bytes,pixels:info.pixelCount};select.addEventListener('click',()=>{if(active())selectPage(page.pageId)});remove.addEventListener('click',()=>{release(row);pages=pages.filter(p=>p!==row);draw()});card.append(title,canvas,make('p','Manually transcribed image; capture time, completeness, item identity and stack counts are not verified.'),select,remove);gallery.append(card);pages.push(row);canvas=null;selectPage(page.pageId);
   }
   if(valid())status.textContent='Local images ready. Review each page and enter separate stacks; only explicit Refresh may request typed cached prices. No recognition or inventory completeness is claimed.';
  }catch{if(valid())status.textContent='Image could not be admitted. Use a nonanimated PNG, JPEG or WebP up to 8 MB, 4,096 pixels per side and 8 million pixels. All images together are limited to 32 MB and 16 million pixels. Some metadata or orientation profiles need a fresh plain screenshot. Earlier admitted pages remain separate.'}
  finally{bytes?.fill(0);try{bitmap?.close()}finally{if(canvas){canvas.width=0;canvas.height=0}file=null;reader=null;queue.length=0;busy=false;input.value='';draw()}}
 }
 input.addEventListener('change',()=>{void importFiles(input.files)});clearButton.addEventListener('click',clear);draw();
 return Object.freeze({sync,clear,importFiles,state:()=>Object.freeze({images:pages.length,physicalPending:busy,encodedBytes:pages.reduce((n,p)=>n+p.bytes,0),pixels:pages.reduce((n,p)=>n+p.pixels,0)}),dispose(){clear();disposed=true;section.remove()}});
}
