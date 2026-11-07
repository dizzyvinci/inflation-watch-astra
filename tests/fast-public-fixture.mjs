import assert from 'node:assert/strict';
import {fixture} from './fast-registration-fixture.mjs';
import {createFastCurrentPublicItemPriceRoute} from '../ops/api-fast-current-public-route.mjs';
const proposal={schemaVersion:1,enabled:true,approvalRecorded:true,mode:'continuous_v2_reprojection',contractSha256:'e0c58417ac4bc4097d7a61d85797002708073a35fac48a7234c0bc646e977893',grantReference:'synthetic-grant',roundReference:'synthetic-r1',publicationEnabled:false};
export async function setup(t,options={}){
 const f=await fixture(t,{fast:false,registrationConfig:proposal,...options});
 const publish=async(body=f.prices(),capturedAt='2026-11-06T12:00:00.000Z')=>{const source=f.seed(body,capturedAt);await f.owner.privateCash.afterProviderEvent(f.owner.recurring.eventFrame());let done=false;
  for(let i=0;i<160;i++){if(f.row("SELECT source_attempt FROM fast_v2_generations WHERE role='current'")?.source_attempt===source.id){done=true;break;}await f.owner.alarm();const c=f.row('SELECT retry_at FROM fast_v2_control');if(c.retry_at>f.now[0])f.now[0]=c.retry_at;}
  assert(done,'actual registered owner must publish exact source before route tests');return source;};
 const scope={grantReference:f.grant.grantReference,roundReference:f.grant.probeRound},metadata=f.sources.map(s=>({sourceUrl:s.sourceUrl,expectedSha256:s.expectedSha256}));
 return{f,publish,scope,metadata,route:opts=>createFastCurrentPublicItemPriceRoute({bucket:f.bucket,scope,metadata,publicEpoch:'fast-public-synthetic-v1',enabled:true,now:()=>f.now[0],...opts}),request:(id,opts={})=>new Request('https://own.example/api-item-prices/'+id+'.json',opts)};
}
