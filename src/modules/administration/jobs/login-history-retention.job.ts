import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { LoginHistory } from '../entities/login-history.entity';

/**
 * Login History Retention Job (P1)
 * - Hot: 30 days full detail
 * - Archive candidates: >90 days
 * - Purge: >180 days
 *
 * Requires @nestjs/schedule. In production register ScheduleModule.forRoot().
 */
@Injectable()
export class LoginHistoryRetentionJob {
  private readonly logger = new Logger('LoginHistoryRetention');

  constructor(
    @InjectRepository(LoginHistory)
    private readonly histories: Repository<LoginHistory>,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async handleRetention() {
    const now = new Date();
    const archiveCutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const purgeCutoff = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);

    this.logger.log('Starting login history retention job');

    // Count candidates
    const toArchive = await this.histories.count({
      where: { loginAt: LessThan(archiveCutoff) },
    });
    const toPurge = await this.histories.count({
      where: { loginAt: LessThan(purgeCutoff) },
    });

    this.logger.log(`Archive candidates (>90d): ${toArchive}, Purge candidates (>180d): ${toPurge}`);

    // In production: INSERT INTO login_histories_archive SELECT ... then DELETE
    // Here we log the action; actual purge can be enabled via env
    if (process.env.RETENTION_PURGE_ENABLED === 'true' && toPurge > 0) {
      const result = await this.histories.delete({ loginAt: LessThan(purgeCutoff) });
      this.logger.log(`Purged ${result.affected || 0} login history rows older than 180 days`);
    } else {
      this.logger.log('Purge skipped (set RETENTION_PURGE_ENABLED=true to enable)');
    }

    this.logger.log('Login history retention job completed');
  }

  /** Manual trigger for testing / admin endpoint */
  async runNow() {
    return this.handleRetention();
  }
}
