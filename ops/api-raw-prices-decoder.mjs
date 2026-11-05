// WORK-only private raw decoder/29-item bridge. No fetch, credentials or persistence.
import {project} from './api-cash-projection.mjs';
const MAX=BigInt(Number.MAX_SAFE_INTEGER),VALIDATED=Symbol('private_validated_prices');
const fail=(ok,message)=>{if(!ok)throw new TypeError(message);};
const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);

// Keep original number tokens: JSON.parse alone loses unsafe integer identity.
class JsonNumber{
  constructor(token){this.token=token;Object.freeze(this);}
}
function decimalParts(value){
  fail(value instanceof JsonNumber,'Expected original numeric token');
  const negative=value.token.startsWith('-'),unsigned=negative?value.token.slice(1):value.token;
  const [mantissa,exponent='0']=unsigned.toLowerCase().split('e');
  const dot=mantissa.indexOf('.'),fraction=dot<0?0:mantissa.length-dot-1;
  let digits=mantissa.replace('.','').replace(/^0+/,'');
  let power=BigInt(exponent)-BigInt(fraction);
  if(!digits)return{negative:false,digits:'',power:0n};
  const trailing=/0+$/.exec(digits)?.[0].length??0;
  if(trailing){digits=digits.slice(0,-trailing);power+=BigInt(trailing);}
  return{negative,digits,power};
}
function positiveDecimal(value,path){const part=decimalParts(value);fail(!part.negative&&part.digits.length>0,path);}
function comparePositive(a,b){
  const x=decimalParts(a),y=decimalParts(b),left=BigInt(x.digits.length)+x.power,right=BigInt(y.digits.length)+y.power;
  if(left!==right)return left<right?-1:1;
  const size=Math.max(x.digits.length,y.digits.length),xs=x.digits.padEnd(size,'0'),ys=y.digits.padEnd(size,'0');
  return xs===ys?0:xs<ys?-1:1;
}
function integer(value,path,minimum=0n){
  fail(value instanceof JsonNumber&&!/[.eE]/.test(value.token),path);
  const n=BigInt(value.token);fail(n>=minimum&&n>=-MAX&&n<=MAX,path);return Number(n);
}
function keys(value,required,optional,path){
  fail(value&&typeof value==='object'&&!Array.isArray(value)&&!(value instanceof JsonNumber),path+'.object_required');
  fail(required.every(key=>own(value,key)),path+'.required_fields');
  fail(Object.keys(value).every(key=>required.includes(key)||optional.includes(key)),path+'.unknown_fields_quarantine');
}

export function parseStrictJson(text){
  fail(typeof text==='string'&&text.length<=5_000_000,'Bounded UTF8 JSON text required');let i=0,nodes=0;
  const white=()=>{while(i<text.length&&[' ','\n','\r','\t'].includes(text[i]))i++;};
  function string(){
    const start=i++;while(i<text.length){
      const char=text[i++];
      if(char==='"'){
        const value=JSON.parse(text.slice(start,i));fail(value.length<=4096,'JSON string too long');return value;
      }
      if(char==='\\')i++;
    }throw new TypeError('Unterminated JSON string');
  }
  function numeric(){
    const start=i;if(text[i]==='-')i++;
    if(text[i]==='0')i++;
    else{fail(text[i]>='1'&&text[i]<='9','Invalid JSON number');while(text[i]>='0'&&text[i]<='9')i++;}
    if(text[i]==='.'){
      i++;const digits=i;while(text[i]>='0'&&text[i]<='9')i++;fail(i>digits,'Missing fractional digits');
    }
    if(text[i]==='e'||text[i]==='E'){
      i++;if(text[i]==='+'||text[i]==='-')i++;const digits=i;
      while(text[i]>='0'&&text[i]<='9')i++;fail(i>digits,'Missing exponent digits');
    }
    fail(i-start<=4096,'JSON number token too long');return new JsonNumber(text.slice(start,i));
  }
  function value(depth){
    fail(++nodes<=1_000_000&&depth<=64,'JSON complexity bound');white();const char=text[i];
    if(char==='"')return string();
    if(char==='-'||(char>='0'&&char<='9'))return numeric();
    for(const [token,literal]of[['true',true],['false',false],['null',null]])if(text.startsWith(token,i)){i+=token.length;return literal;}
    if(char==='['){
      i++;white();const out=[];if(text[i]===']'){i++;return Object.freeze(out);}
      while(true){fail(out.length<10000,'JSON array bound');out.push(value(depth+1));white();
        if(text[i]===']'){i++;return Object.freeze(out);}fail(text[i++]===',','Expected array comma');}
    }
    if(char==='{'){
      i++;white();const out=Object.create(null);let count=0;if(text[i]==='}'){i++;return Object.freeze(out);}
      while(true){white();fail(text[i]==='"','Expected object key');const key=string();
        fail(!own(out,key),'Duplicate JSON key');fail(++count<=64,'JSON object bound');
        white();fail(text[i++]===':','Expected object colon');out[key]=value(depth+1);white();
        if(text[i]==='}'){i++;return Object.freeze(out);}fail(text[i++]===',','Expected object comma');}
    }
    throw new TypeError('Invalid JSON token');
  }
  const result=value(0);white();fail(i===text.length,'Trailing JSON data');return result;
}

