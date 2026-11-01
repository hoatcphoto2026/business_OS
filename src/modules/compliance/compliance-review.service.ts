import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  AccessReview,
  AccessReviewFinding,
} from './entities/access-review.entity';
import {
  AccessReviewScope,
  AccessReviewStatus,
} from './enums/compliance.enum';
import {
  CompleteAccessReviewDto,
  CreateAccessReviewDto,
} from './dto/compliance.dto';
import { TenantContextService } from '../../common/tenant-context/tenant-context.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/enums/audit-action.enum';
import { MetricsService } from '../../common/metrics/metrics.service';

const RISKY_PERMISSIONS = [
  'admin.access',
  'billing.manage',
  'customer.delete',
  'sales.approve',
  'invoice.issue',
  'inventory.update',
];

@Injectable()
export class ComplianceReviewService {
  private readonly logger = new Logger(ComplianceReviewService.name);

  constructor(
    @InjectRepository(AccessReview)
    private readonly reviews: Repository<AccessReview>,
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

  async listReviews(): Promise<AccessReview[]> {
    return this.reviews.find({
      where: { tenantId: this.tenantId() },
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  async getReview(id: string): Promise<AccessReview> {
    const row = await this.reviews.findOne({
      where: { id, tenantId: this.tenantId() },
    });
    if (!row) throw new NotFoundException('Access review not found');
    return row;
  }

  async startReview(dto: CreateAccessReviewDto): Promise<AccessReview> {
    const tenantId = this.tenantId();
    const findings = await this.buildFindings(tenantId);
    const row = await this.reviews.save(
      this.reviews.create({
        tenantId,
        name: dto.name,
        scope: dto.scope ?? AccessReviewScope.ALL_USERS,
        status: AccessReviewStatus.IN_PROGRESS,
        periodStart: dto.periodStart ? new Date(dto.periodStart) : null,
        periodEnd: dto.periodEnd ? new Date(dto.periodEnd) : null,
        reviewerId: this.userId(),
        findings,
        reviewedCount: findings.length,
        flaggedCount: findings.filter((finding) => finding.flagged).length,
        createdBy: this.userId(),
      }),
    );
    await this.auditReview(row, 'started');
    this.metrics.inc('compliance_access_reviews_started_total');
    return row;
  }

  async completeReview(
    id: string,
    dto: CompleteAccessReviewDto = {},
  ): Promise<AccessReview> {
    const row = await this.getReview(id);
    if (row.status === AccessReviewStatus.COMPLETED) return row;

    // Recompute so the signed-off review reflects the current state.
    row.findings = await this.buildFindings(this.tenantId());
    row.reviewedCount = row.findings.length;
    row.flaggedCount = row.findings.filter((finding) => finding.flagged).length;
    row.status = AccessReviewStatus.COMPLETED;
    row.completedAt = new Date();
    row.reviewerId = dto.reviewerId ?? this.userId();
    row.updatedBy = this.userId();
    const saved = await this.reviews.save(row);
    await this.auditReview(saved, 'completed');
    this.metrics.inc('compliance_access_reviews_completed_total');
    return saved;
  }

  /**
   * Permission Review: role → permission matrix, user counts and the risky
   * permission assignments that access reviewers must justify.
   */
  async permissionReview() {
    const tenantId = this.tenantId();
    const rolePermissions: Array<{ role: string; permission: string }> =
      await this.dataSource.query(
        `SELECT r.code AS role, p.code AS permission
           FROM roles r
           JOIN role_permissions rp ON rp.role_id = r.id
           JOIN permissions p ON p.id = rp.permission_id
          WHERE r.tenant_id = $1
          ORDER BY r.code, p.code`,
        [tenantId],
      );
    const userCounts: Array<{ role: string; users: number }> =
      await this.dataSource.query(
        `SELECT r.code AS role, COUNT(DISTINCT ur.user_id)::int AS users
           FROM roles r
           LEFT JOIN user_roles ur ON ur.role_id = r.id
          WHERE r.tenant_id = $1
          GROUP BY r.code`,
        [tenantId],
      );

    const usersByRole = new Map(userCounts.map((row) => [row.role, row.users]));
    const roles = new Map<
      string,
      { code: string; users: number; permissions: string[] }
    >();
    for (const row of rolePermissions) {
      const entry = roles.get(row.role) ?? {
        code: row.role,
        users: usersByRole.get(row.role) ?? 0,
        permissions: [],
      };
      entry.permissions.push(row.permission);
      roles.set(row.role, entry);
    }

    const riskyPermissions = RISKY_PERMISSIONS.map((permission) => ({
      permission,
      roles: rolePermissions
        .filter((row) => row.permission === permission)
        .map((row) => row.role),
    })).filter((entry) => entry.roles.length > 0);

    return {
      roles: Array.from(roles.values()),
      riskyPermissions,
      totals: {
        roles: roles.size,
        assignments: rolePermissions.length,
        distinctPermissions: new Set(rolePermissions.map((row) => row.permission))
          .size,
      },
    };
  }

  /** Snapshot of every membership + its roles + last login; flags risky access. */
  private async buildFindings(tenantId: string): Promise<AccessReviewFinding[]> {
    const rows: Array<{
      userId: string;
      email: string;
      membershipRole: string;
      membershipStatus: string;
      roles: string[] | null;
      lastLoginAt: Date | string | null;
    }> = await this.dataSource.query(
      `SELECT u.id AS "userId",
              u.email AS email,
              tu.role AS "membershipRole",
              tu.status AS "membershipStatus",
              COALESCE(array_agg(DISTINCT r.code) FILTER (WHERE r.code IS NOT NULL), '{}') AS roles,
              MAX(lh.login_at) AS "lastLoginAt"
         FROM tenant_users tu
         JOIN users u ON u.id = tu.user_id
         LEFT JOIN user_roles ur ON ur.user_id = u.id
         LEFT JOIN roles r ON r.id = ur.role_id AND r.tenant_id = tu.tenant_id
         LEFT JOIN login_histories lh ON lh.user_id = u.id AND lh.tenant_id = tu.tenant_id
        WHERE tu.tenant_id = $1
        GROUP BY u.id, u.email, tu.role, tu.status
        ORDER BY u.email`,
      [tenantId],
    );

    return rows.map((row) => {
      const roles = Array.isArray(row.roles) ? row.roles : [];
      const flagReasons: string[] = [];
      if (roles.some((role) => ['admin', 'owner'].includes(role))) {
        flagReasons.push('PRIVILEGED_ROLE');
      }
      if (row.membershipStatus !== 'active') {
        flagReasons.push('INACTIVE_MEMBERSHIP');
      }
      if (!row.lastLoginAt) {
        flagReasons.push('NEVER_LOGGED_IN');
      }
      if (roles.length > 1) {
        flagReasons.push('MULTIPLE_ROLES');
      }
      return {
        userId: row.userId,
        email: row.email,
        membershipRole: row.membershipRole,
        membershipStatus: row.membershipStatus,
        roles,
        lastLoginAt: row.lastLoginAt
          ? new Date(row.lastLoginAt).toISOString()
          : null,
        flagged: flagReasons.length > 0,
        flagReasons,
      };
    });
  }

  private async auditReview(row: AccessReview, event: string): Promise<void> {
    try {
      await this.audit.logAction(
        'compliance_access_review',
        row.id,
        event === 'completed' ? AuditAction.APPROVE : AuditAction.CREATE,
        {
          newData: {
            name: row.name,
            status: row.status,
            reviewedCount: row.reviewedCount,
            flaggedCount: row.flaggedCount,
            event,
          },
        },
      );
    } catch (error) {
      this.logger.warn(
        `Compliance review audit skipped: ${error instanceof Error ? error.message : error}`,
      );
    }
  }
}

