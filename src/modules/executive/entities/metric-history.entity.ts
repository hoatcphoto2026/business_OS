import { Column, Entity, Index } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base.entity';
import { ExecutiveMetricUnit, SnapshotPeriod } from '../enums/executive.enum';

/** Time series per KPI (history for trends). */
@Entity('metric_history')
@Index(['tenantId', 'metricCode', 'recordedAt'])
@Index(['tenantId', 'periodType', 'recordedAt'])
export class MetricHistory extends BaseTenantEntity {
  @Column({ name: 'metric_code', type: 'varchar', length: 40 })
  metricCode!: string;

  @Column({ type: 'numeric', precision: 20, scale: 4 })
  value!: string;

  @Column({ type: 'varchar', length: 20 })
  unit!: ExecutiveMetricUnit;

  @Column({ name: 'period_type', type: 'varchar', length: 10 })
  periodType!: SnapshotPeriod;

  @Column({ name: 'recorded_at', type: 'timestamptz', default: () => 'now()' })
  recordedAt!: Date;

  @Column({ name: 'snapshot_id', type: 'uuid', nullable: true })
  snapshotId!: string | null;

  @Column({ type: 'jsonb', default: {} })
  metadata!: Record<string, unknown>;
}
