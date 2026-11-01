import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ExecutiveMetricsService } from './executive-metrics.service';
import { SnapshotPeriod } from './enums/executive.enum';

/** Daily 02:30 and monthly (1st, 03:15) executive snapshots. */
@Injectable()
export class ExecutiveSnapshotJob {
  private readonly logger = new Logger(ExecutiveSnapshotJob.name);

  constructor(private readonly executive: ExecutiveMetricsService) {}

  @Cron('0 30 2 * * *')
  async daily(): Promise<void> {
    await this.run(SnapshotPeriod.DAILY);
  }

  @Cron('0 15 3 1 * *')
  async monthly(): Promise<void> {
    await this.run(SnapshotPeriod.MONTHLY);
  }

  private async run(period: SnapshotPeriod): Promise<void> {
    try {
      const snapshot = await this.executive.generateSnapshot({ period });
      this.logger.log(
        `Executive ${period} snapshot ${snapshot.id} for ${snapshot.snapshotDate}`,
      );
    } catch (error) {
      this.logger.warn(
        `Executive ${period} snapshot skipped: ${
          error instanceof Error ? error.message : error
        }`,
      );
    }
  }
}
