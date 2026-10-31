export enum AuditCategory {
  AUTHENTICATION = 'AUTHENTICATION',
  AUTHORIZATION = 'AUTHORIZATION',
  BILLING = 'BILLING',
  SUBSCRIPTION = 'SUBSCRIPTION',
  PAYMENT = 'PAYMENT',
  SUPPORT = 'SUPPORT',
  AUTOMATION = 'AUTOMATION',
  SECURITY = 'SECURITY',
}

export const AUDIT_CATEGORIES: readonly AuditCategory[] = Object.values(AuditCategory);

export enum RetentionPolicyCode {
  DAYS_90 = 'DAYS_90',
  DAYS_180 = 'DAYS_180',
  DAYS_365 = 'DAYS_365',
  CUSTOM = 'CUSTOM',
}

export enum AuditExportFormat {
  CSV = 'csv',
  EXCEL = 'excel',
  PDF = 'pdf',
}

export enum ComplianceReportType {
  USER_ACTIVITY = 'user-activity',
  BILLING_ACTIVITY = 'billing-activity',
  SECURITY_EVENTS = 'security-events',
  SUSPICIOUS_ACTIVITY = 'suspicious-activity',
}

export function categoryFor(entityType: string, action: string): AuditCategory {
  const entity = entityType.toLowerCase();
  const act = action.toUpperCase();
  if (act === 'LOGIN' || act === 'LOGOUT' || entity === 'session') {
    return AuditCategory.AUTHENTICATION;
  }
  if (entity.includes('payment')) return AuditCategory.PAYMENT;
  if (entity.includes('subscription') || entity === 'plan') return AuditCategory.SUBSCRIPTION;
  if (entity.includes('invoice') || entity.includes('billing') || entity.includes('coupon')) {
    return AuditCategory.BILLING;
  }
  if (entity.includes('support') || entity.includes('ticket')) return AuditCategory.SUPPORT;
  if (
    entity.includes('workflow') ||
    entity.includes('automation') ||
    entity.includes('rule') ||
    entity.includes('job')
  ) {
    return AuditCategory.AUTOMATION;
  }
  if (
    entity.includes('role') ||
    entity.includes('permission') ||
    entity.includes('rbac')
  ) {
    return AuditCategory.AUTHORIZATION;
  }
  return AuditCategory.SECURITY;
}
