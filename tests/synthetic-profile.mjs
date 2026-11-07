// Actor-free synthetic inputs only. No transport, runtime, account or live data.
import spec from '../ops/api-index-definition-data-v1.json' with {type:'json'};
import {EXPECTED_DEFINITION_HASH} from '../ops/api-index-definition.mjs';
import {STAMP_DEFINITION_SHA256, STAMP_DEFINITION_TEXT} from '../ops/stamp-reference-definition.mjs';
import {OBSERVED_PLAN_SHA256} from '../ops/observed-firstpass-plan.mjs';
import {OPERATIONS} from '../ops/api-collector-core.mjs';

export const START = Date.parse('2026-11-06T12:10:00.000Z');
export const CASES = Object.freeze(['mixed-cold', 'mixed-max-raw', 'mixed-held-put', 'mixed-slots']);
const check = v => { if (!v) throw Error('synthetic_profile_bound'); };
const enc = new TextEncoder();
const declaredStamp = JSON.parse(STAMP_DEFINITION_TEXT);
export const COHORT = Object.freeze((() => {
  const ids = new Set([...spec.goods, ...spec.cash].map(r => r.itemId));
  for (const [id] of declaredStamp.rows) ids.add(id);
  ids.add(1082002); ids.add(2010001);
  for (let i = 0; ids.size < 1500; i++) ids.add(888000000 + i);
  return [...ids].sort((a,b) => a-b);
})());
const bases = new Map([...spec.goods,...spec.cash].map(r => [r.itemId, Number(r.APIlinkPrice ?? 10000)]));
export function priceRows(revision = 1) {
  check(Number.isSafeInteger(revision) && revision >= 1 && revision <= 4);
  return COHORT.map(item_id => {
    const median = (bases.get(item_id) ?? 121) * revision;
    const sold = {sales:5, units:100, day_sales:1, day_units:2, avg_unit_price:median, median_unit_price:median};
    const seen = {listings:3, sellers:2, median_unit_price:median+3, p25_unit_price:median+1, p75_unit_price:median+5};
    return {item_id, sold, seen, reference:{unit_price:median,basis:'sold',samples:5,scope:'item'},
      by_stats:Array.from({length:7},(_,i)=>({upgrades:i,slots_left:7-i,stats:{14:i,16:i+1},
        reference:{unit_price:200+i,basis:'sold',samples:5,scope:'stats'}})),
      by_scrolls:Array.from({length:2},(_,i)=>({upgrades:i,slots_left:7-i,
        reference:{unit_price:220+i,basis:'sold',samples:5,scope:'scrolls'}})),
      by_attack:[{attack:2,sold,seen,reference:{unit_price:median,basis:'sold',samples:5,scope:'attack'}}],typical_attack:2};
  });
}
export function priceBody({revision=1,padded=false}={}) {
  let raw = JSON.stringify(priceRows(revision));
  check(enc.encode(raw).length <= 4_990_000);
  if (padded) raw += ' '.repeat(4_990_000-enc.encode(raw).length);
  return raw;
}
export function overviewBody(at=START) {
  const day=Math.floor(at/86400000)*86400000;
  return JSON.stringify({generated_at:Math.floor((at-1000)/1000),window_hours:72,scanned_hours:72,previous_scanned_hours:72,
    comparable:true,totals:{},items:[...spec.goods,...spec.cash].map(r=>({item_id:r.itemId,cash:false,sales:50,
      units:500,mesos:100000,median_unit_price:100,previous_sales:50,previous_median_unit_price:100,
      daily:Array.from({length:7},(_,i)=>({day:(day-(7-i)*86400000)/1000,sales:5,units:500,
        median_unit_price:Number(r.APIlinkPrice??10000)}))})),movers:[],most_sales:[],best_sellers:[],
    top_turnover:[],most_listed:[],activity:[],maintenance:[],top_sellers:[]});
}
export const historyBody = at => JSON.stringify([{hour:Math.floor((at-3600000)/3600000)*3600,
  seen:{listings:2,min_unit_price:10,median_unit_price:12,max_unit_price:15},sold:null}]);
