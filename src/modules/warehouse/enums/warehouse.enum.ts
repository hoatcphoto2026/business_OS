export enum WarehouseFactType {
  REVENUE = 'REVENUE',
  USAGE = 'USAGE',
  CUSTOMER = 'CUSTOMER',
  COMPLIANCE = 'COMPLIANCE',
  SECURITY = 'SECURITY',
}

export const WAREHOUSE_FACT_TYPES: readonly WarehouseFactType[] =
  Object.values(WarehouseFactType);

export enum WarehousePeriod {
  DAILY = 'DAILY',
  MONTHLY = 'MONTHLY',
}

export enum WarehouseTrendMetric {
  REVENUE = 'REVENUE',
  USAGE = 'USAGE',
  ACTIVE_USERS = 'ACTIVE_USERS',
  TICKETS = 'TICKETS',
  COMPLIANCE_SCORE = 'COMPLIANCE_SCORE',
  SECURITY_EVENTS = 'SECURITY_EVENTS',
}

export const WAREHOUSE_TREND_METRICS: readonly WarehouseTrendMetric[] =
  Object.values(WarehouseTrendMetric);
