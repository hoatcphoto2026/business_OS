import { Entity, Column, Index, OneToMany } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base.entity';
import { InvoiceTrigger, AutoInvoiceStatus } from '../enums/auto-invoice.enum';
import { AutoInvoiceItem } from './auto-invoice-item.entity';

/**
 * AutoInvoice – an automatically generated invoice.
 */
@Entity('auto_invoices')
@Index(['tenantId', 'status'])
@Index(['trigger'])
export class AutoInvoice extends BaseTenantEntity {
  @Column({ name: 'invoice_number', type: 'varchar', length: 50 })
  invoiceNumber!: string;

  @Column({
    type: 'varchar',
    length: 30,
  })
  trigger!: InvoiceTrigger;

  @Column({
    type: 'varchar',
    length: 20,
    default: AutoInvoiceStatus.PENDING,
  })
  status!: AutoInvoiceStatus;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0 })
  subtotal!: number;

  @Column({ name: 'tax_amount', type: 'numeric', precision: 14, scale: 2, default: 0 })
  taxAmount!: number;

  @Column({ name: 'discount_amount', type: 'numeric', precision: 14, scale: 2, default: 0 })
  discountAmount!: number;

  @Column({ name: 'coupon_code', type: 'varchar', length: 50, nullable: true })
  couponCode!: string | null;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0 })
  total!: number;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;

  @Column({ type: 'jsonb', default: {} })
  metadata!: Record<string, unknown>;

  @OneToMany(() => AutoInvoiceItem, (i) => i.invoice, { cascade: true })
  items!: AutoInvoiceItem[];
}
