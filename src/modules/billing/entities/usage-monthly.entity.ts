import { Entity, Column, Index, Unique } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base.entity';
import { UsageMetric } from '../enums/usage.enum';

/**
 * UsageMonthly – aggregated usage for one tenant + metric + month.
 */
@Entity('usage_monthly')
@Unique(['tenantId', 'metric', 'month'])
@Index(['tenantId', 'month'])
export class UsageMonthly extends BaseTenantEntity {
  @Column({ type: 'varchar', length: 40 })
  metric!: UsageMetric;

  @Column({ type: 'varchar', length: 7 })
  month!: string; // YYYY-MM

  @Column({ type: 'int', default: 0 })
  total!: number;
}
