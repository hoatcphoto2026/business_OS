import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { UsageService } from '../usage.service';

/**
 * Usage aggregation jobs.
 * - Daily: 01:00 UTC – roll up yesterday into usage_daily
 * - Monthly: 02:00 UTC on the 1st – roll up previous month into usage_monthly
 */
@Injectable()
export class UsageAggregationJob {
  private readonly logger = new Logger(UsageAggregationJob.name);

  constructor(private readonly usage: UsageService) {}

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async daily() {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const day = yesterday.toISOString().slice(0, 10);
    this.logger.log(`Running daily aggregation for ${day}`);
    await this.usage.aggregateDaily(day);
  }

  @Cron('0 2 1 * *') // 02:00 on the 1st of each month
  async monthly() {
    const prev = new Date();
    prev.setMonth(prev.getMonth() - 1);
    const month = prev.toISOString().slice(0, 7);
    this.logger.log(`Running monthly aggregation for ${month}`);
    await this.usage.aggregateMonthly(month);
  }

  /** Manual triggers for tests / admin */
  async runDailyNow(day?: string) {
    return this.usage.aggregateDaily(day);
  }

  async runMonthlyNow(month?: string) {
    return this.usage.aggregateMonthly(month);
  }
}
