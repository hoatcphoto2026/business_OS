import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { FeatureUsage } from './entities/feature-usage.entity';
import { FeatureAdoption } from './entities/feature-adoption.entity';
import { FeatureTrend } from './entities/feature-trend.entity';
import {
  AdoptionDimension,
  FEATURE_CATALOG,
  FeatureKey,
  UsageSource,
} from './enums/product-analytics.enum';
import {
  FeatureAdoptionQueryDto,
  FeatureTrendQueryDto,
  FeatureUsageWindowDto,
  TrackFeatureUsageDto,
} from './dto/product-analytics.dto';
import { platformOperatorEmails } from '../executive/platform-operators';
import { TenantContextService } from '../../common/tenant-context/tenant-context.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/enums/audit-action.enum';
import { MetricsService } from '../../common/metrics/metrics.service';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Tables that already represent a product feature (derived usage). */
const DERIVED_SOURCES: Array<{ table: string; feature: FeatureKey }> = [
  { table: 'sales_orders', feature: FeatureKey.SALES_ORDERS },
  { table: 'invoices', feature: FeatureKey.INVOICES },
  { table: 'customers', feature: FeatureKey.CUSTOMERS },
  { table: 'products', feature: FeatureKey.PRODUCTS },
  { table: 'support_tickets', feature: FeatureKey.SUPPORT },
  { table: 'report_runs', feature: FeatureKey.REPORTS },
  { table: 'compliance_evidence', feature: FeatureKey.COMPLIANCE },
  { table: 'security_events', feature: FeatureKey.SECURITY },
  { table: 'scim_provisioning_logs', feature: FeatureKey.SCIM },
  { table: 'api_keys', feature: FeatureKey.API_KEYS },
  { table: 'scheduled_jobs', feature: FeatureKey.AUTOMATION },
];

/**
 * Product Analytics (D4). Feature usage is stored per customer tenant; the
 * operator dashboards aggregate across all tenants.
 */
@Injectable()
export class ProductAnalyticsService {
  private readonly logger = new Logger(ProductAnalyticsService.name);

