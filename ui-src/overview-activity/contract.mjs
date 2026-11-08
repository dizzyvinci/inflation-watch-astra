// Standalone public aggregate contract. No producer, SQL, DOM or transport imports.
export const PROTOCOL='overview-window-activity-v1';
export const DEFINITION_SHA='65bf9403902e24eb6ab24a9d9b3d1f2ec4c49304ec57671869208e45335f8b36';
export const PROFILE_PATH='/api-overview-window-activity/profile.json';
export const CURRENT_PATH='/api-overview-window-activity/current.json';
export const REQUEST_HEADER='X-Astra-Request-Overview-Activity-Protocol';
export const HEADERS=Object.freeze({hash:'X-Astra-Overview-Activity-Body-Sha256',epoch:'X-Astra-Overview-Activity-Epoch',state:'X-Astra-Overview-Activity-State',capture:'X-Astra-Overview-Activity-Captured-At',generated:'X-Astra-Overview-Activity-Generated-At'});
export const SEMANTICS=Object.freeze({grain:'source_reported_overview_window_not_daily',coverageUniverse:'received_overview_rows',counterSums:Object.freeze({sourceRecordedSalesCounterSumLexeme:'source_reported_counts_not_unique_or_verified_trades',sourceReportedUnitCounterSumLexeme:'reported_unit_counters_not_standardized_market_volume',sourceReportedMesosSumLexeme:'source_labelled_mesos_not_verified_trade_value',medianCountProxySumLexeme:'median_unit_price_times_recorded_sales_count_not_actual_traded_mesos'}),exactObservationBoundsKnown:false,sinceLaunch:false,dailyLedgerIncluded:false,itemRowsPublished:false,uniqueParticipantsKnown:false,marketInventoryKnown:false,upstreamLatestInspected:false});
const need=v=>{if(!v)throw Error('overview_activity_unavailable');};
export const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
export const publicEpoch=v=>typeof v==='string'&&/^[a-z][a-z0-9-]{0,63}$/.test(v);
const integer=(v,max)=>Number.isSafeInteger(v)&&v>=0&&v<=max;
const shape=(v,keys)=>need(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k)));
export function clock(v){need(typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v)&&v>='1970-01-01T00:00:00.000Z'&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v);return v;}
function freeze(v){if(v&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v;}
export const own=v=>structuredClone(v);
const ta=Object.getPrototypeOf(Uint8Array.prototype),lengthOf=Object.getOwnPropertyDescriptor(ta,'byteLength').get,bufferOf=Object.getOwnPropertyDescriptor(ta,'buffer').get,offsetOf=Object.getOwnPropertyDescriptor(ta,'byteOffset').get;
export function copyBytes(v,limit){need(v instanceof Uint8Array);const n=lengthOf.call(v);need(n>0&&n<=limit);const view=new Uint8Array(bufferOf.call(v),offsetOf.call(v),n),out=new Uint8Array(n);out.set(view);return out;}
export function parse(raw,limit){
 const s=new TextDecoder('utf-8',{fatal:true}).decode(copyBytes(raw,limit));let i=0,tokens=0;
 const ws=()=>{while(/[ \n\r\t]/.test(s[i]??'x'))i++;};
 function value(depth){need(depth<=12&&++tokens<=512);ws();const c=s[i];
  if(c==='"'){const a=i++;while(i<s.length){if(s[i]==='\\'){i+=2;continue;}if(s[i++]==='"')return JSON.parse(s.slice(a,i));}need(false);}
  if(c==='{'){i++;ws();const o=Object.create(null);if(s[i]==='}'){i++;return o;}for(;;){ws();need(s[i]==='"');const k=value(depth+1);need(!Object.hasOwn(o,k));ws();need(s[i++]===':');o[k]=value(depth+1);ws();if(s[i]==='}'){i++;return o;}need(s[i++]===',');}}
  for(const [word,v]of[['true',true],['false',false],['null',null]])if(s.startsWith(word,i)){i+=word.length;return v;}
  const n=/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(s.slice(i));need(n&&n[0].length<=32);i+=n[0].length;const v=Number(n[0]);need(Number.isFinite(v));return v;
 }
 const v=value(0);ws();need(i===s.length);return v;
}
export function profile(raw){const v=parse(raw,512);shape(v,['schemaVersion','kind','protocol','definitionHash','publicEpoch','available']);need(v.schemaVersion===1&&v.kind==='overview_activity_public_profile'&&v.protocol===PROTOCOL&&v.definitionHash===DEFINITION_SHA&&publicEpoch(v.publicEpoch)&&v.available===true);return freeze(v);}
const amount=(v,int=false)=>need(typeof v==='string'&&v.length<=192&&(int?/^(?:0|[1-9][0-9]*)$/:/^(?:0|[1-9][0-9]*)(?:\.[0-9]*[1-9])?$/).test(v));
export function frame(raw,status,epoch){
 need([200,409].includes(status)&&publicEpoch(epoch));const v=parse(raw,8192);
 shape(v,['schemaVersion','kind','protocol','definitionHash','publicEpoch','state','currentAgainstPublishedPointer','upstreamLatestInspected','reference']);
 need(v.schemaVersion===1&&v.kind==='overview_window_activity_response'&&v.protocol===PROTOCOL&&v.definitionHash===DEFINITION_SHA&&v.publicEpoch===epoch&&v.upstreamLatestInspected===false&&v.state===(status===200?'current':'retained')&&v.currentAgainstPublishedPointer===(status===200));
 const r=v.reference;shape(r,['schemaVersion','kind','profile','definitionHash','generation','sourceWitnessSha256','derivedBodySha256','source','window','coverage','counterSums','semantics']);
 need(r.schemaVersion===1&&r.kind==='overview_window_activity'&&r.profile==='overview_window_aggregate_v1'&&r.definitionHash===DEFINITION_SHA&&hash(r.generation)&&hash(r.sourceWitnessSha256)&&hash(r.derivedBodySha256));
 const s=r.source;shape(s,['operation','sourceUrl','rawBodySha256','capturedAt','sourceObservedAt','captureTimeKind','sourceGeneratedAt']);
 need(s.operation==='overview'&&s.sourceUrl==='https://maplestory.market/api/market/overview'&&hash(s.rawBodySha256)&&s.sourceObservedAt===null&&s.captureTimeKind==='http_response_completed');clock(s.capturedAt);clock(s.sourceGeneratedAt);need(s.sourceGeneratedAt<=s.capturedAt);
 const w=r.window;shape(w,['windowHours','scannedHours','previousScannedHours','comparable','exactStartAt','exactEndAt']);need(['windowHours','scannedHours','previousScannedHours'].every(k=>integer(w[k],100000))&&typeof w.comparable==='boolean'&&w.exactStartAt===null&&w.exactEndAt===null);
 const c=r.coverage;shape(c,['receivedItemRows','countEligibleItemRows','reportedUnitEligibleItemRows','sourceReportedMesosEligibleItemRows','medianCountProxyEligibleItemRows','medianCountProxyMissingPriceRows']);need(Object.values(c).every(n=>integer(n,20000))&&['countEligibleItemRows','reportedUnitEligibleItemRows','sourceReportedMesosEligibleItemRows'].every(k=>c[k]===c.receivedItemRows)&&c.medianCountProxyEligibleItemRows+c.medianCountProxyMissingPriceRows===c.receivedItemRows);
 const a=r.counterSums;shape(a,Object.keys(SEMANTICS.counterSums));amount(a.sourceRecordedSalesCounterSumLexeme,true);amount(a.sourceReportedUnitCounterSumLexeme,true);amount(a.sourceReportedMesosSumLexeme);need((a.medianCountProxySumLexeme===null)===(c.medianCountProxyEligibleItemRows===0));if(a.medianCountProxySumLexeme!==null)amount(a.medianCountProxySumLexeme);
 shape(r.semantics,Object.keys(SEMANTICS));for(const k of Object.keys(SEMANTICS)){if(k==='counterSums'){shape(r.semantics[k],Object.keys(SEMANTICS[k]));for(const key of Object.keys(SEMANTICS[k]))need(r.semantics[k][key]===SEMANTICS[k][key]);}else need(r.semantics[k]===SEMANTICS[k]);}
 return freeze(v);
}
export async function digest(raw,cryptoImpl=globalThis.crypto){return [...new Uint8Array(await cryptoImpl.subtle.digest('SHA-256',raw))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export function headers(response,expected){
 const h=response.headers,record={hash:h.get(HEADERS.hash),epoch:h.get(HEADERS.epoch),state:h.get(HEADERS.state),capture:h.get(HEADERS.capture),generated:h.get(HEADERS.generated),etag:h.get('ETag')};
 need(record.hash===expected.hash&&record.epoch===expected.publicEpoch&&record.state===expected.state&&record.capture===expected.capture&&record.generated===expected.generated&&record.etag==='"overview-activity-'+expected.hash+'"');
 need(h.get('Cache-Control')==='private, no-store, no-transform'&&h.get('CDN-Cache-Control')==='no-store'&&h.get('Cloudflare-CDN-Cache-Control')==='no-store');return freeze(record);
}
