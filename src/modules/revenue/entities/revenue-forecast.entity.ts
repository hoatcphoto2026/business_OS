import { Column, Entity, Index, Unique } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base.entity';
import { ForecastHorizon } from '../enums/revenue.enum';

/** Revenue forecast per horizon (next month / quarter / year). */
@Entity('revenue_forecasts')
@Unique(['tenantId', 'horizon', 'asOf'])
@Index(['tenantId', 'horizon', 'asOf'])
export class RevenueForecast extends BaseTenantEntity {
  @Column({ type: 'varchar', length: 20 })
  horizon!: ForecastHorizon;

  @Column({ name: 'as_of', type: 'date' })
  asOf!: string;

  @Column({ name: 'period_start', type: 'date' })
  periodStart!: string;

  @Column({ name: 'period_end', type: 'date' })
  periodEnd!: string;

  @Column({ name: 'predicted_revenue', type: 'numeric', precision: 20, scale: 2 })
  predictedRevenue!: string;

  @Column({ name: 'lower_bound', type: 'numeric', precision: 20, scale: 2 })
  lowerBound!: string;

  @Column({ name: 'upper_bound', type: 'numeric', precision: 20, scale: 2 })
  upperBound!: string;

  @Column({ type: 'numeric', precision: 5, scale: 4, default: 0 })
  confidence!: string;

  @Column({ type: 'varchar', length: 60, default: 'MRR_GROWTH_LINEAR' })
  method!: string;

  @Column({ type: 'jsonb', default: {} })
  inputs!: Record<string, unknown>;

  @Column({ name: 'generated_at', type: 'timestamptz', default: () => 'now()' })
  generatedAt!: Date;
}
