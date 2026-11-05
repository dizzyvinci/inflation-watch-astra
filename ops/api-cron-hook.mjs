import {grantConfig, OWNER_NAME} from './api-collector-core.mjs';

// Scheduled-only schema probes, independent of the existing daily-source collector.
export async function maybeRunApprovedApiSchemaProbe(env) {
  let config;
  try {config = grantConfig(env);} catch {return {status: 'invalid_grant_configuration'};}
  if (!config.enabled) return {status: 'disabled'};
  if (!env.API_BUDGET_OWNER?.getByName) return {status: 'durable_owner_binding_missing'};
  const owner = env.API_BUDGET_OWNER.getByName(OWNER_NAME);
  await owner.enqueueProbeRound(config.probeRound);
  return owner.runOne();
}
