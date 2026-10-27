import { Entity, Column } from 'typeorm';
import { BaseOrganizationEntity } from './base.entity';

@Entity('inventory_transactions')
export class InventoryTransaction extends BaseOrganizationEntity {
  @Column({ type: 'varchar', length: 50 })
  type!: string; // in / out / adjust

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  quantity!: number;
}
