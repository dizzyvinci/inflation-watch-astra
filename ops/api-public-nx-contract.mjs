// Public-safe curated offer subset. Input must pass the accepted private reader.
import {validateProjection} from './api-private-nx-projection.mjs';
const PUBLIC_NX_PATH='/api-nx-offers.json',MAX_PUBLIC_NX_BYTES=600000;
const CANONICAL_OFFER_SOURCE='https://maplestory.market/ads?tab=services';
const API_HISTORY_SOURCE='https://maplestory.market/api/nx-rate/history?range=7d&step=hour';
const API_SUMMARY_SOURCE='https://maplestory.market/api/nx-rate';
const ATTRIBUTION=Object.freeze({label:'NX offers from maplestory.market',url:'https://maplestory.market/?ref=v6kkdvp6'});
const BASIS='advertised_NX_offer_rates_not_completed_sales';
const check=(ok,code)=>{if(!ok)throw new TypeError(code);};
const integer=v=>Number.isSafeInteger(v)&&v>=0;
const clock=v=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const hour=v=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:00:00Z$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().replace('.000Z','Z')===v;
const sourceClock=v=>v===null||typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().replace('.000Z','Z')===v;
const exact=(v,keys)=>check(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join('|')===keys.split(' ').sort().join('|'),'unexpected_public_nx_fields');
const positive=v=>v===null||typeof v==='number'&&Number.isFinite(v)&&v>0&&v<=Number.MAX_SAFE_INTEGER;
function publicStats(s,native){
 if(s===null){check(native,'missing_hourly_stats');return;}
 exact(s,`low median high ${native?'mode':'p25 p75'} reportedPosterCount statisticsComplete`);
 const fields=native?['low','median','high','mode']:['low','p25','median','p75','high'];check(integer(s.reportedPosterCount)&&fields.every(k=>positive(s[k]))&&typeof s.statisticsComplete==='boolean','public_nx_stats');
 const ordered=(native?['low','median','high']:['low','p25','median','p75','high']).map(k=>s[k]).filter(v=>v!==null);check(ordered.every((v,i)=>!i||v>=ordered[i-1]),'public_nx_stat_order');
 check(s.statisticsComplete===fields.every(k=>s[k]!==null),'public_nx_completeness');if(s.reportedPosterCount===0)check(fields.every(k=>s[k]===null),'public_nx_zero');
}
function validatePublicNx(dto){
 exact(dto,'schemaVersion kind methodVersion sourceIdentity unit basis capturedAt sourceObservedAt qualifiedIndividualTrades publicationEligible changesGoodsIndex changesHeadlineBenchmark attribution nativeSummary hourlyHistory derived24');
 check(dto.schemaVersion===1&&dto.kind==='nx_offer_display_subset'&&dto.methodVersion===1&&dto.sourceIdentity==='maplestory_market_nx_offers'&&dto.unit==='mesos_per_NX'&&dto.basis===BASIS&&clock(dto.capturedAt)&&dto.sourceObservedAt===null&&dto.qualifiedIndividualTrades===0&&dto.publicationEligible===false&&dto.changesGoodsIndex===false&&dto.changesHeadlineBenchmark===false,'public_nx_contract');
 exact(dto.attribution,'label url');check(dto.attribution.label===ATTRIBUTION.label&&dto.attribution.url===ATTRIBUTION.url,'public_nx_attribution');
 const n=dto.nativeSummary;if(n!==null){exact(n,'sourceUrl capturedAt reportedWindowHours actualWindowStart actualWindowEnd sourceLastHeardAt sourceLimited buy sell');check(n.sourceUrl===API_SUMMARY_SOURCE&&clock(n.capturedAt)&&n.capturedAt<=dto.capturedAt&&Number.isSafeInteger(n.reportedWindowHours)&&n.reportedWindowHours>0&&n.reportedWindowHours<=8784&&n.actualWindowStart===null&&n.actualWindowEnd===null&&sourceClock(n.sourceLastHeardAt)&&typeof n.sourceLimited==='boolean','public_nx_native');publicStats(n.buy,true);publicStats(n.sell,true);}
 const h=dto.hourlyHistory;exact(h,'sourceUrl bucketCompletionKnown maxSelectedHours totalRetainedSourceHourSideRows omittedRetainedSourceHourSideRows rows');check(h.sourceUrl===API_HISTORY_SOURCE&&h.bucketCompletionKnown===false&&h.maxSelectedHours===744&&integer(h.totalRetainedSourceHourSideRows)&&integer(h.omittedRetainedSourceHourSideRows)&&Array.isArray(h.rows)&&h.rows.length<=1488&&h.totalRetainedSourceHourSideRows===h.rows.length+h.omittedRetainedSourceHourSideRows,'public_nx_history');
 let previous='';for(const r of h.rows){exact(r,'at side capturedAt sourceObservedAt low median high p25 p75 reportedPosterCount statisticsComplete');check(hour(r.at)&&['buy','sell'].includes(r.side)&&clock(r.capturedAt)&&r.capturedAt<=dto.capturedAt&&r.sourceObservedAt===null,'public_nx_hour_context');const key=r.at+'|'+r.side;check(key>previous,'public_nx_hour_order');previous=key;const {at,side,capturedAt,sourceObservedAt,...stats}=r;publicStats(stats,false);}
 const d=dto.derived24;exact(d,'kind hours anchorSourceHourLabel firstSelectedSourceHourLabel sides quantileMethod counts bucketCompletionKnown');check(d.kind==='derived_published_hourly_histogram_pool'&&d.hours===24&&d.quantileMethod==='linear_interpolation_ordered_frequency_bins'&&d.counts==='poster_hour_observations_not_unique_people_or_trades'&&d.bucketCompletionKnown===false,'public_nx_derived');const anchor=h.rows.length?h.rows.at(-1).at:null;check(d.anchorSourceHourLabel===anchor&&d.firstSelectedSourceHourLabel===(anchor?new Date(Date.parse(anchor)-23*3600000).toISOString().replace('.000Z','Z'):null),'public_nx_derived_window');exact(d.sides,'buy sell');
 for(const side of ['buy','sell']){const s=d.sides[side];exact(s,'p25 median p75 posterHourObservations availableHourBuckets missingHourBuckets');check(['p25','median','p75'].every(k=>positive(s[k])),'public_nx_derived_rates');const v=[s.p25,s.median,s.p75].filter(x=>x!==null);check(v.every((n,i)=>!i||n>=v[i-1]),'public_nx_derived_order');const rows=anchor?h.rows.filter(r=>r.side===side&&r.at>=d.firstSelectedSourceHourLabel):[],count=rows.reduce((n,r)=>n+r.reportedPosterCount,0);check(integer(count)&&s.availableHourBuckets===rows.length&&s.missingHourBuckets===24-rows.length&&s.posterHourObservations===(rows.length?count:null),'public_nx_derived_counts');if(!count)check(s.p25===null&&s.median===null&&s.p75===null,'public_nx_empty_pool');}
 return dto;
}

