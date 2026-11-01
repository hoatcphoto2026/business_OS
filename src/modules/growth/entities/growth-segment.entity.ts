import { Column, Entity, Index, Unique } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base.entity';
import { GrowthSegmentDimension } from '../enums/growth.enum';

/** Persisted growth segment (acquisition source / plan) per period. */
@Entity('growth_segments')
@Unique(['tenantId', 'dimension', 'segmentKey', 'period'])
@Index(['tenantId', 'dimension', 'period'])
export class GrowthSegment extends BaseTenantEntity {
  @Column({ type: 'varchar', length: 20 })
  dimension!: GrowthSegmentDimension;

  @Column({ name: 'segment_key', type: 'varchar', length: 100 })
  segmentKey!: string;

  @Column({ type: 'varchar', length: 255 })
  label!: string;

  @Column({ type: 'varchar', length: 7 })
  period!: string;

  @Column({ type: 'int', default: 0 })
  tenants!: number;

  @Column({ type: 'int', default: 0 })
  trials!: number;

  @Column({ name: 'paid_tenants', type: 'int', default: 0 })
  paidTenants!: number;

  @Column({ type: 'int', default: 0 })
  conversions!: number;

  @Column({ type: 'numeric', precision: 20, scale: 2, default: 0 })
  mrr!: string;

  @Column({ name: 'share_pct', type: 'numeric', precision: 6, scale: 2, default: 0 })
  sharePct!: string;

  @Column({ type: 'jsonb', default: {} })
  metadata!: Record<string, unknown>;
}
