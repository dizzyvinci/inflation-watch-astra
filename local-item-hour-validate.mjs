// Fixed stdin production-contract bridge. No provider, filesystem data or transport.
import{LIMITS,hash,parseBody,validateManifest,validatePage}from'./ops/item-hour-public-contract.mjs';
const need=v=>{if(!v)throw Error('invalid');};
try{
 let packet='';for await(const part of process.stdin){packet+=part;need(Buffer.byteLength(packet)<=700000);}
 const p=JSON.parse(packet);need(['manifest','page'].includes(p.kind));const raw=Buffer.from(p.raw,'base64');need(raw.toString('base64')===p.raw&&raw.length>0&&raw.length<=(p.kind==='manifest'?LIMITS.manifestBytes:LIMITS.pageBytes));
 const sha=await hash(raw);need(p.etag==='"item-hour-'+sha+'"');let value,m;
 if(p.kind==='manifest'){
  value=await validateManifest(parseBody(raw,LIMITS.manifestBytes),1082002);m=value;
  need(m.pages.length<=32&&m.retainedRevisionRows<=2048&&m.pages.reduce((n,d)=>n+d.bytes,raw.length)<=4194304);
  if(p.previous){const old=await validateManifest(p.previous,1082002);need(m.retainedHours>=old.retainedHours&&m.retainedRevisionRows>=old.retainedRevisionRows&&(!old.latestOriginalRetrievedAt||m.latestOriginalRetrievedAt!==null&&m.latestOriginalRetrievedAt>=old.latestOriginalRetrievedAt));}
 }else{
  m=await validateManifest(p.manifest,1082002);const d=m.pages.find(d=>d.sha256===p.pageHash&&d.path===p.pagePath);need(d&&d.bytes===raw.length&&d.sha256===sha);value=validatePage(parseBody(raw,LIMITS.pageBytes),d,m);
 }
 need(p.generation===m.generation&&p.retrievedAt===(m.latestOriginalRetrievedAt??'none')&&Number.isFinite(p.wallNow)&&(!m.latestOriginalRetrievedAt||Date.parse(m.latestOriginalRetrievedAt)<=p.wallNow+300000));
 process.stdout.write(JSON.stringify(value));
}catch{process.stderr.write('local_item_hour_contract_invalid');process.exitCode=2;}
