import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Subscription } from './entities/subscription.entity';
import { PlanFeature } from './entities/plan-feature.entity';
import {
  SubscriptionStatus,
  PlanFeatureCode,
} from './enums/billing.enum';
import { LicenseCache } from './cache/license-cache';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/enums/audit-action.enum';
import { TenantUser } from '../tenant/entities/tenant-user.entity';
import { ApiKey } from '../integration/entities/api-key.entity';
import { Webhook } from '../integration/entities/webhook.entity';

export interface LicenseCheckResult {
  ok: boolean;
  reason?: 'NO_SUBSCRIPTION' | 'EXPIRED' | 'SUSPENDED' | 'CANCELLED' | 'LIMIT_EXCEEDED';
  feature?: string;
  limit?: number | null;
  current?: number;
}

@Injectable()
export class LicenseService {
  private readonly logger = new Logger(LicenseService.name);

  constructor(
    @InjectRepository(Subscription)
    private readonly subscriptions: Repository<Subscription>,
    @InjectRepository(PlanFeature)
    private readonly planFeatures: Repository<PlanFeature>,
    @InjectRepository(TenantUser)
    private readonly tenantUsers: Repository<TenantUser>,
    @InjectRepository(ApiKey)
    private readonly apiKeys: Repository<ApiKey>,
    @InjectRepository(Webhook)
    private readonly webhooks: Repository<Webhook>,
    private readonly cache: LicenseCache,
    private readonly audit: AuditService,
  ) {}

  // ──────────────────────────────────────────────
  // Subscription validity
  // ──────────────────────────────────────────────

  async assertValidSubscription(tenantId: string): Promise<Subscription> {
    // Always read fresh – subscription changes must be visible immediately
    const sub = await this.subscriptions.findOne({
      where: { tenantId },
      relations: ['plan'],
      order: { createdAt: 'DESC' },
    });

    if (!sub) {
      await this.auditViolation(tenantId, 'NO_SUBSCRIPTION');
      throw new HttpException(
        { error: 'NO_SUBSCRIPTION', message: 'No active subscription' },
        HttpStatus.FORBIDDEN,
      );
    }

    const bad: SubscriptionStatus[] = [
      SubscriptionStatus.EXPIRED,
      SubscriptionStatus.SUSPENDED,
      SubscriptionStatus.CANCELLED,
    ];

    if (bad.includes(sub.status)) {
      const reason = sub.status as 'EXPIRED' | 'SUSPENDED' | 'CANCELLED';
      await this.auditViolation(tenantId, reason, sub.id);
      throw new HttpException(
        { error: reason, message: `Subscription is ${sub.status}` },
        HttpStatus.FORBIDDEN,
      );
    }

    if (sub.currentPeriodEnd && new Date(sub.currentPeriodEnd) < new Date()) {
      if (sub.status === SubscriptionStatus.ACTIVE || sub.status === SubscriptionStatus.TRIAL) {
        await this.auditViolation(tenantId, 'EXPIRED', sub.id);
        throw new HttpException(
          { error: 'EXPIRED', message: 'Subscription period has ended' },
          HttpStatus.FORBIDDEN,
        );
      }
    }

    return sub;
  }

  // ──────────────────────────────────────────────
  // Feature limits
  // ──────────────────────────────────────────────

  async assertWithinLimit(tenantId: string, feature: string): Promise<void> {
    const sub = await this.assertValidSubscription(tenantId);

    // Include planId in cache key so plan changes naturally miss
    const cacheKey = `license:${tenantId}:limit:${sub.planId}:${feature}`;
    let limitInfo = await this.cache.get<{ limit: number | null; unlimited: boolean }>(cacheKey);

    if (!limitInfo) {
      const pf = await this.planFeatures.findOne({
        where: { planId: sub.planId, featureCode: feature as PlanFeatureCode },
      });
      limitInfo = {
        limit: pf?.isUnlimited ? null : pf?.limitValue ?? null,
        unlimited: pf?.isUnlimited ?? false,
      };
      await this.cache.set(cacheKey, limitInfo, 60);
    }

    if (limitInfo.unlimited || limitInfo.limit === null) return;

    const current = await this.countUsage(tenantId, feature);
    if (current >= limitInfo.limit) {
      await this.auditViolation(tenantId, 'LIMIT_EXCEEDED', sub.id, {
        feature,
        limit: limitInfo.limit,
        current,
      });
      throw new HttpException(
        {
          error: 'PLAN_LIMIT_EXCEEDED',
          feature,
          limit: limitInfo.limit,
          current,
        },
        HttpStatus.FORBIDDEN,
      );
    }
  }

  private async countUsage(tenantId: string, feature: string): Promise<number> {
    switch (feature) {
      case PlanFeatureCode.USERS:
        return this.tenantUsers.count({
          where: { tenantId, status: 'active' as any },
        });
      case PlanFeatureCode.API_KEYS:
        return this.apiKeys.count({ where: { tenantId } });
      case PlanFeatureCode.WEBHOOKS:
        return this.webhooks.count({ where: { tenantId } });
      case PlanFeatureCode.STORAGE_GB:
        // Placeholder – real storage metering comes later
        return 0;
      case PlanFeatureCode.AI_REQUESTS:
        // Placeholder – counted from copilot_logs later
        return 0;
      default:
        return 0;
    }
  }

  // ──────────────────────────────────────────────
  // Audit
  // ──────────────────────────────────────────────

  private async auditViolation(
    tenantId: string,
    reason: string,
    subscriptionId?: string,
    extra?: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.audit.logAction(
        'License',
        subscriptionId ?? tenantId,
        AuditAction.REJECT,
        {
          newData: { reason, tenantId, ...extra },
        },
      );
    } catch (e) {
      this.logger.warn(`Audit failed for license violation: ${e}`);
    }
    this.logger.warn(`License violation [${reason}] tenant=${tenantId}`);
  }

  /** Invalidate cache after plan change / cancel / reactivate */
  async invalidate(tenantId: string): Promise<void> {
    await this.cache.delByPrefix(`license:${tenantId}:`);
  }
}
