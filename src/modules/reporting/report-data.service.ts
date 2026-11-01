import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ReportType } from './enums/reporting.enum';

export interface ReportData {
  summary: Record<string, unknown>;
  rows: Array<Record<string, unknown>>;
}

function numeric(value: unknown): number {
  if (value == null) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Builds the seven built-in reports directly from tenant-scoped SQL.
 * Every query pins `tenant_id`; period filters are inclusive.
 */
@Injectable()
export class ReportDataService {
  constructor(private readonly dataSource: DataSource) {}

  async build(
    type: ReportType,
    tenantId: string,
    from: Date,
    to: Date,
  ): Promise<ReportData> {
    switch (type) {
      case ReportType.TENANT_ACTIVITY:
        return this.tenantActivity(tenantId, from, to);
      case ReportType.DEPARTMENT_ACTIVITY:
        return this.departmentActivity(tenantId, from, to);
      case ReportType.BILLING:
        return this.billing(tenantId);
      case ReportType.REVENUE:
        return this.revenue(tenantId, from, to);
      case ReportType.USAGE:
        return this.usage(tenantId, from, to);
      case ReportType.SECURITY:
        return this.security(tenantId, from, to);
      case ReportType.AUTOMATION:
        return this.automation(tenantId, from, to);
      default:
        throw new Error(`Unsupported report type: ${type as string}`);
    }
  }

  private async tenantActivity(
    tenantId: string,
    from: Date,
    to: Date,
  ): Promise<ReportData> {
    const [totals] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS events,
              COUNT(DISTINCT performed_by)::int AS actors
         FROM audit_logs
        WHERE tenant_id = $1 AND created_at BETWEEN $2 AND $3`,
      [tenantId, from, to],
    );
    const byAction: Array<{ action: string; events: number }> =
      await this.dataSource.query(
        `SELECT action, COUNT(*)::int AS events
           FROM audit_logs
          WHERE tenant_id = $1 AND created_at BETWEEN $2 AND $3
          GROUP BY action ORDER BY events DESC, action`,
        [tenantId, from, to],
      );
    const [members] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS active_members
         FROM tenant_users WHERE tenant_id = $1 AND status = 'active'`,
      [tenantId],
    );
    const [logins] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS logins
         FROM login_histories
        WHERE tenant_id = $1 AND login_at BETWEEN $2 AND $3`,
      [tenantId, from, to],
    );

    return {
      rows: byAction as unknown as Array<Record<string, unknown>>,
      summary: {
        totalEvents: totals.events,
        distinctActors: totals.actors,
        activeMembers: members.active_members,
        logins: logins.logins,
        topActions: byAction.slice(0, 3).map((row) => row.action),
      },
    };
  }

  private async departmentActivity(
    tenantId: string,
    from: Date,
    to: Date,
  ): Promise<ReportData> {
    const rows: Array<{
      code: string;
      name: string;
      members: number;
      events: number;
    }> = await this.dataSource.query(
      `SELECT d.code, d.name,
              COUNT(DISTINCT m.user_id)::int AS members,
              COUNT(DISTINCT a.id)::int AS events
         FROM enterprise_departments d
         LEFT JOIN org_memberships m
           ON m.tenant_id = d.tenant_id AND m.department_id = d.id
         LEFT JOIN audit_logs a
           ON a.tenant_id = d.tenant_id
          AND a.performed_by = m.user_id
          AND a.created_at BETWEEN $2 AND $3
        WHERE d.tenant_id = $1
        GROUP BY d.id, d.code, d.name
        ORDER BY d.name`,
      [tenantId, from, to],
    );

    return {
      rows: rows as unknown as Array<Record<string, unknown>>,
      summary: {
        departments: rows.length,
        members: rows.reduce((sum, row) => sum + row.members, 0),
        events: rows.reduce((sum, row) => sum + row.events, 0),
      },
    };
  }

  private async billing(tenantId: string): Promise<ReportData> {
    const invoices: Array<{
      status: string;
      invoices: number;
      totalAmount: string;
      paidAmount: string;
    }> = await this.dataSource.query(
      `SELECT status,
              COUNT(*)::int AS invoices,
              COALESCE(SUM(total), 0)::numeric AS "totalAmount",
              COALESCE(SUM(amount_paid), 0)::numeric AS "paidAmount"
         FROM billing_invoices
        WHERE tenant_id = $1
        GROUP BY status ORDER BY status`,
      [tenantId],
    );
    const [subscription] = await this.dataSource.query(
      `SELECT s.status, s.billing_cycle AS "billingCycle",
              p.code AS "planCode", p.name AS "planName",
              p.monthly_price::numeric AS "monthlyPrice"
         FROM subscriptions s
         JOIN plans p ON p.id = s.plan_id
        WHERE s.tenant_id = $1
        ORDER BY s.created_at DESC
        LIMIT 1`,
      [tenantId],
    );

    return {
      rows: invoices as unknown as Array<Record<string, unknown>>,
      summary: {
        subscription: subscription
          ? {
              ...subscription,
              monthlyPrice: numeric(subscription.monthlyPrice),
            }
          : null,
        invoiceCount: invoices.reduce((sum, row) => sum + row.invoices, 0),
        totalAmount: invoices.reduce((sum, row) => sum + numeric(row.totalAmount), 0),
        paidAmount: invoices.reduce((sum, row) => sum + numeric(row.paidAmount), 0),
        overdueInvoices:
          invoices.find((row) => row.status === 'OVERDUE')?.invoices ?? 0,
      },
    };
  }

  private async revenue(
    tenantId: string,
    from: Date,
    to: Date,
  ): Promise<ReportData> {
    const rows: Array<{ month: string; invoices: number; revenue: string }> =
      await this.dataSource.query(
        `SELECT to_char(date_trunc('month', paid_at), 'YYYY-MM') AS month,
                COUNT(*)::int AS invoices,
                COALESCE(SUM(amount_paid), 0)::numeric AS revenue
           FROM billing_invoices
          WHERE tenant_id = $1
            AND status = 'PAID'
            AND paid_at IS NOT NULL
            AND paid_at BETWEEN $2 AND $3
          GROUP BY 1 ORDER BY 1`,
        [tenantId, from, to],
      );
    const byProvider: Array<{
      provider: string;
      amount: string;
      transactions: number;
    }> = await this.dataSource.query(
      `SELECT provider,
              COALESCE(SUM(amount), 0)::numeric AS amount,
              COUNT(*)::int AS transactions
         FROM payment_transactions
        WHERE tenant_id = $1 AND status = 'SUCCESS'
          AND processed_at BETWEEN $2 AND $3
        GROUP BY provider ORDER BY amount DESC`,
      [tenantId, from, to],
    );

    const totalRevenue = rows.reduce((sum, row) => sum + numeric(row.revenue), 0);
    return {
      rows: rows.map((row) => ({
        month: row.month,
        invoices: row.invoices,
        revenue: numeric(row.revenue),
      })),
      summary: {
        totalRevenue,
        currency: 'VND',
        months: rows.length,
        byProvider: byProvider.map((row) => ({
          provider: row.provider,
          amount: numeric(row.amount),
          transactions: row.transactions,
        })),
      },
    };
  }


  private async usage(
    tenantId: string,
    from: Date,
    to: Date,
  ): Promise<ReportData> {
    const rows: Array<{ metric: string; quantity: number; records: number }> =
      await this.dataSource.query(
        `SELECT metric,
                COALESCE(SUM(quantity), 0)::int AS quantity,
                COUNT(*)::int AS records
           FROM usage_records
          WHERE tenant_id = $1 AND recorded_at BETWEEN $2 AND $3
          GROUP BY metric ORDER BY metric`,
        [tenantId, from, to],
      );

    return {
      rows: rows as unknown as Array<Record<string, unknown>>,
      summary: {
        metrics: rows.length,
        totalQuantity: rows.reduce((sum, row) => sum + row.quantity, 0),
        records: rows.reduce((sum, row) => sum + row.records, 0),
      },
    };
  }

  private async security(
    tenantId: string,
    from: Date,
    to: Date,
  ): Promise<ReportData> {
    const rows: Array<{
      eventType: string;
      severity: string;
      events: number;
      openEvents: number;
    }> = await this.dataSource.query(
      `SELECT event_type AS "eventType", severity,
              COUNT(*)::int AS events,
              COUNT(*) FILTER (WHERE status <> 'RESOLVED')::int AS "openEvents"
         FROM security_events
        WHERE tenant_id = $1 AND detected_at BETWEEN $2 AND $3
        GROUP BY event_type, severity
        ORDER BY events DESC, event_type`,
      [tenantId, from, to],
    );
    const [failedLogins] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS failures
         FROM security_login_attempts
        WHERE tenant_id = $1 AND success = false
          AND created_at BETWEEN $2 AND $3`,
      [tenantId, from, to],
    );
    const [alerts] = await this.dataSource.query(
      `SELECT COALESCE(SUM(trigger_count), 0)::int AS triggers,
              COUNT(*)::int AS rules
         FROM security_alert_rules WHERE tenant_id = $1`,
      [tenantId],
    );

    return {
      rows: rows as unknown as Array<Record<string, unknown>>,
      summary: {
        totalEvents: rows.reduce((sum, row) => sum + row.events, 0),
        openEvents: rows.reduce((sum, row) => sum + row.openEvents, 0),
        failedLogins: failedLogins.failures,
        alertTriggers: alerts.triggers,
        alertRules: alerts.rules,
      },
    };
  }

  private async automation(
    tenantId: string,
    from: Date,
    to: Date,
  ): Promise<ReportData> {
    const workflowStatuses: Array<{ status: string; count: number }> =
      await this.dataSource.query(
        `SELECT status, COUNT(*)::int AS count
           FROM automation_workflow_instances
          WHERE tenant_id = $1 AND created_at BETWEEN $2 AND $3
          GROUP BY status ORDER BY status`,
        [tenantId, from, to],
      );
    const executionStatuses: Array<{ status: string; count: number }> =
      await this.dataSource.query(
        `SELECT status, COUNT(*)::int AS count
           FROM job_execution_histories
          WHERE tenant_id = $1 AND started_at BETWEEN $2 AND $3
          GROUP BY status ORDER BY status`,
        [tenantId, from, to],
      );
    const [jobs] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE is_enabled)::int AS enabled
         FROM scheduled_jobs WHERE tenant_id = $1`,
      [tenantId],
    );

    const rows: Array<Record<string, unknown>> = [
      ...workflowStatuses.map((row) => ({
        category: 'WORKFLOW_INSTANCE',
        name: row.status,
        count: row.count,
      })),
      ...executionStatuses.map((row) => ({
        category: 'JOB_EXECUTION',
        name: row.status,
        count: row.count,
      })),
      { category: 'SCHEDULED_JOB', name: 'enabled', count: jobs.enabled },
      { category: 'SCHEDULED_JOB', name: 'disabled', count: jobs.total - jobs.enabled },
    ];

    return {
      rows,
      summary: {
        scheduledJobs: jobs.total,
        enabledJobs: jobs.enabled,
        workflowInstances: workflowStatuses.reduce((sum, row) => sum + row.count, 0),
        jobExecutions: executionStatuses.reduce((sum, row) => sum + row.count, 0),
      },
    };
  }
}

