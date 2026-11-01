import { Column, Entity, Index, Unique } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base.entity';
import { AdoptionDimension } from '../enums/product-analytics.enum';

/** Persisted adoption breakdown per feature × dimension × period. */
@Entity('feature_adoption')
@Unique(['tenantId', 'featureKey', 'dimension', 'dimensionKey', 'period'])
@Index(['tenantId', 'dimension', 'period'])
export class FeatureAdoption extends BaseTenantEntity {
  @Column({ name: 'feature_key', type: 'varchar', length: 40 })
  featureKey!: string;

  @Column({ type: 'varchar', length: 20 })
  dimension!: AdoptionDimension;

  @Column({ name: 'dimension_key', type: 'varchar', length: 100 })
  dimensionKey!: string;

  @Column({ name: 'dimension_label', type: 'varchar', length: 255 })
  dimensionLabel!: string;

  @Column({ type: 'varchar', length: 7 })
  period!: string;

  @Column({ name: 'usage_count', type: 'int', default: 0 })
  usageCount!: number;

  @Column({ name: 'active_tenants', type: 'int', default: 0 })
  activeTenants!: number;

  @Column({ name: 'active_users', type: 'int', default: 0 })
  activeUsers!: number;

  @Column({ name: 'adoption_pct', type: 'numeric', precision: 6, scale: 2, default: 0 })
  adoptionPct!: string;

  @Column({ type: 'jsonb', default: {} })
  metadata!: Record<string, unknown>;
}
