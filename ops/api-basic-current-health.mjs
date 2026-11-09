// SQL-owned private Basic expectations only; no page/raw/R2 reads or source work.
import {basicCurrentConfiguration,basicPilotBudgetConfiguration,admitBasicPilotPolicy,isOwnedBasicCurrentRegistryDelegate,BASIC_CURRENT_CONTRACT_SHA} from './api-basic-current-registration.mjs';
const MAX=8640000000000000,tm=x=>Number.isSafeInteger(x)&&x>=0&&x<MAX,ni=x=>Number.isSafeInteger(x)&&x>=0,PHASES=['compile','write','replay','base','pointer','readback','review','committed'];
const text=(c,n)=>`CASE WHEN typeof(${c})='text' AND length(CAST(${c} AS BLOB))<=${n} THEN ${c} END ${c}`;
const number=c=>`CASE WHEN typeof(${c})='integer' AND ${c}>=0 AND ${c}<=9007199254740991 THEN ${c} END ${c}`;
const time=c=>`CASE WHEN typeof(${c})='integer' AND ${c}>=0 AND ${c}<${MAX} THEN ${c} END ${c}`;
export async function privateBasicCurrentHealth(core,env,options={}){
 const cfg=basicCurrentConfiguration(env);if(cfg.status!=='ready')return null;
 let delegate=null,checkedAt;try{delegate=options.delegate??null;checkedAt=options.checkedAt;}catch{}
 const at=typeof checkedAt==='string'&&checkedAt.length===24?Date.parse(checkedAt):NaN;
 const base={diagnosticVersion:1,profile:'basic_aggregate_v1',privateContractSha256:BASIC_CURRENT_CONTRACT_SHA,operatorCheckedAt:tm(at)&&new Date(at).toISOString()===checkedAt?checkedAt:null,
  sourceObservedAt:null,remoteGraphVerification:'not_checked',pagePayloadsRehashed:false,rawReceiptReparsed:false,bodyShaVerification:'producer_sql_attested_not_recomputed',upstreamLatestInspected:false,fullVariantFreshness:false,availabilityVerified:false,nativeResourceHeadroom:'not_checked'};
 const fail=status=>({...base,status,control:null,current:null,active:null,pending:null,verificationPins:null});
 if(base.operatorCheckedAt===null)return fail('diagnostic_unavailable');
 try{
  if(!isOwnedBasicCurrentRegistryDelegate(delegate,core.ctx,core,core.recurring)||delegate.status!=='ready'||!delegate.owner)return fail('registration_unavailable');
  const owner=delegate.owner,registry=delegate.registry,configText=JSON.stringify(cfg.value);
  const {B,source,scope,manifest,pointer,encode,eq,hash}=await import('./api-basic-current-contract.mjs');
  const {sha256,parseStrictJson}=await import('./api-price-item-dto.mjs');
  const need=v=>{if(!v)throw Error('basic_health_binding');};
  const expectedScope={grantReference:cfg.value.grantReference,roundReference:cfg.value.roundReference,epoch:cfg.value.epoch};
  function context(){const c=basicCurrentConfiguration(env),g=core.config();need(c.status==='ready'&&JSON.stringify(c.value)===configText&&g.enabled===true&&g.grantReference===expectedScope.grantReference&&g.probeRound===expectedScope.roundReference);
   need(isOwnedBasicCurrentRegistryDelegate(delegate,core.ctx,core,core.recurring)&&delegate.owner===owner&&delegate.registry===registry&&delegate.status==='ready'&&owner.enabled===true&&!owner.revoked&&owner.ctx===core.ctx&&owner.core===core&&owner.registry===registry&&registry===core.recurring.registry&&registry.core===core&&registry.ctx===core.ctx&&owner.bucket===env.API_RAW_RECEIPTS&&owner.isEnabled()===true&&core.recurring.active===true&&registry.enabled===true&&registry.isEnabled()===true&&eq(owner.scope,expectedScope));scope(owner.scope);need(tm(core.clock())&&at<=core.clock());}
  const parse=s=>parseStrictJson(new TextEncoder().encode(s));
  function witness(s){source(s);need(s.grantReference===expectedScope.grantReference&&s.roundReference===expectedScope.roundReference&&Date.parse(s.capturedAt)<=at);
   // Only scalar booleans/enums cross SQL. No unbounded original job/key/text is returned.
   const w=core.row(`SELECT CASE WHEN j.operation='prices' AND j.state='complete' AND j.round_ref=? AND j.receipt_key=? AND j.attempt_id IS NULL AND j.lease_until IS NULL
      AND a.at=? AND a.result='success' AND a.grant_ref=? AND r.operation='prices' AND r.source_attempt=? AND r.job_key=? AND r.request_at=? AND r.raw_sha=?
      AND (c.capture_hash IS NULL OR(c.operation='prices' AND c.source_attempt=? AND c.raw_sha=? AND c.request_started_at=? AND c.captured_at=?)) THEN 1 ELSE 0 END owned,
      CASE WHEN r.state IN ('pending','running','complete','capacity_hold','authority_review','quarantined') THEN r.state END registry_state,CASE WHEN c.capture_hash IS NULL THEN 0 ELSE 1 END normalized_capture
      FROM recurring_registry_jobs r JOIN api_jobs j ON j.job_key=? JOIN api_attempts a ON a.id=? AND a.job_key=j.job_key
      LEFT JOIN recurring_registry_captures c ON c.receipt_key=r.receipt_key WHERE r.receipt_key=?`,s.roundReference,s.receiptKey,Date.parse(s.requestAt),s.grantReference,s.attempt,s.jobKey,Date.parse(s.requestAt),s.rawSha,s.attempt,s.rawSha,s.requestAt,s.capturedAt,s.jobKey,s.attempt,s.receiptKey);
   need(w?.owned===1&&['pending','running','complete','capacity_hold','authority_review','quarantined'].includes(w.registry_state)&&[0,1].includes(w.normalized_capture));return w;
  }
  function snapshot(){context();return core.ctx.storage.transactionSync(()=>{
   const c=core.row(`SELECT ${text('scope_json',4096)},${number('owner_epoch')},${time('retry_at')},CASE WHEN action_token IS NULL THEN 0 WHEN typeof(action_token)='text' AND length(CAST(action_token AS BLOB))<=256 THEN 1 ELSE -1 END action_pending,
      ${text('missing_json',4096)},CASE WHEN missing_json IS NULL THEN 0 ELSE 1 END missing_present FROM basic_control WHERE id=1`);
   const a=core.row("SELECT CASE WHEN a.auth_stopped IN (0,1) THEN a.auth_stopped END auth_stopped,CASE WHEN r.grant_ref=? AND r.round_ref=? THEN 1 ELSE 0 END registry_scope_ok FROM api_control a JOIN recurring_registry_scope r ON r.id=a.id WHERE a.id=1",expectedScope.grantReference,expectedScope.roundReference);
   need(c&&typeof c.scope_json==='string'&&eq(scope(parse(c.scope_json)),expectedScope)&&ni(c.owner_epoch)&&c.owner_epoch===owner.ownerEpoch&&tm(c.retry_at)&&[0,1].includes(c.action_pending)&&a?.auth_stopped===0&&a.registry_scope_ok===1);
   const rows=core.sql.exec(`SELECT ${text('gid',64)},${text('source_json',4096)},${text('body_sha',64)},CASE WHEN role IN ('current','active','pending') THEN role END role,
      CASE WHEN phase IN (${PHASES.map(()=>'?').join(',')}) THEN phase END phase,${text('manifest_raw',65536)},CASE WHEN manifest_raw IS NULL THEN 1 ELSE 0 END manifest_null,
      ${text('manifest_sha',64)},CASE WHEN manifest_sha IS NULL THEN 1 ELSE 0 END manifest_sha_null,${text('pointer_raw',4096)},CASE WHEN pointer_raw IS NULL THEN 1 ELSE 0 END pointer_null,
      CASE WHEN typeof(cursor)='integer' AND cursor BETWEEN -1 AND 40 THEN cursor END cursor,${number('claim')},${number('owner_epoch')},CASE WHEN owner_epoch IS NULL THEN 1 ELSE 0 END epoch_null,
      ${time('lease_until')},CASE WHEN lease_until IS NULL THEN 1 ELSE 0 END lease_null
      FROM basic_generations INDEXED BY basic_live_role WHERE role IN ('pending','active','current','recovery') AND role!='recovery' LIMIT 4`,...PHASES).toArray();
   need(rows.length<=3&&new Set(rows.map(r=>r.role)).size===rows.length);const proofs=[];
   for(const r of rows){need(['current','active','pending'].includes(r.role)&&PHASES.includes(r.phase)&&hash(r.gid)&&hash(r.body_sha)&&typeof r.source_json==='string'&&ni(r.claim)&&Number.isSafeInteger(r.cursor)&&r.cursor>=-1&&r.cursor<=40&&([0,1].includes(r.epoch_null))&&([0,1].includes(r.lease_null))&&(r.epoch_null===1||ni(r.owner_epoch))&&(r.lease_null===1||tm(r.lease_until)));
    need((r.manifest_null===1||typeof r.manifest_raw==='string')&&(r.pointer_null===1||typeof r.pointer_raw==='string')&&(r.manifest_sha_null===1||hash(r.manifest_sha)));
    if(r.role==='current')need(r.phase==='committed'&&r.lease_null===1&&r.claim>=1&&ni(r.owner_epoch)&&r.owner_epoch<=c.owner_epoch);
    if(r.role==='pending')need(r.phase==='compile'&&r.manifest_null===1&&r.pointer_null===1&&r.manifest_sha_null===1);
    if(r.role==='active')need(r.phase!=='committed');proofs.push(witness(parse(r.source_json)));
   }
   const missing=c.missing_present===1?(need(typeof c.missing_json==='string'),parse(c.missing_json)):null;if(missing)proofs.push(witness(missing));
   return{control:c,auth:a,rows,proofs};
  });}
  const first=snapshot(),results=[];let pins=null;
  for(const r of first.rows){const s=source(parse(r.source_json));need(await sha256(encode({source:s,scope:expectedScope}))===r.gid);let graph=null;
   if(r.manifest_null===0||r.pointer_null===0||r.manifest_sha_null===0){need(typeof r.manifest_raw==='string'&&typeof r.pointer_raw==='string'&&hash(r.manifest_sha));const m=manifest(parse(r.manifest_raw)),p=pointer(parse(r.pointer_raw));need(eq(m.source,s)&&eq(p.source,s)&&eq(m.scope,expectedScope)&&eq(p.scope,expectedScope)&&m.generation===r.gid&&p.generation===r.gid&&p.manifestSha===r.manifest_sha&&p.manifestBytes===encode(m).length&&JSON.stringify(m)===r.manifest_raw&&JSON.stringify(p)===r.pointer_raw&&await sha256(encode(m))===r.manifest_sha);const pointerSha=await sha256(encode(p));graph={manifestSha256:r.manifest_sha,manifestBytes:encode(m).length,pointerSha256:pointerSha,itemCount:m.itemCount,pageCount:m.pages.length,totalPageBytes:m.totalBytes,membershipSha256:m.membershipSha};
    if(r.role==='current')pins={privateContractSha256:BASIC_CURRENT_CONTRACT_SHA,generation:r.gid,pointerSha256:pointerSha,manifestSha256:r.manifest_sha,manifestBytes:encode(m).length,bodySha256:r.body_sha,source:s,scope:parse(first.control.scope_json),sourceJobState:'complete',sourceAttemptResult:'success',sourceLiveAttemptId:null,sourceLeaseCleared:true,basicGenerationRole:'current',basicGenerationPhase:'committed'};
   }
   if(r.role==='current')need(pins!==null);results.push({role:r.role,generation:r.gid,phase:r.phase,sourceAttempt:s.attempt,sourceCapturedAt:s.capturedAt,sourceBodySha256:s.rawSha,claim:r.claim,ownerEpoch:r.epoch_null===1?null:r.owner_epoch,leaseUntil:r.lease_null===1?null:new Date(r.lease_until).toISOString(),graph});
  }
  const second=snapshot();need(JSON.stringify(second)===JSON.stringify(first));context();
  const by=role=>results.find(r=>r.role===role)??null,physical=!!owner.pool?.task,unknown=!!owner.pool?.unknown||first.control.action_pending===1&&!physical;
  const intents=first.rows.filter(r=>r.role!=='current').map(r=>parse(r.source_json));if(first.control.missing_present===1)intents.push(parse(first.control.missing_json));const newer=pins?intents.some(s=>s.capturedAt>pins.source.capturedAt||s.capturedAt===pins.source.capturedAt&&s.attempt>pins.source.attempt):null;
  const output={...base,status:pins?'committed':'awaiting_current',control:{ownerEpoch:first.control.owner_epoch,retryAt:new Date(first.control.retry_at).toISOString(),actionPending:first.control.action_pending===1,physicalPendingInCurrentInstance:physical,physicalSettlementUnknown:unknown,capturePreparationPending:owner.capturePending===true,basicIntentPresent:intents.length>0,newerBasicObservedIntentPresent:newer,upstreamLatestInspected:false},current:by('current'),active:by('active'),pending:by('pending'),verificationPins:pins,sourceBindings:first.proofs.map(w=>({completedOwnedApiReceipt:true,normalRegistryState:w.registry_state,normalizedRegistryCaptureBound:w.normalized_capture===1})),verificationScope:'original_completed_owned_source_and_committed_sql_metadata_not_remote_pages'};
  need(new TextEncoder().encode(JSON.stringify(output)).length<=16384);return output;
 }catch{if(basicCurrentConfiguration(env).status!=='ready')return null;return fail('diagnostic_unavailable');}
}

