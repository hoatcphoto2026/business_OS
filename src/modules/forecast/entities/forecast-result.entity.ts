import { Column, Entity, Index } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base.entity';
import { ForecastMethod, ForecastMetric } from '../enums/forecast.enum';

/** ForecastResult – one metric/method/horizon prediction produced by a run. */
@Entity('forecast_results')
@Index(['runId', 'metric', 'method', 'horizonDays'], { unique: true })
@Index(['tenantId', 'metric', 'createdAt'])
export class ForecastResult extends BaseTenantEntity {
  @Column({ name: 'run_id', type: 'uuid' })
  runId!: string;

  @Column({ type: 'varchar', length: 40 })
  metric!: ForecastMetric;

  @Column({ type: 'varchar', length: 40 })
  method!: ForecastMethod;

  @Column({ name: 'horizon_days', type: 'int' })
  horizonDays!: number;

  @Column({ name: 'lookback_days', type: 'int', default: 90 })
  lookbackDays!: number;

  @Column({
    name: 'predicted_value',
    type: 'numeric',
    precision: 20,
    scale: 4,
    default: 0,
  })
  predictedValue!: string;

  @Column({
    name: 'lower_bound',
    type: 'numeric',
    precision: 20,
    scale: 4,
    default: 0,
  })
  lowerBound!: string;

  @Column({
    name: 'upper_bound',
    type: 'numeric',
    precision: 20,
    scale: 4,
    default: 0,
  })
  upperBound!: string;

  @Column({
    name: 'confidence_pct',
    type: 'numeric',
    precision: 6,
    scale: 2,
    default: 0,
  })
  confidencePct!: string;

  /** Sampled forecast points (<= 30) for charting. */
  @Column({ type: 'jsonb', default: [] })
  points!: Array<{ date: string; value: number }>;

  @Column({ type: 'jsonb', default: {} })
  metadata!: Record<string, unknown>;
}
