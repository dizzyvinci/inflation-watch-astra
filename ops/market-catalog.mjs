// Pure daily-provider catalogue projection. No transport or index calculation.
import {HASH_METHOD,portableHash,codepointCompare} from './portable-hash.mjs';
export {HASH_METHOD};
export const SOURCE_URL='https://maplestory-classic.com/market.json';
const SCOPE='public_daily_developer_feed_collection',MIN=5;
const SLUG=/^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const STAMP=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/;
const number=value=>typeof value==='number'&&Number.isFinite(value)&&Math.abs(value)<=Number.MAX_SAFE_INTEGER;
const positive=value=>number(value)&&value>0;
const count=value=>number(value)&&Number.isInteger(value)&&value>=0;
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const pythonWhitespace=point=>point>=9&&point<=13||point>=28&&point<=32||[0x85,0xa0,0x1680,0x2028,0x2029,0x202f,0x205f,0x3000].includes(point)||point>=0x2000&&point<=0x200a;
const text=(value,limit)=>typeof value==='string'&&Array.from(value).some(char=>!pythonWhitespace(char.codePointAt(0)))&&Array.from(value).length<=limit&&Array.from(value).every(char=>char.codePointAt(0)>=32);
const clone=value=>structuredClone(value);
function validDay(value){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const [year,month,day]=value.split('-').map(Number),leap=year%4===0&&(year%100!==0||year%400===0),days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
  return year>=1&&year<=9999&&month>=1&&month<=12&&day>=1&&day<=days[month-1];
}
function stamp(value){
  if(typeof value!=='string')return null;const match=STAMP.exec(value);if(!match||!validDay(value.slice(0,10)))return null;
  const [,year,month,day,hour,minute,second,,zone]=match;
  if(Number(hour)>23||Number(minute)>59||Number(second)>59||zone!=='Z'&&(Number(zone.slice(1,3))>23||Number(zone.slice(4))>59))return null;
  const time=Date.parse(value);return Number.isFinite(time)?time:null;
}
export function sourceSummary(item,sourceUpdatedAt){
  const result={sourceUpdatedAt,window:'unspecified_source_summary',kind:'source_published_summary'};
  for(const [raw,key] of [['p','medianSale'],['p25','p25'],['p75','p75'],['lo','lowSale'],['hi','highSale'],['ask','medianSellerAsk']])result[key]=positive(item[raw])?item[raw]:null;
  for(const [raw,key] of [['asks','listings'],['sellers','sellers']])result[key]=count(item[raw])?(item[raw]===0?0:item[raw]):null;
  result.sellThrough=number(item.st)&&item.st>=0&&item.st<=1?item.st:null;
  result.reportedLastSaleAt=stamp(item.last)!==null?item.last:null;return result;
}
function identities(entries,items){
  if(entries===null||entries===undefined)entries=[];if(!Array.isArray(entries))throw Error('Identity map must be a reviewed list');
  const candidates=new Map(),proofs=new Map(),idSlugs=new Map();let invalid=0;
  for(const entry of entries){
    if(!record(entry)){invalid++;continue;}
    const item=typeof entry.slug==='string'?items.get(entry.slug):null,id=entry.id;
    if(!item||entry.name!==item.n||!count(id)||id<=0||typeof entry.planHash!=='string'||!/^[a-f0-9]{64}$/.test(entry.planHash)){invalid++;continue;}
    if(!candidates.has(entry.slug))candidates.set(entry.slug,new Set());candidates.get(entry.slug).add(id);
    const key=JSON.stringify([entry.slug,id]);if(!proofs.has(key))proofs.set(key,new Set());proofs.get(key).add(entry.planHash);
    if(!idSlugs.has(id))idSlugs.set(id,new Set());idSlugs.get(id).add(entry.slug);
  }
  const accepted=new Map();let ambiguous=0;
  for(const [slug,ids] of candidates){
    if(ids.size!==1||[...ids].some(id=>idSlugs.get(id).size!==1)){ambiguous++;continue;}
    const id=[...ids][0];accepted.set(slug,{id,planHashes:[...proofs.get(JSON.stringify([slug,id]))].sort(codepointCompare)});
  }
  return [accepted,{matchedItems:accepted.size,ambiguousItems:ambiguous,ignoredEntries:invalid}];
}

