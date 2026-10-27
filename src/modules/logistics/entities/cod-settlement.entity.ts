import { Entity, Column, Index } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base.entity';

@Entity('cod_settlements')
export class CodSettlement extends BaseTenantEntity {
  @Index()
  @Column({ name: 'delivery_order_id', type: 'uuid' })
  deliveryOrderId!: string;

  @Column({ type: 'varchar', length: 50 })
  carrier!: string;

  @Column({ name: 'cod_amount', type: 'decimal', precision: 18, scale: 2 })
  codAmount!: number;

  @Column({ name: 'settlement_date', type: 'date', nullable: true })
  settlementDate!: string | null;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status!: string; // pending | settled | failed
}
