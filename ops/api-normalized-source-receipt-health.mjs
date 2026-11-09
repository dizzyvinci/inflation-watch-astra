// Private scalar SQL attestations only. No body, raw/R2/HTTP, parsing or action.
import{apiIndexOwnerConfiguration,isOwnedOverviewIndexBridge}from'./api-index-owner-bridge.mjs';
import{EXPECTED_DEFINITION_HASH}from'./api-index-definition.mjs';
import{OWNER_NAME}from'./api-collector-core.mjs';
const H=/^[a-f0-9]{64}$/,REF=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/,KEY=/^_private\/provider-api\/v1\/receipts\/(\d{12,16})-(prices|overview)-([a-f0-9]{64})\.json$/;
const integer=(v,min=0)=>Number.isSafeInteger(v)&&v>=min,clock=v=>typeof v==='string'&&v.length===24&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const text=(v,max,alias)=>`CASE WHEN typeof(${v})='text' AND length(CAST(${v} AS BLOB))<=${max} THEN ${v} END ${alias}`;
const num=(v,alias)=>`CASE WHEN typeof(${v})='integer' AND ${v}>=0 AND ${v}<=9007199254740991 THEN ${v} END ${alias}`;
const need=v=>{if(!v)throw TypeError('normalized_source_receipt_metadata')};
const empty=status=>({status,verificationPins:null});
export function privateNormalizedSourceReceiptHealth(core,env,{checkedAt}={}){
 const cfg=apiIndexOwnerConfiguration(env);if(cfg.status==='disabled')return null;
 const base={diagnosticVersion:1,profile:'normalized_source_receipt_pins_v1',operatorCheckedAt:clock(checkedAt)?checkedAt:null,clockKind:'operator_check_not_market_observation',sourceSelection:'latest_applied_normalized_input_not_global_latest_receipt',ownerName:OWNER_NAME,sourceObservedAt:null,rawBodyRead:false,remoteR2ObjectVerification:'not_checked',upstreamLatestInspected:false,qualifiedIndividualTrades:0};
 const failure=status=>({...base,status,scope:null,lastCommittedModel:null,sources:{prices:empty('not_checked'),overview:empty('not_checked')}});
 if(cfg.status!=='ready'||cfg.definitionHash!==EXPECTED_DEFINITION_HASH)return failure('invalid_configuration');
 if(!clock(checkedAt))return failure('diagnostic_unavailable');
 try{
  const bridge=core.indexBridge,ctx=core.ctx,g=core.config(),at=Date.parse(checkedAt),configText=JSON.stringify(cfg);
  function context(){const c=apiIndexOwnerConfiguration(env),current=core.config();need(JSON.stringify(c)===configText&&bridge===core.indexBridge&&isOwnedOverviewIndexBridge(bridge,ctx,core,bridge.registry)&&bridge.active===true&&bridge.ctx===ctx&&bridge.core===core&&current.enabled===true&&current.grantReference===g.grantReference&&current.probeRound===g.probeRound&&bridge.binding.grantReference===g.grantReference&&bridge.binding.probeRound===g.probeRound&&REF.test(g.grantReference)&&REF.test(g.probeRound)&&integer(core.clock())&&at<=core.clock());}
  context();return ctx.storage.transactionSync(()=>{
   const control=()=>core.row(`SELECT ${text('o.definition_hash',64,'definition_hash')},${text('o.grant_ref',160,'grant_ref')},${text('o.round_ref',160,'round_ref')},${num('o.last_published','last_published')},${num('o.next_publication','next_publication')},CASE WHEN a.auth_stopped IN(0,1) THEN a.auth_stopped END auth_stopped FROM api_index_owner o JOIN api_control a ON a.id=o.id WHERE o.id=1`);
   const first=control();need(first&&first.definition_hash===EXPECTED_DEFINITION_HASH&&first.grant_ref===g.grantReference&&first.round_ref===g.probeRound&&integer(first.last_published)&&integer(first.next_publication)&&first.last_published<=first.next_publication&&first.auth_stopped===0);
   let committed=null;
   if(first.last_published>0){
    const rows=core.sql.exec(`SELECT ${num('publication_ordinal','ordinal')},${text('price_capture_hash',64,'prices_hash')},${text('overview_capture_hash',64,'overview_hash')},${text('prices_captured_at',24,'prices_at')},${text('overview_captured_at',24,'overview_at')},${text('calculated_at',24,'calculated_at')},CASE WHEN price_capture_hash IS NULL THEN 1 ELSE 0 END prices_null,CASE WHEN overview_capture_hash IS NULL THEN 1 ELSE 0 END overview_null,CASE WHEN prices_captured_at IS NULL THEN 1 ELSE 0 END prices_at_null,CASE WHEN overview_captured_at IS NULL THEN 1 ELSE 0 END overview_at_null FROM api_index_inputs WHERE publication_ordinal=? AND definition_hash=? AND state='complete' AND phase='done' LIMIT 2`,first.last_published,EXPECTED_DEFINITION_HASH).toArray();need(rows.length===1);const r=rows[0];need(r.ordinal===first.last_published&&clock(r.calculated_at)&&Date.parse(r.calculated_at)<=at);
    for(const op of['prices','overview'])need((r[op+'_null']===1&&r[op+'_at_null']===1&&r[op+'_hash']===null&&r[op+'_at']===null)||(r[op+'_null']===0&&r[op+'_at_null']===0&&H.test(r[op+'_hash'])&&clock(r[op+'_at'])&&Date.parse(r[op+'_at'])<=Date.parse(r.calculated_at)));
    committed={publicationOrdinal:r.ordinal,pricesCaptureHash:r.prices_hash,overviewCaptureHash:r.overview_hash,pricesCapturedAt:r.prices_at,overviewCapturedAt:r.overview_at,calculatedAt:r.calculated_at};
   }
   const sources={};for(const operation of['prices','overview']){
    // Four unique-key lookups: operation PK -> attempt PK -> job PK -> receipt UNIQUE.
    // Bodies never cross SQL. A missing/changed original completed source is not
    // reconstructed from a total count, a key guess, or a downloaded artifact.
    const r=core.row(`SELECT ${text('l.capture_hash',64,'capture_hash')},${text('l.captured_at',24,'captured_at')},${num('l.source_attempt','source_attempt')},${text('i.receipt_key',256,'receipt_key')},${text('i.raw_sha',64,'raw_sha')},${num('i.request_at','request_at')},
      CASE WHEN j.state='complete' AND j.last_result='success' AND j.operation=? AND j.round_ref=? AND j.attempt_id IS NULL AND j.lease_until IS NULL AND a.result='success' AND a.grant_ref=?
       AND i.operation=l.operation AND i.source_attempt=l.source_attempt AND i.job_key=j.job_key AND i.request_at=a.at AND i.definition_hash=? AND i.capture_hash=l.capture_hash AND i.captured_at=l.captured_at
       AND i.state IN('pending','running','complete','capacity_hold','quarantined') AND i.phase IN('compute','artifact','public-artifact','pointer','done') THEN 1 ELSE 0 END owned
      FROM api_index_latest l LEFT JOIN api_attempts a ON a.id=l.source_attempt LEFT JOIN api_jobs j ON j.job_key=a.job_key LEFT JOIN api_index_inputs i ON i.receipt_key=j.receipt_key WHERE l.operation=? LIMIT 1`,operation,g.probeRound,g.grantReference,EXPECTED_DEFINITION_HASH,operation);
    if(!r){sources[operation]=empty('no_normalized_source');continue}
    const m=typeof r.receipt_key==='string'?KEY.exec(r.receipt_key):null;
    if(r.owned!==1||!m||m[2]!==operation||!integer(r.source_attempt,1)||String(r.source_attempt).padStart(12,'0')!==m[1]||Number(m[1])!==r.source_attempt||!H.test(r.raw_sha)||m[3]!==r.raw_sha||!H.test(r.capture_hash)||!integer(r.request_at,1)||r.request_at>=8640000000000000||!clock(r.captured_at)||r.request_at>Date.parse(r.captured_at)||Date.parse(r.captured_at)>at){sources[operation]=empty('source_witness_unavailable');continue}
    const committedHash=committed?.[operation==='prices'?'pricesCaptureHash':'overviewCaptureHash'],committedAt=committed?.[operation==='prices'?'pricesCapturedAt':'overviewCapturedAt'];
    const relation=committed===null?'not_committed':committedHash===r.capture_hash&&committedAt===r.captured_at?'matches_committed_model_source':'different_from_committed_model_source';
    sources[operation]={status:'sql_bound',verificationPins:{operation,receiptKey:r.receipt_key,rawBodySha256:r.raw_sha,sourceAttemptId:r.source_attempt,requestStartedAt:new Date(r.request_at).toISOString(),capturedAt:r.captured_at,grantReference:g.grantReference,roundReference:g.probeRound,normalizedCaptureHash:r.capture_hash,committedModelRelation:relation}};
   }
   const last=control();need(JSON.stringify(first)===JSON.stringify(last));context();const count=Object.values(sources).filter(s=>s.status==='sql_bound').length;
   return{...base,status:count===2?'sql_bound':count?'partial':'no_bound_sources',scope:{definitionHash:EXPECTED_DEFINITION_HASH,grantReference:g.grantReference,roundReference:g.probeRound},lastCommittedModel:committed,sources};
  });
 }catch{return failure('diagnostic_unavailable')}
}
