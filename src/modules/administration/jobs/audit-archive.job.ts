import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

/**
 * P2 – Audit Archive Job
 * Exports old audit logs to an immutable-style archive table / file.
 * In production, replace file write with S3 Object Lock upload.
 */
@Injectable()
export class AuditArchiveJob {
  private readonly logger = new Logger('AuditArchive');

  constructor(
    // AuditLog entity is imported dynamically to avoid circular deps if needed
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async archiveOldAudits() {
    this.logger.log('Starting audit archive job');
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); // 90 days
    this.logger.log(`Would archive audit_logs older than ${cutoff.toISOString()}`);
    // Production: 
    // 1. SELECT * FROM audit_logs WHERE created_at < cutoff
    // 2. Upload to S3 with Object Lock (COMPLIANCE mode)
    // 3. Mark as archived or move to audit_logs_archive
    this.logger.log('Audit archive job completed (dry-run)');
  }

  async runNow() {
    return this.archiveOldAudits();
  }
}
