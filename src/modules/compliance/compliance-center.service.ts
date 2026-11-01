import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { RiskAssessment } from './entities/risk-assessment.entity';
import { ComplianceSnapshot } from './entities/compliance-snapshot.entity';
import { AccessReview } from './entities/access-review.entity';
import { RiskStatus } from './enums/compliance.enum';
import {
  CreateRiskDto,
  RiskQueryDto,
  UpdateRiskDto,
} from './dto/compliance.dto';
import { ComplianceEvidenceService } from './compliance-evidence.service';
import { TenantContextService } from '../../common/tenant-context/tenant-context.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/enums/audit-action.enum';
import { MetricsService } from '../../common/metrics/metrics.service';

@Injectable()
export class ComplianceCenterService {
  private readonly logger = new Logger(ComplianceCenterService.name);

  constructor(
    @InjectRepository(RiskAssessment)
    private readonly risks: Repository<RiskAssessment>,
    @InjectRepository(ComplianceSnapshot)
    private readonly snapshots: Repository<ComplianceSnapshot>,
    @InjectRepository(AccessReview)
    private readonly reviews: Repository<AccessReview>,
    private readonly evidence: ComplianceEvidenceService,
    private readonly dataSource: DataSource,
    private readonly tenantContext: TenantContextService,
    private readonly audit: AuditService,
    private readonly metrics: MetricsService,
  ) {}

  private tenantId(): string {
    return this.tenantContext.getCurrentTenantId();
  }

  private userId(): string | null {
    try {
      return this.tenantContext.getCurrentUserId();
    } catch {
      return null;
    }
  }

  // ─── Risks ────────────────────────────────────────────────────

  async createRisk(dto: CreateRiskDto): Promise<RiskAssessment> {
    const likelihood = dto.likelihood ?? 3;
    const impact = dto.impact ?? 3;
    const row = await this.risks.save(
      this.risks.create({
        tenantId: this.tenantId(),
        title: dto.title,
        category: dto.category,
        description: dto.description ?? null,
        severity: dto.severity,
        status: RiskStatus.OPEN,
        likelihood,
        impact,
        score: likelihood * impact,
        ownerId: dto.ownerId ?? null,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
        mitigation: dto.mitigation ?? null,
        assessedAt: new Date(),
        createdBy: this.userId(),
      }),
    );
    await this.auditSafe(row.id, AuditAction.CREATE, {
      title: row.title,
      severity: row.severity,
      score: row.score,
    });
    this.metrics.inc('compliance_risks_created_total', { severity: row.severity });
    return row;
  }

  async listRisks(query: RiskQueryDto): Promise<RiskAssessment[]> {
    const where: Record<string, unknown> = { tenantId: this.tenantId() };
    if (query.status) where.status = query.status;
    if (query.severity) where.severity = query.severity;
    return this.risks.find({
      where,
      order: { score: 'DESC', createdAt: 'DESC' },
      take: 200,
    });
  }

  async updateRisk(id: string, dto: UpdateRiskDto): Promise<RiskAssessment> {
    const row = await this.risks.findOne({
      where: { id, tenantId: this.tenantId() },
    });
    if (!row) throw new NotFoundException('Risk assessment not found');

    const before = { status: row.status, severity: row.severity, score: row.score };
    if (dto.status !== undefined) row.status = dto.status;
    if (dto.severity !== undefined) row.severity = dto.severity;
    if (dto.likelihood !== undefined) row.likelihood = dto.likelihood;
    if (dto.impact !== undefined) row.impact = dto.impact;
    if (dto.mitigation !== undefined) row.mitigation = dto.mitigation;
    row.score = row.likelihood * row.impact;
    row.updatedBy = this.userId();

    const saved = await this.risks.save(row);
    await this.auditSafe(saved.id, AuditAction.UPDATE, {
      before,
      after: {
        status: saved.status,
        severity: saved.severity,
        score: saved.score,
        mitigation: saved.mitigation,
      },
    });
    return saved;
  }

  async riskReport() {
    const rows = await this.risks.find({ where: { tenantId: this.tenantId() } });
    const bySeverity: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    for (const row of rows) {
      bySeverity[row.severity] = (bySeverity[row.severity] ?? 0) + 1;
      byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
    }
    const open = rows.filter((row) => row.status === RiskStatus.OPEN);
    const averageScore = rows.length
      ? Number(
          (rows.reduce((sum, row) => sum + row.score, 0) / rows.length).toFixed(2),
        )
      : 0;
    return {
      total: rows.length,
      open: open.length,
      bySeverity,
      byStatus,
      averageScore,
      topRisks: open
        .slice()
        .sort((a, b) => b.score - a.score)
        .slice(0, 10)
        .map((row) => ({
          id: row.id,
          title: row.title,
          severity: row.severity,
          score: row.score,
          status: row.status,
        })),
    };
  }

  // ─── Retention report ────────────────────────────────────────

