import { Column, Entity, Index, Unique } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base.entity';
import { RevenueDimension } from '../enums/revenue.enum';

/** Revenue breakdown row per dimension (plan / tenant / country). */
@Entity('revenue_segments')
@Unique(['tenantId', 'dimension', 'segmentKey', 'period'])
@Index(['tenantId', 'dimension', 'period'])
export class RevenueSegment extends BaseTenantEntity {
  @Column({ type: 'varchar', length: 20 })
  dimension!: RevenueDimension;

  @Column({ name: 'segment_key', type: 'varchar', length: 100 })
  segmentKey!: string;

  @Column({ type: 'varchar', length: 255 })
  label!: string;

  @Column({ type: 'numeric', precision: 20, scale: 2, default: 0 })
  mrr!: string;

  @Column({ type: 'numeric', precision: 20, scale: 2, default: 0 })
  arr!: string;

  @Column({ name: 'share_pct', type: 'numeric', precision: 6, scale: 2, default: 0 })
  sharePct!: string;

  @Column({ type: 'int', default: 0 })
  customers!: number;

  @Column({ type: 'varchar', length: 7 })
  period!: string;

  @Column({ type: 'jsonb', default: {} })
  metadata!: Record<string, unknown>;
}
