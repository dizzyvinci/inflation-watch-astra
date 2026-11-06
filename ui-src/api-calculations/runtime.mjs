// WORK browser runtime. Own-site refresh only; no server work is triggered by a visitor.
import{createApiCalculationClient}from'./client.mjs';
import{calculationView,calculationHeadline,calculationItemEvidenceView}from'./view-model.mjs';
export function createCalculationRuntime({origin,available,parse,definitionHash,unpackDaily,itemDefinitions=null,fetcher=fetch,now=()=>Date.now(),selection=()=>({mode:'rolling',windowDays:7}),notify=()=>{}}){
 let legacy=null,view=null,cacheKey=null,bindingError=null,notificationKey=null,itemView=null,itemKey=null,itemBindingError=null;const captured=[];
 const definitions=available===true&&itemDefinitions?structuredClone(itemDefinitions):null;
 const client=available===true?createApiCalculationClient({origin,parse,expectedDefinitionHash:definitionHash,fetcher,now,onChange:state=>{
  const key=[state.snapshot?.snapshotHash??null,state.status,state.readerMode,state.reason,state.evidenceSnapshot?.snapshotHash??null,state.evidenceStatus,state.evidenceReaderMode,state.evidenceReason];
  const changed=!notificationKey||key.some((value,i)=>value!==notificationKey[i]);
  if(changed){cacheKey=null;view=null;itemKey=null;itemView=null;notificationKey=key;}
  if(state.changed&&state.snapshot){const dto=state.snapshot;captured.push({snapshotHash:dto.snapshotHash,at:dto.maxInputCapturedAt??dto.sources.prices.capturedAt,pricesCapturedAt:dto.sources.prices.capturedAt,overviewCapturedAt:dto.sources.overview?.capturedAt??null,currentIndex:dto.current.index,fixed:dto.benchmarks.fixed.rateMesosPerNx,rolling7:dto.benchmarks.rolling7.rateMesosPerNx,rolling3:dto.benchmarks.rolling3.rateMesosPerNx});if(captured.length>128)captured.shift();}
  if(changed)notify(state);
 }}):Object.freeze({state:()=>({snapshot:null,status:'off',readerMode:null,reason:null,blocked:false,nextCheckAt:Infinity})});
 function getView(){const state=client.state();if(!legacy||!state.snapshot)return null;const chosen=selection(),key=[state.snapshot.snapshotHash,chosen.mode,chosen.windowDays];
  if(!cacheKey||key.some((v,i)=>v!==cacheKey[i])){try{view=calculationView(legacy,state.snapshot,chosen);bindingError=null;}catch{view=null;bindingError='legacy_calculation_definition_mismatch';}cacheKey=key;}
  return view;
 }
 function getItemEvidence(){const state=client.state();if(!legacy||!state.evidenceSnapshot||!definitions)return null;
  const key=[state.evidenceSnapshot.snapshotHash,state.evidenceStatus,state.evidenceReason];
  if(!itemKey||key.some((v,i)=>v!==itemKey[i])){try{itemView=calculationItemEvidenceView(legacy,state.evidenceSnapshot,{definitions,dailyItems:unpackDaily(state.evidenceSnapshot),status:state.evidenceStatus,reason:state.evidenceReason});itemBindingError=null;}catch{itemView=null;itemBindingError='legacy_item_evidence_definition_mismatch';}itemKey=key;}
  return itemView;
 }
 const api={available:available===true,
  setLegacy(report){if(!report||!Array.isArray(report.rows)||report.rows.length!==50)return false;if(legacy!==report){legacy=report;cacheKey=null;view=null;itemKey=null;itemView=null;}return true;},
  getView,getItemEvidence,headline(){return getView()?.headline??null;},
  state(){return {...client.state(),available:available===true,hasBoundLegacy:!!legacy,bindingError,itemBindingError};},
  async refresh(){if(available!==true)return api.state();await client.refresh();return api.state();},
  dailyItems(){const dto=client.state().snapshot;return dto?unpackDaily(dto):[];},
  overlayReport(report){const current=getView(),items=getItemEvidence(),base=current?{...report,rows:current.rows,categories:current.categories,apiCalculationView:current,apiDailyItems:api.dailyItems()}:report;if(items)return{...base,apiItemEvidence:items};if(Object.hasOwn(base,'apiItemEvidence')){const{apiItemEvidence:_old,...without}=base;return without;}return base;},
  capturePoints(){return captured.map(point=>({...point}));},
  sourceSeries(metric){const dto=client.state().snapshot;if(!dto||!getView())return [];const chosen=selection();
   if(metric==='observed-nx'||metric==='cpi'){
    const observed=metric==='observed-nx';const points=dto.daily.history.filter(p=>Number.isFinite(observed?p.nxRate:p.index)&&(!observed||p.cashItems>=3)).map(p=>({at:p.day+'T12:00:00Z',day:p.day,value:observed?p.nxRate:p.index,kind:observed?'api_overview_daily_cash_reference':'api_linked_daily_mpi',datePrecision:'day',partial:p.partialCalendarDay,backcast:p.backcast,referenceNote:observed?'API source-day cash-item sale-median reference; not individual trades.':'Retrospectively linked API daily price index; not a live trade observation.'}));
    return [{id:observed?'api-observed-nx':'api-linked-mpi',name:observed?'API daily cash-sale reference':'API-linked daily MPI',color:observed?'#edc471':'#87bdcf',fill:false,dash:true,maxGapMs:129600000,points}];
   }
   const modes=chosen.mode==='compare'?['fixed','rolling'+chosen.windowDays]:[chosen.mode==='fixed'?'fixed':'rolling'+chosen.windowDays];
   return modes.map(mode=>({id:'api-'+mode,name:mode==='fixed'?'API 3-day reference · fixed anchor':`API 3-day reference · ${chosen.windowDays}-day anchor`,color:mode==='fixed'?'#edc471':'#87bdcf',fill:false,maxGapMs:900000,points:captured.filter(p=>Number.isFinite(p[mode])&&p[mode]>0).map(p=>({at:p.at,value:p[mode],kind:'api_captured_3day_goods_nx_model',datePrecision:'capture',snapshotHash:p.snapshotHash,referenceNote:`Latest input HTTP capture; prices captured ${p.pricesCapturedAt}, daily source captured ${p.overviewCapturedAt??'unknown'}. Underlying trades and exact three-day bounds are unknown. Browser capture points are session-only; the owner retains its separate durable calculation archive.`}))}));
  }
 };
 return Object.freeze(api);
}
