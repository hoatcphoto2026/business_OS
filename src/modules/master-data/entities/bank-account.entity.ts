import { Entity, Column, Index } from 'typeorm';
import { BaseOrganizationEntity } from '../../../common/entities/base.entity';

@Entity('bank_accounts')
export class BankAccount extends BaseOrganizationEntity {
  @Column({ name: 'bank_name', type: 'varchar', length: 255 })
  bankName!: string;

  @Column({ name: 'account_number', type: 'varchar', length: 50 })
  accountNumber!: string;

  @Column({ name: 'account_name', type: 'varchar', length: 255 })
  accountName!: string;

  @Column({ name: 'currency_id', type: 'uuid', nullable: true })
  currencyId!: string | null;

  @Column({ name: 'branch_name', type: 'varchar', length: 255, nullable: true })
  branchName!: string | null;

  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault!: boolean;

  @Column({ type: 'varchar', length: 50, default: 'active' })
  status!: string;

  @Index()
  @Column({ name: 'owner_id', type: 'uuid', nullable: true })
  ownerId!: string | null;
}
