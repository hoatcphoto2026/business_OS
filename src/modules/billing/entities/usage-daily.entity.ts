import { Entity, Column, Index, Unique } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base.entity';
import { UsageMetric } from '../enums/usage.enum';

/**
 * UsageDaily – aggregated usage for one tenant + metric + day.
 */
@Entity('usage_daily')
@Unique(['tenantId', 'metric', 'day'])
@Index(['tenantId', 'day'])
export class UsageDaily extends BaseTenantEntity {
  @Column({ type: 'varchar', length: 40 })
  metric!: UsageMetric;

  @Column({ type: 'date' })
  day!: string; // YYYY-MM-DD

  @Column({ type: 'int', default: 0 })
  total!: number;
}
