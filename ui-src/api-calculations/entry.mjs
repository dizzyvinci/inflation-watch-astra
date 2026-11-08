// Canonical-relative browser entry; generated offline into web/api-calculations.js.
import{parseApiIndexSnapshot,unpackApiDailyItemHistory}from'../../ops/api-index-public-contract.mjs';
import definition from'../../ops/api-index-definition-data-v1.json'with{type:'json'};
import{createCalculationRuntime}from'./runtime.mjs';
import{createOverviewActivityIntegration}from'../overview-activity/integration.mjs';
const doc=document,available=doc.body.dataset.apiCalculationsAvailable==='true';
const EXPECTED='865944dc992219e01b2aad45a6191174d112f3f1902e4ac86c79a6d23a481e17';
let timer=null,running=false,activity=null;
const runtime=createCalculationRuntime({origin:location.origin,available,definitionHash:EXPECTED,
 parse:bytes=>parseApiIndexSnapshot(bytes,{expectedDefinitionHash:EXPECTED,expectedRows:definition.goods,expectedCashRows:definition.cash}),
 unpackDaily:unpackApiDailyItemHistory,itemDefinitions:definition,selection:()=>{const s=window.AstraRollingBenchmark?.getState();return {mode:s?.mode||'rolling',windowDays:s?.windowDays||7};},
 notify:state=>{activity?.observeParent();doc.dispatchEvent(new CustomEvent('astracalculationchange',{detail:{status:state.status,readerMode:state.readerMode,snapshotHash:state.snapshot?.snapshotHash??null,evidenceSnapshotHash:state.evidenceSnapshot?.snapshotHash??null}}));}});
window.AstraApiCalculations=runtime;
activity=createOverviewActivityIntegration({document:doc,window,parentAvailable:available,parentState:()=>runtime.state(),fetcher:(...args)=>fetch(...args)});
window.AstraOverviewWindowActivity=activity;
const visible=()=>!doc.hidden&&navigator.onLine!==false;
async function poll(){if(!available||running||!visible())return;running=true;try{await runtime.refresh();}finally{running=false;activity.afterOwnedCheck();doc.dispatchEvent(new Event('astracalculationcheck'));clearTimeout(timer);if(!runtime.state().blocked&&visible())timer=setTimeout(poll,Math.max(1000,runtime.state().nextCheckAt-Date.now()));}}
doc.addEventListener('visibilitychange',()=>{if(!visible())clearTimeout(timer);else void poll();});
window.addEventListener('online',()=>void poll());window.addEventListener('offline',()=>clearTimeout(timer));
doc.addEventListener('input',event=>{if(event.target?.matches?.('#price-check-header-query,#price-check-query'))void poll();});
doc.getElementById('refresh')?.addEventListener('click',()=>void poll());
if(available)void poll();
