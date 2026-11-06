// Private own-object metadata only; no SQL statement, source row, RPC or transport.
export const DOCUMENTED_PAID_OBJECT_LIMIT_BYTES=10_000_000_000;
const FLAG='API_PRIVATE_SQLITE_SIZE_JSON';
const validClock=value=>typeof value==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString()===value;
function configuration(env){
  let text;try{text=env?.[FLAG];}catch{return'invalid';}
  if(text===undefined)return'off';
  if(typeof text!=='string'||text.length>512)return'invalid';
  try{
    const value=JSON.parse(text);
    if(!value||typeof value!=='object'||Array.isArray(value))return'invalid';
    // Only these literal primitive keys are supported. Reject duplicate/escaped keys.
    const keys=[...text.matchAll(/"([^"\\]*)"\s*:/g)].map(x=>x[1]);
    if(keys.length!==Object.keys(value).length||new Set(keys).size!==keys.length)return'invalid';
    if(keys.length===1&&keys[0]==='enabled'&&value.enabled===false)return'off';
    const allowed=['schemaVersion','enabled','methodVersion','publicationEnabled'];
    if(keys.length!==4||keys.some(k=>!allowed.includes(k))||value.schemaVersion!==1||value.methodVersion!==1||value.enabled!==true||value.publicationEnabled!==false)return'invalid';
    return'on';
  }catch{return'invalid';}
}
export function privateSqliteStorageHealth(ctx,env,{checkedAt}={}){
  const config=configuration(env);
  // Preserve the pre-existing health body's exact shape/hash when absent or Off.
  if(config==='off')return null;
  const base={diagnosticVersion:1,status:'unavailable',metric:'own_object_sqlite_database_size_bytes',
    measuredAt:null,measurementClockKind:'owner_health_measurement_not_market_observation',
    databaseSizeBytes:null,documentedPaidObjectLimitBytes:DOCUMENTED_PAID_OBJECT_LIMIT_BYTES,
    fractionOfDocumentedPaidLimit:null,documentedLimitRelation:'unknown',
    actualPlanVerifiedByThisDiagnostic:false,remoteR2Availability:'not_checked',
    sourceObservedAt:null,qualifiedIndividualTrades:0,applicationSqlQueries:0,sourceRowsInspected:0};
  if(config!=='on')return{...base,status:'invalid_configuration'};
  if(!validClock(checkedAt))return{...base,status:'invalid_measurement_clock'};
  let bytes;try{bytes=ctx.storage.sql.databaseSize;}catch{return base;}
  if(!Number.isSafeInteger(bytes)||bytes<0)return base;
  return{...base,status:'observed',measuredAt:checkedAt,databaseSizeBytes:bytes,
    fractionOfDocumentedPaidLimit:bytes/DOCUMENTED_PAID_OBJECT_LIMIT_BYTES,
    documentedLimitRelation:bytes<DOCUMENTED_PAID_OBJECT_LIMIT_BYTES?'below':bytes===DOCUMENTED_PAID_OBJECT_LIMIT_BYTES?'at':'above'};
}
