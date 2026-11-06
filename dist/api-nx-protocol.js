(()=>{'use strict';if(window.AstraApiNxProtocol)return;
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
const bytes=text=>new TextEncoder().encode(text).length;
function parse(text){
 check(typeof text==='string'&&bytes(text)<=MAX_PUBLIC_NX_BYTES,'Bounded JSON required');let i=0,nodes=0;
 const space=()=>{while(/[ \r\n\t]/.test(text[i]||'')&&i<text.length)i++;};
 function string(){const at=i++;while(i<text.length){const c=text[i++];if(c==='"'){const s=JSON.parse(text.slice(at,i));check(s.length<=4096,'String bound');return s;}if(c==='\\')i++;}throw Error('Unterminated string');}
 function value(depth){check(++nodes<=60000&&depth<=16,'JSON complexity');space();const c=text[i];
  if(c==='"')return string();
  if(c==='['){i++;space();const a=[];if(text[i]===']'){i++;return a;}while(true){check(a.length<1500,'Array bound');a.push(value(depth+1));space();if(text[i]===']'){i++;return a;}check(text[i++]===',','Array separator');}}
  if(c==='{'){i++;space();const o=Object.create(null);if(text[i]==='}'){i++;return o;}while(true){space();check(text[i]==='"','Object key');const k=string();check(!Object.hasOwn(o,k),'Duplicate JSON key');check(Object.keys(o).length<64,'Object bound');space();check(text[i++]===':','Object separator');o[k]=value(depth+1);space();if(text[i]==='}'){i++;return o;}check(text[i++]===',','Object separator');}}
  for(const [literal,v]of[['true',true],['false',false],['null',null]])if(text.startsWith(literal,i)){i+=literal.length;return v;}
  const number=/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(text.slice(i));check(number,'JSON value');i+=number[0].length;const n=Number(number[0]);check(Number.isFinite(n)&&Math.abs(n)<=Number.MAX_SAFE_INTEGER,'Numeric bound');return n;
 }
 const result=value(0);space();check(i===text.length,'Trailing JSON data');return result;
}
const freeze=v=>{if(v&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v;};
function validate(input){const v=JSON.parse(JSON.stringify(input));validatePublicNx(v);return freeze(v);}
window.AstraApiNxProtocol=Object.freeze({validate,parse,path:PUBLIC_NX_PATH,maxBytes:MAX_PUBLIC_NX_BYTES,canonicalSource:CANONICAL_OFFER_SOURCE,historySource:API_HISTORY_SOURCE,summarySource:API_SUMMARY_SOURCE});
})();
