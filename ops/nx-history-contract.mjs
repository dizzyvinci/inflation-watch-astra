// WORK-only pure contract and ledger prototype. No transport, alarms or activation.
import {validateCapture,legacyCapture,parseStored,validateStats,byteHash,byteSize} from './api-private-nx-projection.mjs';
export const SOURCE='https://maplestory.market/api/nx-rate/history?range=7d&step=hour';
export const CANONICAL_SOURCE='https://maplestory.market/ads?tab=services';
export const PREFIX='derived-api-nx-history/v1/',POINTER='_private/provider-api/v1/nx-history/v1/current.json';
export const MANIFEST_PATH='/api-nx-history.json',PAGE_PREFIX='/api-nx-history/';
export const LIMITS=Object.freeze({weeks:260,rows:87360,variants:1000000,variantsPerIdentity:4096,pageBytes:196608,manifestBytes:131072,rowsPerWeek:336});
const HEX=/^[a-f0-9]{64}$/,SIDES=['buy','sell'],FIELDS=['low','p25','median','p75','high'];
const check=(v,code)=>{if(!v)throw new TypeError(code);};
const shape=(v,keys)=>check(v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join('|')===keys.split(' ').sort().join('|'),'closed_fields');
const clock=v=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString()===v;
const hour=v=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:00:00Z$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().replace('.000Z','Z')===v;
const uint=(n,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(n)&&n>=0&&n<=max;
const value=v=>v===null||typeof v==='number'&&Number.isFinite(v)&&v>0&&v<=Number.MAX_SAFE_INTEGER;
export const identity=r=>r.at+'|'+r.side;
export function validateRow(r){
 shape(r,'at side capturedAt sourceObservedAt low p25 median p75 high reportedPosterCount statisticsComplete conflict');
 check(hour(r.at)&&SIDES.includes(r.side)&&clock(r.capturedAt)&&Date.parse(r.at)<=Date.parse(r.capturedAt)&&r.sourceObservedAt===null,'row_clock_identity');
 check(typeof r.conflict==='boolean'&&typeof r.statisticsComplete==='boolean'&&FIELDS.every(k=>value(r[k])),'row_rates');
 if(r.conflict)check(FIELDS.every(k=>r[k]===null)&&r.reportedPosterCount===null&&!r.statisticsComplete,'conflict_excluded');
 else{check(uint(r.reportedPosterCount)&&r.statisticsComplete===FIELDS.every(k=>r[k]!==null),'row_stats');const known=FIELDS.map(k=>r[k]).filter(v=>v!==null);check(known.every((v,i)=>!i||v>=known[i-1]),'row_order');if(!r.reportedPosterCount)check(!known.length,'zero_count_unknown');}
 return r;
}
// The future owner obtains this row through the specified COMPLETE-capture JOIN.
// This function checks its profile/bindings; accepting arbitrary caller objects is
// NOT an owner capability or a replacement for the proposed SQL-only scan.
export function curateCommittedSqlRow(input){
 const r=structuredClone(input);check(r.source_url===SOURCE&&r.operation==='nx-history'&&r.state==='complete'&&r.source_attempt===r.capture_attempt&&r.captured_at===r.capture_at,'committed_sql_binding');
 const legacy=legacyCapture({operation:r.operation,source_attempt:r.source_attempt,receipt_key:r.receipt_key,raw_sha:r.raw_sha,captured_at:r.captured_at}),capture=r.context_body?validateCapture(parseStored(r.context_body,5000)):legacy;
 check(capture.captureId===legacy.captureId&&capture.capturedAt===legacy.capturedAt,'original_capture_binding');
 const data=parseStored(r.body);shape(data,'at sourceEpochSeconds side low median high p25 p75 reportedPosterCount steps statisticsComplete countMeaning');
 check(data.at===r.hour_label&&data.side===r.side&&hour(data.at)&&uint(data.sourceEpochSeconds)&&data.sourceEpochSeconds>=946684800&&data.sourceEpochSeconds<=4133980800&&data.sourceEpochSeconds*1000===Date.parse(data.at),'source_hour_binding');
 const {at,sourceEpochSeconds,side,...stats}=data;validateStats(stats,false);
 return validateRow({at,side,capturedAt:capture.capturedAt,sourceObservedAt:null,...Object.fromEntries(FIELDS.map(k=>[k,stats[k]])),reportedPosterCount:stats.reportedPosterCount,statisticsComplete:stats.statisticsComplete,conflict:false});
}
export function emptyLedger(){return{schemaVersion:1,kind:'curated_nx_hour_side_revision_ledger',series:{}};}
const payload=r=>Object.fromEntries(['at','side',...FIELDS,'reportedPosterCount','statisticsComplete'].map(k=>[k,r[k]]));
// Prototype only; real owner must use indexed SQL and bounded batches, not clone
// a multi-year tree. Distinct semantic variants retain first/last confirmation.
// Canonical raw receipts/revisions remain the complete original capture ledger.
export function appendRows(input,incoming){
 const ledger=structuredClone(input??emptyLedger()),rows=structuredClone(incoming);check(rows.length<=4096,'bounded_prototype_batch');
 for(const row of rows){validateRow(row);check(!row.conflict,'accepted_input_required');const key=identity(row);let revisions=ledger.series[key];if(!revisions){check(Object.keys(ledger.series).length<LIMITS.rows,'archive_capacity_hold');revisions=ledger.series[key]=[];}
  const body=JSON.stringify(payload(row)),old=revisions.find(r=>r.body===body);if(old){old.firstCapturedAt=old.firstCapturedAt<row.capturedAt?old.firstCapturedAt:row.capturedAt;old.lastCapturedAt=old.lastCapturedAt>row.capturedAt?old.lastCapturedAt:row.capturedAt;}
  else{check(revisions.length<LIMITS.variantsPerIdentity,'revision_capacity_hold');revisions.push({body,firstCapturedAt:row.capturedAt,lastCapturedAt:row.capturedAt});}
 }
 check(Object.values(ledger.series).reduce((n,r)=>n+r.length,0)<=LIMITS.variants,'archive_capacity_hold');return ledger;
}
export function materialize(input){
 const ledger=structuredClone(input);check(ledger.schemaVersion===1&&ledger.kind==='curated_nx_hour_side_revision_ledger','ledger_kind');
 const rows=[];for(const [key,revisions]of Object.entries(ledger.series)){check(revisions.length>0&&revisions.length<=LIMITS.variantsPerIdentity,'revision_bound');const latest=revisions.reduce((a,r)=>a>r.lastCapturedAt?a:r.lastCapturedAt,''),winners=revisions.filter(r=>r.lastCapturedAt===latest),data=JSON.parse(winners[0].body);check(identity(data)===key,'ledger_identity');const conflict=winners.length>1;
  rows.push(validateRow({...data,capturedAt:latest,sourceObservedAt:null,...(conflict?Object.fromEntries(FIELDS.map(k=>[k,null])):{}),...(conflict?{reportedPosterCount:null,statisticsComplete:false}:{}),conflict}));
 }return rows.sort((a,b)=>identity(a).localeCompare(identity(b)));
}
export function weekOf(at){check(hour(at),'week_hour');const date=new Date(at),day=date.getUTCDay();date.setUTCDate(date.getUTCDate()-((day+6)%7));return date.toISOString().slice(0,10);}
export async function buildArchiveTree(input){
 const rows=structuredClone(input).map(validateRow).sort((a,b)=>identity(a).localeCompare(identity(b)));check(rows.length>0&&rows.length<=LIMITS.rows,'row_bound');let last='';const groups=new Map();for(const r of rows){check(identity(r)>last,'duplicate_hour_side');last=identity(r);const week=weekOf(r.at);if(!groups.has(week))groups.set(week,[]);groups.get(week).push(r);}check(groups.size<=LIMITS.weeks,'week_capacity_hold');
 const pages=[],objects=new Map();for(const [weekStartUtc,batch]of groups){check(batch.length<=LIMITS.rowsPerWeek,'week_row_bound');const document={schemaVersion:1,kind:'nx_offer_history_week',weekStartUtc,rows:batch},text=JSON.stringify(document),sha256=await byteHash(text);check(byteSize(text)<=LIMITS.pageBytes,'page_capacity_hold');objects.set(PREFIX+sha256+'.json',text);pages.push({weekStartUtc,firstHourLabel:batch[0].at,lastHourLabel:batch.at(-1).at,rowCount:batch.length,receiptWatermarkAt:batch.reduce((a,r)=>a>r.capturedAt?a:r.capturedAt,''),excludedConflictRows:batch.filter(r=>r.conflict).length,sha256,bytes:byteSize(text),url:PAGE_PREFIX+sha256+'.json'});}
 const manifest={schemaVersion:1,kind:'nx_offer_history_manifest',sourceIdentity:'maplestory_market_nx_offers',sourceUrl:SOURCE,coverageScope:'retained_curated_hour_side_rows_published_so_far',completeProviderHistory:false,unit:'mesos_per_NX',basis:'advertised_NX_offer_rates_not_completed_sales',sourceObservedAt:null,qualifiedIndividualTrades:0,bucketCompletionKnown:false,countMeaning:'poster_hour_observations_not_unique_people_or_trades',attribution:{label:'NX offers from maplestory.market',url:'https://maplestory.market/?ref=v6kkdvp6'},receiptWatermarkAt:rows.reduce((a,r)=>a>r.capturedAt?a:r.capturedAt,''),firstHourLabel:rows[0].at,lastHourLabel:rows.at(-1).at,rowCount:rows.length,excludedConflictRows:rows.filter(r=>r.conflict).length,pages};manifest.indexHash=await byteHash(JSON.stringify(manifest));const text=JSON.stringify(manifest);check(byteSize(text)<=LIMITS.manifestBytes,'manifest_capacity_hold');return{manifest,text,sha256:await byteHash(text),objects};
}
export async function validateManifest(input){
 const m=structuredClone(input);shape(m,'schemaVersion kind sourceIdentity sourceUrl coverageScope completeProviderHistory unit basis sourceObservedAt qualifiedIndividualTrades bucketCompletionKnown countMeaning attribution receiptWatermarkAt firstHourLabel lastHourLabel rowCount excludedConflictRows pages indexHash');
 check(m.schemaVersion===1&&m.kind==='nx_offer_history_manifest'&&m.sourceIdentity==='maplestory_market_nx_offers'&&m.sourceUrl===SOURCE&&m.coverageScope==='retained_curated_hour_side_rows_published_so_far'&&m.completeProviderHistory===false&&m.unit==='mesos_per_NX'&&m.basis==='advertised_NX_offer_rates_not_completed_sales'&&m.sourceObservedAt===null&&m.qualifiedIndividualTrades===0&&m.bucketCompletionKnown===false&&m.countMeaning==='poster_hour_observations_not_unique_people_or_trades','manifest_source');shape(m.attribution,'label url');check(m.attribution.label==='NX offers from maplestory.market'&&m.attribution.url==='https://maplestory.market/?ref=v6kkdvp6','credit');check(clock(m.receiptWatermarkAt)&&hour(m.firstHourLabel)&&hour(m.lastHourLabel)&&m.firstHourLabel<=m.lastHourLabel&&uint(m.rowCount,LIMITS.rows)&&m.rowCount>0&&uint(m.excludedConflictRows,m.rowCount)&&Array.isArray(m.pages)&&m.pages.length>0&&m.pages.length<=LIMITS.weeks&&HEX.test(m.indexHash),'manifest_bounds');
 let n=0,conflicts=0,last='';for(const d of m.pages){shape(d,'weekStartUtc firstHourLabel lastHourLabel rowCount receiptWatermarkAt excludedConflictRows sha256 bytes url');check(clock(d.receiptWatermarkAt)&&d.receiptWatermarkAt<=m.receiptWatermarkAt&&d.weekStartUtc>last&&weekOf(d.firstHourLabel)===d.weekStartUtc&&weekOf(d.lastHourLabel)===d.weekStartUtc&&d.firstHourLabel<=d.lastHourLabel&&HEX.test(d.sha256)&&uint(d.bytes,LIMITS.pageBytes)&&d.bytes>0&&uint(d.rowCount,LIMITS.rowsPerWeek)&&d.rowCount>0&&uint(d.excludedConflictRows,d.rowCount)&&d.url===PAGE_PREFIX+d.sha256+'.json','page_descriptor');last=d.weekStartUtc;n+=d.rowCount;conflicts+=d.excludedConflictRows;}
 check(m.receiptWatermarkAt===m.pages.reduce((a,d)=>a>d.receiptWatermarkAt?a:d.receiptWatermarkAt,'')&&n===m.rowCount&&conflicts===m.excludedConflictRows&&m.pages[0].firstHourLabel===m.firstHourLabel&&m.pages.at(-1).lastHourLabel===m.lastHourLabel,'manifest_coverage');const {indexHash,...body}=m;check(await byteHash(JSON.stringify(body))===indexHash,'manifest_semantic_hash');return m;
}
export async function validateWeek(text,descriptor,manifest){
 descriptor=structuredClone(descriptor);manifest=structuredClone(manifest);check(typeof text==='string','page_text');
 const m=await validateManifest(manifest);check(m.pages.some(d=>JSON.stringify(d)===JSON.stringify(descriptor)),'unknown_descriptor');check(byteSize(text)===descriptor.bytes&&await byteHash(text)===descriptor.sha256,'page_bytes');const page=parseStored(text,LIMITS.pageBytes);shape(page,'schemaVersion kind weekStartUtc rows');check(page.schemaVersion===1&&page.kind==='nx_offer_history_week'&&page.weekStartUtc===descriptor.weekStartUtc&&Array.isArray(page.rows)&&page.rows.length===descriptor.rowCount,'week_profile');let last='';for(const row of page.rows){validateRow(row);check(identity(row)>last&&weekOf(row.at)===descriptor.weekStartUtc&&row.capturedAt<=m.receiptWatermarkAt,'week_context');last=identity(row);}check(page.rows.reduce((a,r)=>a>r.capturedAt?a:r.capturedAt,'')===descriptor.receiptWatermarkAt&&page.rows[0].at===descriptor.firstHourLabel&&page.rows.at(-1).at===descriptor.lastHourLabel&&page.rows.filter(r=>r.conflict).length===descriptor.excludedConflictRows,'week_coverage');return page;
}
export async function manifestForPages(input){
 const pages=structuredClone(input).sort((a,b)=>a.weekStartUtc.localeCompare(b.weekStartUtc));check(pages.length>0,'empty_manifest');
 const m={schemaVersion:1,kind:'nx_offer_history_manifest',sourceIdentity:'maplestory_market_nx_offers',sourceUrl:SOURCE,coverageScope:'retained_curated_hour_side_rows_published_so_far',completeProviderHistory:false,unit:'mesos_per_NX',basis:'advertised_NX_offer_rates_not_completed_sales',sourceObservedAt:null,qualifiedIndividualTrades:0,bucketCompletionKnown:false,countMeaning:'poster_hour_observations_not_unique_people_or_trades',attribution:{label:'NX offers from maplestory.market',url:'https://maplestory.market/?ref=v6kkdvp6'},receiptWatermarkAt:pages.reduce((a,d)=>a>d.receiptWatermarkAt?a:d.receiptWatermarkAt,''),firstHourLabel:pages[0].firstHourLabel,lastHourLabel:pages.at(-1).lastHourLabel,rowCount:pages.reduce((n,d)=>n+d.rowCount,0),excludedConflictRows:pages.reduce((n,d)=>n+d.excludedConflictRows,0),pages};m.indexHash=await byteHash(JSON.stringify(m));await validateManifest(m);check(byteSize(JSON.stringify(m))<=LIMITS.manifestBytes,'manifest_capacity_hold');return m;
}
export function validatePointer(p){
 shape(p,'schemaVersion kind generation indexHash manifestSha256 manifestBytes manifestKey receiptWatermarkAt rowCount');
 check(p.schemaVersion===1&&p.kind==='private_nx_history_archive_pointer'&&Number.isSafeInteger(p.generation)&&p.generation>0&&HEX.test(p.indexHash)&&HEX.test(p.manifestSha256)&&p.manifestKey===PREFIX+p.manifestSha256+'.json'&&uint(p.manifestBytes,LIMITS.manifestBytes)&&p.manifestBytes>0&&clock(p.receiptWatermarkAt)&&uint(p.rowCount,LIMITS.rows)&&p.rowCount>0,'pointer_contract');return p;
}
