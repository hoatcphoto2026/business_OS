import { MetricsService } from '../../common/metrics/metrics.service';
import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import { RenewalAttempt } from './entities/renewal-attempt.entity';
import { RenewalStatus } from './enums/renewal.enum';
import { Subscription } from '../billing/entities/subscription.entity';
import { SubscriptionStatus } from '../billing/enums/billing.enum';
import { TenantContextService } from '../../common/tenant-context/tenant-context.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/enums/audit-action.enum';
import { NotificationService } from '../notification/notification.service';

const GRACE_DAYS = 7;
const MAX_RETRIES = 3;

@Injectable()
export class AutoRenewalService {
  private readonly logger = new Logger(AutoRenewalService.name);

  constructor(
    @InjectRepository(RenewalAttempt)
    private readonly attempts: Repository<RenewalAttempt>,
    @InjectRepository(Subscription)
    private readonly subscriptions: Repository<Subscription>,
    private readonly tenantContext: TenantContextService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
    private readonly metricsService: MetricsService,
  ) {}

  private getTenantId(): string {
    const tid = this.tenantContext.getCurrentTenantId();
    if (!tid) throw new ForbiddenException('No tenant context');
    return tid;
  }

  private getUserId(): string {
    return this.tenantContext.getCurrentUserId() || '';
  }


  async getPrometheusText(): Promise<string> {
    return this.metricsService.text();
  }

  /**
   * Find subscriptions near expiration (within 3 days) or already past due,
   * and attempt renewal.
   */
  async processDueRenewals(): Promise<RenewalAttempt[]> {
    const tenantId = this.getTenantId();
    const now = new Date();
    const soon = new Date(now);
    soon.setDate(soon.getDate() + 3);

    const due = await this.subscriptions.find({
      where: [
        { tenantId, status: SubscriptionStatus.ACTIVE, currentPeriodEnd: LessThanOrEqual(soon) },
        { tenantId, status: SubscriptionStatus.PAST_DUE },
        { tenantId, status: SubscriptionStatus.TRIAL, trialEnd: LessThanOrEqual(now) },
      ],
    });

    const results: RenewalAttempt[] = [];
    for (const sub of due) {
      const attempt = await this.renewOne(sub);
      results.push(attempt);
    }
    return results;
  }

  async renewOne(sub: Subscription): Promise<RenewalAttempt> {
    const tenantId = sub.tenantId;
    const userId = this.getUserId();

    const previous = await this.attempts.find({
      where: { subscriptionId: sub.id, status: RenewalStatus.FAILED },
      order: { createdAt: 'DESC' },
      take: 1,
    });
    const attemptCount = previous.length ? previous[0].attemptCount + 1 : 1;

    const attempt = this.attempts.create({
      tenantId,
      subscriptionId: sub.id,
      status: RenewalStatus.PENDING,
      attemptCount,
      createdBy: userId || null,
    });
    const saved = await this.attempts.save(attempt);

    try {
      // 1. Generate invoice (placeholder)
      const invoiceId = `inv_${Date.now()}`;
      saved.invoiceId = invoiceId;

      // 2. Collect payment (mock success for demo)
      const paymentOk = attemptCount <= 2; // fail on 3rd for demo of PAST_DUE
      if (!paymentOk) {
        throw new Error('Payment declined');
      }
      saved.paymentId = `pay_${Date.now()}`;

      // 3. Renew subscription
      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setMonth(periodEnd.getMonth() + 1);
      sub.status = SubscriptionStatus.ACTIVE;
      sub.currentPeriodStart = now;
      sub.currentPeriodEnd = periodEnd;
      sub.gracePeriodEnd = null;
      await this.subscriptions.save(sub);

      saved.status = RenewalStatus.RENEWED;
      saved.processedAt = new Date();
      this.metricsService.inc('renewals_renewed_total');

      // 4. Notify
      try {
        await this.notifications.send({
          userId: userId || undefined,
          title: 'Subscription renewed',
          body: `Your subscription has been renewed until ${periodEnd.toISOString().slice(0, 10)}`,
          eventType: 'SubscriptionRenewed',
          data: { subscriptionId: sub.id },
        });
      } catch {}
    } catch (err: any) {
      saved.errorMessage = err.message;
      if (attemptCount >= MAX_RETRIES) {
        saved.status = RenewalStatus.PAST_DUE;
        sub.status = SubscriptionStatus.PAST_DUE;
        const grace = new Date();
        grace.setDate(grace.getDate() + GRACE_DAYS);
        sub.gracePeriodEnd = grace;
        await this.subscriptions.save(sub);
        this.metricsService.inc('renewals_past_due_total');
      } else {
        saved.status = RenewalStatus.FAILED;
        this.metricsService.inc('renewals_failed_total');
      }
      this.logger.warn(`Renewal failed for ${sub.id}: ${err.message}`);
    }

    await this.attempts.save(saved);

    try {
      await this.audit.logAction('renewal_attempt', saved.id, AuditAction.CREATE, {
        newData: { subscriptionId: sub.id, status: saved.status },
      });
    } catch {}

    return saved;
  }

  async list(): Promise<RenewalAttempt[]> {
    const tenantId = this.getTenantId();
    return this.attempts.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  async get(id: string): Promise<RenewalAttempt | null> {
    const tenantId = this.getTenantId();
    return this.attempts.findOne({ where: { id, tenantId } });
  }
}
