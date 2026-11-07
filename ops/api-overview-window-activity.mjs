// Pure optional current-window projection. No SQL/owner/publication authority.
import {overviewDerivedCapture} from './api-overview-snapshot.mjs';
import {sha256} from './api-price-item-dto.mjs';
export const ACTIVITY_LIMITS=Object.freeze({topPerFact:20,bytes:65536});
export class OverviewActivityCapacityError extends TypeError{}
const enc=new TextEncoder(),freeze=v=>{if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
const pow=s=>10n**BigInt(s);
function decimal(text){const [a,b='']=text.split('.');return{n:BigInt(a+b),s:b.length};}
function plus(a,b){const s=Math.max(a.s,b.s);return{n:a.n*pow(s-a.s)+b.n*pow(s-b.s),s};}
function lex(v){const raw=v.n.toString().padStart(v.s+1,'0'),s=v.s?raw.slice(0,-v.s)+'.'+raw.slice(-v.s):raw;return s.includes('.')?s.replace(/0+$/,'').replace(/\.$/,''):s;}
function compare(a,b){const d=a.n*pow(b.s)-b.n*pow(a.s);return d<0n?-1:d>0n?1:0;}
function insert(list,row,value){let at=0;while(at<list.length&&(compare(list[at].value,value)>0||compare(list[at].value,value)===0&&list[at].row.itemId<row.itemId))at++;if(at<20){list.splice(at,0,{row,value});if(list.length>20)list.pop();}}
export async function prepareOverviewWindowActivity(profile){
 // Branded profile input; this reuses the already parsed safe projection. The
 // existing4MiB/32day/120kday gates apply without rereading or reparsing raw.
 const derived=await overviewDerivedCapture(profile),c=derived.capture;
 const counts=[],mesos=[],proxies=[];let sales={n:0n,s:0},units={n:0n,s:0},reported={n:0n,s:0},proxy={n:0n,s:0},proxyEligible=0;
 for(const v of c.rows){
  const count={n:BigInt(v.recordedSalesCount),s:0},unit={n:BigInt(v.reportedUnitCount),s:0},sourceMesos=decimal(v.sourceReportedMesosLexeme),median=v.medianUnitPriceLexeme===null?null:decimal(v.medianUnitPriceLexeme),p=median?{n:median.n*count.n,s:median.s}:null;
  sales=plus(sales,count);units=plus(units,unit);reported=plus(reported,sourceMesos);if(p){proxy=plus(proxy,p);proxyEligible++;}
  const row={itemId:v.itemId,sourceCashFlag:v.sourceCashFlag,recordedSalesCount:v.recordedSalesCount,reportedUnitCount:v.reportedUnitCount,sourceReportedMesosLexeme:v.sourceReportedMesosLexeme,medianUnitPriceLexeme:v.medianUnitPriceLexeme,medianTimesCountProxyLexeme:p?lex(p):null};
  insert(counts,row,count);insert(mesos,row,sourceMesos);if(p)insert(proxies,row,p);
 }
 const received=c.rows.length,summary=freeze({schemaVersion:1,kind:'overview_window_activity_summary',profileVersion:c.profileVersion,profileHash:c.profileHash,derivedBodySha256:derived.bodySha256,source:c.source,window:c.window,grain:'source_reported_overview_window_not_daily',publicationEligible:false,sourceActorsExported:false,individualTradesQualified:0,
  coverage:{receivedItemRows:received,countEligibleItemRows:received,reportedUnitEligibleItemRows:received,sourceReportedMesosEligibleItemRows:received,medianCountProxyEligibleItemRows:proxyEligible,medianCountProxyMissingPriceRows:received-proxyEligible},
  counterSums:{sourceRecordedSalesCounterSumLexeme:lex(sales),sourceReportedUnitCounterSumLexeme:lex(units),sourceReportedMesosSumLexeme:lex(reported),medianCountProxySumLexeme:proxyEligible?lex(proxy):null},
  top20:{recordedSalesCount:counts.map(v=>v.row),sourceReportedMesos:mesos.map(v=>v.row),medianTimesCountProxy:proxies.map(v=>v.row)},
  semantics:{counts:'source_reported_counts_not_unique_or_verified_trades',units:'sum_of_reported_unit_counters_not_standardized_market_volume',sourceMesos:'source_labelled_mesos_not_independently_verified_trade_value',proxy:'median_unit_price_times_recorded_sales_count_not_actual_traded_mesos',scope:'received_overview_rows_not_all_game_trades_or_participants',medianEligibility:'profile_valid_nonnegative_median_no_extra_sample_threshold',cashFlag:'source_flag_not_fashion_or_stamp_eligibility',exactObservationBoundsKnown:false,dailyLedgerIncluded:false,uniqueParticipantsKnown:false}});
 const raw=enc.encode(JSON.stringify(summary));if(raw.length>ACTIVITY_LIMITS.bytes)throw new OverviewActivityCapacityError('overview_activity_capacity');return freeze({summary,bodySha256:await sha256(raw),bodyBytes:raw.length,hashMethod:'sha256-exact-json-utf8-overview-window-activity-v1',authority:'profile_only_not_owned_sql_or_publication'});
}
