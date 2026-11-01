import { MetricsService } from '../../common/metrics/metrics.service';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditEvent } from './entities/audit-event.entity';
import { AuditExport } from './entities/audit-export.entity';
import { AuditRetentionPolicy } from './entities/audit-retention-policy.entity';
import { ComplianceReport } from './entities/compliance-report.entity';
import { AuditLog } from './entities/audit-log.entity';
import { User } from '../users/entities/user.entity';
import { TenantContextService } from '../../common/tenant-context/tenant-context.service';
import {
  AuditCategory,
  AuditExportFormat,
  ComplianceReportType,
  RetentionPolicyCode,
  categoryFor,
} from './enums/audit-category.enum';
import {
  ComplianceReportQueryDto,
  ExportAuditEventDto,
  RetentionQueryDto,
  SearchAuditEventDto,
} from './dto/compliance.dto';
import { toCsv, toExcelXml, toPdf } from './audit-export.format';

const PRESETS: Array<{ code: RetentionPolicyCode; label: string; days: number | null; isCustom: boolean; isActive: boolean }> = [
  { code: RetentionPolicyCode.DAYS_90, label: '90 Days', days: 90, isCustom: false, isActive: false },
  { code: RetentionPolicyCode.DAYS_180, label: '180 Days', days: 180, isCustom: false, isActive: false },
  { code: RetentionPolicyCode.DAYS_365, label: '365 Days', days: 365, isCustom: false, isActive: true },
  { code: RetentionPolicyCode.CUSTOM, label: 'Custom', days: null, isCustom: true, isActive: false },
];

@Injectable()
export class CompliancePlatformService {
  private readonly logger = new Logger(CompliancePlatformService.name);

  constructor(
    @InjectRepository(AuditEvent)
    private readonly events: Repository<AuditEvent>,
    @InjectRepository(AuditExport)
    private readonly exportsRepo: Repository<AuditExport>,
    @InjectRepository(AuditRetentionPolicy)
    private readonly policies: Repository<AuditRetentionPolicy>,
    @InjectRepository(ComplianceReport)
    private readonly reports: Repository<ComplianceReport>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly tenantContext: TenantContextService,
    private readonly metricsService: MetricsService,
  ) {}

  async mirror(log: AuditLog, traceId?: string | null): Promise<void> {
    const actorEmail = log.performedBy
      ? (await this.users.findOne({ where: { id: log.performedBy } }))?.email ?? null
      : null;
    const event = this.events.create({
      tenantId: log.tenantId,
      actorId: log.performedBy,
      actorEmail,
      category: categoryFor(log.entityType, log.action),
      resourceType: log.entityType,
      resourceId: log.entityId,
      action: log.action,
      beforeData: log.oldData,
      afterData: log.newData,
      ipAddress: log.ipAddress,
      userAgent: log.userAgent,
      traceId: traceId ?? null,
    });
    const saved = await this.events.save(event);
    this.metricsService.inc('audit_events_recorded_total');
    this.tagSpan(saved.eventId, saved.category);
  }

  async list(query: SearchAuditEventDto): Promise<{ events: AuditEvent[] }> {
    return { events: await this.searchRows(query) };
  }

  async search(query: SearchAuditEventDto): Promise<{ events: AuditEvent[] }> {
    return { events: await this.searchRows(query) };
  }

  async export(query: ExportAuditEventDto): Promise<{ body: Buffer | string; contentType: string; filename: string }> {
    const rows = await this.searchRows(query);
    const tenantId = this.tenantContext.getCurrentTenantId();
    await this.exportsRepo.save(
      this.exportsRepo.create({
        tenantId,
        format: query.format,
        rowCount: rows.length,
        requestedBy: this.safeUserId(),
      }),
    );
    this.metricsService.inc('audit_exports_total');

    if (query.format === AuditExportFormat.CSV) {
      return { body: toCsv(rows), contentType: 'text/csv; charset=utf-8', filename: 'audit-events.csv' };
    }
    if (query.format === AuditExportFormat.EXCEL) {
      return {
        body: toExcelXml(rows),
        contentType: 'application/vnd.ms-excel',
        filename: 'audit-events.xls',
      };
    }
    if (query.format === AuditExportFormat.PDF) {
      return { body: toPdf(rows), contentType: 'application/pdf', filename: 'audit-events.pdf' };
    }
    throw new BadRequestException('Unsupported export format');
  }

  async report(query: ComplianceReportQueryDto) {
    const rows = await this.searchRows({ limit: 500 });
    const events = this.filterReport(rows, query.type);
    const summary = {
      total: events.length,
      categories: this.countBy(events, (event) => event.category),
      actions: this.countBy(events, (event) => event.action),
    };
    const saved = await this.reports.save(
      this.reports.create({
        tenantId: this.tenantContext.getCurrentTenantId(),
        reportType: query.type,
        summary,
        generatedBy: this.safeUserId(),
      }),
    );
    this.metricsService.inc('audit_reports_total');
    return {
      id: saved.id,
      reportType: query.type,
      generatedAt: saved.createdAt,
      summary,
      events,
    };
  }