class PreparedCatalog {
  constructor(feed,identityMap){
    if(!record(feed)||!Array.isArray(feed.items))throw Error('Daily feed item list required');
    const time=stamp(feed.updatedAt);if(time===null)throw Error('Timezone-aware source publication required');
    this.sourceUpdatedAt=feed.updatedAt;const utc=new Date(time),year=utc.getUTCFullYear();if(year<1||year>9999)throw Error('UTC publication outside supported calendar');
    this.sourceDay=utc.toISOString().slice(0,10);this.items=new Map();
    for(const raw of feed.items){
      if(!record(raw)||!text(raw.n,200)||!text(raw.k,120))throw Error('Invalid source name/category');
      const slug=raw.s;if(typeof slug!=='string'||slug.length>200||!SLUG.test(slug)||this.items.has(slug))throw Error('Invalid or duplicate exact slug');
      if(!Array.isArray(raw.h))throw Error('Retained daily history required');
      let previous='';const history=[];
      for(const point of raw.h){
        if(!Array.isArray(point)||point.length!==3)throw Error('Invalid daily point shape');
        const [day,price,quantity]=point;if(!validDay(day)||day<=previous||day>this.sourceDay||!positive(price)||!count(quantity))throw Error('Invalid/unordered/future daily point');
        previous=day;history.push([day,price,quantity===0?0:quantity]);
      }
      this.items.set(slug,{n:raw.n,s:slug,k:raw.k,h:history,summary:sourceSummary(raw,this.sourceUpdatedAt),reportedSales:count(raw.sold)?(raw.sold===0?0:raw.sold):null,sourceLowData:raw.ld===1});
    }
    [this.identity,this.identityCoverage]=identities(identityMap,this.items);
  }
  async initialize(){
    this.sourceProjectionHash=await portableHash({sourceUrl:SOURCE_URL,updatedAt:this.sourceUpdatedAt,items:[...this.items.keys()].sort(codepointCompare).map(key=>this.items.get(key))});
    this.catalogHash=await portableHash({schemaVersion:1,hashMethod:HASH_METHOD,sourceProjectionHash:this.sourceProjectionHash,identities:Object.fromEntries(this.identity),identityCoverage:this.identityCoverage});return this;
  }
  context(kind){return{schemaVersion:1,hashMethod:HASH_METHOD,kind,sourceScope:SCOPE,sourceUrl:SOURCE_URL,sourceUpdatedAt:this.sourceUpdatedAt,sourceUtcDay:this.sourceDay,sourceProjectionHash:this.sourceProjectionHash,catalogHash:this.catalogHash,minimumDailyCount:MIN};}
  brief(item){
    const qualified=item.h.filter(point=>point[2]>=MIN),latest=qualified.at(-1),identity=this.identity.get(item.s);
    return{slug:item.s,name:item.n,category:item.k,canonicalId:identity?.id??null,price:latest?.[1]??null,priceDay:latest?.[0]??null,quantity:latest?.[2]??null,
      publisherMedian:item.summary.medianSale,historyDays:item.h.length,qualifyingDays:qualified.length,thinDays:item.h.filter(point=>point[2]>0&&point[2]<MIN).length,zeroCountDays:item.h.filter(point=>point[2]===0).length,
      carried:!!latest&&latest[0]<this.sourceDay,partial:!!latest&&latest[0]===this.sourceDay};
  }
  buildIndex(){
    const rows=[...this.items.keys()].sort(codepointCompare).map(key=>this.brief(this.items.get(key)));
    return{...this.context('daily_market_search_index'),itemCount:rows.length,identityCoverage:clone(this.identityCoverage),
      coverage:{withQualifiedDailyPrice:rows.filter(row=>row.price!==null).length,withoutQualifiedDailyPrice:rows.filter(row=>row.price===null).length,withPublisherSummaryMedian:rows.filter(row=>row.publisherMedian!==null).length,withRetainedDailyHistory:rows.filter(row=>row.historyDays>0).length},
      priceKinds:{price:'latest_qualified_daily_median',publisherMedian:'unspecified_window_source_summary'},
      coverageNote:'All items in this accepted public daily provider collection, including thin and unqualified records; not every game item or every trade. No MPI membership or weight is assigned.',
      quantityNote:'Provider-recorded daily counts; exact stack/bundle-versus-unit semantics are not independently verified.',rows};
  }
  resolveItem(slug,{expectedProjectionHash=null,expectedCatalogHash=null}={}){
    if(expectedProjectionHash!==null&&expectedProjectionHash!==this.sourceProjectionHash)throw Error('Catalogue source changed; refresh index');
    if(expectedCatalogHash!==null&&expectedCatalogHash!==this.catalogHash)throw Error('Catalogue identity or method changed; refresh index');
    if(typeof slug!=='string'||slug.length>200||!SLUG.test(slug))throw Error('Exact provider slug required');
    const item=this.items.get(slug);if(!item)return null;
    const row=this.brief(item),identity=this.identity.get(slug),history=item.h.map(([day,median,recordedCount])=>({day,median,recordedCount,qualified:recordedCount>=MIN,quality:recordedCount>=MIN?'qualified':recordedCount>0?'thin':'zero_count',partial:day===this.sourceDay}));
    const qualified=history.filter(point=>point.qualified);
    return{...this.context('daily_market_item_detail'),...row,itemSourceUrl:'https://maplestory-classic.com/market/'+slug,
      sourceSummary:clone(item.summary),sourceReportedSales:item.reportedSales,sourceLowData:item.sourceLowData,
      reportedLastSaleKind:'provider_reported_last_sale_unconfirmed_not_individual_trade_evidence',firstObservedDay:history[0]?.day??null,lastHistoryDay:history.at(-1)?.day??null,
      latestDaily:history.length?{...history.at(-1)}:null,currentQualified:qualified.length?{...qualified.at(-1)}:null,historyDatePrecision:'UTC_calendar_day',history,
      identityProvenance:identity?{kind:'reviewed_exact_provider_slug_and_name',planHashes:[...identity.planHashes]}:null,
      limitations:{summaryWindow:'unspecified; summary and daily prices may differ',dailyCounts:'Provider-recorded counts; stack/bundle-versus-unit semantics not independently verified',
        priceDate:'Qualified prices retain their actual earlier day when carried; source publication is not a new sale',partial:'Current source UTC calendar day can be incomplete',
        quality:'Source category only; no stat/upgrade/slot-constant history is established',scope:'Public daily developer-feed collection only; not all game items or individual settled trades',
        metadata:'Unknown fixed NX costs, release dates, stats and trade identities are not inferred'}};
  }
}
export async function createMarketCatalog(feed,identityMap=[]){return new PreparedCatalog(feed,identityMap).initialize();}
export async function buildIndex(feed,identityMap=[]){return(await createMarketCatalog(feed,identityMap)).buildIndex();}
export async function resolveItem(feed,slug,identityMap=[],options={}){return(await createMarketCatalog(feed,identityMap)).resolveItem(slug,options);}
export async function projectionFactory(feed,identityMap=[]){const catalog=await createMarketCatalog(feed,identityMap);return{index:catalog.buildIndex(),resolve:(slug,hash)=>catalog.resolveItem(slug,{expectedCatalogHash:hash})};}

