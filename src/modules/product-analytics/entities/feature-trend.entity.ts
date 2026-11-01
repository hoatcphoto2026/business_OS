import { Column, Entity, Index, Unique } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base.entity';

/** Daily feature usage trend (growth + day-over-day retention). */
@Entity('feature_trends')
@Unique(['tenantId', 'featureKey', 'periodDate'])
@Index(['tenantId', 'periodDate'])
export class FeatureTrend extends BaseTenantEntity {
  @Column({ name: 'feature_key', type: 'varchar', length: 40 })
  featureKey!: string;

  @Column({ name: 'period_date', type: 'date' })
  periodDate!: string;

  @Column({ name: 'usage_count', type: 'int', default: 0 })
  usageCount!: number;

  @Column({ name: 'active_tenants', type: 'int', default: 0 })
  activeTenants!: number;

  @Column({ name: 'active_users', type: 'int', default: 0 })
  activeUsers!: number;

  @Column({ name: 'growth_pct', type: 'numeric', precision: 7, scale: 2, default: 0 })
  growthPct!: string;

  @Column({ name: 'retention_pct', type: 'numeric', precision: 6, scale: 2, nullable: true })
  retentionPct!: string | null;

  @Column({ name: 'generated_at', type: 'timestamptz', default: () => 'now()' })
  generatedAt!: Date;
}
