import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ExecutiveSnapshot } from './entities/executive-snapshot.entity';
import { ExecutiveMetricsService } from './executive-metrics.service';
import { ExecutiveMetricCode, SnapshotPeriod } from './enums/executive.enum';
import {
  ExecutiveAlertSeverity,
  ExecutiveAlertType,
  WidgetKey,
  WidgetStatus,
  WIDGET_KEYS,
} from './executive-dashboard.enums';
import {
  ExecutiveAlertsQueryDto,
  ExecutiveDashboardQueryDto,
  ExecutiveWidgetsQueryDto,
} from './executive-dashboard.dto';
import { RevenueService } from '../revenue/revenue.service';
import { GrowthService } from '../growth/growth.service';
import { CustomerHealthService } from '../customer-health/customer-health.service';

interface Range {
  from: Date;
  to: Date;
}

interface SupportingCounts {
  evidence_total: number;
  evidence_verified: number;
  open_critical_risks: number;
  open_high_risks: number;
  security_critical: number;
  security_high: number;
  failed_logins: number;
  jobs_total: number;
  jobs_enabled: number;
  failed_job_execs: number;
  workflow_instances: number;
  onboarding_failed: number;
  past_due_subs: number;
  active_users: number;
}

export interface ExecutiveWidget {
  key: WidgetKey;
  title: string;
  status: WidgetStatus;
  primary: { label: string; value: number; unit: string };
  secondary: Array<{ label: string; value: number; unit: string }>;
  drilldown: { path: string; query?: Record<string, string> };
}

