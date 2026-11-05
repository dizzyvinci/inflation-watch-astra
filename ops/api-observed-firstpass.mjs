// WORK-ONLY proposal; no default activation, network, credential or public path.
const HASH=/^[0-9a-f]{64}$/;
const REF=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,31}$/;
const own=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);

export async function loadObservedPlan(raw,expectedHash){
  if(!(raw instanceof Uint8Array)||raw.byteLength>500_000||!HASH.test(expectedHash))throw TypeError('Invalid pinned plan');
  const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',raw))].map(value=>value.toString(16).padStart(2,'0')).join('');
  if(digest!==expectedHash)throw TypeError('Plan hash mismatch');
  const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
  if(!value||!Array.isArray(value.targets)||!value.targets.length||value.targets.length>2000)throw TypeError('Bounded observed plan required');
  const ids=new Set(),targets=value.targets.map(target=>{
    if(!target||Object.keys(target).sort().join(',')!=='apiPresence,existingReviewedGameIdentity,itemId,priority,supplementalFashionIdentity'||!Number.isSafeInteger(target.itemId)||target.itemId<1||target.itemId>999999999||ids.has(target.itemId))throw TypeError('Invalid observed identity');
    ids.add(target.itemId);
    if(!['priority','existingReviewedGameIdentity','supplementalFashionIdentity'].every(key=>typeof target[key]==='boolean')||!Array.isArray(target.apiPresence)||new Set(target.apiPresence).size!==target.apiPresence.length||target.apiPresence.some(key=>!['prices','catalogue','overview'].includes(key)))throw TypeError('Invalid source presence');
    return Object.freeze({...target,apiPresence:Object.freeze([...target.apiPresence].sort())});
  }).sort((a,b)=>Number(b.priority)-Number(a.priority)||a.itemId-b.itemId);
  if(value.summary?.counts?.allObservedIds!==targets.length||value.summary?.counts?.priorityIds!==targets.filter(row=>row.priority).length||value.summary?.proposedFiniteFirstPassRequests!==targets.length*2||value.summary.activated!==false||value.summary.publicPublication!==false)throw TypeError('Plan summary mismatch');
  for(const key of['prices','catalogue','overview'])if(!HASH.test(value.summary?.sourceReceipts?.[key]?.rawSha256??''))throw TypeError('Source receipt hash required');
  return Object.freeze({hash:digest,targets:Object.freeze(targets),totalJobs:targets.length*2,sourceReceipts:Object.freeze(value.summary.sourceReceipts)});
}

