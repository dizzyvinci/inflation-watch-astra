// WORK-ONLY pure portable profile. No imports, network, filesystem or publication.
const MAX_BYTES=5_000_000,HASH=/^[0-9a-f]{64}$/;
const own=(v,k)=>Object.prototype.hasOwnProperty.call(v,k);
const STAT_NAMES=Object.freeze({'0':'STR','1':'DEX','2':'INT','3':'LUK','4':'Max HP','5':'Max MP','6':'Speed','7':'Jump','9':'Magic ATT','10':'Weapon DEF','11':'Magic DEF','12':'Accuracy','13':'Avoidability','14':'Crit rate','15':'Crit damage','16':'Weapon ATT'});
export const PROFILE=Object.freeze({version:1,kind:'market_api_price_item',sourceUrl:'https://maplestory.market/api/prices',statMapSourceUrl:'https://maplestory.market/assets/VDivider-1_mhy5kl.js',statMapSha256:'1d08886333ef15b7615efc9330c5cf673946256265caf19e672621e32a856cf7'});
export class InvalidProfile extends Error{constructor(code){super(code);this.name='InvalidProfile';}}
const fail=code=>{throw new InvalidProfile(code);};
// Only indexes built from owned, hash-checked metadata may resolve DTO identity.
const VERIFIED_IDENTITY_INDEX=new WeakMap();
class DecimalToken{constructor(lexeme){this.lexeme=lexeme;Object.freeze(this);}}
function bytes(value){
  if(typeof value==='string'){if(value.length>MAX_BYTES)fail('body_bound');value=new TextEncoder().encode(value);}
  if(!(value instanceof Uint8Array)||!value.length||value.byteLength>MAX_BYTES)fail('body_bound');
  return value;
}
export async function sha256(raw){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',raw))].map(v=>v.toString(16).padStart(2,'0')).join('');}
// Decimal lexemes survive JSON decoding; JSON.parse alone rounds real prices.
export function parseStrictJson(raw){
  let s;try{s=new TextDecoder('utf-8',{fatal:true}).decode(bytes(raw));}catch(e){if(e instanceof InvalidProfile)throw e;fail('invalid_utf8');}
  let p=0,tokens=0;const ws=()=>{while(/[\x20\t\r\n]/.test(s[p]??'x'))p++;};
  function value(depth){
    if(depth>64||++tokens>500_000)fail('json_complexity');ws();const c=s[p];
    if(c==='"'){
      const start=p++;while(p<s.length){if(s[p]==='\\'){p+=2;continue;}if(s[p++]==='"'){try{return JSON.parse(s.slice(start,p));}catch{fail('invalid_string');}}}fail('invalid_string');
    }
    if(c==='{'){
      p++;ws();const o=Object.create(null);if(s[p]==='}'){p++;return o;}
      while(true){ws();if(s[p]!=='"')fail('object_key');const k=value(depth+1);if(own(o,k))fail('duplicate_json_key');ws();if(s[p++]!==':')fail('object_colon');o[k]=value(depth+1);ws();if(s[p]==='}'){p++;return o;}if(s[p++]!==',')fail('object_separator');}
    }
    if(c==='['){p++;ws();const a=[];if(s[p]===']'){p++;return a;}while(true){a.push(value(depth+1));ws();if(s[p]===']'){p++;return a;}if(s[p++]!==',')fail('array_separator');}}
    for(const [word,v]of[['true',true],['false',false],['null',null]])if(s.startsWith(word,p)){p+=word.length;return v;}
    const number=/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(s.slice(p));
    if(!number)fail('invalid_json_value');p+=number[0].length;
    if(number[0].length>256)fail('number_bound');
    if(!/[.eE]/.test(number[0])&&Number.isSafeInteger(Number(number[0])))return Number(number[0]);
    return new DecimalToken(number[0]);
  }
  const result=value(0);ws();if(p!==s.length)fail('json_trailing');return result;
}
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&!(v instanceof DecimalToken);
function shape(v,required,optional=[]){if(!object(v)||required.some(k=>!own(v,k))||Object.keys(v).some(k=>!required.includes(k)&&!optional.includes(k)))fail('unexpected_fields');}
function integer(v,min=0,max=Number.MAX_SAFE_INTEGER){if(!Number.isSafeInteger(v)||v<min||v>max)fail('invalid_integer');return v;}
function id(v){return integer(v,1,999_999_999);}
function amount(v,nullable=true){
  if(v===null&&nullable)return null;
  if(typeof v==='number'){if(!Number.isSafeInteger(v)||v<0)fail('lossy_or_invalid_price_number');return String(v);}
  if(!(v instanceof DecimalToken))fail('price_requires_numeric_lexeme');
  const m=/^(-?)([0-9]+)(?:\.([0-9]+))?(?:[eE]([+-]?[0-9]+))?$/.exec(v.lexeme);if(!m)fail('invalid_price');
  const digits=m[2]+(m[3]||''),exp=Number(m[4]||0)-(m[3]||'').length;
  if((m[1]&&/[1-9]/.test(digits))||digits.length>128||!Number.isSafeInteger(exp)||exp< -32||exp>18)fail('amount_precision_bound');
  const at=digits.length+exp;let result=at<=0?'0.'+'0'.repeat(-at)+digits:at>=digits.length?digits+'0'.repeat(at-digits.length):digits.slice(0,at)+'.'+digits.slice(at);
  result=result.replace(/^0+(?=[0-9])/,'');return result;
}
function freeze(v){if(v&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v;}
function iso(v){
  if(typeof v!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(v)||!Number.isFinite(Date.parse(v)))fail('invalid_clock');
  const parts=/^(\d{4}-\d\d-\d\d)T(\d\d):(\d\d):(\d\d)/.exec(v),d=new Date(v);
  if(d.toISOString().slice(0,10)!==parts[1]||Number(parts[2])>23||Number(parts[3])>59||Number(parts[4])>59)fail('invalid_clock');return v;
}
function sourceContext(v,hash){
  shape(v,['operation','sourceUrl','capturedAt','sourceObservedAt','captureTimeKind']);
  if(v.operation!=='prices'||v.sourceUrl!==PROFILE.sourceUrl||v.sourceObservedAt!==null||v.captureTimeKind!=='http_response_completed'||!HASH.test(hash))fail('source_context');
  return{provider:'maplestory.market',operation:'prices',sourceUrl:PROFILE.sourceUrl,rawBodySha256:hash,retrievedAt:iso(v.capturedAt),retrievalTimeKind:v.captureTimeKind,sourceObservedAt:null,
    window:{reportedDays:3,exactStartAt:null,exactEndAt:null},sourceWindowSemantics:'primary_client_reported_window_not_exact_observation_bounds'};
}
function sold(v){
  if(v===null)return null;shape(v,['sales','units','day_sales','day_units','avg_unit_price','median_unit_price']);
  return{reportedSalesCount:integer(v.sales),reportedUnitCount:integer(v.units),reportedDaySalesCount:integer(v.day_sales),reportedDayUnitCount:integer(v.day_units),averageUnitPrice:amount(v.avg_unit_price),medianUnitPrice:amount(v.median_unit_price),basis:'source_labelled_sold_not_independently_confirmed_transactions',dayCounterBoundsKnown:false};
}
function asking(v){
  if(v===null)return null;shape(v,['listings','sellers','median_unit_price','p25_unit_price','p75_unit_price']);
  return{reportedListingCount:integer(v.listings),reportedSellerCount:integer(v.sellers),medianUnitPrice:amount(v.median_unit_price),p25UnitPrice:amount(v.p25_unit_price),p75UnitPrice:amount(v.p75_unit_price),basis:'source_seen_asking_prices',currentAvailabilityVerified:false};
}
function reference(v,scopes,isItem=false){
  if(v===null)return null;shape(v,['unit_price','basis','samples','scope']);if(!['sold','listed'].includes(v.basis)||!scopes.includes(v.scope))fail('reference_scope');
  return{unitPrice:amount(v.unit_price,false),basis:v.basis,reportedSamples:integer(v.samples),scope:v.scope,aggregation:isItem?(v.basis==='sold'?'average':'median'):'unknown',exactVariantValue:false,isNearFallback:v.scope==='near'};
}
function priceRow(row){
  shape(row,['item_id','sold','seen','reference'],['deal','by_stats','by_scrolls','by_attack','typical_attack']);const itemId=id(row.item_id);
  const aggregate={sold:sold(row.sold),asking:asking(row.seen),reference:reference(row.reference,['item'],true)};
  if(own(row,'deal'))aggregate.dealReference=reference(row.deal,['item'],true);
  const variants={reportedStats:[],successfulScrolls:[],attackPools:[],presence:{reportedStats:own(row,'by_stats'),successfulScrolls:own(row,'by_scrolls'),attackPools:own(row,'by_attack')}};
  for(const [key,out]of[['by_stats','reportedStats'],['by_scrolls','successfulScrolls'],['by_attack','attackPools']]){
    if(!own(row,key))continue;if(!Array.isArray(row[key])||row[key].length>20_000)fail('group_bound');const seenKeys=new Set();
    for(const raw of row[key]){
      let v,scopes;
      if(key==='by_attack'){
        shape(raw,['attack','sold','seen','reference'],['deal']);const attack=integer(raw.attack);scopes=['attack','near'];
        v={groupKey:`attack:${itemId}:${attack}`,reportedAttack:attack,sold:sold(raw.sold),asking:asking(raw.seen),reference:reference(raw.reference,scopes),qualityConstant:false,matchSemantics:'attack_only_pool_other_stats_not_constant'};
      }else{
        const stats=key==='by_stats';shape(raw,['upgrades','slots_left','reference',...(stats?['stats']:[])],stats?[]:['deal']);scopes=stats?['stats']:['scrolls','near'];
        const upgrades=integer(raw.upgrades,0,100),slots=integer(raw.slots_left,0,100);v={successfulUpgrades:upgrades,slotsLeft:slots,reference:reference(raw.reference,scopes),qualityConstant:false};
        if(stats){
          if(!object(raw.stats)||Object.keys(raw.stats).some(k=>!own(STAT_NAMES,k)))fail('unknown_stat_code');
          v.reportedStats=Object.fromEntries(Object.entries(raw.stats).sort((a,b)=>Number(a[0])-Number(b[0])).map(([code,value])=>[code,integer(value,-1_000_000,1_000_000)]));
          v.groupKey=`stats:${itemId}:u${upgrades}:s${slots}:`+Object.entries(v.reportedStats).map(([k,n])=>`${k}=${n}`).join(',');
          v.matchSemantics='reported_signature_not_certified_complete_roll';v.unreportedStats='unknown_not_zero';
          v.sourceComparisonMayIgnoreStats=['10','11'];
        }else{v.groupKey=`scrolls:${itemId}:u${upgrades}:s${slots}`;v.matchSemantics='successful_upgrades_and_slots_pool_all_stats';}
      }
      if(seenKeys.has(v.groupKey))fail('duplicate_group');seenKeys.add(v.groupKey);
      if(own(raw,'deal'))v.dealReference=reference(raw.deal,scopes);
      variants[out].push(v);
    }
  }
  return{itemId,aggregate,variants,...(own(row,'typical_attack')?{sourceTypicalAttack:integer(row.typical_attack)}:{})};
}

const META_URLS=new Set(['https://maplestory.io/api/MCW/1/item/list?cashFilter=true&count=10000','https://maplestory.io/api/MCW/1/item/list?cashFilter=false&count=10000']);
export async function createIdentityIndex(sources){
  if(!Array.isArray(sources)||sources.length>4)fail('identity_sources_bound');const names=new Map();
  // Own every descriptor and byte buffer before the first digest await.
  const ownedSources=sources.map(source=>{
    shape(source,['raw','expectedSha256','sourceUrl','format']);
    const owned={raw:new Uint8Array(bytes(source.raw)),expectedSha256:source.expectedSha256,sourceUrl:source.sourceUrl,format:source.format};
    if(!HASH.test(owned.expectedSha256)||!META_URLS.has(owned.sourceUrl)||!['cash_client_catalog','noncash_list'].includes(owned.format)||owned.sourceUrl.includes('cashFilter=true')!==(owned.format==='cash_client_catalog'))fail('identity_source');
    return owned;
  });
  for(const source of ownedSources){
    const raw=source.raw;if(await sha256(raw)!==source.expectedSha256)fail('identity_hash');const document=parseStrictJson(raw);
    const rows=source.format==='cash_client_catalog'?document.records:document;
    if(source.format==='cash_client_catalog'&&(!object(document)||document.region!=='MCW'||document.clientVersion!=='1'))fail('identity_world');
    if(!Array.isArray(rows)||rows.length>10_000)fail('identity_rows_bound');const sourceIds=new Set();
    for(const row of rows){
      const itemId=id(source.format==='cash_client_catalog'?row.itemId:row.id),name=row.name;
      if(sourceIds.has(itemId))fail('duplicate_metadata_id');sourceIds.add(itemId);
      if(typeof name!=='string'||!name.trim()||name.length>300)fail('identity_name');
      if(source.format==='cash_client_catalog'&&row.isCash!==true)fail('identity_cash_flag');
      if(!names.has(itemId))names.set(itemId,{names:new Set(),evidence:[]});const found=names.get(itemId);found.names.add(name);found.evidence.push({sourceUrl:source.sourceUrl,retainedMetadataSha256:source.expectedSha256});
    }
  }
  const getIdentity=itemId=>{id(itemId);const found=names.get(itemId),known=found&&found.names.size===1;return freeze({name:known?[...found.names][0]:null,status:known?'unique_client_id':found?'conflicting_client_id':'unknown_client_id',region:'MCW',clientVersion:'1',meaning:'client_presence_not_market_availability_or_release',evidence:found?found.evidence.map(row=>({...row})):[]});};
  const index=Object.freeze({get:getIdentity});VERIFIED_IDENTITY_INDEX.set(index,getIdentity);return index;
}
export async function createPriceSnapshot(raw,{expectedSha256,context,identities}={}){
  if(!HASH.test(expectedSha256??''))fail('snapshot_context');
  const identityGet=VERIFIED_IDENTITY_INDEX.get(identities);
  if(typeof identityGet!=='function')fail('snapshot_identity_capability');
  // Snapshot bytes/context and use only the constructor's closed immutable authority.
  // Merely binding an arbitrary get() would still read mutable closure/this state.
  raw=new Uint8Array(bytes(raw));const source=sourceContext(context,expectedSha256);
  if(await sha256(raw)!==expectedSha256)fail('raw_hash');const input=parseStrictJson(raw);
  if(!Array.isArray(input)||!input.length||input.length>20_000)fail('prices_rows_bound');const rows=new Map();
  for(const rawRow of input){const row=priceRow(rawRow);if(rows.has(row.itemId))fail('duplicate_item_id');
    const dto={schemaVersion:1,kind:PROFILE.kind,itemId:row.itemId,identity:structuredClone(identityGet(row.itemId)),source:{...source,window:{...source.window}},aggregate:row.aggregate,variants:row.variants,
      ...(own(row,'sourceTypicalAttack')?{sourceTypicalAttack:row.sourceTypicalAttack}:{}),
      semantics:{moneyUnit:'source_unit_price_in_mesos',counts:'source_reported_counts_not_independently_verified_trades',sampleThresholdApplied:null,exactVariantHistoryAvailable:false,cleanStateInferred:false,feesApplied:false,publicationAuthorized:false,statMapSha256:PROFILE.statMapSha256}};
    assertSafeItemDto(dto);rows.set(row.itemId,freeze(dto));
  }
  const itemIds=Object.freeze([...rows.keys()].sort((a,b)=>a-b));
  const snapshot={summary:freeze({profileVersion:1,itemCount:rows.size,rawBodySha256:expectedSha256,source:{...source,window:{...source.window}}}),getItem(itemId){return rows.get(id(itemId))??null;}};
  // Read-only capability outside the public DTO/closed four-field summary. It
  // derives from the same fully validated map, never reparses retained raw.
  Object.defineProperty(snapshot,'getItemIds',{value:()=>itemIds,enumerable:false});
  return Object.freeze(snapshot);
}
// Egress check reconstructs allowed nested fields; it does not scan/blocklist words.
export function assertSafeItemDto(dto){
  shape(dto,['schemaVersion','kind','itemId','identity','source','aggregate','variants','semantics'],['sourceTypicalAttack']);
  if(dto.schemaVersion!==1||dto.kind!==PROFILE.kind)fail('dto_profile');id(dto.itemId);
  shape(dto.identity,['name','status','region','clientVersion','meaning','evidence']);
  if(dto.identity.name!==null&&(typeof dto.identity.name!=='string'||!dto.identity.name.trim()||dto.identity.name.length>300))fail('dto_identity');
  if(!['unique_client_id','conflicting_client_id','unknown_client_id'].includes(dto.identity.status)||dto.identity.region!=='MCW'||dto.identity.clientVersion!=='1'||dto.identity.meaning!=='client_presence_not_market_availability_or_release'||!Array.isArray(dto.identity.evidence)||dto.identity.evidence.length>4)fail('dto_identity');
  if((dto.identity.status==='unique_client_id')!==(dto.identity.name!==null)||(dto.identity.name!==null&&dto.identity.evidence.length===0))fail('dto_identity_binding');
  for(const v of dto.identity.evidence){shape(v,['sourceUrl','retainedMetadataSha256']);if(!META_URLS.has(v.sourceUrl)||!HASH.test(v.retainedMetadataSha256))fail('dto_identity_evidence');}
  shape(dto.source,['provider','operation','sourceUrl','rawBodySha256','retrievedAt','retrievalTimeKind','sourceObservedAt','window','sourceWindowSemantics']);
  if(dto.source.provider!=='maplestory.market'||dto.source.operation!=='prices'||dto.source.sourceUrl!==PROFILE.sourceUrl||!HASH.test(dto.source.rawBodySha256)||dto.source.sourceObservedAt!==null||dto.source.retrievalTimeKind!=='http_response_completed'||dto.source.sourceWindowSemantics!=='primary_client_reported_window_not_exact_observation_bounds')fail('dto_source');iso(dto.source.retrievedAt);
  shape(dto.source.window,['reportedDays','exactStartAt','exactEndAt']);if(dto.source.window.reportedDays!==3||dto.source.window.exactStartAt!==null||dto.source.window.exactEndAt!==null)fail('dto_window');
  function money(v,nullable=true){if(v===null&&nullable)return;if(typeof v!=='string'||v.length>160||!/^\d+(?:\.\d+)?$/.test(v))fail('dto_price');}
  function s(v){if(v===null)return;shape(v,['reportedSalesCount','reportedUnitCount','reportedDaySalesCount','reportedDayUnitCount','averageUnitPrice','medianUnitPrice','basis','dayCounterBoundsKnown']);for(const k of ['reportedSalesCount','reportedUnitCount','reportedDaySalesCount','reportedDayUnitCount'])integer(v[k]);money(v.averageUnitPrice);money(v.medianUnitPrice);if(v.basis!=='source_labelled_sold_not_independently_confirmed_transactions'||v.dayCounterBoundsKnown!==false)fail('dto_sold');}
  function a(v){if(v===null)return;shape(v,['reportedListingCount','reportedSellerCount','medianUnitPrice','p25UnitPrice','p75UnitPrice','basis','currentAvailabilityVerified']);integer(v.reportedListingCount);integer(v.reportedSellerCount);for(const k of ['medianUnitPrice','p25UnitPrice','p75UnitPrice'])money(v[k]);if(v.basis!=='source_seen_asking_prices'||v.currentAvailabilityVerified!==false)fail('dto_asking');}
  function r(v,scopes,isItem=false){if(v===null)return;shape(v,['unitPrice','basis','reportedSamples','scope','aggregation','exactVariantValue','isNearFallback']);money(v.unitPrice,false);integer(v.reportedSamples);if(!['sold','listed'].includes(v.basis)||!scopes.includes(v.scope)||v.aggregation!==(isItem?(v.basis==='sold'?'average':'median'):'unknown')||v.exactVariantValue!==false||v.isNearFallback!==(v.scope==='near'))fail('dto_reference');}
  shape(dto.aggregate,['sold','asking','reference'],['dealReference']);s(dto.aggregate.sold);a(dto.aggregate.asking);r(dto.aggregate.reference,['item'],true);if(own(dto.aggregate,'dealReference'))r(dto.aggregate.dealReference,['item'],true);
  shape(dto.variants,['reportedStats','successfulScrolls','attackPools','presence']);shape(dto.variants.presence,['reportedStats','successfulScrolls','attackPools']);for(const value of Object.values(dto.variants.presence))if(typeof value!=='boolean')fail('dto_presence');
  for(const [key,scopes]of[['reportedStats',['stats']],['successfulScrolls',['scrolls','near']],['attackPools',['attack','near']]]){
    if(!Array.isArray(dto.variants[key])||dto.variants[key].length>20_000||(!dto.variants.presence[key]&&dto.variants[key].length))fail('dto_groups');const seen=new Set();
    for(const v of dto.variants[key]){
      const stats=key==='reportedStats',attack=key==='attackPools';
      shape(v,attack?['groupKey','reportedAttack','sold','asking','reference','qualityConstant','matchSemantics']:['successfulUpgrades','slotsLeft','reference','qualityConstant','groupKey','matchSemantics',...(stats?['reportedStats','unreportedStats','sourceComparisonMayIgnoreStats']:[])],stats?[]:['dealReference']);
      let expectedKey;
      if(attack){integer(v.reportedAttack);s(v.sold);a(v.asking);expectedKey=`attack:${dto.itemId}:${v.reportedAttack}`;if(v.matchSemantics!=='attack_only_pool_other_stats_not_constant')fail('dto_match');}
      else{integer(v.successfulUpgrades,0,100);integer(v.slotsLeft,0,100);expectedKey=`${stats?'stats':'scrolls'}:${dto.itemId}:u${v.successfulUpgrades}:s${v.slotsLeft}`;
        if(stats){if(!object(v.reportedStats)||Object.keys(v.reportedStats).some(k=>!own(STAT_NAMES,k)))fail('dto_stats');for(const n of Object.values(v.reportedStats))integer(n,-1_000_000,1_000_000);expectedKey+=':'+Object.entries(v.reportedStats).sort((a,b)=>Number(a[0])-Number(b[0])).map(([k,n])=>`${k}=${n}`).join(',');if(v.unreportedStats!=='unknown_not_zero'||JSON.stringify(v.sourceComparisonMayIgnoreStats)!=='["10","11"]'||v.matchSemantics!=='reported_signature_not_certified_complete_roll')fail('dto_match');}
        else if(v.matchSemantics!=='successful_upgrades_and_slots_pool_all_stats')fail('dto_match');}
      if(v.groupKey!==expectedKey||seen.has(v.groupKey)||v.qualityConstant!==false)fail('dto_group_binding');seen.add(v.groupKey);r(v.reference,scopes);if(own(v,'dealReference'))r(v.dealReference,scopes);
    }
  }
  shape(dto.semantics,['moneyUnit','counts','sampleThresholdApplied','exactVariantHistoryAvailable','cleanStateInferred','feesApplied','publicationAuthorized','statMapSha256']);
  if(dto.semantics.moneyUnit!=='source_unit_price_in_mesos'||dto.semantics.counts!=='source_reported_counts_not_independently_verified_trades'||dto.semantics.sampleThresholdApplied!==null||dto.semantics.statMapSha256!==PROFILE.statMapSha256||['exactVariantHistoryAvailable','cleanStateInferred','feesApplied','publicationAuthorized'].some(k=>dto.semantics[k]!==false))fail('dto_semantics');if(own(dto,'sourceTypicalAttack'))integer(dto.sourceTypicalAttack);return true;
}
export function filterReportedStats(dto,{stats=[],slotsLeft=null,successfulUpgrades=null}={}){
  assertSafeItemDto(dto);if(!Array.isArray(stats)||stats.length>16)fail('filter_bound');const codes=new Set();
  for(const q of stats){shape(q,['code'],['minimum','maximum']);if(!own(STAT_NAMES,q.code)||codes.has(q.code))fail('filter_stat');codes.add(q.code);if(own(q,'minimum'))integer(q.minimum,-1_000_000,1_000_000);if(own(q,'maximum'))integer(q.maximum,-1_000_000,1_000_000);if(own(q,'minimum')&&own(q,'maximum')&&q.minimum>q.maximum)fail('filter_range');}
  if(slotsLeft!==null)integer(slotsLeft,0,100);if(successfulUpgrades!==null)integer(successfulUpgrades,0,100);
  return dto.variants.reportedStats.filter(row=>(slotsLeft===null||row.slotsLeft===slotsLeft)&&(successfulUpgrades===null||row.successfulUpgrades===successfulUpgrades)&&stats.every(q=>own(row.reportedStats,q.code)&&(!own(q,'minimum')||row.reportedStats[q.code]>=q.minimum)&&(!own(q,'maximum')||row.reportedStats[q.code]<=q.maximum)));
}
export function filterOptions(dto){assertSafeItemDto(dto);const rows=dto.variants.reportedStats;return freeze({stats:[...new Set(rows.flatMap(v=>Object.keys(v.reportedStats)))].sort((a,b)=>Number(a)-Number(b)).map(code=>({code,label:STAT_NAMES[code]})),slotsLeft:[...new Set(rows.map(v=>v.slotsLeft))].sort((a,b)=>a-b),successfulUpgrades:[...new Set(rows.map(v=>v.successfulUpgrades))].sort((a,b)=>a-b),unknownStatsMatch:false,attackPoolsAreSeparate:true});}

function compareMoney(a,b){
  const [ai,af='']=a.split('.'),[bi,bf='']=b.split('.');
  if(ai.length!==bi.length)return ai.length<bi.length?-1:1;
  if(ai!==bi)return ai<bi?-1:1;
  const width=Math.max(af.length,bf.length),ap=af.padEnd(width,'0'),bp=bf.padEnd(width,'0');return ap===bp?0:ap<bp?-1:1;
}
export function filterEvidenceGroups(dto,query){
  assertSafeItemDto(dto);shape(query,['kind'],['stats','slotsLeft','successfulUpgrades','minimumAttack','maximumAttack','minimumReferenceSamples','basis','includeNearFallback','sortReference']);
  if(!['reported_stats','scroll_state','attack_pool'].includes(query.kind))fail('filter_kind');
  if(own(query,'basis')&&!['sold','listed'].includes(query.basis))fail('filter_basis');
  if(own(query,'minimumReferenceSamples'))integer(query.minimumReferenceSamples);
  if(own(query,'includeNearFallback')&&typeof query.includeNearFallback!=='boolean')fail('filter_near');
  if(own(query,'sortReference')&&!['ascending','descending'].includes(query.sortReference))fail('filter_sort');
  let rows;
  if(query.kind==='reported_stats'){
    if(own(query,'minimumAttack')||own(query,'maximumAttack'))fail('incompatible_filter_pool');
    rows=filterReportedStats(dto,{stats:query.stats??[],slotsLeft:query.slotsLeft??null,successfulUpgrades:query.successfulUpgrades??null});
  }else if(query.kind==='scroll_state'){
    if(own(query,'stats')||own(query,'minimumAttack')||own(query,'maximumAttack'))fail('incompatible_filter_pool');
    if(own(query,'slotsLeft'))integer(query.slotsLeft,0,100);if(own(query,'successfulUpgrades'))integer(query.successfulUpgrades,0,100);
    rows=dto.variants.successfulScrolls.filter(v=>(!own(query,'slotsLeft')||v.slotsLeft===query.slotsLeft)&&(!own(query,'successfulUpgrades')||v.successfulUpgrades===query.successfulUpgrades));
  }else{
    if(own(query,'stats')||own(query,'slotsLeft')||own(query,'successfulUpgrades'))fail('incompatible_filter_pool');
    if(own(query,'minimumAttack'))integer(query.minimumAttack);if(own(query,'maximumAttack'))integer(query.maximumAttack);
    if(own(query,'minimumAttack')&&own(query,'maximumAttack')&&query.minimumAttack>query.maximumAttack)fail('filter_range');
    rows=dto.variants.attackPools.filter(v=>(!own(query,'minimumAttack')||v.reportedAttack>=query.minimumAttack)&&(!own(query,'maximumAttack')||v.reportedAttack<=query.maximumAttack));
  }
  const matchedBeforeReferenceFilters=rows.length;
  rows=rows.filter(v=>(query.includeNearFallback===true||!v.reference?.isNearFallback)&&(!own(query,'basis')||v.reference?.basis===query.basis)&&(!own(query,'minimumReferenceSamples')||(v.reference!==null&&v.reference.reportedSamples>=query.minimumReferenceSamples)));
  if(query.sortReference)rows=[...rows].sort((a,b)=>{
    if(a.reference===null||b.reference===null)return a.reference===b.reference?0:a.reference===null?1:-1;
    const n=compareMoney(a.reference.unitPrice,b.reference.unitPrice);return (query.sortReference==='descending'?-n:n)||a.groupKey.localeCompare(b.groupKey,'en');
  });
  return freeze({kind:query.kind,rows,matchedBeforeReferenceFilters,nearFallbacksIncluded:query.includeNearFallback===true,
    sampleMeaning:'source_reference_samples_not_quantity_or_verified_fills',qualityConstant:false,
    temporalHistoryAvailable:false,source:dto.source});
}
