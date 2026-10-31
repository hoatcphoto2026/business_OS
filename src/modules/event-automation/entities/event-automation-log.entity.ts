import { Entity, Column, Index } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base.entity';
import { AutomationStatus } from '../enums/automation.enum';

/**
 * EventAutomationLog – tracks automated handling of domain events.
 * Supports retry, idempotency, and dead-letter.
 */
@Entity('event_automation_logs')
@Index(['tenantId', 'status'])
@Index(['eventId'], { unique: true })
@Index(['eventType', 'status'])
export class EventAutomationLog extends BaseTenantEntity {
  @Column({ name: 'event_id', type: 'uuid' })
  eventId!: string;

  @Column({ name: 'event_type', type: 'varchar', length: 60 })
  eventType!: string;

  @Column({
    type: 'varchar',
    length: 20,
    default: AutomationStatus.PENDING,
  })
  status!: AutomationStatus;

  @Column({ name: 'attempt_count', type: 'int', default: 0 })
  attemptCount!: number;

  @Column({ name: 'max_retries', type: 'int', default: 3 })
  maxRetries!: number;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError!: string | null;

  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt!: Date | null;

  @Column({ type: 'jsonb', default: {} })
  payload!: Record<string, unknown>;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 128, nullable: true })
  idempotencyKey!: string | null;
}