export function sourceBody(operation, {at=START, revision=1, padded=false}={}) {
  if (operation==='status') return '{}';
  if (operation==='prices') return priceBody({revision,padded});
  if (operation==='catalogue') return JSON.stringify(COHORT.map(item_id=>({item_id,listings:1,sold_out:0,total_units:1,min_unit_price:12})));
  if (operation==='overview') return overviewBody(at);
  if (operation==='apple-detail'||/^observed-detail-\d+$/.test(operation)) return JSON.stringify({item_id:operation==='apple-detail'?2010001:Number(operation.split('-').at(-1)),listings:[],recent_sales:[],equip:null});
  if (operation==='apple-history'||/^observed-history-\d+$/.test(operation)) return historyBody(at);
  const nx=m=>({posters:2,median:m,mode:m,low:m,high:m,steps:[[m,2]]});
  if (operation==='nx-rate') return JSON.stringify({buy:nx(12),sell:nx(20),window_hours:8,limited:false,last_heard:Math.floor((at-1000)/1000)});
  if (operation==='nx-history') return JSON.stringify(['buy','sell'].map((side,i)=>({at:Math.floor((at-3600000)/3600000)*3600,side,
    posters:2,p25:12+i*8,median:12+i*8,p75:12+i*8,low:12+i*8,high:12+i*8,steps:{[12+i*8]:2}})));
  throw Error('unreviewed_synthetic_operation');
}
export function operationForUrl(value) {
  const url=new URL(value);
  check(url.origin==='https://maplestory.market'&&!url.username&&!url.password&&!url.hash);
  for (const [operation,route] of Object.entries(OPERATIONS)) if (url.pathname+url.search===route) return operation;
  const m=/^\/api\/items\/(\d+)(\/history)?$/.exec(url.pathname);
  check(m&&!url.search); return `observed-${m[2]?'history':'detail'}-${m[1]}`;
}
export function syntheticEnvironment(caseName='mixed-cold') {
  check(CASES.includes(caseName));
  const privateFlag={schemaVersion:1,enabled:true,methodVersion:1,publicationEnabled:false};
  const publicFlag={...privateFlag,publicationEnabled:true};
  const grant={enabled:true,approvalRecorded:true,exclusiveAccountOwnerConfirmed:true,grantReference:'synthetic-mixed-fast',
    grantedPerMinute:30,grantedPerDay:null,operatorDailyRequestCap:30000,minimumRequestIntervalSeconds:2.5,
    higherFrequencyExplicitlyGranted:true,allowedOperations:Object.keys(OPERATIONS),probeRound:'synthetic-native-r1',
    publicationEnabled:false,nxSchemaProbesEnabled:true};
  const json=v=>JSON.stringify(v);
  const env={MAPLESTORY_MARKET_APPROVED_API_KEY:'SYNTHETIC-NOT-A-CREDENTIAL',API_GRANT_JSON:json(grant),
    API_SCHEDULE_JSON:json({enabled:true,scheduleReference:'mixed-native',requestIntervalMilliseconds:2500,startupTargetSeconds:21600,
      recurring:[{operation:'prices',intervalSeconds:300,priority:0},{operation:'catalogue',intervalSeconds:900,priority:1},
        {operation:'overview',intervalSeconds:900,priority:2},{operation:'nx-rate',intervalSeconds:60,priority:3},
        {operation:'nx-history',intervalSeconds:300,priority:4}]}),
    API_PRIVATE_CASH_JSON:json(privateFlag),API_PUBLIC_CASH_JSON:json(publicFlag),API_PRIVATE_NX_JSON:json(privateFlag),
    API_PRIVATE_NX_R2_JSON:json(privateFlag),API_NX_HISTORY_JSON:json(publicFlag),API_PRIVATE_ITEMS_JSON:json(privateFlag),
    API_PRIVATE_ITEM_DISCOVERY_JSON:json(privateFlag),API_PRIVATE_ITEM_HISTORY_JSON:json(privateFlag),
    API_PRIVATE_ITEM_HOUR_EXPORT_JSON:json({...privateFlag,itemId:1082002}),
    API_PRIVATE_INDEX_JSON:json({...privateFlag,definitionHash:EXPECTED_DEFINITION_HASH}),
    API_PUBLIC_MARKET_CALCULATIONS_JSON:json({...publicFlag,definitionHash:EXPECTED_DEFINITION_HASH}),
    API_STAMP_REFERENCES_JSON:json({schemaVersion:1,enabled:true,publicationEnabled:false,definitionHash:STAMP_DEFINITION_SHA256}),
    API_DISCOVERY_PRICE_MEMBERSHIP_JSON:json({schemaVersion:1,enabled:true,methodVersion:1}),
    API_ITEM_LIFECYCLE_JSON:json({schemaVersion:1,enabled:true,mode:'continuous',methodVersion:1,publicationEnabled:false,
      retentionPolicyVersion:1,ownerReferenceReleaseVersion:1,minimumIntervalSeconds:3600,maxStoredGenerations:1024}),
    API_OBSERVED_FIRSTPASS_JSON:json({enabled:true,approvalRecorded:true,planSha256:OBSERVED_PLAN_SHA256,
      queueReference:'mixed-native-finite',roundReference:grant.probeRound,grantReference:grant.grantReference,chunkSize:64,
      maxQueuedJobs:128,maxAttemptsPerJob:3}),
    API_ITEM_RECURRING_JSON:json({schemaVersion:1,enabled:true,approvalRecorded:true,grantReference:grant.grantReference,
      roundReference:grant.probeRound,policyReference:'mixed-native-r1',maxQueuedJobs:8,maxAttemptsPerCycle:3,
      perItemOperations:['detail','history'],prioritySeconds:1800,regularSeconds:21600,retryReservePercent:10,publicationEnabled:false}),
    API_FAST_CURRENT_JSON:json({schemaVersion:1,enabled:true,approvalRecorded:true,mode:'continuous_v2_reprojection',
      contractSha256:'e0c58417ac4bc4097d7a61d85797002708073a35fac48a7234c0bc646e977893',
      grantReference:grant.grantReference,roundReference:grant.probeRound,publicationEnabled:false})};
  return {grant,env,caseName};
}