function reference(value,scopes,path){
  if(value===null)return;keys(value,['unit_price','basis','samples','scope'],[],path);
  positiveDecimal(value.unit_price,path+'.unit_price');integer(value.samples,path+'.samples',1n);
  fail(['sold','listed'].includes(value.basis),path+'.unknown_basis');fail(scopes.includes(value.scope),path+'.unknown_scope');
}
function sold(value,path){
  if(value===null)return;keys(value,['sales','units','avg_unit_price','median_unit_price','day_sales','day_units'],[],path);
  for(const key of ['sales','units'])integer(value[key],path+'.'+key,1n);
  for(const key of ['day_sales','day_units'])integer(value[key],path+'.'+key);
  for(const key of ['avg_unit_price','median_unit_price'])positiveDecimal(value[key],path+'.'+key);
}
function seen(value,path){
  if(value===null)return;keys(value,['listings','sellers','median_unit_price','p25_unit_price','p75_unit_price'],[],path);
  for(const key of ['listings','sellers'])integer(value[key],path+'.'+key,1n);
  for(const key of ['median_unit_price','p25_unit_price','p75_unit_price'])positiveDecimal(value[key],path+'.'+key);
  fail(comparePositive(value.p25_unit_price,value.median_unit_price)<=0&&comparePositive(value.median_unit_price,value.p75_unit_price)<=0,path+'.quantile_order');
}
export function validatePricesRows(rows){
  fail(Array.isArray(rows)&&rows.length>0&&rows.length<=10000,'Top-level bounded array required');const ids=new Set();
  for(const row of rows){
    keys(row,['item_id','sold','seen','reference'],['by_scrolls','by_stats','by_attack','typical_attack','deal'],'row');
    const id=integer(row.item_id,'row.item_id',1n);fail(!ids.has(id),'Duplicate item ID');ids.add(id);
    sold(row.sold,'row.sold');seen(row.seen,'row.seen');reference(row.reference,['item'],'row.reference');
    if(own(row,'deal'))reference(row.deal,['item'],'row.deal');
    if(own(row,'typical_attack'))integer(row.typical_attack,'row.typical_attack');
    for(const branch of ['by_scrolls','by_stats','by_attack']){
      if(!own(row,branch))continue;fail(Array.isArray(row[branch])&&row[branch].length<=10000,branch+'.array_required');
      for(const variant of row[branch]){
        let scopes;
        if(branch==='by_attack'){
          keys(variant,['attack','reference','seen','sold'],['deal'],branch);integer(variant.attack,branch+'.attack');
          sold(variant.sold,branch+'.sold');seen(variant.seen,branch+'.seen');scopes=['attack','near'];
        }else{
          keys(variant,['upgrades','slots_left','reference',...(branch==='by_stats'?['stats']:[])],branch==='by_scrolls'?['deal']:[],branch);
          for(const key of ['upgrades','slots_left'])integer(variant[key],branch+'.'+key);
          if(branch==='by_stats'){
            fail(variant.stats&&typeof variant.stats==='object'&&!Array.isArray(variant.stats)&&!(variant.stats instanceof JsonNumber),branch+'.stats.object_required');
            for(const [code,number]of Object.entries(variant.stats)){fail(/^(?:0|[1-9][0-9]*)$/.test(code),branch+'.numeric_stat_code_required');integer(number,branch+'.stats.value',-MAX);}
          }scopes=branch==='by_stats'?['stats']:['scrolls'];
        }
        reference(variant.reference,scopes,branch+'.reference');if(own(variant,'deal'))reference(variant.deal,scopes,branch+'.deal');
      }
    }
  }return rows;
}
function base64Bytes(encoded){
  fail(typeof encoded==='string'&&encoded.length>0&&encoded.length<=6_666_668&&encoded.length%4===0,'Bounded base64 required');
  const padding=encoded.endsWith('==')?2:encoded.endsWith('=')?1:0,alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  for(let i=0;i<encoded.length-padding;i++)fail(alphabet.includes(encoded[i]),'Invalid base64 character');
  if(padding)fail((alphabet.indexOf(encoded[encoded.length-padding-1])&(padding===2?15:3))===0,'Noncanonical base64 tail');
  const binary=atob(encoded),out=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)out[i]=binary.charCodeAt(i);return out;
}
const sha=async raw=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',raw))].map(b=>b.toString(16).padStart(2,'0')).join('');
const freezeTree=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freezeTree(child);Object.freeze(value);}return value;};
function snapshotBindings(inputs){
  const fields=['schemaVersion','kind','sourceUrl','rawResponseSha256','rawResponseBytes','requestStartedAt','capturedAt','sourceObservedAt','priceField','weightField','candidatePlanHash','fixedNxScheduleSha256','targets','sourceRows','routeEvidence'];
  fail(inputs&&Object.keys(inputs).length===fields.length&&Object.keys(inputs).every(key=>fields.includes(key)),'Unreviewed binding fields');
  // Ignore the stale parsed/derived sourceRows entirely; only the raw decoder may
  // provide the live median/count rows. Own compact proof metadata before await.
  return freezeTree(structuredClone({...inputs,sourceRows:[]}));
}

