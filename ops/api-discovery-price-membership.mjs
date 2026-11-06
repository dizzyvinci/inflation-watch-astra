// Same-owner normalized identity intake only. No provider/raw read, price DTO, route or native alarm.
import {ApiCollectorCore} from './api-collector-core.mjs';
import {isOwnedRecurringRegistry} from './item-recurring-registry.mjs';
import {ItemDiscoveryProducer} from './api-item-discovery-producer.mjs';
import {sha256} from './api-price-item-dto.mjs';
const HEX=/^[a-f0-9]{64}$/,KEY=/^_private\/provider-api\/v1\/receipts\/([0-9]{12,16})-prices-([a-f0-9]{64})\.json$/;
const stamp=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const sha=s=>sha256(new TextEncoder().encode(s));
class Paused extends Error{}class Review extends Error{}
const check=(v,code)=>{if(!v)throw new Review(code);};
export function discoveryPriceMembershipConfiguration(env){try{const p=JSON.parse(env.API_DISCOVERY_PRICE_MEMBERSHIP_JSON??'{"enabled":false}');if(p&&Object.keys(p).join(',')==='enabled'&&p.enabled===false)return'disabled';return p&&Object.keys(p).sort().join(',')==='enabled,methodVersion,schemaVersion'&&p.enabled===true&&p.schemaVersion===1&&p.methodVersion===1?'ready':'invalid_configuration';}catch{return'invalid_configuration';}}
export class DiscoveryPriceMembershipIntake{
 constructor(ctx,core,registry,discovery,{getCutoff,getGeneration}={}){
  if(!(core instanceof ApiCollectorCore)||core.ctx!==ctx||!(discovery instanceof ItemDiscoveryProducer)||discovery.ctx!==ctx||typeof getCutoff!=='function'||typeof getGeneration!=='function')throw TypeError('same_owned_discovery_required');
  this.ctx=ctx;this.core=core;this.registry=registry;this.discovery=discovery;this.getCutoff=getCutoff;this.getGeneration=getGeneration;this.flight=null;
 }
 get active(){try{return discoveryPriceMembershipConfiguration(this.core.env)==='ready'&&isOwnedRecurringRegistry(this.registry,this.ctx)&&this.registry.core===this.core&&this.registry.active&&this.discovery.active&&this.core.config().enabled===true;}catch{return false;}}
 scope(){if(!this.active)throw new Paused();const g=this.core.config(),cutoff=this.getCutoff(),generation=this.getGeneration();check(Number.isSafeInteger(cutoff)&&cutoff>0&&HEX.test(generation),'selected_context');return{grant:g.grantReference,round:g.probeRound,cutoff,generation};}
 same(s){const next=this.scope();if(JSON.stringify(next)!==JSON.stringify(s))throw new Paused();}
 ensure(){this.scope();this.core.sql.exec('CREATE TABLE IF NOT EXISTS discovery_price_membership_acks(capture_hash TEXT PRIMARY KEY,receipt_key TEXT NOT NULL UNIQUE,source_attempt INTEGER NOT NULL,set_hash TEXT NOT NULL,captured_at TEXT NOT NULL,item_count INTEGER NOT NULL,grant_ref TEXT NOT NULL,round_ref TEXT NOT NULL)');}
 candidates(s,limit=8,count=false){return this.core.sql.exec(`SELECT ${count?'COUNT(*)n':'c.*,s.ids_json,j.state AS registry_state'} FROM recurring_registry_captures c JOIN recurring_registry_sets s ON s.set_hash=c.set_hash JOIN recurring_registry_jobs j ON j.receipt_key=c.receipt_key LEFT JOIN discovery_price_membership_acks d ON d.capture_hash=c.capture_hash WHERE c.operation='prices' AND j.state='complete' AND c.source_attempt<=? AND d.capture_hash IS NULL ${count?'':'ORDER BY c.source_attempt,c.capture_hash LIMIT ?'}`,s.cutoff,...(count?[]:[limit])).toArray();}
 missing(s){return this.core.row(`SELECT CASE WHEN c.capture_hash IS NOT NULL THEN 'invalid_capture_binding' ELSE r.state END AS state FROM api_jobs j JOIN api_attempts a ON a.job_key=j.job_key LEFT JOIN recurring_registry_captures c ON c.receipt_key=j.receipt_key LEFT JOIN recurring_registry_jobs r ON r.receipt_key=j.receipt_key WHERE j.operation='prices' AND j.state='complete' AND j.round_ref=? AND a.grant_ref=? AND a.result='success' AND a.id<=? AND j.receipt_key=('_private/provider-api/v1/receipts/'||printf('%012d',a.id)||'-prices-'||substr(j.receipt_key,-69)) AND (c.capture_hash IS NULL OR c.operation IS NOT 'prices' OR c.source_attempt IS NOT a.id OR c.raw_sha IS NOT substr(j.receipt_key,-69,64)) ORDER BY a.id LIMIT 1`,s.round,s.grant,s.cutoff)??null;}
 broken(s){const missing=this.core.row(`SELECT c.capture_hash FROM recurring_registry_captures c LEFT JOIN recurring_registry_jobs j ON j.receipt_key=c.receipt_key LEFT JOIN recurring_registry_sets v ON v.set_hash=c.set_hash WHERE c.operation='prices' AND c.source_attempt<=? AND (j.receipt_key IS NULL OR j.state!='complete' OR v.set_hash IS NULL OR j.operation IS NOT 'prices' OR j.source_attempt IS NOT c.source_attempt OR j.raw_sha IS NOT c.raw_sha) LIMIT 1`,s.cutoff);if(missing)return missing;
  return this.core.row(`SELECT d.capture_hash FROM discovery_price_membership_acks d LEFT JOIN recurring_registry_captures c ON c.capture_hash=d.capture_hash LEFT JOIN recurring_registry_sets v ON v.set_hash=c.set_hash LEFT JOIN recurring_registry_jobs r ON r.receipt_key=c.receipt_key LEFT JOIN api_jobs j ON j.job_key=r.job_key LEFT JOIN api_attempts a ON a.job_key=j.job_key AND a.id=d.source_attempt WHERE (d.source_attempt>? OR d.grant_ref IS NOT ? OR d.round_ref IS NOT ? OR c.capture_hash IS NULL OR v.set_hash IS NULL OR r.state IS NOT 'complete' OR j.state IS NOT 'complete' OR j.operation IS NOT 'prices' OR j.round_ref IS NOT d.round_ref OR j.receipt_key IS NOT d.receipt_key OR a.result IS NOT 'success' OR a.grant_ref IS NOT d.grant_ref OR a.at IS NOT r.request_at OR c.operation IS NOT 'prices' OR c.receipt_key IS NOT d.receipt_key OR c.source_attempt IS NOT d.source_attempt OR c.set_hash IS NOT d.set_hash OR c.captured_at IS NOT d.captured_at OR c.id_count IS NOT d.item_count) LIMIT 1`,s.cutoff,s.grant,s.round)??null;
 }
 state(){if(!this.active)return{status:'waiting_owned_membership_registry',remaining:null};this.ensure();const s=this.scope(),remaining=this.candidates(s,8,true)[0].n,missing=this.missing(s);if(this.broken(s))return{status:'membership_registry_review',remaining};return{status:missing?['complete','invalid_capture_binding','quarantined','authority_review','capacity_hold'].includes(missing.state)?'membership_registry_review':'waiting_registry_price_membership':remaining?'price_membership_pending':'price_membership_complete',remaining};}
 snapshot(r){return Object.freeze(Object.fromEntries(['capture_hash','receipt_key','operation','source_attempt','job_key','request_at','raw_sha','request_started_at','captured_at','set_hash','id_count','publisher_generated_at','ids_json','registry_state'].map(k=>[k,r[k]??null])));}
 row(hash){const r=this.core.row('SELECT c.*,s.ids_json,j.state AS registry_state,j.job_key,j.request_at FROM recurring_registry_captures c JOIN recurring_registry_sets s ON s.set_hash=c.set_hash JOIN recurring_registry_jobs j ON j.receipt_key=c.receipt_key WHERE c.capture_hash=?',hash);return r&&this.snapshot(r);}
 owned(r,s){const a=this.core.row("SELECT j.operation,j.state,j.round_ref,j.receipt_key,a.at,a.result,a.grant_ref FROM api_jobs j JOIN api_attempts a ON a.job_key=j.job_key AND a.id=? WHERE j.job_key=?",r.source_attempt,r.job_key);check(a&&a.operation==='prices'&&a.state==='complete'&&a.round_ref===s.round&&a.receipt_key===r.receipt_key&&a.at===r.request_at&&a.result==='success'&&a.grant_ref===s.grant,'accepted_capture_owned_binding');}
 async validate(r,s,price){
  check(r.registry_state==='complete'&&r.operation==='prices'&&HEX.test(r.capture_hash)&&HEX.test(r.raw_sha)&&HEX.test(r.set_hash),'capture_shape');
  const m=KEY.exec(r.receipt_key);check(m&&String(Number(m[1])).padStart(12,'0')===m[1]&&Number(m[1])===r.source_attempt&&m[2]===r.raw_sha&&r.source_attempt<=s.cutoff,'capture_receipt');
  check(Number.isSafeInteger(r.request_at)&&stamp(r.request_started_at)&&Date.parse(r.request_started_at)===r.request_at&&stamp(r.captured_at)&&Date.parse(r.captured_at)>=r.request_at&&r.captured_at<=price.context.retrievedAt&&r.publisher_generated_at===null,'capture_clock');
  this.owned(r,s);
  check(typeof r.ids_json==='string'&&new TextEncoder().encode(r.ids_json).byteLength<=200001&&Number.isSafeInteger(r.id_count)&&r.id_count>=0&&r.id_count<=10000,'set_bounds');
  let ids;try{ids=JSON.parse(r.ids_json);}catch{throw new Review('set_json');}check(Array.isArray(ids)&&ids.length===r.id_count&&ids.every((id,i)=>Number.isSafeInteger(id)&&id>0&&id<=999999999&&(i===0||ids[i-1]<id))&&JSON.stringify(ids)===r.ids_json,'set_ids');
  check(await sha(r.ids_json)===r.set_hash,'set_sha');
  check(await sha(JSON.stringify({receiptKey:r.receipt_key,rawSha:r.raw_sha,requestAt:r.request_started_at,capturedAt:r.captured_at,operation:'prices',setHash:r.set_hash}))===r.capture_hash,'capture_sha');
  return Object.freeze(ids);
 }
 async drainOne(beforeIO,limit=8){if(!this.active)return{status:'waiting_owned_membership_registry',accepted:0};if(this.flight)return{status:'busy',accepted:0};if(typeof beforeIO!=='function'||!Number.isSafeInteger(limit)||limit<1||limit>8)throw TypeError('bounded_membership_event');const task=this.perform(beforeIO,limit);this.flight=task;try{return await task;}finally{if(this.flight===task)this.flight=null;}}
 async perform(beforeIO,limit){try{
  this.ensure();const s=this.scope(),state=this.state();if(['membership_registry_review','waiting_registry_price_membership'].includes(state.status))return{...state,accepted:0};const selected=this.candidates(s,limit).map(r=>this.row(r.capture_hash));if(!selected.length)return{...this.state(),accepted:0};
  await beforeIO(this.core.clock()+130000);this.same(s);
  const price=await this.discovery.currentPrice();this.same(s);check(price.pointer.generation===s.generation&&price.pointer.sourceAttemptId<=s.cutoff&&stamp(price.context.retrievedAt),'committed_price_context');
  const prepared=[];for(const r of selected){const ids=await this.validate(r,s,price);this.same(s);prepared.push({r,ids});}
  return this.ctx.storage.transactionSync(()=>{
   this.same(s);const all=new Set(this.core.sql.exec('SELECT DISTINCT item_id FROM discovery_presence').toArray().map(r=>r.item_id)),updates=new Map();
   check(this.core.row('SELECT COUNT(*)n FROM discovery_price_membership_acks').n+prepared.length<=1000000,'membership_ack_capacity');
   for(const {r,ids}of prepared){check(JSON.stringify(this.row(r.capture_hash))===JSON.stringify(r),'capture_changed');check(!this.core.row('SELECT 1 FROM discovery_price_membership_acks WHERE capture_hash=?',r.capture_hash),'capture_ack_changed');this.owned(r,s);for(const id of ids){all.add(id);const old=updates.get(id);if(!old||r.captured_at>old)updates.set(id,r.captured_at);}}
   check(all.size<=10000,'discovery_identity_capacity');
   for(const [id,capturedAt]of updates)this.core.sql.exec("INSERT INTO discovery_presence(operation,item_id,last_seen)VALUES('prices',?,?) ON CONFLICT(operation,item_id)DO UPDATE SET last_seen=MAX(last_seen,excluded.last_seen)",id,capturedAt);
   for(const {r}of prepared){this.core.sql.exec('INSERT INTO discovery_price_membership_acks VALUES(?,?,?,?,?,?,?,?)',r.capture_hash,r.receipt_key,r.source_attempt,r.set_hash,r.captured_at,r.id_count,s.grant,s.round);}
   this.core.sql.exec('UPDATE discovery_control SET dirty=1,revision=revision+1,retry_at=0 WHERE id=1');this.same(s);return{status:'normalized_price_memberships_accepted',accepted:prepared.length,providerAttempted:false};
  });
 }catch(e){if(e instanceof Paused||!this.active)return{status:'price_membership_paused',accepted:0};return{status:e instanceof Review?'normalized_price_membership_review':'normalized_price_membership_retry',accepted:0};}}
}
