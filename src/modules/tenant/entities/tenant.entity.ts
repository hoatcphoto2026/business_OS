import { Entity, Column, Index, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';

export enum TenantPlan {
  FREE = 'free',
  STARTER = 'starter',
  PROFESSIONAL = 'professional',
  ENTERPRISE = 'enterprise',
}

export enum TenantStatus {
  TRIAL = 'trial',
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  PAST_DUE = 'past_due',
  CLOSED = 'closed',
}

/**
 * Tenant – root of multi-tenancy.
 *
 * slug is used for subdomain / path routing:
 *   abc.businessos.vn  or  businessos.vn/t/abc-trading
 *
 * Future:
 * - Sprint 2: Company / Branch / Department under Tenant
 * - Sprint 3: Roles & Permissions scoped per Tenant
 */
@Entity('tenants')
export class Tenant extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 50, unique: true })
  code!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 100, unique: true })
  slug!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({
    type: 'enum',
    enum: TenantPlan,
    default: TenantPlan.STARTER,
  })
  plan!: TenantPlan;

  @Column({
    type: 'enum',
    enum: TenantStatus,
    default: TenantStatus.TRIAL,
  })
  status!: TenantStatus;

  /**
   * Flexible settings bag.
   * See TenantSettingsDto for the canonical shape.
   */
  @Column({ type: 'jsonb', default: {} })
  settings!: Record<string, unknown>;
}
