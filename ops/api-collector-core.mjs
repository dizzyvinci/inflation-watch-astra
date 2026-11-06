// Disabled-by-default hosted schema probes. No publication path or API schema inference.
export const OPERATIONS = Object.freeze({status: '/api/status', prices: '/api/prices',
  catalogue: '/api/items', overview: '/api/market/overview',
  'apple-detail': '/api/items/2010001', 'apple-history': '/api/items/2010001/history',
  'nx-rate': '/api/nx-rate', 'nx-history': '/api/nx-rate/history?range=7d&step=hour'});
const INITIAL_OPERATIONS=Object.freeze(['status','prices','catalogue','overview','apple-detail','apple-history']);
const NX_PROBES=Object.freeze(['nx-rate','nx-history']);
export const OWNER_NAME = 'maplestory-market-account-primary-v1';
export const PRIVATE_PREFIX = '_private/provider-api/v1/';
const ORIGIN = 'https://maplestory.market';
const LIMIT = 5_000_000;
const LEASE_MS = 120_000;
const REF = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const stamp = ms => new Date(ms).toISOString();
const finiteTime = value => Number.isSafeInteger(value) && value >= 0 && value < 8.64e15;

export function grantConfig(env) {
  // Off must not read credentials, create jobs, call bindings or make requests.
  if (!env.API_GRANT_JSON) return {enabled: false};
  const value = JSON.parse(env.API_GRANT_JSON);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Invalid configuration');
  const fields = ['enabled', 'approvalRecorded', 'exclusiveAccountOwnerConfirmed', 'grantReference',
    'grantedPerMinute', 'grantedPerDay', 'minimumRequestIntervalSeconds',
    'higherFrequencyExplicitlyGranted', 'allowedOperations', 'probeRound', 'publicationEnabled', 'operatorDailyRequestCap', 'nxSchemaProbesEnabled'];
  if (Object.keys(value).some(key => !fields.includes(key))) throw new TypeError('Unknown configuration');
  if (typeof value.enabled !== 'boolean') throw new TypeError('Explicit activation required');
  if (value.publicationEnabled !== false) throw new TypeError('Raw quarantine cannot publish');
  if (!value.enabled) return {enabled: false};
  if (value.approvalRecorded !== true || value.exclusiveAccountOwnerConfirmed !== true) throw new TypeError('Approval and account owner required');
  if (!REF.test(value.grantReference ?? '') || !REF.test(value.probeRound ?? '')) throw new TypeError('Nonsecret references required');
  if (!Number.isSafeInteger(value.grantedPerMinute) || value.grantedPerMinute < 1) throw new TypeError('Actual minute allowance required');
  const dailyCaps = [value.grantedPerDay, value.operatorDailyRequestCap].filter(cap => cap !== undefined && cap !== null);
  if (!dailyCaps.length || dailyCaps.some(cap => !Number.isSafeInteger(cap) || cap < 1)) throw new TypeError('Explicit daily operator cap required');
  if (!Number.isFinite(value.minimumRequestIntervalSeconds) || !Number.isSafeInteger(value.minimumRequestIntervalSeconds*1000) || value.minimumRequestIntervalSeconds < 0 ||
      value.minimumRequestIntervalSeconds > 86400) throw new TypeError('Invalid spacing');
  if (value.minimumRequestIntervalSeconds < 600 && value.higherFrequencyExplicitlyGranted !== true) throw new TypeError('Higher cadence not granted');
  if (!Array.isArray(value.allowedOperations) || !value.allowedOperations.length ||
      new Set(value.allowedOperations).size !== value.allowedOperations.length ||
      value.allowedOperations.some(key => !own(OPERATIONS, key))) throw new TypeError('Explicit permitted schema probes required');
  if(value.nxSchemaProbesEnabled!==undefined&&typeof value.nxSchemaProbesEnabled!=='boolean')throw new TypeError('Explicit NX probe flag required');
  if(value.nxSchemaProbesEnabled===true&&NX_PROBES.some(op=>!value.allowedOperations.includes(op)))throw new TypeError('Both explicit NX probe operations required');
  return value;
}

function secret(env) {
  const key = env.MAPLESTORY_MARKET_APPROVED_API_KEY;
  return typeof key === 'string' && key.length > 0 && key.length <= 1024 && /^[!-~]+$/.test(key) ? key : null;
}

