import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { WarehouseSnapshot } from './entities/warehouse-facts.entity';
import {
  WarehouseFactType,
  WarehousePeriod,
  WarehouseTrendMetric,
} from './enums/warehouse.enum';
import {
  GenerateWarehouseSnapshotDto,
  RunEtlDto,
  WarehouseFactsQueryDto,
  WarehouseSnapshotQueryDto,
  WarehouseTrendsQueryDto,
} from './dto/warehouse.dto';
import {
  DimensionCounts,
  EtlFactCounts,
  WarehouseEtlService,
} from './warehouse-etl.service';
import { platformOperatorEmails } from '../executive/platform-operators';
import { TenantContextService } from '../../common/tenant-context/tenant-context.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/enums/audit-action.enum';
import { MetricsService } from '../../common/metrics/metrics.service';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

const FACT_TABLES: Record<WarehouseFactType, string> = {
  [WarehouseFactType.REVENUE]: 'fact_revenue',
  [WarehouseFactType.USAGE]: 'fact_usage',
  [WarehouseFactType.CUSTOMER]: 'fact_customer',
  [WarehouseFactType.COMPLIANCE]: 'fact_compliance',
  [WarehouseFactType.SECURITY]: 'fact_security',
};

const TREND_SOURCES: Record<
  WarehouseTrendMetric,
  { table: string; expression: string }
> = {
  [WarehouseTrendMetric.REVENUE]: {
    table: 'fact_revenue',
    expression: 'SUM(revenue_amount)',
  },
  [WarehouseTrendMetric.USAGE]: {
    table: 'fact_usage',
    expression: 'SUM(quantity)',
  },
  [WarehouseTrendMetric.ACTIVE_USERS]: {
    table: 'fact_customer',
    expression: 'SUM(active_users)',
  },
  [WarehouseTrendMetric.TICKETS]: {
    table: 'fact_customer',
    expression: 'SUM(tickets_opened)',
  },
  [WarehouseTrendMetric.COMPLIANCE_SCORE]: {
    table: 'fact_compliance',
    expression: 'AVG(compliance_score)',
  },
  [WarehouseTrendMetric.SECURITY_EVENTS]: {
    table: 'fact_security',
    expression: 'SUM(security_events)',
  },
};

/** EPIC D8 – Analytics Warehouse Layer (operator-only, platform-wide). */
@Injectable()
export class WarehouseService {
  private readonly logger = new Logger(WarehouseService.name);

