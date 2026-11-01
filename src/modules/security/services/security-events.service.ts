import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, MoreThanOrEqual, Not, Repository } from 'typeorm';
import { SecurityEvent } from '../entities/security-event.entity';
import {
  SecurityEventSource,
  SecurityEventStatus,
  SecurityEventType,
  SecuritySeverity,
} from '../enums/security.enum';
import { SecurityEventQueryDto } from '../dto/security.dto';
import { AlertRulesService } from './alert-rules.service';
import { TenantContextService } from '../../../common/tenant-context/tenant-context.service';
import { AuditService } from '../../audit/audit.service';
import { AuditAction } from '../../audit/enums/audit-action.enum';
import { MetricsService } from '../../../common/metrics/metrics.service';

export interface SecurityEventInput {
  tenantId: string;
  eventType: SecurityEventType;
  severity: SecuritySeverity;
  source?: SecurityEventSource;
  userId?: string | null;
  actorEmail?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  country?: string | null;
  city?: string | null;
  riskScore?: number;
  dedupeKey?: string | null;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class SecurityEventsService {
  private readonly logger = new Logger(SecurityEventsService.name);

  constructor(
    @InjectRepository(SecurityEvent)
    private readonly events: Repository<SecurityEvent>,
    private readonly dataSource: DataSource,
    private readonly alertRules: AlertRulesService,
    private readonly tenantContext: TenantContextService,
    private readonly audit: AuditService,
    private readonly metrics: MetricsService,
  ) {}

  private tenantId(): string {
    return this.tenantContext.getCurrentTenantId();
  }

  private userId(): string | null {
    try {
      return this.tenantContext.getCurrentUserId();
    } catch {
      return null;
    }
  }

  /**
   * Persist a detection. `dedupeKey` keeps repeated detections of the same
   * condition from flooding the incident list (24h window, resolved excluded).
   */
  async create(input: SecurityEventInput): Promise<SecurityEvent> {
    if (input.dedupeKey) {
      const existing = await this.events.findOne({
        where: {
          tenantId: input.tenantId,
          dedupeKey: input.dedupeKey,
          status: Not(SecurityEventStatus.RESOLVED),
          detectedAt: MoreThanOrEqual(new Date(Date.now() - 24 * 60 * 60_000)),
        },
      });
      if (existing) return existing;
    }

    const saved = await this.events.save(
      this.events.create({
        tenantId: input.tenantId,
        eventType: input.eventType,
        severity: input.severity,
        status: SecurityEventStatus.OPEN,
        source: input.source ?? SecurityEventSource.SYSTEM,
        userId: input.userId ?? null,
        actorEmail: input.actorEmail ?? null,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        country: input.country ?? null,
        city: input.city ?? null,
        riskScore: input.riskScore ?? 0,
        dedupeKey: input.dedupeKey ?? null,
        metadata: input.metadata ?? {},
        detectedAt: new Date(),
        createdBy: this.userId(),
      }),
    );

    this.metrics.inc('security_events_total', {
      event_type: saved.eventType,
      severity: saved.severity,
    });
    try {
      await this.audit.logAction('security_event', saved.id, AuditAction.CREATE, {
        newData: {
          eventType: saved.eventType,
          severity: saved.severity,
          riskScore: saved.riskScore,
          actorEmail: saved.actorEmail,
          ipAddress: saved.ipAddress,
          country: saved.country,
          metadata: saved.metadata,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Security event audit skipped: ${error instanceof Error ? error.message : error}`,
      );
    }
    await this.alertRules.evaluate(saved);
    return saved;
  }

  async list(query: SecurityEventQueryDto): Promise<SecurityEvent[]> {
    const where: Record<string, unknown> = { tenantId: this.tenantId() };
    if (query.status) where.status = query.status;
    if (query.eventType) where.eventType = query.eventType;
    if (query.severity) where.severity = query.severity;
    return this.events.find({
      where,
      order: { detectedAt: 'DESC' },
      take: query.limit ?? 100,
    });
  }

  async get(id: string): Promise<SecurityEvent> {
    const row = await this.events.findOne({
      where: { id, tenantId: this.tenantId() },
    });
    if (!row) throw new NotFoundException('Security event not found');
    return row;
  }

  async acknowledge(id: string, notes?: string): Promise<SecurityEvent> {
    const row = await this.get(id);
    if (row.status === SecurityEventStatus.RESOLVED) return row;
    row.status = SecurityEventStatus.ACKNOWLEDGED;
    row.acknowledgedAt = row.acknowledgedAt ?? new Date();
    row.acknowledgedBy = this.userId();
    if (notes) row.metadata = { ...row.metadata, acknowledgedNotes: notes };
    row.updatedBy = this.userId();
    return this.saveWithAudit(row, AuditAction.UPDATE, {
      status: row.status,
      notes: notes ?? null,
    });
  }

  async resolve(id: string, notes?: string): Promise<SecurityEvent> {
    const row = await this.get(id);
    row.status = SecurityEventStatus.RESOLVED;
    row.acknowledgedAt = row.acknowledgedAt ?? new Date();
    row.acknowledgedBy = row.acknowledgedBy ?? this.userId();
    row.resolvedAt = new Date();
    row.resolvedBy = this.userId();
    row.resolutionNotes = notes ?? null;
    row.updatedBy = this.userId();
    return this.saveWithAudit(row, AuditAction.APPROVE, {
      status: row.status,
      notes: notes ?? null,
    });
  }

  async stats() {
    const tenantId = this.tenantId();
    const [counts] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status = 'OPEN')::int AS open,
              COUNT(*) FILTER (WHERE status = 'ACKNOWLEDGED')::int AS acknowledged,
              COUNT(*) FILTER (WHERE status = 'RESOLVED')::int AS resolved,
              COUNT(*) FILTER (WHERE severity = 'CRITICAL' AND status <> 'RESOLVED')::int AS critical_open,
              COUNT(*) FILTER (WHERE severity = 'HIGH' AND status <> 'RESOLVED')::int AS high_open,
              COUNT(*) FILTER (WHERE detected_at > now() - interval '24 hours')::int AS last_24h
         FROM security_events WHERE tenant_id = $1`,
      [tenantId],
    );
    const byType: Array<{ eventType: string; total: number }> =
      await this.dataSource.query(
        `SELECT event_type AS "eventType", COUNT(*)::int AS total
           FROM security_events WHERE tenant_id = $1
          GROUP BY event_type ORDER BY total DESC`,
        [tenantId],
      );
    return { ...counts, byType };
  }

  /** Security audit trail = audit_logs written by the security module. */
  async auditTrail(limit = 100) {
    const rows: Array<Record<string, unknown>> = await this.dataSource.query(
      `SELECT id, entity_type AS "entityType", entity_id AS "entityId",
              action, performed_by AS "performedBy", new_data AS "newData",
              ip_address AS "ipAddress", created_at AS "createdAt"
         FROM audit_logs
        WHERE tenant_id = $1 AND entity_type LIKE 'security%'
        ORDER BY created_at DESC
        LIMIT $2`,
      [this.tenantId(), Math.min(limit, 500)],
    );
    return rows;
  }

  private async saveWithAudit(
    row: SecurityEvent,
    action: AuditAction,
    data: Record<string, unknown>,
  ): Promise<SecurityEvent> {
    const saved = await this.events.save(row);
    try {
      await this.audit.logAction('security_event', saved.id, action, {
        newData: data,
      });
    } catch (error) {
      this.logger.warn(
        `Security event audit skipped: ${error instanceof Error ? error.message : error}`,
      );
    }
    return saved;
  }
}

