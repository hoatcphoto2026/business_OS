import { Column, Entity, Index, Unique } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base.entity';
import { RevenueSnapshotPeriod } from '../enums/revenue.enum';

/** Point-in-time revenue snapshot (MRR/ARR + segments). */
@Entity('revenue_snapshots')
@Unique(['tenantId', 'snapshotDate', 'periodType'])
@Index(['tenantId', 'periodType', 'snapshotDate'])
export class RevenueSnapshot extends BaseTenantEntity {
  @Column({ name: 'snapshot_date', type: 'date' })
  snapshotDate!: string;

  @Column({ name: 'period_type', type: 'varchar', length: 10 })
  periodType!: RevenueSnapshotPeriod;

  @Column({ type: 'numeric', precision: 20, scale: 2, default: 0 })
  mrr!: string;

  @Column({ type: 'numeric', precision: 20, scale: 2, default: 0 })
  arr!: string;

  @Column({ name: 'expansion_revenue', type: 'numeric', precision: 20, scale: 2, default: 0 })
  expansionRevenue!: string;

  @Column({ name: 'contraction_revenue', type: 'numeric', precision: 20, scale: 2, default: 0 })
  contractionRevenue!: string;

  @Column({ name: 'net_new_revenue', type: 'numeric', precision: 20, scale: 2, default: 0 })
  netNewRevenue!: string;

  @Column({ name: 'paid_revenue', type: 'numeric', precision: 20, scale: 2, default: 0 })
  paidRevenue!: string;

  @Column({ name: 'paying_customers', type: 'int', default: 0 })
  payingCustomers!: number;

  @Column({ name: 'customer_count', type: 'int', default: 0 })
  customerCount!: number;

  @Column({ name: 'by_plan', type: 'jsonb', default: [] })
  byPlan!: Array<Record<string, unknown>>;

  @Column({ name: 'by_tenant', type: 'jsonb', default: [] })
  byTenant!: Array<Record<string, unknown>>;

  @Column({ name: 'by_country', type: 'jsonb', default: [] })
  byCountry!: Array<Record<string, unknown>>;

  @Column({ name: 'generated_at', type: 'timestamptz', default: () => 'now()' })
  generatedAt!: Date;
}
