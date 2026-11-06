import {buildArchiveTree,POINTER,PREFIX} from '../ops/nx-history-contract.mjs';
export const ON=JSON.stringify({schemaVersion:1,enabled:true,methodVersion:1,publicationEnabled:true});
export const source='https://maplestory.market/ads?tab=services';
export const row=(at,side='buy',rate=10,capturedAt='2026-11-06T01:00:00.000Z')=>({at,side,capturedAt,sourceObservedAt:null,low:rate,p25:rate,median:rate,p75:rate,high:rate,reportedPosterCount:3,statisticsComplete:true,conflict:false});
export async function fixture(rows=[row('2026-10-01T01:00:00Z'),row('2026-10-01T01:00:00Z','sell',15)]){
 let reads=[],hook=null;const tree=await buildArchiveTree(rows),objects=new Map(tree.objects),pointer={schemaVersion:1,kind:'private_nx_history_archive_pointer',generation:1,indexHash:tree.manifest.indexHash,manifestSha256:tree.sha256,manifestBytes:new TextEncoder().encode(tree.text).length,manifestKey:PREFIX+tree.sha256+'.json',receiptWatermarkAt:tree.manifest.receiptWatermarkAt,rowCount:tree.manifest.rowCount};objects.set(pointer.manifestKey,tree.text);objects.set(POINTER,JSON.stringify(pointer));
 const bucket={async get(key){reads.push(key);if(hook)await hook(key);if(!objects.has(key))return null;const text=objects.get(key);return{size:new TextEncoder().encode(text).length,text:async()=>text};}};
 return{bucket,tree,objects,pointer,reads,onGet:fn=>hook=fn,env:{API_PUBLIC_NX_HISTORY_JSON:ON,API_RAW_RECEIPTS:bucket}};
}
export function legacyReport(){
 const smega=[];for(let i=0;i<178;i++)for(const side of ['buy','sell'])smega.push({at:new Date(Date.parse('2026-09-20T00:00:00Z')+i*3600000).toISOString(),side,rate:side==='buy'?8:12,sampleCount:2,capturedAt:'2026-10-02T00:00:00.000Z',sourceUrl:source,aggregation:'source_published_hourly'});
 for(const side of ['buy','sell'])smega.push({at:'2026-11-05T22:00:00.000Z',side,rate:side==='buy'?17:22,sampleCount:4,capturedAt:'2026-11-06T00:00:00.000Z',sourceUrl:source,aggregation:'source_published_hourly'});
 return{smega,smegaSource:{sourceUrl:source,capturedAt:'2026-11-06T00:00:00.000Z'},latest:{nxRate:17.086,cpi:156},sourceUpdatedAt:'2026-11-04T08:30:56Z',offerEvidence:{nativeSummary:{reportedWindowHours:8},derived24:{hours:24}},history:[{cpi:156}]};
}
