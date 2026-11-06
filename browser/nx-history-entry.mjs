// Bundled locally into web/nx-history-browser.js. No request until explicit selection.
import {createNxHistoricalController,windowLabel} from './nx-history-controller.mjs';
const section=document.getElementById('smega-section'),chart=document.getElementById('smega-offer-chart');
if(section&&chart&&!document.getElementById('nx-history-picker')){
 const panel=document.createElement('div');panel.id='nx-history-picker';panel.className='nx-history-picker';
 panel.innerHTML='<div role="group" aria-label="Offer chart history"><button type="button" data-nx-history-current aria-pressed="true">Current offers</button><label>Historical month <input type="month" data-nx-history-month aria-label="Historical source month"></label><button type="button" data-nx-history-load>Show history</button></div><p class="small muted" data-nx-history-status role="status">Historical archive is optional; no history request is made until selected.</p><p class="small muted">Hourly advertised offers, not completed trades. The current summary cards stay on their selected current window. <a href="https://maplestory.market/?ref=v6kkdvp6" target="_blank" rel="noopener noreferrer">NX offers from maplestory.market</a></p>';
 chart.parentNode.insertBefore(panel,chart);
 const input=panel.querySelector('input'),button=panel.querySelector('[data-nx-history-current]'),status=panel.querySelector('[data-nx-history-status]');
 let timer=null,lastSnapshot=null;
 const visible=()=>!document.hidden&&!!section.getClientRects().length,online=()=>navigator.onLine!==false;
 const announce=state=>{
  button.setAttribute('aria-pressed',String(!state.selection));
  panel.querySelector('[data-nx-history-load]').setAttribute('aria-pressed',String(!!state.selection));
  panel.querySelector('[data-nx-history-load]').disabled=state.pending;input.disabled=state.pending;
  panel.dataset.status=state.status;
  const bounds=state.selection?windowLabel(state.selection):'';
  status.textContent=state.status==='current'?'Current offers selected; native 8h and derived 24h evidence are unchanged.':state.pending?'Loading selected historical source hours…':state.status==='accepted'?`Historical chart selected: ${bounds}. Only published hours are available; gaps are not filled.`:state.status==='retained'?`Previously accepted historical chart retained: ${bounds}. The requested refresh or selection did not replace it.`:state.status==='paused'?'History updates paused while this card is hidden or offline; accepted source times are retained.':state.status==='unpublished'?'Historical archive is not published yet. Current offers remain available.':state.status==='empty'?'No published source hours in that historical window. Current or previously accepted chart remains selected.':'Historical archive could not be validated or retrieved. Current or previously accepted chart remains selected.';
  document.dispatchEvent(new CustomEvent('astranxhistorychange',{detail:state}));
 };
 const controller=createNxHistoricalController({fetcher:(url,options)=>fetch(url,options),onChange:announce,isVisible:visible,isOnline:online});
 window.AstraNxHistory=Object.freeze({...controller});
 function schedule(){clearTimeout(timer);if(!visible()||!online()){controller.pause();return;}if(controller.state().selection)timer=setTimeout(async()=>{await controller.refresh();schedule();},60000);}
 button.addEventListener('click',()=>{controller.current();schedule();});
 panel.querySelector('[data-nx-history-load]').addEventListener('click',async()=>{if(!input.value){status.textContent='Choose a historical source month first.';input.focus();return;}try{await controller.selectMonth(input.value);}catch{status.textContent='Choose a valid historical source month.';}schedule();});
 document.addEventListener('click',event=>{if(event.target.closest('[data-smega-range]')){controller.current();schedule();}});
 document.addEventListener('astramarketsnapshot',event=>{lastSnapshot=event.detail?.snapshot||event.detail?.data||event.detail||lastSnapshot;if(!input.value&&lastSnapshot?.sourceUpdatedAt)input.value=lastSnapshot.sourceUpdatedAt.slice(0,7);});
 document.addEventListener('visibilitychange',schedule);window.addEventListener('offline',schedule);window.addEventListener('online',schedule);window.addEventListener('hashchange',schedule);window.addEventListener('pagehide',()=>{clearTimeout(timer);controller.pause();});
}
