// Strict membership-only view of two retained primary response profiles.
import {parseStrictJson,sha256} from './api-price-item-dto.mjs';
const NUMBER_PROTO=Object.getPrototypeOf(parseStrictJson('0.5')),enc=new TextEncoder();
export class MembershipProfileError extends Error{}
export const check=(ok,code='membership_profile')=>{if(!ok)throw new MembershipProfileError(code);};
export const int=(v,min=0,max=Number.MAX_SAFE_INTEGER)=>{check(Number.isSafeInteger(v)&&v>=min&&v<=max);return v;};
export const shape=(v,keys)=>check(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(','));
export const clock=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
export const hash=async value=>sha256(typeof value==='string'?enc.encode(value):value);
function amount(v,nullable=true){if(v===null&&nullable)return;check(typeof v==='number'?Number.isSafeInteger(v)&&v>=0:v&&Object.getPrototypeOf(v)===NUMBER_PROTO&&typeof v.lexeme==='string'&&!v.lexeme.startsWith('-')&&Number.isFinite(Number(v.lexeme))&&v.lexeme.length<=256);}
export function normalizeMembership(raw,operation,capturedAt){
 check(raw instanceof Uint8Array&&raw.byteLength>0&&raw.byteLength<=5000000&&clock(capturedAt));let document;try{document=parseStrictJson(raw);}catch{throw new MembershipProfileError('invalid_source_json');}let rows,generatedAt=null;
 if(operation==='catalogue')rows=document;
 else{check(operation==='overview');shape(document,['generated_at','window_hours','scanned_hours','previous_scanned_hours','comparable','totals','items','movers','most_sales','best_sellers','top_turnover','most_listed','activity','maintenance','top_sellers']);int(document.generated_at,0,8640000000000);generatedAt=new Date(document.generated_at*1000).toISOString();check(Date.parse(generatedAt)<=Date.parse(capturedAt));for(const k of ['window_hours','scanned_hours','previous_scanned_hours'])int(document[k]);check(typeof document.comparable==='boolean');rows=document.items;}
 check(Array.isArray(rows)&&rows.length<=20000);const ids=new Set();for(const r of rows){if(operation==='catalogue'){shape(r,['item_id','listings','sold_out','total_units','min_unit_price']);for(const k of ['listings','sold_out','total_units'])int(r[k]);amount(r.min_unit_price,false);}else{shape(r,['item_id','cash','sales','units','mesos','median_unit_price','previous_sales','previous_median_unit_price','daily']);check(typeof r.cash==='boolean');for(const k of ['sales','units','previous_sales'])int(r[k]);amount(r.mesos,false);amount(r.median_unit_price);amount(r.previous_median_unit_price);check(Array.isArray(r.daily)&&r.daily.length<=10000);const days=new Set();for(const d of r.daily){shape(d,['day','sales','units','median_unit_price']);int(d.day);check(d.day%86400===0&&!days.has(d.day));days.add(d.day);int(d.sales);int(d.units);amount(d.median_unit_price);}}
  const id=int(r.item_id,1,999999999);check(!ids.has(id));ids.add(id);
 }
 return{ids:[...ids].sort((a,b)=>a-b),sourceGeneratedAt:generatedAt,sourceGeneratedAtKind:generatedAt?'publisher_generation_not_individual_sale_time':null};
}
