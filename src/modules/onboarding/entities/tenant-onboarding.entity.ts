import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../common/entities/base.entity';
import { OnboardingStatus } from '../enums/onboarding.enum';

/**
 * TenantOnboarding – tracks the self-service onboarding flow.
 * One record per onboarding attempt.
 */
@Entity('tenant_onboardings')
@Index(['status'])
export class TenantOnboarding extends BaseEntity {
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId!: string | null;

  @Column({ name: 'owner_user_id', type: 'uuid', nullable: true })
  ownerUserId!: string | null;

  @Column({
    type: 'varchar',
    length: 20,
    default: OnboardingStatus.PENDING,
  })
  status!: OnboardingStatus;

  @Column({ name: 'current_step', type: 'varchar', length: 50, default: 'INIT' })
  currentStep!: string;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;

  @Column({ name: 'retry_count', type: 'int', default: 0 })
  retryCount!: number;

  @Column({ type: 'jsonb', default: {} })
  metadata!: Record<string, unknown>;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;
}
