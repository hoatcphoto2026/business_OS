import { Injectable, Logger, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SuspensionRecord } from './entities/suspension-record.entity';
import { SuspensionStatus } from './enums/suspension.enum';
import { TriggerSuspensionDto } from './dto/trigger-suspension.dto';
import { Tenant } from '../tenant/entities/tenant.entity';
import { TenantStatus } from '../tenant/entities/tenant.entity';
import { TenantUser, MembershipStatus } from '../tenant/entities/tenant-user.entity';
import { ApiKey } from '../integration/entities/api-key.entity';
import { TenantContextService } from '../../common/tenant-context/tenant-context.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/enums/audit-action.enum';
import { NotificationService } from '../notification/notification.service';

@Injectable()
export class AutoSuspensionService {
  private readonly logger = new Logger(AutoSuspensionService.name);
  private readonly counters = new Map<string, number>();

  constructor(
    @InjectRepository(SuspensionRecord)
    private readonly records: Repository<SuspensionRecord>,
    @InjectRepository(Tenant)
    private readonly tenants: Repository<Tenant>,
    @InjectRepository(TenantUser)
    private readonly memberships: Repository<TenantUser>,
    @InjectRepository(ApiKey)
    private readonly apiKeys: Repository<ApiKey>,
    private readonly tenantContext: TenantContextService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
  ) {}

  private getTenantId(): string {
    const tid = this.tenantContext.getCurrentTenantId();
    if (!tid) throw new ForbiddenException('No tenant context');
    return tid;
  }

  private getUserId(): string {
    return this.tenantContext.getCurrentUserId() || '';
  }

  private inc(name: string) {
    this.counters.set(name, (this.counters.get(name) || 0) + 1);
  }

  getPrometheusText(): string {
    const lines: string[] = [];
    for (const [k, v] of this.counters.entries()) {
      lines.push(`# TYPE ${k} counter`);
      lines.push(`${k} ${v}`);
    }
    return lines.join('\n') + '\n';
  }

  async trigger(dto: TriggerSuspensionDto): Promise<SuspensionRecord> {
    const tenantId = this.getTenantId();
    const userId = this.getUserId();

    const record = this.records.create({
      tenantId,
      trigger: dto.trigger,
      status: SuspensionStatus.PENDING,
      metadata: { reason: dto.reason },
      createdBy: userId || null,
    });
    const saved = await this.records.save(record);

    try {
      await this.execute(saved, userId);
      this.inc('suspensions_completed_total');
    } catch (err: any) {
      saved.status = SuspensionStatus.FAILED;
      saved.errorMessage = err.message;
      saved.attemptCount += 1;
      await this.records.save(saved);
      this.inc('suspensions_failed_total');
      this.logger.warn(`Suspension failed: ${err.message}`);
    }

    return this.records.findOne({ where: { id: saved.id } }) as Promise<SuspensionRecord>;
  }

  private async execute(record: SuspensionRecord, requesterId: string): Promise<void> {
    const tenantId = record.tenantId;

    // 1. Suspend tenant
    const tenant = await this.tenants.findOne({ where: { id: tenantId } });
    if (tenant && tenant.status !== TenantStatus.SUSPENDED) {
      tenant.status = TenantStatus.SUSPENDED;
      await this.tenants.save(tenant);
    }

    // 2. Disable users (except requester and owners/admins)
    const userResult = await this.memberships
      .createQueryBuilder()
      .update(TenantUser)
      .set({ status: MembershipStatus.SUSPENDED })
      .where('tenant_id = :tenantId', { tenantId })
      .andWhere('status = :active', { active: MembershipStatus.ACTIVE })
      .andWhere('user_id != :requester', { requester: requesterId })
      .andWhere("role NOT IN ('owner', 'admin')")
      .execute();
    record.usersDisabled = userResult.affected ?? 0;

    // 3. Revoke API keys
    const keyResult = await this.apiKeys.update(
      { tenantId, status: 'active' },
      { status: 'revoked' },
    );
    record.apiKeysRevoked = keyResult.affected ?? 0;

    // 4. Notify
    try {
      await this.notifications.send({
        userId: requesterId || undefined,
        title: 'Tenant suspended',
        body: `Tenant suspended due to ${record.trigger}`,
        eventType: 'TenantSuspended',
        data: { trigger: record.trigger, recordId: record.id },
      });
    } catch {}

    record.status = SuspensionStatus.SUSPENDED;
    record.processedAt = new Date();
    await this.records.save(record);

    // 5. Audit
    try {
      await this.audit.logAction('suspension_record', record.id, AuditAction.CREATE, {
        newData: { trigger: record.trigger, status: record.status },
      });
    } catch {}
  }

  async list(): Promise<SuspensionRecord[]> {
    const tenantId = this.getTenantId();
    return this.records.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  async get(id: string): Promise<SuspensionRecord> {
    const tenantId = this.getTenantId();
    const r = await this.records.findOne({ where: { id, tenantId } });
    if (!r) throw new NotFoundException('Suspension record not found');
    return r;
  }

  async retry(id: string): Promise<SuspensionRecord> {
    const record = await this.get(id);
    if (record.status !== SuspensionStatus.FAILED) return record;

    record.attemptCount += 1;
    record.status = SuspensionStatus.PENDING;
    record.errorMessage = null;
    await this.records.save(record);

    try {
      await this.execute(record, this.getUserId());
    } catch (err: any) {
      record.status = SuspensionStatus.FAILED;
      record.errorMessage = err.message;
      await this.records.save(record);
    }

    return this.records.findOne({ where: { id } }) as Promise<SuspensionRecord>;
  }

  /**
   * Reactivate a previously suspended tenant.
   * Restores tenant status and re-activates non-owner memberships that were suspended.
   */
  async reactivate(reason?: string): Promise<{ ok: boolean; tenantId: string }> {
    const tenantId = this.getTenantId();
    const userId = this.getUserId();

    const tenant = await this.tenants.findOne({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant not found');

    if (tenant.status === TenantStatus.SUSPENDED) {
      tenant.status = TenantStatus.ACTIVE;
      await this.tenants.save(tenant);
    }

    // Re-activate memberships that were suspended (except we don't touch owner/admin specially)
    await this.memberships
      .createQueryBuilder()
      .update(TenantUser)
      .set({ status: MembershipStatus.ACTIVE })
      .where('tenant_id = :tenantId', { tenantId })
      .andWhere('status = :suspended', { suspended: MembershipStatus.SUSPENDED })
      .execute();

    try {
      await this.notifications.send({
        userId: userId || undefined,
        title: 'Tenant reactivated',
        body: reason || 'Tenant has been reactivated',
        eventType: 'TenantReactivated',
        data: { tenantId },
      });
    } catch {}

    try {
      await this.audit.logAction('tenant', tenantId, AuditAction.UPDATE, {
        newData: { action: 'REACTIVATE', reason },
      });
    } catch {}

    this.inc('suspensions_reactivated_total');
    return { ok: true, tenantId };
  }

}