  async retentionReport() {
    const tenantId = this.tenantId();
    const [counts] = await this.dataSource.query(
      `SELECT
         (SELECT COUNT(*)::int FROM audit_logs WHERE tenant_id = $1) AS audit_total,
         (SELECT COUNT(*)::int FROM audit_logs WHERE tenant_id = $1 AND created_at < now() - interval '90 days') AS audit_older_90,
         (SELECT COUNT(*)::int FROM audit_logs WHERE tenant_id = $1 AND created_at < now() - interval '180 days') AS audit_older_180,
         (SELECT COUNT(*)::int FROM login_histories WHERE tenant_id = $1 AND login_at < now() - interval '90 days') AS logins_older_90,
         (SELECT COUNT(*)::int FROM sso_sessions WHERE tenant_id = $1 AND created_at < now() - interval '30 days') AS sso_older_30,
         (SELECT COUNT(*)::int FROM scim_provisioning_logs WHERE tenant_id = $1 AND created_at < now() - interval '90 days') AS scim_older_90`,
      [tenantId],
    );
    const policies: Array<Record<string, unknown>> = await this.dataSource.query(
      `SELECT id, code, label, days, is_custom, is_active, updated_at
         FROM audit_retention_policies WHERE tenant_id = $1 ORDER BY code`,
      [tenantId],
    );

    const attention =
      counts.audit_older_180 > 0 || counts.scim_older_90 > 0 || counts.sso_older_30 > 0;
    return {
      status: attention ? 'attention' : 'ok',
      policies,
      counts,
      checkedAt: new Date().toISOString(),
    };
  }

  // ─── Security report ─────────────────────────────────────────

  async securityReport() {
    const tenantId = this.tenantId();
    const [counts] = await this.dataSource.query(
      `SELECT
         (SELECT COUNT(*)::int FROM identity_providers WHERE tenant_id = $1) AS sso_total,
         (SELECT COUNT(*)::int FROM identity_providers WHERE tenant_id = $1 AND enabled) AS sso_enabled,
         (SELECT COUNT(*)::int FROM scim_endpoints WHERE tenant_id = $1) AS scim_endpoints,
         (SELECT COUNT(*)::int FROM api_keys WHERE tenant_id = $1) AS api_keys,
         (SELECT COUNT(*)::int FROM webhooks WHERE tenant_id = $1) AS webhooks,
         (SELECT COUNT(*)::int FROM step_up_sessions WHERE tenant_id = $1 AND created_at > now() - interval '30 days') AS step_up_30d,
         (SELECT COUNT(*)::int FROM login_histories WHERE tenant_id = $1 AND login_at > now() - interval '30 days') AS logins_30d,
         (SELECT COUNT(*)::int FROM audit_logs WHERE tenant_id = $1 AND action = 'REJECT' AND created_at > now() - interval '30 days') AS denied_30d`,
      [tenantId],
    );

    const checks = [
      { id: 'SSO_CONFIGURED', passed: counts.sso_enabled > 0, weight: 25 },
      { id: 'SCIM_CONFIGURED', passed: counts.scim_endpoints > 0, weight: 25 },
      { id: 'STEP_UP_USED', passed: counts.step_up_30d > 0, weight: 25 },
      {
        id: 'ACCESS_MONITORING',
        passed: counts.logins_30d > 0 || counts.denied_30d > 0,
        weight: 25,
      },
    ];
    const score = checks.reduce(
      (sum, check) => sum + (check.passed ? check.weight : 0),
      0,
    );

    return { score, checks, counts, checkedAt: new Date().toISOString() };
  }


  // ─── Scoring + dashboard ─────────────────────────────────────

