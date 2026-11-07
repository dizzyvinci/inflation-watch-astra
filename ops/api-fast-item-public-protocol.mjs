// Public ordering/coherence only. No secret, signature, source or trade authority.
import {sha256,parseStrictJson} from './api-price-item-dto.mjs';
const enc=new TextEncoder(),H=/^[a-f0-9]{64}$/;
export const FAST_ITEM_PROTOCOL='fast-current-v1';
export const FAST_ITEM_HEADERS=Object.freeze({protocol:'X-Astra-API-Item-Protocol',epoch:'X-Astra-API-Item-Epoch',revision:'X-Astra-API-Item-Publication',binding:'X-Astra-API-Item-Binding'});
const need=v=>{if(!v)throw TypeError('Invalid FAST item ordering');};
export const validPublicEpoch=v=>typeof v==='string'&&/^[a-z][a-z0-9-]{0,63}$/.test(v);
const iso=v=>typeof v==='string'&&v.length===24&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
function fields(v,now){need(v&&validPublicEpoch(v.epoch)&&Number.isSafeInteger(v.revision)&&v.revision>0&&H.test(v.generation)&&iso(v.capturedAt)&&Date.parse(v.capturedAt)<=now&&H.test(v.bodySha256));}
const tuple=v=>enc.encode(JSON.stringify([FAST_ITEM_PROTOCOL,v.epoch,String(v.revision),v.generation,v.capturedAt,v.bodySha256]));
export function hasFastItemHeaders(headers){return Object.values(FAST_ITEM_HEADERS).some(k=>headers.has(k));}
export async function makeFastItemHeaders(v,{now=Date.now()}={}){fields(v,now);return{[FAST_ITEM_HEADERS.protocol]:FAST_ITEM_PROTOCOL,[FAST_ITEM_HEADERS.epoch]:v.epoch,[FAST_ITEM_HEADERS.revision]:String(v.revision),[FAST_ITEM_HEADERS.binding]:await sha256(tuple(v))};}
export async function validateFastItemHeaders(headers,{generation,capturedAt,bodySha256,now=Date.now()}={}){
 need(headers.get(FAST_ITEM_HEADERS.protocol)===FAST_ITEM_PROTOCOL);const raw=headers.get(FAST_ITEM_HEADERS.revision);need(typeof raw==='string'&&/^[1-9][0-9]{0,15}$/.test(raw));const v={epoch:headers.get(FAST_ITEM_HEADERS.epoch),revision:Number(raw),generation,capturedAt,bodySha256};fields(v,now);need(String(v.revision)===raw&&headers.get(FAST_ITEM_HEADERS.binding)===await sha256(tuple(v)));return Object.freeze(v);
}
export function makeFastItemError(kind,{itemId,generation,capturedAt}){need(['membership_absent','generation_changed'].includes(kind)&&Number.isSafeInteger(itemId)&&itemId>0&&itemId<=999999999&&H.test(generation)&&iso(capturedAt));return enc.encode(JSON.stringify({schemaVersion:1,kind:'fast_item_'+kind,itemId,generation,sourceCapturedAt:capturedAt,sourceObservedAt:null}));}
export function parseFastItemError(raw,{kind,itemId,generation,capturedAt}){need(raw instanceof Uint8Array&&raw.length>0&&raw.length<=4096);const v=parseStrictJson(raw);need(v&&Object.keys(v).sort().join('|')==='generation|itemId|kind|schemaVersion|sourceCapturedAt|sourceObservedAt'&&v.schemaVersion===1&&v.kind==='fast_item_'+kind&&v.itemId===itemId&&v.generation===generation&&v.sourceCapturedAt===capturedAt&&v.sourceObservedAt===null);return v;}