function safeReferences(config, key, extra = []) {
  if ([config.grantReference, config.probeRound, ...extra].some(value => typeof value === 'string' && value.includes(key))) {
    throw new TypeError('Credential cannot be used as a reference');
  }
}

function base64(raw) {
  const chunks = [];
  for (let offset = 0; offset < raw.length; offset += 0x8000) {
    chunks.push(String.fromCharCode(...raw.subarray(offset, offset+0x8000)));
  }
  return btoa(chunks.join(''));
}

function retryDelay(header, now) {
  if (typeof header !== 'string') return 0;
  if (/^\d+$/.test(header)) {
    const ms = Number(header) * 1000;
    return Number.isSafeInteger(ms) && ms >= 0 ? ms : 0;
  }
  // Only an HTTP-date, not arbitrary numeric/date parsing.
  if (!/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d\d [A-Z][a-z]{2} \d{4} \d\d:\d\d:\d\d GMT$/.test(header)) return 0;
  const parsed = Date.parse(header);
  return Number.isFinite(parsed) ? Math.max(0, parsed-now) : 0;
}

function jitter(maximum) {
  const word = new Uint32Array(1); crypto.getRandomValues(word);
  return Math.floor(word[0] / 2**32 * (maximum+1));
}

async function sha(raw) {
  const digest = await crypto.subtle.digest('SHA-256', raw);
  return [...new Uint8Array(digest)].map(v => v.toString(16).padStart(2, '0')).join('');
}

async function jsonResponse(response, key) {
  if (!/^application\/(?:[a-z0-9.+-]+\+)?json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) throw new TypeError('Unexpected response type');
  const reader = response.body?.getReader();
  if (!reader) throw new TypeError('Missing body');
  const chunks = []; let size = 0;
  try {
    while (true) {
      const {done, value} = await reader.read(); if (done) break;
      size += value.byteLength; if (size > LIMIT) throw new TypeError('Response too large');
      chunks.push(value);
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  const raw = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) {raw.set(chunk, offset); offset += chunk.byteLength;}
  const text = new TextDecoder('utf-8', {fatal: true}).decode(raw);
  if (text.includes(key)) throw new TypeError('Credential echo');
  const payload = JSON.parse(text);
  if (!payload || typeof payload !== 'object') throw new TypeError('Unverified response shape');
  // Inspect ALL decoded string tokens, including values overwritten by duplicate keys.
  for (const match of text.matchAll(/"(?:[^"\\]|\\.)*"/g)) {
    if (JSON.parse(match[0]).includes(key)) throw new TypeError('Escaped credential echo');
  }
  // Keep raw types honest: JSON.stringify must not silently convert 1e999 to null.
  let visited = 0;
  const check = (value, depth) => {
    if (++visited > 500_000 || depth > 64) throw new TypeError('Unbounded payload');
    if (typeof value === 'number' && !Number.isFinite(value)) throw new TypeError('Nonfinite payload');
    if (typeof value === 'string' && value.includes(key)) throw new TypeError('Escaped credential echo');
    if (value && typeof value === 'object') {
      for (const [name, child] of Object.entries(value)) {
        if (name.includes(key)) throw new TypeError('Credential echo');
        check(child, depth+1);
      }
    }
  };
  check(payload, 0);
  return {payload, parsedPayloadViewMayBeLossy: true, rawBodyEncoding: 'base64',
    rawBodyBase64: base64(raw), responseSha256: await sha(raw), responseBytes: raw.byteLength};
}

