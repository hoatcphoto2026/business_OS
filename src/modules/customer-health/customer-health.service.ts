import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, MoreThanOrEqual, Repository } from 'typeorm';
import { CustomerHealthScore } from './entities/customer-health-score.entity';
import { HealthSignal } from './entities/health-signal.entity';
import { HealthSnapshot } from './entities/health-snapshot.entity';
import {
  HEALTH_SIGNAL_DEFINITIONS,
  HealthLevel,
  HealthSignalCode,
  HealthTrend,
} from './enums/customer-health.enum';
import {
  AtRiskQueryDto,
  HealthTrendsQueryDto,
} from './dto/customer-health.dto';
import { platformOperatorEmails } from '../executive/platform-operators';
import { TenantContextService } from '../../common/tenant-context/tenant-context.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/enums/audit-action.enum';
import { MetricsService } from '../../common/metrics/metrics.service';

export interface SignalScore {
  code: HealthSignalCode;
  name: string;
  weight: number;
  value: number;
  points: number;
  contribution: number;
}

export interface TenantHealthRow {
  targetTenantId: string;
  targetTenantCode: string;
  targetTenantName: string;
  tenantStatus: string;
  score: number;
  level: HealthLevel;
  previousScore: number | null;
  trend: HealthTrend;
  signals: SignalScore[];
  riskDrivers: SignalScore[];
  primaryRisk: string | null;
  churnCandidate: boolean;
  metrics: Record<string, number | string | null>;
}

interface RawHealthRow {
  id: string;
  code: string;
  name: string;
  status: string;
  logins: number;
  active_users: number;
  members: number;
  usage_now: string;
  usage_prev: string;
  open_tickets: number;
  failed_payments: number;
  security_events: number;
  subscription_status: string | null;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function loginPoints(logins: number): number {
  if (logins >= 30) return 100;
  if (logins >= 15) return 85;
  if (logins >= 5) return 70;
  if (logins >= 1) return 40;
  return 0;
}

function activeUserPoints(active: number, members: number): number {
  if (members <= 0) return 0;
  const ratio = active / members;
  if (ratio >= 0.8) return 100;
  if (ratio >= 0.6) return 80;
  if (ratio >= 0.4) return 60;
  if (ratio >= 0.2) return 40;
  return 20;
}

function usagePoints(now: number, previous: number): number {
  if (previous <= 0) return now > 0 ? 80 : 50;
  const growth = (now - previous) / previous;
  if (growth >= 0.2) return 100;
  if (growth >= 0) return 80;
  if (growth >= -0.2) return 60;
  if (growth >= -0.5) return 40;
  return 20;
}

function ticketPoints(open: number): number {
  const buckets = [100, 80, 65, 50, 35];
  return open >= 5 ? 20 : buckets[open];
}

function paymentPoints(failed: number): number {
  const buckets = [100, 70, 45, 25];
  return failed >= 4 ? 0 : buckets[failed];
}

function renewalPoints(status: string | null): number {
  switch (status) {
    case 'ACTIVE':
      return 100;
    case 'TRIAL':
      return 70;
    case 'PAST_DUE':
    case 'GRACE_PERIOD':
      return 40;
    case 'SUSPENDED':
      return 20;
    default:
      return 0;
  }
}

function securityPoints(events: number): number {
  if (events <= 0) return 100;
  if (events === 1) return 70;
  if (events === 2) return 45;
  return 20;
}

function levelFor(score: number): HealthLevel {
  if (score >= 80) return HealthLevel.HEALTHY;
  if (score >= 60) return HealthLevel.WARNING;
  if (score >= 40) return HealthLevel.AT_RISK;
  return HealthLevel.CRITICAL;
}

/**
 * Customer Health Platform (D3). Scores every customer tenant from seven
 * weighted signals; only platform operators can reach the controller.
 */
@Injectable()
export class CustomerHealthService {
  private readonly logger = new Logger(CustomerHealthService.name);

