// Typed, length-prefixed UTF-8 + IEEE754 binary64. No number printing involved.
export const HASH_METHOD='mcat-typed-utf8-f64-v1';
const encoder=new TextEncoder();
function utf8(text){
  for(const char of text){const point=char.codePointAt(0);if(point>=0xd800&&point<=0xdfff)throw Error('Unpaired surrogate is not valid UTF-8');}
  return encoder.encode(text);
}
export function codepointCompare(a,b){
  const left=Array.from(a),right=Array.from(b);
  for(let i=0;i<Math.min(left.length,right.length);i++){const difference=left[i].codePointAt(0)-right[i].codePointAt(0);if(difference)return difference;}
  return left.length-right.length;
}
function concat(parts){const out=new Uint8Array(parts.reduce((sum,part)=>sum+part.byteLength,0));let offset=0;for(const part of parts){out.set(part,offset);offset+=part.byteLength;}return out;}
export function canonicalBytes(value){
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
export async function portableHash(value){
  const bytes=concat([utf8(HASH_METHOD+'\n'),canonicalBytes(value)]);
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}
