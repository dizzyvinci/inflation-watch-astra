// WORK-only curated private-health addition. No writes, source transport or raw rows.
const HASH=/^[0-9a-f]{64}$/;
const URLS={'nx-rate':'https://maplestory.market/api/nx-rate','nx-history':'https://maplestory.market/api/nx-rate/history?range=7d&step=hour'};
const integer=v=>Number.isSafeInteger(v)&&v>=0;
const clock=v=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?Z$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,19)===v.slice(0,19);
function configuration(env,core){try{
 const v=JSON.parse(env.API_PRIVATE_NX_JSON??'{"enabled":false}');if(v?.enabled===false)return'disabled';
 if(!v||Object.keys(v).sort().join(',')!=='enabled,methodVersion,publicationEnabled,schemaVersion'||v.enabled!==true||v.schemaVersion!==1||v.methodVersion!==1||v.publicationEnabled!==false)return'invalid_configuration';
 return core.config().enabled===true?'ready':'requires_enabled_grant';
}catch{return'invalid_configuration';}}
export function privateNxHealth(core,env){
 const cfg=configuration(env,core),base={diagnosticVersion:1,configuration:cfg,publicationEligible:false,sourceObservedAt:null,qualifiedIndividualTrades:0,clockKind:'producer_state_and_original_receipt_clocks_not_new_market_observation'};
 if(cfg!=='ready')return{...base,status:'disabled_or_unavailable'};
 try{
  const tables=core.sql.exec("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('private_nx_captures','private_nx_latest','private_nx_revisions')").toArray();
  if(tables.length!==3)return{...base,status:'not_initialized'};
  const latestCaptures=[];
  for(const operation of ['nx-rate','nx-history']){
   const r=core.row("SELECT source_attempt,raw_sha,captured_at FROM private_nx_captures WHERE operation=? AND state='complete' ORDER BY captured_at DESC,source_attempt DESC LIMIT 1",operation);
   if(r){if(!integer(r.source_attempt)||r.source_attempt<1||!HASH.test(r.raw_sha)||!clock(r.captured_at))throw TypeError('invalid_capture');latestCaptures.push({operation,attemptId:r.source_attempt,rawSha256:r.raw_sha,capturedAt:r.captured_at});}
  }
  const counts={pending:0,running:0,complete:0,quarantined:0};for(const r of core.sql.exec('SELECT state,COUNT(*) AS count FROM private_nx_captures GROUP BY state').toArray()){if(!Object.hasOwn(counts,r.state)||!integer(r.count))throw TypeError('invalid_count');counts[r.state]=r.count;}
  const hourly=core.row("SELECT COUNT(*) AS rows,COUNT(DISTINCT hour_label) AS hours,MIN(hour_label) AS first_hour,MAX(hour_label) AS last_hour FROM private_nx_latest WHERE source_url=? AND side IN ('buy','sell')",URLS['nx-history']);
  const revisions=core.row("SELECT COUNT(*) AS n FROM private_nx_revisions WHERE source_url=? AND side IN ('buy','sell')",URLS['nx-history']);
  const summaries=core.row("SELECT COUNT(*) AS n FROM private_nx_revisions WHERE source_url=? AND side='summary'",URLS['nx-rate']);
  if(![hourly.rows,hourly.hours,revisions.n,summaries.n].every(integer)||hourly.hours>hourly.rows||hourly.rows>2*hourly.hours||revisions.n<hourly.rows||hourly.rows>0&&(!clock(hourly.first_hour)||!clock(hourly.last_hour)||Date.parse(hourly.first_hour)%3600000!==0||Date.parse(hourly.last_hour)%3600000!==0))throw TypeError('invalid_hour_state');
  // SQLite JSON extraction returns ONLY the curated scalar summary metadata.
  const s=core.row("SELECT captured_at,source_attempt,json_extract(body,'$.reportedWindowHours') AS native_hours,json_extract(body,'$.sourceLastHeardAt') AS heard,json_extract(body,'$.sourceLimited') AS limited FROM private_nx_latest WHERE source_url=? AND hour_label='native_summary' AND side='summary'",URLS['nx-rate']);
  let nativeSummary=null;if(s){if(!clock(s.captured_at)||!integer(s.source_attempt)||!Number.isSafeInteger(s.native_hours)||s.native_hours<1||s.native_hours>8784||s.heard!==null&&!clock(s.heard)||![0,1].includes(s.limited))throw TypeError('invalid_summary');nativeSummary={capturedAt:s.captured_at,attemptId:s.source_attempt,reportedWindowHours:s.native_hours,sourceLastHeardAt:s.heard,sourceLimited:s.limited===1,exactWindowBoundsKnown:false,meaning:'native_source_summary_not_derived_hourly_pool'};}
  return{...base,status:'private_only',latestCaptures,captures:counts,nativeSummary,
   history:{latestSourceHourSideRows:hourly.rows,uniqueSourceHourLabels:hourly.hours,firstRetainedSourceHourLabel:hourly.first_hour,lastRetainedSourceHourLabel:hourly.last_hour,changedRowRevisions:revisions.n,bucketCompletionKnown:false,countMeaning:'row_counts_not_summed_posters_people_trades_or_volume'},
   nativeSummaryChangedRevisions:summaries.n,r2ProjectionAvailable:false};
 }catch{return{...base,status:'diagnostic_unavailable'};}
}
