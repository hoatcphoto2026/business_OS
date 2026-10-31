/**
 * Billing & Subscription enums – Phase 1 Plan Management + Subscription Lifecycle
 */

export enum PlanCode {
  FREE = 'free',
  STARTER = 'starter',
  PROFESSIONAL = 'professional',
  ENTERPRISE = 'enterprise',
}

export enum PlanFeatureCode {
  USERS = 'USERS',
  API_KEYS = 'API_KEYS',
  WEBHOOKS = 'WEBHOOKS',
  STORAGE_GB = 'STORAGE_GB',
  AI_REQUESTS = 'AI_REQUESTS',
}

export enum SubscriptionStatus {
  TRIAL = 'TRIAL',
  ACTIVE = 'ACTIVE',
  PAST_DUE = 'PAST_DUE',
  GRACE_PERIOD = 'GRACE_PERIOD',
  SUSPENDED = 'SUSPENDED',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
}

export enum BillingCycle {
  MONTHLY = 'MONTHLY',
  YEARLY = 'YEARLY',
}

/**
 * Allowed state transitions for the subscription lifecycle state machine.
 * Key = current status, value = set of valid next statuses.
 */
export const SUBSCRIPTION_TRANSITIONS: Record<SubscriptionStatus, SubscriptionStatus[]> = {
  [SubscriptionStatus.TRIAL]: [
    SubscriptionStatus.ACTIVE,
    SubscriptionStatus.EXPIRED,
    SubscriptionStatus.CANCELLED,
  ],
  [SubscriptionStatus.ACTIVE]: [
    SubscriptionStatus.PAST_DUE,
    SubscriptionStatus.CANCELLED,
    SubscriptionStatus.SUSPENDED, // manual admin
  ],
  [SubscriptionStatus.PAST_DUE]: [
    SubscriptionStatus.ACTIVE, // payment received
    SubscriptionStatus.GRACE_PERIOD,
    SubscriptionStatus.SUSPENDED,
    SubscriptionStatus.CANCELLED,
  ],
  [SubscriptionStatus.GRACE_PERIOD]: [
    SubscriptionStatus.ACTIVE,
    SubscriptionStatus.SUSPENDED,
    SubscriptionStatus.EXPIRED,
    SubscriptionStatus.CANCELLED,
  ],
  [SubscriptionStatus.SUSPENDED]: [
    SubscriptionStatus.ACTIVE, // reactivate after payment / admin
    SubscriptionStatus.EXPIRED,
    SubscriptionStatus.CANCELLED,
  ],
  [SubscriptionStatus.EXPIRED]: [
    SubscriptionStatus.ACTIVE, // reactivate
    SubscriptionStatus.CANCELLED,
  ],
  [SubscriptionStatus.CANCELLED]: [
    SubscriptionStatus.ACTIVE, // reactivate
    SubscriptionStatus.TRIAL, // rare, admin
  ],
};
