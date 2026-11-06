// Owner-only synchronous retirement/reference interlock. No IO or visitor IDs.
const BRAND=new WeakMap(),SHA=/^[a-f0-9]{64}$/,PREFIX='_private/provider-api/v1/item-projections/v1/';
export class ItemReferenceError extends Error{constructor(code){super(code);this.name='ItemReferenceError';}}
const check=(ok,code)=>{if(!ok)throw new ItemReferenceError(code);};
export function itemGenerationRetiring(ctx,generation){check(SHA.test(generation),'generation_hash');const sql=ctx.storage.sql;if(!sql.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='private_item_retirements'").toArray().length)return false;const row=sql.exec('SELECT state FROM private_item_retirements WHERE generation=?',generation).toArray()[0];return !!row&&row.state!=='cancelled';}
export function isOwnerItemGenerationRefs(value,ctx,referenceType='item_discovery'){const s=BRAND.get(value);return !!s&&s.enabled&&s.ctx===ctx&&s.referenceType===referenceType;}
export class OwnerItemGenerationRefs{
 constructor(ctx,{enabled=false,isEnabled=()=>true,referenceType='item_discovery'}={}){check(referenceType==='item_discovery','unknown_owner_reference_type');const state={ctx,enabled:enabled===true,isEnabled,referenceType};BRAND.set(this,state);if(!state.enabled)return;
  ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS private_item_generation_refs(reference_type TEXT NOT NULL,reference_id TEXT NOT NULL,generation TEXT NOT NULL,PRIMARY KEY(reference_type,reference_id,generation))');ctx.storage.sql.exec('CREATE INDEX IF NOT EXISTS private_item_refs_generation ON private_item_generation_refs(generation)');
 }
 stageWithReference(reference,commitStageSQL){const s=BRAND.get(this);check(s?.enabled&&s.isEnabled()===true,'reference_guard_disabled');check(typeof commitStageSQL==='function','synchronous_stage_callback');
  const {generation,referenceType,referenceId}=reference??{};check(reference&&Object.keys(reference).sort().join(',')==='generation,referenceId,referenceType'&&referenceType===s.referenceType&&SHA.test(generation)&&typeof referenceId==='string'&&/^item-discovery:[a-f0-9]{64}$/.test(referenceId),'fixed_owner_reference');
  return s.ctx.storage.transactionSync(()=>{check(s.isEnabled()===true,'reference_guard_disabled');check(!itemGenerationRetiring(s.ctx,generation),'generation_retiring');const sql=s.ctx.storage.sql;
   const rows=sql.exec('SELECT state,phase,generation,source_attempt,raw_sha,manifest_sha,pointer_body FROM private_item_jobs WHERE generation=?',generation).toArray();check(rows.length===1,'unknown_owned_generation');const r=rows[0];check(r.phase==='pointer'||r.phase==='done'&&['complete','superseded'].includes(r.state),'generation_not_committed');let p;try{p=JSON.parse(r.pointer_body);}catch{throw new ItemReferenceError('invalid_owned_pointer');}
   check(p&&p.schemaVersion===1&&p.kind==='private_api_item_pointer'&&p.generation===generation&&p.sourceAttemptId===r.source_attempt&&p.rawBodySha256===r.raw_sha&&p.manifestSha256===r.manifest_sha&&p.manifestKey===PREFIX+generation+'/manifest.json'&&p.sourceObservedAt===null&&p.publicationEligible===false,'invalid_owned_pointer');
   const exists=sql.exec('SELECT 1 FROM private_item_generation_refs WHERE reference_type=? AND reference_id=? AND generation=?',referenceType,referenceId,generation).toArray().length;
   if(!exists){const count=sql.exec('SELECT COUNT(*) AS n FROM private_item_generation_refs WHERE reference_type=?',referenceType).toArray()[0].n;check(Number.isSafeInteger(count)&&count<10000,'owner_reference_capacity_hold');sql.exec('INSERT INTO private_item_generation_refs VALUES(?,?,?)',referenceType,referenceId,generation);}
   const result=commitStageSQL();check(!result||typeof result.then!=='function','stage_callback_must_be_synchronous');check(s.isEnabled()===true,'reference_guard_disabled');return result;
  });
 }
 retentionRefs(){const s=BRAND.get(this);check(s?.enabled&&s.isEnabled()===true,'reference_guard_disabled');return s.ctx.storage.sql.exec('SELECT reference_type,reference_id,generation FROM private_item_generation_refs WHERE reference_type=? ORDER BY reference_id,generation LIMIT 10001',s.referenceType).toArray().map(r=>Object.freeze({...r}));}
}
