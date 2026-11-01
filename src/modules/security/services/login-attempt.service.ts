import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LoginAttempt } from '../entities/login-attempt.entity';
import { LoginLocation } from '../entities/login-location.entity';
import {
  LoginFailureReason,
  SecurityEventSource,
  SecurityEventType,
  SecuritySeverity,
} from '../enums/security.enum';
import { SecurityEventsService } from './security-events.service';
import { MetricsService } from '../../../common/metrics/metrics.service';
import { TenantContextService } from '../../../common/tenant-context/tenant-context.service';

export interface LoginAttemptInput {
  tenantId?: string | null;
  userId?: string | null;
  email: string;
  success: boolean;
  reason?: LoginFailureReason | string;
  ipAddress?: string | null;
  userAgent?: string | null;
  country?: string | null;
  city?: string | null;
}

/**
 * Records every password/SSO login signal and maintains the per-user geo
 * baseline. Never throws: authentication must not fail because telemetry did.
 */
@Injectable()
export class LoginAttemptService {
  private readonly logger = new Logger(LoginAttemptService.name);

  constructor(
    @InjectRepository(LoginAttempt)
    private readonly attempts: Repository<LoginAttempt>,
    @InjectRepository(LoginLocation)
    private readonly locations: Repository<LoginLocation>,
    private readonly events: SecurityEventsService,
    private readonly metrics: MetricsService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async record(input: LoginAttemptInput): Promise<void> {
    try {
      const attempt = await this.attempts.save(
        this.attempts.create({
          tenantId: input.tenantId ?? null,
          userId: input.userId ?? null,
          email: input.email.toLowerCase(),
          success: input.success,
          reason:
            input.reason ?? (input.success ? LoginFailureReason.OK : 'FAILED'),
          ipAddress: input.ipAddress ?? null,
          userAgent: input.userAgent ?? null,
          country: input.country?.toUpperCase() ?? null,
          city: input.city ?? null,
        }),
      );
      this.metrics.inc('security_login_attempts_total', {
        result: attempt.success ? 'SUCCESS' : 'FAILURE',
        reason: attempt.reason,
      });
      if (attempt.success) {
        await this.trackLocation(attempt);
      }
    } catch (error) {
      this.logger.warn(
        `Login attempt not recorded: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  /** Learned geo baseline + first-seen-from-a-new-country anomaly. */
  private async trackLocation(attempt: LoginAttempt): Promise<void> {
    const { tenantId, userId, country } = attempt;
    if (!tenantId || !userId || !country) return;

    const known = await this.locations.find({ where: { tenantId, userId } });
    const match = known.find((row) => row.country === country);

    if (!match && known.length > 0) {
      const day = new Date().toISOString().slice(0, 10);
      await this.events.create({
        tenantId,
        eventType: SecurityEventType.GEO_ANOMALY,
        severity: SecuritySeverity.HIGH,
        source: SecurityEventSource.AUTH,
        userId,
        actorEmail: attempt.email,
        ipAddress: attempt.ipAddress,
        userAgent: attempt.userAgent,
        country,
        city: attempt.city,
        riskScore: 70,
        dedupeKey: `geo:${userId}:${country}:${day}`,
        metadata: { knownCountries: known.map((row) => row.country) },
      });
      attempt.anomalous = true;
      await this.attempts.save(attempt);
    }

    if (match) {
      match.hits += 1;
      match.lastSeenAt = new Date();
      if (attempt.city) match.city = attempt.city;
      await this.locations.save(match);
      return;
    }

    await this.locations.save(
      this.locations.create({
        tenantId,
        userId,
        country,
        city: attempt.city,
        firstSeenAt: attempt.createdAt ?? new Date(),
        lastSeenAt: attempt.createdAt ?? new Date(),
        hits: 1,
      }),
    );
  }

  async recent(limit = 100, success?: boolean): Promise<LoginAttempt[]> {
    const where: Record<string, unknown> = {
      tenantId: this.tenantContext.getCurrentTenantId(),
    };
    if (success !== undefined) where.success = success;
    return this.attempts.find({
      where,
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async locationsForTenant(): Promise<LoginLocation[]> {
    return this.locations.find({
      where: { tenantId: this.tenantContext.getCurrentTenantId() },
      order: { lastSeenAt: 'DESC' },
      take: 200,
    });
  }
}