export {PUBLIC_NX_PATH,MAX_PUBLIC_NX_BYTES,CANONICAL_OFFER_SOURCE,API_HISTORY_SOURCE,API_SUMMARY_SOURCE,validatePublicNx};
export function publicNxStatus(env){try{
 const v=JSON.parse(env.API_PUBLIC_NX_JSON??'{"enabled":false}');if(v?.enabled===false)return'disabled';
 return v&&Object.keys(v).sort().join(',')==='enabled,methodVersion,publicationEnabled,schemaVersion'&&v.enabled===true&&v.schemaVersion===1&&v.methodVersion===1&&v.publicationEnabled===true?'ready':'invalid_configuration';
}catch{return'invalid_configuration';}}
const selectStats=(s,native)=>s===null?null:Object.fromEntries([...['low','median','high'],...(native?['mode']:['p25','p75']),'reportedPosterCount','statisticsComplete'].map(k=>[k,s[k]]));
export async function publicNxSubset(projection){
 await validateProjection(projection);const captures=new Map(projection.captures.map(c=>[c.captureId,c])),native=projection.nativeSummary;
 const n=native?{sourceUrl:API_SUMMARY_SOURCE,capturedAt:captures.get(native.sourceCaptureId).capturedAt,reportedWindowHours:native.summary.reportedWindowHours,actualWindowStart:null,actualWindowEnd:null,sourceLastHeardAt:native.summary.sourceLastHeardAt,sourceLimited:native.summary.sourceLimited,buy:selectStats(native.summary.buy,true),sell:selectStats(native.summary.sell,true)}:null;
 const h=projection.hourlyHistory,derived=projection.derived24,{sourceUrl:_source,...d}=derived;
 return validatePublicNx({schemaVersion:1,kind:'nx_offer_display_subset',methodVersion:1,sourceIdentity:'maplestory_market_nx_offers',unit:'mesos_per_NX',basis:BASIS,capturedAt:projection.receiptWatermarkAt,sourceObservedAt:null,qualifiedIndividualTrades:0,publicationEligible:false,changesGoodsIndex:false,changesHeadlineBenchmark:false,attribution:{...ATTRIBUTION},nativeSummary:n,hourlyHistory:{sourceUrl:API_HISTORY_SOURCE,bucketCompletionKnown:false,maxSelectedHours:744,totalRetainedSourceHourSideRows:h.totalRetainedSourceHourSideRows,omittedRetainedSourceHourSideRows:h.omittedRetainedSourceHourSideRows,rows:h.rows.map(r=>({at:r.at,side:r.side,capturedAt:captures.get(r.sourceCaptureId).capturedAt,sourceObservedAt:null,...selectStats(r,false)}))},derived24:structuredClone(d)});
}
