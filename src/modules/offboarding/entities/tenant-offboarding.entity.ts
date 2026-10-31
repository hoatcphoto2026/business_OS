import { Entity, Column, Index } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base.entity';
import { OffboardingStatus } from '../enums/offboarding.enum';

/**
 * TenantOffboarding – tracks a tenant offboarding request.
 */
@Entity('tenant_offboardings')
@Index(['tenantId', 'status'])
export class TenantOffboarding extends BaseTenantEntity {
  @Column({
    type: 'varchar',
    length: 20,
    default: OffboardingStatus.REQUESTED,
  })
  status!: OffboardingStatus;

  @Column({ name: 'requested_by', type: 'uuid' })
  requestedBy!: string;

  @Column({ name: 'current_step', type: 'varchar', length: 50, default: 'REQUESTED' })
  currentStep!: string;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;

  /** Summary of exported data (counts, etc.) */
  @Column({ name: 'export_summary', type: 'jsonb', default: {} })
  exportSummary!: Record<string, unknown>;

  /** Path or identifier of the generated archive */
  @Column({ name: 'archive_ref', type: 'varchar', length: 500, nullable: true })
  archiveRef!: string | null;

  /** Final offboarding report */
  @Column({ type: 'jsonb', default: {} })
  report!: Record<string, unknown>;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;
}
