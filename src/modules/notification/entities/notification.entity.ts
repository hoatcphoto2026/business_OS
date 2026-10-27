import { Entity, Column, Index } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base.entity';

@Entity('notifications')
export class Notification extends BaseTenantEntity {
  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  body!: string | null;

  @Column({ type: 'varchar', length: 50, default: 'info' })
  type!: string; // info | success | warning | error | workflow

  @Column({ type: 'varchar', length: 30, default: 'in_app' })
  channel!: string; // in_app | email | sms | push

  @Index()
  @Column({ type: 'varchar', length: 20, default: 'unread' })
  status!: string; // unread | read

  @Column({ type: 'jsonb', nullable: true })
  data!: Record<string, unknown> | null;

  @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
  readAt!: Date | null;

  @Column({ name: 'event_type', type: 'varchar', length: 100, nullable: true })
  eventType!: string | null;
}
