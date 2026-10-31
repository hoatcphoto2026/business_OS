import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual, IsNull } from 'typeorm';
import { ScheduledJob } from './entities/scheduled-job.entity';
import { ScheduledJobsService } from './scheduled-jobs.service';

/**
 * Cron runner that picks up due scheduled jobs and executes them.
 * Runs every minute. Jobs with nextRunAt <= now (or null) are candidates.
 */
@Injectable()
export class ScheduledJobRunner {
  private readonly logger = new Logger(ScheduledJobRunner.name);

  constructor(
    @InjectRepository(ScheduledJob)
    private readonly jobs: Repository<ScheduledJob>,
    private readonly service: ScheduledJobsService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async tick() {
    const now = new Date();
    const due = await this.jobs.find({
      where: [
        { isEnabled: true, nextRunAt: LessThanOrEqual(now) },
        { isEnabled: true, nextRunAt: IsNull() },
      ],
      take: 20,
    });

    if (!due.length) return;

    this.logger.log(`Cron runner: ${due.length} job(s) due`);

    for (const job of due) {
      try {
        // Temporarily set tenant context is not available in cron;
        // the service.run() uses tenantContext which may be empty.
        // For foundation we call executeJob logic via a public method.
        await this.service.runBySystem(job.id);
        this.logger.log(`Ran job ${job.name} (${job.id})`);
      } catch (err: any) {
        this.logger.warn(`Job ${job.id} failed: ${err.message}`);
      }
    }
  }
}
