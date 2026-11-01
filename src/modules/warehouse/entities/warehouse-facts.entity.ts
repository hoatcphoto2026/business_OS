import { Column, Entity, Index } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base.entity';
import { WarehousePeriod } from '../enums/warehouse.enum';

/**
 * D8 fact tables – daily grain, one row per subject tenant (+ metric/plan).
 * `tenant_id` is the platform-operator tenant that owns the warehouse;
 * `source_tenant_id` is the tenant being measured.
 */

@Entity('fact_revenue')
@Index(['tenantId', 'dateKey', 'sourceTenantId', 'planCode'], { unique: true })
@Index(['tenantId', 'factDate'])
export class FactRevenue extends BaseTenantEntity {
  @Column({ name: 'date_key', type: 'int' })
  dateKey!: number;

  @Column({ name: 'fact_date', type: 'date' })
  factDate!: string;

  @Column({ name: 'source_tenant_id', type: 'uuid' })
  sourceTenantId!: string;

  @Column({ name: 'plan_code', type: 'varchar', length: 30 })
  planCode!: string;

  @Column({ name: 'organization_id', type: 'uuid', nullable: true })
  organizationId!: string | null;

  @Column({ name: 'revenue_amount', type: 'numeric', precision: 20, scale: 2, default: 0 })
  revenueAmount!: string;

  @Column({ name: 'invoice_count', type: 'int', default: 0 })
  invoiceCount!: number;

  @Column({ type: 'numeric', precision: 20, scale: 2, default: 0 })
  mrr!: string;

  @Column({ name: 'active_subscriptions', type: 'int', default: 0 })
  activeSubscriptions!: number;

  @Column({ type: 'varchar', length: 3, default: 'VND' })
  currency!: string;
}

@Entity('fact_usage')
@Index(['tenantId', 'dateKey', 'sourceTenantId', 'metric'], { unique: true })
@Index(['tenantId', 'factDate'])
export class FactUsage extends BaseTenantEntity {
  @Column({ name: 'date_key', type: 'int' })
  dateKey!: number;

  @Column({ name: 'fact_date', type: 'date' })
  factDate!: string;

  @Column({ name: 'source_tenant_id', type: 'uuid' })
  sourceTenantId!: string;

  @Column({ type: 'varchar', length: 40 })
  metric!: string;

  @Column({ type: 'numeric', precision: 20, scale: 2, default: 0 })
  quantity!: string;

  @Column({ name: 'event_count', type: 'int', default: 0 })
  eventCount!: number;

  @Column({ name: 'organization_id', type: 'uuid', nullable: true })
  organizationId!: string | null;

  @Column({ name: 'department_id', type: 'uuid', nullable: true })
  departmentId!: string | null;
}

@Entity('fact_customer')
@Index(['tenantId', 'dateKey', 'sourceTenantId'], { unique: true })
@Index(['tenantId', 'factDate'])
export class FactCustomer extends BaseTenantEntity {
  @Column({ name: 'date_key', type: 'int' })
  dateKey!: number;

  @Column({ name: 'fact_date', type: 'date' })
  factDate!: string;

  @Column({ name: 'source_tenant_id', type: 'uuid' })
  sourceTenantId!: string;

  @Column({ name: 'plan_code', type: 'varchar', length: 30 })
  planCode!: string;

  @Column({ name: 'organization_id', type: 'uuid', nullable: true })
  organizationId!: string | null;

  @Column({ name: 'department_id', type: 'uuid', nullable: true })
  departmentId!: string | null;

  @Column({ name: 'active_users', type: 'int', default: 0 })
  activeUsers!: number;

  @Column({ name: 'login_count', type: 'int', default: 0 })
  loginCount!: number;

  @Column({ name: 'tickets_opened', type: 'int', default: 0 })
  ticketsOpened!: number;

  @Column({ name: 'health_score', type: 'numeric', precision: 5, scale: 2, default: 0 })
  healthScore!: string;

  @Column({ name: 'churn_candidate', type: 'boolean', default: false })
  churnCandidate!: boolean;
}

@Entity('fact_compliance')
@Index(['tenantId', 'dateKey', 'sourceTenantId'], { unique: true })
@Index(['tenantId', 'factDate'])
export class FactCompliance extends BaseTenantEntity {
  @Column({ name: 'date_key', type: 'int' })
  dateKey!: number;

  @Column({ name: 'fact_date', type: 'date' })
  factDate!: string;

  @Column({ name: 'source_tenant_id', type: 'uuid' })
  sourceTenantId!: string;

  @Column({ name: 'evidence_total', type: 'int', default: 0 })
  evidenceTotal!: number;

  @Column({ name: 'evidence_verified', type: 'int', default: 0 })
  evidenceVerified!: number;

  @Column({ name: 'open_risks', type: 'int', default: 0 })
  openRisks!: number;

  @Column({ name: 'critical_risks', type: 'int', default: 0 })
  criticalRisks!: number;

  @Column({ name: 'compliance_score', type: 'numeric', precision: 6, scale: 2, default: 0 })
  complianceScore!: string;
}

@Entity('fact_security')
@Index(['tenantId', 'dateKey', 'sourceTenantId'], { unique: true })
@Index(['tenantId', 'factDate'])
export class FactSecurity extends BaseTenantEntity {
  @Column({ name: 'date_key', type: 'int' })
  dateKey!: number;

  @Column({ name: 'fact_date', type: 'date' })
  factDate!: string;

  @Column({ name: 'source_tenant_id', type: 'uuid' })
  sourceTenantId!: string;

  @Column({ name: 'security_events', type: 'int', default: 0 })
  securityEvents!: number;

  @Column({ name: 'critical_events', type: 'int', default: 0 })
  criticalEvents!: number;

  @Column({ name: 'failed_logins', type: 'int', default: 0 })
  failedLogins!: number;

  @Column({ name: 'open_alerts', type: 'int', default: 0 })
  openAlerts!: number;

  @Column({ name: 'risk_score', type: 'numeric', precision: 6, scale: 2, default: 0 })
  riskScore!: string;
}

@Entity('warehouse_snapshots')
@Index(['tenantId', 'snapshotDate', 'periodType'], { unique: true })
export class WarehouseSnapshot extends BaseTenantEntity {
  @Column({ name: 'snapshot_date', type: 'date' })
  snapshotDate!: string;

  @Column({ name: 'period_type', type: 'varchar', length: 10 })
  periodType!: WarehousePeriod;

  @Column({ type: 'jsonb', default: {} })
  metrics!: Record<string, number>;

  @Column({ type: 'int', default: 0 })
  tenants!: number;

  @Column({ name: 'fact_rows', type: 'int', default: 0 })
  factRows!: number;

  @Column({ name: 'generated_at', type: 'timestamptz', default: () => 'now()' })
  generatedAt!: Date;
}
