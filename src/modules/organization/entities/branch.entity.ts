import { Entity, Column, Index, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { Company } from './company.entity';
import { Department } from './department.entity';

export enum OrgStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

/**
 * Branch – under a Company.
 * 1 Company → many Branches
 */
@Entity('branches')
@Index(['tenantId', 'companyId', 'code'], { unique: true })
export class Branch extends BaseEntity {
  @Index()
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId!: string;

  @Index()
  @Column({ name: 'company_id', type: 'uuid' })
  companyId!: string;

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

  @ManyToOne(() => Company, (c) => c.branches, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company!: Company;

  @OneToMany(() => Department, (d) => d.branch)
  departments!: Department[];
}
