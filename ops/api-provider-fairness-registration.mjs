// Optional same-owner factory registration; absent/Off has no owner/core/SQL access.
import {OWNER_NAME} from './api-collector-core.mjs';
export const PROVIDER_FAIRNESS_CONTRACT_SHA='b0307fa8f3f60ff8f605cf9d367c1ab9f9b49aa9dfedf11444775e0d00a1959e';
const REGISTRATIONS=new WeakMap();
export function isOwnedProviderFairnessRegistration(value,ctx,core,mux){const b=REGISTRATIONS.get(value);return !!b&&b.ctx===ctx&&b.core===core&&b.mux===mux&&core.ctx===ctx&&mux.ctx===ctx&&mux.core===core;}
const POLICY='three_bulk_one_registered_oldest_available_v1',REF=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/;
function compact(text){let out='',quoted=false,escaped=false;for(const c of text){if(quoted){out+=c;if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;}else if(c==='"'){quoted=true;out+=c;}else if(!/[\x20\t\r\n]/.test(c))out+=c;}return out;}
export function providerFairnessConfiguration(env){
 try{const raw=env?.API_PROVIDER_FAIRNESS_JSON;if(raw===undefined)return Object.freeze({status:'disabled'});if(typeof raw!=='string'||raw.length>2048)return Object.freeze({status:'invalid'});const v=JSON.parse(raw);if(JSON.stringify(v)!==compact(raw))return Object.freeze({status:'invalid'});if(v&&Object.keys(v).join(',')==='enabled'&&v.enabled===false)return Object.freeze({status:'disabled'});
 if(!v||Array.isArray(v)||Object.keys(v).sort().join('|')!=='approvalRecorded|contractSha256|enabled|maxEligibleDerivedDeferral|policy|sameGrant|sameOwner|sameRound|schemaVersion'||v.schemaVersion!==1||v.enabled!==true||v.approvalRecorded!==true||v.contractSha256!==PROVIDER_FAIRNESS_CONTRACT_SHA||v.policy!==POLICY||v.maxEligibleDerivedDeferral!==2||v.sameOwner!==OWNER_NAME||typeof v.sameGrant!=='string'||!REF.test(v.sameGrant)||typeof v.sameRound!=='string'||!REF.test(v.sameRound))return Object.freeze({status:'invalid'});
 return Object.freeze({status:'ready',value:Object.freeze({...v})});}catch{return Object.freeze({status:'invalid'});}
}
export function createProviderFairnessRegistration(owner,env,enable){
 const cfg=providerFairnessConfiguration(env);if(cfg.status==='disabled')return null;if(cfg.status!=='ready')return Object.freeze({status:'configuration_review',enabled:false});
 try{const core=owner?.core,mux=owner?.privateCash,ctx=owner?.ctx;if(!core||!mux||core.ctx!==ctx||mux.ctx!==ctx||mux.core!==core||core.env!==env||mux.env!==env||!mux.hasMux||typeof enable!=='function')return Object.freeze({status:'same_owner_review',enabled:false});
 const captured=JSON.stringify(cfg.value),matches=()=>{const current=providerFairnessConfiguration(env);if(current.status!=='ready'||JSON.stringify(current.value)!==captured)return false;try{const grant=core.config();return grant.enabled===true&&grant.grantReference===cfg.value.sameGrant&&grant.probeRound===cfg.value.sameRound;}catch{return false;}};
 if(!matches())return Object.freeze({status:'scope_review',enabled:false});
 // Only ordinary writable/absent flags owned by these genuine instances may be adapted.
 for(const[obj,key]of[[core,'fairClaims'],[core,'fairMuxClaims'],[mux,'fairProviderTurns']]){const d=Object.getOwnPropertyDescriptor(obj,key);if(d&&(!d.configurable||!('value'in d)||typeof d.value!=='boolean'))return Object.freeze({status:'flag_review',enabled:false});}
 enable(owner);let live=true;const enabled=()=>live&&matches();
 try{for(const[obj,key]of[[core,'fairClaims'],[core,'fairMuxClaims'],[mux,'fairProviderTurns']])Object.defineProperty(obj,key,{get:enabled,enumerable:true,configurable:true});}catch{live=false;for(const[obj,key]of[[core,'fairClaims'],[core,'fairMuxClaims'],[mux,'fairProviderTurns']]){try{Object.defineProperty(obj,key,{value:false,writable:true,enumerable:true,configurable:true});}catch{}}return Object.freeze({status:'flag_review',enabled:false});}
 const result=Object.freeze({status:'ready',get enabled(){return enabled();},admittedPolicy:cfg.value,policy:POLICY,maxEligibleDerivedDeferral:2});REGISTRATIONS.set(result,{ctx,core,mux});return result;
 }catch{return Object.freeze({status:'initialization_review',enabled:false});}
}
