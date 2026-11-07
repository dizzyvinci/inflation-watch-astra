// Optional same-owner SQL graph expectations. No remote reads or source work.
import {fastCurrentRegistrationConfiguration,isOwnedFastCurrentRegistryDelegate} from './api-fast-current-registration.mjs';
import {isOwnedFastV2Journal} from './api-fast-current-continuous-journal.mjs';
import {assertFastManifest} from './api-fast-current-projection.mjs';
import {parseStrictJson,sha256} from './api-price-item-dto.mjs';
const enc=new TextEncoder(),H=/^[a-f0-9]{64}$/,PREFIX='_private/provider-api/v1/fast-current/v1/';
const need=v=>{if(!v)throw Error('fast_committed_sql_metadata')},n=(v,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const iso=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b),bytes=s=>enc.encode(s).length;
const closed=(v,s)=>need(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join('|')===s.split(' ').sort().join('|'));
const parse=(s,max)=>{need(typeof s==='string'&&bytes(s)>0&&bytes(s)<=max);return parseStrictJson(enc.encode(s))};
// Column names and bounds are local constants, never caller-controlled SQL.
const text=(name,max)=>`CASE WHEN typeof(${name})='text' AND length(CAST(${name} AS BLOB)) BETWEEN 1 AND ${max} THEN ${name} END ${name.split('.').at(-1)}`;
const clock=(v,now)=>{need(v===null||n(v,0,now));return v===null||v===0?null:new Date(v).toISOString()};
const base=(status,checkedAt)=>({diagnosticVersion:1,profile:'registered_control_and_committed_sql_pins',operatorCheckedAt:checkedAt,status,
 sourceObservedAt:null,remoteGraphVerification:'not_checked',independentlyVerifiedRemoteGraph:false,
 originalAdmissionProfileAttestation:'not_checked',rawReprojectionEquivalence:'not_checked',publicReaderRegistered:false,
 publicationEligible:false,qualifiedIndividualTrades:0,control:null,verificationPins:null,provenance:null});
