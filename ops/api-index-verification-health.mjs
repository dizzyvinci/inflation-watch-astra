// SQL metadata only. No source rows/bodies, bucket calls or remote attestation.
import {EXPECTED_DEFINITION_HASH} from './api-index-definition.mjs';
const HASH=/^[a-f0-9]{64}$/,PREFIX='_private/provider-api/v1/api-index/v1/';
const integer=(v,min=0)=>Number.isSafeInteger(v)&&v>=min;
const clock=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const base=status=>({diagnosticVersion:1,status,definitionHash:EXPECTED_DEFINITION_HASH,
  clockKind:'committed_SQL_publication_not_remote_attestation',remoteR2Availability:'not_checked',
  remoteR2ObjectVerified:false,sourceObservedAt:null,publicationEligible:false});
const need=value=>{if(!value)throw TypeError('committed_calculation_metadata');};
export function committedCalculationVerificationPins(core,{checkedAt}={}){
  if(core.indexBridge?.active!==true)return null;
  try{return core.ctx.storage.transactionSync(()=>{
    need(clock(checkedAt)&&core.indexBridge.core===core&&core.indexBridge.ctx===core.ctx);
    const owner=core.row('SELECT definition_hash,grant_ref,round_ref,last_published,next_publication FROM api_index_owner WHERE id=1');
    need(owner&&owner.definition_hash===EXPECTED_DEFINITION_HASH&&owner.grant_ref===core.indexBridge.binding.grantReference&&owner.round_ref===core.indexBridge.binding.probeRound&&integer(owner.last_published)&&integer(owner.next_publication)&&owner.last_published<=owner.next_publication);
    if(owner.last_published===0)return base('not_committed');
    const rows=core.sql.exec(`SELECT definition_hash,publication_ordinal,model_sha,model_key,public_sha,public_key,snapshot_hash,
      price_capture_hash,overview_capture_hash,prices_captured_at,overview_captured_at,calculated_at
      FROM api_index_inputs WHERE publication_ordinal=? AND state='complete' AND phase='done' LIMIT 2`,owner.last_published).toArray();
    need(rows.length===1);const row=rows[0];
    need(row.definition_hash===EXPECTED_DEFINITION_HASH&&integer(row.publication_ordinal,1)&&row.publication_ordinal===owner.last_published);
    for(const k of ['model_sha','public_sha','snapshot_hash'])need(typeof row[k]==='string'&&HASH.test(row[k]));
    need(row.model_key===PREFIX+'models/'+row.model_sha+'.json'&&row.public_key===PREFIX+'public-models/'+row.public_sha+'.json');
    need(clock(row.calculated_at)&&Date.parse(row.calculated_at)<=Date.parse(checkedAt));
    for(const [hashKey,clockKey]of [['price_capture_hash','prices_captured_at'],['overview_capture_hash','overview_captured_at']]){
      need(row[hashKey]===null||typeof row[hashKey]==='string'&&HASH.test(row[hashKey]));
      need((row[hashKey]===null)===(row[clockKey]===null));
      need(row[clockKey]===null||clock(row[clockKey])&&Date.parse(row[clockKey])<=Date.parse(row.calculated_at));
    }
    need(core.indexBridge?.active===true);
    return {...base('committed_sql_only'),publicationOrdinal:row.publication_ordinal,
      modelSha256:row.model_sha,modelKey:row.model_key,publicBodySha256:row.public_sha,publicKey:row.public_key,
      snapshotHash:row.snapshot_hash,priceCaptureHash:row.price_capture_hash,overviewCaptureHash:row.overview_capture_hash,
      pricesCapturedAt:row.prices_captured_at,overviewCapturedAt:row.overview_captured_at,calculatedAt:row.calculated_at};
  });}catch{return base('diagnostic_unavailable');}
}
