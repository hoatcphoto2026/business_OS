import { Entity, Column, Index } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base.entity';
import { PaymentProvider } from '../enums/payment.enum';

/**
 * PaymentMethod – saved payment method for a tenant.
 */
@Entity('payment_methods')
@Index(['tenantId', 'provider'])
export class PaymentMethod extends BaseTenantEntity {
  @Column({ type: 'varchar', length: 30 })
  provider!: PaymentProvider;

  @Column({ name: 'external_id', type: 'varchar', length: 255, nullable: true })
  externalId!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  label!: string | null;

  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault!: boolean;

  @Column({ type: 'jsonb', default: {} })
  metadata!: Record<string, unknown>;
}
