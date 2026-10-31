import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base.entity';
import { Plan } from './plan.entity';
import {
  SubscriptionStatus,
  BillingCycle,
} from '../enums/billing.enum';

/**
 * Subscription – current subscription for a tenant.
 * One active subscription per tenant (enforced by unique tenant_id in practice
 * or by application logic). Extends BaseTenantEntity.
 */
@Entity('subscriptions')
export class Subscription extends BaseTenantEntity {
  @Index()
  @Column({ name: 'plan_id', type: 'uuid' })
  planId!: string;

  @ManyToOne(() => Plan, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'plan_id' })
  plan!: Plan;

  @Column({
    type: 'varchar',
    length: 30,
    default: SubscriptionStatus.TRIAL,
  })
  status!: SubscriptionStatus;

  @Column({
    name: 'billing_cycle',
    type: 'varchar',
    length: 20,
    default: BillingCycle.MONTHLY,
  })
  billingCycle!: BillingCycle;

  @Column({ name: 'current_period_start', type: 'timestamptz', nullable: true })
  currentPeriodStart!: Date | null;

  @Column({ name: 'current_period_end', type: 'timestamptz', nullable: true })
  currentPeriodEnd!: Date | null;

  @Column({ name: 'trial_end', type: 'timestamptz', nullable: true })
  trialEnd!: Date | null;

  @Column({ name: 'cancel_at_period_end', type: 'boolean', default: false })
  cancelAtPeriodEnd!: boolean;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt!: Date | null;

  @Column({ name: 'grace_period_end', type: 'timestamptz', nullable: true })
  gracePeriodEnd!: Date | null;

  /** External payment provider subscription id (future) */
  @Column({ name: 'external_id', type: 'varchar', length: 255, nullable: true })
  externalId!: string | null;

  @Column({ type: 'jsonb', default: {} })
  metadata!: Record<string, unknown>;
}
