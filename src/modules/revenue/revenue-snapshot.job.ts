import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { RevenueService } from './revenue.service';
import { RevenueSnapshotPeriod } from './enums/revenue.enum';

/** Daily 03:00 and monthly (1st, 04:00) revenue snapshots. */
@Injectable()
export class RevenueSnapshotJob {
  private readonly logger = new Logger(RevenueSnapshotJob.name);

  constructor(private readonly revenue: RevenueService) {}

  @Cron('0 0 3 * * *')
  async daily(): Promise<void> {
    await this.run(RevenueSnapshotPeriod.DAILY);
  }

  @Cron('0 0 4 1 * *')
  async monthly(): Promise<void> {
    await this.run(RevenueSnapshotPeriod.MONTHLY);
  }

  private async run(period: RevenueSnapshotPeriod): Promise<void> {
    try {
      const result = await this.revenue.generateSnapshot({ period });
      this.logger.log(
        `Revenue ${period} snapshot ${result.snapshot.id} (MRR ${result.snapshot.mrr})`,
      );
    } catch (error) {
      this.logger.warn(
        `Revenue ${period} snapshot skipped: ${
          error instanceof Error ? error.message : error
        }`,
      );
    }
  }
}
