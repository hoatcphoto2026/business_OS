import { Entity, Column, Index } from 'typeorm';
import { BaseOrganizationEntity } from '../../../common/entities/base.entity';

@Entity('suppliers')
export class Supplier extends BaseOrganizationEntity {
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

  @Column({ name: 'tax_code', type: 'varchar', length: 50, nullable: true })
  taxCode!: string | null;

  @Column({ name: 'payment_term_id', type: 'uuid', nullable: true })
  paymentTermId!: string | null;

  @Column({ name: 'currency_id', type: 'uuid', nullable: true })
  currencyId!: string | null;

  @Column({ type: 'varchar', length: 50, default: 'active' })
  status!: string;

  @Index()
  @Column({ name: 'owner_id', type: 'uuid', nullable: true })
  ownerId!: string | null;
}
