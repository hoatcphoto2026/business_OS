import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { BillingInvoice } from './billing-invoice.entity';

@Entity('billing_invoice_items')
export class BillingInvoiceItem extends BaseEntity {
  @Column({ name: 'invoice_id', type: 'uuid' })
  invoiceId!: string;

  @ManyToOne(() => BillingInvoice, (inv) => inv.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'invoice_id' })
  invoice!: BillingInvoice;

  @Column({ type: 'varchar', length: 255 })
  description!: string;

  @Column({ type: 'int', default: 1 })
  quantity!: number;

  @Column({ name: 'unit_price', type: 'numeric', precision: 14, scale: 2, default: 0 })
  unitPrice!: string;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0 })
  amount!: string;
}
