export enum ForecastMetric {
  REVENUE = 'REVENUE',
  CUSTOMER_GROWTH = 'CUSTOMER_GROWTH',
  CHURN = 'CHURN',
  USAGE = 'USAGE',
  TICKET_VOLUME = 'TICKET_VOLUME',
}

export enum ForecastMethod {
  MOVING_AVERAGE = 'MOVING_AVERAGE',
  TREND_PROJECTION = 'TREND_PROJECTION',
  SEASONAL_ANALYSIS = 'SEASONAL_ANALYSIS',
}

export enum ForecastRunStatus {
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export enum ForecastModelStatus {
  ACTIVE = 'ACTIVE',
  DISABLED = 'DISABLED',
}

export const FORECAST_METRICS: readonly ForecastMetric[] =
  Object.values(ForecastMetric);

export const FORECAST_METHODS: readonly ForecastMethod[] =
  Object.values(ForecastMethod);

/** Required output horizons (days). */
export const FORECAST_HORIZONS: readonly number[] = [30, 90, 365];

export interface ForecastMetricDefinition {
  metric: ForecastMetric;
  label: string;
  unit: 'CURRENCY' | 'COUNT';
  description: string;
}

export const FORECAST_METRIC_DEFINITIONS: ForecastMetricDefinition[] = [
  {
    metric: ForecastMetric.REVENUE,
    label: 'Revenue',
    unit: 'CURRENCY',
    description: 'Daily paid billing revenue across all tenants',
  },
  {
    metric: ForecastMetric.CUSTOMER_GROWTH,
    label: 'Customer Growth',
    unit: 'COUNT',
    description: 'New tenants created per day',
  },
  {
    metric: ForecastMetric.CHURN,
    label: 'Churn',
    unit: 'COUNT',
    description: 'Subscriptions cancelled per day',
  },
  {
    metric: ForecastMetric.USAGE,
    label: 'Usage',
    unit: 'COUNT',
    description: 'Total recorded usage quantity per day',
  },
  {
    metric: ForecastMetric.TICKET_VOLUME,
    label: 'Ticket Volume',
    unit: 'COUNT',
    description: 'Support tickets opened per day',
  },
];
