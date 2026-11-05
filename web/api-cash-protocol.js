(()=>{'use strict';
// Pure public29 browser schema, generated from reviewed project protocol; no source transport.
if(window.AstraApiCashProtocol)return;
const metadata={"targets":[{"itemId":1802000,"name":"Red Ribbon","slug":"red-ribbon","fixedNxCost":3200},{"itemId":1802001,"name":"Yellow Hat","slug":"yellow-hat","fixedNxCost":3200},{"itemId":1802002,"name":"Red Hat","slug":"red-hat","fixedNxCost":3200},{"itemId":1802003,"name":"Black Hat","slug":"black-hat","fixedNxCost":3200},{"itemId":1802007,"name":"Red Top Hat","slug":"red-top-hat","fixedNxCost":3200},{"itemId":5000000,"name":"Brown Kitty","slug":"brown-kitty","fixedNxCost":3500},{"itemId":5000001,"name":"Brown Puppy","slug":"brown-puppy","fixedNxCost":3500},{"itemId":5000002,"name":"Pink Bunny","slug":"pink-bunny","fixedNxCost":3500},{"itemId":5000004,"name":"Black Kitty","slug":"black-kitty","fixedNxCost":3500},{"itemId":5000005,"name":"White Bunny","slug":"white-bunny","fixedNxCost":3500},{"itemId":5000007,"name":"Black Pig","slug":"black-pig","fixedNxCost":3500},{"itemId":5050100,"name":"AP Reset Scroll","slug":"ap-reset-scroll","fixedNxCost":7000},{"itemId":5051001,"name":"SP Reset Scroll","slug":"sp-reset-scroll","fixedNxCost":7000},{"itemId":5150000,"name":"Mystery Hair Coupon","slug":"mystery-hair-coupon","fixedNxCost":5500},{"itemId":5150100,"name":"Signature Hair Coupon","slug":"signature-hair-coupon","fixedNxCost":7500},{"itemId":5151000,"name":"Mystery Hair Color Coupon","slug":"mystery-hair-color-coupon","fixedNxCost":1700},{"itemId":5151100,"name":"Signature Hair Color Coupon","slug":"signature-hair-color-coupon","fixedNxCost":4500},{"itemId":5152000,"name":"Mystery Face Coupon","slug":"mystery-face-coupon","fixedNxCost":3500},{"itemId":5152100,"name":"Signature Eye Color Coupon","slug":"signature-eye-color-coupon","fixedNxCost":2500},{"itemId":5152200,"name":"Signature Face Coupon","slug":"signature-face-coupon","fixedNxCost":5500},{"itemId":5153000,"name":"Signature Skin Color Coupon","slug":"signature-skin-color-coupon","fixedNxCost":2000},{"itemId":5170000,"name":"Pet Name Tag","slug":"pet-name-tag","fixedNxCost":1800},{"itemId":5180000,"name":"Water of Life","slug":"water-of-life","fixedNxCost":2000},{"itemId":5190000,"name":"Auto HP Potion Skill","slug":"auto-hp-potion-skill","fixedNxCost":2500},{"itemId":5190001,"name":"Auto MP Potion Skill","slug":"auto-mp-potion-skill","fixedNxCost":2500},{"itemId":5190002,"name":"Auto Move Skill","slug":"auto-move-skill","fixedNxCost":3000},{"itemId":5190003,"name":"Expanded Auto Move Skill","slug":"expanded-auto-move-skill","fixedNxCost":3000},{"itemId":5680000,"name":"Storage Room 5-slot Coupon","slug":"storage-room-5-slot-coupon","fixedNxCost":5000},{"itemId":5680001,"name":"Selective 5-slot Coupon","slug":"selective-5-slot-coupon","fixedNxCost":5000}]};
// Typed, length-prefixed UTF-8 + IEEE754 binary64. No number printing involved.
const HASH_METHOD='mcat-typed-utf8-f64-v1';
const encoder=new TextEncoder();
function utf8(text){
  for(const char of text){const point=char.codePointAt(0);if(point>=0xd800&&point<=0xdfff)throw Error('Unpaired surrogate is not valid UTF-8');}
  return encoder.encode(text);
}
function codepointCompare(a,b){
  const left=Array.from(a),right=Array.from(b);
  for(let i=0;i<Math.min(left.length,right.length);i++){const difference=left[i].codePointAt(0)-right[i].codePointAt(0);if(difference)return difference;}
  return left.length-right.length;
}
function concat(parts){const out=new Uint8Array(parts.reduce((sum,part)=>sum+part.byteLength,0));let offset=0;for(const part of parts){out.set(part,offset);offset+=part.byteLength;}return out;}
function canonicalBytes(value){
  if(value===null)return utf8('z');
  if(typeof value==='boolean')return utf8(value?'t':'f');
  if(typeof value==='number'){
    if(!Number.isFinite(value)||Math.abs(value)>Number.MAX_SAFE_INTEGER)throw Error('Unsupported canonical number');
    const buffer=new ArrayBuffer(8);new DataView(buffer).setFloat64(0,value===0?0:value,false);
    return utf8('n'+[...new Uint8Array(buffer)].map(byte=>byte.toString(16).padStart(2,'0')).join(''));
  }
  if(typeof value==='string'){const bytes=utf8(value);return concat([utf8('s'+bytes.byteLength+':'),bytes]);}
  if(Array.isArray(value)){
    if(Object.keys(value).length!==value.length)throw Error('Sparse arrays are not canonical');
    return concat([utf8('a'+value.length+':'),...value.map(canonicalBytes)]);
  }
  if(value&&typeof value==='object'&&[Object.prototype,null].includes(Object.getPrototypeOf(value))){
    const keys=Object.keys(value).sort(codepointCompare);return concat([utf8('o'+keys.length+':'),...keys.flatMap(key=>[canonicalBytes(key),canonicalBytes(value[key])])]);
  }
  throw Error('Unsupported canonical value');
}
async function portableHash(value){
  const bytes=concat([utf8(HASH_METHOD+'\n'),canonicalBytes(value)]);
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

const targets=new Map(structuredClone(metadata.targets).map(row=>[row.itemId,Object.freeze(row)]));
const HEX=/^[a-f0-9]{64}$/;
const check=(ok,message)=>{if(!ok)throw new TypeError(message);};
const samePointer=(a,b)=>Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(k=>a[k]===b[k]);
const bytes=text=>new TextEncoder().encode(text).length;
const hash=async text=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(n=>n.toString(16).padStart(2,'0')).join('');
const integer=(v,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const clock=v=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const exact=(v,names)=>check(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join('|')===names.split(' ').sort().join('|'),'Unexpected display fields');
const equal=(a,b)=>a&&typeof a==='object'&&!Array.isArray(a)&&Object.keys(a).length===Object.keys(b).length&&Object.keys(b).every(k=>a[k]===b[k]);
const METHOD={price:'Source-reported item sale median',count:'Reported sale count; not physical units',
 quality:'Item-level aggregates can mix equipment qualities',identity:'Bound game item IDs; provider item-name echo not verified',
 use:'Compare fixed-NX items; not an executable exchange quote or the goods-inflation headline',
 clocks:'Retrieval time is known; individual sale timestamps and exact window bounds are not supplied'};
const WINDOW={reportedLookbackDays:3,start:null,end:null,boundsKnown:false};
const ATTRIBUTION={label:'Prices from maplestory.market',url:'https://maplestory.market/?ref=v6kkdvp6'};


async function validatePublicBody(dto){
  exact(dto,'schemaVersion kind sourceUrl privateProjectionHash requestStartedAt capturedAt captureTimeKind sourceObservedAt window coverage records methodology attribution isExecutableQuote changesGoodsIndex changesHeadlineBenchmark subsetHash');
  check(dto.schemaVersion===1&&dto.kind==='fixed_nx_item_api_display_subset'&&dto.sourceUrl==='https://maplestory.market/api/prices'&&HEX.test(dto.privateProjectionHash)&&HEX.test(dto.subsetHash),'Wrong display contract');
  check(clock(dto.requestStartedAt)&&clock(dto.capturedAt)&&dto.requestStartedAt<=dto.capturedAt&&dto.captureTimeKind==='http_response_completed'&&dto.sourceObservedAt===null,'Wrong display clock');
  check(equal(dto.window,WINDOW)&&equal(dto.methodology,METHOD)&&equal(dto.attribution,ATTRIBUTION)&&dto.isExecutableQuote===false&&dto.changesGoodsIndex===false&&dto.changesHeadlineBenchmark===false,'Changed public methodology');
  exact(dto.coverage,'expected available missingOrInvalid');check(Array.isArray(dto.records)&&dto.records.length===29,'Wrong displayed scope');
  const ids=new Set();let available=0;
  for(const row of dto.records){
    exact(row,'itemId name slug fixedNxCost available saleMedianMesos recordedSalesCount mesosPerNx sourceCreditUrl');
    const target=targets.get(row.itemId);check(target&&!ids.has(row.itemId)&&row.name===target.name&&row.slug===target.slug&&row.fixedNxCost===target.fixedNxCost,'Wrong displayed identity');ids.add(row.itemId);
    check(row.sourceCreditUrl===`https://maplestory.market/items/${row.itemId}?ref=v6kkdvp6`,'Wrong display credit');
    if(row.available===true){check(typeof row.saleMedianMesos==='number'&&Number.isFinite(row.saleMedianMesos)&&row.saleMedianMesos>0&&row.saleMedianMesos<=Number.MAX_SAFE_INTEGER&&integer(row.recordedSalesCount,5)&&row.mesosPerNx===row.saleMedianMesos/row.fixedNxCost,'Invalid displayed values');available++;}
    else check(row.available===false&&row.saleMedianMesos===null&&row.recordedSalesCount===null&&row.mesosPerNx===null,'Unknown values became numbers');
  }
  check(dto.coverage.expected===29&&dto.coverage.available===available&&dto.coverage.missingOrInvalid===29-available,'Wrong displayed coverage');
  const {subsetHash,...body}=dto;check(await portableHash(body)===subsetHash,'Display semantic hash mismatch');return dto;
}

const freeze=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;};
function parse(text){
 check(typeof text==='string'&&text.length<=100000,'Bounded JSON required');let i=0,nodes=0;
 const space=()=>{while(/[ \r\n\t]/.test(text[i]||'')&&i<text.length)i++;};
 function string(){const at=i++;while(i<text.length){const c=text[i++];if(c==='"'){const s=JSON.parse(text.slice(at,i));check(s.length<=4096,'String bound');return s;}if(c==='\\')i++;}throw Error('Unterminated string');}
 function value(depth){check(++nodes<=10000&&depth<=16,'JSON complexity');space();const c=text[i];
  if(c==='"')return string();
  if(c==='['){i++;space();const a=[];if(text[i]===']'){i++;return a;}while(true){check(a.length<1000,'Array bound');a.push(value(depth+1));space();if(text[i]===']'){i++;return a;}check(text[i++]===',','Array separator');}}
  if(c==='{'){i++;space();const o=Object.create(null);if(text[i]==='}'){i++;return o;}while(true){space();check(text[i]==='"','Object key');const k=string();check(!Object.hasOwn(o,k),'Duplicate JSON key');check(Object.keys(o).length<64,'Object bound');space();check(text[i++]===':','Object separator');o[k]=value(depth+1);space();if(text[i]==='}'){i++;return o;}check(text[i++]===',','Object separator');}}
  for(const [literal,v]of[['true',true],['false',false],['null',null]])if(text.startsWith(literal,i)){i+=literal.length;return v;}
  const number=/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(text.slice(i));check(number,'JSON value');i+=number[0].length;const n=Number(number[0]);check(Number.isFinite(n)&&Math.abs(n)<=Number.MAX_SAFE_INTEGER,'Numeric bound');return n;
 }
 const result=value(0);space();check(i===text.length,'Trailing JSON data');return result;
}
async function validate(input){const owned=JSON.parse(JSON.stringify(input));await validatePublicBody(owned);return freeze(owned);}
window.AstraApiCashProtocol=Object.freeze({validate,parse,hash:portableHash,targets:freeze(structuredClone(metadata.targets))});
})();
