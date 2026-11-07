// Explicit own-site lifecycle; refresh preserves controls and original source clocks.
import {validatePublicItemReference} from '../../ops/api-item-reference-protocol.mjs';
export function createItemPanelLifecycle({container,mountPanel,loader,getTimezone=()=> 'UTC',spriteMap={},onStatus=()=>{}}={}){
 if(!container?.ownerDocument||typeof mountPanel!=='function')throw TypeError('Explicit item panel dependencies required');
 let epoch=0,controller=null,handle=null,currentId=null,timezone=null,lastCapture=null,lastDtoSha=null,flight=null;
 const clear=()=>{handle?.destroy();handle=null;};
 function load(itemId,preserveState){
  if(!Number.isSafeInteger(itemId)||itemId<1||itemId>999999999)throw TypeError('Exact numeric item ID required');
  if(flight?.itemId===itemId)return flight.promise;
  const token=++epoch;controller?.abort();controller=new AbortController();const ownController=controller;
  if(currentId!==itemId){clear();lastCapture=null;lastDtoSha=null;}currentId=itemId;
  if(typeof loader!=='function'){onStatus('not_connected');return Promise.resolve({status:'not_connected'});}
  onStatus('loading',{hasData:!!handle});const task={itemId};
  task.promise=(async()=>{try{
   const reply=await loader({itemId,signal:ownController.signal});if(token!==epoch||ownController.signal.aborted)return{status:'stale'};
   const value=await validatePublicItemReference(reply);if(token!==epoch||ownController.signal.aborted)return{status:'stale'};
   if(value.itemId!==itemId||lastCapture!==null&&Date.parse(value.sourceCapturedAt)<Date.parse(lastCapture))throw Object.assign(TypeError('Wrong or older item reference'),{code:'invalid'});
   const options={timezone:timezone??getTimezone(),spriteMap};
   if(handle){if(value.dtoSha256!==lastDtoSha)handle.updateDto(value.item,{preserveState});handle.updateTimezone(options.timezone);}else handle=mountPanel(container,value.item,options);
   lastCapture=value.sourceCapturedAt;lastDtoSha=value.dtoSha256;onStatus('shown',{hasData:true});return{status:'shown',itemId,sourceCapturedAt:value.sourceCapturedAt,generation:value.projectionGeneration};
  }catch(error){
   if(token!==epoch||ownController.signal.aborted)return{status:'stale'};
   if(error?.code==='access_denied'){clear();onStatus('access_denied',{hasData:false,reason:'access_denied'});return{status:'access_denied'};}
   const status=handle?'retained':'unavailable';onStatus(status,{hasData:!!handle,reason:error?.code??'unavailable'});return{status};
  }finally{if(flight===task)flight=null;}})();flight=task;return task.promise;
 }
 return Object.freeze({
  show:itemId=>load(itemId,false),
  refresh(){return currentId===null?Promise.resolve({status:'not_connected'}):load(currentId,true);},
  pause(){epoch++;controller?.abort();controller=null;flight=null;onStatus('paused',{hasData:!!handle});},
  timezoneChanged(value){timezone=value;handle?.updateTimezone(value);},
  hide(){epoch++;controller?.abort();controller=null;flight=null;currentId=null;lastCapture=null;lastDtoSha=null;clear();onStatus('hidden');}
 });
}
