import {
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Column,
  Index,
} from 'typeorm';

/**
 * BaseEntity – for global tables that are NOT tenant-scoped
 * (Tenant itself, User, system config, etc.)
 */
export abstract class BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}

/**
 * BaseTenantEntity – EVERY business entity MUST extend this.
 *
 * Fields:
 * - tenantId   : hard isolation boundary (never null)
 * - createdBy  : user who created the record (audit)
 * - updatedBy  : user who last updated the record (audit)
 * - createdAt / updatedAt
 *
 * Future-ready:
 * - Sprint 2: Company / Branch / Department hang under Tenant
 * - Sprint 5-6: Audit Log & Workflow use createdBy / updatedBy
 * - Sprint 4: Scope filters (Self/Team/Branch/Company) are additional
 *             WHERE clauses on top of tenantId
 */
export abstract class BaseTenantEntity extends BaseEntity {
  @Index()
  @Column({ name: 'tenant_id', type: 'uuid', nullable: false })
  tenantId!: string;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy!: string | null;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy!: string | null;
}

/**
 * BaseOrganizationEntity – Sprint 2
 *
 * Extends BaseTenantEntity with organization hierarchy fields:
 * - companyId
 * - branchId
 *
 * Department is typically not on business records (only on user assignment),
 * but can be added later if needed.
 *
 * Isolation:
 * - Always filter by tenantId (from BaseTenantEntity)
 * - Additionally filter by companyId / branchId when present in Organization Context
 */
export abstract class BaseOrganizationEntity extends BaseTenantEntity {
  @Index()
  @Column({ name: 'company_id', type: 'uuid', nullable: true })
  companyId!: string | null;

  @Index()
  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId!: string | null;
}
