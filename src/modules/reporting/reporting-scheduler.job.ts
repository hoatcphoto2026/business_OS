import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ReportingService } from './reporting.service';

/**
 * Daily/weekly/monthly report schedules.
 *
 * A schedule stores `next_run_at`; the worker only runs the ones that are due,
 * so it is safe to run every few minutes (and in tests, with no due rows).
 */
@Injectable()
export class ReportingSchedulerJob {
  private readonly logger = new Logger(ReportingSchedulerJob.name);

  constructor(private readonly reporting: ReportingService) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async runDue(): Promise<void> {
    const executed = await this.reporting.runDueSchedules();
    if (executed > 0) {
      this.logger.log(`Executed ${executed} due report schedule(s)`);
    }
  }
}
