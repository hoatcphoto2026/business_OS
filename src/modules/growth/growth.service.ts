import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { GrowthSnapshot } from './entities/growth-snapshot.entity';
import { GrowthExperiment } from './entities/growth-experiment.entity';
import { GrowthSegment } from './entities/growth-segment.entity';
import {
  ExperimentStatus,
  GrowthSegmentDimension,
  GrowthSnapshotPeriod,
} from './enums/growth.enum';
import {
  CreateExperimentDto,
  GenerateGrowthSnapshotDto,
  GrowthSegmentQueryDto,
  GrowthSnapshotQueryDto,
  GrowthWindowDto,
  UpdateExperimentDto,
} from './dto/growth.dto';
import { GrowthComputation, GrowthDataService } from './growth-data.service';
import { platformOperatorEmails } from '../executive/platform-operators';
import { TenantContextService } from '../../common/tenant-context/tenant-context.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/enums/audit-action.enum';
import { MetricsService } from '../../common/metrics/metrics.service';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Growth Intelligence (D5) – platform-wide growth drivers and funnels. */
@Injectable()
export class GrowthService {
  private readonly logger = new Logger(GrowthService.name);

  constructor(
    @InjectRepository(GrowthSnapshot)
    private readonly snapshots: Repository<GrowthSnapshot>,
    @InjectRepository(GrowthExperiment)
    private readonly experiments: Repository<GrowthExperiment>,
    @InjectRepository(GrowthSegment)
    private readonly segments: Repository<GrowthSegment>,
    private readonly dataSource: DataSource,
    private readonly data: GrowthDataService,
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

  async dashboard() {
    const tenantId = await this.operatorTenantId();
    const computed = await this.data.compute(30);
    const [daily] = await this.snapshots.find({
      where: { tenantId, periodType: GrowthSnapshotPeriod.DAILY },
      order: { snapshotDate: 'DESC' },
      take: 1,
    });
    const [monthly] = await this.snapshots.find({
      where: { tenantId, periodType: GrowthSnapshotPeriod.MONTHLY },
      order: { snapshotDate: 'DESC' },
      take: 1,
    });
    const [experimentStats] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status = 'RUNNING')::int AS running,
              COUNT(*) FILTER (WHERE status = 'COMPLETED')::int AS completed,
              COALESCE(AVG(uplift_pct) FILTER (WHERE status = 'COMPLETED'), 0)::numeric AS avg_uplift
         FROM growth_experiments WHERE tenant_id = $1`,
      [tenantId],
    );

    this.setGauges(computed);
    return {
      generatedAt: new Date().toISOString(),
      currency: 'VND',
      metrics: computed.metrics,
      totals: computed.totals,
      funnel: computed.funnel,
      planFunnel: computed.planFunnel,
      segments: { bySource: computed.bySource, byPlan: computed.byPlan },
      experiments: {
        total: experimentStats.total,
        running: experimentStats.running,
        completed: experimentStats.completed,
        averageUpliftPct: round2(Number(experimentStats.avg_uplift)),
      },
      latestDaily: daily ?? null,
      latestMonthly: monthly ?? null,
    };
  }

  async funnel(query: GrowthWindowDto) {
    const days = query.days ?? 30;
    const computed = await this.data.compute(days);
    return {
      generatedAt: new Date().toISOString(),
      days,
      funnel: computed.funnel,
      planFunnel: computed.planFunnel,
      onboarding: computed.onboarding,
    };
  }

  async conversions(query: GrowthWindowDto) {
    const days = query.days ?? 30;
    const computed = await this.data.compute(days);
    return {
      generatedAt: new Date().toISOString(),
      days,
      metrics: computed.metrics,
      details: computed.totals,
      onboarding: computed.onboarding,
      bySource: computed.bySource,
    };
  }

  async listSegments(query: GrowthSegmentQueryDto) {
    const tenantId = await this.operatorTenantId();
    if (!query.period) {
      const computed = await this.data.compute(30);
      return query.dimension === GrowthSegmentDimension.PLAN
        ? computed.byPlan
        : computed.bySource;
    }
    const where: Record<string, unknown> = { tenantId, period: query.period };
    if (query.dimension) where.dimension = query.dimension;
    return this.segments.find({ where, order: { tenants: 'DESC' } });
  }

  private uplift(conversionA: number, conversionB: number): number {
    if (conversionA > 0) {
      return round2(((conversionB - conversionA) / conversionA) * 100);
    }
    return conversionB > 0 ? 100 : 0;
  }

  async createExperiment(dto: CreateExperimentDto) {
    const tenantId = await this.operatorTenantId();
    const conversionA = dto.conversionA ?? 0;
    const conversionB = dto.conversionB ?? 0;
    const status = dto.status ?? ExperimentStatus.DRAFT;
    const saved = await this.experiments.save(
      this.experiments.create({
        tenantId,
        name: dto.name,
        hypothesis: dto.hypothesis ?? null,
        status,
        audience: dto.audience ?? 'ALL_TENANTS',
        variantA: dto.variantA ?? 'CONTROL',
        variantB: dto.variantB ?? 'VARIANT',
        sampleA: dto.sampleA ?? 0,
        sampleB: dto.sampleB ?? 0,
        conversionA: conversionA.toFixed(2),
        conversionB: conversionB.toFixed(2),
        upliftPct: this.uplift(conversionA, conversionB).toFixed(2),
        startedAt:
          dto.startedAt
            ? new Date(dto.startedAt)
            : status === ExperimentStatus.RUNNING
              ? new Date()
              : null,
        endedAt: null,
        metadata: dto.metadata ?? {},
        createdBy: this.currentUserId(),
      }),
    );
    await this.auditSafe(saved.id, AuditAction.CREATE, {
      name: saved.name,
      status: saved.status,
      upliftPct: saved.upliftPct,
    });
    this.promMetrics.inc('growth_experiments_total', { status: saved.status });
    return saved;
  }

  async listExperiments(status?: ExperimentStatus) {
    const tenantId = await this.operatorTenantId();
    const where: Record<string, unknown> = { tenantId };
    if (status) where.status = status;
    return this.experiments.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  async updateExperiment(id: string, dto: UpdateExperimentDto) {
    const tenantId = await this.operatorTenantId();
    const experiment = await this.experiments.findOne({
      where: { id, tenantId },
    });
    if (!experiment) throw new NotFoundException('Growth experiment not found');

    if (dto.archived === true) experiment.status = ExperimentStatus.ARCHIVED;
    if (dto.status !== undefined) experiment.status = dto.status;
    if (dto.sampleA !== undefined) experiment.sampleA = dto.sampleA;
    if (dto.sampleB !== undefined) experiment.sampleB = dto.sampleB;
    if (dto.conversionA !== undefined) {
      experiment.conversionA = dto.conversionA.toFixed(2);
    }
    if (dto.conversionB !== undefined) {
      experiment.conversionB = dto.conversionB.toFixed(2);
    }
    if (dto.metadata !== undefined) experiment.metadata = dto.metadata;
    if (dto.endedAt) {
      experiment.endedAt = new Date(dto.endedAt);
    } else if (
      experiment.status === ExperimentStatus.COMPLETED &&
      !experiment.endedAt
    ) {
      experiment.endedAt = new Date();
    }
    if (
      experiment.status === ExperimentStatus.RUNNING &&
      !experiment.startedAt
    ) {
      experiment.startedAt = new Date();
    }
    experiment.upliftPct = this.uplift(
      Number(experiment.conversionA),
      Number(experiment.conversionB),
    ).toFixed(2);
    experiment.updatedBy = this.currentUserId();

    const saved = await this.experiments.save(experiment);
    await this.auditSafe(saved.id, AuditAction.UPDATE, {
      name: saved.name,
      status: saved.status,
      conversionA: saved.conversionA,
      conversionB: saved.conversionB,
      upliftPct: saved.upliftPct,
    });
    return saved;
  }


  async generateSnapshot(dto: GenerateGrowthSnapshotDto = {}) {
    const period = dto.period ?? GrowthSnapshotPeriod.MONTHLY;
    const tenantId = await this.operatorTenantId();
    const userId = this.currentUserId();
    const computed = await this.data.compute(30);
    const now = new Date();
    const snapshotDate =
      period === GrowthSnapshotPeriod.MONTHLY
        ? `${now.toISOString().slice(0, 7)}-01`
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
    snapshot.trialConversionPct = computed.metrics.trialConversionPct.toFixed(2);
    snapshot.paidConversionPct = computed.metrics.paidConversionPct.toFixed(2);
    snapshot.expansionRatePct = computed.metrics.expansionRatePct.toFixed(2);
    snapshot.upsellRatePct = computed.metrics.upsellRatePct.toFixed(2);
    snapshot.activationRatePct = computed.metrics.activationRatePct.toFixed(2);
    snapshot.onboardingSuccessPct =
      computed.metrics.onboardingSuccessPct.toFixed(2);
    snapshot.tenants = computed.totals.tenants;
    snapshot.trials = computed.totals.trials;
    snapshot.paidTenants = computed.totals.paidTenants;
    snapshot.activatedTenants = computed.totals.activatedTenants;
    snapshot.upgrades = computed.totals.upgrades;
    snapshot.downgrades = computed.totals.downgrades;
    snapshot.mrr = computed.totals.mrr.toFixed(2);
    snapshot.funnel = computed.funnel as unknown as Record<string, unknown>;
    snapshot.bySource =
      computed.bySource as unknown as Array<Record<string, unknown>>;
    snapshot.byPlan =
      computed.byPlan as unknown as Array<Record<string, unknown>>;
    snapshot.generatedAt = now;
    snapshot.updatedBy = userId;
    const saved = await this.snapshots.save(snapshot);

    const groups: Array<{
      dimension: GrowthSegmentDimension;
      rows: typeof computed.bySource;
    }> = [
      { dimension: GrowthSegmentDimension.SOURCE, rows: computed.bySource },
      { dimension: GrowthSegmentDimension.PLAN, rows: computed.byPlan },
    ];
    let segmentCount = 0;
    for (const group of groups) {
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
        segment.tenants = row.tenants;
        segment.trials = row.trials;
        segment.paidTenants = row.paidTenants;
        segment.conversions = row.paidTenants;
        segment.mrr = row.mrr.toFixed(2);
        segment.sharePct = row.sharePct.toFixed(2);
        segment.metadata = {};
        segment.updatedBy = userId;
        await this.segments.save(segment);
        segmentCount += 1;
      }
    }

    this.setGauges(computed);
    this.promMetrics.inc('growth_snapshots_total', { period });
    await this.auditSafe(saved.id, AuditAction.CREATE, {
      period,
      snapshotDate,
      metrics: computed.metrics,
      tenants: computed.totals.tenants,
      upgrades: computed.totals.upgrades,
    });

    return { snapshot: saved, segments: segmentCount };
  }

  async listSnapshots(query: GrowthSnapshotQueryDto) {
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
    const computed = await this.data.compute(30);
    this.setGauges(computed);
    return this.promMetrics.text();
  }

  private setGauges(computed: GrowthComputation): void {
    const gauges: Array<[string, number]> = [
      ['growth_tenants', computed.totals.tenants],
      ['growth_activated_tenants', computed.totals.activatedTenants],
      ['growth_paid_tenants', computed.totals.paidTenants],
      ['growth_trial_conversion_pct', computed.metrics.trialConversionPct],
      ['growth_paid_conversion_pct', computed.metrics.paidConversionPct],
      ['growth_expansion_rate_pct', computed.metrics.expansionRatePct],
      ['growth_upsell_rate_pct', computed.metrics.upsellRatePct],
      ['growth_activation_rate_pct', computed.metrics.activationRatePct],
      ['growth_onboarding_success_pct', computed.metrics.onboardingSuccessPct],
    ];
    for (const [name, value] of gauges) {
      this.promMetrics.set(name, value);
    }
  }

  private async auditSafe(
    id: string,
    action: AuditAction,
    data: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.audit.logAction('growth', id, action, { newData: data });
    } catch (error) {
      this.logger.warn(
        `Growth audit skipped: ${
          error instanceof Error ? error.message : error
        }`,
      );
    }
  }
}

