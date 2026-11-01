import { Column, Entity, Index } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base.entity';
import {
  ForecastMethod,
  ForecastMetric,
  ForecastRunStatus,
} from '../enums/forecast.enum';

/** ForecastRun – one execution of the forecast engine (history entry). */
@Entity('forecast_runs')
@Index(['tenantId', 'status', 'startedAt'])
export class ForecastRun extends BaseTenantEntity {
  @Column({ type: 'varchar', length: 20, default: ForecastRunStatus.RUNNING })
  status!: ForecastRunStatus;

  @Column({ type: 'jsonb', default: [] })
  metrics!: ForecastMetric[];

  @Column({ type: 'jsonb', default: [] })
  methods!: ForecastMethod[];

  @Column({ type: 'jsonb', default: [] })
  horizons!: number[];

  @Column({ name: 'lookback_days', type: 'int', default: 90 })
  lookbackDays!: number;

  @Column({ name: 'data_points', type: 'int', default: 0 })
  dataPoints!: number;

  @Column({ name: 'results_count', type: 'int', default: 0 })
  resultsCount!: number;

  @Column({ name: 'requested_by', type: 'uuid', nullable: true })
  requestedBy!: string | null;

  @Column({ name: 'started_at', type: 'timestamptz', default: () => 'now()' })
  startedAt!: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;

  @Column({ type: 'jsonb', default: {} })
  metadata!: Record<string, unknown>;
}
