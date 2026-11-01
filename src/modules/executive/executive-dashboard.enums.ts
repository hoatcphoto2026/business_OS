export enum WidgetKey {
  REVENUE = 'REVENUE',
  GROWTH = 'GROWTH',
  CUSTOMERS = 'CUSTOMERS',
  COMPLIANCE = 'COMPLIANCE',
  SECURITY = 'SECURITY',
  AUTOMATION = 'AUTOMATION',
  OPERATIONS = 'OPERATIONS',
}

export enum WidgetStatus {
  OK = 'OK',
  WARNING = 'WARNING',
  CRITICAL = 'CRITICAL',
}

export enum ExecutiveAlertType {
  REVENUE_DROP = 'REVENUE_DROP',
  CHURN_SPIKE = 'CHURN_SPIKE',
  SECURITY_SPIKE = 'SECURITY_SPIKE',
  SYSTEM_RISK = 'SYSTEM_RISK',
}

export enum ExecutiveAlertSeverity {
  WARNING = 'WARNING',
  CRITICAL = 'CRITICAL',
}

export const WIDGET_KEYS: readonly WidgetKey[] = Object.values(WidgetKey);
export const EXECUTIVE_ALERT_TYPES: readonly ExecutiveAlertType[] =
  Object.values(ExecutiveAlertType);
