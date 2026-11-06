// Curated private publication diagnostics. SQL only; no source, key or R2 reads.
export function privateNxR2Configuration(env,core){
 try{
  const value=JSON.parse(env.API_PRIVATE_NX_R2_JSON??'{"enabled":false}');
  if(value?.enabled===false)return'disabled';
  const fields='enabled,methodVersion,publicationEnabled,schemaVersion';
  if(!value||Object.keys(value).sort().join(',')!==fields||value.enabled!==true||value.schemaVersion!==1||value.methodVersion!==1||value.publicationEnabled!==false)return'invalid_configuration';
  const nx=JSON.parse(env.API_PRIVATE_NX_JSON??'{"enabled":false}');
  if(nx?.enabled===false)return'requires_private_nx';
  if(!nx||Object.keys(nx).sort().join(',')!==fields||nx.enabled!==true||nx.schemaVersion!==1||nx.methodVersion!==1||nx.publicationEnabled!==false)return'invalid_private_nx_configuration';
  if(core.config().enabled!==true)return'requires_enabled_grant';
  if(typeof env.API_RAW_RECEIPTS?.get!=='function'||typeof env.API_RAW_RECEIPTS?.put!=='function')return'requires_private_storage';
  return'ready';
 }catch{return'invalid_configuration';}
}
const integer=v=>Number.isSafeInteger(v)&&v>=0;
const clock=v=>v===null||v===0?null:integer(v)&&v<=8640000000000000?new Date(v).toISOString():undefined;
export function privateNxR2Health(core,env){
 const configuration=privateNxR2Configuration(env,core),base={diagnosticVersion:1,configuration,publicationEligible:false,sourceObservedAt:null,qualifiedIndividualTrades:0,clockKind:'operator_publication_state_not_market_observation',r2ObjectVerifiedByThisHealth:false};
 if(configuration!=='ready')return{...base,outboxState:'not_enabled'};
 try{
  if(!core.row("SELECT name FROM sqlite_master WHERE type='table' AND name='private_nx_r2_outbox'"))return{...base,outboxState:'not_initialized'};
  const row=core.row('SELECT state,target_generation,published_generation,retry_at,lease_until FROM private_nx_r2_outbox WHERE id=1');
  if(!row||!['idle','pending','ready','published','superseded','quarantined'].includes(row.state)||![row.target_generation,row.published_generation,row.retry_at].every(integer)||(row.lease_until!==null&&!integer(row.lease_until)))return{...base,outboxState:'invalid_state'};
  const retryAt=clock(row.retry_at),leaseUntil=clock(row.lease_until),due=['pending','ready'].includes(row.state)?clock(Math.max(core.clock(),row.retry_at,row.lease_until??0)):null;
  if(retryAt===undefined||leaseUntil===undefined||due===undefined)return{...base,outboxState:'invalid_state'};
  return{...base,outboxState:row.state,targetGeneration:row.target_generation,publishedGeneration:row.published_generation,retryAt,leaseUntil,nextEligibleAt:due};
 }catch{return{...base,outboxState:'diagnostic_unavailable'};}
}
