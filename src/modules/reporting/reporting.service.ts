import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { ReportRun } from './entities/report-run.entity';
import { ReportSchedule } from './entities/report-schedule.entity';
import {
  ReportChannel,
  ReportFormat,
  ReportFrequency,
  ReportRunStatus,
  ReportType,
} from './enums/reporting.enum';
import {
  CreateReportScheduleDto,
  ExportReportQueryDto,
  RunHistoryQueryDto,
  RunReportDto,
  UpdateReportScheduleDto,
} from './dto/reporting.dto';
import { ReportDataService } from './report-data.service';
import { ReportDeliveryService } from './report-delivery.service';
import { reportDefinition, REPORT_CATALOG } from './reporting-definitions';
import { TenantContextService } from '../../common/tenant-context/tenant-context.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/enums/audit-action.enum';
import { MetricsService } from '../../common/metrics/metrics.service';
import {
  ExportRow,
  toCsv,
  toExcelXml,
  toPdf,
} from '../../common/reports/tabular-export';

export interface ExportFile {
  buffer: Buffer;
  contentType: string;
  filename: string;
}

const DEFAULT_LOOKBACK_DAYS = 30;

@Injectable()
export class ReportingService {
  private readonly logger = new Logger(ReportingService.name);

  constructor(
    @InjectRepository(ReportRun)
    private readonly runs: Repository<ReportRun>,
    @InjectRepository(ReportSchedule)
    private readonly schedules: Repository<ReportSchedule>,
    private readonly data: ReportDataService,
    private readonly delivery: ReportDeliveryService,
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

  catalog() {
    return REPORT_CATALOG;
  }

  /** Resolve the reporting window (defaults to the last 30 days). */
  private resolvePeriod(from?: string, to?: string): { from: Date; to: Date } {
    const end = to ? new Date(to) : new Date();
    const start = from
      ? new Date(from)
      : new Date(end.getTime() - DEFAULT_LOOKBACK_DAYS * 24 * 60 * 60_000);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('Invalid from/to date');
    }
    if (start > end) {
      throw new BadRequestException('"from" must be before "to"');
    }
    return { from: start, to: end };
  }

  private periodForFrequency(frequency: ReportFrequency, to = new Date()) {
    const days =
      frequency === ReportFrequency.DAILY
        ? 1
        : frequency === ReportFrequency.WEEKLY
          ? 7
          : 30;
    return { from: new Date(to.getTime() - days * 24 * 60 * 60_000), to };
  }

  private nextRunAt(frequency: ReportFrequency, from = new Date()): Date {
    const next = new Date(from);
    if (frequency === ReportFrequency.DAILY) {
      next.setDate(next.getDate() + 1);
    } else if (frequency === ReportFrequency.WEEKLY) {
      next.setDate(next.getDate() + 7);
    } else {
      next.setMonth(next.getMonth() + 1);
    }
    return next;
  }

  async generate(type: ReportType, from?: string, to?: string) {
    const definition = reportDefinition(type);
    const period = this.resolvePeriod(from, to);
    const data = await this.data.build(
      type,
      this.tenantId(),
      period.from,
      period.to,
    );
    return {
      type,
      title: definition.title,
      description: definition.description,
      columns: definition.columns,
      generatedAt: new Date().toISOString(),
      period: {
        from: period.from.toISOString(),
        to: period.to.toISOString(),
      },
      summary: data.summary,
      rows: data.rows,
    };
  }

