import { Entity, Column, Index } from 'typeorm';
import { BaseOrganizationEntity } from '../../../common/entities/base.entity';
import { DeliveryStatus } from '../enums/delivery-status.enum';

@Entity('delivery_orders')
export class DeliveryOrder extends BaseOrganizationEntity {
  @Index()
  @Column({ name: 'sales_order_id', type: 'uuid', nullable: true })
  salesOrderId!: string | null;

  @Index()
  @Column({ name: 'shipping_no', type: 'varchar', length: 50, nullable: true })
  shippingNo!: string | null;

  @Column({ name: 'carrier_code', type: 'varchar', length: 50, nullable: true })
  carrierCode!: string | null;

  @Column({ name: 'recipient_name', type: 'varchar', length: 255 })
  recipientName!: string;

  @Column({ name: 'recipient_phone', type: 'varchar', length: 30, nullable: true })
  recipientPhone!: string | null;

  @Column({ name: 'recipient_address', type: 'text' })
  recipientAddress!: string;

  @Column({ name: 'shipping_fee', type: 'decimal', precision: 18, scale: 2, default: 0 })
  shippingFee!: number;

  @Column({ name: 'cod_amount', type: 'decimal', precision: 18, scale: 2, default: 0 })
  codAmount!: number;

  @Column({ type: 'varchar', length: 30, default: DeliveryStatus.CREATED })
  status!: DeliveryStatus;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;
}
