// Bounded immutable own-R2 envelope reader. Only typed contract errors bypass retry.
import {ItemHistoryContractError} from './api-item-hour-history-profile.mjs';
export const MAX_HISTORY_ENVELOPE_BYTES=16000000;
const need=(v,code)=>{if(!v)throw new ItemHistoryContractError(code);};
export async function historyEnvelopeText(object){
 need(object&&Number.isSafeInteger(object.size)&&object.size>0&&object.size<=MAX_HISTORY_ENVELOPE_BYTES,'history_envelope_size');
 if(object.body?.getReader){const reader=object.body.getReader(),chunks=[];let n=0;try{for(;;){const p=await reader.read();if(p.done)break;need(p.value instanceof Uint8Array,'history_envelope_chunk');n+=p.value.length;need(n<=MAX_HISTORY_ENVELOPE_BYTES,'history_envelope_stream_bound');chunks.push(p.value);}}catch(error){try{await reader.cancel();}catch{}throw error;}finally{reader.releaseLock();}need(n===object.size,'history_envelope_actual_size');const bytes=new Uint8Array(n);let at=0;for(const p of chunks){bytes.set(p,at);at+=p.length;}try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw new ItemHistoryContractError('history_envelope_utf8');}}
 const text=await object.text();need(typeof text==='string'&&new TextEncoder().encode(text).length===object.size&&object.size<=MAX_HISTORY_ENVELOPE_BYTES,'history_envelope_actual_size');return text;
}
export function parseHistoryEnvelope(text){
 need(typeof text==='string'&&new TextEncoder().encode(text).length<=MAX_HISTORY_ENVELOPE_BYTES,'history_envelope_bound');let i=0,nodes=0;const space=()=>{while(i<text.length&&/[ \t\n\r]/.test(text[i]))i++;};
 function value(depth,key=''){need(++nodes<=1000000&&depth<=64,'history_envelope_complexity');space();const c=text[i];
  if(c==='"'){const start=i++;while(i<text.length){const ch=text[i++];if(ch==='\\'){i++;continue;}if(ch==='"'){let s;try{s=JSON.parse(text.slice(start,i));}catch{need(false,'history_envelope_string');}need(s.length<=(depth===1&&key==='rawBodyBase64'?6666668:4096),'history_envelope_string_bound');return s;}}need(false,'history_envelope_string');}
  if(c==='{'){i++;space();const out=Object.create(null);if(text[i]==='}'){i++;return out;}let count=0;for(;;){space();need(text[i]==='"','history_envelope_key');const k=value(depth+1);need(!Object.hasOwn(out,k)&&++count<=64,'history_envelope_duplicate_key');space();need(text[i++]===':','history_envelope_colon');out[k]=value(depth+1,k);space();if(text[i]==='}'){i++;return out;}need(text[i++]===',','history_envelope_separator');}}
  if(c==='['){i++;space();const out=[];if(text[i]===']'){i++;return out;}for(;;){need(out.length<10000,'history_envelope_array');out.push(value(depth+1));space();if(text[i]===']'){i++;return out;}need(text[i++]===',','history_envelope_separator');}}
  for(const[literal,v]of [['true',true],['false',false],['null',null]])if(text.startsWith(literal,i)){i+=literal.length;return v;}
  const m=/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(text.slice(i));need(m&&m[0].length<=4096,'history_envelope_number');i+=m[0].length;return /[.eE]/.test(m[0])||!Number.isSafeInteger(Number(m[0]))?Object.freeze({untrustedNumericLexeme:m[0]}):Number(m[0]);
 }
 const out=value(0);space();need(i===text.length,'history_envelope_trailing');return out;
}
