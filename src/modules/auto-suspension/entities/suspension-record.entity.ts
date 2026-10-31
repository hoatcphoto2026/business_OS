import { Entity, Column, Index } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base.entity';
import { SuspensionTrigger, SuspensionStatus } from '../enums/suspension.enum';

/**
 * SuspensionRecord – one automatic suspension action.
 */
@Entity('suspension_records')
@Index(['tenantId', 'status'])
@Index(['trigger'])
export class SuspensionRecord extends BaseTenantEntity {
  @Column({
    type: 'varchar',
    length: 30,
  })
  trigger!: SuspensionTrigger;

  @Column({
    type: 'varchar',
    length: 20,
    default: SuspensionStatus.PENDING,
  })
  status!: SuspensionStatus;

  @Column({ name: 'attempt_count', type: 'int', default: 1 })
  attemptCount!: number;

  @Column({ name: 'users_disabled', type: 'int', default: 0 })
  usersDisabled!: number;

  @Column({ name: 'api_keys_revoked', type: 'int', default: 0 })
  apiKeysRevoked!: number;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;

  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt!: Date | null;

  @Column({ type: 'jsonb', default: {} })
  metadata!: Record<string, unknown>;
}
