import { Column, Entity, Index, Unique } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base.entity';
import { HealthLevel, HealthTrend } from '../enums/customer-health.enum';

/** Latest health score per customer tenant. */
@Entity('customer_health_scores')
@Unique(['tenantId', 'targetTenantId'])
@Index(['tenantId', 'level'])
export class CustomerHealthScore extends BaseTenantEntity {
  @Column({ name: 'target_tenant_id', type: 'uuid' })
  targetTenantId!: string;

  @Column({ name: 'target_tenant_code', type: 'varchar', length: 50 })
  targetTenantCode!: string;

  @Column({ name: 'target_tenant_name', type: 'varchar', length: 255 })
  targetTenantName!: string;

  @Column({ type: 'numeric', precision: 5, scale: 2, default: 0 })
  score!: string;

  @Column({ type: 'varchar', length: 20, default: HealthLevel.WARNING })
  level!: HealthLevel;

  @Column({ name: 'previous_score', type: 'numeric', precision: 5, scale: 2, nullable: true })
  previousScore!: string | null;

  @Column({ type: 'varchar', length: 10, default: HealthTrend.STABLE })
  trend!: HealthTrend;

  @Column({ type: 'jsonb', default: [] })
  signals!: Array<Record<string, unknown>>;

  @Column({ name: 'risk_drivers', type: 'jsonb', default: [] })
  riskDrivers!: Array<Record<string, unknown>>;

  @Column({ name: 'primary_risk', type: 'varchar', length: 60, nullable: true })
  primaryRisk!: string | null;

  @Column({ name: 'churn_candidate', type: 'boolean', default: false })
  churnCandidate!: boolean;

  @Column({ name: 'scored_at', type: 'timestamptz', default: () => 'now()' })
  scoredAt!: Date;

  @Column({ type: 'jsonb', default: {} })
  metadata!: Record<string, unknown>;
}
