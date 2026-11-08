// Public contract reuse only. No owner, SQL, provider, network or credential imports.
import{pathToFileURL}from'node:url';import{resolve}from'node:path';import{webcrypto}from'node:crypto';
import{parse,profile,frame,headers,digest,PROFILE_PATH,CURRENT_PATH,publicEpoch}from'./ui-src/overview-activity/contract.mjs';
const need=v=>{if(!v)throw Error('local_overview_contract_invalid');};
const exact=(v,k)=>need(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===k.length&&k.every(n=>Object.hasOwn(v,n)));
function decoded(text,n,max){need(typeof text==='string'&&Number.isSafeInteger(n)&&n>=0&&n<=max&&text.length<=4*Math.ceil(max/3));const raw=Buffer.from(text,'base64');need(raw.length===n&&raw.toString('base64')===text);return new Uint8Array(raw);}
export async function validateLocalOverview(packet){
 exact(packet,['schemaVersion','path','status','headers','condition','publicEpoch','raw','rawBytes','prior','priorBytes']);
 need(packet.schemaVersion===1&&[PROFILE_PATH,CURRENT_PATH].includes(packet.path)&&Number.isSafeInteger(packet.status)&&publicEpoch(packet.publicEpoch));
 const isProfile=packet.path===PROFILE_PATH;need(isProfile?packet.status===200:[200,304,409].includes(packet.status));
 need(packet.condition===null||!isProfile&&typeof packet.condition==='string'&&/^"overview-activity-[a-f0-9]{64}"$/.test(packet.condition));
 need(packet.headers&&typeof packet.headers==='object'&&!Array.isArray(packet.headers)&&Object.keys(packet.headers).length<=32);let total=0;
 for(const[k,v]of Object.entries(packet.headers)){need(typeof k==='string'&&k.length<=128&&typeof v==='string'&&v.length<=1024&&!/[\r\n]/.test(k+v));total+=new TextEncoder().encode(k+v).length;need(total<=16384);}
 const h=new Headers(packet.headers);need(h.get('X-Astra-Preview')==='password'&&(h.get('Content-Encoding')??'identity')==='identity');
 need(h.get('Cache-Control')==='private, no-store, no-transform'&&h.get('CDN-Cache-Control')==='no-store'&&h.get('Cloudflare-CDN-Cache-Control')==='no-store');
 const raw=decoded(packet.raw,packet.rawBytes,isProfile?512:8192),prior=decoded(packet.prior,packet.priorBytes,8192);
 const declared=h.get('Content-Length');need(declared===null||/^[0-9]{1,5}$/.test(declared)&&(packet.status===304||Number(declared)===raw.length));
 if(packet.status!==304)need(/^application\/json(?:;|$)/i.test(h.get('Content-Type')??''));
 if(isProfile){need(prior.length===0&&packet.condition===null);need(profile(raw).publicEpoch===packet.publicEpoch);return true;}
 let value,body;
 if(packet.status===304){need(raw.length===0&&prior.length>0&&packet.condition===h.get('ETag'));value=frame(prior,200,packet.publicEpoch);body=prior;}
 else{need(prior.length===0);value=frame(raw,packet.status,packet.publicEpoch);body=raw;}
 const bodyHash=await digest(body,webcrypto),s=value.reference.source;
 headers({headers:h},{hash:bodyHash,publicEpoch:packet.publicEpoch,state:value.state,capture:s.capturedAt,generated:s.sourceGeneratedAt});
 return true;
}
const direct=process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url;
if(direct){
 if(process.argv.slice(2).join('|')!=='--validate')process.stdout.write('{"status":"default_off"}');
 else try{const store=Buffer.alloc(32768);let n=0;for await(const part of process.stdin){need(n+part.length<=store.length);part.copy(store,n);n+=part.length;}need(n>0);await validateLocalOverview(parse(new Uint8Array(store.subarray(0,n)),32768));process.stdout.write('{"valid":true}');}
 catch{process.stderr.write('local_overview_contract_invalid');process.exitCode=2;}
}
