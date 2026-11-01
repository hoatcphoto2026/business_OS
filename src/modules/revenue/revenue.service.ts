import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { RevenueSnapshot } from './entities/revenue-snapshot.entity';
import { RevenueForecast } from './entities/revenue-forecast.entity';
import { RevenueSegment } from './entities/revenue-segment.entity';
import {
  RevenueDimension,
  RevenueSnapshotPeriod,
} from './enums/revenue.enum';
import {
  GenerateRevenueSnapshotDto,
  RevenueForecastQueryDto,
  RevenueSegmentQueryDto,
  RevenueSnapshotQueryDto,
  RevenueTrendsQueryDto,
  TopCustomersQueryDto,
} from './dto/revenue.dto';
import { ForecastRow, RevenueDataService } from './revenue-data.service';
import { platformOperatorEmails } from '../executive/platform-operators';
import { TenantContextService } from '../../common/tenant-context/tenant-context.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/enums/audit-action.enum';
import { MetricsService } from '../../common/metrics/metrics.service';

/**
 * Revenue Intelligence (D2). Platform-wide revenue analysis; only platform
 * operators can reach the controller (same allowlist as D1).
 */
@Injectable()
export class RevenueService {
  private readonly logger = new Logger(RevenueService.name);

  constructor(
    @InjectRepository(RevenueSnapshot)
    private readonly snapshots: Repository<RevenueSnapshot>,
    @InjectRepository(RevenueForecast)
    private readonly forecasts: Repository<RevenueForecast>,
    @InjectRepository(RevenueSegment)
    private readonly segments: Repository<RevenueSegment>,
    private readonly dataSource: DataSource,
    private readonly data: RevenueDataService,
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

  /** Persist snapshot + segments + forecasts and refresh gauges. */
  async generateSnapshot(dto: GenerateRevenueSnapshotDto = {}) {
    const period = dto.period ?? RevenueSnapshotPeriod.MONTHLY;
    const tenantId = await this.operatorTenantId();
    const userId = this.currentUserId();
    const windowDays = 30;
    const computed = await this.data.compute(windowDays);
    const forecastRows = await this.data.forecast(
      tenantId,
      computed,
      windowDays,
    );

    const now = new Date();
    const snapshotDate =
      period === RevenueSnapshotPeriod.MONTHLY
        ? `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`
        : now.toISOString().slice(0, 10);
    const periodKey = snapshotDate.slice(0, 7);

    let snapshot = await this.snapshots.findOne({
      where: { tenantId, snapshotDate, periodType: period },
    });
    if (!snapshot) {
      snapshot = this.snapshots.create({
        tenantId,
        snapshotDate,
        periodType: period,
        createdBy: userId,
      });
    }
    snapshot.mrr = computed.mrr.toFixed(2);
    snapshot.arr = computed.arr.toFixed(2);
    snapshot.expansionRevenue = computed.expansionRevenue.toFixed(2);
    snapshot.contractionRevenue = computed.contractionRevenue.toFixed(2);
    snapshot.netNewRevenue = computed.netNewRevenue.toFixed(2);
    snapshot.paidRevenue = computed.paidRevenue.toFixed(2);
    snapshot.payingCustomers = computed.payingCustomers;
    snapshot.customerCount = computed.customerCount;
    snapshot.byPlan = computed.byPlan as unknown as Array<Record<string, unknown>>;
    snapshot.byTenant = computed.byTenant as unknown as Array<Record<string, unknown>>;
    snapshot.byCountry = computed.byCountry as unknown as Array<Record<string, unknown>>;
    snapshot.generatedAt = now;
    snapshot.updatedBy = userId;
    const saved = await this.snapshots.save(snapshot);

    const segmentInputs: Array<{
      dimension: RevenueDimension;
      rows: typeof computed.byPlan;
    }> = [
      { dimension: RevenueDimension.PLAN, rows: computed.byPlan },
      { dimension: RevenueDimension.TENANT, rows: computed.byTenant },
      { dimension: RevenueDimension.COUNTRY, rows: computed.byCountry },
    ];
    for (const group of segmentInputs) {
      for (const row of group.rows) {
        let segment = await this.segments.findOne({
          where: {
            tenantId,
            dimension: group.dimension,
            segmentKey: row.key,
            period: periodKey,
          },
        });
        if (!segment) {
          segment = this.segments.create({
            tenantId,
            dimension: group.dimension,
            segmentKey: row.key,
            period: periodKey,
            createdBy: userId,
          });
        }
        segment.label = row.label;
        segment.mrr = row.mrr.toFixed(2);
        segment.arr = row.arr.toFixed(2);
        segment.sharePct = row.sharePct.toFixed(2);
        segment.customers = row.customers;
        segment.metadata = row.metadata;
        segment.updatedBy = userId;
        await this.segments.save(segment);
      }
    }

    const asOf = now.toISOString().slice(0, 10);
    for (const row of forecastRows) {
      let forecast = await this.forecasts.findOne({
        where: { tenantId, horizon: row.horizon, asOf },
      });
      if (!forecast) {
        forecast = this.forecasts.create({
          tenantId,
          horizon: row.horizon,
          asOf,
          periodStart: row.periodStart,
          periodEnd: row.periodEnd,
          createdBy: userId,
        });
      }
      forecast.predictedRevenue = row.predictedRevenue.toFixed(2);
      forecast.lowerBound = row.lowerBound.toFixed(2);
      forecast.upperBound = row.upperBound.toFixed(2);
      forecast.confidence = row.confidence.toFixed(4);
      forecast.method = row.method;
      forecast.inputs = row.inputs;
      forecast.generatedAt = now;
      forecast.updatedBy = userId;
      await this.forecasts.save(forecast);
    }

    this.setGauges(computed, forecastRows);
    await this.auditSafe(saved.id, {
      period,
      snapshotDate,
      mrr: computed.mrr,
      expansionRevenue: computed.expansionRevenue,
      contractionRevenue: computed.contractionRevenue,
    });
    this.promMetrics.inc('revenue_snapshots_total', { period });

    return {
      snapshot: saved,
      forecasts: forecastRows,
      segments: segmentInputs.reduce((sum, group) => sum + group.rows.length, 0),
    };
  }


  async dashboard() {
    const tenantId = await this.operatorTenantId();
    const computed = await this.data.compute(30);
    const forecastRows = await this.data.forecast(tenantId, computed, 30);
    const trends = await this.data.trends(6, tenantId);
    const [daily] = await this.snapshots.find({
      where: { tenantId, periodType: RevenueSnapshotPeriod.DAILY },
      order: { snapshotDate: 'DESC' },
      take: 1,
    });
    const [monthly] = await this.snapshots.find({
      where: { tenantId, periodType: RevenueSnapshotPeriod.MONTHLY },
      order: { snapshotDate: 'DESC' },
      take: 1,
    });

    return {
      generatedAt: new Date().toISOString(),
      currency: 'VND',
      summary: {
        mrr: computed.mrr,
        arr: computed.arr,
        expansionRevenue: computed.expansionRevenue,
        contractionRevenue: computed.contractionRevenue,
        netNewRevenue: computed.netNewRevenue,
        upgrades: computed.upgrades,
        downgrades: computed.downgrades,
        paidRevenue30d: computed.paidRevenue,
        payingCustomers: computed.payingCustomers,
        customerCount: computed.customerCount,
      },
      segments: {
        byPlan: computed.byPlan,
        byTenant: computed.byTenant.slice(0, 10),
        byCountry: computed.byCountry,
      },
      topCustomers: computed.byTenant
        .slice(0, 10)
        .map((row, index) => ({ ...row, rank: index + 1 })),
      topPlans: computed.byPlan.slice(0, 10),
      forecast: {
        nextMonth: forecastRows[0],
        quarter: forecastRows[1],
        annual: forecastRows[2],
      },
      latestDaily: daily ?? null,
      latestMonthly: monthly ?? null,
      trends,
    };
  }

  async topCustomers(query: TopCustomersQueryDto) {
    const rows = await this.data.topCustomers(query.limit ?? 10);
    return { generatedAt: new Date().toISOString(), customers: rows };
  }

  async forecast(query: RevenueForecastQueryDto) {
    const tenantId = await this.operatorTenantId();
    const computed = await this.data.compute(30);
    const rows = await this.data.forecast(tenantId, computed, 30);
    const filtered = query.horizon
      ? rows.filter((row) => row.horizon === query.horizon)
      : rows;
    this.setGauges(computed, rows);
    return {
      generatedAt: new Date().toISOString(),
      basis: { mrr: computed.mrr, arr: computed.arr, method: 'MRR_GROWTH_LINEAR' },
      forecasts: filtered,
    };
  }

  async trends(query: RevenueTrendsQueryDto) {
    const tenantId = await this.operatorTenantId();
    return {
      generatedAt: new Date().toISOString(),
      months: query.months ?? 6,
      ...(await this.data.trends(query.months ?? 6, tenantId)),
    };
  }

  async listSegments(query: RevenueSegmentQueryDto) {
    const tenantId = await this.operatorTenantId();
    if (!query.period) {
      const computed = await this.data.compute(30);
      const all = [
        ...computed.byPlan.map((row) => ({
          dimension: RevenueDimension.PLAN,
          ...row,
        })),
        ...computed.byTenant.map((row) => ({
          dimension: RevenueDimension.TENANT,
          ...row,
        })),
        ...computed.byCountry.map((row) => ({
          dimension: RevenueDimension.COUNTRY,
          ...row,
        })),
      ];
      return query.dimension
        ? all.filter((row) => row.dimension === query.dimension)
        : all;
    }

    const where: Record<string, unknown> = { tenantId, period: query.period };
    if (query.dimension) where.dimension = query.dimension;
    return this.segments.find({ where, order: { mrr: 'DESC' } });
  }

  async listSnapshots(query: RevenueSnapshotQueryDto) {
    const tenantId = await this.operatorTenantId();
    const where: Record<string, unknown> = { tenantId };
    if (query.period) where.periodType = query.period;
    return this.snapshots.find({
      where,
      order: { snapshotDate: 'DESC' },
      take: query.limit ?? 30,
    });
  }

  async prometheusText(): Promise<string> {
    const tenantId = await this.operatorTenantId();
    const computed = await this.data.compute(30);
    const rows = await this.data.forecast(tenantId, computed, 30);
    this.setGauges(computed, rows);
    return this.promMetrics.text();
  }

  private setGauges(
    computed: Awaited<ReturnType<RevenueDataService['compute']>>,
    forecasts: ForecastRow[],
  ): void {
    const nextMonth =
      forecasts.find((row) => row.horizon === 'NEXT_MONTH')?.predictedRevenue ?? 0;
    const quarter =
      forecasts.find((row) => row.horizon === 'QUARTER')?.predictedRevenue ?? 0;
    const annual =
      forecasts.find((row) => row.horizon === 'ANNUAL')?.predictedRevenue ?? 0;
    const gauges: Array<[string, number]> = [
      ['revenue_mrr', computed.mrr],
      ['revenue_arr', computed.arr],
      ['revenue_expansion', computed.expansionRevenue],
      ['revenue_contraction', computed.contractionRevenue],
      ['revenue_net_new', computed.netNewRevenue],
      ['revenue_paid_30d', computed.paidRevenue],
      ['revenue_paying_customers', computed.payingCustomers],
      ['revenue_forecast_next_month', nextMonth],
      ['revenue_forecast_quarter', quarter],
      ['revenue_forecast_annual', annual],
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
      await this.audit.logAction('revenue_snapshot', id, AuditAction.CREATE, {
        newData: data,
      });
    } catch (error) {
      this.logger.warn(
        `Revenue snapshot audit skipped: ${
          error instanceof Error ? error.message : error
        }`,
      );
    }
  }
}

