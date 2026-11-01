import { Column, Entity, Index, Unique } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base.entity';
import { FeatureKey, UsageSource } from '../enums/product-analytics.enum';

/**
 * Raw feature usage row. tenant_id is the **customer** tenant using the
 * feature; operator dashboards aggregate across all tenants.
 */
@Entity('feature_usage')
@Unique(['tenantId', 'dedupeKey'])
@Index(['tenantId', 'featureKey', 'occurredAt'])
export class FeatureUsage extends BaseTenantEntity {
  @Column({ name: 'feature_key', type: 'varchar', length: 40 })
  featureKey!: FeatureKey;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId!: string | null;

  @Column({ name: 'organization_id', type: 'uuid', nullable: true })
  organizationId!: string | null;

  @Column({ name: 'department_id', type: 'uuid', nullable: true })
  departmentId!: string | null;

  @Column({ type: 'varchar', length: 20, default: 'USE' })
  action!: string;

  @Column({ type: 'int', default: 1 })
  quantity!: number;

  @Column({ name: 'user_count', type: 'int', default: 0 })
  userCount!: number;

  @Column({ type: 'varchar', length: 20, default: UsageSource.TRACKED })
  source!: UsageSource;

  @Column({ name: 'dedupe_key', type: 'varchar', length: 160, nullable: true })
  dedupeKey!: string | null;

  @Column({ name: 'occurred_at', type: 'timestamptz', default: () => 'now()' })
  occurredAt!: Date;

  @Column({ type: 'jsonb', default: {} })
  metadata!: Record<string, unknown>;
}
