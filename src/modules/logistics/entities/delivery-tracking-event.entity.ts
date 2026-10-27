import { Entity, Column, Index } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base.entity';

@Entity('delivery_tracking_events')
export class DeliveryTrackingEvent extends BaseTenantEntity {
  @Index()
  @Column({ name: 'delivery_order_id', type: 'uuid' })
  deliveryOrderId!: string;

  @Column({ type: 'varchar', length: 30 })
  status!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'location', type: 'varchar', length: 255, nullable: true })
  location!: string | null;
}
