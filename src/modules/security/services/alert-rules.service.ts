import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { AlertRule } from '../entities/alert-rule.entity';
import { SecurityEvent } from '../entities/security-event.entity';
import { CreateAlertRuleDto, UpdateAlertRuleDto } from '../dto/security.dto';
import { SecuritySeverity } from '../enums/security.enum';
import { TenantContextService } from '../../../common/tenant-context/tenant-context.service';
import { AuditService } from '../../audit/audit.service';
import { AuditAction } from '../../audit/enums/audit-action.enum';
import { MetricsService } from '../../../common/metrics/metrics.service';

@Injectable()
export class AlertRulesService {
  private readonly logger = new Logger(AlertRulesService.name);

  constructor(
    @InjectRepository(AlertRule)
    private readonly rules: Repository<AlertRule>,
    @InjectRepository(SecurityEvent)
    private readonly events: Repository<SecurityEvent>,
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

  async list(): Promise<AlertRule[]> {
    return this.rules.find({
      where: { tenantId: this.tenantId() },
      order: { createdAt: 'ASC' },
    });
  }

  async create(dto: CreateAlertRuleDto): Promise<AlertRule> {
    const saved = await this.rules.save(
      this.rules.create({
        tenantId: this.tenantId(),
        name: dto.name,
        eventType: dto.eventType,
        threshold: dto.threshold ?? 5,
        windowMinutes: dto.windowMinutes ?? 15,
        severity: dto.severity ?? SecuritySeverity.HIGH,
        channels: dto.channels ?? [],
        enabled: dto.enabled ?? true,
        createdBy: this.userId(),
      }),
    );
    await this.auditSafe(saved, AuditAction.CREATE, {
      name: saved.name,
      eventType: saved.eventType,
      threshold: saved.threshold,
    });
    return saved;
  }

  async update(id: string, dto: UpdateAlertRuleDto): Promise<AlertRule> {
    const rule = await this.rules.findOne({
      where: { id, tenantId: this.tenantId() },
    });
    if (!rule) throw new NotFoundException('Alert rule not found');

    if (dto.threshold !== undefined) rule.threshold = dto.threshold;
    if (dto.windowMinutes !== undefined) rule.windowMinutes = dto.windowMinutes;
    if (dto.severity !== undefined) rule.severity = dto.severity;
    if (dto.channels !== undefined) rule.channels = dto.channels;
    if (dto.enabled !== undefined) rule.enabled = dto.enabled;
    rule.updatedBy = this.userId();

    const saved = await this.rules.save(rule);
    await this.auditSafe(saved, AuditAction.UPDATE, {
      name: saved.name,
      threshold: saved.threshold,
      windowMinutes: saved.windowMinutes,
      enabled: saved.enabled,
    });
    return saved;
  }

  /**
   * Evaluate tenant rules for the event's type. A rule fires whenever the
   * number of events inside its window reaches the threshold.
   */
  async evaluate(event: SecurityEvent): Promise<void> {
    const rules = await this.rules.find({
      where: {
        tenantId: event.tenantId,
        eventType: event.eventType,
        enabled: true,
      },
    });
    for (const rule of rules) {
      const since = new Date(Date.now() - rule.windowMinutes * 60_000);
      const count = await this.events.count({
        where: {
          tenantId: event.tenantId,
          eventType: event.eventType,
          detectedAt: MoreThanOrEqual(since),
        },
      });
      if (count < rule.threshold) continue;

      rule.triggerCount += 1;
      rule.lastTriggeredAt = new Date();
      await this.rules.save(rule);
      this.metrics.inc('security_alerts_triggered_total', {
        event_type: rule.eventType,
        severity: rule.severity,
      });
      this.logger.warn(
        `SECURITY ALERT "${rule.name}" event=${rule.eventType} count=${count} threshold=${rule.threshold} window=${rule.windowMinutes}m tenant=${event.tenantId}`,
      );
    }
  }

  private async auditSafe(
    rule: AlertRule,
    action: AuditAction,
    data: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.audit.logAction('security_alert_rule', rule.id, action, {
        newData: data,
      });
    } catch (error) {
      this.logger.warn(
        `Alert rule audit skipped: ${error instanceof Error ? error.message : error}`,
      );
    }
  }
}
