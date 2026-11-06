// Closed own-data publication metadata. Contains no owner/job/raw receipt keys.
export const INDEX_PREFIX='_private/provider-api/v1/api-index/v1/';
export const INDEX_POINTER=INDEX_PREFIX+'current.json';
export const MAX_PUBLIC_BYTES=600000;
const H=/^[a-f0-9]{64}$/;
const integer=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const clock=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const need=v=>{if(!v)throw TypeError('index_pointer_contract');};
export function validateIndexPointer(v,{definitionHash}={}){
 const keys=['schemaVersion','kind','definitionHash','publicationOrdinal','modelKey','modelSha256','modelBytes','snapshotHash','causeCaptureHash','priceCaptureHash','overviewCaptureHash','calculatedAt','publicKey','publicBodySha256','publicBytes','pricesCapturedAt','overviewCapturedAt','sourceObservedAt','publicationEligible'];
 need(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join('|')===keys.sort().join('|'));
 need(v.schemaVersion===1&&v.kind==='private_api_index_pointer'&&H.test(v.definitionHash)&&(!definitionHash||definitionHash===v.definitionHash)&&integer(v.publicationOrdinal,1,Number.MAX_SAFE_INTEGER));
 for(const k of ['modelSha256','publicBodySha256','snapshotHash','causeCaptureHash'])need(H.test(v[k]));
 for(const k of ['priceCaptureHash','overviewCaptureHash'])need(v[k]===null||H.test(v[k]));
 need(v.modelKey===INDEX_PREFIX+'models/'+v.modelSha256+'.json'&&v.publicKey===INDEX_PREFIX+'public-models/'+v.publicBodySha256+'.json');
 need(integer(v.modelBytes,1,2097152)&&integer(v.publicBytes,1,MAX_PUBLIC_BYTES)&&clock(v.calculatedAt)&&v.sourceObservedAt===null&&v.publicationEligible===false);
 for(const k of ['pricesCapturedAt','overviewCapturedAt'])need(v[k]===null||clock(v[k])&&Date.parse(v[k])<=Date.parse(v.calculatedAt));
 need((v.priceCaptureHash===null)===(v.pricesCapturedAt===null)&&(v.overviewCaptureHash===null)===(v.overviewCapturedAt===null));
 return Object.freeze({...v});
}
