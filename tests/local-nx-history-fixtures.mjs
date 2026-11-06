import {buildArchiveTree,manifestForPages} from '../ops/nx-history-contract.mjs';
import {byteHash} from '../ops/api-private-nx-projection.mjs';
const row=(at,side='buy',rate=10,capturedAt='2026-11-06T01:00:00.000Z')=>({at,side,capturedAt,sourceObservedAt:null,low:rate,p25:rate,median:rate,p75:rate,high:rate,reportedPosterCount:3,statisticsComplete:true,conflict:false});
const a=await buildArchiveTree([row('2026-10-01T01:00:00Z'),row('2026-10-01T01:00:00Z','sell',15)]);
const b=await buildArchiveTree([row('2026-10-01T01:00:00Z'),row('2026-10-01T01:00:00Z','sell',15),row('2026-10-08T01:00:00Z','buy',11,'2026-11-06T02:00:00.000Z')]);
const drift=await manifestForPages(a.manifest.pages.map(d=>({...d,bytes:d.bytes+1})));
async function reply(body,generation,capture){return{status:200,headers:{'Content-Type':'application/json; charset=utf-8','ETag':'"nx-history-'+await byteHash(body)+'"','X-Astra-NX-History-Mode':'accepted_cache','X-Astra-NX-History-Generation':generation,'X-Astra-NX-History-Captured-At':capture},body};}
async function serialize(t){return{manifest:t.manifest,replies:{'/api-nx-history.json':await reply(t.text,t.manifest.indexHash,t.manifest.receiptWatermarkAt),...Object.fromEntries(await Promise.all(t.manifest.pages.map(async d=>[d.url+'?generation='+t.manifest.indexHash,await reply(t.objects.get('derived-api-nx-history/v1/'+d.sha256+'.json'),t.manifest.indexHash,d.receiptWatermarkAt)])))}};}
process.stdout.write(JSON.stringify({a:await serialize(a),b:await serialize(b),drift:{manifest:drift,reply:await reply(JSON.stringify(drift),drift.indexHash,drift.receiptWatermarkAt)}}));
