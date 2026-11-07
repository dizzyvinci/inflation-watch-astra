// Default-OFF unregistered finite private pilot. ONE known owned receipt GET,
// never a provider request, discovery scan, source job, public route or scheduler.
import{ApiCollectorCore}from'./api-collector-core.mjs';
import{FIXED_FASHION,selectFixedFashionSource,fixedFashionExpectedPin}from'./fixed-fashion-listing-source.mjs';
import{parseListingChannel,originalNumberToken}from'./actor-free-listing-json.mjs';
import{bindFixedFashionListingWitness,projectOriginalListingEnvelope}from'./stamp-listing-projection.mjs';
const need=(v,c)=>{if(!v)throw TypeError(c)},encode=new TextEncoder();
export class FixedFashionListingPilot{
 constructor(ctx,core,{enabled=false,isEnabled=()=>true,waitMs=30000}={}){
  this.enabled=enabled===true;if(!this.enabled)return;need(core instanceof ApiCollectorCore&&core.ctx===ctx&&typeof isEnabled==='function'&&Number.isSafeInteger(waitMs)&&waitMs>=1&&waitMs<=30000,'pilot_options');
  this.ctx=ctx;this.core=core;this.isEnabled=isEnabled;this.waitMs=waitMs;const g=core.config();this.scope=Object.freeze({grant:g.grantReference,round:g.probeRound});this.bucket=core.env.API_RAW_RECEIPTS;need(this.bucket&&typeof this.bucket.get==='function','pilot_owned_bucket');this.flight=null;this.pending=null;this.readIssued=false;this.result=null;
 }
 get active(){if(!this.enabled)return false;try{const g=this.core.config();return this.isEnabled()===true&&g.enabled===true&&g.grantReference===this.scope.grant&&g.probeRound===this.scope.round&&this.core.env.API_RAW_RECEIPTS===this.bucket}catch{return false}}
 nextDue(){return null}
 inspect(){if(!this.active)return{status:'disabled'};try{const s=selectFixedFashionSource(this.ctx,this.core);return Object.freeze({status:'awaiting_root_expected_pin',pin:fixedFashionExpectedPin(s),ownedCompletedSQL:true,storageReads:0,providerCalls:0,sourceCapturedAt:null})}catch{return{status:'source_unavailable_or_review',storageReads:0,providerCalls:0}}}
 fence(expected,cancelled){need(!cancelled.value&&this.active,'pilot_paused');const source=selectFixedFashionSource(this.ctx,this.core);need(JSON.stringify(fixedFashionExpectedPin(source))===expected,'pilot_source_changed');return source;}
 async perform(expected,beforeIO,cancelled){
  let s=this.fence(expected,cancelled);need(typeof beforeIO==='function','pilot_recovery_required');await beforeIO(this.core.clock()+this.waitMs+1000);s=this.fence(expected,cancelled);this.readIssued=true;
  const object=await this.bucket.get(s.receiptKey);this.fence(expected,cancelled);need(object&&Number.isSafeInteger(object.size)&&object.size>=1&&object.size<=12582912&&object.body?.getReader,'pilot_bounded_receipt_stream');
  const reader=object.body.getReader(),parts=[];let size=0,chunks=0;try{for(;;){const v=await reader.read();need(!cancelled.value&&this.active,'pilot_paused');if(v.done)break;need(v.value instanceof Uint8Array&&++chunks<=1024,'pilot_stream_chunks');size+=v.value.length;need(size<=object.size&&size<=12582912,'pilot_stream_bound');parts.push(v.value)}}finally{reader.releaseLock()}
  need(size===object.size,'pilot_stream_size');const bytes=new Uint8Array(size);let pos=0;for(const p of parts){bytes.set(p,pos);pos+=p.length}
  const e=parseListingChannel(bytes,'envelope'),number=k=>{const token=originalNumberToken(e[k]);need(typeof token==='string'&&/^(?:0|[1-9][0-9]*)$/.test(token)&&BigInt(token)<=BigInt(Number.MAX_SAFE_INTEGER),'pilot_frame_number');return Number(token)},frame={};for(const k of 'operation sourceUrl httpStatus attemptId grantReference roundReference requestStartedAt capturedAt responseSha256 responseBytes sourceObservedAt'.split(' '))frame[k]=['httpStatus','attemptId','responseBytes'].includes(k)?number(k):e[k];
  this.fence(expected,cancelled);const witness=bindFixedFashionListingWitness(this.ctx,this.core,s.receiptKey,JSON.stringify(frame)),projection=await projectOriginalListingEnvelope(bytes,witness);this.fence(expected,cancelled);
  return Object.freeze({status:'private_fixed_fashion_schema_observed',itemId:FIXED_FASHION.itemId,knownReceiptReadVerified:true,ownedSourceRechecked:true,safeProjection:projection,copyEligibilityQualified:false,currencyUnitQualified:false,stockVerified:false,publicEligible:false,providerCalls:0,storageReads:1});
 }
 async normalizeOne(rootExpectedPinText,beforeIO){
  if(!this.active)return{status:'disabled'};if(this.result)return rootExpectedPinText===this.acceptedPin?this.result:{status:'root_expected_pin_mismatch',storageReads:0};if(this.flight)return{status:'busy'};if(this.pending)return{status:'underlying_read_pending'};if(this.readIssued)return{status:'finite_read_already_issued_hold'};
  if(typeof rootExpectedPinText!=='string'||encode.encode(rootExpectedPinText).length>4096)return{status:'root_expected_pin_required',storageReads:0};let pin;try{pin=JSON.parse(rootExpectedPinText);need(JSON.stringify(pin)===rootExpectedPinText,'canonical_root_pin');const inspected=this.inspect();need(inspected.status==='awaiting_root_expected_pin'&&JSON.stringify(inspected.pin)===rootExpectedPinText,'exact_independent_root_pin')}catch{return{status:'root_expected_pin_mismatch',storageReads:0}}
  this.acceptedPin=rootExpectedPinText;const cancelled={value:false};let timer;const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{cancelled.value=true;reject(TypeError('pilot_absolute_deadline'))},this.waitMs)}),task=this.perform(rootExpectedPinText,beforeIO,cancelled);this.flight=task;this.pending=task;task.then(()=>{if(this.pending===task)this.pending=null},()=>{if(this.pending===task)this.pending=null});
  try{this.result=await Promise.race([task,timeout]);return this.result}catch{return{status:'private_pilot_failed_or_paused_hold',storageReads:this.readIssued?1:0,providerCalls:0}}finally{clearTimeout(timer);if(this.flight===task)this.flight=null}
 }
}
