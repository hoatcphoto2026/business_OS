import { Column, Entity, Index, Unique } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base.entity';
import { HealthLevel } from '../enums/customer-health.enum';

/** Daily per-tenant health history for trending scores. */
@Entity('health_snapshots')
@Unique(['tenantId', 'targetTenantId', 'snapshotDate'])
@Index(['tenantId', 'snapshotDate'])
export class HealthSnapshot extends BaseTenantEntity {
  @Column({ name: 'target_tenant_id', type: 'uuid' })
  targetTenantId!: string;

  @Column({ name: 'snapshot_date', type: 'date' })
  snapshotDate!: string;

  @Column({ type: 'numeric', precision: 5, scale: 2, default: 0 })
  score!: string;

  @Column({ type: 'varchar', length: 20, default: HealthLevel.WARNING })
  level!: HealthLevel;

  @Column({ type: 'jsonb', default: [] })
  signals!: Array<Record<string, unknown>>;

  @Column({ name: 'risk_drivers', type: 'jsonb', default: [] })
  riskDrivers!: Array<Record<string, unknown>>;

  @Column({ name: 'generated_at', type: 'timestamptz', default: () => 'now()' })
  generatedAt!: Date;
}