export class ApiCollectorCore {
  constructor(ctx, env, options = {}) {
    this.ctx = ctx; this.env = env; this.sql = ctx.storage.sql;
    this.now = options.now ?? Date.now; this.fetcher = options.fetcher ?? ((...args) => fetch(...args));
    this.jitter = options.jitter ?? jitter; this.flight = null; this.observed = options.observedScope ?? null;
    ctx.storage.transactionSync(() => {
      this.sql.exec(`CREATE TABLE IF NOT EXISTS api_control (
        id INTEGER PRIMARY KEY CHECK(id=1), auth_stopped INTEGER NOT NULL DEFAULT 0,
        blocked_until INTEGER NOT NULL DEFAULT 0, next_allowed INTEGER NOT NULL DEFAULT 0,
        last_good_key TEXT, last_good_attempt INTEGER, last_good_captured_at TEXT,
        pointer_pending INTEGER NOT NULL DEFAULT 0)`);
      this.sql.exec('INSERT OR IGNORE INTO api_control(id) VALUES(1)');
      this.sql.exec(`CREATE TABLE IF NOT EXISTS api_jobs (
        job_key TEXT PRIMARY KEY, operation TEXT NOT NULL, round_ref TEXT NOT NULL,
        state TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
        available_at INTEGER NOT NULL, lease_until INTEGER, attempt_id INTEGER,
        last_result TEXT, receipt_key TEXT)`);
      this.sql.exec('CREATE INDEX IF NOT EXISTS api_jobs_ready ON api_jobs(state,available_at,job_key)');
      this.sql.exec(`CREATE TABLE IF NOT EXISTS api_attempts (
        id INTEGER PRIMARY KEY AUTOINCREMENT, job_key TEXT NOT NULL,
        at INTEGER NOT NULL, result TEXT, grant_ref TEXT NOT NULL)`);
      this.sql.exec('CREATE INDEX IF NOT EXISTS api_attempts_at ON api_attempts(at)');
    });
  }

