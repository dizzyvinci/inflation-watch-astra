// Curated PRIVATE projection contract only. No provider/key transport or public route.
import {portableHash} from './portable-hash.mjs';
import {parseStrictJson} from './api-raw-prices-decoder.mjs';
export const NX_POINTER='_private/provider-api/v1/nx-offer-projection.json';
export const NX_PREFIX='_private/provider-api/v1/nx-offer-projections/v1/';
export const NX_METHOD='private-nx-offers-sql-v1',NX_OWNER='maplestory-market-account-primary-v1';
export const MAX_NX_BYTES=2_000_000,MAX_HOURS=744;
const URLS={'nx-rate':'https://maplestory.market/api/nx-rate','nx-history':'https://maplestory.market/api/nx-rate/history?range=7d&step=hour'};
const HEX=/^[a-f0-9]{64}$/;
const RECEIPT=/^_private\/provider-api\/v1\/receipts\/([0-9]{12,16})-(nx-rate|nx-history)-([a-f0-9]{64})\.json$/;
export class NxProjectionContractError extends TypeError{}
export const check=(ok,code)=>{if(!ok)throw new NxProjectionContractError(code);};
export const byteSize=text=>new TextEncoder().encode(text).length;
export const byteHash=async text=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(v=>v.toString(16).padStart(2,'0')).join('');
const integer=(v,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const exact=(v,names)=>check(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join('|')===names.split(' ').sort().join('|'),'projection_fields');
const clock=v=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const hour=v=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:00:00Z$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().replace('.000Z','Z')===v;
const sourceClock=v=>v===null||typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().replace('.000Z','Z')===v;
function rate(v){check(v===null||typeof v==='number'&&Number.isFinite(v)&&v>0&&v<=Number.MAX_SAFE_INTEGER,'projection_rate');}
export function parseStored(text,max=MAX_NX_BYTES){check(typeof text==='string'&&byteSize(text)<=max,'stored_body_bound');try{parseStrictJson(text);return JSON.parse(text);}catch{throw new NxProjectionContractError('stored_json_contract');}}
export function validateCapture(c){
 exact(c,'captureId operation sourceUrl attemptId rawResponseSha256 rawResponseBytes requestStartedAt capturedAt sourceObservedAt captureTimeKind metadataCompleteness');
 check(Object.hasOwn(URLS,c.operation)&&c.sourceUrl===URLS[c.operation]&&integer(c.attemptId,1)&&HEX.test(c.rawResponseSha256)&&c.captureId===`${c.operation}:${c.attemptId}:${c.rawResponseSha256}`,'capture_identity');
 check(clock(c.capturedAt)&&c.sourceObservedAt===null&&c.captureTimeKind==='http_response_completed','capture_clock');
 if(c.metadataCompleteness==='complete_original_receipt')check(clock(c.requestStartedAt)&&c.requestStartedAt<=c.capturedAt&&integer(c.rawResponseBytes,1,5_000_000),'capture_request_context');
 else check(c.metadataCompleteness==='legacy_missing_request_metadata'&&c.requestStartedAt===null&&c.rawResponseBytes===null,'legacy_context');
 return c;
}
export function captureFromProjection(p){
 const operation=p.kind==='nx_offer_summary'?'nx-rate':p.kind==='nx_hourly_offer_history'?'nx-history':null;
 check(operation&&p.publicationEligible===false&&p.qualifiedIndividualTrades===0&&p.methodVersion==='maplemarket-nx-offers-actual-v1'&&p.unit==='mesos_per_NX'&&p.basis==='advertised_NX_offer_rates_not_completed_sales','accepted_nx_projection_required');
 return validateCapture({captureId:`${operation}:${p.attemptId}:${p.rawSha256}`,operation,sourceUrl:p.sourceUrl,attemptId:p.attemptId,rawResponseSha256:p.rawSha256,rawResponseBytes:p.rawBytes,requestStartedAt:p.requestStartedAt,capturedAt:p.capturedAt,sourceObservedAt:p.sourceObservedAt,captureTimeKind:p.captureTimeKind,metadataCompleteness:'complete_original_receipt'});
}
export function legacyCapture(row){
 const m=RECEIPT.exec(row.receipt_key??'');check(m&&m[2]===row.operation&&Number(m[1])===row.source_attempt&&m[3]===row.raw_sha,'legacy_receipt_binding');
 return validateCapture({captureId:`${row.operation}:${row.source_attempt}:${row.raw_sha}`,operation:row.operation,sourceUrl:URLS[row.operation],attemptId:row.source_attempt,rawResponseSha256:row.raw_sha,rawResponseBytes:null,requestStartedAt:null,capturedAt:row.captured_at,sourceObservedAt:null,captureTimeKind:'http_response_completed',metadataCompleteness:'legacy_missing_request_metadata'});
}
const COUNT_MEANING='publisher_reported_posters_within_this_bucket_or_summary_not_unique_across_time_not_trades';
export function validateStats(s,summary=false){
 if(s===null){check(summary,'missing_hour_stats');return s;}
 exact(s,`low median high ${summary?'mode':'p25 p75'} reportedPosterCount steps statisticsComplete countMeaning`);
 check(integer(s.reportedPosterCount)&&Array.isArray(s.steps)&&s.steps.length<=10000&&s.countMeaning===COUNT_MEANING,'stats_count');
 const fields=['low','median','high',...(summary?['mode']:['p25','p75'])];for(const k of fields)rate(s[k]);
 const ordered=(summary?['low','median','high']:['low','p25','median','p75','high']).map(k=>s[k]).filter(v=>v!==null);check(ordered.every((v,i)=>!i||v>=ordered[i-1]),'stats_order');
 let count=0,previous=0;for(const step of s.steps){exact(step,'rate reportedPosterCount');rate(step.rate);check(step.rate!==null&&step.rate>previous&&integer(step.reportedPosterCount,1),'stats_steps');previous=step.rate;count+=step.reportedPosterCount;}
 check(Number.isSafeInteger(count)&&count===s.reportedPosterCount&&s.statisticsComplete===fields.every(k=>s[k]!==null),'stats_integrity');
 check(count!==0||s.steps.length===0&&fields.every(k=>s[k]===null),'stats_zero_unknown');
 if(s.steps.length)check((s.low===null||s.low===s.steps[0].rate)&&(s.high===null||s.high===s.steps.at(-1).rate),'stats_extrema');return s;
}
function validateHour(row){
 exact(row,'at sourceEpochSeconds side low median high p25 p75 reportedPosterCount steps statisticsComplete countMeaning');
 check(hour(row.at)&&integer(row.sourceEpochSeconds,946684800,4133980800)&&row.sourceEpochSeconds*1000===Date.parse(row.at)&&['buy','sell'].includes(row.side),'hour_identity');
 const {at,sourceEpochSeconds,side,...stats}=row;validateStats(stats);return row;
}
function validateNative(s){
 exact(s,'buy sell reportedWindowHours sourceLimited sourceLastHeardAt lastHeardMeaning actualWindowStart actualWindowEnd');
 validateStats(s.buy,true);validateStats(s.sell,true);check(integer(s.reportedWindowHours,1,8784)&&typeof s.sourceLimited==='boolean'&&sourceClock(s.sourceLastHeardAt)&&s.lastHeardMeaning==='source_labelled_latest_heard_not_completed_trade_or_all_data_freshness'&&s.actualWindowStart===null&&s.actualWindowEnd===null,'native_summary_context');return s;
}
function percentile(bins,p){
 const entries=[...bins].sort((a,b)=>a[0]-b[0]),total=entries.reduce((n,[,v])=>n+v,0);check(Number.isSafeInteger(total),'derived_count_bound');if(!total)return null;
 const rank=index=>{let count=0;for(const [v,n]of entries){count+=n;if(index<count)return v;}throw new NxProjectionContractError('derived_rank');};
 const position=(total-1)*p,left=Math.floor(position),a=rank(left),b=rank(Math.min(left+1,total-1));return a+(b-a)*(position-left);
}
export function derive24(rows){
 const anchor=rows.length?rows.reduce((max,r)=>r.at>max?r.at:max,rows[0].at):null,lower=anchor?Date.parse(anchor)-23*3600000:null,sides={};
 for(const side of ['buy','sell']){const selected=rows.filter(r=>r.side===side&&lower!==null&&Date.parse(r.at)>=lower),bins=new Map();for(const row of selected)for(const step of row.steps)bins.set(step.rate,(bins.get(step.rate)||0)+step.reportedPosterCount);const count=[...bins.values()].reduce((a,b)=>a+b,0);check(Number.isSafeInteger(count),'derived_count_bound');sides[side]={p25:percentile(bins,.25),median:percentile(bins,.5),p75:percentile(bins,.75),posterHourObservations:selected.length?count:null,availableHourBuckets:selected.length,missingHourBuckets:24-selected.length};}
 return{kind:'derived_published_hourly_histogram_pool',sourceUrl:URLS['nx-history'],hours:24,anchorSourceHourLabel:anchor,firstSelectedSourceHourLabel:lower===null?null:new Date(lower).toISOString().replace('.000Z','Z'),sides,quantileMethod:'linear_interpolation_ordered_frequency_bins',counts:'poster_hour_observations_not_unique_people_or_trades',bucketCompletionKnown:false};
}
function baseProjection(trigger,captures,nativeSummary,history){return{schemaVersion:1,kind:'private_nx_offer_projection',methodVersion:NX_METHOD,publicationEligible:false,qualifiedIndividualTrades:0,sourceObservedAt:null,unit:'mesos_per_NX',basis:'advertised_NX_offer_rates_not_completed_sales',triggerCaptureId:trigger.captureId,captures,nativeSummary,hourlyHistory:history,derived24:derive24(history.rows),receiptWatermarkAt:captures.reduce((max,c)=>c.capturedAt>max?c.capturedAt:max,captures[0].capturedAt)};}
export function snapshotFromSql(ctx,trigger){
 validateCapture(trigger);const sql=ctx.storage.sql,row=(q,...a)=>sql.exec(q,...a).toArray()[0],captures=new Map([[trigger.captureId,trigger]]);
 function context(r,operation){
  check(r.operation===operation&&r.captured_at===r.capture_at&&r.source_attempt===r.capture_attempt,'sql_capture_binding');
  const legacy=legacyCapture({receipt_key:r.receipt_key,operation,source_attempt:r.source_attempt,raw_sha:r.raw_sha,captured_at:r.captured_at});
  const c=r.context_body?validateCapture(parseStored(r.context_body,5000)):legacy;
  check(c.captureId===legacy.captureId&&c.capturedAt===legacy.capturedAt,'sql_context_binding');captures.set(c.captureId,c);return c;
 }
 const join=`SELECT l.*,c.operation,c.raw_sha,c.captured_at AS capture_at,c.source_attempt AS capture_attempt,x.body AS context_body FROM private_nx_latest l JOIN private_nx_captures c ON c.receipt_key=l.receipt_key AND c.state='complete' LEFT JOIN private_nx_r2_capture_context x ON x.receipt_key=l.receipt_key`;
 const nativeBytes=row("SELECT COALESCE(SUM(length(CAST(body AS BLOB))),0) AS n FROM private_nx_latest WHERE source_url=? AND hour_label='native_summary' AND side='summary'",URLS['nx-rate']).n;
 check(integer(nativeBytes)&&nativeBytes<MAX_NX_BYTES,'native_body_bound');
 const nativeRow=row(join+" WHERE l.source_url=? AND l.hour_label='native_summary' AND l.side='summary'",URLS['nx-rate']);let nativeSummary=null;
 check(Boolean(nativeRow)===Boolean(row("SELECT 1 AS present FROM private_nx_latest WHERE source_url=? AND hour_label='native_summary' AND side='summary'",URLS['nx-rate'])),'native_capture_missing');
 if(nativeRow){const c=context(nativeRow,'nx-rate'),data=validateNative(parseStored(nativeRow.body));nativeSummary={sourceCaptureId:c.captureId,summary:data};}
 const anchor=row("SELECT MAX(hour_label) AS at FROM private_nx_latest WHERE source_url=? AND side IN ('buy','sell')",URLS['nx-history']).at??null;
 check(anchor===null||hour(anchor),'sql_anchor');const lower=anchor?new Date(Date.parse(anchor)-(MAX_HOURS-1)*3600000).toISOString().replace('.000Z','Z'):null;
 const total=row("SELECT COUNT(*) AS n FROM private_nx_latest WHERE source_url=? AND side IN ('buy','sell')",URLS['nx-history']).n;
 const budget=anchor?row("SELECT COUNT(*) AS n,COALESCE(SUM(length(CAST(body AS BLOB))),0) AS bytes,COUNT(DISTINCT receipt_key) AS captures FROM private_nx_latest WHERE source_url=? AND side IN ('buy','sell') AND hour_label>=?",URLS['nx-history'],lower):{n:0,bytes:0,captures:0};
 check([budget.n,budget.bytes,budget.captures].every(v=>integer(v))&&nativeBytes+budget.bytes+budget.n*192+(budget.captures+2)*1024+4096<=MAX_NX_BYTES,'sql_projection_budget');
 const selected=anchor?sql.exec(join+" WHERE l.source_url=? AND l.side IN ('buy','sell') AND l.hour_label>=? ORDER BY l.hour_label,l.side LIMIT ?",URLS['nx-history'],lower,MAX_HOURS*2+1).toArray():[];
 const selectedCount=anchor?row("SELECT COUNT(*) AS n FROM private_nx_latest WHERE source_url=? AND side IN ('buy','sell') AND hour_label>=?",URLS['nx-history'],lower).n:0;
 check(selected.length===selectedCount&&selected.length<=MAX_HOURS*2&&integer(total)&&total>=selected.length,'sql_hour_bound');
 const rows=selected.map(r=>{const c=context(r,'nx-history'),data=validateHour(parseStored(r.body));check(data.at===r.hour_label&&data.side===r.side,'sql_row_identity');const n=row('SELECT COUNT(*) AS n FROM private_nx_revisions WHERE source_url=? AND hour_label=? AND side=?',r.source_url,r.hour_label,r.side).n;check(integer(n,1),'sql_revision_count');return{...data,sourceCaptureId:c.captureId,changedRevisionCount:n};});
 check(selected.every(r=>r.source_url===URLS['nx-history']),'sql_history_source');
 const history={sourceUrl:URLS['nx-history'],requestedRange:'7d',requestedStep:'hour',maxSelectedHours:MAX_HOURS,selectionAnchorHourLabel:anchor,selectionFirstAllowedHourLabel:lower,totalRetainedSourceHourSideRows:total,omittedRetainedSourceHourSideRows:total-rows.length,rows,bucketCompletionKnown:false,sourceTimestampMeaning:'source_UTC_hour_label_not_individual_ad_or_trade_clock'};
 return baseProjection(trigger,[...captures.values()].sort((a,b)=>a.captureId.localeCompare(b.captureId,'en')),nativeSummary,history);
}
export async function sealProjection(unsigned){check(byteSize(JSON.stringify(unsigned))<=MAX_NX_BYTES-100,'projection_byte_bound');const dto={...unsigned,projectionHash:await portableHash(unsigned)};await validateProjection(dto);check(byteSize(JSON.stringify(dto))<=MAX_NX_BYTES,'projection_byte_bound');return dto;}
export async function validateProjection(dto){
 exact(dto,'schemaVersion kind methodVersion publicationEligible qualifiedIndividualTrades sourceObservedAt unit basis triggerCaptureId captures nativeSummary hourlyHistory derived24 receiptWatermarkAt projectionHash');
 check(dto.schemaVersion===1&&dto.kind==='private_nx_offer_projection'&&dto.methodVersion===NX_METHOD&&dto.publicationEligible===false&&dto.qualifiedIndividualTrades===0&&dto.sourceObservedAt===null&&dto.unit==='mesos_per_NX'&&dto.basis==='advertised_NX_offer_rates_not_completed_sales'&&HEX.test(dto.projectionHash),'projection_profile');
 check(Array.isArray(dto.captures)&&dto.captures.length>=1&&dto.captures.length<=MAX_HOURS*2+2,'projection_capture_bound');const captures=new Map();for(const c of dto.captures){validateCapture(c);check(!captures.has(c.captureId),'duplicate_capture');captures.set(c.captureId,c);}check(captures.has(dto.triggerCaptureId),'trigger_context');
 const usedCaptures=new Set([dto.triggerCaptureId]);
 if(dto.nativeSummary!==null){exact(dto.nativeSummary,'sourceCaptureId summary');check(captures.get(dto.nativeSummary.sourceCaptureId)?.operation==='nx-rate','native_source_context');usedCaptures.add(dto.nativeSummary.sourceCaptureId);validateNative(dto.nativeSummary.summary);}
 const h=dto.hourlyHistory;exact(h,'sourceUrl requestedRange requestedStep maxSelectedHours selectionAnchorHourLabel selectionFirstAllowedHourLabel totalRetainedSourceHourSideRows omittedRetainedSourceHourSideRows rows bucketCompletionKnown sourceTimestampMeaning');
 check(h.sourceUrl===URLS['nx-history']&&h.requestedRange==='7d'&&h.requestedStep==='hour'&&h.maxSelectedHours===MAX_HOURS&&h.bucketCompletionKnown===false&&h.sourceTimestampMeaning==='source_UTC_hour_label_not_individual_ad_or_trade_clock'&&Array.isArray(h.rows)&&h.rows.length<=MAX_HOURS*2&&integer(h.totalRetainedSourceHourSideRows)&&integer(h.omittedRetainedSourceHourSideRows)&&h.totalRetainedSourceHourSideRows===h.rows.length+h.omittedRetainedSourceHourSideRows,'history_profile');
 check(h.selectionAnchorHourLabel===null?h.rows.length===0:hour(h.selectionAnchorHourLabel),'history_anchor');
 const lower=h.selectionAnchorHourLabel?new Date(Date.parse(h.selectionAnchorHourLabel)-(MAX_HOURS-1)*3600000).toISOString().replace('.000Z','Z'):null;check(h.selectionFirstAllowedHourLabel===lower,'history_window');const identities=new Set();let previous='';
 for(const row of h.rows){exact(row,'at sourceEpochSeconds side low median high p25 p75 reportedPosterCount steps statisticsComplete countMeaning sourceCaptureId changedRevisionCount');const {sourceCaptureId,changedRevisionCount,...source}=row;validateHour(source);check(captures.get(sourceCaptureId)?.operation==='nx-history'&&integer(changedRevisionCount,1)&&row.at>=lower&&row.at<=h.selectionAnchorHourLabel,'hour_source_context');usedCaptures.add(sourceCaptureId);const key=row.at+'|'+row.side;check(!identities.has(key)&&key>=previous,'hour_dedup_order');identities.add(key);previous=key;}
 check(usedCaptures.size===captures.size,'unused_capture_context');
 check(await portableHash(dto.derived24)===await portableHash(derive24(h.rows)),'derived_mismatch');
 const watermark=dto.captures.reduce((max,c)=>c.capturedAt>max?c.capturedAt:max,dto.captures[0].capturedAt);check(dto.receiptWatermarkAt===watermark&&clock(watermark),'receipt_watermark');
 const {projectionHash,...body}=dto;check(await portableHash(body)===projectionHash,'projection_semantic_hash');return dto;
}
export function validateNxPointer(p){
 exact(p,'schemaVersion kind methodVersion ownerScope generation objectKey projectionHash objectSha256 objectBytes receiptWatermarkAt sourceObservedAt publicationEligible qualifiedIndividualTrades');
 check(p.schemaVersion===1&&p.kind==='private_nx_offer_projection_pointer'&&p.methodVersion===NX_METHOD&&p.ownerScope===NX_OWNER&&integer(p.generation,1)&&HEX.test(p.projectionHash)&&HEX.test(p.objectSha256)&&p.objectKey===NX_PREFIX+p.objectSha256+'.json'&&integer(p.objectBytes,1,MAX_NX_BYTES)&&clock(p.receiptWatermarkAt)&&p.sourceObservedAt===null&&p.publicationEligible===false&&p.qualifiedIndividualTrades===0,'pointer_binding');return p;
}
export async function boundedText(object,max=MAX_NX_BYTES){
 check(object&&integer(object.size)&&object.size<=max,'object_bound');let raw;
 if(object.body?.getReader){const reader=object.body.getReader(),parts=[];let size=0;try{while(true){const {done,value}=await reader.read();if(done)break;check(value instanceof Uint8Array,'object_stream_chunk');size+=value.byteLength;check(size<=max,'object_stream_bound');parts.push(value);}}catch(e){await reader.cancel().catch(()=>{});throw e;}finally{reader.releaseLock();}check(size===object.size,'object_stream_size');raw=new Uint8Array(size);let at=0;for(const part of parts){raw.set(part,at);at+=part.byteLength;}try{return new TextDecoder('utf-8',{fatal:true}).decode(raw);}catch{throw new NxProjectionContractError('object_utf8');}}
 const text=await object.text();check(typeof text==='string'&&byteSize(text)===object.size&&byteSize(text)<=max,'object_size');return text;
}
export async function readPrivateNxProjection(bucket){
 const pointer=validateNxPointer(parseStored(await boundedText(await bucket.get(NX_POINTER),8192),8192));
 const text=await boundedText(await bucket.get(pointer.objectKey));check(byteSize(text)===pointer.objectBytes&&await byteHash(text)===pointer.objectSha256,'projection_byte_integrity');
 const projection=await validateProjection(parseStored(text));check(projection.projectionHash===pointer.projectionHash&&projection.receiptWatermarkAt===pointer.receiptWatermarkAt,'pointer_projection_context');return{pointer,projection,text};
}
