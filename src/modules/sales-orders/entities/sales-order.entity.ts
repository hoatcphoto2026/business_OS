import { Entity, Column, Index } from 'typeorm';
import { BaseOrganizationEntity } from '../../../common/entities/base.entity';
import { WorkflowStatus } from '../../workflow/enums/workflow-status.enum';

@Entity('sales_orders')
export class SalesOrder extends BaseOrganizationEntity {
  @Column({ name: 'order_number', type: 'varchar', length: 50, nullable: true })
  orderNumber!: string | null;

  @Column({ name: 'customer_id', type: 'uuid', nullable: true })
  customerId!: string | null;

  @Column({ name: 'order_date', type: 'date', nullable: true })
  orderDate!: string | null;

  @Column({
    type: 'varchar',
    length: 30,
    default: WorkflowStatus.DRAFT,
  })
  status!: WorkflowStatus;

  @Column({ name: 'total_amount', type: 'decimal', precision: 18, scale: 2, default: 0 })
  totalAmount!: number;

  /** Sprint 4 – owner for Data Scope (SELF / TEAM) */
  @Index()
  @Column({ name: 'owner_id', type: 'uuid', nullable: true })
  ownerId!: string | null;
}