  async export(
    type: ReportType,
    query: ExportReportQueryDto,
  ): Promise<ExportFile> {
    const report = await this.generate(type, query.from, query.to);
    const format = query.format ?? ReportFormat.CSV;
    const rows = report.rows as ExportRow[];
    const stamp = new Date().toISOString().slice(0, 10);
    const base = `report-${type.toLowerCase().replace(/_/g, '-')}-${stamp}`;
    this.metrics.inc('report_exports_total', {
      type,
      format,
    });

    if (format === ReportFormat.EXCEL) {
      return {
        buffer: Buffer.from(
          toExcelXml(report.columns, rows, report.title.slice(0, 30)),
        ),
        contentType: 'application/vnd.ms-excel; charset=utf-8',
        filename: `${base}.xls`,
      };
    }
    if (format === ReportFormat.PDF) {
      return {
        buffer: toPdf(report.columns, rows, `Business OS - ${report.title}`),
        contentType: 'application/pdf',
        filename: `${base}.pdf`,
      };
    }
    return {
      buffer: Buffer.from(toCsv(report.columns, rows)),
      contentType: 'text/csv; charset=utf-8',
      filename: `${base}.csv`,
    };
  }

  async run(type: ReportType, dto: RunReportDto): Promise<ReportRun> {
    const report = await this.generate(type, dto.from, dto.to);
    return this.persistRun(type, dto.format ?? ReportFormat.JSON, report, {
      channels: dto.channels ?? [],
      recipients: dto.recipients ?? [],
      webhookIds: dto.webhookIds ?? [],
    });
  }

  private async persistRun(
    type: ReportType,
    format: ReportFormat,
    report: Awaited<ReturnType<ReportingService['generate']>>,
    delivery: {
      channels: ReportChannel[];
      recipients: string[];
      webhookIds: string[];
    },
    scheduleId: string | null = null,
  ): Promise<ReportRun> {
    const run = await this.runs.save(
      this.runs.create({
        tenantId: this.tenantId(),
        reportType: type,
        format,
        periodFrom: new Date(report.period.from),
        periodTo: new Date(report.period.to),
        status: ReportRunStatus.COMPLETED,
        rowCount: report.rows.length,
        summary: report.summary,
        scheduleId,
        startedAt: new Date(),
        completedAt: new Date(),
        createdBy: this.userId(),
      }),
    );

    if (delivery.channels.length > 0) {
      await this.delivery.deliver(
        run,
        reportDefinition(type),
        delivery.channels,
        delivery.recipients,
        delivery.webhookIds,
      );
    }

    await this.auditSafe(run.id, AuditAction.CREATE, {
      reportType: type,
      format,
      rowCount: run.rowCount,
      channels: delivery.channels,
      scheduleId,
    });
    this.metrics.inc('report_runs_total', { type, status: run.status });
    return run;
  }


  async listRuns(query: RunHistoryQueryDto): Promise<ReportRun[]> {
    const where: Record<string, unknown> = { tenantId: this.tenantId() };
    if (query.reportType) where.reportType = query.reportType;
    return this.runs.find({
      where,
      order: { createdAt: 'DESC' },
      take: query.limit ?? 50,
    });
  }

  async getRun(id: string) {
    const run = await this.runs.findOne({
      where: { id, tenantId: this.tenantId() },
    });
    if (!run) throw new NotFoundException('Report run not found');
    const deliveries = await this.delivery.listForRun(run.id);
    return { ...run, deliveries };
  }

  async createSchedule(dto: CreateReportScheduleDto): Promise<ReportSchedule> {
    const frequency = dto.frequency ?? ReportFrequency.WEEKLY;
    const saved = await this.schedules.save(
      this.schedules.create({
        tenantId: this.tenantId(),
        name: dto.name,
        reportType: dto.reportType,
        format: dto.format ?? ReportFormat.PDF,
        frequency,
        deliveryChannels: dto.deliveryChannels ?? [],
        recipients: dto.recipients ?? [],
        webhookIds: dto.webhookIds ?? [],
        params: dto.params ?? {},
        enabled: dto.enabled ?? true,
        nextRunAt: this.nextRunAt(frequency),
        createdBy: this.userId(),
      }),
    );
    await this.auditSafe(saved.id, AuditAction.CREATE, {
      kind: 'report_schedule',
      name: saved.name,
      reportType: saved.reportType,
      frequency: saved.frequency,
      nextRunAt: saved.nextRunAt,
    });
    this.metrics.inc('report_schedules_created_total', {
      frequency: saved.frequency,
    });
    return saved;
  }

