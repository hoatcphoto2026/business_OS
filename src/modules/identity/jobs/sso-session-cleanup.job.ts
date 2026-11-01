import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SSOSession } from '../entities/sso-session.entity';
import { SsoSessionStatus } from '../enums/identity.enum';
import { MetricsService } from '../../../common/metrics/metrics.service';

export interface SsoCleanupResult {
  pendingDeleted: number;
  expiredDeleted: number;
}

/**
 * Deletes abandoned SSO sessions:
 * - PENDING states older than 1 hour (login never completed)
 * - ACTIVE sessions older than 7 days (session trail retention)
 */
@Injectable()
export class SsoSessionCleanupJob {
  private readonly logger = new Logger('SsoSessionCleanup');
  private static readonly PENDING_TTL_MS = 60 * 60 * 1000;
  private static readonly ACTIVE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

  constructor(
    @InjectRepository(SSOSession)
    private readonly sessions: Repository<SSOSession>,
    private readonly metrics: MetricsService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async handleCron(): Promise<void> {
    const result = await this.run();
    if (result.pendingDeleted || result.expiredDeleted) {
      this.logger.log(
        `Cleaned SSO sessions pending=${result.pendingDeleted} expired=${result.expiredDeleted}`,
      );
    }
  }

  async run(): Promise<SsoCleanupResult> {
    const now = Date.now();
    const pending = await this.sessions.delete({
      status: SsoSessionStatus.PENDING,
      createdAt: LessThan(new Date(now - SsoSessionCleanupJob.PENDING_TTL_MS)),
    });
    const expired = await this.sessions.delete({
      status: SsoSessionStatus.ACTIVE,
      createdAt: LessThan(new Date(now - SsoSessionCleanupJob.ACTIVE_TTL_MS)),
    });

    const result: SsoCleanupResult = {
      pendingDeleted: pending.affected ?? 0,
      expiredDeleted: expired.affected ?? 0,
    };
    this.metrics.inc(
      'identity_sso_sessions_cleaned_total',
      { status: SsoSessionStatus.PENDING },
      result.pendingDeleted,
    );
    this.metrics.inc(
      'identity_sso_sessions_cleaned_total',
      { status: SsoSessionStatus.ACTIVE },
      result.expiredDeleted,
    );
    return result;
  }
}
