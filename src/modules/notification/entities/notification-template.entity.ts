import { Entity, Column, Index } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base.entity';

@Entity('notification_templates')
export class NotificationTemplate extends BaseTenantEntity {
  @Index()
  @Column({ type: 'varchar', length: 100 })
  code!: string;

  @Column({ type: 'varchar', length: 30, default: 'in_app' })
  channel!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  subject!: string | null;

  @Column({ type: 'text' })
  body!: string;

  @Column({ type: 'jsonb', nullable: true })
  variables!: string[] | null;

  @Column({ type: 'boolean', default: true })
  active!: boolean;
}
