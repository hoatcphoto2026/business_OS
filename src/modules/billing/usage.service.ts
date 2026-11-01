import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { UsageRecord } from './entities/usage-record.entity';
import { UsageDaily } from './entities/usage-daily.entity';
import { UsageMonthly } from './entities/usage-monthly.entity';
import { UsageMetric } from './enums/usage.enum';
import { TenantContextService } from '../../common/tenant-context/tenant-context.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/enums/audit-action.enum';
import { MetricsService } from '../../common/metrics/metrics.service';

@Injectable()
export class UsageService {
  private readonly logger = new Logger(UsageService.name);

  constructor(
    @InjectRepository(UsageRecord)
    private readonly records: Repository<UsageRecord>,
    @InjectRepository(UsageDaily)
    private readonly daily: Repository<UsageDaily>,
    @InjectRepository(UsageMonthly)
    private readonly monthly: Repository<UsageMonthly>,
    private readonly tenantContext: TenantContextService,
    private readonly audit: AuditService,
    private readonly metricsService: MetricsService,
  ) {}

  // ──────────────────────────────────────────────
  // Record
  // ──────────────────────────────────────────────

  async record(
    metric: UsageMetric,
    quantity = 1,
    metadata: Record<string, unknown> = {},
    tenantId?: string,
  ): Promise<UsageRecord> {
    const tid = tenantId ?? this.tenantContext.getCurrentTenantId();
    if (!tid) throw new Error('tenantId required to record usage');

    const row = this.records.create({
      tenantId: tid,
      metric,
      quantity,
      recordedAt: new Date(),
      metadata,
      createdBy: this.safeUserId(),
    });
    const saved = await this.records.save(row);

    this.metricsService.inc('usage_recorded_total', { metric, tenant: tid }, quantity);
    this.logger.debug(`Recorded ${quantity} ${metric} for ${tid}`);

    return saved;
  }

  // ──────────────────────────────────────────────
  // Queries
  // ──────────────────────────────────────────────

  async getCurrent(tenantId?: string): Promise<Record<string, number>> {
    const tid = tenantId ?? this.tenantContext.getCurrentTenantId();
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const rows = await this.records
      .createQueryBuilder('r')
      .select('r.metric', 'metric')
      .addSelect('SUM(r.quantity)', 'total')
      .where('r.tenant_id = :tid', { tid })
      .andWhere('r.recorded_at >= :start', { start })
      .groupBy('r.metric')
      .getRawMany<{ metric: string; total: string }>();

    const result: Record<string, number> = {};
    for (const m of Object.values(UsageMetric)) result[m] = 0;
    for (const r of rows) result[r.metric] = parseInt(r.total, 10) || 0;
    return result;
  }

  async getMonthly(month?: string, tenantId?: string): Promise<UsageMonthly[]> {
    const tid = tenantId ?? this.tenantContext.getCurrentTenantId();
    const m = month ?? new Date().toISOString().slice(0, 7);
    return this.monthly.find({
      where: { tenantId: tid, month: m },
      order: { metric: 'ASC' },
    });
  }

  async getRange(from: Date, to: Date, tenantId?: string): Promise<UsageDaily[]> {
    const tid = tenantId ?? this.tenantContext.getCurrentTenantId();
    return this.daily.find({
      where: {
        tenantId: tid,
        day: Between(from.toISOString().slice(0, 10), to.toISOString().slice(0, 10)) as any,
      },
      order: { day: 'ASC', metric: 'ASC' },
    });
  }

  // ──────────────────────────────────────────────
  // Aggregation
  // ──────────────────────────────────────────────

  async aggregateDaily(day?: string): Promise<number> {
    const d = day ?? new Date().toISOString().slice(0, 10);
    // Use local day boundaries to avoid timezone mismatch
    const start = new Date(d + 'T00:00:00');
    const end = new Date(d + 'T23:59:59.999');

    const rows = await this.records
      .createQueryBuilder('r')
      .select('r.tenant_id', 'tenantId')
      .addSelect('r.metric', 'metric')
      .addSelect('SUM(r.quantity)', 'total')
      .where('r.recorded_at >= :start AND r.recorded_at <= :end', { start, end })
      .groupBy('r.tenant_id')
      .addGroupBy('r.metric')
      .getRawMany<{ tenantId: string; metric: string; total: string }>();

    this.logger.debug(`aggregateDaily ${d}: found ${rows.length} groups`);

    let upserted = 0;
    for (const r of rows) {
      const existing = await this.daily.findOne({
        where: { tenantId: r.tenantId, metric: r.metric as UsageMetric, day: d },
      });
      if (existing) {
        existing.total = parseInt(r.total, 10) || 0;
        await this.daily.save(existing);
      } else {
        await this.daily.save(
          this.daily.create({
            tenantId: r.tenantId,
            metric: r.metric as UsageMetric,
            day: d,
            total: parseInt(r.total, 10) || 0,
          }),
        );
      }
      upserted++;
    }

    try {
      await this.audit.logAction('UsageDaily', d, AuditAction.UPDATE, {
        newData: { day: d, rows: upserted },
      });
    } catch {
      this.logger.warn('Audit skipped for daily aggregation');
    }
    this.logger.log(`Aggregated daily usage for ${d}: ${upserted} rows`);
    return upserted;
  }

  async aggregateMonthly(month?: string): Promise<number> {
    const m = month ?? new Date().toISOString().slice(0, 7);
    const start = m + '-01';
    const endDate = new Date(m + '-01');
    endDate.setMonth(endDate.getMonth() + 1);
    endDate.setDate(0);
    const end = endDate.toISOString().slice(0, 10);

    const rows = await this.daily
      .createQueryBuilder('d')
      .select('d.tenant_id', 'tenantId')
      .addSelect('d.metric', 'metric')
      .addSelect('SUM(d.total)', 'total')
      .where('d.day BETWEEN :start AND :end', { start, end })
      .groupBy('d.tenant_id')
      .addGroupBy('d.metric')
      .getRawMany<{ tenantId: string; metric: string; total: string }>();

    let upserted = 0;
    for (const r of rows) {
      const existing = await this.monthly.findOne({
        where: { tenantId: r.tenantId, metric: r.metric as UsageMetric, month: m },
      });
      if (existing) {
        existing.total = parseInt(r.total, 10) || 0;
        await this.monthly.save(existing);
      } else {
        await this.monthly.save(
          this.monthly.create({
            tenantId: r.tenantId,
            metric: r.metric as UsageMetric,
            month: m,
            total: parseInt(r.total, 10) || 0,
          }),
        );
      }
      upserted++;
    }

    try {
      await this.audit.logAction('UsageMonthly', m, AuditAction.UPDATE, {
        newData: { month: m, rows: upserted },
      });
    } catch {
      this.logger.warn('Audit skipped for monthly aggregation');
    }
    this.logger.log(`Aggregated monthly usage for ${m}: ${upserted} rows`);
    return upserted;
  }

  // ──────────────────────────────────────────────
  // Prometheus
  // ──────────────────────────────────────────────

  private safeUserId(): string | null {
    try {
      return this.tenantContext.getCurrentUserId() || null;
    } catch {
      return null;
    }
  }



  async getPrometheusText(): Promise<string> {
    return this.metricsService.text();
  }
}
