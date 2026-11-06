import {createNxHistoryClient} from '../browser/nx-history-client.mjs';
let input='';for await(const part of process.stdin)input+=part;
const p=JSON.parse(input);let reads=0;
const client=createNxHistoryClient({enabled:true,fetcher:async url=>{
 reads++;const r=p[url];if(!r)throw Error('unprepared_own_path');
 return new Response(Buffer.from(r.body,'base64'),{status:r.status,headers:r.headers});
}});
const m=await client.manifest(),r=await client.loadWeeks({weeks:m.manifest.pages.map(d=>d.weekStartUtc)});
if(reads!==1+m.manifest.pages.length||r.rows.some(r=>r.sourceObservedAt!==null))throw Error('interop');
process.stdout.write(JSON.stringify({ok:true,indexHash:r.indexHash,rows:r.rows.length,capture:m.manifest.receiptWatermarkAt,reads}));
