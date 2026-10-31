import { Entity, Column, Index } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base.entity';
import { UsageMetric } from '../enums/usage.enum';

/**
 * UsageRecord – raw usage event.
 * One row per increment (or snapshot). Aggregated into daily/monthly.
 */
@Entity('usage_records')
@Index(['tenantId', 'metric', 'recordedAt'])
export class UsageRecord extends BaseTenantEntity {
  @Column({ type: 'varchar', length: 40 })
  metric!: UsageMetric;

  @Column({ type: 'int', default: 1 })
  quantity!: number;

  @Column({ name: 'recorded_at', type: 'timestamptz', default: () => 'now()' })
  recordedAt!: Date;

  @Column({ type: 'jsonb', default: {} })
  metadata!: Record<string, unknown>;
}
