import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmergencyAccess } from '../entities/emergency-access.entity';
import {
  EmergencyAccessStatus,
  SecurityEventSource,
  SecurityEventType,
  SecuritySeverity,
} from '../enums/security.enum';
import {
  EmergencyAccessDecisionDto,
  EmergencyAccessRequestDto,
} from '../dto/security.dto';
import { SecurityEventsService } from './security-events.service';
import { TenantContextService } from '../../../common/tenant-context/tenant-context.service';
import { AuditService } from '../../audit/audit.service';
import { AuditAction } from '../../audit/enums/audit-action.enum';
import { MetricsService } from '../../../common/metrics/metrics.service';

const DEFAULT_DURATION_MINUTES = 30;

/**
 * Persistent break-glass account / emergency access with dual control:
 * a request becomes usable only after a *different* admin approves it,
 * and the grant expires automatically.
 */
@Injectable()
export class EmergencyAccessService {
  private readonly logger = new Logger(EmergencyAccessService.name);

  constructor(
    @InjectRepository(EmergencyAccess)
    private readonly requests: Repository<EmergencyAccess>,
    private readonly events: SecurityEventsService,
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

  async request(dto: EmergencyAccessRequestDto): Promise<EmergencyAccess> {
    const userId = this.userId();
    if (!userId) throw new ForbiddenException('Authenticated user required');
    const durationMinutes = dto.durationMinutes ?? DEFAULT_DURATION_MINUTES;

    const row = await this.requests.save(
      this.requests.create({
        tenantId: this.tenantId(),
        requesterId: userId,
        reason: dto.reason,
        scope: dto.scope ?? 'TENANT_ADMIN',
        status: EmergencyAccessStatus.PENDING,
        requestedAt: new Date(),
        expiresAt: new Date(Date.now() + durationMinutes * 60_000),
        metadata: { durationMinutes },
        createdBy: userId,
      }),
    );

    await this.events.create({
      tenantId: row.tenantId,
      eventType: SecurityEventType.EMERGENCY_ACCESS_REQUESTED,
      severity: SecuritySeverity.HIGH,
      source: SecurityEventSource.SECURITY,
      userId,
      riskScore: 60,
      metadata: {
        requestId: row.id,
        reason: row.reason,
        scope: row.scope,
        durationMinutes,
      },
    });
    await this.auditSafe(row, AuditAction.CREATE, {
      status: row.status,
      scope: row.scope,
      reason: row.reason,
    });
    this.metrics.inc('security_emergency_access_total', {
      status: EmergencyAccessStatus.PENDING,
    });
    this.logger.warn(
      `EMERGENCY ACCESS requested id=${row.id} by=${userId} scope=${row.scope}`,
    );
    return row;
  }

  async approve(
    id: string,
    dto: EmergencyAccessDecisionDto = {},
  ): Promise<EmergencyAccess> {
    const row = await this.get(id);
    const approverId = this.userId();
    if (!approverId) throw new ForbiddenException('Authenticated user required');
    if (row.requesterId === approverId) {
      throw new ForbiddenException(
        'Dual-control: approver must be different from requester',
      );
    }
    if (row.status === EmergencyAccessStatus.APPROVED) return row;
    if (row.status !== EmergencyAccessStatus.PENDING) {
      throw new BadRequestException(`Emergency access request is ${row.status}`);
    }
    if (Date.now() > row.expiresAt.getTime()) {
      row.status = EmergencyAccessStatus.EXPIRED;
      await this.requests.save(row);
      throw new BadRequestException('Emergency access request expired');
    }

    const durationMinutes =
      Number(row.metadata?.durationMinutes) || DEFAULT_DURATION_MINUTES;
    row.status = EmergencyAccessStatus.APPROVED;
    row.approverId = approverId;
    row.approvedAt = new Date();
    row.expiresAt = new Date(Date.now() + durationMinutes * 60_000);
    row.updatedBy = approverId;
    if (dto.notes) row.metadata = { ...row.metadata, approverNotes: dto.notes };

    const saved = await this.requests.save(row);
    await this.events.create({
      tenantId: saved.tenantId,
      eventType: SecurityEventType.EMERGENCY_ACCESS_APPROVED,
      severity: SecuritySeverity.HIGH,
      source: SecurityEventSource.SECURITY,
      userId: saved.approverId,
      riskScore: 80,
      metadata: {
        requestId: saved.id,
        requesterId: saved.requesterId,
        scope: saved.scope,
        expiresAt: saved.expiresAt,
      },
    });
    await this.auditSafe(saved, AuditAction.APPROVE, {
      status: saved.status,
      approverId,
      expiresAt: saved.expiresAt,
    });
    this.metrics.inc('security_emergency_access_total', {
      status: EmergencyAccessStatus.APPROVED,
    });
    this.logger.warn(
      `EMERGENCY ACCESS approved id=${saved.id} by=${approverId} expires=${saved.expiresAt.toISOString()}`,
    );
    return saved;
  }

  async revoke(
    id: string,
    dto: EmergencyAccessDecisionDto = {},
  ): Promise<EmergencyAccess> {
    const row = await this.get(id);
    if (row.status === EmergencyAccessStatus.REVOKED) return row;

    row.status = EmergencyAccessStatus.REVOKED;
    row.revokedAt = new Date();
    row.updatedBy = this.userId();
    if (dto.notes) row.metadata = { ...row.metadata, revokedNotes: dto.notes };

    const saved = await this.requests.save(row);
    await this.events.create({
      tenantId: saved.tenantId,
      eventType: SecurityEventType.EMERGENCY_ACCESS_REVOKED,
      severity: SecuritySeverity.MEDIUM,
      source: SecurityEventSource.SECURITY,
      userId: this.userId(),
      riskScore: 40,
      metadata: { requestId: saved.id, requesterId: saved.requesterId },
    });
    await this.auditSafe(saved, AuditAction.DELETE, {
      status: saved.status,
      notes: dto.notes ?? null,
    });
    this.metrics.inc('security_emergency_access_total', {
      status: EmergencyAccessStatus.REVOKED,
    });
    return saved;
  }


  async list(): Promise<EmergencyAccess[]> {
    const tenantId = this.tenantId();
    await this.requests
      .createQueryBuilder()
      .update(EmergencyAccess)
      .set({ status: EmergencyAccessStatus.EXPIRED })
      .where('tenant_id = :tenantId', { tenantId })
      .andWhere('status IN (:...statuses)', {
        statuses: [
          EmergencyAccessStatus.PENDING,
          EmergencyAccessStatus.APPROVED,
        ],
      })
      .andWhere('expires_at < now()')
      .execute();

    return this.requests.find({
      where: { tenantId },
      order: { requestedAt: 'DESC' },
      take: 100,
    });
  }

  /** Used by guards/interceptors to decide whether an emergency session is live. */
  async isActive(userId: string): Promise<boolean> {
    const row = await this.requests.findOne({
      where: [
        {
          tenantId: this.tenantId(),
          requesterId: userId,
          status: EmergencyAccessStatus.APPROVED,
        },
        {
          tenantId: this.tenantId(),
          approverId: userId,
          status: EmergencyAccessStatus.APPROVED,
        },
      ],
      order: { approvedAt: 'DESC' },
    });
    return !!row && row.expiresAt.getTime() > Date.now();
  }

  private async get(id: string): Promise<EmergencyAccess> {
    const row = await this.requests.findOne({
      where: { id, tenantId: this.tenantId() },
    });
    if (!row) throw new NotFoundException('Emergency access request not found');
    return row;
  }

  private async auditSafe(
    row: EmergencyAccess,
    action: AuditAction,
    data: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.audit.logAction('security_emergency_access', row.id, action, {
        newData: data,
      });
    } catch (error) {
      this.logger.warn(
        `Emergency access audit skipped: ${error instanceof Error ? error.message : error}`,
      );
    }
  }
}

