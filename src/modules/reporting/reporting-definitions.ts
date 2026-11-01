import { ReportType } from './enums/reporting.enum';

export interface ReportDefinition {
  type: ReportType;
  title: string;
  description: string;
  columns: string[];
  periodAware: boolean;
}

export const REPORT_DEFINITIONS: Record<ReportType, ReportDefinition> = {
  [ReportType.TENANT_ACTIVITY]: {
    type: ReportType.TENANT_ACTIVITY,
    title: 'Tenant Activity Report',
    description: 'Audit events, active members and logins for the tenant',
    columns: ['action', 'events'],
    periodAware: true,
  },
  [ReportType.DEPARTMENT_ACTIVITY]: {
    type: ReportType.DEPARTMENT_ACTIVITY,
    title: 'Department Activity Report',
    description: 'Headcount and audit activity per enterprise department',
    columns: ['code', 'name', 'members', 'events'],
    periodAware: true,
  },
  [ReportType.BILLING]: {
    type: ReportType.BILLING,
    title: 'Billing Report',
    description: 'Subscription state and invoice totals by status',
    columns: ['status', 'invoices', 'totalAmount', 'paidAmount'],
    periodAware: false,
  },
  [ReportType.REVENUE]: {
    type: ReportType.REVENUE,
    title: 'Revenue Report',
    description: 'Paid invoices by month plus payment provider breakdown',
    columns: ['month', 'invoices', 'revenue'],
    periodAware: true,
  },
  [ReportType.USAGE]: {
    type: ReportType.USAGE,
    title: 'Usage Report',
    description: 'Recorded usage quantities per metric',
    columns: ['metric', 'quantity', 'records'],
    periodAware: true,
  },
  [ReportType.SECURITY]: {
    type: ReportType.SECURITY,
    title: 'Security Report',
    description: 'Security events by type/severity, failed logins and alert triggers',
    columns: ['eventType', 'severity', 'events', 'openEvents'],
    periodAware: true,
  },
  [ReportType.AUTOMATION]: {
    type: ReportType.AUTOMATION,
    title: 'Automation Report',
    description: 'Workflow instances, scheduled jobs and job executions',
    columns: ['category', 'name', 'count'],
    periodAware: true,
  },
};

export const REPORT_CATALOG = Object.values(REPORT_DEFINITIONS);

export function reportDefinition(type: ReportType): ReportDefinition {
  const definition = REPORT_DEFINITIONS[type];
  if (!definition) {
    throw new Error(`Unknown report type: ${type}`);
  }
  return definition;
}
