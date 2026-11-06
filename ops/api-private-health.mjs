import {privateItemDiscoveryHealth} from './api-private-item-discovery-health.mjs';
import {privateNxHealth} from './api-private-nx-health.mjs';
import {privateNxR2Health} from './api-private-nx-r2-health.mjs';
import {privateItemHistoryHealth} from './api-private-item-history-health.mjs';
import {privateItemHealth} from './api-private-item-health.mjs';
import {publicCashStatus} from './api-public-cash-contract.mjs';
// Optional private diagnostics only. Never a provider request or public health replacement.
const KEY='_private/provider-api/v1/health.json';
const SCHEMA_OPERATIONS=['status','prices','catalogue','overview','apple-detail','apple-history'];
const STATES=new Set(['pending','running','complete','unavailable','failed','auth_stopped']);
const RESULTS=new Set(['success','retry','auth_denied','permanent_error','requires_approved_key',
  'private_storage_unavailable','private_pointer_pending','invalid_grant_configuration',
  'unavailable','retry_exhausted',
  'authentication_stopped','spacing_wait','budget_wait','backoff','busy','leased','idle','stale_attempt','internal_error']);
const integer=value=>Number.isSafeInteger(value)&&value>=0;
const iso=value=>typeof value==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?Z$/.test(value)&&Number.isFinite(Date.parse(value))?value:null;
const digest=async text=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))]
  .map(value=>value.toString(16).padStart(2,'0')).join('');

