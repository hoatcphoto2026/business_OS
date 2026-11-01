import { Column, Entity, Index, Unique } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base.entity';
import { ExperimentStatus } from '../enums/growth.enum';

/** A/B growth experiment with conversion + uplift tracking. */
@Entity('growth_experiments')
@Unique(['tenantId', 'name'])
@Index(['tenantId', 'status'])
export class GrowthExperiment extends BaseTenantEntity {
  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  hypothesis!: string | null;

  @Column({ type: 'varchar', length: 20, default: ExperimentStatus.DRAFT })
  status!: ExperimentStatus;

  @Column({ type: 'varchar', length: 120, default: 'ALL_TENANTS' })
  audience!: string;

  @Column({ name: 'variant_a', type: 'varchar', length: 120, default: 'CONTROL' })
  variantA!: string;

  @Column({ name: 'variant_b', type: 'varchar', length: 120, default: 'VARIANT' })
  variantB!: string;

  @Column({ name: 'sample_a', type: 'int', default: 0 })
  sampleA!: number;

  @Column({ name: 'sample_b', type: 'int', default: 0 })
  sampleB!: number;

  @Column({ name: 'conversion_a', type: 'numeric', precision: 6, scale: 2, default: 0 })
  conversionA!: string;

  @Column({ name: 'conversion_b', type: 'numeric', precision: 6, scale: 2, default: 0 })
  conversionB!: string;

  @Column({ name: 'uplift_pct', type: 'numeric', precision: 7, scale: 2, default: 0 })
  upliftPct!: string;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt!: Date | null;

  @Column({ name: 'ended_at', type: 'timestamptz', nullable: true })
  endedAt!: Date | null;

  @Column({ type: 'jsonb', default: {} })
  metadata!: Record<string, unknown>;
}
