import { Entity, Column, Index } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base.entity';
import { RenewalStatus } from '../enums/renewal.enum';

/**
 * RenewalAttempt – one automatic renewal try for a subscription.
 */
@Entity('renewal_attempts')
@Index(['tenantId', 'status'])
@Index(['subscriptionId'])
export class RenewalAttempt extends BaseTenantEntity {
  @Column({ name: 'subscription_id', type: 'uuid' })
  subscriptionId!: string;

  @Column({
    type: 'varchar',
    length: 20,
    default: RenewalStatus.PENDING,
  })
  status!: RenewalStatus;

  @Column({ name: 'attempt_count', type: 'int', default: 1 })
  attemptCount!: number;

  @Column({ name: 'invoice_id', type: 'uuid', nullable: true })
  invoiceId!: string | null;

  @Column({ name: 'payment_id', type: 'uuid', nullable: true })
  paymentId!: string | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;

  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt!: Date | null;

  @Column({ type: 'jsonb', default: {} })
  metadata!: Record<string, unknown>;
}
