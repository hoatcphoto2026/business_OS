import { Column, Entity, Index } from 'typeorm';
import { BaseTenantEntity } from '../../../common/entities/base.entity';
import {
  SecurityEventSource,
  SecurityEventStatus,
  SecurityEventType,
  SecuritySeverity,
} from '../enums/security.enum';

/** Detection output / security incident. One row per finding (deduped). */
@Entity('security_events')
@Index(['tenantId', 'eventType'])
@Index(['tenantId', 'status'])
@Index(['tenantId', 'detectedAt'])
export class SecurityEvent extends BaseTenantEntity {
  @Column({ name: 'event_type', type: 'varchar', length: 60 })
  eventType!: SecurityEventType;

  @Column({ type: 'varchar', length: 20 })
  severity!: SecuritySeverity;

  @Column({ type: 'varchar', length: 20, default: SecurityEventStatus.OPEN })
  status!: SecurityEventStatus;

  @Column({ type: 'varchar', length: 20, default: SecurityEventSource.SYSTEM })
  source!: SecurityEventSource;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId!: string | null;

  @Column({ name: 'actor_email', type: 'varchar', length: 255, nullable: true })
  actorEmail!: string | null;

  @Column({ name: 'ip_address', type: 'varchar', length: 64, nullable: true })
  ipAddress!: string | null;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent!: string | null;

  @Column({ type: 'varchar', length: 2, nullable: true })
  country!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  city!: string | null;

  @Column({ name: 'risk_score', type: 'int', default: 0 })
  riskScore!: number;

  @Column({ name: 'dedupe_key', type: 'varchar', length: 160, nullable: true })
  dedupeKey!: string | null;

  @Column({ type: 'jsonb', default: {} })
  metadata!: Record<string, unknown>;

  @Column({ name: 'detected_at', type: 'timestamptz', default: () => 'now()' })
  detectedAt!: Date;

  @Column({ name: 'acknowledged_at', type: 'timestamptz', nullable: true })
  acknowledgedAt!: Date | null;

  @Column({ name: 'acknowledged_by', type: 'uuid', nullable: true })
  acknowledgedBy!: string | null;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt!: Date | null;

  @Column({ name: 'resolved_by', type: 'uuid', nullable: true })
  resolvedBy!: string | null;

  @Column({ name: 'resolution_notes', type: 'text', nullable: true })
  resolutionNotes!: string | null;
}
