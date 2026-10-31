import { Entity, Column, Index } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base.entity';
import { AutoNotifyEvent, NotifyChannel, DeliveryStatus } from '../enums/auto-notify.enum';

/**
 * AutoNotificationLog – tracks automatic notification deliveries.
 */
@Entity('auto_notification_logs')
@Index(['tenantId', 'status'])
@Index(['event', 'channel'])
export class AutoNotificationLog extends BaseTenantEntity {
  @Column({
    type: 'varchar',
    length: 40,
  })
  event!: AutoNotifyEvent;

  @Column({
    type: 'varchar',
    length: 20,
  })
  channel!: NotifyChannel;

  @Column({ name: 'template_code', type: 'varchar', length: 100, nullable: true })
  templateCode!: string | null;

  @Column({ type: 'varchar', length: 255 })
  recipient!: string;

  @Column({ type: 'text' })
  body!: string;

  @Column({
    type: 'varchar',
    length: 20,
    default: DeliveryStatus.PENDING,
  })
  status!: DeliveryStatus;

  @Column({ name: 'attempt_count', type: 'int', default: 1 })
  attemptCount!: number;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;

  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
  sentAt!: Date | null;

  @Column({ type: 'jsonb', default: {} })
  metadata!: Record<string, unknown>;
}
