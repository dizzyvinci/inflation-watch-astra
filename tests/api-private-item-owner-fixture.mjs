import {fixture as baseFixture,rawReceipt,PRIVATE_FLAG,PUBLIC_FLAG} from './api-public-cash-fixture.mjs';
export const ITEMS_FLAG={schemaVersion:1,enabled:true,methodVersion:1,publicationEnabled:false};
export async function itemFixture(t,{items=ITEMS_FLAG,cash=false,nx=false,r2=false,schedule={enabled:false}}={}){
 const f=await baseFixture(t,{privateFlag:cash?PRIVATE_FLAG:{enabled:false},publicFlag:cash?PUBLIC_FLAG:null,nxFlag:nx?PRIVATE_FLAG:{enabled:false},schedule});
 if(items!==null)f.env.API_PRIVATE_ITEMS_JSON=JSON.stringify(items);if(r2)f.env.API_PRIVATE_NX_R2_JSON=JSON.stringify(PRIVATE_FLAG);
 const restart=f.restart;f.restart=async()=>{const original=Date.now;Date.now=()=>f.now[0];try{await restart();}finally{Date.now=original;}};await f.restart();
 f.seedItem=(attempt=1)=>{const r=rawReceipt(attempt),e=JSON.parse(r.body),config=f.core.config();e.grantReference=config.grantReference;e.roundReference=config.probeRound;r.body=JSON.stringify(e);f.seed(r);f.core.sql.exec('INSERT INTO api_attempts(id,job_key,at,result,grant_ref) VALUES(?,?,?,?,?)',attempt,'stored:'+r.key,Date.parse(e.requestStartedAt),'success',config.grantReference);return r;};
 f.itemPointer=()=>{const p=f.objects.get('_private/provider-api/v1/item-projections/v1/current.json');return p?JSON.parse(p.body):null;};
 f.finishItems=async(limit=30)=>{const events=[];for(let n=0;n<limit;n++){const at=await f.alarm();if(at===null)break;const calls=f.calls.length,puts=f.puts.length,e=await f.fire();if(e.eventKind==='private_items'){if(f.calls.length!==calls)throw Error('Private items event called provider');if(f.puts.length-puts>1)throw Error('Private items event wrote more than one object');}events.push(e);}return events;};return f;
}
