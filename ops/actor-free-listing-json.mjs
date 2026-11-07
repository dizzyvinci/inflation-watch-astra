// Strict selective JSON parser: ignored value strings (including store/actor
// subtrees) are validated and skipped, never decoded/materialized in the result.
const ENVELOPE=new Set('observedPlanSha256 expectedItemId kind operation sourceUrl httpStatus attemptId grantReference roundReference requestStartedAt capturedAt captureTimeKind sourceObservedAt observationTimestampKnown schemaVerified publicationEligible rawBodyEncoding rawBodyBase64 responseSha256 responseBytes'.split(' '));
const ROW=new Set('snapshot_id slot item_id price quantity per_bundle unit_price sold_out listed_at updated_at'.split(' '));
class Numeric{constructor(token){this.token=token;Object.freeze(this)}}
export const originalNumberToken=v=>v instanceof Numeric?v.token:null;
export function parseListingChannel(bytes,kind){
 if(!(bytes instanceof Uint8Array)||bytes.length<1||bytes.length>(kind==='envelope'?12582912:5000000))throw TypeError('listing_json_bytes');
 if(bytes[0]===239&&bytes[1]===187&&bytes[2]===191)throw TypeError('listing_json_bom');
 let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes)}catch{throw TypeError('listing_json_utf8')}
 let p=0,tokens=0;const fail=()=>{throw TypeError('listing_json_profile')},ws=()=>{while(p<text.length&&' \r\n\t'.includes(text[p]))p++};
 function string(read){if(text[p++]!=='"')fail();const start=p-1;while(p<text.length){const c=text.charCodeAt(p++);if(c===34){if(!read)return;try{return JSON.parse(text.slice(start,p))}catch{fail()}}if(c<32)fail();if(c===92){const e=text[p++];if(e==='u'){for(let i=0;i<4;i++)if(!/[a-fA-F0-9]/.test(text[p++]||'!'))fail()}else if(![34,92,47,98,102,110,114,116].includes(e?.charCodeAt(0)))fail()}}fail();}
 function value(depth,mode){if(depth>64||++tokens>500000)fail();ws();const c=text[p];
  if(c==='"')return string(mode==='capture');
  if(c==='{'){p++;ws();const out=Object.create(null),names=[],seen=new Set();if(text[p]==='}'){p++;if(mode!=='skip')out._sourceFields=names;return mode==='skip'?undefined:out}
   for(;;){ws();if(text[p]!=='"')fail();const k=string(true);if(seen.has(k)||seen.size>=256)fail();seen.add(k);names.push(k);ws();if(text[p++]!==':')fail();let next='skip';if(mode==='envelope'&&ENVELOPE.has(k)||mode==='detail'&&k==='item_id'||mode==='listing'&&ROW.has(k))next='capture';if(mode==='detail'&&k==='listings')next='listings';const v=value(depth+1,next);if(next!=='skip')out[k]=v;ws();if(text[p]==='}'){p++;break}if(text[p++]!==',')fail();}
   if(mode!=='skip')out._sourceFields=names;return mode==='skip'?undefined:out;
  }
  if(c==='['){p++;ws();const a=[],keep=mode==='listings',limit=keep?1000:10000;let n=0;if(text[p]===']'){p++;return mode==='skip'?undefined:a}for(;;){if(++n>limit)fail();const v=value(depth+1,keep?'listing':'skip');if(keep)a.push(v);ws();if(text[p]===']'){p++;break}if(text[p++]!==',')fail()}return mode==='skip'?undefined:a;}
  for(const [s,v]of [['true',true],['false',false],['null',null]])if(text.startsWith(s,p)){p+=s.length;return mode==='capture'?v:undefined}
  const m=/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(text.slice(p));if(!m||m[0].length>256)fail();p+=m[0].length;return mode==='capture'?new Numeric(m[0]):undefined;
 }
 const result=value(0,kind);ws();if(p!==text.length)fail();return result;
}
