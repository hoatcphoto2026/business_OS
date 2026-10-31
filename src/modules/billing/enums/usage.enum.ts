/**
 * Usage metrics tracked by the Usage Tracking module.
 */
export enum UsageMetric {
  ACTIVE_USERS = 'ACTIVE_USERS',
  API_CALLS = 'API_CALLS',
  WEBHOOKS = 'WEBHOOKS',
  STORAGE_GB = 'STORAGE_GB',
  AI_REQUESTS = 'AI_REQUESTS',
}

export const USAGE_METRICS: readonly UsageMetric[] = Object.values(UsageMetric);