export async function decodePricesReceipt(envelope){
  // Copy only the required primitive receipt fields synchronously. Never clone
  // or trust envelope.payload, and never read caller metadata after hashing.
  envelope=Object.freeze(Object.fromEntries(['operation','httpStatus','sourceUrl','rawBodyEncoding','responseBytes','responseSha256','rawBodyBase64','requestStartedAt','capturedAt'].map(key=>[key,envelope?.[key]])));
  fail(envelope&&envelope.operation==='prices'&&envelope.httpStatus===200&&envelope.sourceUrl==='https://maplestory.market/api/prices','Wrong receipt source/operation/status');
  fail(envelope.rawBodyEncoding==='base64'&&Number.isSafeInteger(envelope.responseBytes)&&envelope.responseBytes>0&&envelope.responseBytes<=5_000_000,'Original bounded raw bytes required');
  fail(typeof envelope.responseSha256==='string'&&/^[a-f0-9]{64}$/.test(envelope.responseSha256),'Raw SHA256 required');
  const rawBytes=base64Bytes(envelope.rawBodyBase64);fail(rawBytes.length===envelope.responseBytes,'Raw byte length mismatch');
  fail(await sha(rawBytes)===envelope.responseSha256,'Raw SHA256 mismatch');
  fail(!(rawBytes[0]===0xef&&rawBytes[1]===0xbb&&rawBytes[2]===0xbf),'Unexpected UTF8 BOM');
  const text=new TextDecoder('utf-8',{fatal:true}).decode(rawBytes),rows=validatePricesRows(parseStrictJson(text));
  return Object.freeze({[VALIDATED]:true,rows,rawBytes,sourceUrl:envelope.sourceUrl,rawResponseSha256:envelope.responseSha256,
    rawResponseBytes:rawBytes.length,requestStartedAt:envelope.requestStartedAt,capturedAt:envelope.capturedAt});
}
export async function projectDecodedReceipt(decoded,bindingInputs,publicLinkCode='v6kkdvp6'){
  fail(decoded?.[VALIDATED]===true,'Strict raw validation required');
  const byId=new Map(decoded.rows.map(row=>[integer(row.item_id,'row.item_id',1n),row]));
  const sourceRows=bindingInputs.targets.map(target=>{
    const row=byId.get(target.itemId),sale=row?.sold;
    return{itemId:target.itemId,saleMedianMesos:sale?Number(sale.median_unit_price.token):null,
      recordedSales:sale?integer(sale.sales,'sold.sales',1n):null};
  });
  return project({...bindingInputs,sourceUrl:decoded.sourceUrl,rawResponseSha256:decoded.rawResponseSha256,
    rawResponseBytes:decoded.rawResponseBytes,requestStartedAt:decoded.requestStartedAt,capturedAt:decoded.capturedAt,
    sourceObservedAt:null,sourceRows},publicLinkCode);
}
export async function projectReceipt(envelope,bindingInputs,publicLinkCode='v6kkdvp6'){
  bindingInputs=snapshotBindings(bindingInputs);
  return projectDecodedReceipt(await decodePricesReceipt(envelope),bindingInputs,publicLinkCode);
}
