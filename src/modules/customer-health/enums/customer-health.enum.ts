export enum HealthLevel {
  HEALTHY = 'HEALTHY',
  WARNING = 'WARNING',
  AT_RISK = 'AT_RISK',
  CRITICAL = 'CRITICAL',
}

export enum HealthTrend {
  UP = 'UP',
  DOWN = 'DOWN',
  STABLE = 'STABLE',
}

export enum HealthSignalCode {
  LOGIN_FREQUENCY = 'LOGIN_FREQUENCY',
  ACTIVE_USERS = 'ACTIVE_USERS',
  USAGE_TREND = 'USAGE_TREND',
  SUPPORT_TICKETS = 'SUPPORT_TICKETS',
  FAILED_PAYMENTS = 'FAILED_PAYMENTS',
  RENEWAL_SUCCESS = 'RENEWAL_SUCCESS',
  SECURITY_EVENTS = 'SECURITY_EVENTS',
}

export interface HealthSignalDefinition {
  code: HealthSignalCode;
  name: string;
  weight: number;
  description: string;
}

/** Weights sum to 100 so the weighted score is already 0-100. */
export const HEALTH_SIGNAL_DEFINITIONS: HealthSignalDefinition[] = [
  {
    code: HealthSignalCode.LOGIN_FREQUENCY,
    name: 'Login frequency',
    weight: 15,
    description: 'Logins in the last 30 days',
  },
  {
    code: HealthSignalCode.ACTIVE_USERS,
    name: 'Active users',
    weight: 15,
    description: 'Active users in the last 30 days / active memberships',
  },
  {
    code: HealthSignalCode.USAGE_TREND,
    name: 'Usage trend',
    weight: 15,
    description: 'Usage quantity growth vs the previous 30 days',
  },
  {
    code: HealthSignalCode.SUPPORT_TICKETS,
    name: 'Support tickets',
    weight: 15,
    description: 'Open support tickets (more = worse)',
  },
  {
    code: HealthSignalCode.FAILED_PAYMENTS,
    name: 'Failed payments',
    weight: 15,
    description: 'Failed / chargeback payments in the last 30 days',
  },
  {
    code: HealthSignalCode.RENEWAL_SUCCESS,
    name: 'Renewal success',
    weight: 10,
    description: 'Latest subscription status (ACTIVE / PAST_DUE / CANCELLED)',
  },
  {
    code: HealthSignalCode.SECURITY_EVENTS,
    name: 'Security events',
    weight: 15,
    description: 'Unresolved HIGH/CRITICAL security events in the last 30 days',
  },
];

export const HEALTH_SIGNAL_CODES: readonly HealthSignalCode[] =
  Object.values(HealthSignalCode);
