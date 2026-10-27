import { Entity, Column, Index } from 'typeorm';
import { BaseOrganizationEntity } from '../../../common/entities/base.entity';

/**
 * Customer – Master Data (Phase 2 enhanced)
 * Extends BaseOrganizationEntity → tenantId, companyId, branchId, createdBy, updatedBy
 * Sprint 4: ownerId for SELF / TEAM scope
 */
@Entity('customers')
export class Customer extends BaseOrganizationEntity {
  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Index()
  @Column({ type: 'varchar', length: 50, nullable: true })
  code!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email!: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  phone!: string | null;

  @Column({ type: 'text', nullable: true })
  address!: string | null;

  @Column({ type: 'varchar', length: 50, default: 'active' })
  status!: string;

  /** Phase 2 Master Data */
  @Column({ name: 'tax_code', type: 'varchar', length: 50, nullable: true })
  taxCode!: string | null;

  @Column({ name: 'payment_term_id', type: 'uuid', nullable: true })
  paymentTermId!: string | null;

  @Column({ name: 'currency_id', type: 'uuid', nullable: true })
  currencyId!: string | null;

  @Column({ name: 'credit_limit', type: 'decimal', precision: 18, scale: 2, nullable: true })
  creditLimit!: number | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  /** Sprint 4 – owner for Data Scope (SELF / TEAM) */
  @Index()
  @Column({ name: 'owner_id', type: 'uuid', nullable: true })
  ownerId!: string | null;
}
