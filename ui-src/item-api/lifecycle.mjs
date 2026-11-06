// Explicit lifecycle bridge only. A future approved own-site loader is injected.
import {validatePublicItemReference} from '../../ops/api-item-reference-protocol.mjs';
export function createItemPanelLifecycle({container,mountPanel,loader,getTimezone=()=> 'UTC',spriteMap={},onStatus=()=>{}}={}){
 if(!container?.ownerDocument||typeof mountPanel!=='function')throw TypeError('Explicit item panel dependencies required');
 let epoch=0,controller=null,handle=null,currentId=null,timezone=null,lastCapture=null;
 const clear=()=>{handle?.destroy();handle=null;};
 return Object.freeze({
  async show(itemId){if(!Number.isSafeInteger(itemId)||itemId<1||itemId>999999999)throw TypeError('Exact numeric item ID required');const token=++epoch;controller?.abort();controller=new AbortController();const ownController=controller;
   if(currentId!==itemId){clear();lastCapture=null;}currentId=itemId;
   if(typeof loader!=='function'){onStatus('not_connected');return{status:'not_connected'};}
   onStatus('loading');
   try{const reply=await loader({itemId,signal:ownController.signal});if(token!==epoch||ownController.signal.aborted)return{status:'stale'};
    // Own the reply before asynchronous hashing; caller changes cannot affect it.
    const value=await validatePublicItemReference(reply);if(token!==epoch||ownController.signal.aborted)return{status:'stale'};if(value.itemId!==itemId||lastCapture!==null&&Date.parse(value.sourceCapturedAt)<Date.parse(lastCapture))throw TypeError('Wrong or older item reference');
    const options={timezone:timezone??getTimezone(),spriteMap};if(handle){handle.updateDto(value.item);handle.updateTimezone(options.timezone);}else handle=mountPanel(container,value.item,options);
    lastCapture=value.sourceCapturedAt;onStatus('shown');return{status:'shown',itemId,sourceCapturedAt:value.sourceCapturedAt,generation:value.projectionGeneration};
   }catch{if(token!==epoch||ownController.signal.aborted)return{status:'stale'};onStatus(handle?'retained':'unavailable');return{status:handle?'retained':'unavailable'};}
  },
  timezoneChanged(value){timezone=value;handle?.updateTimezone(value);},
  hide(){epoch++;controller?.abort();controller=null;currentId=null;lastCapture=null;clear();onStatus('hidden');}
 });
}
