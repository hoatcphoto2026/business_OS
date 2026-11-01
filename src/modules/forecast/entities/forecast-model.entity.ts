import { Column, Entity, Index } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base.entity';
import {
  ForecastMethod,
  ForecastMetric,
  ForecastModelStatus,
} from '../enums/forecast.enum';

/** ForecastModel – per tenant/metric/method configuration used by the engine. */
@Entity('forecast_models')
@Index(['tenantId', 'metric', 'method'], { unique: true })
export class ForecastModel extends BaseTenantEntity {
  @Column({ type: 'varchar', length: 40 })
  metric!: ForecastMetric;

  @Column({ type: 'varchar', length: 40 })
  method!: ForecastMethod;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'jsonb', default: {} })
  parameters!: Record<string, unknown>;

  @Column({
    type: 'varchar',
    length: 20,
    default: ForecastModelStatus.ACTIVE,
  })
  status!: ForecastModelStatus;

  @Column({ type: 'int', default: 1 })
  version!: number;

  @Column({ name: 'last_run_at', type: 'timestamptz', nullable: true })
  lastRunAt!: Date | null;
}
