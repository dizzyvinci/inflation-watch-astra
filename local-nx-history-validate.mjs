// Fixed local stdin validator; exact production contract, no network or source data.
import {parseStored,byteHash} from './ops/api-private-nx-projection.mjs';
import {validateManifest,validateWeek,LIMITS} from './ops/nx-history-contract.mjs';
const check=v=>{if(!v)throw Error('invalid');};
try{
 let packet='';for await(const part of process.stdin){packet+=part;check(Buffer.byteLength(packet)<=700000);}
 const p=JSON.parse(packet),raw=Buffer.from(p.raw,'base64');
 check(raw.toString('base64')===p.raw&&raw.length>0&&raw.length<=(p.kind==='manifest'?LIMITS.manifestBytes:LIMITS.pageBytes));
 const text=new TextDecoder('utf-8',{fatal:true}).decode(raw),hash=await byteHash(text);
 check(p.etag==='"nx-history-'+hash+'"');
 let value;
 if(p.kind==='manifest')value=await validateManifest(parseStored(text,LIMITS.manifestBytes));
 else{check(p.kind==='page');const m=await validateManifest(p.manifest),d=m.pages.find(d=>d.sha256===p.pageHash);check(d);value=await validateWeek(text,d,m);}
 const manifest=p.kind==='manifest'?value:p.manifest;
 check(p.generation===manifest.indexHash&&Number.isFinite(p.wallNow)&&Date.parse(manifest.receiptWatermarkAt)<=p.wallNow+300000);
 const capture=p.kind==='manifest'?value.receiptWatermarkAt:manifest.pages.find(d=>d.sha256===p.pageHash).receiptWatermarkAt;
 check(p.capturedAt===capture);
 if(p.kind==='manifest'&&p.previous){
  const old=await validateManifest(p.previous);
  check(value.receiptWatermarkAt>=old.receiptWatermarkAt&&value.rowCount>=old.rowCount&&old.pages.every(d=>value.pages.some(n=>n.weekStartUtc===d.weekStartUtc&&n.rowCount>=d.rowCount)));
 }
 process.stdout.write(JSON.stringify(value));
}catch{process.stderr.write('local_nx_history_contract_invalid');process.exitCode=2;}
