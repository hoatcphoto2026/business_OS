export enum ReportType {
  TENANT_ACTIVITY = 'TENANT_ACTIVITY',
  DEPARTMENT_ACTIVITY = 'DEPARTMENT_ACTIVITY',
  BILLING = 'BILLING',
  REVENUE = 'REVENUE',
  USAGE = 'USAGE',
  SECURITY = 'SECURITY',
  AUTOMATION = 'AUTOMATION',
}

export enum ReportFormat {
  CSV = 'CSV',
  EXCEL = 'EXCEL',
  PDF = 'PDF',
  JSON = 'JSON',
}

export enum ReportFrequency {
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  MONTHLY = 'MONTHLY',
}

export enum ReportChannel {
  EMAIL = 'EMAIL',
  WEBHOOK = 'WEBHOOK',
  IN_APP = 'IN_APP',
}

export enum ReportRunStatus {
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export enum ReportDeliveryStatus {
  SENT = 'SENT',
  FAILED = 'FAILED',
  SKIPPED = 'SKIPPED',
}

export const REPORT_TYPES: readonly ReportType[] = Object.values(ReportType);
