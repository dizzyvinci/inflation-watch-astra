import {providerFairnessConfiguration,isOwnedProviderFairnessRegistration} from './api-provider-fairness-registration.mjs';
import {scheduleConfig} from './api-alarm-scheduler.mjs';

const TIME_MAX=8640000000000000;
const time=v=>Number.isSafeInteger(v)&&v>=0&&v<TIME_MAX;
const integer=v=>Number.isSafeInteger(v)&&v>=0;
const iso=v=>v===null?null:time(v)?new Date(v).toISOString():null;
const DERIVED=['private','public','nx','nx-r2','items','history','discovery','registry','nx-history','calculations'];
const STATES=['pending','running','complete','unavailable','failed','auth_stopped'];
const boundedTime=(column,alias)=>`CASE WHEN typeof(${column})='integer' AND ${column}>=0 AND ${column}<${TIME_MAX} THEN ${column} END ${alias}`;

// Private SQL-only owner diagnostics. No schema, source, alarm, history, key or I/O action.
export function privateProviderFairnessHealth(core,env,options={}){
  const cfg=providerFairnessConfiguration(env);
  if(cfg.status!=='ready')return null;
  const {delegate=null,checkedAt}=options;
  const parsed=typeof checkedAt==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(checkedAt)?Date.parse(checkedAt):NaN;
  const checkedMs=time(parsed)&&new Date(parsed).toISOString()===checkedAt?parsed:NaN;
  const base={diagnosticVersion:1,profile:'provider_service_opportunity_v1',
    clockKind:'operator_queue_state_not_market_observation',operatorCheckedAt:time(checkedMs)?new Date(checkedMs).toISOString():null,
    sameOwner:cfg.value.sameOwner,sameGrant:cfg.value.sameGrant,sameRound:cfg.value.sameRound,
    contractSha256:cfg.value.contractSha256,policy:cfg.value.policy,maxEligibleDerivedDeferral:2,
    remoteAvailability:'not_checked',sourceFreshness:'not_checked',nativeResourceHeadroom:'not_checked'};
  const fail=status=>({...base,status,coupledPolicyActive:false,claimState:null,muxState:null,scheduleEnabled:null,scheduledOperations:null});
  if(!time(checkedMs))return fail('diagnostic_unavailable');
  try{
    const reg=delegate?.registration,mux=delegate?.mux;
    if(!reg||!isOwnedProviderFairnessRegistration(reg,core.ctx,core,mux)||reg.status!=='ready'||reg.enabled!==true||core.fairClaims!==true||core.fairMuxClaims!==true||mux.fairProviderTurns!==true)
      return fail('registration_unavailable');
    const grant=core.config();
    if(!grant.enabled||grant.grantReference!==cfg.value.sameGrant||grant.probeRound!==cfg.value.sameRound)return fail('registration_unavailable');
    const c=core.row(`SELECT CASE WHEN last_claim_class IN ('bulk','registered') THEN last_claim_class END last_claim_class,
      CASE WHEN last_claim_class IS NULL OR last_claim_class IN ('bulk','registered') THEN 1 ELSE 0 END last_class_valid,
      CASE WHEN typeof(bulk_claim_streak)='integer' AND bulk_claim_streak BETWEEN 0 AND 3 THEN bulk_claim_streak END bulk_claim_streak
      FROM api_control WHERE id=1`);
    const m=core.row(`SELECT CASE WHEN typeof(provider_turn_debt)='integer' AND provider_turn_debt BETWEEN 0 AND 2 THEN provider_turn_debt END provider_turn_debt,
      CASE WHEN last_derived_kind IN (${DERIVED.map(()=>'?').join(',')}) THEN last_derived_kind END last_derived_kind,
      CASE WHEN last_derived_kind IS NULL OR last_derived_kind IN (${DERIVED.map(()=>'?').join(',')}) THEN 1 ELSE 0 END derived_kind_valid,
      ${boundedTime('provider_at','provider_at')},CASE WHEN provider_at IS NULL THEN 1 ELSE 0 END provider_at_null
      FROM api_cash_alarm_mux WHERE id=1`,...DERIVED,...DERIVED);
    if(!c||c.last_class_valid!==1||!integer(c.bulk_claim_streak)||!m||!integer(m.provider_turn_debt)||m.derived_kind_valid!==1||m.provider_at_null!==1&&!time(m.provider_at))return fail('diagnostic_unavailable');
    const schedule=scheduleConfig(env);let rows=[];
    if(schedule.enabled){
      rows=core.sql.exec(`SELECT CASE WHEN typeof(e.operation)='text' AND length(CAST(e.operation AS BLOB))<=64 THEN e.operation END operation,
        ${boundedTime('e.interval_ms','interval_ms')},${boundedTime('e.next_due','next_due')},
        CASE WHEN typeof(e.skipped_intervals)='integer' AND e.skipped_intervals BETWEEN 0 AND 9007199254740991 THEN e.skipped_intervals END skipped_intervals,
        CASE WHEN e.active_job_key IS NULL THEN 0 WHEN typeof(e.active_job_key)='text' AND length(CAST(e.active_job_key AS BLOB))<=160 THEN 1 ELSE -1 END active_key_state,
        CASE WHEN j.state IN (${STATES.map(()=>'?').join(',')}) THEN j.state END job_state,
        ${boundedTime('j.available_at','available_at')},${boundedTime('j.lease_until','lease_until')},
        CASE WHEN j.lease_until IS NULL THEN 1 ELSE 0 END lease_until_null
        FROM api_alarm_events e LEFT JOIN api_jobs j ON j.job_key=CASE WHEN typeof(e.active_job_key)='text' AND length(CAST(e.active_job_key AS BLOB))<=160 THEN e.active_job_key END
          AND j.operation=e.operation AND j.round_ref=?
        WHERE e.schedule_ref=? ORDER BY e.operation LIMIT 9`,...STATES,cfg.value.sameRound,schedule.scheduleReference).toArray();
      const configured=new Map(schedule.recurring.map(r=>[r.operation,r]));
      if(rows.length>8||new Set(rows.map(r=>r.operation)).size!==rows.length||rows.some(r=>!configured.has(r.operation)||r.interval_ms!==configured.get(r.operation).intervalSeconds*1000||!time(r.next_due)||!integer(r.skipped_intervals)||![-1,0,1].includes(r.active_key_state)||r.active_key_state<0))return fail('diagnostic_unavailable');
      for(const r of rows){if(r.active_key_state===1&&(!STATES.includes(r.job_state)||!time(r.available_at)||r.lease_until_null!==1&&!time(r.lease_until)))return fail('diagnostic_unavailable');}
    }
    const byOperation=new Map(rows.map(r=>[r.operation,r]));
    const scheduled=schedule.enabled?schedule.recurring.map(r=>{const stored=byOperation.get(r.operation);return{operation:r.operation,intervalSeconds:r.intervalSeconds,
      scheduleState:stored?'present':'not_present',nextDueAt:stored?iso(stored.next_due):null,
      activeJobState:stored?.active_key_state===1?stored.job_state:null,
      activeJobAvailableAt:stored?.active_key_state===1?iso(stored.available_at):null,
      activeJobDueAgeMs:stored?.active_key_state===1&&stored.job_state==='pending'?Math.max(0,checkedMs-stored.available_at):null,
      activeLeaseUntil:stored?.active_key_state===1?iso(stored.lease_until):null,
      skippedScheduleIntervals:stored?stored.skipped_intervals:null};}):[];
    return{...base,status:'ready',coupledPolicyActive:true,
      claimState:{lastClass:c.last_claim_class,bulkStreak:c.bulk_claim_streak},
      muxState:{providerTurnDebt:m.provider_turn_debt,lastDerivedKind:m.last_derived_kind,providerAt:iso(m.provider_at)},
      scheduleEnabled:schedule.enabled,scheduledOperations:scheduled};
  }catch{return fail('diagnostic_unavailable');}
}
