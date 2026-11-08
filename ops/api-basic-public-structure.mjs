// Browser-only scalar subset. Exact private-contract checks, no producer imports.
export const B=Object.freeze({totalBytes:8388608});
export const enc=new TextEncoder(),need=(v,c='basic_contract_hold')=>{if(!v)throw Error(c);};
export const integer=(n,a=0,b=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(n)&&n>=a&&n<=b;
export function exact(v,keys){need(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join('|')===keys.slice().sort().join('|'),'basic_shape');}
export const hash=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
export function iso(s){need(typeof s==='string'&&s.length===24&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString()===s,'basic_clock');return s;}