  clock() {const now = this.now(); if (!finiteTime(now)) throw new TypeError('Invalid clock'); return now;}
  row(query, ...args) {return this.sql.exec(query, ...args).toArray()[0];}
  config() {return grantConfig(this.env);}
  dailyCap(config) {return Math.min(...[config.grantedPerDay,config.operatorDailyRequestCap].filter(cap=>cap!==undefined&&cap!==null));}
  authorizationStatus() {
    let config;try {config=this.config();} catch {return 'invalid_grant_configuration';}
    if (!config.enabled) return 'disabled';
    const key=secret(this.env);if(!key)return 'requires_approved_key';
    try {safeReferences(config,key);} catch {return 'invalid_grant_configuration';}
    if(!this.env.API_RAW_RECEIPTS?.put||!this.env.API_RAW_RECEIPTS?.get)return 'private_storage_unavailable';
    return 'ready';
  }
  validateScheduleReferences(...values) {
    const config=this.config();const key=secret(this.env);
    if(!config.enabled||!key)throw new TypeError('Approved key required');
    safeReferences(config,key,values);
  }
  enqueueScheduledOperation({jobKey,operation,availableAt}) {
    if(this.authorizationStatus()!=='ready')throw new TypeError('Not authorized');
    const config=this.config();this.validateScheduleReferences(jobKey);
    const nxRecurring=NX_PROBES.includes(operation)&&this.nxSchemaProbeState(config).status==='complete';
    if(!REF.test(jobKey)||!(INITIAL_OPERATIONS.includes(operation)||nxRecurring)||!config.allowedOperations.includes(operation)||!finiteTime(availableAt))throw new TypeError('Invalid scheduled job');
    this.sql.exec('INSERT OR IGNORE INTO api_jobs(job_key,operation,round_ref,available_at) VALUES(?,?,?,?)',
      jobKey,operation,config.probeRound,availableAt);
  }
  nxSchemaProbeState(config=this.config()) {
    if(config.nxSchemaProbesEnabled!==true)return {status:'disabled',completed:0};
    const rows=NX_PROBES.map((op,index)=>this.row('SELECT state,operation FROM api_jobs WHERE job_key=? AND round_ref=?',
      `${config.probeRound}:${INITIAL_OPERATIONS.length+index}:${op}`,config.probeRound));
    const completed=rows.filter((row,index)=>row?.state==='complete'&&row.operation===NX_PROBES[index]).length;
    if(this.row('SELECT auth_stopped AS stopped FROM api_control WHERE id=1').stopped)return {status:'authentication_stopped',completed};
    const base=INITIAL_OPERATIONS.map((op,index)=>this.row('SELECT state,operation FROM api_jobs WHERE job_key=? AND round_ref=?',
      `${config.probeRound}:${index}:${op}`,config.probeRound));
    if(!base.every((row,index)=>row?.state==='complete'&&row.operation===INITIAL_OPERATIONS[index]))return {status:'waiting_for_initial_six',completed};
    if(rows.some((row,index)=>row&&row.operation!==NX_PROBES[index]))return {status:'identity_conflict_needs_review',completed};
    if(rows.some(row=>row?.state==='failed'))return {status:'permanent_failure_needs_review',completed};
    return {status:completed===2?'complete':rows.some(Boolean)?'pending':'ready_to_enqueue',completed};
  }
  effectiveOperations(config) {
    const allowed=config.allowedOperations.filter(op=>INITIAL_OPERATIONS.includes(op));
    if(['ready_to_enqueue','pending','complete'].includes(this.nxSchemaProbeState(config).status))
      allowed.push(...NX_PROBES.filter(op=>config.allowedOperations.includes(op)));
    return allowed;
  }
  enqueueNxSchemaProbes(roundRef) {
    const config=this.config();if(!config.enabled)return {status:'disabled',completed:0};
    if(config.nxSchemaProbesEnabled!==true)return {status:'disabled',completed:0};
    const key=secret(this.env);if(!key)return {status:'requires_approved_key',completed:0};
    safeReferences(config,key,[roundRef]);
    if(roundRef!==config.probeRound||!REF.test(roundRef))throw new TypeError('Explicit current round required');
    const state=this.nxSchemaProbeState(config);
    if(!['ready_to_enqueue','pending','complete'].includes(state.status))return state;
    const now=this.clock();
    return this.ctx.storage.transactionSync(()=>{
      for(const [index,operation]of NX_PROBES.entries())this.sql.exec(
        'INSERT OR IGNORE INTO api_jobs(job_key,operation,round_ref,available_at) VALUES(?,?,?,?)',
        `${roundRef}:${INITIAL_OPERATIONS.length+index}:${operation}`,operation,roundRef,now);
      return this.nxSchemaProbeState(config);
    });
  }
  eligible(config) {
    const operations=this.effectiveOperations?.(config)??config.allowedOperations;
    const base={sql:operations.length?`operation IN (${operations.map(()=>'?').join(',')})`:'0',args:[...operations]};
    const dynamic=this.observed?.eligibility(config);
    return dynamic?{sql:`(${base.sql} OR ${dynamic.sql})`,args:[...base.args,...dynamic.args]}:base;
  }
  nextAttemptAt(config) {
    const now=this.clock(),control=this.row('SELECT * FROM api_control WHERE id=1');
    if(control.auth_stopped)return null;
    const eligible=this.eligible(config);
    const running=this.row("SELECT MIN(lease_until) AS at FROM api_jobs WHERE state='running'").at;
    if(running!==null)return Math.max(now+1,running);
    const pending=this.row(`SELECT MIN(available_at) AS at FROM api_jobs WHERE state='pending' AND round_ref=? AND ${eligible.sql}`,
      config.probeRound,...eligible.args).at;
    if(pending===null)return null;
    let next=Math.max(now+1,pending,control.blocked_until,control.next_allowed);
    for(const [window,cap] of [[60_000,config.grantedPerMinute],[86_400_000,this.dailyCap(config)]]){
      if(this.row('SELECT COUNT(*) AS n FROM api_attempts WHERE at>?',now-window).n>=cap){
        next=Math.max(next,this.row('SELECT at FROM api_attempts WHERE at>? ORDER BY at DESC LIMIT 1 OFFSET ?',now-window,cap-1).at+window);
      }
    }
    return next;
  }

  enqueueProbeRound(roundRef) {
    const config = this.config(); if (!config.enabled) return {status: 'disabled'};
    const key = secret(this.env); if (!key) return {status: 'requires_approved_key'};
    safeReferences(config, key, [roundRef]);
    if (roundRef !== config.probeRound || !REF.test(roundRef)) throw new TypeError('Explicit approved round required');
    const now = this.clock();
    const result=this.ctx.storage.transactionSync(() => {
      for (const [order, operation] of INITIAL_OPERATIONS.entries()) {
        if (!config.allowedOperations.includes(operation)) continue;
        this.sql.exec('INSERT OR IGNORE INTO api_jobs(job_key,operation,round_ref,available_at) VALUES(?,?,?,?)',
          `${roundRef}:${order}:${operation}`, operation, roundRef, now);
      }
      return {status: 'queued_idempotently', jobCount: this.row('SELECT COUNT(*) AS n FROM api_jobs WHERE round_ref=?', roundRef).n};
    });
    if(config.nxSchemaProbesEnabled===true)return {...result,nxSchemaProbes:this.enqueueNxSchemaProbes(roundRef)};
    return result;
  }