export class ApiPrivateHealth{
  constructor(ctx,env,core){
    this.ctx=ctx;this.env=env;this.core=core;
    ctx.storage.transactionSync(()=>{
      core.sql.exec(`CREATE TABLE IF NOT EXISTS api_private_health(id INTEGER PRIMARY KEY CHECK(id=1),
        revision INTEGER NOT NULL DEFAULT 0,body TEXT,pending INTEGER NOT NULL DEFAULT 0)`);
      core.sql.exec('INSERT OR IGNORE INTO api_private_health(id) VALUES(1)');
    });
  }
  enabled(){try{return this.core.config().enabled===true;}catch{return false;}}
  completedReceipts(config){
    const round=config.probeRound;
    if(typeof round!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(round))return[];
    const keys=SCHEMA_OPERATIONS.map((operation,index)=>`${round}:${index}:${operation}`);
    const rows=this.core.sql.exec(`SELECT operation,round_ref,receipt_key FROM api_jobs
      WHERE state='complete' AND round_ref=? AND job_key IN (${keys.map(()=>'?').join(',')})
      ORDER BY job_key LIMIT 6`,round,...keys).toArray();
    return rows.filter(row=>{
      const match=typeof row.receipt_key==='string'&&/^_private\/provider-api\/v1\/receipts\/\d{12,16}-(status|prices|catalogue|overview|apple-detail|apple-history)-[a-f0-9]{64}\.json$/.exec(row.receipt_key);
      return match&&match[1]===row.operation&&row.round_ref===round;
    }).map(row=>({operation:row.operation,receiptKey:row.receipt_key,roundReference:row.round_ref}));
  }
  nxSchemaProbeProgress(config){
    const state=this.core.nxSchemaProbeState?.(config);
    const allowed=['disabled','waiting_for_initial_six','authentication_stopped','identity_conflict_needs_review',
      'permanent_failure_needs_review','complete','pending','ready_to_enqueue'];
    return {status:allowed.includes(state?.status)?state.status:'unknown',
      completed:Number.isSafeInteger(state?.completed)&&state.completed>=0&&state.completed<=2?state.completed:null};
  }
  completedNxProbeReceipts(config){
    if(config.nxSchemaProbesEnabled!==true)return[];
    const round=config.probeRound;
    if(typeof round!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(round))return[];
    const operations=['nx-rate','nx-history'];
    const keys=operations.map((op,index)=>`${round}:${6+index}:${op}`);
    return this.core.sql.exec(`SELECT job_key,operation,round_ref,receipt_key FROM api_jobs
      WHERE state='complete' AND round_ref=? AND job_key IN (?,?) ORDER BY job_key LIMIT 2`,round,...keys).toArray()
      .filter(row=>{
        const match=typeof row.receipt_key==='string'&&/^_private\/provider-api\/v1\/receipts\/\d{12,16}-(nx-rate|nx-history)-[a-f0-9]{64}\.json$/.exec(row.receipt_key);
        return match&&match[1]===row.operation&&row.round_ref===round&&keys[operations.indexOf(row.operation)]===row.job_key;
      }).map(row=>({operation:row.operation,receiptKey:row.receipt_key,roundReference:row.round_ref}));
  }
  observedFirstPassProgress(config){
    const scope=this.core.observed;if(!scope)return{status:'disabled'};
    let checked;try{checked=scope.config(config);}catch{return{status:'invalid_configuration'};}
    if(!checked.enabled)return{status:'disabled'};
    scope.ensureTables();
    const plan=this.core.row('SELECT * FROM api_observed_plans WHERE plan_hash=?',scope.plan.hash);
    if(!plan)return{status:'not_started'};
    if(plan.config_json!==JSON.stringify(checked)||plan.round_ref!==config.probeRound)return{status:'configuration_changed_requires_review'};
    const counts={pending:0,running:0,complete:0,unavailable:0,failed:0,auth_stopped:0};
    const rows=this.core.sql.exec(`SELECT api_jobs.state,COUNT(*) AS count FROM api_jobs JOIN api_observed_jobs USING(job_key)
      WHERE plan_hash=? AND round_ref=? AND api_jobs.operation=api_observed_jobs.operation GROUP BY api_jobs.state`,scope.plan.hash,config.probeRound).toArray();
    if(rows.some(row=>!Object.hasOwn(counts,row.state)||!integer(row.count)))return{status:'invalid_progress_state'};
    for(const row of rows)counts[row.state]=row.count;
    const total=Object.values(counts).reduce((sum,value)=>sum+value,0),terminal=counts.complete+counts.unavailable+counts.failed;
    if(!integer(plan.cursor)||plan.cursor>scope.plan.totalJobs||total!==plan.cursor||plan.total_jobs!==scope.plan.totalJobs)return{status:'invalid_progress_state'};
    const done=plan.cursor===scope.plan.totalJobs&&terminal===scope.plan.totalJobs;
    return{status:done?(counts.failed?'complete_with_failures':counts.unavailable?'complete_with_unavailable':'complete'):
      this.core.row('SELECT auth_stopped FROM api_control WHERE id=1').auth_stopped?'authentication_stopped':'running',
      totalItemCount:scope.plan.targets.length,plannedJobCount:scope.plan.totalJobs,enqueuedJobCount:plan.cursor,
      remainingToEnqueue:scope.plan.totalJobs-plan.cursor,completeCount:counts.complete,
      unavailableCount:counts.unavailable,failedCount:counts.failed,pendingCount:counts.pending,
      runningCount:counts.running,authStoppedCount:counts.auth_stopped,
      clockKind:'operator_queue_progress_not_market_observation'};
  }
  publicCashProgress(){
    const configuration=publicCashStatus(this.env);
    const base={configuration,clockKind:'operator_publication_queue_not_market_observation'};
    if(configuration!=='ready')return{...base,outboxState:'not_enabled'};
    try{
      if(!this.core.row("SELECT name FROM sqlite_master WHERE type='table' AND name='api_public_cash_outbox'"))return{...base,outboxState:'not_initialized'};
      const row=this.core.row('SELECT state,target_attempt,published_attempt,retry_at,lease_until FROM api_public_cash_outbox WHERE id=1');
      const states=new Set(['idle','pending','ready','published','superseded','quarantined']);
      const clock=value=>value===null||value===0?null:Number.isSafeInteger(value)&&value>0?iso(new Date(value).toISOString()):null;
      if(!row||!states.has(row.state)||![row.target_attempt,row.published_attempt,row.retry_at].every(integer)||(row.lease_until!==null&&!integer(row.lease_until)))return{...base,outboxState:'invalid_state'};
      const retryAt=clock(row.retry_at),leaseUntil=clock(row.lease_until);
      if(row.retry_at>0&&!retryAt||row.lease_until>0&&!leaseUntil)return{...base,outboxState:'invalid_state'};
      return{...base,outboxState:row.state,targetAttempt:row.target_attempt,publishedAttempt:row.published_attempt,
        retryAt,leaseUntil,nextEligibleAt:['pending','ready'].includes(row.state)?clock(Math.max(this.core.clock(),row.retry_at,row.lease_until??0)):null};
    }catch{return{...base,outboxState:'diagnostic_unavailable'};}
  }
  async afterRun(result){
    if(!this.enabled()||result?.status==='disabled')return{status:'skipped_off'};
    const checkedAt=new Date(this.core.clock()).toISOString();const source=this.core.health();
    const config=this.core.config();
    const caps=[config.grantedPerDay,config.operatorDailyRequestCap].filter(value=>integer(value)&&value>0);
    const safe={schemaVersion:1,kind:'private_api_collector_health',providerAlarmRecoveryVersion:1,checkedAt,
      checkedAtMeaning:'owner_check_completion_not_market_observation',
      result:RESULTS.has(result?.status)?result.status:'unrecognized_result',
      authenticationStopped:source.authenticationStopped===true,
      retryNotBefore:iso(source.retryNotBefore),nextAllowedAt:iso(source.nextAllowedAt),
      lastRawCapturedAt:iso(source.lastRawCapturedAt),sourceObservedAt:null,
      schemaVerified:false,publicationEligible:false,privatePointerPending:source.privatePointerPending===true,
      attempts:integer(source.attempts)?source.attempts:null,
      jobs:Array.isArray(source.jobs)?source.jobs.filter(row=>STATES.has(row.state)&&integer(row.count))
        .map(row=>({state:row.state,count:row.count})):[],
      configuredMinuteCeiling:integer(config.grantedPerMinute)?config.grantedPerMinute:null,
      configuredDailyCeiling:caps.length?Math.min(...caps):null,
      completedReceipts:this.completedReceipts(config),
      publicCashPublication:this.publicCashProgress(),
      privateNxOffers:privateNxHealth(this.core,this.env),
      privateNxPublication:privateNxR2Health(this.core,this.env),
      privateItems:privateItemHealth(this.core,this.env),
      privateItemHistory:privateItemHistoryHealth(this.core,this.env),privateItemDiscovery:privateItemDiscoveryHealth(this.core,this.env),
      ...(this.core.observed?{observedFirstPass:this.observedFirstPassProgress(config)}:{}),
      ...(config.nxSchemaProbesEnabled===true?{nxSchemaProbes:this.nxSchemaProbeProgress(config),completedNxProbeReceipts:this.completedNxProbeReceipts(config)}:{}),
      dailyCeilingMeaning:'configured_restriction_not_an_inferred_provider_daily_grant'};
    this.ctx.storage.transactionSync(()=>{
      const row=this.core.row('SELECT revision FROM api_private_health WHERE id=1');
      const revision=row.revision+1;if(!Number.isSafeInteger(revision))throw new TypeError('Health revision exhausted');
      this.core.sql.exec('UPDATE api_private_health SET revision=?,body=?,pending=1 WHERE id=1',revision,
        JSON.stringify({...safe,revision}));
    });
    return{status:await this.flush()?'published_private_health':'private_health_pending'};
  }
  async flush(){
    if(!this.enabled())return false;
    const bucket=this.env.API_RAW_RECEIPTS;if(!bucket?.get||!bucket?.put)return false;
    for(let attempt=0;attempt<3;attempt++){
      const row=this.core.row('SELECT * FROM api_private_health WHERE id=1');
      if(!row.pending||!row.body)return true;
      const hash=await digest(row.body);const before=await bucket.get(KEY);
      if(before){
        const old=await before.json();
        if(!integer(old.revision)||typeof old.healthSha256!=='string')return false;
        if(old.revision>row.revision)return false;
        if(old.revision===row.revision){
          if(old.healthSha256!==hash)return false;
          this.core.sql.exec('UPDATE api_private_health SET pending=0 WHERE id=1 AND revision=?',row.revision);return true;
        }
      }
      const output=JSON.stringify({...JSON.parse(row.body),healthSha256:hash});
      const written=await bucket.put(KEY,output,{onlyIf:before?{etagMatches:before.etag}:{etagDoesNotMatch:'*'},
        httpMetadata:{contentType:'application/json'}});
      if(!written)continue;
      this.core.sql.exec('UPDATE api_private_health SET pending=0 WHERE id=1 AND revision=?',row.revision);return true;
    }
    return false;
  }
}
