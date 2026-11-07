// Display bands for already-validated public client evidence. No transport or timer.
const known=new Set(['current','ready','shown','validated','accepted_cache','validated_cache']);
export function describeReferenceStatus({capturedAt=null,status='idle',hasData=false,available=true,retained=false,partial=false,visible=true,online=true,bandMinutes=20,now=Date.now()}={}){
 const stamp=typeof capturedAt==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/.test(capturedAt)?Date.parse(capturedAt):NaN;
 const age=Number.isFinite(stamp)&&Number.isFinite(now)?now-stamp:null;
 let phase,tone='amber',label;
 if(status==='site_access'||status==='access_denied'){phase='access_blocked';tone='red';label='Site access unavailable';}
 else if(status==='off'||status==='disabled'||status==='hidden'){phase='off';label='Reference display inactive';}
 else if(!visible||!online||status==='paused'){phase='paused';label=hasData?'Checks paused; original retrieval retained':'Checks paused; no validated reference yet';}
 else if(status==='loading'){phase='loading';label=hasData?'Checking cache; displayed reference keeps its original retrieval':'Awaiting a validated cache response';}
 else if(!hasData){phase=status==='not_published'||status==='not_found'?'not_published':['unavailable','failure','failed','error'].includes(status)?'unavailable':'unverified';tone=phase==='unavailable'?'red':'amber';label=phase==='not_published'?'Reference not published here':phase==='unavailable'?'No validated reference available':'Reference not yet verified';}
 else if(retained||status==='retained'||['unavailable','failure','failed','error'].includes(status)){phase='retained';label='Retained reference; original retrieval unchanged';}
 else if(age===null){phase='clock_unknown';label='Retrieval clock unavailable; age unknown';}
 else if(age<0){phase='clock_uncertain';label='Capture clock ahead; retrieval age uncertain';}
 else if(!available){phase='unavailable';label='Selected reference unavailable; missing values are not zero';}
 else if(partial&&age<=bandMinutes*60000){phase='partial';label='Partial item evidence; original retrieval retained';}
 else if(!known.has(status)){phase='unverified';label='Reference state not yet verified';}
 else if(!Number.isFinite(bandMinutes)||bandMinutes<=0){phase='clock_unknown';label='Retrieval display band unavailable';}
 else if(age<=bandMinutes*60000){phase='recent';tone='green';label=`Retrieved within ${bandMinutes}-minute display band; not verified fresh trades`;}
 else{phase='aged';label=`Retrieval older than ${bandMinutes}-minute display band${partial?'; partial item evidence remains incomplete':''}`;}
 return Object.freeze({tone,phase,label,capturedAt:Number.isFinite(stamp)?capturedAt:null,ageMs:age,bandMinutes});
}

export function decorateReferenceStatus(node,state,text=node.textContent){
 const icon=node.ownerDocument.createElement('i');icon.className='source-status-dot status-'+state.tone;icon.setAttribute('aria-hidden','true');
 const copy=node.ownerDocument.createElement('span');copy.textContent=text;node.replaceChildren(icon,copy);
 node.dataset.statusTone=state.tone;node.dataset.retrievalState=state.phase;node.title=state.label+'; retrieval is not individual sale or scan time.';
 if(state.capturedAt)node.dataset.rawCapturedAt=state.capturedAt;else delete node.dataset.rawCapturedAt;
}
