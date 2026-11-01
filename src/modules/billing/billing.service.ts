import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Plan } from './entities/plan.entity';
import { PlanFeature } from './entities/plan-feature.entity';
import { Subscription } from './entities/subscription.entity';
import {
  PlanCode,
  SubscriptionStatus,
  BillingCycle,
  SUBSCRIPTION_TRANSITIONS,
} from './enums/billing.enum';
import { TenantContextService } from '../../common/tenant-context/tenant-context.service';
import { ChangePlanDto } from './dto/change-plan.dto';
import { CancelSubscriptionDto } from './dto/cancel-subscription.dto';
import { Tenant } from '../tenant/entities/tenant.entity';
import { TenantPlan, TenantStatus } from '../tenant/entities/tenant.entity';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/enums/audit-action.enum';
import { EventBus } from '../event/event-bus.service';
import { EventType } from '../event/enums/event-type.enum';
import { LicenseService } from './license.service';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    @InjectRepository(Plan)
    private readonly plans: Repository<Plan>,
    @InjectRepository(PlanFeature)
    private readonly planFeatures: Repository<PlanFeature>,
    @InjectRepository(Subscription)
    private readonly subscriptions: Repository<Subscription>,
    @InjectRepository(Tenant)
    private readonly tenants: Repository<Tenant>,
    private readonly tenantContext: TenantContextService,
    private readonly auditService: AuditService,
    private readonly eventBus: EventBus,
    private readonly licenseService: LicenseService,
  ) {}

  // ──────────────────────────────────────────────
  // Plans
  // ──────────────────────────────────────────────

  async listPlans(includeInactive = false): Promise<Plan[]> {
    const qb = this.plans
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.features', 'f')
      .orderBy('p.sortOrder', 'ASC')
      .addOrderBy('p.code', 'ASC');

    if (!includeInactive) {
      qb.where('p.isActive = true');
    }

    return qb.getMany();
  }

  async getPlan(idOrCode: string): Promise<Plan> {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrCode);

    const plan = await this.plans.findOne({
      where: isUuid
        ? [{ id: idOrCode }, { code: idOrCode as PlanCode }]
        : [{ code: idOrCode as PlanCode }],
      relations: ['features'],
    });

    if (!plan) {
      throw new NotFoundException(`Plan not found: ${idOrCode}`);
    }
    return plan;
  }

  // ──────────────────────────────────────────────
  // Subscription – current tenant
  // ──────────────────────────────────────────────

  private getTenantId(): string {
    const tenantId = this.tenantContext.getCurrentTenantId();
    if (!tenantId) {
      throw new BadRequestException('Tenant context is required');
    }
    return tenantId;
  }

  async getCurrentSubscription(): Promise<Subscription | null> {
    const tenantId = this.getTenantId();
    return this.subscriptions.findOne({
      where: { tenantId },
      relations: ['plan', 'plan.features'],
      order: { createdAt: 'DESC' },
    });
  }

  async getOrCreateTrialSubscription(): Promise<Subscription> {
    let sub = await this.getCurrentSubscription();
    if (sub) return sub;

    const freePlan = await this.plans.findOne({ where: { code: PlanCode.FREE } });
    if (!freePlan) {
      throw new NotFoundException('FREE plan is not seeded');
    }

    const tenantId = this.getTenantId();
    const now = new Date();
    const trialEnd = new Date(now);
    trialEnd.setDate(trialEnd.getDate() + (freePlan.trialDays || 14));

    sub = this.subscriptions.create({
      tenantId,
      planId: freePlan.id,
      status: SubscriptionStatus.TRIAL,
      billingCycle: BillingCycle.MONTHLY,
      currentPeriodStart: now,
      trialEnd,
      createdBy: this.tenantContext.getCurrentUserId() || null,
    });

    sub = await this.subscriptions.save(sub);
    await this.syncTenant(sub);
    await this.licenseService.invalidate(sub.tenantId);
    return sub;
  }

  // ──────────────────────────────────────────────
  // Lifecycle actions
  // ──────────────────────────────────────────────

  private assertTransition(from: SubscriptionStatus, to: SubscriptionStatus): void {
    const allowed = SUBSCRIPTION_TRANSITIONS[from] || [];
    if (!allowed.includes(to)) {
      throw new BadRequestException(
        `Invalid subscription transition: ${from} → ${to}`,
      );
    }
  }

  async changePlan(dto: ChangePlanDto): Promise<Subscription> {
    const tenantId = this.getTenantId();
    const userId = this.tenantContext.getCurrentUserId();

    const plan = dto.planId
      ? await this.getPlan(dto.planId)
      : dto.planCode
        ? await this.getPlan(dto.planCode)
        : null;

    if (!plan || !plan.isActive) {
      throw new BadRequestException('Valid active plan is required');
    }

    let sub = await this.getCurrentSubscription();
    const now = new Date();
    const previous = sub
      ? {
          planCode: sub.plan?.code ?? null,
          billingCycle: sub.billingCycle,
          status: sub.status,
        }
      : null;

    if (!sub) {
      // Create new as ACTIVE (or TRIAL if FREE)
      const status =
        plan.code === PlanCode.FREE
          ? SubscriptionStatus.TRIAL
          : SubscriptionStatus.ACTIVE;

      const periodEnd = new Date(now);
      if (dto.billingCycle === BillingCycle.YEARLY) {
        periodEnd.setFullYear(periodEnd.getFullYear() + 1);
      } else {
        periodEnd.setMonth(periodEnd.getMonth() + 1);
      }

      sub = this.subscriptions.create({
        tenantId,
        planId: plan.id,
        status,
        billingCycle: dto.billingCycle,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        createdBy: userId || null,
      });
    } else {
      // Plan change is allowed from any non-terminal status.
      // Status is promoted to ACTIVE (or kept TRIAL for FREE) when appropriate.
      const targetStatus =
        plan.code === PlanCode.FREE && sub.status === SubscriptionStatus.TRIAL
          ? SubscriptionStatus.TRIAL
          : SubscriptionStatus.ACTIVE;

      if (sub.status !== targetStatus) {
        this.assertTransition(sub.status, targetStatus);
      }

      sub.planId = plan.id;
      sub.plan = plan; // keep relation in sync so TypeORM persists the FK
      sub.billingCycle = dto.billingCycle;
      sub.status = targetStatus;
      sub.cancelAtPeriodEnd = false;
      sub.cancelledAt = null;
      sub.updatedBy = userId || null;

      // Reset period
      sub.currentPeriodStart = now;
      const periodEnd = new Date(now);
      if (dto.billingCycle === BillingCycle.YEARLY) {
        periodEnd.setFullYear(periodEnd.getFullYear() + 1);
      } else {
        periodEnd.setMonth(periodEnd.getMonth() + 1);
      }
      sub.currentPeriodEnd = periodEnd;
    }

    sub = await this.subscriptions.save(sub);
    await this.syncTenant(sub);
    await this.licenseService.invalidate(sub.tenantId);

    await this.auditService.logAction(
      'Subscription',
      sub.id,
      AuditAction.UPDATE,
      {
        oldData: previous,
        newData: { planCode: plan.code, billingCycle: dto.billingCycle, status: sub.status },
      },
    );

    await this.eventBus.publish(
      EventType.SubscriptionChanged,
      'subscription',
      sub.id,
      { planCode: plan.code, status: sub.status, billingCycle: dto.billingCycle },
      { tenantId },
    );

    return this.subscriptions.findOneOrFail({
      where: { id: sub.id },
      relations: ['plan', 'plan.features'],
    });
  }

  async cancel(dto: CancelSubscriptionDto = {}): Promise<Subscription> {
    const sub = await this.getCurrentSubscription();
    if (!sub) {
      throw new NotFoundException('No subscription found');
    }

    const userId = this.tenantContext.getCurrentUserId();
    const cancelAtPeriodEnd = dto.cancelAtPeriodEnd !== false; // default true

    if (cancelAtPeriodEnd) {
      if (sub.status === SubscriptionStatus.CANCELLED) {
        throw new BadRequestException('Already cancelled');
      }
      sub.cancelAtPeriodEnd = true;
      // Status stays until period end (job would flip it)
    } else {
      this.assertTransition(sub.status, SubscriptionStatus.CANCELLED);
      sub.status = SubscriptionStatus.CANCELLED;
      sub.cancelledAt = new Date();
      sub.cancelAtPeriodEnd = false;
    }

    sub.updatedBy = userId || null;
    const saved = await this.subscriptions.save(sub);
    await this.syncTenant(saved);
    await this.licenseService.invalidate(saved.tenantId);

    await this.auditService.logAction(
      'Subscription',
      saved.id,
      AuditAction.UPDATE,
      {
        newData: {
          status: saved.status,
          cancelAtPeriodEnd: saved.cancelAtPeriodEnd,
          cancelledAt: saved.cancelledAt,
        },
      },
    );

    await this.eventBus.publish(
      EventType.SubscriptionCancelled,
      'subscription',
      saved.id,
      { cancelAtPeriodEnd, status: saved.status },
      { tenantId: saved.tenantId },
    );

    return saved;
  }

  async reactivate(): Promise<Subscription> {
    const sub = await this.getCurrentSubscription();
    if (!sub) {
      throw new NotFoundException('No subscription found');
    }

    const userId = this.tenantContext.getCurrentUserId();

    if (
      sub.status !== SubscriptionStatus.CANCELLED &&
      sub.status !== SubscriptionStatus.EXPIRED &&
      sub.status !== SubscriptionStatus.SUSPENDED
    ) {
      throw new BadRequestException(
        `Cannot reactivate from status ${sub.status}`,
      );
    }

    this.assertTransition(sub.status, SubscriptionStatus.ACTIVE);

    const now = new Date();
    sub.status = SubscriptionStatus.ACTIVE;
    sub.cancelAtPeriodEnd = false;
    sub.cancelledAt = null;
    sub.currentPeriodStart = now;
    const periodEnd = new Date(now);
    if (sub.billingCycle === BillingCycle.YEARLY) {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    } else {
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    }
    sub.currentPeriodEnd = periodEnd;
    sub.updatedBy = userId || null;

    const saved = await this.subscriptions.save(sub);
    await this.syncTenant(saved);
    await this.licenseService.invalidate(saved.tenantId);

    await this.auditService.logAction(
      'Subscription',
      saved.id,
      AuditAction.UPDATE,
      {
        newData: { status: saved.status, currentPeriodEnd: saved.currentPeriodEnd },
      },
    );

    await this.eventBus.publish(
      EventType.SubscriptionReactivated,
      'subscription',
      saved.id,
      { status: saved.status },
      { tenantId: saved.tenantId },
    );

    return this.subscriptions.findOneOrFail({
      where: { id: saved.id },
      relations: ['plan', 'plan.features'],
    });
  }

  // ──────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────

  /** Keep Tenant.plan / Tenant.status in sync with the subscription. */
  private async syncTenant(sub: Subscription): Promise<void> {
    const plan = await this.plans.findOne({ where: { id: sub.planId } });
    if (!plan) return;

    const tenantStatus = this.mapStatusToTenant(sub.status);
    const tenantPlan = plan.code as unknown as TenantPlan;

    await this.tenants.update(
      { id: sub.tenantId },
      {
        plan: tenantPlan,
        status: tenantStatus,
      },
    );
  }

  private mapStatusToTenant(status: SubscriptionStatus): TenantStatus {
    switch (status) {
      case SubscriptionStatus.TRIAL:
        return TenantStatus.TRIAL;
      case SubscriptionStatus.ACTIVE:
        return TenantStatus.ACTIVE;
      case SubscriptionStatus.PAST_DUE:
      case SubscriptionStatus.GRACE_PERIOD:
        return TenantStatus.PAST_DUE;
      case SubscriptionStatus.SUSPENDED:
        return TenantStatus.SUSPENDED;
      case SubscriptionStatus.EXPIRED:
        return TenantStatus.CLOSED;
      case SubscriptionStatus.CANCELLED:
        return TenantStatus.PAST_DUE; // still allow login so owner can reactivate
      default:
        return TenantStatus.ACTIVE;
    }
  }
}
