import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base.entity';
import { Notification } from './notification.entity';

export enum DeliveryStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  FAILED = 'FAILED',
}

export enum NotificationChannel {
  EMAIL = 'EMAIL',
  SMS = 'SMS',
  WEBHOOK = 'WEBHOOK',
  IN_APP = 'IN_APP',
}

/**
 * NotificationDeliveryLog – tracks each delivery attempt.
 * Supports retry and multi-channel.
 */
@Entity('notification_delivery_logs')
@Index(['tenantId', 'status'])
@Index(['notificationId'])
export class NotificationDeliveryLog extends BaseTenantEntity {
  @Column({ name: 'notification_id', type: 'uuid' })
  notificationId!: string;

  @ManyToOne(() => Notification, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'notification_id' })
  notification!: Notification;

  @Column({ type: 'varchar', length: 30 })
  channel!: NotificationChannel;

  @Column({
    type: 'varchar',
    length: 20,
    default: DeliveryStatus.PENDING,
  })
  status!: DeliveryStatus;

  @Column({ name: 'attempt_count', type: 'int', default: 0 })
  attemptCount!: number;

  @Column({ name: 'last_attempt_at', type: 'timestamptz', nullable: true })
  lastAttemptAt!: Date | null;

  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
  sentAt!: Date | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;

  @Column({ type: 'jsonb', default: {} })
  metadata!: Record<string, unknown>;
}
