// Synthetic closed whole-item history only; no retained/provider body.
import {sample,storage,hour,record,HOUR} from './api-public-item-hour-source-fixture.mjs';
import {curateItemHours} from '../ops/item-hour-curation.mjs';
export const ID=1082002,PATH='/api-item-history/'+ID+'/manifest.json';
export const flag=generation=>JSON.stringify({schemaVersion:1,enabled:true,itemId:ID,methodVersion:1,publicationEnabled:true,generation});
export async function fixture({pages=1}={}){const tree=pages===1?await sample(ID):await curateItemHours({itemId:ID,records:await Promise.all(Array.from({length:pages},(_,i)=>record(hour(HOUR-(pages-i)*7*86400),{id:ID,attempt:i+1,at:'2026-11-04T02:00:00.000Z'})))}),store=storage(tree);return{...store,tree,env:{API_PUBLIC_ITEM_HOUR_HISTORY_JSON:flag(tree.manifest.generation),API_RAW_RECEIPTS:store.bucket},page:n=>tree.manifest.pages[n].path+'?generation='+tree.manifest.generation};}
export const request=(path=PATH,init)=>new Request('https://inflation.gg'+path,init);
export const pause=()=>{let enter,release;const entered=new Promise(r=>enter=r),held=new Promise(r=>release=r);return{entered,held,enter,release};};
export const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export {sample,storage,hour,record,HOUR,curateItemHours};
