import { Entity, Column } from 'typeorm';
import { BaseOrganizationEntity } from './base.entity';

@Entity('payments')
export class Payment extends BaseOrganizationEntity {
  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  amount!: number;

  @Column({ type: 'varchar', length: 50, default: 'pending' })
  status!: string;
}