  claim(config) {
    const now = this.clock();
    return this.ctx.storage.transactionSync(() => {
      const control = this.row('SELECT * FROM api_control WHERE id=1');
      if (control.auth_stopped) return {status: 'authentication_stopped'};
      if (now < control.blocked_until) return {status: 'backoff', retryAt: stamp(control.blocked_until)};
      if (now < control.next_allowed) return {status: 'spacing_wait', retryAt: stamp(control.next_allowed)};
      const stale = this.sql.exec("SELECT * FROM api_jobs WHERE state='running' AND lease_until<=?", now).toArray();
      for (const job of stale) {
        this.sql.exec("UPDATE api_attempts SET result='interrupted' WHERE id=? AND result IS NULL", job.attempt_id);
        this.sql.exec("UPDATE api_jobs SET state='pending',last_result='interrupted',lease_until=NULL,attempt_id=NULL WHERE job_key=?", job.job_key);
      }
      if (this.row("SELECT 1 AS n FROM api_jobs WHERE state='running' LIMIT 1")) return {status: 'leased'};
      const waits = [];
      for (const [window, cap] of [[60_000, config.grantedPerMinute], [86_400_000, this.dailyCap(config)]]) {
        const count = this.row('SELECT COUNT(*) AS n FROM api_attempts WHERE at>?', now-window).n;
        if (count >= cap) {
          const at = this.row('SELECT at FROM api_attempts WHERE at>? ORDER BY at DESC LIMIT 1 OFFSET ?', now-window, cap-1).at;
          waits.push(at+window);
        }
      }
      if (waits.length) return {status: 'budget_wait', retryAt: stamp(Math.max(...waits))};
      const eligible = this.eligible(config);
      if(this.observed){
        const exhausted=this.sql.exec(`SELECT * FROM api_jobs WHERE state='pending' AND round_ref=? AND ${eligible.sql}`,config.probeRound,...eligible.args).toArray();
        for(const pending of exhausted){const maximum=this.observed.maxAttempts(pending.operation,config);if(maximum&&pending.attempts>=maximum)this.sql.exec("UPDATE api_jobs SET state='unavailable',last_result='interrupted_retry_exhausted' WHERE job_key=?",pending.job_key);}
      }
      let job=null;
      for(let checked=0;checked<129;checked++){
        job=this.row(`SELECT * FROM api_jobs WHERE state='pending' AND available_at<=?
          AND round_ref=? AND ${eligible.sql} ORDER BY job_key LIMIT 1`,now,config.probeRound,...eligible.args);
        if(!job||own(OPERATIONS,job.operation)||this.observed?.registeredJobValid(job,config))break;
        this.sql.exec("UPDATE api_jobs SET state='unavailable',last_result='invalid_registered_identity' WHERE job_key=?",job.job_key);
        job=null;
      }
      if (!job) return {status: 'idle'};
      const attempt = this.row('INSERT INTO api_attempts(job_key,at,grant_ref) VALUES(?,?,?) RETURNING id', job.job_key, now, config.grantReference).id;
      this.sql.exec("UPDATE api_jobs SET state='running',attempts=attempts+1,lease_until=?,attempt_id=? WHERE job_key=?", now+LEASE_MS, attempt, job.job_key);
      this.sql.exec('UPDATE api_control SET next_allowed=? WHERE id=1', now+config.minimumRequestIntervalSeconds*1000);
      return {status: 'claimed', job: {...job, attempts: job.attempts+1, attempt_id: attempt}, startedAt: now};
    });
  }

