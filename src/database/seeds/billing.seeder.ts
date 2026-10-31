import { DataSource } from 'typeorm';
import { Plan } from '../../modules/billing/entities/plan.entity';
import { PlanFeature } from '../../modules/billing/entities/plan-feature.entity';
import { Subscription } from '../../modules/billing/entities/subscription.entity';
import {
  PlanCode,
  PlanFeatureCode,
  SubscriptionStatus,
  BillingCycle,
} from '../../modules/billing/enums/billing.enum';
import { Tenant } from '../../modules/tenant/entities/tenant.entity';

interface PlanSeed {
  code: PlanCode;
  name: string;
  description: string;
  monthlyPrice: number;
  yearlyPrice: number;
  trialDays: number;
  sortOrder: number;
  features: Array<{ code: PlanFeatureCode; limit: number | null }>;
}

const PLANS: PlanSeed[] = [
  {
    code: PlanCode.FREE,
    name: 'Free',
    description: 'Bắt đầu miễn phí – giới hạn cơ bản',
    monthlyPrice: 0,
    yearlyPrice: 0,
    trialDays: 14,
    sortOrder: 10,
    features: [
      { code: PlanFeatureCode.USERS, limit: 2 },
      { code: PlanFeatureCode.API_KEYS, limit: 1 },
      { code: PlanFeatureCode.WEBHOOKS, limit: 0 },
      { code: PlanFeatureCode.STORAGE_GB, limit: 1 },
      { code: PlanFeatureCode.AI_REQUESTS, limit: 100 },
    ],
  },
  {
    code: PlanCode.STARTER,
    name: 'Starter',
    description: 'Dành cho cửa hàng / SME nhỏ',
    monthlyPrice: 199000,
    yearlyPrice: 1990000,
    trialDays: 14,
    sortOrder: 20,
    features: [
      { code: PlanFeatureCode.USERS, limit: 5 },
      { code: PlanFeatureCode.API_KEYS, limit: 3 },
      { code: PlanFeatureCode.WEBHOOKS, limit: 2 },
      { code: PlanFeatureCode.STORAGE_GB, limit: 5 },
      { code: PlanFeatureCode.AI_REQUESTS, limit: 1000 },
    ],
  },
  {
    code: PlanCode.PROFESSIONAL,
    name: 'Professional',
    description: 'Doanh nghiệp đang tăng trưởng',
    monthlyPrice: 499000,
    yearlyPrice: 4990000,
    trialDays: 14,
    sortOrder: 30,
    features: [
      { code: PlanFeatureCode.USERS, limit: 20 },
      { code: PlanFeatureCode.API_KEYS, limit: 10 },
      { code: PlanFeatureCode.WEBHOOKS, limit: 10 },
      { code: PlanFeatureCode.STORAGE_GB, limit: 50 },
      { code: PlanFeatureCode.AI_REQUESTS, limit: 10000 },
    ],
  },
  {
    code: PlanCode.ENTERPRISE,
    name: 'Enterprise',
    description: 'Không giới hạn – hỗ trợ SLA cao cấp',
    monthlyPrice: 1499000,
    yearlyPrice: 14990000,
    trialDays: 30,
    sortOrder: 40,
    features: [
      { code: PlanFeatureCode.USERS, limit: null },
      { code: PlanFeatureCode.API_KEYS, limit: null },
      { code: PlanFeatureCode.WEBHOOKS, limit: null },
      { code: PlanFeatureCode.STORAGE_GB, limit: null },
      { code: PlanFeatureCode.AI_REQUESTS, limit: null },
    ],
  },
];

export async function seedPlans(dataSource: DataSource): Promise<void> {
  const planRepo = dataSource.getRepository(Plan);
  const featureRepo = dataSource.getRepository(PlanFeature);

  for (const p of PLANS) {
    let plan = await planRepo.findOne({ where: { code: p.code } });
    if (!plan) {
      plan = planRepo.create({
        code: p.code,
        name: p.name,
        description: p.description,
        monthlyPrice: p.monthlyPrice.toString(),
        yearlyPrice: p.yearlyPrice.toString(),
        currency: 'VND',
        isActive: true,
        trialDays: p.trialDays,
        sortOrder: p.sortOrder,
      });
      plan = await planRepo.save(plan);
    }

    for (const f of p.features) {
      const exists = await featureRepo.findOne({
        where: { planId: plan.id, featureCode: f.code },
      });
      if (!exists) {
        await featureRepo.save(
          featureRepo.create({
            planId: plan.id,
            featureCode: f.code,
            limitValue: f.limit,
            isUnlimited: f.limit === null,
          }),
        );
      }
    }
  }

  console.log('✅ Plans & PlanFeatures seeded');
}

/**
 * Demo tenants must already have a subscription on a fresh database.
 *
 * Changing plan is protected by StepUpGuard (returns 412 without a step-up
 * token), so without this seed a freshly migrated + seeded database has no
 * subscription at all: `/billing/subscription` returns null, invoice generation
 * fails on `subscription_id = undefined`, and license enforcement answers
 * NO_SUBSCRIPTION. Seeding here keeps `migration:run && seed` self-consistent.
 *
 * Idempotent + self-recovering: the demo tenants are always reset to their
 * baseline plan/status so repeated e2e runs start from the same state.
 */
const DEMO_SUBSCRIPTIONS: Array<{ tenantCode: string; planCode: PlanCode }> = [
  { tenantCode: 'ABC', planCode: PlanCode.PROFESSIONAL },
  { tenantCode: 'CAFE_MOC', planCode: PlanCode.STARTER },
];

export async function seedDemoSubscriptions(
  dataSource: DataSource,
): Promise<void> {
  const tenantRepo = dataSource.getRepository(Tenant);
  const planRepo = dataSource.getRepository(Plan);
  const subRepo = dataSource.getRepository(Subscription);

  for (const demo of DEMO_SUBSCRIPTIONS) {
    const tenant = await tenantRepo.findOne({
      where: { code: demo.tenantCode },
    });
    if (!tenant) {
      console.log(
        `⚠️  ${demo.tenantCode} tenant not found, skipping subscription seed`,
      );
      continue;
    }

    const plan = await planRepo.findOne({ where: { code: demo.planCode } });
    if (!plan) {
      console.log(
        `⚠️  ${demo.planCode} plan not found, skipping subscription seed`,
      );
      continue;
    }

    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    const existing = await subRepo.findOne({
      where: { tenantId: tenant.id },
      order: { createdAt: 'DESC' },
    });

    if (!existing) {
      await subRepo.save(
        subRepo.create({
          tenantId: tenant.id,
          planId: plan.id,
          status: SubscriptionStatus.ACTIVE,
          billingCycle: BillingCycle.MONTHLY,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: false,
          createdBy: null,
        }),
      );
      console.log(
        `✅ Subscription seeded for ${demo.tenantCode} (${demo.planCode}, ACTIVE)`,
      );
      continue;
    }

    // Baseline reset – e2e runs may leave demo subscriptions cancelled/expired.
    existing.planId = plan.id;
    existing.status = SubscriptionStatus.ACTIVE;
    existing.billingCycle = BillingCycle.MONTHLY;
    existing.currentPeriodStart = now;
    existing.currentPeriodEnd = periodEnd;
    existing.trialEnd = null;
    existing.cancelAtPeriodEnd = false;
    existing.cancelledAt = null;
    existing.gracePeriodEnd = null;
    existing.updatedBy = null;
    await subRepo.save(existing);
    console.log(
      `✅ Subscription reset for ${demo.tenantCode} (${demo.planCode}, ACTIVE)`,
    );
  }
}
