import { Column, Entity, Index } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base.entity';
import { EmergencyAccessStatus } from '../enums/security.enum';

/**
 * Persistent break-glass / emergency access request with dual control.
 * Approval must come from a different admin than the requester.
 */
@Entity('security_emergency_access')
@Index(['tenantId', 'status'])
export class EmergencyAccess extends BaseTenantEntity {
  @Column({ name: 'requester_id', type: 'uuid' })
  requesterId!: string;

  @Column({ name: 'approver_id', type: 'uuid', nullable: true })
  approverId!: string | null;

  @Column({ type: 'text' })
  reason!: string;

  @Column({ type: 'varchar', length: 60, default: 'TENANT_ADMIN' })
  scope!: string;

  @Column({
    type: 'varchar',
    length: 20,
    default: EmergencyAccessStatus.PENDING,
  })
  status!: EmergencyAccessStatus;

  @Column({ name: 'requested_at', type: 'timestamptz', default: () => 'now()' })
  requestedAt!: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt!: Date | null;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  @Column({ type: 'jsonb', default: {} })
  metadata!: Record<string, unknown>;
}