  constructor(
    @InjectRepository(WarehouseSnapshot)
    private readonly snapshots: Repository<WarehouseSnapshot>,
    private readonly dataSource: DataSource,
    private readonly etl: WarehouseEtlService,
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
      // No ALS (scheduler/seed): resolve from the operator allowlist below.
    }
    const emails = platformOperatorEmails();
    if (emails.length === 0) {
      throw new BadRequestException('No platform operator configured');
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
      throw new BadRequestException('Operator tenant not found');
    }
    return rows[0].tenant_id as string;
  }

  private async resolveRange(
    from: string | undefined,
    to: string | undefined,
    defaultDays = 7,
  ): Promise<{ from: string; to: string }> {
    const [bounds] = await this.dataSource.query(
      `SELECT to_char(CURRENT_DATE, 'YYYY-MM-DD') AS today,
              to_char(CURRENT_DATE - ($1::int - 1), 'YYYY-MM-DD') AS start_day`,
      [defaultDays],
    );
    const resolvedFrom = from ?? bounds.start_day;
    const resolvedTo = to ?? bounds.today;
    if (resolvedFrom > resolvedTo) {
      throw new BadRequestException('"from" must be before or equal to "to"');
    }
    return { from: resolvedFrom, to: resolvedTo };
  }

  async runEtl(dto: RunEtlDto = {}) {
    const owner = await this.operatorTenantId();
    const { from, to } = await this.resolveRange(dto.from, dto.to);
    const result = await this.etl.run(
      owner,
      from,
      to,
      dto.refreshDimensions ?? true,
    );

    this.promMetrics.inc('warehouse_etl_runs_total', { status: 'SUCCESS' });
    for (const [fact, count] of Object.entries(result.facts)) {
      this.promMetrics.inc('warehouse_fact_rows_total', { fact }, count);
      this.promMetrics.set('warehouse_fact_rows', count, { fact });
    }
    await this.auditSafe(owner, 'warehouse_etl', {
      from,
      to,
      facts: result.facts,
      dimensions: result.dimensions,
    });

    return {
      status: 'COMPLETED',
      from,
      to,
      ranAt: new Date().toISOString(),
      facts: result.facts satisfies EtlFactCounts,
      dimensions: result.dimensions satisfies DimensionCounts | null,
    };
  }

  async generateSnapshot(dto: GenerateWarehouseSnapshotDto = {}) {
    const owner = await this.operatorTenantId();
    const period = dto.period ?? WarehousePeriod.DAILY;
    const [today] = await this.dataSource.query(
      `SELECT to_char(CURRENT_DATE, 'YYYY-MM-DD') AS today`,
    );
    const snapshotDate = dto.date ?? today.today;

    let start = snapshotDate;
    let end = snapshotDate;
    if (period === WarehousePeriod.MONTHLY) {
      const [bounds] = await this.dataSource.query(
        `SELECT to_char(date_trunc('month', $1::date), 'YYYY-MM-DD') AS first_day,
                to_char((date_trunc('month', $1::date) + interval '1 month - 1 day')::date, 'YYYY-MM-DD') AS last_day`,
        [snapshotDate],
      );
      start = bounds.first_day;
      end = bounds.last_day;
    }

    const [revenue] = await this.dataSource.query(
      `SELECT COALESCE(SUM(revenue_amount), 0)::float8 AS revenue,
              COALESCE(SUM(mrr), 0)::float8 AS mrr,
              COUNT(*)::int AS rows
         FROM fact_revenue WHERE tenant_id = $1 AND fact_date BETWEEN $2 AND $3`,
      [owner, start, end],
    );
    const [usage] = await this.dataSource.query(
      `SELECT COALESCE(SUM(quantity), 0)::float8 AS quantity, COUNT(*)::int AS rows
         FROM fact_usage WHERE tenant_id = $1 AND fact_date BETWEEN $2 AND $3`,
      [owner, start, end],
    );
    const [customer] = await this.dataSource.query(
      `SELECT COALESCE(SUM(active_users), 0)::float8 AS active_users,
              COALESCE(SUM(tickets_opened), 0)::float8 AS tickets,
              COALESCE(AVG(health_score), 0)::float8 AS health,
              COUNT(DISTINCT source_tenant_id)::int AS tenants,
              COUNT(*)::int AS rows
         FROM fact_customer WHERE tenant_id = $1 AND fact_date BETWEEN $2 AND $3`,
      [owner, start, end],
    );
    const [compliance] = await this.dataSource.query(
      `SELECT COALESCE(AVG(compliance_score), 0)::float8 AS score,
              COALESCE(SUM(open_risks), 0)::float8 AS open_risks,
              COUNT(*)::int AS rows
         FROM fact_compliance WHERE tenant_id = $1 AND fact_date BETWEEN $2 AND $3`,
      [owner, start, end],
    );
    const [security] = await this.dataSource.query(
      `SELECT COALESCE(SUM(security_events), 0)::float8 AS events,
              COALESCE(SUM(critical_events), 0)::float8 AS critical,
              COALESCE(SUM(failed_logins), 0)::float8 AS failed_logins,
              COUNT(*)::int AS rows
         FROM fact_security WHERE tenant_id = $1 AND fact_date BETWEEN $2 AND $3`,
      [owner, start, end],
    );

    const factRows =
      revenue.rows + usage.rows + customer.rows + compliance.rows + security.rows;
    const metrics = {
      revenue: round2(Number(revenue.revenue)),
      mrr: round2(Number(revenue.mrr)),
      usageQuantity: round2(Number(usage.quantity)),
      activeUsers: round2(Number(customer.active_users)),
      tickets: round2(Number(customer.tickets)),
      healthScore: round2(Number(customer.health)),
      complianceScore: round2(Number(compliance.score)),
      openRisks: round2(Number(compliance.open_risks)),
      securityEvents: round2(Number(security.events)),
      criticalEvents: round2(Number(security.critical)),
      failedLogins: round2(Number(security.failed_logins)),
    };

    let snapshot = await this.snapshots.findOne({
      where: { tenantId: owner, snapshotDate, periodType: period },
    });
    if (!snapshot) {
      snapshot = this.snapshots.create({
        tenantId: owner,
        createdBy: this.currentUserId(),
        snapshotDate,
        periodType: period,
      });
    }
    snapshot.metrics = metrics;
    snapshot.tenants = Number(customer.tenants);
    snapshot.factRows = factRows;
    snapshot.generatedAt = new Date();
    snapshot.updatedBy = this.currentUserId();
    const saved = await this.snapshots.save(snapshot);

    this.promMetrics.inc('warehouse_snapshots_total', { period });
    this.setOverviewGauges(metrics, factRows);
    await this.auditSafe(saved.id, 'warehouse_snapshot', {
      period,
      snapshotDate,
      range: { start, end },
      metrics,
      factRows,
    });

    return { snapshot: saved, range: { start, end } };
  }

  listSnapshots(query: WarehouseSnapshotQueryDto = {}) {
    return this.operatorTenantId().then(async (tenantId) => {
      const where: Record<string, unknown> = { tenantId };
      if (query.period) where.periodType = query.period;
      return this.snapshots.find({
        where,
        order: { snapshotDate: 'DESC' },
        take: query.limit ?? 30,
      });
    });
  }


  async overview() {
    const owner = await this.operatorTenantId();
    const { from, to } = await this.resolveRange(undefined, undefined, 30);

    const [totals] = await this.dataSource.query(
      `SELECT
         (SELECT COALESCE(SUM(revenue_amount), 0)::float8 FROM fact_revenue
           WHERE tenant_id = $1 AND fact_date BETWEEN $2 AND $3) AS revenue,
         (SELECT COALESCE(SUM(quantity), 0)::float8 FROM fact_usage
           WHERE tenant_id = $1 AND fact_date BETWEEN $2 AND $3) AS usage_quantity,
         (SELECT COALESCE(SUM(active_users), 0)::float8 FROM fact_customer
           WHERE tenant_id = $1 AND fact_date BETWEEN $2 AND $3) AS active_users,
         (SELECT COALESCE(SUM(tickets_opened), 0)::float8 FROM fact_customer
           WHERE tenant_id = $1 AND fact_date BETWEEN $2 AND $3) AS tickets,
         (SELECT COALESCE(AVG(compliance_score), 0)::float8 FROM fact_compliance
           WHERE tenant_id = $1 AND fact_date BETWEEN $2 AND $3) AS compliance_score,
         (SELECT COALESCE(SUM(security_events), 0)::float8 FROM fact_security
           WHERE tenant_id = $1 AND fact_date BETWEEN $2 AND $3) AS security_events,
         (SELECT COUNT(DISTINCT source_tenant_id)::int FROM fact_customer
           WHERE tenant_id = $1 AND fact_date BETWEEN $2 AND $3) AS tenants`,
      [owner, from, to],
    );

    const [dimensions] = await this.dataSource.query(
      `SELECT
         (SELECT COUNT(*)::int FROM warehouse_dim_dates WHERE tenant_id = $1) AS dates,
         (SELECT COUNT(*)::int FROM warehouse_dim_tenants WHERE tenant_id = $1) AS tenants,
         (SELECT COUNT(*)::int FROM warehouse_dim_plans WHERE tenant_id = $1) AS plans,
         (SELECT COUNT(*)::int FROM warehouse_dim_organizations WHERE tenant_id = $1) AS organizations,
         (SELECT COUNT(*)::int FROM warehouse_dim_departments WHERE tenant_id = $1) AS departments`,
      [owner],
    );

    const [latest] = await this.snapshots.find({
      where: { tenantId: owner },
      order: { generatedAt: 'DESC' },
      take: 1,
    });

    const [revenue, usage, security] = await Promise.all([
      this.trendSeries(owner, WarehouseTrendMetric.REVENUE, 30),
      this.trendSeries(owner, WarehouseTrendMetric.USAGE, 30),
      this.trendSeries(owner, WarehouseTrendMetric.SECURITY_EVENTS, 30),
    ]);

    const normalized = {
      revenue: round2(Number(totals.revenue)),
      usageQuantity: round2(Number(totals.usage_quantity)),
      activeUsers: round2(Number(totals.active_users)),
      tickets: round2(Number(totals.tickets)),
      complianceScore: round2(Number(totals.compliance_score)),
      securityEvents: round2(Number(totals.security_events)),
      tenants: Number(totals.tenants),
    };

    this.promMetrics.set('warehouse_revenue_30d', normalized.revenue);
    this.promMetrics.set('warehouse_usage_30d', normalized.usageQuantity);
    this.promMetrics.set(
      'warehouse_security_events_30d',
      normalized.securityEvents,
    );

    return {
      generatedAt: new Date().toISOString(),
      range: { from, to },
      totals: normalized,
      dimensions,
      latestSnapshot: latest ?? null,
      trends: {
        revenue: revenue.points,
        usage: usage.points,
        securityEvents: security.points,
      },
    };
  }

  private async trendSeries(
    owner: string,
    metric: WarehouseTrendMetric,
    days: number,
  ) {
    const source = TREND_SOURCES[metric];
    const rows: Array<{ date: string; value: string | number }> =
      await this.dataSource.query(
        `WITH days AS (
           SELECT generate_series(
                    CURRENT_DATE - ($2::int - 1), CURRENT_DATE,
                    interval '1 day')::date AS day
         ),
         agg AS (
           SELECT fact_date AS day, ${source.expression} AS value
             FROM ${source.table}
            WHERE tenant_id = $1
              AND fact_date >= CURRENT_DATE - ($2::int - 1)
            GROUP BY fact_date
         )
         SELECT to_char(days.day, 'YYYY-MM-DD') AS date,
                COALESCE(agg.value, 0)::float8 AS value
           FROM days
           LEFT JOIN agg ON agg.day = days.day
          ORDER BY days.day`,
        [owner, days],
      );

    const points = rows.map((row) => ({
      date: String(row.date),
      value: round2(Number(row.value)),
    }));
    const values = points.map((point) => point.value);
    const total = round2(values.reduce((sum, value) => sum + value, 0));
    const first = values[0] ?? 0;
    const last = values[values.length - 1] ?? 0;
    const changePct = first > 0 ? round2(((last - first) / first) * 100) : 0;

    return {
      metric,
      days,
      points,
      summary: {
        total,
        average: values.length ? round2(total / values.length) : 0,
        min: values.length ? Math.min(...values) : 0,
        max: values.length ? Math.max(...values) : 0,
        latest: last,
        changePct,
      },
    };
  }

  async trends(query: WarehouseTrendsQueryDto) {
    const owner = await this.operatorTenantId();
    return this.trendSeries(owner, query.metric, query.days ?? 30);
  }


  async facts(query: WarehouseFactsQueryDto) {
    if (query.from && query.to && query.from > query.to) {
      throw new BadRequestException('"from" must be before or equal to "to"');
    }
    const owner = await this.operatorTenantId();
    const table = FACT_TABLES[query.fact];
    const params: unknown[] = [owner];
    const conditions = ['tenant_id = $1'];

    const add = (sql: string, value: unknown) => {
      params.push(value);
      conditions.push(sql.replace('?', `$${params.length}`));
    };
    if (query.from) add('fact_date >= ?::date', query.from);
    if (query.to) add('fact_date <= ?::date', query.to);
    if (query.sourceTenantId) add('source_tenant_id = ?', query.sourceTenantId);
    if (query.planCode) add('plan_code = ?', query.planCode);
    if (query.metric) add('metric = ?', query.metric);
    if (query.organizationId) add('organization_id = ?', query.organizationId);
    if (query.departmentId) add('department_id = ?', query.departmentId);

    const where = conditions.join(' AND ');
    const limit = query.limit ?? 100;
    params.push(limit);

    const [count] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS total FROM ${table} WHERE ${where}`,
      params.slice(0, -1),
    );
    const items = await this.dataSource.query(
      `SELECT * FROM ${table} WHERE ${where}
        ORDER BY fact_date DESC, created_at DESC
        LIMIT $${params.length}`,
      params,
    );

    return {
      fact: query.fact,
      total: count.total as number,
      limit,
      items: (items as Array<Record<string, unknown>>).map((row) =>
        this.camelize(row),
      ),
    };
  }

  async dimensions() {
    const owner = await this.operatorTenantId();
    const [dates] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS count,
              MIN(calendar_date)::text AS min_date,
              MAX(calendar_date)::text AS max_date
         FROM warehouse_dim_dates WHERE tenant_id = $1`,
      [owner],
    );
    const tenants = await this.dataSource.query(
      `SELECT source_tenant_id, code, name, plan_code, status, country
         FROM warehouse_dim_tenants WHERE tenant_id = $1 ORDER BY code`,
      [owner],
    );
    const plans = await this.dataSource.query(
      `SELECT plan_code, name, monthly_price, yearly_price, currency, is_active
         FROM warehouse_dim_plans WHERE tenant_id = $1 ORDER BY plan_code`,
      [owner],
    );
    const organizations = await this.dataSource.query(
      `SELECT source_organization_id, source_tenant_id, code, name, status
         FROM warehouse_dim_organizations WHERE tenant_id = $1
        ORDER BY code LIMIT 50`,
      [owner],
    );
    const departments = await this.dataSource.query(
      `SELECT source_department_id, source_organization_id, source_tenant_id,
              code, name, status
         FROM warehouse_dim_departments WHERE tenant_id = $1
        ORDER BY code LIMIT 50`,
      [owner],
    );

    return {
      generatedAt: new Date().toISOString(),
      dates: {
        count: dates.count as number,
        minDate: dates.min_date,
        maxDate: dates.max_date,
      },
      tenants,
      plans,
      organizations: { count: organizations.length, items: organizations },
      departments: { count: departments.length, items: departments },
    };
  }

  async prometheusText(): Promise<string> {
    const owner = await this.operatorTenantId();
    for (const fact of Object.values(WarehouseFactType)) {
      const [row] = await this.dataSource.query(
        `SELECT COUNT(*)::int AS total FROM ${FACT_TABLES[fact]} WHERE tenant_id = $1`,
        [owner],
      );
      this.promMetrics.set('warehouse_fact_rows', Number(row.total), { fact });
    }
    const [snapshots] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS total FROM warehouse_snapshots WHERE tenant_id = $1`,
      [owner],
    );
    this.promMetrics.set('warehouse_snapshots', Number(snapshots.total));
    return this.promMetrics.text();
  }

  private camelize(row: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      const camelKey = key.replace(/_([a-z])/g, (_, char: string) =>
        char.toUpperCase(),
      );
      if (value instanceof Date) {
        result[camelKey] = key.endsWith('_date')
          ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
          : value.toISOString();
      } else {
        result[camelKey] = value;
      }
    }
    return result;
  }

  private setOverviewGauges(
    metrics: Record<string, number>,
    factRows: number,
  ): void {
    this.promMetrics.set('warehouse_snapshot_fact_rows', factRows);
    this.promMetrics.set(
      'warehouse_snapshot_revenue',
      metrics.revenue ?? 0,
    );
    this.promMetrics.set(
      'warehouse_snapshot_security_events',
      metrics.securityEvents ?? 0,
    );
  }

  private async auditSafe(
    id: string,
    entityType: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.audit.logAction(entityType, id, AuditAction.CREATE, {
        newData: data,
      });
    } catch (error) {
      this.logger.warn(
        `Warehouse audit skipped: ${
          error instanceof Error ? error.message : error
        }`,
      );
    }
  }
}

