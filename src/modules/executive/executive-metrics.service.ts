import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ExecutiveMetric } from './entities/executive-metric.entity';
import { ExecutiveSnapshot } from './entities/executive-snapshot.entity';
import { MetricHistory } from './entities/metric-history.entity';
import {
  EXECUTIVE_METRIC_DEFINITIONS,
  ExecutiveMetricCode,
  ExecutiveMetricUnit,
  SnapshotPeriod,
} from './enums/executive.enum';
import {
  GenerateSnapshotDto,
  MetricHistoryQueryDto,
  SnapshotListQueryDto,
} from './dto/executive.dto';
import { platformOperatorEmails } from './platform-operators';
import { TenantContextService } from '../../common/tenant-context/tenant-context.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/enums/audit-action.enum';
import { MetricsService } from '../../common/metrics/metrics.service';

export interface MetricValue {
  code: ExecutiveMetricCode;
  name: string;
  unit: ExecutiveMetricUnit;
  value: number;
  previousValue: number | null;
  changePct: number;
}

export interface ExecutiveSummary {
  mrr: number;
  arr: number;
  arpu: number;
  ltv: number;
  customerCount: number;
  paidCustomers: number;
  activeUsers: number;
  activeTenants: number;
  trialConversions: number;
  paidConversions: number;
  revenueGrowth: number;
  retentionRate: number;
  churnRate: number;
}

