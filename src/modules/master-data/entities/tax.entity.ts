import { Entity, Column, Index } from 'typeorm';
import { BaseOrganizationEntity } from '../../../common/entities/base.entity';

@Entity('taxes')
export class Tax extends BaseOrganizationEntity {
  @Index()
  @Column({ type: 'varchar', length: 50 })
  code!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  rate!: number;

  @Column({ type: 'varchar', length: 30, default: 'VAT' })
  type!: string; // VAT | WITHHOLDING | OTHER

  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault!: boolean;

  @Column({ type: 'varchar', length: 50, default: 'active' })
  status!: string;

  @Index()
  @Column({ name: 'owner_id', type: 'uuid', nullable: true })
  ownerId!: string | null;
}
