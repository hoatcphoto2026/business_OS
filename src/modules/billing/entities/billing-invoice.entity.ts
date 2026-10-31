import { Entity, Column, Index, OneToMany } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base.entity';
import { InvoiceStatus } from '../enums/invoice-status.enum';
import { BillingInvoiceItem } from './billing-invoice-item.entity';

/**
 * BillingInvoice – subscription / billing invoice.
 * Separate from sales Invoice (common/entities/invoice.entity.ts).
 */
@Entity('billing_invoices')
@Index(['tenantId', 'status'])
export class BillingInvoice extends BaseTenantEntity {
  @Index({ unique: true })
  @Column({ name: 'invoice_number', type: 'varchar', length: 40, unique: true })
  invoiceNumber!: string;

  @Column({ name: 'subscription_id', type: 'uuid', nullable: true })
  subscriptionId!: string | null;

  @Column({ type: 'varchar', length: 30, default: InvoiceStatus.DRAFT })
  status!: InvoiceStatus;

  @Column({ type: 'varchar', length: 3, default: 'VND' })
  currency!: string;

  @Column({ name: 'subtotal', type: 'numeric', precision: 14, scale: 2, default: 0 })
  subtotal!: string;

  @Column({ name: 'tax_rate', type: 'numeric', precision: 5, scale: 2, default: 0 })
  taxRate!: string;

  @Column({ name: 'tax_amount', type: 'numeric', precision: 14, scale: 2, default: 0 })
  taxAmount!: string;

  @Column({ name: 'discount_amount', type: 'numeric', precision: 14, scale: 2, default: 0 })
  discountAmount!: string;

  @Column({ name: 'coupon_code', type: 'varchar', length: 40, nullable: true })
  couponCode!: string | null;

  @Column({ type: 'numeric', precision: 14, scale: 2, default: 0 })
  total!: string;

  @Column({ name: 'amount_paid', type: 'numeric', precision: 14, scale: 2, default: 0 })
  amountPaid!: string;

  @Column({ name: 'issued_at', type: 'timestamptz', nullable: true })
  issuedAt!: Date | null;

  @Column({ name: 'due_at', type: 'timestamptz', nullable: true })
  dueAt!: Date | null;

  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt!: Date | null;

  @Column({ name: 'voided_at', type: 'timestamptz', nullable: true })
  voidedAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @OneToMany(() => BillingInvoiceItem, (item) => item.invoice, { cascade: true })
  items!: BillingInvoiceItem[];
}
