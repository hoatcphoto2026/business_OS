import { Entity, Column, Index } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base.entity';
import { PaymentProvider, PaymentStatus } from '../enums/payment.enum';

/**
 * PaymentTransaction – one payment attempt / charge.
 * Idempotency key prevents duplicate processing.
 */
@Entity('payment_transactions')
@Index(['tenantId', 'status'])
@Index(['idempotencyKey'], { unique: true })
export class PaymentTransaction extends BaseTenantEntity {
  @Column({ name: 'invoice_id', type: 'uuid', nullable: true })
  invoiceId!: string | null;

  @Column({ type: 'varchar', length: 30 })
  provider!: PaymentProvider;

  @Column({ type: 'varchar', length: 30, default: PaymentStatus.PENDING })
  status!: PaymentStatus;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  amount!: string;

  @Column({ type: 'varchar', length: 3, default: 'VND' })
  currency!: string;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 100 })
  idempotencyKey!: string;

  @Column({ name: 'external_id', type: 'varchar', length: 255, nullable: true })
  externalId!: string | null;

  @Column({ name: 'provider_ref', type: 'varchar', length: 255, nullable: true })
  providerRef!: string | null;

  @Column({ name: 'failure_reason', type: 'text', nullable: true })
  failureReason!: string | null;

  @Column({ name: 'retry_count', type: 'int', default: 0 })
  retryCount!: number;

  @Column({ type: 'jsonb', default: {} })
  metadata!: Record<string, unknown>;

  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt!: Date | null;
}
