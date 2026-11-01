export enum ExecutiveMetricCode {
  MRR = 'MRR',
  ARR = 'ARR',
  ARPU = 'ARPU',
  LTV = 'LTV',
  CUSTOMER_COUNT = 'CUSTOMER_COUNT',
  ACTIVE_USERS = 'ACTIVE_USERS',
  ACTIVE_TENANTS = 'ACTIVE_TENANTS',
  TRIAL_CONVERSIONS = 'TRIAL_CONVERSIONS',
  PAID_CONVERSIONS = 'PAID_CONVERSIONS',
  REVENUE_GROWTH = 'REVENUE_GROWTH',
  RETENTION_RATE = 'RETENTION_RATE',
  CHURN_RATE = 'CHURN_RATE',
}

export enum ExecutiveMetricUnit {
  CURRENCY = 'CURRENCY',
  COUNT = 'COUNT',
  PERCENT = 'PERCENT',
}

export enum SnapshotPeriod {
  DAILY = 'DAILY',
  MONTHLY = 'MONTHLY',
}

export const EXECUTIVE_METRIC_CODES: readonly ExecutiveMetricCode[] =
  Object.values(ExecutiveMetricCode);

export interface ExecutiveMetricDefinition {
  code: ExecutiveMetricCode;
  name: string;
  unit: ExecutiveMetricUnit;
  description: string;
}

export const EXECUTIVE_METRIC_DEFINITIONS: ExecutiveMetricDefinition[] = [
  {
    code: ExecutiveMetricCode.MRR,
    name: 'Monthly Recurring Revenue',
    unit: ExecutiveMetricUnit.CURRENCY,
    description: 'Sum of active subscriptions normalised to a monthly amount',
  },
  {
    code: ExecutiveMetricCode.ARR,
    name: 'Annual Recurring Revenue',
    unit: ExecutiveMetricUnit.CURRENCY,
    description: 'MRR x 12',
  },
  {
    code: ExecutiveMetricCode.ARPU,
    name: 'Average Revenue Per User',
    unit: ExecutiveMetricUnit.CURRENCY,
    description: 'MRR / paying tenants',
  },
  {
    code: ExecutiveMetricCode.LTV,
    name: 'Lifetime Value',
    unit: ExecutiveMetricUnit.CURRENCY,
    description: 'ARPU / monthly churn rate (24-month fallback when churn is 0)',
  },
  {
    code: ExecutiveMetricCode.CUSTOMER_COUNT,
    name: 'Customer Count',
    unit: ExecutiveMetricUnit.COUNT,
    description: 'Active + trial tenants',
  },
  {
    code: ExecutiveMetricCode.ACTIVE_USERS,
    name: 'Active Users',
    unit: ExecutiveMetricUnit.COUNT,
    description: 'Distinct users with a login in the last 30 days',
  },
  {
    code: ExecutiveMetricCode.ACTIVE_TENANTS,
    name: 'Active Tenants',
    unit: ExecutiveMetricUnit.COUNT,
    description: 'Distinct tenants with a login in the last 30 days',
  },
  {
    code: ExecutiveMetricCode.TRIAL_CONVERSIONS,
    name: 'Trial Conversions',
    unit: ExecutiveMetricUnit.COUNT,
    description: 'Subscriptions that converted from trial in the last 30 days',
  },
  {
    code: ExecutiveMetricCode.PAID_CONVERSIONS,
    name: 'Paid Conversions',
    unit: ExecutiveMetricUnit.COUNT,
    description: 'Direct paid subscriptions created in the last 30 days',
  },
  {
    code: ExecutiveMetricCode.REVENUE_GROWTH,
    name: 'Revenue Growth',
    unit: ExecutiveMetricUnit.PERCENT,
    description: 'MRR change vs the previous recorded snapshot',
  },
  {
    code: ExecutiveMetricCode.RETENTION_RATE,
    name: 'Retention Rate',
    unit: ExecutiveMetricUnit.PERCENT,
    description: 'Active tenants with a login in the last 30 days / customers',
  },
  {
    code: ExecutiveMetricCode.CHURN_RATE,
    name: 'Churn Rate',
    unit: ExecutiveMetricUnit.PERCENT,
    description: '100 - retention rate',
  },
];
