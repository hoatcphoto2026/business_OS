import { Injectable, Logger, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { TenantOnboarding } from './entities/tenant-onboarding.entity';
import { OnboardingStatus } from './enums/onboarding.enum';
import { StartOnboardingDto } from './dto/start-onboarding.dto';
import { Tenant, TenantPlan, TenantStatus } from '../tenant/entities/tenant.entity';
import { User } from '../users/entities/user.entity';
import { TenantUser, MembershipStatus } from '../tenant/entities/tenant-user.entity';
import { Subscription } from '../billing/entities/subscription.entity';
import { Plan } from '../billing/entities/plan.entity';
import { SubscriptionStatus, BillingCycle, PlanCode } from '../billing/enums/billing.enum';
import { NotificationService } from '../notification/notification.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/enums/audit-action.enum';

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);
  private readonly counters = new Map<string, number>();

  constructor(
    @InjectRepository(TenantOnboarding)
    private readonly onboardings: Repository<TenantOnboarding>,
    @InjectRepository(Tenant)
    private readonly tenants: Repository<Tenant>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(TenantUser)
    private readonly memberships: Repository<TenantUser>,
    @InjectRepository(Subscription)
    private readonly subscriptions: Repository<Subscription>,
    @InjectRepository(Plan)
    private readonly plans: Repository<Plan>,
    private readonly notifications: NotificationService,
    private readonly audit: AuditService,
    private readonly dataSource: DataSource,
  ) {}

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

  async start(dto: StartOnboardingDto): Promise<TenantOnboarding> {
    // Uniqueness checks
    const existingCode = await this.tenants.findOne({ where: { code: dto.code } });
    if (existingCode) throw new ConflictException(`Tenant code "${dto.code}" already exists`);

    const existingSlug = await this.tenants.findOne({ where: { slug: dto.slug } });
    if (existingSlug) throw new ConflictException(`Tenant slug "${dto.slug}" already exists`);

    const existingEmail = await this.users.findOne({ where: { email: dto.ownerEmail } });
    if (existingEmail) throw new ConflictException(`Email "${dto.ownerEmail}" already exists`);

    const record = this.onboardings.create({
      status: OnboardingStatus.PENDING,
      currentStep: 'INIT',
      metadata: { code: dto.code, slug: dto.slug, ownerEmail: dto.ownerEmail },
    });
    const onboarding = await this.onboardings.save(record);

    try {
      await this.runFlow(onboarding, dto);
      this.inc('onboarding_completed_total');
    } catch (err: any) {
      onboarding.status = OnboardingStatus.FAILED;
      onboarding.errorMessage = err.message || String(err);
      await this.onboardings.save(onboarding);
      this.inc('onboarding_failed_total');
      this.logger.error(`Onboarding failed: ${err.message}`);
      // Do not rethrow – return the FAILED record so caller can retry
    }

    return this.onboardings.findOne({ where: { id: onboarding.id } }) as Promise<TenantOnboarding>;
  }

  async retry(id: string): Promise<TenantOnboarding> {
    const onboarding = await this.onboardings.findOne({ where: { id } });
    if (!onboarding) throw new NotFoundException('Onboarding record not found');
    if (onboarding.status === OnboardingStatus.COMPLETED) return onboarding;

    onboarding.retryCount += 1;
    onboarding.status = OnboardingStatus.PENDING;
    onboarding.errorMessage = null;
    await this.onboardings.save(onboarding);

    // Reconstruct minimal dto from metadata for retry
    const meta = onboarding.metadata as any;
    const dto: StartOnboardingDto = {
      code: meta.code,
      slug: meta.slug,
      name: meta.name || meta.code,
      ownerEmail: meta.ownerEmail,
      ownerFullName: meta.ownerFullName || 'Owner',
      ownerPassword: meta.ownerPassword || 'Password123!',
    };

    try {
      await this.runFlow(onboarding, dto);
      this.inc('onboarding_retry_success_total');
    } catch (err: any) {
      onboarding.status = OnboardingStatus.FAILED;
      onboarding.errorMessage = err.message || String(err);
      await this.onboardings.save(onboarding);
      this.inc('onboarding_retry_failed_total');
    }

    return this.onboardings.findOne({ where: { id } }) as Promise<TenantOnboarding>;
  }

  private async runFlow(onboarding: TenantOnboarding, dto: StartOnboardingDto): Promise<void> {
    // 1. Create Tenant
    onboarding.currentStep = 'CREATE_TENANT';
    await this.onboardings.save(onboarding);

    let tenant = onboarding.tenantId
      ? await this.tenants.findOne({ where: { id: onboarding.tenantId } })
      : null;

    if (!tenant) {
      tenant = this.tenants.create({
        code: dto.code,
        slug: dto.slug,
        name: dto.name,
        plan: TenantPlan.FREE,
        status: TenantStatus.TRIAL,
        settings: {},
      });
      tenant = await this.tenants.save(tenant);
      onboarding.tenantId = tenant.id;
      await this.onboardings.save(onboarding);
    }

    // 2. Create Owner User + Membership
    onboarding.currentStep = 'CREATE_OWNER';
    await this.onboardings.save(onboarding);

    let user = onboarding.ownerUserId
      ? await this.users.findOne({ where: { id: onboarding.ownerUserId } })
      : null;

    if (!user) {
      const passwordHash = await bcrypt.hash(dto.ownerPassword, 10);
      user = this.users.create({
        email: dto.ownerEmail,
        passwordHash,
        fullName: dto.ownerFullName,
        isActive: true,
      });
      user = await this.users.save(user);
      onboarding.ownerUserId = user.id;
      await this.onboardings.save(onboarding);
    }

    // Membership
    let membership = await this.memberships.findOne({
      where: { tenantId: tenant.id, userId: user.id },
    });
    if (!membership) {
      membership = this.memberships.create({
        tenantId: tenant.id,
        userId: user.id,
        role: 'owner',
        status: MembershipStatus.ACTIVE,
      });
      await this.memberships.save(membership);
    }

    // 3. Assign Trial Subscription
    onboarding.currentStep = 'ASSIGN_TRIAL';
    await this.onboardings.save(onboarding);

    const existingSub = await this.subscriptions.findOne({ where: { tenantId: tenant.id } });
    if (!existingSub) {
      const freePlan = await this.plans.findOne({ where: { code: PlanCode.FREE } });
      if (freePlan) {
        const now = new Date();
        const trialEnd = new Date(now);
        trialEnd.setDate(trialEnd.getDate() + (freePlan.trialDays || 14));

        const sub = this.subscriptions.create({
          tenantId: tenant.id,
          planId: freePlan.id,
          status: SubscriptionStatus.TRIAL,
          billingCycle: BillingCycle.MONTHLY,
          currentPeriodStart: now,
          trialEnd,
          createdBy: user.id,
        });
        await this.subscriptions.save(sub);
      }
    }

    // 4. Seed Default Roles (minimal – full RBAC can be expanded later)
    onboarding.currentStep = 'SEED_ROLES';
    await this.onboardings.save(onboarding);
    // Placeholder: in production call a dedicated RoleSeeder. For now we rely on membership role='owner'.

    // 5. Send Welcome Notification
    onboarding.currentStep = 'WELCOME_NOTIFICATION';
    await this.onboardings.save(onboarding);

    try {
      await this.notifications.send({
        userId: user.id,
        title: 'Welcome to Business OS',
        body: `Your tenant "${tenant.name}" is ready. Trial subscription has been activated.`,
        eventType: 'TenantOnboarded',
        data: { tenantId: tenant.id, onboardingId: onboarding.id },
      });
    } catch (e: any) {
      this.logger.warn(`Welcome notification skipped: ${e.message}`);
      // Non-fatal
    }

    // Complete
    onboarding.status = OnboardingStatus.COMPLETED;
    onboarding.currentStep = 'DONE';
    onboarding.completedAt = new Date();
    onboarding.errorMessage = null;
    await this.onboardings.save(onboarding);

    try {
      await this.audit.logAction('tenant_onboarding', onboarding.id, AuditAction.CREATE, {
        newData: { tenantId: tenant.id, ownerUserId: user.id, status: 'COMPLETED' },
      });
    } catch {
      this.logger.warn('Audit skipped on onboarding complete');
    }
  }

  async get(id: string): Promise<TenantOnboarding> {
    const o = await this.onboardings.findOne({ where: { id } });
    if (!o) throw new NotFoundException('Onboarding not found');
    return o;
  }

  async list(): Promise<TenantOnboarding[]> {
    return this.onboardings.find({ order: { createdAt: 'DESC' }, take: 50 });
  }
}