const holds=new Set(['spool_capacity_hold','continuous_action_review_or_retry','protected_recovery_hold','spool_or_physical_capacity_hold','optional_provenance_capacity_hold','metadata_history_capacity_hold','optional_profile_bound_hold','reprojection_review_hold']);
function owned(core,delegate){
 need(isOwnedFastCurrentRegistryDelegate(delegate,core.ctx,core,core.recurring));const w=delegate.inner;
 if(!w)return null;const j=w.journal;
 need(w.ctx===core.ctx&&w.core===core&&w.registryWork===core.recurring&&isOwnedFastV2Journal(j,core.ctx,core,w.sink)&&w.publication?.adapter===j&&w.writer?.sink===w.sink);
 need(j.bucket===core.env.API_RAW_RECEIPTS);return w;
}
// Each query selects only fixed control/metadata rows, never receipt/shard bodies.
// Text projections are byte-gated in SQLite BEFORE crossing the JS boundary.
function snapshot(core,w){return core.ctx.storage.transactionSync(()=>{
 const row=(q,...a)=>core.row(q,...a),all=(q,...a)=>core.sql.exec(q,...a).toArray();
 const c=row(`SELECT ${text('policy_json',2048)},epoch,selected_receipt IS NOT NULL AS selected,pending_source IS NOT NULL AS pending,retry_at,${text('hold_reason',128)},hold_reason IS NOT NULL AS hold_present,action_token IS NOT NULL AS action_pending,${text('action_kind',32)},action_kind IS NOT NULL AS action_kind_present,missing_profile_attempt FROM fast_v2_control WHERE id=1`);
 need(c&&c.policy_json===w.journal.policy&&c.epoch===w.journal.epoch);
 const auth=row('SELECT auth_stopped FROM api_control WHERE id=1');need(auth&&[0,1].includes(auth.auth_stopped));
 const owner=row(`SELECT ${text('grant_ref',64)},${text('round_ref',64)},${text('policy_json',2048)},epoch,serial,${text('current_pointer',4096)},${text('current_sha',64)} FROM fast_v2_publication_owner WHERE id=1`);
 need(owner&&owner.epoch===w.publication.epoch&&owner.policy_json===w.journal.policy);
 const current=all(`SELECT ${['generation_id','raw_sha','manifest_sha','registry_capture_hash','membership_sha','pointer_sha','descriptor_sha'].map(v=>text(v,64)).join(',')},${text('receipt_key',512)},source_attempt,request_at,${text('captured_at',24)},slot,slot_epoch,${text('state',32)},${text('role',32)},manifest_bytes,item_count,shard_count,publication_ordinal,committed_at,readback_at,payload_released,
 CASE WHEN length(CAST(source_json AS BLOB))<=4096 THEN source_json END source_json,
 CASE WHEN length(CAST(metadata_json AS BLOB))<=65536 THEN metadata_json END metadata_json,
 CASE WHEN length(CAST(pointer_json AS BLOB))<=4096 THEN pointer_json END pointer_json,
 CASE WHEN length(CAST(descriptor_json AS BLOB))<=4096 THEN descriptor_json END descriptor_json,
 CASE WHEN length(CAST(write_json AS BLOB))<=8192 THEN write_json END write_json
 FROM fast_v2_generations WHERE generation_id IN (SELECT generation_id FROM fast_v2_slots WHERE slot IN (1,2,3)) AND role='current' LIMIT 2`);need(current.length<=1);
 const writer=row(`SELECT ${text('state',32)},${text('phase',32)},next_index,slot,retry_at,lease_until FROM fast_current_write_jobs WHERE slot=(SELECT slot FROM fast_v2_generations WHERE receipt_key=(SELECT selected_receipt FROM fast_v2_control WHERE id=1))`);
 const publication=row(`SELECT ${text('state',32)},${text('phase',32)},replay_index,manifest_verified,retry_at,lease_until FROM fast_v2_publication_job WHERE id=1`);
 if(!current.length)return{c,auth,owner,current,writer,publication};
 const g=current[0],s=parse(g.source_json,4096);closed(s,'receiptKey jobKey operation sourceAttemptId requestAt rawSha256 sourceUrl grantReference roundReference');
 need(typeof s.jobKey==='string'&&bytes(s.jobKey)<=512&&typeof g.receipt_key==='string');const match=/^_private\/provider-api\/v1\/receipts\/(\d{12,16})-prices-([a-f0-9]{64})\.json$/.exec(g.receipt_key);
 need(match&&String(Number(match[1])).padStart(12,'0')===match[1]&&n(Number(match[1]),1));
 // Same completed owned job/attempt admission as ownedCalculationSource, with
 // SQL-side string caps so damaged metadata cannot allocate an unbounded body.
 const original=row(`SELECT ${['j.job_key','j.operation','j.state','j.round_ref','j.receipt_key','a.result','a.grant_ref'].map(v=>text(v,v.endsWith('receipt_key')||v.endsWith('job_key')?512:64)).join(',')},a.id,a.at FROM api_jobs j JOIN api_attempts a ON a.job_key=j.job_key AND a.id=? WHERE j.job_key=?`,Number(match[1]),s.jobKey);
 const scope=core.config();need(original&&original.state==='complete'&&original.operation==='prices'&&original.round_ref===scope.probeRound&&original.receipt_key===g.receipt_key&&original.result==='success'&&original.grant_ref===scope.grantReference&&n(original.at,1,core.clock()));
 need(same(s,{receiptKey:g.receipt_key,jobKey:original.job_key,operation:'prices',sourceAttemptId:original.id,requestAt:original.at,rawSha256:match[2],sourceUrl:'https://maplestory.market/api/prices',grantReference:scope.grantReference,roundReference:scope.probeRound}));
 const capture=row(`SELECT ${text('receipt_key',512)},${text('operation',32)},source_attempt,${text('raw_sha',64)},${text('request_started_at',24)},${text('captured_at',24)},${text('capture_hash',64)},${text('set_hash',64)},id_count FROM recurring_registry_captures WHERE receipt_key=?`,g.receipt_key);
 const job=row(`SELECT ${text('state',32)},claim,lease_until FROM recurring_registry_jobs WHERE receipt_key=?`,g.receipt_key);
 const apiJob=row(`SELECT ${text('state',32)},attempt_id,${text('operation',32)},${text('round_ref',64)},${text('receipt_key',512)} FROM api_jobs WHERE job_key=?`,s.jobKey);
 const slot=row(`SELECT slot_epoch,${text('generation_id',64)},${text('state',32)} FROM fast_v2_slots WHERE slot=?`,g.slot);
 const stage=row(`SELECT ${text('receipt_key',512)},${text('captured_at',24)},${text('membership_sha',64)},${text('state',32)},${text('source_json',4096)},${text('metadata_json',65536)} FROM fast_current_staging WHERE slot=?`,g.slot);
 const out=row(`SELECT ${text('receipt_key',512)},${text('job_key',512)},source_attempt,request_at,${text('raw_sha',64)},${text('captured_at',24)},${text('manifest_sha',64)},${text('source_json',4096)},${text('manifest_json',1048576)} FROM fast_current_outbox WHERE slot=?`,g.slot);
 return{c,auth,owner,current,writer,publication,s,capture,job,apiJob,slot,stage,out};
});}
function controls(x,w,now){
 const c=x.c;need([0,1].includes(c.selected)&&[0,1].includes(c.pending)&&[0,1].includes(c.action_pending)&&n(c.missing_profile_attempt)&&[0,1].includes(c.hold_present)&&[0,1].includes(c.action_kind_present)&&(c.hold_present===0)===(c.hold_reason===null)&&(c.action_kind_present===0)===(c.action_kind===null));
 const child=(v,type)=>{if(!v)return null;need(['pending','running','written','review','committed','superseded'].includes(v.state)&&['shards','manifest','cas'].includes(v.phase));
  const cursor=type==='writer'?v.next_index:v.replay_index;need(n(cursor,0,512));
  return{state:v.state,phase:v.phase,cursor,retryAt:clock(v.retry_at,Number.MAX_SAFE_INTEGER),leaseUntil:clock(v.lease_until,Number.MAX_SAFE_INTEGER)};};
 return{policyVersion:2,selectedIntent:c.selected===1,pendingIntent:c.pending===1,
  actionState:c.action_pending?(w.journal.gate.task?'physical_or_action_pending_this_instance':'durable_intent_unsettled'):'idle',
  actionKind:c.action_kind===null?null:['registry','reprojection','writer','publication','readback','archive','release','prune'].includes(c.action_kind)?c.action_kind:'unknown',
  retryAt:clock(c.retry_at,Number.MAX_SAFE_INTEGER),holdReason:c.hold_reason===null?null:holds.has(c.hold_reason)?c.hold_reason:'review_hold',
  optionalMissingProvenance:c.missing_profile_attempt>0,writer:child(x.writer,'writer'),publication:child(x.publication,'publication'),physicalScope:'current_owner_instance_only'};
}
async function verify(x,scope,checkedAt){
 const g=x.current[0],s=x.s,now=Date.parse(checkedAt);need(g.state==='verified'&&g.role==='current'&&g.payload_released===0&&n(g.slot,1,3)&&n(g.slot_epoch,1));
 need([g.generation_id,g.raw_sha,g.manifest_sha,g.pointer_sha,g.descriptor_sha,g.registry_capture_hash,g.membership_sha].every(v=>typeof v==='string'&&H.test(v)));
 need(iso(g.captured_at)&&Date.parse(g.captured_at)<=now&&n(g.committed_at,1,now)&&n(g.readback_at,g.committed_at,now)&&n(g.publication_ordinal,1)&&n(g.manifest_bytes,1,1048576)&&n(g.item_count,1,20000)&&n(g.shard_count,1,512));
 need(x.slot?.state==='active'&&x.slot.generation_id===g.generation_id&&x.slot.slot_epoch===g.slot_epoch);
 need(s.operation==='prices'&&s.sourceAttemptId===g.source_attempt&&s.rawSha256===g.raw_sha&&s.requestAt===g.request_at&&same(s,parse(g.source_json,4096))&&s.grantReference===scope.grantReference&&s.roundReference===scope.probeRound);
 need(x.job?.state==='complete'&&n(x.job.claim,1)&&x.job.lease_until===null&&x.apiJob?.state==='complete'&&x.apiJob.attempt_id===null&&x.apiJob.receipt_key===s.receiptKey&&x.apiJob.operation==='prices'&&x.apiJob.round_ref===scope.probeRound);
 const r=x.capture;need(r&&r.operation==='prices'&&r.receipt_key===s.receiptKey&&r.source_attempt===s.sourceAttemptId&&r.raw_sha===s.rawSha256&&r.request_started_at===new Date(s.requestAt).toISOString()&&r.captured_at===g.captured_at&&r.capture_hash===g.registry_capture_hash&&r.set_hash===g.membership_sha&&r.id_count===g.item_count);
 const capture={receiptKey:s.receiptKey,rawSha:s.rawSha256,requestAt:r.request_started_at,capturedAt:g.captured_at,operation:'prices',setHash:r.set_hash};need(await sha256(enc.encode(JSON.stringify(capture)))===r.capture_hash);
 need(await sha256(enc.encode(JSON.stringify({schemaVersion:2,source:s,capturedAt:g.captured_at,slot:g.slot,slotEpoch:g.slot_epoch})))===g.generation_id);
 const st=x.stage,o=x.out;need(st?.state==='admitted'&&st.receipt_key===s.receiptKey&&st.source_json===g.source_json&&st.captured_at===g.captured_at&&st.membership_sha===g.membership_sha&&st.metadata_json===g.metadata_json);
 need(o&&o.receipt_key===s.receiptKey&&o.job_key===s.jobKey&&o.source_attempt===s.sourceAttemptId&&o.request_at===s.requestAt&&o.raw_sha===s.rawSha256&&o.captured_at===g.captured_at&&o.source_json===g.source_json&&o.manifest_sha===g.manifest_sha);
 const m=parse(o.manifest_json,1048576);assertFastManifest(m);need(bytes(o.manifest_json)===g.manifest_bytes&&await sha256(enc.encode(o.manifest_json))===g.manifest_sha&&m.itemCount===g.item_count&&m.shards.length===g.shard_count&&m.source.rawBodySha256===g.raw_sha&&m.source.retrievedAt===g.captured_at);
 const meta=parse(g.metadata_json,65536);need(Array.isArray(meta)&&meta.length>=1&&meta.length<=4);const seen=new Set();
 const metadata=meta.map(v=>{closed(v,'sourceUrl sha256');need(typeof v.sha256==='string'&&H.test(v.sha256)&&typeof v.sourceUrl==='string'&&/^https:\/\/maplestory\.io\/api\/MCW\/1\/item\/list\?cashFilter=(true|false)&count=10000$/.test(v.sourceUrl)&&!seen.has(v.sourceUrl));seen.add(v.sourceUrl);return{sourceUrl:v.sourceUrl,expectedSha256:v.sha256};});
 const p=parse(g.pointer_json,4096);closed(p,'schemaVersion kind profileVersion generation manifestKey manifestSha256 manifestBytes itemCount sourceAttemptId rawBodySha256 capturedAt sourceObservedAt publicationEligible publicationOrdinal grantReference roundReference');
 need(await sha256(enc.encode(g.pointer_json))===g.pointer_sha&&p.schemaVersion===1&&p.kind==='private_fast_item_current_pointer'&&p.profileVersion===1&&p.generation===g.manifest_sha&&p.manifestSha256===g.manifest_sha&&p.manifestKey===PREFIX+'manifests/'+g.manifest_sha+'.json'&&p.manifestBytes===g.manifest_bytes&&p.itemCount===g.item_count&&p.sourceAttemptId===s.sourceAttemptId&&p.rawBodySha256===s.rawSha256&&p.capturedAt===g.captured_at&&p.sourceObservedAt===null&&p.publicationEligible===false&&p.publicationOrdinal===g.publication_ordinal&&p.grantReference===scope.grantReference&&p.roundReference===scope.probeRound);
 const d=parse(g.descriptor_json,4096);closed(d,'schemaVersion kind manifestSha256 manifestKey manifestBytes itemCount sourceAttemptId rawBodySha256 capturedAt sourceObservedAt remoteManifestAndEveryShardReplayed remoteReplayVerifiedAt publicReaderRegistered sqlBodyReleaseAuthorized');
 need(await sha256(enc.encode(g.descriptor_json))===g.descriptor_sha&&d.schemaVersion===1&&d.kind==='private_fast_verified_replay_descriptor'&&d.manifestSha256===g.manifest_sha&&d.manifestKey===p.manifestKey&&d.manifestBytes===g.manifest_bytes&&d.itemCount===g.item_count&&d.sourceAttemptId===s.sourceAttemptId&&d.rawBodySha256===s.rawSha256&&d.capturedAt===g.captured_at&&d.sourceObservedAt===null&&d.remoteManifestAndEveryShardReplayed===true&&n(d.remoteReplayVerifiedAt,1,g.committed_at)&&d.publicReaderRegistered===false&&d.sqlBodyReleaseAuthorized===false);
 const write=parse(g.write_json,8192);need(write.state==='written'&&write.phase==='manifest'&&write.slot===g.slot&&write.receipt_key===s.receiptKey&&write.manifest_sha===g.manifest_sha&&write.source_attempt===s.sourceAttemptId&&write.captured_at===g.captured_at&&write.next_index===g.shard_count&&n(write.first_write_at,1,g.committed_at)&&n(write.graph_written_at,write.first_write_at,g.committed_at));
 need(x.owner.grant_ref===scope.grantReference&&x.owner.round_ref===scope.probeRound&&n(x.owner.serial,g.publication_ordinal));
 if(x.owner.current_pointer!==g.pointer_json||x.owner.current_sha!==g.pointer_sha)return null;
 return{verificationPins:{generation:g.manifest_sha,pointerSha256:g.pointer_sha,manifestBytes:g.manifest_bytes,itemCount:g.item_count,sourceAttemptId:s.sourceAttemptId,rawBodySha256:s.rawSha256,capturedAt:g.captured_at,publicationOrdinal:g.publication_ordinal,grantReference:scope.grantReference,roundReference:scope.probeRound},
  provenance:{generationId:g.generation_id,slot:g.slot,slotEpoch:g.slot_epoch,registryCaptureHash:g.registry_capture_hash,membershipSha256:g.membership_sha,metadata,sqlCommittedAt:new Date(g.committed_at).toISOString(),ownerReadbackAt:new Date(g.readback_at).toISOString(),clockMeaning:'original_source_capture_with_operator_SQL_commit_and_readback_clocks'}};
}
export async function privateFastCurrentVerificationHealth(core,{delegate,checkedAt}={}){
 const cfg=fastCurrentRegistrationConfiguration(core?.env);if(cfg.status==='disabled')return null;
 if(cfg.status!=='ready')return base('invalid_configuration',iso(checkedAt)?checkedAt:null);
 let w;try{need(iso(checkedAt)&&Date.parse(checkedAt)<=core.clock());if(!delegate)return base('not_initialized',checkedAt);w=owned(core,delegate);if(!w)return base('not_initialized',checkedAt);
  const scope=core.config();need(scope.enabled===true&&cfg.value.grantReference===scope.grantReference&&cfg.value.roundReference===scope.probeRound);
  const first=snapshot(core,w),safe=base(first.owner.current_pointer===null?'not_committed':'current_transition_unconfirmed',checkedAt);need(first.owner.grant_ref===scope.grantReference&&first.owner.round_ref===scope.probeRound&&n(first.owner.serial));safe.control=controls(first,w,Date.parse(checkedAt));
  if(first.auth.auth_stopped)return{...safe,status:'authentication_paused'};
  const proof=first.current.length?await verify(first,scope,checkedAt):null;
  if(fastCurrentRegistrationConfiguration(core.env).status==='disabled')return null;
  need(same(fastCurrentRegistrationConfiguration(core.env),cfg)&&owned(core,delegate)===w&&same(core.config(),scope));
  const last=snapshot(core,w);need(same(first,last));
  if(!first.current.length)return safe;
  return proof?{...safe,status:'committed_sql_only',...proof}:{...safe,status:'current_transition_unconfirmed'};
 }catch{if(fastCurrentRegistrationConfiguration(core?.env).status==='disabled')return null;return base('diagnostic_unavailable',iso(checkedAt)?checkedAt:null);}
}
