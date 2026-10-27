import { Entity, Column, Index, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Tenant } from '../../tenant/entities/tenant.entity';
import { Branch } from './branch.entity';

export enum OrgStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

/**
 * Company – under a Tenant.
 * 1 Tenant → many Companies
 */
@Entity('companies')
@Index(['tenantId', 'code'], { unique: true })
export class Company extends BaseEntity {
  @Index()
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Column({ type: 'varchar', length: 50 })
  code!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ name: 'tax_code', type: 'varchar', length: 50, nullable: true })
  taxCode!: string | null;

  @Column({
    type: 'enum',
    enum: OrgStatus,
    default: OrgStatus.ACTIVE,
  })
  status!: OrgStatus;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant!: Tenant;

  @OneToMany(() => Branch, (b) => b.company)
  branches!: Branch[];
}