  constructor(
    @InjectRepository(FeatureUsage)
    private readonly usageRepo: Repository<FeatureUsage>,
    @InjectRepository(FeatureAdoption)
    private readonly adoptionRepo: Repository<FeatureAdoption>,
    @InjectRepository(FeatureTrend)
    private readonly trendRepo: Repository<FeatureTrend>,
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

  private currentTenantId(): string {
    return this.tenantContext.getCurrentTenantId();
  }

  async operatorTenantId(): Promise<string> {
    try {
      return this.tenantContext.getCurrentTenantId();
    } catch {
      // No ALS (seeder/cron): resolve from the operator allowlist below.
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

  catalog() {
    return FEATURE_CATALOG;
  }

  /** Explicit usage event (requires tenant context). */
  async track(dto: TrackFeatureUsageDto) {
    const tenantId = this.currentTenantId();
    const userId = this.currentUserId();
    const row = await this.usageRepo.save(
      this.usageRepo.create({
        tenantId,
        featureKey: dto.featureKey,
        userId,
        organizationId: dto.organizationId ?? null,
        departmentId: dto.departmentId ?? null,
        action: dto.action ?? 'USE',
        quantity: dto.quantity ?? 1,
        userCount: userId ? 1 : 0,
        source: UsageSource.TRACKED,
        dedupeKey: null,
        occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
        metadata: dto.metadata ?? {},
        createdBy: userId,
      }),
    );
    this.promMetrics.inc('product_feature_usage_tracked_total', {
      feature: dto.featureKey,
    });
    return row;
  }

  /** Derive daily usage rows from existing business tables (idempotent). */
  async collect(query: FeatureUsageWindowDto) {
    const days = query.days ?? 30;
    let inserted = 0;
    let firstId: string | null = null;

    for (const source of DERIVED_SOURCES) {
      const rows: Array<{ id: string }> = await this.dataSource.query(
        `INSERT INTO feature_usage
           (id, tenant_id, feature_key, user_id, organization_id, department_id,
            action, quantity, user_count, source, dedupe_key, occurred_at,
            metadata, created_at, updated_at)
         SELECT gen_random_uuid(), s.tenant_id, $2::varchar(40), NULL, NULL, NULL,
                'USE', COUNT(*)::int, COUNT(DISTINCT s.created_by)::int,
                'DERIVED',
                $2::text || ':' || s.tenant_id || ':' || to_char(s.created_at, 'YYYY-MM-DD'),
                date_trunc('day', s.created_at), '{}'::jsonb, now(), now()
           FROM "${source.table}" s
          WHERE s.created_at > now() - ($1 * interval '1 day')
          GROUP BY s.tenant_id, date_trunc('day', s.created_at),
                   to_char(s.created_at, 'YYYY-MM-DD')
         ON CONFLICT (tenant_id, dedupe_key) DO NOTHING
         RETURNING id`,
        [days, source.feature],
      );
      inserted += rows.length;
      if (!firstId && rows.length > 0) firstId = rows[0].id;
    }

    this.promMetrics.inc('product_analytics_collected_total');
    if (firstId) {
      await this.auditSafe(firstId, {
        days,
        inserted,
        sources: DERIVED_SOURCES.map((source) => source.feature),
      });
    }
    this.logger.log(`Derived ${inserted} feature usage rows (${days}d window)`);
    return { days, inserted };
  }

  private async auditSafe(
    id: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.audit.logAction('product_analytics', id, AuditAction.CREATE, {
        newData: data,
      });
    } catch (error) {
      this.logger.warn(
        `Product analytics audit skipped: ${
          error instanceof Error ? error.message : error
        }`,
      );
    }
  }


  async rankings(query: FeatureUsageWindowDto) {
    const days = query.days ?? 30;
    const [totals] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS tenants FROM tenants WHERE status IN ('active', 'trial')`,
    );
    const rows: Array<{
      feature_key: string;
      usage_count: number;
      previous_usage: number;
      active_tenants: number;
      previous_tenants: number;
      retained_tenants: number;
    }> = await this.dataSource.query(
      `WITH cur AS (
         SELECT feature_key, tenant_id, SUM(quantity)::int AS q
           FROM feature_usage
          WHERE occurred_at > now() - ($1 * interval '1 day')
          GROUP BY 1, 2
       ), prev AS (
         SELECT feature_key, tenant_id, SUM(quantity)::int AS q
           FROM feature_usage
          WHERE occurred_at BETWEEN now() - ($1 * 2 * interval '1 day')
                                AND now() - ($1 * interval '1 day')
          GROUP BY 1, 2
       )
       SELECT COALESCE(c.feature_key, p.feature_key) AS feature_key,
              COALESCE(SUM(c.q), 0)::int AS usage_count,
              COALESCE(SUM(p.q), 0)::int AS previous_usage,
              COUNT(DISTINCT c.tenant_id)::int AS active_tenants,
              COUNT(DISTINCT p.tenant_id)::int AS previous_tenants,
              COUNT(DISTINCT c.tenant_id) FILTER (WHERE p.tenant_id IS NOT NULL)::int AS retained_tenants
         FROM cur c
         FULL OUTER JOIN prev p
           ON p.feature_key = c.feature_key AND p.tenant_id = c.tenant_id
        GROUP BY 1`,
      [days],
    );

    const totalTenants = totals.tenants as number;
    const features = FEATURE_CATALOG.map((definition) => {
      const row = rows.find((item) => item.feature_key === definition.key);
      const usageCount = row?.usage_count ?? 0;
      const previousUsage = row?.previous_usage ?? 0;
      const activeTenants = row?.active_tenants ?? 0;
      const previousTenants = row?.previous_tenants ?? 0;
      const retainedTenants = row?.retained_tenants ?? 0;
      return {
        featureKey: definition.key,
        label: definition.label,
        usageCount,
        activeTenants,
        activeUsers: 0,
        activationPct:
          totalTenants > 0 ? round2((activeTenants / totalTenants) * 100) : 0,
        retentionPct:
          previousTenants > 0
            ? round2((retainedTenants / previousTenants) * 100)
            : activeTenants > 0
              ? 100
              : 0,
        growthPct:
          previousUsage > 0
            ? round2(((usageCount - previousUsage) / previousUsage) * 100)
            : usageCount > 0
              ? 100
              : 0,
      };
    });

    const mostUsed = [...features]
      .sort((a, b) => b.usageCount - a.usageCount)
      .slice(0, 5);
    const leastUsed = [...features]
      .sort((a, b) => a.usageCount - b.usageCount)
      .slice(0, 5);
    const activeFeatures = features.filter((row) => row.usageCount > 0).length;

    this.promMetrics.set('product_analytics_features', features.length);
    this.promMetrics.set('product_analytics_active_features', activeFeatures);
    this.promMetrics.set(
      'product_analytics_usage_30d',
      features.reduce((sum, row) => sum + row.usageCount, 0),
    );
    this.promMetrics.set(
      'product_analytics_avg_activation_pct',
      features.length
        ? round2(
            features.reduce((sum, row) => sum + row.activationPct, 0) /
              features.length,
          )
        : 0,
    );

    return {
      generatedAt: new Date().toISOString(),
      days,
      totalActiveTenants: totalTenants,
      totals: {
        features: features.length,
        activeFeatures,
        usage: features.reduce((sum, row) => sum + row.usageCount, 0),
      },
      mostUsed,
      leastUsed,
      features,
    };
  }


  private periodRange(period?: string): { period: string; start: Date; end: Date } {
    const now = new Date();
    const key = period ?? `${now.toISOString().slice(0, 7)}`;
    if (!/^\d{4}-\d{2}$/.test(key)) {
      throw new BadRequestException('Period must be formatted as YYYY-MM');
    }
    const [year, month] = key.split('-').map(Number);
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 1));
    return { period: key, start, end };
  }

  async adoption(query: FeatureAdoptionQueryDto) {
    const dimension = query.dimension ?? AdoptionDimension.TENANT;
    const { period, start, end } = this.periodRange(query.period);
    const operatorTenantId = await this.operatorTenantId();

    const sqlByDimension: Record<AdoptionDimension, string> = {
      [AdoptionDimension.TENANT]: `
        SELECT f.feature_key, f.tenant_id::text AS key, t.code AS label,
               SUM(f.quantity)::int AS usage_count,
               COUNT(DISTINCT f.tenant_id)::int AS active_tenants,
               COALESCE(SUM(f.user_count), 0)::int AS active_users
          FROM feature_usage f
          JOIN tenants t ON t.id = f.tenant_id
         WHERE f.occurred_at >= $1 AND f.occurred_at < $2
         GROUP BY 1, 2, 3`,
      [AdoptionDimension.PLAN]: `
        SELECT f.feature_key, COALESCE(sub.code, 'UNKNOWN') AS key,
               COALESCE(sub.code, 'UNKNOWN') AS label,
               SUM(f.quantity)::int AS usage_count,
               COUNT(DISTINCT f.tenant_id)::int AS active_tenants,
               COALESCE(SUM(f.user_count), 0)::int AS active_users
          FROM feature_usage f
          LEFT JOIN LATERAL (
            SELECT p.code
              FROM subscriptions s
              JOIN plans p ON p.id = s.plan_id
             WHERE s.tenant_id = f.tenant_id
             ORDER BY s.created_at DESC
             LIMIT 1
          ) sub ON true
         WHERE f.occurred_at >= $1 AND f.occurred_at < $2
         GROUP BY 1, 2, 3`,
      [AdoptionDimension.ORGANIZATION]: `
        SELECT f.feature_key,
               COALESCE(f.organization_id::text, 'UNASSIGNED') AS key,
               COALESCE(o.name, 'Unassigned') AS label,
               SUM(f.quantity)::int AS usage_count,
               COUNT(DISTINCT f.tenant_id)::int AS active_tenants,
               COALESCE(SUM(f.user_count), 0)::int AS active_users
          FROM feature_usage f
          LEFT JOIN enterprise_organizations o ON o.id = f.organization_id
         WHERE f.occurred_at >= $1 AND f.occurred_at < $2
         GROUP BY 1, 2, 3`,
      [AdoptionDimension.DEPARTMENT]: `
        SELECT f.feature_key,
               COALESCE(f.department_id::text, 'UNASSIGNED') AS key,
               COALESCE(d.name, 'Unassigned') AS label,
               SUM(f.quantity)::int AS usage_count,
               COUNT(DISTINCT f.tenant_id)::int AS active_tenants,
               COALESCE(SUM(f.user_count), 0)::int AS active_users
          FROM feature_usage f
          LEFT JOIN enterprise_departments d ON d.id = f.department_id
         WHERE f.occurred_at >= $1 AND f.occurred_at < $2
         GROUP BY 1, 2, 3`,
    };

    const rows: Array<{
      feature_key: string;
      key: string;
      label: string;
      usage_count: number;
      active_tenants: number;
      active_users: number;
    }> = await this.dataSource.query(sqlByDimension[dimension], [start, end]);

    const byFeature = new Map<string, typeof rows>();
    for (const row of rows) {
      const list = byFeature.get(row.feature_key) ?? [];
      list.push(row);
      byFeature.set(row.feature_key, list);
    }

    const features = FEATURE_CATALOG.map((definition) => {
      const featureRows = byFeature.get(definition.key) ?? [];
      const totalUsage = featureRows.reduce(
        (sum, row) => sum + row.usage_count,
        0,
      );
      return {
        featureKey: definition.key,
        label: definition.label,
        totalUsage,
        rows: featureRows
          .map((row) => ({
            key: row.key,
            label: row.label,
            usageCount: row.usage_count,
            activeTenants: row.active_tenants,
            activeUsers: row.active_users,
            adoptionPct:
              totalUsage > 0
                ? round2((row.usage_count / totalUsage) * 100)
                : 0,
          }))
          .sort((a, b) => b.usageCount - a.usageCount),
      };
    });

    for (const feature of features) {
      for (const row of feature.rows) {
        let saved = await this.adoptionRepo.findOne({
          where: {
            tenantId: operatorTenantId,
            featureKey: feature.featureKey,
            dimension,
            dimensionKey: row.key,
            period,
          },
        });
        if (!saved) {
          saved = this.adoptionRepo.create({
            tenantId: operatorTenantId,
            featureKey: feature.featureKey,
            dimension,
            dimensionKey: row.key,
            period,
            createdBy: this.currentUserId(),
          });
        }
        saved.dimensionLabel = row.label;
        saved.usageCount = row.usageCount;
        saved.activeTenants = row.activeTenants;
        saved.activeUsers = row.activeUsers;
        saved.adoptionPct = row.adoptionPct.toFixed(2);
        saved.updatedBy = this.currentUserId();
        await this.adoptionRepo.save(saved);
      }
    }

    return {
      generatedAt: new Date().toISOString(),
      period,
      dimension,
      features,
    };
  }


  async trends(query: FeatureTrendQueryDto) {
    const days = query.days ?? 30;
    const operatorTenantId = await this.operatorTenantId();
    const params: unknown[] = [days];
    let featureFilter = '';
    if (query.feature) {
      params.push(query.feature);
      featureFilter = ' AND feature_key = $2';
    }

    const rows: Array<{
      feature_key: string;
      day: string | Date;
      usage_count: number;
      active_tenants: number;
      active_users: number;
      previous_usage: number | null;
      previous_tenants: number | null;
      retained_tenants: number | null;
    }> = await this.dataSource.query(
      `WITH daily AS (
         SELECT feature_key, occurred_at::date AS day,
                SUM(quantity)::int AS usage_count,
                COUNT(DISTINCT tenant_id)::int AS active_tenants,
                COALESCE(SUM(user_count), 0)::int AS active_users,
                array_agg(DISTINCT tenant_id) AS tenant_ids
           FROM feature_usage
          WHERE occurred_at > now() - ($1 * interval '1 day')${featureFilter}
          GROUP BY 1, 2
       ), paired AS (
         SELECT d.feature_key, d.day, d.usage_count, d.active_tenants,
                d.active_users, p.usage_count AS previous_usage,
                p.active_tenants AS previous_tenants,
                CASE WHEN p.tenant_ids IS NULL THEN NULL ELSE
                  (SELECT COUNT(*) FROM (
                     SELECT unnest(d.tenant_ids)
                     INTERSECT
                     SELECT unnest(p.tenant_ids)
                   ) shared)
                END AS retained_tenants
           FROM daily d
           LEFT JOIN daily p
             ON p.feature_key = d.feature_key AND p.day = d.day - 1
       )
       SELECT feature_key, day, usage_count, active_tenants, active_users,
              previous_usage, previous_tenants, retained_tenants
         FROM paired
        ORDER BY day ASC, feature_key ASC`,
      params,
    );

    const series = new Map<
      string,
      Array<{
        date: string;
        usageCount: number;
        activeTenants: number;
        activeUsers: number;
        growthPct: number;
        retentionPct: number | null;
      }>
    >();

    for (const row of rows) {
      const growthPct =
        row.previous_usage && row.previous_usage > 0
          ? round2(((row.usage_count - row.previous_usage) / row.previous_usage) * 100)
          : row.usage_count > 0
            ? 100
            : 0;
      const retentionPct =
        row.previous_tenants && row.previous_tenants > 0
          ? round2(((row.retained_tenants ?? 0) / row.previous_tenants) * 100)
          : null;

      const points = series.get(row.feature_key) ?? [];
      const dayIso = new Date(row.day).toISOString().slice(0, 10);
      points.push({
        date: dayIso,
        usageCount: row.usage_count,
        activeTenants: row.active_tenants,
        activeUsers: row.active_users,
        growthPct,
        retentionPct,
      });
      series.set(row.feature_key, points);

      let saved = await this.trendRepo.findOne({
        where: {
          tenantId: operatorTenantId,
          featureKey: row.feature_key,
          periodDate: dayIso,
        },
      });
      if (!saved) {
        saved = this.trendRepo.create({
          tenantId: operatorTenantId,
          featureKey: row.feature_key,
          periodDate: dayIso,
          createdBy: this.currentUserId(),
        });
      }
      saved.usageCount = row.usage_count;
      saved.activeTenants = row.active_tenants;
      saved.activeUsers = row.active_users;
      saved.growthPct = growthPct.toFixed(2);
      saved.retentionPct =
        retentionPct == null ? null : retentionPct.toFixed(2);
      saved.generatedAt = new Date();
      saved.updatedBy = this.currentUserId();
      await this.trendRepo.save(saved);
    }

    this.promMetrics.inc('product_analytics_trends_generated_total');
    return {
      generatedAt: new Date().toISOString(),
      days,
      series: Array.from(series.entries()).map(([featureKey, points]) => ({
        featureKey,
        points,
      })),
    };
  }

  async prometheusText(): Promise<string> {
    await this.rankings({ days: 30 });
    return this.promMetrics.text();
  }
}