  finish(job, config, outcome) {
    const now = this.clock();
    return this.ctx.storage.transactionSync(() => {
      const current = this.row('SELECT state,attempt_id FROM api_jobs WHERE job_key=?', job.job_key);
      if (current?.state !== 'running' || current.attempt_id !== job.attempt_id) return {status: 'stale_attempt'};
      let kind = outcome.kind; let wait = 0;
      const maxAttempts=this.observed?.maxAttempts(job.operation,config);
      if(kind==='retry'&&maxAttempts&&job.attempts>=maxAttempts)kind='retry_exhausted';
      if (kind === 'retry' || kind === 'retry_exhausted') {
        const base = Math.min(3_600_000, 1000*2**Math.min(job.attempts, 11));
        const maxJitter = Math.min(60_000, Math.floor(base/4));
        let extra = 0;
        try {extra = this.jitter(maxJitter);} catch {}
        if (!Number.isInteger(extra) || extra < 0 || extra > maxJitter) extra = 0;
        wait = now + Math.max(base, config.minimumRequestIntervalSeconds*1000, retryDelay(outcome.retryAfter, now)) + extra;
        if (!finiteTime(wait)) throw new TypeError('Invalid retry clock');
      }
      const state = {success: 'complete', retry: 'pending', auth_denied: 'auth_stopped', permanent_error: 'failed', unavailable:'unavailable', retry_exhausted:'unavailable'}[kind];
      if (!state) throw new TypeError('Invalid outcome');
      this.sql.exec('UPDATE api_attempts SET result=? WHERE id=?', kind, job.attempt_id);
      this.sql.exec('UPDATE api_jobs SET state=?,last_result=?,available_at=?,lease_until=NULL,attempt_id=NULL,receipt_key=? WHERE job_key=?',
        state, kind, wait || now, outcome.receiptKey ?? null, job.job_key);
      if (wait) this.sql.exec('UPDATE api_control SET blocked_until=MAX(blocked_until,?) WHERE id=1', wait);
      if (kind === 'auth_denied') this.sql.exec('UPDATE api_control SET auth_stopped=1 WHERE id=1');
      if (kind === 'success') this.sql.exec(`UPDATE api_control SET last_good_key=?,last_good_attempt=?,
        last_good_captured_at=?,pointer_pending=1 WHERE id=1`, outcome.receiptKey, job.attempt_id, outcome.capturedAt);
      return {status: kind, retryAt: wait ? stamp(wait) : null};
    });
  }

  async updatePrivatePointer() {
    const bucket = this.env.API_RAW_RECEIPTS;
    for (let retry = 0; retry < 3; retry++) {
      const row = this.row('SELECT * FROM api_control WHERE id=1');
      if (!row.pointer_pending || !row.last_good_key) return true;
      const key = PRIVATE_PREFIX+'last-good.json';
      const before = await bucket.get(key);
      if (before) {
        const prior = await before.json();
        if (Number.isSafeInteger(prior.attemptId) && prior.attemptId > row.last_good_attempt) return false;
      }
      const result = await bucket.put(key, JSON.stringify({schemaVersion: 1, kind: 'private_raw_receipt_pointer',
        attemptId: row.last_good_attempt, receiptKey: row.last_good_key, capturedAt: row.last_good_captured_at,
        sourceObservedAt: null, schemaVerified: false, publicationEligible: false}),
        {onlyIf: before ? {etagMatches: before.etag} : {etagDoesNotMatch: '*'},
         httpMetadata: {contentType: 'application/json'}});
      if (!result) continue;
      this.sql.exec('UPDATE api_control SET pointer_pending=0 WHERE id=1 AND last_good_attempt=?', row.last_good_attempt);
      return true;
    }
    return false;
  }

  async runOne() {
    let config;
    try {config = this.config();} catch {return {status: 'invalid_grant_configuration'};}
    if (!config.enabled) return {status: 'disabled'};
    const key = secret(this.env); if (!key) return {status: 'requires_approved_key'};
    try {safeReferences(config, key);} catch {return {status: 'invalid_grant_configuration'};}
    if (!this.env.API_RAW_RECEIPTS?.put || !this.env.API_RAW_RECEIPTS?.get) return {status: 'private_storage_unavailable'};
    // Concurrent events may arrive during outbound I/O; never hold a storage gate over it.
    if (this.flight) return {status: 'busy'};
    this.flight = this.perform(config, key);
    try {return await this.flight;} finally {this.flight = null;}
  }