  async listSchedules(): Promise<ReportSchedule[]> {
    return this.schedules.find({
      where: { tenantId: this.tenantId() },
      order: { createdAt: 'DESC' },
    });
  }

  async getSchedule(id: string): Promise<ReportSchedule> {
    const schedule = await this.schedules.findOne({
      where: { id, tenantId: this.tenantId() },
    });
    if (!schedule) throw new NotFoundException('Report schedule not found');
    return schedule;
  }

  async updateSchedule(
    id: string,
    dto: UpdateReportScheduleDto,
  ): Promise<ReportSchedule> {
    const schedule = await this.getSchedule(id);
    if (dto.format !== undefined) schedule.format = dto.format;
    if (dto.deliveryChannels !== undefined) {
      schedule.deliveryChannels = dto.deliveryChannels;
    }
    if (dto.recipients !== undefined) schedule.recipients = dto.recipients;
    if (dto.webhookIds !== undefined) schedule.webhookIds = dto.webhookIds;
    if (dto.params !== undefined) schedule.params = dto.params;
    if (dto.enabled !== undefined) {
      schedule.enabled = dto.enabled;
      if (dto.enabled && !schedule.nextRunAt) {
        schedule.nextRunAt = this.nextRunAt(schedule.frequency);
      }
    }
    if (dto.frequency !== undefined) {
      schedule.frequency = dto.frequency;
      schedule.nextRunAt = this.nextRunAt(dto.frequency);
    }
    schedule.updatedBy = this.userId();

    const saved = await this.schedules.save(schedule);
    await this.auditSafe(saved.id, AuditAction.UPDATE, {
      kind: 'report_schedule',
      name: saved.name,
      frequency: saved.frequency,
      enabled: saved.enabled,
      nextRunAt: saved.nextRunAt,
    });
    return saved;
  }

  /** Execute one schedule immediately (manual trigger / scheduler worker). */
  async runSchedule(id: string): Promise<ReportRun> {
    const schedule = await this.getSchedule(id);
    const period = this.periodForFrequency(schedule.frequency);

    const report = await this.generate(
      schedule.reportType,
      period.from.toISOString(),
      period.to.toISOString(),
    );
    const run = await this.persistRun(
      schedule.reportType,
      schedule.format,
      report,
      {
        channels: schedule.deliveryChannels as ReportChannel[],
        recipients: schedule.recipients,
        webhookIds: schedule.webhookIds,
      },
      schedule.id,
    );

    schedule.lastRunAt = new Date();
    schedule.lastRunId = run.id;
    schedule.nextRunAt = this.nextRunAt(schedule.frequency);
    await this.schedules.save(schedule);

    this.metrics.inc('report_schedule_runs_total', {
      frequency: schedule.frequency,
    });
    return run;
  }

  /** Called by the scheduler job; returns how many schedules were executed. */
  async runDueSchedules(): Promise<number> {
    const due = await this.schedules.find({
      where: {
        enabled: true,
        nextRunAt: LessThanOrEqual(new Date()),
      },
      take: 20,
    });

    let executed = 0;
    for (const schedule of due) {
      try {
        await this.runSchedule(schedule.id);
        executed += 1;
      } catch (error) {
        this.logger.error(
          `Scheduled report ${schedule.id} failed: ${
            error instanceof Error ? error.message : error
          }`,
        );
      }
    }
    return executed;
  }

  async metricsText(): Promise<string> {
    return this.metrics.text();
  }

  private async auditSafe(
    id: string,
    action: AuditAction,
    data: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.audit.logAction('report', id, action, { newData: data });
    } catch (error) {
      this.logger.warn(
        `Report audit skipped: ${error instanceof Error ? error.message : error}`,
      );
    }
  }
}

