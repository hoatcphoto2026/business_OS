import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Branch } from './branch.entity';

export enum OrgStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

/**
 * Department – under a Branch.
 * 1 Branch → many Departments
 */
@Entity('departments')
@Index(['tenantId', 'branchId', 'code'], { unique: true })
export class Department extends BaseEntity {
  @Index()
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Index()
  @Column({ name: 'company_id', type: 'uuid' })
  companyId!: string;

  @Index()
  @Column({ name: 'branch_id', type: 'uuid' })
  branchId!: string;

  @Column({ type: 'varchar', length: 50 })
  code!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({
    type: 'enum',
    enum: OrgStatus,
    default: OrgStatus.ACTIVE,
  })
  status!: OrgStatus;

  @ManyToOne(() => Branch, (b) => b.departments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'branch_id' })
  branch!: Branch;
}
