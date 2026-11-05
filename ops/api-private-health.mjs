// Optional private diagnostics only. Never a provider request or public health replacement.
const KEY='_private/provider-api/v1/health.json';
const SCHEMA_OPERATIONS=['status','prices','catalogue','overview','apple-detail','apple-history'];
const STATES=new Set(['pending','running','complete','failed','auth_stopped']);
const RESULTS=new Set(['success','retry','auth_denied','permanent_error','requires_approved_key',
  'private_storage_unavailable','private_pointer_pending','invalid_grant_configuration',
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
  async afterRun(result){
    if(!this.enabled()||result?.status==='disabled')return{status:'skipped_off'};
    const checkedAt=new Date(this.core.clock()).toISOString();const source=this.core.health();
    const config=this.core.config();
    const caps=[config.grantedPerDay,config.operatorDailyRequestCap].filter(value=>integer(value)&&value>0);
    const safe={schemaVersion:1,kind:'private_api_collector_health',checkedAt,
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
