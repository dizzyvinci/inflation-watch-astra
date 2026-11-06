// Pure single-parse adaptation only. A capability proves profile/schema, never SQL ownership.
import {createOverviewSnapshot,overviewMembership,overviewIndex79Capture,OverviewDerivedProfileError,OverviewCapacityError} from './api-overview-snapshot.mjs';
import {definitionData,InvalidCalculation} from './api-index-calculations.mjs';
const STATE=new WeakMap();
export class OverviewAdapterCapabilityError extends TypeError{}
const get=handle=>{const value=STATE.get(handle);if(!value)throw new OverviewAdapterCapabilityError('overview_adaptation_capability');return value;};
export function isOverviewAdaptation(handle){return STATE.has(handle);}
export async function prepareOverviewAdaptation(raw,{expectedSha256,context,definition}={}){
 // Brand-check immutable definition before any await. The profile constructor owns
 // original bytes and the5context primitive values synchronously at call entry.
 definitionData(definition);
 const profile=await createOverviewSnapshot(raw,{expectedSha256,context});
 const membership=overviewMembership(profile);
 let calculation;
 try{calculation=Object.freeze({status:'ready',reason:null,capture:await overviewIndex79Capture(profile,{definition})});}
 catch(error){
  if(error instanceof OverviewCapacityError)calculation=Object.freeze({status:'derived_capacity_hold',reason:'optional_derived_capacity',capture:null});
  else if(error instanceof OverviewDerivedProfileError||error instanceof InvalidCalculation)calculation=Object.freeze({status:'derived_profile_review',reason:'optional_derived_profile',capture:null});
  else throw error;
 }
 const handle=Object.freeze({schemaVersion:1,kind:'overview_membership_and_index79_adaptation_not_owner_authority',profileHash:profile.profileHash,definitionHash:definition.definitionHash,source:profile.source,itemCount:profile.itemCount,itemDayCount:profile.itemDayCount,index79Status:calculation.status,sourceActorsExported:false,publicationEligible:false});
 STATE.set(handle,{membership,calculation,definition});return handle;
}
export function overviewMembershipFromAdaptation(handle){return get(handle).membership;}
export function overviewIndex79FromAdaptation(handle,{definition}={}){const value=get(handle);if(value.definition!==definition)throw new OverviewAdapterCapabilityError('overview_adaptation_definition_capability');return value.calculation;}
