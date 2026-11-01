import { Column, Entity, Index } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base.entity';
import {
  ExecutiveMetricCode,
  ExecutiveMetricUnit,
  SnapshotPeriod,
} from '../enums/executive.enum';

/** Latest cached value per KPI (updated on every snapshot). */
@Entity('executive_metrics')
@Index(['tenantId', 'code'], { unique: true })
export class ExecutiveMetric extends BaseTenantEntity {
  @Column({ type: 'varchar', length: 40 })
  code!: ExecutiveMetricCode;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'varchar', length: 20 })
  unit!: ExecutiveMetricUnit;

  @Column({ name: 'current_value', type: 'numeric', precision: 20, scale: 4, default: 0 })
  currentValue!: string;

  @Column({ name: 'previous_value', type: 'numeric', precision: 20, scale: 4, nullable: true })
  previousValue!: string | null;

  @Column({ name: 'change_pct', type: 'numeric', precision: 10, scale: 2, default: 0 })
  changePct!: string;

  @Column({ name: 'period_type', type: 'varchar', length: 10, default: SnapshotPeriod.DAILY })
  periodType!: SnapshotPeriod;

  @Column({ type: 'jsonb', default: {} })
  metadata!: Record<string, unknown>;

  @Column({ name: 'calculated_at', type: 'timestamptz', default: () => 'now()' })
  calculatedAt!: Date;
}
