import { Column, Entity, Index } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base.entity';

/**
 * D8 dimension tables. They are owned by the platform-operator tenant
 * (`tenant_id`) and describe the *subject* entities of the business (the
 * `source_*` columns), so every warehouse query stays tenant-scoped.
 */

@Entity('warehouse_dim_tenants')
@Index(['tenantId', 'sourceTenantId'], { unique: true })
export class WarehouseDimTenant extends BaseTenantEntity {
  @Column({ name: 'source_tenant_id', type: 'uuid' })
  sourceTenantId!: string;

  @Column({ type: 'varchar', length: 50 })
  code!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ name: 'plan_code', type: 'varchar', length: 30 })
  planCode!: string;

  @Column({ type: 'varchar', length: 20 })
  status!: string;

  @Column({ type: 'varchar', length: 2, nullable: true })
  country!: string | null;

  @Column({ name: 'source_updated_at', type: 'timestamptz', nullable: true })
  sourceUpdatedAt!: Date | null;
}

@Entity('warehouse_dim_plans')
@Index(['tenantId', 'planCode'], { unique: true })
export class WarehouseDimPlan extends BaseTenantEntity {
  @Column({ name: 'plan_code', type: 'varchar', length: 30 })
  planCode!: string;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ name: 'monthly_price', type: 'numeric', precision: 14, scale: 2, default: 0 })
  monthlyPrice!: string;

  @Column({ name: 'yearly_price', type: 'numeric', precision: 14, scale: 2, default: 0 })
  yearlyPrice!: string;

  @Column({ type: 'varchar', length: 3, default: 'VND' })
  currency!: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;
}

@Entity('warehouse_dim_organizations')
@Index(['tenantId', 'sourceOrganizationId'], { unique: true })
export class WarehouseDimOrganization extends BaseTenantEntity {
  @Column({ name: 'source_organization_id', type: 'uuid' })
  sourceOrganizationId!: string;

  @Column({ name: 'source_tenant_id', type: 'uuid' })
  sourceTenantId!: string;

  @Column({ type: 'varchar', length: 50 })
  code!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 20 })
  status!: string;
}

@Entity('warehouse_dim_departments')
@Index(['tenantId', 'sourceDepartmentId'], { unique: true })
export class WarehouseDimDepartment extends BaseTenantEntity {
  @Column({ name: 'source_department_id', type: 'uuid' })
  sourceDepartmentId!: string;

  @Column({ name: 'source_organization_id', type: 'uuid' })
  sourceOrganizationId!: string;

  @Column({ name: 'source_tenant_id', type: 'uuid' })
  sourceTenantId!: string;

  @Column({ type: 'varchar', length: 50 })
  code!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 20 })
  status!: string;
}

@Entity('warehouse_dim_dates')
@Index(['tenantId', 'dateKey'], { unique: true })
export class WarehouseDimDate extends BaseTenantEntity {
  /** YYYYMMDD surrogate key. */
  @Column({ name: 'date_key', type: 'int' })
  dateKey!: number;

  @Column({ name: 'calendar_date', type: 'date' })
  calendarDate!: string;

  @Column({ type: 'int' })
  year!: number;

  @Column({ type: 'int' })
  quarter!: number;

  @Column({ type: 'int' })
  month!: number;

  @Column({ name: 'month_name', type: 'varchar', length: 20 })
  monthName!: string;

  @Column({ name: 'week_of_year', type: 'int' })
  weekOfYear!: number;

  @Column({ name: 'day_of_week', type: 'int' })
  dayOfWeek!: number;

  @Column({ name: 'day_name', type: 'varchar', length: 20 })
  dayName!: string;

  @Column({ name: 'is_weekend', type: 'boolean' })
  isWeekend!: boolean;
}