export class ObservedFirstPass {
  constructor(ctx,env,plan){this.ctx=ctx;this.env=env;this.plan=plan;this.targets=new Map(plan.targets.map(row=>[row.itemId,row]));this.ready=false;}
  config(grant){
    if(!this.env.API_OBSERVED_FIRSTPASS_JSON)return{enabled:false};
    const value=JSON.parse(this.env.API_OBSERVED_FIRSTPASS_JSON);
    if(!value||typeof value.enabled!=='boolean')throw TypeError('Explicit firstpass switch required');
    if(!value.enabled)return{enabled:false};
    if(Object.keys(value).sort().join(',')!=='approvalRecorded,chunkSize,enabled,grantReference,maxAttemptsPerJob,maxQueuedJobs,planSha256,queueReference,roundReference'||value.approvalRecorded!==true||value.planSha256!==this.plan.hash||!REF.test(value.queueReference??'')||value.roundReference!==grant.probeRound||value.grantReference!==grant.grantReference)throw TypeError('Explicit reviewed firstpass required');
    if(!grant.enabled||grant.exclusiveAccountOwnerConfirmed!==true||grant.minimumRequestIntervalSeconds<2.5||grant.grantedPerMinute>30)throw TypeError('Same owner and minimum2500ms required');
    if(!Number.isSafeInteger(value.chunkSize)||value.chunkSize<1||value.chunkSize>64||!Number.isSafeInteger(value.maxQueuedJobs)||value.maxQueuedJobs<value.chunkSize||value.maxQueuedJobs>128||!Number.isSafeInteger(value.maxAttemptsPerJob)||value.maxAttemptsPerJob<1||value.maxAttemptsPerJob>5)throw TypeError('Finite chunk and attempt limits required');
    if(`${grant.probeRound}:s:${value.queueReference}:1:999999:history`.length>160)throw TypeError('Job reference too long');
    return{enabled:true,approvalRecorded:true,planSha256:value.planSha256,queueReference:value.queueReference,
      roundReference:value.roundReference,grantReference:value.grantReference,chunkSize:value.chunkSize,
      maxQueuedJobs:value.maxQueuedJobs,maxAttemptsPerJob:value.maxAttemptsPerJob};
  }
  ensureTables(){if(this.ready)return;
    this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS api_observed_plans(plan_hash TEXT PRIMARY KEY,queue_ref TEXT NOT NULL,round_ref TEXT NOT NULL,config_json TEXT NOT NULL,total_jobs INTEGER NOT NULL,cursor INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL,completed_at INTEGER)`);
    this.ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS api_observed_jobs(job_key TEXT PRIMARY KEY,plan_hash TEXT NOT NULL,operation TEXT NOT NULL,item_id INTEGER NOT NULL,kind TEXT NOT NULL,ordinal INTEGER NOT NULL,presence_json TEXT NOT NULL,UNIQUE(plan_hash,ordinal))`);
    this.ctx.storage.sql.exec('CREATE INDEX IF NOT EXISTS api_observed_jobs_plan ON api_observed_jobs(plan_hash,job_key)');
    this.ready=true;}
  eligibility(grant){
    let cfg;try{cfg=this.config(grant);}catch{return null;}
    if(!cfg.enabled)return null;this.ensureTables();
    const prior=this.ctx.storage.sql.exec('SELECT config_json,round_ref FROM api_observed_plans WHERE plan_hash=?',this.plan.hash).toArray()[0];
    if(prior&&(prior.config_json!==JSON.stringify(cfg)||prior.round_ref!==grant.probeRound))return null;
    return{sql:'EXISTS (SELECT 1 FROM api_observed_jobs AS observed WHERE observed.job_key=api_jobs.job_key AND observed.operation=api_jobs.operation AND observed.plan_hash=?)',args:[this.plan.hash]};
  }
  definition(operation){
    const match=/^observed-(detail|history)-([1-9][0-9]{0,8})$/.exec(operation);if(!match)return null;
    const id=Number(match[2]),target=this.targets.get(id);if(!target)return null;
    return{kind:match[1],id,target,path:`/api/items/${id}${match[1]==='history'?'/history':''}`};
  }
  metadata(operation){const definition=this.definition(operation);if(!definition)return{};return{
    expectedItemId:definition.id,expectedItemName:null,identityStatus:'observed_retained_id_name_echo_not_required',
    observedPlanSha256:this.plan.hash,sourcePresence:[...definition.target.apiPresence],
    reviewedOtherFeedIdentity:definition.target.existingReviewedGameIdentity,
    supplementalFashionIdentity:definition.target.supplementalFashionIdentity};}
  path(operation,grant){const cfg=this.config(grant),definition=this.definition(operation);if(!cfg.enabled||!definition)throw TypeError('Unapproved observed operation');return definition.path;}
  maxAttempts(operation,grant){if(!this.definition(operation))return null;const cfg=this.config(grant);return cfg.enabled?cfg.maxAttemptsPerJob:null;}
  registeredJobValid(job,grant){
    let cfg;try{cfg=this.config(grant);}catch{return false;}
    if(!cfg.enabled||job.round_ref!==grant.probeRound)return false;
    const row=this.ctx.storage.sql.exec('SELECT * FROM api_observed_jobs WHERE job_key=?',job.job_key).toArray()[0];
    if(!row||row.plan_hash!==this.plan.hash||!Number.isSafeInteger(row.ordinal)||row.ordinal<0||row.ordinal>=this.plan.totalJobs)return false;
    const target=this.plan.targets[Math.floor(row.ordinal/2)],kind=row.ordinal%2?'history':'detail';
    const operation=`observed-${kind}-${target.itemId}`;
    const key=`${grant.probeRound}:s:${cfg.queueReference}:${target.priority?0:1}:${String(row.ordinal).padStart(6,'0')}:${kind}`;
    return row.item_id===target.itemId&&row.kind===kind&&row.operation===operation&&job.operation===operation
      &&row.job_key===key&&row.presence_json===JSON.stringify(target);
  }
  enqueueChunk(core){
    const grant=core.config();let cfg;try{cfg=this.config(grant);}catch{return{status:'invalid_firstpass_configuration'};}
    if(!cfg.enabled)return{status:'firstpass_disabled'};
    if(core.authorizationStatus()!=='ready')return{status:core.authorizationStatus()};
    if(core.row('SELECT auth_stopped FROM api_control WHERE id=1').auth_stopped)return{status:'authentication_stopped'};
    core.validateScheduleReferences(cfg.queueReference);this.ensureTables();
    const snapshot=JSON.stringify(cfg);
    return this.ctx.storage.transactionSync(()=>{
      let prior=core.row('SELECT * FROM api_observed_plans WHERE plan_hash=?',this.plan.hash);
      if(prior&&(prior.config_json!==snapshot||prior.round_ref!==grant.probeRound))return{status:'firstpass_definition_changed_requires_review'};
      if(!prior){core.sql.exec('INSERT INTO api_observed_plans(plan_hash,queue_ref,round_ref,config_json,total_jobs,created_at) VALUES(?,?,?,?,?,?)',this.plan.hash,cfg.queueReference,grant.probeRound,snapshot,this.plan.totalJobs,core.clock());prior=core.row('SELECT * FROM api_observed_plans WHERE plan_hash=?',this.plan.hash);}
      const outstanding=core.row(`SELECT COUNT(*) AS n FROM api_jobs JOIN api_observed_jobs USING(job_key) WHERE plan_hash=? AND state IN ('pending','running')`,this.plan.hash).n;
      const count=Math.max(0,Math.min(cfg.chunkSize,cfg.maxQueuedJobs-outstanding,this.plan.totalJobs-prior.cursor));
      for(let offset=0;offset<count;offset++){
        const ordinal=prior.cursor+offset,target=this.plan.targets[Math.floor(ordinal/2)],kind=ordinal%2?'history':'detail';
        const operation=`observed-${kind}-${target.itemId}`,jobKey=`${grant.probeRound}:s:${cfg.queueReference}:${target.priority?0:1}:${String(ordinal).padStart(6,'0')}:${kind}`;
        core.validateScheduleReferences(jobKey);
        core.sql.exec('INSERT INTO api_observed_jobs(job_key,plan_hash,operation,item_id,kind,ordinal,presence_json) VALUES(?,?,?,?,?,?,?)',jobKey,this.plan.hash,operation,target.itemId,kind,ordinal,JSON.stringify(target));
        core.sql.exec('INSERT INTO api_jobs(job_key,operation,round_ref,available_at) VALUES(?,?,?,?)',jobKey,operation,grant.probeRound,core.clock());
      }
      if(count)core.sql.exec('UPDATE api_observed_plans SET cursor=cursor+? WHERE plan_hash=?',count,this.plan.hash);
      const terminal=core.row(`SELECT COUNT(*) AS n FROM api_jobs JOIN api_observed_jobs USING(job_key) WHERE plan_hash=? AND state IN ('complete','unavailable','failed')`,this.plan.hash).n;
      if(prior.cursor+count===this.plan.totalJobs&&terminal===this.plan.totalJobs)core.sql.exec('UPDATE api_observed_plans SET completed_at=COALESCE(completed_at,?) WHERE plan_hash=?',core.clock(),this.plan.hash);
      return{status:terminal===this.plan.totalJobs?'firstpass_complete':'firstpass_chunk_ready',enqueued:count,cursor:prior.cursor+count,totalJobs:this.plan.totalJobs,outstanding:outstanding+count,terminal,publicPublication:false};
    });
  }
}