  async perform(config, key) {
    // Repair an R2 pointer from its durable SQLite outbox without another provider call.
    try {if (!await this.updatePrivatePointer()) return {status: 'private_pointer_pending'};}
    catch {return {status: 'private_storage_unavailable'};}
    const claimed = this.claim(config); if (claimed.status !== 'claimed') return claimed;
    const {job, startedAt} = claimed;
    let outcome;
    try {
      const path = own(OPERATIONS,job.operation)?OPERATIONS[job.operation]:this.observed?.path(job.operation,config);
      if(!path)throw new TypeError('Unapproved operation');
      const response = await this.fetcher(ORIGIN+path, {method: 'GET', redirect: 'manual',
        signal: AbortSignal.timeout(20_000), headers: {Authorization: 'Bearer '+key,
          Accept: 'application/json', 'User-Agent': 'inflation.watch/1.0 (+https://inflation.gg; approved raw schema probe)'}});
      if ([401, 403].includes(response.status)) outcome = {kind: 'auth_denied'};
      else if (response.status === 429) outcome = {kind: 'retry', retryAfter: response.headers.get('retry-after')};
      else if (response.status >= 500) outcome = {kind: 'retry'};
      else if (response.status === 404 && this.observed?.definition(job.operation)) outcome = {kind:'unavailable'};
      else if (response.status !== 200) outcome = {kind: 'permanent_error'};
      else {
        const data = await jsonResponse(response, key); const capturedAt = stamp(this.clock());
        const receipt = {schemaVersion: 1, kind: 'unverified_provider_api_receipt',
          operation: job.operation, sourceUrl: ORIGIN+path, grantReference: config.grantReference,
          requestStartedAt: stamp(startedAt), capturedAt, captureTimeKind: 'http_response_completed',
          sourceObservedAt: null, observationTimestampKnown: false,
          schemaVerified: false, publicationEligible: false, httpStatus: 200, attemptId: job.attempt_id,
          roundReference: job.round_ref,
          ...(job.operation.startsWith('apple-') ? {expectedItemId:2010001,expectedItemName:'Apple',
            identityStatus:'known_canonical_id_not_yet_verified_in_this_provider_response'} : {}),
          ...(this.observed?.metadata(job.operation)??{}), ...data};
        const receiptKey = PRIVATE_PREFIX+`receipts/${String(job.attempt_id).padStart(12, '0')}-${job.operation}-${data.responseSha256}.json`;
        const serialized = JSON.stringify(receipt);
        if (serialized.includes(key)) throw new TypeError('Credential in receipt metadata');
        const stored = await this.env.API_RAW_RECEIPTS.put(receiptKey, serialized,
          {onlyIf: {etagDoesNotMatch: '*'}, httpMetadata: {contentType: 'application/json'}});
        if (!stored) throw new TypeError('Immutable receipt conflict');
        outcome = {kind: 'success', receiptKey, capturedAt};
      }
      if (response.status !== 200) await response.body?.cancel().catch(() => {});
    } catch {outcome = {kind: 'retry'};} // No raw exception/headers/credential persisted or returned.
    const result = this.finish(job, config, outcome);
    if (result.status === 'success') {
      try {if (!await this.updatePrivatePointer()) return {...result, privatePointerPending: true};}
      catch {return {...result, privatePointerPending: true};}
    }
    return result;
  }

  health() {
    const control = this.row('SELECT * FROM api_control WHERE id=1');
    return {kind: 'private_api_schema_probe_health', publicationEnabled: false, schemaVerified: false,
      authenticationStopped: Boolean(control.auth_stopped),
      retryNotBefore: control.blocked_until ? stamp(control.blocked_until) : null,
      nextAllowedAt: control.next_allowed ? stamp(control.next_allowed) : null,
      lastRawCapturedAt: control.last_good_captured_at, sourceObservedAt: null,
      privatePointerPending: Boolean(control.pointer_pending),
      attempts: this.row('SELECT COUNT(*) AS n FROM api_attempts').n,
      jobs: this.sql.exec('SELECT state,COUNT(*) AS count FROM api_jobs GROUP BY state ORDER BY state').toArray()};
  }

  resumeAfterCredentialsReview(grantRef) {
    const config = this.config();
    if (!config.enabled || config.grantReference !== grantRef) throw new TypeError('Explicit actual-grant review required');
    this.ctx.storage.transactionSync(() => {
      this.sql.exec('UPDATE api_control SET auth_stopped=0 WHERE id=1');
      this.sql.exec("UPDATE api_jobs SET state='pending' WHERE state='auth_stopped'");
    });
    return {status: 'credential_stop_reviewed', budgetsAndBackoffRetained: true};
  }
}