  async retention(query: RetentionQueryDto) {
    const tenantId = this.tenantContext.getCurrentTenantId();
    await this.ensurePolicies(tenantId);
    if (query.customDays != null) {
      await this.policies.update(
        { tenantId, code: RetentionPolicyCode.CUSTOM },
        { days: query.customDays },
      );
    }
    if (query.activate) {
      await this.policies.update({ tenantId }, { isActive: false });
      await this.policies.update({ tenantId, code: query.activate }, { isActive: true });
    }
    const policies = await this.policies.find({ where: { tenantId }, order: { code: 'ASC' } });
    return { policies };
  }

  async metrics(): Promise<string> {
    return this.metricsService.text();
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async applyRetention(): Promise<number> {
    const active = await this.policies.find({ where: { isActive: true } });
    let removed = 0;
    for (const policy of active) {
      if (!policy.days || policy.days < 1) continue;
      const cutoff = new Date(Date.now() - policy.days * 24 * 60 * 60 * 1000);
      const result = await this.events
        .createQueryBuilder()
        .delete()
        .from(AuditEvent)
        .where('tenant_id = :tenantId', { tenantId: policy.tenantId })
        .andWhere('created_at < :cutoff', { cutoff })
        .execute();
      removed += result.affected ?? 0;
    }
    if (removed) this.logger.log(`Retention removed ${removed} audit events`);
    return removed;
  }

  private async searchRows(query: SearchAuditEventDto): Promise<AuditEvent[]> {
    const tenantId = this.tenantContext.getCurrentTenantId();
    const qb = this.events.createQueryBuilder('event').where('event.tenant_id = :tenantId', { tenantId });
    if (query.category) qb.andWhere('event.category = :category', { category: query.category });
    if (query.actorId) qb.andWhere('event.actor_id = :actorId', { actorId: query.actorId });
    if (query.actorEmail) qb.andWhere('event.actor_email = :actorEmail', { actorEmail: query.actorEmail });
    if (query.resourceType) qb.andWhere('event.resource_type = :resourceType', { resourceType: query.resourceType });
    if (query.resourceId) qb.andWhere('event.resource_id = :resourceId', { resourceId: query.resourceId });
    if (query.action) qb.andWhere('event.action = :action', { action: query.action });
    if (query.from) qb.andWhere('event.created_at >= :from', { from: new Date(query.from) });
    if (query.to) qb.andWhere('event.created_at <= :to', { to: new Date(query.to) });
    if (query.q) {
      qb.andWhere(
        '(event.action ILIKE :q OR event.resource_type ILIKE :q OR event.actor_email ILIKE :q)',
        { q: `%${query.q}%` },
      );
    }
    qb.orderBy('event.created_at', 'DESC').take(query.limit ?? 200);
    return qb.getMany();
  }

  private filterReport(events: AuditEvent[], type: ComplianceReportType): AuditEvent[] {
    if (type === ComplianceReportType.USER_ACTIVITY) return events;
    if (type === ComplianceReportType.BILLING_ACTIVITY) {
      return events.filter((event) =>
        [AuditCategory.BILLING, AuditCategory.SUBSCRIPTION, AuditCategory.PAYMENT].includes(event.category),
      );
    }
    if (type === ComplianceReportType.SECURITY_EVENTS) {
      return events.filter((event) =>
        [AuditCategory.AUTHENTICATION, AuditCategory.AUTHORIZATION, AuditCategory.SECURITY].includes(event.category),
      );
    }
    return events.filter((event) => this.isSuspicious(event));
  }

  private isSuspicious(event: AuditEvent): boolean {
    if (event.action === 'DELETE') return true;
    const after = JSON.stringify(event.afterData ?? {}).toLowerCase();
    return after.includes('fail') || after.includes('denied') || after.includes('suspicious');
  }

  private countBy(events: AuditEvent[], pick: (event: AuditEvent) => string): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const event of events) {
      const key = pick(event);
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }

  private async ensurePolicies(tenantId: string): Promise<void> {
    for (const preset of PRESETS) {
      const exists = await this.policies.findOne({ where: { tenantId, code: preset.code } });
      if (exists) continue;
      await this.policies.save(this.policies.create({ tenantId, ...preset }));
    }
  }

  private safeUserId(): string | null {
    try {
      return this.tenantContext.getCurrentUserId() || null;
    } catch {
      return null;
    }
  }


  private tagSpan(eventId: string, category: string) {
    try {
      const { trace } = require('@opentelemetry/api') as typeof import('@opentelemetry/api');
      trace.getActiveSpan()?.setAttribute('audit.event_id', eventId);
      trace.getActiveSpan()?.setAttribute('audit.category', category);
    } catch {
      this.logger.debug('OpenTelemetry API is not active for this event');
    }
  }
}
