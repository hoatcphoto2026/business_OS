import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CustomerHealthService } from './customer-health.service';

/** Daily 02:15 customer-health scoring snapshot. */
@Injectable()
export class HealthSnapshotJob {
  private readonly logger = new Logger(HealthSnapshotJob.name);

  constructor(private readonly health: CustomerHealthService) {}

  @Cron('0 15 2 * * *')
  async run(): Promise<void> {
    try {
      const result = await this.health.generateSnapshot();
      this.logger.log(
        `Customer health snapshot ${result.snapshotDate}: ${result.tenants} tenants, avg ${result.averageScore}`,
      );
    } catch (error) {
      this.logger.warn(
        `Customer health snapshot skipped: ${
          error instanceof Error ? error.message : error
        }`,
      );
    }
  }
}
