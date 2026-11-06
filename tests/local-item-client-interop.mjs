import {createItemReferenceClient} from '../ui-src/item-api/item-loader.mjs';
import {createIdentityDiscoveryClient} from '../ui-src/item-api/discovery-client.mjs';
let text='';for await(const x of process.stdin)text+=x;
const rows=JSON.parse(text),calls=[];
const fetcher=async url=>{calls.push(url);const d=url.startsWith('/api-item-prices/')?rows.item:url.startsWith('/api-item-identities/')?rows.page:rows.manifest;return new Response(Buffer.from(d.body,'base64'),{status:d.status,headers:d.headers});};
const item=await createItemReferenceClient({enabled:true,fetcher}).loadItem({itemId:1082000});
const identity=await createIdentityDiscoveryClient({enabled:true,fetcher}).load();
if(item.data.itemId!==1082000||identity.rows.length!==1||identity.rows[0].itemId!==1082000)throw Error('interop');
console.log(JSON.stringify({browserInterop:true,calls:calls.length,originalCapture:item.data.sourceCapturedAt,sourceObservedAt:item.data.sourceObservedAt,statGroups:item.data.item.variants.reportedStats.length}));
