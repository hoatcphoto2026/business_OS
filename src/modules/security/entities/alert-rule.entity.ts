import { Column, Entity, Unique } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base.entity';
import { SecurityEventType, SecuritySeverity } from '../enums/security.enum';

/** Tenant-configurable alert rule evaluated on every new security event. */
@Entity('security_alert_rules')
@Unique(['tenantId', 'name'])
export class AlertRule extends BaseTenantEntity {
  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ name: 'event_type', type: 'varchar', length: 60 })
  eventType!: SecurityEventType;

  @Column({ type: 'int', default: 5 })
  threshold!: number;

  @Column({ name: 'window_minutes', type: 'int', default: 15 })
  windowMinutes!: number;

  @Column({ type: 'varchar', length: 20, default: SecuritySeverity.HIGH })
  severity!: SecuritySeverity;

  @Column({ type: 'jsonb', default: [] })
  channels!: string[];

  @Column({ type: 'boolean', default: true })
  enabled!: boolean;

  @Column({ name: 'trigger_count', type: 'int', default: 0 })
  triggerCount!: number;

  @Column({ name: 'last_triggered_at', type: 'timestamptz', nullable: true })
  lastTriggeredAt!: Date | null;
}