function numeric(value: unknown): number {
  if (value == null) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

interface RawCounts {
  mrr: string;
  paidCustomers: number;
  customerCount: number;
  activeTenants: number;
  activeUsers: number;
  trialConversions: number;
  paidConversions: number;
  previousMrr: string | null;
}

/**
 * Executive metrics are platform-wide SaaS KPIs (MRR/ARR/ARPU/LTV, tenant and
 * user activity, conversions). Only platform operators can reach them.
 */
@Injectable()
export class ExecutiveMetricsService {
  private readonly logger = new Logger(ExecutiveMetricsService.name);

  constructor(
    @InjectRepository(ExecutiveMetric)
    private readonly metricRepo: Repository<ExecutiveMetric>,
    @InjectRepository(ExecutiveSnapshot)
    private readonly snapshotRepo: Repository<ExecutiveSnapshot>,
    @InjectRepository(MetricHistory)
    private readonly historyRepo: Repository<MetricHistory>,
    private readonly dataSource: DataSource,
    private readonly tenantContext: TenantContextService,
    private readonly audit: AuditService,
    private readonly promMetrics: MetricsService,
  ) {}

  private currentUserId(): string | null {
    try {
      return this.tenantContext.getCurrentUserId();
    } catch {
      return null;
    }
  }

  /** Operator tenant: the caller's tenant, or the allowlisted operator's (cron). */
  async operatorTenantId(): Promise<string> {
    try {
      return this.tenantContext.getCurrentTenantId();
    } catch {
      // No ALS (scheduler): resolve from the operator allowlist below.
    }
    const emails = platformOperatorEmails();
    if (emails.length === 0) {
      throw new NotFoundException('No platform operator configured');
    }
    const rows = await this.dataSource.query(
      `SELECT tu.tenant_id
         FROM users u
         JOIN tenant_users tu ON tu.user_id = u.id
        WHERE lower(u.email) = ANY($1)
        ORDER BY tu.created_at ASC
        LIMIT 1`,
      [emails],
    );
    if (!rows.length) {
      throw new NotFoundException('Operator tenant not found');
    }
    return rows[0].tenant_id as string;
  }

  private async fetchCounts(): Promise<RawCounts> {
    const [mrr] = await this.dataSource.query(
      `SELECT COALESCE(SUM(
                CASE WHEN s.billing_cycle = 'YEARLY'
                     THEN p.yearly_price / 12
                     ELSE p.monthly_price END
              ), 0)::numeric AS mrr
         FROM subscriptions s
         JOIN plans p ON p.id = s.plan_id
        WHERE s.status = 'ACTIVE'`,
    );
    const [paid] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS paid FROM subscriptions WHERE status = 'ACTIVE'`,
    );
    const [customers] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS customers
         FROM tenants WHERE status IN ('active', 'trial')`,
    );
    const [activeTenants] = await this.dataSource.query(
      `SELECT COUNT(DISTINCT tenant_id)::int AS active
         FROM login_histories
        WHERE login_at > now() - interval '30 days'`,
    );
    const [activeUsers] = await this.dataSource.query(
      `SELECT COUNT(DISTINCT user_id)::int AS active
         FROM login_histories
        WHERE login_at > now() - interval '30 days'`,
    );
    const [trial] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS conversions
         FROM subscriptions
        WHERE status = 'ACTIVE'
          AND trial_end IS NOT NULL
          AND trial_end > now() - interval '30 days'
          AND trial_end <= now()`,
    );
    const [paidConv] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS conversions
         FROM subscriptions
        WHERE status = 'ACTIVE'
          AND trial_end IS NULL
          AND created_at > now() - interval '30 days'`,
    );
    const [previous] = await this.dataSource.query(
      `SELECT value
         FROM metric_history
        WHERE metric_code = 'MRR'
          AND recorded_at < date_trunc('day', now())
        ORDER BY recorded_at DESC
        LIMIT 1`,
    );

    return {
      mrr: mrr.mrr,
      paidCustomers: paid.paid,
      customerCount: customers.customers,
      activeTenants: activeTenants.active,
      activeUsers: activeUsers.active,
      trialConversions: trial.conversions,
      paidConversions: paidConv.conversions,
      previousMrr: previous?.value ?? null,
    };
  }

  async compute(): Promise<{
    metrics: MetricValue[];
    summary: ExecutiveSummary;
  }> {
    const counts = await this.fetchCounts();
    const mrr = round2(numeric(counts.mrr));
    const arr = round2(mrr * 12);
    const {
      paidCustomers,
      customerCount,
      activeTenants,
      activeUsers,
      trialConversions,
      paidConversions,
    } = counts;
    const previousMrr = numeric(counts.previousMrr);

    const arpu = paidCustomers > 0 ? round2(mrr / paidCustomers) : 0;
    const retentionRate =
      customerCount > 0
        ? round2(Math.min(100, (activeTenants / customerCount) * 100))
        : 0;
    const churnRate = customerCount > 0 ? round2(100 - retentionRate) : 0;
    const ltv =
      churnRate > 0 ? round2(arpu / (churnRate / 100)) : round2(arpu * 24);
    const revenueGrowth =
      previousMrr > 0 ? round2(((mrr - previousMrr) / previousMrr) * 100) : 0;

    const values: Record<ExecutiveMetricCode, number> = {
      [ExecutiveMetricCode.MRR]: mrr,
      [ExecutiveMetricCode.ARR]: arr,
      [ExecutiveMetricCode.ARPU]: arpu,
      [ExecutiveMetricCode.LTV]: ltv,
      [ExecutiveMetricCode.CUSTOMER_COUNT]: customerCount,
      [ExecutiveMetricCode.ACTIVE_USERS]: activeUsers,
      [ExecutiveMetricCode.ACTIVE_TENANTS]: activeTenants,
      [ExecutiveMetricCode.TRIAL_CONVERSIONS]: trialConversions,
      [ExecutiveMetricCode.PAID_CONVERSIONS]: paidConversions,
      [ExecutiveMetricCode.REVENUE_GROWTH]: revenueGrowth,
      [ExecutiveMetricCode.RETENTION_RATE]: retentionRate,
      [ExecutiveMetricCode.CHURN_RATE]: churnRate,
    };

    return {
      metrics: EXECUTIVE_METRIC_DEFINITIONS.map((definition) => ({
        code: definition.code,
        name: definition.name,
        unit: definition.unit,
        value: values[definition.code],
        previousValue: null,
        changePct: 0,
      })),
      summary: {
        mrr,
        arr,
        arpu,
        ltv,
        customerCount,
        paidCustomers,
        activeUsers,
        activeTenants,
        trialConversions,
        paidConversions,
        revenueGrowth,
        retentionRate,
        churnRate,
      },
    };
  }

  /** Daily / monthly snapshot: KPI cache + snapshot row + metric history. */
  async generateSnapshot(dto: GenerateSnapshotDto = {}) {
    const period = dto.period ?? SnapshotPeriod.DAILY;
    const tenantId = await this.operatorTenantId();
    const userId = this.currentUserId();
    const computed = await this.compute();

    const now = new Date();
    const snapshotDate =
      period === SnapshotPeriod.MONTHLY
        ? `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`
        : now.toISOString().slice(0, 10);

    for (const metric of computed.metrics) {
      let row = await this.metricRepo.findOne({
        where: { tenantId, code: metric.code },
      });
      const previous = row ? numeric(row.currentValue) : null;
      if (!row) {
        row = this.metricRepo.create({
          tenantId,
          code: metric.code,
          name: metric.name,
          unit: metric.unit,
          createdBy: userId,
        });
      }
      row.name = metric.name;
      row.unit = metric.unit;
      row.currentValue = metric.value.toFixed(4);
      row.previousValue = previous == null ? null : previous.toFixed(4);
      row.changePct =
        previous && previous !== 0
          ? round2(((metric.value - previous) / previous) * 100).toFixed(2)
          : '0.00';
      row.periodType = period;
      row.calculatedAt = now;
      row.updatedBy = userId;
      const saved = await this.metricRepo.save(row);
      metric.previousValue = previous;
      metric.changePct = numeric(saved.changePct);
    }

    let snapshot = await this.snapshotRepo.findOne({
      where: { tenantId, snapshotDate, periodType: period },
    });
    if (!snapshot) {
      snapshot = this.snapshotRepo.create({
        tenantId,
        snapshotDate,
        periodType: period,
        createdBy: userId,
      });
    }
    snapshot.metrics = computed.metrics as unknown as Array<Record<string, unknown>>;
    snapshot.summary = computed.summary as unknown as Record<string, unknown>;
    snapshot.generatedBy = userId;
    snapshot.generatedAt = now;
    snapshot.updatedBy = userId;
    const savedSnapshot = await this.snapshotRepo.save(snapshot);

    await this.historyRepo
      .createQueryBuilder()
      .delete()
      .where('tenant_id = :tenantId', { tenantId })
      .andWhere('period_type = :period', { period })
      .andWhere('recorded_at::date = CAST(:snapshotDate AS date)', { snapshotDate })
      .execute();

    await this.historyRepo.save(
      computed.metrics.map((metric) =>
        this.historyRepo.create({
          tenantId,
          metricCode: metric.code,
          value: metric.value.toFixed(4),
          unit: metric.unit,
          periodType: period,
          recordedAt: now,
          snapshotId: savedSnapshot.id,
          metadata: {},
          createdBy: userId,
        }),
      ),
    );

    this.setGauges(computed.summary);
    await this.auditSafe(savedSnapshot.id, {
      period,
      snapshotDate,
      summary: computed.summary,
    });
    this.promMetrics.inc('executive_snapshots_total', { period });

    return { ...savedSnapshot, metrics: computed.metrics };
  }


  /** Live KPIs (computed on read) + last cached change values. */
  async latestMetrics() {
    const tenantId = await this.operatorTenantId();
    const computed = await this.compute();
    const cached = await this.metricRepo.find({ where: { tenantId } });
    const byCode = new Map(cached.map((row) => [row.code, row]));

    for (const metric of computed.metrics) {
      const row = byCode.get(metric.code);
      if (!row) continue;
      metric.previousValue =
        row.previousValue == null ? null : numeric(row.previousValue);
      metric.changePct = numeric(row.changePct);
    }
    this.setGauges(computed.summary);

    return {
      generatedAt: new Date().toISOString(),
      currency: 'VND',
      metrics: computed.metrics,
      summary: computed.summary,
    };
  }

  async history(query: MetricHistoryQueryDto) {
    const tenantId = await this.operatorTenantId();
    const qb = this.historyRepo
      .createQueryBuilder('h')
      .where('h.tenantId = :tenantId', { tenantId })
      .orderBy('h.recordedAt', 'ASC')
      .take(query.limit ?? 120);

    if (query.code) qb.andWhere('h.metricCode = :code', { code: query.code });
    if (query.period) {
      qb.andWhere('h.periodType = :period', { period: query.period });
    }
    if (query.from) qb.andWhere('h.recordedAt >= :from', { from: query.from });
    if (query.to) qb.andWhere('h.recordedAt <= :to', { to: query.to });

    const rows = await qb.getMany();
    const series = new Map<
      string,
      {
        code: string;
        unit: ExecutiveMetricUnit;
        points: Array<{ recordedAt: Date; value: number }>;
      }
    >();
    for (const row of rows) {
      const entry = series.get(row.metricCode) ?? {
        code: row.metricCode,
        unit: row.unit,
        points: [],
      };
      entry.points.push({
        recordedAt: row.recordedAt,
        value: numeric(row.value),
      });
      series.set(row.metricCode, entry);
    }

    return {
      period: query.period ?? null,
      series: Array.from(series.values()),
    };
  }

  async listSnapshots(query: SnapshotListQueryDto) {
    const tenantId = await this.operatorTenantId();
    const where: Record<string, unknown> = { tenantId };
    if (query.period) where.periodType = query.period;
    return this.snapshotRepo.find({
      where,
      order: { snapshotDate: 'DESC', periodType: 'ASC' },
      take: query.limit ?? 30,
    });
  }

  async dashboard() {
    const live = await this.latestMetrics();
    const tenantId = await this.operatorTenantId();
    const [daily] = await this.snapshotRepo.find({
      where: { tenantId, periodType: SnapshotPeriod.DAILY },
      order: { snapshotDate: 'DESC' },
      take: 1,
    });
    const [monthly] = await this.snapshotRepo.find({
      where: { tenantId, periodType: SnapshotPeriod.MONTHLY },
      order: { snapshotDate: 'DESC' },
      take: 1,
    });
    const mrrHistory = await this.history({
      code: ExecutiveMetricCode.MRR,
      period: SnapshotPeriod.DAILY,
      limit: 30,
    });
    const tenantHistory = await this.history({
      code: ExecutiveMetricCode.ACTIVE_TENANTS,
      period: SnapshotPeriod.DAILY,
      limit: 30,
    });

    return {
      generatedAt: live.generatedAt,
      kpis: live.summary,
      metrics: live.metrics,
      latestDaily: daily ?? null,
      latestMonthly: monthly ?? null,
      trends: {
        mrr: mrrHistory.series[0]?.points ?? [],
        activeTenants: tenantHistory.series[0]?.points ?? [],
      },
    };
  }

  async prometheusText(): Promise<string> {
    await this.latestMetrics();
    return this.promMetrics.text();
  }

  private setGauges(summary: ExecutiveSummary): void {
    const gauges: Array<[string, number]> = [
      ['executive_mrr', summary.mrr],
      ['executive_arr', summary.arr],
      ['executive_arpu', summary.arpu],
      ['executive_ltv', summary.ltv],
      ['executive_customer_count', summary.customerCount],
      ['executive_active_users', summary.activeUsers],
      ['executive_active_tenants', summary.activeTenants],
      ['executive_trial_conversions', summary.trialConversions],
      ['executive_paid_conversions', summary.paidConversions],
      ['executive_revenue_growth_pct', summary.revenueGrowth],
      ['executive_retention_rate_pct', summary.retentionRate],
      ['executive_churn_rate_pct', summary.churnRate],
    ];
    for (const [name, value] of gauges) {
      this.promMetrics.set(name, value);
    }
  }

  private async auditSafe(
    id: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.audit.logAction(
        'executive_snapshot',
        id,
        AuditAction.CREATE,
        { newData: data },
      );
    } catch (error) {
      this.logger.warn(
        `Executive snapshot audit skipped: ${
          error instanceof Error ? error.message : error
        }`,
      );
    }
  }
}

