// Lightweight owner facade: metadata bootstrap and prices staging are separate events.
import {StaticItemMetadataLoader,StaticMetadataError} from './api-item-metadata-loader.mjs';
import {FinitePrivateItemProducer,itemPilotConfiguration} from './api-private-item-pilot.mjs';
import {privateItemConfiguration} from './api-private-item-health.mjs';
const LEASE=130000;
export class PrivateItemWork{
 constructor(ctx,env,core,{loaderFactory=options=>new StaticItemMetadataLoader(options)}={}){this.ctx=ctx;this.env=env;this.core=core;this.producer=null;this.loaderFactory=loaderFactory;this.flight=null;
  if(!this.active)return;
  core.sql.exec('CREATE TABLE IF NOT EXISTS private_item_bootstrap(id INTEGER PRIMARY KEY CHECK(id=1),state TEXT NOT NULL,available_at INTEGER NOT NULL,lease_until INTEGER,claim INTEGER NOT NULL DEFAULT 0,failures INTEGER NOT NULL DEFAULT 0,metadata_hashes TEXT,last_result TEXT,event_retry_at INTEGER NOT NULL DEFAULT 0)');
  core.sql.exec("INSERT OR IGNORE INTO private_item_bootstrap(id,state,available_at) VALUES(1,'pending',?)",core.clock());
  // A ready SQL row is not an in-memory loader after restart. The bootstrap is
  // repeated locally, never by reading/re-requesting any provider receipt.
  core.sql.exec("UPDATE private_item_bootstrap SET state='pending',available_at=?,lease_until=NULL WHERE id=1 AND state='ready'",core.clock());
 }
 get active(){return privateItemConfiguration(this.env,this.core)==='ready'&&itemPilotConfiguration(this.env).status==='ready';}
 row(){return this.core.row('SELECT * FROM private_item_bootstrap WHERE id=1');}
 nextDue(){if(!this.active)return null;const b=this.row();if(b.state==='review')return null;let due;
  if(this.producer)due=this.producer.nextDue();else due=b.state==='running'?b.lease_until:b.available_at;
  if(b.event_retry_at>0)due=due===null?b.event_retry_at:Math.max(due,b.event_retry_at);return due;
 }
 reconcile(){if(!this.active)return{status:'disabled',queued:0};return this.producer?this.producer.reconcile(8):{status:'metadata_bootstrap_scheduled',queued:0};}
 defer(){if(!this.active)return null;const at=this.core.clock()+30000;this.core.sql.exec('UPDATE private_item_bootstrap SET event_retry_at=? WHERE id=1',at);return at;}
 async drainOne(beforeIO){if(!this.active)return{status:'disabled'};if(this.flight)return{status:'busy'};if(typeof beforeIO!=='function')throw new TypeError('items_recovery_callback_required');const b=this.row();if(b.event_retry_at>this.core.clock())return{status:'items_event_backoff',retryAt:b.event_retry_at};this.flight=this.perform(beforeIO);try{return await this.flight;}finally{this.flight=null;}}
 async perform(beforeIO){this.core.sql.exec('UPDATE private_item_bootstrap SET event_retry_at=0 WHERE id=1');if(this.producer){this.producer.reconcile(8);return this.producer.drainOne(beforeIO);}
  const now=this.core.clock(),claim=this.ctx.storage.transactionSync(()=>{this.core.sql.exec("UPDATE private_item_bootstrap SET state='pending',lease_until=NULL WHERE state='running' AND lease_until<=?",now);const b=this.row();if(b.state!=='pending'||b.available_at>now)return null;this.core.sql.exec("UPDATE private_item_bootstrap SET state='running',claim=claim+1,lease_until=? WHERE id=1",now+LEASE);return b.claim+1;});if(claim===null)return{status:'metadata_bootstrap_wait'};
  const valid=()=>{const b=this.row();return this.active&&b.state==='running'&&b.claim===claim&&b.lease_until>this.core.clock();};
  try{await beforeIO(now+LEASE);if(!valid())throw new StaticMetadataError('static_metadata_disabled');
   this.loader??=this.loaderFactory({enabled:true,isEnabled:()=>this.active});const result=await this.loader.load();if(!valid()||result.status!=='ready')throw new StaticMetadataError('static_metadata_disabled');
   const producer=new FinitePrivateItemProducer(this.ctx,this.env,result.sources,{enabled:true,isEnabled:()=>this.active,now:()=>this.core.clock()});
   this.ctx.storage.transactionSync(()=>{if(!valid())throw new StaticMetadataError('static_metadata_disabled');this.core.sql.exec("UPDATE private_item_bootstrap SET state='ready',lease_until=NULL,failures=0,metadata_hashes=?,last_result='static_metadata_verified' WHERE id=1 AND claim=?",JSON.stringify(result.sources.map(s=>s.expectedSha256)),claim);});this.producer=producer;
   return{status:'metadata_bootstrapped',eventWork:'metadata_only',providerAttempted:false};
  }catch(error){const b=this.row();if(b.state!=='running'||b.claim!==claim)return{status:'stale_metadata_claim',providerAttempted:false};
   const off=!this.active||error instanceof StaticMetadataError&&error.message==='static_metadata_disabled',bad=error instanceof StaticMetadataError&&!off,at=this.core.clock()+Math.min(300000,30000*2**Math.min(b.failures,4));
   this.core.sql.exec('UPDATE private_item_bootstrap SET state=?,lease_until=NULL,available_at=?,failures=failures+1,last_result=? WHERE id=1 AND claim=?',bad?'review':'pending',off?b.available_at:at,bad?'static_metadata_review':off?'paused':'metadata_bootstrap_retry',claim);return{status:bad?'static_metadata_review':off?'disabled':'metadata_bootstrap_retry',retryAt:off||bad?null:at,providerAttempted:false};
  }
 }
}
