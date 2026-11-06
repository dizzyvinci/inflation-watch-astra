// Optional private parsing optimization. No new schedule, transport or authority.
import {parseStrictJson} from './api-price-item-dto.mjs';
import {OVERVIEW_PROFILE} from './api-overview-snapshot.mjs';
export function sharedOverviewConfiguration(env){
 const raw=env?.API_SHARED_OVERVIEW_PROFILE_JSON;
 if(raw===undefined)return{status:'disabled'};
 try{
  if(typeof raw!=='string'||raw.length>512)return{status:'invalid_configuration'};
  const value=parseStrictJson(raw),keys=Object.keys(value??{}).sort().join(',');
  if(keys==='enabled'&&value.enabled===false)return{status:'disabled'};
  if(keys!=='enabled,profileVersion,schemaVersion'||value.enabled!==true||value.schemaVersion!==1||value.profileVersion!==OVERVIEW_PROFILE)return{status:'invalid_configuration'};
  return{status:'ready',profileVersion:OVERVIEW_PROFILE};
 }catch{return{status:'invalid_configuration'};}
}
