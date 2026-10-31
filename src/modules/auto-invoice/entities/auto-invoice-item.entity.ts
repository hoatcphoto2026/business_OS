import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base.entity';
import { AutoInvoice } from './auto-invoice.entity';

/**
 * AutoInvoiceItem – a line item on an auto invoice.
 */
@Entity('auto_invoice_items')
@Index(['invoiceId'])
export class AutoInvoiceItem extends BaseTenantEntity {
  @Column({ name: 'invoice_id', type: 'uuid' })
  invoiceId!: string;

  @ManyToOne(() => AutoInvoice, (inv) => inv.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'invoice_id' })
  invoice!: AutoInvoice;

  @Column({ type: 'varchar', length: 255 })
  description!: string;

  @Column({ type: 'numeric', precision: 10, scale: 2, default: 1 })
  quantity!: number;

  @Column({ name: 'unit_price', type: 'numeric', precision: 14, scale: 2, default: 0 })
  unitPrice!: number;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0 })
  amount!: number;
}
