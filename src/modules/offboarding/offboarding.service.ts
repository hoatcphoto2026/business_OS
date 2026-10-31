import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantOffboarding } from './entities/tenant-offboarding.entity';
import { OffboardingStatus } from './enums/offboarding.enum';
import { StartOffboardingDto } from './dto/start-offboarding.dto';
import { TenantContextService } from '../../common/tenant-context/tenant-context.service';
import { TenantUser, MembershipStatus } from '../tenant/entities/tenant-user.entity';
import { ApiKey } from '../integration/entities/api-key.entity';
import { Subscription } from '../billing/entities/subscription.entity';
import { SubscriptionStatus } from '../billing/enums/billing.enum';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/enums/audit-action.enum';
import { NotificationService } from '../notification/notification.service';

@Injectable()
export class OffboardingService {
  private readonly logger = new Logger(OffboardingService.name);

  constructor(
    @InjectRepository(TenantOffboarding)
    private readonly offboardings: Repository<TenantOffboarding>,
    @InjectRepository(TenantUser)
    private readonly memberships: Repository<TenantUser>,
    @InjectRepository(ApiKey)
    private readonly apiKeys: Repository<ApiKey>,
    @InjectRepository(Subscription)
    private readonly subscriptions: Repository<Subscription>,
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
    const uid = this.tenantContext.getCurrentUserId();
    if (!uid) throw new ForbiddenException('No user context');
    return uid;
  }

  async start(dto: StartOffboardingDto): Promise<TenantOffboarding> {
    const tenantId = this.getTenantId();
    const requestedBy = this.getUserId();

    const record = this.offboardings.create({
      tenantId,
      requestedBy,
      status: OffboardingStatus.REQUESTED,
      currentStep: 'REQUESTED',
      createdBy: requestedBy,
    });
    const offboarding = await this.offboardings.save(record);

    // Run async-style but await for simplicity in demo
    try {
      await this.process(offboarding, dto);
    } catch (err: any) {
      offboarding.status = OffboardingStatus.FAILED;
      offboarding.errorMessage = err.message || String(err);
      await this.offboardings.save(offboarding);
      this.logger.error(`Offboarding failed: ${err.message}`);
    }

    return this.offboardings.findOne({ where: { id: offboarding.id } }) as Promise<TenantOffboarding>;
  }

  private async process(offboarding: TenantOffboarding, dto: StartOffboardingDto): Promise<void> {
    const tenantId = offboarding.tenantId;
    const report: Record<string, unknown> = { steps: [] };

    offboarding.status = OffboardingStatus.PROCESSING;
    offboarding.currentStep = 'PROCESSING';
    await this.offboardings.save(offboarding);

    // 1. Export Data (summary)
    if (dto.exportData !== false) {
      offboarding.currentStep = 'EXPORT_DATA';
      await this.offboardings.save(offboarding);

      const userCount = await this.memberships.count({ where: { tenantId } });
      const keyCount = await this.apiKeys.count({ where: { tenantId } });
      const subCount = await this.subscriptions.count({ where: { tenantId } });

      offboarding.exportSummary = {
        users: userCount,
        apiKeys: keyCount,
        subscriptions: subCount,
        exportedAt: new Date().toISOString(),
      };
      report.steps = [...(report.steps as any[]), { step: 'EXPORT_DATA', summary: offboarding.exportSummary }];
      await this.offboardings.save(offboarding);
    }

    // 2. Generate Archive (metadata only for demo)
    offboarding.currentStep = 'GENERATE_ARCHIVE';
    await this.offboardings.save(offboarding);
    offboarding.archiveRef = `offboarding-${offboarding.id}-${Date.now()}.json`;
    report.steps = [...(report.steps as any[]), { step: 'GENERATE_ARCHIVE', archiveRef: offboarding.archiveRef }];
    await this.offboardings.save(offboarding);

    // 3. Deactivate Users
    if (dto.deactivateUsers !== false) {
      offboarding.currentStep = 'DEACTIVATE_USERS';
      await this.offboardings.save(offboarding);

      // Never suspend owner/admin roles or the requester – keeps the tenant accessible for the report
      const result = await this.memberships
        .createQueryBuilder()
        .update(TenantUser)
        .set({ status: MembershipStatus.SUSPENDED })
        .where('tenant_id = :tenantId', { tenantId })
        .andWhere('status = :active', { active: MembershipStatus.ACTIVE })
        .andWhere('user_id != :requester', { requester: offboarding.requestedBy })
        .andWhere("role NOT IN ('owner', 'admin')")
        .execute();
      report.steps = [...(report.steps as any[]), { step: 'DEACTIVATE_USERS', affected: result.affected ?? 0 }];
    }

    // 4. Revoke API Keys
    if (dto.revokeApiKeys !== false) {
      offboarding.currentStep = 'REVOKE_API_KEYS';
      await this.offboardings.save(offboarding);

      const result = await this.apiKeys.update(
        { tenantId, status: 'active' },
        { status: 'revoked' },
      );
      report.steps = [...(report.steps as any[]), { step: 'REVOKE_API_KEYS', affected: result.affected ?? 0 }];
    }

    // 5. Cancel Subscription
    if (dto.cancelSubscription !== false) {
      offboarding.currentStep = 'CANCEL_SUBSCRIPTION';
      await this.offboardings.save(offboarding);

      const subs = await this.subscriptions.find({ where: { tenantId } });
      for (const sub of subs) {
        if (sub.status !== SubscriptionStatus.CANCELLED && sub.status !== SubscriptionStatus.EXPIRED) {
          sub.status = SubscriptionStatus.CANCELLED;
          sub.cancelledAt = new Date();
          await this.subscriptions.save(sub);
        }
      }
      report.steps = [...(report.steps as any[]), { step: 'CANCEL_SUBSCRIPTION', cancelled: subs.length }];
    }

    // Complete
    offboarding.status = OffboardingStatus.COMPLETED;
    offboarding.currentStep = 'COMPLETED';
    offboarding.completedAt = new Date();
    offboarding.report = report;
    offboarding.errorMessage = null;
    await this.offboardings.save(offboarding);

    // Audit
    try {
      await this.audit.logAction('tenant_offboarding', offboarding.id, AuditAction.CREATE, {
        newData: { status: 'COMPLETED', report },
      });
    } catch {
      this.logger.warn('Audit skipped on offboarding complete');
    }

    // Notify requester
    try {
      await this.notifications.send({
        userId: offboarding.requestedBy,
        title: 'Offboarding completed',
        body: `Tenant offboarding has been completed. Archive: ${offboarding.archiveRef}`,
        eventType: 'TenantOffboarded',
        data: { offboardingId: offboarding.id },
      });
    } catch {
      this.logger.warn('Notification skipped on offboarding complete');
    }
  }

  async get(id: string): Promise<TenantOffboarding> {
    const tenantId = this.getTenantId();
    const o = await this.offboardings.findOne({ where: { id, tenantId } });
    if (!o) throw new NotFoundException('Offboarding not found');
    return o;
  }

  async list(): Promise<TenantOffboarding[]> {
    const tenantId = this.getTenantId();
    return this.offboardings.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }

  async getReport(id: string): Promise<Record<string, unknown>> {
    const o = await this.get(id);
    return {
      id: o.id,
      status: o.status,
      exportSummary: o.exportSummary,
      archiveRef: o.archiveRef,
      report: o.report,
      completedAt: o.completedAt,
    };
  }
}
