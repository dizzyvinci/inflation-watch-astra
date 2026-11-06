// Optional same-owner fair-work facade. No native alarm, provider or public route.
import {NxHistoryArchiveProducer} from './nx-history-producer.mjs';
import {PrivateNxOffersProducer} from './api-private-nx-offers.mjs';
const LEASE=130000;
const controlValid=c=>c&&['pending','running','ready','review'].includes(c.state)&&['claim','retry_at','failures'].every(k=>Number.isSafeInteger(c[k])&&c[k]>=0)&&(c.lease_until===null||Number.isSafeInteger(c.lease_until)&&c.lease_until>=0)&&(c.state!=='running'||c.lease_until!==null);
class Paused extends Error{}class Stale extends Error{}
export function nxHistoryArchiveConfiguration(env){try{
 const v=JSON.parse(env?.API_NX_HISTORY_JSON??'{"enabled":false}');
 if(v&&Object.keys(v).join(',')==='enabled'&&v.enabled===false)return'disabled';
 return v&&Object.keys(v).sort().join(',')==='enabled,methodVersion,publicationEnabled,schemaVersion'&&v.enabled===true&&v.schemaVersion===1&&v.methodVersion===1&&v.publicationEnabled===true?'ready':'invalid_configuration';
}catch{return'invalid_configuration';}}
export class NxHistoryArchiveWork{
 constructor(ctx,env,{getSourceProducer,now=Date.now}={}){
  this.ctx=ctx;this.env=env;this.getSourceProducer=getSourceProducer;this.now=now;this.producer=null;this.source=null;this.flight=null;this.initialized=false;
  if(this.active)this.ensureControl();
 }
 sourceCandidate(){try{return this.getSourceProducer?.()??null;}catch{return null;}}
 get active(){const p=this.sourceCandidate();return nxHistoryArchiveConfiguration(this.env)==='ready'&&p instanceof PrivateNxOffersProducer&&p.ctx===this.ctx&&p.bucket===this.env.API_RAW_RECEIPTS&&(!this.source||this.source===p);}
 row(){return this.ctx.storage.sql.exec('SELECT * FROM api_nx_history_owner WHERE id=1').toArray()[0];}
 ensureControl(){if(!this.active)return false;if(this.initialized)return true;
  this.ctx.storage.transactionSync(()=>{
   this.ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS api_nx_history_owner(id INTEGER PRIMARY KEY CHECK(id=1),state TEXT NOT NULL DEFAULT 'pending',claim INTEGER NOT NULL DEFAULT 0,lease_until INTEGER,retry_at INTEGER NOT NULL DEFAULT 0,failures INTEGER NOT NULL DEFAULT 0,last_result TEXT)");
   this.ctx.storage.sql.exec('INSERT OR IGNORE INTO api_nx_history_owner(id)VALUES(1)');
   // A persisted ready flag is not a live schema/source capability after reset.
   this.ctx.storage.sql.exec("UPDATE api_nx_history_owner SET state='pending',lease_until=NULL WHERE id=1 AND state='ready'");
  });this.initialized=true;return true;
 }
 nextDue(){if(!this.active)return null;this.ensureControl();const c=this.row();if(!controlValid(c)||c.state==='review')return null;
  const due=this.producer?this.producer.nextDue():c.state==='running'?c.lease_until:this.now();
  return due===null?null:Math.max(due,c.retry_at);
 }
 reconcile(limit=8){if(!Number.isSafeInteger(limit)||limit<1||limit>8)throw TypeError('bounded_archive_reconcile');
  if(!this.active)return{status:nxHistoryArchiveConfiguration(this.env)==='ready'?'waiting_same_owner_nx_producer':nxHistoryArchiveConfiguration(this.env)};
  this.ensureControl();return this.producer?this.producer.reconcile(limit):{status:'archive_bootstrap_pending',nextDue:this.nextDue()};
 }
 defer(){if(!this.active)return null;this.ensureControl();return this.ctx.storage.transactionSync(()=>{
  const c=this.row();if(!controlValid(c)||c.state==='review')return null;const failures=Math.min(c.failures+1,16),at=this.now()+Math.min(300000,30000*2**Math.min(failures-1,4));
  this.ctx.storage.sql.exec("UPDATE api_nx_history_owner SET retry_at=?,failures=?,last_result='owner_event_retry' WHERE id=1",at,failures);return at;
 });}
 health(){if(!this.active)return{status:nxHistoryArchiveConfiguration(this.env)==='ready'?'waiting_same_owner_nx_producer':nxHistoryArchiveConfiguration(this.env)};
  this.ensureControl();const c=this.row();if(!controlValid(c))return{status:'archive_owner_invalid_state',sourceObservedAt:null,qualifiedIndividualTrades:0};return{...(this.producer?this.producer.health():{status:c.state==='review'?'bootstrap_review':'archive_bootstrap_pending',sourceObservedAt:null,qualifiedIndividualTrades:0}),ownerBootstrapState:c.state,ownerRetryAt:c.retry_at||null,ownerLastResult:c.last_result};
 }
 async bootstrap(beforeIO){this.ensureControl();const now=this.now(),source=this.sourceCandidate();let claim;
  this.ctx.storage.transactionSync(()=>{
   const c=this.row();if(c.state==='review'||c.retry_at>now||c.state==='running'&&c.lease_until>now)return;
   if(!Number.isSafeInteger(c.claim)||c.claim>=Number.MAX_SAFE_INTEGER||!Number.isSafeInteger(c.failures)||c.failures<0)throw TypeError('archive_owner_counter');
   claim=c.claim+1;this.ctx.storage.sql.exec("UPDATE api_nx_history_owner SET state='running',claim=?,lease_until=? WHERE id=1",claim,now+LEASE);
  });if(claim===undefined)return{status:'archive_owner_bootstrap_wait',providerAttempted:false};
  const fence=()=>{if(!this.active||this.sourceCandidate()!==source)throw new Paused();const c=this.row();if(c.claim!==claim||c.state!=='running'||c.lease_until<=this.now())throw new Stale();};
  try{
   // Durable mux recovery must be armed before schema/index/heavy work.
   try{await beforeIO(now+LEASE);}catch{throw Error('archive_recovery_unavailable');}
   fence();const producer=new NxHistoryArchiveProducer(this.ctx,this.env.API_RAW_RECEIPTS,{producer:source,enabled:true,isEnabled:()=>this.active,now:this.now,coalesceMs:3600000});fence();
   this.ctx.storage.sql.exec("UPDATE api_nx_history_owner SET state='ready',lease_until=NULL,retry_at=0,failures=0,last_result='archive_owner_bootstrapped' WHERE id=1 AND claim=?",claim);
   this.source=source;this.producer=producer;return{status:'archive_owner_bootstrapped',providerAttempted:false};
  }catch(error){
   if(this.row().claim!==claim)return{status:'archive_owner_stale_bootstrap',providerAttempted:false};
   if(error instanceof Paused){this.ctx.storage.sql.exec("UPDATE api_nx_history_owner SET state='pending',lease_until=NULL,last_result='archive_owner_paused' WHERE id=1 AND claim=?",claim);return{status:'archive_owner_paused',providerAttempted:false};}
   if(error instanceof TypeError){this.ctx.storage.sql.exec("UPDATE api_nx_history_owner SET state='review',lease_until=NULL,last_result='archive_owner_bootstrap_review' WHERE id=1 AND claim=?",claim);return{status:'archive_owner_bootstrap_review',providerAttempted:false};}
   this.ctx.storage.sql.exec("UPDATE api_nx_history_owner SET state='pending',lease_until=NULL WHERE id=1 AND claim=?",claim);
   const at=this.defer();return{status:'archive_owner_bootstrap_retry',retryAt:at,providerAttempted:false};
  }
 }
 async drainOne(beforeIO){if(!this.active)return this.health();if(this.flight)return{status:'busy'};if(typeof beforeIO!=='function')throw TypeError('mux_recovery_callback_required');
  const due=this.nextDue();if(due===null||due>this.now())return{status:due===null?'idle':'backoff',retryAt:due,providerAttempted:false};
  const task=(async()=>{
   if(!this.producer)return this.bootstrap(beforeIO);
   const result=await this.producer.drainOne(beforeIO);
   this.ctx.storage.sql.exec('UPDATE api_nx_history_owner SET retry_at=0,failures=0 WHERE id=1');return result;
  })();this.flight=task;try{return await task;}finally{if(this.flight===task)this.flight=null;}
 }
}
