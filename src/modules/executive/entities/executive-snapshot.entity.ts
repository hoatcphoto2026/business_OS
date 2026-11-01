import { Column, Entity, Index, Unique } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base.entity';
import { SnapshotPeriod } from '../enums/executive.enum';

/** Point-in-time KPI snapshot (one per day / month). */
@Entity('executive_snapshots')
@Unique(['tenantId', 'snapshotDate', 'periodType'])
@Index(['tenantId', 'periodType', 'snapshotDate'])
export class ExecutiveSnapshot extends BaseTenantEntity {
  @Column({ name: 'snapshot_date', type: 'date' })
  snapshotDate!: string;

  @Column({ name: 'period_type', type: 'varchar', length: 10 })
  periodType!: SnapshotPeriod;

  @Column({ type: 'jsonb', default: [] })
  metrics!: Array<Record<string, unknown>>;

  @Column({ type: 'jsonb', default: {} })
  summary!: Record<string, unknown>;

  @Column({ name: 'generated_by', type: 'uuid', nullable: true })
  generatedBy!: string | null;

  @Column({ name: 'generated_at', type: 'timestamptz', default: () => 'now()' })
  generatedAt!: Date;
}