// One immutable reviewed proof map per deployment. Catalogue HTTP reads and
// scheduled report publication can reuse exactly the same preparation promise.
export function createCachedProjectionFactory(identityMap=[],{maximumEntries=2,prepare=createMarketCatalog}={}){
  if(!Number.isInteger(maximumEntries)||maximumEntries<1||maximumEntries>2||typeof prepare!=='function')throw Error('Invalid bounded catalogue cache');
  const approved=clone(identityMap),entries=new Map();
  const identityVersion=portableHash({hashMethod:HASH_METHOD,identityMap:approved});
  async function get(feed){
    const snapshot=clone(feed),bytes=new TextEncoder().encode(JSON.stringify(snapshot));
    const key=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(value=>value.toString(16).padStart(2,'0')).join('');
    if(!entries.has(key)){
      const task=Promise.resolve().then(()=>prepare(snapshot,clone(approved))).catch(error=>{if(entries.get(key)===task)entries.delete(key);throw error;});
      entries.set(key,task);while(entries.size>maximumEntries)entries.delete(entries.keys().next().value);
    }
    return entries.get(key);
  }
  const factory=async feed=>{const catalog=await get(feed);return{index:catalog.buildIndex(),resolve:(slug,hash)=>catalog.resolveItem(slug,{expectedCatalogHash:hash})};};
  factory.identityVersion=identityVersion;
  factory.metadata=async feed=>{
    const catalog=await get(feed);
    return{schemaVersion:1,hashMethod:HASH_METHOD,catalogHash:catalog.catalogHash,sourceProjectionHash:catalog.sourceProjectionHash,
      sourceUpdatedAt:catalog.sourceUpdatedAt,itemCount:catalog.items.size,identityVersion:await identityVersion};
  };
  return factory;
}