// Separate optional namespace; the original Basic21-key/SQL14 diagnostic above
// is unchanged. Policy-only requires_private performs no Core/SQL/bucket access.
export async function privateBasicPilotBudgetHealth(core,env,{delegate=null,checkedAt=null}={}){
 const cfg=basicCurrentConfiguration(env),p=basicPilotBudgetConfiguration(env,cfg.status==='ready'?cfg.value:null);
 if(p.status==='disabled')return null;
 const iso=x=>typeof x==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(x)&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString()===x;
 const out={schemaVersion:1,kind:'private_basic_pilot_budget_v1',status:'diagnostic_unavailable',operatorCheckedAt:iso(checkedAt)?checkedAt:null,policySha256:null,scope:null,limits:null,sourceNotBefore:null,activatedAt:null,expiresAt:null,effectiveSourceFloor:null,usedGenerations:null,reservedPutBodyBytes:null,reservationRows:null,physicalPendingInCurrentInstance:null,physicalSettlementUnknown:null,remoteObjectsEnumerated:false,rawHistoryDeleted:false,publicServiceAuthorized:false,continuousServiceReady:false};
 const unavailable=()=>({...out,status:'diagnostic_unavailable',activatedAt:null,expiresAt:null,effectiveSourceFloor:null,usedGenerations:null,reservedPutBodyBytes:null,reservationRows:null,physicalPendingInCurrentInstance:null,physicalSettlementUnknown:null});
 // Every delivery branch re-admits current config. Budget Off omits even when
 // the private producer was Off initially; an On rebound is a review result.
 const finish=value=>{const c=basicCurrentConfiguration(env),q=basicPilotBudgetConfiguration(env,c.status==='ready'?c.value:null);if(q.status==='disabled')return null;if(q.status!=='ready'||p.status!=='ready'||JSON.stringify(c)!==JSON.stringify(cfg)||JSON.stringify(q.value)!==JSON.stringify(p.value))return unavailable();return value;};
 try{if(p.status!=='ready'||!iso(checkedAt))return finish(out);const policy=await admitBasicPilotPolicy(p);const afterHash=finish(out);if(afterHash!==out)return afterHash;out.policySha256=policy.sha256;out.scope={grantReference:p.value.grantReference,roundReference:p.value.roundReference,epoch:p.value.privateEpoch};out.limits={maxCapturedGenerations:p.value.maxCapturedGenerations,maxReservedRemoteBytes:p.value.maxReservedRemoteBytes,maxReservationRows:p.value.maxReservationRows,windowMs:p.value.windowMs};out.sourceNotBefore=p.value.sourceNotBefore;
  if(cfg.status!=='ready'){out.status=cfg.status==='disabled'?'requires_private':'diagnostic_unavailable';return finish(out);}
  if(!isOwnedBasicCurrentRegistryDelegate(delegate,core.ctx,core,core.recurring)||delegate.status!=='ready'||!delegate.owner)return finish(out);
  const o=delegate.owner;if(!o.active||o.ctx!==core.ctx||o.core!==core||o.registry!==core.recurring.registry||o.pilot?.sha256!==policy.sha256||o.pilot.text!==policy.text||o.bucket!==env.API_RAW_RECEIPTS)return finish(out);
  const r=o.pilotState(false),at=Date.parse(checkedAt);if(at<r.high_water||at>core.clock())return finish(out);
  out.status=r.state!=='ready'?r.state:at>=r.expires_at?'expired':r.used_generations>=p.value.maxCapturedGenerations||r.used_bytes>=p.value.maxReservedRemoteBytes||r.used_rows>=p.value.maxReservationRows?'exhausted':'ready';
  out.activatedAt=new Date(r.started_at).toISOString();out.expiresAt=new Date(r.expires_at).toISOString();out.effectiveSourceFloor=new Date(Math.max(r.started_at,Date.parse(p.value.sourceNotBefore))).toISOString();out.usedGenerations=r.used_generations;out.reservedPutBodyBytes=r.used_bytes;out.reservationRows=r.used_rows;out.physicalPendingInCurrentInstance=!!o.pool.task;out.physicalSettlementUnknown=o.pool.unknown===true||o.control().action_token!==null&&!out.physicalPendingInCurrentInstance;if(out.physicalSettlementUnknown)out.status='physical_unknown_hold';else if(out.physicalPendingInCurrentInstance)out.status='physical_pending';
  const closing=basicPilotBudgetConfiguration(env,cfg.value);if(closing.status!=='ready'||JSON.stringify(closing.value)!==policy.text||!o.active)throw Error();return finish(out);
 }catch{return finish(unavailable());}
}