  private async computeScores() {
    const evidence = await this.evidence.summary();
    const evidenceScore = evidence.total
      ? Math.round((evidence.verified / evidence.total) * 100)
      : 0;

    const latestReview = await this.reviews.findOne({
      where: { tenantId: this.tenantId() },
      order: { createdAt: 'DESC' },
    });
    const accessScore =
      latestReview && latestReview.reviewedCount > 0
        ? Math.round(
            100 - (latestReview.flaggedCount / latestReview.reviewedCount) * 100,
          )
        : 50;

    const [riskCounts] = await this.dataSource.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'OPEN' AND severity = 'CRITICAL')::int AS open_critical,
         COUNT(*) FILTER (WHERE status = 'OPEN' AND severity = 'HIGH')::int AS open_high,
         COUNT(*) FILTER (WHERE status = 'OPEN' AND severity = 'MEDIUM')::int AS open_medium,
         COUNT(*) FILTER (WHERE status = 'OPEN')::int AS open_total,
         COUNT(*)::int AS total
       FROM compliance_risks WHERE tenant_id = $1`,
      [this.tenantId()],
    );
    const riskScore = Math.max(
      0,
      100 -
        riskCounts.open_critical * 15 -
        riskCounts.open_high * 10 -
        riskCounts.open_medium * 5,
    );

    const retention = await this.retentionReport();
    const retentionScore = retention.status === 'ok' ? 100 : 50;
    const security = await this.securityReport();
    const securityScore = security.score;

    const overallScore = Math.round(
      (evidenceScore + accessScore + riskScore + retentionScore + securityScore) / 5,
    );

    return {
      scores: {
        evidence: evidenceScore,
        access: accessScore,
        risk: riskScore,
        retention: retentionScore,
        security: securityScore,
        overall: overallScore,
      },
      evidence,
      latestReview,
      riskCounts,
      retention,
      security,
    };
  }

  async dashboard() {
    const state = await this.computeScores();
    const latestSnapshot = await this.snapshots.findOne({
      where: { tenantId: this.tenantId() },
      order: { generatedAt: 'DESC' },
    });
    return {
      generatedAt: new Date().toISOString(),
      scores: state.scores,
      evidence: state.evidence,
      risks: state.riskCounts,
      accessReview: state.latestReview
        ? {
            id: state.latestReview.id,
            name: state.latestReview.name,
            status: state.latestReview.status,
            reviewedCount: state.latestReview.reviewedCount,
            flaggedCount: state.latestReview.flaggedCount,
            completedAt: state.latestReview.completedAt,
          }
        : null,
      retention: { status: state.retention.status, counts: state.retention.counts },
      security: { score: state.security.score, checks: state.security.checks },
      latestSnapshot: latestSnapshot
        ? {
            id: latestSnapshot.id,
            overallScore: latestSnapshot.overallScore,
            generatedAt: latestSnapshot.generatedAt,
          }
        : null,
    };
  }


  // ─── Snapshots + analytics ───────────────────────────────────

  async generateSnapshot(): Promise<ComplianceSnapshot> {
    const state = await this.computeScores();
    const row = await this.snapshots.save(
      this.snapshots.create({
        tenantId: this.tenantId(),
        periodStart: null,
        periodEnd: new Date(),
        evidenceScore: state.scores.evidence,
        accessScore: state.scores.access,
        riskScore: state.scores.risk,
        retentionScore: state.scores.retention,
        securityScore: state.scores.security,
        overallScore: state.scores.overall,
        metrics: {
          evidence: state.evidence,
          risks: state.riskCounts,
          retention: state.retention.status,
          security: {
            score: state.security.score,
            checks: state.security.checks,
            counts: state.security.counts,
          },
        },
        generatedAt: new Date(),
        createdBy: this.userId(),
      }),
    );
    await this.auditSafe(row.id, AuditAction.CREATE, {
      overallScore: row.overallScore,
      scores: state.scores,
    });
    this.metrics.inc('compliance_snapshots_generated_total');
    return row;
  }

  async listSnapshots(limit = 20): Promise<ComplianceSnapshot[]> {
    return this.snapshots.find({
      where: { tenantId: this.tenantId() },
      order: { generatedAt: 'DESC' },
      take: limit,
    });
  }

  async analytics(limit = 20) {
    const snapshots = await this.listSnapshots(limit);
    const trend = snapshots
      .slice()
      .reverse()
      .map((row) => ({
        id: row.id,
        generatedAt: row.generatedAt,
        overallScore: row.overallScore,
        evidenceScore: row.evidenceScore,
        accessScore: row.accessScore,
        riskScore: row.riskScore,
        retentionScore: row.retentionScore,
        securityScore: row.securityScore,
      }));

    const evidenceByCategory: Array<{ category: string; total: number }> =
      await this.dataSource.query(
        `SELECT category, COUNT(*)::int AS total
           FROM compliance_evidence WHERE tenant_id = $1
          GROUP BY category ORDER BY category`,
        [this.tenantId()],
      );
    const risksBySeverity: Array<{ severity: string; total: number }> =
      await this.dataSource.query(
        `SELECT severity, COUNT(*)::int AS total
           FROM compliance_risks WHERE tenant_id = $1
          GROUP BY severity ORDER BY severity`,
        [this.tenantId()],
      );
    const reviewsByStatus: Array<{ status: string; total: number }> =
      await this.dataSource.query(
        `SELECT status, COUNT(*)::int AS total
           FROM compliance_access_reviews WHERE tenant_id = $1
          GROUP BY status ORDER BY status`,
        [this.tenantId()],
      );

    return {
      current: trend.length ? trend[trend.length - 1] : null,
      trend,
      evidenceByCategory,
      risksBySeverity,
      reviewsByStatus,
    };
  }

  async metricsText(): Promise<string> {
    return this.metrics.text();
  }

  private async auditSafe(
    id: string,
    action: AuditAction,
    data: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.audit.logAction('compliance_snapshot', id, action, { newData: data });
    } catch (error) {
      this.logger.warn(
        `Compliance snapshot audit skipped: ${error instanceof Error ? error.message : error}`,
      );
    }
  }
}