export interface ExecutiveAlert {
  id: string;
  type: ExecutiveAlertType;
  severity: ExecutiveAlertSeverity;
  title: string;
  message: string;
  value: number;
  threshold: number;
  detectedAt: string;
  drilldown: { path: string; query?: Record<string, string> };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function numeric(value: unknown): number {
  if (value == null) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * EPIC D6 – Executive Dashboard.
 * Single pane of glass built on top of the D1-D5 analytics services.
 */
@Injectable()
export class ExecutiveDashboardService {
  constructor(
    @InjectRepository(ExecutiveSnapshot)
    private readonly snapshots: Repository<ExecutiveSnapshot>,
    private readonly metrics: ExecutiveMetricsService,
    private readonly revenue: RevenueService,
    private readonly growth: GrowthService,
    private readonly health: CustomerHealthService,
    private readonly dataSource: DataSource,
  ) {}

  private range(query: ExecutiveDashboardQueryDto): Range {
    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from
      ? new Date(query.from)
      : new Date(to.getTime() - 30 * 86_400_000);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException('Invalid from/to date');
    }
    if (from > to) throw new BadRequestException('"from" must be before "to"');
    return { from, to };
  }

  private async supporting(range: Range): Promise<SupportingCounts> {
    const [row] = await this.dataSource.query(
      `SELECT
         (SELECT COUNT(*)::int FROM compliance_evidence
           WHERE created_at BETWEEN $1 AND $2) AS evidence_total,
         (SELECT COUNT(*)::int FROM compliance_evidence
           WHERE status = 'VERIFIED' AND created_at BETWEEN $1 AND $2) AS evidence_verified,
         (SELECT COUNT(*)::int FROM compliance_risks
           WHERE status = 'OPEN' AND severity = 'CRITICAL'
             AND created_at BETWEEN $1 AND $2) AS open_critical_risks,
         (SELECT COUNT(*)::int FROM compliance_risks
           WHERE status = 'OPEN' AND severity = 'HIGH'
             AND created_at BETWEEN $1 AND $2) AS open_high_risks,
         (SELECT COUNT(*)::int FROM security_events
           WHERE status <> 'RESOLVED' AND severity = 'CRITICAL'
             AND detected_at BETWEEN $1 AND $2) AS security_critical,
         (SELECT COUNT(*)::int FROM security_events
           WHERE status <> 'RESOLVED' AND severity = 'HIGH'
             AND detected_at BETWEEN $1 AND $2) AS security_high,
         (SELECT COUNT(*)::int FROM security_login_attempts
           WHERE success = false AND created_at BETWEEN $1 AND $2) AS failed_logins,
         (SELECT COUNT(*)::int FROM scheduled_jobs) AS jobs_total,
         (SELECT COUNT(*)::int FROM scheduled_jobs WHERE is_enabled) AS jobs_enabled,
         (SELECT COUNT(*)::int FROM job_execution_histories
           WHERE status = 'FAILED' AND started_at BETWEEN $1 AND $2) AS failed_job_execs,
         (SELECT COUNT(*)::int FROM automation_workflow_instances
           WHERE created_at BETWEEN $1 AND $2) AS workflow_instances,
         (SELECT COUNT(*)::int FROM tenant_onboardings
           WHERE status = 'FAILED') AS onboarding_failed,
         (SELECT COUNT(*)::int FROM subscriptions
           WHERE status = 'PAST_DUE') AS past_due_subs,
         (SELECT COUNT(DISTINCT user_id)::int FROM login_histories
           WHERE login_at BETWEEN $1 AND $2) AS active_users`,
      [range.from, range.to],
    );
    return row as SupportingCounts;
  }

  private async mrrGrowthPct(currentMrr: number): Promise<number> {
    const tenantId = await this.metrics.operatorTenantId();
    const [previous] = await this.dataSource.query(
      `SELECT value
         FROM metric_history
        WHERE tenant_id = $1
          AND metric_code = 'MRR'
          AND recorded_at < now() - interval '1 day'
        ORDER BY recorded_at DESC
        LIMIT 1`,
      [tenantId],
    );
    const previousMrr = numeric(previous?.value);
    return previousMrr > 0
      ? round2(((currentMrr - previousMrr) / previousMrr) * 100)
      : 0;
  }

  private async collect(query: ExecutiveDashboardQueryDto) {
    const range = this.range(query);
    const [metrics, revenue, growth, health] = await Promise.all([
      this.metrics.latestMetrics(),
      this.revenue.dashboard(),
      this.growth.dashboard(),
      this.health.dashboard(),
    ]);
    const support = await this.supporting(range);
    const mrrGrowthPct = await this.mrrGrowthPct(Number(revenue.summary.mrr));
    return { range, metrics, revenue, growth, health, support, mrrGrowthPct };
  }

  private buildWidgets(aggregates: {
    revenue: any;
    growth: any;
    health: any;
    support: SupportingCounts;
    mrrGrowthPct: number;
    range: Range;
  }): ExecutiveWidget[] {
    const { revenue, growth, health, support, mrrGrowthPct, range } = aggregates;
    const tenantCount = Number(health.totals.tenants ?? 0);
    const churnCandidates = Number(health.totals.churnCandidates ?? 0);
    const churnRatio = tenantCount > 0 ? churnCandidates / tenantCount : 0;
    const securityOpen = support.security_critical + support.security_high;
    const systemRisks =
      support.onboarding_failed +
      support.failed_job_execs +
      support.past_due_subs;

    const status = (critical: boolean, warning: boolean): WidgetStatus =>
      critical
        ? WidgetStatus.CRITICAL
        : warning
          ? WidgetStatus.WARNING
          : WidgetStatus.OK;

    const drilldown = (key: WidgetKey) => ({
      path: `/executive/widgets/${key}`,
      query: {
        from: range.from.toISOString(),
        to: range.to.toISOString(),
      },
    });

    return [
      {
        key: WidgetKey.REVENUE,
        title: 'Revenue',
        status: status(mrrGrowthPct <= -20, mrrGrowthPct <= -5),
        primary: { label: 'MRR', value: Number(revenue.summary.mrr), unit: 'VND' },
        secondary: [
          { label: 'ARR', value: Number(revenue.summary.arr), unit: 'VND' },
          { label: 'MRR growth', value: mrrGrowthPct, unit: 'PERCENT' },
          {
            label: 'Expansion',
            value: Number(revenue.summary.expansionRevenue),
            unit: 'VND',
          },
        ],
        drilldown: drilldown(WidgetKey.REVENUE),
      },
      {
        key: WidgetKey.GROWTH,
        title: 'Growth',
        status: status(
          Number(growth.metrics.activationRatePct) < 40,
          Number(growth.metrics.activationRatePct) < 60,
        ),
        primary: {
          label: 'Activation rate',
          value: Number(growth.metrics.activationRatePct),
          unit: 'PERCENT',
        },
        secondary: [
          {
            label: 'Paid conversion',
            value: Number(growth.metrics.paidConversionPct),
            unit: 'PERCENT',
          },
          {
            label: 'Upsell rate',
            value: Number(growth.metrics.upsellRatePct),
            unit: 'PERCENT',
          },
          {
            label: 'Funnel conversion',
            value: Number(growth.funnel.overallConversionPct),
            unit: 'PERCENT',
          },
        ],
        drilldown: drilldown(WidgetKey.GROWTH),
      },
      {
        key: WidgetKey.CUSTOMERS,
        title: 'Customers',
        status: status(churnRatio >= 0.3, churnCandidates > 0),
        primary: { label: 'Active tenants', value: tenantCount, unit: 'COUNT' },
        secondary: [
          {
            label: 'Paid tenants',
            value: Number(revenue.summary.payingCustomers),
            unit: 'COUNT',
          },
          { label: 'Churn candidates', value: churnCandidates, unit: 'COUNT' },
          {
            label: 'Avg health',
            value: Number(health.totals.averageScore),
            unit: 'SCORE',
          },
        ],
        drilldown: drilldown(WidgetKey.CUSTOMERS),
      },

      {
        key: WidgetKey.COMPLIANCE,
        title: 'Compliance',
        status: status(support.open_critical_risks > 0, support.open_high_risks > 0),
        primary: {
          label: 'Verified evidence',
          value: support.evidence_verified,
          unit: 'COUNT',
        },
        secondary: [
          { label: 'Evidence', value: support.evidence_total, unit: 'COUNT' },
          {
            label: 'Open critical risks',
            value: support.open_critical_risks,
            unit: 'COUNT',
          },
          {
            label: 'Open high risks',
            value: support.open_high_risks,
            unit: 'COUNT',
          },
        ],
        drilldown: drilldown(WidgetKey.COMPLIANCE),
      },
      {
        key: WidgetKey.SECURITY,
        title: 'Security',
        status: status(support.security_critical > 0, support.security_high > 0),
        primary: {
          label: 'Open security events',
          value: securityOpen,
          unit: 'COUNT',
        },
        secondary: [
          {
            label: 'Critical',
            value: support.security_critical,
            unit: 'COUNT',
          },
          { label: 'High', value: support.security_high, unit: 'COUNT' },
          {
            label: 'Failed logins',
            value: support.failed_logins,
            unit: 'COUNT',
          },
        ],
        drilldown: drilldown(WidgetKey.SECURITY),
      },
      {
        key: WidgetKey.AUTOMATION,
        title: 'Automation',
        status: status(support.failed_job_execs >= 5, support.failed_job_execs > 0),
        primary: {
          label: 'Enabled jobs',
          value: support.jobs_enabled,
          unit: 'COUNT',
        },
        secondary: [
          { label: 'Scheduled jobs', value: support.jobs_total, unit: 'COUNT' },
          {
            label: 'Failed executions',
            value: support.failed_job_execs,
            unit: 'COUNT',
          },
          {
            label: 'Workflow instances',
            value: support.workflow_instances,
            unit: 'COUNT',
          },
        ],
        drilldown: drilldown(WidgetKey.AUTOMATION),
      },
      {
        key: WidgetKey.OPERATIONS,
        title: 'Operations',
        status: status(
          support.past_due_subs >= 3 || support.onboarding_failed >= 3,
          support.past_due_subs > 0 || support.onboarding_failed > 0,
        ),
        primary: {
          label: 'Active users',
          value: support.active_users,
          unit: 'COUNT',
        },
        secondary: [
          {
            label: 'Past due subscriptions',
            value: support.past_due_subs,
            unit: 'COUNT',
          },
          {
            label: 'Failed onboardings',
            value: support.onboarding_failed,
            unit: 'COUNT',
          },
          { label: 'System risks', value: systemRisks, unit: 'COUNT' },
        ],
        drilldown: drilldown(WidgetKey.OPERATIONS),
      },
    ];
  }


  private buildAlerts(aggregates: {
    revenue: any;
    growth: any;
    health: any;
    support: SupportingCounts;
    mrrGrowthPct: number;
    range: Range;
  }): ExecutiveAlert[] {
    const { health, support, mrrGrowthPct, range } = aggregates;
    const detectedAt = range.to.toISOString();
    const alerts: ExecutiveAlert[] = [];

    if (mrrGrowthPct <= -5) {
      alerts.push({
        id: `${ExecutiveAlertType.REVENUE_DROP}:${detectedAt.slice(0, 10)}`,
        type: ExecutiveAlertType.REVENUE_DROP,
        severity:
          mrrGrowthPct <= -20
            ? ExecutiveAlertSeverity.CRITICAL
            : ExecutiveAlertSeverity.WARNING,
        title: 'Revenue drop',
        message: `MRR changed ${mrrGrowthPct}% vs the previous recorded snapshot`,
        value: mrrGrowthPct,
        threshold: -5,
        detectedAt,
        drilldown: { path: '/revenue/dashboard' },
      });
    }

    const tenants = Number(health.totals.tenants ?? 0);
    const churnCandidates = Number(health.totals.churnCandidates ?? 0);
    const threshold = Math.max(1, Math.ceil(tenants * 0.1));
    if (churnCandidates >= threshold) {
      const ratio = tenants > 0 ? churnCandidates / tenants : 0;
      alerts.push({
        id: `${ExecutiveAlertType.CHURN_SPIKE}:${detectedAt.slice(0, 10)}`,
        type: ExecutiveAlertType.CHURN_SPIKE,
        severity:
          ratio >= 0.3
            ? ExecutiveAlertSeverity.CRITICAL
            : ExecutiveAlertSeverity.WARNING,
        title: 'Churn spike',
        message: `${churnCandidates}/${tenants} tenants are churn candidates`,
        value: churnCandidates,
        threshold,
        detectedAt,
        drilldown: { path: '/customer-health/at-risk' },
      });
    }

    const securityEvents = support.security_critical + support.security_high;
    if (securityEvents > 0) {
      alerts.push({
        id: `${ExecutiveAlertType.SECURITY_SPIKE}:${detectedAt.slice(0, 10)}`,
        type: ExecutiveAlertType.SECURITY_SPIKE,
        severity:
          support.security_critical >= 3
            ? ExecutiveAlertSeverity.CRITICAL
            : ExecutiveAlertSeverity.WARNING,
        title: 'Security spike',
        message: `${support.security_critical} critical / ${support.security_high} high open security events`,
        value: securityEvents,
        threshold: 1,
        detectedAt,
        drilldown: { path: '/security/events' },
      });
    }

    const systemRisks =
      support.onboarding_failed +
      support.failed_job_execs +
      support.past_due_subs;
    if (systemRisks > 0) {
      alerts.push({
        id: `${ExecutiveAlertType.SYSTEM_RISK}:${detectedAt.slice(0, 10)}`,
        type: ExecutiveAlertType.SYSTEM_RISK,
        severity:
          systemRisks >= 3
            ? ExecutiveAlertSeverity.CRITICAL
            : ExecutiveAlertSeverity.WARNING,
        title: 'System risks',
        message: `${support.past_due_subs} past-due subscriptions, ${support.onboarding_failed} failed onboardings, ${support.failed_job_execs} failed job executions`,
        value: systemRisks,
        threshold: 1,
        detectedAt,
        drilldown: { path: '/executive/widgets/OPERATIONS' },
      });
    }

    return alerts;
  }

  async dashboard(query: ExecutiveDashboardQueryDto, role?: string) {
    const aggregates = await this.collect(query);
    const tenantId = await this.metrics.operatorTenantId();
    const [daily] = await this.snapshots.find({
      where: { tenantId, periodType: SnapshotPeriod.DAILY },
      order: { snapshotDate: 'DESC' },
      take: 1,
    });
    const [monthly] = await this.snapshots.find({
      where: { tenantId, periodType: SnapshotPeriod.MONTHLY },
      order: { snapshotDate: 'DESC' },
      take: 1,
    });
    const mrrHistory = await this.metrics.history({
      code: ExecutiveMetricCode.MRR,
      period: SnapshotPeriod.DAILY,
      limit: 30,
    });
    const tenantHistory = await this.metrics.history({
      code: ExecutiveMetricCode.ACTIVE_TENANTS,
      period: SnapshotPeriod.DAILY,
      limit: 30,
    });

    const widgets = this.buildWidgets(aggregates);
    const alerts = this.buildAlerts(aggregates);

    return {
      generatedAt: new Date().toISOString(),
      range: {
        from: aggregates.range.from.toISOString(),
        to: aggregates.range.to.toISOString(),
      },
      meta: {
        operatorOnly: true,
        role: role ?? 'unknown',
        widgets: widgets.length,
        alerts: alerts.length,
      },
      kpis: aggregates.metrics.summary,
      metrics: aggregates.metrics.metrics,
      latestDaily: daily ?? null,
      latestMonthly: monthly ?? null,
      trends: {
        mrr: mrrHistory.series[0]?.points ?? [],
        activeTenants: tenantHistory.series[0]?.points ?? [],
      },
      widgets,
      alerts,
      summaries: {
        revenue: aggregates.revenue.summary,
        growth: aggregates.growth.metrics,
        customers: aggregates.health.totals,
        compliance: {
          evidence: aggregates.support.evidence_total,
          verified: aggregates.support.evidence_verified,
          openCriticalRisks: aggregates.support.open_critical_risks,
          openHighRisks: aggregates.support.open_high_risks,
        },
        security: {
          critical: aggregates.support.security_critical,
          high: aggregates.support.security_high,
          failedLogins: aggregates.support.failed_logins,
        },
        automation: {
          jobs: aggregates.support.jobs_total,
          enabledJobs: aggregates.support.jobs_enabled,
          failedExecutions: aggregates.support.failed_job_execs,
          workflowInstances: aggregates.support.workflow_instances,
        },
        operations: {
          activeUsers: aggregates.support.active_users,
          pastDueSubscriptions: aggregates.support.past_due_subs,
          failedOnboardings: aggregates.support.onboarding_failed,
        },
      },
    };
  }


  async widgets(query: ExecutiveWidgetsQueryDto) {
    const aggregates = await this.collect(query);
    let widgets = this.buildWidgets(aggregates);
    if (query.widgets) {
      const wanted = query.widgets
        .split(',')
        .map((key) => key.trim().toUpperCase())
        .filter(Boolean);
      widgets = widgets.filter((widget) => wanted.includes(widget.key));
    }
    return {
      generatedAt: new Date().toISOString(),
      range: {
        from: aggregates.range.from.toISOString(),
        to: aggregates.range.to.toISOString(),
      },
      widgets,
    };
  }

  async alerts(query: ExecutiveAlertsQueryDto) {
    const aggregates = await this.collect(query);
    let alerts = this.buildAlerts(aggregates);
    if (query.severity) {
      alerts = alerts.filter((alert) => alert.severity === query.severity);
    }
    if (query.type) {
      alerts = alerts.filter((alert) => alert.type === query.type);
    }
    return {
      generatedAt: new Date().toISOString(),
      range: {
        from: aggregates.range.from.toISOString(),
        to: aggregates.range.to.toISOString(),
      },
      total: alerts.length,
      alerts,
    };
  }

  async widgetDetail(
    key: string,
    query: ExecutiveDashboardQueryDto,
  ) {
    const widgetKey = key.toUpperCase() as WidgetKey;
    if (!WIDGET_KEYS.includes(widgetKey)) {
      throw new NotFoundException(`Unknown executive widget: ${key}`);
    }
    const aggregates = await this.collect(query);
    const widget = this.buildWidgets(aggregates).find(
      (item) => item.key === widgetKey,
    );
    const range = {
      from: aggregates.range.from.toISOString(),
      to: aggregates.range.to.toISOString(),
    };

    let details: unknown;
    switch (widgetKey) {
      case WidgetKey.REVENUE:
        details = {
          summary: aggregates.revenue.summary,
          segments: aggregates.revenue.segments,
          topCustomers: aggregates.revenue.topCustomers,
          mrrGrowthPct: aggregates.mrrGrowthPct,
        };
        break;
      case WidgetKey.GROWTH:
        details = {
          metrics: aggregates.growth.metrics,
          funnel: aggregates.growth.funnel,
          planFunnel: aggregates.growth.planFunnel,
          segments: aggregates.growth.segments,
        };
        break;
      case WidgetKey.CUSTOMERS:
        details = {
          totals: aggregates.health.totals,
          atRisk: aggregates.health.atRisk.slice(0, 10),
          churnCandidates: aggregates.health.churnCandidates.slice(0, 10),
        };
        break;
      case WidgetKey.COMPLIANCE:
        details = {
          evidence: {
            total: aggregates.support.evidence_total,
            verified: aggregates.support.evidence_verified,
          },
          openRisks: await this.dataSource.query(
            `SELECT id, title, severity, status, score, created_at
               FROM compliance_risks
              WHERE status = 'OPEN'
              ORDER BY score DESC
              LIMIT 10`,
          ),
        };
        break;
      case WidgetKey.SECURITY:
        details = {
          events: await this.dataSource.query(
            `SELECT id, event_type, severity, status, actor_email,
                    ip_address, detected_at
               FROM security_events
              WHERE status <> 'RESOLVED'
              ORDER BY detected_at DESC
              LIMIT 10`,
          ),
        };
        break;
      case WidgetKey.AUTOMATION:
        details = {
          failedExecutions: await this.dataSource.query(
            `SELECT h.id, h.job_id, j.name AS job_name, h.status,
                    h.started_at, h.error_message
               FROM job_execution_histories h
               LEFT JOIN scheduled_jobs j ON j.id = h.job_id
              WHERE h.status = 'FAILED'
              ORDER BY h.started_at DESC NULLS LAST
              LIMIT 10`,
          ),
        };
        break;
      case WidgetKey.OPERATIONS:
        details = {
          pastDueSubscriptions: await this.dataSource.query(
            `SELECT t.code AS tenant_code, s.status, s.current_period_end
               FROM subscriptions s
               JOIN tenants t ON t.id = s.tenant_id
              WHERE s.status = 'PAST_DUE'
              ORDER BY s.current_period_end ASC NULLS LAST
              LIMIT 10`,
          ),
          failedOnboardings: await this.dataSource.query(
            `SELECT id, tenant_id, status, error_message, created_at
               FROM tenant_onboardings
              WHERE status = 'FAILED'
              ORDER BY created_at DESC
              LIMIT 10`,
          ),
        };
        break;
      default:
        details = {};
    }

    return { widget, range, details };
  }
}

