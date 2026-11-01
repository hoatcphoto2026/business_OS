import { Column, Entity, Unique } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base.entity';

/** Configurable signal catalog (seeded, weights override the defaults). */
@Entity('health_signals')
@Unique(['tenantId', 'code'])
export class HealthSignal extends BaseTenantEntity {
  @Column({ type: 'varchar', length: 40 })
  code!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'numeric', precision: 5, scale: 2, default: 0 })
  weight!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'boolean', default: true })
  enabled!: boolean;

  @Column({ type: 'jsonb', default: {} })
  metadata!: Record<string, unknown>;
}