  constructor(
    @InjectRepository(CustomerHealthScore)
    private readonly scores: Repository<CustomerHealthScore>,
    @InjectRepository(HealthSignal)
    private readonly signalRepo: Repository<HealthSignal>,
    @InjectRepository(HealthSnapshot)
    private readonly snapshots: Repository<HealthSnapshot>,
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

  async operatorTenantId(): Promise<string> {
    try {
      return this.tenantContext.getCurrentTenantId();
    } catch {
      // No ALS (cron): resolve from the operator allowlist below.
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

  private signalWeights(): Map<HealthSignalCode, number> {
    return new Map(
      HEALTH_SIGNAL_DEFINITIONS.map((definition) => [
        definition.code,
        definition.weight,
      ]),
    );
  }


  async computeAll(): Promise<TenantHealthRow[]> {
    const raw: RawHealthRow[] = await this.dataSource.query(
      `SELECT t.id, t.code, t.name,
              t.status::text AS status,
              (SELECT COUNT(*)::int FROM login_histories l
                WHERE l.tenant_id = t.id
                  AND l.login_at > now() - interval '30 days') AS logins,
              (SELECT COUNT(DISTINCT l.user_id)::int FROM login_histories l
                WHERE l.tenant_id = t.id
                  AND l.login_at > now() - interval '30 days') AS active_users,
              (SELECT COUNT(*)::int FROM tenant_users tu
                WHERE tu.tenant_id = t.id AND tu.status = 'active') AS members,
              (SELECT COALESCE(SUM(u.quantity), 0)::int FROM usage_records u
                WHERE u.tenant_id = t.id
                  AND u.recorded_at > now() - interval '30 days') AS usage_now,
              (SELECT COALESCE(SUM(u.quantity), 0)::int FROM usage_records u
                WHERE u.tenant_id = t.id
                  AND u.recorded_at BETWEEN now() - interval '60 days'
                                        AND now() - interval '30 days') AS usage_prev,
              (SELECT COUNT(*)::int FROM support_tickets s
                WHERE s.tenant_id = t.id
                  AND s.status IN ('OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER')) AS open_tickets,
              (SELECT COUNT(*)::int FROM payment_transactions p
                WHERE p.tenant_id = t.id
                  AND p.status IN ('FAILED', 'CHARGEBACK')
                  AND p.created_at > now() - interval '30 days') AS failed_payments,
              (SELECT COUNT(*)::int FROM security_events e
                WHERE e.tenant_id = t.id
                  AND e.status <> 'RESOLVED'
                  AND e.severity IN ('HIGH', 'CRITICAL')
                  AND e.detected_at > now() - interval '30 days') AS security_events,
              (SELECT s.status FROM subscriptions s
                WHERE s.tenant_id = t.id
                ORDER BY s.created_at DESC LIMIT 1) AS subscription_status
         FROM tenants t
        WHERE t.status IN ('active', 'trial')
        ORDER BY t.code`,
    );

    const weights = this.signalWeights();
    return raw.map((row) => this.scoreTenant(row, weights));
  }

  private scoreTenant(
    row: RawHealthRow,
    weights: Map<HealthSignalCode, number>,
  ): TenantHealthRow {
    const usageNow = Number(row.usage_now);
    const usagePrev = Number(row.usage_prev);
    const renewal = renewalPoints(row.subscription_status);
    const points: Record<HealthSignalCode, number> = {
      [HealthSignalCode.LOGIN_FREQUENCY]: loginPoints(row.logins),
      [HealthSignalCode.ACTIVE_USERS]: activeUserPoints(
        row.active_users,
        row.members,
      ),
      [HealthSignalCode.USAGE_TREND]: usagePoints(usageNow, usagePrev),
      [HealthSignalCode.SUPPORT_TICKETS]: ticketPoints(row.open_tickets),
      [HealthSignalCode.FAILED_PAYMENTS]: paymentPoints(row.failed_payments),
      [HealthSignalCode.RENEWAL_SUCCESS]: renewal,
      [HealthSignalCode.SECURITY_EVENTS]: securityPoints(row.security_events),
    };
    const values: Record<HealthSignalCode, number> = {
      [HealthSignalCode.LOGIN_FREQUENCY]: row.logins,
      [HealthSignalCode.ACTIVE_USERS]: row.active_users,
      [HealthSignalCode.USAGE_TREND]: usageNow,
      [HealthSignalCode.SUPPORT_TICKETS]: row.open_tickets,
      [HealthSignalCode.FAILED_PAYMENTS]: row.failed_payments,
      [HealthSignalCode.RENEWAL_SUCCESS]: renewal,
      [HealthSignalCode.SECURITY_EVENTS]: row.security_events,
    };

    const signals: SignalScore[] = HEALTH_SIGNAL_DEFINITIONS.map(
      (definition) => {
        const weight = weights.get(definition.code) ?? definition.weight;
        return {
          code: definition.code,
          name: definition.name,
          weight,
          value: values[definition.code],
          points: points[definition.code],
          contribution: round1((points[definition.code] * weight) / 100),
        };
      },
    );

    const score = round1(
      signals.reduce((sum, signal) => sum + signal.contribution, 0),
    );
    const level = levelFor(score);
    const riskDrivers = signals
      .filter((signal) => signal.points < 60)
      .sort(
        (a, b) =>
          (100 - b.points) * b.weight - (100 - a.points) * a.weight,
      );
    const churnCandidate =
      level === HealthLevel.AT_RISK ||
      level === HealthLevel.CRITICAL ||
      row.failed_payments > 0 ||
      renewal <= 40;

    return {
      targetTenantId: row.id,
      targetTenantCode: row.code,
      targetTenantName: row.name,
      tenantStatus: row.status,
      score,
      level,
      previousScore: null,
      trend: HealthTrend.STABLE,
      signals,
      riskDrivers,
      primaryRisk: riskDrivers[0]?.code ?? null,
      churnCandidate,
      metrics: {
        logins: row.logins,
        activeUsers: row.active_users,
        members: row.members,
        usageNow,
        usagePrevious: usagePrev,
        usageGrowthPct:
          usagePrev > 0
            ? round1(((usageNow - usagePrev) / usagePrev) * 100)
            : null,
        openTickets: row.open_tickets,
        failedPayments: row.failed_payments,
        securityEvents: row.security_events,
        subscriptionStatus: row.subscription_status,
      },
    };
  }


  async dashboard() {
    const rows = await this.computeAll();
    return this.buildDashboard(rows);
  }

  private buildDashboard(rows: TenantHealthRow[]) {
    const distribution = {
      HEALTHY: 0,
      WARNING: 0,
      AT_RISK: 0,
      CRITICAL: 0,
    };
    for (const row of rows) distribution[row.level] += 1;

    const averageScore = rows.length
      ? round1(rows.reduce((sum, row) => sum + row.score, 0) / rows.length)
      : 0;
    const atRisk = rows
      .filter((row) => row.level !== HealthLevel.HEALTHY)
      .sort((a, b) => a.score - b.score);

    return {
      generatedAt: new Date().toISOString(),
      totals: {
        tenants: rows.length,
        healthy: distribution.HEALTHY,
        warning: distribution.WARNING,
        atRisk: distribution.AT_RISK,
        critical: distribution.CRITICAL,
        churnCandidates: rows.filter((row) => row.churnCandidate).length,
        averageScore,
      },
      distribution,
      tenants: rows,
      atRisk,
      churnCandidates: atRisk.filter((row) => row.churnCandidate),
    };
  }

  async atRisk(query: AtRiskQueryDto) {
    const rows = await this.computeAll();
    let risky = rows
      .filter((row) => row.level !== HealthLevel.HEALTHY)
      .sort((a, b) => a.score - b.score);
    if (query.churnOnly === 'true') {
      risky = risky.filter((row) => row.churnCandidate);
    }
    return {
      generatedAt: new Date().toISOString(),
      total: risky.length,
      tenants: risky.slice(0, query.limit ?? 50),
    };
  }

  async tenantDetail(id: string) {
    const rows = await this.computeAll();
    const row = rows.find((item) => item.targetTenantId === id);
    if (!row) throw new NotFoundException('Tenant health not found');
    const tenantId = await this.operatorTenantId();
    const history = await this.snapshots.find({
      where: { tenantId, targetTenantId: id },
      order: { snapshotDate: 'ASC' },
      take: 90,
    });
    return {
      generatedAt: new Date().toISOString(),
      ...row,
      history: history.map((snapshot) => ({
        date: snapshot.snapshotDate,
        score: Number(snapshot.score),
        level: snapshot.level,
      })),
    };
  }

  async trends(query: HealthTrendsQueryDto) {
    const tenantId = await this.operatorTenantId();
    const days = query.days ?? 30;
    const from =
      query.from ?? new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
    const where: Record<string, unknown> = {
      tenantId,
      snapshotDate: MoreThanOrEqual(from),
    };
    if (query.tenantId) where.targetTenantId = query.tenantId;

    const rows = await this.snapshots.find({
      where,
      order: { snapshotDate: 'ASC' },
      take: 5000,
    });
    const series = new Map<
      string,
      Array<{ date: string; score: number; level: HealthLevel }>
    >();
    for (const snapshot of rows) {
      const points = series.get(snapshot.targetTenantId) ?? [];
      points.push({
        date: snapshot.snapshotDate,
        score: Number(snapshot.score),
        level: snapshot.level,
      });
      series.set(snapshot.targetTenantId, points);
    }

    return {
      generatedAt: new Date().toISOString(),
      days,
      from,
      series: Array.from(series.entries()).map(([targetTenantId, points]) => ({
        targetTenantId,
        points,
      })),
    };
  }

  async signals() {
    const tenantId = await this.operatorTenantId();
    const rows = await this.signalRepo.find({
      where: { tenantId },
      order: { weight: 'DESC' },
    });
    if (rows.length > 0) return rows;
    return HEALTH_SIGNAL_DEFINITIONS;
  }


  /** Persist latest scores + daily per-tenant history and refresh gauges. */
  async generateSnapshot() {
    const tenantId = await this.operatorTenantId();
    const userId = this.currentUserId();
    const rows = await this.computeAll();
    const snapshotDate = new Date().toISOString().slice(0, 10);

    for (const row of rows) {
      const existing = await this.scores.findOne({
        where: { tenantId, targetTenantId: row.targetTenantId },
      });
      const previous = existing ? Number(existing.score) : null;
      const trend =
        previous == null
          ? HealthTrend.STABLE
          : row.score > previous + 2
            ? HealthTrend.UP
            : row.score < previous - 2
              ? HealthTrend.DOWN
              : HealthTrend.STABLE;

      const entity =
        existing ??
        this.scores.create({
          tenantId,
          targetTenantId: row.targetTenantId,
          createdBy: userId,
        });
      entity.targetTenantCode = row.targetTenantCode;
      entity.targetTenantName = row.targetTenantName;
      entity.score = row.score.toFixed(2);
      entity.level = row.level;
      entity.previousScore = previous == null ? null : previous.toFixed(2);
      entity.trend = trend;
      entity.signals = row.signals as unknown as Array<Record<string, unknown>>;
      entity.riskDrivers =
        row.riskDrivers as unknown as Array<Record<string, unknown>>;
      entity.primaryRisk = row.primaryRisk;
      entity.churnCandidate = row.churnCandidate;
      entity.scoredAt = new Date();
      entity.metadata = { metrics: row.metrics, tenantStatus: row.tenantStatus };
      entity.updatedBy = userId;
      await this.scores.save(entity);
      await this.auditSafe(entity.id, {
        snapshotDate,
        targetTenantId: row.targetTenantId,
        targetTenantCode: row.targetTenantCode,
        score: row.score,
        level: row.level,
        churnCandidate: row.churnCandidate,
      });

      let snapshot = await this.snapshots.findOne({
        where: { tenantId, targetTenantId: row.targetTenantId, snapshotDate },
      });
      if (!snapshot) {
        snapshot = this.snapshots.create({
          tenantId,
          targetTenantId: row.targetTenantId,
          snapshotDate,
          createdBy: userId,
        });
      }
      snapshot.score = row.score.toFixed(2);
      snapshot.level = row.level;
      snapshot.signals = row.signals as unknown as Array<Record<string, unknown>>;
      snapshot.riskDrivers =
        row.riskDrivers as unknown as Array<Record<string, unknown>>;
      snapshot.generatedAt = new Date();
      snapshot.updatedBy = userId;
      await this.snapshots.save(snapshot);
    }

    const dashboard = this.buildDashboard(rows);
    this.setGauges(rows);
    this.promMetrics.inc('customer_health_snapshots_total');

    return {
      snapshotDate,
      tenants: rows.length,
      averageScore: dashboard.totals.averageScore,
      distribution: dashboard.distribution,
      churnCandidates: dashboard.totals.churnCandidates,
    };
  }

  async prometheusText(): Promise<string> {
    const rows = await this.computeAll();
    this.setGauges(rows);
    return this.promMetrics.text();
  }

  private setGauges(rows: TenantHealthRow[]): void {
    const distribution = { HEALTHY: 0, WARNING: 0, AT_RISK: 0, CRITICAL: 0 };
    for (const row of rows) distribution[row.level] += 1;
    const average = rows.length
      ? round1(rows.reduce((sum, row) => sum + row.score, 0) / rows.length)
      : 0;

    const gauges: Array<[string, number]> = [
      ['customer_health_tenants', rows.length],
      ['customer_health_avg_score', average],
      ['customer_health_healthy_tenants', distribution.HEALTHY],
      ['customer_health_warning_tenants', distribution.WARNING],
      ['customer_health_at_risk_tenants', distribution.AT_RISK],
      ['customer_health_critical_tenants', distribution.CRITICAL],
      [
        'customer_health_churn_candidates',
        rows.filter((row) => row.churnCandidate).length,
      ],
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
        'customer_health_snapshot',
        id,
        AuditAction.CREATE,
        { newData: data },
      );
    } catch (error) {
      this.logger.warn(
        `Customer health audit skipped: ${
          error instanceof Error ? error.message : error
        }`,
      );
    }
  }
}

