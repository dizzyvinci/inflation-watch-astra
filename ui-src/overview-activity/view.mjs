import {describeReferenceStatus,decorateReferenceStatus} from '../item-api/reference-status.mjs';
export function displayClock(iso){return typeof iso==='string'?`(${iso.slice(5,7)}-${iso.slice(8,10)}-${iso.slice(0,4)} ${iso.slice(11,19)} UTC)`:'Unknown';}
export function exactAmount(lexeme){if(lexeme===null)return 'Unknown';const [a,b]=lexeme.split('.');return a.replace(/\B(?=(\d{3})+(?!\d))/g,',')+(b===undefined?'':'.'+b);}
export function overviewActivityView(state,{now=Date.now()}={}){
 const r=state.reference,s=r?.source,hasData=!!r;
 const mode=state.status==='current'&&state.currentAgainstPublishedPointer!==true?'retained':state.status;
 let indicator=describeReferenceStatus({status:mode,capturedAt:s?.capturedAt,hasData,retained:mode==='retained',online:state.pauseReason!=='offline',visible:state.pauseReason!=='hidden',now});
 if(state.pauseReason==='offline')indicator={...indicator,label:'Offline; checks paused and original evidence retained.'};
 if(indicator.tone==='green'&&s&&now-Date.parse(s.sourceGeneratedAt)>20*60000)indicator={...indicator,tone:'amber',phase:'publisher_aged',label:'Capture is recent; publisher clock remains older than the 20-minute display band.'};
 const counts=r?[
  ['Recorded-sales counters',exactAmount(r.counterSums.sourceRecordedSalesCounterSumLexeme),'Source counters; not unique or independently verified trades.'],
  ['Reported-unit counters',exactAmount(r.counterSums.sourceReportedUnitCounterSumLexeme),'Reported counters; not standardized market volume.'],
  ['Source-labelled mesos',exactAmount(r.counterSums.sourceReportedMesosSumLexeme),'Not independently verified completed trade value.'],
  ['Median × count proxy',exactAmount(r.counterSums.medianCountProxySumLexeme),'Median unit price × recorded sales count; not actual traded mesos.']
 ]:[];
 return Object.freeze({title:'Reported overview window activity',status:indicator,counts,sourceCapture:s?displayClock(s.capturedAt):'Unknown',publisherTime:s?displayClock(s.sourceGeneratedAt):'Unknown',rawCapture:s?.capturedAt??null,
  window:r?`${r.window.windowHours}h reported window; scanned ${r.window.scannedHours}h (previous ${r.window.previousScannedHours}h); comparable: ${r.window.comparable?'yes':'no'}. Exact start/end unknown.`:'No validated window available.',
  coverage:r?`${r.coverage.receivedItemRows} received source rows; eligible counters: ${r.coverage.countEligibleItemRows} sales, ${r.coverage.reportedUnitEligibleItemRows} units, ${r.coverage.sourceReportedMesosEligibleItemRows} source mesos; ${r.coverage.medianCountProxyEligibleItemRows} proxy-eligible, ${r.coverage.medianCountProxyMissingPriceRows} missing median. Received rows are not whole-market coverage.`:'Coverage unknown.',
  publication:state.currentAgainstPublishedPointer?'Matches the published cache pointer; upstream latest was not inspected.':hasData?'Retained evidence; it is not current against the published pointer.':'No current published evidence admitted.',
  disclaimer:'Not since-launch totals or a daily ledger. Stock, turnover, unique participants and optimal trade window are unknown.'});
}
export function createOverviewActivityPanel({document,client}={}){
 if(!document?.createElement||!client?.refresh||!client?.state)throw Error('overview_activity_view_unavailable');
 const root=document.createElement('section');root.className='overview-window-activity';root.setAttribute('aria-label','Optional reported overview window activity');
 const title=document.createElement('h3'),status=document.createElement('p'),window=document.createElement('p'),coverage=document.createElement('p'),clocks=document.createElement('p'),publication=document.createElement('p'),list=document.createElement('dl'),note=document.createElement('p'),button=document.createElement('button');button.type='button';button.textContent='Refresh cached window activity';root.append(title,status,window,coverage,clocks,publication,list,note,button);let disposed=false;
 function render({now=Date.now()}={}){if(disposed)return;const state=client.state(),v=overviewActivityView(state,{now});root.hidden=state.status==='off';title.textContent=v.title;decorateReferenceStatus(status,v.status,v.status.label);window.textContent=v.window;coverage.textContent=v.coverage;clocks.textContent=`Publisher time ${v.publisherTime}; capture ${v.sourceCapture}.`;if(v.rawCapture)clocks.dataset.rawCapturedAt=v.rawCapture;else delete clocks.dataset.rawCapturedAt;publication.textContent=v.publication;note.textContent=v.disclaimer;list.replaceChildren();for(const [label,value,explanation]of v.counts){const term=document.createElement('dt'),detail=document.createElement('dd');term.textContent=label;detail.textContent=value;detail.title=explanation;list.append(term,detail);}button.disabled=state.physicalPending||['off','paused','access_denied','loading'].includes(state.status);}
 async function refresh(){if(disposed)return;try{const promise=client.refresh();render();await promise;}catch{}if(!disposed)render();}
 button.addEventListener('click',refresh);render();
 return Object.freeze({element:root,render,refresh,setEnabled(value){client.setEnabled(value);render();},setPaused(value,reason='paused'){client.setPaused(value,reason);render();},withdraw(){client.withdraw();render();},clear(){client.clear();render();},dispose(){disposed=true;client.setPaused?.(true,'hidden');button.removeEventListener('click',refresh);root.replaceChildren();}});
}
